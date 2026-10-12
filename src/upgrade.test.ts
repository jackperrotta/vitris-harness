import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { save } from "./agent/artifacts.ts";
import { applyKitUpgrade, planKitUpgrade, recordManagedKit, recoverKitUpgrade, resolveManagedInstruction, rollbackKitUpgrade } from "./upgrade/kit.ts";
import { sourceRevision } from "./engine/revision.ts";
import { applyOperations, prepareChange, verifyChange } from "./engine/index.ts";
import { inputHash, instructionContractHash } from "./agent/runner.ts";
import { parseGraphYaml } from "./agent/graph.ts";

const temp = () => mkdtempSync(join(tmpdir(), "vitris-kit-upgrade-"));
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
function setup() {
  const site = temp(), target = temp();
  mkdirSync(join(site, "agent/refs"), { recursive: true });
  mkdirSync(join(site, "pages"));
  mkdirSync(join(target, "agent/refs"), { recursive: true });
  writeFileSync(join(site, "site.json"), '{"siteId":"fictional-upgrade","name":"Test","slug":"test"}');
  writeFileSync(join(site, "pages/index.html"), '<h1 id="headline">Before</h1>');
  writeFileSync(join(target, "package.json"), '{"name":"@vitris/harness","version":"0.1.0"}');
  for (const root of [site, target]) {
    writeFileSync(join(root, "agent/graph.yaml"), 'version: 3\nstop_at: preview\nnodes:\n  - id: preview\n    kind: agent\n    needs: []\n    refs: [refine]\n    writes: [pages/index.html]\n    eval: preview\n');
    writeFileSync(join(root, "agent/PROMPT.md"), "Original prompt");
    writeFileSync(join(root, "agent/refs/refine.md"), "Original refinement guidance");
  }
  save(join(site, "agent/STATE.json"), { version: 3, status: "done", current: null, preview_ready: true, launched: false,
    iteration: 4, nodes: { preview: { status: "done", attempts: 2 } } });
  recordManagedKit(site, target);
  return { site, target };
}

test("managed update preserves authored source and progress; rollback restores kit, then ordinary edits work", () => {
  const { site, target } = setup();
  const beforeSource = sourceRevision(site).digest;
  writeFileSync(join(target, "agent/refs/refine.md"), "Improved refinement guidance");
  assert.equal(resolveManagedInstruction(site, target, "refs/refine.md"), "Original refinement guidance");
  const plan = planKitUpgrade(site, target);
  assert.deepEqual(plan.updates, ["refs/refine.md"]);
  assert.equal(plan.conflicts.length, 0);
  applyKitUpgrade(site, target, plan);
  assert.equal(resolveManagedInstruction(site, target, "refs/refine.md"), "Improved refinement guidance");
  assert.equal(sourceRevision(site).digest, beforeSource);
  assert.equal(JSON.parse(readFileSync(join(site, "agent/STATE.json"), "utf8")).nodes.preview.status, "done");
  rollbackKitUpgrade(site);
  assert.equal(readFileSync(join(site, "agent/refs/refine.md"), "utf8"), "Original refinement guidance");
  writeFileSync(join(site, "pages/index.html"), '<h1 id="headline">After</h1>');
  assert.notEqual(sourceRevision(site).digest, beforeSource);
});

test("unknown copied-kit provenance and customized instructions are preserved as conflicts", () => {
  const { site, target } = setup();
  writeFileSync(join(site, "agent/refs/refine.md"), "Site-specific instructions");
  writeFileSync(join(target, "agent/refs/refine.md"), "Package update");
  const plan = planKitUpgrade(site, target);
  assert.ok(plan.conflicts.some(conflict => conflict.path === "refs/refine.md"));
  assert.throws(() => applyKitUpgrade(site, target, plan), /conflict/);
  assert.equal(readFileSync(join(site, "agent/refs/refine.md"), "utf8"), "Site-specific instructions");
  const older = temp();
  cpSync(resolve("src/test/fixtures/engine-compat/older-copied-kit"), older, { recursive: true });
  writeFileSync(join(target, "agent/refs/local-pages.md"), "Updated package guidance");
  assert.ok(planKitUpgrade(older, target).conflicts.some(conflict => conflict.reason === "Unknown copied-kit provenance"));
});

test("interrupted managed copy recovers only matching bytes", () => {
  const { site } = setup();
  const old = readFileSync(join(site, "agent/refs/refine.md"), "utf8");
  const changed = "Partially installed guidance";
  const backup = join(site, "agent-backups/interrupted");
  mkdirSync(join(backup, "refs"), { recursive: true });
  writeFileSync(join(backup, "refs/refine.md"), old);
  cpSync(join(site, "agent/managed-files.json"), join(backup, "managed-files.json"));
  writeFileSync(join(site, "agent/refs/refine.md"), changed);
  save(join(site, "agent/kit-upgrade-journal.json"), { schemaVersion: 1, phase: "installing", backup,
    changed: ["refs/refine.md"], priorHashes: { "refs/refine.md": sha(old) }, targetHashes: { "refs/refine.md": sha(changed) } });
  assert.equal(recoverKitUpgrade(site).status, "recovered");
  assert.equal(readFileSync(join(site, "agent/refs/refine.md"), "utf8"), old);
  assert.equal(existsSync(join(site, "agent/kit-upgrade-journal.json")), false);
});

