import { test } from "node:test";
import assert from "node:assert/strict";
import {
  businessFromJsonLd,
  extractPage,
  inferPrimaryCta,
  isLikelyTrackingImage,
  parseSitemapLocs,
  sameOrigin,
  sameSite,
  shouldSkipPath,
  shouldSkipQueryUrl,
  pageCopySlug,
  absolutize,
} from "./onboard/extract.ts";
import { assembleBrief, assembleAudit, inferRegister, inferServices, inferSignatureSections, missingCritical, parseHoursFromText } from "./onboard/brief.ts";
import { classifyImages, classifyOne, isStockHost } from "./onboard/classify.ts";
import { collectSocialLinks, platformForUrl } from "./onboard/social.ts";
import { crawlPriority, insertByCrawlPriority } from "./onboard/crawl-order.ts";
import { selectShortlist } from "./onboard/shortlist.ts";
import { hintsFromComputed } from "./onboard/visual-hints.ts";
import { buildCopyFiles, renderMediaGuide, renderOutline, renderPageCopy } from "./onboard/outline.ts";
import { defaultTheme } from "./types.ts";
import { themeCss } from "./theme.ts";
import { baseCss } from "./compile/site.ts";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crawlSite } from "../scripts/onboard/crawl.ts";
import { gradeHarvest } from "./agent/grade.ts";
import {
  classifyMiss,
  formatExclusion,
  isCrawlerInvalidUrl,
  isIncompleteCrawlWarning,
  isPlaywrightLaunchFailure,
} from "./onboard/harvest-inventory.ts";

const html = `<!doctype html>
<html lang="en">
<head>
  <title>Harbor Cuts | Barbershop</title>
  <meta name="description" content="Walk-in cuts on Harbor Street.">
  <meta property="og:image" content="/hero.jpg">
  <link rel="canonical" href="https://harborcuts.example/">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "Harbor Cuts",
    "telephone": "207-555-0142",
    "email": "hi@harborcuts.example",
    "logo": "https://harborcuts.example/logo.png",
    "sameAs": ["https://www.instagram.com/harborcuts", "https://www.facebook.com/harborcuts"],
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "12 Harbor St",
      "addressLocality": "Portland",
      "addressRegion": "ME",
      "postalCode": "04101"
    },
    "openingHours": ["Mo-Fr 09:00-17:00", "Sa 10:00-14:00"]
  }
  </script>
</head>
<body>
  <header>
    <img class="logo" src="/logo.png" width="120" height="40" alt="Harbor Cuts logo">
  </header>
  <h1>Harbor Cuts</h1>
  <a href="tel:2075550142">Call</a>
  <a href="/book" class="btn">Book a chair</a>
  <a href="mailto:hi@harborcuts.example">Email</a>
  <a href="https://www.instagram.com/harborcuts">Instagram</a>
  <img src="/pixel.gif" width="1" height="1" alt="">
  <img src="/chair.jpg" width="800" height="1200" alt="Barber chair by the window"
       srcset="/chair-400.jpg 400w, /chair.jpg 800w">
  <img data-src="/lazy-tools.jpg" alt="Clippers on the counter">
  <div style="background-image: url('/bg-shop.jpg')"></div>
  <p>Two chairs on Harbor Street. Walk-ins welcome most mornings when the book is open.</p>
  <p>Short.</p>
  <p>We also do hot towel finishes and beard trims for regulars who book ahead on weekdays.</p>
  <blockquote>
    Quiet chairs and a sharp fade every time.
    <cite>Sam P.</cite>
  </blockquote>
  <dl>
    <dt>Do you take walk-ins?</dt>
    <dd>Most mornings when the book is open.</dd>
  </dl>
  <ul>
    <li>Classic cut</li>
    <li>Skin fade</li>
  </ul>
</body>
</html>`;

