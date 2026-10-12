import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JevClient } from "./client.ts";
import { partitionBatchItems, executeBatches, type BatchableQuestion } from "./batching.ts";
import { recordPrepBounds } from "./bounds.ts";
import {
  makeClaimErrorNoulQuestion,
  makeIntentCoverageNoulQuestion,
  makeCtaFidelityQuestion,
  makeContinuityQuestion,
  makeRedundancyNoulQuestion,
  CLAIM_ERROR_SEMANTICS_HASH,
  INTENT_COVERAGE_SEMANTICS_HASH,
  CTA_FIDELITY_SEMANTICS_HASH,
  CONTINUITY_SEMANTICS_HASH,
  questionSemanticsHash,
} from "./questions.ts";
import { getTasksForCaller, loadTaskExecution, loadTaskManifest, recordTaskExecution, saveTaskManifest, verifyTaskExecution } from "./service-registry.ts";
import { json, type Business, type CriticDisposition, type Finding, type Review } from "../artifacts.ts";
import { loadGoalContract, missingGoalFindings, syncGoalContract } from "./goals.ts";
import { sha256Hex } from "./state.ts";
import { POLICY_VERSION } from "./policy.ts";
import type { JevCapabilityConfig, JevMode } from "./types.ts";
import {
  attachLineage,
  comparePlannedToRendered,
  extractAssertionsForNode,
  extractCtasForNode,
  extractPlannedAssertions,
  extractRenderedAssertions,
  formatEvidenceForJev,
  unauthorizedContactFindings,
  type VisibleAssertion,
} from "./visible-assertions.ts";

export const QUALITY_NOUL_ACCEPT = 0.85;
export const QUALITY_NOUL_REJECT = 0.15;

export const QUALITY_TASK_BUDGET: Record<string, number> = {
  "cta-fidelity-check": 8,
  "intent-coverage-check": 10,
  "claim-strengthening-check": 16,
  "cross-stage-consistency-check": 6,
};

export const QUALITY_TASK_SEMANTICS: Record<string, string> = {
  "claim-strengthening-check": CLAIM_ERROR_SEMANTICS_HASH,
  "intent-coverage-check": INTENT_COVERAGE_SEMANTICS_HASH,
  "cta-fidelity-check": CTA_FIDELITY_SEMANTICS_HASH,
  "cross-stage-consistency-check": CONTINUITY_SEMANTICS_HASH,
};

export interface QualityFinding {
  id: string;
  taskId: string;
  subjectId: string;
  location: string;
  evidenceSpan?: string;
  kind: string;
  severity: "error" | "warning";
  raw?: Record<string, unknown>;
  policyDecision: "escalate" | "pass" | "uncertain";
  policyVersion: string;
  verification: string;
  author: string;
  subjectHash?: string;
  sourceHash?: string;
  status: "open" | "resolved" | "uncertain";
}

export interface QualityTaskRecord {
  taskId: string;
  status: "completed" | "partial" | "unavailable" | "no_candidates";
  questionIds: string[];
  skippedIds: string[];
  findings: string[];
}

export type ObligationStatus = "judged" | "cached" | "skipped" | "overflow" | "unavailable";

export interface QualityObligation {
  questionId: string;
  obligationId: string;
  taskId: string;
  cacheKey: string;
  status: ObligationStatus;
  decision?: string;
  subjectHash?: string;
  /** Preparation that originally judged a cached pass. */
  priorPreparationId?: string;
}

export interface QualityCheckResult {
  findings: QualityFinding[];
  standardFindings: Finding[];
  status: "completed" | "partial" | "unavailable" | "no_candidates";
  overflowObligation?: string;
  overflowIds?: string[];
  tasks: QualityTaskRecord[];
  obligations?: QualityObligation[];
}

export function obligationCacheKey(opts: {
  questionId: string;
  assertionHash: string;
  evidenceHash: string;
  model: string;
  policyHash: string;
}): string {
  return sha256Hex([opts.questionId, opts.assertionHash, opts.evidenceHash, opts.model, opts.policyHash].join("\0"));
}

export const POLICY_HASH = sha256Hex(POLICY_VERSION);

function noulDecision(noul: number | undefined): "escalate" | "pass" | "uncertain" {
  if (typeof noul !== "number") return "uncertain";
  if (noul >= QUALITY_NOUL_ACCEPT) return "escalate";
  if (noul <= QUALITY_NOUL_REJECT) return "pass";
  return "uncertain";
}

export function extractCopyAssertions(root: string): Array<{ id: string; text: string; location: string; evidence: string }> {
  return extractPlannedAssertions(root).map(a => ({
    id: a.id,
    text: a.text,
    location: `${a.pagePath}#${a.sectionId}`,
    evidence: a.evidence.map(e => e.excerpt).join("\n"),
  }));
}

export function extractCtaPairs(root: string): Array<{ id: string; label: string; behavior: string; location: string }> {
  return extractCtasForNode(root, "copy-review").map(c => ({
    id: c.id, label: c.label, behavior: c.behavior, location: c.location,
  }));
}

export function nearDuplicatePairs(texts: Array<{ id: string; text: string; location: string }>): Array<{ a: typeof texts[0]; b: typeof texts[0] }> {
  const pairs: Array<{ a: typeof texts[0]; b: typeof texts[0] }> = [];
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").slice(0, 280);
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = norm(texts[i]!.text);
      const b = norm(texts[j]!.text);
      if (a.length < 40 || b.length < 40) continue;
      if (a === b || a.includes(b) || b.includes(a)) {
        pairs.push({ a: texts[i]!, b: texts[j]! });
      }
    }
  }
  return pairs.slice(0, 8);
}

const QUALITY_TASKS = ["claim-strengthening-check", "intent-coverage-check", "cta-fidelity-check", "cross-stage-consistency-check"] as const;

export function qualityPath(root: string, preparationId: string): string {
  return join(root, "agent/runs", `${preparationId}.quality.json`);
}

export function loadQualityResult(root: string, preparationId: string): QualityCheckResult | undefined {
  const path = qualityPath(root, preparationId);
  if (!existsSync(path)) return undefined;
  try { return JSON.parse(readFileSync(path, "utf8")) as QualityCheckResult; } catch { return undefined; }
}

