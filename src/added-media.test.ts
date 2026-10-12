import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprint, json, save, type MediaInventory } from "./agent/artifacts.ts";
import { registerRecoveredMedia, validateAddedMedia } from "./agent/added-media.ts";
import { evaluateV2 } from "./agent/evaluate.ts";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vitris-added-media-"));
  mkdirSync(join(root, "media/harvest"), { recursive: true });
  mkdirSync(join(root, "media/recovered"), { recursive: true });
  save(join(root, "onboarding/brief.json"), { images: [] });
  save(join(root, "onboarding/media-inventory.json"), { version: 2, harvestHash: fingerprint(root, ["onboarding/brief.json", "media/harvest"]), assets: [] });
  return root;
}
const inventory = (root: string) => json<MediaInventory>(join(root, "onboarding/media-inventory.json"));

test("recovered use and retain assets receive local hashes and media evaluation agrees", () => {
  const root = fixture();
  writeFileSync(join(root, "media/recovered/mark.png"), "fictional-logo");
  writeFileSync(join(root, "media/recovered/alternate.png"), "fictional-alternate");
  assert.match(evaluateV2(root, "media").failures.join(), /ADDED_MEDIA_CONFLICT/);
  const mark = registerRecoveredMedia(root, { path: "media/recovered/mark.png", source: "onboarding/brief.json", disposition: "use", description: "Fictional mark", role: "logo" });
  const alternate = registerRecoveredMedia(root, { path: "media/recovered/alternate.png", source: "onboarding/brief.json", disposition: "retain" });
  assert.equal(mark.sha256, sha("fictional-logo"));
  assert.equal(alternate.sha256, sha("fictional-alternate"));
  assert.equal(registerRecoveredMedia(root, { path: "media/recovered/mark.png", source: "onboarding/brief.json", disposition: "use" }).id, mark.id);
  const inv = inventory(root);
  const selected = inv.assets.find(asset => asset.id === mark.id)!;
  selected.inspected = true; selected.placements = ["/"]; selected.identity = "none";
  save(join(root, "onboarding/media-inventory.json"), inv);
  assert.deepEqual(validateAddedMedia(root, inventory(root)).findings, []);
  assert.deepEqual(evaluateV2(root, "media").failures, []);
});

test("missing recovered hash fails media before direction and can be repaired by registration", () => {
  const root = fixture();
  writeFileSync(join(root, "media/recovered/mark.png"), "fictional-logo");
  const inv = inventory(root);
  inv.assets.push({ id: "mark", path: "/media/recovered/mark.png", sources: ["onboarding/brief.json"], description: "Mark", role: "logo", disposition: "retain", reason: "Keep", inspected: false, placements: [], origin: "customer" });
  save(join(root, "onboarding/media-inventory.json"), inv);
  assert.match(evaluateV2(root, "media").failures.join(), /ADDED_MEDIA_METADATA.*sha256/);
  const repaired = registerRecoveredMedia(root, { path: "media/recovered/mark.png", id: "mark", source: "onboarding/brief.json", disposition: "retain" });
  assert.equal(repaired.sha256, sha("fictional-logo"));
  assert.deepEqual(evaluateV2(root, "media").failures, []);
});

test("accepted bytes and metadata cannot be cleared or silently rebound", () => {
  const root = fixture();
  const path = join(root, "media/recovered/mark.png");
  writeFileSync(path, "original");
  const asset = registerRecoveredMedia(root, { path: "media/recovered/mark.png", source: "onboarding/brief.json", disposition: "retain" });
  const bindings = validateAddedMedia(root, inventory(root)).bindings;
  writeFileSync(path, "changed");
  assert.throws(() => registerRecoveredMedia(root, { path: "media/recovered/mark.png", source: "onboarding/brief.json", disposition: "retain" }), /bytes changed/);
  assert.ok(validateAddedMedia(root, inventory(root), new Set(), bindings).findings.some(finding => finding.code === "ADDED_MEDIA_BOUND_CHANGED" && finding.category === "integrity"));
  writeFileSync(path, "original");
  const inv = inventory(root); inv.assets.find(row => row.id === asset.id)!.sha256 = undefined;
  assert.ok(validateAddedMedia(root, inv, new Set(), bindings).findings.some(finding => finding.category === "integrity"));
  assert.throws(() => registerRecoveredMedia(root, { path: "media/recovered/mark.png", source: "onboarding/brief.json", disposition: "retain", id: "different" }), /already registered/);
});

test("unexpected paths, traversal and symlinks fail closed", () => {
  const root = fixture();
  assert.throws(() => registerRecoveredMedia(root, { path: "media/recovered/../escape.png", source: "source", disposition: "retain" }), /inside the site/);
  writeFileSync(join(root, "media/extra.png"), "extra");
  assert.ok(validateAddedMedia(root, inventory(root), new Set()).findings.some(finding => finding.code === "ADDED_MEDIA_PATH" && finding.category === "integrity"));
  const outside = join(root, "outside.png"); writeFileSync(outside, "outside");
  try {
    symlinkSync(outside, join(root, "media/recovered/link.png"));
    assert.throws(() => registerRecoveredMedia(root, { path: "media/recovered/link.png", source: "source", disposition: "retain" }), /Symlink/);
  } catch (error) {
    if (process.platform !== "win32") throw error; // Windows may deny symlink creation without developer mode.
  }
});

test("stock video and poster retain their separate byte bindings", () => {
  const root = fixture();
  mkdirSync(join(root, "media/stock"), { recursive: true });
  const video = "video-bytes", poster = "poster-bytes";
  writeFileSync(join(root, `media/stock/${sha(video)}.mp4`), video);
  writeFileSync(join(root, `media/stock/${sha(poster)}.jpg`), poster);
  const inv = inventory(root);
  inv.assets.push({ id: "stock-video", path: `/media/stock/${sha(video)}.mp4`, sources: ["https://example.invalid/fictional-video"], description: "Fictional video", role: "illustration", disposition: "retain", reason: "Candidate", inspected: true, placements: [], origin: "stock", identity: "none", sha256: sha(video), kind: "video", poster: `/media/stock/${sha(poster)}.jpg`, posterSha256: sha(poster) });
  assert.deepEqual(validateAddedMedia(root, inv).findings, []);
  inv.assets[0]!.posterSha256 = sha("wrong");
  assert.ok(validateAddedMedia(root, inv).findings.some(finding => finding.code === "ADDED_MEDIA_HASH"));
});
