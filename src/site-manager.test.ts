import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSite } from './cli/site-create.ts';
import { manageSite } from './cli/manage.ts';
import { MANAGER_CONTEXT, MANAGER_SKILL, MANAGER_TASK, prepareSiteManager, siteManagerStatus } from './agent/site-manager.ts';
import { files, save } from './agent/artifacts.ts';
import { planKitUpgrade } from './upgrade/kit.ts';

const harness = resolve(import.meta.dirname, '..');
const temp = () => mkdtempSync(join(tmpdir(), 'vitris-manager-'));
const text = (root: string, path: string) => readFileSync(join(root, path), 'utf8');
const read = (root: string, path: string) => JSON.parse(text(root, path));

test('new and preserved sites receive management without scheduling or source workflow changes', async () => {
  for (const preserve of [false, true]) {
    const root = temp();
    const result = await createSite({ dir: root, slug: 'manager-fixture', ...(preserve ? { mode: 'preserve', from: 'https://source.example' } : { blank: true }) });
    assert.equal(result.ok, true);
    for (const path of [MANAGER_SKILL, MANAGER_CONTEXT, MANAGER_TASK, 'SITE-MANAGER.md', 'site-manager.json', 'agent/refs/site-manager.md', 'agent/refs/site-care.md']) assert.ok(existsSync(join(root, path)), path);
    assert.equal(siteManagerStatus(root).mode, preserve ? 'preserve' : 'redesign');
    assert.equal(siteManagerStatus(root).scheduleState, 'not-connected');
    assert.deepEqual(read(root, 'site-manager.json').schedule, { cadence: null, timezone: null });
    assert.equal(existsSync(join(root, '.github/workflows/deploy.yml')), false);
    assert.equal(read(root, 'agent/STATE.json').preview_ready, false);
    assert.equal(planKitUpgrade(root, harness).conflicts.length, 0);
  }
});

test('refresh follows current source while preserving handbook, task reference, memory and workflow progress', async () => {
  const root = temp();
  await createSite({ dir: root, slug: 'manager-refresh', blank: true });
  const before = siteManagerStatus(root).sourceRevision;
  writeFileSync(join(root, 'SITE-MANAGER.md'), '# Owner goals\nPreserve our booking journey.\n');
  const config = read(root, 'site-manager.json');
  config.schedule = { cadence: 'weekly', timezone: 'America/New_York' };
  save(join(root, 'site-manager.json'), config);
  const scheduler = { provider: 'operator-scheduler', taskId: 'existing-task' };
  save(join(root, 'agent/site-manager/schedule.json'), scheduler);
  save(join(root, 'agent/site-memory.json'), { decisions: [{ kind: 'preserve', summary: 'Keep accepted typography' }] });
  const state = text(root, 'agent/STATE.json'), memory = text(root, 'agent/site-memory.json');
  writeFileSync(join(root, 'pages/new-page.html'), '<h1>New route</h1>');
  const refreshed = prepareSiteManager(root, harness);
  assert.notEqual(refreshed.sourceRevision, before);
  assert.match(text(root, MANAGER_CONTEXT), /pages\/new-page.html/);
  assert.equal(text(root, 'SITE-MANAGER.md'), '# Owner goals\nPreserve our booking journey.\n');
  assert.deepEqual(read(root, 'site-manager.json'), config);
  assert.deepEqual(read(root, 'agent/site-manager/schedule.json'), scheduler);
  assert.equal(refreshed.scheduleState, 'recorded-unverified');
  assert.equal(text(root, 'agent/STATE.json'), state);
  assert.equal(text(root, 'agent/site-memory.json'), memory);
});

test('status and dry-run are read-only; adoption preserves existing agent instructions', () => {
  const root = temp();
  save(join(root, 'site.json'), { slug: 'existing-site' });
  save(join(root, 'launch.json'), { publicOrigin: 'https://live.example' });
  writeFileSync(join(root, 'AGENTS.md'), '# Authored instructions');
  writeFileSync(join(root, '.gitignore'), 'owner-private/\n');
  const before = files(root);
  assert.equal(manageSite('status', { site: root }).ok, true);
  assert.equal(manageSite('prepare', { site: root, dryRun: true }).ok, true);
  assert.deepEqual(files(root), before);
  assert.equal(manageSite('prepare', { site: root }).ok, true);
  assert.equal(text(root, 'AGENTS.md'), '# Authored instructions');
  assert.equal(text(root, '.gitignore'), 'owner-private/\nagent/site-manager/\nartifacts/site-manager/\n');
  prepareSiteManager(root, harness);
  assert.equal(text(root, '.gitignore'), 'owner-private/\nagent/site-manager/\nartifacts/site-manager/\n');
  assert.equal(manageSite('unknown', { site: root }).ok, false);
});

test('management distinguishes production records, live health and configured analytics without copying credentials', () => {
  const root = temp();
  save(join(root, 'site.json'), { slug: 'production-context' });
  save(join(root, 'launch.json'), { sourceUrl: 'https://harvest.example', publicOrigin: '', backendOrigin: 'https://backend.example',
    webAnalyticsToken: 'a'.repeat(32), forms: [{ id: 'contact', privateKey: 'fixture-private-value' }],
    scheduling: { enabled: true, apiOrigin: 'https://booking.example', privateKey: 'fixture-private-value' } });
  for (const [id, environment, issuedAt] of [['older', 'production', '2026-01-01'], ['newer', 'production', '2026-02-01'], ['preview', 'preview', '2026-03-01']]) {
    save(join(root, `agent/releases/${id}.json`), { deployment: { environment, issuedAt, url: `https://${id}.example` }, release: { sourceRevision: id, policyId: 'quick-publish-build-only-v1' } });
  }
  const status = prepareSiteManager(root, harness);
  assert.equal(status.productionOrigin, null);
  assert.equal(status.lastProductionRelease?.sourceRevision, 'newer');
  assert.equal(status.liveHealth, 'not-checked');
  assert.equal(status.analytics.firstParty, 'configured-unverified');
  assert.equal(status.analytics.dataAccess, 'not-checked');
  assert.equal(status.integrations.forms, 1);
  assert.doesNotMatch(text(root, MANAGER_CONTEXT), /fixture-private-value|harvest\.example/);
  const config = read(root, 'launch.json'); config.publicOrigin = 'https://user:pass@live.example';
  save(join(root, 'launch.json'), config);
  assert.equal(siteManagerStatus(root).productionOrigin, null);
});

test('customized skill conflicts before adoption writes and unknown config does not silently reset', () => {
  const root = temp();
  save(join(root, 'site.json'), { slug: 'conflict' }); save(join(root, 'launch.json'), {});
  prepareSiteManager(root, harness);
  writeFileSync(join(root, MANAGER_SKILL), '# Site-authored skill');
  const context = text(root, MANAGER_CONTEXT);
  assert.throws(() => prepareSiteManager(root, harness), /provenance is unknown/);
  assert.equal(text(root, MANAGER_CONTEXT), context);
  assert.equal(text(root, MANAGER_SKILL), '# Site-authored skill');
  save(join(root, 'site-manager.json'), { version: 99 });
  assert.equal(manageSite('prepare', { site: root }).ok, false);
  assert.equal(read(root, 'site-manager.json').version, 99);
});
