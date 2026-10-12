import { computeNextState } from "./state-transition.ts";
import { checkpointDependency } from './adaptation-checkpoint.ts';
import { plannedMotionRefs } from './motion-knowledge.ts';
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fingerprint, json, save } from "./artifacts.ts";
import { initialState, invalidate, isPreviewReady, nextNode, validateGraph, type AgentState, type GraphNode, type SkillGraph } from "./graph.ts";
import { reviewSubject } from "./evaluate.ts";
import type { Review } from "./artifacts.ts";
import { applyDesignContractMigration } from "./design-contracts.ts";
import { resolveManagedInstruction, resolveManagedInstructionWithProvenance } from "../upgrade/kit.ts";
import { findHarnessRoot } from "../cli/root.ts";
import { preparedProductionOwner } from "./preparation.ts";
import { themeSelectionEnabled, THEME_DESIGN_NODES, themeDependentNode, SELECTION_PATH, BRAND_PATH, currentSelectionHash, selectedThemeContext } from './theme-selection.ts';
import { acceptTemplateInput, ADDITIONAL_CONTENT_PATH, additionalContentGuidance } from './site-inputs.ts';
import { adaptationPreferences, ADAPTATION_PATH, TEMPLATE_DECISIONS_PATH, templateAdaptationGuidance, applyTemplateAdaptationGraph } from './template-adaptation.ts';

export function loadState(root: string, graph: SkillGraph): AgentState {
  const path = join(root, "agent/STATE.json");
  const state = existsSync(path) ? json<AgentState>(path) : initialState(graph);
  if (state.version !== graph.version) throw new Error("Agent kit/state version mismatch. Use refresh-agent; existing progress is backed up, never inferred to pass new gates.");
  for (const n of graph.nodes) state.nodes[n.id] ||= { status: "pending", attempts: 0 };
  return state;
}

