/**
 * Playwright crawl: rendered DOM, lazy-scroll, full link discovery.
 * Falls back is handled by run.ts when this throws or Chromium is missing.
 */

import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  extractPage,
  type ExtractedPage,
} from "../../src/onboard/extract.ts";
import { crawlPriority } from "../../src/onboard/crawl-order.ts";
import { hintsFromComputed } from "../../src/onboard/visual-hints.ts";
import { colorsFromComputedActions } from '../../src/agent/theme-selection.ts';
import type { VisualHints } from "../../src/onboard/brief.ts";
import { enqueue, persistCheckpoint, sitemapUrls, type CrawlResult } from "./crawl.ts";
import { isErrorPage } from "../../src/onboard/quality.ts";
import { sameSite } from "../../src/onboard/extract.ts";
import { json } from "../../src/agent/artifacts.ts";
import {
  capturedPathSet,
  classifyMiss,
  formatExclusion,
  type HarvestDiscovery,
  type HarvestExclusion,
} from "../../src/onboard/harvest-inventory.ts";

type PlaywrightMod = typeof import("playwright");

async function loadPlaywright(kernelRoot?: string): Promise<PlaywrightMod> {
  try {
    return await import("playwright");
  } catch {
    if (kernelRoot) {
      try {
        const require = createRequire(join(kernelRoot, "package.json"));
        return require("playwright") as PlaywrightMod;
      } catch {
        /* continue */
      }
    }
    throw new Error(
      "playwright package not installed. From the site repo: npm install && npx playwright install chromium",
    );
  }
}

type BrowserPage = {
  goto: (
    url: string,
    opts?: { waitUntil?: "domcontentloaded" | "load" | "networkidle"; timeout?: number },
  ) => Promise<{ ok: () => boolean; status: () => number } | null>;
  url: () => string;
  content: () => Promise<string>;
  close: () => Promise<void>;
  waitForTimeout: (ms: number) => Promise<void>;
  waitForLoadState: (state: string, opts?: { timeout?: number }) => Promise<void>;
  screenshot: (opts: { path: string; fullPage?: boolean; type?: "png" | "jpeg" }) => Promise<Buffer>;
  // Playwright serializes real functions; string IIFEs also work.
  evaluate: (fn: unknown) => Promise<unknown>;
};

async function scrollPage(page: BrowserPage): Promise<void> {
  await page.evaluate(async () => {
    const w = globalThis as unknown as {
      innerHeight: number;
      scrollBy: (x: number, y: number) => void;
      scrollTo: (x: number, y: number) => void;
      document: { documentElement: { scrollHeight: number } };
    };
    await new Promise<void>((resolve) => {
      let total = 0;
      const step = Math.max(400, Math.floor(w.innerHeight * 0.85));
      const timer = setInterval(() => {
        const { scrollHeight } = w.document.documentElement;
        w.scrollBy(0, step);
        total += step;
        if (total >= scrollHeight || total > 50000) {
          clearInterval(timer);
          w.scrollTo(0, 0);
          resolve();
        }
      }, 120);
    });
  });
  await page.waitForTimeout(400);
}

async function collectRenderedExtras(page: BrowserPage): Promise<{
  imageUrls: string[];
  bgUrls: string[];
  hrefs: string[];
}> {
  return (await page.evaluate(() => {
    const g = globalThis as unknown as {
      document: {
        querySelectorAll: (sel: string) => Iterable<unknown>;
      };
      getComputedStyle: (el: unknown) => { backgroundImage: string };
    };
    const imageUrls: string[] = [];
    for (const node of Array.from(g.document.querySelectorAll("img"))) {
      const img = node as {
        currentSrc?: string;
        src?: string;
        getAttribute: (name: string) => string | null;
      };
      const src =
        img.currentSrc ||
        img.src ||
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        "";
      if (src && !src.startsWith("data:")) imageUrls.push(src);
      const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
      if (srcset) {
        for (const part of srcset.split(",")) {
          const u = part.trim().split(/\s+/)[0];
          if (u && !u.startsWith("data:")) imageUrls.push(u);
        }
      }
    }
    for (const node of Array.from(g.document.querySelectorAll("picture source[srcset]"))) {
      const source = node as { getAttribute: (name: string) => string | null };
      const srcset = source.getAttribute("srcset") || "";
      for (const part of srcset.split(",")) {
        const u = part.trim().split(/\s+/)[0];
        if (u && !u.startsWith("data:")) imageUrls.push(u);
      }
    }

    const bgUrls: string[] = [];
    for (const el of Array.from(g.document.querySelectorAll("*"))) {
      const bg = g.getComputedStyle(el).backgroundImage;
      if (!bg || bg === "none") continue;
      const re = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(bg))) {
        const u = m[1];
        if (u && !u.startsWith("data:")) bgUrls.push(u);
      }
    }

    const hrefs = Array.from(g.document.querySelectorAll("a[href]"))
      .map((a) => (a as { href?: string }).href)
      .filter((h): h is string => Boolean(h));

    return { imageUrls, bgUrls, hrefs };
  })) as { imageUrls: string[]; bgUrls: string[]; hrefs: string[] };
}

