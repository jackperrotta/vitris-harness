import {parse} from 'parse5';
const attr=(n:any,key:string)=>n.attrs?.find((a:any)=>a.name===key)?.value;
const nodes=(n:any):any[]=>[n,...(n.childNodes||[]).flatMap(nodes)];
const controls=(n:any)=>nodes(n).filter(n=>['input','textarea','select','button','form','iframe','object','embed','canvas'].includes(n.tagName)||(n.tagName==='a'&&/^javascript:/i.test(attr(n,'href')||'')));
const fields=(n:any)=>nodes(n).filter(n=>['input','textarea','select'].includes(n.tagName)).map(n=>[n.tagName,attr(n,'type')||'text',attr(n,'name')||'',attr(n,'id')||''].join('|')).sort().join('\n');

/** Inspect each original block. Opt-in disabled transactions never enables delivery. */
export function reactCapabilities(state:any,original:string,authored:string,path:string,disabledTransactions:boolean):Set<string> {
 const originalNodes=nodes(parse(original)),authoredNodes=nodes(parse(authored));
 const blocks=(state?.pages?.[path==='/'?state.site?.homePageUrl:path.slice(1)]?.rows||[]).flatMap((r:any)=>r.blocks||[]);
 const result=new Set<string>();
 for(const kind of ['b','coll','cform','s']){
  const matches=blocks.filter((b:any)=>b.bt===kind);
  if(!matches.length)continue;
  const supported=matches.every((block:any)=>{
   const source=originalNodes.find(n=>attr(n,'id')===block._id),copy=authoredNodes.find(n=>attr(n,'id')===block._id);
   if(!source||!copy)return false;
   if(['b','coll'].includes(kind))return controls(source).length===0;
   if(!disabledTransactions)return false;
   if(kind==='cform'){
    const forms=nodes(source).filter(n=>n.tagName==='form'),copies=nodes(copy).filter(n=>n.tagName==='form');
    if(forms.length!==1||copies.length!==1||fields(forms[0])!==fields(copies[0]))return false;
    const submits=nodes(forms[0]).filter(n=>n.tagName==='a'&&/^javascript:/i.test(attr(n,'href')||''));
    return submits.length===1&&nodes(submits[0]).filter(n=>n.nodeName==='#text').map(n=>n.value).join('').trim()==='Submit'&&
     !controls(source).some(n=>['button','iframe','object','embed','canvas'].includes(n.tagName))&&
     attr(copies[0],'data-preserve-disabled-custom-form')!==undefined&&attr(copies[0],'data-preserve-forms')==='preview'&&attr(copies[0],'action')==='#';
   }
   const calendars=nodes(source).filter(n=>attr(n,'id')==='select-time-parent-container');
   if(calendars.length===0){
    const links=nodes(source).filter(n=>n.tagName==='a'),buttonText=block.c?.service?.btn?.txt;
    return !!buttonText&&links.length>0&&controls(source).every(n=>links.includes(n))&&block.c?.d?.search===false&&
     links.every(n=>/^javascript:/i.test(attr(n,'href')||'')&&nodes(n).filter(n=>n.nodeName==='#text').map(n=>n.value).join('').trim()===buttonText)&&
     attr(copy,'data-preserve-disabled-booking')!==undefined&&nodes(copy).filter(n=>attr(n,'data-preserve-disabled-action')==='booking').length===links.length;
   }
   return calendars.length===1&&attr(copy,'data-preserve-disabled-booking')!==undefined&&controls(source).length===0&&
    nodes(copy).some(n=>attr(n,'id')==='days-container')&&
    nodes(copy).filter(n=>attr(n,'data-preserve-disabled-action')==='booking').length===nodes(source).filter(n=>n.tagName==='a'||(attr(n,'class')||'').split(/\s+/).includes('day-col')).length;
  });
  if(supported)result.add(kind);
 }
 return result;
}
