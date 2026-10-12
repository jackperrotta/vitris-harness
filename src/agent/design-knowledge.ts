import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { json, type MediaInventory } from "./artifacts.ts";
import { resolveKernelRoot } from "./design-calibration.ts";
import { lessonExtension, loadKnowledgeV2 } from "../knowledge/pack.ts";

export const KNOWLEDGE_VERSION = "v1";

export type LessonReference = {
  id: string;
  kind: "inspected-reference" | "original-synthetic";
  file: string;
  note: string;
};

export type KnowledgeLesson = {
  id: string;
  version: number;
  title: string;
  principle: string;
  explanation: string;
  useWhen: string[];
  avoidWhen: string[];
  requiredAssets: string[];
  contraindications: string[];
  visitorGoal: string;
  composition: string;
  typography: string;
  media: string;
  mobile: string;
  adaptation: string;
  counterexample: string;
  counterexampleWhy: string;
  references: LessonReference[];
  evidenceKind: "inspected-reference" | "original-synthetic";
  selectWhen: string[];
  contentHash: string;
};

export type KnowledgeManifest = {
  schemaVersion: 1;
  knowledgeVersion: string;
  labeledPreferenceData: false;
  purpose: string;
  catalogFile: string;
  catalogSha256: string;
  demonstrations: { file: string; sha256: string; pair: string; role: "strong" | "weak" }[];
};

export type KnowledgeCatalog = {
  version: number;
  lessons: Omit<KnowledgeLesson, "contentHash">[];
};

export type SelectionSignals = {
  projectMediaCount: number;
  peopleMediaCount: number;
  productMediaCount: number;
  usableMediaCount: number;
  lowResolutionCount: number;
  /** Inspected assets kept on file (`retain`) that are not approved placements. */
  retainedMediaCount: number;
  visitorJobs: string[];
  pageRoles: string[];
  userConstraints: string[];
  hasLocationFacts: boolean;
  hasComparisonNeed: boolean;
  serviceCount: number;
  longform: boolean;
  complexLayout: boolean;
};

export type LessonSelection = {
  id: string;
  version: number;
  contentHash: string;
  reason: string;
  contraindicationsConsidered: string[];
  mandatory: boolean;
  expansionHandle: string;
};

export const MANDATORY_OBLIGATIONS = [
  { id: "accessibility", text: "Keep readable contrast, a visible focus state, and a heading order that follows the visitor's first question." },
  { id: "user-constraints", text: "Recorded user themes and accepted preferences stay exact. Do not treat an inference as approval." },
  { id: "asset-feasibility", text: "Do not invent photography, proof, staff, or awards the evidence does not contain." },
] as const;

export function knowledgeDir(kernel: string): string {
  return join(resolve(kernel), "design-system", "knowledge", KNOWLEDGE_VERSION);
}

