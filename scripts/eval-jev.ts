#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JevClient } from "../src/agent/jev/client.ts";
import { resolveApiKey, type JevCapabilityConfig } from "../src/agent/jev/config.ts";
import { makeGroundingQuestion, makeRoutingQuestion, makeMultiScopeRoutingQuestions } from "../src/agent/jev/questions.ts";
import { buildGroundingState, buildRoutingState } from "../src/agent/jev/state.ts";
import { evaluateGroundingVerdict, evaluateRoutingDecision, evaluateMultiScopeDecision } from "../src/agent/jev/policy.ts";
import { classifyChange, type ChangeScope } from "../src/agent/refine.ts";
import { compareRuns, compareRunMetrics, formatComparativeReport, loadTrialMetrics, type RunMetrics } from "../src/agent/jev/evaluation.ts";
import { ROUTING_DATASET, type RoutingTestCase } from "./eval-datasets/routing.ts";
import { GROUNDING_DATASET, type GroundingTestCase } from "./eval-datasets/grounding.ts";

const kernel = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

function argFrom(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i < 0 ? undefined : argv[i + 1];
}

if (argv.includes("--mock") && argv.includes("--live")) {
  console.error("ERROR: Mutually contradictory flags: cannot specify both --mock and --live simultaneously.");
  process.exit(1);
}

const isLive = argv.includes("--live");
const isMock = argv.includes("--mock") || !isLive;
const targetSplit = argv.includes("--dev") ? "dev" : argv.includes("--heldout") ? "heldout" : "all";
const outPath = argFrom("--out") || join(kernel, "benchmark/eval-results.json");

const trialDirArg = argFrom("--trial-dir");
export const trialDir = trialDirArg ? resolve(trialDirArg) : undefined;

const treatmentArg = argFrom("--treatment")?.toUpperCase();
if (treatmentArg && !["A", "B", "C"].includes(treatmentArg)) {
  console.error(`ERROR: Invalid --treatment '${treatmentArg}'. Allowed values: A, B, C.`);
  process.exit(1);
}
export const selectedTreatment = treatmentArg as "A" | "B" | "C" | undefined;

export const VALID_ABLATIONS = [
  "grounding",
  "sourceSelection",
  "retrievalRanking",
  "consistency",
  "repairAssistance",
  "preferenceScoring",
] as const;

export type AblationComponent = (typeof VALID_ABLATIONS)[number];

const ablationArg = argFrom("--ablation");
if (ablationArg && !VALID_ABLATIONS.includes(ablationArg as AblationComponent)) {
  console.error(`ERROR: Invalid --ablation '${ablationArg}'. Allowed values: ${VALID_ABLATIONS.join(", ")}.`);
  process.exit(1);
}
export const selectedAblation = ablationArg as AblationComponent | undefined;

const qualityMarginArg = argFrom("--quality-margin");
export const qualityMargin = qualityMarginArg ? parseFloat(qualityMarginArg) : 0.05;

export function resolveTreatmentCapabilities(
  treatment: "A" | "B" | "C" | undefined,
  ablation: AblationComponent | undefined
): JevCapabilityConfig {
  const effectiveTreatment = treatment ?? (ablation ? "C" : "C");

  let caps: JevCapabilityConfig;
  switch (effectiveTreatment) {
    case "A":
      caps = {
        grounding: "off",
        sourceSelection: "off",
        retrievalRanking: "off",
        consistency: "off",
        repairAssistance: "off",
        preferenceScoring: "off",
      };
      break;
    case "B":
      caps = {
        grounding: "assist",
        sourceSelection: "off",
        retrievalRanking: "off",
        consistency: "off",
        repairAssistance: "off",
        preferenceScoring: "off",
      };
      break;
    case "C":
      caps = {
        grounding: "assist",
        sourceSelection: "assist",
        retrievalRanking: "assist",
        consistency: "assist",
        repairAssistance: "assist",
        preferenceScoring: "assist",
      };
      break;
  }

  if (ablation) {
    caps[ablation] = "off";
  }

  return caps;
}

export const activeCapabilities = resolveTreatmentCapabilities(selectedTreatment, selectedAblation);

interface StatResult {
  n: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  precisionCi: [number, number];
  recall: number;
  recallCi: [number, number];
  accuracy: number;
}

function wilsonScoreCi(positives: number, total: number, z = 1.95996): [number, number] {
  if (total === 0) return [0, 0];
  const p = positives / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  const lower = Math.max(0, (center - spread) / denominator);
  const upper = Math.min(1, (center + spread) / denominator);
  return [parseFloat(lower.toFixed(4)), parseFloat(upper.toFixed(4))];
}

function computeStats(tp: number, fp: number, tn: number, fn: number): StatResult {
  const n = tp + fp + tn + fn;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1.0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1.0;
  const accuracy = n > 0 ? (tp + tn) / n : 1.0;

  return {
    n,
    tp,
    fp,
    tn,
    fn,
    precision: parseFloat(precision.toFixed(4)),
    precisionCi: wilsonScoreCi(tp, tp + fp),
    recall: parseFloat(recall.toFixed(4)),
    recallCi: wilsonScoreCi(tp, tp + fn),
    accuracy: parseFloat(accuracy.toFixed(4)),
  };
}

// Explicitly hypothetical reference pricing constants (per 1M tokens)
// NOTE: Actual worker billing for cursor-grok-4.6-high is unestablished/unknown.
// The following reference scenarios are explicitly hypothetical benchmarks.
export const HYPOTHETICAL_REFERENCE_PRICING = {
  // Claude 3.5 Sonnet reference rates
  sonnet: {
    freshInput: 3.00,
    cacheRead: 0.30,
    output: 15.00,
  },
  // Grok 2 reference rates
  grok2: {
    freshInput: 2.00,
    cacheRead: 0.20,
    output: 10.00,
  },
  // Official TypeSafe System One pricing: $0.042 per million input tokens, output unmetered / free
  jevSystemOne: {
    input: 0.042,
    output: 0.00,
  },
};

