import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fingerprint, json, save, within, type Business, type Review, type Storyboard } from "./agent/artifacts.ts";
import { initialState, parseGraphYaml, type SkillGraph, type AgentState, type GraphNode } from "./agent/graph.ts";
import { inputHash, loadState } from "./agent/runner.ts";
import {
  prepareStage,
  completeStage,
  cancelStage,
  executeToolStage,
  computeNextState,
  aggregateJevReceiptSpend,
} from "./agent/lifecycle.ts";
import {
  acquireMutationLock,
  acquireDurableLease,
  isDurableLeaseHeld,
  releaseDurableLease,
  hasActiveStageLease,
  checkGlobalStageExclusion,
  recoverCommitJournal,
  savePreparation,
  loadPreparation,
  findActivePreparation,
  sha256Hex,
  snapshotInventory,
  verifyAllowedWrites,
} from "./agent/preparation.ts";

import { buildSharedGroundingBatch, sha256Hex as jevSha256Hex } from "./agent/jev/state.ts";
import { buildGroundingBatchQuestions } from "./agent/jev/review.ts";
import { buildCompactContextPacket, computeManifestHash, DEFAULT_PACKET_BUDGETS } from "./agent/jev/packets.ts";
import { loadJevConfig, DEFAULT_JEV_CONFIG, DEFAULT_JEV_CAPABILITIES } from "./agent/jev/config.ts";
import { runWorkflow } from "./agent/workflow.ts";
import { saveWorkflowConfig } from "./agent/workflow-config.ts";
import { JevClient } from "./agent/jev/client.ts";
import { loadEvidenceLedger } from "./agent/jev/ledger.ts";
import { questionSemanticsHash } from "./agent/jev/questions.ts";
import type { JevConfig, JevReceipt } from "./agent/jev/types.ts";
import { loadTaskExecution } from "./agent/jev/service-registry.ts";

const kernel = resolve(import.meta.dirname, "..");
const temp = () => mkdtempSync(join(tmpdir(), "vitris-lifecycle-"));

test("representative build output is permitted while unrelated source mutations stay blocked", () => {
  const root = temp();
  const node: GraphNode = { id: "representative", kind: "agent", needs: [], writes: ["pages", "components", "site.json"], refs: [], tools: [], eval: "representative", maxAttempts: 2 };
  const baseline = snapshotInventory(root);
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist/index.html"), "<h1>Built site</h1>");
  writeFileSync(join(root, "package.json"), "{}");
  const result = verifyAllowedWrites({ root, node, baselineInventory: baseline, allowedWrites: node.writes });
  assert.ok(result.created.includes("dist/index.html"));
  assert.deepEqual(result.violations, ["Unauthorized created file: package.json"]);
});

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
  evidence: [{ id: "e1", source: "onboarding/copy/home.md", excerpt: "We repair roofs" }],
  uncertainties: [],
};

function createTestSite(): { root: string; graph: SkillGraph; state: AgentState } {
  const root = temp();
  cpSync(join(kernel, "agent"), join(root, "agent"), { recursive: true });
  mkdirSync(join(root, "onboarding"), { recursive: true });
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "components"), { recursive: true });
  const graph = parseGraphYaml(readFileSync(join(kernel, "agent/graph.yaml"), "utf8"));
  const state = initialState(graph);
  save(join(root, "launch.json"), { name: "Test Site" });
  save(join(root, "onboarding/brief.json"), { sourceUrl: "https://example.com", business: { name: "Test Site" } });
  mkdirSync(join(root, "onboarding/copy"), { recursive: true });
  writeFileSync(join(root, "onboarding/copy/home.md"), "We repair roofs", "utf8");
  const harvestNode = graph.nodes.find(n => n.id === "harvest")!;
  state.nodes.harvest = {
    status: "done",
    attempts: 1,
    inputHash: inputHash(root, harvestNode),
    outputHash: fingerprint(root, harvestNode.writes),
    skillHash: fingerprint(root, ["agent/graph.yaml", "agent/PROMPT.md", ...harvestNode.refs.map(r => `agent/refs/${r}.md`)]),
  };
  save(join(root, "agent/STATE.json"), state);
  return { root, graph, state };
}

function setupFakeAdapter(root: string, sentinelPath: string) {
  const scriptPath = join(root, "fake-adapter.mjs");
  writeFileSync(
    scriptPath,
    `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(sentinelPath)}, "DISPATCHED"); process.exit(0);\n`,
    "utf8"
  );
  save(join(root, "agent/adapter.json"), {
    command: process.execPath,
    args: [scriptPath],
    prompt: "stdin",
  });
}

// -----------------------------------------------------------------------------
// Suite 1: External dispatch escapes (P1)
// -----------------------------------------------------------------------------
test("Suite 1: --legacy-worker flag is rejected and sentinel is never touched", async () => {
  const { root, graph } = createTestSite();
  const sentinel = join(root, "sentinel-legacy-worker.txt");
  setupFakeAdapter(root, sentinel);

  const res = await runWorkflow({
    root,
    kernel,
    argv: [process.execPath, "ralph.ts", "--legacy-worker"],
    skipLock: true,
  });

  assert.equal(res.exitCode, 1);
  assert.equal(existsSync(sentinel), false, "Sentinel must never be written");
});

test("Suite 1: --worker flag is rejected and sentinel is never touched", async () => {
  const { root } = createTestSite();
  const sentinel = join(root, "sentinel-worker.txt");
  setupFakeAdapter(root, sentinel);

  const res = await runWorkflow({
    root,
    kernel,
    argv: [process.execPath, "ralph.ts", "--worker"],
    skipLock: true,
  });

  assert.equal(res.exitCode, 1);
  assert.equal(existsSync(sentinel), false, "Sentinel must never be written");
});

test("Suite 1: VITRIS_LEGACY_WORKER=1 env var is rejected and sentinel is never touched", async () => {
  const { root } = createTestSite();
  const sentinel = join(root, "sentinel-env.txt");
  setupFakeAdapter(root, sentinel);

  const prevEnv = process.env.VITRIS_LEGACY_WORKER;
  process.env.VITRIS_LEGACY_WORKER = "1";
  try {
    const res = await runWorkflow({
      root,
      kernel,
      argv: [process.execPath, "ralph.ts"],
      skipLock: true,
    });
    assert.equal(res.exitCode, 1);
    assert.equal(existsSync(sentinel), false, "Sentinel must never be written");
  } finally {
    if (prevEnv !== undefined) process.env.VITRIS_LEGACY_WORKER = prevEnv;
    else delete process.env.VITRIS_LEGACY_WORKER;
  }
});

test("Suite 1: external-worker executionMode in workflow.json is rejected", async () => {
  const { root } = createTestSite();
  const sentinel = join(root, "sentinel-cfg.txt");
  setupFakeAdapter(root, sentinel);

  saveWorkflowConfig(root, {
    schemaVersion: 1,
    executionMode: "external-worker",
  });

  const res = await runWorkflow({
    root,
    kernel,
    argv: [process.execPath, "ralph.ts"],
    skipLock: true,
  });

  assert.equal(res.exitCode, 1);
  assert.equal(existsSync(sentinel), false, "Sentinel must never be written");
});

test("Suite 1: --once flag prepares active stage and yields without spawning adapter", async () => {
  const { root } = createTestSite();
  const sentinel = join(root, "sentinel-once.txt");
  setupFakeAdapter(root, sentinel);

  const res = await runWorkflow({
    root,
    kernel,
    argv: [process.execPath, "ralph.ts", "--once"],
    skipLock: true,
  });

  assert.equal(existsSync(sentinel), false, "Sentinel must not be touched on --once");
  assert.equal(existsSync(join(root, "agent/CURRENT.md")), true, "CURRENT.md must be prepared");
});

test("Suite 1: skipLock flag prepares active stage and yields without spawning adapter", async () => {
  const { root } = createTestSite();
  const sentinel = join(root, "sentinel-skiplock.txt");
  setupFakeAdapter(root, sentinel);

  await runWorkflow({
    root,
    kernel,
    argv: [process.execPath, "ralph.ts"],
    skipLock: true,
  });

  assert.equal(existsSync(sentinel), false, "Sentinel must not be touched on skipLock");
  assert.equal(existsSync(join(root, "agent/CURRENT.md")), true, "CURRENT.md must be prepared");
});

