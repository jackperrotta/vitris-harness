import type { JevClient } from "./client.ts";
import { partitionBatchItems, executeBatches } from "./batching.ts";
import { makeCreativeDimensionQuestion, makeDirectionDecisionQuestion, makeMediaRelevanceQuestion, makeCompositionRepetitionQuestion, DIRECTION_DECISION_CHECKS, type CreativeDimension } from "./questions.ts";
import type { Storyboard } from "../artifacts.ts";

export const CREATIVE_DIMENSIONS: CreativeDimension[] = [
  "audience_fit",
  "offer_clarity",
  "evidence_use",
  "visitor_job_coverage",
  "distinctive_relevance",
  "feasibility",
];

export const DEFAULT_CREATIVE_WEIGHTS: Record<CreativeDimension, number> = {
  audience_fit: 1,
  offer_clarity: 1,
  evidence_use: 1,
  visitor_job_coverage: 1,
  distinctive_relevance: 1,
  feasibility: 0.8,
};

export type ObservationState = "observed" | "insufficient_evidence" | "unavailable" | "invalid";

export interface DimensionObservation {
  state: ObservationState;
  score?: number;
  probabilities?: Record<string, number>;
  reason?: string;
}

export interface CreativeCandidateScore {
  id: string;
  proposal: string;
  dimensions: Record<string, DimensionObservation>;
  coverage: { observed: number; total: number };
  status: "complete" | "partial" | "unavailable";
  combined?: number;
  factualGateFailed: boolean;
  retrievalMethod: "jev_score";
}

export async function scoreCreativeCandidates(opts: {
  client: JevClient;
  nodeId: string;
  context: string;
  candidates: Array<{ id: string; proposal: string }>;
  factualGate?: (proposal: string) => boolean;
  weights?: Partial<Record<CreativeDimension, number>>;
  signal?: AbortSignal;
}): Promise<CreativeCandidateScore[]> {
  const weights = { ...DEFAULT_CREATIVE_WEIGHTS, ...opts.weights };
  const items = [];
  for (const c of opts.candidates) {
    for (const dim of CREATIVE_DIMENSIONS) {
      items.push({
        id: `${c.id}_${dim}`,
        taskType: "custom" as const,
        questionKey: `${c.id}_${dim}`,
        question: makeCreativeDimensionQuestion(dim, c.proposal, opts.context),
        claimId: c.id,
        claim: c.proposal,
        metadata: { dim },
      });
    }
  }
  const { partitions } = partitionBatchItems(items);
  let executed: { answers: Record<string, unknown> } = { answers: {} };
  if (partitions.length) {
    try {
      executed = await executeBatches({ client: opts.client, partitions, signal: opts.signal, nodeId: opts.nodeId });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return opts.candidates.map(c => ({
        id: c.id,
        proposal: c.proposal,
        dimensions: Object.fromEntries(CREATIVE_DIMENSIONS.map(dim => [dim, { state: "unavailable" as const, reason }])),
        coverage: { observed: 0, total: CREATIVE_DIMENSIONS.length },
        status: "unavailable" as const,
        combined: opts.factualGate && !opts.factualGate(c.proposal) ? 0 : undefined,
        factualGateFailed: opts.factualGate ? !opts.factualGate(c.proposal) : false,
        retrievalMethod: "jev_score" as const,
      }));
    }
  }

  return opts.candidates.map(c => {
    const dimensions: CreativeCandidateScore["dimensions"] = {};
    let weighted = 0;
    let weightSum = 0;
    let observed = 0;
    for (const dim of CREATIVE_DIMENSIONS) {
      const ans = executed.answers[`${c.id}_${dim}`] as { score?: number; probabilities?: Record<string, number> } | undefined;
      if (!ans) {
        dimensions[dim] = { state: "unavailable", reason: "No answer returned for this dimension." };
        continue;
      }
      if (typeof ans.score !== "number" || !Number.isFinite(ans.score)) {
        dimensions[dim] = { state: "invalid", reason: "Answer did not include a finite score." };
        continue;
      }
      observed += 1;
      dimensions[dim] = { state: "observed", score: ans.score, probabilities: ans.probabilities };
      weighted += ans.score * (weights[dim] || 0);
      weightSum += weights[dim] || 0;
    }
    const factualGateFailed = opts.factualGate ? !opts.factualGate(c.proposal) : false;
    const status = observed === 0 ? "unavailable" : observed === CREATIVE_DIMENSIONS.length ? "complete" : "partial";
    return {
      id: c.id,
      proposal: c.proposal,
      dimensions,
      coverage: { observed, total: CREATIVE_DIMENSIONS.length },
      status,
      combined: factualGateFailed ? 0 : (observed ? weighted / weightSum : undefined),
      factualGateFailed,
      retrievalMethod: "jev_score" as const,
    };
  });
}

