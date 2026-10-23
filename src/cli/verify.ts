import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { findHarnessRoot } from "./root.ts";
import { gradeAll, type GradeResult } from "../agent/grade.ts";
import { buildVerified } from "../build/verified.ts";
import { EXIT_CODES, type CommandResult } from "./types.ts";
import { isPreserveSite } from "../preserve/config.ts";
import { verifyPreservedSite } from "../preserve/verify.ts";
import { productionPreflightTimeoutMs } from '../agent/browser-timeout.ts';

export type VerifyOptions = {
  site?: string;
  dryRun?: boolean;
  environment?: "preview" | "production";
  remoteUrl?: string;
};

export type VerifyResultData = {
  build: { ok: boolean; error?: string };
  grades: GradeResult[];
  failures: string[];
};

export async function verifySite(opts: VerifyOptions = {}): Promise<CommandResult<VerifyResultData>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Site root not found: ${root}`,
    };
  }

  if (opts.dryRun) {
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `[dry-run] Would verify build and evaluate graph gates on ${root}`,
    };
  }

  if (isPreserveSite(root)) {
    if (opts.environment === "production") return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: "Preserve mode supports temporary previews only" };
    try {
      await buildVerified(root);
      const report = await verifyPreservedSite(root, { remoteUrl: opts.remoteUrl });
      return { ok: report.ok, exitCode: report.ok ? EXIT_CODES.SUCCESS : EXIT_CODES.GATES_FAILED,
        summary: report.ok ? `Preserve checks passed (${report.checks.length} route/viewport comparisons)` : "Preserve verification failed; see agent/reviews/preserve.json",
        failures: report.failures, data: { build: { ok: true }, grades: [{ node: "preserve", ok: report.ok, failures: report.failures }], failures: report.failures } };
    } catch (error) { return { ok: false, exitCode: EXIT_CODES.GATES_FAILED, error: error instanceof Error ? error.message : String(error) }; }
  }
  if (opts.remoteUrl) return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: "--remote is supported only for preserve sites" };
  const allFailures: string[] = [];
  let buildOk = true;
  let buildError: string | undefined;

  // 1. Verify build
  try {
    await buildVerified(root);
  } catch (err) {
    buildOk = false;
    buildError = err instanceof Error ? err.message : String(err);
    allFailures.push(`Build failed: ${buildError}`);
  }

  // 2. Evaluate all graph gates
  const grades = gradeAll(root);
  for (const g of grades) {
    if (!g.ok) {
      allFailures.push(...g.failures.map(f => `${g.node}: ${f}`));
    }
  }

  const environment = opts.environment || "preview";
  if (environment === "production" && buildOk) {
    const harness = findHarnessRoot();
    const bundled = join(harness, "bin/vitris-launch-preflight.js");
    const preflight = existsSync(bundled) ? bundled : join(harness, "scripts/launch-preflight.ts");
    const result = spawnSync(process.execPath, [
      ...(preflight.endsWith(".ts") ? ["--experimental-strip-types"] : []),
      preflight, "--site", root, "--environment", "production",
    ], { encoding: "utf8", timeout: productionPreflightTimeoutMs() });
    if (result.status !== 0) {
      const path = join(root, "agent/reviews/launch-preflight.json");
      const receipt = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as { blockerIds?: string[] } : undefined;
      allFailures.push(`launch: ${receipt?.blockerIds?.join(", ") || result.stderr || result.error?.message || "production preflight failed"}`);
    }
  }

  const ok = buildOk && allFailures.length === 0;
  const summary = ok
    ? `All verification gates passed (${grades.length} nodes checked, build verified).`
    : `Verification failed:\n${allFailures.map(f => `  - ${f}`).join("\n")}`;

  return {
    ok,
    exitCode: ok ? EXIT_CODES.SUCCESS : EXIT_CODES.GATES_FAILED,
    summary,
    failures: allFailures,
    data: {
      build: { ok: buildOk, error: buildError },
      grades,
      failures: allFailures,
    },
  };
}
