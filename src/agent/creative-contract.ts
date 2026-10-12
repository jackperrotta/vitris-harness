/** Site-local creative records. Validation deliberately rejects persuasive prose without evidence links. */
export type CreativeSourceKind = "observed" | "operator" | "hypothesis" | "measured";
export type CreativeLink = {
  objective: string;
  visitorTask: string;
  evidenceIds: string[];
  hypothesis: string;
  observableOutcome: string;
};
export type CreativeBrief = {
  schemaVersion: 1;
  audience: string;
  goal: string;
  goalKind: "lead" | "discovery" | "trust" | "recruitment" | "self_service" | "information" | "other";
  differentiator: string;
  strongestProof: string;
  mediaOpportunities: string[];
  constraints: string[];
  uncertainties: string[];
  emotionalCharacter: string;
  links: CreativeLink[];
};
export type CreativeCandidate = {
  schemaVersion: 1;
  id: string;
  centralIdea: string;
  experienceHypothesis: string;
  hierarchy: string;
  narrative: string;
  composition: string;
  imagery: string;
  typography: string;
  interaction: string;
  evidenceIds: string[];
  judgmentTask: string;
  risks: string[];
};
export type CreativeFinding = {
  schemaVersion: 1;
  candidateId: string;
  source: CreativeSourceKind;
  page: string;
  viewport: number;
  state: string;
  section: string;
  observation: string;
  hypothesis: string;
  expectedImprovement: string;
  evidenceIds: string[];
};
export type CreativeDecision = {
  schemaVersion: 1;
  selectedCandidateId: string;
  candidateRevision: string;
  observations: string[];
  tradeoffs: string[];
  counterarguments: string[];
  identityInvariants: string[];
  confidenceLimitations: string[];
  rejectedCandidateIds: string[];
  evidenceIds: string[];
  action?: "select" | "revise" | "retire" | "challenge";
  reason?: string;
  revisionPlan?: CreativeRevisionPlan;
  challengerCandidateId?: string;
};
export type CreativeRevisionPlan = {
  objective: string;
  findingIndexes: number[];
  targets: string[];
  skillIds: string[];
  evidenceIds: string[];
  acceptance: string[];
};
export type CreativeExperiment = {
  schemaVersion: 1;
  sourceHash: string;
  profile: "creative-v1";
  baseline: { elapsedMs: number | null; measuredTokens: number | null; coverage: string };
  limits: { iterations: number; durationMs: number; tokens: number | null };
  outcomes: { technical: string; factual: string; visual: string; distinctiveness: string; businessFit: string; visitorTask: string; humanPreference: "unlabeled" | "labeled" };
};

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(nonempty);
function fields(value: Record<string, unknown>, names: string[], errors: string[]): void {
  for (const name of names) if (!nonempty(value[name])) errors.push(`Missing ${name}`);
}
export function validateCreativeBrief(value: unknown): string[] {
  if (!object(value)) return ["Creative brief must be an object"];
  const errors: string[] = [];
  if (value.schemaVersion !== 1) errors.push("Unsupported creative brief version");
  fields(value, ["audience", "goal", "differentiator", "strongestProof", "emotionalCharacter"], errors);
  if (!["lead", "discovery", "trust", "recruitment", "self_service", "information", "other"].includes(String(value.goalKind))) errors.push("Invalid goalKind");
  for (const key of ["mediaOpportunities", "constraints", "uncertainties"]) if (!strings(value[key])) errors.push(`Invalid ${key}`);
  if (!Array.isArray(value.links) || !value.links.length) errors.push("At least one business-to-outcome link is required");
  else for (const [i, item] of value.links.entries()) {
    if (!object(item)) { errors.push(`Invalid link ${i}`); continue; }
    fields(item, ["objective", "visitorTask", "hypothesis", "observableOutcome"], errors);
    if (!strings(item.evidenceIds) || !item.evidenceIds.length) errors.push(`Link ${i} needs evidenceIds`);
  }
  return errors;
}
export function validateCreativeCandidates(value: unknown, evidenceIds: Set<string>): string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3) return ["Two or three candidates are required"];
  const errors: string[] = [], ids = new Set<string>(), hypotheses = new Set<string>(), ideas = new Set<string>(), expressions = new Set<string>();
  for (const [i, item] of value.entries()) {
    if (!object(item)) { errors.push(`Invalid candidate ${i}`); continue; }
    if (item.schemaVersion !== 1) errors.push(`Candidate ${i} version unsupported`);
    fields(item, ["id", "centralIdea", "experienceHypothesis", "hierarchy", "narrative", "composition", "imagery", "typography", "interaction", "judgmentTask"], errors);
    if (nonempty(item.id)) {
      if (!/^[a-z][a-z0-9-]*$/.test(item.id)) errors.push(`Invalid candidate ID ${item.id}`);
      if (ids.has(item.id)) errors.push(`Duplicate candidate ${item.id}`);
      ids.add(item.id);
    }
    if (nonempty(item.experienceHypothesis)) {
      const key = item.experienceHypothesis.trim().toLowerCase();
      if (hypotheses.has(key)) errors.push("Candidates need different experience hypotheses");
      hypotheses.add(key);
    }
    if (nonempty(item.centralIdea)) {
      const key = item.centralIdea.trim().toLowerCase();
      if (ideas.has(key)) errors.push("Candidates need different central ideas");
      ideas.add(key);
    }
    const expression = ["hierarchy", "narrative", "composition", "imagery", "typography", "interaction"].map(key => String(item[key] || "").trim().toLowerCase()).join("|");
    if (expressions.has(expression)) errors.push("Candidates repeat the same structured expression");
    expressions.add(expression);
    if (!strings(item.evidenceIds) || !item.evidenceIds.length) errors.push(`Candidate ${i} needs evidenceIds`);
    else for (const id of item.evidenceIds) if (!evidenceIds.has(id)) errors.push(`Unknown evidence ${id}`);
    if (!strings(item.risks)) errors.push(`Candidate ${i} risks invalid`);
  }
  return errors;
}
export function validateCreativeDecision(value: unknown, candidates: CreativeCandidate[], revisions: Record<string, string>, evidenceIds: Set<string>): string[] {
  if (!object(value)) return ["Decision must be an object"];
  const errors: string[] = [];
  if (value.schemaVersion !== 1) errors.push("Unsupported decision version");
  const selected = String(value.selectedCandidateId || "");
  if (!candidates.some(c => c.id === selected)) errors.push("Decision selects unknown candidate");
  if (!nonempty(value.candidateRevision) || value.candidateRevision !== revisions[selected]) errors.push("Decision revision does not match rendered candidate");
  for (const key of ["observations", "tradeoffs", "counterarguments", "identityInvariants", "confidenceLimitations", "rejectedCandidateIds", "evidenceIds"]) if (!strings(value[key])) errors.push(`Invalid ${key}`);
  if (strings(value.observations) && !value.observations.length) errors.push("Decision needs observations");
  if (strings(value.counterarguments) && !value.counterarguments.length) errors.push("Decision needs counterarguments");
  if (strings(value.evidenceIds)) for (const id of value.evidenceIds) if (!evidenceIds.has(id)) errors.push(`Unknown decision evidence ${id}`);
  if (strings(value.rejectedCandidateIds)) for (const id of value.rejectedCandidateIds) if (!candidates.some(c => c.id === id) || id === selected) errors.push(`Invalid rejected candidate ${id}`);
  if (value.action !== undefined && !["select", "revise", "retire", "challenge"].includes(String(value.action))) errors.push("Unknown creative decision action");
  if (value.action && !nonempty(value.reason)) errors.push("Creative action needs a reason");
  if (value.action === "revise") errors.push(...validateCreativeRevisionPlan(value.revisionPlan, evidenceIds));
  if (value.action === "challenge" && (!candidates.some(c => c.id === value.challengerCandidateId) || value.challengerCandidateId === selected)) errors.push("Challenge needs a different known candidate");
  return errors;
}

