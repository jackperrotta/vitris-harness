import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { json, save, fingerprint, type MediaInventory } from "./agent/artifacts.ts";
import { initialState, parseGraphYaml } from "./agent/graph.ts";
import { applyArtDirectionGraph, artDirectionPolicy } from "./agent/art-direction-policy.ts";
import { registerProducedAsset, byteHash, assertSafeSvg, validateAssetProduction, type VisualAssetBrief, type VisualCommission } from "./agent/art-direction.ts";
import { scaffoldNestedSite } from "./agent/design-copy.ts";
import { loadSiteGraph, runWorkflow } from "./agent/workflow.ts";
import { prepareStage, completeStage, cancelStage } from "./agent/lifecycle.ts";
import { validateAddedMedia } from "./agent/added-media.ts";
import { reviseMedia } from "./agent/media-revision.ts";
import { produceRaster, responsiveDiagram } from "./agent/art-production-tools.ts";
import { acquireSiteStock } from "./stock/site-acquisition.ts";
import { searchStock, selectStockSet } from "./stock/search.ts";
import { reopenMediaForAdded } from "./agent/trials.ts";
import { completedMediaCoversAdditions } from "./agent/trials.ts";
import { buildCreativeContextPacket } from "./agent/creative-context.ts";
import { buildEvidenceIndex } from "./agent/creative-evidence.ts";
import { createCreativeEfficiencyPolicy } from "./agent/creative-efficiency.ts";
import { inspectProducedAsset, retireProducedAsset } from "./agent/art-direction.ts";
import { buildDesignContextPacket } from "./agent/design-context-packet.ts";
import { savePreparation, loadPreparation } from "./agent/preparation.ts";
import { inputHash, instructionContractHash, reconcile } from "./agent/runner.ts";
import { computeNextState } from "./agent/state-transition.ts";
import { evaluateV2 } from "./agent/evaluate.ts";
const kernel=resolve(import.meta.dirname,"..");
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="#edf0f2"/><text x="30" y="100">Discuss → Review → Choose</text></svg>';
const commission:VisualCommission={id:"process",purpose:"Understand the next step",route:"/",factIds:["f1"],sourceAssetIds:[],role:"explanation",medium:"authored-vector",idea:"A supported relationship",composition:"Three equal editable labels",responsive:{desktop:"Horizontal",mobile:"Stack with explicit edges",minimumReadableSize:"18px"},acceptance:["Relationships remain readable at 375px"],fallback:"A short ordered list",forbiddenImplications:["No measured duration or fabricated outcome"],referenceRelationships:["Reading order supports the next action"],diagram:{nodes:[{id:"discuss",label:"Discuss",factIds:["f1"]},{id:"review",label:"Review",factIds:["f1"]},{id:"choose",label:"Choose",factIds:["f1"]}],edges:[{from:"discuss",to:"review",label:"Then",factIds:["f1"]},{from:"review",to:"choose",label:"Then",factIds:["f1"]}],description:"Discuss needs, review options, then choose."}};
async function fixture(mode:"theme-v1"|"composition-v1"="theme-v1"){
  const root=mkdtempSync(join(tmpdir(),"vitris-art-"));
  scaffoldNestedSite({dest:root,kernel,parent:root,slug:"fictional-art-test",name:"Fictional engineering test"});
  save(join(root,"launch.json"),{artDirection:{mode:"media-v1",release:"2026-10-05.1"},...(mode==="composition-v1"?{designAuthoring:{mode,lessonRelease:"2026-09-28.1"}}:{})});
  save(join(root,"agent/jev.json"),{mode:"off"});
  save(join(root,"onboarding/business.json"),{version:2,offer:"Discuss needs",audience:"Fictional readers",facts:[{id:"f1",claim:"Discuss needs, review options, then choose.",evidence:["e1"]}],evidence:[{id:"e1",source:"onboarding/brief.json",excerpt:"Discuss needs"}]});
  save(join(root,"onboarding/direction.json"),{version:2,designContractVersion:1,centralIdea:"Synthetic engineering process fixture",system:{personality:"Clear"}});
  save(join(root,"onboarding/reference-analysis.json"),{teachingPrinciples:[{lessonId:"synthetic-engineering-fixture",application:"Unit-test contract stub, not inspected reference evidence"}]});
  save(join(root,"onboarding/media-inventory.json"),{version:2,harvestHash:"test",assets:[]});
  const graph=loadSiteGraph(root),state=initialState(graph);
  // Synthetic predecessor receipts only for focused lifecycle testing; never pilot evidence.
  for(const n of graph.nodes.slice(0,graph.nodes.findIndex(n=>n.id==="asset-production")))state.nodes[n.id]={status:"done",attempts:1};
  const prepared=await prepareStage({root,kernel,graph,state,nodeId:"asset-production"});
  const brief:VisualAssetBrief={version:1,policyHash:artDirectionPolicy(root)!.hash,businessHash:fingerprint(root,["onboarding/business.json"]),directionHash:fingerprint(root,["onboarding/direction.json"]),system:{palette:"blue",lightMaterial:"paper",geometry:"rectangular",stroke:"1px",captionVoice:"direct",motion:"static"},commissions:[structuredClone(commission)]};
  save(join(root,"onboarding/visual-asset-brief.json"),brief);
  save(join(root,"artwork/recipe.json"),{source:"Authored geometric SVG",facts:["f1"]});
  writeFileSync(join(root,"artwork/process.svg"),svg);
  const options={preparationId:prepared.preparation!.id,operationId:"process-v1",requestId:"process",input:"artwork/process.svg",sourcePath:"artwork/recipe.json",method:"authored-vector" as const,tool:"editable-svg",rights:"Original fictional teaching artwork",forbiddenImplications:commission.forbiddenImplications};
  return {root,graph,state,prepared,options};
}
test("policy is independent and absent policy leaves the legacy graph byte-for-byte",()=>{
  const root=mkdtempSync(join(tmpdir(),"vitris-art-policy-")), graph=parseGraphYaml(readFileSync(join(kernel,"agent/graph.yaml"),"utf8")), before=JSON.stringify(graph);
  assert.equal(JSON.stringify(applyArtDirectionGraph(root,graph)),before);
  save(join(root,"launch.json"),{artDirection:{mode:"media-v1",release:"2026-10-05.1"},designAuthoring:{mode:"theme-v1"}});
  applyArtDirectionGraph(root,graph);assert.deepEqual(graph.nodes.find(n=>n.id==="storyboard")!.needs,["asset-production"]);assert.equal(graph.nodes.filter(n=>n.id==="asset-production").length,1);
});

