import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { applyCareCommand, careDigest, carePeriods, parseCareReport, type CareCommand, type CareState, type CareFinding } from './agent/site-care/machine.ts';
import { executeCare } from './agent/site-care/store.ts';
import { configureCare, careSettings } from './agent/site-care/config.ts';
import { planCareSchedule, verifyScheduleReceipt, type ScheduleReceipt } from './agent/site-care/schedule.ts';
import { siteCareCommand } from './cli/site-care.ts';
import { save, files } from './agent/artifacts.ts';
import { prepareSiteManager } from './agent/site-manager.ts';

const temp = () => mkdtempSync(join(tmpdir(), 'vitris-care-'));
const site = () => { const root = temp(); save(join(root, 'site.json'), { slug: 'care-fixture' }); save(join(root, 'launch.json'), { publicOrigin: 'https://site.example' }); return root; };
const timezone = 'America/New_York';
const begin = (runId = 'run-1'): CareCommand => ({ action: 'begin', siteId: 'fixture-site', timezone, runId, token: `lease-${runId}` });
const leaseFences = new Map<string, string>();
const finding = (summary = 'Home unavailable', scope: CareFinding['scope'] = 'daily'): CareFinding => ({ key: 'home', scope, severity: 'critical', summary, evidence: ['https://site.example/'] });
const report = (scopes: Record<string, string> = { daily: 'completed', weekly: 'completed', monthly: 'completed' }, findings: CareFinding[] = []) => parseCareReport({ scopes, findings });
const complete = (runId: string, value = report(), fence = leaseFences.get(runId)!): CareCommand => ({ action: 'complete', siteId: 'fixture-site', runId, token: `lease-${runId}`, fence, report: value });
async function step(state: CareState | undefined, command: CareCommand, when = '2026-11-06T14:00:00Z') {
  const result = applyCareCommand(state, command, await careDigest(command), new Date(when));
  if (result.result.packet) leaseFences.set(result.result.packet.runId, result.result.packet.fence);
  return result;
}

test('calendar scopes follow site timezone across DST, Mondays, months and year boundaries', () => {
  assert.deepEqual(carePeriods(new Date('2026-11-01T05:30:00Z'), timezone), { daily: '2026-11-01', weekly: '2026-10-26', monthly: '2026-11' });
  assert.deepEqual(carePeriods(new Date('2026-11-01T06:30:00Z'), timezone), { daily: '2026-11-01', weekly: '2026-10-26', monthly: '2026-11' });
  assert.deepEqual(carePeriods(new Date('2026-11-02T04:30:00Z'), timezone), { daily: '2026-11-01', weekly: '2026-10-26', monthly: '2026-11' });
  assert.deepEqual(carePeriods(new Date('2026-11-02T05:30:00Z'), timezone), { daily: '2026-11-02', weekly: '2026-11-02', monthly: '2026-11' });
  assert.equal(carePeriods(new Date('2027-01-01T14:00:00Z'), timezone).weekly, '2026-12-28');
  assert.throws(() => carePeriods(new Date(), 'made/up'), /timezone/);
});

test('daily coordinator catches up due scopes and suppresses completed periods', async () => {
  let run = await step(undefined, begin());
  assert.deepEqual(run.result.packet?.scopes, ['daily', 'weekly', 'monthly']);
  let done = await step(run.state, complete('run-1'));
  assert.equal(done.result.receipt?.digestDue, true);
  assert.equal((await step(done.state, begin('same-day'))).result.status, 'already-completed');
  run = await step(done.state, begin('tomorrow'), '2026-11-07T14:00:00Z');
  assert.deepEqual(run.result.packet?.scopes, ['daily']);
  done = await step(run.state, complete('tomorrow', report({ daily: 'completed' })), '2026-11-07T14:02:00Z');
  run = await step(done.state, begin('missed-week'), '2026-11-17T14:00:00Z');
  assert.deepEqual(run.result.packet?.scopes, ['daily', 'weekly']);
  run = await step(done.state, begin('missed-month'), '2026-12-02T14:00:00Z');
  assert.deepEqual(run.result.packet?.scopes, ['daily', 'weekly', 'monthly']);
});

