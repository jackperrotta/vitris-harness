import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fingerprint, save, SOURCE_PATHS, type Business } from "./agent/artifacts.ts";
import { initialState, parseGraphYaml } from "./agent/graph.ts";
import { inputHash } from "./agent/runner.ts";
import { completeStage, prepareStage } from "./agent/lifecycle.ts";
import { sha256Hex } from "./agent/preparation.ts";
import {
  CURSOR_EVENTS_FILE,
  handleCursorHook,
  hookResponseFor,
  installCursorHooks,
  readCursorEvents,
  redactCommand,
  removeCursorHooks,
  runCursorHookProcess,
  sanitizeCursorHookPayload,
} from "./agent/cursor-hook.ts";
import { buildTraceSummary, cleanupTrace, loadManifest, startTraceSession, stopTraceSession, TRACE_DIR_REL } from "./agent/trace.ts";

const kernel = resolve(import.meta.dirname, "..");
const temp = () => mkdtempSync(join(tmpdir(), "vitris-hook-"));

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

function createTestSite() {
  const root = temp();
  cpSync(join(kernel, "agent"), join(root, "agent"), { recursive: true });
  mkdirSync(join(root, "onboarding/copy"), { recursive: true });
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "components"), { recursive: true });
  const graph = parseGraphYaml(readFileSync(join(kernel, "agent/graph.yaml"), "utf8"));
  const state = initialState(graph);
  save(join(root, "launch.json"), { name: "Hook Site" });
  save(join(root, "onboarding/brief.json"), { sourceUrl: "https://example.com", business: { name: "Hook Site" } });
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

function writePrep(root: string, id: string, nodeId: string, preparedAt: string, consumedAt?: string, outputs: string[] = ["onboarding/business.json"]): void {
  mkdirSync(join(root, "agent/preparations"), { recursive: true });
  writeFileSync(join(root, "agent/preparations", `${id}.json`), JSON.stringify({
    schemaVersion: 1,
    id,
    nodeId,
    runId: "run",
    ownerToken: "owner",
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    graphVersion: 3,
    contractVersion: "test",
    immutableDependencies: [],
    immutableHash: "0",
    editableInputs: [],
    expectedOutputs: outputs,
    protectedSourceFingerprint: "0",
    captureFingerprint: "0",
    baselineInventory: {},
    packetHash: "0",
    attempt: 1,
    status: consumedAt ? "consumed" : "prepared",
    preparedAt,
    consumedAt,
  }), "utf8");
}

test("hook install merges, preserves other hooks, and remove is idempotent", () => {
  const root = temp();
  mkdirSync(join(root, ".cursor"), { recursive: true });
  writeFileSync(join(root, ".cursor/mcp.json"), "{\"mcp\":true}\n", "utf8");
  writeFileSync(join(root, ".cursor/hooks.json"), JSON.stringify({
    version: 1,
    hooks: { stop: [{ command: "node other-hook.js" }] },
  }), "utf8");
  const first = installCursorHooks({ root, kernel });
  assert.equal(first.created, false);
  assert.ok(first.added.includes("preToolUse"));
  assert.equal(first.preservedOtherHooks, 1);
  const second = installCursorHooks({ root, kernel });
  assert.equal(second.added.length, 0);
  assert.ok(second.alreadyPresent.includes("preToolUse"));
  const hooks = JSON.parse(readFileSync(join(root, ".cursor/hooks.json"), "utf8"));
  assert.equal(hooks.hooks.stop.length, 1);
  assert.equal(hooks.hooks.stop[0].command, "node other-hook.js");
  assert.equal(hooks.hooks.preToolUse.filter((entry: { command: string }) => (entry.command.includes("cursor-hook.ts")||entry.command.includes("vitris-cursor-hook.js"))).length, 1);
  assert.equal(hooks.hooks.preToolUse[0].failClosed, false);
  assert.equal(readFileSync(join(root, ".cursor/mcp.json"), "utf8"), "{\"mcp\":true}\n");

  const removed = removeCursorHooks(root);
  assert.ok(removed.removed.includes("preToolUse"));
  const again = removeCursorHooks(root);
  assert.equal(again.removed.length, 0);
  const after = JSON.parse(readFileSync(join(root, ".cursor/hooks.json"), "utf8"));
  assert.equal(after.hooks.stop[0].command, "node other-hook.js");
  assert.equal(after.hooks.preToolUse, undefined);
});

