import { businessContexts, expressionSignals, normalizeTasks, fitScore, complementaryFit, essentialAssetGap, type FitProfile } from "./reference-fit.ts";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { resolveKernelRoot } from "./design-calibration.ts";
import { compositionSignalsFromSite } from "./composition-context.ts";
import { referenceStudyExpansions } from "./reference-studies.ts";
import { loadReferenceStudies } from "./reference-studies.ts";
import { loadCompositionPack } from "../knowledge/composition.ts";

export const REFERENCE_RELEASE = "2026-10-05.1";
export const REFERENCE_SELECTOR = "fit-complementarity-3";
export const INITIAL_CORRECTED_REFERENCE_RELEASE = "2026-10-06.1";
export const CORRECTED_REFERENCE_RELEASE = "2026-10-06.2";
export const CORRECTED_REFERENCE_SELECTOR = "task-expression-complementarity-2";
export const referenceSelectorVersion = (release: string) => release === REFERENCE_RELEASE ? REFERENCE_SELECTOR : release === INITIAL_CORRECTED_REFERENCE_RELEASE ? "task-expression-complementarity-1" : CORRECTED_REFERENCE_SELECTOR;
export const referenceReleaseDirectory = (release = REFERENCE_RELEASE) => { if (release === REFERENCE_RELEASE) return "v1"; if (release === INITIAL_CORRECTED_REFERENCE_RELEASE) return "v2"; if (release === CORRECTED_REFERENCE_RELEASE) return "v3"; throw new Error(`Unsupported reference release: ${release}`); };
export const REFERENCE_FAMILIES = ["swiss", "editorial", "expressive-type", "quiet-luxury", "documentary", "campaign", "hospitality", "maximalism", "handmade", "industrial", "technical", "retro", "athletic", "civic", "text-first", "spatial"] as const;
export type ReferenceEvidenceLevel = "candidate" | "live-screened" | "deep-reviewed" | "unavailable" | "retired";
export type ReferenceView = { id: string; route: string; resolvedUrl: string; inspectedAt: string; viewport: { width: number; height: number }; state: string; scope: "opening" | "whole-page" | "task"; observation: string; evidencePointer: string; capture?: { path: string; sha256: string }; limitations: string[]; evidence?: { kind: string; sourceRevision: number; inspectedAt: string; uri: string | null; sessionId: string | null } };
export type ReferenceRecord = {
  id: string; revision: number; title: string; lifecycle: "draft" | "active" | "retired";
  primaryFamily: typeof REFERENCE_FAMILIES[number]; tags: string[];
  requestedUrl: string; resolvedUrl: string | null; inspectedAt: string | null; version: "current" | "historical";
  creator: { name: string | null; attributionUrl: string | null; verified: boolean };
  discovery: { source: string; url: string }; sourceStatus: "live" | "pending" | "blocked" | "retired";
  evidenceLevel: ReferenceEvidenceLevel;
  sourcing: { researchRetention: string; redistribution: string; generationUse: "abstract-lessons-only" | "cleared-material" | "none"; basis: string };
  eligible: { metadata: boolean; images: boolean; code: boolean };
  coverage: { localProfessional: boolean; sparseMedia: boolean; informationDense: boolean; immersive: boolean };
  fitSignals: string[]; visitorTasks: string[]; assetMinimum: "none" | "one-image" | "multiple-images" | "product-ui";
  complexity: "low" | "medium" | "high"; lowComplexityAlternative: string;
  structure: { opening: string; navigation: string; sequence: string[]; evidence: string; density: string; imageTypeRelationship: string; interior: string; responsive: string; action: string };
  observedRelationships: string[]; lessons: string[]; useWhen: string[]; avoidWhen: string[]; adds: string;
  views: ReferenceView[]; limitations: string[]; relatedExamples: string[]; lessonIds: string[];
  compositionTags?: string[];
  motionTags?: string[];
  temporalEvidence?: { route: string; viewport: { width: number; height: number }; scenarioHash: string; sourceHash: string; recording: { path: string; sha256: string }; observation: string; assessor: "agent" | "human" }[];
  selectionProfile?: FitProfile;
  visualEvidence?: { kind: "legacy-observation" | "live-only" | "retained-capture" | "accessible-session"; lastVerifiedAt: string | null; freshness: string; availability: string; sourceRevision: number; durableOriginalIds: string[]; note: string };
};
export type ReferenceCatalog = { schemaVersion: 1; release: string; records: ReferenceRecord[] };
export type ReferenceManifest = { schemaVersion: 1; release: string; status: string; catalog: { path: string; sha256: string }; labeledPreferenceData: false };
export const referenceHash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const read = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
export function confinedReferencePath(base: string, path: string): string {
  const target = resolve(base, path), rel = relative(resolve(base), target);
  if (isAbsolute(path) || !rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Reference path escapes release: ${path}`);
  return target;
}

/** No implicit promotion. This policy is separate from authoring and block eligibility. */
export function referencePolicy(root: string) {
  const launch = existsSync(join(root, "launch.json")) ? read<Record<string, unknown>>(join(root, "launch.json")) : {};
  const raw = launch.designReferences;
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("designReferences must be an object");
  const config = raw as Record<string, unknown>;
  if (![REFERENCE_RELEASE, INITIAL_CORRECTED_REFERENCE_RELEASE, CORRECTED_REFERENCE_RELEASE].includes(String(config.release)) || config.mode !== "lessons") throw new Error(`Unsupported designReferences; use mode lessons, release ${REFERENCE_RELEASE}`);
  if (config.manifestHash !== undefined && (typeof config.manifestHash !== "string" || !/^[a-f0-9]{64}$/.test(config.manifestHash))) throw new Error("Invalid reference manifestHash");
  if (config.teachingManifestHash !== undefined && (typeof config.teachingManifestHash !== "string" || !/^[a-f0-9]{64}$/.test(config.teachingManifestHash))) throw new Error("Invalid reference teachingManifestHash");
  return { release: config.release as string, mode: "lessons" as const, manifestHash: config.manifestHash as string | undefined, teachingManifestHash: config.teachingManifestHash as string | undefined, hash: referenceHash(JSON.stringify(config)) };
}

export function validateReferenceCatalog(catalog: ReferenceCatalog): string[] {
  const errors: string[] = [], ids = new Set<string>(), urls = new Set<string>();
  if (catalog.schemaVersion !== 1 || ![REFERENCE_RELEASE, INITIAL_CORRECTED_REFERENCE_RELEASE, CORRECTED_REFERENCE_RELEASE].includes(catalog.release) || !Array.isArray(catalog.records)) return ["Unsupported reference catalog"];
  for (const r of catalog.records) {
    if (!r || typeof r !== "object") { errors.push("Reference must be an object"); continue; }
    const fail = (message: string) => errors.push(`${r.id || "missing-id"}: ${message}`);
    if (catalog.release !== REFERENCE_RELEASE) {
      const p=r.selectionProfile, e=r.visualEvidence;
      if (!p || [p.tasks,p.expressions,p.contexts,p.contributions].some(a=>!Array.isArray(a)||a.some(v=>typeof v!=="string"||!v.trim())) || !p.contributions.length || p.expressions.some(v=>!REFERENCE_FAMILIES.includes(v as typeof REFERENCE_FAMILIES[number]))) fail("invalid normalized selection profile");
      if (!e || !["legacy-observation","live-only","retained-capture","accessible-session"].includes(e.kind) || e.sourceRevision!==r.revision || !Array.isArray(e.durableOriginalIds) || !e.note?.trim() || !e.freshness || !e.availability || (e.lastVerifiedAt!==null && !Number.isFinite(Date.parse(e.lastVerifiedAt)))) fail("invalid visual evidence/freshness state");
      for (const v of r.views || []) if (!v.evidence || !["legacy-observation","live-only","retained-capture","accessible-session"].includes(v.evidence.kind) || v.evidence.sourceRevision>r.revision || !Number.isFinite(Date.parse(v.evidence.inspectedAt)) || (v.evidence.kind==="retained-capture"&&!v.capture) || (v.evidence.kind==="accessible-session"&&(!v.evidence.sessionId||!v.evidence.uri)) || (v.evidence.kind==="live-only"&&!/^https?:\/\//.test(v.evidence.uri || ""))) fail("unresolvable visual evidence state");
    }
    if (r.motionTags !== undefined && (!Array.isArray(r.motionTags) || r.motionTags.some(t=>typeof t!=="string"||!t.trim()) || new Set(r.motionTags).size!==r.motionTags.length)) fail("invalid motion tags");
    if (r.temporalEvidence !== undefined && (!Array.isArray(r.temporalEvidence) || r.temporalEvidence.some(v=>!v?.route || !v.observation?.trim() || !["agent","human"].includes(v.assessor) || !Number.isInteger(v.viewport?.width) || !Number.isInteger(v.viewport?.height) || v.viewport.width<1 || v.viewport.height<1 || !/^[a-f0-9]{64}$/.test(v.sourceHash) || !/^[a-f0-9]{64}$/.test(v.scenarioHash) || !v.recording?.path || !/^[a-f0-9]{64}$/.test(v.recording.sha256)))) fail("invalid temporal evidence");
    if (r.compositionTags !== undefined && (!Array.isArray(r.compositionTags) || r.compositionTags.some(t=>typeof t!=="string"||!t.trim()) || new Set(r.compositionTags).size!==r.compositionTags.length)) fail("invalid composition tags");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.id) || ids.has(r.id)) fail("invalid or duplicate id");
    ids.add(r.id);
    if (!Number.isInteger(r.revision) || r.revision < 1) fail("invalid revision");
    if (!REFERENCE_FAMILIES.includes(r.primaryFamily)) fail("invalid primary family");
    if (!["candidate", "live-screened", "deep-reviewed", "unavailable", "retired"].includes(r.evidenceLevel)) fail("invalid evidence level");
    if (!["draft", "active", "retired"].includes(r.lifecycle) || !["live", "pending", "blocked", "retired"].includes(r.sourceStatus)) fail("invalid lifecycle/source status");
    if (!["none", "one-image", "multiple-images", "product-ui"].includes(r.assetMinimum) || !["low", "medium", "high"].includes(r.complexity)) fail("invalid asset/complexity contract");
    try { const url = new URL(r.resolvedUrl || r.requestedUrl); if (!/^https?:$/.test(url.protocol)) fail("invalid URL protocol"); const key = url.hostname.replace(/^www\./, ""); if (urls.has(key)) fail("duplicate publisher domain; review distinctness"); urls.add(key); } catch { fail("invalid URL"); }
    for (const key of ["title", "adds", "lowComplexityAlternative"] as const) if (!r[key]?.trim()) fail(`missing ${key}`);
    if (!r.creator || !r.discovery?.source || !r.discovery.url || !r.sourcing?.basis || !r.sourcing.researchRetention || !r.sourcing.redistribution || !r.coverage) fail("missing provenance/coverage");
    if (!r.structure || ["opening", "navigation", "evidence", "density", "imageTypeRelationship", "interior", "responsive", "action"].some(key => typeof r.structure[key as keyof typeof r.structure] !== "string" || !String(r.structure[key as keyof typeof r.structure]).trim()) || !Array.isArray(r.structure.sequence) || !r.structure.sequence.length) fail("incomplete structure");
    for (const key of ["tags", "fitSignals", "visitorTasks", "observedRelationships", "lessons", "useWhen", "avoidWhen", "views", "limitations", "relatedExamples", "lessonIds"] as const) if (!Array.isArray(r[key])) fail(`missing ${key}`);
    const screened = ["live-screened", "deep-reviewed"].includes(r.evidenceLevel);
    if (screened && (!r.inspectedAt || !r.resolvedUrl || !r.views?.length || !r.observedRelationships?.length || !r.lessons?.length || r.sourceStatus !== "live")) fail("screened record lacks actual inspection");
    if (!r.eligible || ["metadata", "images", "code"].some(key => typeof r.eligible[key as keyof typeof r.eligible] !== "boolean")) fail("missing eligibility contract");
    if (!r.sourcing || !["abstract-lessons-only", "cleared-material", "none"].includes(r.sourcing.generationUse)) fail("invalid sourcing contract");
    if (r.eligible?.metadata && (!screened || r.lifecycle !== "active" || r.sourcing?.generationUse === "none")) fail("ineligible evidence admitted for generation");
    if ((r.eligible?.images || r.eligible?.code) && r.sourcing?.generationUse !== "cleared-material") fail("uncleared external material admitted");
    for (const v of Array.isArray(r.views) ? r.views : []) {
      if (!v || !v.id || !v.route || !v.observation || !v.evidencePointer || !Number.isFinite(Date.parse(v.inspectedAt)) || !Number.isInteger(v.viewport?.width) || !Number.isInteger(v.viewport?.height) || v.viewport.width < 1 || v.viewport.height < 1 || !v.resolvedUrl || !["opening", "whole-page", "task"].includes(v.scope) || !Array.isArray(v.limitations)) fail(`incomplete view ${v?.id}`);
      if (v?.capture && (!v.capture.path || !/^[a-f0-9]{64}$/.test(v.capture.sha256))) fail(`invalid capture hash ${v.id}`);
    }
    if (r.evidenceLevel === "deep-reviewed") {
      for (const narrow of [false, true]) {
        const views = (Array.isArray(r.views) ? r.views : []).filter(v => v?.viewport && (v.viewport.width < 600) === narrow);
        if (!views.some(v => v.scope === "opening") || !views.some(v => v.scope === "whole-page")) fail(`missing ${narrow ? "mobile" : "desktop"} opening/full inspection`);
        if (!views.some(v => v.scope === "task" && v.state !== "opening")) fail(`missing ${narrow ? "mobile" : "desktop"} interior/task inspection`);
      }
      if (!r.structure?.interior || !r.structure?.responsive) fail("missing interior/mobile relationships");
    }
  }
  return errors;
}

export function loadReferenceCatalog(root: string, kernel?: string, release = referencePolicy(root)?.release || REFERENCE_RELEASE) {
  const base = join(kernel || resolveKernelRoot(root) || root, `design-system/references/${referenceReleaseDirectory(release)}`);
  const manifestPath = join(base, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("Reference release unavailable; restore the pinned harness package");
  const manifest = read<ReferenceManifest>(manifestPath);
  if (manifest.schemaVersion !== 1 || manifest.release !== release || manifest.labeledPreferenceData !== false) throw new Error("Unsupported reference manifest");
  const body = readFileSync(confinedReferencePath(base, manifest.catalog.path));
  if (referenceHash(body) !== manifest.catalog.sha256) throw new Error("Reference catalog hash mismatch");
  const catalog = JSON.parse(body.toString()) as ReferenceCatalog;
  const errors = validateReferenceCatalog(catalog);
  if (errors.length) throw new Error(`Reference catalog quarantined: ${errors.join("; ")}`);
  validateReferenceDependencies(catalog, resolve(base, "../../.."), base);
  return { base, kernel: resolve(base, "../../.."), manifest, catalog, manifestHash: referenceHash(readFileSync(manifestPath)) };
}

/** Validate dependencies before publishing an ingestion, as well as on consumption. */
export function validateReferenceDependencies(catalog: ReferenceCatalog, releaseKernel: string, base: string) {
  for (const record of catalog.records) for (const view of record.temporalEvidence || []) {
    const path = confinedReferencePath(base, view.recording.path);
    if (!existsSync(path) || referenceHash(readFileSync(path)) !== view.recording.sha256) throw new Error(`Missing or changed reference recording: ${record.id}`);
  }
  for (const record of catalog.records) for (const view of record.views) if (view.capture) {
    const path = confinedReferencePath(base, view.capture.path);
    if (!existsSync(path) || referenceHash(readFileSync(path)) !== view.capture.sha256) throw new Error(`Missing or changed reference capture: ${record.id}/${view.id}`);
  }
  const lessons = new Set(loadCompositionPack(releaseKernel).lessons.map(l=>l.id)), studies = loadReferenceStudies(releaseKernel, catalog.release);
  const studyIds = new Set(studies.catalog.studies.map(s=>s.id)), referenceIds = new Set(catalog.records.map(r=>r.id));
  for (const record of catalog.records) {
    if (!record.lessonIds.length || record.lessonIds.some(id=>!lessons.has(id))) throw new Error(`Missing reference lesson link: ${record.id}`);
    if (record.relatedExamples.some(id=>!studyIds.has(id))) throw new Error(`Missing original study link: ${record.id}`);
    if (record.visualEvidence?.durableOriginalIds.some(id=>!studyIds.has(id))) throw new Error(`Missing durable original evidence: ${record.id}`);
  }
  for (const study of studies.catalog.studies) if (study.referenceIds.some(id=>!referenceIds.has(id))) throw new Error(`Missing study reference link: ${study.id}`);
}

export type ReferenceSignals = { known: string[]; absent: string[]; theme: string; roles: string[]; visitorTasks?: string[]; complexity: "low" | "medium" | "high"; origins: unknown[]; contexts?: string[]; expression?: ReturnType<typeof expressionSignals> };
export function referenceSignals(root: string, release = referencePolicy(root)?.release || REFERENCE_RELEASE): ReferenceSignals {
  const signals = compositionSignalsFromSite(root);
  const text = (path: string) => existsSync(join(root, path)) ? read<Record<string, unknown>>(join(root, path)) : {};
  const business = text("onboarding/business.json"), request = text("agent/request.json"), story = text("onboarding/storyboard.json"), narrative = text("onboarding/narrative-brief.json"), media = text("onboarding/media-inventory.json");
  const businessText = JSON.stringify([business.offer, business.audience, business.engagement]);
  const extra: string[] = [];
  if (/service|repair|advis|consult|law|account|contract|architect|practice/i.test(businessText)) extra.push("professional-service");
  if (/shop|product|retail|collection/i.test(businessText)) extra.push("shop");
  if (/\bsoftware\b|\bworkflow\b|\bapp\b|\bplatform\b/i.test(businessText)) extra.push("technical-product");
  const usable = Array.isArray(media.assets) ? (media.assets as { inspected?: boolean; disposition?: string; kind?: string; role?: string; description?: string }[]).filter(a=>a.inspected && a.disposition === "use" && a.kind !== "video") : [];
  const hasUi = usable.some(a=>/\binterface\b|\bscreenshot\b|\bproduct ui\b|\bworkspace\b/i.test(`${a.role || ""} ${a.description || ""}`));
  if (hasUi) extra.push("product-ui");
  // Planned imagery is an intent, not evidence that usable assets exist.
  const established = signals.filter(s=>s.state === "known" && (!["approved-image","multiple-images"].includes(s.id) || Array.isArray(media.assets))).map(s=>s.id);
  const taskText = JSON.stringify([narrative.visitorQuestions,narrative.designOpportunities,story.pages,business.offer]);
  const taskPatterns: Record<string,RegExp> = { "evaluate-service": /service|scope|advis|repair|consult/i, "compare-options": /compare|choose|options|difference/i, "inspect-work": /project|portfolio|case study|finished work/i, "understand-process": /process|sequence|step|how it works/i, "shop-collection": /shop|purchase|retail|collection/i, "read-deeply": /essay|article|publication|read|guide/i, "find-location": /location|address|directions|parking/i, "book-inquiry": /book|inquir|contact|appointment|estimate/i, "explore-product": /software|product|workflow|demonstrat/i };
  const visitorTasks = Object.entries(taskPatterns).filter(([,p])=>p.test(taskText)).map(([id])=>id).sort();
  const roles = Array.isArray(story.pages) ? (story.pages as { role?: string }[]).map(p => p.role || "") : [];
  const result: ReferenceSignals = { known: [...new Set([...established, ...extra])].sort(), absent: [...new Set([...signals.filter(s => s.state === "absent").map(s => s.id), ...(Array.isArray(media.assets) && !hasUi ? ["product-ui"] : [])])].sort(), theme: typeof request.theme === "string" ? request.theme : "", roles, visitorTasks, complexity: request.referenceComplexity === "high" ? "high" : request.referenceComplexity === "medium" ? "medium" : "low", origins: [...signals, { taskInference: "keyword fit from established business/narrative/storyboard; not a new customer fact", businessHash: referenceHash(JSON.stringify(business)), requestHash: referenceHash(JSON.stringify(request)), storyboardHash: referenceHash(JSON.stringify(story)), narrativeHash: referenceHash(JSON.stringify(narrative)), mediaHash: referenceHash(JSON.stringify(media)) }] };
  if (release !== REFERENCE_RELEASE) {
    result.contexts = businessContexts(businessText);
    if (!/service|repair|advis|consult|law|account|contract|architect/i.test(businessText)) result.known=result.known.filter(id=>id!=="professional-service");
    if (result.contexts.includes("creative-practice")) result.visitorTasks=[...new Set([...(result.visitorTasks || []).filter(t=>t!=="evaluate-service"),"inspect-work","read-deeply"])].sort();
    result.visitorTasks=normalizeTasks(result.visitorTasks || [],release===CORRECTED_REFERENCE_RELEASE);
    result.expression=expressionSignals(result.theme);
  }
  return result;
}

export function selectReferences(pack: ReturnType<typeof loadReferenceCatalog>, signals: ReferenceSignals, acceptedIds?: string[], workingLimit = 4) {
  if (pack.catalog.release !== REFERENCE_RELEASE) return selectCorrectedReferences(pack, signals, acceptedIds, workingLimit);
  const excluded: { id: string; reason: string }[] = [], eligible: { id: string; revision: number; score: number; reasons: string[] }[] = [];
  for (const r of pack.catalog.records) {
    let exclusion = !r.eligible.metadata ? `evidence ${r.evidenceLevel}; metadata use not eligible` : r.lifecycle !== "active" ? "retired" : "";
    if (["one-image", "multiple-images"].includes(r.assetMinimum) && !signals.known.includes("approved-image")) exclusion = "essential approved media absent or not established";
    if (r.assetMinimum === "multiple-images" && !signals.known.includes("multiple-images")) exclusion = "multiple images absent or not established";
    if (r.assetMinimum === "product-ui" && !signals.known.includes("product-ui")) exclusion = "actual product UI absent or not established";
    if (r.coverage.immersive && signals.complexity !== "high") exclusion = "immersive interaction outside established complexity allowance";
    if (exclusion) { excluded.push({ id: r.id, reason: exclusion }); continue; }
    const hits = r.fitSignals.filter(s => signals.known.includes(s));
    const themeHits = [r.primaryFamily, ...r.tags].filter(t => signals.theme.toLowerCase().includes(t.replaceAll("-", " ")));
    const taskHits = r.visitorTasks.filter(task=>(signals.visitorTasks || []).includes(task));
    if (!hits.length && !themeHits.length && !taskHits.length) { excluded.push({ id: r.id, reason: "no established fit; expand discovery by recording task/evidence gaps" }); continue; }
    eligible.push({ id: r.id, revision: r.revision, score: hits.length * 3 + themeHits.length * 6 + Math.min(taskHits.length,2) * 2 + (r.evidenceLevel === "deep-reviewed" ? 1 : 0), reasons: [...hits.map(h => `fit:${h}`), ...themeHits.map(h => `explicit-theme:${h}`), ...taskHits.map(t=>`visitor-task:${t}`)] });
  }
  eligible.sort((a,b) => b.score - a.score || referenceHash(`${JSON.stringify(signals)}:${a.id}`).localeCompare(referenceHash(`${JSON.stringify(signals)}:${b.id}`)));
  // Diversity only breaks close fit scores. It cannot rescue an unsuitable reference.
  const complementary = (pool: typeof eligible, limit: number) => {
    const result: typeof eligible = [], remaining = [...pool];
    while (remaining.length && result.length < limit) {
      const best = remaining[0]!.score;
      const near = remaining.filter(r => r.score >= best - 2);
      const gain = (id: string) => { const r = pack.catalog.records.find(r => r.id === id)!; const seen=result.map(x=>pack.catalog.records.find(r=>r.id===x.id)!); return Number(!seen.some(x=>x.primaryFamily===r.primaryFamily)) + (r.compositionTags || []).filter(tag=>!seen.some(x=>x.compositionTags?.includes(tag))).length; };
      near.sort((a,b) => gain(b.id) - gain(a.id) || b.score - a.score || pool.indexOf(a) - pool.indexOf(b));
      const next = near[0]!; result.push(next); remaining.splice(remaining.indexOf(next), 1);
    }
    return result;
  };
  const shortlist = complementary(eligible, 10);
  if (acceptedIds && new Set(acceptedIds).size !== acceptedIds.length) throw new Error("Duplicate accepted reference IDs");
  const selected = acceptedIds ? acceptedIds.map(id => { const found = eligible.find(r => r.id === id); if (!found) throw new Error(`Accepted reference ${id} is unavailable/ineligible; explicitly revise reference analysis`); return found; }) : complementary(shortlist, workingLimit);
  return { schemaVersion: 1 as const, selectorVersion: REFERENCE_SELECTOR, release: pack.catalog.release, manifestHash: pack.manifestHash, catalogHash: pack.manifest.catalog.sha256, inputSignalHash: referenceHash(JSON.stringify(signals)), signals, eligible, excluded, shortlist, selected, accepted: !!acceptedIds, gaps: selected.length < 3 ? ["Fewer than three appropriate references; expand researched coverage or establish missing brief signals"] : [], inspectedEvidence: [] as string[], ties: [...new Set(eligible.map(r => r.score))].map(score => ({ score, ids: eligible.filter(r => r.score === score).map(r => r.id) })).filter(t => t.ids.length > 1) };
}

export function frozenReferenceSignals(root: string, accepted: { inputSignalHash: string; manifestHash: string }): ReferenceSignals {
  const runs=join(root,"agent/runs");
  for(const name of existsSync(runs)?readdirSync(runs).filter(n=>n.endsWith(".design-context.json")):[]){
    const path=join(runs,name);if(statSync(path).size>2_000_000)continue;
    const wrapper=read<{manifest?:{nodeId?:string;referenceSelection?:{signals:ReferenceSignals;inputSignalHash:string;manifestHash:string}}}>(path), m=wrapper.manifest;
    const receipt=m?.referenceSelection, preparation=join(root,"agent/preparations",name.slice(0,-".design-context.json".length)+".json");
    if(m?.nodeId!=="reference-analysis"||receipt?.inputSignalHash!==accepted.inputSignalHash||receipt.manifestHash!==accepted.manifestHash||!existsSync(preparation))continue;
    const p=read<{nodeId:string;status:string}>(preparation);
    if(p.nodeId==="reference-analysis"&&["prepared","consumed"].includes(p.status)&&referenceHash(JSON.stringify(receipt.signals))===accepted.inputSignalHash)return receipt.signals;
  }
  throw new Error("Accepted references need their frozen prepared analysis signals; explicitly revise analysis if unavailable");
}

function selectCorrectedReferences(pack: ReturnType<typeof loadReferenceCatalog>, signals: ReferenceSignals, acceptedIds?: string[], workingLimit=3) {
  const excluded:{id:string;reason:string}[]=[], eligible:{id:string;revision:number;score:number;components:ReturnType<typeof fitScore>["components"];reasons:string[];profile:FitProfile}[]=[];
  for(const r of pack.catalog.records){
    const profile=r.selectionProfile;
    if(!profile)throw new Error(`Corrected reference lacks normalized profile: ${r.id}`);
    const essential=essentialAssetGap(profile.interpretation?.assetMinimum||r.assetMinimum,signals);
    const reason=!r.eligible.metadata||r.lifecycle!=="active"||r.sourceStatus!=="live"||["blocked","unavailable","retired","redirect-unverified"].includes(r.visualEvidence?.availability || "")||["retired","unavailable","candidate"].includes(r.evidenceLevel)?"source unavailable/retired or metadata ineligible":essential || (r.coverage.immersive&&signals.complexity!=="high"?"immersive dependency outside complexity allowance":"");
    if(reason){excluded.push({id:r.id,reason});continue;}
    const fit=fitScore(profile,r.fitSignals,signals,pack.catalog.release===CORRECTED_REFERENCE_RELEASE);
    if(!fit.supported){excluded.push({id:r.id,reason:"no specific task, expression or context fit"});continue;}
    eligible.push({id:r.id,revision:r.revision,...fit,profile,reasons:[...fit.reasons,`evidence:${r.visualEvidence?.kind||"legacy-observation"}; fresh live inspection required before pixel claims`,...(profile.interpretation?[`interpretation:${profile.interpretation.scope}; missing:${profile.interpretation.missingDependencies.join(",")}`]:[])]});
  }
  const inputSignalHash=referenceHash(JSON.stringify(signals)), tie=(id:string)=>referenceHash(inputSignalHash+":"+id);
  eligible.sort((a,b)=>b.score-a.score||tie(a.id).localeCompare(tie(b.id)));
  const shortlist=complementaryFit(eligible,10,tie,pack.catalog.release===CORRECTED_REFERENCE_RELEASE);
  if(acceptedIds&&new Set(acceptedIds).size!==acceptedIds.length)throw new Error("Duplicate accepted reference IDs");
  const selected=acceptedIds?acceptedIds.map(id=>{const match=eligible.find(r=>r.id===id);if(!match)throw new Error(`Accepted reference ${id} is unavailable/ineligible; explicitly revise reference analysis`);return match;}):complementaryFit(shortlist,workingLimit,tie,pack.catalog.release===CORRECTED_REFERENCE_RELEASE);
  const expression=signals.expression||expressionSignals(signals.theme),gaps:string[]=[];
  if(!selected.length)gaps.push("specific-fit-gap: broaden researched discovery or establish the visitor task and approved assets");
  if(expression.uncertainty)gaps.push(`unsupported-expression: preserve exact request '${signals.theme}'; clarify interpretation or inspect suitable material`);
  else if(expression.families.length&&!selected.some(r=>r.profile.expressions.some(e=>expression.families.includes(e))))gaps.push("expression-coverage-gap: no eligible selected lesson supports requested expression; inspect source or justify bounded interpretation");
  return {schemaVersion:1 as const,selectorVersion:referenceSelectorVersion(pack.catalog.release),release:pack.catalog.release,manifestHash:pack.manifestHash,catalogHash:pack.manifest.catalog.sha256,inputSignalHash,signals,eligible,excluded,shortlist,selected,accepted:!!acceptedIds,gaps,inspectedEvidence:[] as string[],ties:[...new Set(eligible.map(r=>r.score))].map(score=>({score,ids:eligible.filter(r=>r.score===score).map(r=>r.id)})).filter(t=>t.ids.length>1)};
}

export function referenceContext(root: string, stage: string, kernel?: string) {
  const policy = referencePolicy(root);
  if (!policy || !["reference-analysis", "direction", "storyboard", "representative", "representative-quality", "pages", "visual-review", "content-review", "refine"].includes(stage)) return undefined;
  const pack = loadReferenceCatalog(root, kernel, policy.release);
  if (policy.manifestHash && policy.manifestHash !== pack.manifestHash) throw new Error("Pinned reference manifest changed");
  const path = join(root, "onboarding/reference-analysis.json");
  const analysis = existsSync(path) ? read<{ referenceSelection?: { manifestHash: string; selected: { id: string; revision: number }[]; teachingManifestHash?: string; teachingSelected?: { id: string; revision: number }[]; inputSignalHash: string; selectorVersion?: string } }>(path) : undefined;
  const accepted = stage !== "reference-analysis" ? analysis?.referenceSelection : undefined;
  if(accepted && policy.release!==REFERENCE_RELEASE && accepted.selectorVersion!==referenceSelectorVersion(policy.release))throw new Error("Accepted selector version changed; explicitly revise reference analysis");
  if (accepted && accepted.manifestHash !== pack.manifestHash) throw new Error("Accepted reference release changed; explicitly revise reference analysis");
  for (const chosen of accepted?.selected || []) if (!pack.catalog.records.some(r => r.id === chosen.id && r.revision === chosen.revision)) throw new Error(`Accepted reference revision changed: ${chosen.id}`);
  const receipt = selectReferences(pack, accepted && policy.release!==REFERENCE_RELEASE ? frozenReferenceSignals(root, accepted) : referenceSignals(root), accepted?.selected.map(r => r.id), 3);
  const summaries = receipt.selected.map(s => { const r = pack.catalog.records.find(r => r.id === s.id)!; return { id: s.id, revision: s.revision, reason: s.reasons.join(", "), summary: `${r.title}: ${r.adds}`, avoid: r.avoidWhen.join("; "), handle: `reference-${s.id}-r${s.revision}` }; });
  const text = [`Reference release ${pack.catalog.release}; manifest ${pack.manifestHash}; signal ${receipt.inputSignalHash}. Advisory teaching only; preserve customer facts and exact theme.`, ...summaries.map(s => `- ${s.id}@${s.revision}: ${s.summary.slice(0, 260)} Fit ${s.reason}. Avoid ${s.avoid.slice(0, 180)}. Expand ${s.handle}.`), ...receipt.gaps, "Inspect selected live routes or cleared captures before describing pixels. Delivery is not inspection. Record actual viewports/evidence and relationships in reference-analysis.referenceSelection; preserve the accepted idea in direction/storyboard and later review."].join("\n");
  const expansions = summaries.map(s => { const r = pack.catalog.records.find(r => r.id === s.id)!; const text = JSON.stringify({ boundary: "Teaching only. No customer claims, code, branding or assets transfer from this record.", record: r }, null, 2); return { id: s.handle, hash: referenceHash(text), chars: text.length, text }; });
  const discoveryText = JSON.stringify(receipt, null, 2);
  expansions.push({ id: "reference-discovery", hash: referenceHash(discoveryText), chars: discoveryText.length, text: discoveryText });
  const teaching = referenceStudyExpansions(pack.kernel, receipt.signals, receipt.selected.map(r => r.id), accepted?.teachingSelected, policy.release);
  if (policy.teachingManifestHash && policy.teachingManifestHash !== teaching.pack.manifestHash) throw new Error("Pinned original teaching manifest changed");
  if (accepted?.teachingManifestHash && accepted.teachingManifestHash !== teaching.pack.manifestHash) throw new Error("Accepted original teaching release changed; explicitly revise reference analysis");
  expansions.push(...teaching.expansions);
  const teachingText = teaching.selected.map(s => `- Original study ${s.id}@${s.revision}: ${s.idea} Expand ${s.handle}; inspect its pinned desktop/mobile homepage and interior previews. Fictional facts never transfer.`).join("\n");
  return { policy, pack, receipt: { ...receipt, gaps:[...receipt.gaps,...teaching.gaps], teachingManifestHash: teaching.pack.manifestHash, teachingSelected: teaching.selected }, text: [text, teachingText, ...teaching.gaps].filter(Boolean).join("\n"), expansions };
}

export function referenceCoverage(catalog: ReferenceCatalog) {
  const screened = catalog.records.filter(r => ["live-screened", "deep-reviewed"].includes(r.evidenceLevel)), deep = screened.filter(r => r.evidenceLevel === "deep-reviewed");
  const count = (records: ReferenceRecord[], key: keyof ReferenceRecord["coverage"]) => records.filter(r => r.coverage[key]).length;
  return { total: catalog.records.length, candidate: catalog.records.filter(r => r.evidenceLevel === "candidate").length, screened: screened.length, deep: deep.length, eligibleMetadata: catalog.records.filter(r => r.eligible.metadata).length, eligibleImages: catalog.records.filter(r => r.eligible.images).length, unavailable: catalog.records.filter(r => ["unavailable", "retired"].includes(r.evidenceLevel)).length, families: REFERENCE_FAMILIES.map(family => ({ family, screened: screened.filter(r => r.primaryFamily === family).length, deep: deep.filter(r => r.primaryFamily === family).length, deepGap: Math.max(0, 3 - deep.filter(r => r.primaryFamily === family).length) })), crossCutting: Object.fromEntries((["localProfessional", "sparseMedia", "informationDense", "immersive"] as const).map(key => [key, { screened: count(screened, key), deep: count(deep, key) }])), intersections: { localSparse: screened.filter(r => r.coverage.localProfessional && r.coverage.sparseMedia).length, localDense: screened.filter(r => r.coverage.localProfessional && r.coverage.informationDense).length, sparseDense: screened.filter(r => r.coverage.sparseMedia && r.coverage.informationDense).length } };
}
