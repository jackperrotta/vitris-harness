import { createHash } from "node:crypto";
import { GROUNDING_SEMANTICS_HASH, FIELD_SELECTION_SEMANTICS_HASH, COMPONENT_FIT_SEMANTICS_HASH, QUESTION_VERSION, canonicalJsonStringify } from "./questions.ts";
import { POLICY_VERSION } from "./policy.ts";
import type { JevMode } from "./types.ts";

/**
 * Kernel-controlled calibration. Site-authored `eligible:true` in agent/jev.json
 * never authorizes delegation. Eligibility is derived only from these artifacts
 * plus trusted runtime pilot context issued by kernel code.
 */

export const CALIBRATION_SCHEMA_VERSION = 1 as const;
export const CALIBRATION_ISSUER = "vitris-kernel" as const;
export const DATASET_VERSION = "2026-09-18.1";
export const MODEL_FAMILY = "jev-1.13";
/** Kernel-only nonce mixed into pilot-context integrity. Not a site config field. */
const PILOT_ISSUER_NONCE = "vitris-kernel-pilot-context-v1";

export type DelegationDenialReason =
  | "work_ownership_not_delegated"
  | "global_mode_off"
  | "global_mode_shadow"
  | "global_mode_not_assist"
  | "capability_not_assist"
  | "site_authored_eligible_ignored"
  | "registry_delegation_flag_ignored"
  | "no_kernel_calibration"
  | "calibration_expired"
  | "calibration_task_version_mismatch"
  | "calibration_question_semantics_mismatch"
  | "calibration_model_family_mismatch"
  | "calibration_dataset_mismatch"
  | "calibration_sample_size_insufficient"
  | "calibration_metrics_below_threshold"
  | "calibration_ineligible"
  | "pilot_context_required"
  | "pilot_context_invalid"
  | "pilot_context_expired"
  | "pilot_context_task_not_allowed"
  | "task_not_applicable"
  | "subject_missing"
  | "candidate_coverage_incomplete"
  | "evidence_missing"
  | "evidence_conflicting"
  | "evidence_stale"
  | "manifest_missing"
  | "manifest_stale"
  | "budget_exhausted"
  | "execution_failed"
  | "execution_uncertain"
  | "execution_incomplete"
  | "execution_unavailable";

export const ALL_DELEGATION_DENIAL_REASONS: DelegationDenialReason[] = [
  "work_ownership_not_delegated",
  "global_mode_off",
  "global_mode_shadow",
  "global_mode_not_assist",
  "capability_not_assist",
  "site_authored_eligible_ignored",
  "registry_delegation_flag_ignored",
  "no_kernel_calibration",
  "calibration_expired",
  "calibration_task_version_mismatch",
  "calibration_question_semantics_mismatch",
  "calibration_model_family_mismatch",
  "calibration_dataset_mismatch",
  "calibration_sample_size_insufficient",
  "calibration_metrics_below_threshold",
  "calibration_ineligible",
  "pilot_context_required",
  "pilot_context_invalid",
  "pilot_context_expired",
  "pilot_context_task_not_allowed",
  "task_not_applicable",
  "subject_missing",
  "candidate_coverage_incomplete",
  "evidence_missing",
  "evidence_conflicting",
  "evidence_stale",
  "manifest_missing",
  "manifest_stale",
  "budget_exhausted",
  "execution_failed",
  "execution_uncertain",
  "execution_incomplete",
  "execution_unavailable",
];

/**
 * Initial delegation order: earlier token savings, high-subjectivity last.
 * Uncalibrated tasks remain agent-owned even if listed.
 */
export const DELEGATION_PRIORITY_ORDER = [
  "business-source-selection",
  "business-review-grounding",
  "narrative-review-grounding",
  "copy-review-grounding",
  "cta-fidelity-check",
  "claim-strengthening-check",
  "cross-stage-consistency-check",
  "intent-coverage-check",
  "creative-dimension-scoring",
  "media-fit-scoring",
  "component-fit-check",
] as const;

