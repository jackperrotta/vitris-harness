import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { resolveKernelRoot } from "../agent/design-calibration.ts";
import { COMPOSITION_LESSON_RELEASE } from "../agent/composition-authoring.ts";
import { KNOWLEDGE_RELEASE } from "./contracts.ts";
import { loadKnowledgeV2, verifyKnowledgeV2 } from "./pack.ts";

export type CompositionLesson = {
  id: string; version: 1; release: string; title: string; summary: string; principle: string;
  scope: string[]; tasks: string[]; stages: string[];
  evidenceNeeds: { kind: "fact" | "media" | "route" | "interaction-model"; role?: string; minimum?: number; mandatory: boolean }[];
  applicability: { positiveSignals: string[]; exclusions: string[]; uncertainty: string };
  relationshipGroup: string; relationships: string[]; bodyPath: string;
  sourceIds: string[]; requirementIds: string[]; demonstrationIds: string[]; reviewProbeIds: string[]; contentHash: string;
};
export type CompositionExample = {
  id: string; lessonId: string; role: "application-a" | "application-b" | "counterexample";
  scenario: string; provenance: string; fixturePath: string | null; captureHandles: string[];
  inspectionStatus: "pending" | "inspected"; sourceHash: string;
};
export type CompositionPack = {
  kernel: string; release: string; manifestHash: string;
  lessons: CompositionLesson[]; examples: CompositionExample[];
  sources: { id: string }[];
  body: (id: string) => string;
};

