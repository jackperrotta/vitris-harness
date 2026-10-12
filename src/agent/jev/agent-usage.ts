import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { UsageReceipt } from "../artifacts.ts";
import { isPathConfined } from "./security.ts";

export type AgentUsageSource = "host_export" | "structured_log" | "manual_host_report" | "unavailable";
export type AgentUsageCoverage = "measured" | "partial" | "unknown";

export interface AgentAttemptReceipt {
  schemaVersion: 1;
  receiptId: string;
  runId?: string;
  arm?: "A" | "B" | "C";
  nodeId: string;
  preparationId: string;
  attemptId: string;
  kind: "agent" | "tool" | "critic";
  provider?: string;
  model?: string;
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  wallTimeMs?: number;
  source: AgentUsageSource;
  coverage: AgentUsageCoverage;
  rawEvidencePath?: string;
  rawEvidenceHash?: string;
  createdAt: string;
}

export function agentUsageDir(root: string): string {
  return join(root, "agent/runs/usage");
}

export function logicalUsageKey(opts: {
  runId?: string;
  nodeId: string;
  preparationId: string;
  attemptId: string;
}): string {
  return [opts.runId || "_", opts.nodeId, opts.preparationId, opts.attemptId]
    .map(p => String(p).replace(/[^A-Za-z0-9._-]+/g, "_"))
    .join("__");
}

function receiptFingerprint(receipt: AgentAttemptReceipt): string {
  return JSON.stringify({
    runId: receipt.runId,
    nodeId: receipt.nodeId,
    preparationId: receipt.preparationId,
    attemptId: receipt.attemptId,
    kind: receipt.kind,
    inputTokens: receipt.inputTokens,
    outputTokens: receipt.outputTokens,
    cacheReadTokens: receipt.cacheReadTokens,
    source: receipt.source,
    coverage: receipt.coverage,
    model: receipt.model,
  });
}

export function writeAgentAttemptReceipt(root: string, receipt: AgentAttemptReceipt): string {
  const dir = agentUsageDir(root);
  mkdirSync(dir, { recursive: true });
  const key = logicalUsageKey(receipt);
  const path = join(dir, `${key}.json`);
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, "utf8")) as AgentAttemptReceipt;
    if (receiptFingerprint(existing) === receiptFingerprint(receipt)) return path;
    throw new Error(`Agent usage logical key ${key} already exists with different content and must not be overwritten.`);
  }
  if (receipt.receiptId) {
    const uuidPath = join(dir, `${receipt.receiptId}.json`);
    if (existsSync(uuidPath) && uuidPath !== path) {
      throw new Error(`Agent usage receipt ${receipt.receiptId} already exists and must not be overwritten.`);
    }
  }
  writeFileSync(path, JSON.stringify(receipt, null, 2), "utf8");
  return path;
}

