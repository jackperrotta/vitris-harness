import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { json, type Finding, type Review, type Storyboard } from "../artifacts.ts";
import { assessComposition, type CompositionFinding } from "../composition-preflight.ts";
import { kernelScriptCommand } from "../kernel-commands.ts";
import { reviewSubject } from "../evaluate.ts";
import type { AgentState, GraphNode, SkillGraph } from "../graph.ts";
import { recordAndEscalateFindings, toCriticSeverity, toStandardFinding, type StructuredCriticFinding } from "./critic-report.ts";
import { loadLatestQualityResult, type QualityFinding } from "./content-checks.ts";

export interface RepairPacket {
  nodeId: string;
  repairTarget: string;
  failedFindings: Finding[];
  allowedWrites: string[];
  preservationInvariants: string[];
  verificationCommand: string;
  contextSlice: string;
  obligationId?: string;
  findingId?: string;
}

/** Determines whether a review finding targets the author node or its writable files. */
export function isFindingApplicable(f: Finding, node: GraphNode, repairTarget: string, graph?: SkillGraph): boolean {
  if (!f.target || !f.target.trim()) {
    return true;
  }
  const target = f.target.trim();
  if (target === node.id || target === repairTarget) return true;

  // Resolve author node writes: from node itself (if author) or from graph if node is critic
  const author = node.kind === "agent" ? node : graph?.nodes.find(n => n.id === repairTarget);
  const writes = author?.writes || node.writes || [];

  for (const w of writes) {
    const cleanW = w.replace(/^\.?\//, "").replace(/\/$/, "");
    const cleanT = target.replace(/^\.?\//, "").replace(/\/$/, "");
    if (cleanT === cleanW || cleanT.startsWith(cleanW + "/") || cleanW.startsWith(cleanT + "/")) {
      return true;
    }
  }

  // Fallback: does the target file path directly reference repairTarget?
  const cleanT = target.replace(/^\.?\//, "").replace(/\/$/, "");
  const parts = cleanT.split("/");
  if (parts.some(p => p === repairTarget || p.startsWith(`${repairTarget}.`) || p.startsWith(`${repairTarget}-`))) {
    return true;
  }

  return false;
}

/**
 * Builds a focused repair packet containing only active, fresh, applicable failed findings,
 * allowed writes, and preservation invariants, avoiding full re-read overhead.
 */
export interface BuildRepairPacketOptions {
  root: string;
  kernel: string;
  node: GraphNode;
  state: AgentState;
  graph?: SkillGraph;
  obligationId?: string;
  findingId?: string;
}

export function buildRepairPacket(opts: BuildRepairPacketOptions): RepairPacket {
  const { root, kernel, node, state, graph, obligationId, findingId } = opts;
  const repairTarget = node.repair || node.id;

  interface CandidateReview {
    criticId: string;
    reviewPath: string;
  }

  const candidateReviews: CandidateReview[] = [];
  const seenReviewPaths = new Set<string>();

  const addCandidate = (criticId: string, reviewPath: string) => {
    if (!seenReviewPaths.has(reviewPath)) {
      seenReviewPaths.add(reviewPath);
      candidateReviews.push({ criticId, reviewPath });
    }
  };

  // Find all critic nodes targeting this author node in graph
  if (graph) {
    for (const c of graph.nodes) {
      if (c.kind === "critic" && (c.repair === node.id || c.repair === repairTarget || (c.needs && (c.needs.includes(node.id) || c.needs.includes(repairTarget))))) {
        for (const w of c.writes || []) {
          if (w.startsWith("agent/reviews/") && w.endsWith(".json")) {
            addCandidate(c.id, join(root, w));
          }
        }
      }
    }
  }

  // If node itself is a critic node being repaired or inspected:
  if (node.kind === "critic") {
    for (const w of node.writes || []) {
      if (w.startsWith("agent/reviews/") && w.endsWith(".json")) {
        addCandidate(node.id, join(root, w));
      }
    }
  }

  // Fallback standard naming conventions
  const fallbackCriticId = graph?.nodes.find(n => n.id === `${node.id}-review` || n.id === `${repairTarget}-review`)?.id || `${node.id}-review`;
  addCandidate(fallbackCriticId, join(root, `agent/reviews/${node.id}-review.json`));
  addCandidate(fallbackCriticId, join(root, `agent/reviews/${repairTarget}-review.json`));
  addCandidate(node.id, join(root, `agent/reviews/${node.id}.json`));

  let failedFindings: Finding[] = [];
  const seenFindingKeys = new Set<string>();

  for (const { criticId, reviewPath } of candidateReviews) {
    if (!existsSync(reviewPath)) continue;
    try {
      const rev = json<Review>(reviewPath);

      // 1. Verdict check: must be an explicitly failed review
      if (rev.verdict !== "fail") continue;

      // 2. Subject freshness check: subjectHash must match current live reviewSubject for this critic
      const currentSubjectHash = reviewSubject(root, criticId);
      if (!rev.subjectHash || rev.subjectHash !== currentSubjectHash) {
        continue;
      }

      // 3. Inject only active, applicable blocker/major findings matching author writes or repairTarget
      for (const f of rev.findings || []) {
        if (f.severity === "blocker" || f.severity === "major") {
          if (findingId && f.id !== findingId) {
            continue;
          }
          if (!isFindingApplicable(f, node, repairTarget, graph)) {
            continue;
          }
          const key = f.id || `${f.page}:${f.section}:${f.problem}`;
          if (!seenFindingKeys.has(key)) {
            seenFindingKeys.add(key);
            failedFindings.push(f);
          }
        }
      }
    } catch {
      // ignore malformed review file
    }
  }

  const currentIteration = (state.iteration || 0) + 1;
  const structuredFindings: StructuredCriticFinding[] = failedFindings.map(f => ({
    id: f.id,
    targetFile: f.target || f.page,
    section: f.section,
    severity: toCriticSeverity(f.severity),
    problem: f.problem,
    repairDirective: f.repair,
    verificationCriteria: f.verify,
  }));
  const quality = loadLatestQualityResult(root, node.kind === "critic" ? undefined : repairTarget)
    || loadLatestQualityResult(root);
  const qualityFindings: QualityFinding[] = (quality?.findings || []).filter(f =>
    f.status !== "resolved" && f.policyDecision !== "pass" && (f.severity === "error" || f.policyDecision === "escalate")
  );
  for (const qf of qualityFindings) {
    if (qf.author && qf.author !== repairTarget && qf.author !== node.id && !isFindingApplicable({
      id: qf.id, page: qf.location.split("#")[0] || "/", section: qf.location.split("#")[1] || "",
      evidence: qf.evidenceSpan || "", severity: "major", problem: qf.kind, repair: qf.verification,
      target: qf.author, verify: qf.verification,
    }, node, repairTarget, graph)) {
      continue;
    }
    const key = qf.id;
    if (seenFindingKeys.has(key)) continue;
    seenFindingKeys.add(key);
    failedFindings.push({
      id: qf.id,
      page: (qf.location.split("#")[0] || "/"),
      section: (qf.location.split("#")[1] || ""),
      evidence: qf.evidenceSpan || "",
      severity: qf.severity === "error" ? "major" : "minor",
      problem: `${qf.kind} at ${qf.location || qf.subjectId}: ${qf.verification}`,
      repair: qf.verification,
      target: qf.author || repairTarget,
      verify: qf.verification,
    });
    structuredFindings.push({
      id: qf.id,
      targetFile: qf.author || repairTarget,
      section: qf.location,
      severity: qf.severity === "error" ? "blocking" : "warning",
      problem: `${qf.kind} at ${qf.location || qf.subjectId}`,
      repairDirective: qf.verification,
      verificationCriteria: qf.verification,
    });
  }
  const escalated = recordAndEscalateFindings(root, structuredFindings, currentIteration);
  const activeFailedFindings: Finding[] = escalated.map(ef => toStandardFinding(ef));

  const memoryPath = join(root, "agent/site-memory.json");
  const preservationInvariants: string[] = [
    "Preserve approved business facts and citations that passed preflight.",
    "Preserve local media inventory and resolved placements.",
    "Do not invent facts or services absent from harvested sources.",
  ];

  if (existsSync(memoryPath)) {
    try {
      const memory = json<any>(memoryPath);
      for (const pref of (memory.preferences || [])) {
        preservationInvariants.push(`User Preference: ${pref.text}`);
      }
    } catch {
      // ignore
    }
  }

  let contextSlice = "";
  if (activeFailedFindings.length) {
    contextSlice += "### Specific Defect Findings to Repair:\n";
    for (const f of activeFailedFindings) {
      contextSlice += `- [${f.id}] Severity: ${f.severity} on ${f.page || "global"} (Section: ${f.section || "general"})\n`;
      contextSlice += `  Problem: ${f.problem}\n`;
      contextSlice += `  Required Repair: ${f.repair}\n`;
      contextSlice += `  Verification: ${f.verify}\n`;
      if (f.evidence) contextSlice += `  Source span: ${f.evidence}\n`;
    }
    for (const qf of qualityFindings) {
      contextSlice += formatTargetedRepairBlock({
        findingId: qf.id,
        location: qf.location || qf.subjectId,
        before: qf.kind,
        sourceSpan: qf.evidenceSpan || qf.sourceHash || "",
        verification: qf.verification,
        constraints: ["Do not invent evidence", "Re-run the semantic check; a byte change is not resolution"],
      });
    }
  } else {
    const failures = state.nodes[node.id]?.failures || [];
    contextSlice += `### Node Failures:\n${failures.join("\n")}\n`;
  }

  const compositionPath = join(root, "agent/reviews/composition-preflight.json");
  if (existsSync(compositionPath)) {
    try {
      const composition = json<{ findings?: CompositionFinding[] }>(compositionPath);
      const relevant = (composition.findings || []).filter(finding => !finding.route || node.writes.some(write => write.startsWith("pages") || write.startsWith("onboarding/storyboard")));
      if (relevant.length) {
        contextSlice += "\n### Composition findings (advisory until reviewed):\n";
        for (const finding of relevant) {
          contextSlice += `- [${finding.id}] ${finding.route}#${finding.section}: ${finding.problem}\n  Repair: ${finding.repair}\n  Evidence: ${finding.evidence}\n`;
        }
      }
    } catch { /* ignore malformed preflight */ }
  }

  const verificationCommand = `${kernelScriptCommand(kernel, "scripts/eval-site.ts")} --site . --node ${node.eval} --json`;

  return {
    nodeId: node.id,
    repairTarget,
    failedFindings: activeFailedFindings,
    allowedWrites: node.writes,
    preservationInvariants,
    verificationCommand,
    contextSlice,
    obligationId,
    findingId,
  };
}

export interface RepairResolutionVerification {
  resolved: boolean;
  findingId?: string;
  obligationId?: string;
  reason: string;
  remainingViolations?: string[];
}

/**
 * Verifies whether a repair attempt actually resolved the targeted defect finding.
 * Catches no-op edits, persistent problem strings, and unmet verification criteria.
 */
export function verifyRepairResolution(opts: {
  root: string;
  finding?: Finding;
  obligationId?: string;
  previousArtifactContent?: string;
  currentArtifactContent?: string;
  semanticResolved?: boolean;
  criticDisposition?: boolean;
}): RepairResolutionVerification {
  const { finding, obligationId, previousArtifactContent, currentArtifactContent } = opts;

  if (previousArtifactContent !== undefined && currentArtifactContent !== undefined) {
    if (previousArtifactContent === currentArtifactContent) {
      return {
        resolved: false,
        findingId: finding?.id,
        obligationId,
        reason: "No modifications made to artifact content during repair attempt",
      };
    }
    const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
    if (collapse(previousArtifactContent) === collapse(currentArtifactContent)) {
      return {
        resolved: false,
        findingId: finding?.id,
        obligationId,
        reason: "A mere byte change does not resolve this finding.",
      };
    }
  }

  if (finding && currentArtifactContent) {
    if (finding.problem && currentArtifactContent.includes(finding.problem)) {
      return {
        resolved: false,
        findingId: finding.id,
        obligationId,
        reason: `Artifact content still contains flagged problem: "${finding.problem}"`,
      };
    }
    const quotedMatches = (finding.problem || "").match(/"([^"]+)"|'([^']+)'/g);
    if (quotedMatches) {
      for (const rawQuoted of quotedMatches) {
        const val = rawQuoted.slice(1, -1).trim();
        if (val && currentArtifactContent.includes(val)) {
          return {
            resolved: false,
            findingId: finding.id,
            obligationId,
            reason: `Artifact content still contains flagged problem value: "${val}"`,
          };
        }
      }
    }
  }

  if (!opts.semanticResolved && !opts.criticDisposition) {
    return {
      resolved: false,
      findingId: finding?.id,
      obligationId,
      reason: "Repair resolution requires a semantic re-check or independent critic disposition; a byte change or missing problem string is not sufficient.",
    };
  }

  return {
    resolved: true,
    findingId: finding?.id,
    obligationId,
    reason: "Repair resolved the targeted finding without regressions",
  };
}

export interface DecisionArtifactContext {
  questionVersion?: string;
  policyVersion?: string;
  model?: string;
  stateHash?: string;
  evidenceHash?: string;
}

/** Determines whether a raw atomic decision can be reused. Policy version is not part of inference identity. */
export function canReuseDecision(
  cached: DecisionArtifactContext | string | undefined,
  currentOrEvidenceHash?: DecisionArtifactContext | string,
  _cachedPolicyVersion?: string
): boolean {
  if (typeof cached === "object" && cached !== null && typeof currentOrEvidenceHash === "object" && currentOrEvidenceHash !== null) {
    const c = cached as DecisionArtifactContext;
    const cur = currentOrEvidenceHash as DecisionArtifactContext;
    if (!c.evidenceHash || !cur.evidenceHash || c.evidenceHash !== cur.evidenceHash) return false;
    if (c.questionVersion && cur.questionVersion && c.questionVersion !== cur.questionVersion) return false;
    if (c.model && cur.model && c.model !== cur.model) return false;
    if (c.stateHash && cur.stateHash && c.stateHash !== cur.stateHash) return false;
    return true;
  }

  const cachedHash = typeof cached === "string" ? cached : undefined;
  const currentHash = typeof currentOrEvidenceHash === "string" ? currentOrEvidenceHash : "";
  if (!cachedHash || !currentHash) return false;
  return cachedHash === currentHash;
}

export const MAX_IDENTICAL_UNCERTAIN_REPEATS = 1;

export function shouldEscalateRepeatedUncertainty(priorUncertainCount: number): boolean {
  return priorUncertainCount >= MAX_IDENTICAL_UNCERTAIN_REPEATS;
}

export function formatTargetedRepairBlock(opts: {
  findingId: string;
  location: string;
  before: string;
  sourceSpan: string;
  verification: string;
  constraints: string[];
}): string {
  return [
    `## Targeted repair ${opts.findingId}`,
    `Location: ${opts.location}`,
    `Source span: ${opts.sourceSpan}`,
    `Before: ${opts.before}`,
    `Verify: ${opts.verification}`,
    `Preserve: ${opts.constraints.join("; ") || "existing facts and CTAs"}`,
    "A mere byte change does not resolve this finding.",
  ].join("\n");
}

/** A composition finding is resolved only when the storyboard no longer produces that finding id. */
export function recheckCompositionFinding(root: string, findingId: string): { resolved: boolean; reason: string } {
  const storyPath = join(root, "onboarding/storyboard.json");
  if (!existsSync(storyPath)) return { resolved: false, reason: "Storyboard is missing." };
  const story = json<Storyboard>(storyPath);
  const still = assessComposition(story).some(finding => finding.id === findingId);
  return still
    ? { resolved: false, reason: "The storyboard still produces this composition finding. A changed file hash is not enough." }
    : { resolved: true, reason: "The storyboard no longer produces this finding." };
}
