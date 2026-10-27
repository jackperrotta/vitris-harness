import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { acquirePathLock, fingerprint, save, within } from './artifacts.ts';
import { currentSelectionHash, selectionStore, themeSelectionEnabled } from './theme-selection.ts';
import { digest, visualTheme } from './theme-library.ts';
import { manifestPages } from './theme-preview.ts';
import { ADAPTATION_PATH, templateProposalHash, validateAdaptationPreferences, type AdaptationPreferences, type TemplateAdaptation } from './template-adaptation.ts';
import { pinnedTemplateEntry } from './template-catalog.ts';
import type { SkillGraph } from './graph.ts';
import { hasActiveStageLease } from './preparation.ts';

export const RESPONSES_PATH = 'agent/template-responses.json';
export const QUESTIONS_PATH = 'agent/template-questions.json';
export const INVENTORY_PATH = 'onboarding/template-inventory.json';
export const INVENTORY_REVIEW = 'agent/reviews/template-reference-review.json';
const read = <T>(root:string,path:string):T|undefined => existsSync(join(root,path))?JSON.parse(readFileSync(join(root,path),'utf8')):undefined;
const text = (v:unknown):v is string => typeof v==='string' && !!v.trim();
export type ReferenceInventory = {version:1;selectionHash:string;evidence:Array<{path:string;sha256:string}>;pages:Array<{key:string;url:string;sections:Array<{id:string;label:string;role:string;mediaRole:string;rhythm:string}>}>};
export type AdaptationQuestion = {id:string;kind:'preferences'|'content'|'image'|'representative';question:string;proposalHash:string;suggested?:unknown;context?:unknown};
export type AdaptationResponse = {id:string;proposalHash:string;operationId?:string;source:'user-chat'|'user-ui'|'test-simulation';instruction:string;value:unknown};
type Responses = {version:1;selectionHash:string;answers:AdaptationResponse[];history?:unknown[]};

