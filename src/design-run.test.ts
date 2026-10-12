import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseGraphYaml, type GraphNode } from "./agent/graph.ts";
import { begin, finish, inputHash, loadState } from "./agent/runner.ts";
import { freezeSharedEvidence, importSharedEvidence, importQualifiedRepresentative, kernelContractHash } from "./agent/design-copy.ts";
import { createDesignRun, currentRunId, ensureCandidateSite, freezeIfReady, loadManifest, promoteFinal, renderVariantStudies, restartDesignStage, runDesignCoordinator, runDir, sharedFreezeStatus, submitFeedback, validateVariantSet, type VariantBrief } from "./agent/design-run.ts";
import { directionRenderSubject, evaluateV2, REVIEW_CRITERIA, reviewSubject, parentDiversityIdentities, parentDiversityReviewSubject, parentDiversitySourceSubject, PARENT_DIVERSITY_AXES, validateParentDiversityReview } from "./agent/evaluate.ts";
import { STUDY_CAPTURE_VIEWPORTS, fingerprint, json, save, sourceHash, type Business, type MediaInventory, type Storyboard } from "./agent/artifacts.ts";
import { renderStudySources, studyScreenshotIds } from "./agent/study-render.ts";
import { parseDesignFeedback, validateDesignFeedback } from "./agent/design-feedback.ts";
import { snapshotCandidates } from "./agent/design-comparison.ts";
import { startDesignReview } from "./agent/design-review-server.ts";
import { handleMcpRequest } from "./agent/design-mcp.ts";
import { joinPreviewRoute } from "./agent/design-context.ts";
import { childWorkflowArgv, loadAdapter, runWorkflow } from "./agent/workflow.ts";
import { handleDesignRunCommand } from "./agent/design-cli.ts";
import { calibrationPackHash, PROBE_TOKEN, resolveKernelRoot, verifyCalibrationPack } from "./agent/design-calibration.ts";
import { fixtureNarrativeV2, fixtureReferenceAnalysisV2 } from "./agent/design-fixtures.ts";
import { buildPublicComparisonBundle } from "./agent/design-bundle.ts";
import { sketchesAreNotRepresentatives, validateQualityReview, qualitySubject, writePassingQualityArtifacts, archiveQualityInvocation, archiveQualityImageInvocation, probeColorMatches, recordActiveAgentQualityReceipt, QUALITY_PROBE_REL, QUALITY_RECEIPT_REL, QUALITY_LOG_ARCHIVE_REL, fileSha256, representativeCaptureHashes, imageReadLogLine } from "./agent/design-quality.ts";
import { type StagePreparation } from "./agent/preparation.ts";
import { synthesisAcceptanceFailures } from "./agent/design-synthesis.ts";
import { parseImageToolReads, parseStreamJsonUsage, usageFromLog } from "./agent/design-usage.ts";
import { createPairwiseSession, missingLabelState, recordSetLevelRejection, refuseManufacturedRanks, WEAK_FIXTURES } from "./agent/design-evals.ts";
import { flattenBody } from "./compile/flatten.ts";
import type { Catalog, SiteConfig } from "./types.ts";

const kernel = resolve(import.meta.dirname, "..");
process.env.VITRIS_KERNEL = kernel;
const temp = () => mkdtempSync(join(tmpdir(), "vitris-design-run-"));
const write = (root: string, path: string, content: string) => { const target = join(root, path); mkdirSync(join(target, ".."), { recursive: true }); writeFileSync(target, content); };
const business: Business = { version: 2, offer: "Roof repairs", audience: "Local homeowners", trigger: "A leak", outcome: "A repaired roof", includes: ["Inspection"], engagement: "Request an estimate", positioning: "Local repairs", facts: [{ id: "f1", claim: "Repairs roofs", evidence: ["e1"] }], evidence: [{ id: "e1", source: "onboarding/copy/home.md", excerpt: "We repair roofs" }], uncertainties: [] };

function passingReview(root: string, node: string) {
  return {
    version: 2, reviewer: "independent", subjectHash: reviewSubject(root, node), verdict: "pass",
    evidence: ["onboarding/business.json"],
    checks: (REVIEW_CRITERIA[node] || []).map(criterion => ({ criterion, verdict: "pass", evidence: "Supported" })),
    findings: [],
  };
}

function copyKernelAgent(root: string) {
  cpSync(join(kernel, "agent"), join(root, "agent"), { recursive: true });
  for (const name of ["STATE.json", "RUN.lock", "CURRENT.md", "PREPARED.json", "preview-server.json"]) {
    const path = join(root, "agent", name);
    if (existsSync(path)) unlinkSync(path);
  }
}

function seedSharedParent(root: string) {
  copyKernelAgent(root);
  write(root, "onboarding/copy/home.md", "We repair roofs");
  write(root, "media/harvest/roof.svg", "<svg/>");
  save(join(root, "onboarding/brief.json"), { sourceUrl: "https://example.test", pages: [{ url: "https://example.test/", title: "Home" }], images: [] });
  save(join(root, "onboarding/business.json"), business);
  const inventory: MediaInventory = {
    version: 2, harvestHash: fingerprint(root, ["onboarding/brief.json", "media/harvest"]),
    assets: [{ id: "roof", path: "/media/harvest/roof.svg", sources: [], description: "Roof", role: "project", disposition: "retain", reason: "Alternate view", inspected: true, placements: [] }],
  };
  save(join(root, "onboarding/media-inventory.json"), inventory);
  save(join(root, "agent/reviews/business-review.json"), passingReview(root, "business-review"));
  save(join(root, "onboarding/narrative-brief.json"), fixtureNarrativeV2(root, business, inventory));
  save(join(root, "agent/reviews/narrative-review.json"), {
    version: 2, reviewer: "independent", subjectHash: reviewSubject(root, "narrative-review"), verdict: "pass",
    evidence: ["onboarding/narrative-brief.json"],
    checks: (REVIEW_CRITERIA["narrative-review"] || []).map(criterion => ({ criterion, verdict: "pass", evidence: "Supported" })),
    findings: [],
  });
  save(join(root, "onboarding/reference-analysis.json"), fixtureReferenceAnalysisV2(root, kernel));
  save(join(root, "launch.json"), { slug: "acme", name: "Acme" });
  const graph = parseGraphYaml(readFileSync(join(root, "agent/graph.yaml"), "utf8"));
  const state = loadState(root, graph);
  for (const id of ["harvest", "business", "business-review", "media"]) {
    finish(root, graph, state, graph.nodes.find(n => n.id === id)!, []);
  }
}

const VISUAL: Record<string, Pick<VariantBrief, "visualSystem" | "typography" | "colorRoles" | "density" | "heroComposition" | "mediaTreatment" | "rhythm">> = {
  "dir-a": { visualSystem: "quiet-editorial", typography: "Oldstyle serif", colorRoles: "Ink on paper", density: "Open", heroComposition: "Split text column", mediaTreatment: "Contained plates", rhythm: "Editorial" },
  "dir-b": { visualSystem: "bold-product", typography: "Geometric sans", colorRoles: "High-contrast brand", density: "Punchy", heroComposition: "Full-bleed product", mediaTreatment: "Cropped artifacts", rhythm: "Staccato" },
  "dir-c": { visualSystem: "dense-index", typography: "Compact grotesque", colorRoles: "Utility ink", density: "Packed", heroComposition: "Catalog masthead", mediaTreatment: "Thumbnail grid", rhythm: "Tabular" },
  "dir-d": { visualSystem: "photographic", typography: "Neutral sans over image", colorRoles: "Photo-led dark", density: "Immersive", heroComposition: "Full-bleed photography", mediaTreatment: "Large photographs", rhythm: "Cinematic" },
  "dir-e": { visualSystem: "type-led", typography: "Display type first", colorRoles: "Limited two-ink", density: "Typographic", heroComposition: "Oversized headline stack", mediaTreatment: "Sparse supporting images", rhythm: "Poster" },
};

function brief(id: string, concept: string): VariantBrief {
  const visual = VISUAL[id] || VISUAL["dir-a"]!;
  return {
    id, concept, centralIdea: `${concept} for local roof repair`, visitorExperience: "Homeowner understands the offer on the first screen",
    hierarchy: "Proof then action", visualExpression: `${concept} visual hierarchy`, evidenceIds: ["f1", "e1"],
    rationale: "Fits this audience", audienceFit: "Homeowners",
    ...visual,
    navigation: "Simple", surfaces: "Paper", motifs: "Line", motionPolicy: "Whisper",
    interiors: "Quiet", proofStructure: "Projects", serviceWorkTreatment: "List",
    sharedConstraints: "Keep facts", differences: concept, sourceAssetIds: ["roof"], identityCautions: ["No fake staff"], omissions: ["Stock people"],
  };
}

function fiveBriefs(): VariantBrief[] {
  return [
    brief("dir-a", "Quiet editorial"),
    brief("dir-b", "Bold product"),
    brief("dir-c", "Dense index"),
    brief("dir-d", "Photographic"),
    brief("dir-e", "Type-led"),
  ];
}

function storyboard(): Storyboard {
  const section = (id: string, message: string, composition: string, emphasis: string) => ({
    id, role: id, purpose: message, question: id, message, facts: ["f1"], media: id === "about" ? [] as string[] : ["roof"],
    action: id === "hero" ? { label: "Call", destination: "/contact", behavior: "lead-form" as const } : null,
    composition, emphasis, transition: "none" as const, emphasisReason: `${id} supports the homepage job`,
    layoutFamily: composition, density: "medium", mediaProminence: id === "hero" ? "lead" : "thumb",
    mobileTransformation: "Stack heading, body, then action",
  });
  return {
    version: 2, designContractVersion: 1, businessHash: "x", directionHash: "y",
    routes: [{ source: "https://example.test/", disposition: "preserve", target: "/", reason: "Home" }],
    pages: [
      { path: "/", purpose: "Home", representative: true, role: "homepage", visitorOutcome: "Request an estimate", sections: [
        section("hero", "Roofs", "split", "high"),
        section("gallery", "Projects", "grid", "medium"),
      ] },
      { path: "/about", purpose: "About", representative: true, role: "interior", visitorOutcome: "Trust the crew", sections: [
        section("about", "Local", "stack", "medium"),
      ] },
    ],
  };
}

test("optional assigned-direction input is hashed only when present", () => {
  const root = temp(); copyKernelAgent(root);
  const graph = parseGraphYaml(readFileSync(join(root, "agent/graph.yaml"), "utf8"));
  const node = graph.nodes.find(n => n.id === "direction")!;
  const missing = inputHash(root, node);
  save(join(root, "agent/assigned-direction.json"), { version: 1, mode: "assigned", directionId: "dir-a" });
  const present = inputHash(root, node);
  assert.notEqual(present, missing);
  write(root, "unrelated.txt", "no");
  assert.equal(inputHash(root, node), present);
});

test("shared snapshot imports into five isolated candidate roots", () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  freezeIfReady(parent, loadManifest(parent, manifest.runId));
  const frozen = loadManifest(parent, manifest.runId);
  assert.ok(frozen.sharedInputHash);
  const set = fiveBriefs();
  const roots = frozen.candidates.map((candidate, i) => ensureCandidateSite(parent, kernel, frozen, candidate, set[i]!));
  assert.equal(evaluateV2(roots[0]!, "business").ok, true);
  assert.equal(evaluateV2(roots[1]!, "media").ok, true);
  write(roots[0]!, "pages/index.html", "<h1>A only</h1>");
  assert.equal(existsSync(join(parent, "pages/index.html")), false);
  assert.equal(existsSync(join(roots[1]!, "pages/index.html")), false);
  write(roots[1]!, "onboarding/business.json", JSON.stringify({ ...business, offer: "Invented" }));
  assert.equal(json<Business>(join(roots[0]!, "onboarding/business.json")).offer, "Roof repairs");
  assert.equal(json<Business>(join(parent, "onboarding/business.json")).offer, "Roof repairs");
  const graph = parseGraphYaml(readFileSync(join(roots[0]!, "agent/graph.yaml"), "utf8"));
  const state = loadState(roots[0]!, graph);
  assert.equal(state.nodes.harvest?.status, "done");
  assert.equal(state.nodes.narrative?.status, "done");
  assert.equal(state.nodes["reference-analysis"]?.status, "done");
  assert.equal(state.nodes.direction?.status, "pending");
  assert.equal(state.preview_ready, false);
});

test("candidate attempts survive coordinator-style resume and restart requires a reason", () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  freezeIfReady(parent, loadManifest(parent, manifest.runId));
  const live = loadManifest(parent, manifest.runId);
  const dest = ensureCandidateSite(parent, kernel, live, live.candidates[0]!, brief("dir-a", "Quiet proof"));
  const graph = parseGraphYaml(readFileSync(join(dest, "agent/graph.yaml"), "utf8"));
  const state = loadState(dest, graph);
  const direction = graph.nodes.find(n => n.id === "direction")!;
  begin(dest, graph, state, direction);
  finish(dest, graph, state, direction, ["incomplete"]);
  assert.equal(loadState(dest, graph).nodes.direction?.attempts, 1);
  restartDesignStage(parent, live.runId, "candidate-a", "repair assigned brief");
  assert.equal(loadState(dest, graph).nodes.direction?.attempts, 0);
  assert.throws(() => restartDesignStage(parent, live.runId, "unknown", "x"), /Unknown/);
});

