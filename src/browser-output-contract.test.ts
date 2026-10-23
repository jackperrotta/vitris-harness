import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {categorizeNodeDependencies,snapshotInventory,verifyAllowedWrites} from './agent/preparation.ts';
import type {GraphNode} from './agent/graph.ts';
const node=(id='browser'):GraphNode=>({id,kind:'tool',needs:[],refs:[],writes:['agent/reviews/browser.json','agent/screenshots/browser'],tools:[],eval:id,maxAttempts:4});
function site(enabled:boolean){const root=mkdtempSync(join(tmpdir(),'vitris-browser-outputs-'));writeFileSync(join(root,'launch.json'),JSON.stringify({performance:{enabled}}));return root;}
test('an opted-in copied browser graph declares and can write its real Lighthouse outputs',()=>{
 const root=site(true),baseline=snapshotInventory(root),browser=node();
 const outputs=categorizeNodeDependencies({root,node:browser}).expectedOutputs;
 mkdirSync(join(root,'agent/reviews/performance-runs/build'),{recursive:true});
 writeFileSync(join(root,'agent/reviews/performance.json'),'{}');writeFileSync(join(root,'agent/reviews/performance-runs/build/mobile-1.json'),'{}');
 assert.equal(verifyAllowedWrites({root,node:browser,baselineInventory:baseline,allowedWrites:outputs}).ok,true);
 writeFileSync(join(root,'agent/reviews/business-review.json'),'{}');
 const guarded=verifyAllowedWrites({root,node:browser,baselineInventory:baseline,allowedWrites:outputs});
 assert.equal(guarded.ok,false);assert(guarded.violations.some(v=>v.includes('business-review.json')));
});
test('disabled performance and representative captures do not inherit the full browser report scope',()=>{
 assert(!categorizeNodeDependencies({root:site(false),node:node()}).expectedOutputs.includes('agent/reviews/performance.json'));
 assert(!categorizeNodeDependencies({root:site(true),node:node('representative-browser')}).expectedOutputs.includes('agent/reviews/performance.json'));
});
