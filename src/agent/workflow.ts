import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fingerprint, json, save, SOURCE_PATHS } from "./artifacts.ts";
import { invalidate, parseGraphYaml, type AgentState, type CumulativeSpend, type GraphNode, type SkillGraph } from "./graph.ts";
import { applyArtDirectionGraph } from "./art-direction-policy.ts";
import { acquire, begin, contextPacket, finish, loadState, nextNode, reconcile, validateGraph } from "./runner.ts";
import { gradeAll, gradeNode } from "./grade.ts";
import { reviewSubject } from "./evaluate.ts";
import { ensurePreview } from "./preview.ts";
import { usageFromLog, writeUsageReceipt, loadUsageReceipt, parseStreamJsonUsage } from "./design-usage.ts";
import { readInvocations, reserveInvocation, settleInvocation, syncInvocationSpend } from "./invocation-budget.ts";
import { archiveQualityImageInvocation, fileSha256, QUALITY_PROBE_REL, qualitySubject, representativeCaptureHashes, writeVisualProbe } from "./design-quality.ts";
import { beginChange, classifyChangeAsync, consumeRefinePending, loadChangeRequest, mergeImplementationReason, regressionFailures, restoreUnchangedLayout, summarizeRefine, updateSiteMemory, writeRefineReport, affectedNodeIds, START_NODE } from "./refine.ts";
import { generateResultManifest, writeResultManifest } from "./result-manifest.ts";
import { jevClientRequired, loadJevConfig } from "./jev/config.ts";
import { kernelScriptCommand } from "./kernel-commands.ts";
import { JevClient } from "./jev/client.ts";
import { buildCompactContextPacket, isCompactSupportedNode } from "./jev/packets.ts";
import { buildRepairPacket } from "./jev/repair.ts";
import { runSemanticGroundingPreflight, formatPreflightSummary } from "./jev/review.ts";
import type { JevConfig, JevMode, JevTransport } from "./jev/types.ts";
import { ensureWorkflowConfig, loadWorkflowConfig, enforceActiveAgentMode } from "./workflow-config.ts";
import { prepareStage, completeStage, executeToolStage } from "./lifecycle.ts";
import { findActivePreparation, recoverCommitJournal, type StagePreparation } from "./preparation.ts";
import { dispatchTraceCli, maybeStartTraceFromArgv } from "./trace.ts";

export const SHARED_TRUNK_NODES = ["harvest", "business", "business-review", "media"] as const;
export const CAPTURE_PATHS = ["onboarding/brief.json", "onboarding/raw", "media/harvest", "agent/request-history"];
export const PROTECTED_SOURCE_PATHS = [...SOURCE_PATHS, "artwork", "onboarding", "dist", "agent/screenshots", "agent/reviews/browser.json", "agent/reviews/representative-browser.json", "agent/graph.yaml", "agent/PROMPT.md", "agent/refs", "agent/requests", "agent/request-history", "agent/change-request.json", "agent/request.json", "agent/site-memory.json", "agent/site-memory-history", "agent/creative-identity.json"];
export type AdapterConfig = {
  command: string;
  args: string[];
  prompt: "stdin" | "argument";
  model?: string;
  maxTokensPerCall?: number;
  author?: { command: string; args: string[]; prompt: "stdin" | "argument"; model?: string };
  reviewer?: { command: string; args: string[]; prompt: "stdin" | "argument"; model?: string };
};
export type WorkflowOptions = {
  root: string;
  kernel: string;
  argv?: string[];
  max?: number;
  maxCumulative?: number;
  maxCumulativeTokens?: number;
  maxCumulativeDurationMs?: number;
  timeout?: number;
  stopWhen?: (state: AgentState, graph: SkillGraph) => boolean;
  skipLock?: boolean;
  includeOptional?: boolean;
  noPreviewServer?: boolean;
  /** Keep every author and critic objective in the current session, even with a reviewer adapter installed. */
  activeAgentOnly?: boolean;
  log?: (message: string) => void;
  onLog?: (message: string) => void;
  signal?: AbortSignal;
  jevMode?: JevMode;
  jevConfig?: JevConfig;
  compactPackets?: boolean;
  jevClient?: JevClient;
  jevFetch?: JevTransport;
  testStageExecutor?: (opts: { stage: GraphNode; prep: StagePreparation; prompt: string; root?: string; outputPath?: string }) => Promise<void>;
};
export type WorkflowResult = { state: AgentState; graph: SkillGraph; exitCode: number };

