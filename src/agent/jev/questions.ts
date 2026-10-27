import { createHash } from "node:crypto";
import { choice, noul, score, type ChoiceQuestion, type NoulQuestion, type Questions, type ScoreCriteria, type ScoreQuestion } from "@typesafe-ai/sdk";

export const QUESTION_VERSION = "2026-09-17.2";

/**
 * Recursively serializes any value to canonical JSON.
 * - Object keys are recursively sorted lexicographically at every depth.
 * - Array order is strictly preserved.
 * - Undefined properties on objects are omitted (matching standard JSON.stringify).
 * - Primitives are serialized deterministically.
 */
export function canonicalJsonStringify(val: unknown): string {
  if (val === null || val === undefined) {
    return "null";
  }
  if (typeof val === "boolean" || typeof val === "number") {
    return JSON.stringify(val);
  }
  if (typeof val === "string") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map(item => canonicalJsonStringify(item)).join(",")}]`;
  }
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const entries: string[] = [];
    for (const key of sortedKeys) {
      if (obj[key] !== undefined) {
        entries.push(`${JSON.stringify(key)}:${canonicalJsonStringify(obj[key])}`);
      }
    }
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(val);
}

/**
 * Computes a SHA-256 hash of fully serialized question instructions and criteria.
 * This is the cache-bust key: changing question wording or criteria busts the cache even if
 * QUESTION_VERSION was not bumped.
 */
export function questionSemanticsHash(q: Record<string, unknown> | unknown): string {
  const serialized = canonicalJsonStringify(q);
  return createHash("sha256").update(serialized).digest("hex");
}

export const GROUNDING_RELATION_CRITERIA = {
  supports: "The cited evidence excerpt directly proves, confirms, or states the claim to be true.",
  contradicts: "The cited evidence excerpt directly contradicts the claim or asserts an opposite fact.",
  says_nothing: "The cited evidence excerpt does not address, mention, or verify what the claim asserts.",
} as const;

export const PATH_REFERENCED_GROUNDING_INSTRUCTION_TEMPLATE =
  "Evaluate how the evidence excerpt at state.{evidencePath} relates to the claim at state.{claimPath}.\nDetermine whether the cited evidence supports, contradicts, or says nothing about the claim.";

export const EMBEDDED_GROUNDING_INSTRUCTION_TEMPLATE =
  "Evaluate how the evidence excerpt relates to the claim.\n\nClaim:\n{claim}\n\nEvidence Excerpt:\n{excerpt}";

export const GROUNDING_TASK_INSTRUCTIONS = PATH_REFERENCED_GROUNDING_INSTRUCTION_TEMPLATE;

/** Complete versioned semantic task definition, hashing instructions and criteria together. */
export const GROUNDING_TASK_SEMANTICS = {
  task: "grounding",
  version: QUESTION_VERSION,
  pathReferencedTemplate: PATH_REFERENCED_GROUNDING_INSTRUCTION_TEMPLATE,
  embeddedTemplate: EMBEDDED_GROUNDING_INSTRUCTION_TEMPLATE,
  criteria: GROUNDING_RELATION_CRITERIA,
} as const;

export const GROUNDING_SEMANTICS_HASH = questionSemanticsHash(GROUNDING_TASK_SEMANTICS);

export function makeGroundingQuestion(claim: string, excerpt: string): ChoiceQuestion<typeof GROUNDING_RELATION_CRITERIA> {
  const instructions = EMBEDDED_GROUNDING_INSTRUCTION_TEMPLATE
    .replace("{claim}", claim)
    .replace("{excerpt}", excerpt);

  return choice(instructions, GROUNDING_RELATION_CRITERIA);
}

/** Path-referenced grounding question referencing explicit state paths without prompt duplication. */
export function makePathReferencedGroundingQuestion(
  claimPath: string,
  evidencePath: string
): ChoiceQuestion<typeof GROUNDING_RELATION_CRITERIA> {
  const instructions = PATH_REFERENCED_GROUNDING_INSTRUCTION_TEMPLATE
    .replace("{claimPath}", claimPath)
    .replace("{evidencePath}", evidencePath);

  return choice(instructions, GROUNDING_RELATION_CRITERIA);
}

export const ROUTING_SCOPE_CRITERIA = {
  business: "Adds, removes, or modifies core business facts, services, offerings, pricing tiers, hours, or locations.",
  copy: "Edits wording, headlines, captions, subheads, or text without introducing ungrounded facts or changing visual design.",
  pages: "Changes component layout, spacing, buttons, navigation structure, or presentation without altering business facts.",
  direction: "Changes overall visual theme, brand styling, typography, color palette, or aesthetic look-and-feel.",
  ambiguous: "The request is vague, unclear, or lacks sufficient detail to determine a single engineering change scope.",
  mixed: "The request clearly combines multiple independent changes across different scopes (e.g., both copy wording and UI layout, or both business facts and visual theme).",
} as const;

export function makeRoutingQuestion(instruction: string, context?: string): ChoiceQuestion<typeof ROUTING_SCOPE_CRITERIA> {
  let instructions = `Classify the following operator change request into the primary scope of work required.

