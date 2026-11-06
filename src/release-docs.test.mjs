import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareReleaseDocs,releaseNotes,notifyDocumentation} from '../scripts/release-docs.mjs';
const name='@tryvitris/website-harness',version='9.9.9',notes={schemaVersion:1,name,version,title:'Verified release',notesScope:'package',notes:['A specific shipped change.']};
test('packing requires matching substantive notes and a hashed README',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vitris-release-docs-'));try{
 await mkdir(join(root,'docs/releases'),{recursive:true});await writeFile(join(root,'package.json'),JSON.stringify({name,version}));await writeFile(join(root,'README.md'),'# Specification\nPublic commands.');await writeFile(join(root,'docs/releases',version+'.json'),JSON.stringify(notes));
 const result=await prepareReleaseDocs(root);assert.equal(result.documentationSha256,createHash('sha256').update(result.documentation).digest('hex'));assert.equal(JSON.parse(await readFile(join(root,'vitris-release.json'),'utf8')).version,version);
 assert.throws(()=>releaseNotes({...notes,notes:['TODO']},name,version));assert.throws(()=>releaseNotes(notes,name,'9.9.8'));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('notification requires exact registry receipt and retries without republishing',async()=>{
 const packages=[{name,version,integrity:'sha512-test'}],configuration={url:'https://docs.example/docs/_refresh',token:'x'.repeat(64)};
 const fetcher=async(url,options)=>{assert.equal(String(url),configuration.url);assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body),{packages});return Response.json({checkedAt:'now',verified:packages,failures:[],pending:[]});};
 assert.equal((await notifyDocumentation('.',packages,{configuration,fetcher})).status,'updated');
 await assert.rejects(notifyDocumentation('.',packages,{configuration,fetcher:async()=>Response.json({verified:[],failures:[],pending:[]})}),/incomplete/);
 await assert.rejects(notifyDocumentation('.',packages,{configuration,fetcher:async()=>new Response('',{status:503})}),/do not republish/);
 await assert.rejects(notifyDocumentation('.',packages,{configuration:{...configuration,url:'http://docs.example'}}),/Invalid/);
});
