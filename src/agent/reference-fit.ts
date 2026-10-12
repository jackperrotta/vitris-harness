/** Shared vocabulary for advisory retrieval. Inferences never become business facts. */
export type FitProfile = { tasks: string[]; expressions: string[]; contexts: string[]; contributions: string[]; contextBasis?: string;
  interpretation?: { assetMinimum: string; scope: string; missingDependencies: string[] } };
export const EXPRESSION_ALIASES: Record<string, string[]> = {
  swiss: ["swiss", "systematic", "international typographic", "modernist"],
  editorial: ["editorial", "literary", "reading room"],
  "expressive-type": ["expressive type", "expressive typography", "typographic", "type led", "type-led"],
  "quiet-luxury": ["quiet luxury", "quiet-luxury", "understated luxury", "refined", "restrained"],
  documentary: ["documentary", "project first", "project-first"], campaign: ["campaign", "fashion"],
  hospitality: ["hospitality", "atmospheric", "cinematic"], maximalism: ["maximalism", "maximalist", "collage", "graphic maximalism"],
  handmade: ["handmade", "illustrative", "hand drawn", "hand-drawn"], industrial: ["industrial", "utilitarian"],
  technical: ["technical", "product led", "product-led"], retro: ["retro", "nostalgic", "vintage"],
  athletic: ["athletic", "kinetic"], civic: ["civic", "functional", "task led", "task-led"],
  "text-first": ["text first", "text-first", "sparse", "minimal"], spatial: ["spatial", "experimental", "immersive"],
};
const clean = (s: string) => s.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
export function expressionSignals(request: string) {
  const text=clean(request), families=Object.entries(EXPRESSION_ALIASES).filter(([,terms])=>terms.some(t=>text.includes(clean(t)))).map(([id])=>id);
  return { requested: request, families, uncertainty: request.trim() && !families.length ? "unsupported-expression" : null };
}
const TASK_ALIASES: Record<string,string[]> = {
  "inspect-work": ["inspect work","evaluate work","portfolio","case study","inspect a specimen","compare type families"],
  "evaluate-service": ["evaluate service","find service","find specialist","understand scope"],
  "compare-options": ["compare options","compare services","choose","compare topics"],
  "understand-process": ["understand process","how it works"], "read-deeply": ["read deeply","read insight","find article","find poem","browse archive","find film","find information"],
  "shop-collection": ["shop collection","explore collection","explore a brand and products"],
  "explore-product": ["explore product","inspect product","inspect specification","inspect specifications","find practical product answers"],
  "find-location": ["find location","plan visit","find menu","find event","find programme","explore events"],
  "book-inquiry": ["book inquiry","book visit","inquire"], "play-audio": ["play audio","listen audio"],
};
export function normalizeTasks(tasks: string[], precise = false) {
  return [...new Set(tasks.flatMap(t=>{const text=clean(t);const hits=Object.entries(TASK_ALIASES).filter(([,aliases])=>aliases.some(a=>text===a && !(precise && ["explore collection","find information"].includes(a)))).map(([id])=>id);return hits.length?hits:[text.replaceAll(" ","-")];}))].sort();
}
export function businessContexts(text: string) {
  const rules: Record<string,RegExp> = {
    "financial-service": /bookkeep|accountant|accounting|insurance|tax|financial|reconciliation/i,
    "legal-service": /\blaw\b|legal|avocat|dispute resolution|chambers|counsel/i,
    "creative-practice": /editorial|information design|graphic design|designer|typograph|writer|personal practice|creative studio/i,
    "project-service": /architect|construction|building|roof|repair|contractor|landscape/i,
    retail: /shop|retail|carry bag|objects for|wall shelf|collection|clothing|fashion/i,
    venue: /restaurant|supper|menu|exhibition|museum|venue|hotel|gathering/i,
    "technical-product": /software|platform|product ui|workflow|interface|component|specification/i,
  };
  return Object.entries(rules).filter(([,pattern])=>pattern.test(text)).map(([id])=>id);
}
export type FitSignals = { known: string[]; absent: string[]; theme?: string; visitorTasks?: string[];
  contexts?: string[]; expression?: ReturnType<typeof expressionSignals>; roles?: string[] };
