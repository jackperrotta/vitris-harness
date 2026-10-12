import {parse} from 'parse5';

/** Only existing public, read-only provider embeds; never booking or form apps. */
export function approvedEmbedUrl(raw:string):string|undefined {
  let url: URL;
  try { url = new URL(raw,raw.startsWith('//')?'https://preserve.invalid/':undefined); } catch { return; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return;
  // Preserve opaque Maps query bytes, including malformed legacy suffixes.
  // The parsed HTTPS origin and read-only path, rather than query contents,
  // confine this exception. The provider still must pass browser verification.
  if (url.hostname === 'www.google.com' && (url.pathname === '/maps/embed' || /^\/maps\/embed\/v1\/(place|view|directions|streetview|search)$/.test(url.pathname))) return url.href;
  if (['www.google.com','maps.google.com'].includes(url.hostname) && url.pathname==='/maps' && url.searchParams.get('output')==='embed')return url.href;
  if (['www.youtube.com','www.youtube-nocookie.com'].includes(url.hostname) && /^\/embed\/[a-zA-Z0-9_-]{11}$/.test(url.pathname)) return url.href;
  if(url.hostname==='www.massagebook.com'&&/^\/therapists\/[a-z0-9-]+\/widget\/reviews$/.test(url.pathname)&&!url.search)return url.href;
}
export function readOnlyEmbedProvider(raw: string): 'google-maps' | 'youtube' | 'massagebook-reviews' | undefined {
  const approved=approvedEmbedUrl(raw);if(!approved)return;
  const host=new URL(approved).hostname;
  return host.includes('youtube')?'youtube':host==='www.massagebook.com'?'massagebook-reviews':'google-maps';
}

export function providerConsoleWarning(text:string,location:string,approved:Set<string>):boolean {
  if(!/^Permissions policy violation: compute-pressure is not allowed in this document\.?$/.test(text))return false;
  let url:URL;try{url=new URL(location);}catch{return false;}
  return ['www.youtube.com','www.youtube-nocookie.com'].includes(url.hostname) && url.pathname.startsWith('/s/player/') && [...approved].some(src=>readOnlyEmbedProvider(src)==='youtube');
}

/** A cancelled conversion beacon is not a failed review asset or booking request. */
export function cancelledReviewTelemetry(request:{url():string;frame():any},error:string|undefined,approved:Set<string>):boolean{
 if(error!=='net::ERR_ABORTED')return false;
 let url:URL;try{url=new URL(request.url());}catch{return false;}
 if(url.origin!=='https://www.google.com'||url.pathname!=='/measurement/conversion')return false;
 try{let frame=request.frame();for(let depth=0;frame&&depth<8;depth++,frame=frame.parentFrame())if(frame.parentFrame()&&approved.has(frame.url())&&readOnlyEmbedProvider(frame.url())==='massagebook-reviews')return true;}catch{}
 return false;
}

export function iframeSources(html: string): string[] {
  const sources: string[] = [];
  const visit = (node: any) => {
    if (node.tagName === 'iframe' && !node.attrs.some((a:any)=>a.name==='srcdoc')) {
      const src = node.attrs.find((a:any)=>a.name==='src')?.value;
      if (src) sources.push(src);
    }
    for (const child of node.childNodes || []) visit(child);
  };
  visit(parse(html));
  return sources;
}

/** Child provider resources remain remote; main-page dependencies stay local. */
export function isReadOnlyEmbedRequest(request: {url():string;frame():any}, approved: Set<string>): boolean {
  if (approved.has(request.url()) && readOnlyEmbedProvider(request.url())) return true;
  try {
    let frame = request.frame();
    for (let depth=0; frame && depth<8; depth++,frame=frame.parentFrame()) {
      if (frame.parentFrame() && approved.has(frame.url()) && readOnlyEmbedProvider(frame.url())) return true;
    }
  } catch { /* Requests without a frame never receive an embed exception. */ }
  return false;
}
