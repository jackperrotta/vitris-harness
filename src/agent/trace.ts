import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { SOURCE_PATHS } from "./artifacts.ts";
import {
  sha256Hex,
  snapshotInventory,
  type FileInventoryEntry,
  type StagePreparation,
  type ToolExecutionReceipt,
} from "./preparation.ts";
import type { AgentState, SkillGraph } from "./graph.ts";
import {
  cursorHooksStatus,
  installCursorHooks,
  removeCursorHooks,
  renderCursorHookMarkdown,
  summarizeCursorHooks,
  type CursorHookSummary,
} from "./cursor-hook.ts";

export const TRACE_SCHEMA_VERSION = 1 as const;
export const TRACE_EVENT_SCHEMA_VERSION = 1 as const;
export const TRACE_DIR_REL = "agent/runs/traces";
export const TRACE_ACTIVE_REL = "agent/runs/traces/active.json";
export const TRACE_LAST_REL = "agent/runs/traces/last.json";

const STAGE_EVENT_TYPES = new Set<TraceEventType>([
  "stage_prepared",
  "stage_completed",
  "tool_completed",
  "stage_invalidated",
]);
const METADATA_EVENT_TYPES = new Set<TraceEventType>(["run_finished", "cursor_attached"]);

export type TraceStatus = "recording" | "stopped" | "superseded";
export type EvidencePresence = "present" | "absent" | "ambiguous";
export type AgentActionVisibility = "unobserved" | "partial" | "unknown";
export type FactVisibility = "observed_by_kernel" | "reported_by_cursor_export" | "inferred_from_file_changes" | "observed_by_cursor_hook";
export type PromptFidelity = "verified" | "unverified" | "missing";

export type TraceEventType =
  | "stage_prepared"
  | "stage_completed"
  | "tool_completed"
  | "stage_invalidated"
  | "run_finished"
  | "cursor_attached";

export interface CursorExportInspection {
  format: "unverified-markdown";
  userPrompt: EvidencePresence;
  toolNames: EvidencePresence;
  toolArguments: EvidencePresence;
  toolResults: EvidencePresence;
  timestamps: EvidencePresence;
  chatIdentity: EvidencePresence;
  agentActions: AgentActionVisibility;
  notes: string[];
}

export interface CursorExportRecord {
  sourceFilename: string;
  storedPath: string;
  hash: string;
  importedAt: string;
  bytes: number;
  preparationIds?: string[];
  inspection: CursorExportInspection;
}

export interface TraceManifest {
  schemaVersion: 1;
  traceId: string;
  site: string;
  sitePath: string;
  startedAt: string;
  endedAt?: string;
  kernelRevision: string;
  graphVersion: number;
  label?: string;
  status: TraceStatus;
  cursorExports: CursorExportRecord[];
  ownedPreparationIds: string[];
  promptSnapshots: Record<string, {
    path: string;
    hash: string;
    bytes: number;
    publishedHash?: string;
    fidelity: PromptFidelity;
  }>;
  warnings: Array<{
    timestamp: string;
    message: string;
    kind?: string;
    preparationId?: string;
    expectedHash?: string;
    actualHash?: string;
    snapshotPath?: string;
  }>;
}

export interface TraceActiveMarker {
  schemaVersion: 1;
  traceId: string;
  startedAt: string;
}

export interface TraceLastMarker {
  schemaVersion: 1;
  traceId: string;
  stoppedAt: string;
  status: "stopped" | "superseded";
}

export interface TraceEvent {
  schemaVersion: 1;
  type: TraceEventType;
  timestamp: string;
  traceId: string;
  nodeId?: string;
  preparationId?: string;
  attempt?: number;
  reused?: boolean;
  result?: string;
  failures?: string[];
  failureSummary?: string;
  promptHash?: string;
  promptPath?: string;
  promptBytes?: number;
  estimatedPromptTokens?: number;
  hashMismatch?: boolean;
  promptFidelity?: PromptFidelity;
  publishedPromptHash?: string;
  snapshotPromptHash?: string;
  receiptPath?: string;
  logPath?: string;
  usagePath?: string;
  durationMs?: number;
  exitCode?: number;
  command?: string[];
  stateStatus?: string;
  repairTarget?: string;
  changedFiles?: { created: string[]; modified: string[]; deleted: string[] };
  agentTokens: "unknown" | { input?: number; output?: number; measured: boolean; source: string };
  visibility: FactVisibility;
  sourceFilename?: string;
  storedPath?: string;
  notes?: string[];
}

export interface TraceStageSummary {
  nodeId: string;
  preparationId?: string;
  attempt: number;
  kind?: string;
  result?: string;
  preparedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  promptBytes?: number;
  estimatedPromptTokens?: number;
  toolDurationMs?: number;
  failures: string[];
  repairTarget?: string;
  changedFiles?: { created: string[]; modified: string[]; deleted: string[] };
  evidence: Array<{ fact: string; visibility: FactVisibility; path?: string }>;
  agentTokens: "unknown" | { input?: number; output?: number; measured: boolean; source: string };
  promptFidelity?: PromptFidelity;
  publishedPromptHash?: string;
  snapshotPromptHash?: string;
  missing?: string[];
  cursorActions?: {
    reads: { count: number; durationMs: number };
    searches: { count: number; durationMs: number };
    writes: { count: number; durationMs: number };
    shell: { count: number; durationMs: number };
    mcp: { count: number; durationMs: number };
    retries: number;
    eventIds: string[];
    outsideExpectedWrites: string[];
  };
}

export interface TraceSummary {
  schemaVersion: 1;
  traceId: string;
  status: TraceStatus;
  site: string;
  startedAt: string;
  endedAt?: string;
  kernelRevision: string;
  graphVersion: number;
  label?: string;
  agentActions: AgentActionVisibility;
  agentTokens: "unknown";
  visibilityGaps: string[];
  stages: TraceStageSummary[];
  repeatedFailures: Array<{ text: string; count: number }>;
  longStages: Array<{ nodeId: string; preparationId?: string; elapsedMs: number }>;
  promptNotes: string[];
  promptIntegrityWarnings: Array<{
    preparationId: string;
    expectedHash: string;
    actualHash: string;
    snapshotPath: string;
    message: string;
  }>;
  cursorExports: CursorExportRecord[];
  cursorHooks: CursorHookSummary;
  evidencePaths: string[];
}