export function validateCreativeRevisionPlan(value: unknown, evidenceIds: Set<string>, findingCount?: number): string[] {
  if (!object(value)) return ["Revision needs an objective and acceptance plan"];
  const errors: string[] = [];
  fields(value, ["objective"], errors);
  for (const key of ["targets", "skillIds", "evidenceIds", "acceptance"]) if (!strings(value[key]) || !value[key].length) errors.push(`Revision needs ${key}`);
  if (!Array.isArray(value.findingIndexes) || !value.findingIndexes.length || value.findingIndexes.length > 3 || value.findingIndexes.some(i => !Number.isSafeInteger(i) || Number(i) < 0 || findingCount !== undefined && Number(i) >= findingCount)) errors.push("Revision must address one to three existing findings");
  if (strings(value.evidenceIds)) for (const id of value.evidenceIds) if (!evidenceIds.has(id)) errors.push(`Revision references unknown evidence ${id}`);
  return errors;
}

export type CreativeFinalAudit = {
  schemaVersion: 1;
  sourceRevision: string;
  identity: { invariant: string; outcome: "preserved" | "adapted"; observation: string; evidenceIds: string[] }[];
  journeys: { task: string; outcome: "observed" | "unverified"; observation: string; evidenceIds: string[] }[];
  limitations: string[];
  blockers: string[];
  revisionPlan?: CreativeRevisionPlan;
};
export function validateCreativeFinalAudit(value: unknown, revision: string, invariants: string[], evidenceIds: Set<string>, visitorTasks?: string[]): string[] {
  if (!object(value) || value.schemaVersion !== 1) return ["Final creative audit must use schemaVersion 1"];
  const errors: string[] = [];
  if (value.sourceRevision !== revision) errors.push("Final audit source revision is stale");
  const observed: string[] = [];
  if (!Array.isArray(value.identity)) errors.push("Final audit needs identity observations");
  else for (const item of value.identity) {
    if (!object(item) || !nonempty(item.invariant) || !nonempty(item.observation) || !["preserved", "adapted"].includes(String(item.outcome))) { errors.push("Invalid identity observation"); continue; }
    observed.push(item.invariant);
    if (!strings(item.evidenceIds) || !item.evidenceIds.some(id => id.startsWith("render:"))) errors.push("Identity observation needs rendered evidence");
    else for (const id of item.evidenceIds) if (!evidenceIds.has(id)) errors.push(`Unknown final evidence ${id}`);
  }
  if (observed.length !== invariants.length || new Set(observed).size !== observed.length || invariants.some(i => !observed.includes(i))) errors.push("Observe every selected identity invariant exactly once");
  if (!Array.isArray(value.journeys) || !value.journeys.length) errors.push("Final audit needs visitor task observations");
  else for (const item of value.journeys) {
    if (!object(item) || !nonempty(item.task) || !nonempty(item.observation) || !["observed", "unverified"].includes(String(item.outcome))) { errors.push("Invalid visitor task observation"); continue; }
    if (!strings(item.evidenceIds) || item.outcome === "observed" && !item.evidenceIds.length) errors.push("Observed journey needs evidence");
    else for (const id of item.evidenceIds) if (!evidenceIds.has(id)) errors.push(`Unknown journey evidence ${id}`);
  }
  if (visitorTasks && Array.isArray(value.journeys)) {
    const tasks = value.journeys.filter(object).map(item => item.task);
    if (tasks.length !== visitorTasks.length || new Set(tasks).size !== tasks.length || visitorTasks.some(task => !tasks.includes(task))) errors.push("Observe every business brief visitor task exactly once");
  }
  if (!strings(value.limitations) || !strings(value.blockers)) errors.push("Final audit needs limitations and blockers arrays");
  else if (value.blockers.length) {
    if (value.revisionPlan) errors.push(...validateCreativeRevisionPlan(value.revisionPlan, evidenceIds, value.blockers.length));
    else errors.push(...value.blockers.map(item => `Unresolved final blocker: ${item}`));
  } else if (value.revisionPlan) errors.push("Final revision needs a located blocker");
  return errors;
}
export function validateCreativeFindings(value: unknown, candidates: CreativeCandidate[], evidenceIds: Set<string>): string[] {
  if (!Array.isArray(value) || !value.length) return ["At least one located finding is required"];
  const errors: string[] = [];
  for (const [i, item] of value.entries()) {
    if (!object(item) || item.schemaVersion !== 1) { errors.push(`Finding ${i} has unsupported schema`); continue; }
    if (!candidates.some(c => c.id === item.candidateId)) errors.push(`Finding ${i} names unknown candidate`);
    if (!["observed", "operator", "hypothesis", "measured"].includes(String(item.source))) errors.push(`Finding ${i} source invalid`);
    fields(item, ["page", "state", "section", "observation", "hypothesis", "expectedImprovement"], errors);
    if (!Number.isSafeInteger(item.viewport) || Number(item.viewport) < 200) errors.push(`Finding ${i} viewport invalid`);
    if (!strings(item.evidenceIds)) errors.push(`Finding ${i} evidenceIds invalid`);
    else for (const id of item.evidenceIds) if (!evidenceIds.has(id)) errors.push(`Finding ${i} unknown evidence ${id}`);
    if (item.source === "observed" && (!strings(item.evidenceIds) || !item.evidenceIds.some(id => id.startsWith("render:")))) errors.push(`Finding ${i} observed pixels need a render evidence ID`);
  }
  return errors;
}
