import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { json, save, type UsageReceipt } from "./artifacts.ts";

type AdapterInfo = { command: string; args: string[] };

const TOKEN_KEYS = ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"];
const OUTPUT_KEYS = ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"];
const TOTAL_KEYS = ["total_tokens", "totalTokens"];
const CACHE_KEYS = ["cache_read_input_tokens", "cacheReadInputTokens", "cache_creation_input_tokens", "cacheCreationInputTokens", "cached_tokens", "cache"];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function num(obj: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function extractUsage(obj: Record<string, unknown>): { inputTokens?: number; outputTokens?: number; totalTokens?: number; cache?: Record<string, unknown>; model?: string; raw: Record<string, unknown> } | undefined {
  const usage = asRecord(obj.usage) || asRecord(asRecord(obj.message)?.usage) || (obj.type === "result" ? asRecord(obj) : undefined);
  if (!usage) return undefined;
  const inputTokens = num(usage, TOKEN_KEYS);
  const outputTokens = num(usage, OUTPUT_KEYS);
  const totalTokens = num(usage, TOTAL_KEYS);
  const cache: Record<string, unknown> = {};
  for (const key of CACHE_KEYS) if (usage[key] !== undefined) cache[key] = usage[key];
  const nestedCache = asRecord(usage.cache);
  if (nestedCache) Object.assign(cache, nestedCache);
  if (inputTokens == null && outputTokens == null && totalTokens == null && !Object.keys(cache).length) return undefined;
  return { inputTokens, outputTokens, totalTokens, cache: Object.keys(cache).length ? cache : undefined, model: typeof obj.model === "string" ? obj.model : undefined, raw: usage };
}

export function parseStreamJsonUsage(log: string): { inputTokens?: number; outputTokens?: number; totalTokens?: number; cache?: Record<string, unknown>; model?: string; raw?: Record<string, unknown>; found: boolean } {
  let found = false;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let totalTokens: number | undefined;
  let cache: Record<string, unknown> | undefined;
  let model: string | undefined;
  let raw: Record<string, unknown> | undefined;
  for (const line of log.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const usage = extractUsage(parsed);
      if (!usage) continue;
      found = true;
      // A terminal session result is an aggregate, not an additional turn.
      if (parsed.type === "result") {
        inputTokens = undefined; outputTokens = undefined; totalTokens = undefined;
      }
      if (usage.inputTokens != null) inputTokens = (inputTokens || 0) + usage.inputTokens;
      if (usage.outputTokens != null) outputTokens = (outputTokens || 0) + usage.outputTokens;
      if (usage.totalTokens != null) totalTokens = (totalTokens || 0) + usage.totalTokens;
      if (usage.cache) cache = { ...(cache || {}), ...usage.cache };
      if (usage.model) model = usage.model;
      raw = usage.raw;
    } catch { /* non-JSON log line */ }
  }
  return { inputTokens, outputTokens, totalTokens, cache, model, raw, found };
}

export type ImageToolRead = {
  path: string;
  hash?: string;
  dataBlobId?: string;
  mimeType?: string;
  success: boolean;
  imagePayload: boolean;
};

function imagePayloadFrom(result: Record<string, unknown> | undefined, rec: Record<string, unknown>): boolean {
  if (!result && !rec) return false;
  const mime = String(result?.mimeType || rec.mimeType || "");
  if (/image\/(png|jpeg|jpg|webp|gif)/i.test(mime)) return true;
  if (present(result?.dataBlobId) || present(rec.dataBlobId)) return true;
  if (present(result?.image) || present(result?.base64) || present(result?.data)) return true;
  const content = result?.content;
  if (Array.isArray(content) && content.some(item => {
    const row = asRecord(item);
    return !!row && (/image/i.test(String(row.type || row.mimeType || "")) || present(row.dataBlobId) || present(row.data));
  })) return true;
  return false;
}

const present = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

function unwrapSuccess(result: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!result) return undefined;
  return asRecord(result.success) || result;
}

