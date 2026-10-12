import { test } from "node:test";
import assert from "node:assert/strict";
import {
  builderFields,
  componentLabel,
  isKernelOwnedBind,
  resolveEditorPage,
} from "./schema.ts";

test("builderFields is empty without an owner editor", () => {
  assert.deepEqual(builderFields(), []);
});

test("labels components and detects kernel-owned binds", () => {
  assert.equal(componentLabel("site-header"), "Site Header");
  assert.equal(componentLabel("media-spotlight"), "Media Spotlight");
  assert.equal(isKernelOwnedBind("cookieComplianceBody"), true);
  assert.equal(isKernelOwnedBind("hero"), false);
});

test("resolves editor page paths", () => {
  assert.equal(resolveEditorPage({}, null), "/");
  assert.equal(resolveEditorPage({}, "/about"), "/about");
});
