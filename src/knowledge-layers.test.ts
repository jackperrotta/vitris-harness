import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKnowledgeCatalog, readLessonBody, selectLessons } from "./agent/design-knowledge.ts";
import { signalsFromInventory } from "./agent/design-knowledge.ts";
import { REFRESH_PRESERVE_FILES } from "./agent/refine.ts";
import { applySemanticAdvice, assistanceSavedEffort, runSemanticTask, semanticCacheKey } from "./agent/jev/semantic-tasks.ts";
import { jevClientRequired, mergeJevConfig } from "./agent/jev/config.ts";
import { auditFragment, auditIndexing, auditLabPerformance, auditTransfer, gzipSize, widgetRequirements } from "./knowledge/checks.ts";
import { coverageReport, loadKnowledgeV2, migrateLessonId, sourceFreshness, verifyKnowledgeV2 } from "./knowledge/pack.ts";
import { evaluateLaunchDecision, workerProductionAllowed } from "./knowledge/launch-policy.ts";
import { invalidatedReceipts, screenshotCurrent, sealReceipt, verifyReceipt } from "./knowledge/evidence.ts";
import { creativeFinding, eligibleProof, publishableClaims } from "./knowledge/facts.ts";
import { selectStageKnowledge } from "./knowledge/selection.ts";
import { LAUNCH_POLICY_ID, type LaunchEvidence, type QualityFinding } from "./knowledge/contracts.ts";
import { explainStage } from "./knowledge/explain.ts";
import { buildDesignContextPacket } from "./agent/design-context-packet.ts";
import { artifactManifest } from "./knowledge/artifact.ts";

const kernel = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(kernel, path), "utf8");

function serious(findings: QualityFinding[]) {
  return findings.filter(item => item.status === "fail" && item.severity === "serious");
}

test("v2 pack classifies every requirement and delivers lesson fields", () => {
  assert.deepEqual(verifyKnowledgeV2(kernel), []);
  const pack = loadKnowledgeV2(kernel);
  assert.ok(pack);
  const coverage = coverageReport(pack!);
  assert.equal(coverage.missingClassification.length, 0);
  assert.ok(coverage.requirements.length >= 6);
  for (const source of pack!.sources) {
    if (source.reviewStatus === "live-checked") assert.ok(source.lastReviewed);
    assert.equal(source.summarySha256.length, 64);
  }
  const catalog = loadKnowledgeCatalog(kernel);
  const lesson = catalog!.lessons.find(item => item.id === "project-photography-transformations")!;
  const body = readLessonBody(kernel, lesson);
  for (const label of ["Composition:", "Typography:", "Media:", "Mobile:", "Required assets:", "References:", "Alternative successful interpretations:"]) {
    assert.match(body, new RegExp(label));
  }
  assert.match(body, /Authority: teaching guidance/);
  assert.doesNotMatch(body, /user preference evidence/i);
  assert.equal(pack!.assets[0]?.origin, "generated");
  assert.equal(pack!.assets[0]?.permittedUses.includes("production"), false);
  const inspected = catalog!.lessons.find(item => item.evidenceKind === "inspected-reference")!;
  assert.match(readLessonBody(kernel, inspected), /Not user preference evidence/);
  assert.equal(migrateLessonId(pack!, "sparse-imagery-process", 1).id, "sparse-imagery-process");
});

test("live context packet and explain select the same applicable requirements", () => {
  const packet = buildDesignContextPacket({ root: kernel, nodeId: "direction", optionalCharBudget: 0 });
  const explained = explainStage(kernel, "direction");
  assert.deepEqual(packet.manifest.selectedRequirements.map(item => item.id), explained.requirementIds);
  assert.ok(packet.manifest.selectedRequirements.length > 0);
  for (const item of packet.manifest.selectedRequirements) assert.match(packet.text, new RegExp(item.id));
});

