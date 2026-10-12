import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fingerprint, save, SOURCE_PATHS, type Business } from "./agent/artifacts.ts";
import { initialState, parseGraphYaml, type SkillGraph, type AgentState, type GraphNode } from "./agent/graph.ts";
import { inputHash } from "./agent/runner.ts";
import { prepareStage, completeStage, executeToolStage } from "./agent/lifecycle.ts";
import { sha256Hex, verifyAllowedWrites } from "./agent/preparation.ts";
import { reviewSubject } from "./agent/evaluate.ts";
import { runWorkflow } from "./agent/workflow.ts";
import { type ToolExecutionReceipt } from "./agent/preparation.ts";
import {
  attachCursorExport,
  buildTraceSummary,
  cleanupTrace,
  inspectCursorExport,
  loadActiveMarker,
  loadLastMarker,
  loadManifest,
  loadRecordingSession,
  readEvents,
  recordToolCompleted,
  resolveDefaultTraceId,
  snapshotPreparedPrompt,
  startTraceSession,
  stopTraceSession,
  writeSummaryFiles,
  TRACE_DIR_REL,
} from "./agent/trace.ts";
import { stripAgentRuntimeHistory } from "./agent/kit-runtime.ts";

const kernel = resolve(import.meta.dirname, "..");
const temp = () => mkdtempSync(join(tmpdir(), "vitris-trace-"));
const fixtureExport = join(kernel, "src/test/fixtures/cursor-export-unverified.md");

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

test("tracing is off by default and does not create traces during prepare", async () => {
  const { root, graph, state } = createTestSite();
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);
  assert.equal(existsSync(join(root, TRACE_DIR_REL)), false);
  assert.equal(loadActiveMarker(root), undefined);
});

test("start/stop via go flags; later prepare joins the same session", async () => {
  const { root } = createTestSite();
  const start = await runWorkflow({ root, kernel, argv: ["--trace-start", "--trace-label", "pilot"], skipLock: true });
  assert.equal(start.exitCode, 0);
  const marker = loadActiveMarker(root);
  assert.ok(marker?.traceId);
  const firstId = marker.traceId;

  const prepRun = await runWorkflow({ root, kernel, argv: ["--prepare", "--node", "business"], skipLock: true });
  assert.equal(prepRun.exitCode, 0);
  assert.equal(loadActiveMarker(root)?.traceId, firstId);
  const events = readEvents(root, firstId);
  assert.equal(events.filter(e => e.type === "stage_prepared").length, 1);
  assert.ok(existsSync(join(root, TRACE_DIR_REL, firstId, "prompts", `${events[0]!.preparationId}.md`)));

  const stop = await runWorkflow({ root, kernel, argv: ["--trace-stop"], skipLock: true });
  assert.equal(stop.exitCode, 0);
  assert.equal(loadActiveMarker(root), undefined);
  assert.equal(loadManifest(root, firstId)?.status, "stopped");
});

test("exact prompt snapshot hash is captured before CURRENT.md is overwritten", async () => {
  const { root, graph, state } = createTestSite();
  startTraceSession({ root, kernel, graph, label: "snapshot" });
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);
  const snapshotPath = join(root, TRACE_DIR_REL, loadActiveMarker(root)!.traceId, "prompts", `${prep.preparation.id}.md`);
  const snapshot = readFileSync(snapshotPath);
  assert.equal(sha256Hex(snapshot), prep.preparation.promptHash);
  assert.equal(sha256Hex(readFileSync(join(root, "agent/CURRENT.md"))), prep.preparation.promptHash);

  save(join(root, "onboarding/business.json"), sampleBusiness);
  const completed = await completeStage({ root, kernel, graph, state, preparationId: prep.preparation.id });
  assert.equal(completed.ok, true, completed.failures.join("; "));

  const next = await prepareStage({ root, kernel, graph, state, nodeId: "business-review" });
  assert.ok(next.preparation);
  assert.notEqual(readFileSync(join(root, "agent/CURRENT.md"), "utf8"), readFileSync(snapshotPath, "utf8"));
  assert.equal(sha256Hex(readFileSync(snapshotPath)), prep.preparation.promptHash);
});