export function loadLatestQualityResult(root: string, nodeId?: string): QualityCheckResult | undefined {
  const dir = join(root, "agent/runs");
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir).filter(f => f.endsWith(".quality.json")).sort().reverse();
  for (const f of files) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, f), "utf8"));
      if (!nodeId || parsed.nodeId === nodeId) return parsed as QualityCheckResult;
    } catch { /* ignore */ }
  }
  return undefined;
}

function enabledQualityTasks(caps?: Partial<JevCapabilityConfig>): Set<string> {
  const enabled = new Set<string>();
  const on = (mode?: JevMode) => mode && mode !== "off";
  if (!caps) {
    QUALITY_TASKS.forEach(t => enabled.add(t));
    return enabled;
  }
  if (on(caps.claimStrengthening)) enabled.add("claim-strengthening-check");
  if (on(caps.coverageCheck)) enabled.add("intent-coverage-check");
  if (on(caps.ctaFidelity)) enabled.add("cta-fidelity-check");
  if (on(caps.crossStageContinuity)) enabled.add("cross-stage-consistency-check");
  return enabled;
}

function priorPassedObligations(root: string, nodeId: string): Map<string, { cacheKey: string; decision: string; preparationId?: string; subjectHash?: string }> {
  const out = new Map<string, { cacheKey: string; decision: string; preparationId?: string; subjectHash?: string }>();
  const dir = join(root, "agent/runs");
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter(n => n.endsWith(".quality.json"))) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, f), "utf8"));
      if (parsed.nodeId && parsed.nodeId !== nodeId) continue;
      for (const item of parsed.obligations || parsed.judgedSubjects || []) {
        const qid = item.questionId || item.id;
        const cacheKey = item.cacheKey;
        if (!qid || item.decision !== "pass" || item.status === "cached") continue;
        if (cacheKey) out.set(qid, { cacheKey, decision: item.decision, preparationId: parsed.preparationId, subjectHash: item.subjectHash });
      }
    } catch { /* ignore */ }
  }
  return out;
}