test("bounded workflow stops after the shared trunk without marking later stages done", async () => {
  const root = temp(); copyKernelAgent(root);
  save(join(root, "agent/graph.yaml"), {
    version: 2, stop_at: "preview",
    nodes: [
      { id: "harvest", needs: [], refs: [], tools: [], writes: ["onboarding/brief.json"], inputs: [], eval: "harvest", maxAttempts: 4, kind: "tool", command: [process.execPath, join(root, "fake.mjs")] },
      { id: "business", needs: ["harvest"], refs: [], tools: [], writes: ["onboarding/business.json"], inputs: [], eval: "business", maxAttempts: 4, kind: "agent" },
      { id: "preview", needs: ["business"], refs: [], tools: [], writes: [], inputs: [], eval: "preview", maxAttempts: 4, kind: "agent" },
    ],
  });
  write(root, "fake.mjs", `import fs from "node:fs";
const node = process.env.VITRIS_WORKER_NODE;
fs.mkdirSync("onboarding/copy", { recursive: true });
if (node === "harvest") fs.writeFileSync("onboarding/brief.json", JSON.stringify({ sourceUrl: "https://example.test", pages: [{ url: "https://example.test/", title: "Home" }], warnings: [] }));
process.exit(0);`);
  save(join(root, "agent/adapter.json"), { command: process.execPath, args: [join(root, "fake.mjs")], prompt: "stdin" });
  const result = await runWorkflow({ root, kernel, argv: [process.execPath, "ralph.ts", "--once"], skipLock: false, stopWhen: state => state.nodes.harvest?.status === "done" });
  assert.equal(result.state.nodes.harvest?.status, "done");
  assert.equal(result.state.nodes.business?.status, "pending");
  assert.equal(result.state.preview_ready, false);
});

test("assigned direction eval requires this brief's studies rather than three open proposals", () => {
  const root = temp();
  save(join(root, "onboarding/business.json"), business);
  write(root, "onboarding/studies/assigned-home.html", "<h1>Home</h1>");
  write(root, "onboarding/studies/assigned-interior.html", "<h1>About</h1>");
  save(join(root, "agent/assigned-direction.json"), { version: 1, mode: "assigned", directionId: "quiet" });
  save(join(root, "onboarding/direction.json"), {
    version: 2, businessHash: fingerprint(root, ["onboarding/business.json"]), request: "", selected: "quiet", rationale: "Assigned",
    candidates: [{ id: "quiet", rationale: "Proof first", typography: "Serif", composition: "Split", mediaTreatment: "Contained" }],
    system: Object.fromEntries(["personality", "typography", "colorRoles", "density", "rhythm", "mediaTreatment", "surfaces", "navigation", "motifs", "interiors"].map(key => [key, "Defined"])),
    studies: [{ candidate: "quiet", path: "onboarding/studies/assigned-home.html" }, { candidate: "quiet", path: "onboarding/studies/assigned-interior.html" }],
    designContractVersion: 1, centralIdea: "Proof before decoration", opportunityIds: [],
    decisions: [{ id: "media", kind: "media", choice: "Contained project photos", rationale: "The assigned brief leads with proof", scope: "homepage", tradeoff: "Less atmosphere" }],
    rejectedAlternatives: [], identityInvariants: ["Proof stays first"], flexibleDecisions: ["Interior density"],
  });
  assert.equal(evaluateV2(root, "direction").ok, true);
});

test("shared-candidate homepage and interior studies keep distinct screenshots and fail independently", async () => {
  const root = temp();
  write(root, "onboarding/studies/assigned-home.html", "<!doctype html><meta charset=\"utf-8\"><h1>Assigned home</h1>");
  write(root, "onboarding/studies/assigned-interior.html", "<!doctype html><meta charset=\"utf-8\"><h1>Assigned interior</h1>");
  const studies = [
    { candidate: "quiet", path: "onboarding/studies/assigned-home.html" },
    { candidate: "quiet", path: "onboarding/studies/assigned-interior.html" },
  ];
  save(join(root, "onboarding/direction.json"), { version: 2, studies });
  const rendered = await renderStudySources({ root, studies, subjectHash: directionRenderSubject(root) });
  assert.equal(rendered.checks.length, 4);
  const screenshots = rendered.checks.map(c => c.screenshot);
  assert.deepEqual(new Set(screenshots).size, 4);
  for (const check of rendered.checks) {
    assert.equal(check.candidate, "quiet");
    assert.ok(check.path === studies[0]!.path || check.path === studies[1]!.path);
    assert.equal(existsSync(join(root, check.screenshot)), true);
    assert.equal(check.screenshotHash, fingerprint(root, [check.screenshot]));
  }
  assert.equal(evaluateV2(root, "direction-render").ok, true);

  const interiorDesktop = rendered.checks.find(c => c.path === studies[1]!.path && c.width === 1080)!;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");
  writeFileSync(join(root, interiorDesktop.screenshot), png);
  assert.match(evaluateV2(root, "direction-render").failures.join(), /assigned-interior/);

  save(join(root, "agent/reviews/direction-render.json"), {
    version: 2,
    subjectHash: directionRenderSubject(root),
    checks: [375, 1080].map(width => ({
      candidate: "quiet",
      width,
      screenshot: `onboarding/study-renders/quiet-${width}.png`,
      screenshotHash: "stale",
      failures: [],
    })),
  });
  assert.match(evaluateV2(root, "direction-render").failures.join(), /Missing study render/);
});

test("study screenshot ids keep unique readable stems and hash nested/flat collisions", () => {
  const ids = studyScreenshotIds([
    "onboarding/studies/dir-a-home.html",
    "onboarding/studies/a/b.html",
    "onboarding/studies/a-b.html",
  ]);
  assert.equal(ids.get("onboarding/studies/dir-a-home.html"), "dir-a-home");
  const nested = ids.get("onboarding/studies/a/b.html")!;
  const flat = ids.get("onboarding/studies/a-b.html")!;
  assert.match(nested, /^a-b-[0-9a-f]{8,}$/);
  assert.match(flat, /^a-b-[0-9a-f]{8,}$/);
  assert.notEqual(nested, flat);
  assert.notEqual(nested, "a-b");
  assert.notEqual(flat, "a-b");
});

test("nested and flat study sources that share a candidate keep distinct screenshots", async () => {
  const root = temp();
  write(root, "onboarding/studies/a/b.html", "<!doctype html><meta charset=\"utf-8\"><h1>Nested study</h1>");
  write(root, "onboarding/studies/a-b.html", "<!doctype html><meta charset=\"utf-8\"><h1>Flat study</h1>");
  const studies = [
    { candidate: "quiet", path: "onboarding/studies/a/b.html" },
    { candidate: "quiet", path: "onboarding/studies/a-b.html" },
  ];
  save(join(root, "onboarding/direction.json"), { version: 2, studies });
  const rendered = await renderStudySources({ root, studies, subjectHash: directionRenderSubject(root) });
  assert.equal(rendered.checks.length, 4);
  const screenshots = rendered.checks.map(c => c.screenshot);
  assert.equal(new Set(screenshots).size, 4);
  const nestedDesktop = rendered.checks.find(c => c.path === studies[0]!.path && c.width === 1080)!;
  const flatDesktop = rendered.checks.find(c => c.path === studies[1]!.path && c.width === 1080)!;
  assert.notEqual(nestedDesktop.screenshot, flatDesktop.screenshot);
  assert.notEqual(nestedDesktop.screenshotHash, flatDesktop.screenshotHash);
  for (const check of rendered.checks) {
    assert.equal(check.candidate, "quiet");
    assert.ok(check.path === studies[0]!.path || check.path === studies[1]!.path);
    assert.match(check.screenshot, /^onboarding\/study-renders\/a-b-[0-9a-f]+-(375|1080)\.png$/);
    assert.equal(existsSync(join(root, check.screenshot)), true);
    assert.equal(check.screenshotHash, fingerprint(root, [check.screenshot]));
  }
  assert.equal(evaluateV2(root, "direction-render").ok, true);
});

test("feedback resolves display labels, rejects stale hashes and illegal paths, and is idempotent", () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  freezeIfReady(parent, loadManifest(parent, manifest.runId));
  const live = loadManifest(parent, manifest.runId);
  const set = fiveBriefs();
  for (let i = 0; i < live.candidates.length; i++) {
    const dest = ensureCandidateSite(parent, kernel, live, live.candidates[i]!, set[i]!);
    save(join(dest, "onboarding/storyboard.json"), storyboard());
    write(dest, "dist/index.html", '<section id="hero" class="c-hero" data-section="hero" data-component="hero">H</section><section id="gallery">G</section>');
    write(dest, "dist/about/index.html", '<section id="about">A</section>');
  }
  const comparison = snapshotCandidates({
    runId: live.runId, revision: "review-001", dest: join(runDir(parent, live.runId), "comparison/review-001"),
    sites: live.candidates.map(c => ({ candidateId: c.id, label: c.label, root: resolve(parent, c.root), concept: set.find(b => b.id === c.directionId)?.concept || "", previewReady: true })),
  });
  live.activeComparisonRevision = "review-001";
  save(join(runDir(parent, live.runId), "manifest.json"), live);
  const base = {
    schemaVersion: 1 as const, feedbackId: "feedback-001", runId: live.runId, comparisonRevision: "review-001", comparisonHash: comparison.hash,
    actor: { type: "operator", id: "local-operator" }, baseCandidateId: "A", themeCandidateId: "A",
    choices: [{
      id: "choice-hero", operation: "replace" as const,
      source: { candidateId: "B", buildHash: comparison.candidates.find(c => c.label === "B")!.buildHash, route: "/", sectionId: "hero" },
      target: { route: "/", sectionId: "hero" }, facets: ["composition"] as ("composition")[], preserve: ["target-copy", "target-actions"],
      adaptation: "translate-to-base-theme", priority: "must" as const, note: "Use B's split hero, keep A's headline.",
    }, {
      id: "choice-gallery", operation: "replace" as const,
      source: { candidateId: "C", buildHash: comparison.candidates.find(c => c.label === "C")!.buildHash, route: "/", sectionId: "gallery" },
      target: { route: "/", sectionId: "gallery" }, facets: ["composition"] as ("composition")[], preserve: ["target-copy"],
      adaptation: "translate-to-base-theme", priority: "must" as const, note: "Use C's gallery.",
    }],
    submission: "synthesize" as const,
  };
  const first = submitFeedback(parent, live.runId, base);
  assert.match(first.summary, /Theme: candidate-a/);
  assert.match(first.summary, /candidate-b/);
  assert.match(first.summary, /candidate-c/);
  assert.equal(first.interpretation.choices[0]?.source?.candidateId, "candidate-b");
  const hero = json<{ routes: { sections: { sectionId: string; component?: string }[] }[] }>(join(runDir(parent, live.runId), "comparison/review-001/candidate-a/section-index.json"));
  assert.equal(hero.routes[0]?.sections.find(s => s.sectionId === "hero")?.component, "hero");
  const second = submitFeedback(parent, live.runId, { ...base, feedbackId: "feedback-002" });
  assert.equal(second.duplicate, true);
  const stale = validateDesignFeedback({
    feedback: parseDesignFeedback({ ...base, comparisonHash: "sha256:stale" }),
    runId: live.runId, comparison, indexes: Object.fromEntries(comparison.candidates.map(c => [c.candidateId, json(join(runDir(parent, live.runId), "comparison/review-001", c.candidateId, "section-index.json"))])),
  });
  assert.equal(stale.ok, false);
  assert.match(stale.errors.join(), /comparisonHash/);
  assert.throws(() => parseDesignFeedback({ ...base, choices: [{ ...base.choices[0], source: { ...base.choices[0]!.source, route: "../etc/passwd" } }] }));
});

test("fulfillment review fails an omitted must-have", () => {
  const root = temp();
  save(join(root, "agent/reviews/feedback-fulfillment.json"), {
    version: 2, verdict: "pass", reviewer: "independent", evidence: ["dist/index.html"],
    choices: [
      { id: "choice-hero", priority: "must", status: "fulfilled", evidence: "hero split", note: "ok" },
      { id: "choice-gallery", priority: "must", status: "unfulfilled", evidence: "absent", note: "missing" },
    ],
  });
  write(root, "dist/index.html", "<h1>Home</h1>");
  assert.match(evaluateV2(root, "feedback-fulfillment").failures.join(), /Unfulfilled must-have: choice-gallery/);
});

