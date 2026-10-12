import test from 'node:test';
import assert from 'node:assert/strict';
import {runBrowserTasks} from './agent/browser-work-queue.ts';
test('bounded browser queue processes each task once and awaits all evidence writers on failure',async()=>{
 const seen:number[]=[],ids:number[]=[];let active=0,peak=0;
 await runBrowserTasks([0,1,2,3,4,5,6],3,async(item,index)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,10));seen.push(item);ids.push(index);active--;});
 assert.equal(peak,3);assert.equal(active,0);assert.deepEqual(seen.sort(),[0,1,2,3,4,5,6]);assert.deepEqual(ids.sort(),seen);
 let finished=false;
 await assert.rejects(()=>runBrowserTasks([0,1],2,async(item)=>{if(item===0)throw Error('Capture failed');await new Promise(r=>setTimeout(r,15));finished=true;}),/Capture failed/);
 assert.equal(finished,true,'Other evidence writers settle before shared browser cleanup');
 for(const invalid of [0,5,1.5,NaN])await assert.rejects(()=>runBrowserTasks([],invalid,async()=>{}),/integer from 1 to 4/);
});
