import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { json } from "./artifacts.ts";
import { loadComparison, loadSectionIndexes, type ComparisonManifest, type SectionIndex, type SectionRecord } from "./design-comparison.ts";
import { currentRunId, designRunStatus, loadManifest, runDir } from "./design-run.ts";
import { ensurePreview } from "./preview.ts";

const HTML_LIMIT = 80_000;

export type LivePreviewMap = Record<string, string>;

export type AgentCandidateContext = {
  candidateId: string;
  label: string;
  concept: string;
  root: string;
  previewUrl?: string;
  previewReady: boolean;
  missingRoutes: string[];
  routes: { path: string; purpose?: string; missing?: boolean; sections: { sectionId: string; semanticRole?: string; component?: string }[] }[];
};

export type AgentComparisonContext = {
  runId: string;
  status: string;
  comparisonRevision: string;
  comparisonHash: string;
  reviewUrl?: string;
  api?: { state: string; context: string; page: string };
  instruction: string;
  candidates: AgentCandidateContext[];
};

export type AgentPageContext = {
  candidateId: string;
  label: string;
  route: string;
  previewUrl?: string;
  missing: boolean;
  sections: SectionRecord[];
  html?: string;
};

const INSTRUCTION = "The operator reviews live A–E previews and leaves free-form feedback in Cursor. Use this context to ask clarifying questions, then write validated design-run feedback and resume synthesis. The comparison page does not collect or submit choices.";

export function resolveDesignSite(cwd: string, explicit?: string): string {
  if (explicit) return resolve(explicit);
  if (process.env.VITRIS_SITE) return resolve(process.env.VITRIS_SITE);
  if (existsSync(join(cwd, "agent/design-runs/CURRENT.json"))) return cwd;
  const scratch = join(cwd, "scratch/design-run-preview");
  if (existsSync(join(scratch, "agent/design-runs/CURRENT.json"))) return scratch;
  throw new Error("No design-run site. Pass site, set VITRIS_SITE, or run --variants 5 first.");
}

export function joinPreviewRoute(base: string, route: string): string {
  const origin = new URL(base).origin;
  if (!route || route === "/") return `${origin}/`;
  const path = route.startsWith("/") ? route : `/${route}`;
  return `${origin}${path}`;
}

export function comparisonDest(parent: string, runId: string): string {
  const manifest = loadManifest(parent, runId);
  if (!manifest.activeComparisonRevision) throw new Error("No comparison snapshot yet");
  return join(runDir(parent, runId), "comparison", manifest.activeComparisonRevision);
}

export function readLivePreviewReceipt(root: string): string | undefined {
  const receipt = join(root, "agent/preview-server.json");
  if (!existsSync(receipt)) return undefined;
  try {
    const saved = json<{ url?: string }>(receipt);
    return typeof saved.url === "string" && saved.url.startsWith("http://127.0.0.1") ? saved.url : undefined;
  } catch {
    return undefined;
  }
}

export function overlayPreviewUrl(candidateRoot: string, stored?: string, live?: string): string | undefined {
  return live || readLivePreviewReceipt(candidateRoot) || stored;
}

export async function refreshCandidatePreviews(opts: { parent: string; kernel: string; runId: string }): Promise<LivePreviewMap> {
  const dest = comparisonDest(opts.parent, opts.runId);
  const comparison = loadComparison(dest);
  const urls: LivePreviewMap = {};
  for (const candidate of comparison.candidates) {
    const root = existsSync(join(candidate.root, "dist/index.html")) ? candidate.root : resolve(opts.parent, candidate.root);
    if (!existsSync(join(root, "dist/index.html"))) continue;
    try { urls[candidate.candidateId] = await ensurePreview(root, opts.kernel); } catch { /* keep stored URL if any */ }
  }
  return urls;
}

