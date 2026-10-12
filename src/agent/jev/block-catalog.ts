import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findHarnessRoot } from "../../cli/root.ts";
import { readBlockMeta, blockPreviewEvidence, type BlockMeta } from "../../blocks/metadata.ts";

export type FitLabel = "good-start" | "needs-adaptation" | "no-fit";

export interface BlockSlot {
  name: string;
  required: boolean;
  description: string;
}

export interface BlockRecord {
  id: string;
  category: string;
  name: string;
  look: string;
  media: string;
  mediaRequired: boolean;
  registers: string[];
  variants: string[];
  slots: BlockSlot[];
  interaction: "static" | "island";
  mobile: { hasMediaQuery: boolean; notes: string };
  geometry: string[];
  example: string;
  examplePath: string;
  previewPath?: string;
  previewHash?: string;
  seesImages: false;
  dir: string;
  meta?: BlockMeta;
  metadataSource?: "block.meta.json" | "legacy-readme";
  previewEvidence?: ReturnType<typeof blockPreviewEvidence>;
}

export interface BlockLibrary {
  generatedFrom: "readme+index+template";
  blocks: BlockRecord[];
}

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function kernelBlocksRoot(kernel = findHarnessRoot()): string {
  return join(kernel, "blocks");
}

function parseSlots(readme: string, template: string): BlockSlot[] {
  const table = readme.match(/## Slots\s*\n([\s\S]*?)\n\n## /)?.[1] ?? "";
  const documented = new Map<string, string>();
  for (const row of table.matchAll(/^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*$/gm)) {
    documented.set(row[1] === "(default)" ? "default" : row[1]!, row[2]!);
  }
  const names = [...template.matchAll(/<slot(?:\s+name="([^"]+)")?[^>]*>/g)].map(m => m[1] || "default");
  const unique = [...new Set(names)];
  return unique.map(name => {
    const desc = documented.get(name) || "";
    const required = !/optional/i.test(desc);
    return { name, required, description: desc };
  });
}

function geometryFrom(html: string, css: string): string[] {
  const g: string[] = [];
  if (/\bsplit\b/.test(html) || /\bsplit\b/.test(css)) g.push("split");
  if (/\bgrid\b/.test(html)) g.push("grid");
  if (/ratio-/.test(html) || /aspect-ratio/.test(css)) g.push("media-frame");
  if (/section--roomy/.test(html)) g.push("roomy");
  if (/sticky/.test(html) || /position:\s*sticky/.test(css)) g.push("sticky");
  return g;
}

export function loadBlockLibrary(kernel?: string): BlockLibrary {
  const blocksRoot = kernel ? join(kernel, "blocks") : kernelBlocksRoot();
  const blocks: BlockRecord[] = [];
  if (!existsSync(blocksRoot)) return { generatedFrom: "readme+index+template", blocks };
  for (const cat of readdirSync(blocksRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) {
    for (const name of readdirSync(join(blocksRoot, cat), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) {
      const dir = join(blocksRoot, cat, name);
      const readmePath = join(dir, "README.md");
      const templatePath = join(dir, "template.html");
      if (!existsSync(readmePath) || !existsSync(templatePath)) continue;
      const readme = readFileSync(readmePath, "utf8");
      const template = readFileSync(templatePath, "utf8");
      const css = existsSync(join(dir, "styles.css")) ? readFileSync(join(dir, "styles.css"), "utf8") : "";
      const look = readme.split("\n").map(l => l.trim()).find(l => l && !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("```")) || "";
      const media = (readme.match(/\*\*Media:\*\*\s*(.+)/) || [])[1] || "";
      const registers = ((readme.match(/\*\*Registers:\*\*\s*(.+)/) || [])[1] || "").split(",").map(s => s.trim()).filter(Boolean);
      const variantLine = (readme.match(/\*\*Variants:\*\*\s*(.+)/) || [])[1] || "";
      const variants = !variantLine || variantLine.startsWith("(none)") ? [] : variantLine.split(",").map(s => s.trim()).filter(Boolean);
      const example = (readme.match(/## Example\s*```html\s*([\s\S]*?)```/) || [])[1]?.trim() || "";
      const slots = parseSlots(readme, template);
      const meta = readBlockMeta(dir, `${cat}/${name}`, slots);
      const previewPath = `dist/blocks/${cat}/${name}.html`;
      blocks.push({
        id: `${cat}/${name}`,
        category: cat,
        name,
        look,
        media,
        mediaRequired: meta ? meta.media.min > 0 : /required|one |photo|portrait|cover|map/i.test(media) && !/optional|none/i.test(media),
        registers,
        variants,
        slots,
        interaction: meta ? (meta.interaction.islands.length ? "island" : "static") : existsSync(join(dir, "island.js")) ? "island" : "static",
        mobile: { hasMediaQuery: /@media/.test(css), notes: /@media/.test(css) ? "has-breakpoint" : "no-breakpoint" },
        geometry: meta?.composition.geometry ?? geometryFrom(template, css),
        example,
        examplePath: `${cat}/${name}/README.md#example`,
        previewPath,
        previewHash: example ? sha(example + "\n" + readme + "\n" + template + "\n" + css) : sha(readme + "\n" + template + "\n" + css),
        seesImages: false,
        dir,
        meta,
        metadataSource: meta ? "block.meta.json" : "legacy-readme",
        previewEvidence: blockPreviewEvidence(dir, meta),
      });
    }
  }
  return { generatedFrom: "readme+index+template", blocks };
}

export function validateBlockLibrary(lib: BlockLibrary, kernel?: string): string[] {
  const failures: string[] = [];
  const blocksRoot = kernel ? join(kernel, "blocks") : kernelBlocksRoot();
  const indexPath = join(blocksRoot, "INDEX.md");
  const index = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
  for (const b of lib.blocks) {
    if (!index.includes(`${b.category}/${b.name}`)) failures.push(`${b.id} missing from INDEX.md`);
    if (!b.example) failures.push(`${b.id} missing README example`);
    if (!b.slots.length) failures.push(`${b.id} has no slots`);
    const exampleTag = new RegExp(`<${b.name}[\\s>]`);
    if (b.example && !exampleTag.test(b.example)) failures.push(`${b.id} example does not start with <${b.name}>`);
    for (const [name, desc] of b.slots.map(s => [s.name, s.description] as const)) {
      if (name === "default" || /^optional/i.test(desc)) continue;
      if (!b.example.includes(`slot="${name}"`)) failures.push(`${b.id} example missing required slot ${name}`);
    }
  }
  return failures;
}

export interface StoryboardSectionCase {
  id: string;
  siteType: string;
  role: string;
  visitorJob: string;
  mediaCount: number;
  mediaAspect?: string;
  interaction?: string;
  textLength: number;
  expectedFit: Record<string, FitLabel>;
  missingJob?: string;
}

export const BLOCK_COVERAGE_CASES: StoryboardSectionCase[] = [
  { id: "trade-hero", siteType: "trade", role: "hero", visitorJob: "see the offer and call", mediaCount: 1, mediaAspect: "4x3", textLength: 80, expectedFit: { "hero/hero-split": "good-start", "hero/hero-editorial": "needs-adaptation" } },
  { id: "trade-proof", siteType: "trade", role: "proof", visitorJob: "trust licenses", mediaCount: 0, textLength: 40, expectedFit: { "about/about-credentials": "good-start" } },
  { id: "food-menu", siteType: "food", role: "menu", visitorJob: "scan dishes", mediaCount: 6, textLength: 30, expectedFit: { "pricing/menu-sections": "good-start", "pricing/menu-featured": "needs-adaptation" } },
  { id: "b2b-pricing", siteType: "b2b", role: "pricing", visitorJob: "compare plans", mediaCount: 0, textLength: 120, expectedFit: { "pricing/pricing-table": "good-start" } },
  { id: "beauty-gallery", siteType: "beauty", role: "gallery", visitorJob: "see work", mediaCount: 8, mediaAspect: "1x1", textLength: 20, expectedFit: { "gallery/gallery-grid": "good-start" } },
  { id: "pro-faq", siteType: "professional", role: "faq", visitorJob: "answer objections", mediaCount: 0, interaction: "accordion", textLength: 200, expectedFit: { "faq/faq-accordion": "good-start" } },
  { id: "custom-configurator", siteType: "b2b", role: "interactive-tool", visitorJob: "configure a package", mediaCount: 0, interaction: "island", textLength: 60, expectedFit: {}, missingJob: "interactive-configurator" },
];

export function auditBlockCoverage(lib: BlockLibrary, cases = BLOCK_COVERAGE_CASES): {
  gaps: Array<{ caseId: string; missingJob?: string; noFit: boolean }>;
  labeled: Array<{ caseId: string; blockId: string; fit: FitLabel }>;
} {
  const ids = new Set(lib.blocks.map(b => b.id));
  const labeled: Array<{ caseId: string; blockId: string; fit: FitLabel }> = [];
  const gaps: Array<{ caseId: string; missingJob?: string; noFit: boolean }> = [];
  for (const c of cases) {
    const present = Object.entries(c.expectedFit).filter(([id]) => ids.has(id));
    for (const [blockId, fit] of present) labeled.push({ caseId: c.id, blockId, fit });
    const noFit = present.length === 0 || present.every(([, fit]) => fit === "no-fit");
    if (c.missingJob || noFit) gaps.push({ caseId: c.id, missingJob: c.missingJob, noFit });
  }
  return { gaps, labeled };
}

export interface SectionState {
  sectionId: string;
  pagePath: string;
  visitorJob: string;
  requiredActions: string[];
  textLength: number;
  textContentIdentity?: string;
  mediaCount: number;
  mediaAspect?: string;
  mediaIds?: string[];
  mediaDescriptors?: string[];
  emphasis?: string;
  pageRole?: string;
  pageVisitorOutcome?: string;
  sectionRole?: string;
  sectionPurpose?: string;
  decisionIds?: string[];
  constraints?: string[];
  contentShape?: string;
  interaction?: string;
  adjacentRoles?: string[];
  adjacentSectionIds?: string[];
  neighborPurposes?: string[];
  repetitionRationale?: string;
  layoutFamily?: string;
  sourceIds?: string[];
  sourceHashes?: string[];
}

export function libraryContentHash(lib: BlockLibrary): string {
  return sha(lib.blocks.map(b => JSON.stringify({
    id: b.id,
    look: b.look,
    media: b.media,
    slots: b.slots,
    interaction: b.interaction,
    geometry: b.geometry,
    example: b.example,
    registers: b.registers,
    variants: b.variants,
    mobile: b.mobile,
    previewHash: b.previewHash,
    meta: b.meta,
    previewEvidence: { status: b.previewEvidence?.status, hashes: b.previewEvidence?.hashes },
  })).join("\n"));
}

export function hardFilterBlocks(lib: BlockLibrary, state: SectionState): BlockRecord[] {
  // Legacy README media wording is too ambiguous to prove impossibility.
  // Keep those records eligible and let ranking/visual review decide fit.
  return lib.blocks.filter(b => !b.meta || state.mediaCount >= b.meta.media.min);
}

export function lexicalShortlist(lib: BlockLibrary, state: SectionState, limit = 8): BlockRecord[] {
  const role = (state.sectionRole || state.pageRole || state.sectionId || "").toLowerCase();
  const aliases: Record<string, string[]> = {
    header: ["navbar"], navbar: ["navbar"], proof: ["testimonial", "trust-strip", "about", "stats"],
    testimonial: ["testimonial", "trust-strip"], service: ["services"], services: ["services"],
    project: ["work", "gallery"], work: ["work", "gallery"],
  };
  const matchingCategories = new Set([role, ...(aliases[role] || [])]);
  const terms = `${state.visitorJob} ${state.sectionPurpose || ""}`.toLowerCase().match(/[a-z]{4,}/g) || [];
  const synonym: Record<string, string> = { licenses: "credential", licensed: "credential", qualifications: "credential", trust: "proof", compare: "comparison" };
  const jobTerms = [...new Set(terms.flatMap(term => [term, synonym[term]].filter((value): value is string => !!value)))];
  const scored = lib.blocks.map(b => {
    let score = 0;
    if (matchingCategories.has(b.category) || b.id.includes(role) || b.name.includes(role)) score += 5;
    const searchable = `${b.look} ${b.meta?.fit.visitorJobs.join(" ") || ""} ${b.meta?.fit.pageRoles.join(" ") || ""}`.toLowerCase();
    score += Math.min(4, jobTerms.filter(term => searchable.includes(term)).length * 2);
    if (state.mediaCount === 0 && (b.meta?.media.min === 0 || /none|optional/i.test(b.media))) score += 2;
    if (state.mediaCount > 0 && b.mediaRequired) score += 2;
    if (state.interaction === "island" && b.interaction === "island") score += 2;
    if (state.interaction === "accordion" && /faq|accordion/.test(b.id)) score += 3;
    if (state.emphasis && b.look.toLowerCase().includes(state.emphasis.toLowerCase())) score += 1;
    return { b, score };
  }).filter(s => s.score > 0).sort((a, c) => c.score - a.score || a.b.id.localeCompare(c.b.id));
  const selected: BlockRecord[] = [];
  // The caller reserves the final candidate slot for a site-owned custom composition.
  while (selected.length < Math.max(0, limit - 1) && scored.length) {
    const bestScore = scored[0]!.score;
    const tied = scored.filter(s => s.score === bestScore);
    const seen = new Set(selected.flatMap(b => b.geometry));
    tied.sort((a, b) => {
      const novelty = (item: typeof a) => item.b.geometry.filter(tag => !seen.has(tag)).length;
      return novelty(b) - novelty(a) || a.b.id.localeCompare(b.b.id);
    });
    const choice = tied[0]!;
    selected.push(choice.b);
    scored.splice(scored.indexOf(choice), 1);
  }
  return selected;
}
