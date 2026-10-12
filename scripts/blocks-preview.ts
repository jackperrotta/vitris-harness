#!/usr/bin/env node
/**
 * Build a static preview of every block into dist/blocks/.
 *   npm run blocks:preview     # write dist/blocks/index.html
 *   npm run blocks:serve       # also serve it on http://127.0.0.1:4173
 *
 * Each block renders from the `## Example` in its README (so the docs are guaranteed to compile),
 * once per documented variant. Media paths are swapped for inline placeholders.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync, unlinkSync } from "node:fs";
import { join, dirname, normalize, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { flattenBody } from "../src/compile/flatten.ts";
import { baseCss, siteIslands } from "../src/compile/site.ts";
import { primitivesCss } from "../src/compile/primitives.ts";
import { themeCss } from "../src/theme.ts";
import { defaultTheme, type Catalog, type CompiledPage } from "../src/types.ts";
import { loadBlockLibrary } from "../src/agent/jev/block-catalog.ts";
import { loadProfiledBlockLibrary } from "../src/blocks/library-profile.ts";
import { blockSourceHash, blockPreviewRendererHash } from "../src/blocks/metadata.ts";

const kernelRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const blocksRoot = join(kernelRoot, "blocks");
const argv = process.argv.slice(2);
const outIndex = argv.indexOf("--out");
const siteIndex = argv.indexOf("--site");
const siteRoot = siteIndex >= 0 && argv[siteIndex + 1] ? resolve(argv[siteIndex + 1]!) : undefined;
const installed = /(^|[/\\])node_modules([/\\]|$)/.test(kernelRoot);
const outRoot = outIndex >= 0 && argv[outIndex + 1]
  ? resolve(argv[outIndex + 1]!)
  : join(siteRoot || (installed ? process.cwd() : kernelRoot), "dist", "blocks");
const profiled = siteRoot ? loadProfiledBlockLibrary(kernelRoot, siteRoot) : undefined;
const library = new Map((profiled?.library || loadBlockLibrary(kernelRoot)).blocks.map(block => [block.id, block]));
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function imageStatus(id: string, dir: string, previewHtml: string): { status: "current" | "stale" | "unavailable"; manifest?: string } {
  const block = library.get(id);
  const rel = block?.meta?.evidence.previewManifest;
  if (!rel) return { status: "unavailable" };
  const file = join(dir, rel);
  if (!existsSync(file)) return { status: "unavailable" };
  try {
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    const valid = manifest.blockId === id && manifest.sourceHash === blockSourceHash(dir) && manifest.previewHtmlHash === sha(previewHtml)
      && manifest.rendererHash === blockPreviewRendererHash(kernelRoot)
      && ["mobile", "desktop"].every(kind => {
        const image = manifest.images?.[kind];
        return image?.file && existsSync(join(dirname(file), image.file)) && sha(readFileSync(join(dirname(file), image.file))) === image.hash;
      });
    return { status: valid ? "current" : "stale", manifest: rel };
  } catch { return { status: "stale", manifest: rel }; }
}

/** Self-contained placeholder so previews work without the kernel Worker or harvest media. */
function placeholder(w: number, h: number, label: string): string {
  const fs = Math.max(12, Math.round(Math.min(w, h) / 9));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cbbba9"/><stop offset="1" stop-color="#7a6756"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fs}" fill="#fff" opacity="0.7">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Replace `/media/...` and `/stock/...` image sources with sized placeholders. */
function placeholderMedia(html: string): string {
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    const src = tag.match(/\bsrc="([^"]*)"/)?.[1] ?? "";
    if (!/^\/(media|stock)\//.test(src)) return tag;
    const w = Number(tag.match(/\bwidth="(\d+)"/)?.[1] ?? 1200);
    const h = Number(tag.match(/\bheight="(\d+)"/)?.[1] ?? 900);
    const isLogo = /logo/i.test(src) || (w <= 240 && h <= 80);
    const isAvatar = /avatar|review|portrait-sm/i.test(src) || (w === h && w <= 160);
    const label = isLogo ? "logo" : isAvatar ? "" : `${w}×${h}`;
    const fill = isLogo ? placeholderLogo(w, h) : placeholder(w, h, label);
    return tag.replace(/\bsrc="[^"]*"/, `src="${fill}"`);
  });
}
function placeholderLogo(w: number, h: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="2" y="${h / 4}" width="${h / 2}" height="${h / 2}" rx="4" fill="#555"/><rect x="${h / 2 + 10}" y="${h / 2 - 5}" width="${w - h / 2 - 14}" height="10" rx="5" fill="#555"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function readmeExample(readme: string): string | null {
  const m = readme.match(/## Example\s*```html\s*([\s\S]*?)```/);
  return m ? m[1]!.trim() : null;
}
function readmeVariants(readme: string): string[] {
  const line = readme.match(/\*\*Variants:\*\*\s*(.+)/)?.[1]?.trim() ?? "";
  if (!line || line.startsWith("(none)")) return [];
  return line.split(",").map((v) => v.trim()).filter(Boolean);
}
function readmeLook(readme: string): string {
  return readme.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("```")) ?? "";
}

/** Add a `variant` attribute to the outer authoring tag of the example. */
function withVariant(example: string, name: string, variant: string): string {
  return example.replace(new RegExp(`^<${name}(\\s|>)`), `<${name} variant="${variant}"$1`);
}

const sharedCss = [themeCss(defaultTheme), baseCss, primitivesCss].join("\n");
const indexByCat = new Map<string, string[]>();
let total = 0;
const written = new Set<string>();
mkdirSync(outRoot, { recursive: true });

const cats = readdirSync(blocksRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const cat of cats) {
  const names = readdirSync(join(blocksRoot, cat), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const name of names) {
    const dir = join(blocksRoot, cat, name);
    if (!existsSync(join(dir, "template.html"))) continue;
    if (!library.has(`${cat}/${name}`)) continue;
    const catalog: Catalog = {
      [name]: {
        html: readFileSync(join(dir, "template.html"), "utf8"),
        css: readFileSync(join(dir, "styles.css"), "utf8"),
        island: existsSync(join(dir, "island.js")) ? readFileSync(join(dir, "island.js"), "utf8") : null,
      },
    };
    const readme = existsSync(join(dir, "README.md")) ? readFileSync(join(dir, "README.md"), "utf8") : "";
    const example = readmeExample(readme) ?? `<${name}><h2 slot="heading">${name}</h2><p>No example in README yet.</p></${name}>`;
    const variants = readmeVariants(readme);
    const look = readmeLook(readme);
    const id = `${cat}/${name}`;
    const record = library.get(id);

    const renders: { file: string; label: string; body: string }[] = [{ file: `${name}.html`, label: name, body: example }];
    for (const v of variants) renders.push({ file: `${name}--${v}.html`, label: `${name} · ${v}`, body: withVariant(example, name, v) });

    const destDir = join(outRoot, cat);
    mkdirSync(destDir, { recursive: true });
    let baseHtml = "";
    for (const r of renders) {
      const flat = flattenBody(placeholderMedia(r.body), catalog, { name: "Blocks Preview", motion: { strength: "off" } });
      const page: CompiledPage = {
        path: `/${cat}/${r.file}`,
        title: r.label,
        bodyHtml: flat.html,
        used: [name],
        usesMotion: false,
        usesLeadForm: /data-lead-form/.test(flat.html),
      };
      const js = siteIslands([page], catalog);
      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${cat}/${r.label}</title>
  <style>${sharedCss}\n${catalog[name]!.css}</style>
  <style>.bp-bar{position:fixed;inset-inline:0;bottom:0;z-index:999;display:flex;gap:1rem;align-items:center;padding:.4rem .9rem;font:12px/1.4 system-ui,sans-serif;color:#eee;background:#1d1a17;opacity:.9}.bp-bar a{color:#fff}.bp-bar span{color:#bbb}</style>
</head>
<body>
  ${flat.html}
  <div class="bp-bar"><a href="../index.html">← All blocks</a><strong>${cat}/${r.label}</strong><span>${look}</span></div>
  ${js.trim() ? `<script type="module">${js}</script>` : ""}
</body>
</html>`;
      const output = join(destDir, r.file);
      writeFileSync(output, html);
      if (r.file === `${name}.html`) baseHtml = html;
      written.add(output);
    }

    if (!indexByCat.has(cat)) indexByCat.set(cat, []);
    const variantLinks = variants.map((v) => `<a href="${cat}/${name}--${v}.html" class="badge badge--outline">${v}</a>`).join(" ");
    const image = imageStatus(id, dir, baseHtml);
    const roles = record?.meta?.fit.pageRoles.join("|") || cat;
    const jobs = record?.meta?.fit.visitorJobs.join("|") || look;
    const geometry = record?.geometry.join("|") || "";
    const mediaFit = record?.meta ? (record.meta.media.min > 0 ? "required" : "optional") : (record?.mediaRequired ? "required" : "optional");
    indexByCat.get(cat)!.push(
      `<li class="bp-item" data-role="${esc(roles)}" data-job="${esc(jobs)}" data-geometry="${esc(geometry)}" data-media="${mediaFit}"><div><a class="bp-item__name" href="${cat}/${name}.html">${esc(name)}</a><label class="bp-compare-label"><input type="checkbox" class="bp-compare" value="${cat}/${name}.html"> compare</label></div><span class="bp-item__look">${esc(look)}<small>Image evidence: ${image.status}; metadata: ${record?.metadataSource || "legacy-readme"}</small></span>${variantLinks ? `<span class="bp-item__variants">${variantLinks}</span>` : ""}</li>`,
    );
    total++;
  }
}

// Prune obsolete generated pages so old blocks and variants cannot appear current.
for (const cat of readdirSync(outRoot, { withFileTypes: true }).filter(d => d.isDirectory())) {
  const dir = join(outRoot, cat.name);
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (name.endsWith(".html") && !written.has(file) && statSync(file).isFile()) unlinkSync(file);
  }
}

const groups = [...indexByCat.entries()]
  .map(
    ([cat, items]) =>
      `<section class="bp-group" id="${cat}"><h2>${cat} <span class="bp-count">${items.length}</span></h2><ul class="bp-list">${items.join("\n")}</ul></section>`,
  )
  .join("\n");
const toc = [...indexByCat.keys()].map((cat) => `<a class="badge" href="#${cat}">${cat}</a>`).join(" ");
const geometryOptions = [...new Set([...library.values()].flatMap(b => b.geometry))].sort().map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
const roleOptions = [...new Set([...library.values()].flatMap(b => b.meta?.fit.pageRoles || [b.category]))].sort().map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
writeFileSync(
  join(outRoot, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Vitris blocks</title>
  <style>${sharedCss}
  .bp-head{padding-block:var(--space-8) var(--space-6);display:grid;gap:var(--space-4)}
  .bp-toc{display:flex;flex-wrap:wrap;gap:var(--space-2)}
  .bp-toc .badge{text-decoration:none}
  .bp-group{padding-block:var(--space-6);border-top:1px solid var(--color-border)}
  .bp-group h2{font-size:var(--step-2);margin-bottom:var(--space-4);display:flex;gap:.5rem;align-items:baseline}
  .bp-count{font-family:var(--font-body);font-size:var(--step-0);color:var(--color-muted);font-weight:500}
  .bp-list{list-style:none;margin:0;padding:0;display:grid;gap:var(--space-2)}
  .bp-item{display:grid;grid-template-columns:14rem 1fr auto;gap:var(--space-4);align-items:center;padding:var(--space-2) 0;border-bottom:1px dashed var(--color-border)}
  .bp-item__name{font-weight:600}
  .bp-item__look{color:var(--color-muted);font-size:var(--step-0)}
  .bp-item__variants{display:flex;gap:var(--space-1)}
  .bp-item__variants .badge{text-decoration:none;min-height:1.5rem;padding:0 .5rem;font-size:.75rem}
  .bp-item__look small{display:block;color:var(--color-muted);font-size:.75rem}
  .bp-compare-label{display:block;font:12px system-ui;color:var(--color-muted);margin-top:.3rem}
  .bp-filters{display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:end}
  .bp-filters label{display:grid;gap:.2rem;font:12px system-ui}
  .bp-filters input,.bp-filters select{min-height:2.5rem;padding:.3rem .5rem}
  .bp-compare-view{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3);margin-top:var(--space-4)}
  .bp-compare-view iframe{width:100%;height:650px;border:1px solid var(--color-border)}
  [hidden]{display:none!important}
  @media(max-width:719px){.bp-item{grid-template-columns:1fr}}
  </style></head>
  <body><main class="wrap"><header class="bp-head"><p class="eyebrow">Kernel block library</p><h1>Vitris blocks</h1><p class="lede">${total} blocks across ${indexByCat.size} categories, rendered from each block's README example with the default theme and placeholder media. Variant chips render the same example with <code>variant="…"</code>. Image evidence is marked unavailable or stale when no verified capture exists.</p><div class="bp-filters"><label>Find by job or name<input id="bp-search" type="search" placeholder="e.g. hours, credentials"></label><label>Page role<select id="bp-role"><option value="">Any role</option>${roleOptions}</select></label><label>Media<select id="bp-media"><option value="">Any</option><option value="optional">Works without essential media</option><option value="required">Requires media</option></select></label><label>Geometry<select id="bp-geometry"><option value="">Any</option>${geometryOptions}</select></label></div><div class="bp-toc">${toc}</div><div class="bp-compare-view" id="bp-compare-view" hidden></div></header>${groups}</main><script>
  const items=[...document.querySelectorAll('.bp-item')];
  const fields=['search','role','media','geometry'].map(id=>document.getElementById('bp-'+id));
  function filter(){const [search,role,media,geometry]=fields.map(x=>x.value.toLowerCase().trim());for(const item of items){const text=item.textContent.toLowerCase()+' '+item.dataset.job.toLowerCase();item.hidden=!!(search&&!text.includes(search)||role&&!item.dataset.role.toLowerCase().split('|').includes(role)||media&&item.dataset.media!==media||geometry&&!item.dataset.geometry.toLowerCase().split('|').includes(geometry));}for(const group of document.querySelectorAll('.bp-group'))group.hidden=![...group.querySelectorAll('.bp-item')].some(x=>!x.hidden);}
  fields.forEach(x=>x.addEventListener('input',filter));
  document.querySelectorAll('.bp-compare').forEach(box=>box.addEventListener('change',()=>{const selected=[...document.querySelectorAll('.bp-compare:checked')];if(selected.length>2){selected[0].checked=false;selected.shift();}const view=document.getElementById('bp-compare-view');view.hidden=!selected.length;view.innerHTML='';for(const item of selected){const frame=document.createElement('iframe');frame.title='Comparison: '+item.value;frame.src=item.value;view.append(frame);}}));
  </script></body></html>`,
);
console.log(`Wrote ${total} block previews to ${outRoot}`);

if (argv.includes("--serve")) {
  const portIdx = argv.indexOf("--port");
  const port = portIdx >= 0 ? Number(argv[portIdx + 1]) || 4173 : 4173;
  const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    let rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    if (rel.endsWith("/") || rel === "\\" || rel === "") rel = join(rel, "index.html");
    const file = join(outRoot, rel);
    if (!file.startsWith(outRoot) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Serving block previews at http://127.0.0.1:${port}/ (Ctrl+C to stop)`);
  });
}
