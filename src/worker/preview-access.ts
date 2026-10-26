import { hmacHex, readSession, sessionCookieName } from './auth.ts';
import { isLocalRequest, kernelOrigin, secret, type Env } from './env.ts';
import { cookieHeader, cookies, redirect, text } from './http.ts';
import { tenantBySlug } from './tenant.ts';

const TTL=900;
const cookieName=(request:Request)=>isLocalRequest(request)?'vitris_preview':'__Host-vitris_preview';
type Grant={slug:string;ref:string;host:string;expires:number;sessionHash:string};

function suffix(env:Env):string|null {
  const value=env.PREVIEW_HOST_SUFFIX?.toLowerCase();
  if (!value || value.length>190 || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9.-]+$/.test(value)) return null;
  try { return new URL(`https://${value}`).hostname===value ? value : null; } catch { return null; }
}

export function isPreviewHost(env:Env,request:Request):boolean {
  const domain=suffix(env),host=new URL(request.url).hostname;
  return !!domain && (host===domain || host.endsWith(`.${domain}`));
}

function isolatedHost(env:Env,host:string,request:Request):boolean {
  return ![new URL(kernelOrigin(env)).hostname,env.APP_HOST,env.OPS_HOST].includes(host)
    && (new URL(request.url).protocol==='https:' || isLocalRequest(request));
}

async function sign(env:Env,grant:Grant):Promise<string> {
  const payload=btoa(JSON.stringify(grant)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return `${payload}.${await hmacHex(secret(env),`preview-v1:${payload}`)}`;
}

async function verify(env:Env,token:string,host:string):Promise<Grant|null> {
  if (token.length>4096) return null;
  const match=token.match(/^([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/);
  if (!match) return null;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret(env)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signature=Uint8Array.from(match[2]!.match(/../g)!,x=>parseInt(x,16));
  if (!await crypto.subtle.verify('HMAC',key,signature,new TextEncoder().encode(`preview-v1:${match[1]}`))) return null;
  try {
    const grant=JSON.parse(atob(match[1]!.replace(/-/g,'+').replace(/_/g,'/'))) as Grant;
    const now=Math.floor(Date.now()/1000);
    if (grant.host!==host || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(grant.slug) || typeof grant.ref!=='string' || grant.ref.length>200 || !Number.isInteger(grant.expires) || grant.expires<=now || grant.expires>now+TTL || !/^[a-f0-9]{64}$/.test(grant.sessionHash)) return null;
    const row=await env.DB.prepare('SELECT session_json FROM auth_sessions WHERE id_hash=? AND expires_at>?').bind(grant.sessionHash,now).first<{session_json:string}>();
    if (!row) return null;
    const session=JSON.parse(row.session_json) as {tenantId:string;role:string};
    const tenant=await tenantBySlug(env,grant.slug);
    return tenant && (session.role==='operator' || session.tenantId===tenant.id) ? grant : null;
  } catch { return null; }
}

/** Authenticated admin-origin handoff. Customer HTML is never rendered here. */
export async function previewHandoff(env:Env,request:Request):Promise<Response> {
  if (!['GET','HEAD'].includes(request.method)) return text('Read-only preview',405);
  const url=new URL(request.url),match=url.pathname.match(/^\/preview\/([a-z0-9][a-z0-9-]*)(?:\/|$)/);
  if (!match) return text('Not found',404);
  const session=await readSession(env,request);
  if (!session) return text('Sign in to open this preview',401);
  const slug=match[1]!,tenant=await tenantBySlug(env,slug);
  if (!tenant || (session.role!=='operator' && session.tenantId!==tenant.id)) return text('Not found',404);
  const domain=suffix(env),host=`${slug}.${domain}`;
  if (!domain || !isolatedHost(env,host,request) || host===url.hostname || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return text('Configure a separate PREVIEW_HOST_SUFFIX before opening hosted previews',503);
  const ref=url.searchParams.get('ref') || 'main';
  if (ref.length>200 || !/^[\w./-]+$/.test(ref)) return text('Invalid preview ref',400);
  const grant:Grant={slug,ref,host,expires:Math.floor(Date.now()/1000)+TTL,sessionHash:await hmacHex(secret(env),`session:${cookies(request)[sessionCookieName(request)]}`)};
  url.hostname=host;
  url.search='';url.searchParams.set('access',await sign(env,grant));
  return redirect(url.toString());
}

/** Preview hosts expose only one tenant and never route administration or APIs. */
export async function previewRequest(env:Env,request:Request):Promise<{request:Request}|Response> {
  const url=new URL(request.url),domain=suffix(env),slug=domain ? url.hostname.slice(0,-domain.length-1) : '';
  if (!domain || !slug || !isolatedHost(env,url.hostname,request)) return text('Not found',404);
  if (!['GET','HEAD'].includes(request.method)) return text('Read-only preview',405);
  const handoff=url.searchParams.get('access');
  const token=handoff || cookies(request)[cookieName(request)] || '';
  const grant=await verify(env,token,url.hostname);
  if (!grant || grant.slug!==slug) return text('Preview access expired. Reopen it from the admin app.',401);
  const ref=url.searchParams.get('ref');
  if (ref && ref!==grant.ref) return text('Reopen this branch from the admin app',403);
  if (handoff) {
    url.searchParams.delete('access');
    const response=redirect(url.toString());
    response.headers.set('set-cookie',cookieHeader(cookieName(request),token,Math.max(0,grant.expires-Math.floor(Date.now()/1000)),!isLocalRequest(request)));
    response.headers.set('cache-control','no-store');response.headers.set('referrer-policy','no-referrer');
    return response;
  }
  if (/^\/(app|ops|api|assets|gallery)(\/|$)/.test(url.pathname)) return text('Not found',404);
  const prefix=`/preview/${slug}`;
  if (url.pathname.startsWith('/preview/') && url.pathname!==prefix && !url.pathname.startsWith(prefix+'/')) return text('Not found',404);
  if (url.pathname!==prefix && !url.pathname.startsWith(prefix+'/')) url.pathname=prefix+(url.pathname==='/'?'/':url.pathname);
  url.searchParams.set('ref',grant.ref);
  return {request:new Request(url,request)};
}
