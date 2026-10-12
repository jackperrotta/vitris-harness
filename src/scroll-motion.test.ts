import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { prepareMotion } from './compile/scroll-motion.ts';
import { validateMotionPlan } from './agent/motion-plan.ts';
import { parseGraphYaml, initialState } from './agent/graph.ts';
import { prepareStage } from './agent/lifecycle.ts';
import { recordManagedKit, planKitUpgrade, applyKitUpgrade } from './upgrade/kit.ts';
import { buildCreativeContextPacket } from './agent/creative-context.ts';
import { createCreativeEfficiencyPolicy } from './agent/creative-efficiency.ts';
import { compileAllPages, compileSite, siteIslands } from './compile/site.ts';
import { motionAssetHref } from './runtime/scroll-motion.generated.ts';
import { temporalMotionFailures, MOTION_SCENARIO_HASH, type TemporalMotionEvidence } from './agent/browser-motion.ts';
import { canonicalMotionBody } from './agent/motion-comparison.ts';
import { expandPacketItem } from './agent/jev/packets.ts';

const kernel = resolve('.');
const config = { name: 'Test', scrollMotion: { version: 1 as const, policy: 'enabled' as const } };
test('fixed-layout motion comparisons exclude only bindings, and detect content/layout changes',()=>{
  const staticBody='<div class="choices"><p>Choose a useful scope</p></div>';
  const enhanced='<div class="choices" id="jack-home-motion-5" data-section="jack-home-motion-5" data-motion="stagger"><p data-motion-child>Choose a useful scope</p></div>';
  assert.equal(canonicalMotionBody(staticBody),canonicalMotionBody(enhanced));
  assert.notEqual(canonicalMotionBody(staticBody),canonicalMotionBody(enhanced.replace('useful','different')));
  assert.notEqual(canonicalMotionBody(staticBody),canonicalMotionBody(enhanced.replace('class="choices"','class="different-layout"')));
});
test('stale engine and scenario evidence cannot satisfy motion acceptance',()=>{
  const root=mkdtempSync(join(tmpdir(),'vitris-stale-motion-'));
  const evidence:TemporalMotionEvidence={path:'/',width:1080,motion:'normal',scenarioHash:MOTION_SCENARIO_HASH,engineAssetHash:'current',targets:[],failures:[]};
  assert.deepEqual(temporalMotionFailures(root,evidence,'current'),[]);
  assert.ok(temporalMotionFailures(root,evidence,'changed').length);
  assert.ok(temporalMotionFailures(root,{...evidence,scenarioHash:'old'},'current').length);
  assert.ok(temporalMotionFailures(root,{...evidence,targets:[{id:'proof',effect:'entrance',samples:[{state:'before',opacity:1,transform:'none',progress:null,screenshot:'missing.png',screenshotHash:'fake'}]}]},'current').some(f=>f.includes('missing')));
});
test('native and component authoring use one per-route asset and retain legacy precedence',()=>{
  const catalog={proof:{html:'<section><slot/></section>',css:'.proof{}',island:null}};
  const pages=[{path:'/',file:'index.html',title:'Motion',body:'<proof id="proof" data-motion="entrance"><h2>Proof</h2></proof>'},{path:'/quiet',file:'quiet.html',title:'Quiet',body:'<h1>Always visible</h1>'}];
  const compiled=compileAllPages(config,pages,catalog,'');
  assert.equal(compiled[0]!.motionTargets?.filter(t=>t.id==='proof').length,1);
  assert.equal(compiled[1]!.usesMotion,false);
  assert.doesNotMatch(compiled[0]!.bodyHtml,/data-reveal/);
  const files=compileSite({site:config,pages,catalog,kernelOrigin:'',themeHref:'/theme.css'});
  assert.ok(files[0]!.html.includes(motionAssetHref));assert.ok(!files[1]!.html.includes(motionAssetHref));
  const withBeacon=compileSite({site:config,pages,catalog,kernelOrigin:'https://kernel.invalid',themeHref:'/theme.css'})[0]!.html;
  assert.ok(withBeacon.indexOf('/beacon.js')<withBeacon.indexOf(motionAssetHref),'motion must not delay existing first-visit beacon UI');
  assert.doesNotMatch(siteIslands(compiled,catalog),/IntersectionObserver/);
  const legacy=compileAllPages({name:'Legacy',motion:{strength:'off'}},[{path:'/',file:'index.html',title:'Legacy',body:'<proof motion="editorial"><h2>Proof</h2></proof>'}],catalog,'');
  assert.equal(legacy[0]!.usesMotion,true,'legacy instance override still outranks default off');
  const off=compileAllPages({...config,scrollMotion:{version:1,policy:'off'}},pages,catalog,'');
  assert.equal(off[0]!.usesMotion,false);assert.doesNotMatch(off[0]!.bodyHtml,/data-motion|data-reveal/);
});
test('native targets validate IDs, trigger identity, safe numeric bounds and policy', () => {
  const result = prepareMotion('<figure id="proof"><img id="image" data-motion="drift" data-motion-trigger="proof" data-motion-distance="999"></figure>', config);
  assert.equal(result.usesMotion, true); assert.equal(result.targets[0]?.id, 'image'); assert.match(result.html, /distance="32"/);
  assert.throws(() => prepareMotion('<div id="x" data-motion="progress"></div>', config), /separate/);
  assert.throws(() => prepareMotion('<main id="x" data-motion="entrance"></main>', config), /page shell/);
  assert.throws(() => prepareMotion('<p id="x" data-motion="entrance"></p><p id="x"></p>', config), /unique/);
  assert.throws(() => prepareMotion('<p id="x" data-motion="entrance" data-motion-ease="alert(1)"></p>', config), /invalid ease/);
  const disabled = prepareMotion('<p id="x" data-motion="entrance" data-reveal></p>', { name: 'T', scrollMotion: { version: 1, policy: 'off' } });
  assert.equal(disabled.usesMotion, false); assert.doesNotMatch(disabled.html, /data-motion|data-reveal/);
  assert.deepEqual(validateMotionPlan(undefined), []);
});

