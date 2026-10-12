import {parse} from 'parse5';
import type {PreserveManifest} from './config.ts';
const nodes=(n:any):any[]=>[n,...(n.childNodes||[]).flatMap(nodes)];
const attr=(n:any,key:string)=>n.attrs?.find((a:any)=>a.name===key)?.value;

/** Preserve proven source defects, never suppress newly introduced broken links/assets. */
export function originalMissingAnchors(original:string,sourceUrl:string,references:Map<string,string>):Set<string>{
 const result=new Set<string>(),origin=new URL(sourceUrl).origin;
 for(const n of nodes(parse(original)).filter(n=>n.tagName==='a'&&attr(n,'href'))){let url:URL;try{url=new URL(attr(n,'href'),sourceUrl);}catch{continue;}
  const target=references.get(url.pathname);if(url.origin!==origin||!url.hash||!target)continue;
  if(!nodes(parse(target)).some(n=>attr(n,'id')===decodeURIComponent(url.hash.slice(1))))result.add(url.pathname+url.hash);
 }
 return result;
}

export function originalNullImages(manifest:PreserveManifest,originals:string[],copies:string[]):Set<string>{
 const result=new Set<string>();
 for(const asset of manifest.assets){
  const nullImage=asset.captureError?.startsWith('Asset returned HTML:')&&new URL(asset.url).pathname==='/null';
  const errorIllustration=asset.url==='https://tryvitris.com/assets/img/404-error.jpg'&&asset.captureError?.endsWith('(404)')&&manifest.pages?.some(p=>p.sourceFailure);
  if(!nullImage&&!errorIllustration)continue;
  const sourceImages=originals.flatMap(h=>nodes(parse(h))).filter(n=>n.tagName==='img'&&attr(n,'src')&&new URL(attr(n,'src'),manifest.sourceUrl).href===asset.url);
  const authored=copies.flatMap(h=>nodes(parse(h))).filter(n=>attr(n,'src')==='/'+asset.file);
  if(sourceImages.length>0&&sourceImages.length===authored.length&&authored.every(n=>n.tagName==='img')&&!copies.some(h=>nodes(parse(h)).some(n=>attr(n,'href')==='/'+asset.file)))result.add(asset.url);
 }
 return result;
}
