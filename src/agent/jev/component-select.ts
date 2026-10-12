import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import type { JevClient } from "./client.ts";
import { partitionBatchItems, executeBatches } from "./batching.ts";
import { makeComponentFitQuestion, makeRhythmRepetitionQuestion, type ComponentFitDimension } from "./questions.ts";
import {
  hardFilterBlocks,
  lexicalShortlist,
  loadBlockLibrary,
  libraryContentHash,
  type BlockRecord,
  type SectionState,
} from "./block-catalog.ts";
import { sha256Hex } from "./state.ts";
import { POLICY_VERSION } from "./policy.ts";
import { COMPONENT_FIT_SEMANTICS_HASH } from "./questions.ts";
import { loadProfiledBlockLibrary } from "../../blocks/library-profile.ts";
import { json, type Storyboard } from "../artifacts.ts";
import { recordTaskExecution, saveTaskManifest, allTasks, loadTaskExecution, verifyTaskExecution } from "./service-registry.ts";

export const COMPONENT_FIT_WEIGHTS: Record<ComponentFitDimension, number> = {
  visitor_job: 0.35,
  slot_fit: 0.25,
  media_fit: 0.2,
  composition_fit: 0.2,
};

export const CUSTOM_CANDIDATE_ID = "custom";
const CANDIDATE_TEXT_VERSION = 2;

export interface ComponentRecommendation {
  id: string;
  score: number;
  scoreState?: "observed" | "partial" | "unavailable";
  reasonCodes: string[];
  adaptations: string[];
  exampleHandle: string;
  previewEvidence?: BlockRecord["previewEvidence"];
  custom: boolean;
}

export interface ComponentSelectResult {
  libraryProfile?: string;
  libraryReleaseIdentity?: string;
  ranked: ComponentRecommendation[];
  routeToAgent: boolean;
  reason?: string;
  cacheKey: string;
  raw: Record<string, unknown>;
  receiptIds?: string[];
  cacheHit?: boolean;
  provenance?: ComponentCacheProvenance;
  discovery?: { eligibleIds: string[]; rejected: Array<{ id: string; reason: string }>; shortlistIds: string[] };
}

export interface ComponentCacheProvenance {
  libraryProfile?: string;
  libraryReleaseIdentity?: string;
  preparationId: string;
  cacheKey: string;
  libraryHash: string;
  stateHash: string;
  model: string;
  policy: string;
  questionSemantics: string;
  receiptIds: string[];
}

function compactState(state: SectionState): string {
  return [
    `section=${state.sectionId}`,
    `page=${state.pagePath}`,
    `job=${state.visitorJob}`,
    `actions=${state.requiredActions.join(",")}`,
    `textLength=${state.textLength}`,
    `textIdentity=${state.textContentIdentity || ""}`,
    `mediaCount=${state.mediaCount}`,
    `mediaIds=${(state.mediaIds || []).join(",")}`,
    `aspect=${state.mediaAspect || ""}`,
    `emphasis=${state.emphasis || ""}`,
    `interaction=${state.interaction || ""}`,
    `role=${state.pageRole || ""}`,
    `outcome=${state.pageVisitorOutcome || ""}`,
    `sectionRole=${state.sectionRole || ""}`,
    `purpose=${state.sectionPurpose || ""}`,
    `decisions=${(state.decisionIds || []).join(",")}`,
    `constraints=${(state.constraints || []).join(",")}`,
    `shape=${state.contentShape || ""}`,
    `mediaNotes=${(state.mediaDescriptors || []).join(",")}`,
    `layout=${state.layoutFamily || ""}`,
    `repetition=${state.repetitionRationale || ""}`,
    `adjacent=${(state.adjacentRoles || []).join(",")}`,
    `adjacentIds=${(state.adjacentSectionIds || []).join(",")}`,
    `neighbors=${(state.neighborPurposes || []).join(",")}`,
    `sources=${(state.sourceIds || []).join(",")}`,
    `sourceHashes=${(state.sourceHashes || []).join(",")}`,
  ].join("\n");
}

