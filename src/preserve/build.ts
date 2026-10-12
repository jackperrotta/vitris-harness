import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { files, fingerprint, json, replacePath, save } from "../agent/artifacts.ts";
import { findHarnessRoot } from "../cli/root.ts";
import { connectForms } from '../forms/frontend.ts';
import { leadsJs } from "../runtime/leads.ts";
import { preserveRuntime } from './runtime.ts';
import { preserveConfig, type PreserveManifest } from "./config.ts";
import {iframeSources,readOnlyEmbedProvider,approvedEmbedUrl} from './embeds.ts';
import {preserveManifest} from './supplement.ts';

export async function buildPreservedSite(siteRoot: string, output = join(siteRoot, "dist")): Promise<void> {
  const root = resolve(siteRoot), out = resolve(output), source = join(root, "preserved");
  if (out === root || root.startsWith(out + sep) || ["preserved", "agent", "onboarding", "public", "pages", "components", "media", "theme", "artifacts"].some(p => out === join(root, p) || out.startsWith(join(root, p) + sep))) throw new Error("Preserve build output cannot overwrite site source");
  const config = preserveConfig(root);
  const manifest = preserveManifest(root);
  if (config.mode !== "preserve" || !["vitris-v1", "vitris-v2"].includes(manifest.adapter) || !manifest.pages.length) throw new Error("Missing preserve capture; run vitris run first");
  if (new URL(config.sourceUrl!).href !== manifest.sourceUrl) throw new Error("Source URL differs from the captured site; create a new preservation directory");
  files(source); // Reject symlinks, including files outside the site.
  const stage = `${out}.stage-${randomUUID()}`;
  mkdirSync(dirname(stage), { recursive: true }); cpSync(source, stage, { recursive: true });
  let backend = "";
  if (config.backendOrigin) {
    const url = new URL(config.backendOrigin);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("backendOrigin must be an HTTP(S) origin");
    backend = url.origin;
  }
  for (const file of files(stage).filter(f => f.endsWith(".html"))) {
    let html = readFileSync(file, "utf8");
    if (backend && config.forms?.length) {
      const path = manifest.pages.find(p => join(stage, p.file) === file)?.path || "/";
      html = connectForms(html, backend, path, config.forms);
      html = html.replace(/<\/head>/i, '<style>.c-lead-status:empty{display:none}</style></head>');
      html = html.replace(/<\/body>/i, '<script src="/_preserve/leads.js" defer></script></body>');
    }
    writeFileSync(file, html);
  }
  if (backend && config.forms?.length) writeFileSync(join(stage, "_preserve/leads.js"), leadsJs);
  writeFileSync(join(stage, '_preserve/runtime.js'), preserveRuntime);
  writeFileSync(join(stage, "robots.txt"), "User-agent: *\nDisallow: /\n");
  const rewrites = manifest.pages.filter(p => p.file.startsWith('_preserve/routes/')).map(p => `${p.path} /${p.file} 200`);
  if (rewrites.length) writeFileSync(join(stage, '_redirects'), rewrites.join('\n') + '\n');
  const connected = backend && config.forms?.length;
  const frameOrigins = [...new Set(files(stage).filter(f=>f.endsWith('.html')).flatMap(f=>iframeSources(readFileSync(f,'utf8')).filter(src=>readOnlyEmbedProvider(src)).map(src=>new URL(approvedEmbedUrl(src)!).origin)))];
  if (connected) frameOrigins.push('https://challenges.cloudflare.com');
  writeFileSync(join(stage, "_headers"), `/*\n  X-Robots-Tag: noindex, nofollow\n  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'${connected ? ' https://challenges.cloudflare.com' : ''}; connect-src 'self'${connected ? ' ' + backend + ' https://challenges.cloudflare.com' : ''}; frame-src ${frameOrigins.length ? frameOrigins.join(' ') : "'none'"}; object-src 'none'; base-uri 'self'; form-action 'self'${connected ? ' ' + backend : ''}\n`);
  // Prevent Pages from silently falling back to the homepage for missing routes.
  writeFileSync(join(stage, "404.html"), '<!doctype html><html><head><meta name="robots" content="noindex"></head><body><h1>Page not found</h1></body></html>');
  save(join(stage, "build-evidence.json"), { version: 1, mode: "preserve", compilerHash: fingerprint(findHarnessRoot(), ["src/preserve", "src/forms", "src/runtime/leads.ts", "src/compile/flatten.ts"]) });
  const previous = `${out}.previous-${randomUUID()}`;
  if (existsSync(out)) replacePath(out, previous);
  try { replacePath(stage, out); } catch (error) { if (existsSync(previous)) replacePath(previous, out); throw error; }
}
