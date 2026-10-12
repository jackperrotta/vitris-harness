#!/usr/bin/env node
import { resolve } from "node:path";
import { gradeAll, gradeNode } from "../src/agent/grade.ts";
import { reviewSubject } from "../src/agent/evaluate.ts";
import { fingerprint } from "../src/agent/artifacts.ts";
const arg = (key: string) => { const i = process.argv.indexOf(key); return i < 0 ? undefined : process.argv[i + 1]; };
const root = resolve(arg("--site") || "."), node = arg("--node");
const paths: (string | undefined)[] = process.argv.flatMap((value: string, index: number) => value === "--hash" ? [process.argv[index + 1]] : []);
if (paths.length) {
  if (paths.some(p => !p || p.startsWith("--"))) throw new Error("Each --hash requires a relative artifact path");
  console.log(fingerprint(root, paths as string[]));
}
else if (process.argv.includes("--expand-packet")) {
  const expId = arg("--expand-packet")!;
  const manifestHash = arg("--manifest-hash");
  const { expandPacketItem } = await import("../src/agent/jev/packets.ts");
  console.log(expandPacketItem(root, node || "business-review", expId, manifestHash));
}
else if (process.argv.includes("--expand-design-context")) {
  const preparationId = arg("--preparation");
  const expansionId = arg("--expansion") || arg("--expand-design-context");
  if (!preparationId || !expansionId || expansionId.startsWith("--")) {
    throw new Error("Use --expand-design-context <ID> --preparation <PREP_ID> [--site PATH]");
  }
  const { expandDesignContextForPreparation } = await import("../src/agent/design-context-store.ts");
  const result = expandDesignContextForPreparation(root, preparationId, expansionId);
  if (!result.ok) {
    console.error(result.reason);
    process.exitCode = 1;
  } else {
    console.log(result.text);
  }
}
else if (process.argv.includes("--subject") && node) console.log(reviewSubject(root, node));
else {
  if (!node && !process.argv.includes("--all")) throw new Error("Use --node ID or --all [--site PATH] [--json]");
  const results = node ? [gradeNode(root, node)] : gradeAll(root);
  if (process.argv.includes("--json")) console.log(JSON.stringify(results, null, 2));
  else for (const r of results) console.log(`${r.skipped ? "HISTORICAL" : r.ok ? "PASS" : "FAIL"} ${r.node}\n${r.skipped || r.failures.join("\n")}`);
  process.exitCode = results.every(r => r.ok) ? 0 : 1;
}