test("a previous upgrade receipt cannot settle a later interrupted transaction", () => {
  const { site, target } = setup();
  writeFileSync(join(target, "agent/PROMPT.md"), "v2 prompt");
  applyKitUpgrade(site, target, planKitUpgrade(site, target));
  const priorReceipt = readFileSync(join(site, "agent/kit-upgrade-receipt.json"), "utf8");
  const priorPrompt = readFileSync(join(site, "agent/PROMPT.md"), "utf8");
  const priorRef = readFileSync(join(site, "agent/refs/refine.md"), "utf8");
  const backup = join(site, "agent-backups/interrupted-second");
  mkdirSync(join(backup, "refs"), { recursive: true });
  writeFileSync(join(backup, "PROMPT.md"), priorPrompt);
  writeFileSync(join(backup, "refs/refine.md"), priorRef);
  cpSync(join(site, "agent/managed-files.json"), join(backup, "managed-files.json"));
  writeFileSync(join(site, "agent/PROMPT.md"), "v3 prompt");
  save(join(site, "agent/kit-upgrade-journal.json"), { schemaVersion: 1, transactionId: "second-transaction", phase: "installing",
    targetDigest: "new-target", targetVersion: "0.3.0", backup, changed: ["PROMPT.md", "refs/refine.md"],
    priorHashes: { "PROMPT.md": sha(priorPrompt), "refs/refine.md": sha(priorRef) },
    targetHashes: { "PROMPT.md": sha("v3 prompt"), "refs/refine.md": sha("v3 ref") } });
  assert.equal(recoverKitUpgrade(site).status, "recovered");
  assert.equal(readFileSync(join(site, "agent/PROMPT.md"), "utf8"), priorPrompt);
  assert.equal(readFileSync(join(site, "agent/refs/refine.md"), "utf8"), priorRef);
  assert.equal(readFileSync(join(site, "agent/kit-upgrade-receipt.json"), "utf8"), priorReceipt);
  assert.equal(recoverKitUpgrade(site).status, "nothing_to_recover");
});

test("effective instruction overrides change only consuming stage freshness", () => {
  const { site } = setup();
  const graph = parseGraphYaml(readFileSync(join(site, "agent/graph.yaml"), "utf8"));
  const node = graph.nodes[0]!;
  const beforeInput = inputHash(site, node);
  const beforeContract = instructionContractHash(site, node);
  mkdirSync(join(site, "agent/overrides/refs"), { recursive: true });
  writeFileSync(join(site, "agent/overrides/refs/refine.md"), "First override");
  assert.notEqual(inputHash(site, node), beforeInput);
  assert.notEqual(instructionContractHash(site, node), beforeContract);
  const first = inputHash(site, node);
  writeFileSync(join(site, "agent/overrides/refs/refine.md"), "Edited override");
  assert.notEqual(inputHash(site, node), first);
  const second = inputHash(site, node);
  writeFileSync(join(site, "agent/overrides/refs/unrelated.md"), "Unrelated override");
  assert.equal(inputHash(site, node), second);
});

test("a completed fictional creation graph upgrades and handles an ordinary structured refinement", { timeout: 60_000 }, async () => {
  const site = temp(), target = temp();
  cpSync(resolve("src/test/fixtures/active-agent-site"), site, { recursive: true });
  cpSync(join(site, "agent"), join(target, "agent"), { recursive: true });
  writeFileSync(join(target, "package.json"), '{"name":"@vitris/harness","version":"0.2.0"}');
  const stateBefore = readFileSync(join(site, "agent/STATE.json"), "utf8");
  const authoredBefore = readFileSync(join(site, "pages/index.html"), "utf8");
  recordManagedKit(site, target);
  writeFileSync(join(target, "agent/refs/refine.md"), "Improved fictional refinement guidance");
  const plan = planKitUpgrade(site, target);
  assert.ok(plan.updates.includes("refs/refine.md"));
  applyKitUpgrade(site, target, plan);
  assert.equal(readFileSync(join(site, "agent/STATE.json"), "utf8"), stateBefore);
  assert.equal(readFileSync(join(site, "pages/index.html"), "utf8"), authoredBefore);
  const baseRevision = sourceRevision(site).digest, requestId = "completed-site-headline";
  const request = { schemaVersion: 1, id: requestId, instruction: "Update the homepage headline", origin: "operator", baseRevision,
    requestedScopes: ["copy"], explicitPreferences: [], evidence: [] };
  const changePlan = { schemaVersion: 1, requestId, baseRevision, targets: ["/#home-title"], files: ["pages/index.html"],
    facets: ["copy"], preserve: [], acceptanceCriteria: [{ id: "headline", kind: "exact_text", target: "/#home-title", expected: "Know where the month stands now." }],
    requiredChecks: ["render-375", "render-1080"], assumptions: [], evidence: [], proposedBy: "active_agent" };
  prepareChange(site, request, changePlan);
  applyOperations(site, requestId, [{ kind: "set_text", file: "pages/index.html", elementId: "home-title", text: "Know where the month stands now." }]);
  const result = await verifyChange(site, requestId);
  assert.equal(result.technical, "pass", JSON.stringify(result.unresolved));
  assert.equal(result.fulfillment, "pass", JSON.stringify(result.unresolved));
  assert.equal(JSON.parse(readFileSync(join(site, "agent/STATE.json"), "utf8")).nodes.harvest.status, "done");
});
