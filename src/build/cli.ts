#!/usr/bin/env node
import { join, resolve } from "node:path";
import { buildVerified } from "./verified.ts";
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1]; };
const root = resolve(arg("--site") || ".");
const out = resolve(arg("--out") || join(root, "dist"));
await buildVerified(root, out, arg("--backend-origin") || arg("--kernel-origin"), arg("--slug"));
console.log(`Built and verified local assets in ${out}`);
