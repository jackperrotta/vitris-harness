import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  assembleAudit,
  assembleBrief,
  collectCandidateImages,
  emptyResearch,
  inferRegister,
  missingCritical,
  type OnboardBrief,
  type VisualHints,
} from "../../src/onboard/brief.ts";
import { buildCopyFiles, renderMediaGuide, renderOutline } from "../../src/onboard/outline.ts";
import { crawlSiteBrowser } from "./browser.ts";
import { crawlSite } from "./crawl.ts";
import { copyHarvestToSite, uploadImages } from "./images.ts";
import { promptMissingFacts } from "./prompt.ts";
import { assembleHarvestInventory, isPlaywrightLaunchFailure } from "../../src/onboard/harvest-inventory.ts";
import { save } from "../../src/agent/artifacts.ts";

export type GatherOptions = {
  kernelRoot: string;
  siteRoot: string;
  slug: string;
  sourceUrl: string;
  name?: string;
  /** Emergency abort only — undefined means crawl every same-site page. Do not pass 35 by habit. */
  maxPages?: number;
  noPrompt: boolean;
  skipImages?: boolean;
  /** Force fetch crawler (skip Playwright). */
  fetchOnly?: boolean;
  fresh?: boolean;
};

function writeOnboardingArtifacts(dest: string, brief: OnboardBrief, extras?: {
  pages?: import("../../src/onboard/extract.ts").ExtractedPage[];
}): void {
  const dir = join(dest, "onboarding");
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "copy"), { recursive: true });

  writeFileSync(join(dir, "brief.json"), `${JSON.stringify(briefForDisk(brief), null, 2)}\n`);
  writeFileSync(join(dir, "outline.md"), renderOutline({ brief }));
  writeFileSync(join(dir, "media.md"), renderMediaGuide(brief));

  const audit = assembleAudit({
    sourceUrl: brief.sourceUrl,
    pages: extras?.pages || [],
    crawledAt: brief.crawledAt,
  });
  if (!extras?.pages?.length && brief.pages.length) {
    audit.pages = brief.pages.map((p) => ({
      url: p.url,
      title: p.title,
      description: p.description,
      canonical: p.canonical,
      lang: undefined,
      h1Count: p.audit?.h1Count ?? 0,
      missingAlts: p.audit?.missingAlts ?? 0,
      unlabeledInputs: p.audit?.unlabeledInputs ?? 0,
      hasCanonical: p.audit?.hasCanonical ?? false,
      hasLang: p.audit?.hasLang ?? false,
      hasJsonLd: p.audit?.hasJsonLd ?? false,
      titleLength: p.audit?.titleLength ?? p.title.length,
      descriptionLength: p.audit?.descriptionLength ?? p.description.length,
    }));
    audit.summary = {
      pageCount: audit.pages.length,
      pagesMissingTitle: audit.pages.filter((p) => !p.title).length,
      pagesMissingDescription: audit.pages.filter((p) => !p.description).length,
      pagesMultipleH1: audit.pages.filter((p) => p.h1Count > 1).length,
      pagesZeroH1: audit.pages.filter((p) => p.h1Count === 0).length,
      totalMissingAlts: audit.pages.reduce((n, p) => n + p.missingAlts, 0),
      totalUnlabeledInputs: audit.pages.reduce((n, p) => n + p.unlabeledInputs, 0),
    };
  }
  writeFileSync(join(dir, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`);

  const research = emptyResearch(brief.business.social || []);
  writeFileSync(join(dir, "research.json"), `${JSON.stringify(research, null, 2)}\n`);

  writeFileSync(
    join(dir, "README.md"),
    `# Onboarding harvest

This folder is the crawl output for **${brief.business.name || brief.slug}**.

| File | Purpose |
|------|---------|
| \`outline.md\` | Human-readable sitemap, facts, image catalog, gaps |
| \`copy/*.md\` | Full visible copy per crawled URL |
| \`brief.json\` | Machine index (facts, pages, images) |
| \`audit.json\` | Crawl-time SEO/a11y inventory; \`webVitals\` filled by research node |
| \`research.json\` | Reviews, social, goals — complete via the research graph node |
| \`media.md\` | Harvest catalog + shortlist hints; the media node owns full asset disposition |
| \`harvest-inventory.json\` | Kept pages, original-media files, failed downloads, classified exclusions |
| \`harvest-scope.json\` | Optional operator bound (exclude classes / maxPages / notes) |

## Next

1. Build the evidence-backed business interpretation and review it.
2. Inspect and account for all media, including acquisition failures.
3. Follow the graph through direction, storyboard, copy, implementation, browser checks and independent reviews.

All successful images live under \`media/harvest/\`. Theme tokens are established by the **direction** node (harvest only stores hints in brief.visual).

See \`harvest-inventory.json\` for kept pages, original-media files, failed downloads, and an explicit class/reason for every exclusion (\`source-missing\`, \`crawler-invalid\`, \`off-site\`, \`error-page\`, \`transient\`). Operator bounds belong in \`harvest-scope.json\`.

Source: ${brief.sourceUrl || "(blank starter)"}
Engine note: see \`warnings\` in brief.json.
`,
  );
}

