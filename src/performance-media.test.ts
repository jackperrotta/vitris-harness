import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { buildVerified } from './build/verified.ts';
import { responsiveMedia } from './build/responsive-media.ts';
import { performancePolicy, performanceRoutes, summarizePerformance, performanceEvidenceFailures } from './agent/performance.ts';
import { createSite } from './cli/site-create.ts';
import { createServer } from 'node:http';
import { checkApiContracts } from './agent/api-contracts.ts';
import { compileSite } from './compile/site.ts';
import { PERFORMANCE_POLICY, performanceConfigHash } from './agent/performance.ts';
import { fingerprint, sourceHash } from './agent/artifacts.ts';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { previewServer } from './build/serve.ts';
import { checkResponsiveImages, checkSharedMedia } from './stock/browser-checks.ts';
import { finalizeStaticOutput } from './build/static-output.ts';

function site() {
  const root = mkdtempSync(join(tmpdir(), 'vitris-media-performance-'));
  for (const p of ['pages', 'media', 'components/only-about', 'onboarding']) mkdirSync(join(root, p), { recursive: true });
  writeFileSync(join(root, 'site.json'), JSON.stringify({ name: 'Test', slug: 'test' }));
  writeFileSync(join(root, 'launch.json'), JSON.stringify({ publicOrigin: 'https://test.example', performance: { enabled: true, runs: 3 } }));
  writeFileSync(join(root, 'onboarding/storyboard.json'), JSON.stringify({ pages: [{ path: '/' }, { path: '/about', representative: true }, { path: '/gallery' }] }));
  return root;
}
async function image(path: string) {
  await sharp({ create: { width: 2400, height: 1600, channels: 4, background: { r: 130, g: 70, b: 30, alpha: 0.5 } } }).png().toFile(path);
}

