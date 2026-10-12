import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudEntry} from '../agent/theme-cloud.ts';
import {themeHash,visualTheme} from '../agent/theme-library.ts';
import {manifestPages,previewResource,fullSiteLinks,displaySite} from '../agent/theme-preview.ts';
import {browseMetadata} from '../agent/theme-browse.ts';
import {validateManifest} from '../agent/theme-page-manifest.ts';
export function hostedTemplateContract(id:string){test(id+' retains its identity and gallery controls without local demo content',()=>{
 const e=cloudEntry(id)!;assert.ok(e);assert.equal(themeHash(visualTheme(id)),e.sourceHash);assert.deepEqual(browseMetadata(id),e.browse);validateManifest(id,manifestPages(e.theme));
 const site={root:process.cwd(),test:true,brand:{schemaVersion:1 as const,siteId:'cloud-contract',name:'Customer & Studio',colors:[{value:'#2a5570',source:'test',confidence:'explicit' as const}],fallback:false}};
 const page=e.pages[0]!,a=previewResource(site,e.theme,page.pageId,'desktop'),b=previewResource(site,e.theme,page.pageId,'mobile'),o=previewResource(displaySite(site,e.theme,'original'),e.theme,page.pageId,'desktop');
 assert.equal(a.html,'');assert.ok(a.url.startsWith(e.base+'/templates/preview/'));assert.equal(new Set([a.id,b.id,o.id]).size,3);assert.ok(new URL(a.url).searchParams.has('b'));assert.equal(new URL(o.url).searchParams.has('b'),false);
 const links=fullSiteLinks(site,e.theme);assert.equal(Object.keys(links).length,e.pages.length);for(const p of e.pages)assert.equal(new URL(links[p.pageId]!).pathname,e.base.replace(/^https:\/\/[^/]+/,'')+`/templates/demo/${e.revision}/${id}`+p.path);
});}
