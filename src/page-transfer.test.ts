import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { auditPageTransfers, pageTransferAssets } from './knowledge/page-transfer.ts';
import { auditTransfer } from './knowledge/checks.ts';

function fixture() {
  const dist = mkdtempSync(join(tmpdir(),'vitris-page-transfer-'));
  const write=(path:string,bytes:string|Buffer)=>{mkdirSync(dirname(join(dist,path)),{recursive:true});writeFileSync(join(dist,path),bytes);return join(dist,path);};
  const page=(path:string,html:string)=>({path:write(path,html),html});
  return {dist,write,page};
}
const noise=(kb:number)=>'/*'+Buffer.from(randomBytes(kb*1024)).toString('base64')+'*/';

test('independent pages keep the same budgets without adding their unused bundles',()=>{
  const {dist,write,page}=fixture();
  const a={path:write('a.js',noise(70)),bytes:Buffer.from(noise(70))};
  const b={path:write('b.js',noise(70)),bytes:Buffer.from(noise(70))};
  assert(auditTransfer([a,b]).some(f=>f.id==='budget-js'));
  const pages=[page('index.html','<script src="/a.js"></script>'),page('about/index.html','<script src="/b.js"></script>')];
  assert.deepEqual(auditPageTransfers(dist,pages),[]);
});

test('an oversized page still fails JS and CSS budgets with an exact location',()=>{
  const {dist,write,page}=fixture();write('app.mjs',noise(130));write('app.css',noise(130));
  const p=page('pricing/index.html','<link rel="stylesheet" href="/app.css"><script src="/app.mjs"></script>');
  const findings=auditPageTransfers(dist,[p]);
  assert(findings.some(f=>f.id.startsWith('budget-js-')&&f.page===p.path));
  assert(findings.some(f=>f.id.startsWith('budget-css-')&&f.page===p.path));
});

test('CSS imports and fonts follow relative URLs, deduplicate and terminate cycles',()=>{
  const {dist,write,page}=fixture();write('assets/main.css','@import "other.css";a{font-family:test;src:url("font.woff2?v=1")}');
  write('assets/other.css','@import url(main.css);@font-face{src:url(font.woff2#same)}');write('assets/font.woff2',randomBytes(210*1024));
  const p=page('deep/index.html','<link rel="stylesheet" href="../assets/main.css"><link rel="preload" as="font" href="/assets/font.woff2">');
  const assets=pageTransferAssets(dist,p);
  assert.equal(assets.filter(a=>a.path.endsWith('font.woff2')).length,1);
  assert.equal(assets.filter(a=>a.path.endsWith('.css')).length,2);
  assert(auditPageTransfers(dist,[p]).some(f=>f.id.startsWith('budget-fonts-')));
});

test('inert templates, off-site assets and unreferenced files are not a page delivery graph',()=>{
  const {dist,write,page}=fixture();write('unused.js',noise(180));write('used.js','console.log(1)');
  const p=page('index.html','<template><script src="/unused.js"></script></template><script src="https://elsewhere.example/unused.js"></script><script src="https://site.example/used.js?version=1"></script>');
  const assets=pageTransferAssets(dist,p,'https://site.example');
  assert(assets.some(a=>a.path.endsWith('used.js')));assert(!assets.some(a=>a.path.endsWith('unused.js')));
  assert.deepEqual(auditPageTransfers(dist,[p],'https://site.example'),[]);
});

test('inline executable code counts, JSON data does not inflate the JS budget',()=>{
  const {dist,page}=fixture();
  const data=page('data.html','<script type="application/ld+json">'+JSON.stringify({value:noise(130)})+'</script>');
  assert(!auditPageTransfers(dist,[data]).some(f=>f.id.startsWith('budget-js-')));
  const executable=page('script.html','<script>'+noise(130)+'</script><style>'+noise(130)+'</style>');
  const findings=auditPageTransfers(dist,[executable]);
  assert(findings.some(f=>f.id.startsWith('budget-js-')));assert(findings.some(f=>f.id.startsWith('budget-css-')));
});

test('transfer counts HTML once and still rejects an oversized document',()=>{
  const {dist,page}=fixture();
  const one=page('one.html','<script>'+('/*'+'a'.repeat(900*1024)+'*/')+'</script>');
  assert(!auditPageTransfers(dist,[one]).some(f=>f.id.startsWith('budget-transfer-')));
  const huge=page('huge.html','<p>'+'a'.repeat(2*1024*1024)+'</p>');
  assert(auditPageTransfers(dist,[huge]).some(f=>f.id.startsWith('budget-transfer-')));
});

test('empty referenced resources fail and encoded traversal cannot read a sibling',()=>{
  const {dist,write,page}=fixture();write('empty.js','');
  const p=page('index.html','<script src="/empty.js"></script><script src="/%2e%2e%2foutside.js"></script>');
  assert(auditPageTransfers(dist,[p]).some(f=>f.requirementId==='perf-broken-resource'));
  assert(pageTransferAssets(dist,p).every(a=>a.path.startsWith(dist)));
});
