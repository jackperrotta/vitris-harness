import { randomUUID } from 'node:crypto';
import { save, within } from '../artifacts.ts';
import { readSiteManagerConfig, siteManagerStatus } from '../site-manager.ts';
import { CareError, careTimezone } from './machine.ts';

export interface CareConfig { siteId: string; state: 'local' | 'remote'; time: string }
export function careSettings(root: string) {
  const config = readSiteManagerConfig(root), care = config.care;
  if (!care || !/^[a-zA-Z0-9_-]{1,128}$/.test(care.siteId) || !['local', 'remote'].includes(care.state) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(care.time) || config.schedule.cadence !== 'daily') throw new CareError('Configure daily care first with vitris manage care configure');
  const timezone = careTimezone(config.schedule.timezone);
  return { ...care, timezone };
}
export function configureCare(root: string, opts: { timezone?: string; time?: string; state?: string }, dryRun = false) {
  siteManagerStatus(root); // Require an actual site, validate authored preferences before changing them.
  const config = readSiteManagerConfig(root), old = config.care;
  const timezone = careTimezone(opts.timezone || config.schedule.timezone);
  const time = opts.time || old?.time || '09:00', state = opts.state || old?.state || 'local';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !['local', 'remote'].includes(state)) throw new CareError('Use HH:MM (24-hour) and --state local|remote');
  // Moving state needs an explicit, separately reviewed migration; empty state would lose dedup and leases.
  if (old && old.state !== state) throw new CareError('Care state provider is already selected; migrate its state explicitly before changing providers');
  config.schedule = { ...config.schedule, cadence: 'daily', timezone };
  config.care = { siteId: old?.siteId || randomUUID(), state: state as CareConfig['state'], time };
  if (!dryRun) save(within(root, 'site-manager.json'), config);
  return { ...config.care, timezone, scheduleActivated: false, preference: 'cloud-first' };
}
