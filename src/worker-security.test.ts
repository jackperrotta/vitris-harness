import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { formsBackend } from './test/forms-backend.ts';
import { allowLogin, consumeMagic, createSession, magicToken, pruneAuth, readSession, SESSION_COOKIE, sessionCookie } from './worker/auth.ts';
import { handleApp } from './worker/surfaces/app.ts';
import { route } from './worker/router.ts';
import { ensureSeed } from './worker/seed.ts';
import { sendMail } from './worker/gmail.ts';
import { defaultTheme } from './types.ts';
import type { Env } from './worker/env.ts';

const admin='https://admin.example.test';
const member={userId:'review-owner',email:'owner@example.invalid',tenantId:'review-a',role:'owner' as const};
const req=(path:string,options:RequestInit={})=>new Request(admin+path,options);
const post=(email:string,ip=crypto.randomUUID())=>req('/app/login',{method:'POST',headers:{origin:admin,'cf-connecting-ip':ip},body:new URLSearchParams({email})});
const cookie=(sid:string)=>`${SESSION_COOKIE}=${sid}`;

test('backend security: real D1 authentication, scoped previews and browser isolation',{timeout:120000},async t=>{
  const backend=await formsBackend();t.after(backend.dispose);
  const env={...backend.env,SESSION_SECRET:'local-security-test-session-secret-only',VITRIS_BACKEND_ORIGIN:admin,APP_HOST:'admin.example.test',PREVIEW_HOST_SUFFIX:'previews.example.test'} as Env;
  await env.DB.prepare("INSERT INTO tenants(id,slug,name,github_owner,github_repo) VALUES('review-a','review-a','Review A','synthetic','synthetic'),('review-b','review-b','Review B','synthetic','synthetic')").run();
  await env.DB.prepare("INSERT INTO users(id,email) VALUES('review-owner','owner@example.invalid')").run();
  await env.DB.prepare("INSERT INTO memberships(user_id,tenant_id,role) VALUES('review-owner','review-a','owner')").run();
  const count=async(table:string)=>(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{n:number}>())!.n;
  const mailed={...env,MAIL_API_KEY:'synthetic-mail-provider-value',MAIL_FROM:'signin@example.invalid'};
  await t.test('unconfigured production mail fails closed, including DEV_LOGIN, with no inline or logged credentials',async st=>{
    const logs:unknown[]=[];st.mock.method(console,'log',(...args:unknown[])=>logs.push(args));
    for(const email of [member.email,'unknown@example.invalid']) {
      const response=await handleApp({...env,DEV_LOGIN:'1'},post(email));
      assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/token=|Sign in as|owner@example/);
    }
    assert.equal(await count('auth_magic_tokens'),0);
    await assert.rejects(sendMail({...env,MAIL_FROM:'signin@example.invalid'},{to:[member.email],subject:'Sign in',text:'credential must never be logged'}),/not configured/);
    assert.equal(logs.length,0);
    let calls=0;st.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Network must not be used');});
    await ensureSeed(env,req('/'));
    assert.equal(await env.DB.prepare("SELECT id FROM users WHERE email='ops@demo.test'").first(),null);assert.equal(calls,0);
  });
  await t.test('mail errors and unknown users have the same response; failed delivery revokes the link',async st=>{
    st.mock.method(globalThis,'fetch',async()=>new Response('provider rejected secret body',{status:500}));
    const known=await handleApp(mailed,post(member.email)),unknown=await handleApp(mailed,post('unknown@example.invalid'));
    assert.equal(known.status,303);assert.equal(known.headers.get('location'),unknown.headers.get('location'));
    assert.equal(await count('auth_magic_tokens'),0);
  });
  await t.test('delivered links redeem atomically once under concurrency and set secure host-only cookies',async st=>{
    let link='';st.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
      link=(JSON.parse(init.body as string).text as string).match(/https:\/\/\S+/)![0]!;
      return Response.json({id:'synthetic-message'});
    });
    const login=await handleApp(mailed,post(member.email));assert.equal(login.status,303);assert.doesNotMatch(await login.text(),/token=/);
    const results=await Promise.all([handleApp(env,new Request(link)),handleApp(env,new Request(link))]);
    assert.equal(results.filter(r=>r.headers.has('set-cookie')).length,1);
    const header=results.find(r=>r.headers.has('set-cookie'))!.headers.get('set-cookie')!;
    assert.match(header,/^__Host-vitris_sid=/);assert.match(header,/; Secure/);assert.match(header,/; HttpOnly/);assert.doesNotMatch(header,/Domain=/i);
    const value=decodeURIComponent(header.split(';')[0]!.split('=')[1]!);
    assert.equal((await readSession(env,req('/app',{headers:{cookie:cookie(value)}})))?.email,member.email);
    const stored=await env.DB.prepare('SELECT session_json,id_hash FROM auth_sessions').first<{session_json:string;id_hash:string}>();
    assert.ok(stored);assert.notEqual(stored.id_hash,value);
  });
  await t.test('expiry, legacy KV rejection, logout revocation and CSRF protection',async()=>{
    const loginPage=await handleApp(env,req('/app/login'));assert.equal(loginPage.headers.get('x-frame-options'),'DENY');assert.equal(loginPage.headers.get('cache-control'),'no-store');
    const token=await magicToken(env,member.email);
    await env.DB.prepare('UPDATE auth_magic_tokens SET expires_at=0').run();assert.equal(await consumeMagic(env,token),null);
    const sid=await createSession(env,member),headers={cookie:cookie(sid)};
    assert.equal((await handleApp(env,req('/app/logout',{headers}))).status,405);
    assert.equal((await handleApp(env,req('/app/logout',{method:'POST',headers:{...headers,origin:'https://evil.test'}}))).status,403);
    assert.ok(await readSession(env,req('/app',{headers})));
    const logout=await handleApp(env,req('/app/logout',{method:'POST',headers:{...headers,origin:admin}}));
    assert.equal(logout.status,303);assert.match(logout.headers.get('set-cookie')!,/Max-Age=0/);
    assert.equal(await readSession(env,req('/app',{headers})),null);
    backend.sessions.set(`sess:${sid}`,JSON.stringify(member));assert.equal(await readSession(env,req('/app',{headers})),null);
    assert.equal(await readSession(env,req('/app',{headers:{cookie:`${SESSION_COOKIE}=%invalid`}})),null);
    assert.match(sessionCookie(sid),/; Secure/);assert.doesNotMatch(sessionCookie(sid,new Request('http://localhost/')),/; Secure/);
    assert.equal((await handleApp(env,new Request('http://remote.test/app/login'))).status,403);
    assert.equal((await handleApp(env,req('/app/login',{method:'POST',body:'email=owner@example.invalid'}))).status,403);
  });
  await t.test('atomic rate limits cover existing and unknown accounts without storing raw identities',async()=>{
    const email='rate-test@example.invalid';
    const allowed=await Promise.all(Array.from({length:12},()=>allowLogin(env,post(email,'same-source'),email)));
    assert.equal(allowed.filter(Boolean).length,5);
    const keys=await env.DB.prepare('SELECT key FROM auth_rate_limits').all<{key:string}>();
    assert.ok(keys.results.every(row=>!row.key.includes(email) && !row.key.includes('same-source')));
    const response=await handleApp(mailed,post(email,'same-source'));assert.equal(response.status,429);
  });

  const sid=await createSession(env,member),headers={cookie:cookie(sid)};
  let reads=0;
  const script=`window.securityRead='pending';window.securityWrite='pending';fetch('${admin}/app/leads',{credentials:'include'}).then(r=>r.text()).then(()=>window.securityRead='leaked').catch(()=>window.securityRead='blocked');fetch('${admin}/api/updates',{method:'POST',credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'prompt=unauthorized'}).then(()=>window.securityWrite='readable').catch(()=>window.securityWrite='blocked');`;
  const bundle={sha:'synthetic-sha',site:{name:'Synthetic private site',slug:'review-a'},theme:defaultTheme,catalog:{},pages:[{path:'/',file:'index.html',title:'Private preview',body:`<main><h1>Private preview</h1></main><script>${script}</script>`}]};
  const previews={...env,GITHUB_TOKEN:'synthetic-github-value',R2:{get:async()=>{reads++;return {text:async()=>JSON.stringify(bundle)};}}} as unknown as Env;
  await t.test('private previews require a scoped handoff and reject missing configuration and cross-tenant access',async()=>{
    assert.equal((await route(previews,req('/preview/review-a/'))).status,401);
    assert.equal((await route({...previews,PREVIEW_HOST_SUFFIX:undefined},req('/preview/review-a/',{headers}))).status,503);
    assert.equal((await route(previews,req('/preview/review-b/',{headers}))).status,404);
    assert.equal((await route(previews,new Request('https://review-a.previews.example.test/preview/review-a/'))).status,401);
    assert.equal((await route(previews,new Request('https://backend.example.test/assets/sites/review-a/bundle/synthetic-sha.json'))).status,404);
    assert.equal(reads,0);
  });
  const handoff=await route(previews,req('/preview/review-a/',{headers}));
  const location=handoff.headers.get('location')!;assert.equal(new URL(location).hostname,'review-a.previews.example.test');
  const entered=await route(previews,new Request(location));assert.equal(entered.status,303);
  const previewCookie=entered.headers.get('set-cookie')!.split(';')[0]!;
  const clean=entered.headers.get('location')!;
  await t.test('preview capabilities reject tampering, branch changes, other hosts and expired access',async st=>{
    const tampered=new URL(location);tampered.searchParams.set('access',tampered.searchParams.get('access')!+'a');
    assert.equal((await route(previews,new Request(tampered))).status,401);
    const other=new URL(location);other.hostname='review-b.previews.example.test';assert.equal((await route(previews,new Request(other))).status,401);
    assert.equal((await route(previews,new Request(clean+'?ref=private-branch',{headers:{cookie:previewCookie}}))).status,403);
    const now=Date.now();st.mock.method(Date,'now',()=>now+901000);
    assert.equal((await route(previews,new Request(clean,{headers:{cookie:previewCookie}}))).status,401);
  });
  await t.test('preview hosts never serve admin routes, APIs or service workers',async st=>{
    st.mock.method(globalThis,'fetch',async()=>Response.json({object:{sha:bundle.sha}}));
    for(const path of ['/app/login','/ops','/api/updates','/assets/sites/review-a/bundle/x.json','/preview/review-b/']) {
      const response=await route(previews,new Request('https://review-a.previews.example.test'+path,{headers:{cookie:previewCookie}}));assert.equal(response.status,404,path);
    }
    assert.equal((await route(previews,new Request(clean,{headers:{cookie:previewCookie,'service-worker':'script'}}))).status,403);
  });
  await t.test('Chromium: customer script cannot read admin responses or submit authenticated updates',async st=>{
    st.mock.method(globalThis,'fetch',async()=>Response.json({object:{sha:bundle.sha}}));
    let writeStatus=0,browserEnv=previews;
    // Use real HTTP: Playwright's fulfill helper can inject permissive CORS headers.
    const server=createServer((incoming,outgoing)=>{
      void (async()=>{
        const chunks:Buffer[]=[];for await(const chunk of incoming)chunks.push(Buffer.from(chunk));
        const url=`http://${incoming.headers.host}${incoming.url}`;
        const requestHeaders=new Headers();for(const [name,value] of Object.entries(incoming.headers))if(value)requestHeaders.set(name,Array.isArray(value)?value.join(', '):value);
        // Model credentialed same-site production requests despite localhost's
        // special SameSite handling; keep Chromium's real Origin and CORS rules.
        if (incoming.headers.host?.startsWith('admin.localhost:') && requestHeaders.has('origin')) requestHeaders.set('cookie',`vitris_sid=${sid}`);
        const request=new Request(url,{method:incoming.method,headers:requestHeaders,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
        const response=await route(browserEnv,request);
        if(new URL(url).pathname==='/api/updates')writeStatus=response.status;
        outgoing.writeHead(response.status,Object.fromEntries(response.headers));outgoing.end(Buffer.from(await response.arrayBuffer()));
      })().catch(()=>{outgoing.writeHead(500);outgoing.end('Test server error');});
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const port=(server.address() as AddressInfo).port,localAdmin=`http://admin.localhost:${port}`;
    const browserBundle={...bundle,pages:[{...bundle.pages[0]!,body:bundle.pages[0]!.body.replaceAll(admin,localAdmin)}]};
    browserEnv={...previews,VITRIS_BACKEND_ORIGIN:localAdmin,APP_HOST:'admin.localhost',PREVIEW_HOST_SUFFIX:'previews.localhost',R2:{get:async()=>({text:async()=>JSON.stringify(browserBundle)})}} as unknown as Env;
    const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP *.localhost 127.0.0.1']});
    st.after(async()=>{await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
    const context=await browser.newContext();
    await context.addCookies([{name:'vitris_sid',value:sid,domain:'admin.localhost',path:'/',secure:false,httpOnly:true,sameSite:'Lax'}]);
    const localHandoff=await route(browserEnv,new Request(localAdmin+'/preview/review-a/',{headers:{cookie:`vitris_sid=${sid}`}}));
    const page=await context.newPage();
    await page.goto(localAdmin+'/app/leads');assert.match(await page.content(),/owner@example.invalid/);
    await page.goto(localHandoff.headers.get('location')!);
    await page.waitForFunction(()=>{const w=globalThis as unknown as Record<string,string>;return w.securityRead==='blocked' && w.securityWrite==='blocked';});
    assert.equal(new URL(page.url()).hostname,'review-a.previews.localhost');assert.equal(writeStatus,403);
    assert.doesNotMatch(await page.evaluate('document.cookie') as string,/vitris_(?:sid|preview)=/);
    assert.match(await page.content(),/Private preview/);
  });
  await t.test('logout also revokes outstanding preview grants; expired auth records are pruned',async()=>{
    await handleApp(env,req('/app/logout',{method:'POST',headers:{...headers,origin:admin}}));
    assert.equal((await route(previews,new Request(clean,{headers:{cookie:previewCookie}}))).status,401);
    await env.DB.prepare('UPDATE auth_sessions SET expires_at=0').run();
    await env.DB.prepare('UPDATE auth_rate_limits SET expires_at=0').run();
    await pruneAuth(env);
    for(const table of ['auth_sessions','auth_magic_tokens','auth_rate_limits'])assert.equal(await count(table),0);
  });
});
