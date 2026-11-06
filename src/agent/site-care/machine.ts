/** Shared by the local coordinator and its optional dedicated cloud state service. */
export const CARE_SCOPES = ['daily', 'weekly', 'monthly'] as const;
export type CareScope = typeof CARE_SCOPES[number];
export type Periods = Record<CareScope, string>;
export interface CareFinding {
  key: string;
  scope: CareScope;
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  evidence: string[];
}
export interface CareReport {
  scopes: Partial<Record<CareScope, 'completed' | 'blocked' | 'failed'>>;
  findings: CareFinding[];
  baselines?: Partial<Record<CareScope, Array<{ summary: string; source: string; period: string }>>>;
}
export interface CarePacket {
  siteId: string;
  runId: string;
  token: string;
  fence: string;
  timezone: string;
  periods: Periods;
  scopes: CareScope[];
  expiresAt: string;
}
export interface CareReceipt {
  runId: string;
  completedAt: string;
  scopes: CareReport['scopes'];
  changes: { opened: string[]; changed: string[]; resolved: string[]; ongoing: string[] };
  critical: string[];
  digestDue: boolean;
}
export interface CareState {
  version: 1;
  siteId: string;
  lastCompleted: Partial<Record<CareScope, { period: string; at: string }>>;
  lease?: CarePacket;
  findings: CareFinding[];
  baselines?: CareReport['baselines'];
  receipts: Array<{ digest: string; receipt: CareReceipt }>;
}
export type CareCommand =
  | { action: 'status'; siteId: string }
  | { action: 'begin'; siteId: string; timezone: string; runId: string; token: string }
  | { action: 'renew'; siteId: string; runId: string; token: string; fence: string }
  | { action: 'complete'; siteId: string; runId: string; token: string; fence: string; report: CareReport }
  | { action: 'abort'; siteId: string; runId: string; token: string; fence: string };

export class CareError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bounded = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
export function careTimezone(value: unknown): string {
  if (!bounded(value, 100)) throw new CareError('A site-care timezone is required');
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); } catch { throw new CareError('Invalid site-care timezone'); }
  return value;
}
export function carePeriods(now: Date, timezone: string): Periods {
  careTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  const day = part('year') + '-' + part('month') + '-' + part('day');
  const monday = new Date(day + 'T12:00:00Z');
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return { daily: day, weekly: monday.toISOString().slice(0, 10), monthly: day.slice(0, 7) };
}
export function parseCareReport(value: unknown): CareReport {
  if (!object(value) || !object(value.scopes) || !Array.isArray(value.findings) || value.findings.length > 50 ||
      Object.keys(value).some(k => !['scopes', 'findings', 'baselines'].includes(k))) throw new CareError('Invalid care report');
  const scopes: CareReport['scopes'] = {};
  for (const [key, outcome] of Object.entries(value.scopes)) {
    if (!CARE_SCOPES.includes(key as CareScope) || !['completed', 'blocked', 'failed'].includes(String(outcome))) throw new CareError('Invalid care scope outcome');
    scopes[key as CareScope] = outcome as 'completed' | 'blocked' | 'failed';
  }
  const keys = new Set<string>();
  const findings = value.findings.map(raw => {
    if (!object(raw) || !bounded(raw.key, 128) || keys.has(raw.key) || !CARE_SCOPES.includes(raw.scope as CareScope) ||
        !['critical', 'warning', 'info'].includes(String(raw.severity)) || !bounded(raw.summary, 400) || !Array.isArray(raw.evidence) || raw.evidence.length > 4 ||
        raw.evidence.some(e => !bounded(e, 256)) || Object.keys(raw).some(k => !['key', 'scope', 'severity', 'summary', 'evidence'].includes(k))) throw new CareError('Invalid or duplicate care finding');
    keys.add(raw.key);
    return { key: raw.key, scope: raw.scope as CareScope, severity: raw.severity as CareFinding['severity'], summary: raw.summary, evidence: raw.evidence as string[] };
  });
  const baselines: NonNullable<CareReport['baselines']> = {};
  if (value.baselines !== undefined) {
    if (!object(value.baselines)) throw new CareError('Invalid care baselines');
    for (const [scope, entries] of Object.entries(value.baselines)) {
      if (!CARE_SCOPES.includes(scope as CareScope) || scopes[scope as CareScope] !== 'completed' || !Array.isArray(entries) || entries.length > 12 || entries.some(entry => !object(entry) ||
          !bounded(entry.summary, 512) || !bounded(entry.source, 256) || !bounded(entry.period, 128) || Object.keys(entry).some(k => !['summary', 'source', 'period'].includes(k)))) throw new CareError('Invalid completed-scope baseline');
      baselines[scope as CareScope] = entries;
    }
  }
  return { scopes, findings, ...(value.baselines !== undefined ? { baselines } : {}) };
}
export function parseCareCommand(value: unknown): CareCommand {
  if (!object(value) || !bounded(value.siteId, 128) || !['status', 'begin', 'renew', 'complete', 'abort'].includes(String(value.action))) throw new CareError('Invalid care command');
  if (value.action === 'status') return { action: 'status', siteId: value.siteId };
  if (!bounded(value.runId, 100) || !bounded(value.token, 100)) throw new CareError('Run identity and lease token are required');
  const common = { siteId: value.siteId, runId: value.runId, token: value.token };
  if (value.action === 'begin') return { action: 'begin', ...common, timezone: careTimezone(value.timezone) };
  if (!bounded(value.fence, 100)) throw new CareError('A server-issued lease fence is required');
  if (value.action === 'complete') return { action: 'complete', ...common, fence: value.fence, report: parseCareReport(value.report) };
  return { action: value.action as 'renew' | 'abort', ...common, fence: value.fence };
}
export async function careDigest(command: CareCommand): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(command)));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
const expires = (now: Date) => new Date(now.getTime() + 60 * 60 * 1000).toISOString();

