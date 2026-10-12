import { approvedOrigin, safeEmail, safeId, validateFormConfig, type FormConfig } from '../forms/config.ts';
import { hmacHex, readSession } from './auth.ts';
import { isLocalRequest, type Env } from './env.ts';
import { escapeHtml } from '../html.ts';
import { isUuid } from '../analytics.ts';

type StoredForm = { id: string; tenant_id: string; config_json: string };
type Receipt = { id: string; fingerprint: string; mode: string; notification: string | null };
const MAX_BODY = 32768;
export function sandboxMailReadiness(env:Env):string[] {
  if(!env.FORMS_TEST_RECIPIENT)return [];
  return [
    ...(env.FORMS_SANDBOX!=='1'?['Operator test mail requires sandbox backend']:[]),
    ...(!safeEmail(env.FORMS_TEST_RECIPIENT)?['Valid operator test recipient']:[]),
    ...(!env.FORMS_TEST_EMAIL?['FORMS_TEST_EMAIL restricted binding']:[]),
    ...(!safeEmail(env.FORMS_FROM)?['Authenticated FORMS_FROM sender']:[]),
    ...(env.FORMS_SENDER_READY!=='1'?['Verified sender domain / account sending access']:[]),
  ];
}
export async function digest(s: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2,'0')).join('');
}
export function formReadiness(env: Env, c: FormConfig): string[] {
  const missing: string[] = [];
  let secrets: Record<string,string> = {};
  try {
    const parsed: unknown = JSON.parse(env.FORMS_TURNSTILE_SECRETS || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) secrets = parsed as Record<string,string>;
  } catch { /* Fail closed. */ }
  const secret=typeof secrets[c.turnstile.secretRef]==='string' ? secrets[c.turnstile.secretRef]! : '';
  if (!secret) missing.push('Turnstile secret');
  if (c.mode === 'live') {
    if(c.origins.some(origin=>new URL(origin).protocol!=='https:' || ['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname)))missing.push('Approved HTTPS production origins');
    if (env.FORMS_SANDBOX === '1') missing.push('Sandbox backend cannot activate live delivery');
    if (c.turnstile.sitekey.startsWith('1x') || c.turnstile.sitekey.startsWith('2x') || c.turnstile.sitekey.startsWith('3x') || secret.startsWith('1x') || secret.startsWith('2x')) missing.push('Production Turnstile keys');
    if (!c.recipients.length) missing.push('Notification recipients');
    if (!env.FORMS_EMAIL) missing.push('FORMS_EMAIL binding');
    if (!safeEmail(env.FORMS_FROM)) missing.push('Authenticated FORMS_FROM sender');
    if (env.FORMS_SENDER_READY !== '1') missing.push('Verified sender domain / account sending access');
  }
  if (!env.FORMS_ABUSE_SECRET || env.FORMS_ABUSE_SECRET.length < 32) missing.push('FORMS_ABUSE_SECRET (32+ characters)');
  return missing;
}
async function boundedBody(request: Request): Promise<string> {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) throw new Error('too_large');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length; if (size > MAX_BODY) { await reader.cancel(); throw new Error('too_large'); } chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
}
export async function formRateLimit(env: Env, tenant: string, source: string, now = Date.now()): Promise<boolean> {
  // D1 serializes conditional UPSERTs. These are strict per-window counters,
  // unlike KV read/increment. Failed attempts consume budget too.
  const window = Math.floor(now / 600000), expires = Math.floor(now / 1000) + 1200;
  const counters = [[`tenant:${tenant}:${window}`, 100], [`source:${tenant}:${source}:${window}`, 10]] as const;
  const rows = await env.DB.batch(counters.map(([key, limit]) => env.DB.prepare(`INSERT INTO form_rate_limits(key,n,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1 WHERE n < ? RETURNING n`).bind(key, expires, limit)));
  return rows.every(r => r.results.length === 1);
}
export async function handleFormSubmission(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  let origin = ''; try { origin = approvedOrigin(request.headers.get('origin') || ''); } catch { /* Missing/null origins are rejected. */ }
  const headers: Record<string,string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control':'no-store', vary:'Origin', 'x-content-type-options':'nosniff' };
  const respond = (error: string | null, status: number, extra: Record<string,unknown> = {}) => {
    if (request.method === 'POST' && !request.headers.get('accept')?.includes('application/json')) {
      const message=error ? 'Your message could not be accepted. This form requires JavaScript and a valid security check. Return to the website and try again, or use its listed contact details.' : extra.mode==='test' ? 'Test message accepted. No customer email will be sent.' : 'Message accepted. Your inquiry has been saved.';
      return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Form submission</title></head><body><main><h1>Form submission</h1><p role="${error?'alert':'status'}">${escapeHtml(message)}</p></main></body></html>`,{status,headers:{...headers,'content-type':'text/html; charset=utf-8'}});
    }
    return new Response(JSON.stringify({ok: !error, ...(error ? {error} : {}), ...extra}), {status, headers});
  };
  let body: URLSearchParams;
  if (request.method === 'OPTIONS') body = new URLSearchParams({ form_id: url.searchParams.get('form_id') || '' });
  else if (request.method !== 'POST') return respond('method_not_allowed',405);
  else {
    const type = request.headers.get('content-type')?.split(';')[0]?.trim();
    if (type !== 'application/x-www-form-urlencoded') return respond('unsupported_content_type',415);
    try { body = new URLSearchParams(await boundedBody(request)); } catch (e) { return respond(e instanceof Error && e.message === 'too_large' ? 'too_large' : 'invalid_body',413); }
  }
  const id = body.get('form_id');
  if (request.method === 'POST' && url.searchParams.has('form_id') && url.searchParams.get('form_id') !== id) return respond('form_mismatch',403);
  if (!safeId(id)) return respond('form_configuration_required',403);
  const row = await env.DB.prepare('SELECT * FROM contact_forms WHERE id=?').bind(id).first<StoredForm>();
  if (!row) return respond('unknown_form',403);
  let c: FormConfig; try { c = validateFormConfig(JSON.parse(row.config_json)); } catch { return respond('configuration_unavailable',503); }
  if (c.id !== row.id || (body.has('tenant_id') && body.get('tenant_id') !== row.tenant_id)) return respond('tenant_mismatch',403);
  if (!origin || !c.origins.includes(origin)) return respond('invalid_origin',403);
  const owner = await env.DB.prepare('SELECT tenant_id FROM form_origins WHERE origin=?').bind(origin).first<{tenant_id:string}>();
  if (owner?.tenant_id !== row.tenant_id) return respond('tenant_mismatch',403);
  const hostnameOwner=await env.DB.prepare('SELECT tenant_id FROM hostnames WHERE hostname=?').bind(new URL(origin).hostname).first<{tenant_id:string}>();
  if(hostnameOwner && hostnameOwner.tenant_id!==row.tenant_id)return respond('tenant_mismatch',403);
  headers['access-control-allow-origin'] = origin;
  headers['access-control-allow-methods'] = 'POST, OPTIONS';
  headers['access-control-allow-headers'] = 'Content-Type, Accept';
  if (c.mode === 'disabled') return respond('form_disabled',403);
  if (request.method === 'OPTIONS') {
    if (request.headers.get('access-control-request-method') !== 'POST' || (request.headers.get('access-control-request-headers') || '').split(',').some(h => h.trim() && !['content-type','accept'].includes(h.trim().toLowerCase()))) return respond('invalid_preflight',403);
    return new Response(null, {status:204, headers});
  }
  const missing = formReadiness(env,c);
  if (missing.length) return respond('configuration_unavailable',503);
  const meta = new Set(['form_id','tenant_id','idempotency_key','page_path','vid','company_url','cf-turnstile-response']);
  for (const [key] of body) if (!meta.has(key) && !c.fields.some(f => f.name === key)) return respond('unknown_field',400);
  for (const key of meta) if (body.getAll(key).length > 1) return respond('duplicate_field',400);
  if (body.get('company_url')?.trim()) return respond('invalid_submission',400);
  const key = body.get('idempotency_key') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return respond('invalid_idempotency_key',400);
  const path = body.get('page_path') || '/';
  const vid=body.get('vid') || '';
  if(vid && !isUuid(vid))return respond('invalid_visitor_id',400);
  if (!path.startsWith('/') || path.length > 200 || /[\r\n\x00]/.test(path)) return respond('invalid_path',400);
  const fields: Record<string,string[]> = Object.create(null), mapped = {name:'',email:'',phone:'',message:''};
  for (const f of c.fields) {
    const values = body.getAll(f.name).map(v=>['select','checkbox','radio'].includes(f.type) ? v : v.trim());
    if ((f.type !== 'checkbox' && values.length > 1) || values.length > 40 || new Set(values).size !== values.length || (f.required && (!values.length || values.every(v=>!v))) || values.some(v => v.length > f.maxLength || (v && v.length < (f.minLength || 0)) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v) || (f.type === 'email' && v && !safeEmail(v)) || (f.options && v && !f.options.includes(v)))) return respond('validation_error',400,{field:f.name});
    fields[f.name] = values; if (f.map) mapped[f.map] = values.join(', ');
  }
  if (!safeEmail(mapped.email)) return respond('validation_error',400,{field:'email'});
  const fingerprint = await digest(JSON.stringify({origin,path,fields:Object.fromEntries(Object.entries(fields).sort(([a],[b])=>a.localeCompare(b)))}));
  const receipt = () => env.DB.prepare('SELECT s.id,s.fingerprint,s.mode,o.status AS notification FROM form_submissions s LEFT JOIN form_outbox o ON o.id=s.id AND o.tenant_id=s.tenant_id WHERE s.tenant_id=? AND s.form_id=? AND s.idempotency_key=?').bind(row.tenant_id,id,key).first<Receipt>();
  const acknowledge = (r: Receipt) => r.fingerprint !== fingerprint ? respond('idempotency_conflict',409) : respond(null,200,{leadId:r.id, mode:r.mode, notification:r.notification || 'unknown'});
  const existing = await receipt(); if (existing) return acknowledge(existing);
  const ip = request.headers.get('cf-connecting-ip') || (isLocalRequest(request) ? 'local' : 'unknown');
  const source = await hmacHex(env.FORMS_ABUSE_SECRET!,ip);
  if (!await formRateLimit(env,row.tenant_id,source)) { headers['retry-after']='600'; return respond('rate_limited',429); }
  const token = body.get('cf-turnstile-response') || '';
  if (!token || token.length > 2048) return respond('challenge_required',400);
  let challenge: {success?:boolean; hostname?:string; action?:string};
  try {
    // Siteverify retries use a token-specific UUID, not the submission UUID.
    // A refreshed token must never reuse a cached verdict for the old token.
    const hash=await digest(`${row.tenant_id}|${id}|${key}|${token}`);
    const verificationKey=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',signal:AbortSignal.timeout(10000),body:new URLSearchParams({secret:JSON.parse(env.FORMS_TURNSTILE_SECRETS!)[c.turnstile.secretRef],response:token,remoteip:ip === 'local' || ip === 'unknown' ? '' : ip,idempotency_key:verificationKey})});
    if (!r.ok) return respond('challenge_unavailable',503);
    challenge = await r.json();
  } catch { return respond('challenge_unavailable',503); }
  // A competing retry may already have committed while Siteverify was pending.
  const raced = await receipt(); if (raced) return acknowledge(raced);
  if (!challenge.success || challenge.hostname !== new URL(origin).hostname || challenge.action !== c.turnstile.action) return respond('challenge_invalid',400);
  const leadId = crypto.randomUUID();
  try {
    // Trigger creates the outbox, legacy lead and conversion in the same transaction.
    await env.DB.prepare(`INSERT INTO form_submissions(id,tenant_id,form_id,idempotency_key,fingerprint,challenge_hash,mode,fields_json,schema_json,name,email,phone,message,page_path,recipients_json,vid) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(leadId,row.tenant_id,id,key,fingerprint,await digest(token),c.mode,JSON.stringify(fields),JSON.stringify(c.fields),mapped.name,mapped.email,mapped.phone,mapped.message,path,JSON.stringify(c.recipients),vid || null).run();
  } catch {
    const duplicate = await receipt(); if (duplicate) return acknowledge(duplicate);
    const replay = await env.DB.prepare('SELECT id FROM form_submissions WHERE challenge_hash=?').bind(await digest(token)).first();
    return respond(replay ? 'challenge_replayed' : 'acceptance_unavailable', replay ? 400 : 503);
  }
  return respond(null,201,{leadId,mode:c.mode,notification:c.mode === 'test' ? (env.FORMS_TEST_RECIPIENT?'test_mail_pending':'test_capture_pending') : 'pending'});
}

export async function formAdminAuthorized(env: Env, request: Request, tenantId: string): Promise<boolean> {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /,'');
  if (bearer) {
    try { const expected = JSON.parse(env.FORMS_SETUP_TOKENS || '{}')[tenantId]; if (typeof expected === 'string' && expected.length >= 32 && await digest(bearer) === await digest(expected)) return true; } catch { /* Deny. */ }
    return false;
  }
  const session = await readSession(env,request);
  if (session?.tenantId !== tenantId || session.role !== 'owner') return false;
  return request.method === 'GET' || request.headers.get('origin') === new URL(request.url).origin;
}
export async function configureForms(env: Env, tenantId: string, forms: FormConfig[], tenant?:{slug:string;name:string}): Promise<void> {
  if (!forms.length || forms.length > 20 || new Set(forms.map(f=>f.id)).size !== forms.length) throw new Error('One to 20 unique forms required');
  const statements: D1PreparedStatement[] = [];
  if (!await env.DB.prepare('SELECT id FROM tenants WHERE id=?').bind(tenantId).first()) {
    if (!tenant || !safeId(tenant.slug) || typeof tenant.name !== 'string' || !tenant.name || tenant.name.length>200) throw new Error('Unknown tenant');
    statements.push(env.DB.prepare('INSERT INTO tenants(id,slug,name) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').bind(tenantId,tenant.slug,tenant.name));
  }
  for (const value of forms) {
    const c = validateFormConfig(value);
    const previous = await env.DB.prepare('SELECT tenant_id FROM contact_forms WHERE id=?').bind(c.id).first<{tenant_id:string}>();
    if (previous && previous.tenant_id !== tenantId) throw new Error('Form belongs to another tenant');
    if (c.mode === 'live' && formReadiness(env,c).length) throw new Error('Live readiness: ' + formReadiness(env,c).join(', '));
    for (const origin of c.origins) {
      const host = await env.DB.prepare('SELECT tenant_id FROM hostnames WHERE hostname=?').bind(new URL(origin).hostname).first<{tenant_id:string}>();
      if (host && host.tenant_id !== tenantId) throw new Error('Hostname belongs to another tenant');
      // Conflict is a uniqueness error, never an ownership reassignment. Batch rolls back.
      statements.push(env.DB.prepare('INSERT INTO form_origins(origin,hostname,tenant_id) VALUES(?,?,?) ON CONFLICT(origin) DO UPDATE SET tenant_id=excluded.tenant_id RETURNING tenant_id').bind(origin,new URL(origin).hostname,tenantId));
      const owner = await env.DB.prepare('SELECT tenant_id FROM form_origins WHERE origin=?').bind(origin).first<{tenant_id:string}>();
      if (owner && owner.tenant_id !== tenantId) throw new Error('Origin belongs to another tenant');
    }
    // SQL assertion also covers races between independent provisioning requests.
    statements.push(env.DB.prepare(`INSERT INTO contact_forms(id,tenant_id,config_json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET tenant_id=excluded.tenant_id,config_json=excluded.config_json,updated_at=datetime('now')`).bind(c.id,tenantId,JSON.stringify(c)));
  }
  await env.DB.batch(statements);
}
export async function retryNotification(env: Env, tenantId: string, id: string): Promise<boolean> {
  const r = await env.DB.prepare(`UPDATE form_outbox SET status='pending',attempts=0,next_attempt=0,last_error=NULL WHERE id=? AND tenant_id=? AND status='failed' RETURNING id`).bind(id,tenantId).all();
  return !!r.results.length;
}
export async function handleFormsAdmin(env: Env, request: Request): Promise<Response> {
  const match = new URL(request.url).pathname.match(/^\/api\/forms\/([a-zA-Z0-9_-]+)(?:\/(retry))?$/);
  const reply = (body: unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  if (!match || !await formAdminAuthorized(env,request,match[1]!)) return reply({error:'unauthorized'},401);
  const tenantId = match[1]!;
  if (request.method === 'GET' && !match[2]) {
    const rows = await env.DB.prepare('SELECT * FROM contact_forms WHERE tenant_id=?').bind(tenantId).all<StoredForm>();
    const forms = rows.results.map(row => { const config = validateFormConfig(JSON.parse(row.config_json)); const missing=formReadiness(env,config),liveMissing=formReadiness(env,{...config,mode:'live'}); return {config,missing,ready:config.mode!=='disabled' && !missing.length,liveMissing,liveReady:!liveMissing.length}; });
    const notifications = await env.DB.prepare('SELECT id,status,attempts,last_error,provider_id,accepted_at FROM form_outbox WHERE tenant_id=? ORDER BY rowid DESC LIMIT 100').bind(tenantId).all();
    return reply({forms,notifications:notifications.results,sandboxMail:{enabled:!!env.FORMS_TEST_RECIPIENT,recipient:env.FORMS_TEST_RECIPIENT || null,missing:sandboxMailReadiness(env)}});
  }
  if (request.method !== 'POST' || !request.headers.get('content-type')?.startsWith('application/json')) return reply({error:'invalid_request'},400);
  try {
    const input = JSON.parse(await boundedBody(request));
    if (match[2]) return reply({ok:await retryNotification(env,tenantId,input.id)});
    await configureForms(env,tenantId,input.forms,input.tenant);
    return reply({ok:true});
  } catch { return reply({error:'invalid_configuration_or_ownership'},400); }
}