test("Suite 1: assigned-direction.json does not spawn adapter", async () => {
  const { root } = createTestSite();
  const sentinel = join(root, "sentinel-assigned.txt");
  setupFakeAdapter(root, sentinel);
  writeFileSync(join(root, "agent/assigned-direction.json"), JSON.stringify({ assigned: "test" }), "utf8");

  await runWorkflow({
    root,
    kernel,
    argv: [process.execPath, "ralph.ts"],
    skipLock: true,
  });

  assert.equal(existsSync(sentinel), false, "Sentinel must not be touched with assigned-direction.json");
});

// -----------------------------------------------------------------------------
// Suite 2: Pre-work preparation enforcement (P1)
// -----------------------------------------------------------------------------
test("Suite 2: --complete without --preparation throws error and rejects on-demand preparation", async () => {
  const { root } = createTestSite();
  const res = await runWorkflow({
    root,
    kernel,
    argv: [process.execPath, "ralph.ts", "--complete", "--node", "business"],
    skipLock: true,
  });
  assert.equal(res.exitCode, 1, "Must fail when --preparation is missing");
});

test("Suite 2: --complete with non-existent preparationId throws error", async () => {
  const { root } = createTestSite();
  const res = await runWorkflow({
    root,
    kernel,
    argv: [process.execPath, "ralph.ts", "--complete", "--preparation", "non-existent-uuid-1234"],
    skipLock: true,
  });
  assert.equal(res.exitCode, 1, "Must fail when preparation does not exist");
});

test("Suite 2: prepareStage rejects node with unmet dependencies", async () => {
  const { root, graph, state } = createTestSite();
  // direction depends on business; business is pending
  state.nodes.business = { status: "pending", attempts: 0 };

  await assert.rejects(
    async () => {
      await prepareStage({ root, kernel, graph, state, nodeId: "direction" });
    },
    /dependencies.*not satisfied/i
  );
});

test("Suite 2: completeStage rejects node with unmet dependencies", async () => {
  const { root, graph, state } = createTestSite();
  state.nodes.business = { status: "done", attempts: 1 };
  // Prepare business-review when business was done
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business-review" });
  assert.ok(prep.preparation);

  // Now simulate state corruption or invalidation where business is pending
  state.nodes.business = { status: "pending", attempts: 0 };

  await assert.rejects(
    async () => {
      await completeStage({
        root,
        kernel,
        graph,
        state,
        preparationId: prep.preparation!.id,
      });
    },
    /dependencies not met/i
  );
});

// -----------------------------------------------------------------------------
// Suite 3: Stale & invalid graph rejection (P1)
// -----------------------------------------------------------------------------
test("Suite 3: completeStage rejects preparation if graphVersion changed", async () => {
  const { root, graph, state } = createTestSite();
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);

  // Graph version changes from 3 to 4
  const alteredGraph = { ...graph, version: 4 };

  await assert.rejects(
    async () => {
      await completeStage({
        root,
        kernel,
        graph: alteredGraph,
        state,
        preparationId: prep.preparation!.id,
      });
    },
    /graph version changed/i
  );
});

test("Suite 3: completeStage rejects preparation if immutable dependencies changed", async () => {
  const { root, graph, state } = createTestSite();
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);

  // Modify brief.json (immutable input for business)
  save(join(root, "onboarding/brief.json"), { sourceUrl: "https://modified.example.com" });

  await assert.rejects(
    async () => {
      await completeStage({
        root,
        kernel,
        graph,
        state,
        preparationId: prep.preparation!.id,
      });
    },
    /immutable dependencies were modified/i
  );
});

test("Suite 3: completeStage rejects preparation if agent/CURRENT.md prompt was tampered with", async () => {
  const { root, graph, state } = createTestSite();
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);

  // Overwrite agent/CURRENT.md with tampered content
  writeFileSync(join(root, "agent/CURRENT.md"), "# TAMPERED PROMPT INSTRUCTIONS\n", "utf8");

  await assert.rejects(
    async () => {
      await completeStage({
        root,
        kernel,
        graph,
        state,
        preparationId: prep.preparation!.id,
      });
    },
    /agent\/CURRENT\.md content has changed/i
  );
});

// -----------------------------------------------------------------------------
// Suite 4: Token ownership & lock safety & durable stage exclusion (P1)
// -----------------------------------------------------------------------------
test("Suite 4: token-safe lock release prevents expired lock from unlinking successor lock", () => {
  const root = temp();
  mkdirSync(join(root, "agent"), { recursive: true });

  // 1. Acquire Lock A
  const lockA = acquireMutationLock(root, 5000);
  const lockFilePath = join(root, "agent/.mutation.lock");
  assert.ok(existsSync(lockFilePath));

  // 2. Artificially expire Lock A
  const lockDataA = JSON.parse(readFileSync(lockFilePath, "utf8"));
  lockDataA.createdAt = Date.now() - 20000; // 20s ago
  lockDataA.expiresAt = Date.now() - 1000; // expired 1s ago
  writeFileSync(lockFilePath, JSON.stringify(lockDataA), "utf8");

  // 3. Acquire Lock B (takes over expired lock)
  const lockB = acquireMutationLock(root, 5000);
  const lockDataB = JSON.parse(readFileSync(lockFilePath, "utf8"));
  assert.notEqual(lockDataA.lockToken, lockDataB.lockToken);

  // 4. Lock A calls its release: it must NOT delete Lock B's lock file!
  lockA.release();
  assert.ok(existsSync(lockFilePath), "Lock file must still exist after stale Lock A release");
  const lockDataStillB = JSON.parse(readFileSync(lockFilePath, "utf8"));
  assert.equal(lockDataStillB.lockToken, lockDataB.lockToken, "Lock B must retain ownership");

  // 5. Lock B calls its release: it should delete the lock file
  lockB.release();
  assert.equal(existsSync(lockFilePath), false, "Lock file unlinked by true owner");
});

test("Suite 4: cannot prepare second stage while active stage lease exists", async () => {
  const { root, graph, state } = createTestSite();

  // Prepare business stage
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);
  assert.ok(hasActiveStageLease(root).held);

  // Attempt to prepare another node while business lease is active
  await assert.rejects(
    async () => {
      checkGlobalStageExclusion(root, "direction");
    },
    /active until/i
  );
});

test("Suite 4: canceling stage releases durable lease", async () => {
  const { root, graph, state } = createTestSite();

  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);
  assert.ok(hasActiveStageLease(root).held);

  // Cancel business preparation
  cancelStage({ root, preparationId: prep.preparation.id, reason: "Operator canceled" });
  assert.equal(hasActiveStageLease(root).held, false, "Stage lease must be released after cancel");
});

test("Suite 4: durable stage lease survives outside process lifetime until expiry", () => {
  const root = temp();
  mkdirSync(join(root, "agent/leases"), { recursive: true });

  const { token, release } = acquireDurableLease({
    root,
    leaseName: "stage-test-node",
    durationMs: 60000,
    isAgentStage: true,
  });

  // Lease held even when checking outside current pid
  assert.ok(isDurableLeaseHeld(root, "stage-test-node"));
  assert.ok(hasActiveStageLease(root).held);

  releaseDurableLease(root, "stage-test-node", token);
  assert.equal(isDurableLeaseHeld(root, "stage-test-node"), false);
});

// -----------------------------------------------------------------------------
// Suite 5: Collision-resistant evidence identities (P1)
// -----------------------------------------------------------------------------
test("Suite 5: Aa supported contact and BB supported contact produce different SHA-256 hashes", () => {
  const hash1 = sha256Hex("Aa supported contact");
  const hash2 = sha256Hex("BB supported contact");

  assert.notEqual(hash1, hash2, "SHA-256 must distinguish known 32-bit hash collision strings");
  assert.equal(hash1.length, 64);
  assert.equal(hash2.length, 64);
});

