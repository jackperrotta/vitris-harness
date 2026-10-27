import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JevClient } from "./agent/jev/client.ts";
import { DEFAULT_JEV_CONFIG, enabledJevCallers, loadJevConfig } from "./agent/jev/config.ts";
import { ASSIST_QUALITY_PROFILE, kernelRevision, validateMatchedAbConfigs } from "./agent/jev/pilot-recipe.ts";
import { finalizeArm, prepareArm } from "./agent/jev/pilot-ops.ts";
import {
  COMPACT_GRAPH,
  compactPilotExecutor,
  passingFetch,
  seedCompactPilotSite,
  writeCompactArtifacts,
  writeInjectedAbManifest,
} from "./agent/jev/pilot-fixture.ts";
import { runWorkflow } from "./agent/workflow.ts";
import { completeStage, prepareStage } from "./agent/lifecycle.ts";
import { initialState, isPreviewReady, parseGraphYaml } from "./agent/graph.ts";
import { save } from "./agent/artifacts.ts";
import { REVIEW_CRITERIA, reviewSubject } from "./agent/evaluate.ts";
import {
  criticDispositionMatches,
  dispositionAllowedForFinding,
  verifyQualityTaskReceipts,
} from "./agent/jev/content-checks.ts";
import {
  importGeminiHostUsage,
  importHostUsage,
  recordAgentStageAttempt,
  loadAgentAttemptReceipts,
  expectedAttemptsFromWorkflow,
  reconcileExpectedAttempts,
  aggregateAgentUsage,
  compareAgentUsageArms,
  selectAuthoritativeRunReceipt,
} from "./agent/jev/agent-usage.ts";
import { loadArmUsageMetrics } from "./agent/jev/evaluation.ts";
import { loadTaskExecution } from "./agent/jev/service-registry.ts";

const kernel = join(dirname(fileURLToPath(import.meta.url)), "..");
const temp = () => mkdtempSync(join(tmpdir(), "vitris-sept20-"));

function restoreThroughBrowser(state: ReturnType<typeof initialState>): void {
  for (const n of COMPACT_GRAPH.nodes) {
    if (n.id === "content-review" || n.id === "preview") {
      state.nodes[n.id] = { status: "pending", attempts: state.nodes[n.id]?.attempts || 0 };
    } else {
      state.nodes[n.id] = { status: "done", attempts: Math.max(1, state.nodes[n.id]?.attempts || 1) };
    }
  }
}

function writePassingReview(root: string, node: string): void {
  const criteria = REVIEW_CRITERIA[node] || (node === "copy-review"
    ? ["accuracy", "clarity", "specificity", "continuity", "cta-behavior"]
    : ["accuracy", "clarity", "specificity", "continuity", "cta-behavior", "coverage"]);
  save(join(root, "agent/reviews", `${node}.json`), {
    version: 2,
    subjectHash: reviewSubject(root, node),
    verdict: "pass",
    reviewer: "test",
    evidence: ["onboarding/business.json"],
    checks: criteria.map(criterion => ({ criterion, verdict: "pass", evidence: "ok" })),
    findings: [],
  });
}

test("prepare-arm refuses overwrite, mismatch, and inherited progress; Arm B requires exact profile", async () => {
  const trial = "trial-sept20";
  const a = temp();
  const b = temp();
  mkdirSync(join(a, "agent"));
  mkdirSync(join(b, "agent"));
  writeFileSync(join(a, "launch.json"), "{}", "utf8");
  writeFileSync(join(b, "launch.json"), "{}", "utf8");
  writeFileSync(join(a, "agent/jev.json"), JSON.stringify({ mode: "assist" }), "utf8");
  const blocked = prepareArm({ trialId: trial, arm: "A", root: a, kernel });
  assert.equal(blocked.ok, false);
  rmSync(join(a, "agent/jev.json"));
  const okA = prepareArm({ trialId: trial, arm: "A", root: a, kernel, peerRoot: b });
  assert.equal(okA.ok, true, okA.ok ? "" : okA.reason);
  const okB = prepareArm({ trialId: trial, arm: "B", root: b, kernel, peerRoot: a });
  assert.equal(okB.ok, true, okB.ok ? "" : okB.reason);
  assert.equal(okA.ok && okB.ok && okA.marker.initialSnapshotHash === okB.marker.initialSnapshotHash, true);
  writeFileSync(join(b, "agent/jev.json"), JSON.stringify({
    mode: "assist", model: ASSIST_QUALITY_PROFILE.model, compactPackets: false, workOwnership: "agent",
    capabilities: { ...ASSIST_QUALITY_PROFILE.capabilities, grounding: "off" },
  }, null, 2), "utf8");
  const mismatch = validateMatchedAbConfigs(loadJevConfig(a), loadJevConfig(b));
  assert.equal(mismatch.ok, false);
});