test("inspection recovery reopens media and invalidates production snapshots instead of restoring stale rows",async()=>{
  const f=await fixture();
  const oldFacts=fingerprint(f.root,["onboarding/business.json"]);
  const snapshotId=f.prepared.preparation!.id;
  const result=reviseMedia(f.root,{operationId:"recover-upstream-inspection",kind:"inspection",request:"Inspect existing customer bytes at the media owner before resealing production",routes:["/"],preserve:["customer facts","original media bytes"]});
  assert.equal(result.owner,"media");
  assert.equal(loadPreparation(f.root,snapshotId)!.status,"invalidated");
  const state=json<any>(join(f.root,"agent/STATE.json"));
  assert.equal(state.nodes.media.status,"pending");
  assert.equal(state.nodes["asset-production"].status,"pending");
  assert.equal(fingerprint(f.root,["onboarding/business.json"]),oldFacts);
  await assert.rejects(()=>completeStage({root:f.root,kernel,graph:f.graph,state,preparationId:snapshotId,evaluate:()=>({node:"asset-production",ok:true,failures:[]})}),/invalidated preparation/);
});

test("upstream inspection mutation is rejected; freshly sealed media rows survive production unchanged",async()=>{
  const f=await fixture();
  cancelStage({root:f.root,preparationId:f.prepared.preparation!.id,reason:"Synthetic lifecycle regression: create audited customer fixture"});
  const inventory=json<any>(join(f.root,"onboarding/media-inventory.json"));
  inventory.assets=[{id:"customer-synthetic",role:"project",kind:"image",identity:"Synthetic engineering fixture",identityEvidence:"Test source",alt:"Synthetic test",width:600,height:200,path:"/media/test.svg",origin:"customer",sources:["https://example.invalid/test.svg"],sha256:byteHash(svg),inspected:true,disposition:"use",placements:["/"],reason:"Synthetic fixture"}];
  save(join(f.root,"onboarding/media-inventory.json"),inventory);
  const first=await prepareStage({root:f.root,kernel,graph:f.graph,state:f.state,nodeId:"asset-production"});
  inventory.assets[0].inspection={assetHash:byteHash(svg),description:"Synthetic engineering test",evidence:["artwork/process.svg"]};save(join(f.root,"onboarding/media-inventory.json"),inventory);
  const failed=await completeStage({root:f.root,kernel,graph:f.graph,state:f.state,preparationId:first.preparation!.id,evaluate:()=>({node:"asset-production",ok:true,failures:[]})});
  assert.ok(failed.failures.some(e=>e.includes("Production changed audited upstream asset")));
  // Focused synthetic lifecycle fixture: model the correctly resealed owner; never full-workflow evidence.
  const second=await prepareStage({root:f.root,kernel,graph:f.graph,state:failed.state!,nodeId:"asset-production"});
  const passed=await completeStage({root:f.root,kernel,graph:f.graph,state:failed.state!,preparationId:second.preparation!.id,evaluate:()=>({node:"asset-production",ok:true,failures:[]})});
  assert.deepEqual(passed.failures,[]);
});
test("prepared production contract survives a fresh graph load",async()=>{
  const f=await fixture();
  const fresh=loadSiteGraph(f.root);
  assert.deepEqual(fresh.nodes.find(n=>n.id==="asset-production"),f.graph.nodes.find(n=>n.id==="asset-production"));
  const result=await completeStage({root:f.root,kernel,graph:fresh,state:f.state,preparationId:f.prepared.preparation!.id,evaluate:()=>({node:"asset-production",ok:true,failures:[]})});
  assert.deepEqual(result.failures,[]);
});
test("producing a brief preserves factual approval inputs while changing downstream composition inputs",async()=>{
  const f=await fixture(),business=f.graph.nodes.find(n=>n.id==="business")!,review=f.graph.nodes.find(n=>n.id==="business-review")!,story=f.graph.nodes.find(n=>n.id==="storyboard")!;
  const before=[inputHash(f.root,business),inputHash(f.root,review),inputHash(f.root,story)];
  const brief=json<VisualAssetBrief>(join(f.root,"onboarding/visual-asset-brief.json"));brief.system.captionVoice="New visual caption treatment";save(join(f.root,"onboarding/visual-asset-brief.json"),brief);
  assert.equal(inputHash(f.root,business),before[0]);assert.equal(inputHash(f.root,review),before[1]);assert.notEqual(inputHash(f.root,story),before[2]);
});

