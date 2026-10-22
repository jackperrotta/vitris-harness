#!/usr/bin/env node
/** Maintainer-only, local source migration. Publication remains a separate step. */
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {migrateHtml} from './lib/template-icon-migration.ts';
const args=process.argv.slice(2),at=args.indexOf('--bundle');
if(at<0||!args[at+1])throw Error('Usage: npm run templates:icons -- --bundle ABSOLUTE_DIRECTORY [--apply]');
const root=await realpath(resolve(args[at+1]!));
const draft=JSON.parse(await readFile(resolve(root,'template.json'),'utf8'));
const report=[];
for(const [pageId,path] of Object.entries(draft.recipes as Record<string,string>)){
 const file=await realpath(resolve(root,path)),rel=relative(root,file);
 if(rel.startsWith('..')||isAbsolute(rel))throw Error('Recipe escapes the template bundle');
 const recipe=JSON.parse(await readFile(file,'utf8'));const changes=[];
 for(const flavor of ['original','brand']){
  if(typeof recipe[flavor]!=='string')throw Error('Missing complete '+flavor+' HTML: '+pageId);
  const result=migrateHtml(recipe[flavor]);
  changes.push({flavor,changed:result.html!==recipe[flavor],icons:result.icons,cssIcons:result.cssIcons,scriptEdits:result.scriptIcons,labels:result.labels});recipe[flavor]=result.html;
 }
 if(args.includes('--apply')&&changes.some(change=>change.changed))await writeFile(file,JSON.stringify(recipe));
 report.push({pageId,changes});
}
console.log(JSON.stringify({mode:args.includes('--apply')?'applied':'plan',template:draft.entry?.theme?.id,pages:report},null,2));
