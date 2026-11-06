import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function releaseNotes(value,name,version){
 if(!value||value.schemaVersion!==1||value.name!==name||value.version!==version||typeof value.title!=='string'||!value.title.trim()||value.title.length>200||!['package','admin-family'].includes(value.notesScope)||!Array.isArray(value.notes)||!value.notes.length||value.notes.length>40||value.notes.some(n=>typeof n!=='string'||!n.trim()||n.length>2000||/\bTODO\b|\[TBD\]/i.test(n)))throw Error('Write matching, substantive release notes before packing '+name+'@'+version);
 return value;
}
export async function prepareReleaseDocs(root){
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const notes=releaseNotes(JSON.parse(await fs.readFile(path.join(root,'docs/releases',pkg.version+'.json'),'utf8')),pkg.name,pkg.version);
 const documentation=(await fs.readFile(path.join(root,'README.md'),'utf8')).replace(/ \(this workstation uses `[^`]+`\)/g,'');
 const manifest={...notes,repository:'https://github.com/jackperrotta/vitris-harness',readmePath:'README.md',ref:'v'+pkg.version,documentation,documentationSha256:createHash('sha256').update(documentation).digest('hex')};
 await fs.writeFile(path.join(root,'vitris-release.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
export async function notifyDocumentation(root,packages,{fetcher=fetch,configuration}={}){
 let config=configuration;
 if(!config&&process.env.VITRIS_DOCS_WEBHOOK_URL)config={url:process.env.VITRIS_DOCS_WEBHOOK_URL,token:process.env.VITRIS_DOCS_WEBHOOK_TOKEN};
 const file=path.join(root,'.vitris/release-docs.json');if(!config&&existsSync(file))config=JSON.parse(await fs.readFile(file,'utf8'));
 if(!config)return {status:'not-configured'};
 const url=new URL(config.url);if(url.protocol!=='https:'||url.username||url.password||url.hash||typeof config.token!=='string'||config.token.length<32)throw Error('Invalid private documentation hook configuration');
 const response=await fetcher(url,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+config.token,'content-type':'application/json'},body:JSON.stringify({packages}),signal:AbortSignal.timeout(120000)});
 if(response.status!==200)throw Error('npm publication is verified; documentation refresh needs retry (HTTP '+response.status+'). Run npm run release:docs; do not republish packages.');
 const result=await response.json();if(!result||!Array.isArray(result.failures)||result.failures.length||!Array.isArray(result.pending)||result.pending.length||!Array.isArray(result.verified)||packages.some(p=>!result.verified.some(v=>v&&v.name===p.name&&v.version===p.version&&v.integrity===p.integrity)))throw Error('Documentation receipt is incomplete; run npm run release:docs without republishing packages.');
 return {status:'updated',checkedAt:result.checkedAt,packages:result.verified};
}
