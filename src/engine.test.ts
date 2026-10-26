import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectSite, prepareChange, applyOperations, sourceRevision, verifyChange, discardChange, generateEditManifest, publicEditManifest } from "./engine/index.ts";
import { parseChangePlan, parseChangeRequest, parseSiteIdentity } from "./engine/contracts.ts";

function site() {
  const root = mkdtempSync(join(tmpdir(), "vitris-engine-"));
  mkdirSync(join(root, "pages"));
  writeFileSync(join(root, "site.json"), JSON.stringify({ siteId: "fictional-shop", sourceFormatVersion: 1, slug: "fictional-shop", name: "Fictional Shop", capabilities: [] }));
  writeFileSync(join(root, "pages/index.html"), '<section id="hero"><h1 id="hero-title">Old title</h1><p>Keep this.</p></section>');
  return root;
}

function records(root: string, id = "change-1") {
  const baseRevision = sourceRevision(root).digest;
  const request = { schemaVersion: 1, id, instruction: "Update the headline", origin: "operator", baseRevision,
    requestedScopes: ["copy"], explicitPreferences: [{ intent: "preserve", text: "Keep the body copy", target: "/#hero" }], evidence: [] };
  const plan = { schemaVersion: 1, requestId: id, baseRevision, targets: ["/#hero-title"], files: ["pages/index.html"],
    facets: ["copy"], preserve: ["Keep the body copy"],
    acceptanceCriteria: [{ id: "headline", kind: "exact_text", target: "/#hero-title", expected: "New title" }],
    requiredChecks: ["render-375", "render-1080"], assumptions: [], evidence: [], proposedBy: "active_agent" };
  return { request, plan };
}

test('site identities use the public scope while preserving legacy identity records', () => {
  const current=inspectSite(site()).identity;
  assert.equal(current.harness.name,'@tryvitris/website-harness');
  assert.equal(parseSiteIdentity(current).harness.name,'@tryvitris/website-harness');
  assert.equal(parseSiteIdentity({...current,harness:{...current.harness,name:'@tryvitris/harness'}}).harness.name,'@tryvitris/harness');
  assert.equal(parseSiteIdentity({...current,harness:{...current.harness,name:'@vitris/harness'}}).harness.name,'@vitris/harness');
  assert.throws(()=>parseSiteIdentity({...current,harness:{...current.harness,name:'@other/harness'}}),/harness.name/);
});

test("contracts reject incomplete plans and unknown origin", () => {
  const root = site();
  const { request, plan } = records(root);
  assert.throws(() => parseChangePlan({ ...plan, acceptanceCriteria: [] }), /acceptanceCriteria/);
  assert.throws(() => parseChangeRequest({ ...request, origin: "unknown" }), /origin/);
  assert.throws(() => parseChangeRequest({ ...request, id: "../outside" }), /safe single path segment/);
  assert.throws(() => parseChangePlan({ ...plan, requestId: "../outside" }), /safe single path segment/);
  assert.throws(() => prepareChange(root, request, { ...plan, requiredChecks: ["must-run-custom-check"] }), /Unsupported required check/);
});

test("revision includes uncommitted bytes and editor save preserves unrelated source", () => {
  const root = site();
  assert.equal(inspectSite(root).identity.siteId, "fictional-shop");
  const { request, plan } = records(root);
  const prepared = prepareChange(root, request, plan);
  assert.equal(prepared.status, "prepared");
  assert.deepEqual(prepareChange(root, request, plan), prepared);
  assert.throws(() => prepareChange(root, request, { ...plan, preserve: ["Different"] }), /different content/);
  const applied = applyOperations(root, "change-1", [{ kind: "set_text", file: "pages/index.html", elementId: "hero-title", text: "New title" }]);
  assert.deepEqual(applied.changedFiles, ["pages/index.html"]);
  assert.equal(readFileSync(join(root, "pages/index.html"), "utf8"), '<section id="hero"><h1 id="hero-title">New title</h1><p>Keep this.</p></section>');
  assert.equal(sourceRevision(root).digest, applied.afterRevision.digest);
  assert.deepEqual(applyOperations(root, "change-1", [{ kind: "set_text", file: "pages/index.html", elementId: "hero-title", text: "New title" }]), applied);
});