Operator Request:
${instruction}`;

  if (context?.trim()) {
    instructions += `\n\nCurrent Site Context:\n${context.trim()}`;
  }

  return choice(instructions, ROUTING_SCOPE_CRITERIA);
}

export interface MultiScopeQuestions extends Questions {
  business: NoulQuestion;
  copy: NoulQuestion;
  pages: NoulQuestion;
  direction: NoulQuestion;
}

export function makeMultiScopeRoutingQuestions(instruction: string, context?: string): MultiScopeQuestions {
  const contextNote = context?.trim() ? `\nCurrent Context:\n${context.trim()}` : "";

  return {
    business: noul(
      `Does this operator change request add, remove, or modify core business facts, offerings, services, pricing, hours, or locations?\n\nRequest: ${instruction}${contextNote}`,
      {
        true: "Modifies core business facts, services, pricing, hours, or offerings.",
        false: "Does not modify core business facts or offerings.",
      }
    ),
    copy: noul(
      `Does this operator change request edit text copy, headlines, taglines, wording, or body paragraphs without introducing ungrounded facts?\n\nRequest: ${instruction}${contextNote}`,
      {
        true: "Edits text copy, headlines, body wording, or captions.",
        false: "Does not edit text copy or wording.",
      }
    ),
    pages: noul(
      `Does this operator change request change component layout, spacing, buttons, page structure, or navigation chrome?\n\nRequest: ${instruction}${contextNote}`,
      {
        true: "Changes component layout, spacing, buttons, or navigation structure.",
        false: "Does not change component layout or UI structure.",
      }
    ),
    direction: noul(
      `Does this operator change request change visual theme, colors, typography, aesthetic density, or art direction?\n\nRequest: ${instruction}${contextNote}`,
      {
        true: "Changes visual theme, styling, colors, typography, or aesthetic look-and-feel.",
        false: "Does not change visual styling or theme.",
      }
    ),
  };
}

export const CTA_CONSISTENCY_CRITERIA = {
  consistent: "The planned call-to-action wording, destination route, and intended interaction directly align with storyboard actions.",
  contradictory: "The planned call-to-action promises an action (e.g., direct scheduling, instant booking, checkout) that is not supported or conflicts with storyboard action definitions.",
  unaddressed: "The planned call-to-action is not addressed or present in the storyboard actions.",
} as const;

export function makeCtaConsistencyQuestion(plannedCta: string, storyboardAction: string): ChoiceQuestion<typeof CTA_CONSISTENCY_CRITERIA> {
  const instructions = `Evaluate whether the planned CTA copy is consistent with the storyboard action contract.

Planned CTA:
${plannedCta}

Storyboard Action Contract:
${storyboardAction}`;

  return choice(instructions, CTA_CONSISTENCY_CRITERIA);
}

export const EVIDENCE_RELEVANCE_RUBRIC: ScoreCriteria = [
  { score: 0, description: "Irrelevant: the excerpt has no bearing on the claim or task." },
  { score: 1, description: "Tangential: the excerpt mentions a related topic but does not address the claim." },
  { score: 2, description: "Partial: the excerpt contains information adjacent to the claim but misses key qualifications." },
  { score: 3, description: "Relevant: the excerpt directly addresses the claim with useful detail." },
  { score: 4, description: "Essential: the excerpt is the primary or sole source of evidence for the claim." },
];

export function makeEvidenceRelevanceScoreQuestion(
  claim: string,
  excerpt: string
): ScoreQuestion<typeof EVIDENCE_RELEVANCE_RUBRIC> {
  const instructions = `Rate how relevant the evidence excerpt is to evaluating the claim.

Claim:
${claim}

