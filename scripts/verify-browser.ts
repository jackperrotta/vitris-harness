#!/usr/bin/env node
import { checkFocusOcclusion } from "../src/agent/browser-focus.ts";
import { captureTypography, captureTypographyStates, typographyConsistencyFailures, TYPOGRAPHY_SCENARIO, type TypographyCapture } from '../src/agent/browser-typography.ts';
import { typographyPolicy } from '../src/agent/typography-policy.ts';
import { loadSitePages } from '../src/build/index.ts';
import { measurePerformance, performancePolicy } from '../src/agent/performance.ts';
import { hasAnalyticsRuntime, productionQuality } from "../src/agent/production-quality.ts";
import { previewServer } from "../src/build/serve.ts";
import { checkPageVideos, checkSharedMedia, checkHeadingWordBreaks, checkResponsiveImages } from "../src/stock/browser-checks.ts";
import AxeBuilder from "@axe-core/playwright";
import type { Route } from "playwright";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { explainBrowserLaunchFailure, loadPlaywrightChromium } from "../src/agent/playwright-runtime.ts";
import { buildVerified } from "../src/build/verified.ts";
import { fingerprint, json, save, sourceHash, within, type MediaInventory, type Storyboard } from "../src/agent/artifacts.ts";
import { prepareConsentCheck, verifyConsentControls } from "../src/agent/browser-consent.ts";
import { resolveDesignAuthoring } from "../src/agent/composition-authoring.ts";
import { adaptationPreferences, ADAPTATION_PATH, type TemplateAdaptation } from "../src/agent/template-adaptation.ts";
import { checkTemplateSections } from "../src/agent/template-render-check.ts";
import {captureMotionJourney,type MotionJourney} from "../src/agent/browser-motion-journey.ts";
import {motionCompositionPolicy} from "../src/agent/motion-composition.ts";
import {runBrowserTasks} from "../src/agent/browser-work-queue.ts";
import {TEMPLATE_MOTION_PATH,type TemplateMotionPlan} from "../src/agent/template-motion.ts";
import {captureTemplateMotion} from "../src/agent/template-motion-capture.ts";
import { observeMotion, MOTION_SCENARIO_HASH, type TemporalMotionEvidence } from "../src/agent/browser-motion.ts";
declare function getComputedStyle(element: any): any; // Only in serialized browser callbacks.
declare const document:any; // Only in serialized browser callbacks.
const arg = (key: string) => { const i = process.argv.indexOf(key); return i < 0 ? undefined : process.argv[i + 1]; };
const root = resolve(arg("--site") || "."), representative = process.argv.includes("--representative");
const typePolicy = typographyPolicy(root);
const concurrency=Number(arg("--concurrency")||process.env.VITRIS_BROWSER_CONCURRENCY||"1");
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw new Error('--concurrency must be an integer from 1 to 4');
const extraViewports = (arg("--extra-viewports") || "").split(",").filter(Boolean).map(Number);
if (extraViewports.some(width => !Number.isSafeInteger(width) || width < 320 || width > 2560)) throw new Error("--extra-viewports must be comma-separated integer widths from 320 to 2560");
const viewports = [...new Set([375, 1080, ...extraViewports])].sort((a, b) => a - b);
const motionFlag = arg("--motion") || "both";
if (!["reduce", "normal", "both"].includes(motionFlag)) throw new Error("--motion must be reduce, normal, or both");
const motionModes = motionFlag === "both" ? ["reduce", "normal"] as const : [motionFlag] as ("reduce" | "normal")[];
const name = representative ? "representative-browser" : "browser";
const sanitizeRequestUrl = (raw: string) => {
  const url = new URL(raw);
  return url.origin + url.pathname.split("/").map(segment =>
    /@|^[0-9a-f]{16,}$/i.test(segment) ? "[redacted]" : segment).join("/");
};
await buildVerified(root);
const analyticsRequired = !productionQuality(root) || hasAnalyticsRuntime(root);
const plan = json<Storyboard>(join(root, "onboarding/storyboard.json"));
const attempt=Date.now();
const dist = join(root, "dist"), directory = `agent/screenshots/${name}${plan.motionPlan?.version===2?`/${attempt}`:""}`;
if(plan.motionPlan?.version!==2)rmSync(join(root, directory), { recursive: true, force: true });
mkdirSync(join(root, directory), { recursive: true });
if(plan.motionPlan?.version===2&&existsSync(join(root,`agent/reviews/${name}.json`)))copyFileSync(join(root,`agent/reviews/${name}.json`),join(root,directory,"previous-report.json"));
const compositionMode = resolveDesignAuthoring(root).mode === "composition-v1";
const templatePlan = adaptationPreferences(root) && existsSync(join(root, ADAPTATION_PATH)) ? json<TemplateAdaptation>(join(root, ADAPTATION_PATH)) : undefined;
const mediaInventory = existsSync(join(root, "onboarding/media-inventory.json"))
  ? json<MediaInventory>(join(root, "onboarding/media-inventory.json"))
  : { version: 2, harvestHash: "", assets: [] } as MediaInventory;
