#!/usr/bin/env node
import { resolve } from "node:path";
import { verifyPackage } from "../src/agent/package-verification.ts";
const index = process.argv.indexOf("--out");
console.log(JSON.stringify(verifyPackage(resolve(import.meta.dirname, ".."), index < 0 ? undefined : resolve(process.argv[index + 1]!)), null, 2));