test("design review UI binds loopback, requires a session token, and persists feedback across reload", async () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  freezeIfReady(parent, loadManifest(parent, manifest.runId));
  const live = loadManifest(parent, manifest.runId);
  const set = fiveBriefs();
  for (let i = 0; i < live.candidates.length; i++) {
    const dest = ensureCandidateSite(parent, kernel, live, live.candidates[i]!, set[i]!);
    save(join(dest, "onboarding/storyboard.json"), storyboard());
    write(dest, "dist/index.html", '<section id="hero">H</section><section id="gallery">G</section>');
  }
  snapshotCandidates({
    runId: live.runId, revision: "review-001", dest: join(runDir(parent, live.runId), "comparison/review-001"),
    sites: live.candidates.map(c => ({ candidateId: c.id, label: c.label, root: resolve(parent, c.root), concept: "x", previewReady: true })),
  });
  live.activeComparisonRevision = "review-001";
  save(join(runDir(parent, live.runId), "manifest.json"), live);
  const review = await startDesignReview({ parent, kernel, runId: live.runId, resumeOnSubmit: false, refreshPreviews: false });
  try {
    const denied = await fetch(review.url.replace(/\?.*$/, ""));
    assert.equal(denied.status, 403);
    const page = await fetch(review.url);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Compare five local websites/);
    assert.match(html, /createElement\("iframe"\)/);
    assert.match(html, /Open preview/);
    assert.match(html, /Leave all feedback in Cursor/);
    assert.doesNotMatch(html, /Create final preview/);
    assert.doesNotMatch(html, /<textarea/);
    const context = await fetch(new URL("/api/context?token=" + review.token, review.url));
    assert.equal(context.status, 200);
    const packet = await context.json() as { candidates: { candidateId: string; routes: { path: string }[] }[]; instruction: string };
    assert.equal(packet.candidates.length, 5);
    assert.match(packet.instruction, /Cursor/);
    const pageCtx = await fetch(new URL("/api/page?token=" + review.token + "&candidate=A&route=/", review.url));
    assert.equal(pageCtx.status, 200);
    const hero = await pageCtx.json() as { candidateId: string; sections: { sectionId: string }[]; html?: string };
    assert.equal(hero.candidateId, "candidate-a");
    assert.equal(hero.sections.some(s => s.sectionId === "hero"), true);
    assert.match(hero.html || "", /id="hero"/);
    const comparison = json<{ hash: string; revision: string; runId: string; candidates: { candidateId: string; buildHash: string }[] }>(join(runDir(parent, live.runId), "comparison/review-001/comparison.json"));
    const payload = {
      schemaVersion: 1, token: review.token, feedbackId: "feedback-ui", runId: comparison.runId, comparisonRevision: comparison.revision, comparisonHash: comparison.hash,
      actor: { type: "operator", id: "local-operator" }, baseCandidateId: "candidate-a", themeCandidateId: "candidate-a",
      choices: [{
        id: "choice-hero", operation: "replace", source: { candidateId: "candidate-b", buildHash: comparison.candidates[1]!.buildHash, route: "/", sectionId: "hero" },
        target: { route: "/", sectionId: "hero" }, facets: ["composition"], preserve: ["target-copy"], adaptation: "translate-to-base-theme", priority: "must",
      }],
      submission: "synthesize", globalNotes: "touch /tmp/not-a-command",
    };
    const bad = await fetch(new URL("/api/feedback", review.url), { method: "POST", headers: { "content-type": "application/json", origin: "http://evil.example" }, body: JSON.stringify(payload) });
    assert.equal(bad.status, 403);
    const shell = await fetch(new URL("/api/feedback", review.url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, command: "rm -rf /" }) });
    assert.equal(shell.status, 400);
    const ok = await fetch(new URL("/api/feedback", review.url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(ok.status, 200, await ok.text());
    const again = await fetch(new URL("/api/state?token=" + review.token, review.url));
    const state = await again.json() as { status: { feedbackHead: string } };
    assert.equal(state.status.feedbackHead, "feedback-ui");
    assert.equal(existsSync(join(runDir(parent, live.runId), "feedback/feedback-ui.json")), true);
  } finally { review.server.close(); }
});

test("ordinary single-site go status still functions and compare-sites keeps A/B snapshots", () => {
  const root = temp(); copyKernelAgent(root);
  const env = { ...process.env };
  delete env.VITRIS_WORKER_NODE;
  delete env.VITRIS_RUNNER_PID;
  const run = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/ralph.ts"), "--site", root, "--status"], { encoding: "utf8", env });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /preview_ready/);
  const left = temp(), right = temp(), out = temp();
  write(left, "dist/index.html", "<h1>L</h1>"); write(right, "dist/index.html", "<h1>R</h1>");
  const compare = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/compare-sites.ts"), "--left", left, "--right", right, "--out", join(out, "ab")], { encoding: "utf8" });
  assert.equal(compare.status, 0, compare.stderr + compare.stdout);
  assert.equal(existsSync(join(out, "ab/A/dist/index.html")), true);
  assert.equal(existsSync(join(out, "ab/labels.json")), true);
});

test("kernel contract hash uses file contents, not a git commit", () => {
  assert.match(kernelContractHash(kernel), /^[a-f0-9]{64}$/);
});

test("promotion refuses mismatched synthesis hashes", () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  const live = loadManifest(parent, manifest.runId);
  live.status = "final_preview_ready";
  live.synthesisHead = "synth-001";
  save(join(runDir(parent, live.runId), "manifest.json"), live);
  mkdirSync(join(runDir(parent, live.runId), "synthesis/synth-001/site/onboarding"), { recursive: true });
  save(join(runDir(parent, live.runId), "synthesis/synth-001/synthesis-plan.json"), { comparisonHash: "a", feedbackHash: "b" });
  save(join(runDir(parent, live.runId), "synthesis/synth-001/site/onboarding/synthesis-plan.json"), { comparisonHash: "other", feedbackHash: "b" });
  assert.throws(() => promoteFinal(parent, live.runId), /hashes/);
});

test("instrumentation does not require a candidate id on ordinary sites", () => {
  const catalog: Catalog = { hero: { html: `<section class="c-hero"><slot></slot></section>`, css: "", island: null } };
  const site: SiteConfig = { name: "Demo", motion: { strength: "off" } };
  const result = flattenBody(`<hero id="opening"><h1>Title</h1></hero>`, catalog, site);
  assert.match(result.html, /data-section="opening"/);
  assert.match(result.html, /data-component="hero"/);
  assert.doesNotMatch(result.html, /data-candidate-id/);
});

test("design-run theme is stored on the run and does not clobber a finished parent site", () => {
  const parent = temp(); seedSharedParent(parent);
  write(parent, "pages/index.html", "<h1>Keep me</h1>");
  save(join(parent, "onboarding/direction.json"), { version: 2, selected: "keep" });
  save(join(parent, "agent/request.json"), { mode: "build", theme: "Original" });
  const before = fingerprint(parent, ["pages", "agent/STATE.json", "agent/request.json"]);
  const manifest = createDesignRun(parent, kernel, { theme: "New warm editorial" });
  freezeIfReady(parent, loadManifest(parent, manifest.runId));
  assert.equal(fingerprint(parent, ["pages", "agent/STATE.json", "agent/request.json"]), before);
  assert.equal(json<{ theme: string }>(join(parent, "agent/request.json")).theme, "Original");
  assert.equal(json<{ theme: string }>(join(runDir(parent, manifest.runId), "operator-request.json")).theme, "New warm editorial");
  assert.equal(currentRunId(parent), manifest.runId);
  const live = loadManifest(parent, manifest.runId);
  const dest = ensureCandidateSite(parent, kernel, live, live.candidates[0]!, brief("dir-a", "Quiet"));
  assert.equal(json<{ theme: string }>(join(dest, "agent/request.json")).theme, "New warm editorial");
});

test("child workflow argv cannot mint a theme or restart budget", () => {
  assert.deepEqual(
    childWorkflowArgv(["node", "ralph.ts", "--variants", "5", "--theme", "Warm", "--restart-from", "direction", "--reason", "nope", "--once"]),
    ["node", "ralph.ts", "--once"],
  );
});

test("coordinator renders homepage and interior studies for each brief", async () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  freezeIfReady(parent, loadManifest(parent, manifest.runId));
  const live = loadManifest(parent, manifest.runId);
  const set = { schemaVersion: 1 as const, runId: live.runId, directions: fiveBriefs() };
  save(join(runDir(parent, live.runId), "directions.json"), set);
  for (const item of set.directions) {
    write(parent, `agent/design-runs/${live.runId}/studies/${item.id}-home.html`, `<!doctype html><meta charset="utf-8"><h1>${item.concept} home</h1>`);
    write(parent, `agent/design-runs/${live.runId}/studies/${item.id}-interior.html`, `<!doctype html><meta charset="utf-8"><h1>${item.concept} interior</h1>`);
  }
  const rendered = await renderVariantStudies(parent, live, set);
  assert.equal(rendered.checks.length, 20);
  assert.equal(existsSync(join(runDir(parent, live.runId), "study-renders/dir-a-home-1080.png")), true);
  assert.equal(existsSync(join(runDir(parent, live.runId), "study-work")), false);
});

test("refresh-agent preserves design-run feedback", () => {
  const root = temp();
  save(join(root, "launch.json"), { slug: "client", ownerEmail: "owner@example.test" });
  write(root, "agent/design-runs/run-keep/feedback/feedback-001.json", "{\"keep\":true}");
  const run = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/refresh-agent.ts"), "--site", root], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(existsSync(join(root, "agent/design-runs/run-keep/feedback/feedback-001.json")), true);
});

test("preview route join stays on the preview origin", () => {
  assert.equal(joinPreviewRoute("http://127.0.0.1:53766", "/"), "http://127.0.0.1:53766/");
  assert.equal(joinPreviewRoute("http://127.0.0.1:53766/", "/about"), "http://127.0.0.1:53766/about");
});

test("variant set requires five evidenced business ideas rather than style buckets", () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  const cousins = {
    schemaVersion: 1 as const, runId: manifest.runId,
    directions: fiveBriefs().map((item, i) => i === 0 ? item : { ...item, centralIdea: fiveBriefs()[0]!.centralIdea }),
  };
  assert.match(validateVariantSet(cousins, manifest.runId).join(), /centralIdea|business idea/);
  const sharedType = fiveBriefs().map((item, i) => i === 0 ? item : { ...item, typography: "Shared sans" });
  assert.equal(validateVariantSet({ schemaVersion: 1, runId: manifest.runId, directions: sharedType }, manifest.runId).join(), "");
  assert.equal(validateVariantSet({ schemaVersion: 1, runId: manifest.runId, directions: fiveBriefs() }, manifest.runId).join(), "");
  assert.match(validateVariantSet({ schemaVersion: 1, runId: manifest.runId, directions: fiveBriefs().slice(0, 3) }, manifest.runId).join(), /Exactly 5/);
  const themed = { schemaVersion: 1 as const, runId: manifest.runId, theme: "Warm editorial", themeScope: "one" as const, directions: fiveBriefs() };
  assert.match(validateVariantSet(themed, manifest.runId, { theme: "Warm editorial", themeScope: "one" }).join(), /theme-centered/);
  themed.directions[0]!.themeCentered = true;
  assert.equal(validateVariantSet(themed, manifest.runId, { theme: "Warm editorial", themeScope: "one" }).join(), "");
  const allTheme = { schemaVersion: 1 as const, runId: manifest.runId, theme: "Warm editorial", themeScope: "all" as const, directions: fiveBriefs().map(d => ({ ...d, themeCentered: true })) };
  assert.equal(validateVariantSet(allTheme, manifest.runId, { theme: "Warm editorial", themeScope: "all" }).join(), "");
  allTheme.directions[1]!.themeCentered = false;
  assert.match(validateVariantSet(allTheme, manifest.runId, { theme: "Warm editorial", themeScope: "all" }).join(), /every brief/);
});

test("design MCP lists candidates and page context without starting synthesis", () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  freezeIfReady(parent, loadManifest(parent, manifest.runId));
  const live = loadManifest(parent, manifest.runId);
  const set = fiveBriefs();
  for (let i = 0; i < live.candidates.length; i++) {
    const dest = ensureCandidateSite(parent, kernel, live, live.candidates[i]!, set[i]!);
    save(join(dest, "onboarding/storyboard.json"), storyboard());
    write(dest, "dist/index.html", '<section id="hero">H</section>');
  }
  snapshotCandidates({
    runId: live.runId, revision: "review-001", dest: join(runDir(parent, live.runId), "comparison/review-001"),
    sites: live.candidates.map(c => ({ candidateId: c.id, label: c.label, root: resolve(parent, c.root), concept: "x", previewReady: true })),
  });
  live.activeComparisonRevision = "review-001";
  save(join(runDir(parent, live.runId), "manifest.json"), live);
  const listed = handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { parent, kernel });
  const tools = (listed.result as { tools: { name: string }[] }).tools.map(t => t.name);
  assert.equal(tools.includes("design_status"), true);
  assert.equal(tools.includes("get_page_context"), true);
  const call = handleMcpRequest({
    jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: "get_page_context", arguments: { site: parent, runId: live.runId, candidate: "B", route: "/" } },
  }, { parent, kernel, runId: live.runId });
  const body = JSON.parse((call.result as { content: { text: string }[] }).content[0]!.text) as { candidateId: string; sections: { sectionId: string }[] };
  assert.equal(body.candidateId, "candidate-b");
  assert.equal(body.sections[0]?.sectionId, "hero");
  const notes = handleMcpRequest({
    jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "save_notes", arguments: { site: parent, runId: live.runId, notes: "Keep A's type." } },
  }, { parent, kernel, runId: live.runId });
  const saved = JSON.parse((notes.result as { content: { text: string }[] }).content[0]!.text) as { startedSynthesis: boolean };
  assert.equal(saved.startedSynthesis, false);
  assert.equal(readFileSync(join(runDir(parent, live.runId), "feedback/operator-notes.md"), "utf8").includes("Keep A's type."), true);
});

const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");

