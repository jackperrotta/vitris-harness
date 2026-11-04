import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildVerified } from "./build/verified.ts";
import { artifactManifest } from "./knowledge/artifact.ts";
import { sourceRevision } from "./engine/revision.ts";
import { save } from "./agent/artifacts.ts";
import { deployVerifiedArtifact, prepareQuickRelease, prepareVerifiedRelease, type HostingAdapter, type VerifiedArtifact } from "./integrations/hosting.ts";
import { deploySite } from "./cli/deploy.ts";

test("mock host consumes staged checked bytes and rejects a changed bundle", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-hosting-"));
  cpSync(resolve("src/test/fixtures/engine-compat/backend-free"), root, { recursive: true });
  await buildVerified(root);
  const digest = artifactManifest(join(root, "dist")).sha256;
  const bundle = join(root, "agent/release-bundles", digest);
  mkdirSync(join(root, "agent/release-bundles"), { recursive: true });
  cpSync(join(root, "dist"), bundle, { recursive: true });
  const candidate: VerifiedArtifact = { schemaVersion: 1, sourceRevision: sourceRevision(root).digest,
    artifactDigest: digest, compilerDigest: "mock-compiler", harnessVersion: "0.1.0", environment: "preview",
    policyId: "mock-test-only", outputDirectory: bundle, checkedAt: new Date().toISOString() };
  // This unit test injects a mock candidate; it does not assert that release policy passed.
  save(join(root, "agent/release-candidate.json"), candidate);
  let calls = 0;
  const adapter: HostingAdapter = { id: "mock", deployPreview: async artifact => { calls++; return {
    provider: "mock", environment: "preview", deploymentId: "mock-preview-1", artifactDigest: artifact.artifactDigest,
    issuedAt: new Date().toISOString(),
  }; }, publish: async () => { throw new Error("production is disabled in this mock"); } };
  writeFileSync(join(root, "dist/index.html"), "Subsequent unrelated rebuild");
  const result = await deployVerifiedArtifact(root, candidate, adapter);
  assert.equal(result.release.buildDigest, digest);
  assert.equal(calls, 1);
  writeFileSync(join(bundle, "index.html"), "Tampered bundle");
  await assert.rejects(deployVerifiedArtifact(root, candidate, adapter), /Build bytes changed/);
  assert.equal(calls, 1);
});

test("quick publish builds fresh production bytes without passing review gates and retains integrity checks", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-quick-hosting-"));
  cpSync(resolve("src/test/fixtures/engine-compat/backend-free"), root, { recursive: true });
  await assert.rejects(prepareVerifiedRelease(root), /Release verification failed/);
  const candidate = await prepareQuickRelease(root, "production");
  assert.equal(candidate.policyId, "quick-publish-build-only-v1");
  assert.equal(candidate.environment, "production");
  assert.equal(candidate.artifactDigest, artifactManifest(join(root, "dist")).sha256);
  let calls = 0;
  const adapter: HostingAdapter = { id: "mock", deployPreview: async () => { throw new Error("Expected production"); },
    publish: async artifact => { calls++; return { provider: "mock", environment: "production", deploymentId: "quick-1",
      artifactDigest: artifact.artifactDigest, issuedAt: new Date().toISOString() }; } };
  const { release } = await deployVerifiedArtifact(root, candidate, adapter);
  assert.equal(release.policyId, "quick-publish-build-only-v1");
  const stagedIndex = join(candidate.outputDirectory, "index.html");
  const original = readFileSync(stagedIndex);
  writeFileSync(stagedIndex, "Changed staged bytes");
  await assert.rejects(deployVerifiedArtifact(root, candidate, adapter), /Build bytes changed/);
  writeFileSync(stagedIndex, original);
  writeFileSync(join(root, "pages/index.html"), "Changed source");
  await assert.rejects(deployVerifiedArtifact(root, candidate, adapter), /Source changed/);
  assert.equal(calls, 1);
});

