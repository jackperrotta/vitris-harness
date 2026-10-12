import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {within} from '../agent/artifacts.ts';
import type {PreserveManifest} from './config.ts';

/** Add newly discovered routes/assets without replacing immutable capture records. */
export function preserveManifest(root:string):PreserveManifest {
 const manifest:PreserveManifest=JSON.parse(readFileSync(join(root,'onboarding/preserve.json'),'utf8'));
 const index=join(root,'onboarding/preserve-supplements.json');
 if(existsSync(index))for(const file of JSON.parse(readFileSync(index,'utf8')).files){
  const supplement=JSON.parse(readFileSync(within(root,file),'utf8'));
  if(supplement.sourceUrl!==manifest.sourceUrl||supplement.capturedAt!==manifest.capturedAt)throw Error('Asset supplement does not match the original capture');
  manifest.warnings=[...new Set([...manifest.warnings,...(supplement.warnings||[])])];
  if(supplement.blockers?.length)manifest.blockers=[...new Set([...(manifest.blockers||[]),...supplement.blockers])];
  for(const page of supplement.pages||[]){
   within(join(root,'preserved'),page.file);page.references.forEach((r:any)=>within(root,r.file));
   if(page.sourceFailure)within(root,page.sourceFailure.responseFile);
   if(new URL(page.url).origin!==new URL(manifest.sourceUrl).origin||new URL(page.url).pathname!==page.path||manifest.pages.some(p=>p.path===page.path||p.file.toLowerCase()===page.file.toLowerCase()))throw Error('Page supplement would replace a captured route or leave its source');
   manifest.pages.push(page);
  }
  for(const asset of supplement.assets||[]){
   within(root,asset.referenceFile);within(join(root,'preserved'),asset.file);
   if(manifest.assets.some(a=>a.file===asset.file||a.url===asset.url))throw Error('Asset supplement would replace a captured asset');
   manifest.assets.push(asset);
   if(asset.captureError)manifest.blockers=[...new Set([...(manifest.blockers||[]),asset.captureError+'; missing authored asset retained as an empty placeholder, not claimed as preserved bytes'])];
  }
 }
 return manifest;
}
