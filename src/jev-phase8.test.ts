import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fingerprint, save, type Business } from "./agent/artifacts.ts";
import { initialState, parseGraphYaml } from "./agent/graph.ts";
import { inputHash } from "./agent/runner.ts";
import { prepareStage, completeStage } from "./agent/lifecycle.ts";
import { stripAgentRuntimeHistory, AGENT_RUNTIME_HISTORY_ENTRIES } from "./agent/kit-runtime.ts";
import { loadJevConfig, DEFAULT_JEV_CONFIG } from "./agent/jev/config.ts";
import { JevClient } from "./agent/jev/client.ts";
import {
  applyBusinessAuthorPacketReduction,
  runBusinessSourceSelection,
} from "./agent/jev/business-draft.ts";
import { aggregateJevReceiptSpend } from "./agent/jev/budget.ts";
import { rankOptionalEvidenceWithJev } from "./agent/jev/ranking.ts";
import { makeGroundingQuestion } from "./agent/jev/questions.ts";
import {
  ALL_DELEGATION_DENIAL_REASONS,
  applyDelegatedPacketReduction,
  assessPreflightCoverage,
  DEFAULT_RETAINED_DUTIES,
  evaluateDelegationEligibility,
  type DelegationEvaluationInput,
} from "./agent/jev/ownership.ts";
import {
  ALL_DELEGATION_DENIAL_REASONS as CALIBRATION_REASONS,
  computeCalibrationMetrics,
  DATASET_VERSION,
  DELEGATION_PRIORITY_ORDER,
  issueTrustedPilotContext,
  MODEL_FAMILY,
  replaceCalibrationRegistryForTests,
  type DelegationDenialReason,
  type KernelCalibrationArtifact,
} from "./agent/jev/calibration.ts";
import { GROUNDING_SEMANTICS_HASH, QUESTION_VERSION, FIELD_SELECTION_SEMANTICS_HASH } from "./agent/jev/questions.ts";
import { POLICY_VERSION } from "./agent/jev/policy.ts";
import { allDatasetTaskIds, evaluateLabeledDataset, TASK_DATASETS } from "./agent/jev/datasets.ts";
import { assertMatrixCoversRegistry, buildCapabilityMatrix, formatCapabilityMatrixMarkdown } from "./agent/jev/capability-matrix.ts";
import { catalogPromptPolicySeparated, QUESTION_TASK_CATALOG } from "./agent/jev/catalog.ts";
import { evaluatePromotion, pinTrialIdentity, treatmentsMatchIdentity, validateObservationArtifacts, writeObservationArtifact } from "./agent/jev/paired-eval.ts";
import { loadTrialMetrics, resolveLoadedQuality, type RunMetrics } from "./agent/jev/evaluation.ts";
import { allTasks } from "./agent/jev/service-registry.ts";

const kernel = resolve(import.meta.dirname, "..");
const temp = () => mkdtempSync(join(tmpdir(), "vitris-phase8-"));

const sampleBusiness: Business = {
  version: 2,
  offer: "Roof repairs",
  audience: "Local homeowners",
  trigger: "A leak",
  outcome: "A repaired roof",
  includes: ["Inspection"],
  engagement: "Request an estimate",
  positioning: "Local repairs",
  facts: [{ id: "f1", claim: "Repairs roofs", evidence: ["e1"] }],
  evidence: [{ id: "e1", source: "onboarding/copy/home.md", excerpt: "We repair roofs for local homeowners throughout the county with same-week scheduling and documented workmanship guarantees on every completed job." }],
  uncertainties: [],
};

function createTestSite() {
  const root = temp();
  cpSync(join(kernel, "agent"), join(root, "agent"), { recursive: true });
  stripAgentRuntimeHistory(join(root, "agent"));
  mkdirSync(join(root, "onboarding/copy"), { recursive: true });
  mkdirSync(join(root, "pages"), { recursive: true });
  writeFileSync(join(root, "onboarding/copy/home.md"), "We repair roofs for local homeowners throughout the county with same-week scheduling and documented workmanship guarantees on every completed job.", "utf8");
  const graph = parseGraphYaml(readFileSync(join(kernel, "agent/graph.yaml"), "utf8"));
  const state = initialState(graph);
  const harvestNode = graph.nodes.find(n => n.id === "harvest")!;
  state.nodes.harvest = {
    status: "done",
    attempts: 1,
    inputHash: inputHash(root, harvestNode),
    outputHash: fingerprint(root, harvestNode.writes),
    skillHash: fingerprint(root, ["agent/graph.yaml", "agent/PROMPT.md", ...harvestNode.refs.map(r => `agent/refs/${r}.md`)]),
  };
  save(join(root, "agent/STATE.json"), state);
  save(join(root, "launch.json"), { name: "Test Site" });
  return { root, graph, state };
}

function eligibleArtifact(taskId: string, overrides: Partial<KernelCalibrationArtifact> = {}): KernelCalibrationArtifact {
  const metrics = computeCalibrationMetrics({
    tp: 40,
    fp: 0,
    tn: 40,
    fn: 2,
    maxAllowedFalsePassRate: 0.05,
    minSampleSize: 30,
  });
  return {
    schemaVersion: 1,
    issuer: "vitris-kernel",
    taskId,
    taskVersion: QUESTION_VERSION,
    questionSemanticsHash: GROUNDING_SEMANTICS_HASH,
    policyVersion: POLICY_VERSION,
    modelFamily: MODEL_FAMILY,
    datasetVersion: DATASET_VERSION,
    sampleSize: 82,
    metrics,
    thresholds: { grounding: 0.85, routing: 0.8 },
    eligible: true,
    pilotOnly: true,
    expiresAt: "2099-01-01T00:00:00.000Z",
    revalidation: { afterDays: 30, requiresHeldoutRerun: true },
    notes: "test fixture",
    ...overrides,
  };
}

