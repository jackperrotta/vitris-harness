#!/usr/bin/env node
/**
 * Run from a site repo (after create-site). Playwright harvest → onboarding/*.
 *
 *   cd ../acme && npm install && npx playwright install chromium && npm run harvest
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDevVars } from "./lib/r2.ts";
import { gatherOnboard, persistOnboard } from "./onboard/run.ts";
import { gradeHarvest } from "../src/agent/grade.ts";
import { normalizeSourceUrl } from "./onboard/prompt.ts";

if (process.argv.includes("--help")) {
  console.log("Usage: vitris-harvest --site DIR");
  process.exit(0);
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function findKernelRoot(siteRoot: string): string {
  if (process.env.VITRIS_HARNESS || process.env.VITRIS_KERNEL) return resolve((process.env.VITRIS_HARNESS || process.env.VITRIS_KERNEL)!);
  const pkgPath = join(siteRoot, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const spec = pkg.dependencies?.["@vitris/harness"] || pkg.dependencies?.["@vitris/kernel"];
    if (typeof spec === "string" && spec.startsWith("file:")) {
      return resolve(siteRoot, spec.slice("file:".length));
    }
  }
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function sourceFromBrief(siteRoot: string): string {
  const launchPath = join(siteRoot, "launch.json");
  if (existsSync(launchPath)) {
    const launch = JSON.parse(readFileSync(launchPath, "utf8")) as { sourceUrl?: string };
    if (launch.sourceUrl) return launch.sourceUrl;
  }
  const briefPath = join(siteRoot, "onboarding", "brief.json");
  if (!existsSync(briefPath)) return "";
  try {
    const brief = JSON.parse(readFileSync(briefPath, "utf8")) as { sourceUrl?: string };
    return typeof brief.sourceUrl === "string" ? brief.sourceUrl : "";
  } catch {
    return "";
  }
}

function slugFromSite(siteRoot: string): string {
  const sitePath = join(siteRoot, "site.json");
  if (existsSync(sitePath)) {
    try {
      const site = JSON.parse(readFileSync(sitePath, "utf8")) as { slug?: string; name?: string };
      if (site.slug) return String(site.slug);
    } catch {
      /* ignore */
    }
  }
  const pkg = JSON.parse(readFileSync(join(siteRoot, "package.json"), "utf8")) as { name?: string };
  return (pkg.name || "site").toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function nameFromSite(siteRoot: string): string | undefined {
  const sitePath = join(siteRoot, "site.json");
  if (!existsSync(sitePath)) return undefined;
  try {
    const site = JSON.parse(readFileSync(sitePath, "utf8")) as { name?: string };
    return site.name;
  } catch {
    return undefined;
  }
}

const usage = `Usage: npm run harvest -- [--from URL] [--max-pages N] [--skip-images] [--fetch-only] [--no-prompt]
Run from the site repo after create-site. Reads source URL from onboarding/brief.json unless --from is set.

--max-pages is an emergency abort only. Prefer an unbounded crawl; the queue already visits home, about, and work before legal/shop. Do not pass 35 by habit.

Requires: npx playwright install chromium`;

async function main(): Promise<void> {
  if (hasFlag("--help") || hasFlag("-h")) {
    console.log(usage);
    return;
  }

  const siteRoot = resolve(process.cwd());
  if (!existsSync(join(siteRoot, "site.json")) || !existsSync(join(siteRoot, "package.json"))) {
    console.error("Run harvest from a Vitris site repo (needs site.json).");
    process.exit(1);
    return;
  }

  const kernelRoot = findKernelRoot(siteRoot);
  loadDevVars(kernelRoot);

  const fromArg = arg("--from") || sourceFromBrief(siteRoot);
  if (!fromArg) {
    if (gradeHarvest(siteRoot).ok) { console.log("Blank starter: harvest not required"); return; }
    console.error("No source URL. Pass --from https://old-site.example or set sourceUrl in onboarding/brief.json.");
    process.exit(1);
    return;
  }

  const sourceUrl = normalizeSourceUrl(fromArg);
  const slug = (arg("--slug") || slugFromSite(siteRoot)).toLowerCase().replace(/[^a-z0-9-]/g, "");
  const name = arg("--name") || nameFromSite(siteRoot);
  const skipImages = hasFlag("--skip-images");
  const fetchOnly = hasFlag("--fetch-only");
  const noPrompt = hasFlag("--no-prompt");
  const maxPagesArg = arg("--max-pages");
  const maxPages = maxPagesArg ? Math.max(1, Number(maxPagesArg) || 1) : undefined;
  if (maxPages !== undefined) {
    console.warn(
      `--max-pages ${maxPages} is an emergency abort. Prefer unbounded harvest; home/about/work are already crawled first.`,
    );
  }

  console.log(`Harvest ${sourceUrl}`);
  console.log(`  site: ${siteRoot}`);
  console.log(`  kernel: ${kernelRoot}`);

  const gathered = await gatherOnboard({
    kernelRoot,
    siteRoot,
    slug,
    sourceUrl,
    name,
    maxPages,
    noPrompt,
    skipImages,
    fetchOnly,
    fresh: hasFlag("--fresh"),
  });

  persistOnboard(siteRoot, gathered.brief, {
    pages: gathered.pages,
    copyMarkdown: gathered.copyMarkdown,
    exclusions: gathered.crawl.exclusions,
    engine: gathered.crawl.engine,
    unvisited: gathered.crawl.unvisited,
  });

  const brief = gathered.brief;
  if (!brief.pages.length) {
    console.error("Harvest wrote no pages. See warnings in onboarding/brief.json.");
    process.exit(1);
    return;
  }

  console.log(`Harvest complete: ${brief.pages.length} page(s), ${brief.images.length} image(s)`);
  console.log(`  outline: ${join(siteRoot, "onboarding", "outline.md")}`);
  console.log(`  media: ${join(siteRoot, "onboarding", "media.md")}`);
  console.log(`  inventory: ${join(siteRoot, "onboarding", "harvest-inventory.json")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
