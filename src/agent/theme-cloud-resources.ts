import {Buffer} from 'node:buffer';
import {cloudEntry} from './theme-cloud.ts';
import {digest,type VisualTheme} from './theme-library.ts';
import {logoData,normalizeBrandColor} from './theme-selection.ts';
import type {PickerSite} from './theme-picker.ts';
import type {PreviewResource,PreviewViewport} from './theme-preview.ts';
function displayQuery(site:PickerSite){
 const original=site.brand.colors.every(c=>c.source==='authored specimen palette');
 if(original)return '';
 const logo=logoData(site.root,site.brand),value={name:site.brand.name,colors:site.brand.colors.map(c=>normalizeBrandColor(c.value)).filter(Boolean),...(logo?{logo}:{})};
 return '?'+new URLSearchParams({b:Buffer.from(JSON.stringify(value)).toString('base64')});
}
export function cloudLinks(site:PickerSite,t:VisualTheme):Record<string,string>{const e=cloudEntry(t.id,t.release)!;return Object.fromEntries(e.pages.map(p=>[p.pageId,e.base+`/templates/demo/${e.revision}/${t.id}`+p.path+displayQuery(site)]));}
export function cloudPreview(site:PickerSite,t:VisualTheme,example:string,viewport:PreviewViewport):PreviewResource{
 const e=cloudEntry(t.id,t.release)!,key=example==='guide'&&t.id==='electrical-current-and-craft'?'ev':example==='guide'&&t.id==='cleaning-clearline'?'deep-cleaning':example;
 const p=e.pages.find(p=>p.pageId===key)||e.pages.find(p=>example==='story'?p.compareRole==='home':example==='guide'?p.compareRole==='detail':false);
 if(!p)throw Error('Unknown hosted template page '+t.id+'/'+example);
 const brandHash=digest(site.brand),id=digest([e.revision,t.id,p.pageId,brandHash,viewport]),url=e.base+`/templates/preview/${e.revision}/${t.id}/${p.pageId}/${viewport}/${id}`+displayQuery(site);
 return {id,url,html:'',release:t.release,themeId:t.id,brandHash,example,viewport};
}
export function cloudThumbnailPath(r:PreviewResource):string{return `/thumbnail/cloud/${r.themeId}/${r.brandHash}/${r.example}/${r.viewport}/${r.id}`;}
export function cloudThumbnailResource(sites:PickerSite[],themes:readonly VisualTheme[],url:string,display:(s:PickerSite,t:VisualTheme,m:'brand'|'original')=>PickerSite):PreviewResource|undefined{
 const m=url.match(/^\/thumbnail\/cloud\/([a-z0-9-]+)\/([a-f0-9]{64})\/([a-z0-9-]+)\/(desktop|mobile)\/([a-f0-9]{64})$/);if(!m)return;
 const t=themes.find(t=>t.id===m[1]);if(!t||!cloudEntry(t.id,t.release))return;
 for(const site of sites)for(const mode of ['brand','original'] as const){const shown=display(site,t,mode);if(digest(shown.brand)!==m[2])continue;const r=cloudPreview(shown,t,m[3]!,m[4] as PreviewViewport);if(r.id===m[5])return r;}
}