export interface TraceCliResult {
  handled: boolean;
  exitCode: number;
  message?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function siteRel(root: string, absPath: string): string {
  const rel = relative(resolve(root), resolve(absPath)).replaceAll("\\", "/");
  return rel || ".";
}

export function tracesRoot(root: string): string {
  return join(root, TRACE_DIR_REL);
}

export function activeMarkerPath(root: string): string {
  return join(root, TRACE_ACTIVE_REL);
}

export function lastMarkerPath(root: string): string {
  return join(root, TRACE_LAST_REL);
}

export function traceDir(root: string, traceId: string): string {
  return join(root, TRACE_DIR_REL, traceId);
}

export function readKernelRevision(kernel: string): string {
  try {
    const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: kernel, encoding: "utf8", windowsHide: true });
    if (git.status === 0 && git.stdout.trim()) return git.stdout.trim();
  } catch { /* fall through */ }
  return "unknown";
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** Append one JSONL line. Sequential process reopen is safe on Windows. */
export function appendJsonl(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const line = JSON.stringify(value) + "\n";
  const fd = openSync(path, "a");
  try {
    writeSync(fd, line);
  } finally {
    closeSync(fd);
  }
}

export function loadActiveMarker(root: string): TraceActiveMarker | undefined {
  return readJson<TraceActiveMarker>(activeMarkerPath(root));
}

export function loadLastMarker(root: string): TraceLastMarker | undefined {
  return readJson<TraceLastMarker>(lastMarkerPath(root));
}

export function loadManifest(root: string, traceId: string): TraceManifest | undefined {
  return readJson<TraceManifest>(join(traceDir(root, traceId), "manifest.json"));
}

/**
 * Active recording session wins. Otherwise the most recently stopped/superseded
 * trace. Ambiguous or missing state requires `--trace <id>`.
 */
export function resolveDefaultTraceId(root: string): { traceId: string; source: "active" | "last" } | { error: string } {
  const active = loadActiveMarker(root);
  if (active?.traceId && loadManifest(root, active.traceId)) {
    return { traceId: active.traceId, source: "active" };
  }
  const last = loadLastMarker(root);
  if (last?.traceId && loadManifest(root, last.traceId)) {
    return { traceId: last.traceId, source: "last" };
  }
  if (last?.traceId) {
    return { error: `Last trace "${last.traceId}" is missing. Pass --trace <id>.` };
  }
  return { error: "No trace id. Pass --trace <id> or start a session." };
}

function writeLastMarker(root: string, marker: TraceLastMarker): void {
  writeJson(lastMarkerPath(root), marker);
}

export function loadRecordingSession(root: string): { marker: TraceActiveMarker; manifest: TraceManifest } | undefined {
  const marker = loadActiveMarker(root);
  if (!marker?.traceId) return undefined;
  const manifest = loadManifest(root, marker.traceId);
  if (!manifest || manifest.status !== "recording") return undefined;
  return { marker, manifest };
}

function saveManifest(root: string, manifest: TraceManifest): void {
  writeJson(join(traceDir(root, manifest.traceId), "manifest.json"), manifest);
}

function traceWarn(root: string, message: string, traceId?: string): void {
  const text = `TRACE_ERROR: ${message}`;
  try {
    console.error(text);
  } catch { /* ignore */ }
  const id = traceId || loadActiveMarker(root)?.traceId;
  if (!id) return;
  const manifest = loadManifest(root, id);
  if (!manifest) return;
  manifest.warnings.push({ timestamp: nowIso(), message });
  saveManifest(root, manifest);
}

export function withTraceSafe(root: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    traceWarn(root, err instanceof Error ? err.message : String(err));
  }
}

export function startTraceSession(opts: {
  root: string;
  kernel: string;
  graph: SkillGraph;
  label?: string;
  kernelRevision?: string;
}): { traceId: string; resumed: false; superseded?: string } {
  const { root, graph } = opts;
  const existing = loadRecordingSession(root);
  let superseded: string | undefined;
  if (existing) {
    existing.manifest.status = "superseded";
    existing.manifest.endedAt = nowIso();
    saveManifest(root, existing.manifest);
    withTraceSafe(root, () => {
      appendTraceEvent(root, existing.manifest.traceId, {
        type: "run_finished",
        result: "superseded",
        notes: ["A new trace session replaced this recording session."],
      });
    });
    superseded = existing.manifest.traceId;
    writeLastMarker(root, {
      schemaVersion: 1,
      traceId: existing.manifest.traceId,
      stoppedAt: existing.manifest.endedAt || nowIso(),
      status: "superseded",
    });
  }

  const traceId = randomUUID();
  const startedAt = nowIso();
  const sitePath = resolve(root);
  const manifest: TraceManifest = {
    schemaVersion: TRACE_SCHEMA_VERSION,
    traceId,
    site: basename(sitePath),
    sitePath,
    startedAt,
    kernelRevision: opts.kernelRevision || readKernelRevision(opts.kernel),
    graphVersion: graph.version,
    label: opts.label,
    status: "recording",
    cursorExports: [],
    ownedPreparationIds: [],
    promptSnapshots: {},
    warnings: [],
  };
  mkdirSync(join(traceDir(root, traceId), "prompts"), { recursive: true });
  mkdirSync(join(traceDir(root, traceId), "cursor"), { recursive: true });
  saveManifest(root, manifest);
  writeJson(activeMarkerPath(root), { schemaVersion: 1, traceId, startedAt } satisfies TraceActiveMarker);
  return { traceId, resumed: false, superseded };
}

export function stopTraceSession(root: string): { traceId: string; alreadyStopped?: boolean } | undefined {
  const marker = loadActiveMarker(root);
  if (!marker?.traceId) return undefined;
  const manifest = loadManifest(root, marker.traceId);
  if (!manifest) return undefined;
  if (manifest.status !== "recording") {
    return { traceId: manifest.traceId, alreadyStopped: true };
  }
  manifest.status = "stopped";
  manifest.endedAt = nowIso();
  saveManifest(root, manifest);
  withTraceSafe(root, () => {
    appendTraceEvent(root, manifest.traceId, {
      type: "run_finished",
      result: "stopped",
    });
  });
  writeLastMarker(root, {
    schemaVersion: 1,
    traceId: manifest.traceId,
    stoppedAt: manifest.endedAt || nowIso(),
    status: "stopped",
  });
  try {
    rmSync(activeMarkerPath(root), { force: true });
  } catch { /* keep evidence even if marker delete fails */ }
  writeSummaryFiles(root, manifest.traceId);
  return { traceId: manifest.traceId };
}

export function readEvents(root: string, traceId: string): TraceEvent[] {
  const path = join(traceDir(root, traceId), "events.jsonl");
  if (!existsSync(path)) return [];
  const events: TraceEvent[] = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as TraceEvent);
    } catch {
      /* skip a torn line rather than inventing an event */
    }
  }
  return events;
}

function appendTraceEvent(root: string, traceId: string, partial: Omit<TraceEvent, "schemaVersion" | "timestamp" | "traceId" | "agentTokens" | "visibility"> & {
  timestamp?: string;
  agentTokens?: TraceEvent["agentTokens"];
  visibility?: FactVisibility;
}): void {
  const event: TraceEvent = {
    schemaVersion: TRACE_EVENT_SCHEMA_VERSION,
    timestamp: partial.timestamp || nowIso(),
    traceId,
    agentTokens: partial.agentTokens ?? "unknown",
    visibility: partial.visibility ?? "observed_by_kernel",
    ...partial,
  };
  appendJsonl(join(traceDir(root, traceId), "events.jsonl"), event);
}