test("preview honors opted-in historical audits but checks them again when production has not started",async()=>{
  const f=await fixture();
  f.state.nodes["asset-production"]!.attempts=1;
  save(join(f.root,"agent/STATE.json"),f.state);
  const historical=evaluateV2(f.root,"preview");
  assert.ok(!historical.failures.some(message=>message.startsWith("narrative:")));
  // A merely planned production node cannot suppress an unresolved audit.
  f.state.nodes["asset-production"]!.attempts=0;
  save(join(f.root,"agent/STATE.json"),f.state);
  assert.ok(evaluateV2(f.root,"preview").failures.some(message=>message.startsWith("narrative:")));
});
test("completion records the current instruction identity so resumed historical media remains sealed",async()=>{
  const f=await fixture(),media={...f.graph.nodes.find(n=>n.id==="media")!,needs:[]},production={...f.graph.nodes.find(n=>n.id==="asset-production")!,needs:["media"],inputs:[],optionalInputs:[],writes:[]};
  const graph={...f.graph,nodes:[media,production]},initial=initialState(graph);
  let state=computeNextState({root:f.root,graph,currentState:initial,node:media,failures:[]});
  assert.equal(state.nodes.media!.skillHash,instructionContractHash(f.root,media));
  state=computeNextState({root:f.root,graph,currentState:state,node:production,failures:[]});
  const inv=json<MediaInventory>(join(f.root,"onboarding/media-inventory.json"));inv.assets=[];inv.harvestHash="changed-by-production";save(join(f.root,"onboarding/media-inventory.json"),inv);
  reconcile(f.root,graph,state);
  assert.equal(state.nodes.media!.status,"done");
  assert.equal(state.nodes["asset-production"]!.status,"done");
});
test("real registration is idempotent, starts uninspected, and survives interruption after intent",async()=>{
  const f=await fixture(),a=registerProducedAsset(f.root,f.options);assert.equal(a.inspected,false);assert.equal(a.sha256,byteHash(svg));
  assert.deepEqual(registerProducedAsset(f.root,f.options),a);
  const inv=json<MediaInventory>(join(f.root,"onboarding/media-inventory.json"));inv.assets=[];save(join(f.root,"onboarding/media-inventory.json"),inv);
  const op=json<any>(join(f.root,"onboarding/asset-operations/process-v1.json"));op.status="intent";save(join(f.root,"onboarding/asset-operations/process-v1.json"),op);
  assert.equal(registerProducedAsset(f.root,f.options).sha256,a.sha256);
  assert.deepEqual(validateAddedMedia(f.root,json<MediaInventory>(join(f.root,"onboarding/media-inventory.json"))).findings,[]);
  writeFileSync(join(f.root,"artwork/process.svg"),svg.replace("#edf0f2","#ffffff"));assert.throws(()=>registerProducedAsset(f.root,f.options),/identity changed|conflicts/);
});
test("acceptance is separate, completion consumes owner and revision invalidates dependents without changing facts",async()=>{
  const f=await fixture(),a=registerProducedAsset(f.root,f.options);assert.match(validateAssetProduction(f.root).join(),/asset-production|ENOENT/);
  const inv=json<MediaInventory>(join(f.root,"onboarding/media-inventory.json"));Object.assign(inv.assets[0]!,{inspected:true,disposition:"use",placements:["/"],width:600,height:200,inspection:{assetHash:a.sha256,evidence:["artwork/process.svg"],description:"Editable geometric sequence"}});save(join(f.root,"onboarding/media-inventory.json"),inv);
  save(join(f.root,"onboarding/asset-production.json"),{version:1,briefHash:fingerprint(f.root,["onboarding/visual-asset-brief.json"]),decisions:[{requestId:"process",assetIds:[a.id],outcome:"accepted",reason:"Inspected test SVG",evidence:[{path:"artwork/process.svg",sha256:a.sha256,level:"asset",viewport:"600",observation:"Synthetic engineering evidence: editable labels"}]}]});
  assert.deepEqual(validateAssetProduction(f.root),[]);
  const done=await completeStage({root:f.root,kernel,graph:f.graph,state:f.state,preparationId:f.prepared.preparation!.id});assert.deepEqual(done.failures,[]);
  const bindings=validateAddedMedia(f.root,inv).bindings;assert.ok(completedMediaCoversAdditions(f.root,f.graph,done.state,bindings));
  assert.throws(()=>registerProducedAsset(f.root,{...f.options,operationId:"process-v2"}),/active asset-production/);
  const facts=fingerprint(f.root,["onboarding/business.json"]);const revised=reviseMedia(f.root,{operationId:"revise-illustration-v2",kind:"illustration",request:"Enlarge labels",routes:["/"],preserve:["facts"]});assert.equal(revised.owner,"asset-production");assert.equal(fingerprint(f.root,["onboarding/business.json"]),facts);assert.equal(json<any>(join(f.root,"agent/STATE.json")).nodes.storyboard.status,"pending");
});
test("derived provenance cannot be relabeled and accepted recipe/hash changes are integrity failures",async()=>{
  const f=await fixture(),a=registerProducedAsset(f.root,f.options),inv=json<MediaInventory>(join(f.root,"onboarding/media-inventory.json"));
  writeFileSync(join(f.root,"artwork/crop.svg"),svg.replace("200","210"));const d=registerProducedAsset(f.root,{...f.options,operationId:"crop-v1",input:"artwork/crop.svg",method:"derived",parents:[a.id]});assert.equal(d.origin,"authored");
  const current=json<MediaInventory>(join(f.root,"onboarding/media-inventory.json")),accepted=validateAddedMedia(f.root,current).bindings;assert.equal(accepted.length,2);
  current.assets[1]!.origin="customer";assert.ok(validateAddedMedia(f.root,current,new Set(),accepted).findings.some(f=>f.category==="integrity"));
  save(join(f.root,"artwork/recipe.json"),{changed:true});assert.ok(validateAddedMedia(f.root,inv,new Set(),accepted).findings.some(f=>f.category==="integrity"));
});
test("path escapes, unsafe SVG and foreign-owner registration fail closed",async()=>{
  const f=await fixture();assert.throws(()=>registerProducedAsset(f.root,{...f.options,input:"../escape.svg"}),/escape|Invalid|outside/);
  for(const text of ['<svg><script>alert(1)</script></svg>','<svg><image href="https://x"/></svg>','<svg onload="x"/>','<svg><foreignObject/></svg>'])assert.throws(()=>assertSafeSvg(text),/Unsafe/);
  const prep=loadPreparation(f.root,f.options.preparationId)!;prep.nodeId="creative-revision";savePreparation(f.root,prep);assert.throws(()=>registerProducedAsset(f.root,f.options),/immutable/);
});
test("unavailable adapters and uncertain dispatch never replay external work",async()=>{
  const root=mkdtempSync(join(tmpdir(),"vitris-art-provider-"));assert.equal((await produceRaster(root,"no-tool",commission)).status,"unavailable");let calls=0;
  const adapter={identity:"mock-only",generate:async()=>{calls++;throw Error("connection interrupted");}};assert.equal((await produceRaster(root,"uncertain-tool",commission,adapter)).status,"unknown");await produceRaster(root,"uncertain-tool",commission,adapter);assert.equal(calls,1);
  const opts={root,operationId:"no-provider",query:{text:"unmatchable"},catalog:[],fallback:"Editable text",maxCandidates:2,maxBytes:10000};assert.equal((await acquireSiteStock(opts)).status,"unavailable");
  let requests=0;const liveMock={...opts,operationId:"empty-provider",key:"test-not-real",transport:async()=>{requests++;return new Response(JSON.stringify({photos:[]}));}};assert.equal((await acquireSiteStock(liveMock)).status,"no-match");await acquireSiteStock(liveMock);assert.equal(requests,1);
});
test("semantic diagrams keep all relationship text and direction on mobile",()=>{const html=responsiveDiagram(commission);for(const text of ["Discuss → Review: Then","Review → Choose: Then","Discuss needs, review options, then choose."])assert.ok(html.includes(text));const invalid=structuredClone(commission);invalid.diagram!.edges[0]!.to="missing";assert.throws(()=>responsiveDiagram(invalid),/Invalid/);});
test("stock visual intent respects hard facets, uncertainty, no-match and nonduplicate sets",()=>{
  const items=json<any>(join(kernel,"src/stock/catalog.json")).items;
  assert.equal(searchStock(items,{subject:"zzznoassetzzzz"}).length,0);
  const rows=selectStockSet(items,[{text:"garden"},{text:"garden"}]);const ids=rows.map(r=>r.item?.id).filter(Boolean);assert.equal(new Set(ids).size,ids.length);assert.ok(rows.every(r=>r.uncertainty.length));
});
test("ordinary context delivers brief and full inventory; generated resume routes to production",async()=>{
  const f=await fixture(),a=registerProducedAsset(f.root,f.options);const packet=buildDesignContextPacket({root:f.root,kernel,nodeId:"storyboard"});assert.ok(packet.text.includes("Understand the next step"));assert.ok(packet.expansions.some(e=>e.id==="art-media-inventory"));
  const checked=validateAddedMedia(f.root,json<MediaInventory>(join(f.root,"onboarding/media-inventory.json")));f.state.nodes["asset-production"]={status:"done",attempts:1};assert.ok(reopenMediaForAdded(f.graph,f.state,checked,[]));assert.equal(f.state.nodes["asset-production"]!.status,"pending");assert.equal(f.state.nodes.media!.status,"done");assert.ok(a.production);
});

