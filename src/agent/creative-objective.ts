import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fingerprint, json, save } from "./artifacts.ts";
import type { GraphNode } from "./graph.ts";
import { loadState, inputHash } from "./runner.ts";
import { cancelStage, completeStage, prepareStage, type CompleteStageOptions } from "./lifecycle.ts";
import { loadPreparation, computeImmutableHash, verifyAllowedWrites, isDurableLeaseHeld } from "./preparation.ts";
import { loadSiteGraph } from "./workflow.ts";
import { DEFAULT_JEV_CONFIG } from "./jev/config.ts";
import { computeManifestHash, type CoverageManifest } from "./jev/packets.ts";
import { isPathConfined } from "./jev/security.ts";
import { selectedCreativeSkills } from "./creative-skills.ts";
import type { JevConfig } from "./jev/types.ts";
import type { JevClient } from "./jev/client.ts";
import { referenceContext } from "./reference-library.ts";

export type CreativeObjectiveReceipt = {
  preparationId: string;
  node: GraphNode;
  completed?: boolean;
  acceptedHash?: string;
};

export function creativePacketCoverageFailures(root: string, nodeId: string): string[] {
  const path = join(root, "agent/runs", `${nodeId}.manifest.json`);
  if (!existsSync(path)) return [];
  const manifest = json<CoverageManifest & { generatedAt: string; role?: string; referencePolicyHash?: string; referenceSelection?: { manifestHash: string; inputSignalHash: string; teachingManifestHash: string }; selectedSkillIds?: string[]; effectiveSkillHandles?: { id: string; hash: string; provenance: string }[]; requiredExpansionIds?: string[]; missingRequired?: string[]; coverageStatus?: string }>(path);
  if (manifest.nodeId !== nodeId || computeManifestHash(manifest) !== manifest.manifestHash) return ["Creative packet manifest changed since preparation"];
  if (manifest.referenceSelection) {
    try {
      const current = referenceContext(root, manifest.role === "plan" ? "direction" : manifest.role === "revision" ? "refine" : "representative-quality");
      if (!current || current.policy.hash !== manifest.referencePolicyHash || current.pack.manifestHash !== manifest.referenceSelection.manifestHash || current.receipt.inputSignalHash !== manifest.referenceSelection.inputSignalHash || current.receipt.teachingManifestHash !== manifest.referenceSelection.teachingManifestHash) return ["Reference selection changed since creative preparation; prepare explicitly again"];
    } catch (error) { return [`Reference selection unavailable: ${String(error)}`]; }
  }
  if (manifest.effectiveSkillHandles) {
    const current = selectedCreativeSkills(manifest.selectedSkillIds || [], root).expansions;
    if (current.length !== manifest.effectiveSkillHandles.length || current.some(item => !manifest.effectiveSkillHandles!.some(saved => saved.id === item.id && saved.hash === item.hash && saved.provenance === item.provenance))) {
      return ["Effective creative instructions changed since preparation; start an explicit new preparation or run"];
    }
  }
  if (manifest.missingRequired?.length) return manifest.missingRequired.map(item => `Required creative evidence unavailable: ${item}`);
  if (manifest.coverageStatus === "blocked" || manifest.coverageStatus === "incomplete") return [`Creative packet coverage is ${manifest.coverageStatus}`];
  const logPath = join(root, "agent/runs/packet-expansions.log");
  const delivered = new Set<string>();
  if (existsSync(logPath)) for (const line of readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean)) {
    try {
      const event = JSON.parse(line) as { nodeId?: string; expansionId?: string; timestamp?: string };
      if (event.nodeId === nodeId && event.timestamp && event.timestamp >= manifest.generatedAt && event.expansionId) delivered.add(event.expansionId);
    } catch { /* Ignore unrelated malformed audit lines. */ }
  }
  const failures: string[] = [];
  for (const id of manifest.requiredExpansionIds || []) {
    const expansion = manifest.expandable.find(item => item.id === id);
    if (!expansion || !delivered.has(id)) { failures.push(`Required creative packet expansion ${id} was not delivered`); continue; }
    const confinement = isPathConfined(root, expansion.path);
    if (!confinement.safe || !existsSync(confinement.resolvedPath) || !expansion.hash || createHash("sha256").update(readFileSync(confinement.resolvedPath)).digest("hex") !== expansion.hash) failures.push(`Required creative packet expansion ${id} changed after delivery`);
  }
  return failures;
}

