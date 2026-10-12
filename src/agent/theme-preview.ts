import {cloudEntry,cloudReleases} from './theme-cloud.ts';
const STILL_FIELD_RELEASE=cloudReleases.stillField,CURRENT_CRAFT_RELEASE=cloudReleases.currentCraft,CLEARLINE_RELEASE=cloudReleases.clearline,FIELDWELL_RELEASE=cloudReleases.fieldwell,COPPER_RELEASE=cloudReleases.copper,RECORD_RELEASE=cloudReleases.record,ALONGSIDE_RELEASE=cloudReleases.alongside;
import {cloudLinks,cloudPreview} from './theme-cloud-resources.ts';
import { digest, visualTheme,SUITE_RELEASE,INDUSTRY_RELEASE,themeHash,type VisualTheme } from './theme-library.ts';
import { renderLegacySpecimen, type PickerSite } from './theme-legacy-specimens.ts';
import { renderCurrentSpecimen } from './theme-specimens.ts';
import {renderRelease2Specimen} from './theme-release2/specimens.ts';
import {renderCurrentSpecimen as renderRelease3Specimen} from './theme-release3/theme-specimens.ts';
import {renderSuite} from './theme-suite-renderer.ts';
import {type PageRole} from './theme-suite-data.ts';
import {legacyManifest,resolvePageKey,type ManifestPage} from './theme-page-manifest.ts';
import {INDUSTRY_SITES} from './industry/registry.ts';
import {renderIndustry} from './industry/document.ts';
// Published catalog records are immutable for the lifetime of this server.
// Avoid repeatedly canonicalizing the same large semantic guide for every page/viewport.
const previewThemeHashes=new WeakMap<VisualTheme,string>();
function previewThemeHash(t:VisualTheme){let hash=previewThemeHashes.get(t);if(!hash){hash=themeHash(t);previewThemeHashes.set(t,hash);}return hash;}
import {SEVEN_RELEASE} from './industry/seven/registry.ts';
import {RIDGELINE_RELEASE} from './industry/ridgeline/theme.ts';