Evidence Excerpt:
${excerpt}`;

  return score(instructions, EVIDENCE_RELEVANCE_RUBRIC);
}

export const DIRECTION_SCORE_RUBRICS = {
  business_fit: [
    { score: 0, description: "Mismatch: aesthetic completely conflicts with the business domain and target audience." },
    { score: 1, description: "Generic: generic modern layout without domain personality." },
    { score: 2, description: "Adequate: acceptable styling that does not detract from credibility." },
    { score: 3, description: "Strong: well-tuned aesthetic that builds immediate credibility and industry fit." },
    { score: 4, description: "Exemplary: bespoke vernacular craft perfectly tailored to the business." },
  ],
  typography: [
    { score: 0, description: "Poor: illegible, chaotic, or inappropriate type choices." },
    { score: 1, description: "Bland: default system fonts with weak hierarchy." },
    { score: 2, description: "Functional: clear contrast and readable hierarchy." },
    { score: 3, description: "Refined: intentional font pairing with elegant rhythm and scale." },
    { score: 4, description: "Editorial: publication-grade typographic pacing and bespoke details." },
  ],
  composition: [
    { score: 0, description: "Cluttered: disorganized elements with poor rhythm." },
    { score: 1, description: "Rigid: repetitive card grid without breathing room." },
    { score: 2, description: "Balanced: clean spatial structure and adequate whitespace." },
    { score: 3, description: "Dynamic: intentional pacing, focal points, and visual interest." },
    { score: 4, description: "Harmonious: masterfully balanced visual density and narrative cadence." },
  ],
  authenticity: [
    { score: 0, description: "Stock/AI: feels unmistakably like an automated stock template." },
    { score: 1, description: "Imitative: borrows standard SaaS patterns inappropriately." },
    { score: 2, description: "Honest: straightforward presentation without pretension." },
    { score: 3, description: "Distinctive: distinctive personality grounded in actual customer work." },
    { score: 4, description: "Singular: unforgettable signature identity that could belong to no other business." },
  ],
} as const;

export type DirectionDimension = keyof typeof DIRECTION_SCORE_RUBRICS;

export function makeDirectionScoreQuestion(
  dimension: DirectionDimension,
  businessSummary: string,
  directionSpec: string
): ScoreQuestion<any> {
  const rubric = DIRECTION_SCORE_RUBRICS[dimension];
  const instructions = `Rate the design direction on the dimension "${dimension}".

Business Context:
${businessSummary}

Design Direction Specification:
${directionSpec}`;

  return score(instructions, rubric);
}

export const MEDIA_RELEVANCE_RUBRIC: ScoreCriteria = [
  { score: 0, description: "Irrelevant or deceptive: image depicts unrelated objects, incorrect industry, or stock placeholder." },
  { score: 1, description: "Generic decorative: stock asset that loosely relates but lacks authentic local connection." },
  { score: 2, description: "Plausible: depicts appropriate trade or setting but without specific customer evidence." },
  { score: 3, description: "Authentic & Relevant: directly illustrates the actual work, team, facility, or region." },
  { score: 4, description: "Heroic: prime authentic original capture perfectly embodying the core offer." },
];

export const FIELD_SELECTION_NO_MATCH = "no_match";

export const FIELD_SELECTION_INSTRUCTION_TEMPLATE =
  "Select which supplied source span is the value of field `{field}` for this business. Copy a candidate verbatim; do not invent a value. Choose no_match if none of the spans belong to this business or the correct value is absent.";

export const FIELD_CANDIDATE_NOUL_TEMPLATE =
  "Is the source span at state.{valuePath} a valid `{field}` value that belongs to this business (not a third-party, unrelated, or stale mention)?";

export function makeFieldSelectionQuestion(
  field: string,
  candidates: Array<{ id: string; value: string; excerpt: string; source: string }>
): ChoiceQuestion<Record<string, string>> {
  const criteria: Record<string, string> = {};
  for (const c of candidates) {
    criteria[c.id] = `Use the verbatim source span "${c.value}" from ${c.source} as this field's value.`;
  }
  criteria[FIELD_SELECTION_NO_MATCH] =
    "None of the supplied candidate spans is the correct value for this field, or the correct value is absent from the candidate set.";
  const listed = candidates.map(c => `- ${c.id}: "${c.value}" (source: ${c.source}; excerpt: ${c.excerpt})`).join("\n");
  const instructions = `${FIELD_SELECTION_INSTRUCTION_TEMPLATE.replace("{field}", field)}\n\nCandidates:\n${listed}`;
  return choice(instructions, criteria);
}

