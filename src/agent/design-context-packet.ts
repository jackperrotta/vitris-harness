import { artDirectionContext } from "./art-direction.ts";
import { selectedThemeContext, SELECTION_PATH, BRAND_PATH } from './theme-selection.ts';
import { artDirectionPolicy } from "./art-direction-policy.ts";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fingerprint, json, type Business, type Direction, type MediaInventory, type NarrativeBrief, type ReferenceAnalysis, type Storyboard } from "./artifacts.ts";
import { representativeBindingHash } from "./design-contracts.ts";
import { kernelScriptCommand } from "./kernel-commands.ts";
import { MANDATORY_OBLIGATIONS, loadKnowledgeCatalog, mediaDesignEligibility, readLessonBody, signalsFromSite, type LessonSelection } from "./design-knowledge.ts";
import { loadKnowledgeV2 } from "../knowledge/pack.ts";
import { selectStageKnowledge } from "../knowledge/selection.ts";
import type { StageSignals } from "../knowledge/selection.ts";
import { siteWidgets } from "../knowledge/site-widgets.ts";
import { compositionContextForStage, compositionSignalsFromSite, selectCompositionLessons } from "./composition-context.ts";
import { resolveDesignAuthoring } from "./composition-authoring.ts";
import { referenceContext } from "./reference-library.ts";

export type PreSelectedLesson = Pick<LessonSelection, "id" | "version" | "contentHash" | "reason" | "expansionHandle">;

const OPTIONAL_CHAR_BUDGET = 6000;

export type DesignContextExpansion = {
  id: string;
  hash: string;
  chars: number;
  text: string;
};

export type DesignContextManifest = {
  schemaVersion: 1;
  nodeId: string;
  sourceHashes: Record<string, string>;
  selectedLessons: { id: string; version: number; contentHash: string }[];
  selectedRequirements: { id: string; version: number; sourceIds: string[]; reason: string }[];
  requiredSections: string[];
  optionalSections: string[];
  expansions: { id: string; hash: string; chars: number }[];
  charCount: number;
  byteCount: number;
  tokenEstimate: number;
  tokenEstimateMethod: "chars/4";
  authoringPolicy?: { mode: string; lessonRelease: string | null; hash: string };
  compositionSelection?: { selectorVersion: string; inputSignalHash: string; manifestHash: string; selectedIds: string[] };
  compositionPageSelections?: { page: string; inputSignalHash: string; selectedIds: string[] }[];
  referenceSelection?: ReturnType<typeof referenceContext> extends infer T ? T extends { receipt: infer R } ? R : never : never;
};

export type DesignContextPacket = {
  manifest: DesignContextManifest;
  text: string;
  expansions: DesignContextExpansion[];
};

function readJson<T>(root: string, path: string): T | undefined {
  const full = join(root, path);
  if (!existsSync(full)) return undefined;
  try { return json<T>(full); } catch { return undefined; }
}

function hashFile(root: string, path: string): string | undefined {
  if (!existsSync(join(root, path))) return undefined;
  return fingerprint(root, [path]);
}

export const DESIGN_CONTEXT_STAGES = new Set([
  "narrative", "reference-analysis", "direction", "storyboard", "representative", "representative-quality", "pages", "visual-review", "content-review", "refine",
]);

const STAGE_INCLUDE: Record<string, { required: string[]; omit: string[] }> = {
  narrative: { required: ["objective", "constraints", "business", "uncertainty"], omit: ["unrelated-lessons"] },
  "reference-analysis": { required: ["objective", "constraints", "opportunities", "lessons"], omit: ["full-copy"] },
  direction: { required: ["objective", "constraints", "opportunities", "lessons"], omit: ["full-copy"] },
  storyboard: { required: ["objective", "constraints", "direction", "lessons", "media"], omit: ["component-examples"] },
  representative: { required: ["objective", "constraints", "direction", "storyboard", "copy", "media"], omit: ["remaining-page-implementation"] },
  "representative-quality": { required: ["objective", "constraints", "storyboard", "composition-intent", "captures", "render-observations"], omit: ["new-art-direction"] },
  pages: { required: ["objective", "constraints", "binding", "storyboard"], omit: ["reinvent-direction"] },
  "visual-review": { required: ["objective", "constraints", "captures"], omit: ["full-harvest"] },
  "content-review": { required: ["objective", "constraints", "copy"], omit: ["full-harvest"] },
  refine: { required: ["objective", "constraints", "change", "binding"], omit: ["fresh-ideation"] },
};

