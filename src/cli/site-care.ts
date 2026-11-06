import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { json, save, within } from '../agent/artifacts.ts';
import { configureCare, careSettings } from '../agent/site-care/config.ts';
import { parseCareReport, type CareCommand, type CarePacket } from '../agent/site-care/machine.ts';
import { executeCare } from '../agent/site-care/store.ts';
import { planCareSchedule, verifyScheduleReceipt, type CareSchedulePlan, type SchedulerCapabilities, type ScheduleReceipt } from '../agent/site-care/schedule.ts';
import { prepareSiteManager, siteManagerStatus } from '../agent/site-manager.ts';
import { findHarnessRoot } from './root.ts';
import { EXIT_CODES, type CommandResult } from './types.ts';

export interface SiteCareOptions {
  site?: string; dryRun?: boolean; timezone?: string; time?: string; state?: string;
  packet?: string; report?: string; capabilities?: string; planFile?: string; receipt?: string; out?: string;
}
export async function siteCareCommand(group: string, action: string, opts: SiteCareOptions = {}): Promise<CommandResult> {
  try {
    const root = resolve(opts.site || '.');
    siteManagerStatus(root);
    const read = <T>(path: string | undefined, label: string): T => {
      if (!path) throw new Error(`${label} file is required`);
      return json<T>(within(root, path));
    };
    let data: unknown;
    if (group === 'care' && action === 'configure') {
      data = configureCare(root, opts, true);
      if (!opts.dryRun) {
        // Resolve skill provenance before modifying authored preferences.
        prepareSiteManager(root, findHarnessRoot());
        data = configureCare(root, opts);
        prepareSiteManager(root, findHarnessRoot());
      }
    } else {
      const care = careSettings(root);
      if (group === 'schedule' && action === 'plan') {
        data = planCareSchedule(root, read<SchedulerCapabilities>(opts.capabilities, '--capabilities'));
        if (!opts.dryRun) save(within(root, opts.out || 'agent/site-manager/schedule-plan.json'), data);
      } else if (group === 'schedule' && action === 'record') {
        const plan = read<CareSchedulePlan>(opts.planFile || 'agent/site-manager/schedule-plan.json', '--plan-file');
        const receipt = read<ScheduleReceipt>(opts.receipt, '--receipt');
        data = await verifyScheduleReceipt(root, plan, receipt);
        if (!opts.dryRun) save(within(root, 'agent/site-manager/schedule.json'), data);
      } else if (group === 'care' && ['status', 'begin', 'renew', 'complete', 'abort'].includes(action)) {
        let command: CareCommand;
        let packetPath: string | undefined;
        let previousFence: string | undefined;
        if (action === 'status') command = { action, siteId: care.siteId };
        else if (action === 'begin') {
          const pending = opts.packet ? read<CarePacket>(opts.packet, '--packet') : undefined;
          previousFence = pending?.fence;
          if (pending && (pending.siteId !== care.siteId || pending.timezone !== care.timezone)) throw new Error('Retry packet belongs to different care settings');
          const runId = pending?.runId || randomUUID();
          command = { action, siteId: care.siteId, timezone: care.timezone, runId, token: pending?.token || randomUUID() };
          packetPath = opts.packet || `agent/site-manager/care/runs/${runId}.json`;
          // Persist the identity before a remote request: retry this packet after a lost response.
          if (!opts.dryRun && !pending) save(within(root, packetPath), command);
        } else {
          const packet = read<CarePacket>(opts.packet, '--packet');
          if (packet.siteId !== care.siteId) throw new Error('Packet belongs to a different site');
          packetPath = opts.packet;
          const common = { siteId: care.siteId, runId: packet.runId, token: packet.token, fence: packet.fence };
          command = action === 'complete' ? { action, ...common, report: parseCareReport(read(opts.report, '--report')) } : { action: action as 'renew' | 'abort', ...common };
        }
        if (packetPath) within(root, packetPath);
        if (opts.dryRun && action !== 'status') data = { would: action, state: care.state, siteId: care.siteId };
        else {
          const result = await executeCare(root, care, command);
          if ('packet' in result && result.packet && packetPath) {
            // Retrying an expired identity must not upgrade the packet still held by its old writer.
            if (action === 'begin' && previousFence && previousFence !== result.packet.fence) packetPath = `agent/site-manager/care/runs/${result.packet.runId}-${randomUUID()}.json`;
            save(within(root, packetPath), result.packet);
            const { token, fence, ...publicPacket } = result.packet;
            data = { ...result, packet: publicPacket, packetFile: packetPath };
          } else data = result;
        }
      } else throw new Error('Use manage care configure|status|begin|renew|complete|abort or manage schedule plan|record');
    }
    return { ok: true, exitCode: EXIT_CODES.SUCCESS, data, summary: `${opts.dryRun ? '[dry-run] ' : ''}Site ${group} ${action}; this command does not create or activate an external schedule.` };
  } catch (error) {
    return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: error instanceof Error ? error.message : String(error) };
  }
}
