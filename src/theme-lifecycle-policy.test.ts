import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {save} from './agent/artifacts.ts';
import {initialState,type SkillGraph} from './agent/graph.ts';
import {prepareStage,completeStage} from './agent/lifecycle.ts';
import {selectionDraft,submitSelection,SELECTION_PATH,BRAND_PATH} from './agent/theme-selection.ts';
import {instructionContractHash} from './agent/runner.ts';
import {reconcile} from './agent/runner.ts';
import {ADAPTATION_PATH,TEMPLATE_DECISIONS_PATH} from './agent/template-adaptation.ts';

const kernel=resolve(import.meta.dirname,'..');
const graph=():SkillGraph=>({version:3,stop_at:'preview_ready',nodes:[{id:'reference-analysis',needs:[],writes:['onboarding/reference-analysis.json'],refs:[],tools:[],eval:'reference-analysis',kind:'agent',maxAttempts:4}]});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'vitris-theme-lifecycle-'));
 cpSync(join(kernel,'agent'),join(root,'agent'),{recursive:true});
 mkdirSync(join(root,'onboarding'),{recursive:true});
 save(join(root,'launch.json'),{slug:'policy-regression',name:'Policy regression',themeSelection:{version:1,enabled:true}});
 save(join(root,'onboarding/brief.json'),{business:{name:'Policy regression'},images:[]});
 submitSelection(root,selectionDraft(root,'swiss-index','','test-simulation'));
 return root;
}
test('accepted theme completes with a separately loaded graph and retains immutable bindings',async()=>{
 const root=fixture(),g=graph(),state=initialState(g);
 const result=await prepareStage({root,kernel,graph:g,state});
 const prep=result.preparation!;
 assert.ok(prep.immutableDependencies.includes(SELECTION_PATH));
 assert.ok(prep.immutableDependencies.includes(BRAND_PATH));
 save(join(root,'onboarding/reference-analysis.json'),{testOnly:true,teachingPrinciples:[{id:'synthetic'}]});
 const completed=await completeStage({root,kernel,graph:graph(),state,preparationId:prep.id,evaluate:()=>({failures:[]})});
 assert.equal(completed.ok,true);
});
test('changing an accepted theme still invalidates a prepared stage',async()=>{
 const root=fixture(),g=graph(),state=initialState(g);
 const result=await prepareStage({root,kernel,graph:g,state});
 submitSelection(root,selectionDraft(root,'hard-edge','Changed after preparation','test-simulation'));
 await assert.rejects(completeStage({root,kernel,graph:graph(),state,preparationId:result.preparation!.id,evaluate:()=>({failures:[]})}),/immutable dependencies were modified/);
});
test('downstream storyboard creation does not invalidate direction instruction identity',()=>{
 const root=fixture();
 const node={...graph().nodes[0]!,id:'direction',refs:['motion'],writes:['onboarding/direction.json','theme/defaults.json']};
 const before=instructionContractHash(root,node);
 save(join(root,'onboarding/storyboard.json'),{motionPlan:{scenes:[{effect:'draw'}]}});
 assert.equal(instructionContractHash(root,node),before);
});
test('direction review ignores a stale downstream storyboard when choosing motion recipes',()=>{
 const root=fixture(),node={...graph().nodes[0]!,id:'direction-review',refs:['motion'],writes:['agent/reviews/direction-review.json']};
 save(join(root,'onboarding/direction.json'),{motionPlan:{scenes:[{effect:'draw'}]}});
 const before=instructionContractHash(root,node);
 save(join(root,'onboarding/storyboard.json'),{motionPlan:{scenes:[{effect:'sequence'},{effect:'text'}]}});
 assert.equal(instructionContractHash(root,node),before);
});
test('adaptation outputs survive a fresh graph and later image answers do not reopen reference analysis',async()=>{
 const root=fixture();
 const choice=selectionDraft(root,'swiss-index','Synthetic adaptation policy','test-simulation');
 choice.adaptation={version:1,sections:'preserve-ask',aiImages:'ask-each',priorities:'Synthetic preserve rhythm'};submitSelection(root,choice);
 const g=graph(),state=initialState(g),prepared=await prepareStage({root,kernel,graph:g,state});
 assert.ok(g.nodes[0]!.writes.includes(ADAPTATION_PATH));
 save(join(root,'onboarding/reference-analysis.json'),{testOnly:true,teachingPrinciples:[{id:'synthetic'}]});
 save(join(root,ADAPTATION_PATH),{testOnly:true});
 await completeStage({root,kernel,graph:graph(),state,preparationId:prepared.preparation!.id,evaluate:()=>({failures:[]})});
 save(join(root,TEMPLATE_DECISIONS_PATH),{testOnly:true});
 reconcile(root,graph(),state);
 assert.equal(state.nodes['reference-analysis']!.status,'done');
});
