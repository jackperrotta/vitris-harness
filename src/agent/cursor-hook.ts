import { spawnSync } from "node:child_process";
import {findHarnessRoot} from '../cli/root.ts';
import {kernelScriptCommand,preferBundledToolArgs} from './kernel-commands.ts';
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { sha256Hex, type StagePreparation } from "./preparation.ts";
import {
  appendJsonl,
  loadManifest,
  loadRecordingSession,
  traceDir,
  TRACE_DIR_REL,
  type FactVisibility,
  type TraceStageSummary,
} from "./trace.ts";

export const CURSOR_EVENT_SCHEMA_VERSION = 1 as const;
export const CURSOR_EVENTS_FILE = "cursor-events.jsonl";
export const VITRIS_HOOK_MARKER = "scripts/cursor-hook.ts";
export const HOOKS_REL = ".cursor/hooks.json";
export const HOOKS_BACKUP_REL = ".cursor/hooks.json.vitris-backup";
export const HOOKS_MALFORMED_REL = ".cursor/hooks.json.malformed";
export const HOOKS_MANIFEST_REL = ".cursor/vitris-trace-hooks.json";

const MAX_COMMAND = 240;
const MAX_ERROR = 240;
const MAX_LABEL = 80;
const MAX_PATHS = 12;
const MAX_RECORD_BYTES = 4096;

export const MANAGED_HOOK_EVENTS = [
  "sessionStart",
  "sessionEnd",
  "beforeSubmitPrompt",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "preCompact",
  "afterAgentResponse",
  "beforeShellExecution",
  "afterShellExecution",
  "beforeMCPExecution",
  "afterMCPExecution",
  "beforeReadFile",
  "afterFileEdit",
] as const;

const PERMISSION_EVENTS = new Set([
  "preToolUse",
  "beforeShellExecution",
  "beforeMCPExecution",
  "beforeReadFile",
  "subagentStart",
]);

export type CursorToolKind = "Read" | "Search" | "Write" | "Shell" | "MCP" | "Task" | "Other";
export type CursorHookPhase = "before" | "success" | "failure" | "lifecycle";

export interface CursorHookEvent {
  schemaVersion: 1;
  source: "cursor_hook";
  eventId: string;
  traceId: string;
  timestamp: string;
  conversationIdHash?: string;
  generationId?: string;
  cursorVersion?: string;
  model?: string;
  modelId?: string;
  hookEvent: string;
  toolUseId?: string;
  toolKind?: CursorToolKind;
  toolName?: string;
  phase: CursorHookPhase;
  durationMs?: number;
  preparationId?: string;
  nodeId?: string;
  paths?: string[];
  cwd?: string;
  exitStatus?: number | string;
  errorSummary?: string;
  queryShape?: { kind: "regex" | "literal" | "unknown"; chars: number };
  resultCount?: number;
  byteCount?: number;
  operation?: "read" | "write" | "edit" | "delete" | "search" | "shell" | "mcp";
  beforeHash?: string;
  afterHash?: string;
  executable?: string;
  commandCategory?: string;
  redactedCommand?: string;
  mcpServer?: string;
  argumentKeys?: string[];
  promptBytes?: number;
  promptHash?: string;
  promptLabel?: string;
  promptText?: string;
  responseBytes?: number;
  responseHash?: string;
  transcript?: { present: boolean; pathHash?: string; coverage: "uninspected" };
  gap?: string;
  truncated?: string[];
  suppliedFields?: string[];
  stdinBytes?: number;
  stdinEncoding?: string;
  integrityHash: string;
}

export interface CursorStageActions {
  reads: { count: number; durationMs: number };
  searches: { count: number; durationMs: number };
  writes: { count: number; durationMs: number };
  shell: { count: number; durationMs: number };
  mcp: { count: number; durationMs: number };
  retries: number;
  eventIds: string[];
  outsideExpectedWrites: string[];
}

export interface CursorHookSummary {
  coverage: "none" | "partial" | "present";
  eventCount: number;
  eventsPath?: string;
  unmatchedBefore: Array<{ eventId: string; toolUseId?: string; toolKind?: string; hookEvent: string }>;
  unmatchedAfter: Array<{ eventId: string; toolUseId?: string; toolKind?: string; hookEvent: string }>;
  gaps: string[];
  conversationEvents: Array<{ eventId: string; hookEvent: string; timestamp: string; gap?: string }>;
  repeatedReads: Array<{ path: string; count: number }>;
  repeatedCommands: Array<{ command: string; count: number }>;
  byPreparation: Record<string, CursorStageActions>;
}

export const CURSOR_HOOK_VISIBILITY: FactVisibility = "observed_by_cursor_hook";

