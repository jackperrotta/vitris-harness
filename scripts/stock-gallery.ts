#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { readStockCatalog } from "../src/stock/library.ts";
import { stockPickerJs, stockPickerCss } from "../src/gen/stock.ts";
const root = resolve(import.meta.dirname,".."), arg = process.argv.indexOf("--out");
const out = resolve(arg < 0 ? join(root,"artifacts/stock/library.html") : process.argv[arg+1]!);
const catalog = readStockCatalog(join(root,"src/stock/catalog.json"));
const cache = relative(dirname(out),join(root,"artifacts/stock-library")).replaceAll("\\","/") + "/";
const accepted = catalog.items.filter(i=>i.status === "accepted");
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Vitris media library</title><style>${stockPickerCss}
body{background:#f2f0ea;color:#172521;font:16px system-ui;margin:0;padding:36px}h1{font-size:42px;letter-spacing:-1.5px;margin:8px 0}button{font:inherit;padding:10px 16px;cursor:pointer}header{max-width:900px}.stock-dialog{width:min(1360px,95vw);height:85vh;max-width:95vw}.stock-filters{display:flex;gap:18px;padding:14px}.stock-filters select{font:inherit;padding:6px}.stock-grid{grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}.stock-card img,.stock-card video{height:165px;object-fit:cover}.stock-card span{font-size:13px;line-height:1.5}#selection{max-width:700px;margin-top:24px}#selection img,#selection video{max-width:100%;max-height:400px}</style>
<header><small>VITRIS / MEDIA LIBRARY</small><h1>Images chosen with purpose.</h1><p>${accepted.filter(i=>i.kind==="image").length} photographs · ${accepted.filter(i=>i.kind==="video").length} videos. Search by subject, industry, layout role, image shape and space for text.</p><p>Customer logos, founders and real work stay distinct from stock illustration.</p><button id="images">Browse photographs</button> <button id="videos">Browse videos</button></header><div id="selection" aria-live="polite"></div>
<script>window.VitrisStock={catalog:${JSON.stringify(catalog).replaceAll("<","\\u003c")},base:new URL(${JSON.stringify(cache)},location.href).href};</script><script>${stockPickerJs}</script>
<script>const show=(kind)=>VitrisStock.open({kind,onSelect:(src,item)=>{const panel=document.getElementById('selection');panel.replaceChildren();const title=document.createElement('h2');title.textContent=item.id;const el=document.createElement(item.kind==='video'?'video':'img');el.src=VitrisStock.resolve(src);if(item.kind==='video'){el.controls=true;el.poster=VitrisStock.resolve(item.thumb);el.preload='metadata';}else el.alt=item.inspection.description;const p=document.createElement('p');p.textContent=item.inspection.description+' '+item.credit;panel.append(title,el,p);}});document.getElementById('images').onclick=()=>show('image');document.getElementById('videos').onclick=()=>show('video');</script></html>`);
console.log(out);
