import { existsSync, readFileSync } from 'node:fs';
import { acquirePathLock, save, within } from '../artifacts.ts';
import { applyCareCommand, CareError, careDigest, parseCareCommand, type CareCommand, type CareState } from './machine.ts';

export type CareResult = ReturnType<typeof applyCareCommand>['result'];
export interface CareConnection { siteId: string; state: 'local' | 'remote' }

/** Never fall back to a fresh local state if a configured remote service is unavailable. */
export async function executeCare(root: string, connection: CareConnection, input: CareCommand,
  env: Record<string, string | undefined> = process.env): Promise<CareResult> {
  const command = parseCareCommand(input);
  if (command.siteId !== connection.siteId) throw new CareError('Run belongs to a different site');
  if (connection.state === 'remote') {
    const raw = env.VITRIS_SITE_CARE_STATE_URL, token = env.VITRIS_SITE_CARE_STATE_TOKEN;
    if (!raw || !token || token.length < 32) throw new CareError('Remote care state requires VITRIS_SITE_CARE_STATE_URL and a token of at least 32 characters');
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/v1/care' ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new CareError('Use an HTTPS /v1/care state endpoint (HTTP is allowed only on loopback for development)');
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(command) });
    } catch { throw new CareError('Remote care state is unavailable; no local fallback or review state advance', 503); }
    const body = await response.text();
    if (body.length > 512 * 1024) throw new CareError('Remote care state response exceeds the supported bound', 502);
    let data: { version?: number; siteId?: string; result?: CareResult; error?: string };
    try { data = JSON.parse(body); } catch { throw new CareError('Invalid remote care state response', 502); }
    if (!response.ok) throw new CareError(`Remote care state rejected the operation (${response.status}); no local fallback`, response.status);
    if (data.version !== 1 || data.siteId !== connection.siteId || !data.result || typeof data.result.status !== 'string') throw new CareError('Remote care protocol or site identity mismatch', 502);
    return data.result;
  }
  const digest = await careDigest(command);
  const path = within(root, 'agent/site-manager/care/state.json');
  const readState = () => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as CareState : undefined;
  // Atomic replacement means a status reader sees the old or new complete file, without writing locks/directories.
  if (command.action === 'status') return applyCareCommand(readState(), command, digest, new Date()).result;
  // Use a separate transaction lock: save() acquires its own atomic replacement lock.
  const unlock = acquirePathLock(within(root, 'agent/site-manager/care/transaction'));
  try {
    const prior = readState();
    const outcome = applyCareCommand(prior, command, digest, new Date());
    if (outcome.changed) save(path, outcome.state);
    return outcome.result;
  } finally { unlock(); }
}