test("hook install creates a file when none exists and recovers malformed JSON", () => {
  const created = temp();
  const fresh = installCursorHooks({ root: created, kernel });
  assert.equal(fresh.created, true);
  assert.ok(existsSync(join(created, ".cursor/hooks.json")));
  removeCursorHooks(created);
  removeCursorHooks(created);

  const broken = temp();
  mkdirSync(join(broken, ".cursor"), { recursive: true });
  writeFileSync(join(broken, ".cursor/hooks.json"), "{ not json", "utf8");
  const recovered = installCursorHooks({ root: broken, kernel });
  assert.equal(recovered.malformedBackup, ".cursor/hooks.json.malformed");
  assert.equal(readFileSync(join(broken, ".cursor/hooks.json.malformed"), "utf8"), "{ not json");
  const hooks = JSON.parse(readFileSync(join(broken, ".cursor/hooks.json"), "utf8"));
  assert.ok((hooks.hooks.beforeShellExecution[0].command.includes("cursor-hook.ts")||hooks.hooks.beforeShellExecution[0].command.includes("vitris-cursor-hook.js")));
  assert.ok(existsSync(join(broken, ".cursor/hooks.json.vitris-backup")));
});

test("permission hooks return allow responses and do not instruct the agent", () => {
  assert.deepEqual(hookResponseFor("preToolUse"), { permission: "allow" });
  assert.deepEqual(hookResponseFor("beforeShellExecution"), { permission: "allow" });
  assert.deepEqual(hookResponseFor("beforeMCPExecution"), { permission: "allow" });
  assert.deepEqual(hookResponseFor("beforeReadFile"), { permission: "allow" });
  assert.deepEqual(hookResponseFor("beforeSubmitPrompt"), { continue: true });
  assert.equal("agent_message" in hookResponseFor("preToolUse"), false);
  const root = temp();
  const result = runCursorHookProcess(root, { hook_event_name: "beforeShellExecution", command: "git status" });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { permission: "allow" });
  assert.doesNotMatch(result.stdout, /agent_message|additional_context/);
});

test("inactive trace writes no cursor events", () => {
  const root = temp();
  const result = handleCursorHook({
    root,
    payload: { hook_event_name: "preToolUse", tool_name: "Read", tool_use_id: "t1", tool_input: { path: "README.md" } },
  });
  assert.equal(result.wrote, false);
  assert.deepEqual(result.response, { permission: "allow" });
  assert.equal(existsSync(join(root, TRACE_DIR_REL)), false);
});

test("separate hook processes append distinct events to one trace", async () => {
  const { root, graph } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph, label: "procs" });
  const script = join(kernel, "scripts/cursor-hook.ts");
  const run = (id: string) => new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", script], { cwd: root, windowsHide: true });
    let stdout = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.on("error", reject);
    child.on("exit", code => {
      if (code !== 0) reject(new Error(`hook exit ${code}`));
      else {
        assert.equal(JSON.parse(stdout).permission, "allow");
        resolvePromise();
      }
    });
    child.stdin.end(JSON.stringify({
      hook_event_name: "preToolUse",
      tool_name: "Read",
      tool_use_id: id,
      tool_input: { path: `${id}.md` },
      conversation_id: "conv-shared",
    }));
  });
  await Promise.all([run("proc-a"), run("proc-b")]);
  const events = readCursorEvents(root, traceId);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => event.toolUseId).sort(), ["proc-a", "proc-b"]);
});

test("pre/post pairs by tool_use_id even when name and duration match", () => {
  const { root, graph } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph });
  writePrep(root, "prep-open", "business", new Date(Date.now() - 60_000).toISOString());
  for (const id of ["use-1", "use-2"]) {
    handleCursorHook({
      root,
      payload: { hook_event_name: "preToolUse", tool_name: "Read", tool_use_id: id, tool_input: { path: "onboarding/brief.json" }, duration: 15 },
    });
    handleCursorHook({
      root,
      payload: { hook_event_name: "postToolUse", tool_name: "Read", tool_use_id: id, tool_input: { path: "onboarding/brief.json" }, duration: 15, tool_output: "{\"ok\":true}" },
    });
  }
  handleCursorHook({
    root,
    payload: { hook_event_name: "postToolUse", tool_name: "Read", tool_use_id: "use-1", tool_input: { path: "onboarding/brief.json" }, duration: 15 },
  });
  const events = readCursorEvents(root, traceId);
  assert.equal(events.filter(event => event.toolUseId === "use-1").length, 3);
  const summary = buildTraceSummary(root, traceId);
  assert.equal(summary.cursorHooks.byPreparation["prep-open"]?.reads.count, 2);
  assert.ok((summary.cursorHooks.byPreparation["prep-open"]?.eventIds.length || 0) >= 2);
});

