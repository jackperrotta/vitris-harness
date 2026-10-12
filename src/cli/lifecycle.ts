import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { save } from "../agent/artifacts.ts";
import { runWorkflow } from "../agent/workflow.ts";
import { handleDesignRunCommand } from "../agent/design-cli.ts";
import { currentRunId } from "../agent/design-run.ts";
import { creativeRunStatus, runCreativeProfile } from "../agent/creative-profile.ts";
import { spawnSync } from "node:child_process";
import { findKernelRoot } from "./root.ts";
import { workflowArgvFromFlags } from "./workflow-argv.ts";
import type { JevTransport } from "../agent/jev/types.ts";
import { EXIT_CODES, type CommandResult, type ExitCode } from "./types.ts";

const kernelRoot = findKernelRoot();

export function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
    } catch {
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try { process.kill(pid, "SIGTERM"); } catch {}
    }
  }
}

export type LifecycleOptions = {
  site?: string;
  runId?: string;
  dryRun?: boolean;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
  workflowArgv?: string[];
  jevFetch?: JevTransport;
};

export async function resumeSite(opts: LifecycleOptions = {}): Promise<CommandResult<{ runId?: string }>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Site root not found: ${root}`,
    };
  }

  const creative = (opts.runId && existsSync(join(root, "agent/creative-runs", opts.runId, "manifest.json")))
    ? creativeRunStatus(root, opts.runId)
    : !opts.runId && existsSync(join(root, "agent/creative-runs/CURRENT.json")) ? creativeRunStatus(root) : undefined;
  const runId = opts.runId || (existsSync(join(root, "agent/design-runs")) ? currentRunId(root) : undefined);

  if (opts.dryRun) {
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `[dry-run] Would resume ${creative ? `creative run ${creative.id}` : runId ? `design run ${runId}` : "workflow"} on ${root}`,
      data: { runId },
    };
  }

  if (creative) {
    const result = await runCreativeProfile(root, kernelRoot, ["--creative-profile", "--creative-run", creative.id, "--resume", ...(opts.workflowArgv || [])]);
    return { ok: result.exitCode === 0, exitCode: result.exitCode as ExitCode, summary: result.summary, data: { runId: creative.id } };
  }

  if (runId && existsSync(join(root, "agent/design-runs", runId))) {
    const code = await handleDesignRunCommand({
      root,
      kernel: kernelRoot,
      argv: ["--design-run", runId],
    });
    const exitCode: ExitCode = code === 0 ? EXIT_CODES.SUCCESS : (code as ExitCode);
    return {
      ok: code === 0,
      exitCode,
      summary: code === 0 ? `Resumed design run ${runId}` : `Resume failed with code ${code}`,
      data: { runId },
    };
  }

  const result = await runWorkflow({
    root,
    kernel: kernelRoot,
    argv: ["--site", root, ...(opts.workflowArgv || [])],
    onLog: opts.onLog,
    signal: opts.signal,
    jevFetch: opts.jevFetch,
  });

  const exitCode = result.exitCode as ExitCode;
  return {
    ok: exitCode === 0,
    exitCode,
    summary: exitCode === 0 ? "Workflow resumed successfully" : `Resume exited with code ${exitCode}`,
  };
}

export async function cancelSite(opts: LifecycleOptions = {}): Promise<CommandResult<{ pid?: number }>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Site root not found: ${root}`,
    };
  }

  const lockPath = join(root, "agent/RUN.lock");
  if (!existsSync(lockPath)) {
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: "No active run lock found in site",
    };
  }

  let pid: number;
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { pid: number };
    pid = lock.pid;
  } catch {
    unlinkSync(lockPath);
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: "Removed corrupt agent/RUN.lock",
    };
  }

  if (opts.dryRun) {
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `[dry-run] Would terminate active run PID ${pid} and release lock`,
      data: { pid },
    };
  }

  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {
    alive = false;
  }

  if (alive) {
    killProcessTree(pid);

    // Wait briefly for process to exit
    await new Promise(r => setTimeout(r, 300));
    try {
      process.kill(pid, 0);
      // Still alive, force kill
      process.kill(pid, "SIGKILL");
    } catch {
      // exited cleanly
    }
  }

  if (existsSync(lockPath)) {
    unlinkSync(lockPath);
  }

  const statePath = join(root, "agent/STATE.json");
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, "utf8")) as { status: string; current: unknown };
      state.status = "canceled";
      state.current = null;
      save(statePath, state);
    } catch {}
  }

  return {
    ok: true,
    exitCode: EXIT_CODES.SUCCESS,
    summary: `Canceled active run (PID ${pid}) and cleaned locks`,
    data: { pid },
  };
}
