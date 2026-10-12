import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCompositionPack, type CompositionLesson, type CompositionPack } from "../knowledge/composition.ts";
import { resolveDesignAuthoring } from "./composition-authoring.ts";
import type { MediaInventory, NarrativeBrief, Storyboard } from "./artifacts.ts";

export const COMPOSITION_SELECTOR_VERSION = "composition-selector-1";
export type CompositionSignal = { id: string; state: "known" | "unknown" | "absent"; origin: string };
export type CompositionSelection = {
  schemaVersion: 1; selectorVersion: string; stage: string; page: string | null;
  policyHash: string; manifestHash: string; inputSignalHash: string;
  signals: CompositionSignal[];
  eligible: { id: string; score: number; reasons: string[] }[];
  excluded: { id: string; reason: string }[];
  selected: { id: string; version: number; contentHash: string; bodyHash: string; summary: string; expansionHandle: string; reason: string }[];
  alternatives: { id: string; summary: string; expansionHandle: string }[];
  ties: { score: number; ids: string[] }[];
};
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const read = <T>(root: string, path: string): T | undefined => {
  const file = join(root, path);
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as T;
};

/** A missing field stays unknown. We only assert absent media after an inspected inventory exists. */
export function compositionSignalsFromSite(root: string, page?: string): CompositionSignal[] {
  const narrative = read<NarrativeBrief>(root, "onboarding/narrative-brief.json");
  const media = read<MediaInventory>(root, "onboarding/media-inventory.json");
  const story = read<Storyboard>(root, "onboarding/storyboard.json");
  const direction = read<{ centralIdea?: string }>(root, "onboarding/direction.json");
  const planned = page ? story?.pages.find(item => item.path === page) : undefined;
  const texts: { text: string; origin: string }[] = [
    ...(narrative?.visitorQuestions || []).map(item => ({ text: item.question, origin: `narrative:visitor-question:${item.id}` })),
    ...(narrative?.designOpportunities || []).map(item => ({ text: `${item.visitorNeed} ${item.presentationOpportunity}`, origin: `narrative:opportunity:${item.id}` })),
    ...(planned?.sections || []).map(item => ({ text: `${item.question} ${item.purpose} ${item.message}`, origin: `storyboard:${page}#${item.id}` })),
    ...(direction?.centralIdea ? [{ text: direction.centralIdea, origin: "direction:centralIdea" }] : []),
  ];
  const patterns: Record<string, RegExp> = {
    "business-relationship": /work|service|process|result|outcome|detail/i,
    "content-group": /group|related|detail|scope|caption|project|service/i,
    priority: /urgent|important|primary|first|priority|main/i,
    alignment: /compare|column|measure|specification|metadata/i,
    "page-sequence": /process|sequence|journey|step|next|before|after/i,
    "type-content": /explain|read|story|statement|editorial|guide/i,
    "real-copy": /explain|detail|qualify|describe|scope|information/i,
    "approved-image": /image|photo|project|product|visual/i,
    "multiple-images": /sequence|gallery|portfolio|before and after/i,
    proof: /evidence|proof|credential|case|review|testimonial|result/i,
    collection: /services|projects|options|catalog|list|directory/i,
    comparison: /compare|choose|which|versus|difference|options/i,
    process: /process|step|prepare|how it works|responsib/i,
    "sparse-media": /text|document|checklist|scope|ledger/i,
    routes: /navigation|find|route|browse|pages/i,
    action: /contact|inquire|book|call|visit|estimate|quote/i,
    "local-facts": /address|hours|directions|parking|visit|location|service area/i,
    identity: /identity|brand|motif|material|character/i,
    responsive: /mobile|narrow|responsive|reflow/i,
    "optional-detail": /details|optional|expand|technical|specifications/i,
    "state-change": /motion|transition|animation|change|progress/i,
    "interaction-model": /interact|select|filter|slider|compare/i,
    "uncertain-choice": /alternative|uncertain|direction|choose/i,
  };
  const signals: CompositionSignal[] = Object.entries(patterns).map(([id, pattern]) => {
    const match = texts.find(item => pattern.test(item.text));
    return { id, state: match ? "known" as const : "unknown" as const, origin: match?.origin || "not-established" };
  });
  if (media) {
    const usable = media.assets.filter(item => item.inspected && item.disposition === "use");
    const images = usable.filter(item => item.kind !== "video");
    const set = (id: string, state: CompositionSignal["state"]) => {
      const index = signals.findIndex(item => item.id === id);
      signals[index] = { id, state, origin: "onboarding/media-inventory.json:inspected-use" };
    };
    set("approved-image", images.length ? "known" : "absent");
    set("multiple-images", images.length >= 2 ? "known" : "absent");
    set("sparse-media", images.length <= 1 ? "known" : "absent");
  }
  if (story) {
    const paths = story.pages.map(item => item.path);
    signals[signals.findIndex(item => item.id === "routes")] = { id: "routes", state: paths.length > 1 ? "known" : "absent", origin: "onboarding/storyboard.json:pages" };
  }
  return signals;
}