test('leases prevent overlaps, support response retries/renewal, and fence expired writers', async () => {
  let first = await step(undefined, begin());
  assert.equal((await step(first.state, begin('competitor'))).result.status, 'busy');
  assert.deepEqual((await step(first.state, begin())).result.packet, first.result.packet);
  first = await step(first.state, { action: 'renew', siteId: 'fixture-site', runId: 'run-1', token: 'lease-run-1', fence: leaseFences.get('run-1')! }, '2026-11-06T14:30:00Z');
  assert.equal(first.result.packet?.expiresAt, '2026-11-06T15:30:00.000Z');
  assert.equal((await step(first.state, begin('competitor'), '2026-11-06T15:10:00Z')).result.status, 'busy');
  const next = await step(first.state, begin('replacement'), '2026-11-06T15:31:00Z');
  await assert.rejects(step(next.state, complete('run-1'), '2026-11-06T15:32:00Z'), /another run/);
  const aborted = await step(next.state, { action: 'abort', siteId: 'fixture-site', runId: 'replacement', token: 'lease-replacement', fence: leaseFences.get('replacement')! }, '2026-11-06T15:32:00Z');
  assert.deepEqual(aborted.state.lastCompleted, {});
  assert.equal(aborted.state.lease, undefined);
  const original = await step(undefined, begin('lost-response'));
  const stale = complete('lost-response');
  const reopened = await step(original.state, begin('lost-response'), '2026-11-06T15:01:00Z');
  assert.notEqual(reopened.result.packet?.fence, original.result.packet?.fence);
  await assert.rejects(step(reopened.state, stale, '2026-11-06T15:02:00Z'), /another run/);
});

test('partial failures preserve scope findings/baselines; only completed scopes resolve them', async () => {
  const first = await step(undefined, begin());
  const initialReport = report(undefined, [finding(), { ...finding('Admin compatibility unknown', 'weekly'), key: 'admin-version' }]);
  initialReport.baselines = { daily: [{ summary: '503', source: 'HTTP', period: '2026-11-06' }] };
  const initial = await step(first.state, complete('run-1', initialReport));
  const next = await step(initial.state, begin('next'), '2026-11-09T14:00:00Z');
  const blocked = await step(next.state, complete('next', report({ daily: 'completed', weekly: 'blocked' })), '2026-11-09T14:02:00Z');
  assert.deepEqual(blocked.result.receipt?.changes.resolved, ['home']);
  assert.deepEqual(blocked.state.findings.map(f => f.key), ['admin-version']);
  assert.equal(blocked.state.lastCompleted.weekly?.period, '2026-11-02');
  assert.equal(blocked.state.baselines?.daily?.[0]?.summary, '503');
  assert.deepEqual((await step(blocked.state, begin('retry'), '2026-11-09T14:03:00Z')).result.packet?.scopes, ['weekly']);
});

test('findings deduplicate evidence churn and completion retry cannot replace a report', async () => {
  const first = await step(undefined, begin());
  const command = complete('run-1', report(undefined, [finding()]));
  const done = await step(first.state, command);
  assert.deepEqual(done.result.receipt?.critical, ['home']);
  assert.deepEqual((await step(done.state, command, '2026-11-07T14:00:00Z')).result.receipt, done.result.receipt);
  await assert.rejects(step(done.state, complete('run-1', report())), /different report/);
  const next = await step(done.state, begin('next'), '2026-11-07T14:00:00Z');
  const same = { ...finding(), evidence: ['A newer observation'] };
  const unchanged = await step(next.state, complete('next', report({ daily: 'completed' }, [same])), '2026-11-07T14:01:00Z');
  assert.deepEqual(unchanged.result.receipt?.changes.ongoing, ['home']);
  assert.deepEqual(unchanged.result.receipt?.critical, []);
  assert.equal(unchanged.result.receipt?.digestDue, false);
});