function validateState(state: CareState): void {
  try {
    if (!object(state) || state.version !== 1 || !bounded(state.siteId, 128) || !object(state.lastCompleted) || !Array.isArray(state.receipts) || state.receipts.length > 16) throw new Error();
    parseCareReport({ scopes: { daily: 'completed', weekly: 'completed', monthly: 'completed' }, findings: state.findings, ...(state.baselines ? { baselines: state.baselines } : {}) });
    for (const [scope, entry] of Object.entries(state.lastCompleted)) if (!CARE_SCOPES.includes(scope as CareScope) || !object(entry) || !bounded(entry.period, 10) || !Number.isFinite(Date.parse(String(entry.at)))) throw new Error();
    if (state.lease) {
      const lease = state.lease;
      parseCareCommand({ action: 'begin', ...lease });
      if (lease.siteId !== state.siteId || !bounded(lease.fence, 100) || !Array.isArray(lease.scopes) || !lease.scopes.length || new Set(lease.scopes).size !== lease.scopes.length || lease.scopes.some(s => !CARE_SCOPES.includes(s)) ||
          !object(lease.periods) || CARE_SCOPES.some(scope => !bounded(lease.periods[scope], 10)) || !Number.isFinite(Date.parse(lease.expiresAt))) throw new Error();
    }
    for (const item of state.receipts) {
      if (!object(item) || !/^[a-f0-9]{64}$/.test(item.digest) || !object(item.receipt)) throw new Error();
      const r = item.receipt;
      parseCareReport({ scopes: r.scopes, findings: [] });
      if (!bounded(r.runId, 100) || !Number.isFinite(Date.parse(r.completedAt)) || !object(r.changes) ||
          (['opened', 'changed', 'resolved', 'ongoing'] as const).some(key => !Array.isArray(r.changes[key]) || r.changes[key].length > 50 || r.changes[key].some(k => !bounded(k, 128))) ||
          !Array.isArray(r.critical) || r.critical.length > 50 || r.critical.some(k => !bounded(k, 128)) || typeof r.digestDue !== 'boolean') throw new Error();
    }
  } catch { throw new CareError('Invalid persisted care state; preserve it and investigate instead of resetting history', 503); }
}

