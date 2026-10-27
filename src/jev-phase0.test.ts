import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JevClient } from "./agent/jev/client.ts";
import { DEFAULT_JEV_CONFIG, enabledJevCallers, loadJevConfig, resolveEffectiveCapabilities } from "./agent/jev/config.ts";
import {
  attachLineage,
  comparePlannedToRendered,
  extractPlannedAssertions,
  extractRenderedAssertions,
} from "./agent/jev/visible-assertions.ts";
import { parseHtml, textContent } from "./agent/jev/html-tree.ts";
import {
  criticDisposedFinding,
  obligationCacheKey,
  overflowIdsDisposed,
  partitionQuestionsByClaim,
  reconcileQualityWithReview,
  runQualityChecks,
} from "./agent/jev/content-checks.ts";
import type { Review } from "./agent/artifacts.ts";
import {
  applyAssistProfile,
  ASSIST_QUALITY_PROFILE,
  emitMatchedAbProcedure,
  kernelIdentity,
  kernelRevision,
  plannedJevCallsForProfile,
  validateMatchedAbConfigs,
  writeArmExecutionManifest,
  writeDryRunManifests,
} from "./agent/jev/pilot-recipe.ts";
import {
  importGeminiHostUsage,
  logicalUsageKey,
  recordAgentStageAttempt,
  writeAgentAttemptReceipt,
  reconcileExpectedAttempts,
  loadAgentAttemptReceipts,
} from "./agent/jev/agent-usage.ts";
import { loadArmUsageMetrics } from "./agent/jev/evaluation.ts";
import { initialState, isPreviewReady, parseGraphYaml } from "./agent/graph.ts";

const kernel = join(dirname(fileURLToPath(import.meta.url)), "..");
const temp = () => mkdtempSync(join(tmpdir(), "vitris-phase0-"));

function fetchOk(init?: RequestInit): Response {
  const body = JSON.parse(String(init?.body || "{}"));
  const answers: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(body.questions || {})) {
    const q = raw as { type?: string; criteria?: Record<string, string> };
    if (q.type === "noul") answers[key] = { type: "noul", noul: 0.05 };
    else if (q.type === "score") answers[key] = { type: "score", score: 3, confidence: 0.9, probabilities: { "3": 1 } };
    else {
      const ids = Object.keys(q.criteria && !Array.isArray(q.criteria) ? q.criteria : {});
      answers[key] = { type: "choice", choice: ids[0] || "supports", confidence: 0.9, probabilities: {} };
    }
  }
  return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 10, output_tokens: 2 } }), {
    status: 200, headers: { "content-type": "application/json" },
  });
}

test("HTML tree retains route, section, element, span, and source location", () => {
  const html = `<section id="hero"><h1>Roof repairs</h1><p>We repair roofs on weekdays.</p></section>`;
  const doc = parseHtml(html);
  assert.equal(doc.tag, "#document");
  const section = doc.children.find(c => c.type === "element")!;
  assert.ok(section);
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  writeFileSync(join(root, "pages/index.html"), html, "utf8");
  const rendered = extractRenderedAssertions(root);
  const heading = rendered.find(a => a.element === "heading");
  assert.ok(heading);
  assert.equal(heading.sectionId, "hero");
  assert.equal(heading.pagePath, "/");
  assert.ok(heading.sourceLocation);
  assert.equal(heading.sourceLocation!.file.replace(/\\/g, "/"), "pages/index.html");
  assert.ok(heading.sourceLocation!.end > heading.sourceLocation!.start);
  assert.match(textContent(section), /Roof repairs/);
});

