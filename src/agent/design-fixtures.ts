import { join } from "node:path";
import {existsSync,readFileSync} from 'node:fs';
import { fingerprint, type Business, type MediaInventory, type NarrativeBrief, type ReferenceAnalysis } from "./artifacts.ts";
import { calibrationPackHash, loadCalibrationManifest } from "./design-calibration.ts";
import { loadKnowledgeCatalog } from "./design-knowledge.ts";
import {save} from './artifacts.ts';

/** Refresh only a disposable copied fixture; historical fixture bytes stay intact. */
export function refreshFixtureCalibration(root:string,kernel:string):void {
 const path=join(root,'onboarding/reference-analysis.json');if(!existsSync(path))return;
 const analysis=JSON.parse(readFileSync(path,'utf8'));
 const manifest=loadCalibrationManifest(kernel);
 const evidence=manifest.records.filter(r=>r.name.startsWith('vitris-')).slice(0,3).map(r=>r.file);
 analysis.packVersion=manifest.packVersion;analysis.packHash=calibrationPackHash(kernel);
 analysis.evidencePaths=evidence;
 for(const principle of analysis.applicable||[])principle.evidencePaths=[evidence[0]];
 save(path,analysis);
 const statePath=join(root,'agent/STATE.json');
 if(existsSync(statePath)){
  const state=JSON.parse(readFileSync(statePath,'utf8'));
  if(state.nodes?.['reference-analysis']?.status==='done')state.nodes['reference-analysis'].outputHash=fingerprint(root,['onboarding/reference-analysis.json']);
  save(statePath,state);
 }
}

export function teachingPrincipleRef(kernel: string, lessonId: string, reason: string): {
  id: string;
  version: number;
  contentHash: string;
  reason: string;
} {
  const catalog = loadKnowledgeCatalog(kernel);
  if (!catalog) throw new Error("Kernel design-knowledge catalog is unavailable");
  const lesson = catalog.lessons.find(item => item.id === lessonId);
  if (!lesson) throw new Error(`Unknown lesson ${lessonId}`);
  return { id: lesson.id, version: lesson.version, contentHash: lesson.contentHash, reason };
}

export function fixtureNarrativeV2(root: string, business: Business, media: MediaInventory): NarrativeBrief {
  const businessHash = fingerprint(root, ["onboarding/business.json"]);
  const mediaHash = fingerprint(root, ["onboarding/media-inventory.json"]);
  return {
    schemaVersion: 2,
    businessHash,
    mediaHash,
    customer: "Local homeowners",
    problem: "A leak",
    offer: "Roof repairs",
    serviceScope: "Inspection and repair",
    proof: { statement: "Repairs roofs", status: "limited", evidenceIds: ["e1"] },
    conversion: "Request an estimate",
    objections: [],
    unsupportedClaims: ["No invented awards"],
    facts: [{ id: "f1", claim: "Repairs roofs", evidenceIds: ["e1"] }],
    visitorQuestions: [{
      id: "q1",
      question: "Can they repair my roof before the next storm?",
      relationshipToConversion: "The estimate is the conversion step",
      priority: 1,
    }],
    assetNotes: [{
      mediaId: "roof",
      strength: "One inspected alternate view of roof work",
      limitation: "Not a full project gallery; do not invent more jobs",
    }],
    toneConstraints: [],
    recordedUserGoals: [],
    designOpportunities: [{
      id: "opp-roof",
      visitorNeed: "See credible roof repair scope",
      businessRelevance: "The offer is inspection and repair for leaks",
      evidenceIds: ["e1"],
      mediaIds: ["roof"],
      presentationOpportunity: "Pair the scoped offer with the inspected roof photo instead of a stock skyline",
      constraints: ["No invented awards or extra photos"],
      basis: "evidence-backed",
    }],
  };
}

export function fixtureReferenceAnalysisV2(root: string, kernel: string): ReferenceAnalysis {
  return {
    schemaVersion: 1,
    packVersion: loadCalibrationManifest(kernel).packVersion,
    packHash: calibrationPackHash(kernel),
    narrativeHash: fingerprint(root, ["onboarding/narrative-brief.json"]),
    teachingPrinciples: [
      teachingPrincipleRef(kernel, "sparse-imagery-process", "One inspected project photo is not a gallery; explain scope in type and structure"),
    ],
    applicable: [{ principle: "Connect proof to the first action", why: "This business sells an estimate from real work evidence", evidencePaths: ["vitris-northline-counsel-home-1280-viewport.png"] }],
    avoided: [{ principle: "Import demo portraits as staff", why: "Those people are not this company" }],
    plannedApplication: { homepage: "Lead with the offer and a retained project photo", interior: "Explain scope without repeating the hero" },
    evidencePaths: ["vitris-northline-counsel-home-1280-viewport.png", "vitris-tide-and-slate-home-1280-viewport.png", "vitris-tide-and-slate-project-1280-viewport.png"],
  };
}
