import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { currentSelectionHash, selectionStore, themeSelectionEnabled, themeDependentNode } from './theme-selection.ts';
import type { SkillGraph } from './graph.ts';
import { digest } from './theme-library.ts';
import { within, fingerprint, save, acquirePathLock } from './artifacts.ts';
import { TEMPLATE_MOTION_PATH, templateMotionReviewFailures } from './template-motion.ts';
import { applyCheckpointGraph, checkpointPreferences, adaptationCheckpointEnabled, adaptationQuestions, inventoryFailures, imageCheckpointAnswer, contentRefinementQueue } from './adaptation-checkpoint.ts';

export const ADAPTATION_PATH = 'onboarding/template-adaptation.json';
export const TEMPLATE_DECISIONS_PATH = 'agent/template-decisions.json';
export type AdaptationPreferences = {
  version: 1;
  sections: 'preserve-ask' | 'agent-decides';
  aiImages: 'ask-each' | 'no-ai' | 'agent-decides';
  priorities: string;
  /** Explicit direct-input continuation; absent retains interactive checkpoints. */
  checkpoints?: 'automatic' | 'ask';
};
export type TemplateAdaptation = {
  version: 1;
  selectionHash: string;
  reference: { url: string; evidence: string[] };
  qualities: Array<{ id: string; relationship: string; implementation: string }>;
  sections: Array<{ id: string; referenceSection: string; referenceIds?: string[]; owner?: string; disposition: 'retain' | 'adapt' | 'remove'; route: string; targetId: string; content: 'ready' | 'draft' | 'placeholder'; nextStep?: string }>;
  images: Array<{ id: string; purpose: string; treatment: string; identity: string; status: 'proposed' | 'approved' | 'declined'; output?: string; commissionHash?: string; references?: Array<{assetId:string;path:string;sha256:string}> }>;
};
export type TemplateDecision = { kind: 'remove-section' | 'generate-image'; id: string; proposalHash: string; source: 'user-chat' | 'user-ui'; instruction: string };
const read = <T>(root: string, path: string): T | undefined => existsSync(join(root,path)) ? JSON.parse(readFileSync(join(root,path),'utf8')) as T : undefined;
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
export function validateAdaptationPreferences(value: unknown): asserts value is AdaptationPreferences {
  const p = value as AdaptationPreferences;
  if (!p || p.version !== 1 || !['preserve-ask','agent-decides'].includes(p.sections) || !['ask-each','no-ai','agent-decides'].includes(p.aiImages) || typeof p.priorities !== 'string' || p.priorities.length > 8000) throw new Error('Invalid template adaptation preferences');
  if (p.checkpoints !== undefined && !['automatic','ask'].includes(p.checkpoints)) throw new Error('Invalid template checkpoint policy');
}
export function adaptationPreferences(root: string): AdaptationPreferences | undefined {
  if (!themeSelectionEnabled(root)) return undefined;
  const value = selectionStore(root)?.current.adaptation || checkpointPreferences(root);
  if (value) validateAdaptationPreferences(value);
  return value;
}
/** Apply before reconciliation as well as preparation/completion: output and
 * dependency identities must use the same effective graph on every load. */