test('runs crossing midnight advance their assigned periods, not newly due periods', async () => {
  const run = await step(undefined, begin(), '2026-11-01T03:50:00Z');
  const done = await step(run.state, complete('run-1'), '2026-11-01T04:10:00Z');
  assert.equal(done.state.lastCompleted.monthly?.period, '2026-10');
  assert.deepEqual((await step(done.state, begin('next'), '2026-11-01T04:11:00Z')).result.packet?.scopes, ['daily', 'monthly']);
});

test('invalid reports, site mismatches and corrupt persisted state never reset history', async () => {
  assert.throws(() => parseCareReport({ scopes: {}, findings: [finding(), finding()] }), /duplicate/);
  assert.throws(() => parseCareReport({ scopes: { weekly: 'blocked' }, findings: [], baselines: { weekly: [] } }), /baseline/);
  const run = await step(undefined, begin());
  await assert.rejects(step(run.state, complete('run-1', report({ daily: 'completed' }))), /exactly the scopes/);
  await assert.rejects(step({ ...run.state, receipts: null } as unknown as CareState, begin()), /persisted care state/);
  await assert.rejects(step(run.state, { ...begin(), siteId: 'other-site' }), /different site/);
  const root = site();
  save(join(root, 'site-manager.json'), { version: 1, reviewPolicy: 'report-and-prepare-local-fixes', schedule: { cadence: null, timezone: null }, care: null });
  assert.throws(() => configureCare(root, { timezone }), /care settings/);
  assert.equal(JSON.parse(readFileSync(join(root, 'site-manager.json'), 'utf8')).care, null);
});

test('file state persists across instances, serializes begin and keeps status read-only/token-free', async () => {
  const root = site(); const connection = { siteId: 'fixture-site', state: 'local' as const };
  const before = files(root);
  await executeCare(root, connection, { action: 'status', siteId: connection.siteId });
  assert.deepEqual(files(root), before);
  const results = await Promise.all([executeCare(root, connection, begin()), executeCare(root, connection, begin('other'))]);
  assert.deepEqual(results.map(r => r.status).sort(), ['busy', 'started']);
  const winner = results.find(r => r.status === 'started')!.packet!;
  await executeCare(root, connection, complete(winner.runId, report(), winner.fence));
  assert.equal((await executeCare(root, connection, begin('another'))).status, 'already-completed');
  const status = await executeCare(root, connection, { action: 'status', siteId: connection.siteId });
  assert.doesNotMatch(JSON.stringify(status), /lease-run|"token"/);
  const path = join(root, 'agent/site-manager/care/state.json');
  writeFileSync(path, '{"version":99}');
  await assert.rejects(executeCare(root, connection, begin('bad')), /persisted care state/);
  assert.equal(readFileSync(path, 'utf8'), '{"version":99}');
});

