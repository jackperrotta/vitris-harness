#!/usr/bin/env node
import { join, resolve } from "node:path";
import { json, type Direction } from "../src/agent/artifacts.ts";
import { directionRenderSubject } from "../src/agent/evaluate.ts";
import { renderStudySources } from "../src/agent/study-render.ts";

const i = process.argv.indexOf("--site"), root = resolve(i < 0 ? "." : process.argv[i + 1]!);
const direction = json<Direction>(join(root, "onboarding/direction.json"));
const result = await renderStudySources({
  root,
  studies: direction.studies,
  subjectHash: directionRenderSubject(root),
});
console.log(`Rendered ${result.checks.length} candidate/viewport studies`);
if (result.checks.some(c => c.failures.length)) process.exitCode = 1;
