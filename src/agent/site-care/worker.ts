import { DurableObject } from 'cloudflare:workers';
import { applyCareCommand, CareError, careDigest, parseCareCommand, type CareState } from './machine.ts';

interface Env { CARE_STATE: DurableObjectNamespace; SITE_CARE_SITE_ID: string; SITE_CARE_STATE_TOKEN: string }
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

/** Dedicated, optional per-site state service. It never touches the site's business backend. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== '/v1/care') return reply({ error: 'not_found' }, 404);
    if (!env.SITE_CARE_SITE_ID || (env.SITE_CARE_STATE_TOKEN?.length || 0) < 32) return reply({ error: 'service_not_configured' }, 503);
    if (request.headers.has('origin') || request.headers.get('authorization') !== `Bearer ${env.SITE_CARE_STATE_TOKEN}`) return reply({ error: 'unauthorized' }, 401);
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    return env.CARE_STATE.get(env.CARE_STATE.idFromName(env.SITE_CARE_SITE_ID)).fetch(request);
  },
};

export class SiteCareState extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS care_state (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL)');
  }
  async fetch(request: Request): Promise<Response> {
    try {
      if (Number(request.headers.get('content-length')) > 256 * 1024) throw new CareError('Request too large', 413);
      // Bound chunked requests too, without accumulating the whole incoming body.
      const reader = request.body?.getReader();
      if (!reader) throw new CareError('Request body required');
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 256 * 1024) { await reader.cancel(); throw new CareError('Request too large', 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let raw: unknown;
      try { raw = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new CareError('Invalid JSON'); }
      const command = parseCareCommand(raw);
      if (command.siteId !== this.env.SITE_CARE_SITE_ID) throw new CareError('Site identity mismatch', 403);
      const digest = await careDigest(command);
      // No await inside the transaction. The authoritative clock is the service clock.
      const result = this.ctx.storage.transactionSync(() => {
        const row = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM care_state WHERE id = 1').toArray()[0];
        const outcome = applyCareCommand(row ? JSON.parse(row.value) as CareState : undefined, command, digest, new Date());
        if (outcome.changed) this.ctx.storage.sql.exec('INSERT OR REPLACE INTO care_state (id, value) VALUES (1, ?)', JSON.stringify(outcome.state));
        return outcome.result;
      });
      return reply({ version: 1, siteId: command.siteId, result });
    } catch (error) {
      return reply({ error: error instanceof CareError ? error.message : 'state_unavailable' }, error instanceof CareError ? error.status : 503);
    }
  }
}