test("reused preparation points at the same snapshot and does not emit a second attempt", async () => {
  const { root, graph, state } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph });
  const first = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  const second = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.equal(second.reused, true);
  assert.equal(second.preparation?.id, first.preparation?.id);
  const prepared = readEvents(root, traceId).filter(e => e.type === "stage_prepared");
  assert.equal(prepared.length, 1);
  const prompts = readdirSync(join(root, TRACE_DIR_REL, traceId, "prompts"));
  assert.equal(prompts.length, 1);
});

test("failed completion and retry record two attempts", async () => {
  const { root, graph, state } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph });
  const failPrep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(failPrep.preparation);
  const failed = await completeStage({ root, kernel, graph, state, preparationId: failPrep.preparation.id });
  assert.equal(failed.ok, false);

  save(join(root, "onboarding/business.json"), sampleBusiness);
  const retryPrep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(retryPrep.preparation);
  assert.notEqual(retryPrep.preparation.id, failPrep.preparation.id);
  const passed = await completeStage({ root, kernel, graph, state, preparationId: retryPrep.preparation.id });
  assert.equal(passed.ok, true, passed.failures.join("; "));

  const events = readEvents(root, traceId);
  assert.equal(events.filter(e => e.type === "stage_prepared").length, 2);
  const completed = events.filter(e => e.type === "stage_completed");
  assert.equal(completed.length, 2);
  assert.equal(completed[0]?.result, "fail");
  assert.equal(completed[1]?.result, "ok");
});

test("duplicate completion does not emit a second completion event", async () => {
  const { root, graph, state } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph });
  save(join(root, "onboarding/business.json"), sampleBusiness);
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);
  const first = await completeStage({ root, kernel, graph, state, preparationId: prep.preparation.id });
  const second = await completeStage({ root, kernel, graph, state, preparationId: prep.preparation.id });
  assert.equal(first.ok, true);
  assert.equal(second.idempotentReplay, true);
  assert.equal(readEvents(root, traceId).filter(e => e.type === "stage_completed").length, 1);
});

test("deterministic tool failure is recorded without copying stdout into events.jsonl", async () => {
  const { root, graph, state } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph });
  const toolNode: GraphNode = {
    id: "test-tool-fail",
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
      "console.log('HUGE-OUTPUT-SHOULD-NOT-BE-IN-EVENTS'); require('fs').writeFileSync('pages/unauthorized.html', 'bad');",
    ],
  };
  const res = await executeToolStage({ root, kernel, graph, state, node: toolNode });
  assert.equal(res.ok, false);
  const events = readEvents(root, traceId).filter(e => e.type === "tool_completed");
  assert.equal(events.length, 1);
  assert.equal(events[0]?.result, "fail");
  assert.ok((events[0]?.failures || []).length > 0);
  assert.equal("stdout" in (events[0] || {}), false);
  assert.equal("stderr" in (events[0] || {}), false);
  const logPath = join(root, events[0]!.logPath!);
  assert.match(readFileSync(logPath, "utf8"), /HUGE-OUTPUT-SHOULD-NOT-BE-IN-EVENTS/);
  assert.ok(events[0]?.receiptPath);
});

test("interrupted process reopens the same recording session", async () => {
  const { root, graph, state } = createTestSite();
  const first = startTraceSession({ root, kernel, graph, label: "resume" });
  await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  const reopened = loadRecordingSession(root);
  assert.ok(reopened);
  assert.equal(reopened.manifest.traceId, first.traceId);
  assert.equal(reopened.manifest.status, "recording");
  const again = await runWorkflow({ root, kernel, argv: ["--prepare", "--node", "business"], skipLock: true });
  assert.equal(again.exitCode, 0);
  assert.equal(loadActiveMarker(root)?.traceId, first.traceId);
  assert.equal(readEvents(root, first.traceId).filter(e => e.type === "stage_prepared").length, 1);
});

