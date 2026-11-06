import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {releaseNotes,notifyDocumentation} from './release-docs.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const argv=process.argv.slice(2),docsOnly=argv.includes('--docs-only'),dryRun=argv.includes('--dry-run');
if(pkg.name!=='@tryvitris/website-harness'||pkg.private!==false||pkg.publishConfig?.access!=='public'||pkg.publishConfig?.registry!=='https://registry.npmjs.org/'||pkg.publishConfig?.tag!==(pkg.version.includes('-')?'beta':'latest'))throw Error('Unexpected public npm publication identity, registry or dist-tag');
async function published(){const r=await fetch('https://registry.npmjs.org/'+encodeURIComponent(pkg.name)+'/'+pkg.version,{headers:{'cache-control':'no-cache'}});if(r.status===404)return null;if(!r.ok)throw Error('Registry read failed');const p=await r.json();if(p.name!==pkg.name||p.version!==pkg.version||!p.dist?.integrity)throw Error('Registry identity mismatch');return p;}
async function main(){
 let remote=await published();
 if(!docsOnly){
  const at=argv.indexOf('--archive');if(at<0||!argv[at+1])throw Error('Use --archive with the exact reviewed npm tarball');const archive=path.resolve(argv[at+1]);
  const manifest=JSON.parse(execFileSync('tar',['-xOf',archive,'package/vitris-release.json'],{encoding:'utf8',maxBuffer:2*1024*1024,windowsHide:true}));releaseNotes(manifest,pkg.name,pkg.version);
  if(typeof manifest.documentation!=='string'||!manifest.documentation.trim()||manifest.documentation.length>1024*1024||createHash('sha256').update(manifest.documentation).digest('hex')!==manifest.documentationSha256||manifest.repository!=='https://github.com/jackperrotta/vitris-harness'||manifest.readmePath!=='README.md'||manifest.ref!=='v'+pkg.version)throw Error('Packed README source or hash is invalid');
  const integrity='sha512-'+createHash('sha512').update(await fs.readFile(archive)).digest('base64');
  if(remote&&remote.dist.integrity!==integrity)throw Error('The existing npm version has different archive bytes; do not republish');
  const directory=path.join(root,'.vitris/release-publications');await fs.mkdir(directory,{recursive:true});const progress=path.join(directory,pkg.version+'.json');
  const previous=existsSync(progress)?JSON.parse(await fs.readFile(progress,'utf8')):null;if(previous&&previous.integrity!==integrity)throw Error('Recorded upload differs from the reviewed archive');
  if(dryRun){console.log(JSON.stringify({dryRun:true,name:pkg.name,version:pkg.version,integrity,documentationReady:true}));return;}
  if(!remote&&!previous){
   execFileSync(process.execPath,[path.join(root,'scripts/guard-publish.mjs')],{cwd:root,stdio:'inherit',windowsHide:true});
   const cli=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');const child=spawnSync(process.execPath,[cli,'publish',archive,'--access','public','--tag',pkg.publishConfig.tag,'--ignore-scripts'],{stdio:'inherit',windowsHide:true});if(child.status!==0)throw Error('npm publication did not complete; finish its authentication before retrying');
   await fs.writeFile(progress,JSON.stringify({name:pkg.name,version:pkg.version,integrity,acceptedAt:new Date().toISOString()},null,2)+'\n');
  }
  const deadline=Date.now()+15*60000;while(!remote){if(Date.now()>deadline)throw Error('npm accepted the archive but is processing it; retry this command without changing the archive');await new Promise(r=>setTimeout(r,15000));remote=await published();}
  if(remote.dist.integrity!==integrity)throw Error('Published archive integrity mismatch');
 }
 if(!remote)throw Error('The current version is not published');if(dryRun){console.log(JSON.stringify({dryRun:true,documentationOnly:true,version:pkg.version}));return;}
 const receipt=await notifyDocumentation(root,[{name:pkg.name,version:pkg.version,integrity:remote.dist.integrity}]);
 await fs.mkdir(path.join(root,'.vitris/release-publications'),{recursive:true});await fs.writeFile(path.join(root,'.vitris/release-publications',pkg.version+'-docs.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