function mergeExtras(
  page: ExtractedPage,
  extras: { imageUrls: string[]; bgUrls: string[] },
  pageUrl: string,
): void {
  const seen = new Set(page.images.map((i) => i.src));
  const push = (raw: string, flags: Partial<(typeof page.images)[0]> = {}) => {
    try {
      const abs = new URL(raw, pageUrl).href;
      if (seen.has(abs) || abs.startsWith("data:")) return;
      seen.add(abs);
      page.images.push({ src: abs, alt: flags.alt || "", pageUrl, ...flags });
    } catch {
      /* ignore */
    }
  };
  for (const u of extras.imageUrls) push(u);
  for (const u of extras.bgUrls) push(u);
}

async function captureHints(page: BrowserPage): Promise<VisualHints> {
  const raw = (await page.evaluate(() => {
    const g = globalThis as unknown as {
      document: { body: unknown; querySelector: (sel: string) => unknown };
      getComputedStyle: (el: unknown) => { fontFamily: string; borderRadius: string };
    };
    const body = g.getComputedStyle(g.document.body);
    const heading = g.document.querySelector("h1, h2");
    const btn = g.document.querySelector("a[class*='btn'], button, [class*='cta']");
    return {
      fontBody: body.fontFamily,
      fontDisplay: heading ? g.getComputedStyle(heading).fontFamily : body.fontFamily,
      radius: btn ? g.getComputedStyle(btn).borderRadius : "",
    };
  })) as { fontBody: string; fontDisplay: string; radius: string };
  const actionColors = await page.evaluate(() => {
    const doc = (globalThis as any).document;
    const computed = (globalThis as any).getComputedStyle;
    return Array.from(doc.querySelectorAll('nav a, header a, button, a[class*="btn"], a[class*="cta"]')).slice(0,40).flatMap((el:any) => {
      const s=computed(el); return [s.color,s.backgroundColor];
    });
  }) as string[];
  const brandColors=colorsFromComputedActions(actionColors,`${page.url()}: repeated computed navigation/action color (bounded 40 elements)`);
  return { ...hintsFromComputed(raw), ...(brandColors.length?{brandColors}:{}) };
}

async function captureStill(
  page: BrowserPage,
  stillsDir: string,
  file: string,
  stills: string[],
): Promise<void> {
  mkdirSync(stillsDir, { recursive: true });
  try {
    await page.screenshot({ path: join(stillsDir, file), fullPage: false, type: "png" });
    const rel = `onboarding/stills/${file}`;
    if (!stills.includes(rel)) stills.push(rel);
  } catch {
    /* screenshot is optional */
  }
}

/**
 * Playwright harvest. Optional maxPages is emergency abort only.
 */