test("tracing does not change source fingerprints, review subjects, or allowed-write outcomes", async () => {
  const traced = createTestSite();
  const plain = createTestSite();
  const beforeSource = fingerprint(traced.root, SOURCE_PATHS);
  const beforeSubject = reviewSubject(traced.root, "business-review");
  const beforeProtected = fingerprint(traced.root, ["pages", "components", "theme", "site.json"]);

  startTraceSession({ root: traced.root, kernel, graph: traced.graph });
  const tracedPrep = await prepareStage({ root: traced.root, kernel, graph: traced.graph, state: traced.state, nodeId: "business" });
  const plainPrep = await prepareStage({ root: plain.root, kernel, graph: plain.graph, state: plain.state, nodeId: "business" });
  assert.ok(tracedPrep.preparation && plainPrep.preparation);

  assert.equal(fingerprint(traced.root, SOURCE_PATHS), beforeSource);
  assert.equal(reviewSubject(traced.root, "business-review"), beforeSubject);
  assert.equal(fingerprint(traced.root, ["pages", "components", "theme", "site.json"]), beforeProtected);

  save(join(traced.root, "onboarding/business.json"), sampleBusiness);
  save(join(plain.root, "onboarding/business.json"), sampleBusiness);
  const tracedDone = await completeStage({ root: traced.root, kernel, graph: traced.graph, state: traced.state, preparationId: tracedPrep.preparation.id });
  const plainDone = await completeStage({ root: plain.root, kernel, graph: plain.graph, state: plain.state, preparationId: plainPrep.preparation.id });
  assert.equal(tracedDone.ok, plainDone.ok);
  assert.deepEqual(tracedDone.failures, plainDone.failures);
  assert.equal(traced.state.nodes.business?.status, plain.state.nodes.business?.status);
  assert.equal(traced.state.nodes.business?.attempts, plain.state.nodes.business?.attempts);

  const writes = verifyAllowedWrites({
    root: traced.root,
    node: traced.graph.nodes.find(n => n.id === "business")!,
    baselineInventory: tracedPrep.preparation.baselineInventory,
    allowedWrites: tracedPrep.preparation.expectedOutputs,
  });
  assert.equal(writes.ok, true, writes.violations.join("; "));
  assert.equal(fingerprint(traced.root, SOURCE_PATHS), fingerprint(plain.root, SOURCE_PATHS));
});

test("--status remains read-only for trace events", async () => {
  const { root, graph, state } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph });
  await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  const before = readFileSync(join(root, TRACE_DIR_REL, traceId, "events.jsonl"), "utf8");
  const status = await runWorkflow({ root, kernel, argv: ["--status"], skipLock: true });
  assert.equal(status.exitCode, 0);
  assert.equal(readFileSync(join(root, TRACE_DIR_REL, traceId, "events.jsonl"), "utf8"), before);
});

test("attached Cursor export without tool calls stays partial/unknown and does not invent tools", () => {
  const { root, graph } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph });
  const record = attachCursorExport({ root, file: fixtureExport, preparationIds: ["prep-1"] });
  assert.equal(record.inspection.toolNames, "absent");
  assert.equal(record.inspection.toolArguments, "absent");
  assert.equal(record.inspection.toolResults, "absent");
  assert.equal(record.inspection.agentActions, "partial");
  assert.ok(record.inspection.notes.some(n => n.includes("never treats prose as proof")));
  const raw = inspectCursorExport("I ran npm test and it passed.");
  assert.equal(raw.toolNames, "absent");
  const summary = readFileSync(join(root, TRACE_DIR_REL, traceId, "summary.md"), "utf8");
  assert.match(summary, /agent actions: partial/i);
  assert.match(summary, /unverified/i);
});

test("missing Cursor export leaves kernel trace usable and marks host actions unobserved", () => {
  const { root, graph } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph });
  stopTraceSession(root);
  const summary = readFileSync(join(root, TRACE_DIR_REL, traceId, "summary.md"), "utf8");
  assert.match(summary, /Agent actions: unobserved/);
  assert.match(summary, /No Cursor Markdown export is attached/);
});

