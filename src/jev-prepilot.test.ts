import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { JevClient, INFERENCE_CACHE_SCHEMA } from "./agent/jev/client.ts";
import { DEFAULT_JEV_CONFIG, loadJevConfig } from "./agent/jev/config.ts";
import { makeGroundingQuestion } from "./agent/jev/questions.ts";
import {
  aggregateJevReceiptSpend,
  isReservationLive,
  loadPilotReservations,
  reapStaleReservations,
  type PilotReservation,
} from "./agent/jev/budget.ts";
import { applyQuestionFanoutBounds } from "./agent/jev/bounds.ts";
import { auditCandidateRecall, auditShortlistRecall } from "./agent/jev/recall-audit.ts";
import { rankOptionalEvidenceWithJev } from "./agent/jev/ranking.ts";
import { buildGoalContract, changedGoalIds, invalidateDependentNodes, missingGoalFindings, syncGoalContract } from "./agent/jev/goals.ts";
import { runQualityChecks } from "./agent/jev/content-checks.ts";
import { scoreCreativeCandidates } from "./agent/jev/creative.ts";
import { writeNodeObservation } from "./agent/jev/observations.ts";
import { recordAgentStageAttempt, writeAgentAttemptReceipt, aggregateAgentUsage, compareAgentUsageArms, tokensFromNestedUsage } from "./agent/jev/agent-usage.ts";
import { compareRunMetrics, loadTrialMetrics } from "./agent/jev/evaluation.ts";
import {
  comparePlannedToRendered,
  extractPlannedAssertions,
  extractRenderedAssertions,
  formatEvidenceForJev,
  unauthorizedContactFindings,
} from "./agent/jev/visible-assertions.ts";
import { buildRepairPacket } from "./agent/jev/repair.ts";
import { assertPilotArmAllowed, defaultRollout, expectedJevBudget, FROZEN_PILOT_RECIPE, emitMatchedAbProcedure, writeDryRunManifests } from "./agent/jev/pilot-recipe.ts";
import {
  applyBusinessAuthorPacketReduction,
  TRANSCRIPTION_BLOCK_END,
  TRANSCRIPTION_BLOCK_START,
  type MachineBusinessDraft,
} from "./agent/jev/business-draft.ts";
import { formatTargetedRepairBlock, shouldEscalateRepeatedUncertainty, verifyRepairResolution } from "./agent/jev/repair.ts";
import { prepareStage, completeStage } from "./agent/lifecycle.ts";
import { fingerprint, save, type Business, type Review } from "./agent/artifacts.ts";
import { initialState, parseGraphYaml } from "./agent/graph.ts";
import { inputHash } from "./agent/runner.ts";
import { stripAgentRuntimeHistory } from "./agent/kit-runtime.ts";
import { allDatasetTaskIds, TASK_DATASETS } from "./agent/jev/datasets.ts";
import { allKernelCalibrations } from "./agent/jev/calibration.ts";

const kernel = resolve(import.meta.dirname, "..");
const temp = () => mkdtempSync(join(tmpdir(), "vitris-prepilot-"));

