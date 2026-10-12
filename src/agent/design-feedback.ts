import { existsSync } from "node:fs";
import { join } from "node:path";
import { json, save, sha256, within } from "./artifacts.ts";
import type { ComparisonManifest, SectionIndex } from "./design-comparison.ts";

export const FEEDBACK_OPERATIONS = ["replace", "insert", "remove", "preserve", "avoid"] as const;
export const FEEDBACK_FACETS = ["composition", "copy", "media", "style", "behavior"] as const;
export const FEEDBACK_PRIORITIES = ["must", "preference"] as const;
export type FeedbackOperation = (typeof FEEDBACK_OPERATIONS)[number];
export type FeedbackFacet = (typeof FEEDBACK_FACETS)[number];
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number];

export type FeedbackSource = {
  candidateId: string;
  buildHash: string;
  route: string;
  sectionId: string;
};
export type FeedbackTarget = {
  route: string;
  sectionId?: string;
  before?: string;
  after?: string;
};
export type FeedbackChoice = {
  id: string;
  operation: FeedbackOperation;
  source?: FeedbackSource;
  target?: FeedbackTarget;
  facets: FeedbackFacet[];
  preserve?: string[];
  adaptation?: string;
  priority: FeedbackPriority;
  note?: string;
  styleException?: string;
};
export type DesignFeedback = {
  schemaVersion: 1;
  feedbackId: string;
  runId: string;
  comparisonRevision: string;
  comparisonHash: string;
  supersedes?: string;
  idempotencyKey?: string;
  actor: { type: string; id: string };
  baseCandidateId: string;
  themeCandidateId: string;
  noneOfThese?: boolean;
  choices: FeedbackChoice[];
  globalNotes?: string;
  pageNotes?: Record<string, string>;
  preserve?: string[];
  avoid?: string[];
  submission: "synthesize" | "draft" | "revise-directions";
  rawText?: string;
};

export type FeedbackInterpretation = {
  schemaVersion: 1;
  revision: string;
  feedbackId: string;
  comparisonHash: string;
  kind: "operator" | "ai-interpretation";
  unresolved: { question: string; conflict?: string }[];
  assumptions: string[];
  choices: FeedbackChoice[];
  baseCandidateId: string;
  themeCandidateId: string;
  sourceSpans?: { choiceId: string; excerpt: string }[];
};

export type FeedbackValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  interpretation: FeedbackInterpretation;
};

const present = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

export function parseDesignFeedback(data: unknown): DesignFeedback {
  if (!data || typeof data !== "object") throw new Error("Feedback must be a JSON object");
  const raw = data as Record<string, unknown>;
  if (raw.schemaVersion !== 1) throw new Error("Unsupported feedback schemaVersion");
  if (!present(raw.feedbackId) || !present(raw.runId) || !present(raw.comparisonRevision) || !present(raw.comparisonHash)) {
    throw new Error("Feedback requires feedbackId, runId, comparisonRevision and comparisonHash");
  }
  if (typeof raw.actor !== "object" || !raw.actor) throw new Error("Feedback requires actor");
  const actor = raw.actor as Record<string, unknown>;
  if (!present(actor.type) || !present(actor.id)) throw new Error("Feedback actor needs type and id");
  if (typeof raw.choices !== "object" || !Array.isArray(raw.choices)) throw new Error("Feedback.choices must be an array");
  const submission = raw.submission === "draft" || raw.submission === "revise-directions" ? raw.submission : "synthesize";
  const choices = (raw.choices as unknown[]).map((item, index) => parseChoice(item, index));
  return {
    schemaVersion: 1,
    feedbackId: String(raw.feedbackId),
    runId: String(raw.runId),
    comparisonRevision: String(raw.comparisonRevision),
    comparisonHash: String(raw.comparisonHash),
    supersedes: present(raw.supersedes) ? raw.supersedes : undefined,
    idempotencyKey: present(raw.idempotencyKey) ? raw.idempotencyKey : undefined,
    actor: { type: String(actor.type), id: String(actor.id) },
    baseCandidateId: present(raw.baseCandidateId) ? raw.baseCandidateId : "",
    themeCandidateId: present(raw.themeCandidateId) ? raw.themeCandidateId : "",
    noneOfThese: raw.noneOfThese === true,
    choices,
    globalNotes: present(raw.globalNotes) ? raw.globalNotes : undefined,
    pageNotes: raw.pageNotes && typeof raw.pageNotes === "object" ? raw.pageNotes as Record<string, string> : undefined,
    preserve: Array.isArray(raw.preserve) ? raw.preserve.map(String) : undefined,
    avoid: Array.isArray(raw.avoid) ? raw.avoid.map(String) : undefined,
    submission,
    rawText: present(raw.rawText) ? raw.rawText : undefined,
  };
}