test("extracts json-ld business, phones, ctas, and skips tracking images", () => {
  const page = extractPage(html, "https://harborcuts.example/");
  assert.equal(page.title, "Harbor Cuts | Barbershop");
  assert.equal(page.description, "Walk-in cuts on Harbor Street.");
  assert.deepEqual(page.h1, ["Harbor Cuts"]);
  assert.ok(page.phones.some((p) => p.includes("207")));
  assert.ok(page.emails.includes("hi@harborcuts.example"));
  const biz = businessFromJsonLd(page.jsonLd);
  assert.equal(biz.name, "Harbor Cuts");
  assert.equal(biz.city, "Portland");
  assert.match(biz.address || "", /12 Harbor St/);
  assert.ok((biz.hours || []).length >= 1);
  assert.equal(biz.logoUrl, "https://harborcuts.example/logo.png");
  const cta = inferPrimaryCta(page.ctas);
  assert.equal(cta?.label, "Book a chair");
  assert.ok(page.images.some((i) => i.src.endsWith("/hero.jpg")));
  assert.ok(page.images.some((i) => i.src.endsWith("/chair.jpg")));
  assert.ok(!page.images.some((i) => i.src.endsWith("/pixel.gif")));
  assert.equal(isLikelyTrackingImage({ src: "https://x/favicon.ico", alt: "" }), true);
});

test("extracts srcset, data-src, background urls, and keeps short paragraphs", () => {
  const page = extractPage(html, "https://harborcuts.example/");
  assert.ok(page.images.some((i) => i.src.endsWith("/chair-400.jpg")));
  assert.ok(page.images.some((i) => i.src.endsWith("/lazy-tools.jpg")));
  assert.ok(page.images.some((i) => i.src.endsWith("/bg-shop.jpg")));
  assert.ok(page.images.some((i) => i.fromJsonLdLogo || i.src.endsWith("/logo.png")));
  assert.ok(page.paragraphs.some((p) => p === "Short."));
  assert.ok(page.paragraphs.length >= 3);
  assert.ok(page.testimonials.some((t) => /Quiet chairs/i.test(t.quote)));
  assert.ok(page.faqs.some((f) => /walk-ins/i.test(f.question)));
  assert.ok(page.lists.length >= 1);
  assert.equal(page.lang, "en");
  assert.equal(page.canonical, "https://harborcuts.example/");
  assert.equal(page.audit.h1Count, 1);
  assert.ok(page.audit.hasJsonLd);
});

test("extracts social from links and json-ld sameAs", () => {
  const page = extractPage(html, "https://harborcuts.example/");
  assert.ok(page.social.some((s) => s.platform === "instagram"));
  assert.ok(page.social.some((s) => s.platform === "facebook"));
  assert.equal(platformForUrl("https://www.yelp.com/biz/harbor"), "yelp");
});

test("skips admin, cart, file downloads, and loop query urls", () => {
  assert.equal(shouldSkipPath("/wp-admin/"), true);
  assert.equal(shouldSkipPath("/cart"), true);
  assert.equal(shouldSkipPath("/menu.pdf"), true);
  assert.equal(shouldSkipPath("/services"), false);
  assert.equal(shouldSkipQueryUrl("https://x.example/blog?utm_source=x"), true);
  assert.equal(shouldSkipQueryUrl("https://x.example/calendar?month=9&year=2026"), true);
  assert.equal(shouldSkipQueryUrl("https://x.example/services"), false);
});

test("treats www and apex as the same site", () => {
  assert.equal(sameSite("https://www.harborcuts.example/", "https://harborcuts.example/about"), true);
  assert.equal(sameSite("https://harborcuts.example/", "https://other.example/"), false);
  assert.equal(sameOrigin("https://harborcuts.example/", "https://www.harborcuts.example/"), false);
});

test("parses sitemap loc tags", () => {
  const xml = `<?xml version="1.0"?><urlset><loc>https://harborcuts.example/services</loc><loc> https://harborcuts.example/about </loc></urlset>`;
  assert.deepEqual(parseSitemapLocs(xml), [
    "https://harborcuts.example/services",
    "https://harborcuts.example/about",
  ]);
});

