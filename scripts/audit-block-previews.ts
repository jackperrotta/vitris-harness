#!/usr/bin/env node
/** Capture the structural block gallery at desktop and mobile widths for visual audit. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const previewRoot = join(root, "dist", "blocks");
const outputRoot = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]!
  : join(root, "scratch", "design-library-audit-2026-09-22");
if (!existsSync(join(previewRoot, "index.html"))) throw new Error("Run npm run blocks:preview first.");
const blocksRoot = join(root, "blocks");
const pages = readdirSync(blocksRoot, { withFileTypes: true }).filter(d => d.isDirectory())
  .flatMap(cat => readdirSync(join(blocksRoot, cat.name), { withFileTypes: true }).filter(d => d.isDirectory())
    .filter(block => existsSync(join(blocksRoot, cat.name, block.name, "template.html")))
    .map(block => ({ id: `${cat.name}/${block.name}`, file: join(previewRoot, cat.name, `${block.name}.html`) })));
const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();
const views = await Promise.all(([ ["mobile", 375], ["desktop", 1280] ] as const).map(async ([label, width]) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  return { label, width, context, page: await context.newPage() };
}));
const records: Array<{ id: string; sourceHash: string; images: Record<string, string>; failures: string[] }> = [];
mkdirSync(outputRoot, { recursive: true });
for (const item of pages) {
  const record = { id: item.id, sourceHash: createHash("sha256").update(readFileSync(item.file)).digest("hex"), images: {} as Record<string, string>, failures: [] as string[] };
  for (const { label, width, page } of views) {
    const onError = (e: Error) => record.failures.push(`${label}: ${e.message}`);
    page.on("pageerror", onError);
    try {
      await page.goto(pathToFileURL(item.file).href, { waitUntil: "load" });
      await page.evaluate(async () => { const doc = (globalThis as any).document; await doc.fonts.ready; await Promise.all([...doc.images].map((i: any) => i.decode().catch(() => {}))); });
      const height = Math.min(1400, await page.evaluate(() => { const doc = (globalThis as any).document; return Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight); }));
      const rel = `${item.id.replace("/", "--")}--${label}.png`;
      await page.screenshot({ path: join(outputRoot, rel), clip: { x: 0, y: 0, width, height }, animations: "disabled" });
      record.images[label] = rel;
    } catch (e) { record.failures.push(`${label}: ${String(e)}`); }
    page.off("pageerror", onError);
  }
  records.push(record);
  if (records.length % 20 === 0) console.log(`Captured ${records.length}/${pages.length}`);
}
await Promise.all(views.map(v => v.context.close()));
await browser.close();
const manifest = { schemaVersion: 1, generatedAt: new Date().toISOString(), browser: `Chromium ${browserVersion}`,
  source: "dist/blocks README structural previews with default theme and placeholder media", viewports: { mobile: 375, desktop: 1280 }, records };
writeFileSync(join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const cards = records.map(r => `<article><h2>${r.id}</h2><div><a href="${r.images.mobile}"><img src="${r.images.mobile}" loading="lazy" alt="Mobile ${r.id}"></a><a href="${r.images.desktop}"><img src="${r.images.desktop}" loading="lazy" alt="Desktop ${r.id}"></a></div>${r.failures.length ? `<p>${r.failures.join("; ")}</p>` : ""}</article>`).join("\n");
writeFileSync(join(outputRoot, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Block audit contact sheet</title><style>body{font:14px system-ui;background:#eee;color:#222;margin:2rem}article{background:#fff;margin:1rem 0;padding:1rem}h2{font-size:1rem}article div{display:grid;grid-template-columns:375px minmax(0,1fr);gap:1rem;align-items:start}img{display:block;width:100%;max-height:550px;object-position:top;object-fit:contain;border:1px solid #bbb}@media(max-width:800px){article div{grid-template-columns:1fr}}</style><h1>Vitris block audit: ${records.length} structural examples</h1><p>Placeholder media and default theme. Open an image for the full capture.</p>${cards}</html>`);
console.log(`Captured ${records.length} blocks to ${outputRoot}; ${records.reduce((n, r) => n + r.failures.length, 0)} failures.`);