function completeCoverage() {
  return {
    complete: true,
    candidateCount: 1,
    evaluatedCount: 1,
    coveredObligationIds: ["f1:e1"],
    retainedObligationIds: [] as string[],
    missingEvidenceIds: [] as string[],
    conflictingClaimIds: [] as string[],
    staleEvidence: false,
  };
}

function baseInput(overrides: Partial<DelegationEvaluationInput> = {}): DelegationEvaluationInput {
  const config = {
    ...loadJevConfig(temp()),
    mode: "assist" as const,
    workOwnership: "delegated" as const,
    model: "jev-1.13.0",
    capabilities: { grounding: "assist" as const },
  };
  const pilot = issueTrustedPilotContext({
    trialId: "phase8",
    kernelRevision: "test-rev",
    allowedTaskIds: ["business-review-grounding"],
  });
  return {
    config,
    taskId: "business-review-grounding",
    coverage: completeCoverage(),
    manifest: { present: true, current: true, expectedModel: "jev-1.13.0" },
    remainingBudget: { transportAttempts: 10, inputTokens: 50_000 },
    siteContext: { subjectExists: true, applicable: true },
    pilotContext: pilot,
    executionStatus: "completed",
    kernelRevision: "test-rev",
    questionSemanticsHash: GROUNDING_SEMANTICS_HASH,
    ...overrides,
  };
}

test("Phase 8: default calibration is ineligible and site eligible:true cannot authorize", () => {
  const restore = replaceCalibrationRegistryForTests([]);
  try {
    const result = evaluateDelegationEligibility(baseInput({
      siteAuthoredEligible: true,
      registryDelegationEligible: true,
    }));
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes("no_kernel_calibration") || result.reasons.includes("site_authored_eligible_ignored"));
    assert.ok(result.reasons.includes("site_authored_eligible_ignored"));
    assert.ok(result.reasons.includes("registry_delegation_flag_ignored"));
  } finally {
    restore();
  }
});

test("Phase 8: table-driven denial reasons cover every fallback", () => {
  assert.deepEqual([...ALL_DELEGATION_DENIAL_REASONS].sort(), [...CALIBRATION_REASONS].sort());

  const restore = replaceCalibrationRegistryForTests([eligibleArtifact("business-review-grounding")]);
  try {
    const rows: Array<{ reason: DelegationDenialReason; input: DelegationEvaluationInput }> = [
      { reason: "work_ownership_not_delegated", input: baseInput({ config: { ...baseInput().config, workOwnership: "agent" } }) },
      { reason: "global_mode_off", input: baseInput({ config: { ...baseInput().config, mode: "off" } }) },
      { reason: "global_mode_shadow", input: baseInput({ config: { ...baseInput().config, mode: "shadow" } }) },
      { reason: "global_mode_not_assist", input: baseInput({ config: { ...baseInput().config, mode: "other" as any } }) },
      { reason: "capability_not_assist", input: baseInput({ config: { ...baseInput().config, capabilities: { grounding: "shadow" } } }) },
      { reason: "site_authored_eligible_ignored", input: baseInput({ siteAuthoredEligible: true, config: { ...baseInput().config } }) },
      { reason: "registry_delegation_flag_ignored", input: baseInput({ registryDelegationEligible: true }) },
      { reason: "no_kernel_calibration", input: baseInput({ taskId: "unknown-task" }) },
      { reason: "calibration_expired", input: baseInput() },
      { reason: "calibration_task_version_mismatch", input: baseInput() },
      { reason: "calibration_question_semantics_mismatch", input: baseInput({ questionSemanticsHash: "deadbeef" }) },
      { reason: "calibration_model_family_mismatch", input: baseInput({ config: { ...baseInput().config, model: "other-family-9" } }) },
      { reason: "calibration_dataset_mismatch", input: baseInput() },
      { reason: "calibration_sample_size_insufficient", input: baseInput() },
      { reason: "calibration_metrics_below_threshold", input: baseInput() },
      { reason: "calibration_ineligible", input: baseInput() },
      { reason: "pilot_context_required", input: baseInput({ pilotContext: undefined }) },
      { reason: "pilot_context_invalid", input: baseInput({
        pilotContext: { ...issueTrustedPilotContext({ trialId: "x", kernelRevision: "test-rev", allowedTaskIds: ["business-review-grounding"] }), integrityHash: "00" },
      }) },
      { reason: "pilot_context_expired", input: baseInput({
        now: new Date("2100-01-01T00:00:00.000Z"),
      }) },
      { reason: "pilot_context_task_not_allowed", input: baseInput({
        taskId: "business-review-grounding",
        pilotContext: issueTrustedPilotContext({ trialId: "x", kernelRevision: "test-rev", allowedTaskIds: ["other-task"] }),
      }) },
      { reason: "task_not_applicable", input: baseInput({ siteContext: { applicable: false, subjectExists: true } }) },
      { reason: "subject_missing", input: baseInput({ siteContext: { applicable: true, subjectExists: false } }) },
      { reason: "candidate_coverage_incomplete", input: baseInput({ coverage: { ...completeCoverage(), complete: false, evaluatedCount: 0 } }) },
      { reason: "evidence_missing", input: baseInput({ coverage: { ...completeCoverage(), missingEvidenceIds: ["e-missing"] } }) },
      { reason: "evidence_conflicting", input: baseInput({ coverage: { ...completeCoverage(), conflictingClaimIds: ["f2"] } }) },
      { reason: "evidence_stale", input: baseInput({ coverage: { ...completeCoverage(), staleEvidence: true } }) },
      { reason: "manifest_missing", input: baseInput({ manifest: { present: false, current: false } }) },
      { reason: "manifest_stale", input: baseInput({ manifest: { present: true, current: false } }) },
      { reason: "budget_exhausted", input: baseInput({ remainingBudget: { transportAttempts: 0, inputTokens: 0 } }) },
      { reason: "execution_unavailable", input: baseInput({ executionStatus: "unavailable" }) },
      { reason: "execution_failed", input: baseInput({ executionStatus: "failed" }) },
      { reason: "execution_uncertain", input: baseInput({ executionStatus: "uncertain" }) },
      { reason: "execution_incomplete", input: baseInput({ executionStatus: "incomplete" }) },
    ];

    const seen = new Set<DelegationDenialReason>();
    const withEmptyRegistry = new Set<DelegationDenialReason>([
      "site_authored_eligible_ignored",
      "registry_delegation_flag_ignored",
      "no_kernel_calibration",
    ]);
    for (const row of rows) {
      if (withEmptyRegistry.has(row.reason) || row.reason.startsWith("calibration_") && row.reason !== "calibration_question_semantics_mismatch" && row.reason !== "calibration_model_family_mismatch") {
        continue;
      }
      const res = evaluateDelegationEligibility(row.input);
      assert.equal(res.eligible, false, row.reason);
      assert.ok(res.reasons.includes(row.reason), `${row.reason} missing, got ${res.reasons.join(",")}`);
      seen.add(row.reason);
    }

    restore();
    const emptyRestore = replaceCalibrationRegistryForTests([]);
    try {
      for (const row of rows.filter(r => withEmptyRegistry.has(r.reason))) {
        const res = evaluateDelegationEligibility(row.input);
        assert.ok(res.reasons.includes(row.reason), `${row.reason} missing, got ${res.reasons.join(",")}`);
        seen.add(row.reason);
      }
    } finally {
      emptyRestore();
    }

    for (const row of rows.filter(r => r.reason.startsWith("calibration_") && r.reason !== "calibration_question_semantics_mismatch" && r.reason !== "calibration_model_family_mismatch")) {
      const broken = eligibleArtifact("business-review-grounding", {
        eligible: row.reason === "calibration_ineligible" ? false : true,
        expiresAt: row.reason === "calibration_expired" ? "2000-01-01T00:00:00.000Z" : "2099-01-01T00:00:00.000Z",
        taskVersion: row.reason === "calibration_task_version_mismatch" ? "old" : QUESTION_VERSION,
        datasetVersion: row.reason === "calibration_dataset_mismatch" ? "old-ds" : DATASET_VERSION,
        sampleSize: row.reason === "calibration_sample_size_insufficient" ? 1 : 82,
        metrics: row.reason === "calibration_metrics_below_threshold"
          ? computeCalibrationMetrics({ tp: 10, fp: 20, tn: 10, fn: 2, maxAllowedFalsePassRate: 0.02, minSampleSize: 30 })
          : eligibleArtifact("business-review-grounding").metrics,
      });
      const inner = replaceCalibrationRegistryForTests([broken]);
      try {
        const res = evaluateDelegationEligibility(baseInput());
        assert.ok(res.reasons.includes(row.reason), `${row.reason} missing, got ${res.reasons.join(",")}`);
        seen.add(row.reason);
      } finally {
        inner();
      }
    }

    for (const reason of ALL_DELEGATION_DENIAL_REASONS) {
      assert.ok(seen.has(reason), `Denial reason ${reason} was not exercised`);
    }
  } finally {
    restore();
  }
});

