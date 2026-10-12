/** Unattended Cloudflare APIs; agent-facing MCP can perform the same operations. */
import { safeId } from './config.ts';
export type Widget = {sitekey:string; name:string; domains:string[]; secret?:string};
export type CloudflareAccess = {account:string; token:string};
export async function cloudflareRequest<T>(access: CloudflareAccess, path: string, method='GET', body?: unknown): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {method,headers:{authorization:`Bearer ${access.token}`,'content-type':'application/json'},signal:AbortSignal.timeout(15000),...(body === undefined ? {} : {body:JSON.stringify(body)})});
  const result = await response.json() as {success:boolean;result:T;errors?:{code:number}[]};
  if (!response.ok || !result.success) throw new Error(`Cloudflare ${method} ${path}: HTTP ${response.status}; codes ${(result.errors || []).map(e=>e.code).join(',')}. Check scoped token permissions.`);
  return result.result;
}
export async function listWidgets(access: CloudflareAccess): Promise<Widget[]> {
  const result: Widget[] = [];
  for (let page=1;page<=20;page++) { const rows=await cloudflareRequest<Widget[]>(access,`/accounts/${access.account}/challenges/widgets?page=${page}&per_page=100`); result.push(...rows.map(w=>({sitekey:w.sitekey,name:w.name,domains:w.domains}))); if (rows.length<100) return result; }
  throw new Error('Widget pagination limit reached');
}
export function allocateWidget(widgets: Widget[], hostnames: string[]): {widget?:Widget; domains:string[]; name:string} {
  const hosts=[...new Set(hostnames)].sort();
  if (!hosts.length || hosts.length>10 || hosts.some(h=>h.includes('*') || h.includes('/') || !h)) throw new Error('One to ten exact widget hostnames required');
  const managed=widgets.filter(w=>/^vitris-forms-pool-\d+$/.test(w.name));
  const existing=managed.find(w=>hosts.every(h=>w.domains.includes(h))) || managed.find(w=>new Set([...w.domains,...hosts]).size<=10);
  if (existing) return {widget:existing,name:existing.name,domains:[...new Set([...existing.domains,...hosts])].sort()};
  if (widgets.length>=20) throw new Error('Free Turnstile widget capacity exhausted (20/account, 10 hostnames/widget). Arrange Enterprise limits or release reviewed unused capacity.');
  let n=1; while (widgets.some(w=>w.name===`vitris-forms-pool-${n}`)) n++;
  return {name:`vitris-forms-pool-${n}`,domains:hosts};
}
export async function reconcileWidget(access: CloudflareAccess, hostnames:string[], apply:boolean): Promise<{sitekey?:string;secretRef?:string;plan:ReturnType<typeof allocateWidget>}> {
  try { await cloudflareRequest(access,'/user/tokens/verify'); }
  catch { await cloudflareRequest(access,`/accounts/${access.account}/tokens/verify`); }
  const plan=allocateWidget(await listWidgets(access),hostnames);
  if (!apply) return {sitekey:plan.widget?.sitekey,plan};
  let widget:Widget;
  if (!plan.widget) widget=await cloudflareRequest(access,`/accounts/${access.account}/challenges/widgets`,'POST',{name:plan.name,domains:plan.domains,mode:'managed',bot_fight_mode:false,clearance_level:'no_clearance'});
  else if (JSON.stringify([...plan.widget.domains].sort())!==JSON.stringify(plan.domains)) widget=await cloudflareRequest(access,`/accounts/${access.account}/challenges/widgets/${plan.widget.sitekey}`,'PUT',{name:plan.name,domains:plan.domains,mode:'managed',bot_fight_mode:false,clearance_level:'no_clearance'});
  else widget=plan.widget;
  return {sitekey:widget.sitekey,secretRef:`pool_${widget.sitekey}`,plan};
}
export function validateSecretMap(value:unknown):Record<string,string> {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.entries(value).some(([key,secret])=>!safeId(key) || typeof secret!=='string' || !secret || secret.length>200)) throw new Error('Expected complete Turnstile secret map with named nonempty string values');
  return {...value as Record<string,string>};
}
export async function provisionWidgetSecrets(access:CloudflareAccess, worker:string, existing:unknown):Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(worker)) throw new Error('Invalid Worker name');
  const secrets=validateSecretMap(existing);
  const managed=(await listWidgets(access)).filter(w=>/^vitris-forms-pool-\d+$/.test(w.name));
  for (const w of managed) {
    const details=await cloudflareRequest<Widget>(access,`/accounts/${access.account}/challenges/widgets/${w.sitekey}`);
    if (!details.secret) throw new Error('Turnstile secret unavailable');
    secrets[`pool_${w.sitekey}`]=details.secret;
  }
  // Existing map is required: never silently erase external secret references.
  await cloudflareRequest(access,`/accounts/${access.account}/workers/scripts/${worker}/secrets`,'PUT',{name:'FORMS_TURNSTILE_SECRETS',type:'secret_text',text:JSON.stringify(secrets)});
}
