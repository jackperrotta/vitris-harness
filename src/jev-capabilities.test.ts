import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { choice, type ChoiceQuestion } from "@typesafe-ai/sdk";
import { JevClient } from "./agent/jev/client.ts";
import {
  buildOrUpdateLedger,
  deriveClaimStatus,
  getUnresolvedContradictions,
  invalidateJudgments,
  loadEvidenceLedger,
  lookupJudgment,
  recordJudgment,
  resolveContradiction,
  saveEvidenceLedger,
  sha256,
  type EvidenceLedger,
} from "./agent/jev/ledger.ts";
import {
  executeBatches,
  partitionBatchItems,
  type BatchableQuestion,
  type BatchPartition,
} from "./agent/jev/batching.ts";
import {
  computeDenseVector,
  cosineSimilarity,
  lexicalRetrieve,
  measureShortlistRecall,
  QueryEmbeddingCache,
  rankAndSliceEvidence,
  semanticRerank,
} from "./agent/jev/ranking.ts";
import {
  resolveCapability,
  isCapabilityActive,
  DEFAULT_JEV_CAPABILITIES,
  type JevConfig,
} from "./agent/jev/config.ts";
import {
  makeDirectionScoreQuestion,
  makeMediaRelevanceQuestion,
  DIRECTION_SCORE_RUBRICS,
  MEDIA_RELEVANCE_RUBRIC,
  questionSemanticsHash,
} from "./agent/jev/questions.ts";
import {
  loadPreferences,
  savePreferences,
  matchPreferences,
  DEFAULT_BRAND_PREFERENCE_RUBRIC,
  type PreferenceRubric,
} from "./agent/jev/preferences.ts";
import {
  auditExtractionCompleteness,
  extractHarvestFacts,
  loadExtractedFacts,
  saveExtractedFacts,
  verifyCopyTraceability,
  type StructuredFact,
} from "./agent/jev/extraction.ts";
import {
  buildFocusedCriticContext,
  loadCriticHistory,
  makeFindingSignature,
  recordAndEscalateFindings,
  toStandardFinding,
  type StructuredCriticFinding,
} from "./agent/jev/critic-report.ts";
import {
  checkCrossStageConsistency,
  traceClaimLineage,
  detectBrokenLineage,
} from "./agent/jev/consistency.ts";
import {
  buildRepairPacket,
  verifyRepairResolution,
} from "./agent/jev/repair.ts";
import {
  compareRuns,
  compareRunMetrics,
  formatComparativeReport,
  loadTrialMetrics,
  type RunMetrics,
} from "./agent/jev/evaluation.ts";
import { resolveTreatmentCapabilities, VALID_ABLATIONS } from "../scripts/eval-jev.ts";
import {
  selectDiverseEvidence,
  partitionByObligation,
  expandPacketItem,
  computeManifestHash,
  type CoverageManifest,
} from "./agent/jev/packets.ts";
import { rehashOverflowContent } from "./agent/jev/state.ts";
import { save, type Business, type Finding, type Storyboard, type Review } from "./agent/artifacts.ts";

const temp = () => mkdtempSync(join(tmpdir(), "vitris-phase2-"));

// =============================================================================
// Capability 1: Reusable Evidence Ledger
// =============================================================================

test("Capability 1: Evidence Ledger indexes harvested evidence with stable IDs, hashes, and aliases", () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });

  const sampleBusiness: Business = {
    version: 2,
    offer: "Cotswold heritage stone slate conservation and masonry.",
    audience: "Historic property owners across Gloucestershire.",
    trigger: "Stone slate roof failure or listed building restoration.",
    outcome: "Structurally sound, vernacular conservation craft.",
    includes: ["Quarry slate sourcing", "Timber rafter repair", "Lime mortar pointing"],
    engagement: "Call 01452 789123 or email info@cotswoldheritage.co.uk",
    positioning: "Master heritage roofing specialists",
    facts: [
      { id: "f1", claim: "Established in 1988 with 35+ years experience", evidence: ["ev1"] },
      { id: "f2", claim: "Fully insured with 25-year craft guarantee", evidence: ["ev2"] },
      { id: "f3", claim: "Uncited claim without evidence", evidence: [] },
    ],
    evidence: [
      { id: "ev1", source: "onboarding/raw/about.json", excerpt: "Founded in 1988, Cotswold Heritage has over 35 years of masonry craft." },
      { id: "ev2", source: "onboarding/raw/guarantee.json", excerpt: "All completed stone installations include our 25-year craft guarantee and full liability insurance." },
    ],
    uncertainties: [],
  };
  save(join(root, "onboarding/business.json"), sampleBusiness);

  // Build ledger
  const ledger = buildOrUpdateLedger(root);
  assert.equal(ledger.schemaVersion, 1);
  assert.ok(ledger.items.length >= 2);

  // Verify stable collision-free SHA-256 hashes
  const item1 = ledger.items.find(i => i.id === "ev1")!;
  assert.ok(item1);
  assert.equal(item1.hash, sha256(item1.text));
  assert.equal(item1.source, "onboarding/raw/about.json");

  // Verify claims discovered with proper initial status
  assert.equal(ledger.claims["f1"]?.status, "unknown");
  assert.equal(ledger.claims["f2"]?.status, "unknown");
  assert.equal(ledger.claims["f3"]?.status, "unsupported"); // preserved unsupported state!
});

test("Capability 1: Evidence Ledger reuses judgments across review stages and preserves unknown/unsupported states", () => {
  const root = temp();
  const ledger = buildOrUpdateLedger(root);

  // Record a judgment during business-review
  const judgment = recordJudgment(ledger, {
    claimId: "f1",
    evidenceId: "ev1",
    claimText: "Established in 1988 with 35+ years experience",
    evidenceText: "Founded in 1988, Cotswold Heritage has over 35 years of masonry craft.",
    questionKey: "relation",
    verdict: "verified",
    confidence: 0.98,
    relation: "supports",
    notes: "Direct confirmation of founding year and experience.",
    nodeId: "business-review",
  });

  assert.equal(judgment.verdict, "verified");
  assert.equal(ledger.claims["f1"]?.status, "verified");

  // Later stage (narrative-review or copy-review) looks up the judgment
  const reused = lookupJudgment(ledger, {
    claimId: "f1",
    evidenceId: "ev1",
    claimText: "Established in 1988 with 35+ years experience",
    evidenceText: "Founded in 1988, Cotswold Heritage has over 35 years of masonry craft.",
    questionKey: "relation",
  });

  assert.ok(reused, "Judgment should be found in ledger");
  assert.equal(reused.verdict, "verified");
  assert.equal(reused.confidence, 0.98);

  // Invalidate judgments when claim f1 text changes
  const inv = invalidateJudgments(ledger, {
    changedClaimIds: ["f1"],
    reason: "Fact wording updated by copy edit",
  });
  assert.equal(inv.invalidatedCount, 1);

  // Re-lookup after invalidation returns undefined
  const postInv = lookupJudgment(ledger, {
    claimId: "f1",
    evidenceId: "ev1",
    questionKey: "relation",
  });
  assert.equal(postInv, undefined, "Invalidated judgment must not be reused");

  // Claim status reverts to unknown, but unsupported states remain preserved
  assert.equal(ledger.claims["f1"]?.status, "unknown");
});

test("Capability 1: Evidence Ledger stores claim contradictions and unresolved states", () => {
  const root = temp();
  const ledger = buildOrUpdateLedger(root);

  ledger.claims["f_hours"] = {
    id: "f_hours",
    claim: "Open 24/7 for emergency repairs",
    sourceFile: "onboarding/business.json",
    field: "facts",
    citedEvidenceIds: ["ev_hours"],
    status: "unknown",
  };

  recordJudgment(ledger, {
    claimId: "f_hours",
    evidenceId: "ev_hours",
    claimText: "Open 24/7 for emergency repairs",
    evidenceText: "Business hours: Monday to Friday 8:00 AM to 5:00 PM. Closed weekends.",
    questionKey: "relation",
    verdict: "contradicted",
    confidence: 0.95,
    relation: "contradicts",
    notes: "Evidence excerpt explicitly states closed weekends, contradicting 24/7 claim.",
    nodeId: "business-review",
  });

  assert.equal(ledger.claims["f_hours"]?.status, "contradicted");
  const contradictions = getUnresolvedContradictions(ledger);
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0]?.claimId, "f_hours");

  // Resolve contradiction
  const resolved = resolveContradiction(ledger, contradictions[0]!.id, "Updated claim to Mon-Fri 8am-5pm");
  assert.equal(resolved, true);
  assert.equal(getUnresolvedContradictions(ledger).length, 0);
});