function mixedFetch(init?: RequestInit): Response {
  const body = JSON.parse(String(init?.body || "{}"));
  const answers: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(body.questions || {})) {
    const q = raw as { type?: string; criteria?: Record<string, string> };
    const blob = JSON.stringify(raw);
    if (q.type === "noul") {
      const high = /award-winning|best in the county|schedule a visit/i.test(blob);
      answers[key] = { type: "noul", noul: high ? 0.96 : 0.05 };
    } else if (q.type === "score") {
      const probabilities: Record<string, number> = { "0": 0.04, "1": 0.04, "2": 0.08, "3": 0.72, "4": 0.12 };
      answers[key] = { type: "score", score: 3, confidence: 0.9, probabilities };
    } else {
      const criteria = q.criteria && !Array.isArray(q.criteria) ? q.criteria : {};
      const ids = Object.keys(criteria);
      const mismatch = ids.includes("mismatch") && /schedule/i.test(blob);
      const choice = mismatch ? "mismatch" : (ids[0] || "supports");
      const probabilities: Record<string, number> = {};
      for (const id of ids) probabilities[id] = id === choice ? 0.9 : 0.1 / Math.max(ids.length - 1, 1);
      const sum = Object.values(probabilities).reduce((a, b) => a + b, 0) || 1;
      for (const id of Object.keys(probabilities)) probabilities[id] = (probabilities[id] ?? 0) / sum;
      answers[key] = { type: "choice", choice, confidence: 0.9, probabilities };
    }
  }
  return new Response(JSON.stringify({
    model: "jev-1.13.0",
    answers,
    usage: { input_tokens: 18, output_tokens: 4 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function groundingQs() {
  return { relation: makeGroundingQuestion("a", "b") };
}

const sampleBusiness: Business = {
  version: 2,
  offer: "Roof repairs",
  audience: "Homeowners",
  trigger: "A leak",
  outcome: "A repaired roof",
  includes: ["Inspection"],
  engagement: "Schedule a visit",
  positioning: "Local",
  facts: [{ id: "f1", claim: "Repairs roofs", evidence: ["e1"] }],
  evidence: [{ id: "e1", source: "onboarding/copy/home.md", excerpt: "We repair roofs." }],
  uncertainties: [],
};

function createCopyReviewSite() {
  const root = temp();
  cpSync(join(kernel, "agent"), join(root, "agent"), { recursive: true });
  stripAgentRuntimeHistory(join(root, "agent"));
  mkdirSync(join(root, "onboarding/copy"), { recursive: true });
  mkdirSync(join(root, "pages"), { recursive: true });
  writeFileSync(join(root, "onboarding/copy/home.md"), "We repair roofs.", "utf8");
  save(join(root, "onboarding/business.json"), sampleBusiness);
  writeFileSync(join(root, "onboarding/storyboard.json"), JSON.stringify({
    version: 2,
    pages: [{ path: "/", id: "home", actions: [{ label: "Contact us", href: "/contact" }] }],
  }), "utf8");
  writeFileSync(join(root, "onboarding/copy-plan.json"), JSON.stringify({
    pages: [{
      path: "/",
      sections: [{
        id: "hero",
        heading: "Award-winning team",
        body: "Best in the county.",
        cta: "Schedule a visit",
        factIds: ["f1"],
      }],
    }],
  }), "utf8");
  const graph = parseGraphYaml(readFileSync(join(kernel, "agent/graph.yaml"), "utf8"));
  const state = initialState(graph);
  const copyNode = graph.nodes.find(n => n.id === "copy")!;
  state.nodes.copy = {
    status: "done",
    attempts: 1,
    inputHash: inputHash(root, copyNode),
    outputHash: fingerprint(root, copyNode.writes),
    skillHash: fingerprint(root, ["agent/graph.yaml", "agent/PROMPT.md", ...copyNode.refs.map(r => `agent/refs/${r}.md`)]),
  };
  save(join(root, "agent/STATE.json"), state);
  save(join(root, "launch.json"), { name: "Prepilot" });
  return { root, graph, state };
}

test("Inference cache identity ignores policy and rejects legacy envelopes", async () => {
  const root = temp();
  const questions = groundingQs();
  const client = new JevClient({
    root, apiKey: "test-key", fetch: async (_i, init) => mixedFetch(init),
    config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
  });
  const a = client.cacheKey("jev-1.13.0", questions, { n: 1 });
  const b = client.cacheKey("jev-1.13.0", questions, { n: 1 });
  const c = client.cacheKey("jev-1.13.0", questions, { n: 2 });
  const d = client.cacheKey("jev-1.13.0", { relation: makeGroundingQuestion("changed", "b") }, { n: 1 });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.equal(INFERENCE_CACHE_SCHEMA, 2);

  let calls = 0;
  const cachedClient = new JevClient({
    root, apiKey: "test-key",
    fetch: async (_i, init) => { calls++; return mixedFetch(init); },
    config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
  });
  await cachedClient.evaluate({ taskType: "grounding", questions, state: { n: 1 } });
  await cachedClient.evaluate({ taskType: "grounding", questions, state: { n: 1 } });
  assert.equal(calls, 1, "policy-only identity must reuse the raw answer");

  const cachePath = join(root, "agent/decisions/jev/cache", `${a}.json`);
  writeFileSync(cachePath, JSON.stringify({
    model: "jev-1.13.0",
    answers: { relation: { type: "choice", choice: "supports", confidence: 0.9, probabilities: { supports: 0.9, contradicts: 0.05, says_nothing: 0.05 } } },
  }), "utf8");
  let afterLegacy = 0;
  const legacyClient = new JevClient({
    root, apiKey: "test-key",
    fetch: async (_i, init) => { afterLegacy++; return mixedFetch(init); },
    config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
  });
  await legacyClient.evaluate({ taskType: "grounding", questions, state: { n: 1 } });
  assert.equal(afterLegacy, 1, "legacy unwrapped cache must be ignored");
});

test("Reservations survive long createdAt when heartbeat is live; dead pid is reaped", async () => {
  const root = temp();
  const live: PilotReservation = {
    reservationId: "live-long",
    createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    heartbeatAt: new Date().toISOString(),
    ownerPid: process.pid,
    ownerToken: "t",
    estimatedInputTokens: 10,
    reservedAttempts: 1,
  };
  mkdirSync(join(root, "agent/decisions/jev/reservations"), { recursive: true });
  writeFileSync(join(root, "agent/decisions/jev/reservations/live-long.json"), JSON.stringify(live), "utf8");
  assert.equal(isReservationLive(live), true);
  assert.equal(loadPilotReservations(root).some(r => r.reservationId === "live-long"), true);
  assert.equal(reapStaleReservations(root), 0);

  const dead: PilotReservation = {
    reservationId: "dead-crash",
    createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    heartbeatAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    ownerPid: 99999999,
    ownerToken: "dead",
    estimatedInputTokens: 40,
    reservedAttempts: 2,
  };
  writeFileSync(join(root, "agent/decisions/jev/reservations/dead-crash.json"), JSON.stringify(dead), "utf8");
  const reaped = reapStaleReservations(root);
  assert.ok(reaped >= 1);
  const spend = aggregateJevReceiptSpend(root);
  assert.ok(spend.transportAttempts >= 2, "recovered crash reservation counts reserved attempts");
  assert.ok(spend.inputTokens >= 40, "unknown usage uses conservative estimate, not zero");
});

test("Failed transport and SDK retry consume budget; second caller is blocked", async () => {
  const root = temp();
  let calls = 0;
  const client = new JevClient({
    root, apiKey: "test-key",
    fetch: async (_i, init) => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "0" },
        });
      }
      return mixedFetch(init);
    },
    config: {
      ...DEFAULT_JEV_CONFIG,
      model: "jev-1.13.0",
      maxRetries: 1,
      maxConcurrency: 2,
      pilotBudget: { maxTransportAttempts: 2, maxInputTokens: 200000 },
    },
  });
  await client.evaluate({ taskType: "grounding", questions: groundingQs(), state: { n: 1 }, useCache: false });
  assert.ok(calls >= 2, "SDK retry must be a counted transport");
  await assert.rejects(
    () => client.evaluate({ taskType: "grounding", questions: groundingQs(), state: { n: 2 }, useCache: false }),
    /Pilot transport budget exhausted/
  );
});

