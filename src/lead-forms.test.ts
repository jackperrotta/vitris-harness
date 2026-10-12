import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Route } from "playwright";
import { previewServer } from "./build/serve.ts";
import { leadsJs } from "./runtime/leads.ts";
import { rewriteLeadForms } from "./compile/flatten.ts";
import { nativeLeadConfirmation } from "./worker/surfaces/api.ts";

test("generated lead forms opt into enhancement while custom handlers retain native behavior", () => {
  assert.match(rewriteLeadForms('<form data-lead-form><input name="name"></form>', "https://lead.test", "/contact"), /data-vitris-enhanced/);
  assert.doesNotMatch(rewriteLeadForms('<form data-lead-form data-lead-custom><input name="name"></form>', "https://lead.test", "/contact"), /data-vitris-enhanced/);
});

test("native submission has an accessible confirmation without a query-string claim", async () => {
  const response = nativeLeadConfirmation('https://customer.example/contact?next="<script>');
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(body, /<h1>Message accepted<\/h1>/);
  assert.match(body, /Return to website/);
  assert.doesNotMatch(body, /<script>/);
  assert.doesNotMatch(body, /sent=1/);
  assert.doesNotMatch(await nativeLeadConfirmation("javascript:alert(1)").text(), /href=/);
});

test("lead forms show confirmed success, recoverable rejection and timeout, and one concurrent request", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-lead-forms-"));
  for (const path of ["contact", "subcontractors"]) {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, "index.html"), `<!doctype html><html><body><form data-lead-form data-vitris-enhanced data-vitris-form="test-form" data-vitris-sitekey="public-key" data-vitris-action="contact" data-lead-timeout-ms="120" action="https://lead.test/api/leads" method="post"><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Message<textarea name="message" required></textarea></label><button type="submit">Send</button></form><script>${leadsJs}</script></body></html>`);
  }
  const server = previewServer(root);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const path of ["contact", "subcontractors"]) for (const width of [375, 1080]) for (const scenario of ["success", "rejection", "timeout", "duplicate", "validation", "rate", "expired", "unavailable"] as const) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => scenario==='unavailable' ? route.abort() : route.fulfill({contentType:'application/javascript',body:`window.turnstile={render:(el,opts)=>{setTimeout(()=>${scenario==='expired'?'opts["expired-callback"]()':'opts.callback("mock-token")'},0);return "mock"},reset:()=>{}}`}));
      let posts = 0;
      let releaseDuplicate!: () => void;
      const duplicateSubmitted = new Promise<void>(resolve => { releaseDuplicate = resolve; });
      await page.route("https://lead.test/api/leads", async (route: Route) => {
        posts++;
        if (scenario === "timeout") return new Promise<void>(() => {});
        if (scenario === "duplicate") await duplicateSubmitted;
        const error=scenario==='rejection'?'backend_unavailable':scenario==='rate'?'rate_limited':scenario==='validation'?'validation_error':null;
        await route.fulfill({ status: error ? scenario==='rate'?429:scenario==='validation'?400:503 : 201, contentType: "application/json", headers: { "access-control-allow-origin": origin }, body: JSON.stringify(error ? { ok: false,error } : { ok: true, leadId: "fictional" }) });
      });
      await page.goto(`${origin}/${path}?sent=1`);
      // Only the timeout scenario needs an aggressively short deadline. Holding
      // the duplicate response makes concurrency explicit without a timer race.
      await page.locator("form").evaluate((form, scenario) => {
        form.setAttribute("data-lead-timeout-ms", scenario === "timeout" ? "120" : "10000");
      }, scenario);
      assert.equal(await page.locator(".c-lead-status").textContent(), "", "query string alone cannot claim success");
      await page.locator('input[name="name"]').fill("Fictional Customer");
      await page.locator('input[name="email"]').fill("fictional@example.invalid");
      await page.locator('textarea[name="message"]').fill("Please follow up");
      await page.locator("button").click();
      if (scenario === "duplicate") {
        await page.evaluate("document.querySelector('form').requestSubmit()");
        releaseDuplicate();
      }
      const expected = scenario === "success" || scenario === "duplicate" ? /Message accepted/ : scenario === "timeout" ? /timed out/ : scenario==='rate'?/Too many attempts/:scenario==='validation'?/check your form fields/:scenario==='expired'?/Security check expired/:scenario==='unavailable'?/Security check is unavailable/:/could not be confirmed/;
      await page.locator(".c-lead-status").filter({ hasText: expected }).waitFor({ timeout: 3000 });
      assert.equal(posts, scenario==='expired'||scenario==='unavailable'?0:1, `${path} ${width} ${scenario}`);
      assert.equal(await page.locator("button").isEnabled(), true);
      assert.equal(await page.locator("form").getAttribute("aria-busy"), null);
      if (scenario !== "success" && scenario !== "duplicate") {
        assert.equal(await page.locator('input[name="name"]').inputValue(), "Fictional Customer");
        assert.equal(await page.locator('textarea[name="message"]').inputValue(), "Please follow up");
        assert.equal(await page.locator(".c-lead-status").getAttribute("role"), "alert");
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
