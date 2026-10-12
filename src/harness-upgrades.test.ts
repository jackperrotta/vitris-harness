import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fingerprint, save } from "./agent/artifacts.ts";
import { initialState, type SkillGraph } from "./agent/graph.ts";
import { findActivePreparation, loadPreparation, snapshotInventory, verifyAllowedWrites } from "./agent/preparation.ts";
import { prepareStage, completeStage } from "./agent/lifecycle.ts";
import { runWorkflow, invokeAdapter } from "./agent/workflow.ts";
import { finish } from "./agent/runner.ts";
import { registerRecoveredMedia } from "./agent/added-media.ts";
import { invocationSpend, reserveInvocation, settleInvocation } from "./agent/invocation-budget.ts";
import { loadUsageReceipt, parseStreamJsonUsage } from "./agent/design-usage.ts";
import { createTrialSession, advanceTrialSession, readTrialSession, reopenMediaForAdded } from "./agent/trials.ts";
import { sourceManifest } from "./agent/source-manifest.ts";
import { createHash } from "node:crypto";

const kernel = resolve(import.meta.dirname, "..");
const temp = () => mkdtempSync(join(tmpdir(), "vitris-upgrade-"));

test("terminal provider usage replaces turn aggregates instead of double billing", () => {
  const usage = parseStreamJsonUsage([
    JSON.stringify({type: "turn.completed", usage: {input_tokens: 10, output_tokens: 2}}),
    JSON.stringify({type: "result", usage: {input_tokens: 10, output_tokens: 2}}),
  ].join("\n"));
  assert.equal(usage.inputTokens, 10); assert.equal(usage.outputTokens, 2);
});

test("write boundary includes site config, public assets, and other critics' reviews", () => {
  const root = temp();
  save(join(root, "site.json"), {name: "before"});
  save(join(root, "public/app.json"), {before: true});
  save(join(root, "agent/reviews/copy-review.json"), {verdict: "fail"});
  const baselineInventory = snapshotInventory(root);
  save(join(root, "site.json"), {name: "after"});
  save(join(root, "public/app.json"), {after: true});
  save(join(root, "agent/reviews/copy-review.json"), {verdict: "pass"});
  const node = {id: "business-review", kind: "critic" as const, needs: [], refs: [], tools: [], writes: ["agent/reviews/business-review.json"], eval: "business-review", maxAttempts: 4};
  const result = verifyAllowedWrites({root, node, baselineInventory, allowedWrites: node.writes});
  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 3);
});

test("third resume cannot execute after two identical failures; reasoned restart reopens it", async () => {
  const root = temp();
  const graph: SkillGraph = {version: 2, stop_at: "a", nodes: [{id: "a", kind: "tool", command: ["node", "-e", "process.exit(1)"], needs: [], refs: [], tools: [], writes: [], eval: "a", maxAttempts: 4}]};
  save(join(root, "agent/graph.yaml"), graph); save(join(root, "agent/STATE.json"), initialState(graph));
  writeFileSync(join(root, "agent/PROMPT.md"), "test");
  const run = (argv: string[] = []) => runWorkflow({root, kernel, argv: ["--once", "--no-preview-server", ...argv], onLog: () => {}});
  await run(); await run();
  const third = await run();
  assert.equal(third.state.nodes.a!.attempts, 2);
  assert.equal(third.state.status, "repeated_failure_blocked");
  assert.equal(third.exitCode, 1);
  const restarted = await run(["--restart-from", "a", "--reason", "regression test repaired command"]);
  assert.equal(restarted.state.nodes.a!.attempts, 1);
  assert.equal(restarted.state.status, "needs_repair");
});