function installParentAdapter(parent: string) {
  write(parent, "parent-adapter.mjs", `import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
const node = process.env.VITRIS_WORKER_NODE || "";
if (!existsSync("agent/design-runs/CURRENT.json")) process.exit(0);
const runId = JSON.parse(readFileSync("agent/design-runs/CURRENT.json", "utf8")).runId;
const dest = join("agent/design-runs", runId);
const mode = existsSync(join(dest, "adapter-mode.json")) ? JSON.parse(readFileSync(join(dest, "adapter-mode.json"), "utf8")).mode : "pass";
const axes = [
  { name: "typography", evidence: "dir-a oldstyle serif versus dir-b geometric sans in 1080 captures" },
  { name: "color", evidence: "Ink-on-paper versus high-contrast product color roles" },
  { name: "density", evidence: "Open editorial measure versus packed index density" },
  { name: "media-role", evidence: "Contained plates versus cropped artifacts versus large photographs" },
  { name: "composition", evidence: "Split text column versus full-bleed product versus catalog masthead" },
];
function identity() { return JSON.parse(readFileSync(join(dest, "direction-review.identity.json"), "utf8")); }
function evidence() { return ["agent/design-runs/" + runId + "/study-renders/dir-a-home-1080.png"]; }
function writeReview(verdict, extra = {}) {
  const idn = identity();
  const directions = JSON.parse(readFileSync(join(dest, "directions.json"), "utf8"));
  writeFileSync(join(dest, "direction-review.json"), JSON.stringify({
    schemaVersion: 1, kind: "direction-diversity", runId, verdict,
    subjectHash: idn.subjectHash, identities: idn.identities, reviewer: "stub-adapter",
    evidence: evidence(), axes,
    candidates: directions.directions.map(d => ({ id: d.id, observation: d.id + " uses a distinct " + d.visualSystem + " homepage composition", findings: [] })),
    findings: verdict === "fail" ? [{ id: "similar", page: "/", section: "hero", evidence: evidence()[0], severity: "major", problem: "Too similar", repair: "Rewrite dir-a", target: "variant-directions", verify: "Recapture" }] : [],
    ...extra,
  }, null, 2) + "\\n");
}
if (node === "direction-diversity-review") {
  if (mode === "mutate") {
    writeFileSync(join(dest, "studies", "dir-a-home.html"), "<!doctype html><h1>critic mutated source</h1>");
    writeReview("pass");
    process.exit(0);
  }
  if (mode === "mutate-launch") {
    writeFileSync("launch.json", JSON.stringify({ slug: "hijacked", name: "No" }));
    writeReview("pass");
    process.exit(0);
  }
  if (mode === "malformed") {
    writeFileSync(join(dest, "direction-review.json"), JSON.stringify({ schemaVersion: 1, kind: "direction-diversity", runId, verdict: "fail", reviewer: "stub", repair: { directionId: "dir-a", reason: "x", targets: ["studies/dir-a-home.html"] } }) + "\\n");
    process.exit(0);
  }
  if (mode === "pass-repair") {
    writeReview("pass", { repair: { directionId: "dir-a", reason: "Should not repair a pass", targets: ["studies/dir-a-home.html"] } });
    process.exit(0);
  }
  if (mode === "duplicate-candidates") {
    const idn = identity();
    const directions = JSON.parse(readFileSync(join(dest, "directions.json"), "utf8"));
    writeFileSync(join(dest, "direction-review.json"), JSON.stringify({
      schemaVersion: 1, kind: "direction-diversity", runId, verdict: "fail",
      subjectHash: idn.subjectHash, identities: idn.identities, reviewer: "stub-adapter",
      evidence: evidence(), axes,
      candidates: [
        { id: "dir-a", observation: "duplicate row one is not enough", findings: [] },
        { id: "dir-a", observation: "duplicate row two still misses others", findings: [] },
        { id: "dir-b", observation: "dir-b present", findings: [] },
        { id: "dir-c", observation: "dir-c present", findings: [] },
        { id: "dir-d", observation: "dir-d present", findings: [] },
      ],
      findings: [],
      repair: { directionId: "dir-a", reason: "duplicates", targets: ["studies/dir-a-home.html"] },
    }, null, 2) + "\\n");
    process.exit(0);
  }
  if (mode === "fail") { writeReview("fail"); process.exit(0); }
  if (mode === "fail-repair" || mode === "delete-nontarget") {
    writeReview("fail", { repair: { directionId: "dir-a", reason: "Too similar", targets: ["studies/dir-a-home.html", "studies/dir-a-interior.html"] } });
    process.exit(0);
  }
  const home = existsSync(join(dest, "studies", "dir-a-home.html")) ? readFileSync(join(dest, "studies", "dir-a-home.html"), "utf8") : "";
  if (mode === "repair-once" && !home.includes("REPAIRED")) {
    writeReview("fail", { repair: { directionId: "dir-a", reason: "Too similar", targets: ["studies/dir-a-home.html", "studies/dir-a-interior.html"] } });
    process.exit(0);
  }
  writeReview("pass");
  process.exit(0);
}
if (node === "variant-directions-repair") {
  const set = JSON.parse(readFileSync(join(dest, "directions.json"), "utf8"));
  set.directions = set.directions.map(d => d.id === "dir-a" ? { ...d, concept: "Quiet editorial repaired", centralIdea: "Quiet editorial repaired for local roof repair", rationale: "Revised after diversity fail", typography: "Oldstyle serif recut" } : d);
  writeFileSync(join(dest, "directions.json"), JSON.stringify(set, null, 2) + "\\n");
  mkdirSync(join(dest, "studies"), { recursive: true });
  writeFileSync(join(dest, "studies", "dir-a-home.html"), "<!doctype html><meta charset=\\"utf-8\\"><h1>REPAIRED quiet home</h1>");
  writeFileSync(join(dest, "studies", "dir-a-interior.html"), "<!doctype html><meta charset=\\"utf-8\\"><h1>REPAIRED quiet interior</h1>");
  if (mode === "delete-nontarget") unlinkSync(join(dest, "studies", "dir-b-home.html"));
  process.exit(0);
}
if (node === "narrative-review") {
  if (mode === "mutate-narrative-other") {
    mkdirSync("agent/reviews", { recursive: true });
    writeFileSync("agent/reviews/business-review.json", JSON.stringify({ version: 2, hijacked: true }));
    writeFileSync("agent/request.json", JSON.stringify({ mode: "hijack" }));
    writeFileSync("onboarding/narrative-brief.json", JSON.stringify({ schemaVersion: 1, customer: "mutated" }));
    writeFileSync("agent/reviews/narrative-review.json", JSON.stringify({
      version: 2, reviewer: "stub", subjectHash: "x", verdict: "pass", evidence: ["onboarding/narrative-brief.json"],
      checks: [], findings: [],
    }));
    process.exit(0);
  }
  process.exit(0);
}
if (node === "feedback-fulfillment") {
  if (mode === "mutate-fulfillment") {
    const synth = join(dest, "synthesis");
    const site = existsSync(synth) ? join(synth, readdirSync(synth).find(n => n.startsWith("synth-")) || "", "site") : "";
    if (site && existsSync(join(site, "pages/index.html"))) writeFileSync(join(site, "pages/index.html"), "<h1>critic mutated synthesis</h1>");
    mkdirSync(join(site, "agent/reviews"), { recursive: true });
    writeFileSync(join(site, "agent/reviews/feedback-fulfillment.json"), JSON.stringify({
      version: 2, verdict: "pass", reviewer: "stub", evidence: ["dist/index.html"],
      choices: [{ id: "choice-hero", priority: "must", status: "fulfilled", evidence: "ok", note: "ok" }],
    }));
  }
  process.exit(0);
}
process.exit(0);
`);
  save(join(parent, "agent/adapter.json"), { command: process.execPath, args: [join(parent, "parent-adapter.mjs")], prompt: "stdin" });
}

function seedPlanningArtifacts(parent: string, runId: string, opts?: { review?: "pass" | "stale" }) {
  const dest = runDir(parent, runId);
  const set = { schemaVersion: 1 as const, runId, directions: fiveBriefs() };
  save(join(dest, "directions.json"), set);
  mkdirSync(join(dest, "study-renders"), { recursive: true });
  const checks: { candidate: string; path: string; width: number; screenshot: string; screenshotHash: string; failures: string[] }[] = [];
  for (const item of set.directions) {
    write(parent, `agent/design-runs/${runId}/studies/${item.id}-home.html`, `<!doctype html><meta charset="utf-8"><h1>${item.concept} home</h1>`);
    write(parent, `agent/design-runs/${runId}/studies/${item.id}-interior.html`, `<!doctype html><meta charset="utf-8"><h1>${item.concept} interior</h1>`);
    for (const kind of ["home", "interior"] as const) {
      for (const width of STUDY_CAPTURE_VIEWPORTS) {
        const screenshot = `study-renders/${item.id}-${kind}-${width}.png`;
        writeFileSync(join(dest, screenshot), TINY_PNG);
        checks.push({
          candidate: `${item.id}-${kind}`, path: `onboarding/studies/${item.id}-${kind}.html`, width, screenshot,
          screenshotHash: fingerprint(dest, [screenshot]), failures: [],
        });
      }
    }
  }
  save(join(dest, "direction-render.json"), { version: 2, subjectHash: parentDiversitySourceSubject(parent, runId), checks });
  if (!opts?.review) return;
  const identities = parentDiversityIdentities(parent, runId);
  const evidence = [`agent/design-runs/${runId}/study-renders/dir-a-home-1080.png`];
  save(join(dest, "direction-review.json"), {
    schemaVersion: 1, kind: "direction-diversity", runId,
    verdict: "pass", reviewer: "seed",
    subjectHash: opts.review === "stale" ? "deadbeef" : parentDiversityReviewSubject(parent, runId),
    identities: opts.review === "stale" ? { ...identities, studies: "stale" } : identities,
    evidence, axes: PARENT_DIVERSITY_AXES.map((name, i) => ({ name, evidence: `Distinct ${name} in capture set item ${i + 1}` })),
    candidates: set.directions.map(d => ({ id: d.id, observation: `${d.id} ${d.visualSystem} is visibly distinct`, findings: [] })), findings: [],
  });
}

function prepareCoordinatorParent(opts?: { mode?: string; review?: "pass" | "stale"; planningRepairs?: number }) {
  const parent = temp();
  seedSharedParent(parent);
  installParentAdapter(parent);
  const created = createDesignRun(parent, kernel);
  freezeIfReady(parent, loadManifest(parent, created.runId));
  const live = loadManifest(parent, created.runId);
  live.budgets.max = 1;
  live.budgets.timeoutMs = 60_000;
  if (opts?.planningRepairs != null) live.budgets.planningRepairs = opts.planningRepairs;
  save(join(runDir(parent, live.runId), "manifest.json"), live);
  seedPlanningArtifacts(parent, live.runId, { review: opts?.review });
  save(join(runDir(parent, live.runId), "adapter-mode.json"), { mode: opts?.mode || "pass" });
  return { parent, live };
}

const coordinatorArgv = () => [process.execPath, "ralph.ts", "--max", "1", "--timeout-ms", "60000"];

test("active-agent parent review keeps its preparation across resume and rejects unrelated writes", { timeout: 60_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent();
  unlinkSync(join(parent, "agent/adapter.json"));
  const first = await runDesignCoordinator(parent, kernel, coordinatorArgv(), {runId: live.runId});
  assert.equal(first.paused, true);
  const path = join(parent, "agent/runs", `parent-stage-${live.runId}.json`);
  const record = json<{preparationId: string; node: GraphNode}>(path);
  assert.match(record.node.id, /direction-diversity-review$/);
  assert.ok(existsSync(join(parent, "agent/preparations", `${record.preparationId}.json`)));
  save(join(parent, "public/unrelated.json"), {unexpected: true});
  const resumed = await runDesignCoordinator(parent, kernel, coordinatorArgv(), {runId: live.runId});
  assert.equal(resumed.exitCode, 1);
  assert.match(resumed.summary || "", /immutable|subject|Unauthorized|protected/i);
});

function defaultCoordinatorExecutor(parent: string) {
  return async (call: { stage: GraphNode; prep: StagePreparation; prompt: string; root?: string; outputPath?: string }) => {
    const targetRoot = call.root || parent;
    const adapter = loadAdapter(targetRoot, /review|critic/i.test(call.stage.id) ? "reviewer" : "author");
    if (adapter.command === process.execPath && adapter.args.length > 0) {
      const outLog = call.outputPath || join(targetRoot, `agent/runs/${call.stage.id}.log`);
      mkdirSync(dirname(outLog), { recursive: true });
      const env = { ...process.env, VITRIS_WORKER_NODE: call.stage.id, VITRIS_RUNNER_PID: String(process.pid) };
      const res = spawnSync(adapter.command, adapter.args, {
        cwd: targetRoot,
        input: call.prompt,
        env,
        encoding: "utf8",
      });
      writeFileSync(outLog, (res.stdout || "") + (res.stderr || ""));
      if (call.stage.id === "representative-quality") {
        archiveQualityInvocation(targetRoot, outLog);
      }
      if (res.status !== 0) {
        throw new Error(res.stderr || `Test fake adapter failed with exit code ${res.status}`);
      }
    }
  };
}

function coordinatorOpts(parent: string, live: { runId: string }, extra?: Record<string, unknown>) {
  return { runId: live.runId, injectedStageExecutor: defaultCoordinatorExecutor(parent), ...extra };
}

test("failed diversity verdict blocks candidate generation", { timeout: 60_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "fail" });
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  const after = loadManifest(parent, live.runId);
  assert.equal(result.exitCode, 1);
  assert.equal(after.status, "blocked");
  assert.match((result.summary || after.errors.join("\n")), /design_failure|verdict is fail/);
  assert.equal(existsSync(join(runDir(parent, live.runId), "direction-diversity-review.log")), true);
  assert.equal(existsSync(join(parent, live.candidates[0]!.root, "package.json")), false);
  assert.equal(after.candidates.every(c => c.status === "pending"), true);
});

test("source edit at the same study filename invalidates a passing parent review", { timeout: 180_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "pass", review: "pass" });
  const beforeHash = parentDiversityReviewSubject(parent, live.runId);
  assert.equal(validateParentDiversityReview(parent, live.runId, { requirePass: true }).ok, true);
  write(parent, `agent/design-runs/${live.runId}/studies/dir-a-home.html`, "<!doctype html><meta charset=\"utf-8\"><h1>Edited home at same path</h1>");
  assert.notEqual(parentDiversityReviewSubject(parent, live.runId), beforeHash);
  assert.equal(validateParentDiversityReview(parent, live.runId, { requirePass: true }).ok, false);
  assert.match(validateParentDiversityReview(parent, live.runId, { requirePass: true }).failures.join(), /subjectHash/);
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(existsSync(join(runDir(parent, live.runId), "direction-diversity-review.log")), true);
  const receipt = json<{ reused?: boolean }>(join(runDir(parent, live.runId), "direction-review.receipt.json"));
  assert.equal(receipt.reused, false);
  assert.doesNotMatch(result.summary || "", /design_failure/);
});

test("screenshot edit at the same filename invalidates a passing parent review", { timeout: 180_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "pass", review: "pass" });
  const dest = runDir(parent, live.runId);
  const pngPath = join(dest, "study-renders/dir-a-home-1080.png");
  const tampered = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DAwMDAwMDAwMDAwMAAAPqnBfkY8R8AAAAASUVORK5CYII=", "base64");
  writeFileSync(pngPath, tampered);
  assert.equal(validateParentDiversityReview(parent, live.runId, { requirePass: true }).ok, false);
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(existsSync(join(runDir(parent, live.runId), "direction-diversity-review.log")), true);
  const receipt = json<{ reused?: boolean }>(join(runDir(parent, live.runId), "direction-review.receipt.json"));
  assert.equal(receipt.reused, false);
  assert.doesNotMatch(result.summary || "", /design_failure/);
});

