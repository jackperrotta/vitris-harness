import { test } from "node:test";
import assert from "node:assert/strict";
import { applySitePatch, parseSitePatch } from "./worker/patch.ts";
import { ALLOWED_WRITE_PATHS, previewUrl } from "./worker/github.ts";
import type { SiteConfig } from "./types.ts";

const site: SiteConfig = {
  name: "Demo",
  slug: "demo",
  motion: { strength: "editorial" },
};

test("parseSitePatch rejects unknown ops and structural edits", () => {
  assert.throws(() => parseSitePatch({ summary: "x", operations: [{ op: "explode" }] }));
  assert.throws(() =>
    parseSitePatch({
      summary: "x",
      operations: [{ op: "insertSection", pagePath: "/", index: 0, component: "cta-band", id: "a", bind: "a" }],
    }),
  );
});

test("applySitePatch updates theme tokens only", () => {
  const patch = parseSitePatch({
    summary: "Tweak accent",
    operations: [{ op: "set", path: "colorAccent", value: "#112233", target: "theme" }],
  });
  const result = applySitePatch({ site, content: {}, theme: {} }, patch);
  assert.equal(result.theme.colorAccent, "#112233");
  assert.ok(result.changedPaths.includes("theme/defaults.json"));
});

test("github allowlist and preview URL", () => {
  assert.ok(ALLOWED_WRITE_PATHS.has("site.json"));
  assert.ok(ALLOWED_WRITE_PATHS.has("theme/defaults.json"));
  assert.equal(ALLOWED_WRITE_PATHS.has("content/defaults.json"), false);
  assert.equal(previewUrl("acme", "update-abc"), "https://update-abc.acme.pages.dev");
});
