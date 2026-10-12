import type {
  ChoiceCriteria,
  ChoiceQuestion,
  ChoiceResponse,
  NoulQuestion,
  NoulResponse,
  Question,
  Questions,
  ScoreCriteria,
  ScoreQuestion,
  ScoreResponse,
  SystemOneRequest,
  SystemOneResult,
  Usage,
} from "@typesafe-ai/sdk";

export type {
  ChoiceCriteria,
  ChoiceQuestion,
  ChoiceResponse,
  NoulQuestion,
  NoulResponse,
  Question,
  Questions,
  ScoreCriteria,
  ScoreQuestion,
  ScoreResponse,
  SystemOneRequest,
  SystemOneResult,
  Usage,
};

export type JevMode = "off" | "shadow" | "assist";

/**
 * Experimental work-ownership setting. Orthogonal to global mode and per-capability mode.
 *
 * - "agent"     (default): Agent owns the full workload. No Jev-delegated obligation removal.
 *   Use for baseline/additive tests. Backward-compatible with all existing behavior.
 * - "delegated" (experimental/uncalibrated): Machine-covered routine obligations may be removed
 *   from the agent prompt only when ALL of the following hold:
 *     1. Global mode is "assist".
 *     2. The specific capability is "assist".
 *     3. The calibration gate for the task is eligible === true.
 *     4. The task contract, coverage, risk policy, and applicability all allow it.
 *   Effective "off" or "shadow" cannot delegate. "assist" alone does not authorize delegation
 *   unless all conditions above are met.
 *
 * Initially all tasks are uncalibrated; no live delegation is granted. Mark this setting
 * as experimental in any UI or docs — it is not currently supported production syntax.
 */
export type JevWorkOwnership = "agent" | "delegated";

/**
 * Per-task calibration gate. All tasks default to eligible=false (uncalibrated).
 * Delegation is blocked until a task-specific gate is manually set to eligible=true
 * in an isolated pilot context with verified measurements.
 */
export interface JevCalibrationGate {
  taskId: string;
  /** Default false — delegation disabled until measurements justify enabling. */
  eligible: boolean;
  gateVersion?: string;
  /** If true, only permitted inside an explicitly named pilot context. */
  pilotOnly?: boolean;
  notes?: string;
}

/**
 * Per-task applicability descriptor. Prevents inapplicable tasks from running
 * (e.g. no booking questions when the site has no booking functionality).
 */
export interface JevTaskApplicability {
  taskId: string;
  /** Whether the subject matter required by this task exists on the site. */
  subjectExists: boolean;
  riskLevel: "low" | "medium" | "high";
  /** All policy conditions that must be satisfied for delegation. */
  delegationRequires: string[];
}

export interface JevConfidenceThresholds {
  routing: number;
  grounding: number;
}

export interface JevCacheConfig {
  enabled: boolean;
  dir: string;
}

export interface JevBudgetConfig {
  maxCalls?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxCostUsd?: number;
}

export interface JevCapabilityConfig {
  mediaClassification?: JevMode;
  mediaSelection?: JevMode;
  mediaSetReview?: JevMode;
  mediaProvenance?: JevMode;
  // Existing capabilities
  grounding: JevMode;
  sourceSelection: JevMode;
  retrievalRanking: JevMode;
  consistency: JevMode;
  repairAssistance: JevMode;
  preferenceScoring: JevMode;
  // Workstream 5 — optional at input boundaries; resolved to "off" when omitted
  claimStrengthening?: JevMode;
  ctaFidelity?: JevMode;
  crossStageContinuity?: JevMode;
  coverageCheck?: JevMode;
  // Workstream 7
  creativeScoring?: JevMode;
  /** Phase 2: rank library blocks after copy-review / changed pages. Off in the matched quality profile. */
  componentSelection?: JevMode;
  /** Advisory storyboard repetition check. Off unless the design-assist preset or an explicit capability enables it. */
  compositionCheck?: JevMode;
  /** Rank eligible lessons. Cannot drop mandatory requirements. */
  lessonRanking?: JevMode;
  visitorQuestionCheck?: JevMode;
  factContradictionCheck?: JevMode;
  ctaFitCheck?: JevMode;
  repetitionExplanationCheck?: JevMode;
  directionContinuityCheck?: JevMode;
}