test("Unknown SDK usage is reserved conservatively rather than counted as zero", async () => {
  const root = temp();
  const client = new JevClient({
    root, apiKey: "test-key",
    fetch: async (_i, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      const answers: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(body.questions || {})) {
        const q = raw as { type?: string; criteria?: Record<string, string> };
        const ids = Object.keys(q.criteria || { supports: "s", contradicts: "c", says_nothing: "n" });
        const choice = ids[0] || "supports";
        const probabilities: Record<string, number> = {};
        for (const id of ids) probabilities[id] = id === choice ? 1 : 0;
        answers[key] = { type: "choice", choice, confidence: 0.9, probabilities };
      }
      return new Response(JSON.stringify({ model: "jev-1.13.0", answers }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
    config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
  });
  await client.evaluate({ taskType: "grounding", questions: groundingQs(), state: { n: 9 }, useCache: false });
  const spend = aggregateJevReceiptSpend(root);
  assert.ok(spend.inputTokens > 0);
});

test("Fan-out overflow becomes an agent obligation, not silent exclusion", () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `q${i}` }));
  const { kept, overflow } = applyQuestionFanoutBounds(items, { maxQuestions: 2, maxCandidates: 2 });
  assert.equal(kept.length, 2);
  assert.ok(overflow);
  assert.equal(overflow!.droppedIds.length, 3);
  assert.ok(overflow!.agentObligation.includes("not silently excluded"));
});

test("Candidate and shortlist recall audits are documented", () => {
  const audit = auditCandidateRecall();
  assert.ok(audit.rows.length >= 4);
  assert.ok(audit.meanRecall >= 0);
  const short = auditShortlistRecall();
  assert.ok(short.totalGold >= 2);
  for (const taskId of allDatasetTaskIds()) {
    assert.ok((TASK_DATASETS[taskId] || []).length >= 4, taskId);
  }
  assert.ok(allKernelCalibrations().every(a => a.pilotOnly === true && a.eligible === false));
});

test("Jev retrieval scores plausible pairs only and keeps mandatory evidence", async () => {
  const root = temp();
  const client = new JevClient({
    root, apiKey: "test-key", fetch: async (_i, init) => mixedFetch(init),
    config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
  });
  const ranked = await rankOptionalEvidenceWithJev({
    client,
    claims: [
      { id: "F1", claim: "Open 24 hours daily", evidenceIds: ["E1"] },
      { id: "F2", claim: "Family owned since 1998", evidenceIds: ["E4"] },
    ],
    evidence: [
      { id: "E1", source: "home.md", excerpt: "Open 24 hours daily without exception." },
      { id: "E2", source: "hours.md", excerpt: "Closed on Sundays and holidays." },
      { id: "E3", source: "about.md", excerpt: "Our trucks are white." },
      { id: "E4", source: "about.md", excerpt: "Family owned since 1998." },
    ],
    citedIds: ["E1", "E4"],
    contradictoryIds: ["E2"],
    nodeId: "business-review",
  });
  assert.ok(ranked.ranked.some(r => r.id === "E1" && r.mandatory));
  assert.ok(ranked.ranked.some(r => r.id === "E2" && r.mandatory));
  assert.ok(ranked.judgedCount < 8, "must not score every claim against every mandatory excerpt");
});