function hasEvent(events: TraceEvent[], type: TraceEventType, preparationId?: string, extra?: (event: TraceEvent) => boolean): boolean {
  return events.some(event => event.type === type && (!preparationId || event.preparationId === preparationId) && (!extra || extra(event)));
}

function summarizeFailures(failures: string[] | undefined): { failures?: string[]; failureSummary?: string } {
  if (!failures?.length) return {};
  const clipped = failures.slice(0, 12).map(f => (f.length > 400 ? `${f.slice(0, 397)}...` : f));
  return {
    failures: clipped,
    failureSummary: `${failures.length} failure(s): ${clipped[0]}`,
  };
}

function rememberOwnedPreparation(root: string, traceId: string, preparationId: string): void {
  const manifest = loadManifest(root, traceId);
  if (!manifest) return;
  manifest.ownedPreparationIds ||= [];
  if (!manifest.ownedPreparationIds.includes(preparationId)) {
    manifest.ownedPreparationIds.push(preparationId);
    saveManifest(root, manifest);
  }
}

function recordPromptMismatchWarning(opts: {
  root: string;
  traceId: string;
  preparationId: string;
  expectedHash: string;
  actualHash: string;
  snapshotPath: string;
}): void {
  const manifest = loadManifest(opts.root, opts.traceId);
  if (!manifest) return;
  const message = `Prompt snapshot hash mismatch for preparation ${opts.preparationId}: expected ${opts.expectedHash}, actual ${opts.actualHash}, path ${opts.snapshotPath}. Snapshot fidelity is unverified; this file is not labeled as the prompt Cursor consumed.`;
  manifest.warnings.push({
    timestamp: nowIso(),
    message,
    kind: "prompt_hash_mismatch",
    preparationId: opts.preparationId,
    expectedHash: opts.expectedHash,
    actualHash: opts.actualHash,
    snapshotPath: opts.snapshotPath,
  });
  saveManifest(opts.root, manifest);
}

export function snapshotPreparedPrompt(root: string, preparation: Pick<StagePreparation, "id" | "promptHash">): {
  path: string;
  hash: string;
  bytes: number;
  hashMismatch: boolean;
  alreadyPresent: boolean;
  publishedHash?: string;
  fidelity: PromptFidelity;
} | undefined {
  const session = loadRecordingSession(root);
  if (!session) return undefined;
  const rel = `${TRACE_DIR_REL}/${session.manifest.traceId}/prompts/${preparation.id}.md`;
  const dest = join(root, rel);
  const publishedHash = preparation.promptHash;
  const finish = (hash: string, bytes: number, alreadyPresent: boolean) => {
    const hashMismatch = Boolean(publishedHash && hash !== publishedHash);
    const fidelity: PromptFidelity = !publishedHash ? "missing" : hashMismatch ? "unverified" : "verified";
    const current = loadManifest(root, session.manifest.traceId);
    if (current) {
      current.promptSnapshots[preparation.id] = { path: rel, hash, bytes, publishedHash, fidelity };
      saveManifest(root, current);
    }
    if (hashMismatch && publishedHash) {
      recordPromptMismatchWarning({
        root,
        traceId: session.manifest.traceId,
        preparationId: preparation.id,
        expectedHash: publishedHash,
        actualHash: hash,
        snapshotPath: rel,
      });
    }
    return { path: rel, hash, bytes, hashMismatch, alreadyPresent, publishedHash, fidelity };
  };
  if (existsSync(dest)) {
    const bytes = readFileSync(dest);
    const hash = sha256Hex(bytes);
    return finish(hash, bytes.length, true);
  }
  const currentPath = join(root, "agent/CURRENT.md");
  if (!existsSync(currentPath)) {
    throw new Error(`Cannot snapshot prompt for ${preparation.id}: agent/CURRENT.md is missing`);
  }
  const bytes = readFileSync(currentPath);
  const hash = sha256Hex(bytes);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  return finish(hash, bytes.length, false);
}

function inferredSourceChanges(root: string, baseline?: Record<string, FileInventoryEntry>): { created: string[]; modified: string[]; deleted: string[] } | undefined {
  if (!baseline) return undefined;
  const current = snapshotInventory(root);
  const interesting = (path: string) => {
    const norm = path.replaceAll("\\", "/");
    if (norm.startsWith("agent/runs/")) return false;
    return SOURCE_PATHS.some(s => norm === s || norm.startsWith(`${s}/`))
      || norm.startsWith("onboarding/")
      || norm.startsWith("agent/reviews/");
  };
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const [path, cur] of Object.entries(current)) {
    if (!interesting(path)) continue;
    const base = baseline[path];
    if (!base) created.push(path);
    else if (base.hash !== cur.hash) modified.push(path);
  }
  for (const path of Object.keys(baseline)) {
    if (!interesting(path)) continue;
    if (!current[path]) deleted.push(path);
  }
  if (!created.length && !modified.length && !deleted.length) return { created, modified, deleted };
  return { created, modified, deleted };
}

function repairTargetFrom(prior?: Record<string, string>, next?: AgentState): string | undefined {
  if (!prior || !next) return undefined;
  for (const [id, st] of Object.entries(next.nodes)) {
    if (prior[id] === "done" && st.status === "pending") return id;
  }
  return undefined;
}

export function recordStagePrepared(opts: {
  root: string;
  preparation: StagePreparation;
  reused?: boolean;
}): void {
  withTraceSafe(opts.root, () => {
    const session = loadRecordingSession(opts.root);
    if (!session) return;
    const snap = snapshotPreparedPrompt(opts.root, opts.preparation);
    rememberOwnedPreparation(opts.root, session.manifest.traceId, opts.preparation.id);
    if (opts.reused || snap?.alreadyPresent) {
      const events = readEvents(opts.root, session.manifest.traceId);
      if (hasEvent(events, "stage_prepared", opts.preparation.id)) return;
    }
    const mismatch = Boolean(snap?.hashMismatch);
    appendTraceEvent(opts.root, session.manifest.traceId, {
      type: "stage_prepared",
      nodeId: opts.preparation.nodeId,
      preparationId: opts.preparation.id,
      attempt: opts.preparation.attempt,
      reused: Boolean(opts.reused),
      promptHash: opts.preparation.promptHash,
      publishedPromptHash: opts.preparation.promptHash,
      snapshotPromptHash: snap?.hash,
      promptPath: snap?.path,
      promptBytes: snap?.bytes,
      estimatedPromptTokens: snap ? Math.ceil(snap.bytes / 4) : undefined,
      hashMismatch: mismatch,
      promptFidelity: snap?.fidelity || (snap ? "verified" : "missing"),
      notes: mismatch
        ? [
            "Prompt snapshot hash does not match StagePreparation.promptHash.",
            "Snapshot fidelity is unverified. This file is not the prompt Cursor consumed.",
            `expected ${opts.preparation.promptHash}`,
            `actual ${snap?.hash}`,
            `path ${snap?.path}`,
          ]
        : [
            "Prompt snapshot is the exact CURRENT.md packet published for this preparation.",
            "Prompt length is a size proxy, not measured agent token usage.",
          ],
    });
  });
}

