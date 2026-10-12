import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { json, save, sha256, type Storyboard } from "./artifacts.ts";
import { invalidate } from "./graph.ts";
import { loadState } from "./runner.ts";
import { parseGraphYaml } from "./graph.ts";
import { applyArtDirectionGraph } from "./art-direction-policy.ts";
import { copyAllowlist, copyTree, scaffoldNestedSite } from "./design-copy.ts";
import { evaluateV2 } from "./evaluate.ts";
import type { DesignFeedback, FeedbackChoice, FeedbackInterpretation } from "./design-feedback.ts";
import type { ComparisonManifest } from "./design-comparison.ts";

export type SynthesisPlan = {
  schemaVersion: 1;
  revision: string;
  runId: string;
  feedbackId: string;
  feedbackHash: string;
  comparisonHash: string;
  baseCandidateId: string;
  themeCandidateId: string;
  tokens: { source: string; exceptions: string[] };
  routes: { path: string; sections: { id: string; source?: { candidateId: string; sectionId: string }; facets: string[]; preserve: string[]; adaptation: string; facts: string[]; media: string[]; behavior?: string; acceptance: string }[] }[];
  conflicts: string[];
  assumptions: string[];
  dependencies: string[];
  verification: string[];
};

export function buildSynthesisPlan(opts: {
  runId: string;
  revision: string;
  feedback: DesignFeedback;
  interpretation: FeedbackInterpretation;
  comparison: ComparisonManifest;
  baseStoryboard: Storyboard;
}): SynthesisPlan {
  const { feedback, interpretation, comparison, baseStoryboard } = opts;
  const routes = (baseStoryboard.pages || []).map(page => ({
    path: page.path,
    sections: page.sections.map(section => {
      const choice = interpretation.choices.find(c => c.target?.route === page.path && c.target.sectionId === section.id);
      return {
        id: section.id,
        source: choice?.source ? { candidateId: choice.source.candidateId, sectionId: choice.source.sectionId } : undefined,
        facets: choice?.facets || [],
        preserve: choice?.preserve || ["target-copy", "target-actions"].filter(() => !choice || !choice.facets.includes("copy")),
        adaptation: choice?.adaptation || "translate-to-base-theme",
        facts: section.facts || [],
        media: section.media || [],
        behavior: section.action?.behavior,
        acceptance: acceptanceFor(choice, section.id),
      };
    }),
  }));
  for (const choice of interpretation.choices.filter(c => c.operation === "insert" && c.target)) {
    const page = routes.find(r => r.path === choice.target!.route);
    if (page && choice.source) {
      page.sections.push({
        id: choice.source.sectionId,
        source: { candidateId: choice.source.candidateId, sectionId: choice.source.sectionId },
        facets: choice.facets,
        preserve: choice.preserve || [],
        adaptation: choice.adaptation || "translate-to-base-theme",
        facts: [],
        media: [],
        behavior: undefined,
        acceptance: acceptanceFor(choice, choice.source.sectionId),
      });
    }
  }
  return {
    schemaVersion: 1,
    revision: opts.revision,
    runId: opts.runId,
    feedbackId: feedback.feedbackId,
    feedbackHash: sha256(JSON.stringify(feedback)),
    comparisonHash: comparison.hash,
    baseCandidateId: interpretation.baseCandidateId,
    themeCandidateId: interpretation.themeCandidateId,
    tokens: { source: interpretation.themeCandidateId, exceptions: interpretation.choices.filter(c => c.styleException).map(c => c.styleException!) },
    routes,
    conflicts: interpretation.unresolved.map(u => u.question),
    assumptions: interpretation.assumptions,
    dependencies: ["storyboard", "copy", "pages", "browser"],
    verification: ["representative-quality", "browser", "visual-review", "content-review", "feedback-fulfillment"],
  };
}

function acceptanceFor(choice: FeedbackChoice | undefined, sectionId: string): string {
  if (!choice) return `Keep existing ${sectionId} unless a later must-have requires change.`;
  return `${choice.operation} ${sectionId} using ${choice.facets.join(", ")} from ${choice.source?.candidateId || "base"}; preserve ${choice.preserve?.join(", ") || "unselected facets"}.`;
}

