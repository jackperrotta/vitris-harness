/** Shared, bounded contract. Recipients and secret references never enter public assets. */
export type FormField = { name: string; label?: string; type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox' | 'radio'; required?: boolean; minLength?: number; maxLength: number; options?: string[]; map?: 'name' | 'email' | 'phone' | 'message' };
export type FormConfig = { id: string; mode: 'disabled' | 'test' | 'live'; origins: string[]; fields: FormField[]; recipients: string[]; turnstile: { sitekey: string; secretRef: string; action: string }; };
export type PublicForm = { id: string; pagePath: string; index?: number; sitekey: string; action: string };
export const safeId = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(s);
export const safeEmail = (s: unknown): s is string => {
  if(typeof s!=='string' || s.length>254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(s))return false;
  const [local,domain]=s.split('@');
  return !!local && local.length<=64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') && !!domain && domain.split('.').every(label=>label.length<=63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
};
export function approvedOrigin(value: string): string {
  const u = new URL(value);
  if (u.origin !== value || u.hostname.includes('*') || u.username || u.password || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))) throw new Error('Expected exact HTTPS origin (HTTP only on loopback)');
  return u.origin;
}
export function validateFormConfig(value: unknown): FormConfig {
  const c = value as FormConfig;
  if (!c || !safeId(c.id) || !['disabled', 'test', 'live'].includes(c.mode)) throw new Error('Invalid form ID or mode');
  if (!Array.isArray(c.origins) || !c.origins.length || c.origins.length > 10 || new Set(c.origins).size !== c.origins.length) throw new Error('One to ten unique exact origins required');
  c.origins.forEach(approvedOrigin);
  if (c.mode === 'live' && c.origins.some(o => new URL(o).protocol !== 'https:' || ['localhost','127.0.0.1','[::1]'].includes(new URL(o).hostname))) throw new Error('Live forms cannot approve loopback origins');
  if (!Array.isArray(c.fields) || !c.fields.length || c.fields.length > 32 || new Set(c.fields.map(f => f.name)).size !== c.fields.length) throw new Error('One to 32 unique fields required');
  const reserved = new Set(['form_id', 'tenant_id', 'idempotency_key', 'page_path', 'vid', 'company_url', 'cf-turnstile-response', 'recipients', 'to', 'from', 'sender']);
  const maps = new Set<string>();
  for (const f of c.fields) {
    if (!safeId(f.name) || reserved.has(f.name) || !['text','email','tel','textarea','select','checkbox','radio'].includes(f.type) || !Number.isInteger(f.maxLength) || f.maxLength < 1 || f.maxLength > 8000 || (f.minLength !== undefined && (!Number.isInteger(f.minLength) || f.minLength < 0 || f.minLength > f.maxLength)) || (f.label !== undefined && (typeof f.label !== 'string' || f.label.length > 200)) || (f.required !== undefined && typeof f.required !== 'boolean')) throw new Error('Invalid field schema');
    if (f.map !== undefined) { if (!['name','email','phone','message'].includes(f.map) || maps.has(f.map)) throw new Error('Invalid or duplicate mapping'); maps.add(f.map); }
    if ((['select','checkbox','radio'].includes(f.type) || f.options !== undefined) && (!Array.isArray(f.options) || !f.options.length || f.options.length > 40 || f.options.some(s => typeof s !== 'string' || !s || s.length > f.maxLength) || new Set(f.options).size !== f.options.length)) throw new Error('Choice fields need bounded options');
  }
  if (!c.fields.some(f => f.map === 'email' && f.type === 'email' && f.required)) throw new Error('A required visitor email mapping is needed');
  if (!Array.isArray(c.recipients) || c.recipients.length > 5 || c.recipients.some(r => !safeEmail(r)) || new Set(c.recipients).size !== c.recipients.length) throw new Error('Invalid notification recipients');
  if (!c.turnstile || typeof c.turnstile.sitekey !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(c.turnstile.sitekey) || !safeId(c.turnstile.secretRef) || !safeId(c.turnstile.action) || c.turnstile.action.length > 32) throw new Error('Invalid Turnstile configuration');
  return c;
}