export async function scoreMediaFitFromText(opts: {
  client: JevClient;
  nodeId: string;
  sectionText: string;
  observations: Array<{ id: string; caption: string; provenance: string; agentObservation: string }>;
  signal?: AbortSignal;
}): Promise<Array<{ id: string; state: "observed" | "unavailable"; score?: number; note: string }>> {
  const items = opts.observations.map(o => ({
    id: o.id,
    taskType: "custom" as const,
    questionKey: o.id,
    question: makeMediaRelevanceQuestion(
      opts.sectionText,
      `Provenance: ${o.provenance}\nCaption: ${o.caption}\nAgent visual observation (Jev has not seen pixels): ${o.agentObservation}`
    ),
    claimId: o.id,
    claim: o.caption,
  }));
  const { partitions } = partitionBatchItems(items);
  const executed = partitions.length
    ? await executeBatches({ client: opts.client, partitions, signal: opts.signal, nodeId: opts.nodeId })
    : { answers: {} as Record<string, unknown> };
  return opts.observations.map(o => {
    const ans = executed.answers[o.id] as { score?: number } | undefined;
    const observed = typeof ans?.score === "number" && Number.isFinite(ans.score);
    return {
      id: o.id,
      state: observed ? "observed" as const : "unavailable" as const,
      score: observed ? ans!.score : undefined,
      note: observed
        ? "Scored from supplied text observations only; screenshot/visual gates remain with the agent."
        : "No usable score returned. This is unavailable, not a measured low fit.",
    };
  });
}

export async function scoreDirectionDecisions(opts: {
  client: JevClient;
  nodeId: string;
  context: string;
  proposal: string;
  signal?: AbortSignal;
}): Promise<Array<{ id: string; state: ObservationState; choice?: string; reason?: string }>> {
  const items = DIRECTION_DECISION_CHECKS.map(id => ({
    id,
    taskType: "custom" as const,
    questionKey: id,
    question: makeDirectionDecisionQuestion(id, opts.proposal, opts.context),
    claimId: id,
    claim: opts.proposal,
  }));
  try {
    const { partitions } = partitionBatchItems(items);
    const executed = partitions.length
      ? await executeBatches({ client: opts.client, partitions, signal: opts.signal, nodeId: opts.nodeId })
      : { answers: {} as Record<string, unknown> };
    return DIRECTION_DECISION_CHECKS.map(id => {
      const ans = executed.answers[id] as { choice?: string } | undefined;
      if (!ans?.choice) return { id, state: "unavailable" as const, reason: "No choice returned." };
      if (ans.choice === "says_nothing") return { id, state: "insufficient_evidence" as const, choice: ans.choice };
      return { id, state: "observed" as const, choice: ans.choice };
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return DIRECTION_DECISION_CHECKS.map(id => ({ id, state: "unavailable" as const, reason }));
  }
}

export type CompositionRepetitionFinding = {
  id: string;
  page: string;
  state: "observed" | "unavailable" | "insufficient_evidence" | "invalid";
  choice?: string;
  evidence: string;
  uncertainty?: string;
};

export async function scoreCompositionRepetition(opts: {
  client: JevClient;
  nodeId: string;
  story: Storyboard;
  mediaSummary?: string;
  signal?: AbortSignal;
}): Promise<CompositionRepetitionFinding[]> {
  const pages = (opts.story.pages || []).filter(page => (page.sections || []).length >= 3);
  const items = pages.map(page => {
    const sections = page.sections || [];
    const evidence = sections.map((section, index) => {
      const neighbors = [sections[index - 1]?.purpose, sections[index + 1]?.purpose].filter(Boolean).join(" | ");
      return [
        `${section.id}: job=${section.question || section.role || ""}`,
        `purpose=${section.purpose || section.message || ""}`,
        `emphasis=${section.emphasis || ""}`,
        `layout=${section.layoutFamily || section.composition || ""}`,
        `media=${(section.media || []).join(",") || "none"}`,
        `repetition=${section.repetitionRationale || "none"}`,
        neighbors ? `neighbors=${neighbors}` : "",
      ].filter(Boolean).join("; ");
    }).join("\n");
    const context = [`Page ${page.path}`, page.visitorOutcome ? `Outcome: ${page.visitorOutcome}` : "", evidence, opts.mediaSummary || ""].filter(Boolean).join("\n");
    return {
      id: `composition:${page.path}`,
      taskType: "custom" as const,
      questionKey: `composition:${page.path}`,
      question: makeCompositionRepetitionQuestion(page.path, context),
      claimId: page.path,
      claim: context,
      evidence,
    };
  });
  if (!items.length) {
    return [{ id: "composition:none", page: "", state: "insufficient_evidence", evidence: "No page has three or more sections to judge repetition.", uncertainty: "Deterministic preflight still applies." }];
  }
  try {
    const { partitions } = partitionBatchItems(items);
    const executed = partitions.length
      ? await executeBatches({ client: opts.client, partitions, signal: opts.signal, nodeId: opts.nodeId })
      : { answers: {} as Record<string, unknown> };
    return items.map(item => {
      const ans = executed.answers[item.id] as { choice?: string } | undefined;
      if (!ans?.choice) return { id: item.id, page: item.claimId, state: "unavailable" as const, evidence: item.evidence, uncertainty: "No choice returned. This is unavailable, not a measured defect." };
      if (!["serves_narrative", "unrelated_repetition", "insufficient_evidence"].includes(ans.choice)) {
        return { id: item.id, page: item.claimId, state: "invalid" as const, choice: ans.choice, evidence: item.evidence, uncertainty: "Response was not one of the allowed judgments." };
      }
      if (ans.choice === "insufficient_evidence") {
        return { id: item.id, page: item.claimId, state: "insufficient_evidence" as const, choice: ans.choice, evidence: item.evidence };
      }
      return { id: item.id, page: item.claimId, state: "observed" as const, choice: ans.choice, evidence: item.evidence };
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return items.map(item => ({ id: item.id, page: item.claimId, state: "unavailable" as const, evidence: item.evidence, uncertainty: reason }));
  }
}