export function recordAgentStageAttempt(opts: {
  root: string;
  nodeId: string;
  preparationId: string;
  attemptId: string;
  kind: "agent" | "tool" | "critic";
  runId?: string;
  arm?: "A" | "B" | "C";
  provider?: string;
  model?: string;
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  wallTimeMs?: number;
  source: AgentUsageSource;
  rawEvidencePath?: string;
  rawEvidenceHash?: string;
  adapterReceipt?: UsageReceipt;
}): AgentAttemptReceipt {
  let inputTokens = opts.inputTokens;
  let outputTokens = opts.outputTokens;
  let cacheReadTokens = opts.cacheReadTokens;
  let source = opts.source;
  let rawEvidenceHash: string | undefined;
  if (opts.adapterReceipt) {
    const u = opts.adapterReceipt.usage;
    if (typeof u.inputTokens === "number") inputTokens = u.inputTokens;
    if (typeof u.outputTokens === "number") outputTokens = u.outputTokens;
    const cache = u.cache || {};
    const cacheNum = Object.values(cache).find(v => typeof v === "number") as number | undefined;
    if (typeof cacheNum === "number") cacheReadTokens = cacheNum;
    if (u.unknown) source = source === "manual_host_report" ? source : "unavailable";
    rawEvidenceHash = createHash("sha256").update(JSON.stringify(opts.adapterReceipt)).digest("hex");
  }
  if (opts.rawEvidencePath && existsSync(opts.rawEvidencePath)) {
    rawEvidenceHash = createHash("sha256").update(readFileSync(opts.rawEvidencePath)).digest("hex");
  }
  if (opts.rawEvidenceHash) rawEvidenceHash = opts.rawEvidenceHash;
  const hasBoth = typeof inputTokens === "number" && typeof outputTokens === "number";
  const hasTokens = typeof inputTokens === "number" || typeof outputTokens === "number";
  let coverage: AgentUsageCoverage = "unknown";
  if (opts.kind === "tool") coverage = "measured";
  else if (source === "unavailable" || !hasTokens) coverage = "unknown";
  else if (source === "manual_host_report") coverage = hasBoth ? "partial" : "unknown";
  else coverage = hasBoth ? "measured" : "partial";

  const receipt: AgentAttemptReceipt = {
    schemaVersion: 1,
    receiptId: randomUUID(),
    runId: opts.runId,
    arm: opts.arm,
    nodeId: opts.nodeId,
    preparationId: opts.preparationId,
    attemptId: opts.attemptId,
    kind: opts.kind,
    provider: opts.provider,
    model: opts.model || opts.adapterReceipt?.model,
    sessionId: opts.sessionId,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens: opts.cacheWriteTokens,
    wallTimeMs: opts.wallTimeMs,
    source,
    coverage,
    rawEvidencePath: opts.rawEvidencePath,
    rawEvidenceHash,
    createdAt: new Date().toISOString(),
  };
  writeAgentAttemptReceipt(opts.root, receipt);
  return receipt;
}