test("redacts secrets and omits prompt, file, and MCP bodies by default", () => {
  const syntheticToken = ["sk", "live", "secret123"].join("-");
  const syntheticBearer = ["super", "secret"].join("");
  const command = redactCommand(`API_KEY=${syntheticToken} node run.js https://example.com/a?token=abc Authorization: Bearer ${syntheticBearer}`);
  assert.match(command.text, /\[env\]/);
  assert.match(command.text, /\[query\]/);
  assert.match(command.text, /\[redacted\]/);
  assert.equal(command.text.includes(syntheticToken), false);
  assert.equal(command.text.includes(syntheticBearer), false);
  assert.doesNotMatch(command.text, /token=abc/);

  const { root, graph } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph });
  const email = "person@example.com";
  const prompt = "Please include the customer phone number 215-555-0100";
  handleCursorHook({
    root,
    payload: {
      hook_event_name: "beforeSubmitPrompt",
      prompt,
      user_email: email,
      conversation_id: "conv-raw-id",
      transcript_path: "C:/Users/person/.cursor/transcripts/abc.jsonl",
    },
  });
  handleCursorHook({
    root,
    payload: {
      hook_event_name: "beforeReadFile",
      file_path: join(root, "onboarding/copy/home.md"),
      content: "SECRET FILE BODY",
    },
  });
  handleCursorHook({
    root,
    payload: {
      hook_event_name: "afterFileEdit",
      file_path: join(root, "pages/secret.html"),
      edits: [{ old_string: "before-body", new_string: "after-body" }],
    },
  });
  handleCursorHook({
    root,
    payload: {
      hook_event_name: "beforeMCPExecution",
      tool_name: "search",
      mcp_server_name: "linear",
      tool_input: JSON.stringify({ query: "customer list", api_key: "secret-value" }),
      result_json: "{\"leaked\":true}",
    },
  });
  handleCursorHook({
    root,
    payload: { hook_event_name: "afterAgentThought", text: "hidden chain of thought", duration_ms: 10 },
  });
  handleCursorHook({
    root,
    payload: { hook_event_name: "afterAgentResponse", text: "The roof repair page is ready." },
  });
  const raw = readFileSync(join(root, TRACE_DIR_REL, traceId, CURSOR_EVENTS_FILE), "utf8");
  assert.doesNotMatch(raw, /SECRET FILE BODY|before-body|after-body|hidden chain of thought|person@example.com|secret-value|leaked|215-555-0100|conv-raw-id/);
  const events = readCursorEvents(root, traceId);
  const promptEvent = events.find(event => event.hookEvent === "beforeSubmitPrompt");
  assert.equal(promptEvent?.promptBytes, Buffer.byteLength(prompt));
  assert.equal(promptEvent?.promptHash, sha256Hex(prompt));
  assert.equal(promptEvent?.promptText, undefined);
  assert.equal(promptEvent?.conversationIdHash, sha256Hex("conv-raw-id"));
  assert.equal(promptEvent?.transcript?.present, true);
  assert.equal(promptEvent?.transcript?.coverage, "uninspected");
  assert.notEqual(promptEvent?.transcript?.pathHash, "C:/Users/person/.cursor/transcripts/abc.jsonl");
  const edit = events.find(event => event.hookEvent === "afterFileEdit");
  assert.equal(edit?.beforeHash, sha256Hex("before-body"));
  assert.equal(edit?.afterHash, sha256Hex("after-body"));
  const mcp = events.find(event => event.hookEvent === "beforeMCPExecution");
  assert.deepEqual(mcp?.argumentKeys, ["query", "[redacted-key]"]);
  assert.equal(events.some(event => event.hookEvent === "afterAgentThought"), false);
  const response = events.find(event => event.hookEvent === "afterAgentResponse");
  assert.equal(response?.responseBytes, Buffer.byteLength("The roof repair page is ready."));
  assert.equal(response?.responseHash, sha256Hex("The roof repair page is ready."));
});

