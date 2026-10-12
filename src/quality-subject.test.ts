import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {save} from "./agent/artifacts.ts";
import {reviewSubject} from "./agent/evaluate.ts";
import {qualitySubject,representativeCaptureHashes} from "./agent/design-quality.ts";
import {prepareStage,cancelStage} from "./agent/lifecycle.ts";
import {initialState,type SkillGraph} from "./agent/graph.ts";
import {scaffoldNestedSite} from "./agent/design-copy.ts";
function fixture(optIn:boolean){const root=mkdtempSync(join(tmpdir(),"vitris-quality-subject-"));save(join(root,"launch.json"),optIn?{productionQuality:"source-and-realization-v1"}:{});save(join(root,"onboarding/content-requirements.json"),{version:1,items:[{id:"important-fact"}]});mkdirSync(join(root,"pages"),{recursive:true});writeFileSync(join(root,"pages/index.html"),"<h1>Current source</h1>");return root;}
test("visual quality binds current reported pages while retaining archived motion evidence",()=>{
  const root=fixture(false),dir="agent/screenshots/representative-browser/";
  const images=["old/page.png","current/page.png","current/first-visit.png","current/journeys/checkpoint.png"];
  for(const image of images){const p=join(root,dir,image);mkdirSync(join(p,".."),{recursive:true});writeFileSync(p,image);}
  save(join(root,"agent/reviews/representative-browser.json"),{checks:[{screenshot:dir+images[1],firstVisit:{screenshot:dir+images[2]}}]});
  assert.deepEqual(representativeCaptureHashes(root).map(c=>c.path),[dir+images[2],dir+images[1]].sort());
  writeFileSync(join(root,dir+images[0]),"Archived evidence remains independent");
  const current=representativeCaptureHashes(root);
  writeFileSync(join(root,dir+images[1]),"Changed current page");assert.notDeepEqual(representativeCaptureHashes(root),current);
  save(join(root,"agent/reviews/representative-browser.json"),{checks:[{screenshot:dir+"missing.png"}]});assert.throws(()=>representativeCaptureHashes(root));
  save(join(root,"agent/reviews/representative-browser.json"),{checks:[{screenshot:"../outside.png"}]});assert.throws(()=>representativeCaptureHashes(root));
});
test("opted-in portable subject and prepared critic guidance match the authoritative quality gate",()=>{
  const root=fixture(true),expected=qualitySubject(root);
  assert.equal(reviewSubject(root,"representative-quality"),expected);
  const cli=spawnSync(process.execPath,["--experimental-strip-types",resolve("scripts/eval-site.ts"),"--site",root,"--node","representative-quality","--subject"],{encoding:"utf8",windowsHide:true});
  assert.equal(cli.status,0,cli.stderr);assert.equal(cli.stdout.trim(),expected);
  writeFileSync(join(root,"pages/index.html"),"<h1>Changed source</h1>");
  assert.notEqual(reviewSubject(root,"representative-quality"),expected);
  assert.equal(reviewSubject(root,"representative-quality"),qualitySubject(root));
});
test("legacy blocks quality subject remains unchanged",()=>{
  const root=fixture(false);assert.equal(reviewSubject(root,"representative-quality"),qualitySubject(root));
});
test("actual opted-in quality preparation explains the supported active-agent completion, preserving legacy guidance",async()=>{
  // Synthetic preparation-only fixture; no completed workflow or pixel inspection claim.
  const kernel=resolve(import.meta.dirname,'..');
  for(const optIn of [false,true]){
    const root=mkdtempSync(join(tmpdir(),'vitris-quality-completion-'));
    scaffoldNestedSite({dest:root,kernel,parent:root,slug:'synthetic-quality-guidance',name:'Synthetic quality guidance'});
    save(join(root,'launch.json'),optIn?{productionQuality:'source-and-realization-v1'}:{});
    save(join(root,'agent/jev.json'),{mode:'off'});
    const graph:SkillGraph={version:3,stop_at:'representative-quality',nodes:[{id:'representative-quality',kind:'critic',needs:[],tools:[],writes:['agent/reviews/representative-quality.json'],refs:[],eval:'representative-quality',maxAttempts:4}]};
    const prepared=await prepareStage({root,kernel,graph,state:initialState(graph),nodeId:'representative-quality',promptOverride:'Synthetic preparation guidance test only.'});
    try{
      assert.ok(prepared.preparation);
      const current=readFileSync(join(root,'agent/CURRENT.md'),'utf8');
      assert.equal(current.includes('--visual-tool-events ABSOLUTE_EVENTS_JSON'),optIn);
      if(optIn){assert.ok(current.includes(prepared.preparation!.id));assert.ok(current.includes('not an exported host transcript'));assert.ok(current.includes('If pixels are unavailable, fail closed'));}
    }finally{if(prepared.preparation)cancelStage({root,preparationId:prepared.preparation.id,reason:'Synthetic guidance fixture finished'});}
  }
});