type HookMap = Record<string, Array<Record<string, unknown>>>;

function nowIso(): string {
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function clip(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

export function hookResponseFor(eventName: string | undefined): Record<string, unknown> {
  if (eventName === "beforeSubmitPrompt") return { continue: true };
  if (eventName && PERMISSION_EVENTS.has(eventName)) return { permission: "allow" };
  return {};
}

export function vitrisHookCommand(kernel: string): string {
  return kernelScriptCommand(kernel,'scripts/cursor-hook.ts');
}

function isManagedCommand(command: unknown): boolean {
  return typeof command === "string" && (command.includes("cursor-hook.ts")||command.includes('vitris-cursor-hook.js'));
}

function readHooksFile(root: string): { raw?: string; json?: { version?: number; hooks?: HookMap }; malformed: boolean } {
  const path = join(root, HOOKS_REL);
  if (!existsSync(path)) return { malformed: false };
  const raw = readFileSync(path, "utf8");
  try {
    const json = JSON.parse(raw) as { version?: number; hooks?: HookMap };
    if (!json || typeof json !== "object" || Array.isArray(json)) return { raw, malformed: true };
    return { raw, json, malformed: false };
  } catch {
    return { raw, malformed: true };
  }
}

function countOtherHooks(hooks: HookMap | undefined): number {
  if (!hooks) return 0;
  let n = 0;
  for (const entries of Object.values(hooks)) {
    if (!Array.isArray(entries)) continue;
    n += entries.filter(entry => !isManagedCommand(entry?.command)).length;
  }
  return n;
}

export function installCursorHooks(opts: { root: string; kernel: string }): {
  ok: true;
  created: boolean;
  added: string[];
  updated: string[];
  alreadyPresent: string[];
  preservedOtherHooks: number;
  malformedBackup?: string;
} {
  const hooksPath = join(opts.root, HOOKS_REL);
  mkdirSync(join(opts.root, ".cursor"), { recursive: true });
  const existing = readHooksFile(opts.root);
  let malformedBackup: string | undefined;
  if (existing.raw !== undefined) {
    copyFileSync(hooksPath, join(opts.root, HOOKS_BACKUP_REL));
  }
  let hooks: HookMap = {};
  let created = existing.raw === undefined;
  if (existing.malformed) {
    writeFileSync(join(opts.root, HOOKS_MALFORMED_REL), existing.raw || "", "utf8");
    malformedBackup = HOOKS_MALFORMED_REL;
    created = true;
  } else if (existing.json?.hooks && typeof existing.json.hooks === "object") {
    hooks = existing.json.hooks;
  }
  const command = vitrisHookCommand(opts.kernel);
  const added: string[] = [];
  const updated: string[] = [];
  const alreadyPresent: string[] = [];
  for (const eventName of MANAGED_HOOK_EVENTS) {
    const entries = Array.isArray(hooks[eventName]) ? hooks[eventName] : [];
    const managed = entries.find(entry => isManagedCommand(entry?.command));
    if (!managed) {
      entries.push({ command, timeout: 5, failClosed: false });
      hooks[eventName] = entries;
      added.push(eventName);
    } else if (managed.command !== command || managed.failClosed !== false) {
      managed.command = command;
      managed.timeout = 5;
      managed.failClosed = false;
      hooks[eventName] = entries;
      updated.push(eventName);
    } else {
      alreadyPresent.push(eventName);
    }
  }
  const preservedOtherHooks = countOtherHooks(hooks);
  writeFileSync(hooksPath, JSON.stringify({ version: 1, hooks }, null, 2) + "\n", "utf8");
  writeFileSync(join(opts.root, HOOKS_MANIFEST_REL), JSON.stringify({
    schemaVersion: 1,
    kernel: resolve(opts.kernel),
    command,
    events: [...MANAGED_HOOK_EVENTS],
    installedAt: nowIso(),
    createdFile: created,
    failClosed: false,
  }, null, 2) + "\n", "utf8");
  return { ok: true, created, added, updated, alreadyPresent, preservedOtherHooks, malformedBackup };
}

export function cursorHooksStatus(root: string): {
  installed: boolean;
  events: string[];
  missing: string[];
  preservedOtherHooks: number;
  malformed: boolean;
  backup: boolean;
} {
  const existing = readHooksFile(root);
  const present = new Set<string>();
  if (!existing.malformed && existing.json?.hooks) {
    for (const [eventName, entries] of Object.entries(existing.json.hooks)) {
      if (Array.isArray(entries) && entries.some(entry => isManagedCommand(entry?.command))) present.add(eventName);
    }
  }
  return {
    installed: present.size > 0,
    events: [...present],
    missing: MANAGED_HOOK_EVENTS.filter(eventName => !present.has(eventName)),
    preservedOtherHooks: countOtherHooks(existing.json?.hooks),
    malformed: existing.malformed,
    backup: existsSync(join(root, HOOKS_BACKUP_REL)),
  };
}

export function removeCursorHooks(root: string): { ok: true; removed: string[]; remainingOtherHooks: number } {
  const existing = readHooksFile(root);
  if (!existing.json || existing.malformed) {
    return { ok: true, removed: [], remainingOtherHooks: 0 };
  }
  const removed: string[] = [];
  const hooks: HookMap = {};
  for (const [eventName, entries] of Object.entries(existing.json.hooks || {})) {
    if (!Array.isArray(entries)) continue;
    const kept = entries.filter(entry => !isManagedCommand(entry?.command));
    if (kept.length !== entries.length) removed.push(eventName);
    if (kept.length) hooks[eventName] = kept;
  }
  const remainingOtherHooks = countOtherHooks(hooks);
  if (!remainingOtherHooks && removed.length) {
    const manifestPath = join(root, HOOKS_MANIFEST_REL);
    let createdFile = false;
    try {
      createdFile = JSON.parse(readFileSync(manifestPath, "utf8")).createdFile === true;
    } catch { /* ignore */ }
    if (createdFile && !existsSync(join(root, HOOKS_BACKUP_REL))) {
      writeFileSync(join(root, HOOKS_REL), JSON.stringify({ version: 1, hooks: {} }, null, 2) + "\n", "utf8");
    } else {
      writeFileSync(join(root, HOOKS_REL), JSON.stringify({ version: existing.json.version || 1, hooks }, null, 2) + "\n", "utf8");
    }
  } else {
    writeFileSync(join(root, HOOKS_REL), JSON.stringify({ version: existing.json.version || 1, hooks }, null, 2) + "\n", "utf8");
  }
  return { ok: true, removed, remainingOtherHooks };
}

const SECRET = /((sk-[A-Za-z0-9]{8,})|(ghp_[A-Za-z0-9]{8,})|(xox[baprs]-[A-Za-z0-9-]{8,})|(AKIA[0-9A-Z]{8,})|(Bearer\s+\S+)|((api[_-]?key|token|password|secret|authorization)\s*[=:]\s*\S+))/gi;

export function redactCommand(command: string): { text: string; truncated: boolean } {
  let text = command.replace(/(^|[\s;&|])([A-Za-z_][A-Za-z0-9_]*)=([^\s;&|]+)/g, "$1[env]");
  text = text.replace(/https?:\/\/[^\s"'`]+/gi, (url) => {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}${parsed.search ? "?[query]" : ""}`;
    } catch {
      return "[url]";
    }
  });
  text = text.replace(/authorization\s*[:=]\s*(?:bearer\s+)?\S+/gi, "authorization:[redacted]");
  text = text.replace(/\bbearer\s+\S+/gi, "[redacted]");
  text = text.replace(SECRET, "[redacted]");
  return clip(text, MAX_COMMAND);
}

function commandCategory(executable: string | undefined): string {
  const name = (executable || "").toLowerCase();
  if (name === "git") return "git";
  if (name === "npm" || name === "npx" || name === "node") return "node";
  if (name === "pwsh" || name === "powershell" || name === "cmd" || name === "bash" || name === "sh") return "shell";
  return name ? "other" : "unknown";
}

function firstExecutable(command: string): string | undefined {
  const cleaned = command.trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)+/, "");
  const token = cleaned.split(/\s+/)[0]?.replace(/^["']|["']$/g, "");
  if (!token) return undefined;
  return basename(token).replace(/\.exe$/i, "").replace(/\.cmd$/i, "");
}

function safePath(root: string, value: string): string {
  const norm = value.replaceAll("\\", "/");
  if (!isAbsolute(value) && !norm.startsWith("~/")) return norm;
  const rel = relative(resolve(root), resolve(value));
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel.replaceAll("\\", "/");
  const home = homedir();
  if (value.startsWith(home)) return ("~/" + value.slice(home.length)).replaceAll("\\", "/").replace(/\/+/g, "/");
  return `outside:${basename(value)}`;
}

function safeCwd(root: string, cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  return safePath(root, cwd);
}

function pushTruncation(target: string[], field: string): void {
  if (!target.includes(field)) target.push(field);
}

function toolKindOf(hookEvent: string, toolName: string | undefined): CursorToolKind {
  if (hookEvent.includes("MCP")) return "MCP";
  if (hookEvent.includes("Shell")) return "Shell";
  if (hookEvent === "beforeReadFile" || hookEvent === "afterFileEdit") {
    return hookEvent === "beforeReadFile" ? "Read" : "Write";
  }
  const name = (toolName || hookEvent).toLowerCase();
  if (name === "read") return "Read";
  if (name.includes("grep") || name.includes("glob") || name.includes("search") || name === "rg") return "Search";
  if (name === "write" || name === "edit" || name === "strreplace" || name === "delete") return "Write";
  if (name === "shell") return "Shell";
  if (name.startsWith("mcp")) return "MCP";
  if (name === "task") return "Task";
  return "Other";
}

function phaseOf(hookEvent: string): CursorHookPhase {
  if (hookEvent === "postToolUseFailure") return "failure";
  if (hookEvent.startsWith("before") || hookEvent === "preToolUse" || hookEvent === "beforeSubmitPrompt") return "before";
  if (hookEvent.startsWith("after") || hookEvent === "postToolUse") return "success";
  return "lifecycle";
}

function hashId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (process.env.VITRIS_TRACE_RAW_CONVERSATION_ID === "1") return value;
  return sha256Hex(value);
}

