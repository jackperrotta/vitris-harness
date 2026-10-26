/**
 * Gmail REST client using a Google Cloud service account with domain-wide delegation.
 * Builds RS256 JWT → OAuth token → users.messages.send.
 */

import type { Env } from "./env.ts";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function b64url(bytes: ArrayBuffer | Uint8Array | string): string {
  let bin: string;
  if (typeof bytes === "string") {
    bin = btoa(bytes);
  } else {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = "";
    for (const b of arr) s += String.fromCharCode(b);
    bin = btoa(s);
  }
  return bin.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function signJwt(env: Env): Promise<string> {
  const clientEmail = env.GMAIL_SA_CLIENT_EMAIL;
  const privateKey = env.GMAIL_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const subject = env.GMAIL_IMPERSONATE || env.MAIL_FROM;
  if (!clientEmail || !privateKey || !subject) {
    throw new Error("Gmail SA not configured (GMAIL_SA_CLIENT_EMAIL, GMAIL_SA_PRIVATE_KEY, GMAIL_IMPERSONATE)");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: clientEmail,
      sub: subject,
      scope: GMAIL_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const key = await importPrivateKey(privateKey);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}

async function getAccessToken(env: Env): Promise<string> {
  const cacheKey = "gmail:access_token";
  const cached = await env.KV.get(cacheKey);
  if (cached) return cached;

  const jwt = await signJwt(env);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Gmail token error: ${data.error || res.status}`);
  }
  const ttl = Math.max(60, Math.min(3000, (data.expires_in ?? 3600) - 120));
  await env.KV.put(cacheKey, data.access_token, { expirationTtl: ttl });
  return data.access_token;
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  const bytes = new TextEncoder().encode(subject);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

function buildRfc2822(opts: {
  from: string;
  to: string[];
  subject: string;
  text: string;
}): string {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(", ")}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.text,
  ];
  return lines.join("\r\n");
}

export type SendMailOpts = {
  to: string[];
  subject: string;
  text: string;
  from?: string;
};

export function mailConfigured(env: Env): boolean {
  return !!((env.GMAIL_SA_CLIENT_EMAIL && env.GMAIL_SA_PRIVATE_KEY && (env.GMAIL_IMPERSONATE || env.MAIL_FROM)) || (env.MAIL_API_KEY && env.MAIL_FROM));
}

export async function sendMail(env: Env, opts: SendMailOpts): Promise<void> {
  const from = opts.from || env.GMAIL_IMPERSONATE || env.MAIL_FROM;
  if (!from) throw new Error("No MAIL_FROM / GMAIL_IMPERSONATE configured");

  if ([from,...opts.to,opts.subject].some(value=>/[\r\n]/.test(value))) throw new Error('Invalid mail headers');
  // Never log message bodies: authentication messages contain bearer tokens.
  if (!env.GMAIL_SA_CLIENT_EMAIL || !env.GMAIL_SA_PRIVATE_KEY) {
    if (!env.MAIL_API_KEY || !env.MAIL_FROM) throw new Error('Email delivery is not configured');
    const response=await fetch('https://api.resend.com/emails', {
      method:'POST',headers:{authorization:`Bearer ${env.MAIL_API_KEY}`,'content-type':'application/json'},
      body:JSON.stringify({from,to:opts.to,subject:opts.subject,text:opts.text}),
    });
    if (!response.ok) throw new Error('Email delivery failed');
    return;
  }

  const token = await getAccessToken(env);
  const raw = b64url(buildRfc2822({ from, to: opts.to, subject: opts.subject, text: opts.text }));
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    throw new Error(`Gmail send failed: ${res.status}`);
  }
}