test("Phase 8: valid kernel calibration + pilot + coverage + manifest + budget delegates", () => {
  const restore = replaceCalibrationRegistryForTests([eligibleArtifact("business-review-grounding")]);
  try {
    const res = evaluateDelegationEligibility(baseInput());
    assert.equal(res.eligible, true, res.reasonDetails.join("; "));
    assert.deepEqual(res.coveredObligationIds, ["f1:e1"]);
  } finally {
    restore();
  }
});

test("Phase 8: labeled datasets cover required case kinds and report confusion matrices", () => {
  const kinds = new Set(["positive", "negative", "missing_evidence", "conflict", "candidate_omission", "ambiguous", "service_error"]);
  for (const taskId of allDatasetTaskIds()) {
    const cases = TASK_DATASETS[taskId]!;
    const present = new Set(cases.map(c => c.kind));
    for (const k of kinds) assert.ok(present.has(k as any), `${taskId} missing ${k}`);
    const report = evaluateLabeledDataset(taskId);
    assert.ok(report.metrics.n >= 7);
    assert.equal(report.confusion.tp + report.confusion.fp + report.confusion.tn + report.confusion.fn, report.metrics.n);
    assert.ok(Array.isArray(report.metrics.precisionCi));
    assert.equal(report.confusion.fp, 0, `${taskId} false pass must be 0 on this conservative policy set`);
  }
  assert.ok(DELEGATION_PRIORITY_ORDER[0] === "business-source-selection");
});

