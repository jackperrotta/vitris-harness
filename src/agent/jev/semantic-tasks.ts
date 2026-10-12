import { createHash } from "node:crypto";

export const SEMANTIC_TASKS = [
  "rank-lessons",
  "unanswered-questions",
  "fact-copy-contradiction",
  "cta-fit",
  "unexplained-repetition",
  "direction-continuity",
] as const;

export type SemanticTask = (typeof SEMANTIC_TASKS)[number];

export type SemanticReceipt = {
  task: SemanticTask;
  candidateId?: string;
  rank?: number;
  confidence?: number;
  mode: "off" | "shadow" | "assist";
  state: "off" | "ok" | "unknown" | "unavailable" | "malformed";
  citedEvidence: string[];
  answer: string;
  latencyMs: number;
  calls: number;
  cacheHits: number;
  tokenUsage: { input?: number; output?: number } | "unavailable";
  fallback: string | null;
  cacheKey: string;
  cannotWaive: true;
  followUps: 0;
};

export type SemanticCache = Map<string, { text: string; tokenUsage?: { input?: number; output?: number } }>;

export function semanticCacheKey(input: {
  task: SemanticTask;
  model: string;
  content: unknown;
  knowledgeRelease: string;
  policyId: string;
}): string {
  return createHash("sha256").update(JSON.stringify({
    task: input.task,
    model: input.model,
    content: input.content,
    knowledgeRelease: input.knowledgeRelease,
    policyId: input.policyId,
  })).digest("hex");
}

function unknownReceipt(partial: Omit<SemanticReceipt, "cannotWaive" | "followUps">): SemanticReceipt {
  return { ...partial, cannotWaive: true, followUps: 0 };
}

export function interpretSemanticText(text: string, allowedEvidence: string[]): { state: "ok" | "unknown" | "malformed"; citedEvidence: string[]; answer: string } {
  let parsed: { answer?: unknown; citedEvidence?: unknown; unknown?: unknown };
  try {
    parsed = JSON.parse(text) as { answer?: unknown; citedEvidence?: unknown; unknown?: unknown };
  } catch {
    return { state: "malformed", citedEvidence: [], answer: "" };
  }
  if (parsed.unknown === true || parsed.answer === "unknown") {
    return { state: "unknown", citedEvidence: [], answer: "unknown" };
  }
  const cited = Array.isArray(parsed.citedEvidence) ? parsed.citedEvidence.filter((id): id is string => typeof id === "string") : [];
  const known = cited.filter(id => allowedEvidence.includes(id));
  if (!known.length || typeof parsed.answer !== "string" || !parsed.answer.trim()) {
    return { state: "unknown", citedEvidence: [], answer: "unknown" };
  }
  return { state: "ok", citedEvidence: known, answer: parsed.answer };
}

export async function runSemanticTask(input: {
  task: SemanticTask;
  mode: "off" | "shadow" | "assist";
  model: string;
  content: unknown;
  knowledgeRelease: string;
  policyId: string;
  evidenceIds: string[];
  cache: SemanticCache;
  unavailableReason?: string;
  invoke?: () => Promise<{ text: string; latencyMs: number; cached?: boolean; tokenUsage?: { input?: number; output?: number } } | { error: string; latencyMs?: number }>;
}): Promise<SemanticReceipt> {
  const cacheKey = semanticCacheKey(input);
  if (input.mode === "off") {
    return unknownReceipt({
      task: input.task, mode: "off", state: "off", citedEvidence: [], answer: "",
      latencyMs: 0, calls: 0, cacheHits: 0, tokenUsage: "unavailable", fallback: null, cacheKey,
    });
  }
  const cached = input.cache.get(cacheKey);
  if (cached) {
    const interpreted = interpretSemanticText(cached.text, input.evidenceIds);
    return unknownReceipt({
      task: input.task, mode: input.mode, state: interpreted.state, citedEvidence: interpreted.citedEvidence,
      answer: interpreted.answer, latencyMs: 0, calls: 0, cacheHits: 1, tokenUsage: cached.tokenUsage || "unavailable",
      fallback: null, cacheKey,
    });
  }
  if (!input.invoke) {
    return unknownReceipt({
      task: input.task, mode: input.mode, state: "unavailable", citedEvidence: [], answer: "unknown",
      latencyMs: 0, calls: 0, cacheHits: 0, tokenUsage: "unavailable",
      fallback: input.unavailableReason || "No provider credentials or client. The active agent continues.", cacheKey,
    });
  }
  const started = Date.now();
  let result: Awaited<ReturnType<NonNullable<typeof input.invoke>>>;
  try { result = await input.invoke(); }
  catch (error) { result = { error: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started }; }
  const latencyMs = "latencyMs" in result && result.latencyMs != null ? result.latencyMs : Date.now() - started;
  if ("error" in result) {
    return unknownReceipt({
      task: input.task, mode: input.mode, state: "unavailable", citedEvidence: [], answer: "unknown",
      latencyMs, calls: 1, cacheHits: 0, tokenUsage: "unavailable", fallback: result.error, cacheKey,
    });
  }
  input.cache.set(cacheKey, { text: result.text, tokenUsage: result.tokenUsage });
  const interpreted = interpretSemanticText(result.text, input.evidenceIds);
  return unknownReceipt({
    task: input.task, mode: input.mode, state: interpreted.state, citedEvidence: interpreted.citedEvidence,
    answer: interpreted.answer, latencyMs, calls: result.cached ? 0 : 1, cacheHits: result.cached ? 1 : 0,
    tokenUsage: result.tokenUsage || "unavailable", fallback: interpreted.state === "malformed" ? "Malformed provider output was ignored." : null,
    cacheKey,
  });
}

/** A semantic suggestion cannot change a confirmed serious failure into a pass. */
export function applySemanticAdvice(finding: { status: string; severity: string }, advice: { status?: string }): { status: string; waived: false; ignored: boolean } {
  if (finding.status === "fail" && finding.severity === "serious" && advice.status === "pass") {
    return { status: finding.status, waived: false, ignored: true };
  }
  return { status: finding.status, waived: false, ignored: false };
}

export function semanticAssistNote(capabilities: {
  lessonRanking?: string;
  visitorQuestionCheck?: string;
  factContradictionCheck?: string;
  ctaFitCheck?: string;
  repetitionExplanationCheck?: string;
  directionContinuityCheck?: string;
}): string {
  const active = [
    capabilities.lessonRanking,
    capabilities.visitorQuestionCheck,
    capabilities.factContradictionCheck,
    capabilities.ctaFitCheck,
    capabilities.repetitionExplanationCheck,
    capabilities.directionContinuityCheck,
  ].some(mode => mode === "assist");
  if (!active) return "";
  return [
    "## Jev semantic assistance",
    "Advisory only. Cite evidence ids or answer unknown. This cannot waive a mandatory launch blocker or certify accessibility.",
  ].join("\n");
}

export function assistanceSavedEffort(input: { calls: number; cacheHits: number; extraRepairs: number | null }): "saved" | "extra-repair" | "unknown" {
  if (input.extraRepairs == null) return "unknown";
  if (input.extraRepairs > 0) return "extra-repair";
  if (input.calls + input.cacheHits > 0 && input.extraRepairs === 0) return "saved";
  return "unknown";
}