export function recordStageCompleted(opts: {
  root: string;
  preparation: StagePreparation;
  ok: boolean;
  failures: string[];
  idempotentReplay?: boolean;
  priorNodeStatuses?: Record<string, string>;
  state?: AgentState;
  durationMs?: number;
  agentUsage?: { inputTokens?: number; outputTokens?: number; measured: boolean };
}): void {
  withTraceSafe(opts.root, () => {
    const session = loadRecordingSession(opts.root);
    if (!session) return;
    if (opts.idempotentReplay) return;
    const events = readEvents(opts.root, session.manifest.traceId);
    if (hasEvent(events, "stage_completed", opts.preparation.id)) return;
    rememberOwnedPreparation(opts.root, session.manifest.traceId, opts.preparation.id);
    const changedFiles = inferredSourceChanges(opts.root, opts.preparation.baselineInventory);
    const usageDir = `agent/runs/usage`;
    const tokens = opts.agentUsage && (opts.agentUsage.inputTokens !== undefined || opts.agentUsage.outputTokens !== undefined)
      ? {
          input: opts.agentUsage.inputTokens,
          output: opts.agentUsage.outputTokens,
          measured: Boolean(opts.agentUsage.measured),
          source: opts.agentUsage.measured ? "host_export" : "manual_host_report",
        }
      : "unknown" as const;
    appendTraceEvent(opts.root, session.manifest.traceId, {
      type: "stage_completed",
      nodeId: opts.preparation.nodeId,
      preparationId: opts.preparation.id,
      attempt: opts.preparation.attempt,
      result: opts.ok ? "ok" : "fail",
      ...summarizeFailures(opts.failures),
      promptPath: session.manifest.promptSnapshots[opts.preparation.id]?.path,
      promptHash: opts.preparation.promptHash,
      durationMs: opts.durationMs,
      stateStatus: opts.state?.status,
      repairTarget: repairTargetFrom(opts.priorNodeStatuses, opts.state),
      changedFiles,
      agentTokens: tokens,
      usagePath: existsSync(join(opts.root, usageDir)) ? usageDir : undefined,
      notes: [
        "Completion is kernel-evaluated. File changes are inferred from inventory, not a Cursor tool transcript.",
        tokens === "unknown" ? "Agent token usage is unknown unless the host supplied measured counters for this run." : "Token counts are host-reported; they are not inferred from prompt length.",
      ],
    });
  });
}

export function recordToolCompleted(opts: {
  root: string;
  nodeId: string;
  receipt: ToolExecutionReceipt;
  iteration?: number;
  priorNodeStatuses?: Record<string, string>;
  state?: AgentState;
}): void {
  withTraceSafe(opts.root, () => {
    const session = loadRecordingSession(opts.root);
    if (!session) return;
    const receiptRel = opts.iteration !== undefined
      ? `agent/runs/${opts.iteration}-${opts.nodeId}.json`
      : siteRel(opts.root, opts.receipt.outputPath.replace(/\.log$/, ".json"));
    const logRel = siteRel(opts.root, opts.receipt.outputPath);
    const events = readEvents(opts.root, session.manifest.traceId);
    if (hasEvent(events, "tool_completed", undefined, e => e.receiptPath === receiptRel)) {
      return;
    }
    appendTraceEvent(opts.root, session.manifest.traceId, {
      type: "tool_completed",
      nodeId: opts.nodeId,
      result: opts.receipt.failures.length === 0 ? "ok" : "fail",
      ...summarizeFailures(opts.receipt.failures),
      durationMs: opts.receipt.durationMs,
      exitCode: opts.receipt.exitCode,
      command: opts.receipt.command,
      receiptPath: receiptRel,
      logPath: logRel,
      stateStatus: opts.state?.status,
      repairTarget: repairTargetFrom(opts.priorNodeStatuses, opts.state),
      notes: ["Stdout/stderr stay in the existing tool log; they are not copied into events.jsonl."],
    });
  });
}

export function recordStageInvalidated(opts: {
  root: string;
  preparation: Pick<StagePreparation, "id" | "nodeId" | "attempt" | "status" | "invalidationReason">;
  result?: "invalidated" | "canceled";
}): void {
  withTraceSafe(opts.root, () => {
    const session = loadRecordingSession(opts.root);
    if (!session) return;
    const events = readEvents(opts.root, session.manifest.traceId);
    if (hasEvent(events, "stage_invalidated", opts.preparation.id)) return;
    rememberOwnedPreparation(opts.root, session.manifest.traceId, opts.preparation.id);
    appendTraceEvent(opts.root, session.manifest.traceId, {
      type: "stage_invalidated",
      nodeId: opts.preparation.nodeId,
      preparationId: opts.preparation.id,
      attempt: opts.preparation.attempt,
      result: opts.result || opts.preparation.status || "invalidated",
      failureSummary: opts.preparation.invalidationReason,
      failures: opts.preparation.invalidationReason ? [opts.preparation.invalidationReason] : undefined,
    });
  });
}