test("Phase 8: packet reduction removes only covered pairs and keeps retained excerpts", () => {
  const packet = `## Current review boundary\nReview all claims.\n### Harvested Facts (2 claims):\n- [f1] Repairs roofs (evidence: e1)\n- [f2] Phone listed (evidence: e2)\n### Evidence Excerpts (2 excerpts):\n- [e1] (onboarding/copy/home.md) "We repair roofs"\n- [e2] (onboarding/copy/home.md) "Call 555-0100"\n## Machine Grounding Preflight Summary:\nAll good\n`;
  const allCovered = applyDelegatedPacketReduction({
    packet,
    eligible: true,
    coveredObligationIds: ["f1:e1", "f2:e2"],
    retainedItems: [],
    retainedDuties: DEFAULT_RETAINED_DUTIES,
  });
  assert.equal(allCovered.reduced, true);
  assert.ok(allCovered.packet.includes("SUPERSEDING REVIEW SCOPE"));
  assert.ok(!allCovered.packet.includes("We repair roofs"));
  assert.ok(!allCovered.packet.includes("Call 555-0100"));
  assert.ok(!allCovered.packet.includes("### Harvested Facts"));

  const mixed = applyDelegatedPacketReduction({
    packet,
    eligible: true,
    coveredObligationIds: ["f1:e1"],
    retainedItems: [{
      id: "f2:e2",
      claim: "Phone listed",
      evidenceId: "e2",
      sourceFile: "onboarding/copy/home.md",
      excerpt: "Call 555-0100",
      verdict: "insufficient_evidence",
      autoAccepted: false,
      notes: "uncertain",
    }],
    retainedDuties: DEFAULT_RETAINED_DUTIES,
  });
  assert.equal(mixed.reduced, true);
  assert.ok(!mixed.packet.includes('"We repair roofs"'));
  assert.ok(mixed.packet.includes("Call 555-0100"), "retained item must keep its excerpt");
  assert.ok(mixed.packet.includes("expand: `evidence-e2`"));
  assert.ok(mixed.packet.includes("[f2] Phone listed"));
  const restored = applyDelegatedPacketReduction({
    packet,
    eligible: false,
    coveredObligationIds: ["f1:e1"],
    retainedItems: [],
    retainedDuties: DEFAULT_RETAINED_DUTIES,
  });
  assert.equal(restored.reduced, false);
  assert.equal(restored.packet, packet);
});

test("Phase 8: assist+delegated prepare removes covered work; failure restores; off/shadow stay invariant", async () => {
  const { root, graph, state } = createTestSite();
  state.nodes.business = { status: "done", attempts: 1 };
  save(join(root, "onboarding/business.json"), sampleBusiness);

  const mockFetch = async () =>
    new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers: {
          relation: { type: "choice", choice: "supports", confidence: 0.95, probabilities: { supports: 0.95, contradicts: 0.03, says_nothing: 0.02 } },
        },
        usage: { input_tokens: 40, output_tokens: 8 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  const client = new JevClient({ root, apiKey: "test-key", fetch: mockFetch });

  const strip = (txt: string) =>
    txt.replace(/Preparation ID: [a-f0-9-]+\n/g, "").replace(/Complete this stage with: npm run go -- --complete --preparation [a-f0-9-]+\n/g, "");

  await prepareStage({
    root, kernel, graph, state, nodeId: "business-review",
    jevConfig: { ...loadJevConfig(root), mode: "off", compactPackets: true },
    jevClient: client,
  });
  const offPrompt = strip(readFileSync(join(root, "agent/CURRENT.md"), "utf8"));

  await prepareStage({
    root, kernel, graph, state, nodeId: "business-review",
    jevConfig: { ...loadJevConfig(root), mode: "shadow", workOwnership: "delegated", compactPackets: true, capabilities: { grounding: "assist" } },
    jevClient: client,
  });
  const shadowPrompt = strip(readFileSync(join(root, "agent/CURRENT.md"), "utf8"));
  assert.equal(shadowPrompt, offPrompt, "shadow + delegated ownership must not change the consumed packet vs off");

  await prepareStage({
    root, kernel, graph, state, nodeId: "business-review",
    jevConfig: { ...loadJevConfig(root), mode: "assist", workOwnership: "agent", compactPackets: true, capabilities: { grounding: "assist" } },
    jevClient: client,
  });
  const assistAgent = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  assert.ok(assistAgent.includes("Grounding Preflight Report"));
  assert.ok(!assistAgent.includes("SUPERSEDING REVIEW SCOPE"), "assist + agent ownership must not claim workload reduction");

  const restore = replaceCalibrationRegistryForTests([eligibleArtifact("business-review-grounding")]);
  try {
    const pilot = issueTrustedPilotContext({
      trialId: "delegated-slice",
      kernelRevision: "test-rev",
      allowedTaskIds: ["business-review-grounding"],
    });
    const prep = await prepareStage({
      root, kernel, graph, state, nodeId: "business-review",
      jevConfig: {
        ...loadJevConfig(root),
        mode: "assist",
        workOwnership: "delegated",
        compactPackets: true,
        model: "jev-1.13.0",
        capabilities: { grounding: "assist" },
      },
      jevClient: client,
      pilotContext: pilot,
      kernelRevision: "test-rev",
    });
    const delegated = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
    assert.equal(prep.preparation?.ownershipSnapshot?.packetReduced, true, JSON.stringify(prep.preparation?.ownershipSnapshot?.outcomes));
    const covered = prep.preparation?.ownershipSnapshot?.outcomes?.find(o => o.taskId === "business-review-grounding");
    assert.ok(covered?.eligible);
    assert.deepEqual(covered?.coveredObligationIds, ["f1:e1"]);
    assert.ok(delegated.includes("SUPERSEDING REVIEW SCOPE"));
    assert.ok(!delegated.includes("same-week scheduling"), "verified excerpt must be absent when delegated");
    const evidenceBytes = (txt: string) => {
      const facts = txt.match(/### Harvested Facts[\s\S]*?(?=\n### |\n## )/g)?.join("") || "";
      const ev = txt.match(/### Evidence Excerpts[\s\S]*?(?=\n### |\n## )/g)?.join("") || "";
      return facts.length + ev.length;
    };
    assert.ok(evidenceBytes(delegated) < evidenceBytes(assistAgent), "covered fact/excerpt bytes must shrink");

    const review = {
      version: 2,
      subjectHash: prep.preparation?.reviewSubjectHash,
      verdict: "pass",
      reviewer: "critic",
      evidence: ["onboarding/business.json"],
      checks: ["offer", "audience", "engagement", "evidence", "contradictions"].map(criterion => ({
        criterion, verdict: "pass", evidence: "onboarding/business.json",
      })),
      findings: [],
    };
    save(join(root, "agent/reviews/business-review.json"), review);
    const completed = await completeStage({
      root, kernel, graph, state, preparationId: prep.preparation!.id,
    });
    assert.equal(completed.ok, true, completed.failures.join("; "));

    const failRoot = createTestSite();
    failRoot.state.nodes.business = { status: "done", attempts: 1 };
    save(join(failRoot.root, "onboarding/business.json"), sampleBusiness);
    const failClient = new JevClient({
      root: failRoot.root,
      apiKey: "test-key",
      fetch: async () => new Response("nope", { status: 503 }),
    });
    const failPrep = await prepareStage({
      root: failRoot.root, kernel, graph: failRoot.graph, state: failRoot.state, nodeId: "business-review",
      jevConfig: {
        ...loadJevConfig(failRoot.root),
        mode: "assist",
        workOwnership: "delegated",
        compactPackets: true,
        capabilities: { grounding: "assist" },
      },
      jevClient: failClient,
      pilotContext: pilot,
      kernelRevision: "test-rev",
    });
    const restored = readFileSync(join(failRoot.root, "agent/CURRENT.md"), "utf8");
    assert.equal(failPrep.preparation?.ownershipSnapshot?.packetReduced, false);
    assert.ok(!restored.includes("SUPERSEDING REVIEW SCOPE"));
  } finally {
    restore();
  }
});

test("Phase 8: mixed covered/uncertain prepare retains source bytes for remaining items", async () => {
  const { root, graph, state } = createTestSite();
  state.nodes.business = { status: "done", attempts: 1 };
  const mixedBusiness = {
    ...sampleBusiness,
    facts: [
      { id: "f1", claim: "Repairs roofs", evidence: ["e1"] },
      { id: "f2", claim: "Open 24/7", evidence: ["e2"] },
    ],
    evidence: [
      { id: "e1", source: "onboarding/copy/home.md", excerpt: "We repair roofs for local homeowners throughout the county with same-week scheduling and documented workmanship guarantees on every completed job." },
      { id: "e2", source: "onboarding/copy/home.md", excerpt: "Open weekdays only" },
    ],
  };
  writeFileSync(join(root, "onboarding/copy/home.md"), "We repair roofs for local homeowners throughout the county with same-week scheduling and documented workmanship guarantees on every completed job. Open weekdays only", "utf8");
  save(join(root, "onboarding/business.json"), mixedBusiness);
  const mockFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}"));
    const answers: Record<string, unknown> = {};
    const keys = Object.keys(body.questions || {});
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const saysNothing = keys.length > 1 && i === keys.length - 1;
      answers[key] = {
        type: "choice",
        choice: saysNothing ? "says_nothing" : "supports",
        confidence: 0.95,
        probabilities: saysNothing
          ? { supports: 0.02, contradicts: 0.03, says_nothing: 0.95 }
          : { supports: 0.95, contradicts: 0.03, says_nothing: 0.02 },
      };
    }
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 40, output_tokens: 8 } }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  const restore = replaceCalibrationRegistryForTests([eligibleArtifact("business-review-grounding")]);
  try {
    const prep = await prepareStage({
      root, kernel, graph, state, nodeId: "business-review",
      jevConfig: {
        ...loadJevConfig(root),
        mode: "assist",
        workOwnership: "delegated",
        compactPackets: true,
        model: "jev-1.13.0",
        capabilities: { grounding: "assist" },
      },
      jevClient: new JevClient({ root, apiKey: "test-key", fetch: mockFetch }),
      pilotContext: issueTrustedPilotContext({
        trialId: "mixed",
        kernelRevision: "test-rev",
        allowedTaskIds: ["business-review-grounding"],
      }),
      kernelRevision: "test-rev",
    });
    const packet = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
    assert.equal(prep.preparation?.ownershipSnapshot?.packetReduced, true, JSON.stringify(prep.preparation?.ownershipSnapshot));
    const outcome = prep.preparation?.ownershipSnapshot?.outcomes?.find(o => o.taskId === "business-review-grounding");
    assert.ok(outcome?.coveredObligationIds.includes("f1:e1"));
    assert.ok(!outcome?.coveredObligationIds.includes("f2:e2"));
    assert.ok(!packet.includes("same-week scheduling"));
    assert.ok(packet.includes("Open weekdays only"), "uncertain pair must keep its excerpt");
    assert.ok(packet.includes("expand: `evidence-e2`") || packet.includes("[e2]"));
  } finally {
    restore();
  }
});