test("finalize-arm rejects caller-supplied executed and zero-call Arm B", () => {
  const trial = "trial-finalize";
  const root = temp();
  mkdirSync(join(root, "agent"));
  writeFileSync(join(root, "launch.json"), "{}", "utf8");
  const prepared = prepareArm({ trialId: trial, arm: "B", root, kernel });
  assert.equal(prepared.ok, true);
  writeFileSync(join(root, "agent/graph.yaml"), JSON.stringify({
    version: 2, stop_at: "preview_ready",
    nodes: [{ id: "preview", needs: [], writes: [], refs: [], tools: [], eval: "preview", maxAttempts: 1, kind: "agent" }],
  }, null, 2), "utf8");
  writeFileSync(join(root, "agent/STATE.json"), JSON.stringify({
    version: 2, status: "complete", current: "preview", preview_ready: true, launched: false, iteration: 1,
    nodes: { preview: { status: "done", attempts: 1 } },
  }, null, 2), "utf8");
  const supplied = finalizeArm({ trialId: trial, arm: "B", root, kernel, executed: true, previewReady: true });
  assert.equal(supplied.ok, false);
  const zero = finalizeArm({ trialId: trial, arm: "B", root, kernel });
  assert.equal(zero.ok, false);
  assert.match(zero.ok ? "" : zero.reason, /verified|preview_ready/i);
});

test("Injected runWorkflow A/B reaches preview_ready with separate Jev call counts", async () => {
  async function runArm(arm: "A" | "B") {
    const root = temp();
    seedCompactPilotSite(root, arm);
    const cfg = loadJevConfig(root);
    const client = arm === "B"
      ? new JevClient({ root, apiKey: "k", fetch: passingFetch, config: cfg })
      : undefined;
    const result = await runWorkflow({
      root,
      kernel,
      argv: ["--max", "20", "--no-preview-server"],
      max: 20,
      skipLock: true,
      noPreviewServer: true,
      testStageExecutor: compactPilotExecutor,
      jevClient: client,
      jevFetch: passingFetch,
    });
    return { root, result, cfg };
  }
  const a = await runArm("A");
  const b = await runArm("B");
  assert.equal(a.result.state.preview_ready, true, `Arm A failed: ${JSON.stringify(a.result.state.nodes)}`);
  assert.equal(b.result.state.preview_ready, true, `Arm B failed: ${JSON.stringify(b.result.state.nodes)}`);
  assert.equal(isPreviewReady(parseGraphYaml(readFileSync(join(a.root, "agent/graph.yaml"), "utf8")), a.result.state), true);
  const count = (root: string) => existsSync(join(root, "agent/decisions/jev"))
    ? readdirSync(join(root, "agent/decisions/jev")).filter(f => f.endsWith(".json")).length
    : 0;
  const aCalls = count(a.root);
  const bCalls = count(b.root);
  assert.equal(aCalls, 0, "Arm A must make zero Jev calls");
  assert.ok(bCalls > 0, "Arm B must make Jev calls");
  assert.equal(enabledJevCallers(a.cfg).length, 0);
  const out = join(temp(), "jev-ab-injected-offline.json");
  writeInjectedAbManifest({
    outPath: out,
    armA: { root: a.root, calls: aCalls, previewReady: true },
    armB: { root: b.root, calls: bCalls, previewReady: true },
    kernelRevision: kernelRevision(kernel),
  });
  const manifest = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(manifest.injectedOffline, true);
  assert.equal(manifest.liveTypeSafe, false);
  writeFileSync(join(temp(), "jev-ab-usage-coverage.json"), JSON.stringify({
    schemaVersion: 1,
    injectedOffline: true,
    liveTypeSafe: false,
    usageCoverage: "incomplete",
    verdict: "measurement_incomplete",
    reason: "Injected local executor has no host usage export. Cursor active-agent hosts often cannot export trustworthy per-attempt usage. Do not substitute Cursor API metering, manual guesses, or Gemini numbers. This file is not a live token-savings result.",
    A: { jevCalls: aCalls, previewReady: true },
    B: { jevCalls: bCalls, previewReady: true },
    note: "Removing any expected agent or critic receipt must keep coverage incomplete, not a smaller total.",
  }, null, 2), "utf8");
});

