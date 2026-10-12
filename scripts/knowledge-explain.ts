#!/usr/bin/env node
import { resolve } from "node:path";
import { explainStage } from "../src/knowledge/explain.ts";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const stage = arg("--stage") || "direction";
const root = resolve(arg("--site") || ".");
const explained = explainStage(root, stage);
console.log(explained.text);
