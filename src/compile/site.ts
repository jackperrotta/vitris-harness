import { escapeHtml } from "../html.ts";
import { beaconJs } from "../runtime/beacon.ts";
import { cookieComplianceHtml, COOKIE_COMPLIANCE_PATH } from "../runtime/cookie-compliance.ts";
import { beforeAfterJs } from "../runtime/before-after.ts";
import { carouselJs } from "../runtime/carousel.ts";
import { headerJs } from "../runtime/header.ts";
import { experienceJs, experienceArrivalBootstrap } from "../runtime/experience.ts";
import { leadsJs } from "../runtime/leads.ts";
import { lightboxJs } from "../runtime/lightbox.ts";
import { motionAssetHref } from "../runtime/scroll-motion.generated.ts";
import { tabsJs } from "../runtime/tabs.ts";
import type { Catalog, CompiledPage, PageSource, SiteConfig } from "../types.ts";
import { flattenBody, instrumentSections, rewriteLeadForms, wrapMain } from "./flatten.ts";
import { defaultTitleFromPath } from "./paths.ts";
import { primitivesCss } from "./primitives.ts";
import { prepareMotion } from "./scroll-motion.ts";
import { compileIcons } from './icons.ts';
import { iconCss } from '../icons/index.ts';

export { beaconJs };

