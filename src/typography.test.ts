import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultTheme } from './types.ts';
import type { ThemeTokens } from './types.ts';
import { themeCss } from './theme.ts';
import { siteCss } from './compile/site.ts';
import { buildSite } from './build/index.ts';
import { DEFAULT_TYPE_ROLES, validateTypography } from './typography.ts';
import { captureTypography, captureTypographyStates, typographyEvidenceFailures } from './agent/browser-typography.ts';
import { typographyDirectionFailures, typographyPolicy } from './agent/typography-policy.ts';
import { verifyTemplateTypography } from './agent/template-typography.ts';
import { spawnSync } from 'node:child_process';
import { evaluateV2 } from './agent/evaluate.ts';
const policy = {version:1 as const};
const theme: ThemeTokens = {...defaultTheme, typography:{roles:DEFAULT_TYPE_ROLES}};
const html = (body: string, css = '', tokens = theme) => `<!doctype html><html><head><meta charset="utf-8"><style>${themeCss(tokens,policy)}${siteCss([],{}, {name:'Type test',typography:policy})}${css}</style></head><body>${body}</body></html>`;

test('shared typography is explicit for new sites; legacy CSS and preservation retain historical defaults', async () => {
  const scaffold=JSON.parse(readFileSync('templates/site/site.json','utf8'));
  const tokens=JSON.parse(readFileSync('templates/site/theme/defaults.json','utf8'));
  assert.deepEqual(scaffold.typography,policy);
  assert.deepEqual(validateTypography(tokens.typography,true),[]);
  assert.doesNotMatch(themeCss(defaultTheme),/--type-body-size/);
  assert.doesNotMatch(siteCss([],{}),/data-type-role/);
  assert.match(themeCss(theme,policy),/--type-body-size: 1.125rem/);
  const out=mkdtempSync(join(tmpdir(),'vitris-type-build-'));
  await buildSite({site:{name:'New site',typography:policy},theme,pages:[{path:'/',file:'index.html',title:'Home',body:'<h1>Home</h1><h3>Service</h3>'}],catalog:{},outDir:out});
  const document=readFileSync(join(out,'index.html'),'utf8');
  const asset=document.match(/href="(\/assets\/immutable\/[^" ]+\.css)"/)![1]!;
  assert.match(readFileSync(join(out,asset.slice(1)),'utf8'),/data-type-role="subheading"/);
  assert.match(readFileSync(join(out,'theme.css'),'utf8'),/--type-ui-size: 1rem/);
  const historical=mkdtempSync(join(tmpdir(),'vitris-type-legacy-'));
  writeFileSync(join(historical,'site.json'),'{}');
  assert.equal(typographyPolicy(historical).enabled,false);
  assert.deepEqual(typographyDirectionFailures(historical),[]);
  mkdirSync(join(historical,'theme'));
  writeFileSync(join(historical,'site.json'),JSON.stringify({typography:policy}));
  writeFileSync(join(historical,'theme/defaults.json'),'{}');
  assert.match(typographyDirectionFailures(historical).join('\n'),/shared roles/);
  writeFileSync(join(historical,'theme/defaults.json'),JSON.stringify(tokens));
  assert.deepEqual(typographyDirectionFailures(historical),[]);
});

test('role and variant declarations reject malformed CSS, unknown roles and unjustified exceptions', () => {
  assert.match(validateTypography({roles:{body:{size:'12px; color:red'}}}).join(' '),/Invalid typography/);
  assert.match(validateTypography({roles:{body:{weight:'bold'}}}).join(' '),/weight/);
  assert.match(validateTypography({roles:{unknown:{}}}).join(' '),/Unknown typography role/);
  assert.match(validateTypography({roles:{},variants:{feature:{role:'subheading',size:'2rem'}}}).join(' '),/reason/);
});

test('readable defaults, all heading levels, emphasis and relative user sizing agree with rendered roles', async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    for(const width of [375,1080]) {
      await page.setViewportSize({width,height:900});
      await page.setContent(html('<h1>Home</h1><h2>Section</h2><h3>Service one</h3><h3>Service two</h3><h4>Card</h4><h5>Group</h5><h6>Small group</h6><p>Body with <strong>emphasis</strong> and <em>italics</em>.</p><small>Caption <sup>2</sup></small><nav><a href="#main">Services</a></nav><label>Name <input placeholder="Your name"></label><button>Continue</button>'));
      const capture=await captureTypography(page,theme,'/',width,'resting');
      assert.deepEqual(capture.failures,[]);
      assert.equal(capture.observations.find(o=>o.text.startsWith('Body with'))?.size,18);
      assert.equal(capture.observations.find(o=>o.text==='Continue')?.size,16);
      assert.equal(capture.observations.find(o=>o.text==='Caption')?.size,14);
      const headings=capture.observations.filter(o=>o.role==='subheading');
      assert.equal(headings[0]!.size,headings[1]!.size);
      assert(headings[0]!.size>=24&&headings[0]!.size<=32);
    }
    await page.setContent(html('<h3>Service</h3><p>Body</p>','html{font-size:20px}'));
    const larger=await captureTypography(page,theme,'/',1080,'larger-user-root');
    assert.deepEqual(larger.failures,[]);
    assert.equal(larger.observations.find(o=>o.text==='Body')?.size,22.5);
  } finally {await browser.close();}
});

