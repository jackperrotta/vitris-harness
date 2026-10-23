import { prepareMediaAssistance } from "./jev/media.ts";
import { awaitAdaptation, requestedAdaptationRepair } from './adaptation-checkpoint.ts';
import { themeSelectionEnabled, themeDependentNode, SELECTION_PATH, BRAND_PATH, selectionStore, selectedThemeContext } from './theme-selection.ts';
import { acceptTemplateInput, ADDITIONAL_CONTENT_PATH, additionalContentGuidance } from './site-inputs.ts';
import { adaptationPreferences, ADAPTATION_PATH, TEMPLATE_DECISIONS_PATH, templateAdaptationGuidance } from './template-adaptation.ts';
import { writeThemePicker } from './theme-picker.ts';
import { artDirectionContext } from "./art-direction.ts";
import { artDirectionPolicy } from "./art-direction-policy.ts";
import { validateMediaSelection, validateRenderedMedia } from "../stock/selection.ts";
import { readInvocations, syncInvocationSpend } from "./invocation-budget.ts";
import { computeNextState } from "./state-transition.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { files, fingerprint, json, save, SOURCE_PATHS, type Business, type Review, type Storyboard } from "./artifacts.ts";
import { invalidate, isPreviewReady, nextNode, type AgentState, type GraphNode, type SkillGraph } from "./graph.ts";
import { contextPacket, inputHash, instructionContractHash } from "./runner.ts";
import { gradeNode } from "./grade.ts";
import { reviewSubject } from "./evaluate.ts";
import { usageFromLog, writeUsageReceipt } from "./design-usage.ts";
import { archiveQualityInvocation, recordActiveAgentQualityReceipt, type ActiveAgentQualityReceipt } from "./design-quality.ts";
import { productionQuality } from "./production-quality.ts";
import { mergeImplementationReason, restoreUnchangedLayout } from "./refine.ts";
import { jevClientRequired, loadJevConfig, resolveEffectiveCapabilities, snapshotEffectiveConfig } from "./jev/config.ts";
import { kernelScriptCommand, preferBundledToolArgs } from "./kernel-commands.ts";
import { JevClient } from "./jev/client.ts";
import { buildCompactContextPacket, computeManifestHash, isCompactSupportedNode, DEFAULT_PACKET_BUDGETS, type CoverageManifest } from "./jev/packets.ts";
import { buildRepairPacket } from "./jev/repair.ts";
import { runSemanticGroundingPreflight, formatPreflightSummary } from "./jev/review.ts";
import type { GroundingPreflightSummary, JevConfig } from "./jev/types.ts";
import { getTasksForCaller, loadTaskExecution, loadTaskManifest, recordTaskExecution, verifyTaskExecution } from "./jev/service-registry.ts";
import {
  applyDelegatedPacketReduction,
  assessPreflightCoverage,
  assessSiteTaskContext,
  DEFAULT_RETAINED_DUTIES,
  evaluateDelegationEligibility,
  type TrustedPilotContext,
} from "./jev/ownership.ts";
import { GROUNDING_SEMANTICS_HASH, FIELD_SELECTION_SEMANTICS_HASH, COMPONENT_FIT_SEMANTICS_HASH } from "./jev/questions.ts";
import { capabilityForTask } from "./jev/calibration.ts";
import { aggregateJevReceiptSpend, remainingPilotBudget, type JevAggregatedSpend } from "./jev/budget.ts";
import { applyBusinessAuthorPacketReduction, formatMachineDraft, formatTranscriptionObligations, fieldTranscriptionRemovable, runBusinessSourceSelection, type MachineBusinessDraft } from "./jev/business-draft.ts";
import { rankOptionalEvidenceWithJev, type RankedEvidenceItem } from "./jev/ranking.ts";
import { runQualityChecks, formatQualityFindings, QUALITY_TASK_SEMANTICS, reconcileQualityWithReview, verifyQualityTaskReceipts } from "./jev/content-checks.ts";
import { attachComponentRecommendations } from "./jev/component-select.ts";
import { resolveDesignAuthoring } from "./composition-authoring.ts";
import { writeNodeObservation } from "./jev/observations.ts";
import { syncGoalContract } from "./jev/goals.ts";
import { scoreCreativeCandidates, scoreCompositionRepetition, scoreDirectionDecisions, scoreMediaFitFromText } from "./jev/creative.ts";
import { assessComposition } from "./composition-preflight.ts";
import { semanticAssistNote } from "./jev/semantic-tasks.ts";
import { runLifecycleSemanticTasks } from "./jev/semantic-lifecycle.ts";
import { buildCreativeCheckContext } from "./design-contracts.ts";
import { buildDesignContextPacket, DESIGN_CONTEXT_STAGES, supplementDesignContext } from "./design-context-packet.ts";
import { persistDesignContextArtifacts } from "./design-context-store.ts";
import { selectLessonsForStage } from "./design-knowledge.ts";
import { recordAgentStageAttempt } from "./jev/agent-usage.ts";
import {
  categorizeNodeDependencies,
  checkGlobalStageExclusion,
  computeImmutableHash,
  findActivePreparation,
  hasActiveStageLease,
  loadPreparation,
  releaseDurableLease,
  savePreparation,
  sha256Hex,
  snapshotInventory,
  verifyAllowedWrites,
  withMutationLock,
  acquireDurableLease,
  writeCommitJournal,
  updateCommitJournalPhase,
  clearCommitJournal,
  recoverCommitJournal,
  type StagePreparation,
  type ToolExecutionReceipt,
} from "./preparation.ts";
import { CAPTURE_PATHS, PROTECTED_SOURCE_PATHS, killProcessTree } from "./workflow.ts";
import {
  recordStageCompleted,
  recordStageInvalidated,
  recordStagePrepared,
  recordToolCompleted,
} from "./trace.ts";

function stageSubject(root: string, node: GraphNode): string {
  return node.subjectPaths ? fingerprint(root, node.subjectPaths) : reviewSubject(root, node.id);
}

// Derive the same policy dependencies when preparing and when completing a
// freshly loaded graph. Otherwise accepted themes make every design lease stale.
function applyStagePolicyInputs(root: string, node: GraphNode): void {
  if (node.id !== 'harvest' && existsSync(join(root,ADDITIONAL_CONTENT_PATH))) node.optionalInputs = [...new Set([...(node.optionalInputs || []), ADDITIONAL_CONTENT_PATH])];
  if (themeSelectionEnabled(root) && themeDependentNode(node)) {
    node.optionalInputs = [...new Set([...(node.optionalInputs || []), SELECTION_PATH, BRAND_PATH])];
    if (adaptationPreferences(root)) {
      if (node.id === 'reference-analysis') node.writes = [...new Set([...node.writes, ADAPTATION_PATH, 'onboarding/template-reference'])];
      else node.optionalInputs = [...new Set([...(node.optionalInputs || []), ADAPTATION_PATH])];
      if (node.id !== 'reference-analysis') node.optionalInputs = [...new Set([...(node.optionalInputs || []), TEMPLATE_DECISIONS_PATH])];
    }
  }
  if (artDirectionPolicy(root) && node.id !== "harvest") {
    node.optionalInputs = [...new Set([...(node.optionalInputs || []), "launch.json", ...(["business", "business-review"].includes(node.id) ? [] : ["onboarding/visual-asset-brief.json", "onboarding/asset-production.json"])])];
  }
}

export interface PrepareStageOptions {
  promptOverride?: string;
  root: string;
  kernel: string;
  graph: SkillGraph;
  state: AgentState;
  nodeId?: string;
  includeOptional?: boolean;
  jevConfig?: JevConfig;
  jevClient?: JevClient;
  /** Mock or custom transport used when this function constructs the client. Not a prebuilt client. */
  jevFetch?: typeof fetch;
  signal?: AbortSignal;
  /** Kernel-issued pilot context. Never loaded from site jev.json. */
  pilotContext?: TrustedPilotContext;
  kernelRevision?: string;
}

export interface PrepareStageResult {
  status: "prepared" | "no_eligible_node" | "already_complete" | "awaiting_user" | "repair_required";
  node?: GraphNode;
  preparation?: StagePreparation;
  reused?: boolean;
  previewReady: boolean;
  instructions?: string;
}

export interface CompleteStageOptions {
  evaluate?: () => { failures: string[] };
  executionFailures?: string[];
  invocationId?: string;
  root: string;
  kernel: string;
  graph: SkillGraph;
  state: AgentState;
  preparationId: string;
  nodeId?: string;
  jevConfig?: JevConfig;
  durationMs?: number;
  agentUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    measured: boolean;
    rawEvidencePath?: string;
  };
  visualToolEvents?: Array<{ tool: string; path: string; success: boolean; hash?: string }>;
  environment?: string;
  crashInjection?: "before_journal" | "before_state" | "after_journal" | "after_state" | "after_prep";
}

export interface CompleteStageResult {
  ok: boolean;
  nodeId: string;
  preparationId: string;
  failures: string[];
  state: AgentState;
  preparation: StagePreparation;
  idempotentReplay?: boolean;
}

export interface ExecuteToolOptions {
  root: string;
  kernel: string;
  graph: SkillGraph;
  state: AgentState;
  node: GraphNode;
  timeoutMs?: number;
  signal?: AbortSignal;
  injectedExecutor?: () => Promise<void>;
}

export interface ExecuteToolResult {
  ok: boolean;
  nodeId: string;
  exitCode: number;
  failures: string[];
  durationMs: number;
  stdout: string;
  stderr: string;
}

