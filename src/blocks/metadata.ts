import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export interface BlockMeta {
  schemaVersion: 1;
  id: string;
  revision: number;
  status: "draft" | "inspected" | "pilot" | "stable" | "deprecated";
  owner: string;
  sourceHash: string;
  fit: { visitorJobs: string[]; pageRoles: string[]; useWhen: string[]; avoidWhen: string[] };
  content: { requiredSlots: string[]; optionalSlots: string[]; testedItemCounts: number[] };
  media: { min: number; max: number; optionalBehavior: string; aspect: string[] };
  composition: { hierarchy: string; alignment: string; density: string; mediaProminence: string; geometry: string[]; boundary: string };
  adaptation: { flexible: string[]; invariants: string[]; customWhen: string[] };
  responsive: { readingOrder: string; reflow: string; crop: string };
  interaction: { behavior: string; islands: string[] };
  evidence: { provenance: string[]; testedContexts: string[]; accessibility: string[]; previewManifest?: string };
}

const hash = (parts: string[]) => createHash("sha256").update(parts.join("\n---vitris-block-source---\n")).digest("hex");
export function blockSourceHash(dir: string): string {
  return hash(["README.md", "template.html", "styles.css", "island.js"].map(name =>
    existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : ""));
}

export function blockPreviewRendererHash(root: string): string {
  return hash(["scripts/blocks-preview.ts", "src/compile/flatten.ts", "src/compile/site.ts", "src/compile/primitives.ts", "src/theme.ts", "src/types.ts"]
    .map(name => readFileSync(join(root, name), "utf8")));
}

export function readBlockMeta(dir: string, id: string, slots: { name: string; required: boolean }[]): BlockMeta | undefined {
  const file = join(dir, "block.meta.json");
  if (!existsSync(file)) return undefined;
  let m: any;
  try { m = JSON.parse(readFileSync(file, "utf8")); }
  catch (e) { throw new Error(`${id} metadata is not valid JSON: ${String(e)}`); }
  const errors: string[] = [];
  const obj = (value: any) => value && typeof value === "object" && !Array.isArray(value);
  const str = (value: any) => typeof value === "string" && value.trim().length > 0;
  const strings = (value: any) => Array.isArray(value) && value.every(str);
  if (m?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (m?.id !== id) errors.push(`id must be ${id}`);
  if (!Number.isInteger(m?.revision) || m.revision < 1) errors.push("revision must be a positive integer");
  if (!["draft", "inspected", "pilot", "stable", "deprecated"].includes(m?.status)) errors.push("invalid status");
  if (!str(m?.owner)) errors.push("owner is required");
  if (m?.sourceHash !== blockSourceHash(dir)) errors.push("sourceHash is stale");
  for (const [group, fields] of Object.entries({
    fit: ["visitorJobs", "pageRoles", "useWhen", "avoidWhen"],
    content: ["requiredSlots", "optionalSlots"],
    composition: ["geometry"],
    adaptation: ["flexible", "invariants", "customWhen"],
    interaction: ["islands"],
    evidence: ["provenance", "testedContexts", "accessibility"],
  })) {
    if (!obj(m?.[group])) { errors.push(`${group} is required`); continue; }
    for (const field of fields) if (!strings(m[group][field])) errors.push(`${group}.${field} must be a string array`);
  }
  if (!obj(m?.media) || !Number.isInteger(m.media.min) || !Number.isInteger(m.media.max) || m.media.min < 0 || m.media.max < m.media.min || !str(m.media.optionalBehavior) || !strings(m.media.aspect)) errors.push("invalid media contract");
  if (!Array.isArray(m?.content?.testedItemCounts) || !m.content.testedItemCounts.every((n: any) => Number.isInteger(n) && n >= 0)) errors.push("invalid testedItemCounts");
  for (const field of ["hierarchy", "alignment", "density", "mediaProminence", "boundary"]) if (!str(m?.composition?.[field])) errors.push(`composition.${field} is required`);
  for (const field of ["readingOrder", "reflow", "crop"]) if (!str(m?.responsive?.[field])) errors.push(`responsive.${field} is required`);
  if (!str(m?.interaction?.behavior)) errors.push("interaction.behavior is required");
  if (m?.evidence?.previewManifest !== undefined) {
    const manifest = m.evidence.previewManifest;
    const target = str(manifest) ? resolve(dir, manifest) : "";
    const rel = target ? relative(resolve(dir, "../../.."), target) : "";
    const withinLibrary = target && !rel.startsWith("..") && !isAbsolute(rel);
    if (!withinLibrary) errors.push("evidence.previewManifest must name a file in the kernel");
    else if (!existsSync(target) && m.status !== "draft") errors.push("previewManifest is missing");
  }
  if (errors.length) throw new Error(`${id} metadata: ${errors.join("; ")}`);
  const expectedRequired = slots.filter(s => s.required).map(s => s.name).sort();
  const expectedOptional = slots.filter(s => !s.required).map(s => s.name).sort();
  if (JSON.stringify([...m.content.requiredSlots].sort()) !== JSON.stringify(expectedRequired) || JSON.stringify([...m.content.optionalSlots].sort()) !== JSON.stringify(expectedOptional)) {
    throw new Error(`${id} metadata slots disagree with template/README`);
  }
  return m as BlockMeta;
}

export function blockPreviewEvidence(dir: string, meta?: BlockMeta): { status: "current" | "stale" | "unavailable"; mobile?: string; desktop?: string; hashes?: Record<string, string> } {
  if (!meta?.evidence.previewManifest) return { status: "unavailable" };
  const file = join(dir, meta.evidence.previewManifest);
  if (!existsSync(file)) return { status: "unavailable" };
  try {
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    const images = manifest.images;
    const valid = manifest.blockId === meta.id && manifest.blockRevision === meta.revision && manifest.sourceHash === blockSourceHash(dir)
      && manifest.rendererHash === blockPreviewRendererHash(join(dir, "../../.."))
      && ["mobile", "desktop"].every(kind => {
        const image = images?.[kind];
        const path = image?.file && join(dirname(file), image.file);
        return path && existsSync(path) && createHash("sha256").update(readFileSync(path)).digest("hex") === image.hash;
      });
    return { status: valid ? "current" : "stale",
      mobile: images?.mobile?.file && join(dirname(file), images.mobile.file),
      desktop: images?.desktop?.file && join(dirname(file), images.desktop.file),
      hashes: { mobile: images?.mobile?.hash, desktop: images?.desktop?.hash } };
  } catch { return { status: "stale" }; }
}