export function reconcile(root: string, graph: SkillGraph, state: AgentState): void {
  if ((!state.nodes.harvest || state.nodes.harvest.status === 'done') && (!state.nodes.media || state.nodes.media.status === 'done')) acceptTemplateInput(root);
  applyTemplateAdaptationGraph(root,graph);
  // Interactive preparations do not increment attempts until completion.
  // Production already owns its declared inventory writes during that first
  // preparation; its sealed audit snapshot is checked by completeStage.
  const preparedProduction = graph.nodes.some(n => n.id === "asset-production")
    && Boolean(preparedProductionOwner(root, graph.version));
  for (const node of graph.nodes) {
    const st = state.nodes[node.id]!;
    if (st.status === 'done' && themeSelectionEnabled(root) && themeDependentNode(node) && st.themeSelectionHash !== currentSelectionHash(root)) invalidate(graph, state, node.id);
    // Early renders are historical once full implementation starts. Final checks own current source.
    // The pages author may change files first created by the representative
    // stage. Once copy-expansion has finished, final browser/content checks
    // own those files; do not reopen representative while pages is prepared.
    const historical = node.historicalAfter && (
      (state.nodes[node.historicalAfter]?.attempts || 0) > 0 ||
      (node.historicalAfter === "asset-production" && preparedProduction) ||
      (node.historicalAfter === "pages" && state.nodes["copy-expansion"]?.status === "done")
    );
    // Existing completed sites recorded the copied-kit hash before effective
    // instruction identities were introduced. Migrate matching receipts only
    // when no override could have changed the prompt they actually saw.
    if (st.status === "done" && !["PROMPT.md", ...node.refs.map(ref => `refs/${ref}.md`)]
      .some(path => existsSync(join(root, "agent/overrides", path)))
      && (st.skillHash === legacySkillHash(root, node) || st.skillHash === skillHash(root, node))
      && (st.inputHash === legacyInputHash(root, node) || st.inputHash === inputHash(root, node))) {
      st.skillHash = skillHash(root, node);
      st.inputHash = inputHash(root, node);
    }
    if (st.status === "done" && (st.skillHash !== skillHash(root, node) || (!historical && (st.inputHash !== inputHash(root, node) || st.outputHash !== fingerprint(root, node.writes))))) invalidate(graph, state, node.id);
    else if (st.status === "in_progress") { st.status = "failed"; st.failures = ["Previous attempt interrupted"]; }
  }
  applyDesignContractMigration(root, graph, state);
  state.preview_ready = isPreviewReady(graph, state);
  state.launched = state.nodes.launch?.status === "done";
}
function legacyInputHash(root: string, node: GraphNode): string {
  const optional = (node.optionalInputs || []).filter(path =>
    path !== "agent/site-memory.json" && existsSync(join(root, path))
  );
  return fingerprint(root, ["agent/graph.yaml", "agent/PROMPT.md", ...node.refs.map(ref => `agent/refs/${ref}.md`),
    ...(node.inputs || []), ...optional], { "agent/change-request.json": `agent/requests/${node.id}.json` });
}
function legacySkillHash(root: string, node: GraphNode): string {
  return fingerprint(root, ["agent/graph.yaml", "agent/PROMPT.md", ...node.refs.map(ref => `agent/refs/${ref}.md`)]);
}
export function inputHash(root: string, node: GraphNode): string {
  // Site memory is seeded on the first refinement. Its creation must not
  // reopen unrelated completed stages; node-scoped requests already select
  // the stages that should consume it.
  const optional = (node.optionalInputs || []).filter(path =>
    path !== "agent/site-memory.json" && existsSync(join(root, path))
  );
  const designPolicyNodes = new Set(["reference-analysis", "direction", "direction-render", "direction-review", "asset-production", "storyboard", "copy", "copy-review", "representative", "representative-browser", "representative-review", "representative-quality", "copy-expansion", "pages", "browser", "visual-review", "content-review"]);
  if (node.id !== 'harvest' && existsSync(join(root, ADDITIONAL_CONTENT_PATH)) && !optional.includes(ADDITIONAL_CONTENT_PATH)) optional.push(ADDITIONAL_CONTENT_PATH);
  if (themeDependentNode(node) && adaptationPreferences(root)) {
    if (node.id !== 'reference-analysis') optional.push(TEMPLATE_DECISIONS_PATH, ADAPTATION_PATH);
  }
  const inputs = fingerprint(root, [...(node.inputs || []), ...optional, ...(designPolicyNodes.has(node.id) ? ["launch.json"] : []), ...(themeSelectionEnabled(root) && themeDependentNode(node) ? [SELECTION_PATH, BRAND_PATH] : [])], { "agent/change-request.json": `agent/requests/${node.id}.json` });
  const checkpoint=checkpointDependency(root,node.id);
  return createHash("sha256").update(JSON.stringify({ instructions: instructionContractHash(root, node), inputs, ...(checkpoint?{checkpoint}:{}) })).digest("hex");
}
function skillHash(root: string, node: GraphNode): string {
  return instructionContractHash(root, node);
}
export function instructionContractHash(root: string, node: GraphNode): string {
  const harnessRoot = findHarnessRoot();
  const instructions = ["PROMPT.md", ...[...new Set([...node.refs,...plannedMotionRefs(root,node)])].map(ref => `refs/${ref}.md`)].map(path => {
    const resolved = resolveManagedInstructionWithProvenance(root, harnessRoot, path);
    return { path, provenance: resolved.provenance,
      digest: createHash("sha256").update(resolved.content).digest("hex") };
  });
  return createHash("sha256").update(JSON.stringify({ graph: fingerprint(root, ["agent/graph.yaml"]), instructions })).digest("hex");
}
export function begin(root: string, graph: SkillGraph, state: AgentState, node: GraphNode): void {
  const st = state.nodes[node.id]!;
  if (st.attempts >= node.maxAttempts) throw new Error(`Exhausted ${node.id}`);
  state.current = node.id; state.iteration++; state.status = "in_progress";
  state.nodes[node.id] = { status: "in_progress", attempts: st.attempts + 1, inputHash: inputHash(root, node) };
  save(join(root, "agent/STATE.json"), state);
}
export function finish(root: string, graph: SkillGraph, state: AgentState, node: GraphNode, failures: string[]): void {
  Object.assign(state, computeNextState({ root, graph, currentState: state, node, failures, countAttempt: false }));
  save(join(root, "agent/STATE.json"), state);
}
export function contextPacket(root: string, graph: SkillGraph, state: AgentState, node: GraphNode): string {
  const feedback = graph.nodes.flatMap(n => (state.nodes[n.id]?.failures || []).map(f => `${n.id}: ${f}`));
  const harnessRoot = findHarnessRoot();
  const refs = [...new Set([...node.refs,...plannedMotionRefs(root,node)])].map(ref => `\n## Skill: ${ref}\n${resolveManagedInstruction(root, harnessRoot, `refs/${ref}.md`)}`).join("\n");
  const reviewScopes: Record<string, string> = {
    "business-review": "Review the business interpretation and its captured evidence. Implementation and browser proof do not exist yet and are not prerequisites for this checkpoint.",
    "narrative-review": "Review the shared narrative brief against harvested evidence. Do not require implemented pages. Reject unsupported public claims and demo-reference identities presented as this business.",
    "direction-review": "Review the rendered design studies. Judge their visible design and fit to the business, not completion of the future website or its integrations. Interior implementation is evaluated later. Studies are private sketches, not finished variants.",
    "copy-review": "This is a PRE-IMPLEMENTATION editorial review. For cta-behavior, compare wording with the storyboard's explicit action label, destination and planned behavior. Fail unsupported promises or contradictions in that plan. Do not return unknown merely because pages, rendered links, browser evidence or a live integration have not been built yet: those are downstream work. State that the planned copy is consistent without claiming the interaction was tested. Actual rendered actions are checked by browser and content-review after implementation.",
    "representative-review": "Review only the implemented homepage and designated representative interiors, using representative-browser evidence. Remaining planned routes have not been implemented yet; their absence is not a defect at this checkpoint. Current representative-page defects still fail.",
    "representative-quality": "Separate aesthetic quality gate for the production-compiled homepage and interior. Use anchored 0-4 scores with page/viewport/section evidence. Diversity among variants cannot compensate for a quality fail. Visual inspection requires a passing capability probe; dataBlobId alone is not an accuracy probe. Private HTML studies are not this artifact.",
    "visual-review": "Review the complete rendered website and current browser evidence. Assess real pages at phone and desktop widths, including interiors; a good design study does not establish final implementation quality.",
    "content-review": "Review the complete rendered website against the approved facts, copy, storyboard and current browser evidence. Check actual link destinations and implemented action behavior. Planned intent alone is no longer sufficient, and local browser checks do not establish a successful live lead, booking or payment."
  };
  const scope = node.kind === "critic" ? `\n## Current review boundary\n${reviewScopes[node.id] || "Review the artifacts available at this checkpoint; distinguish observed evidence from assumptions."}\n` : "";
  const optionalInputs = (node.optionalInputs || []).filter(p => existsSync(join(root, p)));
  const inputs = [...(node.inputs || []).map(p => p === "agent/change-request.json" ? `agent/requests/${node.id}.json` : p), ...optionalInputs];
  const packet = `${resolveManagedInstruction(root, harnessRoot, "PROMPT.md")}\n\nActive node: ${node.id}\nKind: ${node.kind}\nRead inputs as needed: ${inputs.join(", ")}\nWrite outputs: ${node.writes.join(", ")}\nOptional skills (load only if relevant): ${(node.optionalRefs || []).join(", ")}\nFailures to repair:\n${feedback.join("\n") || "None"}\n${refs}\n${scope}`;
  const resolvedPacket = packet + additionalContentGuidance(root) + (themeDependentNode(node) ? '\n\n' + selectedThemeContext(root) + templateAdaptationGuidance(root) : '');
  writeFileSync(join(root, "agent/CURRENT.md"), resolvedPacket);
  return resolvedPacket;
}
export function acquire(root: string): () => void {
  const path = join(root, "agent/RUN.lock");
  if (existsSync(path)) {
    const lock = json<{ pid: number }>(path);
    try { process.kill(lock.pid, 0); throw new Error(`Run already active (PID ${lock.pid})`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; unlinkSync(path); }
  }
  const fd = openSync(path, "wx"); writeFileSync(fd, JSON.stringify({ pid: process.pid })); closeSync(fd);
  return () => unlinkSync(path);
}
export { nextNode, validateGraph };
