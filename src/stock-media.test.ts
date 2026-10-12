import { createServer } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest, importStock, readStockCatalog, stockBytes } from "./stock/library.ts";
import { searchStock } from "./stock/search.ts";
import { checkMediaIdentity, eligibleForSlot, shortlistForSlot, saveSelection, validateMediaSelection, validateRenderedMedia, type MediaAsset } from "./stock/selection.ts";
import type { StockItem } from "./stock/types.ts";
import { save, json, type MediaInventory } from "./agent/artifacts.ts";
import { JevClient } from "./agent/jev/client.ts";
import { DEFAULT_JEV_CAPABILITIES, DEFAULT_JEV_CONFIG, resolveEffectiveCapabilities, jevClientRequired } from "./agent/jev/config.ts";
import { prepareMediaAssistance, rankMedia } from "./agent/jev/media.ts";
import { allTasks, initDefaultRegistry } from "./agent/jev/service-registry.ts";
import { prepareStage, completeStage } from "./agent/lifecycle.ts";
import { initialState, type SkillGraph } from "./agent/graph.ts";
const temp = () => mkdtempSync(join(tmpdir(), "vitris-stock-"));
const bytes=Buffer.from("fixture media bytes");
const stock = (): StockItem => ({id:"test-image",kind:"image",src:"/stock/images/test.jpg",thumb:"/stock/thumbs/test.jpg",alt:"Service tools",tags:["electrical"],categories:["trades"],credit:"Fixture",pexelsId:1,sha256:digest(bytes),thumbSha256:digest(bytes),width:1600,height:900,status:"accepted",inspection:{version:1,assetHash:digest(bytes),observedAt:"2026-09-23",observer:"test fixture",description:"Electrical tools on a table",evidence:["fixture"],subjects:["tools"],activities:[],settings:[],industries:["trades"],roles:["hero","detail"],palette:[],lighting:"neutral",density:"low",focalPoint:"right",negativeSpace:["left"],cropNotes:"Keep tools",visibleText:false,uncertainty:[]}});
const asset = (id="a"): MediaAsset => ({id,path:"/media/a.jpg",sources:[],description:"Inspected tools",role:"illustration",disposition:"use",reason:"Illustration",inspected:true,placements:["/"],origin:"stock",identity:"none",width:1600,height:900});
function cache(item:StockItem) {const root=temp();for(const path of [item.src,item.thumb]) {const file=join(root,path.slice(1));mkdirSync(join(file,".."),{recursive:true});writeFileSync(file,bytes);}return root;}
function client(root:string, fetcher?: (body:any)=>Record<string,unknown>) {let calls=0; const c=new JevClient({root,config:{...DEFAULT_JEV_CONFIG,mode:"assist",maxRetries:0},fetch:async(_input,init)=>{calls++;const body=JSON.parse(String(init?.body));return new Response(JSON.stringify({model:DEFAULT_JEV_CONFIG.model,answers:fetcher?.(body)||{semantic:{type:"score",score:3,confidence:0.9},composition:{type:"score",score:4,confidence:0.9},style:{type:"score",score:3,confidence:0.9}},usage:{input_tokens:20,output_tokens:5}}),{status:200,headers:{"content-type":"application/json"}});}});return {c,calls:()=>calls};}