test('schedule planning prefers usable cloud; local fallback is explicit and registration binds verified settings', async () => {
  const root = site();
  configureCare(root, { timezone, state: 'local' });
  const caps = { provider: 'native-tools', cloud: { available: true, evidence: 'cloud tool inspected', repository: 'https://github.com/example/site', environmentReady: true }, local: { available: true, evidence: 'persistent local tool inspected' } };
  const plan = planCareSchedule(root, caps);
  assert.equal(plan.executionEnvironment, 'local');
  assert.match(plan.reason, /remote care state/);
  const care = careSettings(root);
  const manualRun = await executeCare(root, care, { ...begin(), siteId: care.siteId });
  const receipt: ScheduleReceipt = { planId: plan.planId, siteId: care.siteId, provider: caps.provider, taskId: 'actual-task', executionEnvironment: 'local', binding: plan.binding,
    cadence: 'daily', time: '09:00', timezone, active: true, matchingTaskIds: ['actual-task'], verifiedAt: new Date().toISOString(), manualRunId: 'run-1' };
  await assert.rejects(verifyScheduleReceipt(root, plan, receipt), /initial review/);
  await executeCare(root, care, { ...complete('run-1', report(), manualRun.packet!.fence), siteId: care.siteId });
  assert.equal((await verifyScheduleReceipt(root, plan, receipt)).taskId, 'actual-task');
  await assert.rejects(verifyScheduleReceipt(root, plan, { ...receipt, matchingTaskIds: ['actual-task', 'duplicate'] }), /one active/);
  await assert.rejects(verifyScheduleReceipt(root, plan, { ...receipt, timezone: 'UTC' }), /timezone/);
  await assert.rejects(verifyScheduleReceipt(root, plan, { ...receipt, privateToken: 'must-not-copy' } as ScheduleReceipt), /documented scheduler receipt/);
  // Reconnecting later must not demand an extra monthly review merely because its receipt aged out.
  const base = new Date('2026-11-06T17:00:00Z');
  const initial = await step(undefined, { ...begin('initial-baseline'), siteId: care.siteId }, base.toISOString());
  let persisted = (await step(initial.state, { ...complete('initial-baseline'), siteId: care.siteId }, base.toISOString())).state;
  for (let day = 1; day <= 17; day++) {
    const date = new Date(base.getTime() + day * 24 * 60 * 60 * 1000).toISOString(), runId = `reconnect-${day}`;
    const started = await step(persisted, { ...begin(runId), siteId: care.siteId }, date);
    const assigned = Object.fromEntries(started.result.packet!.scopes.map(scope => [scope, 'completed']));
    persisted = (await step(started.state, { ...complete(runId, report(assigned)), siteId: care.siteId }, date)).state;
  }
  save(join(root, 'agent/site-manager/care/state.json'), persisted);
  assert.equal(persisted.receipts.some(entry => entry.receipt.scopes.monthly), false);
  assert.equal((await verifyScheduleReceipt(root, plan, { ...receipt, manualRunId: 'reconnect-17' })).taskId, 'actual-task');
  configureCare(root, { time: '10:00' });
  await assert.rejects(verifyScheduleReceipt(root, plan, receipt), /stale/);
  assert.throws(() => configureCare(root, { state: 'remote' }), /migrate/);
  const remote = site(); configureCare(remote, { timezone, state: 'remote' });
  assert.equal(planCareSchedule(remote, caps).executionEnvironment, 'cloud');
  assert.equal(planCareSchedule(remote, { ...caps, cloud: { ...caps.cloud, environmentReady: false } }).executionEnvironment, 'local');
  assert.throws(() => planCareSchedule(remote, { provider: 'no-tools' }), /No usable/);
});

test('CLI lifecycle keeps tokens in unique ignored packets and dry-runs do not change state', async () => {
  const root = site(); prepareSiteManager(root, join(import.meta.dirname, '..'));
  const before = files(root);
  assert.equal((await siteCareCommand('care', 'configure', { site: root, timezone, dryRun: true })).ok, true);
  assert.deepEqual(files(root), before);
  assert.equal((await siteCareCommand('care', 'configure', { site: root, timezone })).ok, true);
  const dryFiles = files(root);
  assert.equal((await siteCareCommand('care', 'begin', { site: root, dryRun: true })).ok, true);
  assert.deepEqual(files(root), dryFiles);
  const started = await siteCareCommand('care', 'begin', { site: root });
  const data = started.data as { packetFile: string; packet: { scopes: string[] } };
  assert.equal(started.ok, true); assert.equal(data.packet.scopes.length, 3);
  assert.doesNotMatch(JSON.stringify(data), /"token"/);
  assert.ok(existsSync(join(root, data.packetFile)));
  assert.equal((await siteCareCommand('care', 'begin', { site: root, packet: data.packetFile })).ok, true);
  const oldPacketBytes = readFileSync(join(root, data.packetFile), 'utf8');
  const careStatePath = join(root, 'agent/site-manager/care/state.json');
  const expiredState: CareState = JSON.parse(readFileSync(careStatePath, 'utf8'));
  expiredState.lease!.expiresAt = '2020-01-01T00:00:00Z';
  save(careStatePath, expiredState);
  const retried = await siteCareCommand('care', 'begin', { site: root, packet: data.packetFile });
  const replacementPacket = (retried.data as { packetFile: string }).packetFile;
  assert.notEqual(replacementPacket, data.packetFile);
  assert.equal(readFileSync(join(root, data.packetFile), 'utf8'), oldPacketBytes);
  save(join(root, 'artifacts/site-manager/report.json'), report());
  assert.equal((await siteCareCommand('care', 'complete', { site: root, packet: data.packetFile, report: 'artifacts/site-manager/report.json' })).ok, false);
  assert.equal((await siteCareCommand('care', 'complete', { site: root, packet: replacementPacket, report: 'artifacts/site-manager/report.json' })).ok, true);
  assert.equal((await siteCareCommand('care', 'complete', { site: root, packet: replacementPacket, report: 'artifacts/site-manager/report.json' })).ok, true);
  assert.equal((await siteCareCommand('care', 'complete', { site: root, packet: '../outside.json', report: 'artifacts/site-manager/report.json' })).ok, false);
});

