import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { json } from "./artifacts.ts";
import { argFrom, hasFlag } from "./workflow.ts";
import { createDesignRun, currentRunId, designRunStatus, exportPublicComparisonBundle, loadManifest, promoteFinal, restartDesignStage, runDesignCoordinator, runDir, submitFeedback } from "./design-run.ts";
import { startDesignReview } from "./design-review-server.ts";

export async function handleDesignRunCommand(opts: { root: string; kernel: string; argv: string[] }): Promise<number> {
  const { root, kernel, argv } = opts;
  if (hasFlag(argv, "--legacy-worker") || hasFlag(argv, "--worker") || Boolean(process.env.VITRIS_LEGACY_WORKER)) {
    console.error("External model worker mode (--legacy-worker, --worker, VITRIS_LEGACY_WORKER) is not supported. Vitris runs strictly in active-agent mode.");
    return 1;
  }
  const variants = argFrom(argv, "--variants");
  const wantsVariants = hasFlag(argv, "--variants");
  if (wantsVariants && variants && !variants.startsWith("-") && variants !== "5") throw new Error("Only --variants 5 is supported");
  let runId = argFrom(argv, "--design-run") || currentRunId(root);
  if (hasFlag(argv, "--status") || hasFlag(argv, "--print-status")) {
    if (!runId) throw new Error("Pass --design-run RUN_ID (or create a run with --variants 5)");
    if (existsSync(join(root, "agent/RUN.lock"))) {
      const lock = json<{ pid: number }>(join(root, "agent/RUN.lock"));
      let active = false;
      try { process.kill(lock.pid, 0); active = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      if (active) {
        console.log(JSON.stringify({ ...designRunStatus(root, runId), running: { pid: lock.pid, snapshot: true } }, null, 2));
        return 0;
      }
    }
    console.log(JSON.stringify(designRunStatus(root, runId), null, 2));
    return 0;
  }
  if (hasFlag(argv, "--review")) {
    if (!runId) throw new Error("Pass --design-run RUN_ID --review");
    const review = await startDesignReview({ parent: root, kernel, runId });
    console.log(`Design comparison: ${review.url}`);
    console.log("Live iframes plus Open preview. Leave feedback in Cursor; this page does not submit.");
    console.log("Agent context: GET /api/context and the vitris-design MCP (design_status, get_page_context).");
    await new Promise<void>(resolve => review.server.on("close", resolve));
    return 0;
  }
  if (hasFlag(argv, "--public-bundle")) {
    if (!runId) throw new Error("Pass --design-run RUN_ID --public-bundle [DEST]");
    const requested = argFrom(argv, "--public-bundle");
    const dest = requested && !requested.startsWith("-")
      ? resolve(requested)
      : join(runDir(root, runId), "public-bundle");
    const result = exportPublicComparisonBundle(root, runId, dest);
    console.log(result.index);
    if (result.failures.length) {
      console.error(result.failures.join("\n"));
      return 1;
    }
    return 0;
  }
  if (hasFlag(argv, "--promote")) {
    if (!runId) throw new Error("Pass --design-run RUN_ID --promote");
    const result = promoteFinal(root, runId);
    console.log(`Promoted final synthesis into the client root. Backup: ${result.backup}`);
    return 0;
  }
  if (argFrom(argv, "--restart-from") && runId) {
    if (!argFrom(argv, "--reason")) throw new Error("restart-from needs --reason explaining the new attempt budget");
    restartDesignStage(root, runId, argFrom(argv, "--restart-from")!, argFrom(argv, "--reason")!);
  }
  if (argFrom(argv, "--feedback")) {
    if (!runId) throw new Error("Pass --design-run RUN_ID --feedback FILE");
    const raw = JSON.parse(readFileSync(resolve(argFrom(argv, "--feedback")!), "utf8"));
    const submitted = submitFeedback(root, runId, raw);
    console.log(submitted.duplicate ? "Duplicate feedback ignored" : "Feedback accepted");
    console.log(submitted.summary);
    if (submitted.feedback.submission === "draft") return 0;
  }
  const theme = argFrom(argv, "--theme");
  const themeScope = argFrom(argv, "--theme-scope") === "all" ? "all" as const : argFrom(argv, "--theme-scope") === "one" ? "one" as const : undefined;
  if (wantsVariants) runId = createDesignRun(root, kernel, { theme, themeScope, conceptPreview: hasFlag(argv, "--concept-preview") }).runId;
  if (!runId) throw new Error("No design-run to resume; pass --variants 5 or --design-run RUN_ID --resume");
  if (theme && existsSync(join(runDir(root, runId), "manifest.json"))) {
    const manifest = loadManifest(root, runId);
    if (manifest.status === "preparing" || manifest.status === "planning") {
      const { save } = await import("./artifacts.ts");
      save(join(runDir(root, runId), "operator-request.json"), { mode: "build", theme, themeScope: themeScope || "one", themeScopeSource: themeScope ? "explicit" : "default" });
      const parentHasSite = existsSync(join(root, "pages")) || existsSync(join(root, "onboarding/direction.json"));
      if (!parentHasSite) save(join(root, "agent/request.json"), { mode: "build", theme });
    }
  }
  const result = await runDesignCoordinator(root, kernel, argv, { runId, theme });
  if (result.summary) console.log(result.summary);
  if (result.previewUrl) console.log(`Local preview: ${result.previewUrl}`);
  if (result.paused) {
    console.log(`Design-run ${result.manifest.runId} paused at ${result.manifest.status}`);
    if (result.manifest.status === "awaiting_design_feedback") {
      console.log(`Open comparison: npm.cmd run go -- --design-run ${result.manifest.runId} --review`);
      console.log("Leave feedback in Cursor. The comparison page is live iframes only.");
    }
    if (result.manifest.status === "concept_preview_ready") {
      console.log(`Continue from these qualified snapshots: npm.cmd run go -- --design-run ${result.manifest.runId} --resume`);
      console.log("Omit --concept-preview on resume. Expansion uses the exact qualified representatives.");
    }
  }
  else if (result.manifest.status === "final_preview_ready") console.log(`COMPLETE:final_preview_ready ${result.manifest.runId}`);
  else if (result.exitCode) console.log(`Design-run ${result.manifest.runId}: ${result.manifest.status}`);
  return result.exitCode;
}
