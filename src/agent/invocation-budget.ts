import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { json, save, type UsageReceipt } from "./artifacts.ts";
import { withMutationLock } from "./preparation.ts";
import type { AgentState } from "./graph.ts";

export type Invocation = {
  version: 1; id: string; preparationId: string; nodeId: string;
  status: "reserved" | "settled"; reservedTokens: number; startedAt: string;
  receipt?: UsageReceipt;
};
const directory = (root: string) => join(root, "agent/runs/invocations");
export function readInvocations(root: string): Invocation[] {
  if (!existsSync(directory(root))) return [];
  // A corrupt ledger is a persistence error, never zero spend.
  return readdirSync(directory(root)).filter(f => f.endsWith(".json")).map(f => {
    const row = json<Invocation>(join(directory(root), f));
    if (row.version !== 1 || !row.id || !row.preparationId || !["reserved", "settled"].includes(row.status) || !Number.isSafeInteger(row.reservedTokens) || row.reservedTokens < 1) throw new Error(`Invalid invocation ledger entry: ${f}`);
    if (row.receipt) for (const value of [row.receipt.usage.inputTokens, row.receipt.usage.outputTokens, row.receipt.usage.totalTokens, row.receipt.durationMs]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error(`Invalid invocation usage: ${f}`);
    }
    return row;
  });
}
export function invocationSpend(root: string) {
  const rows = readInvocations(root);
  return rows.reduce((sum, row) => {
    const usage = row.receipt?.usage;
    sum.calls++;
    sum.inputTokens += usage?.inputTokens || 0;
    sum.outputTokens += usage?.outputTokens || 0;
    sum.tokens += Math.max(usage?.totalTokens || 0, (usage?.inputTokens || 0) + (usage?.outputTokens || 0));
    sum.durationMs += row.receipt?.durationMs || 0;
    if (row.status === "reserved") sum.reservedTokens += row.reservedTokens;
    if (row.status === "settled" && (!usage || usage.unknown || (usage.totalTokens === undefined && (usage.inputTokens === undefined || usage.outputTokens === undefined)))) sum.unknownCalls++;
    return sum;
  }, { calls: 0, inputTokens: 0, outputTokens: 0, tokens: 0, durationMs: 0, reservedTokens: 0, unknownCalls: 0 });
}
export function syncInvocationSpend(root: string, state: AgentState): void {
  const spend = invocationSpend(root);
  state.cumulativeSpend ||= { iterations: 0, calls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };
  state.cumulativeSpend.reviewer = spend;
}
export function reserveInvocation(opts: {
  root: string; preparationId: string; nodeId: string; maxTokens: number;
  totalTokenLimit?: number; otherTokens?: number;
}): Invocation {
  if (!Number.isSafeInteger(opts.maxTokens) || opts.maxTokens < 1) throw new Error("Invalid reviewer reservation");
  if (opts.totalTokenLimit !== undefined && (!Number.isSafeInteger(opts.totalTokenLimit) || opts.totalTokenLimit < 1)) throw new Error("Invalid total token limit");
  return withMutationLock(opts.root, () => {
    const rows = readInvocations(opts.root);
    if (rows.some(r => r.preparationId === opts.preparationId)) throw new Error("Reviewer invocation already recorded for this preparation; complete or cancel it before another dispatch");
    const spend = invocationSpend(opts.root);
    if (spend.reservedTokens) throw new Error("An earlier reviewer invocation has no final receipt; reconcile its usage before dispatch");
    if (opts.totalTokenLimit !== undefined && (spend.unknownCalls || spend.tokens + (opts.otherTokens || 0) + opts.maxTokens > opts.totalTokenLimit)) {
      throw new Error("Reviewer budget unavailable: unknown prior usage or insufficient tokens for the next reservation");
    }
    const row: Invocation = { version: 1, id: randomUUID(), preparationId: opts.preparationId, nodeId: opts.nodeId, status: "reserved", reservedTokens: opts.maxTokens, startedAt: new Date().toISOString() };
    save(join(directory(opts.root), `${row.id}.json`), row);
    return row;
  });
}
export function settleInvocation(root: string, id: string, receipt: UsageReceipt): Invocation {
  if (!/^[a-f0-9-]+$/i.test(id)) throw new Error("Invalid invocation id");
  return withMutationLock(root, () => {
    const path = join(directory(root), `${id}.json`);
    const row = json<Invocation>(path);
    if (row.status === "settled") {
      if (JSON.stringify(row.receipt) !== JSON.stringify(receipt)) throw new Error("Invocation receipt is immutable");
      return row;
    }
    row.status = "settled"; row.receipt = receipt;
    save(path, row);
    return row;
  });
}