function parseChoice(item: unknown, index: number): FeedbackChoice {
  if (!item || typeof item !== "object") throw new Error(`Invalid choice at ${index}`);
  const raw = item as Record<string, unknown>;
  if (!present(raw.id) || !FEEDBACK_OPERATIONS.includes(raw.operation as FeedbackOperation)) throw new Error(`Choice ${index} needs id and a known operation`);
  const facets = Array.isArray(raw.facets) ? raw.facets.map(String) as FeedbackFacet[] : [];
  if (!facets.length || facets.some(f => !FEEDBACK_FACETS.includes(f))) throw new Error(`Choice ${raw.id} needs composition|copy|media|style|behavior facets`);
  const priority = FEEDBACK_PRIORITIES.includes(raw.priority as FeedbackPriority) ? raw.priority as FeedbackPriority : "must";
  const source = raw.source && typeof raw.source === "object" ? raw.source as Record<string, unknown> : undefined;
  const target = raw.target && typeof raw.target === "object" ? raw.target as Record<string, unknown> : undefined;
  const sourceRoute = source ? String(source.route || "") : "";
  const sourceSection = source ? String(source.sectionId || "") : "";
  const targetRoute = target ? String(target.route || "") : "";
  const targetSection = target && present(target.sectionId) ? target.sectionId : "";
  if ([sourceRoute, sourceSection, targetRoute, targetSection].some(value => value.includes("..") || value.includes("\\") || (value.includes("/") && !value.startsWith("/")))) {
    throw new Error("Feedback cannot contain filesystem paths or parent segments");
  }
  if ([sourceSection, targetSection].some(value => value.includes("/"))) throw new Error("Feedback cannot contain filesystem paths or parent segments");
  return {
    id: String(raw.id),
    operation: raw.operation as FeedbackOperation,
    source: source ? {
      candidateId: String(source.candidateId || ""),
      buildHash: String(source.buildHash || ""),
      route: String(source.route || ""),
      sectionId: String(source.sectionId || ""),
    } : undefined,
    target: target ? {
      route: String(target.route || ""),
      sectionId: present(target.sectionId) ? target.sectionId : undefined,
      before: present(target.before) ? target.before : undefined,
      after: present(target.after) ? target.after : undefined,
    } : undefined,
    facets,
    preserve: Array.isArray(raw.preserve) ? raw.preserve.map(String) : undefined,
    adaptation: present(raw.adaptation) ? raw.adaptation : undefined,
    priority,
    note: present(raw.note) ? raw.note : undefined,
    styleException: present(raw.styleException) ? raw.styleException : undefined,
  };
}

export function feedbackPayloadHash(feedback: DesignFeedback): string {
  return sha256(JSON.stringify({
    runId: feedback.runId,
    comparisonHash: feedback.comparisonHash,
    baseCandidateId: feedback.baseCandidateId,
    themeCandidateId: feedback.themeCandidateId,
    choices: feedback.choices,
    submission: feedback.submission,
    noneOfThese: feedback.noneOfThese,
    globalNotes: feedback.globalNotes,
  }));
}

export function validateDesignFeedback(opts: {
  feedback: DesignFeedback;
  runId: string;
  comparison: ComparisonManifest;
  indexes: Record<string, SectionIndex>;
}): FeedbackValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { feedback, comparison } = opts;
  if (feedback.runId !== opts.runId) errors.push(`Feedback runId ${feedback.runId} does not match ${opts.runId}`);
  if (feedback.comparisonRevision !== comparison.revision) errors.push("Feedback comparisonRevision is stale");
  if (feedback.comparisonHash !== comparison.hash) errors.push("Feedback comparisonHash does not match the frozen snapshot");
  const ids = new Set(comparison.candidates.map(c => c.candidateId));
  const labels = Object.fromEntries(comparison.candidates.map(c => [c.label, c.candidateId]));
  const resolveId = (value: string) => ids.has(value) ? value : labels[value];
  if (feedback.noneOfThese || feedback.submission === "revise-directions") {
    return {
      ok: errors.length === 0,
      errors, warnings,
      interpretation: baseInterpretation(feedback, "operator", []),
    };
  }
  const base = resolveId(feedback.baseCandidateId);
  const theme = resolveId(feedback.themeCandidateId);
  if (!base) errors.push("Unknown baseCandidateId");
  if (!theme) errors.push("Unknown themeCandidateId");
  const choices = feedback.choices.map(choice => {
    const next = { ...choice };
    if (choice.source) {
      const sourceId = resolveId(choice.source.candidateId);
      if (!sourceId) errors.push(`Unknown source candidate: ${choice.source.candidateId}`);
      else next.source = { ...choice.source, candidateId: sourceId };
      const candidate = comparison.candidates.find(c => c.candidateId === sourceId);
      if (candidate && choice.source.buildHash && choice.source.buildHash !== candidate.buildHash) {
        errors.push(`Stale source buildHash for ${choice.id}; refusing to substitute a newer unsanpshotted build`);
      }
      if (sourceId && choice.operation !== "remove" && choice.operation !== "avoid") {
        const index = opts.indexes[sourceId];
        if (!index) errors.push(`Missing section index for ${sourceId}`);
        else if (choice.source.sectionId && !findSection(index, choice.source.route, choice.source.sectionId)) {
          errors.push(`Missing donor section ${choice.source.route} ${choice.source.sectionId}`);
        }
      }
    }
    if (choice.operation === "insert" && (!choice.target?.before && !choice.target?.after)) {
      errors.push(`Insert ${choice.id} needs an explicit before/after target`);
    }
    if ((choice.operation === "replace" || choice.operation === "preserve") && !choice.target?.sectionId) {
      errors.push(`${choice.operation} ${choice.id} needs a target section`);
    }
    if (choice.facets.includes("style") && theme && choice.source && choice.source.candidateId !== theme && !choice.styleException && choice.adaptation !== "translate-to-base-theme") {
      warnings.push(`Style facet on ${choice.id} should record an exception or translate-to-base-theme`);
    }
    if (choice.source?.route?.includes("..") || choice.target?.route?.includes("..") || choice.source?.sectionId?.includes("/") || choice.target?.sectionId?.includes("\\")) {
      errors.push(`Choice ${choice.id} contains an illegal path`);
    }
    return next;
  });
  const unresolved = detectConflicts(feedback, choices);
  return {
    ok: errors.length === 0 && unresolved.length === 0,
    errors,
    warnings,
    interpretation: {
      ...baseInterpretation({ ...feedback, baseCandidateId: base || feedback.baseCandidateId, themeCandidateId: theme || feedback.themeCandidateId }, "operator", choices),
      unresolved,
    },
  };
}