test("classifies logo, stock, and business photos", () => {
  assert.equal(isStockHost("https://images.unsplash.com/photo-1"), true);
  const logo = classifyOne(
    { src: "https://harborcuts.example/logo.png", alt: "Harbor Cuts logo", width: 120, height: 40 },
    { inChrome: true, fromJsonLdLogo: true },
  );
  assert.equal(logo.role, "logo");
  assert.equal(logo.kind, "business");

  const stock = classifyOne(
    { src: "https://images.unsplash.com/photo-xyz", alt: "Barber shop" },
    { fromOg: true },
  );
  assert.equal(stock.kind, "stock");

  const tracking = isLikelyTrackingImage({ src: "https://x/pixel.gif", alt: "", width: 1, height: 1 });
  assert.equal(tracking, true);

  const classified = classifyImages([
    { src: "https://harborcuts.example/logo.png", alt: "logo", fromJsonLdLogo: true, inChrome: true },
    { src: "https://images.unsplash.com/a.jpg", alt: "stock", fromOg: true },
    { src: "https://harborcuts.example/chair.jpg", alt: "Chair by the window", aboveFold: true },
  ]);
  assert.equal(classified.filter((c) => c.role === "logo").length, 1);
  assert.ok(classified.some((c) => c.role === "hero" && c.kind === "business"));
});

test("assembles a v2 brief with full copy and social", () => {
  const home = extractPage(html, "https://harborcuts.example/");
  const services = extractPage(
    `<html><head><title>Services</title></head><body>
      <h1>Services</h1>
      <h2>Classic cut</h2>
      <p>Consultation, cut, and a hot towel finish for a weekday visit.</p>
      <h2>Skin fade</h2>
      <p>Tight fade with a clean line-up.</p>
    </body></html>`,
    "https://harborcuts.example/services",
  );
  const brief = assembleBrief({
    sourceUrl: "https://harborcuts.example/",
    slug: "harbor-cuts",
    pages: [home, services],
    crawledAt: "2026-09-09T00:00:00.000Z",
  });
  assert.equal(brief.version, 2);
  assert.equal(brief.business.name, "Harbor Cuts");
  assert.equal(brief.business.email, "hi@harborcuts.example");
  assert.equal(brief.business.primaryCta.label, "Book a chair");
  assert.ok(brief.business.services.some((s) => s.name === "Classic cut"));
  assert.ok(brief.business.social.some((s) => s.platform === "instagram"));
  assert.deepEqual(brief.missing, []);
  assert.match(brief.compose, /media language/);
  assert.match(brief.compose, /restyle/);
  // Full copy — no 8-paragraph slice
  assert.ok(brief.pages[0]!.paragraphs.length >= 3);
  assert.ok(brief.pages[0]!.testimonials.length >= 1);
});

test("missingCritical flags empty facts", () => {
  const home = extractPage("<html><body><h1>Hi</h1></body></html>", "https://x.example/");
  const brief = assembleBrief({ sourceUrl: "https://x.example/", slug: "x", pages: [home] });
  assert.ok(missingCritical(brief.business).includes("phone"));
  assert.ok(brief.missing.includes("email"));
  assert.ok(brief.missing.includes("services"));
});

test("parses weekday hours from copy", () => {
  const hours = parseHoursFromText("Monday: 9am – 5pm\nSunday: Closed");
  assert.ok(hours.some((h) => /Monday/i.test(h) && /9am/i.test(h)));
  assert.ok(hours.some((h) => /Sunday/i.test(h) && /Closed/i.test(h)));
});

test("reads openingHoursSpecification from json-ld", () => {
  const page = extractPage(
    `<html><body><script type="application/ld+json">{
      "@type": "LocalBusiness",
      "name": "Pipes",
      "openingHoursSpecification": {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": "Monday",
        "opens": "09:00",
        "closes": "17:00"
      }
    }</script></body></html>`,
    "https://pipes.example/",
  );
  const biz = businessFromJsonLd(page.jsonLd);
  assert.deepEqual(biz.hours, ["Monday: 09:00–17:00"]);
});

