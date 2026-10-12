import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { buildVerified } from "./build/verified.ts";
import { artifactManifest } from "./knowledge/artifact.ts";
import { verifyReceipt } from "./knowledge/evidence.ts";
import { verifyPublishBundle, type SignedPublishBundle } from "./knowledge/publish-attestation.ts";

const script = resolve(import.meta.dirname, "../scripts/launch-preflight.ts");
function site(labelled: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "vitris-preflight-"));
  for (const dir of ["pages", "onboarding", "agent/reviews"]) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, "site.json"), JSON.stringify({ name: "Pilot Firm", slug: "pilot-firm" }));
  writeFileSync(join(root, "launch.json"), JSON.stringify({ publicOrigin: "https://pilot.example", kernelOrigin: "http://127.0.0.1:8787", forms:[{id:'pilot_contact',pagePath:'/contact',sitekey:'public-fixture-key',action:'contact'}] }));
  writeFileSync(join(root, "onboarding/storyboard.json"), JSON.stringify({ pages: [{ path: "/" }, { path: "/contact" }], routes: [] }));
  writeFileSync(join(root, "pages/index.html"), '<h1>Pilot Firm</h1><p>Plain service information.</p><a href="/contact">Contact</a>');
  writeFileSync(join(root, "pages/contact.html"), `<h1>Contact Pilot Firm</h1><form data-lead-form>${labelled ? "<label>Email <input name='email' type='email' required></label>" : "<input name='email' type='email' required>"}<button type="submit">Send</button></form><a href="/">Home</a>`);
  return root;
}
function preflight(root: string, environment: "production" | "preview") {
  return spawnSync(process.execPath, ["--experimental-strip-types", script, "--site", root, "--environment", environment], { encoding: "utf8", timeout: 180_000 });
}

test("production preflight verifies good output and rejects a broken contact journey", async () => {
  const good = site(true);
  const bad = site(false);
  await buildVerified(good);
  await buildVerified(bad);
  const accepted = preflight(good, "production");
  const rejected = preflight(bad, "production");
  const goodReceipt = JSON.parse(readFileSync(join(good, "agent/reviews/launch-preflight.json"), "utf8"));
  const badReceipt = JSON.parse(readFileSync(join(bad, "agent/reviews/launch-preflight.json"), "utf8"));
  const preview = preflight(bad, "preview");
  assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
  assert.equal(rejected.status, 1);
  assert.equal(preview.status, 0);
  assert.equal(goodReceipt.launchAllowed, true);
  assert.equal(badReceipt.launchAllowed, false);
  assert.notEqual(goodReceipt.buildHash, badReceipt.buildHash);
  assert.equal(goodReceipt.buildHash, artifactManifest(join(good, "dist")).sha256);
  const evidence = JSON.parse(readFileSync(join(good, "agent/reviews/launch-evidence.json"), "utf8"));
  assert.equal(verifyReceipt(evidence).ok, true);
  assert.equal(verifyReceipt({ ...evidence, screenshotHash: "tampered" }).ok, false);
});

test("missing browser verifier inputs never become a production pass", async () => {
  const root = site(true);
  await buildVerified(root);
  unlinkSync(join(root, "onboarding/storyboard.json"));
  const result = preflight(root, "production");
  assert.equal(result.status, 1);
  const receipt = JSON.parse(readFileSync(join(root, "agent/reviews/launch-preflight.json"), "utf8"));
  assert.ok(receipt.blockerIds.includes("required-verifier"));
});

test("browser form probe never sends an external submission", async () => {
  let received = 0;
  const recorder = createServer((_request, response) => { received++; response.writeHead(204).end(); });
  await new Promise<void>(resolve => recorder.listen(0, "127.0.0.1", resolve));
  try {
    const port = (recorder.address() as { port: number }).port;
    const root = site(true);
    writeFileSync(join(root, "pages/index.html"), `<h1>Pilot Firm</h1><form action="http://127.0.0.1:${port}/record" method="post"><label>Email <input name="email" type="email"></label><button>Send</button></form><form data-lead-form><label>Email <input name="email" type="email" required></label><button type="submit" onclick="fetch('http://127.0.0.1:${port}/record',{method:'POST'}).catch(()=>{})">Send lead</button></form>`);
    const script = resolve(import.meta.dirname, "../scripts/verify-browser.ts");
    const child = spawn(process.execPath, ["--experimental-strip-types", script, "--site", root, "--representative"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", data => { output += String(data); });
    child.stderr.on("data", data => { output += String(data); });
    const code = await new Promise<number | null>(resolve => child.on("close", resolve));
    assert.equal(code, 1, output);
    const report = JSON.parse(readFileSync(join(root, "agent/reviews/representative-browser.json"), "utf8"));
    assert.ok(report.checks.some((check: { warnings: string[] }) => check.warnings.some(warning => /Unsupported form/.test(warning))));
    assert.ok(report.checks.some((check: { warnings: string[] }) => check.warnings.some(warning => /network request.*blocked/.test(warning))));
    assert.ok(report.checks.some((check: { failures: string[] }) => check.failures.some(failure => /mutating request.*blocked/.test(failure))));
    assert.equal(received, 0);
  } finally {
    await new Promise<void>(resolve => recorder.close(() => resolve()));
  }
});

test("publish bundle CLI reruns preflight and signs only current accepted bytes", async () => {
  const secret = "test-publish-attestation-secret-32-bytes-long";
  const signer = resolve(import.meta.dirname, "../scripts/sign-publish-bundle.ts");
  const run = (root: string) => spawnSync(process.execPath, ["--experimental-strip-types", signer, "--site", root,
    "--tenant-id", "tenant-1", "--slug", "pilot-firm", "--project", "pilot-pages", "--out", join(root, "signed.json")],
    { encoding: "utf8", timeout: 180_000, env: { ...process.env, VITRIS_PUBLISH_ATTESTATION_SECRET: secret } });
  const good = site(true);
  await buildVerified(good);
  const accepted = run(good);
  assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
  const bundle = JSON.parse(readFileSync(join(good, "signed.json"), "utf8")) as SignedPublishBundle;
  assert.equal(bundle.artifact.sha256, artifactManifest(join(good, "dist")).sha256);
  assert.ok(bundle.files["index.html"]);
  assert.equal(bundle.evidence.passed, true);
  const bad = site(false);
  await buildVerified(bad);
  const rejected = run(bad);
  assert.equal(rejected.status, 1);
  assert.equal((await verifyPublishBundle(bundle, secret)).ok, true);
});
