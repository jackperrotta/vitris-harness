import {refreshFixtureCalibration} from "./agent/design-fixtures.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildEvidenceIndex, connectedEvidence, retrieveCreativeEvidence, imagesForSection, proofForSection, sectionsAffectedByDecision, visitorQuestionsWithoutProof, type EvidenceIndex } from "./agent/creative-evidence.ts";
import { CREATIVE_SKILLS, selectedCreativeSkills, validateCreativeSkills } from "./agent/creative-skills.ts";
import { validateCreativeBrief, validateCreativeCandidates, validateCreativeDecision, validateCreativeFindings, type CreativeCandidate } from "./agent/creative-contract.ts";
import { creativeRunStatus, promoteCreativeRun, runCreativeProfile } from "./agent/creative-profile.ts";
import { sourceHash, fingerprint } from "./agent/artifacts.ts";
import { kernelContractHash } from "./agent/design-copy.ts";
import { freezeCreativeEvaluation, verifyCreativeEvaluation } from "./agent/creative-evaluation.ts";
import { runCreativeObjective } from "./agent/creative-objective.ts";
import { runCreativeRevision } from "./agent/creative-revision.ts";
import { validateCreativeFinalAudit, type CreativeRevisionPlan } from "./agent/creative-contract.ts";
import { assertCreativeBudget, type CreativeRun } from "./agent/creative-profile.ts";
import { loadState, reconcile } from "./agent/runner.ts";
import { loadSiteGraph } from "./agent/workflow.ts";
import type { GraphNode } from "./agent/graph.ts";

const fixture = resolve("src/test/fixtures/active-agent-site");
const brief = {
  schemaVersion: 1, audience: "Small service company owners", goal: "Understand monthly figures", goalKind: "information",
  differentiator: "Plain language review", strongestProof: "Documented monthly reporting", mediaOpportunities: [], constraints: ["No tax claims"],
  uncertainties: ["No conversion evidence"], emotionalCharacter: "Calm", links: [{ objective: "Explain monthly reporting", visitorTask: "Decide if bookkeeping fits", evidenceIds: ["fact:f-offer"], hypothesis: "A sample report builds confidence", observableOutcome: "Visitor locates a reporting example" }],
};
const candidate = (id: string, hypothesis: string): CreativeCandidate => ({
  schemaVersion: 1, id, centralIdea: `Show ${id} clearly`, experienceHypothesis: hypothesis, hierarchy: "Proof then process", narrative: "Question to answer", composition: `Editorial treatment ${id}`, imagery: "Report detail", typography: "Readable serif display", interaction: "Simple tabs", evidenceIds: ["fact:f-offer"], judgmentTask: "Find reporting example", risks: ["Sparse media"],
});

test("creative retrieval has exact hop depth, stable order and bounded packets", () => {
  const index: EvidenceIndex = { schemaVersion: 1, inputHash: "fixture", unresolvedAliases: [],
    nodes: ["a", "b", "c", "d"].map(id => ({ id, kind: "fact", label: id === "d" ? "booking goal" : id, sourcePath: "facts.json", sourceHash: "abc", provenance: "derived" })),
    edges: [["a", "b"], ["b", "c"], ["c", "d"]].map(([from, to]) => ({ from: from!, to: to!, relation: "supports", sourcePath: "facts.json", sourceHash: "abc" })) };
  assert.deepEqual(connectedEvidence(index, "a", 1).nodes.map(n => n.id), ["a", "b"]);
  assert.deepEqual(connectedEvidence({ ...index, edges: [...index.edges].reverse() }, "a", 1), connectedEvidence(index, "a", 1));
  assert.deepEqual(connectedEvidence(index, "a", 2).nodes.map(n => n.id), ["a", "b", "c"]);
  const packet = retrieveCreativeEvidence(index, { query: "booking", seedIds: ["a"], maxNodes: 2, maxChars: 500 });
  assert.equal(packet.nodes[0]!.id, "a");
  assert.equal(packet.nodes.length, 2);
  assert.ok(packet.chars <= 500);
  assert.throws(() => connectedEvidence(index, "a", -1), /depth/);
});