test("Suite 5: shared grounding preserves multiple source aliases and spans", () => {
  const items = [
    { source: "onboarding/copy/home.md", span: [10, 50] as [number, number], excerpt: "We repair roofs", alias: "e1" },
    { source: "onboarding/copy/about.md", span: [5, 45] as [number, number], excerpt: "We repair roofs", alias: "e2" },
  ];

  const batch = buildSharedGroundingBatch(items);
  assert.equal(batch.evidence.length, 1, "Duplicate excerpt should unify into single item");
  assert.equal(batch.evidence[0]!.sources!.length, 2, "Both source locations must be preserved");
  assert.deepEqual(batch.evidence[0]!.sources![0], { source: "onboarding/copy/home.md", span: [10, 50], alias: "e1" });
  assert.deepEqual(batch.evidence[0]!.sources![1], { source: "onboarding/copy/about.md", span: [5, 45], alias: "e2" });
});

test("Suite 5: grounding questions throw explicit error on missing key and never fallback to ev_0", () => {
  const batch = {
    claims: [{ id: "c1", statement: "Repairs roofs", evidenceIds: ["non-existent-hash-999"] }],
    evidence: [{ id: "ev_valid", excerpt: "We repair roofs", sources: [] }],
  };

  assert.throws(
    () => {
      buildGroundingBatchQuestions(batch as any);
    },
    /Missing evidence key in shared grounding batch/i
  );
});

test("Suite 5: questionSemanticsHash changes when question criteria wording changes even if QUESTION_VERSION is unchanged", () => {
  const criteria1 = {
    supports: "The evidence supports the claim directly.",
    contradicts: "The evidence contradicts the claim.",
    says_nothing: "The evidence says nothing about the claim.",
  };
  const criteria2 = {
    supports: "The evidence strongly supports the claim directly.", // 1 word changed
    contradicts: "The evidence contradicts the claim.",
    says_nothing: "The evidence says nothing about the claim.",
  };

  const hash1 = questionSemanticsHash(criteria1);
  const hash2 = questionSemanticsHash(criteria2);

  assert.notEqual(hash1, hash2, "Changing question wording must change semantics hash to prevent stale cache hits");
  assert.equal(hash1.length, 64);
  assert.equal(hash2.length, 64);
});

// -----------------------------------------------------------------------------
// Suite 6: Review coverage manifests & context budgets (P1)
// -----------------------------------------------------------------------------
test("Suite 6: buildCompactContextPacket extracts requiredPartitions for copy-review", () => {
  const { root, graph, state } = createTestSite();
  save(join(root, "onboarding/copy-plan.json"), {
    pages: [{ path: "/" }, { path: "/about" }, { path: "/contact" }],
  });
  save(join(root, "onboarding/storyboard.json"), {
    pages: [{ path: "/" }, { path: "/about" }, { path: "/contact" }],
  });

  const node = graph.nodes.find(n => n.id === "copy-review")!;
  const res = buildCompactContextPacket({
    root,
    kernel,
    graph,
    state,
    node,
  });

  assert.ok(res.manifest.requiredPartitions);
  assert.deepEqual(res.manifest.requiredPartitions, ["/", "/about", "/contact"]);
});

test("Suite 6: completeStage fails copy-review if required partitions are not covered", async () => {
  const { root, graph, state } = createTestSite();
  // Mark prior stages done up to copy
  state.nodes.business = { status: "done", attempts: 1 };
  state.nodes["business-review"] = { status: "done", attempts: 1 };
  state.nodes.media = { status: "done", attempts: 1 };
  state.nodes.direction = { status: "done", attempts: 1 };
  state.nodes["direction-review"] = { status: "done", attempts: 1 };
  state.nodes.storyboard = { status: "done", attempts: 1 };
  state.nodes.copy = { status: "done", attempts: 1 };

  save(join(root, "onboarding/business.json"), sampleBusiness);
  save(join(root, "onboarding/storyboard.json"), {
    version: 2,
    businessHash: "b1",
    directionHash: "d1",
    routes: [],
    pages: [
      { path: "/", purpose: "Home", representative: true, sections: [] },
      { path: "/about", purpose: "About", representative: false, sections: [] },
    ],
  });
  save(join(root, "onboarding/copy-plan.json"), {
    storyboardHash: "sb1",
    pages: [
      { path: "/", sections: [] },
      { path: "/about", sections: [] },
    ],
  });

  const prepRes = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "copy-review",
    jevConfig: { ...loadJevConfig(root), compactPackets: true },
  });
  assert.ok(prepRes.preparation);

  // Write a passing review that only covered "/" but omitted "/about"
  const partialReview: Review = {
    version: 2,
    subjectHash: prepRes.preparation.reviewSubjectHash || "h1",
    verdict: "pass",
    reviewer: "critic",
    evidence: ["onboarding/copy-plan.json"],
    checks: [{ criterion: "accuracy", verdict: "pass", evidence: "valid" }],
    findings: [],
    partitions: ["/"], // Missing "/about"!
  };
  save(join(root, "agent/reviews/copy-review.json"), partialReview);

  const compResult = await completeStage({
    root,
    kernel,
    graph,
    state,
    preparationId: prepRes.preparation.id,
  });

  assert.equal(compResult.ok, false);
  assert.ok(compResult.failures.some(f => f.includes("Review does not cover all required partitions: /about")));
});

test("Suite 6: completeStage passes copy-review when all required partitions are covered", async () => {
  const { root, graph, state } = createTestSite();
  state.nodes.business = { status: "done", attempts: 1 };
  state.nodes["business-review"] = { status: "done", attempts: 1 };
  state.nodes.media = { status: "done", attempts: 1 };
  state.nodes.direction = { status: "done", attempts: 1 };
  state.nodes["direction-review"] = { status: "done", attempts: 1 };
  state.nodes.storyboard = { status: "done", attempts: 1 };
  state.nodes.copy = { status: "done", attempts: 1 };

  save(join(root, "onboarding/business.json"), sampleBusiness);
  save(join(root, "onboarding/storyboard.json"), {
    version: 2,
    businessHash: "b1",
    directionHash: "d1",
    routes: [],
    pages: [
      { path: "/", purpose: "Home", representative: true, sections: [] },
      { path: "/about", purpose: "About", representative: false, sections: [] },
    ],
  });
  save(join(root, "onboarding/copy-plan.json"), {
    storyboardHash: "sb1",
    pages: [
      { path: "/", sections: [] },
      { path: "/about", sections: [] },
    ],
  });

  const prepRes = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "copy-review",
    jevConfig: { ...loadJevConfig(root), compactPackets: true },
  });
  assert.ok(prepRes.preparation);

  // Write a passing review covering all partitions
  const completeRev: Review = {
    version: 2,
    subjectHash: prepRes.preparation.reviewSubjectHash || "h1",
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
    partitions: ["/", "/about"],
  };
  save(join(root, "agent/reviews/copy-review.json"), completeRev);

  const compResult = await completeStage({
    root,
    kernel,
    graph,
    state,
    preparationId: prepRes.preparation.id,
  });

  assert.equal(compResult.ok, true, `Expected pass, got failures: ${compResult.failures.join(", ")}`);
});

test("Suite 6: tampered manifest fails completeStage", async () => {
  const { root, graph, state } = createTestSite();
  state.nodes.business = { status: "done", attempts: 1 };
  state.nodes["business-review"] = { status: "done", attempts: 1 };
  state.nodes.media = { status: "done", attempts: 1 };
  state.nodes.direction = { status: "done", attempts: 1 };
  state.nodes["direction-review"] = { status: "done", attempts: 1 };
  state.nodes.storyboard = { status: "done", attempts: 1 };
  state.nodes.copy = { status: "done", attempts: 1 };

  save(join(root, "onboarding/copy-plan.json"), { pages: [{ path: "/" }] });
  save(join(root, "onboarding/storyboard.json"), { pages: [{ path: "/" }] });

  const prepRes = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "copy-review",
    jevConfig: { ...loadJevConfig(root), compactPackets: true },
  });
  assert.ok(prepRes.preparation);

  // Tamper with manifest on disk
  const manifestPath = join(root, "agent/runs/copy-review.manifest.json");
  const loadedManifest = json<any>(manifestPath);
  loadedManifest.included.push({ path: "tampered/file.txt", reason: "tampered" });
  writeFileSync(manifestPath, JSON.stringify(loadedManifest, null, 2), "utf8");

  const compResult = await completeStage({
    root,
    kernel,
    graph,
    state,
    preparationId: prepRes.preparation.id,
  });

  assert.equal(compResult.ok, false);
  assert.ok(compResult.failures.some(f => f.includes("Manifest integrity check failed")));
});

