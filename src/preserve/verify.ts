import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { json, save, within } from "../agent/artifacts.ts";
import { previewServer } from "../build/serve.ts";
import { artifactManifest } from "../knowledge/artifact.ts";
import { sourceRevision } from "../engine/revision.ts";
import { preserveConfig, PRESERVE_HEIGHT, PRESERVE_WIDTHS, unresolvedCaptureBlockers, type PreserveManifest } from "./config.ts";
import { settle,legacyReactState } from "./capture.ts";
import {iframeSources,readOnlyEmbedProvider,isReadOnlyEmbedRequest,approvedEmbedUrl,providerConsoleWarning,cancelledReviewTelemetry} from './embeds.ts';
import {staticLegacyComponents,unsupportedApplicationScripts,repairedExternalNavigation,disabledLegacyServices} from './components.ts';
import {reactCapabilities} from './react-capabilities.ts';
import {preserveManifest} from './supplement.ts';
import {originalMissingAnchors,originalNullImages} from './source-defects.ts';

export type PreserveCheck = { path: string; width: number; changedPixelRatio: number; dimensionsMatch: boolean; screenshot: string; failures: string[] };
export type PreserveReport = { version: 1; ok: boolean; sourceRevision: string; artifactDigest: string; checkedAt: string; remoteUrl?: string; checks: PreserveCheck[]; failures: string[]; warnings: string[]; assetChecks?: Array<{file:string;ok:boolean;error?:string}> };

/** Compare decoded pixels in Chromium without depending on a private PNG library. */
async function compare(page: Page, before: Buffer, after: Buffer): Promise<{ changedPixelRatio: number; dimensionsMatch: boolean }> {
  return await page.evaluate(async ({before, after}) => {
    const { Image, document } = globalThis as any;
    const read = async (data: string) => { const i = new Image(); i.src = 'data:image/png;base64,' + data; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i,0,0); return {w:i.width,h:i.height,data:x.getImageData(0,0,i.width,i.height).data}; };
    const a = await read(before), b = await read(after);
    if (a.w !== b.w || a.h !== b.h) return {dimensionsMatch:false,changedPixelRatio:1};
    let changed = 0;
    for (let i=0;i<a.data.length;i+=4) if (Math.max(...[0,1,2].map(c=>Math.abs(a.data[i+c]-b.data[i+c]))) > 24) changed++;
    return {dimensionsMatch:true,changedPixelRatio:changed/(a.w*a.h)};
  }, { before: Buffer.from(before).toString("base64"), after: Buffer.from(after).toString("base64") });
}