/** Enrich prompt with kernel commands, requests, memory, and review scopes. */
export function enrichPrompt(root: string, kernel: string, node: GraphNode, base: string): string {
  let prompt = base;
  const art = artDirectionContext(root);
  if (art && node.id !== "harvest") prompt += `\n\n${art}\n`;
  prompt += `\nHarness directory: ${kernel}\n`;
  const authoring = resolveDesignAuthoring(root);
  prompt += `Authoring policy: ${authoring.mode}; lesson release: ${authoring.lessonRelease || "none"}; policy hash: ${authoring.hash}.\n`;
  const evalCmd = kernelScriptCommand(kernel, "scripts/eval-site.ts", "vitris-eval.js");
  prompt += `Evaluate this node with the exact portable command: ${evalCmd} --site . --node ${node.eval} --json\nFor a review hash, use the same command with --subject instead of --json. Prefer these Node commands over shell-specific npm argument forwarding.\n`;
  prompt += `For artifact fingerprints, use: ${evalCmd} --site . --hash RELATIVE_PATH [--hash ANOTHER_PATH]. This avoids platform-specific module imports.\n`;
  const requestPath = join(root, `agent/requests/${node.id}.json`);
  if (existsSync(requestPath)) prompt += `\nOperator change request for this stage:\n${readFileSync(requestPath, "utf8")}\nApply only changes within this node. Keep originalRequest verbatim. Expand proposedChanges into concrete edits before changing source. Record implementationReason, likes, dislikes, and preserve items in this request file. For factual changes cite its immutable evidencePath, not the mutable latest-request pointer. Never invent missing details.\n`;
  const memoryPath = join(root, "agent/site-memory.json");
  if (existsSync(memoryPath) && ["business", "copy", "direction", "storyboard", "representative", "pages", "content-review", "visual-review"].includes(node.id)) {
    prompt += `\nCurrent website memory (distinguish current decisions from superseded history):\n${readFileSync(memoryPath, "utf8")}\nDo not revive superseded experiments. Honor preserve preferences.\n`;
  }
  const refineSkill = join(root, "agent/refs/refine.md");
  if (existsSync(join(root, "agent/change-request.json")) && existsSync(refineSkill)) {
    prompt += `\n## Skill: refine\n${readFileSync(refineSkill, "utf8")}\n`;
  }
  if (node.kind === "critic") prompt += `\nReview subjectHash: ${stageSubject(root, node)}\nWrite agent/reviews/${node.id}.json. Review only; do not repair source or mark STATE.\n`;
  if (node.kind === "critic" && ["direction-review", "representative-review", "representative-quality", "visual-review"].includes(node.id) && existsSync(join(root, "agent/request.json"))) {
    const theme = json<{ theme?: string }>(join(root, "agent/request.json")).theme;
    if (theme?.trim()) prompt += `\nExplicit operator theme constraint:\n${theme}\nCompare the rendered design with this request as well as its internal coherence. A coherent design that ignores the requested theme does not pass. Distinguish your preference from adherence to the request.\n`;
  }
  const assignedPath = join(root, "agent/assigned-direction.json");
  if (existsSync(assignedPath) && ["direction", "direction-review", "storyboard", "copy", "representative", "pages", "visual-review", "representative-quality"].includes(node.id)) {
    prompt += `\nAssigned direction (do not independently pick a different winner):\n${readFileSync(assignedPath, "utf8")}\nElaborate and implement this assigned brief. Diversity among other variants is handled by the parent design-run coordinator.\n`;
  }
  const creativeIdentityPath = join(root, "agent/creative-identity.json");
  if (existsSync(creativeIdentityPath) && ["copy", "pages", "visual-review", "content-review", "browser"].includes(node.id)) {
    prompt += `\nSelected creative identity (source-bound self-review; inspect actual expanded pages):\n${readFileSync(creativeIdentityPath, "utf8")}\nPreserve these invariants across pages, or record a justified departure in the final review. Do not treat this decision as proof of human preference.\n`;
  }
  const synthesisPath = join(root, "onboarding/synthesis-plan.json");
  if (existsSync(synthesisPath) && ["storyboard", "copy", "copy-review", "representative", "pages", "visual-review", "content-review", "representative-quality"].includes(node.id)) {
    prompt += `\nSynthesis plan (explicit operator-authorized design intent):\n${readFileSync(synthesisPath, "utf8")}\nFollow this plan. Translate donor composition into the selected global theme. Do not copy a donor stylesheet wholesale or invent missing business facts.\n`;
  }
  return prompt;
}

const ASSIST_TASK_IDS = new Set([
  "business-source-selection",
  "business-review-grounding",
  "narrative-review-grounding",
  "copy-review-grounding",
  "claim-strengthening-check",
  "cta-fidelity-check",
  "intent-coverage-check",
  "cross-stage-consistency-check",
  "creative-dimension-scoring",
  "media-fit-scoring",
  "component-fit-check",
]);

function questionSemanticsForTask(taskId: string, taskType: string): string {
  if (QUALITY_TASK_SEMANTICS[taskId]) return QUALITY_TASK_SEMANTICS[taskId]!;
  if (taskId === "business-source-selection") return FIELD_SELECTION_SEMANTICS_HASH;
  if (taskId === "component-fit-check") return COMPONENT_FIT_SEMANTICS_HASH;
  return GROUNDING_SEMANTICS_HASH;
}

function snapshotTaskAssist(snapshot: Record<string, string> | undefined, taskId: string): boolean {
  if (!ASSIST_TASK_IDS.has(taskId) && !taskId.endsWith("-grounding")) return false;
  const key = capabilityForTask(taskId);
  return snapshot?.[key] === "assist";
}

function qualityAssistEnabled(snapshot: Record<string, string> | undefined): boolean {
  return snapshotTaskAssist(snapshot, "claim-strengthening-check")
    || snapshotTaskAssist(snapshot, "intent-coverage-check")
    || snapshotTaskAssist(snapshot, "cta-fidelity-check")
    || snapshotTaskAssist(snapshot, "cross-stage-consistency-check");
}

/**
 * Pure state transition function: computes the target state in memory
 * without performing any disk mutations.
 */
export { computeNextState } from "./state-transition.ts";

export type { JevAggregatedSpend };
export { aggregateJevReceiptSpend };

/**
 * Prepares the next stage in the workflow.
 * Atomic, durable, and idempotent: if inputs have not changed, returns the existing preparation.
 * Does not increment attempts or mutate STATE.json.
 */
