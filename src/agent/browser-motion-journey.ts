// Browser globals are used only inside Playwright-serialized callbacks.
declare const window:any,document:any;declare const scrollY:number,innerHeight:number;
declare function getComputedStyle(e:any):any;
import type { Browser } from 'playwright';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fingerprint,sourceHash,type MotionPlan} from './artifacts.ts';
import {motionCompositionPolicy,concentrationFailures} from './motion-composition.ts';

export const JOURNEY_SCENARIO={version:5,fontSettlementMs:5000,arrivalSettlementMs:5000,openingObservationMs:6000,openingMs:600,stepPx:180,readingMs:600,firstSampleMs:120,settleMs:1600,maxHeight:60000,modes:['normal','reduce','static'],traversal:'early opening render-state sampling, real arrival settlement, then continuous forward native wheel, overlapping viewport checkpoints including quiet intervals and closing; no target jumps'};
export const JOURNEY_SCENARIO_HASH=createHash('sha256').update(JSON.stringify(JOURNEY_SCENARIO)).digest('hex');
export type MotionJourney={path:string;width:number;mode:'normal'|'reduce'|'static';sourceHash:string;outputHash:string;planHash:string;scenarioHash:string;engineAssetHash:string;sections:{id:string;top:number;bottom:number}[];scenes:{id:string;sectionId:string|null;top:number;bottom:number;active:boolean}[];checkpoints:{y:number;timeMs:number;states:{id:string;signature:string;phase:string|null;static:boolean|null;stickyTop?:number|null}[];screenshot?:string;screenshotHash?:string}[];video?:string;videoHash?:string;failures:string[]};

