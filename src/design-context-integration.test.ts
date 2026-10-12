import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { save, fingerprint, type Business, type MediaInventory } from "./agent/artifacts.ts";
import { inputHash } from "./agent/runner.ts";
import { initialState, parseGraphYaml } from "./agent/graph.ts";
import { prepareStage } from "./agent/lifecycle.ts";
import { mediaDesignEligibility, selectLessonsForStage, signalsFromSite } from "./agent/design-knowledge.ts";
import { buildDesignContextPacket } from "./agent/design-context-packet.ts";
import { expandDesignContextForPreparation, persistDesignContextArtifacts } from "./agent/design-context-store.ts";
import { loadKnowledgeCatalog } from "./agent/design-knowledge.ts";
import { JevClient } from "./agent/jev/client.ts";
import { runLifecycleSemanticTasks } from "./agent/jev/semantic-lifecycle.ts";
import { runSite } from "./cli/run.ts";
import { resumeSite } from "./cli/lifecycle.ts";
import { refineSite } from "./cli/refine.ts";
import { findActivePreparation } from "./agent/preparation.ts";
import { runWorkflow } from "./agent/workflow.ts";
import { DEFAULT_JEV_CAPABILITIES, DEFAULT_JEV_CONFIG, jevClientRequired, mergeJevConfig } from "./agent/jev/config.ts";

const kernel = join(import.meta.dirname, "..");
const temp = () => mkdtempSync(join(tmpdir(), "vitris-context-"));

const business: Business = {
  version: 2, offer: "Roof repairs", audience: "Homeowners", trigger: "Leak", outcome: "A dry roof",
  includes: ["Inspection"], engagement: "Estimate", positioning: "Local",
  facts: [{ id: "f1", claim: "Repairs slate roofs", evidence: ["e1"] }],
  evidence: [{ id: "e1", source: "notes.md", excerpt: "Repairs slate roofs" }],
  uncertainties: [],
};

function asset(id: string, role: string, disposition: MediaInventory["assets"][number]["disposition"], extra: Partial<MediaInventory["assets"][number]> = {}): MediaInventory["assets"][number] {
  return {
    id, path: `/media/${id}.jpg`, sources: [], description: `${role} photo`, role,
    disposition, reason: "Noted", inspected: true, placements: disposition === "use" ? ["/"] : [],
    ...extra,
  };
}

function inventory(assets: MediaInventory["assets"]): MediaInventory {
  return { version: 2, harvestHash: "h", assets };
}

function writeInventory(root: string, assets: MediaInventory["assets"]) {
  mkdirSync(join(root, "onboarding"), { recursive: true });
  save(join(root, "onboarding/business.json"), business);
  save(join(root, "onboarding/media-inventory.json"), inventory(assets));
}

test("media eligibility ignores exclude, duplicate, unresolved, and uninspected assets", () => {
  const previousKernel = process.env.VITRIS_KERNEL;
  process.env.VITRIS_KERNEL = kernel;
  try {
  const excluded = inventory([
    asset("a", "project", "exclude"),
    asset("b", "project", "duplicate", { duplicateOf: "a" }),
  ]);
  assert.equal(mediaDesignEligibility(excluded.assets[0]!), "unavailable");
  assert.equal(mediaDesignEligibility(excluded.assets[1]!), "unavailable");
  const root = temp();
  writeInventory(root, excluded.assets);
  const blocked = signalsFromSite(root);
  assert.equal(blocked.projectMediaCount, 0);
  assert.equal(selectLessonsForStage(root, "direction").some(item => item.id === "project-photography-transformations"), false);

  const unresolved = temp();
  writeInventory(unresolved, [
    asset("c", "project", "unresolved", { inspected: false }),
    asset("d", "project", "use", { inspected: false }),
  ]);
  assert.equal(signalsFromSite(unresolved).projectMediaCount, 0);
  assert.equal(selectLessonsForStage(unresolved, "direction").some(item => item.id === "project-photography-transformations"), false);

  const usable = temp();
  writeInventory(usable, [asset("e", "project", "use"), asset("f", "project", "use")]);
  assert.equal(signalsFromSite(usable).projectMediaCount, 2);
  assert.equal(selectLessonsForStage(usable, "direction").some(item => item.id === "project-photography-transformations"), true);

  const mixed = temp();
  writeInventory(mixed, [
    asset("g", "project", "use"),
    asset("h", "project", "exclude"),
    asset("i", "project", "retain"),
    asset("j", "project", "use", { description: "blurry low-res snapshot", reason: "not usable proof" }),
  ]);
  const mixedSignals = signalsFromSite(mixed);
  assert.equal(mixedSignals.projectMediaCount, 1);
  assert.equal(mixedSignals.retainedMediaCount, 1);
  assert.ok(mixedSignals.lowResolutionCount >= 1);
  assert.equal(mediaDesignEligibility(asset("i", "project", "retain")), "retain");

  const sameIndustrySparse = temp();
  writeInventory(sameIndustrySparse, []);
  save(join(sameIndustrySparse, "onboarding/business.json"), { ...business, offer: "Roof repairs", audience: "Homeowners" });
  const richLessons = selectLessonsForStage(usable, "direction").map(item => item.id);
  const sparseLessons = selectLessonsForStage(sameIndustrySparse, "direction").map(item => item.id);
  assert.notDeepEqual(richLessons, sparseLessons);
  } finally {
    if (previousKernel === undefined) delete process.env.VITRIS_KERNEL;
    else process.env.VITRIS_KERNEL = previousKernel;
  }
});

