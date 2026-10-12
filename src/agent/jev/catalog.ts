import {
  CTA_CONSISTENCY_CRITERIA,
  DIRECTION_SCORE_RUBRICS,
  EMBEDDED_GROUNDING_INSTRUCTION_TEMPLATE,
  EVIDENCE_RELEVANCE_RUBRIC,
  GROUNDING_RELATION_CRITERIA,
  GROUNDING_SEMANTICS_HASH,
  MEDIA_RELEVANCE_RUBRIC,
  PATH_REFERENCED_GROUNDING_INSTRUCTION_TEMPLATE,
  QUESTION_VERSION,
  ROUTING_SCOPE_CRITERIA,
} from "./questions.ts";
import { POLICY_VERSION } from "./policy.ts";

/**
 * Versioned question/task catalog. Prompt text lives in questions.ts.
 * Decision thresholds and reuse rules live in policy.ts. Do not mix them.
 */
export interface CatalogEntry {
  id: string;
  primitive: "Choice" | "Noul" | "Score";
  questionVersion: string;
  policyVersion: string;
  semanticsHash?: string;
  promptRef: string;
  policyRef: string;
}

export const QUESTION_TASK_CATALOG: CatalogEntry[] = [
  {
    id: "grounding.relation",
    primitive: "Choice",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    semanticsHash: GROUNDING_SEMANTICS_HASH,
    promptRef: "PATH_REFERENCED_GROUNDING_INSTRUCTION_TEMPLATE / GROUNDING_RELATION_CRITERIA",
    policyRef: "evaluateGroundingVerdict",
  },
  {
    id: "routing.scope",
    primitive: "Choice",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "ROUTING_SCOPE_CRITERIA",
    policyRef: "evaluateRoutingDecision",
  },
  {
    id: "routing.multi_scope",
    primitive: "Noul",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "makeMultiScopeRoutingQuestions",
    policyRef: "evaluateMultiScopeDecision",
  },
  {
    id: "cta.consistency",
    primitive: "Choice",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "CTA_CONSISTENCY_CRITERIA",
    policyRef: "evaluateGroundingVerdict / CTA mapping",
  },
  {
    id: "evidence.relevance",
    primitive: "Score",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "EVIDENCE_RELEVANCE_RUBRIC",
    policyRef: "rank/policy consumers (experimental)",
  },
  {
    id: "direction.dimension",
    primitive: "Score",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "DIRECTION_SCORE_RUBRICS",
    policyRef: "preferenceScoring (experimental)",
  },
  {
    id: "media.relevance",
    primitive: "Score",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "MEDIA_RELEVANCE_RUBRIC",
    policyRef: "media-fit-scoring (experimental)",
  },
  {
    id: "component.fit",
    primitive: "Score",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "makeComponentFitQuestion / COMPONENT_FIT_RUBRICS",
    policyRef: "component-fit-check (experimental; advisory shortlist only)",
  },
  {
    id: "field.selection",
    primitive: "Choice",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "FIELD_SELECTION_INSTRUCTION_TEMPLATE + no_match",
    policyRef: "runBusinessSourceSelection / verbatim copy (single-value fields)",
  },
  {
    id: "field.candidate_noul",
    primitive: "Noul",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "FIELD_CANDIDATE_NOUL_TEMPLATE",
    policyRef: "runBusinessSourceSelection / per-candidate yes-no (multi-value fields)",
  },
  {
    id: "claim.error_noul",
    primitive: "Noul",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "makeClaimErrorNoulQuestion",
    policyRef: "QUALITY_NOUL_ACCEPT / escalate on serious errors",
  },
  {
    id: "intent.coverage_noul",
    primitive: "Noul",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "makeIntentCoverageNoulQuestion",
    policyRef: "QUALITY_NOUL_ACCEPT intent coverage aggregation",
  },
  {
    id: "cta.fidelity",
    primitive: "Choice",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "CTA_FIDELITY_CRITERIA",
    policyRef: "deterministic broken-link vs semantic mismatch",
  },
  {
    id: "continuity.edge",
    primitive: "Choice",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "CONTINUITY_CRITERIA",
    policyRef: "cross-stage preservation policy",
  },
  {
    id: "creative.dimension",
    primitive: "Score",
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    promptRef: "CREATIVE_SCORE_RUBRICS",
    policyRef: "code-combined weights; non-compensating factual gate",
  },
];

export function catalogPromptPolicySeparated(): boolean {
  return QUESTION_TASK_CATALOG.every(
    e => e.promptRef.length > 0 && e.policyRef.length > 0 && e.questionVersion === QUESTION_VERSION && e.policyVersion === POLICY_VERSION
  );
}

export const CATALOG_PROMPT_ANCHORS = {
  GROUNDING_RELATION_CRITERIA,
  PATH_REFERENCED_GROUNDING_INSTRUCTION_TEMPLATE,
  EMBEDDED_GROUNDING_INSTRUCTION_TEMPLATE,
  ROUTING_SCOPE_CRITERIA,
  CTA_CONSISTENCY_CRITERIA,
  EVIDENCE_RELEVANCE_RUBRIC,
  DIRECTION_SCORE_RUBRICS,
  MEDIA_RELEVANCE_RUBRIC,
};
