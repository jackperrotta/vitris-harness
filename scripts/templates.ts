#!/usr/bin/env node
import {readFileSync,writeFileSync,readdirSync,lstatSync,realpathSync,existsSync,mkdirSync,renameSync,unlinkSync} from 'node:fs';
import {join,resolve,relative,sep,dirname} from 'node:path';
import {sha,putVerified,r2Request} from './lib/template-r2.ts';
import {validateManifest} from '../src/agent/theme-page-manifest.ts';
import type {CloudEntry} from '../src/agent/theme-cloud.ts';
import {themeHash} from '../src/agent/theme-library.ts';
import {releaseRank} from '../src/agent/theme-cloud.ts';
import { validateTypography } from '../src/typography.ts';
import { verifyTemplateTypography } from '../src/agent/template-typography.ts';
import { renderCloudPage, type CloudManifest } from '../src/template-cloud/render.ts';
const argv=process.argv.slice(2),command=argv[0],arg=(key:string)=>argv[argv.indexOf(key)+1],origin=process.env.VITRIS_TEMPLATE_ORIGIN||'https://vitris-templates.jack-896.workers.dev';
const json=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const confined=(root:string,path:string)=>{const resolved=realpathSync(resolve(root,path));if(!resolved.startsWith(root+sep))throw Error('Bundle path escapes its staging directory');return resolved;};
async function pool<T>(items:T[],action:(item:T)=>Promise<void>){let next=0;await Promise.all(Array.from({length:4},async()=>{while(next<items.length)await action(items[next++]!);}));}
async function remoteCatalog(){
 // Transfer compression weakens the response ETag; If-Match requires the strong object validator.
 const r=await r2Request('GET','templates/catalog.json',undefined,undefined,{'accept-encoding':'identity'});
 if(!r.ok)throw Error('Remote catalog read failed');
 const etag=r.headers.get('etag');if(!etag||etag.startsWith('W/'))throw Error('Remote catalog needs a strong ETag for conditional publication');
 return {catalog:await r.json() as any,etag};
}
async function syncLocalCatalog(catalog:unknown){
 const local=resolve('src/agent/theme-cloud.json'),temp=local+'.tmp';writeFileSync(temp,JSON.stringify(catalog,null,2));
 for(let attempt=0;;attempt++){try{renameSync(temp,local);return;}catch(error){if(attempt>=4||!['EPERM','EACCES','EBUSY'].includes((error as any).code))throw error;await new Promise(r=>setTimeout(r,250));}}
}
export async function verifyEntry(entry:CloudEntry){
 const base=entry.base+`/templates/demo/${entry.revision}/${entry.theme.id}`;await pool(entry.pages,async page=>{const r=await fetch(base+page.path);if(!r.ok)throw Error(`Hosted route ${r.status}: ${page.path}`);const html=await r.text();if(!/<h1[\s>]/.test(html)||html.includes('/theme-assets/')||/__VITRIS_(?:PAGE|BRAND|LOGO|CSS|RETURN)/.test(html))throw Error('Incomplete hosted route '+page.path);});
}
if(command==='gallery'){
 const {startTemplateGallery}=await import('./template-gallery.ts');
 const port=argv.includes('--port')?Number(arg('--port')):4390;if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid gallery port');
 console.log('Default Cloudflare template gallery: '+(await startTemplateGallery(port)).url);
}else if(command==='publish'){
 if(!process.env.VITRIS_TEMPLATE_ORIGIN||!process.env.VITRIS_TEMPLATE_BUCKET)throw Error('Template publication requires your own VITRIS_TEMPLATE_ORIGIN and VITRIS_TEMPLATE_BUCKET');
 const raw=arg('--bundle');if(!argv.includes('--bundle')||!raw)throw Error('publish --bundle ABSOLUTE_STAGING_DIRECTORY');
 const root=realpathSync(resolve(raw));if(root===process.cwd()||root===resolve('src')||root===resolve('artifacts'))throw Error('Use a dedicated transient template bundle directory');
 const draft=json(join(root,'template.json')),entry=draft.entry as CloudEntry;
 if(!entry?.theme||!/^[a-z0-9-]+$/.test(entry.theme.id)||!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(entry.theme.release)||!entry.theme.tokens||!entry.browse||!entry.business)throw Error('Invalid template catalog metadata');
 validateManifest(entry.theme.id,entry.pages);
 const initial=await remoteCatalog();
 // Recover an interrupted local sync/cleanup only against the exact published snapshot.
 if(argv.includes('--resume')){
  const published=initial.catalog.entries.find((e:any)=>e.theme.id===entry.theme.id&&e.theme.release===entry.theme.release);
  if(!published?.sourceArchive||published.sourceHash!==themeHash(entry.theme))throw Error('Resume requires the exact already-published template');
  for(const p of entry.pages){const hosted=published.pages.find((v:any)=>v.pageId===p.pageId);const recipe=json(confined(root,draft.recipes[p.pageId]));if(!hosted||hosted.path!==p.path||hosted.recipe!==sha(JSON.stringify(recipe)))throw Error('Published recipe differs from staging: '+p.pageId);}
  if(published.pages.length!==entry.pages.length)throw Error('Published route count differs from staging');
  const response=await r2Request('GET',published.sourceArchive);if(!response.ok)throw Error('Published source archive unavailable');const archiveBytes=new Uint8Array(await response.arrayBuffer());
  if(published.sourceArchive!==`templates/archives/${sha(archiveBytes)}/manifest.json`)throw Error('Source archive integrity failure');
  const archive=JSON.parse(Buffer.from(archiveBytes).toString('utf8'));if(!Array.isArray(archive.files)||!archive.files.length)throw Error('Resume requires a complete file snapshot');
  for(const f of archive.files){const bytes=readFileSync(confined(root,f.path));if(bytes.length!==f.bytes||sha(bytes)!==f.sha256)throw Error('Staging changed after publication; retain it for review: '+f.path);}
  await verifyEntry(published);const latest=await remoteCatalog();if(!latest.catalog.entries.some((e:any)=>e.theme.id===entry.theme.id&&e.revision===published.revision&&e.sourceArchive===published.sourceArchive))throw Error('Published snapshot changed during resume');await syncLocalCatalog(latest.catalog);
  for(const f of archive.files){const bytes=readFileSync(confined(root,f.path));if(bytes.length!==f.bytes||sha(bytes)!==f.sha256)throw Error('Staging changed during resume; retain it for review: '+f.path);}
  for(const f of archive.files)unlinkSync(confined(root,f.path));
  console.log(JSON.stringify({published:entry.theme.id,resumed:true,revision:published.revision,pages:published.pages.length,sourceArchive:published.sourceArchive,localTemplateFilesRemoved:archive.files.length}));process.exit(0);
 }
 const activeRelease=initial.catalog.release||initial.catalog.entries.map((e:any)=>e.theme.release).sort((a:string,b:string)=>releaseRank(b)-releaseRank(a))[0];
 if(releaseRank(entry.theme.release)<=releaseRank(activeRelease))throw Error('New and revised templates require a release newer than the active catalog');
 const typeErrors=validateTypography(entry.theme.tokens.typography,true);if(typeErrors.length)throw Error(typeErrors.join('\n'));
 // Assets must already use immutable cloud addresses inside the authored page recipes.
 const assets=draft.assets||[];await pool(assets,async(a:any)=>{const file=confined(root,a.localFile),bytes=readFileSync(file);if(sha(bytes)!==a.sha256||bytes.length!==a.bytes)throw Error('Asset integrity failure '+a.id);const key=`templates/assets/${a.sha256}/${a.file}`;await putVerified(key,bytes,a.mime);a.url=origin+'/'+key;
  if(a.licenseFile){const license=readFileSync(confined(root,a.licenseLocalFile));if(sha(license)!==a.licenseHash)throw Error('Font license integrity failure');const key=`templates/objects/${sha(license)}/${a.licenseFile}`;await putVerified(key,license,'text/plain');a.licenseUrl=origin+'/'+key;}});
 const {chromium:typographyChromium}=await import('playwright');const typographyBrowser=await typographyChromium.launch();
 try {
  const manifest={...entry,version:1,id:entry.theme.id,release:entry.theme.release,revision:'local-validation',name:entry.theme.name,tokens:entry.theme.tokens} as unknown as CloudManifest;
  const documents=entry.pages.map(p=>{const input=draft.recipes[p.pageId];if(!input)throw Error('Missing recipe '+p.pageId);const recipe=json(confined(root,input));return {path:p.path,original:renderCloudPage(recipe,manifest,{name:entry.business,colors:[],original:true},origin),brand:renderCloudPage(recipe,manifest,{name:'Typography verification',colors:['#365e85']},origin)};});
  await verifyTemplateTypography(typographyBrowser,entry.theme.tokens,documents);
 } finally {await typographyBrowser.close();}
 const sourceFiles:any[]=[];
 async function preserve(dir:string){for(const f of readdirSync(dir,{withFileTypes:true})){const file=join(dir,f.name),s=lstatSync(file);if(s.isSymbolicLink())throw Error('Template staging directories must not contain junctions or symlinks');if(s.isDirectory())await preserve(file);else{const bytes=readFileSync(file),name=relative(root,file).replaceAll('\\','/'),key=`templates/archives/${sha(bytes)}/${name}`;await putVerified(key,bytes,'application/octet-stream');sourceFiles.push({path:name,key,sha256:sha(bytes),bytes:bytes.length});}}}
 await preserve(root);
 const pages=[];for(const p of entry.pages){const input=draft.recipes[p.pageId];if(!input)throw Error('Missing recipe '+p.pageId);const value=json(confined(root,input));if(!value.original||!value.brand||value.original.includes('/theme-assets/')||value.brand.includes('/theme-assets/'))throw Error('Recipe must have complete original and brand documents with Cloudflare assets');const bytes=Buffer.from(JSON.stringify(value)),recipe=sha(bytes);await putVerified(`templates/objects/${recipe}/recipe.json`,bytes,'application/json');pages.push({...p,recipe});}
 const revision=sha(JSON.stringify({theme:entry.theme,pages})),manifest={version:1,id:entry.theme.id,release:entry.theme.release,revision,name:entry.theme.name,business:entry.business,pages,tokens:entry.theme.tokens};
 await putVerified(`templates/manifests/${revision}.json`,Buffer.from(JSON.stringify(manifest)),'application/json');
 const sources=Buffer.from(JSON.stringify({version:1,files:sourceFiles})),sourceManifest=`templates/archives/${sha(sources)}/manifest.json`;await putVerified(sourceManifest,sources,'application/json');
 const published={...entry,pages,revision,base:origin,sourceArchive:sourceManifest,sourceHash:themeHash(entry.theme),thumbnails:{} as Record<string,Record<string,string>>};
 await verifyEntry(published);
 // Browser validation finishes before the catalog pointer changes or source is removed.
 const {chromium}=await import('playwright');const browser=await chromium.launch();try{for(const viewport of [{width:1440,height:900},{width:390,height:844}])for(const featured of pages.filter(p=>p.featured).slice(0,5)){const page=await browser.newPage({viewport,reducedMotion:'reduce'});let broken=false;page.on('requestfailed',()=>broken=true);const r=await page.goto(origin+`/templates/demo/${revision}/${entry.theme.id}`+featured.path,{waitUntil:'networkidle'});await page.evaluate('document.fonts.ready');await page.evaluate('Promise.all(Array.from(document.images,i=>{i.loading="eager";return i.decode().catch(()=>null)}))');const bad=await page.evaluate('Array.from(document.images).filter(i=>i.getAttribute("src")&&(!i.complete||!i.naturalWidth)).length');if(!r?.ok()||broken||bad)throw Error('Hosted browser verification failed');const bytes=await page.screenshot({type:'jpeg',quality:76}),key=`templates/objects/${sha(bytes)}/thumbnail.jpg`;await putVerified(key,bytes,'image/jpeg');published.thumbnails[featured.pageId]??={};published.thumbnails[featured.pageId]![viewport.width===1440?'desktop':'mobile']=origin+'/'+key;await page.close();}}finally{await browser.close();}
 const latest=await remoteCatalog();if(latest.etag!==initial.etag)throw Error('Catalog changed during publication; retry to merge the latest entries');
 const previous=latest.catalog.entries.find((e:any)=>e.theme.id===entry.theme.id);if(previous&&previous.theme.release===entry.theme.release&&previous.revision!==revision)throw Error('Revisions need a new release; the prior release remains immutable');
 const catalog={...latest.catalog,release:entry.theme.release,history:[...(latest.catalog.history||[]),...(previous&&previous.revision!==revision?[previous]:[])],entries:[...latest.catalog.entries.filter((e:any)=>e.theme.id!==entry.theme.id),published],assets:[...latest.catalog.assets.filter((a:any)=>!assets.some((b:any)=>b.id===a.id)),...assets.map(({localFile,licenseLocalFile,...a}:any)=>a)]};
 const bytes=Buffer.from(JSON.stringify(catalog)),saved=await r2Request('PUT','templates/catalog.json',bytes,'application/json',{'if-match':latest.etag});if(!saved.ok)throw Error('Catalog changed or publication failed: '+saved.status);
 const check=await remoteCatalog();if(sha(JSON.stringify(check.catalog))!==sha(bytes))throw Error('Published catalog verification failed');
 await syncLocalCatalog(catalog);
 // Only files in the verified staging snapshot are eligible for removal.
 for(const f of sourceFiles){const file=confined(root,f.path);if(sha(readFileSync(file))!==f.sha256)throw Error('Staging changed after publication; retain it for review');}
 for(const f of sourceFiles)unlinkSync(confined(root,f.path));
 console.log(JSON.stringify({published:entry.theme.id,revision,pages:pages.length,sourceArchive:sourceManifest,localTemplateFilesRemoved:sourceFiles.length}));
}else if(command==='verify'){
 const {catalog}=await remoteCatalog(),id=argv.includes('--id')?arg('--id'):undefined,entries=catalog.entries.filter((e:any)=>!id||e.theme.id===id);if(!entries.length)throw Error('Unknown hosted template');for(const entry of entries){await verifyEntry(entry);console.log(JSON.stringify({verified:entry.theme.id,pages:entry.pages.length}));}
}else if(command==='restore-source'){
 const {catalog}=await remoteCatalog(),entry=catalog.entries.find((e:any)=>e.theme.id===arg('--id')),out=argv.includes('--out')?arg('--out'):undefined;
 if(!entry?.sourceArchive||!out||existsSync(resolve(out)))throw Error('Use --id ID --out NEW_TRANSIENT_DIRECTORY');
 const r=await r2Request('GET',entry.sourceArchive);if(!r.ok)throw Error('Source archive unavailable');const manifest=await r.json() as any,root=resolve(out);if(manifest.parts)throw Error('Legacy multipart source recovery requires the private maintainer archive tooling');mkdirSync(root,{recursive:true});
 for(const f of manifest.files){const file=resolve(root,f.path);if(!file.startsWith(root+sep)||f.path.includes('..'))throw Error('Unsafe source archive path');const r=await r2Request('GET',f.key);if(!r.ok)throw Error('Source object unavailable');const bytes=new Uint8Array(await r.arrayBuffer());if(sha(bytes)!==f.sha256)throw Error('Source integrity failure');mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes);}console.log('Restored into transient staging: '+root);
}else console.log('templates gallery [--port 4390]\ntemplates publish --bundle ABSOLUTE_TRANSIENT_DIRECTORY\ntemplates verify [--id TEMPLATE_ID]\ntemplates restore-source --id TEMPLATE_ID --out NEW_TRANSIENT_DIRECTORY');
