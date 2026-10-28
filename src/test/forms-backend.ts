import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import type { Env } from '../worker/env.ts';
export async function formsBackend(migrationDir = 'migrations', bootstrapLegacy = true) {
  // Execute statements inside the Worker, as production does. Passing native
  // prepared-statement proxies across processes can lose handles under load.
  const script=`export default {async fetch(request,env){
    try {
      const input=await request.json();
      const prepare=row=>env.DB.prepare(row.sql).bind(...row.values);
      let result;
      if(input.method==='batch')result=await env.DB.batch(input.statements.map(prepare));
      else if(input.method==='exec')result=await env.DB.exec(input.sql);
      else {const statement=prepare(input);result=input.method==='first'?await statement.first(input.column):await statement[input.method]();}
      return Response.json({result});
    }catch(error){return Response.json({error:String(error.message || error)},{status:500});}
  }}`;
  // Keep database I/O on a fast local disk when the general temp drive is slow.
  const resourcePersistencePath=process.env.VITRIS_TEST_STORAGE_ROOT ? mkdtempSync(join(process.env.VITRIS_TEST_STORAGE_ROOT,'vitris-d1-')) : undefined;
  const mf=new Miniflare({...convertV4MiniflareOptions({workers:[{name:'forms-test',modules:true,script,d1Databases:['DB'],compatibilityDate:'2026-09-01'}]}),resourcePersistencePath});
  async function query<T>(input:unknown):Promise<T>{
    const response=await mf.dispatchFetch('http://d1.test/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    const data=await response.json() as {result:T;error?:string};
    if(!response.ok || data.error)throw new Error(data.error || 'Local D1 request failed');
    return data.result;
  }
  function statement(sql:string,values:unknown[]=[]){
    return {sql,values,bind:(...bound:unknown[])=>statement(sql,bound),
      first:(column?:string)=>query({sql,values,method:'first',column}),
      all:()=>query({sql,values,method:'all'}),run:()=>query({sql,values,method:'run'}),raw:()=>query({sql,values,method:'raw'})};
  }
  const DB={prepare:statement,batch:(statements:ReturnType<typeof statement>[])=>query({method:'batch',statements:statements.map(({sql,values})=>({sql,values}))}),exec:(sql:string)=>query({method:'exec',sql})} as unknown as D1Database;
  for (const file of readdirSync(migrationDir).filter(f=>f.endsWith('.sql')).sort()) {
    for (const sql of unstable_splitSqlQuery(readFileSync(join(migrationDir,file),'utf8'))) await DB.prepare(sql).run();
    if (bootstrapLegacy && file==='0001_init.sql') {
      await DB.prepare("INSERT INTO tenants(id,slug,name) VALUES('legacy','legacy','Legacy')").run();
      await DB.prepare("INSERT INTO leads(id,tenant_id,name,email,message) VALUES('legacy-lead','legacy','Preserved Person','legacy@example.invalid','Existing lead')").run();
      await DB.prepare("INSERT INTO site_config(tenant_id,json) VALUES('legacy','{\"preserved\":true}')").run();
    }
  }
  const sessions=new Map<string,string>();
  const env={DB,KV:{get:async(key:string)=>sessions.get(key) || null,put:async(key:string,value:string)=>{sessions.set(key,value);},delete:async(key:string)=>{sessions.delete(key);}},FORMS_ABUSE_SECRET:'isolated-abuse-secret-with-at-least-32-characters',FORMS_TURNSTILE_SECRETS:JSON.stringify({test:'isolated-test-secret',live:'isolated-live-secret'}),FORMS_SETUP_TOKENS:JSON.stringify({a:'tenant-a-secret-with-at-least-32-characters',b:'tenant-b-secret-with-at-least-32-characters'}),FORMS_FROM:'forms@vitris.invalid',FORMS_SENDER_READY:'1',FORMS_EMAIL:{send:async()=>{throw new Error('Real sends prohibited in this fixture');}}} as unknown as Env;
  return {env,sessions,dispose:()=>mf.dispose()};
}