export function applyTemplateAdaptationGraph(root: string, graph: SkillGraph): SkillGraph {
  for (const node of graph.nodes) if (node.id !== 'harvest' && existsSync(join(root,'onboarding/additional-content.md'))) {
    node.optionalInputs = [...new Set([...(node.optionalInputs || []), 'onboarding/additional-content.md'])];
  }
  applyCheckpointGraph(root,graph);
  if (!adaptationPreferences(root)) return graph;
  for (const node of graph.nodes) if (themeDependentNode(node)) {
    if (['representative','pages'].includes(node.id)) node.writes=[...new Set([...node.writes,TEMPLATE_MOTION_PATH])];
    if (['representative','pages','representative-review','representative-quality','visual-review'].includes(node.id)) node.optionalRefs=[...new Set([...(node.optionalRefs||[]),'template-motion'])];
    // This authoring output must not invalidate upstream content or direction.
    if (['representative-browser','representative-review','representative-quality','browser','visual-review'].includes(node.id)) node.optionalInputs=[...new Set([...(node.optionalInputs||[]),TEMPLATE_MOTION_PATH])];
    if (node.id==='reference-analysis') node.writes=[...new Set([...node.writes,ADAPTATION_PATH,'onboarding/template-reference'])];
    else node.optionalInputs=[...new Set([...(node.optionalInputs||[]),ADAPTATION_PATH,TEMPLATE_DECISIONS_PATH])];
  }
  return graph;
}
/** Excludes workflow status/output so an approved proposal survives production. */
export function templateProposalHash(proposal: TemplateAdaptation['images'][number] | TemplateAdaptation['sections'][number]): string {
  if ('treatment' in proposal) return digest({ id:proposal.id,purpose:proposal.purpose,treatment:proposal.treatment,identity:proposal.identity, ...(proposal.references?{references:proposal.references}:{}), ...(proposal.commissionHash?{commissionHash:proposal.commissionHash}:{}) });
  return digest(proposal);
}
export function submitTemplateDecision(root: string, decision: TemplateDecision): void {
  const release=acquirePathLock(join(root,'agent/template-decisions-transaction'));
  try {
    const brief=read<TemplateAdaptation>(root,ADAPTATION_PATH);
    const proposal=decision.kind==='generate-image'?brief?.images?.find(p=>p.id===decision.id):decision.kind==='remove-section'?brief?.sections?.find(p=>p.id===decision.id&&p.disposition==='remove'):undefined;
    if (!brief || brief.selectionHash!==currentSelectionHash(root) || !proposal || decision.proposalHash!==templateProposalHash(proposal) || !['user-chat','user-ui'].includes(decision.source) || !text(decision.instruction)) throw new Error('Decision must record an explicit human answer to the exact current proposal');
    const prior=read<{version:number;selectionHash:string;decisions:TemplateDecision[];history?:unknown[]}>(root,TEMPLATE_DECISIONS_PATH);
    const same=prior?.selectionHash===currentSelectionHash(root);
    const decisions=same?[...prior.decisions]:[];
    if (!decisions.some(d=>digest(d)===digest(decision))) decisions.push(decision);
    save(join(root,TEMPLATE_DECISIONS_PATH),{version:1,selectionHash:currentSelectionHash(root),decisions,history:[...(prior?.history||[]),...(!same&&prior?[{selectionHash:prior.selectionHash,decisions:prior.decisions}]:[])]});
  } finally {release();}
}
export function assertTemplateImageAuthorization(root: string, requestId: string, commission?: {sourceAssetIds:string[]}): void {
  const prefs=adaptationPreferences(root);
  if(adaptationCheckpointEnabled(root)&&!prefs)throw Error('Answer template adaptation policy before image production');
  if (!prefs || prefs.aiImages==='agent-decides') return;
  if (prefs.aiImages==='no-ai') throw new Error('This template selection prohibits AI imagery');
  const brief=read<TemplateAdaptation>(root,ADAPTATION_PATH);
  const proposal=brief?.images?.find(p=>p.id===requestId);
  const decisions=read<{version:number;selectionHash:string;decisions:TemplateDecision[]}>(root,TEMPLATE_DECISIONS_PATH);
  const response=proposal?imageCheckpointAnswer(root,requestId,templateProposalHash(proposal)):undefined;
  const approved=proposal&&(response==='approve'||decisions?.version===1&&decisions.selectionHash===currentSelectionHash(root)&&decisions.decisions.some(d=>d.kind==='generate-image'&&d.id===requestId&&d.proposalHash===templateProposalHash(proposal)&&['user-chat','user-ui'].includes(d.source)&&text(d.instruction)));
  if (!brief || brief.version!==1 || brief.selectionHash!==currentSelectionHash(root) || !proposal || proposal.status==='declined' || response==='decline'||!approved) throw new Error('Ask the user before generating/registering this image proposal: '+requestId);
  if(adaptationCheckpointEnabled(root)) {
    if(!commission||proposal.commissionHash!==digest(commission)||!Array.isArray(proposal.references))throw Error('Image approval must bind the exact production commission and reference bytes: '+requestId);
    if(JSON.stringify([...commission.sourceAssetIds].sort())!==JSON.stringify(proposal.references.map(r=>r.assetId).sort()))throw Error('Image reference identities differ from the approved proposal');
    const inventory=read<{assets:Array<{id:string;path:string;sha256?:string}>}>(root,'onboarding/media-inventory.json');
    for(const ref of proposal.references){const asset=inventory?.assets.find(a=>a.id===ref.assetId);if(!asset||asset.path.replace(/^\//,'')!==ref.path||asset.sha256!==ref.sha256)throw Error('Image reference differs from the audited source asset: '+ref.assetId);}
  }
  for(const ref of proposal.references||[])if(!existsSync(within(root,ref.path))||digest(readFileSync(within(root,ref.path)))!==ref.sha256)throw Error('Image reference bytes changed; ask for a new decision: '+ref.assetId);
}
export function templateAdaptationFailures(root: string, node: string): string[] {
  if(adaptationCheckpointEnabled(root)&&['direction','template-reference-review','direction-review','asset-production','storyboard','copy','representative','copy-expansion','pages','visual-review','content-review','launch'].includes(node)) {
    const failures=inventoryFailures(root,node!=='template-reference-review');
    for(const q of adaptationQuestions(root,node))failures.push('Unanswered adaptation decision: '+q.id);
    if(failures.length)return failures;
  }
  const prefs = adaptationPreferences(root);
  if (!prefs || !['reference-analysis','direction','direction-review','asset-production','storyboard','representative','representative-review','representative-quality','pages','visual-review','content-review','launch'].includes(node)) return [];
  const brief = read<TemplateAdaptation>(root,ADAPTATION_PATH), errors: string[] = [];
  if (['representative','pages','representative-review','representative-quality','visual-review'].includes(node)) errors.push(...templateMotionReviewFailures(root,currentSelectionHash(root)!,node));
  if (!brief) return ['Missing template adaptation brief: inventory the selected template before simplifying it'];
  if (['representative','pages','representative-review','representative-quality','visual-review'].includes(node) && brief.qualities?.some(q=>/motion|movement|transition|animation|choreograph/i.test(q.id+' '+q.relationship)) && !existsSync(join(root,TEMPLATE_MOTION_PATH))) errors.push('Defining template motion needs a located temporal comparison plan before authoring completion');
  if (brief.version !== 1 || brief.selectionHash !== currentSelectionHash(root)) errors.push('Template adaptation brief is stale or unsupported');
  if (!brief.reference || !/^https?:\/\//.test(brief.reference.url) || !Array.isArray(brief.reference.evidence) || !brief.reference.evidence.length) errors.push('Template adaptation needs an inspected reference and capture evidence');
  else for (const path of brief.reference.evidence) if (!existsSync(within(root,path))) errors.push('Missing template reference evidence: '+path);
  if (!Array.isArray(brief.qualities) || !brief.qualities.length || brief.qualities.some(q=>!text(q.id)||!text(q.relationship)||!text(q.implementation))) errors.push('Template adaptation needs located emotional/interaction relationships and implementation plans');
  const decisions = read<{version:1;selectionHash:string;decisions:TemplateDecision[]}>(root,TEMPLATE_DECISIONS_PATH);
  const approved = (kind: TemplateDecision['kind'], proposal: TemplateAdaptation['images'][number] | TemplateAdaptation['sections'][number]) => kind==='generate-image'?imageCheckpointAnswer(root,proposal.id,templateProposalHash(proposal))==='approve':decisions?.version === 1 && decisions.selectionHash === currentSelectionHash(root) && decisions.decisions.some(d=>d.kind===kind&&d.id===proposal.id&&d.proposalHash===templateProposalHash(proposal)&&['user-chat','user-ui'].includes(d.source)&&text(d.instruction));
  if (!Array.isArray(brief.sections) || !brief.sections.length) errors.push('Template adaptation needs every major reference section, including content gaps');
  else {
    if (new Set(brief.sections.map(s=>s.id)).size !== brief.sections.length) errors.push('Duplicate template section IDs');
    for (const section of brief.sections) {
      if (!text(section.id)||!text(section.referenceSection)||!['retain','adapt','remove'].includes(section.disposition)||!['ready','draft','placeholder'].includes(section.content)) errors.push('Invalid template section: '+section.id);
      if (section.disposition === 'remove') {
        if (prefs.sections === 'preserve-ask' && !approved('remove-section',section)) errors.push('Ask before removing template section: '+section.id);
        continue;
      }
      if (!section.route?.startsWith('/') || !/^[A-Za-z][\w-]*$/.test(section.targetId)) errors.push('Retained section needs a route and stable target ID: '+section.id);
      if (section.content !== 'ready' && !text(section.nextStep)) errors.push('Content gap needs a fill-in/refinement action: '+section.id);
      if (node === 'launch' && section.content !== 'ready') errors.push('Resolve template content gap before launch: '+section.id);
      if (['representative','representative-quality','pages','visual-review','content-review'].includes(node) && (section.route==='/' || node==='pages'||node==='visual-review'||node==='content-review')) {
        const path = join(root,'dist',section.route==='/'?'index.html':section.route.replace(/^\//,'').replace(/\/$/,'')+'/index.html');
        const html = existsSync(path)?readFileSync(path,'utf8'):'';
        if (!html.includes('id="'+section.targetId+'"') && !html.includes("id='"+section.targetId+"'")) errors.push('Retained template section missing from rendered route: '+section.id);
        if (section.content !== 'ready' && !html.includes('data-content-gap="'+section.id+'"')) errors.push('Draft/placeholder needs a visible, located content gap: '+section.id);
      }
    }
  }
  if (!Array.isArray(brief.images)) errors.push('Template adaptation needs an image proposal list (empty is allowed)');
  else for (const proposal of brief.images) {
    if (!text(proposal.id)||!text(proposal.purpose)||!text(proposal.treatment)||!text(proposal.identity)||!['proposed','approved','declined'].includes(proposal.status)) errors.push('Invalid template image proposal: '+proposal.id);
    if ((proposal.status==='approved'||proposal.output) && (prefs.aiImages==='no-ai'||prefs.aiImages==='ask-each'&&!approved('generate-image',proposal))) errors.push('Image lacks approval for this exact proposal: '+proposal.id);
    if (proposal.output && !existsSync(within(root,proposal.output))) errors.push('Missing approved image output: '+proposal.id);
  }
  if (['representative-review','visual-review'].includes(node)) {
    const fidelity = read<{templateFidelity?:{selectionHash:string;distHash:string;qualities:Array<{id:string;referenceEvidence:string;implementedEvidence:string;observation:string;verdict:string}>}}>(root,'agent/reviews/'+node+'.json')?.templateFidelity;
    if (!fidelity || fidelity.selectionHash!==currentSelectionHash(root) || fidelity.distHash!==fingerprint(root,['dist'])) errors.push('Template fidelity comparison missing or stale');
    else for (const quality of brief.qualities || []) {
      const comparison=fidelity.qualities?.find(q=>q.id===quality.id);
      if (!comparison || comparison.verdict!=='pass' || !text(comparison.observation) || !brief.reference.evidence.includes(comparison.referenceEvidence) || !existsSync(within(root,comparison.implementedEvidence))) errors.push('Template quality lacks located reference/build comparison: '+quality.id);
    }
  }
  return errors;
}
export function templateAdaptationGuidance(root: string): string {
  const prefs = adaptationPreferences(root);
  if (!prefs) return '';
  return `\n## Template adaptation contract\nExact adaptation preferences: ${JSON.stringify(prefs)}\nInventory the inspected template's major sections, page rhythm, media roles and defining interactions in ${ADAPTATION_PATH} during reference-analysis. Bind to the current selection hash. Preserve emotional relationships as well as tokens. Missing source content is a visible draft/placeholder with a concrete next step; it is not a reason to erase a section. Do not import fictional template claims or pass drafts as facts. Record exact human decisions in ${TEMPLATE_DECISIONS_PATH}; never infer approval. Ask about each proposed AI image before production when requested; approvals bind the treatment and identity, and changed proposals require a new answer. Compare the representative page to the reference for each quality before expansion; ${prefs.checkpoints === 'automatic' ? 'use the critic comparison to repair defects and continue automatically through local preview; do not stop to ask for representative feedback or claim human approval.' : 'show the comparison to the user and carry feedback into refinement.'} When motion defines a selected quality, author ${TEMPLATE_MOTION_PATH} at representative/pages: locate reference/customer targets, interaction kinds, viewport, intent and explained departures. Browser verification records paired videos and frames; critic templateMotion observations assess timing, easing, continuity and input alternatives against those current captures. Use data-island="experience" only for appropriate declared choreography; do not add every interaction to every site. Runtime motion checks and agent reviews are not human design approval. Unresolved gaps can appear in a local refinement preview but block launch.\n${JSON.stringify(read<TemplateAdaptation>(root,ADAPTATION_PATH) || {status:'brief-needed'})}\n${adaptationCheckpointEnabled(root)?JSON.stringify(contentRefinementQueue(root)):''}\n`;
}