/** New scaffolds opt in; managed upgrades do not rewrite customer policy or fabricate answers. */
export function adaptationCheckpointEnabled(root:string):boolean {
  const policy=read<{templateAdaptation?:{version:number}}>(root,'launch.json')?.templateAdaptation;
  if(!policy)return false;
  if(policy.version!==2)throw Error('Unsupported templateAdaptation policy; use version 2');
  return themeSelectionEnabled(root);
}
const setupProposal = (root:string) => ({selectionHash:currentSelectionHash(root),suggested:{version:1,sections:'preserve-ask',aiImages:'ask-each',priorities:''}});
function answer(root:string,id:string,hash:string):AdaptationResponse|undefined {
  const store=read<Responses>(root,RESPONSES_PATH);
  if(store?.version!==1 || store.selectionHash!==currentSelectionHash(root))return;
  return [...store.answers].reverse().find(a=>a.id===id&&a.proposalHash===hash&&text(a.instruction)&&(['user-chat','user-ui'].includes(a.source)||a.source==='test-simulation'&&selectionStore(root)?.current.source==='test-simulation'));
}
export function checkpointPreferences(root:string):AdaptationPreferences|undefined {
  if(!adaptationCheckpointEnabled(root))return;
  const a=answer(root,'adaptation-policy',digest(setupProposal(root)));
  if(!a)return;
  validateAdaptationPreferences(a.value);return a.value;
}
export function applyCheckpointGraph(root:string,graph:SkillGraph):void {
  if(!adaptationCheckpointEnabled(root))return;
  const reference=graph.nodes.find(n=>n.id==='reference-analysis'),direction=graph.nodes.find(n=>n.id==='direction');
  if(reference&&direction&&!graph.nodes.some(n=>n.id==='template-reference-review')) {
    graph.nodes.splice(graph.nodes.indexOf(direction),0,{id:'template-reference-review',needs:['reference-analysis'],kind:'critic',eval:'template-reference-review',writes:[INVENTORY_REVIEW],inputs:[INVENTORY_PATH,ADAPTATION_PATH],optionalInputs:['agent/theme-selection.json'],refs:['critic','template-adaptation'],tools:[],maxAttempts:4,repair:'reference-analysis',subjectPaths:[INVENTORY_PATH,ADAPTATION_PATH,'agent/theme-selection.json']});
    direction.needs=direction.needs.map(n=>n==='reference-analysis'?'template-reference-review':n);
  }
  for(const n of graph.nodes) {
    if(n.id==='reference-analysis'){n.writes=[...new Set([...n.writes,INVENTORY_PATH,ADAPTATION_PATH,'onboarding/template-reference'])];n.refs=[...new Set([...n.refs,'template-adaptation'])];}
    if(n.id==='template-reference-review'||['direction','direction-review','asset-production','storyboard','copy','representative','copy-expansion','pages','visual-review','content-review'].includes(n.id)) {
      n.optionalInputs=[...new Set([...(n.optionalInputs||[]),INVENTORY_PATH,...(n.id==='template-reference-review'?[]:[INVENTORY_REVIEW])])];
      n.optionalRefs=[...new Set([...(n.optionalRefs||[]),'template-adaptation'])];
    }
  }
}
export function inventoryFailures(root:string,requireReview=true):string[] {
  if(!adaptationCheckpointEnabled(root))return [];
  const inv=read<ReferenceInventory>(root,INVENTORY_PATH),brief=read<TemplateAdaptation>(root,ADAPTATION_PATH),errors:string[]=[];
  if(!inv||inv.version!==1||inv.selectionHash!==currentSelectionHash(root)||!Array.isArray(inv.pages)||!inv.pages.length||!Array.isArray(inv.evidence)||!inv.evidence.length)return ['Missing or stale independent template inventory'];
  for(const e of inv.evidence)if(!text(e.path)||!existsSync(within(root,e.path))||digest(readFileSync(within(root,e.path)))!==e.sha256)errors.push('Changed or missing inventory evidence: '+e.path);
  const selected=selectionStore(root)?.current;
  if(selected){const entry=pinnedTemplateEntry(root,selected.themeId,selected.themeRelease);const keys=(entry?.pages || manifestPages(visualTheme(selected.themeId,selected.themeRelease))).map(p=>p.pageId);for(const key of keys)if(!inv.pages.some(p=>p.key===key))errors.push('Reference inventory omits a catalog page: '+key);}
  if(new Set(inv.pages.map(p=>p.key)).size!==inv.pages.length)errors.push('Duplicate reference inventory pages');
  const ids:string[]=[];
  for(const p of inv.pages){
    if(!text(p.key)||!/^https?:\/\//.test(p.url)||!Array.isArray(p.sections)||!p.sections.length){errors.push('Invalid reference inventory page: '+p.key);continue;}
    for(const s of p.sections){ids.push(s.id);if(!text(s.id)||!text(s.label)||!text(s.role)||!text(s.mediaRole)||!text(s.rhythm))errors.push('Reference section needs role, media and rhythm: '+s.id);}
  }
  if(new Set(ids).size!==ids.length)errors.push('Reference inventory section IDs must be globally unique');
  const mapped=(brief?.sections||[]).flatMap(s=>s.referenceIds||[]);
  for(const id of ids)if(!mapped.includes(id))errors.push('Adaptation omits reviewed reference section: '+id);
  for(const s of brief?.sections||[])if(!s.referenceIds?.length||s.referenceIds.some(id=>!ids.includes(id)))errors.push('Adapted section needs valid reference IDs: '+s.id);
  if(requireReview){const review=read<{version:number;verdict:string;subjectHash:string}>(root,INVENTORY_REVIEW);if(review?.version!==2||review.verdict!=='pass'||review.subjectHash!==fingerprint(root,[INVENTORY_PATH,ADAPTATION_PATH,'agent/theme-selection.json']))errors.push('Independent template inventory review missing or stale');}
  return errors;
}
export function adaptationQuestions(root:string,node:string,includeAnswered=false):AdaptationQuestion[] {
  if(!adaptationCheckpointEnabled(root)||!selectionStore(root))return [];
  const selection=selectionStore(root)!.current;
  const prefs=selection.adaptation||checkpointPreferences(root);
  if(!prefs)return [{id:'adaptation-policy',kind:'preferences',question:'How should we adapt this direction? Choose whether to preserve sections and ask before removing them, how to handle each AI image, and which qualities matter most.',proposalHash:digest(setupProposal(root)),suggested:setupProposal(root).suggested}];
  const brief=read<TemplateAdaptation>(root,ADAPTATION_PATH),questions:AdaptationQuestion[]=[];
  if(['direction','asset-production','storyboard','copy','representative','pages'].includes(node)&&brief?.selectionHash===currentSelectionHash(root)) {
    for(const section of brief.sections.filter(s=>prefs.checkpoints!=='automatic'&&s.disposition!=='remove'&&s.content!=='ready')) {
      const proposal={id:section.id,route:section.route,referenceSection:section.referenceSection,nextStep:section.nextStep,referenceIds:section.referenceIds||[]};
      const id='content:'+section.id,hash=digest(proposal);
      if(includeAnswered||!answer(root,id,hash))questions.push({id,kind:'content',proposalHash:hash,question:section.nextStep||'Supply content, leave this section as a fill-in, or request removal.',context:proposal,suggested:'defer'});
    }
    if(prefs.aiImages==='ask-each')for(const image of brief.images){
      const id='image:'+image.id,hash=templateProposalHash(image);
      if(includeAnswered||!imageCheckpointAnswer(root,image.id,hash))questions.push({id,kind:'image',proposalHash:hash,question:`Approve or decline this image: ${image.purpose}. Treatment: ${image.treatment}. Identity: ${image.identity}.`,context:image});
    }
  }
  if(node==='copy-expansion'&&prefs.checkpoints!=='automatic') {
    const report=read<{templateFidelity?:{selectionHash:string;distHash:string}}>(root,'agent/reviews/representative-review.json');
    const hash=representativeFeedbackHash(root);
    if(report?.templateFidelity&&(includeAnswered||!answer(root,'representative-feedback',hash)))questions.push({id:'representative-feedback',kind:'representative',proposalHash:hash,question:'Compare the first homepage and interior with your chosen template. Does this preserve its personality and sections? Continue expansion, or refine specific moments first?',context:{review:'agent/reviews/representative-review.json',preview:'dist/',reference:brief?.reference}});
    else if(!report?.templateFidelity)questions.push({id:'representative-feedback',kind:'representative',proposalHash:hash,question:'Capture and review the first homepage and interior against the chosen direction before requesting feedback.'});
  }
  return questions;
}
export function awaitAdaptation(root:string,node:string):string|undefined {
  if(adaptationCheckpointEnabled(root)) {
    const brief=read<TemplateAdaptation>(root,ADAPTATION_PATH);
    if(node==='copy-expansion') {
      const hash=representativeFeedbackHash(root);
      const feedback=answer(root,'representative-feedback',hash);
      if(feedback?.value==='refine')return 'Representative feedback requests refinement. Return to the representative owner using supported workflow invalidation; keep the exact saved response. Expansion awaits a new comparison and response.';
    }
    for(const s of brief?.sections||[])if(s.disposition!=='remove'&&['direction','asset-production','storyboard','copy','representative','pages'].includes(node)) {
      const hash=digest({id:s.id,route:s.route,referenceSection:s.referenceSection,nextStep:s.nextStep,referenceIds:s.referenceIds||[]});
      if(answer(root,'content:'+s.id,hash)?.value==='request-removal')return 'Owner requested removal of '+s.id+'. Revise its exact removal proposal and record the existing explicit instruction before proceeding.';
    }
  }
  const questions=adaptationQuestions(root,node);if(!questions.length)return;
  save(join(root,QUESTIONS_PATH),{version:1,selectionHash:currentSelectionHash(root),node,status:'awaiting_user',questions});
  return `Awaiting template adaptation decisions for ${node}. Review ${QUESTIONS_PATH}, ask the pending questions in chat, and save exact answers with vitris-themes answer --site "${root}" --file ABSOLUTE_RESPONSE_JSON. Suggested values are suggestions, not answers. No authoring lease or attempt has been consumed.\n${JSON.stringify(questions,null,2)}`;
}
export function requestedAdaptationRepair(root:string,node:string):{owner:string;instruction:string}|undefined {
  if(!adaptationCheckpointEnabled(root))return;
  if(node==='copy-expansion'){
    const feedback=answer(root,'representative-feedback',representativeFeedbackHash(root));
    if(feedback?.value==='refine')return {owner:'representative',instruction:feedback.instruction};
  }
  if(['direction','asset-production','storyboard','copy','representative','pages'].includes(node))for(const s of read<TemplateAdaptation>(root,ADAPTATION_PATH)?.sections||[]) {
    const feedback=answer(root,'content:'+s.id,digest({id:s.id,route:s.route,referenceSection:s.referenceSection,nextStep:s.nextStep,referenceIds:s.referenceIds||[]}));
    if(s.disposition!=='remove'&&feedback?.value==='request-removal')return {owner:'reference-analysis',instruction:feedback.instruction};
  }
}
export function submitAdaptationResponse(root:string,response:AdaptationResponse):void {
  const release=acquirePathLock(join(root,'agent/template-responses-transaction'));
  try {
    if(hasActiveStageLease(root).held)throw Error('Finish or cancel the active stage before changing human checkpoint responses');
    const pending=read<{version:number;selectionHash:string;node:string}>(root,QUESTIONS_PATH);
    if(!pending||pending.version!==1||pending.selectionHash!==currentSelectionHash(root))throw Error('Prepare the workflow to create current adaptation questions first');
    const q=adaptationQuestions(root,pending.node,true).find(q=>q.id===response.id);
    const prior=read<Responses>(root,RESPONSES_PATH);
    if(prior?.selectionHash===currentSelectionHash(root)&&prior.answers.some(a=>digest(a)===digest(response)))return;
    if(response.operationId&&(!/^[\w-]{8,100}$/.test(response.operationId)||prior?.selectionHash===currentSelectionHash(root)&&prior.answers.some(a=>a.operationId===response.operationId)))throw Error('Invalid or conflicting answer operation ID');
    if(!q||q.proposalHash!==response.proposalHash||!text(response.instruction)||!(['user-chat','user-ui'].includes(response.source)||response.source==='test-simulation'&&selectionStore(root)?.current.source==='test-simulation'))throw Error('Answer must record an explicit response to the current question');
    if(q.kind==='preferences')validateAdaptationPreferences(response.value);
    else if(!((q.kind==='image'?['approve','decline']:q.kind==='content'?['defer','provided','request-removal']:['continue','refine']).includes(String(response.value))))throw Error('Invalid adaptation answer');
    if(q.kind==='representative') {
      const review=read<{verdict:string;templateFidelity?:{selectionHash:string;distHash:string}}>(root,'agent/reviews/representative-review.json');
      if(review?.verdict!=='pass'||review.templateFidelity?.selectionHash!==currentSelectionHash(root)||review.templateFidelity.distHash!==fingerprint(root,['dist']))throw Error('Show a current reviewed representative comparison before accepting feedback');
    }
    const same=prior?.selectionHash===currentSelectionHash(root);
    save(join(root,RESPONSES_PATH),{version:1,selectionHash:currentSelectionHash(root),answers:[...(same?prior!.answers:[]),response],history:[...(prior?.history||[]),...(!same&&prior?[prior]:[])]});
    save(join(root,QUESTIONS_PATH),{...pending,status:adaptationQuestions(root,pending.node).length?'awaiting_user':'answered',questions:adaptationQuestions(root,pending.node)});
  } finally {release();}
}
export function imageCheckpointAnswer(root:string,id:string,hash:string):'approve'|'decline'|undefined {
  const response=answer(root,'image:'+id,hash);if(response)return response.value as 'approve'|'decline';
  const prior=read<{version:number;selectionHash:string;decisions:Array<{kind:string;id:string;proposalHash:string;source:string;instruction:string}>}>(root,'agent/template-decisions.json');
  if(prior?.version===1&&prior.selectionHash===currentSelectionHash(root)&&prior.decisions.some(d=>d.kind==='generate-image'&&d.id===id&&d.proposalHash===hash&&['user-chat','user-ui'].includes(d.source)&&text(d.instruction)))return 'approve';
}
function representativeFeedbackHash(root:string):string {return fingerprint(root,['agent/reviews/representative-review.json','agent/reviews/representative-browser.json']);}
/** Scope responses to their consumers: later representative feedback cannot reopen direction. */
export function checkpointDependency(root:string,node:string):unknown {
  if(!adaptationCheckpointEnabled(root))return null;
  if(!['reference-analysis','template-reference-review','direction','direction-render','direction-review','asset-production','storyboard','copy','copy-review','representative','representative-browser','representative-review','representative-quality','copy-expansion','pages','browser','visual-review','content-review'].includes(node))return null;
  const brief=read<TemplateAdaptation>(root,ADAPTATION_PATH);
  const values:unknown[]=[checkpointPreferences(root)||null];
  if(['direction','direction-review','asset-production','storyboard','copy','copy-review','representative','representative-review','representative-quality','copy-expansion','pages','visual-review','content-review'].includes(node)) {
    for(const s of brief?.sections||[])values.push(answer(root,'content:'+s.id,digest({id:s.id,route:s.route,referenceSection:s.referenceSection,nextStep:s.nextStep,referenceIds:s.referenceIds||[]}))||null);
    for(const i of brief?.images||[])values.push(answer(root,'image:'+i.id,templateProposalHash(i))||null);
  }
  if(['copy-expansion','pages','visual-review','content-review'].includes(node))values.push(answer(root,'representative-feedback',representativeFeedbackHash(root))||null);
  return values;
}
/** Derived queue is always current; it never rewrites facts or silently removes drafts. */
export function contentRefinementQueue(root:string) {
  const brief=read<TemplateAdaptation>(root,ADAPTATION_PATH);
  return {version:1,selectionHash:currentSelectionHash(root),items:(brief?.sections||[]).filter(s=>s.disposition!=='remove'&&s.content!=='ready').map(s=>({id:s.id,route:s.route,section:s.targetId,owner:s.owner||'site owner',status:s.content,nextAction:s.nextStep,decision:answer(root,'content:'+s.id,digest({id:s.id,route:s.route,referenceSection:s.referenceSection,nextStep:s.nextStep,referenceIds:s.referenceIds||[]}))||null}))};
}
