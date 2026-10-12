import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ASSIST_QUALITY_PROFILE,
  COMPONENT_ASSIST_PROFILE,
  MATCHED_AB_COMPACT,
  inheritedJevState,
  kernelIdentity,
  kernelRevision,
  plannedJevCallsForProfile,
  profileFileConfig,
  snapshotHash,
  validateIsolatedSiteRoot,
  validateMatchedAbConfigs,
} from "./pilot-recipe.ts";
import {
  capabilitiesFullyOff,
  enabledJevCallers,
  exposeEffectiveConfig,
  loadJevConfig,
  mergeJevConfig,
  resolveEffectiveCapabilities,
  snapshotEffectiveConfig,
} from "./config.ts";
import type { JevConfig } from "./types.ts";
import { isPreviewReady, parseGraphYaml, type AgentState, type SkillGraph } from "../graph.ts";
import { json } from "../artifacts.ts";
import { allTasks, loadTaskExecution, verifyTaskExecution } from "./service-registry.ts";
import { QUALITY_TASK_SEMANTICS } from "./content-checks.ts";
import { COMPONENT_FIT_SEMANTICS_HASH, FIELD_SELECTION_SEMANTICS_HASH, GROUNDING_SEMANTICS_HASH } from "./questions.ts";

export const PILOT_TRIAL_MARKER = "agent/pilot-trial.json";
export const PILOT_PREPARE_MANIFEST = (arm: "A" | "B") => `agent/runs/arm-${arm}-prepare.json`;
export const PILOT_FINAL_MANIFEST = (arm: "A" | "B") => `agent/runs/arm-${arm}-execution.json`;

export type PilotArm = "A" | "B";
export type PilotProfileName = "assist-quality-matched-ab" | "assist-quality-plus-component-select";

export interface PilotTrialMarker {
  schemaVersion: 1;
  trialId: string;
  arm: PilotArm;
  profile: PilotProfileName;
  preparedAt: string;
  initialSnapshotHash: string;
  effectiveConfigHash: string;
  kernelRevision: string;
}

export function effectiveConfigHash(config: JevConfig): string {
  return createHash("sha256").update(JSON.stringify(exposeEffectiveConfig(config))).digest("hex");
}

export function capabilitiesMatchProfile(
  config: JevConfig,
  profile: { capabilities: JevConfig["capabilities"] },
): boolean {
  const got = resolveEffectiveCapabilities(config);
  const want = profile.capabilities || {};
  const keys = new Set([...Object.keys(got), ...Object.keys(want)]);
  for (const key of keys) {
    const a = (got as unknown as Record<string, string | undefined>)[key] || "off";
    const b = (want as unknown as Record<string, string | undefined>)[key] || "off";
    if (a !== b) return false;
  }
  return true;
}

export function loadTrialMarker(root: string): PilotTrialMarker | undefined {
  const path = join(root, PILOT_TRIAL_MARKER);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PilotTrialMarker;
  } catch {
    return undefined;
  }
}

function completedNodes(state: AgentState | undefined): string[] {
  if (!state?.nodes) return [];
  return Object.entries(state.nodes).filter(([, n]) => n.status === "done").map(([id]) => id);
}

function loadStateIfPresent(root: string): AgentState | undefined {
  const path = join(root, "agent/STATE.json");
  if (!existsSync(path)) return undefined;
  try {
    return json<AgentState>(path);
  } catch {
    return undefined;
  }
}