test('rendered checks catch heading drift, weight drift, tiny text, SVG scaling, generated text and placeholders', async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:375,height:900}});
    await page.setContent(html('<h3>Drifted heading</h3><p class="tiny">Caption masquerading as body</p><div style="transform:scale(.5)"><button>Scaled action</button></div><p class="generated">Readable body</p><input placeholder="Tiny placeholder"><svg width="100" height="50" viewBox="0 0 200 100"><text x="0" y="20">Scaled diagram</text></svg>', 'h3{font-size:35px;font-weight:300}.tiny{font-size:11px}.generated::before{content:"Important note";font-size:9px}input::placeholder{font-size:10px}'));
    const capture=await captureTypography(page,theme,'/drift',375,'resting');
    assert.match(capture.failures.join('\n'),/subheading size is 35/);
    assert.match(capture.failures.join('\n'),/subheading weight is 300/);
    assert.match(capture.failures.join('\n'),/rendered 11.00px is below 12px/);
    assert.match(capture.failures.join('\n'),/rendered 8.00px is below 12px: Scaled action/);
    assert.match(capture.failures.join('\n'),/::before: rendered 9.00px/);
    assert.match(capture.failures.join('\n'),/::placeholder: rendered 10.00px/);
    assert.match(capture.failures.join('\n'),/below 12px: Scaled diagram/);
  } finally {await browser.close();}
});

test('named variants are reusable and enforced; undisclosed and incompatible variants fail', async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const tokens={...theme,typography:{roles:DEFAULT_TYPE_ROLES,variants:{feature:{role:'subheading' as const,reason:'Lead case study',size:'2.5rem',weight:400}}}};
    await page.setContent(html('<h3 data-type-variant="feature">Lead case</h3><h3>Ordinary service</h3><h2 data-type-role="subheading" data-type-variant="feature">Variant with role override</h2>','',tokens));
    assert.deepEqual((await captureTypography(page,tokens,'/',1080,'resting')).failures,[]);
    await page.setContent(html('<h2 data-type-variant="feature">Wrong role</h2><h3 data-type-variant="unknown">Unknown</h3>','',tokens));
    assert.match((await captureTypography(page,tokens,'/',1080,'resting')).failures.join(' '),/incompatible type role/);
  } finally {await browser.close();}
});

test('menus, native disclosures and tabs expose hidden undersized text to the checker', async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent(html(`<h1>Home</h1><details><summary>More information</summary><p style="font-size:10px">Hidden details</p></details><button aria-expanded="false" aria-controls="menu" onclick="const menu=document.getElementById('menu');menu.hidden=!menu.hidden;this.setAttribute('aria-expanded',String(!menu.hidden))">Menu</button><nav id="menu" hidden><a href="#main" style="font-size:9px">Hidden menu text</a></nav><button role="tab" aria-selected="true" onclick="document.getElementById('panel').hidden=true">First</button><button role="tab" onclick="document.getElementById('panel').hidden=false">Second</button><section id="panel" hidden><p style="font-size:11px">Hidden tab text</p></section>`));
    const captures=await captureTypographyStates(page,theme,'/',375);
    assert(!captures[0]!.failures.some(f=>/Hidden details|Hidden menu text|Hidden tab text/.test(f)));
    assert(captures.some(c=>c.state.startsWith('detail-')&&c.failures.some(f=>f.includes('Hidden details'))));
    assert(captures.some(c=>c.state.startsWith('disclosure-')&&c.failures.some(f=>f.includes('Hidden menu text'))));
    assert(captures.some(c=>c.state.startsWith('tab-')&&c.failures.some(f=>f.includes('Hidden tab text'))));
    assert.equal(await page.locator('details').getAttribute('open'),null);
    assert.equal(await page.locator('[aria-controls="menu"]').getAttribute('aria-expanded'),'false');
  } finally {await browser.close();}
});