export const baseCss = `*, *::before, *::after { box-sizing: border-box; }
html {
  -webkit-text-size-adjust: 100%;
  scroll-padding-top: calc(var(--header-h) + var(--space-3));
}
body {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--step-1);
  background: var(--color-bg);
  color: var(--color-text);
  line-height: 1.6;
}
h1, h2, h3, h4 {
  font-family: var(--font-display);
  font-weight: 600;
  margin: 0;
  text-wrap: balance;
  overflow-wrap: anywhere;
}
h1 { font-size: var(--step-5); line-height: 1.05; letter-spacing: -0.03em; }
h2 { font-size: var(--step-3); line-height: 1.15; letter-spacing: -0.025em; }
h3 { font-size: var(--step-2); line-height: 1.25; letter-spacing: -0.015em; }
h4 { font-size: var(--step-1); line-height: 1.3; letter-spacing: -0.01em; }
p { margin: 0 0 var(--space-4); text-wrap: pretty; }
p:last-child { margin-bottom: 0; }
a { color: inherit; }
a:hover { text-decoration-color: var(--color-accent); }
img { max-width: 100%; height: auto; display: block; }
svg { display: inline-block; vertical-align: middle; }
ul, ol { margin: 0 0 var(--space-4); padding-inline-start: 1.25rem; }
ul:last-child, ol:last-child { margin-bottom: 0; }
small { font-size: var(--step-0); }
:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 3px;
}
.skip-link {
  position: absolute;
  left: var(--space-4);
  top: var(--space-4);
  z-index: 100;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  text-decoration: none;
  font-weight: 600;
  transform: translateY(-160%);
  transition: transform 160ms ease;
}
.skip-link:focus {
  transform: translateY(0);
}
.visually-hidden {
  position: absolute !important;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.wrap {
  width: min(var(--max-width), calc(100% - 2rem));
  margin-inline: auto;
}
@media (min-width: 720px) {
  .wrap { width: min(var(--max-width), calc(100% - 2.5rem)); }
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: var(--tap-min);
  padding: 0.75rem 1.5rem;
  line-height: 1.2;
  white-space: nowrap;
  background: var(--color-accent);
  color: var(--color-accent-text);
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 180ms ease, color 180ms ease, border-color 180ms ease;
}
.btn:hover {
  background: color-mix(in srgb, var(--color-accent) 88%, var(--color-text));
}
.btn-outline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: var(--tap-min);
  padding: 0.75rem 1.5rem;
  line-height: 1.2;
  white-space: nowrap;
  background: transparent;
  color: var(--color-text);
  text-decoration: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 180ms ease, color 180ms ease, border-color 180ms ease;
}
.btn-outline:hover {
  border-color: var(--color-text);
  background: color-mix(in srgb, var(--color-text) 6%, transparent);
}
.btn-arrow {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: var(--tap-min);
  white-space: nowrap;
  font-weight: 600;
  text-decoration: none;
  color: var(--color-text);
  transition: color 180ms ease;
}
.btn-arrow::after {
  content: "→";
  transition: transform 180ms ease;
}
.btn-arrow:hover {
  color: var(--color-accent);
}
.btn-arrow:hover::after { transform: translateX(3px); }
.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: var(--tap-min);
  padding: 0.75rem 1.5rem;
  line-height: 1.2;
  white-space: nowrap;
  background: transparent;
  color: var(--color-text);
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 180ms ease, color 180ms ease, background-color 180ms ease;
}
.btn-ghost:hover {
  background: color-mix(in srgb, var(--color-text) 6%, transparent);
}
.c-cookie-banner {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 200;
  padding: var(--space-4) 0 calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
  background: var(--color-surface);
  color: var(--color-text);
  border-top: 1px solid var(--color-border);
  box-shadow: 0 -8px 24px color-mix(in srgb, var(--color-text) 8%, transparent);
}
.c-cookie-banner__inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.c-cookie-banner__title {
  margin: 0 0 var(--space-2);
  font-family: var(--font-display);
  font-size: var(--step-1);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.c-cookie-banner__text {
  margin: 0;
  font-size: var(--step-0);
  color: var(--color-muted);
  max-width: 42rem;
}
.c-cookie-banner__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.c-cookie-banner__more {
  min-height: var(--tap-min);
  display: inline-flex;
  align-items: center;
  font-weight: 600;
  font-size: var(--step-0);
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 0.15em;
  cursor: pointer;
}
.c-cookie-banner__more:hover { color: var(--color-accent); }
@media (max-width: 719px) {
  .c-cookie-banner {
    /* A delayed first-visit beacon must not insert a banner into document flow. */
    max-height: 50dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}
@media (min-width: 720px) {
  .c-cookie-banner__inner {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-5);
  }
  .c-cookie-banner__actions { flex-shrink: 0; }
}
.c-lead-ok {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: var(--space-3) var(--space-4);
  margin: 0 0 var(--space-4);
  color: var(--color-text);
}
.c-lead-hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.c-cookie-page {
  padding: var(--space-7) 0 var(--space-8);
}
.c-cookie-page h1 {
  margin-bottom: var(--space-3);
}
.c-cookie-page h2 {
  margin: var(--space-6) 0 var(--space-3);
}
.c-cookie-page .wrap { max-width: 42rem; }
.c-cookie-page p { color: var(--color-muted); }
.c-cookie-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

/* Scroll reveal — armed only after islands mark above-fold .is-in */
[data-reveal] {
  --reveal-x: 0;
  --reveal-y: var(--reveal-dist, 16px);
}
[data-reveal-strength="whisper"] {
  --reveal-dist: 8px;
  --reveal-dur: 400ms;
  --reveal-ease: cubic-bezier(0.22, 1, 0.36, 1);
}
[data-reveal-strength="editorial"] {
  --reveal-dist: 16px;
  --reveal-dur: 550ms;
  --reveal-ease: cubic-bezier(0.22, 1, 0.36, 1);
}
[data-reveal-strength="noticeable"] {
  --reveal-dist: 24px;
  --reveal-dur: 650ms;
  --reveal-ease: cubic-bezier(0.22, 1, 0.36, 1);
}
[data-reveal-from="up"] { --reveal-x: 0; --reveal-y: var(--reveal-dist, 16px); }
[data-reveal-from="down"] { --reveal-x: 0; --reveal-y: calc(var(--reveal-dist, 16px) * -1); }
[data-reveal-from="left"] { --reveal-x: calc(var(--reveal-dist, 16px) * -1); --reveal-y: 0; }
[data-reveal-from="right"] { --reveal-x: var(--reveal-dist, 16px); --reveal-y: 0; }
[data-reveal-child][data-reveal-from="up"] {
  --reveal-child-x: 0;
  --reveal-child-y: var(--reveal-dist, 16px);
}
[data-reveal-child][data-reveal-from="down"] {
  --reveal-child-x: 0;
  --reveal-child-y: calc(var(--reveal-dist, 16px) * -1);
}
[data-reveal-child][data-reveal-from="left"] {
  --reveal-child-x: calc(var(--reveal-dist, 16px) * -1);
  --reveal-child-y: 0;
}
[data-reveal-child][data-reveal-from="right"] {
  --reveal-child-x: var(--reveal-dist, 16px);
  --reveal-child-y: 0;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;

function applySiteVars(html: string, site: SiteConfig): string {
  return html
    .replaceAll("{{siteName}}", escapeHtml(site.name))
    .replaceAll("{{slug}}", escapeHtml(site.slug || ""));
}

export function compilePage(
  page: PageSource,
  catalog: Catalog,
  site: SiteConfig,
  kernelOrigin: string,
): CompiledPage {
  const withVars = applySiteVars(page.body, site);
  const flat = flattenBody(withVars, catalog, site);
  // Also expand vars inside component templates that survived flatten
  let body = applySiteVars(wrapMain(flat.html, catalog), site);
  body = compileIcons(body, page.path);
  body = instrumentSections(body, site);
  body = rewriteLeadForms(body, kernelOrigin, page.path);
  const motion = prepareMotion(body, site);
  body = motion.html;
  // Resolve /stock/… to absolute kernel URLs in src/href attributes
  const origin = kernelOrigin.replace(/\/$/, "");
  body = body.replace(
    /\b(src|href)="(\/stock\/[^"]+)"/g,
    (_m, attr: string, path: string) => `${attr}="${origin}${path}"`,
  );

  return {
    path: page.path,
    title: page.title || defaultTitleFromPath(page.path),
    description: page.description,
    indexing: page.indexing,
    lang: page.lang,
    bodyHtml: body,
    used: flat.used,
    usesMotion: motion.usesMotion,
    motionTargets: motion.targets,
    usesLeadForm: flat.usesLeadForm || /data-lead-form/i.test(body),
  };
}

export function usedComponents(pages: CompiledPage[]): string[] {
  const names = new Set<string>();
  for (const page of pages) {
    for (const name of page.used) names.add(name);
  }
  return [...names];
}

export function siteCss(pages: CompiledPage[], catalog: Catalog): string {
  const chunks = [baseCss, primitivesCss];
  if (pages.some(page => page.bodyHtml.includes('data-vitris-icon='))) chunks.push(iconCss);
  for (const name of usedComponents(pages)) {
    const css = catalog[name]?.css;
    if (css) chunks.push(css);
  }
  return chunks.join("\n");
}

const KERNEL_ISLANDS: Record<string, string> = {
  experience: experienceJs,
  header: headerJs,
  carousel: carouselJs,
  tabs: tabsJs,
  "before-after": beforeAfterJs,
  lightbox: lightboxJs,
};

function detectKernelIslands(html: string): string[] {
  const found = new Set<string>();
  const re = /data-island=["']([a-z0-9-]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) found.add(m[1]!);
  return [...found];
}

export function siteIslands(pages: CompiledPage[], catalog: Catalog): string {
  const chunks: string[] = [];
  const used = usedComponents(pages);
  for (const name of used) {
    const island = catalog[name]?.island;
    if (island) chunks.push(island);
  }
  if (pages.some((p) => p.usesLeadForm)) chunks.push(leadsJs);
  const needed = new Set<string>();
  for (const page of pages) {
    for (const id of detectKernelIslands(page.bodyHtml)) needed.add(id);
  }
  for (const id of needed) {
    const js = KERNEL_ISLANDS[id];
    if (js) chunks.push(js);
  }
  return chunks.join("\n");
}

function buildEntityJsonLd(site: SiteConfig): string | null {
  if (!site.telephone && !site.email && !site.address && !site.businessType) return null;
  const type = site.businessType || (site.address ? "LocalBusiness" : "Organization");
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": type,
    name: site.name,
  };
  if (site.telephone) data.telephone = site.telephone;
  if (site.email) data.email = site.email;
  if (site.address) data.address = { "@type": "PostalAddress", streetAddress: site.address };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function renderDocument(opts: {
  site: SiteConfig;
  page: CompiledPage;
  kernelOrigin: string;
  themeHref: string;
  assetsPrefix?: string;
  publicOrigin?: string;
  islandsHref?: string | null;
  styleHref?: string;
  webAnalyticsToken?: string;
}): string {
  const { site, page, kernelOrigin, themeHref } = opts;
  const prefix = opts.assetsPrefix ?? "";
  let body = page.bodyHtml;
  if (prefix) body = body.replace(/href="\//g, `href="${prefix}/`);

  const islands = opts.islandsHref;
  const islandTag = islands ? `<script type="module" src="${prefix}${islands}"></script>` : "";
  const motionTag = page.usesMotion ? `<script src="${prefix}${motionAssetHref}" defer></script>` : "";
  const arrivalOptIn=body.match(/data-experience-arrival=["']([^"']+)["']/);
  const pauseKey=body.match(/data-experience-pause-key=["']([^"']+)["']/)?.[1];
  const arrivalTag=islands&&arrivalOptIn&&detectKernelIslands(body).includes('experience')?`<script>${experienceArrivalBootstrap(pauseKey).replace(/<\/script/gi,'<\\/script')}</script>`:'';
  const authoredTitle=page.title.trim(),brandTitle=site.name.trim();
  const normalizedTitle=authoredTitle.toLocaleLowerCase(),normalizedBrand=brandTitle.toLocaleLowerCase();
  const title = normalizedTitle===normalizedBrand || normalizedTitle.endsWith(' '+normalizedBrand)
    ? authoredTitle : `${authoredTitle} — ${brandTitle}`;
  const description = page.description || site.name;
  const canonicalPath = page.path === "/" ? "/" : page.path.replace(/\/$/, "");
  const canonical = opts.publicOrigin
    ? `<link rel="canonical" href="${escapeHtml(opts.publicOrigin.replace(/\/$/, "") + canonicalPath)}">`
    : "";
  const jsonLd = buildEntityJsonLd(site);
  const jsonLdTag = jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : "";
  const noindex = site.environment === "preview" || page.indexing === "noindex" || site.indexing === "noindex";
  const robots = noindex ? `\n  <meta name="robots" content="noindex">` : "";
  const lang = page.lang || "en";
  if (opts.webAnalyticsToken && !/^[a-f0-9]{32}$/i.test(opts.webAnalyticsToken)) throw new Error('webAnalyticsToken must be a Cloudflare public 32-character hexadecimal token');
  const webAnalytics = opts.webAnalyticsToken && site.environment !== 'preview' ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${JSON.stringify({ token: opts.webAnalyticsToken })}'></script>` : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}"${site.scrollMotion?.policy ? ` data-motion-policy="${site.scrollMotion.policy}"` : ""}${kernelOrigin ? ` data-backend="${escapeHtml(kernelOrigin)}" data-kernel="${escapeHtml(kernelOrigin)}"` : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">${robots}
  ${arrivalTag}
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  ${canonical}
  <link rel="stylesheet" href="${prefix}${opts.styleHref || '/site.css'}">
  <link rel="stylesheet" href="${themeHref}">
  ${jsonLdTag}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${body}