test("completeStage rejects extra claim, dropped qualifier, and misleading CTA until repaired", async () => {
  const root = temp();
  seedCompactPilotSite(root, "B");
  await writeCompactArtifacts(root);
  const graph = parseGraphYaml(readFileSync(join(root, "agent/graph.yaml"), "utf8"));
  const state = initialState(graph);
  restoreThroughBrowser(state);
  save(join(root, "agent/STATE.json"), state);
  const html = readFileSync(join(root, "pages/index.html"), "utf8");
  const extra = html.replace("</section>\n<footer>", `<p>We are the #1 crew in the universe.</p></section>\n<footer>`);
  writeFileSync(join(root, "pages/index.html"), extra, "utf8");
  writeFileSync(join(root, "dist/index.html"), extra, "utf8");
  const client = new JevClient({ root, apiKey: "k", fetch: passingFetch, config: loadJevConfig(root) });
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "content-review", jevClient: client });
  assert.equal(prep.status, "prepared");
  writePassingReview(root, "content-review");
  const failed = await completeStage({ root, kernel, graph, state, preparationId: prep.preparation!.id, nodeId: "content-review" });
  assert.equal(failed.ok, false);
  assert.ok(failed.failures.some(f => /added_rendered_claim|Unresolved Jev finding|qualifier|cta/i.test(f)), failed.failures.join("\n"));

  const dropped = html.replace("We repair roofs for homeowners in the county.", "We repair every roof in the county.");
  writeFileSync(join(root, "pages/index.html"), dropped, "utf8");
  writeFileSync(join(root, "dist/index.html"), dropped, "utf8");
  restoreThroughBrowser(state);
  save(join(root, "agent/STATE.json"), state);
  const prep2 = await prepareStage({ root, kernel, graph, state, nodeId: "content-review", jevClient: client });
  writePassingReview(root, "content-review");
  const failed2 = await completeStage({ root, kernel, graph, state, preparationId: prep2.preparation!.id });
  assert.equal(failed2.ok, false);

  const cta = html.replace('href="tel:2155550100"', 'href="#"');
  writeFileSync(join(root, "pages/index.html"), cta, "utf8");
  writeFileSync(join(root, "dist/index.html"), cta, "utf8");
  restoreThroughBrowser(state);
  save(join(root, "agent/STATE.json"), state);
  const prep3 = await prepareStage({ root, kernel, graph, state, nodeId: "content-review", jevClient: client });
  writePassingReview(root, "content-review");
  const failed3 = await completeStage({ root, kernel, graph, state, preparationId: prep3.preparation!.id });
  assert.equal(failed3.ok, false);

  writeFileSync(join(root, "pages/index.html"), html, "utf8");
  writeFileSync(join(root, "dist/index.html"), html, "utf8");
  restoreThroughBrowser(state);
  save(join(root, "agent/STATE.json"), state);
  const prep4 = await prepareStage({ root, kernel, graph, state, nodeId: "content-review", jevClient: client });
  writePassingReview(root, "content-review");
  const ok = await completeStage({ root, kernel, graph, state, preparationId: prep4.preparation!.id });
  assert.equal(ok.ok, true, ok.failures?.join("\n"));
});