test("Lineage: qualifier change, extra claim, reused heading, duplicate text, stale hash", () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });
  mkdirSync(join(root, "pages"), { recursive: true });
  const section = {
    id: "hero",
    heading: "Local roof repairs",
    body: "Open weekdays 9am to 5pm. We repair roofs for homeowners.",
    factIds: ["f1"],
  };
  writeFileSync(join(root, "onboarding/copy-plan.json"), JSON.stringify({
    pages: [{ path: "/", sections: [section, { id: "about", heading: "Our story", body: "Family owned since 1998 and still family owned since 1998.", factIds: ["f1"] }] }],
  }), "utf8");
  writeFileSync(join(root, "onboarding/business.json"), JSON.stringify({
    version: 2, offer: "Roofs", audience: "Homeowners", trigger: "Leak", outcome: "Fixed",
    includes: [], engagement: "Call", positioning: "Local",
    facts: [{ id: "f1", claim: "We repair roofs", evidence: ["e1"] }],
    evidence: [{ id: "e1", source: "onboarding/copy/home.md", excerpt: "We repair roofs." }],
    uncertainties: [],
  }), "utf8");
  writeFileSync(join(root, "pages/index.html"), `
    <section id="hero"><h1>Local roof repairs</h1><p>Open 24/7 emergency service.</p></section>
    <section id="about"><h2>Local roof repairs</h2><p>Family owned since 1998 and still family owned since 1998.</p></section>
    <section id="dup"><h2>Extra</h2><p>Family owned since 1998 and still family owned since 1998.</p></section>
    <section id="extra"><h2>Aside</h2><p>Voted best in the county without a source.</p></section>
  `, "utf8");
  const planned = extractPlannedAssertions(root);
  const rendered = extractRenderedAssertions(root);
  const lineage = attachLineage(root, planned, rendered);
  const delta = comparePlannedToRendered(planned, rendered);
  assert.ok(delta.strengthened.some(p => /24\/7/.test(p.rendered.text)), "changed qualifier must strengthen");
  assert.ok(lineage.unmatchedRendered.some(a => /best in the county/i.test(a.text)), "extra unsupported claim unmatched");
  assert.ok(lineage.unmatchedRendered.every(a => !a.factIdsAttached && a.factIds.length === 0), "never silently attach fact IDs");
  assert.ok(lineage.reusedHeadings.some(h => /local roof repairs/i.test(h.text)));
  assert.ok(rendered.filter(a => /family owned since 1998/i.test(a.text)).length >= 2);

  const staleRoot = temp();
  mkdirSync(join(staleRoot, "onboarding"), { recursive: true });
  mkdirSync(join(staleRoot, "pages"), { recursive: true });
  writeFileSync(join(staleRoot, "onboarding/copy-plan.json"), JSON.stringify({ pages: [{ path: "/", sections: [section] }] }), "utf8");
  const oldPlanned = extractPlannedAssertions(staleRoot);
  writeFileSync(join(staleRoot, "onboarding/copy-plan.json"), JSON.stringify({
    pages: [{ path: "/", sections: [{ ...section, body: "Open weekdays 9am to 5pm. We repair roofs for homeowners. Licensed." }] }],
  }), "utf8");
  writeFileSync(join(staleRoot, "pages/index.html"), `<section id="hero"><h1>Local roof repairs</h1><p>Open weekdays 9am to 5pm. We repair roofs for homeowners.</p></section>`, "utf8");
  const staleLineage = attachLineage(staleRoot, oldPlanned, extractRenderedAssertions(staleRoot));
  assert.ok(staleLineage.stale.length >= 1, "stale source hash must surface");
});