export async function captureMotionJourney(browser:Browser,root:string,url:string,route:string,width:number,mode:MotionJourney['mode'],directory:string,plan:MotionPlan,operatorOff=false):Promise<MotionJourney>{
  const folder=join(root,directory);mkdirSync(folder,{recursive:true});
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:mode==='reduce'?'reduce':'no-preference',javaScriptEnabled:mode!=='static',...(mode==='normal'?{recordVideo:{dir:folder,size:{width,height:900}}}:{})});
  const page=await context.newPage(),composition=plan.routes?.find(r=>r.route===route),declared=plan.scenes.filter(s=>s.route===route),html=readFileSync(join(root,`dist${route==='/'?'':route}/index.html`),'utf8'),asset=html.match(/src=["'](\/motion-[^"']+\.js)["']/)?.[1];
  const result:MotionJourney={path:route,width,mode,sourceHash:sourceHash(root),outputHash:fingerprint(root,['dist']),planHash:fingerprint(root,['onboarding/storyboard.json']),scenarioHash:JOURNEY_SCENARIO_HASH,engineAssetHash:asset?fingerprint(root,[`dist${asset}`]):'',sections:[],scenes:[],checkpoints:[],failures:[]};
  const started=Date.now();
  try{
    page.on('pageerror',e=>result.failures.push(e.message));
    await page.route('**/api/**',r=>r.fulfill({status:204,body:''}));
    // Observe actual rendered states before waiting for fonts. Fast opening
    // accents can finish before the first settled geometry/screenshot capture.
    // The normal recording still covers these early frames; absent/static
    // targets never contribute fabricated playback evidence.
    if(mode==='normal')await page.addInitScript(({ids,started,limit})=>{
      const buffer:any=window.__vitrisJourneyOpening={stopped:false,checkpoints:[]},previous=new Map();
      const tick=()=>{
        if(buffer.stopped||Date.now()-started>limit)return;
        const states=ids.flatMap(id=>{const e=document.getElementById(id),state=window.VitrisMotion?.inspect(id);if(!e||state?.static!==false)return [];
          const nodes=[e,...e.querySelectorAll('[data-motion-word],[data-motion-child],[data-motion-path],[data-motion-visual]')];
          return [{id,signature:JSON.stringify(nodes.map(n=>{const s=getComputedStyle(n);return [s.opacity,s.transform,s.clipPath,s.strokeDashoffset,n.hasAttribute('data-motion-visual')?n.textContent:''];})),phase:state.phase||null,static:false}];});
        const changed=states.some(s=>previous.get(s.id)!==s.signature);states.forEach(s=>previous.set(s.id,s.signature));
        if(changed&&buffer.checkpoints.length<128)buffer.checkpoints.push({y:scrollY,timeMs:Date.now()-started,states});
        window.requestAnimationFrame(tick);
      };window.requestAnimationFrame(tick);
    },{ids:declared.map(s=>s.targetId),started,limit:JOURNEY_SCENARIO.openingObservationMs});
    await page.goto(url,{waitUntil:'domcontentloaded'});
    const fontsSettled=await page.evaluate(async(ms)=>await Promise.race([document.fonts.ready.then(()=>true),new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),ms))]),JOURNEY_SCENARIO.fontSettlementMs);
    if(!fontsSettled)throw Error('Fonts did not settle before full-journey geometry capture');
    if(mode!=='static')await page.waitForFunction(()=>!document.documentElement.dataset.experienceArrival,{},{timeout:JOURNEY_SCENARIO.arrivalSettlementMs});
    const reject=page.locator('[data-cookie-reject]');if(mode!=='static'&&await reject.isVisible())await reject.click();
    await page.waitForTimeout(50);
    const geometry=await page.evaluate(({ids,beatIds})=>{
      const sections=[...new Set([...beatIds.map(id=>document.getElementById(id)),...document.querySelectorAll('main section[id],main article[id]')])].filter(Boolean).map(e=>({id:e.id,top:e.getBoundingClientRect().top+scrollY,bottom:e.getBoundingClientRect().bottom+scrollY})).sort((a,b)=>a.top-b.top);
      const scenes=ids.map(id=>{const e=document.getElementById(id),s=e?.closest('section[id],article[id],[data-section-id]');return{id,sectionId:s?.id||beatIds.find(id=>document.getElementById(id)?.contains(e))||null,top:e?e.getBoundingClientRect().top+scrollY:0,bottom:e?e.getBoundingClientRect().bottom+scrollY:0,active:false};});return{sections,scenes,height:document.documentElement.scrollHeight};
    },{ids:declared.map(s=>s.targetId),beatIds:composition?.beats.map(b=>b.sectionId)||[]});result.sections=geometry.sections;result.scenes=geometry.scenes;
    if(geometry.height>JOURNEY_SCENARIO.maxHeight)throw Error('Route exceeds bounded full-journey capture height; no partial journey may pass');
    const sample=async(index:number,final=false)=>{
      const snapshot=await page.evaluate(({ids,available,readable})=>({y:scrollY,states:ids.map(id=>{const e=document.getElementById(id),state=window.VitrisMotion?.inspect(id);const nodes=e?[e,...e.querySelectorAll('[data-motion-word],[data-motion-child],[data-motion-path],[data-motion-visual]')]:[];return{id,signature:JSON.stringify(nodes.map(n=>{const s=getComputedStyle(n);return[s.opacity,s.transform,s.clipPath,s.strokeDashoffset,n.hasAttribute('data-motion-visual')?n.textContent:''];})),phase:state?.phase||null,static:state?.static??null,stickyTop:e?.getAttribute('data-motion')==='story'?([e,...e.querySelectorAll('*')].find(n=>getComputedStyle(n).position==='sticky')?.getBoundingClientRect().top??null):null};}),unavailable:available.filter(id=>{const e=document.getElementById(id);return !e||getComputedStyle(e).visibility==='hidden'||Number(getComputedStyle(e).opacity)<.99||!e.getClientRects().length;}),unreadable:readable?ids.filter(id=>{const e=document.getElementById(id);return !e||[e,...e.querySelectorAll('[data-motion-word],[data-motion-child]')].some(n=>Number(getComputedStyle(n).opacity)<.99||getComputedStyle(n).visibility==='hidden');}):[]}),{ids:declared.map(s=>s.targetId),available:composition?.available||[],readable:mode!=='normal'||final});
      for(const id of snapshot.unavailable)result.failures.push(`Essential content/action unavailable in journey: ${route}#${id}`);for(const id of snapshot.unreadable)result.failures.push(`Final/reduced/static content unreadable: ${route}#${id}`);
      const checkpoint:MotionJourney['checkpoints'][number]={y:snapshot.y,timeMs:Date.now()-started,states:snapshot.states};
      if(index%3===0||final){const path=`${directory}/${route.replace(/[^a-z0-9]/gi,'-')}-${width}-${mode}-${index}.png`;await page.screenshot({path:join(root,path),animations:'allow'});checkpoint.screenshot=path;checkpoint.screenshotHash=fingerprint(root,[path]);}result.checkpoints.push(checkpoint);
    };
    if(mode==='normal')result.checkpoints.push(...await page.evaluate(()=>{const buffer=window.__vitrisJourneyOpening;if(!buffer)return [];buffer.stopped=true;return buffer.checkpoints;}));
    let index=0;await sample(index++);await page.waitForTimeout(JOURNEY_SCENARIO.openingMs);let previous=-1;
    while(true){const position=await page.evaluate(()=>({y:scrollY,max:document.documentElement.scrollHeight-innerHeight}));if(position.y>=position.max-2)break;if(position.y===previous&&index>2)throw Error('Native traversal did not advance');previous=position.y;await page.mouse.wheel(0,Math.min(JOURNEY_SCENARIO.stepPx,position.max-position.y));await page.waitForTimeout(JOURNEY_SCENARIO.firstSampleMs);await sample(index++);await page.waitForTimeout(JOURNEY_SCENARIO.readingMs-JOURNEY_SCENARIO.firstSampleMs);}
    await page.waitForTimeout(JOURNEY_SCENARIO.settleMs);await sample(index,true);
    for(const scene of result.scenes){const states=result.checkpoints.flatMap(c=>c.states.filter(s=>s.id===scene.id)),intent=declared.find(s=>s.targetId===scene.id)!;scene.active=scenePlayed(result.checkpoints,scene.id,intent.effect);if(mode==='normal'&&!operatorOff&&!(width<600&&intent.mobile==='static')&&!scene.active)result.failures.push(`Planned scene inert in full journey: ${route}#${scene.id}; inspect initial-visible/nested/large-target safeguards and choose a supporting target`);}
    if(mode==='normal'&&!operatorOff)result.failures.push(...concentrationFailures(route,result.sections,result.scenes,900));
  }catch(error){result.failures.push(String(error));}finally{const video=page.video();await context.close();if(video){result.video=relative(root,await video.path()).replaceAll('\\','/');result.videoHash=fingerprint(root,[result.video]);}}
  result.failures=[...new Set(result.failures)];return result;
}

