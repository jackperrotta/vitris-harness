import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {previewServer} from './build/serve.ts';
import {captureMotionJourney} from './agent/browser-motion-journey.ts';

test('a fast opening draw is observed before delayed font settlement, without inventing playback for an inert target',async()=>{
 const root=mkdtempSync(join(tmpdir(),'vitris-early-motion-'));mkdirSync(join(root,'dist'));
 const html=`<style>body{margin:0}section{height:900px}path{stroke-dasharray:100;stroke-dashoffset:100;animation:draw .22s linear forwards}@keyframes draw{to{stroke-dashoffset:0}}</style><main><section id="opening"><svg id="opening-draw" data-motion="draw"><path data-motion-path d="M0 10 H100" stroke="black"/></svg><svg id="inert-draw" data-motion="draw"><path data-motion-path style="animation:none;stroke-dashoffset:0" d="M0 20 H100" stroke="black"/></svg></section></main><script>window.VitrisMotion={inspect:()=>({static:false,phase:'active'})};Object.defineProperty(document.fonts,'ready',{value:new Promise(resolve=>setTimeout(resolve,800))});</script>`;
 writeFileSync(join(root,'dist/index.html'),html);const server=previewServer(join(root,'dist'));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+(server.address() as {port:number}).port+'/';const browser=await chromium.launch();
 try{
  const plan={version:2,scenes:['opening-draw','inert-draw'].map(targetId=>({id:targetId,route:'/',targetId,effect:'draw',mobile:'same'}))} as any;
  const result=await captureMotionJourney(browser,root,url,'/',1080,'normal','evidence',plan);
  assert.equal(result.scenes.find(s=>s.id==='opening-draw')!.active,true);
  assert.equal(result.scenes.find(s=>s.id==='inert-draw')!.active,false);
  assert.ok(result.failures.some(f=>f.includes('inert-draw')));assert.ok(!result.failures.some(f=>f.includes('opening-draw')));
  assert.ok(result.checkpoints.some(c=>c.timeMs<800));assert.ok(result.videoHash);
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});