test("Suite 6: prepareStage rejects when mandatory packet constraints exceed budget", async () => {
  const { root, graph, state } = createTestSite();
  state.nodes.business = { status: "done", attempts: 1 };
  state.nodes["business-review"] = { status: "done", attempts: 1 };
  state.nodes.media = { status: "done", attempts: 1 };
  state.nodes.direction = { status: "done", attempts: 1 };
  state.nodes["direction-review"] = { status: "done", attempts: 1 };
  state.nodes.storyboard = { status: "done", attempts: 1 };
  state.nodes.copy = { status: "done", attempts: 1 };

  save(join(root, "onboarding/copy-plan.json"), { pages: [{ path: "/" }] });
  save(join(root, "onboarding/storyboard.json"), { pages: [{ path: "/" }] });

  const originalBudget = DEFAULT_PACKET_BUDGETS["copy-review"]!.maxChars;
  try {
    // Force a tiny budget that mandatory content alone exceeds
    DEFAULT_PACKET_BUDGETS["copy-review"]!.maxChars = 200;

    await assert.rejects(
      async () => {
        await prepareStage({
          root,
          kernel,
          graph,
          state,
          nodeId: "copy-review",
          jevConfig: { ...loadJevConfig(root), compactPackets: true },
        });
      },
      /exceed budget/
    );
  } finally {
    DEFAULT_PACKET_BUDGETS["copy-review"]!.maxChars = originalBudget;
  }
});

test("Suite 6: completeStage verifies overflow file integrity and fails if file is missing or tampered", async () => {
  const dummyOverflowText = "Additional optional business context that overflowed";
  const expectedHash = sha256Hex(dummyOverflowText);

  // 1. Missing overflow file fails completeStage
  {
    const { root, graph, state } = createTestSite();
    const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
    assert.ok(prep.preparation);
    const preparation = prep.preparation;
    save(join(root, "onboarding/business.json"), sampleBusiness);
    preparation.overflowHash = expectedHash;
    savePreparation(root, preparation);

    const missingRes = await completeStage({
      root,
      kernel,
      graph,
      state,
      preparationId: preparation.id,
    });
    assert.equal(missingRes.ok, false);
    assert.ok(missingRes.failures.some(f => f.includes(`Overflow integrity check failed: missing ${preparation.id}.overflow.json`)));
  }

  // 2. Tampered overflow file fails completeStage
  {
    const { root, graph, state } = createTestSite();
    const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
    assert.ok(prep.preparation);
    const preparation = prep.preparation;
    save(join(root, "onboarding/business.json"), sampleBusiness);
    preparation.overflowHash = expectedHash;
    savePreparation(root, preparation);

    const overflowPath = join(root, "agent/runs", `${preparation.id}.overflow.json`);
    mkdirSync(join(root, "agent/runs"), { recursive: true });
    writeFileSync(
      overflowPath,
      JSON.stringify({
        schemaVersion: 1,
        preparationId: preparation.id,
        overflowHash: "tampered-wrong-hash",
        overflowText: dummyOverflowText,
      }),
      "utf8"
    );

    const tamperedRes = await completeStage({
      root,
      kernel,
      graph,
      state,
      preparationId: preparation.id,
    });
    assert.equal(tamperedRes.ok, false);
    assert.ok(tamperedRes.failures.some(f => f.includes(`Overflow integrity check failed: content hash mismatch for ${preparation.id}.overflow.json`)));
  }

  // 3. Matching overflow file passes overflow integrity check
  {
    const { root, graph, state } = createTestSite();
    const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
    assert.ok(prep.preparation);
    const preparation = prep.preparation;
    save(join(root, "onboarding/business.json"), sampleBusiness);
    preparation.overflowHash = expectedHash;
    savePreparation(root, preparation);

    const overflowPath = join(root, "agent/runs", `${preparation.id}.overflow.json`);
    mkdirSync(join(root, "agent/runs"), { recursive: true });
    writeFileSync(
      overflowPath,
      JSON.stringify({
        schemaVersion: 1,
        preparationId: preparation.id,
        overflowHash: expectedHash,
        overflowText: dummyOverflowText,
      }),
      "utf8"
    );

    const validRes = await completeStage({
      root,
      kernel,
      graph,
      state,
      preparationId: preparation.id,
    });
    assert.equal(validRes.ok, true, `Expected completeStage to succeed with valid overflow file, got: ${validRes.failures.join(", ")}`);
  }
});

// -----------------------------------------------------------------------------
// Suite 7: Crash / recovery boundaries & two-phase commit journal (P1)
// -----------------------------------------------------------------------------
test("Suite 7: crash injection before_journal leaves state and preparation untouched", async () => {
  const { root, graph, state } = createTestSite();
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);
  save(join(root, "onboarding/business.json"), sampleBusiness);

  await assert.rejects(
    async () => {
      await completeStage({
        root,
        kernel,
        graph,
        state,
        preparationId: prep.preparation!.id,
        crashInjection: "before_journal",
      });
    },
    /CRASH_INJECTION:before_journal/
  );

  const stateOnDisk = json<AgentState>(join(root, "agent/STATE.json"));
  assert.equal(stateOnDisk.nodes.business?.status || "pending", "pending");
  assert.equal(stateOnDisk.nodes.business?.attempts || 0, 0);
  const prepOnDisk = loadPreparation(root, prep.preparation.id);
  assert.equal(prepOnDisk?.status, "prepared");
});

test("Suite 7: crash injection before_state recovers targetState and marks prep consumed on restart", async () => {
  const { root, graph, state } = createTestSite();
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);
  save(join(root, "onboarding/business.json"), sampleBusiness);

  await assert.rejects(
    async () => {
      await completeStage({
        root,
        kernel,
        graph,
        state,
        preparationId: prep.preparation!.id,
        crashInjection: "before_state",
      });
    },
    /CRASH_INJECTION:before_state/
  );

  // Journal file exists in graded phase
  assert.ok(existsSync(join(root, "agent/.commit-journal.json")));

  // Recover commit journal on next run
  const recovery = recoverCommitJournal(root, graph);
  assert.equal(recovery.recovered, true);

  const stateOnDisk = json<AgentState>(join(root, "agent/STATE.json"));
  assert.equal(stateOnDisk.nodes.business?.status, "done");
  assert.equal(stateOnDisk.nodes.business?.attempts, 1);

  const prepOnDisk = loadPreparation(root, prep.preparation.id);
  assert.equal(prepOnDisk?.status, "consumed");
  assert.equal(existsSync(join(root, "agent/.commit-journal.json")), false);
});

test("Suite 7: crash injection after_state recovers prep consumed on restart", async () => {
  const { root, graph, state } = createTestSite();
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);
  save(join(root, "onboarding/business.json"), sampleBusiness);

  await assert.rejects(
    async () => {
      await completeStage({
        root,
        kernel,
        graph,
        state,
        preparationId: prep.preparation!.id,
        crashInjection: "after_state",
      });
    },
    /CRASH_INJECTION:after_state/
  );

  assert.ok(existsSync(join(root, "agent/.commit-journal.json")));
  const recovery = recoverCommitJournal(root, graph);
  assert.equal(recovery.recovered, true);

  const prepOnDisk = loadPreparation(root, prep.preparation.id);
  assert.equal(prepOnDisk?.status, "consumed");
  assert.equal(existsSync(join(root, "agent/.commit-journal.json")), false);
});