test("Capability 1 (Regression): Ledger enforces model, question semantics, policy threshold, and source freshness provenance", () => {
  const root = temp();
  mkdirSync(join(root, "onboarding/raw"), { recursive: true });
  const rawAboutPath = join(root, "onboarding/raw/about.json");
  const rawAboutContent = "Over 500 conservation projects completed across Gloucestershire.";
  writeFileSync(rawAboutPath, rawAboutContent, "utf8");

  const ledger = buildOrUpdateLedger(root);
  const sourceHash = sha256(rawAboutContent);

  // Add indexed evidence item matching rawAboutPath
  ledger.items.push({
    id: "ev_projects",
    hash: sourceHash,
    source: "onboarding/raw/about.json",
    aliases: [],
    text: rawAboutContent,
    candidateType: "harvest_raw",
  });

  // Record judgment with full provenance
  recordJudgment(ledger, {
    claimId: "c_projects",
    evidenceId: "ev_projects",
    claimText: "500+ projects completed",
    evidenceText: rawAboutContent,
    questionKey: "relation",
    verdict: "verified",
    confidence: 0.88,
    relation: "supports",
    model: "jev-1.13.0",
    questionSemantics: "Does evidence confirm claim?",
    sourcePath: "onboarding/raw/about.json",
    sourceHash,
    policyThreshold: 0.85,
  });

  // 1. Exact lookup succeeds
  const exact = lookupJudgment(ledger, {
    claimId: "c_projects",
    evidenceId: "ev_projects",
    questionKey: "relation",
    expectedModel: "jev-1.13.0",
    expectedQuestionSemantics: "Does evidence confirm claim?",
    minConfidence: 0.85,
    validateSource: true,
  });
  assert.ok(exact, "Exact match with valid provenance must succeed");
  assert.equal(exact.verdict, "verified");

  // 2. Model mismatch fails closed
  const modelMismatch = lookupJudgment(ledger, {
    claimId: "c_projects",
    evidenceId: "ev_projects",
    questionKey: "relation",
    expectedModel: "jev-1.14.0",
  });
  assert.equal(modelMismatch, undefined, "Model change must invalidate cached verdict");

  // 3. Question semantics mismatch fails closed
  const questionMismatch = lookupJudgment(ledger, {
    claimId: "c_projects",
    evidenceId: "ev_projects",
    questionKey: "relation",
    expectedQuestionSemantics: "Does evidence contradict claim?",
  });
  assert.equal(questionMismatch, undefined, "Question semantics change must invalidate cached verdict");

  // 4. Policy threshold rejection: confidence 0.88 is rejected when minConfidence is 0.90
  const policyRejected = lookupJudgment(ledger, {
    claimId: "c_projects",
    evidenceId: "ev_projects",
    questionKey: "relation",
    minConfidence: 0.90,
  });
  assert.equal(policyRejected, undefined, "Higher policy threshold (0.90) must reject 0.88 confidence");

  // Policy threshold acceptance: confidence 0.88 is accepted when minConfidence is 0.85
  const policyAccepted = lookupJudgment(ledger, {
    claimId: "c_projects",
    evidenceId: "ev_projects",
    questionKey: "relation",
    minConfidence: 0.85,
  });
  assert.ok(policyAccepted, "Confidence 0.88 must satisfy 0.85 threshold");

  // 5. Source hash change invalidates judgment lookup
  const item = ledger.items.find(i => i.id === "ev_projects")!;
  item.hash = sha256("Modified evidence content");
  const sourceInvalidated = lookupJudgment(ledger, {
    claimId: "c_projects",
    evidenceId: "ev_projects",
    questionKey: "relation",
    validateSource: true,
  });
  assert.equal(sourceInvalidated, undefined, "Modified source evidence hash must invalidate judgment");
});

test("Capability 1 (Regression): Claim status is order-invariant under conflicting judgments and derives status deterministically", () => {
  const root = temp();

  // Scenario A: contradicted recorded first, then verified
  const ledgerA = buildOrUpdateLedger(root);
  recordJudgment(ledgerA, {
    claimId: "claim_order",
    evidenceId: "ev_neg",
    claimText: "Available 24/7",
    evidenceText: "Closed on weekends",
    questionKey: "relation",
    verdict: "contradicted",
    confidence: 0.95,
    relation: "contradicts",
  });
  assert.equal(ledgerA.claims["claim_order"]?.status, "contradicted");

  // Now record a verified judgment for the same claim
  recordJudgment(ledgerA, {
    claimId: "claim_order",
    evidenceId: "ev_pos",
    claimText: "Available 24/7",
    evidenceText: "24/7 emergency dispatch service",
    questionKey: "relation",
    verdict: "verified",
    confidence: 0.90,
    relation: "supports",
  });
  // Must REMAIN contradicted despite verified being recorded later!
  assert.equal(ledgerA.claims["claim_order"]?.status, "contradicted", "Contradiction must take precedence over support regardless of order");

  // Scenario B: verified recorded first, then contradicted
  const ledgerB = buildOrUpdateLedger(root);
  recordJudgment(ledgerB, {
    claimId: "claim_order",
    evidenceId: "ev_pos",
    claimText: "Available 24/7",
    evidenceText: "24/7 emergency dispatch service",
    questionKey: "relation",
    verdict: "verified",
    confidence: 0.90,
    relation: "supports",
  });
  assert.equal(ledgerB.claims["claim_order"]?.status, "verified");

  // Now record contradicted judgment
  recordJudgment(ledgerB, {
    claimId: "claim_order",
    evidenceId: "ev_neg",
    claimText: "Available 24/7",
    evidenceText: "Closed on weekends",
    questionKey: "relation",
    verdict: "contradicted",
    confidence: 0.95,
    relation: "contradicts",
  });
  assert.equal(ledgerB.claims["claim_order"]?.status, "contradicted", "Order B must also yield contradicted status");

  // Resolving contradiction recomputes status and restores verified (since supporting judgment exists)
  const contra = getUnresolvedContradictions(ledgerB);
  assert.equal(contra.length, 1);
  const resolved = resolveContradiction(ledgerB, contra[0]!.id, "Resolved hours discrepancy");
  assert.equal(resolved, true);
  // Re-derive status
  const updatedStatus = deriveClaimStatus(ledgerB, "claim_order");
  assert.equal(updatedStatus, "verified", "Resolving contradiction must restore verified status if supporting judgment exists");
});

test("Capability 1 (Regression): Fact text edit invalidates status and refreshes claim text, while fact removal retires claim", () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });

  const initialBusiness: Business = {
    version: 2,
    offer: "Roof repair",
    audience: "Local homeowners",
    trigger: "Roof leak",
    outcome: "Repaired roof",
    includes: ["Slate replacement"],
    engagement: "Call 01452 789123",
    positioning: "Heritage roofer",
    facts: [
      { id: "f1", claim: "Emergency service available 24/7", evidence: ["ev1"] },
      { id: "f2", claim: "Master roofer accredited guild member", evidence: ["ev2"] },
    ],
    evidence: [
      { id: "ev1", source: "about.html", excerpt: "Emergency dispatch 24/7" },
      { id: "ev2", source: "guild.html", excerpt: "Member of Master Roofers Guild" },
    ],
    uncertainties: [],
  };
  save(join(root, "onboarding/business.json"), initialBusiness);

  // Initial build
  const ledger = buildOrUpdateLedger(root);
  assert.equal(ledger.claims["f1"]?.claim, "Emergency service available 24/7");
  assert.equal(ledger.claims["f2"]?.claim, "Master roofer accredited guild member");

  // Record verified judgment on f1
  recordJudgment(ledger, {
    claimId: "f1",
    evidenceId: "ev1",
    claimText: "Emergency service available 24/7",
    evidenceText: "Emergency dispatch 24/7",
    questionKey: "relation",
    verdict: "verified",
    confidence: 0.95,
    relation: "supports",
  });
  assert.equal(ledger.claims["f1"]?.status, "verified");

  // Save ledger state before edit
  saveEvidenceLedger(root, ledger);

  // Edit f1 text and remove f2 in business.json
  const updatedBusiness: Business = {
    ...initialBusiness,
    facts: [
      { id: "f1", claim: "Emergency service available Monday to Friday", evidence: ["ev1"] },
      // f2 removed!
    ],
  };
  save(join(root, "onboarding/business.json"), updatedBusiness);

  // Refresh ledger from disk
  const refreshedLedger = buildOrUpdateLedger(root);

  // f1 claim text updated, previous judgment invalidated, status reverted to unknown
  assert.equal(refreshedLedger.claims["f1"]?.claim, "Emergency service available Monday to Friday");
  assert.equal(refreshedLedger.claims["f1"]?.status, "unknown", "Edited claim must revert to unknown status");
  const jF1 = Object.values(refreshedLedger.judgments).find(j => j.claimId === "f1");
  assert.equal(jF1?.invalidated, true, "Prior judgment for edited claim must be marked invalidated");

  // f2 marked retired and unsupported
  assert.equal(refreshedLedger.claims["f2"]?.retired, true, "Removed fact must be marked retired");
  assert.equal(refreshedLedger.claims["f2"]?.status, "unsupported", "Retired claim must have unsupported status");
  assert.ok(refreshedLedger.claims["f2"]?.claim.includes("[RETIRED]"));
});

// =============================================================================
// Capability 2: Bounded Shared-State Batching
// =============================================================================

test("Capability 2: Bounded batching deduplicates excerpts and references explicit state paths", () => {
  const duplicateExcerpt = "All slate is extracted from historic local Cotswold quarries conforming to heritage stone specifications.";
  const items: BatchableQuestion[] = [
    {
      id: "q1",
      taskType: "grounding",
      claimId: "claim1",
      claim: "We use local Cotswold quarry stone",
      evidenceId: "ev_quarry",
      evidenceExcerpt: duplicateExcerpt,
      source: "about.json",
    },
    {
      id: "q2",
      taskType: "grounding",
      claimId: "claim2",
      claim: "Our slate conforms to heritage specifications",
      evidenceId: "ev_quarry",
      evidenceExcerpt: duplicateExcerpt, // IDENTICAL EXCERPT!
      source: "specs.json",
    },
    {
      id: "q3",
      taskType: "grounding",
      claimId: "claim3",
      claim: "Independent service claim with different evidence",
      evidenceId: "ev_other",
      evidenceExcerpt: "Emergency tarping and immediate structural stabilization available within 2 hours.",
      source: "services.json",
    },
  ];

  const { partitions, deferredDependentItems } = partitionBatchItems(items);
  assert.equal(deferredDependentItems.length, 0);
  assert.equal(partitions.length, 1);

  const batch = partitions[0]!;
  assert.equal(batch.questionIds.length, 3);

  // Verify excerpt deduplication: duplicateExcerpt must appear ONLY ONCE in shared state evidence!
  const evKeys = Object.keys(batch.state.evidence);
  assert.equal(evKeys.length, 2, "Duplicate excerpt must be deduplicated to 1 shared evidence entry");

  // Verify path references in questions
  const q1 = batch.questions["q_0"] as any;
  const q2 = batch.questions["q_1"] as any;
  assert.ok(q1.instructions.includes("state.claims.claim1.claim"));
  assert.ok(q2.instructions.includes("state.claims.claim2.claim"));
  assert.ok(q1.instructions.includes("state.evidence.ev_0.excerpt"));
  assert.ok(q2.instructions.includes("state.evidence.ev_0.excerpt")); // Both point to ev_0!
});