test("Phase 2: business-author source selection removes covered transcription", async () => {
  const { root, graph, state } = createTestSite();
  mkdirSync(join(root, "onboarding/raw"), { recursive: true });
  writeFileSync(join(root, "onboarding/raw/pages.json"), JSON.stringify({
    pages: [{ url: "https://roofs.example/contact", text: "Call 215-555-0100 or email info@roofs.example. Licensed since 1998." }],
  }), "utf8");
  const mockFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}"));
    const answers: Record<string, unknown> = {};
    for (const [key, q] of Object.entries(body.questions || {})) {
      const criteria = (q as { criteria?: Record<string, string> }).criteria || {};
      const ids = Object.keys(criteria).filter(id => id !== "no_match");
      const picked = ids[0] || "no_match";
      const probabilities: Record<string, number> = { no_match: 0.02 };
      for (const id of ids) probabilities[id] = id === picked ? 0.96 : 0.02 / Math.max(ids.length, 1);
      const sum = Object.values(probabilities).reduce((a, b) => a + b, 0);
      for (const id of Object.keys(probabilities)) probabilities[id] = (probabilities[id] ?? 0) / sum;
      answers[key] = { type: "choice", choice: picked, confidence: 0.96, probabilities };
    }
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 30, output_tokens: 6 } }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  const restore = replaceCalibrationRegistryForTests([
    eligibleArtifact("business-source-selection", { questionSemanticsHash: FIELD_SELECTION_SEMANTICS_HASH }),
  ]);
  try {
    const assistCfg = {
      ...loadJevConfig(root),
      mode: "assist" as const,
      workOwnership: "agent" as const,
      compactPackets: false,
      model: "jev-1.13.0",
      capabilities: { grounding: "off" as const, sourceSelection: "assist" as const },
    };
    const assistPrep = await prepareStage({
      root, kernel, graph, state, nodeId: "business",
      jevConfig: assistCfg,
      jevClient: new JevClient({ root, apiKey: "test-key", fetch: mockFetch, config: assistCfg }),
    });
    const assistPacket = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
    assert.ok(assistPacket.includes("Transcribe phone from harvest source spans"));
    assert.ok(assistPacket.includes("Source-bound machine business draft"));

    const delegatedCfg = { ...assistCfg, workOwnership: "delegated" as const };
    const prep = await prepareStage({
      root, kernel, graph, state, nodeId: "business",
      jevConfig: delegatedCfg,
      jevClient: new JevClient({ root, apiKey: "test-key", fetch: mockFetch, config: delegatedCfg }),
      pilotContext: issueTrustedPilotContext({
        trialId: "biz-sel",
        kernelRevision: "test-rev",
        allowedTaskIds: ["business-source-selection"],
      }),
      kernelRevision: "test-rev",
    });
    const packet = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
    assert.equal(prep.preparation?.ownershipSnapshot?.packetReduced, true, JSON.stringify(prep.preparation?.ownershipSnapshot));
    assert.ok(!packet.includes("Transcribe phone from harvest source spans"), "covered phone transcription must be removed");
    assert.ok(packet.includes("215-555-0100") || packet.includes("Selected fields"));
    assert.ok(packet.length < assistPacket.length, "delegated business packet must be smaller");

    save(join(root, "onboarding/business.json"), {
      ...sampleBusiness,
      engagement: "Call 215-555-0100",
      facts: [{ id: "f1", claim: "Call 215-555-0100", evidence: ["e1"] }],
      evidence: [{ id: "e1", source: "onboarding/raw/pages.json", excerpt: "Call 215-555-0100" }],
    });
    const completed = await completeStage({
      root, kernel, graph, state, preparationId: prep.preparation!.id,
    });
    assert.equal(completed.ok, true, completed.failures.join("; "));
  } finally {
    restore();
  }
});