test("Suite 7: crash recovery preserves Jev receipt directory and receipt readability", async () => {
  const { root, graph, state } = createTestSite();

  // Create decisions/jev directory with a valid receipt
  const decisionsDir = join(root, "agent/decisions/jev");
  mkdirSync(decisionsDir, { recursive: true });
  const sampleReceipt: JevReceipt = {
    schemaVersion: 1,
    receiptId: randomUUID(),
    taskType: "grounding",
    model: "jev-1.13.0",
    policyVersion: "2026-09-17.2",
    questionVersion: "2026-09-17.2",
    stateHash: "abc123state",
    durationMs: 45,
    createdAt: new Date().toISOString(),
    status: "ok",
    cached: false,
    usage: { inputTokens: 50, outputTokens: 20 },
    retries: 0,
    answers: { test: "val" },
  };
  const receiptFile = join(decisionsDir, "sample-receipt.json");
  writeFileSync(receiptFile, JSON.stringify(sampleReceipt, null, 2), "utf8");

  // Run prepare and crash injection before_state
  const prep = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business",
  });
  assert.ok(prep.preparation);

  save(join(root, "onboarding/business.json"), sampleBusiness);

  // Crash before_state
  await assert.rejects(
    async () => {
      await completeStage({
        root,
        kernel,
        graph,
        state,
        preparationId: prep.preparation!.id,
        crashInjection: "before_state",
      });
    },
    /CRASH_INJECTION:before_state/
  );

  // Crash recovery on next run
  const recovered = recoverCommitJournal(root, graph);
  assert.ok(recovered);

  // Assert receipt is still intact and valid JSON
  assert.ok(existsSync(receiptFile), "Jev receipt must survive crash and recovery");
  const parsed = JSON.parse(readFileSync(receiptFile, "utf8")) as JevReceipt;
  assert.equal(parsed.receiptId, sampleReceipt.receiptId);
  assert.equal(parsed.status, "ok");
  assert.equal(parsed.usage.inputTokens, 50);
});

// -----------------------------------------------------------------------------
// Suite 8: Tool stage parity (P2)
// -----------------------------------------------------------------------------
test("Suite 8: tool stage catches unauthorized writes outside declared writes", async () => {
  const { root, graph, state } = createTestSite();
  const toolNode: GraphNode = {
    id: "test-tool-rogue",
    kind: "tool",
    needs: ["harvest"],
    writes: ["onboarding/allowed.txt"],
    refs: [],
    tools: [],
    eval: "harvest",
    maxAttempts: 2,
    command: [
      process.execPath,
      "-e",
      "require('fs').writeFileSync('pages/unauthorized.html', 'bad'); require('fs').writeFileSync('onboarding/allowed.txt', 'ok');",
    ],
  };

  const res = await executeToolStage({
    root,
    kernel,
    graph,
    state,
    node: toolNode,
  });

  assert.equal(res.ok, false);
  assert.ok(res.failures.some(f => f.includes("pages/unauthorized.html") || f.includes("outside declared writes")));
});

test("Suite 8: tool stage catches capture mutations outside harvest", async () => {
  const { root, graph, state } = createTestSite();
  const toolNode: GraphNode = {
    id: "test-tool-capture-leak",
    kind: "tool",
    needs: ["harvest"],
    writes: ["onboarding/allowed.txt"],
    refs: [],
    tools: [],
    eval: "harvest",
    maxAttempts: 2,
    command: [
      process.execPath,
      "-e",
      "require('fs').writeFileSync('onboarding/brief.json', '{\"mutated\": true}'); require('fs').writeFileSync('onboarding/allowed.txt', 'ok');",
    ],
  };

  const res = await executeToolStage({
    root,
    kernel,
    graph,
    state,
    node: toolNode,
  });

  assert.equal(res.ok, false);
  assert.ok(res.failures.some(f => f.includes("mutated captured evidence outside harvest")));
});

test("Suite 8: tool stage handles abort signal", async () => {
  const { root, graph, state } = createTestSite();
  const controller = new AbortController();
  controller.abort(new Error("User cancelled"));

  const toolNode: GraphNode = {
    id: "test-tool-abort",
    kind: "tool",
    needs: ["harvest"],
    writes: ["onboarding/allowed.txt"],
    refs: [],
    tools: [],
    eval: "harvest",
    maxAttempts: 2,
    command: [process.execPath, "-e", "process.exit(0);"],
  };

  await assert.rejects(
    async () => {
      await executeToolStage({
        root,
        kernel,
        graph,
        state,
        node: toolNode,
        signal: controller.signal,
      });
    },
    /User cancelled|Aborted before tool execution/
  );
});

// -----------------------------------------------------------------------------
// Suite 9: Agent usage accounting & additive Jev receipts (P2)
// -----------------------------------------------------------------------------
test("Suite 9: rejects negative or non-integer agent tokens", async () => {
  const { root, graph, state } = createTestSite();
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);
  save(join(root, "onboarding/business.json"), sampleBusiness);

  await assert.rejects(
    async () => {
      await completeStage({
        root,
        kernel,
        graph,
        state,
        preparationId: prep.preparation!.id,
        agentUsage: { inputTokens: -10, measured: true },
      });
    },
    /Invalid agent input tokens/
  );

  await assert.rejects(
    async () => {
      await completeStage({
        root,
        kernel,
        graph,
        state,
        preparationId: prep.preparation!.id,
        agentUsage: { outputTokens: 12.34 as any, measured: true },
      });
    },
    /Invalid agent output tokens/
  );
});

test("Suite 9: marks hasUnmeteredStages when usage is omitted and preserves it across measured stages", async () => {
  const { root, graph, state } = createTestSite();
  save(join(root, "onboarding/business.json"), sampleBusiness);

  // 1. Complete business stage without usage
  const prep1 = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep1.preparation);
  const comp1 = await completeStage({
    root,
    kernel,
    graph,
    state,
    preparationId: prep1.preparation.id,
  });

  assert.equal(comp1.state.cumulativeSpend?.hasUnmeteredStages, true);

  // 2. Complete business-review stage with measured usage
  const prep2 = await prepareStage({ root, kernel, graph, state, nodeId: "business-review" });
  assert.ok(prep2.preparation);
  save(join(root, "agent/reviews/business-review.json"), {
    version: 2,
    subjectHash: prep2.preparation.reviewSubjectHash || "h",
    verdict: "pass",
    reviewer: "critic",
    evidence: ["onboarding/business.json"],
    checks: [
      { criterion: "grounding", verdict: "pass", evidence: "valid" },
      { criterion: "consistency", verdict: "pass", evidence: "valid" },
      { criterion: "completeness", verdict: "pass", evidence: "valid" },
    ],
    findings: [],
  });

  const comp2 = await completeStage({
    root,
    kernel,
    graph,
    state,
    preparationId: prep2.preparation.id,
    agentUsage: { inputTokens: 500, outputTokens: 100, measured: true },
  });

  assert.equal(comp2.state.cumulativeSpend?.agentTokensMeasured, true);
  assert.equal(comp2.state.cumulativeSpend?.hasUnmeteredStages, true, "Earlier unmetered work must preserve hasUnmeteredStages=true");
  assert.equal(comp2.state.cumulativeSpend?.inputTokens, 500);
});

test("Suite 9: aggregateJevReceiptSpend deduplicates receipts by receiptId across processes", () => {
  const root = temp();
  const jevDir = join(root, "agent/decisions/jev");
  mkdirSync(jevDir, { recursive: true });

  const r1: JevReceipt = {
    schemaVersion: 1,
    receiptId: "rcpt-001",
    model: "test-model",
    policyVersion: "2026-09-17",
    questionVersion: "2026-09-17",
    taskType: "routing",
    stateHash: "s1",
    status: "ok",
    cached: false,
    durationMs: 150,
    usage: { inputTokens: 100, outputTokens: 25 },
    retries: 0,
    answers: {},
    createdAt: new Date().toISOString(),
  };

  // Duplicate receipt with same receiptId
  const r1Duplicate: JevReceipt = { ...r1 };

  const r2: JevReceipt = {
    ...r1,
    receiptId: "rcpt-002",
    usage: { inputTokens: 200, outputTokens: 50 },
    durationMs: 100,
  };

  writeFileSync(join(jevDir, "file1.json"), JSON.stringify(r1), "utf8");
  writeFileSync(join(jevDir, "file1-dup.json"), JSON.stringify(r1Duplicate), "utf8");
  writeFileSync(join(jevDir, "file2.json"), JSON.stringify(r2), "utf8");

  const spend = aggregateJevReceiptSpend(root);
  assert.equal(spend.calls, 2, "Duplicate receiptId must not be counted twice");
  assert.equal(spend.inputTokens, 300);
  assert.equal(spend.outputTokens, 75);
  assert.equal(spend.durationMs, 250);
});

test("Suite 9: portable completion command printed in CURRENT.md", async () => {
  const { root, graph, state } = createTestSite();
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);

  const currentContent = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  assert.ok(
    currentContent.includes(`Complete this stage with: npm run go -- --complete --preparation ${prep.preparation.id}`),
    "Must print portable npm run go completion command"
  );
});

