import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fingerprint,within} from './artifacts.ts';
import {digest} from './theme-library.ts';

export const TEMPLATE_MOTION_PATH='agent/decisions/template-motion.json';
export type MotionMoment={id:string;kind:'load'|'marquee'|'pointer-follow'|'magnetic'|'scroll'|'route'|'drawer'|'sequence';intent:string;reference:{path:string;target:string;observe:string;requiredPhases?:string[]};implementation:{path:string;target:string;observe:string;requiredPhases?:string[]};width:number;departure?:string};
export type TemplateMotionPlan={version:1;selectionHash:string;referenceUrl:string;moments:MotionMoment[]};
export type MotionCapture={momentId:string;side:'reference'|'implementation';width:number;video:string;frames:string[];samples:Array<{at:number;requestedAt?:number;state:string;captureRetries?:number}>;phaseStates?:Array<{at:number;phase:string;path:string}>;failures:string[]};
export type TemplateMotionEvidence={version:1;planHash:string;selectionHash:string;distHash:string;captures:MotionCapture[];files:Array<{path:string;hash:string}>};
export const templateMotionHash=(plan:TemplateMotionPlan)=>digest(plan);
export function validateTemplateMotionPlan(plan:TemplateMotionPlan):string[]{
 const failures:string[]=[];
 if(plan?.version!==1||!plan.selectionHash||!/^https:\/\//.test(plan.referenceUrl||'')||!Array.isArray(plan.moments)||!plan.moments.length)return ['Template motion needs a versioned plan, selection and pinned HTTPS reference'];
 if(new Set(plan.moments.map(m=>m.id)).size!==plan.moments.length)failures.push('Duplicate template motion moment IDs');
 if(!plan.moments.some(m=>m.kind==='load'))failures.push('Fresh-session load comparison required: inspect the opening from navigation start');
 for(const m of plan.moments){if(!/^[\w-]+$/.test(m.id)||!['load','marquee','pointer-follow','magnetic','scroll','route','drawer','sequence'].includes(m.kind)||!m.intent?.trim()||!Number.isInteger(m.width)||m.width<320||m.width>2560||[m.reference,m.implementation].some(s=>!s?.path?.startsWith('/')||!s.target?.trim()||!s.observe?.trim()))failures.push('Invalid located motion moment: '+m.id);}
 for(const m of plan.moments)for(const side of [m.reference,m.implementation])if(side?.requiredPhases!==undefined&&(!Array.isArray(side.requiredPhases)||side.requiredPhases.some(p=>typeof p!=='string'||!p.trim())))failures.push('Invalid required transition phases: '+m.id);
 return failures;
}
export function templateMotionReviewFailures(root:string,selectionHash:string,node:string):string[]{
 const path=join(root,TEMPLATE_MOTION_PATH);if(!existsSync(path))return [];
 const plan=JSON.parse(readFileSync(path,'utf8')) as TemplateMotionPlan;
 const errors=validateTemplateMotionPlan(plan);if(plan.selectionHash!==selectionHash)errors.push('Template motion plan belongs to a different selection');
 if(!['representative-review','visual-review'].includes(node))return errors;
 const reportPath=join(root,'agent/reviews/'+(node==='representative-review'?'representative-browser':'browser')+'.json');
 const evidence=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')).templateMotion as TemplateMotionEvidence:undefined;
 if(!evidence||evidence.version!==1||evidence.planHash!==templateMotionHash(plan)||evidence.selectionHash!==selectionHash||evidence.distHash!==fingerprint(root,['dist']))return [...errors,'Current recorded template motion comparison missing or stale'];
 const files=new Map((evidence.files||[]).map(f=>[f.path,f.hash]));
 for(const m of plan.moments)for(const side of ['reference','implementation'] as const){
  const c=evidence.captures?.find(c=>c.momentId===m.id&&c.side===side&&c.width===m.width);
  if(!c||!Array.isArray(c.failures)||c.failures.length||!Array.isArray(c.frames)||c.frames.length<3||!Array.isArray(c.samples)||c.samples.length<3||!c.video){errors.push('Incomplete temporal comparison: '+m.id+' / '+side);continue;}
  for(const phase of Array.isArray(m[side].requiredPhases)?m[side].requiredPhases:[])if(!Array.isArray(c.phaseStates)||!c.phaseStates.some(s=>s.phase===phase))errors.push('Missing recorded transition phase: '+m.id+' / '+side+' / '+phase);
  for(const path of [...c.frames,c.video]){try{if(!files.get(path)||!existsSync(within(root,path))||files.get(path)!==fingerprint(root,[path]))errors.push('Changed or missing template motion capture: '+path);}catch{errors.push('Unsafe template motion capture: '+path);}}
  if(new Set(c.samples.map(s=>s.state)).size<2&&!m.departure?.trim())errors.push('No observed temporal change or explained departure: '+m.id+' / '+side);
 }
 const reviewPath=join(root,'agent/reviews/'+node+'.json');const fidelity=existsSync(reviewPath)?JSON.parse(readFileSync(reviewPath,'utf8')).templateMotion:undefined;
 if(!fidelity||fidelity.planHash!==templateMotionHash(plan)||fidelity.distHash!==evidence.distHash)errors.push('Temporal fidelity review missing or stale');
 else for(const m of plan.moments){const comparison=fidelity.moments?.find((r:any)=>r.id===m.id);if(!comparison||comparison.verdict!=='pass'||['timing','easing','continuity','inputAlternatives'].some(k=>!comparison[k]?.trim()))errors.push('Located temporal assessment missing: '+m.id);}
 return errors;
}