export type Example = 'story'|'guide'|PageRole|string;
export const pageRole=(example:Example):PageRole=>example==='story'?'home':example==='guide'?'service-detail':example as PageRole;
const industryRelease=(release:string)=>release===INDUSTRY_RELEASE||release===SEVEN_RELEASE||release===RIDGELINE_RELEASE||release===ALONGSIDE_RELEASE||release===RECORD_RELEASE||release===COPPER_RELEASE||release===FIELDWELL_RELEASE||release===CLEARLINE_RELEASE||release===CURRENT_CRAFT_RELEASE||release===STILL_FIELD_RELEASE;
export function manifestPages(t:VisualTheme):ManifestPage[]{const hosted=cloudEntry(t.id,t.release);if(hosted&&hosted.theme.release===t.release)return hosted.pages;return industryRelease(t.release)?(INDUSTRY_SITES[t.id]?.pages.map(({html:_,...page})=>page)??[]):t.release===SUITE_RELEASE?legacyManifest(t.id):[];}
export function resolveExample(t:VisualTheme,example:string):ManifestPage|undefined{const pages=manifestPages(t);return pages.length?(t.id==='electrical-current-and-craft'&&example==='guide'?pages.find(p=>p.pageId==='ev'):t.id==='cleaning-clearline'&&example==='guide'?pages.find(p=>p.pageId==='deep-cleaning'):resolvePageKey(pages,example)):undefined;}
const pathRelease=(release:string)=>release===SEVEN_RELEASE||release===RIDGELINE_RELEASE||release===ALONGSIDE_RELEASE||release===RECORD_RELEASE||release===COPPER_RELEASE||release===FIELDWELL_RELEASE||release===CLEARLINE_RELEASE||release===CURRENT_CRAFT_RELEASE||release===STILL_FIELD_RELEASE;
export function fullSiteLinks(site:PickerSite,t:VisualTheme,v:PreviewViewport='desktop'):Record<string,string>{if(cloudEntry(t.id,t.release)&&cloudEntry(t.id,t.release)!.theme.release===t.release)return cloudLinks(site,t);const base=`/site/${t.release}/${t.id}/${digest(site.brand)}/${v}/${previewThemeHash(t)}`;return Object.fromEntries(manifestPages(t).map(p=>[p.pageId,pathRelease(t.release)?base+p.path:base+'/'+p.pageId]));}
const liveRelease=(release:string)=>release===SUITE_RELEASE||industryRelease(release);
export function fullSiteByUrl(sites:PickerSite[],themes:readonly VisualTheme[],url:string):string|undefined{
 if(!/^\/site\/[\w.-]+\/[\w-]+\/[a-f0-9]{64}\/(desktop|mobile)\/[a-f0-9]{64}\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(url))return;
 const [, ,release,id,brandHash,v,hash,...tail]=url.split('/'),t=themes.find(t=>t.id===id&&t.release===release&&themeHash(t)===hash);if(!t||!liveRelease(release!))return;
 const pageId=tail.join('/'),page=manifestPages(t).find(p=>pathRelease(t.release)?p.path==='/'+pageId||p.pageId===pageId:p.pageId===pageId);if(!page)return;
 for(const site of sites)for(const mode of ['brand','original'] as const){const shown=displaySite(site,t,mode);if(digest(shown.brand)===brandHash)return renderCatalog(shown,t,page.pageId,{links:fullSiteLinks(shown,t,v as PreviewViewport),returnUrl:'/?archive=current'});}
}
function renderCatalog(site:PickerSite,t:VisualTheme,pageId:string,options:{links?:Record<string,string>;returnUrl?:string}):string{
 if(industryRelease(t.release))return renderIndustry(site,t,pageId,options);
 return renderSuite(site,t,pageId as PageRole,options);
}
export type PreviewViewport = 'desktop'|'mobile';
/** Display-only palette. Selection always binds the original captured brand. */
export function displaySite(site:PickerSite,theme:VisualTheme,mode:'brand'|'original'):PickerSite {
 if(mode==='original'&&['hvac-fieldwell-comfort','cleaning-clearline','electrical-current-and-craft','real-estate-still-field'].includes(theme.id))return {...site,brand:{...site.brand,name:theme.id==='electrical-current-and-craft'?'Current & Craft Electrical':theme.name,logo:undefined,colors:[{value:theme.tokens.colorAccent,source:'authored specimen palette',confidence:'explicit'}],fallback:false}};
 return mode==='brand'?site:{...site,brand:{...site.brand,colors:[{value:theme.tokens.colorAccent,source:'authored specimen palette',confidence:'explicit'}],fallback:false}};
}
export function renderSpecimen(site: PickerSite,themeId:string,example:Example='story',release?:string):string {
 const oldExample=pageRole(example)==='home'?'story':'guide';
 if(release==='2026-10-08.1')return renderLegacySpecimen(site,themeId,oldExample);
 if(release==='2026-10-08.2')return renderRelease2Specimen(site,themeId,oldExample);
 if(release==='2026-10-08.3')return renderRelease3Specimen(site,themeId,oldExample);
 const theme=visualTheme(themeId,release),page=resolveExample(theme,example);
 if(cloudEntry(theme.id,theme.release)&&cloudEntry(theme.id,theme.release)!.theme.release===theme.release){const r=cloudPreview(site,theme,example,'desktop');return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hosted template</title></head><body><a href="${r.url.replaceAll('&','&amp;')}">Open ${theme.name} in Cloudflare</a></body></html>`;}
 if(!page)throw Error('Unknown page '+themeId+' / '+example);
 return renderCatalog(site,theme,page.pageId,{links:fullSiteLinks(site,theme),returnUrl:'/'});
}
export type PreviewResource={id:string;url:string;html:string;release:string;themeId:string;brandHash:string;example:Example;viewport:PreviewViewport};
const cache=new Map<string,PreviewResource>();
export function previewResource(site:PickerSite,theme:VisualTheme,example:Example,viewport:PreviewViewport):PreviewResource {
  if(cloudEntry(theme.id,theme.release)&&cloudEntry(theme.id,theme.release)!.theme.release===theme.release)return cloudPreview(site,theme,example,viewport);
  const brandHash=digest(site.brand),key=digest([site.root,previewThemeHash(theme),brandHash,example,viewport]);
  const prior=cache.get(key);if(prior)return prior;
  let content=liveRelease(theme.release)?renderSpecimen(site,theme.id,example,theme.release):renderSpecimen(site,theme.id,example,theme.release);
  // Preview readiness waits for decoded media. Native lazy images below a short frame
  // otherwise wait for scrolling that is unavailable until readiness. Standalone sites
  // retain lazy media, and preserved releases retain their original resource bytes.
  if(theme.release===SEVEN_RELEASE||theme.release===RIDGELINE_RELEASE||theme.release===ALONGSIDE_RELEASE||theme.release===RECORD_RELEASE||theme.release===COPPER_RELEASE||theme.release===FIELDWELL_RELEASE||theme.release===CLEARLINE_RELEASE||theme.release===CURRENT_CRAFT_RELEASE||theme.release===STILL_FIELD_RELEASE)content=content.replaceAll('loading="lazy"','loading="eager"');
  const current=theme.release!=='2026-10-08.1'&&theme.release!=='2026-10-08.2',id=digest([content,viewport,bridge('identity-placeholder',current)]);
  const url=`/specimen/${theme.release}/${theme.id}/${brandHash}/${example}/${viewport}/${id}`;
  const html=content.replace('</body>',`${bridge(id,current)}</body>`);
  const resource={id,url,html,release:theme.release,themeId:theme.id,brandHash,example,viewport};cache.set(key,resource);return resource;
}
export function previewByUrl(sites:PickerSite[],themes:readonly VisualTheme[],url:string):PreviewResource|undefined {
  if(!/^\/specimen\/[\w.-]+\/[\w-]+\/[a-f0-9]{64}\/[a-z0-9-]+\/(desktop|mobile)\/[a-f0-9]{64}$/.test(url))return;
  const [, ,release,id,brandHash,ex,v]=url.split('/'),theme=themes.find(t=>t.id===id&&t.release===release);if(!theme)return;
  if(!liveRelease(theme.release)&&!['story','guide'].includes(ex!))return;
  for(const site of sites)for(const mode of ['brand','original'] as const){const shown=displaySite(site,theme,mode);if(digest(shown.brand)!==brandHash)continue;const r=previewResource(shown,theme,ex as Example,v as PreviewViewport);if(r.url===url)return r;}
}
/** Trusted renderer code only. No customer scripts or same-origin privilege. */
function bridge(identity:string,current=false):string {
  const edge=current?`addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)return;const max=document.documentElement.scrollHeight-innerHeight;if((e.deltaY<0&&scrollY<=1)||(e.deltaY>0&&scrollY>=max-1))report('edge',{delta:e.deltaY,mode:e.deltaMode});},{passive:true});`:'';
  return `<style>html{overscroll-behavior:contain}</style><script>(()=>{const identity=${JSON.stringify(identity)},params=new URLSearchParams(location.hash.slice(1)),nonce=params.get('bridge'),origin=params.get('parent');let ready=false;const report=(kind,extra={})=>{if(parent!==window&&nonce&&origin)parent.postMessage({channel:'vitris-specimen-v1',identity,nonce,kind,...extra},origin);};addEventListener('click',e=>{const a=e.target.closest?.('a[data-page-id],a[data-page-role]');if(a&&parent!==window&&nonce&&origin){e.preventDefault();const pageId=a.dataset.pageId||a.dataset.pageRole;report('navigate',{role:pageId,pageId});}});addEventListener('vitris-remember',e=>{const d=e.detail||{};if(typeof d.key==='string')report('memory',{key:d.key,value:d.value});});const metrics=()=>({y:scrollY,height:document.documentElement.scrollHeight,viewport:innerHeight});const check=()=>{const body=document.body,r=body.getBoundingClientRect();if(r.width>0&&r.height>0&&body.innerText.trim().length>20){ready=true;report('ready',metrics());}else report('error',{message:'The preview document has no visible layout. Retry or open the full preview.'});};Promise.all([document.fonts.ready,...Array.from(document.images,i=>i.decode().catch(()=>null))]).then(check);addEventListener('scroll',()=>{if(ready)report('scroll',metrics());},{passive:true});${current?"new ResizeObserver(()=>{if(ready)report('resize',metrics());}).observe(document.body);":''}${edge}addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();report('close');}});addEventListener('message',e=>{const m=e.data;if(e.source!==parent||!m||m.channel!=='vitris-specimen-v1'||m.nonce!==nonce||m.identity!==identity)return;if(m.kind==='memory'&&typeof m.key==='string'){dispatchEvent(new CustomEvent('vitris-apply',{detail:{key:m.key,value:m.value}}));return;}if(m.kind!=='scroll-to'||!Number.isFinite(m.y))return;scrollTo({top:Math.max(0,Math.min(m.y,document.documentElement.scrollHeight-innerHeight)),behavior:'instant'});${current?"if(ready)report('scroll',metrics());":''}});})();</script>`;
}