function candidateText(b: BlockRecord): string {
  return [
    `id=${b.id}`,
    `look=${b.look}`,
    `media=${b.media} (Jev does not see images; metadata only)`,
    `slots=${b.slots.map(s => `${s.name}${s.required ? "*" : ""}`).join(",")}`,
    `interaction=${b.interaction}`,
    `geometry=${b.geometry.join(",")}`,
    `registers=${b.registers.join(",")}`,
    `visitorJobs=${b.meta?.fit.visitorJobs.join(";") || "legacy-unavailable"}`,
    `pageRoles=${b.meta?.fit.pageRoles.join(";") || "legacy-unavailable"}`,
    `requiredMedia=${b.meta?.media.min ?? "legacy-unknown"}`,
    `composition=${b.meta ? `${b.meta.composition.hierarchy}; ${b.meta.composition.alignment}; ${b.meta.composition.density}` : "legacy-coarse"}`,
  ].join("\n");
}

export function cacheKeyForSelection(opts: {
  state: SectionState;
  libraryHash: string;
  model: string;
  policy: string;
  questionSemantics?: string;
  profile?: string;
}): string {
  return sha256Hex(JSON.stringify({
    state: compactState(opts.state),
    library: opts.libraryHash,
    model: opts.model,
    policy: opts.policy,
    questionSemantics: opts.questionSemantics || COMPONENT_FIT_SEMANTICS_HASH,
    profile: opts.profile || "component-assist",
    candidateTextVersion: CANDIDATE_TEXT_VERSION,
  }));
}

export function componentStateHash(state: SectionState): string {
  return sha256Hex(compactState(state));
}

export function planComponentQuestions(state: SectionState, lib: ReturnType<typeof loadBlockLibrary>): {
  questionIds: string[];
  partitions: ReturnType<typeof partitionBatchItems>["partitions"];
  stateHash: string;
  candidates: BlockRecord[];
  discovery: NonNullable<ComponentSelectResult["discovery"]>;
} {
  const viable = hardFilterBlocks(lib, state);
  const short = lexicalShortlist({ ...lib, blocks: viable }, state, 8);
  const viableIds = new Set(viable.map(b => b.id));
  const discovery = { eligibleIds: viable.map(b => b.id), rejected: lib.blocks.filter(b => !viableIds.has(b.id)).map(b => ({
    id: b.id, reason: b.meta && state.mediaCount < b.meta.media.min ? `requires ${b.meta.media.min} media item(s), has ${state.mediaCount}` : "unavailable",
  })), shortlistIds: short.map(b => b.id) };
  const custom: BlockRecord = {
    id: CUSTOM_CANDIDATE_ID,
    category: "custom",
    name: "custom",
    look: "Site-owned custom component",
    media: "any",
    mediaRequired: false,
    registers: [],
    variants: [],
    slots: [],
    interaction: state.interaction === "island" ? "island" : "static",
    mobile: { hasMediaQuery: false, notes: "" },
    geometry: [],
    example: "",
    examplePath: "custom",
    seesImages: false,
    dir: "",
  };
  const candidates = [...short.slice(0, 7), custom];
  const dimensions: ComponentFitDimension[] = ["visitor_job", "slot_fit", "media_fit", "composition_fit"];
  const items = [];
  const stateText = compactState(state);
  for (const c of candidates) {
    for (const dim of dimensions) {
      items.push({
        id: `${c.id}__${dim}`,
        taskType: "coverage" as const,
        questionKey: `${c.id}__${dim}`,
        question: makeComponentFitQuestion(dim, candidateText(c), stateText),
        claimId: c.id,
        claim: c.id,
        metadata: { dim, candidate: c.id, stateHash: componentStateHash(state) },
      });
    }
    items.push({
      id: `${c.id}__rhythm`,
      taskType: "coverage" as const,
      questionKey: `${c.id}__rhythm`,
      question: makeRhythmRepetitionQuestion((state.adjacentRoles || []).join(", ") || "(none)", candidateText(c)),
      claimId: c.id,
      claim: c.id,
      metadata: { dim: "rhythm", candidate: c.id, stateHash: componentStateHash(state) },
    });
  }
  const { partitions } = partitionBatchItems(items);
  return {
    questionIds: partitions.flatMap(partition => Object.keys(partition.questions)),
    partitions,
    stateHash: componentStateHash(state),
    candidates,
    discovery,
  };
}

