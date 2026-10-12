import {CLOUD_CATALOG} from './theme-cloud.ts';
import {createHash} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Buffer} from 'node:buffer';
import type {PreviewResource} from './theme-preview.ts';
const thumbnailPath=(resource:PreviewResource)=>join(tmpdir(),'vitris-theme-thumbnails-v4',createHash('sha256').update(JSON.stringify([4,resource.release,resource.themeId,resource.example,resource.viewport,resource.brandHash,resource.id])).digest('hex')+'.jpg');
export function cachedThumbnail(resource:PreviewResource):string|null {if(resource.url.startsWith('https://'))return null;const file=thumbnailPath(resource);return existsSync(file)?'data:image/jpeg;base64,'+Buffer.from(readFileSync(file)).toString('base64'):null;}
/** Actual local renderer captures; no model calls. Two workers, content-addressed cache. */
export function thumbnailService(){
 const dir=join(tmpdir(),'vitris-theme-thumbnails-v4');mkdirSync(dir,{recursive:true});
 let browser:Promise<any>|undefined,active=0,closed=false;const queue:Array<()=>void>=[],pending=new Map<string,Promise<Buffer>>();
 const acquire=async()=>{if(active>=2)await new Promise<void>(resolve=>queue.push(resolve));active++;};
 const release=()=>{active--;queue.shift()?.();};
 const capture=async(resource:PreviewResource,origin:string)=>{
  const key=createHash('sha256').update(JSON.stringify([4,resource.release,resource.themeId,resource.example,resource.viewport,resource.brandHash,resource.id])).digest('hex'),file=join(dir,key+'.jpg');
  const remote=resource.url.startsWith('https://'),source=remote?new URL(resource.url).origin:origin;
  if(closed)throw Error('Thumbnail service closed');if(!remote&&existsSync(file))return readFileSync(file);if(pending.has(key))return pending.get(key)!;
  const task=(async()=>{await acquire();let page:any;try{if(closed)throw Error('Thumbnail service closed');browser??=import('playwright').then(p=>p.chromium.launch());page=await (await browser).newPage({viewport:{width:resource.viewport==='mobile'?390:1440,height:900},reducedMotion:'reduce'});await page.route('**/*',(route:any)=>{const url=route.request().url();return url.startsWith(source+'/')||url.startsWith(CLOUD_CATALOG.origin+'/')||url.startsWith('data:')?route.continue():route.abort();});await page.goto(remote?resource.url:origin+resource.url,{waitUntil:'networkidle'});await page.evaluate('document.fonts.ready');const bytes=await page.screenshot({type:'jpeg',quality:76});if(!remote){const temp=file+'.tmp';writeFileSync(temp,bytes);renameSync(temp,file);}return bytes as Buffer;}finally{await page?.close();release();pending.delete(key);}})();pending.set(key,task);return task;
 };
 return {capture,close:async()=>{closed=true;if(browser)await(await browser).close();}};
}