test("cleanup removes one trace id and never deletes agent/runs", async () => {
  const { root, graph, state } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph });
  await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  mkdirSync(join(root, "agent/runs"), { recursive: true });
  writeFileSync(join(root, "agent/runs", "keep-me.json"), "{\"ok\":true}\n");
  const removed = cleanupTrace(root, traceId);
  assert.equal(existsSync(join(root, TRACE_DIR_REL, traceId)), false);
  assert.equal(existsSync(join(root, "agent/runs", "keep-me.json")), true);
  assert.match(removed.removed, /traces/);
  assert.throws(() => cleanupTrace(root, ""), /explicit trace ID/);
  assert.throws(() => cleanupTrace(root, "../runs"), /explicit trace ID/);
});

test("site kit gitignore and runtime-history stripping keep traces out of scaffolded history", () => {
  const gitignore = readFileSync(join(kernel, "templates/site/gitignore"), "utf8");
  assert.match(gitignore, /agent\/runs\/traces\//);
  const agentDir = join(temp(), "agent");
  mkdirSync(join(agentDir, "runs", "traces", "abc"), { recursive: true });
  writeFileSync(join(agentDir, "runs", "traces", "abc", "manifest.json"), "{}\n");
  const removed = stripAgentRuntimeHistory(agentDir);
  assert.ok(removed.includes("runs"));
  assert.equal(existsSync(join(agentDir, "runs")), false);
});

test("new trace start supersedes a recording session without deleting it", () => {
  const { root, graph } = createTestSite();
  const first = startTraceSession({ root, kernel, graph, label: "one" });
  const second = startTraceSession({ root, kernel, graph, label: "two" });
  assert.notEqual(second.traceId, first.traceId);
  assert.equal(loadManifest(root, first.traceId)?.status, "superseded");
  assert.equal(loadRecordingSession(root)?.manifest.traceId, second.traceId);
  assert.ok(existsSync(join(root, TRACE_DIR_REL, first.traceId, "manifest.json")));
});

function writeUnrelatedPreparation(root: string, id: string, nodeId: string): void {
  mkdirSync(join(root, "agent/preparations"), { recursive: true });
  writeFileSync(join(root, "agent/preparations", `${id}.json`), JSON.stringify({
    schemaVersion: 1,
    id,
    nodeId,
    runId: "unrelated-run",
    ownerToken: "unrelated",
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    graphVersion: 3,
    contractVersion: "test",
    immutableDependencies: [],
    immutableHash: "0",
    editableInputs: [],
    expectedOutputs: [],
    protectedSourceFingerprint: "0",
    captureFingerprint: "0",
    baselineInventory: {},
    packetHash: "0",
    attempt: 9,
    status: "consumed",
    preparedAt: new Date().toISOString(),
    consumedAt: new Date().toISOString(),
    result: { ok: false, failures: [`${nodeId} leaked from another run`] },
  }, null, 2) + "\n", "utf8");
}

test("two traces in one site isolate stages; stop and attach never become unknown stages", async () => {
  const { root, graph, state } = createTestSite();
  writeUnrelatedPreparation(root, "unrelated-zzz", "media");

  const traceA = startTraceSession({ root, kernel, graph, label: "trace-a" });
  const failPrep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(failPrep.preparation);
  const failed = await completeStage({ root, kernel, graph, state, preparationId: failPrep.preparation.id });
  assert.equal(failed.ok, false);
  stopTraceSession(root);

  const eventsPath = join(root, TRACE_DIR_REL, traceA.traceId, "events.jsonl");
  const originalEvents = readFileSync(eventsPath, "utf8");
  const withoutCompletion = originalEvents
    .split(/\r?\n/)
    .filter(line => line.trim() && !line.includes("\"stage_completed\""))
    .join("\n") + "\n";
  writeFileSync(eventsPath, withoutCompletion, "utf8");
  const recovered = writeSummaryFiles(root, traceA.traceId);
  const recoveredBusiness = recovered.stages.find(s => s.nodeId === "business");
  assert.ok(recoveredBusiness);
  assert.equal(recoveredBusiness.result, "fail");
  assert.ok((recoveredBusiness.missing || []).some(m => /completion event missing/i.test(m)));
  writeFileSync(eventsPath, originalEvents, "utf8");

  attachCursorExport({ root, file: fixtureExport });
  const summaryA = writeSummaryFiles(root, traceA.traceId);
  assert.equal(summaryA.stages.every(s => s.nodeId !== "unknown"), true);
  assert.equal(summaryA.stages.some(s => s.nodeId === "media"), false);
  assert.equal(summaryA.stages.some(s => s.preparationId === "unrelated-zzz"), false);
  assert.ok(summaryA.stages.some(s => s.nodeId === "business" && s.result === "fail"));
  const aEvents = readEvents(root, traceA.traceId);
  assert.ok(aEvents.some(e => e.type === "run_finished"));
  assert.ok(aEvents.some(e => e.type === "cursor_attached"));
  assert.equal(summaryA.stages.filter(s => s.nodeId === "unknown").length, 0);

  save(join(root, "onboarding/business.json"), sampleBusiness);
  const untracedPass = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(untracedPass.preparation);
  const untracedDone = await completeStage({ root, kernel, graph, state, preparationId: untracedPass.preparation.id });
  assert.equal(untracedDone.ok, true, untracedDone.failures.join("; "));
  const untracedSuccessId = untracedPass.preparation.id;

  const traceB = startTraceSession({ root, kernel, graph, label: "trace-b" });
  const reviewPrep = await prepareStage({ root, kernel, graph, state, nodeId: "business-review" });
  assert.ok(reviewPrep.preparation);
  const reviewFail = await completeStage({ root, kernel, graph, state, preparationId: reviewPrep.preparation.id });
  assert.equal(reviewFail.ok, false);
  stopTraceSession(root);
  const summaryB = writeSummaryFiles(root, traceB.traceId);

  assert.equal(summaryB.stages.some(s => s.nodeId === "business"), false);
  assert.equal(summaryB.stages.some(s => s.preparationId === failPrep.preparation?.id), false);
  assert.equal(summaryB.stages.some(s => s.preparationId === untracedSuccessId), false);
  assert.equal(summaryB.stages.some(s => s.preparationId === "unrelated-zzz"), false);
  assert.ok(summaryB.stages.some(s => s.nodeId === "business-review" && s.result === "fail"));
  assert.equal(summaryB.stages.every(s => s.nodeId !== "unknown"), true);
  assert.equal(summaryA.stages.some(s => s.nodeId === "business-review"), false);
  assert.equal(summaryA.stages.some(s => s.preparationId === untracedSuccessId), false);
});

test("documented start → prepare → stop → summary uses the last stopped trace", async () => {
  const { root } = createTestSite();
  const startLogs: string[] = [];
  const start = await runWorkflow({
    root,
    kernel,
    argv: ["--trace-start", "--trace-label", "doc-seq"],
    skipLock: true,
    onLog: message => startLogs.push(String(message)),
  });
  assert.equal(start.exitCode, 0);
  const traceId = loadActiveMarker(root)?.traceId;
  assert.ok(traceId);

  const prep = await runWorkflow({ root, kernel, argv: ["--prepare", "--node", "business"], skipLock: true });
  assert.equal(prep.exitCode, 0);

  const stopLogs: string[] = [];
  const stop = await runWorkflow({
    root,
    kernel,
    argv: ["--trace-stop"],
    skipLock: true,
    onLog: message => stopLogs.push(String(message)),
  });
  assert.equal(stop.exitCode, 0);
  assert.equal(loadActiveMarker(root), undefined);
  assert.equal(loadLastMarker(root)?.traceId, traceId);
  assert.match(stopLogs.join("\n"), new RegExp(traceId));

  const summaryLogs: string[] = [];
  const summary = await runWorkflow({
    root,
    kernel,
    argv: ["--trace-summary"],
    skipLock: true,
    onLog: message => summaryLogs.push(String(message)),
  });
  assert.equal(summary.exitCode, 0);
  const printed = summaryLogs.join("\n");
  assert.match(printed, new RegExp(traceId));
  assert.match(printed, /Workflow trace/);
  const resolved = resolveDefaultTraceId(root);
  if ("error" in resolved) assert.fail(resolved.error);
  assert.equal(resolved.traceId, traceId);
});

test("tool attempts with identical duration and exit stay distinct unless the receipt path matches", () => {
  const { root, graph } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph, label: "tool-id" });
  const receipt = (outputPath: string): ToolExecutionReceipt => ({
    nodeId: "harvest",
    kind: "tool",
    command: [process.execPath, "-e", "process.exit(1)"],
    exitCode: 1,
    durationMs: 42,
    startedAt: new Date().toISOString(),
    failures: ["unauthorized write"],
    outputPath,
  });

  recordToolCompleted({
    root,
    nodeId: "harvest",
    receipt: receipt(join(root, "agent/runs/1-harvest.log")),
    iteration: 1,
  });
  recordToolCompleted({
    root,
    nodeId: "harvest",
    receipt: receipt(join(root, "agent/runs/2-harvest.log")),
    iteration: 2,
  });
  recordToolCompleted({
    root,
    nodeId: "harvest",
    receipt: receipt(join(root, "agent/runs/1-harvest.log")),
    iteration: 1,
  });

  const tools = readEvents(root, traceId).filter(e => e.type === "tool_completed");
  assert.equal(tools.length, 2);
  const receipts = tools.map(e => e.receiptPath).sort();
  assert.deepEqual(receipts, ["agent/runs/1-harvest.json", "agent/runs/2-harvest.json"]);
  const summary = buildTraceSummary(root, traceId);
  const harvestStages = summary.stages.filter(s => s.nodeId === "harvest" && s.kind === "tool");
  assert.equal(harvestStages.length, 2);
  for (const stage of harvestStages) {
    assert.ok(stage.evidence.some(e => e.fact === "tool receipt" && e.path?.includes("harvest.json")));
    assert.ok(stage.evidence.some(e => e.fact === "tool log" && e.path?.includes("harvest.log")));
  }
});