test("failed reviewer dispatch has durable spend, consumes an attempt, and replays without double counting", async () => {
  const root = temp();
  const node = {id: "critic", kind: "critic" as const, needs: [], refs: [], tools: [], inputs: [], writes: ["agent/reviews/critic.json"], eval: "critic", maxAttempts: 4};
  const graph: SkillGraph = {version: 2, stop_at: "critic", nodes: [node]};
  save(join(root, "agent/graph.yaml"), graph); const state = initialState(graph); save(join(root, "agent/STATE.json"), state);
  writeFileSync(join(root, "agent/PROMPT.md"), "test");
  const prepared = await prepareStage({root, kernel, graph, state, promptOverride: "Inspect evidence", nodeId: node.id});
  const prep = prepared.preparation!;
  const reservation = reserveInvocation({root, preparationId: prep.id, nodeId: node.id, maxTokens: 100, totalTokenLimit: 120});
  const outputPath = join(root, "agent/runs/reviewer.log");
  await invokeAdapter({cwd: root, adapter: {command: process.execPath, args: ["-e", 'console.log(JSON.stringify({type:"turn.completed",usage:{input_tokens:70,output_tokens:10}}));process.exit(1)'], prompt: "stdin"}, nodeId: node.id, prompt: "test", timeout: 5000, runnerPid: process.pid, outputPath});
  settleInvocation(root, reservation.id, loadUsageReceipt(outputPath.replace(".log", ".usage.json"))!);
  const opts = {root, kernel, graph, state, preparationId: prep.id, invocationId: reservation.id, evaluate: () => ({failures: []}), executionFailures: ["Reviewer CLI exit 1"]};
  const result = await completeStage(opts);
  assert.equal(result.ok, false); assert.equal(state.nodes.critic!.attempts, 1);
  assert.equal(state.cumulativeSpend?.reviewer?.tokens, 80);
  const replay = await completeStage(opts);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(invocationSpend(root).calls, 1);
  assert.throws(() => reserveInvocation({root, preparationId: "next", nodeId: node.id, maxTokens: 50, totalTokenLimit: 120}), /budget unavailable/);
  const provenance = JSON.parse(readFileSync(join(root, "agent/runs", `${prep.id}.review-provenance.json`), "utf8"));
  assert.equal(provenance.kind, "independent_model"); assert.equal(provenance.humanApproved, false);
});

test("unsettled and unmetered invocations cannot be treated as zero cost", () => {
  const root = temp();
  const first = reserveInvocation({root, preparationId: "first", nodeId: "review", maxTokens: 50, totalTokenLimit: 100});
  assert.throws(() => reserveInvocation({root, preparationId: "next", nodeId: "review", maxTokens: 50, totalTokenLimit: 100}), /no final receipt/);
  settleInvocation(root, first.id, {schemaVersion: 1, adapter: "test", role: "reviewer", nodeId: "review", startedAt: first.startedAt, durationMs: 10, status: "interrupted", usage: {unknown: true}});
  assert.equal(invocationSpend(root).unknownCalls, 1);
  assert.throws(() => reserveInvocation({root, preparationId: "next", nodeId: "review", maxTokens: 50, totalTokenLimit: 100}), /unknown prior usage/);
});

test("trial session pauses for active-agent work and retains changed-input outcomes", async () => {
  const capture = temp(), out = join(temp(), "session");
  save(join(capture, "onboarding/brief.json"), {sourceUrl: "", business: {name: "Trial"}, warnings: ["blank starter"], pages: [], images: []});
  const created = createTrialSession({kernel, capture, out, runs: 1});
  assert.equal(created.results[0]!.passed, false);
  const resumed = await advanceTrialSession(out);
  assert.equal(resumed.results[0]!.status, "awaiting_agent");
  assert.equal(resumed.results[0]!.usage?.coverage, "incomplete");
  await advanceTrialSession(out, {intervention: "Inspect the pending business stage"});
  assert.equal(readTrialSession(out).results[0]!.history.length, 2);
  save(join(capture, "onboarding/new.json"), {}); // unrelated file does not change the capture contract
  save(join(capture, "onboarding/brief.json"), {sourceUrl: "changed"});
  const changed = await advanceTrialSession(out);
  assert.equal(changed.results[0]!.status, "inputs_changed");
  assert.equal(changed.results[0]!.passed, false);
  assert.equal(changed.results[0]!.interventions.length, 1);
});

test("trial accepts provenanced stock and permanently rejects original media changes", async () => {
  const capture = temp(), out = join(temp(), "session"), original = "original photo";
  save(join(capture, "onboarding/brief.json"), {sourceUrl: "", business: {name: 'Sam\'s "Studio"'}, warnings: ["blank starter"], pages: [], images: []});
  mkdirSync(join(capture, "media/harvest"), {recursive: true});
  writeFileSync(join(capture, "media/harvest/photo.jpg"), original);
  const created = createTrialSession({kernel, capture, out, runs: 1});
  const root = created.results[0]!.root;
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.dependencies["@vitris/harness"].startsWith("file:"), true);
  assert.equal(existsSync(join(root, ".gitignore")), true);
  assert.equal(existsSync(join(root, "gitignore")), false);
  assert.equal(JSON.parse(readFileSync(join(root, "site.json"), "utf8")).name, 'Sam\'s "Studio"');
  const stock = "stock bytes", hash = createHash("sha256").update(stock).digest("hex");
  mkdirSync(join(root, "media/stock"), {recursive: true});
  writeFileSync(join(root, `media/stock/${hash}.jpg`), stock);
  save(join(root, "onboarding/media-inventory.json"), {version: 2, assets: [{path: `/media/stock/${hash}.jpg`, sha256: hash, sources: ["https://example.com/asset"], origin: "stock"}]});
  assert.equal((await advanceTrialSession(out)).results[0]!.status, "awaiting_agent");
  writeFileSync(join(root, "media/harvest/photo.jpg"), "replacement photo");
  assert.equal((await advanceTrialSession(out)).results[0]!.status, "inputs_changed");
  writeFileSync(join(root, "media/harvest/photo.jpg"), original);
  assert.equal((await advanceTrialSession(out)).results[0]!.status, "inputs_changed");
});