/** One atomic operation. The cloud service supplies its own clock and transaction. */
export function applyCareCommand(prior: CareState | undefined, command: CareCommand, digest: string, now: Date) {
  if (prior !== undefined) validateState(prior);
  if (prior && (prior.version !== 1 || prior.siteId !== command.siteId)) throw new CareError('Care state belongs to a different site or version', 409);
  const state: CareState = structuredClone(prior || { version: 1, siteId: command.siteId, lastCompleted: {}, findings: [], receipts: [] });
  const view = () => ({ siteId: state.siteId, lastCompleted: state.lastCompleted, findings: state.findings,
    baselines: state.baselines || {},
    recentRuns: state.receipts.map(entry => entry.receipt),
    activeRun: state.lease ? { runId: state.lease.runId, expiresAt: state.lease.expiresAt } : null });
  if (command.action === 'status') return { changed: false, state, result: { status: 'status', ...view() } };
  if (command.action === 'begin') {
    if (state.receipts.some(entry => entry.receipt.runId === command.runId)) return { changed: false, state, result: { status: 'already-completed', ...view() } };
    if (state.lease?.runId === command.runId && state.lease.token === command.token && state.lease.timezone === command.timezone && Date.parse(state.lease.expiresAt) > now.getTime()) {
      return { changed: false, state, result: { status: 'started', packet: state.lease, previousFindings: state.findings, previousBaselines: state.baselines || {} } };
    }
    if (state.lease && Date.parse(state.lease.expiresAt) > now.getTime()) return { changed: false, state, result: { status: 'busy', ...view() } };
    const periods = carePeriods(now, command.timezone);
    const scopes = CARE_SCOPES.filter(scope => state.lastCompleted[scope]?.period !== periods[scope]);
    if (!scopes.length) return { changed: false, state, result: { status: 'already-completed', ...view() } };
    // A new attempt gets a server nonce even if a lost-response retry reuses an expired request identity.
    const packet: CarePacket = { siteId: command.siteId, runId: command.runId, token: command.token, fence: crypto.randomUUID(), timezone: command.timezone, periods, scopes, expiresAt: expires(now) };
    state.lease = packet;
    return { changed: true, state, result: { status: 'started', packet, previousFindings: state.findings, previousBaselines: state.baselines || {} } };
  }
  const oldReceipt = state.receipts.find(r => r.receipt.runId === command.runId);
  if (command.action === 'complete' && oldReceipt) {
    if (oldReceipt.digest !== digest) throw new CareError('A completed run cannot be replaced with a different report', 409);
    return { changed: false, state, result: { status: 'completed', receipt: oldReceipt.receipt } };
  }
  const lease = state.lease;
  if (!lease || lease.runId !== command.runId || lease.token !== command.token || lease.fence !== command.fence || Date.parse(lease.expiresAt) <= now.getTime()) throw new CareError('Care lease expired or belongs to another run; do not advance review state', 409);
  if (command.action === 'renew') {
    lease.expiresAt = expires(now);
    return { changed: true, state, result: { status: 'renewed', packet: lease } };
  }
  if (command.action === 'abort') {
    delete state.lease;
    return { changed: true, state, result: { status: 'aborted' } };
  }
  const report = command.report;
  if (Object.keys(report.scopes).length !== lease.scopes.length || lease.scopes.some(scope => !report.scopes[scope]) ||
      Object.keys(report.scopes).some(scope => !lease.scopes.includes(scope as CareScope)) || report.findings.some(f => !lease.scopes.includes(f.scope))) throw new CareError('Report must account for exactly the scopes assigned to this run');
  const completed = lease.scopes.filter(scope => report.scopes[scope] === 'completed');
  const previous = new Map(state.findings.map(f => [f.key, f]));
  // Only completed scopes replace their findings. Inaccessible or failed scopes retain their history.
  const next = new Map(state.findings.filter(f => !completed.includes(f.scope)).map(f => [f.key, f]));
  for (const finding of report.findings) {
    const priorFinding = previous.get(finding.key);
    if (priorFinding && priorFinding.scope !== finding.scope) throw new CareError('A finding key cannot move between review scopes');
    next.set(finding.key, finding);
  }
  if (next.size > 50) throw new CareError('Care findings exceed the supported bound; consolidate the report');
  const changes: CareReceipt['changes'] = { opened: [], changed: [], resolved: [], ongoing: [] };
  for (const [key, f] of next) {
    const before = previous.get(key);
    if (!before) changes.opened.push(key);
    else if (before.severity !== f.severity || before.summary !== f.summary) changes.changed.push(key);
    else changes.ongoing.push(key);
  }
  for (const key of previous.keys()) if (!next.has(key)) changes.resolved.push(key);
  for (const scope of completed) state.lastCompleted[scope] = { period: lease.periods[scope], at: now.toISOString() };
  for (const scope of completed) if (report.baselines?.[scope]) (state.baselines ||= {})[scope] = report.baselines[scope];
  state.findings = [...next.values()];
  const receipt: CareReceipt = { runId: lease.runId, completedAt: now.toISOString(), scopes: report.scopes, changes,
    critical: [...changes.opened, ...changes.changed].filter(key => next.get(key)?.severity === 'critical'),
    digestDue: completed.includes('weekly') || completed.includes('monthly') };
  state.receipts.push({ digest, receipt }); state.receipts = state.receipts.slice(-16);
  delete state.lease;
  return { changed: true, state, result: { status: 'completed', receipt } };
}
