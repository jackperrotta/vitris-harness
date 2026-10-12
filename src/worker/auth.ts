import { cookies, cookieHeader, clearCookie } from "./http.ts";
import { secret, type Env } from "./env.ts";

export const SESSION_COOKIE = "vitris_sid";

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
  const sid = cookies(request)[SESSION_COOKIE];
  if (!sid) return null;
  const raw = await env.KV.get(`sess:${sid}`);
  if (!raw) return null;
  return JSON.parse(raw) as Session;
}

export async function createSession(env: Env, session: Session): Promise<string> {
  const sid = crypto.randomUUID();
  await env.KV.put(`sess:${sid}`, JSON.stringify(session), { expirationTtl: 60 * 60 * 24 * 14 });
  return sid;
}

export function sessionCookie(sid: string): string {
  return cookieHeader(SESSION_COOKIE, sid, 60 * 60 * 24 * 14);
}

export function logoutCookie(): string {
  return clearCookie(SESSION_COOKIE);
}

export async function magicToken(env: Env, email: string): Promise<string> {
  const token = crypto.randomUUID();
  const hash = await hmacHex(secret(env), token);
  await env.KV.put(`magic:${hash}`, email.toLowerCase(), { expirationTtl: 60 * 20 });
  return token;
}

export async function consumeMagic(env: Env, token: string): Promise<string | null> {
  const hash = await hmacHex(secret(env), token);
  const email = await env.KV.get(`magic:${hash}`);
  if (!email) return null;
  await env.KV.delete(`magic:${hash}`);
  return email;
}
