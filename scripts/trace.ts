#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argFrom, hasFlag, runWorkflow } from "../src/agent/workflow.ts";

/**
 * Site-local Cursor chat trace control.
 * Equivalent go flags: --trace-start, --trace-stop, --trace-attach, --trace-summary, --trace-cleanup, --trace-status.
 */
const argv: string[] = process.argv.slice();
const hooksAt = argv.indexOf("cursor-hooks");
if (hooksAt >= 0) {
  const sub = argv[hooksAt + 1];
  if (sub === "install" || sub === "status" || sub === "remove") {
    argv.splice(hooksAt, 2, `--trace-hooks-${sub}`);
  }
}
const VERBS = new Set<string>(["start", "stop", "status", "summary", "attach", "cleanup"]);
const verb = argv.find((a: string) => VERBS.has(a));
const mapped = {
  start: "--trace-start",
  stop: "--trace-stop",
  status: "--trace-status",
  summary: "--trace-summary",
  attach: "--trace-attach",
  cleanup: "--trace-cleanup",
} as const;

if (verb && verb in mapped) {
  const idx = argv.indexOf(verb);
  argv.splice(idx, 1, mapped[verb as keyof typeof mapped]);
}

const hookFlag = ["--trace-hooks-install", "--trace-hooks-status", "--trace-hooks-remove"].find(flag => argv.includes(flag));
if (hasFlag(argv, "--help") || hasFlag(argv, "-h") || (!verb && !hookFlag)) {
  console.log(`Usage:
  node --experimental-strip-types scripts/trace.ts --site . start [--trace-label "pilot-1"]
  node --experimental-strip-types scripts/trace.ts --site . stop
  node --experimental-strip-types scripts/trace.ts --site . status
  node --experimental-strip-types scripts/trace.ts --site . attach PATH [--preparation ID] [--trace ID]
  node --experimental-strip-types scripts/trace.ts --site . summary [--trace ID]
  node --experimental-strip-types scripts/trace.ts --site . cleanup --trace ID
  node --experimental-strip-types scripts/trace.ts --site . cursor-hooks install
  node --experimental-strip-types scripts/trace.ts --site . cursor-hooks status
  node --experimental-strip-types scripts/trace.ts --site . cursor-hooks remove

Traces stay in agent/runs/traces/<traceId>/ and are off by default.
summary without --trace uses the active session, or the last stopped trace.
Pass --trace <id> when that pointer is missing or ambiguous.
Cursor hooks are opt-in, fail open, and write minimized events only while a trace is recording.
Do not scrape Cursor's database. Attach a UI-exported Markdown file instead.`);
  process.exit(verb || hookFlag ? 0 : 1);
}

const root = resolve(argFrom(argv, "--site") || ".");
const kernel = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.exitCode = (await runWorkflow({ root, kernel, argv, skipLock: true })).exitCode;