function seedAgent(root: string) {
  cpSync(join(kernel, "agent"), join(root, "agent"), { recursive: true });
  for (const name of ["STATE.json", "RUN.lock", "CURRENT.md", "PREPARED.json"]) {
    const path = join(root, "agent", name);
    if (existsSync(path)) writeFileSync(path, "");
  }
  mkdirSync(join(root, "onboarding"), { recursive: true });
  save(join(root, "onboarding/business.json"), business);
  save(join(root, "onboarding/media-inventory.json"), inventory([asset("roof", "project", "use")]));
  save(join(root, "onboarding/narrative-brief.json"), {
    schemaVersion: 2, businessHash: "b", mediaHash: "m", customer: "Homeowners", problem: "Leak", offer: "Roof repairs",
    serviceScope: "Repair", proof: { statement: "Slate", status: "limited", evidenceIds: ["e1"] }, conversion: "Estimate",
    objections: [], unsupportedClaims: [], facts: [{ id: "f1", claim: "Repairs slate", evidenceIds: ["e1"] }],
    visitorQuestions: [{ id: "q1", question: "Can they repair slate?", relationshipToConversion: "Estimate", priority: 1 }],
    assetNotes: [], toneConstraints: [], recordedUserGoals: [],
    designOpportunities: [{ id: "opp-1", visitorNeed: "See the roof", businessRelevance: "Repair", evidenceIds: ["e1"], mediaIds: ["roof"], presentationOpportunity: "Lead with the roof", constraints: [], basis: "evidence-backed" }],
  });
  save(join(root, "onboarding/reference-analysis.json"), { schemaVersion: 1, teachingPrinciples: [] });
  save(join(root, "onboarding/direction.json"), { version: 2, request: "Quiet", selected: "a", candidates: [], rationale: "x", system: {}, studies: [] });
  save(join(root, "onboarding/storyboard.json"), {
    version: 2, designContractVersion: 1, businessHash: "b", directionHash: "d", routes: [],
    pages: [{
      path: "/", purpose: "Home", representative: true, role: "home", visitorOutcome: "Call",
      sections: ["offer", "story", "hours", "team", "visit"].map(id => ({
        id, role: id, purpose: id, question: id, message: id, facts: [], media: [], action: null,
        composition: "card", emphasis: "equal", transition: "none", emphasisReason: "same",
        layoutFamily: "cards", density: "even", mediaProminence: "none", mobileTransformation: "Stack",
      })),
    }],
  });
  save(join(root, "onboarding/copy-plan.json"), { version: 2, pages: [] });
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist/index.html"), "<h1>Home</h1>");
  const graph = parseGraphYaml(readFileSync(join(root, "agent/graph.yaml"), "utf8"));
  const state = initialState(graph);
  for (const node of graph.nodes) state.nodes[node.id] = { status: "done", attempts: 1 };
  save(join(root, "agent/STATE.json"), state);
  return { graph, state };
}

