import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { files } from "../agent/artifacts.ts";
import { parseSourceRevision, type SourceRevision } from "./contracts.ts";

/** Canonical authored inputs; previews, task packets, receipts, and Git metadata are derived. */
export const AUTHORITATIVE_INPUTS = [
  "pages", "components", "theme", "media", "public", "preserved", "onboarding", "site.json", "launch.json",
  "package.json", "package-lock.json", "agent/overrides", "agent/site-memory.json",
] as const;

export function sourceRevision(siteRoot: string): SourceRevision {
  const root = resolve(siteRoot);
  const inputs = AUTHORITATIVE_INPUTS.flatMap(path => {
    const full = join(root, path);
    return existsSync(full) ? files(full) : [];
  }).map(file => {
    const bytes = readFileSync(file);
    return { path: relative(root, file).replaceAll("\\", "/"), sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
  }).sort((a, b) => a.path.localeCompare(b.path, "en"));
  const digest = createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
  return parseSourceRevision({ schemaVersion: 1, digest, inputs });
}

export function changedSourceFiles(before: SourceRevision, after: SourceRevision): string[] {
  const prior = new Map(before.inputs.map(input => [input.path, input.sha256]));
  const current = new Map(after.inputs.map(input => [input.path, input.sha256]));
  return [...new Set([...prior.keys(), ...current.keys()])].filter(path => prior.get(path) !== current.get(path)).sort();
}
