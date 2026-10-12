import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSite} from './cli/site-create.ts';
import {capturePreservedSite,legacyReactState,legacyRoutes,isDownloadPath} from './preserve/capture.ts';
import {buildPreservedSite} from './preserve/build.ts';
import {verifyPreservedSite} from './preserve/verify.ts';
import {unresolvedCaptureBlockers} from './preserve/config.ts';
import {readOnlyEmbedProvider,iframeSources,isReadOnlyEmbedRequest,approvedEmbedUrl,providerConsoleWarning,cancelledReviewTelemetry} from './preserve/embeds.ts';
import {staticLegacyComponents,unsupportedApplicationScripts,repairedExternalNavigation,disabledLegacyServices} from './preserve/components.ts';
import {reactCapabilities} from './preserve/react-capabilities.ts';
import {preserveManifest} from './preserve/supplement.ts';

test('early screenshot-only captures remain verifiable without granting source-defect exceptions',{timeout:180000},async()=>{
 const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<html><body><v1-full-site-renderer><div id="fullSiteRenderer"><h1>Historical capture</h1></div></v1-full-site-renderer></body></html>');});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const root=mkdtempSync(join(tmpdir(),'preserve-old-reference-'));
 try{
  await createSite({dir:root,slug:'historical',mode:'preserve',from:`http://127.0.0.1:${(server.address() as any).port}/`});const capture=await capturePreservedSite(root);
  for(const p of capture.pages)unlinkSync(join(root,p.references[0]!.file.replace(/-\d+\.png$/,'-rendered.html')));
  await buildPreservedSite(root);const valid=await verifyPreservedSite(root);assert.equal(valid.ok,true,JSON.stringify(valid.failures));
  const file=join(root,'preserved/index.html');writeFileSync(file,readFileSync(file,'utf8').replace('</body>','<a href="/#absent">Broken authored link</a></body>'));await buildPreservedSite(root);const invalid=await verifyPreservedSite(root);assert.equal(invalid.ok,false);assert.ok(invalid.failures.some(f=>f.includes('Missing anchor: /#absent')));
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
import {originalMissingAnchors,originalNullImages} from './preserve/source-defects.ts';
import {createHash} from 'node:crypto';
import {preserveRuntime} from './preserve/runtime.ts';

test('newly paged service cards keep measured hover behavior and cannot start a booking',async()=>{
 const hover=JSON.stringify({color:'rgb(255, 255, 255)','background-color':'rgb(0, 0, 255)','border-color':'rgb(0, 0, 255)'}).replaceAll('"','&quot;');
 const card=(n:number)=>`<div class="card"><v-button data-toggle="modal" data-target="#vitrisScheduleModal1"><a class="btn" style="background-color:white;color:black;border:1px solid black" data-preserve-hover="${hover}">Service ${n}</a></v-button></div>`;
 const cards=[1,2,3,4].map(card),requests:string[]=[],body=`<html><head><style>.modal{display:none}</style></head><body><services-general uniquecomponent="service-1" data-preserve-disabled-booking data-preserve-service-cards="${JSON.stringify(cards).replaceAll('&','&amp;').replaceAll('"','&quot;')}"><div data-preserve-service-grid>${cards.slice(0,2).join('')}</div><select data-vitrisid="servicesPerPage"><option>2</option><option>30</option></select><div id="vitrisScheduleModal1" class="modal"><div class="modal-dialog"></div></div></services-general><script src="/runtime.js"></script></body></html>`;
 const server=createServer((req,res)=>{requests.push(req.method+' '+req.url);res.setHeader('content-type',req.url==='/runtime.js'?'application/javascript':'text/html');res.end(req.url==='/runtime.js'?preserveRuntime:body);});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const {chromium}=await import('playwright'),browser=await chromium.launch();
 try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${(server.address() as any).port}/`);await page.locator('select').selectOption('30');assert.equal(await page.locator('.card').count(),4);const button=page.locator('.btn').last(),before=await button.getAttribute('style');await button.hover();assert.equal(await button.evaluate((el:any)=>(globalThis as any).getComputedStyle(el).backgroundColor),'rgb(0, 0, 255)');await page.mouse.move(-10,-10);assert.equal(await button.getAttribute('style'),before);await button.click();await page.getByText('This preview cannot book appointments. Please use the listed contact details.',{exact:true}).waitFor();assert.ok(requests.every(r=>/^GET \/(?:runtime.js|favicon.ico)?$/.test(r)),requests.join('\n'));}
 finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});

test('review telemetry exception cannot hide review assets, service failures or top-level tracking',()=>{
 const source='https://www.massagebook.com/therapists/noonan-massage/widget/reviews',main={url:()=> 'https://preview.test/',parentFrame:()=>null},child={url:()=>source,parentFrame:()=>main},approved=new Set([source]),request={url:()=> 'https://www.google.com/measurement/conversion?en=session_start',frame:()=>child};
 assert.equal(cancelledReviewTelemetry(request,'net::ERR_ABORTED',approved),true);
 assert.equal(cancelledReviewTelemetry(request,'net::ERR_CONNECTION_REFUSED',approved),false);
 assert.equal(cancelledReviewTelemetry({...request,frame:()=>main},'net::ERR_ABORTED',approved),false);
 assert.equal(cancelledReviewTelemetry({...request,url:()=>source+'/assets.css'},'net::ERR_ABORTED',approved),false);
 assert.equal(cancelledReviewTelemetry(request,'net::ERR_ABORTED',new Set()),false);
});

test('supplemental source 404 pages retain hashed error evidence without replacing initial routes',async()=>{
 const server=createServer((req,res)=>{res.setHeader('content-type','text/html');if(req.url==='/gone'){res.statusCode=404;res.end('<html><body><h1>Missing original page</h1></body></html>');}else res.end('<html><body><v1-full-site-renderer><div id="fullSiteRenderer"><a href="/gone">Unavailable page</a></div></v1-full-site-renderer></body></html>');});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const root=mkdtempSync(join(tmpdir(),'preserve-errors-')),source=`http://127.0.0.1:${(server.address() as any).port}/`;
 try{
  await createSite({dir:root,slug:'errors',mode:'preserve',from:source});await capturePreservedSite(root,{diagnostic:true});const baseline=readFileSync(join(root,'onboarding/preserve.json'));
  const extra=join(root,'onboarding/extra');mkdirSync(extra);writeFileSync(join(extra,'launch.json'),JSON.stringify({mode:'preserve',sourceUrl:source}));
  const added=await capturePreservedSite(extra,{onlyPaths:['/gone'],includeSourceErrors:true,diagnostic:true});assert.deepEqual(added.pages.map(p=>p.path),['/gone']);const page=added.pages[0]!;
  mkdirSync(join(root,'preserved/gone'));copyFileSync(join(extra,'preserved',page.file),join(root,'preserved',page.file));
  const refs=page.references.map(r=>({...r,file:'onboarding/extra/'+r.file})),proof={...page.sourceFailure!,responseFile:'onboarding/extra/'+page.sourceFailure!.responseFile};
  writeFileSync(join(extra,'supplement.json'),JSON.stringify({sourceUrl:source,capturedAt:preserveManifest(root).capturedAt,pages:[{...page,references:refs,sourceFailure:proof}],assets:[]}));writeFileSync(join(root,'onboarding/preserve-supplements.json'),JSON.stringify({files:['onboarding/extra/supplement.json']}));
  await buildPreservedSite(root);const report=await verifyPreservedSite(root);assert.equal(report.ok,true,report.failures.join('\n'));assert.ok(report.warnings.some(w=>w.includes('/gone')&&w.includes('HTTP 200')));assert.equal(createHash('sha256').update(readFileSync(join(root,'onboarding/preserve.json'))).digest('hex'),createHash('sha256').update(baseline).digest('hex'));
  writeFileSync(join(root,proof.responseFile),'Changed evidence');await assert.rejects(()=>verifyPreservedSite(root),/response changed/);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('source defect evidence cannot suppress a newly broken anchor or an unavailable document',()=>{
 const refs=new Map([['/services','<section id="real">Existing section</section>']]);
 assert.deepEqual([...originalMissingAnchors('<a href="/services#old">Old</a><a href="/services#real">Real</a>','https://site.test/',refs)],['/services#old']);
 assert.equal(originalMissingAnchors('<a href="/services#real">Real</a>','https://site.test/',refs).has('/services#introduced'),false);
 const asset={url:'https://site.test/null',file:'missing.bin',captureError:'Asset returned HTML: https://site.test/null'};
 const manifest={sourceUrl:'https://site.test/',assets:[asset]} as any;
 assert.deepEqual([...originalNullImages(manifest,['<img src="null">'],['<img src="/missing.bin">'])],[asset.url]);
 assert.equal(originalNullImages(manifest,['<img src="null">'],['<img src="/missing.bin"><a href="/missing.bin">Download</a>']).size,0);
 assert.equal(originalNullImages({...manifest,assets:[{...asset,url:'https://site.test/brochure.pdf'}]},['<img src="brochure.pdf">'],['<img src="/missing.bin">']).size,0);
});

test('malformed external-link repairs require the original destination and an authored repair',()=>{
 const original='<a href="www.google.com/maps">Address</a><a href="(404) 610-8660">Phone</a>';
 const authored='<a href="https://www.google.com/maps" data-preserve-repaired-link="/www.google.com/maps">Address</a><a href="tel:4046108660" data-preserve-repaired-link="/(404)%20610-8660">Phone</a>';
 assert.deepEqual([...repairedExternalNavigation(original,authored,'https://site.test/')],['/www.google.com/maps','/(404)%20610-8660']);
 assert.equal(repairedExternalNavigation(original,authored.replace('tel:4046108660','tel:1234567890'),'https://site.test/').has('/(404)%20610-8660'),false);
 assert.equal(repairedExternalNavigation(original,authored+'<a href="/www.google.com/maps">Still broken</a>','https://site.test/').has('/www.google.com/maps'),false);
});

test('disabled v1 booking support is confined to captured service lists and explicit approval',()=>{
 const original='<services-general uniquecomponent="service-1"><service-selection><div><div class="card"><v-button data-toggle="modal" data-target="#vitrisScheduleModal1"><a data-vitrisid="service-100">Book</a></v-button></div></div><select data-vitrisid="servicesPerPage"><option>5</option></select></service-selection></services-general>';
 const cards=JSON.stringify(['<div class="card"><a data-vitrisid="service-100">Book</a></div>']).replaceAll('"','&quot;');
 const copy=original.replace('uniquecomponent="service-1"',`uniquecomponent="service-1" data-preserve-disabled-booking data-preserve-service-cards="${cards}"`).replace('<service-selection>','<service-selection><div data-preserve-service-grid></div>');
 assert.equal(disabledLegacyServices(original,copy,true),true);assert.equal(disabledLegacyServices(original,copy,false),false);
 assert.equal(disabledLegacyServices(original.replace('</service-selection>','<button>Unknown</button></service-selection>'),copy,true),false);
 assert.equal(disabledLegacyServices(original,copy.replace('service-100','service-999'),true),false);
});

test('React introductory-service picker can disable known booking buttons but cannot hide search controls',()=>{
 const state={site:{homePageUrl:'home'},pages:{home:{rows:[{blocks:[{bt:'s',_id:'picker',c:{d:{search:false},service:{btn:{txt:'Book Now'}}}}]}]}}};
 const original='<div id="picker"><p>Introductory Call</p><a href="javascript:;">Book Now</a></div>',copy='<div id="picker" data-preserve-disabled-booking><p>Introductory Call</p><a href="#" data-preserve-disabled-action="booking">Book Now</a></div>';
 assert.equal(reactCapabilities(state,original,copy,'/',true).has('s'),true);assert.equal(reactCapabilities(state,original,copy,'/',false).has('s'),false);
 assert.equal(reactCapabilities(state,original.replace('</div>','<input name="search"></div>'),copy,'/',true).has('s'),false);
 assert.equal(reactCapabilities(state,original,copy.replace('data-preserve-disabled-action','unadapted-action'),'/',true).has('s'),false);
});

test('read-only embed exceptions are confined to approved provider endpoints and descendant frames',()=>{
 const maps='https://www.google.com/maps/embed?pb=original';
 const video='https://www.youtube.com/embed/0zH6kB1MWJY';
 assert.equal(readOnlyEmbedProvider(maps),'google-maps');assert.equal(readOnlyEmbedProvider(video),'youtube');
 assert.equal(readOnlyEmbedProvider('https://www.massagebook.com/therapists/noonan-massage/widget/reviews'),'massagebook-reviews');
 for(const url of ['https://www.massagebook.com/therapists/noonan-massage/widget/book','https://www.massagebook.com/therapists/noonan-massage/widget/reviews?book=1','https://www.massagebook.com.evil.test/therapists/noonan-massage/widget/reviews'])assert.equal(readOnlyEmbedProvider(url),undefined);
 assert.equal(approvedEmbedUrl('//www.google.com/maps/embed?q=An Address'),'https://www.google.com/maps/embed?q=An%20Address');
 assert.equal(readOnlyEmbedProvider('https://www.google.com/maps/embed/v1/place?key=existing&q=Office'),'google-maps');
 assert.equal(approvedEmbedUrl(maps+' frameborder='),maps+'%20frameborder=');
 for(const url of ['https://www.google.com/forms/embed','https://www.google.com.evil.test/maps/embed','https://user@www.google.com/maps/embed','http://www.google.com/maps/embed','https://www.youtube.com/watch?v=0zH6kB1MWJY'])assert.equal(readOnlyEmbedProvider(url),undefined);
 assert.deepEqual(iframeSources(`<iframe src="${maps}&amp;x=1"></iframe><iframe srcdoc="x" src="${maps}"></iframe>`),[maps+'&x=1']);
 const main={url:()=> 'https://preview.test/',parentFrame:()=>null};const child={url:()=>maps,parentFrame:()=>main};
 const approved=new Set([maps]);
 assert.equal(isReadOnlyEmbedRequest({url:()=>maps,frame:()=>main},approved),true);
 assert.equal(isReadOnlyEmbedRequest({url:()=> 'https://maps.gstatic.com/tile.png',frame:()=>child},approved),true);
 assert.equal(isReadOnlyEmbedRequest({url:()=> 'https://maps.gstatic.com/tile.png',frame:()=>main},approved),false);
 const permission='Permissions policy violation: compute-pressure is not allowed in this document.';
 assert.equal(providerConsoleWarning(permission,'https://www.youtube.com/s/player/example.js',new Set([video])),true);
 assert.equal(providerConsoleWarning(permission,'https://preview.test/runtime.js',new Set([video])),false);
 assert.equal(providerConsoleWarning('Real JavaScript failure','https://www.youtube.com/s/player/example.js',new Set([video])),false);
 const blocker=`/contact: Unsupported interactive content: iframe:${maps}. Add an adapter before publishing.`;
 assert.deepEqual(unresolvedCaptureBlockers({blockers:[blocker]} as any),[]);
 assert.deepEqual(unresolvedCaptureBlockers({blockers:[blocker.replace('iframe:','canvas:')]} as any),[blocker.replace('iframe:','canvas:')]);
});

test('static legacy feed support cannot hide active search, pagination, scripts or backend apps',()=>{
 assert.deepEqual(unsupportedApplicationScripts('<script src="https://widget.gethearth.com/script.js"></script><script src="https://em.realscout.com/assets/em/v3/all.js"></script><script src="/main.123.js"></script><script src="https://cdn.vitris.io/renderer-dist/9.js"></script>','https://source.test/'),['https://widget.gethearth.com/script.js','https://em.realscout.com/assets/em/v3/all.js']);
 assert.ok(staticLegacyComponents('<blog-general uniquecomponent="blog-1"><a href="/article">Read more</a></blog-general>').has('blog-1'));
 for(const control of ['<input name="search">','<a class="page-link" href="javascript:void(0)">Next</a>','<script>startWidget()</script>','<iframe src="https://booking.test/"></iframe>','<div class="d-none d-md-block"><button>Next</button></div>'])assert.equal(staticLegacyComponents(`<blog-general uniquecomponent="blog-1">${control}</blog-general>`).has('blog-1'),false);
 assert.ok(staticLegacyComponents('<blog-general uniquecomponent="blog-1"><div class="d-none"><button>Inactive pagination</button></div><a href="/article">Article</a></blog-general>').has('blog-1'));
 assert.ok(staticLegacyComponents('<maps-general uniquecomponent="maps-1"><iframe src="https://www.google.com/maps/embed?q=Office"></iframe></maps-general>').has('maps-1'));
 assert.equal(staticLegacyComponents('<maps-general uniquecomponent="maps-1"><canvas></canvas></maps-general>').has('maps-1'),false);
 assert.ok(staticLegacyComponents('<accordion-general uniquecomponent="accordion-1"><a data-toggle="collapse" data-target="#answer" href="#answer">Question</a><div id="answer" class="collapse">Answer</div></accordion-general>').has('accordion-1'));
 assert.equal(staticLegacyComponents('<accordion-general uniquecomponent="accordion-1"><button>Unimplemented action</button></accordion-general>').has('accordion-1'),false);
 const blocker='/news: Legacy components need preservation support: blog-1';
 assert.deepEqual(unresolvedCaptureBlockers({blockers:[blocker]} as any,new Map([['/news',new Set(['blog-1'])]])),[]);
 assert.deepEqual(unresolvedCaptureBlockers({blockers:[blocker]} as any,new Map([['/other',new Set(['blog-1'])]])),[blocker]);
 assert.deepEqual(unsupportedApplicationScripts('<script src="https://connect.facebook.net/en_US/fbevents.js"></script><script src="https://connect.facebook.net/signals/config/709780986149434"></script><script src="https://connect.facebook.net/en_US/sdk.js"></script>','https://source.test/'),['https://connect.facebook.net/en_US/sdk.js']);
 assert.deepEqual(unresolvedCaptureBlockers({blockers:['/: Legacy components need preservation support: iframe-1, service-1, maps-1']} as any,new Map([['/',new Set(['iframe-1','maps-1'])]])),['/: Legacy components need preservation support: service-1']);
});

test('legacy React state parsing retains nested hidden navigation without executing script',()=>{
 assert.equal(isDownloadPath('/about/dr.-julia-hagan'),false);
 assert.equal(isDownloadPath('/Newtown-Staycation'),false);
 assert.equal(isDownloadPath('/patient-forms.pdf'),true);
 const navAsset='Asset returned HTML: https://source.test/about/dr.-julia-hagan; missing authored asset retained as an empty placeholder, not claimed as preserved bytes';
 assert.deepEqual(unresolvedCaptureBlockers({blockers:[navAsset]} as any),[navAsset]);
 assert.deepEqual(unresolvedCaptureBlockers({blockers:[navAsset]} as any,new Map(),new Set(['https://source.test/about/dr.-julia-hagan'])),[]);
 const state={pages:{home:{},'article.':{}},navbar:{links:[{hide:true,link:{type:'PAGE',href:'hidden'},links:[{link:{type:'PAGE',href:'nested'}}]}]},footer:{txt:'a brace } and escaped " quotation'}};
 const html='<script>window.__PRELOADED_STATE__ = '+JSON.stringify(state)+'; window.badCode();</script>';
 assert.deepEqual(legacyReactState(html),state);
 assert.deepEqual(legacyRoutes(html,'https://source.test/'),['https://source.test/home','https://source.test/article.','https://source.test/hidden','https://source.test/nested']);
 assert.throws(()=>legacyReactState('<script>window.__PRELOADED_STATE__ = {oops'),/Truncated/);
 const blockers=['/: Legacy React blocks need preservation support: h','/: Legacy React blocks need preservation support: h, booking','/: Unsupported interactive content: iframe'];
 assert.deepEqual(unresolvedCaptureBlockers({blockers} as any),['/: Legacy React blocks need preservation support: booking',blockers[2]]);
});

test('React preservation restores mobile menus, safely handles visible forms, and rewrites Windows-incompatible public routes', {timeout:180000},async()=>{
 const state={site:{homePageUrl:'home'},pages:{home:{rows:[]},'article.':{rows:[]}},footer:{rows:[]}};
 const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(`<!doctype html><html><head><style>body{margin:0}.collapse{display:none}.collapse.show{display:block}.d-none{display:none!important}.d-block{display:block!important}.mobile{display:none}@media(max-width:600px){.desktop{display:none}.mobile{display:block}}</style><script>window.__PRELOADED_STATE__ = ${JSON.stringify(state)};</script></head><body><div id="vcontent"><nav><button class="navbar-toggler">Menu</button><div class="collapse navbar-collapse d-none"><a href="/article.">Article</a></div></nav><h1>${req.url}</h1><div class="desktop"><form><input name="name"><input name="email" type="email"><textarea name="message"></textarea><a class="btn" href="javascript:;">Send</a></form></div><div class="mobile"><form><input name="name"><input name="email" type="email"><textarea name="message"></textarea><a class="btn" href="javascript:;">Send</a></form></div></div></body></html>`);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const root=join(mkdtempSync(join(tmpdir(),'preserve-react-')),'site');
 try{await createSite({dir:root,slug:'react',mode:'preserve',from:`http://127.0.0.1:${(server.address() as any).port}`});const capture=await capturePreservedSite(root);assert.equal(capture.adapter,'vitris-v2');assert.equal(capture.pages.length,3);assert.match(capture.pages.find(p=>p.path==='/article.')!.file,/^_preserve\/routes\//);await buildPreservedSite(root);assert.match(readFileSync(join(root,'dist/_redirects'),'utf8'),/\/article\. .* 200/);const report=await verifyPreservedSite(root);assert.equal(report.ok,true,JSON.stringify(report.failures));assert.ok(report.checks.every(c=>c.changedPixelRatio===0));assert.doesNotMatch(readFileSync(join(root,'dist/index.html'),'utf8'),/__PRELOADED_STATE__|javascript:;/);}
 finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('legacy navbar dropdowns and case-distinct page routes survive Windows storage', {timeout:180000},async()=>{
 const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><style>.d-none{display:none!important}.d-block{display:block!important}.dropdown-menu{display:none}.dropdown-menu.show{display:block}</style></head><body><v1-full-site-renderer><div id="fullSiteRenderer"><nav uniquecomponent="navbar-1"><button data-toggle="collapse" data-target="#nav">Menu</button><div id="nav" class="navbar-collapse collapse d-none"><li class="dropdown"><a class="dropdown-toggle">About</a><ul class="dropdown-menu"><li><a href="/Article">Article</a><a href="/article">Lowercase article</a></li></ul></li></div></nav><h1>'+req.url+'</h1></div></v1-full-site-renderer></body></html>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const root=join(mkdtempSync(join(tmpdir(),'preserve-case-')),'site');
 try {await createSite({dir:root,slug:'case',mode:'preserve',from:`http://127.0.0.1:${(server.address() as any).port}`});const capture=await capturePreservedSite(root);assert.equal(capture.pages.length,3);assert.notEqual(capture.pages[1]!.file.toLowerCase(),capture.pages[2]!.file.toLowerCase());await buildPreservedSite(root);const report=await verifyPreservedSite(root);assert.equal(report.ok,true,JSON.stringify(report.failures));assert.ok(report.checks.every(c=>c.changedPixelRatio===0));}
 finally {await new Promise<void>(r=>server.close(()=>r()));}
});

test('measured button hover colors replace original callbacks and restore unchanged resting pixels', {timeout:180000},async()=>{
 const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end(`<html><body><v1-full-site-renderer><div id="fullSiteRenderer"><a class="btn" href="#" style="color:rgb(0,0,0)" onmouseenter="this.style.color='rgb(255,0,0)'" onmouseleave="this.style.color='rgb(0,0,0)'">Hover</a></div></v1-full-site-renderer></body></html>`);});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const root=join(mkdtempSync(join(tmpdir(),'preserve-hover-')),'site');
 try{await createSite({dir:root,slug:'hover',mode:'preserve',from:`http://127.0.0.1:${(server.address() as any).port}`});await capturePreservedSite(root);const html=readFileSync(join(root,'preserved/index.html'),'utf8');assert.match(html,/data-preserve-hover/);assert.doesNotMatch(html,/onmouseenter/);await buildPreservedSite(root);const report=await verifyPreservedSite(root);assert.equal(report.ok,true,JSON.stringify(report.failures));assert.ok(report.checks.every(c=>c.changedPixelRatio===0));}
 finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('href collapse targets and initially open exclusive accordion panels retain their behavior', {timeout:180000},async()=>{
 const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<html><head><style>.collapse{display:none}.collapse.show{display:block}</style></head><body><v1-full-site-renderer><div id="fullSiteRenderer"><accordion-general uniquecomponent="accordion-1"><div id="accordion"><div data-toggle="collapse" href="#first" data-parent="#accordion">First</div><div id="first" class="collapse show">First answer</div><div data-toggle="collapse" href="#second" data-parent="#accordion">Second</div><div id="second" class="collapse">Second answer</div></div></accordion-general></div></v1-full-site-renderer></body></html>');});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const root=join(mkdtempSync(join(tmpdir(),'preserve-accordion-')),'site');
 try{await createSite({dir:root,slug:'accordion',mode:'preserve',from:`http://127.0.0.1:${(server.address() as any).port}`});const m=await capturePreservedSite(root);assert.ok(!m.blockers?.length);await buildPreservedSite(root);const report=await verifyPreservedSite(root);assert.equal(report.ok,true,JSON.stringify(report.failures));assert.ok(report.checks.every(c=>c.changedPixelRatio===0));}
 finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('diagnostic capture completes independent work but unsupported components fail verification', {timeout:180000},async()=>{
 const server=createServer((req,res)=>{res.setHeader('content-type','text/html');if(req.url==='/broken'){res.statusCode=404;res.end('Missing original page');return;}res.end('<html><body><v1-full-site-renderer><div id="fullSiteRenderer"><services-general uniquecomponent="service-1"><h1>Book a consultation</h1></services-general><a href="/broken">Broken source link</a><a href="/valid">Valid page</a></div></v1-full-site-renderer></body></html>');});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const root=join(mkdtempSync(join(tmpdir(),'preserve-diagnostic-')),'site');
 try{await createSite({dir:root,slug:'diagnostic',mode:'preserve',from:`http://127.0.0.1:${(server.address() as any).port}`});const capture=await capturePreservedSite(root,{diagnostic:true});assert.match(capture.blockers![0]!,/service-1/);assert.deepEqual(capture.pages.map(p=>p.path),['/','/valid']);assert.ok(capture.blockers!.some(b=>b.includes('/broken')&&b.includes('404')));await buildPreservedSite(root);const report=await verifyPreservedSite(root);assert.equal(report.ok,false);assert.ok(report.checks.every(c=>c.changedPixelRatio===0));assert.match(report.failures[0]!,/service-1/);}
 finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('React static block proof rejects active listings and transaction exceptions require disabled original controls',()=>{
 const state={pages:{home:{rows:[{blocks:[{bt:'b',_id:'blog'},{bt:'coll',_id:'catalog'},{bt:'cform',_id:'intake'},{bt:'s',_id:'booking'}]}]}},site:{homePageUrl:'home'}};
 const source='<div id="blog"><a href="/article">Article</a></div><div id="catalog"><a href="/product">Product</a></div><div id="intake"><form><input name="uuid" type="file"><a href="javascript:;">Submit</a></form></div><div id="booking"><div id="select-time-parent-container"><a>Next</a><div id="days-container"><div class="day-col">16</div></div></div></div>';
 const copy=source.replace('<form>','<form action="#" data-preserve-forms="preview" data-preserve-disabled-custom-form>').replace('<div id="booking">','<div id="booking" data-preserve-disabled-booking>').replace('<a>Next','<a data-preserve-disabled-action="booking">Next').replace('class="day-col"','class="day-col" data-preserve-disabled-action="booking"');
 assert.deepEqual([...reactCapabilities(state,source,copy,'/',false)],['b','coll']);
 assert.deepEqual([...reactCapabilities(state,source,copy,'/',true)],['b','coll','cform','s']);
 assert.equal(reactCapabilities(state,source.replace('Article','<button>More</button>'),copy,'/',true).has('b'),false);
 assert.equal(reactCapabilities(state,source,copy.replace('name="uuid"','name="another-field"'),'/',true).has('cform'),false);
 assert.equal(reactCapabilities(state,source,copy.replace('data-preserve-disabled-booking','unadapted-booking'),'/',true).has('s'),false);
 const blocker='/: Legacy React blocks need preservation support: b, s';
 assert.deepEqual(unresolvedCaptureBlockers({blockers:[blocker]} as any,new Map(),new Set(),new Map([['/',new Set(['b'])]])),['/: Legacy React blocks need preservation support: s']);
});

test('authorized disabled intake and booking, product carousel, and deferred images preserve pixels without backend calls',{timeout:180000},async()=>{
 const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="red"/></svg>');
 const state={site:{homePageUrl:''},pages:{'':{rows:[{blocks:[{bt:'s',_id:'booking'},{bt:'cform',_id:'intake'}]}]}},footer:{rows:[]}};
 const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end(`<html><body><script>window.__PRELOADED_STATE__=${JSON.stringify(state)};window.addEventListener('resize',()=>document.querySelectorAll('img[data-src]').forEach(i=>i.src=i.dataset.src));window.addEventListener('DOMContentLoaded',()=>{const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.src=e.target.dataset.src;observer.unobserve(e.target);}}),{rootMargin:'0px 0px 200px 0px'});document.querySelectorAll('img[data-src]').forEach(i=>observer.observe(i));});</script><div id="vcontent"><div id="booking"><div id="select-time-parent-container"><a>Next month</a><div id="days-container"><div class="day-col">16</div></div></div></div><div id="intake"><form><input type="email" name="uuid-email"><input type="file" required name="uuid-file"><a class="btn" href="javascript:;">Submit</a></form></div><div class="carousel"><button class="carousel__dot" disabled>First</button><button class="carousel__dot">Second</button><div class="carousel__slider" tabindex="0"><ul class="carousel__slider-tray"><li class="carousel__slide carousel__slide--visible" aria-selected="true">First image</li><li class="carousel__slide carousel__slide--hidden" aria-selected="false">Second image</li></ul></div></div><div style="height:1500px"></div><img data-src="${image}" src="" alt="Deferred image"></div></body></html>`);});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const root=join(mkdtempSync(join(tmpdir(),'preserve-disabled-')),'site');
 try{
  await createSite({dir:root,slug:'disabled',mode:'preserve',from:`http://127.0.0.1:${(server.address() as any).port}`});await capturePreservedSite(root,{diagnostic:true});
  const file=join(root,'preserved/index.html');let html=readFileSync(file,'utf8');
  html=html.replace('id="booking"','id="booking" data-preserve-disabled-booking').replace('<a>Next month','<a data-preserve-disabled-action="booking">Next month').replace('class="day-col"','class="day-col" data-preserve-disabled-action="booking"').replace('<form ','<form data-preserve-disabled-custom-form ').replace('href="javascript:;"','href="#" data-vitrisid="emailSendButton"').replace('class="carousel"','class="carousel" data-preserve-carousel').replace('data-src="'+image+'"','data-src="'+image+'" data-preserve-deferred-src="'+image+'"');writeFileSync(file,html);
  const launchFile=join(root,'launch.json'),launch=JSON.parse(readFileSync(launchFile,'utf8'));launch.previewDisabledTransactions=true;writeFileSync(launchFile,JSON.stringify(launch));
  await buildPreservedSite(root);const report=await verifyPreservedSite(root);assert.equal(report.ok,true,JSON.stringify(report.failures));assert.ok(report.checks.every(c=>c.changedPixelRatio===0));
  launch.previewDisabledTransactions=false;writeFileSync(launchFile,JSON.stringify(launch));await buildPreservedSite(root);const refused=await verifyPreservedSite(root);assert.equal(refused.ok,false);assert.ok(refused.failures.some(f=>f.includes('s, cform')));
  const manifest=preserveManifest(root);writeFileSync(join(root,'onboarding/invalid-supplement.json'),JSON.stringify({sourceUrl:'https://unrelated.test',capturedAt:manifest.capturedAt,assets:[]}));writeFileSync(join(root,'onboarding/preserve-supplements.json'),JSON.stringify({files:['onboarding/invalid-supplement.json']}));assert.throws(()=>preserveManifest(root),/does not match/);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
