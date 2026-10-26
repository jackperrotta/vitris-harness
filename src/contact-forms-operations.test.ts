import test from 'node:test';
import assert from 'node:assert/strict';
import { formsBackend } from './test/forms-backend.ts';
import { configureForms, handleFormSubmission, retryNotification } from './worker/forms.ts';
import { processFormOutbox } from './worker/form-outbox.ts';
import type { FormConfig } from './forms/config.ts';

test('slow earlier notifications do not shorten later leases or retry backoff', {timeout:60000},async t=>{
  const fixture=await formsBackend(),{env}=fixture;t.after(async()=>{t.mock.restoreAll();await fixture.dispose();});
  const config:FormConfig={id:'slow_contact',mode:'live',origins:['https://slow.example.test'],recipients:['operator@example.invalid'],turnstile:{sitekey:'public_key',secretRef:'live',action:'contact'},fields:[{name:'email',type:'email',map:'email',required:true,maxLength:254}]};
  await configureForms(env,'slow',[config],{slug:'slow',name:'Isolated slow mail'});
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({success:true,hostname:'slow.example.test',action:'contact'})));
  for(let i=0;i<2;i++){
    const response=await handleFormSubmission(env,new Request('http://127.0.0.1:8787/api/leads',{method:'POST',headers:{origin:config.origins[0]!,accept:'application/json'},body:new URLSearchParams({form_id:config.id,idempotency_key:crypto.randomUUID(),email:'operations@example.invalid','cf-turnstile-response':crypto.randomUUID()})}));
    assert.equal(response.status,201);
  }
  let milliseconds=Date.now(),calls=0;const initial=milliseconds,now=Math.floor(initial/1000);
  t.mock.method(Date,'now',()=>milliseconds);
  const provider={send:async(_message:EmailMessageBuilder,id:string)=>{
    const row=await env.DB.prepare('SELECT lease_until FROM form_outbox WHERE id=?').bind(id).first<{lease_until:number}>();
    assert.equal(row?.lease_until,now+Math.floor((milliseconds-initial)/1000)+300);
    milliseconds+=29000;calls++;
    if(calls===2)throw Object.assign(new Error('Fake temporary failure'),{code:'PROVIDER_TIMEOUT'});
    return {messageId:'fake-accepted'};
  }};
  assert.equal(await processFormOutbox(env,provider,now),2);
  const retry=await env.DB.prepare("SELECT next_attempt FROM form_outbox WHERE status='pending'").first<{next_attempt:number}>();
  assert.equal(calls,2);assert.equal(retry?.next_attempt,now+58+60);
});

test('outbox mode pauses, abandoned claims, immutable field snapshots and test retention', {timeout:60000},async t=>{
  const fixture=await formsBackend(),{env}=fixture;t.after(async()=>{t.mock.restoreAll();await fixture.dispose();});
  const config:FormConfig={id:'ops_contact',mode:'test',origins:['https://ops.example.test'],recipients:[],turnstile:{sitekey:'public_key',secretRef:'test',action:'contact'},fields:[{name:'email',type:'email',map:'email',required:true,maxLength:254},{name:'trade',label:'Original trade label',type:'select',options:['carpentry','masonry'],maxLength:30}]};
  await configureForms(env,'ops',[config],{slug:'ops',name:'Isolated operations'});
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({success:true,hostname:'ops.example.test',action:'contact'})));
  const response=await handleFormSubmission(env,new Request('http://127.0.0.1:8787/api/leads',{method:'POST',headers:{origin:config.origins[0]!,accept:'application/json'},body:new URLSearchParams({form_id:config.id,idempotency_key:crypto.randomUUID(),email:'operations@example.invalid',trade:'carpentry','cf-turnstile-response':crypto.randomUUID()})}));
  assert.equal(response.status,201);const id=(await response.json() as {leadId:string}).leadId,now=Math.floor(Date.now()/1000);
  const provider={send:async()=>{throw new Error('Test mode must never send');}};
  await configureForms(env,'ops',[{...config,mode:'disabled'}]);await processFormOutbox(env,provider,now);
  assert.equal((await env.DB.prepare('SELECT status FROM form_outbox WHERE id=?').bind(id).first<{status:string}>())?.status,'pending');
  await configureForms(env,'ops',[{...config,fields:[config.fields[0]!]}]);
  await env.DB.prepare("UPDATE form_outbox SET status='processing',claim='abandoned',lease_until=?,attempts=1 WHERE id=?").bind(now+100,id).run();
  await processFormOutbox(env,provider,now);
  assert.equal((await env.DB.prepare('SELECT status FROM form_outbox WHERE id=?').bind(id).first<{status:string}>())?.status,'processing');
  await processFormOutbox(env,provider,now+101);
  const captured=await env.DB.prepare('SELECT status,test_output FROM form_outbox WHERE id=?').bind(id).first<{status:string;test_output:string}>();
  assert.equal(captured?.status,'captured');assert.match(captured!.test_output,/Original trade label: carpentry/);
  await env.DB.prepare("UPDATE form_outbox SET status='processing',claim='final-crash',lease_until=?,attempts=8 WHERE id=?").bind(now,id).run();
  await processFormOutbox(env,provider,now+102);
  assert.equal((await env.DB.prepare('SELECT last_error FROM form_outbox WHERE id=?').bind(id).first<{last_error:string}>())?.last_error,'CLAIM_EXHAUSTED');
  assert.equal(await retryNotification(env,'other',id),false);assert.equal(await retryNotification(env,'ops',id),true);
  await processFormOutbox(env,provider,now+103);
  await env.DB.prepare("UPDATE form_submissions SET created_at=datetime('now','-8 days') WHERE id=?").bind(id).run();
  await processFormOutbox(env,provider,now+104);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM form_submissions').first<{n:number}>())?.n,0);assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM form_outbox').first<{n:number}>())?.n,0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM leads').first<{n:number}>())?.n,1);
});