test("Tampered or partial Jev proofs cannot pass quality verification", async () => {
  const root = temp();
  seedCompactPilotSite(root, "B");
  await writeCompactArtifacts(root);
  const client = new JevClient({ root, apiKey: "k", fetch: passingFetch, config: loadJevConfig(root) });
  await (await import("./agent/jev/content-checks.ts")).runQualityChecks({
    root, client, nodeId: "copy-review", preparationId: "tamper-1",
    inputHash: "hash",
    capabilities: loadJevConfig(root).capabilities,
  });
  const exec = loadTaskExecution(root, "tamper-1", "claim-strengthening-check");
  assert.ok(exec?.receiptIds?.length, "claim check must write a receipt");
  const check = () => verifyQualityTaskReceipts({
    root, preparationId: "tamper-1", nodeId: "copy-review", taskId: "claim-strengthening-check",
    expectedModel: "jev-1.13.0",
  });
  const baseline = check();
  assert.equal(baseline.ok, true, baseline.reason);
  const file = join(root, "agent/decisions/jev", exec!.receiptIds![0]!);
  const original = readFileSync(file, "utf8");
  const mutate = (edit: (receipt: Record<string, any>) => void, label: string) => {
    const receipt = JSON.parse(original);
    edit(receipt);
    writeFileSync(file, JSON.stringify(receipt), "utf8");
    const result = check();
    assert.equal(result.ok, false, label);
    writeFileSync(file, original, "utf8");
  };
  rmSync(file);
  assert.equal(check().ok, false, "missing receipt file");
  writeFileSync(file, original, "utf8");
  mutate(r => { r.stateHash = "0".repeat(64); }, "wrong state hash");
  mutate(r => { r.model = "jev-other"; }, "wrong model");
  mutate(r => {
    const key = Object.keys(r.answers || {})[0];
    if (!key) throw new Error("receipt has no answers");
    r.answers.wrong_question = r.answers[key];
    delete r.answers[key];
  }, "wrong question");
  mutate(r => {
    const key = Object.keys(r.answers || {})[0];
    if (!key) throw new Error("receipt has no answers");
    delete r.answers[key];
  }, "partial batch");
  const qualityPath = join(root, "agent/runs/tamper-1.quality.json");
  const quality = JSON.parse(readFileSync(qualityPath, "utf8"));
  quality.obligations = [...(quality.obligations || []), {
    questionId: "stale_q", obligationId: "stale_q", taskId: "claim-strengthening-check",
    cacheKey: "old", status: "cached", decision: "pass", subjectHash: "changed-evidence",
    priorPreparationId: "does-not-exist",
  }];
  writeFileSync(qualityPath, JSON.stringify(quality), "utf8");
  const stale = check();
  assert.equal(stale.ok, false, stale.reason);
  assert.match(stale.reason || "", /cached|original|stale/i);
  assert.equal(criticDispositionMatches({
    findingId: "x", subjectHash: "", disposition: "accepted_risk", rationale: "ok", evidence: "accepted_risk",
  }, "x", "abc"), false);
  const major = {
    id: "x", taskId: "claim-strengthening-check", subjectId: "x", location: "/",
    kind: "unsupported", severity: "error" as const, policyDecision: "escalate" as const,
    policyVersion: "p", verification: "bind evidence", author: "copy", status: "open" as const, subjectHash: "abc",
  };
  assert.match(dispositionAllowedForFinding({
    findingId: "x", subjectHash: "abc", disposition: "accepted_risk", rationale: "we accept it", evidence: "accepted_risk",
  }, major) || "", /accepted_risk/);
  assert.match(dispositionAllowedForFinding({
    findingId: "x", subjectHash: "abc", disposition: "fixed", rationale: "rewrote it", evidence: "fixed",
  }, major) || "", /changed artifact|no longer treat/);
});

