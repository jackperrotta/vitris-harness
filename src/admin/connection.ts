import type { AdminManifest } from '@tryvitris/website-admin-contracts';

/** Identity and response requirements of the published alpha adapter. */
export async function readConnection(manifest: AdminManifest, token: string, resource: 'status' | 'leads' | 'analytics', test = false, transport: typeof fetch = fetch) {
  if (!manifest.backend || !/^[a-zA-Z0-9_-]{32,200}$/.test(token)) throw Error('A dedicated VITRIS_ADMIN_API_TOKEN and backend connection are required');
  const url = new URL(`/api/admin/v1/${encodeURIComponent(manifest.backend.tenantId)}/${resource}`, manifest.backend.origin);
  if (test) url.searchParams.set('mode', 'test');
  const response = await transport(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { authorization: `Bearer ${token}`, 'x-vitris-installation': manifest.installationId, 'x-vitris-site-origin': manifest.site.origin } });
  if (!response.ok) throw Error(`Admin v1 ${resource} rejected (${response.status}); connection is not verified`);
  const reader = response.body?.getReader(); if (!reader) throw Error('Empty backend response');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 4e6) { await reader.cancel(); throw Error('Backend response too large'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (data?.schemaVersion !== 1 || data.installationId !== manifest.installationId || data.tenantId !== manifest.backend.tenantId || data.siteOrigin !== manifest.site.origin) throw Error('Backend contract or installation identity mismatch');
  if (resource === 'status') { if (!Array.isArray(data.scopes)) throw Error('Invalid backend scopes'); }
  else {
    if (data.source !== 'connected' || !Array.isArray(data.rows) || data.rows.length > 200) throw Error('Invalid backend records');
    if (resource === 'leads' && data.rows.some((r: Record<string, unknown>) => ['id', 'name', 'email', 'message', 'created_at', 'status'].some(k => typeof r?.[k] !== 'string'))) throw Error('Invalid lead response');
    if (resource === 'analytics' && data.rows.some((r: Record<string, unknown>) => typeof r?.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.day) || ['views', 'visitors', 'enquiries'].some(k => typeof r[k] !== 'number' || !Number.isFinite(r[k]) || (r[k] as number) < 0))) throw Error('Invalid analytics response');
  }
  return data;
}
