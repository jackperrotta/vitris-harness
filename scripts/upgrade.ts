#!/usr/bin/env node
import { upgradeSite } from "../src/cli/upgrade.ts";
const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const result = upgradeSite({ site: value("--site"), target: value("--target"), to: value("--to"),
  apply: args.includes("--apply"), rollback: args.includes("--rollback"), recover: args.includes("--recover") });
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.exitCode;
