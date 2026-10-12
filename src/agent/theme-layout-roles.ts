import {COMPOSITIONS} from './theme-compositions.ts';
/** Selected spatial relationships come from the same authored CSS the renderer uses.
 * Preserve local and responsive exceptions rather than inventing a universal radius. */
export function authoredLayoutRoles(id:string,composition?:{css:string;pages:Record<string,string>;scoped?:boolean}){
 const c=composition||COMPOSITIONS[id]!;
 const pages=composition?Object.entries(composition.pages):[['main',COMPOSITIONS[id]!.main],['interior',COMPOSITIONS[id]!.interior]];
 const rules:Array<{selector:string;condition:string;roles:Record<string,string>}>=[];
 function walk(css:string,condition='desktop default'){
  let pos=0;while(pos<css.length){const open=css.indexOf('{',pos);if(open<0)break;let end=open+1,depth=1;while(end<css.length&&depth){if(css[end]==='{')depth++;if(css[end]==='}')depth--;end++;}
   const selector=css.slice(pos,open).trim(),body=css.slice(open+1,end-1);pos=end;
   if(selector.startsWith('@')){walk(body,selector);continue;}
   const roles=Object.fromEntries(body.split(';').map(d=>{const i=d.indexOf(':');return[d.slice(0,i).trim(),d.slice(i+1).trim()];}).filter(([k,v])=>v&&['display','grid-template-columns','gap','padding','margin','max-width','border-radius','background','background-color'].includes(k!)||!!composition?.scoped&&v&&['padding-block','padding-inline','margin-block','margin-inline','min-height','font-size','line-height','aspect-ratio'].includes(k!)));
   if(Object.keys(roles).length)rules.push({selector,condition,roles});
  }
 }
 walk(c.css);
 const matches=(selector:string,v:string)=>selector.trim()==='.'+v||!!composition?.scoped&&selector.trim().endsWith('.'+v);
 return Object.fromEntries(pages.map(([page,html])=>{
  const classes=[...html!.matchAll(composition?.scoped?/<(?:main|section|aside|div|header|form|figure|ol)[^>]*class="([^"]+)"/g:/<(?:main|section|aside|div)[^>]*class="([^"]+)"/g)].flatMap(m=>m[1]!.split(/\s+/));
  const selected=classes.filter((v,i)=>classes.indexOf(v)===i).filter(v=>rules.some(r=>r.selector.split(',').some(s=>matches(s,v)))).slice(0,6);
  return[page,rules.filter(r=>r.selector.split(',').some(s=>selected.some(v=>matches(s,v))))];
 }));
}
