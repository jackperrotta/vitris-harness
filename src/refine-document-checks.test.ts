import test from "node:test";
import assert from "node:assert/strict";
import { hasRefinementPlaceholder, settleRefinementImages } from "./agent/refine-document-checks.ts";
import { chromium } from "playwright";

test("refinement placeholder checks distinguish executable code from content", () => {
  assert.equal(hasRefinementPlaceholder('<h1>About</h1><script>let timer; clearInterval(timer); timer = undefined; if (timer !== undefined) console.log(NaN);</script><style>.card{--label:undefined}</style>'), false);
  assert.equal(hasRefinementPlaceholder('<button onclick="return undefined">Read</button><!-- [TODO internal comment] -->'), false);
  for (const html of ['<p>undefined</p>', '<h1>[TODO headline]</h1>', '<img alt="[INSERT description]">', '<a aria-label="NaN">Read</a>', '<p>&#117;ndefined</p>']) {
    assert.equal(hasRefinementPlaceholder(html), true, html);
  }
});

test("refinement waits for delayed lazy images but retains failed and timed-out image failures", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    await page.route('http://refine.test/**', async route => {
      if (route.request().url().endsWith('/never.gif')) return;
      await new Promise(resolve => setTimeout(resolve, 150));
      await route.fulfill(route.request().url().endsWith('/missing.gif')
        ? { status: 404, body: 'missing' }
        : { status: 200, contentType: 'image/gif', body: pixel });
    });
    await page.setContent('<h1>Gallery</h1><img loading="lazy" width="100" height="100" style="margin-top:5000px" src="http://refine.test/valid.gif"><img loading="lazy" width="100" height="100" src="http://refine.test/missing.gif">', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('img').first().evaluate((image: any) => image.naturalWidth), 0);
    await settleRefinementImages(page);
    assert.equal(await page.locator('img').first().evaluate((image: any) => image.naturalWidth), 1);
    assert.equal(await page.locator('img').nth(1).evaluate((image: any) => image.naturalWidth), 0);
    await page.setContent('<h1>Gallery</h1><img width="100" height="100" src="http://refine.test/never.gif">', { waitUntil: 'domcontentloaded' });
    const started = Date.now();
    await settleRefinementImages(page, 100);
    assert(Date.now() - started < 5000, 'Image loading must have a bounded wait');
    assert.equal(await page.locator('img').evaluate((image: any) => image.naturalWidth), 0);
    await page.close();
  } finally { await browser.close(); }
});
