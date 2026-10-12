#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fingerprint, json, save } from "../src/agent/artifacts.ts";
import { snapshotTree, COMPARISON_SNAPSHOT_PATHS } from "../src/agent/design-comparison.ts";
const arg = (key: string) => { const i = process.argv.indexOf(key); return i < 0 ? undefined : process.argv[i + 1]; };
const out = resolve(arg("--out") || "scratch/comparisons/latest");
if (process.argv.includes("--report")) {
  const comparison = json<{ sides: { label: string; paths: string[]; hash: string }[] }>(join(out, "comparison.json"));
  const labels = json<{ reviewer: string; preferred: string; reasons: string[]; criteria: Record<string, string> }>(join(out, "labels.json"));
  const stale = comparison.sides.some(s => s.hash !== fingerprint(join(out, s.label), s.paths));
  const criteria = ["businessFit", "coherence", "visualDiversity", "copy", "media", "functionality"];
  const labeled = !!labels.reviewer.trim() && ["A", "B", "tie", "neither"].includes(labels.preferred) && labels.reasons.some(r => r.trim()) && criteria.every(c => ["A", "B", "tie", "neither"].includes(labels.criteria[c] || ""));
  const judgePath = join(out, "judge-labels.json");
  const judge = existsSync(judgePath) ? json<typeof labels>(judgePath) : undefined;
  const judgeLabeled = judge && !!judge.reviewer?.trim() && ["A", "B", "tie", "neither"].includes(judge.preferred) && criteria.every(c => ["A", "B", "tie", "neither"].includes(judge.criteria?.[c] || ""));
  const calibration = !stale && labeled && judgeLabeled ? {
    comparisons: 1, preferenceAgreement: labels.preferred === judge.preferred,
    criterionAgreements: criteria.filter(c => labels.criteria[c] === judge.criteria[c]).length, criteria: criteria.length,
    falseAcceptance: labels.preferred === "neither" && ["A", "B"].includes(judge.preferred),
    note: "One comparison is descriptive evidence, not a reliable agreement rate."
  } : null;
  console.log(JSON.stringify({ status: stale ? "stale" : labeled ? "labeled" : "awaiting-human-review", labels, calibration }, null, 2));
  if (stale) process.exitCode = 1;
} else {
  if (!arg("--left") || !arg("--right")) throw new Error("Pass --left SITE --right SITE --out NEW_DIRECTORY");
  if (existsSync(out)) throw new Error("Comparison already exists; use a new output directory");
  const roots = [resolve(arg("--left")!), resolve(arg("--right")!)];
  for (const root of roots) {
    if (out === root || out.startsWith(root + "/") || out.startsWith(root + "\\")) throw new Error("Comparison must be outside both sites");
    if (!existsSync(join(root, "dist/index.html"))) throw new Error(`Build first: ${root}`);
  }
  const { randomInt } = await import("node:crypto");
  if (randomInt(2)) roots.reverse();
  const paths = COMPARISON_SNAPSHOT_PATHS;
  const sides = roots.map((root, index) => {
    const label = index ? "B" : "A", dest = join(out, label);
    snapshotTree(root, dest, paths);
    return { label, paths, hash: fingerprint(dest, paths) };
  });
  save(join(out, "comparison.json"), { version: 2, createdAt: new Date().toISOString(), sides });
  save(join(out, "operator-key.json"), Object.fromEntries(roots.map((root, i) => [i ? "B" : "A", root])));
  save(join(out, "labels.json"), { reviewer: "", preferred: "", reasons: [], criteria: { businessFit: "", coherence: "", visualDiversity: "", copy: "", media: "", functionality: "" } });
  save(join(out, "judge-labels.json"), { reviewer: "", preferred: "", reasons: [], criteria: { businessFit: "", coherence: "", visualDiversity: "", copy: "", media: "", functionality: "" } });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(out, "REVIEW.txt"), "Serve A/dist and B/dist locally and review both at phone and desktop widths.\nJudge the home and an interior page. Inspect copy and actions, not only screenshots.\nComplete labels.json using A, B, tie, or neither for each criterion and the overall preference.\nBusiness fit and coherence outrank novelty. Explain which sections support your preference.\nLeave operator-key.json closed until labeling. Site content may still reveal identity; this is randomized presentation, not guaranteed blinding.\nMachine checks and AI critics do not constitute your personal design approval.\n");
  console.log(`Comparison ready: ${out}`);
}
