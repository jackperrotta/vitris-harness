import {cloudEntry} from '../theme-cloud.ts';
import type {PickerSite} from '../theme-picker.ts';
import type {VisualTheme} from '../theme-library.ts';
import {bindTheme,logoData} from '../theme-selection.ts';
import {fontFaces} from '../theme-assets.ts';
import {INDUSTRY_SITES} from './registry.ts';
import {INDUSTRY_SCRIPT} from './interactions.ts';
import {esc} from './markup.ts';
import {INDUSTRY_BASE_CSS,SEVEN_LOCKUP_CSS} from './render-style.ts';
import type {IndustrySite,IndustryPage} from './types.ts';

const LOCKUP_CSS=`a.lockup{display:inline-flex;align-items:center;justify-content:center;min-width:0;max-width:min(42vw,168px);overflow:hidden;flex:0 1 auto;box-sizing:border-box;text-decoration:none}a.lockup img{display:block;width:auto;height:auto;max-width:100%;max-height:36px;object-fit:contain}a.lockup span{display:block;max-width:100%;overflow-wrap:anywhere;font:600 15px/1.2 var(--font-body)}header{overflow:visible;border-top:6px solid var(--brand-original)}header nav{min-width:0;flex-wrap:wrap}.demo-shell{margin:0;padding:7px 4vw;font:600 12px/1.4 var(--font-body);letter-spacing:.04em;text-transform:uppercase;background:var(--color-text);color:var(--color-bg);border-bottom:4px solid var(--brand-original)}:where(a.nl-btn,a.rf-go,a.pd-go,a.cg-go,a.nc-go,a.ms-go,a.pn-go,a.wh-go,a.ev-go,a.cp-go,a.id-go,button[data-next],button[data-save-day]){background:var(--color-accent);color:var(--color-accent-text)}select,input,textarea{max-width:100%}footer a{display:inline-block;margin:0 12px 8px 0}@media(max-width:480px){a.lockup{max-width:min(46vw,140px)}a.lockup img{max-height:32px}footer,.wh-foot,.cg-foot,.cp-foot,.ev-foot,.ro-foot,.pd-foot,.rf-foot,.ms-foot,.nl-foot,.id-foot{display:block;width:auto}footer a{display:block;overflow-wrap:anywhere}footer div{min-width:0;max-width:100%}main{max-width:100%;overflow-wrap:anywhere}svg{width:100%;height:auto}select,input,textarea{width:100%;min-width:0;box-sizing:border-box}}`;

export function industryLogo(site:PickerSite):string{
  const logo=logoData(site.root,site.brand);
  return logo?`<img src="${logo}" alt="${esc(site.brand.name)}">`:`<span>${esc(site.brand.name)}</span>`;
}

function rewrite(html:string,href:(id:string)=>string,roles:Map<string,string>):string{
  return html.replaceAll(/href="@([a-z0-9-]+)"/g,(_,id:string)=>{
    if(!roles.has(id))throw Error('Unknown industry link @'+id);
    return `href="${esc(href(id))}" data-page-id="${id}" data-page-role="${roles.get(id)}"`;
  });
}

/** Hash rendered bytes, which stay deterministic through TypeScript stripping and CLI bundling. */
export function industryDocumentEnvelope(spec:IndustrySite,page:IndustryPage,themeId:string,release:string,body:string,cssVars:string):string{
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(spec.business)} · ${esc(page.label)}</title><style>${fontFaces(spec.fonts)}${INDUSTRY_BASE_CSS}${spec.css}${spec.script?SEVEN_LOCKUP_CSS:LOCKUP_CSS}body{${cssVars}}</style></head><body data-theme="${esc(themeId)}" data-release="${esc(release)}" data-page-id="${esc(page.pageId)}" data-page-role="${esc(page.role)}" data-business="${esc(spec.business)}" data-industry="${esc(spec.industry)}"><a class="skip" href="#main">Skip to content</a><p class="demo-shell">Design example. Illustrative business. Nothing is sent.</p>${body}<script>${INDUSTRY_SCRIPT}${spec.script||''}</script></body></html>`;
}

export function renderIndustry(site:PickerSite,theme:VisualTheme,pageId:string,options:{links?:Record<string,string>;returnUrl?:string}={}):string{
  if(cloudEntry(theme.id))throw Error('Hosted template: use its Cloudflare preview URL');
  const spec=INDUSTRY_SITES[theme.id];
  if(!spec)throw Error('Unknown industry template '+theme.id);
  const page=spec.pages.find(p=>p.pageId===pageId);
  if(!page)throw Error('Unknown page '+theme.id+'/'+pageId);
  const binding=bindTheme(theme,site.brand);
  const href=(id:string)=>options.links?.[id]||'#'+id;
  const roles=new Map(spec.pages.map(p=>[p.pageId,p.role]));
  const resolveClearline=(html:string)=>html.replaceAll(/href="@([a-z0-9-]+)([?#][^"]*)?"/g,(_,id:string,suffix:string='')=>{if(!roles.has(id))throw Error('Unknown Clearline link @'+id);const base=href(id),url=new URL(base,'http://local.invalid/');if(suffix.startsWith('?')){const params=new URLSearchParams(suffix.split('#')[0]);for(const [key,value] of params)if(['zip','mode','service','bedrooms','bathrooms','hours','team','frequency','extras'].includes(key))url.searchParams.set(key,value);}if(suffix.includes('#'))url.hash=suffix.slice(suffix.indexOf('#'));const resolved=url.origin==='http://local.invalid'?(base.startsWith('/')?url.pathname:base.split(/[?#]/)[0])+url.search+url.hash:url.href;return `href="${esc(resolved)}" data-page-id="${id}" data-page-role="${roles.get(id)}"`;});
  const resolve=spec.id==='cleaning-clearline'?resolveClearline:(html:string)=>rewrite(html,href,roles);
  const main=resolve(page.html);
  const body=resolve(spec.renderBody({page,pages:spec.pages,href,logoHtml:industryLogo(site),brandName:site.brand.name,returnUrl:options.returnUrl,main}));
  const t=binding.tokens;
  const cssVars=`--color-bg:${t.colorBg};--color-text:${t.colorText};--color-muted:${t.colorMuted};--color-accent:${t.colorAccent};--color-accent-text:${t.colorAccentText};--color-surface:${t.colorSurface};--color-surface-2:${t.colorSurface2};--color-border:${t.colorBorder};--color-focus:${t.colorFocus};--brand-original:${binding.brandAccent};--font-body:${t.fontBody};--font-display:${t.fontDisplay};--radius:${t.radius};--max:${t.maxWidth}`;
  return industryDocumentEnvelope(spec.id==='electrical-current-and-craft'?{...spec,business:site.brand.name}:spec,page,theme.id,theme.release,body,cssVars);
}