function argumentKeys(value: unknown, truncated: string[]): string[] | undefined {
  const record = typeof value === "string" ? (() => { try { return JSON.parse(value) as unknown; } catch { return undefined; } })() : value;
  if (!record || typeof record !== "object" || Array.isArray(record)) return undefined;
  const keys = Object.keys(record as Record<string, unknown>).map(key => /token|secret|password|authorization|api[_-]?key|email/i.test(key) ? "[redacted-key]" : key);
  if (keys.length > 24) {
    pushTruncation(truncated, "argumentKeys");
    return keys.slice(0, 24);
  }
  return keys;
}

function queryShape(value: unknown): { kind: "regex" | "literal" | "unknown"; chars: number } | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const kind = /[\\^$.*+?()[\]{}|]/.test(value) ? "regex" : "literal";
  return { kind, chars: value.length };
}

function byteLength(value: unknown): number | undefined {
  if (typeof value === "string") return Buffer.byteLength(value);
  if (value === undefined || value === null) return undefined;
  try { return Buffer.byteLength(JSON.stringify(value)); } catch { return undefined; }
}

function resultCountOf(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? (() => { try { return JSON.parse(value) as unknown; } catch { return undefined; } })() : value;
  if (Array.isArray(parsed)) return parsed.length;
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    for (const key of ["matches", "results", "files", "workspaces"]) {
      if (Array.isArray(record[key])) return record[key].length;
    }
    if (typeof record.exitCode === "number") return undefined;
  }
  return undefined;
}

