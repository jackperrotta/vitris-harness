import { existsSync } from "node:fs";
import { join } from "node:path";
import { json } from "./artifacts.ts";
import type { CreativeRevisionPlan } from "./creative-contract.ts";

export type CreativeChangeContext = {
  changedPaths: string[];
  affectedRoutes: string[];
  scope: "local" | "broad";
  reason: string;
  findings: string[];
  acceptance: string[];
  attemptedChanges: string[];
  remainingRisks: string[];
};

function normalizeRoute(route: string): string {
  return route === "/" ? "/" : `/${route.replace(/^\/+|\/+$/g, "")}/`;
}
function pageRoute(path: string): string | undefined {
  if (!path.startsWith("pages/") || !path.endsWith(".html")) return undefined;
  const stem = path.slice("pages/".length, -".html".length).replace(/\/index$/, "");
  return normalizeRoute(stem === "index" ? "/" : stem);
}

/** Exact route mapping. Unknown or shared dependencies conservatively reach every route. */
export function selectCreativeChangeContext(paths: string[], routes: string[], plan: CreativeRevisionPlan, findings: unknown[] = [], result?: { changes?: { target?: string; change?: string; acceptance?: string }[]; remainingRisks?: string[] }): CreativeChangeContext {
  const declared = [...new Set(routes.map(normalizeRoute))].sort();
  const changedPaths = [...new Set(paths)].sort();
  const local = new Set<string>();
  let broadReason = "";
  for (const path of changedPaths) {
    const route = pageRoute(path);
    if (route && declared.includes(route)) local.add(route);
    else { broadReason = `Shared or unknown dependency: ${path}`; break; }
  }
  if (!changedPaths.length) broadReason = "No accepted source delta is available; review all declared routes";
  const scope = broadReason ? "broad" : "local";
  return {
    changedPaths,
    affectedRoutes: scope === "broad" ? declared : [...local].sort(),
    scope,
    reason: broadReason || "Only exact page source routes changed; preserve global identity and final whole-site gates",
    findings: plan.findingIndexes.map(index => JSON.stringify(findings[index] ?? `Finding ${index} unavailable; inspect archived review`)),
    acceptance: plan.acceptance,
    attemptedChanges: (result?.changes || []).map(item => `${item.target || "target"}: ${item.change || "change unrecorded"}; acceptance: ${item.acceptance || "unrecorded"}`),
    remainingRisks: result?.remainingRisks || [],
  };
}

export function acceptedCreativeChangeContext(child: string, runId: string, round: number, routes: string[], plan: CreativeRevisionPlan, findings: unknown[]): CreativeChangeContext | undefined {
  const base = join(child, "agent/runs", `${runId}-revision-${round}`);
  if (!existsSync(`${base}.adoption.json`)) return undefined;
  const adoption = json<{ changedAuthoredFiles?: string[] }>(`${base}.adoption.json`);
  const result = existsSync(`${base}.result.json`) ? json<{ changes?: { target?: string; change?: string; acceptance?: string }[]; remainingRisks?: string[] }>(`${base}.result.json`) : undefined;
  return selectCreativeChangeContext(adoption.changedAuthoredFiles || [], routes, plan, findings, result);
}
