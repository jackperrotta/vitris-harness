import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { files, fingerprint, json, sourceHash, within } from "./artifacts.ts";
import type { SkillGraph } from "./graph.ts";

/** Explicit compatibility boundary. Existing sites retain their accepted policy. */
export function productionQuality(root: string): boolean {
  const launch = existsSync(join(root,"launch.json")) ? json<any>(join(root,"launch.json")) : {};
  if (launch.productionQuality === undefined) return false;
  if (launch.productionQuality !== "source-and-realization-v1") throw new Error("Unsupported productionQuality policy");
  return true;
}
export const REALIZATION_AXES = ["opening", "navigation", "typography", "imagery", "density", "proof", "interior", "mobile", "actions"] as const;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const text = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
export function normalizeCoverage(s: string): string {
  return s.normalize("NFKD").toLowerCase().replace(/[’'`]/g,"").replace(/[^\p{L}\p{N}]+/gu," ").trim();
}
const contains = (haystack: string, needle: string) => (" "+normalizeCoverage(haystack)+" ").includes(" "+normalizeCoverage(needle)+" ");
export type ContentRequirement = { id: string; claim: string; source: string; excerpt: string; equivalents: string[]; allowExclusion?: boolean };
export type ContentDisposition = { id: string; disposition: "required" | "excluded"; factIds: string[]; equivalents: string[]; equivalenceReason?: string; exclusion?: { reason: string; evidence: string } };
export type ContentLedger = { version: 1; sourceHash: string; operatorHash: string; items: ContentDisposition[] };
export const CONTENT_SOURCE = ["onboarding/brief.json", "onboarding/copy", "onboarding/raw"];
export const CONTENT_OPERATOR = "agent/content-requirements.json";
export const contentOperatorHash = (root:string) => fingerprint(root,[CONTENT_OPERATOR,"launch.json"]);
export function contentOperator(root:string): {version:number;requirements:ContentRequirement[]} {
  return existsSync(join(root,CONTENT_OPERATOR)) ? json<any>(join(root,CONTENT_OPERATOR)) : (json<any>(join(root,"launch.json")).contentRequirements || {version:1,requirements:[]});
}
export const CONTENT_LEDGER = "onboarding/content-requirements.json";
export function applyProductionQualityGraph(root: string, graph: SkillGraph): SkillGraph {
  if (!productionQuality(root)) return graph;
  for (const n of graph.nodes) {
    if (n.id === "harvest" || n.id === "launch") continue;
    n.refs = [...new Set([...(n.refs || []), "production-quality"])];
    n.optionalInputs = [...new Set([...(n.optionalInputs || []), "launch.json", CONTENT_OPERATOR, ...(n.id!=="media"?[CONTENT_LEDGER]:[])])];
    if (n.id === "business") n.writes = [...new Set([...n.writes, CONTENT_LEDGER])];
    if (["representative", "pages"].includes(n.id)) n.writes = [...new Set([...n.writes, "onboarding/direction-deviations.json"])];
    else if (["representative-review","representative-quality","visual-review","content-review","preview"].includes(n.id)) n.optionalInputs = [...new Set([...n.optionalInputs, "onboarding/direction-deviations.json"])];
    if (n.id === "content-review") n.writes = [...new Set([...n.writes,"agent/reviews/content-coverage.json"])];
  }
  return graph;
}

/** The operator input is optional; source enumeration remains an explicit business responsibility. */
export function validateContentLedger(root: string): string[] {
  const errors: string[] = [];
  const b = json<any>(join(root,"onboarding/business.json"));
  const ledger = json<ContentLedger>(join(root,CONTENT_LEDGER));
  const operator = contentOperator(root);
  if (ledger.version !== 1 || ledger.sourceHash !== fingerprint(root,CONTENT_SOURCE) || ledger.operatorHash !== contentOperatorHash(root)) errors.push("Content requirements have stale source/operator hashes; reopen business");
  if (!Array.isArray(ledger.items) || !ledger.items.length) return [...errors,"Business must enumerate source-backed content requirements"];
  const ids = new Set(ledger.items.map(i=>i.id));
  if (ids.size !== ledger.items.length) errors.push("Duplicate content requirement IDs");
  for (const req of operator.requirements) {
    let captured=""; try { captured=readFileSync(within(root,req.source),"utf8"); } catch {}
    if (!text(req.claim) || !text(req.excerpt) || !contains(captured,req.excerpt)) errors.push(`Requirement source missing: ${req.id}`);
    const item=ledger.items.find(i=>i.id===req.id);
    if (!item) errors.push(`Unaccounted source requirement: ${req.id} (${req.claim})`);
    else if (item.disposition === "excluded" && req.allowExclusion !== true) errors.push(`Required source item cannot be excluded: ${req.id}`);
  }
  for (const item of ledger.items) {
    if (!["required","excluded"].includes(item.disposition)) errors.push(`Invalid content disposition: ${item.id}`);
    if (item.disposition === "excluded") {
      if (!text(item.exclusion?.reason) || !text(item.exclusion?.evidence)) errors.push(`Exclusion needs specific reason and evidence: ${item.id}`);
    } else {
      if (!item.factIds?.length || item.factIds.some(id=>!b.facts.some((f:any)=>f.id===id))) errors.push(`Requirement needs supported business fact IDs: ${item.id}`);
      const req=operator.requirements.find(r=>r.id===item.id);
      if (req && ![req.claim,...req.equivalents].some(a=>contains(b.facts.filter((f:any)=>item.factIds?.includes(f.id)).map((f:any)=>f.claim).join(" "),a))) errors.push(`Source requirement absent from associated business facts: ${item.id}`);
      if (!req && !item.equivalents?.some(text)) errors.push(`Requirement needs faithful display wording: ${item.id}`);
      if (item.equivalents?.length && !text(item.equivalenceReason)) errors.push(`Paraphrase needs equivalence rationale: ${item.id}`);
    }
  }
  for (const f of b.facts) if (!ledger.items.some(i=>i.factIds?.includes(f.id))) errors.push(`Business fact has no coverage disposition: ${f.id}`);
  return errors;
}

export function coverageAudit(root: string, mode: "copy" | "rendered" = "rendered") {
  const errors = validateContentLedger(root);
  const ledger=json<ContentLedger>(join(root,CONTENT_LEDGER));
  const operator=contentOperator(root).requirements;
  const copy=json<any>(join(root,"onboarding/copy-plan.json"));
  const passages: {path:string;section:string;width?:number;text:string;factIds?:string[]}[]=[];
  if (mode === "copy") for (const p of copy.pages) for (const s of p.sections) passages.push({path:p.path,section:s.id,text:s.heading+" "+s.body,factIds:s.factIds});
  else {
    const report=json<any>(join(root,"agent/reviews/browser.json"));
    if (report.sourceHash !== sourceHash(root) || report.distHash !== fingerprint(root,["dist"])) errors.push("Rendered coverage browser evidence is stale");
    for (const c of report.checks) if (c.motion !== "normal") {
      if (!text(c.visibleText)) errors.push(`Missing visible rendered text: ${c.path} ${c.width}`);
      else passages.push({path:c.path,section:"rendered document",width:c.width,text:c.visibleText});
    }
  }
  const results=ledger.items.map(item=>{
    if (item.disposition === "excluded") return {id:item.id,disposition:"excluded",exclusion:item.exclusion,matches:[]};
    const req=operator.find(r=>r.id===item.id);
    // Operator-approved aliases cannot be replaced with a generic business category.
    const aliases=req ? [req.claim,...req.equivalents] : item.equivalents;
    const accepted=passages.filter(p=>aliases.some(a=>text(a)&&contains(p.text,a)) && (mode!=="copy" || item.factIds.every(id=>p.factIds?.includes(id))));
    const widths=mode==="copy" ? [undefined] : [375,1080];
    for (const width of widths) if (!accepted.some(p=>p.width===width)) errors.push(`Missing required content: ${item.id}${width?` at ${width}px`:" in approved copy"}; preserve an individual faithful statement, or reopen business for an evidenced exclusion`);
    return {id:item.id,disposition:item.disposition,matches:accepted.map(p=>({path:p.path,section:p.section,width:p.width,excerpt:p.text.slice(Math.max(0,normalizeCoverage(p.text).indexOf(normalizeCoverage(aliases[0]||""))-80),600)}))};
  });
  return {version:1,mode,subjectHash:fingerprint(root,[CONTENT_LEDGER,CONTENT_OPERATOR,"launch.json","onboarding/business.json","onboarding/copy-plan.json",...(mode==="rendered"?["dist","agent/reviews/browser.json"]:[])]),passed:errors.length===0,errors,results};
}

export function validateMediaInspections(root: string): string[] {
  const errors:string[]=[];
  const inventory=json<any>(join(root,"onboarding/media-inventory.json"));
  for (const a of inventory.assets.filter((a:any)=>a.disposition==="use")) {
    const p=within(root,a.path.replace(/^\//,""));
    if (!a.inspected || !a.sha256 || !existsSync(p) || sha256(readFileSync(p))!==a.sha256 || a.inspection?.assetHash!==a.sha256 || !text(a.inspection?.description) || !a.inspection?.evidence?.length) errors.push(`Media inspection must be byte-bound before sealing: ${a.id}; inspect at media, or use art revise --kind inspection to reopen that owner`);
    else for (const e of a.inspection.evidence) if (!existsSync(within(root,e.replace(/^\//,"")))) errors.push(`Missing media inspection evidence: ${a.id} ${e}`);
  }
  return errors;
}

export function validateRealization(root:string,node:string):string[] {
  const errors:string[]=[];
  const d=json<any>(join(root,"onboarding/direction.json"));
  const contract=d.realizationContract;
  const ids=new Set((d.decisions||[]).map((v:any)=>v.id));
  if (contract?.version!==1 || !Array.isArray(contract.axes)) return ["Direction requires realizationContract version 1 with nine observable axes"];
  for (const axis of REALIZATION_AXES) {
    const c=contract.axes.find((a:any)=>a.axis===axis);
    if (!c || !text(c.intention)||!text(c.observable)||!c.decisionIds?.length||c.decisionIds.some((id:string)=>!ids.has(id))) errors.push(`Direction realization incomplete: ${axis}`);
  }
  if (["storyboard","representative-review","visual-review"].includes(node)) {
    const story=json<any>(join(root,"onboarding/storyboard.json"));
    for (const axis of REALIZATION_AXES) {
      const map=story.realizationMap?.find((m:any)=>m.axis===axis);
      if (!map || !text(map.implementation)||!map.routes?.length||map.routes.some((p:string)=>!story.pages.some((s:any)=>s.path===p))) errors.push(`Storyboard must carry direction axis: ${axis}`);
    }
  }
  if (["representative-review","visual-review"].includes(node)) {
    const browserPath=`agent/reviews/${node==="visual-review"?"browser":"representative-browser"}.json`;
    const browser=json<any>(join(root,browserPath));
    const review=json<any>(join(root,`agent/reviews/${node}.json`));
    const fidelity=review.directionFidelity;
    const expected=fingerprint(root,["onboarding/direction.json","onboarding/storyboard.json","onboarding/direction-deviations.json",browserPath]);
    if (fidelity?.subjectHash!==expected) return [...errors,"Rendered direction fidelity evidence is stale or missing"];
    const deviations=existsSync(join(root,"onboarding/direction-deviations.json")) ? json<any>(join(root,"onboarding/direction-deviations.json")).deviations||[] : [];
    for (const axis of REALIZATION_AXES) for (const width of [375,1080]) {
      const o=fidelity.observations?.find((o:any)=>o.axis===axis&&o.width===width);
      const c=browser.checks.find((c:any)=>c.width===width&&c.screenshot===o?.screenshot);
      if (!o || !c || (axis==="interior"&&c.path==="/") || (axis==="opening"&&c.path!=="/") || !text(o.observed)||!text(o.relationship)||!existsSync(within(root,o.screenshot)) || o.sha256!==sha256(readFileSync(within(root,o.screenshot))) || !["survived","justified-deviation"].includes(o.verdict)) errors.push(`Rendered direction needs current inspected evidence: ${axis} ${width}`);
      else if (o.verdict==="justified-deviation"&&!deviations.some((v:any)=>v.id===o.deviationId&&v.axis===axis&&text(v.reason)&&text(v.preservedConstraints))) errors.push(`Unjustified direction deviation: ${axis}`);
    }
  }
  return errors;
}

export function productionQualityFailures(root:string,node:string):string[] {
  if (!productionQuality(root)) return [];
  if (["business","business-review"].includes(node)) return validateContentLedger(root);
  if (node==="media") return validateMediaInspections(root);
  if (["direction","direction-review","storyboard","representative-review","visual-review"].includes(node)) return validateRealization(root,node);
  if (node==="copy-expansion") return coverageAudit(root,"copy").errors;
  if (node==="content-review") {
    const audit=coverageAudit(root);
    const retained=json<any>(join(root,"agent/reviews/content-coverage.json"));
    return [...audit.errors,...(JSON.stringify(audit)!==JSON.stringify(retained)?["Content coverage evidence stale or incomplete; regenerate from current browser text"]:[])];
  }
  return [];
}

/** Presence of tracking, not a utility route name, determines analytics obligations. */
export function hasAnalyticsRuntime(root:string):boolean {
  return files(join(root,"dist")).filter(p=>p.endsWith(".html")).some(p=>/\bdata-kernel=|<script[^>]+src=["'][^"']*\/beacon\.js["']/i.test(readFileSync(p,"utf8")));
}