test("trial snapshots Jev treatment and rejects changes on resume", async () => {
  const capture = temp(), out = join(temp(), "session");
  save(join(capture, "onboarding/brief.json"), {sourceUrl: "", business: {name: "Trial"}, warnings: ["blank starter"], pages: [], images: []});
  const created = createTrialSession({kernel, capture, out, runs: 1, jev: {mode: "shadow", model: "jev-1.13.0", capabilities: {mediaClassification: "shadow", mediaSelection: "shadow", mediaSetReview: "shadow", mediaProvenance: "shadow"} as any, pilotBudget: {maxTransportAttempts: 1, maxInputTokens: 100}}});
  assert.equal(created.treatment.mode, "shadow");
  assert.equal(created.treatment.pilotBudget?.maxTransportAttempts, 1);
  assert.equal(JSON.stringify(created).includes("TYPESAFE_API_KEY"), false);
  const root = created.results[0]!.root;
  save(join(root, "agent/jev.json"), {mode: "assist"});
  assert.equal((await advanceTrialSession(out)).results[0]!.status, "inputs_changed");
});

test("v5 trials separate immutable mutation, repairable added metadata, and unexpected paths", async () => {
  for (const change of ["delete", "unprovenanced", "unexpected"] as const) {
    const capture = temp(), out = join(temp(), "session");
    save(join(capture, "onboarding/brief.json"), {sourceUrl: "", business: {name: "Trial"}, warnings: ["blank starter"], pages: [], images: []});
    mkdirSync(join(capture, "media/harvest"), {recursive: true});
    writeFileSync(join(capture, "media/harvest/original.jpg"), "original");
    const run = createTrialSession({kernel, capture, out, runs: 1}).results[0]!;
    if (change === "delete") unlinkSync(join(run.root, "media/harvest/original.jpg"));
    else if (change === "unprovenanced") { mkdirSync(join(run.root, "media/stock"), {recursive: true}); writeFileSync(join(run.root, "media/stock/unknown.jpg"), "unknown"); }
    else writeFileSync(join(run.root, "media/unexpected.jpg"), "unexpected");
    const advanced = (await advanceTrialSession(out)).results[0]!;
    assert.equal(advanced.status, change === "unprovenanced" ? "awaiting_agent" : "inputs_changed");
    if (change === "unexpected") assert.equal(advanced.integrityFindings?.[0]?.code, "ADDED_MEDIA_PATH");
  }
});

test("a legacy terminal inputs_changed trial remains terminal under the v5 reader", async () => {
  const capture = temp(), out = join(temp(), "session");
  save(join(capture, "onboarding/brief.json"), {sourceUrl: "", business: {name: "Trial"}, warnings: ["blank starter"], pages: [], images: []});
  createTrialSession({kernel, capture, out, runs: 1});
  const manifest = readTrialSession(out);
  manifest.version = 4; manifest.results[0]!.status = "inputs_changed";
  save(join(out, "trials.json"), manifest);
  const before = readFileSync(join(out, "trials.json"), "utf8");
  const result = await advanceTrialSession(out);
  assert.equal(result.results[0]!.status, "inputs_changed");
  assert.equal(readFileSync(join(out, "trials.json"), "utf8"), before);
});