export function persistOnboard(
  dest: string,
  brief: OnboardBrief,
  extras?: {
    pages?: import("../../src/onboard/extract.ts").ExtractedPage[];
    copyMarkdown?: Map<string, { slug: string; markdown: string }>;
    exclusions?: import("../../src/onboard/harvest-inventory.ts").HarvestExclusion[];
    engine?: "playwright" | "fetch";
    unvisited?: string[];
  },
): void {
  if (extras?.copyMarkdown) {
    const copyDir = join(dest, "onboarding", "copy");
    mkdirSync(copyDir, { recursive: true });
    for (const { slug, markdown } of extras.copyMarkdown.values()) {
      writeFileSync(join(copyDir, `${slug}.md`), markdown.endsWith("\n") ? markdown : `${markdown}\n`);
    }
  }
  copyHarvestToSite(dest, brief.images);
  // Preserve raw evidence by capture ID; interpretation writes separate contracts.
  const rawDir = join(dest, "onboarding", "raw");
  mkdirSync(rawDir, { recursive: true });
  const capture = join(rawDir, `${String(brief.crawledAt).replace(/[^a-zA-Z0-9-]/g, "-")}.json`);
  if (!existsSync(capture)) writeFileSync(capture, JSON.stringify(briefForDisk(brief), null, 2) + "\n");
  // Theme is confirmed by the brand node — harvest only stores hints on brief.visual.
  if (brief.business.name) {
    const sitePath = join(dest, "site.json");
    if (existsSync(sitePath)) {
      const site = JSON.parse(readFileSync(sitePath, "utf8")) as Record<string, unknown>;
      site.name = brief.business.name;
      writeFileSync(sitePath, `${JSON.stringify(site, null, 2)}\n`);
    }
  }
  writeOnboardingArtifacts(dest, brief, { pages: extras?.pages });
  save(join(dest, "onboarding", "harvest-inventory.json"), assembleHarvestInventory({
    engine: extras?.engine || "playwright",
    startUrl: brief.sourceUrl,
    pages: extras?.pages || brief.pages,
    exclusions: extras?.exclusions || [],
    unvisited: extras?.unvisited || [],
    siteRoot: dest,
    images: brief.images,
  }));
}

function briefForDisk(brief: OnboardBrief): OnboardBrief {
  return {
    ...brief,
    images: brief.images.map(({ scratchPath: _drop, ...img }) => img),
  };
}

