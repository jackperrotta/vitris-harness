import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, loadSiteDir } from "./build/index.ts";
import {
  flattenBody,
  resolveInstanceMotion,
  rewriteLeadForms,
  parseFrontmatter,
  fileToPath,
  compilePage,
  compileSite,
  siteIslands,
  sitemapXml,
  robotsTxt,
} from "./render.ts";
import { cookieComplianceHtml, COOKIE_COMPLIANCE_PATH } from "./runtime/cookie-compliance.ts";
import type { Catalog, SiteConfig } from "./types.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "test", "fixtures", "site");

test("escapes interpolate leftovers", async () => {
  const { interpolate } = await import("./render.ts");
  assert.equal(interpolate(`<h1>{{heading}}</h1>`, { heading: "A <b>x</b>" }), `<h1>A &lt;b&gt;x&lt;/b&gt;</h1>`);
});

test("parses frontmatter and file paths", () => {
  const { meta, body } = parseFrontmatter(`---\ntitle: Home\ndescription: Hi\n---\n<header></header>`);
  assert.equal(meta.title, "Home");
  assert.equal(meta.description, "Hi");
  assert.equal(body, "<header></header>");
  assert.equal(fileToPath("index.html"), "/");
  assert.equal(fileToPath("about.html"), "/about");
  assert.equal(fileToPath("blog/post.html"), "/blog/post");
  assert.equal(fileToPath("blog/index.html"), "/blog");
});

test("flattens slotted components and strips authoring tags", () => {
  const catalog: Catalog = {
    hero: {
      html: `<section class="c-hero"><div class="copy"><slot name="eyebrow"></slot><slot></slot></div><div class="media"><slot name="media"></slot></div></section>`,
      css: ".c-hero{}",
      island: null,
    },
  };
  const site: SiteConfig = { name: "Demo", motion: { strength: "editorial" } };
  const result = flattenBody(
    `<hero motion="off"><p slot="eyebrow">Eyebrow</p><h1>Title</h1><img slot="media" src="/a.jpg" alt=""></hero>`,
    catalog,
    site,
  );
  assert.match(result.html, /class="c-hero"/);
  assert.match(result.html, /Eyebrow/);
  assert.match(result.html, /<h1>Title<\/h1>/);
  assert.match(result.html, /src="\/a.jpg"/);
  assert.doesNotMatch(result.html, /<hero\b/);
  assert.deepEqual(result.used, ["hero"]);
  assert.equal(result.usesMotion, false);
});

test("forwards variant and id onto component root", () => {
  const catalog: Catalog = {
    hero: {
      html: `<section class="c-hero"><slot></slot></section>`,
      css: ".c-hero{}",
      island: null,
    },
  };
  const site: SiteConfig = { name: "Demo", motion: { strength: "off" } };
  const result = flattenBody(
    `<hero variant="overlay dark" id="top"><h1>Title</h1></hero>`,
    catalog,
    site,
  );
  assert.match(result.html, /id="top"/);
  assert.match(result.html, /data-section="top"/);
  assert.match(result.html, /c-hero--overlay/);
  assert.match(result.html, /c-hero--dark/);
});

test("siteIslands includes kernel islands referenced by data-island", () => {
  const pages = [
    {
      path: "/",
      title: "Home",
      bodyHtml: `<header data-island="header" class="c-header"></header><div data-island="carousel"></div>`,
      used: ["header"],
      usesMotion: false,
      usesLeadForm: false,
    },
  ];
  const catalog: Catalog = {
    header: { html: "<header></header>", css: "", island: null },
  };
  const js = siteIslands(pages, catalog);
  assert.match(js, /data-nav-toggle|is-scrolled/);
  assert.match(js, /carousel__track|data-carousel-prev/);
});

test("resolves motion defaults for header/hero vs sections", () => {
  const site: SiteConfig = { name: "Demo", motion: { strength: "editorial", stagger: true } };
  assert.deepEqual(resolveInstanceMotion(site, "header", {}), {
    strength: "off",
    stagger: false,
    from: "up",
  });
  assert.deepEqual(resolveInstanceMotion(site, "hero", {}), {
    strength: "off",
    stagger: false,
    from: "up",
  });
  assert.deepEqual(resolveInstanceMotion(site, "proof-row", {}), {
    strength: "editorial",
    stagger: true,
    from: "up",
  });
  assert.deepEqual(resolveInstanceMotion(site, "proof-row", { motion: "whisper" }), {
    strength: "whisper",
    stagger: true,
    from: "up",
  });
});