test("public stage preparation executes semantic assist, isolates shadow, and honors off", async () => {
  const config = (mode: "off" | "shadow" | "assist") => ({
    ...DEFAULT_JEV_CONFIG, mode,
    capabilities: { visitorQuestionCheck: "assist" as const },
  });
  const prepare = async (mode: "off" | "shadow" | "assist", responseKind: "valid" | "malformed" = "valid") => {
    const root = temp();
    const { graph, state } = seedAgent(root);
    let calls = 0;
    const jevFetch = async (_input: RequestInfo | URL, _init?: RequestInit) => {
      calls++;
      return new Response(responseKind === "malformed" ? "not-json" : JSON.stringify({
        model: "jev-1.13.0", answers: { judgment: { type: "choice", choice: "unanswered", confidence: 0.95,
          probabilities: { covered: 0.02, unanswered: 0.95, unknown: 0.03 } } },
        usage: { input_tokens: 20, output_tokens: 5 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const prep = await prepareStage({ root, kernel, graph, state, nodeId: "copy", jevConfig: config(mode), jevFetch });
    const prompt = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
    const receiptFile = join(root, "agent/reviews/jev-semantic-copy.json");
    const receipt = existsSync(receiptFile) ? JSON.parse(readFileSync(receiptFile, "utf8")) : undefined;
    return { root, calls, prompt, receipt, prep };
  };
  const off = await prepare("off");
  assert.equal(off.calls, 0);
  assert.equal(off.receipt, undefined);
  const shadow = await prepare("shadow");
  assert.equal(shadow.calls, 1);
  assert.equal(shadow.receipt.receipts[0].state, "ok");
  assert.doesNotMatch(shadow.prompt, /unanswered \(advisory/);
  assert.doesNotMatch(shadow.prompt, /Jev semantic assistance/);
  const assist = await prepare("assist");
  assert.equal(assist.calls, 1);
  assert.equal(assist.receipt.receipts[0].state, "ok");
  assert.match(assist.prompt, /unanswered \(advisory/);
  const malformed = await prepare("assist", "malformed");
  assert.ok(malformed.calls > 0);
  assert.equal(malformed.receipt.receipts[0].state, "unavailable");
  assert.doesNotMatch(malformed.prompt, /unanswered \(advisory/);
});

test("semantic tasks run only at their selected public stages and fail open on transport timeout", async () => {
  const cases = [
    ["reference-analysis", "lessonRanking", "rank-lessons"],
    ["copy", "visitorQuestionCheck", "unanswered-questions"],
    ["copy-review", "factContradictionCheck", "fact-copy-contradiction"],
    ["copy-review", "ctaFitCheck", "cta-fit"],
    ["representative", "repetitionExplanationCheck", "unexplained-repetition"],
    ["visual-review", "directionContinuityCheck", "direction-continuity"],
  ] as const;
  for (const [stage, capability, task] of cases) {
    const root = temp();
    const { graph, state } = seedAgent(root);
    if (stage === "visual-review") {
      mkdirSync(join(root, "pages"), { recursive: true });
      writeFileSync(join(root, "pages/index.html"), "<h1>Roof repairs</h1>");
    }
    let calls = 0;
    const config = { ...DEFAULT_JEV_CONFIG, mode: "assist" as const, capabilities: { [capability]: "assist" as const } };
    await prepareStage({ root, kernel, graph, state, nodeId: stage, jevConfig: config,
      jevFetch: async () => { calls++; throw new DOMException("Timed out", "TimeoutError"); } });
    const receipt = JSON.parse(readFileSync(join(root, `agent/reviews/jev-semantic-${stage}.json`), "utf8"));
    assert.equal(receipt.receipts.length, stage === "reference-analysis" ? 0 : 1, stage);
    if (stage === "reference-analysis") { assert.equal(calls, 0); continue; }
    assert.equal(receipt.receipts[0].task, task);
    assert.equal(receipt.receipts[0].state, "unavailable");
    assert.ok(calls > 0, stage);
    assert.doesNotMatch(readFileSync(join(root, "agent/CURRENT.md"), "utf8"), /\(advisory; sources/);
  }
});

test("post-authoring continuity inspects affected interiors and shared components", async () => {
  const root = temp();
  save(join(root, "onboarding/direction.json"), { identity: "Restrained navy bookkeeping" });
  mkdirSync(join(root, "pages/services"), { recursive: true });
  mkdirSync(join(root, "components/shell"), { recursive: true });
  writeFileSync(join(root, "pages/index.html"), "<h1>Navy bookkeeping</h1>");
  writeFileSync(join(root, "pages/services/index.html"), "<h1>Neon arcade accounting</h1>");
  writeFileSync(join(root, "components/shell/styles.css"), ".site{color:navy}");
  save(join(root, "agent/change-request.json"), { affectedPages: ["/services"] });
  let seen: Array<{ id: string; text: string }> = [];
  let continuityCalls = 0;
  const providerReceipt = join(root, "provider-receipt.json");
  writeFileSync(providerReceipt, JSON.stringify({ usage: { inputTokens: 10, outputTokens: 2 } }));
  const client = { evaluate: async (request: { state: { sources: Array<{ id: string; text: string }> } }) => {
    continuityCalls++;
    seen = request.state.sources;
    const drifted = seen.some(item => item.id === "pages/services/index.html" && item.text.includes("Neon arcade"));
    return { result: { answers: { judgment: { choice: drifted ? "drifted" : "preserved", confidence: 0.9 } } },
      receiptPath: providerReceipt, durationMs: 1, cached: false };
  } } as unknown as JevClient;
  const run = () => runLifecycleSemanticTasks({ root, stage: "visual-review", preparationId: "p1",
    capabilities: { ...DEFAULT_JEV_CAPABILITIES, directionContinuityCheck: "assist" }, model: "mock", client });
  const drift = await run();
  assert.equal(drift.receipts[0]?.answer, "drifted");
  assert.deepEqual(seen.map(item => item.id), ["onboarding/direction.json", "pages/services/index.html", "components/shell/styles.css"]);
  writeFileSync(join(root, "pages/services/index.html"), "<h1>Bookkeeping services</h1><p>Warmer service detail within the navy identity.</p>");
  const variation = await run();
  assert.equal(variation.receipts[0]?.answer, "preserved");
  assert.match(seen[1]!.text, /Warmer service detail/);
  writeFileSync(join(root, "pages/services.html"), "<h1>Alternative flat-file service route</h1>");
  await run();
  assert.ok(seen.some(item => item.id === "pages/services.html"));
  writeFileSync(join(root, "pages/services/index.html"), "<h1>Bookkeeping services</h1>" + "x".repeat(20_100));
  const oversized = await run();
  assert.equal(oversized.receipts[0]?.state, "unavailable");
  assert.match(oversized.receipts[0]?.fallback || "", /evidence limit/);
  assert.equal(continuityCalls, 3);
});

test("lesson ranking yields one evidence-backed judgment and rank per candidate", async () => {
  const root = temp();
  save(join(root, "onboarding/narrative-brief.json"), { visitorJob: "Choose a reliable roofer" });
  save(join(root, "onboarding/media-inventory.json"), { assets: [] });
  const providerReceipt = join(root, "provider-receipt.json");
  writeFileSync(providerReceipt, JSON.stringify({ usage: { inputTokens: 10, outputTokens: 2 } }));
  const judged: string[] = [];
  const client = { evaluate: async (request: { state: { lessonCandidate: { id: string } } }) => {
    const id = request.state.lessonCandidate.id;
    judged.push(id);
    return { result: { answers: { judgment: { choice: id === "roof" ? "relevant" : "weak", confidence: 0.9 } } },
      receiptPath: providerReceipt, durationMs: 1, cached: false };
  } } as unknown as JevClient;
  const result = await runLifecycleSemanticTasks({ root, stage: "reference-analysis", preparationId: "p1",
    capabilities: { ...DEFAULT_JEV_CAPABILITIES, lessonRanking: "assist" }, model: "mock", client,
    lessonCandidates: [{ id: "arcade", reason: "Bright cards" }, { id: "roof", reason: "Trust evidence" }] });
  assert.deepEqual(judged, ["arcade", "roof"]);
  assert.deepEqual(result.receipts.map(item => [item.candidateId, item.rank, item.answer]),
    [["roof", 1, "relevant"], ["arcade", 2, "weak"]]);
  assert.ok(result.receipts.every(item => item.citedEvidence.includes(`lesson:${item.candidateId}`)));
});

test("public run, resume, and refine transport matrix honors off, shadow, and assist", async () => {
  for (const entry of ["run", "resume", "refine"] as const) {
    for (const mode of ["off", "shadow", "assist"] as const) {
      const root = temp();
      const pilot = join(kernel, "src/test/fixtures/active-agent-site");
      cpSync(pilot, root, { recursive: true, filter: path => !path.includes("node_modules") && !path.includes("dist.previous-") && !path.includes("agent-backups") && !path.includes("agent\\decisions") && !path.includes("agent\\preparations") });
      const state = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8"));
      // This historical fixture seeds completed stages; bind them to the copied
      // bytes, independent of checkout line endings and untracked empty folders.
      const graph = parseGraphYaml(readFileSync(join(root, "agent/graph.yaml"), "utf8"));
      for (const node of graph.nodes) {
        if (state.nodes[node.id]?.status !== "done") continue;
        Object.assign(state.nodes[node.id], {
          inputHash: inputHash(root, node),
          outputHash: fingerprint(root, node.writes),
          skillHash: fingerprint(root, ["agent/graph.yaml", "agent/PROMPT.md", ...node.refs.map(ref => `agent/refs/${ref}.md`)]),
        });
      }
      state.cumulativeSpend = { iterations: 0, calls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };
      state.preview_ready = false;
      if (entry !== "refine") state.nodes.copy = { status: "pending", attempts: 0 };
      save(join(root, "agent/STATE.json"), state);
      save(join(root, "agent/jev.json"), { mode: "assist", capabilities: { visitorQuestionCheck: "assist" } });
      let calls = 0;
      const jevFetch = async () => {
        calls++;
        return new Response(JSON.stringify({ model: "jev-1.13.0", answers: { judgment: {
          type: "choice", choice: "unanswered", confidence: 0.9,
          probabilities: { covered: 0.05, unanswered: 0.9, unknown: 0.05 },
        } }, usage: { input_tokens: 10, output_tokens: 2 } }),
        { status: 200, headers: { "content-type": "application/json" } });
      };
      const options = { site: root, workflowArgv: ["--jev-mode", mode], jevFetch };
      if (entry === "run") await runSite(options);
      else if (entry === "resume") await resumeSite(options);
      else await refineSite({ ...options, request: "Update the hero copy", scope: "copy" });
      assert.equal(calls > 0, mode !== "off", `${entry}/${mode} transport`);
      const promptPath = join(root, "agent/CURRENT.md");
      if (mode === "shadow" && existsSync(promptPath)) assert.doesNotMatch(readFileSync(promptPath, "utf8"), /unanswered \(advisory/);
      if (mode === "assist" && existsSync(promptPath)) assert.match(readFileSync(promptPath, "utf8"), /unanswered \(advisory/);
      if (entry === "run") {
        const preparation = findActivePreparation(root, "copy");
        assert.ok(preparation, `${entry}/${mode} prepared copy`);
        const beforeComplete = calls;
        await runWorkflow({ root, kernel, argv: ["--complete", "--preparation", preparation.id, "--jev-mode", mode, "--no-preview-server"], jevFetch, max: 1, noPreviewServer: true });
        assert.equal(calls, beforeComplete, `${entry}/${mode} complete transport`);
      }
    }
  }
});

const STAGE_SKILLS: Record<string, { skill: string; input: string }> = {
  narrative: { skill: "## Skill: narrative", input: "onboarding/business.json" },
  "reference-analysis": { skill: "## Skill: design-calibration", input: "onboarding/narrative-brief.json" },
  direction: { skill: "## Skill: direction", input: "onboarding/narrative-brief.json" },
  storyboard: { skill: "## Skill: storyboard", input: "onboarding/direction.json" },
  representative: { skill: "## Skill: implement", input: "onboarding/storyboard.json" },
  pages: { skill: "## Skill: implement", input: "onboarding/copy-plan.json" },
  "visual-review": { skill: "## Skill: critic", input: "dist" },
  "content-review": { skill: "## Skill: critic", input: "onboarding/business.json" },
};

test("prepareStage keeps required skills in CURRENT.md for design stages", async () => {
  for (const nodeId of Object.keys(STAGE_SKILLS)) {
    const root = temp();
    const { graph, state } = seedAgent(root);
    const prep = await prepareStage({ root, kernel, graph, state, nodeId });
    assert.equal(prep.status, "prepared", nodeId);
    const current = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
    const expect = STAGE_SKILLS[nodeId]!;
    assert.match(current, new RegExp(expect.skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), nodeId);
    assert.match(current, new RegExp(expect.input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), nodeId);
    assert.match(current, new RegExp(`Active node: ${nodeId}`));
    assert.match(current, /Write outputs:/);
    assert.equal(current.split("## Skill: direction").length - 1 <= 1, true);
    if (nodeId === "direction") {
      assert.match(current, /## Skill: contracts/);
      assert.match(current, /onboarding\/reference-analysis\.json/);
      assert.match(current, /theme\/defaults\.json/);
    }
    if (nodeId === "narrative") {
      assert.equal(current.includes("project-photography-transformations"), false);
    }
    const offerHits = current.split("Offer: Roof repairs").length - 1;
    assert.ok(offerHits <= 2, `${nodeId} duplicated business summary ${offerHits} times`);
  }
});

test("direction CURRENT.md keeps the direction skill after design-context deduplication", async () => {
  const root = temp();
  const { graph, state } = seedAgent(root);
  const prep = await prepareStage({ root, kernel, graph, state, nodeId: "direction" });
  assert.equal(prep.status, "prepared");
  const current = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  const skill = readFileSync(join(root, "agent/refs/direction.md"), "utf8").slice(0, 80);
  assert.ok(current.includes(skill.trim().slice(0, 40)));
  assert.match(current, /## Skill: direction/);
  assert.match(current, /## Skill: contracts/);
  assert.doesNotMatch(current, /## Stage objective/);
  assert.match(current, /## Design context/);
});

function prepRecord(root: string, id: string) {
  mkdirSync(join(root, "agent/preparations"), { recursive: true });
  save(join(root, `agent/preparations/${id}.json`), { id, nodeId: "reference-analysis", status: "prepared" });
}

test("expansion checks the current lesson, rejects tamper and stale sources, and survives unrelated edits", () => {
  const fakeKernel = temp();
  cpSync(join(kernel, "design-system/calibration"), join(fakeKernel, "design-system/calibration"), { recursive: true });
  cpSync(join(kernel, "design-system/knowledge"), join(fakeKernel, "design-system/knowledge"), { recursive: true });
  const previous = process.env.VITRIS_KERNEL;
  process.env.VITRIS_KERNEL = fakeKernel;
  try {
    const root = temp();
    mkdirSync(join(root, "onboarding"), { recursive: true });
    save(join(root, "onboarding/business.json"), business);
    const catalog = loadKnowledgeCatalog(fakeKernel);
    assert.ok(catalog);
    const lesson = catalog!.lessons[0]!;
    const packet = buildDesignContextPacket({
      root,
      nodeId: "reference-analysis",
      kernel: fakeKernel,
      preparationId: "prep-1",
      optionalCharBudget: 80,
      preSelectedLessons: [{
        id: lesson.id,
        version: lesson.version,
        contentHash: lesson.contentHash,
        reason: "Selected for this business",
        expansionHandle: `lesson:${lesson.id}@${lesson.version}`,
      }],
    });
    assert.ok(packet.expansions.length > 0);
    mkdirSync(join(root, "agent/runs"), { recursive: true });
    prepRecord(root, "prep-1");
    persistDesignContextArtifacts(root, "prep-1", packet);
    const handle = packet.expansions[0]!.id;
    const fresh = expandDesignContextForPreparation(root, "prep-1", handle);
    assert.equal(fresh.ok, true, fresh.ok ? "" : fresh.reason);

    const sidecarPath = join(root, "agent/runs/prep-1.design-context.expansions.json");
    const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
    sidecar.items[0].text = "tampered lesson body";
    writeFileSync(sidecarPath, JSON.stringify(sidecar));
    const tampered = expandDesignContextForPreparation(root, "prep-1", handle);
    assert.equal(tampered.ok, false);
    sidecar.items[0].text = packet.expansions[0]!.text;
    writeFileSync(sidecarPath, JSON.stringify(sidecar));

    const catalogPath = join(fakeKernel, "design-system/knowledge/v1/catalog.json");
    const catalogFile = JSON.parse(readFileSync(catalogPath, "utf8"));
    const selected = catalogFile.lessons.find((item: { id: string }) => item.id === lesson.id);
    selected.explanation = `${selected.explanation} revised after preparation`;
    const catalogText = JSON.stringify(catalogFile, null, 2) + "\n";
    writeFileSync(catalogPath, catalogText);
    const manifestPath = join(fakeKernel, "design-system/knowledge/v1/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.catalogSha256 = createHash("sha256").update(catalogText).digest("hex");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    const stale = expandDesignContextForPreparation(root, "prep-1", handle);
    assert.equal(stale.ok, false);
    assert.match(stale.ok ? "" : stale.reason, /changed|no longer matches|Prepare again/);
    const prepAfter = readFileSync(join(root, "agent/preparations/prep-1.json"), "utf8");
    assert.match(prepAfter, /"status": "prepared"/);

    selected.explanation = lesson.explanation;
    const restored = JSON.stringify(catalogFile, null, 2) + "\n";
    writeFileSync(catalogPath, restored);
    manifest.catalogSha256 = createHash("sha256").update(restored).digest("hex");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    const other = catalogFile.lessons.find((item: { id: string }) => item.id !== lesson.id);
    other.explanation = `${other.explanation} unrelated edit`;
    const unrelatedText = JSON.stringify(catalogFile, null, 2) + "\n";
    writeFileSync(catalogPath, unrelatedText);
    manifest.catalogSha256 = createHash("sha256").update(unrelatedText).digest("hex");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    const unrelated = expandDesignContextForPreparation(root, "prep-1", handle);
    assert.equal(unrelated.ok, true, unrelated.ok ? "" : unrelated.reason);

    const unknown = expandDesignContextForPreparation(root, "prep-1", "lesson:missing@1");
    assert.equal(unknown.ok, false);
    const missingPrep = expandDesignContextForPreparation(root, "missing-prep", handle);
    assert.equal(missingPrep.ok, false);
    assert.match(missingPrep.ok ? "" : missingPrep.reason, /Unknown preparation/);

    const cli = spawnSync(process.execPath, [
      "--experimental-strip-types",
      join(kernel, "scripts/eval-site.ts"),
      "--site", root,
      "--expand-design-context", handle,
      "--preparation", "prep-1",
    ], { encoding: "utf8", env: { ...process.env, VITRIS_KERNEL: fakeKernel } });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, new RegExp(lesson.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    if (previous === undefined) delete process.env.VITRIS_KERNEL;
    else process.env.VITRIS_KERNEL = previous;
  }
});

test("composition assist calls Jev and off mode does not", async () => {
  const root = temp();
  const { graph, state } = seedAgent(root);
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body || "{}"));
    const answers: Record<string, unknown> = {};
    for (const key of Object.keys(body.questions || {})) {
      answers[key] = { type: "choice", choice: "unrelated_repetition", confidence: 0.8, probabilities: { unrelated_repetition: 1 } };
    }
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 4, output_tokens: 1 } }), { status: 200 });
  };
  const off = await prepareStage({ root, kernel, graph, state, nodeId: "representative" });
  assert.equal(off.status, "prepared");
  assert.equal(existsSync(join(root, "agent/reviews/jev-composition.json")), false);
  assert.equal(calls, 0);

  const assistRoot = temp();
  const seeded = seedAgent(assistRoot);
  const jevConfig = {
    ...DEFAULT_JEV_CONFIG,
    mode: "assist" as const,
    capabilities: { ...DEFAULT_JEV_CONFIG.capabilities, compositionCheck: "assist" as const },
  };
  const client = new JevClient({
    root: assistRoot,
    apiKey: "test-key",
    fetch: fetchImpl,
    config: jevConfig,
  });
  const assist = await prepareStage({
    root: assistRoot,
    kernel,
    graph: seeded.graph,
    state: seeded.state,
    nodeId: "representative",
    jevClient: client,
    jevConfig,
  });
  assert.equal(assist.status, "prepared");
  assert.ok(calls > 0);
  const receipt = JSON.parse(readFileSync(join(assistRoot, "agent/reviews/jev-composition.json"), "utf8"));
  assert.equal(receipt.findings.some((finding: { choice?: string; state: string }) => finding.choice === "unrelated_repetition" && finding.state === "observed"), true);
  const current = readFileSync(join(assistRoot, "agent/CURRENT.md"), "utf8");
  assert.match(current, /Jev composition repetition/);
  assert.match(current, /unrelated_repetition/);
  assert.match(current, /Composition preflight|Equal emphasis/);
});

function compositionFetch(choiceFor: (key: string) => string | undefined): typeof fetch {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    const answers: Record<string, unknown> = {};
    for (const key of Object.keys(body.questions || {})) {
      const choice = choiceFor(key);
      if (!choice) continue;
      answers[key] = { type: "choice", choice, confidence: 0.8, probabilities: { [choice]: 1 } };
    }
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 4, output_tokens: 1 } }), { status: 200 });
  };
}

test("compositionCheck alone initializes Jev on the normal path", async () => {
  const config = {
    ...DEFAULT_JEV_CONFIG,
    mode: "assist" as const,
    capabilities: { ...DEFAULT_JEV_CONFIG.capabilities, compositionCheck: "assist" as const },
  };
  assert.equal(jevClientRequired(config), true);
  let calls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    calls += 1;
    return compositionFetch(() => "serves_narrative")(input, init);
  };
  const root = temp();
  const { graph, state } = seedAgent(root);
  const prep = await prepareStage({
    root, kernel, graph, state, nodeId: "representative", jevConfig: config, jevFetch: fetchImpl,
  });
  assert.equal(prep.status, "prepared");
  assert.ok(calls > 0);
  const current = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  assert.match(current, /## Skill: implement/);
  assert.match(current, /serves_narrative/);

  const shadowRoot = temp();
  const shadowSeed = seedAgent(shadowRoot);
  let shadowCalls = 0;
  const shadow = await prepareStage({
    root: shadowRoot, kernel, graph: shadowSeed.graph, state: shadowSeed.state, nodeId: "representative",
    jevConfig: { ...config, mode: "shadow", capabilities: { ...config.capabilities, compositionCheck: "shadow" } },
    jevFetch: async (input, init) => {
      shadowCalls += 1;
      return compositionFetch(() => "unrelated_repetition")(input, init);
    },
  });
  assert.equal(shadow.status, "prepared");
  assert.ok(shadowCalls > 0);
  const shadowCurrent = readFileSync(join(shadowRoot, "agent/CURRENT.md"), "utf8");
  assert.doesNotMatch(shadowCurrent, /Jev composition repetition/);
  assert.match(shadowCurrent, /## Skill: implement/);
  assert.equal(existsSync(join(shadowRoot, "agent/reviews/jev-composition.json")), true);

  const offRoot = temp();
  const offSeed = seedAgent(offRoot);
  let offCalls = 0;
  const off = await prepareStage({
    root: offRoot, kernel, graph: offSeed.graph, state: offSeed.state, nodeId: "representative",
    jevConfig: { ...DEFAULT_JEV_CONFIG, mode: "off" },
    jevFetch: async () => { offCalls += 1; return new Response("no"); },
  });
  assert.equal(off.status, "prepared");
  assert.equal(offCalls, 0);

  const cwd = process.cwd();
  const missingRoot = temp();
  const missingSeed = seedAgent(missingRoot);
  const previousKey = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  process.chdir(missingRoot);
  try {
    const missing = await prepareStage({
      root: missingRoot, kernel, graph: missingSeed.graph, state: missingSeed.state, nodeId: "representative",
      jevConfig: config,
    });
    assert.equal(missing.status, "prepared");
    const receipt = JSON.parse(readFileSync(join(missingRoot, "agent/reviews/jev-composition.json"), "utf8"));
    assert.equal(receipt.findings[0].state, "unavailable");
    assert.match(readFileSync(join(missingRoot, "agent/CURRENT.md"), "utf8"), /## Skill: implement/);
    assert.doesNotMatch(readFileSync(join(missingRoot, "agent/CURRENT.md"), "utf8"), /Jev composition repetition/);
  } finally {
    process.chdir(cwd);
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
  }

  const badRoot = temp();
  const badSeed = seedAgent(badRoot);
  await prepareStage({
    root: badRoot, kernel, graph: badSeed.graph, state: badSeed.state, nodeId: "representative",
    jevConfig: config,
    jevFetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
  });
  const bad = JSON.parse(readFileSync(join(badRoot, "agent/reviews/jev-composition.json"), "utf8"));
  assert.ok(bad.findings.every((finding: { state: string }) => finding.state === "unavailable" || finding.state === "invalid"));
  assert.match(readFileSync(join(badRoot, "agent/CURRENT.md"), "utf8"), /## Skill: implement/);

  const preset = mergeJevConfig({}, ["--design-assist"]);
  assert.equal(preset.capabilities?.compositionCheck, "assist");
  const presetRoot = temp();
  const presetSeed = seedAgent(presetRoot);
  const presetPrep = await prepareStage({
    root: presetRoot, kernel, graph: presetSeed.graph, state: presetSeed.state, nodeId: "representative",
    jevConfig: preset, jevFetch: compositionFetch(() => "serves_narrative"),
  });
  assert.equal(presetPrep.status, "prepared");
  assert.match(readFileSync(join(presetRoot, "agent/CURRENT.md"), "utf8"), /Jev composition repetition/);

  const held = mergeJevConfig({ capabilities: { compositionCheck: "off" } }, ["--design-assist"]);
  assert.equal(held.capabilities?.compositionCheck, "off");
  const heldRoot = temp();
  const heldSeed = seedAgent(heldRoot);
  await prepareStage({
    root: heldRoot, kernel, graph: heldSeed.graph, state: heldSeed.state, nodeId: "representative",
    jevConfig: held, jevFetch: compositionFetch(() => "serves_narrative"),
  });
  assert.equal(existsSync(join(heldRoot, "agent/reviews/jev-composition.json")), false);
});