test("diversity repair invokes the author and recaptures studies", { timeout: 180_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "repair-once" });
  const beforeHome = readFileSync(join(runDir(parent, live.runId), "studies/dir-a-home.html"), "utf8");
  const beforeShot = fingerprint(runDir(parent, live.runId), ["study-renders/dir-a-home-1080.png"]);
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  const after = loadManifest(parent, live.runId);
  assert.equal(existsSync(join(runDir(parent, live.runId), "variant-directions-repair.log")), true);
  assert.equal(existsSync(join(runDir(parent, live.runId), "direction-diversity-review.log")), true);
  const home = readFileSync(join(runDir(parent, live.runId), "studies/dir-a-home.html"), "utf8");
  assert.match(home, /REPAIRED/);
  assert.notEqual(home, beforeHome);
  const receipt = json<{ authorNode: string; changedFiles: string[]; directionId: string }>(join(runDir(parent, live.runId), "repairs/repair-001/receipt.json"));
  assert.equal(receipt.authorNode, "variant-directions-repair");
  assert.equal(receipt.directionId, "dir-a");
  assert.ok(receipt.changedFiles.some(path => path.includes("dir-a-home")));
  assert.notEqual(fingerprint(runDir(parent, live.runId), ["study-renders/dir-a-home-1080.png"]), beforeShot);
  assert.equal(after.budgets.planningRepairsUsed, 1);
  assert.equal(json<{ verdict: string }>(join(runDir(parent, live.runId), "direction-review.json")).verdict, "pass");
  assert.doesNotMatch(result.summary || after.errors.join("\n"), /design_failure|repair_budget_exhausted/);
});

test("stale parent diversity review is not reused", { timeout: 180_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "pass", review: "stale" });
  assert.equal(validateParentDiversityReview(parent, live.runId, { requirePass: true }).ok, false);
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(existsSync(join(runDir(parent, live.runId), "direction-diversity-review.log")), true);
  const receipt = json<{ reused?: boolean; subjectHash: string }>(join(runDir(parent, live.runId), "direction-review.receipt.json"));
  assert.equal(receipt.reused, false);
  assert.equal(receipt.subjectHash, parentDiversityReviewSubject(parent, live.runId));
  assert.doesNotMatch(result.summary || "", /design_failure/);
});

test("critic mutation of protected study sources is rejected", { timeout: 60_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "mutate" });
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  const after = loadManifest(parent, live.runId);
  assert.equal(result.exitCode, 1);
  assert.equal(after.status, "blocked");
  assert.match((result.summary || after.errors.join("\n")), /critic_write_violation/);
  assert.equal(existsSync(join(parent, live.candidates[0]!.root, "package.json")), false);
});

test("exhausted planning repairs fail explicitly without inventing acceptance", { timeout: 60_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "fail-repair", planningRepairs: 0 });
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  const after = loadManifest(parent, live.runId);
  assert.equal(result.exitCode, 1);
  assert.equal(after.status, "blocked");
  assert.match((result.summary || after.errors.join("\n")), /repair_budget_exhausted/);
  assert.doesNotMatch(result.summary || after.errors.join("\n"), /awaiting_design_feedback/);
  assert.equal(json<{ verdict: string }>(join(runDir(parent, live.runId), "direction-review.json")).verdict, "fail");
  assert.equal(after.candidates.every(c => c.status === "pending"), true);
  assert.equal(existsSync(join(runDir(parent, live.runId), "variant-directions-repair.log")), false);
});

function markNodesDone(root: string, ids: string[]) {
  const graph = parseGraphYaml(readFileSync(join(root, "agent/graph.yaml"), "utf8"));
  const state = loadState(root, graph);
  for (const id of ids) {
    const node = graph.nodes.find(n => n.id === id);
    if (node) finish(root, graph, state, node, []);
  }
}

function seedProductionRepresentative(root: string, token = PROBE_TOKEN) {
  // This fixture imports an already-qualified historical representative; new
  // scaffold coverage is tested separately and must not fabricate old evidence.
  if(existsSync(join(root,"site.json"))){
    const historicalConfig=json<Record<string,unknown>>(join(root,"site.json"));
    delete historicalConfig.motionComposition;save(join(root,"site.json"),historicalConfig);
  }

  save(join(root, "onboarding/storyboard.json"), storyboard());
  save(join(root, "onboarding/copy-plan.json"), { version: 2, storyboardHash: fingerprint(root, ["onboarding/storyboard.json"]), pages: [
    { path: "/", sections: [{ id: "hero", heading: "Roof repairs", body: "We repair roofs", factIds: ["f1"] }, { id: "gallery", heading: "Work", body: "Projects", factIds: ["f1"] }] },
    { path: "/about", sections: [{ id: "about", heading: "Local", body: "Local crew", factIds: ["f1"] }] },
  ] });
  write(root, "pages/index.html", "<h1>Home</h1>");
  write(root, "pages/about.html", "<h1>About</h1>");
  write(root, "dist/index.html", "<h1>Home</h1><a href=\"/about\">About</a>");
  write(root, "dist/about/index.html", "<h1>About</h1>");
  write(root, "onboarding/direction.json", JSON.stringify({
    version: 2, businessHash: fingerprint(root, ["onboarding/business.json"]), selected: "dir-a", request: "Quiet editorial",
    rationale: "Matches qualified representative", candidates: [{ id: "dir-a", rationale: "Quiet", typography: "Serif", composition: "Split", mediaTreatment: "Photo" }],
    system: { personality: "Quiet", typography: "Serif", colorRoles: "Ink", density: "Open", rhythm: "Slow", mediaTreatment: "Photo", surfaces: "Paper", navigation: "Simple", motifs: "Rule", interiors: "Column", avoid: [] },
    studies: [],
    designContractVersion: 1,
    centralIdea: "Qualified roof repair representative",
    opportunityIds: ["opp-roof"],
    decisions: [{ id: "rep-use", kind: "media", choice: "Reuse inspected roof photography", rationale: "Representative already encodes the asset", scope: "homepage", tradeoff: "Less re-exploration" }],
    rejectedAlternatives: [],
    identityInvariants: ["Do not rerun direction work when importing a qualified representative"],
    flexibleDecisions: ["Interior copy density"],
  }));
  mkdirSync(join(root, "agent/screenshots/representative-browser"), { recursive: true });
  for (const name of ["home-375.png", "home-1080.png", "about-375.png", "about-1080.png"]) {
    writeFileSync(join(root, "agent/screenshots/representative-browser", name), TINY_PNG);
  }
  const checks = ["/", "/about"].flatMap(path => [375, 1080].map(width => {
    const screenshot = `agent/screenshots/representative-browser/${path === "/" ? "home" : "about"}-${width}.png`;
    return { path, width, screenshot, screenshotHash: fingerprint(root, [screenshot]), failures: [] };
  }));
  save(join(root, "agent/reviews/representative-browser.json"), {
    sourceHash: sourceHash(root), distHash: fingerprint(root, ["dist"]), scope: "representative", checks,
  });
  save(join(root, "agent/reviews/representative-review.json"), passingReview(root, "representative-review"));
  writePassingQualityArtifacts(root, { observedToken: token });
}

test("duplicate candidate rows cannot substitute for a missing brief", { timeout: 60_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "duplicate-candidates" });
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(result.exitCode, 1);
  assert.match(result.summary || "", /duplicate|Missing candidate|unique candidate/i);
  assert.equal(existsSync(join(runDir(parent, live.runId), "variant-directions-repair.log")), false);
});

test("malformed diversity review cannot enter repair", { timeout: 60_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "malformed" });
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(result.exitCode, 1);
  assert.equal(existsSync(join(runDir(parent, live.runId), "variant-directions-repair.log")), false);
  assert.match(result.summary || "", /malformed|schema|evidence|axes|observation/i);
});

test("pass carrying a repair request is rejected", { timeout: 60_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "pass-repair" });
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(result.exitCode, 1);
  assert.match(result.summary || "", /Pass cannot carry a repair/);
  assert.equal(existsSync(join(runDir(parent, live.runId), "variant-directions-repair.log")), false);
});

test("critic mutation of launch.json is rejected", { timeout: 60_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "mutate-launch" });
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.match(result.summary || "", /critic_write_violation/);
  assert.equal(json<{ slug: string }>(join(parent, "launch.json")).slug, "acme");
});

test("repair cannot delete a non-target study", { timeout: 60_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "delete-nontarget" });
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(result.exitCode, 1);
  assert.match(result.summary || "", /non-target/);
  assert.equal(existsSync(join(runDir(parent, live.runId), "studies/dir-b-home.html")), true);
});

test("quality fails despite a passing diversity review of sketches", { timeout: 180_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "pass", review: "pass" });
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(result.exitCode, 1);
  assert.match(result.summary || "", /quality_failure/);
  assert.match(result.summary || "", /Diversity passed/);
  assert.equal(validateParentDiversityReview(parent, live.runId, { requirePass: true }).ok, true);
});

test("shared narrative and reference-analysis artifacts are required", { timeout: 60_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "pass", review: "pass" });
  const { rmSync } = await import("node:fs");
  rmSync(join(parent, "onboarding/narrative-brief.json"), { force: true });
  rmSync(join(runDir(parent, live.runId), "shared/onboarding/narrative-brief.json"), { force: true });
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(result.exitCode, 1);
  assert.match(result.summary || "", /narrative/i);
});

test("production representative is reused instead of repeating direction work", async () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  freezeIfReady(parent, loadManifest(parent, manifest.runId));
  const live = loadManifest(parent, manifest.runId);
  const dest = ensureCandidateSite(parent, kernel, live, live.candidates[0]!, brief("dir-a", "Quiet editorial"));
  seedProductionRepresentative(dest);
  const graph = parseGraphYaml(readFileSync(join(dest, "agent/graph.yaml"), "utf8"));
  const pNode = graph.nodes.find(n => n.id === "pages")!;
  pNode.kind = "tool";
  pNode.command = [process.execPath, join(dest, "child-adapter.mjs")];
  save(join(dest, "agent/graph.yaml"), graph);
  markNodesDone(dest, ["harvest", "business", "business-review", "media", "narrative", "narrative-review", "reference-analysis", "direction", "direction-render", "direction-review", "storyboard", "copy", "copy-review", "representative", "representative-browser", "representative-review", "representative-quality", "copy-expansion"]);
  const before = loadState(dest, graph).nodes.direction?.attempts;
  write(dest, "child-adapter.mjs", "process.exit(0);\n");
  save(join(dest, "agent/adapter.json"), { command: process.execPath, args: [join(dest, "child-adapter.mjs")], prompt: "stdin" });
  await runWorkflow({ root: dest, kernel, argv: [process.execPath, "ralph.ts", "--max", "1"], max: 1, skipLock: true, noPreviewServer: true });
  const after = loadState(dest, parseGraphYaml(readFileSync(join(dest, "agent/graph.yaml"), "utf8")));
  assert.equal(after.nodes.direction?.attempts, before);
  assert.equal(after.nodes.direction?.status, "done");
  assert.equal(existsSync(join(dest, "pages/index.html")), true);
  assert.notEqual(after.nodes.pages?.status, "pending");
});

test("requested five variants cannot silently succeed with a partial set", { timeout: 180_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "pass", review: "pass" });
  live.status = "generating";
  live.candidates[0]!.previewReady = true;
  live.candidates[0]!.status = "complete";
  save(join(runDir(parent, live.runId), "manifest.json"), live);
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(result.exitCode, 1);
  assert.match(result.summary || "", /partial set|finished variants/i);
  assert.notEqual(loadManifest(parent, live.runId).status, "awaiting_design_feedback");
});

test("concept-preview mode stops after qualified representatives", { timeout: 180_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "pass", review: "pass" });
  live.mode = { conceptPreview: true, requestedVariants: 5 };
  live.status = "qualifying";
  save(join(runDir(parent, live.runId), "manifest.json"), live);
  const briefs = fiveBriefs();
  for (let i = 0; i < live.candidates.length; i++) {
    const dest = ensureCandidateSite(parent, kernel, live, live.candidates[i]!, briefs[i]!);
    seedProductionRepresentative(dest);
    markNodesDone(dest, ["narrative", "narrative-review", "reference-analysis", "direction", "direction-render", "direction-review", "storyboard", "copy", "copy-review", "representative", "representative-browser", "representative-review", "representative-quality"]);
  }
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(loadManifest(parent, live.runId).status, "concept_preview_ready");
  assert.match(result.summary || "", /incomplete/i);
  assert.equal(result.exitCode, 0);
});

test("synthesis plan rejects wholesale CSS paste", async () => {
  const { validateSynthesisPlan } = await import("./agent/design-synthesis.ts");
  const errors = validateSynthesisPlan({
    schemaVersion: 1, revision: "synth-001", runId: "run-1", feedbackId: "f", feedbackHash: "a", comparisonHash: "b",
    baseCandidateId: "candidate-a", themeCandidateId: "candidate-a",
    tokens: { source: "candidate-a", exceptions: [] },
    routes: [{ path: "/", sections: [{ id: "hero", facets: [], preserve: [], adaptation: "copy-stylesheet", facts: [], media: [], acceptance: "x" }] }],
    conflicts: [], assumptions: [], dependencies: [], verification: [],
  });
  assert.match(errors.join(), /wholesale|stylesheet|CSS/i);
});

test("visual capability probe failure cannot pass quality", () => {
  const root = temp();
  seedProductionRepresentative(root, "000000");
  const grade = validateQualityReview(root, { requirePass: true });
  assert.equal(grade.ok, false);
  assert.match(grade.failures.join(), /probe/i);
});

