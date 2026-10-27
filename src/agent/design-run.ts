import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { json, save, sha256, sourceHash, fingerprint, within, files, type Storyboard } from "./artifacts.ts";
import { type AgentState, type GraphNode } from "./graph.ts";
import { findActivePreparation, loadPreparation, type StagePreparation } from "./preparation.ts";
import { prepareStage, completeStage, cancelStage } from "./lifecycle.ts";
import { DEFAULT_JEV_CONFIG } from "./jev/config.ts";
import { acquire, loadState } from "./runner.ts";
import { sketchesAreNotRepresentatives, validateQualityReview, writeVisualProbe, QUALITY_REPAIR_ATTEMPTS, QUALITY_PROBE_REL } from "./design-quality.ts";
import { calibrationPackHash, CALIBRATION_PACK_VERSION, resolveKernelRoot } from "./design-calibration.ts";
import { buildPublicComparisonBundle, type PublicBundleResult } from "./design-bundle.ts";
import { freezeSharedEvidence, importSharedEvidence, importQualifiedRepresentative, kernelContractHash, scaffoldNestedSite, copyAllowlist, copyTree, QUALIFIED_REPRESENTATIVE_PATHS, sharedEvidenceReceiptStatus } from "./design-copy.ts";
import { loadSiteGraph, loadAdapter, runWorkflow, sharedTrunkComplete, invokeAdapter, argFrom, childWorkflowArgv, hasFlag } from "./workflow.ts";
import { renderStudySources } from "./study-render.ts";
import { loadComparison, loadSectionIndexes, snapshotCandidates } from "./design-comparison.ts";
import { feedbackPayloadHash, loadFeedback, parseDesignFeedback, saveFeedback, summarizeFeedback, validateDesignFeedback, writeInterpretation, type DesignFeedback, type FeedbackInterpretation } from "./design-feedback.ts";
import { buildSynthesisPlan, createSynthesisRoot, promotionAllowlist, synthesisAcceptanceFailures, validateSynthesisPlan } from "./design-synthesis.ts";
import { ensurePreview } from "./preview.ts";
import { evaluateV2, evaluateParentStudyRender, validateParentDiversityReview, parentDiversityIdentities, parentDiversityReviewSubject, parentDiversitySourceSubject, PARENT_DIVERSITY_AXES } from "./evaluate.ts";

export const DESIGN_RUN_STATUSES = [
  "preparing", "planning", "qualifying", "generating", "reviewing", "awaiting_design_feedback",
  "interpreting_feedback", "needs_clarification", "synthesizing", "verifying",
  "final_preview_ready", "concept_preview_ready", "rejected", "blocked",
] as const;
export type DesignRunStatus = (typeof DESIGN_RUN_STATUSES)[number];
export const CANDIDATE_LIFECYCLE = [
  "pending", "sketch", "representative_review", "qualified", "generating", "complete", "rejected", "blocked",
] as const;
export type CandidateLifecycle = (typeof CANDIDATE_LIFECYCLE)[number];
export const VARIANT_COUNT = 5;
export const CANDIDATE_IDS = ["candidate-a", "candidate-b", "candidate-c", "candidate-d", "candidate-e"] as const;
export const CANDIDATE_LABELS = ["A", "B", "C", "D", "E"] as const;

class PendingDesignStage extends Error {
  readonly stage: string;
  readonly workRoot: string;
  constructor(stage: string, workRoot: string) {
    super(`Active agent work pending for ${stage} in ${workRoot}`);
    this.stage = stage;
    this.workRoot = workRoot;
  }
}

function pendingActiveStage(root: string, state: AgentState): string | undefined {
  const current = join(root, "agent/CURRENT.md");
  if (!existsSync(current)) return undefined;
  const node = readFileSync(current, "utf8").match(/^# ACTIVE STAGE: ([^\s(]+)/m)?.[1];
  return node && state.nodes[node]?.status !== "done" ? node : undefined;
}

export type VariantBrief = {
  id: string;
  concept: string;
  centralIdea: string;
  visitorExperience: string;
  hierarchy: string;
  visualExpression: string;
  evidenceIds: string[];
  visualSystem: string;
  rationale: string;
  audienceFit: string;
  typography: string;
  colorRoles: string;
  density: string;
  rhythm: string;
  mediaTreatment: string;
  navigation: string;
  surfaces: string;
  motifs: string;
  motionPolicy: string;
  interiors: string;
  heroComposition: string;
  proofStructure: string;
  serviceWorkTreatment: string;
  sharedConstraints: string;
  differences: string;
  sourceAssetIds: string[];
  identityCautions: string[];
  omissions: string[];
  themeCentered?: boolean;
};
export type VariantDirectionSet = {
  schemaVersion: 1 | 2;
  runId: string;
  theme?: string;
  themeScope?: "one" | "all";
  directions: VariantBrief[];
};
export type CandidateQualityBudget = {
  repairs: number;
  used: number;
  attempts: { at: string; reason: string; verdict?: string }[];
};
export type CandidateRecord = {
  id: string;
  label: string;
  root: string;
  directionId: string;
  status: string;
  previewReady: boolean;
  sourceHash?: string;
  buildHash?: string;
  error?: string;
  quality?: CandidateQualityBudget;
};
export type DesignRunManifest = {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  status: DesignRunStatus;
  sharedInputHash: string;
  kernelContractHash: string;
  operatorRequestId: string | null;
  budgets: { planningRepairs: number; planningRepairsUsed: number; max: number; timeoutMs: number };
  mode: { conceptPreview: boolean; requestedVariants: number; themeScope?: "one" | "all" };
  candidateIds: string[];
  candidates: CandidateRecord[];
  directionIds: string[];
  activeComparisonRevision: string | null;
  feedbackHead: string | null;
  lastIdempotencyKey?: string;
  lastPayloadHash?: string;
  synthesisHead: string | null;
  errors: string[];
};

export type DesignEvent = { at: string; runId: string; type: string; from?: string; to?: string; candidateId?: string; detail?: string };

export function designRunsRoot(parent: string): string {
  return join(parent, "agent/design-runs");
}
export function runDir(parent: string, runId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) throw new Error("Invalid design-run id");
  return within(parent, `agent/design-runs/${runId}`);
}
export function currentRunId(parent: string): string | undefined {
  const path = join(designRunsRoot(parent), "CURRENT.json");
  return existsSync(path) ? json<{ runId: string }>(path).runId : undefined;
}
function wrapMode(mode?: DesignRunManifest["mode"]): DesignRunManifest["mode"] {
  const next: DesignRunManifest["mode"] = {
    conceptPreview: Boolean(mode?.conceptPreview),
    requestedVariants: mode?.requestedVariants || VARIANT_COUNT,
  };
  if (mode?.themeScope === "one" || mode?.themeScope === "all") next.themeScope = mode.themeScope;
  return next;
}
export function loadManifest(parent: string, runId: string): DesignRunManifest {
  const manifest = json<DesignRunManifest>(join(runDir(parent, runId), "manifest.json"));
  manifest.mode = wrapMode(manifest.mode);
  return manifest;
}
export function saveManifest(parent: string, manifest: DesignRunManifest): void {
  manifest.mode = wrapMode(manifest.mode);
  save(join(runDir(parent, manifest.runId), "manifest.json"), manifest);
  save(join(designRunsRoot(parent), "CURRENT.json"), { runId: manifest.runId });
}
export function appendEvent(parent: string, event: Omit<DesignEvent, "at">): void {
  const line = JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n";
  appendFileSync(join(runDir(parent, event.runId), "events.jsonl"), line);
}
export function createDesignRun(parent: string, kernel: string, opts?: { theme?: string; themeScope?: "one" | "all"; conceptPreview?: boolean; max?: number; timeoutMs?: number }): DesignRunManifest {
  const runId = `run-${Date.now()}`;
  const dest = runDir(parent, runId);
  mkdirSync(dest, { recursive: true });
  mkdirSync(join(dest, "candidates"), { recursive: true });
  mkdirSync(join(dest, "feedback"), { recursive: true });
  mkdirSync(join(dest, "interpretations"), { recursive: true });
  mkdirSync(join(dest, "comparison"), { recursive: true });
  mkdirSync(join(dest, "synthesis"), { recursive: true });
  mkdirSync(join(dest, "studies"), { recursive: true });
  const theme = opts?.theme || (existsSync(join(parent, "agent/request.json")) ? json<{ theme?: string }>(join(parent, "agent/request.json")).theme : undefined);
  const themeScope = opts?.themeScope || (theme ? "one" : undefined);
  if (theme) {
    save(join(dest, "operator-request.json"), { mode: "build", theme, themeScope: themeScope || "one", themeScopeSource: opts?.themeScope ? "explicit" : "default" });
    const parentHasSite = existsSync(join(parent, "pages")) || existsSync(join(parent, "onboarding/direction.json"));
    if (!parentHasSite) save(join(parent, "agent/request.json"), { mode: "build", theme });
  }
  const manifest: DesignRunManifest = {
    schemaVersion: 1,
    runId,
    createdAt: new Date().toISOString(),
    status: "preparing",
    sharedInputHash: "",
    kernelContractHash: kernelContractHash(kernel),
    operatorRequestId: theme ? sha256(theme) : null,
    budgets: { planningRepairs: 2, planningRepairsUsed: 0, max: opts?.max || 40, timeoutMs: opts?.timeoutMs || 1_200_000 },
    mode: { conceptPreview: !!opts?.conceptPreview, requestedVariants: VARIANT_COUNT, themeScope },
    candidateIds: [...CANDIDATE_IDS],
    candidates: CANDIDATE_IDS.map((id, i) => ({
      id, label: CANDIDATE_LABELS[i]!, root: relative(parent, join(dest, "candidates", id)).replaceAll("\\", "/"),
      directionId: "", status: "pending", previewReady: false,
      quality: { repairs: QUALITY_REPAIR_ATTEMPTS, used: 0, attempts: [] },
    })),
    directionIds: [],
    activeComparisonRevision: null,
    feedbackHead: null,
    synthesisHead: null,
    errors: [],
  };
  saveManifest(parent, manifest);
  appendEvent(parent, { runId, type: "created", to: "preparing", detail: theme || "" });
  return manifest;
}