export interface JevTelemetryConfig {
  enabled: boolean;
  receiptDir: string;
}

/**
 * Pilot budget limits for isolated experiments.
 * Default ceiling: 100 transport attempts, 200,000 estimated input tokens.
 * Preflight estimates may conservatively reserve budget; actual usage reconciles.
 * Stop Jev and restore agent obligations at the ceiling.
 */
export interface JevPilotBudget {
  maxTransportAttempts: number;
  maxInputTokens: number;
}

export interface JevConfig {
  mode: JevMode;
  model: string;
  endpoint?: string;
  timeoutMs: number;
  taskDeadlineMs: number;
  maxConcurrency: number;
  maxRetries: number;
  confidenceThresholds: JevConfidenceThresholds;
  compactPackets: boolean;
  cache?: JevCacheConfig;
  budget?: JevBudgetConfig;
  capabilities?: Partial<JevCapabilityConfig>;
  telemetry?: JevTelemetryConfig;
  /**
   * Experimental work-ownership setting. Default "agent".
   * See JevWorkOwnership for full semantics and constraints.
   */
  workOwnership?: JevWorkOwnership;
  /**
   * Pilot budget ceiling. Applied only when explicitly running a pilot.
   * Default: 100 transport attempts, 200,000 input tokens.
   */
  pilotBudget?: JevPilotBudget;
  /**
   * Per-task calibration gates from site config. Diagnostic only.
   * `eligible: true` here NEVER authorizes delegation. Kernel calibration artifacts do.
   */
  calibrationGates?: JevCalibrationGate[];
  /**
   * Per-task applicability descriptors. Controls whether a task runs at all
   * given the site's actual content.
   */
  taskApplicability?: JevTaskApplicability[];
}

export type GroundingVerdict =
  | "verified"
  | "contradicted"
  | "insufficient_evidence"
  | "quote_not_found"
  | "missing_source"
  | "fabricated"
  | "superseded";

/** Six-state evidence model. Maps from the existing 4-state claim status on read. */
export type EvidenceStatus =
  | "supported"
  | "contradicted"
  | "insufficient"
  | "conflict"
  | "unavailable"
  | "superseded";

export interface GroundingCheckItem {
  id: string;
  claim: string;
  evidenceId?: string;
  sourceFile?: string;
  excerpt?: string;
  verdict: GroundingVerdict;
  confidence?: number;
  relation?: "supports" | "contradicts" | "says_nothing" | "consistent" | "contradictory" | "unaddressed";
  autoAccepted: boolean;
  notes?: string;
}

export interface GroundingPreflightSummary {
  nodeId: string;
  totalChecked: number;
  verifiedCount: number;
  flaggedCount: number;
  items: GroundingCheckItem[];
  preflightReceiptPath?: string;
}

export interface JevReceipt {
  schemaVersion: 1;
  receiptId: string;
  taskType: "grounding" | "routing" | "cta_consistency" | "custom";
  nodeId?: string;
  model: string;
  policyVersion: string;
  questionVersion: string;
  subjectHash?: string;
  evidenceHash?: string;
  stateHash: string;
  durationMs: number;
  createdAt: string;
  status: "ok" | "uncertain" | "unavailable" | "malformed" | "budget_limited" | "canceled";
  cached: boolean;
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** True when the SDK omitted usage; spend must use estimatedInputTokens, never treat as zero. */
    unknown?: boolean;
  };
  retries: number;
  /** Actual HTTP/SDK attempts for this receipt. 0 means no network (cache or reservation denial). */
  transportAttempts?: number;
  estimatedInputTokens?: number;
  answers: Record<string, unknown>;
  fallbackReason?: string;
}

export type JevTransport = (input: string, init?: RequestInit) => Promise<Response>;
