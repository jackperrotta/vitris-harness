#!/usr/bin/env node
/** Compatibility alias for the managed-kit portion of `vitris upgrade`. */
import { upgradeSite } from "../src/cli/upgrade.ts";

const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const opts = { site: value("--site"), target: value("--target"), to: value("--to") };
const planned = upgradeSite(opts);
if (!planned.ok || args.includes("--plan")) {
  console.log(JSON.stringify(planned, null, 2));
  process.exitCode = planned.exitCode;
} else {
  const applied = upgradeSite({ ...opts, apply: true });
  console.log(JSON.stringify(applied, null, 2));
  process.exitCode = applied.exitCode;
}