function exitStatusOf(payload: Record<string, unknown>, output: unknown): number | string | undefined {
  if (typeof payload.exit_code === "number") return payload.exit_code;
  if (typeof payload.exitCode === "number") return payload.exitCode;
  const parsed = typeof output === "string" ? (() => { try { return JSON.parse(output) as Record<string, unknown>; } catch { return undefined; } })() : asRecord(output);
  if (parsed && typeof parsed.exitCode === "number") return parsed.exitCode;
  if (typeof payload.failure_type === "string") return payload.failure_type;
  return undefined;
}

function activePreparation(root: string, atIso: string): { id: string; nodeId: string; expectedOutputs: string[] } | undefined {
  const dir = join(root, "agent/preparations");
  if (!existsSync(dir)) return undefined;
  const at = Date.parse(atIso);
  let best: StagePreparation | undefined;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const prep = JSON.parse(readFileSync(join(dir, name), "utf8")) as StagePreparation;
      const start = Date.parse(prep.preparedAt);
      const end = prep.consumedAt ? Date.parse(prep.consumedAt) : Number.POSITIVE_INFINITY;
      if (!Number.isFinite(start) || at < start || at > end) continue;
      if (!best || start >= Date.parse(best.preparedAt)) best = prep;
    } catch { /* ignore unreadable preparations */ }
  }
  if (!best) return undefined;
  return { id: best.id, nodeId: best.nodeId, expectedOutputs: best.expectedOutputs || [] };
}

function integrityOf(record: Omit<CursorHookEvent, "integrityHash">): string {
  return sha256Hex(JSON.stringify(record));
}

function promptLabel(root: string, truncated: string[]): string | undefined {
  const fromEnv = process.env.VITRIS_TRACE_PROMPT_LABEL;
  const file = join(root, TRACE_DIR_REL, "prompt-label.txt");
  const raw = fromEnv || (existsSync(file) ? readFileSync(file, "utf8") : "");
  if (!raw.trim()) return undefined;
  const redacted = redactCommand(raw.trim());
  const clipped = clip(redacted.text, MAX_LABEL);
  if (redacted.truncated || clipped.truncated) pushTruncation(truncated, "promptLabel");
  return clipped.text;
}

