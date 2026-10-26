/** Browser-safe public records. No filesystem, Worker, or provider imports belong here. */
export const ENGINE_CONTRACT_VERSION = 1 as const;
export type ChangeFacet = "business" | "copy" | "pages" | "direction" | "media";
export type ChangeOrigin = "operator" | "agent" | "editor" | "hosted";
export type CheckOutcome = "pass" | "fail" | "unevaluated";

export interface SiteIdentity {
  schemaVersion: 1;
  siteId: string;
  sourceFormatVersion: number;
  harness: { name: "@tryvitris/website-harness" | "@tryvitris/harness" | "@vitris/harness"; version: string };
  capabilities: string[];
}

export interface SourceRevision {
  schemaVersion: 1;
  digest: string;
  inputs: Array<{ path: string; sha256: string; bytes: number }>;
  gitHead?: string;
}

export interface ChangeRequestRecord {
  schemaVersion: 1;
  id: string;
  instruction: string;
  origin: ChangeOrigin;
  baseRevision: string;
  requestedScopes: ChangeFacet[];
  explicitPreferences: Array<{ intent: "positive" | "negative" | "preserve"; text: string; target?: string }>;
  evidence: string[];
}

export interface OutcomeAssertion {
  id: string;
  kind: "exact_text" | "absence" | "visual_review" | "semantic_review" | "interaction";
  target: string;
  expected?: string;
}

export interface ChangePlanRecord {
  schemaVersion: 1;
  requestId: string;
  baseRevision: string;
  targets: string[];
  files: string[];
  facets: ChangeFacet[];
  preserve: string[];
  acceptanceCriteria: OutcomeAssertion[];
  requiredChecks: string[];
  assumptions: string[];
  evidence: string[];
  proposedBy: "active_agent" | "operator" | "editor";
}

export interface VerificationReceiptRecord {
  schemaVersion: 1;
  subjectRevision: string;
  buildDigest: string;
  checks: Array<{ id: string; version: string; outcome: CheckOutcome; evidence: string[] }>;
  reviewer: "machine" | "active_agent" | "independent_model" | "human";
  createdAt: string;
}

export interface ChangeResultRecord {
  schemaVersion: 1;
  requestId: string;
  beforeRevision: string;
  afterRevision: string;
  changedTargets: string[];
  changedFiles: string[];
  technical: CheckOutcome;
  fulfillment: CheckOutcome;
  design: CheckOutcome;
  unresolved: string[];
  previewDigest?: string;
  receipt?: VerificationReceiptRecord;
}

export interface ReleaseRecord {
  schemaVersion: 1;
  sourceRevision: string;
  buildDigest: string;
  compilerDigest: string;
  harnessVersion: string;
  policyId: string;
  environment: string;
  deploymentReceipt: string;
}

const object = (value: unknown, name: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
};
const string = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  return value;
};
export const assertRequestId = (value: unknown): string => {
  const id = string(value, "requestId");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) throw new Error("requestId must be a safe single path segment");
  return id;
};
const strings = (value: unknown, name: string): string[] => {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) throw new Error(`${name} must be an array of non-empty strings`);
  return value;
};
const oneOf = <T extends string>(value: unknown, name: string, options: readonly T[]): T => {
  if (!options.includes(value as T)) throw new Error(`${name} is invalid`);
  return value as T;
};
const version = (record: Record<string, unknown>, name: string) => {
  if (record.schemaVersion !== ENGINE_CONTRACT_VERSION) throw new Error(`${name} schemaVersion must be 1`);
};

export function parseSiteIdentity(value: unknown): SiteIdentity {
  const r = object(value, "site identity"); version(r, "site identity");
  const h = object(r.harness, "harness");
  const name = oneOf(h.name, "harness.name", ["@tryvitris/website-harness", "@tryvitris/harness", "@vitris/harness"] as const);
  if (!Number.isInteger(r.sourceFormatVersion) || Number(r.sourceFormatVersion) < 1) throw new Error("sourceFormatVersion must be positive");
  return { schemaVersion: 1, siteId: string(r.siteId, "siteId"), sourceFormatVersion: Number(r.sourceFormatVersion),
    harness: { name, version: string(h.version, "harness.version") }, capabilities: strings(r.capabilities, "capabilities") };
}

export function parseSourceRevision(value: unknown): SourceRevision {
  const r = object(value, "source revision"); version(r, "source revision");
  const digest = string(r.digest, "digest");
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("digest must be SHA-256");
  if (!Array.isArray(r.inputs)) throw new Error("inputs must be an array");
  const inputs = r.inputs.map((item, index) => {
    const i = object(item, `inputs[${index}]`);
    const sha256 = string(i.sha256, `inputs[${index}].sha256`);
    if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isInteger(i.bytes) || Number(i.bytes) < 0) throw new Error(`inputs[${index}] has invalid hash or size`);
    return { path: string(i.path, `inputs[${index}].path`), sha256, bytes: Number(i.bytes) };
  });
  return { schemaVersion: 1, digest, inputs, ...(r.gitHead === undefined ? {} : { gitHead: string(r.gitHead, "gitHead") }) };
}

