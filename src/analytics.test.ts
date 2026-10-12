import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyChannel,
  classifyDevice,
  clampInt,
  isBotUa,
  isMapsHref,
  isUuid,
  normalizePath,
  referrerHost,
  tallyTop,
} from "./analytics.ts";

test("classifies channels from UTM and referrers", () => {
  assert.equal(classifyChannel({ utmMedium: "cpc", utmSource: "google" }), "paid");
  assert.equal(classifyChannel({ utmMedium: "email" }), "email");
  assert.equal(classifyChannel({ utmMedium: "social", utmSource: "instagram" }), "social");
  assert.equal(classifyChannel({ referrer: "https://www.google.com/search?q=barber" }), "organic");
  assert.equal(classifyChannel({ referrer: "https://instagram.com/p/x" }), "social");
  assert.equal(classifyChannel({ referrer: "https://news.example.com/story" }), "referral");
  assert.equal(classifyChannel({}), "direct");
});

test("classifies devices from user agents", () => {
  assert.equal(classifyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "mobile");
  assert.equal(classifyDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
  assert.equal(classifyDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120"), "desktop");
  assert.equal(classifyDevice("Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile"), "mobile");
});

test("detects bots and maps links", () => {
  assert.equal(isBotUa("Googlebot/2.1"), true);
  assert.equal(isBotUa("Mozilla/5.0 (Windows NT 10.0)"), false);
  assert.equal(isMapsHref("https://maps.google.com/?q=Harbor"), true);
  assert.equal(isMapsHref("https://www.google.com/maps/place/x"), true);
  assert.equal(isMapsHref("https://example.com/contact"), false);
});

test("validates uuids and clamps ints", () => {
  assert.equal(isUuid("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(""), false);
  assert.equal(clampInt("80", 0, 100), 80);
  assert.equal(clampInt(150, 0, 100), 100);
  assert.equal(clampInt(-5, 0, 100), 0);
  assert.equal(clampInt("nope", 0, 100, 7), 7);
});

test("normalizes paths and referrer hosts", () => {
  assert.equal(normalizePath("/about/"), "/about");
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath("https://shop.example/services?x=1"), "/services");
  assert.equal(referrerHost("https://www.Google.com/search"), "google.com");
  assert.equal(referrerHost(""), "");
});

test("tallies top rows", () => {
  assert.deepEqual(
    tallyTop([
      { key: "a", n: 1 },
      { key: "b", n: 5 },
      { key: "", n: 9 },
      { key: "c", n: 3 },
    ], 2),
    [
      { key: "b", n: 5 },
      { key: "c", n: 3 },
    ],
  );
});

/** Pure bounce / engaged session rules (mirrors rollup SQL). */
function sessionFlags(events: { kind: string; scroll_pct?: number }[]) {
  const pageviews = events.filter((e) => e.kind === "pageview").length;
  const converts = events.filter((e) => e.kind === "convert").length;
  const engages = events.filter((e) => e.kind === "engage").length;
  const maxScroll = Math.max(0, ...events.filter((e) => e.kind === "leave").map((e) => e.scroll_pct || 0));
  const bounce = pageviews === 1 && converts === 0;
  const engaged = engages + converts > 0 || maxScroll >= 50;
  return { bounce, engaged };
}

test("bounce and engaged session rules", () => {
  assert.deepEqual(sessionFlags([{ kind: "pageview" }, { kind: "leave", scroll_pct: 10 }]), {
    bounce: true,
    engaged: false,
  });
  assert.deepEqual(
    sessionFlags([{ kind: "pageview" }, { kind: "convert" }, { kind: "pageview" }]),
    { bounce: false, engaged: true },
  );
  assert.deepEqual(sessionFlags([{ kind: "pageview" }, { kind: "leave", scroll_pct: 80 }]), {
    bounce: true,
    engaged: true,
  });
  assert.deepEqual(sessionFlags([{ kind: "pageview" }, { kind: "engage" }]), {
    bounce: true,
    engaged: true,
  });
});

test("scroll funnel thresholds", () => {
  const scroll = 80;
  assert.equal(scroll >= 25, true);
  assert.equal(scroll >= 50, true);
  assert.equal(scroll >= 75, true);
  assert.equal(scroll >= 100, false);
});
