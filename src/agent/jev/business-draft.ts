import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { extractHarvestFacts, type StructuredFact } from "./extraction.ts";
import type { JevClient } from "./client.ts";
import { getTasksForCaller, recordTaskExecution, saveTaskManifest } from "./service-registry.ts";
import { partitionBatchItems, executeBatches, type BatchableQuestion } from "./batching.ts";
import { applyQuestionFanoutBounds, recordPrepBounds } from "./bounds.ts";
import {
  FIELD_SELECTION_NO_MATCH,
  FIELD_SELECTION_SEMANTICS_HASH,
  makeFieldCandidateNoulQuestion,
  makeFieldSelectionQuestion,
} from "./questions.ts";
import { sha256Hex } from "./state.ts";
import type { JevConfig } from "./types.ts";

/** Single-value fields use Choice + no_match even when several distinct spans exist. */
export const SINGLE_VALUE_FIELDS: SourceFieldKind[] = ["phone", "email", "hours", "credential"];
/** Multi-value fields use per-candidate Noul; several legitimate values are not a conflict. */
export const MULTI_VALUE_FIELDS: SourceFieldKind[] = ["offer", "location"];

export const FIELD_CANDIDATE_NOUL_ACCEPT = 0.85;
export const FIELD_CANDIDATE_NOUL_REJECT = 0.15;

export function isSingleValueField(field: SourceFieldKind): boolean {
  return (SINGLE_VALUE_FIELDS as string[]).includes(field);
}

export type SourceFieldKind = "phone" | "email" | "hours" | "offer" | "location" | "credential";

export interface FieldCandidate {
  id: string;
  field: SourceFieldKind;
  value: string;
  source: string;
  excerpt: string;
  span?: [number, number];
}

export interface SelectedField {
  field: SourceFieldKind;
  value: string;
  source: string;
  excerpt: string;
  candidateId: string;
  confidence: number;
  noul?: number;
  probabilities?: Record<string, number>;
}

export interface UnresolvedField {
  field: SourceFieldKind;
  reason: "no_match" | "conflict" | "uncertain" | "unavailable" | "no_candidates" | "incomplete";
  candidateIds: string[];
  notes: string;
}

export interface FieldCoverage {
  field: SourceFieldKind;
  cardinality: "single" | "multi";
  candidateCount: number;
  evaluatedCount: number;
  complete: boolean;
}

export interface RawFieldJudgment {
  questionId: string;
  field: SourceFieldKind;
  candidateId?: string;
  type: "choice" | "noul";
  choice?: string;
  noul?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
}

export interface MachineBusinessDraft {
  schemaVersion: 1;
  selected: SelectedField[];
  unresolved: UnresolvedField[];
  conflicts: Array<{ field: SourceFieldKind; values: string[]; candidateIds: string[] }>;
  candidateCoverage: FieldCoverage[];
  rawJudgments: RawFieldJudgment[];
  investigationObligations: string[];
}

export const TRANSCRIPTION_BLOCK_START = "<!-- jev-transcription:start -->";
export const TRANSCRIPTION_BLOCK_END = "<!-- jev-transcription:end -->";
export const DRAFT_BLOCK_START = "<!-- jev-business-draft:start -->";
export const DRAFT_BLOCK_END = "<!-- jev-business-draft:end -->";

export function fieldKindFromFact(fact: StructuredFact): SourceFieldKind | undefined {
  if (fact.category === "contact_detail") {
    if (/email/i.test(fact.claim) || fact.claim.includes("@")) return "email";
    if (/phone/i.test(fact.claim) || /\d{3}/.test(fact.claim)) return "phone";
  }
  if (fact.category === "service_area") return "location";
  if (fact.category === "service") return "offer";
  if (fact.category === "credential") return "credential";
  if (/hours|monday|open/i.test(fact.claim) || fact.category === "guarantee" && /hours/i.test(fact.claim)) return "hours";
  return undefined;
}

export function verbatimValue(fact: StructuredFact, kind: SourceFieldKind): string {
  if (kind === "phone") return fact.claim.replace(/^Phone:\s*/i, "").trim();
  if (kind === "email") return fact.claim.replace(/^Email:\s*/i, "").trim();
  return (fact.rawExcerpt || fact.claim.replace(/^[^:]+:\s*/, "")).trim();
}