export function sanitizeCursorHookPayload(opts: {
  root: string;
  traceId: string;
  payload: unknown;
  timestamp?: string;
  existingEventCount?: number;
}): CursorHookEvent | undefined {
  const payload = asRecord(opts.payload);
  const hookEvent = asString(payload.hook_event_name) || "unknown";
  if (hookEvent === "afterAgentThought") return undefined;
  const truncated: string[] = [];
  const timestamp = opts.timestamp || nowIso();
  const toolName = asString(payload.tool_name);
  const toolInput = asRecord(payload.tool_input);
  const phase = phaseOf(hookEvent);
  const toolKind = toolKindOf(hookEvent, toolName);
  const paths: string[] = [];
  const addPath = (value: unknown) => {
    if (typeof value !== "string" || !value) return;
    const safe = safePath(opts.root, value);
    if (!paths.includes(safe)) paths.push(safe);
  };
  addPath(payload.file_path);
  addPath(toolInput.path);
  addPath(toolInput.file_path);
  addPath(toolInput.target_file);
  if (Array.isArray(payload.modified_files)) {
    for (const file of payload.modified_files) addPath(file);
  }
  if (paths.length > MAX_PATHS) {
    paths.length = MAX_PATHS;
    pushTruncation(truncated, "paths");
  }

  const command = asString(payload.command) || asString(toolInput.command);
  let redactedCommand: string | undefined;
  let executable: string | undefined;
  if (command && (toolKind === "Shell" || hookEvent.toLowerCase().includes("shell"))) {
    const redacted = redactCommand(command);
    redactedCommand = redacted.text;
    if (redacted.truncated) pushTruncation(truncated, "redactedCommand");
    executable = firstExecutable(command);
  }

  const content = payload.content ?? toolInput.contents ?? toolInput.content;
  const edits = Array.isArray(payload.edits) ? payload.edits as Array<Record<string, unknown>> : [];
  const oldString = edits.map(edit => asString(edit.old_string)).filter(Boolean).join("\n");
  const newString = edits.map(edit => asString(edit.new_string)).filter(Boolean).join("\n");
  const output = payload.tool_output ?? payload.output ?? payload.result_json;
  const error = asString(payload.error_message);
  let errorSummary: string | undefined;
  if (error) {
    const redacted = redactCommand(error);
    const clipped = clip(redacted.text, MAX_ERROR);
    errorSummary = clipped.text;
    if (redacted.truncated || clipped.truncated) pushTruncation(truncated, "errorSummary");
  }

  const prompt = asString(payload.prompt);
  const response = hookEvent === "afterAgentResponse" ? asString(payload.text) : undefined;
  const includePrompt = process.env.VITRIS_TRACE_PROMPT_TEXT === "1";
  const transcriptPath = asString(payload.transcript_path);
  const prep = activePreparation(opts.root, timestamp);
  const operation = toolKind === "Read" ? "read"
    : toolKind === "Search" ? "search"
      : hookEvent === "afterFileEdit" ? "edit"
        : toolName?.toLowerCase() === "delete" ? "delete"
          : toolKind === "Write" ? "write"
            : toolKind === "Shell" ? "shell"
              : toolKind === "MCP" ? "mcp"
                : undefined;

  const record: Omit<CursorHookEvent, "integrityHash"> = {
    schemaVersion: CURSOR_EVENT_SCHEMA_VERSION,
    source: "cursor_hook",
    eventId: randomUUID(),
    traceId: opts.traceId,
    timestamp,
    conversationIdHash: hashId(asString(payload.conversation_id)),
    generationId: asString(payload.generation_id),
    cursorVersion: asString(payload.cursor_version),
    model: asString(payload.model),
    modelId: asString(payload.model_id),
    hookEvent,
    toolUseId: asString(payload.tool_use_id) || asString(payload.tool_call_id),
    toolKind,
    toolName,
    phase,
    durationMs: typeof payload.duration === "number" ? payload.duration : typeof payload.duration_ms === "number" ? payload.duration_ms : undefined,
    preparationId: prep?.id,
    nodeId: prep?.nodeId,
    paths: paths.length ? paths : undefined,
    cwd: safeCwd(opts.root, asString(payload.cwd) || asString(toolInput.working_directory)),
    exitStatus: exitStatusOf(payload, output),
    errorSummary,
    queryShape: queryShape(toolInput.pattern ?? toolInput.query ?? toolInput.glob),
    resultCount: resultCountOf(output),
    byteCount: byteLength(content) ?? byteLength(output),
    operation,
    beforeHash: oldString ? sha256Hex(oldString) : undefined,
    afterHash: newString ? sha256Hex(newString) : undefined,
    executable,
    commandCategory: executable ? commandCategory(executable) : undefined,
    redactedCommand,
    mcpServer: asString(payload.mcp_server_name),
    argumentKeys: toolKind === "MCP" ? argumentKeys(payload.tool_input, truncated) : undefined,
    promptBytes: prompt ? Buffer.byteLength(prompt) : undefined,
    promptHash: prompt ? sha256Hex(prompt) : undefined,
    promptLabel: prompt ? promptLabel(opts.root, truncated) : undefined,
    promptText: includePrompt && prompt ? clip(prompt, MAX_COMMAND).text : undefined,
    responseBytes: response ? Buffer.byteLength(response) : undefined,
    responseHash: response ? sha256Hex(response) : undefined,
    transcript: transcriptPath || payload.transcript_path === null
      ? {
          present: Boolean(transcriptPath),
          pathHash: transcriptPath ? sha256Hex(transcriptPath) : undefined,
          coverage: "uninspected",
        }
      : undefined,
    gap: asString(payload._stdinGap)
      || (hookEvent === "sessionStart" && (opts.existingEventCount || 0) > 0
        ? "session_restart"
        : !prep && phase !== "lifecycle" ? "no_active_preparation" : undefined),
    truncated: truncated.length ? truncated : undefined,
    suppliedFields: Object.keys(payload).filter(key => key !== "user_email" && !key.startsWith("_stdin")).concat(Object.prototype.hasOwnProperty.call(payload, "user_email") ? ["user_email:omitted"] : []).slice(0, 40),
    stdinBytes: typeof payload._stdinBytes === "number" ? payload._stdinBytes : undefined,
    stdinEncoding: asString(payload._stdinEncoding),
  };
  if (record.promptText && record.promptText.length < (prompt?.length || 0)) pushTruncation(record.truncated ||= [], "promptText");
  const hashed = integrityOf(record);
  const event: CursorHookEvent = { ...record, integrityHash: hashed };
  const encoded = JSON.stringify(event);
  if (Buffer.byteLength(encoded) > MAX_RECORD_BYTES) {
    event.redactedCommand = undefined;
    event.promptText = undefined;
    event.errorSummary = event.errorSummary ? clip(event.errorSummary, 80).text : undefined;
    pushTruncation(event.truncated ||= [], "record");
    const { integrityHash: _ignored, ...rest } = event;
    event.integrityHash = integrityOf(rest);
  }
  return event;
}