test('static output supplies a working favicon while preserving authored icons', () => {
  const root = mkdtempSync(join(tmpdir(), 'vitris-favicon-'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><html><head><title>Home</title></head><body>Home</body></html>');
  writeFileSync(join(root, 'custom.html'), '<html><head><link rel="shortcut icon" href="/brand.svg"></head><body>Custom</body></html>');
  writeFileSync(join(root, 'brand.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9"/></svg>');
  finalizeStaticOutput(root);
  assert.match(readFileSync(join(root, 'index.html'), 'utf8'), /rel="icon" href="\/favicon.svg" type="image\/svg\+xml"/);
  assert.match(readFileSync(join(root, 'favicon.svg'), 'utf8'), /<svg[^>]+viewBox="0 0 64 64"/);
  assert.doesNotMatch(readFileSync(join(root, 'custom.html'), 'utf8'), /favicon\.svg/);
  assert.match(readFileSync(join(root, 'custom.html'), 'utf8'), /href="\/brand.svg"/);
  const icoRoot = mkdtempSync(join(tmpdir(), 'vitris-existing-favicon-'));
  writeFileSync(join(icoRoot, 'index.html'), '<html><head></head><body>Home</body></html>');
  writeFileSync(join(icoRoot, 'favicon.ico'), Buffer.from([0,0,1,0,0,0]));
  finalizeStaticOutput(icoRoot);
  assert.match(readFileSync(join(icoRoot, 'index.html'), 'utf8'), /href="\/favicon.ico" type="image\/x-icon"/);
  assert.equal(existsSync(join(icoRoot, 'favicon.svg')), false);
});
test('verified builds preserve originals, responsive geometry, explicit priorities and author art direction', async () => {
  const root = site(); await image(join(root, 'media/photo.png'));
  const before = readFileSync(join(root, 'media/photo.png'));
  writeFileSync(join(root, 'pages/index.html'), '<h1>Home</h1><img src="/media/photo.png" alt="Photo" sizes="(min-width: 800px) 50vw, 100vw" data-media-priority="critical" loading="lazy"><img src="/media/photo.png" alt="Next" data-media-priority="deferred" loading="eager"><a href="/about?x=1#team">About</a>');
  writeFileSync(join(root, 'pages/about.html'), '<only-about></only-about><picture><source srcset="/media/photo.png" media="(min-width:800px)"><img src="/media/photo.png" alt="Art direction"></picture>');
  writeFileSync(join(root, 'pages/gallery.html'), '<h1>Gallery</h1>');
  writeFileSync(join(root, 'components/only-about/template.html'), '<section><h1>About</h1></section>');
  writeFileSync(join(root, 'components/only-about/styles.css'), '.only-about{color:purple}');
  writeFileSync(join(root, 'components/only-about/island.js'), 'console.log("only-about")');
  await buildVerified(root);
  assert.deepEqual(readFileSync(join(root, 'media/photo.png')), before);
  const html = readFileSync(join(root, 'dist/index.html'), 'utf8');
  assert.match(html, /srcset="[^\"]+ 480w, [^\"]+ 768w, [^\"]+ 1280w, [^\"]+ 1920w"/);
  assert.match(html, /sizes="\(min-width: 800px\) 50vw, 100vw"/);
  assert.match(html, /data-media-priority="critical" loading="eager"[^>]+fetchpriority="high"/);
  assert.match(html, /data-media-priority="deferred" loading="lazy"[^>]+fetchpriority="low"/);
  assert.match(html, /width="1920" height="1280"/);
  assert.match(html, /href="\/about\/\?x=1#team"/);
  assert.doesNotMatch(html, /only-about|islands[^\"]*\.js/);
  const about = readFileSync(join(root, 'dist/about/index.html'), 'utf8');
  assert.match(about, /<picture><source srcset="\/media\/photo.png"/);
  assert.match(about, /href="https:\/\/test.example\/about\/"/);
  assert.match(about, /src="\/assets\/immutable\/[a-f0-9]{64}\.js"/);
  const report = JSON.parse(readFileSync(join(root, 'dist/media-manifest.json'), 'utf8'));
  assert.equal(report.images.length, 1);
  for (const variant of report.images[0].variants) assert.equal((await sharp(readFileSync(join(root, 'dist', variant.url))).metadata()).hasAlpha, true);
  assert.match(readFileSync(join(root, 'dist/robots.txt'), 'utf8'), /Sitemap: https:\/\/test.example\/sitemap.xml/);
  assert.match(readFileSync(join(root, 'dist/sitemap.xml'), 'utf8'), /<loc>https:\/\/test.example\/about\/<\/loc>/);
  assert.ok(existsSync(join(root, 'dist/404.html')));
  assert.match(readFileSync(join(root, 'dist/_headers'), 'utf8'), /max-age=31536000, immutable/);
  await buildVerified(root);
  assert.equal(readFileSync(join(root, 'dist/index.html'), 'utf8'), html, 'cached rebuild must be deterministic');
});
test('AVIF is explicit, animations and remote originals stay untouched, invalid priorities fail', async () => {
  const root = site(), dist = join(root, 'dist'); mkdirSync(dist); await image(join(dist, 'photo.png'));
  writeFileSync(join(dist, 'index.html'), '<img src="photo.png" data-media-format="avif"><img src="https://example.com/photo.jpg"><img src="photo.png" data-media-optimize="off">');
  await responsiveMedia(dist, join(root, '.vitris/cache/media'));
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.match(html, /\.avif 480w/); assert.match(html, /src="https:\/\/example.com\/photo.jpg"/);
  assert.match(html, /src="photo.png" data-media-optimize="off"/);
  writeFileSync(join(dist, 'index.html'), '<img src="photo.png" data-media-priority="guess">');
  await assert.rejects(responsiveMedia(dist, join(root, '.vitris/cache/media')), /Invalid data-media-priority/);
});

test('photos cloned from inert templates receive responsive delivery before interaction', async () => {
  const root = site(), dist = join(root, 'dist'); mkdirSync(dist); await image(join(dist, 'photo.png'));
  writeFileSync(join(dist, 'index.html'), '<template id="chapter"><img src="photo.png" sizes="50vw" data-media-priority="deferred"></template>');
  await responsiveMedia(dist, join(root, '.vitris/cache/media'));
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.match(html, /<template id="chapter"><img[^>]+srcset="[^\"]+ 480w/);
  assert.match(html, /loading="lazy"/);
});
test('encoded local paths, EXIF orientation and identical-byte provenance survive derivative deduplication', async () => {
  const root = site(), dist = join(root, 'dist'); mkdirSync(dist);
  const bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#557799' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  writeFileSync(join(dist, 'photo one.jpg'), bytes); writeFileSync(join(dist, 'photo-two.jpg'), bytes);
  writeFileSync(join(dist, 'index.html'), '<img src="/photo%20one.jpg"><img src="/photo-two.jpg">');
  const manifest = await responsiveMedia(dist, join(root, '.vitris/cache/media'));
  assert.equal(manifest.images.length, 2);
  assert.equal(manifest.images[0]!.variants[0]!.url, manifest.images[1]!.variants[0]!.url);
  assert.equal(manifest.images[0]!.variants[0]!.width, 480);
  assert.equal(manifest.images[0]!.variants[0]!.height, 720);
});
test('mobile policy selects home, representative and heaviest interior, validates repeated medians and missing evidence', async () => {
  const root = site();
  assert.equal(performancePolicy(root).score, 95, 'new performance gates require the top score band with margin');
  const almost = { score: 94, lcp: 2000, tbt: 0, cls: 0.01, transfer: 400000 };
  assert.match(summarizePerformance([almost, almost, almost], performancePolicy(root)).failures.join(), /score/);
  for (const [name, body] of [['index', '<h1>Home</h1>'], ['about', '<h1>About</h1>'], ['gallery', '<h1>Gallery</h1>' + '<p>Content</p>'.repeat(500)]] as const) writeFileSync(join(root, `pages/${name}.html`), body);
  await buildVerified(root);
  assert.deepEqual(performanceRoutes(root), ['/', '/about/', '/gallery/']);
  const good = { score: 95, lcp: 2000, tbt: 0, cls: 0.01, transfer: 400000 };
  assert.deepEqual(summarizePerformance([good, { ...good, lcp: 9000, score: 40 }, good], performancePolicy(root)).failures, []);
  assert.match(summarizePerformance([good, { ...good, lcp: 9000 }, { ...good, lcp: 8000 }], performancePolicy(root)).failures.join(), /lcp/);
  assert.throws(() => summarizePerformance([good], performancePolicy(root)), /3 valid/);
  assert.throws(() => summarizePerformance([good, good, { ...good, lcp: NaN }], performancePolicy(root)), /invalid/);
  assert.match(performanceEvidenceFailures(root).join(), /missing/);
  writeFileSync(join(root, 'launch.json'), JSON.stringify({ performance: { enabled: true, runs: 1 } }));
  assert.throws(() => performancePolicy(root), /3–5/);
});
test('new installed starters enable the mobile gate and expose its command', async () => {
  const root = join(mkdtempSync(join(tmpdir(), 'vitris-perf-starter-')), 'site');
  const result = await createSite({ dir: root, slug: 'perf-starter', name: 'Performance starter', blank: true, harnessSpec: 'file:' + process.cwd() });
  assert.equal(result.ok, true, result.error);
  assert.equal(performancePolicy(root).enabled, true);
  assert.match(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts['verify:performance'], /vitris-verify-performance/);
  assert.match(readFileSync(join(root, 'agent/refs/performance.md'), 'utf8'), /data-media-priority/);
});
test('API health contracts reject successful HTML fallback and accept actual JSON', async () => {
  const root = site();
  const server = createServer((req, res) => { res.setHeader('content-type', req.url === '/config' ? 'application/json' : 'text/html'); res.end(req.url === '/config' ? '{"ready":true}' : '<h1>Homepage fallback</h1>'); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    writeFileSync(join(root, 'launch.json'), JSON.stringify({ apiChecks: [{ url: '/config' }, { url: '/missing-api' }] }));
    const failures = await checkApiContracts(root, origin);
    assert.equal(failures.length, 1); assert.match(failures[0]!, /Expected API JSON, received text\/html/);
  } finally { await new Promise<void>(r => server.close(() => r())); }
});

test('production builds are indexable while preview and missing-page protections remain explicit', async () => {
  const root = site();
  writeFileSync(join(root, 'pages/index.html'), '<h1>Launch-ready home</h1>');
  writeFileSync(join(root, 'pages/404.html'), '<h1>Page not found</h1>');
  const previous = process.env.VITRIS_SITE_ENVIRONMENT;
  try {
    process.env.VITRIS_SITE_ENVIRONMENT = 'production';
    await buildVerified(root);
    const home = readFileSync(join(root, 'dist/index.html'), 'utf8');
    assert.doesNotMatch(home, /<meta[^>]+name="robots"[^>]+noindex/);
    assert.match(home, /rel="canonical" href="https:\/\/test.example\/"/);
    assert.match(readFileSync(join(root, 'dist/404.html'), 'utf8'), /name="robots" content="noindex"/);
    assert.doesNotMatch(readFileSync(join(root, 'dist/sitemap.xml'), 'utf8'), /\/404/);
    process.env.VITRIS_SITE_ENVIRONMENT = 'preview';
    await buildVerified(root);
    assert.match(readFileSync(join(root, 'dist/index.html'), 'utf8'), /name="robots" content="noindex"/);
  } finally {
    if (previous === undefined) delete process.env.VITRIS_SITE_ENVIRONMENT;
    else process.env.VITRIS_SITE_ENVIRONMENT = previous;
  }
});
test('field measurement hook validates the public token and stays out of preview builds', () => {
  const base = { site: { name: 'Site', slug: 'site' }, pages: [{ path: '/', file: 'index.html', title: 'Home', body: '<h1>Home</h1>' }], catalog: {}, kernelOrigin: '', themeHref: '/theme.css', webAnalyticsToken: 'a'.repeat(32) };
  assert.match(compileSite(base)[0]!.html, /static.cloudflareinsights.com\/beacon.min.js/);
  assert.doesNotMatch(compileSite({ ...base, site: { ...base.site, environment: 'preview' } })[0]!.html, /static.cloudflareinsights/);
  assert.throws(() => compileSite({ ...base, webAnalyticsToken: '<script>' }), /webAnalyticsToken/);
});
test('performance acceptance recomputes raw reports and rejects summary tampering or changed source', async () => {
  const root = site();
  for (const name of ['index', 'about', 'gallery']) writeFileSync(join(root, `pages/${name}.html`), '<h1>Fixture</h1>');
  await buildVerified(root); mkdirSync(join(root, 'agent/reviews'), { recursive: true });
  const sample = { score: 99, lcp: 2000, tbt: 0, cls: 0.01, transfer: 100000 };
  // Synthetic unit-test measurements exercise validation; they are never used as benchmark evidence.
  const raw = { configSettings: { formFactor: 'mobile' }, categories: { performance: { score: .99 } }, audits: Object.fromEntries([['largest-contentful-paint', 2000], ['total-blocking-time', 0], ['cumulative-layout-shift', .01], ['total-byte-weight', 100000]].map(([id, numericValue]) => [id, { numericValue }])) };
  const report = { version: 1, policy: PERFORMANCE_POLICY, scope: 'local', configHash: performanceConfigHash(root), sourceHash: sourceHash(root), distHash: fingerprint(root, ['dist']), failures: [], routes: performanceRoutes(root).map((path, i) => ({ path, samples: [sample, sample, sample], reports: [1, 2, 3].map(run => { const file = `agent/reviews/fixture-${i}-${run}.json`; writeFileSync(join(root, file), JSON.stringify(raw)); return { path: file, sha256: createHash('sha256').update(readFileSync(join(root, file))).digest('hex') }; }), failures: [] })) };
  writeFileSync(join(root, 'agent/reviews/performance.json'), JSON.stringify(report));
  assert.deepEqual(performanceEvidenceFailures(root), []);
  const changed = structuredClone(report); changed.routes[0]!.samples[0]!.score = 100;
  writeFileSync(join(root, 'agent/reviews/performance.json'), JSON.stringify(changed));
  assert.match(performanceEvidenceFailures(root).join(), /summary differs/);
  writeFileSync(join(root, 'agent/reviews/performance.json'), JSON.stringify(report));
  writeFileSync(join(root, 'pages/index.html'), '<h1>Changed</h1>');
  assert.match(performanceEvidenceFailures(root).join(), /stale/);
  writeFileSync(join(root, report.routes[0]!.reports[0]!.path), '{}');
  assert.match(performanceEvidenceFailures(root).join(), /report changed/);
});
test('browser checks recognize responsive provenance, flag blurred cover sources, and verify cache/status rules', async () => {
  const root = site(); await image(join(root, 'media/photo.png'));
  writeFileSync(join(root, 'pages/index.html'), '<header><img src="/media/photo.png" alt="Proof" data-media-priority="critical" sizes="100vw" style="width:375px;height:650px;object-fit:cover"></header><h1>Home</h1>');
  await buildVerified(root);
  const manifest = JSON.parse(readFileSync(join(root, 'dist/media-manifest.json'), 'utf8'));
  const server = previewServer(join(root, 'dist'));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
    await page.goto(origin, { waitUntil: 'networkidle' });
    assert.match((await checkResponsiveImages(page, manifest)).join(), /undersized/);
    assert.deepEqual(await checkSharedMedia(page, { version: 3, globalMedia: [{ assetId: 'photo', placement: 'header', routes: ['/'] }] } as any, { assets: [{ id: 'photo', path: '/media/photo.png' }] } as any, '/', manifest), []);
    await page.locator('img').evaluate((img: any) => { img.sizes = '1100px'; });
    await page.waitForFunction(() => (globalThis as any).document.images[0].complete);
    await page.waitForTimeout(200);
    assert.deepEqual(await checkResponsiveImages(page, manifest), []);
    const resource = await fetch(origin + manifest.images[0].variants[0].url);
    assert.match(resource.headers.get('cache-control')!, /immutable/);
    assert.equal((await fetch(origin + manifest.images[0].variants[0].url, { headers: { 'if-none-match': resource.headers.get('etag')! } })).status, 304);
    assert.doesNotMatch((await fetch(origin + '/site.css')).headers.get('cache-control')!, /immutable/);
    assert.equal((await fetch(origin + '/genuine-missing-page')).status, 404);
  } finally { await browser.close(); await new Promise<void>(r => server.close(() => r())); }
});