export function verifyComponentCacheHit(opts: {
  root: string;
  cached: ComponentSelectResult;
  state: SectionState;
  libraryHash: string;
  model: string;
  policy?: string;
  profile?: string;
}): { ok: true } | { ok: false; reason: string } {
  const policy = opts.policy || POLICY_VERSION;
  const cacheKey = cacheKeyForSelection({
    state: opts.state,
    libraryHash: opts.libraryHash,
    model: opts.model,
    policy,
    questionSemantics: COMPONENT_FIT_SEMANTICS_HASH,
    profile: opts.profile,
  });
  const provenance = opts.cached.provenance;
  if (!provenance) return { ok: false, reason: "Component cache has no provenance." };
  if (opts.cached.cacheKey !== cacheKey || provenance.cacheKey !== cacheKey || provenance.libraryHash !== opts.libraryHash || provenance.stateHash !== componentStateHash(opts.state)) {
    return { ok: false, reason: "Component cache does not match the current section, library, model, or policy." };
  }
  const task = allTasks().find(item => item.taskId === "component-fit-check");
  if (!task) return { ok: false, reason: "component-fit-check is not registered." };
  const original = loadTaskExecution(opts.root, provenance.preparationId, "component-fit-check");
  if (!original) return { ok: false, reason: "Original component execution record is missing." };
  const verified = verifyTaskExecution(opts.root, provenance.preparationId, original.nodeId, task, original.inputHash, {
    expectedModel: opts.model,
    expectedQuestionSemantics: COMPONENT_FIT_SEMANTICS_HASH,
  });
  if (!verified.ok) return { ok: false, reason: verified.reason || "Original component execution failed verification." };
  for (const file of provenance.receiptIds) {
    if (!existsSync(join(opts.root, "agent/decisions/jev", file))) {
      return { ok: false, reason: `Original component receipt ${file} is missing or tampered.` };
    }
  }
  return { ok: true };
}