const server = previewServer(dist, { compress: true });
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const address = server.address() as { port: number };
let browser;
const checks: { path: string; width: number; motion?: "reduce" | "normal"; screenshot: string; screenshotHash: string; initialTransferBytes: number; firstVisit?: { screenshot: string; screenshotHash: string }; mockedLeadPosts?: number; blockedFormRequests?: { url: string; method: string; resourceType: string; initiator: string; disposition: string }[]; failures: string[]; warnings: string[]; visibleText: string }[] = [];
const routeChecks: { source: string; width: number; disposition: string; target?: string; status: number; location?: string; destination?: string; mechanism: string; failures: string[] }[] = [];
const compositionTargets: { path: string; width: number; motion: string; sectionId: string; elementId: string; count: number; visible: boolean; screenshot: string; screenshotHash: string; captureSha256: string }[] = [];
const pagesToCheck = plan.pages.filter(p => !representative || p.path === "/" || p.representative);
if (typePolicy.enabled && !representative) for (const page of await loadSitePages(root)) if (!pagesToCheck.some(p => p.path === page.path)) pagesToCheck.push({path:page.path,sections:[],purpose:'Authored route',representative:false});
if (!representative && existsSync(join(dist, "cookie-compliance/index.html")) && !pagesToCheck.some(p => p.path === "/cookie-compliance")) pagesToCheck.push({ path: "/cookie-compliance" } as Storyboard["pages"][number]);
const consentChecks: { width: number; passed: boolean; failures: string[] }[] = [];
const temporalMotion: TemporalMotionEvidence[] = [];
const routeJourneys:MotionJourney[]=[];
const typography: TypographyCapture[] = [];
try {
  try {
    const chromium = await loadPlaywrightChromium();
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(explainBrowserLaunchFailure(error));
  }
  const tasks=pagesToCheck.flatMap(p=>viewports.flatMap(width=>motionModes.map(motion=>({p,width,motion}))));
  await runBrowserTasks(tasks,concurrency,async({p,width,motion},taskIndex)=>{
    if(plan.motionPlan?.version===2&&plan.motionPlan.routes?.some(r=>r.route===p.path)){
      const journey=await captureMotionJourney(browser!,root,`http://127.0.0.1:${address.port}${p.path}`,p.path,width,motion,`${directory}/journeys/${taskIndex}-${motion}`,plan.motionPlan,motionCompositionPolicy(root,plan.pages.map(p=>p.path)).operatorOff);
      routeJourneys.push(journey);
      if(motion==='reduce')routeJourneys.push(await captureMotionJourney(browser!,root,`http://127.0.0.1:${address.port}${p.path}`,p.path,width,'static',`${directory}/journeys/${taskIndex}-static`,plan.motionPlan,true));
    }
    const context = await browser!.newContext({ viewport: { width, height: 900 }, reducedMotion: motion === "normal" ? "no-preference" : "reduce" });
    const page = await context.newPage();
    const failures: string[] = [];
    const warnings: string[] = [];
    if (!representative && analyticsRequired && p.path === "/cookie-compliance") await prepareConsentCheck(page, `http://127.0.0.1:${address.port}`);
    page.on("pageerror", (e: Error) => failures.push(`Runtime: ${e.message}`));
    await page.addInitScript(`(() => { try { new PerformanceObserver(list => { const e=list.getEntries().at(-1); if(e?.element) window.__vitrisLcpImage={tag:e.element.tagName,loading:e.element.getAttribute('loading'),source:e.element.getAttribute('src')}; }).observe({type:'largest-contentful-paint',buffered:true}); } catch {} })()`);
    page.on("response", (r: { status: () => number; url: () => string }) => { if (r.status() >= 400 && r.url().startsWith(`http://127.0.0.1:${address.port}`)) failures.push(`HTTP ${r.status()}: ${r.url()}`); });
    await page.goto(`http://127.0.0.1:${address.port}${p.path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("load");
    // Settled layout/focus checks follow the real first-visit reveal. Its
    // navigation-start evidence is captured separately by a load moment.
    await page.waitForFunction(()=>!document.documentElement.dataset.experienceArrival,{},{timeout:5000});
    // Capture the opening before motion verification scrolls through the route.
    // Later resource loads and synthetic scrolls must not be reported as the first viewport.
    const initialTransferBytes = await page.evaluate(`(() => performance.getEntriesByType('resource').concat(performance.getEntriesByType('navigation')).reduce((sum,e)=>sum+(e.transferSize||e.encodedBodySize||e.decodedBodySize||0),0))()`) as number;
    const lcpImage = await page.evaluate('window.__vitrisLcpImage') as { tag?: string; loading?: string; source?: string } | undefined;
    if (performancePolicy(root).enabled && lcpImage?.tag === 'IMG' && lcpImage.loading === 'lazy') failures.push(`LCP image is lazy-loaded: ${lcpImage.source}; mark the actual critical image data-media-priority="critical"`);
    if (performancePolicy(root).enabled) {
      const lazyOpeningImages = await page.evaluate(`(() => [...document.images].filter(img => {
        if(img.loading!=='lazy')return false;
        const r=img.getBoundingClientRect(),s=getComputedStyle(img);
        const visibleWidth=Math.max(0,Math.min(r.right,innerWidth)-Math.max(r.left,0)),visibleHeight=Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0));
        return s.visibility!=='hidden'&&s.display!=='none'&&visibleWidth*visibleHeight>innerWidth*innerHeight*.08;
      }).map(img=>img.getAttribute('data-media-source')||img.getAttribute('src')))()` ) as string[];
      failures.push(...lazyOpeningImages.map(src => `Large above-fold image is lazy-loaded: ${src}; use eager loading, and critical priority only for the actual LCP image`));
    }
    const temporal = await observeMotion(page, root, p.path, width, motion, directory);
    temporalMotion.push(temporal);
    failures.push(...temporal.failures);
    failures.push(...await checkPageVideos(page));
    await page.evaluate(`(async () => { for(let y=0;y<Math.min(document.documentElement.scrollHeight,50000);y+=700){ window.scrollTo(0,y); await new Promise(r=>setTimeout(r,80)); } window.scrollTo(0,0); await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,5000))]); await Promise.race([Promise.all([...document.images].filter(i=>i.getClientRects().length).map(i=>{i.loading='eager';return i.decode().catch(()=>{});})),new Promise(r=>setTimeout(r,5000))]); })()`);
    let firstVisit: { screenshot: string; screenshotHash: string } | undefined;
    const cookieBanner = page.locator("#vitris-cookie-banner");
    if (await cookieBanner.isVisible()) {
      if (typePolicy.enabled) typography.push(await captureTypography(page, typePolicy.theme, p.path, width, 'first-visit'));
      if (p.path === "/") {
        const path = `${directory}/first-visit-${width}${motion === "reduce" ? "" : "-normal"}.png`;
        await page.screenshot({ path: join(root, path) });
        firstVisit = { screenshot: path, screenshotHash: fingerprint(root, [path]) };
        const firstAudit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        for (const violation of firstAudit.violations) if (["critical", "serious"].includes(violation.impact || "")) {
          failures.push(`First-visit accessibility: ${violation.id}: ${violation.nodes.map(node => node.target.join(" ")).join(", ")}`);
        }
      }
      // Exercise the real preference control, keeping first-visit evidence, so
      // the overlay cannot conceal content or intercept unrelated UI checks.
      await cookieBanner.locator("[data-cookie-reject]").click();
      await cookieBanner.waitFor({ state: "hidden", timeout: 3000 });
    }
    await page.evaluate("document.body.tabIndex = -1; document.body.focus(); window.scrollTo(0,0)");
    await page.keyboard.press("Tab");
    const firstFocus = await page.evaluate("document.activeElement?.matches('a.skip-link[href=\"#main\"]') === true");
    if (!firstFocus) failures.push("Keyboard skip link is not the first focus target");
    else {
      await page.keyboard.press("Enter");
      const skipOutcome = await page.evaluate("({ hash: location.hash, mainCount: document.querySelectorAll('main#main').length, focusable: document.querySelector('main#main')?.hasAttribute('tabindex') })") as { hash: string; mainCount: number; focusable: boolean };
      if (skipOutcome.hash !== "#main" || skipOutcome.mainCount !== 1 || !skipOutcome.focusable) failures.push(`Keyboard skip link did not reach one focusable main landmark: ${JSON.stringify(skipOutcome)}`);
    }
    await page.evaluate("history.replaceState(null, '', location.pathname + location.search); document.body.removeAttribute('tabindex')");
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    for (const violation of accessibility.violations) if (violation.id === 'label-content-name-mismatch' || ["critical", "serious"].includes(violation.impact || "")) {
      failures.push(`Accessibility: ${violation.id}: ${violation.nodes.map(node => node.target.join(" ")).join(", ")}`);
    }
    const focusableCount = await page.locator('a[href]:visible,button:visible,input:visible,textarea:visible,select:visible,[tabindex]:visible').count();
    if (focusableCount > 1) {
      await page.evaluate("document.activeElement?.blur(); document.body.focus()");
      const sequence: string[] = [];
      for (let index = 0; index < Math.min(focusableCount, 4); index++) {
        await page.keyboard.press("Tab");
        sequence.push(await page.evaluate("(() => { const e=document.activeElement; return e?.tagName + '#' + (e?.id||'') + ':' + [...document.querySelectorAll('*')].indexOf(e); })()") as string);
      }
      if (new Set(sequence).size === 1) failures.push(`Keyboard trap: Tab did not advance focus among ${focusableCount} controls`);
    }
    const obscured = await checkFocusOcclusion(page);
    failures.push(...obscured.map(target => `Focus obscured by rendered overlay: ${target}`));
    const observed = await page.evaluate(`(() => {
      const errors=[];
      if(document.documentElement.scrollWidth>innerWidth+2) errors.push('Horizontal overflow');
      if(document.querySelectorAll('h1').length!==1) errors.push('Expected one h1');
      for(const img of document.images) if(img.getClientRects().length&&(!img.complete||img.naturalWidth===0)) errors.push('Broken image: '+img.getAttribute('src'));
      for(const f of document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea,select')) if(!f.labels?.length&&!f.getAttribute('aria-label')&&!f.getAttribute('aria-labelledby')) errors.push('Unlabelled field: '+f.name);
      return {errors, links:[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'))};
    })()`) as { errors: string[]; links: string[] };
    failures.push(...observed.errors);
    if (width === 375) failures.push(...await checkHeadingWordBreaks(page));
    failures.push(...await checkSharedMedia(page, plan, mediaInventory, p.path, existsSync(join(dist, 'media-manifest.json')) ? json(join(dist, 'media-manifest.json')) : undefined));
    if (performancePolicy(root).enabled && existsSync(join(dist, 'media-manifest.json'))) failures.push(...await checkResponsiveImages(page, json(join(dist, 'media-manifest.json'))));
    const tabs = page.locator('[role="tab"]:visible');
    for (let i = 0; i < await tabs.count(); i++) {
      const tab = tabs.nth(i); await tab.click();
      if (await tab.getAttribute("aria-selected") !== "true") failures.push(`Tab ${i + 1} did not select`);
      const panelId = await tab.getAttribute("aria-controls");
      if (!panelId || !await page.evaluate(`(() => { const p=document.getElementById(${JSON.stringify(panelId)});return !!p&&!p.hidden; })()`)) failures.push(`Tab ${i + 1} has no visible panel`);
      await page.evaluate(`(async () => { await Promise.race([Promise.all([...document.images].filter(i=>i.getClientRects().length).map(i=>{i.loading='eager';return i.decode().catch(()=>{});})),new Promise(r=>setTimeout(r,5000))]); })()`);
      const broken = await page.evaluate(`Array.from(document.images).filter(i=>i.getClientRects().length&&(!i.complete||!i.naturalWidth)).map(i=>i.getAttribute('src'))`) as string[];
      failures.push(...broken.map(src => `Broken tab image: ${src}`));
      if (typePolicy.enabled) typography.push(await captureTypography(page, typePolicy.theme, p.path, width, `tab-${i}`));
    }
    if (await tabs.count()) await tabs.first().click();
    for (const carousel of await page.locator('[data-island="carousel"]').all()) {
      const track = carousel.locator('.carousel__track');
      if (!await track.count()) continue;
      const scrollable = await track.evaluate((el: { scrollWidth: number; clientWidth: number }) => el.scrollWidth > el.clientWidth + 2);
      if (!scrollable) continue;
      await track.evaluate((el: { scrollLeft: number }) => { el.scrollLeft = 0; });
      const next = carousel.locator('[data-carousel-next]');
      if (!await next.count()) { failures.push("Scrollable carousel lacks next control"); continue; }
      await next.click();
      let advanced = false;
      for (let i = 0; i < 20 && !advanced; i++) { await new Promise(r => setTimeout(r, 100)); advanced = await track.evaluate((el: { scrollLeft: number }) => el.scrollLeft > 0); }
      if (!advanced) failures.push("Carousel next control did not advance");
      await track.evaluate((el: { scrollLeft: number }) => { el.scrollLeft = 0; });
    }
    const toggle = page.locator("[data-nav-toggle]:visible").first();
    if (await toggle.count()) {
      await toggle.click();
      if (await toggle.getAttribute("aria-expanded") !== "true") failures.push("Navigation did not open");
      await page.keyboard.press("Escape");
      if (await toggle.getAttribute("aria-expanded") !== "false") failures.push("Navigation did not close on Escape");
    }
    for (const href of new Set(observed.links.filter(h => h.startsWith("#") && h.length > 1))) {
      const id = decodeURIComponent(href.slice(1));
      if (!await page.evaluate(`!!document.getElementById(${JSON.stringify(id)})`)) failures.push(`Missing anchor target: ${href}`);
    }
    if (!representative) for (const href of new Set(observed.links)) {
      const url = new URL(href, page.url());
      if (url.origin !== new URL(page.url()).origin || href.startsWith("#")) continue;
      const response = await page.request.get(url.href);
      if (!response.ok()) failures.push(`Broken internal link: ${href}`);
    }
    if (!representative && p.path === "/") for (const route of plan.routes || []) {
      const oldPath = new URL(route.source).pathname.replace(/\/$/, "") || "/";
      const origin = `http://127.0.0.1:${address.port}`;
      const raw = await page.request.get(origin + oldPath, { maxRedirects: 0 });
      const status = raw.status(), location = raw.headers()["location"];
      const routeFailures: string[] = [];
      let destination: string | undefined;
      let mechanism = "unverified";
      if (route.disposition === "redirect" || route.disposition === "consolidate") {
        mechanism = "http-redirect";
        if (![301, 302, 307, 308].includes(status) || !location) routeFailures.push(`Expected HTTP redirect for ${oldPath}; received ${status}`);
        else {
          const locationPath = new URL(location, origin + oldPath).pathname.replace(/\/$/, "") || "/";
          if (locationPath !== (route.target?.replace(/\/$/, "") || "/")) routeFailures.push(`Redirect Location mismatch for ${oldPath}: ${location}`);
          try {
            const followed = await page.request.get(origin + oldPath, { maxRedirects: 4 });
            destination = new URL(followed.url()).pathname.replace(/\/$/, "") || "/";
            if (!followed.ok() || destination !== (route.target?.replace(/\/$/, "") || "/")) routeFailures.push(`Redirect destination or loop failure for ${oldPath}`);
          } catch { routeFailures.push(`Redirect loop or failed handoff for ${oldPath}`); }
        }
      } else if (route.disposition === "preserve") {
        mechanism = "preserved";
        if (status !== 200) routeFailures.push(`Preserved source route ${oldPath} returned ${status}`);
      } else {
        mechanism = "retired";
        if (status !== 404 && status !== 410) routeFailures.push(`Retired source route ${oldPath} returned ${status}`);
      }
      failures.push(...routeFailures);
      routeChecks.push({ source: oldPath, width, disposition: route.disposition, ...(route.target ? { target: route.target } : {}), status, ...(location ? { location } : {}), ...(destination ? { destination } : {}), mechanism, failures: routeFailures });
    }
    if (!representative && analyticsRequired && p.path === "/cookie-compliance") {
      const consent = await verifyConsentControls(page);
      consentChecks.push({ width, ...consent }); failures.push(...consent.failures);
    }
    const slug = p.path === "/" ? "home" : p.path.replace(/^\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "") || "home";
    const screenshot = `${directory}/${slug}-${width}${motion === "reduce" ? "" : "-normal"}.png`;
    // Temporal playback was observed earlier. Final static/media evidence must expose every offscreen target,
    // including groups still armed after keyboard/anchor/resize checks.
    await page.evaluate("window.VitrisMotion?.dispose(); window.VitrisCounters?.dispose()");
    if (typePolicy.enabled) typography.push(...await captureTypographyStates(page, typePolicy.theme, p.path, width));
    const unreadableMotion = await page.locator('[data-motion],[data-reveal],[data-motion-child],[data-reveal-child]').evaluateAll((es: any[]) => es.filter((e:any)=>Number(getComputedStyle(e).opacity)<.99).map((e:any)=>e.id||e.tagName));
    if (unreadableMotion.length) failures.push(`Motion teardown left final static content hidden: ${unreadableMotion.join(', ')}`);
    await page.evaluate("window.scrollTo(0,0)");
    const visibleText = await page.locator("body").innerText();
    await page.screenshot({ path: join(root, screenshot), fullPage: true });
    failures.push(...await checkTemplateSections(page, p.path, templatePlan?.sections || []));
    if (compositionMode) for (const section of p.sections || []) for (const element of section.elementPlan || []) {
      const locator = page.locator(`[data-composition-element="${element.id}"]`);
      const count = await locator.count();
      const visible = count === 1 ? await locator.first().isVisible() : false;
      compositionTargets.push({ path: p.path, width, motion, sectionId: section.id, elementId: element.id, count, visible, screenshot, screenshotHash: fingerprint(root, [screenshot]), captureSha256: createHash("sha256").update(readFileSync(join(root, screenshot))).digest("hex") });
      if (count !== 1) failures.push(`Composition element ${p.path}#${section.id}/${element.id} has ${count} render targets; expected one`);
    }
    let mockedLeadPosts = 0;
    let blockedMutations = 0;
    const blockedFormRequests: { url: string; method: string; resourceType: string; initiator: string; disposition: string }[] = [];
    let expectedLeadAction: string | undefined;
    const previewOrigin = `http://127.0.0.1:${address.port}`;
    // Install the fence before any form can be submitted. A form adapter may
    // fulfill only the exact lead API call; all other mutations and remote
    // navigations are denied in this browser context.
    await page.route("**/*", async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === "POST" && url.href === expectedLeadAction && url.pathname === "/api/leads") {
        mockedLeadPosts++;
        const before = page.url();
        if ((await request.headerValue("accept"))?.includes("application/json")) {
          await route.fulfill({ status: 201, contentType: "application/json", headers: { "access-control-allow-origin": previewOrigin }, body: JSON.stringify({ ok: true, leadId: "local-mock", mode:'test' }) });
        } else {
          await route.fulfill({ status: 302, headers: { location: `${before}${before.includes("?") ? "&" : "?"}sent=1` } });
        }
      } else if (expectedLeadAction && request.method()==='GET' && url.origin==='https://challenges.cloudflare.com' && url.pathname==='/turnstile/v0/api.js') {
        // Intentional challenge UI is mocked separately from resting-page pixels.
        // No external challenge or customer request leaves this verifier.
        await route.fulfill({contentType:'application/javascript',body:'window.turnstile={render:(el,opts)=>{setTimeout(()=>opts.callback("browser-verifier-fixture"),0);return "fixture"},reset:()=>{}}'});
      } else if (request.method() !== "GET" || url.origin !== previewOrigin) {
        const disposition = request.method() !== "GET" && url.pathname === "/api/t"
          ? "expected-blocked-telemetry"
          : request.method() === "GET" ? "blocked-external-read" : "unexpected-mutation";
        if (disposition === "unexpected-mutation") blockedMutations++;
        let initiator = "unknown";
        try { initiator = sanitizeRequestUrl(request.frame().url()); } catch {}
        blockedFormRequests.push({ url: sanitizeRequestUrl(request.url()), method: request.method(), resourceType: request.resourceType(), initiator, disposition });
        await route.abort();
      } else {
        await route.continue();
      }
    });
    for (const form of await page.locator("form:has(button[type=submit],input[type=submit],button:not([type]))").all()) {
      if (!await form.isVisible()) continue;
      const before = page.url();
      if (await form.getAttribute("data-lead-form") === null) {
        warnings.push("Unsupported form was not submitted; no mock adapter is configured");
        continue;
      }
      const action = new URL(await form.getAttribute("action") || before, before);
      const method = (await form.getAttribute("method") || "get").toUpperCase();
      if (action.pathname !== "/api/leads" || method !== "POST") {
        warnings.push(`Lead form was not submitted: expected POST /api/leads, found ${method} ${action.pathname}`);
        continue;
      }
      const statusBefore = await page.locator('[role="status"]:visible').allTextContents();
      const postsBefore = mockedLeadPosts;
      if (typePolicy.enabled && !await form.evaluate((e: any) => e.checkValidity())) {
        await form.locator('button[type=submit],input[type=submit],button:not([type])').first().click({timeout:3000});
        typography.push(await captureTypography(page, typePolicy.theme, p.path, width, 'form-invalid'));
      }
      let supported = true;
      for (const field of await form.locator("input:not([type=hidden]):not([type=submit]),textarea,select").all()) {
        const type = (await field.getAttribute("type") || "text").toLowerCase();
        if (!await field.isVisible() || !await field.isEnabled()) continue;
        if (type === "file") { if (await field.getAttribute("required") !== null) supported = false; continue; }
        if (type === "checkbox" || type === "radio") { if (await field.getAttribute("required") !== null) await field.check(); continue; }
        const tag = await field.evaluate((el: Element) => el.tagName.toLowerCase());
        if (tag === "select") {
          const option = await field.locator("option:not([disabled]):not([value=''])").first().getAttribute("value");
          if (option !== null) await field.selectOption(option);
          else if (await field.getAttribute("required") !== null) supported = false;
          continue;
        }
        const value = type === "email" ? "pilot@example.invalid" : type === "tel" ? "5550101234"
          : type === "number" || type === "range" ? "1" : type === "date" ? "2026-01-15"
          : type === "datetime-local" ? "2026-01-15T12:00" : type === "time" ? "12:00"
          : type === "url" ? "https://example.invalid/" : "Pilot inquiry";
        await field.fill(value);
      }
      if (!supported) { warnings.push("Lead form was not submitted: required input has no safe test value"); continue; }
      try {
        expectedLeadAction = action.href;
        await form.locator('button[type=submit],input[type=submit],button:not([type])').first().click({ timeout: 3000 });
        await page.waitForTimeout(500);
        const next = page.url();
        const statusAfter = await page.locator('[role="status"]:visible').allTextContents();
        const newStatus = statusAfter.some((text: string) => text.trim() && !statusBefore.includes(text));
        if (typePolicy.enabled) typography.push(await captureTypography(page, typePolicy.theme, p.path, width, 'form-result'));
        if (mockedLeadPosts === postsBefore) failures.push("Lead form did not reach the mocked POST /api/leads adapter");
        else if (!newStatus && !(new URL(next).searchParams.get("sent") && next !== before)) failures.push("Lead form has no new success state or destination");
      } catch (error) {
        failures.push(`Contact form could not complete: ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`);
      } finally {
        expectedLeadAction = undefined;
      }
    }
    if (blockedMutations) failures.push(`${blockedMutations} unexpected mutating request(s) were blocked during form verification`);
    const harmlessBlocked = blockedFormRequests.filter(request => request.disposition === "blocked-external-read").length;
    if (blockedFormRequests.length) warnings.push("Form-time network requests blocked; inspect blockedFormRequests for individual dispositions");
    if (harmlessBlocked) warnings.push(`${harmlessBlocked} external read request(s) blocked during form verification; inspect blockedFormRequests`);
    checks.push({ visibleText, path: p.path, width, motion, screenshot, screenshotHash: fingerprint(root, [screenshot]), initialTransferBytes, ...(firstVisit ? { firstVisit } : {}), mockedLeadPosts, blockedFormRequests, failures, warnings });
    console.log(`${name}: ${checks.length}/${pagesToCheck.length * viewports.length * motionModes.length} ${p.path} (${width}px, ${motion}), ${failures.length ? `${failures.length} failures` : "checked"}`);
    for (const failure of failures) console.log(`  ${failure}`);
    await context.close();
  });
  const compare=(a:{path:string;width:number;motion?:string;mode?:string},b:{path:string;width:number;motion?:string;mode?:string})=>a.path.localeCompare(b.path)||a.width-b.width||String(a.motion||a.mode).localeCompare(String(b.motion||b.mode));
  checks.sort(compare);routeJourneys.sort(compare);
  typography.sort((a,b)=>compare(a,b)||a.state.localeCompare(b.state));
  const typographyFailures = typePolicy.enabled ? [...new Set([...typography.flatMap(c=>c.failures.map(f=>`${c.path} ${c.width}px ${c.state}: ${f}`)), ...typographyConsistencyFailures(typography)])] : [];
  for (const failure of typographyFailures) console.log(`Typography: ${failure}`);
  const templateMotion=existsSync(join(root,TEMPLATE_MOTION_PATH))?await captureTemplateMotion(browser,root,`http://127.0.0.1:${address.port}/`,directory+'/template-motion',json<TemplateMotionPlan>(join(root,TEMPLATE_MOTION_PATH))):undefined;
  save(join(root, `agent/reviews/${name}.json`), { version: 4, sourceHash: sourceHash(root), distHash: fingerprint(root, ["dist"]), scope: name, concurrency, viewports, motionModes, staticMotionState: 'complete-after-teardown', motionScenarioHash: MOTION_SCENARIO_HASH, temporalMotion, routeJourneys, checks, routeChecks, consentChecks, ...(typePolicy.enabled?{typography:{scenario:TYPOGRAPHY_SCENARIO,captures:typography,failures:typographyFailures}}:{}), ...(templateMotion?{templateMotion}:{}), ...(compositionMode ? { compositionTargets } : {}) });
  if (!representative && performancePolicy(root).enabled) {
    const performance = await measurePerformance(root, `http://127.0.0.1:${address.port}`, { log: console.log });
    if (performance.failures.length) { console.error(performance.failures.join('\n')); process.exitCode = 1; }
  }
  console.log(`${name}: ${checks.length} route/viewport checks`);
  if (typographyFailures.length||checks.some(c => c.failures.length)||routeJourneys.some(j=>j.failures.length)||templateMotion?.captures.some(c=>c.failures.length)) process.exitCode = 1;
} finally { await browser?.close(); await new Promise<void>(r => server.close(() => r())); }
