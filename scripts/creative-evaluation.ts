#!/usr/bin/env node
import { resolve } from "node:path";
import { freezeCreativeEvaluation, verifyCreativeEvaluation } from "../src/agent/creative-evaluation.ts";

const argv = process.argv;
const arg = (name: string) => { const i = argv.indexOf(name); return i < 0 ? undefined : argv[i + 1]; };
const values = (name: string) => argv.flatMap((value, i) => value === name && argv[i + 1] ? [argv[i + 1]!] : []);
const kernel = resolve(import.meta.dirname, "..");
const out = arg("--out");
if (!out) throw new Error("Pass --out NEW_DIRECTORY");
if (argv.includes("--verify")) {
  const result = verifyCreativeEvaluation(out, kernel);
  console.log(JSON.stringify({ ok: result.ok, failures: result.failures, attempts: result.protocol.attempts.length, humanLabels: result.protocol.humanLabels.length }, null, 2));
  if (!result.ok) process.exitCode = 1;
} else {
  const cases = values("--case").map(raw => {
    const match = /^([a-z][a-z0-9-]*):(image_rich|sparse_media):(.+)$/.exec(raw);
    if (!match) throw new Error(`Invalid --case ${raw}; use ID:image_rich:CAPTURE or ID:sparse_media:CAPTURE`);
    return { id: match[1]!, mediaProfile: match[2]! as "image_rich" | "sparse_media", capture: match[3]! };
  });
  const model = arg("--model"), host = arg("--host"), runs = Number(arg("--runs")), iterations = Number(arg("--iterations")), timeoutMs = Number(arg("--timeout-ms"));
  if (!model || !host) throw new Error("Pass --model and --host before freezing the comparison");
  const protocol = freezeCreativeEvaluation({
    kernel, out, model, host, cases, runsPerCaseArm: runs,
    limits: { iterations, timeoutMs, tokens: arg("--tokens") ? Number(arg("--tokens")) : null },
    reviewerConfigPath: arg("--reviewer"),
    permittedInterventions: arg("--interventions") ? arg("--interventions")!.split(",").filter(Boolean) : [],
    viewports: arg("--viewports") ? arg("--viewports")!.split(",").map(Number) : [375, 1080],
    efficiencyArms: argv.includes("--efficiency-arms"),
    cachePolicy: arg("--cache-policy") as "cold" | "warm" | undefined,
    promotionCriterion: arg("--promotion-criterion"),
  });
  console.log(JSON.stringify({ frozen: true, cases: protocol.cases.map(item => item.id), attempts: protocol.attempts.length, out: resolve(out), humanLabels: protocol.humanLabels.length }, null, 2));
}
