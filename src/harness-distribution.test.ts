import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createSite } from './cli/site-create.ts';
import { migrateSite } from './cli/site-migrate.ts';
import { resolveHarnessRoot } from './agent/design-calibration.ts';
import { buildVerified } from './build/verified.ts';
import { backendOrigin } from './worker/env.ts';
import { build as bundle } from 'esbuild';
import { spawnSync } from 'node:child_process';

const temp = () => mkdtempSync(join(tmpdir(), 'vitris-distribution-'));
const read = (root: string, path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const save = (root: string, path: string, data: unknown) => { mkdirSync(resolve(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), JSON.stringify(data)); };

test('packaged catalog initializes without workstation asset archives and defers unavailable bytes until requested',async()=>{
 const out=temp(),script=join(out,'metadata-smoke.mjs');
 await bundle({stdin:{contents:"import {THEME_ASSETS,assetBytes} from './src/agent/theme-assets.ts'; let unavailable='';try{assetBytes(THEME_ASSETS.assets[0]);}catch(e){unavailable=e.message;}console.log(JSON.stringify({count:THEME_ASSETS.assets.length,unavailable}));",resolveDir:resolve(import.meta.dirname,'..')},outfile:script,bundle:true,platform:'node',format:'esm'});
 const r=spawnSync(process.execPath,[script],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);assert.ok(result.count>0);assert.match(result.unavailable,/hosted in Cloudflare|Missing theme asset/);
});

test('new starter pins the harness version, escapes business names, and starts with fresh runtime state', async () => {
  const site = temp(), name = 'Sam\'s "Workshop" \\ Studio';
  assert.equal((await createSite({ dir: site, slug: 'workshop', name, blank: true, backendOrigin: 'https://backend.example/' })).ok, true);
  const pkg = read(site, 'package.json');
  assert.equal(pkg.dependencies['@vitris/harness'], read(resolve(import.meta.dirname, '..'), 'package.json').version);
  assert.equal(pkg.dependencies['@vitris/kernel'], undefined);
  assert.equal(read(site, 'site.json').name, name);
  assert.equal(read(site, 'launch.json').backendOrigin, 'https://backend.example');
  assert.equal(read(site, 'launch.json').kernelOrigin, undefined);
  assert.equal(read(site, 'agent/STATE.json').nodes.harvest.status, 'done');
  assert.equal(existsSync(join(site, 'agent/CURRENT.md')), false);
  assert.equal(existsSync(join(site, 'agent/runs')), false);
  assert.match(readFileSync(join(site, '.gitignore'), 'utf8'), /node_modules\//);
  assert.equal(existsSync(join(site, 'gitignore')), false);
});

test('legacy create options remain usable and local dependencies are explicit', async () => {
  const site = temp();
  await createSite({ dir: site, slug: 'legacy', from: 'https://old.example', kernelOrigin: 'https://legacy.example', kernelSpec: 'file:../harness' });
  assert.equal(read(site, 'package.json').dependencies['@vitris/harness'], 'file:../harness');
  assert.equal(read(site, 'launch.json').backendOrigin, 'https://legacy.example');
  assert.notEqual(read(site, 'agent/STATE.json').nodes.harvest.status, 'done');
});
test('a fresh customer opts into shared choreography without inheriting portfolio content', async()=>{
 const site=temp();await createSite({dir:site,slug:'motion-fixture',name:'Studio Example',blank:true});
 assert.match(readFileSync(join(site,'agent/refs/template-motion.md'),'utf8'),/paired WebM clips/);
 writeFileSync(join(site,'pages/index.html'),'---\ntitle: Work — Studio Example\n---\n<h1>Studio Example</h1><div data-island="experience"><a href="#work" data-experience-magnetic>Explore</a></div>');
 await buildVerified(site);
 const opted=readFileSync(join(site,'dist/index.html'),'utf8');
 assert.match(opted,/<title>Work — Studio Example<\/title>/);
 assert.match(readFileSync(join(site,'dist/islands.js'),'utf8'),/VitrisExperience/);assert.match(opted,/data-experience-magnetic/);assert.doesNotMatch(opted,/jack@tryvitris|Jack Perrotta|Hydroponic gardening/);
 writeFileSync(join(site,'pages/index.html'),'<h1>Studio Example</h1><a href="#work">Explore</a>');await buildVerified(site);
 assert.equal(existsSync(join(site,'dist/islands.js')),false);
});

test('migration previews without edits, backs up configuration, preserves content and state, and is idempotent', async () => {
  const site = temp();
  await createSite({ dir: site, slug: 'migrate', blank: true });
  save(site, 'package.json', { name: 'migrate', private: true, scripts: { go: 'node ./node_modules/@vitris/kernel/bin/vitris-go.js', build: 'node --experimental-strip-types ./node_modules/@vitris/kernel/src/build/cli.ts --site . --out dist --slug migrate', custom: 'echo custom' }, dependencies: { '@vitris/kernel': 'file:../source', unrelated: '1.0.0' } });
  save(site, 'launch.json', { kernelOrigin: 'https://existing.example', slug: 'migrate', ownerEmail: 'owner@example.com' });
  save(site, 'package-lock.json', { original: true });
  writeFileSync(join(site, 'pages/index.html'), '<h1>Customer content</h1>');
  const before = readFileSync(join(site, 'package.json'), 'utf8'), state = readFileSync(join(site, 'agent/STATE.json'), 'utf8');
  assert.ok(migrateSite({ site }).files.includes('package.json'));
  assert.equal(readFileSync(join(site, 'package.json'), 'utf8'), before);
  const result = migrateSite({ site, apply: true });
  assert.equal(readFileSync(join(result.backup!, 'package.json'), 'utf8'), before);
  assert.equal(read(site, 'package.json').dependencies['@vitris/harness'], 'file:../source');
  assert.equal(read(site, 'package.json').scripts.custom, 'echo custom');
  assert.match(read(site, 'package.json').scripts['refresh-agent'], /vitris-refresh\.js/);
  assert.equal(read(site, 'package.json').scripts.go, 'node ./node_modules/@vitris/harness/bin/vitris-go.js');
  assert.equal(read(site, 'package.json').scripts.build, 'node ./node_modules/@vitris/harness/bin/vitris-build.js --site . --out dist --slug migrate');
  assert.equal(read(site, 'launch.json').backendOrigin, 'https://existing.example');
  assert.equal(readFileSync(join(site, 'agent/STATE.json'), 'utf8'), state);
  assert.equal(readFileSync(join(site, 'pages/index.html'), 'utf8'), '<h1>Customer content</h1>');
  assert.deepEqual(read(site, 'package-lock.json'), { original: true });
  assert.deepEqual(migrateSite({ site, apply: true }).files, []);
});

test('migration refuses conflicting configuration and active workflows before writing', async () => {
  const site = temp(); await createSite({ dir: site, slug: 'conflict', blank: true });
  save(site, 'launch.json', { backendOrigin: 'https://new.example', kernelOrigin: 'https://old.example' });
  const before = readFileSync(join(site, 'package.json'), 'utf8');
  assert.throws(() => migrateSite({ site, apply: true }), /Conflicting/);
  assert.equal(readFileSync(join(site, 'package.json'), 'utf8'), before);
  save(site, 'agent/RUN.lock', { pid: process.pid });
  assert.throws(() => migrateSite({ site }), /Stop the active workflow/);
});

test('package discovery accepts both installed names and prefers the new one', () => {
  const root = temp();
  for (const name of ['kernel', 'harness']) {
    const installed = join(root, 'node_modules/@vitris', name);
    save(installed, 'package.json', { name: `@vitris/${name}` });
    save(installed, 'design-system/calibration/v1/manifest.json', {});
  }
  const previous = [process.env.VITRIS_HARNESS, process.env.VITRIS_KERNEL];
  delete process.env.VITRIS_HARNESS; delete process.env.VITRIS_KERNEL;
  try { assert.equal(resolveHarnessRoot(root), join(root, 'node_modules/@vitris/harness')); }
  finally { for (const [i, key] of ['VITRIS_HARNESS', 'VITRIS_KERNEL'].entries()) { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; } }
});

test('new backend configuration reaches compiled forms and the beacon while legacy settings remain supported', async () => {
  const site = temp(); await createSite({ dir: site, slug: 'backend', blank: true, backendOrigin: 'https://backend.example' });
  writeFileSync(join(site, 'pages/index.html'), '<h1>Contact</h1><form data-lead-form><input name="email"></form>');
  await buildVerified(site, join(site, 'dist'));
  const html = readFileSync(join(site, 'dist/index.html'), 'utf8');
  assert.match(html, /https:\/\/backend.example\/api\/leads/);
  assert.match(html, /data-backend="https:\/\/backend.example"/);
  assert.equal(backendOrigin({ VITRIS_BACKEND_ORIGIN: 'https://new.example', KERNEL_ORIGIN: 'https://old.example' } as any), 'https://new.example');
  assert.equal(backendOrigin({ KERNEL_ORIGIN: 'https://old.example' } as any), 'https://old.example');
});

test('the compiler arms before-paint arrival only for an explicitly opted-in experience page',async()=>{
 const site=temp();await createSite({dir:site,slug:'arrival',blank:true});
 writeFileSync(join(site,'pages/index.html'),'<h1>Readable home</h1><div data-island="experience"></div>');await buildVerified(site,join(site,'dist'));assert.doesNotMatch(readFileSync(join(site,'dist/index.html'),'utf8'),/window.VitrisExperienceArrival/);
 writeFileSync(join(site,'pages/index.html'),'<h1>Readable home</h1><div data-island="experience" data-experience-transition data-experience-arrival="Hello." data-experience-pause-key="saved-site-pause">Hello.</div>');await buildVerified(site,join(site,'dist'));const html=readFileSync(join(site,'dist/index.html'),'utf8');assert.match(html,/localStorage.getItem\("saved-site-pause"\)/);assert.ok(html.indexOf('window.VitrisExperienceArrival')<html.indexOf('<body>'));assert.match(readFileSync(join(site,'dist/islands.js'),'utf8'),/arrival-hold/);
});
