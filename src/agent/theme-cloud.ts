import catalog from './theme-cloud.json' with {type:'json'};
import type {VisualTheme} from './theme-library.ts';
import type {BrowseMetadata} from './theme-browse.ts';
import type {ManifestPage} from './theme-page-manifest.ts';
import type {IndustrySite} from './industry/types.ts';
export type CloudEntry={theme:VisualTheme;browse:BrowseMetadata;business:string;audience:string;industry:string;fonts:string[];pages:Array<ManifestPage&{recipe:string}>;revision:string;base:string;sourceHash:string;thumbnails?:Record<string,Record<string,string>>};
export const CLOUD_CATALOG=catalog as unknown as {version:number;release?:string;origin:string;namespace:string;bucket:string;entries:CloudEntry[];history?:CloudEntry[];assets:any[]};
export const cloudEntry=(id:string,release?:string)=>[...CLOUD_CATALOG.entries,...(CLOUD_CATALOG.history||[])].find(e=>(e.theme.id===id||e.theme.name.toLowerCase()===id.toLowerCase())&&(!release||e.theme.release===release));
export const releaseRank=(release:string)=>{const [date,n]=release.split('.');return Number(date?.replaceAll('-',''))*1000000+Number(n);};
export const cloudReleases={stillField:'2026-10-09.10',currentCraft:'2026-10-09.9',clearline:'2026-10-09.8',fieldwell:'2026-10-09.7',copper:'2026-10-09.6',record:'2026-10-09.5',alongside:'2026-10-09.4'};
export function cloudSites():Record<string,IndustrySite>{return Object.fromEntries(CLOUD_CATALOG.entries.filter(e=>e.industry).map(e=>[e.theme.id,{id:e.theme.id,name:e.theme.name,business:e.business,audience:e.audience,summary:e.theme.description,industry:e.industry,family:e.browse.family,identities:e.browse.identities as IndustrySite['identities'],fonts:e.fonts,tokens:e.theme.tokens,css:'',image:e.theme.image,geometry:e.theme.geometry||'',responsive:e.theme.responsive||'',principles:e.theme.principles,pages:e.pages.map(p=>({...p,html:''})),renderBody:()=>{throw Error('This demonstration is hosted in Cloudflare: '+e.theme.id);}} as IndustrySite]));}