test('ordinary stage preparation loads motion guidance and managed upgrades add it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vitris-motion-kit-'));
  mkdirSync(join(root, 'agent'), { recursive: true });
  cpSync(join(kernel, 'agent'), join(root, 'agent'), { recursive: true });
  writeFileSync(join(root, 'site.json'), JSON.stringify({ name: 'Motion workflow' }));
  const full = parseGraphYaml(readFileSync(join(kernel, 'agent/graph.yaml'), 'utf8'));
  for (const id of ['direction', 'storyboard', 'representative', 'browser', 'visual-review']) assert.ok(full.nodes.find(n => n.id === id)?.refs.includes('motion'), id);
  // Implementation consumes the accepted storyboard. Direction precedes it and
  // must not derive its instruction identity from this downstream artifact.
  const node = { ...full.nodes.find(n => n.id === 'representative')!, needs: [], inputs: [], optionalInputs: [], writes: ['pages', 'components'], refs: ['motion'] };
  mkdirSync(join(root,'onboarding'),{recursive:true});writeFileSync(join(root,'onboarding/storyboard.json'),JSON.stringify({pages:[],motionPlan:{version:1,purpose:'Supplied magnitude',quiet:[],scenes:[{effect:'count'}]}}));const graph = { ...full, nodes: [node] }, state = initialState(graph);
  const prepared = await prepareStage({ root, kernel, graph, state, nodeId: node.id });
  assert.equal(prepared.status, 'prepared');assert.match(readFileSync(join(root,'agent/CURRENT.md'),'utf8'),/canonical author text|Verified magnitude/);
  assert.match(readFileSync(join(root, 'agent/CURRENT.md'), 'utf8'), /Deliberate scroll motion|bounded|quiet intervals/);
  const upgradeRoot = mkdtempSync(join(tmpdir(), 'vitris-motion-upgrade-'));
  cpSync(join(kernel, 'agent'), join(upgradeRoot, 'agent'), { recursive: true });
  recordManagedKit(upgradeRoot, kernel);
  const { unlinkSync } = await import('node:fs');
  unlinkSync(join(upgradeRoot, 'agent/refs/motion.md'));
  const plan = planKitUpgrade(upgradeRoot, kernel);
  assert.ok(plan.additions.includes('refs/motion.md'));
  applyKitUpgrade(upgradeRoot, kernel, plan);
  assert.match(readFileSync(join(upgradeRoot, 'agent/refs/motion.md'), 'utf8'), /Deliberate scroll motion/);
});

test('creative preparation includes motion material or required hashed expansion', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vitris-motion-creative-'));
  cpSync(join(kernel, 'agent'), join(root, 'agent'), { recursive: true });
  writeFileSync(join(root, 'site.json'), JSON.stringify({ name: 'Motion workflow' }));
  writeFileSync(join(root, 'launch.json'), JSON.stringify({ designAuthoring:{mode:'composition-v1',lessonRelease:'2026-09-28.1'} }));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies:{'@vitris/harness':`file:${kernel.replaceAll('\\','/')}`} }));
  const policy = createCreativeEfficiencyPolicy(root, ['--creative-efficiency', '--jev-mode', 'off']);
  const result = await buildCreativeContextPacket({ root, kernel, node: { id: 'motion-plan', needs: [], tools: [], refs: [], writes: [], eval: '', maxAttempts: 1 }, role: 'plan', objective: 'Choose useful movement', sourceRevision: 'test', baseContract: 'Plan', policy, config: policy.config, evidence: { schemaVersion: 1, inputHash: 'test', nodes: [], edges: [], unresolvedAliases: [] }, retrievedIds: [], mandatorySkillIds: [], optionalSkillIds: ['motion-statistics'], constraints: [], obligations: [], findings: [], renderIds: [] });
  assert.ok((result.manifest.selectedSkillIds as string[]).includes('motion-direction'));
  assert.ok((result.manifest.effectiveSkillHandles as { id: string }[]).some(s => s.id === 'ref:motion'));
  assert.equal((result.manifest.authoringPolicy as {mode:string}).mode,'composition-v1');
  const expansions = (result.manifest.expandable || []).map(e => readFileSync(join(root, e.path), 'utf8')).join('\n');
  assert.match(result.prompt + expansions, /Deliberate scroll motion/);
  assert.ok(result.prompt.includes('Deliberate scroll motion') || (result.manifest.requiredExpansionIds as string[]).some(id => id.includes('skill')));
  const countExpansion=result.manifest.expandable.find(e=>e.id==='skill-motion-count')!;assert.ok(countExpansion);assert.match(expandPacketItem(root,'motion-plan',countExpansion.id,result.manifest.manifestHash),/Verified magnitude/);const motionExpansion=result.manifest.expandable.find(e=>e.id==='skill-motion')!;
  assert.ok((result.manifest.requiredExpansionIds as string[]).includes(motionExpansion.id));
  assert.match(expandPacketItem(root,'motion-plan',motionExpansion.id,result.manifest.manifestHash),/Deliberate scroll motion/);
});
