import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BATCHING_BUDGET, type BatchableQuestion } from "./batching.ts";

export interface JevTaskBounds {
  maxCandidates: number;
  maxQuestions: number;
  maxInputBytes: number;
  maxTransportAttempts: number;
  maxWallTimeMs: number;
}

export const DEFAULT_TASK_BOUNDS: JevTaskBounds = {
  maxCandidates: 40,
  maxQuestions: 40,
  maxInputBytes: DEFAULT_BATCHING_BUDGET.maxPayloadChars,
  maxTransportAttempts: 8,
  maxWallTimeMs: 60_000,
};

export interface BoundOverflow {
  droppedIds: string[];
  reason: string;
  agentObligation: string;
}

export function applyQuestionFanoutBounds<T extends { id: string }>(
  items: T[],
  bounds: Partial<JevTaskBounds> = {}
): { kept: T[]; overflow: BoundOverflow | undefined } {
  const max = bounds.maxQuestions ?? DEFAULT_TASK_BOUNDS.maxQuestions;
  const maxCand = bounds.maxCandidates ?? DEFAULT_TASK_BOUNDS.maxCandidates;
  const cap = Math.min(max, maxCand);
  if (items.length <= cap) return { kept: items, overflow: undefined };
  const kept = items.slice(0, cap);
  const dropped = items.slice(cap);
  return {
    kept,
    overflow: {
      droppedIds: dropped.map(i => i.id),
      reason: `Fan-out cap ${cap} exceeded (${items.length} candidates).`,
      agentObligation: `Judge remaining candidates ${dropped.map(i => i.id).join(", ")} — they were not silently excluded.`,
    },
  };
}

export function recordPrepBounds(root: string, preparationId: string, used: {
  questions: number;
  candidates: number;
  overflow?: BoundOverflow;
}): void {
  const dir = join(root, "agent/runs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${preparationId}.jev-bounds.json`), JSON.stringify({
    preparationId,
    ...used,
    recordedAt: new Date().toISOString(),
  }, null, 2), "utf8");
}

export function loadPrepBounds(root: string, preparationId: string): { questions: number; overflow?: BoundOverflow } | undefined {
  const path = join(root, "agent/runs", `${preparationId}.jev-bounds.json`);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

export function overflowAsBatchRejects(overflow: BoundOverflow | undefined, items: BatchableQuestion[]): BatchableQuestion[] {
  if (!overflow) return [];
  const dropped = new Set(overflow.droppedIds);
  return items.filter(i => dropped.has(i.id));
}
