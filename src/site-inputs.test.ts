import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createSite } from './cli/site-create.ts';
import { runSite } from './cli/run.ts';
import { runCli } from './cli/index.ts';
import { initialState, type SkillGraph } from './agent/graph.ts';
import { prepareStage, cancelStage } from './agent/lifecycle.ts';
import { inputHash, contextPacket, reconcile } from './agent/runner.ts';
import { findActivePreparation } from './agent/preparation.ts';
import { save } from './agent/artifacts.ts';
import { currentSelectionHash, selectedThemeContext, selectionDraft, selectionStore, submitSelection } from './agent/theme-selection.ts';
import { adaptationQuestions, inventoryFailures } from './agent/adaptation-checkpoint.ts';
import { templateAdaptationGuidance, assertTemplateImageAuthorization } from './agent/template-adaptation.ts';
import { CLOUD_CATALOG } from './agent/theme-cloud.ts';
import { catalogEntryHash } from './agent/template-catalog.ts';
import { ADDITIONAL_CONTENT_PATH, acceptTemplateInput, persistSiteInputs, resolveSiteInputs, resolveSiteInputsLive } from './agent/site-inputs.ts';
import { applyTemplateAdaptationGraph } from './agent/template-adaptation.ts';
import { resolveDesignAuthoring } from './agent/composition-authoring.ts';
import { gatherBlankOnboard, persistOnboard } from '../scripts/onboard/run.ts';

