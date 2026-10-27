import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { JevConfig, JevWorkOwnership } from "./types.ts";
import type { JevCapabilityConfig } from "./config.ts";
import { resolveCapability } from "./config.ts";
import {
  ALL_DELEGATION_DENIAL_REASONS,
  capabilityForTask,
  DATASET_VERSION,
  effectiveModeName,
  getKernelCalibration,
  MODEL_FAMILY,
  modelFamilyOf,
  validateKernelCalibration,
  verifyTrustedPilotContext,
  type CoverageAssessment,
  type DelegationDenialReason,
  type KernelCalibrationArtifact,
  type ManifestCheck,
  type RemainingBudget,
  type TrustedPilotContext,
} from "./calibration.ts";
import { GROUNDING_SEMANTICS_HASH, QUESTION_VERSION } from "./questions.ts";
import type { GroundingCheckItem } from "./types.ts";

export type { DelegationDenialReason, TrustedPilotContext, CoverageAssessment, ManifestCheck, RemainingBudget };
export { ALL_DELEGATION_DENIAL_REASONS };

export interface DelegationEligibilityResult {
  eligible: boolean;
  reasons: DelegationDenialReason[];
  reasonDetails: string[];
  checkedConditions: string[];
  coveredObligationIds: string[];
  retainedObligationIds: string[];
  calibration?: KernelCalibrationArtifact;
}

export interface DelegationEvaluationInput {
  config: JevConfig;
  taskId: string;
  capability?: keyof JevCapabilityConfig;
  siteContext?: { subjectExists?: boolean; applicable?: boolean };
  coverage?: CoverageAssessment;
  manifest?: ManifestCheck;
  remainingBudget?: RemainingBudget;
  pilotContext?: TrustedPilotContext;
  executionStatus?: "completed" | "cached" | "no_candidates" | "unavailable" | "uncertain" | "incomplete" | "failed";
  now?: Date;
  kernelRevision?: string;
  /** Presence of a site-authored eligible flag. Never authorizes; recorded as a denial if used as the sole claim. */
  siteAuthoredEligible?: boolean;
  registryDelegationEligible?: boolean;
  questionSemanticsHash?: string;
}

/**
 * Evaluates whether a task's covered obligation may be removed from the agent packet.
 * Site-authored eligible flags and registry.delegationEligible never authorize.
 * Every condition is checked; the first failures are accumulated (fail closed).
 */
