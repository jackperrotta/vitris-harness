#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { sourceManifest } from "../src/agent/source-manifest.ts";
import { npmCliPath, runCommand, verifyPackage, fileDigest } from "../src/agent/package-verification.ts";
import { save } from "../src/agent/artifacts.ts";

const root = resolve(import.meta.dirname, "..");
const index = process.argv.indexOf("--out");
const out = index < 0 ? join(root, "artifacts/official-test", new Date().toISOString().replace(/[:.]/g, "-")) : resolve(process.argv[index + 1]!);
if (existsSync(out)) throw new Error("Use a new baseline directory; earlier checks and failures are retained");
mkdirSync(out, {recursive: true});
const source = sourceManifest(root), npm = npmCliPath();
// Source identity tracks file bytes, while workflow fixtures also use the
// presence of empty directories as state. Include them in the archive.
const emptyFixtureDirs: string[] = [];
function collectEmptyFixtureDirs(dir: string): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.length === 0) emptyFixtureDirs.push(relative(root, dir).replaceAll("\\", "/"));
  for (const entry of entries) if (entry.isDirectory()) collectEmptyFixtureDirs(join(dir, entry.name));
}
collectEmptyFixtureDirs(join(root, "src/test/fixtures"));
save(join(out, "source-manifest.json"), source);
const checks: { command: string; ok: boolean; durationMs: number; log: string }[] = [];
try {
  for (const script of ["typecheck", "build:cli", "test"]) {
    console.log(`Checking ${script}...`);
    const start = Date.now(), log = join(out, `${script.replace(":", "-")}.log`);
    try { runCommand(process.execPath, [npm, "run", script], root, log); }
    catch (error) { checks.push({command: script, ok: false, durationMs: Date.now() - start, log}); throw error; }
    checks.push({command: script, ok: true, durationMs: Date.now() - start, log});
  }
  console.log("Checking installed package...");
  const packaged = verifyPackage(root, join(out, "package"));
  if (sourceManifest(root).hash !== source.hash) throw new Error("Source changed during verification; baseline cannot be frozen");
  const list = join(out, "source-files.txt");
  writeFileSync(list, [...source.files.map(file => file.path), ...emptyFixtureDirs].join("\n") + "\n");
  const archive = join(out, "source.tar.gz");
  runCommand("tar", ["-czf", archive, "-C", root, "-T", list], root, join(out, "archive.log"));
  const restored = join(out, "restored-source"); mkdirSync(restored);
  runCommand("tar", ["-xzf", archive, "-C", restored], root);
  if (sourceManifest(restored).hash !== source.hash) throw new Error("Restored source archive differs from the verified source");
  console.log("Checking a fresh dependency install and restored-source suite...");
  runCommand(process.execPath, [npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"], restored, join(out, "restored-install.log"));
  for (const script of ["typecheck", "build:cli", "test"]) {
    const start = Date.now(), log = join(out, `restored-${script.replace(":", "-")}.log`);
    try { runCommand(process.execPath, [npm, "run", script], restored, log); }
    catch (error) { checks.push({command: `restored:${script}`, ok: false, durationMs: Date.now() - start, log}); throw error; }
    checks.push({command: `restored:${script}`, ok: true, durationMs: Date.now() - start, log});
  }
  if (sourceManifest(root).hash !== source.hash || sourceManifest(restored).hash !== source.hash) throw new Error("Source changed during restored-source checks");
  save(join(out, "baseline.json"), {version: 1, status: "ready_for_official_test", frozenAt: new Date().toISOString(), sourceHash: source.hash, archiveSha256: fileDigest(archive), packageSha256: packaged.packageSha256, node: process.version, checks: checks.map(check => ({...check, logSha256: fileDigest(check.log)})), designComparison: "unrun", humanPreference: "unlabeled", paidReviewCalls: 0});
  console.log(`Official test baseline ready: ${out}`);
} catch (error) {
  save(join(out, "baseline.json"), {version: 1, status: "verification_failed", sourceHash: source.hash, checks, error: error instanceof Error ? error.message : String(error)});
  throw error;
}