export function argFrom(argv: string[], key: string): string | undefined {
  const i = argv.indexOf(key);
  return i < 0 ? undefined : argv[i + 1];
}
export function hasFlag(argv: string[], key: string): boolean {
  return argv.includes(key);
}
const CHILD_WORKFLOW_SKIP = new Set([
  "--variants", "--design-run", "--resume", "--status", "--print-status",
  "--review", "--promote", "--feedback", "--restart-from", "--reason", "--theme",
  "--theme-scope", "--concept-preview", "--continue-from-concept-preview", "--public-bundle",
  "--creative-profile", "--creative-run", "--creative-new", "--creative-retry",
]);
const CHILD_WORKFLOW_SKIP_VALUES = new Set([
  "--variants", "--design-run", "--feedback", "--restart-from", "--reason", "--theme",
  "--theme-scope", "--public-bundle",
  "--creative-run",
]);
/** Strip coordinator flags so a child site cannot mint a new theme/restart budget. */
export function childWorkflowArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (CHILD_WORKFLOW_SKIP.has(flag)) {
      if (CHILD_WORKFLOW_SKIP_VALUES.has(flag)) i++;
      continue;
    }
    out.push(flag);
  }
  return out;
}
export function loadAdapter(root: string, role: "author" | "reviewer" = "author"): AdapterConfig {
  const configPath = join(root, "agent/adapter.json");
  const reviewerPath = join(root, "agent/adapter.reviewer.json");
  const base: AdapterConfig = existsSync(configPath)
    ? json<AdapterConfig>(configPath)
    : { command: "active-agent", args: [], prompt: "stdin" };
  if (role === "reviewer") {
    if (existsSync(reviewerPath)) {
      const overlay = json<AdapterConfig>(reviewerPath);
      return { command: overlay.command, args: overlay.args, prompt: overlay.prompt || base.prompt, model: overlay.model, maxTokensPerCall: overlay.maxTokensPerCall };
    }
    if (base.reviewer) return { command: base.reviewer.command, args: base.reviewer.args, prompt: base.reviewer.prompt, model: base.reviewer.model };
  }
  if (role === "author" && base.author) return { command: base.author.command, args: base.author.args, prompt: base.author.prompt, model: base.author.model };
  return { command: base.command, args: base.args, prompt: base.prompt || "stdin", model: base.model };
}
export function sharedTrunkComplete(state: AgentState): boolean {
  return SHARED_TRUNK_NODES.every(id => state.nodes[id]?.status === "done");
}
export function loadSiteGraph(root: string): SkillGraph {
  const graph = parseGraphYaml(readFileSync(join(root, "agent/graph.yaml"), "utf8"));
  validateGraph(graph);
  const ids = new Set(graph.nodes.map(n => n.id));
  const fullKit = ids.has("harvest") && ids.has("direction") && ids.has("pages") && ids.has("preview") && ids.has("launch");
  if (fullKit && (graph.version < 3 || !ids.has("narrative") || !ids.has("reference-analysis") || !ids.has("representative-quality"))) {
    throw new Error("This site's agent kit is workflow v" + graph.version + ". Run `npm run refresh-agent -- --site .` to migrate to v3. launch.json, adapter config, and request history are preserved; previous STATE is backed up. New narrative, reference-analysis, and representative-quality gates start pending and are not inferred from old progress.");
  }
  if (existsSync(join(root, "agent/creative-identity.json"))) for (const node of graph.nodes) if (["pages", "visual-review", "content-review", "browser"].includes(node.id)) {
    node.optionalInputs = [...new Set([...(node.optionalInputs || []), "agent/creative-identity.json"])];
  }
  return applyArtDirectionGraph(root, graph);
}
export function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {}
  } else {
    try {
      process.kill(-pid, "SIGTERM");
      setTimeout(() => {
        try { process.kill(-pid, "SIGKILL"); } catch {}
      }, 1000);
    } catch {
      try { process.kill(pid, "SIGTERM"); } catch {}
    }
  }
}

export async function spawnAdapterProcess(opts: {
  maxTokens?: number;
  command: string;
  args: string[];
  cwd: string;
  input?: string;
  env: NodeJS.ProcessEnv;
  timeout: number;
  outputPath: string;
  signal?: AbortSignal;
}): Promise<{ status: number | null; error?: string; signal?: string | null; timedOut?: boolean; aborted?: boolean }> {
  mkdirSync(join(opts.cwd, "agent/runs"), { recursive: true });

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let completed = false;
    let timedOut = false;
    let aborted = false;
    let budgetStopped = false;
    let timeoutTimer: NodeJS.Timeout | undefined;

    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: { ...opts.env, VITRIS_ADAPTER_LOG: opts.outputPath },
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (opts.signal && abortHandler) {
        opts.signal.removeEventListener("abort", abortHandler);
      }
    };

    const flushOutput = () => {
      try {
        writeFileSync(opts.outputPath, stdout + (stdout && stderr && !stdout.endsWith("\n") ? "\n" : "") + stderr);
      } catch {}
    };

    const abortHandler = () => {
      if (completed) return;
      aborted = true;
      if (child.pid) killProcessTree(child.pid);
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        abortHandler();
      } else {
        opts.signal.addEventListener("abort", abortHandler, { once: true });
      }
    }

    if (opts.timeout > 0 && Number.isFinite(opts.timeout)) {
      timeoutTimer = setTimeout(() => {
        if (completed) return;
        timedOut = true;
        if (child.pid) killProcessTree(child.pid);
      }, opts.timeout);
    }

    if (child.stdin) {
      if (opts.input !== undefined) {
        child.stdin.end(opts.input, "utf8");
      } else {
        child.stdin.end();
      }
    }

    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (opts.maxTokens !== undefined && !budgetStopped) {
          const usage = parseStreamJsonUsage(stdout);
          if (Math.max(usage.totalTokens || 0, (usage.inputTokens || 0) + (usage.outputTokens || 0)) >= opts.maxTokens) {
            budgetStopped = true;
            if (child.pid) killProcessTree(child.pid);
          }
        }
      });
    }

    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
    }

    child.on("error", (err) => {
      if (completed) return;
      completed = true;
      cleanup();
      flushOutput();
      resolve({ status: null, error: err.message, signal: null, timedOut, aborted });
    });

    child.on("close", (code, sig) => {
      if (completed) return;
      completed = true;
      cleanup();
      flushOutput();
      resolve({ status: budgetStopped ? 1 : code, error: budgetStopped ? "Reviewer token reservation reached" : timedOut ? "Process timed out" : aborted ? "Aborted by signal" : undefined, signal: sig, timedOut, aborted });
    });
  });
}