test("Capability 2: Bounded batching enforces question limits, payload size bounds, and defers dependent questions", () => {
  const items: BatchableQuestion[] = [
    { id: "q_dep", taskType: "grounding", claim: "Dependent claim", evidenceExcerpt: "Some evidence", dependsOn: ["prereq_1"] },
    { id: "q_indep", taskType: "grounding", claim: "Independent claim", evidenceExcerpt: "Some evidence" },
  ];

  // When prereq_1 is not completed, q_dep must be deferred!
  const { partitions, deferredDependentItems } = partitionBatchItems(items);
  assert.equal(deferredDependentItems.length, 1);
  assert.equal(deferredDependentItems[0]?.id, "q_dep");
  assert.equal(partitions[0]?.questionIds.includes("q_indep"), true);

  // When prereq_1 is completed, q_dep is included
  const res2 = partitionBatchItems(items, { completedPrerequisites: new Set(["prereq_1"]) });
  assert.equal(res2.deferredDependentItems.length, 0);
  assert.equal(res2.partitions[0]?.questionIds.length, 2);

  // Enforces maxQuestionsPerBatch
  const manyItems: BatchableQuestion[] = Array.from({ length: 25 }, (_, i) => ({
    id: `item_${i}`,
    taskType: "grounding",
    claim: `Claim number ${i}`,
    evidenceExcerpt: `Evidence excerpt for item ${i % 3}`, // shared across 3 excerpts
  }));

  const bounded = partitionBatchItems(manyItems, { config: { maxQuestionsPerBatch: 10 } });
  assert.equal(bounded.partitions.length, 3);
  assert.equal(bounded.partitions[0]?.questionIds.length, 10);
  assert.equal(bounded.partitions[1]?.questionIds.length, 10);
  assert.equal(bounded.partitions[2]?.questionIds.length, 5);
});

