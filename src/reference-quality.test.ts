import {refreshFixtureCalibration} from "./agent/design-fixtures.ts";
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {businessContexts,expressionSignals,normalizeTasks,fitScore,complementaryFit} from './agent/reference-fit.ts';
import {CORRECTED_REFERENCE_RELEASE as release,loadReferenceCatalog,referenceSignals,referenceContext,referenceHash,selectReferences,validateReferenceCatalog} from './agent/reference-library.ts';
import {loadReferenceStudies,referenceStudyExpansions} from './agent/reference-studies.ts';
import {validateReferenceSelection} from './agent/reference-contract.ts';
import {parseGraphYaml,initialState} from './agent/graph.ts';
import {prepareStage} from './agent/lifecycle.ts';
import {runCreativeProfile} from './agent/creative-profile.ts';
import {inputHash,instructionContractHash} from './agent/runner.ts';
import {fingerprint} from './agent/artifacts.ts';
import {resolveDesignContextExpansion} from './agent/design-context-store.ts';
const kernel=resolve(import.meta.dirname,'..'), pack=loadReferenceCatalog(kernel,kernel,release), teaching=loadReferenceStudies(kernel,release);
const save=(p:string,v:any)=>writeFileSync(p,JSON.stringify(v,null,2));
function site(){const root=mkdtempSync(join(tmpdir(),'vitris-quality-test-'));cpSync(join(kernel,'src/test/fixtures/active-agent-site'),root,{recursive:true});refreshFixtureCalibration(root,kernel);cpSync(join(kernel,'agent/refs'),join(root,'agent/refs'),{recursive:true});const p=join(root,'launch.json'),launch=JSON.parse(readFileSync(p,'utf8'));launch.designReferences={mode:'lessons',release,manifestHash:pack.manifestHash,teachingManifestHash:teaching.manifestHash};save(p,launch);mkdirSync(join(root,'agent/runs'),{recursive:true});return root;}
function signals(tasks:string[],theme='',assets:string[]=[],contexts:string[]=[]){return {known:['type-content','real-copy','process','sparse-media',...assets],absent:assets.length?[]:['approved-image','multiple-images','product-ui'],visitorTasks:tasks,theme,expression:expressionSignals(theme),contexts,roles:['home','detail'],complexity:'low' as const,origins:[]};}
test('normalized tasks, bounded expression aliases and specific business context preserve uncertainty',()=>{
 assert.deepEqual(normalizeTasks(['evaluate work','inspect-work','inspect specifications','find menu']),['explore-product','find-location','inspect-work']);
 assert.ok(expressionSignals('understated luxury').families.includes('quiet-luxury'));
 assert.equal(expressionSignals('understated luxury').requested,'understated luxury');
 assert.equal(expressionSignals('quantum cubism').uncertainty,'unsupported-expression');
 assert.deepEqual(businessContexts('practice'),[]);
 assert.ok(businessContexts('editorial designer personal practice').includes('creative-practice'));
 assert.ok(!businessContexts('visitor questions about process').includes('venue'));
});
test('specific tasks and expression outrank repeated weak generic matches; complementary relationships break close fits',()=>{
 const s=signals(['inspect-work','read-deeply'],'expressive typography',[],['creative-practice']);
 const relevant={tasks:['inspect-work'],expressions:['expressive-type'],contexts:['creative-practice'],contributions:['work-index']};
 const weak={tasks:['evaluate-service'],expressions:['civic'],contexts:['financial-service'],contributions:['directory']};
 assert.ok(fitScore(relevant,['type-content'],s).score>fitScore(weak,['type-content','real-copy','process','sparse-media','action'],s).score);
 const pool=[{id:'a',score:40,profile:relevant,reasons:[]},{id:'b',score:40,profile:relevant,reasons:[]},{id:'c',score:40,profile:{...relevant,contributions:['reading-depth','chapter-nav']},reasons:[]}];
 const selected=complementaryFit(pool,2,id=>id);assert.equal(selected.length,2);assert.ok(selected.some(r=>r.id==='c'));assert.notDeepEqual(selected[0]!.profile.contributions,selected[1]!.profile.contributions);
 assert.deepEqual(selected,complementaryFit(pool,2,id=>id));
});
test('precise retrieval separates ancillary reading, collection browsing and asset availability from a primary task',()=>{
 assert.deepEqual(normalizeTasks(['explore collection','find information'],true),['explore-collection','find-information']);
 const s=signals(['inspect-work','read-deeply'],'',[],['creative-practice']);
 const creative={tasks:['inspect-work','read-deeply'],expressions:['editorial'],contexts:['creative-practice'],contributions:['work-index']};
 const operational={tasks:['read-deeply','find-location'],expressions:['athletic'],contexts:['venue'],contributions:['event-directory']};
 assert(fitScore(creative,[],s,true).score>fitScore(operational,[],s,true).score);
 assert.equal(fitScore({tasks:[],expressions:[],contexts:[],contributions:[]},['approved-image'],signals([],'',['approved-image']),true).supported,false);
 const pool=[{id:'a',score:50,profile:creative,reasons:[]},{id:'b',score:43,profile:{...creative,contributions:['many','other','contributions']},reasons:[]}];
 assert.equal(complementaryFit(pool,1,id=>id,true)[0]!.id,'a');
 const requested=signals(['inspect-work','read-deeply'],'maximalism',[],['creative-practice']);
 const interpreted={tasks:['read-deeply'],expressions:['maximalism'],contexts:['venue'],contributions:['poster-programme']};
 assert(fitScore(interpreted,[],requested,true).score>=fitScore(creative,[],requested,true).score,'An explicit supported expression remains consequential');
});
test('real collection task/style/asset matrix has supported choices or explicit expression gaps and deterministic replay',()=>{
 assert.equal(pack.catalog.records.length,100);assert.equal(teaching.catalog.studies.length,16);
 for(const s of [signals(['inspect-work','read-deeply'],'expressive type',[],['creative-practice']),signals(['evaluate-service','compare-options','understand-process'],'',[],['financial-service']),signals(['inspect-work','understand-process'],'documentary',['approved-image','multiple-images'],['project-service']),signals(['shop-collection','explore-product'],'campaign',['approved-image','multiple-images'],['retail']),signals(['shop-collection','explore-product'],'quiet luxury',['approved-image','multiple-images'],['retail']),...['retro','quiet luxury','maximalism'].map(t=>signals(['inspect-work','read-deeply'],t,[],['creative-practice'])),signals(['find-location','book-inquiry'],'hospitality',['approved-image'],['venue']),signals(['explore-product','understand-process'],'technical',['product-ui'],['technical-product']),signals(['shop-collection','explore-product'],'campaign',[],['retail']),signals(['inspect-work'],'quantum cubism')]){
  const external=selectReferences(pack,s,undefined,3), originals=referenceStudyExpansions(kernel,s,external.selected.map(x=>x.id),undefined,release);
  assert.deepEqual(external,selectReferences(pack,s,undefined,3));assert.deepEqual(originals.selected,referenceStudyExpansions(kernel,s,external.selected.map(x=>x.id),undefined,release).selected);
  assert.ok(external.selected.length+originals.selected.length<=5);
  for(const x of originals.selected){const study=teaching.catalog.studies.find(r=>r.id===x.id)!;assert.ok(study.selectionProfile!.tasks.some(t=>s.visitorTasks.includes(t))||study.selectionProfile!.expressions.some(e=>s.expression.families.includes(e))||study.selectionProfile!.contexts.some(c=>s.contexts.includes(c)));if(!s.known.includes('approved-image'))assert.equal(study.selectionProfile!.interpretation?.assetMinimum||study.assetMinimum,'none');}
  if(s.theme==='quantum cubism')assert.ok(external.gaps.some(g=>g.includes('unsupported-expression')));
 }
 const personal=signals(['inspect-work','read-deeply'],'expressive type',[],['creative-practice']);
 const chosen=referenceStudyExpansions(kernel,personal,[],undefined,release).selected;
 assert.ok(chosen.some(x=>teaching.catalog.studies.find(s=>s.id===x.id)!.selectionProfile!.contexts.includes('creative-practice')));
 assert.ok(!chosen.every(x=>teaching.catalog.studies.find(s=>s.id===x.id)!.selectionProfile!.contexts.includes('financial-service')));
});
test('unavailable publisher is excluded, durable originals remain resolvable, and missing/stale schemas fail',()=>{
 const copy={...pack,catalog:structuredClone(pack.catalog)},s=signals(['inspect-work'],'expressive type',['approved-image','multiple-images'],['creative-practice']);
 const id=selectReferences(copy,s).selected[0]!.id,r=copy.catalog.records.find(r=>r.id===id)!;r.sourceStatus='blocked';r.eligible.metadata=false;r.evidenceLevel='unavailable';r.visualEvidence!.availability='blocked';
 const fallback=selectReferences(copy,s);assert.ok(!fallback.selected.some(x=>x.id===id));assert.ok(fallback.excluded.some(x=>x.id===id));
 for(const r of pack.catalog.records)for(const id of r.visualEvidence!.durableOriginalIds)assert.ok(teaching.catalog.studies.some(s=>s.id===id));
 delete copy.catalog.records[1]!.selectionProfile;assert.ok(validateReferenceCatalog(copy.catalog).some(e=>e.includes('normalized')));
 copy.catalog.records[2]!.visualEvidence!.sourceRevision++;assert.ok(validateReferenceCatalog(copy.catalog).some(e=>e.includes('freshness')));
 assert.equal(loadReferenceCatalog(kernel,kernel,'2026-10-05.1').manifest.release,'2026-10-05.1');assert.equal(loadReferenceStudies(kernel,'2026-10-05.1').manifest.release,'2026-10-05.1');
});
// Synthetic inspection fixtures test contract rejection only. They are never visual evidence or trial outcomes.
function synthetic(receipt:any){const now=new Date().toISOString(), selected={...receipt,acceptedAt:now,selected:receipt.selected.map((s:any)=>({...s,reason:'Synthetic contract fixture'})),teachingSelected:receipt.teachingSelected.map((s:any)=>({...s,reason:'Synthetic contract fixture'})),inspectedEvidence:[] as any[],plannedRelationships:{homepage:'Synthetic',interior:'Synthetic',mobile:'Synthetic',action:'Synthetic'}};
 for(const s of selected.selected)for(const width of [1440,390]){const r=pack.catalog.records.find(r=>r.id===s.id)!;selected.inspectedEvidence.push({...s,route:r.resolvedUrl,viewport:{width,height:900},kind:'live-only',inspectedAt:now,sourceRevision:s.revision,evidencePointer:r.resolvedUrl,observed:'Synthetic schema fixture, not inspected'});}
 for(const s of selected.teachingSelected)for(const v of teaching.catalog.studies.find(r=>r.id===s.id)!.renderEvidence){const pin=v.fullPreview||v.preview;selected.inspectedEvidence.push({...s,route:v.route,viewport:v.viewport,kind:'retained-capture',inspectedAt:now,sourceRevision:s.revision,evidencePointer:join(teaching.base,pin.path),capture:{path:join(teaching.base,pin.path),sha256:pin.sha256},observed:'Synthetic contract fixture, not inspected'});}
 return selected;}
