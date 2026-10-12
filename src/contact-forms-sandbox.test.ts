import test from 'node:test';
import assert from 'node:assert/strict';
import { formsBackend } from './test/forms-backend.ts';
import { configureForms,handleFormSubmission,sandboxMailReadiness } from './worker/forms.ts';
import { processFormOutbox } from './worker/form-outbox.ts';
import sandbox from './worker/forms-sandbox.ts';
import type {FormConfig} from './forms/config.ts';

test('operator test mail uses only the sandbox sink and remains outside production leads/analytics',async t=>{
 const fixture=await formsBackend();t.after(fixture.dispose);const {env}=fixture;
 env.FORMS_SANDBOX='1';env.FORMS_TEST_RECIPIENT='operator@example.invalid';
 const delivered:EmailMessageBuilder[]=[];
 env.FORMS_TEST_EMAIL={send:async(message:EmailMessageBuilder)=>{delivered.push(message);return {messageId:'sandbox-provider-acceptance'};}} as SendEmail;
 const config:FormConfig={id:'test_sink',mode:'test',origins:['https://test.example.invalid'],recipients:['customer@example.invalid'],turnstile:{sitekey:'real_sitekey',secretRef:'test',action:'contact'},fields:[{name:'email',type:'email',map:'email',maxLength:254,required:true}]};
 await configureForms(env,'sink',[config],{slug:'sink',name:'Sink test'});
 t.mock.method(globalThis,'fetch',async()=>Response.json({success:true,hostname:'test.example.invalid',action:'contact'}));
 const submit=()=>handleFormSubmission(env,new Request('https://api.example.invalid/api/leads',{method:'POST',headers:{origin:config.origins[0]!,accept:'application/json'},body:new URLSearchParams({form_id:config.id,idempotency_key:crypto.randomUUID(),email:'visitor@example.invalid','cf-turnstile-response':crypto.randomUUID()})}));
 assert.deepEqual(sandboxMailReadiness(env),[]);
 const first=await submit();assert.equal(first.status,201);assert.equal((await first.json() as any).notification,'test_mail_pending');
 await processFormOutbox(env);
 assert.equal(delivered.length,1);assert.deepEqual(delivered[0]!.to,['operator@example.invalid']);assert.equal(delivered[0]!.replyTo,'visitor@example.invalid');assert.match(delivered[0]!.subject!,/^\[VITRIS TEST\]/);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM leads WHERE tenant_id=?').bind('sink').first<any>()).n,0);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM analytics_events WHERE tenant_id=?').bind('sink').first<any>()).n,0);
 const job=await env.DB.prepare("SELECT status,provider_id,test_output FROM form_outbox WHERE tenant_id='sink'").first<any>();
 assert.equal(job.status,'accepted');assert.equal(job.provider_id,'sandbox-provider-acceptance');assert.doesNotMatch(job.test_output,/customer@example.invalid/);
 // The same opt-in on a non-sandbox backend fails closed without sending.
 env.FORMS_SANDBOX='0';assert.ok(sandboxMailReadiness(env).length);await submit();await processFormOutbox(env);
 assert.equal(delivered.length,1);assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM form_outbox WHERE tenant_id='sink' AND status='failed'").first<any>()).n,1);
 // Missing isolated binding must never fall through to the live mail binding.
 env.FORMS_SANDBOX='1';delete env.FORMS_TEST_EMAIL;await submit();await processFormOutbox(env);assert.equal(delivered.length,1);
});

test('sandbox exposes only shared forms endpoints and requires tenant bearer authorization',async t=>{
 const fixture=await formsBackend();t.after(fixture.dispose);const {env}=fixture;env.FORMS_SANDBOX='1';
 const url='https://sandbox.example.invalid';
 assert.equal((await sandbox.fetch(new Request(url+'/health'),env)).status,200);
 for(const path of ['/api/forms/a','/app/login','/api/publish-attested','/gallery'])assert.equal((await sandbox.fetch(new Request(url+path),env)).status,404);
 const token='tenant-a-secret-with-at-least-32-characters';
 const own=await sandbox.fetch(new Request(url+'/api/forms/a',{headers:{authorization:`Bearer ${token}`}}),env);assert.equal(own.status,200);
 for(const suffix of ['b','b/retry'])assert.equal((await sandbox.fetch(new Request(url+'/api/forms/'+suffix,{method:suffix.includes('retry')?'POST':'GET',headers:{authorization:`Bearer ${token}`}}),env)).status,401);
 delete env.FORMS_SANDBOX;assert.equal((await sandbox.fetch(new Request(url+'/health'),env)).status,503);
});