async function interactions(page: Page, backend?: string): Promise<string[]> {
  const failures: string[] = [];
  for(const panel of await page.locator('[data-preserve-product-states]').all()){
    const states=JSON.parse((await panel.getAttribute('data-preserve-product-states'))!);
    for(const state of states){
      for(let i=0;i<state.values.length;i++)await panel.locator('select').nth(i).selectOption(state.values[i]);
      const actual=await panel.locator('select').evaluateAll((els:any[],length:number)=>els.slice(0,length).map(el=>el.value),state.values.length);
      if(JSON.stringify(actual)!==JSON.stringify(state.values))failures.push('Product variant selection differs from the captured original');
      if(state.html.includes('data-preserve-disabled-action')){
        const action=panel.locator('[data-preserve-disabled-action]');if(!await action.count())failures.push('Product purchase control missing after selection');
        else{await action.click();if(!await page.getByText('This preview cannot place orders or accept payments. Please use the listed contact details.',{exact:true}).first().isVisible())failures.push('Product purchase was not explicitly disabled');}
      }
    }
  }
  for(const carousel of await page.locator('.carousel[data-preserve-carousel]').all()){
    const dots=carousel.locator('.carousel__dot'),slides=carousel.locator('.carousel__slide');
    for(let i=0;i<await dots.count();i++)if(await dots.nth(i).isVisible()){
      if(!await dots.nth(i).isDisabled())await dots.nth(i).click();
      if(await slides.nth(i).getAttribute('aria-selected')!=='true')failures.push('Product carousel did not select the requested image');
    }
    const slider=carousel.locator('.carousel__slider');await slider.focus();await page.keyboard.press('ArrowRight');
    if(await carousel.locator('.carousel__slide[aria-selected="true"]').count()!==1)failures.push('Product carousel did not select exactly one image');
  }
  for(const action of await page.locator('[data-preserve-disabled-action]').all())if(await action.isVisible()&&await action.evaluate((el:any)=>(globalThis as any).getComputedStyle(el).pointerEvents!=='none')){
    await action.click();const booking=await action.getAttribute('data-preserve-disabled-action')==='booking';
    const hasCalendar=await action.evaluate((el:any)=>!!el.closest('[data-preserve-disabled-booking]')?.querySelector('#days-container'));
    const text=booking?(hasCalendar?'This preview cannot book appointments. Calendar availability is a captured snapshot. Please use the listed contact details.':'This preview cannot book appointments. Please use the listed contact details.'):'This preview cannot place orders or accept payments. Please use the listed contact details.';
    const visible=await page.getByText(text,{exact:true}).first().isVisible();
    const previousSafeNotice=booking&&!hasCalendar&&await page.getByText('This preview cannot book appointments. Calendar availability is a captured snapshot. Please use the listed contact details.',{exact:true}).first().isVisible();
    if(!visible&&!previousSafeNotice)failures.push('Disabled transaction notice missing');
  }
  const hoverButtons=page.locator('[data-preserve-hover]');
  for(let i=0;i<await hoverButtons.count();i++){
    const button=hoverButtons.nth(i);if(!await button.isVisible())continue;
    const before=await button.getAttribute('style'),expected=JSON.parse((await button.getAttribute('data-preserve-hover'))!);
    await button.hover();await page.waitForTimeout(250);
    const actual=await button.evaluate((el:any)=>{const s=(globalThis as any).getComputedStyle(el);return {color:s.color,'background-color':s.backgroundColor,'border-color':s.borderColor};});
    if(Object.entries(expected).some(([k,v])=>actual[k as keyof typeof actual]!==v))failures.push('Button hover colors differ from the measured original');
    await page.mouse.move(-10,-10);await page.waitForTimeout(250);
    if(await button.getAttribute('style')!==before)failures.push('Button hover did not restore its resting style');
  }
  const dropdowns=async()=>{
    const toggles=page.locator('.dropdown-toggle');
    for(let i=0;i<await toggles.count();i++){
      const toggle=toggles.nth(i);if(!await toggle.isVisible())continue;
      const menu=toggle.locator('..').locator('.dropdown-menu').first();
      if(!await menu.count()){failures.push('Dropdown menu missing');continue;}
      await toggle.click();if(!await menu.isVisible()||await toggle.getAttribute('aria-expanded')!=='true')failures.push('Dropdown did not open');
      await toggle.click();if(await menu.isVisible())failures.push('Dropdown did not close');
    }
  };
  const toggles = page.locator('[data-toggle="collapse"]');
  for (let i = 0; i < await toggles.count(); i++) {
    const toggle = toggles.nth(i); if (!await toggle.isVisible()) continue;
    const id = await toggle.getAttribute("data-target") || await toggle.getAttribute('href');
    if (!id?.startsWith("#")) { failures.push("Menu target missing"); continue; }
    const initiallyOpen=await page.locator(id).evaluate((el:any)=>el.classList.contains('show'));
    await toggle.click();
    if (await page.locator(id).isVisible()===initiallyOpen || await toggle.getAttribute("aria-expanded") !== String(!initiallyOpen)) failures.push("Collapse state did not change");
    const group=await toggle.getAttribute('data-parent')||await page.locator(id).getAttribute('data-parent');
    if(!initiallyOpen&&group?.startsWith('#')){
      const openCount=await page.evaluate((selector:string)=>{const {document}=globalThis as any;const parent=document.getElementById(selector.slice(1));if(!parent)return 0;const ids=new Set([...parent.querySelectorAll('[data-toggle="collapse"]')].filter((el:any)=>el.getAttribute('data-parent')===selector).map((el:any)=>(el.getAttribute('data-target')||el.getAttribute('href')||'').slice(1)));return [...ids].filter(id=>document.getElementById(id)?.classList.contains('show')).length;},group);
      if(openCount>1)failures.push('Accordion siblings remained open');
    }
    if(!initiallyOpen)await dropdowns();
    await toggle.click();
  }
  await dropdowns();
  for(const service of await page.locator('services-general[data-preserve-service-cards]').all()){
    const select=service.locator('[data-vitrisid="servicesPerPage"]');
    if(await select.isVisible()){
      const initial=await select.inputValue(),cards=JSON.parse((await service.getAttribute('data-preserve-service-cards'))!);
      await select.selectOption({label:'30'});
      if(await service.locator('[data-preserve-service-grid] .card').count()!==Math.min(30,cards.length))failures.push('Local service page does not contain all captured cards');
      for(const button of await service.locator('[data-preserve-service-grid] [data-preserve-hover]').all())if(await button.isVisible()){
        const expected=JSON.parse((await button.getAttribute('data-preserve-hover'))!),before=await button.getAttribute('style');await button.hover();await page.waitForTimeout(250);
        const actual=await button.evaluate((el:any)=>{const s=(globalThis as any).getComputedStyle(el);return {color:s.color,'background-color':s.backgroundColor,'border-color':s.borderColor};});
        if(Object.entries(expected).some(([k,v])=>actual[k as keyof typeof actual]!==v))failures.push('Paged service button hover differs from the measured original');
        await page.mouse.move(-10,-10);await page.waitForTimeout(250);if(await button.getAttribute('style')!==before)failures.push('Paged service hover did not restore its resting style');
      }
      await select.selectOption(initial);
      const right=service.locator('[data-vitrisid="servicesRightArrow"]');
      if(cards.length>Number(initial)&&await right.isVisible()){
        const before=await service.locator('[data-preserve-service-grid]').innerText();await right.click();
        if(await service.locator('[data-preserve-service-grid]').innerText()===before)failures.push('Local service pagination did not advance');
        await service.locator('[data-vitrisid="servicesLeftArrow"]').click();
        if(await service.locator('[data-preserve-service-grid]').innerText()!==before)failures.push('Local service pagination did not restore its first page');
      }
    }
  }
  const galleries = page.locator('[data-toggle="modal"]');
  for (let i = 0; i < await galleries.count(); i++) {
    const trigger = galleries.nth(i); if (!await trigger.isVisible()) continue;
    const id = await trigger.getAttribute("data-target");
    if (!id?.startsWith("#")) { failures.push("Gallery target missing"); continue; }
    await trigger.click();
    if (!await page.locator(id).isVisible()) failures.push(`Gallery did not open: ${id}`);
    if(await trigger.evaluate((el:any)=>!!el.closest('services-general[data-preserve-disabled-booking]'))&&!await page.locator(id).getByText('This preview cannot book appointments. Please use the listed contact details.',{exact:true}).isVisible())failures.push('Legacy booking disabled notice missing');
    await page.keyboard.press("Escape");
    if (await page.locator(id).isVisible()) failures.push(`Gallery did not close: ${id}`);
  }
  // No real customer submissions: exercise the preview notice or mock our own service.
  if (backend) {
    await page.route(url=>url.origin===backend && url.pathname==='/api/leads', route => route.fulfill({ status: 201, contentType: "application/json", headers:{'access-control-allow-origin':new URL(page.url()).origin}, body: '{"ok":true,"mode":"test"}' }));
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.fulfill({contentType:'application/javascript',body:'window.turnstile={render:(el,opts)=>{setTimeout(()=>opts.callback("preservation-mock-token"),0);return "mock"},reset:()=>{}}'}));
  }
  const forms = page.locator("form[data-preserve-forms]");
  for (let i = 0; i < await forms.count(); i++) {
    const form = forms.nth(i);
    if (!await form.isVisible()) continue;
    const fields = form.locator("input:not([type=hidden]), textarea");
    for (let n = 0; n < await fields.count(); n++) {
      const field = fields.nth(n); const type = await field.getAttribute("type");
      if (!await field.isVisible()) continue;
      if (type === 'file') {
        if(await form.getAttribute('data-preserve-disabled-custom-form')!==null&&!await form.getAttribute('data-vitris-form'))await field.setInputFiles({name:'preview.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
        else failures.push('Unsupported form field: file');continue;
      }
      if (type === 'checkbox' || type === 'radio') { await field.check(); continue; }
      await field.fill(type === "email" ? "preview@example.com" : type === "tel" || type === "number" ? "5705550100" : "Preview verification");
    }
    const selects = form.locator('select');
    for (let n=0;n<await selects.count();n++) { const select=selects.nth(n); const option=await select.locator('option').evaluateAll((options:any[])=>options.find(o=>o.value)?.value); if (option) await select.selectOption(option); }
    const send = form.locator('[data-vitrisid="emailSendButton"]');
    if (await send.count()) await send.click(); else await form.evaluate((form: any) => form.requestSubmit());
    try { await page.getByText(await form.getAttribute('data-vitris-form') ? "Test message accepted. No customer email will be sent." : await form.getAttribute('data-preserve-disabled-custom-form')!==null ? 'This preview does not send messages or upload files. Please use the listed contact details.' : "This preview does not send messages. Please use the listed contact details.", { exact: true }).first().waitFor({ timeout: 3000 }); }
    catch { failures.push("Form feedback missing"); }
  }
  return failures;
}

export async function verifyPreservedSite(root: string, opts: { signal?: AbortSignal; onLog?: (line: string) => void; remoteUrl?: string } = {}): Promise<PreserveReport> {
  const manifest = preserveManifest(root);
  const config = preserveConfig(root), dist = join(root, "dist");
  const connected = !!config.backendOrigin && !!config.forms?.length;
  const report: PreserveReport = { version: 1, ok: false, sourceRevision: sourceRevision(root).digest, artifactDigest: artifactManifest(dist).sha256, checkedAt: new Date().toISOString(), remoteUrl: opts.remoteUrl, checks: [], failures: [], warnings: [...manifest.warnings.filter(w => !w.startsWith("Forms are preview-only")), ...(connected ? ["Resting-page fidelity uses unchanged reference captures. Challenge and acceptance responses are mocked here; separate service integration tests are required."] : ["Forms are preview-only; no submissions are sent."])] };
  if (!manifest.pages.length || !manifest.pages.some(p => p.path === "/")) throw new Error("Preservation manifest has no homepage");
  const server = opts.remoteUrl ? undefined : previewServer(dist);
  if (server) await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const origin = opts.remoteUrl ? new URL(opts.remoteUrl).origin : `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
  const browser = await chromium.launch({ headless: true });
  const comparePage = await browser.newPage();
  const abort = () => { void browser.close(); };
  opts.signal?.addEventListener("abort", abort, { once: true });
  try {
  const screenshotDir = opts.remoteUrl ? "artifacts/preserve-remote" : "artifacts/preserve-verification";
  const screenshots = join(root, screenshotDir); mkdirSync(screenshots, { recursive: true });
  const staticComponents=new Map<string,Set<string>>();
  const reactComponents=new Map<string,Set<string>>();
  const scriptedLimitations:string[]=[];
  const repairedNavigation=new Set<string>();
  const authoredPages=manifest.pages.map(p=>readFileSync(within(dist,p.file),'utf8'));
  // Early captures retained screenshot references only. Missing DOM evidence grants no defect exception.
  const originalPages=new Map(manifest.pages.flatMap(p=>{const file=p.references[0]?.file.replace(/-\d+\.png$/,'-rendered.html');return file&&existsSync(within(root,file))?[[p.path,readFileSync(within(root,file),'utf8')] as [string,string]]:[];}));
  const missingSourceAnchors=new Map(manifest.pages.map(p=>[p.path,originalMissingAnchors(originalPages.get(p.path)||'',p.url,originalPages)]));
  const nullImages=originalNullImages(manifest,[...originalPages.values()],authoredPages);
  const resolvedNavigationAssets=new Set(manifest.assets.filter(a=>a.captureError?.startsWith('Asset returned HTML:')&&manifest.pages.some(p=>p.url===a.url)&&!authoredPages.some(html=>html.includes('/'+a.file))).map(a=>a.url));
  nullImages.forEach(url=>{resolvedNavigationAssets.add(url);report.warnings.push(`Original missing image ${url} retains its broken-image rendering using an inert local placeholder. No source photograph was available or invented.`);});
  for(const route of manifest.pages){const reference=route.references[0]?.file.replace(/-\d+\.png$/,'-rendered.html');if(reference&&existsSync(within(root,reference))){const html=readFileSync(within(root,reference),'utf8'),authored=readFileSync(within(dist,route.file),'utf8');staticComponents.set(route.path,staticLegacyComponents(html));if(disabledLegacyServices(html,authored,!!config.previewDisabledTransactions&&!connected))staticComponents.get(route.path)!.add('service-1');reactComponents.set(route.path,reactCapabilities(legacyReactState(html),html,authored,route.path,!!config.previewDisabledTransactions&&!connected));for(const path of repairedExternalNavigation(html,authored,manifest.sourceUrl))repairedNavigation.add(path);scriptedLimitations.push(...unsupportedApplicationScripts(html,manifest.sourceUrl).map(src=>`${route.path}: Unsupported scripted application removed from preview: ${src}`));}}
  for(const path of repairedNavigation)report.warnings.push(`Malformed original external link repaired at ${path}; original copy and layout retained.`);
  for(const route of manifest.pages.filter(p=>p.sourceFailure)){
    const proof=route.sourceFailure!,response=readFileSync(within(root,proof.responseFile));
    if(createHash('sha256').update(response).digest('hex')!==proof.responseSha256)throw Error('Original unavailable-route response changed');
    const valid=originalPages.has(route.path)&&(proof.kind==='http-404'?proof.status===404:proof.kind==='soft-404'&&proof.status===200&&originalPages.get(route.path)!.includes('404 Page Not Found'));
    if(!valid)throw Error('Invalid unavailable-route preservation evidence');
    if((manifest.blockers||[]).some(b=>b.startsWith(route.path+': Source '+(proof.kind==='http-404'?'page failed:':'returned a soft 404:'))))repairedNavigation.add(route.path);
    report.warnings.push(`Original unavailable route ${route.path} retains its captured ${proof.kind} page. The preview returns HTTP 200 for this static error content; missing business content was not invented.`);
  }
  if(config.previewDisabledTransactions)report.warnings.push('Explicitly authorized preview: booking and checkout are disabled. Calendar availability is a capture-time snapshot. Custom forms and file selections remain local and never upload or notify customers.');
    for (const [index, route] of manifest.pages.entries()) for (const width of PRESERVE_WIDTHS) {
      opts.signal?.throwIfAborted(); opts.onLog?.(`Checking ${route.path} at ${width}px`);
      const context = await browser.newContext({ viewport: { width, height: PRESERVE_HEIGHT }, deviceScaleFactor: 1, reducedMotion: "reduce", serviceWorkers: "block" });
      const failures: string[] = [];
      const approvedEmbeds = new Set(iframeSources(readFileSync(within(dist,route.file),'utf8')).map(approvedEmbedUrl).filter((src):src is string=>!!src));
      for (const src of approvedEmbeds) {
        const warning = `Remote ${readOnlyEmbedProvider(src)} embed retained at ${route.path}: ${src}. Provider content, network availability and privacy behavior remain external dependencies.`;
        if (!report.warnings.includes(warning)) report.warnings.push(warning);
      }
      await context.route("**/*", request => {
        const url = request.request().url();
        const target = new URL(url);
        const formsBackend = connected && target.origin === config.backendOrigin && target.pathname === '/api/leads';
        const challenge = connected && target.origin === 'https://challenges.cloudflare.com' && (target.pathname === '/turnstile/v0/api.js' || target.pathname.startsWith('/cdn-cgi/challenge-platform/'));
        const embed = isReadOnlyEmbedRequest(request.request(), approvedEmbeds);
        if (embed && /(^|\.)vitris\.io$/.test(target.hostname) && /api|service|analytics/.test(target.pathname)) { failures.push(`Legacy service in embed: ${url}`); return request.abort(); }
        if (target.origin !== origin && !url.startsWith("data:") && !formsBackend && !challenge && !embed) { failures.push(`External dependency: ${url}`); return request.abort(); }
        return request.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", error => failures.push(error.message));
      page.on('console', message => { if (message.type() === 'error') {
        if(providerConsoleWarning(message.text(),message.location().url,approvedEmbeds)){const warning='YouTube provider attempted compute-pressure telemetry; the browser denied this permission. Playback and the original frame permissions remain unchanged.';if(!report.warnings.includes(warning))report.warnings.push(warning);}
        else failures.push(`Browser console: ${message.text()}`);
      } });
      page.on('requestfailed', request => {
        if(cancelledReviewTelemetry(request,request.failure()?.errorText,approvedEmbeds)){const warning='MassageBook reviews provider conversion telemetry was cancelled by the browser. The external provider retains its own privacy behavior; review assets and functional requests still pass strict browser and visual checks.';if(!report.warnings.includes(warning))report.warnings.push(warning);}
        else failures.push(`Resource failed: ${request.url()}: ${request.failure()?.errorText}`);
      });
      page.on("response", response => { if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`); });
      const response = await page.goto(origin + route.path, { waitUntil: "load" });
      if (!response?.ok()) failures.push(`Route failed: ${route.path}`);
      if (opts.remoteUrl && response) {
        const headers = response.headers();
        if (!/noindex/i.test(headers['x-robots-tag'] || '')) failures.push('Hosted noindex header missing');
        if (!(headers['content-security-policy'] || '').includes("default-src 'self'")) failures.push('Hosted preservation CSP missing');
      }
      await settle(page);
      const screenshot = `${screenshotDir}/${index}-${width}.png`;
      const actual = await page.screenshot({ fullPage: true, animations: "disabled", path: join(root, screenshot) });
      const reference = route.references.find(r => r.width === width);
      if (!reference) throw new Error(`Missing ${width}px reference for ${route.path}`);
      const bytes = readFileSync(within(root, reference.file));
      if (createHash("sha256").update(bytes).digest("hex") !== reference.sha256) throw new Error(`Reference capture changed: ${reference.file}`);
      const diff = await compare(comparePage, bytes, actual);
      const overflow=await page.evaluate(()=>{const {document,window}=globalThis as any;return document.documentElement.scrollWidth>window.innerWidth+1;});
      const referenceWidth=bytes[16]!*16777216+bytes[17]!*65536+bytes[18]!*256+bytes[19]!;
      if(overflow&&referenceWidth<=width)failures.push('New horizontal overflow compared with the original');
      else if(overflow){const warning=`Original horizontal overflow retained at ${route.path} (${width}px); no layout redesign applied.`;if(!report.warnings.includes(warning))report.warnings.push(warning);}
      if (!diff.dimensionsMatch || diff.changedPixelRatio > 0.005) failures.push(`Visual difference ${(100 * diff.changedPixelRatio).toFixed(3)}% (limit 0.5%); dimensions ${diff.dimensionsMatch ? "match" : "differ"}`);
      const broken = await page.locator("img").evaluateAll((images: any[]) => images.filter(i => i.getAttribute('src') && !i.naturalWidth).map(i => i.getAttribute('src'))) as string[];
      const newBroken=broken.filter(src=>!manifest.assets.some(a=>src==='/'+a.file&&nullImages.has(a.url)));
      if (newBroken.length) failures.push(`Broken images: ${newBroken.join(", ")}`);
      const links = await page.locator("a[href]").evaluateAll((anchors: any[]) => anchors.map(a => a.href)) as string[];
      if(links.some(href=>/^javascript:/i.test(href)))failures.push('Unadapted JavaScript link remains');
      if(await page.locator('[data-preserve-disabled-custom-form][data-vitris-form]').count())failures.push('Disabled custom form has a live service binding');
      for (const href of links) {
        const url = new URL(href); if (url.origin !== origin) continue;
        const target = manifest.pages.find(p => p.path === url.pathname);
        if (!target && !existsSync(within(dist, "." + decodeURIComponent(url.pathname)))) failures.push(`Uncaptured internal link: ${url.pathname}`);
        if (url.hash && target) {
          const html = readFileSync(within(dist, target.file), "utf8");
          if (!html.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`)) {
            if(missingSourceAnchors.get(route.path)!.has(url.pathname+url.hash)){const warning=`Original missing anchor retained: ${url.pathname}${url.hash}. The source link already lacked its destination section.`;if(!report.warnings.includes(warning))report.warnings.push(warning);}
            else failures.push(`Missing anchor: ${url.pathname}${url.hash}`);
          }
        }
      }
      failures.push(...await interactions(page, connected ? config.backendOrigin : undefined));
      report.checks.push({ path: route.path, width, ...diff, screenshot, failures: [...new Set(failures)] });
      await context.close();
    }
    report.failures = [...unresolvedCaptureBlockers(manifest,staticComponents,resolvedNavigationAssets,reactComponents,repairedNavigation), ...scriptedLimitations, ...report.checks.flatMap(c => c.failures.map(f => `${c.path} (${c.width}px): ${f}`))];
    // Downloads and assets hidden at the resting viewport must also be present.
    // Compare hosted bytes to the authored build; source response bytes are kept
    // separately and checked for reference integrity without rewriting them.
    report.assetChecks = [];
    let nextAsset = 0;
    await Promise.all(Array.from({length:4}, async () => {
      while (nextAsset < manifest.assets.length) {
        const asset = manifest.assets[nextAsset++]!;
        try {
          if (asset.referenceFile && asset.originalSha256 && createHash('sha256').update(readFileSync(within(root,asset.referenceFile))).digest('hex') !== asset.originalSha256) throw new Error('Original asset reference changed');
          const expected = readFileSync(within(dist,asset.file));
          const response = await comparePage.request.get(origin + '/' + asset.file, {timeout:30000});
          if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
          const bytes = await response.body();
          if (createHash('sha256').update(bytes).digest('hex') !== createHash('sha256').update(expected).digest('hex')) throw new Error('Served bytes differ from the authored build');
          report.assetChecks!.push({file:asset.file,ok:true});
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          report.assetChecks!.push({file:asset.file,ok:false,error:message});
          report.failures.push(`Asset ${asset.file}: ${message}`);
        }
      }
    }));
    if (sourceRevision(root).digest !== report.sourceRevision || artifactManifest(dist).sha256 !== report.artifactDigest) report.failures.push("Source or build changed during verification");
    report.ok = !report.failures.length;
    save(join(root, opts.remoteUrl ? "agent/reviews/preserve-remote.json" : "agent/reviews/preserve.json"), report);
    return report;
  } finally { opts.signal?.removeEventListener("abort", abort); await browser.close(); if (server) await new Promise<void>(done => server.close(() => done())); }
}