export async function prepareStage(opts: PrepareStageOptions): Promise<PrepareStageResult> {
  const { root, kernel, graph, state } = opts;
  if (state.status === "repeated_failure_blocked") throw new Error("Repeated failure blocked; use an explicit restart with a reason after repairing the cause");

  // Reconcile any in-flight crash journal first and retain freshness
  const recovery = recoverCommitJournal(root, graph);
  if (recovery.recovered && recovery.targetState) {
    Object.assign(state, recovery.targetState);
  }

  let targetNode: GraphNode | null | undefined;
  if (opts.nodeId) {
    targetNode = graph.nodes.find(n => n.id === opts.nodeId);
    if (!targetNode) throw new Error(`Node "${opts.nodeId}" not found in graph`);
    if (!targetNode.needs.every(depId => state.nodes[depId]?.status === "done")) {
      throw new Error(`Cannot prepare stage "${targetNode.id}": dependencies [${targetNode.needs.filter(d => state.nodes[d]?.status !== "done").join(", ")}] are not satisfied`);
    }
  } else {
    targetNode = nextNode(graph, state, { includeOptional: opts.includeOptional });
  }

  if (!targetNode) {
    return {
      status: state.preview_ready ? "already_complete" : "no_eligible_node",
      previewReady: Boolean(state.preview_ready),
    };
  }

  const node = targetNode;
  if (themeSelectionEnabled(root) && themeDependentNode(node)) {
    if (state.nodes.harvest && state.nodes.harvest.status !== 'done' || state.nodes.media && state.nodes.media.status !== 'done') throw new Error('Theme selection requires harvest and the existing media audit');
    acceptTemplateInput(root);
    let staleReason = '';
    if (selectionStore(root)) { try { selectedThemeContext(root); } catch(e) { staleReason = e instanceof Error ? e.message : String(e); } }
    if (!selectionStore(root) || staleReason) {
      const artifact = writeThemePicker(root, join(root, 'onboarding/theme-picker.html'));
      const instructions = `${staleReason ? staleReason + '\n' : ''}Awaiting your visual direction. Open ${artifact}, or serve it with vitris-themes serve --site "${root}". Submit a choice in the picker or record an explicit chat instruction with vitris-themes select. No default has been selected. Run the workflow again after saving. No model is invoked by saving.`;
      save(join(root,'agent/theme-awaiting.json'),{schemaVersion:1,status:'awaiting_user',artifact,nodeId:node.id});
      writeFileSync(join(root,'agent/CURRENT.md'),instructions);
      return {status:'awaiting_user',node,previewReady:false,instructions};
    }
    selectedThemeContext(root); // Fail closed on stale accepted bindings.
    const repair=requestedAdaptationRepair(root,node.id);
    if(repair){
      if(!graph.nodes.some(n=>n.id===repair.owner))throw Error('Adaptation repair needs its authoring owner: '+repair.owner);
      withMutationLock(root,()=>{if(hasActiveStageLease(root).held)throw Error('Finish or cancel the active stage before rerouting adaptation feedback');invalidate(graph,state,repair.owner);save(join(root,'agent/STATE.json'),state);});
      const instructions=`Saved adaptation feedback returns work to ${repair.owner}: ${JSON.stringify(repair.instruction)}. Run prepare again to continue that owner. Preserve the exact response; do not ask the same question again until the comparison or removal proposal has changed.`;
      writeFileSync(join(root,'agent/CURRENT.md'),instructions);return {status:'repair_required',node,previewReady:false,instructions};
    }
    const awaiting=awaitAdaptation(root,node.id);
    if(awaiting){writeFileSync(join(root,'agent/CURRENT.md'),awaiting);return {status:'awaiting_user',node,previewReady:false,instructions:awaiting};}
  }
  applyStagePolicyInputs(root, node);

  const deps = categorizeNodeDependencies({ root, node });
  const immutableHash = computeImmutableHash(root, deps.immutableDependencies, node.id);
  const subjectHash = node.kind === "critic" ? stageSubject(root, node) : undefined;

  const jevConfig = opts.jevConfig || loadJevConfig(root);
  const effectiveCapabilities = resolveEffectiveCapabilities(jevConfig);

  let existingMatchingPrep: StagePreparation | null = null;
  let stageOwnerToken = "";

  withMutationLock(root, () => {
    // Check for existing active preparation for this node
    const existing = findActivePreparation(root, node.id);
    if (existing) {
      const inputsMatch = existing.immutableHash === immutableHash;
      const subjectMatches = existing.reviewSubjectHash === subjectHash;
      const capabilitiesMatch = JSON.stringify(existing.capabilitiesSnapshot || {}) === JSON.stringify(snapshotEffectiveConfig(jevConfig) || {});
      const lease = hasActiveStageLease(root);
      const leaseMatches = lease.held && lease.leaseName === `stage-${node.id}` && lease.ownerToken === existing.ownerToken
        && Date.now() < new Date(existing.leaseExpiresAt).getTime();
      if (inputsMatch && subjectMatches && capabilitiesMatch && leaseMatches) {
        existingMatchingPrep = existing;
        return;
      } else {
        // Changed inputs, review subject, or capabilities: invalidate existing prep and release its lease
        existing.status = "invalidated";
        existing.invalidationReason = leaseMatches
          ? "Inputs, review subject, or capabilities changed prior to completion"
          : "Prepared stage lease expired or no longer belongs to this preparation";
        savePreparation(root, existing);
        recordStageInvalidated({ root, preparation: existing, result: "invalidated" });
        releaseDurableLease(root, `stage-${node.id}`, existing.ownerToken);
      }
    }

    // Enforce global stage exclusion: no two active stage preparations at once
    checkGlobalStageExclusion(root, node.id);

    // Atomically reserve stage with durable lease (1 hour)
    const acquired = acquireDurableLease({
      root,
      leaseName: `stage-${node.id}`,
      durationMs: 3600000,
      isAgentStage: true,
    });
    stageOwnerToken = acquired.token;
  });

  if (existingMatchingPrep) {
    const currentPath = join(root, "agent/CURRENT.md");
    const instructions = existsSync(currentPath) ? readFileSync(currentPath, "utf8") : "";
    recordStagePrepared({ root, preparation: existingMatchingPrep, reused: true });
    return {
      status: "prepared",
      node,
      preparation: existingMatchingPrep,
      reused: true,
      previewReady: Boolean(state.preview_ready),
      instructions,
    };
  }

  try {
    // Async work outside mutation lock: Jev preflight, packet generation, prompt enrichment
    let jevClient = opts.jevClient;
    let clientInitError: string | undefined;
    if (!jevClient && jevClientRequired(jevConfig)) {
      try {
        jevClient = new JevClient({ root, config: jevConfig, fetch: opts.jevFetch });
      } catch (err: any) {
        clientInitError = err?.message || String(err);
      }
    }

    const preparationId = randomUUID();

    let preflightSummary = "";
    let preflightResult: GroundingPreflightSummary | undefined;
    if (effectiveCapabilities.grounding !== "off" && ["business-review", "narrative-review", "copy-review"].includes(node.id)) {
      if (!jevClient) {
        for (const t of getTasksForCaller(node.id)) {
          recordTaskExecution(root, {
            preparationId,
            nodeId: node.id,
            taskId: t.taskId,
            taskType: t.taskType,
            inputHash: subjectHash ?? immutableHash,
            status: "unavailable",
            failureReason: `Jev client initialization failed: ${clientInitError || "client not configured"}`,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        try {
          preflightResult = await runSemanticGroundingPreflight({
            root,
            client: jevClient,
            nodeId: node.id,
            signal: opts.signal,
            preparationId,
            inputHash: subjectHash ?? immutableHash,
            jevConfig,
          });
          if (effectiveCapabilities.grounding === "assist") {
            preflightSummary = formatPreflightSummary(preflightResult);
          }
        } catch (err: any) {
          for (const t of getTasksForCaller(node.id)) {
            recordTaskExecution(root, {
              preparationId,
              nodeId: node.id,
              taskId: t.taskId,
              taskType: t.taskType,
              inputHash: subjectHash ?? immutableHash,
              status: "unavailable",
              failureReason: `Preflight failed: ${err?.message || String(err)}`,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    }

    let businessDraft: MachineBusinessDraft | undefined;
    let businessDraftStatus: "completed" | "cached" | "no_candidates" | "unavailable" | undefined;
    if (node.id === "business" && effectiveCapabilities.sourceSelection !== "off") {
      if (!jevClient) {
        for (const t of getTasksForCaller(node.id)) {
          recordTaskExecution(root, {
            preparationId,
            nodeId: node.id,
            taskId: t.taskId,
            taskType: t.taskType,
            inputHash: subjectHash ?? immutableHash,
            status: "unavailable",
            failureReason: `Jev client initialization failed: ${clientInitError || "client not configured"}`,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        try {
          const sel = await runBusinessSourceSelection({
            root,
            client: jevClient,
            nodeId: node.id,
            preparationId,
            inputHash: subjectHash ?? immutableHash,
            jevConfig,
            signal: opts.signal,
          });
          businessDraft = sel.draft;
          businessDraftStatus = sel.status;
        } catch (err: any) {
          for (const t of getTasksForCaller(node.id)) {
            recordTaskExecution(root, {
              preparationId,
              nodeId: node.id,
              taskId: t.taskId,
              taskType: t.taskType,
              inputHash: subjectHash ?? immutableHash,
              status: "unavailable",
              failureReason: `Source selection failed: ${err?.message || String(err)}`,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    }

    let qualitySummary = "";
    let creativeSummary = "";
    let componentSummary = "";
    const qualityCapsOn =
      (effectiveCapabilities.coverageCheck !== "off")
      || (effectiveCapabilities.ctaFidelity !== "off")
      || (effectiveCapabilities.claimStrengthening !== "off")
      || (effectiveCapabilities.crossStageContinuity !== "off");
    const syncedGoals = opts.promptOverride ? { invalidatedNodes: [] } : syncGoalContract(root);
    if (syncedGoals.invalidatedNodes.length) {
      for (const id of syncedGoals.invalidatedNodes) {
        if (id === node.id) continue;
        const st = state.nodes[id];
        if (st && (st.status === "done" || st.status === "failed")) {
          invalidate(graph, state, id);
        }
      }
      save(join(root, "agent/STATE.json"), state);
    }
    if (jevClient && qualityCapsOn && ["copy-review", "content-review"].includes(node.id)) {
      try {
        const quality = await runQualityChecks({
          root,
          client: jevClient,
          nodeId: node.id,
          preparationId,
          inputHash: subjectHash ?? immutableHash,
          signal: opts.signal,
          capabilities: effectiveCapabilities,
        });
        if (effectiveCapabilities.coverageCheck === "assist"
          || effectiveCapabilities.ctaFidelity === "assist"
          || effectiveCapabilities.claimStrengthening === "assist"
          || effectiveCapabilities.crossStageContinuity === "assist") {
          qualitySummary = formatQualityFindings(quality.findings);
        }
      } catch {
        /* restore full critic obligation */
      }
    }

    if (resolveDesignAuthoring(root).mode === "blocks-v0" && jevClient && effectiveCapabilities.componentSelection === "assist" && ["representative", "pages"].includes(node.id)) {
      try {
        componentSummary = await attachComponentRecommendations({
          root,
          kernel,
          client: jevClient,
          nodeId: node.id,
          preparationId,
          inputHash: subjectHash ?? immutableHash,
          signal: opts.signal,
        });
      } catch {
        componentSummary = "";
      }
    }

    if (jevClient && effectiveCapabilities.creativeScoring !== "off" && ["direction-review", "representative-review"].includes(node.id)) {
      try {
        const dirPath = join(root, "onboarding/direction.json");
        if (existsSync(dirPath)) {
          const dir = JSON.parse(readFileSync(dirPath, "utf8"));
          const candidates = (dir.candidates || [])
            .map((c: { id?: string; rationale?: string; typography?: string }) => ({
              id: String(c.id || ""),
              proposal: String(c.rationale || c.typography || "").trim(),
            }))
            .filter((c: { id: string; proposal: string }) => c.id && c.proposal);
          if (candidates.length) {
            const creativeContext = buildCreativeCheckContext(root);
            const scores = await scoreCreativeCandidates({
              client: jevClient,
              nodeId: node.id,
              context: `${creativeContext}\n\nDirection theme/personality: ${dir.request || ""} ${dir.system?.personality || ""}`.trim(),
              candidates,
              factualGate: p => !/cannot refuse|guaranteed results you cannot/i.test(p),
            });
            mkdirSync(join(root, "agent/reviews"), { recursive: true });
            const decisionChecks = await scoreDirectionDecisions({
              client: jevClient,
              nodeId: node.id,
              context: creativeContext,
              proposal: candidates.map((c: { id: string; proposal: string }) => `${c.id}: ${c.proposal}`).join("\n"),
            });
            writeFileSync(join(root, "agent/reviews/jev-creative.json"), JSON.stringify({ schemaVersion: 1, nodeId: node.id, scores, decisionChecks }, null, 2), "utf8");
            if (effectiveCapabilities.creativeScoring === "assist") {
              creativeSummary = [
                "## Jev creative dimension scores (advisory; agent keeps the choice)",
                ...scores.map(s => s.status === "complete" && typeof s.combined === "number"
                  ? `- ${s.id}: combined ${s.combined.toFixed(2)}${s.factualGateFailed ? " (factual gate failed; override reason required to keep)" : ""}`
                  : `- ${s.id}: ${s.status} (${s.coverage.observed}/${s.coverage.total} dimensions). Unavailable or partial results are not a measured rejection.`),
                ...decisionChecks.map(check => `- ${check.id}: ${check.state}${check.choice ? ` (${check.choice})` : ""}`),
              ].join("\n");
            }
          }
        }
        const obsPath = join(root, "agent/reviews/visual-observations.json");
        if (existsSync(obsPath)) {
          const obsFile = JSON.parse(readFileSync(obsPath, "utf8"));
          const observations = Array.isArray(obsFile.observations) ? obsFile.observations : [];
          if (observations.length) {
            const mediaScores = await scoreMediaFitFromText({
              client: jevClient,
              nodeId: node.id,
              sectionText: String(obsFile.sectionText || ""),
              observations,
            });
            writeFileSync(join(root, "agent/reviews/jev-media-fit.json"), JSON.stringify({
              schemaVersion: 1,
              nodeId: node.id,
              note: "Scored from supplied text observations only; screenshot/visual gates remain with the agent.",
              scores: mediaScores,
            }, null, 2), "utf8");
          }
        }
      } catch {
        /* restore full agent creative evaluation */
      }
    }

    const useCompact = Boolean(jevConfig.compactPackets && isCompactSupportedNode(node.id));
    let jevRankedEvidence: RankedEvidenceItem[] | undefined;
    let mandatoryEvidenceIds: string[] | undefined;
    if (
      useCompact &&
      ["business-review", "narrative-review", "copy-review"].includes(node.id) &&
      jevClient &&
      effectiveCapabilities.retrievalRanking !== "off"
    ) {
      try {
        const busPath = join(root, "onboarding/business.json");
        if (existsSync(busPath)) {
          const bus = json<Business>(busPath);
          const citedIds = (bus.facts || []).flatMap(f => f.evidence || []);
          const contradictoryIds = (preflightResult?.items || [])
            .filter(i => i.verdict === "contradicted" && i.evidenceId)
            .map(i => i.evidenceId!);
          const ranked = await rankOptionalEvidenceWithJev({
            client: jevClient,
            evidence: bus.evidence || [],
            claims: (bus.facts || []).map(f => ({ id: f.id, claim: f.claim, evidenceIds: f.evidence || [] })),
            citedIds,
            contradictoryIds,
            nodeId: node.id,
            signal: opts.signal,
          });
          mandatoryEvidenceIds = ranked.mandatoryIds;
          if (effectiveCapabilities.retrievalRanking === "assist") {
            jevRankedEvidence = ranked.ranked;
          }
        }
      } catch {
        /* lexical fallback inside buildCompactContextPacket */
      }
    }
    const compactResult = useCompact
      ? buildCompactContextPacket({
          root, kernel, graph, state, node, preflightSummary, jevConfig,
          jevRankedEvidence,
          mandatoryEvidenceIds,
        })
      : null;
    const instructionPacket = contextPacket(root, graph, state, node);
    let basePacket = useCompact && compactResult ? compactResult.packetText : instructionPacket;
    if (!useCompact && preflightSummary.trim()) {
      basePacket += `\n\n## Machine Grounding Preflight Summary:\n${preflightSummary.trim()}\n`;
    }

    let compositionNotes = "";
    if (node.id === "representative" || node.id === "storyboard") {
      const storyPath = join(root, "onboarding/storyboard.json");
      if (existsSync(storyPath)) {
        try {
          const story = json<Storyboard>(storyPath);
          const findings = assessComposition(story);
          if (node.id === "representative") {
            mkdirSync(join(root, "agent/reviews"), { recursive: true });
            writeFileSync(join(root, "agent/reviews/composition-preflight.json"), JSON.stringify({
              schemaVersion: 1,
              nodeId: node.id,
              findings,
              note: "Deterministic structure check. Stylistic concerns stay advisory until a reviewer accepts them.",
            }, null, 2), "utf8");
          }
          if (findings.length) {
            compositionNotes = findings.map(finding => `- ${finding.route}#${finding.section}: ${finding.problem} Repair: ${finding.repair}`).join("\n");
          }
        } catch { /* storyboard may be legacy during early stages */ }
      }
    }
    let preSelectedLessons: ReturnType<typeof selectLessonsForStage> | undefined;
    if (resolveDesignAuthoring(root).mode === "blocks-v0" && ["narrative", "reference-analysis", "direction"].includes(node.id)) {
      preSelectedLessons = selectLessonsForStage(root, node.id === "narrative" ? "narrative" : node.id, node.id === "reference-analysis" ? 4 : 3);
      if (preSelectedLessons.length) {
        try {
          mkdirSync(join(root, "agent/runs"), { recursive: true });
          writeFileSync(join(root, "agent/runs", `${preparationId}.selected-lessons.json`), JSON.stringify({
            schemaVersion: 1,
            nodeId: node.id,
            lessons: preSelectedLessons.map(item => ({
              id: item.id,
              version: item.version,
              contentHash: item.contentHash,
              reason: item.reason,
              expansionHandle: item.expansionHandle,
            })),
          }, null, 2), "utf8");
        } catch { /* selection still appears in the design packet */ }
      }
    }
    let compositionAdvisory = "";
    if (effectiveCapabilities.compositionCheck !== "off" && ["storyboard", "representative"].includes(node.id) && !jevClient) {
      mkdirSync(join(root, "agent/reviews"), { recursive: true });
      writeFileSync(join(root, "agent/reviews/jev-composition.json"), JSON.stringify({
        schemaVersion: 1,
        nodeId: node.id,
        preparationId,
        mode: effectiveCapabilities.compositionCheck,
        findings: [{
          id: "composition",
          state: "unavailable",
          uncertainty: clientInitError || "Jev client was not created. The agent still owns the composition decision. Deterministic preflight is separate.",
        }],
      }, null, 2), "utf8");
    }
    if (jevClient && effectiveCapabilities.compositionCheck !== "off" && ["storyboard", "representative"].includes(node.id)) {
      const storyPath = join(root, "onboarding/storyboard.json");
      if (existsSync(storyPath)) {
        try {
          const story = json<Storyboard>(storyPath);
          const findings = await scoreCompositionRepetition({
            client: jevClient,
            nodeId: node.id,
            story,
            signal: opts.signal,
          });
          mkdirSync(join(root, "agent/reviews"), { recursive: true });
          writeFileSync(join(root, "agent/reviews/jev-composition.json"), JSON.stringify({
            schemaVersion: 1,
            nodeId: node.id,
            preparationId,
            mode: effectiveCapabilities.compositionCheck,
            findings,
            note: "Advisory semantic repetition judgment. Deterministic composition-preflight.json remains a separate structural check. Screenshot review is separate.",
          }, null, 2), "utf8");
          if (effectiveCapabilities.compositionCheck === "assist") {
            compositionAdvisory = [
              "## Jev composition repetition (advisory)",
              ...findings.map(finding => `- ${finding.page || finding.id}: ${finding.state}${finding.choice ? ` (${finding.choice})` : ""}${finding.uncertainty ? ` — ${finding.uncertainty}` : ""}`),
            ].join("\n");
          }
        } catch (error) {
          mkdirSync(join(root, "agent/reviews"), { recursive: true });
          writeFileSync(join(root, "agent/reviews/jev-composition.json"), JSON.stringify({
            schemaVersion: 1,
            nodeId: node.id,
            preparationId,
            mode: effectiveCapabilities.compositionCheck,
            findings: [{ id: "composition", state: "unavailable", uncertainty: error instanceof Error ? error.message : String(error) }],
          }, null, 2), "utf8");
        }
      }
    }
    const mediaAdvisory = ["media", "direction", "storyboard", "representative", "visual-review", "content-review"].includes(node.id) ? await prepareMediaAssistance({root, kernel, stage: node.id, preparationId, capabilities: effectiveCapabilities, client: jevClient, signal: opts.signal}) : "";
    const semantic = await runLifecycleSemanticTasks({
      root, stage: node.id, preparationId, capabilities: effectiveCapabilities,
      model: jevConfig.model, client: jevClient, signal: opts.signal,
      lessonCandidates: preSelectedLessons?.map(item => ({ id: item.id, reason: item.reason })),
    });
    const designPacket = buildDesignContextPacket({
      root,
      kernel,
      nodeId: node.id,
      allowedWrites: node.writes,
      jevMode: jevConfig.mode,
      advisory: jevConfig.mode === "assist" ? creativeSummary : "",
      preSelectedLessons,
      preparationId,
    });
    if (compositionNotes) {
      designPacket.text += `\n\n## Composition preflight\n${compositionNotes}\n`;
      designPacket.manifest.charCount = designPacket.text.length;
      designPacket.manifest.byteCount = Buffer.byteLength(designPacket.text, "utf8");
      designPacket.manifest.tokenEstimate = Math.ceil(designPacket.text.length / 4);
    }
    if (compositionAdvisory.trim()) {
      designPacket.text += `\n\n${compositionAdvisory}\n`;
    }
    if (mediaAdvisory) designPacket.text += `\n\n${mediaAdvisory}\n`;
    const semanticNote = semanticAssistNote(effectiveCapabilities);
    if (semanticNote) designPacket.text += `\n\n${semanticNote}\n`;
    if (semantic.advisory) designPacket.text += `\n\n${semantic.advisory}\n`;
    designPacket.manifest.charCount = designPacket.text.length;
    designPacket.manifest.byteCount = Buffer.byteLength(designPacket.text, "utf8");
    designPacket.manifest.tokenEstimate = Math.ceil(designPacket.text.length / 4);
    try {
      mkdirSync(join(root, "agent/runs"), { recursive: true });
      persistDesignContextArtifacts(root, preparationId, designPacket);
    } catch { /* packet text still reaches the agent */ }
    const designPrimary = DESIGN_CONTEXT_STAGES.has(node.id);
    const promptCore = designPrimary
      ? supplementDesignContext(instructionPacket, designPacket.text)
      : basePacket;
    let prompt = enrichPrompt(root, kernel, node, promptCore);
    if (!designPrimary && designPacket.text.trim()) prompt += `\n\n${designPacket.text}\n`;

    // If author retry, append focused repair packet
    if (node.kind === "agent" && (state.nodes[node.id]?.attempts || 0) > 0) {
      try {
        const repair = buildRepairPacket({ root, kernel, node, state, graph });
        if (repair.failedFindings.length > 0 || repair.contextSlice) {
          prompt += `\n\n## FOCUSED REPAIR INSTRUCTIONS:\n${repair.contextSlice}\n### Invariants to Preserve:\n${repair.preservationInvariants.map(inv => `- ${inv}`).join("\n")}\n### Fast Local Verification Command:\n${repair.verificationCommand}\n`;
        }
      } catch {}
    }

    if (qualitySummary.trim()) {
      prompt += `\n\n${qualitySummary}\n`;
    }
    if (creativeSummary.trim()) {
      prompt += `\n\n${creativeSummary}\n`;
    }
    if (componentSummary.trim()) {
      prompt += `\n\n${componentSummary}\n`;
    }

    // Assist source-selection: additive machine draft + full transcription list.
    // Shadow must not change the consumed packet.
    if (node.id === "business" && effectiveCapabilities.sourceSelection === "assist" && businessDraft) {
      const allFields = [
        ...businessDraft.selected.map(s => s.field),
        ...businessDraft.unresolved.map(u => u.field),
      ];
      prompt += `\n${formatMachineDraft(businessDraft)}${formatTranscriptionObligations(allFields)}`;
    }

    const ownershipOutcomes: Array<{
      taskId: string;
      eligible: boolean;
      reasons: string[];
      coveredObligationIds: string[];
    }> = [];
    let packetReduced = false;
    if ((jevConfig.workOwnership ?? "agent") === "delegated") {
      const remaining = remainingPilotBudget(root, jevConfig.pilotBudget);
      for (const t of getTasksForCaller(node.id)) {
        const manifest = loadTaskManifest(root, preparationId, t.taskId);
        const exec = loadTaskExecution(root, preparationId, t.taskId);
        const siteAuthoredEligible = (jevConfig.calibrationGates || []).some(g => g.taskId === t.taskId && g.eligible);
        const siteContext = assessSiteTaskContext(root, t.taskId);
        const expectedSemantics = questionSemanticsForTask(t.taskId, t.taskType);
        const verify = exec
          ? verifyTaskExecution(root, preparationId, node.id, t, subjectHash ?? immutableHash, {
              expectedModel: jevConfig.model,
              expectedQuestionSemantics: expectedSemantics,
              expectedSubjectHash: subjectHash ?? immutableHash,
            })
          : { ok: false, reason: "No execution record" };
        const verifiedCompleted =
          verify.ok && (exec?.status === "completed" || exec?.status === "cached");
        const coverage =
          t.taskId === "business-source-selection" && businessDraft
            ? {
                complete:
                  businessDraft.candidateCoverage.length > 0 &&
                  businessDraft.candidateCoverage.every(c => c.complete) &&
                  businessDraftStatus !== "unavailable",
                candidateCount: businessDraft.candidateCoverage.reduce((n, c) => n + c.candidateCount, 0),
                evaluatedCount: businessDraft.candidateCoverage.reduce((n, c) => n + c.evaluatedCount, 0),
                coveredObligationIds: businessDraft.candidateCoverage
                  .filter(c => fieldTranscriptionRemovable(businessDraft, c.field))
                  .map(c => c.field),
                retainedObligationIds: [
                  ...new Set([
                    ...businessDraft.unresolved.map(u => u.field),
                    ...businessDraft.candidateCoverage.filter(c => !fieldTranscriptionRemovable(businessDraft, c.field)).map(c => c.field),
                  ]),
                ],
                missingEvidenceIds: [] as string[],
                conflictingClaimIds: businessDraft.conflicts.map(c => c.field),
                staleEvidence: false,
              }
            : assessPreflightCoverage(preflightResult?.items ?? []);
        const executionStatus = !exec
          ? undefined
          : exec.status === "unavailable"
            ? "unavailable"
            : exec.status === "no_candidates"
              ? "no_candidates"
              : exec.status === "partial"
                ? "incomplete"
              : verifiedCompleted
                ? exec.status
                : "failed";
        const outcome = evaluateDelegationEligibility({
          config: jevConfig,
          taskId: t.taskId,
          siteContext,
          coverage,
          manifest: {
            present: Boolean(manifest),
            current: Boolean(
              manifest &&
                verify.ok &&
                manifest.expectedModel === jevConfig.model &&
                manifest.questionSemanticsHash === expectedSemantics &&
                (!manifest.subjectHash || manifest.subjectHash === (subjectHash ?? immutableHash))
            ),
            expectedModel: manifest?.expectedModel,
            expectedQuestionSemantics: manifest?.questionSemanticsHash,
            batchStateHashes: manifest?.batchStateHashes,
            subjectHash: manifest?.subjectHash,
          },
          remainingBudget: remaining,
          pilotContext: opts.pilotContext,
          executionStatus,
          kernelRevision: opts.kernelRevision,
          siteAuthoredEligible,
          registryDelegationEligible: t.delegationEligible === true,
          questionSemanticsHash: expectedSemantics,
        });
        ownershipOutcomes.push({
          taskId: t.taskId,
          eligible: outcome.eligible,
          reasons: outcome.reasons,
          coveredObligationIds: outcome.coveredObligationIds,
        });
        if (outcome.eligible) {
          if (t.taskId === "business-source-selection" && businessDraft) {
            const reduced = applyBusinessAuthorPacketReduction({
              packet: prompt,
              eligible: true,
              draft: businessDraft,
            });
            prompt = reduced.packet;
            packetReduced = packetReduced || reduced.reduced;
          } else {
            const reduced = applyDelegatedPacketReduction({
              packet: prompt,
              eligible: true,
              coveredObligationIds: outcome.coveredObligationIds,
              retainedItems: (preflightResult?.items ?? []).filter(i => outcome.retainedObligationIds.includes(i.id)),
              retainedDuties: DEFAULT_RETAINED_DUTIES,
            });
            prompt = reduced.packet;
            packetReduced = packetReduced || reduced.reduced;
          }
        }
      }
    }

    let overflowHash: string | undefined;

    // Enforce context budget ONLY when compact packets are enabled
    if (useCompact) {
      const maxPromptChars = DEFAULT_PACKET_BUDGETS[node.id]?.maxChars || 40000;
      const headerEst = 300;
      const availableChars = Math.max(1000, maxPromptChars - headerEst);
      if (prompt.length > availableChars) {
        // Partition optional sections (Evidence & Data, Preflight) while strictly preserving
        // typed mandatory sections (Contracts, Review Boundary, SubjectHash, Repair, Outputs)
        const evidenceHeader = "\n## Active Evidence & Data:\n";
        const preflightHeader = "\n## Machine Grounding Preflight Summary:\n";
        const outputHeader = "\nWrite output to:";
        const repairHeader = "\n\n## FOCUSED REPAIR INSTRUCTIONS:";

        // Find boundary of mandatory tail
        let tailIndex = -1;
        if (prompt.includes(repairHeader)) {
          tailIndex = prompt.indexOf(repairHeader);
        } else if (prompt.includes(outputHeader)) {
          tailIndex = prompt.indexOf(outputHeader);
        }

        // Find boundary of optional body
        let optionalStart = -1;
        if (prompt.includes(evidenceHeader)) {
          optionalStart = prompt.indexOf(evidenceHeader) + evidenceHeader.length;
        } else if (prompt.includes(preflightHeader)) {
          optionalStart = prompt.indexOf(preflightHeader) + preflightHeader.length;
        }

        if (optionalStart !== -1 && tailIndex > optionalStart) {
          const mandatoryHead = prompt.slice(0, optionalStart);
          const optionalContent = prompt.slice(optionalStart, tailIndex);
          const mandatoryTail = prompt.slice(tailIndex);

          const overhead = 300; // notice text length estimate
          if (mandatoryHead.length + mandatoryTail.length + overhead > maxPromptChars) {
            throw new Error(`Mandatory packet constraints for "${node.id}" (${mandatoryHead.length + mandatoryTail.length} chars) exceed budget (${maxPromptChars} chars)`);
          }

          const budgetForOptional = Math.max(0, availableChars - mandatoryHead.length - mandatoryTail.length - overhead);

          if (optionalContent.length > budgetForOptional) {
            // Partition by discrete structured block boundaries (headings or list items)
            const blocks = optionalContent.split(/(?=\n\n(?:###|##|-|\*))/g);
            let currentLen = 0;
            const keptBlocks: string[] = [];
            const excessBlocks: string[] = [];

            for (const block of blocks) {
              if (currentLen + block.length <= budgetForOptional) {
                keptBlocks.push(block);
                currentLen += block.length;
              } else {
                excessBlocks.push(block);
              }
            }

            const keptOptional = keptBlocks.join("");
            const excessText = excessBlocks.join("");

            if (excessText.length > 0) {
              overflowHash = sha256Hex(excessText);
              const overflowPath = join(root, "agent/runs", `${preparationId}.overflow.json`);
              mkdirSync(join(root, "agent/runs"), { recursive: true });
              save(overflowPath, {
                schemaVersion: 1,
                preparationId,
                nodeId: node.id,
                overflowHash,
                overflowChars: excessText.length,
                overflowText: excessText,
              });

              const overflowNotice = `\n\n[Optional context partitioned to agent/runs/${preparationId}.overflow.json (hash: ${overflowHash}, ${excessText.length} chars) to maintain prompt budget of ${maxPromptChars} chars]\n\n`;
              prompt = mandatoryHead + keptOptional + overflowNotice + mandatoryTail;
            }
          }
        }
      }
    }

    // Save newly incurred Jev spend to STATE.json after preflight
    if (jevConfig.mode !== "off") {
      const jevSpend = aggregateJevReceiptSpend(root);
      state.cumulativeSpend ||= { iterations: 0, calls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };
      state.cumulativeSpend.jevCalls = Math.max(state.cumulativeSpend.jevCalls || 0, jevSpend.calls);
      state.cumulativeSpend.jevInputTokens = Math.max(state.cumulativeSpend.jevInputTokens || 0, jevSpend.inputTokens);
      state.cumulativeSpend.jevOutputTokens = Math.max(state.cumulativeSpend.jevOutputTokens || 0, jevSpend.outputTokens);
      save(join(root, "agent/STATE.json"), state);
    }

    const baselineInventory = snapshotInventory(root);
    const protectedSourceFingerprint = fingerprint(root, PROTECTED_SOURCE_PATHS);
    const captureFingerprint = fingerprint(root, CAPTURE_PATHS);
    const packetHash = instructionContractHash(root, node);

    const header = [
      `# ACTIVE STAGE: ${node.id} (${node.kind})`,
      `Preparation ID: ${preparationId}`,
      `Graph Version: ${graph.version}`,
      `Allowed Writes: ${deps.expectedOutputs.join(", ") || "None"}`,
      `Complete this stage with: npm run go -- --complete --preparation ${preparationId}`,
      ...(node.id === "representative-quality" && productionQuality(root) ? [
        `For an active-agent visual review, complete with: npm run go -- --complete --preparation ${preparationId} --visual-tool-events ABSOLUTE_EVENTS_JSON`,
        "First actually open the current probe and every representative PNG. Record only successful image tool calls you performed as [{tool,path,success:true,hash}] with their actual paths and raw PNG SHA256; keep the events JSON outside the protected site tree. The completion runner binds these events to this preparation and current bytes. Self-recorded events are not an exported host transcript or an independent review. Do not write a receipt yourself or invent adapter logs, dataBlobIds, session identifiers or image events. If pixels are unavailable, fail closed. See production-quality for details; preserve a configured adapter's own supported receipt path.",
      ] : []),
      "",
    ].join("\n");

    const suppliedPrompt = opts.promptOverride ?? prompt;
    const identity = themeDependentNode(node) && !suppliedPrompt.includes('## Selected visual identity') ? selectedThemeContext(root) + templateAdaptationGuidance(root) : '';
    const contentGuidance = suppliedPrompt.includes('## Supplied business content') ? '' : additionalContentGuidance(root);
    const fullCurrentContent = header + suppliedPrompt + contentGuidance + (identity ? '\n\n' + identity : '');
    if (useCompact) {
      const maxPromptChars = DEFAULT_PACKET_BUDGETS[node.id]?.maxChars || 40000;
      if (fullCurrentContent.length > maxPromptChars) {
        throw new Error(`Packet content for "${node.id}" (${fullCurrentContent.length} chars) strictly exceeds max budget of ${maxPromptChars} chars`);
      }
    }
    const promptHash = sha256Hex(fullCurrentContent);
    try {
      const spend = aggregateJevReceiptSpend(root);
      writeNodeObservation(root, {
        preparationId,
        nodeId: node.id,
        packetBytes: Buffer.byteLength(fullCurrentContent, "utf8"),
        packetTokenEstimate: Math.ceil(fullCurrentContent.length / 4),
        jevAttempts: spend.transportAttempts,
        jevCacheHits: spend.cacheHits,
        jevTokens: spend.inputTokens + spend.outputTokens,
        jevLatencyMs: spend.durationMs,
        artifactHashes: { prompt: promptHash, immutable: immutableHash },
      });
    } catch { /* observation is best-effort */ }

    // Short mutation lock 2: publish preparation and CURRENT.md
    const published = withMutationLock(root, (): PrepareStageResult => {
      // Publication revalidation: ensure stage lease exists, is valid, is still owned, and not expired
      const leasePath = join(root, "agent/leases", `stage-${node.id}.json`);
      if (!existsSync(leasePath)) {
        throw new Error(`Missing lease file for stage "${node.id}"; cannot prepare stage without an active lease.`);
      }
      let currentLease: any;
      try {
        currentLease = JSON.parse(readFileSync(leasePath, "utf8"));
      } catch (err: any) {
        throw new Error(`Corrupt lease file for stage "${node.id}": ${err?.message || String(err)}`);
      }
      if (!currentLease || typeof currentLease !== "object") {
        throw new Error(`Invalid lease payload for stage "${node.id}"`);
      }
      if (currentLease.ownerToken !== stageOwnerToken) {
        throw new Error(`Stage lease for "${node.id}" was taken over by another token (${currentLease.ownerToken})`);
      }
      if (!currentLease.expiresAt || Date.now() >= new Date(currentLease.expiresAt).getTime()) {
        throw new Error(`Stage lease for "${node.id}" expired at ${currentLease.expiresAt}`);
      }

      // Recheck immutable hash for freshness
      const postAsyncImmutableHash = computeImmutableHash(root, deps.immutableDependencies, node.id);
      if (postAsyncImmutableHash !== immutableHash) {
        throw new Error(`Inputs for "${node.id}" were modified during stage preparation`);
      }

      writeFileSync(join(root, "agent/CURRENT.md"), fullCurrentContent, "utf8");

      const preparation: StagePreparation = {
        ...(node.id === "asset-production" ? { mediaAuditSnapshot: readFileSync(join(root, "onboarding/media-inventory.json"), "utf8") } : {}),
        schemaVersion: 1,
        id: preparationId,
        nodeId: node.id,
        runId: `${state.iteration}-${node.id}`,
        ownerToken: stageOwnerToken,
        leaseExpiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour durable lease
        graphVersion: graph.version,
        contractVersion: "2026-09-17",
        nodeContractHash: sha256Hex(JSON.stringify(node)),
        immutableDependencies: deps.immutableDependencies,
        immutableHash,
        editableInputs: deps.editableInputs,
        expectedOutputs: deps.expectedOutputs,
        protectedSourceFingerprint,
        captureFingerprint,
        reviewSubjectHash: subjectHash,
        baselineInventory,
        packetHash,
        promptHash,
        overflowHash,
        manifestHash: compactResult?.manifest?.manifestHash,
        manifestId: compactResult?.manifest?.manifestHash ? `${node.id}.manifest.json` : undefined,
        authoringPolicy: resolveDesignAuthoring(root),
        capabilitiesSnapshot: snapshotEffectiveConfig(jevConfig),
        ownershipSnapshot: {
          workOwnership: jevConfig.workOwnership ?? "agent",
          packetReduced,
          outcomes: ownershipOutcomes,
        },
        attempt: (state.nodes[node.id]?.attempts || 0) + 1,
        status: "prepared",
        preparedAt: new Date().toISOString(),
      };

      savePreparation(root, preparation);

      return {
        status: "prepared" as const,
        node,
        preparation,
        reused: false,
        previewReady: Boolean(state.preview_ready),
        instructions: fullCurrentContent,
      };
    });
    if (published.preparation) {
      recordStagePrepared({ root, preparation: published.preparation, reused: false });
    }
    return published as PrepareStageResult;
  } catch (err) {
    // If an error occurred after acquiring stage lease, release the lease so it's not stranded!
    releaseDurableLease(root, `stage-${node.id}`, stageOwnerToken);
    throw err;
  }
}

/**
 * Executes a deterministic tool stage locally without any model adapter.
 * Validates eligibility, checks capture and allowed writes boundaries,
 * handles abort signals, and updates state via two-phase commit journal.
 */
export async function executeToolStage(opts: ExecuteToolOptions): Promise<ExecuteToolResult> {
  const { root, kernel, graph, state, node } = opts;
  if (node.kind !== "tool") throw new Error(`Node "${node.id}" is not a tool node`);

  // Eligibility check
  if (!node.needs.every(depId => state.nodes[depId]?.status === "done")) {
    throw new Error(`Cannot execute tool node "${node.id}": dependencies [${node.needs.filter(d => state.nodes[d]?.status !== "done").join(", ")}] are not satisfied`);
  }

  // Check remaining attempts before launch
  const currentAttempts = state.nodes[node.id]?.attempts || 0;
  if (currentAttempts >= node.maxAttempts) {
    throw new Error(`Exhausted ${node.id}: attempt budget of ${node.maxAttempts} exceeded`);
  }

  // Global stage exclusion
  checkGlobalStageExclusion(root, node.id);

  const { token: leaseToken, release: releaseLease } = acquireDurableLease({
    root,
    leaseName: `tool-${node.id}`,
    durationMs: opts.timeoutMs || 300000,
  });

  const started = Date.now();
  mkdirSync(join(root, "agent/runs"), { recursive: true });
  const deps = categorizeNodeDependencies({ root, node });
  const protectedBefore = fingerprint(root, PROTECTED_SOURCE_PATHS);
  const captureBefore = fingerprint(root, CAPTURE_PATHS);
  const priorNodeStatuses = Object.fromEntries(
    Object.entries(state.nodes).map(([id, st]) => [id, st.status])
  );

  const transactionId = randomUUID();
  const currentIteration = (state.iteration || 0) + 1;
  const statePath = join(root, "agent/STATE.json");
  const receiptPath = join(root, "agent/runs", `${currentIteration}-${node.id}.json`);
  let execBinary = process.execPath;
  let finalArgs: string[] = [];

  try {
    state.nodes[node.id] = {
      status: "in_progress",
      attempts: currentAttempts,
    };
    state.current = node.id;
    save(statePath, state);

    // Journal tool intent before launching child process
    writeCommitJournal(root, {
      transactionId,
      preparationId: `tool-${node.id}-${started}`,
      nodeId: node.id,
      phase: "intent",
      statePath,
      receiptPath,
      createdAt: new Date(started).toISOString(),
    });

    const baselineInventory = snapshotInventory(root);

    const rawArgs = node.command || [];
    if (!rawArgs.length) throw new Error(`Missing command for tool node: ${node.id}`);
    const resolvedArgs = preferBundledToolArgs(kernel, rawArgs.map(a => a.replaceAll("{harness}", kernel).replaceAll("{kernel}", kernel).replaceAll("{site}", root)));

    if (opts.signal?.aborted) {
      throw (opts.signal.reason instanceof Error ? opts.signal.reason : new Error(String(opts.signal.reason || "Aborted before tool execution")));
    }

    if (resolvedArgs[0] === process.execPath || resolvedArgs[0] === "node" || resolvedArgs[0]?.endsWith("node.exe")) {
      execBinary = resolvedArgs[0];
      finalArgs = resolvedArgs.slice(1);
    } else {
      execBinary = process.execPath;
      finalArgs = resolvedArgs;
    }

    let stdout = "";
    let stderr = "";
    let childSignal: string | null = null;
    let aborted = Boolean(opts.signal?.aborted);
    let timedOut = false;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let exitCode = 0;

    if (opts.injectedExecutor) {
      await opts.injectedExecutor();
    } else {
    // Execute via local node runtime without model adapter asynchronously
    const child = spawn(execBinary, finalArgs, {
      cwd: root,
      env: {
        ...process.env,
        VITRIS_TOOL_NODE: node.id,
        VITRIS_WORKER_NODE: node.id,
        VITRIS_RUNNER_PID: String(process.pid),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => { stdout += chunk; });
    }
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", chunk => { stderr += chunk; });
    }

    const abortHandler = () => {
      aborted = true;
      if (child.pid) killProcessTree(child.pid);
    };

    if (opts.signal) {
      if (opts.signal.aborted) abortHandler();
      else opts.signal.addEventListener("abort", abortHandler, { once: true });
    }

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        if (child.pid) killProcessTree(child.pid);
      }, opts.timeoutMs);
    }

    exitCode = await new Promise((resolve) => {
      let settled = false;
      const done = (code: number | null, sig: string | null) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (opts.signal) opts.signal.removeEventListener("abort", abortHandler);
        childSignal = sig;
        resolve(code ?? (aborted || sig ? 128 : 1));
      };
      child.on("close", (code, sig) => done(code, sig));
      child.on("error", () => done(1, null));
    });
    }

    const durationMs = Date.now() - started;

    const outputPath = join(root, "agent/runs", `${currentIteration}-${node.id}.log`);
    writeFileSync(outputPath, stdout + (stdout && stderr ? "\n" : "") + stderr, "utf8");

    const usagePath = join(root, "agent/runs", `${currentIteration}-${node.id}.usage.json`);
    save(usagePath, {
      nodeId: node.id,
      role: "tool",
      model: "tool",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs,
      startedAt: new Date(started).toISOString(),
      status: exitCode,
      signal: childSignal,
      timedOut,
    });

    const failures: string[] = [];
    if (childSignal || (opts.signal && opts.signal.aborted) || aborted) {
      failures.push(`Tool execution aborted by signal: ${childSignal || "SIGINT"}`);
    } else if (exitCode !== 0) {
      failures.push(`Tool execution failed with exit code ${exitCode}: ${stderr.slice(-300)}`);
    }

    const graded = gradeNode(root, node.eval);
    if (!graded.ok) failures.push(...graded.failures);
    if (["media", "storyboard", "representative", "visual-review", "content-review"].includes(node.id)) failures.push(...validateMediaSelection(root, undefined, node.id !== "media"));
    if (["visual-review", "content-review"].includes(node.id)) failures.push(...validateRenderedMedia(root));

    // Allowed writes enforcement
    const writeVerification = verifyAllowedWrites({
      root,
      node,
      baselineInventory,
      allowedWrites: deps.expectedOutputs,
    });
    if (!writeVerification.ok) {
      failures.push(...writeVerification.violations);
    }

    // Capture boundary enforcement: non-harvest tools cannot mutate capture paths
    if (node.id !== "harvest" && captureBefore !== fingerprint(root, CAPTURE_PATHS)) {
      failures.push("Tool mutated captured evidence outside harvest stage.");
    }

    // Commit Journal for tool stage
    const targetState = computeNextState({
      root,
      graph,
      currentState: state,
      node,
      failures,
      durationMs,
    });

    const receipt: ToolExecutionReceipt = {
      nodeId: node.id,
      kind: "tool",
      command: [execBinary, ...finalArgs],
      exitCode,
      durationMs,
      startedAt: new Date(started).toISOString(),
      failures,
      outputPath,
    };

    withMutationLock(root, () => {
      writeCommitJournal(root, {
        transactionId,
        preparationId: `tool-${node.id}-${started}`,
        nodeId: node.id,
        phase: "graded",
        statePath,
        receiptPath,
        targetState,
        updatedPreparation: receipt,
        createdAt: new Date().toISOString(),
      });

      save(statePath, targetState);
      updateCommitJournalPhase(root, "state_written");
      save(receiptPath, receipt);
      clearCommitJournal(root);
      Object.assign(state, targetState);
    });

    recordToolCompleted({
      root,
      nodeId: node.id,
      receipt,
      iteration: currentIteration,
      priorNodeStatuses,
      state,
    });

    return {
      ok: failures.length === 0,
      nodeId: node.id,
      exitCode,
      failures,
      durationMs,
      stdout,
      stderr,
    };
  } catch (err: any) {
    if (opts.signal?.aborted || err === opts.signal?.reason || err?.name === "AbortError") {
      throw err;
    }
    const durationMs = Date.now() - started;
    const failures = [`Tool execution crashed: ${err?.message || String(err)}`];
    const targetState = computeNextState({
      root,
      graph,
      currentState: state,
      node,
      failures,
      durationMs,
    });
    const receipt: ToolExecutionReceipt = {
      nodeId: node.id,
      kind: "tool",
      command: [execBinary, ...finalArgs],
      exitCode: 1,
      durationMs,
      startedAt: new Date(started).toISOString(),
      failures,
      outputPath: join(root, "agent/runs", `${currentIteration}-${node.id}.log`),
    };
    withMutationLock(root, () => {
      save(statePath, targetState);
      save(receiptPath, receipt);
      clearCommitJournal(root);
      Object.assign(state, targetState);
    });
    recordToolCompleted({
      root,
      nodeId: node.id,
      receipt,
      iteration: currentIteration,
      priorNodeStatuses,
      state,
    });
    return {
      ok: false,
      nodeId: node.id,
      exitCode: 1,
      failures,
      durationMs,
      stdout: "",
      stderr: String(err?.stack || err?.message || err),
    };
  } finally {
    releaseLease();
  }
}

/**
 * Completes a prepared stage with strict provenance, allowed-writes enforcement,
 * manifest and partition verification, and crash-safe two-phase commit journaling.
 */
export async function completeStage(opts: CompleteStageOptions): Promise<CompleteStageResult> {
  const { root, kernel, graph, state, preparationId } = opts;

  if (!preparationId) {
    throw new Error("Missing preparation ID for stage completion. Complete requires an existing preparation.");
  }

  // Reconcile any in-flight crash journal first and retain freshness
  const recovery = recoverCommitJournal(root, graph);
  if (recovery.recovered && recovery.targetState) {
    Object.assign(state, recovery.targetState);
  }

  // Validate agent usage if provided: finite non-negative integers
  if (opts.agentUsage) {
    if (opts.agentUsage.inputTokens !== undefined) {
      if (!Number.isInteger(opts.agentUsage.inputTokens) || opts.agentUsage.inputTokens < 0) {
        throw new Error(`Invalid agent input tokens: ${opts.agentUsage.inputTokens}. Must be a finite, non-negative integer.`);
      }
    }
    if (opts.agentUsage.outputTokens !== undefined) {
      if (!Number.isInteger(opts.agentUsage.outputTokens) || opts.agentUsage.outputTokens < 0) {
        throw new Error(`Invalid agent output tokens: ${opts.agentUsage.outputTokens}. Must be a finite, non-negative integer.`);
      }
    }
  }

  const priorNodeStatuses = Object.fromEntries(
    Object.entries(state.nodes).map(([id, st]) => [id, st.status])
  );

  const result = withMutationLock(root, () => {
    const prep = loadPreparation(root, preparationId);
    if (!prep) throw new Error(`Preparation "${preparationId}" not found`);

    const invalidate = (reason: string, message: string): never => {
      prep.status = "invalidated";
      prep.invalidationReason = reason;
      savePreparation(root, prep);
      recordStageInvalidated({ root, preparation: prep, result: "invalidated" });
      releaseDurableLease(root, `stage-${prep.nodeId}`, prep.ownerToken);
      throw new Error(message);
    };

    if (opts.nodeId && prep.nodeId !== opts.nodeId) {
      throw new Error(`Preparation "${preparationId}" is for node "${prep.nodeId}", expected "${opts.nodeId}"`);
    }

    // Idempotent completion check
    if (prep.status === "consumed") {
      if (opts.agentUsage) throw new Error(`Usage was already submitted for preparation "${preparationId}"`);
      return {
        ok: prep.result?.ok ?? true,
        nodeId: prep.nodeId,
        preparationId,
        failures: prep.result?.failures || [],
        state,
        preparation: prep,
        idempotentReplay: true,
      };
    }

    if (prep.status === "invalidated" || prep.status === "canceled") {
      throw new Error(`Cannot complete ${prep.status} preparation "${preparationId}": ${prep.invalidationReason || "Preparation is no longer active"}`);
    }

    // Revalidate durable lease ownership and non-expiry (fail-closed on missing, corrupt, token mismatch, or expired leases)
    const leasePath = join(root, "agent/leases", `stage-${prep.nodeId}.json`);
    if (!existsSync(leasePath)) {
      throw new Error(`Missing lease file for stage "${prep.nodeId}"; cannot complete preparation "${preparationId}" without an active lease.`);
    }
    let lease: any;
    try {
      lease = JSON.parse(readFileSync(leasePath, "utf8"));
    } catch (err: any) {
      throw new Error(`Corrupt lease file for stage "${prep.nodeId}"; cannot complete preparation "${preparationId}": ${err?.message || String(err)}`);
    }
    if (!lease || typeof lease !== "object") {
      throw new Error(`Invalid lease payload for stage "${prep.nodeId}"; cannot complete preparation "${preparationId}"`);
    }
    if (lease.ownerToken && lease.ownerToken !== prep.ownerToken) {
      throw new Error(`Lease for stage "${prep.nodeId}" is owned by another token (${lease.ownerToken}); cannot complete preparation "${preparationId}"`);
    }
    if (!lease.expiresAt || Date.now() >= new Date(lease.expiresAt).getTime()) {
      throw new Error(`Lease for stage "${prep.nodeId}" expired at ${lease.expiresAt}; cannot complete preparation "${preparationId}"`);
    }

    // Graph version check
    if (prep.graphVersion !== graph.version) {
      invalidate(
        `Graph version mismatch: prepared with version ${prep.graphVersion}, current graph is version ${graph.version}`,
        `Stale preparation "${preparationId}": graph version changed`
      );
    }

    const node = graph.nodes.find(n => n.id === prep.nodeId);
    if (!node) throw new Error(`Node "${prep.nodeId}" not found in graph`);
    applyStagePolicyInputs(root, node);
    if (prep.nodeContractHash && prep.nodeContractHash !== sha256Hex(JSON.stringify(node))) {
      invalidate("Stage contract changed", `Stale preparation "${preparationId}": stage contract changed`);
    }

    // Eligibility check: node dependencies must be satisfied in current state
    if (!node.needs.every(depId => state.nodes[depId]?.status === "done")) {
      invalidate(
        `Node dependencies not met in state`,
        `Cannot complete stage "${node.id}": dependencies not met`
      );
    }

    // Freshness Check 1: Immutable dependencies must not have changed
    const currentImmutableHash = computeImmutableHash(root, prep.immutableDependencies, node.id);
    if (currentImmutableHash !== prep.immutableHash) {
      invalidate(
        "Immutable dependencies changed between preparation and completion",
        `Stale preparation "${preparationId}": immutable dependencies were modified`
      );
    }

    // Freshness Check 2: Review subject must not have changed for critic nodes
    if (node.kind === "critic") {
      const currentSubject = stageSubject(root, node);
      if (currentSubject !== prep.reviewSubjectHash) {
        invalidate(
          "Review subject was modified between preparation and critic completion",
          `Stale critic preparation "${preparationId}": review subject changed`
        );
      }
    }

    // Active-agent visual quality provenance
    if (node.id === "representative-quality" && opts.visualToolEvents) {
      recordActiveAgentQualityReceipt({
        root,
        preparationId,
        toolEvents: opts.visualToolEvents,
        environment: opts.environment,
      });
    }

    // Freshness Check 3: Protected fingerprints
    const currentProtected = fingerprint(root, PROTECTED_SOURCE_PATHS);
    const currentCapture = fingerprint(root, CAPTURE_PATHS);

    const criticChangedSource = node.kind === "critic" && prep.protectedSourceFingerprint !== currentProtected;
    const captureChanged = node.id !== "harvest" && prep.captureFingerprint !== currentCapture;

    // Freshness Check 4: Allowed Writes
    const writeVerification = verifyAllowedWrites({
      root,
      node,
      baselineInventory: prep.baselineInventory,
      allowedWrites: prep.expectedOutputs,
    });

    // Freshness Check 5: Prompt integrity check
    if (prep.promptHash && existsSync(join(root, "agent/CURRENT.md"))) {
      const currentPromptContent = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
      if (sha256Hex(currentPromptContent) !== prep.promptHash) {
        invalidate(
          "agent/CURRENT.md content changed or was overwritten",
          `Stale preparation "${preparationId}": agent/CURRENT.md content has changed`
        );
      }
    }

    // Freshness Check 6: Manifest integrity and partition coverage
    const failures: string[] = [...(opts.executionFailures || [])];
    if (prep.manifestHash) {
      const manifestFile = join(root, "agent/runs", `${prep.nodeId}.manifest.json`);
      if (!existsSync(manifestFile)) {
        failures.push(`Manifest integrity check failed: missing ${prep.nodeId}.manifest.json`);
      } else {
        try {
          const loadedManifest = JSON.parse(readFileSync(manifestFile, "utf8")) as CoverageManifest;
          const recomputed = computeManifestHash(loadedManifest);
          if (recomputed !== prep.manifestHash) {
            failures.push(`Manifest integrity check failed: manifest content recomputed hash ${recomputed} does not match preparation record ${prep.manifestHash}`);
          }
          // Coverage check for required partitions
          if (loadedManifest.requiredPartitions && loadedManifest.requiredPartitions.length > 0 && node.kind === "critic") {
            const reviewPath = join(root, "agent/reviews", `${node.id}.json`);
            if (existsSync(reviewPath)) {
              try {
                const reviewObj = JSON.parse(readFileSync(reviewPath, "utf8")) as Review;
                const coveredPartitions = new Set<string>();
                if (Array.isArray(reviewObj.partitions)) {
                  for (const p of reviewObj.partitions) coveredPartitions.add(p);
                }
                if (Array.isArray((reviewObj as any).partitionResults)) {
                  for (const pr of (reviewObj as any).partitionResults) {
                    if (pr.partition && (pr.verdict === "pass" || pr.verdict === "fail")) {
                      coveredPartitions.add(pr.partition);
                    }
                  }
                }
                const missing = loadedManifest.requiredPartitions.filter(rp => !coveredPartitions.has(rp));
                if (missing.length > 0) {
                  failures.push(`Review does not cover all required partitions: ${missing.join(", ")}`);
                }
              } catch {
                failures.push(`Could not parse review to verify required partitions`);
              }
            }
          }
        } catch {
          failures.push(`Could not read manifest file to verify integrity`);
        }
      }
    }

    // Freshness Check 7: Overflow context file integrity check
    if (prep.overflowHash) {
      const overflowFile = join(root, "agent/runs", `${prep.id}.overflow.json`);
      if (!existsSync(overflowFile)) {
        failures.push(`Overflow integrity check failed: missing ${prep.id}.overflow.json`);
      } else {
        try {
          const overflowContent = readFileSync(overflowFile, "utf8");
          const overflowObj = JSON.parse(overflowContent);
          // Always recompute digest of actual text content; never trust declared overflowHash
          const actualTextHash = sha256Hex(overflowObj.overflowText ?? "");
          if (actualTextHash !== prep.overflowHash || (overflowObj.overflowHash && overflowObj.overflowHash !== prep.overflowHash)) {
            failures.push(`Overflow integrity check failed: content hash mismatch for ${prep.id}.overflow.json`);
          } else if (overflowObj.preparationId && overflowObj.preparationId !== prep.id) {
            failures.push(`Overflow integrity check failed: preparationId mismatch for ${prep.id}.overflow.json`);
          } else if (overflowObj.nodeId && overflowObj.nodeId !== node.id) {
            failures.push(`Overflow integrity check failed: nodeId mismatch for ${prep.id}.overflow.json`);
          }
        } catch {
          failures.push(`Overflow integrity check failed: could not parse ${prep.id}.overflow.json`);
        }
      }
    }

    // Freshness Check 8: Registered task execution for each enabled assist task
    const snap = prep.capabilitiesSnapshot;
    for (const task of getTasksForCaller(node.id)) {
      if (!snapshotTaskAssist(snap, task.taskId)) continue;
      const verifyRes = verifyTaskExecution(
            root,
            prep.id,
            node.id,
            task,
            prep.reviewSubjectHash ?? prep.immutableHash,
            {
              expectedModel: (opts.jevConfig || loadJevConfig(root)).model,
              expectedQuestionSemantics: questionSemanticsForTask(task.taskId, task.taskType),
              expectedSubjectHash: prep.reviewSubjectHash,
            }
          );
      if (QUALITY_TASK_SEMANTICS[task.taskId] && verifyRes.ok) {
        const qualityVerify = verifyQualityTaskReceipts({
          root,
          preparationId: prep.id,
          nodeId: node.id,
          taskId: task.taskId,
          expectedModel: (opts.jevConfig || loadJevConfig(root)).model,
        });
        if (!qualityVerify.ok) {
          failures.push(`Assist-mode task verification failed: registered task "${task.taskId}" produced no valid execution record or ledger entries: ${qualityVerify.reason}`);
          continue;
        }
      }
      if (!verifyRes.ok) {
        failures.push(`Assist-mode task verification failed: registered task "${task.taskId}" produced no valid execution record or ledger entries: ${verifyRes.reason}`);
      }
    }

    if (qualityAssistEnabled(snap) && ["copy-review", "content-review"].includes(node.id)) {
      failures.push(...reconcileQualityWithReview({
        root,
        preparationId: prep.id,
        nodeId: node.id,
        assist: true,
      }));
    }

    // Run evaluator
    const graded = opts.evaluate ? opts.evaluate() : gradeNode(root, node.eval);
    failures.push(...graded.failures);
    if (node.id === "asset-production" && prep.mediaAuditSnapshot) {
      const original = JSON.parse(prep.mediaAuditSnapshot) as import("./artifacts.ts").MediaInventory;
      const current = json<import("./artifacts.ts").MediaInventory>(join(root,"onboarding/media-inventory.json"));
      for (const asset of original.assets) {
        const next=current.assets.find(a=>a.id===asset.id);
        const pendingProduced=asset.production && !asset.inspected;
        const immutable=(a:import("./artifacts.ts").MediaInventory["assets"][number]|undefined)=>a && {id:a.id,path:a.path,sha256:a.sha256,origin:a.origin,sources:a.sources,production:a.production,identity:a.identity,identityEvidence:a.identityEvidence,provenance:a.provenance};
        const retired = asset.production && asset.inspected && next?.disposition === "retain" && next.placements.length === 0 && files(join(root,"onboarding/asset-operations")).some(path=>{
          try { const r=json<any>(path); return r.kind==="retirement"&&r.preparationId===prep.id&&r.assetId===asset.id&&r.sha256===asset.sha256&&r.reason===next.reason; } catch { return false; }
        });
        const withoutSelection=(a:typeof asset|undefined)=>a&&{...a,disposition:undefined,placements:undefined,reason:undefined};
        const before=pendingProduced?immutable(asset):retired?withoutSelection(asset):asset;
        const after=pendingProduced?immutable(next):retired?withoutSelection(next):next;
        if (JSON.stringify(after) !== JSON.stringify(before)) failures.push(`Production changed audited upstream asset ${asset.id}; preserve it and register a versioned derivative`);
      }
      if (current.harvestHash !== original.harvestHash || JSON.stringify(current.unavailable) !== JSON.stringify(original.unavailable)) failures.push("Production changed upstream audit provenance");
    }
    if (["media", "storyboard", "representative", "visual-review", "content-review"].includes(node.id)) failures.push(...validateMediaSelection(root));

    if (!writeVerification.ok) {
      failures.push(...writeVerification.violations);
    }
    if (criticChangedSource) {
      failures.push("Critic changed protected source/artifacts; review invalid. Inspect changes before retrying.");
    }
    if (captureChanged) {
      failures.push("Captured evidence changed outside harvest. Use media/recovered for acquisition repairs.");
    }

    const ok = failures.length === 0;

    const invocation = opts.invocationId ? readInvocations(root).find(row => row.id === opts.invocationId) : undefined;
    if (opts.invocationId && (!invocation || invocation.preparationId !== prep.id || invocation.status !== "settled")) throw new Error("Reviewer invocation is missing, unsettled, or belongs to another preparation");
    if (node.kind === "critic") save(join(root, "agent/runs", `${prep.id}.review-provenance.json`), {
      version: 1, preparationId: prep.id, nodeId: node.id, subjectHash: prep.reviewSubjectHash,
      kind: invocation ? "independent_model" : "active_agent", invocationId: invocation?.id,
      humanApproved: false, verdictAccepted: ok,
    });
    const attemptId = `${prep.id}:${prep.attempt}`;
    try {
      if (node.kind === "agent") {
        const source = opts.agentUsage?.measured
          ? "host_export"
          : opts.agentUsage
            ? "manual_host_report"
            : "unavailable";
        recordAgentStageAttempt({
          root,
          nodeId: node.id,
          preparationId: prep.id,
          attemptId,
          kind: "agent",
          runId: prep.runId,
          inputTokens: opts.agentUsage?.inputTokens,
          outputTokens: opts.agentUsage?.outputTokens,
          rawEvidencePath: opts.agentUsage?.rawEvidencePath,
          wallTimeMs: opts.durationMs,
          source,
        });
      } else if (node.kind === "tool") {
        recordAgentStageAttempt({
          root,
          nodeId: node.id,
          preparationId: prep.id,
          attemptId,
          kind: "tool",
          runId: prep.runId,
          wallTimeMs: opts.durationMs,
          source: "unavailable",
        });
      } else if (node.kind === "critic") {
        const source = invocation?.receipt && !invocation.receipt.usage.unknown ? "structured_log" : opts.agentUsage?.measured
          ? "host_export"
          : opts.agentUsage
            ? "manual_host_report"
            : "unavailable";
        recordAgentStageAttempt({
          root,
          nodeId: node.id,
          preparationId: prep.id,
          attemptId,
          kind: "critic",
          adapterReceipt: invocation?.receipt,
          runId: prep.runId,
          inputTokens: opts.agentUsage?.inputTokens,
          outputTokens: opts.agentUsage?.outputTokens,
          rawEvidencePath: opts.agentUsage?.rawEvidencePath,
          wallTimeMs: opts.durationMs,
          source,
        });
      }
    } catch {
      /* receipt write must not strand the commit; coverage stays unknown */
    }

    // Pure state transition computation
    const targetState = computeNextState({
      root,
      graph,
      currentState: state,
      node,
      failures,
      agentUsage: opts.agentUsage,
      durationMs: opts.durationMs ?? Math.max(0, Date.now() - Date.parse(prep.preparedAt)),
      externallyMetered: Boolean(invocation),
    });
    syncInvocationSpend(root, targetState);

    const updatedPreparation: StagePreparation = {
      ...prep,
      status: "consumed",
      consumedAt: new Date().toISOString(),
      result: { ok, failures },
      agentUsage: opts.agentUsage,
    };

    const transactionId = randomUUID();
    const statePath = join(root, "agent/STATE.json");
    const prepPath = join(root, "agent/preparations", `${preparationId}.json`);

    // Crash injection boundary: before_journal
    if (opts.crashInjection === "before_journal") {
      throw new Error("CRASH_INJECTION:before_journal");
    }

    // 1. Write Journal
    const effects = [
      node.kind === "agent" ? "merge_implementation_reason" : undefined,
      "restore_unchanged_layout",
    ].filter(Boolean) as string[];

    writeCommitJournal(root, {
      transactionId,
      preparationId,
      nodeId: node.id,
      phase: "graded",
      preparationPath: prepPath,
      statePath,
      targetState,
      updatedPreparation,
      effects,
      createdAt: new Date().toISOString(),
    });

    // Crash injection boundary: before_state / after_journal
    if (opts.crashInjection === "before_state" || opts.crashInjection === "after_journal") {
      throw new Error("CRASH_INJECTION:before_state");
    }

    // 2. Write STATE.json
    save(statePath, targetState);
    updateCommitJournalPhase(root, "state_written");

    // Crash injection boundary: after_state
    if (opts.crashInjection === "after_state") {
      throw new Error("CRASH_INJECTION:after_state");
    }

    // 3. Write Preparation
    save(prepPath, updatedPreparation);
    updateCommitJournalPhase(root, "consumed");

    // Crash injection boundary: after_prep
    if (opts.crashInjection === "after_prep") {
      throw new Error("CRASH_INJECTION:after_prep");
    }

    // Related side-effects
    if (node.kind === "agent") mergeImplementationReason(root, node.id);
    if (restoreUnchangedLayout(root, targetState)) {
      targetState.preview_ready = isPreviewReady(graph, targetState);
      save(statePath, targetState);
    }

    // 4. Clear Journal
    clearCommitJournal(root);

    // Release durable lease
    releaseDurableLease(root, `stage-${node.id}`, prep.ownerToken);

    // Copy mutated fields back to input state object
    Object.assign(state, targetState);

    return {
      ok,
      nodeId: node.id,
      preparationId,
      failures,
      state: targetState,
      preparation: updatedPreparation,
    };
  });

  recordStageCompleted({
    root,
    preparation: result.preparation,
    ok: result.ok,
    failures: result.failures,
    idempotentReplay: result.idempotentReplay,
    priorNodeStatuses,
    state: result.state,
    durationMs: opts.durationMs,
    agentUsage: opts.agentUsage,
  });
  return result;
}

/** Cancels an active stage preparation and releases its durable lease without consuming attempts. */
export function cancelStage(opts: { root: string; preparationId: string; reason?: string }): void {
  withMutationLock(opts.root, () => {
    const prep = loadPreparation(opts.root, opts.preparationId);
    if (prep && prep.status === "prepared") {
      prep.status = "canceled";
      prep.invalidationReason = opts.reason || "Canceled by operator";
      savePreparation(opts.root, prep);
      recordStageInvalidated({ root: opts.root, preparation: prep, result: "canceled" });
      releaseDurableLease(opts.root, `stage-${prep.nodeId}`, prep.ownerToken);
    }
  });
}

/** Read-only status inspection. */
export function inspectStatus(opts: { root: string; kernel: string; graph: SkillGraph; state: AgentState }) {
  const { root, graph, state } = opts;
  const next = nextNode(graph, state);
  const activePrep = next ? findActivePreparation(root, next.id) : undefined;
  return {
    state,
    nextNode: next?.id,
    previewReady: Boolean(state.preview_ready),
    activePreparation: activePrep ? { id: activePrep.id, nodeId: activePrep.nodeId, preparedAt: activePrep.preparedAt } : null,
  };
}
