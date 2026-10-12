import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { Question, Questions } from "./types.ts";
import type { JevClient } from "./client.ts";
import { makePathReferencedGroundingQuestion } from "./questions.ts";

export interface BatchableQuestion {
  id: string;
  taskType: "grounding" | "cta_consistency" | "coverage" | "custom";
  questionKey?: string;
  question?: Question;
  claimId?: string;
  claim?: string;
  evidenceId?: string;
  evidenceExcerpt?: string;
  source?: string;
  dependsOn?: string[]; // IDs of prerequisites that must be completed before this question
  metadata?: Record<string, unknown>;
}

export interface BatchPartition {
  batchId: string;
  taskType: "grounding" | "cta_consistency" | "coverage" | "custom";
  questions: Record<string, Question>;
  state: {
    task: string;
    claims: Record<string, { id: string; claim: string }>;
    evidence: Record<string, { id: string; source: string; hash: string; excerpt: string; aliases?: string[] }>;
    metadata?: Record<string, unknown>;
  };
  questionIds: string[];
  questionKeyMap: Record<string, string>; // Maps batch internal question key to original item id
  estimatedUnbatchedTokens: number;
  payloadChars: number;
}

export interface BatchingBudgetConfig {
  maxQuestionsPerBatch: number;
  maxPayloadChars: number;
  taskDeadlineMs: number;
  maxRetries: number;
}

export const DEFAULT_BATCHING_BUDGET: BatchingBudgetConfig = {
  maxQuestionsPerBatch: 10,
  maxPayloadChars: 32000,
  taskDeadlineMs: 30000,
  maxRetries: 3,
};

export interface BatchMetrics {
  totalQuestions: number;
  deferredCount: number;
  rejectedOversizedCount: number;
  batchesCount: number;
  unbatchedTransportCalls: number;
  actualTransportCalls: number;
  transportCallSavingsPct: number;

  // Honest telemetry separation: observed vs estimated
  measured: boolean;
  observedInputTokens: number | null;
  observedOutputTokens: number | null;
  observedTotalTokens: number | null;

  estimatedUnbatchedTokens: number;
  estimatedBatchedTokens: number;
  estimatedTokenSavingsPct: number;
  actualTokenSavingsPct: number | null;

  // Backward compatible fields
  unbatchedEstimatedTokens: number;
  batchedActualTokens: number;
  tokenSavingsPct: number;

  durationMs: number;
}

export interface BatchExecutionResult {
  answers: Record<string, unknown>;
  metrics: BatchMetrics;
  receipts: string[];
  itemReceipts: Record<string, string>;
  deferredItems: BatchableQuestion[];
  rejectedOversizedItems?: BatchableQuestion[];
}