test("stale save rejects external edits before touching source", () => {
  const root = site();
  const { request, plan } = records(root);
  prepareChange(root, request, plan);
  const file = join(root, "pages/index.html");
  writeFileSync(file, readFileSync(file, "utf8").replace("Keep this.", "Owner changed this."));
  assert.throws(() => applyOperations(root, "change-1", [{ kind: "set_text", file: "pages/index.html", elementId: "hero-title", text: "New title" }]), /revision changed/);
  assert.match(readFileSync(file, "utf8"), /Old title/);
  assert.match(readFileSync(file, "utf8"), /Owner changed this/);
});

test("exact outcome assertion verifies the edited target, not unrelated words", async () => {
  const root = site();
  const { request, plan } = records(root);
  prepareChange(root, request, plan);
  applyOperations(root, "change-1", [{ kind: "set_text", file: "pages/index.html", elementId: "hero-title", text: "Unrelated title" }]);
  const result = await verifyChange(root, "change-1");
  assert.equal(result.fulfillment, "fail");
  assert.ok(result.unresolved.some(item => /Criterion headline expected exact text/.test(item)));
});

test("structured preserve preference survives a verified edit with required browser checks", async () => {
  const root = site();
  writeFileSync(join(root, "pages/index.html"), '<h1 id="hero-title">Old title</h1><p id="body">Approved body copy.</p>');
  const { request, plan } = records(root, "preserve-positive");
  request.explicitPreferences = [{ intent: "preserve", text: "Keep body copy unchanged", target: "/#body" }];
  plan.preserve = ["Keep body copy unchanged"];
  prepareChange(root, request, plan);
  applyOperations(root, request.id, [{ kind: "set_text", file: "pages/index.html", elementId: "hero-title", text: "New title" }]);
  const result = await verifyChange(root, request.id);
  assert.equal(result.technical, "pass");
  assert.equal(result.fulfillment, "pass");
  assert.ok(result.receipt?.checks.some(check => check.id === "render-375" && check.outcome === "pass"));
  assert.ok(result.receipt?.checks.some(check => check.id === "render-1080" && check.outcome === "pass"));
  const memory = JSON.parse(readFileSync(join(root, "agent/site-memory.json"), "utf8"));
  assert.ok(memory.preferences.some((item: { target?: string }) => item.target === "/#body"));
});

test("planned file cannot hide a changed preserved body or unrelated copy", async () => {
  const root = site();
  writeFileSync(join(root, "pages/index.html"), '<h1 id="hero-title">Old title</h1><p id="body">Approved body copy.</p>');
  const { request, plan } = records(root, "preserve-negative");
  request.explicitPreferences = [{ intent: "preserve", text: "Keep body copy unchanged", target: "/#body" }];
  plan.preserve = ["Keep body copy unchanged"];
  prepareChange(root, request, plan);
  writeFileSync(join(root, "pages/index.html"), '<h1 id="hero-title">New title</h1><p id="body">Unrequested replacement.</p>');
  const result = await verifyChange(root, request.id);
  assert.equal(result.technical, "fail");
  assert.ok(result.unresolved.some(item => /Preserved target changed/.test(item)));
  assert.ok(result.unresolved.some(item => /Unplanned source impact/.test(item)));
  const memory = JSON.parse(readFileSync(join(root, "agent/site-memory.json"), "utf8"));
  assert.equal(memory.acceptedRequests?.some((item: { requestId: string }) => item.requestId === request.id) || false, false);
});

test("data-vitris-field without matching HTML id satisfies the same outcome identity", async () => {
  const root = site();
  writeFileSync(join(root, "pages/index.html"), '<h1 id="different-id" data-vitris-field="headline">Old title</h1>');
  const { request, plan } = records(root, "field-identity");
  request.explicitPreferences = [];
  plan.preserve = [];
  plan.targets = ["/#headline"];
  plan.acceptanceCriteria = [{ id: "headline", kind: "exact_text", target: "/#headline", expected: "New title" }];
  prepareChange(root, request, plan);
  applyOperations(root, request.id, [{ kind: "set_text", file: "pages/index.html", elementId: "headline", text: "New title" }]);
  const result = await verifyChange(root, request.id);
  assert.equal(result.fulfillment, "pass", JSON.stringify(result.unresolved));
});