function warnHook(root: string, traceId: string, message: string): void {
  const manifest = loadManifest(root, traceId);
  if (!manifest) return;
  manifest.warnings.push({ timestamp: nowIso(), message: `cursor_hook: ${message}`, kind: "cursor_hook" });
  writeFileSync(join(traceDir(root, traceId), "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

export function handleCursorHook(opts: { root: string; payload: unknown }): { response: Record<string, unknown>; wrote: boolean; warning?: string } {
  const payload = asRecord(opts.payload);
  const hookEvent = asString(payload.hook_event_name);
  const response = hookResponseFor(hookEvent);
  try {
    const session = loadRecordingSession(opts.root);
    if (!session) return { response, wrote: false };
    const eventsPath = join(traceDir(opts.root, session.manifest.traceId), CURSOR_EVENTS_FILE);
    const existingEventCount = existsSync(eventsPath) ? readCursorEvents(opts.root, session.manifest.traceId).length : 0;
    const event = sanitizeCursorHookPayload({
      root: opts.root,
      traceId: session.manifest.traceId,
      payload,
      existingEventCount,
    });
    if (!event) return { response, wrote: false };
    appendJsonl(eventsPath, event);
    return { response, wrote: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      const session = loadRecordingSession(opts.root);
      if (session) warnHook(opts.root, session.manifest.traceId, message);
    } catch { /* logging must not block Cursor */ }
    return { response, wrote: false, warning: message };
  }
}

export function readCursorEvents(root: string, traceId: string): CursorHookEvent[] {
  const path = join(traceDir(root, traceId), CURSOR_EVENTS_FILE);
  if (!existsSync(path)) return [];
  const events: CursorHookEvent[] = [];
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
      events.push(JSON.parse(line) as CursorHookEvent);
    } catch {
      const torn = index === lines.length - 1 || (index === lines.length - 2 && !lines[lines.length - 1]?.trim());
      if (!torn) return;
    }
  });
  return events;
}

function emptyCounts(): { count: number; durationMs: number } {
  return { count: 0, durationMs: 0 };
}

function addCount(bucket: { count: number; durationMs: number }, duration: number | undefined): void {
  bucket.count += 1;
  if (typeof duration === "number" && Number.isFinite(duration)) bucket.durationMs += duration;
}