function sha256(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

function tryAddItemToPartition(
  partition: BatchPartition,
  item: BatchableQuestion,
  maxPayloadChars: number,
  maxQuestions: number
): {
  success: boolean;
  newPartitionState?: BatchPartition["state"];
  newQuestions?: Record<string, Question>;
  payloadChars?: number;
  qKey?: string;
  unbatchedTokens?: number;
} {
  if (partition.questionIds.length >= maxQuestions) {
    return { success: false };
  }

  // Clone partition state and questions without mutating committed partition
  const candidateState: BatchPartition["state"] = {
    task: partition.state.task,
    claims: { ...partition.state.claims },
    evidence: { ...partition.state.evidence },
    metadata: partition.state.metadata ? { ...partition.state.metadata } : undefined,
  };
  const candidateQuestions: Record<string, Question> = { ...partition.questions };

  const claimId = item.claimId || item.id;
  const claimText = (item.claim || "").trim();
  if (claimText && !candidateState.claims[claimId]) {
    candidateState.claims[claimId] = { id: claimId, claim: claimText };
  }

  const normExcerpt = (item.evidenceExcerpt || "").trim();
  const evHash = sha256(normExcerpt);
  let evKey: string | undefined;

  for (const [k, v] of Object.entries(candidateState.evidence)) {
    if (v.hash === evHash) {
      evKey = k;
      if (item.source && !v.aliases?.includes(item.source) && v.source !== item.source) {
        candidateState.evidence[k] = {
          ...v,
          aliases: [...(v.aliases || []), item.source],
        };
      }
      break;
    }
  }

  if (!evKey && normExcerpt) {
    let count = Object.keys(candidateState.evidence).length;
    evKey = `ev_${count}`;
    while (candidateState.evidence[evKey]) {
      count++;
      evKey = `ev_${count}`;
    }
    candidateState.evidence[evKey] = {
      id: item.evidenceId || evKey,
      source: item.source || "",
      hash: evHash,
      excerpt: normExcerpt,
      aliases: [],
    };
  }

  const qKey = item.questionKey || `q_${partition.questionIds.length}`;
  if (item.question) {
    candidateQuestions[qKey] = item.question;
  } else if (evKey && claimId) {
    candidateQuestions[qKey] = makePathReferencedGroundingQuestion(
      `claims.${claimId}.claim`,
      `evidence.${evKey}.excerpt`
    );
  }

  // Measure fully serialized request
  const fullPayloadChars = JSON.stringify({ state: candidateState, questions: candidateQuestions }).length;
  if (fullPayloadChars > maxPayloadChars) {
    return { success: false };
  }

  const unbatchedPromptTokens = 80 + Math.ceil((claimText.length + normExcerpt.length) / 4);
  return {
    success: true,
    newPartitionState: candidateState,
    newQuestions: candidateQuestions,
    payloadChars: fullPayloadChars,
    qKey,
    unbatchedTokens: unbatchedPromptTokens,
  };
}

/**
 * Partitions batchable questions into bounded batches with shared-state deduplication.
 * Independent questions sharing evidence are grouped.
 * Dependent questions whose evidence or prerequisite is not yet satisfied are deferred.
 * Enforces total input size, question count limits, and payload size bounds.
 */
export function partitionBatchItems(
  items: BatchableQuestion[],
  options?: {
    config?: Partial<BatchingBudgetConfig>;
    completedPrerequisites?: Set<string>;
    throwOnOversized?: boolean;
  }
): {
  partitions: BatchPartition[];
  deferredDependentItems: BatchableQuestion[];
  rejectedOversizedItems: BatchableQuestion[];
} {
  const config = { ...DEFAULT_BATCHING_BUDGET, ...options?.config };
  const completed = options?.completedPrerequisites || new Set<string>();

  const readyItems: BatchableQuestion[] = [];
  const deferredDependentItems: BatchableQuestion[] = [];
  const rejectedOversizedItems: BatchableQuestion[] = [];

  for (const item of items) {
    if (item.dependsOn && item.dependsOn.length > 0) {
      const hasUnresolved = item.dependsOn.some(depId => !completed.has(depId));
      if (hasUnresolved) {
        deferredDependentItems.push(item);
        continue;
      }
    }
    readyItems.push(item);
  }

  const partitions: BatchPartition[] = [];
  let currentPartition: BatchPartition | null = null;

  const startNewPartition = (taskType: BatchableQuestion["taskType"]): BatchPartition => {
    const p: BatchPartition = {
      batchId: `batch_${randomUUID().slice(0, 8)}`,
      taskType,
      questions: {},
      state: {
        task: `${taskType}_batch`,
        claims: {},
        evidence: {},
      },
      questionIds: [],
      questionKeyMap: {},
      estimatedUnbatchedTokens: 0,
      payloadChars: 0,
    };
    partitions.push(p);
    return p;
  };

  for (const item of readyItems) {
    // 1. Check if the item alone exceeds maxPayloadChars
    const emptyPartition = startNewPartition(item.taskType);
    partitions.pop(); // Do not commit empty partition yet
    const standaloneResult = tryAddItemToPartition(emptyPartition, item, config.maxPayloadChars, config.maxQuestionsPerBatch);

    if (!standaloneResult.success) {
      if (options?.throwOnOversized) {
        throw new Error(`Item "${item.id}" exceeds maxPayloadChars (${standaloneResult.payloadChars || "oversized"} > ${config.maxPayloadChars})`);
      }
      rejectedOversizedItems.push(item);
      continue;
    }

    // 2. Add to current partition or start new one
    if (!currentPartition || currentPartition.taskType !== item.taskType || currentPartition.state.metadata?.taskId !== ((item.metadata as { taskId?: string } | undefined)?.taskId || "")) {
      currentPartition = startNewPartition(item.taskType);
      currentPartition.state.metadata = { taskId: (item.metadata as { taskId?: string } | undefined)?.taskId || "" };
    }

    let addResult = tryAddItemToPartition(currentPartition, item, config.maxPayloadChars, config.maxQuestionsPerBatch);

    if (!addResult.success && currentPartition.questionIds.length > 0) {
      // Roll over to a fresh partition WITHOUT having mutated the old partition!
      currentPartition = startNewPartition(item.taskType);
      currentPartition.state.metadata = { taskId: (item.metadata as { taskId?: string } | undefined)?.taskId || "" };
      addResult = tryAddItemToPartition(currentPartition, item, config.maxPayloadChars, config.maxQuestionsPerBatch);
    }

    if (addResult.success) {
      currentPartition.state = addResult.newPartitionState!;
      currentPartition.questions = addResult.newQuestions!;
      currentPartition.payloadChars = addResult.payloadChars!;
      currentPartition.questionIds.push(item.id);
      currentPartition.questionKeyMap[addResult.qKey!] = item.id;
      currentPartition.estimatedUnbatchedTokens += addResult.unbatchedTokens!;
    }
  }

  return { partitions, deferredDependentItems, rejectedOversizedItems };
}

/**
 * Executes partitioned batches via JevClient with transport calls and token telemetry.
 * Enforces deadlines and reports savings between unbatched vs batched execution.
 */
export async function executeBatches(opts: {
  client: JevClient;
  partitions: BatchPartition[];
  signal?: AbortSignal;
  deadlineMs?: number;
  nodeId?: string;
}): Promise<BatchExecutionResult> {
  const { client, partitions, signal, deadlineMs, nodeId } = opts;
  const started = Date.now();

  const answers: Record<string, unknown> = {};
  const receipts: string[] = [];
  const itemReceipts: Record<string, string> = {};

  let totalQuestions = 0;
  let unbatchedEstimatedTokens = 0;
  let estimatedBatchedTokens = 0;
  let actualTransportCalls = 0;

  let measuredCalls = 0;
  let observedInputTokens = 0;
  let observedOutputTokens = 0;

  for (const partition of partitions) {
    if (signal?.aborted) {
      throw (signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason || "Batch execution canceled")));
    }

    const elapsed = Date.now() - started;
    if (deadlineMs && elapsed >= deadlineMs) {
      throw new Error(`Batch execution deadline exceeded (${deadlineMs}ms)`);
    }

    totalQuestions += partition.questionIds.length;
    unbatchedEstimatedTokens += partition.estimatedUnbatchedTokens;

    if (Object.keys(partition.questions).length === 0) continue;

    const taskType = partition.taskType === "coverage" ? "custom" : partition.taskType;
    const questionsToSend = partition.questions;
    const evalResult = await client.evaluate({
      taskType,
      nodeId,
      questions: questionsToSend as Questions,
      state: partition.state,
      signal,
      taskDeadlineMs: deadlineMs ? Math.max(1000, deadlineMs - elapsed) : undefined,
    });

    actualTransportCalls++;
    receipts.push(evalResult.receiptPath);
    const receiptName = basename(evalResult.receiptPath);

    // Honestly track token usage reported by model/transport
    const hasUsage = typeof evalResult.result.usage?.input_tokens === "number" && typeof evalResult.result.usage?.output_tokens === "number";
    if (hasUsage) {
      observedInputTokens += evalResult.result.usage!.input_tokens;
      observedOutputTokens += evalResult.result.usage!.output_tokens;
      measuredCalls++;
    }

    // Always compute estimated batched tokens
    estimatedBatchedTokens += Math.ceil(partition.payloadChars / 4) + Object.keys(partition.questions).length * 15;

    // Map answers back to original item IDs and associate each item with its partition's receipt
    for (const [qKey, ans] of Object.entries(evalResult.result.answers || {})) {
      const originalId = partition.questionKeyMap[qKey] || qKey;
      answers[originalId] = ans;
      itemReceipts[originalId] = receiptName;
    }
  }

  const durationMs = Date.now() - started;
  const unbatchedTransportCalls = totalQuestions;
  const transportCallSavingsPct = unbatchedTransportCalls > 0
    ? Math.max(0, Math.round(((unbatchedTransportCalls - actualTransportCalls) / unbatchedTransportCalls) * 100))
    : 0;

  const isMeasured = measuredCalls === partitions.length && partitions.length > 0;
  const observedTotalTokens = isMeasured ? observedInputTokens + observedOutputTokens : null;

  const actualTokenSavingsPct = (isMeasured && unbatchedEstimatedTokens > 0)
    ? Math.max(0, Math.round(((unbatchedEstimatedTokens - observedTotalTokens!) / unbatchedEstimatedTokens) * 100))
    : null;

  const estimatedTokenSavingsPct = unbatchedEstimatedTokens > 0
    ? Math.max(0, Math.round(((unbatchedEstimatedTokens - estimatedBatchedTokens) / unbatchedEstimatedTokens) * 100))
    : 0;

  const tokenSavingsPct = actualTokenSavingsPct !== null ? actualTokenSavingsPct : estimatedTokenSavingsPct;
  const batchedActualTokens = isMeasured ? observedTotalTokens! : estimatedBatchedTokens;

  const metrics: BatchMetrics = {
    totalQuestions,
    deferredCount: 0,
    rejectedOversizedCount: 0,
    batchesCount: partitions.length,
    unbatchedTransportCalls,
    actualTransportCalls,
    transportCallSavingsPct,
    measured: isMeasured,
    observedInputTokens: isMeasured ? observedInputTokens : null,
    observedOutputTokens: isMeasured ? observedOutputTokens : null,
    observedTotalTokens,
    estimatedUnbatchedTokens: unbatchedEstimatedTokens,
    estimatedBatchedTokens,
    estimatedTokenSavingsPct,
    actualTokenSavingsPct,
    unbatchedEstimatedTokens,
    batchedActualTokens,
    tokenSavingsPct,
    durationMs,
  };

  return {
    answers,
    metrics,
    receipts,
    itemReceipts,
    deferredItems: [],
  };
}

