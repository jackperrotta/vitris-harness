import { MEDIA_TASKS } from "./media.ts";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadEvidenceLedger } from "./ledger.ts";
import type { JevReceipt } from "./types.ts";
import { GROUNDING_SEMANTICS_HASH } from "./questions.ts";

export interface JevTaskRegistration {
  taskId: string;
  taskType: "grounding" | "cta_consistency" | "coverage" | "custom";
  lifecycleCaller: string[];
  inputSchema: string;
  outputConsumer: string;
  fallback: string;
  testId: string;
  description: string;
  /** Whether this task can authorize delegated ownership. Always false for uncalibrated tasks. */
  delegationEligible?: boolean;
}

export interface TaskExecutionRecord {
  preparationId: string;
  nodeId: string;
  taskId: string;
  taskType: "grounding" | "cta_consistency" | "coverage" | "custom";
  inputHash: string;
  status: "completed" | "cached" | "no_candidates" | "unavailable" | "partial";
  timestamp: string;
  receiptIds?: string[];
  judgmentIds?: string[];
  evaluatedCount?: number;
  cachedCount?: number;
  failureReason?: string;
  priorPreparationId?: string;
  cacheKey?: string;
}

/**
 * Preparation-time task manifest. Saved before any inference runs.
 * Binds expected model, question semantics, and claim/evidence identity to a specific preparation.
 * verifyTaskExecution must match receipts and judgments against this manifest.
 *
 * Missing manifest → fail closed. Inference without a matching manifest is not verified.
 */
export interface JevTaskManifest {
  schemaVersion: 1;
  preparationId: string;
  nodeId: string;
  taskId: string;
  taskType: string;
  /** Model that was active when the manifest was created. Receipts must match. */
  expectedModel: string;
  /** Canonical hash of the question semantics (instructions + criteria). Judgments must match. */
  questionSemanticsHash: string;
  /** Ordered list of claim IDs included in this inference run. */
  claimIds: string[];
  /** Ordered list of evidence IDs included in this inference run. */
  evidenceIds: string[];
  /** Hash of each claim's normalized text at manifest creation time. */
  claimHashes: Record<string, string>;
  /** Hash of each evidence item's normalized excerpt at manifest creation time. */
  evidenceHashes: Record<string, string>;
  /** SHA-256 hashes of each batch-state payload, for state-binding verification. */
  batchStateHashes: string[];
  /** Question map keys generated for this run. Receipt answers must match this set. */
  questionIds?: string[];
  /** Subject / review-input hash at manifest creation. */
  subjectHash?: string;
  createdAt: string;
}

const REGISTRY = new Map<string, JevTaskRegistration>();

/** Registers a Jev task with the system. Throws if taskId is already registered. */
export function registerTask(task: JevTaskRegistration): void {
  if (REGISTRY.has(task.taskId)) {
    throw new Error(`Jev task "${task.taskId}" is already registered.`);
  }
  REGISTRY.set(task.taskId, task);
}

/** Looks up a registered Jev task by taskId. Returns undefined if not found. */
export function getTask(taskId: string): JevTaskRegistration | undefined {
  return REGISTRY.get(taskId);
}

/** Checks whether a Jev task is registered. */
export function isTaskRegistered(taskId: string): boolean {
  return REGISTRY.has(taskId);
}

/** Returns all currently registered Jev tasks. */
export function allTasks(): JevTaskRegistration[] {
  return Array.from(REGISTRY.values());
}

/** Returns all tasks associated with a given lifecycle caller node. */
export function getTasksForCaller(nodeId: string): JevTaskRegistration[] {
  return allTasks().filter(t => t.lifecycleCaller.includes(nodeId));
}

/** Clears the registry (useful in test teardown). */
export function clearRegistry(): void {
  REGISTRY.clear();
}

/** Writes a durable task execution outcome bound to preparation identity and input hash. */
export function recordTaskExecution(root: string, record: TaskExecutionRecord): void {
  const runsDir = join(root, "agent/runs");
  mkdirSync(runsDir, { recursive: true });
  const taskFile = join(runsDir, `${record.preparationId}.${record.taskId}.task.json`);
  writeFileSync(taskFile, JSON.stringify(record, null, 2), "utf8");
}

