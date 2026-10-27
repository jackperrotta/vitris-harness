import {RIDGELINE_BROWSE} from './agent/industry/ridgeline/browse.ts';
import {cloudEntry} from './agent/theme-cloud.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { deflateSync } from 'node:zlib';
import { save, fingerprint } from './agent/artifacts.ts';
import { VISUAL_THEMES,RECORD_CATALOG,ARCHIVE_THEMES,LEGACY_THEMES,RELEASE2_THEMES,visualTheme,THEME_RELEASE,SUITE_RELEASE,digest,themeHash } from './agent/theme-library.ts';
import { BRAND_PATH, SELECTION_PATH, bindTheme, ensureBrandContext, contrast, selectionDraft, submitSelection, selectionStore, currentSelectionHash, selectedThemeContext, normalizeBrandColor, colorsFromCapturedHtml, colorsFromComputedActions, logoData } from './agent/theme-selection.ts';
import { renderSpecimen, writeThemePicker, renderThemePicker as renderHostedPicker, HOSTED_PICKER_THEMES } from './agent/theme-picker.ts';
import { startLegacyPickerServer as startThemeReviewServer, renderLegacyPicker as renderThemePicker, syntheticLegacyImageSha256, legacyPickerScope } from './test/legacy-picker-fixtures.ts';
import { startThemeReviewServer as startHostedPickerServer } from './agent/theme-review-server.ts';
import {THEME_ASSETS,assetBytes,assetUrl,hostedAsset} from './agent/theme-assets.ts';
import {previewResource,displaySite,fullSiteLinks,fullSiteByUrl,manifestPages} from './agent/theme-preview.ts';
import {INDUSTRY_SCRIPT} from './agent/industry/interactions.ts';
import {SEVEN_SITES,SEVEN_RELEASE} from './agent/industry/seven/registry.ts';
import {SEVEN_SCRIPT} from './agent/industry/seven/interactions.ts';
import {PAGE_ROLES,BUSINESSES,pageManifest} from './agent/theme-suite-data.ts';
import {suite} from './agent/theme-suites.ts';
import {chromium} from 'playwright';
import { prepareStage, cancelStage, completeStage } from './agent/lifecycle.ts';
import { initialState, type SkillGraph } from './agent/graph.ts';
import { reconcile, inputHash, instructionContractHash } from './agent/runner.ts';
import { themeCss } from './theme.ts';
import { defaultTheme } from './types.ts';
import { recordManagedKit, planKitUpgrade, applyKitUpgrade } from './upgrade/kit.ts';
import { scaffoldNestedSite, copyAllowlist, SHARED_EVIDENCE_PATHS } from './agent/design-copy.ts';
import { buildCreativeContextPacket } from './agent/creative-context.ts';
import { createCreativeEfficiencyPolicy } from './agent/creative-efficiency.ts';
import {sweepThemePicker, checkPortablePicker} from './test/theme-picker-browser.ts';
import {checkGalleryBrowse} from './test/theme-gallery-browser.ts';
import {BROWSE_METADATA,browseResults,FAMILIES,IDENTITIES,type BrowseState} from './agent/theme-browse.ts';

const kernel=resolve(import.meta.dirname,'..');
function site(enabled=true){const root=mkdtempSync(join(tmpdir(),'vitris-themes-'));cpSync(join(kernel,'agent'),join(root,'agent'),{recursive:true});mkdirSync(join(root,'onboarding'),{recursive:true});save(join(root,'launch.json'),{slug:'fictional-test-synthetic-assets-v1',name:'Fictional <Studio>',...(enabled?{themeSelection:{version:1,enabled:true}}:{})});save(join(root,'onboarding/brief.json'),{business:{name:'Fictional <Studio>'},images:[]});return root;}
const graph=():SkillGraph=>({version:3,stop_at:'preview_ready',nodes:[{id:'reference-analysis',needs:[],writes:['onboarding/reference-analysis.json'],refs:[],tools:[],eval:'reference-analysis',kind:'agent',maxAttempts:4}]});

test('release .3 preserves all 34 accepted identities and 68 exact rendered bodies',()=>{
 const fixture=JSON.parse(readFileSync(join(kernel,'src/test/fixtures/theme-release3-identities.json'),'utf8'));
 for(const entry of fixture.themes){const t=visualTheme(entry.id,fixture.release);assert.equal(themeHash(t),entry.hash);assert.equal(digest(renderSpecimen({root:kernel,brand:fixture.brand},t.id,'story',t.release)),entry.main);assert.equal(digest(renderSpecimen({root:kernel,brand:fixture.brand},t.id,'guide',t.release)),entry.interior);}
});