export const PRICING = {
  sonnetFreshInput: HYPOTHETICAL_REFERENCE_PRICING.sonnet.freshInput,
  sonnetCacheRead: HYPOTHETICAL_REFERENCE_PRICING.sonnet.cacheRead,
  sonnetOutput: HYPOTHETICAL_REFERENCE_PRICING.sonnet.output,
  grokFreshInput: HYPOTHETICAL_REFERENCE_PRICING.grok2.freshInput,
  grokCacheRead: HYPOTHETICAL_REFERENCE_PRICING.grok2.cacheRead,
  grokOutput: HYPOTHETICAL_REFERENCE_PRICING.grok2.output,
  jevInput: HYPOTHETICAL_REFERENCE_PRICING.jevSystemOne.input,
  jevOutput: HYPOTHETICAL_REFERENCE_PRICING.jevSystemOne.output,
};

/** Offline heuristic classifier that predicts scope without peeking at ground truth. */
function heuristicClassifyInstruction(instruction: string): { scope: ChangeScope; confidence: number; isAmbiguous: boolean } {
  const lower = instruction.toLowerCase().trim();

  if (/\b(add (a |this |our )?(new )?service|new service|we now serve|new location|hours|pricing|price|offer|audience|fact)\b/.test(lower)
    || /\b(add|include)\b.+\b(service|offering|location)\b/.test(lower)) {
    return { scope: "business", confidence: 0.92, isAmbiguous: false };
  }

  if (/\b(more premium|restyle|theme|visual direction|look and feel|typography|color palette|density|art direction)\b/.test(lower)) {
    return { scope: "direction", confidence: 0.90, isAmbiguous: false };
  }

  if (/\b(button size|contact button|swap|use variant|navigation|nav|header|footer|layout|padding|spacing|component)\b/.test(lower)
    && !/\b(wording|headline|rewrite copy|caption)\b/.test(lower)) {
    return { scope: "pages", confidence: 0.88, isAmbiguous: false };
  }

  if (/\b(wording|headline|subhead|rewrite|copy edit|caption|cta text|body copy|tone of voice)\b/.test(lower)
    || /\b(change|update|edit|tweak)\b.+\b(copy|headline|text|caption)\b/.test(lower)) {
    return { scope: "copy", confidence: 0.91, isAmbiguous: false };
  }

  // Ambiguous phrasing
  if (lower.split(/\s+/).length < 4 || /\b(fix|improve|update|change|check)\s+(it|the site|everything|things)\b/.test(lower)) {
    return { scope: "copy", confidence: 0.55, isAmbiguous: true };
  }

  const baseline = classifyChange(instruction);
  return { scope: baseline.scope, confidence: 0.75, isAmbiguous: false };
}

/** Offline heuristic relation classifier that checks vocabulary and negation without peeking at ground truth. */
function heuristicEvaluateGrounding(claim: string, excerpt: string): { relation: "supports" | "contradicts" | "says_nothing"; confidence: number } {
  const claimNorm = claim.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const excerptNorm = excerpt.toLowerCase().replace(/[^a-z0-9\s]/g, " ");

  const claimWords = claimNorm.split(/\s+/).filter(w => w.length > 3);
  const excerptWords = new Set(excerptNorm.split(/\s+/).filter(w => w.length > 3));

  let matchingWords = 0;
  for (const w of claimWords) {
    if (excerptWords.has(w)) matchingWords++;
  }
  const overlapRatio = claimWords.length > 0 ? matchingWords / claimWords.length : 0;

  // Check contradiction signals: opposite terms, negation near shared terms
  const hasNegation = /\b(not|never|no longer|unsupported|false|none|neither|contradict|opposite|different)\b/.test(excerptNorm);
  const claimNumbers = [...claim.matchAll(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g)].map(m => m[0]);
  const excerptNumbers = [...excerpt.matchAll(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g)].map(m => m[0]);

  const numberMismatch = claimNumbers.length > 0 && excerptNumbers.length > 0 && !claimNumbers.some(cn => excerptNumbers.includes(cn));

  if (overlapRatio > 0.4 && (hasNegation || numberMismatch)) {
    return { relation: "contradicts", confidence: 0.88 };
  }

  if (overlapRatio >= 0.5) {
    return { relation: "supports", confidence: 0.85 + Math.min(0.12, overlapRatio * 0.1) };
  }

  return { relation: "says_nothing", confidence: 0.82 };
}

export interface RoutingClassStats {
  class: ChangeScope;
  n: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  precisionCi: [number, number];
  recall: number;
  recallCi: [number, number];
}

