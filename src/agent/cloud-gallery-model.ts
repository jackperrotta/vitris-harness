/** Metadata-only adapter, serialized into the standalone Cloudflare gallery. */
export async function cloudGalleryModel(catalog:any,brand:any) {
 const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 const hash=async(v:any)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(v))))),b=>b.toString(16).padStart(2,'0')).join('');
 const origin='https://vitris-templates.jack-896.workers.dev';
 if(catalog.version!==1||catalog.origin!==origin||!Array.isArray(catalog.entries))throw Error('Invalid Cloudflare template catalog');
 const ids=new Set();
 const themes=await Promise.all(catalog.entries.map(async(e:any)=>{
  const t=e.theme;
  if(!t||!/^[a-z0-9-]+$/.test(t.id)||ids.has(t.id)||!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(t.release)||!/^[a-f0-9]{64}$/.test(e.revision)||e.base!==origin||!Array.isArray(e.pages)||!e.pages.length||!e.browse)throw Error('Invalid hosted template metadata');
  ids.add(t.id);
  const pages=e.pages.map(({recipe:_,...p}:any)=>p);
  if(pages.some((p:any)=>!/^[a-z0-9-]+$/.test(p.pageId)||!/^\/(?:[a-z0-9-]+\/?)*$/.test(p.path)))throw Error('Invalid hosted page manifest');
  const resolvePage=(key:string)=>pages.find((p:any)=>p.pageId===key)||pages.find((p:any)=>key==='story'?p.compareRole==='home':key==='guide'?p.pageId===(t.id==='electrical-current-and-craft'?'ev':t.id==='cleaning-clearline'?'deep-cleaning':'service-detail'):false)||pages.find((p:any)=>key==='guide'&&p.compareRole==='detail'&&p.featured)||pages.find((p:any)=>key==='guide'&&p.compareRole==='detail');
  const keys=[...new Set<string>([...pages.map((p:any)=>p.pageId),'story','guide'])],resources:any={brand:{},original:{}};
  await Promise.all(['brand','original'].map(async mode=>{
   const shown=mode==='original'?{...brand,name:e.business,colors:[{value:t.tokens.colorAccent,source:'authored specimen palette',confidence:'explicit'}],fallback:false}:brand;
   const brandHash=await hash(shown),query=mode==='original'?'':'?'+new URLSearchParams({b:btoa(unescape(encodeURIComponent(JSON.stringify({name:brand.name,colors:brand.colors.map((c:any)=>c.value)}))))});
   await Promise.all(keys.map(async key=>{
    const p=resolvePage(key);if(!p)return;
    resources[mode][key]=Object.fromEntries(await Promise.all(['desktop','mobile'].map(async viewport=>{
     const id=await hash([e.revision,t.id,p.pageId,brandHash,viewport]),thumbnail=e.thumbnails?.[p.pageId]?.[viewport];
     return [viewport,{id,url:origin+`/templates/preview/${e.revision}/${t.id}/${p.pageId}/${viewport}/${id}`+query,full:origin+`/templates/demo/${e.revision}/${t.id}`+p.path+query,thumbnail:mode==='original'&&typeof thumbnail==='string'&&thumbnail.startsWith(origin+'/templates/objects/')?thumbnail:null}];
    })));
   }));
  }));
  return {id:t.id,name:t.name,release:t.release,hash:await hash(t),business:e.business,audience:e.audience||'',pageCount:pages.length,pages,description:t.description,keep:t.semantic?.surfaceIntent||t.principles[0],principles:t.principles,image:t.image,freedoms:t.freedoms,browse:e.browse,resources};
 }));
 return {brand,brandHash:await hash(brand),logo:null,test:true,current:null,previousSelectionHash:null,themes,archiveThemes:[]};
}

export function cloudGalleryVocabulary(catalog:any) {
 const entries=catalog.entries;
 return {families:Object.fromEntries(entries.map((e:any)=>[e.browse.family,''])),identities:[...new Set(entries.flatMap((e:any)=>e.browse.identities))],collections:['All directions',...new Set(entries.flatMap((e:any)=>e.browse.collections))],industries:[...new Set(entries.flatMap((e:any)=>e.browse.industries||(e.industry?[e.industry]:[])))],samples:{}};
}