export function evaluateDelegationEligibility(opts: DelegationEvaluationInput): DelegationEligibilityResult {
  const { config, taskId } = opts;
  const reasons: DelegationDenialReason[] = [];
  const reasonDetails: string[] = [];
  const checkedConditions: string[] = [];
  const capability = opts.capability ?? capabilityForTask(taskId);

  checkedConditions.push("workOwnership=delegated");
  if ((config.workOwnership ?? "agent") !== "delegated") {
    reasons.push("work_ownership_not_delegated");
    reasonDetails.push(`workOwnership is "${config.workOwnership ?? "agent"}"`);
  }

  checkedConditions.push("globalMode=assist");
  const modeDenial = effectiveModeName(config.mode);
  if (modeDenial) {
    reasons.push(modeDenial);
    reasonDetails.push(`Global mode is "${config.mode}"`);
  } else if (config.mode !== "assist") {
    reasons.push("global_mode_not_assist");
    reasonDetails.push(`Global mode is "${config.mode}"`);
  }

  checkedConditions.push(`capability(${capability})=assist`);
  const effectiveCap = resolveCapability(config, capability);
  if (effectiveCap !== "assist") {
    reasons.push("capability_not_assist");
    reasonDetails.push(`Capability "${capability}" resolves to "${effectiveCap}"`);
  }

  const artifact = getKernelCalibration(taskId);

  if (opts.siteAuthoredEligible) {
    checkedConditions.push("siteAuthoredEligible=ignored");
    reasonDetails.push("Site-authored eligible:true is ignored and never authorizes delegation");
    if (!artifact?.eligible) reasons.push("site_authored_eligible_ignored");
  }

  if (opts.registryDelegationEligible) {
    checkedConditions.push("registryDelegationEligible=ignored");
    reasonDetails.push("Registry delegationEligible=true is ignored; kernel calibration is required");
    if (!artifact?.eligible) reasons.push("registry_delegation_flag_ignored");
  }

  checkedConditions.push("kernelCalibration");
  const cal = validateKernelCalibration(artifact, {
    taskId,
    taskVersion: QUESTION_VERSION,
    questionSemanticsHash: opts.questionSemanticsHash ?? GROUNDING_SEMANTICS_HASH,
    modelFamily: modelFamilyOf(config.model),
    datasetVersion: DATASET_VERSION,
    now: opts.now,
  });
  // Expected model family for current pin is MODEL_FAMILY; if config.model maps elsewhere, validateKernelCalibration already flags it.
  void MODEL_FAMILY;
  reasons.push(...cal.reasons);
  for (const r of cal.reasons) reasonDetails.push(`Calibration: ${r}`);

  if (artifact?.pilotOnly) {
    checkedConditions.push("trustedPilotContext");
    const pilot = verifyTrustedPilotContext(opts.pilotContext, {
      now: opts.now,
      expectedKernelRevision: opts.kernelRevision,
      taskId,
    });
    if (!pilot.ok && pilot.reason) {
      reasons.push(pilot.reason);
      reasonDetails.push(`Pilot context: ${pilot.reason}`);
    }
  }

  checkedConditions.push("taskApplicability");
  const subjectExists = opts.siteContext?.subjectExists === true;
  const applicable = opts.siteContext?.applicable === true;
  if (!applicable) {
    reasons.push("task_not_applicable");
    reasonDetails.push(`Task "${taskId}" is not applicable on this site (must be computed from artifacts, not hard-coded)`);
  }
  if (!subjectExists) {
    reasons.push("subject_missing");
    reasonDetails.push(`Subject does not exist for task "${taskId}"`);
  }

  const coverage = opts.coverage;
  checkedConditions.push("candidateEvidenceCoverage");
  if (coverage) {
    if (coverage.staleEvidence) {
      reasons.push("evidence_stale");
      reasonDetails.push("Evidence is stale relative to current sources");
    }
    if (coverage.missingEvidenceIds.length > 0) {
      reasons.push("evidence_missing");
      reasonDetails.push(`Missing evidence: ${coverage.missingEvidenceIds.join(", ")}`);
    }
    if (coverage.conflictingClaimIds.length > 0) {
      reasons.push("evidence_conflicting");
      reasonDetails.push(`Conflicting claims: ${coverage.conflictingClaimIds.join(", ")}`);
    }
    if (!coverage.complete || coverage.evaluatedCount < coverage.candidateCount) {
      reasons.push("candidate_coverage_incomplete");
      reasonDetails.push(
        `Coverage incomplete (${coverage.evaluatedCount}/${coverage.candidateCount} evaluated)`
      );
    }
  } else {
    reasons.push("candidate_coverage_incomplete");
    reasonDetails.push("No coverage assessment supplied");
  }

  checkedConditions.push("currentManifest");
  const manifest = opts.manifest;
  if (!manifest?.present) {
    reasons.push("manifest_missing");
    reasonDetails.push("Task manifest missing");
  } else if (!manifest.current) {
    reasons.push("manifest_stale");
    reasonDetails.push("Task manifest is stale or does not bind current batch state");
  }

  checkedConditions.push("remainingBudget");
  const budget = opts.remainingBudget;
  if (budget && (budget.transportAttempts <= 0 || budget.inputTokens <= 0)) {
    reasons.push("budget_exhausted");
    reasonDetails.push(
      `Remaining budget exhausted (attempts=${budget.transportAttempts}, inputTokens=${budget.inputTokens})`
    );
  }

  checkedConditions.push("executionStatus");
  if (!opts.executionStatus) {
    reasons.push("execution_incomplete");
    reasonDetails.push("No verified task execution status (completed/cached required before removing work)");
  } else if (opts.executionStatus === "unavailable") reasons.push("execution_unavailable");
  else if (opts.executionStatus === "uncertain") reasons.push("execution_uncertain");
  else if (opts.executionStatus === "failed") reasons.push("execution_failed");
  else if (opts.executionStatus === "incomplete" || opts.executionStatus === "no_candidates") {
    reasons.push("execution_incomplete");
  } else if (opts.executionStatus !== "completed" && opts.executionStatus !== "cached") {
    reasons.push("execution_incomplete");
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    eligible: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    reasonDetails,
    checkedConditions,
    coveredObligationIds: uniqueReasons.length === 0 ? (coverage?.coveredObligationIds ?? []) : [],
    retainedObligationIds: coverage?.retainedObligationIds ?? [],
    calibration: artifact,
  };
}