export function makeFieldCandidateNoulQuestion(
  field: string,
  candidate: { id: string; value: string; excerpt: string; source: string }
): NoulQuestion {
  return noul(
    `Is the source span "${candidate.value}" a valid ${field} value that belongs to this business (not a third-party, unrelated, or stale mention)?\nSource: ${candidate.source}\nExcerpt: ${candidate.excerpt}`,
    {
      true: `This span is a legitimate ${field} value for this business and may coexist with other accepted ${field} values.`,
      false: `This span does not belong to this business, is third-party, or is not a ${field} value.`,
    }
  );
}

export const FIELD_SELECTION_TASK_SEMANTICS = {
  task: "field_selection",
  version: QUESTION_VERSION,
  template: FIELD_SELECTION_INSTRUCTION_TEMPLATE,
  noulTemplate: FIELD_CANDIDATE_NOUL_TEMPLATE,
  noMatch: FIELD_SELECTION_NO_MATCH,
} as const;

export const FIELD_SELECTION_SEMANTICS_HASH = questionSemanticsHash(FIELD_SELECTION_TASK_SEMANTICS);

export function makeMediaRelevanceQuestion(
  sectionText: string,
  imageDescription: string
): ScoreQuestion<typeof MEDIA_RELEVANCE_RUBRIC> {
  const instructions = `Rate how relevant and authentic the media asset is for the planned section.

Section Copy:
${sectionText}

Media Asset Description:
${imageDescription}`;

  return score(instructions, MEDIA_RELEVANCE_RUBRIC);
}

export const CLAIM_ERROR_NOUL_TRUE = "This error is present in the supplied assertion relative to the evidence.";
export const CLAIM_ERROR_NOUL_FALSE = "This error is not present.";

export function makeClaimErrorNoulQuestion(
  errorKind: "unsupported" | "contradiction" | "dropped_qualification" | "exaggerated_strength" | "off_target_evidence",
  assertion: string,
  evidence: string
): NoulQuestion {
  const prompts: Record<typeof errorKind, string> = {
    unsupported: "Is this assertion unsupported by the supplied evidence?",
    contradiction: "Does the supplied evidence contradict this assertion?",
    dropped_qualification: "Did the assertion drop a material qualification present in the evidence?",
    exaggerated_strength: "Does the assertion exaggerate the strength of the evidence (superlative or certainty the source does not support)?",
    off_target_evidence: "Is the supplied evidence off-target for what the assertion claims?",
  };
  return noul(
    `${prompts[errorKind]}\n\nAssertion:\n${assertion}\n\nEvidence:\n${evidence}`,
    { true: CLAIM_ERROR_NOUL_TRUE, false: CLAIM_ERROR_NOUL_FALSE }
  );
}

export const CLAIM_ERROR_TASK_SEMANTICS = {
  version: QUESTION_VERSION,
  primitive: "noul",
  true: CLAIM_ERROR_NOUL_TRUE,
  false: CLAIM_ERROR_NOUL_FALSE,
};
export const CLAIM_ERROR_SEMANTICS_HASH = questionSemanticsHash(CLAIM_ERROR_TASK_SEMANTICS);

export function makeIntentCoverageNoulQuestion(question: string, pageText: string): NoulQuestion {
  return noul(
    `Does the supplied page text actually answer this visitor question with supporting facts present?\n\nVisitor question:\n${question}\n\nPage text:\n${pageText}`,
    {
      true: "The text answers the question with supporting facts.",
      false: "The text does not answer the question or lacks supporting facts.",
    }
  );
}

export const INTENT_COVERAGE_TASK_SEMANTICS = {
  version: QUESTION_VERSION,
  primitive: "noul",
  true: "The text answers the question with supporting facts.",
  false: "The text does not answer the question or lacks supporting facts.",
};
export const INTENT_COVERAGE_SEMANTICS_HASH = questionSemanticsHash(INTENT_COVERAGE_TASK_SEMANTICS);

export const CTA_FIDELITY_CRITERIA = {
  consistent: "The CTA label/promise matches the recorded textual behavior contract.",
  mismatch: "The CTA label/promise does not match the recorded destination or action (e.g. Schedule pointing at a generic contact form).",
} as const;

export function makeCtaFidelityQuestion(label: string, behavior: string): ChoiceQuestion<typeof CTA_FIDELITY_CRITERIA> {
  return choice(
    `Compare the CTA label/promise with the recorded textual behavior contract. Broken links are a separate deterministic failure and are not this question.\n\nCTA label:\n${label}\n\nRecorded behavior:\n${behavior}`,
    CTA_FIDELITY_CRITERIA
  );
}

