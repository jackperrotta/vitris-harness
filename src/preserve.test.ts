import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSite } from "./cli/site-create.ts";
import { runSite } from "./cli/run.ts";
import { deploySite } from "./cli/deploy.ts";
import { buildVerified } from "./build/verified.ts";
import { sourceRevision } from "./engine/revision.ts";
import { capturePreservedSite, legacyRoutes } from "./preserve/capture.ts";
import { pageFile } from "./preserve/config.ts";
import { verifyPreservedSite } from "./preserve/verify.ts";
import { wranglerCommand } from "./integrations/wrangler-command.ts";
import { ensurePreservePreviewProject } from "./integrations/cloudflare-pages.ts";
import { statusSite } from "./cli/status.ts";
import { deploymentSmoke } from "./integrations/deployment-smoke.ts";

test("preserve option requires a real source and rejects creative runs/production", async () => {
  const root = join(mkdtempSync(join(tmpdir(), "vitris-preserve-options-")), "site");
  for (const from of [undefined, "file:///secret", "https://user:password@example.com/"]) {
    assert.equal((await createSite({ dir: root, slug: "example", mode: "preserve", from })).ok, false);
    assert.equal(existsSync(root), false);
  }
  assert.equal((await createSite({ dir: root, slug: "example", mode: "preserve", from: "https://example.com", dryRun: true })).ok, true);
  assert.equal(existsSync(root), false);
  assert.equal((await createSite({ dir: root, slug: "example", mode: "preserve", from: "https://example.com" })).ok, true);
  assert.equal(JSON.parse(readFileSync(join(root, "launch.json"), "utf8")).mode, "preserve");
  assert.match(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.deploy, /--environment preview/);
  const workflow = readFileSync(join(root, ".github/workflows/deploy.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch/); assert.doesNotMatch(workflow, /push:|production|wrangler pages deploy/);
  assert.equal((await runSite({ site: root, creativeProfile: true })).ok, false);
  assert.equal((await deploySite({ site: root, environment: "production", dryRun: true })).ok, false);
  assert.equal((await runSite({ site: root, dryRun: true })).ok, true);
  assert.equal(existsSync(join(root, "preserved")), false);
});

test("route confinement, hidden legacy navigation, and Windows Wrangler entry point", () => {
  assert.equal(pageFile("/"), "index.html"); assert.equal(pageFile("/about"), "about/index.html");
  for (const path of ["/a?variant=1", "/bad%5cpath", "/con", "/a%00b", "/foo%3abar"]) assert.throws(() => pageFile(path));
  const state = { renderableData: { navbar: { links: [{ url: "hidden", hide: true }, { url: "https://outside.test" }] }, pages: { home: {} } } };
  const html = `<script id="vitris-web-renderer-state">${JSON.stringify(state).replaceAll('"', "&q;")}</script>`;
  assert.deepEqual(legacyRoutes(html, "https://source.test/"), ["https://source.test/hidden", "https://source.test/home"]);
  const command = wranglerCommand(process.cwd(), ["pages", "deploy", "a path with spaces"]);
  assert.equal(command.command, process.execPath); assert.match(command.args[0]!, /wrangler[\\/]bin[\\/]wrangler\.js$/);
  assert.equal(command.args.at(-1), "a path with spaces");
});

test("legacy Vitris capture is independent of old hosting, preserves pixels/interactions, and detects edits", { timeout: 180_000 }, async () => {
  const server = createServer((req, res) => {
    if (req.url === "/style.css") { res.setHeader("content-type", "text/css"); res.end('@import "/extra.css"; body{margin:0;font:16px Arial;background:#fff} .collapse{display:none}.collapse.show{display:block}.modal{display:none}.modal.show{display:block;position:fixed;inset:0;background:white;z-index:10} .modal-backdrop{position:fixed;inset:0;z-index:9} img{width:40px;height:40px}'); return; }
    if (req.url === "/extra.css") { res.setHeader("content-type", "text/css"); res.end('h1{color:rgb(20,40,80)}'); return; }
    if (req.url?.startsWith("/image.svg")) { res.setHeader("content-type", "image/svg+xml"); res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="${req.headers.accept?.includes("image/") ? "red" : "blue"}"/></svg>`); return; }
    res.setHeader("content-type", "text/html");
    const state = JSON.stringify({ renderableData: { navbar: { links: [{ url: "hidden", hide: true }] } } }).replaceAll('"', "&q;");
    res.end(`<!doctype html><html><head><title>Fixture</title><link rel="stylesheet" href="/style.css"><script id="vitris-web-renderer-state" type="application/json">${state}</script></head><body><v1-full-site-renderer><div id="fullSiteRenderer"><h1>${req.url === "/hidden" ? "Hidden page" : "Original site"}</h1><a href="/">Home</a><button data-toggle="collapse" data-target="#nav" aria-expanded="false">Menu</button><div class="collapse" id="nav"><a href="/hidden">Other page</a></div><img src="/image.svg?v=1" data-toggle="modal" data-target="#photo"><div id="photo" class="modal"><img src="/image.svg?v=1" data-dismiss="modal"></div><form><input name="name" required><input name="email" type="email" required><a data-vitrisid="emailSendButton">Send</a></form></div></v1-full-site-renderer></body></html>`);
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const root = join(mkdtempSync(join(tmpdir(), "vitris-preserve-browser-")), "site");
  try {
    await createSite({ dir: root, slug: "fixture", mode: "preserve", from: origin });
    const manifest = await capturePreservedSite(root);
    assert.deepEqual(manifest.pages.map(p => p.path), ["/", "/hidden"]);
    assert.equal(manifest.assets.length, 3);
    await assert.rejects(capturePreservedSite(root), /already exists/);
    await new Promise<void>(done => server.close(() => done())); // Verification must not need the origin.
    await buildVerified(root);
    const original = sourceRevision(root).digest;
    const report = await verifyPreservedSite(root);
    assert.equal(report.ok, true, JSON.stringify(report.failures));
    assert.equal(report.checks.length, 4);
    assert.ok(report.checks.every(c => c.changedPixelRatio === 0));
    assert.match((await statusSite({ site: root })).summary!, /preview_ready/);
    assert.match(readFileSync(join(root, "dist/_headers"), "utf8"), /noindex/);
    assert.doesNotMatch(readFileSync(join(root, "dist/index.html"), "utf8"), /theme.css|islands.js|vitris-web-renderer-state/);
    await assert.rejects(buildVerified(root, join(root, "preserved")), /overwrite/);
    const launchPath = join(root, "launch.json"); const launch = JSON.parse(readFileSync(launchPath, "utf8"));
    writeFileSync(launchPath, JSON.stringify({ ...launch, backendOrigin: "https://forms.example.test" }));
    await buildVerified(root);
    const connected = await verifyPreservedSite(root);
    assert.equal(connected.ok, true, JSON.stringify(connected.failures));
    assert.doesNotMatch(readFileSync(join(root, "dist/index.html"), "utf8"), /https:\/\/forms.example.test\/api\/leads/);
    writeFileSync(launchPath, JSON.stringify(launch));
    writeFileSync(join(root, "preserved/index.html"), readFileSync(join(root, "preserved/index.html"), "utf8").replace("Original site", "Changed heading"));
    assert.notEqual(sourceRevision(root).digest, original);
    assert.match((await statusSite({ site: root })).summary!, /stale/);
    await buildVerified(root);
    assert.equal((await verifyPreservedSite(root)).ok, false);
  } finally { if (server.listening) await new Promise<void>(done => server.close(() => done())); }
});

test("preview project provisioning cannot deploy to a production branch", async t => {
  const previous = { account: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN };
  process.env.CLOUDFLARE_ACCOUNT_ID = "test-account"; process.env.CLOUDFLARE_API_TOKEN = "test-token";
  t.after(() => { if (previous.account === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = previous.account; if (previous.token === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = previous.token; });
  let production = "production", missing = false;
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: { method?: string; body?: string }) => {
    if (options.method === "POST") { writes.push(options.body!); return new Response('{"success":true}', { status: 200 }); }
    return new Response(JSON.stringify({ success: !missing, result: { production_branch: production } }), { status: missing ? 404 : 200 });
  });
  await ensurePreservePreviewProject("test-preserve", "preview");
  assert.equal(writes.length, 0);
  production = "preview";
  await assert.rejects(ensurePreservePreviewProject("test-preserve", "preview"), /production branch/);
  missing = true;
  await ensurePreservePreviewProject("test-preserve", "preview");
  assert.deepEqual(JSON.parse(writes[0]!), { name: "test-preserve", production_branch: "production" });
  await assert.rejects(ensurePreservePreviewProject("test-preserve", "production"), /cannot be production/);
  assert.equal(writes.length, 1);
});

test("deployment readiness retries transient failures and honors cancellation", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1) throw new Error("certificate pending");
    return new Response(calls === 2 ? "not ready" : "<!doctype html><html><body>Original content</body></html>", { status: calls === 2 ? 503 : 200 });
  });
  const result = await deploymentSmoke("https://fixture.pages.dev", { preserved: true, attempts: 3, retryDelayMs: 0 });
  assert.equal(result.ok, true); assert.equal(calls, 3);
  await assert.rejects(deploymentSmoke("https://fixture.pages.dev", { signal: AbortSignal.abort() }), /abort/i);
  assert.equal(calls, 3);
});