/** Conservative inspection. Never treats prose as proof that a tool ran. */
export function inspectCursorExport(text: string): CursorExportInspection {
  const notes = [
    "Cursor Markdown export field coverage is unverified unless a live Export Transcript file for this kernel version was inspected.",
    "Inspection never treats prose as proof that a host tool ran.",
    "Do not scrape Cursor's local database or use public shared transcript links as evidence.",
    "Cursor staff document that Export Transcript omits thinking blocks, terminal I/O, and tool calls; treat those as absent unless a live file shows structured calls.",
  ];
  const hasUser = /(^|\n)\s*#{1,6}\s*user\b|(^|\n)\s*user:\s|(^|\n)\*\*user\*\*/i.test(text);
  const hasAssistant = /(^|\n)\s*#{1,6}\s*(assistant|agent)\b|(^|\n)\s*(assistant|agent):\s/i.test(text);
  const hasToolFence = /```[\w-]*(tool|function_call|tool_call)/i.test(text);
  const hasIso = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text);
  const hasId = /chat[_-]?id|composer[_-]?id|conversation[_-]?id/i.test(text);
  return {
    format: "unverified-markdown",
    userPrompt: hasUser ? "ambiguous" : "absent",
    toolNames: hasToolFence ? "ambiguous" : "absent",
    toolArguments: "absent",
    toolResults: "absent",
    timestamps: hasIso ? "ambiguous" : "absent",
    chatIdentity: hasId ? "ambiguous" : "absent",
    agentActions: hasToolFence ? "partial" : (hasUser || hasAssistant ? "partial" : "unknown"),
    notes,
  };
}

export function attachCursorExport(opts: {
  root: string;
  file: string;
  preparationIds?: string[];
  traceId?: string;
}): CursorExportRecord {
  const resolved = opts.traceId
    ? { traceId: opts.traceId }
    : resolveDefaultTraceId(opts.root);
  if ("error" in resolved) {
    throw new Error(resolved.error);
  }
  const traceId = resolved.traceId;
  const manifest = loadManifest(opts.root, traceId);
  if (!manifest) throw new Error(`Trace "${traceId}" was not found.`);
  const source = resolve(opts.file);
  if (!existsSync(source) || !statSync(source).isFile()) {
    throw new Error(`Cursor export file not found: ${source}`);
  }
  const originalName = basename(source);
  const storedName = `${Date.now()}-${originalName.replace(/[^\w.-]+/g, "_")}`;
  const dest = join(traceDir(opts.root, traceId), "cursor", storedName);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(source, dest);
  const bytes = readFileSync(dest);
  const text = typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes);
  const record: CursorExportRecord = {
    sourceFilename: originalName,
    storedPath: siteRel(opts.root, dest),
    hash: sha256Hex(bytes),
    importedAt: nowIso(),
    bytes: bytes.length,
    preparationIds: opts.preparationIds,
    inspection: inspectCursorExport(text),
  };
  manifest.cursorExports.push(record);
  saveManifest(opts.root, manifest);
  withTraceSafe(opts.root, () => {
    appendTraceEvent(opts.root, traceId, {
      type: "cursor_attached",
      preparationId: opts.preparationIds?.[0],
      sourceFilename: record.sourceFilename,
      storedPath: record.storedPath,
      promptHash: record.hash,
      visibility: "reported_by_cursor_export",
      notes: [
        `Imported raw Cursor export ${originalName}.`,
        `Agent actions from export: ${record.inspection.agentActions}.`,
        ...record.inspection.notes,
      ],
    });
  });
  writeSummaryFiles(opts.root, traceId);
  return record;
}

function recoverStagesFromAuthoritativeRecords(root: string, events: TraceEvent[], manifest: TraceManifest): TraceStageSummary[] {
  const byKey = new Map<string, TraceStageSummary>();
  const ownedPrepIds = new Set<string>([
    ...Object.keys(manifest.promptSnapshots || {}),
    ...(manifest.ownedPreparationIds || []),
  ]);

  const ensure = (key: string, nodeId: string, attempt: number, preparationId?: string): TraceStageSummary => {
    const existing = byKey.get(key);
    if (existing) return existing;
    const created: TraceStageSummary = {
      nodeId,
      preparationId,
      attempt,
      failures: [],
      evidence: [],
      agentTokens: "unknown",
      missing: [],
    };
    byKey.set(key, created);
    return created;
  };

  const markMissing = (stage: TraceStageSummary, note: string) => {
    stage.missing ||= [];
    if (!stage.missing.includes(note)) stage.missing.push(note);
  };

  for (const event of events) {
    if (METADATA_EVENT_TYPES.has(event.type) || !STAGE_EVENT_TYPES.has(event.type)) continue;

    if (event.type === "tool_completed") {
      const key = event.receiptPath || `tool:${event.nodeId}:${event.timestamp}`;
      const stage = ensure(key, event.nodeId || "tool", event.attempt || 0, event.preparationId);
      stage.kind = "tool";
      stage.completedAt = event.timestamp;
      stage.result = event.result;
      stage.failures = event.failures || stage.failures;
      stage.repairTarget = event.repairTarget;
      stage.toolDurationMs = event.durationMs;
      stage.elapsedMs = event.durationMs;
      stage.agentTokens = event.agentTokens;
      if (event.receiptPath) {
        stage.evidence.push({ fact: "tool receipt", visibility: "observed_by_kernel", path: event.receiptPath });
      } else {
        markMissing(stage, "tool receipt path missing");
      }
      if (event.logPath) stage.evidence.push({ fact: "tool log", visibility: "observed_by_kernel", path: event.logPath });
      continue;
    }

    if (!event.preparationId) continue;
    ownedPrepIds.add(event.preparationId);
    const stage = ensure(event.preparationId, event.nodeId || event.preparationId, event.attempt || 0, event.preparationId);
    if (event.hashMismatch || event.promptFidelity === "unverified") {
      stage.promptFidelity = "unverified";
      stage.publishedPromptHash = event.publishedPromptHash || event.promptHash;
      stage.snapshotPromptHash = event.snapshotPromptHash;
    } else if (event.promptFidelity) {
      stage.promptFidelity ||= event.promptFidelity;
    }
    if (event.type === "stage_prepared") {
      stage.preparedAt = event.timestamp;
      stage.promptBytes = event.promptBytes;
      stage.estimatedPromptTokens = event.estimatedPromptTokens;
      if (event.promptPath) {
        stage.evidence.push({
          fact: stage.promptFidelity === "unverified" ? "prompt snapshot (unverified)" : "prompt snapshot",
          visibility: "observed_by_kernel",
          path: event.promptPath,
        });
      } else {
        markMissing(stage, "prompt snapshot missing");
        stage.promptFidelity ||= "missing";
      }
    }
    if (event.type === "stage_completed") {
      stage.completedAt = event.timestamp;
      stage.result = event.result;
      stage.failures = event.failures || stage.failures;
      stage.repairTarget = event.repairTarget;
      stage.changedFiles = event.changedFiles;
      stage.agentTokens = event.agentTokens;
      if (event.durationMs !== undefined) stage.elapsedMs = event.durationMs;
      if (event.changedFiles) {
        stage.evidence.push({ fact: "source file changes", visibility: "inferred_from_file_changes" });
      }
    }
    if (event.type === "stage_invalidated") {
      stage.result = event.result || "invalidated";
      stage.failures = event.failures || stage.failures;
    }
    if (stage.preparedAt && stage.completedAt && stage.elapsedMs === undefined) {
      const elapsed = Date.parse(stage.completedAt) - Date.parse(stage.preparedAt);
      if (Number.isFinite(elapsed) && elapsed >= 0) stage.elapsedMs = elapsed;
    }
  }

  for (const prepId of ownedPrepIds) {
    const name = `${prepId}.json`;
    const prepPath = join(root, "agent/preparations", name);
    const stage = byKey.get(prepId) || ensure(prepId, prepId, 0, prepId);
    if (!existsSync(prepPath)) {
      const snap = manifest.promptSnapshots[prepId];
      if (snap) {
        stage.promptFidelity = snap.fidelity || stage.promptFidelity;
        stage.publishedPromptHash = snap.publishedHash || stage.publishedPromptHash;
        stage.snapshotPromptHash = snap.hash || stage.snapshotPromptHash;
        stage.evidence.push({
          fact: snap.fidelity === "unverified" ? "prompt snapshot (unverified)" : "prompt snapshot",
          visibility: "observed_by_kernel",
          path: snap.path,
        });
      } else {
        markMissing(stage, "prompt snapshot missing");
        stage.promptFidelity ||= "missing";
      }
      if (!stage.preparedAt && !stage.completedAt) {
        markMissing(stage, "authoritative preparation record missing");
      }
      continue;
    }
    try {
      const prep = JSON.parse(readFileSync(prepPath, "utf8")) as StagePreparation;
      stage.nodeId = prep.nodeId || stage.nodeId;
      stage.attempt = prep.attempt || stage.attempt;
      stage.preparationId = prep.id;
      if (!stage.preparedAt) {
        stage.preparedAt = prep.preparedAt;
        markMissing(stage, "stage_prepared event missing; recovered from preparation record");
      }
      const hadCompletionEvent = Boolean(stage.completedAt) || stage.result === "invalidated" || stage.result === "canceled";
      if (prep.consumedAt) stage.completedAt = stage.completedAt || prep.consumedAt;
      if (prep.result) {
        if (!hadCompletionEvent) {
          markMissing(stage, "completion event missing; recovered from preparation record");
        }
        stage.result = stage.result || (prep.result.ok ? "ok" : "fail");
        if (!stage.failures.length) stage.failures = prep.result.failures || [];
      }
      if (prep.status === "invalidated" || prep.status === "canceled") {
        stage.result = stage.result || prep.status;
        if (!hadCompletionEvent) markMissing(stage, `${prep.status} recovered from preparation record`);
      }
      if (!hadCompletionEvent && prep.status === "prepared" && !prep.result) {
        markMissing(stage, "completion event missing");
      }
      stage.evidence.push({ fact: "preparation record", visibility: "observed_by_kernel", path: `agent/preparations/${name}` });
      const snap = manifest.promptSnapshots[prepId];
      if (!snap) {
        markMissing(stage, "prompt snapshot missing");
        stage.promptFidelity ||= "missing";
      } else if (snap.fidelity === "unverified") {
        stage.promptFidelity = "unverified";
        stage.publishedPromptHash = snap.publishedHash;
        stage.snapshotPromptHash = snap.hash;
      } else {
        stage.promptFidelity ||= snap.fidelity;
      }
      if (stage.preparedAt && stage.completedAt && stage.elapsedMs === undefined) {
        const elapsed = Date.parse(stage.completedAt) - Date.parse(stage.preparedAt);
        if (Number.isFinite(elapsed) && elapsed >= 0) stage.elapsedMs = elapsed;
      }
    } catch {
      markMissing(stage, "authoritative preparation record unreadable");
    }
  }

  return [...byKey.values()]
    .filter(stage => stage.nodeId !== "unknown")
    .map(stage => {
      if (stage.missing && !stage.missing.length) delete stage.missing;
      return stage;
    })
    .sort((a, b) => {
      const aTs = Date.parse(a.preparedAt || a.completedAt || "") || 0;
      const bTs = Date.parse(b.preparedAt || b.completedAt || "") || 0;
      return aTs - bTs;
    });
}

export function buildTraceSummary(root: string, traceId: string): TraceSummary {
  const manifest = loadManifest(root, traceId);
  if (!manifest) throw new Error(`Trace "${traceId}" was not found.`);
  const events = readEvents(root, traceId);
  const stages = recoverStagesFromAuthoritativeRecords(root, events, manifest);
  const hookMerge = summarizeCursorHooks(root, traceId, stages);
  const failureCounts = new Map<string, number>();
  for (const stage of stages) {
    for (const failure of stage.failures) {
      const key = failure.slice(0, 240);
      failureCounts.set(key, (failureCounts.get(key) || 0) + 1);
    }
  }
  const repeatedFailures = [...failureCounts.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  const longStages = stages
    .filter(s => typeof s.elapsedMs === "number")
    .map(s => ({ nodeId: s.nodeId, preparationId: s.preparationId, elapsedMs: s.elapsedMs! }))
    .sort((a, b) => b.elapsedMs - a.elapsedMs)
    .slice(0, 8);
  const promptNotes: string[] = [];
  for (const stage of stages) {
    if ((stage.promptBytes || 0) > 40000) {
      promptNotes.push(`${stage.nodeId} (${stage.preparationId}): prompt is ${stage.promptBytes} bytes; length is a proxy and may indicate packet confusion.`);
    }
  }
  const promptIntegrityWarnings = (manifest.warnings || [])
    .filter(w => w.kind === "prompt_hash_mismatch" && w.preparationId && w.expectedHash && w.actualHash && w.snapshotPath)
    .map(w => ({
      preparationId: w.preparationId!,
      expectedHash: w.expectedHash!,
      actualHash: w.actualHash!,
      snapshotPath: w.snapshotPath!,
      message: w.message,
    }));
  const exportActions = manifest.cursorExports.map(e => e.inspection.agentActions);
  const agentActions: AgentActionVisibility = !manifest.cursorExports.length
    ? "unobserved"
    : exportActions.includes("partial") || exportActions.includes("unknown")
      ? "partial"
      : "unknown";
  const visibilityGaps = [
    ...(promptIntegrityWarnings.length
      ? ["One or more prompt snapshots do not match StagePreparation.promptHash. Those files are unverified and are not labeled as the prompt Cursor consumed."]
      : []),
    "Hidden model reasoning is unobserved.",
    manifest.cursorExports.length
      ? "Cursor export is attached as raw evidence. Tool names, arguments, results, timestamps, and chat identity remain unverified unless marked present after a live export inspection."
      : "No Cursor Markdown export is attached. Host agent actions are unobserved.",
    "File changes infer that work occurred; they are not a complete tool transcript.",
    "Agent token usage is unknown unless Cursor supplied measured counters for this same run.",
  ];
  const evidencePaths = [
    `${TRACE_DIR_REL}/${traceId}/manifest.json`,
    `${TRACE_DIR_REL}/${traceId}/events.jsonl`,
    ...Object.values(manifest.promptSnapshots).map(s => s.path),
    ...manifest.cursorExports.map(e => e.storedPath),
    ...(hookMerge.cursorHooks.eventsPath ? [hookMerge.cursorHooks.eventsPath] : []),
  ];
  return {
    schemaVersion: 1,
    traceId,
    status: manifest.status,
    site: manifest.site,
    startedAt: manifest.startedAt,
    endedAt: manifest.endedAt,
    kernelRevision: manifest.kernelRevision,
    graphVersion: manifest.graphVersion,
    label: manifest.label,
    agentActions,
    agentTokens: "unknown",
    visibilityGaps,
    stages,
    repeatedFailures,
    longStages,
    promptNotes,
    promptIntegrityWarnings,
    cursorExports: manifest.cursorExports,
    cursorHooks: hookMerge.cursorHooks,
    evidencePaths,
  };
}

export function renderTraceSummaryMarkdown(summary: TraceSummary): string {
  const lines: string[] = [
    `# Workflow trace ${summary.traceId}`,
    "",
    `- Status: ${summary.status}`,
    `- Site: ${summary.site}`,
    `- Started: ${summary.startedAt}`,
    `- Ended: ${summary.endedAt || "still recording"}`,
    `- Kernel revision: ${summary.kernelRevision}`,
    `- Graph version: ${summary.graphVersion}`,
    summary.label ? `- Label: ${summary.label}` : "",
    `- Agent actions: ${summary.agentActions}`,
    `- Agent tokens: ${summary.agentTokens}`,
    "",
    "This report has no synthetic quality score. Facts are labeled by how they were obtained.",
    "",
    "## Prompt snapshot integrity",
  ];
  if (!summary.promptIntegrityWarnings.length) {
    lines.push("- No hash mismatches were recorded. Matching snapshots are labeled verified; missing snapshots are labeled missing.");
  } else {
    for (const warning of summary.promptIntegrityWarnings) {
      lines.push(`- **WARNING:** Prompt snapshot for preparation \`${warning.preparationId}\` is unverified and is not the prompt Cursor consumed.`);
      lines.push(`  - expected hash: \`${warning.expectedHash}\``);
      lines.push(`  - actual hash: \`${warning.actualHash}\``);
      lines.push(`  - snapshot path: \`${warning.snapshotPath}\``);
    }
  }
  lines.push(
    "",
    "## Visibility gaps",
    ...summary.visibilityGaps.map(g => `- ${g}`),
    "",
    "## Stage timeline",
  );
  if (!summary.stages.length) {
    lines.push("- No stage events or recoverable preparation records were found.");
  } else {
    for (const stage of summary.stages) {
      lines.push(`### ${stage.nodeId} attempt ${stage.attempt}${stage.preparationId ? ` (${stage.preparationId})` : ""}`);
      lines.push(`- Result: ${stage.result || "unknown"}`);
      if (stage.promptFidelity) {
        const fidelityNote = stage.promptFidelity === "verified"
          ? "verified against StagePreparation.promptHash"
          : stage.promptFidelity === "unverified"
            ? "unverified — snapshot is not labeled as the prompt Cursor consumed"
            : "missing";
        lines.push(`- Prompt fidelity: ${stage.promptFidelity} (${fidelityNote})`);
      }
      if (stage.missing?.length) {
        lines.push("- Missing evidence:");
        for (const note of stage.missing) lines.push(`  - ${note}`);
      }
      if (stage.cursorActions) {
        const actions = stage.cursorActions;
        lines.push(`- Cursor hook actions [observed_by_cursor_hook]: reads ${actions.reads.count} (${actions.reads.durationMs} ms), searches ${actions.searches.count} (${actions.searches.durationMs} ms), writes ${actions.writes.count} (${actions.writes.durationMs} ms), shell ${actions.shell.count} (${actions.shell.durationMs} ms), mcp ${actions.mcp.count} (${actions.mcp.durationMs} ms), retries ${actions.retries}`);
        if (actions.eventIds.length) lines.push(`  - event ids: ${actions.eventIds.join(", ")}`);
        if (actions.outsideExpectedWrites.length) {
          lines.push("  - writes outside the prepared node scope:");
          for (const path of actions.outsideExpectedWrites) lines.push(`    - ${path}`);
        }
      }
      if (stage.elapsedMs !== undefined) lines.push(`- Elapsed preparation-to-completion: ${stage.elapsedMs} ms`);
      if (stage.toolDurationMs !== undefined) lines.push(`- Tool duration: ${stage.toolDurationMs} ms`);
      if (stage.repairTarget) lines.push(`- Repair target: ${stage.repairTarget}`);
      if (stage.failures.length) {
        lines.push("- Evaluator failures:");
        for (const f of stage.failures) lines.push(`  - ${f}`);
      }
      if (stage.changedFiles) {
        const n = stage.changedFiles.created.length + stage.changedFiles.modified.length + stage.changedFiles.deleted.length;
        lines.push(`- Source files changed during the stage (inferred from inventory): ${n}`);
        for (const p of stage.changedFiles.created) lines.push(`  - created ${p}`);
        for (const p of stage.changedFiles.modified) lines.push(`  - modified ${p}`);
        for (const p of stage.changedFiles.deleted) lines.push(`  - deleted ${p}`);
      }
      lines.push("- Evidence:");
      for (const ev of stage.evidence) {
        lines.push(`  - ${ev.fact} [${ev.visibility}]${ev.path ? ` ${ev.path}` : ""}`);
      }
      lines.push(`- Agent tokens: ${typeof stage.agentTokens === "string" ? stage.agentTokens : `${stage.agentTokens.source} (not inferred from prompt length)`}`);
      lines.push("");
    }
  }
  lines.push("## Repeated failures");
  if (!summary.repeatedFailures.length) lines.push("- None recorded.");
  else for (const f of summary.repeatedFailures) lines.push(`- (${f.count}) ${f.text}`);
  lines.push("", "## Long stages");
  if (!summary.longStages.length) lines.push("- None recorded.");
  else for (const s of summary.longStages) lines.push(`- ${s.nodeId}${s.preparationId ? ` (${s.preparationId})` : ""}: ${s.elapsedMs} ms`);
  lines.push("", "## Prompt notes");
  if (!summary.promptNotes.length) lines.push("- No oversized prompts were flagged. Prompt length is only a proxy for confusion.");
  else for (const n of summary.promptNotes) lines.push(`- ${n}`);
  lines.push("", "## Cursor exports");
  if (!summary.cursorExports.length) {
    lines.push("- None attached. Host actions remain unobserved.");
  } else {
    for (const exp of summary.cursorExports) {
      lines.push(`- ${exp.sourceFilename} → ${exp.storedPath} (hash ${exp.hash})`);
      lines.push(`  - userPrompt: ${exp.inspection.userPrompt}; toolNames: ${exp.inspection.toolNames}; toolArguments: ${exp.inspection.toolArguments}; toolResults: ${exp.inspection.toolResults}; timestamps: ${exp.inspection.timestamps}; chatIdentity: ${exp.inspection.chatIdentity}`);
      lines.push(`  - agent actions: ${exp.inspection.agentActions}`);
    }
  }
  lines.push(...renderCursorHookMarkdown(summary.cursorHooks));
  lines.push("## Evidence paths");
  for (const p of summary.evidencePaths) lines.push(`- ${p}`);
  lines.push("");
  return lines.filter((line, i) => line !== "" || lines[i - 1] !== "").join("\n");
}