/**
 * Saves a preparation-time task manifest before any inference begins.
 * The manifest records the exact model, question semantics hash, claim/evidence IDs
 * and their content hashes, and batch-state hashes.
 * Must be saved atomically before calling Jev. verifyTaskExecution matches against this.
 */
function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const tmpPath = `${path}.tmp.${randomUUID()}`;
  const body = JSON.stringify(value, null, 2);
  writeFileSync(tmpPath, body, "utf8");
  try {
    renameSync(tmpPath, path);
  } catch {
    writeFileSync(path, body, "utf8");
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

export function saveTaskManifest(root: string, manifest: JevTaskManifest): void {
  const runsDir = join(root, "agent/runs");
  mkdirSync(runsDir, { recursive: true });
  const manifestPath = join(runsDir, `${manifest.preparationId}.${manifest.taskId}.manifest.json`);
  if (existsSync(manifestPath)) {
    throw new Error(
      `Task manifest already exists for "${manifest.taskId}" in preparation "${manifest.preparationId}"; cannot rewrite after inference.`
    );
  }
  atomicWriteJson(manifestPath, manifest);
}

/**
 * Loads a task manifest for a specific preparation and taskId.
 * Returns undefined if no manifest exists (fail-closed: caller must treat missing as unverified).
 */
export function loadTaskManifest(
  root: string,
  preparationId: string,
  taskId: string
): JevTaskManifest | undefined {
  const runsDir = join(root, "agent/runs");
  const manifestPath = join(runsDir, `${preparationId}.${taskId}.manifest.json`);
  if (!existsSync(manifestPath)) return undefined;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as JevTaskManifest;
  } catch {
    return undefined;
  }
}



