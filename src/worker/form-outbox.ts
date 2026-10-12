import type { Env } from './env.ts';
import { formReadiness, sandboxMailReadiness } from './forms.ts';
import { validateFormConfig, type FormField } from '../forms/config.ts';

export interface NotificationProvider {
  /** Provider acceptance only. A future provider can honor this stable key. */
  send(message: EmailMessageBuilder, idempotencyKey: string): Promise<{messageId:string}>;
}
export function cloudflareEmailProvider(env: Env, test=false): NotificationProvider {
  return { send: async (message, _idempotencyKey) => {
    const binding=test?env.FORMS_TEST_EMAIL:env.FORMS_EMAIL;
    if (!binding) throw Object.assign(new Error('Missing binding'),{code:'MAIL_CONFIGURATION'});
    // Current Cloudflare send binding has no documented idempotency field.
    return binding.send(message);
  } };
}
type Job = {id:string; tenant_id:string; attempts:number; mode:string; form_id:string; fields_json:string; schema_json:string; email:string; recipients_json:string; page_path:string; config_json:string};
const terminalCodes = new Set(['MAIL_CONFIGURATION','E_VALIDATION_ERROR','E_SENDER_NOT_VERIFIED','E_RECIPIENT_NOT_ALLOWED','E_RECIPIENT_SUPPRESSED','E_SENDER_DOMAIN_NOT_AVAILABLE','E_HEADER_NOT_ALLOWED','E_HEADER_USE_API_FIELD']);
export async function processFormOutbox(env: Env, provider?:NotificationProvider, now = Math.floor(Date.now()/1000)): Promise<number> {
  // Later jobs need fresh leases even when earlier sends take most of a minute.
  const started=Date.now(), clock=()=>now+Math.floor((Date.now()-started)/1000);
  const due = await env.DB.prepare(`SELECT o.id FROM form_outbox o JOIN form_submissions s ON s.id=o.id JOIN contact_forms f ON f.id=s.form_id AND f.tenant_id=s.tenant_id WHERE (o.status='pending' OR (o.status='processing' AND o.lease_until<?)) AND o.next_attempt<=? AND json_extract(f.config_json,'$.mode')=s.mode ORDER BY o.rowid LIMIT 20`).bind(now,now).all<{id:string}>();
  let processed = 0;
  for (const candidate of due.results) {
    const claim = crypto.randomUUID();
    const claimTime=clock();
    const claimed = await env.DB.prepare(`UPDATE form_outbox SET status='processing',claim=?,lease_until=?,attempts=attempts+1 WHERE id=? AND attempts<8 AND next_attempt<=? AND (status='pending' OR (status='processing' AND lease_until<?)) RETURNING id`).bind(claim,claimTime+300,candidate.id,claimTime,claimTime).all();
    if (!claimed.results.length) continue;
    const job = await env.DB.prepare(`SELECT o.id,o.tenant_id,o.attempts,s.mode,s.form_id,s.fields_json,s.schema_json,s.email,s.recipients_json,s.page_path,f.config_json FROM form_outbox o JOIN form_submissions s ON s.id=o.id JOIN contact_forms f ON f.id=s.form_id AND f.tenant_id=s.tenant_id WHERE o.id=? AND o.claim=?`).bind(candidate.id,claim).first<Job>();
    if (!job) continue;
    try {
      const c = validateFormConfig(JSON.parse(job.config_json));
      if (c.mode !== job.mode) throw Object.assign(new Error('Paused configuration'),{code:'MAIL_CONFIGURATION'});
      const values = JSON.parse(job.fields_json) as Record<string,string[]>;
      const schema=JSON.parse(job.schema_json) as FormField[];
      const message: EmailMessageBuilder = {from:env.FORMS_FROM || 'test@vitris.invalid',to:JSON.parse(job.recipients_json),replyTo:job.email,subject:`Website inquiry: ${job.form_id}`,text:`Form: ${job.form_id}\nPage: ${job.page_path}\n\n` + schema.map(f=>`${f.label || f.name}: ${(values[f.name] || []).join(', ')}`).join('\n')};
      const testMail=job.mode==='test' && !!env.FORMS_TEST_RECIPIENT;
      if (job.mode === 'test' && !testMail) {
        await env.DB.prepare(`UPDATE form_outbox SET status='captured',test_output=?,claim=NULL,lease_until=0,last_error=NULL WHERE id=? AND claim=?`).bind(JSON.stringify(message),job.id,claim).run();
      } else {
        if ((testMail?sandboxMailReadiness(env):formReadiness(env,c)).length) throw Object.assign(new Error('Not ready'),{code:'MAIL_CONFIGURATION'});
        if(testMail){
          // Ignore configured customer recipients even in historical snapshots.
          // Deployment must additionally restrict this binding to the same sink.
          message.to=[env.FORMS_TEST_RECIPIENT!];
          message.subject=`[VITRIS TEST] ${message.subject}`;
          message.text=`Isolated test submission. Customer notifications are disabled.\n\n${message.text}`;
          await env.DB.prepare('UPDATE form_outbox SET test_output=? WHERE id=? AND claim=?').bind(JSON.stringify(message),job.id,claim).run();
        }
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let result: {messageId:string};
        try {
          result = await Promise.race([(provider || cloudflareEmailProvider(env,testMail)).send(message,job.id),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Object.assign(new Error('Ambiguous provider timeout'),{code:'PROVIDER_TIMEOUT'})),30000);})]);
        } finally { if (timeout) clearTimeout(timeout); }
        await env.DB.prepare(`UPDATE form_outbox SET status='accepted',provider_id=?,accepted_at=datetime('now'),claim=NULL,lease_until=0,last_error=NULL WHERE id=? AND claim=?`).bind(result.messageId,job.id,claim).run();
      }
    } catch (error) {
      // Only bounded known codes are recorded: provider errors can contain PII.
      const raw = (error as {code?:string})?.code;
      const code = raw && /^[A-Z_]{1,64}$/.test(raw) ? raw : 'PROVIDER_TEMPORARY_FAILURE';
      const terminal = terminalCodes.has(code) || job.attempts >= 8;
      await env.DB.prepare(`UPDATE form_outbox SET status=?,next_attempt=?,last_error=?,claim=NULL,lease_until=0 WHERE id=? AND claim=?`).bind(terminal?'failed':'pending',clock()+Math.min(21600,60*2**(job.attempts-1)),code,job.id,claim).run();
    }
    processed++;
  }
  // A crashed eighth claim must not remain processing indefinitely.
  await env.DB.prepare(`UPDATE form_outbox SET status='failed',last_error='CLAIM_EXHAUSTED',claim=NULL WHERE status='processing' AND lease_until<? AND attempts>=8`).bind(clock()).run();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM form_rate_limits WHERE expires<?').bind(clock()),
    env.DB.prepare(`DELETE FROM form_submissions WHERE mode='test' AND created_at<datetime('now','-7 days')`),
  ]);
  return processed;
}
