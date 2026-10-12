#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { files, fingerprint, json, save } from "../src/agent/artifacts.ts";
const arg = (key: string) => { const i = process.argv.indexOf(key); return i < 0 ? undefined : process.argv[i + 1]; };
const root = resolve(arg("--site") || ".");
const out = arg("--freeze");
if (out) {
  const dest = resolve(out);
  if (existsSync(dest)) throw new Error("Benchmark destination already exists; refusing to overwrite frozen evidence");
  if (dest.startsWith(root + "/") || dest.startsWith(root + "\\")) throw new Error("Snapshot must be outside source site");
  mkdirSync(dest, { recursive: true });
  const captureOnly = process.argv.includes("--capture-only");
  const paths = captureOnly ? ["onboarding/brief.json", "onboarding/copy", "onboarding/raw", "onboarding/stills", "media"] : ["pages", "components", "theme", "site.json", "onboarding", "media", "agent", "dist"];
  for (const p of paths) if (existsSync(join(root, p))) cpSync(join(root, p), join(dest, p), { recursive: true, dereference: false });
  save(join(dest, "benchmark.json"), { version: 2, kind: captureOnly ? "source-capture" : "site-result", frozenAt: new Date().toISOString(), source: root, hash: fingerprint(dest, paths), paths,
    feedback: arg("--feedback-file") ? json(resolve(arg("--feedback-file")!)) : [],
    referenceUrls: ["https://verdict-nextjs-template.vercel.app/", "https://apex-nextjs-template.vercel.app/", "https://munch-nextjs-template.vercel.app/"] });
  console.log(`Frozen benchmark: ${dest}`);
} else {
  const brief = json<{ pages: { title: string }[]; images: { role: string }[]; warnings: string[] }>(join(root, "onboarding/brief.json"));
  console.log(JSON.stringify({ pages: brief.pages.length, errorPages: brief.pages.filter(p => /page not found|404 error/i.test(p.title)).length,
    images: brief.images.length, downloaded: files(join(root, "media/harvest")).length, warningCount: brief.warnings.length, warnings: process.argv.includes("--details") ? brief.warnings : brief.warnings.filter(w => !/Excluded error page/.test(w)) }, null, 2));
}