test("Capability 2: executeBatches measures transport calls and tokens before and after", async () => {
  const root = temp();
  let fetchCount = 0;

  const mockTransport = async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCount++;
    const body = JSON.parse(init?.body as string);
    const answers: Record<string, any> = {};
    for (const k of Object.keys(body.questions)) {
      answers[k] = {
        type: "choice",
        choice: "supports",
        confidence: 0.96,
        probabilities: { supports: 0.96, contradicts: 0.02, says_nothing: 0.02 },
      };
    }
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers,
        usage: { input_tokens: 180, output_tokens: 45 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const client = new JevClient({
    root,
    apiKey: "test-mock-key",
    fetch: mockTransport,
  });

  const items: BatchableQuestion[] = Array.from({ length: 6 }, (_, i) => ({
    id: `q_${i}`,
    taskType: "grounding",
    claimId: `claim_${i}`,
    claim: `Business claim ${i}`,
    evidenceExcerpt: `Shared common business evidence excerpt ${i % 2}`,
  }));

  const { partitions } = partitionBatchItems(items, { config: { maxQuestionsPerBatch: 10 } });
  assert.equal(partitions.length, 1);

  const result = await executeBatches({
    client,
    partitions,
    nodeId: "test-node",
  });

  assert.equal(fetchCount, 1, "Batched execution must issue exactly 1 transport call instead of 6");
  assert.equal(result.metrics.unbatchedTransportCalls, 6);
  assert.equal(result.metrics.actualTransportCalls, 1);
  assert.ok(result.metrics.transportCallSavingsPct >= 80);
  assert.ok(result.metrics.tokenSavingsPct > 0);
  assert.equal(Object.keys(result.answers).length, 6);
});

test("Capability 2 (Regression): Bounded batching strictly bounds payload, isolates oversized items, and prevents orphan rollover state", () => {
  // 1. Single oversized item check
  const hugeText = "X".repeat(10_000);
  const oversizedItem: BatchableQuestion = {
    id: "q_huge",
    taskType: "grounding",
    claim: "Massive claim exceeding entire budget",
    evidenceExcerpt: hugeText,
  };
  const normalItem: BatchableQuestion = {
    id: "q_normal",
    taskType: "grounding",
    claim: "Standard claim",
    evidenceExcerpt: "Standard evidence excerpt",
  };

  const partitionRes = partitionBatchItems([oversizedItem, normalItem], {
    config: { maxPayloadChars: 1000 },
  });

  assert.equal(partitionRes.rejectedOversizedItems.length, 1);
  assert.equal(partitionRes.rejectedOversizedItems[0]?.id, "q_huge");
  assert.equal(partitionRes.partitions.length, 1);
  assert.equal(partitionRes.partitions[0]?.questionIds.includes("q_normal"), true);
  assert.ok(partitionRes.partitions[0]!.payloadChars <= 1000);

  // Test throwOnOversized
  assert.throws(
    () => {
      partitionBatchItems([oversizedItem], {
        config: { maxPayloadChars: 1000 },
        throwOnOversized: true,
      });
    },
    /exceeds maxPayloadChars/
  );

  // 2. Rollover leaves no orphan state in previous partition
  const item1: BatchableQuestion = {
    id: "q1",
    taskType: "grounding",
    claimId: "claim_1",
    claim: "Claim number 1 " + "A".repeat(200),
    evidenceId: "ev1",
    evidenceExcerpt: "Evidence for claim 1 " + "B".repeat(200),
  };
  const item2: BatchableQuestion = {
    id: "q2",
    taskType: "grounding",
    claimId: "claim_2",
    claim: "Claim number 2 " + "C".repeat(200),
    evidenceId: "ev2",
    evidenceExcerpt: "Evidence for claim 2 " + "D".repeat(200),
  };

  // Set maxPayloadChars so item1 fits alone, but item1 + item2 exceeds budget
  const rolloverRes = partitionBatchItems([item1, item2], {
    config: { maxPayloadChars: 1800 },
  });

  assert.equal(rolloverRes.partitions.length, 2, "Items must be split into 2 partitions");
  const p0 = rolloverRes.partitions[0]!;
  const p1 = rolloverRes.partitions[1]!;

  assert.deepEqual(p0.questionIds, ["q1"]);
  assert.deepEqual(p1.questionIds, ["q2"]);

  // Partition 0 state must contain ONLY claim_1 and ev1 (NO orphan claim_2 or ev2!)
  assert.ok(p0.state.claims["claim_1"]);
  assert.equal(p0.state.claims["claim_2"], undefined, "No orphan claim_2 in partition 0");
  assert.ok(Object.values(p0.state.evidence).some(e => e.excerpt.includes("Evidence for claim 1")));
  assert.ok(!Object.values(p0.state.evidence).some(e => e.excerpt.includes("Evidence for claim 2")), "No orphan ev2 in partition 0");

  // Partition 1 state must contain ONLY claim_2 and ev2
  assert.ok(p1.state.claims["claim_2"]);
  assert.equal(p1.state.claims["claim_1"], undefined, "No orphan claim_1 in partition 1");
  assert.ok(Object.values(p1.state.evidence).some(e => e.excerpt.includes("Evidence for claim 2")));
  assert.ok(!Object.values(p1.state.evidence).some(e => e.excerpt.includes("Evidence for claim 1")), "No orphan ev1 in partition 1");

  // Both payloads strictly within maxPayloadChars
  assert.ok(p0.payloadChars <= 1800);
  assert.ok(p1.payloadChars <= 1800);
});

test("Capability 2 (Regression): executeBatches distinguishes observed vs estimated tokens and separates unmetered telemetry", async () => {
  const root = temp();

  // Test 1: Transport without usage telemetry (unmeasured)
  const unmeasuredTransport = async () => {
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers: {
          q_0: {
            type: "choice",
            choice: "supports",
            confidence: 0.95,
            probabilities: { supports: 0.95, contradicts: 0.03, says_nothing: 0.02 },
          },
        },
        // NO usage field!
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const clientUnmeasured = new JevClient({
    root,
    apiKey: "test-key",
    fetch: unmeasuredTransport,
  });

  const { partitions } = partitionBatchItems([
    { id: "q1", taskType: "grounding", claim: "Claim 1", evidenceExcerpt: "Evidence 1" },
  ]);

  const unmeasuredResult = await executeBatches({
    client: clientUnmeasured,
    partitions,
    nodeId: "test-node",
  });

  assert.equal(unmeasuredResult.metrics.measured, false);
  assert.equal(unmeasuredResult.metrics.observedInputTokens, null);
  assert.equal(unmeasuredResult.metrics.observedOutputTokens, null);
  assert.equal(unmeasuredResult.metrics.observedTotalTokens, null);
  assert.equal(unmeasuredResult.metrics.actualTokenSavingsPct, null);
  assert.ok(unmeasuredResult.metrics.estimatedBatchedTokens > 0);
  assert.ok(unmeasuredResult.metrics.estimatedTokenSavingsPct >= 0);

  // Test 2: Transport with honest usage telemetry (measured)
  const rootMeasured = temp();
  const measuredTransport = async () => {
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers: {
          q_0: {
            type: "choice",
            choice: "supports",
            confidence: 0.95,
            probabilities: { supports: 0.95, contradicts: 0.03, says_nothing: 0.02 },
          },
        },
        usage: { input_tokens: 150, output_tokens: 40 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const clientMeasured = new JevClient({
    root: rootMeasured,
    apiKey: "test-key",
    fetch: measuredTransport,
  });

  const measuredResult = await executeBatches({
    client: clientMeasured,
    partitions,
    nodeId: "test-node",
  });

  assert.equal(measuredResult.metrics.measured, true);
  assert.equal(measuredResult.metrics.observedInputTokens, 150);
  assert.equal(measuredResult.metrics.observedOutputTokens, 40);
  assert.equal(measuredResult.metrics.observedTotalTokens, 190);
  assert.notEqual(measuredResult.metrics.actualTokenSavingsPct, null);
});

// =============================================================================
// Capability 3: Semantic Evidence Ranking Runtime
// =============================================================================

test("Capability 3: Lexical retrieval and dense semantic re-ranking with query embedding cache", () => {
  const candidates = [
    { id: "ev_masonry", source: "services.html", text: "Specialist Cotswold limestone masonry, dry stone walling, and ashlar restoration." },
    { id: "ev_leadwork", source: "lead.html", text: "Traditional cast code lead sheet flashings, box gutters, and heritage lead welding." },
    { id: "ev_cookie", source: "privacy.html", text: "This website uses technical session cookies to ensure standard browser functionality." },
    { id: "ev_timber", source: "timber.html", text: "Oak roof timber repair, structural truss stabilization, and timber frame preservation." },
  ];

  const query = "heritage stone masonry and lime walling";

  // Stage 1: Lexical retrieval
  const lexicalPool = lexicalRetrieve(candidates, query, 3);
  assert.equal(lexicalPool.length, 3);
  assert.equal(lexicalPool[0]?.id, "ev_masonry");

  // Stage 2: Dense semantic re-ranking with embedding cache
  const cache = new QueryEmbeddingCache();
  const ranked = semanticRerank(candidates, query, { cache });

  assert.equal(cache.size(), 1, "Query vector should be cached");
  assert.equal(ranked[0]?.id, "ev_masonry");
  assert.ok(ranked[0]!.combinedScore > ranked[ranked.length - 1]!.combinedScore);
  assert.equal(ranked[ranked.length - 1]?.id, "ev_cookie");

  // End-to-end rank and slice: fits within compact token budget
  const sliced = rankAndSliceEvidence(candidates, query, {
    maxItems: 2,
    tokenBudget: 300,
    cache,
  });

  assert.equal(sliced.slicedItems.length, 2);
  assert.equal(sliced.slicedItems[0]?.id, "ev_masonry");
  assert.ok(sliced.slicedText.includes("ev_masonry"));
  assert.ok(!sliced.slicedText.includes("ev_cookie"));
});

// =============================================================================
// Capability 4: Upstream Factual Extraction & Traceability
// =============================================================================

test("Capability 4: Upstream factual extraction extracts services, areas, contacts, guarantees, and credentials with spans", () => {
  const root = temp();
  const rawText = `
Cotswold Heritage Roofing & Conservation
Established 1988 in Gloucestershire. Master Craftsman Certified.
Services:
- Specialist stone slate roofing
- Vernacular timber structural repair
- Traditional lime pointing
Serving: Gloucestershire, Cotswolds, Oxfordshire
For emergencies call 01452 789123 or email info@cotswoldheritage.co.uk.
Office hours: Monday to Friday 8:00 AM to 5:00 PM.
We offer an unconditional 25-year craft guarantee with full insurance.
"Outstanding heritage restoration on our Grade II listed manor." - Lady Henrietta
`;

  const facts = extractHarvestFacts(root, [{ url: "https://cotswoldheritage.example/about", text: rawText }]);
  assert.ok(facts.length >= 6);

  const categories = new Set(facts.map(f => f.category));
  assert.ok(categories.has("service"));
  assert.ok(categories.has("service_area"));
  assert.ok(categories.has("contact_detail"));
  assert.ok(categories.has("guarantee"));
  assert.ok(categories.has("credential"));
  assert.ok(categories.has("testimonial"));

  // Check spans and excerpts
  const phoneFact = facts.find(f => f.category === "contact_detail" && f.claim.includes("01452 789123"))!;
  assert.ok(phoneFact);
  assert.ok(phoneFact.span && phoneFact.span[0] < phoneFact.span[1]);
  assert.ok(phoneFact.rawExcerpt.includes("01452 789123"));

  // Save facts and verify round-trip
  saveExtractedFacts(root, facts);
  const loaded = loadExtractedFacts(root);
  assert.equal(loaded.length, facts.length);
});

test("Capability 4: verifyCopyTraceability fails validation when copy introduces ungrounded concrete claims", () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });

  // Baseline business with 1 phone and 1 fact
  const business: Business = {
    version: 2,
    offer: "Specialist roofing",
    audience: "Homeowners",
    trigger: "Roof leak",
    outcome: "Repaired roof",
    includes: ["Roof repair"],
    engagement: "Call 01452 789123",
    positioning: "Quality roofing",
    facts: [{ id: "f1", claim: "Over 35 years experience", evidence: ["ev1"] }],
    evidence: [{ id: "ev1", source: "about.html", excerpt: "Over 35 years experience in roofing." }],
    uncertainties: [],
  };
  save(join(root, "onboarding/business.json"), business);

  // Grounded copy plan: uses known fact f1 and known phone 01452 789123
  const validCopy = {
    pages: [
      {
        path: "/",
        sections: [
          { id: "hero", heading: "Heritage Roofing", body: "Over 35 years experience across Gloucestershire. Call 01452 789123.", factIds: ["f1"] },
        ],
      },
    ],
  };
  const validCheck = verifyCopyTraceability({ root, copyPlan: validCopy });
  assert.equal(validCheck.ok, true);
  assert.equal(validCheck.violations.length, 0);

  // Ungrounded copy plan: introduces invented phone 0800 999 9999 and invented guarantee "100% lifetime guarantee"
  const ungroundedCopy = {
    pages: [
      {
        path: "/",
        sections: [
          { id: "hero", heading: "Heritage Roofing", body: "We promise a 100% lifetime guarantee. Call toll-free 0800 999 9999 now!" },
        ],
      },
    ],
  };
  const ungroundedCheck = verifyCopyTraceability({ root, copyPlan: ungroundedCopy });
  assert.equal(ungroundedCheck.ok, false);
  assert.ok(ungroundedCheck.violations.some(v => v.includes("0800 999 9999")));
  assert.ok(ungroundedCheck.violations.some(v => v.includes("100% lifetime guarantee")));
});

test("Capability 4 (Regression): verifyCopyTraceability rejects unrelated cited facts for phones, third-party contacts, metrics, and guarantees", () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });

  // Baseline business has fact 'f_roof' which says ONLY 'We repair roofs'
  // and engagement is 'Contact us via our online form'
  const business: Business = {
    version: 2,
    offer: "Specialist slate roof repairs",
    audience: "Homeowners",
    trigger: "Roof leak",
    outcome: "Repaired roof",
    includes: ["Roof repair"],
    engagement: "Contact us via our online form",
    positioning: "Quality roofing",
    facts: [
      { id: "f_roof", claim: "We repair roofs", evidence: ["ev_roof"] },
      { id: "f_grounded_stats", claim: "Over 500 projects completed with 25-year craft guarantee", evidence: ["ev_stats"] },
    ],
    evidence: [
      { id: "ev_roof", source: "services.html", excerpt: "Specialist repair for slate and tile roofs across the Cotswolds." },
      { id: "ev_stats", source: "about.html", excerpt: "We have completed over 500 projects and back our craft with a 25-year craft guarantee. Contact 01452 789123 or info@cotswoldheritage.co.uk." },
    ],
    uncertainties: [],
  };
  save(join(root, "onboarding/business.json"), business);

  // Regression 1: Unrelated fact cited for ungrounded phone
  // Citing 'f_roof' ("We repair roofs") does NOT ground '212-555-9876'!
  const ungroundedPhoneCopy = {
    pages: [
      {
        path: "/",
        sections: [
          { id: "hero", heading: "Heritage Roofing", body: "We repair roofs. Call 212-555-9876 today.", factIds: ["f_roof"] },
        ],
      },
    ],
  };
  const phoneCheck = verifyCopyTraceability({ root, copyPlan: ungroundedPhoneCopy });
  assert.equal(phoneCheck.ok, false, "Citing unrelated fact 'roof' must NOT ground invented phone");
  assert.ok(phoneCheck.violations.some(v => v.includes("212-555-9876")), `Expected phone violation, got: ${phoneCheck.violations.join("; ")}`);

  // Regression 2: Third-party contact email
  // Citing 'f_roof' does NOT ground unverified third-party email
  const thirdPartyEmailCopy = {
    pages: [
      {
        path: "/",
        sections: [
          { id: "hero", heading: "Heritage Roofing", body: "We repair roofs. Email us at unverified-thirdparty@somewhere.com.", factIds: ["f_roof"] },
        ],
      },
    ],
  };
  const emailCheck = verifyCopyTraceability({ root, copyPlan: thirdPartyEmailCopy });
  assert.equal(emailCheck.ok, false, "Citing unrelated fact 'roof' must NOT ground third-party email");
  assert.ok(emailCheck.violations.some(v => v.includes("unverified-thirdparty@somewhere.com")));

  // Regression 3: Invented concrete metric
  // Citing 'f_roof' does NOT ground '500+ projects'
  const inventedMetricCopy = {
    pages: [
      {
        path: "/",
        sections: [
          { id: "hero", heading: "Heritage Roofing", body: "We repair roofs. Over 500+ projects completed with 99% satisfaction rate.", factIds: ["f_roof"] },
        ],
      },
    ],
  };
  const metricCheck = verifyCopyTraceability({ root, copyPlan: inventedMetricCopy });
  assert.equal(metricCheck.ok, false, "Citing unrelated fact 'roof' must NOT ground invented metric '500+ projects'");
  assert.ok(metricCheck.violations.some(v => v.includes("500+ projects")));

  // Regression 4: Invented concrete guarantee
  // Citing 'f_roof' does NOT ground '100% money back guarantee'
  const inventedGuaranteeCopy = {
    pages: [
      {
        path: "/",
        sections: [
          { id: "hero", heading: "Heritage Roofing", body: "We repair roofs. Backed by our 100% money back guarantee.", factIds: ["f_roof"] },
        ],
      },
    ],
  };
  const guaranteeCheck = verifyCopyTraceability({ root, copyPlan: inventedGuaranteeCopy });
  assert.equal(guaranteeCheck.ok, false, "Citing unrelated fact 'roof' must NOT ground invented 100% money back guarantee");
  assert.ok(guaranteeCheck.violations.some(v => v.includes("100% money back guarantee")));

  // Positive Case: Citing f_grounded_stats which actually contains the metric, guarantee, phone, and email!
  const groundedCopy = {
    pages: [
      {
        path: "/",
        sections: [
          {
            id: "hero",
            heading: "Heritage Roofing",
            body: "Over 500 projects completed. Backed by our 25-year craft guarantee. Call 01452 789123 or email info@cotswoldheritage.co.uk.",
            factIds: ["f_grounded_stats"],
          },
        ],
      },
    ],
  };
  const groundedCheck = verifyCopyTraceability({ root, copyPlan: groundedCopy });
  assert.equal(groundedCheck.ok, true, `Expected valid traceability when cited fact contains claims, got: ${groundedCheck.violations.join("; ")}`);
  assert.equal(groundedCheck.violations.length, 0);
});