export const CTA_FIDELITY_TASK_SEMANTICS = {
  version: QUESTION_VERSION,
  primitive: "choice",
  criteria: CTA_FIDELITY_CRITERIA,
};
export const CTA_FIDELITY_SEMANTICS_HASH = questionSemanticsHash(CTA_FIDELITY_TASK_SEMANTICS);

export const CONTINUITY_CRITERIA = {
  preserved: "The later stage preserves the earlier meaning.",
  narrowed: "The later stage narrows the earlier meaning without contradicting it.",
  broadened: "The later stage broadens the earlier meaning.",
  contradicted: "The later stage contradicts the earlier meaning.",
  omitted: "The later stage omits the earlier meaning.",
} as const;

export function makeContinuityQuestion(earlier: string, later: string, edge: string): ChoiceQuestion<typeof CONTINUITY_CRITERIA> {
  return choice(
    `Judge semantic continuity on edge "${edge}".\n\nEarlier:\n${earlier}\n\nLater:\n${later}`,
    CONTINUITY_CRITERIA
  );
}

export const CONTINUITY_TASK_SEMANTICS = {
  version: QUESTION_VERSION,
  primitive: "choice",
  criteria: CONTINUITY_CRITERIA,
};
export const CONTINUITY_SEMANTICS_HASH = questionSemanticsHash(CONTINUITY_TASK_SEMANTICS);

export function makeRedundancyNoulQuestion(first: string, second: string): NoulQuestion {
  return noul(
    `Does the second instance add a distinct visitor-relevant fact, proof, or next step beyond the first?\n\nFirst:\n${first}\n\nSecond:\n${second}`,
    {
      true: "The second instance adds a distinct visitor-relevant fact, proof, or next step.",
      false: "The second instance is redundant for the visitor.",
    }
  );
}

export const CREATIVE_SCORE_RUBRICS: ScoreCriteria = [
  { score: 0, description: "Fail: does not serve this dimension." },
  { score: 1, description: "Weak: generic or incomplete on this dimension." },
  { score: 2, description: "Adequate: usable but not distinctive." },
  { score: 3, description: "Strong: clearly serves this dimension with evidence." },
  { score: 4, description: "Excellent: distinctive and concrete on this dimension." },
];

export type CreativeDimension =
  | "audience_fit"
  | "offer_clarity"
  | "evidence_use"
  | "visitor_job_coverage"
  | "distinctive_relevance"
  | "feasibility";

export function makeCreativeDimensionQuestion(
  dimension: CreativeDimension,
  proposal: string,
  context: string
): ScoreQuestion<typeof CREATIVE_SCORE_RUBRICS> {
  return score(
    `Rate the textual proposal on "${dimension}". Jev has not seen pixels.\n\nContext:\n${context}\n\nProposal:\n${proposal}`,
    CREATIVE_SCORE_RUBRICS
  );
}

export const DIRECTION_DECISION_CRITERIA = {
  supports: "The textual proposal supports this check.",
  contradicts: "The textual proposal conflicts with this check.",
  says_nothing: "The proposal does not contain enough text to decide.",
} as const;

export const DIRECTION_DECISION_CHECKS = [
  "hierarchy_serves_goal",
  "uses_distinctive_evidence",
  "requires_unavailable_imagery",
  "alternatives_differ_in_experience",
  "contradicts_user_constraint",
] as const;

export function makeDirectionDecisionQuestion(check: (typeof DIRECTION_DECISION_CHECKS)[number], proposal: string, context: string) {
  return choice(
    `Judge the textual proposal only. You have not seen pixels.\nCheck: ${check}\nContext:\n${context}\nProposal:\n${proposal}`,
    DIRECTION_DECISION_CRITERIA,
  );
}

export const COMPOSITION_REPETITION_CRITERIA = {
  serves_narrative: "The repeated treatment serves one visitor job or one deliberate list.",
  unrelated_repetition: "Equal treatment repeats sections that answer different jobs without a rationale.",
  insufficient_evidence: "The section notes do not say enough to judge repetition.",
} as const;

export function makeCompositionRepetitionQuestion(pagePath: string, sectionContext: string) {
  return choice(
    `Judge whether repetition serves the narrative on ${pagePath}. Do not score universal beauty. You have not seen pixels.\n${sectionContext}`,
    COMPOSITION_REPETITION_CRITERIA,
  );
}