test("live packet includes carousel guidance only when a site plans or uses one", () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-widget-"));
  mkdirSync(join(root, "pages"));
  writeFileSync(join(root, "pages/index.html"), "<h1>Home</h1>");
  const previous = process.env.VITRIS_KERNEL;
  process.env.VITRIS_KERNEL = kernel;
  try {
    const plain = buildDesignContextPacket({ root, nodeId: "pages" });
    assert.equal(plain.manifest.selectedRequirements.some(item => item.id === "widget-carousel-keyboard"), false);
    writeFileSync(join(root, "pages/index.html"), '<h1>Home</h1><section data-island="carousel"></section>');
    const carousel = buildDesignContextPacket({ root, nodeId: "pages" });
    assert.equal(carousel.manifest.selectedRequirements.some(item => item.id === "widget-carousel-keyboard"), true);
    assert.ok(explainStage(root, "pages").requirementIds.includes("widget-carousel-keyboard"));
    assert.notEqual(plain.manifest.sourceHashes["pages/index.html"], carousel.manifest.sourceHashes["pages/index.html"]);
    writeFileSync(join(root, "pages/index.html"), "<h1>Home</h1>");
    mkdirSync(join(root, "onboarding"));
    writeFileSync(join(root, "onboarding/storyboard.json"), JSON.stringify({ pages: [{ path: "/", sections: [{ id: "work", interaction: "carousel" }] }] }));
    const planned = buildDesignContextPacket({ root, nodeId: "pages" });
    assert.equal(planned.manifest.selectedRequirements.some(item => item.id === "widget-carousel-keyboard"), true);
  } finally {
    if (previous === undefined) delete process.env.VITRIS_KERNEL;
    else process.env.VITRIS_KERNEL = previous;
  }
});

test("parsed markup accepts common native label and alternative forms", () => {
  const html = `<img src='roof.jpg' alt='Slate roof'><label>Email <input name='email' required></label><label for='phone'>Phone</label><input id='phone' name='phone'><button style='position:fixed;bottom:0;right:0'>Help</button>`;
  const findings = auditFragment(html);
  assert.equal(serious(findings).length, 0);
  assert.equal(findings.some(item => item.id === "obscured-focus" && item.status === "fail"), false);
});

test("publishable byte changes alter artifact identity", () => {
  const dir = mkdtempSync(join(tmpdir(), "vitris-artifact-"));
  writeFileSync(join(dir, "index.html"), "<h1>One</h1>");
  writeFileSync(join(dir, "site.css"), "body{color:black}");
  const before = artifactManifest(dir).sha256;
  writeFileSync(join(dir, "site.css"), "body{color:blue}");
  assert.notEqual(artifactManifest(dir).sha256, before);
});

test("source freshness and widget exclusion", () => {
  const pack = loadKnowledgeV2(kernel)!;
  const live = pack.sources.find(item => item.id === "src-wcag22-quickref")!;
  const cited = pack.sources.find(item => item.id === "src-google-ai-features")!;
  assert.equal(sourceFreshness(live, new Date("2026-09-22T12:00:00Z"), 180), "current");
  assert.equal(sourceFreshness(live, new Date("2027-09-22T12:00:00Z"), 30), "due-for-maintenance");
  assert.equal(sourceFreshness(cited, new Date("2026-09-22T12:00:00Z"), 30), "not-reviewed");
  const widgets = widgetRequirements(pack.requirements, []);
  assert.equal(widgets.find(item => item.id === "widget-carousel-keyboard")?.included, false);
  assert.equal(widgetRequirements(pack.requirements, ["carousel"]).find(item => item.id === "widget-carousel-keyboard")?.included, true);
});

test("mandatory requirements survive an empty lesson budget", () => {
  const pack = loadKnowledgeV2(kernel)!;
  const selected = selectStageKnowledge({
    requirements: pack.requirements,
    lessons: [{ id: "contact-journey", version: 1, contentHash: "x", reason: "contact", contraindicationsConsidered: [], mandatory: false, expansionHandle: "lesson:contact-journey@1" }],
    signals: { ...signalsFromInventory({ visitorJobs: ["request an estimate"] }), contactPath: true, widgets: [] },
    stage: "representative",
    lessonLimit: 0,
  });
  assert.equal(selected.lessons.length, 0);
  assert.ok(selected.requirements.some(item => item.id === "wcag-3.3.2-labels"));
  assert.equal(selected.requirements.some(item => item.id === "widget-carousel-keyboard"), false);
});