// =============================================================================
// Capability 5: Focused Critic Evidence Reports & Repeat Escalation
// =============================================================================

test("Capability 5: Focused critic context passes targeted evidence slices", () => {
  const claims = [
    { id: "c1", claim: "Lime mortar repointing conforms to vernacular specifications." },
  ];
  const evidence = [
    { id: "ev1", source: "lime.html", excerpt: "Non-hydraulic lime mortar mixed with local washed sand allows traditional stone breathe." },
    { id: "ev2", source: "irrelevant.html", excerpt: "Server response header configuration for apache HTTP." },
  ];

  const ctx = buildFocusedCriticContext({
    nodeId: "copy-review",
    targetFile: "pages/services.html",
    sectionId: "pointing",
    claims,
    evidence,
  });

  assert.ok(ctx.contextText.includes("pages/services.html (Section: #pointing)"));
  assert.ok(ctx.contextText.includes("ev1"));
  assert.ok(!ctx.contextText.includes("ev2"));
});

test("Capability 5: Repeat findings escalate from polish -> warning -> blocking across iterations", () => {
  const root = temp();

  const findingPolish: StructuredCriticFinding = {
    id: "crit-1",
    targetFile: "pages/index.html",
    section: "hero",
    slot: "cta",
    severity: "polish",
    problem: "Button text lacks action verb",
    repairDirective: "Change 'Click Here' to 'Request Conservation Quote'",
    verificationCriteria: "Button text contains active verb",
  };

  // Iteration 1: initial report as polish
  const run1 = recordAndEscalateFindings(root, [findingPolish], 1);
  assert.equal(run1[0]?.severity, "polish");
  assert.equal(run1[0]?.repeatCount, 1);
  assert.equal(run1[0]?.escalated, false);

  // Iteration 2: same defect recurs without repair -> escalates to warning!
  const run2 = recordAndEscalateFindings(root, [findingPolish], 2);
  assert.equal(run2[0]?.severity, "warning");
  assert.equal(run2[0]?.repeatCount, 2);
  assert.equal(run2[0]?.escalated, true);
  assert.ok(run2[0]?.repairDirective.includes("ESCALATED REPEAT DEFECT"));

  // Iteration 3: still unresolved -> escalates to blocking!
  const run3 = recordAndEscalateFindings(root, [run2[0]!], 3);
  assert.equal(run3[0]?.severity, "blocking");
  assert.equal(run3[0]?.repeatCount, 3);
  assert.equal(run3[0]?.escalated, true);

  // Converted to standard finding maps to blocker
  const std = toStandardFinding(run3[0]!);
  assert.equal(std.severity, "blocker");
});

// =============================================================================
// Capability 6: Cross-Stage Semantic Consistency
// =============================================================================

test("Capability 6: Detects dropped narrative arc, semantic drift, and cross-page contradictions", () => {
  const root = temp();

  const business: Business = {
    version: 2,
    offer: "Heritage Cotswold stone slate re-laying and conservation",
    audience: "Listed building owners",
    trigger: "Roof failure",
    outcome: "Weatherproof restoration",
    includes: ["Quarry slate sourcing", "Timber rafter repair"],
    engagement: "Call 01452 789123",
    positioning: "Master heritage craft",
    facts: [
      { id: "f_slate", claim: "Local stone slate re-laying", evidence: ["ev1"] },
      { id: "f_timber", claim: "Oak rafter timber restoration", evidence: ["ev2"] },
    ],
    evidence: [
      { id: "ev1", source: "a.json", excerpt: "Local stone slate" },
      { id: "ev2", source: "b.json", excerpt: "Oak rafter timber" },
    ],
    uncertainties: [],
  };

  const storyboard: Storyboard = {
    version: 2,
    businessHash: "abc",
    directionHash: "def",
    routes: [],
    pages: [
      {
        path: "/",
        purpose: "Home",
        representative: true,
        sections: [{ id: "hero", question: "q", message: "Heritage stone slate re-laying", facts: ["f_slate"], media: [], action: null, composition: "c", emphasis: "e", transition: "t" }],
      },
      {
        path: "/contact",
        purpose: "Contact",
        representative: false,
        sections: [{ id: "contact", question: "q", message: "Contact us", facts: [], media: [], action: null, composition: "c", emphasis: "e", transition: "t" }],
      },
    ],
  };

  // Contradictory copy plan:
  // - Page / says "Open 24/7" with phone 01452 789123
  // - Page /contact says "Monday to Friday 9:00 AM to 5:00 PM" with phone 0800 123 4567 (contradictory phone!)
  // - Introduces ungrounded semantic drift: "guaranteed stock returns"
  const conflictingCopy = {
    pages: [
      {
        path: "/",
        sections: [
          { id: "hero", heading: "Heritage Cotswold stone slate", body: "Open 24/7 round-the-clock emergency support. Call 01452 789123. We offer guaranteed stock returns on investments.", factIds: ["f_slate"] },
        ],
      },
      {
        path: "/contact",
        sections: [
          { id: "contact", heading: "Contact Us", body: "Office hours: Monday to Friday 9:00 AM to 5:00 PM. Call our head office at 0800 123 4567.", factIds: [] },
        ],
      },
    ],
  };

  const report = checkCrossStageConsistency({
    root,
    business,
    storyboard,
    copyPlan: conflictingCopy,
  });

  assert.equal(report.ok, false);

  // 1. Detected cross-page hours contradiction (24/7 vs restricted hours)
  assert.ok(report.contradictions.some(c => c.type === "hours"));

  // 2. Detected cross-page phone contradiction (01452 789123 vs 0800 123 4567)
  assert.ok(report.contradictions.some(c => c.type === "phone"));

  // 3. Detected semantic drift ("guaranteed stock returns")
  assert.equal(report.semanticDrift.driftDetected, true);
  assert.ok(report.semanticDrift.unsupportedTopics.includes("guaranteed stock returns"));
});

// =============================================================================
// Capability 7: Matched Evaluation Across Runs A/B/C
// =============================================================================

test("Capability 7: Matched evaluation compares efficiency and verifies quality preservation across Runs A/B/C", () => {
  // Run A: Baseline unbatched run
  const runA: RunMetrics = {
    runId: "run-a-baseline",
    label: "Run A (Baseline Unbatched)",
    transportCalls: 50,
    inputTokens: 125000,
    outputTokens: 12000,
    totalTokens: 137000,
    clockDurationMs: 45000,
    cacheHits: 0,
    totalEvaluations: 50,
    claimFidelityPct: 92,
    criticIterations: 3,
    defectEscapeCount: 1,
    passedGatesCount: 8,
    failedGatesCount: 0,
  };

  // Run B: Bounded batching
  const runB: RunMetrics = {
    runId: "run-b-batched",
    label: "Run B (Bounded Batching)",
    transportCalls: 12,
    inputTokens: 48000,
    outputTokens: 9000,
    totalTokens: 57000,
    clockDurationMs: 18000,
    cacheHits: 4,
    totalEvaluations: 50,
    claimFidelityPct: 94,
    criticIterations: 2,
    defectEscapeCount: 0,
    passedGatesCount: 8,
    failedGatesCount: 0,
  };

  // Run C: Optimized with Evidence Ledger + Semantic Ranking + Factual Extraction
  const runC: RunMetrics = {
    runId: "run-c-optimized",
    label: "Run C (Ledger + Ranking + Extraction)",
    transportCalls: 6,
    inputTokens: 24000,
    outputTokens: 5000,
    totalTokens: 29000,
    clockDurationMs: 9000,
    cacheHits: 22,
    totalEvaluations: 50,
    claimFidelityPct: 98,
    criticIterations: 1,
    defectEscapeCount: 0,
    passedGatesCount: 8,
    failedGatesCount: 0,
  };

  const report = compareRunMetrics(runA, runB, runC);

  assert.equal(report.verdict, "incomplete_quality_evidence", "Numeric fields without completion manifests cannot establish quality");

  assert.ok(report.comparisons.bVsA.transportCallReductionPct >= 70);
  assert.ok((report.comparisons.bVsA.tokenSavingsPct ?? -1) >= 50);
  assert.ok(report.comparisons.cVsA!.transportCallReductionPct >= 85);
  assert.ok((report.comparisons.cVsA!.tokenSavingsPct ?? -1) >= 75);

  const formatted = formatComparativeReport(report);
  assert.ok(formatted.includes("Matched Evaluation Report"));
  assert.ok(formatted.includes("incomplete_quality_evidence"));
});