export function parseChangeRequest(value: unknown): ChangeRequestRecord {
  const r = object(value, "change request"); version(r, "change request");
  const facets = ["business", "copy", "pages", "direction", "media"] as const;
  if (!Array.isArray(r.requestedScopes)) throw new Error("requestedScopes must be an array");
  if (!Array.isArray(r.explicitPreferences)) throw new Error("explicitPreferences must be an array");
  return { schemaVersion: 1, id: assertRequestId(r.id), instruction: string(r.instruction, "instruction"),
    origin: oneOf(r.origin, "origin", ["operator", "agent", "editor", "hosted"] as const),
    baseRevision: string(r.baseRevision, "baseRevision"),
    requestedScopes: r.requestedScopes.map((s, i) => oneOf(s, `requestedScopes[${i}]`, facets)),
    explicitPreferences: r.explicitPreferences.map((item, i) => { const p = object(item, `explicitPreferences[${i}]`); return {
      intent: oneOf(p.intent, "intent", ["positive", "negative", "preserve"] as const), text: string(p.text, "preference text"),
      ...(p.target === undefined ? {} : { target: string(p.target, "preference target") }),
    }; }), evidence: strings(r.evidence, "evidence") };
}

export function parseChangePlan(value: unknown): ChangePlanRecord {
  const r = object(value, "change plan"); version(r, "change plan");
  if (!Array.isArray(r.targets) || r.targets.length === 0 || !Array.isArray(r.files) || r.files.length === 0) throw new Error("plan targets and files must be non-empty");
  if (!Array.isArray(r.facets) || r.facets.length === 0) throw new Error("plan facets must be non-empty");
  if (!Array.isArray(r.acceptanceCriteria) || r.acceptanceCriteria.length === 0) throw new Error("acceptanceCriteria must be non-empty");
  if (!Array.isArray(r.requiredChecks) || r.requiredChecks.length === 0) throw new Error("requiredChecks must be non-empty");
  const facets = ["business", "copy", "pages", "direction", "media"] as const;
  const criteria = r.acceptanceCriteria.map((item, i) => { const a = object(item, `acceptanceCriteria[${i}]`); return {
    id: string(a.id, "criterion id"), kind: oneOf(a.kind, "criterion kind", ["exact_text", "absence", "visual_review", "semantic_review", "interaction"] as const),
    target: string(a.target, "criterion target"), ...(a.expected === undefined ? {} : { expected: string(a.expected, "expected") }),
  }; });
  if (new Set(criteria.map(c => c.id)).size !== criteria.length) throw new Error("acceptance criterion IDs must be unique");
  return { schemaVersion: 1, requestId: assertRequestId(r.requestId), baseRevision: string(r.baseRevision, "baseRevision"),
    targets: strings(r.targets, "targets"), files: strings(r.files, "files"),
    facets: r.facets.map((f, i) => oneOf(f, `facets[${i}]`, facets)), preserve: strings(r.preserve, "preserve"),
    acceptanceCriteria: criteria, requiredChecks: strings(r.requiredChecks, "requiredChecks"),
    assumptions: strings(r.assumptions, "assumptions"), evidence: strings(r.evidence, "evidence"),
    proposedBy: oneOf(r.proposedBy, "proposedBy", ["active_agent", "operator", "editor"] as const) };
}

export function parseVerificationReceipt(value: unknown): VerificationReceiptRecord {
  const r = object(value, "verification receipt"); version(r, "verification receipt");
  if (!Array.isArray(r.checks)) throw new Error("checks must be an array");
  return { schemaVersion: 1, subjectRevision: string(r.subjectRevision, "subjectRevision"), buildDigest: string(r.buildDigest, "buildDigest"),
    checks: r.checks.map((item, i) => { const c = object(item, `checks[${i}]`); return {
      id: string(c.id, "check id"), version: string(c.version, "check version"),
      outcome: oneOf(c.outcome, "check outcome", ["pass", "fail", "unevaluated"] as const), evidence: strings(c.evidence, "check evidence"),
    }; }), reviewer: oneOf(r.reviewer, "reviewer", ["machine", "active_agent", "independent_model", "human"] as const),
    createdAt: string(r.createdAt, "createdAt") };
}

export function parseChangeResult(value: unknown): ChangeResultRecord {
  const r = object(value, "change result"); version(r, "change result");
  const outcomes = ["pass", "fail", "unevaluated"] as const;
  return { schemaVersion: 1, requestId: string(r.requestId, "requestId"), beforeRevision: string(r.beforeRevision, "beforeRevision"),
    afterRevision: string(r.afterRevision, "afterRevision"), changedTargets: strings(r.changedTargets, "changedTargets"),
    changedFiles: strings(r.changedFiles, "changedFiles"), technical: oneOf(r.technical, "technical", outcomes),
    fulfillment: oneOf(r.fulfillment, "fulfillment", outcomes), design: oneOf(r.design, "design", outcomes),
    unresolved: strings(r.unresolved, "unresolved"), ...(r.previewDigest === undefined ? {} : { previewDigest: string(r.previewDigest, "previewDigest") }),
    ...(r.receipt === undefined ? {} : { receipt: parseVerificationReceipt(r.receipt) }) };
}

export function parseReleaseRecord(value: unknown): ReleaseRecord {
  const r = object(value, "release record"); version(r, "release record");
  return { schemaVersion: 1, sourceRevision: string(r.sourceRevision, "sourceRevision"), buildDigest: string(r.buildDigest, "buildDigest"),
    compilerDigest: string(r.compilerDigest, "compilerDigest"), harnessVersion: string(r.harnessVersion, "harnessVersion"),
    policyId: string(r.policyId, "policyId"), environment: string(r.environment, "environment"),
    deploymentReceipt: string(r.deploymentReceipt, "deploymentReceipt") };
}
