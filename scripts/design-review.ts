#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startDesignReview } from "../src/agent/design-review-server.ts";
const i = process.argv.indexOf("--site");
const d = process.argv.indexOf("--design-run");
const p = process.argv.indexOf("--port");
const root = resolve(i < 0 ? "." : process.argv[i + 1]!);
const kernel = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runId = d < 0 ? undefined : process.argv[d + 1];
const port = p < 0 ? undefined : Number(process.argv[p + 1]);
const review = await startDesignReview({ parent: root, kernel, runId, port });
console.log(`Design comparison: ${review.url}`);
console.log("Live iframes plus Open preview. Leave feedback in Cursor; this page does not submit.");
await new Promise<void>(resolve => review.server.on("close", resolve));
