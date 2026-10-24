import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import type {Browser,Page} from 'playwright';
import {fingerprint} from './artifacts.ts';
import {templateMotionHash,validateTemplateMotionPlan,type MotionCapture,type TemplateMotionEvidence,type TemplateMotionPlan} from './template-motion.ts';
declare const document:any,window:any;
declare function getComputedStyle(element:any):any;

/** A cross-document route can commit between screenshot transport and DOM sampling. */
export async function captureMotionFrame(page:Page,path:string,selector:string):Promise<{state:string;captureRetries:number}>{
 for(let attempt=0;;attempt++){
  try{
   await page.screenshot({path});
   const state=await page.evaluate(selector=>JSON.stringify([...document.querySelectorAll(selector)].map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {transform:s.transform,opacity:s.opacity,visibility:s.visibility,x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),text:(el.innerText||el.textContent)?.trim().slice(0,160),open:el.hasAttribute('open'),animations:el.getAnimations().map((a:any)=>({time:Math.round(Number(a.currentTime)),state:a.playState}))};})),selector);
   return {state,captureRetries:attempt};
  }catch(error){
   const message=error instanceof Error?error.message:String(error);
   if(attempt>=2||page.isClosed()||!/Execution context was destroyed|Cannot find context with specified id|Unable to capture screenshot/.test(message))throw error;
   await page.waitForLoadState('domcontentloaded');
   await page.waitForTimeout(32);
  }
 }
}

/** Scoped temporal evidence complements, rather than replaces, whole-route journeys. */
export async function captureTemplateMotion(browser:Browser,root:string,currentUrl:string,directory:string,plan:TemplateMotionPlan):Promise<TemplateMotionEvidence>{
 const invalid=validateTemplateMotionPlan(plan);if(invalid.length)throw Error(invalid.join('\n'));
 mkdirSync(join(root,directory),{recursive:true});const captures:MotionCapture[]=[],files:TemplateMotionEvidence['files']=[];
 for(const moment of plan.moments)for(const side of ['reference','implementation'] as const){
  const context=await browser.newContext({viewport:{width:moment.width,height:900},reducedMotion:'no-preference',recordVideo:{dir:join(root,directory),size:{width:moment.width,height:900}}});
  const page=await context.newPage();const target=moment[side],base=side==='reference'?plan.referenceUrl:currentUrl;
  const frames:string[]=[],samples:MotionCapture['samples']=[],failures:string[]=[];let start=0,loadReadyAt=0,phaseStates:NonNullable<MotionCapture['phaseStates']>=[];
  if(target.requiredPhases?.length){await page.exposeFunction('__vitrisMotionPhase',({phase,path,at}:{phase:string;path:string;at:number})=>{if(start)phaseStates.push({at:at-start,phase,path});});await page.addInitScript(({selector})=>{let previous='';const timer=setInterval(()=>{const phases=[...document.querySelectorAll(selector)].map(el=>el.dataset.state).filter(Boolean);const signature=phases.join('|');if(signature&&signature!==previous){previous=signature;phases.forEach(phase=>window.__vitrisMotionPhase({phase,path:window.location.pathname,at:Date.now()}));}},16);setTimeout(()=>clearInterval(timer),6000);},{selector:target.observe});}
  try{
   // References use directory-relative routes; a customer preview uses root routes.
   if(moment.kind==='load')start=Date.now();
   await page.goto(target.path==='/'?base:new URL(target.path.replace(/^\//,''),base.endsWith('/')?base:base+'/').href,{waitUntil:moment.kind==='load'?'domcontentloaded':'networkidle'});
   if(moment.kind==='load')loadReadyAt=Date.now();
   if(moment.kind!=='load'){await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>!document.documentElement.dataset.experienceArrival&&!document.querySelector('.curtain.covering'));await page.waitForTimeout(250);}
   const locator=page.locator(target.target).first();await locator.waitFor({state:'visible'});
   if(!['load','scroll','marquee'].includes(moment.kind))await locator.scrollIntoViewIfNeeded();
   if(moment.kind==='scroll'){
    const box=await locator.boundingBox();
    // Start just below view; setup must not consume the entrance under review.
    if(box&&box.y>900)await page.evaluate(selector=>{const el=document.querySelector(selector);window.scrollTo({top:el.getBoundingClientRect().top+window.scrollY-window.innerHeight-24,behavior:'instant'});},target.target);
   }
   const rect=await locator.boundingBox();if(!rect)throw Error('Missing target geometry');
   const snapshot=async(at:number)=>{
    // Keep elapsed evidence anchored to navigation start, but space load
    // checkpoints after DOM readiness. Network latency must not consume every
    // opening sample before the page can render its first frame.
    if(start){const remaining=at-(Date.now()-(loadReadyAt||start));if(remaining>0)await page.waitForTimeout(remaining);}
    const path=directory+'/'+moment.id+'-'+side+'-'+at+'.png';
    const {state,captureRetries}=await captureMotionFrame(page,join(root,path),target.observe);frames.push(path);
    // Screenshot transport can overrun a nominal checkpoint. Record the
    // actual elapsed time so reviewers do not infer timing from its filename.
    samples.push({at:start?Date.now()-start:-1,requestedAt:at,state,...(captureRetries?{captureRetries}:{})});
   };
   await snapshot(-1);if(moment.kind!=='load'){start=Date.now();phaseStates=[];}
   if(moment.kind==='pointer-follow'){await page.mouse.move(rect.x+rect.width*.4,rect.y+rect.height/2);await page.waitForTimeout(140);await page.mouse.move(rect.x+rect.width*.7,rect.y+rect.height/2);start=Date.now();}
   else if(moment.kind==='magnetic'){await page.mouse.move(rect.x+rect.width*.83,rect.y+rect.height*.35);}
   else if(moment.kind==='route'||moment.kind==='drawer'||moment.kind==='sequence')await locator.click();
   else if(moment.kind==='scroll'){await page.mouse.wheel(0,240);}
   for(const at of moment.kind==='route'?[80,350,650,1100,1600,2100]:moment.kind==='load'?[80,350,650,950,1400,1800]:[80,180,400,800])await snapshot(at);
   if(moment.kind==='magnetic'){await page.mouse.move(10,10);await snapshot(1600);}
  }catch(error){failures.push(error instanceof Error?error.message:String(error));}
  const video=page.video();await context.close();const path=directory+'/'+moment.id+'-'+side+'.webm';if(video){await video.saveAs(join(root,path));await video.delete();}
  else failures.push('Missing actual recording');
  for(const artifact of [...frames,path])files.push({path:artifact,hash:fingerprint(root,[artifact])});
  for(const phase of target.requiredPhases||[])if(!phaseStates.some(s=>s.phase===phase))failures.push('Missing actual transition phase: '+phase);
  captures.push({momentId:moment.id,side,width:moment.width,video:path,frames,samples,...(target.requiredPhases?.length?{phaseStates}:{}),failures});
  console.log('template motion: '+moment.id+' / '+side+' / '+(failures.length?'failed':'captured'));
 }
 return {version:1,planHash:templateMotionHash(plan),selectionHash:plan.selectionHash,distHash:fingerprint(root,['dist']),captures,files};
}