export function transition(parent: string, manifest: DesignRunManifest, status: DesignRunStatus, detail?: string): void {
  const from = manifest.status;
  manifest.status = status;
  saveManifest(parent, manifest);
  appendEvent(parent, { runId: manifest.runId, type: "status", from, to: status, detail });
}

export function validateVariantSet(set: VariantDirectionSet, runId: string, opts?: { theme?: string; themeScope?: "one" | "all" }): string[] {
  const errors: string[] = [];
  if (![1, 2].includes(set.schemaVersion) || set.runId !== runId) errors.push("Direction set schema/run mismatch");
  if (set.directions.length !== VARIANT_COUNT) errors.push(`Exactly ${VARIANT_COUNT} direction briefs are required`);
  const ids = new Set(set.directions.map(d => d.id));
  if (ids.size !== VARIANT_COUNT) errors.push("Direction brief IDs must be unique");
  const keys: (keyof VariantBrief)[] = ["id", "concept", "centralIdea", "visitorExperience", "hierarchy", "visualExpression", "visualSystem", "rationale", "audienceFit", "typography", "colorRoles", "density", "rhythm", "mediaTreatment", "navigation", "surfaces", "motifs", "motionPolicy", "interiors", "heroComposition", "proofStructure", "serviceWorkTreatment", "sharedConstraints", "differences"];
  for (const brief of set.directions) {
    for (const key of keys) if (!String(brief[key] || "").trim()) errors.push(`Direction ${brief.id} missing ${key}`);
    if (!brief.evidenceIds?.length) errors.push(`Direction ${brief.id} needs evidenceIds supporting the business idea`);
  }
  const ideas = set.directions.map(d => d.centralIdea.trim().toLowerCase());
  if (new Set(ideas).size !== ideas.length) errors.push("Each brief needs a distinct evidenced business idea (centralIdea); style buckets are not a substitute");
  const theme = opts?.theme || set.theme;
  const themeScope = opts?.themeScope || set.themeScope;
  if (theme && themeScope === "one") {
    const centered = set.directions.filter(d => d.themeCentered);
    if (centered.length !== 1) errors.push("themeScope=one requires exactly one theme-centered brief");
  }
  if (theme && themeScope === "all") {
    if (set.directions.some(d => d.themeCentered === false)) errors.push("themeScope=all applies the operator theme to every brief");
  }
  return errors;
}

function readDirectionSet(parent: string, runId: string): VariantDirectionSet | undefined {
  const path = join(runDir(parent, runId), "directions.json");
  return existsSync(path) ? json<VariantDirectionSet>(path) : undefined;
}

export function freezeIfReady(parent: string, manifest: DesignRunManifest): void {
  const graph = loadSiteGraph(parent);
  const state = loadState(parent, graph);
  if (!sharedTrunkComplete(state)) return;
  const shared = join(runDir(parent, manifest.runId), "shared");
  const frozen = freezeSharedEvidence(parent, shared);
  manifest.sharedInputHash = frozen.hash;
  saveManifest(parent, manifest);
}

export function sharedFreezeStatus(parent: string, runId: string): { ok: boolean; hash: string; currentHash: string; copied: string[]; failures: string[] } {
  const shared = join(runDir(parent, runId), "shared");
  const status = sharedEvidenceReceiptStatus(shared);
  const manifest = loadManifest(parent, runId);
  const failures = [...status.failures];
  if (status.hash && manifest.sharedInputHash && status.hash !== manifest.sharedInputHash) {
    failures.push("Manifest sharedInputHash does not match the frozen receipt");
  }
  return { ...status, ok: failures.length === 0, failures };
}

function assignedPath(parent: string, runId: string, candidateId: string): string {
  return join(runDir(parent, runId), "candidates", candidateId, "agent/assigned-direction.json");
}

function launchMeta(parent: string): { slug: string; name: string } {
  if (!existsSync(join(parent, "launch.json"))) return { slug: "site", name: "Site" };
  const launch = json<{ slug?: string; name?: string }>(join(parent, "launch.json"));
  return { slug: launch.slug || "site", name: launch.name || "Site" };
}

export function ensureCandidateSite(parent: string, kernel: string, manifest: DesignRunManifest, candidate: CandidateRecord, brief: VariantBrief): string {
  const dest = resolve(parent, candidate.root);
  if (!existsSync(join(dest, "package.json"))) {
    const meta = launchMeta(parent);
    scaffoldNestedSite({ dest, kernel, slug: `${meta.slug}-${candidate.label.toLowerCase()}`, name: `${meta.name} ${candidate.label}`, parent });
    importSharedEvidence(dest, join(runDir(parent, manifest.runId), "shared"));
  }
  const parentStudies = join(runDir(parent, manifest.runId), "studies");
  for (const kind of ["home", "interior"] as const) {
    const source = join(parentStudies, `${brief.id}-${kind}.html`);
    const target = join(dest, "onboarding/studies", `${brief.id}-${kind}.html`);
    if (existsSync(source) && !existsSync(target)) copyTree(source, target);
  }
  const runRequest = join(runDir(parent, manifest.runId), "operator-request.json");
  if (existsSync(runRequest)) copyTree(runRequest, join(dest, "agent/request.json"));
  const assignedPath = join(dest, "agent/assigned-direction.json");
  const assigned = { version: 1, mode: "assigned", directionId: brief.id, brief };
  if (!existsSync(assignedPath) || json<{ directionId?: string }>(assignedPath).directionId !== brief.id) {
    save(assignedPath, assigned);
  }
  candidate.directionId = brief.id;
  const sitePath = join(dest, "site.json");
  if (existsSync(sitePath)) {
    const site = json<Record<string, unknown>>(sitePath);
    const designRun = site.designRun as { runId?: string; candidateId?: string } | undefined;
    if (designRun?.runId !== manifest.runId || designRun?.candidateId !== candidate.id) {
      site.designRun = { runId: manifest.runId, candidateId: candidate.id };
      save(sitePath, site);
    }
  }
  saveManifest(parent, manifest);
  return dest;
}

export type InjectedStageExecutor = (opts: {
  stage: GraphNode;
  prep: StagePreparation;
  prompt: string;
  root?: string;
  outputPath?: string;
}) => Promise<void>;

type ParentStageRecord = { runId: string; logicalId: string; node: GraphNode; preparationId: string };
const parentStagePath = (parent: string, runId: string) => join(parent, "agent/runs", `parent-stage-${runId}.json`);

function parentStageGrade(parent: string, record: ParentStageRecord): { failures: string[] } {
  const { runId, logicalId } = record;
  try {
    if (["narrative", "narrative-review", "reference-analysis"].includes(logicalId)) return evaluateV2(parent, logicalId);
    if (logicalId === "direction-diversity-review") return validateParentDiversityReview(parent, runId, { requirePass: false });
    if (logicalId === "feedback-fulfillment") {
      const report = record.node.writes.find(p => p.endsWith("feedback-fulfillment.json"))!;
      const site = resolve(parent, report, "../../..");
      return evaluateV2(site, "feedback-fulfillment");
    }
    const set = readDirectionSet(parent, runId);
    if (!set) return { failures: ["Missing direction set"] };
    const request = existsSync(join(runDir(parent, runId), "operator-request.json")) ? json<{theme?: string; themeScope?: "one" | "all"}>(join(runDir(parent, runId), "operator-request.json")) : {};
    const failures = validateVariantSet(set, runId, request);
    if (logicalId === "variant-directions-repair") {
      const baseline = json<{ directionId: string; others: string; before: [string, string][] }>(join(parent, "agent/runs", `parent-repair-${runId}.json`));
      if (JSON.stringify(set.directions.filter(d => d.id !== baseline.directionId)) !== baseline.others) failures.push("Repair author mutated non-target direction briefs");
      const changed = relativeChangedFiles(parent, [`agent/design-runs/${runId}/studies`], new Map(baseline.before));
      if (changed.some(path => !isTargetStudyPath(path, baseline.directionId))) failures.push("Repair author mutated non-target study source");
      if (!changed.some(path => isTargetStudyPath(path, baseline.directionId))) failures.push("Repair author did not change target study sources");
    }
    if (failures.length) return { failures };
    requireDirectionStudies(parent, runId, set);
    return { failures };
  } catch (error) { return { failures: [error instanceof Error ? error.message : String(error)] }; }
}

async function completeParentStage(parent: string, kernel: string, record: ParentStageRecord, executionFailures: string[] = []): Promise<string> {
  const graph = loadSiteGraph(parent);
  graph.nodes.push(record.node);
  const state = loadState(parent, graph);
  const completed = await completeStage({ root: parent, kernel, graph, state, preparationId: record.preparationId,
    evaluate: () => parentStageGrade(parent, record), executionFailures,
  });
  save(parentStagePath(parent, record.runId), { ...record, completed: true, ok: completed.ok });
  return completed.failures.join("; ");
}