test("Phase 8: fresh kit copy strips kernel runtime history", () => {
  const dest = join(temp(), "agent");
  mkdirSync(dest, { recursive: true });
  mkdirSync(join(dest, "decisions/jev/cache"), { recursive: true });
  mkdirSync(join(dest, "runs"), { recursive: true });
  writeFileSync(join(dest, "decisions/jev/cache/x.json"), "{}", "utf8");
  writeFileSync(join(dest, "runs/1.json"), "{}", "utf8");
  writeFileSync(join(dest, "CURRENT.md"), "stale", "utf8");
  writeFileSync(join(dest, "graph.yaml"), "version: 3\n", "utf8");
  const removed = stripAgentRuntimeHistory(dest);
  assert.ok(removed.includes("decisions"));
  assert.ok(removed.includes("runs"));
  assert.ok(!existsSync(join(dest, "decisions")));
  assert.ok(!existsSync(join(dest, "CURRENT.md")));
  assert.ok(existsSync(join(dest, "graph.yaml")));
  for (const entry of AGENT_RUNTIME_HISTORY_ENTRIES) {
    assert.equal(existsSync(join(dest, entry)), false, entry);
  }
});

test("Phase 8: capability matrix and catalog stay honest", () => {
  const errors = assertMatrixCoversRegistry(allTasks());
  assert.deepEqual(errors, []);
  const rows = buildCapabilityMatrix();
  for (const r of rows) {
    if (!r.implementedCaller) assert.equal(r.ownershipEffect, "none");
  }
  assert.ok(formatCapabilityMatrixMarkdown().includes("business-review-grounding"));
  assert.equal(catalogPromptPolicySeparated(), true);
  assert.ok(QUESTION_TASK_CATALOG.every(e => e.promptRef && e.policyRef && e.promptRef !== e.policyRef));
});

test("Phase 9: subdirectory metrics cannot self-assert qualityObserved", () => {
  const dir = temp();
  mkdirSync(join(dir, "run-X"), { recursive: true });
  writeFileSync(join(dir, "run-X/metrics.json"), JSON.stringify({
    totalTokens: 100,
    transportCalls: 1,
    claimFidelityPct: 99,
    qualityObserved: true,
  }), "utf8");
  const loaded = loadTrialMetrics(dir);
  assert.equal(loaded.runs[0]?.qualityObserved, false);
  assert.equal(resolveLoadedQuality({ qualityObserved: true }).qualityObserved, false);
});

test("Phase 9: promotion refuses incomplete evidence and byte-identical pages", () => {
  const baseline: RunMetrics = {
    runId: "A", label: "A", treatment: "A", transportCalls: 10, inputTokens: 1000, outputTokens: 100,
    totalTokens: 1100, clockDurationMs: 10, cacheHits: 0, totalEvaluations: 1,
    claimFidelityPct: 90, defectEscapeCount: 0, failedGatesCount: 0, qualityObserved: false,
  };
  const candidate: RunMetrics = { ...baseline, runId: "C", label: "C", treatment: "C", totalTokens: 800 };
  const promo = evaluatePromotion({
    baseline,
    candidate,
    manifestsComplete: false,
    usageAttributed: false,
    failureRestoresWork: true,
    jevWithinBudget: true,
    agentUsageMeasured: false,
    byteIdenticalPages: true,
    packetBytesBaseline: 1000,
    packetBytesCandidate: 1000,
  });
  assert.equal(promo.promoted, false);
  assert.ok(promo.reasons.some(r => /manifest/i.test(r) || /quality/i.test(r) || /metering/i.test(r)));
  assert.ok(promo.reasons.some(r => /Byte-identical/i.test(r)));
});

