import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildVerified } from '../build/verified.ts';
import { files } from '../agent/artifacts.ts';
import { inspectForms } from '../forms/frontend.ts';
import { approvedOrigin, safeId, validateFormConfig, type FormConfig, type PublicForm } from '../forms/config.ts';
import { reconcileWidget, provisionWidgetSecrets, validateSecretMap } from '../forms/cloudflare.ts';
import { EXIT_CODES, type CommandResult } from './types.ts';

export type FormsOptions = {site?:string; tenant?:string; backendOrigin?:string; origins?:string[]; mode?:string; recipients?:string[]; apply?:boolean; testKeys?:boolean; cloudflare?:boolean; worker?:string; config?:string; dryRun?:boolean};
export async function formsCommand(command:string, opts:FormsOptions):Promise<CommandResult> {
  try {
    const root=resolve(opts.site || '.'), launchPath=join(root,'launch.json');
    const launch=existsSync(launchPath)?JSON.parse(readFileSync(launchPath,'utf8')):{};
    const backend=opts.backendOrigin || launch.backendOrigin, tenant=opts.tenant;
    const backendRequest=async (method:string, body?:unknown)=>{
      const adminToken=process.env.VITRIS_FORMS_SETUP_TOKEN;
      if (!backend || !safeId(tenant) || !adminToken) throw new Error('Provide --tenant, --backend-origin and VITRIS_FORMS_SETUP_TOKEN (scoped to this tenant)');
      approvedOrigin(backend);
      const response=await fetch(`${backend}/api/forms/${tenant}`,{method,headers:{authorization:`Bearer ${adminToken}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
      const data=await response.json(); if (!response.ok) throw new Error(`Forms backend HTTP ${response.status}: ${JSON.stringify(data)}`); return data;
    };
    if (command==='status') return {ok:true,exitCode:0,data:await backendRequest('GET'),summary:'Server-side form readiness and notification status retrieved'};
    if (!['inspect','setup'].includes(command)) throw new Error('Use vitris forms inspect|setup|status');
    await buildVerified(root);
    const inventory=files(join(root,'dist')).filter(f=>f.endsWith('.html') && !f.endsWith('404.html')).flatMap(file=>{
      const rel=file.slice(join(root,'dist').length+1).replaceAll('\\','/');
      const pagePath=rel==='index.html'?'/':'/'+rel.replace(/\/index\.html$/,'').replace(/\.html$/,'');
      return inspectForms(readFileSync(file,'utf8')).map(form=>({pagePath,...form}));
    });
    if (command==='inspect') return {ok:true,exitCode:0,data:{inventory},summary:'Contact-form inventory (unsupported and unrelated forms included)'};
    if (!safeId(tenant) || !backend) throw new Error('Setup requires --tenant and --backend-origin');
    approvedOrigin(backend);
    const origins=opts.origins || []; origins.forEach(approvedOrigin);
    const eligible=inventory.filter(f=>f.eligible);
    if (!eligible.length || eligible.some(f=>f.unsupported.length)) throw new Error('No supported contact forms. Run forms inspect and adapt unsupported controls.');
    if (opts.mode === 'live') throw new Error('Setup prepares disabled/test forms only. Live activation requires the reviewed tenant-scoped configuration API and server readiness.');
    const supplied=opts.config?JSON.parse(readFileSync(resolve(opts.config),'utf8')) as {forms:Array<FormConfig & {pagePath:string;index?:number}>}:undefined;
    const apply=!!opts.apply && !opts.dryRun;
    let sitekey=opts.testKeys?'1x00000000000000000000AA':'pending', secretRef=opts.testKeys?'test':'pending';
    let widgetPlan:unknown;
    let cloudAccess:{account:string;token:string}|undefined;
    let existingSecrets:Record<string,string>|undefined;
    if (opts.cloudflare) {
      const access={account:process.env.CLOUDFLARE_ACCOUNT_ID || '',token:process.env.CLOUDFLARE_API_TOKEN || ''};
      if (!access.account || !access.token) throw new Error('Cloudflare account/token required');
      if (apply && (!opts.worker || !process.env.FORMS_TURNSTILE_SECRETS)) throw new Error('For secret reconciliation provide --worker and FORMS_TURNSTILE_SECRETS containing the current complete map ({} for a new isolated Worker)');
      if (apply) existingSecrets=validateSecretMap(JSON.parse(process.env.FORMS_TURNSTILE_SECRETS!));
      const result=await reconcileWidget(access,origins.map(o=>new URL(o).hostname),false); widgetPlan=result.plan;cloudAccess=access;
      sitekey=result.sitekey || sitekey; secretRef=result.secretRef || (result.sitekey?`pool_${result.sitekey}`:secretRef);
    }
    const forms:FormConfig[] = [], publicForms:PublicForm[]=[];
    for (const f of eligible) {
      const explicit=supplied?.forms.find(c=>c.pagePath===f.pagePath && (c.index ?? 0)===f.index);
      const prior=(launch.forms as PublicForm[] | undefined)?.find(c=>c.pagePath===f.pagePath && (c.index ?? 0)===f.index);
      const id=explicit?.id || prior?.id || `${tenant.slice(0,40)}_${(f.pagePath.replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_|_$/g,'') || 'root').slice(0,20)}_${createHash('sha256').update(f.pagePath).digest('hex').slice(0,8)}_${f.index}`;
      const config=validateFormConfig(explicit || {id,mode:opts.mode || 'disabled',origins,fields:f.fields,recipients:opts.recipients || [],turnstile:{sitekey,secretRef,action:opts.testKeys?'test':'contact'}});
      if (config.mode==='live') throw new Error('Setup cannot activate live forms');
      const actual=new Set(f.fields.map(field=>field.name));
      if (actual.size!==config.fields.length || config.fields.some(field=>!actual.has(field.name))) throw new Error('Configured schema must include every captured field');
      if (config.fields.some(field=>{const authored=f.fields.find(a=>a.name===field.name)!;return field.type!==authored.type || (authored.required && !field.required) || authored.options?.some(o=>!field.options?.includes(o));})) throw new Error('Configured schema must preserve control types, required fields and authored choices');
      forms.push(config); publicForms.push({id:config.id,pagePath:f.pagePath,index:f.index,sitekey:config.turnstile.sitekey,action:config.turnstile.action});
    }
    const plan={tenant,backendOrigin:backend,forms,publicForms,widgetPlan,requirements:['Tenant-scoped setup token','Turnstile secrets on backend','FORMS_ABUSE_SECRET',...(opts.testKeys?['Dummy keys require a controlled hostname/action verification fixture; use a real widget in test mode for manual end-to-end acceptance']:[]),'For live: approved recipients, authenticated Vitris sender and FORMS_EMAIL binding']};
    mkdirSync(join(root,'artifacts/forms'),{recursive:true}); writeFileSync(join(root,'artifacts/forms/setup-plan.json'),JSON.stringify(plan,null,2)+'\n');
    if (apply) {
      if(cloudAccess){
        // Validate the tenant credential and complete local plan before cloud mutations.
        await backendRequest('GET');
        const widget=await reconcileWidget(cloudAccess,origins.map(o=>new URL(o).hostname),true);
        await provisionWidgetSecrets(cloudAccess,opts.worker!,existingSecrets!);
        sitekey=widget.sitekey!;secretRef=widget.secretRef!;
        for(const form of forms){form.turnstile.sitekey=sitekey;form.turnstile.secretRef=secretRef;}
        for(const binding of publicForms)binding.sitekey=sitekey;
        plan.widgetPlan=widget.plan;
        writeFileSync(join(root,'artifacts/forms/setup-plan.json'),JSON.stringify(plan,null,2)+'\n');
      }
      if (sitekey==='pending' && !supplied) throw new Error('Provide --test-keys, --cloudflare, or explicit --forms-config');
      await backendRequest('POST',{tenant:{slug:launch.slug || tenant,name:launch.name || tenant},forms});
      writeFileSync(launchPath,JSON.stringify({...launch,backendOrigin:backend,forms:publicForms},null,2)+'\n');
      await buildVerified(root);
      return {ok:true,exitCode:0,data:{...plan,status:await backendRequest('GET')},summary:'Registered forms and connected frontend; review status before live activation'};
    }
    return {ok:true,exitCode:0,data:plan,summary:'Prepared setup plan; use --apply to reconcile isolated/test resources'};
  } catch (error) { return {ok:false,exitCode:EXIT_CODES.CONFIG_OR_CLI_ERROR,error:error instanceof Error?error.message:String(error)}; }
}