test("stock search combines inspected facets and excludes staged or unsuitable dimensions",()=>{
  const item=stock();const excluded={...item,id:"excluded",status:"excluded" as const};
  assert.deepEqual(searchStock([item,excluded],{industry:"trades",role:"hero",orientation:"landscape",negativeSpace:"left",minWidth:1200}).map(i=>i.id),[item.id]);
  assert.equal(searchStock([item],{orientation:"portrait"}).length,0);
  assert.equal(searchStock([item],{text:"dentistry"}).length,0);
});
test("section retrieval finds relevant later assets before the eight-candidate inference cap",()=>{
  const assets=Array.from({length:12},(_,i)=>({...asset(`early-${i}`),description:"Office meeting"}));assets.push({...asset("roof"),description:"Hands repairing slate roof tiles"});
  const result=shortlistForSlot(assets,{id:"roof-repair",route:"/",purpose:"Explain slate roof repairs"});assert.equal(result.length,8);assert.equal(result[0]!.id,"roof");
});
test("catalog readers preserve v1 and reject stale inspections or duplicate ids",()=>{
  const root=temp(),path=join(root,"catalog.json");const item=stock();save(path,{version:1,items:[item]});assert.equal(readStockCatalog(path).items[0]!.id,item.id);
  save(path,{version:2,items:[item,item]});assert.throws(()=>readStockCatalog(path),/duplicate/);
  save(path,{version:2,items:[{...item,sha256:"0".repeat(64)}]});assert.throws(()=>readStockCatalog(path),/Stale inspection/);
});
test("stock imports are local, hash pinned, idempotent and cannot overwrite identity assets",async()=>{
  const root=temp(),item=stock(),cacheRoot=cache(item);const founder={...asset("founder"),origin:"customer" as const,identity:"founder" as const,identityEvidence:["onboarding/copy/about.md"]};
  save(join(root,"onboarding/media-inventory.json"),{version:2,harvestHash:"h",assets:[founder]});
  const id=await importStock({root,cacheRoot,item,reason:"Service illustration",placements:["/"]});
  await importStock({root,cacheRoot,item,reason:"Service illustration",placements:["/services"]});
  const inv=json<MediaInventory>(join(root,"onboarding/media-inventory.json"));assert.deepEqual(inv.assets[0],founder);assert.equal(inv.assets.length,2);
  const imported=inv.assets.find(a=>a.id===id)!;assert.deepEqual(imported.placements,["/","/services"]);assert.equal(digest(readFileSync(join(root,imported.path))),item.sha256);
  writeFileSync(join(cacheRoot,item.src),"changed");await assert.rejects(stockBytes(item,cacheRoot),/changed/);
});
test("identity constraints protect logos and founders even when stock is attractive",()=>{
  const slot={id:"founder",route:"/about",purpose:"Meet our founder",identity:"founder" as const};
  assert.equal(eligibleForSlot(asset(),slot),false);
  const founder={...asset(),origin:"customer" as const,identity:"founder" as const,identityEvidence:["captured about page"]};assert.equal(eligibleForSlot(founder,slot),true);
  assert.equal(eligibleForSlot({...founder,identityEvidence:[]},slot),false);
  assert.match(checkMediaIdentity([{...founder,origin:"stock"}]).join(),/stock cannot/);
  assert.match(checkMediaIdentity([{...founder,disposition:"exclude"}]).join(),/explicit decision/);
});
test("selection accounts for original identity and checks actual rendered placement",()=>{
  const root=temp();const founder={...asset("founder"),origin:"customer" as const,identity:"founder" as const,identityEvidence:["onboarding/brief.json"]};save(join(root,"onboarding/brief.json"),{founder:"Captured fixture identity"});save(join(root,"onboarding/media-inventory.json"),{version:2,harvestHash:"h",assets:[founder]});
  assert.throws(()=>saveSelection(root,{version:1,placements:[]}),/omitted/);
  saveSelection(root,{version:1,placements:[{slot:{id:"founder",route:"/about",purpose:"Meet founder",identity:"founder"},assetId:"founder",reason:"Original portrait"}]});
  assert.match(validateRenderedMedia(root).join(),/missing from rendered/);mkdirSync(join(root,"dist/about"),{recursive:true});writeFileSync(join(root,"dist/about/index.html"),'<img src="/media/a.jpg">');assert.deepEqual(validateRenderedMedia(root),[]);
});
test("no suitable candidate is explicit; failed Jev results are not low scores",async()=>{
  const root=temp(),mock=client(root);const slot={id:"logo",route:"/",purpose:"Our identity",identity:"logo" as const};
  const empty=await rankMedia({client:mock.c,nodeId:"storyboard",context:"business",slot,assets:[asset()]});assert.equal(empty.noMatch,true);assert.equal(mock.calls(),0);
  const unmetered=await rankMedia({nodeId:"storyboard",context:"business",slot:{...slot,identity:"none"},assets:[asset()]});assert.equal(unmetered.noMatch,false);assert.equal(unmetered.shortlist[0]!.score,undefined);
});
test("Jev ranking receipts cache unchanged evidence and invalidate changed context",async()=>{
  const root=temp(),mock=client(root);const args={client:mock.c,nodeId:"storyboard",context:"Roof repairs",slot:{id:"service",route:"/",purpose:"Explain repairs"},assets:[asset()]};
  const first=await rankMedia(args);assert.equal(first.state,"observed");assert.equal(first.receipts.length,1);assert.ok(existsSync(first.receipts[0]!));
  await rankMedia(args);assert.equal(mock.calls(),1);await rankMedia({...args,context:"Different business"});assert.equal(mock.calls(),2);
});
test("media assistance isolates off and shadow, binds receipts, and exposes assist",async()=>{
  for(const mode of ["off","shadow","assist"] as const){const root=temp(),kernel=temp(),mock=client(root);
    save(join(root,"onboarding/media-inventory.json"),{version:2,harvestHash:"h",assets:[asset()]});save(join(root,"onboarding/media-requests.json"),{slots:[{id:"service",route:"/",purpose:"Service detail"}]});
    const note=await prepareMediaAssistance({root,kernel,stage:"storyboard",preparationId:"prep",capabilities:{...DEFAULT_JEV_CAPABILITIES,mediaSelection:mode},client:mock.c});
    assert.equal(mock.calls(),mode==="off"?0:1);assert.equal(Boolean(note),mode==="assist");if(mode!=="off"){const report=json<any>(join(root,"agent/runs/prep.media-assist.json"));assert.equal(report.preparationId,"prep");assert.ok(report.subjectHash);}
  }
});
test("new media capabilities obey global off and survive task registry reset",()=>{
  const config={...DEFAULT_JEV_CONFIG,capabilities:{mediaSelection:"assist" as const}};assert.equal(resolveEffectiveCapabilities(config).mediaSelection,"off");assert.equal(jevClientRequired(config),false);
  assert.equal(jevClientRequired({...config,mode:"assist"}),true);initDefaultRegistry();assert.ok(allTasks().some(t=>t.taskId==="media-section-ranking"));
});
test("video import includes a pinned local poster and validates missing fallback",async()=>{
  const root=temp(),item={...stock(),id:"clip",kind:"video" as const,src:"/stock/videos/clip.mp4",duration:8};const cacheRoot=cache(item);
  save(join(root,"onboarding/media-inventory.json"),{version:2,harvestHash:"h",assets:[]});await importStock({root,item,cacheRoot,reason:"Contextual motion",placements:["/"]});
  const inv=json<MediaInventory>(join(root,"onboarding/media-inventory.json"));assert.ok(inv.assets[0]!.poster);assert.deepEqual(validateMediaSelection(root),[]);
  delete inv.assets[0]!.poster;save(join(root,"onboarding/media-inventory.json"),inv);assert.match(validateMediaSelection(root).join(),/poster/);
});

