import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReferenceAnalysis } from "./artifacts.ts";
import { loadReferenceCatalog, referenceHash, referencePolicy, selectReferences, REFERENCE_RELEASE, referenceSelectorVersion, type ReferenceSignals } from "./reference-library.ts";
import { loadReferenceStudies, referenceStudyExpansions } from "./reference-studies.ts";

/** Checks recorded provenance and coverage; it cannot prove that a person/model saw pixels. */
export function validateReferenceSelection(root: string, analysis: ReferenceAnalysis, kernel?: string): string[] {
  const errors: string[] = [];
  try {
    const policy=referencePolicy(root); if (!policy) return errors;
    const selection=analysis.referenceSelection;
    if (!selection) return ["Opted-in reference release needs accepted referenceSelection and actual inspection evidence"];
    const pack=loadReferenceCatalog(root,kernel), teaching=loadReferenceStudies(pack.kernel,policy.release);
    if(policy.release!==REFERENCE_RELEASE && selection.selectorVersion!==referenceSelectorVersion(policy.release)) errors.push("Accepted selector version mismatch; revise reference analysis explicitly");
    if (selection.release!==pack.catalog.release || selection.manifestHash!==pack.manifestHash || selection.catalogHash!==pack.manifest.catalog.sha256 || (policy.manifestHash && policy.manifestHash!==pack.manifestHash)) errors.push("Accepted reference release/hash mismatch; revise reference analysis explicitly");
    if (selection.teachingManifestHash!==teaching.manifestHash || (policy.teachingManifestHash && policy.teachingManifestHash!==teaching.manifestHash)) errors.push("Accepted original teaching manifest mismatch");
    const runs=join(root,"agent/runs"); let signals: ReferenceSignals | undefined;
    // Reuse the analysis preparation's frozen signals, since later direction/storyboard
    // legitimately develop the idea and must not retroactively rewrite discovery.
    for (const name of existsSync(runs) ? readdirSync(runs).filter(n=>n.endsWith(".design-context.json")).slice(0,5000) : []) {
      const path=join(runs,name); if (statSync(path).size>2_000_000) continue;
      const wrapper=JSON.parse(readFileSync(path,"utf8")), manifest=wrapper.manifest, receipt=manifest?.referenceSelection;
      const id=name.slice(0,-".design-context.json".length), preparation=join(root,"agent/preparations",`${id}.json`);
      if (manifest?.nodeId!=="reference-analysis" || receipt?.inputSignalHash!==selection.inputSignalHash || receipt.manifestHash!==selection.manifestHash || receipt.teachingManifestHash!==selection.teachingManifestHash || !existsSync(preparation)) continue;
      const p=JSON.parse(readFileSync(preparation,"utf8"));
      if (p.nodeId!=="reference-analysis" || !["prepared","consumed"].includes(p.status)) continue;
      if (referenceHash(JSON.stringify(receipt.signals))===selection.inputSignalHash) { signals=receipt.signals; break; }
    }
    if (!signals) errors.push("Accepted reference signals lack a matching prepared analysis receipt");
    const external=Array.isArray(selection.selected) ? selection.selected : [], originals=Array.isArray(selection.teachingSelected) ? selection.teachingSelected : [];
    const chosen=[...external,...originals];
    if (!chosen.length || chosen.length>5 || new Set(chosen.map(s=>s.id)).size!==chosen.length) errors.push("Accepted working set must contain one to five unique references/studies");
    if (chosen.some(s=>!s.reason?.trim())) errors.push("Each accepted reference/study needs a relevance reason");
    if (signals) {
      selectReferences(pack,signals,external.map(s=>s.id));
      referenceStudyExpansions(pack.kernel,signals,external.map(s=>s.id),originals,policy.release);
    }
    const evidence=Array.isArray(selection.inspectedEvidence) ? selection.inspectedEvidence : [];
    for (const e of evidence) {
      const owner=chosen.find(s=>s.id===e.id && s.revision===e.revision);
      if (!owner || !e.route || !e.evidencePointer?.trim() || !e.observed?.trim() || !Number.isFinite(e.viewport?.width) || !Number.isFinite(e.viewport?.height) || e.viewport.width<=0 || e.viewport.height<=0) errors.push(`Invalid actual inspection pointer: ${e.id}`);
      if(policy.release!==REFERENCE_RELEASE){
        if(!["retained-capture","live-only","accessible-session"].includes(e.kind || "") || !Number.isFinite(Date.parse(e.inspectedAt || "")) || e.sourceRevision!==e.revision)errors.push(`Missing current visual evidence state: ${e.id}; revisit source or open a pinned original preview`);
        const preparationTime = selection.acceptedAt;
        if(!preparationTime || !Number.isFinite(Date.parse(preparationTime)) || Date.parse(e.inspectedAt || "")<Date.parse(preparationTime)-7*86400000 || Date.parse(e.inspectedAt || "")>Date.parse(preparationTime)+300000)errors.push(`Stale inspection time: ${e.id}; re-inspect under the current analysis`);
        if(e.kind==="retained-capture"){
          if(!e.capture || !existsSync(e.capture.path) || referenceHash(readFileSync(e.capture.path))!==e.capture.sha256)errors.push(`Missing/changed retained visual evidence: ${e.id}`);
          const original=teaching.catalog.studies.find(s=>s.id===e.id);
          if(original && !original.renderEvidence.some(v=>v.route===e.route && v.viewport.width===e.viewport.width && [v.preview,v.fullPreview].some(pin=>pin?.sha256===e.capture?.sha256)))errors.push(`Retained evidence does not match the pinned original route/viewport: ${e.id}`);
        }
        if(e.kind==="accessible-session" && (!e.sessionId?.trim() || !/^https?:|^plugin:/.test(e.evidencePointer)))errors.push(`Session evidence is not resolvable: ${e.id}; use live-only if no real accessible session exists`);
        if(e.kind==="live-only" && !/^https?:\/\//.test(e.evidencePointer))errors.push(`Live-only evidence needs an actual source URL: ${e.id}`);
      }
    }
    for (const s of external) {
      const record=pack.catalog.records.find(r=>r.id===s.id && r.revision===s.revision);
      if (!record) { errors.push(`Accepted reference revision unavailable: ${s.id}`); continue; }
      const views=evidence.filter(e=>e.id===s.id && e.revision===s.revision);
      if (![true,false].every(narrow=>views.some(e=>(e.viewport?.width<600)===narrow))) errors.push(`Accepted live reference needs actual desktop/narrow inspection: ${s.id}`);
      for (const view of views) { try { if (new URL(view.route).origin!==new URL(record.resolvedUrl!).origin) errors.push(`Inspection route outside accepted publisher: ${s.id}`); } catch { errors.push(`Invalid publisher inspection URL: ${s.id}`); } }
    }
    for (const s of originals) for (const route of ["/","/detail"]) for (const narrow of [true,false]) if (!evidence.some(e=>e.id===s.id && e.revision===s.revision && e.route===route && (e.viewport?.width<600)===narrow)) errors.push(`Accepted original needs inspected homepage/interior at both widths: ${s.id}/${route}`);
    for (const key of ["homepage","interior","mobile","action"] as const) if (!selection.plannedRelationships?.[key]?.trim()) errors.push(`Missing accepted reference relationship: ${key}`);
  } catch (error) { errors.push(`Reference selection contract: ${error instanceof Error ? error.message : String(error)}`); }
  return errors;
}