export function writeSummaryFiles(root: string, traceId: string): TraceSummary {
  const summary = buildTraceSummary(root, traceId);
  const dir = traceDir(root, traceId);
  writeJson(join(dir, "summary.json"), summary);
  writeFileSync(join(dir, "summary.md"), renderTraceSummaryMarkdown(summary), "utf8");
  return summary;
}

export function cleanupTrace(root: string, traceId: string): { traceId: string; removed: string } {
  if (!traceId || traceId.includes("..") || /[\\/]/.test(traceId)) {
    throw new Error("cleanup requires an explicit trace ID; refusing to delete agent/runs.");
  }
  const dir = traceDir(root, traceId);
  if (!existsSync(dir)) throw new Error(`Trace "${traceId}" was not found.`);
  const marker = loadActiveMarker(root);
  if (marker?.traceId === traceId) {
    try { rmSync(activeMarkerPath(root), { force: true }); } catch { /* continue */ }
  }
  const last = loadLastMarker(root);
  if (last?.traceId === traceId) {
    try { rmSync(lastMarkerPath(root), { force: true }); } catch { /* continue */ }
  }
  rmSync(dir, { recursive: true, force: true });
  if (existsSync(dir)) throw new Error(`Failed to remove ${siteRel(root, dir)}`);
  return { traceId, removed: siteRel(root, dir) };
}