test("prompt snapshot hash mismatch is unverified and survives stop and summary regeneration", async () => {
  const { root, graph, state } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph, label: "hash-mismatch" });
  mkdirSync(join(root, "agent"), { recursive: true });
  writeFileSync(join(root, "agent/CURRENT.md"), "TAMPERED PACKET\n", "utf8");
  const expectedHash = sha256Hex("PUBLISHED PACKET\n");
  const snap = snapshotPreparedPrompt(root, { id: "prep-mismatch", promptHash: expectedHash });
  assert.ok(snap);
  assert.equal(snap.hashMismatch, true);
  assert.equal(snap.fidelity, "unverified");
  assert.notEqual(snap.hash, expectedHash);

  save(join(root, "onboarding/business.json"), sampleBusiness);
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);
  const completed = await completeStage({ root, kernel, graph, state, preparationId: prep.preparation.id });
  assert.equal(completed.ok, true, completed.failures.join("; "));

  stopTraceSession(root);
  const stopped = JSON.parse(readFileSync(join(root, TRACE_DIR_REL, traceId, "summary.json"), "utf8"));
  assert.ok(stopped.promptIntegrityWarnings?.length >= 1);
  assert.equal(stopped.promptIntegrityWarnings[0]?.preparationId, "prep-mismatch");
  assert.equal(stopped.promptIntegrityWarnings[0]?.expectedHash, expectedHash);
  assert.equal(stopped.promptIntegrityWarnings[0]?.actualHash, snap.hash);
  assert.match(stopped.promptIntegrityWarnings[0]?.message || "", /not labeled as the prompt Cursor consumed/i);

  const regenerated = writeSummaryFiles(root, traceId);
  assert.equal(regenerated.promptIntegrityWarnings.length, stopped.promptIntegrityWarnings.length);
  const md = readFileSync(join(root, TRACE_DIR_REL, traceId, "summary.md"), "utf8");
  assert.match(md, /Prompt snapshot integrity/);
  assert.match(md, /\*\*WARNING:\*\*/);
  assert.match(md, /prep-mismatch/);
  assert.match(md, /unverified — snapshot is not labeled as the prompt Cursor consumed/);
  assert.doesNotMatch(md, /Snapshot is the exact CURRENT.md packet published for this preparation/);
  const mismatchStage = regenerated.stages.find(s => s.preparationId === "prep-mismatch");
  assert.equal(mismatchStage?.promptFidelity, "unverified");
  const businessStage = regenerated.stages.find(s => s.nodeId === "business");
  assert.equal(businessStage?.promptFidelity, "verified");
});
