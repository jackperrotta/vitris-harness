import {renderCloudPage,type CloudRecipe,type CloudManifest,type DisplayBrand} from './render.ts';
type Env={R2:R2Bucket};
const failure=(status:number,message:string)=>new Response(message,{status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}});
async function object(env:Env,key:string){return env.R2.get(key);}
function displayBrand(url:URL,manifest:CloudManifest):DisplayBrand{
 const encoded=url.searchParams.get('b');if(!encoded)return {name:manifest.business,colors:[manifest.tokens.colorAccent!],original:true};
 if(encoded.length>100000)throw Error('Brand payload too large');
 const b=JSON.parse(decodeURIComponent(escape(atob(encoded)))) as DisplayBrand;
 if(typeof b.name!=='string'||b.name.length>500||!Array.isArray(b.colors)||b.colors.length>12||b.colors.some(c=>!/^#[a-f0-9]{6}$/.test(c))||b.logo&&!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(b.logo))throw Error('Invalid display brand');
 return {name:b.name,colors:b.colors,...(b.logo?{logo:b.logo}:{}),original:!!b.original};
}
export default {async fetch(request:Request,env:Env):Promise<Response>{
 try{
  const url=new URL(request.url),path=url.pathname;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET, HEAD, OPTIONS'}});
  if(!['GET','HEAD'].includes(request.method))return failure(405,'Read-only template library');
  if(path==='/templates/catalog.json'){
   const found=await object(env,'templates/catalog.json');if(!found)return failure(404,'Catalog not published');
   return new Response(request.method==='HEAD'?null:found.body,{headers:{'content-type':'application/json','cache-control':'no-cache','access-control-allow-origin':'*','x-content-type-options':'nosniff'}});
  }
  if(/^\/templates\/(assets|objects)\/[a-f0-9]{64}\/[a-zA-Z0-9._/-]+$/.test(path)&&!path.includes('..')){
   const found=await object(env,path.slice(1));if(!found)return failure(404,'Unknown template object');
   const headers=new Headers();found.writeHttpMetadata(headers);headers.set('etag',found.httpEtag);headers.set('cache-control','public, max-age=31536000, immutable');headers.set('access-control-allow-origin','*');headers.set('x-content-type-options','nosniff');
   if(request.headers.get('if-none-match')===found.httpEtag)return new Response(null,{status:304,headers});
   return new Response(request.method==='HEAD'?null:found.body,{headers});
  }
  const match=path.match(/^\/templates\/(demo|preview)\/([a-f0-9]{64})\/([a-z0-9-]+)(\/.*)?$/);if(!match)return failure(404,'Unknown template route');
  const [,mode,revision,id,tail='/']=match;
  const stored=await object(env,`templates/manifests/${revision}.json`);if(!stored)return failure(404,'Unknown template revision');
  const manifest=await stored.json<CloudManifest>();if(manifest.id!==id||manifest.revision!==revision)return failure(404,'Template identity mismatch');
  const preview=mode==='preview',segments=tail.split('/').filter(Boolean),identity=preview?segments[2]:undefined;
  if(preview&&(!/^[a-f0-9]{64}$/.test(identity||'')||!['desktop','mobile'].includes(segments[1]||'')||segments.length!==3))return failure(404,'Unknown preview identity');
  const page=manifest.pages.find(p=>preview?p.pageId===segments[0]:p.path===tail);if(!page)return failure(404,'Unknown template page');
  const recipeObject=await object(env,`templates/objects/${page.recipe}/recipe.json`);if(!recipeObject)return failure(503,'Template page unavailable');
  const html=renderCloudPage(await recipeObject.json<CloudRecipe>(),manifest,displayBrand(url,manifest),url.origin+`/templates/demo/${revision}/${id}`,identity);
  const headers={'content-type':'text/html; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer','x-template-revision':revision!,'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors * file:"};
  return new Response(request.method==='HEAD'?null:html,{headers});
 }catch{return failure(400,'Invalid template request');}
}} satisfies ExportedHandler<Env>;
