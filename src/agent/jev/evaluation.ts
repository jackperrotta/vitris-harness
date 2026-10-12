import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceLedger } from "./ledger.ts";
import { tokensFromNestedUsage, loadAgentAttemptReceipts, aggregateAgentUsage, reconcileExpectedAttempts, expectedAttemptsFromWorkflow, selectAuthoritativeRunReceipt, type RunScopeMatch } from "./agent-usage.ts";

/**
 * Completion manifest for an empirical trial run.
 * Required for any run that claims qualityObserved=true.
 * Must be saved at the end of a real run with all observation artifacts present.
 *
 * Two numeric quality fields alone are not sufficient for qualityObserved=true —
 * the completion manifest must be loaded and verified.
 */
export interface CompletionManifest {
  schemaVersion: 1;
  treatmentId: "A" | "B" | "C";
  /** SHA-256 of the source content snapshot used during this trial run. */
  snapshotHash: string;
  /** Model used for all agent calls in this run. */
  model: string;
  /** Node.js version and platform at run time. */
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
  };
  /** True when the workflow completed to local dist/ preview without errors. */
  previewReady: boolean;
  /** Named quality checks that were directly observed (not self-asserted). */
  qualityChecks: Array<{
    name: string;
    observed: boolean;
    notes?: string;
  }>;
  /** ISO timestamp when this manifest was written. */
  observedAt: string;
}

export interface RunMetrics {
  runId: string;
  label: string;
  transportCalls: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  clockDurationMs: number;
  cacheHits: number;
  cacheReadTokens?: number;
  totalEvaluations: number;
  claimFidelityPct?: number; // [0, 100], undefined when unobserved
  criticIterations?: number;
  defectEscapeCount?: number;
  passedGatesCount?: number;
  failedGatesCount?: number;
  shortlistRecall?: number; // [0, 1]
  defectRate?: number; // [0, 1]
  qualityObserved?: boolean;
  model?: string;
  treatment?: "A" | "B" | "C";
  manifestPath?: string;
  /** SHA-256 of the completion manifest, if loaded and verified. */
  completionManifestHash?: string;
  usageCoverage?: "complete" | "partial" | "incomplete";
  agentInputTokens?: number;
  agentOutputTokens?: number;
  jevInputTokens?: number;
  jevOutputTokens?: number;
  jevCalls?: number;
  billedCostUsd?: number;
}

export interface RunComparisonDiff {
  transportCallReductionPct: number;
  tokenSavingsPct: number | null;
  durationReductionPct: number;
  qualityPreserved: boolean;
  notes: string[];
  measurementIncomplete?: boolean;
  agentTokenDelta?: number | null;
}

export interface CompareRunsOptions {
  qualityMargin?: number; // e.g. 0.05 for 5% allowable margin
}

export interface ComparativeReport {
  schemaVersion: 1;
  generatedAt: string;
  runs: {
    runA: RunMetrics;
    runB: RunMetrics;
    runC?: RunMetrics;
  };
  comparisons: {
    bVsA: RunComparisonDiff;
    cVsA?: RunComparisonDiff;
    cVsB?: RunComparisonDiff;
  };
  summary: string;
  verdict: "superior_efficiency_identical_quality" | "regression_detected" | "incomplete_quality_evidence" | "measurement_incomplete";
  /** Reasons the verdict was degraded to incomplete_quality_evidence, if applicable. */
  incompleteEvidenceReasons?: string[];
}

export interface TrialEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * Validates that two run metrics have matching completion manifests and observation artifacts,
 * and are eligible for comparative quality verdict.
 *
 * Rules for eligibility:
 * 1. Both runs must have manifestPath pointing to an existing file.
 * 2. Both completion manifests must have previewReady=true.
 * 3. Both must have matching environment (nodeVersion, platform) — different environments
 *    invalidate token/duration comparisons.
 * 4. Both must have matching snapshotHash — different source states invalidate quality comparison.
 * 5. Explicit treatment field must not contradict manifest treatmentId.
 * 6. qualityObserved must not be self-asserted via numeric fields alone — manifest required.
 */
