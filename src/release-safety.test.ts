import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {sourceManifest} from './agent/source-manifest.ts';

const root=resolve(import.meta.dirname,'..');
function auditFixture(files:Record<string,string>){
 const dir=mkdtempSync(join(tmpdir(),'vitris-release-safety-'));
 mkdirSync(join(dir,'scripts'));copyFileSync(join(root,'scripts/audit-package.mjs'),join(dir,'scripts/audit-package.mjs'));
 writeFileSync(join(dir,'package.json'),JSON.stringify({name:'vitris-release-test',version:'1.0.0',private:true,files:['bin','docs']}));
 for(const [name,bytes]of Object.entries(files)){mkdirSync(resolve(dir,name,'..'),{recursive:true});writeFileSync(join(dir,name),bytes);}
 const env={...process.env};delete env.GITLEAKS_BIN;delete env.VITRIS_AUDIT_CREDENTIAL_ROOT;
 const result=spawnSync(process.execPath,[join(dir,'scripts/audit-package.mjs')],{env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 return {result,report:JSON.parse(result.stdout)};
}
test('tarball audit rejects a local credential value and never prints its bytes',()=>{
 const secret='synthetic-local-'+['7Fg9','pQ2z','R8Km','N4Wd'].join('');
 const {result,report}=auditFixture({'.env':'EXAMPLE_PRIVATE_TOKEN='+secret,'bin/index.js':'export const value='+JSON.stringify(secret)});
 assert.equal(result.status,1);assert.ok(report.findings.some((f:{rule:string})=>f.rule==='local-credential-value'));
 assert.equal((result.stdout+result.stderr).includes(secret),false);
});
test('tarball audit rejects historical archives even when npm includes them',()=>{
 const {result,report}=auditFixture({'bin/index.js':'export const ok=true;','docs/baselines/private.zip':'private history'});
 assert.equal(result.status,1);assert.ok(report.findings.some((f:{rule:string})=>f.rule==='forbidden-release-file'));
});
test('tarball audit permits environment variable names without credential values',()=>{
 const {result,report}=auditFixture({'bin/index.js':'export const token=process.env.CLOUDFLARE_API_TOKEN;'});
 assert.equal(result.status,0,result.stderr);assert.equal(report.ok,true);
});
test('source fingerprint rejects all links, including former archive bridges',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vitris-source-links-')),outside=mkdtempSync(join(tmpdir(),'vitris-source-outside-'));
 mkdirSync(join(dir,'src/agent'),{recursive:true});writeFileSync(join(outside,'record.ts'),'export const n=1;');
 symlinkSync(outside,join(dir,'src/agent/industry'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>sourceManifest(dir),/Unexpected source link: src\/agent\/industry/);
 symlinkSync(outside,join(dir,'src/unexpected'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>sourceManifest(dir),/Unexpected source link/);
});

test('publish guard allows the intended public beta and rejects wrong identity, visibility, registry, and tag before auditing',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vitris-publish-guard-'));
 mkdirSync(join(dir,'scripts'));copyFileSync(join(root,'scripts/guard-publish.mjs'),join(dir,'scripts/guard-publish.mjs'));
 writeFileSync(join(dir,'scripts/audit-package.mjs'),"console.log('audit-invoked');");
 const valid={name:'@tryvitris/website-harness',version:'0.1.0-beta.5',private:false,publishConfig:{access:'public',tag:'beta',registry:'https://registry.npmjs.org/'}};
 for(const pkg of [valid,{...valid,name:'@vitris/harness'},{...valid,private:true},{...valid,publishConfig:{...valid.publishConfig,access:'restricted'}},{...valid,publishConfig:{...valid.publishConfig,registry:'https://other.example/'}},{...valid,publishConfig:{...valid.publishConfig,tag:'latest'}}]){
  writeFileSync(join(dir,'package.json'),JSON.stringify(pkg));
  const run=spawnSync(process.execPath,[join(dir,'scripts/guard-publish.mjs')],{encoding:'utf8',windowsHide:true});
  assert.equal(run.status,pkg===valid?0:1,run.stderr);
  assert.equal(run.stdout.includes('audit-invoked'),pkg===valid);
 }
});
