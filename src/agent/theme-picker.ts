import {renderThemePickerShell} from './theme-picker-shell.ts';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {VISUAL_THEMES,ARCHIVE_THEMES,THEME_RELEASE,digest} from './theme-library.ts';
import type {VisualTheme} from './theme-library.ts';
import {portableAssets,fontFaces,inlineAssets} from './theme-assets.ts';
import {ensureBrandContext,logoData,selectionStore,currentSelectionHash,type BrandContext} from './theme-selection.ts';
import {PICKER_RUNTIME} from './theme-picker-runtime.ts';
import {browseResults,FAMILIES,IDENTITIES,COLLECTIONS,INDUSTRIES} from './theme-browse.ts';
import {themeModel} from './theme-picker-model.ts';
import {manifestPages} from './theme-preview.ts';
import familySamples from './theme-family-samples.json' with {type:'json'};
import {CLOUD_CATALOG} from './theme-cloud.ts';
export {renderSpecimen} from './theme-preview.ts';
export type PickerSite={root:string;brand:BrandContext;test?:boolean};
export type PickerScope={themes:readonly VisualTheme[];includeArchive?:boolean;assetUrls?:Record<string,string>};
export const HOSTED_PICKER_THEMES=VISUAL_THEMES.filter(t=>CLOUD_CATALOG.entries.some(e=>e.theme.id===t.id&&e.theme.release===t.release));
export const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const jsonScript=(v:unknown)=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function renderThemePicker(sites:PickerSite[],session?:{token:string;origin:string},scope?:PickerScope):string {
 const catalog=scope?.themes||HOSTED_PICKER_THEMES;
 const archive=scope?.includeArchive===true?ARCHIVE_THEMES:[];

 const models=sites.map(site=>({brand:site.brand,brandHash:digest(site.brand),logo:logoData(site.root,site.brand),test:!!site.test,current:selectionStore(site.root)?.current||null,previousSelectionHash:currentSelectionHash(site.root),themes:catalog.map(t=>themeModel(site,t,!!session)),archiveThemes:archive.map(t=>themeModel(site,t,!!session))}));
 const options=(values:string[])=>values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
 return renderThemePickerShell({fontStyles:session?fontFaces(['inter']):inlineAssets(fontFaces(['inter'])),introHtml:`<p>Explore ${catalog.length} visual directions. Preview connected pages with your brand or the original palette. Hosted previews require an internet connection. All example businesses, prices and schedules are fictional.</p>`,collectionOptions:options(COLLECTIONS),release:THEME_RELEASE,scriptHtml:`<script>const models=${jsonScript(models)},session=${jsonScript(session||null)},vocabulary=${jsonScript({families:FAMILIES,identities:IDENTITIES,collections:COLLECTIONS,industries:INDUSTRIES,samples:familySamples})};const offlineAssets=${jsonScript(session?{}:(scope?.assetUrls??portableAssets(JSON.stringify(models))))};const browseResults=${browseResults.toString()};${PICKER_RUNTIME}</script>`});
}
export function writeThemePicker(root:string,out:string,test=false,scope?:PickerScope):string {mkdirSync(dirname(out),{recursive:true});writeFileSync(out,renderThemePicker([{root,brand:ensureBrandContext(root),test}],undefined,scope));return out;}