test("contact journey blocks the broken form and accepts both accessible designs", () => {
  const broken = auditFragment(read("design-system/knowledge/v2/fixtures/contact-broken.html"));
  const valid = auditFragment(read("design-system/knowledge/v2/fixtures/contact-valid.html"));
  const alternate = auditFragment(read("design-system/knowledge/v2/fixtures/contact-alternate.html"));
  assert.ok(serious(broken).some(item => item.id.startsWith("unnamed-")));
  assert.ok(broken.some(item => item.id === "keyboard-trap" && item.status === "warning"));
  assert.ok(broken.some(item => item.id === "obscured-focus" && item.status === "warning"));
  assert.equal(serious(valid).length, 0);
  assert.equal(serious(alternate).length, 0);
  const style = creativeFinding({ kind: "restrained", usabilityDefect: false });
  assert.equal(style.status, "pass");
  const blocked = evaluateLaunchDecision({ environment: "production", findings: broken, buildHash: "b1", requiredVerifierStatus: "ok", evidenceTrusted: true });
  const repaired = evaluateLaunchDecision({ environment: "production", findings: valid, buildHash: "b2", requiredVerifierStatus: "ok", evidenceTrusted: true });
  const preview = evaluateLaunchDecision({ environment: "preview", findings: broken, buildHash: "b1" });
  assert.equal(blocked.launchAllowed, false);
  assert.equal(repaired.launchAllowed, true);
  assert.equal(repaired.conformanceClaim, "none");
  assert.equal(preview.previewAllowed, true);
  assert.equal(preview.launchAllowed, false);
  const waived = evaluateLaunchDecision({
    environment: "production",
    findings: broken.filter(item => item.id.startsWith("unnamed-")),
    buildHash: "b1",
    requiredVerifierStatus: "ok",
    evidenceTrusted: true,
    overrides: [{ findingId: "unnamed-email", buildHash: "b1", policyHash: LAUNCH_POLICY_ID, reason: "operator accepted for this build", scope: "homepage contact" }],
  });
  assert.equal(waived.waived.length, 1);
  assert.equal(waived.waived[0]?.status, "waived");
  assert.notEqual(waived.waived[0]?.status, "pass");
});

test("contrast exceptions and indexing rules", () => {
  const contrast = auditFragment(read("design-system/knowledge/v2/fixtures/contrast-cases.html"));
  assert.ok(contrast.some(item => item.id.startsWith("contrast-#8d8d8d") && item.status === "warning"));
  assert.equal(contrast.some(item => item.id.includes("595959") && item.status === "fail"), false);
  assert.equal(contrast.some(item => item.status === "not-applicable" && item.applicability?.includes("Incidental")), false);
  assert.ok(contrast.some(item => item.status === "not-applicable" && item.applicability?.includes("Disabled")));
  const preview = auditIndexing({
    environment: "preview",
    pages: [{ path: "/", html: `<meta name="robots" content="noindex">`, intendedIndex: true }],
  });
  assert.ok(preview.some(item => item.status === "pass"));
  const production = auditIndexing({
    environment: "production",
    publicOrigin: "https://example.com",
    pages: [{ path: "/", html: `<link rel="canonical" href="https://wrong.example/"><meta name="robots" content="noindex">`, intendedIndex: true }],
    sitemap: "<urlset><url><loc>https://example.com/old</loc></url></urlset>",
    redirects: [{ from: "/old", to: "/older", disposition: "redirect" }, { from: "/older", to: "/old", disposition: "redirect" }],
  });
  assert.ok(production.some(item => item.id === "production-noindex-/"));
  assert.ok(production.some(item => item.id.startsWith("canonical-origin")));
  assert.ok(production.some(item => item.id.startsWith("redirect-loop")));
  assert.ok(production.some(item => item.id === "sitemap-/old"));
  const mismatch = auditIndexing({
    environment: "production",
    publicOrigin: "https://example.com",
    pages: [{
      path: "/",
      intendedIndex: true,
      html: `<h1>Northline</h1><script type="application/ld+json">{"@type":"LocalBusiness","name":"Northline"}</script>`,
    }],
  });
  assert.ok(mismatch.some(item => item.id.startsWith("local-business")));
});

test("performance stays honest when measurement is missing", () => {
  const oversized = auditTransfer([{ path: "app.js", bytes: randomBytes(180 * 1024) }]);
  assert.ok(oversized.some(item => item.id === "budget-js" && item.status === "fail"));
  assert.ok(gzipSize(Buffer.from("a".repeat(5000))) < 5000);
  const empty = auditTransfer([{ path: "hero.png", bytes: Buffer.alloc(0) }]);
  assert.ok(empty.some(item => item.status === "fail"));
  const missingRunner = auditLabPerformance({ runnerAvailable: false, fieldP75: null });
  assert.ok(missingRunner.some(item => item.id === "lab-runner-unavailable" && item.status === "unknown"));
  assert.ok(missingRunner.some(item => item.id === "field-data-absent" && item.status === "unknown"));
  assert.equal(missingRunner.some(item => item.status === "pass"), false);
  const stable = auditLabPerformance({ runnerAvailable: true, samplesMs: [100, 110, 105], fieldP75: null });
  assert.ok(stable.some(item => item.id === "lab-samples" && item.status === "warning"));
});