export function buildDesignContextPacket(opts: {
  root: string;
  nodeId: string;
  allowedWrites?: string[];
  jevMode?: "off" | "shadow" | "assist";
  advisory?: string;
  /** Lifecycle-selected lessons before reference-analysis is written. */
  preSelectedLessons?: PreSelectedLesson[];
  preparationId?: string;
  kernel?: string;
  optionalCharBudget?: number;
}): DesignContextPacket {
  const nodeId = opts.nodeId;
  const profile = STAGE_INCLUDE[nodeId] || STAGE_INCLUDE.narrative!;
  const business = readJson<Business>(opts.root, "onboarding/business.json");
  const narrative = readJson<NarrativeBrief>(opts.root, "onboarding/narrative-brief.json");
  const direction = readJson<Direction>(opts.root, "onboarding/direction.json");
  const story = readJson<Storyboard>(opts.root, "onboarding/storyboard.json");
  const media = readJson<MediaInventory>(opts.root, "onboarding/media-inventory.json");
  const analysis = readJson<ReferenceAnalysis>(opts.root, "onboarding/reference-analysis.json");
  const request = readJson<{ theme?: string }>(opts.root, "agent/request.json");
  const catalog = loadKnowledgeCatalog(opts.root);
  const pack = loadKnowledgeV2(opts.root);
  const authoringPolicy = resolveDesignAuthoring(opts.root);
  const composition = compositionContextForStage(opts.root, nodeId);
  const pageContexts = composition && story && ["storyboard", "representative", "representative-quality", "pages", "visual-review", "content-review", "refine"].includes(nodeId)
    ? story.pages.filter(page => nodeId !== "representative" && nodeId !== "representative-quality" || page.path === "/" || page.representative).map(page => ({ ...composition, receipt: selectCompositionLessons({ pack: composition.pack, stage: nodeId, page: page.path, signals: compositionSignalsFromSite(opts.root, page.path), policyHash: composition.policy.hash, limit: 2 }) }))
    : [];
  const widgetEvidence = siteWidgets(opts.root, story);
  const required: string[] = [];
  const themeIdentity = selectedThemeContext(opts.root);
  if (themeIdentity) required.push(themeIdentity);
  const optional: string[] = [];
  const expansions: DesignContextExpansion[] = [];
  const references = referenceContext(opts.root, nodeId, opts.kernel);
  if (references) {
    optional.push(`## Selected reference working set\n${references.text}\nDiscovery shortlist and exclusions: expand reference-discovery.\nExpansion command: ${kernelScriptCommand(references.pack.kernel, "scripts/eval-site.ts")} --site . --expand-design-context ID --preparation ${opts.preparationId || "PREPARATION_ID"}`);
    expansions.push(...references.expansions);
  }

  required.push([
    "## Stage objective",
    `Node: ${nodeId}`,
    `Allowed writes: ${(opts.allowedWrites || []).join(", ") || "see CURRENT.md"}`,
    "Completion checks: run the evaluate command in CURRENT.md. Do not mark STATE by hand.",
  ].join("\n"));

  const constraints = [
    "## Hard constraints",
    request?.theme?.trim() ? `Exact user theme: ${request.theme.trim()}` : "No exact user theme is recorded.",
    ...MANDATORY_OBLIGATIONS.map(item => `- ${item.id}: ${item.text}`),
  ];
  required.push(constraints.join("\n"));
  required.push(`## Authoring policy\n${authoringPolicy.mode}; lesson release ${authoringPolicy.lessonRelease || "none"}; policy hash ${authoringPolicy.hash}. ${authoringPolicy.mode === "composition-v1" ? "Author site-owned content relationships; use selected lessons as advisory teaching and inspect the current render." : "Build site-owned components using the selected theme and business evidence."}`);
  if (!pack) {
    required.push("## Knowledge integrity\nThe sourced v2 pack is unavailable. Do not treat its requirements as verified or silently substitute them.");
  } else if (pack.errors.length) {
    required.push(`## Knowledge integrity\nThe sourced v2 pack failed validation and is quarantined: ${pack.errors.join("; ")}`);
  }
  const selectedRequirements = pack && pack.errors.length === 0
    ? selectStageKnowledge({ requirements: pack.requirements, lessons: [], signals: { ...signalsFromSite(opts.root), widgets: widgetEvidence.widgets } satisfies StageSignals, stage: nodeId }).requirements
    : [];
  if (selectedRequirements.length) required.push([
    `## Applicable requirements (knowledge release ${pack!.release})`,
    ...selectedRequirements.map(item => `- ${item.id}@${item.version} [${item.authorityClass}; ${item.severityPolicy}; source ${item.authorityIds.join(", ")}; applies ${item.applicability}]: ${item.instruction} Exceptions: ${item.exceptions.join("; ") || "none recorded"}. Verification: ${item.verificationMethod}.`),
  ].join("\n"));

  if (business) {
    required.push([
      "## Business facts",
      `Offer: ${business.offer}`,
      `Audience: ${business.audience}`,
      `Uncertainties: ${(business.uncertainties || []).map(item => item.question).join("; ") || "none recorded"}`,
    ].join("\n"));
  }
  if (narrative?.schemaVersion === 2) {
    required.push([
      "## Visitor goals and opportunities",
      ...(narrative.visitorQuestions || []).map(item => `- ${item.question} (${item.relationshipToConversion})`),
      ...(narrative.designOpportunities || []).map(item => `- ${item.id} [${item.basis}]: ${item.presentationOpportunity}`),
    ].join("\n"));
  }
  if (direction?.centralIdea && profile.required.includes("direction") || (direction?.centralIdea && ["direction", "storyboard", "representative", "pages"].includes(nodeId))) {
    required.push([
      "## Design thesis",
      direction.centralIdea || "",
      `Invariants: ${(direction.identityInvariants || []).join("; ")}`,
      `Flexible: ${(direction.flexibleDecisions || []).join("; ")}`,
    ].join("\n"));
  }
  if (["pages", "representative", "refine"].includes(nodeId)) {
    required.push(`## Approved binding\n${representativeBindingHash(opts.root)}\nDo not reopen direction because this packet was refreshed.`);
  }

  const selected: LessonSelection[] = composition ? [] : (analysis?.teachingPrinciples?.length
    ? (analysis.teachingPrinciples || []).flatMap(ref => {
      const lesson = catalog?.lessons.find(item => item.id === ref.id && item.contentHash === ref.contentHash);
      if (!lesson) return [];
      return [{
        id: lesson.id,
        version: lesson.version,
        contentHash: lesson.contentHash,
        reason: ref.reason,
        contraindicationsConsidered: lesson.contraindications,
        mandatory: false,
        expansionHandle: `lesson:${lesson.id}@${lesson.version}`,
      }];
    })
    : (opts.preSelectedLessons || []).flatMap(ref => {
      const lesson = catalog?.lessons.find(item => item.id === ref.id && item.contentHash === ref.contentHash);
      if (!lesson) return [];
      return [{
        id: lesson.id,
        version: lesson.version,
        contentHash: lesson.contentHash,
        reason: ref.reason,
        contraindicationsConsidered: lesson.contraindications,
        mandatory: false,
        expansionHandle: ref.expansionHandle || `lesson:${lesson.id}@${lesson.version}`,
      }];
    }));
  if (!analysis?.teachingPrinciples?.length && selected.length && ["reference-analysis", "direction"].includes(nodeId)) {
    required.push([
      "## Selected teaching principles (lifecycle)",
      "Record these ids, versions, content hashes, and your applicability reasons in onboarding/reference-analysis.json teachingPrinciples.",
      ...selected.map(item => `- ${item.id}@${item.version} (${item.contentHash.slice(0, 12)}…): ${item.reason}`),
    ].join("\n"));
  }
  if (selected.length && catalog) {
    const bodies = selected.map(item => {
      const lesson = catalog.lessons.find(entry => entry.id === item.id)!;
      return { item, text: readLessonBody(catalog.kernel, lesson) };
    });
    let used = 0;
    const inline: string[] = ["## Selected lessons"];
    for (const body of bodies) {
      if (used + body.text.length > (opts.optionalCharBudget ?? OPTIONAL_CHAR_BUDGET)) {
        const hash = createHash("sha256").update(body.text).digest("hex");
        expansions.push({ id: body.item.expansionHandle, hash, chars: body.text.length, text: body.text });
        const expandCmd = opts.preparationId
          ? `${kernelScriptCommand(opts.kernel || opts.root, "scripts/eval-site.ts")} --site . --expand-design-context ${body.item.expansionHandle} --preparation ${opts.preparationId}`
          : `expand ${body.item.expansionHandle}`;
        inline.push(`- ${body.item.id} (expand ${body.item.expansionHandle}, ${body.text.length} chars)\n  Command: ${expandCmd}`);
      } else {
        used += body.text.length;
        inline.push(body.text);
      }
    }
    optional.push(inline.join("\n\n"));
  }
  if (composition) {
    const receipt = composition.receipt;
    if (nodeId === "reference-analysis") required.push("Record initially chosen composition teachingPrinciples in reference-analysis.json with id, version, contentHash, and contextual reason. Keep observed reference relationships separate from proposed applications; later page choices belong to the storyboard and authoring record. An intact pack with no suitable lesson may record an empty selection.");
    optional.push([
      `## Composition lessons for ${nodeId} (advisory; ${composition.pack.release})`,
      ...receipt.selected.map(item => `- ${item.id}@${item.version} [${item.contentHash.slice(0, 12)}]: ${item.summary} Reason: ${item.reason}. Expand ${item.expansionHandle}.`),
      receipt.selected.length ? "" : "No applicable lesson is established from current evidence. An original contextual choice is valid.",
      `Other eligible lessons: ${receipt.alternatives.map(item => `${item.id} (${item.expansionHandle})`).join(", ") || "none"}.`,
      "Expansion and inspection are separate actions. Example availability does not establish that an example was inspected.",
    ].filter(Boolean).join("\n"));
    for (const item of [...receipt.selected, ...receipt.alternatives]) {
      const lesson = composition.pack.lessons.find(entry => entry.id === item.id)!;
      const body = composition.pack.body(item.id);
      expansions.push({ id: item.expansionHandle, hash: createHash("sha256").update(body).digest("hex"), chars: body.length, text: body });
    }
    if (pageContexts.length) {
      const pageText = [
        "## Page-specific composition choices",
        ...pageContexts.map(context => `${context.receipt.page}: ${context.receipt.selected.map(item => `${item.id} (${item.summary})`).join("; ") || "no established lesson"}; signal ${context.receipt.inputSignalHash.slice(0, 12)}`),
      ].join("\n");
      if (pageText.length <= Math.min(3000, opts.optionalCharBudget ?? OPTIONAL_CHAR_BUDGET)) optional.push(pageText);
      else {
        expansions.push({ id: "composition:pages", hash: createHash("sha256").update(pageText).digest("hex"), chars: pageText.length, text: pageText });
        optional.push(`## Page-specific composition choices\n${pageContexts.length} route receipts; expand composition:pages for all page summaries.`);
      }
    }
    for (const context of pageContexts) for (const item of context.receipt.selected) if (!expansions.some(entry => entry.id === item.expansionHandle)) {
      const body = context.pack.body(item.id);
      expansions.push({ id: item.expansionHandle, hash: createHash("sha256").update(body).digest("hex"), chars: body.length, text: body });
    }
  }

  if (story && ["storyboard", "representative", "representative-quality", "pages"].includes(nodeId)) {
    const pages = nodeId === "representative"
      ? story.pages.filter(page => page.path === "/" || page.representative)
      : story.pages;
    required.push([
      "## Section plan",
      ...pages.flatMap(page => [
        `${page.path} role=${page.role || "unspecified"} outcome=${page.visitorOutcome || page.purpose}${page.compositionIntent ? `; organizing relationship=${page.compositionIntent.organizingRelationship}; reading sequence=${page.compositionIntent.readingSequence.join(" → ")}` : ""}`,
        ...page.sections.map(section => `- ${section.id}: ${section.purpose || section.message}; layout=${section.layoutFamily || section.composition}; emphasis=${section.emphasis}; mobile=${section.mobileTransformation || "unspecified"}${section.renderObservations?.length ? `; observations=${section.renderObservations.map(item => `${item.id}: ${item.expectation}`).join(" | ")}` : ""}`),
      ]),
    ].join("\n"));
  }
  if (media && ["narrative", "storyboard", "representative"].includes(nodeId)) {
    const usable = (media.assets || []).filter(asset => mediaDesignEligibility(asset) === "use");
    const retained = (media.assets || []).filter(asset => mediaDesignEligibility(asset) === "retain");
    if(artDirectionPolicy(opts.root))expansions.push({id:"art-media-inventory", text:JSON.stringify(media,null,2), chars:JSON.stringify(media,null,2).length, hash:createHash("sha256").update(JSON.stringify(media,null,2)).digest("hex")});
    required.push([
      "## Available media",
      artDirectionPolicy(opts.root) ? "Expand art-media-inventory for the complete collection before choosing a consequential sequence. Inventory order does not establish quality." : "",
      ...usable.slice(0, 12).map(asset => `- ${asset.id}: ${asset.role}; ${asset.description} (approved use)`),
      ...retained.slice(0, 8).map(asset => `- ${asset.id}: ${asset.role}; ${asset.description} (retained file, not an approved placement)`),
      usable.length ? "" : "No inspected assets with disposition use. Do not invent imagery. Retained files are not approved placements.",
    ].join("\n"));
  }

  if (opts.jevMode === "assist" && opts.advisory?.trim()) {
    optional.push(`## Jev observations\nStatus: advisory. The agent keeps the decision.\n${opts.advisory.trim()}`);
  }

  const art = artDirectionContext(opts.root);
  if (art) required.push(art);
  const text = [...required, ...optional].filter(Boolean).join("\n\n");
  const sourceHashes: Record<string, string> = {};
  if (themeIdentity) for (const path of [SELECTION_PATH, BRAND_PATH]) { const hash=hashFile(opts.root,path);if(hash)sourceHashes[path]=hash; }
  if(artDirectionPolicy(opts.root))sourceHashes["art-direction-policy"]=artDirectionPolicy(opts.root)!.hash;
  for (const path of ["onboarding/business.json", "onboarding/narrative-brief.json", "onboarding/direction.json", "onboarding/storyboard.json", "onboarding/reference-analysis.json", "agent/request.json", "agent/site-memory.json", "onboarding/visual-asset-brief.json", "onboarding/asset-production.json", "onboarding/media-inventory.json"]) {
    const hash = hashFile(opts.root, path);
    if (hash) sourceHashes[path] = hash;
  }
  for (const lesson of selected) sourceHashes[`lesson:${lesson.id}`] = lesson.contentHash;
  sourceHashes["authoring-policy"] = authoringPolicy.hash;
  if (references) {
    sourceHashes["reference-policy"] = references.policy.hash;
    sourceHashes["reference-release"] = references.pack.manifestHash;
    sourceHashes["reference-signals"] = references.receipt.inputSignalHash;
    sourceHashes["reference-teaching-release"] = references.receipt.teachingManifestHash;
  }
  if (composition) {
    sourceHashes["composition-release"] = composition.pack.manifestHash;
    sourceHashes["composition-signals"] = composition.receipt.inputSignalHash;
    for (const item of composition.receipt.selected) sourceHashes[`composition-lesson:${item.id}`] = item.contentHash;
    for (const context of pageContexts) sourceHashes[`composition-page:${context.receipt.page}`] = context.receipt.inputSignalHash;
  }
  for (const path of widgetEvidence.sourceFiles) sourceHashes[path] = hashFile(opts.root, path)!;
  if (pack && pack.errors.length === 0) {
    sourceHashes["knowledge-release"] = createHash("sha256").update(JSON.stringify({ release: pack.release, requirements: pack.requirements, sources: pack.sources })).digest("hex");
  }
  const manifest: DesignContextManifest = {
    schemaVersion: 1,
    nodeId,
    sourceHashes,
    selectedLessons: selected.map(item => ({ id: item.id, version: item.version, contentHash: item.contentHash })),
    selectedRequirements: selectedRequirements.map(item => ({ id: item.id, version: item.version, sourceIds: item.authorityIds, reason: item.applicability })),
    requiredSections: profile.required,
    optionalSections: optional.length ? ["lessons"] : [],
    expansions: expansions.map(item => ({ id: item.id, hash: item.hash, chars: item.chars })),
    charCount: text.length,
    byteCount: Buffer.byteLength(text, "utf8"),
    tokenEstimate: Math.ceil(text.length / 4),
    tokenEstimateMethod: "chars/4",
    authoringPolicy,
    referenceSelection: references?.receipt,
    compositionSelection: composition ? { selectorVersion: composition.receipt.selectorVersion, inputSignalHash: composition.receipt.inputSignalHash, manifestHash: composition.pack.manifestHash, selectedIds: composition.receipt.selected.map(item => item.id) } : undefined,
    compositionPageSelections: pageContexts.map(context => ({ page: context.receipt.page!, inputSignalHash: context.receipt.inputSignalHash, selectedIds: context.receipt.selected.map(item => item.id) })),
  };
  return { manifest, text, expansions };
}