${islandTag}
${kernelOrigin ? `<script src="${prefix}/beacon.js" defer></script>` : ""}
${motionTag}
${webAnalytics}
</body>
</html>
`;
}

export function robotsTxt(publicOrigin?: string): string {
  return `User-agent: *
Allow: /

${publicOrigin ? `Sitemap: ${publicOrigin.replace(/\/$/, '')}/sitemap.xml\n` : ''}
`;
}

export function sitemapXml(paths: string[], publicOrigin?: string, exclude: string[] = [], includeCookie = true): string {
  const omitted = new Set([...exclude, '/404', '/404.html'].map(path => (path === "/" ? "/" : path.replace(/\/$/, ""))));
  const all = (includeCookie && !paths.includes(COOKIE_COMPLIANCE_PATH) ? [...paths, COOKIE_COMPLIANCE_PATH] : paths)
    .filter(path => !omitted.has(path === "/" ? "/" : path.replace(/\/$/, "")));
  const origin = (publicOrigin || "").replace(/\/$/, "");
  const urls = all
    .map((path) => {
      const p = path === "/" ? "/" : path.replace(/\/$/, "");
      const loc = origin ? `${origin}${p}` : p;
      return `  <url><loc>${escapeHtml(loc)}</loc></url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function compileSite(opts: {
  site: SiteConfig;
  pages: PageSource[];
  catalog: Catalog;
  kernelOrigin: string;
  themeHref: string;
  assetsPrefix?: string;
  publicOrigin?: string;
  pageAssets?: Record<string, { css: string; js: string | null }>;
  webAnalyticsToken?: string;
}): { path: string; html: string }[] {
  const compiled = opts.pages.map((page) =>
    compilePage(page, opts.catalog, opts.site, opts.kernelOrigin),
  );
  const islands = siteIslands(compiled, opts.catalog);
  const islandsHref = islands ? "/islands.js" : null;

  const files = compiled.map((page) => ({
    path: page.path,
    html: renderDocument({
      site: opts.site,
      page,
      kernelOrigin: opts.kernelOrigin,
      themeHref: opts.themeHref,
      assetsPrefix: opts.assetsPrefix,
      publicOrigin: opts.publicOrigin,
      islandsHref: opts.pageAssets?.[page.path]?.js ?? (opts.pageAssets ? null : islandsHref),
      styleHref: opts.pageAssets?.[page.path]?.css,
      webAnalyticsToken: opts.webAnalyticsToken,
    }),
  }));

  // Kernel-owned cookie compliance page
  const cookiePage: CompiledPage = {
    path: COOKIE_COMPLIANCE_PATH,
    indexing: "noindex",
    title: "Cookie compliance",
    description: "How this site uses first-party analytics cookies, and how to change your preference.",
    bodyHtml: cookieComplianceHtml(opts.site.name),
    used: [],
    usesMotion: false,
    usesLeadForm: false,
  };
  if (opts.kernelOrigin) files.push({
    path: COOKIE_COMPLIANCE_PATH,
    html: renderDocument({
      site: opts.site,
      page: cookiePage,
      kernelOrigin: opts.kernelOrigin,
      themeHref: opts.themeHref,
      assetsPrefix: opts.assetsPrefix,
      publicOrigin: opts.publicOrigin,
      islandsHref,
    }),
  });

  return files;
}

/** Expose compiled pages for CSS/JS asset generation. */
export function compileAllPages(
  site: SiteConfig,
  pages: PageSource[],
  catalog: Catalog,
  kernelOrigin: string,
): CompiledPage[] {
  return pages.map((page) => compilePage(page, catalog, site, kernelOrigin));
}