test('ordinary preparation and accepted choices survive later signals; stale/changed evidence and lost frozen receipt fail',async()=>{
 const root=site(),graph=parseGraphYaml(readFileSync(join(root,'agent/graph.yaml'),'utf8')),state=initialState(graph);
 for(const n of graph.nodes)state.nodes[n.id]={status:'done',attempts:1};
 const p=await prepareStage({root,kernel,graph,state,nodeId:'reference-analysis'});assert.equal(p.status,'prepared');
 const receipt=JSON.parse(readFileSync(join(root,`agent/runs/${p.preparation!.id}.design-context.json`),'utf8')).manifest.referenceSelection;
 assert.equal(receipt.release,release);assert.equal(receipt.selectorVersion,'task-expression-complementarity-2');
 const ap=join(root,'onboarding/reference-analysis.json'),analysis=JSON.parse(readFileSync(ap,'utf8'));analysis.referenceSelection=synthetic(receipt);save(ap,analysis);assert.deepEqual(validateReferenceSelection(root,analysis,kernel),[]);
 save(join(root,'onboarding/storyboard.json'),{pages:[{role:'shop',sections:['later unrelated product storyboard']}]});
 save(join(root,'agent/request.json'),{theme:'retro'});
 const retained=referenceContext(root,'pages',kernel)!.receipt;
 assert.deepEqual(retained.selected.map(x=>x.id),receipt.selected.map((x:any)=>x.id));assert.deepEqual(retained.teachingSelected.map(x=>x.id),receipt.teachingSelected.map((x:any)=>x.id));assert.equal(retained.inputSignalHash,receipt.inputSignalHash);
 assert.deepEqual(validateReferenceSelection(root,analysis,kernel),[]);
 analysis.referenceSelection.inspectedEvidence[0].inspectedAt='2000-01-01T00:00:00.000Z';assert.ok(validateReferenceSelection(root,analysis,kernel).some(e=>e.includes('Stale')));
 const capture=analysis.referenceSelection.inspectedEvidence.find((e:any)=>e.capture);if(capture){capture.capture.sha256='0'.repeat(64);assert.ok(validateReferenceSelection(root,analysis,kernel).some(e=>e.includes('changed retained')));}
 const handle=receipt.teachingSelected[0]?.handle;if(handle)assert.equal(resolveDesignContextExpansion(root,p.preparation!.id,handle).ok,false,'changed request invalidates preparation expansion');
});
for(const compact of [true,false])test(`corrected release real creative ${compact?'compact':'noncompact'} preparation keeps accepted working set`,{timeout:90000},async()=>{
 const previous=process.env.VITRIS_KERNEL;process.env.VITRIS_KERNEL=kernel;
 try{const root=site(),graph=parseGraphYaml(readFileSync(join(root,'agent/graph.yaml'),'utf8')),sp=join(root,'agent/STATE.json'),state=JSON.parse(readFileSync(sp,'utf8'));
 const p=await prepareStage({root,kernel,graph,state,nodeId:'reference-analysis'});assert.equal(p.status,'prepared');
 const receipt=JSON.parse(readFileSync(join(root,`agent/runs/${p.preparation!.id}.design-context.json`),'utf8')).manifest.referenceSelection;
 const ap=join(root,'onboarding/reference-analysis.json'),analysis=JSON.parse(readFileSync(ap,'utf8'));analysis.referenceSelection=synthetic(receipt);save(ap,analysis);assert.deepEqual(validateReferenceSelection(root,analysis,kernel),[]);
 for(const n of graph.nodes)if(state.nodes[n.id]?.status==='done')Object.assign(state.nodes[n.id],{inputHash:inputHash(root,n),skillHash:instructionContractHash(root,n),outputHash:fingerprint(root,n.writes)});save(sp,state);
 const result=await runCreativeProfile(root,kernel,['node','workflow.ts','--site',root,'--creative-profile','--max-cumulative','120','--creative-efficiency','--jev-mode','off',...(compact?[]:['--no-compact-packets'])]);
 assert.equal(result.run.phase,'planning',result.summary);assert.match(readFileSync(join(root,'agent/CURRENT.md'),'utf8'),/Reference release 2026-10-06.2/);
 const evidence=join(kernel,`artifacts/reference-quality-20261006/prepared-stage-evidence/creative-${compact?'compact':'noncompact'}`);mkdirSync(evidence,{recursive:true});cpSync(join(root,'agent/CURRENT.md'),join(evidence,'CURRENT.md'));
 const rp=compact?join(root,`agent/runs/${result.run.id}-plan.manifest.json`):join(root,`agent/creative-runs/${result.run.id}/references-plan.json`);cpSync(rp,join(evidence,'manifest.json'));const m=JSON.parse(readFileSync(rp,'utf8')),r=m.referenceSelection||m.receipt;assert.ok(r);assert.equal(r.teachingManifestHash,receipt.teachingManifestHash);assert.deepEqual(r.teachingSelected.map((x:any)=>x.id),receipt.teachingSelected.map((x:any)=>x.id));
 }finally{if(previous===undefined)delete process.env.VITRIS_KERNEL;else process.env.VITRIS_KERNEL=previous;}
});
