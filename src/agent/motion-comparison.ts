import { parse, serialize } from 'parse5';
/** Remove only author motion bindings and generated nonvisual section metadata; preserve all content/layout attributes. */
export function canonicalMotionBody(html:string):string {
  const doc:any=parse(html);
  function walk(node:any){
    if(node.childNodes)node.childNodes=node.childNodes.filter((n:any)=>n.tagName!=='script');
    if(node.attrs)node.attrs=node.attrs.filter((a:any)=>!a.name.startsWith('data-motion')&&!a.name.startsWith('data-reveal')&&!(['id','data-section'].includes(a.name)&&/^[a-z]+-(?:home|interior)-motion-\d+$/.test(a.value)));
    for(const child of node.childNodes||[])walk(child);
  }walk(doc);return serialize(doc).replace(/\s+/g,' ');
}