export async function recommendComponents(opts: {
  root: string;
  kernel: string;
  client: JevClient;
  state: SectionState;
  preparationId?: string;
  nodeId?: string;
  signal?: AbortSignal;
}): Promise<ComponentSelectResult> {
  const profiled = loadProfiledBlockLibrary(opts.kernel, opts.root);
  const lib = profiled.library;
  const libraryHash = libraryContentHash(lib);
  const cacheKey = cacheKeyForSelection({
    state: opts.state,
    libraryHash,
    model: opts.client.model,
    policy: POLICY_VERSION,
    questionSemantics: COMPONENT_FIT_SEMANTICS_HASH,
    profile: profiled.profile,
  });
  const cachePath = join(opts.root, "agent/runs", `component-select.${cacheKey.slice(0, 16)}.json`);
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf8")) as ComponentSelectResult;
      const verdict = verifyComponentCacheHit({
        root: opts.root,
        cached,
        state: opts.state,
        libraryHash,
        model: opts.client.model,
        profile: profiled.profile,
      });
      if (verdict.ok) return { ...cached, cacheHit: true };
    } catch { /* recompute */ }
  }

  const plan = planComponentQuestions(opts.state, lib);
  const candidates = plan.candidates;
  if (candidates.length < 2) {
    const result: ComponentSelectResult = {
      libraryProfile: profiled.profile,
      libraryReleaseIdentity: profiled.releaseIdentity,
      ranked: [{ id: CUSTOM_CANDIDATE_ID, score: 1, reasonCodes: ["missing_metadata"], adaptations: [], exampleHandle: "custom", custom: true }],
      routeToAgent: true,
      reason: "No viable library candidates after hard filters.",
      discovery: plan.discovery,
      cacheKey,
      raw: {},
      receiptIds: [],
    };
    persist(cachePath, result);
    return result;
  }

  const partitions = plan.partitions;
  const executed = partitions.length
    ? await executeBatches({ client: opts.client, partitions, signal: opts.signal, nodeId: opts.nodeId || "pages" })
    : { answers: {} as Record<string, unknown>, receipts: [] as string[] };

  const dimensions: ComponentFitDimension[] = ["visitor_job", "slot_fit", "media_fit", "composition_fit"];
  const ranked: ComponentRecommendation[] = [];
  for (const c of candidates) {
    let weighted = 0;
    let weightSum = 0;
    let observed = 0;
    const reasonCodes: string[] = [];
    for (const dim of dimensions) {
      const ans = executed.answers[`${c.id}__${dim}`] as { score?: number } | undefined;
      if (typeof ans?.score !== "number" || !Number.isFinite(ans.score)) {
        reasonCodes.push(`unavailable_${dim}`);
        continue;
      }
      observed += 1;
      weighted += ans.score * COMPONENT_FIT_WEIGHTS[dim];
      weightSum += COMPONENT_FIT_WEIGHTS[dim];
      if (ans.score <= 1) reasonCodes.push(`weak_${dim}`);
      if (ans.score >= 3) reasonCodes.push(`strong_${dim}`);
    }
    const rhythm = executed.answers[`${c.id}__rhythm`] as { noul?: number } | undefined;
    if (typeof rhythm?.noul === "number" && rhythm.noul >= 0.85 && c.id !== CUSTOM_CANDIDATE_ID) {
      weighted -= 1.5;
      reasonCodes.push("repetitive_rhythm");
    }
    ranked.push({
      id: c.id,
      score: observed ? weighted / weightSum : 0,
      scoreState: observed === 0 ? "unavailable" : observed === dimensions.length ? "observed" : "partial",
      reasonCodes,
      adaptations: c.slots.filter(s => s.required).map(s => `fill:${s.name}`),
      exampleHandle: c.examplePath,
      previewEvidence: c.previewEvidence,
      custom: c.id === CUSTOM_CANDIDATE_ID,
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  const top = ranked.filter(r => !r.custom).slice(0, 3);
  const customRec = ranked.find(r => r.custom)!;
  const packet = [...top, customRec];
  const scores = top.map(t => t.score);
  const incomplete = top.some(item => item.scoreState && item.scoreState !== "observed");
  const tie = !incomplete && scores.length > 1 && Math.abs((scores[0] || 0) - (scores[1] || 0)) < 0.15;
  const low = !incomplete && (scores[0] || 0) < 1.5;
  const result: ComponentSelectResult = {
    libraryProfile: profiled.profile,
    libraryReleaseIdentity: profiled.releaseIdentity,
    ranked: packet,
    routeToAgent: tie || low || incomplete || top.length === 0,
    reason: incomplete ? "incomplete_scores" : tie ? "tie" : low ? "low_confidence" : top.length === 0 ? "custom_only" : undefined,
    cacheKey,
    raw: executed.answers as Record<string, unknown>,
    receiptIds: (executed.receipts || []).map(p => basename(p)),
    discovery: plan.discovery,
    provenance: opts.preparationId ? {
      libraryProfile: profiled.profile,
      libraryReleaseIdentity: profiled.releaseIdentity,
      preparationId: opts.preparationId,
      cacheKey,
      libraryHash,
      stateHash: plan.stateHash,
      model: opts.client.model,
      policy: POLICY_VERSION,
      questionSemantics: COMPONENT_FIT_SEMANTICS_HASH,
      receiptIds: (executed.receipts || []).map(p => basename(p)),
    } : undefined,
  };
  persist(cachePath, result);
  return result;
}

function persist(path: string, result: ComponentSelectResult): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(result, null, 2), "utf8");
}

