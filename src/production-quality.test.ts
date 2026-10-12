import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprint, json, save, sourceHash } from "./agent/artifacts.ts";
import { applyProductionQualityGraph, coverageAudit, CONTENT_SOURCE, CONTENT_OPERATOR, CONTENT_LEDGER, hasAnalyticsRuntime, productionQualityFailures, REALIZATION_AXES, validateContentLedger, validateMediaInspections, validateRealization } from "./agent/production-quality.ts";
function fixture(){
  const root=mkdtempSync(join(tmpdir(),"vitris-content-regression-"));
  save(join(root,"launch.json"),{productionQuality:"source-and-realization-v1"});
  save(join(root,"onboarding/brief.json"),{text:"Workers’ compensation and medical malpractice. The old promotion expired in 2020."});
  save(join(root,CONTENT_OPERATOR),{version:1,requirements:[{id:"workers",claim:"Workers’ compensation",source:"onboarding/brief.json",excerpt:"Workers’ compensation",equivalents:["Worker compensation coverage"]},{id:"medical",claim:"medical malpractice",source:"onboarding/brief.json",excerpt:"medical malpractice",equivalents:["Professional liability for medical malpractice"]},{id:"old-promotion",claim:"old promotion",source:"onboarding/brief.json",excerpt:"The old promotion expired in 2020",equivalents:[],allowExclusion:true}]});
  save(join(root,"onboarding/business.json"),{facts:[{id:"f-workers",claim:"Workers’ compensation"},{id:"f-medical",claim:"Medical malpractice"}]});
  save(join(root,CONTENT_LEDGER),{version:1,sourceHash:fingerprint(root,CONTENT_SOURCE),operatorHash:fingerprint(root,[CONTENT_OPERATOR,"launch.json"]),items:[{id:"workers",disposition:"required",factIds:["f-workers"],equivalents:[]},{id:"medical",disposition:"required",factIds:["f-medical"],equivalents:[]},{id:"old-promotion",disposition:"excluded",factIds:[],exclusion:{reason:"Expired promotion is outdated",evidence:"onboarding/brief.json: expired in 2020"}}]});
  save(join(root,"onboarding/copy-plan.json"),{pages:[{path:"/coverage",sections:[{id:"commercial",heading:"Business protection",body:"Worker compensation coverage and professional liability for medical malpractice.",factIds:["f-workers","f-medical"]}]}]});
  mkdirSync(join(root,"dist"),{recursive:true});writeFileSync(join(root,"dist/index.html"),"<p>test</p>");
  browser(root,"Worker compensation coverage and professional liability for medical malpractice.");
  return root;
}
function browser(root:string,visibleText:string){save(join(root,"agent/reviews/browser.json"),{sourceHash:sourceHash(root),distHash:fingerprint(root,["dist"]),checks:[375,1080].map(width=>({path:"/coverage",width,visibleText,motion:"reduce"}))});}
test("individual missing services fail even when a route and category survive",()=>{
  const root=fixture();browser(root,"Business insurance: liability and property.");
  assert.deepEqual(coverageAudit(root).errors.filter(e=>e.startsWith("Missing required")).map(e=>e.match(/: (\w+)/)?.[1]),["workers","workers","medical","medical"]);
});
test("faithful equivalent wording, grouping and explicit expired exclusions pass",()=>{
  const root=fixture();assert.deepEqual(validateContentLedger(root),[]);assert.equal(coverageAudit(root,"copy").passed,true);assert.equal(coverageAudit(root).passed,true);
});
test("atomic contact fields can share one supported fact and reorder without hiding a missing field",()=>{
  const root=fixture();
  const brief=json<any>(join(root,"onboarding/brief.json"));brief.text+=" Marty Graff: 215.327.1161; 1412 Ringneck Loop, Dresher, PA 19025.";save(join(root,"onboarding/brief.json"),brief);
  const b=json<any>(join(root,"onboarding/business.json"));b.facts.push({id:"contact",claim:"Marty Graff: 215.327.1161; 1412 Ringneck Loop, Dresher, PA 19025."});save(join(root,"onboarding/business.json"),b);
  const ledger=json<any>(join(root,CONTENT_LEDGER));ledger.sourceHash=fingerprint(root,CONTENT_SOURCE);
  for(const [id,wording] of [["contact-name","Marty Graff"],["contact-phone","215.327.1161"],["contact-address","1412 Ringneck Loop, Dresher, PA 19025"]])ledger.items.push({id,disposition:"required",factIds:["contact"],equivalents:[wording],equivalenceReason:"An individual source-backed contact field; grouped layout may reorder the fields."});
  save(join(root,CONTENT_LEDGER),ledger);
  const copy=json<any>(join(root,"onboarding/copy-plan.json"));copy.pages[0].sections.push({id:"contact",heading:"Marty Graff",body:"1412 Ringneck Loop, Dresher, PA 19025. Call 215.327.1161.",factIds:["contact"]});save(join(root,"onboarding/copy-plan.json"),copy);
  browser(root,"Medical malpractice and worker compensation coverage. 1412 Ringneck Loop, Dresher, PA 19025. Marty Graff. Call 215.327.1161.");
  assert.equal(coverageAudit(root,"copy").passed,true);assert.equal(coverageAudit(root).passed,true);
  browser(root,"Medical malpractice and worker compensation coverage. 1412 Ringneck Loop, Dresher, PA 19025. Marty Graff.");
  assert.deepEqual(coverageAudit(root).errors.filter(e=>e.startsWith("Missing required content")).map(e=>e.match(/: ([^ ]+)/)?.[1]),["contact-phone","contact-phone"]);
});
test("source-to-business omissions cannot be hidden by an incomplete fact extraction",()=>{
  const root=fixture(), ledger=json<any>(join(root,CONTENT_LEDGER));ledger.items=ledger.items.filter((i:any)=>i.id!=="workers");save(join(root,CONTENT_LEDGER),ledger);
  assert.ok(validateContentLedger(root).some(e=>e.includes("Unaccounted source requirement: workers")));
});
test("generic substitutes, unapproved exclusion and unexplained paraphrases fail",()=>{
  const root=fixture(), ledger=json<any>(join(root,CONTENT_LEDGER));ledger.items[0].disposition="excluded";ledger.items[0].exclusion={reason:"Shorter",evidence:"Preference"};save(join(root,CONTENT_LEDGER),ledger);
  assert.ok(validateContentLedger(root).some(e=>e.includes("cannot be excluded")));
});
test("current coverage is invalidated by content, browser or ledger changes",()=>{
  const root=fixture();save(join(root,"agent/reviews/content-coverage.json"),coverageAudit(root));assert.deepEqual(productionQualityFailures(root,"content-review"),[]);
  writeFileSync(join(root,"dist/index.html"),"<p>Changed content</p>");assert.ok(productionQualityFailures(root,"content-review").some(e=>e.includes("stale")));
  browser(root,"Worker compensation coverage and medical malpractice.");assert.ok(productionQualityFailures(root,"content-review").some(e=>e.includes("stale")));
});
test("legacy policy is unchanged; opted-in graph is idempotent and ownership explicit",()=>{
  const root=mkdtempSync(join(tmpdir(),"vitris-quality-policy-"));const graph:any={version:3,stop_at:"preview",nodes:[{id:"business",writes:[],refs:[]},{id:"pages",writes:[],refs:[]}]};const before=JSON.stringify(graph);
  applyProductionQualityGraph(root,graph);assert.equal(JSON.stringify(graph),before);
  save(join(root,"launch.json"),{productionQuality:"source-and-realization-v1"});applyProductionQualityGraph(root,graph);const accepted=JSON.stringify(graph);applyProductionQualityGraph(root,graph);assert.equal(JSON.stringify(graph),accepted);assert.ok(graph.nodes[0].writes.includes(CONTENT_LEDGER));
});
test("later authored deviations do not become early-stage inputs, and business ledger does not invalidate sibling media",()=>{
  const root=fixture(),graph:any={nodes:["business","media","direction","storyboard","representative","visual-review"].map(id=>({id,refs:[],writes:[]}))};applyProductionQualityGraph(root,graph);
  for(const id of ["business","media","direction","storyboard"]) assert.ok(!graph.nodes.find((n:any)=>n.id===id).optionalInputs.includes("onboarding/direction-deviations.json"));
  assert.ok(!graph.nodes.find((n:any)=>n.id==="media").optionalInputs.includes(CONTENT_LEDGER));
  assert.ok(graph.nodes.find((n:any)=>n.id==="visual-review").optionalInputs.includes("onboarding/direction-deviations.json"));
});
test("used legacy boolean inspection fails before production; byte-bound inspection can recover",()=>{
  const root=fixture();mkdirSync(join(root,"media"),{recursive:true});writeFileSync(join(root,"media/test.svg"),"<svg/>");
  const {createHash}=requireCrypto();
  const hash=createHash("sha256").update("<svg/>").digest("hex");
  const asset:any={id:"test",path:"/media/test.svg",disposition:"use",inspected:true,sha256:hash};save(join(root,"onboarding/media-inventory.json"),{assets:[asset]});assert.equal(validateMediaInspections(root).length,1);
  asset.inspection={assetHash:hash,description:"Synthetic SVG fixture",evidence:["media/test.svg"]};save(join(root,"onboarding/media-inventory.json"),{assets:[asset]});assert.deepEqual(validateMediaInspections(root),[]);
  writeFileSync(join(root,"media/test.svg"),"<svg>changed</svg>");assert.equal(validateMediaInspections(root).length,1);
});
import * as crypto from "node:crypto";
function requireCrypto(){return crypto;}
test("analytics obligations follow the built runtime rather than the privacy route name",()=>{
  const root=fixture();mkdirSync(join(root,"dist/cookie-compliance"),{recursive:true});writeFileSync(join(root,"dist/cookie-compliance/index.html"),"<p>Static privacy information</p>");assert.equal(hasAnalyticsRuntime(root),false);
  writeFileSync(join(root,"dist/index.html"),'<html data-kernel="https://tracking.example"><script src="/beacon.js"></script></html>');assert.equal(hasAnalyticsRuntime(root),true);
});
test("realization cannot pass with IDs alone or stale rendered evidence",()=>{
  const root=fixture();save(join(root,"onboarding/direction.json"),{decisions:[{id:"organize"}],realizationContract:{version:1,axes:REALIZATION_AXES.map(axis=>({axis,intention:"Organize the actual business material",observable:"Specific supported relationship",decisionIds:["organize"]}))}});
  assert.deepEqual(validateRealization(root,"direction"),[]);save(join(root,"onboarding/storyboard.json"),{pages:[{path:"/"}],realizationMap:REALIZATION_AXES.map(axis=>({axis,routes:["/"],implementation:"Carry into current sections"}))});save(join(root,"agent/reviews/visual-review.json"),{});
  assert.ok(validateRealization(root,"visual-review").some(e=>e.includes("stale or missing")));
});

import { chromium } from "playwright";
import { checkSharedMedia } from "./stock/browser-checks.ts";
test("generic header media accepts a visible ARIA banner, but explicit selectors and hidden logos still fail",async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    await page.setContent('<aside role="banner"><img width="20" height="20"></aside>');
    await page.locator('img').evaluate((img:any)=>{img.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';});
    await page.waitForFunction('document.images[0].complete && document.images[0].naturalWidth>0');
    const story:any={version:3,globalMedia:[{assetId:"logo",placement:"header",routes:["/"]}]},inv:any={assets:[{id:"logo",path:"data:image/gif"}]};
    assert.deepEqual(await checkSharedMedia(page,story,inv,"/"),[]);
    story.globalMedia[0].placement="header.brand";assert.equal((await checkSharedMedia(page,story,inv,"/")).length,1);
    story.globalMedia[0].placement="header";await page.locator('aside').evaluate((e:any)=>e.style.display='none');assert.equal((await checkSharedMedia(page,story,inv,"/")).length,1);
  }finally{await browser.close();}
});
