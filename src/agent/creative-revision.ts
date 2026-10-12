import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { files, fingerprint, json, save, sourceHash } from "./artifacts.ts";
import { type GraphNode, invalidate } from "./graph.ts";
import { finish, instructionContractHash, loadState } from "./runner.ts";
import { loadSiteGraph } from "./workflow.ts";
import { gradeNode } from "./grade.ts";
import { withMutationLock } from "./preparation.ts";
import { runCreativeObjective } from "./creative-objective.ts";
import { CREATIVE_SKILLS, selectedCreativeSkills } from "./creative-skills.ts";
import { buildEvidenceIndex, retrieveCreativeEvidence } from "./creative-evidence.ts";
import type { CreativeRevisionPlan } from "./creative-contract.ts";
import { buildCreativeContextPacket, CREATIVE_REPAIR_OBLIGATION } from "./creative-context.ts";
import type { CreativeEfficiencyPolicy } from "./creative-efficiency.ts";
import type { JevConfig } from "./jev/types.ts";
import type { JevClient } from "./jev/client.ts";
import type { TrustedPilotContext } from "./jev/calibration.ts";
import { creativeMethod } from "./creative-prompts.ts";
import { selectCreativeChangeContext } from "./creative-change-context.ts";

export const CREATIVE_REVISION_WRITES = ["onboarding/direction.json", "onboarding/studies", "onboarding/storyboard.json", "onboarding/copy-plan.json", "onboarding/media-selection.json", "pages", "components", "theme", "site.json", "agent/decisions/component-selection.json", "dist"];
const PRODUCERS = ["direction", "storyboard", "copy", "representative"];

function authoredFiles(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const path of CREATIVE_REVISION_WRITES.filter(path => path !== "dist" && !path.startsWith("agent/"))) {
    if (!existsSync(join(root, path))) continue;
    for (const absolute of files(join(root, path))) {
      const rel = relative(root, absolute).replaceAll("\\", "/");
      result[rel] = createHash("sha256").update(readFileSync(absolute)).digest("hex");
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
function changedAuthoredFiles(before: Record<string, string>, after: Record<string, string>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => before[path] !== after[path]).sort();
}
function previousRevisionOutcomes(root: string, runId: string, round: number): string[] {
  const directory = join(root, "agent/runs");
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name => name.startsWith(`${runId}-revision-`) && name.endsWith(".result.json") && name !== `${runId}-revision-${round}.result.json`).sort().slice(-3).map(name => {
    const result = json<{ changes?: { target?: string; change?: string }[]; remainingRisks?: string[] }>(join(directory, name));
    return `${name}: changes ${JSON.stringify(result.changes || [])}; remaining risks ${JSON.stringify(result.remainingRisks || [])}`;
  });
}

export function creativeRevisionNode(runId: string, round: number, refs: string[]): GraphNode {
  const id = `${runId}-revision-${round}`;
  return { id, kind: "agent", optional: true, needs: [], refs, tools: [], maxAttempts: 3, eval: "creative-revision",
    inputs: ["onboarding/business.json", "onboarding/media-inventory.json", "onboarding/narrative-brief.json", "agent/assigned-direction.json", `agent/runs/${id}.objective.json`, ...CREATIVE_REVISION_WRITES.filter(p => p !== "dist")],
    writes: [...CREATIVE_REVISION_WRITES, `agent/runs/${id}.result.json`] };
}