function claimPriority(item: BatchableQuestion): number {
  const loc = String((item.metadata as any)?.location || "");
  if (/#hero\b/i.test(loc) || /hero/i.test(loc)) return 0;
  if ((item.evidenceExcerpt || "").length > 20) return 1;
  return 2;
}

export function partitionQuestionsByClaim(items: BatchableQuestion[], budget: number): { kept: BatchableQuestion[]; overflow: BatchableQuestion[] } {
  const groups = new Map<string, BatchableQuestion[]>();
  const order: string[] = [];
  const sorted = [...items].sort((a, b) => claimPriority(a) - claimPriority(b));
  for (const item of sorted) {
    const key = item.claimId || item.id;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(item);
  }
  const kept: BatchableQuestion[] = [];
  const overflow: BatchableQuestion[] = [];
  for (const key of order) {
    const group = groups.get(key) || [];
    if (kept.length >= budget) {
      overflow.push(...group);
      continue;
    }
    if (kept.length + group.length <= budget) {
      kept.push(...group);
    } else if (kept.length === 0) {
      kept.push(...group.slice(0, budget));
      overflow.push(...group.slice(budget));
    } else {
      overflow.push(...group);
    }
  }
  return { kept, overflow };
}

export async function runQualityChecks(opts: {
  root: string;
  client: JevClient;
  nodeId: string;
  preparationId: string;
  inputHash?: string;
  signal?: AbortSignal;
  capabilities?: Partial<JevCapabilityConfig>;
  skipUnchanged?: boolean;
}): Promise<QualityCheckResult> {
  const { root, client, nodeId, preparationId } = opts;
  const findings: QualityFinding[] = [];
  const enabled = enabledQualityTasks(opts.capabilities);
  const byTask = new Map<string, BatchableQuestion[]>();
  const skippedByTask = new Map<string, string[]>();
  const judgedSubjects: Array<{ id: string; taskId: string; subjectHash: string; decision: string; cacheKey?: string; questionId?: string }> = [];
  const obligations: QualityObligation[] = [];
  const passed = opts.skipUnchanged === false
    ? new Map<string, { cacheKey: string; decision: string; preparationId?: string; subjectHash?: string }>()
    : priorPassedObligations(root, nodeId);
  const model = client.model || "jev-1.13.0";

  const synced = syncGoalContract(root);
  const contract = synced.contract || loadGoalContract(root)!;

  const assertions = extractAssertionsForNode(root, nodeId);
  if (nodeId === "content-review") {
    const planned = extractPlannedAssertions(root);
    const rendered = extractRenderedAssertions(root);
    const lineage = attachLineage(root, planned, rendered);
    const delta = comparePlannedToRendered(planned, rendered);
    for (const added of lineage.unmatchedRendered) {
      findings.push({
        id: `added_${added.id}`,
        taskId: "claim-strengthening-check",
        subjectId: added.id,
        location: `${added.pagePath}#${added.sectionId}`,
        kind: "added_rendered_claim",
        severity: "error",
        policyDecision: "escalate",
        policyVersion: POLICY_VERSION,
        verification: "Rendered assertion is not in the copy plan and has no attached fact IDs; bind evidence or remove it.",
        author: "pages",
        status: "open",
        subjectHash: added.sourceHash,
      });
    }
    for (const dropped of delta.dropped) {
      findings.push({
        id: `dropped_${dropped.id}`,
        taskId: "claim-strengthening-check",
        subjectId: dropped.id,
        location: `${dropped.pagePath}#${dropped.sectionId}`,
        kind: "dropped_planned_claim",
        severity: "warning",
        policyDecision: "escalate",
        policyVersion: POLICY_VERSION,
        verification: "Planned assertion is missing from compiled HTML.",
        author: "pages",
        status: "open",
        subjectHash: dropped.sourceHash,
      });
    }
    for (const pair of delta.strengthened) {
      findings.push({
        id: `strengthened_${pair.rendered.id}`,
        taskId: "claim-strengthening-check",
        subjectId: pair.rendered.id,
        location: `${pair.rendered.pagePath}#${pair.rendered.sectionId}`,
        kind: "dropped_qualification",
        severity: "error",
        policyDecision: "escalate",
        policyVersion: POLICY_VERSION,
        verification: `Rendered copy strengthens or drops a qualifier from planned text ("${pair.planned.text}" → "${pair.rendered.text}").`,
        author: "pages",
        status: "open",
        subjectHash: pair.rendered.sourceHash,
        evidenceSpan: pair.planned.text,
      });
    }
    for (const conflict of lineage.conflicts) {
      findings.push({
        id: `conflict_${conflict.id}`,
        taskId: "claim-strengthening-check",
        subjectId: conflict.id,
        location: `${conflict.pagePath}#${conflict.sectionId}`,
        kind: "ambiguous_lineage",
        severity: "error",
        policyDecision: "escalate",
        policyVersion: POLICY_VERSION,
        verification: "Bounded semantic matching found multiple planned candidates; do not silently attach fact IDs.",
        author: "pages",
        status: "open",
        subjectHash: conflict.sourceHash,
      });
    }
    for (const stale of lineage.stale) {
      findings.push({
        id: `stale_${stale.id}`,
        taskId: "claim-strengthening-check",
        subjectId: stale.id,
        location: `${stale.pagePath}#${stale.sectionId}`,
        kind: "stale_source_hash",
        severity: "error",
        policyDecision: "escalate",
        policyVersion: POLICY_VERSION,
        verification: stale.evidenceObligation || "Copy-plan source hash no longer matches the stored assertion.",
        author: "pages",
        status: "open",
        subjectHash: stale.sourceHash,
      });
    }
    for (const reused of lineage.reusedHeadings) {
      findings.push({
        id: `reused_heading_${sha256Hex(reused.text).slice(0, 12)}`,
        taskId: "claim-strengthening-check",
        subjectId: reused.text,
        location: reused.sections.join("|"),
        kind: "reused_heading",
        severity: "warning",
        policyDecision: "escalate",
        policyVersion: POLICY_VERSION,
        verification: `Heading "${reused.text}" is reused across ${reused.sections.join(", ")}.`,
        author: "pages",
        status: "open",
      });
    }
  }

  for (const phone of unauthorizedContactFindings(root, assertions)) {
    findings.push({
      id: phone.id,
      taskId: "claim-strengthening-check",
      subjectId: phone.id,
      location: phone.location,
      kind: "third_party_contact",
      severity: "error",
      policyDecision: "escalate",
      policyVersion: POLICY_VERSION,
      verification: `Visible phone ${phone.phone} is not in the verified business/evidence ledger.`,
      author: nodeId === "content-review" ? "pages" : "copy",
      status: "open",
      evidenceSpan: phone.text,
    });
  }

  const errorKinds = ["unsupported", "contradiction", "dropped_qualification", "exaggerated_strength", "off_target_evidence"] as const;
  if (enabled.has("claim-strengthening-check")) {
    const claimItems: BatchableQuestion[] = [];
    const skipped: string[] = [];
    for (const a of assertions) {
      const jevEvidence = formatEvidenceForJev(a);
      if (!jevEvidence) {
        findings.push({
          id: `evidence_${a.id}`,
          taskId: "claim-strengthening-check",
          subjectId: a.id,
          location: `${a.pagePath}#${a.sectionId}`,
          kind: a.evidenceStatus === "conflicting" ? "conflicting_evidence" : "missing_evidence",
          severity: "error",
          policyDecision: "escalate",
          policyVersion: POLICY_VERSION,
          verification: a.evidenceObligation || "Bind exact source excerpts; never use the assertion as evidence.",
          author: nodeId === "content-review" ? "pages" : "copy",
          status: "open",
          evidenceSpan: a.evidence.map(e => e.excerpt).join(" | ") || undefined,
          subjectHash: a.sourceHash,
          sourceHash: a.evidence[0]?.hash,
        });
        skipped.push(a.id);
        continue;
      }
      const subjectHash = sha256Hex(`${a.text}\n${jevEvidence}`);
      const assertionHash = sha256Hex(a.text);
      const evidenceHash = sha256Hex(jevEvidence);
      for (const kind of errorKinds) {
        const questionId = `${a.id}_${kind}`;
        const cacheKey = obligationCacheKey({
          questionId, assertionHash, evidenceHash, model, policyHash: POLICY_HASH,
        });
        const prior = passed.get(questionId);
        if (prior?.cacheKey === cacheKey && prior.decision === "pass") {
          skipped.push(questionId);
          judgedSubjects.push({ id: questionId, taskId: "claim-strengthening-check", subjectHash, decision: "pass", cacheKey, questionId });
          obligations.push({ questionId, obligationId: questionId, taskId: "claim-strengthening-check", cacheKey, status: "cached", decision: "pass", subjectHash, priorPreparationId: prior.preparationId });
          continue;
        }
        claimItems.push({
          id: questionId,
          taskType: "coverage",
          questionKey: questionId,
          question: makeClaimErrorNoulQuestion(kind, a.text, jevEvidence),
          claimId: a.id,
          claim: a.text,
          evidenceExcerpt: jevEvidence,
          metadata: { kind, location: `${a.pagePath}#${a.sectionId}`, taskId: "claim-strengthening-check", subjectHash, sourceHash: a.sourceHash, evidenceSpan: a.evidence.map(e => `${e.source}:${e.excerpt.slice(0, 120)}`).join(" | "), cacheKey, assertionHash, evidenceHash },
        });
      }
    }
    byTask.set("claim-strengthening-check", claimItems);
    skippedByTask.set("claim-strengthening-check", skipped);
  }

  if (enabled.has("intent-coverage-check")) {
    const items: BatchableQuestion[] = [];
    const pageText = assertions.map(a => a.text).join("\n").slice(0, 4000);
    for (const g of contract.obligations.filter(o => o.kind === "visitor_question" || o.kind === "business_outcome")) {
      const subjectHash = sha256Hex(`${g.id}:${g.statement}:${pageText}`);
      const questionId = `intent_${g.id}`;
      const cacheKey = obligationCacheKey({
        questionId, assertionHash: sha256Hex(g.statement), evidenceHash: sha256Hex(pageText),
        model, policyHash: POLICY_HASH,
      });
      const prior = passed.get(questionId);
      if (prior?.cacheKey === cacheKey && prior.decision === "pass") {
        obligations.push({ questionId, obligationId: questionId, taskId: "intent-coverage-check", cacheKey, status: "cached", decision: "pass", subjectHash, priorPreparationId: prior.preparationId });
        continue;
      }
      items.push({
        id: `intent_${g.id}`,
        taskType: "coverage",
        questionKey: `intent_${g.id}`,
        question: makeIntentCoverageNoulQuestion(g.statement, pageText || "(no copy yet)"),
        claimId: g.id,
        claim: g.statement,
        metadata: { taskId: "intent-coverage-check", location: g.pagePath || "/", subjectHash, priority: g.priority, cacheKey },
      });
    }
    byTask.set("intent-coverage-check", items);
  }

  if (enabled.has("cta-fidelity-check")) {
    const items: BatchableQuestion[] = [];
    const skipped: string[] = [];
    for (const cta of extractCtasForNode(root, nodeId)) {
      if (cta.linkResolved === false && cta.href && !cta.href.startsWith("#")) {
        findings.push({
          id: `cta_broken_${cta.id}`,
          taskId: "cta-fidelity-check",
          subjectId: cta.id,
          location: cta.location,
          kind: "broken_link",
          severity: "error",
          policyDecision: "escalate",
          policyVersion: POLICY_VERSION,
          verification: `Deterministic: CTA "${cta.label}" target ${cta.href} does not resolve.`,
          author: nodeId === "content-review" ? "pages" : "copy",
          status: "open",
        });
        skipped.push(cta.id);
        continue;
      }
      const subjectHash = sha256Hex(`${cta.label}|${cta.behavior}|${cta.behaviorKind}`);
      const cacheKey = obligationCacheKey({
        questionId: cta.id, assertionHash: sha256Hex(cta.label), evidenceHash: sha256Hex(cta.behavior),
        model, policyHash: POLICY_HASH,
      });
      const prior = passed.get(cta.id);
      if (prior?.cacheKey === cacheKey && prior.decision === "pass") {
        skipped.push(cta.id);
        obligations.push({ questionId: cta.id, obligationId: cta.id, taskId: "cta-fidelity-check", cacheKey, status: "cached", decision: "pass", subjectHash, priorPreparationId: prior.preparationId });
        continue;
      }
      items.push({
        id: cta.id,
        taskType: "cta_consistency",
        questionKey: cta.id,
        question: makeCtaFidelityQuestion(cta.label, cta.behavior),
        claimId: cta.id,
        claim: cta.label,
        evidenceExcerpt: cta.behavior,
        metadata: { taskId: "cta-fidelity-check", location: cta.location, subjectHash, behaviorKind: cta.behaviorKind, cacheKey },
      });
    }
    byTask.set("cta-fidelity-check", items);
    skippedByTask.set("cta-fidelity-check", skipped);
  }

  if (enabled.has("cross-stage-consistency-check")) {
    const items: BatchableQuestion[] = [];
    let bus: Business | undefined;
    const busPath = join(root, "onboarding/business.json");
    if (existsSync(busPath)) {
      try { bus = json<Business>(busPath); } catch { /* ignore */ }
    }
    const narrPath = join(root, "onboarding/narrative-brief.json");
    if (bus && existsSync(narrPath)) {
      try {
        const narr = JSON.parse(readFileSync(narrPath, "utf8"));
        items.push({
          id: "edge_business_narrative",
          taskType: "coverage",
          questionKey: "edge_business_narrative",
          question: makeContinuityQuestion(bus.offer, narr.offer || narr.customer || "", "business→narrative"),
          claimId: "offer",
          claim: bus.offer,
          metadata: { taskId: "cross-stage-consistency-check", location: "narrative-brief" },
        });
      } catch { /* ignore */ }
    }
    byTask.set("cross-stage-consistency-check", items);
  }

  if (enabled.has("claim-strengthening-check")) {
    const dups = nearDuplicatePairs(assertions.map(a => ({ id: a.id, text: a.text, location: `${a.pagePath}#${a.sectionId}` })));
    const extras = byTask.get("claim-strengthening-check") || [];
    for (const pair of dups) {
      extras.push({
        id: `dup_${pair.a.id}_${pair.b.id}`,
        taskType: "coverage",
        questionKey: `dup_${pair.a.id}_${pair.b.id}`,
        question: makeRedundancyNoulQuestion(pair.a.text, pair.b.text),
        claimId: pair.a.id,
        claim: pair.a.text,
        metadata: { kind: "redundant", taskId: "claim-strengthening-check", location: `${pair.a.location}|${pair.b.location}` },
      });
    }
    byTask.set("claim-strengthening-check", extras);
  }

  const overflowIds: string[] = [];
  const kept: BatchableQuestion[] = [];
  const taskRecords: QualityTaskRecord[] = [];
  for (const taskId of QUALITY_TASKS) {
    if (!enabled.has(taskId)) continue;
    const items = byTask.get(taskId) || [];
    const budget = QUALITY_TASK_BUDGET[taskId] ?? 8;
    const { kept: take, overflow: drop } = partitionQuestionsByClaim(items, budget);
    kept.push(...take);
    overflowIds.push(...drop.map(i => i.id));
    skippedByTask.set(taskId, [...(skippedByTask.get(taskId) || []), ...drop.map(i => i.id)]);
    for (const item of drop) {
      obligations.push({
        questionId: item.id,
        obligationId: item.id,
        taskId,
        cacheKey: String((item.metadata as any)?.cacheKey || item.id),
        status: "overflow",
        subjectHash: (item.metadata as any)?.subjectHash,
      });
    }
    if (drop.length) {
      findings.push({
        id: `overflow_${taskId}`,
        taskId,
        subjectId: "overflow",
        location: "",
        kind: "incomplete",
        severity: "warning",
        policyDecision: "uncertain",
        policyVersion: POLICY_VERSION,
        verification: `Unjudged obligation IDs remain in the critic obligation: ${drop.map(i => i.id).join(", ")}`,
        author: "copy",
        status: "open",
      });
    }
  }

  recordPrepBounds(root, preparationId, { questions: kept.length, candidates: [...byTask.values()].reduce((n, a) => n + a.length, 0), overflow: overflowIds.length ? { droppedIds: overflowIds, reason: "per-task budget", agentObligation: overflowIds.join(", ") } : undefined });

  if (kept.length === 0 && findings.length === 0) {
    for (const t of getTasksForCaller(nodeId).filter(t => enabled.has(t.taskId))) {
      recordTaskExecution(root, {
        preparationId, nodeId, taskId: t.taskId, taskType: t.taskType,
        inputHash: opts.inputHash || "missing", status: "no_candidates", timestamp: new Date().toISOString(),
      });
      taskRecords.push({ taskId: t.taskId, status: "no_candidates", questionIds: [], skippedIds: [], findings: [] });
    }
    const empty: QualityCheckResult = { findings: [], standardFindings: [], status: "no_candidates", tasks: taskRecords, overflowIds, obligations };
    persistQuality(root, preparationId, nodeId, empty, judgedSubjects, obligations);
    return empty;
  }

  const { partitions: mixedPartitions, rejectedOversizedItems } = partitionBatchItems(kept);
  const partitions = mixedPartitions;
  for (const t of getTasksForCaller(nodeId).filter(t => enabled.has(t.taskId))) {
    const taskItems = kept.filter(i => (i.metadata as any)?.taskId === t.taskId);
    try {
      saveTaskManifest(root, {
        schemaVersion: 1,
        preparationId,
        nodeId,
        taskId: t.taskId,
        taskType: t.taskType,
        expectedModel: client.model,
        questionSemanticsHash: QUALITY_TASK_SEMANTICS[t.taskId] || questionSemanticsHash(taskItems[0]?.question || { task: t.taskId }),
        claimIds: taskItems.map(i => i.claimId || i.id),
        evidenceIds: [],
        claimHashes: Object.fromEntries(taskItems.map(i => [i.id, sha256Hex(i.claim || i.id)])),
        evidenceHashes: {},
        batchStateHashes: partitions.filter(p => taskItems.some(i => p.questionIds.includes(i.questionKey || i.id) || p.questionIds.includes(i.id))).map(p => sha256Hex(JSON.stringify(p.state))),
        questionIds: taskItems.map(i => i.id),
        subjectHash: opts.inputHash,
        createdAt: new Date().toISOString(),
      });
    } catch { /* already sealed */ }
  }

  try {
    const executed = { answers: {} as Record<string, unknown>, receipts: [] as string[], itemReceipts: {} as Record<string, string> };
    for (const t of getTasksForCaller(nodeId).filter(x => enabled.has(x.taskId))) {
      const taskItems = kept.filter(i => (i.metadata as any)?.taskId === t.taskId);
      const taskPartitions = partitions.filter(p => taskItems.some(i => p.questionIds.includes(i.id)));
      if (!taskPartitions.length) continue;
      const part = await executeBatches({ client, partitions: taskPartitions, signal: opts.signal, nodeId });
      Object.assign(executed.answers, part.answers);
      Object.assign(executed.itemReceipts, part.itemReceipts || {});
      executed.receipts.push(...(part.receipts || []));
    }

    for (const item of kept) {
      const ans = executed.answers[item.id] as any;
      const meta = (item.metadata || {}) as { taskId?: string; kind?: string; location?: string; subjectHash?: string; sourceHash?: string; evidenceSpan?: string; cacheKey?: string };
      const subjectHash = meta.subjectHash || sha256Hex(item.claim || item.id);
      const cacheKey = meta.cacheKey || obligationCacheKey({
        questionId: item.id, assertionHash: sha256Hex(item.claim || item.id),
        evidenceHash: sha256Hex(item.evidenceExcerpt || ""), model, policyHash: POLICY_HASH,
      });
      if (item.question && "type" in item.question && (item.question as any).type === "noul") {
        const decision = noulDecision(ans?.noul);
        if (meta.taskId === "intent-coverage-check") {
        judgedSubjects.push({ id: item.id, taskId: meta.taskId, subjectHash, decision: decision === "escalate" ? "pass" : decision, cacheKey, questionId: item.id });
        obligations.push({ questionId: item.id, obligationId: item.id, taskId: meta.taskId, cacheKey, status: "judged", decision: decision === "escalate" ? "pass" : decision, subjectHash });
          if (decision === "escalate") continue;
          findings.push({
            id: item.id, taskId: meta.taskId, subjectId: item.claimId || item.id, location: meta.location || "",
            kind: "intent_gap", severity: "error", raw: ans,
            policyDecision: decision === "uncertain" ? "uncertain" : "escalate",
            policyVersion: POLICY_VERSION,
            verification: "Page text must answer the visitor question with supporting facts.",
            author: nodeId.includes("content") ? "pages" : "copy",
            status: decision === "uncertain" ? "uncertain" : "open",
            subjectHash,
          });
          continue;
        }
        if (meta.kind === "redundant" || item.id.startsWith("dup_")) {
          judgedSubjects.push({ id: item.id, taskId: "claim-strengthening-check", subjectHash, decision, cacheKey, questionId: item.id });
          obligations.push({ questionId: item.id, obligationId: item.id, taskId: "claim-strengthening-check", cacheKey, status: "judged", decision, subjectHash });
          if (decision === "escalate") continue;
          findings.push({
            id: item.id, taskId: "claim-strengthening-check", subjectId: item.claimId || item.id, location: meta.location || "",
            kind: "redundant_section", severity: "warning", raw: ans,
            policyDecision: decision === "uncertain" ? "uncertain" : "escalate",
            policyVersion: POLICY_VERSION,
            verification: "Consolidate or add a distinct visitor-relevant fact.",
            author: "copy", status: "open", subjectHash,
          });
          continue;
        }
        judgedSubjects.push({ id: item.id, taskId: meta.taskId || "claim-strengthening-check", subjectHash, decision, cacheKey, questionId: item.id });
        obligations.push({ questionId: item.id, obligationId: item.id, taskId: meta.taskId || "claim-strengthening-check", cacheKey, status: "judged", decision, subjectHash });
        if (decision === "pass") continue;
        findings.push({
          id: item.id, taskId: meta.taskId || "claim-strengthening-check", subjectId: item.claimId || item.id,
          location: meta.location || "", kind: meta.kind || "noul",
          severity: (meta.kind === "contradiction" || meta.kind === "unsupported" || meta.kind === "exaggerated_strength") ? "error" : "warning",
          raw: ans, policyDecision: decision, policyVersion: POLICY_VERSION,
          verification: "Repair the assertion against the cited evidence; unknown evidence is not a pass.",
          author: nodeId === "content-review" ? "pages" : "copy",
          status: decision === "uncertain" ? "uncertain" : "open",
          evidenceSpan: meta.evidenceSpan, subjectHash, sourceHash: meta.sourceHash,
        });
      } else if (ans?.choice) {
        judgedSubjects.push({ id: item.id, taskId: meta.taskId || "cta-fidelity-check", subjectHash, decision: ans.choice, cacheKey, questionId: item.id });
        obligations.push({ questionId: item.id, obligationId: item.id, taskId: meta.taskId || "cta-fidelity-check", cacheKey, status: "judged", decision: ans.choice, subjectHash });
        if (meta.taskId === "cta-fidelity-check" && ans.choice === "mismatch") {
          findings.push({
            id: item.id, taskId: "cta-fidelity-check", subjectId: item.claimId || item.id, location: meta.location || "",
            kind: "cta_mismatch", severity: "error", raw: ans, policyDecision: "escalate", policyVersion: POLICY_VERSION,
            verification: "CTA label/promise must match the recorded destination/action contract.",
            author: nodeId === "content-review" ? "pages" : "copy", status: "open", subjectHash,
          });
        }
        if (meta.taskId === "cross-stage-consistency-check" && (ans.choice === "contradicted" || ans.choice === "omitted")) {
          findings.push({
            id: item.id, taskId: "cross-stage-consistency-check", subjectId: item.claimId || item.id, location: meta.location || "",
            kind: ans.choice, severity: "error", raw: ans, policyDecision: "escalate", policyVersion: POLICY_VERSION,
            verification: "Restore semantic preservation on the stage edge.",
            author: "copy", status: "open", subjectHash,
          });
        }
      }
    }

    for (const miss of missingGoalFindings(root, contract)) {
      findings.push({
        id: `missing_${miss.obligationId}`,
        taskId: "intent-coverage-check",
        subjectId: miss.obligationId,
        location: "",
        kind: "missing_artifact",
        severity: miss.priority === "must" ? "error" : "warning",
        policyDecision: "escalate",
        policyVersion: POLICY_VERSION,
        verification: miss.reason,
        author: "copy",
        status: "open",
      });
    }
    for (const over of rejectedOversizedItems) {
      findings.push({
        id: `oversized_${over.id}`,
        taskId: (over.metadata as any)?.taskId || "claim-strengthening-check",
        subjectId: over.id, location: "", kind: "oversized", severity: "warning",
        policyDecision: "uncertain", policyVersion: POLICY_VERSION,
        verification: `Candidate ${over.id} exceeded payload bounds and was not silently excluded.`,
        author: "copy", status: "open",
      });
    }

    for (const t of getTasksForCaller(nodeId).filter(x => enabled.has(x.taskId))) {
      const skipped = skippedByTask.get(t.taskId) || [];
      const overflowed = overflowIds.filter(id => (byTask.get(t.taskId) || []).some(i => i.id === id));
      const status = overflowed.length || skipped.some(id => overflowIds.includes(id))
        ? "partial" as const
        : (byTask.get(t.taskId)?.length || findings.some(f => f.taskId === t.taskId) ? "completed" : "no_candidates");
      const actualStatus = overflowed.length ? "partial" : (kept.filter(i => (i.metadata as any)?.taskId === t.taskId).length ? "completed" : (findings.some(f => f.taskId === t.taskId) ? "completed" : "no_candidates"));
      const taskReceipts = [...new Set(
        kept.filter(i => (i.metadata as any)?.taskId === t.taskId)
          .map(i => executed.itemReceipts[i.id])
          .filter((name): name is string => Boolean(name)),
      )];
      recordTaskExecution(root, {
        preparationId, nodeId, taskId: t.taskId, taskType: t.taskType,
        inputHash: opts.inputHash || "missing",
        status: actualStatus === "no_candidates" ? "no_candidates" : actualStatus,
        receiptIds: taskReceipts,
        timestamp: new Date().toISOString(),
      });
      taskRecords.push({
        taskId: t.taskId,
        status: actualStatus,
        questionIds: kept.filter(i => (i.metadata as any)?.taskId === t.taskId).map(i => i.id),
        skippedIds: [...new Set([...skipped, ...overflowed])],
        findings: findings.filter(f => f.taskId === t.taskId).map(f => f.id),
      });
    }

    const standardFindings: Finding[] = findings.filter(f => f.policyDecision !== "pass").map(f => ({
      id: f.id,
      page: f.location.split("#")[0] || "/",
      section: f.location.split("#")[1] || f.subjectId,
      evidence: f.evidenceSpan || f.subjectId,
      severity: f.severity === "error" ? "major" : "minor",
      problem: `${f.kind} at ${f.location || f.subjectId}`,
      repair: f.verification,
      target: f.author,
      verify: f.verification,
    }));

    const overall: QualityCheckResult["status"] = taskRecords.some(t => t.status === "partial") || overflowIds.length
      ? "partial"
      : taskRecords.every(t => t.status === "no_candidates") && !findings.length
        ? "no_candidates"
        : "completed";
    const result: QualityCheckResult = {
      findings, standardFindings, status: overall,
      overflowObligation: overflowIds.length ? `Unjudged: ${overflowIds.join(", ")}` : undefined,
      overflowIds,
      tasks: taskRecords,
      obligations,
    };
    persistQuality(root, preparationId, nodeId, result, judgedSubjects, obligations);
    return result;
  } catch (err: any) {
    for (const t of getTasksForCaller(nodeId).filter(x => enabled.has(x.taskId))) {
      recordTaskExecution(root, {
        preparationId, nodeId, taskId: t.taskId, taskType: t.taskType,
        inputHash: opts.inputHash || "missing", status: "unavailable",
        failureReason: err?.message || String(err), timestamp: new Date().toISOString(),
      });
      taskRecords.push({ taskId: t.taskId, status: "unavailable", questionIds: [], skippedIds: [], findings: [] });
    }
    for (const item of kept) {
      if (!obligations.some(o => o.questionId === item.id)) {
        obligations.push({
          questionId: item.id, obligationId: item.id,
          taskId: String((item.metadata as any)?.taskId || "claim-strengthening-check"),
          cacheKey: String((item.metadata as any)?.cacheKey || item.id),
          status: "unavailable",
        });
      }
    }
    const result: QualityCheckResult = { findings: [], standardFindings: [], status: "unavailable", tasks: taskRecords, overflowIds, obligations };
    persistQuality(root, preparationId, nodeId, result, judgedSubjects, obligations);
    return result;
  }
}

function persistQuality(
  root: string,
  preparationId: string,
  nodeId: string,
  result: QualityCheckResult,
  judgedSubjects: Array<{ id: string; taskId: string; subjectHash: string; decision: string; cacheKey?: string; questionId?: string }>,
  obligations: QualityObligation[] = []
): void {
  mkdirSync(join(root, "agent/runs"), { recursive: true });
  writeFileSync(qualityPath(root, preparationId), JSON.stringify({
    schemaVersion: 1, preparationId, nodeId, policyVersion: POLICY_VERSION, ...result, judgedSubjects, obligations: result.obligations || obligations,
  }, null, 2), "utf8");
  mkdirSync(join(root, "agent/reviews"), { recursive: true });
  writeFileSync(join(root, "agent/reviews/jev-quality.json"), JSON.stringify({ schemaVersion: 1, nodeId, findings: result.findings }, null, 2), "utf8");
}

export function formatQualityFindings(findings: QualityFinding[]): string {
  if (!findings.length) return "";
  const lines = ["## Jev quality findings (escalated only)", "Repair these subjects. Unrelated pages are out of scope.", ""];
  for (const f of findings.filter(x => x.policyDecision !== "pass")) {
    lines.push(`- [${f.severity}] ${f.taskId} ${f.kind} @ ${f.location || f.subjectId}: ${f.verification}`);
    if (f.evidenceSpan) lines.push(`  Source span: ${f.evidenceSpan}`);
  }
  return lines.join("\n");
}

export const MAJOR_DISPOSITION_KINDS = new Set([
  "unsupported",
  "added_rendered_claim",
  "dropped_qualification",
  "cta_mismatch",
  "broken_link",
  "intent_gap",
  "exaggerated_strength",
  "contradiction",
  "deceptive_cta",
]);

export function verifyQualityTaskReceipts(opts: {
  root: string;
  preparationId: string;
  nodeId: string;
  taskId: string;
  expectedModel?: string;
}): { ok: boolean; reason?: string } {
  const quality = loadQualityResult(opts.root, opts.preparationId);
  if (!quality) {
    return { ok: false, reason: `No quality result for ${opts.preparationId}` };
  }
  const task = quality.tasks.find(t => t.taskId === opts.taskId);
  if (!task) {
    return { ok: false, reason: `Quality result omitted task ${opts.taskId}` };
  }
  const registered = getTasksForCaller(opts.nodeId).find(t => t.taskId === opts.taskId);
  if (!registered) {
    return { ok: false, reason: `Task ${opts.taskId} is not registered for ${opts.nodeId}` };
  }
  const exec = loadTaskExecution(opts.root, opts.preparationId, opts.taskId);
  if (!exec) {
    return { ok: false, reason: `No execution record for ${opts.taskId}` };
  }
  const verify = verifyTaskExecution(
    opts.root,
    opts.preparationId,
    opts.nodeId,
    registered,
    exec.inputHash,
    {
      expectedModel: opts.expectedModel,
      expectedQuestionSemantics: QUALITY_TASK_SEMANTICS[opts.taskId],
    },
  );
  if (!verify.ok) return verify;
  const manifest = loadTaskManifest(opts.root, opts.preparationId, opts.taskId);
  const obligations = (quality.obligations || []).filter(o => o.taskId === opts.taskId);
  const decisionsDir = join(opts.root, "agent/decisions/jev");
  const receipts = (exec.receiptIds || []).map(file => {
    const path = join(decisionsDir, file);
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as { answers?: Record<string, unknown>; stateHash?: string; model?: string };
    } catch {
      return undefined;
    }
  }).filter(Boolean) as Array<{ answers?: Record<string, unknown>; stateHash?: string; model?: string }>;
  for (const obligation of obligations) {
    if (obligation.status === "overflow" || obligation.status === "unavailable" || obligation.status === "skipped") continue;
    if (obligation.status === "cached") {
      if (obligation.decision !== "pass" || !obligation.cacheKey || !obligation.priorPreparationId) {
        return { ok: false, reason: `Cached obligation ${obligation.questionId} is missing the original pass, cache key, or preparation.` };
      }
      const prior = loadQualityResult(opts.root, obligation.priorPreparationId);
      const original = (prior?.obligations || []).find(o => o.questionId === obligation.questionId && o.status === "judged");
      if (!original || original.decision !== "pass" || original.cacheKey !== obligation.cacheKey) {
        return { ok: false, reason: `Cached obligation ${obligation.questionId} does not match an original judged pass and current cache key.` };
      }
      if (original.subjectHash && obligation.subjectHash && original.subjectHash !== obligation.subjectHash) {
        return { ok: false, reason: `Cached obligation ${obligation.questionId} subject hash drifted from the original decision.` };
      }
      const priorExec = loadTaskExecution(opts.root, obligation.priorPreparationId, opts.taskId);
      const priorReceipts = (priorExec?.receiptIds || []).map(file => {
        const path = join(decisionsDir, file);
        if (!existsSync(path)) return undefined;
        try { return JSON.parse(readFileSync(path, "utf8")) as { answers?: Record<string, unknown> }; } catch { return undefined; }
      });
      if (!priorReceipts.some(r => r?.answers && Object.prototype.hasOwnProperty.call(r.answers, obligation.questionId))) {
        return { ok: false, reason: `Cached obligation ${obligation.questionId} original receipt is missing that answer.` };
      }
      continue;
    }
    if (obligation.status !== "judged") {
      return { ok: false, reason: `Obligation ${obligation.questionId} is unjudged (${obligation.status}).` };
    }
    const hit = receipts.find(r => r.answers && Object.prototype.hasOwnProperty.call(r.answers, obligation.questionId));
    if (!hit) {
      return { ok: false, reason: `Executed obligation ${obligation.questionId} has no receipt containing that exact answer.` };
    }
    if (manifest?.batchStateHashes?.length && hit.stateHash && !manifest.batchStateHashes.includes(hit.stateHash)) {
      return { ok: false, reason: `Obligation ${obligation.questionId} receipt stateHash is not in the current task manifest.` };
    }
    if (opts.expectedModel && hit.model && hit.model !== opts.expectedModel) {
      return { ok: false, reason: `Obligation ${obligation.questionId} used model ${hit.model}, expected ${opts.expectedModel}.` };
    }
  }
  if (task.status === "completed" && task.questionIds.length) {
    const answered = new Set(receipts.flatMap(r => Object.keys(r.answers || {})));
    const missing = task.questionIds.filter(id => !answered.has(id));
    if (missing.length) {
      return { ok: false, reason: `Completed ${opts.taskId} is missing answers for ${missing.join(", ")}.` };
    }
  }
  return { ok: true };
}

