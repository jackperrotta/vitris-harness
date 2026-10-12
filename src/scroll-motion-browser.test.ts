// These names exist only inside Playwright-serialized browser callbacks; keep the Worker TS library unchanged.
declare const window: any, document: any;
declare const innerHeight: number, scrollY: number;
declare function scrollTo(x: number, y: number): void;
declare function getComputedStyle(element: any): any;
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { buildSite } from './build/index.ts';
import { previewServer } from './build/serve.ts';
import { counterJs } from './runtime/counter.ts';

const body = `<main id="main" tabindex="-1"><h1>Immediately readable introduction</h1><div style="height:1100px"></div><section><h2 id="entrance" data-motion="entrance" data-motion-duration="650" style="transform:rotate(2deg)">Proof heading</h2><div id="choices" data-motion="stagger" data-motion-stagger="120">${Array.from({length:12},(_,i)=>`<a href="#end" data-motion-child id="choice-${i}">Choice ${i}</a>`).join('')}</div></section><div style="height:1000px"></div><section id="trigger" style="height:1000px"><span id="progress" data-motion="progress" data-motion-trigger="trigger" style="display:block;width:300px;height:5px;transform-origin:left"></span><div id="drift" data-motion="drift" data-motion-trigger="trigger" data-motion-distance="12" style="transform:rotate(1deg)">Project detail</div></section><div id="tall" data-motion="entrance" style="height:2000px">Large content stays readable</div><div id="parent" data-motion="entrance"><p id="nested" data-motion="entrance">Nested readable text</p></div><section id="story" data-motion="story" style="min-height:900px"><p style="position:sticky;top:20px">Sticky context</p><p>Reading remains ordinary document flow.</p></section><div style="height:1000px"></div><footer id="end">End</footer></main>`;
test('shipped motion preserves reading, preferences, navigation, effects and lifecycle', { timeout: 60000 }, async () => {
  const root=await mkdtemp(join(tmpdir(),'vitris-motion-browser-'));
  await buildSite({site:{name:'Behavior',scrollMotion:{version:1,policy:'enabled'}},theme:{},catalog:{},pages:[{path:'/',file:'index.html',title:'Behavior',body},{path:'/quiet',file:'quiet.html',title:'Quiet',body:'<h1>Quiet route</h1>'}],outDir:root});
  const server=previewServer(root);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1080,height:900},reducedMotion:'no-preference'});
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.waitForTimeout(100);
    const delays=await page.locator('#choices').evaluate(e=>e.getAnimations({subtree:true}).map((a:any)=>a.effect!.getTiming().delay));
    assert.equal(delays.length,12);assert.ok(Math.max(...delays)<=300,'long groups have a bounded total delay');
    assert.equal(await page.locator('h1').evaluate(e=>getComputedStyle(e).opacity),'1');
    assert.equal(await page.locator('#tall').evaluate(e=>getComputedStyle(e).opacity),'1');
    assert.equal(await page.locator('#nested').evaluate(e=>getComputedStyle(e).opacity),'1');
    await page.evaluate(()=>scrollTo(0,500));await page.waitForTimeout(140);
    assert.ok(Number(await page.locator('#entrance').evaluate(e=>getComputedStyle(e).opacity))<.99,'entrance must actually move');
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(80);
    assert.equal(await page.locator('#entrance').evaluate(e=>getComputedStyle(e).opacity),'1');
    const reducedTransform=await page.locator('#entrance').evaluate(e=>getComputedStyle(e).transform);
    assert.notEqual(reducedTransform,'none','existing author transform survives reduction');
    assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
    await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>scrollTo(0,0));await page.evaluate('window.VitrisMotion.init()');
    await page.evaluate(()=>document.getElementById('choice-0')!.focus());await page.waitForTimeout(50);
    assert.equal(await page.locator('#choice-0').evaluate(e=>getComputedStyle(e).opacity),'1','keyboard focus reveals content immediately');
    await page.goto(url+'/#entrance');await page.waitForTimeout(80);
    assert.equal(await page.locator('#entrance').evaluate(e=>getComputedStyle(e).opacity),'1','anchor destination is immediately readable');
    await page.goto(url);await page.waitForTimeout(80);
    await page.evaluate(()=>{scrollTo(0,1300);(window as any).VitrisMotion.init();});
    assert.equal(await page.locator('#entrance').evaluate(e=>getComputedStyle(e).opacity),'1','restored scroll skips a completed visible proof');
    for(const p of [0,.5,1,.5]){
      await page.locator('#trigger').evaluate((e,p)=>{const r=e.getBoundingClientRect();scrollTo(0,r.top+scrollY-innerHeight+(innerHeight+r.height)*p);},p);
      await page.waitForTimeout(80);
      const value=await page.locator('#progress').evaluate(e=>Number(getComputedStyle(e).transform.split(',')[0].replace('matrix(','')));
      assert.ok(Math.abs(value-Math.max(.001,p))<.035,`scroll progress ${p} produced ${value}`);
    }
    await page.mouse.wheel(0,2500);await page.waitForTimeout(100);await page.mouse.wheel(0,-2500);await page.waitForTimeout(100);
    assert.ok(await page.evaluate('Number.isFinite(window.VitrisMotion.inspect("progress").progress)'));
    await page.evaluate('window.VitrisMotion.dispose()');await page.waitForTimeout(50);
    assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
    assert.equal(await page.locator('#drift').evaluate(e=>getComputedStyle(e).transform==='none'),false);
    // Exercised fallback has the same effect, with no supported timeline and no persistent animation loop.
    await page.addInitScript('window.ViewTimeline=undefined');await page.goto(url);await page.waitForTimeout(80);
    await page.locator('#trigger').evaluate(e=>{const r=e.getBoundingClientRect();scrollTo(0,r.top+scrollY-innerHeight+(innerHeight+r.height)*.5);});await page.waitForTimeout(100);
    assert.ok(Math.abs(await page.locator('#progress').evaluate(e=>Number(getComputedStyle(e).transform.split(',')[0].replace('matrix(','')))-.5)<.035);
    await page.setViewportSize({width:375,height:900});await page.waitForTimeout(100);
    assert.equal(await page.evaluate('window.VitrisMotion.inspect("drift").static'),true,'mobile drift defaults static');
    const storyTop=await page.locator('#story').evaluate(e=>e.getBoundingClientRect().top+scrollY);
    for(const offset of [100,200]){
      await page.evaluate(y=>scrollTo(0,y),storyTop+offset);await page.waitForTimeout(50);
      assert.ok(Math.abs(await page.locator('#story p').first().evaluate(e=>e.getBoundingClientRect().top)-20)<1,'ordinary CSS sticky remains anchored during motion');
    }
    assert.equal(await page.evaluate('window.VitrisMotion.inspect("story").static'),true);
    await page.evaluate('window.VitrisMotion.init();window.VitrisMotion.init();window.VitrisMotion.dispose()');
    assert.equal(await page.evaluate(()=>document.getAnimations().length),0,'duplicate initialization and teardown leave no animations');
    assert.ok(await page.locator('[data-motion-child]').evaluateAll(es=>es.every(e=>getComputedStyle(e).opacity==='1')),'static capture teardown exposes every group child');
    await page.goto(url+'/quiet');assert.equal(await page.locator('script[src*="/motion-"]').count(),0,'quiet route delivers no motion engine');
    assert.deepEqual(errors,[]);
    await page.close();
    for(const failure of ['no-js','no-observer','init-throws']){
      const context=await browser.newContext({javaScriptEnabled:failure!=='no-js'}),p=await context.newPage();
      if(failure==='no-observer')await p.addInitScript('window.IntersectionObserver=undefined');
      if(failure==='init-throws')await p.addInitScript('window.IntersectionObserver=class {constructor(){throw Error("injected failure")}}');
      await p.goto(url);await p.waitForTimeout(80);
      assert.equal(await p.locator('#entrance').evaluate(e=>getComputedStyle(e).opacity),'1',failure);
      assert.equal(await p.locator('#choice-0').evaluate(e=>getComputedStyle(e).opacity),'1',failure);
      await context.close();
    }
  } finally {await browser.close();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));await rm(root,{recursive:true,force:true});}
});