export function resolveWorkOwnership(opts: DelegationEvaluationInput): JevWorkOwnership {
  return evaluateDelegationEligibility(opts).eligible ? "delegated" : "agent";
}

export function assessPreflightCoverage(items: GroundingCheckItem[]): CoverageAssessment {
  const coveredObligationIds: string[] = [];
  const retainedObligationIds: string[] = [];
  const missingEvidenceIds: string[] = [];
  const conflictingClaimIds: string[] = [];
  let staleEvidence = false;
  let evaluatedCount = 0;

  for (const item of items) {
    const unevaluated =
      /failed|unavailable|canceled|budget/i.test(item.notes || "") && item.verdict === "insufficient_evidence";
    if (!unevaluated) evaluatedCount++;
    if (item.verdict === "missing_source") {
      missingEvidenceIds.push(item.evidenceId || item.id);
      retainedObligationIds.push(item.id);
    } else if (item.verdict === "contradicted" || item.relation === "contradicts") {
      conflictingClaimIds.push(item.id);
      retainedObligationIds.push(item.id);
    } else if (item.verdict === "superseded" || /stale/i.test(item.notes || "")) {
      staleEvidence = true;
      retainedObligationIds.push(item.id);
    } else if (item.verdict === "verified" && item.autoAccepted) {
      coveredObligationIds.push(item.id);
    } else {
      retainedObligationIds.push(item.id);
    }
  }

  const complete =
    items.length > 0 &&
    evaluatedCount === items.length &&
    missingEvidenceIds.length === 0 &&
    conflictingClaimIds.length === 0 &&
    !staleEvidence;

  return {
    complete,
    candidateCount: items.length,
    evaluatedCount,
    coveredObligationIds,
    retainedObligationIds,
    missingEvidenceIds,
    conflictingClaimIds,
    staleEvidence,
  };
}

const COVERED_MARKER_START = "<!-- jev-machine-covered:start -->";
const COVERED_MARKER_END = "<!-- jev-machine-covered:end -->";

function splitObligationId(id: string): { factId: string; evidenceId?: string } {
  const idx = id.indexOf(":");
  if (idx <= 0) return { factId: id };
  return { factId: id.slice(0, idx), evidenceId: id.slice(idx + 1) };
}

function rewriteSection(
  packet: string,
  headerPattern: RegExp,
  rewrite: (body: string) => string
): string {
  return packet.replace(headerPattern, (full, title, body) => {
    const nextBody = rewrite(body);
    if (!nextBody.trim()) return "\n";
    return `\n${title}${nextBody}`;
  });
}

/**
 * Removes only machine-covered claim/evidence pairs from a critic packet.
 * Retained (uncertain/flagged) items keep their full excerpts and expansion handles.
 * Empty leftover sections are dropped; remaining source is never stripped.
 */
