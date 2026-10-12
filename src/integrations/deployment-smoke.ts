import { setTimeout as delay } from "node:timers/promises";

export async function deploymentSmoke(url: string, opts: { signal?: AbortSignal; onLog?: (line: string) => void; preserved?: boolean; attempts?: number; retryDelayMs?: number } = {}): Promise<{ ok: boolean; status: number; message: string }> {
  let result = { ok: false, status: 0, message: "Deployment not reachable" };
  const attempts = opts.attempts ?? 8;
  for (let attempt = 0; attempt < attempts; attempt++) {
    opts.signal?.throwIfAborted();
    try {
      const response = await fetch(url, { signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) });
      const html = await response.text();
      const markup = opts.preserved ? /<html\b/i.test(html) : /<h1\b/i.test(html);
      result = response.status === 200 && markup
        ? { ok: true, status: 200, message: "Root page rendered with HTTP 200 and expected markup" }
        : { ok: false, status: response.status, message: "Unexpected status or missing page markup" };
    } catch (error) {
      const e = error as Error & { cause?: { code?: string } };
      result = { ok: false, status: 0, message: `${e.message}${e.cause?.code ? ` (${e.cause.code})` : ""}` };
    }
    if (result.ok) return result;
    if (attempt + 1 < attempts) {
      opts.onLog?.(`Waiting for deployment availability (${attempt + 1}/${attempts}): ${result.message}`);
      await delay(opts.retryDelayMs ?? Math.min(10_000, 1000 * 2 ** attempt), undefined, { signal: opts.signal });
    }
  }
  return result;
}