test("Capability: measureShortlistRecall accurately reports recall, covered and missed gold items", () => {
  const fullCandidates = [
    { id: "e1", text: "Roof repair in Cotswolds" },
    { id: "e2", text: "Heritage stone restoration" },
    { id: "e3", text: "Lead guttering" },
    { id: "e4", text: "Chimney rebuild" },
    { id: "e5", text: "Slate tile replacement" },
  ];

  const goldIds = ["e1", "e2", "e5"]; // 3 gold evidence items

  // Shortlist contains e1 and e2, but misses e5
  const shortlist = [fullCandidates[0]!, fullCandidates[1]!, fullCandidates[2]!];

  const result = measureShortlistRecall(shortlist, fullCandidates, goldIds);

  assert.equal(result.totalGold, 3);
  assert.equal(result.coveredGold, 2);
  assert.equal(result.recall, 0.667);
  assert.deepEqual(result.missedGoldIds, ["e5"]);

  // Perfect recall case
  const perfectShortlist = [fullCandidates[0]!, fullCandidates[1]!, fullCandidates[4]!];
  const perfectResult = measureShortlistRecall(perfectShortlist, fullCandidates, goldIds);
  assert.equal(perfectResult.recall, 1.0);
  assert.deepEqual(perfectResult.missedGoldIds, []);
});

test("Capability: rankAndSliceEvidence detects lost candidates and reports dropped count accurately", () => {
  const candidates: Array<{ id: string; source: string; excerpt: string }> = [];
  for (let i = 0; i < 30; i++) {
    candidates.push({
      id: `ev_${i}`,
      source: `onboarding/raw/page_${i}.json`,
      excerpt: `Evidence snippet ${i}: offering roofing, repairs, stone, and gutter services across Cotswolds.`,
    });
  }

  const result = rankAndSliceEvidence(candidates, "roofing repairs", {
    maxItems: 5,
    tokenBudget: 500, // tight budget
  });

  assert.equal(result.totalCandidates, 30);
  assert.equal(result.slicedItems.length, 5);
  assert.equal(result.droppedCount, 25);
  assert.ok(result.slicedText.includes("### Sliced Verified Evidence (5 items within budget)"));

  // Check recall against 10 gold IDs
  const goldIds = ["ev_0", "ev_1", "ev_2", "ev_3", "ev_4", "ev_5", "ev_6", "ev_7", "ev_8", "ev_9"];
  const recall = measureShortlistRecall(result.slicedItems, candidates, goldIds);
  assert.ok(recall.recall <= 0.5, "Shortlist of 5 items cannot cover more than 50% of 10 gold items");
  assert.equal(recall.missedGoldIds.length >= 5, true);
});

test("Capability: resolveCapability clamps capability mode to global mode ceiling and isolates toggles", () => {
  // Test 1: Global mode is shadow -> assist capability is clamped to shadow
  const shadowConfig: JevConfig = {
    mode: "shadow",
    model: "jev-1.13.0",
    timeoutMs: 5000,
    taskDeadlineMs: 10000,
    maxConcurrency: 2,
    maxRetries: 1,
    confidenceThresholds: { routing: 0.8, grounding: 0.85 },
    compactPackets: true,
    capabilities: {
      grounding: "assist", // should be clamped to shadow
      sourceSelection: "off",
      retrievalRanking: "off",
      consistency: "shadow",
      repairAssistance: "off",
      preferenceScoring: "off",
    },
  };

  assert.equal(resolveCapability(shadowConfig, "grounding"), "shadow", "Global shadow mode must cap capability at shadow");
  assert.equal(resolveCapability(shadowConfig, "consistency"), "shadow");
  assert.equal(resolveCapability(shadowConfig, "sourceSelection"), "off");

  // Test 2: Global mode is assist -> capabilities run at their configured mode
  const assistConfig: JevConfig = {
    ...shadowConfig,
    mode: "assist",
  };
  assert.equal(resolveCapability(assistConfig, "grounding"), "assist");
  assert.equal(resolveCapability(assistConfig, "consistency"), "shadow");
  assert.equal(resolveCapability(assistConfig, "sourceSelection"), "off");

  // Test 3: isCapabilityActive predicate
  assert.equal(isCapabilityActive(assistConfig, "grounding", "assist"), true);
  assert.equal(isCapabilityActive(assistConfig, "consistency", "assist"), false);
  assert.equal(isCapabilityActive(assistConfig, "consistency", "shadow"), true);
  assert.equal(isCapabilityActive(assistConfig, "sourceSelection", "shadow"), false);
});

test("Capability: semanticRerank reports honest retrievalMethod in output items", () => {
  const items = [
    { id: "1", source: "home.md", excerpt: "Commercial property roofing and cladding" },
    { id: "2", source: "about.md", excerpt: "Residential domestic roof repair specialists" },
  ];

  const reranked = semanticRerank(items, "commercial roofing");
  assert.equal(reranked.length, 2);
  for (const item of reranked) {
    assert.equal(item.retrievalMethod, "lexical_token_frequency+dense_ngram_cosine");
    assert.ok(typeof item.combinedScore === "number");
    assert.ok(typeof item.lexicalScore === "number");
    assert.ok(typeof item.semanticScore === "number");
  }
});

test("Capability: selectDiverseEvidence enforces fair-share diversity across distinct sources under tight budget", () => {
  // 5 items from source-1 with higher scores, 2 items from source-2 with slightly lower scores, 2 from source-3
  const items = [
    { id: "s1_a", source: "page1.html", score: 0.95, excerpt: "Page 1 dominant topic lead alpha" },
    { id: "s1_b", source: "page1.html", score: 0.94, excerpt: "Page 1 dominant topic lead beta" },
    { id: "s1_c", source: "page1.html", score: 0.93, excerpt: "Page 1 dominant topic lead gamma" },
    { id: "s1_d", source: "page1.html", score: 0.92, excerpt: "Page 1 dominant topic lead delta" },
    { id: "s1_e", source: "page1.html", score: 0.91, excerpt: "Page 1 dominant topic lead epsilon" },
    { id: "s2_a", source: "pricing.html", score: 0.85, excerpt: "Transparent pricing tier 1" },
    { id: "s2_b", source: "pricing.html", score: 0.84, excerpt: "Transparent pricing tier 2" },
    { id: "s3_a", source: "about.html", score: 0.80, excerpt: "Family founded since 1990" },
  ];

  // Budget allowing roughly 5 items (approx 160 chars)
  const budgetChars = 160;
  const result = selectDiverseEvidence(items, budgetChars, item => item.excerpt.length, 2);

  // Assert that source-1 did not monopolize all slots: pricing.html and about.html must be represented
  const selectedSources = new Set(result.selected.map(i => i.source));
  assert.ok(selectedSources.has("page1.html"), "Should include high-scoring source 1");
  assert.ok(selectedSources.has("pricing.html"), "Diverse selection must preserve distinct source 2");
  assert.ok(selectedSources.has("about.html"), "Diverse selection must preserve distinct source 3");

  // Verify source 1 has at most 2 items in initial pass
  const s1Count = result.selected.filter(i => i.source === "page1.html").length;
  assert.ok(s1Count <= 2, "High-scoring single source must not monopolize slots over other sources");

  // Overflown items must be preserved in overflow
  assert.ok(result.overflow.length > 0, "Lower priority items from source 1 must be placed into overflow");
  assert.ok(result.overflow.some(i => i.id === "s1_c" || i.id === "s1_d" || i.id === "s1_e"));
});

test("Capability: partitionByObligation preserves complete obligations atomically without mid-sentence slicing", () => {
  interface TestItem {
    id: string;
    obligationId: string;
    bytes: number;
    content: string;
  }

  const items: TestItem[] = [
    { id: "obl1_1", obligationId: "licensing", bytes: 40, content: "Fully licensed by the local authority under #8831." },
    { id: "obl1_2", obligationId: "licensing", bytes: 40, content: "Holds certified heritage masonry restoration badge." },
    { id: "obl2_1", obligationId: "contact", bytes: 30, content: "Phone: 01452 789123 available 9-5." },
    { id: "obl2_2", obligationId: "contact", bytes: 30, content: "Email: team@cotswoldheritage.co.uk" },
    { id: "obl3_1", obligationId: "pricing_disclosure", bytes: 60, content: "Estimates provided free of charge subject to site inspection." },
    { id: "obl3_2", obligationId: "pricing_disclosure", bytes: 60, content: "All prices include standard VAT and guarantee documentation." },
  ];

  // Budget of 150 bytes: fits licensing (80 bytes) + contact (60 bytes) = 140 bytes, but cannot fit pricing_disclosure (120 bytes)
  const partition = partitionByObligation(items, 150);

  // Both licensing and contact items must be 100% intact (no partial slice of an obligation)
  assert.equal(partition.included.length, 4);
  assert.ok(partition.included.every(i => i.obligationId === "licensing" || i.obligationId === "contact"));

  // pricing_disclosure must be completely partitioned with obligationId registered
  assert.equal(partition.partitioned.length, 2);
  assert.ok(partition.partitioned.every(i => i.obligationId === "pricing_disclosure"));
  assert.deepEqual(partition.partitionedObligations, ["pricing_disclosure"]);
});