test("creative skills use effective site overrides and retain their provenance", () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-creative-override-"));
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    mkdirSync(join(root, "agent/overrides/refs"), { recursive: true });
    writeFileSync(join(root, "agent/overrides/refs/business.md"), "Customer-specific instruction: preserve the service name.");
    const skill = selectedCreativeSkills(["business-positioning"], root).expansions[0]!;
    assert.match(skill.text, /Customer-specific instruction/);
    assert.match(skill.provenance, /override/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("failed creative completion cannot be accepted or laundered through retry", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-creative-receipt-"));
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    const node: GraphNode = { id: "creative-test-objective", kind: "agent", optional: true, needs: [], refs: [], tools: [], inputs: ["onboarding/business.json"], writes: ["agent/runs/test-output.json"], eval: "creative", maxAttempts: 3 };
    const opts = { root, kernel: resolve("."), node, prompt: "Write the declared output only", evaluate: () => ({ failures: [] }) };
    assert.equal((await runCreativeObjective(opts)).paused, true);
    writeFileSync(join(root, "agent/runs/test-output.json"), "{}");
    writeFileSync(join(root, "pages/unauthorized.html"), "Unexpected source");
    assert.match((await runCreativeObjective(opts)).failures.join(";"), /Unauthorized/);
    assert.match((await runCreativeObjective(opts)).failures.join(";"), /Unauthorized/);
    assert.match((await runCreativeObjective({ ...opts, retry: true })).failures.join(";"), /Unauthorized/);
    rmSync(join(root, "pages/unauthorized.html"));
    assert.equal((await runCreativeObjective({ ...opts, retry: true })).paused, true);
    assert.deepEqual((await runCreativeObjective(opts)).failures, []);
    const accepted = await runCreativeObjective(opts);
    assert.equal(accepted.paused, false);
    assert.deepEqual(accepted.failures, []);
    writeFileSync(join(root, "agent/runs/test-output.json"), '{"tampered":true}');
    await assert.rejects(runCreativeObjective(opts), /Accepted creative objective changed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("expired creative preparations require explicit retry and metering receipts bind to the new preparation", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-creative-expiry-"));
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    const node: GraphNode = { id: "creative-expiry", kind: "agent", optional: true, needs: [], refs: [], tools: [], inputs: ["onboarding/business.json"], writes: ["agent/runs/expiry-output.json"], eval: "creative", maxAttempts: 3 };
    const opts = { root, kernel: resolve("."), node, prompt: "Write the declared output", evaluate: () => ({ failures: [] }) };
    const first = await runCreativeObjective(opts);
    const leasePath = join(root, "agent/leases/stage-creative-expiry.json");
    const lease = JSON.parse(readFileSync(leasePath, "utf8"));
    writeFileSync(leasePath, JSON.stringify({ ...lease, expiresAt: new Date(0).toISOString() }));
    assert.ok((await runCreativeObjective(opts)).failures.length);
    const renewed = await runCreativeObjective({ ...opts, retry: true });
    assert.equal(renewed.paused, true);
    assert.notEqual(renewed.preparationId, first.preparationId);
    const usageReceiptPath = join(root, "agent/runs/host-test-receipt.json");
    const receipt = { schemaVersion: 1, source: "host_export", preparationId: first.preparationId, inputTokens: 10, outputTokens: 20 };
    writeFileSync(usageReceiptPath, JSON.stringify(receipt));
    await assert.rejects(runCreativeObjective({ ...opts, usageReceiptPath }), /matching preparationId/);
    // Synthetic metering is confined to this temporary regression fixture.
    writeFileSync(usageReceiptPath, JSON.stringify({ ...receipt, preparationId: renewed.preparationId }));
    const before = loadState(root, loadSiteGraph(root)).cumulativeSpend?.inputTokens || 0;
    writeFileSync(join(root, "agent/runs/expiry-output.json"), "{}");
    assert.deepEqual((await runCreativeObjective({ ...opts, usageReceiptPath })).failures, []);
    assert.equal(loadState(root, loadSiteGraph(root)).cumulativeSpend?.inputTokens, before + 10);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("joint creative revision adopts authoring contracts and invalidates every downstream approval", async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-creative-joint-"));
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    const beforeRevision = sourceHash(root);
    const plan: CreativeRevisionPlan = { objective: "Clarify the offer hierarchy", findingIndexes: [0], targets: ["home hero"], skillIds: ["copy-layout"], evidenceIds: ["fact:f-offer"], acceptance: ["The offer precedes supporting content"] };
    const opts = { root, kernel: resolve("."), runId: "creative-joint", round: 1, beforeRevision, plan };
    const prepared = await runCreativeRevision(opts);
    assert.equal(prepared.paused, true);
    writeFileSync(join(root, "pages/index.html"), readFileSync(join(root, "pages/index.html"), "utf8") + "\n<!-- synthetic regression revision -->");
    const sharedCss = join(root, "components/harbor-shell/styles.css");
    writeFileSync(sharedCss, readFileSync(sharedCss, "utf8") + "\n/* synthetic shared dependency revision */");
    writeFileSync(join(root, "agent/runs/creative-joint-revision-1.result.json"), JSON.stringify({ schemaVersion: 1, beforeRevision, changes: [{ target: "home hero", change: "Synthetic source mutation for lifecycle test", acceptance: plan.acceptance[0] }], remainingRisks: ["Test fixture, no claimed aesthetic improvement"] }));
    const accepted = await runCreativeRevision(opts);
    assert.deepEqual(accepted.failures, []);
    const adoption = JSON.parse(readFileSync(join(root, "agent/runs/creative-joint-revision-1.adoption.json"), "utf8"));
    assert.ok(adoption.changedAuthoredFiles.includes("components/harbor-shell/styles.css"));
    assert.equal(adoption.reviewScope, "all_declared_routes_shared_dependency");
    const graph = loadSiteGraph(root), state = loadState(root, graph);
    for (const id of ["direction", "storyboard", "copy", "representative"]) assert.equal(state.nodes[id]!.status, "done", id);
    for (const id of ["direction-review", "copy-review", "representative-browser", "representative-review", "representative-quality", "browser", "visual-review"]) assert.equal(state.nodes[id]!.status, "pending", id);
    reconcile(root, graph, state);
    for (const id of ["direction", "storyboard", "copy", "representative"]) assert.equal(state.nodes[id]!.status, "done", `reconciled ${id}`);
    assert.equal(state.preview_ready, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("creative budgets reserve completion and fail closed on unknown token usage", () => {
  const run = { spentIterations: 12, spentDurationMs: 400, spentTokens: 50, limits: { iterations: 20, durationMs: 1000, tokens: 100 } } as CreativeRun;
  assertCreativeBudget(run, 7);
  assert.throws(() => assertCreativeBudget(run, 8), /reserving/);
  assert.throws(() => assertCreativeBudget({ ...run, hasUnknownUsage: true }), /unmetered/);
  assert.throws(() => assertCreativeBudget({ ...run, spentTokens: 100 }), /token budget/);
  assert.throws(() => assertCreativeBudget({ ...run, spentDurationMs: 1000 }), /duration budget/);
});

test("final creative audit requires exact identity, current evidence and explicit limitations", () => {
  const audit = { schemaVersion: 1, sourceRevision: "current", identity: [{ invariant: "Report-first hierarchy", outcome: "preserved", observation: "The report opens both pages", evidenceIds: ["render:final"] }], journeys: [{ task: "Book", outcome: "unverified", observation: "No live booking was performed", evidenceIds: [] }], limitations: ["No conversion measurement"], blockers: [] };
  assert.deepEqual(validateCreativeFinalAudit(audit, "current", ["Report-first hierarchy"], new Set(["render:final"])), []);
  assert.match(validateCreativeFinalAudit(audit, "changed", ["Report-first hierarchy"], new Set()).join(";"), /stale/);
  assert.match(validateCreativeFinalAudit({ ...audit, blockers: ["Mobile primary action is obscured"] }, "current", ["Report-first hierarchy"], new Set(["render:final"])).join(";"), /Unresolved final blocker/);
});

for (const repair of [false, true]) test(`final creative audit ${repair ? "dispatches a bounded repair" : "completes the verified preview"}`, async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-creative-final-")), id = "creative-final";
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    const base = join(root, "agent/creative-runs", id), child = join(base, "candidates/one");
    cpSync(fixture, child, { recursive: true });
    writeFileSync(join(child, "agent/creative-identity.json"), JSON.stringify({ identityInvariants: ["Report hierarchy"] }));
    writeFileSync(join(base, "brief.json"), JSON.stringify(brief));
    writeFileSync(join(base, "candidates.json"), JSON.stringify([candidate("one", "Reports explain the offer"), candidate("two", "Questions explain the offer")]));
    const revision = sourceHash(child);
    writeFileSync(join(base, "manifest.json"), JSON.stringify({ schemaVersion: 1, orchestratorVersion: 2, id, phase: "final_review", createdAt: new Date().toISOString(), kernelHash: kernelContractHash(resolve(".")), parentSourceHash: sourceHash(root), child, candidateId: "one", candidateRevision: revision, finalSourceHash: revision, qualified: { one: { root: child, revision } }, studyOrder: ["one", "two"], tried: ["one"], spentIterations: 0, limits: { iterations: 120, durationMs: 0, tokens: null } }));
    const argv = ["node", "workflow.ts", "--creative-run", id, "--no-preview-server"];
    const first = await runCreativeProfile(root, resolve("."), argv);
    assert.equal(first.run.phase, "final_review", first.summary);
    assert.equal(first.paused, true);
    const finalCurrent = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
    assert.match(finalCurrent, /Final creative audit method:/);
    assert.match(finalCurrent, /Inspect the full rendered site at phone and desktop widths/);
    assert.match(finalCurrent, /Skeptic: challenge the strongest conclusion/);
    assert.match(finalCurrent, /Selected creative identity/);
    const renderId = `render:agent/creative-runs/${id}/candidates/one/agent/screenshots/browser/home-375.png`;
    const audit = { schemaVersion: 1, sourceRevision: revision, identity: [{ invariant: "Report hierarchy", outcome: "preserved", observation: "Synthetic audit for routing regression", evidenceIds: [renderId] }], journeys: [{ task: brief.links[0]!.visitorTask, outcome: "unverified", observation: "No task performance claimed by this test", evidenceIds: [] }], limitations: ["Synthetic regression"], blockers: repair ? ["Home hierarchy needs a targeted revision"] : [], ...(repair ? { revisionPlan: { objective: "Clarify home hierarchy", findingIndexes: [0], targets: ["home hero"], skillIds: ["composition"], evidenceIds: [renderId], acceptance: ["Offer is first"] } } : {}) };
    writeFileSync(join(base, "final-review.json"), JSON.stringify(audit));
    const result = await runCreativeProfile(root, resolve("."), argv);
    assert.equal(result.run.phase, repair ? "revision" : "complete", result.summary);
    assert.equal(result.paused, repair);
    if (repair) {
      assert.equal(result.run.revision?.returnTo, "expansion");
      const objective = JSON.parse(readFileSync(join(child, "agent/runs/creative-final-revision-1.objective.json"), "utf8"));
      assert.deepEqual(objective.findings, audit.blockers);
      assert.ok(objective.evidence.nodes.some((n: { id: string }) => n.id === renderId));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const action of ["revise", "challenge", "retire"] as const) test(`creative decision routes ${action} without an operator selection gate`, async () => {
  const root = mkdtempSync(join(tmpdir(), "vitris-creative-action-")), id = "creative-actions";
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    const base = join(root, "agent/creative-runs", id), child = join(base, "candidates/one");
    cpSync(fixture, child, { recursive: true });
    // Child two is intentionally unfinished: the coordinator must hand off its production work.
    cpSync(fixture, join(base, "candidates/two"), { recursive: true });
    for (const name of ["one", "two"]) writeFileSync(join(base, `candidates/${name}/package.json`), '{"name":"test-child"}');
    const graph = loadSiteGraph(join(base, "candidates/two"));
    const childState = loadState(join(base, "candidates/two"), graph);
    for (const node of graph.nodes.slice(graph.nodes.findIndex(n => n.id === "direction"))) childState.nodes[node.id] = { status: "pending", attempts: 0 };
    childState.preview_ready = false;
    writeFileSync(join(base, "candidates/two/agent/STATE.json"), JSON.stringify(childState));
    writeFileSync(join(base, "brief.json"), JSON.stringify(brief));
    writeFileSync(join(base, "candidates.json"), JSON.stringify([candidate("one", "Reports explain the offer"), candidate("two", "Questions explain the offer")]));
    const revision = sourceHash(child);
    writeFileSync(join(base, "manifest.json"), JSON.stringify({ schemaVersion: 1, orchestratorVersion: 2, id, phase: "selection", createdAt: new Date().toISOString(), kernelHash: kernelContractHash(resolve(".")), parentSourceHash: sourceHash(root), child, candidateId: "one", candidateRevision: revision, qualified: { one: { root: child, revision } }, candidateOutcomes: {}, studyOrder: ["one", "two"], tried: ["one"], spentIterations: 0, limits: { iterations: 120, durationMs: 0, tokens: null } }));
    const argv = ["node", "workflow.ts", "--creative-run", id, "--no-preview-server"];
    const first = await runCreativeProfile(root, resolve("."), argv);
    assert.equal(first.run.phase, "selection", first.summary);
    const renderId = `render:agent/creative-runs/${id}/candidates/one/agent/screenshots/representative-browser/home-375.png`;
    writeFileSync(join(base, "findings.json"), JSON.stringify([{ schemaVersion: 1, candidateId: "one", source: "observed", page: "/", viewport: 375, state: "initial", section: "hero", observation: "Synthetic routing observation", hypothesis: "Hierarchy can clarify the offer", expectedImprovement: "Offer is encountered first", evidenceIds: [renderId] }]));
    writeFileSync(join(base, "decision.json"), JSON.stringify({ schemaVersion: 1, action, reason: "Exercise the explicit routing contract", selectedCandidateId: "one", candidateRevision: revision, observations: ["Synthetic lifecycle test"], tradeoffs: ["Not an aesthetic evaluation"], counterarguments: ["Other concept remains unqualified"], identityInvariants: ["Report hierarchy"], confidenceLimitations: ["No preference measured"], rejectedCandidateIds: [], evidenceIds: [renderId], challengerCandidateId: "two", revisionPlan: { objective: "Clarify hierarchy", findingIndexes: [0], targets: ["home hero"], skillIds: ["composition"], evidenceIds: [renderId], acceptance: ["Offer appears first"] } }));
    const result = await runCreativeProfile(root, resolve("."), argv);
    assert.equal(result.run.phase, action === "revise" ? "revision" : "representative", result.summary);
    assert.equal(result.paused, true);
    if (action === "challenge") assert.ok(result.run.qualified?.one, "incumbent retained");
    if (action === "retire") assert.equal(result.run.qualified?.one, undefined, "retired source cannot be selected");
    if (action === "revise") assert.equal(result.run.revisionCount, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("creative records enforce grounded distinct hypotheses and exact selection revision", () => {
  assert.throws(() => creativeRunStatus(fixture, "../outside"), /Invalid creative run ID/);
  assert.deepEqual(validateCreativeBrief(brief), []);
  const concepts = [candidate("one", "Explain through a sample report"), candidate("two", "Explain through a guided process")];
  assert.deepEqual(validateCreativeCandidates(concepts, new Set(["fact:f-offer"])), []);
  assert.match(validateCreativeCandidates([concepts[0], { ...concepts[1], experienceHypothesis: concepts[0]!.experienceHypothesis }], new Set(["fact:f-offer"])).join(";"), /different experience hypotheses/);
  const decision = { schemaVersion: 1, selectedCandidateId: "one", candidateRevision: "abc", observations: ["Desktop proof is clear"], tradeoffs: ["Image is sparse"], counterarguments: ["Second idea may clarify process"], identityInvariants: ["Keep report framing"], confidenceLimitations: ["Self-review only"], rejectedCandidateIds: ["two"], evidenceIds: ["fact:f-offer"] };
  assert.deepEqual(validateCreativeDecision(decision, concepts, { one: "abc" }, new Set(["fact:f-offer"])), []);
  assert.match(validateCreativeDecision({ ...decision, candidateRevision: "stale" }, concepts, { one: "abc" }, new Set(["fact:f-offer"])).join(";"), /revision/);
  assert.match(validateCreativeFindings([{ schemaVersion: 1, candidateId: "one", source: "observed", page: "/", viewport: 375, state: "initial", section: "hero", observation: "Weak hierarchy", hypothesis: "Heading scale is too small", expectedImprovement: "Heading leads the first view", evidenceIds: ["fact:f-offer"] }], concepts, new Set(["fact:f-offer"])).join(";"), /render evidence ID/);
});

test("skill prerequisites are acyclic and advisory relationships can be cyclic", () => {
  assert.deepEqual(validateCreativeSkills(CREATIVE_SKILLS), []);
  const modified = CREATIVE_SKILLS.map(s => s.id === "business-positioning" ? { ...s, prerequisites: ["visual-critique"] } : s);
  assert.match(validateCreativeSkills(modified).join(";"), /cycle/);
  const selected = selectedCreativeSkills(["visual-critique"], fixture);
  assert.ok(selected.descriptions.some(s => s.id === "business-positioning"));
  assert.ok(selected.expansions.every(s => s.hash.length === 64));
});

test("site evidence index keeps provenance and is deterministic without alias merging", () => {
  const index = buildEvidenceIndex(fixture);
  assert.equal(index.schemaVersion, 1);
  assert.ok(index.nodes.some(n => n.id === "fact:f-offer" && n.provenance === "derived"));
  assert.ok(index.edges.some(e => e.from === "source:e-offer" && e.to === "fact:f-offer" && e.relation === "supports"));
  assert.deepEqual(buildEvidenceIndex(fixture), index);
  assert.ok(connectedEvidence(index, "fact:f-offer").nodes.some(n => n.id === "source:e-offer"));
  assert.ok(proofForSection(index, "section:/:home-offer").some(n => n.id === "source:e-offer"));
  assert.deepEqual(imagesForSection(index, "section:/:home-offer"), []);
  assert.ok(sectionsAffectedByDecision(index, "decision:d-type").some(n => n.id === "section:/:home-offer"));
  const temp = mkdtempSync(join(tmpdir(), "vitris-creative-evidence-"));
  try {
    mkdirSync(join(temp, "onboarding"));
    writeFileSync(join(temp, "onboarding/business.json"), JSON.stringify({ evidence: [{ id: "same", source: "one", excerpt: "A" }, { id: "same", source: "two", excerpt: "B" }], facts: [], uncertainties: [] }));
    writeFileSync(join(temp, "onboarding/storyboard.json"), JSON.stringify({ pages: [{ path: "/", sections: [{ id: "claims", question: "Can I verify this claim?", facts: [] }] }] }));
    const duplicate = buildEvidenceIndex(temp);
    assert.deepEqual(duplicate.unresolvedAliases, ["source:same"]);
    assert.deepEqual(duplicate.nodes.filter(n => n.id.startsWith("source:same")).map(n => n.id), ["source:same", "source:same~2"]);
    assert.deepEqual(visitorQuestionsWithoutProof(duplicate), [{ sectionId: "section:/:claims", questionId: "need:/:claims", question: "Can I verify this claim?" }]);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("creative source promotion rejects a stale parent and is idempotent after verification", () => {
  const temp = mkdtempSync(join(tmpdir(), "vitris-creative-promote-"));
  const root = join(temp, "parent"), child = join(temp, "selected"), id = "creative-test";
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    cpSync(fixture, child, { recursive: true });
    writeFileSync(join(child, "pages/index.html"), "<h1>Selected source</h1>");
    const runDir = join(root, "agent/creative-runs", id);
    mkdirSync(runDir, { recursive: true });
    const run = { schemaVersion: 1, id, phase: "complete", child, parentSourceHash: sourceHash(root), finalSourceHash: sourceHash(child) };
    writeFileSync(join(runDir, "manifest.json"), JSON.stringify(run));
    writeFileSync(join(root, "pages/index.html"), "<h1>Unexpected parent edit</h1>");
    assert.throws(() => promoteCreativeRun(root, id), /Parent source changed/);
    run.parentSourceHash = sourceHash(root);
    writeFileSync(join(runDir, "manifest.json"), JSON.stringify(run));
    const first = promoteCreativeRun(root, id);
    assert.equal(sourceHash(root), sourceHash(child));
    const second = promoteCreativeRun(root, id);
    assert.deepEqual(second, first);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("creative run resumes an accepted plan and renders studies without a second agent session", { timeout: 90_000 }, async () => {
  const temp = mkdtempSync(join(tmpdir(), "vitris-creative-resume-"));
  const root = join(temp, "site"), argv = ["node", "workflow.ts", "--site", root, "--creative-profile", "--max-cumulative", "120", "--reason", "fixture copy"];
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    mkdirSync(join(root, "media"), { recursive: true });
    writeFileSync(join(root, "media/creative-local.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>');
    mkdirSync(join(root, "agent/overrides/refs"), { recursive: true });
    writeFileSync(join(root, "agent/overrides/refs/compose.md"), "Retain the customer's documented composition constraint.");
    const first = await runCreativeProfile(root, resolve("."), argv);
    assert.equal(first.run.phase, "planning", first.summary);
    assert.equal(first.paused, true);
    const base = join(root, "agent/creative-runs", first.run.id);
    writeFileSync(join(base, "brief.json"), JSON.stringify(brief));
    const concepts = [candidate("one", "Explain through a sample report"), candidate("two", "Explain through guided questions")];
    writeFileSync(join(base, "candidates.json"), JSON.stringify(concepts));
    mkdirSync(join(base, "studies"));
    writeFileSync(join(base, "studies/study.css"), "body { color: #123456; }");
    for (const concept of concepts) for (const kind of ["home", "interior"]) writeFileSync(join(base, "studies", `${concept.id}-${kind}.html`), `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/onboarding/studies/study.css"><h1>${concept.id} ${kind}</h1><img src="/media/creative-local.svg" alt="Local test asset"></html>`);
    const resumed = await runCreativeProfile(root, resolve("."), argv);
    assert.equal(resumed.run.id, first.run.id);
    assert.equal(resumed.run.phase, "study_review", resumed.summary);
    assert.equal(resumed.paused, true);
    assert.match(readFileSync(join(root, "agent/CURRENT.md"), "utf8"), /Use these reasoning passes sequentially/);
    assert.match(readFileSync(join(root, "agent/CURRENT.md"), "utf8"), /actual render ID/);
    assert.match(readFileSync(join(root, "agent/CURRENT.md"), "utf8"), /Art director: inspect hierarchy/);
    const report = JSON.parse((await import("node:fs")).readFileSync(join(base, "render.json"), "utf8")) as { checks: { failures: string[] }[] };
    assert.equal(report.checks.length, 8);
    assert.ok(report.checks.every(check => !check.failures.length), JSON.stringify(report.checks));
    const pending = JSON.parse((await import("node:fs")).readFileSync(join(root, "agent/runs", `creative-stage-${first.run.id}.json`), "utf8")) as { stage: string };
    assert.equal(pending.stage, "study-review");
    writeFileSync(join(base, "study-review.json"), JSON.stringify({ schemaVersion: 1, order: ["one", "two"], observations: ["Synthetic study routing test"], counterarguments: ["No creative quality claim"], renderHash: fingerprint(root, [`agent/creative-runs/${first.run.id}/study-renders`]) }));
    const production = await runCreativeProfile(root, resolve("."), argv);
    assert.equal(production.run.phase, "representative", production.summary);
    assert.equal(production.paused, true);
    assert.match(readFileSync(join(production.run.child!, "media/creative-local.svg"), "utf8"), /<svg/);
    assert.match(readFileSync(join(production.run.child!, "agent/overrides/refs/compose.md"), "utf8"), /documented composition/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("qualified source advances to an automatic decision packet at its exact revision", { timeout: 90_000 }, async () => {
  const temp = mkdtempSync(join(tmpdir(), "vitris-creative-select-"));
  const root = join(temp, "site"), id = "creative-selection", child = join(root, "agent/creative-runs", id, "candidates", "one");
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    cpSync(fixture, child, { recursive: true });
    writeFileSync(join(child, "package.json"), JSON.stringify({ name: "fixture-child" }));
    const runDir = join(root, "agent/creative-runs", id);
    writeFileSync(join(runDir, "candidates.json"), JSON.stringify([candidate("one", "A monthly sequence clarifies the service"), candidate("two", "Questions clarify the service")]));
    writeFileSync(join(runDir, "manifest.json"), JSON.stringify({ schemaVersion: 1, id, phase: "representative", createdAt: new Date().toISOString(), kernelHash: kernelContractHash(resolve(".")), inputHash: "", parentSourceHash: sourceHash(root), studyOrder: ["one", "two"], tried: [], spentIterations: 0, limits: { iterations: 120, durationMs: 0, tokens: null } }));
    const result = await runCreativeProfile(root, resolve("."), ["node", "workflow.ts", "--site", root, "--creative-profile", "--creative-run", id, "--max-cumulative", "120"]);
    assert.equal(result.run.phase, "selection", result.summary);
    assert.equal(result.run.candidateId, "one");
    assert.equal(result.run.candidateRevision, sourceHash(child));
    assert.match(readFileSync(join(root, "agent/CURRENT.md"), "utf8"), /Use these reasoning passes sequentially/);
    const childIteration = (JSON.parse(readFileSync(join(child, "agent/STATE.json"), "utf8")) as { iteration: number }).iteration;
    assert.ok((result.run.candidateCeilings?.one || Infinity) < childIteration + 120, "representative keeps iterations for final stages");
    assert.equal(result.paused, true);
    const renderId = `render:${relative(root, join(child, "agent/screenshots/representative-browser/home-375.png")).replaceAll("\\", "/")}`;
    writeFileSync(join(runDir, "findings.json"), JSON.stringify([{ schemaVersion: 1, candidateId: "one", source: "observed", page: "/", viewport: 375, state: "initial", section: "hero", observation: "The verified fixture has a visible offer", hypothesis: "The offer supports orientation", expectedImprovement: "Retain the hierarchy during expansion", evidenceIds: [renderId, "fact:f-offer"] }]));
    writeFileSync(join(runDir, "decision.json"), JSON.stringify({ schemaVersion: 1, selectedCandidateId: "one", candidateRevision: result.run.candidateRevision, observations: ["The production representative passed its visual and browser gates"], tradeoffs: ["Sparse media limits proof"], counterarguments: ["The alternate could make scope easier to scan"], identityInvariants: ["Keep the supported service visible"], confidenceLimitations: ["Self-review, no human preference result"], rejectedCandidateIds: ["two"], evidenceIds: [renderId, "fact:f-offer"] }));
    const expansion = await runCreativeProfile(root, resolve("."), ["node", "workflow.ts", "--site", root, "--creative-profile", "--creative-run", id, "--max-cumulative", "120"]);
    assert.equal(expansion.run.phase, "expansion");
    assert.equal(expansion.paused, true);
    assert.equal(expansion.run.finalSourceHash, undefined);
    const identity = JSON.parse(readFileSync(join(child, "agent/creative-identity.json"), "utf8")) as { candidateRevision: string; identityInvariants: string[] };
    assert.equal(identity.candidateRevision, result.run.candidateRevision);
    assert.deepEqual(identity.identityInvariants, ["Keep the supported service visible"]);
    assert.match(readFileSync(join(child, "agent/CURRENT.md"), "utf8"), /Keep the supported service visible/);
    writeFileSync(join(child, "agent/creative-identity.json"), JSON.stringify({ ...identity, identityInvariants: ["Replace the identity"] }));
    const tampered = await runCreativeProfile(root, resolve("."), ["node", "workflow.ts", "--site", root, "--creative-profile", "--creative-run", id]);
    assert.equal(tampered.run.phase, "blocked");
    assert.match(tampered.summary, /identity changed/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("blocked creative run retries with a reason without resetting spend", { timeout: 60_000 }, async () => {
  const temp = mkdtempSync(join(tmpdir(), "vitris-creative-retry-"));
  const root = join(temp, "site"), id = "creative-retry-test";
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    const runDir = join(root, "agent/creative-runs", id);
    mkdirSync(runDir, { recursive: true });
    const run = { schemaVersion: 1, id, phase: "blocked", blockedFromPhase: "shared", blockKind: "tool", error: "tool_failure: browser unavailable", createdAt: new Date().toISOString(), kernelHash: kernelContractHash(resolve(".")), inputHash: "", parentSourceHash: sourceHash(root), studyOrder: [], tried: [], spentIterations: 4, observedIterations: { [root]: 81 }, spentDurationMs: 500, observedDurationMs: { [root]: 100 }, candidateCeilings: {}, candidateOutcomes: {}, limits: { iterations: 120, durationMs: 0, tokens: null } };
    writeFileSync(join(runDir, "manifest.json"), JSON.stringify(run));
    const withoutReason = await runCreativeProfile(root, resolve("."), ["node", "workflow.ts", "--creative-run", id, "--creative-retry"]);
    assert.equal(withoutReason.exitCode, 1);
    assert.equal(withoutReason.run.phase, "blocked");
    const retried = await runCreativeProfile(root, resolve("."), ["node", "workflow.ts", "--creative-run", id, "--creative-retry", "--reason", "Browser installed", "--max-cumulative", "120"]);
    assert.equal(retried.run.phase, "planning", retried.summary);
    assert.equal(retried.run.spentIterations, 4);
    assert.ok((retried.run.spentDurationMs || 0) >= 500);
    assert.equal(retried.paused, true);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("creative duration is shared across parent and production child", { timeout: 60_000 }, async () => {
  const temp = mkdtempSync(join(tmpdir(), "vitris-creative-duration-"));
  const root = join(temp, "site"), id = "creative-duration-test", child = join(root, "agent/creative-runs", id, "candidates", "one");
  try {
    cpSync(fixture, root, { recursive: true }); refreshFixtureCalibration(root,resolve("."));
    cpSync(fixture, child, { recursive: true });
    writeFileSync(join(child, "package.json"), JSON.stringify({ name: "fixture-child" }));
    const runDir = join(root, "agent/creative-runs", id);
    writeFileSync(join(runDir, "candidates.json"), JSON.stringify([candidate("one", "A monthly sequence clarifies the service"), candidate("two", "Questions clarify the service")]));
    writeFileSync(join(runDir, "manifest.json"), JSON.stringify({ schemaVersion: 1, id, phase: "representative", createdAt: new Date().toISOString(), kernelHash: kernelContractHash(resolve(".")), inputHash: "", parentSourceHash: sourceHash(root), studyOrder: ["one", "two"], tried: ["one"], candidateId: "one", child, spentIterations: 2, spentDurationMs: 1_000, observedIterations: { [root]: 81, [child]: 81 }, observedDurationMs: { [root]: 0, [child]: 0 }, limits: { iterations: 120, durationMs: 1_000, tokens: null } }));
    const result = await runCreativeProfile(root, resolve("."), ["node", "workflow.ts", "--site", root, "--creative-profile", "--creative-run", id]);
    assert.equal(result.run.phase, "blocked");
    assert.equal(result.run.blockKind, "budget");
    assert.match(result.summary, /duration budget exhausted/);
    assert.ok((result.run.spentDurationMs || 0) >= 1_000);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("prospective creative evaluation freezes matched arms and leaves human labels empty", () => {
  const temp = mkdtempSync(join(tmpdir(), "vitris-creative-eval-"));
  const rich = join(temp, "rich"), sparse = join(temp, "sparse"), out = join(temp, "protocol");
  try {
    mkdirSync(join(rich, "onboarding"), { recursive: true });
    mkdirSync(join(sparse, "onboarding"), { recursive: true });
    writeFileSync(join(rich, "onboarding/brief.json"), '{"case":"rich"}');
    writeFileSync(join(sparse, "onboarding/brief.json"), '{"case":"sparse"}');
    const protocol = freezeCreativeEvaluation({ kernel: resolve("."), out, model: "frozen-model", host: "local", cases: [{ id: "rich", mediaProfile: "image_rich", capture: rich }, { id: "sparse", mediaProfile: "sparse_media", capture: sparse }], runsPerCaseArm: 2, limits: { iterations: 60, timeoutMs: 1_200_000, tokens: null }, permittedInterventions: [], viewports: [375, 768, 1080] });
    assert.equal(protocol.attempts.length, 8);
    assert.deepEqual(protocol.humanLabels, []);
    assert.equal(verifyCreativeEvaluation(out, resolve(".")).ok, true);
    writeFileSync(join(rich, "onboarding/brief.json"), '{"case":"changed"}');
    assert.match(verifyCreativeEvaluation(out, resolve(".")).failures.join(";"), /Capture changed/);
    writeFileSync(join(out, "protocol.json"), JSON.stringify({ ...protocol, runsPerCaseArm: 99 }));
    assert.match(verifyCreativeEvaluation(out, resolve(".")).failures.join(";"), /Protocol changed/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("creative efficiency evaluation freezes A/B/C/D with D explicitly ineligible", () => {
  const temp = mkdtempSync(join(tmpdir(), "vitris-efficiency-eval-"));
  try {
    const rich = join(temp, "rich"), sparse = join(temp, "sparse"), out = join(temp, "protocol");
    mkdirSync(join(rich, "onboarding"), { recursive: true });
    mkdirSync(join(sparse, "onboarding"), { recursive: true });
    writeFileSync(join(rich, "onboarding/brief.json"), '{"case":"rich"}');
    writeFileSync(join(sparse, "onboarding/brief.json"), '{"case":"sparse"}');
    const protocol = freezeCreativeEvaluation({ kernel: resolve("."), out, model: "frozen-host-model", host: "local", cases: [{ id: "rich", mediaProfile: "image_rich", capture: rich }, { id: "sparse", mediaProfile: "sparse_media", capture: sparse }], runsPerCaseArm: 1, limits: { iterations: 60, timeoutMs: 1_200_000, tokens: null }, permittedInterventions: [], viewports: [375, 1080], efficiencyArms: true, cachePolicy: "cold", promotionCriterion: "Lower combined measured cost with no material quality regression" });
    assert.deepEqual(protocol.arms.map(arm => arm.id), ["A", "B", "C", "D"]);
    assert.equal(protocol.arms[3]!.eligibility, "ineligible_until_task_specific_calibration");
    assert.equal(protocol.attempts.length, 8);
    assert.ok(protocol.attempts.every(item => item.status === "unrun"));
    assert.equal(verifyCreativeEvaluation(out, resolve(".")).ok, true);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
