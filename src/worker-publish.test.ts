import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artifactManifest } from "./knowledge/artifact.ts";
import { sealReceipt } from "./knowledge/evidence.ts";
import { LAUNCH_POLICY_ID, KNOWLEDGE_RELEASE } from "./knowledge/contracts.ts";
import { manifestFromBase64, signPublishBundle, verifyPublishBundle, type PublishBundleBody } from "./knowledge/publish-attestation.ts";
import { publishAttestedBundle } from "./worker/publish.ts";
import type { Env } from "./worker/env.ts";
import { route } from "./worker/router.ts";

const secret = "test-publish-attestation-secret-32-bytes-long";
const encode = (value: string) => Buffer.from(value).toString("base64");

test("local artifact order verifies through a signed Worker bundle with prefix-adjacent paths", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vitris-artifact-order-"));
  try {
    mkdirSync(join(dir, "media"));
    writeFileSync(join(dir, "index.html"), "<h1>Roofing</h1>");
    writeFileSync(join(dir, "media.json"), "{}");
    writeFileSync(join(dir, "media", "roof.png"), Buffer.from([137, 80, 78, 71]));
    const artifact = artifactManifest(dir);
    assert.deepEqual(artifact.files.map(file => file.path), ["index.html", "media.json", "media/roof.png"]);
    const files = {
      "media/roof.png": Buffer.from([137, 80, 78, 71]).toString("base64"),
      "index.html": encode("<h1>Roofing</h1>"),
      "media.json": encode("{}"),
    };
    assert.deepEqual(await manifestFromBase64(files), artifact);
    const now = Date.now();
    const evidence = sealReceipt({ id: "launch-preflight", scope: "launch", buildHash: artifact.sha256,
      policyHash: LAUNCH_POLICY_ID, knowledgeHash: "verified-release-hash", passed: true, findings: [] });
    const bundle = await signPublishBundle({ schemaVersion: 1, tenantId: "tenant-1", slug: "roof-site",
      project: "roof-pages", knowledgeRelease: KNOWLEDGE_RELEASE, issuedAt: now, expiresAt: now + 600_000,
      artifact, evidence, files }, secret);
    assert.deepEqual(await verifyPublishBundle(bundle, secret, now), { ok: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Worker uploads only the authenticated exact bundle and preserves content on rejection", async () => {
  const files = { "index.html": encode("<h1>Test service</h1><p>Call for an estimate.</p>"), "theme.css": encode("body{color:#123456}") };
  const artifact = await manifestFromBase64(files);
  const evidence = sealReceipt({ id: "launch-preflight", scope: "launch", buildHash: artifact.sha256, policyHash: LAUNCH_POLICY_ID,
    knowledgeHash: "verified-release-hash", passed: true, findings: [] });
  const now = Date.now();
  const body: PublishBundleBody = { schemaVersion: 1, tenantId: "tenant-1", slug: "test-site", project: "test-pages",
    knowledgeRelease: KNOWLEDGE_RELEASE, issuedAt: now, expiresAt: now + 600_000, artifact, evidence, files };
  const valid = await signPublishBundle(body, secret);
  const stored = new Map<string, string>([["sites/test-site/dist/index.html", "old content"]]);
  let uploads = 0;
  let versions = 0;
  const env = {
    CF_ACCOUNT_ID: "account", CF_API_TOKEN: "token", PUBLISH_ATTESTATION_SECRET: secret,
    R2: { put: async (path: string, value: Uint8Array) => { stored.set(path, Buffer.from(value).toString()); } },
    DB: { prepare: (sql: string) => ({ bind: () => ({ first: async () => {
      if (sql.startsWith("SELECT")) return { id: "tenant-1", slug: "test-site", pages_project: "test-pages", status: "active" };
      versions++; return { content_version: 2 };
    } }) }) },
  } as unknown as Env;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    uploads++;
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/upload-token")) {
      assert.equal(init?.headers && (init.headers as Record<string, string>).authorization, "Bearer token");
      return Response.json({ success: true, result: { jwt: "asset-jwt" } });
    }
    if (path.endsWith("/check-missing")) {
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer asset-jwt");
      return Response.json({ success: true, result: JSON.parse(String(init?.body)).hashes });
    }
    if (path.endsWith("/assets/upload")) {
      const uploaded = JSON.parse(String(init?.body)) as { key: string; value: string }[];
      assert.ok(uploaded.some(asset => Buffer.from(asset.value, "base64").toString() === "<h1>Test service</h1><p>Call for an estimate.</p>"));
      return Response.json({ success: true });
    }
    if (path.endsWith("/upsert-hashes")) return Response.json({ success: true });
    const form = init?.body as FormData;
    const manifest = JSON.parse(String(form.get("manifest"))) as Record<string, string>;
    assert.deepEqual(Object.keys(manifest).sort(), ["/index.html", "/theme.css"]);
    assert.equal(form.get("pages_build_output_dir"), "dist");
    return Response.json({ success: true, result: { id: "deployment-1" } });
  }) as typeof fetch;
  for (const invalid of [
    { ...valid, files: { ...valid.files, "index.html": encode("altered") } },
    { ...valid, signature: "0".repeat(64) },
    { ...valid, expiresAt: now - 1 },
    { ...valid, evidence: { ...valid.evidence, passed: true, buildHash: "forged" } },
    await signPublishBundle({ ...body, evidence: { ...evidence, digest: "0".repeat(64) } }, secret),
  ]) {
    const result = await publishAttestedBundle(env, invalid, fetcher);
    assert.equal(result.ok, false);
    assert.equal(stored.get("sites/test-site/dist/index.html"), "old content");
    assert.equal(uploads, 0);
    assert.equal(versions, 0);
  }
  const failedUpload = await publishAttestedBundle(env, valid, (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/upload-token")) return Response.json({ success: true, result: { jwt: "asset-jwt" } });
    if (path.endsWith("/check-missing")) return Response.json({ success: true, result: JSON.parse(String(init?.body)).hashes });
    if (path.endsWith("/assets/upload")) return Response.json({ success: false, errors: [{ message: "mock asset failure" }] }, { status: 503 });
    throw new Error(`Unexpected request: ${path}`);
  }) as typeof fetch);
  assert.equal(failedUpload.ok, false);
  assert.equal(stored.get("sites/test-site/dist/index.html"), "old content");
  assert.equal(versions, 0);
  const accepted = await publishAttestedBundle(env, valid, fetcher);
  assert.equal(accepted.ok, true, accepted.message);
  assert.equal(uploads, 5);
  assert.equal(stored.get("sites/test-site/dist/index.html"), "<h1>Test service</h1><p>Call for an estimate.</p>");
  assert.equal(versions, 1);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    const rejected = await route(env, new Request("https://kernel.test/api/publish-attested", { method: "POST", body: JSON.stringify({ ...valid, signature: "0".repeat(64) }) }));
    assert.equal(rejected.status, 403);
    const acceptedRoute = await route(env, new Request("https://kernel.test/api/publish-attested", { method: "POST", body: JSON.stringify(valid) }));
    assert.equal(acceptedRoute.status, 200, await acceptedRoute.text());
    assert.equal(uploads, 10);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