test("composition authoring and compact creative context receive declared commissions",async()=>{
  const f=await fixture("composition-v1");
  const policy=createCreativeEfficiencyPolicy(f.root,["--creative-efficiency","--compact-packets","--no-jev"]);
  const packet=await buildCreativeContextPacket({root:f.root,kernel,node:{id:"art-creative-plan",needs:[],refs:[],writes:[],tools:[],eval:"plan",maxAttempts:2},role:"plan",objective:"Understand the next step",sourceRevision:"test",baseContract:"Keep facts",policy,config:policy.config,evidence:buildEvidenceIndex(f.root),retrievedIds:[],mandatorySkillIds:[],optionalSkillIds:[],constraints:[],obligations:["Preserve supported facts"],findings:[],renderIds:[]});
  assert.ok(packet.prompt.includes("visual-asset-brief.json"));assert.ok(packet.prompt.includes("Understand the next step"));assert.equal(packet.manifest.authoringPolicy && (packet.manifest.authoringPolicy as {mode:string}).mode,"composition-v1");
});

test("production completion cannot mutate an upstream audit and dimensions come from bytes",async()=>{
  const f=await fixture(),a=registerProducedAsset(f.root,f.options);
  const inspection={version:1 as const,assetHash:a.sha256!,observedAt:new Date().toISOString(),observer:"synthetic-test",description:"Editable sequence",evidence:["artwork/process.svg"],subjects:[],activities:[],settings:[],industries:[],roles:["explanation"],palette:[],lighting:"flat",density:"low" as const,focalPoint:"center",negativeSpace:[],cropNotes:"Keep labels",visibleText:true,uncertainty:[]};
  assert.throws(()=>inspectProducedAsset(f.root,{preparationId:f.options.preparationId,assetId:a.id,inspection,width:601,height:200,placements:["/"],reason:"Engineering test"}),/dimensions/);
  const prep=loadPreparation(f.root,f.options.preparationId)!;prep.mediaAuditSnapshot=JSON.stringify({version:2,harvestHash:"original",assets:[]});savePreparation(f.root,prep);
  const result=await completeStage({root:f.root,kernel,graph:f.graph,state:f.state,preparationId:prep.id,evaluate:()=>({failures:[]})});assert.ok(result.failures.includes("Production changed upstream audit provenance"));
});