export async function invokeAdapter(opts: {
  maxTokens?: number;
  cwd: string;
  adapter: AdapterConfig;
  nodeId: string;
  prompt: string;
  timeout: number;
  runnerPid: number;
  outputPath: string;
  signal?: AbortSignal;
}): Promise<{ status: number | null; error?: string; signal?: string | null; durationMs: number }> {
  const args = [...opts.adapter.args, ...(opts.adapter.prompt === "argument" ? [opts.prompt] : [])];
  const started = Date.now();
  const run = await spawnAdapterProcess({
    command: opts.adapter.command,
    args,
    cwd: opts.cwd,
    input: opts.adapter.prompt === "stdin" ? opts.prompt : undefined,
    env: { ...process.env, VITRIS_WORKER_NODE: opts.nodeId, VITRIS_RUNNER_PID: String(opts.runnerPid) },
    timeout: opts.timeout,
    outputPath: opts.outputPath,
    signal: opts.signal,
    maxTokens: opts.maxTokens,
  });
  const durationMs = Date.now() - started;
  const timedOut = run.timedOut || run.error?.includes("TIMEDOUT") || run.signal === "SIGTERM";
  writeUsageReceipt(opts.outputPath.replace(/\.log$/, ".usage.json"), usageFromLog({
    adapter: opts.adapter, nodeId: opts.nodeId, role: /review|critic|quality/i.test(opts.nodeId) ? "reviewer" : "author",
    outputPath: opts.outputPath, durationMs, startedAt: new Date(started).toISOString(),
    status: run.status, signal: run.signal, timedOut,
  }));
  return { status: run.status, error: run.error, signal: run.signal, durationMs };
}

async function invokeConfiguredQualityReviewer(opts: {
  root: string;
  kernel: string;
  node: GraphNode;
  preparation: StagePreparation;
  timeout: number;
  runnerPid: number;
  signal?: AbortSignal;
  state: AgentState;
  totalTokenLimit?: number;
}): Promise<{ ok: boolean; error?: string; invocationId?: string }> {
  const adapter = loadAdapter(opts.root, "reviewer");
  if (adapter.command === "active-agent") return { ok: false, error: "No independent reviewer adapter configured" };
  if (!/codex(?:\.exe)?$/i.test(adapter.command)) return { ok: false, error: "Configured reviewer image-input protocol is unsupported" };
  const captures = representativeCaptureHashes(opts.root);
  if (!captures.length) return { ok: false, error: "No production representative PNG captures" };
  const inputs = [{ path: QUALITY_PROBE_REL, hash: fileSha256(join(opts.root, QUALITY_PROBE_REL)) }, ...captures];
  const imageArgs = inputs.map(input => input.path);
  const dashIndex = adapter.args.lastIndexOf("-");
  if (dashIndex < 0) return { ok: false, error: "Codex reviewer adapter must read its prompt from stdin" };
  const args = [...adapter.args];
  args.splice(dashIndex, 0, "-i", ...imageArgs);
  const prompt = enrichPrompt(opts.root, opts.kernel, opts.node, readFileSync(join(opts.root, "agent/CURRENT.md"), "utf8"))
    + `\nThe runner attached these exact production PNGs with CLI -i: ${JSON.stringify(inputs)}. Inspect each image. The probe is a small solid color swatch; report its approximate six-digit hex color without reading calibration constants from source. This probe tests visual access, not pixel-perfect color naming. Do not claim unobserved screenshot details. Write only the permitted quality review JSON; the runner owns completion and receipts.\n`;
  const maxTokens = adapter.maxTokensPerCall ?? 250000;
  const priorCalls = readInvocations(opts.root).filter(row => row.nodeId === opts.node.id).length;
  if (priorCalls - (opts.state.nodes[opts.node.id]?.invocationBaseline || 0) >= opts.node.maxAttempts) throw new Error(`Reviewer ${opts.node.id} exhausted its invocation attempts, including failed or interrupted calls`);
  if (opts.totalTokenLimit !== undefined && opts.state.cumulativeSpend?.hasUnmeteredStages) {
    throw new Error("Cannot enforce a total token budget with unmetered active-agent stages. Supply trustworthy host usage or use a reviewer-only reservation without claiming a total-cost cap.");
  }
  const otherTokens = (opts.state.cumulativeSpend?.inputTokens || 0) + (opts.state.cumulativeSpend?.outputTokens || 0) + (opts.state.cumulativeSpend?.jevInputTokens || 0) + (opts.state.cumulativeSpend?.jevOutputTokens || 0);
  const invocation = reserveInvocation({ root: opts.root, preparationId: opts.preparation.id, nodeId: opts.node.id, maxTokens, totalTokenLimit: opts.totalTokenLimit, otherTokens });
  const outputPath = join(opts.root, "agent/runs", `${opts.preparation.id}-reviewer.log`);
  const run = await invokeAdapter({
    cwd: opts.root, adapter: { ...adapter, args }, nodeId: opts.node.id, prompt,
    timeout: opts.timeout, runnerPid: opts.runnerPid, outputPath, signal: opts.signal, maxTokens,
  });
  const receipt = loadUsageReceipt(outputPath.replace(/\.log$/, ".usage.json"));
  if (!receipt) throw new Error("Reviewer returned without a usage receipt; reservation remains held");
  settleInvocation(opts.root, invocation.id, receipt);
  syncInvocationSpend(opts.root, opts.state);
  if (run.status !== 0) return { ok: false, error: run.error || `Reviewer CLI exit ${run.status}`, invocationId: invocation.id };
  for (const input of inputs) {
    if (fileSha256(join(opts.root, input.path)) !== input.hash) return { ok: false, error: `Reviewer image changed during invocation: ${input.path}`, invocationId: invocation.id };
  }
  archiveQualityImageInvocation(opts.root, outputPath, {
    command: adapter.command, args, status: run.status,
    promptHash: createHash("sha256").update(prompt).digest("hex"),
    subjectHash: qualitySubject(opts.root), imageInputs: inputs,
  });
  return { ok: true, invocationId: invocation.id };
}