// CSS story is intentional native sticky layout, not a runtime animation. Require
// observed pinning across actual scroll movement, never accept a static label alone.
function scenePlayed(checkpoints:MotionJourney['checkpoints'],id:string,effect:string):boolean{
 const states=checkpoints.flatMap(c=>c.states.filter(s=>s.id===id));
 if(effect!=='story')return new Set(states.map(s=>s.signature)).size>1&&states.some(s=>s.static===false);
 return checkpoints.some((c,i)=>{const previous=checkpoints[i-1],a=previous?.states.find(s=>s.id===id),b=c.states.find(s=>s.id===id);return previous&&c.y>previous.y+20&&typeof a?.stickyTop==='number'&&typeof b?.stickyTop==='number'&&Math.abs(a.stickyTop-b.stickyTop)<2&&b.stickyTop>=0&&b.stickyTop<900;});
}

export function journeyEvidenceFailures(root:string,evidence:MotionJourney,plan:MotionPlan):string[]{
  const errors=[...evidence.failures];
  const html=readFileSync(join(root,`dist${evidence.path==='/'?'':evidence.path}/index.html`),'utf8'),asset=html.match(/src=["'](\/motion-[^"']+\.js)["']/)?.[1];
  if(evidence.sourceHash!==sourceHash(root)||evidence.outputHash!==fingerprint(root,['dist'])||evidence.planHash!==fingerprint(root,['onboarding/storyboard.json'])||evidence.scenarioHash!==JOURNEY_SCENARIO_HASH||evidence.engineAssetHash!==(asset?fingerprint(root,[`dist${asset}`]):''))errors.push(`Route journey source/output/plan/scenario bytes stale: ${evidence.path}`);
  if(!evidence.checkpoints.length||evidence.checkpoints[0]!.y>2||evidence.checkpoints.some((c,i)=>i>0&&(c.y<evidence.checkpoints[i-1]!.y||c.y-evidence.checkpoints[i-1]!.y>900)))errors.push(`Route journey skipped content: ${evidence.path}`);
  if((evidence.checkpoints.at(-1)?.y||0)+900<Math.max(0,...evidence.sections.map(s=>s.bottom))-2)errors.push(`Route journey did not reach closing content: ${evidence.path}`);
  for(const c of evidence.checkpoints)if(c.screenshot){try{const bytes=readFileSync(join(root,c.screenshot));if(!c.screenshotHash||fingerprint(root,[c.screenshot])!==c.screenshotHash||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))errors.push(`Journey checkpoint corrupt/changed: ${c.screenshot}`);}catch{errors.push(`Journey checkpoint missing: ${c.screenshot}`);}}
  if(evidence.mode==='normal'&&(!evidence.video||!existsSync(join(root,evidence.video))||fingerprint(root,[evidence.video])!==evidence.videoHash))errors.push(`Normal full-route recording missing/changed: ${evidence.path}`);
  for(const s of plan.scenes.filter(s=>s.route===evidence.path))if(!evidence.scenes.some(e=>e.id===s.targetId))errors.push(`Scene omitted from full journey: ${evidence.path}#${s.targetId}`);
  const off=motionCompositionPolicy(root,[evidence.path]).operatorOff;
  for(const scene of plan.scenes.filter(s=>s.route===evidence.path)){
    const states=evidence.checkpoints.flatMap(c=>c.states.filter(s=>s.id===scene.targetId));
    const played=scenePlayed(evidence.checkpoints,scene.targetId,scene.effect);
    if(evidence.mode==='normal'&&!off&&!(evidence.width<600&&scene.mobile==='static')&&!played)errors.push(`Planned scene has no bound playback evidence: ${evidence.path}#${scene.targetId}`);
  }
  if(evidence.mode==='normal'&&!off)errors.push(...concentrationFailures(evidence.path,evidence.sections,evidence.scenes,900));
  return [...new Set(errors)];
}