test('dedicated remote service authenticates, serializes cloud runs and persists across process restarts', async () => {
  const dir = temp(), scriptPath = join(dir, 'worker.mjs'), persist = join(dir, 'persist');
  await build({ entryPoints: [join(import.meta.dirname, 'agent/site-care/worker.ts')], outfile: scriptPath, bundle: true, platform: 'browser', format: 'esm', external: ['cloudflare:*'] });
  const token = 'fixture-service-secret-'.repeat(3);
  const create = () => new Miniflare(convertV4MiniflareOptions({ name: 'site-care-test', rootPath: dir, modulesRoot: dir, modules: true, scriptPath, compatibilityDate: '2026-09-01', durableObjects: { CARE_STATE: { className: 'SiteCareState', useSQLite: true } }, resourcePersistencePath: persist,
    bindings: { SITE_CARE_SITE_ID: 'fixture-site', SITE_CARE_STATE_TOKEN: token } }));
  let mf = create();
  const post = (command: CareCommand, secret = token, origin?: string) => mf.dispatchFetch('https://care.example/v1/care', { method: 'POST', headers: { authorization: `Bearer ${secret}`, ...(origin ? { origin } : {}) }, body: JSON.stringify(command) });
  try {
    assert.equal((await post(begin(), 'wrong')).status, 401);
    assert.equal((await post(begin(), token, 'https://site.example')).status, 401);
    assert.equal((await post({ ...begin(), siteId: 'wrong-site' })).status, 403);
    const answers = await Promise.all([post(begin()), post(begin('other'))]);
    const results = await Promise.all(answers.map(async r => (await r.json() as { result: { status: string; packet?: { runId: string; fence: string } } }).result));
    assert.deepEqual(results.map(result => result.status).sort(), ['busy', 'started']);
    const winner = results.find(result => result.status === 'started')!.packet!;
    assert.equal((await post(complete(winner.runId, report(), winner.fence))).status, 200);
    await mf.dispose(); mf = create();
    const status = await (await post({ action: 'status', siteId: 'fixture-site' })).json() as { result: { lastCompleted: Record<string, unknown>; recentRuns: unknown[] } };
    assert.deepEqual(Object.keys(status.result.lastCompleted).sort(), ['daily', 'monthly', 'weekly']);
    assert.equal(status.result.recentRuns.length, 1);
    assert.doesNotMatch(JSON.stringify(status), /lease-run|fixture-service-secret/);
    // Exercise the actual HTTP client, rather than only the in-process fetch interface.
    const url = new URL('/v1/care', await mf.ready).href;
    const env = { VITRIS_SITE_CARE_STATE_URL: url, VITRIS_SITE_CARE_STATE_TOKEN: token };
    const root = site(), connection = { siteId: 'fixture-site', state: 'remote' as const };
    assert.equal((await executeCare(root, connection, { action: 'status', siteId: 'fixture-site' }, env)).status, 'status');
    await assert.rejects(executeCare(root, connection, begin(), { ...env, VITRIS_SITE_CARE_STATE_TOKEN: 'wrong-secret'.repeat(4) }), /rejected/);
    await mf.dispose();
    await assert.rejects(executeCare(root, connection, begin(), env), /unavailable/);
    assert.equal(existsSync(join(root, 'agent/site-manager/care/state.json')), false);
  } finally { await mf.dispose(); }
});
