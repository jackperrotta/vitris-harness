import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from 'node:crypto';
import { parseFrontmatter } from "../compile/frontmatter.ts";
import { fileToPath, defaultTitleFromPath } from "../compile/paths.ts";
import {
  compileAllPages,
  compileSite,
  robotsTxt,
  siteCss,
  siteIslands,
  sitemapXml,
  beaconJs,
} from "../compile/site.ts";
import { themeCss, mergeTheme } from "../theme.ts";
import { COOKIE_COMPLIANCE_PATH } from "../runtime/cookie-compliance.ts";
import { motionAssetHref, motionJs } from "../runtime/scroll-motion.generated.ts";
import type { Catalog, PageSource, SiteConfig, ThemeTokens } from "../types.ts";
import { connectForms } from '../forms/frontend.ts';
import type { PublicForm } from '../forms/config.ts';

export type BuildSiteInput = {
  site: SiteConfig;
  pages: PageSource[];
  theme: Partial<ThemeTokens>;
  catalog: Catalog;
  backendOrigin?: string;
  /** @deprecated Use backendOrigin. */
  kernelOrigin?: string;
  outDir: string;
  themeHref?: string;
  publicOrigin?: string;
  forms?: PublicForm[];
  webAnalyticsToken?: string;
};

async function walkHtmlFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkHtmlFiles(full, base)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      out.push(relative(base, full).replace(/\\/g, "/"));
    }
  }
  return out;
}

export async function loadSiteCatalog(siteDir: string): Promise<Catalog> {
  const catalog: Catalog = {};
  try {
    const entries = await readdir(join(siteDir, "components"), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = String(entry.name);
      const dir = join(siteDir, "components", name);
      let html: string;
      let css: string;
      try {
        html = await readFile(join(dir, "template.html"), "utf8");
        css = await readFile(join(dir, "styles.css"), "utf8");
      } catch {
        continue;
      }
      let island: string | null = null;
      try {
        island = await readFile(join(dir, "island.js"), "utf8");
      } catch {
        island = null;
      }
      catalog[name] = { html, css, island };
    }
  } catch {
    return catalog;
  }
  return catalog;
}

export async function loadSitePages(siteDir: string): Promise<PageSource[]> {
  const pagesDir = join(siteDir, "pages");
  const files = await walkHtmlFiles(pagesDir);
  const pages: PageSource[] = [];
  for (const file of files.sort()) {
    const raw = await readFile(join(pagesDir, file), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const path = fileToPath(file);
    pages.push({
      path,
      file,
      title: meta.title || defaultTitleFromPath(path),
      description: meta.description,
      indexing: path === '/404' ? 'noindex' : meta.indexing === "noindex" || meta.indexing === "index" ? meta.indexing : undefined,
      lang: meta.lang,
      body,
    });
  }
  return pages;
}

export async function loadSiteDir(dir: string): Promise<{
  site: SiteConfig;
  theme: Partial<ThemeTokens>;
  pages: PageSource[];
  catalog: Catalog;
}> {
  const site = JSON.parse(await readFile(join(dir, "site.json"), "utf8")) as SiteConfig;
  let theme: Partial<ThemeTokens> = {};
  try {
    theme = JSON.parse(await readFile(join(dir, "theme", "defaults.json"), "utf8")) as Partial<ThemeTokens>;
  } catch {
    theme = {};
  }
  const pages = await loadSitePages(dir);
  const catalog = await loadSiteCatalog(dir);
  return { site, theme, pages, catalog };
}

export async function buildSite(input: BuildSiteInput): Promise<string[]> {
  const backendOrigin = input.backendOrigin || input.kernelOrigin || "";
  const theme = mergeTheme(input.theme);
  const themeHref = input.themeHref ?? "/theme.css";
  const envName = process.env.VITRIS_SITE_ENVIRONMENT;
  const site: SiteConfig = envName === "preview" || envName === "production" ? { ...input.site, environment: envName } : input.site;
  const compiled = compileAllPages(site, input.pages, input.catalog, backendOrigin);
  const pageAssets: Record<string, { css: string; js: string | null }> = {};
  const routeAssets = new Map<string, string>();
  const asset = (body: string, ext: string) => {
    const path = `/assets/immutable/${createHash('sha256').update(body).digest('hex')}.${ext}`;
    routeAssets.set(path, body); return path;
  };
  for (const page of compiled) {
    const js = siteIslands([page], input.catalog);
    pageAssets[page.path] = { css: asset(siteCss([page], input.catalog), 'css'), js: js ? asset(js, 'js') : null };
  }
  const files = compileSite({
    site,
    pages: input.pages,
    catalog: input.catalog,
    kernelOrigin: backendOrigin,
    themeHref,
    publicOrigin: input.publicOrigin,
    pageAssets,
    webAnalyticsToken: input.webAnalyticsToken,
  });

  const written: string[] = [];
  await mkdir(input.outDir, { recursive: true });
  await mkdir(join(input.outDir, 'assets/immutable'), { recursive: true });
  for (const [path, body] of routeAssets) await writeFile(join(input.outDir, path.slice(1)), body, 'utf8');

  for (const file of files) {
    const rel =
      file.path === "/"
        ? "index.html"
        : `${file.path.replace(/^\//, "").replace(/\/$/, "")}/index.html`;
    const dest = join(input.outDir, rel);
    await mkdir(join(dest, ".."), { recursive: true });
    await writeFile(dest, connectForms(file.html, backendOrigin, file.path, input.forms || []), "utf8");
    written.push(rel);
  }

  await writeFile(join(input.outDir, "site.css"), siteCss(compiled, input.catalog), "utf8");
  await writeFile(join(input.outDir, "theme.css"), themeCss(theme), "utf8");
  if (backendOrigin) await writeFile(join(input.outDir, "beacon.js"), beaconJs, "utf8");
  await writeFile(join(input.outDir, "robots.txt"), robotsTxt(input.publicOrigin), "utf8");
  await writeFile(
    join(input.outDir, "sitemap.xml"),
    sitemapXml(
      compiled.map((p) => p.path),
      input.publicOrigin,
      [COOKIE_COMPLIANCE_PATH, ...(site.indexing === "noindex" ? compiled.map(page => page.path) : compiled.filter((page) => page.indexing === "noindex").map((page) => page.path))],
      Boolean(backendOrigin),
    ),
    "utf8",
  );
  const islands = siteIslands(compiled, input.catalog);
  if (islands) await writeFile(join(input.outDir, "islands.js"), islands, "utf8");
  if (compiled.some(page=>page.usesMotion)) {
    await writeFile(join(input.outDir,motionAssetHref.slice(1)),motionJs,"utf8");
    written.push(motionAssetHref.slice(1));
  }
  if (islands) written.push("islands.js");
  written.push("site.css", "theme.css", "beacon.js", "robots.txt", "sitemap.xml");
  return written;
}

export async function fetchLiveContent(
  kernelOrigin: string,
  slug: string,
  token: string,
): Promise<{
  site: SiteConfig;
  theme: Partial<ThemeTokens>;
} | null> {
  const res = await fetch(`${kernelOrigin.replace(/\/$/, "")}/api/deploy/${encodeURIComponent(slug)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    site: SiteConfig;
    theme: Partial<ThemeTokens>;
  };
}
