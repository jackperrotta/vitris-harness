import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { save, fingerprint } from './agent/artifacts.ts';
import { selectionDraft, submitSelection, currentSelectionHash } from './agent/theme-selection.ts';
import { ADAPTATION_PATH, TEMPLATE_DECISIONS_PATH, templateAdaptationFailures, templateProposalHash, assertTemplateImageAuthorization, submitTemplateDecision, applyTemplateAdaptationGraph, type TemplateAdaptation } from './agent/template-adaptation.ts';
import { TEMPLATE_MOTION_PATH } from './agent/template-motion.ts';
import type { SkillGraph } from './agent/graph.ts';
import { extractPage } from './onboard/extract.ts';
import { solidPng } from './agent/design-calibration.ts';

function fixture() {
  const root=mkdtempSync(join(tmpdir(),'vitris-adaptation-'));
  save(join(root,'launch.json'),{slug:'adaptation',themeSelection:{version:1,enabled:true}});
  save(join(root,'onboarding/brief.json'),{business:{name:'Adaptation'},images:[]});
  const selection=selectionDraft(root,'swiss-index','','user-chat');
  selection.adaptation={version:1,sections:'preserve-ask',aiImages:'ask-each',priorities:'Preserve the full rhythm and media'};
  submitSelection(root,selection);
  save(join(root,'onboarding/reference-capture.json'),{inspected:true});
  const brief:TemplateAdaptation={version:1,selectionHash:currentSelectionHash(root)!,reference:{url:'https://example.com/reference',evidence:['onboarding/reference-capture.json']},qualities:[{id:'rhythm',relationship:'Image-led opening and dense work browsing',implementation:'hero followed by work list'}],sections:[{id:'work',referenceSection:'Selected work',route:'/',targetId:'selected-work',disposition:'retain',content:'placeholder',nextStep:'Add project details or ask the owner before removing'}],images:[{id:'concept',purpose:'Work cover',treatment:'Abstract glass sculpture',identity:'Conceptual illustration; no project claim',status:'proposed'}]};
  save(join(root,ADAPTATION_PATH),brief);
  return {root,brief};
}
test('downstream motion plans do not reopen reference, direction or content planning',()=>{
 const {root}=fixture();
 const graph={version:3,stop_at:'preview',nodes:['reference-analysis','direction','storyboard','copy','representative','pages','browser','visual-review'].map(id=>({id,needs:[],inputs:[],writes:[],refs:[],tools:[],eval:id,maxAttempts:4,kind:'agent'}))} as SkillGraph;
 applyTemplateAdaptationGraph(root,graph);
 for(const id of ['reference-analysis','direction','storyboard','copy'])assert.ok(!graph.nodes.find(n=>n.id===id)!.optionalInputs?.includes(TEMPLATE_MOTION_PATH));
 for(const id of ['representative','pages'])assert.ok(graph.nodes.find(n=>n.id===id)!.writes.includes(TEMPLATE_MOTION_PATH));
 assert.ok(graph.nodes.find(n=>n.id==='visual-review')!.optionalInputs?.includes(TEMPLATE_MOTION_PATH));
});
test('preserved gaps remain in local preview and block launch; rendered omissions fail',()=>{
  const {root}=fixture();
  assert.deepEqual(templateAdaptationFailures(root,'direction'),[]);
  mkdirSync(join(root,'dist'));
  writeFileSync(join(root,'dist/index.html'),'<section id="selected-work" data-content-gap="work"><p>Add project details</p></section>');
  assert.deepEqual(templateAdaptationFailures(root,'representative'),[]);
  assert.match(templateAdaptationFailures(root,'launch').join('\n'),/Resolve template content gap/);
  writeFileSync(join(root,'dist/index.html'),'<main>Plain introduction</main>');
  assert.match(templateAdaptationFailures(root,'representative').join('\n'),/Retained template section missing/);
  writeFileSync(join(root,'dist/index.html'),'<div data-id="selected-work"></div><div data-content-gap="work">Fill in</div>');
  assert.match(templateAdaptationFailures(root,'representative').join('\n'),/Retained template section missing/);
  writeFileSync(join(root,'dist/index.html'),'<section id="selected-work"></section><div data-content-gap="work">Fill in</div>');
  assert.match(templateAdaptationFailures(root,'representative').join('\n'),/located content gap/);
  writeFileSync(join(root,'dist/index.html'),'<section id="selected-work" data-content-gap="work">Fill in</section><section id="selected-work"></section>');
  assert.match(templateAdaptationFailures(root,'representative').join('\n'),/duplicated/);
});
test('each removal and image treatment requires an exact, current human decision',()=>{
  const {root,brief}=fixture();
  brief.sections[0]!.disposition='remove';brief.images[0]!.status='approved';
  save(join(root,ADAPTATION_PATH),brief);
  assert.equal(templateAdaptationFailures(root,'direction').length,2);
  save(join(root,TEMPLATE_DECISIONS_PATH),{version:1,selectionHash:currentSelectionHash(root),decisions:[{kind:'remove-section',id:'work',proposalHash:templateProposalHash(brief.sections[0]!),source:'user-chat',instruction:'Remove this work section'}, {kind:'generate-image',id:'concept',proposalHash:templateProposalHash(brief.images[0]!),source:'user-chat',instruction:'Approve this conceptual image'}]});
  assert.deepEqual(templateAdaptationFailures(root,'direction'),[]);
  brief.images[0]!.treatment='Invent a photograph of a completed client project';
  save(join(root,ADAPTATION_PATH),brief);
  assert.match(templateAdaptationFailures(root,'direction').join('\n'),/Image lacks approval/);
  brief.images[0]!.treatment='Abstract glass sculpture';brief.selectionHash='stale';save(join(root,ADAPTATION_PATH),brief);
  assert.match(templateAdaptationFailures(root,'direction').join('\n'),/stale/);
});
test('missing adaptation brief fails instead of silently reducing the template',()=>{
  const {root}=fixture();
  save(join(root,ADAPTATION_PATH),null);
  assert.match(templateAdaptationFailures(root,'direction').join('\n'),/Missing template adaptation brief/);
});
test('production authorization consumes exact human decisions, preserves retries, and rejects treatment changes',()=>{
 const {root,brief}=fixture();
 assert.throws(()=>assertTemplateImageAuthorization(root,'concept'),/Ask the user/);
 const decision={kind:'generate-image' as const,id:'concept',proposalHash:templateProposalHash(brief.images[0]!),source:'user-chat' as const,instruction:'Synthetic test owner approves the glass illustration'};
 submitTemplateDecision(root,decision);submitTemplateDecision(root,decision);
 assert.doesNotThrow(()=>assertTemplateImageAuthorization(root,'concept'));
 brief.images[0]!.identity='Pretend completed customer project';save(join(root,ADAPTATION_PATH),brief);
 assert.throws(()=>assertTemplateImageAuthorization(root,'concept'),/Ask the user/);
 assert.throws(()=>submitTemplateDecision(root,decision),/exact current proposal/);
 brief.images[0]!.identity='Conceptual illustration; no project claim';brief.selectionHash='stale';save(join(root,ADAPTATION_PATH),brief);
 assert.throws(()=>assertTemplateImageAuthorization(root,'concept'),/Ask the user/);
});
test('fidelity review requires current located reference/build comparisons, not a bare pass',()=>{
 const {root,brief}=fixture();mkdirSync(join(root,'dist'));writeFileSync(join(root,'dist/index.html'),'<section id="selected-work" data-content-gap="work">Fill in</section>');
 save(join(root,'agent/reviews/representative-review.json'),{verdict:'pass'});
 assert.match(templateAdaptationFailures(root,'representative-review').join('\n'),/fidelity comparison missing/);
 writeFileSync(join(root,'onboarding/reference.png'),solidPng(25,35,45));
 mkdirSync(join(root,'agent/screenshots'),{recursive:true});writeFileSync(join(root,'agent/screenshots/representative.png'),solidPng(65,75,85));
 brief.reference.evidence.push('onboarding/reference.png');save(join(root,ADAPTATION_PATH),brief);
 const referenceHash=fingerprint(root,['onboarding/reference.png']),implementedHash=fingerprint(root,['agent/screenshots/representative.png']);
 save(join(root,'agent/reviews/representative-browser.json'),{distHash:fingerprint(root,['dist']),checks:[{screenshot:'agent/screenshots/representative.png',screenshotHash:implementedHash,failures:[]}]});
 const review={templateFidelity:{selectionHash:currentSelectionHash(root),distHash:fingerprint(root,['dist']),qualities:[{id:'rhythm',referenceEvidence:'onboarding/reference.png',referenceHash,implementedEvidence:'agent/screenshots/representative.png',implementedHash,observation:'Synthetic test comparison locates the retained work area after the introduction',verdict:'pass'}]}};
 save(join(root,'agent/reviews/representative-review.json'),review);assert.deepEqual(templateAdaptationFailures(root,'representative-review'),[]);
 writeFileSync(join(root,'agent/screenshots/representative.png'),solidPng(1,2,3));
 assert.match(templateAdaptationFailures(root,'representative-review').join('\n'),/reference\/build comparison/);
 writeFileSync(join(root,'agent/screenshots/representative.png'),solidPng(65,75,85));
 review.templateFidelity.qualities[0]!.implementedEvidence='dist/index.html';
 save(join(root,'agent/reviews/representative-review.json'),review);
 assert.match(templateAdaptationFailures(root,'representative-review').join('\n'),/reference\/build comparison/);
 review.templateFidelity.qualities[0]!.implementedEvidence='agent/screenshots/representative.png';save(join(root,'agent/reviews/representative-review.json'),review);
 writeFileSync(join(root,'dist/index.html'),'<main>Reduced to a plain introduction</main>');assert.match(templateAdaptationFailures(root,'representative-review').join('\n'),/stale/);
 review.templateFidelity.distHash=fingerprint(root,['dist']);review.templateFidelity.qualities[0]!.referenceEvidence='dist/index.html';save(join(root,'agent/reviews/representative-review.json'),review);
 assert.match(templateAdaptationFailures(root,'representative-review').join('\n'),/reference\/build comparison/);
});
test('harvest preserves div-based biography once, in order, without controls or chrome',()=>{
  const bio='My goal is to continue studying data structures and distributed ledgers, as they relate to web technology evolution.';
  const page=extractPage(`<html><nav><div>${bio}</div></nav><main><p>Opening semantic paragraph.</p><div class="wrapper"><div><span>${bio}</span></div></div><div><p>Already a semantic paragraph.</p></div><div><button>${bio}</button></div><div hidden>${bio}</div></main></html>`,'https://example.com/');
  assert.deepEqual(page.paragraphs,['Opening semantic paragraph.',bio,'Already a semantic paragraph.']);
});
