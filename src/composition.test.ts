import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveDesignAuthoring } from "./agent/composition-authoring.ts";
import { loadCompositionPack } from "./knowledge/composition.ts";
import { compositionSignalsFromSite, selectCompositionLessons } from "./agent/composition-context.ts";
import { buildDesignContextPacket } from "./agent/design-context-packet.ts";
import { validateCompositionStoryboard } from "./agent/composition-contract.ts";
import { validateStoryboardDesign } from "./agent/design-contracts.ts";
import { fileSha256, validateCompositionQualityObservations } from "./agent/design-quality.ts";
import { fingerprint } from "./agent/artifacts.ts";
import { solidPng } from "./agent/design-calibration.ts";
import type { Business, MediaInventory, QualityReview, Storyboard } from "./agent/artifacts.ts";

const kernel = resolve(import.meta.dirname, "..");
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-composition-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { "@tryvitris/website-harness": `file:${kernel.replaceAll("\\", "/")}` } }));
  return root;
};
const write = (root: string, path: string, data: unknown) => { const target = join(root, path); mkdirSync(resolve(target, ".."), { recursive: true }); writeFileSync(target, JSON.stringify(data)); };

test("authoring policy keeps existing sites on blocks and rejects unknown releases", () => {
  const root = fixture();
  try {
    assert.equal(resolveDesignAuthoring(root).mode, "blocks-v0");
    write(root, "launch.json", { designLibraryProfile: "slice-v1", designAuthoring: { mode: "composition-v1", lessonRelease: "2026-09-28.1" } });
    assert.equal(resolveDesignAuthoring(root).mode, "composition-v1");
    write(root, "launch.json", { designAuthoring: { mode: "composition-v1", lessonRelease: "missing" } });
    assert.throws(() => resolveDesignAuthoring(root), /Unsupported/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the pinned pack rejects changed body and example metadata", () => {
  const source = loadCompositionPack(kernel);
  assert.equal(source.lessons.length, 24);
  assert.equal(source.examples.length, 72);
  const root = mkdtempSync(join(tmpdir(), "vitris-composition-pack-"));
  try {
    cpSync(join(kernel, "design-system/knowledge/v2"), join(root, "design-system/knowledge/v2"), { recursive: true });
    cpSync(join(kernel, "design-system/knowledge/v3"), join(root, "design-system/knowledge/v3"), { recursive: true });
    mkdirSync(join(root, "design-system/calibration/v1"), { recursive: true });
    writeFileSync(join(root, "design-system/calibration/v1/manifest.json"), "{}");
    mkdirSync(join(root, "agent")); writeFileSync(join(root, "agent/graph.yaml"), "");
    // Direct kernel discovery uses the real calibration version; a file dependency
    // from a site resolves the fake kernel without requiring the full pack.
    const site = join(root, "site"); mkdirSync(site);
    write(site, "package.json", { dependencies: { "@tryvitris/website-harness": "file:.." } });
    const lessonPath = join(root, "design-system/knowledge/v3", source.lessons[0]!.bodyPath);
    writeFileSync(lessonPath, readFileSync(lessonPath, "utf8") + "changed");
    assert.throws(() => loadCompositionPack(site), /hash mismatch/i);
    cpSync(join(kernel, "design-system/knowledge/v3", source.lessons[0]!.bodyPath), lessonPath);
    const examplesPath = join(root, "design-system/knowledge/v3/examples/catalog.json");
    writeFileSync(examplesPath, readFileSync(examplesPath, "utf8") + "changed");
    assert.throws(() => loadCompositionPack(site), /hash mismatch/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("composition packet recomputes lessons and exposes actual quality intent", () => {
  const root = fixture();
  try {
    write(root, "launch.json", { designAuthoring: { mode: "composition-v1", lessonRelease: "2026-09-28.1" } });
    write(root, "onboarding/narrative-brief.json", { visitorQuestions: [{ id: "choice", question: "Which service should I choose?", relationshipToConversion: "selection" }], designOpportunities: [] });
    const packet = buildDesignContextPacket({ root, nodeId: "reference-analysis" });
    assert.equal(packet.manifest.authoringPolicy?.mode, "composition-v1");
    assert.ok(packet.manifest.compositionSelection?.selectedIds.includes("cmp-comparison"));
    assert.ok(packet.expansions.some(item => item.id === "composition:cmp-comparison@1"));
    const quality = buildDesignContextPacket({ root, nodeId: "representative-quality" });
    assert.ok(quality.manifest.requiredSections.includes("render-observations"));
    assert.equal(quality.manifest.authoringPolicy?.mode, "composition-v1");
    const section = (id: string, question: string) => ({ id, question, message: question, facts: [], media: [], action: null, composition: "prose", emphasis: "main", transition: "next" });
    write(root, "onboarding/storyboard.json", { version: 3, businessHash: "fixture", directionHash: "fixture", routes: [], pages: [{ path: "/", purpose: "Choose", representative: true, sections: [section("choice", "Which service should I choose?")] }, { path: "/visit", purpose: "Visit", representative: true, sections: [section("hours", "What are your hours and address?")] }] });
    const scoped = buildDesignContextPacket({ root, nodeId: "representative" });
    assert.equal(scoped.manifest.compositionPageSelections?.length, 2);
    assert.ok(scoped.manifest.compositionPageSelections?.find(item => item.page === "/visit")?.selectedIds.includes("cmp-local-information"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unknown signals do not prove absence and selection remains deterministic", () => {
  const root = fixture();
  try {
    const signals = compositionSignalsFromSite(root);
    assert.equal(signals.find(item => item.id === "approved-image")?.state, "unknown");
    const pack = loadCompositionPack(root);
    const input = { pack, stage: "storyboard", signals: [{ id: "comparison", state: "known" as const, origin: "visitor-question" }], policyHash: "hash" };
    assert.deepEqual(selectCompositionLessons(input), selectCompositionLessons(input));
    assert.ok(selectCompositionLessons(input).selected.some(item => item.id === "cmp-comparison"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("composition references detect unknown targets and permit useful repeated layout", () => {
  const pack = loadCompositionPack(kernel);
  const business: Business = { version: 2, offer: "Advisory", audience: "Visitors", trigger: "Need advice", outcome: "Understand scope", includes: [], engagement: "Inquiry", positioning: "Clear scope", facts: [{ id: "f1", claim: "Supported scope", evidence: [] }], evidence: [], uncertainties: [] };
  const media: MediaInventory = { version: 2, harvestHash: "fixture", assets: [] };
  const base = { id: "service", question: "What?", message: "Scope", facts: ["f1"], media: [], action: null, composition: "list", emphasis: "equal", transition: "next", role: "service", purpose: "Scan", emphasisReason: "Equal options", layoutFamily: "list", density: "compact", mediaProminence: "none", mobileTransformation: "wrap" };
  const story: Storyboard = { version: 3, businessHash: "fixture", directionHash: "fixture", routes: [{ source: "/", disposition: "preserve", reason: "Main route" }], designContractVersion: 1, compositionContractVersion: 1, compositionLessonRelease: pack.release, pages: [{ path: "/", purpose: "Find scope", representative: true, role: "directory", visitorOutcome: "Find scope", compositionIntent: { organizingRelationship: "Compare equal scopes", readingSequence: ["service","about","contact","other"] }, sections: [base, ...["about","contact","other"].map(id => ({ ...base, id }))] }] };
  assert.equal(validateStoryboardDesign(story, { compositionMode: true }).length, 0);
  assert.deepEqual(validateCompositionStoryboard(story, pack, business, media), []);
  story.pages[0]!.sections[0]!.elementPlan = [{ id: "scope", role: "explanation", contentRefs: [{ kind: "fact", id: "missing" }] }];
  story.pages[0]!.sections[0]!.renderObservations = [{ id: "scope-visible", elementIds: ["missing"], viewportClass: "all", state: "initial", expectation: "Visible", verification: "visual" }];
  assert.ok(validateCompositionStoryboard(story, pack, business, media).some(item => /Unknown fact|Invalid render observation/.test(item)));
});

test("located quality observations reject changed captures and missing targets", () => {
  const root = fixture();
  try {
    write(root, "launch.json", { designAuthoring: { mode: "composition-v1", lessonRelease: "2026-09-28.1" } });
    const story: Storyboard = { version: 3, businessHash: "fixture", directionHash: "fixture", routes: [], compositionContractVersion: 1, compositionLessonRelease: "2026-09-28.1", pages: [{ path: "/", purpose: "Explain service", representative: true, sections: [{ id: "scope", question: "What?", message: "Scope", facts: [], media: [], action: null, composition: "prose", emphasis: "main", transition: "next", elementPlan: [{ id: "scope-text", role: "explanation", contentRefs: [{ kind: "section-message", sectionId: "scope" }] }], renderObservations: [{ id: "scope-readable", elementIds: ["scope-text"], viewportClass: "narrow", state: "initial", expectation: "The scope is readable", verification: "visual" }] }] }] };
    write(root, "onboarding/storyboard.json", story);
    const screenshot = "agent/screenshots/representative-browser/home-375.png";
    mkdirSync(resolve(root, "agent/screenshots/representative-browser"), { recursive: true });
    writeFileSync(join(root, screenshot), solidPng(30, 80, 100));
    const capture = { path: "/", width: 375, motion: "reduce", screenshot, failures: [] };
    const target = { path: "/", width: 375, motion: "reduce", sectionId: "scope", elementId: "scope-text", count: 1, visible: true, screenshot, screenshotHash: fingerprint(root, [screenshot]), captureSha256: fileSha256(join(root, screenshot)) };
    write(root, "agent/reviews/representative-browser.json", { checks: [capture], compositionTargets: [target] });
    const review = { compositionReviewVersion: 1, compositionObservations: [{ observationId: "scope-readable", page: "/", sectionIds: ["scope"], elementIds: ["scope-text"], viewport: "375", state: "initial", captureHashes: [fileSha256(join(root, screenshot))], observed: "Scope remains legible", outcome: "satisfied" }], findings: [] } as unknown as QualityReview;
    assert.deepEqual(validateCompositionQualityObservations(root, review), []);
    story.pages[0]!.sections[0]!.renderObservations![0]!.viewportClass = "all";
    write(root, "onboarding/storyboard.json", story);
    write(root, "agent/reviews/representative-browser.json", { checks: [capture, { ...capture, width: 1080 }], compositionTargets: [target] });
    assert.ok(validateCompositionQualityObservations(root, review).some(item => /1080px/.test(item)));
    story.pages[0]!.sections[0]!.renderObservations![0]!.viewportClass = "narrow";
    write(root, "onboarding/storyboard.json", story);
    write(root, "agent/reviews/representative-browser.json", { checks: [capture], compositionTargets: [target] });
    writeFileSync(join(root, screenshot), solidPng(90, 80, 100));
    assert.ok(validateCompositionQualityObservations(root, review).some(item => /current captures/.test(item)));
    write(root, "agent/reviews/representative-browser.json", { checks: [capture], compositionTargets: [{ ...target, count: 0 }] });
    assert.ok(validateCompositionQualityObservations(root, review).some(item => /missing or duplicate/.test(item)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