test("Delegated transcription removal is exact; leftover harvest dump is not claimed as savings", () => {
  const harvestDump = "FULL HARVEST: Call 215-555-0100 or email info@ex.test. Licensed since 1998. Extra unused source bytes remain in the packet.";
  const packet = [
    harvestDump,
    TRANSCRIPTION_BLOCK_START,
    "## Source-bound field transcription",
    "- Transcribe phone from harvest source spans",
    "- Transcribe email from harvest source spans",
    TRANSCRIPTION_BLOCK_END,
    "",
  ].join("\n");
  const draft: MachineBusinessDraft = {
    schemaVersion: 1,
    selected: [{
      field: "phone", value: "215-555-0100", source: "contact.md", excerpt: "Call 215-555-0100",
      candidateId: "c1", confidence: 0.96,
    }],
    unresolved: [{ field: "email", reason: "uncertain", candidateIds: ["c2"], notes: "keep email sources" }],
    conflicts: [],
    candidateCoverage: [
      { field: "phone", cardinality: "single", candidateCount: 1, evaluatedCount: 1, complete: true },
      { field: "email", cardinality: "single", candidateCount: 1, evaluatedCount: 1, complete: false },
    ],
    rawJudgments: [],
    investigationObligations: [],
  };
  const agentOwned = applyBusinessAuthorPacketReduction({ packet, eligible: false, draft });
  const delegated = applyBusinessAuthorPacketReduction({ packet, eligible: true, draft });
  assert.ok(agentOwned.packet.includes("Transcribe phone"));
  assert.ok(delegated.packet.includes("Transcribe email"), "unresolved fields keep their transcription obligation");
  assert.equal(delegated.packet.includes("Transcribe phone"), false, "covered phone transcription is removed only after complete coverage");
  assert.ok(delegated.packet.includes(harvestDump), "remaining harvest bytes are not silently dropped; that is not token savings");
  assert.equal(agentOwned.reduced, false);
  assert.equal(delegated.reduced, true);
});

test("Goal contract traces obligations and invalidates the right slice", () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });
  save(join(root, "onboarding/business.json"), sampleBusiness);
  writeFileSync(join(root, "onboarding/storyboard.json"), JSON.stringify({
    pages: [{ path: "/", id: "home" }, { path: "/contact", id: "contact" }],
  }), "utf8");
  const contract = buildGoalContract(root);
  assert.ok(contract.obligations.some(o => o.kind === "offer"));
  const next = {
    ...contract,
    obligations: contract.obligations.map(o => o.kind === "offer" ? { ...o, statement: "Gutter cleaning" } : o),
  };
  const changed = changedGoalIds(contract, next);
  assert.ok(changed.length >= 1);
  const nodes = invalidateDependentNodes(["offer"]);
  assert.ok(nodes.includes("copy"));
  const missing = missingGoalFindings(root, contract);
  assert.ok(Array.isArray(missing));
});

test("Quality checks escalate unsupported superlatives and CTA mismatches", async () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });
  mkdirSync(join(root, "agent/runs"), { recursive: true });
  save(join(root, "onboarding/business.json"), sampleBusiness);
  writeFileSync(join(root, "onboarding/storyboard.json"), JSON.stringify({
    pages: [{ path: "/", actions: [{ label: "Contact us", href: "/contact" }] }],
  }), "utf8");
  writeFileSync(join(root, "onboarding/copy-plan.json"), JSON.stringify({
    pages: [{
      path: "/",
      sections: [{
        id: "hero",
        heading: "Award-winning team",
        body: "Best in the county.",
        cta: "Schedule a visit",
        factIds: ["f1"],
      }],
    }],
  }), "utf8");
  const client = new JevClient({
    root, apiKey: "test-key", fetch: async (_i, init) => mixedFetch(init),
    config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
  });
  const result = await runQualityChecks({
    root, client, nodeId: "copy-review", preparationId: "prep-quality",
  });
  assert.equal(result.status, "completed");
  assert.ok(result.findings.some(f => f.kind === "cta_mismatch" || f.kind === "exaggerated_strength"));
});

test("prepareStage injects quality findings for copy-review and byte-only edits do not resolve them", async () => {
  const { root, graph, state } = createCopyReviewSite();
  const client = new JevClient({
    root, apiKey: "test-key", fetch: async (_i, init) => mixedFetch(init),
    config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
  });
  const prep = await prepareStage({
    root, kernel, graph, state, nodeId: "copy-review",
    jevConfig: {
      ...loadJevConfig(root),
      mode: "assist",
      workOwnership: "agent",
      model: "jev-1.13.0",
      capabilities: {
        grounding: "off",
        claimStrengthening: "assist",
        ctaFidelity: "assist",
        coverageCheck: "assist",
        crossStageContinuity: "assist",
      },
    },
    jevClient: client,
  });
  assert.equal(prep.status, "prepared");
  const current = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  assert.ok(current.includes("Jev quality findings"));
  assert.ok(/cta_mismatch|exaggerated_strength|intent_gap/.test(current));
  const unresolved = verifyRepairResolution({
    root,
    previousArtifactContent: "Award-winning team",
    currentArtifactContent: "Award-winning team ",
    finding: {
      id: "assert_1_exaggerated_strength",
      page: "/",
      section: "hero",
      evidence: "f1",
      severity: "major",
      problem: "exaggerated_strength at /#hero",
      repair: "Remove unsupported superlative",
      target: "copy",
      verify: "Assertion must match cited evidence",
    },
  });
  assert.equal(unresolved.resolved, false);
  const stillUnresolved = verifyRepairResolution({
    root,
    previousArtifactContent: "Award-winning team",
    currentArtifactContent: "Local roof repairs for homeowners",
    finding: {
      id: "assert_1_exaggerated_strength",
      page: "/",
      section: "hero",
      evidence: "f1",
      severity: "major",
      problem: "exaggerated_strength at /#hero",
      repair: "Remove unsupported superlative",
      target: "copy",
      verify: "Assertion must match cited evidence",
    },
  });
  assert.equal(stillUnresolved.resolved, false);
  assert.ok(stillUnresolved.reason.includes("semantic"));
  const resolved = verifyRepairResolution({
    root,
    previousArtifactContent: "Award-winning team",
    currentArtifactContent: "Local roof repairs for homeowners",
    semanticResolved: true,
    finding: {
      id: "assert_1_exaggerated_strength",
      page: "/",
      section: "hero",
      evidence: "f1",
      severity: "major",
      problem: "exaggerated_strength at /#hero",
      repair: "Remove unsupported superlative",
      target: "copy",
      verify: "Assertion must match cited evidence",
    },
  });
  assert.equal(resolved.resolved, true);
});