test('170 real page routes, connected navigation, refresh/history and thumbnail identity',{timeout:90000},async()=>{
 const root=site(),brand=ensureBrandContext(root),{server,url}=await startThemeReviewServer({sites:[{root,test:true}],port:0}),browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 try{
 for(const t of VISUAL_THEMES.filter(t=>t.release===SUITE_RELEASE&&!cloudEntry(t.id))){const s=suite(t.id);assert.equal(new Set(PAGE_ROLES.map(role=>digest(s[role]))).size,5);assert.equal(pageManifest(t.id).length,5);const links=fullSiteLinks({root,brand},t);
  for(const role of PAGE_ROLES){const response=await page.goto(new URL(links[role]!,url).href,{waitUntil:'domcontentloaded'});assert.equal(response!.status(),200);assert.equal(await page.locator('body').getAttribute('data-business'),BUSINESSES[t.id]!.name);assert.equal(await page.locator('body').getAttribute('data-page-role'),role);assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('header nav a').count(),5);assert.equal(await page.locator('header nav a[aria-current=page]').getAttribute('data-page-role'),role);assert.deepEqual(await page.locator('header nav a').evaluateAll(es=>es.map(e=>e.getAttribute('href'))),PAGE_ROLES.map(r=>links[r]));await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('body').getAttribute('data-page-role'),role);}
  await page.locator('header nav a[data-page-role=services]').click();await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('body').getAttribute('data-page-role'),'services');await page.goBack();assert.equal(await page.locator('body').getAttribute('data-page-role'),'contact');await page.goForward();assert.equal(await page.locator('body').getAttribute('data-page-role'),'services');
 }
 const t=visualTheme('fresh-routine'),original=displaySite({root,brand},t,'original'),a=previewResource({root,brand},t,'home','desktop'),o=previewResource(original,t,'home','desktop'),mobile=previewResource({root,brand},t,'home','mobile');assert.equal(new Set([a.id,o.id,mobile.id]).size,3);
 const thumbnail=await fetch(new URL('/thumbnail'+a.url,url));assert.equal(thumbnail.status,200);assert.equal(thumbnail.headers.get('content-type'),'image/jpeg');const bytes=new Uint8Array(await thumbnail.arrayBuffer());assert.ok(bytes.length>10000);assert.equal(digest(bytes),digest(new Uint8Array(await(await fetch(new URL('/thumbnail'+a.url,url))).arrayBuffer())));assert.equal((await fetch(new URL('/thumbnail/specimen/stale',url))).status,404);
 await page.goto(new URL(a.url,url).href);await page.evaluate(()=>(globalThis as any).document.fonts.ready);assert.equal(digest(await page.screenshot({type:'jpeg',quality:76})),digest(bytes));
 const context=bindTheme(t,brand).guide;assert.doesNotMatch(context,/Good Day Cleaning|demo\/|\/services|PAGE_ROLES/);assert.match(context,/authoredLayout/);
 }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('release .2 retains its exact records and 48 archived rendered bodies',()=>{
 const fixture=JSON.parse(readFileSync(join(kernel,'src/test/fixtures/theme-release2-identities.json'),'utf8'));
 for(const entry of fixture.themes){const t=visualTheme(entry.id,'2026-10-08.2');assert.equal(themeHash(t),entry.hash);assert.equal(digest(renderSpecimen({root:kernel,brand:fixture.brand},t.id,'story',t.release)),entry.main);assert.equal(digest(renderSpecimen({root:kernel,brand:fixture.brand},t.id,'guide',t.release)),entry.interior);}
 assert.equal(RELEASE2_THEMES.length,24);
});
test('taxonomy is complete, controlled and groups each identity exactly once',()=>{
 const themes=VISUAL_THEMES.map(t=>({...t,browse:BROWSE_METADATA[t.id]!}));assert.equal(Object.keys(BROWSE_METADATA).length,VISUAL_THEMES.length);assert.equal(themes.filter(t=>t.browse.new).length,VISUAL_THEMES.length-24);
 for(const t of themes){assert.ok(t.browse.family in FAMILIES);assert.ok(t.browse.identities.every(i=>IDENTITIES.includes(i)));assert.ok(t.browse.collections.some(c=>['Core Directions','Local Service Edit','Industry templates'].includes(c)));}
 const state:BrowseState={collection:'All directions',families:[],identities:[],industries:[],media:[],tasks:[],query:'',group:'family',sort:'curated',archive:'current',shortlist:[],compare:[],palette:'brand',viewport:'desktop'};
 for(const group of ['family','collection','identity']){const r=browseResults(themes,{...state,group});assert.equal(r.visible.length,VISUAL_THEMES.length);assert.equal(new Set(r.groups.flatMap(g=>g.themes.map(t=>t.id))).size,VISUAL_THEMES.length);}
 assert.equal(browseResults(themes,{...state,collection:'Local Service Edit',families:['Structured','Illustrated & Tactile'],identities:['Rugged']}).visible.length,2);
 assert.deepEqual(browseResults(themes,{...state,query:'plumbing'}).visible.map(t=>t.id),['dispatch-board']);assert.ok(browseResults(themes,{...state,query:'no photos'}).visible.every(t=>t.browse.media==='none'));
});
test('browse, shortlist, compare, persistence and exact UI notes remain separate',{timeout:90000},async()=>{
 const root=site(),{server,url}=await startThemeReviewServer({sites:[{root,test:true}],port:0});try{const report=await checkGalleryBrowse(url);assert.equal(selectionStore(root)!.current.notes,report.note);assert.equal(selectionStore(root)!.current.themeId,'fresh-routine');assert.equal(selectionStore(root)!.current.source,'test-simulation');assert.equal(selectionStore(root)!.history.length,0);}finally{await new Promise<void>(r=>server.close(()=>r()));}
});

