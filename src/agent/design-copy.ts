import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { files, fingerprint, json, save, within } from "./artifacts.ts";
import { finish, loadState } from "./runner.ts";
import { parseGraphYaml, type SkillGraph } from "./graph.ts";
import { applyArtDirectionGraph } from "./art-direction-policy.ts";
import { gradeHarvest, gradeNode } from "./grade.ts";
import { applyDesignContractMigration, assessDesignContractMigration, importStageBlockedByMigration } from "./design-contracts.ts";
import { sourceManifest } from "./source-manifest.ts";
import { AGENT_RUNTIME_HISTORY_ENTRIES } from "./kit-runtime.ts";

export const KERNEL_CONTRACT_PATHS = ["agent", "scripts", "src", "templates", "blocks", "design-system", "package.json", "package-lock.json"];
export const SHARED_EVIDENCE_PATHS = [
  'onboarding/additional-content.md',
  'agent/template-input.json',
  "onboarding/theme-brand.json", "agent/theme-selection.json",
  "onboarding/brief.json",
  "onboarding/copy",
  "onboarding/raw",
  "onboarding/stills",
  "onboarding/business.json",
  "onboarding/media-inventory.json",
  "onboarding/narrative-brief.json",
  "onboarding/reference-analysis.json",
  "media/harvest",
  "media/recovered",
  "media/stock",
  "media/generated",
  "media/derived",
  "artwork",
  "onboarding/visual-asset-brief.json",
  "onboarding/asset-production.json",
  "onboarding/asset-operations",
  "agent/reviews/business-review.json",
  "agent/reviews/narrative-review.json",
  "agent/request-history",
  "agent/request.json",
  "launch.json",
];
export const CHILD_IMPORT_NODES = ["harvest", "business", "business-review", "media", "narrative", "narrative-review", "reference-analysis"] as const;
const SKIP_AGENT_COPY = /^(runs|run-history|reviews|screenshots|design-runs)([\\/]|$)/;
const SKIP_AGENT_FILES = new Set(["CURRENT.md", "RUN.lock", "PREPARED.json", "STATE.json", "preview-server.json"]);

export function kernelContractHash(kernel: string): string {
  return sourceManifest(resolve(kernel)).hash;
}

export function copyTree(from: string, to: string): void {
  const src = resolve(from);
  if (!existsSync(src)) return;
  if (lstatSync(src).isSymbolicLink()) throw new Error(`Symlink not allowed: ${from}`);
  if (lstatSync(src).isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(src).sort()) copyTree(join(src, name), join(to, name));
    return;
  }
  if (src === resolve(to)) return;
  mkdirSync(dirname(to), { recursive: true });
  cpSync(src, to);
}

export function copyAllowlist(from: string, to: string, paths: string[]): string[] {
  const copied: string[] = [];
  for (const rel of paths) {
    const src = within(from, rel);
    if (!existsSync(src)) continue;
    files(src);
    copyTree(src, within(to, rel));
    copied.push(rel.replaceAll("\\", "/"));
  }
  return copied;
}

export function freezeSharedEvidence(parent: string, sharedDir: string): { copied: string[]; hash: string } {
  mkdirSync(sharedDir, { recursive: true });
  const copied = copyAllowlist(parent, sharedDir, SHARED_EVIDENCE_PATHS);
  const hash = fingerprint(sharedDir, copied.length ? copied : SHARED_EVIDENCE_PATHS);
  save(join(sharedDir, "receipts.json"), { copied, hash, frozenAt: new Date().toISOString() });
  return { copied, hash };
}

export function sharedEvidenceReceiptStatus(sharedDir: string): { ok: boolean; hash: string; currentHash: string; copied: string[]; failures: string[] } {
  const receiptsPath = join(sharedDir, "receipts.json");
  if (!existsSync(receiptsPath)) {
    return { ok: false, hash: "", currentHash: "", copied: [], failures: ["Missing shared evidence receipts"] };
  }
  const receipts = json<{ copied?: string[]; hash?: string }>(receiptsPath);
  const copied = receipts.copied?.length ? receipts.copied : SHARED_EVIDENCE_PATHS;
  const currentHash = fingerprint(sharedDir, copied);
  const failures: string[] = [];
  if (!receipts.hash) failures.push("Shared receipts missing hash");
  else if (receipts.hash !== currentHash) failures.push("Shared receipt hash does not match current shared content");
  return { ok: failures.length === 0, hash: receipts.hash || "", currentHash, copied, failures };
}