test("shared component field identity survives rendering and verification", async () => {
  const root = site();
  mkdirSync(join(root, "components/notice"), { recursive: true });
  writeFileSync(join(root, "components/notice/template.html"), '<h1 data-vitris-field="shared-headline">Old title</h1>');
  writeFileSync(join(root, "components/notice/styles.css"), "");
  writeFileSync(join(root, "components/notice/edit.schema.json"), JSON.stringify({ fields: [{ id: "shared-headline" }] }));
  writeFileSync(join(root, "pages/index.html"), "<notice></notice>");
  const manifest = generateEditManifest(root);
  assert.ok(manifest.fields.some(field => field.id === "shared-headline" && field.scope === "shared"));
  const { request, plan } = records(root, "shared-field");
  request.explicitPreferences = [];
  plan.preserve = [];
  plan.files = ["components/notice/template.html"];
  plan.targets = ["/#shared-headline"];
  plan.acceptanceCriteria = [{ id: "headline", kind: "exact_text", target: "/#shared-headline", expected: "New title" }];
  prepareChange(root, request, plan);
  applyOperations(root, request.id, [{ kind: "set_text", file: "components/notice/template.html", elementId: "shared-headline", text: "New title" }]);
  const result = await verifyChange(root, request.id);
  assert.equal(result.fulfillment, "pass", JSON.stringify(result.unresolved));
});

test("renamed field invalidates the old editor manifest identity", () => {
  const root = site();
  writeFileSync(join(root, "pages/index.html"), '<h1 data-vitris-field="headline">Old title</h1>');
  const oldManifest = generateEditManifest(root);
  writeFileSync(join(root, "pages/index.html"), '<h1 data-vitris-field="renamed-headline">Old title</h1>');
  const newManifest = generateEditManifest(root);
  assert.equal(newManifest.fields.some(field => field.id === "headline"), false);
  const { request, plan } = records(root, "renamed-field");
  request.explicitPreferences = [];
  plan.preserve = [];
  prepareChange(root, request, plan);
  assert.throws(() => applyOperations(root, request.id, [{ kind: "set_text", file: "pages/index.html", elementId: "headline", text: "New title" }], oldManifest.sourceRevision), /Stale editor manifest/);
});

test("verification rejects unplanned source impact without accepting the request", async () => {
  const root = site();
  const { request, plan } = records(root);
  prepareChange(root, request, plan);
  writeFileSync(join(root, "pages/index.html"), '<section id="hero"><h1 id="hero-title">New title</h1></section>');
  writeFileSync(join(root, "pages/other.html"), "<h1>Unplanned page</h1>");
  await assert.rejects(verifyChange(root, request.id), /Source impact exceeds the prepared plan: pages\/other.html/);
});

test("discard restores a failed candidate and refuses to erase intervening edits", async () => {
  const root = site();
  const { request, plan } = records(root);
  const prepared = prepareChange(root, request, plan);
  applyOperations(root, request.id, [{ kind: "set_text", file: "pages/index.html", elementId: "hero-title", text: "Wrong title" }]);
  const failed = await verifyChange(root, request.id);
  assert.equal(failed.fulfillment, "fail");
  const candidate = sourceRevision(root).digest;
  const file = join(root, "pages/index.html");
  writeFileSync(file, readFileSync(file, "utf8").replace("Keep this.", "Owner changed this."));
  assert.throws(() => discardChange(root, request.id, candidate), /Candidate revision changed/);
  writeFileSync(file, readFileSync(file, "utf8").replace("Owner changed this.", "Keep this."));
  const discarded = discardChange(root, request.id, candidate);
  assert.equal(discarded.status, "discarded");
  assert.equal(discarded.revision.digest, prepared.preparedRevision.digest);
  assert.match(readFileSync(file, "utf8"), /Old title/);
});

test("concurrent source edit during browser verification cannot be accepted", { timeout: 60_000 }, async () => {
  const root = site();
  const { request, plan } = records(root, "concurrent-verify");
  prepareChange(root, request, plan);
  const file = join(root, "pages/index.html");
  writeFileSync(file, readFileSync(file, "utf8").replace("Old title", "New title"));
  let mutated = false;
  const timer = setInterval(() => {
    if (!mutated && existsSync(join(root, "dist/index.html"))) {
      mutated = true;
      writeFileSync(file, readFileSync(file, "utf8").replace("New title", "Concurrent unverified edit"));
    }
  }, 2);
  try {
    await assert.rejects(verifyChange(root, request.id), /Source changed during verification/);
  } finally { clearInterval(timer); }
  assert.equal(mutated, true);
  const memory = JSON.parse(readFileSync(join(root, "agent/site-memory.json"), "utf8"));
  assert.equal(memory.acceptedRequests?.some((entry: { requestId: string }) => entry.requestId === request.id) || false, false);
});