// The full offline catalog now includes 22 photographic Copper pages as well as concurrent directions.
// Keep the complete archive/portable assertions; allow their measured >90s Windows run to finish.
test('served gallery transitions, archive regression, scrolling, filters, brands, retries and 320px controls',{timeout:180000},async()=>{
  const primary=site(),second=site(),neutral=site();for(const [root,id,color] of [[primary,'browser-primary','#2a5570'],[second,'browser-second','#efb136'],[neutral,'browser-neutral',null]] as const){const b=ensureBrandContext(root);b.siteId=id;if(color){b.colors=[{value:color,source:'synthetic test',confidence:'explicit'}];b.fallback=false;}save(join(root,BRAND_PATH),b);}
  const {server,url}=await startThemeReviewServer({sites:[primary,second,neutral].map(root=>({root,test:true})),port:0});try{const report=await sweepThemePicker(url);assert.equal(report.names.length,34);assert.ok(report.transitions>=150);assert.ok(report.shell320&&report.errorRetry);}finally{await new Promise<void>(r=>server.close(()=>r()));}
  const portable=join(primary,'portable.html');writeThemePicker(primary,portable,true,legacyPickerScope);await checkPortablePicker(portable);assert.equal(existsSync(join(primary,SELECTION_PATH)),false);
});
test('34 authored identities bind deterministically, with readable difficult colors and unchanged definitions',()=>{
  const root=site(),brand=ensureBrandContext(root),before=digest(VISUAL_THEMES);assert.equal(RECORD_CATALOG.length,70);assert.equal(new Set(VISUAL_THEMES.map(t=>themeHash(t))).size,VISUAL_THEMES.length);const preserved=JSON.parse(readFileSync(join(kernel,'src/test/fixtures/theme-release4-identities.json'),'utf8'));for(const t of VISUAL_THEMES.filter(t=>t.release===SUITE_RELEASE))assert.equal(themeHash(t),preserved.themes[t.id]);
  for(const value of ['#ffff00','#ffffff','#000000','#2a5570','#fca931'])for(const t of VISUAL_THEMES){const b={...brand,colors:[{value,source:'explicit test',confidence:'explicit' as const}],fallback:false};const result=bindTheme(t,b);assert.deepEqual(result,bindTheme(t,b));assert.equal(result.brandAccent,value);assert.ok(contrast(result.tokens.colorAccent,result.tokens.colorAccentText)>=4.5);assert.ok(contrast(result.tokens.colorText,result.tokens.colorBg)>=4.5);assert.ok(contrast(result.tokens.colorMuted,result.tokens.colorBg)>=4.5);}
  assert.equal(digest(VISUAL_THEMES),before);assert.equal(logoData(root,brand),undefined);assert.match(renderSpecimen({root,brand},'literary-essay'),/Fictional &lt;Studio&gt;/);assert.notEqual(renderSpecimen({root,brand},'literary-essay'),renderSpecimen({root,brand},'literary-essay','guide'));
  assert.equal(normalizeBrandColor('red;}</style><script>'),undefined);assert.equal(normalizeBrandColor('rgba(42,85,112,1)'),'#2a5570');assert.deepEqual(colorsFromCapturedHtml('<img style="color:#123456">','test'),[]);assert.equal(colorsFromCapturedHtml('<a style="color:#123456"></a><button style="background-color:#123456"></button>','retained')[0]?.value,'#123456');
  assert.deepEqual(colorsFromComputedActions(['#ff6600','#ff6600','rgb(0, 0, 255)','#0000ff','#ffff00','#ffff00','#ffffff','#ffffff','#333333','#333333'],'computed test').map(c=>c.value),['#0000ff','#ff6600','#ffff00']);
  assert.equal(colorsFromCapturedHtml('<a style="color:#ffff00"></a><button style="background-color:#ffff00"></button>','retained bright')[0]?.value,'#ffff00');
});
test('selection notes persist exactly; revisions preserve history and retry is idempotent',()=>{
  const root=site(),note='  Keep this.\nChange “that”. Avoid <script> and 🌿.  \n',s=selectionDraft(root,'Literary Essay',note,'user-chat');assert.equal(submitSelection(root,s).replay,false);assert.equal(submitSelection(root,JSON.parse(JSON.stringify(s))).replay,true);assert.equal(selectionStore(root)!.current.notes,note);assert.match(selectedThemeContext(root),/Exact selection note/);
  const next=selectionDraft(root,'technical-manual','Second note','test-simulation');submitSelection(root,next);assert.equal(selectionStore(root)!.history.length,1);assert.equal(submitSelection(root,s).replay,true);assert.equal(selectionStore(root)!.current.themeId,'technical-manual');assert.throws(()=>submitSelection(root,{...s,notes:'conflict'}),/conflict/);assert.throws(()=>submitSelection(root,{...s,operationId:'new-stale-operation'}),/changed elsewhere/);
});

test('original release resolves its immutable records, rendered assets and accepted note without remapping',()=>{
  const expected=['dff23a92dbdcab4efd30795f037d7c47cd1efe7f858693d8330d37596699c281','74bb20e9251f79005cc5023e23f795b4704179314f7d8c012ac70340dde9eb9d','dff75e7be5c3e2cf8e6621b398db075768432b6ab2a26b9d1721be7030cbd0cb','48a9e2398ac01a7339a69eb32de296bc996ef879363ab2396f08c3573cd75c1c','89a8205fae57ff08fdf45cb54a648f671af6dddc2b36d3fd69318ead656f0321','6a116848cefdb194df12abdb717b7cb5e379161581b14e5dddac137d81ba6f8c','0e09488135e247978d61d8989b130fc04fa8f97dbc884812399208aa4e0e02ce','248384da49c339ed9d38dcb4468c618b300a9779641d4f60ca38dd817d9f8757'];
  assert.deepEqual(LEGACY_THEMES.map(themeHash),expected);assert.equal(LEGACY_THEMES.length,8);assert.throws(()=>visualTheme('editorial'));assert.throws(()=>visualTheme('swiss-index','2026-10-08.1'));
  const root=site(),note=' Original release.\nKeep 🌿 exactly. ';submitSelection(root,selectionDraft(root,'editorial',note,'test-simulation',undefined,'2026-10-08.1'));
  assert.match(selectedThemeContext(root),/Editorial \(2026-10-08.1\)/);assert.ok(selectedThemeContext(root).includes(JSON.stringify(note)));assert.doesNotMatch(selectedThemeContext(root),/Swiss Index|Newspaper/);
  assert.match(renderSpecimen({root,brand:ensureBrandContext(root)},'editorial','story','2026-10-08.1'),/Good things/);
  submitSelection(root,selectionDraft(root,'quiet-folio','New choice','user-chat'));assert.equal(selectionStore(root)!.history[0]!.themeId,'editorial');assert.equal(selectionStore(root)!.current.themeRelease,SUITE_RELEASE);
});

