import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { buildSite, loadSiteDir } from "./index.ts";
import { files, fingerprint, json, replacePath, save, sourceHash, within, type Storyboard } from "../agent/artifacts.ts";
import { writeFileSync } from "node:fs";
import { isPreserveSite } from "../preserve/config.ts";
import { buildPreservedSite } from "../preserve/build.ts";
import type { PublicForm } from '../forms/config.ts';

export async function buildVerified(siteRoot: string, output = join(siteRoot, "dist"), origin?: string, slug?: string): Promise<void> {
  if (isPreserveSite(siteRoot)) return buildPreservedSite(siteRoot, output);
  const root = resolve(siteRoot), out = resolve(output);
  if (out === root || root.startsWith(out + sep)) throw new Error("Build output cannot contain site source");
  for (const path of ["pages", "components", "theme", "media", "public", "agent", "onboarding"]) {
    const source = join(root, path);
    if (out === source || out.startsWith(source + sep)) throw new Error("Build output cannot overwrite source directories");
  }
  const stage = out + `.stage-${Date.now()}-${process.pid}`;
  mkdirSync(dirname(stage), { recursive: true });
  const local = await loadSiteDir(root);
  if (slug) local.site = { ...local.site, slug };
  const launch = existsSync(join(root, "launch.json")) ? json<{ backendOrigin?: string; kernelOrigin?: string; publicOrigin?: string; forms?: PublicForm[] }>(join(root, "launch.json")) : {};
  await buildSite({ ...local, forms: launch.forms, kernelOrigin: origin || process.env.VITRIS_BACKEND_ORIGIN || process.env.KERNEL_ORIGIN || launch.backendOrigin || launch.kernelOrigin || "", publicOrigin: process.env.VITRIS_PUBLIC_ORIGIN || launch.publicOrigin, outDir: stage });
  for (const path of ["media", "public"]) {
    const source = within(root, path);
    if (!existsSync(source)) continue;
    files(source); // Reject symlinks before copying.
    if (path === "media") cpSync(source, join(stage, path), { recursive: true });
    else for (const file of files(source)) {
      const rel = file.slice(source.length + 1);
      if (existsSync(join(stage, rel))) throw new Error(`Public asset conflicts with compiled output: ${rel}`);
      mkdirSync(dirname(join(stage, rel)), { recursive: true });
      cpSync(file, join(stage, rel));
    }
  }
  const errors: string[] = [];
  const storyboardPath = join(root, "onboarding/storyboard.json");
  if (existsSync(storyboardPath)) {
    const plan = json<Storyboard>(storyboardPath);
    const redirectPath = join(stage, "_redirects");
    let redirects = existsSync(redirectPath) ? readFileSync(redirectPath, "utf8") : "";
    for (const route of plan.routes || []) {
      if (!["redirect", "consolidate"].includes(route.disposition) || !route.target) continue;
      const from = new URL(route.source).pathname.replace(/\/$/, "") || "/";
      if (!route.target.startsWith("/") || /\s/.test(from + route.target)) throw new Error("Invalid redirect contract");
      if (from === route.target) continue;
      const existing = redirects.split(/\r?\n/).find(line => line.trim().split(/\s+/)[0] === from);
      if (existing && existing.trim().split(/\s+/)[1] !== route.target) throw new Error(`Storyboard conflicts with public redirect: ${from}`);
      if (!existing) redirects += `\n${from} ${route.target} 301`;
    }
    if (redirects.trim()) writeFileSync(redirectPath, redirects.trim() + "\n");
  }
  for (const file of files(stage).filter(p => /\.(html|css)$/.test(p))) {
    const content = readFileSync(file, "utf8");
    const refs = file.endsWith(".html") ? [...content.matchAll(/(?:src|poster)=["']([^"']+)["']/g)].map(m => m[1]!) : [...content.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)].map(m => m[1]!);
    for (const ref of refs) {
      if (/^(https?:|data:|blob:|#|\/\/)/.test(ref)) continue;
      const path = ref.split(/[?#]/)[0]!;
      const target = within(stage, path.startsWith("/") ? path.slice(1) : join(dirname(file).slice(stage.length + 1), path));
      if (!existsSync(target)) errors.push(`Missing asset ${ref} in ${file}`);
    }
    if (file.endsWith(".html") && /<slot\b/.test(content)) errors.push(`Unresolved slots: ${file}`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  save(join(stage, "package-manifest.json"), { slug: local.site.slug || "", site: local.site });
  const kernelParent = resolve(import.meta.dirname, "..");
  const kernelSource = existsSync(join(kernelParent, "compile")) ? kernelParent : join(kernelParent, "src");
  save(join(stage, "build-evidence.json"), { version: 2, sourceHash: sourceHash(root), compilerHash: fingerprint(kernelSource, ["compile", "runtime", "forms", "theme.ts"]) });
  const previous = out + `.previous-${Date.now()}-${process.pid}`;
  if (existsSync(out)) replacePath(out, previous);
  try { replacePath(stage, out); }
  catch (error) { if (existsSync(previous)) replacePath(previous, out); throw error; }
}