export function scaffoldNestedSite(opts: {
  dest: string;
  kernel: string;
  slug: string;
  name: string;
  parent: string;
}): void {
  const dest = resolve(opts.dest);
  if (existsSync(join(dest, "package.json"))) throw new Error(`Refusing to overwrite existing site: ${dest}`);
  mkdirSync(dest, { recursive: true });
  copyTree(join(opts.kernel, "templates", "site"), dest);
  // npm packages ship the ignore template under a plain filename.
  renameSync(join(dest, "gitignore"), join(dest, ".gitignore"));
  for (const file of files(join(opts.kernel, "agent"))) {
    const rel = file.slice(join(opts.kernel, "agent").length + 1).replaceAll("\\", "/");
    if (SKIP_AGENT_COPY.test(rel) || SKIP_AGENT_FILES.has(rel.split(/[\\/]/).pop() || "") || AGENT_RUNTIME_HISTORY_ENTRIES.some(entry => rel === entry || rel.startsWith(entry + "/"))) continue;
    mkdirSync(dirname(join(dest, "agent", rel)), { recursive: true });
    copyTree(file, join(dest, "agent", rel));
  }
  mkdirSync(join(dest, "design-system"), { recursive: true });
  copyTree(join(opts.kernel, "design-system", "MASTER.md"), join(dest, "design-system", "MASTER.md"));
  const relKernel = `file:${relative(dest, opts.kernel).replaceAll("\\", "/")}`;
  const pkgPath = join(dest, "package.json");
  const pkg = json<{ name: string; scripts: Record<string, string>; dependencies: Record<string, string> }>(pkgPath);
  pkg.name = opts.slug;
  pkg.dependencies["@tryvitris/website-harness"] = relKernel;
  for (const [key, value] of Object.entries(pkg.scripts)) pkg.scripts[key] = value.replaceAll("__SLUG__", opts.slug);
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  for (const file of ["site.json", "README.md", "AGENTS.md"]) {
    const p = join(dest, file);
    if (!existsSync(p)) continue;
    if (file === "site.json") {
      const site = json<Record<string, unknown>>(p);
      site.slug = opts.slug; site.name = opts.name;
      writeFileSync(p, `${JSON.stringify(site, null, 2)}\n`);
    } else writeFileSync(p, readFileSync(p, "utf8").replaceAll("__SLUG__", opts.slug).replaceAll("__NAME__", opts.name));
  }
  const launch = existsSync(join(opts.parent, "launch.json")) ? json<Record<string, unknown>>(join(opts.parent, "launch.json")) : {};
  launch.slug = opts.slug;
  launch.name = opts.name;
  save(join(dest, "launch.json"), launch);
  if (existsSync(join(opts.parent, "agent/adapter.json"))) copyTree(join(opts.parent, "agent/adapter.json"), join(dest, "agent/adapter.json"));
  if (existsSync(join(opts.parent, "agent/adapter.reviewer.json"))) copyTree(join(opts.parent, "agent/adapter.reviewer.json"), join(dest, "agent/adapter.reviewer.json"));
  if (existsSync(join(opts.parent, "agent/request.json"))) copyTree(join(opts.parent, "agent/request.json"), join(dest, "agent/request.json"));
}

export function importSharedEvidence(child: string, sharedDir: string, graph?: SkillGraph): void {
  copyAllowlist(sharedDir, child, SHARED_EVIDENCE_PATHS);
  const g = graph || applyArtDirectionGraph(child, parseGraphYaml(readFileSync(join(child, "agent/graph.yaml"), "utf8")));
  const state = loadState(child, g);
  const migration = assessDesignContractMigration(child);
  applyDesignContractMigration(child, g, state);
  for (const id of CHILD_IMPORT_NODES) {
    const node = g.nodes.find(n => n.id === id);
    if (!node) {
      if (["narrative", "narrative-review", "reference-analysis"].includes(id)) continue;
      throw new Error(`Missing graph node for imported evidence: ${id}`);
    }
    const requiredWrite = (node.writes || []).find(w => !w.endsWith("/") && w.includes("."));
    if (["narrative", "narrative-review", "reference-analysis"].includes(id) && requiredWrite && !existsSync(join(child, requiredWrite))) continue;
    if (importStageBlockedByMigration(id, migration.regenerate)) {
      state.nodes[id] = { status: "pending", attempts: 0 };
      continue;
    }
    const result = id === "harvest" ? gradeHarvest(child) : gradeNode(child, node.eval);
    if (!result.ok) throw new Error(`Imported ${id} failed revalidation: ${result.failures.join("; ")}`);
    finish(child, g, state, node, []);
  }
  save(join(child, "agent/STATE.json"), state);
}

export const QUALIFIED_REPRESENTATIVE_PATHS = [
  "media/stock", "media/generated", "media/derived", "artwork", "onboarding/media-inventory.json", "onboarding/visual-asset-brief.json", "onboarding/asset-production.json", "onboarding/asset-operations",
  "onboarding/narrative-brief.json",
  "onboarding/reference-analysis.json",
  "onboarding/direction.json",
  "onboarding/studies",
  "onboarding/storyboard.json",
  "onboarding/copy-plan.json",
  "onboarding/study-renders",
  "pages", "components", "theme", "site.json",
  "agent/reviews/direction-render.json",
  "agent/reviews/direction-review.json",
  "agent/reviews/copy-review.json",
  "agent/reviews/representative-browser.json",
  "agent/reviews/representative-review.json",
  "agent/reviews/representative-quality.json",
  "agent/decisions/authoring-decisions.json",
  "agent/screenshots/representative-browser",
  "dist",
];

export const QUALIFIED_IMPORT_NODES = [
  "direction", "direction-render", "direction-review",
  "asset-production",
  "storyboard", "copy", "copy-review",
  "representative", "representative-browser", "representative-review", "representative-quality",
] as const;

export function importQualifiedRepresentative(child: string, from: string, graph?: SkillGraph): void {
  copyAllowlist(from, child, QUALIFIED_REPRESENTATIVE_PATHS);
  const g = graph || applyArtDirectionGraph(child, parseGraphYaml(readFileSync(join(child, "agent/graph.yaml"), "utf8")));
  const state = loadState(child, g);
  for (const id of QUALIFIED_IMPORT_NODES) {
    const node = g.nodes.find(n => n.id === id);
    if (!node) continue;
    const result = gradeNode(child, node.eval);
    if (!result.ok) throw new Error(`Imported ${id} failed revalidation: ${result.failures.join("; ")}`);
    finish(child, g, state, node, []);
  }
}
