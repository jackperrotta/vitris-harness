/** Source-preserving migration of authored pictograms, including CSS and JS states.
 * Text punctuation, arithmetic, keyboard notation and plain-text downloads stay text.
 * Maintenance tool only; TypeScript parsing never enters published websites.
 */
import {parse,parseFragment} from 'parse5';
import ts from 'typescript';
import {renderIcon} from '../../src/icons/index.ts';
import {escapeHtml} from '../../src/html.ts';
import type {IconVariant} from '../../src/icons/index.ts';
type Edit={start:number;end:number;text:string};
export type MigrationReport={html:string;icons:number;cssIcons:number;scriptIcons:number;labels:number;preserved:number};
const pictograms=/[\u2190-\u2BFF\u2161\u00D7\u00BB\u{1F000}-\u{1FAFF}]/gu;
const names:Record<string,string>={
 '→':'arrow-right','←':'arrow-left','↑':'arrow-up','↓':'arrow-down','↗':'arrow-right','↘':'arrow-right','↝':'arrow-right','↺':'refresh','⇄':'refresh','↔':'arrow-right',
 '★':'star','×':'close','✕':'close','☰':'menu','≡':'menu','⌄':'chevron-down','▾':'chevron-down','⌃':'chevron-up','−':'minus','✓':'check',
 '●':'circle','◯':'circle','○':'circle','◌':'circle','◉':'circle','⊙':'circle','◎':'target','◐':'moon','◒':'moon','◕':'eye','□':'grid',
 '✦':'sparkles','✧':'sparkles','✳':'sparkles','✨':'sparkles','▶':'play','▷':'play','Ⅱ':'pause','▦':'grid','⌂':'house','⌕':'search','◈':'layers',
 '◷':'clock','▮':'wifi','▰':'battery-charge','⌁':'airflow','∿':'airflow','☼':'sun','☀':'sun','☾':'moon','♡':'heart','☎':'phone','▪':'circle',
 '◇':'package','⌘':'code','▤':'subscription','▯':'mobile','♧':'users','⌖':'map-pin','»':'chevron-right','▣':'credit-card','⊕':'plus',
 '🏡':'house','🏠':'apartments','☷':'utensils','🎖':'award','🔑':'house-key','🏢':'building','▧':'chart-bar','◫':'window','⛶':'external-link','◧':'house',
 '▥':'receipt','≋':'airflow','⚙':'gear','⊞':'grid','✉':'mail','☁':'cloud','◴':'clock','─':'minus','━':'minus','✂':'scissors',
};
const apply=(source:string,edits:Edit[])=>edits.sort((a,b)=>b.start-a.start).reduce((s,e)=>s.slice(0,e.start)+e.text+s.slice(e.end),source);
const attrs=(node:any)=>Object.fromEntries((node?.attrs??[]).map((a:any)=>[a.name,a.value]));
const textOf=(node:any):string=>node.nodeName==='#text'?node.value:node.tagName==='script'||node.tagName==='style'?'':(node.childNodes??[]).map(textOf).join(' ');
const style='.vitris-icon{display:inline-block!important;pointer-events:none;width:1em;height:1em;max-width:none;vertical-align:-.125em;flex-shrink:0;overflow:visible}.vitris-icon--ne{transform:rotate(-45deg)}.vitris-icon--se{transform:rotate(45deg)}.vitris-icon--dot{width:.55em;height:.55em;vertical-align:.05em}.vitris-icon--rule{width:4em;height:1em}.vitris-icon-pair{display:inline-flex;pointer-events:none;align-items:center;width:1.25em;vertical-align:-.125em}.vitris-icon-pair>.vitris-icon{width:.625em;height:1em}';
function icon(glyph:string,context:string,css=false):string|null {
 let name=names[glyph]??(glyph==='+'?'plus':glyph==='-'?'minus':undefined);if(!name)return null;
 if(glyph==='◷'&&/tel:|555|phone|call/i.test(context))name='phone';
 if(['✧','✦'].includes(glyph)&&/stars|rating/i.test(context))name='star';
 if(glyph==='◇'&&/product/i.test(context))name='package';
 if(glyph==='◌'&&/chat/i.test(context))name='chat';
 if(['◐','◒'].includes(glyph)&&/theme/i.test(context))name='moon';
 if(glyph==='◯'&&/weather|°/.test(context))name='sun';
 if(glyph==='▦'&&/Windows|desktop/i.test(context))name='monitor';
 if(glyph==='⌘'&&/macOS/.test(context))name='laptop';
 let variant:IconVariant=['●','▪','▶','★'].includes(glyph)?'solid':['◉','⊙'].includes(glyph)?'duotone':'regular';
 if(css&&variant==='duotone')variant='regular';
 const cls=glyph==='↗'?'vitris-icon--ne':glyph==='↘'?'vitris-icon--se':['●','▪'].includes(glyph)?'vitris-icon--dot':['─','━'].includes(glyph)?'vitris-icon--rule':undefined;
 if(glyph==='↔')return `<span class="vitris-icon-pair" aria-hidden="true">${renderIcon('arrow-left')}${renderIcon('arrow-right')}</span>`;
 let svg=renderIcon(name,{variant,...(cls?{className:cls}:{})});
 if(['─','━'].includes(glyph))svg=svg.replace('viewBox="0 0 24 24"','viewBox="0 0 24 24" preserveAspectRatio="none"');
 // A mask is an independent image; rotations/sizing must be in its SVG rather
 // than relying on the document stylesheet.
 if(css&&glyph==='↗')svg=svg.replace('<g transform="translate(1.2 1.2) scale(.9)">','<g transform="rotate(-45 12 12)"><g transform="translate(1.2 1.2) scale(.9)">').replace('</svg>','</g></svg>');
 return svg;
}
function replaceText(value:string,context:string,onIcon:()=>void,allowPlus=false,preserveTimes=false):string {
 let cursor=0,result='';const regex=allowPlus?/([─━▮])\1*|[\u2190-\u2BFF\u2161\u00D7\u00BB\u{1F000}-\u{1FAFF}]\uFE0F?|\+/gu:/([─━▮])\1*|[\u2190-\u2BFF\u2161\u00D7\u00BB\u{1F000}-\u{1FAFF}]\uFE0F?/gu;
 for(const m of value.matchAll(regex)){
  const ch=[...m[0]][0]!,before=value.slice(0,m.index),after=value.slice(m.index!+m[0].length);
  // Multiplication/negative numeric notation remains authored text.
  const math=ch==='×'&&(preserveTimes||/\d\s*$/.test(before)||/^\s*\d/.test(after))||ch==='−'&&/^\s*\d/.test(after);
  const svg=math?null:icon(ch,context);
  result+=escapeHtml(value.slice(cursor,m.index));result+=svg??escapeHtml(m[0]);if(svg)onIcon();cursor=m.index!+m[0].length;
 }
 return result+escapeHtml(value.slice(cursor));
}
function migrateCss(css:string,count:()=>void):string {
 return css.replace(/\bcontent\s*:\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g,(all,quote,raw:string)=>{
  const decoded=raw.replace(/\\([0-9a-f]{1,6})\s?/gi,(_m,n)=>String.fromCodePoint(parseInt(n,16))).replace(/\\(.)/g,'$1'),value=decoded.trim();
  if(!/^[+\-\u2190-\u2BFF\u2161\u00D7\u00BB\u{1F000}-\u{1FAFF}]\uFE0F?$/u.test(value))return all;
  let svg=icon([...value][0]!,css.slice(Math.max(0,css.indexOf(all)-180),css.indexOf(all)),true);if(!svg)return all;
  if(svg.startsWith('<span'))return all;
  svg=svg.replace(/width="1em" height="1em"/,'width="24" height="24"');count();
  return `content:"";display:inline-block;width:1em;height:1em;vertical-align:-.125em;${/^\s/.test(decoded)?'margin-inline-start:.25em;':''}background-color:currentColor;-webkit-mask:url("data:image/svg+xml,${encodeURIComponent(svg)}") center/contain no-repeat;mask:url("data:image/svg+xml,${encodeURIComponent(svg)}") center/contain no-repeat`;
 });
}
function migrateScript(code:string,count:()=>void):string {
 const file=ts.createSourceFile('template.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits:Edit[]=[],safe=new Set<ts.Node>();
 const leaves=(node:ts.Expression):ts.StringLiteralLike[]|null=>ts.isStringLiteralLike(node)?[node]:ts.isParenthesizedExpression(node)?leaves(node.expression):ts.isConditionalExpression(node)?(()=>{const a=leaves(node.whenTrue),b=leaves(node.whenFalse);return a&&b?[...a,...b]:null})():null;
 const mark=(node:ts.Node)=>{
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(node.left)&&['textContent','innerText'].includes(node.left.name.text)){
   const literals=leaves(node.right);
   if(literals&&literals.some(n=>new RegExp(pictograms.source,'u').test(n.text)||/^\s*\+\s*$/.test(n.text))){
    edits.push({start:node.left.name.getStart(file),end:node.left.name.end,text:'innerHTML'});literals.forEach(n=>safe.add(n));
   }
  }ts.forEachChild(node,mark);
 };mark(file);
 const visit=(node:ts.Node)=>{
  if(ts.isStringLiteralLike(node)){
   let updated:string|undefined;
   if(safe.has(node))updated=replaceText(node.text,node.parent.getText(file),count,true);
   else if(/<[a-z][\s\S]*>/i.test(node.text))updated=migrateHtml(node.text,{fragment:true,script:false,addStyle:false,preserveMultiplication:true}).html;
   if(updated!==undefined&&updated!==node.text){if(!safe.has(node))count();edits.push({start:node.getStart(file),end:node.end,text:JSON.stringify(updated)});}
  }else if([ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail].includes(node.kind)){
   const part=node as ts.TemplateLiteralLikeNode;
   if(new RegExp(pictograms.source,'u').test(part.text)){
    const updated=migrateHtml(part.text,{fragment:true,script:false,addStyle:false,preserveMultiplication:true}).html;
    if(updated!==part.text){const escaped=updated.replaceAll('\\','\\\\').replaceAll('`','\\`').replaceAll('${','\\${');edits.push({start:node.getStart(file),end:node.end,text:(node.kind===ts.SyntaxKind.TemplateHead?'`':'}')+escaped+(node.kind===ts.SyntaxKind.TemplateTail?'`':'${')});count();}
   }
  }ts.forEachChild(node,visit);
 };visit(file);
 const result=apply(code,edits);
 const parsed=ts.createSourceFile('updated.js',result,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 if((parsed as any).parseDiagnostics.length>(file as any).parseDiagnostics.length)throw Error('Icon migration introduced a script syntax error');
 return result;
}
export function migrateHtml(html:string,options:{fragment?:boolean;script?:boolean;addStyle?:boolean;preserveMultiplication?:boolean}={}):MigrationReport {
 const report={html,icons:0,cssIcons:0,scriptIcons:0,labels:0,preserved:0};
 // This legacy caption mixes attr() text with an arrow. A mask would erase the
 // person's name, and a data-URL image cannot inherit the caption's ink color.
 // Materialize the same caption as real HTML so both text and SVG inherit it.
 if(/content\s*:\s*'Meet '\s*\+\s*attr\(data-first\)\s*\+\s*' ↗'/.test(html)){
  const tree=parse(html,{sourceCodeLocationInfo:true}),captions:Edit[]=[];
  const visit=(node:any)=>{
   const attributes=attrs(node);
   if(attributes.class?.split(/\s+/).includes('portrait-btn')&&attributes['data-first']&&node.sourceCodeLocation?.endTag){
    const at=node.sourceCodeLocation.endTag.startOffset;
    captions.push({start:at,end:at,text:`<span class="vitris-portrait-caption">Meet ${escapeHtml(attributes['data-first'])} ${icon('↗','portrait')!}</span>`});report.icons++;
   }
   for(const child of node.childNodes??[])visit(child);
  };visit(tree);
  html=apply(html,captions).replace(/content\s*:\s*'Meet '\s*\+\s*attr\(data-first\)\s*\+\s*' ↗'\s*;?/g,'').replace(/(\.portrait-btn(?::hover|:focus-visible)?):{1,2}after/g,'$1>.vitris-portrait-caption');
 }
 const tree=options.fragment?parseFragment(html,{sourceCodeLocationInfo:true}):parse(html,{sourceCodeLocationInfo:true});
 const edits:Edit[]=[],labelled=new Set<any>();
 const walk=(node:any,ancestors:any[])=>{
  const parent=ancestors.at(-1),location=node.sourceCodeLocation;
  if(node.nodeName==='#text'&&location){
   let value:string|undefined;
   if(parent?.tagName==='style')value=migrateCss(node.value,()=>report.cssIcons++);
   else if(parent?.tagName==='script'&&options.script!==false&&!/json/i.test(attrs(parent).type??''))value=migrateScript(node.value,()=>report.scriptIcons++);
   else if(!['script','style','textarea','pre','code','kbd','title','option'].includes(parent?.tagName)){
    const context=ancestors.slice(-4).map(n=>n.tagName+' '+JSON.stringify(attrs(n))).join(' ')+' '+node.value;
    if(!ancestors.some(n=>['svg','textarea','pre','code','kbd','title'].includes(n.tagName))){
     const before=report.icons;value=replaceText(node.value,context,()=>report.icons++,/^\s*\+\s*$/.test(node.value),options.preserveMultiplication&&!ancestors.some(n=>n.tagName==='button'));
     if(before===report.icons)value=undefined;
     else{
      const control=[...ancestors].reverse().find(n=>['button','a','summary'].includes(n.tagName)),attributes=attrs(control);
      const remaining=control?textOf(control).replace(new RegExp(pictograms.source,'gu'),'').replace(/[+\-\s\uFE0F]/g,''):'';
      if(control&&!remaining&&!attributes['aria-label']&&!attributes['aria-labelledby']&&!attributes.title&&!labelled.has(control)&&control.sourceCodeLocation?.startTag){
       const ch=[...node.value.trim()][0]!,name=names[ch]??'plus';const label=attributes.href?.startsWith('tel:')?'Call':attributes.href?.startsWith('mailto:')?'Email':({close:'Close',menu:'Menu',search:'Search',play:'Play',pause:'Pause','arrow-right':'Next','arrow-left':'Previous','arrow-up':'Back to top','external-link':'Expand view',plus:'Expand',minus:'Collapse',sun:'Change theme',moon:'Change theme'} as Record<string,string>)[name]??name.replaceAll('-',' ');
       edits.push({start:control.sourceCodeLocation.startTag.endOffset-1,end:control.sourceCodeLocation.startTag.endOffset-1,text:` aria-label="${escapeHtml(label)}"`});labelled.add(control);report.labels++;
      }
     }
    }
   }
   if(value!==undefined&&value!==node.value)edits.push({start:location.startOffset,end:location.endOffset,text:value});
  }
  for(const child of node.childNodes??[])walk(child,[...ancestors,node]);if(node.content)walk(node.content,[...ancestors,node]);
 };walk(tree,[]);
 report.html=apply(html,edits);
 if(options.addStyle!==false&&(report.icons||report.cssIcons||report.scriptIcons)&&!html.includes('data-vitris-template-icons')){
  const css=`<style data-vitris-template-icons="5">${style}</style>`;report.html=report.html.includes('</head>')?report.html.replace('</head>',css+'</head>'):css+report.html;
 }
 report.preserved=[...report.html.matchAll(pictograms)].length;
 return report;
}
