import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { files, fingerprint, json, save, sourceHash, within } from "./artifacts.ts";
import type { AgentState, CumulativeSpend, SkillGraph } from "./graph.ts";

export type ResultManifestStatus =
  | "verified_preview"
  | "provisional_preview"
  | "refinement_blocked"
  | "needs_repair"
  | "failed"
  | "canceled";

export type ResultManifest = {
  schemaVersion: 1;
  runId?: string;
  siteRoot: string;
  status: ResultManifestStatus;
  localUrl?: string;
  provisionalUrl?: string;
  revision: string;
  coveredRoutes: string[];
  gateStatus: Record<string, "pending" | "done" | "failed" | "in_progress">;
  durationMs: number;
  cumulativeSpend: CumulativeSpend;
  usageSummary: {
    inputTokens: number | null;
    outputTokens: number | null;
    observedInputTokens: number;
    observedOutputTokens: number;
    meteringCoverage: "complete" | "incomplete" | "no-agent-work";
    jevTransportCalls: number;
  };
  unresolvedLimitations: string[];
  completedAt: string;
};

export function discoverCoveredRoutes(root: string): string[] {
  const distDir = join(root, "dist");
  if (!existsSync(distDir)) return [];
  const htmlFiles = files(distDir).filter(f => f.endsWith(".html"));
  const routes: string[] = [];
  for (const file of htmlFiles) {
    let rel = file.slice(distDir.length).replaceAll("\\", "/").replace(/^\//, "");
    if (rel === "index.html") {
      routes.push("/");
    } else if (rel.endsWith("/index.html")) {
      routes.push("/" + rel.slice(0, -"/index.html".length));
    } else if (rel.endsWith(".html")) {
      routes.push("/" + rel.slice(0, -".html".length));
    }
  }
  return [...new Set(routes)].sort();
}

export function extractUnresolvedLimitations(root: string): string[] {
  const limitations: string[] = [];
  const memoryPath = join(root, "agent/site-memory.json");
  if (existsSync(memoryPath)) {
    try {
      const memory = json<{ unresolved?: string[] }>(memoryPath);
      if (Array.isArray(memory.unresolved)) limitations.push(...memory.unresolved);
    } catch {}
  }
  const businessPath = join(root, "onboarding/business.json");
  if (existsSync(businessPath)) {
    try {
      const b = json<{ uncertainties?: Array<{ question?: string; resolution?: string; blocking?: boolean }> }>(businessPath);
      for (const u of b.uncertainties || []) {
        if (u.question && !u.resolution) limitations.push(u.question);
      }
    } catch {}
  }
  return [...new Set(limitations)];
}

export function generateResultManifest(opts: {
  root: string;
  state: AgentState;
  graph: SkillGraph;
  runId?: string;
  localUrl?: string;
  provisionalUrl?: string;
  durationMs?: number;
}): ResultManifest {
  const root = opts.root;
  const coveredRoutes = discoverCoveredRoutes(root);
  const gateStatus: Record<string, "pending" | "done" | "failed" | "in_progress"> = {};
  for (const node of opts.graph.nodes) {
    const st = opts.state.nodes[node.id];
    gateStatus[node.id] = st ? st.status : "pending";
  }

  let status: ResultManifestStatus = "failed";
  if (opts.state.status === "canceled") {
    status = "canceled";
  } else if (opts.state.status === "refinement_blocked") {
    status = "refinement_blocked";
  } else if (opts.state.status === "needs_repair") {
    status = "needs_repair";
  } else if (opts.state.preview_ready) {
    status = "verified_preview";
  } else if (existsSync(join(root, "dist/index.html"))) {
    status = "provisional_preview";
  }

  const revision = fingerprint(root, ["dist", "pages", "components", "theme", "site.json"]);
  const spend = opts.state.cumulativeSpend || { iterations: 0, calls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };
  const coverage = spend.hasUnmeteredStages ? "incomplete" : spend.agentTokensMeasured ? "complete" : "no-agent-work";

  const manifest: ResultManifest = {
    schemaVersion: 1,
    runId: opts.runId,
    siteRoot: root,
    status,
    localUrl: opts.state.preview_ready ? opts.localUrl : undefined,
    provisionalUrl: opts.provisionalUrl || (existsSync(join(root, "dist/index.html")) ? opts.localUrl : undefined),
    revision,
    coveredRoutes,
    gateStatus,
    durationMs: opts.durationMs || 0,
    cumulativeSpend: spend,
    usageSummary: {
      inputTokens: coverage === "incomplete" ? null : spend.inputTokens,
      outputTokens: coverage === "incomplete" ? null : spend.outputTokens,
      observedInputTokens: spend.inputTokens,
      observedOutputTokens: spend.outputTokens,
      meteringCoverage: coverage,
      jevTransportCalls: spend.jevCalls || 0,
    },
    unresolvedLimitations: extractUnresolvedLimitations(root),
    completedAt: new Date().toISOString(),
  };

  return manifest;
}

export function writeResultManifest(root: string, manifest: ResultManifest): void {
  save(join(root, "agent/result-manifest.json"), manifest);
}

export function loadResultManifest(root: string): ResultManifest | undefined {
  const path = join(root, "agent/result-manifest.json");
  return existsSync(path) ? json<ResultManifest>(path) : undefined;
}
