import { artDirectionContext } from "./art-direction.ts";
import { selectedThemeContext } from './theme-selection.ts';
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { choice } from "@typesafe-ai/sdk";
import { save, sourceHash } from "./artifacts.ts";
import type { GraphNode } from "./graph.ts";
import { CREATIVE_SKILLS, selectedCreativeSkills } from "./creative-skills.ts";
import type { EvidenceIndex, EvidenceNode } from "./creative-evidence.ts";
import type { CreativeEfficiencyPolicy } from "./creative-efficiency.ts";
import { resolveCapability } from "./jev/config.ts";
import type { JevClient } from "./jev/client.ts";
import { computeManifestHash, type CoverageManifest, type ExpandableItem, type ManifestItem } from "./jev/packets.ts";
import type { JevConfig } from "./jev/types.ts";
import { kernelScriptCommand } from "./kernel-commands.ts";
import { kernelContractHash } from "./design-copy.ts";
import { evaluateDelegationEligibility } from "./jev/ownership.ts";
import { questionSemanticsHash } from "./jev/questions.ts";
import { remainingPilotBudget } from "./jev/budget.ts";
import type { TrustedPilotContext } from "./jev/calibration.ts";
import { compositionContextForStage } from "./composition-context.ts";
import { resolveDesignAuthoring } from "./composition-authoring.ts";
import { referenceContext } from "./reference-library.ts";

const sha = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
const unique = <T>(items: T[]) => [...new Set(items)];
export const CREATIVE_REPAIR_OBLIGATION = "Classify the located repair domain";
const REPAIR_QUESTION = choice("Which single repair domain best matches the located findings? Classify the issue only; do not propose a solution or assert that pixels were inspected.", { copy: "Wording or information order", composition: "Hierarchy, spacing or visual layout", media: "Image choice or placement", responsive: "Viewport-specific behavior", implementation: "Broken code or interaction", unknown: "Insufficient state or mixed issue" });
export const CREATIVE_REPAIR_SEMANTICS_HASH = questionSemanticsHash(REPAIR_QUESTION);
export type CreativePacketRole = "plan" | "study-review" | "decision" | "revision" | "final-review";
export type CreativePacketInput = {
  root: string; kernel: string; node: GraphNode; role: CreativePacketRole;
  objective: string; candidateId?: string; sourceRevision: string; baseContract: string;
  policy: CreativeEfficiencyPolicy; config: JevConfig; client?: JevClient;
  evidence: EvidenceIndex; retrievedIds: string[];
  requiredEvidenceIds?: string[];
  mandatorySkillIds: string[]; optionalSkillIds: string[];
  constraints: string[]; obligations: string[]; findings: string[]; renderIds: string[];
  priorOutcomes?: string[];
  sourceChanges?: string[];
  renderBindings?: { id: string; path: string; viewport?: number; route?: string; state?: string; subjectHash?: string; receiptPath?: string; current: boolean; reason?: string }[];
  softTargetBytes?: number;
  pilotContext?: TrustedPilotContext;
  budgetRoot?: string;
};
export type CreativePacketResult = { prompt: string; manifest: CoverageManifest & Record<string, unknown>; receiptPaths: string[]; fallback?: string };