test("Creative scoring stores raw distributions and applies a factual gate", async () => {
  const root = temp();
  const client = new JevClient({
    root, apiKey: "test-key", fetch: async (_i, init) => mixedFetch(init),
    config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
  });
  const scores = await scoreCreativeCandidates({
    client,
    nodeId: "direction-review",
    context: "Roof repairs for homeowners",
    candidates: [
      { id: "A", proposal: "Warm editorial for local trade" },
      { id: "B", proposal: "We guarantee results you cannot refuse" },
    ],
    factualGate: p => !/guarantee results you cannot refuse/i.test(p),
  });
  assert.equal(scores.length, 2);
  assert.ok(scores[0]!.dimensions.audience_fit);
  assert.equal(scores.find(s => s.id === "B")?.factualGateFailed, true);
  assert.equal(scores.find(s => s.id === "B")?.combined, 0);
});

test("Observations keep unknown agent usage unknown; targeted repair is exact", () => {
  const root = temp();
  const path = writeNodeObservation(root, { preparationId: "p1", nodeId: "copy" });
  const obs = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(obs.agentInputTokens, "unknown");
  const block = formatTargetedRepairBlock({
    findingId: "f1", location: "/#hero", before: "Award-winning", sourceSpan: "home.md:12",
    verification: "Remove unsupported superlative", constraints: ["keep phone"],
  });
  assert.ok(block.includes("mere byte change"));
  assert.equal(shouldEscalateRepeatedUncertainty(1), true);
});

test("Pilot recipe refuses uncalibrated arm C; defaults remain off/agent", () => {
  const root = temp();
  const denied = assertPilotArmAllowed({ arm: "C", taskIds: ["business-review-grounding"], root });
  assert.equal(denied.ok, false);
  assert.equal(assertPilotArmAllowed({ arm: "A", taskIds: ["business-review-grounding"], root }).ok, true);
  assert.deepEqual(defaultRollout(), { mode: "off", workOwnership: "agent" });
  assert.ok(FROZEN_PILOT_RECIPE.command.includes("eval-jev"));
  assert.ok(expectedJevBudget().maxTransportAttempts);
});

test("npm test script still cannot make live TypeSafe requests", () => {
  const pkg = JSON.parse(readFileSync(join(kernel, "package.json"), "utf8"));
  assert.equal(pkg.scripts.test.includes("--live"), false);
  assert.equal(defaultRollout().mode, "off");
});

function assistQualityConfig(root: string) {
  return {
    ...loadJevConfig(root),
    mode: "assist" as const,
    workOwnership: "agent" as const,
    model: "jev-1.13.0",
    capabilities: {
      grounding: "off" as const,
      claimStrengthening: "assist" as const,
      ctaFidelity: "assist" as const,
      coverageCheck: "assist" as const,
      crossStageContinuity: "assist" as const,
    },
  };
}

function passingCopyReview(subjectHash: string): Review {
  return {
    version: 2,
    subjectHash,
    verdict: "pass",
    reviewer: "critic",
    evidence: ["onboarding/copy-plan.json"],
    checks: [
      { criterion: "accuracy", verdict: "pass", evidence: "valid" },
      { criterion: "clarity", verdict: "pass", evidence: "valid" },
      { criterion: "specificity", verdict: "pass", evidence: "valid" },
      { criterion: "continuity", verdict: "pass", evidence: "valid" },
      { criterion: "cta-behavior", verdict: "pass", evidence: "valid" },
    ],
    findings: [],
    partitions: ["/"],
  };
}

