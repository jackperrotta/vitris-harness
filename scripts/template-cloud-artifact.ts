import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CLOUD_GALLERY_SHELL} from '../src/agent/cloud-gallery-shell.ts';
import {PICKER_RUNTIME} from '../src/agent/theme-picker-runtime.ts';
import {cloudGalleryBrowseResults as browseResults} from '../src/agent/cloud-gallery-browse.ts';
import {cloudGalleryModel,cloudGalleryVocabulary} from '../src/agent/cloud-gallery-model.ts';

export const defaultTemplateArtifact=resolve(import.meta.dirname,'../artifacts/templates/gallery.html');
export function writeCloudTemplateArtifact(out=defaultTemplateArtifact) {
 const brand={schemaVersion:1 as const,siteId:'vitris-cloud-template-artifact',name:'Vitris template library',colors:[{value:'#56636b',source:'gallery display',confidence:'explicit' as const}],fallback:false};
 let html=CLOUD_GALLERY_SHELL;
 const runtime=PICKER_RUNTIME.replace("palette:'brand'","palette:'original'").replace("model().themes[0].release+':'+model().brand.siteId","'cloud-v1:'+model().brand.siteId").replaceAll('m.themes[0].release',"m.themes[0]?.release");
 const script=String.raw`(async()=>{
 const cloudStatus=document.getElementById('catalogstatus'),catalogUrl='https://vitris-templates.jack-896.workers.dev/templates/catalog.json';
 const cloudGalleryModel=${cloudGalleryModel.toString()},cloudGalleryVocabulary=${cloudGalleryVocabulary.toString()},browseResults=${browseResults.toString()};
 const brand=${JSON.stringify(brand)},session=null,offlineAssets={};
 async function readCatalog(){const response=await fetch(catalogUrl,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Cloudflare catalog returned '+response.status);return response.json();}
 function describeCatalog(catalog){document.querySelector('.intro p').textContent='Browse '+catalog.entries.length+' complete hosted demonstrations and their '+catalog.entries.reduce((n,e)=>n+e.pages.length,0)+' connected pages. Templates, assets and thumbnails load from Cloudflare. New publications appear automatically.';document.querySelector('footer').textContent='Cloudflare template library · Release '+(catalog.release||'current');}
 function syncOptions(vocabulary){const select=document.getElementById('collection');select.replaceChildren();for(const value of vocabulary.collections){const option=document.createElement('option');option.value=option.textContent=value;select.append(option);}document.getElementById('localentry').hidden=!vocabulary.collections.includes('Local Service Edit');document.getElementById('archive').replaceChildren(new Option('Cloudflare · current','current'));}
 let catalog=await readCatalog(),catalogFingerprint=JSON.stringify(catalog.entries),refreshing=false;
 const models=[await cloudGalleryModel(catalog,brand)];let vocabulary=cloudGalleryVocabulary(catalog);
 describeCatalog(catalog);syncOptions(vocabulary);
 ${runtime}
 document.getElementById('mode').textContent='Copy or export your choice for your agent.';
 cloudStatus.textContent='Live Cloudflare catalog · updates automatically';
 async function refreshCloudCatalog(){if(refreshing)return;refreshing=true;try{const fresh=await readCatalog(),fingerprint=JSON.stringify(fresh.entries);if(fingerprint!==catalogFingerprint){const next=await cloudGalleryModel(fresh,brand);stash();document.getElementById('detail').close();document.getElementById('comparison').close();models[0]=next;vocabulary=cloudGalleryVocabulary(fresh);syncOptions(vocabulary);describeCatalog(fresh);render();catalog=fresh;catalogFingerprint=fingerprint;}cloudStatus.textContent='Live Cloudflare catalog · updates automatically';}catch(error){cloudStatus.textContent='Catalog refresh unavailable. Displaying the last loaded catalog; retrying automatically.';}finally{refreshing=false;}}
 setInterval(()=>{if(!document.hidden)refreshCloudCatalog();},60000);
 addEventListener('focus',refreshCloudCatalog);addEventListener('online',refreshCloudCatalog);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCloudCatalog();});
 })().catch(error=>{console.error('Template gallery could not start',error);const status=document.getElementById('catalogstatus');status.textContent='The template gallery could not finish loading. Reload to try again.';const retry=document.createElement('button');retry.textContent='Reload gallery';retry.onclick=()=>location.reload();status.append(' ',retry);});`;
 html=html.replace('<!-- CLOUD_GALLERY_RUNTIME -->',()=>'<script>'+script.replace(/<\/script/gi,'<\\/script')+'</script>');
 mkdirSync(dirname(out),{recursive:true});writeFileSync(out,html);
 return out;
}
if(process.argv[1]?.endsWith('template-cloud-artifact.ts')&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(writeCloudTemplateArtifact());
