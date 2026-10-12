import { applyProductionQualityGraph } from "./production-quality.ts";
import { applyTemplateAdaptationGraph } from './template-adaptation.ts';
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { SkillGraph } from "./graph.ts";

export const ART_DIRECTION_RELEASE = "2026-10-05.1";
export function artDirectionPolicy(root: string) {
  const launch = existsSync(join(root, "launch.json")) ? JSON.parse(readFileSync(join(root, "launch.json"), "utf8")) : {};
  if (launch.artDirection === undefined) return undefined;
  const raw = launch.artDirection;
  if (!raw || raw.mode !== "media-v1" || raw.release !== ART_DIRECTION_RELEASE) throw new Error("Unsupported artDirection policy; use media-v1 / " + ART_DIRECTION_RELEASE);
  return { mode: "media-v1", release: ART_DIRECTION_RELEASE, hash: createHash("sha256").update(JSON.stringify(raw)).digest("hex") };
}

/** A temporal ownership transfer: early audit is sealed once production starts. No creative node gains inventory writes. */
export function applyArtDirectionGraph(root: string, graph: SkillGraph): SkillGraph {
  applyTemplateAdaptationGraph(root,graph);
  applyProductionQualityGraph(root, graph);
  if (!artDirectionPolicy(root)) return graph;
  // Preparation and completion can load separate graph objects. Keep stage
  // inputs in the effective graph rather than only in a prepared packet.
  for (const n of graph.nodes) if (n.id !== "harvest") n.optionalInputs = [...new Set([...(n.optionalInputs || []), "launch.json", ...(["business", "business-review"].includes(n.id) ? [] : ["onboarding/visual-asset-brief.json", "onboarding/asset-production.json"])])];
  if (graph.nodes.some(n => n.id === "asset-production")) return graph;
  const at = graph.nodes.findIndex(n => n.id === "storyboard");
  if (at < 0 || !graph.nodes.some(n => n.id === "direction-review")) throw new Error("Art direction needs the direction-review/storyboard stage contracts");
  graph.nodes.splice(at, 0, { id: "asset-production", needs: ["direction-review"], kind: "agent", eval: "asset-production", tools: [], refs: ["art-direction", "media", "contracts"], maxAttempts: 3,
    inputs: ["onboarding/business.json", "onboarding/direction.json", "onboarding/media-inventory.json", "onboarding/reference-analysis.json"],
    optionalInputs: ["onboarding/media-requests.json", "agent/assigned-direction.json", "onboarding/synthesis-plan.json", "launch.json", "onboarding/visual-asset-brief.json", "onboarding/asset-production.json"],
    writes: ["onboarding/visual-asset-brief.json", "onboarding/asset-production.json", "onboarding/media-inventory.json", "media/generated", "media/derived", "media/stock", "artwork", "onboarding/asset-operations"] });
  graph.nodes.find(n => n.id === "storyboard")!.needs = ["asset-production"];
  for (const n of graph.nodes) {
    if (["media", "narrative", "narrative-review", "reference-analysis", "direction", "direction-review"].includes(n.id)) n.historicalAfter ||= "asset-production";
    if (["storyboard", "copy", "representative", "pages", "visual-review", "representative-quality"].includes(n.id)) n.optionalInputs = [...new Set([...(n.optionalInputs || []), "onboarding/visual-asset-brief.json", "onboarding/asset-production.json"])];
  }
  return applyProductionQualityGraph(root, graph);
}