test("interrupted adapter usage is unknown", () => {
  const receipt = usageFromLog({
    adapter: { command: "cursor", args: ["agent"] },
    nodeId: "direction", role: "author", outputPath: join(temp(), "missing.log"),
    durationMs: 10, startedAt: new Date().toISOString(), status: null, signal: "SIGTERM", timedOut: true,
  });
  assert.equal(receipt.usage.unknown, true);
  assert.equal(receipt.status, "interrupted");
  const parsed = parseStreamJsonUsage('{"type":"result","usage":{"input_tokens":11,"output_tokens":7,"cache_read_input_tokens":3}}\n');
  assert.equal(parsed.found, true);
  assert.equal(parsed.inputTokens, 11);
  assert.equal(parsed.cache?.cache_read_input_tokens, 3);
});

test("public comparison bundle verifies assets and rejects localhost navigation", () => {
  const site = temp();
  write(site, "dist/index.html", "<h1>Home</h1><a href=\"http://127.0.0.1:3/secret\">x</a>");
  const dest = temp();
  const leaked = buildPublicComparisonBundle({ dest, runId: "run-1", sites: [{ id: "candidate-a", label: "A", root: site, status: "complete" }] });
  assert.ok(leaked.failures.some(f => /Localhost|Local navigation|Unsafe localhost/i.test(f)));
  const clean = temp();
  write(clean, "dist/index.html", "<h1>Home</h1><a href=\"about/index.html\">About</a>");
  write(clean, "dist/about/index.html", "<h1>About</h1>");
  const bundle = temp();
  const ok = buildPublicComparisonBundle({ dest: bundle, runId: "run-1", sites: [{ id: "candidate-a", label: "A", root: clean, status: "complete" }] });
  assert.equal(ok.failures.join(), "");
  assert.doesNotMatch(readFileSync(join(bundle, "index.html"), "utf8"), /127\.0\.0\.1/);
  assert.equal(existsSync(join(bundle, "candidate-a/dist/index.html")), true);
});

test("evaluation harness records set-level rejection without manufacturing A-E ranks", () => {
  const recorded = recordSetLevelRejection({
    kernel, caseId: "tryvitris-studies-2026-09-15",
    dest: join(temp(), "tryvitris-studies-2026-09-15"),
    note: "The entire new study set looks worse than older versions. This is a set-level rejection only.",
  });
  assert.equal(recorded.operatorLabels.overallSet, "rejected");
  assert.equal(recorded.operatorLabels.pairs.length, 0);
  const inferred = { ...recorded, operatorLabels: { ...recorded.operatorLabels, pairs: [{ pairId: "pair-1", left: "A", right: "B", overall: "A" as const, elements: {}, labeledBy: "inferred-from-set-rejection" }] } };
  assert.match(refuseManufacturedRanks(inferred).join(), /manufactured/);
  const sessionDest = temp();
  const session = createPairwiseSession({ dest: sessionDest, caseId: "tryvitris-studies-2026-09-15", versions: [{ id: "old", label: "old" }, { id: "new", label: "new" }] });
  assert.equal(session.pairs.length, 1);
  assert.equal(missingLabelState(json<{ pairs: { pairId: string; left: string; right: string; overall: ""; elements: Record<string, ""> }[] }>(session.labelsPath).pairs[0]!), "missing-overall");
  assert.equal(WEAK_FIXTURES.some(f => f.kind === "diverse-poor" && f.diversityMayPass && f.expectedQuality === "fail"), true);
});

test("copied kits discover the kernel calibration pack without bundling full-page captures", () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  freezeIfReady(parent, loadManifest(parent, manifest.runId));
  const dest = ensureCandidateSite(parent, kernel, loadManifest(parent, manifest.runId), loadManifest(parent, manifest.runId).candidates[0]!, brief("dir-a", "Quiet editorial"));
  assert.equal(resolveKernelRoot(dest), kernel);
  assert.deepEqual(verifyCalibrationPack(kernel), []);
  assert.equal(existsSync(join(dest, "design-system/calibration")), false);
  assert.equal(existsSync(join(kernel, "design-system/calibration/v2/accuracy.png")), true);
  assert.equal(existsSync(join(kernel, "design-system/calibration/v1")), false);
});

test("quality review fails closed when the subject is stale", () => {
  const root = temp();
  seedSharedParent(root);
  seedProductionRepresentative(root);
  assert.equal(validateQualityReview(root, { requirePass: true }).ok, true);
  write(root, "pages/index.html", "<h1>Changed after review</h1>");
  const grade = validateQualityReview(root, { requirePass: true });
  assert.equal(grade.ok, false);
  assert.match(grade.failures.join(), /subjectHash/);
});

test("synthesis acceptance fails closed without quality, browser, content, and fulfillment", () => {
  const root = temp();
  write(root, "pages/index.html", "<h1>Sketch</h1>");
  save(join(root, "onboarding/synthesis-plan.json"), {
    schemaVersion: 1, revision: "synth-001", runId: "run-1", feedbackId: "f", feedbackHash: "a", comparisonHash: "b",
    baseCandidateId: "candidate-a", themeCandidateId: "candidate-a",
    tokens: { source: "candidate-a", exceptions: [] },
    routes: [{ path: "/", sections: [{ id: "hero", facets: [], preserve: [], adaptation: "translate-to-base-theme", facts: [], media: [], acceptance: "keep" }] }],
    conflicts: [], assumptions: [], dependencies: [], verification: [],
  });
  const failures = synthesisAcceptanceFailures(root);
  assert.match(failures.join(), /representative-quality/);
  assert.match(failures.join(), /visual-review/);
  assert.match(failures.join(), /browser|content-review|feedback-fulfillment/);
});

test("private sketches cannot be imported as a finished representative", () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  freezeIfReady(parent, loadManifest(parent, manifest.runId));
  const dest = ensureCandidateSite(parent, kernel, loadManifest(parent, manifest.runId), loadManifest(parent, manifest.runId).candidates[0]!, brief("dir-a", "Quiet editorial"));
  write(dest, "onboarding/studies/dir-a-home.html", "<h1>sketch</h1>");
  assert.match(sketchesAreNotRepresentatives(dest).join(), /sketches are not finished/);
  const from = temp();
  write(from, "onboarding/studies/dir-a-home.html", "<h1>sketch</h1>");
  write(from, "pages/index.html", "<h1>sketch</h1>");
  assert.throws(() => importQualifiedRepresentative(dest, from), /Imported|quality|representative|sketches/i);
});

test("shared freeze receipt matches final shared content and changes invalidate it", () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  freezeIfReady(parent, loadManifest(parent, manifest.runId));
  const fresh = sharedFreezeStatus(parent, manifest.runId);
  assert.equal(fresh.ok, true);
  assert.equal(fresh.hash, fresh.currentHash);
  assert.ok(fresh.copied.includes("onboarding/narrative-brief.json"));
  write(parent, `agent/design-runs/${manifest.runId}/shared/onboarding/narrative-brief.json`, JSON.stringify({ schemaVersion: 1, customer: "tampered" }));
  const stale = sharedFreezeStatus(parent, manifest.runId);
  assert.equal(stale.ok, false);
  assert.match(stale.failures.join(), /does not match current shared content/);
});

test("quality review JSON cannot manufacture tool provenance", () => {
  const root = temp();
  seedSharedParent(root);
  seedProductionRepresentative(root);
  const reviewPath = join(root, "agent/reviews/representative-quality.json");
  const review = json<Record<string, unknown>>(reviewPath);
  (review.visualInspection as { toolReads: unknown }).toolReads = [
    { path: QUALITY_PROBE_REL, hash: "invented", dataBlobId: "fake-blob" },
  ];
  save(reviewPath, review);
  unlinkSync(join(root, QUALITY_RECEIPT_REL));
  unlinkSync(join(root, QUALITY_LOG_ARCHIVE_REL));
  const grade = validateQualityReview(root, { requirePass: true });
  assert.equal(grade.ok, false);
  assert.match(grade.failures.join(), /receipt|provenance|image-read/i);
});

test("tampered screenshot or substituted quality log fails closed", () => {
  const root = temp();
  seedSharedParent(root);
  seedProductionRepresentative(root);
  assert.equal(validateQualityReview(root, { requirePass: true }).ok, true);
  writeFileSync(join(root, "agent/screenshots/representative-browser/home-1080.png"), Buffer.from("not-a-png-anymore"));
  const tampered = validateQualityReview(root, { requirePass: true });
  assert.equal(tampered.ok, false);
  assert.match(tampered.failures.join(), /capture|screenshot|probe/i);
  seedProductionRepresentative(root);
  writeFileSync(join(root, QUALITY_LOG_ARCHIVE_REL), "{}\n");
  const swapped = validateQualityReview(root, { requirePass: true });
  assert.equal(swapped.ok, false);
  assert.match(swapped.failures.join(), /receipt hash|image-read|log/i);
});

test("generic adapter without image payload cannot pass quality", () => {
  const root = temp();
  seedSharedParent(root);
  seedProductionRepresentative(root);
  const captures = representativeCaptureHashes(root);
  const probeHash = fileSha256(join(root, QUALITY_PROBE_REL));
  writeFileSync(join(root, "agent/runs/generic.log"), [
    JSON.stringify({ type: "tool_result", name: "read", arguments: { path: QUALITY_PROBE_REL }, result: { path: QUALITY_PROBE_REL, hash: probeHash } }),
    ...captures.map(c => JSON.stringify({ type: "tool_result", name: "read", arguments: { path: c.path }, result: { path: c.path, hash: c.hash } })),
  ].join("\n") + "\n");
  archiveQualityInvocation(root, join(root, "agent/runs/generic.log"));
  const grade = validateQualityReview(root, { requirePass: true });
  assert.equal(grade.ok, false);
  assert.match(grade.failures.join(), /image payload|image-read|dataBlobId/i);
});

test("CLI attachment receipt binds actual image arguments and tolerates close swatch naming", () => {
  const root = temp();
  seedSharedParent(root);
  seedProductionRepresentative(root);
  assert.equal(probeColorMatches("#2563EB"), true);
  assert.equal(probeColorMatches("#FF0000"), false);
  const reviewPath = join(root, "agent/reviews/representative-quality.json");
  const review = json<Record<string, any>>(reviewPath);
  review.visualInspection.observedToken = "#2563EB";
  save(reviewPath, review);
  const inputs = [{ path: QUALITY_PROBE_REL, hash: fileSha256(join(root, QUALITY_PROBE_REL)) }, ...representativeCaptureHashes(root)];
  const log = join(root, "agent/runs/codex-images.log");
  writeFileSync(log, '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}\n');
  const args = ["exec", "--json", "-i", ...inputs.map(i => i.path), "-"];
  archiveQualityImageInvocation(root, log, {
    command: "codex.exe", args, status: 0, promptHash: "prompt-hash", subjectHash: qualitySubject(root), imageInputs: inputs,
  });
  assert.equal(validateQualityReview(root, { requirePass: true }).ok, true);
  writeFileSync(join(root, inputs[1]!.path), Buffer.from("changed screenshot"));
  assert.match(validateQualityReview(root, { requirePass: true }).failures.join(), /capture|screenshot|stale/i);
  assert.throws(() => archiveQualityImageInvocation(root, log, {
    command: "codex.exe", args: args.filter(arg => arg !== inputs[1]!.path), status: 0,
    promptHash: "prompt-hash", subjectHash: qualitySubject(root), imageInputs: inputs,
  }), /changed|omitted/);
});

test("parseImageToolReads extracts Cursor readToolCall completed success and ignores started", () => {
  const probePath = "agent/reviews/visual-probe.png";
  const nestedCompleted = '{"type":"tool_call","subtype":"completed","tool_call":{"readToolCall":{"args":{"path":"' + probePath + '"},"result":{"success":{"path":"' + probePath + '","dataBlobId":"blob-nested","fileSize":123}}}}}';
  const nestedStarted = '{"type":"tool_call","subtype":"started","tool_call":{"readToolCall":{"args":{"path":"' + probePath + '"}}}}';
  const completed = parseImageToolReads(nestedCompleted + "\n");
  assert.equal(completed.length, 1);
  assert.equal(completed[0]!.path, probePath);
  assert.equal(completed[0]!.dataBlobId, "blob-nested");
  assert.equal(completed[0]!.success, true);
  assert.equal(completed[0]!.imagePayload, true);
  assert.deepEqual(parseImageToolReads(nestedStarted + "\n"), []);
  assert.deepEqual(parseImageToolReads(nestedStarted + "\n" + nestedStarted + "\n"), []);
});

test("Cursor nested completed reads of the exact probe path bind quality evidence", () => {
  const root = temp();
  seedSharedParent(root);
  seedProductionRepresentative(root);
  const captures = representativeCaptureHashes(root);
  const absProbe = join(root, QUALITY_PROBE_REL);
  const cursorCompleted = (path: string, blob: string) => JSON.stringify({
    type: "tool_call",
    subtype: "completed",
    tool_call: {
      readToolCall: {
        args: { path },
        result: { success: { path, dataBlobId: blob, fileSize: 123 } },
      },
    },
  });
  writeFileSync(join(root, "agent/runs/cursor-nested.log"), [
    cursorCompleted(absProbe, "blob-probe"),
    ...captures.map((capture, i) => cursorCompleted(join(root, capture.path), `blob-shot-${i}`)),
  ].join("\n") + "\n");
  archiveQualityInvocation(root, join(root, "agent/runs/cursor-nested.log"));
  const grade = validateQualityReview(root, { requirePass: true });
  assert.equal(grade.ok, true, grade.failures.join("\n"));
});

