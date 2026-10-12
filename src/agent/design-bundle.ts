import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { copyTree } from "./design-copy.ts";
import { fingerprint, save } from "./artifacts.ts";

const PUBLIC_SKIP = /(^|[\\/])(agent[\\/](runs|run-history|reviews|screenshots|design-runs|request-history|requests)|onboarding[\\/]raw|\.env|credentials|adapter\.json|STATE\.json|CURRENT\.md|RUN\.lock)([\\/]|$)/i;
const LOCAL_HOST = /https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?/i;
const LOCAL_HOST_GLOBAL = /https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?/gi;

export type PublicBundleResult = {
  dest: string;
  index: string;
  candidates: { id: string; label: string; ok: boolean; failures: string[] }[];
  failures: string[];
};

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...listFiles(path));
    else out.push(path);
  }
  return out;
}

function posixRel(fromFile: string, target: string): string {
  let rel = relative(dirname(fromFile), target).replaceAll("\\", "/");
  if (!rel) rel = target.replace(/.*[/\\]/, "") || ".";
  if (!rel.startsWith(".") && !rel.startsWith("/")) rel = rel;
  return rel;
}

function resolveDistTarget(distRoot: string, urlPath: string): string {
  const clean = (urlPath.split(/[?#]/)[0] || "").replace(/^\//, "");
  const direct = join(distRoot, clean);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  const asIndex = join(distRoot, clean, "index.html");
  if (existsSync(asIndex)) return asIndex;
  const html = clean.endsWith(".html") ? direct : join(distRoot, `${clean}.html`);
  if (existsSync(html) && statSync(html).isFile()) return html;
  return direct;
}

function rewriteLocalToBundle(href: string, file: string, distRoot: string): { href: string; unsafe?: string } {
  try {
    const url = new URL(href);
    if (!/^(127\.0\.0\.1|localhost|0\.0\.0\.0)$/i.test(url.hostname)) return { href };
    const target = resolveDistTarget(distRoot, url.pathname);
    if (existsSync(target) && statSync(target).isFile()) {
      return { href: posixRel(file, target) + url.search + url.hash };
    }
    return { href: "", unsafe: href };
  } catch {
    return { href, unsafe: href };
  }
}

function rewriteResource(href: string, file: string, distRoot: string): { href: string; unsafe?: string } {
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#") || href.startsWith("data:")) return { href };
  if (LOCAL_HOST.test(href)) return rewriteLocalToBundle(href, file, distRoot);
  if (/^https?:/i.test(href)) return { href };
  if (href.startsWith("/")) return { href: posixRel(file, resolveDistTarget(distRoot, href)) };
  return { href };
}

function rewritePublicText(text: string, file: string, distRoot: string): { text: string; unsafe: string[] } {
  const unsafe: string[] = [];
  let next = text.replace(/(src|href)=["']([^"']+)["']/gi, (_match, attr: string, href: string) => {
    const rewritten = rewriteResource(href, file, distRoot);
    if (rewritten.unsafe) unsafe.push(rewritten.unsafe);
    return `${attr}="${rewritten.href}"`;
  });
  next = next.replace(/url\((['"]?)([^'")]+)\1\)/gi, (_match, quote: string, href: string) => {
    const rewritten = rewriteResource(href, file, distRoot);
    if (rewritten.unsafe) unsafe.push(rewritten.unsafe);
    const q = quote || '"';
    return `url(${q}${rewritten.href}${q})`;
  });
  return { text: next, unsafe };
}

function assetExists(root: string, href: string): boolean {
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#") || /^https?:/i.test(href) || href.startsWith("data:")) return true;
  const clean = href.split(/[?#]/)[0] || "";
  if (!clean) return true;
  const target = join(root, clean.replace(/^\//, ""));
  return existsSync(target);
}

export function verifyCompiledSiteIsolation(root: string): string[] {
  const errors: string[] = [];
  const files = listFiles(join(root, "dist")).filter(f => f.endsWith(".html") || f.endsWith(".css") || f.endsWith(".js"));
  if (!existsSync(join(root, "dist/index.html"))) errors.push("Bundle candidate missing dist/index.html");
  for (const file of files) {
    const rel = relative(root, file).replaceAll("\\", "/");
    if (PUBLIC_SKIP.test(rel)) errors.push(`Public bundle contains excluded path: ${rel}`);
    const text = readFileSync(file, "utf8");
    LOCAL_HOST_GLOBAL.lastIndex = 0;
    if (LOCAL_HOST_GLOBAL.test(text)) errors.push(`Localhost URL in public artifact: ${rel}`);
    LOCAL_HOST_GLOBAL.lastIndex = 0;
    if (/agent\/runs|request-history|adapter\.json|VITRIS_|BEGIN [A-Z ]*PRIVATE KEY/i.test(text)) {
      errors.push(`Secrets or operator logs in public artifact: ${rel}`);
    }
    if (file.endsWith(".html")) {
      for (const href of [...text.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(m => m[1]!)) {
        if (LOCAL_HOST.test(href)) errors.push(`Local navigation in ${rel}: ${href}`);
        else if (!assetExists(join(root, "dist"), href) && !href.startsWith("/") && !/^https?:|^mailto:|^tel:|^#|^data:/i.test(href)) {
          const fromPage = join(dirname(file), href.split(/[?#]/)[0]!);
          if (!existsSync(fromPage) && !existsSync(join(root, "dist", href.split(/[?#]/)[0]!))) {
            errors.push(`Missing bundled asset ${href} referenced from ${rel}`);
          }
        }
      }
    }
  }
  return errors;
}

export function buildPublicComparisonBundle(opts: {
  dest: string;
  runId: string;
  sites: { id: string; label: string; root: string; concept?: string; status: string }[];
}): PublicBundleResult {
  const dest = resolve(opts.dest);
  if (existsSync(join(dest, "bundle.json"))) throw new Error("Public comparison bundle already exists");
  mkdirSync(dest, { recursive: true });
  const candidates: PublicBundleResult["candidates"] = [];
  for (const site of opts.sites) {
    const side = join(dest, site.id);
    mkdirSync(side, { recursive: true });
    if (existsSync(join(site.root, "dist"))) copyTree(join(site.root, "dist"), join(side, "dist"));
    const distRoot = join(side, "dist");
    const unsafe: string[] = [];
    for (const file of listFiles(distRoot).filter(f => f.endsWith(".html") || f.endsWith(".css") || f.endsWith(".js"))) {
      const rewritten = rewritePublicText(readFileSync(file, "utf8"), file, distRoot);
      writeFileSync(file, rewritten.text);
      unsafe.push(...rewritten.unsafe);
    }
    const failures = [
      ...unsafe.map(url => `Unsafe localhost URL remains in public artifact: ${url}`),
      ...verifyCompiledSiteIsolation(side),
    ];
    if (!["complete", "preview_ready", "qualified"].includes(site.status)) {
      failures.push(`Candidate ${site.id} is ${site.status}; sketches and in-progress work are not finished public variants`);
    }
    candidates.push({ id: site.id, label: site.label, ok: failures.length === 0, failures });
  }
  const failures = candidates.flatMap(c => c.failures);
  const index = [
    "<!doctype html><meta charset=\"utf-8\"><title>Design comparison</title>",
    "<style>body{font-family:sans-serif;margin:24px}iframe{width:100%;height:70vh;border:1px solid #ccc}section{margin:0 0 32px}</style>",
    "<h1>Compiled local previews</h1>",
    "<p>These are static copies of working dist/ trees. They are not remote localhost iframes.</p>",
    ...candidates.map(c => {
      const label = escapeHtml(c.label);
      const id = escapeHtml(c.id);
      return `<section><h2>${label} (${id})</h2>${c.ok ? `<iframe src="${id}/dist/index.html" title="${label}"></iframe>` : `<p>Incomplete: ${escapeHtml(c.failures.join("; "))}</p>`}</section>`;
    }),
  ].join("\n");
  writeFileSync(join(dest, "index.html"), index);
  const manifest = {
    schemaVersion: 1,
    runId: opts.runId,
    public: true,
    localhostIframes: false,
    hash: fingerprint(dest, candidates.map(c => c.id)),
    candidates: candidates.map(c => ({ id: c.id, label: c.label, ok: c.ok, failures: c.failures })),
  };
  save(join(dest, "bundle.json"), manifest);
  return { dest, index: join(dest, "index.html"), candidates, failures };
}