export function independentCitedSource(evidence: string): boolean {
  const text = evidence.trim();
  if (!text || /^accepted[_\s-]?risk$/i.test(text) || text.length < 8) return false;
  return /onboarding\/|agent\/|https?:\/\/|e\d+|ledger |source /i.test(text);
}

export function criticDispositionMatches(entry: CriticDisposition | undefined, findingId: string, subjectHash?: string): boolean {
  if (!entry) return false;
  if (entry.findingId !== findingId) return false;
  if (subjectHash) {
    if (!entry.subjectHash || entry.subjectHash !== subjectHash) return false;
  }
  if (!["fixed", "disagree_with_evidence", "accepted_risk"].includes(entry.disposition)) return false;
  if (!entry.rationale?.trim() || !entry.evidence?.trim()) return false;
  return true;
}

export function dispositionAllowedForFinding(entry: CriticDisposition, finding: QualityFinding): string | undefined {
  if (!criticDispositionMatches(entry, finding.id, finding.subjectHash)) {
    return `Disposition for ${finding.id} is missing current subject identity or schema fields.`;
  }
  if (entry.disposition === "disagree_with_evidence" && !independentCitedSource(entry.evidence)) {
    return `disagree_with_evidence for ${finding.id} requires a specific independent cited source.`;
  }
  if (entry.disposition === "accepted_risk" && (finding.severity === "error" || MAJOR_DISPOSITION_KINDS.has(finding.kind))) {
    return `accepted_risk cannot dismiss major factual/CTA/goal finding ${finding.id} (${finding.kind}).`;
  }
  if (entry.disposition === "fixed") {
    if (finding.status === "open" && finding.policyDecision !== "pass") {
      return `fixed requires the current quality check to no longer treat ${finding.id} as open.`;
    }
    if (!/(?:pages|dist|onboarding|components)\//.test(entry.evidence)) {
      return `fixed for ${finding.id} requires a changed artifact path plus a fresh successful check.`;
    }
  }
  return undefined;
}

