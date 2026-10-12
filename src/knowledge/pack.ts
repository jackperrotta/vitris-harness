import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { resolveKernelRoot } from "../agent/design-calibration.ts";
import type {
  AssetProvenance,
  KnowledgeRequirement,
  KnowledgeSource,
  LessonExtension,
  ReplacementRecord,
} from "./contracts.ts";
import { KNOWLEDGE_RELEASE } from "./contracts.ts";

export type KnowledgePack = {
  kernel: string;
  release: string;
  sources: KnowledgeSource[];
  requirements: KnowledgeRequirement[];
  extensions: LessonExtension[];
  replacements: ReplacementRecord[];
  assets: AssetProvenance[];
  errors: string[];
};

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function confined(dir: string, file: string): string | undefined {
  if (!file || file.includes("..") || file.startsWith("/") || /^[A-Za-z]:/.test(file)) return undefined;
  const target = resolve(dir, file);
  const rel = relative(dir, target);
  if (rel.startsWith("..")) return undefined;
  return target;
}

export function knowledgeV2Dir(kernel: string): string {
  return join(resolve(kernel), "design-system", "knowledge", "v2");
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function verifyKnowledgeV2(kernel: string): string[] {
  const dir = knowledgeV2Dir(kernel);
  const errors: string[] = [];
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return ["Missing design-system/knowledge/v2 pack"];
  const manifest = readJson<{
    schemaVersion: number;
    knowledgeRelease: string;
    labeledPreferenceData: boolean;
    files: { path: string; sha256: string }[];
  }>(manifestPath);
  if (!manifest || manifest.schemaVersion !== 1) errors.push("v2 manifest schema mismatch");
  if (manifest && manifest.knowledgeRelease !== KNOWLEDGE_RELEASE) errors.push("v2 release mismatch");
  if (manifest && manifest.labeledPreferenceData !== false) errors.push("v2 pack must not claim labeled preference data");
  for (const file of manifest?.files || []) {
    const target = confined(dir, file.path);
    if (!target || !existsSync(target)) errors.push(`Missing or unconfined v2 file: ${file.path}`);
    else if (sha256(readFileSync(target)) !== file.sha256) errors.push(`v2 hash mismatch: ${file.path}`);
  }
  return errors;
}

export function loadKnowledgeV2(siteOrKernel: string): KnowledgePack | undefined {
  const kernel = resolveKernelRoot(siteOrKernel);
  if (!kernel) return undefined;
  const dir = knowledgeV2Dir(kernel);
  const errors = verifyKnowledgeV2(kernel);
  const siteConfig = readJson<{ knowledgeRelease?: string }>(join(resolve(siteOrKernel), "site.json"));
  if (siteConfig?.knowledgeRelease && siteConfig.knowledgeRelease !== KNOWLEDGE_RELEASE) {
    errors.push(`Site pins knowledge release ${siteConfig.knowledgeRelease}; installed kernel provides ${KNOWLEDGE_RELEASE}. Review and upgrade explicitly.`);
  }
  const sources = readJson<KnowledgeSource[]>(join(dir, "sources.json")) || [];
  const requirements = readJson<KnowledgeRequirement[]>(join(dir, "requirements.json")) || [];
  const extensions = readJson<LessonExtension[]>(join(dir, "lesson-extensions.json")) || [];
  const replacements = readJson<ReplacementRecord[]>(join(dir, "replacements.json")) || [];
  const assets = readJson<AssetProvenance[]>(join(dir, "assets.json")) || [];
  for (const source of sources) {
    if (sha256(source.summary) !== source.summarySha256) errors.push(`Source summary hash mismatch: ${source.id}`);
    if (source.reviewStatus === "live-checked" && !source.lastReviewed) errors.push(`Live-checked source missing review date: ${source.id}`);
  }
  return { kernel, release: KNOWLEDGE_RELEASE, sources, requirements, extensions, replacements, assets, errors };
}

export function lessonExtension(pack: KnowledgePack | undefined, id: string): LessonExtension | undefined {
  return pack?.extensions.find(item => item.id === id);
}

export function sourceFreshness(source: KnowledgeSource, now: Date, intervalDays: number): "current" | "due-for-maintenance" | "not-reviewed" {
  if (!source.lastReviewed) return "not-reviewed";
  const reviewed = Date.parse(source.lastReviewed);
  if (!Number.isFinite(reviewed)) return "not-reviewed";
  const due = reviewed + intervalDays * 24 * 60 * 60 * 1000;
  return now.getTime() > due ? "due-for-maintenance" : "current";
}

export function coverageReport(pack: KnowledgePack): {
  release: string;
  requirements: { id: string; authorityClass: string; implementationStatus: string; verifierId: string | null }[];
  missingClassification: string[];
} {
  const missingClassification = pack.requirements
    .filter(item => !item.authorityClass || !item.implementationStatus || item.authorityIds.length === 0)
    .map(item => item.id);
  return {
    release: pack.release,
    requirements: pack.requirements.map(item => ({
      id: item.id,
      authorityClass: item.authorityClass,
      implementationStatus: item.implementationStatus,
      verifierId: item.verifierId,
    })),
    missingClassification,
  };
}

/** v1 lesson ids stay valid. v2 records the version they map to. */
export function migrateLessonId(pack: KnowledgePack, id: string, version: number): { id: string; version: number; migrated: boolean } {
  const record = pack.replacements.find(item => item.id === id && item.fromVersion === version);
  if (!record) return { id, version, migrated: false };
  return { id: record.id, version: record.toVersion, migrated: record.toVersion !== version };
}