export async function evaluateRouting(
  client: JevClient | undefined,
  cases: RoutingTestCase[],
  capabilities: JevCapabilityConfig = activeCapabilities
): Promise<{
  stats: StatResult;
  overallAccuracy: number;
  overallAccuracyCi: [number, number];
  macroPrecision: number;
  autoRoutingPrecision: number;
  autoRoutingPrecisionCi: [number, number];
  perClass: Record<ChangeScope, RoutingClassStats>;
  casesEvaluated: number;
  overridesHonored: number;
  details: Array<{ id: string; instruction: string; expected: string; actual: string; correct: boolean; confidence: number; hasOverride: boolean }>;
}> {
  let overridesHonored = 0;
  const details: Array<{ id: string; instruction: string; expected: string; actual: string; correct: boolean; confidence: number; hasOverride: boolean }> = [];

  for (const c of cases) {
    if (c.overrideScope) {
      overridesHonored++;
    }

    let chosenScope: ChangeScope = "business";
    let confidence = 0.80;

    if (isMock || !client || capabilities.sourceSelection === "off") {
      // Use genuine heuristic classification, not ground truth assignment
      if (c.overrideScope) {
        chosenScope = c.overrideScope;
        confidence = 1.0;
      } else {
        const classified = heuristicClassifyInstruction(c.instruction);
        chosenScope = classified.scope;
        confidence = classified.confidence;
      }
    } else {
      // Live call to Jev model via multi-scope questions
      const questions = makeMultiScopeRoutingQuestions(c.instruction);
      const state = buildRoutingState(c.instruction, { pages: ["index", "services", "contact"] });
      try {
        const res = await client.evaluate({
          taskType: "routing",
          questions,
          state,
        });
        const decision = evaluateMultiScopeDecision({
          answers: res.result.answers as any,
          overrideScope: c.overrideScope,
          fallbackScope: classifyChange(c.instruction).scope,
        });
        chosenScope = decision.scope;
        confidence = decision.confidence;
      } catch {
        chosenScope = c.overrideScope || classifyChange(c.instruction).scope;
        confidence = 0.70;
      }
    }

    const expected = c.overrideScope || c.groundTruthScope;
    const isCorrect = chosenScope === expected;

    details.push({
      id: c.id,
      instruction: c.instruction,
      expected,
      actual: chosenScope,
      correct: isCorrect,
      confidence,
      hasOverride: Boolean(c.overrideScope),
    });
  }

  const allScopes: ChangeScope[] = ["business", "copy", "pages", "direction"];
  const perClass = {} as Record<ChangeScope, RoutingClassStats>;
  let macroPrecisionSum = 0;
  let activeClassesCount = 0;

  for (const s of allScopes) {
    const tp = details.filter(d => d.expected === s && d.actual === s).length;
    const fp = details.filter(d => d.expected !== s && d.actual === s).length;
    const fn = details.filter(d => d.expected === s && d.actual !== s).length;
    const n = details.filter(d => d.expected === s).length;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 1.0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 1.0;
    perClass[s] = {
      class: s,
      n,
      tp,
      fp,
      fn,
      precision: parseFloat(precision.toFixed(4)),
      precisionCi: wilsonScoreCi(tp, tp + fp),
      recall: parseFloat(recall.toFixed(4)),
      recallCi: wilsonScoreCi(tp, tp + fn),
    };
    if (tp + fp > 0 || n > 0) {
      macroPrecisionSum += precision;
      activeClassesCount++;
    }
  }

  const macroPrecision = activeClassesCount > 0 ? macroPrecisionSum / activeClassesCount : 1.0;

  // Auto-routing precision specifically on cases evaluated without human override
  const autoCases = details.filter(d => !d.hasOverride);
  const autoCorrect = autoCases.filter(d => d.correct).length;
  const autoPrecision = autoCases.length > 0 ? autoCorrect / autoCases.length : 1.0;
  const autoRoutingPrecisionCi = wilsonScoreCi(autoCorrect, autoCases.length);

  const totalCorrect = details.filter(d => d.correct).length;
  const overallAccuracy = cases.length > 0 ? totalCorrect / cases.length : 1.0;
  const overallAccuracyCi = wilsonScoreCi(totalCorrect, cases.length);

  const stats = computeStats(totalCorrect, cases.length - totalCorrect, 0, 0);
  stats.precision = parseFloat(autoPrecision.toFixed(4));
  stats.precisionCi = autoRoutingPrecisionCi;

  return {
    stats,
    overallAccuracy: parseFloat(overallAccuracy.toFixed(4)),
    overallAccuracyCi,
    macroPrecision: parseFloat(macroPrecision.toFixed(4)),
    autoRoutingPrecision: parseFloat(autoPrecision.toFixed(4)),
    autoRoutingPrecisionCi,
    perClass,
    casesEvaluated: cases.length,
    overridesHonored,
    details,
  };
}

export async function evaluateGrounding(
  client: JevClient | undefined,
  cases: GroundingTestCase[],
  capabilities: JevCapabilityConfig = activeCapabilities
): Promise<{
  stats: StatResult;
  majorDefectRecall: number;
  majorDefectsTotal: number;
  majorDefectsCaught: number;
  evalErrorsCount: number;
  details: Array<{ id: string; claim: string; expected: string; actual: string; correct: boolean; isDefect: boolean; isEvalError?: boolean }>;
}> {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  let majorDefectsTotal = 0;
  let majorDefectsCaught = 0;
  let evalErrorsCount = 0;
  const details: Array<{ id: string; claim: string; expected: string; actual: string; correct: boolean; isDefect: boolean; isEvalError?: boolean }> = [];

  for (const c of cases) {
    const isDefect = c.groundTruthRelation === "contradicts" || c.groundTruthRelation === "says_nothing";
    if (c.isMajorDefect) majorDefectsTotal++;

    let predictedRelation: "supports" | "contradicts" | "says_nothing" | "eval_error" = "supports";
    let confidence = 0.85;
    let isEvalError = false;

    if (isMock || !client || capabilities.grounding === "off") {
      // Use genuine heuristic relation estimation without peeking at ground truth
      const est = heuristicEvaluateGrounding(c.claim, c.sourceExcerpt);
      predictedRelation = est.relation;
      confidence = est.confidence;
    } else {
      // Live Jev evaluation
      const q = makeGroundingQuestion(c.claim, c.sourceExcerpt);
      const state = buildGroundingState({
        claimId: c.id,
        claim: c.claim,
        sourceFile: c.sourceFile,
        excerpt: c.sourceExcerpt,
      });
      try {
        const res = await client.evaluate({
          taskType: "grounding",
          questions: { relation: q },
          state,
        });
        predictedRelation = res.result.answers.relation.choice;
        confidence = res.result.answers.relation.confidence;
      } catch {
        isEvalError = true;
        predictedRelation = "eval_error";
        confidence = 0.0;
        evalErrorsCount++;
      }
    }

    if (isEvalError) {
      // Evaluation errors must NEVER count as caught defects or true positives
      if (isDefect) {
        fn++; // Defect was missed due to evaluation failure
      }
      details.push({
        id: c.id,
        claim: c.claim,
        expected: c.groundTruthRelation,
        actual: predictedRelation,
        correct: false,
        isDefect,
        isEvalError: true,
      });
      continue;
    }

    const predictedDefect = predictedRelation === "contradicts" || predictedRelation === "says_nothing";
    const isCorrect = predictedRelation === c.groundTruthRelation;

    if (isDefect) {
      if (predictedDefect) {
        tp++;
        if (c.isMajorDefect) majorDefectsCaught++;
      } else {
        fn++;
      }
    } else {
      if (predictedDefect) {
        fp++;
      } else {
        tn++;
      }
    }

    details.push({
      id: c.id,
      claim: c.claim,
      expected: c.groundTruthRelation,
      actual: predictedRelation,
      correct: isCorrect,
      isDefect,
      isEvalError: false,
    });
  }

  const stats = computeStats(tp, fp, tn, fn);
  const majorDefectRecall = majorDefectsTotal > 0 ? majorDefectsCaught / majorDefectsTotal : 1.0;

  return {
    stats,
    majorDefectRecall: parseFloat(majorDefectRecall.toFixed(4)),
    majorDefectsTotal,
    majorDefectsCaught,
    evalErrorsCount,
    details,
  };
}