function loadGraphIfPresent(root: string): SkillGraph | undefined {
  const path = join(root, "agent/graph.yaml");
  if (!existsSync(path)) return undefined;
  try {
    return parseGraphYaml(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

export function resolvePilotConfig(opts: {
  root: string;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
}): { config: JevConfig; source: "cli" | "env" | "file" | "defaults"; note: string } {
  const argv = opts.argv || [];
  const env = opts.env || process.env;
  const cliMode = argv.includes("--jev-mode") ? argv[argv.indexOf("--jev-mode") + 1] : undefined;
  const envMode = env.VITRIS_JEV_MODE || env.JEV_MODE;
  const loaded = loadJevConfig(opts.root, argv);
  const source: "cli" | "env" | "file" | "defaults" = cliMode
    ? "cli"
    : envMode
      ? "env"
      : existsSync(join(opts.root, "agent/jev.json"))
        ? "file"
        : "defaults";
  return {
    config: loaded,
    source,
    note: "Precedence is CLI flags, then environment, then agent/jev.json, then kernel defaults. Pilot prepare writes the file after validating isolation.",
  };
}

export function activeAgentInstructions(opts: {
  root: string;
  arm: PilotArm;
  trialId: string;
  host: "cursor" | "other";
}): string[] {
  const cd = `cd ${opts.root}`;
  const hostNote = opts.host === "cursor"
    ? "Operate this arm in a dedicated Cursor chat/session. Do not call a Cursor API adapter; the kernel never invokes the host API."
    : "Operate this arm in a dedicated host session using the same site commands. Do not invent token numbers.";
  return [
    `Trial ${opts.trialId} Arm ${opts.arm}. ${hostNote}`,
    `${cd}`,
    "Loop until agent/STATE.json has preview_ready true:",
    "  npm.cmd run go -- --prepare",
    "  Perform the active node in agent/CURRENT.md (edit only allowed writes).",
    "  npm.cmd run go -- --complete --node <NODE>",
    "Stop at preview_ready. Do not run Arm C. Do not deploy.",
    "If the host cannot export measured usage, leave usage receipts unmeasured; finalize will mark measurement_incomplete.",
  ];
}

export function prepareArm(opts: {
  trialId: string;
  arm: PilotArm;
  root: string;
  kernel: string;
  peerRoot?: string;
  profileName?: PilotProfileName;
  argv?: string[];
  host?: "cursor" | "other";
  env?: NodeJS.ProcessEnv;
}): { ok: true; marker: PilotTrialMarker; instructions: string[]; preparePath: string } | { ok: false; reason: string } {
  const trialId = opts.trialId.trim();
  if (!trialId) return { ok: false, reason: "prepare-arm requires an explicit --trial-id." };
  if (opts.arm !== "A" && opts.arm !== "B") return { ok: false, reason: "prepare-arm arms are A or B. Arm C remains blocked." };
  const root = resolve(opts.root);
  const isolated = validateIsolatedSiteRoot(root);
  if (!isolated.ok) return isolated;

  const existingMarker = loadTrialMarker(root);
  if (existingMarker && existingMarker.trialId !== trialId) {
    return { ok: false, reason: `Site already belongs to trial ${existingMarker.trialId}; refusing to overwrite for ${trialId}.` };
  }
  if (existsSync(join(root, "agent/jev.json")) && !existingMarker) {
    return { ok: false, reason: "Refusing to overwrite a pre-existing site Jev configuration that is not a pilot clone with this trial ID." };
  }
  const inherited = inheritedJevState(root);
  if (inherited.length) {
    return { ok: false, reason: `Arm inherited Jev cache, decisions, or usage receipts: ${inherited.join("; ")}` };
  }
  const state = loadStateIfPresent(root);
  const done = completedNodes(state);
  if (done.length) {
    return { ok: false, reason: `Arm inherited completed stage state: ${done.join(", ")}` };
  }

  if (opts.peerRoot) {
    const peerRoot = resolve(opts.peerRoot);
    if (!existsSync(peerRoot)) return { ok: false, reason: `Peer site does not exist: ${peerRoot}` };
    const snapA = snapshotHash(root);
    const snapB = snapshotHash(peerRoot);
    if (snapA !== snapB) {
      return { ok: false, reason: `Pre-run site snapshots differ: ${snapA.slice(0, 12)} vs ${snapB.slice(0, 12)}` };
    }
  }

  const profile = opts.profileName === "assist-quality-plus-component-select"
    ? COMPONENT_ASSIST_PROFILE
    : ASSIST_QUALITY_PROFILE;
  const payload = profileFileConfig(opts.arm, profile);
  let resolved: ReturnType<typeof mergeJevConfig>;
  try {
    resolved = mergeJevConfig(payload, opts.argv || [], opts.env || process.env, root);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  if (opts.argv?.includes("--jev-mode") || opts.argv?.some(a => a.startsWith("--compact"))) {
    const cliMode = opts.argv[opts.argv.indexOf("--jev-mode") + 1];
    if (cliMode && cliMode !== payload.mode) {
      return { ok: false, reason: `CLI/environment Jev mode ${cliMode} disagrees with frozen Arm ${opts.arm} (${payload.mode}).` };
    }
  }
  if (resolved.mode !== payload.mode) {
    return { ok: false, reason: `Resolved Jev mode ${resolved.mode} disagrees with frozen Arm ${opts.arm} (${payload.mode}).` };
  }
  if (resolved.model !== profile.model) {
    return { ok: false, reason: `Model mismatch: resolved ${resolved.model}, profile ${profile.model}.` };
  }
  if (Boolean(resolved.compactPackets) !== Boolean(profile.compactPackets)) {
    return { ok: false, reason: `Compact-packet mismatch versus frozen profile (${profile.compactPackets}).` };
  }
  if ((resolved.workOwnership ?? "agent") !== "agent") {
    return { ok: false, reason: "Matched A/B requires workOwnership=agent. Arm C remains blocked." };
  }
  if (opts.arm === "A") {
    if (resolved.mode !== "off" || enabledJevCallers(resolved).length !== 0 || !capabilitiesFullyOff(resolveEffectiveCapabilities(resolved))) {
      return { ok: false, reason: "Arm A must have mode=off and zero enabled Jev callers." };
    }
  } else if (!capabilitiesMatchProfile(resolved, profile)) {
    return { ok: false, reason: `Arm B must match the exact versioned capability profile ${profile.version}, not merely enable one caller.` };
  }

  const marker: PilotTrialMarker = {
    schemaVersion: 1,
    trialId,
    arm: opts.arm,
    profile: profile.name as PilotProfileName,
    preparedAt: new Date().toISOString(),
    initialSnapshotHash: snapshotHash(root),
    effectiveConfigHash: effectiveConfigHash(resolved),
    kernelRevision: kernelRevision(opts.kernel),
  };
  const jevPath = join(root, "agent/jev.json");
  const markerPath = join(root, PILOT_TRIAL_MARKER);
  const preparePath = join(root, PILOT_PREPARE_MANIFEST(opts.arm));
  const previousJev = existsSync(jevPath) ? readFileSync(jevPath) : undefined;
  try {
    mkdirSync(join(root, "agent/runs"), { recursive: true });
    writeFileSync(jevPath, JSON.stringify(payload, null, 2), "utf8");
    writeFileSync(markerPath, JSON.stringify(marker, null, 2), "utf8");
    writeFileSync(preparePath, JSON.stringify({
      schemaVersion: 1,
      trialId,
      arm: opts.arm,
      executed: false,
      note: "prepare-arm records identity only. It does not execute the site workflow.",
      kernelIdentity: kernelIdentity(opts.kernel),
      kernelRevision: marker.kernelRevision,
      initialSnapshotHash: marker.initialSnapshotHash,
      effectiveConfigHash: marker.effectiveConfigHash,
      profile,
      effectiveConfig: exposeEffectiveConfig(resolved),
      enabledCallers: enabledJevCallers(resolved),
      configSource: "file",
      stopNode: "preview",
      compactPackets: MATCHED_AB_COMPACT,
      instructions: activeAgentInstructions({ root, arm: opts.arm, trialId, host: opts.host || "other" }),
    }, null, 2), "utf8");
  } catch (err) {
    if (previousJev !== undefined) writeFileSync(jevPath, previousJev);
    else if (existsSync(jevPath)) rmSync(jevPath);
    if (existsSync(markerPath)) rmSync(markerPath);
    if (existsSync(preparePath)) rmSync(preparePath);
    return { ok: false, reason: `prepare-arm failed after validation and restored the previous configuration: ${err instanceof Error ? err.message : String(err)}` };
  }
  return {
    ok: true,
    marker,
    instructions: activeAgentInstructions({ root, arm: opts.arm, trialId, host: opts.host || "other" }),
    preparePath,
  };
}

export interface ObservedJevCall {
  nodeId: string;
  taskId: string;
  receiptFiles: string[];
}

export function observedJevCalls(root: string): ObservedJevCall[] {
  const dir = join(root, "agent/runs");
  if (!existsSync(dir)) return [];
  const calls: ObservedJevCall[] = [];
  for (const name of readdirSync(dir).filter(f => f.endsWith(".task.json"))) {
    try {
      const rec = JSON.parse(readFileSync(join(dir, name), "utf8")) as {
        nodeId?: string; taskId?: string; receiptIds?: string[]; status?: string;
      };
      if (!rec.nodeId || !rec.taskId) continue;
      if (rec.status === "unavailable" || rec.status === "no_candidates") continue;
      calls.push({
        nodeId: rec.nodeId,
        taskId: rec.taskId,
        receiptFiles: rec.receiptIds || [],
      });
    } catch { /* ignore */ }
  }
  return calls;
}

function questionSemanticsForPilotTask(taskId: string): string {
  if (QUALITY_TASK_SEMANTICS[taskId]) return QUALITY_TASK_SEMANTICS[taskId]!;
  if (taskId === "business-source-selection") return FIELD_SELECTION_SEMANTICS_HASH;
  if (taskId === "component-fit-check") return COMPONENT_FIT_SEMANTICS_HASH;
  return GROUNDING_SEMANTICS_HASH;
}

function verifyProfileCall(root: string, preparationId: string, nodeId: string, taskId: string, model: string): { ok: true } | { ok: false; reason: string } {
  const task = allTasks().find(item => item.taskId === taskId);
  if (!task || !task.lifecycleCaller.includes(nodeId)) {
    return { ok: false, reason: `Jev task "${taskId}" is not a registered caller for "${nodeId}".` };
  }
  const record = loadTaskExecution(root, preparationId, taskId);
  if (!record) return { ok: false, reason: `No execution record for ${taskId} in ${preparationId}.` };
  const verified = verifyTaskExecution(root, preparationId, nodeId, task, record.inputHash, {
    expectedModel: model,
    expectedQuestionSemantics: questionSemanticsForPilotTask(taskId),
    expectedSubjectHash: record.inputHash,
  });
  return verified.ok ? { ok: true } : { ok: false, reason: verified.reason || `Jev task ${taskId} failed verification.` };
}

export function finalizeArm(opts: {
  trialId: string;
  arm: PilotArm;
  root: string;
  kernel: string;
  executed?: boolean;
  previewReady?: boolean;
  actualCalls?: ObservedJevCall[];
}): { ok: true; manifestPath: string; manifest: Record<string, unknown> } | { ok: false; reason: string } {
  const root = resolve(opts.root);
  const marker = loadTrialMarker(root);
  if (!marker) return { ok: false, reason: "finalize-arm requires a prepare-arm trial marker." };
  if (marker.trialId !== opts.trialId) {
    return { ok: false, reason: `Trial ID mismatch: site is ${marker.trialId}, command is ${opts.trialId}.` };
  }
  if (marker.arm !== opts.arm) {
    return { ok: false, reason: `Arm mismatch: site is ${marker.arm}, command is ${opts.arm}.` };
  }
  if (opts.executed === true || opts.previewReady === true || opts.actualCalls) {
    return { ok: false, reason: "Caller-supplied executed, previewReady, or actualCalls are not authoritative proof. Remove them; finalize derives those from files." };
  }

  const loaded = loadJevConfig(root);
  if (effectiveConfigHash(loaded) !== marker.effectiveConfigHash) {
    return { ok: false, reason: "Frozen configuration drifted after preparation. Refusing to finalize." };
  }
  if (kernelRevision(opts.kernel) !== marker.kernelRevision) {
    return { ok: false, reason: "Kernel revision drifted after preparation. Refusing to finalize." };
  }
  const profile = marker.profile === "assist-quality-plus-component-select" ? COMPONENT_ASSIST_PROFILE : ASSIST_QUALITY_PROFILE;
  if (loaded.model !== profile.model || Boolean(loaded.compactPackets) !== Boolean(profile.compactPackets) || (loaded.workOwnership ?? "agent") !== "agent") {
    return { ok: false, reason: "Profile model, compact packets, or ownership drifted after preparation." };
  }
  if (opts.arm === "A") {
    if (!capabilitiesFullyOff(resolveEffectiveCapabilities(loaded)) || enabledJevCallers(loaded).length !== 0) {
      return { ok: false, reason: "Arm A configuration no longer has zero Jev callers." };
    }
  } else if (!capabilitiesMatchProfile(loaded, profile)) {
    return { ok: false, reason: `Arm B no longer matches frozen profile ${profile.version}.` };
  }

  const graph = loadGraphIfPresent(root);
  const state = loadStateIfPresent(root);
  if (!graph || !state) {
    return { ok: false, reason: "Cannot finalize: missing agent/graph.yaml or agent/STATE.json." };
  }
  const previewReady = Boolean(state.preview_ready) && isPreviewReady(graph, state);
  const done = completedNodes(state);
  const attempts = Object.fromEntries(Object.entries(state.nodes).map(([id, n]) => [id, n.attempts || 0]));
  const calls = observedJevCalls(root);
  const requiredB = plannedJevCallsForProfile(profile);
  const taskFiles = existsSync(join(root, "agent/runs"))
    ? readdirSync(join(root, "agent/runs")).filter(name => name.endsWith(".task.json"))
    : [];
  const jevFiles = existsSync(join(root, "agent/decisions/jev"))
    ? readdirSync(join(root, "agent/decisions/jev")).filter(name => name.endsWith(".json"))
    : [];

  if (opts.arm === "A") {
    if (taskFiles.length || jevFiles.length || calls.length) {
      return { ok: false, reason: `Arm A must make zero Jev tasks and zero Jev receipts; found ${taskFiles.length} task records and ${jevFiles.length} receipts.` };
    }
  } else {
    const verified = new Set<string>();
    for (const name of taskFiles) {
      let rec: { preparationId?: string; nodeId?: string; taskId?: string; status?: string };
      try { rec = JSON.parse(readFileSync(join(root, "agent/runs", name), "utf8")); }
      catch { return { ok: false, reason: `Unreadable Jev task record ${name}.` }; }
      const preparationId = rec.preparationId || name.split(".").slice(0, -2).join(".");
      if (!rec.nodeId || !rec.taskId || !preparationId) {
        return { ok: false, reason: `Jev task record ${name} is missing preparation, node, or task identity.` };
      }
      if (rec.status === "unavailable" || rec.status === "no_candidates") continue;
      const result = verifyProfileCall(root, preparationId, rec.nodeId, rec.taskId, loaded.model);
      if (!result.ok) return { ok: false, reason: result.reason || `Jev task ${rec.taskId} failed execution verification.` };
      verified.add(`${rec.nodeId}:${rec.taskId}`);
    }
    const missing = requiredB.filter(call => !verified.has(`${call.nodeId}:${call.taskId}`));
    if (missing.length) {
      return { ok: false, reason: `Arm B is missing verified calls for the frozen profile: ${missing.map(call => `${call.nodeId}:${call.taskId}`).join(", ")}. An unrelated Jev task cannot satisfy the treatment.` };
    }
  }

  if (!previewReady) {
    return { ok: false, reason: `Arm ${opts.arm} is not preview_ready (completed: ${done.join(", ") || "none"}).` };
  }

  const finalSnapshotHash = snapshotHash(root);
  const identity = kernelIdentity(opts.kernel);
  const manifest = {
    schemaVersion: 1,
    trialId: opts.trialId,
    arm: opts.arm,
    executed: true,
    executedSource: "derived-from-state",
    stopNode: "preview",
    kernelIdentity: identity,
    kernelRevision: kernelRevision(opts.kernel),
    initialSnapshotHash: marker.initialSnapshotHash,
    finalSnapshotHash,
    siteSnapshotHash: finalSnapshotHash,
    note: "initialSnapshotHash is the common starting point; finalSnapshotHash is post-run and cannot stand for it.",
    profile: marker.profile === "assist-quality-plus-component-select" ? COMPONENT_ASSIST_PROFILE : ASSIST_QUALITY_PROFILE,
    effectiveConfigHash: effectiveConfigHash(loaded),
    preparedConfigHash: marker.effectiveConfigHash,
    effectiveConfig: {
      mode: loaded.mode,
      model: loaded.model,
      compactPackets: loaded.compactPackets,
      workOwnership: loaded.workOwnership,
      capabilities: resolveEffectiveCapabilities(loaded),
      enabledCallers: enabledJevCallers(loaded),
      snapshot: snapshotEffectiveConfig(loaded),
    },
    previewReady: true,
    completedNodes: done,
    attempts,
    actualCalls: calls,
    inheritReceipts: false,
    armC: "blocked",
    doNotDeploy: true,
    injectedOffline: false,
  };
  mkdirSync(join(root, "agent/runs"), { recursive: true });
  const manifestPath = join(root, PILOT_FINAL_MANIFEST(opts.arm));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { ok: true, manifestPath, manifest };
}

export function pairedPrepareGuard(opts: {
  trialId: string;
  rootA: string;
  rootB: string;
  kernel: string;
  profileName?: PilotProfileName;
}): { ok: true } | { ok: false; reason: string } {
  const a = prepareArm({ trialId: opts.trialId, arm: "A", root: opts.rootA, kernel: opts.kernel, peerRoot: opts.rootB, profileName: opts.profileName });
  if (!a.ok) return a;
  const b = prepareArm({ trialId: opts.trialId, arm: "B", root: opts.rootB, kernel: opts.kernel, peerRoot: opts.rootA, profileName: opts.profileName });
  if (!b.ok) return b;
  const match = validateMatchedAbConfigs(loadJevConfig(opts.rootA), loadJevConfig(opts.rootB));
  if (!match.ok) return match;
  if (a.marker.initialSnapshotHash !== b.marker.initialSnapshotHash) {
    return { ok: false, reason: "Prepared arms do not share the same pre-run snapshot hash." };
  }
  return { ok: true };
}
