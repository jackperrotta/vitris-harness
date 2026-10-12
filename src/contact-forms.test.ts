import test from 'node:test';
import assert from 'node:assert/strict';
import { formsBackend } from './test/forms-backend.ts';
import { configureForms, formReadiness, handleFormsAdmin, handleFormSubmission, formRateLimit, retryNotification } from './worker/forms.ts';
import { processFormOutbox, cloudflareEmailProvider } from './worker/form-outbox.ts';
import { handleApi } from './worker/surfaces/api.ts';
import { handleApp } from './worker/surfaces/app.ts';
import { validateFormConfig, type FormConfig } from './forms/config.ts';
import { allocateWidget, reconcileWidget, provisionWidgetSecrets, listWidgets } from './forms/cloudflare.ts';
import { connectForms, inspectForms } from './forms/frontend.ts';

export const config=(tenant:string,mode:FormConfig['mode']='test'):FormConfig=>({id:`${tenant}_contact`,mode,origins:[`https://${tenant}.example.test`],recipients:mode==='live'?['owner@example.invalid']:[],turnstile:{sitekey:'sitekey_live',secretRef:mode==='live'?'live':'test',action:'contact'},fields:[{name:'name',type:'text',maxLength:64,required:true,map:'name'},{name:'email',type:'email',required:true,maxLength:254,map:'email'},{name:'number',type:'tel',maxLength:14,map:'phone'},{name:'message',type:'textarea',maxLength:5000,required:true,map:'message'},{name:'trade',type:'select',maxLength:30,options:['carpentry','masonry']},{name:'services',type:'checkbox',maxLength:30,options:['design','build']}]});

test('provisioning rejects malformed secret maps before API calls and omits secrets from plans',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(JSON.stringify({success:true,result:[{sitekey:'public_key',name:'vitris-forms-pool-1',domains:['example.test'],secret:'fictional-private-key'}]}));});
  for(const bad of [null,[],123,'text',{test:123},{test:''}])await assert.rejects(provisionWidgetSecrets({account:'account',token:'fictional'},'worker',bad),/secret map/);
  assert.equal(calls,0);
  const widgets=await listWidgets({account:'account',token:'fictional'});assert.equal(calls,1);assert.equal('secret' in widgets[0]!,false);
});