export function loadAgentComparison(parent: string, runId: string, livePreviews: LivePreviewMap = {}): AgentComparisonContext {
  const manifest = loadManifest(parent, runId);
  const dest = comparisonDest(parent, runId);
  const comparison = loadComparison(dest);
  const indexes = loadSectionIndexes(dest, comparison);
  const reviewPath = join(runDir(parent, runId), "review-server.json");
  const review = existsSync(reviewPath) ? json<{ url?: string; token?: string; port?: number }>(reviewPath) : undefined;
  const token = review?.token;
  const origin = review?.url ? new URL(review.url).origin : undefined;
  return {
    runId,
    status: String((designRunStatus(parent, runId) as { status: string }).status),
    comparisonRevision: comparison.revision,
    comparisonHash: comparison.hash,
    reviewUrl: review?.url,
    api: origin && token ? {
      state: `${origin}/api/state?token=${token}`,
      context: `${origin}/api/context?token=${token}`,
      page: `${origin}/api/page?token=${token}`,
    } : undefined,
    instruction: INSTRUCTION,
    candidates: comparison.candidates.map(candidate => {
      const index = indexes[candidate.candidateId];
      const previewUrl = overlayPreviewUrl(candidate.root, candidate.previewUrl, livePreviews[candidate.candidateId]);
      return {
        candidateId: candidate.candidateId,
        label: candidate.label,
        concept: candidate.concept,
        root: candidate.root,
        previewUrl,
        previewReady: candidate.previewReady,
        missingRoutes: candidate.missingRoutes,
        routes: (index?.routes || []).map(route => ({
          path: route.path,
          purpose: route.purpose,
          missing: route.missing,
          sections: (route.sections || []).map(section => ({
            sectionId: section.sectionId,
            semanticRole: section.semanticRole,
            component: section.component,
          })),
        })),
      };
    }),
  };
}

export function reviewState(parent: string, runId: string, livePreviews: LivePreviewMap = {}) {
  const dest = comparisonDest(parent, runId);
  const comparison = loadComparison(dest);
  const indexes = loadSectionIndexes(dest, comparison);
  const candidates = comparison.candidates.map(candidate => ({
    ...candidate,
    previewUrl: overlayPreviewUrl(candidate.root, candidate.previewUrl, livePreviews[candidate.candidateId]),
  }));
  return {
    status: designRunStatus(parent, runId),
    comparison: { ...comparison, candidates },
    indexes,
    machineChecked: candidates.every(c => c.previewReady),
    operatorApprovalRequired: true,
    feedbackInCursor: true,
    instruction: INSTRUCTION,
  };
}

export function resolveCandidateId(comparison: ComparisonManifest, value: string): string | undefined {
  if (comparison.candidates.some(c => c.candidateId === value)) return value;
  return comparison.labels?.[value] || comparison.candidates.find(c => c.label.toLowerCase() === value.toLowerCase())?.candidateId;
}

export function loadAgentPage(parent: string, runId: string, candidateRef: string, route: string, livePreviews: LivePreviewMap = {}): AgentPageContext {
  const dest = comparisonDest(parent, runId);
  const comparison = loadComparison(dest);
  const candidateId = resolveCandidateId(comparison, candidateRef);
  if (!candidateId) throw new Error(`Unknown candidate ${candidateRef}`);
  const candidate = comparison.candidates.find(c => c.candidateId === candidateId)!;
  const indexes = loadSectionIndexes(dest, comparison);
  const index: SectionIndex | undefined = indexes[candidateId];
  const path = !route || route === "home" ? "/" : (route.startsWith("/") ? route : `/${route}`);
  const record = index?.routes.find(r => r.path === path);
  const htmlPath = routeFile(dest, candidateId, path);
  const missing = !htmlPath;
  const html = htmlPath ? readFileSync(htmlPath, "utf8") : undefined;
  return {
    candidateId,
    label: candidate.label,
    route: path,
    previewUrl: overlayPreviewUrl(candidate.root, candidate.previewUrl, livePreviews[candidateId]),
    missing: missing || record?.missing === true,
    sections: record?.sections || [],
    html: html && html.length > HTML_LIMIT ? html.slice(0, HTML_LIMIT) : html,
  };
}

function routeFile(dest: string, candidateId: string, route: string): string | undefined {
  const rel = route === "/" ? "index.html" : `${route.replace(/^\//, "").replace(/\/$/, "")}/index.html`;
  const snap = join(dest, candidateId, "dist", rel);
  if (existsSync(snap)) return snap;
  return undefined;
}
