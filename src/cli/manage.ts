import { resolve } from 'node:path';
import { prepareSiteManager, siteManagerStatus } from '../agent/site-manager.ts';
import { findHarnessRoot } from './root.ts';
import { EXIT_CODES, type CommandResult } from './types.ts';

export function manageSite(action: string, opts: { site?: string; dryRun?: boolean } = {}): CommandResult {
  if (!['prepare', 'status'].includes(action)) return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: 'Use vitris manage prepare|status --site DIR' };
  try {
    const root = resolve(opts.site || '.');
    const data = action === 'prepare' && !opts.dryRun ? prepareSiteManager(root, findHarnessRoot()) : siteManagerStatus(root);
    return { ok: true, exitCode: EXIT_CODES.SUCCESS, data,
      summary: action === 'prepare' ? opts.dryRun ? '[dry-run] Would prepare the site manager; no schedule activated' : 'Site manager ready: SITE-MANAGER.md and agent/site-manager/CONTEXT.md. Recurring review brief prepared; no schedule activated.'
        : `Site manager ${data.installed ? 'installed' : 'not installed'}; production origin: ${data.productionOrigin || 'unknown'}; health: ${data.liveHealth}; schedule: ${data.scheduleState}` };
  } catch (error) {
    return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: error instanceof Error ? error.message : String(error) };
  }
}