async function invokeRunStage(
  parent: string, kernel: string, manifest: DesignRunManifest, nodeId: string, prompt: string,
  kind: "agent" | "critic" = "agent", allowExtra: string[] = [], injectedStageExecutor?: InjectedStageExecutor
): Promise<string> {
  const rel = `agent/design-runs/${manifest.runId}`;
  const logicalWrites: Record<string, string[]> = {
    narrative: ["onboarding/narrative-brief.json"],
    "narrative-review": ["agent/reviews/narrative-review.json"],
    "reference-analysis": ["onboarding/reference-analysis.json"],
    "variant-directions": [`${rel}/directions.json`, `${rel}/studies`],
    "variant-directions-repair": [`${rel}/directions.json`, `${rel}/studies`],
    "direction-diversity-review": [`${rel}/direction-review.json`],
    "feedback-fulfillment": allowExtra,
  };
  const writes = logicalWrites[nodeId];
  if (!writes) throw new Error(`Unknown parent stage: ${nodeId}`);
  const watched = parentCriticSnapshotPaths(manifest.runId).filter(path => !writes.some(w => path === w || path.startsWith(w + "/")) && !["agent/STATE.json", "agent/RUN.lock", "agent/reviews", `${rel}/synthesis`].includes(path));
  const node: GraphNode = { id: `${manifest.runId}-${nodeId}`, kind, optional: true, needs: [], refs: [], tools: [],
    inputs: kind === "critic" ? watched : [`${rel}/shared`, "onboarding/business.json", "onboarding/media-inventory.json"],
    subjectPaths: watched, writes: [...writes, `${rel}/${nodeId}.log`], eval: nodeId, maxAttempts: 4 };
  const graph = loadSiteGraph(parent); graph.nodes.push(node);
  const state = loadState(parent, graph);
  const result = await prepareStage({ root: parent, kernel, graph, state, nodeId: node.id,
    jevConfig: { ...DEFAULT_JEV_CONFIG, mode: "off" },
    promptOverride: prompt + `\nAfter writing only the declared outputs, resume with npm.cmd run go -- --design-run ${manifest.runId} --resume. The coordinator completes this preparation through the shared lifecycle.\n`,
  });
  if (result.status === 'awaiting_user') throw new PendingDesignStage('theme-selection', parent);
  if (!result.preparation) throw new Error("Parent stage preparation unavailable");
  const record: ParentStageRecord = { runId: manifest.runId, logicalId: nodeId, node, preparationId: result.preparation.id };
  save(parentStagePath(parent, manifest.runId), record);
  if (!injectedStageExecutor) throw new PendingDesignStage(nodeId, parent);
  const outputPath = join(runDir(parent, manifest.runId), `${nodeId}.log`);
  // Test executors go through the same preparation and completion path. Keep the existing critic rollback guarantee.
  const before = kind === "critic" ? snapshotPaths(parent, parentCriticSnapshotPaths(manifest.runId)) : new Map<string, string>();
  const preimages = new Map([...before.keys()].map(path => [path, readFileSync(join(parent, path))]));
  const executionFailures: string[] = [];
  try {
    await injectedStageExecutor({ stage: { ...node, id: nodeId }, prep: result.preparation, prompt, root: parent, outputPath });
    if (!existsSync(outputPath)) writeFileSync(outputPath, "injected test stage execution completed\n");
  } catch (error) { executionFailures.push(`tool_failure: ${error instanceof Error ? error.message : String(error)}`); }
  if (kind === "critic") {
    const mutations = criticMutations(before, snapshotPaths(parent, parentCriticSnapshotPaths(manifest.runId)), node.writes);
    if (mutations.length) {
      for (const path of mutations) {
        const bytes = preimages.get(path);
        if (bytes) { mkdirSync(resolve(parent, path, ".."), { recursive: true }); writeFileSync(join(parent, path), bytes); }
        else if (existsSync(join(parent, path))) rmSync(join(parent, path), { force: true });
      }
      executionFailures.push(`critic_write_violation: Critic changed protected source/artifacts (${mutations.join(", ")})`);
    }
  }
  return completeParentStage(parent, kernel, record, executionFailures);
}

function parentCriticAllowlist(runId: string, nodeId: string, extra: string[] = []): string[] {
  const rel = `agent/design-runs/${runId}`;
  const logs = [`${rel}/${nodeId}.log`, `${rel}/${nodeId}.usage.json`, `${rel}/${nodeId}.receipt.json`];
  if (nodeId === "narrative-review") {
    return [...logs, "agent/reviews/narrative-review.json", ...extra];
  }
  if (nodeId === "feedback-fulfillment") {
    return [...logs, ...extra];
  }
  return [
    ...logs,
    `${rel}/direction-review.json`,
    `${rel}/direction-review.receipt.json`,
    `${rel}/set-quality-review.json`,
    `${rel}/visual-capability.json`,
    `${rel}/visual-probe.png`,
    ...extra,
  ];
}

function parentCriticSnapshotPaths(runId: string): string[] {
  const rel = `agent/design-runs/${runId}`;
  return [
    "launch.json",
    "agent/adapter.json",
    "agent/adapter.reviewer.json",
    "agent/request.json",
    "agent/change-request.json",
    "agent/request-history",
    "agent/requests",
    "agent/RUN.lock",
    "agent/graph.yaml",
    "agent/PROMPT.md",
    "agent/refs",
    "agent/STATE.json",
    "agent/reviews",
    `${rel}/manifest.json`,
    `${rel}/directions.json`,
    `${rel}/studies`,
    `${rel}/study-renders`,
    `${rel}/direction-render.json`,
    `${rel}/direction-review.json`,
    `${rel}/direction-review.identity.json`,
    `${rel}/shared`,
    `${rel}/candidates`,
    `${rel}/synthesis`,
    `${rel}/narrative-brief.json`,
    `${rel}/reference-analysis.json`,
    "pages", "components", "theme", "site.json", "media", "public", "onboarding",
  ];
}

function restoreCriticPreimage(parent: string, backup: string, mutations: string[]): void {
  for (const path of mutations) {
    const from = join(backup, path);
    const to = join(parent, path);
    if (existsSync(from)) copyTree(from, to);
    else if (existsSync(to)) rmSync(to, { recursive: true, force: true });
  }
}

function criticMutations(before: Map<string, string>, after: Map<string, string>, allowlist: string[]): string[] {
  const allowed = (path: string) => allowlist.some(item => path === item || path.startsWith(`${item}/`));
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changed: string[] = [];
  for (const path of keys) {
    if (before.get(path) !== after.get(path) && !allowed(path)) changed.push(path);
  }
  return changed;
}

function requireDirectionStudies(parent: string, runId: string, set: VariantDirectionSet): void {
  const dest = runDir(parent, runId);
  const missing: string[] = [];
  for (const brief of set.directions) {
    for (const kind of ["home", "interior"] as const) {
      if (!existsSync(join(dest, "studies", `${brief.id}-${kind}.html`))) missing.push(`${brief.id}-${kind}.html`);
    }
  }
  if (missing.length) throw new Error(`Planning did not write required studies: ${missing.join(", ")}`);
}

async function ensureSharedNarrative(
  parent: string,
  kernel: string,
  manifest: DesignRunManifest,
  injectedStageExecutor?: InjectedStageExecutor
): Promise<void> {
  if (!existsSync(join(parent, "onboarding/narrative-brief.json"))) {
    const refs = ["narrative", "contracts"].filter(name => existsSync(join(parent, `agent/refs/${name}.md`))).map(name => `\n## Skill: ${name}\n${readFileSync(join(parent, `agent/refs/${name}.md`), "utf8")}`).join("\n");
    const failure = await invokeRunStage(parent, kernel, manifest, "narrative", `Write onboarding/narrative-brief.json schemaVersion 2 after reviewed business and media.\nIdentify the actual customer, problem, distinct offer, service scope, best available proof, primary conversion, objections, unsupported claims, visitorQuestions, assetNotes, and at least one designOpportunity (evidence-backed or design-hypothesis with uncertainty).\nEvery factual claim and proof choice must cite harvested evidence or fact IDs. Do not import future kernel strategy or demo-reference people/claims as business facts.\n${refs}`, "agent", [], injectedStageExecutor);
    if (failure) throw new Error(failure);
  }
  const narrativeGrade = evaluateV2(parent, "narrative");
  if (!narrativeGrade.ok) throw new Error(`Shared narrative brief is required: ${narrativeGrade.failures.join("; ")}`);
  if (!existsSync(join(parent, "agent/reviews/narrative-review.json"))) {
    const refs = ["critic", "contracts"].filter(name => existsSync(join(parent, `agent/refs/${name}.md`))).map(name => `\n## Skill: ${name}\n${readFileSync(join(parent, `agent/refs/${name}.md`), "utf8")}`).join("\n");
    const failure = await invokeRunStage(parent, kernel, manifest, "narrative-review", `Write agent/reviews/narrative-review.json for the narrative brief. Review only. Do not edit other reviews, requests, sources, or STATE.\n${refs}`, "critic", [], injectedStageExecutor);
    if (failure) throw new Error(failure);
  }
  if (!evaluateV2(parent, "narrative-review").ok) throw new Error(`Shared narrative review failed: ${evaluateV2(parent, "narrative-review").failures.join("; ")}`);
  if (!existsSync(join(parent, "onboarding/reference-analysis.json"))) {
    const kernelRoot = resolveKernelRoot(kernel) || kernel;
    const refs = ["design-calibration", "contracts"].filter(name => existsSync(join(parent, `agent/refs/${name}.md`))).map(name => `\n## Skill: ${name}\n${readFileSync(join(parent, `agent/refs/${name}.md`), "utf8")}`).join("\n");
    const failure = await invokeRunStage(parent, kernel, manifest, "reference-analysis", `Write onboarding/reference-analysis.json schemaVersion 1.\nInspect the versioned kernel calibration pack at design-system/calibration/${CALIBRATION_PACK_VERSION}/ through the kernel location (not customer media). packVersion ${CALIBRATION_PACK_VERSION}; packHash ${calibrationPackHash(kernelRoot)}.\nUse first-view captures only. Do not copy demo claims, people, phone numbers, or ratings as this business's facts.\nRecord applicable principles, avoided principles, planned homepage/interior application, evidence paths confined to the current calibration pack records, and teachingPrinciples selected from design-system/knowledge/v1 with ids, versions, content hashes, and applicability reasons.\n${refs}`, "agent", [], injectedStageExecutor);
    if (failure) throw new Error(failure);
  }
  const refGrade = evaluateV2(parent, "reference-analysis");
  if (!refGrade.ok) throw new Error(`Shared reference-analysis is required: ${refGrade.failures.join("; ")}`);
}