export function formatTraceStatus(root: string): string {
  const marker = loadActiveMarker(root);
  const last = loadLastMarker(root);
  if (!marker?.traceId) {
    return JSON.stringify({
      tracing: "off",
      lastTraceId: last?.traceId,
    }, null, 2);
  }
  const manifest = loadManifest(root, marker.traceId);
  return JSON.stringify({
    tracing: manifest?.status || "unknown",
    traceId: marker.traceId,
    startedAt: manifest?.startedAt || marker.startedAt,
    label: manifest?.label,
    lastTraceId: last?.traceId,
    promptSnapshots: Object.keys(manifest?.promptSnapshots || {}).length,
    cursorExports: manifest?.cursorExports.length || 0,
    warnings: manifest?.warnings.length || 0,
  }, null, 2);
}

function argFrom(argv: string[], key: string): string | undefined {
  const i = argv.indexOf(key);
  return i < 0 ? undefined : argv[i + 1];
}

function hasFlag(argv: string[], key: string): boolean {
  return argv.includes(key);
}

function hasWorkflowAction(argv: string[]): boolean {
  return hasFlag(argv, "--prepare")
    || hasFlag(argv, "--complete")
    || hasFlag(argv, "--once")
    || hasFlag(argv, "--status")
    || hasFlag(argv, "--print-status")
    || Boolean(argFrom(argv, "--change"))
    || Boolean(argFrom(argv, "--theme"))
    || Boolean(argFrom(argv, "--restart-from"));
}

