import {fitScore, complementaryFit, essentialAssetGap, type FitProfile, type FitSignals} from "./reference-fit.ts";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { loadCompositionPack } from "../knowledge/composition.ts";

type FilePin = { path: string; sha256: string };
export type ReferenceStudy = {
  motionTags?: string[];
  temporalEvidence?: import("./reference-library.ts").ReferenceRecord["temporalEvidence"];
  id: string; revision: number; title: string; primaryFamily: string; assetMinimum: string;
  fitSignals: string[]; organizingIdea: string; lessonIds: string[]; referenceIds: string[];
  selectionProfile?: FitProfile; exampleScope?: string; releaseNotes?: string; comparisonStatus?: string;
  sourcePath: string; status: string; humanPreference: null;
  brief: { fictional: true; facts: unknown; factsHash: string; mediaHash: string };
  provenance: { content: string; media: string; rights: string };
  renderEvidence: { route: string; viewport: { width: number; height: number }; preview: FilePin; fullPreview?: FilePin;
    visualReview: { assessor: string; reviewedAt: string; assessment: string } }[];
};
const hash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
function confined(base: string, path: string) {
  const target = resolve(base, path), rel = relative(base, target);
  if (!rel || isAbsolute(path) || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`Study path escapes release: ${path}`);
  return target;
}
/** Original teaching material is independently pinned; external curation never supplies assets. */
export function loadReferenceStudies(kernel: string, release = "2026-10-05.1") {
  if (!["2026-10-05.1","2026-10-06.1","2026-10-06.2"].includes(release)) throw new Error(`Unsupported original study release: ${release}`);
  const dataRoot = process.env.VITRIS_REFERENCE_DATA ? resolve(process.env.VITRIS_REFERENCE_DATA) : kernel;
  const base = join(dataRoot, release === "2026-10-05.1" ? "design-system/compositions/v2" : release === "2026-10-06.1" ? "design-system/compositions/v3" : "design-system/compositions/v4"), manifestPath = join(base, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("Original reference study release unavailable. Corrected teaching releases are optional data; set VITRIS_REFERENCE_DATA to the verified teaching bundle root (see docs/DISTRIBUTION.md).");
  const bytes = readFileSync(manifestPath), manifest = JSON.parse(bytes.toString()) as { schemaVersion: number; release: string; labeledPreferenceData: boolean; catalog: FilePin; files: FilePin[] };
  if (manifest.schemaVersion !== 1 || manifest.release !== release || manifest.labeledPreferenceData !== false || !Array.isArray(manifest.files)) throw new Error("Unsupported original study manifest");
  const readPinned = (pin: FilePin) => {
    const path = confined(base, pin.path);
    if (!existsSync(path) || hash(readFileSync(path)) !== pin.sha256) throw new Error(`Missing or changed original study file: ${pin.path}`);
    return readFileSync(path);
  };
  const catalog = JSON.parse(readPinned(manifest.catalog).toString()) as { schemaVersion: number; release: string; studies: ReferenceStudy[] };
  if (catalog.schemaVersion !== 1 || catalog.release !== manifest.release || !Array.isArray(catalog.studies)) throw new Error("Unsupported original study catalog");
  const pins = new Map(manifest.files.map(pin => [pin.path, pin]));
  if (pins.size !== manifest.files.length) throw new Error("Duplicate original study file pins");
  for (const pin of manifest.files) readPinned(pin);
  const ids = new Set<string>();
  for (const study of catalog.studies) {
    if (study.motionTags !== undefined && (!Array.isArray(study.motionTags) || study.motionTags.some(t=>typeof t!=="string"||!t.trim()))) throw new Error(`Invalid motion study tags: ${study.id}`);
    for (const evidence of study.temporalEvidence || []) {
      if (!evidence.route || !evidence.observation?.trim() || !["agent","human"].includes(evidence.assessor) || !/^[a-f0-9]{64}$/.test(evidence.scenarioHash) || !/^[a-f0-9]{64}$/.test(evidence.sourceHash) || pins.get(evidence.recording?.path)?.sha256 !== evidence.recording?.sha256) throw new Error(`Unverified original motion recording: ${study.id}`);
    }
    if (!/^[a-z0-9-]+$/.test(study.id) || ids.has(study.id) || !Number.isInteger(study.revision) || study.revision < 1 || study.brief?.fictional !== true || study.humanPreference !== null) throw new Error(`Invalid original study contract: ${study.id}`);
    ids.add(study.id);
    if (!study.organizingIdea || !study.provenance?.rights || !study.lessonIds?.length || !Array.isArray(study.renderEvidence)) throw new Error(`Incomplete original study: ${study.id}`);
    confined(base, study.sourcePath);
    if (!pins.has(`${study.sourcePath}/study.json`) || !pins.has(`${study.sourcePath}/pages/index.html`) || !pins.has(`${study.sourcePath}/pages/detail/index.html`)) throw new Error(`Unpinned original study source: ${study.id}`);
    for (const width of [1440,390]) for (const route of ["/","/detail"]) if (!study.renderEvidence.some(v=>v.route===route&&v.viewport.width===width)) throw new Error(`Missing original study view: ${study.id}/${route}/${width}`);
    for (const view of study.renderEvidence) {
      if (pins.get(view.preview.path)?.sha256 !== view.preview.sha256 || !view.visualReview?.reviewedAt) throw new Error(`Unverified original preview: ${study.id}`);
      if (view.fullPreview && pins.get(view.fullPreview.path)?.sha256!==view.fullPreview.sha256) throw new Error(`Unverified full original preview: ${study.id}`);
    }
  }
  const lessons = new Set(loadCompositionPack(kernel).lessons.map(l=>l.id));
  for (const study of catalog.studies) if (study.lessonIds.some(id=>!lessons.has(id))) throw new Error(`Missing original study lesson link: ${study.id}`);
  return { base, manifest, manifestHash: hash(bytes), catalog, pins };
}

export function referenceStudyExpansions(kernel: string, signals: FitSignals, references: string[], accepted?: { id: string; revision: number }[], release = "2026-10-05.1") {
  const pack = loadReferenceStudies(kernel, release);
  const legacyRanked = () => pack.catalog.studies.filter(s => s.renderEvidence.length >= 4 && s.fitSignals.some(f => signals.known.includes(f)) && (s.assetMinimum === "none" || (s.assetMinimum === "product-ui" ? signals.known.includes("product-ui") : signals.known.includes("approved-image"))) && (s.assetMinimum !== "multiple-images" || signals.known.includes("multiple-images")))
    .map(s => ({ study: s, score: s.fitSignals.filter(f => signals.known.includes(f)).length * 3 + Number(s.referenceIds.some(id => references.includes(id))) }))
    .sort((a,b) => b.score - a.score || hash(`${JSON.stringify(signals)}:${a.study.id}`).localeCompare(hash(`${JSON.stringify(signals)}:${b.study.id}`)));
  const excluded: {id:string;reason:string}[]=[];
  const correctedRanked=()=>pack.catalog.studies.flatMap(study=>{
    if (!study.selectionProfile) throw new Error("Corrected study lacks normalized selection profile: "+study.id);
    const profile=study.selectionProfile, interpretation=profile.interpretation;
    const gap=essentialAssetGap(interpretation?.assetMinimum || study.assetMinimum,signals);
    if(gap || study.renderEvidence.length<4){excluded.push({id:study.id,reason:gap || "missing preview evidence"});return [];}
    const fit=fitScore(profile,study.fitSignals,signals,release==="2026-10-06.2");if(!fit.supported){excluded.push({id:study.id,reason:"no specific task, expression or context fit"});return [];}
    return [{id:study.id,study,profile,...fit}];
  }).sort((a,b)=>b.score-a.score||hash(JSON.stringify(signals)+a.id).localeCompare(hash(JSON.stringify(signals)+b.id)));
  const correctedPool = release === "2026-10-05.1" ? undefined : correctedRanked();
  const ranked = release === "2026-10-05.1" ? legacyRanked() : correctedPool!;
  if (accepted && new Set(accepted.map(s=>s.id)).size !== accepted.length) throw new Error("Duplicate accepted original study IDs");
  const selected = accepted ? accepted.map(s=>{const match=ranked.find(r=>r.study.id===s.id&&r.study.revision===s.revision);if(!match)throw new Error(`Accepted original study unavailable/ineligible: ${s.id}`);return match;}) : release === "2026-10-05.1" ? ranked.slice(0,2) : complementaryFit(correctedPool!,2,id=>hash(JSON.stringify(signals)+id),release==="2026-10-06.2");
  const expansions = selected.map(({study,score}) => {
    const source = [...pack.pins].filter(([path]) => path.startsWith(`${study.sourcePath}/`)).map(([path,pin]) => ({ ...pin, absolutePath: confined(pack.base,path) }));
    const previews = study.renderEvidence.map(v => ({ ...v, absolutePath: confined(pack.base,v.preview.path) }));
    const text = JSON.stringify({ boundary: "Original fictional teaching only. Inspect homepage/interior at both widths. Adapt relationships; do not import demo facts into customer inventories.", manifestHash: pack.manifestHash, fitScore: score, study, source, previews },null,2);
    return { id: `reference-study-${study.id}-r${study.revision}`, hash: hash(text), chars: text.length, text };
  });
  const gaps: string[]=[];
  if(release!=="2026-10-05.1") {
    if(!selected.length)gaps.push("original-fit-gap: establish specific tasks/assets or author a suitable original lesson");
    const requested=signals.expression?.families || [];
    if(signals.theme?.trim() && (!requested.length || !selected.some(s=>s.study.selectionProfile?.expressions.some(e=>requested.includes(e)))))gaps.push("original-expression-gap: requested expression lacks an eligible selected interpretation; inspect a suitable source or explicitly justify an adaptation");
  }
  return { pack, excluded, gaps, selected: selected.map(({study,score}) => ({id:study.id,revision:study.revision,score,reasons:(study.selectionProfile ? fitScore(study.selectionProfile,study.fitSignals,signals,release==="2026-10-06.2").reasons : []),handle:`reference-study-${study.id}-r${study.revision}`,idea:study.organizingIdea})), expansions };
}