test("truncation is marked and a torn final line is ignored", () => {
  const { root, graph } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph });
  const long = `node ${"A".repeat(500)}`;
  const event = sanitizeCursorHookPayload({
    root,
    traceId,
    payload: { hook_event_name: "beforeShellExecution", command: long },
  });
  assert.ok(event?.truncated?.includes("redactedCommand"));
  assert.ok((event?.redactedCommand?.length || 0) <= 240);
  const path = join(root, TRACE_DIR_REL, traceId, CURSOR_EVENTS_FILE);
  writeFileSync(path, JSON.stringify(event) + "\n{\"torn\":", "utf8");
  const events = readCursorEvents(root, traceId);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.integrityHash, event?.integrityHash);
});

test("hook events correlate only with the active preparation and stay inside their trace", () => {
  const { root, graph } = createTestSite();
  const traceA = startTraceSession({ root, kernel, graph, label: "a" });
  writePrep(root, "prep-a", "business", new Date(Date.now() - 60_000).toISOString());
  writePrep(root, "prep-closed", "media", new Date(Date.now() - 120_000).toISOString(), new Date(Date.now() - 90_000).toISOString());
  handleCursorHook({
    root,
    payload: { hook_event_name: "preToolUse", tool_name: "Grep", tool_use_id: "grep-a", tool_input: { pattern: "roof", path: "onboarding" } },
  });
  stopTraceSession(root);
  const traceB = startTraceSession({ root, kernel, graph, label: "b" });
  writePrep(root, "prep-b", "business-review", new Date(Date.now() - 30_000).toISOString());
  handleCursorHook({
    root,
    payload: { hook_event_name: "postToolUseFailure", tool_name: "Shell", tool_use_id: "shell-b", duration: 15, error_message: "exit 1", command: "npm test" },
  });
  const a = readCursorEvents(root, traceA.traceId);
  const b = readCursorEvents(root, traceB.traceId);
  assert.equal(a.length, 1);
  assert.equal(a[0]?.preparationId, "prep-a");
  assert.equal(a[0]?.nodeId, "business");
  assert.equal(b.length, 1);
  assert.equal(b[0]?.preparationId, "prep-b");
  assert.notEqual(a[0]?.traceId, b[0]?.traceId);
  const summaryA = buildTraceSummary(root, traceA.traceId);
  const summaryB = buildTraceSummary(root, traceB.traceId);
  assert.equal(summaryA.cursorHooks.eventCount, 1);
  assert.equal(summaryB.cursorHooks.eventCount, 1);
  assert.equal(summaryA.cursorHooks.byPreparation["prep-b"], undefined);
  assert.equal(summaryB.cursorHooks.byPreparation["prep-b"]?.shell.count, 1);
  assert.equal(summaryA.stages.some(stage => stage.preparationId === "prep-b"), false);
  const md = summaryB.cursorHooks.gaps.join("\n") + JSON.stringify(summaryB.cursorHooks);
  assert.match(md, /not a complete model transcript|shell/);
});

test("summaries keep kernel facts distinct from hook observations and file inference", async () => {
  const { root, graph, state } = createTestSite();
  const { traceId } = startTraceSession({ root, kernel, graph });
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "business" });
  assert.ok(prep.preparation);
  handleCursorHook({
    root,
    payload: {
      hook_event_name: "postToolUse",
      tool_name: "Write",
      tool_use_id: "write-1",
      duration: 20,
      tool_input: { path: "pages/outside.html" },
      tool_output: "ok",
    },
  });
  save(join(root, "onboarding/business.json"), sampleBusiness);
  const done = await completeStage({ root, kernel, graph, state, preparationId: prep.preparation.id });
  assert.equal(done.ok, true, done.failures.join("; "));
  const summary = buildTraceSummary(root, traceId);
  const stage = summary.stages.find(item => item.preparationId === prep.preparation?.id);
  assert.ok(stage);
  assert.equal(stage.promptFidelity, "verified");
  assert.equal(stage.result, "ok");
  assert.ok(stage.evidence.some(item => item.visibility === "observed_by_kernel"));
  assert.ok(stage.evidence.some(item => item.visibility === "inferred_from_file_changes"));
  assert.ok(stage.evidence.some(item => item.visibility === "observed_by_cursor_hook"));
  assert.equal(stage.cursorActions?.writes.count, 1);
  assert.deepEqual(stage.cursorActions?.outsideExpectedWrites, ["pages/outside.html"]);
  assert.equal(summary.agentTokens, "unknown");
  assert.match(summary.cursorHooks.gaps.join(" "), /not a complete model transcript/);
});

