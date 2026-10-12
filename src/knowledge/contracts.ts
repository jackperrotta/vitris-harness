/** Typed knowledge records. A source, a requirement, a lesson, and a business fact are not interchangeable. */

export const KNOWLEDGE_RELEASE = "2026-09-22";
export const LAUNCH_POLICY_ID = "vitris-launch-2026-09-22";

export type SourceKind =
  | "standard"
  | "official-platform"
  | "research-usability"
  | "inspected-example"
  | "original-teaching"
  | "project-policy";

export type ReviewStatus = "live-checked" | "cited-not-rechecked";

export type KnowledgeSource = {
  id: string;
  publisher: string;
  title: string;
  url: string;
  sourceKind: SourceKind;
  versionDate?: string;
  lastReviewed: string | null;
  reviewStatus: ReviewStatus;
  reviewOwner: string;
  sectionAnchors: string[];
  summary: string;
  summarySha256: string;
  reuseNotes: string;
  supersedes?: string[];
};

export type AuthorityClass = "standard" | "official-platform" | "research-heuristic" | "project-policy" | "teaching";

export type CoverageStatus = "documented" | "verifier-implemented" | "fixture-tested" | "pilot-validated";

export type SeverityPolicy = "blocker" | "warning" | "manual-pending";

export type KnowledgeRequirement = {
  id: string;
  version: number;
  domains: string[];
  title: string;
  instruction: string;
  rationale: string;
  authorityIds: string[];
  authorityClass: AuthorityClass;
  applicability: string;
  stages: string[];
  verificationMethod: string;
  verifierId: string | null;
  severityPolicy: SeverityPolicy;
  exceptions: string[];
  repairOwner: string;
  implementationStatus: CoverageStatus;
  widget?: string;
};

export type LessonAlternative = {
  id: string;
  summary: string;
};

export type LessonExtension = {
  id: string;
  version: number;
  evidenceClass: "original-synthetic" | "inspected-reference";
  uncertainty: string;
  requirementIds: string[];
  alternatives: LessonAlternative[];
  inspection: string;
};

export type ReplacementRecord = {
  id: string;
  fromVersion: number;
  toVersion: number;
  note: string;
};

export type AssetProvenance = {
  id: string;
  path: string;
  creator: string;
  license: string;
  acquired: string;
  sha256: string;
  origin: "generated" | "photographed" | "diagrammatic" | "unknown";
  permittedUses: Array<"teaching" | "production">;
};

export type FindingStatus = "pass" | "fail" | "warning" | "unknown" | "not-applicable" | "tool-error" | "stale" | "waived";

export type QualityFinding = {
  id: string;
  requirementId: string;
  domain: string;
  severity: "serious" | "warning" | "note";
  confidence: "confirmed" | "suspected" | "unknown";
  status: FindingStatus;
  page?: string;
  component?: string;
  evidence: string;
  verifier: string;
  verifierVersion: string;
  sourceHash?: string;
  buildHash?: string;
  policyHash?: string;
  knowledgeHash?: string;
  repairOwner: string;
  suggestedRepair?: string;
  verifiedAt: string;
  applicability?: string;
};

export type LaunchOverride = {
  findingId: string;
  buildHash: string;
  policyHash: string;
  reason: string;
  scope: string;
};

export type LaunchEvidence = {
  trusted: boolean;
  buildHash: string;
  policyHash: string;
  knowledgeRelease: string;
  browserVerifier: "ok" | "unavailable" | "stale";
  findings: QualityFinding[];
  overrides?: LaunchOverride[];
  manualCoverage: "pending" | "recorded";
};
