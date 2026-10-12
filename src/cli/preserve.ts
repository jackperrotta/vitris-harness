import { existsSync } from "node:fs";
import { join } from "node:path";
import { capturePreservedSite } from "../preserve/capture.ts";
import { buildPreservedSite } from "../preserve/build.ts";
import { verifyPreservedSite } from "../preserve/verify.ts";
import { EXIT_CODES, type CommandResult } from "./types.ts";
import { acquirePathLock } from "../agent/artifacts.ts";

export async function runPreserve(root: string, opts: { dryRun?: boolean; signal?: AbortSignal; onLog?: (line: string) => void } = {}): Promise<CommandResult<{ previewReady: boolean }>> {
  if (opts.dryRun) return { ok: true, exitCode: EXIT_CODES.SUCCESS, summary: `[dry-run] Would preserve the original site and verify desktop/mobile fidelity at ${root}`, data: { previewReady: false } };
  let unlock: (() => void) | undefined;
  try {
    unlock = acquirePathLock(join(root, "preserved"));
    opts.signal?.throwIfAborted();
    if (!existsSync(join(root, "onboarding/preserve.json"))) await capturePreservedSite(root, opts);
    await buildPreservedSite(root);
    const report = await verifyPreservedSite(root, opts);
    return { ok: report.ok, exitCode: report.ok ? EXIT_CODES.SUCCESS : EXIT_CODES.GATES_FAILED,
      summary: report.ok ? "Preserved local preview verified. Publish the temporary URL with vitris deploy --environment preview." : "Preserve verification failed; inspect agent/reviews/preserve.json and repair preserved/ without changing the reference captures.",
      failures: report.failures, data: { previewReady: report.ok } };
  } catch (error) { return { ok: false, exitCode: opts.signal?.aborted ? EXIT_CODES.ABORTED : EXIT_CODES.GATES_FAILED, error: error instanceof Error ? error.message : String(error), data: { previewReady: false } }; }
  finally { unlock?.(); }
}