test("Adversarial fixtures produce precise quality findings", async () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "agent"), { recursive: true });
  save(join(root, "onboarding/business.json"), {
    ...sampleBusiness,
    evidence: [
      { id: "e1", source: "onboarding/copy/home.md", excerpt: "We repair roofs. Call 215-555-0100. Open weekdays 9am to 5pm." },
    ],
  });
  writeFileSync(join(root, "onboarding/copy-plan.json"), JSON.stringify({
    pages: [{
      path: "/",
      sections: [{
        id: "hero",
        heading: "Award-winning team",
        body: "Best in the county. Call 800-555-0199. Open weekdays 9am to 5pm.",
        cta: "Schedule a visit",
        factIds: ["f1"],
      }],
    }],
  }), "utf8");
  writeFileSync(join(root, "onboarding/storyboard.json"), JSON.stringify({
    pages: [{ path: "/", actions: [{ label: "Contact us", href: "/contact" }] }],
  }), "utf8");
  writeFileSync(join(root, "pages/index.html"), `<section id="hero"><h1>Award-winning team</h1><p>Open 24/7 emergency service. Call 800-555-0199.</p><a class="btn" href="mailto:spam@ex.test">Schedule a visit</a></section>`, "utf8");
  const planned = extractPlannedAssertions(root);
  assert.ok(planned.every(a => {
    const ev = formatEvidenceForJev(a);
    return !ev || a.evidence.some(e => ev.includes(e.excerpt));
  }), "Jev evidence must be ledger excerpts, never the assertion as fallback");
  assert.ok(planned.some(a => a.evidenceStatus === "resolved" && a.evidence[0]?.excerpt.includes("We repair roofs")));
  const phones = unauthorizedContactFindings(root, planned);
  assert.ok(phones.some(p => p.phone === "8005550199"));
  const delta = comparePlannedToRendered(planned, extractRenderedAssertions(root));
  assert.ok(delta.strengthened.some(p => /24\/7/.test(p.rendered.text)));
  const client = new JevClient({
    root, apiKey: "test-key", fetch: async (_i, init) => mixedFetch(init),
    config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
  });
  const copy = await runQualityChecks({ root, client, nodeId: "copy-review", preparationId: "adv-copy" });
  assert.ok(copy.findings.some(f => f.kind === "exaggerated_strength" || f.kind === "unsupported" || f.kind === "third_party_contact"));
  assert.ok(copy.findings.some(f => f.kind === "third_party_contact"));
  assert.ok(copy.findings.some(f => f.kind === "cta_mismatch" || f.kind === "broken_link"));
  const rendered = await runQualityChecks({ root, client, nodeId: "content-review", preparationId: "adv-content" });
  assert.ok(rendered.findings.some(f => f.kind === "dropped_qualification" || f.kind === "third_party_contact" || f.kind === "cta_mismatch"));
  const contract = buildGoalContract(root);
  writeFileSync(join(root, "onboarding/copy-plan.json"), JSON.stringify({
    pages: [{ path: "/", sections: [{ id: "hero", heading: "Hello", body: "Welcome to our page today.", factIds: ["f1"] }] }],
  }), "utf8");
  const missing = missingGoalFindings(root, contract);
  assert.ok(missing.some(m => m.priority === "must"));
});

test("Changed operator-approved goals invalidate only dependent nodes", () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });
  mkdirSync(join(root, "agent"), { recursive: true });
  save(join(root, "onboarding/business.json"), sampleBusiness);
  writeFileSync(join(root, "agent/request.json"), JSON.stringify({ instruction: "Keep the financing FAQ." }), "utf8");
  const first = syncGoalContract(root);
  const operatorIds = first.contract.obligations.filter(o => o.owner === "operator").map(o => o.id);
  assert.ok(operatorIds.length >= 1);
  save(join(root, "onboarding/business.json"), { ...sampleBusiness, offer: "Gutter cleaning" });
  const second = syncGoalContract(root);
  assert.ok(second.changedIds.length >= 1);
  assert.ok(second.invalidatedNodes.includes("copy"));
  assert.equal(second.invalidatedNodes.includes("harvest"), false);
  const stillFrozen = second.contract.obligations.filter(o => o.owner === "operator");
  assert.equal(stillFrozen.length, operatorIds.length);
  assert.ok(stillFrozen.every(o => o.frozen && o.statement.includes("financing FAQ")));
});