test("manifest preserves field identity and omits private source paths in browser view", () => {
  const root = site();
  writeFileSync(join(root, "pages/index.html"), '<section id="hero" data-vitris-movable><h1 data-vitris-field="hero-title">Old title</h1></section>');
  const manifest = generateEditManifest(root);
  assert.equal(manifest.fields[0]?.id, "hero-title");
  assert.equal(manifest.fields[0]?.sectionId, "hero");
  assert.equal(manifest.fields[0]?.sourceFile, "pages/index.html");
  assert.equal(JSON.stringify(publicEditManifest(manifest)).includes("pages/index.html"), false);
});

test("media, theme, and section operations edit declared source only", () => {
  const mediaRoot = site();
  mkdirSync(join(mediaRoot, "media"));
  writeFileSync(join(mediaRoot, "media/photo.jpg"), "fictional-image-bytes");
  mkdirSync(join(mediaRoot, "onboarding"));
  const mediaHash = createHash("sha256").update("fictional-image-bytes").digest("hex");
  writeFileSync(join(mediaRoot, "onboarding/media-inventory.json"), JSON.stringify({ version: 2, assets: [
    { id: "fictional-photo", path: "media/photo.jpg", sha256: mediaHash, sources: ["fictional local fixture"], disposition: "use" },
  ] }));
  writeFileSync(join(mediaRoot, "pages/index.html"), '<section id="hero"><img id="hero-image" src="/media/old.jpg" alt="Workshop"></section>');
  const mediaRecords = records(mediaRoot, "media-1");
  mediaRecords.plan.files = ["pages/index.html"];
  prepareChange(mediaRoot, mediaRecords.request, mediaRecords.plan);
  applyOperations(mediaRoot, "media-1", [{ kind: "replace_media", file: "pages/index.html", elementId: "hero-image", src: "/media/photo.jpg" }]);
  assert.match(readFileSync(join(mediaRoot, "pages/index.html"), "utf8"), /src="\/media\/photo.jpg" alt="Workshop"/);

  const badMediaRoot = site();
  mkdirSync(join(badMediaRoot, "media"));
  writeFileSync(join(badMediaRoot, "media/photo.jpg"), "unregistered-bytes");
  writeFileSync(join(badMediaRoot, "pages/index.html"), '<img id="hero-image" src="/media/old.jpg" alt="Workshop">');
  const badMediaRecords = records(badMediaRoot, "media-unregistered");
  prepareChange(badMediaRoot, badMediaRecords.request, badMediaRecords.plan);
  assert.throws(() => applyOperations(badMediaRoot, "media-unregistered", [{ kind: "replace_media", file: "pages/index.html", elementId: "hero-image", src: "/media/photo.jpg" }]), /asset provenance/);

  const themeRoot = site();
  mkdirSync(join(themeRoot, "theme"));
  writeFileSync(join(themeRoot, "theme/defaults.json"), '{"colorAccent":"#123456","colorBg":"#ffffff"}');
  const themeRecords = records(themeRoot, "theme-1");
  themeRecords.plan.files = ["theme/defaults.json"];
  prepareChange(themeRoot, themeRecords.request, themeRecords.plan);
  applyOperations(themeRoot, "theme-1", [{ kind: "set_theme_token", file: "theme/defaults.json", token: "colorAccent", value: "#654321" }]);
  assert.equal(JSON.parse(readFileSync(join(themeRoot, "theme/defaults.json"), "utf8")).colorAccent, "#654321");

  const sectionRoot = site();
  writeFileSync(join(sectionRoot, "pages/index.html"), '<section id="first" data-vitris-movable>First</section>\n<section id="second" data-vitris-movable>Second</section>');
  const sectionRecords = records(sectionRoot, "sections-1");
  prepareChange(sectionRoot, sectionRecords.request, sectionRecords.plan);
  applyOperations(sectionRoot, "sections-1", [{ kind: "move_section", file: "pages/index.html", sectionId: "second", beforeSectionId: "first" }]);
  assert.match(readFileSync(join(sectionRoot, "pages/index.html"), "utf8"), /^<section id="second"[\s\S]*<section id="first"/);
});