test("added-media omissions reopen the writable media stage without resetting history or spend", () => {
  const stage = (id: string, needs: string[], writes: string[]): SkillGraph["nodes"][number] => ({id, needs, writes, refs: [], tools: [], eval: id, kind: "agent", maxAttempts: 4});
  const graph: SkillGraph = {version: 3, stop_at: "preview", nodes: [stage("harvest", [], []), stage("media", ["harvest"], ["onboarding/media-inventory.json", "media/recovered"]), stage("direction", ["media"], ["onboarding/direction.json"]), stage("preview", ["direction"], [])]};
  const state = initialState(graph);
  for (const node of graph.nodes) state.nodes[node.id] = {status: "done", attempts: 2};
  state.cumulativeSpend!.iterations = 8;
  const reopened = reopenMediaForAdded(graph, state, {findings: [{code: "ADDED_MEDIA_METADATA", path: "media/recovered/mark.png", owner: "media", category: "repairable", explanation: "Missing sha256"}], bindings: []}, []);
  assert.equal(reopened, true);
  assert.equal(state.nodes.harvest!.status, "done");
  assert.equal(state.nodes.media!.status, "pending");
  assert.equal(state.nodes.direction!.status, "pending");
  assert.equal(state.nodes.preview!.status, "pending");
  assert.equal(state.nodes.media!.attempts, 2);
  assert.equal(state.cumulativeSpend!.iterations, 8);
  assert.ok(graph.nodes.find(node => node.id === "media")!.writes.includes("onboarding/media-inventory.json"));
});

function miniatureActiveAgentTrial() {
  const capture = temp(), out = join(temp(), "session");
  save(join(capture, "onboarding/brief.json"), {sourceUrl: "", business: {name: "Fictional media trial"}, warnings: ["blank starter"], pages: [], images: []});
  const session = createTrialSession({kernel, capture, out, runs: 1});
  const root = session.results[0]!.root;
  const stage = (id: string, needs: string[], writes: string[], evalId = id): SkillGraph["nodes"][number] =>
    ({id, kind: "agent", needs, writes, refs: [], tools: [], eval: evalId, maxAttempts: 4});
  const graph: SkillGraph = {version: 3, stop_at: "final", nodes: [
    stage("harvest", [], []),
    stage("media", ["harvest"], ["onboarding/media-inventory.json", "media/recovered", "media/stock"]),
    stage("final", ["media"], [], "media"),
  ]};
  save(join(root, "agent/graph.yaml"), graph);
  finish(root, graph, initialState(graph), graph.nodes[0]!, []);
  save(join(root, "onboarding/media-inventory.json"), {version: 2, harvestHash: fingerprint(root, ["onboarding/brief.json", "media/harvest"]), assets: [], unavailable: []});
  session.results[0]!.configHash = fingerprint(root, ["launch.json", "agent/graph.yaml", "agent/workflow.json", "agent/adapter.reviewer.json", "agent/jev.json", "agent/request.json"]);
  save(join(out, "trials.json"), session);
  return {out, root};
}

function addFictionalMedia(root: string, name: string, contents: string) {
  mkdirSync(join(root, "media/recovered"), {recursive: true});
  writeFileSync(join(root, "media/recovered", name), contents);
  return registerRecoveredMedia(root, {path: `media/recovered/${name}`, source: "onboarding/brief.json", disposition: "retain"});
}

async function completeActiveStage(root: string, id: string) {
  const preparation = findActivePreparation(root, id);
  assert.ok(preparation, `expected an active ${id} preparation`);
  const result = await runWorkflow({root, kernel, argv: ["--complete", "--preparation", preparation.id, "--no-preview-server"], onLog: () => {}});
  assert.equal(result.exitCode, 0);
  assert.equal(result.state.nodes[id]?.status, "done");
  return preparation;
}

test("active-agent media completion checkpoints bindings and reaches the miniature final gate", async () => {
  const {out, root} = miniatureActiveAgentTrial();
  assert.equal((await advanceTrialSession(out)).results[0]!.status, "awaiting_agent");
  addFictionalMedia(root, "first.png", "fictional-first-bytes");
  const mediaPrep = await completeActiveStage(root, "media");
  assert.equal(loadPreparation(root, mediaPrep.id)?.result?.ok, true);
  const resumed = (await advanceTrialSession(out)).results[0]!;
  assert.equal(resumed.status, "awaiting_agent");
  assert.equal(resumed.acceptedAddedMedia?.length, 1);
  const afterResume = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8"));
  assert.equal(afterResume.nodes.media.status, "done");
  assert.equal(afterResume.nodes.final.status, "pending");
  assert.equal(findActivePreparation(root, "media"), undefined);
  assert.ok(findActivePreparation(root, "final"));
  await completeActiveStage(root, "final");
  const finished = (await advanceTrialSession(out)).results[0]!;
  assert.equal(finished.status, "verified_preview");
  assert.equal(finished.passed, true);
  assert.equal(finished.acceptedAddedMedia?.length, 1);
  assert.equal(finished.interventions.length, 0);
});