test("Suite 9: prepareStage populates capabilitiesSnapshot on StagePreparation", async () => {
  const { root, graph, state } = createTestSite();
  const jevConfig = {
    ...loadJevConfig(root),
    mode: "shadow" as const,
    capabilities: {
      grounding: "shadow" as const,
      sourceSelection: "off" as const,
      retrievalRanking: "off" as const,
      consistency: "shadow" as const,
      repairAssistance: "off" as const,
      preferenceScoring: "off" as const,
    },
  };

  const prep = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business",
    jevConfig,
  });
  assert.ok(prep.preparation);
  assert.ok(prep.preparation.capabilitiesSnapshot);
  assert.equal(prep.preparation.capabilitiesSnapshot.grounding, "shadow");
  assert.equal(prep.preparation.capabilitiesSnapshot.consistency, "shadow");
});

test("Suite 9: completeStage verifies registered task execution when grounding capability is assist", async () => {
  const { root, graph, state } = createTestSite();

  // Set up dependencies for business-review
  state.nodes.business = { status: "done", attempts: 1 };
  save(join(root, "onboarding/business.json"), sampleBusiness);

  const jevConfig = {
    ...loadJevConfig(root),
    mode: "assist" as const,
    capabilities: {
      grounding: "assist" as const,
      sourceSelection: "off" as const,
      retrievalRanking: "off" as const,
      consistency: "off" as const,
      repairAssistance: "off" as const,
      preferenceScoring: "off" as const,
    },
  };
  const prep = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig,
    jevFetch: async () => new Response(JSON.stringify({ error: "offline test transport" }), { status: 401 }),
  });
  assert.ok(prep.preparation);

  const reviewObj: Review = {
    version: 2,
    subjectHash: prep.preparation.reviewSubjectHash || "subj-123",
    verdict: "pass",
    reviewer: "critic",
    evidence: ["onboarding/business.json"],
    checks: [
      { criterion: "offer", verdict: "pass", evidence: "valid" },
      { criterion: "audience", verdict: "pass", evidence: "valid" },
      { criterion: "engagement", verdict: "pass", evidence: "valid" },
      { criterion: "evidence", verdict: "pass", evidence: "valid" },
      { criterion: "contradictions", verdict: "pass", evidence: "valid" },
    ],
    findings: [],
  };
  save(join(root, "agent/reviews/business-review.json"), reviewObj);

  // Remove ledger and receipts to simulate missing task artifacts in assist mode
  const ledgerPath = join(root, "onboarding/evidence-ledger.json");
  if (existsSync(ledgerPath)) unlinkSync(ledgerPath);
  const altLedgerPath = join(root, "agent/evidence-ledger.json");
  if (existsSync(altLedgerPath)) unlinkSync(altLedgerPath);
  const decisionsDir = join(root, "agent/decisions/jev");
  if (existsSync(decisionsDir)) {
    for (const f of readdirSync(decisionsDir)) {
      try { unlinkSync(join(decisionsDir, f)); } catch {}
    }
  }

  // An explicit unavailable record legitimately preserves critic fallback.
  // Remove it too: this case tests missing execution, independent of credentials.
  const taskPath = join(root, "agent/runs", `${prep.preparation.id}.business-review-grounding.task.json`);
  if (existsSync(taskPath)) unlinkSync(taskPath);

  // Complete stage without receipts or ledger present
  const result = await completeStage({
    root,
    kernel,
    graph,
    state,
    preparationId: prep.preparation.id,
    jevConfig,
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some(f => f.includes("Assist-mode task verification failed")),
    "Must fail when assist-mode task has no receipts or ledger"
  );
});

test("Round 6: Overflow content tampering with unchanged declared overflowHash fails completeStage", async () => {
  const { root, graph, state } = createTestSite();
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);
  const preparation = prep.preparation;
  save(join(root, "onboarding/business.json"), sampleBusiness);

  const genuineText = "Original untampered optional context that overflowed budget";
  const genuineHash = sha256Hex(genuineText);
  preparation.overflowHash = genuineHash;
  savePreparation(root, preparation);

  const overflowPath = join(root, "agent/runs", `${preparation.id}.overflow.json`);
  mkdirSync(join(root, "agent/runs"), { recursive: true });
  // Adversarial: overflowText is modified, but declared overflowHash is deceptively left as genuineHash
  writeFileSync(
    overflowPath,
    JSON.stringify({
      schemaVersion: 1,
      preparationId: preparation.id,
      nodeId: "business",
      overflowHash: genuineHash, // DECEPTIVE: unchanged declared hash
      overflowText: "MALICIOUSLY EDITED overflowText on disk",
    }),
    "utf8"
  );

  const tamperedRes = await completeStage({
    root,
    kernel,
    graph,
    state,
    preparationId: preparation.id,
  });
  assert.equal(tamperedRes.ok, false);
  assert.ok(
    tamperedRes.failures.some(f => f.includes(`Overflow integrity check failed: content hash mismatch for ${preparation.id}.overflow.json`)),
    "Must detect actual content modification even when declared overflowHash is unchanged"
  );
});

test("Round 6: Capability switches matrix controls execution and guarantees zero prompt bleed in shadow mode", async () => {
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
        usage: { input_tokens: 50, output_tokens: 10 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  const client = new JevClient({ root, apiKey: "test-key", fetch: mockFetch });

  // Baseline prompt with Jev off
  await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig: { ...loadJevConfig(root), mode: "off" },
    jevClient: client,
  });
  const baselinePrompt = readFileSync(join(root, "agent/CURRENT.md"), "utf8");

  const stripPrepId = (txt: string) =>
    txt.replace(/Preparation ID: [a-f0-9-]+\n/, "").replace(/Complete this stage with: npm run go -- --complete --preparation [a-f0-9-]+\n/, "");

  // 1. Global assist with grounding off: prompt must match baseline
  await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig: {
      ...loadJevConfig(root),
      mode: "assist",
      capabilities: { grounding: "off", sourceSelection: "off", retrievalRanking: "off", consistency: "off", repairAssistance: "off", preferenceScoring: "off" },
    },
    jevClient: client,
  });
  const promptGroundingOff = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  assert.equal(stripPrepId(promptGroundingOff), stripPrepId(baselinePrompt), "Global assist with grounding off must produce baseline prompt");

  // 2. Global assist with grounding shadow: prompt must match baseline exactly
  await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig: {
      ...loadJevConfig(root),
      mode: "assist",
      capabilities: { grounding: "shadow", sourceSelection: "off", retrievalRanking: "off", consistency: "off", repairAssistance: "off", preferenceScoring: "off" },
    },
    jevClient: client,
  });
  const promptGroundingShadow = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  assert.equal(stripPrepId(promptGroundingShadow), stripPrepId(baselinePrompt), "Shadow grounding must produce 100% identical prompt to baseline");

  // 3. Global shadow with grounding assist: clamped to shadow, prompt must match baseline exactly
  const prepClampedShadow = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig: {
      ...loadJevConfig(root),
      mode: "shadow",
      capabilities: { grounding: "assist", sourceSelection: "off", retrievalRanking: "off", consistency: "off", repairAssistance: "off", preferenceScoring: "off" },
    },
    jevClient: client,
  });
  const promptClampedShadow = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  assert.equal(stripPrepId(promptClampedShadow), stripPrepId(baselinePrompt), "Clamped shadow grounding must produce 100% identical prompt to baseline");
  assert.equal(prepClampedShadow.preparation?.capabilitiesSnapshot?.grounding, "shadow");

  // 4. Global assist with grounding assist: prompt contains Grounding Preflight Report
  const prepAssist = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig: {
      ...loadJevConfig(root),
      mode: "assist",
      capabilities: { grounding: "assist", sourceSelection: "off", retrievalRanking: "off", consistency: "off", repairAssistance: "off", preferenceScoring: "off" },
    },
    jevClient: client,
  });
  const promptAssist = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  assert.ok(promptAssist.includes("### Grounding Preflight Report"), "Assist mode must inject preflight summary");
  assert.equal(prepAssist.preparation?.capabilitiesSnapshot?.grounding, "assist");
});