export interface CalibrationMetrics {
  n: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  accuracy: number;
  precisionCi?: [number, number];
  recallCi?: [number, number];
  /** False-pass rate (FP / (FP+TN)) — calibrated against extra-agent-review cost. */
  falsePassRate: number;
  maxAllowedFalsePassRate: number;
  minSampleSize: number;
}

export interface KernelCalibrationArtifact {
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  issuer: typeof CALIBRATION_ISSUER;
  taskId: string;
  taskVersion: string;
  questionSemanticsHash: string;
  policyVersion: string;
  modelFamily: string;
  datasetVersion: string;
  sampleSize: number;
  metrics: CalibrationMetrics;
  thresholds: { grounding: number; routing: number };
  eligible: boolean;
  /** Pilot-only artifacts require trusted runtime pilot context. */
  pilotOnly: boolean;
  expiresAt: string;
  revalidation: {
    afterDays: number;
    requiresHeldoutRerun: boolean;
  };
  notes: string;
}

export interface TrustedPilotContext {
  schemaVersion: 1;
  issuer: typeof CALIBRATION_ISSUER;
  trialId: string;
  kernelRevision: string;
  issuedAt: string;
  expiresAt: string;
  allowedTaskIds: string[];
  integrityHash: string;
}

export interface CoverageAssessment {
  complete: boolean;
  candidateCount: number;
  evaluatedCount: number;
  coveredObligationIds: string[];
  retainedObligationIds: string[];
  missingEvidenceIds: string[];
  conflictingClaimIds: string[];
  staleEvidence: boolean;
}

export interface RemainingBudget {
  transportAttempts: number;
  inputTokens: number;
}

export interface ManifestCheck {
  present: boolean;
  current: boolean;
  expectedModel?: string;
  expectedQuestionSemantics?: string;
  batchStateHashes?: string[];
  subjectHash?: string;
}

function wilsonScoreCi(positives: number, total: number, z = 1.95996): [number, number] {
  if (total <= 0) return [0, 0];
  const p = positives / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  const lower = Math.max(0, (center - spread) / denominator);
  const upper = Math.min(1, (center + spread) / denominator);
  return [parseFloat(lower.toFixed(4)), parseFloat(upper.toFixed(4))];
}

export function computeCalibrationMetrics(opts: {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  maxAllowedFalsePassRate: number;
  minSampleSize: number;
}): CalibrationMetrics {
  const { tp, fp, tn, fn, maxAllowedFalsePassRate, minSampleSize } = opts;
  const n = tp + fp + tn + fn;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const accuracy = n > 0 ? (tp + tn) / n : 0;
  const falsePassRate = fp + tn > 0 ? fp / (fp + tn) : 0;
  return {
    n,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    precision,
    recall,
    accuracy,
    precisionCi: wilsonScoreCi(tp, tp + fp),
    recallCi: wilsonScoreCi(tp, tp + fn),
    falsePassRate,
    maxAllowedFalsePassRate,
    minSampleSize,
  };
}

function defaultMetrics(n: number): CalibrationMetrics {
  return computeCalibrationMetrics({
    tp: 0,
    fp: 0,
    tn: 0,
    fn: 0,
    maxAllowedFalsePassRate: 0.02,
    minSampleSize: Math.max(30, n),
  });
}

function uncalibratedArtifact(taskId: string, questionSemanticsHash: string): KernelCalibrationArtifact {
  const metrics = defaultMetrics(0);
  return {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    issuer: CALIBRATION_ISSUER,
    taskId,
    taskVersion: QUESTION_VERSION,
    questionSemanticsHash,
    policyVersion: POLICY_VERSION,
    modelFamily: MODEL_FAMILY,
    datasetVersion: DATASET_VERSION,
    sampleSize: 0,
    metrics,
    thresholds: { grounding: 0.85, routing: 0.8 },
    eligible: false,
    pilotOnly: true,
    expiresAt: "1970-01-01T00:00:00.000Z",
    revalidation: { afterDays: 30, requiresHeldoutRerun: true },
    notes: "Uncalibrated. Delegation disabled until kernel measurements pass false-pass and sample-size gates.",
  };
}

