import { existsSync } from "node:fs";
import { join } from "node:path";
import { fingerprint, json, type Review } from "./artifacts.ts";
import { invalidate, isPreviewReady, type AgentState, type GraphNode, type SkillGraph } from "./graph.ts";
import { inputHash, instructionContractHash } from "./runner.ts";
import { themeSelectionEnabled, themeDependentNode, currentSelectionHash } from './theme-selection.ts';
import { reviewSubject } from "./evaluate.ts";
import { aggregateJevReceiptSpend } from "./jev/budget.ts";

export function computeNextState(opts: {
  root: string;
  graph: SkillGraph;
  currentState: AgentState;
  node: GraphNode;
  failures: string[];
  agentUsage?: { inputTokens?: number; outputTokens?: number; measured: boolean };
  durationMs?: number;
  countAttempt?: boolean;
  externallyMetered?: boolean;
}): AgentState {
  const { root, graph, currentState, node, failures, agentUsage, durationMs } = opts;
  const targetState: AgentState = JSON.parse(JSON.stringify(currentState));
  targetState.nodes[node.id] ||= { status: "pending", attempts: 0 };
  const st = targetState.nodes[node.id]!;
  st.attempts = st.attempts || 0;
  if (opts.countAttempt !== false && st.attempts >= node.maxAttempts) {
    throw new Error(`Exhausted ${node.id}`);
  }

  targetState.iteration = (targetState.iteration || 0) + (opts.countAttempt === false ? 0 : 1);
  st.attempts = st.attempts + (opts.countAttempt === false ? 0 : 1);
  st.status = failures.length ? "failed" : "done";
  st.failures = failures;
  st.inputHash = inputHash(root, node);
  if (themeSelectionEnabled(root) && themeDependentNode(node)) st.themeSelectionHash = currentSelectionHash(root);
  st.outputHash = fingerprint(root, node.writes);
  st.skillHash = instructionContractHash(root, node);

  let repair = node.repair;
  if (failures.length && node.kind === "tool") {
    const isEvidenceDefect = failures.some(f => /stale|missing.*screenshot|missing.*render|missing.*check|corrupt|evidence/i.test(f));
    if (isEvidenceDefect) {
      repair = node.id;
    }
  } else if (failures.length && node.kind === "critic") {
    const path = join(root, "agent/reviews", `${node.id}.json`);
    try {
      if (existsSync(path)) {
        const review = json<Review>(path);
        if (review.subjectHash === reviewSubject(root, node.id)) {
          const ancestors = new Set<string>();
          const visit = (id: string) => {
            if (ancestors.has(id)) return;
            ancestors.add(id);
            for (const dep of graph.nodes.find(n => n.id === id)!.needs) visit(dep);
          };
          for (const dep of node.needs) visit(dep);
          const postRepStages = new Set(["pages", "browser", "visual-review", "content-review", "preview"]);
          const frozenCreativeStages = new Set([
            "direction", "direction-render", "direction-review",
            "storyboard", "representative", "representative-browser",
            "representative-review", "representative-quality",
          ]);
          const target = graph.nodes.find(n => {
            if (n.kind !== "agent" || !ancestors.has(n.id)) return false;
            if (postRepStages.has(node.id) && frozenCreativeStages.has(n.id)) return false;
            return review.findings.some(f => f.severity !== "minor" && f.target === n.id);
          });
          if (target) repair = target.id;
        }
      }
    } catch {}
  }

  // Stable issue codes identify the artifact owner. An exact legacy placement
  // message is translated for old preview receipts; other unknown text stays
  // with the graph's configured repair policy.
  const codedOwners = failures.flatMap(failure => {
    const code = /\[(MEDIA_[A-Z_]+)\]/.exec(failure)?.[1]
      || (/^(?:preview: )?Selected media lacks storyboard placement: [^\s]+$/.test(failure) ? "MEDIA_UNPLACED" : undefined);
    if (code === "MEDIA_ASSET_INVALID") return [{ id: "media", write: "onboarding/media-inventory.json" }];
    if (["MEDIA_UNPLACED", "MEDIA_ROUTE_INVALID", "MEDIA_SELECTION_CONFLICT", "MEDIA_REFERENCE_INVALID"].includes(code || "")) {
      return [{ id: "storyboard", write: "onboarding/storyboard.json" }];
    }
    return [];
  });
  if (codedOwners.length) {
    const target = graph.nodes.find(candidate => codedOwners.some(owner =>
      owner.id === candidate.id && candidate.writes.includes(owner.write)));
    if (!target) throw new Error("Media issue has no repair node with the required artifact write scope");
    repair = target.id;
  }

  if (failures.length && repair) {
    invalidate(graph, targetState, repair);
    targetState.nodes[node.id]!.failures = failures;
  }

  targetState.current = null;
  targetState.preview_ready = isPreviewReady(graph, targetState);
  targetState.status = targetState.preview_ready ? "preview_ready" : (failures.length ? "needs_repair" : "in_progress");

  // Track consecutive identical failures to detect repair loops
  targetState.consecutiveFailures ||= {};
  if (failures.length) {
    const failureKey = `${node.id}:${failures.join(";")}`;
    const count = (targetState.consecutiveFailures[failureKey] || 0) + 1;
    targetState.consecutiveFailures[failureKey] = count;
    if (count >= 2) {
      targetState.status = "repeated_failure_blocked";
    }
  } else {
    for (const k of Object.keys(targetState.consecutiveFailures)) {
      if (k.startsWith(`${node.id}:`)) delete targetState.consecutiveFailures[k];
    }
  }

  if (opts.countAttempt === false) return targetState;

  // Cumulative spend accounting
  targetState.cumulativeSpend ||= { iterations: 0, calls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };
  targetState.cumulativeSpend.iterations++;
  targetState.cumulativeSpend.calls++;
  if (durationMs) targetState.cumulativeSpend.durationMs += durationMs;

  // Aggregate Jev ledger spend with deduplication across processes
  const jevSpend = aggregateJevReceiptSpend(root);
  targetState.cumulativeSpend.jevCalls = jevSpend.calls;
  targetState.cumulativeSpend.jevInputTokens = jevSpend.inputTokens;
  targetState.cumulativeSpend.jevOutputTokens = jevSpend.outputTokens;

  if (node.kind === "tool" || opts.externallyMetered) {
    // Tool stages have no active-agent usage; do not treat them as zero-token agent work.
  } else if (agentUsage) {
    if (agentUsage.measured) {
      targetState.cumulativeSpend.agentTokensMeasured = true;
    } else {
      targetState.cumulativeSpend.hasUnmeteredStages = true;
    }
    if (agentUsage.inputTokens !== undefined) {
      targetState.cumulativeSpend.inputTokens = (targetState.cumulativeSpend.inputTokens || 0) + agentUsage.inputTokens;
    }
    if (agentUsage.outputTokens !== undefined) {
      targetState.cumulativeSpend.outputTokens = (targetState.cumulativeSpend.outputTokens || 0) + agentUsage.outputTokens;
    }
  } else {
    targetState.cumulativeSpend.hasUnmeteredStages = true;
  }

  return targetState;
}