test("late additions reopen media, while accepted-byte changes remain terminal", async () => {
  const {out, root} = miniatureActiveAgentTrial();
  await advanceTrialSession(out);
  addFictionalMedia(root, "first.png", "fictional-first-bytes");
  await completeActiveStage(root, "media");
  const firstResume = (await advanceTrialSession(out)).results[0]!;
  assert.equal(firstResume.acceptedAddedMedia?.length, 1);
  const finalPrep = findActivePreparation(root, "final");
  assert.ok(finalPrep);
  const mediaAttempts = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8")).nodes.media.attempts;
  const historyLength = firstResume.history.length;
  addFictionalMedia(root, "second.png", "fictional-second-bytes");
  const reopened = (await advanceTrialSession(out)).results[0]!;
  assert.equal(reopened.status, "awaiting_agent");
  assert.equal(reopened.acceptedAddedMedia?.length, 1);
  assert.equal(loadPreparation(root, finalPrep.id)?.status, "invalidated");
  assert.ok(findActivePreparation(root, "media"));
  const reopenedState = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8"));
  assert.equal(reopenedState.nodes.media.attempts, mediaAttempts);
  assert.ok(reopened.history.length > historyLength);
  await completeActiveStage(root, "media");
  const repaired = (await advanceTrialSession(out)).results[0]!;
  assert.equal(repaired.acceptedAddedMedia?.length, 2);
  assert.ok(findActivePreparation(root, "final"));
  writeFileSync(join(root, "media/recovered/first.png"), "changed-after-acceptance");
  const mutated = (await advanceTrialSession(out)).results[0]!;
  assert.equal(mutated.status, "inputs_changed");
  assert.equal(mutated.integrityFindings?.[0]?.code, "ADDED_MEDIA_BOUND_CHANGED");
});

test("v5 accepted added-media bytes changing is terminal even when inventory hash is removed", async () => {
  const capture = temp(), out = join(temp(), "session");
  save(join(capture, "onboarding/brief.json"), {sourceUrl: "", business: {name: "Trial"}, warnings: ["blank starter"], pages: [], images: []});
  const created = createTrialSession({kernel, capture, out, runs: 1});
  const root = created.results[0]!.root;
  mkdirSync(join(root, "media/recovered"), {recursive: true});
  writeFileSync(join(root, "media/recovered/mark.png"), "changed");
  const session = readTrialSession(out);
  session.results[0]!.acceptedAddedMedia = [{path: "media/recovered/mark.png", sha256: createHash("sha256").update("accepted").digest("hex"), assetId: "mark", origin: "customer", role: "asset"}];
  save(join(out, "trials.json"), session);
  const result = await advanceTrialSession(out);
  assert.equal(result.results[0]!.status, "inputs_changed");
  assert.equal(result.results[0]!.integrityFindings?.[0]?.code, "ADDED_MEDIA_BOUND_CHANGED");
});

test("source identity excludes runtime receipts but detects source edits", () => {
  const root = temp();
  mkdirSync(join(root, "src")); writeFileSync(join(root, "src/a.ts"), "first");
  const first = sourceManifest(root).hash;
  save(join(root, "agent/runs/a.json"), {attempt: 1});
  assert.equal(sourceManifest(root).hash, first);
  writeFileSync(join(root, "src/a.ts"), "second");
  assert.notEqual(sourceManifest(root).hash, first);
});

test("token ceilings persist when resume omits flags and unknown usage fails closed", async () => {
  const root = temp();
  const graph: SkillGraph = {version: 2, stop_at: "a", nodes: [{id: "a", kind: "agent", needs: [], refs: [], tools: [], writes: [], eval: "a", maxAttempts: 4}]};
  save(join(root, "agent/graph.yaml"), graph);
  const state = initialState(graph); state.cumulativeSpend!.inputTokens = 100;
  save(join(root, "agent/STATE.json"), state); writeFileSync(join(root, "agent/PROMPT.md"), "test");
  const run = (argv: string[]) => runWorkflow({root, kernel, argv: [...argv, "--no-preview-server"], onLog: () => {}});
  await run(["--max-cumulative-tokens", "100"]);
  const resumed = await run([]);
  assert.equal(resumed.state.status, "budget_exhausted");
  assert.equal(resumed.state.limits?.tokens, 100);
  assert.equal(resumed.state.nodes.a!.attempts, 0);
  const changed = await run(["--max-cumulative-tokens", "200"]);
  assert.equal(changed.exitCode, 1);
  resumed.state.cumulativeSpend!.inputTokens = 1;
  resumed.state.cumulativeSpend!.hasUnmeteredStages = true;
  save(join(root, "agent/STATE.json"), resumed.state);
  const unknown = await run([]);
  assert.equal(unknown.state.status, "budget_unavailable");
  assert.equal(unknown.state.nodes.a!.attempts, 0);
});