test("a failed hook log does not change workflow state, attempts, fingerprints, or evaluator results", async () => {
  const traced = createTestSite();
  const plain = createTestSite();
  const started = startTraceSession({ root: traced.root, kernel, graph: traced.graph });
  const traceDir = join(traced.root, TRACE_DIR_REL, started.traceId);
  mkdirSync(traceDir, { recursive: true });
  mkdirSync(join(traceDir, CURSOR_EVENTS_FILE));
  const blocked = handleCursorHook({
    root: traced.root,
    payload: { hook_event_name: "preToolUse", tool_name: "Read", tool_use_id: "x", tool_input: { path: "launch.json" } },
  });
  assert.equal(blocked.wrote, false);
  assert.deepEqual(blocked.response, { permission: "allow" });
  assert.ok((loadManifest(traced.root, started.traceId)?.warnings || []).some(warning => warning.kind === "cursor_hook"));

  const before = fingerprint(traced.root, SOURCE_PATHS);
  const tracedPrep = await prepareStage({ root: traced.root, kernel, graph: traced.graph, state: traced.state, nodeId: "business" });
  const plainPrep = await prepareStage({ root: plain.root, kernel, graph: plain.graph, state: plain.state, nodeId: "business" });
  save(join(traced.root, "onboarding/business.json"), sampleBusiness);
  save(join(plain.root, "onboarding/business.json"), sampleBusiness);
  const tracedDone = await completeStage({ root: traced.root, kernel, graph: traced.graph, state: traced.state, preparationId: tracedPrep.preparation!.id });
  const plainDone = await completeStage({ root: plain.root, kernel, graph: plain.graph, state: plain.state, preparationId: plainPrep.preparation!.id });
  assert.equal(tracedDone.ok, plainDone.ok);
  assert.deepEqual(tracedDone.failures, plainDone.failures);
  assert.equal(traced.state.nodes.business?.status, plain.state.nodes.business?.status);
  assert.equal(traced.state.nodes.business?.attempts, plain.state.nodes.business?.attempts);
  assert.equal(fingerprint(traced.root, SOURCE_PATHS), before);
  assert.equal(fingerprint(traced.root, SOURCE_PATHS), fingerprint(plain.root, SOURCE_PATHS));
});

test("cleanup removes one trace and leaves hooks; hook removal leaves trace evidence", () => {
  const { root, graph } = createTestSite();
  installCursorHooks({ root, kernel });
  const { traceId } = startTraceSession({ root, kernel, graph });
  handleCursorHook({
    root,
    payload: { hook_event_name: "sessionStart", conversation_id: "conv", cursor_version: "3.21.13" },
  });
  const evidence = readFileSync(join(root, TRACE_DIR_REL, traceId, CURSOR_EVENTS_FILE), "utf8");
  removeCursorHooks(root);
  assert.equal(readFileSync(join(root, TRACE_DIR_REL, traceId, CURSOR_EVENTS_FILE), "utf8"), evidence);
  installCursorHooks({ root, kernel });
  const installed = readFileSync(join(root, ".cursor/hooks.json"), "utf8");
  cleanupTrace(root, traceId);
  assert.equal(existsSync(join(root, TRACE_DIR_REL, traceId)), false);
  assert.equal(readFileSync(join(root, ".cursor/hooks.json"), "utf8"), installed);
  assert.match(installed, /cursor-hook\.ts|vitris-cursor-hook\.js/);
});

test("public bundle skip still excludes agent/runs", () => {
  const source = readFileSync(join(kernel, "src/agent/design-bundle.ts"), "utf8");
  assert.match(source, /PUBLIC_SKIP/);
  assert.match(source, /\(runs\|run-history/);
});