async function planDirections(
  parent: string,
  kernel: string,
  manifest: DesignRunManifest,
  injectedStageExecutor?: InjectedStageExecutor
): Promise<void> {
  const existing = readDirectionSet(parent, manifest.runId);
  const request = existsSync(join(runDir(parent, manifest.runId), "operator-request.json"))
    ? json<{ theme?: string; themeScope?: "one" | "all" }>(join(runDir(parent, manifest.runId), "operator-request.json"))
    : (existsSync(join(parent, "agent/request.json")) ? json<{ theme?: string; themeScope?: "one" | "all" }>(join(parent, "agent/request.json")) : {});
  const theme = request.theme || "";
  const themeScope = manifest.mode?.themeScope || request.themeScope;
  if (!existing || validateVariantSet(existing, manifest.runId, { theme, themeScope }).length) {
    const refs = ["variant-directions", "contracts", "design-calibration", "narrative"].filter(name => existsSync(join(parent, `agent/refs/${name}.md`))).map(name => `\n## Skill: ${name}\n${readFileSync(join(parent, `agent/refs/${name}.md`), "utf8")}`).join("\n");
    const themeLine = theme
      ? `Operator theme (verbatim, first-class): ${theme}\nTheme scope: ${themeScope || "one"} (${themeScope === "all" ? "apply to every brief" : "exactly one exploratory brief may center it; do not silently ignore the request"}).`
      : "No operator theme request.";
    const failure = await invokeRunStage(parent, kernel, manifest, "variant-directions", `Write exactly ${VARIANT_COUNT} complete direction briefs to agent/design-runs/${manifest.runId}/directions.json.\nEach brief is an evidenced business idea for this customer, not a prescribed style bucket. Style vocabulary may describe the resulting system but must not be the reason a candidate exists.\nRequired per brief: centralIdea, visitorExperience, hierarchy, visualExpression, evidenceIds, plus the visual system fields.\nPrivate HTML sketches may be written to agent/design-runs/${manifest.runId}/studies/{briefId}-home.html and {briefId}-interior.html. They are not finished variants and cannot be quality-approved.\nRun id: ${manifest.runId}\n${themeLine}\nShared narrative and reference-analysis are required inputs under onboarding/ and agent/design-runs/${manifest.runId}/shared/.\nDo not pick a winner. Do not write pages/, parent STATE.json, or mutate frozen shared evidence.\n${refs}`, "agent", [], injectedStageExecutor);
    if (failure) throw new Error(failure);
  }
  const set = readDirectionSet(parent, manifest.runId);
  if (!set) throw new Error("Planning did not write directions.json");
  const errors = validateVariantSet(set, manifest.runId, { theme, themeScope });
  if (errors.length) throw new Error(errors.join("; "));
  requireDirectionStudies(parent, manifest.runId, set);
  manifest.directionIds = set.directions.map(d => d.id);
  saveManifest(parent, manifest);
}

function writeReviewIdentity(parent: string, runId: string): { subjectHash: string; identities: ReturnType<typeof parentDiversityIdentities> } {
  const identities = parentDiversityIdentities(parent, runId);
  const subjectHash = parentDiversityReviewSubject(parent, runId);
  save(join(runDir(parent, runId), "direction-review.identity.json"), { subjectHash, identities, sourceHash: parentDiversitySourceSubject(parent, runId) });
  return { subjectHash, identities };
}

