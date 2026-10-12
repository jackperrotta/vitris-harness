import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFragment } from 'parse5';
import type { MotionPlan } from './artifacts.ts';

export type MotionCoverageOptions = { requiredRoutes?: string[]; operatorOff?: boolean; sections?: Record<string,string[]> };
/** Deliberately separate authoring responsibility from runtime/operator policy. */
export function motionCompositionPolicy(root:string,routes:string[]):MotionCoverageOptions {
  const site=existsSync(join(root,'site.json'))?JSON.parse(readFileSync(join(root,'site.json'),'utf8')):{};
  const policy=site.motionComposition;
  const requestPath=join(root,'agent/change-request.json'),request=existsSync(requestPath)?JSON.parse(readFileSync(requestPath,'utf8')):{};
  const reauthored=[request.scope,...(request.scopes||[])].some(s=>['pages','direction'].includes(s))?(request.affectedPages||[]).filter((p:string)=>routes.includes(p)):[];
  return {operatorOff:site.scrollMotion?.policy==='off',requiredRoutes:[...new Set<string>([...(policy?.version===2?(policy.routes==='all-authored'?routes:Array.isArray(policy.routes)?policy.routes:[]):[]),...reauthored])]};
}

export function validateRouteComposition(plan:MotionPlan|undefined,routes:string[]|undefined,options:MotionCoverageOptions={}):string[]{
  const errors:string[]=[];
  if(options.requiredRoutes?.length&&plan?.version!==2)return ['Required motionPlan v2 missing: compose every authored route, including expansion; a legacy scene list is insufficient'];
  if(plan?.version!==2)return errors;
  if(!Array.isArray(plan.routes))return ['motionPlan v2 requires route compositions'];
  const required=options.requiredRoutes?.length?options.requiredRoutes:routes||plan.routes.map(r=>r.route);
  for(const route of required)if(!plan.routes.some(r=>r.route===route))errors.push(`Missing motion composition for authored route: ${route}`);
  if(new Set(plan.routes.map(r=>r.route)).size!==plan.routes.length)errors.push('Duplicate route motion composition');
  for(const r of plan.routes){
    if(!r.route?.startsWith('/')||(routes&&!routes.includes(r.route))||(['task','character','normal','mobile','reduced','ending'] as const).some(k=>!r[k]?.trim())||!Array.isArray(r.available)||!r.available.length||!Array.isArray(r.beats)||!r.beats.length){errors.push(`Incomplete route composition: ${r.route}`);continue;}
    const routeScenes=plan.scenes.filter(s=>s.route===r.route),expected=options.sections?.[r.route];
    if(expected&&expected.join('|')!==r.beats.map(b=>b.sectionId).join('|'))errors.push(`Content beats missing/out of document order: ${r.route}; expected ${expected.join(', ')}`);
    if(new Set(r.beats.map(b=>b.sectionId)).size!==r.beats.length)errors.push(`Duplicate content beat: ${r.route}`);
    for(const [i,b]of r.beats.entries()){
      const role=r.beats.length===1?'whole':i===0?'opening':i===r.beats.length-1?'closing':'development';
      if(!/^[A-Za-z][\w-]*$/.test(b.sectionId||'')||!b.change?.trim()||!b.transition?.trim()||!Array.isArray(b.scenes)||b.role!==role)errors.push(`Incomplete/incorrectly ordered motion beat: ${r.route}#${b.sectionId}`);
      for(const id of b.scenes||[])if(!routeScenes.some(s=>s.targetId===id))errors.push(`Unbound beat scene: ${r.route}#${b.sectionId}/${id}`);
      if(!options.operatorOff&&!b.scenes?.length){const a=b.connects?.map(id=>r.beats.findIndex(x=>x.scenes?.includes(id)));if(!a||a.length!==2||(a[0]??-1)<0||(a[0]??-1)>=i||(a[1]??-1)<=i)errors.push(`Quiet interval needs located active moments on both sides: ${r.route}#${b.sectionId}`);}
    }
    for(const s of routeScenes)if(!r.beats.some(b=>b.scenes?.includes(s.targetId)))errors.push(`Scene omitted from journey: ${r.route}#${s.targetId}`);
    if(!options.operatorOff){
      if(!r.beats[0]?.scenes?.length||!r.beats.at(-1)?.scenes?.length)errors.push(`Opening/closing not composed: ${r.route}; one isolated region cannot stand for the whole route`);
      if(!routeScenes.some(s=>s.mobile==='same'))errors.push(`Mobile route has no active treatment: ${r.route}`);
    }
  }
  return errors;
}

export function compositionBindingFailures(plan:MotionPlan|undefined,route:string,html:string):string[]{
  if(plan?.version!==2)return [];
  const r=plan.routes?.find(r=>r.route===route);if(!r)return []; // Required authored coverage is validated separately; generated utilities are static.
  const elements:any[]=[],walk=(n:any)=>{if(n.attrs)elements.push(n);for(const c of n.childNodes||[])walk(c);};walk(parseFragment(html));
  const get=(n:any,k:string)=>n?.attrs?.find((a:any)=>a.name===k)?.value,byId=(id:string)=>elements.filter(n=>get(n,'id')===id),contains=(root:any,n:any):boolean=>root===n||(root?.childNodes||[]).some((c:any)=>contains(c,n));
  const errors:string[]=[];let last=-1;
  for(const beat of r.beats){const nodes=byId(beat.sectionId),section=nodes[0],position=elements.indexOf(section);if(nodes.length!==1||position<=last)errors.push(`Missing/out-of-order page beat: ${route}#${beat.sectionId}`);last=position;for(const id of beat.scenes)if(!byId(id)[0]||!contains(section,byId(id)[0]))errors.push(`Scene lies outside planned content beat: ${route}#${beat.sectionId}/${id}`);}
  for(const id of r.available){const nodes=byId(id);if(nodes.length!==1)errors.push(`Continuously available target missing: ${route}#${id}`);else if(elements.some(n=>['text','entrance','stagger','sequence','count'].includes(get(n,'data-motion'))&&contains(n,nodes[0])))errors.push(`Essential reading/action inside active target: ${route}#${id}`);}
  return errors;
}

/** This is an incompleteness flag, never an aesthetic score or a positional quota. */
export function concentrationFailures(route:string,sections:{id:string;top:number;bottom:number}[],scenes:{id:string;sectionId:string|null;top:number;bottom:number;active:boolean}[],viewport:number):string[]{
  const active=scenes.filter(s=>s.active),regions=new Set(active.map(s=>s.sectionId).filter(Boolean));
  if(sections.length>1&&regions.size===1){const region=sections.find(s=>regions.has(s.id));if(region&&sections.some(s=>s.id!==region.id&&(s.bottom<=region.top||s.top>=region.bottom)&&s.bottom-s.top>=viewport*.5))return [`Concentrated motion: ${route} all active scenes lie in #${region.id} while other substantial content is uncomposed; repair the opening/development/closing relationships, not an effect quota`];}
  return [];
}
