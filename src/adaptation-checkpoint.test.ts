import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createSite } from './cli/site-create.ts';
import { save, fingerprint } from './agent/artifacts.ts';
import { initialState, type SkillGraph } from './agent/graph.ts';
import { prepareStage, cancelStage } from './agent/lifecycle.ts';
import { hasActiveStageLease } from './agent/preparation.ts';
import { selectionDraft, submitSelection, currentSelectionHash } from './agent/theme-selection.ts';
import { visualTheme, digest } from './agent/theme-library.ts';
import { manifestPages } from './agent/theme-preview.ts';
import { adaptationPreferences, ADAPTATION_PATH, templateProposalHash, assertTemplateImageAuthorization, templateAdaptationFailures, type TemplateAdaptation } from './agent/template-adaptation.ts';
import { applyCheckpointGraph, adaptationQuestions, awaitAdaptation, submitAdaptationResponse, inventoryFailures, contentRefinementQueue, INVENTORY_PATH, INVENTORY_REVIEW, RESPONSES_PATH, type ReferenceInventory } from './agent/adaptation-checkpoint.ts';
import { produceRaster } from './agent/art-production-tools.ts';
import { inputHash } from './agent/runner.ts';
import type { VisualCommission } from './agent/art-direction.ts';
const kernel=resolve(import.meta.dirname,'..');
const read=(root:string,p:string)=>JSON.parse(readFileSync(join(root,p),'utf8'));

