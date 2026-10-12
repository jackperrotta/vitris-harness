import {
  extractPage,
  parseSitemapLocs,
  sameSite,
  shouldSkipPath,
  shouldSkipQueryUrl,
  type ExtractedPage,
} from "../../src/onboard/extract.ts";
import { insertByCrawlPriority } from "../../src/onboard/crawl-order.ts";
import type { VisualHints } from "../../src/onboard/brief.ts";
import { isErrorPage } from "../../src/onboard/quality.ts";
import {
  capturedPathSet,
  classifyMiss,
  formatExclusion,
  type HarvestDiscovery,
  type HarvestExclusion,
} from "../../src/onboard/harvest-inventory.ts";
import { existsSync } from "node:fs";
import { json, save } from "../../src/agent/artifacts.ts";

const ua = "VitrisOnboard/0.1 (authorized site migration; https://vitris.local)";

export type CrawlResult = {
  startUrl: string;
  pages: ExtractedPage[];
  warnings: string[];
  engine: "fetch" | "playwright";
  hints?: VisualHints;
  stills?: string[];
  exclusions: HarvestExclusion[];
  unvisited: string[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FetchDoc =
  | { ok: true; url: string; body: string; contentType: string; status: number }
  | { ok: false; status?: number; error: string };

async function fetchDoc(url: string, accept: string): Promise<FetchDoc> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": ua, accept },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    const contentType = res.headers.get("content-type") || "";
    const body = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true, url: res.url || url, body, contentType, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error" };
  }
}

function normalizePageUrl(href: string): string | null {
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.href;
  } catch {
    return null;
  }
}

export function enqueue(
  queue: string[],
  seen: Set<string>,
  href: string,
  startUrl: string,
  discovery?: Map<string, HarvestDiscovery>,
  meta?: HarvestDiscovery,
): void {
  const url = normalizePageUrl(href);
  if (!url) return;
  if (!sameSite(url, startUrl)) return;
  let path = "/";
  try {
    path = new URL(url).pathname;
  } catch {
    return;
  }
  if (shouldSkipPath(path)) return;
  if (shouldSkipQueryUrl(url)) return;
  if (seen.has(url)) return;
  seen.add(url);
  if (discovery && !discovery.has(url)) {
    discovery.set(url, meta || { provenance: "in-body-relative" });
  }
  insertByCrawlPriority(queue, url, startUrl);
}