test("Capability: expandPacketItem re-hashes actual overflow file bytes and rejects tampered content even if keys match", () => {
  const root = temp();
  const runDir = join(root, "agent/runs");
  mkdirSync(runDir, { recursive: true });

  const nodeId = "business-review";
  const overflowRelativePath = `agent/runs/${nodeId}.evidence.txt`;
  const overflowDiskPath = join(root, overflowRelativePath);
  const initialContent = "Original untampered evidence statements extracted from client interview.";
  writeFileSync(overflowDiskPath, initialContent, "utf8");

  const overflowHash = rehashOverflowContent(overflowDiskPath);

  const manifest: CoverageManifest = {
    schemaVersion: 1,
    nodeId,
    generatedAt: new Date().toISOString(),
    included: [],
    excluded: [],
    expandable: [
      {
        id: "evidence-overflow",
        path: overflowRelativePath,
        description: "Partitioned overflow evidence statements",
        bytes: Buffer.byteLength(initialContent, "utf8"),
        hash: overflowHash,
      },
    ],
  };
  manifest.manifestHash = computeManifestHash(manifest);
  writeFileSync(join(runDir, `${nodeId}.manifest.json`), JSON.stringify(manifest, null, 2), "utf8");

  // Initial expansion must succeed
  const expanded = expandPacketItem(root, nodeId, "evidence-overflow", manifest.manifestHash.slice(0, 12));
  assert.equal(expanded, initialContent);

  // Tamper with the overflow content on disk without updating manifest
  writeFileSync(overflowDiskPath, initialContent.replace("Original untampered", "Maliciously modified"), "utf8");

  // Expanding now must fail closed with content tampering violation
  assert.throws(
    () => expandPacketItem(root, nodeId, "evidence-overflow", manifest.manifestHash!.slice(0, 12)),
    /Content tampering violation for expansion evidence-overflow: stored hash .* does not match file bytes hash/
  );
});

test("Capability 4: auditExtractionCompleteness audits copy-plan coverage against ledger claims and catches contradictions", () => {
  const root = temp();
  const ledger: EvidenceLedger = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    items: [
      { id: "ev1", hash: "h1", source: "about.json", text: "Established in 1988 with 35+ years experience", candidateType: "harvest_raw", aliases: [] },
      { id: "ev2", hash: "h2", source: "contact.json", text: "Direct emergency line 01452 789123", candidateType: "harvest_raw", aliases: [] },
    ],
    claims: {
      f1: { id: "f1", claim: "Established in 1988 with 35+ years experience", sourceFile: "business.json", field: "facts", citedEvidenceIds: ["ev1"], status: "verified" },
      f2: { id: "f2", claim: "Direct emergency line 01452 789123", sourceFile: "business.json", field: "facts", citedEvidenceIds: ["ev2"], status: "verified" },
      f3: { id: "f3", claim: "Open 24/7 round the clock", sourceFile: "business.json", field: "facts", citedEvidenceIds: [], status: "contradicted" },
    },
    judgments: {},
    contradictions: [
      { id: "c1", claimId: "f3", evidenceId: "ev1", description: "Hours contradiction", status: "unresolved", detectedAt: new Date().toISOString() },
    ],
  };

  // Case 1: Copy-plan cites f1 and an unregistered fact f99, and repeats contradicted claim text f3
  const copyPlan = {
    pages: [
      {
        path: "/",
        sections: [
          { id: "hero", facts: ["f1", "f99"], heading: "Welcome", body: "Established in 1988 with 35+ years experience. We are Open 24/7 round the clock." },
        ],
      },
    ],
  };

  const audit = auditExtractionCompleteness(root, copyPlan, ledger);
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.factsCitedInCopy, ["f1"]);
  assert.deepEqual(audit.unregisteredFactsCited, ["f99"]);
  assert.ok(audit.uncitedFacts.includes("f2"));
  assert.ok(audit.contradictionsDetected.length > 0);
  assert.ok(audit.coverageRatio < 1.0);
});

test("Capability 6: traceClaimLineage and detectBrokenLineage track end-to-end provenance across stages", () => {
  const root = temp();
  const business: Business = {
    version: 2,
    offer: "Master stone masonry",
    audience: "Historic properties",
    trigger: "Restoration",
    outcome: "Preserved stone",
    includes: [],
    engagement: "Call us",
    positioning: "Heritage craft",
    facts: [
      { id: "f1", claim: "Over 35 years stone restoration craft", evidence: ["ev1"] },
      { id: "f2", claim: "Uncited claim with zero harvest evidence", evidence: [] },
    ],
    evidence: [
      { id: "ev1", source: "onboarding/raw/about.json", excerpt: "Founded in 1988, 35 years of stone masonry." },
    ],
    uncertainties: [],
  };

  const storyboard = {
    version: 2,
    pages: [
      {
        path: "/",
        sections: [
          { id: "hero", message: "Over 35 years stone restoration craft", facts: ["f1"] },
        ],
      },
    ],
  } as unknown as Storyboard;

  const copyPlan = {
    pages: [
      {
        path: "/",
        sections: [
          { id: "hero", heading: "35 Years of Craft", body: "Over 35 years stone restoration craft", factIds: ["f1", "ghost_fact_99"] },
        ],
      },
    ],
  };

  const report = traceClaimLineage({ root, business, storyboard, copyPlan });
  assert.equal(report.ok, false);
  assert.equal(report.traces.length, 3); // f1, f2, ghost_fact_99

  // f1 should have unbroken lineage from source to section
  const f1Trace = report.traces.find(t => t.claimId === "f1")!;
  assert.equal(f1Trace.broken, false);
  assert.equal(f1Trace.sourceNodes.length, 1);
  assert.equal(f1Trace.sourceNodes[0]!.id, "ev1");
  assert.equal(f1Trace.sectionNodes.length, 2); // storyboard hero + copyPlan hero

  // f2 should be broken due to missing harvest evidence
  const f2Trace = report.traces.find(t => t.claimId === "f2")!;
  assert.equal(f2Trace.broken, true);
  assert.ok(f2Trace.brokenReasons[0]!.includes("no upstream harvest source citations"));

  // ghost_fact_99 should be broken due to undeclared citation in copy
  const ghostTrace = report.traces.find(t => t.claimId === "ghost_fact_99")!;
  assert.equal(ghostTrace.broken, true);

  const brokenReasons = detectBrokenLineage(report.traces);
  assert.equal(brokenReasons.length, 2);
});

test("Capability: buildRepairPacket filters by findingId and verifyRepairResolution verifies defect resolution", () => {
  const root = temp();
  const kernel = root;
  mkdirSync(join(root, "agent/reviews"), { recursive: true });

  const findingA: Finding = {
    id: "finding_phone_ungrounded",
    target: "onboarding/copy-plan.json",
    page: "/",
    section: "footer",
    problem: 'Ungrounded phone number "0800 123 4567" found in footer',
    repair: "Remove or replace with harvested business phone",
    verify: "Footer phone matches onboarding/business.json",
    severity: "blocker",
    evidence: "ev1",
  };

  const findingB: Finding = {
    id: "finding_guarantee_missing",
    target: "onboarding/copy-plan.json",
    page: "/",
    section: "hero",
    problem: "Hero omitted the craft guarantee",
    repair: "Add mention of 25-year guarantee",
    verify: "Guarantee statement present",
    severity: "major",
    evidence: "",
  };

  const review = {
    version: 1,
    verdict: "fail",
    subjectHash: "sub_123",
    findings: [findingA, findingB],
  } as unknown as Review;
  writeFileSync(join(root, "agent/reviews/copy-review.json"), JSON.stringify(review, null, 2), "utf8");

  // Verify buildRepairPacket with specific findingId
  const node = { id: "copy", kind: "agent" as const, eval: "copy-review", repair: "copy", writes: ["onboarding/copy-plan.json"], needs: [] } as any;
  const state = { iteration: 1, nodes: {} } as any;

  // Repair packet targeting findingA specifically
  const packetA = buildRepairPacket({
    root,
    kernel,
    node,
    state,
    findingId: "finding_phone_ungrounded",
    obligationId: "obl_contact",
  });
  assert.equal(packetA.obligationId, "obl_contact");
  assert.equal(packetA.findingId, "finding_phone_ungrounded");

  // Verify resolution: no-op edit fails
  const noOpCheck = verifyRepairResolution({
    root,
    finding: findingA,
    obligationId: "obl_contact",
    previousArtifactContent: "Footer phone: 0800 123 4567",
    currentArtifactContent: "Footer phone: 0800 123 4567",
  });
  assert.equal(noOpCheck.resolved, false);
  assert.ok(noOpCheck.reason.includes("No modifications made"));

  // Verify resolution: problem still present fails
  const problemPersistsCheck = verifyRepairResolution({
    root,
    finding: findingA,
    obligationId: "obl_contact",
    previousArtifactContent: "Footer phone: 0800 123 4567",
    currentArtifactContent: "Footer: please call 0800 123 4567 for inquiries",
  });
  assert.equal(problemPersistsCheck.resolved, false);
  assert.ok(problemPersistsCheck.reason.includes("still contains flagged problem"));

  // Verify resolution: problem removed succeeds
  const resolvedCheck = verifyRepairResolution({
    root,
    finding: findingA,
    obligationId: "obl_contact",
    previousArtifactContent: "Footer phone: 0800 123 4567",
    currentArtifactContent: "Footer phone: 01452 789123 (from verified harvest)",
    semanticResolved: true,
  });
  assert.equal(resolvedCheck.resolved, true);
  assert.equal(resolvedCheck.findingId, "finding_phone_ungrounded");
});