test('pinned fonts/media and specimen identities cover the actual content, brand and viewport',async()=>{
  for(const a of THEME_ASSETS.assets){if(hostedAsset(a.id)){const response=await fetch(hostedAsset(a.id).url,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);const bytes=new Uint8Array(await response.arrayBuffer());if(hostedAsset(a.id))assert.equal(digest(bytes),a.sha256);else if(a.kind!=='font')assert.equal(digest(bytes),syntheticLegacyImageSha256);else assert.ok(bytes.length>1000);}else{assert.throws(()=>assetBytes(a),/Missing theme asset/);}assert.ok(a.source.startsWith('https://'));if(a.kind==='font'){assert.ok(['SIL OFL 1.1','Apache 2.0'].includes(a.license!));assert.ok(a.licenseFile&&a.licenseHash);}else assert.equal(a.terms,'https://www.pexels.com/license/');}
  const root=site(),brand=ensureBrandContext(root),t=VISUAL_THEMES[0]!,s={root,brand};
  const a=previewResource(s,t,'story','desktop'),b=previewResource(s,t,'guide','desktop'),c=previewResource(s,t,'story','mobile');assert.notEqual(a.id,b.id);assert.notEqual(a.id,c.id);assert.equal(previewResource(s,t,'story','desktop').id,a.id);assert.notEqual(previewResource({root,brand:{...brand,name:'Different'}},t,'story','desktop').id,a.id);
  const bound=renderSpecimen({root,brand},'swiss-index');assert.doesNotMatch(bound,/\$\{b\.|\{\{accent\}\}/);assert.ok(bound.includes('--brand-original:'+bindTheme(VISUAL_THEMES[0]!,brand).brandAccent));
  assert.equal(new Set(VISUAL_THEMES.flatMap(t=>t.specimens?[t.specimens.main,t.specimens.interior]:cloudEntry(t.id)!.pages.map(p=>p.recipe))).size,VISUAL_THEMES.filter(t=>t.specimens).length*2+VISUAL_THEMES.filter(t=>!t.specimens).reduce((n,t)=>n+cloudEntry(t.id)!.pages.length,0));assert.ok(VISUAL_THEMES.every(t=>cloudEntry(t.id)||((t.neighbors?.length||0)>=2&&t.sources?.length&&t.responsive)));
});
test('reject wrong sites, stale releases, brand changes, unknown themes, output paths and undelegated agent choices',()=>{
  const root=site(),s=selectionDraft(root,'swiss-index','','user-ui');for(const patch of [{siteId:'other'},{themeId:'unknown'},{themeRelease:'old'},{brandContextHash:'bad'},{out:'C:/elsewhere'},{source:'agent-delegated'}])assert.throws(()=>submitSelection(root,{...s,...patch}));assert.equal(existsSync(join(root,SELECTION_PATH)),false);
  const delegated=selectionDraft(root,'quiet-folio','Note','agent-delegated','Please choose the theme for me.');submitSelection(root,delegated);assert.equal(selectionStore(root)!.current.source,'agent-delegated');const brand=ensureBrandContext(root);brand.name='Changed branding';save(join(root,BRAND_PATH),brand);assert.throws(()=>selectedThemeContext(root),/Stale preview/);
});
test('awaiting-user resume is durable and spends no attempts; accepted choice reaches actual prepared context',async()=>{
  const root=site(),g=graph(),state=initialState(g),before=JSON.stringify(state);for(let i=0;i<2;i++){const r=await prepareStage({root,kernel,graph:g,state});assert.equal(r.status,'awaiting_user');assert.equal(JSON.stringify(state),before);assert.equal(existsSync(join(root,'agent/leases/stage-reference-analysis.json')),false);}assert.ok(existsSync(join(root,'agent/theme-awaiting.json')));
  const notes=' Keep exactly.\nNo invented claims. ';submitSelection(root,selectionDraft(root,'organic-studio',notes,'test-simulation'));const r=await prepareStage({root,kernel,graph:g,state});assert.equal(r.status,'prepared');assert.ok(r.instructions!.includes(JSON.stringify(notes)));assert.match(r.instructions!,/Organic Studio/);assert.equal(state.nodes['reference-analysis']!.attempts,0);const prep=r.preparation!;cancelStage({root,preparationId:prep.id});
});
test('supported revision invalidates design ownership but retains capture/history/counters and legacy mode',async()=>{
  const root=site(),g=graph(),state=initialState(g);submitSelection(root,selectionDraft(root,'swiss-index','','test-simulation'));const node=g.nodes[0]!;
  // Unit synthetic completed-node input; no production STATE file is edited.
  state.nodes[node.id]={status:'done',attempts:2,inputHash:inputHash(root,node),outputHash:fingerprint(root,node.writes),skillHash:instructionContractHash(root,node),themeSelectionHash:currentSelectionHash(root)};
  const captured=fingerprint(root,['onboarding/brief.json']);submitSelection(root,selectionDraft(root,'hard-edge','Revision','user-chat'));reconcile(root,g,state);assert.equal(state.nodes[node.id]!.status,'pending');assert.equal(state.nodes[node.id]!.attempts,2);assert.equal(fingerprint(root,['onboarding/brief.json']),captured);assert.equal(selectionStore(root)!.history.length,1);
  const legacy=site(false),legacyResult=await prepareStage({root:legacy,kernel,graph:graph(),state:initialState(graph())});assert.equal(legacyResult.status,'prepared');assert.equal(existsSync(join(legacy,BRAND_PATH)),false);assert.equal(selectedThemeContext(legacy),'');cancelStage({root:legacy,preparationId:legacyResult.preparation!.id});assert.match(themeCss(defaultTheme),/--step-5: clamp\(2.6rem/);assert.match(themeCss({...defaultTheme,typeStep5:'5rem',sectionY:'4rem'}),/--step-5: 5rem/);
});
test('a theme change during preparation fails freshness checks without consuming an author attempt',async()=>{
  const root=site(),g=graph(),state=initialState(g);submitSelection(root,selectionDraft(root,'swiss-index','','test-simulation'));const r=await prepareStage({root,kernel,graph:g,state});submitSelection(root,selectionDraft(root,'quiet-folio','','test-simulation'));await assert.rejects(()=>completeStage({root,kernel,graph:g,state,preparationId:r.preparation!.id}),/changed|stale|immutable/i);assert.equal(state.nodes['reference-analysis']!.attempts,0);cancelStage({root,preparationId:r.preparation!.id});
});
test('loopback endpoint confines routes and requires exact host, origin, session, size and schema',async()=>{
  const root=site(),{server,url}=await startThemeReviewServer({sites:[{root,test:true}],port:0});try{const index=await fetch(url);assert.equal(index.headers.get('x-theme-release'),THEME_RELEASE);assert.deepEqual(await(await fetch(url+'api/library')).json(),{release:THEME_RELEASE,themes:VISUAL_THEMES.length,pages:VISUAL_THEMES.reduce((n,t)=>n+manifestPages(t).length,0),specimens:VISUAL_THEMES.reduce((n,t)=>n+manifestPages(t).length,0),suiteRelease:'2026-10-08.4',suiteThemes:34,industryRelease:'2026-10-09.1',industryThemes:12,archiveThemes:ARCHIVE_THEMES.length,legacyRelease:'2026-10-08.1',legacyThemes:8});const html=await index.text();const session=JSON.parse(html.match(/,session=(\{[^;]+?\}),vocabulary=/)![1]!);const s=selectionDraft(root,'literary-essay','Unicode 🌿 exact\n','test-simulation');const headers={'Origin':new URL(url).origin,'Content-Type':'application/json','X-Theme-Session':session.token};
    assert.equal((await fetch(url+'package.json')).status,404);const wrongHost=await new Promise<number|undefined>((ok,fail)=>{const req=request(url,{headers:{Host:'evil.test'}},res=>{res.resume();ok(res.statusCode);});req.on('error',fail);req.end();});assert.equal(wrongHost,403);
    const r=previewResource({root,brand:ensureBrandContext(root)},VISUAL_THEMES[0]!,'guide','mobile'),response=await fetch(new URL(r.url,url));assert.equal(response.status,200);assert.equal(await response.text(),r.html);assert.match(response.headers.get('content-security-policy')!,/script-src 'sha256-/);assert.doesNotMatch(response.headers.get('content-security-policy')!,/script-src 'unsafe-inline'/);
    assert.equal((await fetch(new URL(r.url.replace(r.id,'0'.repeat(64)),url))).status,404);assert.equal((await fetch(new URL('/specimen/..%2fpackage.json',url))).status,404);
    for(const a of THEME_ASSETS.assets){const response=await fetch(new URL(assetUrl(a.id),url));assert.equal(response.status,200);const bytes=new Uint8Array(await response.arrayBuffer());if(hostedAsset(a.id))assert.equal(digest(bytes),a.sha256);else if(a.kind!=='font')assert.equal(digest(bytes),syntheticLegacyImageSha256);else assert.ok(bytes.length>1000);}assert.equal((await fetch(url+'theme-assets/unknown/font.ttf')).status,404);
    for(const changes of [{'X-Theme-Session':'bad'},{Origin:'http://evil.test'},{'Content-Type':'text/plain'}])assert.equal((await fetch(url+'api/selection',{method:'POST',headers:{...headers,...changes},body:JSON.stringify(s)})).status,403);
    assert.equal((await fetch(url+'api/selection',{method:'POST',headers,body:'x'.repeat(33000)})).status,413);
    assert.equal((await fetch(url+'api/selection',{method:'POST',headers,body:JSON.stringify({...s,siteId:'elsewhere'})})).status,409);
    for(let i=0;i<2;i++)assert.equal((await fetch(url+'api/selection',{method:'POST',headers,body:JSON.stringify(s)})).status,200);assert.equal(selectionStore(root)!.current.notes,s.notes);assert.equal(selectionStore(root)!.history.length,0);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('help and status do not create artifacts or invoke providers',()=>{
  const root=site(),before=fingerprint(root,['agent','onboarding','launch.json']);for(const args of [['--help'],['status','--site',root]]){const r=spawnSync(process.execPath,['--experimental-strip-types',join(kernel,'scripts/theme-selection.ts'),...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}assert.equal(fingerprint(root,['agent','onboarding','launch.json']),before);
});
test('managed plan/apply preserves launch, authored work, selection and progress',()=>{
  const root=site();recordManagedKit(root,kernel);mkdirSync(join(root,'pages'),{recursive:true});writeFileSync(join(root,'pages/index.html'),'<h1>Authored</h1>');submitSelection(root,selectionDraft(root,'swiss-index','Keep exact','test-simulation'));const paths=['launch.json','pages','agent/STATE.json',SELECTION_PATH,BRAND_PATH],before=fingerprint(root,paths);const plan=planKitUpgrade(root,kernel);assert.equal(fingerprint(root,paths),before);applyKitUpgrade(root,kernel,plan);assert.equal(fingerprint(root,paths),before);
});
test('variant children inherit selected identity; compact creative context retains the exact note',async()=>{
  const root=site(),child=join(root,'variants','one'),notes='  Same identity.\nDifferent composition, please. ';submitSelection(root,selectionDraft(root,'technical-manual',notes,'test-simulation'));
  scaffoldNestedSite({parent:root,kernel,dest:child,slug:'child-one',name:'Child one'});copyAllowlist(root,child,SHARED_EVIDENCE_PATHS);assert.equal(selectionStore(child)!.current.notes,notes);assert.match(selectedThemeContext(child),/Technical Manual/);
  const policy=createCreativeEfficiencyPolicy(root,['--creative-efficiency','--no-jev']),node=graph().nodes[0]!;
  const packet=await buildCreativeContextPacket({root,kernel,node,role:'plan',objective:'Test inherited identity',sourceRevision:'test',baseContract:'Test only',policy,config:policy.config,evidence:{schemaVersion:1,inputHash:'test',nodes:[],edges:[],unresolvedAliases:[]},retrievedIds:[],mandatorySkillIds:[],optionalSkillIds:[],constraints:[],obligations:[],findings:[],renderIds:[]});assert.ok(packet.prompt.includes(JSON.stringify(notes)));assert.match(packet.prompt,/do not copy specimen/);
});
test('twelve industry templates keep 144 routes, local confirms, and contained logos',{timeout:120000},async()=>{
 assert.doesNotMatch(INDUSTRY_SCRIPT,/fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
 const root=site(),brand=ensureBrandContext(root);
 const crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c;}
 const crc32=(buf:Buffer)=>{let c=~0;for(const b of buf)c=crcTable[c^b]!^(c>>>8);return (~c)>>>0;};
 const chunk=(type:string,data:Buffer)=>{const t=Buffer.from(type),len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([t,data]),sum=Buffer.alloc(4);sum.writeUInt32BE(crc32(body));return Buffer.concat([len,body,sum]);};
 const w=420,h=48,raw=Buffer.alloc((w*3+1)*h,255);for(let y=0;y<h;y++)raw[y*(w*3+1)]=0;
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
 writeFileSync(join(root,'onboarding/wide-logo.png'),png);brand.logo={path:'onboarding/wide-logo.png',hash:digest(png),source:'wide fixture'};brand.name='A Very Long Preview Brand Name For Containment';save(join(root,BRAND_PATH),brand);
 const industry=VISUAL_THEMES.filter(t=>t.release==='2026-10-09.1');assert.equal(industry.length,12);
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:800}});
 try{
  for(const t of industry){assert.equal(manifestPages(t).length,12);const links=fullSiteLinks({root,brand},t);
   for(const item of manifestPages(t)){const html=renderSpecimen({root,brand},t.id,item.pageId,t.release);assert.equal((html.match(/<h1[\s>]/g)||[]).length,1);assert.match(html,/Nothing is sent/);assert.doesNotMatch(html,/action="https?:/);assert.equal(links[item.pageId]?.endsWith('/'+item.pageId),true);} 
   assert.equal(fullSiteByUrl([{root,brand}],VISUAL_THEMES,`/site/${t.release}/${t.id}/${digest(brand)}/desktop/${themeHash(t)}/not-a-page`),undefined);
   const home=renderSpecimen({root,brand},t.id,'home',t.release);await page.setContent(home,{waitUntil:'domcontentloaded'});
   const overlap=await page.evaluate(()=>{const d=(globalThis as any).document,img=d.querySelector('a.lockup img'),nav=d.querySelector('header nav'),lock=d.querySelector('a.lockup');if(!img||!nav||!lock)return 'missing';const a=img.getBoundingClientRect(),b=nav.getBoundingClientRect(),c=lock.getBoundingClientRect();const hit=!(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1);return JSON.stringify({hit,imgPast:a.right>c.right+1,wide:a.width>c.width+1});});
   const box=JSON.parse(overlap);assert.equal(box.hit,false,t.id);assert.equal(box.imgPast,false,t.id);assert.equal(box.wide,false,t.id);
  }
  const suiteHtml=renderSpecimen({root,brand},'fresh-routine','home','2026-10-08.4');await page.setContent(suiteHtml,{waitUntil:'domcontentloaded'});
  const suite=JSON.parse(await page.evaluate(()=>{const d=(globalThis as any).document,img=d.querySelector('.suite-head img'),nav=d.querySelector('.suite-head nav'),brand=d.querySelector('.suite-head .brand');const a=img.getBoundingClientRect(),b=nav.getBoundingClientRect(),c=brand.getBoundingClientRect();return JSON.stringify({hit:!(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1),imgPast:a.right>c.right+1});}));
  assert.equal(suite.hit,false);assert.equal(suite.imgPast,false);
 }finally{await browser.close();}
});

test('seven industry trios preserve 252 independent routes and transfer only selected grammar',()=>{
 const root=site(),brand=ensureBrandContext(root),ids=Object.keys(SEVEN_SITES);
 assert.equal(ids.length,21);assert.doesNotMatch(SEVEN_SCRIPT,/fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
 for(const id of ids){const t=visualTheme(id),s=SEVEN_SITES[id]!;assert.equal(t.release,SEVEN_RELEASE);assert.equal(t.neighbors!.length,2);assert.equal(manifestPages(t).length,12);assert.equal(new Set(s.pages.map(p=>p.contentIdentity)).size,12);
  const links=fullSiteLinks({root,brand},t);
  for(const p of s.pages){assert.ok(links[p.pageId]!.endsWith(p.path));const html=fullSiteByUrl([{root,brand}],VISUAL_THEMES,links[p.pageId]!);assert.ok(html);assert.match(html!,new RegExp('data-page-id="'+p.pageId+'"'));assert.equal((html!.match(/<h1[\s>]/g)||[]).length,1);}
  assert.equal(fullSiteByUrl([{root,brand}],VISUAL_THEMES,links.home+'unknown'),undefined);
  const before=themeHash(t),b=bindTheme(t,brand);assert.equal(themeHash(t),before);assert.equal(b.tokens.fontDisplay,t.tokens.fontDisplay);assert.ok(b.guide.includes(t.fontAssets![0]!.family));assert.ok(Object.values(t.semantic!.authoredLayout).every(r=>Array.isArray(r)&&r.length>0));assert.doesNotMatch(b.guide,/<html|<form|data-seven-wizard/);if(s.business!==s.name)assert.ok(!b.guide.includes(s.business));assert.ok(b.guide.includes('Independently author'));
  const other={...brand,colors:[{value:'#fca931',source:'test',confidence:'explicit' as const}],fallback:false};assert.notEqual(previewResource({root,brand},t,'home','desktop').id,previewResource({root,brand:other},t,'home','desktop').id);
 }
 const note='  Keep the reading rhythm.\nAvoid borrowed facts. 🌿  ';submitSelection(root,selectionDraft(root,'medical-continuum',note,'test-simulation'));const context=selectedThemeContext(root);assert.ok(context.includes(JSON.stringify(note)));assert.match(context,/Continuum/);assert.doesNotMatch(context,/Corner Standard|Maple Street Primary Care/);
});

test('industry row controls use page identities, become visible and release preview focus',async()=>{
 const root=site(),{server,url}=await startThemeReviewServer({sites:[{root,test:true}]});
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:900}});
 try{
  await page.goto(url+'?query=Movement+Clinic');const card=page.locator('[data-theme="medical-movement-clinic"]');
  for(const [id,label] of [['home','Everyday Motion'],['sports','Sports medicine'],['first','Your first appointment']]){
   const button=card.getByRole('button',{name:'Scroll Movement Clinic '+label,exact:true});await button.click();await card.locator('.preview[data-ready="true"]').waitFor();
   assert.equal(await page.frameLocator('[data-theme="medical-movement-clinic"] iframe').locator('body').getAttribute('data-page-id'),id);
   const box=await card.locator('.preview').boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=900);
   assert.ok(await page.locator('iframe').count()<=1);await card.getByRole('button',{name:'Return to gallery',exact:true}).click();
   assert.equal(await card.locator('.preview').isVisible(),false);assert.equal(await button.evaluate(e=>e===(globalThis as any).document.activeElement),true);
  }
  await card.getByRole('button',{name:'Explore Movement Clinic Sports medicine',exact:true}).click();await page.locator('#canvas[data-ready="true"]').waitFor();assert.equal(await page.locator('#detailpage').inputValue(),'sports');assert.equal(await page.locator('#detailpage option').count(),12);assert.ok(await page.locator('#detailpage optgroup').count()>1);
 }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
});

test('ridgeline adds nineteen pages and keeps the previous catalog lookup',()=>{
 assert.equal(visualTheme('legal-record-counsel','2026-10-09.5').release,'2026-10-09.5');assert.equal(SEVEN_RELEASE,'2026-10-09.2');
 const ridge=visualTheme('construction-ridgeline-exteriors','2026-10-09.3');
 assert.equal(ridge.release,'2026-10-09.3');assert.equal(manifestPages(ridge).length,19);
 assert.deepEqual(manifestPages(ridge).filter(p=>p.featured).map(p=>p.pageId),['home','services','roofing','about','contact']);
 assert.throws(()=>visualTheme('construction-ridgeline-exteriors',SEVEN_RELEASE));
 for(const theme of VISUAL_THEMES){if(![SUITE_RELEASE,'2026-10-09.1',SEVEN_RELEASE].includes(theme.release))continue;assert.equal(themeHash(visualTheme(theme.id,SEVEN_RELEASE)),themeHash(theme));}
 assert.equal(VISUAL_THEMES.filter(t=>t.release===SEVEN_RELEASE).length,21);
});

test('Alongside has twelve exact routes and preserves every pre-existing release identity',async()=>{
 const theme=visualTheme('medical-alongside','2026-10-09.4');
 const pages=manifestPages(theme);
 assert.equal(theme.release,'2026-10-09.4');
 assert.equal(pages.length,12);
 assert.deepEqual(pages.filter(p=>p.featured).map(p=>p.pageId),['home','services','service-detail','about','contact']);
 assert.deepEqual(pages.map(p=>p.path),['/','/services','/services/occupational-health','/about','/contact','/faqs','/community','/team/dr-morgan-ellis','/team/jamie-reed','/privacy','/website-terms','/appointment-policies']);
 const previous=JSON.parse(readFileSync(join(kernel,'src/test/fixtures/theme-pre-alongside-identities.json'),'utf8'));
 for(const old of previous.themes)assert.equal(themeHash(visualTheme(old.id,previous.release)),old.hash,old.id);
 for(const [release,list] of Object.entries(previous.catalogs)){
  assert.throws(()=>visualTheme(theme.id,release));
  for(const old of list as Array<{id:string;hash:string}>)assert.equal(themeHash(visualTheme(old.id,release)),old.hash,release+'/'+old.id);
 }
 const root=site(),brand=ensureBrandContext(root);
 for(const p of pages){const html=await(await fetch(fullSiteLinks({root,brand},theme)[p.pageId]!)).text();assert.equal((html.match(/<h1[\s>]/g)||[]).length,1);assert.match(html,/<footer>/);assert.ok(html.includes('data-page-id="'+p.pageId+'"'));}
 assert.throws(()=>renderSpecimen({root,brand},theme.id,'missing-page'));
 const metadata=BROWSE_METADATA[theme.id]!;assert.equal(metadata.industry,"Doctor's offices");assert.equal(metadata.media,'photo-led');
 // Ridgeline used the 4.5 action/background companion while .3 was active; retain it after the catalog moves.
 const ridge=visualTheme('construction-ridgeline-exteriors','2026-10-09.3');
 const bright={...brand,colors:[{value:'#ffff00',source:'test',confidence:'explicit' as const}],fallback:false};
 const bound=bindTheme(ridge,bright);assert.ok(contrast(bound.tokens.colorAccent,bound.tokens.colorBg)>=4.5);
});

test('Record Counsel has twenty-five routes and preserves the complete former catalog',async()=>{
 const previous=JSON.parse(readFileSync(join(kernel,'src/test/fixtures/theme-pre-record-counsel-identities.json'),'utf8'));
 const theme=visualTheme('legal-record-counsel','2026-10-09.5'),pages=manifestPages(theme);
 assert.equal(RECORD_CATALOG.length,previous.count+1);assert.equal(RECORD_CATALOG.reduce((n,t)=>n+manifestPages(t).length,0),previous.pages+25);
 assert.equal(theme.release,'2026-10-09.5');assert.equal(pages.length,25);assert.equal(new Set(pages.map(p=>p.path)).size,25);
 assert.deepEqual(pages.filter(p=>p.featured).sort((a,b)=>a.previewPriority-b.previewPriority).map(p=>p.pageId),['home','services','service-detail','about','contact']);
 assert.deepEqual(pages.map(p=>p.path),['/','/services','/services/business-agreements','/services/commercial-disputes','/services/compliance-investigations','/services/intellectual-property','/services/restructuring','/about','/case-studies','/case-studies/supplier-dispute','/case-studies/product-license','/case-studies/studio-rights','/case-studies/creditor-workout','/case-studies/internal-review','/case-studies/business-acquisition','/journal','/journal/engagement-scope','/journal/communication-plan','/journal/transaction-readiness','/journal/dispute-chronology','/journal/adviser-coordination','/journal/regulatory-conversation','/contact','/privacy','/website-terms']);
 for(const old of previous.themes){const current=visualTheme(old.id,previous.release);assert.equal(themeHash(current),old.hash,old.id);assert.deepEqual(current.neighbors,old.neighbors);assert.deepEqual((cloudEntry(old.id,old.release)?.browse||(old.id==="construction-ridgeline-exteriors"?RIDGELINE_BROWSE[old.id]:BROWSE_METADATA[old.id])),old.browse);}
 for(const [release,list]of Object.entries(previous.releases)){assert.throws(()=>visualTheme(theme.id,release));for(const old of list as Array<{id:string;hash:string}>)assert.equal(themeHash(visualTheme(old.id,release)),old.hash,release+'/'+old.id);}
 const root=site(),brand=ensureBrandContext(root);for(const p of pages){const html=await(await fetch(fullSiteLinks({root,brand},theme)[p.pageId]!)).text();assert.equal((html.match(/<h1[\s>]/g)||[]).length,1);assert.match(html,/<footer>/);assert.ok(html.includes('data-page-id="'+p.pageId+'"'));}
 assert.throws(()=>renderSpecimen({root,brand},theme.id,'not-a-page'));
 assert.equal(BROWSE_METADATA[theme.id]!.industry,'Law firms');assert.equal(BROWSE_METADATA[theme.id]!.media,'photo-led');
 const bright={...brand,colors:[{value:'#ffff00',source:'test',confidence:'explicit' as const}],fallback:false};const preserved=bindTheme(visualTheme('medical-alongside','2026-10-09.4'),bright);assert.ok(contrast(preserved.tokens.colorAccent,preserved.tokens.colorBg)>=4.5);
});

// Release regression: the actual default never requires excluded archive media.
test('public default picker contains only hosted templates and missing archive assets fail cleanly',async()=>{
 const root=site(),html=renderHostedPicker([{root,brand:ensureBrandContext(root)}]);
 const models=JSON.parse(html.match(/const models=(\[[\s\S]+?\]),session=/)![1]!);
 assert.deepEqual(models[0].themes.map((t:{id:string})=>t.id),HOSTED_PICKER_THEMES.map(t=>t.id));
 assert.equal(models[0].archiveThemes.length,0);
 assert.ok(models[0].themes.length>0);
 const {server,url}=await startHostedPickerServer({sites:[{root,test:true}],port:0});
 try{const response=await fetch(url+'theme-assets/'+THEME_ASSETS.assets.find(a=>a.id==='oswald')!.sha256+'/oswald.ttf');assert.equal(response.status,404);assert.match(((await response.json()) as {error:string}).error,/Archived asset/);assert.equal((await fetch(url)).status,200);}finally{await new Promise<void>(done=>server.close(()=>done()));}
});