export async function sitemapUrls(startUrl: string, warnings: string[]): Promise<string[]> {
  const origin = new URL(startUrl).origin;
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/wp-sitemap.xml`,
  ];

  const robots = await fetchDoc(`${origin}/robots.txt`, "text/plain");
  if (robots.ok) {
    for (const m of robots.body.matchAll(/sitemap:\s*(\S+)/gi)) {
      candidates.unshift(m[1]!);
    }
  }

  const locs: string[] = [];
  const seenMaps = new Set<string>();
  const mapQueue = [...candidates];

  while (mapQueue.length) {
    const mapUrl = mapQueue.shift()!;
    if (seenMaps.has(mapUrl)) continue;
    seenMaps.add(mapUrl);

    const xml = await fetchDoc(mapUrl, "application/xml,text/xml,text/plain");
    if (!xml.ok) continue;
    const found = parseSitemapLocs(xml.body);
    if (!found.length) continue;

    if (/<sitemapindex/i.test(xml.body)) {
      for (const child of found) {
        if (!seenMaps.has(child)) mapQueue.push(child);
      }
    } else {
      locs.push(...found);
    }
  }

  if (!locs.length) warnings.push("No sitemap found; falling back to homepage links.");
  return locs;
}

type Checkpoint = {
  version: 2;
  start: string;
  pages: ExtractedPage[];
  queue: string[];
  visited: string[];
  seen: string[];
  warnings: string[];
  stills: string[];
  hints?: VisualHints;
  exclusions?: HarvestExclusion[];
  discovery?: [string, HarvestDiscovery][];
};

export function persistCheckpoint(path: string | undefined, payload: Checkpoint): void {
  if (!path) return;
  try {
    save(path, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    payload.warnings.push(`Skipped (persistence error): checkpoint write failed — ${msg}`);
    console.warn(`  persistence: ${msg}`);
  }
}

function pageSignature(p: ExtractedPage): string {
  return JSON.stringify([p.title, p.description, p.headings, p.paragraphs]);
}

/**
 * Fetch-based crawl. Optional maxPages is an emergency abort only (undefined = unbounded).
 * The queue visits home / about / work before legal and shop.
 */
export async function crawlSite(
  startUrl: string,
  maxPages?: number,
  checkpointPath?: string,
  fresh = false,
): Promise<CrawlResult> {
  const warnings: string[] = [];
  const start = normalizePageUrl(startUrl) || startUrl;
  const seen = new Set<string>();
  const queue: string[] = [];
  const discovery = new Map<string, HarvestDiscovery>();
  enqueue(queue, seen, start, start, discovery, { provenance: "start" });

  const fromSitemap = await sitemapUrls(start, warnings);
  const sitemapPaths = new Set(fromSitemap.map((loc) => {
    try { return new URL(loc).pathname.replace(/\/+$/, "") || "/"; } catch { return loc; }
  }));
  for (const loc of fromSitemap) enqueue(queue, seen, loc, start, discovery, { provenance: "sitemap" });

  const pages: ExtractedPage[] = [];
  const visited = new Set<string>();
  const exclusions: HarvestExclusion[] = [];
  const misses: { url: string; status?: number; error?: string; kind: "http" | "transport" | "empty" | "error-page" | "off-site" | "non-http" }[] = [];
  const stills: string[] = [];
  let hints: VisualHints | undefined;

  if (checkpointPath && !fresh && existsSync(checkpointPath)) {
    const checkpoint = json<Checkpoint>(checkpointPath);
    if (checkpoint.start === start) {
      pages.push(...checkpoint.pages.filter((p) => !isErrorPage(p)));
      queue.splice(0, queue.length, ...checkpoint.queue);
      for (const p of checkpoint.pages.filter(isErrorPage)) {
        warnings.push(`Excluded error page from resumed capture: ${p.url}`);
      }
      for (const url of checkpoint.visited) visited.add(url);
      for (const url of checkpoint.seen) seen.add(url);
      for (const [url, meta] of checkpoint.discovery || []) discovery.set(url, meta);
      warnings.push(...checkpoint.warnings.filter((w) => !checkpoint.queue.length || !/browser error|empty document|unvisited|transient/i.test(w)));
      stills.push(...(checkpoint.stills || []));
      hints = checkpoint.hints;
      exclusions.push(...(checkpoint.exclusions || []));
      console.log(`Resuming captured crawl: ${pages.length} pages, ${queue.length} URLs pending`);
    }
  }

  const snapshot = (): Checkpoint => ({
    version: 2, start, pages, queue, visited: [...visited], seen: [...seen], warnings, stills, hints, exclusions, discovery: [...discovery],
  });
  const checkpoint = () => persistCheckpoint(checkpointPath, snapshot());
  const retryUrls: string[] = [];

  while (queue.length) {
    if (maxPages !== undefined && pages.length >= maxPages) {
      warnings.push(`Emergency maxPages=${maxPages} reached; ${queue.length} URL(s) left unvisited.`);
      break;
    }
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    queue.unshift(url); checkpoint(); queue.shift();
    visited.add(url);

    const res = await fetchDoc(url, "text/html,application/xhtml+xml");
    if (!res.ok) {
      const kind = res.status && res.status < 500 ? "http" : "transport";
      misses.push({ url, status: res.status, error: res.error, kind });
      if (kind === "transport") retryUrls.push(url);
      checkpoint();
      continue;
    }
    if (!sameSite(res.url, start)) {
      misses.push({ url, error: `${url} → ${res.url}`, kind: "off-site" });
      checkpoint();
      continue;
    }
    if (!/html/i.test(res.contentType) && !res.body.trimStart().startsWith("<")) {
      checkpoint();
      continue;
    }

    const page = extractPage(res.body, res.url);
    if (isErrorPage(page)) {
      misses.push({ url, kind: "error-page", error: "Soft error page" });
      checkpoint();
      continue;
    }
    if (pages.some((p) => p.url === res.url)) { checkpoint(); continue; }
    const duplicate = pages.find((p) => pageSignature(p) === pageSignature(page));
    if (duplicate) {
      page.aliasOf = duplicate.aliasOf || duplicate.url;
      pages.push(page);
      checkpoint();
      continue;
    }
    pages.push(page);
    for (const link of page.links) {
      enqueue(queue, seen, link.href, start, discovery, {
        provenance: link.relative ? "in-body-relative" : "nav",
        discoveredFrom: res.url,
      });
    }
    await sleep(120);
    checkpoint();
  }

  const captured = capturedPathSet(pages);
  for (const miss of misses) {
    const exclusion = classifyMiss({ ...miss, discovery: discovery.get(miss.url), captured, sitemapPaths });
    exclusions.push(exclusion);
    warnings.push(formatExclusion(exclusion));
  }

  if (!pages.length) warnings.push("Crawl returned no HTML pages.");
  for (const url of retryUrls) { visited.delete(url); queue.push(url); }
  checkpoint();
  return { startUrl: start, pages, warnings, engine: "fetch", exclusions, stills, hints, unvisited: [...queue] };
}
