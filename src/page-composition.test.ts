import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {validateMotionPlan,motionBindingFailures} from './agent/motion-plan.ts';
import {concentrationFailures,motionCompositionPolicy} from './agent/motion-composition.ts';
import {captureMotionJourney,journeyEvidenceFailures,motionCritiqueFailures} from './agent/browser-motion-journey.ts';
import {parseGraphYaml,initialState} from './agent/graph.ts';import {prepareStage} from './agent/lifecycle.ts';
import {chromium} from 'playwright';import {buildSite} from './build/index.ts';import {previewServer} from './build/serve.ts';
import type {MotionPlan} from './agent/artifacts.ts';
const scene=(id:string)=>({route:'/',targetId:id,triggerId:id,effect:'draw' as const,timing:{duration:800},mobile:'same' as const,reduced:'static' as const,reason:'A measured connecting accent'});
const plan:MotionPlan={version:2,purpose:'An immediate opening and useful close',quiet:['body and actions'],scenes:[scene('a'),scene('b')],routes:[{route:'/',task:'Read the scope',character:'Precise',normal:'Short accents connected by still reading',mobile:'Same geometry in a stack',reduced:'Complete static strokes',ending:'A line frames the immediately available action',available:['message'],beats:[{sectionId:'intro',role:'opening',change:'Line establishes working margin',scenes:['a'],transition:'Quiet prose'},{sectionId:'detail',role:'development',change:'Read scope without interference',scenes:[],connects:['a','b'],transition:'Shared margin resumes at close'},{sectionId:'end',role:'closing',change:'Line connects the next action',scenes:['b'],transition:'Action immediately available'}]}]};
test('required coverage includes expansion and refinement while historical/operator policies remain explicit',()=>{
 assert.deepEqual(validateMotionPlan(undefined),[]);assert.ok(validateMotionPlan(undefined,['/'],{requiredRoutes:['/']}).length);
 assert.deepEqual(validateMotionPlan(plan,['/'],{requiredRoutes:['/'],sections:{'/':['intro','detail','end']}}),[]);
 assert.match(validateMotionPlan(plan,['/','/contact'],{requiredRoutes:['/','/contact']}).join(),/Missing motion composition.*contact/);
 const old=structuredClone(plan);old.version=1;delete old.routes;assert.deepEqual(validateMotionPlan(old,['/']),[]);
 const off=structuredClone(plan);off.scenes=[];off.routes![0]!.beats.forEach(b=>{b.scenes=[];delete b.connects;});assert.deepEqual(validateMotionPlan(off,['/'],{requiredRoutes:['/'],operatorOff:true}),[]);
 assert.match(validateMotionPlan(off,['/'],{requiredRoutes:['/']}).join(),/Opening\/closing not composed/);
 const root=mkdtempSync(join(tmpdir(),'page-refine-'));mkdirSync(join(root,'agent'));writeFileSync(join(root,'site.json'),'{}');writeFileSync(join(root,'agent/change-request.json'),JSON.stringify({scope:'pages',affectedPages:['/contact']}));assert.deepEqual(motionCompositionPolicy(root,['/','/contact']).requiredRoutes,['/contact']);
});
test('binding checks locate misplaced scenes and unavailable essentials; actual geometry flags concentration without an effect quota',()=>{
 const html='<main><section id="intro"><h1 id="message">Immediate</h1><svg id="a" data-motion="draw" data-motion-target="a"></svg></section><section id="detail"><p>Still scope</p></section><section id="end"><svg id="b" data-motion="draw" data-motion-target="b"></svg></section></main>';
 assert.deepEqual(motionBindingFailures(plan,'/',html),[]);assert.match(motionBindingFailures(plan,'/',html.replace('id="b"','id="missing"')).join(),/missing|outside/);
 assert.match(motionBindingFailures(plan,'/',html.replace('<section id="intro">','<section id="intro" data-motion="entrance">')).join(),/Essential/);
 const sections=[{id:'intro',top:0,bottom:900},{id:'detail',top:900,bottom:1900},{id:'end',top:1900,bottom:2500}],scenes=[{id:'a',sectionId:'detail',top:1000,bottom:1030,active:true},{id:'b',sectionId:'detail',top:1100,bottom:1130,active:true}];
 assert.match(concentrationFailures('/',sections,scenes,900).join(),/Concentrated motion/);assert.deepEqual(concentrationFailures('/',[sections[1]!],scenes,900),[]);assert.deepEqual(concentrationFailures('/',sections,[scenes[0]!,{...scenes[1]!,sectionId:'end'}],900),[]);
 const short=structuredClone(plan);short.scenes=[scene('a')];short.routes![0]!.beats=[{sectionId:'intro',role:'whole',change:'Subtle supporting accent',scenes:['a'],transition:'No extended journey necessary'}];assert.deepEqual(validateMotionPlan(short,['/'],{sections:{'/':['intro']}}),[]);
});
test('ordinary expansion and refinement preparation includes whole-page guidance before writing outputs',async()=>{
 const kernel=resolve('.');
 const full=parseGraphYaml(readFileSync(join(kernel,'agent/graph.yaml'),'utf8'));
 for(const id of ['direction','storyboard','representative','copy-expansion','pages','visual-review']){
  const root=mkdtempSync(join(tmpdir(),'page-context-'));cpSync(join(kernel,'agent'),join(root,'agent'),{recursive:true});writeFileSync(join(root,'site.json'),'{}');
  const node={...full.nodes.find(n=>n.id===id)!,needs:[],inputs:[],optionalInputs:[],writes:[],refs:['motion']},graph={...full,nodes:[node]};
  const result=await prepareStage({root,kernel,graph,state:initialState(graph),nodeId:id});assert.equal(result.status,'prepared');assert.match(readFileSync(join(root,'agent/CURRENT.md'),'utf8'),/Whole-page|whole-page|whole journey/);
 }
});
test('continuous browser journeys reject inert initial-visible text and stale source/scenario bytes, retaining reduced/no-JS readability',async()=>{
 const root=mkdtempSync(join(tmpdir(),'page-journey-'));mkdirSync(join(root,'onboarding'));mkdirSync(join(root,'pages'));writeFileSync(join(root,'site.json'),JSON.stringify({name:'Journey',scrollMotion:{version:1,policy:'enabled'},motionComposition:{version:2,routes:'all-authored'}}));
 const p=structuredClone(plan);p.scenes=[{...scene('a'),effect:'text'}];p.routes![0]!.beats=[{sectionId:'intro',role:'whole',change:'This heading incorrectly relies on initial-visible text motion',scenes:['a'],transition:'Keep readable'}];
 writeFileSync(join(root,'onboarding/storyboard.json'),JSON.stringify({motionPlan:p}));writeFileSync(join(root,'pages/index.html'),'<h1>Immediate</h1>');
 await buildSite({site:{name:'Journey',scrollMotion:{version:1,policy:'enabled'}},theme:{},catalog:{},pages:[{path:'/',file:'index.html',title:'Journey',body:'<main><section id="intro"><h1 id="message">Immediate</h1><h2 id="a" data-motion="text"><span data-motion-word>Already visible</span></h2></section></main>'}],outDir:join(root,'dist')});
 const server=previewServer(join(root,'dist'));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{
  const url='http://127.0.0.1:'+(server.address()as any).port;const normal=await captureMotionJourney(browser,root,url,'/',1080,'normal','evidence/normal',p);assert.match(normal.failures.join(),/inert/);
  const evidence=await captureMotionJourney(browser,root,url,'/',375,'reduce','evidence/reduce',p);assert.deepEqual(journeyEvidenceFailures(root,evidence,p),[]);
  const staticEvidence=await captureMotionJourney(browser,root,url,'/',375,'static','evidence/static',p);assert.deepEqual(journeyEvidenceFailures(root,staticEvidence,p),[]);
  evidence.scenarioHash='stale';assert.match(journeyEvidenceFailures(root,evidence,p).join(),/stale/);assert.match(motionCritiqueFailures(root,{},['/'],{}).join(),/critique missing/);
  writeFileSync(join(root,'pages/index.html'),'<h1>Changed</h1>');assert.match(journeyEvidenceFailures(root,staticEvidence,p).join(),/stale/);
 }finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