/** Loads a task execution record for a specific preparation and taskId or taskType. */
export function loadTaskExecution(
  root: string,
  preparationId: string,
  taskIdOrType: string
): TaskExecutionRecord | undefined {
  const runsDir = join(root, "agent/runs");
  const byId = join(runsDir, `${preparationId}.${taskIdOrType}.task.json`);
  if (existsSync(byId)) {
    try {
      return JSON.parse(readFileSync(byId, "utf8")) as TaskExecutionRecord;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Strictly verifies that a registered task executed for the current preparation,
 * disallowing stale/unrelated receipts, empty ledgers, or mismatched task/input identities.
 * Preserves critic fallback on unavailable inference.
 */
export function verifyTaskExecution(
  root: string,
  prepId: string,
  nodeId: string,
  task: JevTaskRegistration,
  expectedInputHash?: string,
  options?: {
    expectedModel?: string;
    expectedQuestionSemantics?: string;
    expectedSubjectHash?: string;
  }
): { ok: boolean; reason?: string } {
  const record = loadTaskExecution(root, prepId, task.taskId) || loadTaskExecution(root, prepId, task.taskType);
  if (!record) {
    return {
      ok: false,
      reason: `No execution record found for registered task "${task.taskId}" in preparation "${prepId}".`,
    };
  }

  // Exact task identity checks
  if (record.taskId !== task.taskId) {
    return {
      ok: false,
      reason: `Execution record taskId mismatch (expected "${task.taskId}", got "${record.taskId}").`,
    };
  }

  if (record.taskType !== task.taskType) {
    return {
      ok: false,
      reason: `Execution record taskType mismatch (expected "${task.taskType}", got "${record.taskType}").`,
    };
  }

  if (record.preparationId !== prepId || record.nodeId !== nodeId) {
    return {
      ok: false,
      reason: `Execution record identity mismatch (expected prep "${prepId}", node "${nodeId}"; got prep "${record.preparationId}", node "${record.nodeId}").`,
    };
  }

  // Exact inputHash check: record MUST have an inputHash matching expectedInputHash
  if (!record.inputHash || (expectedInputHash && record.inputHash !== expectedInputHash)) {
    return {
      ok: false,
      reason: `Execution record inputHash mismatch (expected "${expectedInputHash || ""}", got "${record.inputHash || "missing"}").`,
    };
  }

  // Manifest validation: the task manifest must have been saved at preparation time
  // and must match the receipt/judgment provenance exactly. Missing manifest → fail closed.
  const manifest = loadTaskManifest(root, prepId, task.taskId);
  if (!manifest) {
    // Only fail closed for completed/cached status; unavailable/no_candidates can lack manifests
    if (record.status === "completed" || record.status === "cached") {
      return {
        ok: false,
        reason: `Task manifest missing for "${task.taskId}" in preparation "${prepId}". ` +
          `Inference without a saved manifest cannot be verified (manifest_missing).`,
      };
    }
    // For no_candidates: no inference ran, so no manifest needed
  } else {
    // Manifest exists — validate model binding
    if (manifest.expectedModel && options?.expectedModel && manifest.expectedModel !== options.expectedModel) {
      return {
        ok: false,
        reason: `Task manifest model mismatch: manifest expected "${manifest.expectedModel}", ` +
          `current expected model is "${options.expectedModel}". Wrong-model receipt rejected.`,
      };
    }
    // Validate question semantics binding
    if (manifest.questionSemanticsHash && options?.expectedQuestionSemantics &&
        manifest.questionSemanticsHash !== options.expectedQuestionSemantics) {
      return {
        ok: false,
        reason: `Task manifest question semantics mismatch: manifest hash "${manifest.questionSemanticsHash}", ` +
          `expected "${options.expectedQuestionSemantics}". Old-state or wrong-semantics receipt rejected.`,
      };
    }
    if (manifest.subjectHash && options?.expectedSubjectHash && manifest.subjectHash !== options.expectedSubjectHash) {
      return {
        ok: false,
        reason: `Task manifest subjectHash mismatch: manifest "${manifest.subjectHash}", expected "${options.expectedSubjectHash}".`,
      };
    }
    // Validate stateHash via batch-state hashes if available
    // batchStateHashes encodes the SHA-256 of each batch payload; these are immutable at preparation time
    if (manifest.batchStateHashes.length > 0) {
      if (record.receiptIds && record.receiptIds.length > 0) {
        const decisionsDir = join(root, "agent/decisions/jev");
        for (const rFile of record.receiptIds) {
          const rPath = join(decisionsDir, rFile);
          if (!existsSync(rPath)) {
            return {
              ok: false,
              reason: `Referenced receipt "${rFile}" not found on disk while matching batchStateHashes.`,
            };
          }
          try {
            const receipt = JSON.parse(readFileSync(rPath, "utf8")) as JevReceipt;
            if (!receipt.stateHash) {
              return {
                ok: false,
                reason: `Receipt "${rFile}" is missing stateHash provenance.`,
              };
            }
            if (!manifest.batchStateHashes.includes(receipt.stateHash)) {
              return {
                ok: false,
                reason: `Receipt stateHash "${receipt.stateHash}" is not in manifest batchStateHashes (stale or unbound state).`,
              };
            }
          } catch {
            return {
              ok: false,
              reason: `Could not parse receipt "${rFile}" while matching batchStateHashes.`,
            };
          }
        }
      }
    }
  }

  if (record.status === "unavailable") {
    // Keep unavailable fallback explicit and separate from completed evidence
    if (!record.failureReason || !record.failureReason.trim()) {
      return {
        ok: false,
        reason: `Task recorded "unavailable" status without explicit failureReason.`,
      };
    }
    if ((record.judgmentIds && record.judgmentIds.length > 0) || (record.receiptIds && record.receiptIds.length > 0)) {
      return {
        ok: false,
        reason: `Task recorded "unavailable" status but also claimed completed judgmentIds or receiptIds.`,
      };
    }
    // Preserve full critic fallback on unavailable inference without hard-blocking
    return { ok: true };
  }

  if (record.status === "no_candidates") {
    return { ok: true };
  }

  if (record.status === "partial") {
    if (!(record.receiptIds || []).length && !(record.judgmentIds || []).length) {
      return {
        ok: false,
        reason: `Task "${task.taskId}" is partial without receipts or judgments; remaining questions stay critic obligations and cannot count as a Jev pass.`,
      };
    }
  }

  const ledger = loadEvidenceLedger(root);
  const expectedSemantics = options?.expectedQuestionSemantics ?? (task.taskType === "grounding" ? GROUNDING_SEMANTICS_HASH : undefined);

  if (record.status === "cached") {
    if (record.priorPreparationId) {
      if (record.priorPreparationId === prepId) {
        return { ok: false, reason: `Cached task "${task.taskId}" cannot cite its own preparation as provenance.` };
      }
      const prior = loadTaskExecution(root, record.priorPreparationId, task.taskId);
      if (!prior || prior.status === "unavailable" || prior.status === "partial" || prior.status === "no_candidates") {
        return { ok: false, reason: `Cached task "${task.taskId}" is missing a completed original execution.` };
      }
      const priorResult = verifyTaskExecution(root, record.priorPreparationId, prior.nodeId, task, prior.inputHash, options);
      if (!priorResult.ok) return { ok: false, reason: `Cached provenance failed: ${priorResult.reason}` };
      const currentManifest = loadTaskManifest(root, prepId, task.taskId);
      const priorManifest = loadTaskManifest(root, record.priorPreparationId, task.taskId);
      if (!currentManifest?.subjectHash || currentManifest.subjectHash !== priorManifest?.subjectHash) {
        return { ok: false, reason: `Cached task "${task.taskId}" subject/state hash does not match the original execution.` };
      }
      if (record.cacheKey && prior.cacheKey && record.cacheKey !== prior.cacheKey) {
        return { ok: false, reason: `Cached task "${task.taskId}" cache key does not match the original execution.` };
      }
      return { ok: true };
    }
    // Must have explicit cachedCount > 0 and matched judgmentIds in ledger
    if (typeof record.cachedCount !== "number" || record.cachedCount <= 0) {
      return {
        ok: false,
        reason: `Task recorded "cached" status without positive cachedCount (cachedCount: ${record.cachedCount}).`,
      };
    }
    if (!record.judgmentIds || record.judgmentIds.length === 0) {
      return {
        ok: false,
        reason: `Task recorded "cached" status without explicit matched judgmentIds.`,
      };
    }
    if (record.judgmentIds.length !== record.cachedCount) {
      return {
        ok: false,
        reason: `Task recorded "cached" count mismatch (cachedCount: ${record.cachedCount}, judgmentIds: ${record.judgmentIds.length}).`,
      };
    }
    for (const jId of record.judgmentIds) {
      const j = ledger.judgments[jId];
      if (!j) {
        return {
          ok: false,
          reason: `Cached judgment "${jId}" not found in evidence ledger.`,
        };
      }
      if (j.invalidated) {
        return {
          ok: false,
          reason: `Cached judgment "${jId}" is invalidated in evidence ledger (${j.invalidationReason || "stale"}).`,
        };
      }
      if (j.nodeId && j.nodeId !== nodeId) {
        return {
          ok: false,
          reason: `Cached judgment "${jId}" has nodeId mismatch (expected "${nodeId}", got "${j.nodeId}").`,
        };
      }
      if (options?.expectedModel && j.model && j.model !== options.expectedModel) {
        return {
          ok: false,
          reason: `Cached judgment "${jId}" has model mismatch (expected "${options.expectedModel}", got "${j.model}").`,
        };
      }
      if (expectedSemantics && (!j.questionSemantics || j.questionSemantics !== expectedSemantics)) {
        return {
          ok: false,
          reason: `Cached judgment "${jId}" has questionSemantics mismatch (expected "${expectedSemantics}", got "${j.questionSemantics || "missing"}").`,
        };
      }
    }
    return { ok: true };
  }

  if (record.status === "completed" || record.status === "partial") {
    const decisionsDir = join(root, "agent/decisions/jev");
    let validReceiptsCount = 0;
    const answeredKeys = new Set<string>();

    if (record.receiptIds && record.receiptIds.length > 0) {
      for (const rFile of record.receiptIds) {
        const rPath = join(decisionsDir, rFile);
        if (!existsSync(rPath)) {
          return {
            ok: false,
            reason: `Referenced receipt "${rFile}" not found on disk (no valid matched judgments).`,
          };
        }
        let receipt: JevReceipt;
        try {
          receipt = JSON.parse(readFileSync(rPath, "utf8"));
        } catch {
          return {
            ok: false,
            reason: `Referenced receipt "${rFile}" is corrupt or not valid JSON.`,
          };
        }
        if (!receipt || typeof receipt !== "object" || receipt.schemaVersion !== 1 || !receipt.receiptId) {
          return {
            ok: false,
            reason: `Referenced receipt "${rFile}" is malformed (missing schemaVersion or receiptId).`,
          };
        }
        const expectedReceiptType = task.taskType === "coverage" ? "custom" : task.taskType;
        if (receipt.taskType !== task.taskType && receipt.taskType !== expectedReceiptType) {
          return {
            ok: false,
            reason: `Referenced receipt "${rFile}" taskType mismatch (expected "${task.taskType}" or "${expectedReceiptType}", got "${receipt.taskType}").`,
          };
        }
        if (receipt.nodeId && receipt.nodeId !== nodeId) {
          return {
            ok: false,
            reason: `Referenced receipt "${rFile}" nodeId mismatch (expected "${nodeId}", got "${receipt.nodeId}").`,
          };
        }
        if (options?.expectedModel) {
          if (!receipt.model || receipt.model !== options.expectedModel) {
            return {
              ok: false,
              reason: `Referenced receipt "${rFile}" model mismatch (expected "${options.expectedModel}", got "${receipt.model || "missing"}").`,
            };
          }
        }
        if (receipt.status !== "ok" && !receipt.cached) {
          return {
            ok: false,
            reason: `Referenced receipt "${rFile}" has non-successful status "${receipt.status}".`,
          };
        }
        if (!receipt.stateHash) {
          return {
            ok: false,
            reason: `Referenced receipt "${rFile}" is missing stateHash provenance.`,
          };
        }
        if (manifest && manifest.batchStateHashes.length > 0 && !manifest.batchStateHashes.includes(receipt.stateHash)) {
          return {
            ok: false,
            reason: `Receipt stateHash "${receipt.stateHash}" is not in manifest batchStateHashes (stale or unbound state).`,
          };
        }
        if (manifest?.questionIds && manifest.questionIds.length > 0) {
          const answerKeys = Object.keys(receipt.answers);
          const allowed = new Set(manifest.questionIds);
          const unknown = answerKeys.filter(k => !allowed.has(k) && k !== "relation");
          if (unknown.length > 0) {
            return {
              ok: false,
              reason: `Referenced receipt "${rFile}" has answer keys not bound in the task manifest: ${unknown.join(", ")}.`,
            };
          }
        }
        if (!receipt.answers || typeof receipt.answers !== "object" || Object.keys(receipt.answers).length === 0) {
          return {
            ok: false,
            reason: `Referenced receipt "${rFile}" contains no answers.`,
          };
        }
        for (const key of Object.keys(receipt.answers)) answeredKeys.add(key);
        validReceiptsCount++;
      }
    }

    let validJudgmentsCount = 0;
    if (record.judgmentIds && record.judgmentIds.length > 0) {
      for (const jId of record.judgmentIds) {
        const j = ledger.judgments[jId];
        if (!j) {
          return {
            ok: false,
            reason: `Referenced judgment "${jId}" not found in evidence ledger.`,
          };
        }
        if (j.invalidated) {
          return {
            ok: false,
            reason: `Referenced judgment "${jId}" is invalidated in evidence ledger.`,
          };
        }
        if (j.nodeId && j.nodeId !== nodeId) {
          return {
            ok: false,
            reason: `Referenced judgment "${jId}" has nodeId mismatch (expected "${nodeId}", got "${j.nodeId}").`,
          };
        }
        if (options?.expectedModel && j.model && j.model !== options.expectedModel) {
          return {
            ok: false,
            reason: `Referenced judgment "${jId}" has model mismatch (expected "${options.expectedModel}", got "${j.model}").`,
          };
        }
        if (expectedSemantics && (!j.questionSemantics || j.questionSemantics !== expectedSemantics)) {
          return {
            ok: false,
            reason: `Referenced judgment "${jId}" has questionSemantics mismatch (expected "${expectedSemantics}", got "${j.questionSemantics || "missing"}").`,
          };
        }
        validJudgmentsCount++;
      }
    }

    if (validReceiptsCount === 0 && validJudgmentsCount === 0) {
      return {
        ok: false,
        reason: `Task recorded "${record.status}" status but has no valid matched judgments in ledger and no valid receipts on disk.`,
      };
    }
    if (record.status === "completed" && manifest?.questionIds && manifest.questionIds.length > 0) {
      const missing = manifest.questionIds.filter(id => !answeredKeys.has(id));
      if (missing.length) {
        return {
          ok: false,
          reason: `Completed task "${task.taskId}" is missing answers for ${missing.join(", ")}; a receipt covering only part of the batch is not a complete proof.`,
        };
      }
    }
    return { ok: true };
  }

  return { ok: false, reason: `Unknown task execution status: "${record.status}".` };
}

/** Resets registry to default built-in task registrations. */
export function initDefaultRegistry(): void {
  REGISTRY.clear();

for (const task of MEDIA_TASKS) registerTask({taskId: task.id, taskType: "custom", lifecycleCaller: [...task.stages], inputSchema: "MediaInventory/MediaSelection v1", outputConsumer: "preparation media advisory", fallback: "Full agent selection and visual verification", testId: "stock-media integration", description: "Preparation-bound advisory; observations only; no delegation", delegationEligible: false});


  registerTask({
    taskId: "business-source-selection",
    taskType: "custom",
    lifecycleCaller: ["business"],
    inputSchema: "FieldCandidate[]",
    outputConsumer: "business-author-packet",
    fallback: "Full harvest transcription by the business author",
    testId: "Phase 2: business-author source selection removes covered transcription",
    description: "Choice for single-value harvest fields; Noul per candidate for multi-value fields; transcription removed only after complete coverage",
    delegationEligible: false,
  });

  registerTask({
    taskId: "business-review-grounding",
    taskType: "grounding",
    lifecycleCaller: ["business-review"],
    inputSchema: "GroundingBatchCandidate[]",
    outputConsumer: "critic-packet",
    fallback: "Standard context packet without automated preflight summary",
    testId: "runSemanticGroundingPreflight batches multiple candidates into bounded multi-question requests",
    description: "Evaluates factual claim grounding against indexed harvest evidence for business onboarding",
    delegationEligible: false,
  });

  registerTask({
    taskId: "narrative-review-grounding",
    taskType: "grounding",
    lifecycleCaller: ["narrative-review"],
    inputSchema: "NarrativeClaim[]",
    outputConsumer: "critic-packet",
    fallback: "Standard context packet without automated preflight summary",
    testId: "runSemanticGroundingPreflight narrative-review",
    description: "Evaluates narrative brief assertions against approved business facts",
    delegationEligible: false,
  });

  registerTask({
    taskId: "copy-review-grounding",
    taskType: "cta_consistency",
    lifecycleCaller: ["copy-review"],
    inputSchema: "CtaActionPair[]",
    outputConsumer: "critic-packet",
    fallback: "Standard context packet without automated preflight summary",
    testId: "CTA preflight maps unaddressed choice strictly to insufficient_evidence, never verified",
    description: "Validates copy plan CTAs against storyboard action contracts",
    delegationEligible: false,
  });

  // Workstream 5 — Semantic quality checks on actual output
  // All are experimental/uncalibrated: delegationEligible=false. Fallback restores full agent obligation.

  registerTask({
    taskId: "claim-strengthening-check",
    taskType: "coverage",
    lifecycleCaller: ["copy-review", "content-review"],
    inputSchema: "ClaimStrengtheningItem[]",
    outputConsumer: "critic-packet",
    fallback: "Full agent review of aspiration/expertise drift, negation, and date qualifications",
    testId: "claim strengthening check: aspiration-to-expertise detection, negation, dates",
    description: "Checks whether copy atomic assertions are supported vs stated as aspiration or expertise without evidence. Experimental/uncalibrated.",
    delegationEligible: false,
  });

  registerTask({
    taskId: "cross-stage-consistency-check",
    taskType: "coverage",
    lifecycleCaller: ["copy-review", "representative-quality"],
    inputSchema: "CrossStageConsistencyItem[]",
    outputConsumer: "critic-packet",
    fallback: "Full agent cross-stage review for audience drift, offer drift, proof dropped, and action inconsistency",
    testId: "cross-stage consistency check: dependency edge filtering, independent batch, deferred dependent",
    description: "Validates semantic continuity across business→narrative→storyboard→copy. Experimental/uncalibrated.",
    delegationEligible: false,
  });

  registerTask({
    taskId: "cta-fidelity-check",
    taskType: "cta_consistency",
    lifecycleCaller: ["copy-review", "content-review"],
    inputSchema: "CtaFidelityItem[]",
    outputConsumer: "critic-packet",
    fallback: "Full agent CTA review including scheduling vs contact request and label/promise match",
    testId: "CTA fidelity check: broken route (deterministic), label/promise mismatch (Jev), scheduling vs contact-request",
    description: "Checks CTA label vs observed destination. Broken routes deterministic; semantic mismatch via Jev. Experimental/uncalibrated.",
    delegationEligible: false,
  });

  registerTask({
    taskId: "intent-coverage-check",
    taskType: "coverage",
    lifecycleCaller: ["copy-review", "content-review"],
    inputSchema: "IntentCoverageItem[]",
    outputConsumer: "critic-packet",
    fallback: "Full agent review of approved visitor question coverage",
    testId: "intent coverage check: independent batch, deferred dependent, section location",
    description: "Maps approved visitor questions to content sections. Independent items batch; dependent deferred. Experimental/uncalibrated.",
    delegationEligible: false,
  });

  // Workstream 7 — Creative candidate and media fit scoring
  // Shadow/advisory only, uncalibrated, no delegation.

  registerTask({
    taskId: "creative-dimension-scoring",
    taskType: "custom",
    lifecycleCaller: ["direction-review", "representative-review"],
    inputSchema: "CreativeDimensionScoringItem[]",
    outputConsumer: "direction-packet",
    fallback: "Full agent creative evaluation without machine dimension scores",
    testId: "creative dimension scoring: normalized scores, hard factual failure overrides preference",
    description: "Scores creative candidates across rubric dimensions (audienceClarity, businessSpecificity, proofFit, actionClarity, preferenceAdherence, internalConsistency). Advisory/uncalibrated.",
    delegationEligible: false,
  });

  registerTask({
    taskId: "media-fit-scoring",
    taskType: "custom",
    lifecycleCaller: ["direction-review", "direction"],
    inputSchema: "MediaFitScoringItem[]",
    outputConsumer: "direction-packet",
    fallback: "Full agent media selection without machine fit scores",
    testId: "media fit scoring: normalized scores, advisory label in prompt",
    description: "Scores media candidates against section brief. Advisory/uncalibrated. No delegation.",
    delegationEligible: false,
  });

  registerTask({
    taskId: "direction-decision-check",
    taskType: "custom",
    lifecycleCaller: ["direction-review"],
    inputSchema: "DirectionDecisionItem[]",
    outputConsumer: "direction-packet",
    fallback: "Agent judges the textual direction without a machine decision check",
    testId: "direction decision check: partial answers stay unavailable and do not become a low score",
    description: "Advisory textual checks for hierarchy, evidence, unavailable imagery, alternative difference, and user constraints. Uncalibrated.",
    delegationEligible: false,
  });

  registerTask({
    taskId: "composition-repetition-check",
    taskType: "custom",
    lifecycleCaller: ["storyboard", "representative"],
    inputSchema: "CompositionSequence",
    outputConsumer: "composition-preflight",
    fallback: "Deterministic storyboard rhythm check plus agent visual review",
    testId: "composition preflight: useful list passes; unrelated equal stack raises a finding; palette change does not clear it",
    description: "Advisory semantic check that repetition serves one narrative job. Caller: scoreCompositionRepetition during storyboard and representative prepare when compositionCheck is not off. Deterministic composition-preflight stays separate. Uncalibrated; does not remove critic duties.",
    delegationEligible: false,
  });


}

// Auto-initialize standard tasks on module load
initDefaultRegistry();