test("classification, set review and provenance checks persist bounded mock judgments",async()=>{
  const root=temp(),kernel=temp();save(join(root,"launch.json"),{name:"Test"});save(join(root,"onboarding/media-inventory.json"),{version:2,harvestHash:"h",assets:[asset()]});
  const mock=client(root,body=>Object.fromEntries(Object.entries(body.questions as Record<string,{criteria:Record<string,string>}>).map(([key,q])=>{const selected=Object.keys(q.criteria)[0]!;return [key,{type:"choice",choice:selected,confidence:0.9,probabilities:{[selected]:1}}]})));
  const capabilities={...DEFAULT_JEV_CAPABILITIES,mediaClassification:"assist" as const,mediaSetReview:"assist" as const,mediaProvenance:"assist" as const};
  await prepareMediaAssistance({root,kernel,stage:"media",preparationId:"media",capabilities,client:mock.c});
  await prepareMediaAssistance({root,kernel,stage:"representative",preparationId:"rep",capabilities,client:mock.c});
  assert.equal(mock.calls(),3);for(const prep of ["media","rep"]) {const report=json<any>(join(root,`agent/runs/${prep}.media-assist.json`));assert.ok(report.results.every((r:any)=>r.state==="observed"&&r.receipts.length));}
});

test("Jev budget stops additional candidates while preserving an unavailable fallback",async()=>{
  const root=temp();let calls=0;const c=new JevClient({root,config:{...DEFAULT_JEV_CONFIG,mode:"assist",maxRetries:0,pilotBudget:{maxTransportAttempts:1,maxInputTokens:20000}},fetch:async()=>{calls++;return new Response(JSON.stringify({model:DEFAULT_JEV_CONFIG.model,answers:Object.fromEntries(["semantic","composition","style"].map(k=>[k,{type:"score",score:3,confidence:0.9}])),usage:{input_tokens:20,output_tokens:5}}),{status:200});}});
  const result=await rankMedia({client:c,nodeId:"storyboard",context:"Service",slot:{id:"service",route:"/",purpose:"Illustration"},assets:[asset("first"),asset("second")]});
  assert.equal(calls,1);assert.equal(result.state,"partial");assert.equal(result.noMatch,false);assert.equal(result.shortlist[1]!.state,"unavailable");
});

