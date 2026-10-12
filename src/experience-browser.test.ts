import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {experienceJs,experienceArrivalBootstrap} from './runtime/experience.ts';
import {createServer} from 'node:http';
declare const document:any,window:any,DOMMatrix:any;
declare function getComputedStyle(element:any):any;
type HTMLElement=any;

test('route cover delays ordinary navigation, while reduced motion and same-page anchors remain immediate',async()=>{
 const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(`<html><body><a id="route" href="/next">Next chapter</a><a id="anchor" href="#chapter">Chapter</a><div id="chapter">Readable content</div><div data-experience-transition style="position:fixed;inset:0;visibility:hidden;background:black;color:white"></div><script>${experienceJs}</script></body></html>`);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.goto(base);await page.locator('#anchor').click();assert.equal(new URL(page.url()).hash,'#chapter');
  await page.locator('#route').click({noWaitAfter:true});await page.waitForTimeout(80);assert.equal(new URL(page.url()).pathname,'/');assert.equal(await page.locator('[data-experience-transition]').evaluate((el:HTMLElement)=>getComputedStyle(el).visibility),'visible');
  await page.waitForURL('**/next');assert.match(await page.locator('#chapter').innerText(),/Readable/);
  const reduced=await browser.newPage({reducedMotion:'reduce'});await reduced.goto(base);const started=Date.now();await reduced.locator('#route').click();assert.equal(new URL(reduced.url()).pathname,'/next');assert.ok(Date.now()-started<800,'reduced navigation bypasses the 930ms cover/hold');
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

const fixture=`<html data-motion-policy="enabled"><style>body{margin:0;height:2400px}.row{display:block;margin:260px 50px 50px;width:900px;height:90px}#preview{width:310px;height:230px;position:fixed;left:0;top:0;pointer-events:none}#disk{width:86px;height:86px;position:fixed;left:0;top:0;pointer-events:none}#magnet{display:block;margin:40px 100px;width:180px;height:180px}#track{display:flex;width:max-content;animation:slide 18s linear infinite}#track span{display:block;width:660px;height:40px}@keyframes slide{to{transform:translateX(-50%)}}[data-visible=false]{visibility:hidden}</style><div id="track" data-experience-marquee-speed="73"><span>Name</span><span>Name</span></div><a href="#" class="row" data-experience-image="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" data-experience-name="Example">Chapter</a><div id="preview" data-experience-preview data-visible="false"><img></div><div id="disk" data-experience-cursor data-visible="false"><span data-experience-label></span></div><button id="magnet" data-experience-magnetic>Action</button></html>`;
async function run(options:any,fn:(page:any)=>Promise<void>){const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1080,height:900},...options});await page.setContent(fixture);await page.addScriptTag({content:experienceJs});await page.evaluate(()=>new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve))));await fn(page);}finally{await browser.close();}}

test('preview follows progressively, stays bounded, and keyboard focus reveals the matching chapter',()=>run({},async page=>{
 await page.mouse.move(400,345);await page.mouse.move(800,345);
 await page.waitForFunction(()=>new DOMMatrix(getComputedStyle(document.querySelector('#preview')).transform).m41>245);
 const x=()=>page.locator('#preview').evaluate((el:HTMLElement)=>el.getBoundingClientRect().x+155);
 const early=await x();assert.ok(early>400&&early<790,`soft follower starts between endpoints: ${early}`);
 await page.waitForTimeout(250);const later=await x();assert.ok(later>early&&later<801);
 await page.locator('.row').focus();assert.equal(await page.locator('#preview').getAttribute('data-visible'),'true');assert.equal(await page.locator('[data-experience-label]').innerText(),'View Example');
 await page.locator('#magnet').focus();assert.equal(await page.locator('#preview').getAttribute('data-visible'),'false');
}));

test('magnetic action stays within eight pixels and returns, while pause removes motion and pending followers',()=>run({},async page=>{
 await page.mouse.move(260,480);await page.waitForTimeout(430);
 const offset=await page.locator('#magnet').evaluate((el:HTMLElement)=>new DOMMatrix(getComputedStyle(el).transform).m41);assert.ok(offset>0&&offset<=8.01);
 await page.mouse.move(10,10);await page.waitForTimeout(1300);assert.equal(await page.locator('#magnet').evaluate((el:HTMLElement)=>new DOMMatrix(getComputedStyle(el).transform).m41),0);
 await page.mouse.move(400,345);await page.mouse.move(800,345);await page.evaluate(()=>document.documentElement.dataset.motionPolicy='off');await page.waitForTimeout(50);assert.equal(await page.locator('#preview').getAttribute('data-visible'),'false');
 await page.evaluate(()=>(window as any).VitrisExperience.dispose());await page.mouse.move(400,345);assert.equal(await page.locator('#preview').getAttribute('data-visible'),'false');
}));

