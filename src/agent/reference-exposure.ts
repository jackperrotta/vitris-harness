import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { referenceHash } from "./reference-library.ts";

/** Read-only diagnostics. This history never participates in reference ranking. */
export function referenceExposure(directory: string) {
  const delivered = new Map<string, { files: string[]; selected: string[]; teaching: string[]; manifestHash: string; inputSignalHash: string; inspected: number }>();
  const unreadable: { path: string; reason: string }[] = [];
  let scanned = 0;
  const walk = (root: string) => {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(root, entry.name);
      if (entry.isDirectory()) { if (!["node_modules", ".git", "dist"].includes(entry.name)) walk(path); continue; }
      if (!entry.name.endsWith(".json")) continue;
      if (++scanned > 5000) throw new Error("Exposure scan exceeds 5000 JSON files; use a narrower explicit receipts directory");
      if (statSync(path).size > 2_000_000) continue;
      try {
        const body = readFileSync(path, "utf8");
        if (!body.includes('"referenceSelection"') && !body.includes('"teachingSelected"') && !body.includes('"selectorVersion"')) continue;
        const obj = JSON.parse(body), receipt = obj.manifest?.referenceSelection || obj.referenceSelection || obj.receipt || obj;
        if (!receipt.manifestHash || !Array.isArray(receipt.selected)) continue;
        const selected = receipt.selected.map((s: { id: string; revision: number }) => `${s.id}@${s.revision}`).sort();
        const teaching = (receipt.teachingSelected || []).map((s: { id: string; revision: number }) => `${s.id}@${s.revision}`).sort();
        // Packet copies and stages with identical source/treatment/selection count once.
        const signature = referenceHash(JSON.stringify([receipt.manifestHash, receipt.teachingManifestHash, receipt.inputSignalHash, selected, teaching]));
        const existing = delivered.get(signature);
        if (existing) { existing.files.push(relative(directory, path)); existing.inspected=Math.max(existing.inspected,Array.isArray(receipt.inspectedEvidence)?receipt.inspectedEvidence.length:0); }
        else delivered.set(signature, { files:[relative(directory,path)], selected, teaching, manifestHash:receipt.manifestHash, inputSignalHash:receipt.inputSignalHash, inspected:Array.isArray(receipt.inspectedEvidence)?receipt.inspectedEvidence.length:0 });
      } catch (error) { unreadable.push({ path:relative(directory,path), reason:String(error) }); }
    }
  };
  walk(directory);
  const exposures = [...delivered.values()], count = (values: string[]) => [...new Set(values)].map(id=>({ id, contexts:values.filter(v=>v===id).length })).sort((a,b)=>b.contexts-a.contexts||a.id.localeCompare(b.id));
  return { schemaVersion:1, scope:"Distinct treatment/signal/selection combinations in the explicit directory; duplicate packet/stage copies collapsed. This is delivery, not proof of inspection or a generation/run count.", selectionHistoryInfluence:"none", scannedJsonFiles:scanned, distinctContexts:exposures.length, references:count(exposures.flatMap(e=>e.selected)), originalStudies:count(exposures.flatMap(e=>e.teaching)), combinations:count(exposures.map(e=>[...e.selected,...e.teaching].join(" + "))), exposures, unreadable };
}