export function loadAgentAttemptReceipts(root: string): AgentAttemptReceipt[] {
  const dir = agentUsageDir(root);
  if (!existsSync(dir)) return [];
  const seenUuid = new Set<string>();
  const seenLogical = new Set<string>();
  const out: AgentAttemptReceipt[] = [];
  for (const f of readdirSync(dir).filter(n => n.endsWith(".json"))) {
    try {
      const rec = JSON.parse(readFileSync(join(dir, f), "utf8")) as AgentAttemptReceipt;
      if (!rec?.receiptId) continue;
      const key = logicalUsageKey(rec);
      if (seenLogical.has(key) || seenUuid.has(rec.receiptId)) continue;
      seenLogical.add(key);
      seenUuid.add(rec.receiptId);
      out.push(rec);
    } catch { /* ignore */ }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export interface AgentUsageAggregate {
  coverage: AgentUsageCoverage | "incomplete";
  attempts: number;
  agentAttempts: number;
  toolAttempts: number;
  criticAttempts: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  unknownAttempts: number;
  missingRequired: boolean;
  byNode: Record<string, { coverage: AgentUsageCoverage | "incomplete"; inputTokens?: number; outputTokens?: number; attempts: number }>;
}

export interface RunScopeMatch {
  runId?: string;
  arm?: "A" | "B" | "C";
  provider?: string;
  model?: string;
  sessionId?: string;
}

function finiteToken(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function selectAuthoritativeRunReceipt(
  receipts: AgentAttemptReceipt[],
  scope?: RunScopeMatch,
): { receipt?: AgentAttemptReceipt; conflict: boolean } {
  const eligible = receipts.filter(receipt => {
    if (receipt.nodeId !== "_run" || receipt.source !== "host_export" || receipt.coverage !== "measured") return false;
    if (!finiteToken(receipt.inputTokens) || !finiteToken(receipt.outputTokens)) return false;
    if (scope?.runId && receipt.runId !== scope.runId) return false;
    if (scope?.arm && receipt.arm !== scope.arm) return false;
    if (scope?.provider && receipt.provider !== scope.provider) return false;
    if (scope?.model && receipt.model !== scope.model) return false;
    if (scope?.sessionId && receipt.sessionId !== scope.sessionId) return false;
    return true;
  });
  if (eligible.length > 1) return { conflict: true };
  return { receipt: eligible[0], conflict: false };
}

export function aggregateAgentUsage(receipts: AgentAttemptReceipt[], requiredAgentNodes?: string[], scope?: RunScopeMatch): AgentUsageAggregate {
  const selected = selectAuthoritativeRunReceipt(receipts, scope);
  const perAttempt = receipts.filter(r => r.nodeId !== "_run" && r.kind !== "tool");
  const byNode: AgentUsageAggregate["byNode"] = {};
  let agentAttempts = 0;
  let criticAttempts = 0;
  const toolAttempts = receipts.filter(r => r.kind === "tool").length;
  for (const rec of perAttempt) {
    if (rec.kind === "critic") criticAttempts++;
    else agentAttempts++;
    const node = byNode[rec.nodeId] || { coverage: rec.coverage, attempts: 0 };
    node.attempts += 1;
    if (rec.coverage === "unknown") node.coverage = "incomplete";
    else if (rec.coverage === "partial" && node.coverage === "measured") node.coverage = "partial";
    byNode[rec.nodeId] = node;
  }
  if (selected.conflict) {
    return {
      coverage: "incomplete",
      attempts: receipts.length,
      agentAttempts,
      toolAttempts,
      criticAttempts,
      unknownAttempts: 1,
      missingRequired: true,
      byNode,
    };
  }
  if (selected.receipt) {
    return {
      coverage: "measured",
      attempts: receipts.length,
      agentAttempts: agentAttempts || 1,
      toolAttempts,
      criticAttempts,
      inputTokens: selected.receipt.inputTokens,
      outputTokens: selected.receipt.outputTokens,
      cacheReadTokens: finiteToken(selected.receipt.cacheReadTokens) ? selected.receipt.cacheReadTokens : undefined,
      unknownAttempts: 0,
      missingRequired: false,
      byNode,
    };
  }
  let input = 0;
  let output = 0;
  let cache = 0;
  let hasInput = false;
  let hasOutput = false;
  let unknownAttempts = 0;
  for (const rec of perAttempt) {
    const node = byNode[rec.nodeId] || { coverage: rec.coverage, attempts: 0 };
    if (rec.coverage === "unknown") unknownAttempts++;
    if (typeof rec.inputTokens === "number" && Number.isFinite(rec.inputTokens)) {
      node.inputTokens = (node.inputTokens || 0) + rec.inputTokens;
      input += rec.inputTokens;
      hasInput = true;
    }
    if (typeof rec.outputTokens === "number" && Number.isFinite(rec.outputTokens)) {
      node.outputTokens = (node.outputTokens || 0) + rec.outputTokens;
      output += rec.outputTokens;
      hasOutput = true;
    }
    if (typeof rec.cacheReadTokens === "number" && Number.isFinite(rec.cacheReadTokens)) cache += rec.cacheReadTokens;
    byNode[rec.nodeId] = node;
  }
  const missingRequired = (requiredAgentNodes || []).some(n => n !== "_run" && (!byNode[n] || byNode[n]!.coverage === "incomplete" || byNode[n]!.coverage === "unknown"));
  const coverage: AgentUsageAggregate["coverage"] = missingRequired || unknownAttempts > 0
    ? "incomplete"
    : perAttempt.some(r => r.coverage !== "measured" || !finiteToken(r.inputTokens) || !finiteToken(r.outputTokens))
      ? "partial"
      : perAttempt.length
        ? "measured"
        : "incomplete";
  return {
    coverage,
    attempts: receipts.length,
    agentAttempts,
    toolAttempts,
    criticAttempts,
    inputTokens: hasInput ? input : undefined,
    outputTokens: hasOutput ? output : undefined,
    cacheReadTokens: cache || undefined,
    unknownAttempts,
    missingRequired,
    byNode,
  };
}

export function compareAgentUsageArms(a: AgentUsageAggregate, b: AgentUsageAggregate): {
  verdict: "ok" | "measurement_incomplete";
  savingsPct: number | null;
  agentTokenDelta: number | null;
} {
  if (a.coverage !== "measured" || b.coverage !== "measured" || a.missingRequired || b.missingRequired
    || typeof a.inputTokens !== "number" || typeof a.outputTokens !== "number"
    || typeof b.inputTokens !== "number" || typeof b.outputTokens !== "number") {
    return { verdict: "measurement_incomplete", savingsPct: null, agentTokenDelta: null };
  }
  const aTotal = a.inputTokens + a.outputTokens;
  const bTotal = b.inputTokens + b.outputTokens;
  if (aTotal <= 0) return { verdict: "measurement_incomplete", savingsPct: null, agentTokenDelta: null };
  return {
    verdict: "ok",
    savingsPct: (aTotal - bTotal) / aTotal,
    agentTokenDelta: (bTotal - aTotal) / aTotal,
  };
}

export function tokensFromNestedUsage(raw: unknown): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  unknown: boolean;
} {
  const rec = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const usage = (rec.usage && typeof rec.usage === "object" ? rec.usage as Record<string, unknown> : rec);
  const num = (...keys: string[]) => {
    for (const k of keys) {
      const v = usage[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return undefined;
  };
  const unknown = usage.unknown === true || rec.coverage === "unknown" || rec.source === "unavailable";
  return {
    inputTokens: num("inputTokens", "input_tokens", "prompt_tokens"),
    outputTokens: num("outputTokens", "output_tokens", "completion_tokens"),
    totalTokens: num("totalTokens", "total_tokens"),
    cacheReadTokens: num("cacheReadTokens", "cache_read_input_tokens", "cached_tokens"),
    unknown,
  };
}

export type HostUsageScope = "attempt" | "run";

export interface HostUsageImport {
  schemaVersion: 1;
  provider: string;
  model: string;
  sessionId: string;
  rawExportPath: string;
  rawExportHash: string;
  sourceFormat: string;
  sourceFormatVersion: string;
  scope: HostUsageScope;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  runId?: string;
  arm?: "A" | "B" | "C";
  nodeId?: string;
  preparationId?: string;
  attemptId?: string;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isCompleteHostUsageContract(raw: unknown): raw is HostUsageImport {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return typeof r.provider === "string" && r.provider.trim().length > 0
    && typeof r.model === "string" && r.model.trim().length > 0
    && typeof r.sessionId === "string" && r.sessionId.trim().length > 0
    && typeof r.rawExportPath === "string" && r.rawExportPath.trim().length > 0
    && typeof r.rawExportHash === "string" && /^[a-f0-9]{16,}$/i.test(r.rawExportHash)
    && typeof r.sourceFormat === "string" && r.sourceFormat.trim().length > 0
    && typeof r.sourceFormatVersion === "string"
    && (r.scope === "attempt" || r.scope === "run")
    && finiteNonNegative(r.inputTokens) && finiteNonNegative(r.outputTokens)
    && (r.cacheReadTokens === undefined || finiteNonNegative(r.cacheReadTokens))
    && (r.cacheWriteTokens === undefined || finiteNonNegative(r.cacheWriteTokens));
}

const SUPPORTED_HOST_EXPORTS: Record<string, Set<string>> = {
  cursor_session: new Set(["1"]),
  gemini_cli: new Set(["1"]),
  host_usage: new Set(["1"]),
};

export function verifyHostExportEvidence(opts: {
  evidenceRoot: string;
  contract: HostUsageImport;
}): { ok: true; canonicalPath: string; hash: string } | { ok: false; reason: string } {
  const versions = SUPPORTED_HOST_EXPORTS[opts.contract.sourceFormat];
  if (!versions || !versions.has(opts.contract.sourceFormatVersion)) {
    return { ok: false, reason: `Unsupported host export format ${opts.contract.sourceFormat}@${opts.contract.sourceFormatVersion}.` };
  }
  if (!finiteNonNegative(opts.contract.inputTokens) || !finiteNonNegative(opts.contract.outputTokens)) {
    return { ok: false, reason: "Host export token totals must be finite and non-negative." };
  }
  const confined = isPathConfined(opts.evidenceRoot, opts.contract.rawExportPath);
  if (!confined.safe) return { ok: false, reason: confined.reason || "Host export path is outside the evidence root." };
  if (!existsSync(confined.resolvedPath)) return { ok: false, reason: "Host export file does not exist." };
  const stat = statSync(confined.resolvedPath);
  if (!stat.isFile()) return { ok: false, reason: "Host export path is not a regular file." };
  const hash = createHash("sha256").update(readFileSync(confined.resolvedPath)).digest("hex");
  if (hash.toLowerCase() !== opts.contract.rawExportHash.toLowerCase()) {
    return { ok: false, reason: "Host export hash does not match the file bytes." };
  }
  return { ok: true, canonicalPath: confined.resolvedPath, hash };
}

export function importHostUsage(opts: {
  root: string;
  raw: unknown;
  evidenceRoot?: string;
  fallbackProvider?: string;
  expected?: RunScopeMatch;
}): AgentAttemptReceipt {
  if (!isCompleteHostUsageContract(opts.raw)) {
    const nested = tokensFromNestedUsage(opts.raw);
    return recordAgentStageAttempt({
      root: opts.root,
      nodeId: typeof (opts.raw as any)?.nodeId === "string" ? (opts.raw as any).nodeId : "_unverified",
      preparationId: typeof (opts.raw as any)?.preparationId === "string" ? (opts.raw as any).preparationId : "unverified",
      attemptId: typeof (opts.raw as any)?.attemptId === "string" ? (opts.raw as any).attemptId : "unverified",
      kind: "agent",
      inputTokens: nested.inputTokens,
      outputTokens: nested.outputTokens,
      source: "manual_host_report",
    });
  }
  const evidence = verifyHostExportEvidence({
    evidenceRoot: opts.evidenceRoot || opts.root,
    contract: opts.raw,
  });
  if (!evidence.ok) throw new Error(evidence.reason);
  const contract = opts.raw;
  if (opts.expected?.runId && contract.runId && opts.expected.runId !== contract.runId) {
    throw new Error("Host export run does not match the expected trial run.");
  }
  if (opts.expected?.arm && contract.arm && opts.expected.arm !== contract.arm) {
    throw new Error("Host export arm does not match the expected arm.");
  }
  if (opts.expected?.provider && opts.expected.provider !== contract.provider) {
    throw new Error("Host export provider does not match the expected provider.");
  }
  if (opts.expected?.model && opts.expected.model !== contract.model) {
    throw new Error("Host export model does not match the expected model.");
  }
  if (opts.expected?.sessionId && opts.expected.sessionId !== contract.sessionId) {
    throw new Error("Host export session does not match the expected session.");
  }
  const runLevel = contract.scope === "run";
  const duplicate = loadAgentAttemptReceipts(opts.root).find(existing =>
    existing.source === "host_export"
    && existing.rawEvidenceHash === evidence.hash
    && (existing.runId || "") === (contract.runId || "")
    && (existing.arm || "") === (contract.arm || "")
  );
  if (duplicate) throw new Error("The same raw host export was already imported for this run and arm.");
  return recordAgentStageAttempt({
    root: opts.root,
    nodeId: runLevel ? "_run" : (contract.nodeId || "_unverified"),
    preparationId: runLevel ? (contract.runId || contract.sessionId) : (contract.preparationId || contract.sessionId),
    attemptId: runLevel ? `${contract.sessionId}:run` : (contract.attemptId || `${contract.sessionId}:attempt`),
    kind: "agent",
    runId: contract.runId,
    arm: contract.arm,
    provider: contract.provider,
    model: contract.model,
    sessionId: contract.sessionId,
    inputTokens: contract.inputTokens,
    outputTokens: contract.outputTokens,
    cacheReadTokens: contract.cacheReadTokens,
    cacheWriteTokens: contract.cacheWriteTokens,
    source: "host_export",
    rawEvidencePath: evidence.canonicalPath,
    rawEvidenceHash: evidence.hash,
  });
}

/** Gemini CLI adapter. Arbitrary token JSON is not a host_export. */
export function importGeminiHostUsage(opts: {
  root: string;
  raw: unknown;
  runId: string;
  sessionId?: string;
  nodeId?: string;
  preparationId?: string;
  attemptId?: string;
  kind?: "agent" | "critic";
}): AgentAttemptReceipt {
  if (isCompleteHostUsageContract(opts.raw)) return importHostUsage({ root: opts.root, raw: opts.raw, evidenceRoot: opts.root });
  const nested = tokensFromNestedUsage(opts.raw);
  const rec = opts.raw && typeof opts.raw === "object" ? opts.raw as Record<string, unknown> : {};
  return recordAgentStageAttempt({
    root: opts.root,
    nodeId: opts.nodeId || "_unverified",
    preparationId: opts.preparationId || opts.runId,
    attemptId: opts.attemptId || `${opts.runId}:session`,
    kind: opts.kind || "agent",
    runId: opts.runId,
    sessionId: opts.sessionId,
    model: typeof rec.model === "string" ? rec.model : "gemini",
    provider: "gemini",
    inputTokens: nested.inputTokens,
    outputTokens: nested.outputTokens,
    cacheReadTokens: nested.cacheReadTokens,
    source: "manual_host_report",
    rawEvidenceHash: createHash("sha256").update(JSON.stringify(opts.raw)).digest("hex"),
  });
}

export interface ExpectedAttempt {
  nodeId: string;
  kind: "agent" | "critic" | "tool";
  preparationId: string;
  attemptId: string;
}

export function expectedAttemptsFromWorkflow(root: string): ExpectedAttempt[] {
  const graphPath = join(root, "agent/graph.yaml");
  if (!existsSync(graphPath)) return [];
  let graph: { nodes: Array<{ id: string; kind?: string }> };
  try {
    graph = JSON.parse(readFileSync(graphPath, "utf8"));
  } catch {
    return [];
  }
  const kindOf = (id: string): "agent" | "critic" | "tool" => {
    const k = graph.nodes.find(n => n.id === id)?.kind;
    return k === "critic" || k === "tool" ? k : "agent";
  };
  const prepsDir = join(root, "agent/preparations");
  const expected: ExpectedAttempt[] = [];
  const parsed: Array<{ id: string; nodeId: string; attempt?: number; status?: string }> = [];
  if (existsSync(prepsDir)) {
    for (const name of readdirSync(prepsDir).filter(f => f.endsWith(".json"))) {
      try {
        const prep = JSON.parse(readFileSync(join(prepsDir, name), "utf8")) as {
          id: string; nodeId: string; attempt?: number; status?: string;
        };
        if (prep.id && prep.nodeId) parsed.push(prep);
      } catch { /* ignore */ }
    }
  }
  for (const prep of parsed) {
    if (prep.status === "canceled") continue;
    if (prep.status === "prepared") {
      const superseded = parsed.some(other =>
        other.nodeId === prep.nodeId
        && other.id !== prep.id
        && ((other.attempt || 0) > (prep.attempt || 0) || other.status === "consumed" || other.status === "invalidated"),
      );
      if (!superseded) continue;
    }
    const kind = kindOf(prep.nodeId);
    if (kind === "tool") continue;
    expected.push({
      nodeId: prep.nodeId,
      kind,
      preparationId: prep.id,
      attemptId: `${prep.id}:${prep.attempt || 1}`,
    });
  }
  return expected;
}

export function reconcileExpectedAttempts(
  receipts: AgentAttemptReceipt[],
  expected: Array<{ nodeId: string; kind: "agent" | "critic" | "tool"; preparationId?: string; attemptId?: string }>,
): { coverage: "complete" | "incomplete"; missing: string[] } {
  const selected = selectAuthoritativeRunReceipt(receipts);
  if (selected.conflict) return { coverage: "incomplete", missing: ["conflicting_run_receipt"] };
  if (selected.receipt && finiteToken(selected.receipt.inputTokens) && finiteToken(selected.receipt.outputTokens)) {
    return { coverage: "complete", missing: [] };
  }
  const missing: string[] = [];
  for (const exp of expected) {
    if (exp.kind === "tool") continue;
    const hits = receipts.filter(r => {
      if (r.nodeId !== exp.nodeId || r.kind !== exp.kind) return false;
      if (exp.preparationId && r.preparationId !== exp.preparationId) return false;
      if (exp.attemptId && r.attemptId !== exp.attemptId) return false;
      return true;
    });
    const key = exp.attemptId || `${exp.kind}:${exp.nodeId}`;
    if (!hits.length) missing.push(key);
    else if (hits.some(h => h.coverage !== "measured" || typeof h.inputTokens !== "number" || typeof h.outputTokens !== "number")) {
      missing.push(`${key}:unmeasured`);
    }
  }
  return { coverage: missing.length ? "incomplete" : "complete", missing };
}
