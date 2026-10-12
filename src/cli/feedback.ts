import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentRunId, submitFeedback } from "../agent/design-run.ts";
import { handleDesignRunCommand } from "../agent/design-cli.ts";
import { findKernelRoot } from "./root.ts";
import { EXIT_CODES, type CommandResult, type ExitCode } from "./types.ts";

const kernelRoot = findKernelRoot();

export type FeedbackImportOptions = {
  site?: string;
  runId?: string;
  file: string;
  dryRun?: boolean;
};

export type SynthesizeOptions = {
  site?: string;
  runId?: string;
  feedback?: string;
  dryRun?: boolean;
  onLog?: (line: string) => void;
};

export async function importFeedback(opts: FeedbackImportOptions): Promise<CommandResult<{ feedbackId?: string; summary?: string }>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Site root not found: ${root}`,
    };
  }

  const runId = opts.runId || currentRunId(root);
  if (!runId) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: "feedback import requires --run RUN_ID (or an active design run in site)",
    };
  }

  if (!opts.file) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: "feedback import requires --file PATH",
    };
  }

  const filePath = resolve(opts.file);
  if (!existsSync(filePath)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Feedback file not found: ${filePath}`,
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Invalid JSON in feedback file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (opts.dryRun) {
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `[dry-run] Would import feedback from ${filePath} into design run ${runId}`,
    };
  }

  try {
    const result = submitFeedback(root, runId, raw);
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: result.summary,
      data: {
        feedbackId: result.feedback.feedbackId,
        summary: result.summary,
      },
    };
  } catch (err) {
    return {
      ok: false,
      exitCode: EXIT_CODES.GATES_FAILED,
      error: `Failed to import feedback: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function synthesizeSite(opts: SynthesizeOptions = {}): Promise<CommandResult<{ runId?: string }>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Site root not found: ${root}`,
    };
  }

  const runId = opts.runId || currentRunId(root);
  if (!runId) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: "synthesize requires --run RUN_ID (or an active design run in site)",
    };
  }

  if (opts.dryRun) {
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `[dry-run] Would synthesize design run ${runId}`,
      data: { runId },
    };
  }

  const argv: string[] = ["--design-run", runId];
  if (opts.feedback) {
    argv.push("--feedback", resolve(opts.feedback));
  }

  const code = await handleDesignRunCommand({
    root,
    kernel: kernelRoot,
    argv,
  });

  const exitCode: ExitCode = code === 0 ? EXIT_CODES.SUCCESS : (code as ExitCode);
  return {
    ok: code === 0,
    exitCode,
    summary: code === 0 ? `Synthesized design run ${runId} successfully` : `Synthesis failed with code ${code}`,
    data: { runId },
  };
}