/**
 * Handle exclusive go/trace commands before the workflow lock and state save.
 * `--trace-start` with a workflow action is not exclusive: the caller starts then continues.
 */
export function dispatchTraceCli(opts: {
  root: string;
  kernel: string;
  graph: SkillGraph;
  argv: string[];
  log?: (message: string) => void;
}): TraceCliResult {
  const { root, kernel, graph, argv } = opts;
  const log = opts.log || console.log;

  if (hasFlag(argv, "--trace-hooks-install")) {
    const result = installCursorHooks({ root, kernel });
    log(JSON.stringify(result, null, 2));
    return { handled: true, exitCode: 0 };
  }
  if (hasFlag(argv, "--trace-hooks-status")) {
    log(JSON.stringify(cursorHooksStatus(root), null, 2));
    return { handled: true, exitCode: 0 };
  }
  if (hasFlag(argv, "--trace-hooks-remove")) {
    log(JSON.stringify(removeCursorHooks(root), null, 2));
    return { handled: true, exitCode: 0 };
  }

  if (hasFlag(argv, "--trace-status")) {
    log(formatTraceStatus(root));
    return { handled: true, exitCode: 0 };
  }

  if (hasFlag(argv, "--trace-summary")) {
    const requested = argFrom(argv, "--trace");
    const resolved = requested ? { traceId: requested } : resolveDefaultTraceId(root);
    if ("error" in resolved) {
      log(resolved.error);
      return { handled: true, exitCode: 1, message: resolved.error };
    }
    try {
      const summary = writeSummaryFiles(root, resolved.traceId);
      log(renderTraceSummaryMarkdown(summary));
      return { handled: true, exitCode: 0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(message);
      return { handled: true, exitCode: 1, message };
    }
  }

  if (hasFlag(argv, "--trace-cleanup")) {
    const id = argFrom(argv, "--trace");
    if (!id) {
      log("cleanup requires --trace <id>. Refusing to delete agent/runs.");
      return { handled: true, exitCode: 1, message: "missing trace id" };
    }
    const result = cleanupTrace(root, id);
    log(`Removed ${result.removed}`);
    return { handled: true, exitCode: 0 };
  }

  const attachFlag = hasFlag(argv, "--trace-attach");
  const attach = argFrom(argv, "--trace-attach");
  if (attachFlag) {
    if (!attach) {
      log("Missing file for --trace-attach. Export Markdown from Cursor's UI and pass the path.");
      return { handled: true, exitCode: 1, message: "missing attach file" };
    }
    const prep = argFrom(argv, "--preparation");
    try {
      const record = attachCursorExport({
        root,
        file: attach,
        preparationIds: prep ? [prep] : undefined,
        traceId: argFrom(argv, "--trace"),
      });
      log(`Attached ${record.sourceFilename} -> ${record.storedPath} (agent actions: ${record.inspection.agentActions})`);
      return { handled: true, exitCode: 0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(message);
      return { handled: true, exitCode: 1, message };
    }
  }

  if (hasFlag(argv, "--trace-stop")) {
    const stopped = stopTraceSession(root);
    if (!stopped) {
      log("No active trace session.");
      return { handled: true, exitCode: 0 };
    }
    log(`TRACE: stopped ${stopped.traceId}`);
    log(`Summary: ${TRACE_DIR_REL}/${stopped.traceId}/summary.md`);
    log("Regenerate with: npm run go -- --trace-summary");
    return { handled: true, exitCode: 0 };
  }

  if (hasFlag(argv, "--trace-start") && !hasWorkflowAction(argv)) {
    const started = startTraceSession({
      root,
      kernel,
      graph,
      label: argFrom(argv, "--trace-label"),
    });
    log(`TRACE: recording ${started.traceId}${started.superseded ? ` (closed ${started.superseded})` : ""}`);
    log("Later go --prepare / --complete join this session. Stop with: npm run go -- --trace-stop");
    return { handled: true, exitCode: 0 };
  }

  return { handled: false, exitCode: 0 };
}

export function maybeStartTraceFromArgv(opts: {
  root: string;
  kernel: string;
  graph: SkillGraph;
  argv: string[];
  log?: (message: string) => void;
}): string | undefined {
  if (!hasFlag(opts.argv, "--trace-start")) return undefined;
  const started = startTraceSession({
    root: opts.root,
    kernel: opts.kernel,
    graph: opts.graph,
    label: argFrom(opts.argv, "--trace-label"),
  });
  (opts.log || console.log)(`TRACE: recording ${started.traceId}${started.superseded ? ` (closed ${started.superseded})` : ""}`);
  return started.traceId;
}
