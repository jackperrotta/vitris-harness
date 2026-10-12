import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { currentRunId, designRunStatus } from "../agent/design-run.ts";
import { creativeRunStatusSnapshot } from "../agent/creative-profile.ts";
import { EXIT_CODES, type CommandResult } from "./types.ts";
import { isPreserveSite } from "../preserve/config.ts";
import { sourceRevision } from "../engine/revision.ts";
import { artifactManifest } from "../knowledge/artifact.ts";
import type { PreserveReport } from "../preserve/verify.ts";

export type StatusOptions = {
  site?: string;
  runId?: string;
};

export async function statusSite(opts: StatusOptions = {}): Promise<CommandResult<{ status: unknown }>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Site root not found: ${root}`,
    };
  }

  if (isPreserveSite(root)) {
    const path = join(root, "agent/reviews/preserve.json");
    const report = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as PreserveReport : undefined;
    const current = !!report && existsSync(join(root, "dist")) && report.sourceRevision === sourceRevision(root).digest && report.artifactDigest === artifactManifest(join(root, "dist")).sha256;
    const status = { mode: "preserve", status: !report ? "not_verified" : !current ? "stale" : report.ok ? "preview_ready" : "needs_repair", previewReady: current && report?.ok, report: report ? "agent/reviews/preserve.json" : undefined };
    return { ok: true, exitCode: EXIT_CODES.SUCCESS, summary: JSON.stringify(status, null, 2), data: { status } };
  }
  const creative = (opts.runId && existsSync(join(root, "agent/creative-runs", opts.runId, "manifest.json")))
    ? creativeRunStatusSnapshot(root, opts.runId)
    : !opts.runId && existsSync(join(root, "agent/creative-runs/CURRENT.json")) ? creativeRunStatusSnapshot(root) : undefined;
  if (creative) return { ok: true, exitCode: EXIT_CODES.SUCCESS, summary: JSON.stringify(creative, null, 2), data: { status: creative } };

  const runId = opts.runId || (existsSync(join(root, "agent/design-runs")) ? currentRunId(root) : undefined);

  // If a design-run ID is explicitly requested or present:
  if (runId && existsSync(join(root, "agent/design-runs", runId))) {
    const status = designRunStatus(root, runId);
    let running: { pid: number; snapshot: boolean } | undefined;
    const lockPath = join(root, "agent/RUN.lock");
    if (existsSync(lockPath)) {
      try {
        const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { pid: number };
        try {
          process.kill(lock.pid, 0);
          running = { pid: lock.pid, snapshot: true };
        } catch {}
      } catch {}
    }
    const fullStatus = running ? { ...status, running } : status;
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: JSON.stringify(fullStatus, null, 2),
      data: { status: fullStatus },
    };
  }

  // Standard workflow status
  const statePath = join(root, "agent/STATE.json");
  if (!existsSync(statePath)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `No agent/STATE.json found in ${root}`,
    };
  }

  const state = JSON.parse(readFileSync(statePath, "utf8")) as Record<string, unknown>;
  const lockPath = join(root, "agent/RUN.lock");
  let running: { pid: number; snapshot: boolean } | undefined;
  if (existsSync(lockPath)) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { pid: number };
      try {
        process.kill(lock.pid, 0);
        running = { pid: lock.pid, snapshot: true };
      } catch {}
    } catch {}
  }

  const fullStatus = running ? { ...state, running } : state;
  return {
    ok: true,
    exitCode: EXIT_CODES.SUCCESS,
    summary: JSON.stringify(fullStatus, null, 2),
    data: { status: fullStatus },
  };
}