test("prepareStage -> completeStage fails on a Jev defect then passes after targeted repair", async () => {
  const { root, graph, state } = createCopyReviewSite();
  const qualityFetch = async (_i: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}"));
    const answers: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(body.questions || {})) {
      const q = raw as { type?: string; criteria?: Record<string, string> };
      const blob = JSON.stringify(raw);
      if (q.type === "noul") {
        if (/Visitor question/i.test(blob)) {
          answers[key] = { type: "noul", noul: 0.96 };
        } else {
          const high = /award-winning|best in the county/i.test(blob);
          answers[key] = { type: "noul", noul: high ? 0.96 : 0.05 };
        }
      } else if (q.type === "score") {
        answers[key] = { type: "score", score: 3, confidence: 0.9, probabilities: { "0": 0.04, "1": 0.04, "2": 0.08, "3": 0.72, "4": 0.12 } };
      } else {
        const criteria = q.criteria && !Array.isArray(q.criteria) ? q.criteria : {};
        const ids = Object.keys(criteria);
        const mismatch = ids.includes("mismatch") && /Schedule a visit/i.test(blob);
        const choice = mismatch ? "mismatch" : (ids.includes("match") ? "match" : (ids[0] || "supports"));
        const probabilities: Record<string, number> = {};
        for (const id of ids) probabilities[id] = id === choice ? 0.9 : 0.1 / Math.max(ids.length - 1, 1);
        const sum = Object.values(probabilities).reduce((a, b) => a + b, 0) || 1;
        for (const id of Object.keys(probabilities)) probabilities[id] = (probabilities[id] ?? 0) / sum;
        answers[key] = { type: "choice", choice, confidence: 0.9, probabilities };
      }
    }
    return new Response(JSON.stringify({
      model: "jev-1.13.0", answers, usage: { input_tokens: 18, output_tokens: 4 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new JevClient({
    root, apiKey: "test-key", fetch: qualityFetch,
    config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
  });
  const jevConfig = assistQualityConfig(root);
  const prep1 = await prepareStage({ root, kernel, graph, state, nodeId: "copy-review", jevConfig, jevClient: client });
  assert.equal(prep1.status, "prepared");
  save(join(root, "agent/reviews/copy-review.json"), passingCopyReview(prep1.preparation!.reviewSubjectHash || "h"));
  const fail = await completeStage({
    root, kernel, graph, state, preparationId: prep1.preparation!.id, jevConfig,
  });
  assert.equal(fail.ok, false);
  assert.ok(fail.failures.some(f => /Unresolved Jev finding|incompatible with a passing critic/.test(f)));
  const repair = buildRepairPacket({ root, kernel, node: graph.nodes.find(n => n.id === "copy")!, state: fail.state, graph });
  assert.ok(repair.failedFindings.length >= 1);

  writeFileSync(join(root, "onboarding/copy-plan.json"), JSON.stringify({
    pages: [{
      path: "/",
      sections: [{
        id: "hero",
        heading: "Roof repairs for homeowners",
        body: "We repair roofs.",
        cta: "Contact us",
        factIds: ["f1"],
      }],
    }],
  }), "utf8");
  writeFileSync(join(root, "pages/contact.html"), "<section id=\"main\"><h1>Contact</h1><p>Reach the roof crew about a repaired roof.</p></section>", "utf8");
  const copyNode = graph.nodes.find(n => n.id === "copy")!;
  fail.state.nodes.copy = {
    status: "done",
    attempts: 2,
    inputHash: "copy-fixed",
    outputHash: fingerprint(root, copyNode.writes),
    skillHash: "copy-fixed",
  };
  save(join(root, "agent/STATE.json"), fail.state);
  const prep2 = await prepareStage({ root, kernel, graph, state: fail.state, nodeId: "copy-review", jevConfig, jevClient: client });
  assert.equal(prep2.status, "prepared");
  save(join(root, "agent/reviews/copy-review.json"), passingCopyReview(prep2.preparation!.reviewSubjectHash || "h"));
  const pass = await completeStage({
    root, kernel, graph, state: fail.state, preparationId: prep2.preparation!.id, jevConfig,
  });
  assert.equal(pass.ok, true, `Expected pass after repair, got: ${pass.failures.join("; ")}`);
});

test("Unchanged subjects are not re-queried; shadow packet matches off", async () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });
  mkdirSync(join(root, "agent/runs"), { recursive: true });
  save(join(root, "onboarding/business.json"), sampleBusiness);
  writeFileSync(join(root, "onboarding/copy-plan.json"), JSON.stringify({
    pages: [{ path: "/", sections: [{ id: "hero", heading: "We repair roofs for homeowners", body: "We repair roofs for local homeowners.", factIds: ["f1"] }] }],
  }), "utf8");
  writeFileSync(join(root, "onboarding/storyboard.json"), JSON.stringify({ pages: [{ path: "/" }] }), "utf8");
  let questionIds: string[] = [];
  const countingFetch = async (_i: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}"));
    questionIds.push(...Object.keys(body.questions || {}));
    return mixedFetch(init);
  };
  const client = new JevClient({
    root, apiKey: "test-key", fetch: countingFetch,
    config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
  });
  await runQualityChecks({ root, client, nodeId: "copy-review", preparationId: "q1" });
  const first = questionIds.length;
  questionIds = [];
  await runQualityChecks({ root, client, nodeId: "copy-review", preparationId: "q2" });
  assert.ok(first > 0);
  assert.ok(questionIds.length < first, "passed subjects must not be re-queried");

  const offSite = createCopyReviewSite();
  const shadowSite = createCopyReviewSite();
  const capsOff = {
    grounding: "off" as const, claimStrengthening: "off" as const, ctaFidelity: "off" as const,
    coverageCheck: "off" as const, crossStageContinuity: "off" as const,
  };
  const offPrep = await prepareStage({
    root: offSite.root, kernel, graph: offSite.graph, state: offSite.state, nodeId: "copy-review",
    jevConfig: { ...loadJevConfig(offSite.root), mode: "off", workOwnership: "agent", capabilities: capsOff },
  });
  const shadowPrep = await prepareStage({
    root: shadowSite.root, kernel, graph: shadowSite.graph, state: shadowSite.state, nodeId: "copy-review",
    jevConfig: { ...loadJevConfig(shadowSite.root), mode: "shadow", workOwnership: "agent", capabilities: { ...capsOff, claimStrengthening: "shadow" } },
    jevClient: new JevClient({
      root: shadowSite.root, apiKey: "test-key", fetch: async (_i, init) => mixedFetch(init),
      config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
    }),
  });
  const strip = (s: string) => s.replace(/Preparation ID: .+/g, "Preparation ID: <id>").replace(/--preparation \S+/g, "--preparation <id>");
  const offBody = strip(readFileSync(join(offSite.root, "agent/CURRENT.md"), "utf8"));
  const shadowBody = strip(readFileSync(join(shadowSite.root, "agent/CURRENT.md"), "utf8"));
  assert.equal(offPrep.status, "prepared");
  assert.equal(shadowPrep.status, "prepared");
  assert.equal(offBody.includes("Jev quality findings"), false);
  assert.equal(shadowBody.includes("Jev quality findings"), false);
  assert.equal(offBody, shadowBody);
});

