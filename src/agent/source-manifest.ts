import { existsSync, readFileSync, lstatSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { AGENT_RUNTIME_HISTORY_ENTRIES } from "./kit-runtime.ts";

export const SOURCE_ROOTS = ["src", "scripts", "bin", "agent", "templates", "design-system", "migrations", "cloudflare", "docs", "package.json", "package-lock.json", "tsconfig.json", "wrangler.jsonc", "wrangler.templates.jsonc", "wrangler.forms-test.jsonc", "AGENTS.md", "README.md", ".github", ".gitignore", ".npmignore", ".dev.vars.example", "LICENSE", "NOTICE", "CONTRIBUTING.md", ".gitattributes", "licenses"];
// Portable source trees never traverse links or workstation archive bridges.
function sourceFiles(root: string, path: string): string[] {
  const name = relative(root, path).replaceAll("\\", "/");
  if (["bin/api", "bin/chunks", "bin/types", "bin/cloudflare"].includes(name)) return [];
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`Unexpected source link: ${name}`);
  return stat.isDirectory() ? readdirSync(path).sort().flatMap(name => sourceFiles(root, join(path, name))) : [path];
}
export function sourceManifest(root: string): { hash: string; files: { path: string; sha256: string; bytes: number }[] } {
  const entries = SOURCE_ROOTS.flatMap(p => existsSync(join(root, p)) ? sourceFiles(root, join(root, p)) : []).map(file => {
    const path = relative(root, file).replaceAll("\\", "/");
    if (path.startsWith("agent/") && AGENT_RUNTIME_HISTORY_ENTRIES.some(entry => path === `agent/${entry}` || path.startsWith(`agent/${entry}/`))) return undefined;
    // Bundled JS is checked separately as package bytes; source identity must survive a reproducible rebuild.
    if (path.startsWith("bin/") && path.endsWith(".js")) return undefined;
    const bytes = readFileSync(file);
    return { path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
  }).filter((entry): entry is {path: string; sha256: string; bytes: number} => Boolean(entry)).sort((a, b) => a.path.localeCompare(b.path, "en"));
  return { hash: createHash("sha256").update(JSON.stringify(entries)).digest("hex"), files: entries };
}
