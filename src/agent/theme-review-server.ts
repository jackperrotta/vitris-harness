import { createServer, type Server } from 'node:http';
import { randomBytes,createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderThemePicker, HOSTED_PICKER_THEMES, type PickerSite, type PickerScope } from './theme-picker.ts';
import { VISUAL_THEMES,LEGACY_THEMES,ARCHIVE_THEMES,THEME_RELEASE,SUITE_RELEASE,INDUSTRY_RELEASE } from './theme-library.ts';
import {manifestPages} from './theme-preview.ts';
import {assetByUrl,assetBytes,hostedAsset} from './theme-assets.ts';
import { previewByUrl,fullSiteByUrl } from './theme-preview.ts';
import {displaySite} from './theme-preview.ts';
import {CLOUD_CATALOG} from './theme-cloud.ts';
import {cloudThumbnailResource} from './theme-cloud-resources.ts';
import {thumbnailService} from './theme-thumbnails.ts';
import { ensureBrandContext, submitSelection, currentSelectionHash, selectionStore } from './theme-selection.ts';

export async function startThemeReviewServer(options: { sites: Array<{root: string;test?:boolean}>; port?: number; scope?:PickerScope }): Promise<{server: Server;url: string}> {
  const sites: PickerSite[]=options.sites.map(s=>({...s,root:realpathSync(resolve(s.root)),brand:ensureBrandContext(s.root)}));
  if(new Set(sites.map(s=>s.brand.siteId)).size!==sites.length)throw new Error('Duplicate site identity');
  const catalog=options.scope?.themes||HOSTED_PICKER_THEMES,archive=options.scope?.includeArchive?ARCHIVE_THEMES:[];
  const token=Buffer.from(randomBytes(32)).toString('hex');let origin='';const thumbnails=thumbnailService();
  const server=createServer(async(req,res)=>{
    // Text compression changes transfer bytes only; specimen identities hash the HTML before encoding.
    const endHtml=(html:string,headers:Record<string,string>)=>{const gzip=/\bgzip\b(?!\s*;\s*q=0(?:\.0+)?(?:\s|,|$))/.test(req.headers['accept-encoding']||'');res.writeHead(200,{...headers,Vary:'Accept-Encoding',...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(gzip?gzipSync(html):html);};
    const reply=(status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    if(req.headers.host!==new URL(origin).host){reply(403,{error:'Invalid host'});return;}
    if(req.method==='GET'&&req.url==='/api/library'){const pages=catalog.reduce((n,t)=>n+manifestPages(t).length,0);reply(200,{release:THEME_RELEASE,themes:catalog.length,pages,specimens:pages,suiteRelease:SUITE_RELEASE,suiteThemes:catalog.filter(t=>t.release===SUITE_RELEASE).length,industryRelease:INDUSTRY_RELEASE,industryThemes:catalog.filter(t=>t.release===INDUSTRY_RELEASE).length,archiveThemes:archive.length,legacyRelease:LEGACY_THEMES[0]!.release,legacyThemes:LEGACY_THEMES.length});return;}
    if(req.method==='GET'&&req.url?.startsWith('/thumbnail/cloud/')){const resource=cloudThumbnailResource(sites,catalog,req.url,displaySite);if(!resource){reply(404,{error:'Unknown hosted thumbnail identity'});return;}try{const bytes=await thumbnails.capture(resource,origin);res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);}catch{reply(503,{error:'Hosted thumbnail unavailable. Open the live page.'});}return;}
    if(req.method==='GET'&&req.url?.startsWith('/thumbnail/specimen/')){const resource=previewByUrl(sites,[...catalog,...archive],req.url.slice('/thumbnail'.length));if(!resource){reply(404,{error:'Unknown thumbnail identity'});return;}try{const bytes=await thumbnails.capture(resource,origin);res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});res.end(bytes);}catch{reply(503,{error:'Thumbnail unavailable. Open the live page.'});}return;}
    const sitePath=req.url?.split('?')[0];
    if(req.method==='GET'&&sitePath?.startsWith('/site/')){const html=fullSiteByUrl(sites,catalog,sitePath);if(!html){reply(404,{error:'Unknown full-site identity'});return;}const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>"'sha256-"+createHash('sha256').update(m[1]!).digest('base64')+"'").join(' ');endHtml(html,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Security-Policy':`default-src 'none'; script-src ${scripts}; style-src 'unsafe-inline'; img-src data: ${origin} ${CLOUD_CATALOG.origin}; font-src ${origin} ${CLOUD_CATALOG.origin}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`});return;}
    if(req.method==='GET'&&req.url?.startsWith('/specimen/')) {
      const resource=previewByUrl(sites,[...catalog,...archive],req.url);
      if(!resource){reply(404,{error:'Unknown or stale specimen identity. Return to the gallery and reopen the preview.'});return;}
      const scripts=[...resource.html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>"'sha256-"+createHash('sha256').update(m[1]!).digest('base64')+"'").join(' ');
      endHtml(resource.html,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; script-src ${scripts}; style-src 'unsafe-inline'; img-src data: ${origin} ${CLOUD_CATALOG.origin}; font-src ${origin} ${CLOUD_CATALOG.origin}; base-uri 'none'; form-action 'none'; frame-ancestors ${origin}`});return;
    }
    if(req.method==='GET'&&req.url?.startsWith('/theme-assets/')){const a=assetByUrl(req.url);if(!a){reply(404,{error:'Unknown asset identity'});return;}const hosted=hostedAsset(a.id);if(hosted){res.writeHead(302,{Location:hosted.url,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end();return;}let bytes:Uint8Array;try{bytes=assetBytes(a);}catch{reply(404,{error:"Archived asset is not included; use the hosted template library"});return;}res.writeHead(200,{'Content-Type':a.mime,'Content-Length':bytes.length,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*'});res.end(bytes);return;}
    if(req.method==='GET'&&['/','/index.html'].includes(new URL(req.url||'/',origin).pathname)) {
      // Re-read accepted choices on refresh; session capability remains process-scoped.
      for(const site of sites)site.brand=ensureBrandContext(site.root);
      endHtml(renderThemePicker(sites,{token,origin},options.scope),{'X-Theme-Release':THEME_RELEASE,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src 'self' ${CLOUD_CATALOG.origin}; img-src data: 'self' ${CLOUD_CATALOG.origin}; frame-src 'self' about: ${CLOUD_CATALOG.origin}; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`});return;
    }
    if(req.url!=='/api/selection'||req.method!=='POST'){reply(404,{error:'Not found'});return;}
    if(req.headers.origin!==origin||req.headers['x-theme-session']!==token||req.headers['content-type']!=='application/json'){reply(403,{error:'Invalid origin, session or content type'});return;}
    if(Number(req.headers['content-length']||0)>32000){reply(413,{error:'Choice too large'});req.resume();return;}
    const chunks: Uint8Array[]=[];let size=0;
    try {
      for await(const chunk of req){size+=chunk.length;if(size>32000){reply(413,{error:'Choice too large'});return;}chunks.push(chunk);}
      const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));const site=sites.find(s=>s.brand.siteId===value.siteId);
      if(!site)throw new Error('Wrong site');
      if(site.test&&value.source!=='test-simulation')throw new Error('Demo choices must be labeled test-simulation');
      const result=submitSelection(site.root,value);
      reply(200,{...result,current:selectionStore(site.root)!.current,currentSelectionHash:currentSelectionHash(site.root)});
    } catch(e){reply(409,{error:e instanceof Error?e.message:'Invalid selection'});}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  // Captures make loopback requests to this server. Close their browser first;
  // waiting for HTTP close before stopping it can deadlock active requests.
  const closeServer=server.close.bind(server);
  server.close=(callback?: (err?: Error)=>void)=>{void thumbnails.close().finally(()=>closeServer(callback));return server;};
  await new Promise<void>((ok,fail)=>{server.once('error',fail);server.listen(options.port??0,'127.0.0.1',()=>{const a=server.address();if(!a||typeof a==='string')return fail(new Error('No loopback address'));origin=`http://127.0.0.1:${a.port}`;ok();});});
  return {server,url:origin+'/'};
}
