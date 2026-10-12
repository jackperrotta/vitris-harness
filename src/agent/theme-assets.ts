import {CLOUD_CATALOG} from './theme-cloud.ts';
import assetMetadata from './theme-asset-metadata.json' with {type:'json'};
import { readFileSync,existsSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
type Asset={id:string;kind:string;file:string;mime:string;sha256:string;bytes:number;family?:string;weights?:string;style?:string;fallback?:string;source:string;license?:string;terms?:string;credit?:string;alt?:string;licenseFile?:string;licenseHash?:string};
const here=dirname(fileURLToPath(import.meta.url));
const assetRoot=[join(here,'theme-assets'),...Array.from({length:5},(_,i)=>join(here,...Array(i+1).fill('..'),'src/agent/theme-assets'))].find(p=>existsSync(join(p,'manifest.json')));
export const THEME_ASSETS=assetMetadata.suite as {version:number;release:string;assets:Asset[]};
// Keep the original manifest object unchanged: frozen suite definitions hash it.
const sevenRoot=join(assetRoot||join(here,'theme-assets'),'..','industry','seven','media');
const sevenAssets:Asset[]=assetMetadata.seven.assets;
const ridgelineRoot=join(assetRoot||join(here,'theme-assets'),'..','industry','ridgeline','media');
const ridgelineAssets:Asset[]=assetMetadata.ridgeline.assets;
export const ALL_THEME_ASSETS:readonly Asset[]=[...THEME_ASSETS.assets,...sevenAssets,...ridgelineAssets,...CLOUD_CATALOG.assets.filter(a=>![...THEME_ASSETS.assets,...sevenAssets,...ridgelineAssets].some(b=>b.id===a.id))];
export const hostedAsset=(id:string)=>CLOUD_CATALOG.assets.find(a=>a.id===id);
const bytesCache=new Map<string,Uint8Array>();
export function assetBytes(asset:Asset):Uint8Array {const prior=bytesCache.get(asset.id);if(prior)return prior;const root=ridgelineAssets.some(a=>a.id===asset.id)?ridgelineRoot:sevenAssets.some(a=>a.id===asset.id)?sevenRoot:assetRoot||join(here,'theme-assets');const file=join(root,asset.file);if(!existsSync(file)){if(hostedAsset(asset.id))throw Error('Asset is hosted in Cloudflare: '+asset.id);throw Error('Missing theme asset: '+asset.id);}const b=new Uint8Array(readFileSync(file));if(b.length!==asset.bytes||createHash('sha256').update(b).digest('hex')!==asset.sha256)throw Error('Theme asset integrity failure: '+asset.id);bytesCache.set(asset.id,b);return b;}
export function asset(id:string):Asset {const a=ALL_THEME_ASSETS.find(a=>a.id===id);if(!a)throw Error('Unknown theme asset '+id);return a;}
export const assetUrl=(id:string)=>{const a=asset(id);return '/theme-assets/'+a.sha256+'/'+a.file;};
export const assetByUrl=(url:string)=>ALL_THEME_ASSETS.find(a=>url===assetUrl(a.id));
export const fontFaces=(ids:string[])=>ids.map(id=>{const a=asset(id);const style=a.style==='italic'?'italic':'normal';return `@font-face{font-family:"${a.family}";src:url('${assetUrl(id)}') format('${a.mime==='font/woff2'?'woff2':'truetype'}');font-style:${style};font-weight:${a.weights};font-display:swap}`;}).join('\n');
export function inlineAssets(html:string):string {for(const a of ALL_THEME_ASSETS)if(html.includes(assetUrl(a.id))){const hosted=hostedAsset(a.id);html=html.replaceAll(assetUrl(a.id),hosted?hosted.url:'data:'+a.mime+';base64,'+Buffer.from(assetBytes(a)).toString('base64'));}return html;}
export const portableAssets=(referencedHtml?:string)=>Object.fromEntries(ALL_THEME_ASSETS.filter(a=>!referencedHtml||referencedHtml.includes(assetUrl(a.id))).map(a=>[assetUrl(a.id),hostedAsset(a.id)?.url||'data:'+a.mime+';base64,'+Buffer.from(assetBytes(a)).toString('base64')]));