test("Usage coverage is incomplete when a retry or critic receipt is missing", () => {
  const root = temp();
  mkdirSync(join(root, "agent/preparations"), { recursive: true });
  writeFileSync(join(root, "agent/graph.yaml"), JSON.stringify({
    version: 2, stop_at: "preview_ready",
    nodes: [
      { id: "copy", needs: [], writes: [], refs: [], tools: [], eval: "copy", maxAttempts: 4, kind: "agent" },
      { id: "copy-review", needs: ["copy"], writes: [], refs: [], tools: [], eval: "copy-review", maxAttempts: 4, kind: "critic" },
    ],
  }, null, 2), "utf8");
  mkdirSync(join(root, "agent/preparations"), { recursive: true });
  writeFileSync(join(root, "agent/preparations/p1.json"), JSON.stringify({ id: "p1", nodeId: "copy", attempt: 1, status: "consumed" }), "utf8");
  writeFileSync(join(root, "agent/preparations/p1b.json"), JSON.stringify({ id: "p1b", nodeId: "copy", attempt: 2, status: "consumed" }), "utf8");
  writeFileSync(join(root, "agent/preparations/p2.json"), JSON.stringify({ id: "p2", nodeId: "copy-review", attempt: 1, status: "consumed" }), "utf8");
  recordAgentStageAttempt({
    root, nodeId: "copy", preparationId: "p1", attemptId: "p1:1", kind: "agent",
    inputTokens: 10, outputTokens: 2, source: "host_export",
  });
  recordAgentStageAttempt({
    root, nodeId: "copy-review", preparationId: "p2", attemptId: "p2:1", kind: "critic",
    inputTokens: 4, outputTokens: 1, source: "host_export",
  });
  const expected = expectedAttemptsFromWorkflow(root);
  assert.equal(expected.length, 3);
  const recon = reconcileExpectedAttempts(loadAgentAttemptReceipts(root), expected);
  assert.equal(recon.coverage, "incomplete");
  recordAgentStageAttempt({
    root, nodeId: "copy", preparationId: "p1b", attemptId: "p1b:2", kind: "agent",
    inputTokens: 8, outputTokens: 1, source: "host_export",
  });
  assert.equal(reconcileExpectedAttempts(loadAgentAttemptReceipts(root), expected).coverage, "complete");
  writeFileSync(join(root, "agent/preparations/abandoned.json"), JSON.stringify({ id: "abandoned", nodeId: "copy", attempt: 0, status: "prepared" }), "utf8");
  const withAbandoned = expectedAttemptsFromWorkflow(root);
  assert.ok(withAbandoned.some(a => a.preparationId === "abandoned"));
  assert.equal(reconcileExpectedAttempts(loadAgentAttemptReceipts(root), withAbandoned).coverage, "incomplete");
  const mixed = temp();
  recordAgentStageAttempt({
    root: mixed, nodeId: "copy", preparationId: "p", attemptId: "p:1", kind: "agent",
    inputTokens: 10, outputTokens: 2, source: "manual_host_report",
  });
  assert.notEqual(importGeminiHostUsage({
    root: mixed, raw: { model: "gemini", usage: { input_tokens: 1, output_tokens: 1 } }, runId: "r",
  }).source, "host_export");
  const runOnly = temp();
  const runBody = JSON.stringify({ provider: "cursor", inputTokens: 100, outputTokens: 20 });
  writeFileSync(join(runOnly, "export.json"), runBody, "utf8");
  importHostUsage({
    root: runOnly,
    evidenceRoot: runOnly,
    raw: {
      schemaVersion: 1, provider: "cursor", model: "composer", sessionId: "s",
      rawExportPath: "export.json",
      rawExportHash: createHash("sha256").update(runBody).digest("hex"),
      sourceFormat: "cursor_session", sourceFormatVersion: "1", scope: "run",
      inputTokens: 100, outputTokens: 20, runId: "run-1", arm: "A",
    },
  });
  const runMetrics = loadArmUsageMetrics(runOnly, [{ nodeId: "copy", kind: "agent" }, { nodeId: "copy-review", kind: "critic" }]);
  assert.equal(runMetrics.coverage, "complete");
  assert.equal(runMetrics.inputTokens, 100);
  assert.equal(runMetrics.outputTokens, 20);
  assert.equal(runMetrics.runLevel, true);
  const dup = temp();
  const dupBody = JSON.stringify({ n: 1 });
  writeFileSync(join(dup, "export.json"), dupBody, "utf8");
  const contract = {
    schemaVersion: 1 as const, provider: "cursor", model: "composer", sessionId: "s",
    rawExportPath: "export.json",
    rawExportHash: createHash("sha256").update(dupBody).digest("hex"),
    sourceFormat: "cursor_session", sourceFormatVersion: "1", scope: "attempt" as const,
    inputTokens: 5, outputTokens: 1, nodeId: "copy", preparationId: "p", attemptId: "p:1",
    runId: "dup-run", arm: "A" as const,
  };
  importHostUsage({ root: dup, evidenceRoot: dup, raw: contract });
  assert.throws(() => importHostUsage({ root: dup, evidenceRoot: dup, raw: { ...contract, inputTokens: 9 } }));
  const aAgg = aggregateAgentUsage(loadAgentAttemptReceipts(root));
  const bAgg = aggregateAgentUsage(loadAgentAttemptReceipts(mixed));
  assert.equal(compareAgentUsageArms(aAgg, bAgg).verdict, "measurement_incomplete");
});

