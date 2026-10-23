import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Page} from 'playwright';
import {captureMotionFrame} from './agent/template-motion-capture.ts';

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
