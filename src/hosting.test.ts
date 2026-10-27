import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildVerified } from "./build/verified.ts";
import { artifactManifest } from "./knowledge/artifact.ts";
import { sourceRevision } from "./engine/revision.ts";
import { save } from "./agent/artifacts.ts";
import { deployVerifiedArtifact, prepareQuickRelease, prepareVerifiedRelease, type HostingAdapter, type VerifiedArtifact } from "./integrations/hosting.ts";

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