test("Structured dispositions ignore finding IDs in prose; overflow can pass with explicit IDs", async () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "agent/runs"), { recursive: true });
  writeFileSync(join(root, "onboarding/business.json"), JSON.stringify({
    version: 2, offer: "Roofs", audience: "Homeowners", trigger: "Leak", outcome: "Fixed",
    includes: [], engagement: "Call", positioning: "Local",
    facts: [{ id: "f1", claim: "We repair roofs", evidence: ["e1"] }],
    evidence: [{ id: "e1", source: "onboarding/copy/home.md", excerpt: "We repair roofs." }],
    uncertainties: [],
  }), "utf8");
  const sections = Array.from({ length: 6 }, (_, i) => ({
    id: `s${i}`,
    heading: `Heading ${i} unique work`,
    body: `Supported roof sentence number ${i} for homeowners in the county area today.`,
    factIds: ["f1"],
  }));
  writeFileSync(join(root, "onboarding/copy-plan.json"), JSON.stringify({ pages: [{ path: "/", sections }] }), "utf8");
  const client = new JevClient({ root, apiKey: "test-key", fetch: async (_i, init) => fetchOk(init), config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" } });
  const result = await runQualityChecks({
    root, client, nodeId: "copy-review", preparationId: "overflow-1",
    capabilities: { claimStrengthening: "assist", ctaFidelity: "off", coverageCheck: "off", crossStageContinuity: "off" },
  });
  assert.ok((result.overflowIds || []).length > 0, "modest multi-section site overflows the 16-question cap");
  const finding = result.findings.find(f => f.severity === "error") || {
    id: "major_demo", taskId: "claim-strengthening-check", subjectId: "x", location: "/", kind: "unsupported",
    severity: "error" as const, policyDecision: "escalate" as const, policyVersion: "x", verification: "x", author: "copy", status: "open" as const,
    subjectHash: "abc",
  };
  const proseReview: Review = {
    version: 2, subjectHash: "s", verdict: "pass", reviewer: "critic",
    evidence: [`We discussed ${finding.id} in this paragraph`],
    checks: [], findings: [],
  };
  assert.equal(criticDisposedFinding(proseReview, finding as any), false, "ID in prose is not a disposition");

  const majors = result.findings.filter(f => f.severity === "error" && f.policyDecision !== "pass");
  const dispositions = [
    ...(result.overflowIds || []).map(id => ({
      findingId: id, subjectHash: id, disposition: "accepted_risk" as const, rationale: "Budget overflow covered.", evidence: "manual critic overflow ledger",
    })),
    ...majors.map(f => ({
      findingId: f.id, subjectHash: f.subjectHash || f.id,
      disposition: "disagree_with_evidence" as const, rationale: "Independent harvest excerpt supports the claim.", evidence: "onboarding/copy/home.md excerpt e1",
    })),
  ];
  const disposedReview: Review = {
    version: 2, subjectHash: "s", verdict: "pass", reviewer: "critic",
    evidence: ["structured"], checks: [], findings: [], dispositions,
  };
  writeFileSync(join(root, "agent/reviews/copy-review.json"), JSON.stringify(disposedReview), "utf8");
  const failures = reconcileQualityWithReview({ root, preparationId: "overflow-1", nodeId: "copy-review", assist: true });
  assert.deepEqual(failures, []);
  assert.equal(overflowIdsDisposed(disposedReview, result.overflowIds || []), true);
});

test("One passing claim question does not mark sibling kinds passed", () => {
  const a = obligationCacheKey({ questionId: "va_1_unsupported", assertionHash: "a", evidenceHash: "e", model: "jev-1.13.0", policyHash: "p" });
  const b = obligationCacheKey({ questionId: "va_1_contradiction", assertionHash: "a", evidenceHash: "e", model: "jev-1.13.0", policyHash: "p" });
  assert.notEqual(a, b);
});

test("Partition keeps claim groups together under budget", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({
    id: `c${Math.floor(i / 5)}_${i}`,
    taskType: "coverage" as const,
    claimId: `c${Math.floor(i / 5)}`,
    claim: "x",
    metadata: { location: i < 5 ? "/#hero" : "/#other" },
  }));
  const { kept, overflow } = partitionQuestionsByClaim(items, 8);
  assert.ok(kept.length <= 8);
  assert.ok(overflow.length >= 1);
  assert.ok(kept.some(k => String(k.metadata?.location).includes("hero")));
});

