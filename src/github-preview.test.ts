import { test } from "node:test";
import assert from "node:assert/strict";
import { listTreeFiles, ALLOWED_WRITE_PATHS } from "./worker/github.ts";
import { loadTenantSiteFromGithub } from "./worker/publish.ts";

test("github helpers export tree listing and site loader", () => {
  assert.equal(typeof listTreeFiles, "function");
  assert.equal(typeof loadTenantSiteFromGithub, "function");
  assert.ok(ALLOWED_WRITE_PATHS.has("site.json"));
  assert.ok(ALLOWED_WRITE_PATHS.has("theme/defaults.json"));
});