test("rewrites lead forms to kernel API", () => {
  const html = rewriteLeadForms(
    `<form data-lead-form><input name="name"></form>`,
    "http://localhost:8787",
    "/contact",
  );
  assert.match(html, /action="http:\/\/localhost:8787\/api\/leads"/);
  assert.match(html, /name="page_path" value="\/contact"/);
  assert.match(html, /name="vid"/);
});

test("builds fixture site to flat HTML", async () => {
  const local = await loadSiteDir(fixtureDir);
  assert.ok(local.pages.some((p) => p.path === "/"));
  assert.ok(local.catalog.hero);
  const outDir = await mkdtemp(join(tmpdir(), "vitris-build-"));
  try {
    await buildSite({
      site: local.site,
      pages: local.pages,
      theme: local.theme,
      catalog: local.catalog,
      kernelOrigin: "http://localhost:8787",
      outDir,
    });
    const { readFile } = await import("node:fs/promises");
    const index = await readFile(join(outDir, "index.html"), "utf8");
    assert.match(index, /Storm damage repaired/);
    assert.match(index, /\bc-hero\b/);
    assert.doesNotMatch(index, /<hero\b/);
    assert.match(index, /Fixture Shop/);
    assert.match(index, /http:\/\/localhost:8787\/stock\/images\/barber-chair\.jpg/);
    assert.match(index, /section__head/);
    assert.match(index, /data-island="header"/);
    const contact = await readFile(join(outDir, "contact", "index.html"), "utf8");
    assert.match(contact, /data-lead-form/);
    assert.match(contact, /action="http:\/\/localhost:8787\/api\/leads"/);
    const css = await readFile(join(outDir, "site.css"), "utf8");
    assert.match(css, /\.c-hero/);
    assert.match(css, /\.c-header/);
    const islands = await readFile(join(outDir, "islands.js"), "utf8");
    assert.match(islands, /data-lead-form/);
    assert.match(islands, /challenge_unavailable/);
    const motionAsset = index.match(/src="(\/motion-[^"]+\.js)"/)?.[1];
    assert.ok(motionAsset, 'motion routes reference the self-hosted asset');
    assert.match(await readFile(join(outDir, motionAsset.slice(1)), 'utf8'), /IntersectionObserver/);
    assert.doesNotMatch(islands, /IntersectionObserver/);
    const cookie = await readFile(join(outDir, "cookie-compliance", "index.html"), "utf8");
    assert.match(cookie, /Cookie compliance/);
    assert.match(sitemapXml(local.pages.map((p) => p.path)), /cookie-compliance/);
    assert.match(robotsTxt(), /Allow/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("compilePage wraps main and ships reveal on mid-page sections", async () => {
  const local = await loadSiteDir(fixtureDir);
  const home = local.pages.find((p) => p.path === "/")!;
  const compiled = compilePage(home, local.catalog, local.site, "http://localhost:8787");
  assert.match(compiled.bodyHtml, /<main id="main" tabindex="-1">/);
  assert.match(compiled.bodyHtml, /data-reveal/);
  assert.ok(compiled.usesMotion);
  assert.ok(compiled.used.includes("hero"));
  assert.ok(!siteIslands([compiled], local.catalog).includes("IntersectionObserver"));
  const doc=compileSite({site:local.site,pages:[home],catalog:local.catalog,kernelOrigin:'',themeHref:'/theme.css'})[0]!.html;
  assert.match(doc,/src="\/motion-[a-f0-9]+\.js"/);
});

test("kernel cookie page is self-contained HTML", () => {
  const html = cookieComplianceHtml("Acme");
  assert.match(html, /id="main"/);
  assert.match(html, /Acme/);
  assert.match(html, /data-vitris-cc="accept"/);
  assert.equal(COOKIE_COMPLIANCE_PATH, "/cookie-compliance");
});