async function crawlWithFallback(
  sourceUrl: string,
  maxPages: number | undefined,
  fetchOnly: boolean,
  kernelRoot: string,
  stillsDir?: string,
  checkpointPath?: string,
  fresh = false,
): Promise<Awaited<ReturnType<typeof crawlSite>> & { hints?: VisualHints; stills?: string[] }> {
  if (fetchOnly) {
    const crawl = await crawlSite(sourceUrl, maxPages, checkpointPath, fresh);
    return crawl;
  }
  try {
    console.log("Crawling with Playwright (rendered DOM)…");
    return await crawlSiteBrowser(sourceUrl, maxPages, kernelRoot, stillsDir, checkpointPath, fresh);
  } catch (err) {
    if (!isPlaywrightLaunchFailure(err)) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Playwright crawl unavailable (${msg}). Falling back to fetch HTML crawl.`);
    const crawl = await crawlSite(sourceUrl, maxPages, checkpointPath, fresh);
    crawl.warnings.unshift(`Playwright unavailable — used fetch fallback. ${msg}`);
    return crawl;
  }
}

export async function gatherOnboard(opts: GatherOptions): Promise<{
  brief: OnboardBrief;
  pages: import("../../src/onboard/extract.ts").ExtractedPage[];
  copyMarkdown: Map<string, { slug: string; markdown: string }>;
  crawl: Awaited<ReturnType<typeof crawlSite>>;
}> {
  const crawl = await crawlWithFallback(
    opts.sourceUrl,
    opts.maxPages,
    Boolean(opts.fetchOnly),
    opts.kernelRoot,
    join(opts.siteRoot, "onboarding", "stills"),
    join(opts.siteRoot, "onboarding", "crawl-progress.json"),
    Boolean(opts.fresh),
  );
  console.log(`Crawled ${crawl.pages.length} page(s) from ${crawl.startUrl} via ${crawl.engine}`);
  if (crawl.warnings.length) {
    for (const w of crawl.warnings) console.warn(`  warn: ${w}`);
  }

  const copyMarkdown = buildCopyFiles(crawl.pages);
  const copyFiles = new Map<string, string>();
  for (const [url, { slug }] of copyMarkdown) {
    copyFiles.set(url, `${slug}.md`);
  }

  let images = [] as Awaited<ReturnType<typeof uploadImages>>;
  if (!opts.skipImages) {
    const candidates = collectCandidateImages(crawl.pages);
    const hasRemote = false; // Local preview never publishes media.
    console.log(`Downloading ${candidates.length} unique image candidate(s)…`);
    images = await uploadImages(candidates, {
      kernelRoot: opts.kernelRoot,
      slug: opts.slug,
      local: false,
      remote: hasRemote,
      captureKey: createHash("sha256").update(JSON.stringify(crawl.pages)).digest("hex").slice(0, 20),
    });
    const ok = images.filter((i) => i.scratchPath).length;
    console.log(`Images: ${ok} downloaded locally, ${images.length - ok} skipped or failed`);
  }

  let brief = assembleBrief({
    sourceUrl: crawl.startUrl,
    slug: opts.slug,
    pages: crawl.pages,
    images,
    warnings: crawl.warnings,
    seed: opts.name ? { name: opts.name } : undefined,
    copyFiles,
  });
  if (brief.visual) {
    brief.visual = {
      ...brief.visual,
      hints: crawl.hints || brief.visual.hints,
      stills: crawl.stills?.length ? crawl.stills : brief.visual.stills,
    };
  }
  brief.business = await promptMissingFacts(brief.business, { noPrompt: opts.noPrompt });
  brief.missing = missingCritical(brief.business);
  if (brief.visual) {
    // Hint only — interpret confirms register.
    brief.visual.register = inferRegister(crawl.pages, brief.business);
  }
  return { brief, pages: crawl.pages, copyMarkdown, crawl };
}

export async function gatherBlankOnboard(opts: {
  slug: string;
  name: string;
  noPrompt: boolean;
}): Promise<{
  brief: OnboardBrief;
  pages: import("../../src/onboard/extract.ts").ExtractedPage[];
  copyMarkdown: Map<string, { slug: string; markdown: string }>;
}> {
  let brief = assembleBrief({
    sourceUrl: "",
    slug: opts.slug,
    pages: [],
    seed: { name: opts.name },
    warnings: ["Blank starter — no existing URL crawled."],
  });
  brief.business = await promptMissingFacts(brief.business, { noPrompt: opts.noPrompt });
  brief.missing = missingCritical(brief.business);
  return { brief, pages: [], copyMarkdown: new Map() };
}