test('saved acceptance requires both viewport captures on every route, including an added interior', async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();const captures=[];
    for(const path of ['/','/extra'])for(const width of [375,1080]) {
      await page.setViewportSize({width,height:900});await page.setContent(html('<h1>Page</h1><h3>Service</h3>'));
      captures.push(await captureTypography(page,theme,path,width,'resting'));
    }
    const report={scenario:captures[0]!.scenario,captures,failures:[]};
    assert.deepEqual(typographyEvidenceFailures(report,['/','/extra']),[]);
    assert.match(typographyEvidenceFailures({...report,captures:captures.filter(c=>c.path==='/')},['/','/extra']).join(' '),/Missing typography coverage: \/extra/);
    assert.match(typographyEvidenceFailures(undefined,['/']).join(' '),/Missing current/);
    captures[0]!.observations[0]!.renderedSize=9;
    assert.match(typographyEvidenceFailures(report,['/']).join(' '),/Undersized typography evidence/);
  } finally {await browser.close();}
});

test('template publication checks every original and branded route, not only featured pages', async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const documents=[{path:'/',original:html('<h1>Home</h1>'),brand:html('<h1>Brand home</h1>')},{path:'/interior',original:html('<h1>Interior</h1><h3>Service</h3>'),brand:html('<h1>Brand interior</h1><h3>Service</h3>')}];
    assert.equal((await verifyTemplateTypography(browser,theme,documents)).length,8);
    documents[1]!.brand=html('<h1>Brand interior</h1><p style="font-size:10px">Tiny interior text</p>');
    await assert.rejects(verifyTemplateTypography(browser,theme,documents),/brand \/interior.*below 12px/s);
    await assert.rejects(verifyTemplateTypography(browser,defaultTheme,documents),/shared roles/);
  } finally {await browser.close();}
});

test('kernel helpers and explicit role overrides conform without page-specific repairs',async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent(html(`<a class="skip-link" href="#main">Skip to content</a><a class="brand">Brand</a><nav class="nav-links"><a href="#main">Services</a></nav><p class="eyebrow">Label</p><p class="lede">Lead</p><p class="lede lede--lg">Large lead</p><div class="card__body"><h3>Card heading</h3><h4>Card subheading</h4><p>Card copy</p></div><h3 data-type-role="display">Display role on an H3</h3><div class="stat stat--sm"><span class="stat__value">12</span><span class="stat__label">Projects</span></div><div class="price"><span class="price__amount">100</span><span class="price__period">Monthly</span></div><blockquote class="quote quote--lg">Quote<cite>Person</cite></blockquote><p class="byline"><strong>Person</strong><span>Role</span></p><p class="announcement">Notice <a href="#main">Read more</a></p><fieldset class="chips"><legend>Options</legend><label><input type="checkbox"><span>One</span></label></fieldset><details class="accordion"><summary>Question</summary><p>Answer</p></details><p class="c-cookie-banner__title">Cookies</p><p class="c-cookie-banner__text">Cookie explanation</p><a class="c-cookie-banner__more">Learn more</a>`));
    assert.deepEqual((await captureTypography(page,theme,'/',1080,'resting')).failures,[]);
  }finally{await browser.close();}
});

test('browser CLI and saved workflow gate check an unplanned authored route and block its typography regression',()=>{
  const root=mkdtempSync(join(tmpdir(),'vitris-type-cli-'));
  for(const directory of ['pages','theme','components','onboarding'])mkdirSync(join(root,directory));
  writeFileSync(join(root,'site.json'),JSON.stringify({name:'Typography integration',typography:policy}));
  writeFileSync(join(root,'launch.json'),JSON.stringify({backendOrigin:'',performance:{enabled:false}}));
  writeFileSync(join(root,'theme/defaults.json'),JSON.stringify(theme));
  writeFileSync(join(root,'pages/index.html'),'<h1>Home</h1><h3>Service</h3><p>Readable copy.</p>');
  writeFileSync(join(root,'pages/extra.html'),'<h1>Extra</h1><h3>Service</h3><p>Readable interior.</p>');
  writeFileSync(join(root,'onboarding/storyboard.json'),JSON.stringify({version:2,pages:[{path:'/',representative:true,purpose:'Home',sections:[]}]}));
  const run=()=>spawnSync(process.execPath,['--experimental-strip-types','scripts/verify-browser.ts','--site',root,'--motion','reduce'],{encoding:'utf8',timeout:120000});
  const valid=run();assert.equal(valid.status,0,valid.stdout+'\n'+valid.stderr);
  const report=JSON.parse(readFileSync(join(root,'agent/reviews/browser.json'),'utf8'));
  assert(report.typography.captures.some((c:any)=>c.path==='/extra'&&c.width===375));
  assert.equal(evaluateV2(root,'browser').ok,true,JSON.stringify(evaluateV2(root,'browser')));
  writeFileSync(join(root,'pages/extra.html'),'<h1>Extra</h1><h3 style="font-size:17px;font-weight:300">Service</h3>');
  const invalid=run();assert.equal(invalid.status,1,invalid.stdout+'\n'+invalid.stderr);
  assert.match(invalid.stdout,/Typography: \/extra.*subheading size is 17/s);
  assert.equal(evaluateV2(root,'browser').ok,false);
});