export const MOTION_CRITIQUE_CRITERIA=['whole-journey','distribution-connections','business-rhythm','competition-stillness','route-differences','immediate-use'] as const;
export function motionCritiqueFailures(root:string,review:any,routes:string[],report:any):string[]{
  const errors:string[]=[];
  for(const route of routes){const row=review.motionJourneys?.find((r:any)=>r.route===route);if(!row){errors.push(`Located whole-route motion critique missing: ${route}`);continue;}
    for(const criterion of MOTION_CRITIQUE_CRITERIA){const check=row.checks?.find((c:any)=>c.criterion===criterion);if(!check||check.verdict!=='pass'||typeof check.evidence!=='string'||check.evidence.trim().length<24||!Array.isArray(check.checkpoints)||!check.checkpoints.length){errors.push(`Motion critique needs located judgment: ${route}/${criterion}`);continue;}
      for(const path of check.checkpoints){const checkpoint=report.routeJourneys?.filter((j:any)=>j.path===route).flatMap((j:any)=>j.checkpoints).find((c:any)=>c.screenshot===path);if(!checkpoint||!existsSync(join(root,path))||fingerprint(root,[path])!==checkpoint.screenshotHash)errors.push(`Motion critique checkpoint stale/missing: ${route}/${path}`);}
    }
  }return errors;
}
