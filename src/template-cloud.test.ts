import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from './template-cloud/worker.ts';
import {renderCloudPage,brandVars,type CloudManifest} from './template-cloud/render.ts';
import {CLOUD_CATALOG} from './agent/theme-cloud.ts';
import {hostedTemplateContract} from './test/hosted-template-contract.ts';
import {previewResource,displaySite} from './agent/theme-preview.ts';
for(const e of CLOUD_CATALOG.entries)hostedTemplateContract(e.theme.id);
test('hosted comparison aliases retain the authored EV and deep-cleaning pages',()=>{
 for(const [id,page] of [['electrical-current-and-craft','ev'],['cleaning-clearline','deep-cleaning']]){const e=CLOUD_CATALOG.entries.find(e=>e.theme.id===id)!;const site={root:process.cwd(),brand:{schemaVersion:1 as const,siteId:'alias-test',name:'Display',colors:[{value:'#2a5570',source:'test',confidence:'explicit' as const}],fallback:false}};const r=previewResource(displaySite(site,e.theme,'original'),e.theme,'guide','desktop');assert.ok(new URL(r.url).pathname.includes('/'+page+'/desktop/'));}
});
test('hosted branding escapes names, preserves context and bridges the preview',()=>{
 const e=CLOUD_CATALOG.entries[0]!,m:CloudManifest={version:1,id:e.theme.id,release:e.theme.release,revision:e.revision,name:e.theme.name,business:e.business,pages:e.pages,tokens:e.theme.tokens as unknown as Record<string,string>};
 const page=m.pages[0]!,recipe={original:'<html><head></head><body><h1>Original</h1></body></html>',brand:`<html><head></head><body>__VITRIS_LOGO__<h1>__VITRIS_BRAND_NAME__</h1><style>body{__VITRIS_CSS_VARS__}</style><a href="__VITRIS_PAGE_${page.pageId}__?zip=10001&amp;service=deep">Next</a></body></html>`};
 const result=renderCloudPage(recipe,m,{name:'<script>bad</script>',colors:['#ffff00']},'https://templates.example/demo','a'.repeat(64));assert.doesNotMatch(result,/<script>bad/);assert.match(result,/&lt;script&gt;bad/);assert.match(result,/zip=10001&amp;service=deep&amp;b=/);assert.match(result,/vitris-specimen-v1/);assert.doesNotMatch(result,/__VITRIS_/);assert.match(brandVars(m.tokens,['#ffff00']),/--brand-original:#ffff00/);
});
test('template Worker rejects writes, unknown routes and public source archives',async()=>{
 const env={R2:{get:async()=>null}} as any;for(const [method,path,status] of [['POST','/templates/catalog.json',405],['GET','/templates/demo/not-a-hash/id/',404],['GET','/templates/archives/'+ 'a'.repeat(64)+'/archive.part',404],['GET','/templates/assets/'+ 'a'.repeat(64)+'/missing.webp',404]] as const){const r=await worker.fetch(new Request('https://templates.example'+path,{method}),env);assert.equal(r.status,status);}
});
test('template documents permit same-origin route transitions while keeping forms disabled',async()=>{
 const revision='a'.repeat(64),page={pageId:'home',path:'/',label:'Home',role:'home',group:'Explore',featured:true,compareRole:'home',previewPriority:0,recipe:'b'.repeat(64)};
 const manifest={id:'transition-demo',revision,business:'Demo',tokens:CLOUD_CATALOG.entries[0]!.theme.tokens,pages:[page]};
 const recipe={original:'<html><body><h1>Demo</h1><a href="__VITRIS_RETURN__">Library</a></body></html>',brand:''};
 const env={R2:{get:async(key:string)=>({json:async()=>key.startsWith('templates/manifests/')?manifest:recipe})}} as any;
 const response=await worker.fetch(new Request(`https://templates.example/templates/demo/${revision}/transition-demo/`),env);
 assert.equal(response.status,200);const csp=response.headers.get('content-security-policy')!;
 assert.match(csp,/connect-src 'self'/);assert.match(csp,/form-action 'none'/);assert.match(csp,/default-src 'none'/);
 assert.match(await response.text(),/http:\/\/127\.0\.0\.1:4390\//);
});