test("quick publish fails compilation rather than uploading stale dist", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-quick-invalid-"));
  cpSync(resolve("src/test/fixtures/engine-compat/backend-free"), root, { recursive: true });
  await buildVerified(root);
  writeFileSync(join(root, "site.json"), "invalid JSON");
  await assert.rejects(prepareQuickRelease(root));
});

test("quick publish retains the preservation production restriction", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-quick-preserve-"));
  writeFileSync(join(root, "launch.json"), JSON.stringify({ mode: "preserve" }));
  await assert.rejects(prepareQuickRelease(root, "production"), /temporary previews only/);
});

test("default deployment uploads fresh build-only bytes and checks availability; full review still blocks missing evidence", async t => {
  const root = mkdtempSync(join(tmpdir(), "vitris-deploy-default-"));
  cpSync(resolve("src/test/fixtures/engine-compat/backend-free"), root, { recursive: true });
  mkdirSync(join(root, "agent"));
  cpSync(resolve("agent/graph.yaml"), join(root, "agent/graph.yaml"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "mock-deploy-site" }));
  // A local Wrangler stub records uploads; no Cloudflare requests or credentials are used.
  const wrangler = join(root, "node_modules/wrangler");
  mkdirSync(join(wrangler, "bin"), { recursive: true });
  writeFileSync(join(wrangler, "package.json"), JSON.stringify({ name: "wrangler", version: "0.0.0", type: "module" }));
  writeFileSync(join(wrangler, "bin/wrangler.js"), `
    import { appendFileSync } from "node:fs";
    if (process.argv[2] !== "pages" || process.argv[3] !== "deploy") throw Error("Unexpected command");
    appendFileSync("uploads.jsonl", JSON.stringify(process.argv.slice(2)) + "\\n");
    console.log("https://mock-deployment.pages.dev");
  `);
  const oldToken = process.env.CLOUDFLARE_API_TOKEN, oldAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  process.env.CLOUDFLARE_API_TOKEN = "mock-token";
  process.env.CLOUDFLARE_ACCOUNT_ID = "mock-account";
  t.after(() => {
    if (oldToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = oldToken;
    if (oldAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = oldAccount;
  });
  let smokeChecks = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(url, "https://mock-deployment.pages.dev");
    smokeChecks++;
    return new Response("<html><h1>Mock site</h1></html>", { status: 200 });
  });
  for (const environment of ["preview", "production"] as const) {
    const result = await deploySite({ site: root, environment });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.data?.verification, "build-only");
    assert.equal(result.data?.smokeCheck?.ok, true);
    assert.equal(existsSync(join(root, 'agent/site-manager/CONTEXT.md')), environment === 'production');
    if (environment === 'production') {
      assert.ok(existsSync(join(root, '.agents/skills/vitris-site-manager/SKILL.md')));
      assert.equal(existsSync(join(root, 'agent/site-manager/schedule.json')), false);
    }
    const candidate = JSON.parse(readFileSync(join(root, "agent/release-candidate.json"), "utf8"));
    assert.equal(candidate.policyId, "quick-publish-build-only-v1");
    assert.equal(candidate.artifactDigest, artifactManifest(join(root, "dist")).sha256);
  }
  const uploads = readFileSync(join(root, "uploads.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]);
  assert.equal(uploads.length, 2);
  assert.ok(uploads[0]!.includes("--branch=preview"));
  assert.equal(uploads[1]!.some(arg => arg.startsWith("--branch=")), false);
  assert.equal(smokeChecks, 2);
  assert.equal(readdirSync(join(root, "agent/releases")).length, 2);
  assert.equal(existsSync(join(root, "agent/reviews/launch-preflight.json")), false);
  const full = await deploySite({ site: root, fullReview: true });
  assert.equal(full.ok, false);
  assert.match(full.error || "", /Release verification failed/);
  assert.equal(readFileSync(join(root, "uploads.jsonl"), "utf8").trim().split("\n").length, 2);
  writeFileSync(join(root, "site.json"), "invalid JSON");
  const broken = await deploySite({ site: root });
  assert.equal(broken.ok, false);
  assert.equal(readFileSync(join(root, "uploads.jsonl"), "utf8").trim().split("\n").length, 2);
});