export function draftAuthoringSnippet(block: BlockRecord, copy: { heading?: string; body?: string; cta?: string; mediaId?: string }): string {
  const lines = [
    "<!-- non-production sketch; do not emit into site pages. Unescaped copy, href=\"#\", incomplete slots. -->",
    `<${block.name}>`,
  ];
  if (copy.heading) lines.push(`  <h2 slot="heading">${copy.heading}</h2>`);
  if (copy.body) lines.push(`  <p>${copy.body}</p>`);
  if (copy.cta) lines.push(`  <a class="btn" slot="actions" href="#">${copy.cta}</a>`);
  if (copy.mediaId) lines.push(`  <img slot="media" src="/media/${copy.mediaId}" alt="">`);
  lines.push(`</${block.name}>`);
  return lines.join("\n");
}

export async function attachComponentRecommendations(opts: {
  root: string;
  kernel: string;
  client: JevClient;
  nodeId: string;
  preparationId: string;
  inputHash?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const storyPath = join(opts.root, "onboarding/storyboard.json");
  const copyPath = join(opts.root, "onboarding/copy-plan.json");
  if (!existsSync(storyPath) || !existsSync(copyPath)) return "";
  let story: Storyboard;
  try { story = json<Storyboard>(storyPath); } catch { return ""; }
  let copy: { pages?: Array<{ path: string; sections?: Array<{ id: string; heading?: string; body?: string; factIds?: string[] }> }> };
  try { copy = json(copyPath); } catch { return ""; }
  const profiled = loadProfiledBlockLibrary(opts.kernel, opts.root);
  const lib = profiled.library;
  const libraryHash = libraryContentHash(lib);
  const planned: Array<{ state: SectionState; plan: ReturnType<typeof planComponentQuestions> }> = [];
  for (const page of story.pages || []) {
    if (opts.nodeId === "representative" && !(page.representative || page.path === "/")) continue;
    const sections = page.sections || [];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]!;
      const draft = copy.pages?.find(p => p.path === page.path)?.sections?.find(s => s.id === section.id);
      const body = `${draft?.heading || ""} ${draft?.body || ""}`.trim();
      const neighbors = [sections[i - 1], sections[i + 1]].filter(Boolean);
      const adjacent = neighbors.map(item => item!.id);
      const state: SectionState = {
        sectionId: section.id,
        pagePath: page.path,
        visitorJob: section.question || section.message,
        requiredActions: section.action?.label ? [section.action.label] : [],
        textLength: body.length,
        textContentIdentity: sha256Hex(body),
        mediaCount: (section.media || []).length,
        mediaIds: section.media || [],
        emphasis: section.emphasis,
        pageRole: page.role || page.purpose,
        pageVisitorOutcome: page.visitorOutcome,
        sectionRole: section.role,
        sectionPurpose: section.purpose || section.message,
        decisionIds: section.decisionIds,
        contentShape: section.media?.length ? "media" : section.action ? "action" : "prose",
        interaction: section.interaction || section.action?.behavior,
        layoutFamily: section.layoutFamily,
        repetitionRationale: section.repetitionRationale,
        adjacentRoles: neighbors.map(item => item!.role || item!.purpose || item!.id),
        neighborPurposes: neighbors.map(item => item!.purpose || item!.question || item!.id),
        adjacentSectionIds: adjacent,
        sourceIds: section.facts || [],
        sourceHashes: [
          (story as { directionHash?: string }).directionHash || "",
          (story as { businessHash?: string }).businessHash || "",
          libraryHash,
        ].filter(Boolean),
      };
      planned.push({ state, plan: planComponentQuestions(state, lib) });
    }
  }
  const subjectHash = opts.inputHash || sha256Hex(planned.map(item => item.plan.stateHash).join("\n"));
  try {
    saveTaskManifest(opts.root, {
      schemaVersion: 1,
      preparationId: opts.preparationId,
      nodeId: opts.nodeId,
      taskId: "component-fit-check",
      taskType: "coverage",
      expectedModel: opts.client.model,
      questionSemanticsHash: COMPONENT_FIT_SEMANTICS_HASH,
      claimIds: planned.map(item => item.state.sectionId),
      evidenceIds: planned.flatMap(item => item.state.sourceIds || []),
      claimHashes: Object.fromEntries(planned.map(item => [item.state.sectionId, item.plan.stateHash])),
      evidenceHashes: Object.fromEntries((planned[0]?.state.sourceHashes || []).map(hash => [hash, hash])),
      batchStateHashes: planned.flatMap(item => item.plan.partitions.map(partition => sha256Hex(JSON.stringify(partition.state)))),
      questionIds: planned.flatMap(item => item.plan.questionIds),
      subjectHash,
      createdAt: new Date().toISOString(),
    });
  } catch {
    /* existing manifest stays immutable */
  }
  const packets: Array<{ sectionId: string; pagePath: string; state: SectionState; result: ComponentSelectResult }> = [];
  const freshReceipts: string[] = [];
  for (const item of planned) {
    const result = await recommendComponents({
      root: opts.root,
      kernel: opts.kernel,
      client: opts.client,
      state: item.state,
      preparationId: opts.preparationId,
      nodeId: opts.nodeId,
      signal: opts.signal,
    });
    packets.push({ sectionId: item.state.sectionId, pagePath: item.state.pagePath, state: item.state, result });
    if (!result.cacheHit) {
      for (const id of result.receiptIds || []) freshReceipts.push(basename(id));
    }
  }
  mkdirSync(join(opts.root, "agent/runs"), { recursive: true });
  writeFileSync(join(opts.root, "agent/runs", `${opts.preparationId}.component-select.json`), JSON.stringify({
    schemaVersion: 1,
    nodeId: opts.nodeId,
    preparationId: opts.preparationId,
    libraryProfile: profiled.profile,
    libraryReleaseIdentity: profiled.releaseIdentity,
    note: "Optional shortlist for the active agent. Do not auto-edit pages/ or components/. Jev scored text metadata only; it did not inspect images. Text-only scores do not validate rendering, responsiveness, accessibility, media composition, or CTA behavior.",
    packets,
  }, null, 2), "utf8");
  const cacheHits = packets.filter(packet => packet.result.cacheHit && packet.result.provenance);
  const allCached = packets.length > 0 && cacheHits.length === packets.length;
  recordTaskExecution(opts.root, allCached ? {
    preparationId: opts.preparationId,
    nodeId: opts.nodeId,
    taskId: "component-fit-check",
    taskType: "coverage",
    inputHash: subjectHash,
    status: "cached",
    timestamp: new Date().toISOString(),
    receiptIds: cacheHits.flatMap(packet => packet.result.provenance?.receiptIds || []),
    priorPreparationId: cacheHits[0]?.result.provenance?.preparationId,
    cacheKey: sha256Hex(planned.map(item => cacheKeyForSelection({
      state: item.state,
      libraryHash,
      model: opts.client.model,
      policy: POLICY_VERSION,
      profile: profiled.profile,
    })).join("\n")),
    cachedCount: cacheHits.length,
  } : {
    preparationId: opts.preparationId,
    nodeId: opts.nodeId,
    taskId: "component-fit-check",
    taskType: "coverage",
    inputHash: subjectHash,
    status: freshReceipts.length ? "completed" : "no_candidates",
    timestamp: new Date().toISOString(),
    receiptIds: freshReceipts,
    cacheKey: sha256Hex(planned.map(item => item.plan.stateHash).join("\n")),
  });
  if (!packets.length) return "";
  const lines = [
    "## Optional Jev component shortlist (advisory; agent selects and authors)",
    "Jev received text metadata only. Validate the chosen block against actual render, mobile behavior, accessibility, and a working CTA.",
    "Do not paste draftAuthoringSnippet into the site.",
  ];
  for (const packet of packets.slice(0, 8)) {
    lines.push(`- ${packet.pagePath}#${packet.sectionId}: ${packet.result.ranked.map(r => `${r.id} (${r.score.toFixed(2)})`).join(", ")}${packet.result.routeToAgent ? " → route to agent" : ""}`);
  }
  return lines.join("\n");
}
