/** Harvest exclusion classification, inventory, and operator scope. */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const HARVEST_EXCLUSION_CLASSES = [
  "source-missing",
  "crawler-invalid",
  "off-site",
  "error-page",
  "transient",
] as const;
export type HarvestExclusionClass = (typeof HARVEST_EXCLUSION_CLASSES)[number];

export const HARVEST_PROVENANCE = ["sitemap", "nav", "in-body-relative", "redirect", "start"] as const;
export type HarvestProvenance = (typeof HARVEST_PROVENANCE)[number];

export type HarvestDiscovery = {
  provenance: HarvestProvenance;
  discoveredFrom?: string;
  rawHref?: string;
};

export type HarvestExclusion = {
  url: string;
  class: HarvestExclusionClass;
  provenance: HarvestProvenance;
  reason: string;
  httpStatus?: number;
  rootAbsolute?: string;
  discoveredFrom?: string;
};

export type HarvestInventory = {
  version: 1;
  engine: "playwright" | "fetch";
  startUrl: string;
  pages: { url: string; title: string; aliasOf?: string }[];
  media: {
    files: string[];
    failed: { source: string; reason: string }[];
  };
  exclusions: HarvestExclusion[];
  unvisited: string[];
};

export type HarvestScope = {
  version: 1;
  excludeClasses?: HarvestExclusionClass[];
  maxPages?: number;
  notes: string;
};

export function isPlaywrightLaunchFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /playwright package not installed|browserType\.launch|executable doesn'?t exist|failed to launch|chromium\.launch|npx playwright install/i.test(msg);
}

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return url;
  }
}

export function capturedPathSet(pages: { url: string }[]): Set<string> {
  return new Set(pages.map((p) => pathOf(p.url)));
}

