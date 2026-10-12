import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { choice, score, type ScoreCriteria } from "@typesafe-ai/sdk";
import { json, save, fingerprint, type MediaInventory } from "../artifacts.ts";
import type { JevClient } from "./client.ts";
import type { JevCapabilityConfig, JevMode } from "./types.ts";
import { shortlistForSlot, type MediaAsset, type MediaSlot, type MediaSelection } from "../../stock/selection.ts";
import { readStockCatalog, accepted } from "../../stock/library.ts";
import { searchStock } from "../../stock/search.ts";

export const MEDIA_POLICY = "media-selection-v1";
export const MEDIA_TASKS = [
  {id: "media-taxonomy", capability: "mediaClassification", stages: ["media"]},
  {id: "media-section-ranking", capability: "mediaSelection", stages: ["direction", "storyboard"]},
  {id: "media-set-review", capability: "mediaSetReview", stages: ["representative", "visual-review"]},
  {id: "media-provenance-check", capability: "mediaProvenance", stages: ["representative", "content-review"]},
] as const;
type TaskId = typeof MEDIA_TASKS[number]["id"];
export type MediaTaskResult = {task: TaskId; mode: JevMode; subjectHash: string; state: "observed" | "partial" | "unavailable" | "no_candidates"; result?: unknown; receipts: string[]; reason?: string};
const criteria: ScoreCriteria = [
  {score: 0, description: "Unusable or contradicts the supplied section constraints."},
  {score: 1, description: "Weak fit; significant mismatch."},
  {score: 2, description: "Usable fit with a meaningful limitation."},
  {score: 3, description: "Strong fit for the supplied section."},
  {score: 4, description: "Excellent fit with specifically supported advantages."},
];
export async function rankMedia(opts: {client?: JevClient; nodeId: string; context: string; slot: MediaSlot; assets: MediaAsset[]; signal?: AbortSignal}) {
  const candidates = shortlistForSlot(opts.assets, opts.slot);
  const receipts: string[] = [];
  const rows: {id: string; state: "observed" | "unavailable"; scores?: number[]; score?: number}[] = [];
  for (const asset of candidates) {
    if (!opts.client) { rows.push({id: asset.id, state: "unavailable"}); continue; }
    try {
      const response = await opts.client.evaluate({taskType: "custom", nodeId: opts.nodeId, signal: opts.signal,
        state: {policy: MEDIA_POLICY, task: "media-section-ranking", context: opts.context, slot: opts.slot, asset},
        questions: {
          semantic: score("Rate subject/activity relevance for this section using supplied observations. Stock is valid illustration; do not mistake it for customer evidence.", criteria),
          composition: score("Rate crop, focal point, negative space and section layout fit. Unobserved visual facts do not justify a high score.", criteria),
          style: score("Rate lighting, palette, density and art-direction compatibility from supplied observations; Jev has not seen pixels.", criteria),
        }});
      receipts.push(response.receiptPath);
      const answers = response.result.answers as Record<string, {score?: number}>;
      const values = ["semantic", "composition", "style"].map(k => answers[k]?.score);
      if (values.every((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 4)) rows.push({id: asset.id, state: "observed", scores: values, score: values.reduce((a,b) => a+b,0)/3});
      else rows.push({id: asset.id, state: "unavailable"});
    } catch { rows.push({id: asset.id, state: "unavailable"}); }
  }
  const complete = rows.every(r => r.state === "observed");
  return {slot: opts.slot, state: !rows.length ? "no_candidates" : complete ? "observed" : "partial", noMatch: !rows.length || (complete && rows.every(r => r.score! < 2)), shortlist: complete ? rows.sort((a,b) => b.score! - a.score! || a.id.localeCompare(b.id)) : rows, receipts, autoSelected: false};
}

/** Preparation-bound advisory reports. Off does no inference; shadow never changes the prompt. */
export async function prepareMediaAssistance(opts: {root: string; kernel: string; stage: string; preparationId: string; capabilities: JevCapabilityConfig; client?: JevClient; signal?: AbortSignal}): Promise<string> {
  const {root} = opts;
  const read = <T>(path: string, fallback: T): T => existsSync(join(root, path)) ? json<T>(join(root, path)) : fallback;
  const inventory = read<MediaInventory>("onboarding/media-inventory.json", {version: 2, harvestHash: "", assets: []});
  const slots = read<{slots: MediaSlot[]}>("onboarding/media-requests.json", {slots: []}).slots;
  const selection = read<MediaSelection>("onboarding/media-selection.json", {version: 1, placements: []});
  const context = ["onboarding/business.json", "onboarding/narrative-brief.json", "onboarding/direction.json"].filter(p=>existsSync(join(root,p))).map(p=>readFileSync(join(root,p),"utf8")).join("\n").slice(0, 16000);
  const catalogPath = join(opts.kernel, "src/stock/catalog.json");
  const stock = opts.stage === "media" && existsSync(catalogPath) ? searchStock(readStockCatalog(catalogPath).items.filter(accepted), {text: context || (existsSync(join(root,"launch.json")) ? readFileSync(join(root,"launch.json"),"utf8") : ""), limit: 8}) : [];
  const stockAssets: MediaAsset[] = stock.map(i => ({id: i.id, path: i.src, sources: [i.sourceUrl || ""], description: i.inspection!.description, role: "illustration", disposition: "retain", reason: "Candidate only; import explicitly", inspected: true, placements: [], origin: "stock", identity: "none", sha256: i.sha256, inspection: i.inspection}));
  const subjectHash = fingerprint(root, ["onboarding/media-inventory.json", "onboarding/media-requests.json", "onboarding/media-selection.json", "onboarding/business.json", "onboarding/direction.json"]);
  const results: MediaTaskResult[] = [], notes: string[] = [];
  if (stock.length) notes.push("Stock candidates (inspect and import during media; these are not business identity evidence): " + stock.map(i=>`${i.id}: ${i.inspection!.description}`).join("\n"));
  for (const spec of MEDIA_TASKS) {
    if (!(spec.stages as readonly string[]).includes(opts.stage)) continue;
    const mode = opts.capabilities[spec.capability] || "off"; if (mode === "off") continue;
    const record: MediaTaskResult = {task: spec.id, mode, subjectHash, state: "unavailable", receipts: []};
    try {
      if (spec.id === "media-section-ranking") {
        const rankings = [];
        for (const slot of slots.slice(0, 8)) rankings.push(await rankMedia({client: opts.client, nodeId: opts.stage, context, slot, assets: inventory.assets, signal: opts.signal}));
        record.result = rankings; record.receipts = rankings.flatMap(r => r.receipts);
        record.state = !rankings.length ? "no_candidates" : rankings.every(r=>r.state === "observed" || r.state === "no_candidates") ? "observed" : "partial";
      } else if (!opts.client) record.reason = "Jev unavailable; agent retains all media decisions";
      else if (spec.id === "media-taxonomy") {
        const classifications = [];
        for (const asset of [...inventory.assets, ...stockAssets].filter(a=>a.inspected).slice(0, 12)) {
          const r = await opts.client.evaluate({taskType: "custom", nodeId: opts.stage, signal: opts.signal, state: {policy: MEDIA_POLICY, task: spec.id, asset}, questions: {
            role: choice("Suggest the best general illustration role from inspected observations. Do not infer identity or claim to have seen pixels.", {context: "Scene or contextual illustration", detail: "Service/activity detail", atmosphere: "Decorative texture or atmosphere", unknown: "Insufficient observations"}),
            industry: choice("Classify relevance from observations, not filenames. Unknown is valid.", {trades: "Construction or home services", professional: "Professional/office services", hospitality: "Food, retail or hospitality", other: "Other industry or general use", unknown: "Insufficient observations"})}});
          record.receipts.push(r.receiptPath); classifications.push({id: asset.id, answers: r.result.answers});
        }
        record.result = classifications; record.state = classifications.length ? "observed" : "no_candidates";
      } else {
        const r = await opts.client.evaluate({taskType: "custom", nodeId: opts.stage, signal: opts.signal, state: {policy: MEDIA_POLICY, task: spec.id, context, assets: inventory.assets, selection}, questions: {
          judgment: choice(spec.id === "media-set-review" ? "Assess the proposed set for meaningful variety, coherent treatment, unnecessary repetition and omitted useful customer originals. Text observations only." : "Check whether wording and placements misuse stock as customer identity/proof or omit evidenced brand/founder/product assets without explanation. Source uncertainty is not verification.", {fits: "No supported issue in supplied evidence", issue: "A specific mismatch or omission is supported", unknown: "Insufficient evidence to assess"})}});
        record.receipts.push(r.receiptPath); record.result = r.result.answers; record.state = "observed";
      }
    } catch (error) { record.reason = String(error); }
    results.push(record);
    if (mode === "assist") notes.push(`${spec.id}: ${record.state}. ${JSON.stringify(record.result || record.reason)} (advisory; agent retains selection and visual checks)`);
  }
  if (results.length || stock.length) save(join(root, "agent/runs", `${opts.preparationId}.media-assist.json`), {version: 1, preparationId: opts.preparationId, policy: MEDIA_POLICY, subjectHash, results, stockCandidates: stock.map(i=>({id:i.id, sha256:i.sha256}))});
  return notes.length ? `## Media selection\n${notes.join("\n")}\nUse the media skill for identity evidence, imports, selection records, and responsive inspection.` : "";
}