export function buildFieldCandidates(facts: StructuredFact[]): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  let n = 0;
  for (const fact of facts) {
    const kind = fieldKindFromFact(fact);
    if (!kind) continue;
    n += 1;
    out.push({
      id: `cand_${kind}_${n}`,
      field: kind,
      value: verbatimValue(fact, kind),
      source: fact.source,
      excerpt: fact.rawExcerpt,
      span: fact.span,
    });
  }
  return out;
}

export function groupByField(candidates: FieldCandidate[]): Map<SourceFieldKind, FieldCandidate[]> {
  const map = new Map<SourceFieldKind, FieldCandidate[]>();
  for (const c of candidates) {
    const list = map.get(c.field) || [];
    list.push(c);
    map.set(c.field, list);
  }
  return map;
}

export function uniqueCandidates(cands: FieldCandidate[]): FieldCandidate[] {
  const seen = new Set<string>();
  const out: FieldCandidate[] = [];
  for (const c of cands) {
    const key = c.value.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export function emptyDraft(): MachineBusinessDraft {
  return {
    schemaVersion: 1,
    selected: [],
    unresolved: [],
    conflicts: [],
    candidateCoverage: [],
    rawJudgments: [],
    investigationObligations: [],
  };
}

export function fieldTranscriptionRemovable(draft: MachineBusinessDraft, field: SourceFieldKind): boolean {
  const cov = draft.candidateCoverage.find(c => c.field === field);
  if (!cov?.complete) return false;
  if (draft.unresolved.some(u => u.field === field)) return false;
  return draft.selected.some(s => s.field === field);
}

export function formatMachineDraft(draft: MachineBusinessDraft): string {
  const selected = draft.selected.length
    ? draft.selected.map(s => `- ${s.field}: "${s.value}" ← ${s.source} (${s.candidateId}, conf ${s.confidence.toFixed(2)})`).join("\n")
    : "- None";
  const unresolved = draft.unresolved.length
    ? draft.unresolved.map(u => `- ${u.field}: ${u.reason} — ${u.notes}`).join("\n")
    : "- None";
  return [
    DRAFT_BLOCK_START,
    "## Source-bound machine business draft",
    "Selected values were copied verbatim from harvest spans. Do not invent contacts or credentials.",
    "",
    "### Selected fields",
    selected,
    "",
    "### Unresolved / conflicting fields (agent owns these)",
    unresolved,
    "",
    "### Investigation obligations",
    ...(draft.investigationObligations.length ? draft.investigationObligations.map(o => `- ${o}`) : ["- None"]),
    DRAFT_BLOCK_END,
    "",
  ].join("\n");
}

export function formatTranscriptionObligations(fields: SourceFieldKind[]): string {
  const lines = fields.length
    ? fields.map(f => `- Transcribe ${f} from harvest source spans`)
    : ["- None (no source-bound fields in candidate set)"];
  return [
    TRANSCRIPTION_BLOCK_START,
    "## Source-bound field transcription",
    "Transcribe these fields from harvest sources into onboarding/business.json. Copy values verbatim; do not invent contacts.",
    ...lines,
    TRANSCRIPTION_BLOCK_END,
    "",
  ].join("\n");
}

export function applyBusinessAuthorPacketReduction(opts: {
  packet: string;
  eligible: boolean;
  draft: MachineBusinessDraft;
}): { packet: string; reduced: boolean; removedFields: SourceFieldKind[] } {
  const { packet, eligible, draft } = opts;
  const allFields = [...new Set([
    ...draft.candidateCoverage.map(c => c.field),
    ...draft.selected.map(s => s.field),
    ...draft.unresolved.map(u => u.field),
  ])];
  const removedFields = eligible ? allFields.filter(f => fieldTranscriptionRemovable(draft, f)) : [];
  const keepFields = allFields.filter(f => !removedFields.includes(f));
  const draftBlock = formatMachineDraft(draft);
  const transcription = formatTranscriptionObligations(keepFields);
  let next = packet;
  if (next.includes(TRANSCRIPTION_BLOCK_START)) {
    next = next.replace(
      new RegExp(`${TRANSCRIPTION_BLOCK_START}[\\s\\S]*?${TRANSCRIPTION_BLOCK_END}\\n?`),
      transcription
    );
  } else {
    next = `${next}\n${transcription}`;
  }
  if (next.includes(DRAFT_BLOCK_START)) {
    next = next.replace(new RegExp(`${DRAFT_BLOCK_START}[\\s\\S]*?${DRAFT_BLOCK_END}\\n?`), draftBlock);
  } else {
    next = `${next}\n${draftBlock}`;
  }
  return { packet: next, reduced: eligible && removedFields.length > 0, removedFields };
}

function atomicWrite(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${randomUUID()}`;
  writeFileSync(tmp, body, "utf8");
  try {
    renameSync(tmp, path);
  } catch {
    writeFileSync(path, body, "utf8");
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

export function saveMachineDraft(root: string, preparationId: string, draft: MachineBusinessDraft): string {
  const dir = join(root, "agent/runs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${preparationId}.business-draft.json`);
  atomicWrite(path, JSON.stringify(draft, null, 2));
  return path;
}

export function loadMachineDraft(root: string, preparationId: string): MachineBusinessDraft | undefined {
  const path = join(root, "agent/runs", `${preparationId}.business-draft.json`);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as MachineBusinessDraft;
  } catch {
    return undefined;
  }
}