async function fixture(theme='portfolio-motion-folio',withPrefs=true) {
  const root=mkdtempSync(join(tmpdir(),'vitris-checkpoint-'));
  await createSite({dir:root,slug:'synthetic-checkpoint',name:'Synthetic fixture',blank:true});
  const selection=selectionDraft(root,theme,'Synthetic workflow fixture; no human preference evidence','test-simulation');
  if(withPrefs)selection.adaptation={version:1,sections:'preserve-ask',aiImages:'ask-each',priorities:'Synthetic requirement: preserve all declared sections'};
  submitSelection(root,selection);
  save(join(root,'onboarding/reference-proof.json'),{synthetic:true,notHumanPreference:true});
  const pages=manifestPages(visualTheme(theme)).map(p=>({key:p.pageId,url:'https://example.com'+p.path,sections:[{id:p.pageId+'-section',label:p.label,role:p.role,mediaRole:'Synthetic fixture media role',rhythm:'Synthetic fixture rhythm'}]}));
  const inv:ReferenceInventory={version:1,selectionHash:currentSelectionHash(root)!,evidence:[{path:'onboarding/reference-proof.json',sha256:digest(readFileSync(join(root,'onboarding/reference-proof.json')))}],pages};
  const brief:TemplateAdaptation={version:1,selectionHash:currentSelectionHash(root)!,reference:{url:'https://example.com/',evidence:['onboarding/reference-proof.json']},qualities:[{id:'density',relationship:'Synthetic retained section rhythm',implementation:'Synthetic mapped section'}],sections:pages.map((p,i)=>({id:p.key,referenceIds:[p.sections[0]!.id],referenceSection:p.sections[0]!.label,disposition:'retain',route:i?'/detail-'+i:'/',targetId:'section-'+i,content:i?'ready':'placeholder',nextStep:i?undefined:'Leave this archived chapter as a fill-in, or supply historical notes.'})),images:[]};
  save(join(root,INVENTORY_PATH),inv);save(join(root,ADAPTATION_PATH),brief);
  save(join(root,INVENTORY_REVIEW),{version:2,verdict:'pass',subjectHash:fingerprint(root,[INVENTORY_PATH,ADAPTATION_PATH,'agent/theme-selection.json']),synthetic:true});
  return {root,brief,inv};
}
function respond(root:string,node:string,id:string,value:unknown) {
  awaitAdaptation(root,node);const q=adaptationQuestions(root,node).find(q=>q.id===id)!;
  const a={id,proposalHash:q.proposalHash,source:'test-simulation' as const,instruction:'Synthetic fixture answer: '+JSON.stringify(value),value};
  submitAdaptationResponse(root,a);return a;
}
test('chat/import-style selection without preferences waits before a lease or authoring attempt; one saved answer resumes',async()=>{
  const {root}=await fixture('portfolio-motion-folio',false);
  const graph:SkillGraph={version:3,stop_at:'direction',nodes:[{id:'direction',eval:'direction',kind:'agent',needs:[],inputs:[],writes:['theme'],refs:[],tools:[],maxAttempts:3}]};
  const state=initialState(graph),before=JSON.stringify(state);
  const first=await prepareStage({root,kernel,graph,state,nodeId:'direction'});
  assert.equal(first.status,'awaiting_user');assert.equal(JSON.stringify(state),before);assert.equal(hasActiveStageLease(root).held,false);
  const policy={version:1,sections:'preserve-ask',aiImages:'ask-each',priorities:'Synthetic template qualities'};
  const a=respond(root,'direction','adaptation-policy',policy);submitAdaptationResponse(root,a);
  assert.deepEqual(adaptationPreferences(root),policy);assert.equal(read(root,RESPONSES_PATH).answers.length,1);
  const pending=await prepareStage({root,kernel,graph,state,nodeId:'direction'});assert.equal(pending.status,'awaiting_user');assert.match(pending.instructions!,/content:/);
  respond(root,'direction','content:'+read(root,ADAPTATION_PATH).sections[0].id,'defer');
  const resumed=await prepareStage({root,kernel,graph,state,nodeId:'direction'});assert.equal(resumed.status,'prepared');assert.equal(state.nodes.direction!.attempts,0);
  await cancelStage({root,preparationId:resumed.preparation!.id,reason:'Synthetic fixture completed'});
});
test('a separate inventory critic is inserted idempotently before direction; catalog-page and mapped-section omissions fail',async()=>{
  for(const theme of ['portfolio-motion-folio','barber-copper-chair']) {
    const {root,inv,brief}=await fixture(theme);
    const graph:SkillGraph={version:3,stop_at:'direction',nodes:['reference-analysis','direction'].map(id=>({id,needs:id==='direction'?['reference-analysis']:[],refs:[],tools:[],writes:[],eval:id,maxAttempts:3,kind:'agent'}))};
    applyCheckpointGraph(root,graph);applyCheckpointGraph(root,graph);
    assert.equal(graph.nodes.filter(n=>n.id==='template-reference-review').length,1);assert.deepEqual(graph.nodes.find(n=>n.id==='direction')!.needs,['template-reference-review']);
    assert.deepEqual(inventoryFailures(root),[]);
    const lost=brief.sections.pop()!;save(join(root,ADAPTATION_PATH),brief);assert.match(inventoryFailures(root).join('\n'),/omits reviewed reference section/);
    brief.sections.push(lost);save(join(root,ADAPTATION_PATH),brief);inv.pages.pop();save(join(root,INVENTORY_PATH),inv);assert.match(inventoryFailures(root).join('\n'),/omits a catalog page/);
  }
});
test('deferred content stays in the queue with its archived question, changed questions invalidate only that answer, and launch still blocks drafts',async()=>{
  const {root,brief}=await fixture();const id='content:'+brief.sections[0]!.id;
  respond(root,'direction',id,'defer');assert.deepEqual(adaptationQuestions(root,'direction'),[]);
  const queue=contentRefinementQueue(root);assert.equal(queue.items.length,1);assert.equal(queue.items[0]!.decision!.value,'defer');assert.match(queue.items[0]!.nextAction!,/archived/);
  assert.match(templateAdaptationFailures(root,'launch').join('\n'),/Resolve template content gap/);
  brief.sections[0]!.nextStep='Synthetic changed historical question';save(join(root,ADAPTATION_PATH),brief);
  assert.equal(adaptationQuestions(root,'direction')[0]!.id,id);assert.equal(read(root,RESPONSES_PATH).answers.length,1);
});
test('generation dispatch rejects missing/declined decisions and changed commission/reference bytes before provider calls; approved retries do not regenerate',async()=>{
  const {root,brief}=await fixture();mkdirSync(join(root,'media'),{recursive:true});writeFileSync(join(root,'media/source.txt'),'synthetic reference bytes');
  const c:VisualCommission={id:'portrait',purpose:'Synthetic portrait fixture',route:'/',factIds:[],sourceAssetIds:['source'],role:'identity',medium:'generated-raster',idea:'Synthetic treatment',composition:'Quiet left space',responsive:{desktop:'Wide',mobile:'Subject retained',minimumReadableSize:'320px'},acceptance:['Synthetic inspection'],fallback:'Designed placeholder',forbiddenImplications:['No invented credentials'],referenceRelationships:['Synthetic reference relation']};
  brief.images=[{id:c.id,purpose:c.purpose,treatment:c.idea,identity:'Synthetic identity reference',status:'proposed',commissionHash:digest(c),references:[{assetId:'source',path:'media/source.txt',sha256:digest(readFileSync(join(root,'media/source.txt')))}]}];save(join(root,ADAPTATION_PATH),brief);
  save(join(root,'onboarding/media-inventory.json'),{assets:[{id:'source',path:'/media/source.txt',sha256:brief.images[0]!.references![0]!.sha256}]});
  let calls=0;const adapter={identity:'synthetic-fixture',generate:async()=>{calls++;return {localPath:'synthetic-output',prompt:'Synthetic test output; no real generation'}}};
  await assert.rejects(produceRaster(root,'synthetic-missing',c,adapter),/Ask the user/);assert.equal(calls,0);assert.equal(existsSync(join(root,'artwork/generation-synthetic-missing.json')),false);
  const declined=respond(root,'direction','image:portrait','decline');await assert.rejects(produceRaster(root,'synthetic-declined',c,adapter),/Ask the user/);assert.equal(calls,0);
  brief.images[0]!.treatment='Revised synthetic treatment';c.idea='Revised synthetic treatment';brief.images[0]!.commissionHash=digest(c);save(join(root,ADAPTATION_PATH),brief);
  assert.doesNotThrow(()=>submitAdaptationResponse(root,declined));assert.ok(adaptationQuestions(root,'direction').some(q=>q.id==='image:portrait'));
  respond(root,'direction','image:portrait','approve');await produceRaster(root,'synthetic-approved',c,adapter);await produceRaster(root,'synthetic-approved',c,adapter);assert.equal(calls,1);
  const q=adaptationQuestions(root,'direction',true).find(q=>q.id==='image:portrait')!;
  const reversal={id:q.id,proposalHash:q.proposalHash,operationId:'synthetic-reversal-1',source:'test-simulation' as const,instruction:'Synthetic explicit reversal to decline the unchanged proposal',value:'decline'};
  submitAdaptationResponse(root,reversal);await assert.rejects(produceRaster(root,'synthetic-reversal',c,adapter),/Ask the user/);submitAdaptationResponse(root,reversal);assert.equal(calls,1);
  submitAdaptationResponse(root,{...reversal,operationId:'synthetic-reversal-2',instruction:'Synthetic renewed approval for the unchanged proposal',value:'approve'});
  c.composition='Changed composition';await assert.rejects(produceRaster(root,'synthetic-commission-change',c,adapter),/exact production commission/);c.composition='Quiet left space';
  writeFileSync(join(root,'media/source.txt'),'changed bytes');await assert.rejects(produceRaster(root,'synthetic-reference-change',c,adapter),/reference bytes changed/);assert.equal(calls,1);
  const selection=selectionDraft(root,'portfolio-motion-folio','Synthetic no-AI fixture','test-simulation');selection.adaptation={version:1,sections:'preserve-ask',aiImages:'no-ai',priorities:''};submitSelection(root,selection);assert.throws(()=>assertTemplateImageAuthorization(root,'portrait',c),/prohibits AI/);
});
test('representative feedback binds the current comparison and records refinement without proceeding to expansion',async()=>{
  const {root}=await fixture();mkdirSync(join(root,'dist'),{recursive:true});writeFileSync(join(root,'dist/index.html'),'<h1>Synthetic representative</h1>');
  awaitAdaptation(root,'copy-expansion');const noReview=adaptationQuestions(root,'copy-expansion')[0]!;
  assert.throws(()=>submitAdaptationResponse(root,{id:noReview.id,proposalHash:noReview.proposalHash,source:'test-simulation',instruction:'Synthetic premature continue',value:'continue'}),/current reviewed/);
  save(join(root,'agent/reviews/representative-review.json'),{verdict:'pass',templateFidelity:{selectionHash:currentSelectionHash(root),distHash:fingerprint(root,['dist'])},synthetic:true});
  respond(root,'copy-expansion','representative-feedback','refine');assert.match(awaitAdaptation(root,'copy-expansion')!,/requests refinement/);
  assert.equal(read(root,RESPONSES_PATH).answers.at(-1).value,'refine');
  writeFileSync(join(root,'dist/index.html'),'<h1>Synthetic revised representative</h1>');
  save(join(root,'agent/reviews/representative-review.json'),{verdict:'pass',templateFidelity:{selectionHash:currentSelectionHash(root),distHash:fingerprint(root,['dist'])},synthetic:true});
  respond(root,'copy-expansion','representative-feedback','continue');assert.equal(awaitAdaptation(root,'copy-expansion'),undefined);
});
test('later representative answers do not reopen upstream authoring and remain bound to historical captures after expansion',async()=>{
  const {root,brief}=await fixture();respond(root,'direction','content:'+brief.sections[0]!.id,'defer');
  mkdirSync(join(root,'dist'),{recursive:true});writeFileSync(join(root,'dist/index.html'),'<h1>Synthetic first representative</h1>');
  save(join(root,'agent/reviews/representative-review.json'),{verdict:'pass',templateFidelity:{selectionHash:currentSelectionHash(root),distHash:fingerprint(root,['dist'])},synthetic:true});
  const graph:SkillGraph={version:3,stop_at:'copy-expansion',nodes:['direction','copy-expansion'].map(id=>({id,needs:[],refs:[],tools:[],writes:[],eval:id,maxAttempts:3,kind:'agent'}))};applyCheckpointGraph(root,graph);
  const before=inputHash(root,graph.nodes[0]!);respond(root,'copy-expansion','representative-feedback','continue');assert.equal(inputHash(root,graph.nodes[0]!),before);
  const accepted=inputHash(root,graph.nodes[1]!);writeFileSync(join(root,'dist/index.html'),'<h1>Synthetic expanded site</h1>');
  assert.equal(inputHash(root,graph.nodes[1]!),accepted);assert.deepEqual(adaptationQuestions(root,'copy-expansion'),[]);
});
test('negative representative feedback automatically returns ownership without consuming another attempt or fabricating acceptance',async()=>{
 const {root}=await fixture();mkdirSync(join(root,'dist'),{recursive:true});writeFileSync(join(root,'dist/index.html'),'<h1>Synthetic representative</h1>');
 save(join(root,'agent/reviews/representative-review.json'),{verdict:'pass',templateFidelity:{selectionHash:currentSelectionHash(root),distHash:fingerprint(root,['dist'])},synthetic:true});
 const graph:SkillGraph={version:3,stop_at:'copy-expansion',nodes:['representative','copy-expansion'].map(id=>({id,needs:id==='copy-expansion'?['representative']:[],refs:[],tools:[],writes:[],eval:id,maxAttempts:4,kind:'agent'}))};
 const state=initialState(graph);state.nodes.representative={status:'done',attempts:2};respond(root,'copy-expansion','representative-feedback','refine');
 const result=await prepareStage({root,kernel,graph,state,nodeId:'copy-expansion'});assert.equal(result.status,'repair_required');assert.equal(state.nodes.representative.status,'pending');assert.equal(state.nodes.representative.attempts,2);assert.equal(state.nodes['copy-expansion']!.attempts,0);assert.equal(hasActiveStageLease(root).held,false);assert.equal(read(root,RESPONSES_PATH).answers.at(-1).value,'refine');
});