function enrichPrompt(root: string, kernel: string, node: { id: string; kind?: string; eval: string }, base: string): string {
  let prompt = base;
  prompt += `\nHarness directory: ${kernel}\n`;
  const evalCommand = kernelScriptCommand(kernel, "scripts/eval-site.ts");
  prompt += `Evaluate this node with the exact portable command: ${evalCommand} --site . --node ${node.eval} --json\nFor a review hash, use the same command with --subject instead of --json. Prefer these Node commands over shell-specific npm argument forwarding.\n`;
  prompt += `For artifact fingerprints, use: ${evalCommand} --site . --hash RELATIVE_PATH [--hash ANOTHER_PATH]. This avoids platform-specific module imports.\n`;
  const requestPath = join(root, `agent/requests/${node.id}.json`);
  if (existsSync(requestPath)) prompt += `\nOperator change request for this stage:\n${readFileSync(requestPath, "utf8")}\nApply only changes within this node. Keep originalRequest verbatim. Expand proposedChanges into concrete edits before changing source. Record implementationReason, likes, dislikes, and preserve items in this request file. For factual changes cite its immutable evidencePath, not the mutable latest-request pointer. Never invent missing details.\n`;
  const memoryPath = join(root, "agent/site-memory.json");
  if (existsSync(memoryPath) && ["business", "copy", "direction", "storyboard", "representative", "pages", "content-review", "visual-review"].includes(node.id)) {
    prompt += `\nCurrent website memory (distinguish current decisions from superseded history):\n${readFileSync(memoryPath, "utf8")}\nDo not revive superseded experiments. Honor preserve preferences.\n`;
  }
  const refineSkill = join(root, "agent/refs/refine.md");
  if (existsSync(join(root, "agent/change-request.json")) && existsSync(refineSkill)) {
    prompt += `\n## Skill: refine\n${readFileSync(refineSkill, "utf8")}\n`;
  }
  if (node.kind === "critic") prompt += `\nReview subjectHash: ${reviewSubject(root, node.id)}\nWrite agent/reviews/${node.id}.json. Review only; do not repair source or mark STATE.\n`;
  if (node.kind === "critic" && ["direction-review", "representative-review", "representative-quality", "visual-review"].includes(node.id) && existsSync(join(root, "agent/request.json"))) {
    const theme = json<{ theme?: string }>(join(root, "agent/request.json")).theme;
    if (theme?.trim()) prompt += `\nExplicit operator theme constraint:\n${theme}\nCompare the rendered design with this request as well as its internal coherence. A coherent design that ignores the requested theme does not pass. Distinguish your preference from adherence to the request.\n`;
  }
  const assignedPath = join(root, "agent/assigned-direction.json");
  if (existsSync(assignedPath) && ["direction", "direction-review", "storyboard", "copy", "representative", "pages", "visual-review", "representative-quality"].includes(node.id)) {
    prompt += `\nAssigned direction (do not independently pick a different winner):\n${readFileSync(assignedPath, "utf8")}\nElaborate and implement this assigned brief. Diversity among other variants is handled by the parent design-run coordinator.\n`;
  }
  const creativeIdentityPath = join(root, "agent/creative-identity.json");
  if (existsSync(creativeIdentityPath) && ["copy", "pages", "visual-review", "content-review", "browser"].includes(node.id)) {
    prompt += `\nSelected creative identity (source-bound self-review; inspect actual expanded pages):\n${readFileSync(creativeIdentityPath, "utf8")}\nPreserve these invariants across pages, or record a justified departure in the final review. Do not treat this decision as proof of human preference.\n`;
  }
  const synthesisPath = join(root, "onboarding/synthesis-plan.json");
  if (existsSync(synthesisPath) && ["storyboard", "copy", "copy-review", "representative", "pages", "visual-review", "content-review", "representative-quality"].includes(node.id)) {
    prompt += `\nSynthesis plan (explicit operator-authorized design intent):\n${readFileSync(synthesisPath, "utf8")}\nFollow this plan. Translate donor composition into the selected global theme. Do not copy a donor stylesheet wholesale or invent missing business facts.\n`;
  }
  return prompt;
}