test("started Cursor readToolCall events cannot satisfy quality probe provenance", () => {
  const root = temp();
  seedSharedParent(root);
  seedProductionRepresentative(root);
  const captures = representativeCaptureHashes(root);
  const started = (path: string) => JSON.stringify({
    type: "tool_call",
    subtype: "started",
    tool_call: { readToolCall: { args: { path } } },
  });
  writeFileSync(join(root, "agent/runs/cursor-started.log"), [
    started(QUALITY_PROBE_REL),
    started(join(root, QUALITY_PROBE_REL)),
    ...captures.map(capture => started(capture.path)),
  ].join("\n") + "\n");
  archiveQualityInvocation(root, join(root, "agent/runs/cursor-started.log"));
  const grade = validateQualityReview(root, { requirePass: true });
  assert.equal(grade.ok, false);
  assert.match(grade.failures.join(), /image-read|visual probe/i);
});

test("quality evidence requires the exact visual-probe path, not basename spoofs", () => {
  const root = temp();
  seedSharedParent(root);
  seedProductionRepresentative(root);
  const captures = representativeCaptureHashes(root);
  const probeHash = fileSha256(join(root, QUALITY_PROBE_REL));
  const withReads = (probePath: string) => [
    imageReadLogLine({ path: probePath, dataBlobId: "blob-probe", hash: probeHash }),
    ...captures.map((capture, i) => imageReadLogLine({ path: capture.path, dataBlobId: `blob-shot-${i}`, hash: capture.hash })),
  ].join("\n") + "\n";

  writeFileSync(join(root, "agent/runs/spoof-probe.png.log"), withReads("another/probe.png"));
  archiveQualityInvocation(root, join(root, "agent/runs/spoof-probe.png.log"));
  const suffix = validateQualityReview(root, { requirePass: true });
  assert.equal(suffix.ok, false);
  assert.match(suffix.failures.join(), /image-read|visual probe/i);

  seedProductionRepresentative(root);
  writeFileSync(join(root, "agent/runs/spoof-basename.log"), withReads("agent/screenshots/representative-browser/visual-probe.png"));
  archiveQualityInvocation(root, join(root, "agent/runs/spoof-basename.log"));
  const basename = validateQualityReview(root, { requirePass: true });
  assert.equal(basename.ok, false);
  assert.match(basename.failures.join(), /image-read|visual probe/i);
});

test("quality evidence rejects screenshot suffix spoofs and mismatched content hashes", () => {
  const root = temp();
  seedSharedParent(root);
  seedProductionRepresentative(root);
  const captures = representativeCaptureHashes(root);
  const probeHash = fileSha256(join(root, QUALITY_PROBE_REL));

  // Suffix spoof for screenshot: evil/agent/screenshots/representative-browser/...
  const spoofedCaptures = captures.map(c => ({
    ...c,
    path: `evil/${c.path}`,
  }));
  const logLines = [
    imageReadLogLine({ path: QUALITY_PROBE_REL, dataBlobId: "blob-probe", hash: probeHash }),
    ...spoofedCaptures.map((capture, i) => imageReadLogLine({ path: capture.path, dataBlobId: `blob-shot-${i}`, hash: capture.hash })),
  ].join("\n") + "\n";

  writeFileSync(join(root, "agent/runs/suffix-spoof.log"), logLines);
  archiveQualityInvocation(root, join(root, "agent/runs/suffix-spoof.log"));
  const resSuffix = validateQualityReview(root, { requirePass: true });
  assert.equal(resSuffix.ok, false);
  assert.ok(resSuffix.failures.some(f => /no successful PNG image-read for agent\/screenshots/i.test(f)));

  // Content hash mismatch: correct path, but read hash differs from capture artifact
  seedProductionRepresentative(root);
  const badHashLines = [
    imageReadLogLine({ path: QUALITY_PROBE_REL, dataBlobId: "blob-probe", hash: probeHash }),
    ...captures.map((capture, i) => imageReadLogLine({ path: capture.path, dataBlobId: `blob-shot-${i}`, hash: "badhash" + i })),
  ].join("\n") + "\n";
  writeFileSync(join(root, "agent/runs/bad-hash.log"), badHashLines);
  archiveQualityInvocation(root, join(root, "agent/runs/bad-hash.log"));
  const resHash = validateQualityReview(root, { requirePass: true });
  assert.equal(resHash.ok, false);
  assert.ok(resHash.failures.some(f => /content hash does not match capture artifact|no successful PNG image-read/i.test(f)));
});

test("active-agent visual provenance requires preparationId, approved tools, and verified content hashes", () => {
  const root = temp();
  seedSharedParent(root);
  seedProductionRepresentative(root);
  const probeHash = fileSha256(join(root, QUALITY_PROBE_REL));
  const captures = representativeCaptureHashes(root);

  // 1. Missing preparationId fails closed
  recordActiveAgentQualityReceipt({
    root,
    preparationId: "", // missing!
    toolEvents: [
      { tool: "view_file", path: QUALITY_PROBE_REL, success: true, hash: probeHash },
      ...captures.map(c => ({ tool: "view_file", path: c.path, success: true, hash: c.hash })),
    ],
  });
  const resNoPrep = validateQualityReview(root, { requirePass: true });
  assert.equal(resNoPrep.ok, false);
  assert.ok(resNoPrep.failures.some(f => f.includes("missing preparationId binding")));

  // 2. Empty tool events fails closed
  recordActiveAgentQualityReceipt({
    root,
    preparationId: "prep-valid-id",
    toolEvents: [], // empty!
  });
  const resNoEvents = validateQualityReview(root, { requirePass: true });
  assert.equal(resNoEvents.ok, false);
  assert.ok(resNoEvents.failures.some(f => f.includes("environment did not record image inspection events")));

  // 3. Unapproved tool name (e.g. "curl" or "mock") fails closed
  recordActiveAgentQualityReceipt({
    root,
    preparationId: "prep-valid-id",
    toolEvents: [
      { tool: "curl", path: QUALITY_PROBE_REL, success: true, hash: probeHash },
      ...captures.map(c => ({ tool: "view_file", path: c.path, success: true, hash: c.hash })),
    ],
  });
  const resUnapproved = validateQualityReview(root, { requirePass: true });
  assert.equal(resUnapproved.ok, false);
  assert.ok(resUnapproved.failures.some(f => f.includes('unapproved tool "curl"')));

  // 4. Missing content hash on probe event fails closed
  recordActiveAgentQualityReceipt({
    root,
    preparationId: "prep-valid-id",
    toolEvents: [
      { tool: "view_file", path: QUALITY_PROBE_REL, success: true }, // missing hash!
      ...captures.map(c => ({ tool: "view_file", path: c.path, success: true, hash: c.hash })),
    ],
  });
  const resNoHash = validateQualityReview(root, { requirePass: true });
  assert.equal(resNoHash.ok, false);
  assert.ok(resNoHash.failures.some(f => f.includes("missing content hash on probe inspection event")));

  // 5. Mismatched content hash on screenshot fails closed
  recordActiveAgentQualityReceipt({
    root,
    preparationId: "prep-valid-id",
    toolEvents: [
      { tool: "view_file", path: QUALITY_PROBE_REL, success: true, hash: probeHash },
      ...captures.map(c => ({ tool: "view_file", path: c.path, success: true, hash: "tampered_hash" })),
    ],
  });
  const resBadHash = validateQualityReview(root, { requirePass: true });
  assert.equal(resBadHash.ok, false);
  assert.ok(resBadHash.failures.some(f => f.includes("image hash mismatch")));

  // 6. Authentic active-agent visual receipt with approved tool and valid hashes passes
  recordActiveAgentQualityReceipt({
    root,
    preparationId: "prep-valid-id",
    toolEvents: [
      { tool: "view_file", path: QUALITY_PROBE_REL, success: true, hash: probeHash },
      ...captures.map(c => ({ tool: "view_file", path: c.path, success: true, hash: c.hash })),
    ],
  });
  const resAuthentic = validateQualityReview(root, { requirePass: true });
  assert.equal(resAuthentic.ok, true, `Expected authentic active-agent review to pass, got: ${resAuthentic.failures.join(", ")}`);
});

test("reference-analysis rejects arbitrary paths and tampered calibration hashes", () => {
  const root = temp();
  seedSharedParent(root);
  const analysis = json<Record<string, unknown>>(join(root, "onboarding/reference-analysis.json"));
  analysis.evidencePaths = ["../../secret.png", "/etc/passwd"];
  save(join(root, "onboarding/reference-analysis.json"), analysis);
  assert.match(evaluateV2(root, "reference-analysis").failures.join(), /arbitrary path|outside the current calibration pack/);
  seedSharedParent(root);
  const ok = json<{ applicable: { evidencePaths: string[] }[] }>(join(root, "onboarding/reference-analysis.json"));
  ok.applicable[0]!.evidencePaths = ["not-in-the-pack.png"];
  save(join(root, "onboarding/reference-analysis.json"), ok);
  assert.match(evaluateV2(root, "reference-analysis").failures.join(), /outside the current calibration pack/);
});

test("public bundle rewrites nested navigation and root-relative assets under a shared origin", () => {
  const site = temp();
  write(site, "dist/index.html", "<h1>Home</h1><a href=\"/about\">About</a><link href=\"/theme.css\" rel=\"stylesheet\">");
  write(site, "dist/about/index.html", "<h1>About</h1><a href=\"/\">Home</a><img src=\"/media/roof.svg\">");
  write(site, "dist/theme.css", "body{background:url(/media/roof.svg)}");
  write(site, "dist/media/roof.svg", "<svg/>");
  const bundle = temp();
  const result = buildPublicComparisonBundle({ dest: bundle, runId: "run-1", sites: [{ id: "candidate-a", label: "A & B", root: site, status: "complete" }] });
  assert.equal(result.failures.join(), "", result.failures.join("\n"));
  const home = readFileSync(join(bundle, "candidate-a/dist/index.html"), "utf8");
  const about = readFileSync(join(bundle, "candidate-a/dist/about/index.html"), "utf8");
  const css = readFileSync(join(bundle, "candidate-a/dist/theme.css"), "utf8");
  assert.match(home, /about\/index\.html/);
  assert.doesNotMatch(home, /href="\/about"/);
  assert.match(about, /\.\.\/index\.html|\.\.\/$/);
  assert.match(about, /\.\.\/media\/roof\.svg/);
  assert.match(css, /media\/roof\.svg/);
  const index = readFileSync(join(bundle, "index.html"), "utf8");
  assert.match(index, /A &amp; B/);
  assert.doesNotMatch(index, /A & B/);
});

test("safely rewritten localhost is not a permanent failure, incomplete and secret bundles fail", () => {
  const mapped = temp();
  write(mapped, "dist/index.html", "<h1>Home</h1><a href=\"http://127.0.0.1:4173/about\">About</a>");
  write(mapped, "dist/about/index.html", "<h1>About</h1>");
  const mappedDest = temp();
  const mappedBundle = buildPublicComparisonBundle({ dest: mappedDest, runId: "run-1", sites: [{ id: "candidate-a", label: "A", root: mapped, status: "complete" }] });
  assert.equal(mappedBundle.failures.join(), "", mappedBundle.failures.join("\n"));
  assert.match(readFileSync(join(mappedDest, "candidate-a/dist/index.html"), "utf8"), /about\/index\.html/);
  assert.doesNotMatch(readFileSync(join(mappedDest, "candidate-a/dist/index.html"), "utf8"), /127\.0\.0\.1/);
  const incomplete = temp();
  write(incomplete, "dist/index.html", "<h1>WIP</h1>");
  const incompleteDest = temp();
  const incompleteBundle = buildPublicComparisonBundle({ dest: incompleteDest, runId: "run-1", sites: [{ id: "candidate-a", label: "A", root: incomplete, status: "generating" }] });
  assert.ok(incompleteBundle.failures.some(f => /generating|Incomplete|finished/i.test(f)));
  const secret = temp();
  write(secret, "dist/index.html", "<h1>Home</h1><!-- agent/runs/1-direction.log VITRIS_WORKER_NODE -->");
  const secretDest = temp();
  const secretBundle = buildPublicComparisonBundle({ dest: secretDest, runId: "run-1", sites: [{ id: "candidate-a", label: "A", root: secret, status: "complete" }] });
  assert.ok(secretBundle.failures.some(f => /Secrets or operator logs/i.test(f)));
});

test("public-bundle CLI prints the static path and fails nonzero on incomplete candidates", async () => {
  const parent = temp(); seedSharedParent(parent);
  const manifest = createDesignRun(parent, kernel);
  freezeIfReady(parent, loadManifest(parent, manifest.runId));
  const live = loadManifest(parent, manifest.runId);
  const dest = ensureCandidateSite(parent, kernel, live, live.candidates[0]!, brief("dir-a", "Quiet editorial"));
  write(dest, "dist/index.html", "<h1>Home</h1>");
  live.candidates[0]!.status = "complete";
  live.candidates[0]!.previewReady = true;
  save(join(runDir(parent, live.runId), "manifest.json"), live);
  const out = join(temp(), "bundle");
  const code = await handleDesignRunCommand({
    root: parent, kernel, argv: [process.execPath, "ralph.ts", "--design-run", live.runId, "--public-bundle", out],
  });
  assert.equal(code, 1);
  assert.equal(existsSync(join(out, "index.html")), true);
  live.candidates.forEach(c => { c.status = "complete"; c.previewReady = true; });
  for (const candidate of live.candidates) {
    const root = resolve(parent, candidate.root);
    mkdirSync(join(root, "dist"), { recursive: true });
    write(root, "dist/index.html", "<h1>Home</h1>");
  }
  save(join(runDir(parent, live.runId), "manifest.json"), live);
  const okDest = join(temp(), "bundle-ok");
  const ok = await handleDesignRunCommand({
    root: parent, kernel, argv: [process.execPath, "ralph.ts", "--design-run", live.runId, "--public-bundle", okDest],
  });
  assert.equal(ok, 0);
  assert.equal(existsSync(join(okDest, "index.html")), true);
});