const KERNEL_ARTIFACTS: KernelCalibrationArtifact[] = [
  uncalibratedArtifact("business-source-selection", FIELD_SELECTION_SEMANTICS_HASH),
  uncalibratedArtifact("business-review-grounding", GROUNDING_SEMANTICS_HASH),
  uncalibratedArtifact("narrative-review-grounding", GROUNDING_SEMANTICS_HASH),
  uncalibratedArtifact("copy-review-grounding", GROUNDING_SEMANTICS_HASH),
  uncalibratedArtifact("claim-strengthening-check", GROUNDING_SEMANTICS_HASH),
  uncalibratedArtifact("cross-stage-consistency-check", GROUNDING_SEMANTICS_HASH),
  uncalibratedArtifact("cta-fidelity-check", GROUNDING_SEMANTICS_HASH),
  uncalibratedArtifact("intent-coverage-check", GROUNDING_SEMANTICS_HASH),
  uncalibratedArtifact("creative-dimension-scoring", GROUNDING_SEMANTICS_HASH),
  uncalibratedArtifact("media-fit-scoring", GROUNDING_SEMANTICS_HASH),
  uncalibratedArtifact("component-fit-check", COMPONENT_FIT_SEMANTICS_HASH),
];

let testOverlay: Map<string, KernelCalibrationArtifact> | undefined;

/** Test-only overlay. Production callers never use this. */
export function replaceCalibrationRegistryForTests(
  artifacts: KernelCalibrationArtifact[]
): () => void {
  testOverlay = new Map(artifacts.map(a => [a.taskId, a]));
  return () => {
    testOverlay = undefined;
  };
}

export function getKernelCalibration(taskId: string): KernelCalibrationArtifact | undefined {
  if (testOverlay?.has(taskId)) return testOverlay.get(taskId);
  return KERNEL_ARTIFACTS.find(a => a.taskId === taskId);
}

export function allKernelCalibrations(): KernelCalibrationArtifact[] {
  const base = [...KERNEL_ARTIFACTS];
  if (!testOverlay) return base;
  const byId = new Map(base.map(a => [a.taskId, a]));
  for (const [id, art] of testOverlay) byId.set(id, art);
  return [...byId.values()];
}

function pilotIntegrityPayload(ctx: Omit<TrustedPilotContext, "integrityHash">): string {
  return canonicalJsonStringify({
    schemaVersion: ctx.schemaVersion,
    issuer: ctx.issuer,
    trialId: ctx.trialId,
    kernelRevision: ctx.kernelRevision,
    issuedAt: ctx.issuedAt,
    expiresAt: ctx.expiresAt,
    allowedTaskIds: ctx.allowedTaskIds,
    nonce: PILOT_ISSUER_NONCE,
  });
}

export function issueTrustedPilotContext(opts: {
  trialId: string;
  kernelRevision: string;
  allowedTaskIds: string[];
  ttlMs?: number;
  now?: Date;
}): TrustedPilotContext {
  const now = opts.now ?? new Date();
  const ttlMs = opts.ttlMs ?? 24 * 60 * 60 * 1000;
  const unsigned: Omit<TrustedPilotContext, "integrityHash"> = {
    schemaVersion: 1,
    issuer: CALIBRATION_ISSUER,
    trialId: opts.trialId,
    kernelRevision: opts.kernelRevision,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    allowedTaskIds: [...opts.allowedTaskIds].sort(),
  };
  const integrityHash = createHash("sha256").update(pilotIntegrityPayload(unsigned)).digest("hex");
  return { ...unsigned, integrityHash };
}