test("Assist profile: A off, B enabled, non-treatment mismatch aborts; dry-run A has zero planned calls", () => {
  const aRoot = temp();
  const bRoot = temp();
  mkdirSync(join(aRoot, "agent"));
  mkdirSync(join(bRoot, "agent"));
  writeFileSync(join(aRoot, "launch.json"), "{}", "utf8");
  writeFileSync(join(bRoot, "launch.json"), "{}", "utf8");
  const aCfg = applyAssistProfile(aRoot, "A");
  const bCfg = applyAssistProfile(bRoot, "B");
  assert.equal(aCfg.mode, "off");
  assert.equal(enabledJevCallers(aCfg).length, 0);
  assert.ok(enabledJevCallers(bCfg).length > 0);
  assert.equal(validateMatchedAbConfigs(aCfg, bCfg).ok, true);
  const mismatch = { ...bCfg, compactPackets: true };
  assert.equal(validateMatchedAbConfigs(aCfg, mismatch).ok, false);
  assert.ok(plannedJevCallsForProfile(ASSIST_QUALITY_PROFILE).length > 0);
  const planned = emitMatchedAbProcedure({ kernel, rootA: aRoot, rootB: bRoot });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const out = temp();
  const written = writeDryRunManifests({ outDir: out, procedure: planned.procedure });
  const provenance = JSON.parse(readFileSync(written.provenancePath, "utf8"));
  assert.deepEqual(provenance.plannedCalls.A, []);
  assert.ok(provenance.plannedCalls.B.length > 0);
  assert.ok(provenance.plannedCalls.B.some((c: { nodeId: string }) => c.nodeId === "copy-review"));
  const id = kernelIdentity(kernel);
  assert.notEqual(id.gitCommit, "");
  assert.notEqual(kernelRevision(kernel), id.packageVersion);
  writeArmExecutionManifest({
    root: bRoot, arm: "B", kernel, actualCalls: provenance.plannedCalls.B, previewReady: false, executed: false,
  });
  writeArmExecutionManifest({
    root: aRoot, arm: "A", kernel, actualCalls: [], previewReady: false, executed: false,
  });
});

test("Injected multi-section preview is not proven by marking graph nodes done", () => {
  const graph = parseGraphYaml(readFileSync(join(kernel, "agent/graph.yaml"), "utf8"));
  const state = initialState(graph);
  for (const n of graph.nodes) {
    if (!n.optional) state.nodes[n.id] = { status: "done", attempts: 1 };
  }
  assert.equal(isPreviewReady(graph, state), true);
  assert.equal(state.preview_ready, false, "in-memory done flags are not a live A/B result");
});
test("Usage logical keys refuse duplicates; missing critic coverage is incomplete", () => {
  const root = temp();
  const first = recordAgentStageAttempt({
    root, nodeId: "copy", preparationId: "p1", attemptId: "p1:1", kind: "agent",
    runId: "r1", inputTokens: 10, outputTokens: 2, source: "host_export",
  });
  const reconciled = writeAgentAttemptReceipt(root, first);
  assert.ok(reconciled.includes(logicalUsageKey(first)));
  assert.throws(() => writeAgentAttemptReceipt(root, { ...first, inputTokens: 99 }));
  recordAgentStageAttempt({
    root, nodeId: "copy-review", preparationId: "p2", attemptId: "p2:1", kind: "critic",
    runId: "r1", inputTokens: 4, outputTokens: 1, source: "host_export",
  });
  const host = importGeminiHostUsage({
    root, raw: { model: "gemini-2.5", usage: { input_tokens: 8, output_tokens: 3 } }, runId: "r1", sessionId: "s1",
  });
  assert.ok(host.rawEvidenceHash);
  const receipts = loadAgentAttemptReceipts(root);
  const recon = reconcileExpectedAttempts(receipts, [
    { nodeId: "copy", kind: "agent" },
    { nodeId: "copy-review", kind: "critic" },
    { nodeId: "pages", kind: "agent" },
  ]);
  assert.equal(recon.coverage, "incomplete");
  const loaded = loadArmUsageMetrics(root, [{ nodeId: "copy", kind: "agent" }, { nodeId: "pages", kind: "agent" }]);
  assert.equal(loaded.coverage, "incomplete");
});
