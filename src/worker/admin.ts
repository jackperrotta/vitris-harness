import type { Env } from './env.ts';
import { digest } from './forms.ts';
import { isThemeColor, websiteColorKeys } from '@tryvitris/website-admin-contracts';
import { LeadError, followUpsAvailable, listLeads, saveFollowUp } from './lead-management.ts';

type Grant = { tenantId: string; siteOrigin: string; tokenHash: string; scopes: string[] };
const scopes = ['leads:read', 'analytics:read', 'leads:write'];
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

/** Server-to-server only. Never shares cookie, forms-setup, or deployment authority. */
export async function handleAdmin(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/admin\/v1\/([a-zA-Z0-9_-]{1,100})\/(status|leads|analytics|leads\/status|leads\/follow-up)$/);
  if (!match) return json({ error: 'Not found' }, 404);
  const [, tenant, resource] = match;
  // Browser origins are never allowed; the published Worker adapter sends only
  // x-vitris-site-origin. Do not add permissive public API CORS here.
  if (request.headers.has('origin')) return json({ error: 'Server credential required' }, 403);
  const installationId = request.headers.get('x-vitris-installation') || '';
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-zA-Z0-9_-]{32,200})$/)?.[1];
  let grant: Grant | undefined;
  try {
    const map = JSON.parse(env.ADMIN_CONNECTIONS || '{}');
    if (map && typeof map === 'object' && !Array.isArray(map) && Object.hasOwn(map, installationId)) grant = map[installationId];
  } catch { /* Invalid configuration denies all access. */ }
  if (!grant || !token || !/^[a-f0-9]{64}$/.test(grant.tokenHash) || await digest(token) !== grant.tokenHash) return json({ error: 'Unauthorized' }, 401);
  if (grant.tenantId !== tenant || grant.siteOrigin !== request.headers.get('x-vitris-site-origin') || !Array.isArray(grant.scopes) || grant.scopes.some(s => !scopes.includes(s))) return json({ error: 'Forbidden' }, 403);
  // A grant cannot create a tenant or reassign an existing site's ownership.
  if (!await env.DB.prepare('SELECT id FROM tenants WHERE id=?').bind(tenant).first()) return json({ error: 'Forbidden' }, 403);
  const identity = { schemaVersion: 1, installationId, tenantId: tenant, siteOrigin: grant.siteOrigin };
  const mutation = resource === 'leads/status' || resource === 'leads/follow-up';
  const required = resource === 'analytics' ? 'analytics:read' : mutation ? 'leads:write' : resource === 'leads' ? 'leads:read' : undefined;
  if (required && !grant.scopes.includes(required)) return json({ error: 'Forbidden' }, 403);
  if (request.method !== (mutation ? 'POST' : 'GET')) return json({ error: 'Method not allowed' }, 405);
  if (resource === 'status') {
    const stored = await env.DB.prepare('SELECT json FROM theme WHERE tenant_id=?').bind(tenant).first<{json:string}>();
    let theme:Record<string,string>|null=null;
    try { const raw=JSON.parse(stored?.json||'null'); if(raw&&typeof raw==='object'&&!Array.isArray(raw)){const safe=Object.fromEntries(websiteColorKeys.filter(key=>isThemeColor(raw[key])).map(key=>[key,raw[key]]));if(Object.keys(safe).length)theme=safe;} } catch { /* An invalid theme never exposes arbitrary stored fields. */ }
    return json({ ...identity, scopes: grant.scopes, theme, capabilities: { leads: grant.scopes.includes('leads:read'), testSubmissions: grant.scopes.includes('leads:read'), analytics: grant.scopes.includes('analytics:read'), leadStatus: grant.scopes.includes('leads:write'), leadPagination: true, leadFollowUps: await followUpsAvailable(env.DB) } });
  }
  if (mutation) {
    if (url.searchParams.has('mode')) return json({ error: 'Test submissions are read-only' }, 400);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 400);
    // Bound streaming bodies too; content-length is not trusted.
    const reader = request.body?.getReader(); let body = ''; let size = 0;
    const decoder = new TextDecoder();
    if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > (resource==='leads/follow-up'?16384:2048)) { await reader.cancel(); return json({ error: 'Body too large' }, 413); } body += decoder.decode(value,{stream:true}); }
    body += decoder.decode();
    let data;
    try { data = JSON.parse(body); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if(resource==='leads/follow-up') {
      try { return json(await saveFollowUp(env.DB,tenant,installationId,data,'tenant_id')); }
      catch(error){if(error instanceof LeadError)return json({error:error.message},error.status);throw error;}
    }
    if (!data || typeof data.id !== 'string' || data.id.length > 200 || !['new', 'contacted', 'closed'].includes(data.status)) return json({ error: 'Invalid lead status' }, 400);
    const result = await env.DB.prepare('UPDATE leads SET status=? WHERE id=? AND tenant_id=? RETURNING id').bind(data.status, data.id, tenant).first();
    return result ? json({ ok: true }) : json({ error: 'Lead not found' }, 404);
  }
  if (resource === 'leads') {
    const mode = url.searchParams.get('mode') || 'live';
    if (!['live', 'test'].includes(mode)) return json({ error: 'Invalid mode' }, 400);
    if(mode==='live'){
      try{return json({...identity,source:'connected',mode:'production',writable:grant.scopes.includes('leads:write'),...await listLeads(env.DB,tenant,installationId,url.searchParams,'tenant_id')});}
      catch(error){if(error instanceof LeadError)return json({error:error.message},error.status);throw error;}
    }
    const sql = mode === 'test'
      ? `SELECT s.id,s.name,s.email,s.phone,s.message,s.page_path,s.created_at,s.fields_json,'test' AS status,s.form_id,'test' AS mode,o.status AS notification_status,o.last_error AS notification_error,o.test_output
         FROM form_submissions s LEFT JOIN form_outbox o ON o.id=s.id AND o.tenant_id=s.tenant_id WHERE s.tenant_id=? AND s.mode='test' ORDER BY s.created_at DESC,s.id DESC LIMIT 200`
      : `SELECT l.id,l.name,l.email,l.phone,l.message,l.page_path,l.status,l.created_at,s.fields_json,o.status AS notification_status,o.last_error AS notification_error
         FROM leads l LEFT JOIN form_submissions s ON s.id=l.id AND s.tenant_id=l.tenant_id AND s.mode='live'
         LEFT JOIN form_outbox o ON o.id=s.id AND o.tenant_id=l.tenant_id WHERE l.tenant_id=? ORDER BY l.created_at DESC,l.id DESC LIMIT 200`;
    const stored = (await env.DB.prepare(sql).bind(tenant).all()).results;
    const rows = []; let size = 0;
    for (const row of stored) { size += new TextEncoder().encode(JSON.stringify(row)).length; if (size > 3500000) break; rows.push(row); }
    return json({ ...identity, source: 'connected', mode: mode === 'live' ? 'production' : 'test', writable: mode !== 'test' && grant.scopes.includes('leads:write'), truncated: rows.length < stored.length || stored.length === 200, rows });
  }
  const days = Number(url.searchParams.get('days') || '30');
  if (!Number.isInteger(days) || days < 1 || days > 90) return json({ error: 'days must be 1–90' }, 400);
  // Read authoritative events, including today. Never count preview events or
  // test form submissions. Enquiries are stored production leads, not clicks.
  const rows = (await env.DB.prepare(`WITH days AS (
    SELECT day FROM analytics_events WHERE tenant_id=? AND (src IS NULL OR src='' OR src='live')
    UNION SELECT substr(created_at,1,10) FROM leads WHERE tenant_id=?
  ) SELECT day,
    (SELECT COUNT(*) FROM analytics_events e WHERE e.tenant_id=? AND e.day=days.day AND e.kind='pageview' AND (e.src IS NULL OR e.src='' OR e.src='live')) AS views,
    (SELECT COUNT(DISTINCT vid) FROM analytics_events e WHERE e.tenant_id=? AND e.day=days.day AND e.kind='pageview' AND (e.src IS NULL OR e.src='' OR e.src='live')) AS visitors,
    (SELECT COUNT(*) FROM leads l WHERE l.tenant_id=? AND substr(l.created_at,1,10)=days.day) AS enquiries
    FROM days WHERE day>=date('now',?) AND day<=date('now') ORDER BY day`)
    .bind(tenant, tenant, tenant, tenant, tenant, `-${days - 1} days`).all()).results;
  return json({ ...identity, source: 'connected', rows });
}
