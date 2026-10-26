import { cookies, cookieHeader, clearCookie } from "./http.ts";
import { isLocalRequest, secret, type Env } from "./env.ts";

export const SESSION_COOKIE = "__Host-vitris_sid";
export function sessionCookieName(request?: Request):string {
  return request && isLocalRequest(request) ? 'vitris_sid' : SESSION_COOKIE;
}

export type Session = {
  userId: string;
  email: string;
  tenantId: string;
  role: "owner" | "operator";
};

export async function hmacHex(key: string, value: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function readSession(env: Env, request: Request): Promise<Session | null> {
  if (!isLocalRequest(request) && new URL(request.url).protocol !== 'https:') return null;
  const sid = cookies(request)[sessionCookieName(request)];
  if (!sid || !/^[a-f0-9-]{36}$/.test(sid)) return null;
  const row = await env.DB.prepare('SELECT session_json FROM auth_sessions WHERE id_hash=? AND expires_at>?')
    .bind(await hmacHex(secret(env), `session:${sid}`), Math.floor(Date.now()/1000)).first<{session_json:string}>();
  return row ? JSON.parse(row.session_json) as Session : null;
}

export async function createSession(env: Env, session: Session): Promise<string> {
  const sid = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO auth_sessions(id_hash,session_json,expires_at) VALUES(?,?,?)')
    .bind(await hmacHex(secret(env), `session:${sid}`), JSON.stringify(session), Math.floor(Date.now()/1000)+60*60*24*14).run();
  return sid;
}

export function sessionCookie(sid: string, request?: Request): string {
  return cookieHeader(sessionCookieName(request), sid, 60 * 60 * 24 * 14, !request || !isLocalRequest(request));
}

export function logoutCookie(request?: Request): string {
  return clearCookie(sessionCookieName(request), !request || !isLocalRequest(request));
}

export async function revokeSession(env: Env, request: Request): Promise<void> {
  const sid = cookies(request)[sessionCookieName(request)];
  if (sid && /^[a-f0-9-]{36}$/.test(sid)) await env.DB.prepare('DELETE FROM auth_sessions WHERE id_hash=?')
    .bind(await hmacHex(secret(env), `session:${sid}`)).run();
}

export async function magicToken(env: Env, email: string): Promise<string> {
  const token = crypto.randomUUID();
  const hash = await hmacHex(secret(env), token);
  await env.DB.prepare('INSERT INTO auth_magic_tokens(token_hash,email,expires_at) VALUES(?,?,?)')
    .bind(hash,email.toLowerCase(),Math.floor(Date.now()/1000)+60*20).run();
  return token;
}

export async function consumeMagic(env: Env, token: string): Promise<string | null> {
  if (!/^[a-f0-9-]{36}$/.test(token)) return null;
  const hash = await hmacHex(secret(env), token);
  const row = await env.DB.prepare('DELETE FROM auth_magic_tokens WHERE token_hash=? AND expires_at>? RETURNING email')
    .bind(hash,Math.floor(Date.now()/1000)).first<{email:string}>();
  return row?.email ?? null;
}

export async function discardMagic(env: Env, token: string): Promise<void> {
  await env.DB.prepare('DELETE FROM auth_magic_tokens WHERE token_hash=?').bind(await hmacHex(secret(env),token)).run();
}

export async function allowLogin(env: Env, request: Request, email: string): Promise<boolean> {
  const now=Math.floor(Date.now()/1000), window=Math.floor(now/900);
  const source=request.headers.get('cf-connecting-ip') || 'unknown';
  const keys=await Promise.all([hmacHex(secret(env),`login-ip:${source}`),hmacHex(secret(env),`login-email:${email}`)]);
  const results=await env.DB.batch(keys.map((key,i)=>env.DB.prepare('INSERT INTO auth_rate_limits(key,n,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1 WHERE n<? RETURNING n')
    .bind(`${window}:${key}`,now+1800,i===0?10:5)));
  return results.every(r=>r.results.length===1);
}

export async function pruneAuth(env: Env): Promise<void> {
  const now=Math.floor(Date.now()/1000);
  await env.DB.batch(['auth_sessions','auth_magic_tokens','auth_rate_limits'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE expires_at<=?`).bind(now)));
}