const WEAK = new Set(["type-content","real-copy","process","sparse-media","action","business-relationship","professional-service","routes","content-group"]);
export function fitScore(profile: FitProfile, fitSignals: string[], signals: FitSignals, precise = false) {
  const tasks=normalizeTasks(signals.visitorTasks || [],precise), expression=signals.expression || expressionSignals(signals.theme || "");
  const specific=profile.tasks.filter(t=>tasks.includes(t) && t!=="book-inquiry"), action=Number(profile.tasks.includes("book-inquiry")&&tasks.includes("book-inquiry"));
  const styles=profile.expressions.filter(t=>expression.families.includes(t)), context=profile.contexts.filter(t=>signals.contexts?.includes(t));
  const strong=fitSignals.filter(t=>!WEAK.has(t)&&signals.known.includes(t)), generic=fitSignals.filter(t=>WEAK.has(t)&&signals.known.includes(t));
  // Generic prose/process matches are bounded once, not summed into a false identity match.
  const taskWeight:Record<string,number>={"inspect-work":24,"evaluate-service":20,"shop-collection":24,"find-location":24,"explore-product":20,"read-deeply":12,"understand-process":8,"compare-options":8,"play-audio":24};
  const contextConflict=precise&&!!signals.contexts?.length&&!!profile.contexts.length&&!context.length;
  const components={task:(precise?specific.map(t=>taskWeight[t]||8).sort((a,b)=>b-a).slice(0,3).reduce((sum,n)=>sum+n,0):Math.min(specific.length,3)*12)+action, expression:styles.length?(precise?50:30):0, context:context.length?(precise?16:10):contextConflict?-8:0, content:Math.min(strong.length,2)*(precise?1:3), generic:Number(generic.length>0)};
  const score=Object.values(components).reduce((a,b)=>a+b,0);
  return {score,components,reasons:[...specific.map(t=>`task:${t}`),...styles.map(t=>`expression:${t}`),...context.map(t=>`context:${t}`),...(contextConflict?["context:transfer-across-business-contexts"]:[]),...strong.map(t=>`content:${t}`),...(generic.length?[`generic-bounded:${generic.join(",")}`]:[])],supported:!!(specific.length||styles.length||context.length||(!precise&&strong.length))&&(!precise||score>=20)};
}
export function essentialAssetGap(minimum: string, signals: FitSignals) {
  if (minimum==="product-ui"&&!signals.known.includes("product-ui")) return "actual product UI absent";
  if (["one-image","multiple-images"].includes(minimum)&&!signals.known.includes("approved-image")) return "essential approved image absent";
  if (minimum==="multiple-images"&&!signals.known.includes("multiple-images")) return "multiple approved images absent";
  return "";
}
/** Complementarity can break close substantive scores, never rescue ineligible material. */
export function complementaryFit<T extends {id:string;score:number;profile:FitProfile;reasons:string[]}>(pool:T[], limit:number, tie:(id:string)=>string, precise = false) {
  const result:T[]=[], remaining=[...pool].sort((a,b)=>b.score-a.score||tie(a.id).localeCompare(tie(b.id)));
  while(remaining.length&&result.length<limit){
    const near=remaining.filter(r=>r.score>=remaining[0]!.score-(precise?6:12));
    const seen=new Set(result.flatMap(r=>r.profile.contributions)), styles=new Set(result.flatMap(r=>r.profile.expressions));
    const gain=(r:T)=>Math.min(r.profile.contributions.filter(c=>!seen.has(c)).length,precise?2:Infinity)*3+Number(r.profile.expressions.some(s=>!styles.has(s)));
    near.sort((a,b)=>gain(b)-gain(a)||b.score-a.score||tie(a.id).localeCompare(tie(b.id)));
    const next=near[0]!;result.push({...next,reasons:[...next.reasons,`contribution:${next.profile.contributions.join(",")}`]});remaining.splice(remaining.findIndex(r=>r.id===next.id),1);
  }
  return result;
}
