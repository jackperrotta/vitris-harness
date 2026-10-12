import { test } from "node:test";
import assert from "node:assert/strict";
import { hasSafeSessionSecret, isDevLogin, type Env } from "./worker/env.ts";
import { publishAttestedBundle, addPagesDomain } from "./worker/publish.ts";

test("development login requires an explicitly enabled local request", () => {
  const enabled = { DEV_LOGIN: "1" } as Env;
  assert.equal(isDevLogin(enabled, new Request("http://127.0.0.1:8787/app/login")), true);
  assert.equal(isDevLogin(enabled, new Request("http://app.localhost:8787/app/login")), true);
  assert.equal(isDevLogin(enabled, new Request("https://example.workers.dev/app/login")), false);
  assert.equal(isDevLogin(enabled), false);
  assert.equal(isDevLogin({} as Env, new Request("http://localhost:8787/app/login")), false);
});

test("Worker Preview cannot publish to Pages or attach a domain", async () => {
  const env = { VITRIS_PREVIEW: "1", CF_ACCOUNT_ID: "account", CF_API_TOKEN: "token" } as Env;
  const published = await publishAttestedBundle(env, {} as Parameters<typeof publishAttestedBundle>[1], () => {
    throw new Error("Preview attempted a Cloudflare API call");
  });
  assert.equal(published.ok, false);
  assert.match(published.message, /disabled in Worker Previews/);
  const domain = await addPagesDomain(env, "production-site", "example.com");
  assert.equal(domain.ok, false);
  assert.match(domain.message, /disabled in Worker Previews/);
});

test("public Worker requests fail closed without a session secret", async () => {
  const remote = new Request("https://vitris-kernel.workers.dev/");
  assert.equal(hasSafeSessionSecret({} as Env, remote), false);
  assert.equal(hasSafeSessionSecret({ SESSION_SECRET: "short" } as Env, remote), false);
  assert.equal(hasSafeSessionSecret({ SESSION_SECRET: "x".repeat(32) } as Env, remote), true);
});
