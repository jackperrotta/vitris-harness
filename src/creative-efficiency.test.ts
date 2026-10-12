import {refreshFixtureCalibration} from "./agent/design-fixtures.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCreativeProfile, creativeRunStatusSnapshot } from "./agent/creative-profile.ts";
import { expandPacketItem } from "./agent/jev/packets.ts";
import { createCreativeEfficiencyPolicy } from "./agent/creative-efficiency.ts";
import { runCreativeRevision } from "./agent/creative-revision.ts";
import { buildCreativeContextPacket, CREATIVE_REPAIR_OBLIGATION, CREATIVE_REPAIR_SEMANTICS_HASH } from "./agent/creative-context.ts";
import { JevClient } from "./agent/jev/client.ts";
import { computeCalibrationMetrics, issueTrustedPilotContext, replaceCalibrationRegistryForTests, DATASET_VERSION, MODEL_FAMILY } from "./agent/jev/calibration.ts";
import { POLICY_VERSION } from "./agent/jev/policy.ts";
import { QUESTION_VERSION } from "./agent/jev/questions.ts";
import { kernelContractHash } from "./agent/design-copy.ts";
import { sourceHash } from "./agent/artifacts.ts";
import { creativePacketCoverageFailures, runCreativeObjective } from "./agent/creative-objective.ts";
import { creativeRenderBindings } from "./agent/creative-render-bindings.ts";
import { acceptedCreativeChangeContext, selectCreativeChangeContext } from "./agent/creative-change-context.ts";
import type { GraphNode } from "./agent/graph.ts";

const fixture = resolve("src/test/fixtures/active-agent-site");