export function criticDisposedFinding(review: Review | undefined, finding: QualityFinding): boolean {
  if (!review) return false;
  return (review.dispositions || []).some(d => {
    if (!criticDispositionMatches(d, finding.id, finding.subjectHash)) return false;
    return !dispositionAllowedForFinding(d, finding);
  });
}

export function overflowIdsDisposed(review: Review | undefined, overflowIds: string[]): boolean {
  if (!overflowIds.length) return true;
  if (!review) return false;
  return overflowIds.every(id => (review.dispositions || []).some(d => criticDispositionMatches(d, id) || criticDispositionMatches(d, `overflow:${id}`)));
}

export function reconcileQualityWithReview(opts: {
  root: string;
  preparationId: string;
  nodeId: string;
  assist: boolean;
}): string[] {
  if (!opts.assist) return [];
  const quality = loadQualityResult(opts.root, opts.preparationId);
  if (!quality) {
    return [`Jev quality tasks produced no result for ${opts.nodeId}; the full critic obligation is restored.`];
  }
  const reviewPath = join(opts.root, "agent/reviews", `${opts.nodeId}.json`);
  let review: Review | undefined;
  if (existsSync(reviewPath)) {
    try { review = json<Review>(reviewPath); } catch { /* ignore */ }
  }
  const failures: string[] = [];
  const major = quality.findings.filter(f => f.severity === "error" && f.policyDecision !== "pass" && f.status !== "resolved");
  if (review?.verdict === "pass") {
    for (const f of major) {
      const entry = (review.dispositions || []).find(d => d.findingId === f.id);
      const allowed = entry ? dispositionAllowedForFinding(entry, f) : `Unresolved Jev finding ${f.id}`;
      if (allowed) {
        failures.push(allowed.startsWith("Unresolved")
          ? `Unresolved Jev finding ${f.id} (${f.kind} at ${f.location || f.subjectId}) is incompatible with a passing critic review.`
          : allowed);
      }
    }
    if (quality.overflowIds?.length) {
      if (!overflowIdsDisposed(review, quality.overflowIds)) {
        failures.push(`Question budget overflow left unjudged obligation IDs without explicit critic dispositions: ${quality.overflowIds.join(", ")}`);
      }
    } else if (quality.overflowObligation && !overflowIdsDisposed(review, (quality.overflowObligation.match(/[A-Za-z0-9_.:-]+/g) || []).filter(x => x !== "Unjudged"))) {
      failures.push(`Question budget overflow left unjudged subjects; a passing review cannot skip them: ${quality.overflowObligation}`);
    }
  }
  for (const task of quality.tasks) {
    if (task.status === "unavailable") {
      if (review?.verdict === "pass") {
        failures.push(`Jev task ${task.taskId} was unavailable; a passing review cannot skip the restored critic obligation.`);
      } else if (!review) {
        failures.push(`Jev task ${task.taskId} was unavailable and no critic review was recorded.`);
      }
    }
  }
  return failures;
}