/** Completion is established by a lifecycle receipt, never by the shape of files alone. */
export async function runCreativeObjective(opts: {
  root: string; kernel: string; node: GraphNode; prompt: string;
  pendingPath?: string; retry?: boolean;
  beforePrepare?: () => void;
  evaluate: () => { failures: string[] };
  agentUsage?: CompleteStageOptions["agentUsage"];
  usageReceiptPath?: string;
  jevConfig?: JevConfig;
  jevClient?: JevClient;
  buildPacket?: () => Promise<string>;
}): Promise<{ paused: boolean; failures: string[]; preparationId?: string }> {
  const { root, kernel, node } = opts;
  const path = opts.pendingPath || join(root, "agent/runs", `creative-objective-${node.id}.json`);
  const graph = loadSiteGraph(root);
  graph.nodes.push(node);
  let state = loadState(root, graph);
  const subject = () => fingerprint(root, [...(node.inputs || []), ...node.writes]);
  if (existsSync(path)) {
    const pending = json<CreativeObjectiveReceipt>(path);
    if (pending.node.id !== node.id) throw new Error("Creative objective receipt belongs to another objective");
    const prep = loadPreparation(root, pending.preparationId);
    if (!prep) throw new Error("Creative objective preparation is missing");
    if (prep.status === "consumed" && prep.result?.ok) {
      const accepted = state.nodes[node.id];
      if (pending.acceptedHash && subject() !== pending.acceptedHash || accepted?.status !== "done" || accepted.outputHash !== fingerprint(root, node.writes) || accepted.inputHash !== inputHash(root, node)) {
        throw new Error("Accepted creative objective changed; its receipt cannot approve a new revision");
      }
      // Recovers a crash between the lifecycle commit and this sidecar write.
      save(path, { ...pending, completed: true, acceptedHash: subject() });
      return { paused: false, failures: [], preparationId: prep.id };
    }
    if (prep.status === "prepared" && isDurableLeaseHeld(root, `stage-${node.id}`)) {
      let agentUsage = opts.agentUsage;
      if (opts.usageReceiptPath) {
        if (agentUsage) throw new Error("Use either a host usage receipt or manual usage");
        const receipt = json<{ schemaVersion?: number; source?: string; preparationId?: string; inputTokens?: number; outputTokens?: number }>(opts.usageReceiptPath);
        if (receipt.schemaVersion !== 1 || receipt.source !== "host_export" || receipt.preparationId !== prep.id || !Number.isSafeInteger(receipt.inputTokens) || (receipt.inputTokens ?? -1) < 0 || !Number.isSafeInteger(receipt.outputTokens) || (receipt.outputTokens ?? -1) < 0) throw new Error("Creative host usage receipt requires matching preparationId and non-negative measured token counts");
        agentUsage = { measured: true, inputTokens: receipt.inputTokens, outputTokens: receipt.outputTokens, rawEvidencePath: opts.usageReceiptPath };
      }
      const result = await completeStage({ root, kernel, graph, state, preparationId: prep.id, agentUsage,
        evaluate: () => { try { return { failures: [...creativePacketCoverageFailures(root, node.id), ...opts.evaluate().failures] }; } catch (error) { return { failures: [error instanceof Error ? error.message : String(error)] }; } } });
      save(path, { ...pending, completed: result.ok, ...(result.ok ? { acceptedHash: subject() } : {}) });
      return { paused: false, failures: result.failures, preparationId: prep.id };
    }
    if (!opts.retry) return { paused: false, failures: prep.result?.failures.length ? prep.result.failures : [`Preparation is ${prep.status}; repair its cause and explicitly retry`], preparationId: prep.id };
    // A retry may repair declared outputs, but must not launder unauthorized writes into a new baseline.
    const writes = verifyAllowedWrites({ root, node, baselineInventory: prep.baselineInventory, allowedWrites: prep.expectedOutputs });
    if (!writes.ok) return { paused: false, failures: writes.violations };
    if (computeImmutableHash(root, prep.immutableDependencies, node.id) !== prep.immutableHash) return { paused: false, failures: ["Restore immutable objective dependencies before retrying"] };
    if (prep.status === "prepared") cancelStage({ root, preparationId: prep.id, reason: "Explicit creative retry after lease expiry; original write and dependency boundaries verified" });
    if ((state.nodes[node.id]?.attempts || 0) >= node.maxAttempts) return { paused: false, failures: [`Creative objective ${node.id} exhausted its attempts`] };
    if (state.status === "repeated_failure_blocked") {
      state.status = "needs_repair";
      save(join(root, "agent/STATE.json"), state);
    }
  }
  opts.beforePrepare?.();
  const stableInputs = (node.inputs || []).filter(path => !path.includes(".manifest.json") && !path.includes(".expansions") && !/\/context-[^/]+\.json$/.test(path) && !/\/skills-[^/]+\.json$/.test(path));
  const sourceBeforePacket = fingerprint(root, stableInputs);
  const finalPrompt = opts.buildPacket ? await opts.buildPacket() : opts.prompt;
  if (opts.buildPacket && sourceBeforePacket !== fingerprint(root, stableInputs)) throw new Error("Creative objective inputs changed while preparing the packet");
  if (opts.buildPacket) opts.beforePrepare?.();
  state = loadState(root, graph);
  const result = await prepareStage({ root, kernel, graph, state, nodeId: node.id, jevConfig: opts.jevConfig || { ...DEFAULT_JEV_CONFIG, mode: "off" }, jevClient: opts.jevClient, promptOverride: finalPrompt });
  if (!result.preparation) return { paused: false, failures: ["Creative objective preparation unavailable"] };
  save(path, { preparationId: result.preparation.id, node, completed: false });
  return { paused: true, failures: [], preparationId: result.preparation.id };
}