test("Adversarial measurement, evidence, finalization, and component cache fail closed", async () => {
  const measured = temp();
  mkdirSync(join(measured, "agent"), { recursive: true });
  recordAgentStageAttempt({
    root: measured, nodeId: "copy", preparationId: "unknown-prep", attemptId: "unknown-prep:1",
    kind: "agent", source: "unavailable",
  });
  recordAgentStageAttempt({
    root: measured, nodeId: "copy", preparationId: "p", attemptId: "p:1", kind: "agent",
    inputTokens: 999, outputTokens: 50, source: "host_export",
  });
  const body = JSON.stringify({ provider: "cursor", inputTokens: 80, outputTokens: 10 });
  writeFileSync(join(measured, "usage.json"), body, "utf8");
  const hash = createHash("sha256").update(body).digest("hex");
  const scope = { runId: "trial", arm: "B" as const, provider: "cursor", model: "composer", sessionId: "sess" };
  importHostUsage({
    root: measured, evidenceRoot: measured,
    raw: {
      schemaVersion: 1, ...scope, rawExportPath: "usage.json", rawExportHash: hash,
      sourceFormat: "cursor_session", sourceFormatVersion: "1", scope: "run",
      inputTokens: 80, outputTokens: 10,
    },
  });
  const totals = loadArmUsageMetrics(measured, [{ nodeId: "copy", kind: "agent" }, { nodeId: "pages", kind: "agent" }], scope);
  assert.equal(totals.coverage, "complete");
  assert.equal(totals.inputTokens, 80);
  assert.equal(totals.outputTokens, 10);
  const summed = aggregateAgentUsage(loadAgentAttemptReceipts(measured), undefined, scope);
  assert.equal(summed.inputTokens, 80);
  assert.ok((summed.agentAttempts || 0) >= 1);

  const bare = temp();
  mkdirSync(join(bare, "agent/runs/usage"), { recursive: true });
  writeFileSync(join(bare, "agent/runs/usage/run.json"), JSON.stringify({
    schemaVersion: 1, receiptId: "r", nodeId: "_run", preparationId: "run", attemptId: "run:1",
    kind: "agent", source: "host_export", coverage: "measured", createdAt: new Date().toISOString(),
  }), "utf8");
  assert.equal(loadArmUsageMetrics(bare).coverage, "incomplete");
  assert.equal(loadArmUsageMetrics(bare).inputTokens, undefined);

  const conflict = temp();
  for (const [sessionId, tokens] of [["s1", 10], ["s2", 40]] as const) {
    const file = `${sessionId}.json`;
    const rawBody = JSON.stringify({ tokens });
    writeFileSync(join(conflict, file), rawBody, "utf8");
    importHostUsage({
      root: conflict, evidenceRoot: conflict,
      raw: {
        schemaVersion: 1, provider: "cursor", model: "composer", sessionId, runId: "trial", arm: "B",
        rawExportPath: file, rawExportHash: createHash("sha256").update(rawBody).digest("hex"),
        sourceFormat: "cursor_session", sourceFormatVersion: "1", scope: "run",
        inputTokens: tokens, outputTokens: 1,
      },
    });
  }
  assert.equal(selectAuthoritativeRunReceipt(loadAgentAttemptReceipts(conflict), { runId: "trial", arm: "B", provider: "cursor", model: "composer" }).conflict, true);
  assert.equal(loadArmUsageMetrics(conflict, undefined, { runId: "trial", arm: "B", provider: "cursor", model: "composer" }).coverage, "incomplete");
  assert.equal(loadArmUsageMetrics(measured, undefined, { ...scope, arm: "A" }).coverage, "incomplete");
  assert.equal(loadArmUsageMetrics(measured, undefined, { ...scope, model: "other" }).coverage, "incomplete");
  assert.equal(loadArmUsageMetrics(measured, undefined, { ...scope, provider: "gemini" }).coverage, "incomplete");
  assert.equal(loadArmUsageMetrics(measured, undefined, { ...scope, sessionId: "other" }).coverage, "incomplete");
  assert.equal(loadArmUsageMetrics(measured, undefined, { ...scope, runId: "other-trial" }).coverage, "incomplete");

  const evidence = temp();
  assert.throws(() => importHostUsage({
    root: evidence, evidenceRoot: evidence,
    raw: {
      schemaVersion: 1, provider: "cursor", model: "composer", sessionId: "s",
      rawExportPath: "missing.json", rawExportHash: "a".repeat(64),
      sourceFormat: "cursor_session", sourceFormatVersion: "1", scope: "run",
      inputTokens: 1, outputTokens: 1, runId: "r", arm: "A",
    },
  }));
  const outside = temp();
  writeFileSync(join(outside, "secret.json"), "secret", "utf8");
  const inside = temp();
  assert.throws(() => importHostUsage({
    root: inside, evidenceRoot: inside,
    raw: {
      schemaVersion: 1, provider: "cursor", model: "composer", sessionId: "s",
      rawExportPath: join(outside, "secret.json"),
      rawExportHash: createHash("sha256").update("secret").digest("hex"),
      sourceFormat: "cursor_session", sourceFormatVersion: "1", scope: "run",
      inputTokens: 1, outputTokens: 1, runId: "r", arm: "A",
    },
  }));
  const linkRoot = temp();
  const real = temp();
  writeFileSync(join(real, "outside.json"), "outside", "utf8");
  try {
    symlinkSync(join(real, "outside.json"), join(linkRoot, "escape.json"));
    assert.throws(() => importHostUsage({
      root: linkRoot, evidenceRoot: linkRoot,
      raw: {
        schemaVersion: 1, provider: "cursor", model: "composer", sessionId: "s",
        rawExportPath: "escape.json",
        rawExportHash: createHash("sha256").update("outside").digest("hex"),
        sourceFormat: "cursor_session", sourceFormatVersion: "1", scope: "run",
        inputTokens: 1, outputTokens: 1, runId: "r", arm: "A",
      },
    }));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EINVAL" && code !== "ENOTSUP") throw err;
  }
  const mutated = temp();
  writeFileSync(join(mutated, "export.json"), "one", "utf8");
  const originalHash = createHash("sha256").update("one").digest("hex");
  writeFileSync(join(mutated, "export.json"), "two", "utf8");
  assert.throws(() => importHostUsage({
    root: mutated, evidenceRoot: mutated,
    raw: {
      schemaVersion: 1, provider: "cursor", model: "composer", sessionId: "s",
      rawExportPath: "export.json", rawExportHash: originalHash,
      sourceFormat: "cursor_session", sourceFormatVersion: "1", scope: "run",
      inputTokens: 1, outputTokens: 1, runId: "r", arm: "A",
    },
  }));
  const once = temp();
  const onceBody = "same";
  writeFileSync(join(once, "export.json"), onceBody, "utf8");
  const onceContract = {
    schemaVersion: 1 as const, provider: "cursor", model: "composer", sessionId: "s",
    rawExportPath: "export.json", rawExportHash: createHash("sha256").update(onceBody).digest("hex"),
    sourceFormat: "cursor_session", sourceFormatVersion: "1", scope: "run" as const,
    inputTokens: 2, outputTokens: 1, runId: "same", arm: "A" as const,
  };
  importHostUsage({ root: once, evidenceRoot: once, raw: onceContract });
  assert.throws(() => importHostUsage({ root: once, evidenceRoot: once, raw: onceContract }));
  const manual = importHostUsage({ root: temp(), raw: { model: "composer", usage: { input_tokens: 4, output_tokens: 1 } } });
  assert.equal(manual.source, "manual_host_report");

  const forged = temp();
  writeFileSync(join(forged, "launch.json"), "{}", "utf8");
  mkdirSync(join(forged, "agent"), { recursive: true });
  const prepared = prepareArm({ trialId: "adversary", arm: "B", root: forged, kernel, env: {} });
  assert.equal(prepared.ok, true, prepared.ok ? "" : prepared.reason);
  writeFileSync(join(forged, "agent/graph.yaml"), JSON.stringify({
    version: 2, stop_at: "preview_ready",
    nodes: [{ id: "preview", needs: [], writes: [], refs: [], tools: [], eval: "preview", maxAttempts: 1, kind: "agent" }],
  }), "utf8");
  writeFileSync(join(forged, "agent/STATE.json"), JSON.stringify({
    version: 2, status: "complete", current: null, preview_ready: true, launched: false, iteration: 1,
    nodes: { preview: { status: "done", attempts: 1 } },
  }), "utf8");
  mkdirSync(join(forged, "agent/decisions/jev"), { recursive: true });
  writeFileSync(join(forged, "agent/decisions/jev/fake.json"), JSON.stringify({ schemaVersion: 1, receiptId: "fake" }), "utf8");
  writeFileSync(join(forged, "agent/runs/prep.business-review-grounding.task.json"), JSON.stringify({
    preparationId: "prep", nodeId: "business-review", taskId: "business-review-grounding", taskType: "grounding",
    inputHash: "forged", status: "completed", receiptIds: ["fake.json"], timestamp: new Date().toISOString(),
  }), "utf8");
  const forgedFinal = finalizeArm({ trialId: "adversary", arm: "B", root: forged, kernel });
  assert.equal(forgedFinal.ok, false);

  const unrelated = temp();
  writeFileSync(join(unrelated, "launch.json"), "{}", "utf8");
  mkdirSync(join(unrelated, "agent"), { recursive: true });
  assert.equal(prepareArm({ trialId: "adversary", arm: "B", root: unrelated, kernel, env: {} }).ok, true);
  writeFileSync(join(unrelated, "agent/graph.yaml"), readFileSync(join(forged, "agent/graph.yaml")));
  writeFileSync(join(unrelated, "agent/STATE.json"), readFileSync(join(forged, "agent/STATE.json")));
  mkdirSync(join(unrelated, "agent/decisions/jev"), { recursive: true });
  writeFileSync(join(unrelated, "agent/decisions/jev/media.json"), JSON.stringify({ schemaVersion: 1, receiptId: "media" }), "utf8");
  writeFileSync(join(unrelated, "agent/runs/prep.media-fit-scoring.task.json"), JSON.stringify({
    preparationId: "prep", nodeId: "direction", taskId: "media-fit-scoring", taskType: "custom",
    inputHash: "x", status: "completed", receiptIds: ["media.json"], timestamp: new Date().toISOString(),
  }), "utf8");
  const unrelatedFinal = finalizeArm({ trialId: "adversary", arm: "B", root: unrelated, kernel });
  assert.equal(unrelatedFinal.ok, false);
  assert.match(unrelatedFinal.ok ? "" : unrelatedFinal.reason, /profile|manifest|receipt|registered|media-fit/i);

  const drifted = temp();
  writeFileSync(join(drifted, "launch.json"), "{}", "utf8");
  mkdirSync(join(drifted, "agent"), { recursive: true });
  assert.equal(prepareArm({ trialId: "adversary", arm: "B", root: drifted, kernel, env: {} }).ok, true);
  const cfg = JSON.parse(readFileSync(join(drifted, "agent/jev.json"), "utf8"));
  cfg.model = "jev-other";
  writeFileSync(join(drifted, "agent/jev.json"), JSON.stringify(cfg), "utf8");
  const driftFinal = finalizeArm({ trialId: "adversary", arm: "B", root: drifted, kernel });
  assert.equal(driftFinal.ok, false);
  assert.match(driftFinal.ok ? "" : driftFinal.reason, /drift/i);

  const kernelDrift = temp();
  writeFileSync(join(kernelDrift, "launch.json"), "{}", "utf8");
  mkdirSync(join(kernelDrift, "agent"), { recursive: true });
  assert.equal(prepareArm({ trialId: "adversary", arm: "A", root: kernelDrift, kernel, env: {} }).ok, true);
  const marker = JSON.parse(readFileSync(join(kernelDrift, "agent/pilot-trial.json"), "utf8"));
  marker.kernelRevision = "deadbeef:0000000000000000";
  writeFileSync(join(kernelDrift, "agent/pilot-trial.json"), JSON.stringify(marker), "utf8");
  const kernelFinal = finalizeArm({ trialId: "adversary", arm: "A", root: kernelDrift, kernel });
  assert.equal(kernelFinal.ok, false);
  assert.match(kernelFinal.ok ? "" : kernelFinal.reason, /[Kk]ernel/);

  const refused = temp();
  mkdirSync(join(refused, "agent"), { recursive: true });
  writeFileSync(join(refused, "launch.json"), "{}", "utf8");
  const blocked = prepareArm({ trialId: "adversary", arm: "B", root: refused, kernel, argv: ["--jev-mode", "off"], env: {} });
  assert.equal(blocked.ok, false);
  assert.equal(existsSync(join(refused, "agent/jev.json")), false);
  assert.equal(existsSync(join(refused, "agent/pilot-trial.json")), false);

  const armA = temp();
  writeFileSync(join(armA, "launch.json"), "{}", "utf8");
  mkdirSync(join(armA, "agent"), { recursive: true });
  assert.equal(prepareArm({ trialId: "adversary", arm: "A", root: armA, kernel, env: {} }).ok, true);
  mkdirSync(join(armA, "agent/decisions/jev"), { recursive: true });
  writeFileSync(join(armA, "agent/decisions/jev/any.json"), "{}", "utf8");
  writeFileSync(join(armA, "agent/graph.yaml"), readFileSync(join(forged, "agent/graph.yaml")));
  writeFileSync(join(armA, "agent/STATE.json"), readFileSync(join(forged, "agent/STATE.json")));
  const armAFinal = finalizeArm({ trialId: "adversary", arm: "A", root: armA, kernel });
  assert.equal(armAFinal.ok, false);
  assert.match(armAFinal.ok ? "" : armAFinal.reason, /zero Jev/);


});