function findReadToolCall(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || depth > 10) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findReadToolCall(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const rec = asRecord(value);
  if (!rec) return undefined;
  const direct = asRecord(rec.readToolCall) || asRecord(rec.read_tool_call);
  if (direct) return direct;
  const nestedTool = asRecord(rec.tool_call) || asRecord(rec.toolCall);
  if (nestedTool) {
    const fromTool = findReadToolCall(nestedTool, depth + 1);
    if (fromTool) return fromTool;
  }
  for (const [key, child] of Object.entries(rec)) {
    if (key === "tool_call" || key === "toolCall" || key === "readToolCall" || key === "read_tool_call") continue;
    const found = findReadToolCall(child, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function imageReadFrom(
  parsed: Record<string, unknown>,
  args: Record<string, unknown> | undefined,
  result: Record<string, unknown> | undefined,
  rec: Record<string, unknown>,
): ImageToolRead | undefined {
  const path = String(args?.path || args?.file || result?.path || rec.path || "");
  const mimeType = String(result?.mimeType || rec.mimeType || "") || undefined;
  if (!/\.png($|\?)/i.test(path) && !/png/i.test(mimeType || "")) return undefined;
  const dataBlobId = present(result?.dataBlobId) ? String(result!.dataBlobId) : present(rec.dataBlobId) ? String(rec.dataBlobId) : undefined;
  const success = parsed.isError !== true && parsed.subtype !== "error" && !/error|fail/i.test(String(parsed.subtype || ""));
  return {
    path,
    dataBlobId,
    mimeType,
    hash: present(result?.hash) ? String(result!.hash) : present(rec.hash) ? String(rec.hash) : undefined,
    success,
    imagePayload: imagePayloadFrom(result, rec),
  };
}

export function parseImageToolReads(log: string): ImageToolRead[] {
  const reads: ImageToolRead[] = [];
  for (const line of log.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const type = String(parsed.type || parsed.messageType || "");
      const subtype = String(parsed.subtype || "");
      if (/started|begin/i.test(subtype)) continue;

      const nested = findReadToolCall(parsed);
      if (nested) {
        const completed = /completed|success|result/i.test(subtype) || /result|completed|success/i.test(type);
        const successPayload = asRecord(asRecord(nested.result)?.success);
        if (!completed || !successPayload) continue;
        const args = asRecord(nested.args) || asRecord(nested.arguments);
        const read = imageReadFrom(parsed, args, successPayload, successPayload);
        if (read) reads.push(read);
        continue;
      }

      const name = String(parsed.name || parsed.toolName || asRecord(parsed.message)?.name || "");
      const rec = parsed;
      const args = asRecord(rec.arguments) || asRecord(rec.args) || asRecord(asRecord(rec.message)?.arguments);
      const result = unwrapSuccess(asRecord(rec.result) || asRecord(rec.output));
      const isRead = /read/i.test(type + name) || /read/i.test(String(args?.path || result?.path || rec.path || ""));
      const isResult = /result|completed|success/i.test(type + subtype) || !!result;
      if (!isRead || !isResult) continue;
      const read = imageReadFrom(parsed, args, result, rec);
      if (read) reads.push(read);
    } catch { /* ignore */ }
  }
  return reads;
}

export function usageFromLog(opts: {
  adapter: AdapterInfo;
  nodeId: string;
  role: UsageReceipt["role"];
  outputPath: string;
  durationMs: number;
  startedAt: string;
  status: number | null;
  signal?: string | null;
  timedOut?: boolean;
}): UsageReceipt {
  const interrupted = !!opts.timedOut || opts.signal != null || opts.status == null;
  let parsed = { found: false } as ReturnType<typeof parseStreamJsonUsage>;
  if (existsSync(opts.outputPath)) {
    try { parsed = parseStreamJsonUsage(readFileSync(opts.outputPath, "utf8")); }
    catch { parsed = { found: false }; }
  }
  const unknown = interrupted || !parsed.found;
  return {
    schemaVersion: 1,
    adapter: [opts.adapter.command, ...opts.adapter.args].join(" "),
    model: parsed.model,
    role: opts.role,
    nodeId: opts.nodeId,
    startedAt: opts.startedAt,
    durationMs: opts.durationMs,
    status: interrupted ? "interrupted" : opts.status === 0 ? "ok" : opts.status ? "failed" : "unknown",
    usage: {
      inputTokens: parsed.inputTokens,
      outputTokens: parsed.outputTokens,
      totalTokens: parsed.totalTokens,
      cache: parsed.cache,
      unknown,
      lowerBound: unknown && parsed.found,
    },
    providerRaw: parsed.raw,
  };
}

export function writeUsageReceipt(path: string, receipt: UsageReceipt): void {
  save(path, receipt);
}

export function loadUsageReceipt(path: string): UsageReceipt | undefined {
  return existsSync(path) ? json<UsageReceipt>(path) : undefined;
}

export function receiptName(nodeId: string): string {
  return `${basename(nodeId)}.usage.json`;
}
