import { readFileSync, readdirSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import type { Env } from '../worker/env.ts';
export async function formsBackend() {
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'forms-test',modules:true,script:'export default {fetch(){return new Response("isolated")}}',d1Databases:['DB'],compatibilityDate:'2026-09-01'}]}));
  const DB=await mf.getD1Database('DB','forms-test') as unknown as D1Database;
  for (const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort()) {
    for (const sql of unstable_splitSqlQuery(readFileSync(`migrations/${file}`,'utf8'))) await DB.prepare(sql).run();
    if (file==='0001_init.sql') {
      await DB.prepare("INSERT INTO tenants(id,slug,name) VALUES('legacy','legacy','Legacy')").run();
      await DB.prepare("INSERT INTO leads(id,tenant_id,name,email,message) VALUES('legacy-lead','legacy','Preserved Person','legacy@example.invalid','Existing lead')").run();
      await DB.prepare("INSERT INTO site_config(tenant_id,json) VALUES('legacy','{\"preserved\":true}')").run();
    }
  }
  const sessions=new Map<string,string>();
  const env={DB,KV:{get:async(key:string)=>sessions.get(key) || null,put:async(key:string,value:string)=>{sessions.set(key,value);},delete:async(key:string)=>{sessions.delete(key);}},FORMS_ABUSE_SECRET:'isolated-abuse-secret-with-at-least-32-characters',FORMS_TURNSTILE_SECRETS:JSON.stringify({test:'isolated-test-secret',live:'isolated-live-secret'}),FORMS_SETUP_TOKENS:JSON.stringify({a:'tenant-a-secret-with-at-least-32-characters',b:'tenant-b-secret-with-at-least-32-characters'}),FORMS_FROM:'forms@vitris.invalid',FORMS_SENDER_READY:'1',FORMS_EMAIL:{send:async()=>{throw new Error('Real sends prohibited in this fixture');}}} as unknown as Env;
  return {env,sessions,dispose:()=>mf.dispose()};
}