/** A joint revision owns the authored contracts; fresh critic/browser gates still own acceptance. */
export async function runCreativeRevision(opts: { root: string; kernel: string; runId: string; round: number; beforeRevision: string; plan: CreativeRevisionPlan; retry?: boolean; beforePrepare?: () => void; usageReceiptPath?: string; evidenceRoot?: string; creativeRoot?: string; findings?: unknown[]; efficiency?: { policy: CreativeEfficiencyPolicy; config: JevConfig; client?: JevClient; pilotContext?: TrustedPilotContext } }) {
  const { root, kernel, runId, round, plan } = opts;
  const selected = selectedCreativeSkills(plan.skillIds, root, kernel);
  const refs = [...new Set(["contracts", "design-calibration", ...selected.descriptions.map(s => s.expansionHandle.slice(4))])];
  const node = creativeRevisionNode(runId, round, refs);
  const compact = Boolean(opts.efficiency?.policy.enabled && opts.efficiency.config.compactPackets);
  if (compact) (node.inputs ||= []).push(`agent/runs/${node.id}.manifest.json`, `agent/runs/${node.id}.expansions`);
  const objectivePath = join(root, `agent/runs/${node.id}.objective.json`);
  const resultPath = join(root, `agent/runs/${node.id}.result.json`);
  const index = buildEvidenceIndex(opts.evidenceRoot || root, opts.creativeRoot);
  const evidence = retrieveCreativeEvidence(index, { query: `${plan.objective} ${plan.targets.join(" ")}`, seedIds: plan.evidenceIds });
  const routes = json<{ pages: { path: string }[] }>(join(root, "onboarding/storyboard.json")).pages.map(p => p.path).sort();
  const objective = { schemaVersion: 1, beforeRevision: opts.beforeRevision, beforeFiles: authoredFiles(root), plan, routes, affectedReviewRoutes: routes, findings: opts.findings || [], evidenceRoot: opts.evidenceRoot || root, evidence, skills: compact ? selected.expansions.map(item => ({ id: item.id, hash: item.hash, provenance: item.provenance })) : selected.expansions };
  if (!existsSync(objectivePath)) {
    if (sourceHash(root) !== opts.beforeRevision) throw new Error("Creative source changed before revision preparation");
    save(objectivePath, objective);
  } else {
    const saved = json<typeof objective>(objectivePath);
    if (saved.beforeRevision !== opts.beforeRevision || JSON.stringify(saved.plan) !== JSON.stringify(plan)) throw new Error("Creative revision objective changed during execution");
  }
  const prompt = `Creative revision ${round}: ${plan.objective}
Work in the current session. Read agent/runs/${node.id}.objective.json for the exact objective, targeted findings, connected evidence and effective skill expansions. These are self-review hypotheses, not human preferences.
Jointly develop the copy plan, imagery placements, direction, storyboard, theme, components and page source. Keep facts and the media inventory unchanged. Existing authentic assets may be reselected; missing assets require vitris-art revise --site . --record FILE with a durable operationId, kind illustration/derivative, exact request, routes and preserve list. This cancels this preparation and routes through the declared production owner; re-prepare creative revision afterward. Do not add media inside this immutable creative preparation. Preserve explicit user constraints and all declared routes.
Focus on: ${plan.targets.join("; ")}. Acceptance observations: ${plan.acceptance.join("; ")}.
Build the production source. Do not mark any review passed or modify STATE. The engine will revalidate updated authoring contracts and rerun affected editorial, browser and aesthetic gates.
Write agent/runs/${node.id}.result.json with schemaVersion:1, beforeRevision:"${opts.beforeRevision}", changes:[{target,change,acceptance}], and remainingRisks: string[]. Changes must cover each target and explain the intended acceptance observation; final visual success is checked after rendering.
Resume the parent creative profile to complete this custom preparation; do not complete it with the ordinary child --complete command.\n${creativeMethod("revision")}`;
  const result = await runCreativeObjective({ root, kernel, node, prompt, retry: opts.retry, beforePrepare: opts.beforePrepare, usageReceiptPath: opts.usageReceiptPath, jevConfig: opts.efficiency?.config, jevClient: opts.efficiency?.client,
    buildPacket: compact ? async () => {
      const packet = await buildCreativeContextPacket({ root, kernel, node, role: "revision", objective: plan.objective, sourceRevision: opts.beforeRevision, baseContract: prompt, policy: opts.efficiency!.policy, config: opts.efficiency!.config, client: opts.efficiency!.client, pilotContext: opts.efficiency!.pilotContext, budgetRoot: opts.evidenceRoot || root, evidence: index, retrievedIds: evidence.nodes.map(item => item.id), mandatorySkillIds: plan.skillIds, optionalSkillIds: CREATIVE_SKILLS.map(item => item.id).filter(id => !plan.skillIds.includes(id)).slice(0, 6), constraints: ["Preserve accepted business facts, selected identity and declared routes", `Affected review routes: ${objective.affectedReviewRoutes.length ? objective.affectedReviewRoutes.join(", ") : "unknown reach; review all declared routes"}`, ...plan.acceptance], obligations: ["Revise authored source jointly", CREATIVE_REPAIR_OBLIGATION, "Run fresh editorial, browser and visual reviews", ...plan.targets.map(target => `Address target: ${target}`)], findings: (opts.findings || []).map(item => JSON.stringify(item)), renderIds: plan.evidenceIds.filter(id => id.startsWith("render:")), priorOutcomes: previousRevisionOutcomes(root, runId, round) });
      return packet.prompt;
    } : undefined,
    evaluate: () => {
      const failures = PRODUCERS.flatMap(id => gradeNode(root, id).failures.map(f => `${id}: ${f}`));
      if (sourceHash(root) === opts.beforeRevision) failures.push("Creative revision made no authored change");
      const original = json<typeof objective>(objectivePath);
      if (JSON.stringify(routes) !== JSON.stringify(original.routes)) failures.push("Creative revision must preserve all declared routes");
      const report = existsSync(resultPath) ? json<{ schemaVersion?: number; beforeRevision?: string; changes?: { target?: string; change?: string; acceptance?: string }[]; remainingRisks?: string[] }>(resultPath) : {};
      if (report.schemaVersion !== 1 || report.beforeRevision !== opts.beforeRevision || !Array.isArray(report.changes) || !report.changes.length || !Array.isArray(report.remainingRisks) || report.remainingRisks.some(v => typeof v !== "string")) failures.push("Invalid creative revision result contract");
      for (const target of plan.targets) if (!report.changes?.some(c => c && c.target === target && typeof c.change === "string" && c.change.trim() && typeof c.acceptance === "string" && c.acceptance.trim())) failures.push(`Revision result does not address ${target}`);
      return { failures };
    } });
  if (result.paused || result.failures.length) return result;

  const adoptionPath = join(root, `agent/runs/${node.id}.adoption.json`);
  withMutationLock(root, () => {
    if (existsSync(adoptionPath)) {
      if (json<{ sourceRevision: string }>(adoptionPath).sourceRevision !== sourceHash(root)) throw new Error("Adopted creative revision changed before revalidation");
      return;
    }
    const graph = loadSiteGraph(root), state = loadState(root, graph);
    // Clear dependent approvals first, then bind only the authoring outputs actually validated above.
    // A creative revision deliberately reopens historical checkpoints too.
    const revisionGraph = { ...graph, nodes: graph.nodes.map(n => ({ ...n, historicalAfter: undefined })) };
    for (const id of ["direction-render", "direction-review", "copy-review", "representative-browser"]) if (graph.nodes.some(n => n.id === id)) invalidate(revisionGraph, state, id);
    for (const id of PRODUCERS) {
      const producer = graph.nodes.find(n => n.id === id);
      if (!producer) throw new Error(`Creative revision requires ${id}`);
      finish(root, graph, state, producer, []);
      state.nodes[id]!.skillHash = instructionContractHash(root, producer);
    }
    save(join(root, "agent/STATE.json"), state);
    const changes = changedAuthoredFiles(json<typeof objective>(objectivePath).beforeFiles, authoredFiles(root));
    const impact = selectCreativeChangeContext(changes, routes, plan, opts.findings);
    save(adoptionPath, { schemaVersion: 1, preparationId: result.preparationId, sourceRevision: sourceHash(root), resultHash: fingerprint(root, [`agent/runs/${node.id}.result.json`]), changedAuthoredFiles: changes, affectedRoutes: impact.affectedRoutes, reviewScope: impact.scope === "broad" ? "all_declared_routes_shared_dependency" : "targeted_routes_plus_required_final_whole_site", reviewReason: impact.reason, validatedProducers: PRODUCERS, renewedApprovals: [], at: new Date().toISOString() });
  });
  return result;
}