/** Keep workflow instructions. Drop the design packet's stage header when the instruction packet already names the node and outputs. */
export function supplementDesignContext(instruction: string, designText: string): string {
  if (!designText.trim()) return instruction;
  let supplement = designText.trim();
  if (instruction.includes('## Selected visual identity')) supplement = supplement.replace(/## Selected visual identity\n[\s\S]*?(?=\n## |$)/, '').trim();
  if (/Active node:/.test(instruction) && /Write outputs:/.test(instruction)) {
    supplement = supplement.replace(/^## Stage objective\n[\s\S]*?(?=\n## |$)/, "").trim();
  }
  if (!supplement) return instruction;
  return `${instruction}\n\n## Design context\nStage-specific evidence and selected lessons. The workflow instructions, skills, and review boundaries above stay binding.\n\n${supplement}`;
}

export function expandDesignContextItem(packet: DesignContextPacket, id: string): { ok: true; text: string } | { ok: false; reason: string } {
  const item = packet.expansions.find(entry => entry.id === id);
  const listed = packet.manifest.expansions.find(entry => entry.id === id);
  if (!item || !listed) return { ok: false, reason: `Unknown expansion ${id}` };
  const hash = createHash("sha256").update(item.text).digest("hex");
  if (hash !== listed.hash || item.text.length !== listed.chars) return { ok: false, reason: "Expansion content does not match the manifest hash" };
  return { ok: true, text: item.text };
}
