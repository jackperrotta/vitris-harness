import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { formsBackend } from './test/forms-backend.ts';
import { handleApi } from './worker/surfaces/api.ts';
import { processFormOutbox } from './worker/form-outbox.ts';
import { formsCommand } from './cli/forms.ts';
import { createSite } from './cli/site-create.ts';
import { previewServer } from './build/serve.ts';
import { buildVerified } from './build/verified.ts';
import { verifyPreservedSite } from './preserve/verify.ts';
import { capturePreservedSite } from './preserve/capture.ts';

async function fictionalPreservedFixture(root:string) {
  const routes=['/','/contact','/subcontractors','/about','/services','/work','/faq','/privacy','/terms'];
  const server=createServer((req,res)=>{
    const path=new URL(req.url||'/','http://fixture.invalid').pathname;
    if(!routes.includes(path)){res.writeHead(404).end();return;}
    const form=['/contact','/subcontractors'].includes(path)?'<form data-lead-form><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Phone<input name="phone" type="tel"></label><label>Message<textarea name="message" required></textarea></label><a role="button" tabindex="0" data-vitrisid="emailSendButton">Send</a></form>':'';
    res.setHeader('content-type','text/html');res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional builder</title><style>body{font:18px Arial;max-width:60rem;margin:auto;padding:24px}nav{display:flex;flex-wrap:wrap;gap:16px}label{display:block;margin:12px 0}input,textarea{display:block;box-sizing:border-box;max-width:100%;width:28rem;min-height:44px}a[role=button]{display:inline-block;padding:14px;color:white;background:#173934;cursor:pointer}</style><v1-full-site-renderer><div id="fullSiteRenderer"><nav>${routes.map(p=>`<a href="${p}">${p==='/'?'Home':p.slice(1)}</a>`).join('')}</nav><main><h1>Fictional builder ${path}</h1><p>Original synthetic preservation and forms acceptance fixture. No customer content.</p>${form}</main></div></v1-full-site-renderer></html>`);
  });
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
  try {
    const from=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const result=await createSite({dir:root,slug:'fictional-preserved',name:'Fictional preserved builder',mode:'preserve',from});assert.equal(result.ok,true,result.error);
    await capturePreservedSite(root);await buildVerified(root);
  } finally {server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
}

test('fictional preserved and new custom sites use the same isolated D1 backend on desktop/mobile', {timeout:300000},async t=>{
  const evidence=resolve('artifacts/contact-forms',`browser-${Date.now()}`); mkdirSync(evidence,{recursive:true});
  const original=join(evidence,'fictional-source');await fictionalPreservedFixture(original);
  const backend=await formsBackend(), {env}=backend;
  let sources=0;
  const api=createServer(async(req,res)=>{
    try {
      const chunks:Buffer[]=[]; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const headers=new Headers(); for (const [name,value] of Object.entries(req.headers)) if(value)headers.set(name,Array.isArray(value)?value.join(','):value);
      headers.set('cf-connecting-ip',`isolated-browser-${++sources}`);
      const response=await handleApi(env,new Request(`${apiOrigin}${req.url}`,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}));
      res.writeHead(response.status,Object.fromEntries(response.headers.entries()));res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(500);res.end('Isolated backend failure');}
  });
  await new Promise<void>(done=>api.listen(0,'127.0.0.1',done));
  t.after(async()=>{api.closeAllConnections();await new Promise<void>(done=>api.close(()=>done()));await backend.dispose();});
  const apiOrigin=`http://127.0.0.1:${(api.address() as {port:number}).port}`;
  const actualFetch=globalThis.fetch;
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,options?:RequestInit)=>{
    if(String(input).includes('challenges.cloudflare.com/turnstile/v0/siteverify')) {
      const values=options!.body as URLSearchParams,token=values.get('response') || '';
      return new Response(JSON.stringify({success:token.startsWith('isolated:'),hostname:token.split(':')[1],action:token.split(':')[2]}));
    }
    return actualFetch(input,options);
  });
  const dwRoot=join(evidence,'preserved');
  for(const file of ['launch.json','preserved','onboarding']) cpSync(join(original,file),join(dwRoot,file),{recursive:true});
  const customRoot=join(evidence,'custom');
  const custom=await createSite({dir:customRoot,slug:'forms-custom',name:'Fictional custom site',blank:true});assert.equal(custom.ok,true,custom.error);
  const customForm='<form data-lead-form><label>Name<input name="name" required maxlength="64"></label><label>Email<input type="email" name="email" required maxlength="254"></label><label>Phone<input type="tel" name="telephone" maxlength="14"></label><label>Requested action<input name="action" value="quote"></label><label>Dataset<input name="dataset" value="legacy-field"></label><label>Validity preference<input name="reportValidity" value="standard"></label><label>Trade<select name="trade" required><option value="">Choose</option><option value="carpentry">Carpentry</option><option value="masonry">Masonry</option></select></label><label><input type="checkbox" name="services" value="design">Design</label><label><input type="checkbox" name="services" value="build">Build</label><label>Message<textarea name="message" maxlength="5000" required></textarea></label><button type="submit">Send</button></form>';
  writeFileSync(join(customRoot,'pages/index.html'),'<h1>Fictional custom site</h1><a href="/contact">Contact</a>');
  writeFileSync(join(customRoot,'pages/contact.html'),'<h1>Contact</h1>'+customForm);
  await buildVerified(customRoot);
  const dwLaunch=JSON.parse(readFileSync(join(dwRoot,'launch.json'),'utf8'));
  assert.equal(dwLaunch.backendOrigin,''); assert.equal(JSON.parse(readFileSync(join(dwRoot,'onboarding/preserve.json'),'utf8')).pages.length,9);
  const browser=await chromium.launch({headless:true});
  const servers:ReturnType<typeof previewServer>[]=[];
  const checks:unknown[]=[];
  try {
    for (const [site,tenant,paths] of [[dwRoot,'dw-test',['/contact','/subcontractors']],[customRoot,'custom-test',['/contact']]] as const) {
      const web=previewServer(join(site,'dist'));servers.push(web);await new Promise<void>(done=>web.listen(0,'127.0.0.1',done));
      const origin=`http://127.0.0.1:${(web.address() as {port:number}).port}`;
      process.env.VITRIS_FORMS_SETUP_TOKEN=`${tenant}-secret-with-at-least-32-characters`;
      env.FORMS_SETUP_TOKENS=JSON.stringify({...JSON.parse(env.FORMS_SETUP_TOKENS!),[tenant]:process.env.VITRIS_FORMS_SETUP_TOKEN});
      const setup=await formsCommand('setup',{site,tenant,backendOrigin:apiOrigin,origins:[origin],mode:'test',testKeys:true,apply:true});
      assert.equal(setup.ok,true,setup.error);
      const configBefore=await env.DB.prepare('SELECT COUNT(*) n FROM contact_forms').first<{n:number}>();
      const rerun=await formsCommand('setup',{site,tenant,backendOrigin:apiOrigin,origins:[origin],mode:'test',testKeys:true,apply:true});assert.equal(rerun.ok,true,rerun.error);
      assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM contact_forms').first<{n:number}>())?.n,configBefore?.n);
      for(const width of [390,1440])for(const path of paths){
        const context=await browser.newContext({viewport:{width,height:1000}}), page=await context.newPage();
        let challengeLoads=0,posts=0;
        await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*',route=>{challengeLoads++;return route.fulfill({contentType:'application/javascript',body:'window.turnstile={render:(el,opts)=>{el.innerHTML="<p role=status>Isolated security-check fixture</p>";setTimeout(()=>opts.callback("isolated:"+location.hostname+":"+opts.action+":"+crypto.randomUUID()),0);return "fixture"},reset:()=>{}}'});});
        page.on('request',req=>{if(req.url().startsWith(apiOrigin+'/api/leads')&&req.method()==='POST')posts++;});
        await page.goto(origin+path); assert.equal(challengeLoads,0,'Resting page must not load challenge');
        const form=page.locator('form[data-vitris-form]').first();
        await form.locator('[name="name"]').fill('Fictional Browser Visitor'); await form.locator('[name="email"]').fill('browser@example.invalid');
        await form.locator('[name="message"]').fill(`Fictional acceptance ${tenant} ${path} ${width}`);
        await form.locator('input[type="tel"]').fill('5705550100');
        if(tenant==='custom-test'){await form.locator('select').selectOption('carpentry');await form.locator('[value="design"]').check();await form.locator('[value="build"]').check();}
        // Keyboard submission exercises the preserved anchor-button adapter too.
        const send=form.locator('[data-vitrisid="emailSendButton"], button[type="submit"]').first(); await send.focus();await page.keyboard.press('Enter');
        await form.evaluate((f:any)=>f.requestSubmit());
        await page.getByText('Test message accepted. No customer email will be sent.',{exact:true}).waitFor();
        assert.equal(posts,1);assert.equal(challengeLoads,1);assert.equal(await form.locator('[name="name"]').inputValue(),'Fictional Browser Visitor');
        assert.equal(await form.getAttribute('aria-busy'),null);
        const axe=await new AxeBuilder({page}).include('form[data-vitris-form]').analyze(); assert.deepEqual(axe.violations,[],JSON.stringify(axe.violations.map(v=>({id:v.id,nodes:v.nodes.length}))));
        const image=`${tenant}-${path.slice(1)}-${width}.png`;await page.screenshot({path:join(evidence,image),fullPage:true});
        checks.push({tenant,path,width,posts,challengeLoads,accessibilityViolations:axe.violations.length,screenshot:image});await context.close();
      }
      const status=await formsCommand('status',{site,tenant,backendOrigin:apiOrigin});assert.equal(status.ok,true,status.error);
      if(tenant==='custom-test') {
        const context=await browser.newContext(), page=await context.newPage();
        await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*',route=>route.fulfill({contentType:'application/javascript',body:'let callback,action;const deliver=()=>setTimeout(()=>callback("isolated:"+location.hostname+":"+action+":"+crypto.randomUUID()),0);window.turnstile={render:(el,opts)=>{callback=opts.callback;action=opts.action;deliver();return "fixture"},reset:()=>{if(document.querySelector(".vitris-challenge").style.display!=="none")deliver()}}'}));
        const keys:string[]=[];
        await page.route(`${apiOrigin}/api/leads*`,async route=>{
          const params=new URLSearchParams(route.request().postData() || '');keys.push(params.get('idempotency_key')!);
          if(keys.length===1){const response=await route.fetch();assert.equal(response.status(),201);await route.abort();}else await route.continue();
        });
        await page.goto(origin+'/contact');
        const form=page.locator('form[data-vitris-form]');await form.locator('[name="name"]').fill('Lost response visitor');await form.locator('[name="email"]').fill('retry@example.invalid');await form.locator('[name="message"]').fill('Lost response retry keeps one durable record');await form.locator('select').selectOption('masonry');
        await form.locator('button[type="submit"]').click();await page.getByText(/Acceptance could not be confirmed/).waitFor();
        assert.equal(await form.locator('[name="message"]').inputValue(),'Lost response retry keeps one durable record');
        await form.locator('button[type="submit"]').click();await page.getByText('Test message accepted. No customer email will be sent.',{exact:true}).waitFor();
        assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
        const receipt=await env.DB.prepare('SELECT COUNT(*) n FROM form_submissions WHERE idempotency_key=?').bind(keys[0]).first<{n:number}>();assert.equal(receipt?.n,1);
        checks.push({tenant,scenario:'lost-response-retry',posts:keys.length,durableRecords:receipt?.n,retainsValues:true});
        await form.locator('[name="message"]').fill('A distinct follow-up inquiry');
        const followup=page.waitForResponse(response=>response.url().startsWith(apiOrigin+'/api/leads') && response.status()===201);
        await form.locator('button[type="submit"]').click();await followup;
        await page.getByText('Test message accepted. No customer email will be sent.',{exact:true}).waitFor();
        assert.equal(keys.length,3);assert.notEqual(keys[2],keys[1]);
        checks.push({tenant,scenario:'distinct-follow-up',newIdempotencyKey:true,challengeVisible:true});await context.close();
        const noJs=await browser.newContext({javaScriptEnabled:false}), fallback=await noJs.newPage();await fallback.goto(origin+'/contact');
        await fallback.getByText('This form needs JavaScript and a security check. Please use the listed contact details.',{exact:true}).waitFor();
        await fallback.locator('[name="name"]').fill('No script visitor');await fallback.locator('[name="email"]').fill('fallback@example.invalid');await fallback.locator('[name="message"]').fill('Must not bypass security');await fallback.locator('select').selectOption('masonry');
        await fallback.locator('button[type="submit"]').click();await fallback.getByText(/Your message could not be accepted/).waitFor();
        checks.push({tenant,scenario:'javascript-unavailable',nativePost:'rejected',accessibleFallback:true});await noJs.close();
      }
    }
    await processFormOutbox(env,{send:async()=>{throw new Error('No customer email permitted');}});
    const rows=await env.DB.prepare('SELECT s.form_id,s.mode,s.phone,s.fields_json,o.status,o.test_output FROM form_submissions s JOIN form_outbox o ON s.id=o.id ORDER BY s.form_id').all();
    assert.equal(rows.results.length,8); assert.ok(rows.results.every(r=>r.mode==='test' && r.status==='captured'));assert.equal(rows.results.filter(r=>r.phone==='5705550100').length,6);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM leads').first<{n:number}>())?.n,1);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM analytics_events').first<{n:number}>())?.n,0);
    writeFileSync(join(evidence,'acceptance.json'),JSON.stringify({isolated:true,challenge:'deterministic fixture; server verifies hostname/action',realEmailSends:0,checks,notifications:rows.results},null,2));
    const report=await verifyPreservedSite(dwRoot);assert.equal(report.ok,true,JSON.stringify(report.failures));
    writeFileSync(join(evidence,'preservation.json'),JSON.stringify(report,null,2));
    assert.equal(JSON.parse(readFileSync(join(original,'launch.json'),'utf8')).backendOrigin,'','Original acceptance preview must remain disabled');
  } finally {
    delete process.env.VITRIS_FORMS_SETUP_TOKEN;
    await browser.close();for(const server of servers)await new Promise<void>(done=>server.close(()=>done()));
  }
});
