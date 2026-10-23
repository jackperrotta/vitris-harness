import {test}from'node:test';import assert from'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';
import type{LaunchedChrome}from'chrome-launcher';import{closeLighthouseBrowser}from'./agent/lighthouse-browser.ts';
const locked=(profile:string)=>({process:{spawnargs:['chrome','--user-data-dir='+profile]},kill(){throw Object.assign(new Error('Windows profile lock'),{code:'EPERM'})}} as unknown as LaunchedChrome);
test('Lighthouse profile cleanup retries only an owned launcher directory',async()=>{
 const owned=mkdtempSync(join(tmpdir(),'lighthouse.'));writeFileSync(join(owned,'chrome.log'),'temporary');
 await closeLighthouseBrowser(locked(owned));assert.equal(existsSync(owned),false);
 const other=mkdtempSync(join(tmpdir(),'vitris-unrelated-profile-'));writeFileSync(join(other,'keep'),'preserve');
 await assert.rejects(closeLighthouseBrowser(locked(other)),/Windows profile lock/);assert.equal(existsSync(join(other,'keep')),true);
 let kills=0;await closeLighthouseBrowser({process:{spawnargs:[]},kill(){kills++}}as unknown as LaunchedChrome);assert.equal(kills,1);
});