test('legacy counters preserve author text without script and during live reduction or teardown', async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({reducedMotion:'no-preference'});
    const html='<div data-island="counter"><span data-count-to="1000" data-count-suffix="+">1,000+ proven examples</span></div>';
    await page.setContent(html);assert.equal(await page.locator('[data-count-to]').textContent(),'1,000+ proven examples');
    await page.addScriptTag({content:counterJs});await page.waitForTimeout(150);
    assert.notEqual(await page.locator('[data-count-to]').textContent(),'1,000+ proven examples','normal mode actually animates');
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(80);
    assert.equal(await page.locator('[data-count-to]').textContent(),'1,000+ proven examples');await page.waitForTimeout(120);
    assert.equal(await page.locator('[data-count-to]').textContent(),'1,000+ proven examples','canceled frame cannot rewrite final author text');
    await page.emulateMedia({reducedMotion:'no-preference'});await page.addScriptTag({content:counterJs});await page.waitForTimeout(80);
    await page.evaluate(()=>window.VitrisCounters.dispose());assert.equal(await page.locator('[data-count-to]').textContent(),'1,000+ proven examples');
    await page.setContent('<html data-motion-policy="off">'+html+'</html>');await page.addScriptTag({content:counterJs});await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-count-to]').textContent(),'1,000+ proven examples','explicit off keeps counters static');
    await page.close();
  } finally {await browser.close();}
});

test('compiled motion waits for initial module UI before measuring layout', async()=>{
  const root=await mkdtemp(join(tmpdir(),'vitris-motion-order-'));
  await buildSite({site:{name:'Module ordering',scrollMotion:{version:1,policy:'enabled'}},theme:{},catalog:{},pages:[{path:'/',file:'index.html',title:'Ordering',body:'<h1>Primary content</h1><div style="height:1100px"></div><h2 id="proof" data-motion="entrance">Proof</h2><script type="module" src="/ready.js"></script>'}],outDir:root});
  const server=previewServer(root),handle=server.listeners('request')[0] as (req:any,res:any)=>void;
  server.removeAllListeners('request');server.on('request',(req,res)=>{if(req.url==='/ready.js')setTimeout(()=>{res.setHeader('Content-Type','text/javascript');res.end('document.body.dataset.ready="true"');},100);else handle(req,res);});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();await page.addInitScript('window.earlyMotionRead=false;const rect=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){if(this.hasAttribute("data-motion")&&!document.body.dataset.ready)window.earlyMotionRead=true;return rect.call(this)}');
    await page.goto(`http://127.0.0.1:${(server.address() as {port:number}).port}`);await page.waitForTimeout(50);
    assert.equal(await page.evaluate(()=>document.body.dataset.ready),'true');
    assert.equal(await page.evaluate(()=>window.earlyMotionRead),false,'motion must not force layout before module UI insertion');
    assert.equal(await page.evaluate(()=>window.VitrisMotion.inspect('proof').phase),'pending','motion still initializes and arms the offscreen proof');
  }finally{await browser.close();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));await rm(root,{recursive:true,force:true});}
});