test("Round 6: Complete business-review slice through prepareStage and completeStage with injected inference", async () => {
  const { root, graph, state } = createTestSite();
  state.nodes.business = { status: "done", attempts: 1 };

  mkdirSync(join(root, "onboarding/copy"), { recursive: true });
  writeFileSync(join(root, "onboarding/copy/services.md"), "We are master certified commercial roofers in PA with 25 years experience.", "utf8");
  writeFileSync(join(root, "onboarding/copy/hours.md"), "Emergency repair services are available Monday to Friday 9am to 5pm strictly. We are closed weekends and nights.", "utf8");
  writeFileSync(join(root, "onboarding/copy/rates.md"), "Historical restoration archives and municipal brick guidelines.", "utf8");

  const oversized33k = "X".repeat(33000);
  writeFileSync(join(root, "onboarding/copy/giant.md"), oversized33k, "utf8");

  const business = {
    offer: "Commercial Roofing",
    audience: "Building owners",
    engagement: "Call 215-555-0100",
    facts: [
      { id: "F1", claim: "Master certified commercial roofers", evidence: ["E1_A", "E1_B"] },
      { id: "F2", claim: "24/7 round-the-clock emergency service", evidence: ["E2"] },
      { id: "F3", claim: "Free estimates on all projects", evidence: ["E3"] },
      { id: "F4", claim: "Oversized disclosure terms", evidence: ["E4"] },
    ],
    evidence: [
      { id: "E1_A", source: "copy/services.md", excerpt: "We are master certified commercial roofers in PA" },
      { id: "E1_B", source: "copy/services.md", excerpt: "with 25 years experience." },
      { id: "E2", source: "copy/hours.md", excerpt: "Emergency repair services are available Monday to Friday 9am to 5pm strictly. We are closed weekends and nights." },
      { id: "E3", source: "copy/rates.md", excerpt: "Historical restoration archives and municipal brick guidelines." },
      { id: "E4", source: "copy/giant.md", excerpt: oversized33k },
    ],
    uncertainties: [],
  };
  save(join(root, "onboarding/business.json"), business);

  let transportCalls = 0;
  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    transportCalls++;
    const body = JSON.parse(init?.body as string);
    const answers: Record<string, any> = {};

    for (const [key, q] of Object.entries(body.questions || {})) {
      const qText = JSON.stringify(q);
      if (qText.includes("24/7") || qText.includes("emergency") || key === "rel_2") {
        // F2: contradicts
        answers[key] = {
          type: "choice",
          choice: "contradicts",
          confidence: 0.92,
          probabilities: { supports: 0.02, contradicts: 0.92, says_nothing: 0.06 },
        };
      } else if (qText.includes("estimates") || key === "rel_3") {
        // F3: says_nothing
        answers[key] = {
          type: "choice",
          choice: "says_nothing",
          confidence: 0.94,
          probabilities: { supports: 0.03, contradicts: 0.03, says_nothing: 0.94 },
        };
      } else {
        // F1 (both citations) and others: supports
        answers[key] = {
          type: "choice",
          choice: "supports",
          confidence: 0.95,
          probabilities: { supports: 0.95, contradicts: 0.03, says_nothing: 0.02 },
        };
      }
    }

    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers,
        usage: { input_tokens: 200, output_tokens: 40 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const client = new JevClient({ root, apiKey: "test-key", fetch: mockFetch });
  const jevConfig = {
    ...loadJevConfig(root),
    mode: "assist" as const,
    confidenceThresholds: { grounding: 0.85, routing: 0.80 },
    capabilities: {
      grounding: "assist" as const,
      sourceSelection: "assist" as const,
      retrievalRanking: "off" as const,
      consistency: "off" as const,
      repairAssistance: "off" as const,
      preferenceScoring: "off" as const,
    },
  };

  // Step 1: Prepare stage with assist mode and sourceSelection
  const prep = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig,
    jevClient: client,
  });

  assert.ok(prep.preparation);
  assert.equal(transportCalls, 1, "Bounded batching should evaluate in 1 transport call");
  const prompt = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  assert.ok(prompt.includes("### Grounding Preflight Report"));
  assert.ok(prompt.includes("contradicted"), "Must flag contradicted claim F2 in critic report");
  assert.ok(prompt.includes("exceeds 32KB"), "Must flag oversized item E4 without failing stage");

  // Verify evidence ledger contains judgments and contradiction entry
  const ledger = loadEvidenceLedger(root);
  assert.ok(ledger.judgments["j_F1_E1_A_relation"], "F1 E1_A judgment must be recorded");
  assert.ok(ledger.judgments["j_F1_E1_B_relation"], "F1 E1_B judgment must also be recorded because source selection no longer discards citations");
  assert.ok(ledger.judgments["j_F2_E2_relation"], "F2 judgment must be recorded");
  assert.equal(ledger.judgments["j_F2_E2_relation"]!.verdict, "contradicted");
  assert.ok(ledger.contradictions.some(c => c.claimId === "F2"), "ledger.contradictions must record F2 conflict");

  // Step 2: Critic writes review referencing the preflight findings and passes stage
  const reviewObj: Review = {
    version: 2,
    subjectHash: prep.preparation.reviewSubjectHash || "subj-123",
    verdict: "pass",
    reviewer: "critic",
    evidence: ["onboarding/business.json"],
    checks: [
      { criterion: "offer", verdict: "pass", evidence: "valid" },
      { criterion: "audience", verdict: "pass", evidence: "valid" },
      { criterion: "engagement", verdict: "pass", evidence: "valid" },
      { criterion: "evidence", verdict: "pass", evidence: "valid" },
      { criterion: "contradictions", verdict: "pass", evidence: "valid" },
    ],
    findings: [
      {
        id: "find_f2",
        page: "index",
        section: "hero",
        evidence: "onboarding/business.json",
        problem: "F2 contradicted by hours: emergency service is weekday only",
        repair: "Correct claim in copy",
        target: "onboarding/business.json",
        verify: "Check hours",
        severity: "minor",
      },
    ],
  };
  save(join(root, "agent/reviews/business-review.json"), reviewObj);

  const completeRes = await completeStage({
    root,
    kernel,
    graph,
    state,
    preparationId: prep.preparation.id,
    jevConfig,
  });
  assert.equal(completeRes.ok, true, `Stage must complete successfully: ${completeRes.failures.join(", ")}`);

  // Step 3: Cached resume executes zero Jev API calls across repeated preparation
  const preCalls = transportCalls;
  // Re-run preparation for business-review
  const prep2 = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig,
    jevClient: client,
  });
  assert.equal(transportCalls, preCalls, "Cached resume must make zero Jev API transport calls");
  assert.ok(prep2.preparation);

  // Step 4: Policy-only change re-evaluates without model call
  const stricterConfig = {
    ...jevConfig,
    confidenceThresholds: { grounding: 0.96, routing: 0.80 },
  };
  const prepStricter = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig: stricterConfig,
    jevClient: client,
  });
  assert.equal(transportCalls, preCalls, "Policy-only threshold change must not invoke transport");
  const stricterPrompt = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  assert.ok(stricterPrompt.includes("insufficient_evidence"), "Under stricter policy (0.96), 0.95 confidence maps to insufficient_evidence");
});