test("Agent usage receipts are immutable and missing usage is never zero savings", () => {
  const root = temp();
  const measured = recordAgentStageAttempt({
    root, nodeId: "copy", preparationId: "p1", attemptId: "p1:1", kind: "agent",
    inputTokens: 100, outputTokens: 20, cacheReadTokens: 8, source: "host_export",
  });
  assert.equal(measured.coverage, "measured");
  const failed = recordAgentStageAttempt({
    root, nodeId: "copy", preparationId: "p1", attemptId: "p1:2", kind: "agent",
    source: "unavailable",
  });
  const retry = recordAgentStageAttempt({
    root, nodeId: "copy", preparationId: "p1", attemptId: "p1:3", kind: "agent",
    inputTokens: 40, outputTokens: 10, source: "structured_log",
  });
  assert.notEqual(failed.receiptId, retry.receiptId);
  recordAgentStageAttempt({
    root, nodeId: "harvest", preparationId: "p-tool", attemptId: "p-tool:1", kind: "tool",
    source: "unavailable",
  });
  const omitted = recordAgentStageAttempt({
    root, nodeId: "pages", preparationId: "p-miss", attemptId: "p-miss:1", kind: "agent",
    source: "unavailable",
  });
  assert.equal(omitted.coverage, "unknown");
  const reconciled = writeAgentAttemptReceipt(root, measured);
  assert.ok(reconciled);
  assert.throws(() => writeAgentAttemptReceipt(root, { ...measured, inputTokens: 999 }));
  const agg = aggregateAgentUsage([measured, failed, retry, omitted], ["copy", "pages"]);
  assert.equal(agg.coverage, "incomplete");
  assert.ok(agg.missingRequired);
  const completeArm = aggregateAgentUsage([
    recordAgentStageAttempt({
      root, nodeId: "copy", preparationId: "a1", attemptId: "a1:1", kind: "agent",
      runId: "A", inputTokens: 200, outputTokens: 50, source: "host_export",
    }),
  ], ["copy"]);
  const missingArm = aggregateAgentUsage([omitted], ["copy"]);
  const cmp = compareAgentUsageArms(completeArm, missingArm);
  assert.equal(cmp.verdict, "measurement_incomplete");
  assert.equal(cmp.savingsPct, null);
  const nested = tokensFromNestedUsage({ usage: { inputTokens: 9, outputTokens: 3, unknown: true } });
  assert.equal(nested.unknown, true);

  const trial = temp();
  writeFileSync(join(trial, "run-A.json"), JSON.stringify({
    runId: "run-A", treatment: "A", transportCalls: 1, label: "A",
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    clockDurationMs: 10, cacheHits: 0, totalEvaluations: 1,
  }), "utf8");
  writeFileSync(join(trial, "run-B.json"), JSON.stringify({
    runId: "run-B", treatment: "B", transportCalls: 1, label: "B",
    usage: { unknown: true },
    clockDurationMs: 10, cacheHits: 0, totalEvaluations: 1,
  }), "utf8");
  const loaded = loadTrialMetrics(trial);
  assert.equal(loaded.runA?.inputTokens, 100);
  assert.equal(loaded.runB?.inputTokens, undefined);
  const report = compareRunMetrics(loaded.runA!, loaded.runB!);
  assert.equal(report.verdict, "measurement_incomplete");
  assert.equal(report.comparisons.bVsA.tokenSavingsPct, null);
});

test("Dry-run A/B emits provenance and usage manifests without running C", () => {
  const a = temp();
  const b = temp();
  writeFileSync(join(a, "launch.json"), "{\"name\":\"A\"}", "utf8");
  writeFileSync(join(b, "launch.json"), "{\"name\":\"A\"}", "utf8");
  mkdirSync(join(a, "agent"));
  mkdirSync(join(b, "agent"));
  const planned = emitMatchedAbProcedure({ kernel, rootA: a, rootB: b });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const out = temp();
  const written = writeDryRunManifests({ outDir: out, procedure: planned.procedure });
  const provenance = JSON.parse(readFileSync(written.provenancePath, "utf8"));
  const usage = JSON.parse(readFileSync(written.usagePath, "utf8"));
  assert.equal(provenance.armC, "blocked");
  assert.equal(provenance.executed, false);
  assert.equal(usage.comparison.verdict, "measurement_incomplete");
  assert.equal(usage.comparison.savingsPct, null);
  assert.equal(assertPilotArmAllowed({ arm: "C", taskIds: ["cta-fidelity-check"], root: a }).ok, false);
});

test("Labeled datasets exceed seven examples per task", () => {
  for (const taskId of Object.keys(TASK_DATASETS)) {
    assert.ok((TASK_DATASETS[taskId] || []).length > 7, taskId);
  }
});
