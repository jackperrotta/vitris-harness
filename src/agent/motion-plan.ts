import {validateRouteComposition, compositionBindingFailures, type MotionCoverageOptions} from './motion-composition.ts';
import { MOTION_EFFECTS } from '../compile/scroll-motion.ts';
import type { MotionPlan } from './artifacts.ts';
import { parseFragment } from 'parse5';

/** Optional additive contract; old records remain valid without a plan. */
export function validateMotionPlan(value: MotionPlan | undefined, routes?: string[], options:MotionCoverageOptions={}): string[] {
  if (value === undefined) return validateRouteComposition(value,routes,options);
  if (![1,2].includes(value.version) || !value.purpose?.trim() || !Array.isArray(value.quiet) || value.quiet.some(v => typeof v !== 'string' || !v.trim()) || !Array.isArray(value.scenes)) return ['Invalid motionPlan v1/v2'];
  const errors: string[] = [], ids = new Set<string>();
  if(value.decision==='static'&&value.scenes.length)errors.push('Static motion decision cannot contain active scenes');
  for (const scene of value.scenes) {
    const key = `${scene.route}:${scene.targetId}`;
    if (ids.has(key)) errors.push(`Duplicate motion scene: ${key}`);
    ids.add(key);
    if(scene.effect==='count'&&(!scene.factRef?.trim()||!scene.sourceFact?.trim()||!scene.finalText?.trim()))errors.push(`Count scene needs source fact, factRef and exact finalText: ${key}`);
    if (!scene.route?.startsWith('/') || (routes && !routes.includes(scene.route)) || !/^[A-Za-z][\w-]*$/.test(scene.targetId || '') || !/^[A-Za-z][\w-]*$/.test(scene.triggerId || '') || !MOTION_EFFECTS.includes(scene.effect) || !scene.reason?.trim() || !['same', 'static'].includes(scene.mobile) || scene.reduced !== 'static' || !scene.timing) errors.push(`Invalid motion scene: ${key}`);
    for (const [field, limit] of Object.entries({ duration: [120, 1200], delay: [0, 300], stagger: [0, 120] })) {
      const n = scene.timing?.[field as keyof typeof scene.timing];
      if (n !== undefined && (!Number.isFinite(n) || n < limit[0]! || n > limit[1]!)) errors.push(`Invalid motion timing ${key}/${field}`);
    }
  }
  return [...errors,...validateRouteComposition(value,routes,options)];
}

/** At browser acceptance, bind intent to the actual flattened output, including native/composition markup. */
export function motionBindingFailures(plan:MotionPlan|undefined,route:string,html:string,options:MotionCoverageOptions={}):string[]{
  if(!plan)return [];const elements:any[]=[];const walk=(n:any)=>{if(n.attrs)elements.push(n);for(const c of n.childNodes||[])walk(c);};walk(parseFragment(html));
  const errors:string[]=compositionBindingFailures(plan,route,html);for(const scene of plan.scenes.filter(s=>s.route===route)){
    const get=(n:any,k:string)=>n.attrs.find((a:any)=>a.name===k)?.value;
    const matches=elements.filter(n=>get(n,'id')===scene.targetId),node=matches[0];
    if(matches.length!==1||(!options.operatorOff&&(get(node,'data-motion')!==scene.effect||get(node,'data-motion-target')!==scene.targetId))){errors.push(`Planned motion scene missing/ignored: ${route}#${scene.targetId}; revise the plan explicitly if intent changed`);continue;}
    if(options.operatorOff)continue;
    if((get(node,'data-motion-trigger')||scene.targetId)!==scene.triggerId)errors.push(`Motion trigger differs from plan: ${scene.targetId}`);
    if(scene.effect==='count'&&(get(node,'data-motion-fact')!==scene.factRef||(node.childNodes||[]).map((n:any)=>n.value||'').join('')!==scene.finalText))errors.push(`Count fact/final text differs from plan: ${scene.targetId}`);
  }return errors;
}
