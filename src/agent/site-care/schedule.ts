import { realpathSync } from 'node:fs';
import { careSettings } from './config.ts';
import { CareError } from './machine.ts';
import { executeCare } from './store.ts';
import { sha256 } from '../artifacts.ts';

export interface SchedulerCapabilities {
  provider: string;
  cloud?: { available: boolean; evidence: string; repository: string; environmentReady: boolean };
  local?: { available: boolean; evidence: string };
}
export interface CareSchedulePlan {
  version: 1; planId: string; siteId: string; provider: string;
  executionEnvironment: 'cloud' | 'local'; binding: string; state: 'remote' | 'local';
  cadence: 'daily'; time: string; timezone: string; reason: string; prompt: string;
}
const usable = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 1000;
function planHash(plan: Omit<CareSchedulePlan, 'planId'>) { return sha256(JSON.stringify(plan)); }

/** Plan only. Native scheduler tools must create/reuse and read back the real task. */
export function planCareSchedule(root: string, capabilities: SchedulerCapabilities): CareSchedulePlan {
  const care = careSettings(root);
  if (!capabilities || !usable(capabilities.provider)) throw new CareError('Scheduler capabilities must name the actual provider');
  const cloud = capabilities.cloud;
  const useCloud = cloud?.available === true && cloud.environmentReady === true && usable(cloud.evidence) && usable(cloud.repository) && care.state === 'remote';
  if (!useCloud && !(capabilities.local?.available === true && usable(capabilities.local.evidence))) throw new CareError('No usable durable scheduler: cloud needs repository/environment access and remote care state; local needs a persistent native scheduler');
  const binding = useCloud ? cloud!.repository : realpathSync(root);
  const reason = useCloud ? 'Native cloud scheduling and its repository/environment are available; remote state survives fresh checkouts.' :
    `Local fallback: ${cloud?.available !== true ? 'no native cloud scheduler available' : care.state !== 'remote' ? 'durable remote care state is not configured' : 'cloud repository/environment access is not ready'}. The computer and agent must be running; bind the canonical directory without per-run worktrees.`;
  const prompt = `Use the vitris-site-manager skill for this website (care site ID ${care.siteId}). First run vitris manage prepare --site . to generate this checkout's current context and review brief. Read agent/refs/site-care.md and agent/site-manager/review-task.md. Run vitris manage care begin --site . --json and act only on its assigned scopes. A busy or already-completed result ends this run. Renew the lease during long reviews. Complete with the exact structured report, or abort if unable to review. The coordinator includes weekly and monthly work when due. Read current site configuration each run. Prepare verified fixes for review through the site's workflow. Save redacted reports and return evidence, proposed changes and decisions. Never publish or create more schedules from this task. ${useCloud ? 'Use the configured remote care state and authorized cloud environment; local files are temporary. Retain prepared patches and detailed reports in the provider task/branch artifacts so they survive checkout disposal; no automatic Git push.' : 'Run in the bound canonical site directory; do not use an isolated checkout with independent file state. Preserve owner edits and skip overlapping repairs.'}`;
  const body: Omit<CareSchedulePlan, 'planId'> = { version: 1, siteId: care.siteId, provider: capabilities.provider,
    executionEnvironment: useCloud ? 'cloud' : 'local', binding, state: care.state, cadence: 'daily', time: care.time, timezone: care.timezone, reason, prompt };
  return { ...body, planId: planHash(body) };
}

export interface ScheduleReceipt {
  planId: string; siteId: string; provider: string; taskId: string; executionEnvironment: 'cloud' | 'local';
  binding: string; cadence: 'daily'; time: string; timezone: string; active: true;
  matchingTaskIds: string[]; verifiedAt: string; manualRunId: string;
}

export async function verifyScheduleReceipt(root: string, plan: CareSchedulePlan, receipt: ScheduleReceipt) {
  const { planId, ...body } = plan;
  const care = careSettings(root);
  if (plan.version !== 1 || planHash(body) !== planId || !['cloud', 'local'].includes(plan.executionEnvironment) || !usable(plan.provider) || !usable(plan.binding) ||
      typeof plan.prompt !== 'string' || plan.siteId !== care.siteId || plan.state !== care.state ||
      plan.cadence !== 'daily' || plan.time !== care.time || plan.timezone !== care.timezone ||
      (plan.executionEnvironment === 'cloud' && care.state !== 'remote') ||
      (plan.executionEnvironment === 'local' && plan.binding !== realpathSync(root))) throw new CareError('Schedule plan is invalid or stale; generate it again');
  if (!receipt || typeof receipt !== 'object' || Object.keys(receipt).some(key => !['planId', 'siteId', 'provider', 'taskId', 'executionEnvironment', 'binding', 'cadence', 'time', 'timezone', 'active', 'matchingTaskIds', 'verifiedAt', 'manualRunId'].includes(key))) throw new CareError('Use only the documented scheduler receipt fields; do not copy private provider responses');
  for (const key of ['planId', 'siteId', 'provider', 'executionEnvironment', 'binding', 'cadence', 'time', 'timezone'] as const) {
    if (receipt[key] !== plan[key]) throw new CareError(`Scheduler read-back differs from plan: ${key}`);
  }
  if (!usable(receipt.taskId) || receipt.active !== true || !Array.isArray(receipt.matchingTaskIds) || receipt.matchingTaskIds.length !== 1 || receipt.matchingTaskIds[0] !== receipt.taskId ||
      !Number.isFinite(Date.parse(receipt.verifiedAt)) || Math.abs(Date.now() - Date.parse(receipt.verifiedAt)) > 15 * 60 * 1000) throw new CareError('Read back one active matching task and its settings immediately before recording');
  const status = await executeCare(root, care, { action: 'status', siteId: care.siteId });
  if (!('lastCompleted' in status) || !['daily', 'weekly', 'monthly'].every(scope => !!status.lastCompleted?.[scope as 'daily' | 'weekly' | 'monthly']) ||
      !('recentRuns' in status) || !status.recentRuns?.some(run => run.runId === receipt.manualRunId && Object.keys(run.scopes).length > 0 &&
        Object.values(run.scopes).every(outcome => outcome === 'completed'))) throw new CareError('Complete an initial review of all scopes and a recent manual review of assigned scopes through this state provider before recording the schedule');
  return { version: 1, ...receipt, state: care.state, verification: 'last-verified-external-state-may-change' };
}
