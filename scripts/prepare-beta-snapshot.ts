import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {sourceManifest} from '../src/agent/source-manifest.ts';

const root=resolve(import.meta.dirname,'..');
const out=resolve(process.argv[2]||join(root,'artifacts/npm-beta','source-'+new Date().toISOString().replace(/[:.]/g,'-')));
if(existsSync(out))throw Error('Use a new beta snapshot directory');
const manifest=sourceManifest(root);mkdirSync(out,{recursive:true});
for(const file of manifest.files){
 const bytes=readFileSync(join(root,file.path));
 if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Source changed while copying: '+file.path);
 const target=join(out,file.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);
}
// Empty directories are part of a few workflow fixture contracts.
function preserveEmpty(dir:string):void {
 const entries=readdirSync(dir,{withFileTypes:true});
 if(!entries.length)mkdirSync(join(out,relative(root,dir)),{recursive:true});
 for(const entry of entries){if(entry.isSymbolicLink())throw Error('Unexpected fixture link');if(entry.isDirectory())preserveEmpty(join(dir,entry.name));}
}
preserveEmpty(join(root,'src/test/fixtures'));preserveEmpty(join(root,'templates/site'));
if(sourceManifest(out).hash!==manifest.hash)throw Error('Snapshot differs from captured source');
writeFileSync(join(out,'snapshot.json'),JSON.stringify({sourceHash:manifest.hash,files:manifest.files.length,createdAt:new Date().toISOString()},null,2)+'\n');
console.log(JSON.stringify({out,sourceHash:manifest.hash,files:manifest.files.length}));