test("Phase 9: observation artifacts bind hashes; critic iterations are not quality", () => {
  const root = temp();
  const art = writeObservationArtifact(root, "obs/prompt.txt", "hello packet", "prompt-bytes");
  const manifest = {
    schemaVersion: 1 as const,
    treatmentId: "A" as const,
    snapshotHash: "abc",
    model: "test",
    environment: { nodeVersion: "22", platform: "test", arch: "x64" },
    previewReady: true,
    qualityChecks: [],
    observedAt: new Date().toISOString(),
    trialIdentity: pinTrialIdentity({
      kernelRevision: "r",
      kernelDiffIdentity: "d",
      graphVersion: 3,
      sourceSnapshotHash: "abc",
      stopNode: "preview",
      configSnapshot: { mode: "off" },
    }),
    observationArtifacts: [art],
    agentUsageMeasured: false,
    inheritedReceiptsCounted: false as const,
  };
  const ok = validateObservationArtifacts(manifest, root);
  assert.equal(ok.ok, true, ok.reasons.join("; "));
  writeFileSync(join(root, "obs/prompt.txt"), "tampered", "utf8");
  const bad = validateObservationArtifacts(manifest, root);
  assert.equal(bad.ok, false);

  const a = pinTrialIdentity({
    kernelRevision: "r", kernelDiffIdentity: "d", graphVersion: 3, sourceSnapshotHash: "s",
    stopNode: "preview", configSnapshot: { mode: "off", workOwnership: "agent" },
  });
  const b = pinTrialIdentity({
    kernelRevision: "r", kernelDiffIdentity: "d", graphVersion: 3, sourceSnapshotHash: "s",
    stopNode: "preview", configSnapshot: { mode: "assist", workOwnership: "agent" },
  });
  assert.equal(treatmentsMatchIdentity(a, b).ok, true);
  assert.equal(assessPreflightCoverage([]).complete, false);
});

test("Phase 8/9: live smoke flag is absent from npm test", () => {
  const pkg = JSON.parse(readFileSync(join(kernel, "package.json"), "utf8"));
  assert.equal(typeof pkg.scripts.test, "string");
  assert.equal(pkg.scripts.test.includes("--live"), false);
  assert.equal(pkg.scripts.test.includes("jev-phase8.test.ts"), true);
});

function mixedJevFetch(init?: RequestInit): Response {
  const body = JSON.parse(String(init?.body || "{}"));
  const answers: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(body.questions || {})) {
    const q = raw as { type?: string; criteria?: Record<string, string> | Array<{ score: number }> };
    if (q.type === "noul") {
      answers[key] = { type: "noul", noul: 0.94 };
    } else if (q.type === "score") {
      const blob = JSON.stringify(raw);
      const score = /closed on sundays/i.test(blob) ? 0 : 3;
      const probabilities: Record<string, number> = { "0": 0.04, "1": 0.04, "2": 0.08, "3": 0.08, "4": 0.04 };
      probabilities[String(score)] = 0.72;
      const sum = Object.values(probabilities).reduce((a, b) => a + b, 0);
      for (const k of Object.keys(probabilities)) probabilities[k] = (probabilities[k] ?? 0) / sum;
      answers[key] = { type: "score", score, confidence: 0.9, probabilities };
    } else {
      const criteria = q.criteria && !Array.isArray(q.criteria) ? q.criteria : {};
      const ids = Object.keys(criteria).filter(id => id !== "no_match");
      const picked = ids[0] || "no_match";
      const probabilities: Record<string, number> = { no_match: 0.02 };
      for (const id of ids) probabilities[id] = id === picked ? 0.96 : 0.02 / Math.max(ids.length, 1);
      const sum = Object.values(probabilities).reduce((a, b) => a + b, 0);
      for (const id of Object.keys(probabilities)) probabilities[id] = (probabilities[id] ?? 0) / sum;
      answers[key] = { type: "choice", choice: picked, confidence: 0.96, probabilities };
    }
  }
  return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 24, output_tokens: 6 } }), {
    status: 200, headers: { "content-type": "application/json" },
  });
}

test("Business draft batches independent fields and keeps multiple offers", async () => {
  const { root } = createTestSite();
  mkdirSync(join(root, "onboarding/raw"), { recursive: true });
  writeFileSync(join(root, "onboarding/raw/pages.json"), JSON.stringify({
    pages: [{
      url: "https://roofs.example/contact",
      text: "Call 215-555-0100. Services: roof repair, gutter cleaning. Serving: Philadelphia, Camden.",
    }],
  }), "utf8");
  let transports = 0;
  const client = new JevClient({
    root,
    apiKey: "test-key",
    fetch: async (_input, init) => {
      transports++;
      return mixedJevFetch(init);
    },
    config: { ...loadJevConfig(root), model: "jev-1.13.0" },
  });
  const sel = await runBusinessSourceSelection({
    root, client, nodeId: "business", preparationId: "prep-batch-fields",
  });
  assert.equal(transports, 1, "independent field questions must share one bounded request");
  assert.ok(sel.draft.conflicts.length === 0, "distinct offers/locations must not be recorded as conflicts");
  const offers = sel.draft.selected.filter(s => s.field === "offer");
  assert.equal(offers.length, 2, JSON.stringify(sel.draft.selected));
  assert.ok(offers.every(o => typeof o.noul === "number"));
  assert.ok(sel.draft.rawJudgments.some(j => j.type === "choice" && j.probabilities));
  assert.ok(sel.coveredFieldIds.includes("phone"));
  assert.ok(sel.coveredFieldIds.includes("offer"));
  const reduced = applyBusinessAuthorPacketReduction({
    packet: "CURRENT\n",
    eligible: true,
    draft: sel.draft,
  });
  assert.equal(reduced.reduced, true);
  assert.ok(!reduced.packet.includes("Transcribe phone from harvest source spans"));
  assert.ok(!reduced.packet.includes("Transcribe offer from harvest source spans"));
});