test("factual revisions reopen the sibling media audit without modifying either source",async()=>{
  const f=await fixture(); const before=fingerprint(f.root,["onboarding/business.json","onboarding/media-inventory.json"]);
  save(join(f.root,"agent/STATE.json"),f.state);
  const r=reviseMedia(f.root,{operationId:"correct-source-fact",kind:"factual",request:"Correct the captured scope before changing the visual",routes:["/"],preserve:["original bytes"]});
  const state=json<any>(join(f.root,"agent/STATE.json"));
  assert.equal(r.owner,"business");assert.equal(state.nodes.media.status,"pending");assert.equal(state.nodes.business.status,"pending");
  assert.equal(fingerprint(f.root,["onboarding/business.json","onboarding/media-inventory.json"]),before);
});

test("accepted production retirement requires a current receipt and preserves inspection and bytes",async()=>{
  const f=await fixture(),a=registerProducedAsset(f.root,f.options);
  const inv=json<MediaInventory>(join(f.root,"onboarding/media-inventory.json"));Object.assign(inv.assets[0]!,{inspected:true,disposition:"use",placements:["/"],inspection:{assetHash:a.sha256}});save(join(f.root,"onboarding/media-inventory.json"),inv);
  const prep=loadPreparation(f.root,f.options.preparationId)!;prep.mediaAuditSnapshot=JSON.stringify(inv);savePreparation(f.root,prep);
  const before=JSON.stringify(inv.assets[0]!.inspection);
  const retired=retireProducedAsset(f.root,{preparationId:prep.id,operationId:"retire-process-v1",assetId:a.id,reason:"Replaced by the next immutable version"});
  assert.equal(retired.disposition,"retain");assert.equal(JSON.stringify(retired.inspection),before);assert.equal(byteHash(readFileSync(join(f.root,a.path.slice(1)))),a.sha256);
  const done=await completeStage({root:f.root,kernel,graph:f.graph,state:f.state,preparationId:prep.id,evaluate:()=>({node:"asset-production",ok:true,failures:[]})});assert.deepEqual(done.failures,[]);
});

