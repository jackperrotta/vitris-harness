import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Page} from 'playwright';
import {captureMotionFrame,captureTemplateMotion} from './agent/template-motion-capture.ts';
import {chromium,type Browser} from 'playwright';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

test('navigation retries recapture both the frame and state, and disclose the retry count',async()=>{
 let shots=0,reads=0,settlements=0;
 const page={screenshot:async()=>{if(++shots===1)throw Error('Unable to capture screenshot');},evaluate:async()=>{if(++reads===1)throw Error('Execution context was destroyed, most likely because of a navigation');return 'actual destination state';},isClosed:()=>false,waitForLoadState:async()=>{settlements++;},waitForTimeout:async()=>{}} as unknown as Page;
 const frame=await captureMotionFrame(page,'frame.png','.cover');
 assert.deepEqual(frame,{state:'actual destination state',captureRetries:2});
 assert.equal(shots,3);assert.equal(reads,2);assert.equal(settlements,2);
});

test('persistent transport errors and ordinary page failures still fail closed',async()=>{
 for(const message of ['Unable to capture screenshot','Unexpected selector failure']){
  let shots=0;
  const page={screenshot:async()=>{shots++;throw Error(message);},isClosed:()=>false,waitForLoadState:async()=>{},waitForTimeout:async()=>{}} as unknown as Page;
  await assert.rejects(captureMotionFrame(page,'frame.png','.cover'),{message});
  assert.equal(shots,message==='Unable to capture screenshot'?3:1);
 }
});

test('a slow navigation retains the load timeline and spaced opening samples', {timeout:30000}, async()=>{
 const root=mkdtempSync(join(tmpdir(),'vitris-slow-opening-'));mkdirSync(join(root,'dist'));writeFileSync(join(root,'dist/index.html'),'verified test fixture');
 const browser=await chromium.launch({headless:true});
 try{
  const controlled={newContext:async(options:any)=>{
   const context=await browser.newContext(options);
   await context.route('https://*.invalid/**',async route=>{await delay(2200);await route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}.hero{height:900px}.curtain{position:fixed;inset:0;background:black;color:white;animation:lift 800ms 420ms forwards}@keyframes lift{to{transform:translateY(-120%)}}</style><main class="hero">Opening content</main><div class="curtain">Hello</div>'});});
   return context;
  }} as unknown as Browser;
  const report=await captureTemplateMotion(controlled,root,'https://implementation.invalid/','captures',{version:1,selectionHash:'test-selection',referenceUrl:'https://reference.invalid/',moments:[{id:'arrival',kind:'load',intent:'Observe the opening after a delayed document response',width:375,reference:{path:'/',target:'.hero',observe:'.curtain'},implementation:{path:'/',target:'.hero',observe:'.curtain'}}]});
  for(const capture of report.captures){
   assert.deepEqual(capture.failures,[]);
   assert(capture.samples[0]!.at>=2100,'timestamps must retain the navigation delay');
   assert(capture.samples.at(-1)!.at-capture.samples[0]!.at>=1500,'slow navigation must not collapse the subsequent opening checkpoints');
   assert(new Set(capture.samples.map(s=>s.state)).size>1,'the recorded opening must show its real change');
  }
 }finally{await browser.close();}
});