export function applyDelegatedPacketReduction(opts: {
  packet: string;
  eligible: boolean;
  coveredObligationIds: string[];
  retainedItems: GroundingCheckItem[];
  retainedDuties: string[];
}): { packet: string; reduced: boolean; removedIds: string[]; retainedSourceBytes: string[] } {
  const { packet, eligible, coveredObligationIds, retainedItems, retainedDuties } = opts;
  if (!eligible || coveredObligationIds.length === 0) {
    return { packet, reduced: false, removedIds: [], retainedSourceBytes: [] };
  }

  const retainedFactIds = new Set<string>();
  const retainedEvIds = new Set<string>();
  const retainedSourceBytes: string[] = [];
  for (const item of retainedItems) {
    const parts = splitObligationId(item.id);
    retainedFactIds.add(parts.factId);
    if (item.evidenceId) retainedEvIds.add(item.evidenceId);
    else if (parts.evidenceId) retainedEvIds.add(parts.evidenceId);
    if (item.excerpt) retainedSourceBytes.push(item.excerpt);
  }

  const coveredFactIds = new Set<string>();
  const coveredEvIds = new Set<string>();
  for (const id of coveredObligationIds) {
    const parts = splitObligationId(id);
    if (!retainedFactIds.has(parts.factId)) coveredFactIds.add(parts.factId);
    if (parts.evidenceId && !retainedEvIds.has(parts.evidenceId)) coveredEvIds.add(parts.evidenceId);
  }

  let next = packet;
  next = rewriteSection(
    next,
    /\n(### Harvested Facts[^\n]*:\n)([\s\S]*?)(?=\n### |\n## |\nWrite output to:|$)/,
    body => body.replace(/^- \[([^\]]+)\] .+\n?/gm, (line, id) => {
      if (!coveredFactIds.has(id)) return line;
      const listed = line.match(/\(evidence:\s*([^)]+)\)/);
      if (listed?.[1]) {
        for (const ev of listed[1].split(/,\s*/)) {
          const evId = ev.trim();
          if (evId && !retainedEvIds.has(evId)) coveredEvIds.add(evId);
        }
      }
      return "";
    })
  );
  next = rewriteSection(
    next,
    /\n(### Evidence Excerpts[^\n]*:\n)([\s\S]*?)(?=\n### |\n## |\nWrite output to:|$)/,
    body => body.replace(/^- \[([^\]]+)\] .+\n?/gm, (line, id) => (coveredEvIds.has(id) && !retainedEvIds.has(id) ? "" : line))
  );

  const flaggedBlock = retainedItems.length
    ? retainedItems.map(i => {
        const ev = i.evidenceId || splitObligationId(i.id).evidenceId || "";
        const excerpt = i.excerpt ? `\n  - excerpt: "${i.excerpt}"` : "";
        const source = i.sourceFile ? `\n  - source: ${i.sourceFile}` : "";
        const handle = ev ? `\n  - expand: \`evidence-${ev}\`` : "";
        return `- **[${i.id}]** \`${i.verdict}\` ${i.claim}${i.notes ? ` — ${i.notes}` : ""}${excerpt}${source}${handle}`;
      }).join("\n")
    : "- None";

  const overlay = [
    COVERED_MARKER_START,
    "## SUPERSEDING REVIEW SCOPE (delegated routine grounding)",
    "Only the machine-covered claim/evidence pairs listed below are absent. Remaining items keep their source excerpts and expansion handles.",
    "",
    "### Machine-covered (do not repeat):",
    ...coveredObligationIds.map(id => `- ${id}`),
    "",
    "### Remaining critic obligations:",
    flaggedBlock,
    "",
    "### Retained agent duties:",
    ...retainedDuties.map(d => `- ${d}`),
    COVERED_MARKER_END,
    "",
  ].join("\n");

  const scopeHeader = "\n## Current review boundary\n";
  if (next.includes(scopeHeader)) {
    next = next.replace(scopeHeader, `\n${overlay}\n${scopeHeader}`);
  } else {
    next = `${overlay}\n${next}`;
  }

  return { packet: next, reduced: true, removedIds: coveredObligationIds, retainedSourceBytes };
}