export function selectCompositionLessons(input: { pack: CompositionPack; stage: string; page?: string; signals: CompositionSignal[]; policyHash: string; limit?: number }): CompositionSelection {
  const known = new Set(input.signals.filter(item => item.state === "known").map(item => item.id));
  const absent = new Set(input.signals.filter(item => item.state === "absent").map(item => item.id));
  const eligible: CompositionSelection["eligible"] = [], excluded: CompositionSelection["excluded"] = [];
  for (const lesson of input.pack.lessons) {
    if (!lesson.stages.includes(input.stage)) { excluded.push({ id: lesson.id, reason: "stage" }); continue; }
    const impossible = lesson.evidenceNeeds.find(item => item.mandatory && item.kind === "media" && absent.has("approved-image"));
    if (impossible) { excluded.push({ id: lesson.id, reason: "required approved media absent" }); continue; }
    const hits = lesson.applicability.positiveSignals.filter(item => known.has(item));
    if (!hits.length) { excluded.push({ id: lesson.id, reason: "no established positive signal; available for discovery" }); continue; }
    eligible.push({ id: lesson.id, score: hits.reduce((total, item) => total + 2 + (input.page && input.signals.find(signal => signal.id === item)?.origin.startsWith(`storyboard:${input.page}#`) ? 3 : 0), 0), reasons: hits.map(item => `${item}: ${input.signals.find(signal => signal.id === item)?.origin}`) });
  }
  eligible.sort((a,b) => b.score - a.score || a.id.localeCompare(b.id));
  const chosen: CompositionLesson[] = [], seenGroups = new Set<string>();
  for (const candidate of eligible) {
    const lesson = input.pack.lessons.find(item => item.id === candidate.id)!;
    if (chosen.length >= (input.limit ?? 4)) break;
    if (seenGroups.has(lesson.relationshipGroup) && eligible.some(other => other.score === candidate.score && !seenGroups.has(input.pack.lessons.find(item => item.id === other.id)!.relationshipGroup))) continue;
    chosen.push(lesson); seenGroups.add(lesson.relationshipGroup);
  }
  const ties = [...new Set(eligible.map(item => item.score))].map(score => ({ score, ids: eligible.filter(item => item.score === score).map(item => item.id) })).filter(item => item.ids.length > 1);
  return {
    schemaVersion: 1, selectorVersion: COMPOSITION_SELECTOR_VERSION, stage: input.stage, page: input.page || null,
    policyHash: input.policyHash, manifestHash: input.pack.manifestHash, inputSignalHash: sha(JSON.stringify(input.signals)), signals: input.signals,
    eligible, excluded,
    selected: chosen.map(item => ({ id: item.id, version: item.version, contentHash: item.contentHash, bodyHash: item.contentHash, summary: item.summary, expansionHandle: `composition:${item.id}@${item.version}`, reason: eligible.find(candidate => candidate.id === item.id)!.reasons.join("; ") })),
    alternatives: eligible.filter(item => !chosen.some(lesson => lesson.id === item.id)).map(item => { const lesson = input.pack.lessons.find(entry => entry.id === item.id)!; return { id: lesson.id, summary: lesson.summary, expansionHandle: `composition:${lesson.id}@${lesson.version}` }; }),
    ties,
  };
}

export function compositionContextForStage(root: string, stage: string, page?: string, limit?: number) {
  const policy = resolveDesignAuthoring(root);
  if (policy.mode !== "composition-v1") return undefined;
  const pack = loadCompositionPack(root, policy.lessonRelease);
  const receipt = selectCompositionLessons({ pack, stage, page, signals: compositionSignalsFromSite(root, page), policyHash: policy.hash, limit });
  return { policy, pack, receipt };
}
