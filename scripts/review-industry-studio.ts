/** Render authored industry families through the production SVG renderer. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { STUDIO_VARIANTS, renderIcon, getIcon, industryStudioReviews } from '../src/icons/index.ts';
import { industryStudioIconNames } from '../src/icons/studio-industry.ts';

const out = resolve('artifacts/icons/industry-studio-v5');
await mkdir(out,{recursive:true});
const browser = await chromium.launch({headless:true});
const manifest:unknown[]=[];
try {
  const page = await browser.newPage({viewport:{width:1280,height:920},deviceScaleFactor:1});
  for(const name of industryStudioIconNames) {
    const cards=STUDIO_VARIANTS.map(variant=>`<article><h2>${variant}</h2>${[16,24,32,48,64].map(size=>`<div class="specimen"><small>${size}px</small><span style="--size:${size}px">${renderIcon(name,{variant})}</span></div>`).join('')}<div class="specimen dark"><small>48px / dark</small><span style="--size:48px">${renderIcon(name,{variant})}</span></div><div class="specimen palette"><small>48px / palette</small><span style="--size:48px">${renderIcon(name,{variant})}</span></div></article>`).join('');
    const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${name} / studio review v5</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#f3f3ed;color:#243a30;font:14px system-ui,sans-serif}h1{font-size:28px;margin:0 0 10px}header p{margin:0 0 24px;color:#536259}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}article{padding:14px;background:white;border:1px solid #d5ddd3;border-radius:8px}h2{font:15px ui-monospace,monospace;margin:0 0 16px}.specimen{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:80px;padding:10px 14px;border-radius:5px}small{font-size:10px;color:#536259}svg{display:block;width:var(--size);height:var(--size)}.dark{margin-top:8px;background:#192a23;color:#f4f5ec}.dark small{color:#c5d0c6}.palette{margin-top:8px;background:#f1eadc;--icon-primary-color:#275d43;--icon-secondary-color:#dba53b;--icon-secondary-opacity:1}</style></head><body><header><h1>${name} / five authored families</h1><p>Agent visual-review artifact · Actual production renderer · 16/24/32/48/64px · Light, dark and Imprint palette</p></header><div class="grid">${cards}</div></body></html>`;
    await page.setContent(html);
    await page.screenshot({path:join(out,name+'.png'),fullPage:true});
    await writeFile(join(out,name+'.html'),html);
    manifest.push({name,category:getIcon(name)!.category,masters:Object.fromEntries(STUDIO_VARIANTS.map(variant=>[variant,createHash('sha256').update(getIcon(name)!.families![variant]!).digest('hex')])),screenshot:name+'.png'});
  }
  await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const sections=industryStudioIconNames.map(name=>{
    const review=industryStudioReviews[name]!;
    return `<section id="${name}"><h2>${name}</h2><p>${review.rationale}</p><p>${Object.entries(review.minSizes).map(([family,size])=>family+' '+size+'px+').join(' · ')}</p><p>${review.note}</p><a href="${name}.html"><img src="${name}.png" alt="${name}: five studio families, five sizes, light/dark and palette" loading="lazy"></a></section>`;
  }).join('');
  await writeFile(join(out,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vitris industry studio / v5 review</title><style>*{box-sizing:border-box}body{margin:0;padding:32px 4vw;background:#f3f3ed;color:#243a30;font:15px/1.6 system-ui,sans-serif}header{max-width:850px}h1{font-size:clamp(32px,5vw,54px);line-height:1.1}a{color:inherit}nav{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0}nav a{padding:8px 12px;border:1px solid #cbd3cc;background:white;border-radius:6px}section{border-top:1px solid #cbd3cc;margin-top:40px;padding-top:20px;max-width:1280px}img{display:block;width:100%;height:auto;border:1px solid #cbd3cc}</style></head><body><header><h1>Eight symbols. Five authored families.</h1><p>40 original industry studio masters, extending the original 16 core studio symbols. All 380 canonical names and existing core masters remain unchanged. Agent review, not human approval.</p><p>Inspect at actual site size; these additions recommend 24–32px or larger. Review sheets show 16/24/32/48/64px, dark and light surfaces, and the Imprint palette. Core controls should use a clearly legible core master.</p><a href="../gallery.html?variant=compare-studio&revision=industry-studio&palette=forest#solar-panel">Open interactive gallery / industry studio v5</a></header><nav aria-label="Symbols">${industryStudioIconNames.map(name=>`<a href="#${name}">${name}</a>`).join('')}</nav>${sections}</body></html>`);
  console.log(`Rendered ${manifest.length} industry studio specimens: ${out}`);
}finally{await browser.close()}
