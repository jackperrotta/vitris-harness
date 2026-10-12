import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fingerprint, json, within, type Storyboard } from "./artifacts.ts";
import { resolveDesignAuthoring } from "./composition-authoring.ts";
import { loadCompositionPack } from "../knowledge/composition.ts";

export type AuthoringDecision = {
  id: string; route: string; sectionIds: string[]; elementIds: string[]; intent: string;
  lessonRefs: { id: string; version: number; contentHash: string }[];
  alternatives?: { description: string; tradeoff: string }[];
  chosenApproach: string; implementationPaths: string[];
  reuse: { kind: "site-component" | "kernel-behavior" | "block"; source: string; sourceHash?: string; adaptation: string }[];
  inspectedExamples: { id: string; sourceHash: string; captureHash: string }[];
  observationIds: string[];
};
export type AuthoringDecisions = { schemaVersion: 1; authoringPolicy: { mode: "composition-v1"; lessonRelease: string; hash: string }; storyboardHash: string; preparationId: string; records: AuthoringDecision[] };
const present = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export function validateAuthoringDecisions(root: string, story: Storyboard): string[] {
  const policy = resolveDesignAuthoring(root);
  if (policy.mode !== "composition-v1") return [];
  const path = join(root, "agent/decisions/authoring-decisions.json");
  if (!existsSync(path)) return ["Composition authoring decisions are missing"];
  const file = json<AuthoringDecisions>(path);
  const errors: string[] = [];
  if (file.schemaVersion !== 1 || file.authoringPolicy?.mode !== policy.mode || file.authoringPolicy.hash !== policy.hash || file.authoringPolicy.lessonRelease !== policy.lessonRelease) errors.push("Authoring decisions policy is stale");
  if (file.storyboardHash !== fingerprint(root, ["onboarding/storyboard.json"])) errors.push("Authoring decisions storyboard binding is stale");
  if (!present(file.preparationId) || !Array.isArray(file.records)) errors.push("Authoring decisions need preparationId and records");
  const pack = loadCompositionPack(root, policy.lessonRelease);
  const lessons = new Map(pack.lessons.map(item => [item.id,item]));
  const examples = new Map(pack.examples.map(item => [item.id,item]));
  const ids = new Set<string>();
  for (const decision of file.records || []) {
    if (!present(decision.id) || ids.has(decision.id)) errors.push(`Duplicate or missing authoring decision id ${decision.id}`);
    ids.add(decision.id);
    const page = story.pages.find(item => item.path === decision.route);
    const sections = new Set(page?.sections.map(item => item.id));
    const elements = new Set(page?.sections.flatMap(item => item.elementPlan?.map(element => element.id) || []));
    const observations = new Set(page?.sections.flatMap(item => item.renderObservations?.map(observation => observation.id) || []));
    if (!page || !decision.sectionIds?.every(id => sections.has(id)) || !decision.elementIds?.every(id => elements.has(id)) || !decision.observationIds?.every(id => observations.has(id))) errors.push(`Authoring decision ${decision.id} has unknown route, section, element, or observation`);
    if (!present(decision.intent) || !present(decision.chosenApproach) || !Array.isArray(decision.implementationPaths) || !Array.isArray(decision.reuse) || !Array.isArray(decision.inspectedExamples)) errors.push(`Authoring decision ${decision.id} is incomplete`);
    for (const ref of decision.lessonRefs || []) {
      const lesson = lessons.get(ref.id);
      if (!lesson || lesson.version !== ref.version || lesson.contentHash !== ref.contentHash) errors.push(`Authoring decision ${decision.id} cites stale lesson ${ref.id}`);
    }
    for (const exampleRef of decision.inspectedExamples || []) {
      const example = examples.get(exampleRef.id);
      if (!example || example.inspectionStatus !== "inspected" || example.sourceHash !== exampleRef.sourceHash || !example.captureHandles.includes(exampleRef.captureHash)) errors.push(`Authoring decision ${decision.id} claims unverified example inspection ${exampleRef.id}`);
    }
    for (const implementation of decision.implementationPaths || []) {
      try { if (!existsSync(within(root, implementation))) errors.push(`Authoring implementation path missing: ${implementation}`); }
      catch { errors.push(`Authoring implementation path escapes site: ${implementation}`); }
    }
    for (const reuse of decision.reuse || []) {
      if (!present(reuse.source) || !present(reuse.adaptation) || !["site-component","kernel-behavior","block"].includes(reuse.kind)) errors.push(`Invalid reuse record in ${decision.id}`);
      if (reuse.kind === "site-component" && reuse.sourceHash) {
        try { if (sha(readFileSync(within(root,reuse.source))) !== reuse.sourceHash) errors.push(`Site component reuse hash drifted in ${decision.id}`); }
        catch { errors.push(`Site component reuse source unavailable in ${decision.id}`); }
      }
    }
  }
  return errors;
}
