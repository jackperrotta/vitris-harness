import { test } from "node:test";
import assert from "node:assert/strict";
import { cookieComplianceHtml, COOKIE_COMPLIANCE_PATH } from "./runtime/cookie-compliance.ts";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { beaconJs } from "./runtime/beacon.ts";
import { prepareConsentCheck, verifyConsentControls } from "./agent/browser-consent.ts";

test("cookie compliance HTML includes preference controls", () => {
  const html = cookieComplianceHtml("Demo Shop");
  assert.match(html, /Cookie compliance/);
  assert.match(html, /Demo Shop/);
  assert.match(html, /vitris_vid/);
  assert.match(html, /data-vitris-cc="accept"/);
  assert.match(html, /data-vitris-cc="reject"/);
  assert.equal(COOKIE_COMPLIANCE_PATH, "/cookie-compliance");
});

test("parent browser check verifies saved consent and rejects unwired controls", async () => {
  let origin = "", unwired = true;
  const server = createServer((req, res) => {
    if (req.url === "/beacon.js") { res.setHeader("content-type", "text/javascript"); res.end(beaconJs); }
    else if (req.url?.startsWith("/api/")) { res.writeHead(204); res.end(); }
    else {
      const html = cookieComplianceHtml("Test");
      res.setHeader("content-type", "text/html");
      res.end(`<html data-kernel="${origin}"><body>${unwired ? html.replace(/\sdata-cookie-(?:accept|reject)(?=>)/g, "") : html}<script src="/beacon.js"></script></body></html>`);
    }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const broken of [true, false]) {
      unwired = broken;
      const page = await browser.newPage();
      await prepareConsentCheck(page, origin);
      await page.goto(`${origin}/cookie-compliance`);
      assert.equal(await page.evaluate("window.__vitrisConsentTimers()"), 1);
      const result = await verifyConsentControls(page);
      assert.equal(result.passed, !broken, result.failures.join("\n"));
      await page.close();
    }
  } finally { await browser?.close(); await new Promise<void>(r => server.close(() => r())); }
});

test("ChatGPT inquiry attribution follows affirmative consent across navigation", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const source = () => page.evaluate("window.vitrisChatGPTSource()");
    const events: URLSearchParams[] = [];
    await page.route("https://site.example/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/t") {
        events.push(new URLSearchParams(route.request().postData() || ""));
        return route.fulfill({status: 204});
      }
      return route.fulfill({contentType: "text/html", body: `<html data-chatgpt-business="1" data-backend="https://site.example"><body>${cookieComplianceHtml("Test", true)}<script>${beaconJs}</script></body></html>`});
    });
    await page.goto("https://site.example/?utm_source=chatgpt.com&utm_medium=cpc");
    assert.equal(await source(), null);
    assert.ok(events.some(event => event.get("kind") === "pageview" && event.get("chatgpt_business") === "1"));
    await page.locator('[data-vitris-cc="accept"]').click();
    assert.equal(await source(), "chatgpt_paid");
    await page.goto("https://site.example/contact");
    assert.equal(await source(), "chatgpt_paid");
    await page.locator('[data-vitris-cc="reject"]').click();
    assert.equal(await source(), null);
    await page.locator('[data-vitris-cc="accept"]').click();
    assert.equal(await source(), null);
  } finally {
    await browser.close();
  }
});