/** The same source-bound inventory feeds deterministic, shadow, and assist packets. */
export async function buildCreativeContextPacket(input: CreativePacketInput): Promise<CreativePacketResult> {
  const { root, kernel, node, policy, config } = input;
  const byId = new Map(input.evidence.nodes.map(item => [item.id, item]));
  const required = new Set<string>(input.requiredEvidenceIds || []);
  if (input.role === "plan") for (const id of input.retrievedIds) if (byId.get(id)?.kind === "fact") required.add(id);
  for (const id of input.renderIds) required.add(id);
  const missingRequired: string[] = [];
  const mandatory = new Set<string>();
  for (const id of required) {
    const item = byId.get(id);
    if (!item) { missingRequired.push(`${id}: absent from current evidence index`); continue; }
    mandatory.add(id);
    if (item.kind === "fact") {
      const supports = input.evidence.edges.filter(edge => edge.to === id && edge.relation === "supports");
      const sources = supports.map(edge => byId.get(edge.from)).filter((node): node is EvidenceNode => !!node && node.kind === "source" && !!node.excerpt?.trim());
      if (!sources.length) missingRequired.push(`${id}: no current supporting source excerpt; restore business evidence and rebuild the index`);
      for (const source of sources) mandatory.add(source.id);
    }
  }
  for (const edge of input.evidence.edges.filter(item => item.relation === "contradicts")) { mandatory.add(edge.from); mandatory.add(edge.to); }
  for (const id of input.retrievedIds) if (id.startsWith("finding:") || byId.get(id)?.uncertainty === "blocking") mandatory.add(id);
  if (["study-review", "decision", "final-review"].includes(input.role) && !input.renderIds.length) missingRequired.push(`render: no current ${input.role} render IDs; rerun the preceding render/browser gate`);
  for (const binding of input.renderBindings || []) if (!binding.current) missingRequired.push(`${binding.id}: ${binding.reason || "stale render receipt"}; rerun ${binding.receiptPath || "the render/browser gate"}`);
  const mandatoryNodes = [...mandatory].map(id => byId.get(id)).filter((item): item is EvidenceNode => !!item).sort((a,b) => a.id.localeCompare(b.id));
  const optionalPool = unique(input.retrievedIds).map(id => byId.get(id)).filter((item): item is EvidenceNode => !!item && !mandatory.has(item.id)).slice(0, 16);
  const optionalSkillIds = unique(input.optionalSkillIds).filter(id => !input.mandatorySkillIds.includes(id) && CREATIVE_SKILLS.some(skill => skill.id === id)).slice(0, 8);
  const allSkills = selectedCreativeSkills(unique([...input.mandatorySkillIds, ...optionalSkillIds]), root, kernel);
  let selectedOptionalSkills = optionalSkillIds.slice(0, input.role === "revision" ? 2 : 1);
  let selectedEvidenceId: string | undefined;
  let machineFinding: string | undefined;
  let coveredRepair = false;
  let ownershipReason = "agent_owned_uncalibrated_or_inapplicable";
  let fallback: string | undefined;
  const receiptPaths: string[] = [];
  const routing = resolveCapability(config, "retrievalRanking");
  const repairMode = resolveCapability(config, "repairAssistance");
  if (routing !== "off" && (optionalPool.length >= 4 || optionalSkillIds.length > 1) || repairMode !== "off" && input.role === "revision" && input.findings.length > 0) {
    if (!input.client) fallback = "Jev unavailable; deterministic optional context retained";
    else {
      const skillMap = new Map(optionalSkillIds.map((id, index) => [`s${index}`, id]));
      const evidenceMap = new Map(optionalPool.slice(0, 8).map((item, index) => [`e${index}`, item.id]));
      const questions: Record<string, ReturnType<typeof choice>> = {};
      const skillChoices = Object.fromEntries([...skillMap].map(([key, id]) => { const skill = CREATIVE_SKILLS.find(s => s.id === id)!; return [key, `${skill.purpose}; output: ${skill.outputContract}`]; }).concat([["none", "No optional skill helps"], ["unknown", "Cannot decide from supplied state"]]));
      if (routing !== "off" && skillMap.size > 1) {
        questions.skill = choice("Which optional skill best addresses this objective? Choose none or unknown when appropriate.", skillChoices);
        questions.skill2 = choice("Would one complementary optional skill materially help this same objective? Choose none if one is enough; unknown if unclear.", skillChoices);
      }
      if (routing !== "off" && evidenceMap.size >= 4) questions.evidence = choice("Which optional evidence item is most useful to inspect for this objective? Choose none or unknown where appropriate. This is relevance, not truth or visual inspection.", Object.fromEntries([...evidenceMap].map(([key, id]) => { const item = byId.get(id)!; return [key, `${item.kind}: ${item.label.slice(0, 150)}`]; }).concat([["none", "No optional evidence is useful"], ["unknown", "Cannot decide from supplied state"]])));
      if (repairMode !== "off" && input.role === "revision" && input.findings.length) questions.repair = REPAIR_QUESTION;
      try {
        const state = { packetVersion: policy.packetVersion, role: input.role, objective: input.objective, candidateId: input.candidateId, sourceRevision: input.sourceRevision, constraints: input.constraints, findings: input.findings, evidenceInputHash: input.evidence.inputHash, effectiveInstructionHashes: allSkills.expansions.map(item => ({ id: item.id, hash: item.hash })), optionalEvidence: [...evidenceMap].map(([key,id]) => ({ key, id, node: byId.get(id) })), optionalSkills: [...skillMap].map(([key,id]) => ({ key, id, skill: CREATIVE_SKILLS.find(s => s.id === id) })) };
        const response = await input.client.evaluate({ taskType: "custom", nodeId: node.id, questions, state });
        receiptPaths.push(response.receiptPath);
        const answers = response.result.answers as Record<string, { choice?: string; confidence?: number }>;
        const threshold = config.confidenceThresholds.routing;
        if (routing === "assist") {
          if (questions.skill && answers.skill?.confidence !== undefined && answers.skill.confidence >= threshold) {
            if (answers.skill.choice === "none") selectedOptionalSkills = [];
            else if (skillMap.has(answers.skill.choice || "")) selectedOptionalSkills = [skillMap.get(answers.skill.choice!)!];
            else fallback = "Skill answer was unknown or outside the candidate set";
          }
          if (questions.skill2 && answers.skill2?.confidence !== undefined && answers.skill2.confidence >= threshold && skillMap.has(answers.skill2.choice || "")) selectedOptionalSkills = unique([...selectedOptionalSkills, skillMap.get(answers.skill2.choice!)!]).slice(0, 2);
          if (questions.evidence && answers.evidence?.confidence !== undefined && answers.evidence.confidence >= threshold && evidenceMap.has(answers.evidence.choice || "")) selectedEvidenceId = evidenceMap.get(answers.evidence.choice!)!;
        }
        if (repairMode === "assist" && questions.repair && answers.repair?.confidence !== undefined && answers.repair.confidence >= threshold && ["copy", "composition", "media", "responsive", "implementation"].includes(answers.repair.choice || "")) machineFinding = `Located finding appears primarily ${answers.repair.choice}; verify against source and renders before revising.`;
        if (input.role === "revision" && input.obligations.includes(CREATIVE_REPAIR_OBLIGATION)) {
          const receipt = JSON.parse(readFileSync(response.receiptPath, "utf8")) as { status?: string; cached?: boolean };
          const eligibility = evaluateDelegationEligibility({ config, taskId: "creative-revision-domain", capability: "repairAssistance", siteContext: { subjectExists: input.findings.length > 0, applicable: input.findings.length > 0 }, coverage: { complete: !!machineFinding && !missingRequired.length, candidateCount: 1, evaluatedCount: machineFinding ? 1 : 0, coveredObligationIds: machineFinding && !missingRequired.length ? [CREATIVE_REPAIR_OBLIGATION] : [], retainedObligationIds: machineFinding && !missingRequired.length ? [] : [CREATIVE_REPAIR_OBLIGATION], missingEvidenceIds: missingRequired, conflictingClaimIds: [], staleEvidence: false }, manifest: { present: true, current: input.sourceRevision === sourceHash(root) && input.evidence.inputHash.length > 0, expectedModel: config.model }, remainingBudget: remainingPilotBudget(input.budgetRoot || root, config.pilotBudget), pilotContext: input.pilotContext, executionStatus: machineFinding && receipt.status === "ok" ? receipt.cached ? "cached" : "completed" : "uncertain", kernelRevision: kernelContractHash(kernel), questionSemanticsHash: CREATIVE_REPAIR_SEMANTICS_HASH });
          coveredRepair = eligibility.eligible;
          ownershipReason = coveredRepair ? "kernel_calibration_and_current_receipt" : eligibility.reasons.join(",") || "agent_owned";
        }
      } catch (error) { fallback = `Jev routing unavailable: ${error instanceof Error ? error.message : String(error)}`; }
    }
  }
  const selectedIds = unique([...input.mandatorySkillIds, "motion-direction", "motion-page", ...selectedOptionalSkills]);
  const skills = selectedCreativeSkills(selectedIds, root, kernel);
  const orderedOptional = [...optionalPool].sort((a,b) => (a.id === selectedEvidenceId ? -1 : 0) - (b.id === selectedEvidenceId ? -1 : 0));
  const optionalNodes: EvidenceNode[] = [];
  const seenSources = new Set<string>();
  for (const item of orderedOptional) if (optionalNodes.length < 5 && !seenSources.has(item.sourcePath)) { optionalNodes.push(item); seenSources.add(item.sourcePath); }
  for (const item of orderedOptional) if (optionalNodes.length < 5 && !optionalNodes.includes(item)) optionalNodes.push(item);
  const expansionDir = join(root, "agent/runs", `${node.id}.expansions`);
  mkdirSync(expansionDir, { recursive: true });
  const expandable: ExpandableItem[] = [];
  const requiredExpansionIds: string[] = [];
  const expansionKind = new Map<string, "required" | "optional">();
  const writeExpansion = (id: string, body: string, description: string, kind: "required" | "optional") => {
    const path = join(expansionDir, `${id}.txt`);
    writeFileSync(path, body);
    expandable.push({ id, path: relative(root, path).replaceAll("\\", "/"), description: `${kind}: ${description}`, bytes: Buffer.byteLength(body), hash: sha(readFileSync(path)) });
    expansionKind.set(id, kind);
    if (kind === "required") requiredExpansionIds.push(id);
  };
  const compositionStage = input.role === "plan" ? "direction" : input.role === "revision" ? "refine" : "representative-quality";
  const composition = compositionContextForStage(root, compositionStage);
  const references = referenceContext(root, compositionStage, kernel);
  for (const item of references?.expansions || []) writeExpansion(item.id, item.text, `Reference teaching ${item.id}; catalog ${references!.pack.manifest.catalog.sha256}`, "optional");
  for (const item of [...(composition?.receipt.selected || []), ...(composition?.receipt.alternatives || [])]) {
    writeExpansion(`composition-${item.id}`, composition!.pack.body(item.id), `Advisory composition lesson ${item.id}@1; release ${composition!.pack.release}`, "optional");
  }
  const directRequiredHandles = new Set([...input.mandatorySkillIds, "motion-direction", "motion-page"].map(id => CREATIVE_SKILLS.find(skill => skill.id === id)?.expansionHandle).filter((id): id is string => !!id));
  const directOptionalHandles = new Set(selectedOptionalSkills.map(id => CREATIVE_SKILLS.find(skill => skill.id === id)?.expansionHandle).filter((id): id is string => !!id));
  const skillInline: { id: string; body: string }[] = [];
  for (const expansion of skills.expansions) {
    const id = `skill-${expansion.id.slice(4)}`;
    const direct = directRequiredHandles.has(expansion.id);
    const packagePath = join(kernel, "agent/refs", `${expansion.id.slice(4)}.md`);
    const packageHash = existsSync(packagePath) ? sha(readFileSync(packagePath)) : undefined;
    const siteSpecific = expansion.provenance.startsWith("override:") || expansion.provenance.startsWith("site:") && expansion.hash !== packageHash;
    // Keep the creative exploration method in the compact packet; motion is a required hashed expansion.
    const inline = !expansion.id.startsWith('ref:motion') && ((direct && Buffer.byteLength(expansion.text) <= 5_000) || (siteSpecific && Buffer.byteLength(expansion.text) <= 1_600) || (directOptionalHandles.has(expansion.id) && Buffer.byteLength(expansion.text) <= 1_200));
    if (inline) skillInline.push({ id, body: `### ${expansion.id} [sha256:${expansion.hash}; ${expansion.provenance}]\n${expansion.text}` });
    writeExpansion(id, expansion.text, `Effective ${expansion.id} instruction, sha256:${expansion.hash}, ${expansion.provenance}${inline ? "; also visible" : ""}`, !inline && (direct || siteSpecific) ? "required" : "optional");
  }
  const assetPaths = new Map<string, string>();
  const mediaPath = join(root, "onboarding/media-inventory.json");
  if (existsSync(mediaPath)) for (const asset of (JSON.parse(readFileSync(mediaPath, "utf8")) as { assets?: { id: string; path: string }[] }).assets || []) assetPaths.set(`asset:${asset.id}`, asset.path);
  const evidenceInline = mandatoryNodes.map(item => ({ id: item.id, path: item.sourcePath, body: formatEvidence(item, assetPaths) }));
  const constraintInline = input.constraints.map((item, index) => ({ id: `constraint-${index}`, body: `- ${item}` }));
  const softTarget = Math.max(8_192, Math.min(input.softTargetBytes || 16_384, 32_768));
  const headerBytes = Buffer.byteLength(`# ACTIVE STAGE: ${node.id} (${node.kind})\nPreparation ID: ${"x".repeat(36)}\nGraph Version: 3\nAllowed Writes: ${node.writes.join(", ")}\nComplete this stage with: npm run go -- --complete --preparation ${"x".repeat(36)}\n`);
  const sections = () => ({
    contract: `Role: ${input.role}; objective: ${input.objective}; candidate: ${input.candidateId || "shared"}; source revision: ${input.sourceRevision}.\nAllowed writes: ${node.writes.join(", ")}.\nObligations:\n${input.obligations.filter(item => !coveredRepair || item !== CREATIVE_REPAIR_OBLIGATION).map(item => `- ${item}`).join("\n") || "- Complete the stage contract"}`,
    constraints: [constraintInline.map(item => item.body).join("\n"), selectedThemeContext(root)].filter(Boolean).join('\n\n'),
    findings: input.findings.map(item => `- ${item}`).join("\n"),
    history: (input.priorOutcomes || []).map(item => `- ${item}`).join("\n"),
    changes: (input.sourceChanges || []).map(item => `- ${item}`).join("\n"),
    skills: skills.descriptions.map(skill => { const effective = skills.expansions.find(item => item.id === skill.expansionHandle); return `- ${skill.id}@${skill.version}: ${skill.purpose}; output ${skill.outputContract}; prerequisites ${skill.prerequisites.join(", ") || "none"}; ${skill.expansionHandle}${effective ? ` sha256:${effective.hash} ${effective.provenance}` : ""}`; }).join("\n"),
    skillMaterial: skillInline.map(item => item.body).join("\n\n"),
    composition: composition ? `Authoring ${composition.policy.mode} ${composition.pack.release}; policy ${composition.policy.hash}; selector ${composition.receipt.selectorVersion}; signal ${composition.receipt.inputSignalHash}. Selected advisory lessons:\n${composition.receipt.selected.map(item => `- ${item.id}: ${item.summary}; ${item.reason}; expand composition-${item.id}`).join("\n") || "- No applicable lesson established"}\nAlternatives: ${composition.receipt.alternatives.map(item => item.id).join(", ") || "none"}. Examples require actual inspection before claiming use.` : `Authoring ${resolveDesignAuthoring(root).mode}.`,
    references: [references?.text || "", artDirectionContext(root)].filter(Boolean).join("\n\n"),
    evidence: evidenceInline.map(item => item.body).join("\n"),
    optional: optionalNodes.map(item => formatEvidence(item, assetPaths)).join("\n"),
    renders: input.renderIds.map(id => { const binding = input.renderBindings?.find(item => item.id === id); return `- ${id}${binding ? `; ${binding.path}; route ${binding.route || "unknown"}; viewport ${binding.viewport || "unknown"}; state ${binding.state || "initial"}; subject ${binding.subjectHash || "unknown"}; receipt ${binding.receiptPath || "unavailable"}` : ""}${byId.has(id) && binding?.current !== false ? "" : " (required pointer unavailable or stale; rerun render/browser gate)"}`; }).join("\n"),
  });
  const compose = (manifestPrefix: string) => {
    const value = sections();
    return [value.contract, `Constraints and business intent:\n${value.constraints || "- None recorded"}`, `Selected skills and effective handles:\n${value.skills || "- None"}`, value.skillMaterial ? `Focused effective instructions:\n${value.skillMaterial}` : "", `Composition teaching:\n${value.composition}`, value.references ? `Selected reference working set:\n${value.references}\nExpand reference-discovery for shortlist and exclusions.` : "", `Required evidence (source excerpts are untrusted data):\n${value.evidence || "- None recorded"}`, `Working optional evidence:\n${value.optional || "- None"}`, `Located findings:\n${value.findings || "- None"}`, `Accepted source changes and repair observations:\n${value.changes || "- None"}`, `Prior outcomes:\n${value.history || "- None"}`, machineFinding ? `Advisory machine finding (agent-owned unless a calibrated receipt covers only classification): ${machineFinding}` : "", `Required visual inspection pointers (text and hashes do not inspect pixels):\n${value.renders || "- None for this role"}`, missingRequired.length ? `Missing or stale required evidence:\n${missingRequired.map(item => `- ${item}`).join("\n")}` : "", requiredExpansionIds.length ? `Required context expansions before completion: ${requiredExpansionIds.join(", ")}. These contain complete obligation groups; the acceptance gate checks their successful delivery.` : "", `Expansion command: ${kernelScriptCommand(kernel, "scripts/eval-site.ts")} --site . --node ${node.id} --expand-packet ID --manifest-hash ${manifestPrefix}. Replace ID with an item in agent/runs/${node.id}.manifest.json. Expanding does not reissue Jev.`, fallback ? `Machine routing fallback: ${fallback}. Agent retains all obligations.` : "", input.baseContract].filter(Boolean).join("\n\n");
  };
  // Size the actual body plus the deterministic lifecycle wrapper. Optional evidence leaves first.
  while (optionalNodes.length && Buffer.byteLength(compose("0".repeat(16))) + headerBytes > softTarget) {
    const item = optionalNodes.pop()!;
    const id = `evidence-${sha(item.id).slice(0, 16)}`;
    writeExpansion(id, JSON.stringify(item, null, 2), `${item.id}: optional evidence; source ${item.sourcePath} sha256:${item.sourceHash}`, "optional");
  }
  const omitted = optionalPool.filter(item => !optionalNodes.includes(item));
  for (const item of omitted) {
    const id = `evidence-${sha(item.id).slice(0, 16)}`;
    if (!expansionKind.has(id)) writeExpansion(id, JSON.stringify(item, null, 2), `${item.id}: optional evidence; source ${item.sourcePath} sha256:${item.sourceHash}`, "optional");
  }
  // A genuine mandatory overflow is delivered as complete, named expansion groups.
  while (Buffer.byteLength(compose("0".repeat(16))) + headerBytes > 39_500) {
    const candidates = [...constraintInline.map((item, index) => ({ kind: "constraint" as const, index, ...item })), ...evidenceInline.map((item, index) => ({ kind: "evidence" as const, index, ...item })), ...skillInline.map((item, index) => ({ kind: "skill" as const, index, ...item }))].filter(item => !item.body.includes("[required expansion") && Buffer.byteLength(item.body) > 600).sort((a,b) => Buffer.byteLength(b.body) - Buffer.byteLength(a.body));
    const largest = candidates[0];
    if (!largest) break;
    const id = `required-${largest.kind}-${sha(largest.id).slice(0, 16)}`;
    writeExpansion(id, largest.body, `${largest.kind} ${largest.id}; complete required material`, "required");
    const pointer = `- [required expansion ${id}] ${largest.kind} ${largest.id}; read and retain full material before completion`;
    if (largest.kind === "constraint") constraintInline[largest.index]!.body = pointer;
    else if (largest.kind === "evidence") evidenceInline[largest.index]!.body = pointer;
    else skillInline[largest.index]!.body = pointer;
  }
  const includedIds = new Set(evidenceInline.filter(item => !item.body.includes("[required expansion")).map(item => item.id));
  const included: ManifestItem[] = [...mandatoryNodes.filter(item => includedIds.has(item.id)).map(item => ({ path: item.sourcePath, reason: `mandatory ${item.kind}`, bytes: Buffer.byteLength(formatEvidence(item, assetPaths)) })), ...optionalNodes.map(item => ({ path: item.sourcePath, reason: `selected optional ${item.kind}`, bytes: Buffer.byteLength(formatEvidence(item, assetPaths)) }))];
  const excluded: ManifestItem[] = [...mandatoryNodes.filter(item => !includedIds.has(item.id)).map(item => ({ path: item.sourcePath, reason: `required expansion ${item.id}`, bytes: Buffer.byteLength(formatEvidence(item, assetPaths)) })), ...omitted.map(item => ({ path: item.sourcePath, reason: `expandable optional ${item.id}`, bytes: Buffer.byteLength(formatEvidence(item, assetPaths)) }))];
  const requiredPartitions = [...requiredExpansionIds, ...missingRequired.map(item => `missing:${item}`)];
  const manifestHash = computeManifestHash({ nodeId: node.id, included, excluded, expandable, requiredPartitions });
  const prompt = compose(manifestHash.slice(0, 16));
  const sectionBytes = Object.fromEntries(Object.entries(sections()).map(([name,body]) => [name, Buffer.byteLength(body)]));
  const requiredExpansionBytes = expandable.filter(item => expansionKind.get(item.id) === "required").reduce((n,item) => n + item.bytes, 0);
  const optionalExpansionBytes = expandable.filter(item => expansionKind.get(item.id) === "optional").reduce((n,item) => n + item.bytes, 0);
  const coverageStatus = missingRequired.length ? "incomplete" : requiredExpansionIds.length ? "requires_expansion" : Buffer.byteLength(prompt) + headerBytes > 40_000 ? "blocked" : "complete";
  const manifest: CoverageManifest & Record<string, unknown> = { schemaVersion: 1, nodeId: node.id, generatedAt: new Date().toISOString(), manifestHash, requiredPartitions, included, excluded, expandable, role: input.role, candidateId: input.candidateId, sourceRevision: input.sourceRevision, policyHash: policy.policyHash, authoringPolicy: resolveDesignAuthoring(root), compositionSelection: composition?.receipt || null, referenceSelection: references?.receipt || null, referencePolicyHash: references?.policy.hash || null, evidenceInputHash: input.evidence.inputHash, selectedSkillIds: skills.descriptions.map(item => item.id), effectiveSkillHandles: skills.expansions.map(item => ({ id: item.id, hash: item.hash, provenance: item.provenance })), includedEvidenceIds: [...includedIds, ...optionalNodes.map(item => item.id)], omittedEvidenceIds: omitted.map(item => item.id), missingRequired, requiredExpansionIds, renderBindings: input.renderBindings || [], jevReceiptPaths: receiptPaths, machineFinding: machineFinding || null, retainedObligations: input.obligations.filter(item => !coveredRepair || item !== CREATIVE_REPAIR_OBLIGATION), coveredObligations: coveredRepair ? [CREATIVE_REPAIR_OBLIGATION] : [], ownershipReason, fallback: fallback || null, coverageStatus, softTargetBytes: softTarget, bytesBySection: sectionBytes, packetBytes: Buffer.byteLength(prompt), wrapperBytesEstimated: headerBytes, visibleBytesEstimated: Buffer.byteLength(prompt) + headerBytes, requiredExpansionBytes, optionalExpansionBytes, tokenEstimate: { value: Math.ceil(prompt.length / 4), method: "characters_divided_by_4_not_provider_usage" }, bodyHash: sha(prompt), finalPromptHash: "See the accepted lifecycle preparation.promptHash for exact CURRENT.md hash" };
  save(join(root, "agent/runs", `${node.id}.manifest.json`), manifest);
  if (coverageStatus === "blocked") throw new Error(`Creative packet has an undeliverable required group for ${node.id}; inspect missingRequired and requiredPartitions in its manifest`);
  return { prompt, manifest, receiptPaths, fallback };
}

function formatEvidence(item: EvidenceNode, assetPaths: Map<string,string>): string {
  return `- ${item.id} [${item.kind}; ${item.provenance}; sha256:${item.sourceHash}]: ${item.label}${assetPaths.has(item.id) ? `; usable path: ${assetPaths.get(item.id)}` : ""}${item.excerpt ? `\n  Source excerpt: ${item.excerpt}` : ""}${item.uncertainty ? `\n  Uncertainty: ${item.uncertainty}` : ""}`;
}