export function resolveKnowledgeRoot(siteOrKernel: string): string | undefined {
  const kernel = resolveKernelRoot(siteOrKernel);
  if (kernel && existsSync(join(knowledgeDir(kernel), "manifest.json"))) return kernel;
  const env = (process.env.VITRIS_HARNESS || process.env.VITRIS_KERNEL)?.trim();
  if (env && existsSync(join(knowledgeDir(env), "manifest.json"))) return resolve(env);
  return kernel;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function confined(dir: string, file: string): string | undefined {
  if (!file || file.includes("..") || file.startsWith("/") || /^[A-Za-z]:/.test(file)) return undefined;
  const target = resolve(dir, file);
  const rel = relative(dir, target);
  if (rel.startsWith("..") || rel.includes(`..${"\\"}`)) return undefined;
  return target;
}

export function loadKnowledgeManifest(kernel: string): KnowledgeManifest {
  return json<KnowledgeManifest>(join(knowledgeDir(kernel), "manifest.json"));
}

export function verifyKnowledgePack(kernel: string): string[] {
  const errors: string[] = [];
  const dir = knowledgeDir(kernel);
  if (!existsSync(join(dir, "manifest.json"))) return ["Missing design-system/knowledge pack"];
  const manifest = loadKnowledgeManifest(kernel);
  if (manifest.schemaVersion !== 1 || manifest.knowledgeVersion !== KNOWLEDGE_VERSION) errors.push("Knowledge pack version mismatch");
  if (manifest.labeledPreferenceData !== false) errors.push("Knowledge pack must not claim labeled preference data");
  const catalogPath = confined(dir, manifest.catalogFile);
  if (!catalogPath || !existsSync(catalogPath)) errors.push("Knowledge catalog path is missing or escapes the pack");
  else if (sha256(readFileSync(catalogPath)) !== manifest.catalogSha256) errors.push("Knowledge catalog hash mismatch");
  for (const demo of manifest.demonstrations || []) {
    const file = confined(dir, demo.file);
    if (!file || !existsSync(file)) errors.push(`Missing or unconfined demonstration: ${demo.file}`);
    else if (sha256(readFileSync(file)) !== demo.sha256) errors.push(`Demonstration hash mismatch: ${demo.file}`);
  }
  return errors;
}

export function loadKnowledgeCatalog(siteOrKernel: string): { kernel: string; lessons: KnowledgeLesson[] } | undefined {
  const kernel = resolveKnowledgeRoot(siteOrKernel);
  if (!kernel) return undefined;
  const errors = verifyKnowledgePack(kernel);
  if (errors.length) return undefined;
  const dir = knowledgeDir(kernel);
  const manifest = loadKnowledgeManifest(kernel);
  const catalog = json<KnowledgeCatalog>(join(dir, manifest.catalogFile));
  const lessons = catalog.lessons.map(lesson => ({
    ...lesson,
    contentHash: sha256(JSON.stringify(lesson)),
  }));
  const addedPath = join(dir, "..", "v2", "added-lessons.json");
  if (existsSync(addedPath)) {
    try {
      const added = json<KnowledgeCatalog>(addedPath);
      for (const lesson of added.lessons) {
        if (!lessons.some(item => item.id === lesson.id)) {
          lessons.push({ ...lesson, contentHash: sha256(JSON.stringify(lesson)) });
        }
      }
    } catch {
      /* v1 lessons still load when the addition file is unreadable */
    }
  }
  return { kernel, lessons };
}

export function lessonById(catalog: { lessons: KnowledgeLesson[] }, id: string): KnowledgeLesson | undefined {
  return catalog.lessons.find(lesson => lesson.id === id);
}

function textBlob(signals: SelectionSignals): string {
  return [...signals.visitorJobs, ...signals.pageRoles, ...signals.userConstraints].join(" ").toLowerCase();
}

function signalActive(tag: string, signals: SelectionSignals): boolean {
  const blob = textBlob(signals);
  switch (tag) {
    case "project-photography": return signals.projectMediaCount >= 2;
    case "sparse-media": return signals.usableMediaCount <= 1;
    case "founder-team": return signals.peopleMediaCount >= 1 || /founder|team|principal/.test(blob);
    case "unequal-services": return signals.serviceCount >= 3;
    case "dense-information": return /hours|menu|faq|spec|access|parking|price/.test(blob);
    case "tangible-product": return signals.productMediaCount >= 1 || /material|product|menu/.test(blob);
    case "location-practical": return signals.hasLocationFacts || /hours|address|menu|visit/.test(blob);
    case "comparison": return signals.hasComparisonNeed || /compare|which|choose|versus/.test(blob);
    case "case-study": return signals.longform || /case|project story|before/.test(blob);
    case "typography-led": return signals.usableMediaCount <= 1 || /editorial|type|serif/.test(blob);
    case "mobile-complex": return signals.complexLayout;
    case "purposeful-repetition": return signals.serviceCount >= 2 || signals.pageRoles.length >= 2;
    case "contact-path": return /contact|estimate|appoint|call|quote/.test(blob);
    default: return false;
  }
}

function contraindicated(lesson: KnowledgeLesson, signals: SelectionSignals): string[] {
  const hits: string[] = [];
  for (const item of lesson.contraindications) {
    const lower = item.toLowerCase();
    if (/no (project|work) (photo|image)/.test(lower) && signals.projectMediaCount === 0) hits.push(item);
    if (/sparse imagery/.test(lower) && signals.usableMediaCount <= 1 && lesson.selectWhen.includes("project-photography")) hits.push(item);
    if (/requires a team portrait/.test(lower) && signals.peopleMediaCount === 0) hits.push(item);
    if (/requires a full menu/.test(lower) && !signals.hasLocationFacts) hits.push(item);
  }
  if (lesson.selectWhen.includes("project-photography") && signals.projectMediaCount < 2) {
    hits.push("Fewer than two usable project images");
  }
  return hits;
}

export function selectLessons(opts: {
  catalog: { lessons: KnowledgeLesson[] };
  signals: SelectionSignals;
  stage: string;
  limit?: number;
}): LessonSelection[] {
  const limit = opts.limit ?? 4;
  const ranked = opts.catalog.lessons.map(lesson => {
    const contraindicationsConsidered = contraindicated(lesson, opts.signals);
    let score = 0;
    for (const tag of lesson.selectWhen) if (signalActive(tag, opts.signals)) score += 2;
    if (contraindicationsConsidered.length) score = -1;
    if (opts.stage === "narrative" && lesson.selectWhen.every(tag => tag === "typography-led" || tag === "mobile-complex")) score -= 1;
    return { lesson, score, contraindicationsConsidered };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.lesson.id.localeCompare(b.lesson.id));
  const chosen = ranked.slice(0, limit);
  return chosen.map(item => ({
    id: item.lesson.id,
    version: item.lesson.version,
    contentHash: item.lesson.contentHash,
    reason: `Matches ${item.lesson.selectWhen.filter(tag => signalActive(tag, opts.signals)).join(", ") || item.lesson.visitorGoal}`,
    contraindicationsConsidered: item.lesson.contraindications,
    mandatory: false,
    expansionHandle: `lesson:${item.lesson.id}@${item.lesson.version}`,
  }));
}

/** Usable design proof: inspected and disposition `use`. `retain` is kept on file but is not an approved placement. */
export function mediaDesignEligibility(asset: MediaInventory["assets"][number]): "use" | "retain" | "unavailable" {
  if (!asset.inspected) return "unavailable";
  if (asset.disposition === "duplicate" || asset.disposition === "exclude" || asset.disposition === "unresolved") return "unavailable";
  if (qualityLimitsProof(asset)) return "unavailable";
  if (asset.disposition === "use") return "use";
  if (asset.disposition === "retain") return "retain";
  return "unavailable";
}

function qualityLimitsProof(asset: MediaInventory["assets"][number]): boolean {
  const text = `${asset.description} ${asset.reason}`.toLowerCase();
  return /low[- ]?res|blurry|unusable|watermark|too small|not (usable )?proof|placeholder/.test(text);
}

export function signalsFromSite(root: string): SelectionSignals {
  const read = <T>(path: string): T | undefined => {
    try {
      const full = join(root, path);
      if (!existsSync(full)) return undefined;
      return json<T>(full);
    } catch {
      return undefined;
    }
  };
  const business = read<{ offer?: string; audience?: string; includes?: string[]; facts?: { claim: string }[] }>("onboarding/business.json");
  const narrative = read<{ visitorQuestions?: { question: string }[]; designOpportunities?: { visitorNeed: string }[]; toneConstraints?: string[]; assetNotes?: { limitation?: string }[] }>("onboarding/narrative-brief.json");
  const media = read<MediaInventory>("onboarding/media-inventory.json");
  const request = read<{ theme?: string }>("agent/request.json");
  const assets = media?.assets || [];
  const usable = assets.filter(asset => mediaDesignEligibility(asset) === "use");
  const retained = assets.filter(asset => mediaDesignEligibility(asset) === "retain");
  const roles = usable.map(asset => asset.role);
  const lowResolutionCount = assets.filter(asset => asset.inspected && qualityLimitsProof(asset)).length
    + (narrative?.assetNotes || []).filter(note => /low[- ]?res|blurry|unusable/i.test(note.limitation || "")).length;
  const visitorJobs = [
    ...(narrative?.visitorQuestions?.map(q => q.question) || []),
    ...(narrative?.designOpportunities?.map(o => o.visitorNeed) || []),
    business?.audience,
    business?.offer,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const userConstraints = [
    ...(narrative?.toneConstraints || []),
    ...(request?.theme?.trim() ? [`theme:${request.theme.trim()}`] : []),
  ];
  return signalsFromInventory({
    mediaRoles: roles,
    mediaCount: roles.length,
    lowResolutionCount,
    retainedMediaCount: retained.length,
    visitorJobs,
    serviceCount: business?.includes?.length ?? 0,
    userConstraints,
    longform: (business?.includes?.length || 0) > 3,
    hasLocationFacts: (business?.facts || []).some(f => /county|city|local|area/i.test(f.claim)),
  });
}

export function selectLessonsForStage(root: string, stage: string, limit?: number): LessonSelection[] {
  const catalog = loadKnowledgeCatalog(root);
  if (!catalog) return [];
  return selectLessons({ catalog, signals: signalsFromSite(root), stage, limit });
}

export function signalsFromInventory(input: {
  mediaRoles?: string[];
  mediaCount?: number;
  lowResolutionCount?: number;
  retainedMediaCount?: number;
  visitorJobs?: string[];
  pageRoles?: string[];
  userConstraints?: string[];
  serviceCount?: number;
  hasLocationFacts?: boolean;
  hasComparisonNeed?: boolean;
  longform?: boolean;
  complexLayout?: boolean;
}): SelectionSignals {
  const roles = (input.mediaRoles || []).map(role => role.toLowerCase());
  return {
    projectMediaCount: roles.filter(role => /project|work|portfolio|before|after/.test(role)).length,
    peopleMediaCount: roles.filter(role => /people|portrait|team|founder|staff/.test(role)).length,
    productMediaCount: roles.filter(role => /product|material|dish|goods/.test(role)).length,
    usableMediaCount: input.mediaCount ?? roles.length,
    lowResolutionCount: input.lowResolutionCount ?? 0,
    retainedMediaCount: input.retainedMediaCount ?? 0,
    visitorJobs: input.visitorJobs || [],
    pageRoles: input.pageRoles || [],
    userConstraints: input.userConstraints || [],
    hasLocationFacts: input.hasLocationFacts ?? false,
    hasComparisonNeed: input.hasComparisonNeed ?? false,
    serviceCount: input.serviceCount ?? 0,
    longform: input.longform ?? false,
    complexLayout: input.complexLayout ?? false,
  };
}

export function readLessonBody(kernel: string, lesson: KnowledgeLesson): string {
  const references = (lesson.references || []).map(ref => `${ref.id} [${ref.kind}] ${ref.file}: ${ref.note}`);
  const lines = [
    `# ${lesson.title}`,
    lesson.principle,
    lesson.explanation,
    `Visitor task: ${lesson.visitorGoal}`,
    `Use when: ${lesson.useWhen.join("; ")}`,
    `Avoid when: ${lesson.avoidWhen.join("; ")}`,
    `Required assets: ${(lesson.requiredAssets || []).join("; ") || "none recorded"}`,
    `Composition: ${lesson.composition}`,
    `Typography: ${lesson.typography}`,
    `Media: ${lesson.media}`,
    `Mobile: ${lesson.mobile}`,
    `Adaptation: ${lesson.adaptation}`,
    `Counterexample: ${lesson.counterexample} — ${lesson.counterexampleWhy}`,
    `Evidence kind: ${lesson.evidenceKind}`,
    references.length ? `References:\n${references.map(line => `- ${line}`).join("\n")}` : "References: none recorded",
    lesson.evidenceKind === "inspected-reference"
      ? "Authority: inspected reference. Not user preference evidence."
      : "Authority: teaching guidance. Not a customer fact and not a measured preference score.",
  ];
  const pack = loadKnowledgeV2(kernel);
  const extension = pack && pack.errors.length === 0 ? lessonExtension(pack, lesson.id) : undefined;
  if (extension) {
    lines.push(`Evidence class: ${extension.evidenceClass}`);
    lines.push(`Uncertainty: ${extension.uncertainty}`);
    if (extension.alternatives.length) {
      lines.push("Alternative successful interpretations:");
      for (const alt of extension.alternatives) lines.push(`- ${alt.id}: ${alt.summary}`);
    }
    if (extension.requirementIds.length) lines.push(`Related requirements: ${extension.requirementIds.join(", ")}`);
  }
  return lines.join("\n");
}

export function demonstrationPath(kernel: string, file: string): string | undefined {
  return confined(knowledgeDir(kernel), file);
}
