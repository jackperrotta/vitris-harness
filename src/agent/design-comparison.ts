import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { files, fingerprint, json, save, sourceHash, within, type Storyboard } from "./artifacts.ts";

export const COMPARISON_SNAPSHOT_PATHS = ["dist", "agent/screenshots"];

export type ComparisonCandidate = {
  candidateId: string;
  label: string;
  root: string;
  concept: string;
  previewUrl?: string;
  sourceHash: string;
  buildHash: string;
  previewReady: boolean;
  missingRoutes: string[];
};

export type ComparisonManifest = {
  version: 2;
  mode: "calibration" | "design-selection";
  revision: string;
  runId?: string;
  createdAt: string;
  hash: string;
  candidates: ComparisonCandidate[];
  labels?: Record<string, string>;
};

export type SectionRecord = {
  sectionId: string;
  semanticRole?: string;
  component?: string;
  screenshotAnchor?: string;
  factIds: string[];
  assetIds: string[];
  action?: { label: string; destination: string; behavior: string } | null;
};

export type SectionIndex = {
  candidateId: string;
  buildHash: string;
  routes: { path: string; purpose?: string; sections: SectionRecord[]; missing?: boolean }[];
};

export function snapshotTree(root: string, dest: string, paths: string[]): void {
  mkdirSync(dest, { recursive: true });
  for (const path of paths) {
    const src = within(root, path);
    if (!existsSync(src)) continue;
    files(src);
    cpSync(src, join(dest, path), { recursive: true });
  }
}

export function buildSectionIndex(root: string, candidateId: string): SectionIndex {
  const storyboardPath = join(root, "onboarding/storyboard.json");
  const plan = existsSync(storyboardPath) ? json<Storyboard>(storyboardPath) : { pages: [] as Storyboard["pages"] };
  const routes = (plan.pages || []).map(page => {
    const built = join(root, "dist", page.path === "/" ? "index.html" : `${page.path.replace(/^\//, "")}/index.html`);
    const html = existsSync(built) ? readFileSync(built, "utf8") : "";
    const missing = !existsSync(built);
    const sections = (page.sections || []).map(section => {
      const present = html.includes(`id="${section.id}"`) || html.includes(`data-section="${section.id}"`);
      const component = componentFromHtml(html, section.id);
      return {
        sectionId: section.id,
        semanticRole: inferRole(section.id, page.path),
        ...(component ? { component } : {}),
        screenshotAnchor: present ? `#${section.id}` : undefined,
        factIds: section.facts || [],
        assetIds: section.media || [],
        action: section.action,
      };
    });
    return { path: page.path, purpose: page.purpose, sections, missing };
  });
  return { candidateId, buildHash: existsSync(join(root, "dist/index.html")) ? fingerprint(root, ["dist"]) : "", routes };
}

function componentFromHtml(html: string, sectionId: string): string | undefined {
  const escaped = sectionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attr = html.match(new RegExp(`(?:id|data-section)="${escaped}"[^>]*data-component="([^"]+)"`))
    || html.match(new RegExp(`data-component="([^"]+)"[^>]*(?:id|data-section)="${escaped}"`));
  if (attr?.[1]) return attr[1];
  const cls = html.match(new RegExp(`(?:id|data-section)="${escaped}"[^>]*class="([^"]*)"`));
  const token = cls?.[1]?.split(/\s+/).find(c => /^c-[a-z0-9-]+$/i.test(c) && !c.includes("--"));
  return token ? token.slice(2) : undefined;
}

function inferRole(sectionId: string, route: string): string {
  const id = sectionId.toLowerCase();
  if (id.includes("hero") || id.includes("opening") || id === "top") return "hero";
  if (id.includes("galler") || id.includes("work") || id.includes("project") || id.includes("portfolio")) return "gallery";
  if (id.includes("about") || id.includes("team") || id.includes("founder")) return "about";
  if (id.includes("contact") || id.includes("cta") || id.includes("next")) return "cta";
  if (route === "/" && id.includes("service")) return "services";
  return "section";
}

export function snapshotCandidates(opts: {
  runId: string;
  revision: string;
  dest: string;
  sites: { candidateId: string; label: string; root: string; concept: string; previewReady: boolean; previewUrl?: string }[];
}): ComparisonManifest {
  const dest = resolve(opts.dest);
  if (existsSync(join(dest, "comparison.json"))) throw new Error("Comparison revision already exists");
  mkdirSync(dest, { recursive: true });
  const candidates: ComparisonCandidate[] = opts.sites.map(site => {
    const side = join(dest, site.candidateId);
    snapshotTree(site.root, side, COMPARISON_SNAPSHOT_PATHS);
    const index = buildSectionIndex(site.root, site.candidateId);
    save(join(side, "section-index.json"), index);
    if (existsSync(join(site.root, "onboarding/direction.json"))) {
      snapshotTree(site.root, side, ["onboarding/direction.json"]);
    }
    const missingRoutes = index.routes.filter(r => r.missing).map(r => r.path);
    return {
      candidateId: site.candidateId,
      label: site.label,
      root: site.root,
      concept: site.concept,
      previewUrl: site.previewUrl,
      sourceHash: sourceHash(site.root),
      buildHash: existsSync(join(site.root, "dist/index.html")) ? fingerprint(site.root, ["dist"]) : "",
      previewReady: site.previewReady,
      missingRoutes,
    };
  });
  const manifest: ComparisonManifest = {
    version: 2,
    mode: "design-selection",
    revision: opts.revision,
    runId: opts.runId,
    createdAt: new Date().toISOString(),
    hash: "",
    candidates,
    labels: Object.fromEntries(candidates.map(c => [c.label, c.candidateId])),
  };
  manifest.hash = fingerprint(dest, candidates.map(c => c.candidateId));
  save(join(dest, "comparison.json"), manifest);
  return manifest;
}

export function loadComparison(dest: string): ComparisonManifest {
  return json<ComparisonManifest>(join(dest, "comparison.json"));
}

export function loadSectionIndexes(dest: string, comparison: ComparisonManifest): Record<string, SectionIndex> {
  const out: Record<string, SectionIndex> = {};
  for (const candidate of comparison.candidates) {
    const path = join(dest, candidate.candidateId, "section-index.json");
    if (existsSync(path)) out[candidate.candidateId] = json<SectionIndex>(path);
  }
  return out;
}

export function resolveDisplayLabel(comparison: ComparisonManifest, value: string): string | undefined {
  if (comparison.candidates.some(c => c.candidateId === value)) return value;
  return comparison.labels?.[value] || comparison.candidates.find(c => c.label === value)?.candidateId;
}