test("Capability: makeDirectionScoreQuestion and makeMediaRelevanceQuestion generate dimensioned scoring questions", () => {
  const businessSummary = "Cotswold heritage stone slate conservation and masonry.";
  const directionSpec = "Warm Cotswold limestone palette, Caslon serif headers, restrained editorial grid.";

  // Test dimensioned questions
  const dimensions = ["business_fit", "typography", "composition", "authenticity"] as const;
  for (const dim of dimensions) {
    const q = makeDirectionScoreQuestion(dim, businessSummary, directionSpec);
    const instr = String(q.instructions || "");
    assert.ok(instr.includes(`dimension "${dim}"`));
    assert.ok(instr.includes(businessSummary));
    assert.equal(q.criteria.length, 5); // 0 to 4
    assert.equal(typeof questionSemanticsHash(q), "string");
  }

  // Test media relevance question
  const sectionText = "Our master craftsmen hand-dress stone slates using traditional masonry hammers.";
  const imageDesc = "Close-up photograph of mason trimming Cotswold stone slate with authentic iron hammer.";
  const mediaQ = makeMediaRelevanceQuestion(sectionText, imageDesc);
  const mediaInstr = String(mediaQ.instructions || "");
  assert.ok(mediaInstr.includes("Rate how relevant and authentic"));
  assert.ok(mediaInstr.includes(sectionText));
  assert.ok(mediaInstr.includes(imageDesc));
  assert.equal(mediaQ.criteria.length, 5);
});

test("Capability: matchPreferences evaluates content against versioned preference rubrics and penalizes anti-patterns", () => {
  const root = temp();
  const defaultRubric = loadPreferences(root);
  assert.equal(defaultRubric.rubricId, "brand_authenticity_v1");

  // Case 1: Authentic, vernacular direction matches positive signals
  const authenticSpec = "Traditional Cotswold stone masonry conservation craft with verified insurance guarantee and editorial typography.";
  const matchA = matchPreferences(defaultRubric, authenticSpec);
  assert.equal(matchA.acceptable, true);
  assert.ok(matchA.overallScore >= 0.70);
  assert.ok(matchA.matchedSignals.includes("stone"));
  assert.ok(matchA.matchedSignals.includes("cotswold"));
  assert.ok(matchA.matchedSignals.includes("guarantee"));
  assert.equal(matchA.matchedAntiPatterns.length, 0);

  // Case 2: Generic SaaS direction contains anti-patterns and fails acceptance
  const genericSaasSpec = "Modern turnkey AI-powered SaaS platform with instant booking, free trial, no credit card required, neon theme.";
  const matchB = matchPreferences(defaultRubric, genericSaasSpec);
  assert.equal(matchB.acceptable, false);
  assert.ok(matchB.matchedAntiPatterns.length >= 3);
  assert.ok(matchB.matchedAntiPatterns.includes("ai-powered"));
  assert.ok(matchB.matchedAntiPatterns.includes("free trial"));
  assert.ok(matchB.overallScore < 0.60);

  // Case 3: Custom rubric save and reload
  const customRubric: PreferenceRubric = {
    version: 2,
    rubricId: "custom_hospitality_v2",
    name: "Luxury Boutique Hospitality Rubric",
    description: "Evaluates luxury hotel visual presentation",
    criteria: [
      {
        id: "luxury_ambience",
        name: "Luxury Ambience",
        weight: 2.0,
        positiveSignals: ["intimate", "concierge", "bespoke suites", "curated"],
        negativeAntiPatterns: ["budget motel", "cheap stay", "dormitory"],
      },
    ],
  };

  savePreferences(root, customRubric);
  const loaded = loadPreferences(root);
  assert.equal(loaded.rubricId, "custom_hospitality_v2");
  assert.equal(loaded.version, 2);

  const hotelMatch = matchPreferences(loaded, "Bespoke suites with 24-hour curated concierge service.");
  assert.equal(hotelMatch.acceptable, true);
  assert.ok(hotelMatch.overallScore >= 0.75);
});

test("Capability: resolveTreatmentCapabilities configures treatments A, B, C and handles ablations", () => {
  // Treatment A: All capabilities off
  const capsA = resolveTreatmentCapabilities("A", undefined);
  assert.equal(capsA.grounding, "off");
  assert.equal(capsA.sourceSelection, "off");
  assert.equal(capsA.retrievalRanking, "off");
  assert.equal(capsA.consistency, "off");
  assert.equal(capsA.repairAssistance, "off");
  assert.equal(capsA.preferenceScoring, "off");

  // Treatment B: Grounding assist, others off
  const capsB = resolveTreatmentCapabilities("B", undefined);
  assert.equal(capsB.grounding, "assist");
  assert.equal(capsB.sourceSelection, "off");
  assert.equal(capsB.retrievalRanking, "off");
  assert.equal(capsB.consistency, "off");
  assert.equal(capsB.repairAssistance, "off");
  assert.equal(capsB.preferenceScoring, "off");

  // Treatment C: All assist
  const capsC = resolveTreatmentCapabilities("C", undefined);
  assert.equal(capsC.grounding, "assist");
  assert.equal(capsC.sourceSelection, "assist");
  assert.equal(capsC.retrievalRanking, "assist");
  assert.equal(capsC.consistency, "assist");
  assert.equal(capsC.repairAssistance, "assist");
  assert.equal(capsC.preferenceScoring, "assist");

  // Ablations: disable individual component
  for (const component of VALID_ABLATIONS) {
    const ablated = resolveTreatmentCapabilities("C", component);
    assert.equal(ablated[component], "off", `Ablated component ${component} should be off`);
    for (const other of VALID_ABLATIONS) {
      if (other !== component) {
        assert.equal(ablated[other], "assist", `Non-ablated component ${other} should remain assist`);
      }
    }
  }
});

test("Capability: loadTrialMetrics parses trial runs and compareRunMetrics measures shortlistRecall and defectRate", () => {
  const trialDir = temp();

  const runAData: RunMetrics = {
    runId: "run-A",
    label: "Treatment A (Baseline)",
    transportCalls: 14,
    inputTokens: 1493516,
    outputTokens: 159667,
    totalTokens: 1653183,
    clockDurationMs: 650000,
    cacheHits: 6944896,
    totalEvaluations: 20,
    claimFidelityPct: 100,
    criticIterations: 3,
    defectEscapeCount: 0,
    passedGatesCount: 8,
    failedGatesCount: 0,
    shortlistRecall: 0.95,
    defectRate: 0.05,
  };

  const runBData: RunMetrics = {
    runId: "run-B",
    label: "Treatment B (Bounded Batching)",
    transportCalls: 6,
    inputTokens: 450000,
    outputTokens: 50000,
    totalTokens: 500000,
    clockDurationMs: 250000,
    cacheHits: 2000000,
    totalEvaluations: 20,
    claimFidelityPct: 100,
    criticIterations: 2,
    defectEscapeCount: 0,
    passedGatesCount: 8,
    failedGatesCount: 0,
    shortlistRecall: 0.93, // 0.93 >= 0.95 * (1 - 0.05) = 0.9025 -> preserved under 5% margin
    defectRate: 0.051, // within 5% margin of 0.05
  };

  const runCData: RunMetrics = {
    runId: "run-C",
    label: "Treatment C (Full Stack)",
    transportCalls: 4,
    inputTokens: 250000,
    outputTokens: 30000,
    totalTokens: 280000,
    clockDurationMs: 180000,
    cacheHits: 1500000,
    totalEvaluations: 20,
    claimFidelityPct: 100,
    criticIterations: 1,
    defectEscapeCount: 0,
    passedGatesCount: 8,
    failedGatesCount: 0,
    shortlistRecall: 0.96,
    defectRate: 0.02,
  };

  writeFileSync(join(trialDir, "run-A.json"), JSON.stringify(runAData, null, 2), "utf8");
  writeFileSync(join(trialDir, "run-B.json"), JSON.stringify(runBData, null, 2), "utf8");
  writeFileSync(join(trialDir, "run-C.json"), JSON.stringify(runCData, null, 2), "utf8");

  // Test loadTrialMetrics
  const loaded = loadTrialMetrics(trialDir);
  assert.ok(loaded.runA);
  assert.ok(loaded.runB);
  assert.ok(loaded.runC);
  assert.equal(loaded.runs.length, 3);
  assert.equal(loaded.runA.runId, "run-A");
  assert.equal(loaded.runB.runId, "run-B");
  assert.equal(loaded.runC.runId, "run-C");
  assert.equal(loaded.runA.shortlistRecall, 0.95);
  assert.equal(loaded.runB.shortlistRecall, 0.93);
  assert.equal(loaded.runC.defectRate, 0.02);

  // Compare runs with 5% quality margin
  const report = compareRunMetrics(loaded.runA, loaded.runB, loaded.runC, { qualityMargin: 0.05 });
  assert.equal(report.verdict, "incomplete_quality_evidence");
  assert.ok((report.comparisons.bVsA.tokenSavingsPct ?? -1) > 60);
  assert.ok((report.comparisons.cVsA!.tokenSavingsPct ?? -1) > 80);

  // Format report includes shortlistRecall and defectRate
  const formatted = formatComparativeReport(report);
  assert.ok(formatted.includes("Shortlist Recall"));
  assert.ok(formatted.includes("95.0%"));
  assert.ok(formatted.includes("93.0%"));
  assert.ok(formatted.includes("96.0%"));
  assert.ok(formatted.includes("Defect Rate"));
  assert.ok(formatted.includes("5.0%"));
  assert.ok(formatted.includes("2.0%"));

  // Verify regression detection when recall drops beyond allowable margin
  const regressedRunB: RunMetrics = {
    ...runBData,
    shortlistRecall: 0.80, // 0.80 < 0.95 * 0.95 = 0.9025
  };
  const regressedDiff = compareRuns(runAData, regressedRunB, { qualityMargin: 0.05 });
  assert.equal(regressedDiff.qualityPreserved, false);
  assert.ok(regressedDiff.notes.some(n => n.includes("Shortlist recall regressed")));
});