async function prepare(mode: "off" | "shadow" | "assist", compact = true, malformed = false) {
  const root = mkdtempSync(join(tmpdir(), `vitris-efficiency-${mode}-`));
  cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
  const argv = ["node", "workflow.ts", "--site", root, "--creative-profile", "--max-cumulative", "120", "--creative-efficiency", "--jev-mode", mode, ...(compact ? [] : ["--no-compact-packets"])];
  let calls = 0;
  const jevFetch = async (_url: string, init?: RequestInit) => {
    calls++;
    if (malformed) return new Response(JSON.stringify({ answers: {} }), { status: 200, headers: { "content-type": "application/json" } });
    const request = JSON.parse(String(init?.body)) as { questions: Record<string, unknown> };
    const answers = Object.fromEntries(Object.keys(request.questions).map(key => {
      const selected = key === "skill" ? "s2" : key === "skill2" ? "none" : key === "evidence" ? "e0" : "copy";
      return [key, { type: "choice", choice: selected, confidence: 0.99, probabilities: { [selected]: 0.99, unknown: 0.01 } }];
    }));
    return new Response(JSON.stringify({ id: `synthetic-${calls}`, model: "jev-1.13.0", answers, usage: { input_tokens: 12, output_tokens: 3 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await runCreativeProfile(root, resolve("."), argv, mode === "off" ? {} : { jevFetch });
  return { root, argv, result, calls: () => calls, jevFetch };
}

test("creative efficiency off prepares a compact real packet with zero Jev calls and working expansion", { timeout: 90_000 }, async () => {
  const run = await prepare("off");
  try {
    assert.equal(run.result.run.phase, "planning", run.result.summary);
    assert.equal(run.calls(), 0);
    const current = readFileSync(join(run.root, "agent/CURRENT.md"), "utf8");
    assert.match(current, /Required evidence/);
    assert.match(current, /No tax claims|monthly reporting|bookkeeping/i);
    const nodeId = `${run.result.run.id}-plan`;
    const manifest = JSON.parse(readFileSync(join(run.root, "agent/runs", `${nodeId}.manifest.json`), "utf8"));
    assert.equal(manifest.coverageStatus, "requires_expansion");
    assert.ok(manifest.requiredExpansionIds.length);
    assert.ok(manifest.expandable.length);
    const log = join(run.root, "agent/runs/packet-expansions.log");
    assert.throws(() => expandPacketItem(run.root, nodeId, "missing", manifest.manifestHash), /not found/);
    assert.equal(existsSync(log), false);
    const expansionPath = join(run.root, manifest.expandable[0].path);
    const original = readFileSync(expansionPath, "utf8");
    writeFileSync(expansionPath, `${original}\nTampered after preparation`);
    assert.throws(() => expandPacketItem(run.root, nodeId, manifest.expandable[0].id, manifest.manifestHash), /hash|changed|integrity|mismatch/i);
    assert.equal(existsSync(log), false);
    writeFileSync(expansionPath, original);
    const expanded = expandPacketItem(run.root, nodeId, manifest.expandable[0].id, manifest.manifestHash.slice(0, 16));
    assert.ok(expanded.length > 0);
    assert.match(readFileSync(log, "utf8"), new RegExp(manifest.expandable[0].id));
    assert.equal(run.calls(), 0);
    const status = creativeRunStatusSnapshot(run.root, run.result.run.id) as { creativeEfficiency: { mode: string; workReplacement: string } };
    assert.equal(status.creativeEfficiency.mode, "off");
    assert.equal(status.creativeEfficiency.workReplacement, "agent_owned_uncalibrated_disabled");
  } finally { rmSync(run.root, { recursive: true, force: true }); }
});

test("a changed site override invalidates its prepared instruction and required expansion", { timeout: 90_000 }, async () => {
  const run = await prepare("off");
  try {
    const nodeId = `${run.result.run.id}-plan`;
    const manifest = JSON.parse(readFileSync(join(run.root, "agent/runs", `${nodeId}.manifest.json`), "utf8"));
    assert.ok(manifest.effectiveSkillHandles.some((item: { provenance: string }) => item.provenance.startsWith("site:") || item.provenance.startsWith("override:")));
    const overrideDir = join(run.root, "agent/overrides/refs");
    mkdirSync(overrideDir, { recursive: true });
    writeFileSync(join(overrideDir, "storyboard.md"), "# Customer-specific narrative rule\nShow the supported service boundary beside the offer.\n");
    assert.match(creativePacketCoverageFailures(run.root, nodeId).join("; "), /Effective creative instructions changed since preparation/);
  } finally { rmSync(run.root, { recursive: true, force: true }); }
});

test("malformed creative routing retains deterministic skills and records a fallback", { timeout: 90_000 }, async () => {
  const run = await prepare("assist", true, true);
  try {
    assert.equal(run.result.run.phase, "planning", run.result.summary);
    assert.ok(run.calls() > 0);
    const manifest = JSON.parse(readFileSync(join(run.root, "agent/runs", `${run.result.run.id}-plan.manifest.json`), "utf8"));
    assert.ok(manifest.selectedSkillIds.includes("media-direction"));
    assert.match(manifest.fallback || "", /Jev routing unavailable/);
    assert.match(readFileSync(join(run.root, "agent/CURRENT.md"), "utf8"), /Agent retains all obligations/);
  } finally { rmSync(run.root, { recursive: true, force: true }); }
});

test("oversized required creative context uses a named expansion and stays below the hard cap", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-mandatory-oversize-"));
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    const kernel = resolve("."), policy = createCreativeEfficiencyPolicy(root, ["--creative-efficiency", "--no-jev"]);
    const node: GraphNode = { id: "creative-oversize-test", kind: "agent", optional: true, needs: [], refs: [], tools: [], inputs: ["onboarding/business.json", "agent/runs/creative-oversize-test.manifest.json", "agent/runs/creative-oversize-test.expansions"], writes: ["agent/runs/creative-oversize-test.result.json"], eval: "creative", maxAttempts: 1 };
    const buildPacket = async () => (await buildCreativeContextPacket({ root, kernel, node, role: "plan", objective: "Check mandatory overflow", sourceRevision: sourceHash(root), baseContract: "Write the declared result", policy, config: policy.config, evidence: { schemaVersion: 1, inputHash: "synthetic-test-evidence", nodes: [], edges: [], unresolvedAliases: [] }, retrievedIds: [], mandatorySkillIds: [], optionalSkillIds: [], constraints: ["A".repeat(45_000)], obligations: ["Do not drop this constraint"], findings: [], renderIds: [] })).prompt;
    const prepared = await runCreativeObjective({ root, kernel, node, prompt: "", buildPacket, jevConfig: policy.config, evaluate: () => ({ failures: [] }) });
    assert.equal(prepared.paused, true);
    const manifest = JSON.parse(readFileSync(join(root, "agent/runs/creative-oversize-test.manifest.json"), "utf8"));
    assert.equal(manifest.coverageStatus, "requires_expansion");
    assert.ok(manifest.requiredExpansionIds.length > 0);
    assert.ok(manifest.visibleBytesEstimated < 40_000);
    assert.ok(manifest.requiredExpansionBytes >= 45_000);
    assert.match(creativePacketCoverageFailures(root, node.id).join("; "), /was not delivered/);
    for (const id of manifest.requiredExpansionIds) expandPacketItem(root, node.id, id, manifest.manifestHash);
    assert.deepEqual(creativePacketCoverageFailures(root, node.id), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("ordinary and compact prepared planning packets retain the same exploration method", { timeout: 90_000 }, async () => {
  const ordinary = await prepare("off", false), compact = await prepare("off", true);
  try {
    for (const run of [ordinary, compact]) {
      const current = readFileSync(join(run.root, "agent/CURRENT.md"), "utf8");
      assert.match(current, /Creative exploration method:/);
      assert.match(current, /business tension/);
      assert.match(current, /homepage and one consequential interior/);
      assert.match(current, /counterfactual/);
      assert.match(current, /two inexpensive studies/);
    }
    const compactNode = `${compact.result.run.id}-plan`;
    const manifest = JSON.parse(readFileSync(join(compact.root, "agent/runs", `${compactNode}.manifest.json`), "utf8"));
    assert.equal(manifest.visibleBytesEstimated, Buffer.byteLength(readFileSync(join(compact.root, "agent/CURRENT.md"))));
    assert.ok(manifest.visibleBytesEstimated < 21_000, `prepared packet ${manifest.visibleBytesEstimated} bytes; ${JSON.stringify(manifest.bytesBySection)}`);
    assert.ok(manifest.requiredExpansionBytes > 0, "site-owned prerequisite instructions remain required through explicit handles");
  } finally { rmSync(ordinary.root, { recursive: true, force: true }); rmSync(compact.root, { recursive: true, force: true }); }
});

test("large optional evidence is moved behind valid handles without obscuring required coverage", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-optional-overflow-"));
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    const policy = createCreativeEfficiencyPolicy(root, ["--creative-efficiency", "--no-jev"]);
    const node: GraphNode = { id: "creative-optional-test", kind: "agent", optional: true, needs: [], refs: [], tools: [], inputs: [], writes: ["agent/runs/creative-optional-test.result.json"], eval: "creative", maxAttempts: 1 };
    const evidence = { schemaVersion: 1 as const, inputHash: "optional-test", nodes: Array.from({ length: 6 }, (_, i) => ({ id: `source:optional-${i}`, kind: "source" as const, label: `Optional ${i}`, excerpt: `Long optional detail ${i}: ${"x".repeat(9_000)}`, sourcePath: `source-${i}.txt`, sourceHash: `hash-${i}`, provenance: "external_untrusted" as const })), edges: [], unresolvedAliases: [] };
    const packet = await buildCreativeContextPacket({ root, kernel: resolve("."), node, role: "plan", objective: "Design from the approved offer", sourceRevision: sourceHash(root), baseContract: "Write the declared result", policy, config: policy.config, evidence, retrievedIds: evidence.nodes.map(item => item.id), mandatorySkillIds: [], optionalSkillIds: [], constraints: ["Approved offer remains visible"], obligations: ["Complete plan"], findings: [], renderIds: [] });
    assert.equal(packet.manifest.coverageStatus, "requires_expansion");
    assert.ok((packet.manifest.requiredExpansionIds as string[]).includes("skill-motion"), "motion instruction delivery remains mandatory even with large optional evidence");
    assert.match(expandPacketItem(root, node.id, "skill-motion", packet.manifest.manifestHash), /Deliberate scroll motion/);
    assert.ok((packet.manifest.visibleBytesEstimated as number) < 40_000);
    assert.ok((packet.manifest.optionalExpansionBytes as number) > 9_000);
    assert.ok((packet.manifest.omittedEvidenceIds as string[]).length > 0);
    const id = packet.manifest.expandable.find(item => item.description.startsWith("optional: source:optional"))!.id;
    assert.match(expandPacketItem(root, node.id, id, packet.manifest.manifestHash), /Long optional detail/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("missing fact support and stale render receipts are explicitly incomplete", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-missing-evidence-"));
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    const policy = createCreativeEfficiencyPolicy(root, ["--creative-efficiency", "--no-jev"]);
    const node: GraphNode = { id: "creative-missing-test", kind: "critic", optional: true, needs: [], refs: [], tools: [], inputs: [], writes: ["agent/runs/creative-missing-test.result.json"], eval: "creative", maxAttempts: 1 };
    const evidence = { schemaVersion: 1 as const, inputHash: "missing-test", nodes: [{ id: "fact:unsupported", kind: "fact" as const, label: "Unsupported claim", sourcePath: "onboarding/business.json", sourceHash: "test", provenance: "derived" as const }], edges: [], unresolvedAliases: [] };
    const packet = await buildCreativeContextPacket({ root, kernel: resolve("."), node, role: "decision", objective: "Review claims and render", sourceRevision: sourceHash(root), baseContract: "Review", policy, config: policy.config, evidence, retrievedIds: [], requiredEvidenceIds: ["fact:unsupported"], mandatorySkillIds: [], optionalSkillIds: [], constraints: [], obligations: ["Review"], findings: [], renderIds: ["render:missing"] });
    assert.equal(packet.manifest.coverageStatus, "incomplete");
    assert.match((packet.manifest.missingRequired as string[]).join("; "), /supporting source excerpt/);
    assert.match((packet.manifest.missingRequired as string[]).join("; "), /render:missing/);
    assert.match(packet.prompt, /rerun render\/browser gate/);
    const bindings = creativeRenderBindings(root, "fixture", "decision", root, undefined, ["/"]);
    assert.ok(bindings.some(item => item.current));
    writeFileSync(join(root, "pages/index.html"), readFileSync(join(root, "pages/index.html"), "utf8") + "\n<!-- stale receipt test -->");
    assert.ok(creativeRenderBindings(root, "fixture", "decision", root, undefined, ["/"]).every(item => !item.current));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("study evidence reports an omitted candidate viewport as missing", () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-study-binding-"));
  try {
    const runId = "creative-study-coverage", runRoot = join(root, "agent/creative-runs", runId);
    mkdirSync(join(runRoot, "studies"), { recursive: true });
    writeFileSync(join(runRoot, "studies/one-home.html"), "<h1>Study</h1>");
    writeFileSync(join(runRoot, "render.json"), JSON.stringify({ subjectHash: "stale", checks: [{ candidate: "one-home", path: "onboarding/studies/one-home.html", width: 375, screenshot: "study-renders/one-home-375.png", screenshotHash: "stale", failures: [] }] }));
    const bindings = creativeRenderBindings(root, runId, "study-review");
    assert.ok(bindings.some(item => item.viewport === 1080 && !item.current && /absent from receipt/.test(item.reason || "")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("accepted page changes focus review while shared and unknown paths broaden it", () => {
  const plan = { objective: "Clarify proof", findingIndexes: [0], targets: ["/services/ hero"], skillIds: ["composition"], evidenceIds: ["fact:f-offer"], acceptance: ["Proof follows the offer"] };
  const routes = ["/", "/services/", "/services/detail/"];
  const local = selectCreativeChangeContext(["pages/services.html"], routes, plan, [{ observation: "Proof is buried" }], { changes: [{ target: "services hero", change: "Moved proof near the offer", acceptance: "Proof follows the offer" }] });
  assert.deepEqual(local.affectedRoutes, ["/services/"]);
  assert.match(local.findings[0]!, /Proof is buried/);
  assert.match(local.attemptedChanges[0]!, /Moved proof/);
  assert.deepEqual(selectCreativeChangeContext(["theme/base.css"], routes, plan).affectedRoutes, routes);
  assert.deepEqual(selectCreativeChangeContext(["pages/unknown.html"], routes, plan).affectedRoutes, routes);
});

test("accepted revision artifacts change the prepared review context", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-change-packet-"));
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    const id = "creative-source-change", round = 1;
    const base = join(root, "agent/runs", `${id}-revision-${round}`);
    mkdirSync(join(root, "agent/runs"), { recursive: true });
    const plan = { objective: "Move process proof closer to the offer", findingIndexes: [0], targets: ["/monthly-work/ included section"], skillIds: ["composition"], evidenceIds: ["fact:f-offer"], acceptance: ["Four supported steps precede the inquiry"] };
    writeFileSync(`${base}.adoption.json`, JSON.stringify({ changedAuthoredFiles: ["pages/monthly-work/index.html"] }));
    writeFileSync(`${base}.result.json`, JSON.stringify({ changes: [{ target: "monthly work sequence", change: "Moved the four supported steps before the CTA", acceptance: plan.acceptance[0] }] }));
    const change = acceptedCreativeChangeContext(root, id, round, ["/", "/monthly-work/", "/contact/"], plan, [{ observation: "The process was buried below the CTA" }])!;
    assert.deepEqual(change.affectedRoutes, ["/monthly-work/"]);
    const policy = createCreativeEfficiencyPolicy(root, ["--creative-efficiency", "--no-jev"]);
    const node: GraphNode = { id: "creative-change-review", kind: "critic", optional: true, needs: [], refs: [], tools: [], inputs: [], writes: ["agent/runs/creative-change-review.result.json"], eval: "creative", maxAttempts: 1 };
    const packet = await buildCreativeContextPacket({ root, kernel: resolve("."), node, role: "decision", objective: "Review the accepted repair", sourceRevision: sourceHash(root), baseContract: "Decide from current renders", policy, config: policy.config, evidence: { schemaVersion: 1, inputHash: "change-context", nodes: [], edges: [], unresolvedAliases: [] }, retrievedIds: [], mandatorySkillIds: [], optionalSkillIds: [], constraints: ["Keep the accepted business goal and selected identity"], obligations: ["Inspect a fresh current render"], findings: change.findings, renderIds: [], sourceChanges: [`Changed authored paths: ${change.changedPaths.join(", ")}`, `Affected routes: ${change.affectedRoutes.join(", ")} (${change.scope})`, ...change.attemptedChanges, ...change.acceptance.map(item => `Acceptance: ${item}`)] });
    const prepared = await runCreativeObjective({ root, kernel: resolve("."), node, prompt: "", buildPacket: async () => packet.prompt, jevConfig: policy.config, evaluate: () => ({ failures: [] }) });
    assert.equal(prepared.paused, true);
    const current = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
    assert.match(current, /pages\/monthly-work\/index\.html/);
    assert.match(current, /The process was buried below the CTA/);
    assert.match(current, /Moved the four supported steps before the CTA/);
    assert.match(current, /Four supported steps precede the inquiry/);
    assert.doesNotMatch(current, /Affected routes: \/, \/contact\//);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("creative assist routes an optional skill into CURRENT while shadow retains deterministic selection and resume reuses preparation", { timeout: 90_000 }, async () => {
  const off = await prepare("off"), shadow = await prepare("shadow"), assist = await prepare("assist");
  try {
    assert.equal(shadow.result.run.phase, "planning", shadow.result.summary);
    assert.equal(assist.result.run.phase, "planning", assist.result.summary);
    assert.ok(shadow.calls() > 0, "shadow evaluates the question");
    assert.ok(assist.calls() > 0, "assist evaluates the question");
    const shadowManifest = JSON.parse(readFileSync(join(shadow.root, "agent/runs", `${shadow.result.run.id}-plan.manifest.json`), "utf8"));
    const offManifest = JSON.parse(readFileSync(join(off.root, "agent/runs", `${off.result.run.id}-plan.manifest.json`), "utf8"));
    const assistManifest = JSON.parse(readFileSync(join(assist.root, "agent/runs", `${assist.result.run.id}-plan.manifest.json`), "utf8"));
    assert.deepEqual(shadowManifest.selectedSkillIds, offManifest.selectedSkillIds);
    assert.deepEqual(shadowManifest.retainedObligations, offManifest.retainedObligations);
    assert.ok(shadowManifest.selectedSkillIds.includes("media-direction"), JSON.stringify(shadowManifest.selectedSkillIds));
    assert.ok(assistManifest.selectedSkillIds.includes("purposeful-interaction"), JSON.stringify(assistManifest.selectedSkillIds));
    assert.match(readFileSync(join(assist.root, "agent/CURRENT.md"), "utf8"), /purposeful-interaction/);
    const callsBefore = assist.calls();
    const resumed = await runCreativeProfile(assist.root, resolve("."), assist.argv, { jevFetch: assist.jevFetch });
    assert.equal(resumed.run.id, assist.result.run.id);
    assert.equal(assist.calls(), callsBefore);
    const policyPath = join(assist.root, "agent/creative-runs", assist.result.run.id, "efficiency-policy.json");
    assert.ok(existsSync(policyPath));
    await assert.rejects(runCreativeProfile(assist.root, resolve("."), [...assist.argv, "--no-jev"], { jevFetch: assist.jevFetch }), /frozen run policy/);
  } finally {
    rmSync(off.root, { recursive: true, force: true });
    rmSync(shadow.root, { recursive: true, force: true });
    rmSync(assist.root, { recursive: true, force: true });
  }
});

test("revision replacement removes only the calibrated repair classification in an explicit test pilot", { timeout: 90_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-calibrated-revision-"));
  let restore = () => {};
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    const kernel = resolve(".");
    const policy = createCreativeEfficiencyPolicy(root, ["--creative-efficiency", "--jev-work-ownership", "delegated"]);
    const config = { ...policy.config, endpoint: undefined };
    let calls = 0;
    const client = new JevClient({ root, apiKey: "synthetic-test-only", config, fetch: async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init?.body)) as { questions: Record<string, unknown> };
      const answers = Object.fromEntries(Object.keys(request.questions).map(key => {
        const selected = key === "repair" ? "copy" : key === "skill" ? "s0" : key === "skill2" ? "none" : "e0";
        return [key, { type: "choice", choice: selected, confidence: 0.99, probabilities: { [selected]: 0.99, unknown: 0.01 } }];
      }));
      return new Response(JSON.stringify({ id: `synthetic-${calls}`, model: "jev-1.13.0", answers, usage: { input_tokens: 15, output_tokens: 4 } }), { status: 200, headers: { "content-type": "application/json" } });
    } });
    const metrics = computeCalibrationMetrics({ tp: 40, fp: 0, tn: 60, fn: 0, maxAllowedFalsePassRate: 0.02, minSampleSize: 30 });
    restore = replaceCalibrationRegistryForTests([{ schemaVersion: 1, issuer: "vitris-kernel", taskId: "creative-revision-domain", taskVersion: QUESTION_VERSION, questionSemanticsHash: CREATIVE_REPAIR_SEMANTICS_HASH, policyVersion: POLICY_VERSION, modelFamily: MODEL_FAMILY, datasetVersion: DATASET_VERSION, sampleSize: 100, metrics, thresholds: { grounding: 0.85, routing: 0.8 }, eligible: true, pilotOnly: true, expiresAt: "2099-01-01T00:00:00.000Z", revalidation: { afterDays: 30, requiresHeldoutRerun: true }, notes: "Synthetic test fixture; not production calibration" }]);
    const pilotContext = issueTrustedPilotContext({ trialId: "synthetic-revision", kernelRevision: kernelContractHash(kernel), allowedTaskIds: ["creative-revision-domain"] });
    const result = await runCreativeRevision({ root, kernel, runId: "creative-calibration", round: 1, beforeRevision: sourceHash(root), plan: { objective: "Clarify hierarchy", findingIndexes: [0], targets: ["home hero"], skillIds: ["composition"], evidenceIds: ["fact:f-offer"], acceptance: ["Offer first"] }, findings: [{ observation: "The offer is hard to find" }], efficiency: { policy, config, client, pilotContext } });
    assert.equal(result.paused, true);
    const nodeId = "creative-calibration-revision-1";
    const manifest = JSON.parse(readFileSync(join(root, "agent/runs", `${nodeId}.manifest.json`), "utf8"));
    assert.deepEqual(manifest.coveredObligations, [CREATIVE_REPAIR_OBLIGATION], JSON.stringify(manifest));
    assert.ok(manifest.retainedObligations.includes("Revise authored source jointly"));
    assert.ok(!manifest.retainedObligations.includes(CREATIVE_REPAIR_OBLIGATION));
    assert.match(readFileSync(join(root, "agent/CURRENT.md"), "utf8"), /Run fresh editorial, browser and visual reviews/);
    assert.ok(calls > 0);
  } finally { restore(); rmSync(root, { recursive: true, force: true }); }
});