test('scroll changes marquee direction without an endpoint jump',()=>run({},async page=>{
 await page.evaluate(()=>window.scrollTo(0,250));await page.waitForTimeout(100);
 const first=await page.locator('#track').evaluate((el:HTMLElement)=>({x:new DOMMatrix(getComputedStyle(el).transform).m41,rate:el.getAnimations()[0]!.playbackRate}));assert.equal(first.rate,1);
 await page.evaluate(()=>window.scrollTo(0,200));await page.waitForTimeout(50);
 const second=await page.locator('#track').evaluate((el:HTMLElement)=>({x:new DOMMatrix(getComputedStyle(el).transform).m41,rate:el.getAnimations()[0]!.playbackRate}));assert.equal(second.rate,-1);assert.ok(Math.abs(second.x-first.x)<20);
}));

test('reduced motion and touch inputs never activate pointer choreography',async()=>{for(const options of [{reducedMotion:'reduce'},{hasTouch:true,isMobile:true}])await run(options,async page=>{await page.mouse.move(400,345);await page.mouse.move(800,345);await page.waitForTimeout(80);assert.equal(await page.locator('#preview').getAttribute('data-visible'),'false');});});

test('fresh arrival and native route handoff have a real covered-to-curved-to-settled reveal',async()=>{
 const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(`<html><head><script>${experienceArrivalBootstrap()}</script><style>[data-experience-transition]{position:fixed;inset:-12vh 0;visibility:hidden;transform:translateY(115%);background:#1d1e20;color:white}html[data-experience-arrival] [data-experience-transition]{visibility:visible;transform:translateY(0);border-radius:0}</style></head><body><h1 data-experience-opening>Immediately readable destination</h1><a id="next" href="/next">About</a><div data-experience-transition data-experience-arrival="Hello.">Hello.</div><script>${experienceJs}</script></body></html>`);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+(server.address() as {port:number}).port;const browser=await chromium.launch();
 try{const page=await browser.newPage();await page.goto(url);const curtain=page.locator('[data-experience-transition]');assert.equal(await curtain.getAttribute('data-state'),'arrival-hold');assert.equal(await curtain.evaluate((el:HTMLElement)=>getComputedStyle(el).visibility),'visible');await page.waitForTimeout(620);assert.equal(await curtain.getAttribute('data-state'),'revealing');const moving=await curtain.evaluate((el:HTMLElement)=>({y:new DOMMatrix(getComputedStyle(el).transform).m42,radius:getComputedStyle(el).borderRadius}));assert.ok(moving.y<0);assert.notEqual(moving.radius,'0px');await page.waitForFunction(()=>!document.documentElement.dataset.experienceArrival);await page.locator('#next').click();await page.waitForURL('**/next');await page.waitForFunction(()=>document.querySelector('[data-experience-transition]').dataset.state==='revealing');assert.equal(await curtain.evaluate((el:HTMLElement)=>getComputedStyle(el).visibility),'visible');await page.waitForFunction(()=>!document.documentElement.dataset.experienceArrival);assert.equal(await curtain.evaluate((el:HTMLElement)=>getComputedStyle(el).visibility),'hidden');await page.reload();assert.equal(await page.locator('html').getAttribute('data-experience-arrival'),null);
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('arrival fails open without the runtime, and saved pause or reduced motion skip it',async()=>{
 const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(`<html><head><script>${experienceArrivalBootstrap()}</script></head><body><h1>Content</h1></body></html>`);});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+(server.address() as {port:number}).port;const browser=await chromium.launch();
 try{const page=await browser.newPage();await page.goto(url);assert.equal(await page.locator('html').getAttribute('data-experience-arrival'),'initial');await page.waitForFunction(()=>!document.documentElement.dataset.experienceArrival,{},{timeout:4500});await page.evaluate(()=>localStorage.setItem('vitris-experience-paused','true'));await page.reload();assert.equal(await page.locator('html').getAttribute('data-experience-arrival'),null);const reduced=await browser.newPage({reducedMotion:'reduce'});await reduced.goto(url);assert.equal(await reduced.locator('html').getAttribute('data-experience-arrival'),null);
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('keyboard navigation requested during arrival waits for its lift, and live reduction cancels travel',async()=>{
 const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(`<html><head><script>${experienceArrivalBootstrap()}</script><style>[data-experience-transition]{position:fixed;inset:-12vh 0;visibility:hidden;transform:translateY(115%);background:black}html[data-experience-arrival] [data-experience-transition]{visibility:visible;transform:translateY(0)}</style></head><body><h1>Destination</h1><a id="next" href="/next">About</a><div data-experience-transition data-experience-arrival="Hello.">Hello.</div><script>${experienceJs}</script></body></html>`);});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+(server.address() as {port:number}).port;const browser=await chromium.launch();
 try{const page=await browser.newPage();await page.goto(url);await page.locator('#next').focus();const requested=Date.now();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-experience-transition]').getAttribute('data-state'),'arrival-hold');await page.waitForFunction(()=>document.querySelector('[data-experience-transition]').dataset.state==='covering');assert.ok(Date.now()-requested>900,'outgoing cover must follow the initial lift');await page.waitForURL('**/next');await page.waitForFunction(()=>document.querySelector('[data-experience-transition]').dataset.state==='revealing');await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(50);assert.equal(await page.locator('[data-experience-transition]').evaluate((el:HTMLElement)=>getComputedStyle(el).visibility),'hidden');assert.equal(await page.locator('html').getAttribute('data-experience-arrival'),null);
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
