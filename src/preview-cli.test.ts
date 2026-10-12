import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
const cli=resolve('scripts/preview.ts');
test('preview help is read-only with an empty cwd or an existing preview',()=>{
  for(const populated of [false,true])for(const flag of ['--help','-h']){
    const root=mkdtempSync(join(tmpdir(),'vitris-preview-help-'));
    const metadata=join(root,'agent/preview-server.json');
    if(populated){mkdirSync(join(root,'agent'));mkdirSync(join(root,'dist'));writeFileSync(join(root,'dist/index.html'),'<h1>Unrelated preview</h1>');writeFileSync(metadata,'{"pid":123,"url":"http://127.0.0.1:12345","owner":"existing"}\n');}
    const before=existsSync(metadata)?readFileSync(metadata,'utf8'):null;
    const result=spawnSync(process.execPath,['--experimental-strip-types',cli,flag],{cwd:root,encoding:'utf8',timeout:5000,windowsHide:true});
    assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/vitris-preview --site SITE/);
    assert.equal(existsSync(metadata)?readFileSync(metadata,'utf8'):null,before);
    assert.equal(existsSync(join(root,'agent')),populated);
  }
});
test('ordinary explicit-site preview still serves and records its own identity',async()=>{
  const root=mkdtempSync(join(tmpdir(),'vitris-preview-live-')),cwd=mkdtempSync(join(tmpdir(),'vitris-preview-cwd-'));
  mkdirSync(join(root,'dist'));writeFileSync(join(root,'dist/index.html'),'<h1>Actual site</h1>');
  const child=spawn(process.execPath,['--experimental-strip-types',cli,'--site',root,'--port','0'],{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});
  try{
    const url=await new Promise<string>((done,fail)=>{let output='';const timeout=setTimeout(()=>fail(Error('Preview failed to start')),10000);child.stdout.on('data',b=>{output+=b;const m=output.match(/Local preview: (http:\/\/127\.0\.0\.1:\d+)/);if(m){clearTimeout(timeout);done(m[1]!);}});child.on('error',e=>{clearTimeout(timeout);fail(e);});child.on('exit',code=>{clearTimeout(timeout);fail(Error(`Premature preview exit ${code}`));});});
    assert.match(await (await fetch(url)).text(),/Actual site/);
    const metadata=JSON.parse(readFileSync(join(root,'agent/preview-server.json'),'utf8'));
    assert.equal(metadata.pid,child.pid);assert.equal(metadata.url,url);assert.ok(metadata.identity);
    assert.equal(existsSync(join(cwd,'agent')),false);
  }finally{child.kill();}
});