export async function runWorkflow(opts: WorkflowOptions): Promise<WorkflowResult> {
  const workflowStartedAt = Date.now();
  const argv = opts.argv || process.argv;
  const root = opts.root, kernel = opts.kernel;
  const log = opts.onLog || opts.log || console.log;
  let release = () => {};
  let graph = loadSiteGraph(root);
  let state = loadState(root, graph);
  state.cumulativeSpend ||= { iterations: 0, calls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };
  state.consecutiveFailures ||= {};
  let exitCode = 0;

  try {
    // Unconditionally reject external model worker modes
    if (hasFlag(argv, "--legacy-worker") || hasFlag(argv, "--worker") || Boolean(process.env.VITRIS_LEGACY_WORKER)) {
      throw new Error("External model worker mode (--legacy-worker, --worker, VITRIS_LEGACY_WORKER) is not supported. Vitris runs strictly in active-agent mode.");
    }

    const traceCli = dispatchTraceCli({ root, kernel, graph, argv, log });
    if (traceCli.handled) {
      return { state, graph, exitCode: traceCli.exitCode };
    }
    maybeStartTraceFromArgv({ root, kernel, graph, argv, log });

    ensureWorkflowConfig(root);
    enforceActiveAgentMode(loadWorkflowConfig(root));

    const max = opts.max ?? Number(argFrom(argv, "--max") || 40);
    const maxCumulative = opts.maxCumulative ?? Number(argFrom(argv, "--max-cumulative") || state.limits?.iterations || 60);
    const maxCumulativeTokens = opts.maxCumulativeTokens ?? (argFrom(argv, "--max-cumulative-tokens") ? Number(argFrom(argv, "--max-cumulative-tokens")) : state.limits?.tokens);
    const maxCumulativeDurationMs = opts.maxCumulativeDurationMs ?? (argFrom(argv, "--max-cumulative-duration-ms") ? Number(argFrom(argv, "--max-cumulative-duration-ms")) : state.limits?.durationMs);
    const timeout = opts.timeout ?? Number(argFrom(argv, "--timeout-ms") || 1200000);
    if (!Number.isInteger(max) || max < 1 || !Number.isFinite(timeout) || timeout < 1000) throw new Error("Invalid iteration/time budget");
    for (const limit of [maxCumulative, maxCumulativeTokens, maxCumulativeDurationMs]) {
      if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error("Invalid cumulative budget");
    }
    const limits = { iterations: maxCumulative, tokens: maxCumulativeTokens, durationMs: maxCumulativeDurationMs };
    if (state.limits && JSON.stringify(state.limits) !== JSON.stringify(JSON.parse(JSON.stringify(limits))) && !argFrom(argv, "--reason")) throw new Error("Changing persisted budget limits requires --reason; ordinary resume preserves the original limits");
    const priorLimits = state.limits;
    mkdirSync(join(root, "agent/runs"), { recursive: true });

    // Startup journal recovery BEFORE state reconciliation
    const recovery = recoverCommitJournal(root, graph);
    if (recovery.recovered) {
      state = loadState(root, graph);
    }

    if ((hasFlag(argv, "--status") || hasFlag(argv, "--print-status")) && existsSync(join(root, "agent/RUN.lock"))) {
      const lock = json<{ pid: number }>(join(root, "agent/RUN.lock"));
      let active = false;
      try { process.kill(lock.pid, 0); active = true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      if (active) {
        log(JSON.stringify({ ...loadState(root, graph), running: { pid: lock.pid, snapshot: true } }, null, 2));
        return { state: loadState(root, graph), graph, exitCode: 0 };
      }
    }
    release = opts.skipLock ? () => {} : acquire(root);
    if (priorLimits && JSON.stringify(priorLimits) !== JSON.stringify(JSON.parse(JSON.stringify(limits)))) save(join(root, "agent/run-history", `${Date.now()}-budget-change.json`), { priorLimits, limits, reason: argFrom(argv, "--reason") });
    state.limits = limits;
    reconcile(root, graph, state);
    if (state.preview_ready) {
      const failed = gradeAll(root).find(r => !r.ok);
      const stale = failed && graph.nodes.find(n => n.eval === failed.node);
      if (stale && failed) {
        const repairTarget = stale.kind === "tool" ? stale.id : (stale.repair || stale.id);
        invalidate(graph, state, repairTarget);
        state.nodes[stale.id]!.failures = failed.failures;
      }
    }
    if (argFrom(argv, "--restart-from")) {
      const target = argFrom(argv, "--restart-from")!;
      if (!graph.nodes.some(n => n.id === target) || !argFrom(argv, "--reason")) throw new Error("restart-from needs a valid node and --reason explaining the new attempt budget");
      save(join(root, "agent/run-history", `${Date.now()}-before-restart.json`), { reason: argFrom(argv, "--reason"), state });
      invalidate(graph, state, target);
      const affected = new Set(affectedNodeIds(graph, target));
      affected.add(target);
      for (const id of affected) if (state.nodes[id]) {
        state.nodes[id]!.attempts = 0;
        state.nodes[id]!.invocationBaseline = readInvocations(root).filter(row => row.nodeId === id).length;
      }
      for (const key of Object.keys(state.consecutiveFailures || {})) if (affected.has(key.split(":")[0]!)) delete state.consecutiveFailures![key];
    }
    if (argFrom(argv, "--theme") && !hasFlag(argv, "--variants") && !argFrom(argv, "--design-run")) {
      save(join(root, "agent/request.json"), { mode: "restyle", theme: argFrom(argv, "--theme") });
      invalidate(graph, state, "direction");
      for (const st of Object.values(state.nodes)) if (st.status === "pending") st.attempts = 0;
    }
    const jevConfig = opts.jevConfig ? structuredClone(opts.jevConfig) : loadJevConfig(root, argv);
    if (opts.jevMode) jevConfig.mode = opts.jevMode;
    if (opts.compactPackets !== undefined) jevConfig.compactPackets = opts.compactPackets;
    let jevClient = opts.jevClient;
    if (!jevClient && (jevConfig.mode !== "off" || jevClientRequired(jevConfig))) {
      try {
        jevClient = new JevClient({ root, config: jevConfig, fetch: opts.jevFetch });
      } catch (error) {
        const jevClientError = error instanceof Error ? error.message : String(error);
        log(`Jev client unavailable: ${jevClientError}. The active agent keeps the stage.`);
      }
    }
    state.cumulativeSpend ||= { iterations: 0, calls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };
    const initialJevCalls = state.cumulativeSpend.jevCalls || 0;
    const initialJevInputTokens = state.cumulativeSpend.jevInputTokens || 0;
    const initialJevOutputTokens = state.cumulativeSpend.jevOutputTokens || 0;

    if (argFrom(argv, "--change")) {
      const instruction = argFrom(argv, "--change") || "";
      const scopeFlag = argFrom(argv, "--change-scope");
      let classified: any = undefined;
      if (jevConfig.mode !== "off" && jevClient) {
        classified = await classifyChangeAsync(instruction, {
          root,
          client: jevClient,
          mode: jevConfig.mode,
          overrideScope: scopeFlag && scopeFlag !== "auto" ? (scopeFlag as any) : undefined,
          threshold: jevConfig.confidenceThresholds.routing,
          signal: opts.signal,
        });
      }
      const request = beginChange({
        root,
        graph,
        state,
        instruction,
        scopeFlag,
        classified,
      });
      const skip = new Set<string>();
      const scopesToSkip = request.scopes && request.scopes.length > 0 ? request.scopes : [request.scope];
      for (const s of scopesToSkip) {
        for (const id of affectedNodeIds(graph, START_NODE[s])) {
          skip.add(id);
        }
      }
      if (request.affectedNodes) {
        for (const id of request.affectedNodes) {
          skip.add(id);
        }
      }
      for (const node of graph.nodes) {
        if (skip.has(node.id) || node.optional) continue;
        if (state.nodes[node.id]?.status === "done") continue;
        if (!node.needs.every(id => state.nodes[id]?.status === "done")) continue;
        const graded = gradeNode(root, node.eval);
        if (!graded.ok) continue;
        begin(root, graph, state, node);
        finish(root, graph, state, node, []);
      }
    }
    save(join(root, "agent/STATE.json"), state);
    if (hasFlag(argv, "--status") || hasFlag(argv, "--print-status")) {
      log(JSON.stringify(state, null, 2));
      return { state, graph, exitCode: 0 };
    }
    const includeOptional = opts.includeOptional ?? hasFlag(argv, "--include-launch");
    for (let i = 0; i < max; i++) {
      syncInvocationSpend(root, state);
      if (opts.signal?.aborted) {
        log("ABORTED:signal");
        state.status = "canceled";
        save(join(root, "agent/STATE.json"), state);
        exitCode = 6;
        break;
      }
      state.cumulativeSpend ||= { iterations: 0, calls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };
      if (jevClient) {
        const jSpend = jevClient.getSessionUsage();
        state.cumulativeSpend.jevCalls = initialJevCalls + jSpend.calls;
        state.cumulativeSpend.jevInputTokens = initialJevInputTokens + jSpend.inputTokens;
        state.cumulativeSpend.jevOutputTokens = initialJevOutputTokens + jSpend.outputTokens;
      }
      const tokensUsed =
        (state.cumulativeSpend.inputTokens || 0) +
        (state.cumulativeSpend.outputTokens || 0) +
        (state.cumulativeSpend.jevInputTokens || 0) +
        (state.cumulativeSpend.jevOutputTokens || 0) +
        (state.cumulativeSpend.reviewer?.tokens || 0);
      const budgetExhausted =
        state.cumulativeSpend.iterations >= maxCumulative ||
        (maxCumulativeTokens !== undefined && tokensUsed >= maxCumulativeTokens) ||
        (maxCumulativeDurationMs !== undefined && state.cumulativeSpend.durationMs >= maxCumulativeDurationMs);

      if (budgetExhausted && !hasFlag(argv, "--complete")) {
        log("STOPPED:budget_exhausted");
        state.status = "budget_exhausted";
        save(join(root, "agent/STATE.json"), state);
        exitCode = 1;
        break;
      }
      if (maxCumulativeTokens !== undefined && (state.cumulativeSpend.hasUnmeteredStages || state.cumulativeSpend.reviewer?.unknownCalls || state.cumulativeSpend.reviewer?.reservedTokens) && !hasFlag(argv, "--complete")) {
        state.status = "budget_unavailable";
        save(join(root, "agent/STATE.json"), state);
        log("STOPPED:budget_unavailable (prior usage is unknown or an invocation remains unsettled)");
        exitCode = 1;
        break;
      }
      if (opts.stopWhen?.(state, graph)) {
        log("STOPPED:bounded_stage");
        break;
      }
      const node = nextNode(graph, state, { includeOptional });
      if (!node) {
        log(state.preview_ready ? "COMPLETE:preview_ready" : "No eligible node; inspect graph dependencies");
        break;
      }
      if (node.id === "representative-quality" && !existsSync(join(root, QUALITY_PROBE_REL))) {
        writeVisualProbe(join(root, "agent/reviews"));
      }
      if (hasFlag(argv, "--complete")) {
        const prepId = argFrom(argv, "--preparation");
        if (!prepId) {
          throw new Error("Missing --preparation <id> for stage completion. Stage completion requires an existing preparation ID.");
        }
        const requestedNode = argFrom(argv, "--node");

        const agentInputTokens = argFrom(argv, "--agent-input-tokens") ? Number(argFrom(argv, "--agent-input-tokens")) : undefined;
        const agentOutputTokens = argFrom(argv, "--agent-output-tokens") ? Number(argFrom(argv, "--agent-output-tokens")) : undefined;
        const receiptArg = argFrom(argv, "--agent-usage-receipt");
        if (receiptArg && (agentInputTokens !== undefined || agentOutputTokens !== undefined)) throw new Error("Use either --agent-usage-receipt or manual token flags");
        let agentUsage: { inputTokens?: number; outputTokens?: number; measured: boolean; rawEvidencePath?: string } | undefined = (agentInputTokens !== undefined || agentOutputTokens !== undefined)
          ? { inputTokens: agentInputTokens, outputTokens: agentOutputTokens, measured: false }
          : undefined;
        if (receiptArg) {
          const receiptPath = resolve(root, receiptArg);
          const receipt = json<{ schemaVersion?: number; source?: string; preparationId?: string; inputTokens?: number; outputTokens?: number }>(receiptPath);
          if (receipt.schemaVersion !== 1 || receipt.source !== "host_export" || receipt.preparationId !== prepId ||
              !Number.isInteger(receipt.inputTokens) || (receipt.inputTokens ?? -1) < 0 ||
              !Number.isInteger(receipt.outputTokens) || (receipt.outputTokens ?? -1) < 0) {
            throw new Error("Host usage receipt needs schemaVersion 1, source host_export, matching preparationId, and non-negative input/output tokens");
          }
          agentUsage = { inputTokens: receipt.inputTokens, outputTokens: receipt.outputTokens, measured: true, rawEvidencePath: receiptPath };
        }

        let visualToolEvents: Array<{ tool: string; path: string; success: boolean; hash?: string }> | undefined = undefined;
        const visualArg = argFrom(argv, "--visual-tool-events");
        if (visualArg) {
          try {
            const raw = existsSync(visualArg) ? readFileSync(visualArg, "utf8") : visualArg;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              visualToolEvents = parsed;
            }
          } catch {
            throw new Error("Invalid --visual-tool-events payload");
          }
        }

        const compResult = await completeStage({
          root,
          kernel,
          graph,
          state,
          preparationId: prepId,
          nodeId: requestedNode,
          agentUsage,
          visualToolEvents,
        });
        log(JSON.stringify({ ok: compResult.ok, nodeId: compResult.nodeId, failures: compResult.failures }));
        if (!compResult.ok) exitCode = 1;
        break;
      }

      if (hasFlag(argv, "--prepare")) {
        const requestedNode = argFrom(argv, "--node") || node.id;
        const prepResult = await prepareStage({
          root,
          kernel,
          graph,
          state,
          nodeId: requestedNode,
          includeOptional,
          jevConfig,
          jevClient,
          signal: opts.signal,
        });
        if (prepResult.status === "prepared" && prepResult.preparation) {
          log(`Prepared agent/CURRENT.md for ${prepResult.preparation.nodeId}`);
        } else if (prepResult.status === 'awaiting_user') {
          log(prepResult.instructions || 'Awaiting visual direction');
        } else if(prepResult.status==='repair_required') {
          log(prepResult.instructions || 'Continue the repaired authoring owner');
        } else {
          log(state.preview_ready ? "COMPLETE:preview_ready" : "No eligible node; inspect graph dependencies");
        }
        break;
      }

      // Deterministic tool stage: execute locally via executeToolStage without model adapter
      if (node.kind === "tool") {
        const toolResult = await executeToolStage({
          root,
          kernel,
          graph,
          state,
          node,
          timeoutMs: timeout,
          signal: opts.signal,
          injectedExecutor: opts.testStageExecutor
            ? async () => {
              await opts.testStageExecutor!({
                stage: node,
                prep: { id: `tool-${node.id}`, nodeId: node.id } as StagePreparation,
                prompt: node.id,
                root,
                outputPath: join(root, "agent/runs", `${node.id}.log`),
              });
            }
            : undefined,
        });
        log(`${toolResult.ok ? "PASS" : "FAIL"} ${node.id}${toolResult.failures.length ? " " + toolResult.failures.join("\n") : ""}`);
        if (!toolResult.ok) {
          if (opts.signal?.aborted) {
            log("ABORTED:signal");
            state.status = "canceled";
            save(join(root, "agent/STATE.json"), state);
            exitCode = 6;
            break;
          }
          exitCode = 1;
          break;
        }
        if (hasFlag(argv, "--once")) break;
        continue;
      }

      // Agent or critic stage: prepare stage and yield control to active agent
      const prepResult = await prepareStage({
        root,
        kernel,
        graph,
        state,
        nodeId: node.id,
        includeOptional,
        jevConfig,
        jevClient,
        signal: opts.signal,
      });
      if (prepResult.status === 'awaiting_user') { log(prepResult.instructions || 'Awaiting visual direction'); break; }
      if (prepResult.status === 'repair_required') { log(prepResult.instructions || 'Continue the repaired authoring owner'); continue; }
      if (prepResult.status === "prepared" && prepResult.preparation) {
        if (!opts.activeAgentOnly && node.id === "representative-quality" && existsSync(join(root, "agent/adapter.reviewer.json"))) {
          const reviewed = await invokeConfiguredQualityReviewer({
            root, kernel, node, preparation: prepResult.preparation, timeout,
            runnerPid: process.pid, signal: opts.signal, state, totalTokenLimit: maxCumulativeTokens,
          });
          if (!reviewed.ok) {
            log(`REVIEWER_FAILED: ${reviewed.error}`);
          }
          const completed = await completeStage({ root, kernel, graph, state, preparationId: prepResult.preparation.id, nodeId: node.id,
            invocationId: reviewed.invocationId, executionFailures: reviewed.ok ? [] : [`Reviewer invocation failed: ${reviewed.error}`],
          });
          log(`${completed.ok ? "PASS" : "FAIL"} ${node.id}${completed.failures.length ? " " + completed.failures.join("\n") : ""}`);
          if (!completed.ok) { exitCode = 1; break; }
          if (hasFlag(argv, "--once")) break;
          continue;
        }
        if (opts.testStageExecutor) {
          const promptPath = join(root, "agent/PROMPT.md");
          const prompt = existsSync(promptPath)
            ? readFileSync(promptPath, "utf8")
            : prepResult.preparation.id;
          const outputPath = join(root, "agent/runs", `${state.iteration}-${node.id}.log`);
          await opts.testStageExecutor({ stage: node, prep: prepResult.preparation, prompt, root, outputPath });
          const compResult = await completeStage({ root, kernel, graph, state, preparationId: prepResult.preparation.id, nodeId: node.id });
          if (!compResult.ok) {
            if (opts.signal?.aborted) {
              log("ABORTED:signal");
              state.status = "canceled";
              save(join(root, "agent/STATE.json"), state);
              exitCode = 6;
              break;
            }
            if (hasFlag(argv, "--once")) break;
            continue;
          }
          if (hasFlag(argv, "--once")) break;
          continue;
        }

        log(`PREPARED: ${node.id} (${prepResult.preparation.id})`);
        log(`Follow agent/CURRENT.md, then complete with: npm run go -- --complete --preparation ${prepResult.preparation.id}`);
        save(join(root, "agent/STATE.json"), state);
      }
      break;
    }
    const skipPreview = opts.noPreviewServer || hasFlag(argv, "--status") || hasFlag(argv, "--print-status") || hasFlag(argv, "--no-preview-server");
    if (state.preview_ready && existsSync(join(root, "agent/refine-pending.json")) && loadChangeRequest(root)) {
      const skippedLayoutRewrite = restoreUnchangedLayout(root, state);
      const failures = regressionFailures(root);
      const request = loadChangeRequest(root)!;
      if (failures.length > 0) {
        state.preview_ready = false;
        state.status = "refinement_blocked";
        save(join(root, "agent/STATE.json"), state);
        const report = writeRefineReport(root, { skippedLayoutRewrite, failures });
        log(summarizeRefine(root) || report.failures.join("\n"));
        exitCode = 4;
      } else {
        consumeRefinePending(root);
        updateSiteMemory(root, request, { implementationReason: request.implementationReason });
        const report = writeRefineReport(root, { skippedLayoutRewrite, failures: [] });
        log(summarizeRefine(root) || "Refinement recorded.");
      }
    }

    let localUrl: string | undefined;
    if (state.preview_ready && !skipPreview && existsSync(join(root, "dist/index.html"))) {
      try {
        localUrl = await ensurePreview(root, kernel);
        log(`Local preview: ${localUrl}`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
      }
    } else if (existsSync(join(root, "dist/index.html")) && !skipPreview) {
      try {
        localUrl = await ensurePreview(root, kernel);
      } catch {}
    }

    const manifest = generateResultManifest({
      root,
      state,
      graph,
      localUrl: state.preview_ready ? localUrl : undefined,
      provisionalUrl: !state.preview_ready ? localUrl : undefined,
      durationMs: Date.now() - workflowStartedAt,
    });
    writeResultManifest(root, manifest);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    exitCode = 1;
  } finally { release(); }
  return { state, graph, exitCode };
}