export function assessSiteTaskContext(root: string, taskId: string): { subjectExists: boolean; applicable: boolean } {
  const busPath = join(root, "onboarding/business.json");
  const readBus = () => {
    if (!existsSync(busPath)) return undefined;
    try {
      return JSON.parse(readFileSync(busPath, "utf8"));
    } catch {
      return undefined;
    }
  };

  if (taskId === "business-source-selection") {
    const subjectExists =
      existsSync(join(root, "onboarding/copy")) ||
      existsSync(join(root, "onboarding/raw")) ||
      existsSync(join(root, "onboarding/brief.json"));
    return { subjectExists, applicable: subjectExists };
  }

  if (taskId === "business-review-grounding") {
    const bus = readBus();
    const subjectExists = Boolean(bus);
    const applicable = Boolean(bus && Array.isArray(bus.facts) && bus.facts.length > 0 && Array.isArray(bus.evidence) && bus.evidence.length > 0);
    return { subjectExists, applicable };
  }

  if (taskId === "narrative-review-grounding") {
    const narr = existsSync(join(root, "onboarding/narrative-brief.json"));
    const bus = Boolean(readBus());
    return { subjectExists: narr && bus, applicable: narr && bus };
  }

  if (taskId === "copy-review-grounding" || taskId === "cta-fidelity-check") {
    const copy = existsSync(join(root, "onboarding/copy-plan.json"));
    const story = existsSync(join(root, "onboarding/storyboard.json"));
    return { subjectExists: copy && story, applicable: copy && story };
  }

  if (taskId === "claim-strengthening-check" || taskId === "intent-coverage-check") {
    const copy = existsSync(join(root, "onboarding/copy-plan.json"));
    return { subjectExists: copy, applicable: copy };
  }

  if (taskId === "cross-stage-consistency-check") {
    const bus = Boolean(readBus());
    const narr = existsSync(join(root, "onboarding/narrative-brief.json"));
    return { subjectExists: bus || narr, applicable: bus };
  }

  if (taskId === "creative-dimension-scoring" || taskId === "media-fit-scoring") {
    return { subjectExists: existsSync(join(root, "onboarding/direction.json")), applicable: existsSync(join(root, "onboarding/direction.json")) };
  }

  return { subjectExists: false, applicable: false };
}

export function packetContainsCoveredWork(packet: string, coveredObligationIds: string[]): boolean {
  if (packet.includes(COVERED_MARKER_START)) {
    return coveredObligationIds.some(id => {
      const factLine = new RegExp(`\\[${id}\\].{0,80}evidence:`, "i");
      return factLine.test(packet);
    });
  }
  return coveredObligationIds.every(id => packet.includes(`[${id}]`));
}

export function buildDelegationContractSummary(opts: {
  taskId: string;
  machineCoveredObligations: string[];
  pendingItems: string[];
  retainedDuties: string[];
  sourceExpansionHandles: string[];
  calibrationStatus: "uncalibrated" | "pilot_only" | "experimental";
}): string {
  const {
    taskId,
    machineCoveredObligations,
    pendingItems,
    retainedDuties,
    sourceExpansionHandles,
    calibrationStatus,
  } = opts;

  const lines: string[] = [
    `## Delegation Contract: ${taskId} [EXPERIMENTAL — ${calibrationStatus.toUpperCase()}]`,
    "",
    "### Machine-Covered Obligations (do not repeat routine agent work for these):",
  ];

  if (machineCoveredObligations.length === 0) {
    lines.push("- None (no obligations delegated)");
  } else {
    for (const ob of machineCoveredObligations) lines.push(`- ${ob}`);
  }

  if (pendingItems.length > 0) {
    lines.push("", "### Pending / Conflicting / New / High-Impact Items (require agent judgment):");
    for (const item of pendingItems) lines.push(`- ${item}`);
  }

  lines.push("", "### Retained Agent Duties (always required regardless of delegation):");
  for (const duty of retainedDuties) lines.push(`- ${duty}`);

  if (sourceExpansionHandles.length > 0) {
    lines.push("", "### Source Expansion Handles (expand if agent verification needed):");
    for (const handle of sourceExpansionHandles) lines.push(`- ${handle}`);
  }

  lines.push(
    "",
    `> **Note:** This delegation contract is ${calibrationStatus} and has not been independently validated.`,
    "> Independent samples, explicit review of material promises, and extraction-completeness audits",
    "> for claims the machine candidate set missed are always retained as agent obligations.",
    "> API/budget failure, uncertain answers, incomplete candidates, or stale evidence restores",
    "> the corresponding agent obligation.",
  );

  return lines.join("\n");
}

export const DEFAULT_RETAINED_DUTIES = [
  "Independent sample of material promises",
  "Extraction-completeness audit for claims the machine candidate set missed",
  "Review of flagged, conflicting, missing, or high-impact items",
];
