import { BASE_SPECIMEN_CSS } from './theme-specimen-base.ts';
import { COMPOSITIONS } from './theme-compositions.ts';
import { fontFaces } from '../theme-assets.ts';
import { bindTheme,logoData } from '../theme-selection.ts';
import { visualTheme } from '../theme-library.ts';
import type { PickerSite } from '../theme-picker.ts';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function renderRelease2Specimen(site:PickerSite,id:string,example:'story'|'guide'):string {
 const t=visualTheme(id,'2026-10-08.2'),c=COMPOSITIONS[id]!,b=bindTheme(t,site.brand),logo=logoData(site.root,site.brand);
 const brand=`<span class="brand">${logo?`<img src="${logo}" alt="${esc(site.brand.name)}">`:`<span>${esc(site.brand.name)}</span>`}</span>`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.name)} · ${example==='story'?'main':'practical interior'} · ${t.release}</title><style>${fontFaces(c.fonts)}
${BASE_SPECIMEN_CSS.replaceAll('{{focus}}',b.tokens.colorFocus).replaceAll('{{accent}}',b.tokens.colorAccent).replaceAll('{{onAccent}}',b.tokens.colorAccentText).replaceAll('{{brandOriginal}}',b.brandAccent)}
${c.css}
@media(max-width:700px){header{flex-wrap:wrap}header>a{overflow-wrap:normal}.brand{max-width:180px;padding:6px 8px;flex-shrink:0}.brand img{max-width:155px;max-height:38px}.brand>span{font-size:15px}.specimen-footer{padding:22px 18px}.pair{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
</style></head><body data-release="${t.release}" data-theme="${t.id}" data-example="${example}">${(example==='story'?c.main:c.interior).replaceAll('{{logo}}',brand)}<footer class="specimen-footer"><strong>ILLUSTRATIVE ${example==='story'?'MAIN':'PRACTICAL INTERIOR'} / ${esc(t.name)} / ${t.release}</strong><span>Fictional content demonstrates visual relationships. Captured branding does not make this customer evidence. No enquiry is sent.</span><span>A design guide: your agent authors your actual content, routes and composition.</span></footer></body></html>`;
}