export async function runBusinessSourceSelection(opts: {
  root: string;
  client: JevClient;
  nodeId: string;
  preparationId: string;
  inputHash?: string;
  jevConfig?: JevConfig;
  signal?: AbortSignal;
}): Promise<{
  draft: MachineBusinessDraft;
  coveredFieldIds: string[];
  retainedFieldIds: string[];
  status: "completed" | "cached" | "no_candidates" | "unavailable";
}> {
  const { root, client, nodeId, preparationId } = opts;
  const task = getTasksForCaller(nodeId).find(t => t.taskId === "business-source-selection");
  const facts = extractHarvestFacts(root);
  const candidates = buildFieldCandidates(facts);
  const grouped = groupByField(candidates);
  const draft = emptyDraft();
  const coveredFieldIds: string[] = [];
  const retainedFieldIds: string[] = [];

  if (candidates.length === 0) {
    draft.investigationObligations.push("No source-bound field candidates were generated; author must scan harvest sources.");
    if (task) {
      recordTaskExecution(root, {
        preparationId,
        nodeId,
        taskId: task.taskId,
        taskType: task.taskType,
        inputHash: opts.inputHash || "missing",
        status: "no_candidates",
        timestamp: new Date().toISOString(),
      });
    }
    saveMachineDraft(root, preparationId, draft);
    return { draft, coveredFieldIds, retainedFieldIds, status: "no_candidates" };
  }

  const fieldUniques = new Map<SourceFieldKind, FieldCandidate[]>();
  const batchItems: BatchableQuestion[] = [];
  for (const [field, cands] of grouped) {
    const uniques = uniqueCandidates(cands);
    fieldUniques.set(field, uniques);
    const cardinality = isSingleValueField(field) ? "single" : "multi";
    draft.candidateCoverage.push({
      field,
      cardinality,
      candidateCount: uniques.length,
      evaluatedCount: 0,
      complete: false,
    });
    if (cardinality === "single") {
      batchItems.push({
        id: `field_${field}`,
        taskType: "custom",
        questionKey: `field_${field}`,
        question: makeFieldSelectionQuestion(field, uniques),
        claimId: field,
        claim: `${field}: ${uniques.map(c => c.value).join(" | ")}`,
        evidenceId: uniques.map(c => c.id).join(","),
        evidenceExcerpt: uniques.map(c => c.excerpt).join("\n"),
        source: uniques[0]?.source,
      });
    } else {
      for (const cand of uniques) {
        batchItems.push({
          id: `field_${field}_${cand.id}`,
          taskType: "custom",
          questionKey: `field_${field}_${cand.id}`,
          question: makeFieldCandidateNoulQuestion(field, cand),
          claimId: field,
          claim: cand.value,
          evidenceId: cand.id,
          evidenceExcerpt: cand.excerpt,
          source: cand.source,
        });
      }
    }
  }

  const { kept: boundedItems, overflow } = applyQuestionFanoutBounds(batchItems);
  if (overflow) {
    draft.investigationObligations.push(overflow.agentObligation);
    for (const id of overflow.droppedIds) {
      const field = (id.replace(/^field_/, "").split("_")[0] || "offer") as SourceFieldKind;
      if (!draft.unresolved.some(u => u.field === field)) {
        draft.unresolved.push({ field, reason: "incomplete", candidateIds: [], notes: overflow.reason });
      }
      if (!retainedFieldIds.includes(field)) retainedFieldIds.push(field);
    }
  }
  const { partitions, rejectedOversizedItems } = partitionBatchItems(boundedItems);
  recordPrepBounds(opts.root, preparationId, {
    questions: boundedItems.length,
    candidates: candidates.length,
    overflow,
  });
  const oversizedIds = new Set(rejectedOversizedItems.map(i => i.id));
  const plannedIds = new Set(partitions.flatMap(p => p.questionIds));

  if (task && plannedIds.size > 0) {
    const questionIds = [...plannedIds];
    const claimIds = [...fieldUniques.keys()];
    const evidenceIds: string[] = [];
    const claimHashes: Record<string, string> = {};
    const evidenceHashes: Record<string, string> = {};
    for (const [field, uniques] of fieldUniques) {
      claimHashes[field] = sha256Hex(uniques.map(c => c.value).join("|"));
      for (const c of uniques) {
        evidenceIds.push(c.id);
        evidenceHashes[c.id] = sha256Hex(c.value);
      }
    }
    saveTaskManifest(root, {
      schemaVersion: 1,
      preparationId,
      nodeId,
      taskId: task.taskId,
      taskType: task.taskType,
      expectedModel: client.model,
      questionSemanticsHash: FIELD_SELECTION_SEMANTICS_HASH,
      claimIds,
      evidenceIds,
      claimHashes,
      evidenceHashes,
      batchStateHashes: partitions.map(p => sha256Hex(JSON.stringify(p.state))),
      questionIds,
      subjectHash: opts.inputHash,
      createdAt: new Date().toISOString(),
    });
  }

  const markCoverage = (field: SourceFieldKind, evaluatedDelta: number, complete: boolean) => {
    const cov = draft.candidateCoverage.find(c => c.field === field);
    if (!cov) return;
    cov.evaluatedCount = Math.min(cov.candidateCount, cov.evaluatedCount + evaluatedDelta);
    if (complete) cov.complete = cov.evaluatedCount === cov.candidateCount;
  };

  const retainField = (field: SourceFieldKind, reason: UnresolvedField["reason"], candidateIds: string[], notes: string) => {
    if (!draft.unresolved.some(u => u.field === field)) {
      draft.unresolved.push({ field, reason, candidateIds, notes });
    }
    if (!retainedFieldIds.includes(field)) retainedFieldIds.push(field);
  };

  try {
    const executed = partitions.length > 0
      ? await executeBatches({ client, partitions, signal: opts.signal, nodeId })
      : { answers: {} as Record<string, unknown>, receipts: [] as string[], metrics: { actualTransportCalls: 0 } };

    for (const [field, uniques] of fieldUniques) {
      if (isSingleValueField(field)) {
        const qid = `field_${field}`;
        if (oversizedIds.has(qid) || !plannedIds.has(qid)) {
          retainField(field, "incomplete", uniques.map(c => c.id), "Candidate set exceeded the bounded request; transcription retained.");
          continue;
        }
        const ans = executed.answers[qid] as { choice?: string; confidence?: number; probabilities?: Record<string, number> } | undefined;
        if (!ans) {
          retainField(field, "uncertain", uniques.map(c => c.id), "Missing Choice answer.");
          continue;
        }
        draft.rawJudgments.push({
          questionId: qid,
          field,
          type: "choice",
          choice: ans.choice,
          confidence: ans.confidence,
          probabilities: ans.probabilities,
        });
        markCoverage(field, uniques.length, true);
        const picked = uniques.find(c => c.id === ans.choice);
        if (ans.choice === FIELD_SELECTION_NO_MATCH || !picked) {
          retainField(
            field,
            ans.choice === FIELD_SELECTION_NO_MATCH ? "no_match" : "uncertain",
            uniques.map(c => c.id),
            `Jev selected ${ans.choice || "no answer"}.`
          );
          draft.investigationObligations.push(`Author must locate ${field} in harvest sources; machine returned no-match/uncertain.`);
        } else {
          draft.selected.push({
            field,
            value: picked.value,
            source: picked.source,
            excerpt: picked.excerpt,
            candidateId: picked.id,
            confidence: ans.confidence ?? 0,
            probabilities: ans.probabilities,
          });
          coveredFieldIds.push(field);
        }
        continue;
      }

      let accepted = 0;
      let uncertain = 0;
      let evaluated = 0;
      for (const cand of uniques) {
        const qid = `field_${field}_${cand.id}`;
        if (oversizedIds.has(qid) || !plannedIds.has(qid)) {
          uncertain += 1;
          continue;
        }
        const ans = executed.answers[qid] as { noul?: number } | undefined;
        if (typeof ans?.noul !== "number") {
          uncertain += 1;
          continue;
        }
        evaluated += 1;
        draft.rawJudgments.push({
          questionId: qid,
          field,
          candidateId: cand.id,
          type: "noul",
          noul: ans.noul,
        });
        if (ans.noul >= FIELD_CANDIDATE_NOUL_ACCEPT) {
          accepted += 1;
          draft.selected.push({
            field,
            value: cand.value,
            source: cand.source,
            excerpt: cand.excerpt,
            candidateId: cand.id,
            confidence: ans.noul,
            noul: ans.noul,
          });
        } else if (ans.noul > FIELD_CANDIDATE_NOUL_REJECT) {
          uncertain += 1;
        }
      }
      markCoverage(field, evaluated, evaluated === uniques.length && uncertain === 0);
      if (evaluated < uniques.length) {
        retainField(field, "incomplete", uniques.map(c => c.id), `Only ${evaluated}/${uniques.length} ${field} candidates were judged.`);
        draft.investigationObligations.push(`Complete ${field} candidate coverage before dropping transcription.`);
      } else if (uncertain > 0) {
        retainField(field, "uncertain", uniques.map(c => c.id), `${uncertain} ${field} candidate(s) were between Noul thresholds; raw noul retained.`);
        draft.investigationObligations.push(`Author must resolve uncertain ${field} candidates; machine noul is retained for threshold reuse.`);
      } else if (accepted === 0) {
        retainField(field, "no_match", uniques.map(c => c.id), `No ${field} candidate passed Noul accept (${FIELD_CANDIDATE_NOUL_ACCEPT}).`);
        draft.investigationObligations.push(`Author must locate ${field} in harvest sources; machine rejected the candidate set.`);
      } else {
        coveredFieldIds.push(field);
      }
    }

    for (const field of retainedFieldIds) {
      if (!coveredFieldIds.includes(field) && !draft.investigationObligations.some(o => o.includes(field))) {
        draft.investigationObligations.push(`Retain harvest transcription for ${field}.`);
      }
    }

    if (task) {
      recordTaskExecution(root, {
        preparationId,
        nodeId,
        taskId: task.taskId,
        taskType: task.taskType,
        inputHash: opts.inputHash || "missing",
        status: "completed",
        receiptIds: executed.receipts.map(p => p.split(/[/\\]/).pop() || p),
        timestamp: new Date().toISOString(),
      });
    }
    saveMachineDraft(root, preparationId, draft);
    return { draft, coveredFieldIds, retainedFieldIds, status: "completed" };
  } catch (err: any) {
    for (const [field, uniques] of fieldUniques) {
      if (!draft.unresolved.some(u => u.field === field) && !draft.selected.some(s => s.field === field)) {
        retainField(field, "unavailable", uniques.map(c => c.id), err?.message || String(err));
      }
    }
    draft.investigationObligations.push("Jev field selection failed; restore full harvest transcription.");
    if (task) {
      recordTaskExecution(root, {
        preparationId,
        nodeId,
        taskId: task.taskId,
        taskType: task.taskType,
        inputHash: opts.inputHash || "missing",
        status: "unavailable",
        failureReason: err?.message || String(err),
        timestamp: new Date().toISOString(),
      });
    }
    saveMachineDraft(root, preparationId, draft);
    return { draft, coveredFieldIds, retainedFieldIds, status: "unavailable" };
  }
}
