import test from "node:test";
import assert from "node:assert/strict";
import {chromium} from "playwright";
import {checkFocusOcclusion} from "./agent/browser-focus.ts";
test("long accessible skip destination is hit-tested within the visible viewport",async()=>{
  const browser=await chromium.launch({headless:true});
  try{for(const width of [375,1080]){const page=await browser.newPage({viewport:{width,height:900}});await page.setContent('<a class="skip-link" href="#main">Skip to main</a><header>Navigation</header><main id="main" tabindex="-1" style="height:5400px"><h1>Long substantive page</h1><p>Visible customer content</p></main>');
    const oldResult=await page.evaluate(`(()=>{const e=document.querySelector("main");e.focus();e.scrollIntoView({block:"nearest"});const r=e.getBoundingClientRect();return [.2,.5,.8].every(f=>r.top+r.height*f>=innerHeight);})()`);
    assert.equal(oldResult,true,"Reproduces the old offscreen-sample false failure");
    assert.deepEqual(await checkFocusOcclusion(page),[]);
    assert.equal(await page.locator("main").getAttribute("tabindex"),"-1");await page.close();
  }}finally{await browser.close();}
});
test("a genuine fixed overlay covering focused controls fails and valid removal recovers",async()=>{
  const browser=await chromium.launch({headless:true});
  try{const page=await browser.newPage({viewport:{width:375,height:900}});await page.setContent('<button id="action" style="position:absolute;top:100px;left:30px;width:200px;height:50px">Contact</button><div id="cover" style="position:fixed;inset:0;background:white;z-index:100">Blocking overlay</div>');
    assert.ok((await checkFocusOcclusion(page)).some(s=>s.includes("button#action")));await page.locator("#cover").evaluate(e=>e.remove());assert.deepEqual(await checkFocusOcclusion(page),[]);
  }finally{await browser.close();}
});
