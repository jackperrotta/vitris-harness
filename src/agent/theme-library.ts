import {cloudEntry,cloudReleases,CLOUD_CATALOG,releaseRank} from './theme-cloud.ts';
const STILL_FIELD_RELEASE=cloudReleases.stillField,CURRENT_CRAFT_RELEASE=cloudReleases.currentCraft,CLEARLINE_RELEASE=cloudReleases.clearline,FIELDWELL_RELEASE=cloudReleases.fieldwell,COPPER_RELEASE=cloudReleases.copper,RECORD_RELEASE=cloudReleases.record,ALONGSIDE_RELEASE=cloudReleases.alongside;
import { createHash } from 'node:crypto';
import type { ThemeTokens } from '../types.ts';
import { VISUAL_THEMES as OLD_THEMES,THEME_RELEASE as OLD_RELEASE } from './theme-library-legacy.ts';
import { COMMISSIONS } from './theme-commissions.ts';
import { COMPOSITIONS } from './theme-compositions.ts';
import { THEME_ASSETS,asset } from './theme-assets.ts';
import { BASE_SPECIMEN_CSS } from './theme-specimen-base.ts';
import {RELEASE2_THEMES} from './theme-library-release2.ts';
import {RELEASE3_THEMES} from './theme-release3/theme-library.ts';
import {suiteIdentityRoles} from './theme-suite-identity.ts';
import {suite} from './theme-suites.ts';
import {PAGE_ROLES,pageManifest} from './theme-suite-data.ts';
import {SUITE_CSS} from './theme-suite-style.ts';
import {identityRoles,type IdentityRoles} from './theme-identity.ts';
import {authoredLayoutRoles} from './theme-layout-roles.ts';
import {INDUSTRY_SITES} from './industry/registry.ts';
import {SEVEN_RELEASE,SEVEN_SITES} from './industry/seven/registry.ts';
import {sevenTheme} from './industry/seven/theme.ts';
import {ridgelineTheme,RIDGELINE_RELEASE} from './industry/ridgeline/theme.ts';
export const SUITE_RELEASE='2026-10-08.4';
export const INDUSTRY_RELEASE='2026-10-09.1';
/** Active catalog stamp. Preserved five-page directions keep SUITE_RELEASE on each record. */
/** Active catalog. SEVEN_RELEASE stays 2026-10-09.2 so existing directions keep their release and hashes. */
export const THEME_RELEASE=CLOUD_CATALOG.release||STILL_FIELD_RELEASE;
export const SPECIMEN_VERSION=4;
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const digest=(v:unknown):string=>createHash('sha256').update(typeof v==='string'?v:v instanceof Uint8Array?v:JSON.stringify(canonical(v))).digest('hex');
export type VisualTheme={id:string;release:string;name:string;description:string;tokens:ThemeTokens;principles:string[];image:string;motion:string;freedoms:string;brandRule:string;license:string;family?:string;geometry?:string;responsive?:string;studies?:string[];sources?:string[];neighbors?:string[];specimens?:{main:string;interior:string};assetIdentity?:string;fontAssets?:Array<{family:string;file:string;sha256:string;weights:string;licenseFile:string}>;semantic?:Omit<IdentityRoles,'tokens'|'accentCss'>&{authoredLayout:ReturnType<typeof authoredLayoutRoles>}};
export const LEGACY_THEMES:readonly VisualTheme[]=OLD_THEMES;
export {RELEASE2_THEMES};
export const ARCHIVE_THEMES:readonly VisualTheme[]=[...RELEASE3_THEMES,...RELEASE2_THEMES,...LEGACY_THEMES,...(CLOUD_CATALOG.history||[]).map(e=>e.theme)];
const family=(id:string)=>'"'+asset(id).family+'", '+asset(id).fallback;
const fresh:Record<string,string[]>={newspaper:['https://monocle.com/'],'literary-essay':['https://thecreativeindependent.com/'],'immersive-exhibition':['https://press.stripe.com/'],'kinetic-type':['https://studiodumbar.com/work/cities-in-motion','https://studiodumbar.com/work/d-ad-2022'],'organic-studio':['https://afianco.ie/'],'art-deco':['https://www.sommerrohouse.com/','https://brand.sommerrohouse.com/identities/sommerro','https://brand.sommerrohouse.com/insights/colours-and-materials']};
// Historical source handles remain linked to their unchanged catalog records. Fresh scopes are in the research ledger.
const sourceUrls:Record<string,string>={big:'https://big.dk/','typography-ireland':'https://typography.ie/','field-studies-flora':'https://www.fieldstudiesflora.com/','on-air':'https://on-air.caricomassimo.org/','teenage-engineering':'https://teenage.engineering/','pocket-engineering':'https://pocketeng.co.nz/','gov-uk':'https://www.gov.uk/','good-and-common':'https://goodandcommon.com/','avery-review':'https://averyreview.com/',doc:'https://www.doc.cc/',vogelhaus:'https://www.vogel.haus/','sally-bliumis-dunn':'https://sallybliumisdunn.com/',r100:'https://www.r-100.no/',scullion:'https://scullion.ie/','perfumer-h':'https://www.perfumerh.com/',baggu:'https://baggu.com/','boc-studio':'https://boc.studio/','studio-gerosa':'https://www.studio-gerosa.it/',magazzino:'https://www.magazzino.art/visit','cactus-digitale':'https://cactusdigitale.com/','pangram-pangram':'https://pangrampangram.com/','te-oro':'https://teoro.org.nz/',oatly:'https://www.oatly.com/','index-space':'https://www.index-space.org/','production-type':'https://productiontype.com/','pest-stop-boys':'https://peststopboys.co.uk/','gohar-world':'https://gohar.world/',thyme:'https://www.thyme.co.uk/','stem-design':'https://stemdesign.com.au/','studio-bruch':'https://studiobruch.com/',luca:'https://luca.restaurant/','wilson-harle':'https://www.wilsonharle.com/',everyday:'https://everyday.io/',wwake:'https://wwake.com/',linear:'https://linear.app/',enginzyme:'https://enginzyme.com/'};
const SUITE_THEMES:readonly VisualTheme[]=COMMISSIONS.map(c=>{
 const [id,name,group,organization,display,body,geometry,image,studies,sources,neighbors,responsive]=c;
 const hosted=cloudEntry(id);if(hosted)return hosted.theme;
 const comp=COMPOSITIONS[id]!;
 if(!comp)throw Error('Missing authored composition '+id);
 const authored=suite(id),{tokens,accentCss,...semantic}=suiteIdentityRoles(id);
 return {id,release:SUITE_RELEASE,name,family:group,description:organization,tokens,semantic:{...semantic,authoredLayout:authoredLayoutRoles(id,{css:authored.css,pages:Object.fromEntries(PAGE_ROLES.map(role=>[role,authored[role]]))})},principles:[organization,geometry,'Typography: '+tokens.fontDisplay+' display with '+tokens.fontBody+' reading text; preserve hierarchy and deliberate measures.'],image,geometry,responsive,studies:studies.split(','),sources:[...sources.split(',').map(s=>sourceUrls[s]||s),...(fresh[id]||[])],neighbors:neighbors.split(','),motion:'The authored specimen is static and complete. Any optional motion must preserve its reading order, offer pause when persistent, and honor reduced motion.',freedoms:'Choose business-specific page architecture, section order, routes, media and visitor journeys. These relationships guide identity; neither specimen HTML nor its fictional business is a customer template.',brandRule:semantic.accentIntent+' Keep original logo bytes and aspect ratio. Exact customer color stays in the visible decorative key; a contrast-safe companion supports actions. Preserve the identity surface distribution.',license:'Original Vitris compositions and SVG drawings; local SIL OFL / Apache 2.0 fonts with bundled notices; pinned cleared photographs with source/credit records. Reference publisher assets and proprietary fonts are not included.',specimens:{main:digest([authored.home,authored.css,SUITE_CSS,BASE_SPECIMEN_CSS,suiteIdentityRoles(id),pageManifest(id)]),interior:digest([PAGE_ROLES.map(role=>authored[role]),authored.css,SUITE_CSS,BASE_SPECIMEN_CSS,suiteIdentityRoles(id),pageManifest(id)])},assetIdentity:digest(THEME_ASSETS),fontAssets:comp.fonts.map(id=>{const a=asset(id);return {family:a.family!,file:a.file,sha256:a.sha256,weights:a.weights!,licenseFile:a.licenseFile!};})};
});
const INDUSTRY_THEMES:readonly VisualTheme[]=Object.values(INDUSTRY_SITES).map(spec=>{
 const hosted=cloudEntry(spec.id);if(hosted)return hosted.theme;
 if(SEVEN_SITES[spec.id])return sevenTheme(spec,digest);
 if(spec.id==='construction-ridgeline-exteriors')return ridgelineTheme(spec,digest);
 const home=spec.pages.find(p=>p.compareRole==='home')!,detail=spec.pages.find(p=>p.compareRole==='detail')||spec.pages[1]!;
 // Preserve the original industry's neighbor identity when adding a later direction.
 const neighbors=Object.values(INDUSTRY_SITES).filter(s=>s.industry===spec.industry&&s.id!==spec.id&&s.id!=='real-estate-still-field').map(s=>s.name);
 return {id:spec.id,release:INDUSTRY_RELEASE,name:spec.name,family:spec.family,description:spec.summary,tokens:spec.tokens,semantic:{bodySize:spec.industry==='Home care'?'20px':'18px',mobileDisplay:'40px',readingMeasure:'62ch',spacing:spec.tokens.sectionY||'4rem',geometry:{controls:spec.tokens.radius,inputs:spec.tokens.radius,primaryPlane:spec.tokens.radiusLg,exceptions:spec.geometry},surfaceIntent:spec.summary,accentIntent:'Keep the exact customer color as a decorative key and use a contrast-safe companion for filled actions. '+spec.geometry,accentSelector:'header',accentProperty:'border-top-color',authoredLayout:authoredLayoutRoles(spec.id,{css:spec.css,pages:{home:home.html,detail:detail.html}})},principles:spec.principles,image:spec.image,geometry:spec.geometry,responsive:spec.responsive,studies:[],sources:['docs/plans/industry-template-library-plan-2026-10-09.md'],neighbors,motion:'Content is readable with motion off. Any poster motion is decorative and must honor reduced motion.',freedoms:'Transfer the design grammar: composition, type, navigation logic and the visitor task. Re-author routes, facts, people and media from the real business. Do not copy this demonstration sitemap or its fictional claims.',brandRule:'Original logo bytes and aspect stay. Exact customer color marks the header key. A readable companion fills primary actions.',license:'Original Vitris copy, SVG drawings and interactions. No publisher template components or imagery. Local SIL OFL fonts already bundled with the harness.',specimens:{main:digest([home.html,spec.css,spec.pages.map(p=>p.pageId+p.path)]),interior:digest([spec.pages.map(p=>p.pageId+p.html),spec.css])},assetIdentity:digest(['industry-svg',spec.id,spec.pages.map(p=>p.path)]),fontAssets:spec.fonts.map(id=>{const a=asset(id);return {family:a.family!,file:a.file,sha256:a.sha256,weights:a.weights!,licenseFile:a.licenseFile!};})};
});
export const VISUAL_THEMES:readonly VisualTheme[]=[...SUITE_THEMES,...INDUSTRY_THEMES,...CLOUD_CATALOG.entries.filter(e=>![...SUITE_THEMES,...INDUSTRY_THEMES].some(t=>t.id===e.theme.id)).map(e=>e.theme)];
/** Explicit historical membership by originating release; future additions cannot leak into these catalogs. */
const historicalRidgeline=ridgelineTheme(INDUSTRY_SITES["construction-ridgeline-exteriors"]!,digest);
function catalogAt(release:string):readonly VisualTheme[] {
 return VISUAL_THEMES.flatMap(theme=>{
  if(releaseRank(theme.release)<=releaseRank(release))return [theme];
  const archived=(CLOUD_CATALOG.history||[]).filter(e=>e.theme.id===theme.id&&releaseRank(e.theme.release)<=releaseRank(release)).sort((a,b)=>releaseRank(b.theme.release)-releaseRank(a.theme.release))[0];
  return archived?[archived.theme]:theme.id===historicalRidgeline.id&&releaseRank(historicalRidgeline.release)<=releaseRank(release)?[historicalRidgeline]:[];
 });
}
export const SEVEN_CATALOG:readonly VisualTheme[]=catalogAt(SEVEN_RELEASE);
export const RIDGELINE_CATALOG:readonly VisualTheme[]=catalogAt(RIDGELINE_RELEASE);
export const ALONGSIDE_CATALOG:readonly VisualTheme[]=catalogAt(ALONGSIDE_RELEASE);
export const RECORD_CATALOG:readonly VisualTheme[]=catalogAt(RECORD_RELEASE);
export const COPPER_CATALOG:readonly VisualTheme[]=catalogAt(COPPER_RELEASE);
export const FIELDWELL_CATALOG:readonly VisualTheme[]=catalogAt(FIELDWELL_RELEASE);
export const CLEARLINE_CATALOG:readonly VisualTheme[]=catalogAt(CLEARLINE_RELEASE);
export const CURRENT_CRAFT_CATALOG:readonly VisualTheme[]=catalogAt(CURRENT_CRAFT_RELEASE);
export const STILL_FIELD_CATALOG:readonly VisualTheme[]=catalogAt(STILL_FIELD_RELEASE);
export function visualTheme(id:string,release=THEME_RELEASE):VisualTheme {
 const hosted=cloudEntry(id,release);if(hosted)return hosted.theme;
 const list=release===THEME_RELEASE?VISUAL_THEMES:release===STILL_FIELD_RELEASE?STILL_FIELD_CATALOG:release===CURRENT_CRAFT_RELEASE?CURRENT_CRAFT_CATALOG:release===CLEARLINE_RELEASE?CLEARLINE_CATALOG:release===FIELDWELL_RELEASE?FIELDWELL_CATALOG:release===COPPER_RELEASE?COPPER_CATALOG:release===RECORD_RELEASE?RECORD_CATALOG:release===ALONGSIDE_RELEASE?ALONGSIDE_CATALOG:release===RIDGELINE_RELEASE?RIDGELINE_CATALOG:release===SEVEN_RELEASE?SEVEN_CATALOG:release===SUITE_RELEASE?SUITE_THEMES:release===INDUSTRY_RELEASE?INDUSTRY_THEMES.filter(t=>t.release===INDUSTRY_RELEASE):release==='2026-10-08.3'?RELEASE3_THEMES:release==='2026-10-08.2'?RELEASE2_THEMES:release===OLD_RELEASE?LEGACY_THEMES:[];
 const t=list.find(t=>t.id===id||t.name.toLowerCase()===id.toLowerCase())||(list.length?(CLOUD_CATALOG.history||[]).slice().reverse().find(e=>(e.theme.id===id||e.theme.name.toLowerCase()===id.toLowerCase())&&releaseRank(e.theme.release)<=releaseRank(release))?.theme:undefined);if(!t)throw Error('Unknown theme or release: '+id+' / '+release);return t;
}
export const themeHash=(t:VisualTheme)=>digest(t);
