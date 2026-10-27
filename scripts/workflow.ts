#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argFrom, hasFlag, runWorkflow } from "../src/agent/workflow.ts";
import { handleDesignRunCommand } from "../src/agent/design-cli.ts";
import { creativeRunStatus, creativeRunStatusSnapshot, promoteCreativeRun, runCreativeProfile } from "../src/agent/creative-profile.ts";
import { isPreserveSite } from "../src/preserve/config.ts";
import { runSite } from "../src/cli/run.ts";
import { statusSite } from "../src/cli/status.ts";
import { persistSiteInputs, resolveSiteInputsLive, siteInputsFromArgv } from '../src/agent/site-inputs.ts';

const argv = process.argv;
if (argv.includes("--help")) {
  console.log("Usage: vitris-go --site DIR [--template ID] [--template-release RELEASE] [--content TEXT | --content-file FILE] [--prepare] [--status] [--once] [--creative-profile [--resume]]");
  process.exit(0);
}
if (hasFlag(argv, "--legacy-worker") || hasFlag(argv, "--worker") || Boolean(process.env.VITRIS_LEGACY_WORKER)) {
  console.error("External model worker mode (--legacy-worker, --worker, VITRIS_LEGACY_WORKER) is not supported. Vitris runs strictly in active-agent mode.");
  process.exit(1);
}
const workerNode = process.env.VITRIS_WORKER_NODE || process.env.VITRIS_TOOL_NODE;
if (workerNode) {
  console.log(`You are already the dispatched ${workerNode} worker. The active lock belongs to your parent runner (${process.env.VITRIS_RUNNER_PID}); it is expected, not a blocker. Do not invoke go, --prepare or --complete. Execute agent/CURRENT.md directly and return your result to the parent.`);
  process.exit(0);
}
const root = resolve(argFrom(argv, "--site") || "."), kernel = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const suppliedInputs = siteInputsFromArgv(argv);
if (Object.values(suppliedInputs).some(value => value !== undefined)) {
  if (['--complete', '--status', '--print-status', '--promote'].some(flag => argv.includes(flag))) throw Error('Supply template/content inputs when starting or preparing a run');
  persistSiteInputs(root, await resolveSiteInputsLive(suppliedInputs));
}
if (isPreserveSite(root)) {
  const result = hasFlag(argv, "--status") ? await statusSite({ site: root }) : await runSite({ site: root, creativeProfile: hasFlag(argv, "--creative-profile"), variants: argFrom(argv, "--variants"), theme: argFrom(argv, "--theme"), onLog: console.log });
  console.log(result.summary || result.error); process.exitCode = result.exitCode;
} else if (hasFlag(argv, "--creative-profile") || argFrom(argv, "--creative-run")) {
  if (hasFlag(argv, "--status") || hasFlag(argv, "--print-status")) {
    console.log(JSON.stringify(creativeRunStatusSnapshot(root, argFrom(argv, "--creative-run")) || { status: "not_started" }, null, 2));
  } else if (hasFlag(argv, "--promote")) {
    const target = creativeRunStatus(root, argFrom(argv, "--creative-run"));
    if (!target) throw new Error("No creative run to promote");
    const result = promoteCreativeRun(root, target.id);
    console.log(`Promoted selected source. Backup: ${result.backup}`);
  } else {
    const result = await runCreativeProfile(root, kernel, argv);
    console.log(result.summary);
    if (result.previewUrl) console.log(`Local preview: ${result.previewUrl}`);
    process.exitCode = result.exitCode;
  }
} else if (argFrom(argv, "--variants") || argFrom(argv, "--design-run") || hasFlag(argv, "--review") || hasFlag(argv, "--public-bundle")) {
  process.exitCode = await handleDesignRunCommand({ root, kernel, argv });
} else {
  process.exitCode = (await runWorkflow({ root, kernel, argv })).exitCode;
}
