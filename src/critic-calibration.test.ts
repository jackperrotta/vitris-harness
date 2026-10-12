import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fingerprint, save, sourceHash, within, type Review } from "./agent/artifacts.ts";
import { evaluateV2, reviewSubject } from "./agent/evaluate.ts";
import {
  validateQualityReview,
  writePassingQualityArtifacts,
  PROBE_TOKEN,
  QUALITY_DIMENSIONS,
  qualitySubject,
  type QualityReview,
} from "./agent/design-quality.ts";

import { createPairwiseSession, missingLabelState, type DesignEvalPairLabel } from "./agent/design-evals.ts";

const kernel = resolve(import.meta.dirname, "..");
const temp = () => mkdtempSync(join(tmpdir(), "vitris-critic-cal-"));

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("guidance files copy.md and critic.md emphasize typography, hierarchy, and business fit without defensive disclaimers", () => {
  const copyMd = readFileSync(join(kernel, "agent/refs/copy.md"), "utf8");
  const criticMd = readFileSync(join(kernel, "agent/refs/critic.md"), "utf8");

  // Verify positive criteria presence
  assert.match(copyMd, /Headline Architecture/);
  assert.match(copyMd, /Substantiating Body/);
  assert.match(copyMd, /Business Authenticity/);
  assert.match(copyMd, /Truthful Actions/);
  assert.match(criticMd, /Typography & Readability/);
  assert.match(criticMd, /Layout Hierarchy & Composition/);
  assert.match(criticMd, /Business Fit & Grounding/);
  assert.match(criticMd, /Responsive Craft & Mobile Execution/);

  // Verify defensive disclaimers are eliminated
  assert.equal(/This is an example, not a banned phrase rule/i.test(copyMd), false);
  assert.equal(/Don't demand changes simply to justify your role/i.test(criticMd), false);
  assert.equal(/Do not fabricate browser checks/i.test(criticMd), false);
});

test("critic calibration cleanly discriminates restrained positive baseline from generic template and broken mobile", () => {
  // 1. POSITIVE FIXTURE: Restrained design positive baseline
  const posRoot = temp();
  mkdirSync(join(posRoot, "pages"), { recursive: true });
  mkdirSync(join(posRoot, "dist/about"), { recursive: true });
  mkdirSync(join(posRoot, "agent/screenshots/representative-browser"), { recursive: true });
  mkdirSync(join(posRoot, "agent/reviews"), { recursive: true });

  const posHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cotswold Heritage Roofing | Specialist Stone Slate Craft</title>
  <style>
    :root { --font-display: 'Cinzel', Georgia, serif; --font-body: 'Inter', system-ui, sans-serif; --slate: #1e293b; --zinc: #fafafa; --amber: #b45309; }
    body { margin: 0; font-family: var(--font-body); color: var(--slate); background: var(--zinc); line-height: 1.6; }
    .hero { max-width: 68ch; margin: 5rem auto; padding: 0 1.5rem; }
    h1 { font-family: var(--font-display); font-size: 2.75rem; line-height: 1.15; letter-spacing: -0.02em; color: var(--slate); margin-bottom: 1.5rem; }
    p.lead { font-size: 1.25rem; line-height: 1.5; color: #475569; margin-bottom: 2rem; }
    .btn { display: inline-block; padding: 0.875rem 1.75rem; min-height: 48px; min-width: 48px; background: var(--slate); color: #fff; text-decoration: none; border-radius: 4px; font-weight: 500; }
    .btn:hover { background: #334155; }
  </style>
</head>
<body>
  <header><nav><a href="/">Home</a> <a href="/about">Heritage Quarry Work</a></nav></header>
  <main>
    <section class="hero" id="hero">
      <h1>Cotswold Stone & Heritage Conservation</h1>
      <p class="lead">Specialist dry-stone slate re-laying, vernacular timber repair, and quarry-sourced conservation across Gloucestershire.</p>
      <a class="btn" href="/about">View Conservation Gallery</a>
    </section>
  </main>
</body>
</html>`;

  writeFileSync(join(posRoot, "pages/index.html"), posHtml);
  writeFileSync(join(posRoot, "pages/about.html"), '<h1>Heritage Quarry Work</h1><p>Our Cotswold stone sourcing methodology.</p>');
  writeFileSync(join(posRoot, "dist/index.html"), posHtml);
  writeFileSync(join(posRoot, "dist/about/index.html"), '<h1>Heritage Quarry Work</h1>');

  for (const name of ["home-375.png", "home-1080.png", "about-375.png", "about-1080.png"]) {
    writeFileSync(join(posRoot, "agent/screenshots/representative-browser", name), TINY_PNG);
  }

  const posSubject = reviewSubject(posRoot, "representative-review");
  const posReview: Review = {
    version: 2,
    verdict: "pass",
    reviewer: "calibrated-critic",
    subjectHash: posSubject,
    evidence: [
      "agent/screenshots/representative-browser/home-1080.png",
      "agent/screenshots/representative-browser/home-375.png",
    ],
    checks: [
      { criterion: "business-fit", verdict: "pass", evidence: "Authentic Cotswold conservation focus with verifiable local quarry details" },
      { criterion: "hierarchy", verdict: "pass", evidence: "Clear typography hierarchy with Cinzel display and disciplined 68ch body measure" },
      { criterion: "rhythm", verdict: "pass", evidence: "Balanced white space and proportioned section margins" },
      { criterion: "media-treatment", verdict: "pass", evidence: "Appropriate restrained heritage palette" },
      { criterion: "mobile", verdict: "pass", evidence: "Responsive single-column stack on 375px with 48px touch targets" },
      { criterion: "interior", verdict: "pass", evidence: "Designated /about heritage interior coherent with homepage" },
    ],
    findings: [],
  };
  save(join(posRoot, "agent/reviews/representative-review.json"), posReview);

  const posGrade = evaluateV2(posRoot, "representative-review");
  assert.equal(posGrade.ok, true, `Positive fixture failed evaluation: ${posGrade.failures.join("; ")}`);

  // 2. NEGATIVE FIXTURE: Generic Template Negative
  const genericRoot = temp();
  mkdirSync(join(genericRoot, "agent/reviews"), { recursive: true });
  mkdirSync(join(genericRoot, "agent/screenshots/representative-browser"), { recursive: true });
  writeFileSync(join(genericRoot, "agent/screenshots/representative-browser/home-1080.png"), TINY_PNG);
  writeFileSync(join(genericRoot, "agent/screenshots/representative-browser/home-375.png"), TINY_PNG);

  const genericSubject = reviewSubject(genericRoot, "representative-review");
  const genericReview: Review = {
    version: 2,
    verdict: "fail",
    reviewer: "calibrated-critic",
    subjectHash: genericSubject,
    evidence: [
      "agent/screenshots/representative-browser/home-1080.png",
      "agent/screenshots/representative-browser/home-375.png",
    ],
    checks: [
      { criterion: "business-fit", verdict: "fail", evidence: "Interchangeable corporate buzzwords; lacks factual grounding in client service" },
      { criterion: "hierarchy", verdict: "fail", evidence: "Monotonous equal emphasis across centered feature cards" },
      { criterion: "rhythm", verdict: "pass", evidence: "Adequate margin spacing" },
      { criterion: "media-treatment", verdict: "fail", evidence: "Generic stock purple gradients disconnected from brand" },
      { criterion: "mobile", verdict: "pass", evidence: "Stacks linearly" },
      { criterion: "interior", verdict: "pass", evidence: "Interior exists" },
    ],
    findings: [
      {
        id: "generic-buzzwords",
        page: "/",
        section: "hero",
        evidence: "Hero headline promises 'synergistic paradigm innovation' without stating what the company actually delivers",
        severity: "major",
        problem: "Unsubstantiated generic template copy lacks business differentiation and factual support",
        repair: "Rewrite hero and features to cite specific client capabilities, services, and verifiable proof",
        target: "copy",
        verify: "Confirm hero headline and body substantiate real business offerings",
      },
    ],
  };
  save(join(genericRoot, "agent/reviews/representative-review.json"), genericReview);

  const genericGrade = evaluateV2(genericRoot, "representative-review");
  assert.equal(genericGrade.ok, false);
  assert.match(genericGrade.failures.join(), /Reviewer verdict: fail|major: Unsubstantiated generic template/);

  // 3. NEGATIVE FIXTURE: Broken Mobile Negative
  const mobileRoot = temp();
  mkdirSync(join(mobileRoot, "agent/reviews"), { recursive: true });
  mkdirSync(join(mobileRoot, "agent/screenshots/representative-browser"), { recursive: true });
  writeFileSync(join(mobileRoot, "agent/screenshots/representative-browser/home-1080.png"), TINY_PNG);
  writeFileSync(join(mobileRoot, "agent/screenshots/representative-browser/home-375.png"), TINY_PNG);

  const mobileSubject = reviewSubject(mobileRoot, "representative-review");
  const mobileReview: Review = {
    version: 2,
    verdict: "fail",
    reviewer: "calibrated-critic",
    subjectHash: mobileSubject,
    evidence: [
      "agent/screenshots/representative-browser/home-1080.png",
      "agent/screenshots/representative-browser/home-375.png",
    ],
    checks: [
      { criterion: "business-fit", verdict: "pass", evidence: "Relevant local domain" },
      { criterion: "hierarchy", verdict: "pass", evidence: "Clear typography hierarchy" },
      { criterion: "rhythm", verdict: "pass", evidence: "Clean vertical cadence" },
      { criterion: "media-treatment", verdict: "pass", evidence: "Good imagery" },
      { criterion: "mobile", verdict: "fail", evidence: "Fixed 820px wrapper forces horizontal scrolling; 8px font unreadable on 375px" },
      { criterion: "interior", verdict: "pass", evidence: "Interior page designated" },
    ],
    findings: [
      {
        id: "broken-mobile-overflow",
        page: "/",
        section: "hero",
        evidence: "375px screenshot exhibits horizontal overflow and clipped text due to fixed 820px width",
        severity: "blocker",
        problem: "Mobile layout fails responsive craft with unreadable 8px text and horizontal scroll",
        repair: "Replace fixed widths with fluid max-width constraints and set minimum 16px body font size",
        target: "representative",
        verify: "Recapture 375px screenshot and ensure zero horizontal scroll",
      },
    ],
  };
  save(join(mobileRoot, "agent/reviews/representative-review.json"), mobileReview);

  const mobileGrade = evaluateV2(mobileRoot, "representative-review");
  assert.equal(mobileGrade.ok, false);
  assert.match(mobileGrade.failures.join(), /Reviewer verdict: fail|blocker: Mobile layout fails responsive craft/);
});

test("new pairwise evaluation sessions contain no invented operator preference labels", () => {
  const session = createPairwiseSession({dest: temp(), caseId: "fictional-calibration", versions: [{id: "baseline", label: "Baseline"}, {id: "candidate", label: "Candidate"}], seed: "fixed-test-seed"});
  const labels = JSON.parse(readFileSync(session.labelsPath, "utf8"));
  assert.equal(session.pairs.length, 1);
  assert.equal(labels.pairs.length, 1);
  const pair = labels.pairs[0] as DesignEvalPairLabel;
  assert.equal(missingLabelState(pair), "missing-overall");
  assert.equal(pair.overall, "");
  assert.ok(Object.values(pair.elements).every(value => value === ""));
});

test("[validator test] authentic visual critic calibration validates probe tokens, quality dimensions, and fails closed on corrupted/weak reviews", () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "dist/about"), { recursive: true });
  mkdirSync(join(root, "agent/screenshots/representative-browser"), { recursive: true });
  mkdirSync(join(root, "onboarding"), { recursive: true });
  mkdirSync(join(root, "agent/reviews"), { recursive: true });

  save(join(root, "onboarding/storyboard.json"), {
    pages: [
      { path: "/", sections: [{ id: "hero" }] },
      { path: "/about", representative: true, sections: [{ id: "about" }] },
    ],
  });
  save(join(root, "onboarding/copy-plan.json"), {
    version: 2,
    storyboardHash: fingerprint(root, ["onboarding/storyboard.json"]),
    pages: [
      { path: "/", sections: [{ id: "hero", heading: "Heritage Roofing", body: "Authentic Cotswold craft", factIds: [] }] },
      { path: "/about", sections: [{ id: "about", heading: "About Us", body: "Quarry details", factIds: [] }] },
    ],
  });
  writeFileSync(join(root, "pages/index.html"), "<h1>Heritage Roofing</h1><p>Authentic Cotswold craft</p>");
  writeFileSync(join(root, "pages/about.html"), "<h1>About Us</h1><p>Quarry details</p>");
  writeFileSync(join(root, "dist/index.html"), "<h1>Heritage Roofing</h1><p>Authentic Cotswold craft</p><a href=\"/about\">About</a>");
  writeFileSync(join(root, "dist/about/index.html"), "<h1>About Us</h1><p>Quarry details</p>");
  save(join(root, "onboarding/direction.json"), { version: 2, selected: "dir-a" });

  for (const name of ["home-375.png", "home-1080.png", "about-375.png", "about-1080.png"]) {
    writeFileSync(join(root, "agent/screenshots/representative-browser", name), TINY_PNG);
  }

  // 1. Valid passing quality review passes
  writePassingQualityArtifacts(root, { observedToken: PROBE_TOKEN });
  const validGrade = validateQualityReview(root, { requirePass: true });
  assert.equal(validGrade.ok, true, `Valid quality review failed: ${validGrade.failures.join("; ")}`);

  // 2. Corrupted RGB probe token fails
  const reviewPath = join(root, "agent/reviews/representative-quality.json");
  const baseReview = JSON.parse(readFileSync(reviewPath, "utf8")) as QualityReview;

  const badProbeReview = {
    ...baseReview,
    visualInspection: {
      ...baseReview.visualInspection!,
      observedToken: "ff0000",
    },
  };
  save(reviewPath, badProbeReview);
  const badProbeGrade = validateQualityReview(root, { requirePass: true });
  assert.equal(badProbeGrade.ok, false);
  assert.match(badProbeGrade.failures.join(), /probe/i);

  // 3. Score below quality floor fails
  const weakDimensionReview = {
    ...baseReview,
    dimensions: baseReview.dimensions.map((d: any) =>
      d.name === "typography" ? { ...d, score: 1 } : d
    ),
  };
  save(reviewPath, weakDimensionReview);
  const weakGrade = validateQualityReview(root, { requirePass: true });
  assert.equal(weakGrade.ok, false);
  assert.match(weakGrade.failures.join(), /below quality floor/i);

  // 4. Missing required quality dimension fails
  const missingDimReview = {
    ...baseReview,
    dimensions: baseReview.dimensions.filter((d: any) => d.name !== "composition"),
  };
  save(reviewPath, missingDimReview);
  const missingGrade = validateQualityReview(root, { requirePass: true });
  assert.equal(missingGrade.ok, false);
  assert.match(missingGrade.failures.join(), /missing dimension.*composition/i);

  // 5. Generic praise without concrete evidence fails
  const genericPraiseReview = {
    ...baseReview,
    dimensions: baseReview.dimensions.map((d: any) =>
      d.name === "composition" ? { ...d, evidence: "modern clean layout" } : d
    ),
  };
  save(reviewPath, genericPraiseReview);
  const genericGrade = validateQualityReview(root, { requirePass: true });
  assert.equal(genericGrade.ok, false);
  assert.match(genericGrade.failures.join(), /generic praise/i);

  // 6. Hard blocker finding fails closed
  const blockerReview = {
    ...baseReview,
    findings: [
      {
        id: "blocking-defect",
        page: "/",
        section: "hero",
        evidence: "Text unreadable over background",
        severity: "blocker" as const,
        problem: "Zero contrast",
        repair: "Increase contrast",
        target: "representative",
        verify: "Check contrast",
      },
    ],
  };
  save(reviewPath, blockerReview);
  const blockerGrade = validateQualityReview(root, { requirePass: true });
  assert.equal(blockerGrade.ok, false);
  assert.match(blockerGrade.failures.join(), /Hard quality failure/i);

  // 7. Stale subjectHash fails closed when source changes
  save(reviewPath, baseReview);
  writeFileSync(join(root, "pages/index.html"), "<h1>Modified after quality review</h1>");
  const staleGrade = validateQualityReview(root, { requirePass: true });
  assert.equal(staleGrade.ok, false);
  assert.match(staleGrade.failures.join(), /subjectHash/i);
});

test("authentic browser verifier accepts clean responsive layout and captures real multi-KB screenshots", async () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cotswold Heritage Craft</title>
  <style>
    :root { --font-display: serif; --font-body: sans-serif; --slate: #1e293b; --bg: #fafafa; }
    body { margin: 0; font-family: var(--font-body); color: var(--slate); background: var(--bg); line-height: 1.6; }
    .hero { max-width: 68ch; margin: 3rem auto; padding: 0 1.5rem; }
    h1 { font-family: var(--font-display); font-size: 2.25rem; line-height: 1.2; margin-bottom: 1rem; }
    p { font-size: 1.125rem; color: #475569; }
    a.btn { display: inline-block; padding: 0.75rem 1.5rem; min-height: 48px; background: var(--slate); color: #fff; text-decoration: none; border-radius: 4px; box-sizing: border-box; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>Cotswold Stone & Heritage Conservation</h1>
      <p>Specialist dry-stone slate re-laying and conservation across Gloucestershire.</p>
      <a class="btn" href="#details">Explore Services</a>
    </section>
    <section id="details" style="padding: 2rem 1.5rem;">
      <h2>Conservation Standards</h2>
      <p>Traditional masonry techniques preserved.</p>
    </section>
  </main>
</body>
</html>`;
  writeFileSync(join(root, "pages/index.html"), html);
  save(join(root, "site.json"), { name: "Cotswold Heritage", slug: "cotswold", lang: "en" });
  save(join(root, "onboarding/storyboard.json"), {
    version: 2,
    pages: [{ path: "/", representative: true }],
  });

  const run = spawnSync(process.execPath, [
    "--experimental-strip-types",
    join(kernel, "scripts/verify-browser.ts"),
    "--site",
    root,
    "--representative",
  ], { encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(readFileSync(join(root, "agent/reviews/representative-browser.json"), "utf8"));
  assert.equal(report.checks.length, 4);
  assert.deepEqual(report.checks.map((check: { width: number; motion: string }) => [check.width, check.motion]), [[375, "normal"], [375, "reduce"], [1080, "normal"], [1080, "reduce"]]);

  // Both viewports and both preferences must pass with zero failures.
  for (const check of report.checks) {
    assert.equal(check.failures.length, 0, `Unexpected failure on ${check.width}px: ${check.failures.join(", ")}`);
    const screenshotPath = join(root, check.screenshot);
    assert.ok(existsSync(screenshotPath), `Missing screenshot at ${check.screenshot}`);
    // Multi-KB real PNG, not a 1-pixel buffer!
    const stats = statSync(screenshotPath);
    assert.ok(stats.size > 2000, `Expected real browser screenshot (>2KB), got ${stats.size} bytes`);
  }
});

test("authentic browser verifier catches mobile horizontal overflow from fixed desktop widths", async () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  // Layout with rigid fixed width 1200px breaking 375px mobile screen
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Broken Mobile Layout</title>
</head>
<body>
  <main>
    <h1>Desktop-Only Layout</h1>
    <div style="width: 1200px; background: #eee; padding: 20px;">
      <p>This box forces rigid 1200px width on all screens, breaking mobile layout.</p>
    </div>
  </main>
</body>
</html>`;
  writeFileSync(join(root, "pages/index.html"), html);
  save(join(root, "site.json"), { name: "Broken Layout", slug: "broken", lang: "en" });
  save(join(root, "onboarding/storyboard.json"), {
    version: 2,
    pages: [{ path: "/", representative: true }],
  });

  const run = spawnSync(process.execPath, [
    "--experimental-strip-types",
    join(kernel, "scripts/verify-browser.ts"),
    "--site",
    root,
    "--representative",
  ], { encoding: "utf8" });

  assert.equal(run.status, 1, "Expected exit code 1 due to visual/layout failures");
  const report = JSON.parse(readFileSync(join(root, "agent/reviews/representative-browser.json"), "utf8"));

  const mobileCheck = report.checks.find((c: any) => c.width === 375);
  const desktopCheck = report.checks.find((c: any) => c.width === 1080);

  assert.ok(mobileCheck, "Mobile 375px check missing");
  assert.ok(desktopCheck, "Desktop 1080px check missing");

  // Mobile MUST detect horizontal overflow
  assert.ok(
    mobileCheck.failures.includes("Horizontal overflow"),
    `Expected mobile check to catch 'Horizontal overflow', got: ${mobileCheck.failures.join(", ")}`
  );
  assert.ok(mobileCheck.failures.length > 0);
});

test("authentic browser verifier detects missing h1 and broken images in live DOM", async () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Defective DOM</title>
</head>
<body>
  <main>
    <h2>Subheading without primary title</h2>
    <img src="http://127.0.0.1:9999/broken.jpg" alt="Missing">
  </main>
</body>
</html>`;
  writeFileSync(join(root, "pages/index.html"), html);
  save(join(root, "site.json"), { name: "Defective DOM", slug: "defective", lang: "en" });
  save(join(root, "onboarding/storyboard.json"), {
    version: 2,
    pages: [{ path: "/", representative: true }],
  });

  const run = spawnSync(process.execPath, [
    "--experimental-strip-types",
    join(kernel, "scripts/verify-browser.ts"),
    "--site",
    root,
    "--representative",
  ], { encoding: "utf8" });

  assert.equal(run.status, 1, "Expected exit code 1 due to DOM defects");
  const report = JSON.parse(readFileSync(join(root, "agent/reviews/representative-browser.json"), "utf8"));
  const anyCheck = report.checks[0]!;

  assert.ok(
    anyCheck.failures.includes("Expected one h1"),
    `Expected failure 'Expected one h1', got: ${anyCheck.failures.join(", ")}`
  );
  assert.ok(
    anyCheck.failures.some((f: string) => f.includes("Broken image")),
    `Expected failure for broken image, got: ${anyCheck.failures.join(", ")}`
  );
});

test("visual critic calibration discriminates qualitative dimensions: business fit, composition, typography, and copy quality", () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "dist/about"), { recursive: true });
  mkdirSync(join(root, "agent/screenshots/representative-browser"), { recursive: true });
  mkdirSync(join(root, "onboarding"), { recursive: true });
  mkdirSync(join(root, "agent/reviews"), { recursive: true });

  save(join(root, "onboarding/storyboard.json"), {
    pages: [
      { path: "/", sections: [{ id: "hero" }] },
      { path: "/about", representative: true, sections: [{ id: "about" }] },
    ],
  });
  save(join(root, "onboarding/copy-plan.json"), {
    version: 2,
    storyboardHash: fingerprint(root, ["onboarding/storyboard.json"]),
    pages: [
      { path: "/", sections: [{ id: "hero", heading: "Heritage Roofing", body: "Authentic Cotswold craft", factIds: [] }] },
      { path: "/about", sections: [{ id: "about", heading: "About Us", body: "Quarry details", factIds: [] }] },
    ],
  });
  writeFileSync(join(root, "pages/index.html"), "<h1>Heritage Roofing</h1><p>Authentic Cotswold craft</p>");
  writeFileSync(join(root, "pages/about.html"), "<h1>About Us</h1><p>Quarry details</p>");
  writeFileSync(join(root, "dist/index.html"), "<h1>Heritage Roofing</h1><p>Authentic Cotswold craft</p><a href=\"/about\">About</a>");
  writeFileSync(join(root, "dist/about/index.html"), "<h1>About Us</h1><p>Quarry details</p>");
  save(join(root, "onboarding/direction.json"), { version: 2, selected: "dir-a" });

  for (const name of ["home-375.png", "home-1080.png", "about-375.png", "about-1080.png"]) {
    writeFileSync(join(root, "agent/screenshots/representative-browser", name), TINY_PNG);
  }

  // Base passing setup
  writePassingQualityArtifacts(root, { observedToken: PROBE_TOKEN });
  const reviewPath = join(root, "agent/reviews/representative-quality.json");
  const baseReview = JSON.parse(readFileSync(reviewPath, "utf8")) as QualityReview;

  // 1. BUSINESS FIT DISCRIMINATION:
  // Must reach score 3. Rating 2 (generic claims / detached from harvest) must fail.
  const businessFitDefect = {
    ...baseReview,
    dimensions: baseReview.dimensions.map(d =>
      d.name === "business-specificity"
        ? { ...d, score: 2 as const, evidence: "Interchangeable marketing buzzwords without verifiable local trade services" }
        : d
    ),
  };
  save(reviewPath, businessFitDefect);
  const businessFitGrade = validateQualityReview(root, { requirePass: true });
  assert.equal(businessFitGrade.ok, false);
  assert.match(businessFitGrade.failures.join(), /business-specificity must reach 3/);

  // 2. COMPOSITION & ORIGINALITY DISCRIMINATION:
  // Must reach score 3. Rating 2 (lack of visual focal point / chaotic equal weighting) must fail.
  const compositionDefect = {
    ...baseReview,
    dimensions: baseReview.dimensions.map(d =>
      d.name === "composition"
        ? { ...d, score: 2 as const, evidence: "Monotonous 3-column card grid with equal visual weight and no dominant focal point" }
        : d
    ),
  };
  save(reviewPath, compositionDefect);
  const compositionGrade = validateQualityReview(root, { requirePass: true });
  assert.equal(compositionGrade.ok, false);
  assert.match(compositionGrade.failures.join(), /composition must reach 3/);

  // 3. TYPOGRAPHY & READABILITY DISCRIMINATION:
  // Must meet quality floor 2. Rating 1 (illegible contrast / hierarchy collapse) must fail.
  const typographyDefect = {
    ...baseReview,
    dimensions: baseReview.dimensions.map(d =>
      d.name === "typography"
        ? { ...d, score: 1 as const, evidence: "Low contrast gray text on white background with inverted heading sizes" }
        : d
    ),
  };
  save(reviewPath, typographyDefect);
  const typographyGrade = validateQualityReview(root, { requirePass: true });
  assert.equal(typographyGrade.ok, false);
  assert.match(typographyGrade.failures.join(), /typography below quality floor \(1\)/);

  // 4. COPY QUALITY & DESIGN INTEGRATION DISCRIMINATION:
  // Must meet quality floor 2. Rating 1 (disconnected filler copy / unsubstantiated promises) must fail.
  const copyDefect = {
    ...baseReview,
    dimensions: baseReview.dimensions.map(d =>
      d.name === "copy-design-integration"
        ? { ...d, score: 1 as const, evidence: "Placeholder lorem ipsum and corporate filler disconnected from visual section structure" }
        : d
    ),
  };
  save(reviewPath, copyDefect);
  const copyGrade = validateQualityReview(root, { requirePass: true });
  assert.equal(copyGrade.ok, false);
  assert.match(copyGrade.failures.join(), /copy-design-integration below quality floor \(1\)/);

  // 5. QUALIFIED GROUNDED REVIEW PASSES:
  // When all four qualitative dimensions are grounded with concrete section/viewport evidence and calibrated scores:
  save(reviewPath, baseReview);
  const passingQuality = validateQualityReview(root, { requirePass: true });
  assert.equal(passingQuality.ok, true, `Quality review should pass: ${passingQuality.failures.join("; ")}`);
  const evalResult = evaluateV2(root, "representative-quality");
  assert.equal(evalResult.ok, true, `evaluateV2 representative-quality failed: ${evalResult.failures.join("; ")}`);
});



