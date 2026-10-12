import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { compareArtifactPaths } from "./artifact-order.ts";

export type ArtifactEntry = { path: string; bytes: number; sha256: string };
export type ArtifactManifest = { schemaVersion: 1; files: ArtifactEntry[]; sha256: string };

export function artifactManifest(distDirectory: string): ArtifactManifest {
  const root = resolve(distDirectory);
  const files: ArtifactEntry[] = [];
  function walk(dir: string): void {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const rel = relative(root, full).replaceAll("\\", "/");
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error(`Symlink in publishable artifact: ${rel}`);
      if (stat.isDirectory()) { walk(full); continue; }
      if (!stat.isFile()) throw new Error(`Unsupported publishable artifact: ${rel}`);
      const bytes = readFileSync(full);
      files.push({ path: rel, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
  walk(root);
  files.sort((a, b) => compareArtifactPaths(a.path, b.path));
  const sha256 = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  return { schemaVersion: 1, files, sha256 };
}