function findSection(index: SectionIndex, route: string, sectionId: string) {
  return index.routes.find(r => r.path === route)?.sections.find(s => s.sectionId === sectionId);
}

function detectConflicts(feedback: DesignFeedback, choices: FeedbackChoice[]): { question: string; conflict?: string }[] {
  const unresolved: { question: string; conflict?: string }[] = [];
  const notes = `${feedback.globalNotes || ""} ${Object.values(feedback.pageNotes || {}).join(" ")}`.toLowerCase();
  for (const choice of choices) {
    if (choice.preserve?.includes("target-copy") && /\b(rewrite|replace)\b.+\b(headline|copy|wording)\b/.test(`${choice.note || ""} ${notes}`)) {
      unresolved.push({
        question: `Choice ${choice.id} preserves target copy, but a note asks to rewrite wording. Which should win?`,
        conflict: choice.id,
      });
    }
  }
  if (feedback.noneOfThese && (feedback.baseCandidateId || choices.length)) {
    unresolved.push({ question: "None of these is selected together with a base or donor choice. Confirm whether to revise directions or synthesize." });
  }
  return unresolved;
}

function baseInterpretation(feedback: DesignFeedback, kind: FeedbackInterpretation["kind"], choices: FeedbackChoice[]): FeedbackInterpretation {
  return {
    schemaVersion: 1,
    revision: `int-${feedback.feedbackId}`,
    feedbackId: feedback.feedbackId,
    comparisonHash: feedback.comparisonHash,
    kind,
    unresolved: [],
    assumptions: [],
    choices,
    baseCandidateId: feedback.baseCandidateId,
    themeCandidateId: feedback.themeCandidateId,
  };
}

export function saveFeedback(runDir: string, feedback: DesignFeedback): string {
  const rel = `feedback/${feedback.feedbackId}.json`;
  save(within(runDir, rel), feedback);
  return rel;
}

export function loadFeedback(runDir: string, feedbackId: string): DesignFeedback {
  if (!/^[a-zA-Z0-9._-]+$/.test(feedbackId)) throw new Error("Invalid feedback id");
  const path = within(runDir, `feedback/${feedbackId}.json`);
  if (!existsSync(path)) throw new Error(`Unknown feedback: ${feedbackId}`);
  return parseDesignFeedback(json(path));
}

export function summarizeFeedback(feedback: DesignFeedback, interpretation: FeedbackInterpretation): string {
  const lines = [
    `Theme: ${interpretation.themeCandidateId}`,
    `Base / whole-site starting point: ${interpretation.baseCandidateId}`,
  ];
  if (feedback.noneOfThese || feedback.submission === "revise-directions") lines.push("Action: revise directions (none of these)");
  else lines.push(`Action: ${feedback.submission}`);
  for (const choice of interpretation.choices) {
    const src = choice.source ? `${choice.source.candidateId} ${choice.source.route}#${choice.source.sectionId}` : "none";
    const dst = choice.target ? `${choice.target.route}${choice.target.sectionId ? "#" + choice.target.sectionId : ""}` : "global";
    lines.push(`${choice.id}: ${choice.operation} ${choice.facets.join("+")} from ${src} onto ${dst}${choice.note ? ` — ${choice.note}` : ""}`);
  }
  if (feedback.globalNotes) lines.push(`Notes: ${feedback.globalNotes}`);
  return lines.join("\n");
}

export function writeInterpretation(runDir: string, interpretation: FeedbackInterpretation): string {
  const rel = `interpretations/${interpretation.revision}.json`;
  save(join(runDir, rel), interpretation);
  return rel;
}