test("Round 6: prepareStage and completeStage gracefully handle unavailable Jev inference preserving critic fallback", async () => {
  const { root, graph, state } = createTestSite();

  // Complete business stage
  save(join(root, "onboarding/business.json"), sampleBusiness);
  state.nodes.business = { status: "done", attempts: 1 };
  state.nodes["business-review"] = { status: "pending", attempts: 0 };

  const jevConfig: JevConfig = {
    ...DEFAULT_JEV_CONFIG,
    mode: "assist",
    capabilities: {
      ...DEFAULT_JEV_CAPABILITIES,
      grounding: "assist",
    },
  };

  // Failing mock client that throws 503 error on evaluate
  const failClient = new JevClient({
    root,
    apiKey: "test-key",
    fetch: async () => {
      throw new Error("503 Gateway Timeout during inference");
    },
  });

  // 1. prepareStage executes preflight, catches the error, and records unavailable task execution
  const prep = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig,
    jevClient: failClient,
  });

  assert.ok(prep.preparation, "Stage must be prepared despite inference failure");
  const taskRec = loadTaskExecution(root, prep.preparation.id, "business-review-grounding");
  assert.ok(taskRec, "Unavailable task execution record must be written");
  assert.equal(taskRec.status, "unavailable");
  assert.ok(taskRec.failureReason?.includes("503 Gateway Timeout"));

  // 2. Critic writes valid review
  const reviewObj: Review = {
    version: 2,
    subjectHash: prep.preparation.reviewSubjectHash || "subj-123",
    verdict: "pass",
    reviewer: "critic",
    evidence: ["onboarding/business.json"],
    checks: [
      { criterion: "offer", verdict: "pass", evidence: "valid" },
      { criterion: "audience", verdict: "pass", evidence: "valid" },
      { criterion: "engagement", verdict: "pass", evidence: "valid" },
      { criterion: "evidence", verdict: "pass", evidence: "valid" },
      { criterion: "contradictions", verdict: "pass", evidence: "valid" },
    ],
    findings: [],
  };
  save(join(root, "agent/reviews/business-review.json"), reviewObj);

  // 3. completeStage verifies task execution; unavailable status passes verification without hard-blocking
  const compResult = await completeStage({
    root,
    kernel,
    graph,
    state,
    preparationId: prep.preparation.id,
    jevConfig,
  });

  assert.equal(compResult.ok, true, `Stage must complete cleanly with critic fallback: ${compResult.failures.join(", ")}`);
});

test("Round 6: Retrieval ranking shadow mode produces byte-for-byte identical prompt to off mode", async () => {
  const { root, graph, state } = createTestSite();

  const richBusiness: Business = {
    ...sampleBusiness,
    evidence: [
      { id: "e1", source: "copy/about.md", excerpt: "We provide emergency roof leak repairs 24 hours a day." },
      { id: "e2", source: "copy/pricing.md", excerpt: "Commercial estimates require a deposit." },
      { id: "e3", source: "copy/faq.md", excerpt: "We specialize in residential tile roof maintenance." },
    ],
  };
  save(join(root, "onboarding/business.json"), richBusiness);
  state.nodes.business = { status: "done", attempts: 1 };
  state.nodes["business-review"] = { status: "pending", attempts: 0 };

  const offConfig: JevConfig = {
    ...DEFAULT_JEV_CONFIG,
    mode: "off",
    compactPackets: true,
    capabilities: {
      ...DEFAULT_JEV_CAPABILITIES,
      retrievalRanking: "off",
      grounding: "off",
    },
  };

  const shadowConfig: JevConfig = {
    ...DEFAULT_JEV_CONFIG,
    mode: "shadow",
    compactPackets: true,
    capabilities: {
      ...DEFAULT_JEV_CAPABILITIES,
      retrievalRanking: "shadow",
      grounding: "off",
    },
  };

  // 1. Prepare in off mode
  const prepOff = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig: offConfig,
  });
  assert.ok(prepOff.preparation);
  const promptOff = readFileSync(join(root, "agent/CURRENT.md"), "utf8");

  // Cancel off preparation to reset stage lease
  cancelStage({ root, preparationId: prepOff.preparation.id });

  // 2. Prepare in shadow mode
  const prepShadow = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig: shadowConfig,
  });
  assert.ok(prepShadow.preparation);
  const promptShadow = readFileSync(join(root, "agent/CURRENT.md"), "utf8");

  const normalizePrompt = (p: string) =>
    p.replace(/Preparation ID: [^\n]+/g, "Preparation ID: <normalized>")
     .replace(/--preparation [^\n]+/g, "--preparation <normalized>");

  // Prompts MUST be 100% byte-for-byte identical between off and shadow mode (excluding the unique random preparationId)
  assert.equal(normalizePrompt(promptShadow), normalizePrompt(promptOff), "Shadow mode retrieval ranking must produce 100% identical prompt body to off mode");

  // Also verify buildCompactContextPacket directly
  const node = graph.nodes.find(n => n.id === "business-review")!;
  const offPacket = buildCompactContextPacket({ root, kernel, graph, state, node, jevConfig: offConfig });
  const shadowPacket = buildCompactContextPacket({ root, kernel, graph, state, node, jevConfig: shadowConfig });
  assert.equal(shadowPacket.packetText, offPacket.packetText, "Shadow mode packetText must be 100% byte-for-byte identical to off mode");

  // Contrast with assist mode where retrieval ranking is active
  const assistConfig: JevConfig = {
    ...DEFAULT_JEV_CONFIG,
    mode: "assist",
    compactPackets: true,
    capabilities: {
      ...DEFAULT_JEV_CAPABILITIES,
      retrievalRanking: "assist",
      grounding: "off",
    },
  };
  const assistPacket = buildCompactContextPacket({ root, kernel, graph, state, node, jevConfig: assistConfig });
  assert.ok(assistPacket.packetText.includes("Active Evidence & Data:"), "Assist mode packet must contain active evidence");
});

test("Lifecycle: conflicting source evidence is preserved and surfaced in critic context through prepareStage", async () => {
  const { root, graph, state } = createTestSite();

  // Mark business stage as done so business-review dependencies are satisfied
  state.nodes.business = { status: "done", attempts: 1 };
  state.nodes["business-review"] = { status: "pending", attempts: 0 };

  // Write source files with exact excerpts
  writeFileSync(join(root, "onboarding/copy/home.md"), "Open 24 hours daily without exception.", "utf8");
  writeFileSync(join(root, "onboarding/copy/hours.md"), "Closed on Sundays and holidays.", "utf8");

  // Create business.json with fact citing two conflicting evidence items
  const businessWithConflicts: Business = {
    version: 2,
    offer: "Roof repairs",
    audience: "Local homeowners",
    trigger: "A leak",
    outcome: "A repaired roof",
    includes: ["Inspection"],
    engagement: "Request an estimate",
    positioning: "Local repairs",
    facts: [
      {
        id: "F_HOURS",
        claim: "Open 24 hours daily",
        evidence: ["E1", "E2"],
      },
    ],
    evidence: [
      { id: "E1", source: "onboarding/copy/home.md", excerpt: "Open 24 hours daily without exception." },
      { id: "E2", source: "onboarding/copy/hours.md", excerpt: "Closed on Sundays and holidays." },
    ],
    uncertainties: [],
  };
  save(join(root, "onboarding/business.json"), businessWithConflicts);

  // In assist mode with sourceSelection assist:
  const assistConfig: JevConfig = {
    ...DEFAULT_JEV_CONFIG,
    mode: "assist",
    capabilities: {
      ...DEFAULT_JEV_CAPABILITIES,
      grounding: "assist",
      sourceSelection: "assist",
    },
  };

  // Mock JevClient that evaluates E1 as supports and E2 as contradicts
  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string);
    const answers: Record<string, any> = {};
    for (const [qKey, q] of Object.entries(body.questions || {})) {
      const isE1 = qKey === "rel_0" || (qKey !== "rel_1" && !qKey.includes("E2"));
      answers[qKey] = {
        type: "choice",
        choice: isE1 ? "supports" : "contradicts",
        confidence: 0.95,
        probabilities: isE1 ? { supports: 0.95, contradicts: 0.05, says_nothing: 0.0 } : { supports: 0.05, contradicts: 0.95, says_nothing: 0.0 },
      };
    }
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers,
        usage: { input_tokens: 40, output_tokens: 20 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const mockClient = new JevClient({ root, apiKey: "test-key", fetch: mockFetch });

  // Prepare stage with the client
  const prep = await prepareStage({
    root,
    kernel,
    graph,
    state,
    nodeId: "business-review",
    jevConfig: assistConfig,
    jevClient: mockClient,
  });

  assert.ok(prep.preparation);

  // Evidence Ledger should have recorded contradiction for F_HOURS
  const ledger = loadEvidenceLedger(root);
  assert.equal(ledger.contradictions.length, 1);
  assert.equal(ledger.contradictions[0]?.claimId, "F_HOURS");
  assert.equal(ledger.contradictions[0]?.evidenceId, "E2");

  // And the generated prompt CURRENT.md must contain the contradiction notice
  const prompt = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  assert.ok(prompt.includes("Contradictions Detected") || prompt.includes("F_HOURS") || prompt.includes("E2"), "Prompt must include contradiction information");
});