test("public preparation invokes media Jev and completion rejects stock identity misuse",async()=>{
  const root=temp(),kernel=temp();const graph:SkillGraph={version:2,stop_at:"media",nodes:[{id:"media",kind:"agent",needs:[],inputs:[],writes:["onboarding/media-inventory.json"],refs:[],tools:[],eval:"media",maxAttempts:2}]};const state=initialState(graph);
  save(join(root,"agent/graph.yaml"),graph);save(join(root,"agent/STATE.json"),state);writeFileSync(join(root,"agent/PROMPT.md"),"Inspect media");save(join(root,"launch.json"),{name:"Test"});save(join(root,"onboarding/media-inventory.json"),{version:2,harvestHash:"h",assets:[asset()]});
  const mock=client(root,body=>Object.fromEntries(Object.entries(body.questions as Record<string,{criteria:Record<string,string>}>).map(([key,q])=>{const selected=Object.keys(q.criteria)[0]!;return [key,{type:"choice",choice:selected,confidence:0.9,probabilities:{[selected]:1}}]})));
  const prep=await prepareStage({root,kernel,graph,state,nodeId:"media",promptOverride:"Inspect media",jevClient:mock.c,jevConfig:{...DEFAULT_JEV_CONFIG,mode:"assist",capabilities:{mediaClassification:"assist"}}});
  assert.equal(mock.calls(),1);assert.ok(existsSync(join(root,`agent/runs/${prep.preparation!.id}.media-assist.json`)));
  save(join(root,"onboarding/media-inventory.json"),{version:2,harvestHash:"h",assets:[{...asset(),identity:"founder",identityEvidence:["source"]}]});
  const result=await completeStage({root,kernel,graph,state,preparationId:prep.preparation!.id,evaluate:()=>({failures:[]})});assert.equal(result.ok,false);assert.match(result.failures.join(),/stock cannot/);
});


test("managed stock server can recover pinned legacy originals without accepting changed provider bytes",async()=>{
  const item={...stock(),src:"/stock/images/"+digest(bytes)+".jpg",legacySrc:"/stock/images/legacy.jpg"};
  const server=createServer((req,res)=>{if(req.url===item.legacySrc){res.writeHead(200);res.end(bytes);}else{res.writeHead(404);res.end();}});await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  try {const port=(server.address() as {port:number}).port;const actual=await stockBytes(item,temp(),false,`http://127.0.0.1:${port}`);assert.equal(digest(actual),item.sha256);}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