export function summarizeCursorHooks(root: string, traceId: string, stages: TraceStageSummary[]): { stages: TraceStageSummary[]; cursorHooks: CursorHookSummary } {
  const events = readCursorEvents(root, traceId);
  const eventsPath = `${TRACE_DIR_REL}/${traceId}/${CURSOR_EVENTS_FILE}`;
  const byTool = new Map<string, { before?: CursorHookEvent; after?: CursorHookEvent }>();
  for (const event of events) {
    if (!event.toolUseId || event.phase === "lifecycle") continue;
    const pair = byTool.get(event.toolUseId) || {};
    if (event.phase === "before") pair.before = event;
    else pair.after = event;
    byTool.set(event.toolUseId, pair);
  }
  const unmatchedBefore = events.filter(event => event.phase === "before" && event.toolUseId && !byTool.get(event.toolUseId)?.after)
    .map(event => ({ eventId: event.eventId, toolUseId: event.toolUseId, toolKind: event.toolKind, hookEvent: event.hookEvent }));
  const unmatchedAfter = events.filter(event => (event.phase === "success" || event.phase === "failure") && event.toolUseId && !byTool.get(event.toolUseId)?.before)
    .map(event => ({ eventId: event.eventId, toolUseId: event.toolUseId, toolKind: event.toolKind, hookEvent: event.hookEvent }));

  const stageByPrep = new Map(stages.filter(stage => stage.preparationId).map(stage => [stage.preparationId!, stage]));
  const actions = new Map<string, CursorStageActions>();
  const ensure = (prepId: string): CursorStageActions => {
    const existing = actions.get(prepId);
    if (existing) return existing;
    const created: CursorStageActions = {
      reads: emptyCounts(), searches: emptyCounts(), writes: emptyCounts(), shell: emptyCounts(), mcp: emptyCounts(),
      retries: 0, eventIds: [], outsideExpectedWrites: [],
    };
    actions.set(prepId, created);
    return created;
  };

  const counted = new Set<string>();
  const representative: CursorHookEvent[] = [];
  for (const event of events) {
    if (event.phase === "lifecycle") continue;
    const pair = event.toolUseId ? byTool.get(event.toolUseId) : undefined;
    const isRepresentative = !event.toolUseId
      || event.phase === "success"
      || event.phase === "failure"
      || (event.phase === "before" && !pair?.after);
    if (!isRepresentative) continue;
    const key = event.toolUseId || event.eventId;
    if (counted.has(key)) continue;
    counted.add(key);
    representative.push(event);
    if (!event.preparationId) continue;
    const bucket = ensure(event.preparationId);
    if (!bucket.eventIds.includes(event.eventId)) bucket.eventIds.push(event.eventId);
    if (pair?.before && !bucket.eventIds.includes(pair.before.eventId)) bucket.eventIds.push(pair.before.eventId);
    const duration = event.durationMs ?? (pair?.before && event.phase !== "before" ? Math.max(0, Date.parse(event.timestamp) - Date.parse(pair.before.timestamp)) : undefined);
    if (event.toolKind === "Read") addCount(bucket.reads, duration);
    else if (event.toolKind === "Search") addCount(bucket.searches, duration);
    else if (event.toolKind === "Write") addCount(bucket.writes, duration);
    else if (event.toolKind === "Shell") addCount(bucket.shell, duration);
    else if (event.toolKind === "MCP") addCount(bucket.mcp, duration);
    if (event.phase === "failure") bucket.retries += 1;
    if (event.toolKind === "Write" && event.paths?.length) {
      const stage = stageByPrep.get(event.preparationId);
      const prepPath = join(root, "agent/preparations", `${event.preparationId}.json`);
      let expected: string[] = [];
      if (existsSync(prepPath)) {
        try { expected = (JSON.parse(readFileSync(prepPath, "utf8")) as StagePreparation).expectedOutputs || []; } catch { /* ignore */ }
      }
      if (stage && expected.length) {
        for (const path of event.paths) {
          const allowed = expected.some(item => path === item || path.startsWith(`${item.replace(/\/$/, "")}/`));
          if (!allowed && !bucket.outsideExpectedWrites.includes(path)) bucket.outsideExpectedWrites.push(path);
        }
      }
    }
  }

  for (const stage of stages) {
    if (!stage.preparationId) continue;
    const bucket = actions.get(stage.preparationId);
    if (!bucket || !bucket.eventIds.length) continue;
    stage.cursorActions = bucket;
    stage.evidence.push({
      fact: "cursor hook actions",
      visibility: CURSOR_HOOK_VISIBILITY,
      path: eventsPath,
    });
  }

  const readCounts = new Map<string, number>();
  const commandCounts = new Map<string, number>();
  for (const event of representative) {
    if (event.toolKind === "Read") {
      for (const path of event.paths || []) readCounts.set(path, (readCounts.get(path) || 0) + 1);
    }
    if (event.redactedCommand) commandCounts.set(event.redactedCommand, (commandCounts.get(event.redactedCommand) || 0) + 1);
  }
  const status = cursorHooksStatus(root);
  const gaps = [
    "Events that arrived before trace start were not recorded.",
    "Hook records are minimized observations, not a complete model transcript. Hidden reasoning is omitted.",
    "Agent token usage stays unknown unless measured counters are supplied for the same conversation. Prompt size is only a proxy.",
  ];
  if (!events.length && !status.installed) gaps.push("No Cursor hooks are installed for this site, so hook coverage is absent.");
  if (!events.length && status.installed) gaps.push("Hooks are installed but this trace has no hook events. They may be disabled, not reloaded, or the agent was idle.");
  if (events.some(event => event.gap === "session_restart")) gaps.push("A sessionStart arrived after earlier hook events, which indicates a Cursor restart or a new composer session.");
  if (unmatchedBefore.length) gaps.push(`${unmatchedBefore.length} pre-tool event(s) have no matching post event.`);
  if (unmatchedAfter.length) gaps.push(`${unmatchedAfter.length} post-tool event(s) have no matching pre event.`);
  const stageWindows = stages.filter(stage => stage.preparedAt);
  if (stageWindows.length && !events.length) gaps.push("Kernel stages have no overlapping Cursor hook coverage.");

  return {
    stages,
    cursorHooks: {
      coverage: events.length ? (unmatchedBefore.length || unmatchedAfter.length ? "partial" : "present") : "none",
      eventCount: events.length,
      eventsPath: events.length ? eventsPath : undefined,
      unmatchedBefore,
      unmatchedAfter,
      gaps,
      conversationEvents: events.filter(event => !event.preparationId).map(event => ({
        eventId: event.eventId,
        hookEvent: event.hookEvent,
        timestamp: event.timestamp,
        gap: event.gap,
      })),
      repeatedReads: [...readCounts.entries()].filter(([, count]) => count > 1).map(([path, count]) => ({ path, count })),
      repeatedCommands: [...commandCounts.entries()].filter(([, count]) => count > 1).map(([command, count]) => ({ command, count })),
      byPreparation: Object.fromEntries(actions),
    },
  };
}