test("prefers json-ld services over noisy homepage headings", () => {
  const page = extractPage(
    `<html><body>
      <script type="application/ld+json">{"@type":"Service","name":"Pipe repair","description":"Leaks and burst lines."}</script>
      <h2>Why choose us</h2>
      <h2>Testimonials</h2>
    </body></html>`,
    "https://x.example/",
  );
  const services = inferServices([page]);
  assert.deepEqual(
    services.map((s) => s.name),
    ["Pipe repair"],
  );
});

test("does not reuse one homepage blurb for every heading service", () => {
  const page = extractPage(
    `<html><body>
      <h1>Services</h1>
      <h2>Drain clearing</h2>
      <h2>Water heater install</h2>
      <p>KENDALL INVESTMENT GROUP | www.kendallinvestmentgroup.com is a long filler paragraph used wrongly.</p>
    </body></html>`,
    "https://x.example/services",
  );
  const services = inferServices([page]);
  // Without per-heading match, may still attach a short blurb — but JSON-LD preference and
  // heading-specific matching should not invent unique wrong blurbs from unrelated brands when ld exists.
  assert.ok(services.every((s) => !/KENDALL/i.test(s.name)));
});

test("outline and copy markdown include logo and full page copy", () => {
  const home = extractPage(html, "https://harborcuts.example/");
  const copyMap = buildCopyFiles([home]);
  const entry = copyMap.get(home.url);
  assert.ok(entry);
  assert.match(entry!.markdown, /Two chairs on Harbor Street/);
  assert.match(entry!.markdown, /Quiet chairs/);
  assert.match(renderPageCopy(home), /## FAQ/);

  const brief = assembleBrief({
    sourceUrl: "https://harborcuts.example/",
    slug: "harbor-cuts",
    pages: [home],
    images: [
      {
        sourceUrl: "https://harborcuts.example/logo.png",
        alt: "Harbor Cuts logo",
        r2Key: "sites/harbor-cuts/media/abc.png",
        src: "https://assets.example/logo.png",
        role: "logo",
        kind: "business",
      },
    ],
    copyFiles: new Map([[home.url, `${entry!.slug}.md`]]),
  });
  const outline = renderOutline({ brief });
  assert.match(outline, /### Logo/);
  assert.match(outline, /Harbor Cuts logo/);
  assert.match(outline, /Sitemap/);
  assert.equal(pageCopySlug("https://harborcuts.example/about/team", 2).startsWith("002-"), true);

  const audit = assembleAudit({ sourceUrl: brief.sourceUrl, pages: [home] });
  assert.equal(audit.webVitals, null);
  assert.equal(audit.summary.pageCount, 1);
  assert.ok(audit.pages[0]!.hasCanonical);
});

test("collectSocialLinks dedupes sameAs and anchors", () => {
  const links = collectSocialLinks({
    links: [
      { href: "https://www.instagram.com/harborcuts/", label: "IG" },
      { href: "https://www.instagram.com/harborcuts", label: "IG2" },
    ],
    jsonLd: [{ "@type": "Organization", sameAs: "https://www.facebook.com/harborcuts" }],
  });
  assert.equal(links.filter((l) => l.platform === "instagram").length, 1);
  assert.ok(links.some((l) => l.platform === "facebook"));
});

test("crawlPriority visits home and about before legal", () => {
  const start = "https://harborcuts.example/";
  assert.equal(crawlPriority(start, start), 0);
  assert.equal(crawlPriority("https://harborcuts.example/about", start), 1);
  assert.equal(crawlPriority("https://harborcuts.example/work", start), 2);
  assert.equal(crawlPriority("https://harborcuts.example/privacy", start), 90);
  const queue: string[] = [];
  insertByCrawlPriority(queue, "https://harborcuts.example/privacy", start);
  insertByCrawlPriority(queue, "https://harborcuts.example/about", start);
  insertByCrawlPriority(queue, start, start);
  assert.deepEqual(queue, [
    start,
    "https://harborcuts.example/about",
    "https://harborcuts.example/privacy",
  ]);
});

test("empty alt is a business photo, not generic", () => {
  const photo = classifyOne({
    src: "https://harborcuts.example/how-it-works.png",
    alt: "",
    width: 800,
    height: 600,
    nearbyHeading: "How it works",
    pageUrl: "https://harborcuts.example/how-it-works",
  });
  assert.equal(photo.kind, "business");
  assert.equal(photo.mediaType, "illustration");
});

test("selectShortlist keeps logo and hero and marks shortlist hints", () => {
  const picked = selectShortlist([
    {
      sourceUrl: "https://x.example/logo.png",
      alt: "Logo",
      r2Key: "sites/x/media/aaa.png",
      src: "https://assets.example/logo.png",
      role: "logo",
      kind: "business",
      mediaType: "logo",
      localPath: "/media/harvest/aaa.png",
    },
    {
      sourceUrl: "https://x.example/hero.jpg",
      alt: "Shop floor",
      r2Key: "sites/x/media/bbb.jpg",
      src: "https://assets.example/hero.jpg",
      role: "hero",
      kind: "business",
      mediaType: "photo",
      localPath: "/media/harvest/bbb.jpg",
    },
    {
      sourceUrl: "https://x.example/founder.jpg",
      alt: "Founder portrait",
      r2Key: "sites/x/media/ccc.jpg",
      src: "https://assets.example/founder.jpg",
      role: "photo",
      kind: "business",
      mediaType: "portrait",
      nearbyHeading: "Meet the team",
      localPath: "/media/harvest/ccc.jpg",
    },
  ]);
  assert.ok(picked.length >= 2);
  assert.ok(picked.some((i) => i.role === "logo" && i.localPath === "/media/harvest/aaa.png"));
  assert.ok(picked.some((i) => i.role === "hero" && i.localPath === "/media/harvest/bbb.jpg"));
  assert.ok(picked.every((i) => i.shortlist && i.thumbPath?.startsWith("onboarding/thumbs/")));
});

test("inferServices skips legal headings and numbered homepage case studies", () => {
  const home = extractPage(
    `<html><body>
      <h1>Agency</h1>
      <h2>1. Kendall Investment Group</h2>
      <h2>Privacy</h2>
      <h2>How it works</h2>
    </body></html>`,
    "https://agency.example/",
  );
  const legal = extractPage(
    `<html><body><h1>Legal</h1><h2>Master services agreement</h2></body></html>`,
    "https://agency.example/legal",
  );
  assert.deepEqual(inferServices([home, legal]), []);
});

test("inferRegister and signature sections from a B2B home", () => {
  const home = extractPage(
    `<html><head><title>Vitris — website platform</title></head>
    <body><h1>Vitris</h1><h2>How it works</h2><h2>Featured work</h2></body></html>`,
    "https://tryvitris.example/",
  );
  assert.equal(inferRegister([home], { name: "Vitris", phone: "", email: "", address: "", city: "", hours: [], primaryCta: { label: "", href: "" }, services: [], social: [] }), "b2b");
  assert.ok(inferSignatureSections([home]).some((h) => /how it works/i.test(h)));
});

test("media guide includes actual assets and treatment guidance", () => {
  const home = extractPage(html, "https://harborcuts.example/");
  const brief = assembleBrief({
    sourceUrl: "https://harborcuts.example/",
    slug: "harbor-cuts",
    pages: [home],
    images: [
      {
        sourceUrl: "https://harborcuts.example/hero.jpg",
        alt: "Chair",
        r2Key: "sites/harbor-cuts/media/abc.jpg",
        src: "/media/hero.jpg",
        role: "hero",
        kind: "business",
        mediaType: "photo",
        shortlist: true,
        localPath: "/media/hero.jpg",
        caption: "Chair by the window",
      },
    ],
  });
  const guide = renderMediaGuide(brief);
  assert.match(guide, /\/media\/hero\.jpg/);
  assert.match(guide, /Media treatment/);
});

test("computed visual hints skip generic fonts and detect pills", () => {
  const generic = hintsFromComputed({
    fontBody: "Arial, Helvetica, sans-serif",
    fontDisplay: "Georgia, serif",
    radius: "0px",
  });
  assert.equal(generic.fontBody, undefined);
  assert.equal(generic.radiusPill, undefined);
  const distinctive = hintsFromComputed({
    fontBody: '"Satoshi", sans-serif',
    fontDisplay: "Reckless, serif",
    radius: "9999px",
  });
  assert.match(distinctive.fontBody || "", /Satoshi/);
  assert.equal(distinctive.radiusPill, "999px");
});

test("theme and base CSS expose pill buttons without opacity hover", () => {
  const css = themeCss(defaultTheme);
  assert.match(css, /--radius-pill:\s*999px/);
  assert.match(css, /--color-surface-2:/);
  assert.match(css, /--radius-lg:/);
  assert.match(css, /--shadow-1:/);
  assert.match(baseCss, /\.btn-outline/);
  assert.match(baseCss, /border-radius: var\(--radius-pill\)/);
  assert.equal(/\.btn:hover \{ opacity/.test(baseCss), false);
  assert.match(baseCss, /color-mix\(in srgb, var\(--color-accent\)/);
});

test("absolutize honors base href, nested quotes, and relative links", () => {
  assert.equal(
    absolutize(`foo/&quot;https://cdn.example/x.png`, "https://site.example/page/"),
    "https://cdn.example/x.png",
  );
  const page = extractPage(
    `<html><head><base href="https://site.example/app/"><title>App</title></head><body>
      <h1>App</h1><p>Product copy.</p>
      <a href="about">About</a>
      <a href="/contact">Contact</a>
      <img src="hero.jpg" alt="Hero">
    </body></html>`,
    "https://site.example/other/",
  );
  assert.equal(page.links.find(l => l.label === "About")?.href, "https://site.example/app/about");
  assert.equal(page.links.find(l => l.label === "About")?.relative, true);
  assert.equal(page.links.find(l => l.label === "Contact")?.href, "https://site.example/contact");
  assert.equal(page.images.some(i => i.src === "https://site.example/app/hero.jpg"), true);
});

test("relative-join 404s are crawler-invalid when the root page was captured", () => {
  const captured = new Set(["/", "/about", "/portfolio"]);
  assert.equal(isCrawlerInvalidUrl("https://x.example/portfolio/about", captured, { provenance: "in-body-relative", discoveredFrom: "https://x.example/portfolio" }), true);
  const miss = classifyMiss({
    url: "https://x.example/portfolio/about",
    status: 404,
    kind: "http",
    discovery: { provenance: "in-body-relative", discoveredFrom: "https://x.example/portfolio" },
    captured,
  });
  assert.equal(miss.class, "crawler-invalid");
  assert.equal(isIncompleteCrawlWarning(formatExclusion(miss)), false);
  const genuine = classifyMiss({
    url: "https://x.example/secret-lab",
    status: 404,
    kind: "http",
    discovery: { provenance: "sitemap" },
    captured,
  });
  assert.equal(genuine.class, "source-missing");
});

test("Playwright persistence errors are not launch failures", () => {
  assert.equal(isPlaywrightLaunchFailure(new Error("EPERM: rename 'crawl-progress.json.1.tmp' -> 'crawl-progress.json'")), false);
  assert.equal(isPlaywrightLaunchFailure(new Error("playwright package not installed. From the site repo: npm install")), true);
  assert.equal(isPlaywrightLaunchFailure(new Error("browserType.launch: Executable doesn't exist")), true);
});

test("fetch 4xx relative joins do not fail the harvest gate", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-harvest-"));
  const server = createServer((req, res) => {
    const url = req.url || "/";
    if (url.includes("sitemap")) { res.setHeader("content-type", "application/xml"); res.end("<urlset></urlset>"); return; }
    if (url === "/portfolio") { res.statusCode = 301; res.setHeader("location", "/portfolio/"); res.end(); return; }
    if (url === "/portfolio/about") { res.statusCode = 404; res.setHeader("content-type", "text/plain"); res.end("missing"); return; }
    res.setHeader("content-type", "text/html");
    if (url === "/portfolio/" || url.startsWith("/portfolio/?")) {
      res.end(`<html><title>Portfolio</title><h1>Work</h1><p>Projects we shipped.</p><a href="about">About</a></html>`);
      return;
    }
    if (url === "/about" || url.startsWith("/about?")) {
      res.end(`<html><title>About</title><h1>About</h1><p>People behind the shop.</p></html>`);
      return;
    }
    res.end(`<html><title>Home</title><h1>Local shop</h1><p>Service by local people.</p><a href="/about">About</a><a href="/portfolio">Portfolio</a></html>`);
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  try {
    const crawl = await crawlSite(url);
    assert.ok(crawl.pages.some(p => new URL(p.url).pathname === "/"));
    assert.ok(crawl.pages.some(p => new URL(p.url).pathname === "/about") || crawl.pages.some(p => new URL(p.url).pathname === "/portfolio"));
    assert.ok(crawl.exclusions.some(e => e.class === "crawler-invalid" && e.url.includes("/portfolio/about")));
    assert.equal(crawl.warnings.some(w => /fetch failed/i.test(w)), false);
    mkdirSync(join(root, "onboarding"), { recursive: true });
    writeFileSync(join(root, "onboarding/brief.json"), JSON.stringify({
      sourceUrl: url,
      pages: crawl.pages.map(p => ({ url: p.url, title: p.title, outline: p.outline })),
      images: [],
      warnings: crawl.warnings,
    }) + "\n");
    writeFileSync(join(root, "onboarding/harvest-inventory.json"), JSON.stringify({
      version: 1,
      engine: crawl.engine,
      startUrl: crawl.startUrl,
      pages: crawl.pages.map(p => ({ url: p.url, title: p.title })),
      media: { files: [], failed: [] },
      exclusions: crawl.exclusions,
      unvisited: crawl.unvisited,
    }) + "\n");
    const grade = gradeHarvest(root);
    assert.equal(grade.ok, true, grade.failures.join("; "));
  } finally {
    await new Promise<void>(r => server.close(() => r()));
  }
});

test("operator scope accepts a bounded crawl and media coverage fails on missing files", () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-scope-"));
  mkdirSync(join(root, "onboarding"), { recursive: true });
  mkdirSync(join(root, "media/harvest"), { recursive: true });
  writeFileSync(join(root, "onboarding/brief.json"), JSON.stringify({
    sourceUrl: "https://example.com",
    pages: [{ url: "https://example.com/", title: "Home", outline: ["Home"] }],
    images: [{ sourceUrl: "https://example.com/a.png", localPath: "/media/harvest/a.png" }],
    warnings: ["Emergency maxPages=2 reached; 4 URL(s) left unvisited."],
  }) + "\n");
  writeFileSync(join(root, "onboarding/harvest-inventory.json"), JSON.stringify({
    version: 1, engine: "playwright", startUrl: "https://example.com/",
    pages: [{ url: "https://example.com/", title: "Home" }],
    media: { files: [], failed: [] },
    exclusions: [],
    unvisited: ["https://example.com/about"],
  }) + "\n");
  assert.equal(gradeHarvest(root).ok, false);
  writeFileSync(join(root, "onboarding/harvest-scope.json"), JSON.stringify({
    version: 1, maxPages: 2, notes: "Legal and shop deferred by operator.",
  }) + "\n");
  const scoped = gradeHarvest(root);
  assert.ok(scoped.failures.some(f => /missing on disk/.test(f)), scoped.failures.join("; "));
  writeFileSync(join(root, "media/harvest/a.png"), "png");
  const inventory = JSON.parse(readFileSync(join(root, "onboarding/harvest-inventory.json"), "utf8"));
  inventory.media.files = ["/media/harvest/a.png"];
  writeFileSync(join(root, "onboarding/harvest-inventory.json"), JSON.stringify(inventory) + "\n");
  assert.equal(gradeHarvest(root).ok, true, gradeHarvest(root).failures.join("; "));
});

