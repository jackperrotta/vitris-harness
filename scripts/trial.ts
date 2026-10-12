#!/usr/bin/env node
/** Resumable active-agent trials. No external author dispatch or fabricated outcome labels. */
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createTrialSession, advanceTrialSession, readTrialSession } from "../src/agent/trials.ts";
const argv = process.argv.slice(2);
const arg = (key: string) => { const i = argv.indexOf(key); return i < 0 ? undefined : argv[i + 1]; };
if (!arg("--out")) throw new Error("Pass --out SESSION_DIRECTORY with --capture FROZEN_SITE, --resume, or --status");
if (arg("--adapter")) throw new Error("Author CLI adapters are unsupported. Use the active agent; --reviewer snapshots an explicitly configured reviewer.");
const out = resolve(arg("--out")!);
const forwarded = ["--max-cumulative", "--max-cumulative-tokens", "--max-cumulative-duration-ms", "--timeout-ms"].flatMap(flag => arg(flag) ? [flag, arg(flag)!] : []);
if (argv.includes("--status")) {
  console.log(JSON.stringify(readTrialSession(out), null, 2));
} else {
  if (argv.includes("--resume") && arg("--jev-config")) throw new Error("Jev treatment is pinned at creation; do not pass --jev-config on resume");
  if (argv.includes("--resume") && arg("--site-policy")) throw new Error("Site policy is pinned at creation; do not pass --site-policy on resume");
  if (!argv.includes("--resume")) {
    if (!arg("--capture")) throw new Error("A new session requires --capture FROZEN_SITE");
    createTrialSession({ kernel: resolve(import.meta.dirname, ".."), capture: resolve(arg("--capture")!), out, runs: Number(arg("--runs") || 3), theme: arg("--theme"), workflowArgv: forwarded, sitePolicy: arg("--site-policy") ? JSON.parse(readFileSync(resolve(arg("--site-policy")!),"utf8")) : undefined, reviewer: arg("--reviewer") ? JSON.parse(readFileSync(resolve(arg("--reviewer")!), "utf8")) : undefined, jev: arg("--jev-config") ? JSON.parse(readFileSync(resolve(arg("--jev-config")!), "utf8")) : undefined });
  }
  const session = argv.includes("--prepare-only") ? readTrialSession(out) : await advanceTrialSession(out, {run: arg("--run") ? Number(arg("--run")) : undefined, intervention: arg("--intervention"), argv: forwarded});
  for (const run of session.results) {
    console.log(JSON.stringify({run: run.index, status: run.status, passed: run.passed, current: join(run.root, "agent/CURRENT.md"), historyEntries: run.history.length, metering: run.usage?.coverage || "unavailable"}));
  }
  console.log("For awaiting_agent: read that run's CURRENT.md, perform the stage, complete its preparation with the kernel go command --site RUN_ROOT, then resume this session. Do not restart failed trials as fresh successes.");
  if (session.results.some(r => ["inputs_changed", "blocked", "needs_repair"].includes(r.status))) process.exitCode = 1;
}