export async function renderVariantStudies(parent: string, manifest: DesignRunManifest, set?: VariantDirectionSet, opts?: { force?: boolean }): Promise<{ checks: { candidate: string; width: number; screenshot: string }[] }> {
  const directions = set || readDirectionSet(parent, manifest.runId);
  if (!directions) return { checks: [] };
  if (!opts?.force && evaluateParentStudyRender(parent, manifest.runId).ok) {
    const report = json<{ checks: { candidate: string; width: number; screenshot: string }[] }>(join(runDir(parent, manifest.runId), "direction-render.json"));
    return { checks: report.checks || [] };
  }
  const dest = runDir(parent, manifest.runId);
  const studies: { candidate: string; path: string }[] = [];
  const work = join(dest, "study-work");
  mkdirSync(join(work, "onboarding/studies"), { recursive: true });
  for (const brief of directions.directions) {
    for (const kind of ["home", "interior"] as const) {
      const src = join(dest, "studies", `${brief.id}-${kind}.html`);
      if (!existsSync(src)) continue;
      const rel = `onboarding/studies/${brief.id}-${kind}.html`;
      copyTree(src, join(work, rel));
      studies.push({ candidate: `${brief.id}-${kind}`, path: rel });
    }
  }
  if (!studies.length) {
    rmSync(work, { recursive: true, force: true });
    return { checks: [] };
  }
  const shared = join(dest, "shared");
  for (const path of ["media", "theme"]) {
    const from = existsSync(join(shared, path)) ? join(shared, path) : join(parent, path);
    if (existsSync(from)) copyTree(from, join(work, path));
  }
  try {
    const result = await renderStudySources({
      root: work,
      outputRoot: dest,
      studies,
      screenshotDir: "study-renders",
      reportPath: "direction-render.json",
      subjectHash: parentDiversitySourceSubject(parent, manifest.runId),
    });
    const renderGrade = evaluateParentStudyRender(parent, manifest.runId);
    if (!renderGrade.ok) throw new Error(`tool_failure: ${renderGrade.failures.join("; ")}`);
    return { checks: result.checks };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.startsWith("tool_failure:") ? message : `tool_failure: ${message}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function archivePlanningRevision(parent: string, manifest: DesignRunManifest, label: string): string {
  const dest = join(runDir(parent, manifest.runId), "repairs", label);
  mkdirSync(dest, { recursive: true });
  const src = runDir(parent, manifest.runId);
  for (const name of ["directions.json", "studies", "study-renders", "direction-review.json", "direction-render.json"]) {
    const from = join(src, name);
    if (existsSync(from)) copyTree(from, join(dest, name));
  }
  return dest;
}

function relativeChangedFiles(parent: string, rels: string[], before: Map<string, string>): string[] {
  const after = snapshotPaths(parent, rels);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changed: string[] = [];
  for (const path of keys) {
    if (before.get(path) !== after.get(path)) changed.push(path);
  }
  return changed;
}

function isTargetStudyPath(path: string, directionId: string): boolean {
  return path.includes(`/studies/${directionId}-`) || path.endsWith(`/studies/${directionId}-home.html`) || path.endsWith(`/studies/${directionId}-interior.html`);
}

function snapshotPaths(parent: string, rels: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const rel of rels) {
    const target = join(parent, rel);
    if (!existsSync(target)) continue;
    for (const file of files(target)) {
      const path = relative(parent, file).replaceAll("\\", "/");
      out.set(path, fingerprint(parent, [path]));
    }
  }
  return out;
}

async function repairDirection(
  parent: string,
  kernel: string,
  manifest: DesignRunManifest,
  repair: { directionId: string; reason: string; targets: string[] },
  injectedStageExecutor?: InjectedStageExecutor
): Promise<void> {
  const set = readDirectionSet(parent, manifest.runId);
  if (!set?.directions.some(d => d.id === repair.directionId)) throw new Error(`Repair target is not a planned brief: ${repair.directionId}`);
  const othersBefore = JSON.stringify(set.directions.filter(d => d.id !== repair.directionId));
  const rel = `agent/design-runs/${manifest.runId}`;
  const watched = [`${rel}/directions.json`, `${rel}/studies`];
  const before = snapshotPaths(parent, watched);
  save(join(parent, "agent/runs", `parent-repair-${manifest.runId}.json`), {
    directionId: repair.directionId, others: othersBefore,
    before: [...snapshotPaths(parent, [`${rel}/studies`])],
  });
  const archive = archivePlanningRevision(parent, manifest, `repair-${String(manifest.budgets.planningRepairsUsed + 1).padStart(3, "0")}`);
  manifest.budgets.planningRepairsUsed += 1;
  saveManifest(parent, manifest);
  const reviewPath = join(runDir(parent, manifest.runId), "direction-review.json");
  if (existsSync(reviewPath)) unlinkSync(reviewPath);
  const refs = ["variant-directions", "contracts", "design-calibration"].filter(name => existsSync(join(parent, `agent/refs/${name}.md`))).map(name => `\n## Skill: ${name}\n${readFileSync(join(parent, `agent/refs/${name}.md`), "utf8")}`).join("\n");
  const failure = await invokeRunStage(
    parent, kernel, manifest, "variant-directions-repair",
    `Revise ONLY direction ${repair.directionId} in agent/design-runs/${manifest.runId}/directions.json.\nRewrite that brief and its homepage/interior studies at agent/design-runs/${manifest.runId}/studies/${repair.directionId}-home.html and ${repair.directionId}-interior.html.\nLeave the other four briefs unchanged. Do not rewrite non-target studies.\nDo not write direction-review.json, direction-render.json, pages/, or parent STATE.json. Do not pick a winner.\nRepair reason: ${repair.reason}\nTargets: ${repair.targets.join(", ")}\n${refs}`,
    "agent",
    [],
    injectedStageExecutor
  );
  const restoreArchive = () => {
    const dest = runDir(parent, manifest.runId);
    for (const name of ["directions.json", "studies", "study-renders", "direction-review.json", "direction-render.json"]) {
      const from = join(archive, name);
      if (existsSync(from)) copyTree(from, join(dest, name));
    }
  };
  if (failure) {
    restoreArchive();
    throw new Error(failure);
  }
  try {
    const revised = readDirectionSet(parent, manifest.runId);
    if (!revised) throw new Error("Repair author removed directions.json");
    if (JSON.stringify(revised.directions.filter(d => d.id !== repair.directionId)) !== othersBefore) {
      throw new Error("Repair author mutated non-target direction briefs");
    }
    const changedFiles = relativeChangedFiles(parent, watched, before);
    for (const path of changedFiles) {
      if (path.includes("/studies/") && !isTargetStudyPath(path, repair.directionId)) {
        throw new Error(`Repair author mutated non-target study source: ${path}`);
      }
    }
    const setErrors = validateVariantSet(revised, manifest.runId);
    if (setErrors.length) throw new Error(setErrors.join("; "));
    requireDirectionStudies(parent, manifest.runId, revised);
    const targetTouched = changedFiles.some(path => isTargetStudyPath(path, repair.directionId));
    if (!targetTouched) throw new Error(`Repair author did not change target study sources for ${repair.directionId}`);
    await renderVariantStudies(parent, manifest, revised, { force: true });
    save(join(archive, "receipt.json"), {
      at: new Date().toISOString(),
      directionId: repair.directionId,
      reason: repair.reason,
      targets: repair.targets,
      changedFiles,
      planningRepairsUsed: manifest.budgets.planningRepairsUsed,
      authorNode: "variant-directions-repair",
    });
  } catch (error) {
    restoreArchive();
    throw error;
  }
  appendEvent(parent, { runId: manifest.runId, type: "repair", candidateId: repair.directionId, detail: repair.reason });
}

function diversityReviewReusable(parent: string, runId: string): boolean {
  if (!existsSync(join(runDir(parent, runId), "direction-review.json"))) return false;
  return validateParentDiversityReview(parent, runId, { requirePass: true }).ok;
}

async function reviewDiversity(
  parent: string,
  kernel: string,
  manifest: DesignRunManifest,
  injectedStageExecutor?: InjectedStageExecutor
): Promise<void> {
  const renderGrade = evaluateParentStudyRender(parent, manifest.runId);
  if (!renderGrade.ok) throw new Error(renderGrade.failures.every(f => f.startsWith("tool_failure:")) ? renderGrade.failures.join("; ") : `tool_failure: ${renderGrade.failures.join("; ")}`);
  if (diversityReviewReusable(parent, manifest.runId)) {
    save(join(runDir(parent, manifest.runId), "direction-review.receipt.json"), {
      at: new Date().toISOString(), reused: true, subjectHash: parentDiversityReviewSubject(parent, manifest.runId),
    });
    return;
  }
  const contract = existsSync(join(runDir(parent, manifest.runId), "direction-review.json"))
    ? validateParentDiversityReview(parent, manifest.runId, { requirePass: false })
    : undefined;
  const freshFail = !!contract?.ok && contract.review?.verdict === "fail";
  if (!freshFail) {
    const { subjectHash, identities } = writeReviewIdentity(parent, manifest.runId);
    const refs = ["critic", "contracts", "design-calibration", "variant-directions"].filter(name => existsSync(join(parent, `agent/refs/${name}.md`))).map(name => `\n## Skill: ${name}\n${readFileSync(join(parent, `agent/refs/${name}.md`), "utf8")}`).join("\n");
    const failure = await invokeRunStage(parent, kernel, manifest, "direction-diversity-review", `Review the ${VARIANT_COUNT} planned directions and rendered studies under agent/design-runs/${manifest.runId}/.\nWrite ONLY agent/design-runs/${manifest.runId}/direction-review.json. Do not edit briefs, studies, renders, shared evidence, or STATE.\nParent diversity review schemaVersion 1, kind direction-diversity, runId ${manifest.runId}.\nsubjectHash: ${subjectHash}\nidentities: ${JSON.stringify(identities)}\nRequired axes: ${PARENT_DIVERSITY_AXES.join(", ")}.\nVerdict must be pass or fail; unknown never proceeds. Include reviewer, inspected evidence paths (existing PNG captures), candidate findings for every brief, and repair targets if failing.\nYou may request revision of one brief. You must not select a winner or discard directions to collapse the set.\nFail looks that are color swaps or reordered versions of the same layout.\nIf studies remain too similar after a prior repair, set unresolvedSimilarity instead of picking a winner.\n${refs}`, "critic", [], injectedStageExecutor);
    if (failure) throw new Error(failure);
  }
  const validated = validateParentDiversityReview(parent, manifest.runId, { requirePass: false });
  save(join(runDir(parent, manifest.runId), "direction-review.receipt.json"), {
    at: new Date().toISOString(),
    reused: false,
    subjectHash: parentDiversityReviewSubject(parent, manifest.runId),
    verdict: validated.review?.verdict,
    failures: validated.failures,
  });
  if (validated.stale || validated.malformed || !validated.review || validated.contractOk === false) {
    throw new Error(validated.failures.join("; ") || "Parent diversity review is malformed or stale");
  }
  if (validated.ok && validated.review.verdict === "pass") return;
  const review = validated.review;
  if (review.verdict === "unknown") throw new Error("Diversity review verdict is unknown; unknown never passes");
  if (review.verdict !== "fail") throw new Error(`design_failure: Diversity review verdict is ${review.verdict}; candidate expansion blocked. ${validated.failures.join("; ")}`);
  if (review.repair?.directionId && manifest.budgets.planningRepairsUsed < manifest.budgets.planningRepairs) {
    await repairDirection(parent, kernel, manifest, review.repair, injectedStageExecutor);
    return reviewDiversity(parent, kernel, manifest, injectedStageExecutor);
  }
  if (review.repair?.directionId) {
    throw new Error(`repair_budget_exhausted: Diversity review still fails for ${review.repair.directionId} after ${manifest.budgets.planningRepairsUsed} planning repairs. Rejected creative result retained. ${review.repair.reason}`);
  }
  throw new Error(`design_failure: Diversity review verdict is ${review.verdict}; candidate expansion blocked. ${validated.failures.join("; ")}`);
}

async function generateCandidates(
  parent: string,
  kernel: string,
  manifest: DesignRunManifest,
  argv: string[],
  injectedStageExecutor?: InjectedStageExecutor
): Promise<void> {
  const set = readDirectionSet(parent, manifest.runId);
  if (!set) throw new Error("Missing directions.json");
  for (let i = 0; i < manifest.candidates.length; i++) {
    const candidate = manifest.candidates[i]!;
    const brief = set.directions[i];
    if (!brief) { candidate.error = "Missing assigned brief"; candidate.status = "blocked"; continue; }
    if (candidate.status === "rejected" || candidate.status === "blocked") continue;
    if (candidate.previewReady || candidate.status === "complete") continue;
    const dest = ensureCandidateSite(parent, kernel, manifest, candidate, brief);
    const graph = loadSiteGraph(dest);
    const snapshot = join(runDir(parent, manifest.runId), "qualified", candidate.id);
    if (existsSync(join(snapshot, "pages/index.html"))) {
      try {
        importQualifiedRepresentative(dest, snapshot, graph);
      } catch (error) {
        if (!representativeReady(loadState(dest, graph))) {
          candidate.error = error instanceof Error ? error.message : String(error);
        }
      }
    }
    let state: AgentState = loadState(dest, graph);
    if (state.preview_ready) { candidate.status = "complete"; candidate.previewReady = true; continue; }
    candidate.status = "generating";
    saveManifest(parent, manifest);
    const result = await runWorkflow({ root: dest, kernel, argv: childWorkflowArgv(argv), max: manifest.budgets.max, timeout: manifest.budgets.timeoutMs, testStageExecutor: injectedStageExecutor });
    state = result.state;
    const pending = !injectedStageExecutor && !result.exitCode && !state.preview_ready ? pendingActiveStage(dest, state) : undefined;
    if (pending) {
      saveManifest(parent, manifest);
      throw new PendingDesignStage(`candidate ${candidate.label}: ${pending}`, dest);
    }
    candidate.previewReady = !!state.preview_ready;
    candidate.status = state.preview_ready ? "complete" : (state.status === "blocked" ? "blocked" : state.status);
    candidate.error = state.preview_ready ? undefined : (state.nodes[state.current || ""]?.failures || []).join("; ") || state.status;
    if (existsSync(join(dest, "dist/index.html"))) candidate.buildHash = fingerprint(dest, ["dist"]);
    candidate.sourceHash = existsSync(join(dest, "pages")) ? sourceHash(dest) : undefined;
    saveManifest(parent, manifest);
    appendEvent(parent, { runId: manifest.runId, type: "candidate", candidateId: candidate.id, to: candidate.status, detail: candidate.error });
  }
}

function representativeReady(state: AgentState): boolean {
  return state.nodes["representative-quality"]?.status === "done" || !!state.preview_ready;
}

function ensureCandidateQuality(candidate: CandidateRecord): CandidateQualityBudget {
  candidate.quality ||= { repairs: QUALITY_REPAIR_ATTEMPTS, used: 0, attempts: [] };
  candidate.quality.repairs ??= QUALITY_REPAIR_ATTEMPTS;
  candidate.quality.used ??= 0;
  candidate.quality.attempts ||= [];
  return candidate.quality;
}

async function qualifyCandidates(
  parent: string,
  kernel: string,
  manifest: DesignRunManifest,
  argv: string[],
  injectedStageExecutor?: InjectedStageExecutor
): Promise<void> {
  const set = readDirectionSet(parent, manifest.runId);
  if (!set) throw new Error("Missing directions.json");
  writeVisualProbe(runDir(parent, manifest.runId));
  for (let i = 0; i < manifest.candidates.length; i++) {
    const candidate = manifest.candidates[i]!;
    const brief = set.directions[i];
    if (!brief) { candidate.status = "blocked"; candidate.error = "Missing assigned brief"; continue; }
    const dest = ensureCandidateSite(parent, kernel, manifest, candidate, brief);
    if (!existsSync(join(dest, QUALITY_PROBE_REL))) writeVisualProbe(join(dest, "agent/reviews"));
    const qualityBudget = ensureCandidateQuality(candidate);
    candidate.status = "representative_review";
    saveManifest(parent, manifest);
    while (true) {
      const graph = loadSiteGraph(dest);
      const beforeAttempts = loadState(dest, graph).nodes["representative-quality"]?.attempts || 0;
      const result = await runWorkflow({
        root: dest, kernel, argv: childWorkflowArgv(argv), max: manifest.budgets.max, timeout: manifest.budgets.timeoutMs,
        stopWhen: state => representativeReady(state) || (state.nodes["representative-quality"]?.attempts || 0) > beforeAttempts,
        noPreviewServer: true,
        testStageExecutor: injectedStageExecutor,
      });
      const pending = !injectedStageExecutor && !result.exitCode && !result.state.preview_ready ? pendingActiveStage(dest, result.state) : undefined;
      if (pending) {
        saveManifest(parent, manifest);
        throw new PendingDesignStage(`candidate ${candidate.label}: ${pending}`, dest);
      }
      const sketchErrors = sketchesAreNotRepresentatives(dest);
      const quality = existsSync(join(dest, "agent/reviews/representative-quality.json"))
        ? validateQualityReview(dest, { requirePass: true })
        : { ok: false, failures: ["Missing representative-quality review"], review: undefined };
      const qualityAttempted = (loadState(dest, loadSiteGraph(dest)).nodes["representative-quality"]?.attempts || 0) > beforeAttempts;
      if (!injectedStageExecutor && result.exitCode && !qualityAttempted) {
        candidate.error = `Candidate workflow stopped before quality review: ${result.state.status}. Inspect the failed tool report, repair through the child workflow, then resume.`;
        saveManifest(parent, manifest);
        throw new PendingDesignStage(`candidate ${candidate.label}: tool-stage repair`, dest);
      }
      if (sketchErrors.length) {
        candidate.status = "rejected";
        candidate.error = sketchErrors.join("; ");
        candidate.previewReady = false;
        break;
      }
      const visualBlocked = quality.failures.some(f => /probeHash|probe file|image-read|image payload|Visual capability|Visual judgment unavailable|Generic adapters without verifiable/i.test(f));
      if (visualBlocked) {
        candidate.status = "blocked";
        candidate.error = quality.failures.join("; ") || result.state.status || "visual proof unavailable";
        candidate.previewReady = false;
        break;
      }
      if (quality.ok && representativeReady(result.state)) {
        candidate.status = "qualified";
        candidate.error = undefined;
        copyAllowlist(dest, join(runDir(parent, manifest.runId), "qualified", candidate.id), QUALIFIED_REPRESENTATIVE_PATHS);
        break;
      }
      if (!qualityAttempted) {
        candidate.status = "rejected";
        candidate.error = quality.failures.join("; ") || result.state.status || "representative quality not reached";
        candidate.previewReady = false;
        break;
      }
      const reason = quality.failures.join("; ") || result.state.status || "representative quality not reached";
      qualityBudget.attempts.push({ at: new Date().toISOString(), reason, verdict: quality.review?.verdict || "fail" });
      if (qualityBudget.used >= qualityBudget.repairs) {
        candidate.status = "rejected";
        candidate.error = `quality_repair_exhausted after ${qualityBudget.used} repairs: ${reason}`;
        candidate.previewReady = false;
        break;
      }
      qualityBudget.used += 1;
      candidate.error = reason;
      saveManifest(parent, manifest);
      appendEvent(parent, { runId: manifest.runId, type: "quality-repair", candidateId: candidate.id, detail: reason });
    }
    saveManifest(parent, manifest);
    appendEvent(parent, { runId: manifest.runId, type: "qualify", candidateId: candidate.id, to: candidate.status, detail: candidate.error });
  }
  const qualified = manifest.candidates.filter(c => c.status === "qualified");
  const diversityPass = validateParentDiversityReview(parent, manifest.runId, { requirePass: true }).ok;
  if (qualified.length !== VARIANT_COUNT) {
    throw new Error(`quality_failure: ${qualified.length}/${VARIANT_COUNT} representatives are quality-qualified. Diversity ${diversityPass ? "passed" : "did not pass"} but cannot compensate for missing production representatives or failed quality. Private sketches are not finished variants.`);
  }
}

async function snapshotReview(parent: string, kernel: string, manifest: DesignRunManifest): Promise<void> {
  const revision = `review-${String((readdirSync(join(runDir(parent, manifest.runId), "comparison")).filter(n => n.startsWith("review-")).length + 1)).padStart(3, "0")}`;
  const dest = join(runDir(parent, manifest.runId), "comparison", revision);
  const set = readDirectionSet(parent, manifest.runId);
  const sites = [];
  for (const candidate of manifest.candidates) {
    const root = resolve(parent, candidate.root);
    let previewUrl: string | undefined;
    if (existsSync(join(root, "dist/index.html"))) {
      try { previewUrl = await ensurePreview(root, kernel); } catch { /* comparison still records the snapshot */ }
    }
    sites.push({
      candidateId: candidate.id,
      label: candidate.label,
      root,
      concept: set?.directions.find(d => d.id === candidate.directionId)?.concept || candidate.directionId,
      previewReady: candidate.previewReady,
      previewUrl,
    });
  }
  const comparison = snapshotCandidates({ runId: manifest.runId, revision, dest, sites });
  manifest.activeComparisonRevision = revision;
  saveManifest(parent, manifest);
  appendEvent(parent, { runId: manifest.runId, type: "comparison", to: revision, detail: comparison.hash });
}

function comparisonDir(parent: string, manifest: DesignRunManifest): string {
  if (!manifest.activeComparisonRevision) throw new Error("No comparison revision");
  return join(runDir(parent, manifest.runId), "comparison", manifest.activeComparisonRevision);
}

export function submitFeedback(parent: string, runId: string, raw: unknown): { feedback: DesignFeedback; interpretation: FeedbackInterpretation; summary: string; duplicate: boolean } {
  const manifest = loadManifest(parent, runId);
  const feedback = parseDesignFeedback(raw);
  const payloadHash = feedback.idempotencyKey || feedbackPayloadHash(feedback);
  if (manifest.lastPayloadHash === payloadHash || manifest.feedbackHead === feedback.feedbackId) {
    const existing = loadFeedback(runDir(parent, runId), manifest.feedbackHead || feedback.feedbackId);
    const interpretation = json<FeedbackInterpretation>(join(runDir(parent, runId), "interpretations", `int-${existing.feedbackId}.json`));
    return { feedback: existing, interpretation, summary: summarizeFeedback(existing, interpretation), duplicate: true };
  }
  const comparison = loadComparison(comparisonDir(parent, manifest));
  const indexes = loadSectionIndexes(comparisonDir(parent, manifest), comparison);
  const validated = validateDesignFeedback({ feedback, runId, comparison, indexes });
  if (feedback.submission === "draft") {
    save(join(runDir(parent, runId), "feedback/draft.json"), feedback);
    return { feedback, interpretation: validated.interpretation, summary: summarizeFeedback(feedback, validated.interpretation), duplicate: false };
  }
  saveFeedback(runDir(parent, runId), feedback);
  writeInterpretation(runDir(parent, runId), validated.interpretation);
  manifest.feedbackHead = feedback.feedbackId;
  manifest.lastPayloadHash = payloadHash;
  manifest.lastIdempotencyKey = feedback.idempotencyKey;
  if (!validated.ok) {
    manifest.errors = validated.errors.concat(validated.interpretation.unresolved.map(u => u.question));
    transition(parent, manifest, "needs_clarification", validated.errors[0] || validated.interpretation.unresolved[0]?.question);
  } else if (feedback.noneOfThese || feedback.submission === "revise-directions") {
    transition(parent, manifest, "planning", "operator requested revised directions");
  } else {
    transition(parent, manifest, "interpreting_feedback");
  }
  return { feedback, interpretation: validated.interpretation, summary: summarizeFeedback(feedback, validated.interpretation), duplicate: false };
}

async function synthesize(
  parent: string,
  kernel: string,
  manifest: DesignRunManifest,
  argv: string[],
  injectedStageExecutor?: InjectedStageExecutor
): Promise<void> {
  if (!manifest.feedbackHead) throw new Error("No feedback to synthesize");
  if (manifest.synthesisHead) {
    const existingSite = join(runDir(parent, manifest.runId), "synthesis", manifest.synthesisHead, "site");
    if (existsSync(join(existingSite, "agent/STATE.json"))) {
      const resumed = await runWorkflow({ root: existingSite, kernel, argv: childWorkflowArgv(argv), max: manifest.budgets.max, timeout: manifest.budgets.timeoutMs, testStageExecutor: injectedStageExecutor });
      if (resumed.state.preview_ready) { transition(parent, manifest, "verifying"); return; }
      if (!resumed.exitCode) throw new PendingDesignStage(pendingActiveStage(existingSite, resumed.state) || "synthesis", existingSite);
      transition(parent, manifest, "blocked", resumed.state.status);
      return;
    }
  }
  const feedback = loadFeedback(runDir(parent, manifest.runId), manifest.feedbackHead);
  const interpretation = json<FeedbackInterpretation>(join(runDir(parent, manifest.runId), "interpretations", `int-${feedback.feedbackId}.json`));
  const comparison = loadComparison(comparisonDir(parent, manifest));
  const base = manifest.candidates.find(c => c.id === interpretation.baseCandidateId);
  if (!base) throw new Error("Base candidate missing");
  const baseRoot = resolve(parent, base.root);
  const storyboard = json<Storyboard>(join(baseRoot, "onboarding/storyboard.json"));
  const revision = `synth-${String((readdirSync(join(runDir(parent, manifest.runId), "synthesis")).filter(n => n.startsWith("synth-")).length + 1)).padStart(3, "0")}`;
  const dest = join(runDir(parent, manifest.runId), "synthesis", revision);
  const plan = buildSynthesisPlan({ runId: manifest.runId, revision, feedback, interpretation, comparison, baseStoryboard: storyboard });
  const planErrors = validateSynthesisPlan(plan);
  if (planErrors.length) throw new Error(planErrors.join("; "));
  mkdirSync(dest, { recursive: true });
  save(join(dest, "synthesis-plan.json"), plan);
  const siteDest = join(dest, "site");
  const themeBrief = readDirectionSet(parent, manifest.runId)?.directions.find(d => d.id === manifest.candidates.find(c => c.id === interpretation.themeCandidateId)?.directionId);
  const meta = launchMeta(parent);
  createSynthesisRoot({
    dest: siteDest, kernel, parent, baseRoot, slug: `${meta.slug}-final`,
    name: `${meta.name} final`,
    plan, assignedDirectionPath: themeBrief ? assignedPath(parent, manifest.runId, interpretation.themeCandidateId) : undefined,
  });
  if (themeBrief) save(join(siteDest, "agent/assigned-direction.json"), { version: 1, mode: "assigned", directionId: themeBrief.id, brief: themeBrief });
  manifest.synthesisHead = revision;
  saveManifest(parent, manifest);
  const result = await runWorkflow({ root: siteDest, kernel, argv: childWorkflowArgv(argv), max: manifest.budgets.max, timeout: manifest.budgets.timeoutMs, testStageExecutor: injectedStageExecutor });
  if (!result.state.preview_ready) {
    if (!result.exitCode) throw new PendingDesignStage(pendingActiveStage(siteDest, result.state) || "synthesis", siteDest);
    manifest.errors.push("Synthesis pipeline did not reach preview_ready");
    transition(parent, manifest, "blocked", result.state.status);
    return;
  }
  transition(parent, manifest, "verifying");
}

async function verifySynthesis(
  parent: string,
  kernel: string,
  manifest: DesignRunManifest,
  injectedStageExecutor?: InjectedStageExecutor
): Promise<void> {
  if (!manifest.synthesisHead || !manifest.feedbackHead) throw new Error("Missing synthesis/feedback head");
  const siteDest = join(runDir(parent, manifest.runId), "synthesis", manifest.synthesisHead, "site");
  const feedback = loadFeedback(runDir(parent, manifest.runId), manifest.feedbackHead);
  const reportPath = join(siteDest, "agent/reviews/feedback-fulfillment.json");
  const reportRel = relative(parent, reportPath).replaceAll("\\", "/");
  if (!existsSync(reportPath)) {
    const refs = ["feedback-fulfillment", "critic", "contracts"].filter(name => existsSync(join(parent, `agent/refs/${name}.md`))).map(name => `\n## Skill: ${name}\n${readFileSync(join(parent, `agent/refs/${name}.md`), "utf8")}`).join("\n");
    const failure = await invokeRunStage(
      parent, kernel, manifest, "feedback-fulfillment",
      `Write ${reportRel} mapping every must-have choice to fulfilled/partial/unfulfilled with current screenshot evidence. Review only. Do not edit synthesis sources, captures, other reviews, or STATE.\nFeedback:\n${readFileSync(join(runDir(parent, manifest.runId), "feedback", `${feedback.feedbackId}.json`), "utf8")}\n${refs}`,
      "critic",
      [reportRel],
      injectedStageExecutor
    );
    if (failure) throw new Error(failure);
  }
  const failures = synthesisAcceptanceFailures(siteDest);
  if (failures.length) {
    manifest.errors.push(...failures);
    transition(parent, manifest, "blocked", "synthesis verification failed");
    return;
  }
  transition(parent, manifest, "final_preview_ready");
  if (existsSync(join(siteDest, "dist/index.html"))) {
    const url = await ensurePreview(siteDest, kernel);
    appendEvent(parent, { runId: manifest.runId, type: "final_preview", detail: url });
  }
}

export async function runDesignCoordinator(
  parent: string,
  kernel: string,
  argv: string[],
  opts?: {
    runId?: string;
    theme?: string;
    injectedStageExecutor?: InjectedStageExecutor;
  }
): Promise<{ manifest: DesignRunManifest; exitCode: number; paused?: boolean; previewUrl?: string; summary?: string }> {
  if (hasFlag(argv, "--legacy-worker") || hasFlag(argv, "--worker") || Boolean(process.env.VITRIS_LEGACY_WORKER)) {
    throw new Error("External model worker mode (--legacy-worker, --worker, VITRIS_LEGACY_WORKER) is not supported. Vitris runs strictly in active-agent mode.");
  }
  const authorAdapter = loadAdapter(parent, "author");
  if (authorAdapter.command !== "active-agent" && !opts?.injectedStageExecutor) {
    throw new Error(`Unsupported external model adapter command '${authorAdapter.command}'. Vitris runs strictly in active-agent mode.`);
  }
  let manifest = opts?.runId && existsSync(join(runDir(parent, opts.runId), "manifest.json"))
    ? loadManifest(parent, opts.runId)
    : createDesignRun(parent, kernel, {
      theme: opts?.theme,
      themeScope: argFrom(argv, "--theme-scope") === "all" ? "all" : argFrom(argv, "--theme-scope") === "one" ? "one" : undefined,
      conceptPreview: hasFlag(argv, "--concept-preview"),
      max: Number(argFrom(argv, "--max") || 40),
      timeoutMs: Number(argFrom(argv, "--timeout-ms") || 1_200_000),
    });
  manifest.mode ||= { conceptPreview: hasFlag(argv, "--concept-preview"), requestedVariants: VARIANT_COUNT };
  if (hasFlag(argv, "--concept-preview")) manifest.mode.conceptPreview = true;
  const continueConceptPreview = (hasFlag(argv, "--resume") && !hasFlag(argv, "--concept-preview")) || hasFlag(argv, "--continue-from-concept-preview");
  if (continueConceptPreview) {
    manifest.mode = { ...(manifest.mode || { requestedVariants: VARIANT_COUNT }), conceptPreview: false };
    saveManifest(parent, manifest);
  }
  for (const candidate of manifest.candidates) ensureCandidateQuality(candidate);
  const release = acquire(parent);
  try {
    const pendingPath = parentStagePath(parent, manifest.runId);
    if (existsSync(pendingPath)) {
      const pending = json<ParentStageRecord & { completed?: boolean }>(pendingPath);
      if (!pending.completed) {
        const failure = await completeParentStage(parent, kernel, pending);
        if (failure) throw new Error(failure);
      }
    }
    for (let i = 0; i < 20; i++) {
      if (manifest.kernelContractHash !== kernelContractHash(kernel)) {
        manifest.errors.push("Kernel contract changed during this design-run; start a new run for the new revision");
        transition(parent, manifest, "blocked", "kernel_contract_changed");
        return { manifest, exitCode: 1 };
      }
      if (manifest.status === "preparing") {
        const graph = loadSiteGraph(parent);
        const state = loadState(parent, graph);
        if (!sharedTrunkComplete(state)) {
          const result = await runWorkflow({ root: parent, kernel, argv, skipLock: true, stopWhen: sharedTrunkComplete, max: manifest.budgets.max, timeout: manifest.budgets.timeoutMs, testStageExecutor: opts?.injectedStageExecutor });
          if (!sharedTrunkComplete(result.state)) {
            if (result.exitCode) { transition(parent, manifest, "blocked", result.state.status); return { manifest, exitCode: result.exitCode }; }
            return { manifest, exitCode: 0, paused: true, summary: `Shared stage prepared in ${parent}/agent/CURRENT.md; complete it, then resume design-run ${manifest.runId}.` };
          }
        }
        await ensureSharedNarrative(parent, kernel, manifest, opts?.injectedStageExecutor);
        freezeIfReady(parent, manifest);
        manifest = loadManifest(parent, manifest.runId);
        const frozen = sharedFreezeStatus(parent, manifest.runId);
        if (!frozen.ok) throw new Error(frozen.failures.join("; "));
        transition(parent, manifest, "planning");
        continue;
      }
      if (manifest.status === "planning") {
        let frozen = sharedFreezeStatus(parent, manifest.runId);
        if (!frozen.ok) {
          await ensureSharedNarrative(parent, kernel, manifest, opts?.injectedStageExecutor);
          freezeIfReady(parent, manifest);
          manifest = loadManifest(parent, manifest.runId);
          frozen = sharedFreezeStatus(parent, manifest.runId);
          if (!frozen.ok) throw new Error(frozen.failures.join("; "));
        }
        const sharedDir = join(runDir(parent, manifest.runId), "shared");
        const sharedBefore = frozen.currentHash;
        await planDirections(parent, kernel, manifest, opts?.injectedStageExecutor);
        const afterPlan = sharedEvidenceReceiptStatus(sharedDir);
        if (!afterPlan.ok || afterPlan.currentHash !== sharedBefore) {
          throw new Error(`Planning mutated frozen shared evidence: ${(afterPlan.failures.join("; ") || afterPlan.currentHash)}`);
        }
        await renderVariantStudies(parent, manifest);
        await reviewDiversity(parent, kernel, manifest, opts?.injectedStageExecutor);
        transition(parent, manifest, "qualifying");
        continue;
      }
      if (manifest.status === "qualifying") {
        await qualifyCandidates(parent, kernel, manifest, argv, opts?.injectedStageExecutor);
        if (manifest.mode?.conceptPreview) {
          transition(parent, manifest, "concept_preview_ready", "explicit concept-preview stop");
          return {
            manifest, exitCode: 0, paused: true,
            summary: `Concept-preview mode: ${VARIANT_COUNT} quality-qualified representatives are ready. Interior coverage and full functional acceptance are incomplete. This is not five finished websites.`,
          };
        }
        transition(parent, manifest, "generating");
        continue;
      }
      if (manifest.status === "concept_preview_ready") {
        if (continueConceptPreview) {
          manifest.mode = { ...(manifest.mode || { requestedVariants: VARIANT_COUNT }), conceptPreview: false };
          saveManifest(parent, manifest);
          transition(parent, manifest, "generating", "resume from concept-preview using qualified snapshots");
          continue;
        }
        return {
          manifest, exitCode: 0, paused: true,
          summary: "Concept-preview mode already stopped after qualified representatives. Interior coverage and full functional acceptance are incomplete. Resume with --design-run RUN_ID --resume (omit --concept-preview) to expand the exact qualified snapshots.",
        };
      }
      if (manifest.status === "generating") {
        manifest.mode = { ...(manifest.mode || { requestedVariants: VARIANT_COUNT }), conceptPreview: continueConceptPreview ? false : !!manifest.mode?.conceptPreview };
        await generateCandidates(parent, kernel, manifest, argv, opts?.injectedStageExecutor);
        const ready = manifest.candidates.filter(c => c.previewReady || c.status === "complete").length;
        const requested = manifest.mode?.requestedVariants || VARIANT_COUNT;
        if (ready < requested) {
          transition(parent, manifest, "blocked", `requested ${requested} finished variants; ${ready} complete`);
          return { manifest, exitCode: 1, summary: `Cannot silently succeed with a partial set: ${ready}/${requested} candidates reached a complete local preview.` };
        }
        transition(parent, manifest, "reviewing");
        continue;
      }
      if (manifest.status === "reviewing") {
        await snapshotReview(parent, kernel, manifest);
        transition(parent, manifest, "awaiting_design_feedback");
        return { manifest, exitCode: 0, paused: true, summary: "Awaiting operator design feedback. This pause is successful and consumes no retry budget." };
      }
      if (manifest.status === "awaiting_design_feedback") {
        return { manifest, exitCode: 0, paused: true, summary: "Awaiting operator design feedback. This pause is successful and consumes no retry budget." };
      }
      if (manifest.status === "needs_clarification") {
        return { manifest, exitCode: 0, paused: true, summary: manifest.errors.join("\n") || "Clarification required" };
      }
      if (manifest.status === "interpreting_feedback") {
        transition(parent, manifest, "synthesizing");
        continue;
      }
      if (manifest.status === "synthesizing") {
        await synthesize(parent, kernel, manifest, argv, opts?.injectedStageExecutor);
        manifest = loadManifest(parent, manifest.runId);
        continue;
      }
      if (manifest.status === "verifying") {
        await verifySynthesis(parent, kernel, manifest, opts?.injectedStageExecutor);
        manifest = loadManifest(parent, manifest.runId);
        continue;
      }
      if (manifest.status === "final_preview_ready") {
        const siteDest = join(runDir(parent, manifest.runId), "synthesis", manifest.synthesisHead || "", "site");
        const previewUrl = existsSync(join(siteDest, "dist/index.html")) ? await ensurePreview(siteDest, kernel) : undefined;
        return { manifest, exitCode: 0, previewUrl, summary: `Final local preview ready${previewUrl ? `: ${previewUrl}` : ""}` };
      }
      if (manifest.status === "blocked") return { manifest, exitCode: 1, summary: manifest.errors.join("\n") };
      break;
    }
    return { manifest, exitCode: manifest.status === "final_preview_ready" || manifest.status === "awaiting_design_feedback" ? 0 : 1 };
  } catch (error) {
    if (error instanceof PendingDesignStage) {
      appendEvent(parent, { runId: manifest.runId, type: "active-agent-pause", detail: error.message });
      return { manifest, exitCode: 0, paused: true, summary: `${error.message}. Inspect the child workflow; complete or repair its stage, then resume design-run ${manifest.runId}.` };
    }
    manifest.errors.push(error instanceof Error ? error.message : String(error));
    try { transition(parent, manifest, "blocked", manifest.errors.at(-1)); } catch { /* still report */ }
    return { manifest, exitCode: 1, summary: manifest.errors.join("\n") };
  } finally { release(); }
}

export function restartDesignStage(parent: string, runId: string, target: string, reason: string): DesignRunManifest {
  if (!reason.trim()) throw new Error("A restart requires a reason");
  const manifest = loadManifest(parent, runId);
  save(join(runDir(parent, runId), `restart-${Date.now()}.json`), { reason, manifest });
  if (CANDIDATE_IDS.includes(target as typeof CANDIDATE_IDS[number])) {
    const candidate = manifest.candidates.find(c => c.id === target)!;
    candidate.status = "pending"; candidate.previewReady = false; candidate.error = undefined;
    const dest = resolve(parent, candidate.root);
    let qualified = false;
    if (existsSync(join(dest, "agent/STATE.json"))) {
      const graph = loadSiteGraph(dest);
      const state = loadState(dest, graph);
      qualified = representativeReady(state);
      for (const st of Object.values(state.nodes)) if (st.status !== "done") st.attempts = 0;
      state.status = "in_progress";
      state.consecutiveFailures = {};
      save(join(dest, "agent/STATE.json"), state);
    }
    transition(parent, manifest, qualified ? "generating" : "qualifying", reason);
  } else if (target === "planning" || target === "variant-directions") {
    const activePath = parentStagePath(parent, runId);
    if (existsSync(activePath)) {
      const active = json<ParentStageRecord>(activePath);
      cancelStage({ root: parent, preparationId: active.preparationId, reason });
      save(activePath, { ...active, completed: true, canceled: true });
    }
    const graph = loadSiteGraph(parent), state = loadState(parent, graph);
    for (const [id, stage] of Object.entries(state.nodes)) if (id.startsWith(`${runId}-`) && stage.status !== "done") {
      stage.attempts = 0; stage.status = "pending";
    }
    for (const key of Object.keys(state.consecutiveFailures || {})) if (key.startsWith(`${runId}-`)) delete state.consecutiveFailures![key];
    state.status = "in_progress";
    save(join(parent, "agent/STATE.json"), state);
    manifest.budgets.planningRepairsUsed = 0;
    transition(parent, manifest, "planning", reason);
  } else if (target === "synthesis" || target === "storyboard") {
    manifest.synthesisHead = null;
    transition(parent, manifest, "synthesizing", reason);
  } else throw new Error(`Unknown design-run restart target: ${target}`);
  return loadManifest(parent, runId);
}

export function designRunStatus(parent: string, runId: string): object {
  const manifest = loadManifest(parent, runId);
  return {
    ...manifest,
    paused: manifest.status === "awaiting_design_feedback" || manifest.status === "needs_clarification" || manifest.status === "concept_preview_ready",
    complete: manifest.status === "final_preview_ready",
    conceptPreview: !!manifest.mode?.conceptPreview || manifest.status === "concept_preview_ready",
    fiveVersionComplete: manifest.candidates.filter(c => c.previewReady || c.status === "complete").length === VARIANT_COUNT && ["reviewing", "awaiting_design_feedback", "interpreting_feedback", "synthesizing", "verifying", "final_preview_ready"].includes(manifest.status),
    candidates: manifest.candidates.map(c => ({
      ...c,
      lifecycle: CANDIDATE_LIFECYCLE.includes(c.status as CandidateLifecycle) ? c.status : (c.previewReady ? "complete" : c.status),
      sketchOnly: c.status === "sketch" || (!c.previewReady && c.status !== "qualified" && c.status !== "complete"),
    })),
  };
}

export function exportPublicComparisonBundle(parent: string, runId: string, dest: string): PublicBundleResult {
  const manifest = loadManifest(parent, runId);
  const set = existsSync(join(runDir(parent, runId), "directions.json"))
    ? json<{ directions?: { id: string; concept?: string }[] }>(join(runDir(parent, runId), "directions.json"))
    : undefined;
  const sites = manifest.candidates.map(candidate => ({
    id: candidate.id,
    label: candidate.label,
    root: resolve(parent, candidate.root),
    concept: set?.directions?.find(d => d.id === candidate.directionId)?.concept || candidate.directionId,
    status: candidate.status,
  }));
  return buildPublicComparisonBundle({ dest, runId, sites });
}

export function promoteFinal(parent: string, runId: string): { backup: string } {
  const manifest = loadManifest(parent, runId);
  if (manifest.status !== "final_preview_ready" || !manifest.synthesisHead) throw new Error("Promote only after final_preview_ready");
  const siteDest = join(runDir(parent, runId), "synthesis", manifest.synthesisHead, "site");
  const planPath = join(siteDest, "onboarding/synthesis-plan.json");
  const recorded = join(runDir(parent, runId), "synthesis", manifest.synthesisHead, "synthesis-plan.json");
  if (!existsSync(planPath) || !existsSync(recorded)) throw new Error("Missing synthesis plan");
  const live = json<{ comparisonHash: string; feedbackHash: string }>(planPath);
  const saved = json<{ comparisonHash: string; feedbackHash: string }>(recorded);
  if (live.comparisonHash !== saved.comparisonHash || live.feedbackHash !== saved.feedbackHash) throw new Error("Synthesis hashes do not match the recorded plan; refusing promotion");
  const backup = join(runDir(parent, runId), `promotion-backup-${Date.now()}`);
  copyAllowlist(parent, backup, promotionAllowlist());
  copyAllowlist(siteDest, parent, promotionAllowlist());
  appendEvent(parent, { runId, type: "promoted", detail: backup });
  return { backup };
}