test("facts, creative freedom, and publication paths share the launch rule", () => {
  assert.deepEqual(publishableClaims([{ id: "a", claim: "maybe", status: "unknown" }]).length, 0);
  assert.equal(eligibleProof([{ id: "g", disposition: "use", origin: "generated" }, { id: "d", disposition: "duplicate", origin: "photographed" }, { id: "p", disposition: "use", origin: "photographed" }]).map(item => item.id).join(), "p");
  assert.equal(creativeFinding({ kind: "purposeful-repetition", usabilityDefect: false }).status, "pass");
  assert.equal(creativeFinding({ kind: "novelty-unusable", usabilityDefect: true }).status, "fail");
  assert.equal(creativeFinding({ kind: "alternate-accessible", usabilityDefect: false }).status, "pass");
  const pkg = read("templates/site/package.json");
  const workflow = read("templates/site/deployment/github-actions.yml.example");
  const worker = read("src/worker/publish.ts");
  const cli = read("src/cli/deploy.ts");
  assert.match(pkg, /vitris-launch-preflight\.js --environment production/);
  assert.match(workflow, /vitris-launch-preflight\.js --environment production/);
  assert.match(workflow, /--environment preview/);
  assert.match(worker, /workerProductionAllowed/);
  assert.match(cli, /prepareVerifiedRelease\(root, environment\)/);
  assert.match(cli, /deployVerifiedArtifact\(root, artifact, adapter\)/);
  const evidence: LaunchEvidence = {
    trusted: false,
    buildHash: "abc",
    policyHash: LAUNCH_POLICY_ID,
    knowledgeRelease: "2026-09-22",
    browserVerifier: "ok",
    findings: [],
    manualCoverage: "pending",
  };
  assert.equal(workerProductionAllowed(evidence, [], "abc").launchAllowed, false);
  const trusted = workerProductionAllowed({ ...evidence, trusted: true, buildHash: "same" }, [], "same");
  assert.equal(trusted.launchAllowed, false);
});

test("evidence rejects tamper and invalidates the affected scope", () => {
  const finding: QualityFinding = {
    id: "keyboard-trap", requirementId: "wcag-2.1.1-keyboard", domain: "accessibility", severity: "serious",
    confidence: "confirmed", status: "fail", evidence: "trap", verifier: "keyboard-trap", verifierVersion: "2026-09-22",
    repairOwner: "pages", verifiedAt: "1970-01-01T00:00:00.000Z",
  };
  const receipt = sealReceipt({
    id: "launch-1", scope: "launch", buildHash: "b", policyHash: "p1", knowledgeHash: "k1", findings: [finding],
  });
  assert.equal(verifyReceipt(receipt).ok, true);
  assert.equal(verifyReceipt({ ...receipt, passed: true }).ok, false);
  assert.equal(verifyReceipt({ ...receipt, screenshotHash: "changed" }).ok, false);
  assert.equal(verifyReceipt({ ...receipt, findings: [{ ...finding, severity: "warning" }] }).ok, false);
  assert.equal(verifyReceipt({ ...receipt, digest: "deadbeef" }).ok, false);
  assert.equal(screenshotCurrent({ contentHash: "old" }, "new"), false);
  const other = sealReceipt({ id: "copy-1", scope: "unrelated-copy", buildHash: "b", policyHash: "p1", knowledgeHash: "k1", findings: [] });
  const launch = sealReceipt({ id: "launch-2", scope: "launch", buildHash: "b", policyHash: "old-policy", knowledgeHash: "k1", findings: [] });
  assert.deepEqual(invalidatedReceipts({ kind: "policy", hash: "new-policy" }, [launch, other]), ["launch-2"]);
});