const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const hex = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const unique = (values: string[]) => new Set(values).size === values.length;
function confined(dir: string, path: string): string {
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) throw new Error(`Unconfined composition pack path: ${path}`);
  const target = resolve(dir, path);
  if (relative(dir, target).startsWith("..")) throw new Error(`Unconfined composition pack path: ${path}`);
  for (let cursor = target; cursor !== dir; cursor = dirname(cursor)) if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink in composition pack path: ${path}`);
  return target;
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}
function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) throw new Error(`Invalid ${label}`);
  return value;
}
function parsed(bytes: Buffer, label: string): Record<string, unknown> {
  try { return object(JSON.parse(new TextDecoder().decode(bytes)), label); }
  catch { throw new Error(`Invalid composition pack JSON: ${label}`); }
}

/** Loads only files named and verified by the pinned manifest. Any integrity error is fatal. */
export function loadCompositionPack(siteOrKernel: string, requestedRelease = COMPOSITION_LESSON_RELEASE): CompositionPack {
  if (requestedRelease !== COMPOSITION_LESSON_RELEASE) throw new Error(`Unknown composition lesson release ${requestedRelease}`);
  const kernel = resolveKernelRoot(siteOrKernel);
  if (!kernel) throw new Error("Installed harness root is unavailable for composition lessons");
  const dir = join(kernel, "design-system/knowledge/v3");
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Missing composition lesson release ${requestedRelease}`);
  const manifestBytes = readFileSync(manifestPath);
  const manifest = parsed(manifestBytes, "manifest");
  if (manifest.schemaVersion !== 1 || manifest.lessonRelease !== requestedRelease || manifest.standardsRelease !== KNOWLEDGE_RELEASE || manifest.labeledPreferenceData !== false) throw new Error("Composition manifest version or dependency mismatch");
  const v2Errors = verifyKnowledgeV2(kernel);
  if (v2Errors.length) throw new Error(`Composition standards dependency invalid: ${v2Errors.join("; ")}`);
  const requirements = new Set(loadKnowledgeV2(kernel)?.requirements.map(item => item.id) || []);
  if (!Array.isArray(manifest.files)) throw new Error("Composition manifest has no files");
  const bytes = new Map<string, Buffer>();
  for (const entry of manifest.files) {
    const file = object(entry, "manifest file");
    if (typeof file.path !== "string" || !hex(file.sha256)) throw new Error("Invalid composition manifest file entry");
    if (bytes.has(file.path)) throw new Error(`Duplicate composition file ${file.path}`);
    const target = confined(dir, file.path);
    if (!existsSync(target)) throw new Error(`Missing composition file ${file.path}`);
    const content = readFileSync(target);
    if (sha(content) !== file.sha256) throw new Error(`Composition hash mismatch: ${file.path}`);
    bytes.set(file.path, content);
  }
  const read = (path: string) => {
    const content = bytes.get(path);
    if (!content) throw new Error(`Composition file not in verified manifest: ${path}`);
    return content;
  };
  const catalog = parsed(read("catalog.json"), "catalog");
  const examplesFile = parsed(read("examples/catalog.json"), "examples catalog");
  const sourcesFile = parsed(read("sources.json"), "sources");
  if (catalog.schemaVersion !== 1 || catalog.lessonRelease !== requestedRelease || examplesFile.schemaVersion !== 1 || examplesFile.lessonRelease !== requestedRelease) throw new Error("Composition catalog release mismatch");
  if (!Array.isArray(catalog.lessons) || catalog.lessons.length !== 24 || !Array.isArray(examplesFile.examples) || !Array.isArray(sourcesFile.sources)) throw new Error("Composition catalog count or shape mismatch");
  const sources = sourcesFile.sources as { id: string }[];
  const sourceIds = new Set(sources.map(item => item.id));
  if (!unique([...sourceIds]) || sourceIds.size !== sources.length) throw new Error("Duplicate composition source ID");
  const lessons = catalog.lessons as CompositionLesson[];
  if (!unique(lessons.map(item => item.id))) throw new Error("Duplicate composition lesson ID");
  const examples = examplesFile.examples as CompositionExample[];
  if (!unique(examples.map(item => item.id))) throw new Error("Duplicate composition example ID");
  const exampleMap = new Map(examples.map(item => [item.id, item]));
  const usedExamples = new Set<string>();
  for (const lesson of lessons) {
    if (!/^cmp-[a-z0-9-]+$/.test(lesson.id) || lesson.version !== 1 || lesson.release !== requestedRelease || !lesson.title?.trim() || !lesson.summary?.trim() || !lesson.principle?.trim() || !lesson.relationshipGroup?.trim()) throw new Error(`Invalid composition lesson ${lesson.id}`);
    for (const key of ["scope","tasks","stages","relationships","sourceIds","requirementIds","demonstrationIds","reviewProbeIds"] as const) strings(lesson[key], `${lesson.id}.${key}`);
    if (!lesson.scope.every(item => ["element","section","page","site"].includes(item))) throw new Error(`Invalid scope for ${lesson.id}`);
    const applicability = object(lesson.applicability, `${lesson.id}.applicability`);
    strings(applicability.positiveSignals, `${lesson.id}.positiveSignals`);
    strings(applicability.exclusions, `${lesson.id}.exclusions`);
    if (typeof applicability.uncertainty !== "string" || !applicability.uncertainty.trim()) throw new Error(`Missing uncertainty for ${lesson.id}`);
    if (!Array.isArray(lesson.evidenceNeeds)) throw new Error(`Invalid evidence needs for ${lesson.id}`);
    for (const need of lesson.evidenceNeeds) if (!["fact","media","route","interaction-model"].includes(need.kind) || typeof need.mandatory !== "boolean" || need.minimum !== undefined && (!Number.isInteger(need.minimum) || need.minimum < 0)) throw new Error(`Invalid evidence need for ${lesson.id}`);
    if (!hex(lesson.contentHash) || sha(read(lesson.bodyPath)) !== lesson.contentHash) throw new Error(`Body hash mismatch for ${lesson.id}`);
    for (const id of lesson.sourceIds) if (!sourceIds.has(id)) throw new Error(`Missing source ${id} for ${lesson.id}`);
    for (const id of lesson.requirementIds) if (!requirements.has(id)) throw new Error(`Missing v2 requirement ${id} for ${lesson.id}`);
    if (lesson.demonstrationIds.length !== 3) throw new Error(`Lesson ${lesson.id} needs three contrasting scenario records`);
    const roles = lesson.demonstrationIds.map(id => {
      const example = exampleMap.get(id);
      usedExamples.add(id);
      if (!example || example.lessonId !== lesson.id || !hex(example.sourceHash) || sha(example.scenario) !== example.sourceHash) throw new Error(`Invalid example ${id} for ${lesson.id}`);
      if (example.fixturePath) read(example.fixturePath);
      if (example.inspectionStatus === "inspected" && (!example.fixturePath || !example.captureHandles.length)) throw new Error(`Example ${id} claims inspection without captured source`);
      return example.role;
    });
    if (!unique(roles) || !roles.includes("application-a") || !roles.includes("application-b") || !roles.includes("counterexample")) throw new Error(`Inconsistent example roles for ${lesson.id}`);
  }
  if (usedExamples.size !== examples.length) throw new Error("Orphan composition example record");
  return { kernel, release: requestedRelease, manifestHash: sha(manifestBytes), lessons, examples, sources, body: id => new TextDecoder().decode(read(lessons.find(item => item.id === id)?.bodyPath || "")) };
}