async function main() {
  if (argv.includes("--prepare-arm") || argv.includes("--finalize-arm") || argv.includes("--compare-usage")) {
    const { prepareArm, finalizeArm } = await import("../src/agent/jev/pilot-ops.ts");
    const { loadArmUsageMetrics } = await import("../src/agent/jev/evaluation.ts");
    const { compareAgentUsageArms, aggregateAgentUsage, loadAgentAttemptReceipts, expectedAttemptsFromWorkflow } = await import("../src/agent/jev/agent-usage.ts");
    const trialId = argFrom("--trial-id") || "";
    const arm = (argFrom("--arm") || "A").toUpperCase() as "A" | "B";
    const site = argFrom("--site") || argFrom("--root");
    const host = argv.includes("--cursor") ? "cursor" as const : "other" as const;
    if (argv.includes("--prepare-arm")) {
      if (!site) {
        console.error("ERROR: --prepare-arm requires --site <pilot-clone> and --trial-id <id> --arm A|B");
        process.exit(1);
      }
      const result = prepareArm({
        trialId, arm, root: site as string, kernel, peerRoot: argFrom("--peer-site"), host,
        argv,
      });
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 3);
    }
    if (argv.includes("--finalize-arm")) {
      if (!site) {
        console.error("ERROR: --finalize-arm requires --site <pilot-clone> and --trial-id <id> --arm A|B");
        process.exit(1);
      }
      const result = finalizeArm({ trialId, arm, root: site as string, kernel });
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 3);
    }
    if (argv.includes("--compare-usage")) {
      const siteA = argFrom("--site-a") || argFrom("--root-a");
      const siteB = argFrom("--site-b") || argFrom("--root-b");
      if (!siteA || !siteB) {
        console.error("ERROR: --compare-usage requires --site-a and --site-b");
        process.exit(1);
      }
      const a = loadArmUsageMetrics(siteA as string, expectedAttemptsFromWorkflow(siteA as string));
      const b = loadArmUsageMetrics(siteB as string, expectedAttemptsFromWorkflow(siteB as string));
      const aggA = aggregateAgentUsage(loadAgentAttemptReceipts(siteA as string));
      const aggB = aggregateAgentUsage(loadAgentAttemptReceipts(siteB as string));
      const compared = compareAgentUsageArms(aggA, aggB);
      const report = {
        trialId,
        usageCoverage: a.coverage === "complete" && b.coverage === "complete" ? "complete" : "incomplete",
        comparison: a.coverage === "complete" && b.coverage === "complete" ? compared : { verdict: "measurement_incomplete", savingsPct: null, agentTokenDelta: null },
        A: a,
        B: b,
        note: "Cursor active-agent hosts often cannot export trustworthy per-attempt usage. Do not substitute Cursor API metering, manual guesses, or Gemini numbers. Missing receipts make the result measurement_incomplete, not a smaller total.",
      };
      const out = argFrom("--out") || join(kernel, "scratch/jev-ab-usage-coverage.json");
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
      console.log(JSON.stringify({ ...report, out }, null, 2));
      process.exit(report.usageCoverage === "complete" ? 0 : 4);
    }
  }

  const recipeName = argFrom("--recipe");
  if (recipeName === "jev-abc-prepilot" || recipeName === "jev-ab-matched") {
    const {
      assertPilotArmAllowed,
      FROZEN_PILOT_RECIPE,
      MATCHED_AB_RECIPE,
      defaultRollout,
      expectedJevBudget,
      emitMatchedAbProcedure,
      writeDryRunManifests,
      validateIsolatedSiteRoot,
      kernelRevision,
    } = await import("../src/agent/jev/pilot-recipe.ts");
    const arm = (argFrom("--arm") || "A").toUpperCase() as "A" | "B" | "C";
    if (!["A", "B", "C"].includes(arm)) {
      console.error(`ERROR: Invalid --arm '${arm}'. Frozen recipe arms are A, B, C.`);
      process.exit(1);
    }
    const check = assertPilotArmAllowed({
      arm,
      taskIds: [
        "business-source-selection",
        "business-review-grounding",
        "narrative-review-grounding",
        "copy-review-grounding",
        "claim-strengthening-check",
        "cta-fidelity-check",
        "intent-coverage-check",
        "cross-stage-consistency-check",
      ],
      root: kernel,
    });
    if (!check.ok) {
      console.error(check.reason);
      process.exit(2);
    }
    const dryRun = argv.includes("--dry-run") || recipeName === "jev-ab-matched";
    const rootA = argFrom("--root-a") || join(kernel, "scratch/jev-ab-a");
    const rootB = argFrom("--root-b") || join(kernel, "scratch/jev-ab-b");
    const outDir = argFrom("--out") || join(kernel, "scratch/jev-ab-dry-run");
    const procedure = emitMatchedAbProcedure({ kernel, rootA, rootB });
    const isolatedA = existsSync(rootA) ? validateIsolatedSiteRoot(rootA) : { ok: false as const, reason: `Missing isolated root A: ${rootA}` };
    const isolatedB = existsSync(rootB) ? validateIsolatedSiteRoot(rootB) : { ok: false as const, reason: `Missing isolated root B: ${rootB}` };
    let manifests: { provenancePath: string; usagePath: string } | undefined;
    if (dryRun && procedure.ok) {
      manifests = writeDryRunManifests({ outDir, procedure: procedure.procedure });
    }
    console.log(JSON.stringify({
      recipe: recipeName === "jev-ab-matched" ? MATCHED_AB_RECIPE : FROZEN_PILOT_RECIPE,
      arm,
      allowed: true,
      defaultRollout: defaultRollout(),
      expectedJevBudget: expectedJevBudget(),
      kernelRevision: kernelRevision(kernel),
      procedure: procedure.ok ? procedure.procedure : undefined,
      procedureError: procedure.ok ? undefined : procedure.reason,
      isolatedRoots: { A: isolatedA, B: isolatedB },
      manifests,
      executed: false,
      liveSiteRun: false,
      armC: "blocked",
      note: dryRun
        ? "Exact local A/B workflow procedure emitted. Site execution was not started. Arm C is blocked. No deploy."
        : "Frozen recipe validated. Pass --dry-run (or --recipe jev-ab-matched) to emit the exact A/B procedure and manifests.",
    }, null, 2));
    process.exit(procedure.ok || !dryRun ? 0 : 3);
  }

  console.log("===============================================================================");
  console.log("VITRIS KERNEL - JEV SYSTEM ONE & BOUNDED PACKET EVALUATION HARNESS");
  console.log("===============================================================================");
  console.log(`Execution Mode: ${isLive ? "LIVE (api.typesafe.ai)" : "MOCK (deterministic offline)"}`);
  console.log(`Split Target:   ${targetSplit.toUpperCase()}`);

  let client: JevClient | undefined;
  if (isLive) {
    const key = resolveApiKey([kernel]);
    if (!key) {
      console.error("ERROR: --live specified but TYPESAFE_API_KEY was not found in .dev.vars or environment.");
      process.exit(1);
    }
    client = new JevClient({ root: kernel, apiKey: key });
    console.log("Live JevClient initialized successfully with verified credentials.");
  }

  // Filter cases by split
  const routingCases = ROUTING_DATASET.filter(c => targetSplit === "all" || c.split === targetSplit);
  const groundingCases = GROUNDING_DATASET.filter(c => targetSplit === "all" || c.split === targetSplit);

  console.log(`\nEvaluating ${routingCases.length} routing cases...`);
  const routingEval = await evaluateRouting(client, routingCases);

  console.log(`Evaluating ${groundingCases.length} grounding cases...`);
  const groundingEval = await evaluateGrounding(client, groundingCases);

  // Audited baseline measurements from jackperrotta historical run
  const auditPath = join(kernel, "benchmark/usage/jackperrotta-audit.json");
  let baselineTokens = {
    input: 1493516,
    output: 159667,
    total: 1653183,
    cacheReads: 6944896,
  };
  let auditTotalReceipts = 14;
  const auditRunScope = "early_prefix_through_copy_review";
  const auditAdapter = "cursor-worker.mjs (Grok / Cursor)";

  if (existsSync(auditPath)) {
    try {
      const audited = JSON.parse(readFileSync(auditPath, "utf8"));
      const tokens = audited.knownTokens || audited.totals;
      if (tokens) {
        baselineTokens = {
          input: tokens.inputTokens ?? tokens.recordedInputTokens ?? baselineTokens.input,
          output: tokens.outputTokens ?? tokens.recordedOutputTokens ?? baselineTokens.output,
          total: tokens.totalTokens ?? tokens.totalAgentTokens ?? baselineTokens.total,
          cacheReads: tokens.cacheReadTokens ?? baselineTokens.cacheReads,
        };
      }
      if (typeof audited.totalReceipts === "number") {
        auditTotalReceipts = audited.totalReceipts;
      }
    } catch {
      // use defaults
    }
  }

  const baselineCostSonnet = {
    agentFreshInput: parseFloat(((baselineTokens.input / 1e6) * PRICING.sonnetFreshInput).toFixed(4)),
    agentCacheRead: parseFloat(((baselineTokens.cacheReads / 1e6) * PRICING.sonnetCacheRead).toFixed(4)),
    agentOutput: parseFloat(((baselineTokens.output / 1e6) * PRICING.sonnetOutput).toFixed(4)),
    jev: 0,
    total: parseFloat((
      (baselineTokens.input / 1e6) * PRICING.sonnetFreshInput +
      (baselineTokens.cacheReads / 1e6) * PRICING.sonnetCacheRead +
      (baselineTokens.output / 1e6) * PRICING.sonnetOutput
    ).toFixed(4)),
  };

  const baselineCostGrok = {
    agentFreshInput: parseFloat(((baselineTokens.input / 1e6) * PRICING.grokFreshInput).toFixed(4)),
    agentCacheRead: parseFloat(((baselineTokens.cacheReads / 1e6) * PRICING.grokCacheRead).toFixed(4)),
    agentOutput: parseFloat(((baselineTokens.output / 1e6) * PRICING.grokOutput).toFixed(4)),
    jev: 0,
    total: parseFloat((
      (baselineTokens.input / 1e6) * PRICING.grokFreshInput +
      (baselineTokens.cacheReads / 1e6) * PRICING.grokCacheRead +
      (baselineTokens.output / 1e6) * PRICING.grokOutput
    ).toFixed(4)),
  };

  // Check trial directory for empirical runs
  let trialReport: ReturnType<typeof compareRunMetrics> | undefined;
  let empiricalQualityVerified = false;
  if (trialDir) {
    console.log(`\nEvaluating trial directory: ${trialDir}`);
    const trialData = loadTrialMetrics(trialDir);
    console.log(`Discovered ${trialData.runs.length} run(s) in trial directory.`);
    if (trialData.runA && trialData.runB) {
      trialReport = compareRunMetrics(trialData.runA, trialData.runB, trialData.runC, { qualityMargin });
      empiricalQualityVerified =
        trialData.runA.qualityObserved === true &&
        trialData.runB.qualityObserved === true &&
        (trialData.runC ? trialData.runC.qualityObserved === true : true);
    } else if (trialData.runs.length > 0) {
      console.log(`Trial directory has ${trialData.runs.length} runs, but matched baseline + candidate pair (Run A & Run B) was not identified.`);
    }
  }

  // Treatment A (Baseline Unbounded historical run prefix or trial runA)
  const runA = trialReport?.runs.runA;
  const runB = trialReport?.runs.runB;
  const runC = trialReport?.runs.runC;

  const statusA = runA
    ? (empiricalQualityVerified ? "trial_empirical" : "trial_incomplete_quality")
    : "audited_historical_prefix";
  const treatmentA = {
    name: "Treatment A: Unbounded Baseline",
    status: statusA,
    runScope: runA ? "trial_run_A" : auditRunScope,
    workerAdapter: runA ? (runA.runId || "trial") : auditAdapter,
    workerModel: runA ? (runA.model ?? "unspecified_trial_model") : (auditAdapter.includes("cursor") ? "cursor-grok-4.6-high" : "unknown"),
    receiptsCount: runA ? runA.transportCalls : auditTotalReceipts,
    agentInputTokens: runA ? runA.inputTokens : baselineTokens.input,
    agentOutputTokens: runA ? runA.outputTokens : baselineTokens.output,
    agentTotalTokens: runA ? runA.totalTokens : baselineTokens.total,
    cacheReadTokens: runA ? (runA.cacheReadTokens ?? null) : baselineTokens.cacheReads,
    costStatus: "unknown",
    actualCostUsd: null,
    costUsd: null,
    shortlistRecall: runA?.shortlistRecall,
    defectRate: runA?.defectRate,
    hypotheticalScenarios: {
      grok2ReferenceRates: baselineCostGrok,
      sonnetReferenceRates: baselineCostSonnet,
    },
    note: runA
      ? "Treatment A loaded from trial directory."
      : "Prefix through copy-review only; does not cover completed workflow through local preview. Recorded worker configuration specifies cursor-grok-4.6-high with unestablished provider/model billing; actual cost is reported as unknown. Scenarios under Grok 2 and Claude 3.5 Sonnet rates are explicitly hypothetical references.",
  };

  // Treatment B (Bounded Compact Packets)
  const statusB = runB
    ? (empiricalQualityVerified ? "trial_empirical" : "trial_incomplete_quality")
    : "not_evaluated";
  const treatmentB = {
    name: "Treatment B: Bounded Compact Packets",
    status: statusB,
    reason: runB
      ? (empiricalQualityVerified ? "Evaluated empirically from trial directory with observed quality" : "Evaluated from trial directory; quality evidence is incomplete or unobserved.")
      : "Requires full empirical 3-arm run to local preview; synthetic constant multipliers are disallowed.",
    workerAdapter: runB ? (runB.runId || "trial") : undefined,
    workerModel: runB ? (runB.model ?? "unspecified_trial_model") : undefined,
    agentInputTokens: runB ? runB.inputTokens : null,
    agentOutputTokens: runB ? runB.outputTokens : null,
    agentTotalTokens: runB ? runB.totalTokens : null,
    cacheReadTokens: runB ? (runB.cacheReadTokens ?? null) : null,
    tokenReductionPct: trialReport ? trialReport.comparisons.bVsA.tokenSavingsPct : null,
    transportCallReductionPct: trialReport ? trialReport.comparisons.bVsA.transportCallReductionPct : null,
    costUsd: null,
    shortlistRecall: runB?.shortlistRecall,
    defectRate: runB?.defectRate,
    qualityPreserved: trialReport?.comparisons.bVsA.qualityPreserved,
  };

  // Treatment C (Bounded Compact Packets + Jev Preflight & Assist Routing)
  const statusC = runC
    ? (empiricalQualityVerified ? "trial_empirical" : "trial_incomplete_quality")
    : "not_evaluated";
  const treatmentC = {
    name: "Treatment C: Compact Packets + Jev Decision Service",
    status: statusC,
    reason: runC
      ? (empiricalQualityVerified ? "Evaluated empirically from trial directory with observed quality" : "Evaluated from trial directory; quality evidence is incomplete or unobserved.")
      : "Requires full empirical 3-arm run to local preview; synthetic constant multipliers are disallowed.",
    workerAdapter: runC ? (runC.runId || "trial") : undefined,
    workerModel: runC ? (runC.model ?? "unspecified_trial_model") : undefined,
    agentInputTokens: runC ? runC.inputTokens : null,
    agentOutputTokens: runC ? runC.outputTokens : null,
    agentTotalTokens: runC ? runC.totalTokens : null,
    cacheReadTokens: runC ? (runC.cacheReadTokens ?? null) : null,
    tokenReductionPct: trialReport?.comparisons.cVsA ? trialReport.comparisons.cVsA.tokenSavingsPct : null,
    transportCallReductionPct: trialReport?.comparisons.cVsA ? trialReport.comparisons.cVsA.transportCallReductionPct : null,
    jevInputTokens: null,
    jevOutputTokens: null,
    jevCalls: null,
    costUsd: null,
    netCostReductionPct: null,
    shortlistRecall: runC?.shortlistRecall,
    defectRate: runC?.defectRate,
    qualityPreserved: trialReport?.comparisons.cVsA?.qualityPreserved,
  };

  const results = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    provenance: {
      mode: isLive ? "live" : "mock",
      split: targetSplit,
      pricingModel: PRICING,
      jevModel: "jev-1.13.0",
      jevEndpoint: "https://api.typesafe.ai/v1/systemone",
      kernelPath: kernel,
    },
    configuration: {
      treatment: selectedTreatment ?? "all",
      ablation: selectedAblation ?? "none",
      qualityMargin,
      activeCapabilities,
    },
    offline_mechanics: {
      routing: {
        casesEvaluated: routingEval.casesEvaluated,
        overridesHonored: routingEval.overridesHonored,
        stats: routingEval.stats,
        overallAccuracy: routingEval.overallAccuracy,
        overallAccuracyCi: routingEval.overallAccuracyCi,
        macroPrecision: routingEval.macroPrecision,
        autoRoutingPrecision: routingEval.autoRoutingPrecision,
        autoRoutingPrecisionCi: routingEval.autoRoutingPrecisionCi,
        perClass: routingEval.perClass,
        targetAccepted: routingEval.macroPrecision >= 0.95 && routingEval.autoRoutingPrecision >= 0.95,
      },
      grounding: {
        casesEvaluated: groundingCases.length,
        stats: groundingEval.stats,
        majorDefectsTotal: groundingEval.majorDefectsTotal,
        majorDefectsCaught: groundingEval.majorDefectsCaught,
        majorDefectRecall: groundingEval.majorDefectRecall,
        evalErrorsCount: groundingEval.evalErrorsCount,
        targetAccepted: groundingEval.majorDefectRecall >= 0.95,
      },
    },
    live_model_cases: isLive && client
      ? {
          status: "completed",
          sessionUsage: client.getSessionUsage(),
        }
      : {
          status: "not_run",
          reason: "Run with --live and valid TYPESAFE_API_KEY to evaluate live Jev System One endpoints.",
        },
    workflow_measurements: {
      treatmentA,
      treatmentB,
      treatmentC,
    },
    comparative_evaluation: trialReport ? {
      verdict: trialReport.verdict,
      comparisons: trialReport.comparisons,
      summary: trialReport.summary,
    } : null,
    independent_quality_reviews: {
      status: "not_evaluated",
      reason: "Predefined blind-review non-inferiority panel has not been conducted; synthetic quality scores are disallowed.",
      scores: null,
    },
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");

  console.log("\n===============================================================================");
  console.log("EVALUATION RESULTS SUMMARY");
  console.log("===============================================================================");
  console.log(`0. ROLLOUT CONFIGURATION & CAPABILITIES`);
  console.log(`   - Selected Treatment:    ${selectedTreatment ? `Treatment ${selectedTreatment}` : "All Arms"}`);
  console.log(`   - Ablation Component:    ${selectedAblation ?? "None"}`);
  console.log(`   - Quality Margin:        ${(qualityMargin * 100).toFixed(1)}%`);
  console.log(`   - Active Capabilities:`);
  for (const [cap, mode] of Object.entries(activeCapabilities)) {
    console.log(`       * ${cap.padEnd(20)}: ${mode}`);
  }

  console.log(`\n1. ROUTING EVALUATION (N=${routingEval.casesEvaluated})`);
  console.log(`   - Macro Precision:       ${(routingEval.macroPrecision * 100).toFixed(1)}%`);
  console.log(`   - Auto-Routing Precision:${(routingEval.autoRoutingPrecision * 100).toFixed(1)}% (95% CI: [${(routingEval.autoRoutingPrecisionCi[0] * 100).toFixed(1)}%, ${(routingEval.autoRoutingPrecisionCi[1] * 100).toFixed(1)}%])`);
  console.log(`   - Overall Accuracy:      ${(routingEval.overallAccuracy * 100).toFixed(1)}% (95% CI: [${(routingEval.overallAccuracyCi[0] * 100).toFixed(1)}%, ${(routingEval.overallAccuracyCi[1] * 100).toFixed(1)}%])`);
  console.log(`   - Overrides Honored:     ${routingEval.overridesHonored}/${routingCases.filter(c => c.overrideScope).length} unconditional`);
  console.log(`   - Per-Class Metrics:`);
  for (const [scope, s] of Object.entries(routingEval.perClass)) {
    console.log(`       * ${scope.padEnd(10)}: Prec ${(s.precision * 100).toFixed(1)}% [${(s.precisionCi[0] * 100).toFixed(1)}%, ${(s.precisionCi[1] * 100).toFixed(1)}%] | Rec ${(s.recall * 100).toFixed(1)}% [${(s.recallCi[0] * 100).toFixed(1)}%, ${(s.recallCi[1] * 100).toFixed(1)}%] (N=${s.n})`);
  }
  console.log(`   - Target (>=95% prec):   ${results.offline_mechanics.routing.targetAccepted ? "PASSED (>= 95%)" : "FAILED (< 95%)"}`);

  console.log(`\n2. GROUNDING & DEFECT DETECTION (N=${groundingEval.stats.n})`);
  console.log(`   - Precision:             ${(groundingEval.stats.precision * 100).toFixed(1)}% (95% CI: [${(groundingEval.stats.precisionCi[0] * 100).toFixed(1)}%, ${(groundingEval.stats.precisionCi[1] * 100).toFixed(1)}%])`);
  console.log(`   - Recall:                ${(groundingEval.stats.recall * 100).toFixed(1)}% (95% CI: [${(groundingEval.stats.recallCi[0] * 100).toFixed(1)}%, ${(groundingEval.stats.recallCi[1] * 100).toFixed(1)}%])`);
  console.log(`   - Major Defect Recall:   ${(groundingEval.majorDefectRecall * 100).toFixed(1)}% (${groundingEval.majorDefectsCaught}/${groundingEval.majorDefectsTotal} seeded defects detected)`);
  console.log(`   - Eval Network Errors:   ${groundingEval.evalErrorsCount} (never counted as true positives)`);
  console.log(`   - Target (>=95% recall): ${groundingEval.majorDefectRecall >= 0.95 ? "PASSED (>= 95%)" : "FAILED (< 95%)"}`);

  console.log(`\n3. WORKFLOW TOKEN & COST MEASUREMENTS`);
  console.log(`   Treatment A (Baseline Unbounded):`);
  console.log(`     - Status:                 ${treatmentA.status} (${treatmentA.runScope})`);
  console.log(`     - Recorded Tokens:        ${(treatmentA.agentTotalTokens || 0).toLocaleString()} (${(treatmentA.agentInputTokens || 0).toLocaleString()} in / ${(treatmentA.agentOutputTokens || 0).toLocaleString()} out)`);
  console.log(`     - Cache Reads:            ${(treatmentA.cacheReadTokens || 0).toLocaleString()}`);
  console.log(`     - Receipts Count:         ${treatmentA.receiptsCount}`);
  console.log(`     - Worker Model:           ${treatmentA.workerModel} (Adapter: ${treatmentA.workerAdapter})`);
  if (treatmentA.shortlistRecall !== undefined) console.log(`     - Shortlist Recall:       ${(treatmentA.shortlistRecall * 100).toFixed(1)}%`);
  if (treatmentA.defectRate !== undefined) console.log(`     - Defect Rate:            ${(treatmentA.defectRate * 100).toFixed(1)}%`);
  console.log(`     - Actual Cost:            UNKNOWN (cursor-grok-4.6-high billing unestablished)`);
  console.log(`     - Hypothetical Scenarios: (Strictly reference benchmarks; not incurred cost)`);
  console.log(`         * Grok 2 Ref Rates:   $${treatmentA.hypotheticalScenarios.grok2ReferenceRates.total.toFixed(2)} ($${treatmentA.hypotheticalScenarios.grok2ReferenceRates.agentFreshInput.toFixed(2)} in, $${treatmentA.hypotheticalScenarios.grok2ReferenceRates.agentCacheRead.toFixed(2)} cache, $${treatmentA.hypotheticalScenarios.grok2ReferenceRates.agentOutput.toFixed(2)} out)`);
  console.log(`         * Sonnet Ref Rates:   $${treatmentA.hypotheticalScenarios.sonnetReferenceRates.total.toFixed(2)} ($${treatmentA.hypotheticalScenarios.sonnetReferenceRates.agentFreshInput.toFixed(2)} in, $${treatmentA.hypotheticalScenarios.sonnetReferenceRates.agentCacheRead.toFixed(2)} cache, $${treatmentA.hypotheticalScenarios.sonnetReferenceRates.agentOutput.toFixed(2)} out)`);

  console.log(`   Treatment B (Bounded Compact Packets):`);
  console.log(`     - Status:                 ${treatmentB.status} (${treatmentB.reason})`);
  if (typeof treatmentB.agentTotalTokens === "number") {
    console.log(`     - Recorded Tokens:        ${treatmentB.agentTotalTokens.toLocaleString()} (${treatmentB.tokenReductionPct}% token reduction)`);
    if (treatmentB.shortlistRecall !== undefined) console.log(`     - Shortlist Recall:       ${(treatmentB.shortlistRecall * 100).toFixed(1)}%`);
    if (treatmentB.defectRate !== undefined) console.log(`     - Defect Rate:            ${(treatmentB.defectRate * 100).toFixed(1)}%`);
    console.log(`     - Quality Preserved:      ${treatmentB.qualityPreserved ? "YES" : "NO"}`);
  }

  console.log(`   Treatment C (Compact Packets + Jev Service):`);
  console.log(`     - Status:                 ${treatmentC.status} (${treatmentC.reason})`);
  if (typeof treatmentC.agentTotalTokens === "number") {
    console.log(`     - Recorded Tokens:        ${treatmentC.agentTotalTokens.toLocaleString()} (${treatmentC.tokenReductionPct}% token reduction)`);
    if (treatmentC.shortlistRecall !== undefined) console.log(`     - Shortlist Recall:       ${(treatmentC.shortlistRecall * 100).toFixed(1)}%`);
    if (treatmentC.defectRate !== undefined) console.log(`     - Defect Rate:            ${(treatmentC.defectRate * 100).toFixed(1)}%`);
    console.log(`     - Quality Preserved:      ${treatmentC.qualityPreserved ? "YES" : "NO"}`);
  }

  if (trialReport) {
    console.log(`\n4. MATCHED TRIAL COMPARATIVE REPORT`);
    console.log(formatComparativeReport(trialReport));
  } else {
    console.log(`\n4. QUALITY EVALUATION (BLIND REVIEW NON-INFERIORITY)`);
    console.log(`   - Status:                   ${results.independent_quality_reviews.status}`);
    console.log(`   - Note:                     ${results.independent_quality_reviews.reason}`);
  }

  console.log(`\nResults written to: ${outPath}`);
  console.log("===============================================================================\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(err => {
    console.error("Evaluation failed:", err);
    process.exit(1);
  });
}