export async function crawlSiteBrowser(
  startUrl: string,
  maxPages?: number,
  kernelRoot?: string,
  stillsDir?: string,
  checkpointPath?: string,
  fresh = false,
): Promise<CrawlResult> {
  const playwright = await loadPlaywright(kernelRoot);
  const warnings: string[] = [];
  const start = (() => {
    try {
      const u = new URL(startUrl);
      u.hash = "";
      if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
      return u.href;
    } catch {
      return startUrl;
    }
  })();

  const seen = new Set<string>();
  const queue: string[] = [];
  const discovery = new Map<string, HarvestDiscovery>();
  enqueue(queue, seen, start, start, discovery, { provenance: "start" });

  const fromSitemap = await sitemapUrls(start, warnings);
  const sitemapPaths = new Set(fromSitemap.map((loc) => {
    try { return new URL(loc).pathname.replace(/\/+$/, "") || "/"; } catch { return loc; }
  }));
  for (const loc of fromSitemap) enqueue(queue, seen, loc, start, discovery, { provenance: "sitemap" });

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    javaScriptEnabled: true,
  });
  const pages: ExtractedPage[] = [];
  const visited = new Set<string>();
  const stills: string[] = [];
  const exclusions: HarvestExclusion[] = [];
  const misses: { url: string; status?: number; error?: string; kind: "http" | "transport" | "empty" | "error-page" | "off-site" | "non-http" }[] = [];
  let hints: VisualHints | undefined;
  if (checkpointPath && !fresh && existsSync(checkpointPath)) {
    const checkpoint = json<{ start: string; pages: ExtractedPage[]; queue: string[]; visited: string[]; seen: string[]; warnings: string[]; stills: string[]; hints?: VisualHints; exclusions?: HarvestExclusion[]; discovery?: [string, HarvestDiscovery][] }>(checkpointPath);
    if (checkpoint.start === start) {
      pages.push(...checkpoint.pages.filter(p => !isErrorPage(p))); queue.splice(0, queue.length, ...checkpoint.queue);
      for (const p of checkpoint.pages.filter(isErrorPage)) warnings.push(`Excluded error page from resumed capture: ${p.url}`);
      for (const url of checkpoint.visited) visited.add(url);
      for (const url of checkpoint.seen) seen.add(url);
      for (const [url, meta] of checkpoint.discovery || []) discovery.set(url, meta);
      warnings.push(...checkpoint.warnings.filter(w => !checkpoint.queue.length || !/browser error|empty document|unvisited|transient/i.test(w))); stills.push(...checkpoint.stills); hints = checkpoint.hints;
      exclusions.push(...(checkpoint.exclusions || []));
      console.log(`Resuming captured crawl: ${pages.length} pages, ${queue.length} URLs pending`);
    }
  }
  const snapshot = () => ({ version: 2 as const, start, pages, queue, visited: [...visited], seen: [...seen], warnings, stills, hints, exclusions, discovery: [...discovery] });
  const checkpoint = () => persistCheckpoint(checkpointPath, snapshot());
  const retryUrls: string[] = [];

  try {
    while (queue.length) {
      if (maxPages !== undefined && pages.length >= maxPages) {
        warnings.push(`Emergency maxPages=${maxPages} reached; ${queue.length} URL(s) left unvisited.`);
        break;
      }
      const url = queue.shift()!;
      if (visited.has(url)) continue;
      // Persist the in-flight URL before navigation so interruption cannot silently drop it.
      queue.unshift(url); checkpoint(); queue.shift();
      visited.add(url);

      const page = (await context.newPage()) as unknown as BrowserPage;
      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        if (response && !response.ok()) {
          const status = response.status();
          misses.push({
            url,
            status,
            error: `HTTP ${status}`,
            kind: status >= 500 ? "transport" : "http",
          });
          if (status >= 500) retryUrls.push(url);
          continue;
        }
        const finalUrl = page.url();
        if (!finalUrl.startsWith("http") || !sameSite(finalUrl, start)) {
          misses.push({ url, error: finalUrl, kind: "non-http" });
          continue;
        }
        await page.waitForTimeout(800);
        try {
          await page.waitForLoadState("networkidle", { timeout: 2000 });
        } catch {
          /* SPA may never idle */
        }
        await scrollPage(page);

        const html = await page.content();
        if (!html || html.length < 50) {
          misses.push({ url, kind: "empty", error: "empty document" });
          retryUrls.push(url);
          continue;
        }
        const extracted = extractPage(html, finalUrl);
        if ((response && !response.ok()) || isErrorPage(extracted)) {
          misses.push({ url, kind: "error-page", error: "Soft error page" });
          continue;
        }
        if (isErrorPage(extractPage(await page.content(), finalUrl))) {
          misses.push({ url, kind: "error-page", error: "Soft error page" });
          continue;
        }
        if (pages.some(p => p.url === finalUrl)) continue;
        const extras = await collectRenderedExtras(page);
        mergeExtras(extracted, extras, finalUrl);

        extracted.url = finalUrl;
        const signature = (p: ExtractedPage) => JSON.stringify([p.title, p.description, p.headings, p.paragraphs]);
        const duplicate = pages.find(p => signature(p) === signature(extracted));
        if (duplicate) {
          extracted.aliasOf = duplicate.aliasOf || duplicate.url;
          pages.push(extracted);
          console.log(`  alias: ${finalUrl} → ${extracted.aliasOf}`);
          continue; // Identical shells with relative links must not grow an infinite URL tree.
        }
        pages.push(extracted);
        console.log(`  page ${pages.length}: ${finalUrl} (${extracted.paragraphs.length} paras, ${extracted.images.length} images)`);

        const priority = crawlPriority(finalUrl, start);
        if (stillsDir && (priority === 0 || priority === 1)) {
          await captureStill(page, stillsDir, priority === 0 ? "home.png" : "about.png", stills);
        }
        if (priority === 0 && !hints) {
          try {
            hints = await captureHints(page);
          } catch {
            /* computed style is optional */
          }
        }

        for (const href of extras.hrefs) enqueue(queue, seen, href, start, discovery, { provenance: "nav", discoveredFrom: finalUrl });
        for (const link of extracted.links) {
          enqueue(queue, seen, link.href, start, discovery, {
            provenance: link.relative ? "in-body-relative" : "nav",
            discoveredFrom: finalUrl,
          });
        }
      } catch (err) {
        retryUrls.push(url);
        misses.push({ url, kind: "transport", error: err instanceof Error ? err.message : "error" });
        console.warn(`  fail: ${url} — ${err instanceof Error ? err.message : "error"}`);
      } finally {
        await page.close().catch(() => undefined);
        checkpoint();
      }
    }
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  if (!pages.length) warnings.push("Playwright crawl returned no HTML pages.");
  const captured = capturedPathSet(pages);
  for (const miss of misses) {
    const exclusion = classifyMiss({ ...miss, discovery: discovery.get(miss.url), captured, sitemapPaths });
    exclusions.push(exclusion);
    warnings.push(formatExclusion(exclusion));
  }
  for (const url of retryUrls) { visited.delete(url); queue.push(url); }
  checkpoint();
  for (const w of warnings) console.warn(`  warn: ${w}`);
  return { startUrl: start, pages, warnings, engine: "playwright", hints, stills, exclusions, unvisited: [...queue] };
}