export function rootAbsoluteCounterpart(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    u.pathname = `/${parts[parts.length - 1]}`;
    u.search = "";
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

export function isCrawlerInvalidUrl(
  url: string,
  captured: Set<string>,
  discovery?: HarvestDiscovery,
  sitemapPaths?: Set<string>,
): boolean {
  const counterpart = rootAbsoluteCounterpart(url);
  if (!counterpart) return false;
  const rootPath = pathOf(counterpart);
  if (captured.has(rootPath)) return true;
  if (sitemapPaths?.has(rootPath)) return true;
  if (discovery?.provenance === "in-body-relative" && (captured.has(rootPath) || sitemapPaths?.has(rootPath))) {
    return true;
  }
  return false;
}

export function classifyMiss(opts: {
  url: string;
  status?: number;
  error?: string;
  kind: "http" | "transport" | "empty" | "error-page" | "off-site" | "non-http";
  discovery?: HarvestDiscovery;
  captured: Set<string>;
  sitemapPaths?: Set<string>;
}): HarvestExclusion {
  const provenance = opts.discovery?.provenance || "in-body-relative";
  const discoveredFrom = opts.discovery?.discoveredFrom;
  if (opts.kind === "off-site" || opts.kind === "non-http") {
    return {
      url: opts.url,
      class: "off-site",
      provenance,
      reason: opts.error || "Off-site or non-http",
      discoveredFrom,
    };
  }
  if (opts.kind === "transport" || opts.kind === "empty" || (opts.status !== undefined && opts.status >= 500)) {
    return {
      url: opts.url,
      class: "transient",
      provenance,
      reason: opts.error || `HTTP ${opts.status || "error"}`,
      httpStatus: opts.status,
      discoveredFrom,
    };
  }
  if (opts.kind === "error-page") {
    return {
      url: opts.url,
      class: "error-page",
      provenance,
      reason: opts.error || "Soft error page",
      httpStatus: opts.status,
      discoveredFrom,
    };
  }
  const counterpart = rootAbsoluteCounterpart(opts.url);
  if (isCrawlerInvalidUrl(opts.url, opts.captured, opts.discovery, opts.sitemapPaths)) {
    return {
      url: opts.url,
      class: "crawler-invalid",
      provenance,
      reason: `Crawler-invented URL (relative join${discoveredFrom ? ` from ${discoveredFrom}` : ""}); not a source page`,
      httpStatus: opts.status,
      rootAbsolute: counterpart || undefined,
      discoveredFrom,
    };
  }
  return {
    url: opts.url,
    class: "source-missing",
    provenance,
    reason: opts.error || `HTTP ${opts.status || 404} — source page missing`,
    httpStatus: opts.status,
    discoveredFrom,
  };
}

export function formatExclusion(ex: HarvestExclusion): string {
  const status = ex.httpStatus ? ` — HTTP ${ex.httpStatus}` : "";
  switch (ex.class) {
    case "crawler-invalid":
      return `Excluded crawler-invalid URL: ${ex.url}${status} (${ex.reason})`;
    case "source-missing":
      return `Excluded missing source page: ${ex.url}${status}`;
    case "error-page":
      return `Excluded error page: ${ex.url}${status}`;
    case "off-site":
      return `Skipped off-site: ${ex.url}${ex.reason ? ` — ${ex.reason}` : ""}`;
    case "transient":
      return `Skipped (transient): ${ex.url} — ${ex.reason}`;
  }
}

/** Warnings that mean the crawl did not finish, unless operator scope covers them. */
export function isIncompleteCrawlWarning(warning: string): boolean {
  if (/crawler-invalid|missing source page|Excluded error page|Skipped off-site|persistence error/i.test(warning)) {
    return false;
  }
  return /unvisited|fetch failed|browser error|empty document|Skipped \(transient\)/i.test(warning);
}

export function loadHarvestScope(siteRoot: string): HarvestScope | null {
  const path = join(siteRoot, "onboarding", "harvest-scope.json");
  if (!existsSync(path)) return null;
  try {
    const scope = JSON.parse(readFileSync(path, "utf8")) as HarvestScope;
    if (!scope || scope.version !== 1 || !scope.notes?.trim()) return null;
    return scope;
  } catch {
    return null;
  }
}

export function loadHarvestInventory(siteRoot: string): HarvestInventory | null {
  const path = join(siteRoot, "onboarding", "harvest-inventory.json");
  if (!existsSync(path)) return null;
  try {
    const inventory = JSON.parse(readFileSync(path, "utf8")) as HarvestInventory;
    if (!inventory || inventory.version !== 1) return null;
    return inventory;
  } catch {
    return null;
  }
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

export function assembleHarvestInventory(opts: {
  engine: "playwright" | "fetch";
  startUrl: string;
  pages: { url: string; title: string; aliasOf?: string }[];
  exclusions: HarvestExclusion[];
  unvisited: string[];
  siteRoot: string;
  images?: { sourceUrl: string; localPath?: string; role?: string; error?: string }[];
}): HarvestInventory {
  const harvestDir = join(opts.siteRoot, "media", "harvest");
  const files = listFiles(harvestDir).map((f) => f.slice(opts.siteRoot.length).replaceAll("\\", "/").replace(/^\//, "/"));
  const failed = (opts.images || [])
    .filter((img) => img.role === "failed" || img.error)
    .map((img) => ({ source: img.sourceUrl, reason: img.error || "download failed" }));
  return {
    version: 1,
    engine: opts.engine,
    startUrl: opts.startUrl,
    pages: opts.pages.map((p) => ({ url: p.url, title: p.title, aliasOf: p.aliasOf })),
    media: { files, failed },
    exclusions: opts.exclusions,
    unvisited: opts.unvisited,
  };
}

export function harvestIncompleteFailures(siteRoot: string, warnings: string[]): string[] {
  const scope = loadHarvestScope(siteRoot);
  const inventory = loadHarvestInventory(siteRoot);
  const allowed = new Set(scope?.excludeClasses || []);
  const failures: string[] = [];

  if (inventory) {
    const blocking = inventory.exclusions.filter((ex) => ex.class === "transient" && !allowed.has("transient"));
    if (blocking.length) {
      failures.push(
        `harvest incomplete; ${blocking.length} transient crawl failure(s) — resolve or record onboarding/harvest-scope.json`,
      );
    }
    const unvisited = inventory.unvisited || [];
    if (unvisited.length && !(scope?.notes && (scope.maxPages || allowed.size))) {
      failures.push(
        `harvest incomplete; ${unvisited.length} URL(s) left unvisited — finish the crawl or record an explicit operator scope decision`,
      );
    }
    return failures;
  }

  const incomplete = warnings.filter(isIncompleteCrawlWarning);
  if (!incomplete.length) return [];
  if (scope?.notes) return [];
  failures.push("harvest incomplete; resolve crawl failures or record an explicit operator scope decision");
  return failures;
}
