import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {Buffer} from 'node:buffer';
import {type IncomingMessage,type ServerResponse,type RequestListener} from 'node:http';
import {ALL_THEME_ASSETS,assetByUrl,assetUrl,hostedAsset} from '../agent/theme-assets.ts';
import {VISUAL_THEMES,visualTheme,SUITE_RELEASE} from '../agent/theme-library.ts';
import {COMMISSIONS} from '../agent/theme-commissions.ts';
import {renderThemePicker as renderPicker,type PickerSite,type PickerScope} from '../agent/theme-picker.ts';
import {startThemeReviewServer as startServer} from '../agent/theme-review-server.ts';
import {createHash} from 'node:crypto';

// Historical UI mechanics use original MIT probe pixels and a verified hosted
// font. These are synthetic stand-ins, never original-media or visual-quality
// evidence. Frozen HTML identities and manifests are not changed.
const image=Buffer.from(readFileSync(new URL('../../design-system/calibration/v2/probe.png',import.meta.url)));
let fontPromise:Promise<Buffer>|undefined;
function fixtureFont(){return fontPromise??= (async()=>{const asset=hostedAsset('inter');if(!asset)throw Error('Missing hosted fixture font');const r=await fetch(asset.url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Fixture font unavailable');const bytes=Buffer.from(await r.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('Fixture font integrity failure');return bytes;})();}
const assets=Object.fromEntries(ALL_THEME_ASSETS.map(a=>[assetUrl(a.id),hostedAsset(a.id)?.url||(a.kind==='font'?hostedAsset('inter')!.url:'data:image/png;base64,'+image.toString('base64'))]));
// Keep this historical UI sweep on the original suite after hosted revisions advance.
const suiteIds=new Set<string>(COMMISSIONS.map(c=>c[0]));
export const legacyPickerScope:PickerScope={themes:VISUAL_THEMES.map(t=>suiteIds.has(t.id)?visualTheme(t.id,SUITE_RELEASE):t),includeArchive:true,assetUrls:assets};
export function renderLegacyPicker(sites:PickerSite[],session?:{token:string;origin:string},scope?:PickerScope){return renderPicker(sites,session,scope||legacyPickerScope);}
export async function startLegacyPickerServer(options:Parameters<typeof startServer>[0]){
 const result=await startServer({...options,scope:legacyPickerScope});
 const listeners=result.server.listeners('request') as RequestListener[];
 result.server.removeAllListeners('request');
 result.server.on('request',async(req:IncomingMessage,res:ServerResponse)=>{
  const asset=req.method==='GET'?assetByUrl(req.url||''):undefined;
  if(asset&&!hostedAsset(asset.id)){
   try{const bytes=asset.kind==='font'?await fixtureFont():image;res.writeHead(200,{'Content-Type':asset.kind==='font'?'font/ttf':'image/png','Content-Length':bytes.length});res.end(bytes);}catch{res.writeHead(503);res.end('Synthetic UI fixture unavailable');}return;
  }
  for(const listener of listeners)listener.call(result.server,req,res);
 });
 return result;
}
export const syntheticLegacyImageSha256=createHash('sha256').update(image).digest('hex');
