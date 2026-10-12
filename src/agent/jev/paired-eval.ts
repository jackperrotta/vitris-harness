import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalJsonStringify } from "./questions.ts";
import { QUESTION_VERSION } from "./questions.ts";
import { POLICY_VERSION } from "./policy.ts";
import type { CompletionManifest, RunMetrics } from "./evaluation.ts";
import { compareRunMetrics, loadCompletionManifest, validateTrialEligibility } from "./evaluation.ts";

export interface TrialIdentity {
  kernelRevision: string;
  kernelDiffIdentity: string;
  graphVersion: number;
  sourceSnapshotHash: string;
  agentModel?: string;
  questionVersion: string;
  policyVersion: string;
  configSnapshot: Record<string, unknown>;
  stopNode: string;
  acceptanceRubric: string;
}

export interface ObservationArtifact {
  schemaVersion: 1;
  kind:
    | "prompt-bytes"
    | "agent-usage"
    | "jev-usage"
    | "coverage"
    | "evaluator"
    | "blind-rubric"
    | "browser"
    | "packet";
  path: string;
  sha256: string;
}

export interface BoundCompletionManifest extends CompletionManifest {
  trialIdentity: TrialIdentity;
  observationArtifacts: ObservationArtifact[];
  agentUsageMeasured: boolean;
  inheritedReceiptsCounted: false;
}

export function hashIdentity(identity: TrialIdentity): string {
  return createHash("sha256").update(canonicalJsonStringify(identity)).digest("hex");
}

export function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function validateObservationArtifacts(
  manifest: BoundCompletionManifest,
  root: string
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!manifest.trialIdentity) reasons.push("Missing trialIdentity on completion manifest");
  if (!Array.isArray(manifest.observationArtifacts) || manifest.observationArtifacts.length === 0) {
    reasons.push("No observation artifacts bound on completion manifest");
  }
  for (const art of manifest.observationArtifacts || []) {
    const abs = join(root, art.path);
    if (!existsSync(abs)) {
      reasons.push(`Observation artifact missing: ${art.path}`);
      continue;
    }
    const actual = hashFile(abs);
    if (actual !== art.sha256) reasons.push(`Observation artifact hash mismatch: ${art.path}`);
  }
  if (manifest.inheritedReceiptsCounted !== false) {
    reasons.push("inheritedReceiptsCounted must be false; inherited cache/receipts must not be counted");
  }
  return { ok: reasons.length === 0, reasons };
}

export function pinTrialIdentity(opts: {
  kernelRevision: string;
  kernelDiffIdentity: string;
  graphVersion: number;
  sourceSnapshotHash: string;
  stopNode: string;
  configSnapshot: Record<string, unknown>;
  agentModel?: string;
  acceptanceRubric?: string;
}): TrialIdentity {
  return {
    kernelRevision: opts.kernelRevision,
    kernelDiffIdentity: opts.kernelDiffIdentity,
    graphVersion: opts.graphVersion,
    sourceSnapshotHash: opts.sourceSnapshotHash,
    agentModel: opts.agentModel,
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    configSnapshot: opts.configSnapshot,
    stopNode: opts.stopNode,
    acceptanceRubric: opts.acceptanceRubric ?? "factuality,browser_build,blinded_outcome_rubric",
  };
}

export type FailureLayer =
  | "task_choice"
  | "candidate_recall"
  | "state_construction"
  | "question_design"
  | "threshold_policy"
  | "consumer_behavior"
  | "model_error"
  | "unknown";

export interface PromotionResult {
  promoted: boolean;
  reasons: string[];
  failureLayer?: FailureLayer;
}

/**
 * Promotion requires all of: no material quality regression, measurable agent
 * packet/usage reduction on delegated nodes, no repair-loop wipeout, complete
 * manifests, attributable usage, failure-restore evidence, budget held.
 * Critic-iteration count is workload, not a quality score.
 */