const kernel = resolve(import.meta.dirname, '..');
const read = (root: string, path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const rootDir = () => join(mkdtempSync(join(tmpdir(), 'vitris-direct-input-')), 'site');
const content = '  Owner-supplied fixture text.\nWeekend hours: 10–4.\nKeep this exact wording. 🌿\n';

test('live catalog selection is pinned for later stages and detects changed pinned evidence', async () => {
  const entry = structuredClone(CLOUD_CATALOG.entries[0]!);
  entry.theme.id = 'synthetic-new-template'; entry.theme.name = 'Synthetic New Template';
  entry.theme.release = '2099-01-01.1';
  const catalog = { ...CLOUD_CATALOG, entries: [entry], history: [] };
  const inputs = await resolveSiteInputsLive({ template: entry.theme.name }, async () => new Response(JSON.stringify(catalog)));
  assert.equal(inputs.template?.id, entry.theme.id);
  const root = rootDir(); await createSite({ dir: root, slug: 'live-catalog-fixture', blank: true });
  persistSiteInputs(root, inputs);
  const gathered = await gatherBlankOnboard({ slug: 'live-catalog-fixture', name: 'Fixture', noPrompt: true });
  persistOnboard(root, gathered.brief, { pages: gathered.pages, copyMarkdown: gathered.copyMarkdown });
  acceptTemplateInput(root);
  assert.equal(selectionStore(root)?.current.themeId, entry.theme.id);
  assert.match(selectedThemeContext(root), new RegExp(entry.revision));
  const record = read(root, 'agent/template-input.json'); record.catalogEntry.theme.name = 'Changed after selection';
  save(join(root, 'agent/template-input.json'), record);
  assert.throws(() => acceptTemplateInput(root), /catalog entry has changed/);
  record.catalogHash = catalogEntryHash(record.catalogEntry); save(join(root, 'agent/template-input.json'), record);
  assert.throws(() => selectedThemeContext(root), /Pinned template revision changed/);
});

test('catalog fallback uses bundled data when the live service is unavailable', async () => {
  const original = console.warn; const warnings: string[] = [];
  console.warn = (...items) => warnings.push(items.join(' '));
  try {
    const result = await resolveSiteInputsLive({ template: 'Still & Field' }, async () => { throw Error('offline'); });
    assert.equal(result.template?.id, 'real-estate-still-field');
    assert.match(warnings.join('\n'), /bundled snapshot.*stale/);
  } finally { console.warn = original; }
});
function graph(): SkillGraph {
  return { version: 3, stop_at: 'reference-analysis', nodes: ['harvest', 'media', 'reference-analysis'].map(id => ({
    id, kind: 'agent', eval: id, needs: [], refs: [], tools: [], inputs: [], writes: [], maxAttempts: 3,
  })) };
}

test('source URL, direct template, and supplied content prepare reference work without a picker or policy pause', async () => {
  const root = rootDir();
  const created = await createSite({ dir: root, slug: 'input-fixture', from: 'https://example.com/', template: 'Still & Field', content });
  assert.equal(created.ok, true, created.error);
  assert.equal(resolveDesignAuthoring(root).mode, 'theme-v1');
  assert.equal(existsSync(join(root, 'blocks')), false);
  assert.equal(read(root, 'launch.json').sourceUrl, 'https://example.com/');
  assert.equal(read(root, 'agent/template-input.json').id, 'real-estate-still-field');
  assert.equal(selectionStore(root), undefined); // Wait for captured branding.
  const gathered = await gatherBlankOnboard({ slug: 'input-fixture', name: 'Fixture', noPrompt: true });
  persistOnboard(root, gathered.brief, { pages: gathered.pages, copyMarkdown: gathered.copyMarkdown });
  assert.equal(readFileSync(join(root, ADDITIONAL_CONTENT_PATH), 'utf8'), content);
  save(join(root, 'onboarding/brief.json'), { business: { name: 'Fixture' }, images: [], visual: { hints: { brandColors: [{ value: '#123456', source: 'synthetic capture' }] } } });
  const g = graph(), state = initialState(g);
  state.nodes.harvest!.status = state.nodes.media!.status = 'done';
  const result = await prepareStage({ root, kernel, graph: g, state, nodeId: 'reference-analysis' });
  try {
    assert.equal(result.status, 'prepared');
    assert.equal(existsSync(join(root, 'onboarding/theme-picker.html')), false);
    assert.equal(existsSync(join(root, 'agent/template-responses.json')), false);
    assert.equal(read(root, 'onboarding/theme-brand.json').colors[0].value, '#123456');
    assert.equal(selectionStore(root)!.current.adaptation!.checkpoints, 'automatic');
    assert.equal(selectionStore(root)!.current.adaptation!.aiImages, 'no-ai');
    assert.match(readFileSync(join(root, 'agent/CURRENT.md'), 'utf8'), /Supplied business content/);
    assert.match(readFileSync(join(root, 'agent/CURRENT.md'), 'utf8'), /theme-v1/);
    assert.match(templateAdaptationGuidance(root), /continue automatically through local preview/);
    assert.deepEqual(adaptationQuestions(root, 'copy-expansion'), []);
    assert.match(inventoryFailures(root).join('\n'), /inventory/); // Gates still require real reference evidence.
    save(join(root, 'onboarding/template-adaptation.json'), { version: 1, selectionHash: currentSelectionHash(root), sections: [{ id: 'gap', disposition: 'retain', content: 'placeholder', nextStep: 'Missing fixture text' }], images: [] });
    assert.deepEqual(adaptationQuestions(root, 'direction'), []);
    assert.throws(() => assertTemplateImageAuthorization(root, 'image'), /prohibits AI/);
    const hash = currentSelectionHash(root);
    acceptTemplateInput(root);
    assert.equal(currentSelectionHash(root), hash);
  } finally {
    if (result.preparation) await cancelStage({ root, preparationId: result.preparation.id, reason: 'Fixture finished' });
  }
});

test('content participates in business/direction packet dependencies without changing harvest inputs', async () => {
  const root = rootDir();
  await createSite({ dir: root, slug: 'content-fixture', blank: true });
  const g = graph();
  const harvest = inputHash(root, g.nodes[0]!), before = inputHash(root, g.nodes[2]!);
  persistSiteInputs(root, resolveSiteInputs({ content }));
  applyTemplateAdaptationGraph(root, g);
  assert.equal(inputHash(root, g.nodes[0]!), harvest);
  assert.notEqual(inputHash(root, g.nodes[2]!), before);
  assert.match(contextPacket(root, g, initialState(g), g.nodes[2]!), /Read onboarding\/additional-content.md in full/);
  const accepted = inputHash(root, g.nodes[2]!);
  persistSiteInputs(root, resolveSiteInputs({ content: 'Updated owner fixture text.' }));
  assert.notEqual(inputHash(root, g.nodes[2]!), accepted);
});

test('direct requests are idempotent, revised templates retain history, and a later chat choice is respected', async () => {
  const root = rootDir();
  await createSite({ dir: root, slug: 'history-fixture', blank: true, template: 'Still & Field' });
  acceptTemplateInput(root);
  const first = currentSelectionHash(root);
  persistSiteInputs(root, resolveSiteInputs({ template: 'Still & Field' }));
  acceptTemplateInput(root);
  assert.equal(currentSelectionHash(root), first);
  persistSiteInputs(root, resolveSiteInputs({ template: 'Fresh Routine' }));
  const g = graph(), state = initialState(g);
  state.nodes.harvest!.status = state.nodes.media!.status = state.nodes['reference-analysis']!.status = 'done';
  state.nodes['reference-analysis']!.themeSelectionHash = first;
  reconcile(root, g, state);
  assert.equal(selectionStore(root)!.current.themeId, 'fresh-routine');
  assert.equal(state.nodes['reference-analysis']!.status, 'pending');
  assert.equal(selectionStore(root)!.history.length, 1);
  const later = selectionDraft(root, 'Literary Essay', 'Synthetic later explicit choice', 'test-simulation');
  submitSelection(root, later);
  acceptTemplateInput(root);
  assert.equal(selectionStore(root)!.current.themeId, 'literary-essay');
  persistSiteInputs(root, resolveSiteInputs({ template: 'Fresh Routine' }));
  acceptTemplateInput(root);
  assert.equal(selectionStore(root)!.current.themeId, 'fresh-routine');
});

test('catalog demo/preview URLs resolve the pinned revision and reject unrelated URLs', () => {
  const e = CLOUD_CATALOG.entries[0]!;
  const demo = e.base + `/templates/demo/${e.revision}/${e.theme.id}` + e.pages[1]!.path;
  const resolved = resolveSiteInputs({ template: demo + '?b=example#section' }).template!;
  assert.equal(resolved.id, e.theme.id); assert.equal(resolved.release, e.theme.release);
  assert.equal(resolveSiteInputs({ template: e.base + `/templates/preview/${e.revision}/${e.theme.id}/home/desktop/hash` }).template!.id, e.theme.id);
  assert.throws(() => resolveSiteInputs({ template: 'https://example.com/' }), /Unknown hosted/);
  assert.throws(() => resolveSiteInputs({ template: demo, templateRelease: '2026-10-08.1' }), /different revisions/);
});

test('invalid input and dry runs leave the destination untouched; preserve mode rejects redesign inputs', async () => {
  const root = rootDir();
  for (const opts of [{ template: 'not-a-real-template' }, { content, contentFile: 'missing.md' }, { content: ' ' }, { templateRelease: '2026-10-08.1' }]) {
    assert.equal((await createSite({ dir: root, slug: 'invalid', blank: true, ...opts })).ok, false);
    assert.equal(existsSync(root), false);
  }
  assert.equal((await createSite({ dir: root, slug: 'dry', template: 'Still & Field', content, dryRun: true })).ok, true);
  assert.equal(existsSync(root), false);
  assert.equal((await createSite({ dir: root, slug: 'preserve', mode: 'preserve', from: 'https://example.com/', template: 'Still & Field' })).ok, false);
  assert.equal(existsSync(root), false);
});

test('unified and legacy creation CLIs accept file content; vitris run and npm go accept direct input', async () => {
  const root = rootDir(), file = join(root, '..', 'notes.txt');
  writeFileSync(file, content);
  assert.equal(await runCli(['site', 'create', '--dir', root, '--slug', 'cli-fixture', '--blank', '--template', 'Still & Field', '--content-file', file, '--json']), 0);
  assert.equal(readFileSync(join(root, ADDITIONAL_CONTENT_PATH), 'utf8'), content);
  const noMutation = readFileSync(join(root, 'launch.json'), 'utf8');
  assert.equal((await runSite({ site: root, template: 'Fresh Routine', dryRun: true })).ok, true);
  assert.equal(readFileSync(join(root, 'launch.json'), 'utf8'), noMutation);
  assert.equal(await runCli(['run', '--site', root, '--template', 'Fresh Routine', '--content', 'New fixture content.', '--json', '--no-jev']), 0);
  assert.equal(read(root, 'agent/template-input.json').id, 'fresh-routine');
  assert.equal(readFileSync(join(root, ADDITIONAL_CONTENT_PATH), 'utf8'), 'New fixture content.');
  // The run prepared business; changing inputs must reject while that lease is held.
  const prepared = findActivePreparation(root, 'business')!;
  assert.throws(() => persistSiteInputs(root, resolveSiteInputs({ content: 'Changed during lease' })), /Finish or cancel/);
  await cancelStage({ root, preparationId: prepared.id, reason: 'Fixture lease cleanup' });
  const go = spawnSync(process.execPath, ['--experimental-strip-types', join(kernel, 'scripts/workflow.ts'), '--site', root, '--template', 'Literary Essay', '--content-file', file, '--prepare', '--no-jev'], { encoding: 'utf8' });
  assert.equal(go.status, 0, go.stdout + go.stderr);
  assert.equal(read(root, 'agent/template-input.json').id, 'literary-essay');
  await cancelStage({ root, preparationId: findActivePreparation(root, 'business')!.id, reason: 'Fixture go cleanup' });
  const legacy = rootDir();
  const scaffold = spawnSync(process.execPath, ['--experimental-strip-types', join(kernel, 'scripts/create-site.ts'), '--dir', legacy, '--slug', 'legacy-fixture', '--from', 'https://example.com/', '--template', 'Still & Field', '--content-file', file, '--no-prompt'], { encoding: 'utf8' });
  assert.equal(scaffold.status, 0, scaffold.stdout + scaffold.stderr);
  assert.equal(readFileSync(join(legacy, ADDITIONAL_CONTENT_PATH), 'utf8'), content);
});