export function validateSynthesisPlan(plan: SynthesisPlan): string[] {
  const errors: string[] = [];
  if (plan.schemaVersion !== 1) errors.push("Unsupported synthesis plan schema");
  if (!plan.baseCandidateId || !plan.themeCandidateId) errors.push("Synthesis plan needs base and theme candidate IDs");
  if (plan.conflicts.length) errors.push("Synthesis plan still has unresolved conflicts");
  if (!plan.routes.some(r => r.path === "/")) errors.push("Synthesis plan missing homepage");
  if (/copy-stylesheet|wholesale|paste-css/i.test(JSON.stringify(plan))) errors.push("Synthesis must translate donor elements into the base theme without wholesale incompatible CSS");
  const adaptations = plan.routes.flatMap(r => r.sections.map(s => s.adaptation || ""));
  if (adaptations.some(a => /copy-stylesheet|wholesale|paste-css/i.test(a))) errors.push("Donor CSS cannot be pasted wholesale into the base theme");
  return errors;
}

const SYNTHESIS_SOURCE_PATHS = ["pages", "components", "theme", "site.json", "media", "artwork", "public", "onboarding", "agent/adapter.json", "agent/request.json", "agent/graph.yaml", "agent/PROMPT.md", "agent/refs"];

export function createSynthesisRoot(opts: {
  dest: string;
  kernel: string;
  parent: string;
  baseRoot: string;
  slug: string;
  name: string;
  assignedDirectionPath?: string;
  plan: SynthesisPlan;
}): void {
  scaffoldNestedSite({ dest: opts.dest, kernel: opts.kernel, slug: opts.slug, name: opts.name, parent: opts.parent });
  copyAllowlist(opts.baseRoot, opts.dest, SYNTHESIS_SOURCE_PATHS.filter(p => p !== "agent/refs" && p !== "agent/graph.yaml" && p !== "agent/PROMPT.md"));
  if (opts.assignedDirectionPath && existsSync(opts.assignedDirectionPath)) {
    copyTree(opts.assignedDirectionPath, join(opts.dest, "agent/assigned-direction.json"));
  }
  save(join(opts.dest, "onboarding/synthesis-plan.json"), opts.plan);
  const sitePath = join(opts.dest, "site.json");
  if (existsSync(sitePath)) {
    const site = json<Record<string, unknown>>(sitePath);
    site.designRun = { runId: opts.plan.runId, candidateId: `synthesis-${opts.plan.revision}` };
    save(sitePath, site);
  }
  const graph = applyArtDirectionGraph(opts.dest,parseGraphYaml(readFileSync(join(opts.dest, "agent/graph.yaml"), "utf8")));
  const state = loadState(opts.dest, graph);
  if (existsSync(join(opts.baseRoot, "agent/STATE.json"))) {
    const prior = json<typeof state>(join(opts.baseRoot, "agent/STATE.json"));
    state.nodes = prior.nodes;
    state.iteration = prior.iteration;
  }
  invalidate(graph, state, "storyboard");
  for (const st of Object.values(state.nodes)) if (st.status === "pending") st.attempts = 0;
  save(join(opts.dest, "agent/STATE.json"), state);
}

export type FulfillmentReport = {
  version: 2;
  subjectHash: string;
  verdict: "pass" | "fail" | "unknown";
  reviewer: string;
  evidence: string[];
  choices: { id: string; priority: string; status: "fulfilled" | "partial" | "unfulfilled"; route?: string; sectionId?: string; evidence: string; note: string }[];
};

export function gradeFulfillment(report: FulfillmentReport, mustHaveIds: string[]): string[] {
  const errors: string[] = [];
  if (report.version !== 2 || report.verdict !== "pass") errors.push(`Fulfillment verdict: ${report.verdict}`);
  for (const id of mustHaveIds) {
    const row = report.choices.find(c => c.id === id);
    if (!row) errors.push(`Missing fulfillment row for must-have ${id}`);
    else if (row.status === "unfulfilled") errors.push(`Unfulfilled must-have: ${id}`);
  }
  return errors;
}

export function promotionAllowlist(): string[] {
  return ["pages", "components", "theme", "site.json", "media", "artwork", "public", "onboarding/media-inventory.json", "onboarding/visual-asset-brief.json", "onboarding/asset-production.json", "onboarding/asset-operations", "onboarding/direction.json", "onboarding/storyboard.json", "onboarding/copy-plan.json", "onboarding/studies", "dist"];
}

export function synthesisAcceptanceFailures(siteDest: string): string[] {
  const errors: string[] = [];
  for (const node of ["representative-quality", "browser", "visual-review", "content-review", "feedback-fulfillment"] as const) {
    errors.push(...evaluateV2(siteDest, node).failures.map(f => `${node}: ${f}`));
  }
  if (existsSync(join(siteDest, "onboarding/synthesis-plan.json"))) {
    errors.push(...validateSynthesisPlan(json<SynthesisPlan>(join(siteDest, "onboarding/synthesis-plan.json"))));
  }
  return errors;
}
