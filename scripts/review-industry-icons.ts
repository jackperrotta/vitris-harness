/** Review artifacts only: source geometry remains in src/icons/. */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { icons, BASE_ICON_VARIANTS, renderIcon } from '../src/icons/index.ts';
import { industryIcons } from '../src/icons/industry.ts';
import { escapeHtml } from '../src/html.ts';

const label = process.argv[2] ?? 'current';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Use a simple review label.');
const out = resolve('artifacts/icons/industry-review', label);
await mkdir(out, { recursive: true });
const categories = [...new Set(industryIcons.map(icon => icon.category))];
const requested = process.argv.slice(3);
const browser = await chromium.launch({ headless: true });
const manifest: unknown[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1160, height: 1100 }, deviceScaleFactor: 1 });
  for (const category of categories.filter(category => !requested.length || requested.includes(category))) {
    const selected = icons.filter(icon => icon.category === category);
    const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const cards = selected.map(icon => `<article><h2>${icon.name}</h2><div class="canvases">${['light','dark'].map(canvas => `<div class="canvas ${canvas}"><div class="samples">${BASE_ICON_VARIANTS.map(variant => `<div>${renderIcon(icon.name, { variant })}<small>${variant}</small></div>`).join('')}</div></div>`).join('')}</div>${[16,24,32].map(size => `<div class="compact"><span>${size}px</span>${BASE_ICON_VARIANTS.map(variant => `<span style="--specimen-size:${size}px">${renderIcon(icon.name, { variant })}</span>`).join('')}</div>`).join('')}</article>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(category)} / ${label}</title><style>*{box-sizing:border-box}body{margin:0;padding:20px;color:#20352e;background:#f0f2ee;font:13px system-ui,sans-serif}header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px}h1{font-size:23px;margin:0}h2{font:13px ui-monospace,monospace;margin:0 0 12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}article{border:1px solid #cbd3cc;padding:14px;border-radius:8px;background:white}.canvases{display:grid;grid-template-columns:1fr 1fr;gap:10px}.canvas{padding:16px 8px;border-radius:5px}.light{background:#f9faf6;color:#20352e}.dark{background:#18251f;color:#f0f6ed}.samples{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.samples>div{text-align:center}svg{width:48px;height:48px;display:inline-block}small{display:block;font-size:9px;margin-top:8px}.compact{display:flex;align-items:center;gap:18px;margin-top:12px;color:#20352e}.compact svg{width:var(--specimen-size);height:var(--specimen-size)}.compact span{font-size:10px;color:#53675d}</style></head><body><header><h1>${escapeHtml(category)}</h1><span>${label} · ${selected.length} drawings · core variants · agent review artifact</span></header><div class="grid">${cards}</div></body></html>`;
    await page.setContent(html);
    await page.screenshot({ path: join(out, slug + '.png'), fullPage: true });
    await writeFile(join(out, slug + '.html'), html);
    manifest.push({category,screenshot:slug+'.png',icons:selected.map(icon=>({name:icon.name,sha256:createHash('sha256').update(JSON.stringify([icon.outline,icon.solid,icon.duotone])).digest('hex')}))});
  }
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2)+'\n');
  console.log(`Rendered ${manifest.length} categories to ${out}`);
} finally { await browser.close(); }