// Synthetic engineering regression: exercise the interactive workflow entry,
// whose reconciliation precedes completeStage. This is not campaign evidence.
async function interactiveProductionFixture() {
  const f = await fixture();
  let state = initialState(f.graph);
  for (const node of f.graph.nodes.slice(0, f.graph.nodes.findIndex(n => n.id === 'asset-production'))) {
    state = computeNextState({ root: f.root, graph: f.graph, currentState: state, node, failures: [] });
  }
  save(join(f.root, 'agent/STATE.json'), state);
  const asset = registerProducedAsset(f.root, f.options);
  const inventory = json<MediaInventory>(join(f.root, 'onboarding/media-inventory.json'));
  Object.assign(inventory.assets[0]!, { inspected: true, disposition: 'use', placements: ['/'], width: 600, height: 200,
    inspection: { assetHash: asset.sha256, evidence: ['artwork/process.svg'], description: 'Synthetic engineering SVG inspection fixture' } });
  save(join(f.root, 'onboarding/media-inventory.json'), inventory);
  save(join(f.root, 'onboarding/asset-production.json'), { version: 1, briefHash: fingerprint(f.root, ['onboarding/visual-asset-brief.json']),
    decisions: [{ requestId: 'process', assetIds: [asset.id], outcome: 'accepted', reason: 'Synthetic engineering evidence',
      evidence: [{ path: 'artwork/process.svg', sha256: asset.sha256, level: 'asset', viewport: '600', observation: 'Synthetic editable labels fixture' }] }] });
  return { ...f, state };
}

