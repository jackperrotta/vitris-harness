import {parse} from 'parse5';
import {approvedEmbedUrl} from './embeds.ts';
const attr=(n:any,key:string)=>n.attrs?.find((a:any)=>a.name===key)?.value;
const children=(n:any):any[]=>n.childNodes||[];
const nodes=(n:any):any[]=>[n,...children(n).flatMap(nodes)];

export function isInertFrame(node:any):boolean {
  return node.tagName==='iframe' && attr(node,'srcdoc')===undefined && (!attr(node,'src') || attr(node,'src')==='about:blank') && !attr(node,'data-src');
}
/** Static legacy feeds contain real links, not search/pagination callbacks. */
export function supportsStaticLegacyComponent(node:any):boolean {
  const kind=attr(node,'uniquecomponent');
  if(!['blog-1','iframe-1','maps-1','accordion-1'].includes(kind))return false;
  if(['iframe-1','maps-1'].includes(kind) && !nodes(node).some(n=>n.tagName==='iframe'))return false;
  if(kind==='accordion-1' && !nodes(node).some(n=>attr(n,'data-toggle')==='collapse'))return false;
  const visit=(n:any,hidden=false):boolean=>{
    const cls=attr(n,'class')||'';
    hidden ||= (/\bd-none\b/.test(cls)&&!/\bd-(?:sm|md|lg|xl)-(?:block|flex|inline|table|grid)/.test(cls)) || /display\s*:\s*none/i.test(attr(n,'style')||'');
    if(n.tagName==='script' && attr(n,'type')!=='application/ld+json')return false;
    if(n.tagName==='iframe' && !isInertFrame(n) && !(attr(n,'srcdoc')===undefined && approvedEmbedUrl(attr(n,'src')||'')))return false;
    if(['object','embed','canvas'].includes(n.tagName))return false;
    if(!hidden){
      if(['input','select','textarea','form'].includes(n.tagName))return false;
      const handled=['collapse','modal'].includes(attr(n,'data-toggle')) || attr(n,'data-dismiss')==='modal';
      const callback=n.tagName==='button' || attr(n,'role')==='button' || (n.tagName==='a'&&(/^(javascript:)/i.test(attr(n,'href')||'')||(!attr(n,'href')&&/\b(btn|page-link)\b/.test(cls))));
      if(callback&&!handled)return false;
    }
    return children(n).every(c=>visit(c,hidden));
  };
  return visit(node);
}

export function staticLegacyComponents(html:string):Set<string> {
  const all=nodes(parse(html));
  return new Set(['blog-1','iframe-1','maps-1','accordion-1'].filter(kind=>{
    const matches=all.filter(n=>attr(n,'uniquecomponent')===kind);
    return matches.length>0&&matches.every(supportsStaticLegacyComponent);
  }));
}

/** Repair only two malformed external-link syntaxes, preserving their destinations. */
export function repairedExternalNavigation(original:string,authored:string,sourceUrl:string):Set<string> {
 const source=nodes(parse(original)).filter(n=>n.tagName==='a'),copy=nodes(parse(authored)).filter(n=>n.tagName==='a'),result=new Set<string>();
 for(const n of source){const href=attr(n,'href')||'';let expected:string|undefined;
  if(/^\/?www\.google\.com\/maps(?:\?|$)/.test(href))expected='https://'+href.replace(/^\//,'');
  if(/^\/?\(?\d{3}\)?(?:%20|\s)+\d{3}-\d{4}$/.test(href))expected='tel:'+decodeURIComponent(href).replace(/\D/g,'');
  if(!expected)continue;
  const path=new URL(href,sourceUrl).pathname;
  if(copy.some(n=>{const marker=attr(n,'data-preserve-repaired-link');return marker!==undefined&&new URL(marker,sourceUrl).pathname===path&&attr(n,'href')===expected;})&&!copy.some(n=>{try{const url=new URL(attr(n,'href')||'',sourceUrl);return url.origin===new URL(sourceUrl).origin&&url.pathname===path;}catch{return false;}}))result.add(path);
 }
 return result;
}

/** V1 service lists can page captured cards locally while booking stays disabled. */
export function disabledLegacyServices(original:string,authored:string,authorized:boolean):boolean {
 if(!authorized)return false;
 const source=nodes(parse(original)).filter(n=>attr(n,'uniquecomponent')==='service-1'),copies=nodes(parse(authored)).filter(n=>attr(n,'uniquecomponent')==='service-1');
 if(!source.length||source.length!==copies.length)return false;
 return source.every((s,i)=>{
  const copy=copies[i];if(attr(copy,'data-preserve-disabled-booking')===undefined||!nodes(copy).some(n=>attr(n,'data-preserve-service-grid')!==undefined))return false;
  let cards:any[];try{cards=JSON.parse(attr(copy,'data-preserve-service-cards')||'');}catch{return false;}
  const initial=nodes(s).filter(n=>/^service-\d+$/.test(attr(n,'data-vitrisid')||''));
  if(!initial.length||!Array.isArray(cards)||initial.some(n=>!cards.some(c=>typeof c==='string'&&c.includes(`data-vitrisid="${attr(n,'data-vitrisid')}"`))))return false;
  return nodes(s).every(n=>{
   if(['script','iframe','object','embed','canvas','form','button','textarea'].includes(n.tagName))return false;
   if(['select','input'].includes(n.tagName))return ['servicesPerPage','servicesSearch'].includes(attr(n,'data-vitrisid')||'');
   if(n.tagName==='a'&&/^javascript:/i.test(attr(n,'href')||''))return nodes(n).filter(n=>n.nodeName==='#text').map(n=>n.value).join('').trim()==='1-on-1 Services';
   if(attr(n,'data-toggle'))return attr(n,'data-toggle')==='modal'&&/^#vitrisScheduleModal/.test(attr(n,'data-target')||'');
   return true;
  });
 });
}

/** Removing an application script is a functional limitation, even if pixels match. */
export function unsupportedApplicationScripts(html:string,sourceUrl:string):string[] {
  const origin=new URL(sourceUrl).origin;
  return [...new Set(nodes(parse(html)).filter(n=>n.tagName==='script'&&attr(n,'src')).map(n=>{
    const url=new URL(attr(n,'src'),sourceUrl);
    if(url.hostname==='analytics.tryvitris.com'||/(^|\.)google-analytics\.com$/.test(url.hostname)||url.hostname==='www.googletagmanager.com')return;
    if((/(^|\.)doubleclick\.net$/.test(url.hostname)||/(^|\.)googleadservices\.com$/.test(url.hostname))&&url.pathname.startsWith('/pagead/'))return;
    if(url.hostname==='www.gstatic.com'&&(url.pathname==='/wcm/loader.js'||url.pathname.startsWith('/call-tracking/')))return;
    if(url.hostname==='connect.facebook.net'&&(/^\/[\w-]+\/fbevents\.js$/.test(url.pathname)||/^\/signals\/config\/\d+$/.test(url.pathname)))return;
    if(url.hostname==='ajax.googleapis.com'&&url.pathname==='/ajax/libs/webfont/1/webfont.js')return;
    if(url.hostname==='cdn.vitris.io'&&url.pathname.startsWith('/renderer-dist/'))return;
    if(url.origin===origin&&/^\/(?:runtime|polyfills|scripts|main)(?:[-.][\w-]+)*\.js$/.test(url.pathname))return;
    return url.href;
  }).filter((url):url is string=>!!url))];
}