test("Jev assist cannot waive a blocker and off mode does not call", async () => {
  const cache = new Map();
  const off = await runSemanticTask({
    task: "fact-copy-contradiction", mode: "off", model: "jev-1.13.0", content: { claim: "open Sundays" },
    knowledgeRelease: "2026-09-22", policyId: LAUNCH_POLICY_ID, evidenceIds: ["f1"], cache,
  });
  assert.equal(off.calls, 0);
  assert.equal(off.state, "off");
  const missing = await runSemanticTask({
    task: "cta-fit", mode: "assist", model: "jev-1.13.0", content: { cta: "Buy now" },
    knowledgeRelease: "2026-09-22", policyId: LAUNCH_POLICY_ID, evidenceIds: ["f1"], cache,
  });
  assert.equal(missing.state, "unavailable");
  const malformed = await runSemanticTask({
    task: "unanswered-questions", mode: "assist", model: "jev-1.13.0", content: { q: "hours" },
    knowledgeRelease: "2026-09-22", policyId: LAUNCH_POLICY_ID, evidenceIds: ["q1"], cache,
    invoke: async () => ({ text: "not-json", latencyMs: 5 }),
  });
  assert.equal(malformed.state, "malformed");
  assert.equal(malformed.calls, 1);
  const content = { page: "home" };
  const key = semanticCacheKey({ task: "rank-lessons", model: "jev-1.13.0", content, knowledgeRelease: "2026-09-22", policyId: LAUNCH_POLICY_ID });
  cache.set(key, { text: JSON.stringify({ answer: "prefer process", citedEvidence: ["lesson-1"] }), tokenUsage: { input: 10, output: 4 } });
  const hit = await runSemanticTask({
    task: "rank-lessons", mode: "shadow", model: "jev-1.13.0", content, knowledgeRelease: "2026-09-22",
    policyId: LAUNCH_POLICY_ID, evidenceIds: ["lesson-1"], cache,
    invoke: async () => { throw new Error("cache should win"); },
  });
  assert.equal(hit.cacheHits, 1);
  assert.equal(hit.calls, 0);
  const staleKey = semanticCacheKey({ task: "rank-lessons", model: "jev-1.13.0", content: { page: "changed" }, knowledgeRelease: "2026-09-22", policyId: LAUNCH_POLICY_ID });
  assert.notEqual(staleKey, key);
  const advice = applySemanticAdvice({ status: "fail", severity: "serious" }, { status: "pass" });
  assert.equal(advice.ignored, true);
  assert.equal(advice.status, "fail");
  assert.equal(assistanceSavedEffort({ calls: 1, cacheHits: 0, extraRepairs: null }), "unknown");
  assert.equal(assistanceSavedEffort({ calls: 1, cacheHits: 0, extraRepairs: 1 }), "extra-repair");
  const compositionOnly = mergeJevConfig({ mode: "assist", capabilities: { compositionCheck: "assist" } }, []);
  assert.equal(jevClientRequired(compositionOnly), true);
  const globalOff = mergeJevConfig({ mode: "off", capabilities: { lessonRanking: "assist" } }, []);
  assert.equal(jevClientRequired(globalOff), false);
});

test("knowledge explain does not call a model and refresh keeps site progress files", () => {
  const explained = explainStage(kernel, "direction");
  assert.match(explained.text, /Knowledge release 2026-09-22/);
  assert.equal(explained.text.includes("TYPESAFE_API_KEY"), false);
  assert.ok(REFRESH_PRESERVE_FILES.has("request.json"));
  const state = { nodes: { preview: { status: "done" } } };
  const before = JSON.stringify(state);
  coverageReport(loadKnowledgeV2(kernel)!);
  assert.equal(JSON.stringify(state), before);
  const pkg = JSON.parse(read("package.json")) as { bin: Record<string, string>; scripts: { "build:cli": string }; engines: { node: string } };
  for (const rel of Object.values(pkg.bin)) assert.match(rel, /^bin\/.+\.js$/);
  assert.equal(pkg.bin["vitris-launch-preflight"], "bin/vitris-launch-preflight.js");
  assert.equal(pkg.engines.node, ">=24");
  assert.match(read("templates/site/site.json"), /2026-09-22/);
});

test("lesson selection still separates project photos from sparse evidence", () => {
  const catalog = loadKnowledgeCatalog(kernel)!;
  const contact = selectLessons({
    catalog,
    stage: "representative",
    signals: signalsFromInventory({ mediaCount: 0, visitorJobs: ["request an estimate"], serviceCount: 1 }),
  });
  assert.ok(contact.some(item => item.id === "contact-journey"));
  assert.equal(createHash("sha256").update("sealed").digest("hex").length, 64);
  const root = mkdtempSync(join(tmpdir(), "vitris-layers-"));
  mkdirSync(join(root, "onboarding"), { recursive: true });
  mkdirSync(join(root, "agent"), { recursive: true });
  writeFileSync(join(root, "launch.json"), "{\"slug\":\"kept\"}\n");
  writeFileSync(join(root, "onboarding/direction.json"), "{\"centralIdea\":\"kept\"}\n");
  writeFileSync(join(root, "agent/STATE.json"), JSON.stringify({ version: 3, status: "in_progress", nodes: { harvest: { status: "done" } } }));
  const refreshed = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/refresh-agent.ts"), "--site", root], { encoding: "utf8" });
  assert.equal(refreshed.status, 0, `${refreshed.stdout}\n${refreshed.stderr}`);
  assert.match(readFileSync(join(root, "launch.json"), "utf8"), /kept/);
  assert.match(readFileSync(join(root, "onboarding/direction.json"), "utf8"), /kept/);
  const state = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8")) as { nodes?: { harvest?: { status?: string } } };
  assert.equal(state.nodes?.harvest?.status, "done");
});