test('first interactive production completes through workflow reconciliation with zero prior attempts', async () => {
  const f = await interactiveProductionFixture();
  assert.equal(f.state.nodes['asset-production']!.attempts, 0);
  const result = await runWorkflow({ root: f.root, kernel, argv: ['--complete', '--preparation', f.prepared.preparation!.id, '--no-preview-server'], log: () => {} });
  assert.equal(result.exitCode, 0);
  assert.equal(result.state.nodes['asset-production']!.status, 'done');
  assert.equal(result.state.nodes.media!.status, 'done');
  assert.equal(loadPreparation(f.root, f.prepared.preparation!.id)!.status, 'consumed');
});

test('prepared ownership still rejects changed upstream audit provenance on interactive completion', async () => {
  const f = await interactiveProductionFixture();
  const inv = json<MediaInventory>(join(f.root, 'onboarding/media-inventory.json'));
  inv.harvestHash = 'unauthorized-upstream-change';
  save(join(f.root, 'onboarding/media-inventory.json'), inv);
  const result = await runWorkflow({ root: f.root, kernel, argv: ['--complete', '--preparation', f.prepared.preparation!.id, '--no-preview-server'], log: () => {} });
  assert.notEqual(result.exitCode, 0);
  const prep = loadPreparation(f.root, f.prepared.preparation!.id)!;
  assert.ok(prep.result?.failures.some(message => /upstream audit provenance/.test(message)));
});

test('canceled first production preparation cannot conceal a changed early audit', async () => {
  const f = await interactiveProductionFixture();
  cancelStage({ root: f.root, preparationId: f.prepared.preparation!.id, reason: 'Synthetic cancellation regression' });
  reconcile(f.root, f.graph, f.state);
  assert.equal(f.state.nodes.media!.status, 'pending');
});

test('expired first production lease cannot conceal a changed early audit', async () => {
  const f = await interactiveProductionFixture();
  const path = join(f.root, 'agent/leases/stage-asset-production.json');
  const lease = json<Record<string, unknown>>(path);
  lease.expiresAt = '2000-01-01T00:00:00.000Z';
  save(path, lease);
  reconcile(f.root, f.graph, f.state);
  assert.equal(f.state.nodes.media!.status, 'pending');
});

test('trial resume keeps first prepared production stock additions with their live owner', async () => {
  const f = await interactiveProductionFixture();
  // Synthetic routing binding, never a stock inspection or provider receipt.
  const checked = { findings: [], bindings: [{ path: 'media/stock/synthetic-routing.jpg', sha256: 'a'.repeat(64), assetId: 'synthetic-stock', origin: 'stock' as const, role: 'asset' as const }] };
  assert.equal(f.state.nodes['asset-production']!.attempts, 0);
  assert.equal(reopenMediaForAdded(f.graph, f.state, checked, [], f.root), false);
  assert.equal(f.state.nodes.media!.status, 'done');
  cancelStage({ root: f.root, preparationId: f.prepared.preparation!.id, reason: 'Synthetic stock owner cancellation' });
  assert.equal(reopenMediaForAdded(f.graph, f.state, checked, [], f.root), true);
  assert.equal(f.state.nodes.media!.status, 'pending');
});