export function validateTrialEligibility(runA: RunMetrics, runB: RunMetrics): TrialEligibilityResult {
  const reasons: string[] = [];

  // Rule 1: Both runs must have manifestPath to a readable completion manifest
  const manifestA = runA.manifestPath ? loadCompletionManifest(runA.manifestPath) : undefined;
  const manifestB = runB.manifestPath ? loadCompletionManifest(runB.manifestPath) : undefined;

  if (!manifestA) {
    reasons.push(`Run A ("${runA.runId}") has no readable completion manifest at "${runA.manifestPath || "(none)"}". qualityObserved cannot be independently confirmed without a manifest.`);
  }
  if (!manifestB) {
    reasons.push(`Run B ("${runB.runId}") has no readable completion manifest at "${runB.manifestPath || "(none)"}". qualityObserved cannot be independently confirmed without a manifest.`);
  }

  if (manifestA && manifestB) {
    // Rule 2: previewReady must be true
    if (!manifestA.previewReady) {
      reasons.push(`Run A completion manifest reports previewReady=false — run did not complete to a valid preview.`);
    }
    if (!manifestB.previewReady) {
      reasons.push(`Run B completion manifest reports previewReady=false — run did not complete to a valid preview.`);
    }

    // Rule 3: environments must match for token/duration comparisons
    if (manifestA.environment.nodeVersion !== manifestB.environment.nodeVersion ||
        manifestA.environment.platform !== manifestB.environment.platform) {
      reasons.push(
        `Environment mismatch between runs: A ran on Node ${manifestA.environment.nodeVersion}/${manifestA.environment.platform}, ` +
        `B ran on Node ${manifestB.environment.nodeVersion}/${manifestB.environment.platform}. Token and duration comparisons are unreliable.`
      );
    }

    // Rule 4: snapshotHash must match — same source content required
    if (manifestA.snapshotHash !== manifestB.snapshotHash) {
      reasons.push(
        `Source snapshot hash mismatch: A="${manifestA.snapshotHash.slice(0, 12)}...", B="${manifestB.snapshotHash.slice(0, 12)}...". ` +
        `Quality comparison across different source states is invalid.`
      );
    }

    // Rule 5: explicit treatment must not contradict manifest
    if (runA.treatment && runA.treatment !== manifestA.treatmentId) {
      reasons.push(`Run A.treatment="${runA.treatment}" contradicts manifest treatmentId="${manifestA.treatmentId}".`);
    }
    if (runB.treatment && runB.treatment !== manifestB.treatmentId) {
      reasons.push(`Run B.treatment="${runB.treatment}" contradicts manifest treatmentId="${manifestB.treatmentId}".`);
    }

    // Rule 6: duplicate/contradictory treatments — A and B must differ
    if (manifestA.treatmentId === manifestB.treatmentId) {
      reasons.push(`Both runs report the same treatmentId="${manifestA.treatmentId}". Comparative analysis requires distinct treatments.`);
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Loads a completion manifest from disk. Returns undefined if not found or malformed.
 */
export function loadCompletionManifest(manifestPath: string): CompletionManifest | undefined {
  if (!existsSync(manifestPath)) return undefined;
  try {
    const data = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (data?.schemaVersion !== 1 || !data.treatmentId || !data.snapshotHash) return undefined;
    return data as CompletionManifest;
  } catch {
    return undefined;
  }
}

/**
 * Single qualityObserved path for every metrics loader.
 * Numeric quality fields and caller flags never authorize qualityObserved=true
 * without a readable completion manifest with previewReady=true.
 */
export function resolveLoadedQuality(data: {
  manifestPath?: string;
  qualityObserved?: boolean;
}): { qualityObserved: boolean; completionManifestHash?: string } {
  if (!data.manifestPath) return { qualityObserved: false };
  const cm = loadCompletionManifest(data.manifestPath);
  if (!cm || !cm.previewReady) return { qualityObserved: false };
  if (data.qualityObserved !== true) return { qualityObserved: false, completionManifestHash: `${cm.treatmentId}:${cm.snapshotHash.slice(0, 16)}` };
  return {
    qualityObserved: true,
    completionManifestHash: `${cm.treatmentId}:${cm.snapshotHash.slice(0, 16)}`,
  };
}



/**
 * Computes comparative diff between a baseline run and an optimized run.
 * Asserts quality preservation: quality is preserved only if claim fidelity is >= baseline,
 * critic iterations <= baseline, and defect escapes <= baseline (adjusted by qualityMargin).
 * If quality was unobserved or missing for either run, quality cannot be established.
 */
export function agentUsageComplete(metrics: RunMetrics): boolean {
  if (metrics.usageCoverage === "incomplete") return false;
  if (metrics.usageCoverage === "partial") return false;
  return typeof metrics.inputTokens === "number"
    && typeof metrics.outputTokens === "number"
    && typeof metrics.totalTokens === "number";
}

/**
 * Computes comparative diff between a baseline run and an optimized run.
 * Asserts quality preservation: quality is preserved only if claim fidelity is >= baseline,
 * critic iterations <= baseline, and defect escapes <= baseline (adjusted by qualityMargin).
 * If quality was unobserved or missing for either run, quality cannot be established.
 */
export function compareRuns(
  baseline: RunMetrics,
  candidate: RunMetrics,
  opts?: CompareRunsOptions
): RunComparisonDiff {
  const margin = opts?.qualityMargin ?? 0.0;

  const transportDiff = baseline.transportCalls > 0
    ? Math.round(((baseline.transportCalls - candidate.transportCalls) / baseline.transportCalls) * 100)
    : 0;

  const measurementIncomplete = !agentUsageComplete(baseline) || !agentUsageComplete(candidate);
  const tokenDiff = !measurementIncomplete && (baseline.totalTokens || 0) > 0
    ? Math.round((((baseline.totalTokens || 0) - (candidate.totalTokens || 0)) / (baseline.totalTokens || 1)) * 100)
    : null;
  const agentTokenDelta = !measurementIncomplete && (baseline.inputTokens || 0) + (baseline.outputTokens || 0) > 0
    ? (((candidate.inputTokens || 0) + (candidate.outputTokens || 0)) - ((baseline.inputTokens || 0) + (baseline.outputTokens || 0))) / ((baseline.inputTokens || 0) + (baseline.outputTokens || 0))
    : null;

  const durationDiff = baseline.clockDurationMs > 0
    ? Math.round(((baseline.clockDurationMs - candidate.clockDurationMs) / baseline.clockDurationMs) * 100)
    : 0;

  const notes: string[] = [];
  if (measurementIncomplete) {
    notes.push("measurement_incomplete: agent usage coverage is incomplete; refusing a numerical savings claim.");
  }

  // Check whether quality is observed for both runs
  const qualityObserved =
    baseline.qualityObserved !== false &&
    candidate.qualityObserved !== false &&
    baseline.claimFidelityPct !== undefined &&
    candidate.claimFidelityPct !== undefined &&
    baseline.defectEscapeCount !== undefined &&
    candidate.defectEscapeCount !== undefined &&
    baseline.failedGatesCount !== undefined &&
    candidate.failedGatesCount !== undefined;

  if (!qualityObserved) {
    notes.push("Quality cannot be established: quality was not observed or verified independently for one or more runs.");
    return {
      transportCallReductionPct: transportDiff,
      tokenSavingsPct: tokenDiff,
      durationReductionPct: durationDiff,
      qualityPreserved: false,
      notes,
      measurementIncomplete,
      agentTokenDelta,
    };
  }

  // Quality invariants. Critic iteration count is workload, not quality:
  // fewer iterations can mean higher first-pass quality OR missed criticism.
  const minAllowedFidelity = baseline.claimFidelityPct! * (1 - margin);
  const claimFidelityMaintained = candidate.claimFidelityPct! >= minAllowedFidelity;
  const defectEscapesMaintained = candidate.defectEscapeCount! <= baseline.defectEscapeCount!;
  const gatesMaintained = candidate.failedGatesCount! <= baseline.failedGatesCount!;

  if (baseline.criticIterations !== undefined && candidate.criticIterations !== undefined) {
    notes.push(
      `Critic iterations (workload, not quality): candidate ${candidate.criticIterations} vs baseline ${baseline.criticIterations}. Fewer is not inherently better.`
    );
  }

  // Shortlist recall check
  let recallMaintained = true;
  if (baseline.shortlistRecall !== undefined && candidate.shortlistRecall !== undefined) {
    const minAllowedRecall = baseline.shortlistRecall * (1 - margin);
    recallMaintained = candidate.shortlistRecall >= minAllowedRecall;
    if (!recallMaintained) {
      notes.push(`Shortlist recall regressed: ${(candidate.shortlistRecall * 100).toFixed(1)}% vs baseline ${(baseline.shortlistRecall * 100).toFixed(1)}%`);
    }
  }

  // Defect rate check
  let defectRateMaintained = true;
  if (baseline.defectRate !== undefined && candidate.defectRate !== undefined) {
    const maxAllowedDefectRate = baseline.defectRate * (1 + margin);
    defectRateMaintained = candidate.defectRate <= maxAllowedDefectRate;
    if (!defectRateMaintained) {
      notes.push(`Defect rate increased: ${(candidate.defectRate * 100).toFixed(1)}% vs baseline ${(baseline.defectRate * 100).toFixed(1)}%`);
    }
  }

  const qualityPreserved = claimFidelityMaintained && defectEscapesMaintained && gatesMaintained && recallMaintained && defectRateMaintained;

  if (!claimFidelityMaintained) {
    notes.push(`Claim fidelity regressed: ${candidate.claimFidelityPct}% vs baseline ${baseline.claimFidelityPct}%`);
  }
  if (!defectEscapesMaintained) {
    notes.push(`Defect escape count increased: ${candidate.defectEscapeCount} vs baseline ${baseline.defectEscapeCount}`);
  }
  if (!gatesMaintained) {
    notes.push(`Failed quality gates increased: ${candidate.failedGatesCount} vs baseline ${baseline.failedGatesCount}`);
  }

  if (qualityPreserved) {
    notes.push(tokenDiff == null
      ? `Quality verified identical or superior; agent-token savings not computed because usage coverage is incomplete.`
      : `Quality verified identical or superior with ${tokenDiff}% token savings and ${transportDiff}% fewer transport calls.`);
  }

  return {
    transportCallReductionPct: transportDiff,
    tokenSavingsPct: tokenDiff,
    durationReductionPct: durationDiff,
    qualityPreserved,
    notes,
    measurementIncomplete,
    agentTokenDelta,
  };
}

/**
 * Produces matched evaluation across runs A/B/C.
 * Run A: Baseline unbatched
 * Run B: Bounded batching
 * Run C: Optimized with Ledger + Semantic Ranking + Factual Extraction
 */
export function compareRunMetrics(
  runA: RunMetrics,
  runB: RunMetrics,
  runC?: RunMetrics,
  opts?: CompareRunsOptions
): ComparativeReport {
  const bVsA = compareRuns(runA, runB, opts);
  let cVsA: RunComparisonDiff | undefined;
  let cVsB: RunComparisonDiff | undefined;

  let allPreserved = bVsA.qualityPreserved;

  if (runC) {
    cVsA = compareRuns(runA, runC, opts);
    cVsB = compareRuns(runB, runC, opts);
    allPreserved = allPreserved && cVsA.qualityPreserved && cVsB.qualityPreserved;
  }

  // P1 fix: run trial eligibility check. Missing or mismatched manifests force
  // incomplete_quality_evidence regardless of numeric quality fields.
  const eligibility = validateTrialEligibility(runA, runB);
  const incompleteEvidenceReasons: string[] = [...eligibility.reasons];

  const hasIncompleteQuality =
    !eligibility.eligible ||
    runA.qualityObserved === false ||
    runB.qualityObserved === false ||
    runC?.qualityObserved === false ||
    runA.claimFidelityPct === undefined ||
    runB.claimFidelityPct === undefined ||
    (runC !== undefined && runC.claimFidelityPct === undefined);

  const hasIncompleteMeasurement = !agentUsageComplete(runA) || !agentUsageComplete(runB) || (runC ? !agentUsageComplete(runC) : false);

  const verdict: ComparativeReport["verdict"] = hasIncompleteMeasurement
    ? "measurement_incomplete"
    : allPreserved && !hasIncompleteQuality
    ? "superior_efficiency_identical_quality"
    : hasIncompleteQuality
    ? "incomplete_quality_evidence"
    : "regression_detected";

  let summary = `Matched Evaluation Summary (${verdict}):\n`;
  summary += `- Run B vs Run A: ${bVsA.tokenSavingsPct}% token savings, ${bVsA.transportCallReductionPct}% fewer transport calls (Quality: ${bVsA.qualityPreserved ? "PASSED" : "FAILED"})\n`;
  if (cVsA && runC) {
    summary += `- Run C vs Run A: ${cVsA.tokenSavingsPct}% token savings, ${cVsA.transportCallReductionPct}% fewer transport calls (Quality: ${cVsA.qualityPreserved ? "PASSED" : "FAILED"})\n`;
  }
  if (incompleteEvidenceReasons.length > 0) {
    summary += `- Incomplete evidence: ${incompleteEvidenceReasons.join("; ")}\n`;
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runs: {
      runA,
      runB,
      runC,
    },
    comparisons: {
      bVsA,
      cVsA,
      cVsB,
    },
    summary,
    verdict,
    incompleteEvidenceReasons: incompleteEvidenceReasons.length > 0 ? incompleteEvidenceReasons : undefined,
  };
}


export function formatComparativeReport(report: ComparativeReport): string {
  let text = `# Matched Evaluation Report\n`;
  text += `**Verdict**: \`${report.verdict}\`\n`;
  text += `**Generated**: ${report.generatedAt}\n\n`;

  text += `| Metric | Run A (Baseline) | Run B (Batched) | ${report.runs.runC ? "Run C (Ledger+Ranked)" : ""} |\n`;
  text += `|---|---|---|${report.runs.runC ? "---|" : ""}\n`;
  text += `| Transport Calls | ${report.runs.runA.transportCalls} | ${report.runs.runB.transportCalls} | ${report.runs.runC?.transportCalls ?? "-"} |\n`;
  text += `| Total Tokens | ${report.runs.runA.totalTokens != null ? report.runs.runA.totalTokens.toLocaleString() : "unknown"} | ${report.runs.runB.totalTokens != null ? report.runs.runB.totalTokens.toLocaleString() : "unknown"} | ${report.runs.runC?.totalTokens != null ? report.runs.runC.totalTokens.toLocaleString() : "-"} |\n`;
  text += `| Clock Duration (ms) | ${report.runs.runA.clockDurationMs}ms | ${report.runs.runB.clockDurationMs}ms | ${report.runs.runC?.clockDurationMs ?? "-"}ms |\n`;
  text += `| Claim Fidelity | ${report.runs.runA.claimFidelityPct !== undefined ? `${report.runs.runA.claimFidelityPct}%` : "-"} | ${report.runs.runB.claimFidelityPct !== undefined ? `${report.runs.runB.claimFidelityPct}%` : "-"} | ${report.runs.runC?.claimFidelityPct !== undefined ? `${report.runs.runC.claimFidelityPct}%` : "-"} |\n`;
  text += `| Critic Iterations | ${report.runs.runA.criticIterations ?? "-"} | ${report.runs.runB.criticIterations ?? "-"} | ${report.runs.runC?.criticIterations ?? "-"} |\n`;
  text += `| Defect Escapes | ${report.runs.runA.defectEscapeCount ?? "-"} | ${report.runs.runB.defectEscapeCount ?? "-"} | ${report.runs.runC?.defectEscapeCount ?? "-"} |\n`;
  if (report.runs.runA.shortlistRecall !== undefined || report.runs.runB.shortlistRecall !== undefined || report.runs.runC?.shortlistRecall !== undefined) {
    text += `| Shortlist Recall | ${report.runs.runA.shortlistRecall !== undefined ? `${(report.runs.runA.shortlistRecall * 100).toFixed(1)}%` : "-"} | ${report.runs.runB.shortlistRecall !== undefined ? `${(report.runs.runB.shortlistRecall * 100).toFixed(1)}%` : "-"} | ${report.runs.runC?.shortlistRecall !== undefined ? `${(report.runs.runC.shortlistRecall * 100).toFixed(1)}%` : "-"} |\n`;
  }
  if (report.runs.runA.defectRate !== undefined || report.runs.runB.defectRate !== undefined || report.runs.runC?.defectRate !== undefined) {
    text += `| Defect Rate | ${report.runs.runA.defectRate !== undefined ? `${(report.runs.runA.defectRate * 100).toFixed(1)}%` : "-"} | ${report.runs.runB.defectRate !== undefined ? `${(report.runs.runB.defectRate * 100).toFixed(1)}%` : "-"} | ${report.runs.runC?.defectRate !== undefined ? `${(report.runs.runC.defectRate * 100).toFixed(1)}%` : "-"} |\n`;
  }
  text += `\n`;

  text += `### Comparison Notes:\n`;
  for (const n of report.comparisons.bVsA.notes) text += `- (Run B vs A): ${n}\n`;
  if (report.comparisons.cVsA) {
    for (const n of report.comparisons.cVsA.notes) text += `- (Run C vs A): ${n}\n`;
  }

  return text;
}

/**
 * Loads RunMetrics from a trial directory.
 * Supports:
 * - Direct RunMetrics JSON files (run-A.json, run-B.json, run-C.json, metrics.json)
 * - trials.json generated by scripts/trial.ts
 * - Subdirectories with agent/runs/*.usage.json
 */
function metricsFromLoaded(data: any, fallbackId: string): RunMetrics | undefined {
  const nested = tokensFromNestedUsage(data);
  const inputTokens = typeof data.inputTokens === "number" ? data.inputTokens : nested.inputTokens;
  const outputTokens = typeof data.outputTokens === "number" ? data.outputTokens : nested.outputTokens;
  const totalTokens = typeof data.totalTokens === "number" ? data.totalTokens
    : (typeof inputTokens === "number" || typeof outputTokens === "number")
      ? (inputTokens || 0) + (outputTokens || 0)
      : nested.totalTokens;
  const unknown = nested.unknown || data.usageCoverage === "incomplete" || data.coverage === "unknown";
  const hasTransport = typeof data.transportCalls === "number" || typeof data.totalTokens === "number" || typeof inputTokens === "number" || unknown;
  if (!hasTransport && data.transportCalls == null && totalTokens == null && !unknown) return undefined;
  const complete = !unknown && typeof inputTokens === "number" && typeof outputTokens === "number" && typeof totalTokens === "number";
  const quality = resolveLoadedQuality(data);
  return {
    runId: data.runId || fallbackId,
    label: data.label || fallbackId,
    transportCalls: typeof data.transportCalls === "number" ? data.transportCalls : 0,
    inputTokens: unknown ? undefined : inputTokens,
    outputTokens: unknown ? undefined : outputTokens,
    totalTokens: unknown ? undefined : totalTokens,
    clockDurationMs: data.clockDurationMs ?? data.durationMs ?? 0,
    cacheHits: data.cacheHits ?? 0,
    cacheReadTokens: typeof data.cacheReadTokens === "number" ? data.cacheReadTokens : nested.cacheReadTokens,
    totalEvaluations: data.totalEvaluations ?? 0,
    claimFidelityPct: typeof data.claimFidelityPct === "number" ? data.claimFidelityPct : undefined,
    criticIterations: typeof data.criticIterations === "number" ? data.criticIterations : undefined,
    defectEscapeCount: typeof data.defectEscapeCount === "number" ? data.defectEscapeCount : undefined,
    passedGatesCount: typeof data.passedGatesCount === "number" ? data.passedGatesCount : undefined,
    failedGatesCount: typeof data.failedGatesCount === "number" ? data.failedGatesCount : undefined,
    shortlistRecall: typeof data.shortlistRecall === "number" ? data.shortlistRecall : undefined,
    defectRate: typeof data.defectRate === "number" ? data.defectRate : undefined,
    qualityObserved: quality.qualityObserved,
    completionManifestHash: quality.completionManifestHash,
    model: data.model,
    treatment: data.treatment,
    manifestPath: data.manifestPath,
    usageCoverage: unknown ? "incomplete" : complete ? "complete" : "incomplete",
    agentInputTokens: unknown ? undefined : inputTokens,
    agentOutputTokens: unknown ? undefined : outputTokens,
    jevInputTokens: typeof data.jevInputTokens === "number" ? data.jevInputTokens : undefined,
    jevOutputTokens: typeof data.jevOutputTokens === "number" ? data.jevOutputTokens : undefined,
    jevCalls: typeof data.jevCalls === "number" ? data.jevCalls : undefined,
    billedCostUsd: typeof data.billedCostUsd === "number" ? data.billedCostUsd : undefined,
  };
}

export function loadTrialMetrics(trialDir: string): {
  runA?: RunMetrics;
  runB?: RunMetrics;
  runC?: RunMetrics;
  runs: RunMetrics[];
} {
  if (!existsSync(trialDir)) {
    return { runs: [] };
  }

  const runs: RunMetrics[] = [];
  const entries = readdirSync(trialDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "trials.json") {
      try {
        const data = JSON.parse(readFileSync(join(trialDir, entry.name), "utf8"));
        const metrics = metricsFromLoaded(data, entry.name.replace(/\.json$/, ""));
        if (metrics) runs.push(metrics);
      } catch {
        // ignore parse error
      }
    } else if (entry.isDirectory()) {
      const subMetricsPath = join(trialDir, entry.name, "metrics.json");
      if (existsSync(subMetricsPath)) {
        try {
          const data = JSON.parse(readFileSync(subMetricsPath, "utf8"));
          const metrics = metricsFromLoaded(data, entry.name);
          if (metrics) {
            runs.push(metrics);
            continue;
          }
        } catch {
          // ignore
        }
      }

      // Usage receipts are the only measured agent-token source for site roots.
      const usageDir = join(trialDir, entry.name, "agent/runs/usage");
      if (existsSync(usageDir)) {
        const receipts = loadAgentAttemptReceipts(join(trialDir, entry.name));
        const expected = expectedAttemptsFromWorkflow(join(trialDir, entry.name));
        const recon = reconcileExpectedAttempts(receipts, expected.length ? expected : receipts.filter(r => r.kind !== "tool").map(r => ({ nodeId: r.nodeId, kind: r.kind })));
        const agg = aggregateAgentUsage(receipts, expected.map(e => e.nodeId));
        const complete = recon.coverage === "complete" && (agg.coverage === "measured" || receipts.some(r => r.nodeId === "_run" && r.coverage === "measured"));
        runs.push({
          runId: entry.name,
          label: `Run Directory: ${entry.name}`,
          transportCalls: receipts.length,
          inputTokens: complete ? agg.inputTokens : undefined,
          outputTokens: complete ? agg.outputTokens : undefined,
          totalTokens: complete && agg.inputTokens != null && agg.outputTokens != null ? agg.inputTokens + agg.outputTokens : undefined,
          clockDurationMs: 0,
          cacheHits: 0,
          cacheReadTokens: agg.cacheReadTokens,
          totalEvaluations: 0,
          qualityObserved: false,
          usageCoverage: complete ? "complete" : "incomplete",
          agentInputTokens: complete ? agg.inputTokens : undefined,
          agentOutputTokens: complete ? agg.outputTokens : undefined,
        });
        continue;
      }

      // Check for usage files under entry.name/agent/runs/
      const usageDirs = [
        join(trialDir, entry.name, "agent/runs"),
        join(trialDir, entry.name, "agent/runs/usage"),
      ];
      for (const usageDir of usageDirs) {
        if (!existsSync(usageDir)) continue;
        try {
          const uFiles = readdirSync(usageDir).filter(f => f.endsWith(".usage.json") || f.endsWith(".json"));
          if (uFiles.length === 0) continue;
          let inTokens = 0;
          let outTokens = 0;
          let durationMs = 0;
          let cacheReadTokens = 0;
          let unknown = false;
          let sawTokens = false;
          let model: string | undefined;
          const seen = new Set<string>();
          for (const uf of uFiles) {
            try {
              const ud = JSON.parse(readFileSync(join(usageDir, uf), "utf8"));
              const id = ud.receiptId || uf;
              if (seen.has(id)) continue;
              seen.add(id);
              const nested = tokensFromNestedUsage(ud);
              if (nested.unknown) unknown = true;
              if (typeof nested.inputTokens === "number") { inTokens += nested.inputTokens; sawTokens = true; }
              if (typeof nested.outputTokens === "number") { outTokens += nested.outputTokens; sawTokens = true; }
              if (typeof ud.durationMs === "number") durationMs += ud.durationMs;
              if (typeof nested.cacheReadTokens === "number") cacheReadTokens += nested.cacheReadTokens;
              if (!model && typeof ud.model === "string") model = ud.model;
            } catch { /* ignore */ }
          }
          runs.push({
            runId: entry.name,
            label: `Run Directory: ${entry.name}`,
            transportCalls: seen.size,
            inputTokens: unknown ? undefined : (sawTokens ? inTokens : undefined),
            outputTokens: unknown ? undefined : (sawTokens ? outTokens : undefined),
            totalTokens: unknown ? undefined : (sawTokens ? inTokens + outTokens : undefined),
            clockDurationMs: durationMs,
            cacheHits: 0,
            cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
            totalEvaluations: 0,
            qualityObserved: false,
            model,
            usageCoverage: unknown || !sawTokens ? "incomplete" : "complete",
            agentInputTokens: unknown ? undefined : (sawTokens ? inTokens : undefined),
            agentOutputTokens: unknown ? undefined : (sawTokens ? outTokens : undefined),
          });
          break;
        } catch { /* ignore */ }
      }
    }
  }

  // Check trials.json
  const trialsPath = join(trialDir, "trials.json");
  if (existsSync(trialsPath)) {
    try {
      const trialsData = JSON.parse(readFileSync(trialsPath, "utf8"));
      if (Array.isArray(trialsData.results)) {
        for (const res of trialsData.results) {
          const runId = res.runId || `run-${res.index ?? runs.length + 1}`;
          if (!runs.some(r => r.runId === runId)) {
            const quality = resolveLoadedQuality({
              manifestPath: res.manifestPath,
              qualityObserved: res.qualityObserved,
            });
            const nested = tokensFromNestedUsage(res);
            const unknown = nested.unknown;
            runs.push({
              runId,
              label: res.label || `Trial Run ${res.index ?? runs.length + 1}`,
              transportCalls: res.iterations ?? (res.transportCalls ?? 1),
              inputTokens: unknown ? undefined : (nested.inputTokens ?? res.inputTokens),
              outputTokens: unknown ? undefined : (nested.outputTokens ?? res.outputTokens),
              totalTokens: unknown ? undefined : (nested.totalTokens ?? res.totalTokens),
              clockDurationMs: res.durationMs ?? (res.clockDurationMs ?? 0),
              cacheHits: res.cacheHits ?? 0,
              cacheReadTokens: res.usage?.cacheReadTokens ?? res.cacheReadTokens,
              totalEvaluations: res.totalEvaluations ?? 0,
              claimFidelityPct: typeof res.claimFidelityPct === "number" ? res.claimFidelityPct : undefined,
              criticIterations: typeof res.criticIterations === "number" ? res.criticIterations : undefined,
              defectEscapeCount: typeof res.defectEscapeCount === "number" ? res.defectEscapeCount : undefined,
              passedGatesCount: typeof res.passedGatesCount === "number" ? res.passedGatesCount : undefined,
              failedGatesCount: typeof res.failedGatesCount === "number" ? res.failedGatesCount : undefined,
              shortlistRecall: typeof res.shortlistRecall === "number" ? res.shortlistRecall : undefined,
              defectRate: typeof res.defectRate === "number" ? res.defectRate : undefined,
              qualityObserved: quality.qualityObserved,
              completionManifestHash: quality.completionManifestHash,
              model: res.model,
              treatment: res.treatment,
              manifestPath: res.manifestPath,
              usageCoverage: unknown || nested.inputTokens == null || nested.outputTokens == null ? "incomplete" : "complete",
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // Sort and match runs by explicit treatment only. Name regex is used only when
  // a single unique match exists and does not collide with another treatment.
  const byExplicit = (letter: "A" | "B" | "C") => runs.filter(r => r.treatment === letter);
  const pick = (letter: "A" | "B" | "C", re: RegExp): RunMetrics | undefined => {
    const explicit = byExplicit(letter);
    if (explicit.length === 1) return explicit[0];
    if (explicit.length > 1) return undefined;
    const named = runs.filter(r => re.test(r.runId) || re.test(r.label));
    if (named.length !== 1) return undefined;
    return named[0];
  };
  const runA = pick("A", /run-?a|treatment-?a\b/i);
  const runB = pick("B", /run-?b|treatment-?b\b/i);
  const runC = pick("C", /run-?c|treatment-?c\b/i);
  if (runA && runB && runA.runId === runB.runId) return { runs };
  if (runA && runC && runA.runId === runC.runId) return { runB, runs };
  if (runB && runC && runB.runId === runC.runId) return { runA, runs };

  return { runA, runB, runC, runs };
}

export function loadArmUsageMetrics(siteRoot: string, expectedNodes?: Array<{ nodeId: string; kind: "agent" | "critic" | "tool"; preparationId?: string; attemptId?: string }>, scope?: RunScopeMatch): {
  coverage: "complete" | "incomplete";
  inputTokens?: number;
  outputTokens?: number;
  missing: string[];
  runLevel?: boolean;
} {
  const receipts = loadAgentAttemptReceipts(siteRoot);
  const expected = expectedNodes && expectedNodes.length ? expectedNodes : expectedAttemptsFromWorkflow(siteRoot);
  const selected = selectAuthoritativeRunReceipt(receipts, scope);
  if (selected.conflict) return { coverage: "incomplete", missing: ["conflicting_run_receipt"], runLevel: true };
  if (scope && receipts.some(receipt => receipt.nodeId === "_run") && !selected.receipt) {
    return { coverage: "incomplete", missing: ["run_scope_mismatch"], runLevel: true };
  }
  if (selected.receipt) {
    if (!Number.isFinite(selected.receipt.inputTokens) || !Number.isFinite(selected.receipt.outputTokens)) {
      return { coverage: "incomplete", missing: ["run_tokens"], runLevel: true };
    }
    return {
      coverage: "complete",
      inputTokens: selected.receipt.inputTokens,
      outputTokens: selected.receipt.outputTokens,
      missing: [],
      runLevel: true,
    };
  }
  const recon = reconcileExpectedAttempts(receipts, expected);
  const agg = aggregateAgentUsage(receipts, expected.map(n => n.nodeId), scope);
  if (recon.coverage !== "complete" || agg.coverage !== "measured"
    || typeof agg.inputTokens !== "number" || typeof agg.outputTokens !== "number"
    || !Number.isFinite(agg.inputTokens) || !Number.isFinite(agg.outputTokens)) {
    return { coverage: "incomplete", missing: recon.missing, runLevel: false };
  }
  return {
    coverage: "complete",
    inputTokens: agg.inputTokens,
    outputTokens: agg.outputTokens,
    missing: [],
    runLevel: false,
  };
}