export function evaluatePromotion(opts: {
  baseline: RunMetrics;
  candidate: RunMetrics;
  packetBytesBaseline?: number;
  packetBytesCandidate?: number;
  repairIterationsBaseline?: number;
  repairIterationsCandidate?: number;
  manifestsComplete: boolean;
  usageAttributed: boolean;
  failureRestoresWork: boolean;
  jevWithinBudget: boolean;
  agentUsageMeasured: boolean;
  byteIdenticalPages?: boolean;
}): PromotionResult {
  const reasons: string[] = [];
  const eligibility = validateTrialEligibility(opts.baseline, opts.candidate);
  if (!eligibility.eligible) reasons.push(...eligibility.reasons);
  if (!opts.manifestsComplete) reasons.push("Incomplete manifests");
  if (!opts.usageAttributed) reasons.push("Usage is not attributable to this trial");
  if (!opts.failureRestoresWork) reasons.push("Service failure restore was not demonstrated");
  if (!opts.jevWithinBudget) reasons.push("Jev cost/latency exceeded the enforced per-run budget");
  if (!opts.agentUsageMeasured) {
    reasons.push("Active-agent tokens were not measured; missing metering is not zero usage");
  }
  if (opts.byteIdenticalPages) {
    reasons.push("Byte-identical pages are not a quality improvement");
  }

  const quality = opts.baseline.claimFidelityPct;
  const candQ = opts.candidate.claimFidelityPct;
  if (quality === undefined || candQ === undefined) {
    reasons.push("Factuality was not observed on both arms");
  } else if (candQ < quality * 0.98) {
    reasons.push(`Factuality regression: ${candQ} vs baseline ${quality}`);
  }

  const packetReduced =
    typeof opts.packetBytesBaseline === "number" &&
    typeof opts.packetBytesCandidate === "number" &&
    opts.packetBytesBaseline > 0 &&
    opts.packetBytesCandidate < opts.packetBytesBaseline;
  const tokenReduced =
    typeof opts.baseline.totalTokens === "number" &&
    typeof opts.candidate.totalTokens === "number" &&
    opts.baseline.totalTokens > 0 &&
    opts.candidate.totalTokens < opts.baseline.totalTokens &&
    opts.agentUsageMeasured;
  if (!packetReduced && !tokenReduced) {
    reasons.push("No measurable reduction in active-agent packet size or measured usage for delegated nodes");
  }

  if (
    typeof opts.repairIterationsBaseline === "number" &&
    typeof opts.repairIterationsCandidate === "number" &&
    opts.repairIterationsCandidate > opts.repairIterationsBaseline
  ) {
    reasons.push(
      `Repair loops increased (${opts.repairIterationsCandidate} vs ${opts.repairIterationsBaseline}); savings may be erased. Critic/repair counts are workload, not quality.`
    );
  }

  const report = compareRunMetrics(opts.baseline, opts.candidate);
  if (report.verdict === "regression_detected") reasons.push("Comparative verdict: regression_detected");
  if (report.verdict === "incomplete_quality_evidence") reasons.push("Comparative verdict: incomplete_quality_evidence");

  return { promoted: reasons.length === 0, reasons };
}

export function writeObservationArtifact(root: string, relativePath: string, contents: string | Buffer, kind: ObservationArtifact["kind"]): ObservationArtifact {
  const abs = join(root, relativePath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
  return {
    schemaVersion: 1,
    kind,
    path: relativePath.replaceAll("\\", "/"),
    sha256: createHash("sha256").update(typeof contents === "string" ? contents : contents).digest("hex"),
  };
}

export function treatmentsMatchIdentity(a: TrialIdentity, b: TrialIdentity): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (a.kernelRevision !== b.kernelRevision) reasons.push("kernelRevision mismatch");
  if (a.kernelDiffIdentity !== b.kernelDiffIdentity) reasons.push("kernelDiffIdentity mismatch");
  if (a.graphVersion !== b.graphVersion) reasons.push("graphVersion mismatch");
  if (a.sourceSnapshotHash !== b.sourceSnapshotHash) reasons.push("sourceSnapshotHash mismatch");
  if (a.questionVersion !== b.questionVersion) reasons.push("questionVersion mismatch");
  if (a.policyVersion !== b.policyVersion) reasons.push("policyVersion mismatch");
  if (a.stopNode !== b.stopNode) reasons.push("stopNode mismatch");
  if (canonicalJsonStringify(a.configSnapshot) === canonicalJsonStringify(b.configSnapshot)) {
    reasons.push("Treatment configs are identical; A/B/C require distinct Jev mode/ownership snapshots");
  }
  return { ok: reasons.length === 0, reasons };
}

export function loadBoundManifest(path: string): BoundCompletionManifest | undefined {
  const base = loadCompletionManifest(path);
  if (!base) return undefined;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw.trialIdentity || !Array.isArray(raw.observationArtifacts)) return undefined;
    return raw as BoundCompletionManifest;
  } catch {
    return undefined;
  }
}
