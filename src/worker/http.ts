function headerMap(headers?: HeadersInit): Record<string, string> {
  const map: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    map[key] = value;
  });
  return map;
}

export function html(body: string, status = 200, headers?: HeadersInit): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", 'cache-control':'no-store', 'referrer-policy':'no-referrer', 'x-frame-options':'DENY', ...headerMap(headers) },
  });
}

export function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headerMap(headers) },
  });
}

export function redirect(location: string, status = 303): Response {
  return new Response(null, { status, headers: { location,'cache-control':'no-store','referrer-policy':'no-referrer' } });
}

export function cookies(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    try { out[trimmed.slice(0, eq)] = decodeURIComponent(trimmed.slice(eq + 1)); } catch { /* Ignore malformed cookies. */ }
  }
  return out;
}

export async function readBody(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = (await request.json()) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) out[k] = v == null ? "" : String(v);
    return out;
  }
  const form = await request.formData();
  const out: Record<string, string> = {};
  form.forEach((value, key) => {
    out[key] = String(value);
  });
  return out;
}

export function query(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

export function cookieHeader(name: string, value: string, maxAge: number, secure = true): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearCookie(name: string, secure = true): string {
  return cookieHeader(name,'',0,secure);
}

export function sameOriginMutation(request: Request): boolean {
  return ['GET','HEAD','OPTIONS'].includes(request.method) || request.headers.get('origin') === new URL(request.url).origin;
}
