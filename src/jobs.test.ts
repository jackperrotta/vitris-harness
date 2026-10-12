import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlugFromRecipient, parseSlugFromSubject } from "./worker/jobs.ts";
import { extractEmailAddress } from "./worker/email.ts";

test("parseSlugFromRecipient reads plus-addressing", () => {
  assert.equal(parseSlugFromRecipient("updates+acme@vitris.co"), "acme");
  assert.equal(parseSlugFromRecipient("hello@vitris.co"), null);
});

test("parseSlugFromSubject reads site tag", () => {
  assert.equal(parseSlugFromSubject("[site: harbor] please update hours"), "harbor");
  assert.equal(parseSlugFromSubject("slug: demo change banner"), "demo");
});

test("extractEmailAddress unwraps angle brackets", () => {
  assert.equal(extractEmailAddress("Ada <owner@demo.test>"), "owner@demo.test");
  assert.equal(extractEmailAddress("owner@demo.test"), "owner@demo.test");
});