export function verifyTrustedPilotContext(
  ctx: TrustedPilotContext | undefined,
  opts: { now?: Date; expectedKernelRevision?: string; taskId: string }
): { ok: boolean; reason?: DelegationDenialReason } {
  if (!ctx) return { ok: false, reason: "pilot_context_required" };
  if (ctx.issuer !== CALIBRATION_ISSUER || ctx.schemaVersion !== 1) {
    return { ok: false, reason: "pilot_context_invalid" };
  }
  const { integrityHash, ...rest } = ctx;
  const expected = createHash("sha256").update(pilotIntegrityPayload(rest)).digest("hex");
  if (integrityHash !== expected) return { ok: false, reason: "pilot_context_invalid" };
  const now = opts.now ?? new Date();
  if (Date.parse(ctx.expiresAt) <= now.getTime()) return { ok: false, reason: "pilot_context_expired" };
  if (opts.expectedKernelRevision && ctx.kernelRevision !== opts.expectedKernelRevision) {
    return { ok: false, reason: "pilot_context_invalid" };
  }
  if (!ctx.allowedTaskIds.includes(opts.taskId)) {
    return { ok: false, reason: "pilot_context_task_not_allowed" };
  }
  return { ok: true };
}

export function validateKernelCalibration(
  artifact: KernelCalibrationArtifact | undefined,
  opts: {
    taskId: string;
    taskVersion: string;
    questionSemanticsHash: string;
    modelFamily: string;
    datasetVersion: string;
    now?: Date;
  }
): { ok: boolean; reasons: DelegationDenialReason[] } {
  const reasons: DelegationDenialReason[] = [];
  if (!artifact) return { ok: false, reasons: ["no_kernel_calibration"] };
  if (artifact.issuer !== CALIBRATION_ISSUER || artifact.schemaVersion !== CALIBRATION_SCHEMA_VERSION) {
    reasons.push("no_kernel_calibration");
  }
  if (artifact.taskId !== opts.taskId) reasons.push("calibration_task_version_mismatch");
  if (artifact.taskVersion !== opts.taskVersion) reasons.push("calibration_task_version_mismatch");
  if (artifact.questionSemanticsHash !== opts.questionSemanticsHash) {
    reasons.push("calibration_question_semantics_mismatch");
  }
  if (artifact.modelFamily !== opts.modelFamily) reasons.push("calibration_model_family_mismatch");
  if (artifact.datasetVersion !== opts.datasetVersion) reasons.push("calibration_dataset_mismatch");
  const now = opts.now ?? new Date();
  if (Date.parse(artifact.expiresAt) <= now.getTime()) reasons.push("calibration_expired");
  if (artifact.sampleSize < artifact.metrics.minSampleSize || artifact.metrics.n < artifact.metrics.minSampleSize) {
    reasons.push("calibration_sample_size_insufficient");
  }
  if (artifact.metrics.falsePassRate > artifact.metrics.maxAllowedFalsePassRate) {
    reasons.push("calibration_metrics_below_threshold");
  }
  if (!artifact.eligible) reasons.push("calibration_ineligible");
  return { ok: reasons.length === 0, reasons };
}

export function modelFamilyOf(model: string): string {
  const m = (model || "jev-1.13.0").toLowerCase();
  if (m.startsWith("jev-1.13")) return MODEL_FAMILY;
  const dash = m.lastIndexOf(".");
  return dash > 0 ? m.slice(0, dash) : m;
}

export function capabilityForTask(taskId: string): "grounding" | "ctaFidelity" | "claimStrengthening" | "crossStageContinuity" | "coverageCheck" | "creativeScoring" | "sourceSelection" | "retrievalRanking" | "repairAssistance" | "componentSelection" {
  switch (taskId) {
    case "business-source-selection":
      return "sourceSelection";
    case "business-review-grounding":
    case "narrative-review-grounding":
      return "grounding";
    case "copy-review-grounding":
      return "grounding";
    case "cta-fidelity-check":
      return "ctaFidelity";
    case "claim-strengthening-check":
      return "claimStrengthening";
    case "cross-stage-consistency-check":
      return "crossStageContinuity";
    case "intent-coverage-check":
      return "coverageCheck";
    case "creative-dimension-scoring":
    case "media-fit-scoring":
      return "creativeScoring";
    case "component-fit-check":
      return "componentSelection";
    default:
      return "grounding";
  }
}

export function effectiveModeName(mode: JevMode): DelegationDenialReason | undefined {
  if (mode === "off") return "global_mode_off";
  if (mode === "shadow") return "global_mode_shadow";
  return undefined;
}