function installQualityChildAdapter(dest: string, mode: "fail-once" | "always-fail") {
  write(dest, "quality-adapter.mjs", `import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
const node = process.env.VITRIS_WORKER_NODE || "";
const mode = ${JSON.stringify(mode)};
function sha(p) { return createHash("sha256").update(readFileSync(p)).digest("hex"); }
function captures() {
  const dir = "agent/screenshots/representative-browser";
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(n => n.endsWith(".png")).sort().map(n => ({ path: dir + "/" + n, hash: sha(join(dir, n)) }));
}
function emitReads(probeHash, shots) {
  const lines = [
    JSON.stringify({ type: "tool_result", subtype: "success", name: "read", arguments: { path: "agent/reviews/visual-probe.png" }, result: { path: "agent/reviews/visual-probe.png", dataBlobId: "blob-probe", mimeType: "image/png", hash: probeHash } }),
    ...shots.map((s, i) => JSON.stringify({ type: "tool_result", subtype: "success", name: "read", arguments: { path: s.path }, result: { path: s.path, dataBlobId: "blob-" + i, mimeType: "image/png", hash: s.hash } })),
  ];
  for (const line of lines) console.log(line);
}
function promptSubject() {
  const current = existsSync("agent/CURRENT.md") ? readFileSync("agent/CURRENT.md", "utf8") : "";
  const match = current.match(/Review subjectHash: ([a-f0-9]+)/);
  return match ? match[1] : "";
}
try {
if (node === "representative-browser" && existsSync("agent/reviews/representative-browser.json")) {
  const report = JSON.parse(readFileSync("agent/reviews/representative-browser.json", "utf8"));
  const source = existsSync("agent/source-hash.txt") ? readFileSync("agent/source-hash.txt", "utf8").trim() : report.sourceHash;
  const dist = existsSync("agent/dist-hash.txt") ? readFileSync("agent/dist-hash.txt", "utf8").trim() : report.distHash;
  if (report.sourceHash !== source || report.distHash !== dist) {
    report.sourceHash = source;
    report.distHash = dist;
    writeFileSync("agent/reviews/representative-browser.json", JSON.stringify(report, null, 2) + "\\n");
  }
  process.exit(0);
}
if (node === "representative-review") {
  const review = existsSync("agent/reviews/representative-review.json")
    ? JSON.parse(readFileSync("agent/reviews/representative-review.json", "utf8"))
    : { version: 2, reviewer: "stub", verdict: "pass", checks: [], findings: [] };
  review.version = 2;
  review.verdict = "pass";
  review.reviewer = review.reviewer || "stub";
  const subject = promptSubject() || (existsSync("agent/review-subject.txt") ? readFileSync("agent/review-subject.txt", "utf8").trim() : review.subjectHash);
  if (subject) review.subjectHash = subject;
  const pngs = captures().map(s => s.path);
  if (pngs.length) review.evidence = pngs;
  mkdirSync("agent/reviews", { recursive: true });
  writeFileSync("agent/reviews/representative-review.json", JSON.stringify(review, null, 2) + "\\n");
  process.exit(0);
}
if (node === "representative-quality") {
  const countPath = "agent/quality-attempts.json";
  const count = existsSync(countPath) ? JSON.parse(readFileSync(countPath, "utf8")).n : 0;
  writeFileSync(countPath, JSON.stringify({ n: count + 1 }));
  const subject = promptSubject() || (existsSync("agent/quality-subject.txt") ? readFileSync("agent/quality-subject.txt", "utf8").trim() : "missing");
  const dims = ["business-specificity","composition","typography","media-integration","brand-coherence","copy-design-integration","responsive-craft"];
  const probePath = "agent/reviews/visual-probe.png";
  const probeHash = existsSync(probePath) ? sha(probePath) : "missing";
  const shots = captures();
  emitReads(probeHash, shots);
  const fail = mode === "always-fail" || (mode === "fail-once" && count === 0);
  mkdirSync("agent/reviews", { recursive: true });
  writeFileSync("agent/reviews/representative-quality.json", JSON.stringify({
    schemaVersion: 1, kind: "design-quality", subjectHash: subject, verdict: fail ? "fail" : "pass", reviewer: "stub",
    identities: { source: "x" },
    visualInspection: { available: true, probeHash, observedToken: "2E6BFF", captureHashes: shots.map(s => s.hash), toolReads: [] },
    dimensions: dims.map(name => ({ name, score: fail ? 1 : 3, page: "/", viewport: "1080", section: "hero", evidence: "Observed " + name + " on the homepage hero at 1080 with the roof photograph and estimate action" })),
    findings: fail ? [{ id: "weak", page: "/", section: "hero", evidence: "hero", severity: "major", problem: "Weak composition", repair: "Rebuild hero", target: "representative", verify: "Recapture" }] : [],
  }) + "\\n");
}
} catch (error) {
  try { writeFileSync("agent/quality-adapter-error.txt", String(error && error.stack || error)); } catch {}
  throw error;
}
console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }));
process.exit(0);
`);
  const codexShim = join(dest, "codex.exe");
  linkSync(process.execPath, codexShim);
  const adapter = { command: codexShim, args: [join(dest, "quality-adapter.mjs"), "-"], prompt: "stdin" };
  save(join(dest, "agent/adapter.json"), adapter);
  save(join(dest, "agent/adapter.reviewer.json"), adapter);
  write(dest, "agent/quality-subject.txt", qualitySubject(dest));
  write(dest, "agent/review-subject.txt", reviewSubject(dest, "representative-review"));
  write(dest, "agent/source-hash.txt", sourceHash(dest));
  write(dest, "agent/dist-hash.txt", fingerprint(dest, ["dist"]));
}

test("quality coordinator fails closed when a critic repeatedly rejects the representative", { timeout: 180_000 }, async () => {
  const succeed = prepareCoordinatorParent({ mode: "pass", review: "pass" });
  succeed.live.status = "qualifying";
  succeed.live.budgets.max = 40;
  save(join(runDir(succeed.parent, succeed.live.runId), "manifest.json"), succeed.live);
  const briefs = fiveBriefs();
  for (let i = 0; i < succeed.live.candidates.length; i++) {
    const dest = ensureCandidateSite(succeed.parent, kernel, succeed.live, succeed.live.candidates[i]!, briefs[i]!);
    seedProductionRepresentative(dest);
    markNodesDone(dest, ["narrative", "narrative-review", "reference-analysis", "direction", "direction-render", "direction-review", "storyboard", "copy", "copy-review", "representative", "representative-browser", "representative-review"]);
    installQualityChildAdapter(dest, i === 0 ? "fail-once" : "always-fail");
    if (i !== 0) write(dest, "agent/quality-subject.txt", qualitySubject(dest));
  }
  const recovered = await runDesignCoordinator(succeed.parent, kernel, [process.execPath, "ralph.ts", "--max", "40", "--timeout-ms", "60000"], coordinatorOpts(succeed.parent, succeed.live));
  const after = loadManifest(succeed.parent, succeed.live.runId);
  const destA = resolve(succeed.parent, after.candidates[0]!.root);
  const adapterErr = existsSync(join(destA, "agent/quality-adapter-error.txt")) ? readFileSync(join(destA, "agent/quality-adapter-error.txt"), "utf8") : "";
  const qualityLogs = existsSync(join(destA, "agent/runs"))
    ? readdirSync(join(destA, "agent/runs")).filter(n => n.includes("representative-quality") && n.endsWith(".log")).map(n => n + "\n" + readFileSync(join(destA, "agent/runs", n), "utf8").slice(0, 2000)).join("\n---\n")
    : "";
  assert.equal(after.candidates[0]!.quality?.used, 1, [after.candidates[0]!.error, recovered.summary, adapterErr, qualityLogs].filter(Boolean).join("\n"));
  assert.equal(after.candidates[0]!.status, "rejected", after.candidates[0]!.error || recovered.summary);
  assert.ok((after.candidates[0]!.quality?.attempts.length || 0) >= 1);
  assert.equal(after.candidates[1]!.status === "rejected" || after.candidates[1]!.status === "blocked", true);
  assert.match(after.candidates[1]!.error || recovered.summary || "", /quality|representative/i);
  assert.equal(recovered.exitCode, 1);
});

test("concept-preview --resume without --concept-preview continues from qualified snapshots", { timeout: 180_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "pass", review: "pass" });
  live.mode = { conceptPreview: true, requestedVariants: 5 };
  live.status = "qualifying";
  live.budgets.max = 40;
  save(join(runDir(parent, live.runId), "manifest.json"), live);
  const briefs = fiveBriefs();
  for (let i = 0; i < live.candidates.length; i++) {
    const dest = ensureCandidateSite(parent, kernel, live, live.candidates[i]!, briefs[i]!);
    seedProductionRepresentative(dest);
    markNodesDone(dest, ["narrative", "narrative-review", "reference-analysis", "direction", "direction-render", "direction-review", "storyboard", "copy", "copy-review", "representative", "representative-browser", "representative-review", "representative-quality"]);
  }
  const preview = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(loadManifest(parent, live.runId).status, "concept_preview_ready");
  assert.equal(preview.paused, true);
  const resumed = await runDesignCoordinator(parent, kernel, [process.execPath, "ralph.ts", "--design-run", live.runId, "--resume", "--max", "1", "--timeout-ms", "60000"], coordinatorOpts(parent, live));
  const after = loadManifest(parent, live.runId);
  assert.notEqual(after.status, "concept_preview_ready");
  assert.equal(after.mode.conceptPreview, false, JSON.stringify({ status: after.status, mode: after.mode, raw: json(join(runDir(parent, live.runId), "manifest.json")).mode }));
  assert.ok(["generating", "blocked", "reviewing", "awaiting_design_feedback"].includes(after.status));
  assert.equal(Boolean(resumed.paused && after.status === "concept_preview_ready"), false);
});

test("narrative critic cannot modify a different review or source", { timeout: 60_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "mutate-narrative-other", review: "pass" });
  unlinkSync(join(parent, "agent/reviews/narrative-review.json"));
  live.status = "preparing";
  save(join(runDir(parent, live.runId), "manifest.json"), live);
  const beforeBusiness = readFileSync(join(parent, "agent/reviews/business-review.json"), "utf8");
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(result.exitCode, 1);
  assert.match(result.summary || "", /critic_write_violation/);
  assert.equal(readFileSync(join(parent, "agent/reviews/business-review.json"), "utf8"), beforeBusiness);
  if (existsSync(join(parent, "agent/request.json"))) {
    assert.doesNotMatch(readFileSync(join(parent, "agent/request.json"), "utf8"), /hijack/);
  }
});

test("synthesis fulfillment critic cannot mutate sources and missing visual-review fails closed", { timeout: 60_000 }, async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "mutate-fulfillment", review: "pass" });
  live.status = "verifying";
  live.synthesisHead = "synth-001";
  live.feedbackHead = "feedback-001";
  save(join(runDir(parent, live.runId), "manifest.json"), live);
  const site = join(runDir(parent, live.runId), "synthesis/synth-001/site");
  mkdirSync(join(site, "pages"), { recursive: true });
  mkdirSync(join(site, "agent/reviews"), { recursive: true });
  mkdirSync(join(site, "onboarding"), { recursive: true });
  write(site, "pages/index.html", "<h1>Keep</h1>");
  write(site, "dist/index.html", "<h1>Keep</h1>");
  save(join(site, "onboarding/synthesis-plan.json"), {
    schemaVersion: 1, revision: "synth-001", runId: live.runId, feedbackId: "feedback-001", feedbackHash: "a", comparisonHash: "b",
    baseCandidateId: "candidate-a", themeCandidateId: "candidate-a",
    tokens: { source: "candidate-a", exceptions: [] },
    routes: [{ path: "/", sections: [{ id: "hero", facets: [], preserve: [], adaptation: "translate-to-base-theme", facts: [], media: [], acceptance: "keep" }] }],
    conflicts: [], assumptions: [], dependencies: [], verification: ["representative-quality", "browser", "visual-review", "content-review", "feedback-fulfillment"],
  });
  save(join(runDir(parent, live.runId), "synthesis/synth-001/synthesis-plan.json"), json(join(site, "onboarding/synthesis-plan.json")));
  save(join(runDir(parent, live.runId), "feedback/feedback-001.json"), {
    schemaVersion: 1, feedbackId: "feedback-001", runId: live.runId, comparisonRevision: "review-001", comparisonHash: "b",
    actor: { type: "operator", id: "local" }, baseCandidateId: "candidate-a", themeCandidateId: "candidate-a",
    choices: [{ id: "choice-hero", operation: "preserve", source: { candidateId: "candidate-a", buildHash: "x", route: "/", sectionId: "hero" }, target: { route: "/", sectionId: "hero" }, facets: ["composition"], preserve: [], adaptation: "translate-to-base-theme", priority: "must" }],
    submission: "synthesize",
  });
  const result = await runDesignCoordinator(parent, kernel, coordinatorArgv(), coordinatorOpts(parent, live));
  assert.equal(result.exitCode, 1);
  assert.match(result.summary || loadManifest(parent, live.runId).errors.join("\n"), /critic_write_violation|visual-review/);
  assert.equal(readFileSync(join(site, "pages/index.html"), "utf8"), "<h1>Keep</h1>");
  const missingVisual = synthesisAcceptanceFailures(site);
  assert.match(missingVisual.join(), /visual-review/);
});

test("external model wrapper configured in adapter fails closed before mutation without injected executor", async () => {
  const { parent, live } = prepareCoordinatorParent({ mode: "pass" });
  save(join(parent, "agent/adapter.json"), { command: "node", args: ["wrapper.mjs"], prompt: "stdin" });
  const beforeSource = fingerprint(parent, ["agent", "onboarding"]);
  await assert.rejects(
    async () => {
      await runDesignCoordinator(parent, kernel, coordinatorArgv(), { runId: live.runId });
    },
    /Unsupported external model adapter command ['"]node['"]/
  );
  const afterSource = fingerprint(parent, ["agent", "onboarding"]);
  assert.equal(afterSource, beforeSource, "filesystem must have zero mutations when external adapter is rejected");
});