export function renderCursorHookMarkdown(summary: CursorHookSummary): string[] {
  const lines = ["## Cursor hook observations", ""];
  lines.push(`- Coverage: ${summary.coverage}`);
  lines.push(`- Events: ${summary.eventCount}${summary.eventsPath ? ` (${summary.eventsPath})` : ""}`);
  lines.push("- These rows are observed_by_cursor_hook. They do not replace kernel prompt, evaluator, or tool-receipt facts.");
  if (summary.conversationEvents.length) {
    lines.push("- Conversation-level events (no preparation was active):");
    for (const event of summary.conversationEvents) lines.push(`  - ${event.eventId} ${event.hookEvent}${event.gap ? ` (${event.gap})` : ""}`);
  }
  if (summary.unmatchedBefore.length || summary.unmatchedAfter.length) {
    lines.push("- Unmatched pre/post events:");
    for (const event of summary.unmatchedBefore) lines.push(`  - before ${event.eventId} ${event.toolKind || event.hookEvent} ${event.toolUseId || ""}`);
    for (const event of summary.unmatchedAfter) lines.push(`  - after ${event.eventId} ${event.toolKind || event.hookEvent} ${event.toolUseId || ""}`);
  }
  if (summary.repeatedReads.length) {
    lines.push("- Repeated reads:");
    for (const item of summary.repeatedReads) lines.push(`  - ${item.count} ${item.path}`);
  }
  if (summary.repeatedCommands.length) {
    lines.push("- Repeated commands:");
    for (const item of summary.repeatedCommands) lines.push(`  - ${item.count} ${item.command}`);
  }
  lines.push("- Coverage gaps:");
  for (const gap of summary.gaps) lines.push(`  - ${gap}`);
  lines.push("");
  return lines;
}

export function runCursorHookProcess(root: string, payload: unknown): { status: number | null; stdout: string; stderr: string } {
  const kernel=findHarnessRoot(),script=resolve(kernel, "scripts/cursor-hook.ts");
  const child = spawnSync(process.execPath, preferBundledToolArgs(kernel,["--experimental-strip-types", script]), {
    cwd: root,
    input: JSON.stringify(payload),
    encoding: "utf8",
    windowsHide: true,
  });
  return { status: child.status, stdout: child.stdout || "", stderr: child.stderr || "" };
}