test("Business draft retains transcription when candidate coverage is incomplete", async () => {
  const { root } = createTestSite();
  mkdirSync(join(root, "onboarding/raw"), { recursive: true });
  writeFileSync(join(root, "onboarding/raw/pages.json"), JSON.stringify({
    pages: [{
      url: "https://roofs.example/contact",
      text: "Call 215-555-0100. Services: roof repair, gutter cleaning.",
    }],
  }), "utf8");
  const client = new JevClient({
    root,
    apiKey: "test-key",
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      const answers: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(body.questions || {})) {
        const q = raw as { type?: string; criteria?: Record<string, string> };
        if (q.type === "noul") {
          answers[key] = { type: "noul", noul: /gutter/i.test(JSON.stringify(raw)) ? 0.5 : 0.94 };
        } else {
          const criteria = q.criteria || {};
          const ids = Object.keys(criteria).filter(id => id !== "no_match");
          const picked = ids[0] || "no_match";
          const probabilities: Record<string, number> = { no_match: 0.02 };
          for (const id of ids) probabilities[id] = id === picked ? 0.96 : 0.02 / Math.max(ids.length, 1);
          const sum = Object.values(probabilities).reduce((a, b) => a + b, 0);
          for (const id of Object.keys(probabilities)) probabilities[id] = (probabilities[id] ?? 0) / sum;
          answers[key] = { type: "choice", choice: picked, confidence: 0.96, probabilities };
        }
      }
      return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 20, output_tokens: 4 } }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
    config: { ...loadJevConfig(root), model: "jev-1.13.0" },
  });
  const sel = await runBusinessSourceSelection({
    root, client, nodeId: "business", preparationId: "prep-incomplete",
  });
  const offerCov = sel.draft.candidateCoverage.find(c => c.field === "offer");
  assert.equal(offerCov?.complete, false);
  const reduced = applyBusinessAuthorPacketReduction({
    packet: "CURRENT\n",
    eligible: true,
    draft: sel.draft,
  });
  assert.ok(reduced.packet.includes("Transcribe offer from harvest source spans"), "uncertain offer coverage must keep transcription");
  assert.ok(!reduced.packet.includes("Transcribe phone from harvest source spans"), "covered phone may still drop");
});

test("Pilot budget counts failed attempts and blocks concurrent overflow", async () => {
  const root = temp();
  let calls = 0;
  const failClient = new JevClient({
    root,
    apiKey: "test-key",
    fetch: async () => {
      calls++;
      return new Response("nope", { status: 503, headers: { "content-type": "text/plain" } });
    },
    config: {
      ...DEFAULT_JEV_CONFIG,
      model: "jev-1.13.0",
      maxRetries: 0,
      maxConcurrency: 2,
      pilotBudget: { maxTransportAttempts: 1, maxInputTokens: 200000 },
    },
  });
  const questions = { relation: makeGroundingQuestion("a", "b") };
  await assert.rejects(() => failClient.evaluate({ taskType: "grounding", questions, state: { n: 1 }, useCache: false }));
  assert.equal(calls, 1);
  const spend = aggregateJevReceiptSpend(root);
  assert.ok(spend.transportAttempts >= 1, JSON.stringify(spend));
  await assert.rejects(
    () => failClient.evaluate({ taskType: "grounding", questions, state: { n: 2 }, useCache: false }),
    /Pilot transport budget exhausted/
  );
  assert.equal(calls, 1, "failed attempt must consume the cap");

  const root2 = temp();
  let inflight = 0;
  let maxInflight = 0;
  let started = 0;
  const concurrent = new JevClient({
    root: root2,
    apiKey: "test-key",
    fetch: async (_input, init) => {
      started++;
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise(r => setTimeout(r, 40));
      inflight--;
      return mixedJevFetch(init);
    },
    config: {
      ...DEFAULT_JEV_CONFIG,
      model: "jev-1.13.0",
      maxRetries: 0,
      maxConcurrency: 2,
      pilotBudget: { maxTransportAttempts: 1, maxInputTokens: 200000 },
    },
  });
  const results = await Promise.allSettled([
    concurrent.evaluate({ taskType: "grounding", questions, state: { a: 1 }, useCache: false }),
    concurrent.evaluate({ taskType: "grounding", questions, state: { a: 2 }, useCache: false }),
  ]);
  assert.equal(started, 1, "in-flight reservation must prevent a second transport");
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
});

test("Jev retrieval keeps mandatory and contradictory evidence regardless of rank", async () => {
  const { root } = createTestSite();
  const client = new JevClient({
    root,
    apiKey: "test-key",
    fetch: async (_input, init) => mixedJevFetch(init),
    config: { ...loadJevConfig(root), model: "jev-1.13.0" },
  });
  const ranked = await rankOptionalEvidenceWithJev({
    client,
    claims: [{ id: "F_HOURS", claim: "Open 24 hours daily" }],
    evidence: [
      { id: "E1", source: "onboarding/copy/home.md", excerpt: "Open 24 hours daily without exception." },
      { id: "E2", source: "onboarding/copy/hours.md", excerpt: "Closed on Sundays and holidays." },
      { id: "E3", source: "onboarding/copy/about.md", excerpt: "Our trucks are white." },
    ],
    citedIds: ["E1"],
    contradictoryIds: ["E2"],
    nodeId: "business-review",
  });
  assert.ok(ranked.mandatoryIds.includes("E1"));
  assert.ok(ranked.ranked.some(r => r.id === "E1" && r.mandatory));
  assert.ok(ranked.ranked.some(r => r.id === "E2" && r.mandatory));
  const e2 = ranked.ranked.find(r => r.id === "E2")!;
  assert.equal(e2.jevScore, 0);
  assert.ok(typeof e2.combinedScore === "number");
});

