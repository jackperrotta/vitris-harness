import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { save } from "../agent/artifacts.ts";
import { runWorkflow } from "../agent/workflow.ts";
import { handleDesignRunCommand } from "../agent/design-cli.ts";
import { runCreativeProfile } from "../agent/creative-profile.ts";
import { findKernelRoot } from "./root.ts";
import { workflowArgvFromFlags } from "./workflow-argv.ts";
import type { JevTransport } from "../agent/jev/types.ts";
import { EXIT_CODES, type CommandResult, type ExitCode } from "./types.ts";
import { isPreserveSite } from "../preserve/config.ts";
import { runPreserve } from "./preserve.ts";
import { persistSiteInputs, resolveSiteInputsLive, type SiteInputOptions } from '../agent/site-inputs.ts';

const kernelRoot = findKernelRoot();

export function buildAdapterConfig(adapter: string, model?: string): {
  command: string;
  args: string[];
  prompt: "stdin";
  model?: string;
} {
  const lower = adapter.toLowerCase();
  let command = adapter;
  let args: string[] = [];

  if (lower.includes("cursor") || lower === "agent") {
    command = adapter;
    args = ["--print", "--force", "--trust", "--output-format", "stream-json"];
    if (model) args.push("--model", model);
  } else if (lower.includes("gemini")) {
    command = adapter;
    args = ["--stdin"];
    if (model) args.push("--model", model);
  } else if (lower.includes("codex")) {
    command = adapter;
    args = ["exec", "--skip-git-repo-check", "--ephemeral", "-"];
    if (model) args.push("--model", model);
  } else {
    command = adapter;
    args = [];
    if (model) args.push("--model", model);
  }

  return {
    command,
    args,
    prompt: "stdin" as const,
    ...(model ? { model } : {}),
  };
}

export type RunOptions = SiteInputOptions & {
  site?: string;
  variants?: number | string;
  creativeProfile?: boolean;
  adapter?: string;
  model?: string;
  theme?: string;
  themeScope?: "all" | "one";
  restartFrom?: string;
  reason?: string;
  dryRun?: boolean;
  noPreviewServer?: boolean;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
  workflowArgv?: string[];
  jevFetch?: JevTransport;
};

export async function runSite(opts: RunOptions = {}): Promise<CommandResult<{ runId?: string; previewReady?: boolean }>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Site root not found: ${root}`,
    };
  }

  let inputs;
  try {
    inputs = await resolveSiteInputsLive(opts);
    if (isPreserveSite(root) && (inputs.template || inputs.content !== undefined)) throw Error('Template and additional content inputs require redesign mode');
  } catch (error) {
    return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: error instanceof Error ? error.message : String(error) };
  }
  if (isPreserveSite(root)) {
    if (opts.creativeProfile || opts.theme || (opts.variants !== undefined && Number(opts.variants) !== 1)) return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: "Preserve mode cannot run creative variants or apply a new theme" };
    return runPreserve(root, opts);
  }
  const variants = Number(opts.variants || 1);
  if (variants !== 1 && variants !== 5) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Unsupported variants count: ${variants}. Allowed: 1 or 5.`,
    };
  }
  if (opts.creativeProfile && variants !== 1) return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: "Creative profile uses one adaptive production candidate at a time; omit --variants 5" };

  if (opts.restartFrom && !opts.reason) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: "--restart-from requires --reason",
    };
  }

  if (opts.dryRun) {
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `[dry-run] Would execute ${opts.creativeProfile ? "creative profile" : `${variants}-variant run`} on ${root}`,
      data: { previewReady: false },
    };
  }

  // Configure adapter / model if provided
  if (opts.adapter) {
    const adapterConfig = buildAdapterConfig(opts.adapter, opts.model);
    save(join(root, "agent/adapter.json"), adapterConfig);
  }

  // Handle cancellation signal
  if (opts.signal?.aborted) {
    return {
      ok: false,
      exitCode: EXIT_CODES.ABORTED,
      error: "Run aborted by signal before execution",
    };
  }
  persistSiteInputs(root, inputs);

  if (variants === 5) {
    const argv: string[] = ["--variants", "5"];
    if (opts.theme) argv.push("--theme", opts.theme);
    if (opts.themeScope) argv.push("--theme-scope", opts.themeScope);
    if (opts.restartFrom) argv.push("--restart-from", opts.restartFrom, "--reason", opts.reason!);

    const code = await handleDesignRunCommand({ root, kernel: kernelRoot, argv });
    const exitCode: ExitCode = code === 0 ? EXIT_CODES.SUCCESS : (code as ExitCode);
    return {
      ok: code === 0,
      exitCode,
      summary: code === 0 ? "Design run advanced; inspect its manifest for the current stage or feedback pause" : `5-variant design run failed with code ${code}`,
    };
  }

  if (opts.creativeProfile) {
    const argv = ["--creative-profile", ...(opts.workflowArgv || [])];
    if (opts.theme) argv.push("--theme", opts.theme);
    if (opts.reason) argv.push("--reason", opts.reason);
    const result = await runCreativeProfile(root, kernelRoot, argv, { jevFetch: opts.jevFetch });
    return { ok: result.exitCode === 0, exitCode: result.exitCode as ExitCode, summary: result.summary, data: { runId: result.run.id, previewReady: result.run.phase === "complete" } };
  }

  // Variants === 1
  const argv: string[] = [...(opts.workflowArgv || [])];
  if (opts.theme) argv.push("--theme", opts.theme);
  if (opts.restartFrom) argv.push("--restart-from", opts.restartFrom, "--reason", opts.reason!);
  if (opts.noPreviewServer) argv.push("--no-preview-server");

  const result = await runWorkflow({
    root,
    kernel: kernelRoot,
    argv,
    noPreviewServer: opts.noPreviewServer,
    onLog: opts.onLog,
    signal: opts.signal,
    jevFetch: opts.jevFetch,
  });

  const exitCode = result.exitCode as ExitCode;
  return {
    ok: exitCode === 0,
    exitCode,
    summary: exitCode === 0 ? (result.state.preview_ready ? "Verified local preview ready" : "Active-agent stage prepared; follow agent/CURRENT.md") : `Run failed with exit code ${exitCode}`,
    data: { previewReady: result.state.preview_ready },
  };
}
