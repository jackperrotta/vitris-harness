import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GraphNode } from './graph.ts';
/** Only prior stage intent selects recipe context; never hash this stage's own output as its instruction. */
export function plannedMotionRefs(root:string,node:GraphNode):string[]{
  if(!node.refs.includes('motion'))return [];
  const base=['motion-page'];
  // Direction review and production precede storyboard too. A stale storyboard
  // from an earlier build must not select their recipes or reopen their leases.
  const upstream = new Set(['direction-render','direction-review','asset-production','storyboard']);
  const paths = node.id==='direction'?[]:upstream.has(node.id)?['onboarding/direction.json']:['onboarding/storyboard.json','onboarding/direction.json'];
  for(const path of paths){
    if(node.writes.some(p=>path===p||path.startsWith(p+'/'))||!existsSync(join(root,path)))continue;
    try{const plan=JSON.parse(readFileSync(join(root,path),'utf8')).motionPlan;if(!plan)continue;
      const map:Record<string,string>={count:'motion-count',text:'motion-text',sequence:'motion-image',draw:'motion-process'};
      return [...new Set<string>([...base,...(plan.scenes||[]).map((s:any)=>map[s.effect]).filter(Boolean)])];
    }catch{return base;}
  }return base;
}
