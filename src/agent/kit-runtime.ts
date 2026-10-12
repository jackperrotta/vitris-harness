import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Mutable agent-kit paths that must never be inherited from the kernel into a
 * fresh site, and must never be copied from the kernel over a site's own
 * runtime during refresh.
 */
export const AGENT_RUNTIME_HISTORY_ENTRIES = [
  "decisions",
  "runs",
  "run-history",
  "reviews",
  "screenshots",
  "preparations",
  "leases",
  "receipts",
  "design-runs",
  "CURRENT.md",
  "PREPARED.json",
  "preview-server.json",
  "RUN.lock",
  "result-manifest.json",
  ".mutation.lock",
  ".commit-journal.json",
  "quality-attempts.json",
  "media-revisions",
  "template-responses.json",
  "template-questions.json",
  "template-decisions.json",
  "template-inventory.json",
  "theme-selection.json",
  "template-input.json",
  "theme-awaiting.json",
] as const;

/**
 * Deletes kernel runtime history from a copied agent directory.
 * Safe to call on a destination site after copying the static kit.
 * Does not touch STATE.json, graph, refs, or site-authored config.
 */
export function stripAgentRuntimeHistory(agentDir: string): string[] {
  const removed: string[] = [];
  for (const entry of AGENT_RUNTIME_HISTORY_ENTRIES) {
    const target = join(agentDir, entry);
    if (!existsSync(target)) continue;
    rmSync(target, { recursive: true, force: true });
    removed.push(entry);
  }
  return removed;
}