test('shared forms: real local D1 migrations, isolation, security, atomic acceptance, durable outbox', {timeout:120000},async t=>{
  const backend=await formsBackend(), {env}=backend; t.after(backend.dispose);
  await configureForms(env,'a',[config('a')],{slug:'a',name:'Tenant A'});
  await configureForms(env,'b',[config('b')],{slug:'b',name:'Tenant B'});
  let verifications=0;
  const verificationKeys:string[]=[];
  t.mock.method(globalThis,'fetch',async (_url:unknown, options:{body:URLSearchParams})=>{
    verifications++;
    verificationKeys.push(options.body.get('idempotency_key')!);
    const token=options.body.get('response') || '';
    if (token==='unavailable') throw new Error('Temporary failure');
    return new Response(JSON.stringify({success:!token.startsWith('invalid'),hostname:token.startsWith('hostwrong')?'wrong.test':token.split(':')[0],action:token.startsWith('actionwrong')?'payment':'contact'}),{headers:{'content-type':'application/json'}});
  });
  const count=async(table:string)=> (await env.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first<{n:number}>())!.n;
  let source=0;
  const submit=(overrides:Record<string,string>={}, options:{origin?:string;form?:string;ip?:string;headers?:Record<string,string>}={})=>{
    const origin=options.origin ?? 'https://a.example.test',form=options.form ?? 'a_contact';
    const body=new URLSearchParams({form_id:form,idempotency_key:crypto.randomUUID(),name:'Fictional Visitor',email:'visitor@example.invalid',number:'5705550100',message:'Fictional test inquiry',trade:'carpentry',page_path:'/contact','cf-turnstile-response':`${new URL(origin || 'https://a.example.test').hostname}:${crypto.randomUUID()}`,...overrides});
    return new Request('http://127.0.0.1:8787/api/leads',{method:'POST',headers:{origin,accept:'application/json','cf-connecting-ip':options.ip || `test-${++source}`,...options.headers},body});
  };
  await t.test('additive migrations retain lead and site configuration',async()=>{
    assert.equal((await env.DB.prepare("SELECT name FROM leads WHERE id='legacy-lead'").first<{name:string}>())?.name,'Preserved Person');
    assert.equal((await env.DB.prepare("SELECT json FROM site_config WHERE tenant_id='legacy'").first<{json:string}>())?.json,'{"preserved":true}');
    assert.equal(await count('contact_forms'),2);
  });
  await t.test('configuration validates fields, choices, email safety and exact origins',()=>{
    assert.throws(()=>validateFormConfig({...config('a'),origins:['https://*.pages.dev']}));
    assert.throws(()=>validateFormConfig({...config('a'),recipients:['evil@example.com\r\nBcc: victim@example.com']}));
    assert.throws(()=>validateFormConfig({...config('a'),recipients:['invalid..local@example.com']}));
    assert.throws(()=>validateFormConfig({...config('a'),fields:[...config('a').fields,{name:'from',type:'text',maxLength:50}]}));
    assert.throws(()=>validateFormConfig({...config('a'),fields:[{name:'email',type:'text',map:'email',required:true,maxLength:254}]}));
    assert.throws(()=>validateFormConfig({...config('a'),turnstile:{...config('a').turnstile,action:'a'.repeat(33)}}));
    assert.throws(()=>validateFormConfig({...config('a'),fields:[...config('a').fields,{name:'custom',type:'text',maxLength:50,options:false}]}));
  });
  await t.test('malformed server secret maps remain visible and reject acceptance',async()=>{
    for(const value of ['null','[]','1','"text"','{"test":123}','{"live":{}}']){
      const malformed={...env,FORMS_TURNSTILE_SECRETS:value};
      assert.ok(formReadiness(malformed,config('a')).includes('Turnstile secret'));
      assert.ok(formReadiness(malformed,config('a','live')).includes('Turnstile secret'));
      assert.equal((await handleApi(malformed,submit())).status,503);
    }
  });
  await t.test('tenant-scoped management denies cross-tenant reads, writes, retries and CSRF',async()=>{
    const aToken='tenant-a-secret-with-at-least-32-characters';
    const call=(tenant:string,method='GET',body?:unknown,token=aToken)=>handleFormsAdmin(env,new Request(`https://backend.test/api/forms/${tenant}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
    assert.equal((await call('a')).status,200);
    const status=await (await call('a')).json() as {forms:{liveMissing:string[]}[]};assert.ok(status.forms[0]!.liveMissing.includes('Notification recipients'));
    assert.equal((await call('b')).status,401);
    assert.equal((await call('b','POST',{forms:[config('b')]})).status,401);
    assert.equal((await handleFormsAdmin(env,new Request('https://backend.test/api/forms/b/retry',{method:'POST',headers:{authorization:`Bearer ${aToken}`,'content-type':'application/json'},body:'{"id":"other"}'}))).status,401);
    await assert.rejects(configureForms(env,'b',[config('a')]),/another tenant/);
    await assert.rejects(configureForms(env,'b',[{...config('b'),origins:config('a').origins}]),/another tenant/);
    backend.sessions.set('sess:owner-a',JSON.stringify({userId:'owner-a',email:'a@example.invalid',tenantId:'a',role:'owner'}));
    assert.equal((await handleFormsAdmin(env,new Request('https://backend.test/api/forms/a',{method:'POST',headers:{cookie:'vitris_sid=owner-a',origin:'https://evil.test','content-type':'application/json'},body:'{}'}))).status,401);
    assert.equal((await handleFormsAdmin(env,new Request('https://backend.test/api/forms/b',{headers:{cookie:'vitris_sid=owner-a'}}))).status,401);
  });
  await t.test('exact origins, tenant mismatch, content types and preflight',async()=>{
    for (const origin of ['https://b.example.test','https://unapproved.pages.dev','https://a.example.test.evil.test','']) assert.equal((await handleApi(env,submit({}, {origin}))).status,403);
    assert.equal((await handleApi(env,submit({tenant_id:'b'}))).status,403);
    await env.DB.prepare("INSERT INTO hostnames(hostname,tenant_id) VALUES('a.example.test','b')").run();
    assert.equal((await handleApi(env,submit())).status,403);
    await env.DB.prepare("DELETE FROM hostnames WHERE hostname='a.example.test'").run();
    assert.equal((await handleApi(env,submit({}, {headers:{'content-type':'application/json'}}))).status,415);
    const preflight=new Request('http://127.0.0.1:8787/api/leads?form_id=a_contact',{method:'OPTIONS',headers:{origin:'https://a.example.test','access-control-request-method':'POST','access-control-request-headers':'Content-Type'}});
    const r=await handleApi(env,preflight); assert.equal(r.status,204); assert.equal(r.headers.get('access-control-allow-origin'),'https://a.example.test');
    assert.equal((await handleApi(env,new Request(preflight,{headers:{origin:'https://evil.test','access-control-request-method':'POST'}}))).status,403);
    assert.equal((await handleApi(env,submit({}, {form:'unknown'}))).status,403);
  });
  await t.test('malformed, oversized, unknown, required, header injection, choices, honeypot, duplicate fields',async()=>{
    const invalid:Record<string,string>[]=[{name:''},{email:'unsafe@example.com\r\nBcc: a@example.com'},{message:'x'.repeat(5001)},{recipients:'evil@example.com'},{company_url:'bot'},{trade:'electrical'},{'cf-turnstile-response':''},{idempotency_key:'not-uuid'}];
    for (const value of invalid) assert.equal((await handleApi(env,submit(value))).status,400);
    assert.equal((await handleApi(env,submit({message:'x'.repeat(33000)}))).status,413);
    const dupe=submit(), b=new URLSearchParams(await dupe.text()); b.append('email','another@example.invalid');
    assert.equal((await handleApi(env,new Request(dupe,{body:b}))).status,400);
    assert.equal(await count('form_submissions'),0);
  });
  await t.test('outbox insertion failure rolls back the entire acceptance transaction',async()=>{
    await env.DB.prepare("CREATE TRIGGER reject_outbox BEFORE INSERT ON form_outbox BEGIN SELECT RAISE(ABORT,'fixture failure'); END").run();
    const req=submit(),body=await req.text();assert.equal((await handleApi(env,new Request(req,{body}))).status,503);
    const firstKey=verificationKeys.at(-1);
    assert.equal(await count('form_submissions'),0);assert.equal(await count('form_outbox'),0);assert.equal(await count('leads'),1);assert.equal(await count('analytics_events'),0);
    await env.DB.prepare('DROP TRIGGER reject_outbox').run();
    const retry=new URLSearchParams(body);retry.set('cf-turnstile-response',`a.example.test:${crypto.randomUUID()}`);
    const accepted=await handleApi(env,new Request(req,{body:retry}));assert.equal(accepted.status,201);assert.notEqual(verificationKeys.at(-1),firstKey);
    await env.DB.prepare('DELETE FROM form_submissions WHERE id=?').bind((await accepted.json() as {leadId:string}).leadId).run();
  });
  await t.test('disabled and missing readiness fail closed; backend origin cannot activate',async()=>{
    await configureForms(env,'a',[{...config('a'),mode:'disabled'}]);
    assert.equal((await handleApi(env,submit())).status,403);
    await configureForms(env,'a',[config('a')]);
    assert.equal((await handleFormSubmission({...env,FORMS_TURNSTILE_SECRETS:'{}'},submit())).status,503);
    await assert.rejects(configureForms({...env,FORMS_EMAIL:undefined},'a',[config('a','live')]),/Live readiness/);
    assert.ok(formReadiness({...env,FORMS_SENDER_READY:undefined},config('a','live')).length);
  });
  await t.test('server checks challenge success, expected hostname/action and service failure',async()=>{
    for (const token of ['invalid:a','hostwrong:a','actionwrong:a']) assert.equal((await handleApi(env,submit({'cf-turnstile-response':token}))).status,400);
    assert.equal((await handleApi(env,submit({'cf-turnstile-response':'unavailable'}))).status,503);
  });
  await t.test('strict atomic per-source and per-tenant limits under concurrency',async()=>{
    const same=await Promise.all(Array.from({length:30},()=>formRateLimit(env,'rate-a','same',1000000)));
    assert.equal(same.filter(Boolean).length,10);
    const tenants=await Promise.all(Array.from({length:130},(_,i)=>formRateLimit(env,'rate-b',`ip-${i}`,1000000)));
    assert.equal(tenants.filter(Boolean).length,100);
    for(let i=0;i<10;i++) assert.equal((await handleApi(env,submit({'cf-turnstile-response':'invalid:a'},{ip:'limited-source'}))).status,400);
    const limited=await handleApi(env,submit({}, {ip:'limited-source'})); assert.equal(limited.status,429); assert.equal(limited.headers.get('retry-after'),'600');
  });
  await t.test('concurrent duplicates create one test submission/outbox, no lead or conversion; safe replay order',async()=>{
    const request=submit(), text=await request.text();
    const attempts=Array.from({length:8},()=>handleApi(env,new Request(request,{body:text})));
    const responses=await Promise.all(attempts); assert.ok(responses.every(r=>r.ok));
    assert.equal(new Set(await Promise.all(responses.map(async r=>(await r.json() as {leadId:string}).leadId))).size,1);
    assert.equal(await count('form_submissions'),1); assert.equal(await count('form_outbox'),1); assert.equal(await count('leads'),1); assert.equal(await count('analytics_events'),0);
    const before=verifications;
    const retry=new URLSearchParams(text); retry.set('cf-turnstile-response','invalid:expired');
    assert.equal((await handleApi(env,new Request(request,{body:retry}))).status,200); assert.equal(verifications,before);
    retry.set('message','Changed payload'); assert.equal((await handleApi(env,new Request(request,{body:retry}))).status,409);
    const reused=new URLSearchParams(text); reused.set('idempotency_key',crypto.randomUUID()); assert.equal((await handleApi(env,new Request(request,{body:reused}))).status,400);
    const fields=await env.DB.prepare('SELECT phone,fields_json FROM form_submissions').first<{phone:string;fields_json:string}>(); assert.equal(fields?.phone,'5705550100'); assert.deepEqual(JSON.parse(fields!.fields_json).trade,['carpentry']);
    const provider={send:async()=>{throw new Error('Test mode must never call this');}};
    await Promise.all([processFormOutbox(env,provider),processFormOutbox(env,provider)]);
    const out=await env.DB.prepare('SELECT status,test_output FROM form_outbox').first<{status:string;test_output:string}>(); assert.equal(out?.status,'captured'); assert.match(out!.test_output,/Fictional test inquiry/);
    assert.equal(await retryNotification(env,'b',(await env.DB.prepare('SELECT id FROM form_outbox').first<{id:string}>())!.id),false);
    const a=await handleApp(env,new Request('https://backend.test/app/leads?mode=test',{headers:{cookie:'vitris_sid=owner-a'}}));
    assert.equal(a.status,200); assert.match(await a.text(),/Fictional Visitor/);
    backend.sessions.set('sess:owner-b',JSON.stringify({userId:'owner-b',email:'b@example.invalid',tenantId:'b',role:'owner'}));
    const b=await handleApp(env,new Request('https://backend.test/app/leads?mode=test',{headers:{cookie:'vitris_sid=owner-b'}}));
    assert.equal(b.status,200); assert.doesNotMatch(await b.text(),/Fictional Visitor/);
  });
  await t.test('live transaction includes one compatible lead, conversion, outbox; notifications retry and terminate',async()=>{
    await configureForms(env,'a',[config('a','live')]);
    const visitor=crypto.randomUUID();const req=submit({vid:visitor}), text=await req.text(), responses=await Promise.all([handleApi(env,new Request(req,{body:text})),handleApi(env,new Request(req,{body:text}))]);
    assert.ok(responses.every(r=>r.ok)); assert.equal(await count('leads'),2); assert.equal(await count('analytics_events'),1); assert.equal(await count('form_outbox'),2);
    const leadId=(await responses[0]!.json() as {leadId:string}).leadId;
    assert.equal((await env.DB.prepare('SELECT vid FROM leads WHERE id=?').bind(leadId).first<{vid:string}>())?.vid,visitor);
    let sends=0, accept=false;
    const provider={send:async(message:EmailMessageBuilder,id:string)=>{sends++; assert.equal(id,leadId); assert.equal(message.replyTo,'visitor@example.invalid'); assert.deepEqual(message.to,['owner@example.invalid']); if(!accept)throw Object.assign(new Error('PII must not be recorded'),{code:'E_INTERNAL_SERVER_ERROR'});return {messageId:'provider-accepted'};}};
    const now=Math.floor(Date.now()/1000);
    await processFormOutbox(env,provider,now);
    assert.equal((await env.DB.prepare('SELECT status FROM form_outbox WHERE id=?').bind(leadId).first<{status:string}>())?.status,'pending');
    await processFormOutbox(env,provider,now+59); assert.equal(sends,1);
    accept=true; await Promise.all([processFormOutbox(env,provider,now+61),processFormOutbox(env,provider,now+61)]); assert.equal(sends,2);
    assert.equal((await env.DB.prepare('SELECT status FROM form_outbox WHERE id=?').bind(leadId).first<{status:string}>())?.status,'accepted');
    const failure=await handleApi(env,submit()); const failedId=(await failure.json() as {leadId:string}).leadId;
    await processFormOutbox(env,{send:async()=>{throw Object.assign(new Error('recipient'),{code:'E_RECIPIENT_NOT_ALLOWED'});}},now+62);
    assert.equal((await env.DB.prepare('SELECT status FROM form_outbox WHERE id=?').bind(failedId).first<{status:string}>())?.status,'failed');
    assert.equal(await retryNotification(env,'b',failedId),false); assert.equal(await retryNotification(env,'a',failedId),true);
    await env.DB.prepare("UPDATE form_outbox SET attempts=7 WHERE id=?").bind(failedId).run();
    await processFormOutbox(env,{send:async()=>{throw new Error('Transient');}},now+63);
    assert.equal((await env.DB.prepare('SELECT status FROM form_outbox WHERE id=?').bind(failedId).first<{status:string}>())?.status,'failed');
    assert.equal(await count('leads'),3);
    await env.DB.prepare('DELETE FROM leads WHERE id=?').bind(failedId).run();
    assert.equal(await count('form_outbox'),2); assert.equal(await count('form_submissions'),2);
  });
  await t.test('sandbox forbids live configuration and missing keys block readiness',async()=>{
    await assert.rejects(configureForms({...env,FORMS_SANDBOX:'1'},'a',[config('a','live')]),/Sandbox/);
    assert.ok(formReadiness({...env,FORMS_TURNSTILE_SECRETS:JSON.stringify({live:'1x0000000000000000000000000000000AA'})},config('a','live')).includes('Production Turnstile keys'));
  });
  await t.test('Cloudflare adapter uses documented builder; acceptance is not delivery',async()=>{
    let sent:EmailMessageBuilder|undefined;
    const provider=cloudflareEmailProvider({...env,FORMS_EMAIL:{send:async(message:EmailMessageBuilder)=>{sent=message;return {messageId:'cf-id'};}} as SendEmail});
    assert.equal((await provider.send({from:'forms@vitris.invalid',to:'owner@example.invalid',replyTo:'visitor@example.invalid',subject:'Inquiry',text:'Test'},'stable-id')).messageId,'cf-id');
    assert.equal(sent?.replyTo,'visitor@example.invalid');
  });
});

test('contact-form inventory and widget allocation do not hijack or discard fields',()=>{
  const html='<form action="/search"><input name="query" type="search"></form><form data-lead-form><input name="number" type="tel"><input name="email" type="email" required><select name="trade"><option value="carpentry">Carpentry</option></select><input name="services" type="checkbox" value="design"><input name="services" type="checkbox" value="build"></form>';
  const inventory=inspectForms(html); assert.equal(inventory[0]?.eligible,false); assert.equal(inventory[1]?.fields[0]?.map,'phone'); assert.deepEqual(inventory[1]?.fields.at(-1)?.options,['design','build']);
  const output=connectForms(html,'https://backend.test','/contact',[{id:'a_contact',pagePath:'/contact',index:1,sitekey:'public_key',action:'contact'}]);
  assert.ok(output.startsWith('<form action="/search"><input name="query" type="search"></form>')); assert.match(output,/name="number"/); assert.match(output,/data-vitris-form="a_contact"/);
  assert.throws(()=>connectForms('<form data-lead-form><input name="file" type="file"></form>','https://backend.test','/contact',[{id:'a_contact',pagePath:'/contact',sitekey:'public_key',action:'contact'}]),/Unsupported/);
  assert.equal(allocateWidget([{name:'vitris-forms-pool-1',sitekey:'one',domains:['one.test']}],['two.test']).widget?.sitekey,'one');
  assert.throws(()=>allocateWidget(Array.from({length:20},(_,i)=>({name:`unmanaged-${i}`,sitekey:`key${i}`,domains:[]})),['new.test']),/capacity exhausted/);
});

test('Turnstile provisioning reruns reconcile existing resources and supports account tokens',async t=>{
  const methods:string[]=[];
  t.mock.method(globalThis,'fetch',async(url:unknown,options:{method:string;body?:string})=>{
    const path=String(url);methods.push(options.method);
    if(path.endsWith('/user/tokens/verify'))return new Response('{"success":false}',{status:401});
    const result=path.includes('/tokens/verify')?{status:'active'}:path.includes('/widgets?')?[{name:'vitris-forms-pool-1',sitekey:'key1',domains:['a.test']}]:{};
    return new Response(JSON.stringify({success:true,result}));
  });
  const result=await reconcileWidget({account:'account',token:'redacted'},['a.test'],true); assert.equal(result.sitekey,'key1'); assert.ok(methods.every(m=>m==='GET'));
});

test('authored select and checkbox values are preserved without trimming',async t=>{
  const fixture=await formsBackend(),{env}=fixture;t.after(fixture.dispose);
  const form={...config('choices'),fields:[{name:'email',type:'email' as const,map:'email' as const,required:true,maxLength:254},{name:'trade',type:'select' as const,required:true,maxLength:30,options:[' carpentry ']},{name:'services',type:'checkbox' as const,maxLength:30,options:[' design ']}]};
  await configureForms(env,'choices',[form],{slug:'choices',name:'Fictional choices'});
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({success:true,hostname:'choices.example.test',action:'contact'})));
  const response=await handleFormSubmission(env,new Request('http://127.0.0.1:8787/api/leads',{method:'POST',headers:{origin:form.origins[0]!,accept:'application/json'},body:new URLSearchParams({form_id:form.id,idempotency_key:crypto.randomUUID(),email:'fictional@example.invalid',trade:' carpentry ',services:' design ','cf-turnstile-response':crypto.randomUUID()})}));
  assert.equal(response.status,201);
  const row=await env.DB.prepare('SELECT fields_json FROM form_submissions').first<{fields_json:string}>();const fields=JSON.parse(row!.fields_json);
  assert.deepEqual(fields.trade,[' carpentry ']);assert.deepEqual(fields.services,[' design ']);
});
