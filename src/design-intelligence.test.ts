import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { save, type Business, type Direction, type NarrativeBrief, type Storyboard } from "./agent/artifacts.ts";
import { applyDesignContractMigration, assessDesignContractMigration, representativeBindingHash, validateDirectionDesign, validateNarrativeDesign, validateStoryboardDesign } from "./agent/design-contracts.ts";
import { initialState, parseGraphYaml } from "./agent/graph.ts";
import { loadKnowledgeCatalog, readLessonBody, selectLessons, signalsFromInventory, verifyKnowledgePack } from "./agent/design-knowledge.ts";
import { buildDesignContextPacket, expandDesignContextItem } from "./agent/design-context-packet.ts";
import { expandDesignContextForPreparation, persistDesignContextArtifacts } from "./agent/design-context-store.ts";
import { assessComposition, paletteChangeResolves } from "./agent/composition-preflight.ts";
import { classifyPublicSentence, visualFindingGaps } from "./agent/editorial.ts";
import { classifyChange, requestNodesFor } from "./agent/refine.ts";
import { mergeJevConfig } from "./agent/jev/config.ts";
import { scoreCreativeCandidates } from "./agent/jev/creative.ts";
import { JevClient } from "./agent/jev/client.ts";
import { DEFAULT_JEV_CONFIG } from "./agent/jev/config.ts";
import { evaluateV2 } from "./agent/evaluate.ts";
import { recheckCompositionFinding } from "./agent/jev/repair.ts";

const kernel = join(import.meta.dirname, "..");
const temp = () => mkdtempSync(join(tmpdir(), "vitris-design-"));

const business: Business = {
  version: 2, offer: "Roof repairs", audience: "Homeowners", trigger: "Leak", outcome: "A dry roof",
  includes: ["Inspection"], engagement: "Estimate", positioning: "Local",
  facts: [{ id: "f1", claim: "Repairs slate roofs", evidence: ["e1"] }],
  evidence: [{ id: "e1", source: "notes.md", excerpt: "Repairs slate roofs" }],
  uncertainties: [],
};

function opportunity(id = "opp-1", basis: "evidence-backed" | "design-hypothesis" = "evidence-backed") {
  return {
    id,
    visitorNeed: "See the finished roof",
    businessRelevance: "The offer is a repair",
    evidenceIds: ["e1"],
    mediaIds: [] as string[],
    presentationOpportunity: "Lead with the repair, not a stock skyline",
    constraints: ["No extra photos"],
    basis,
    uncertainty: basis === "design-hypothesis" ? "The sequence is an interpretation" : undefined,
  };
}

function narrative(extra: Partial<NarrativeBrief> = {}): NarrativeBrief {
  return {
    schemaVersion: 2,
    businessHash: "b",
    mediaHash: "m",
    customer: "Homeowners",
    problem: "A leak",
    offer: "Roof repairs",
    serviceScope: "Inspection and repair",
    proof: { statement: "Repairs slate roofs", status: "limited", evidenceIds: ["e1"] },
    conversion: "Request an estimate",
    objections: [],
    unsupportedClaims: [],
    facts: [{ id: "f1", claim: "Repairs slate roofs", evidenceIds: ["e1"] }],
    visitorQuestions: [{ id: "q1", question: "Can they repair slate?", relationshipToConversion: "The estimate is the conversion", priority: 1 }],
    assetNotes: [{ strength: "No usable project photo", limitation: "Do not invent one" }],
    toneConstraints: [],
    recordedUserGoals: [],
    designOpportunities: [opportunity()],
    ...extra,
  };
}

test("applyDesignContractMigration invalidates from narrative without restarting harvest", () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });
  save(join(root, "onboarding/business.json"), business);
  save(join(root, "onboarding/narrative-brief.json"), { schemaVersion: 1, customer: "legacy" });
  const graph = parseGraphYaml(readFileSync(join(kernel, "agent/graph.yaml"), "utf8"));
  const state = initialState(graph);
  for (const id of ["harvest", "business", "business-review", "media", "narrative"]) {
    state.nodes[id] = { status: "done", attempts: 1 };
  }
  const applied = applyDesignContractMigration(root, graph, state);
  assert.equal(applied.applied, true);
  assert.equal(state.nodes.harvest?.status, "done");
  assert.equal(state.nodes.narrative?.status, "pending");
});

test("narrative design contract rejects bad ids, fact confusion, and legacy briefs", () => {
  assert.equal(validateNarrativeDesign(narrative(), business).length, 0);
  const dup = narrative({ designOpportunities: [opportunity("same"), opportunity("same")] });
  assert.match(validateNarrativeDesign(dup, business).join(" "), /Duplicate/);
  const missing = narrative({ designOpportunities: [{ ...opportunity(), evidenceIds: ["nope"] }] });
  assert.match(validateNarrativeDesign(missing, business).join(" "), /unknown evidence/);
  const hypothesis = narrative({ designOpportunities: [{ ...opportunity("h", "design-hypothesis"), uncertainty: undefined }] });
  assert.match(validateNarrativeDesign(hypothesis, business).join(" "), /uncertainty/);
  const legacy = narrative({ schemaVersion: 1, designOpportunities: undefined });
  assert.match(validateNarrativeDesign(legacy, business).join(" "), /inspectable history/);
  const root = temp();
  save(join(root, "onboarding/narrative-brief.json"), legacy);
  const migration = assessDesignContractMigration(root);
  assert.equal(migration.harvestRestart, false);
  assert.ok(migration.regenerate.includes("narrative"));
});

test("knowledge pack resolves without a user reference and separates same-industry briefs", () => {
  assert.deepEqual(verifyKnowledgePack(kernel), []);
  const catalog = loadKnowledgeCatalog(kernel);
  assert.ok(catalog);
  assert.ok((catalog?.lessons.length || 0) >= 12);
  const body = readLessonBody(kernel, catalog!.lessons[0]!);
  assert.match(body, /Composition:/);
  assert.match(body, /Typography:/);
  assert.match(body, /Media:/);
  assert.match(body, /Mobile:/);
  assert.match(body, /Required assets:/);
  assert.match(body, /References:/);
  assert.match(body, /Authority: teaching guidance/);
  const rich = selectLessons({
    catalog: catalog!,
    signals: signalsFromInventory({ mediaRoles: ["project", "project", "project"], visitorJobs: ["judge finished work"], serviceCount: 2 }),
    stage: "direction",
  });
  const sparse = selectLessons({
    catalog: catalog!,
    signals: signalsFromInventory({ mediaRoles: [], mediaCount: 0, visitorJobs: ["understand the diagnostic"], serviceCount: 1 }),
    stage: "direction",
  });
  assert.ok(rich.some(item => item.id === "project-photography-transformations"));
  assert.equal(rich.some(item => item.id === "sparse-imagery-process"), false);
  assert.ok(sparse.some(item => item.id === "sparse-imagery-process"));
  assert.equal(sparse.some(item => item.id === "project-photography-transformations"), false);
  const labeled = selectLessons({
    catalog: catalog!,
    signals: signalsFromInventory({ mediaRoles: [], mediaCount: 0, visitorJobs: ["roofing company"], serviceCount: 1 }),
    stage: "narrative",
  });
  assert.equal(labeled.some(item => item.id === "project-photography-transformations"), false);
});

test("design context expansion resolves from persisted sidecar with hash verification", () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });
  save(join(root, "onboarding/business.json"), business);
  save(join(root, "onboarding/narrative-brief.json"), narrative());
  const catalog = loadKnowledgeCatalog(kernel);
  assert.ok(catalog);
  const pre = selectLessons({
    catalog: { lessons: catalog!.lessons },
    stage: "reference-analysis",
    signals: signalsFromInventory({ mediaRoles: ["project"], mediaCount: 1, visitorJobs: ["see work"], serviceCount: 1 }),
  });
  const packet = buildDesignContextPacket({ root, nodeId: "reference-analysis", preSelectedLessons: pre });
  mkdirSync(join(root, "agent/runs"), { recursive: true });
  mkdirSync(join(root, "agent/preparations"), { recursive: true });
  save(join(root, "agent/preparations/prep-expand.json"), { id: "prep-expand", nodeId: "reference-analysis", status: "prepared" });
  persistDesignContextArtifacts(root, "prep-expand", packet);
  const handle = packet.expansions[0]?.id;
  if (handle) {
    const ok = expandDesignContextForPreparation(root, "prep-expand", handle);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.ok(ok.text.includes("#"));
  }
});

test("design context keeps required evidence, refuses a stale expansion, and ignores shadow", () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });
  save(join(root, "onboarding/business.json"), business);
  save(join(root, "onboarding/narrative-brief.json"), narrative());
  const off = buildDesignContextPacket({ root, nodeId: "narrative", jevMode: "off", advisory: "SHOULD NOT APPEAR" });
  const shadow = buildDesignContextPacket({ root, nodeId: "narrative", jevMode: "shadow", advisory: "SHOULD NOT APPEAR" });
  assert.equal(off.text, shadow.text);
  assert.match(off.text, /Homeowners/);
  assert.doesNotMatch(off.text, /SHOULD NOT APPEAR/);
  const assist = buildDesignContextPacket({ root, nodeId: "narrative", jevMode: "assist", advisory: "Hierarchy note" });
  assert.match(assist.text, /Hierarchy note/);
  const expanded = expandDesignContextItem(off, "missing");
  assert.equal(expanded.ok, false);
  off.expansions.push({ id: "lesson:x@1", hash: "dead", chars: 4, text: "real" });
  off.manifest.expansions.push({ id: "lesson:x@1", hash: "dead", chars: 4 });
  const stale = expandDesignContextItem(off, "lesson:x@1");
  assert.equal(stale.ok, false);
});

test("direction preserves an exact theme and does not invent imagery for an asset-poor business", () => {
  const direction: Direction = {
    version: 2, businessHash: "b", request: "Warm editorial with serif headings", selected: "a", rationale: "Fits",
    candidates: [{ id: "a", rationale: "Fits", typography: "Serif", composition: "Editorial", mediaTreatment: "None" }],
    system: { personality: "Quiet", typography: "Serif", colorRoles: "Ink", density: "Open", rhythm: "Slow", mediaTreatment: "None", surfaces: "Paper", navigation: "Simple", motifs: "Rule", interiors: "Column", avoid: [] },
    studies: [],
    designContractVersion: 1,
    centralIdea: "A written diagnostic, not a stock photograph",
    opportunityIds: ["opp-1"],
    decisions: [{ id: "media", kind: "media", choice: "No invented photography", rationale: "The inventory has no usable project image", scope: "homepage", tradeoff: "Less atmosphere" }],
    rejectedAlternatives: [],
    identityInvariants: ["The diagnostic stays the first screen"],
    flexibleDecisions: ["Interior measure"],
  };
  assert.equal(validateDirectionDesign(direction, { userTheme: "Warm editorial with serif headings", opportunityIds: ["opp-1"] }).length, 0);
  direction.request = "Blue corporate";
  assert.match(validateDirectionDesign(direction, { userTheme: "Warm editorial with serif headings", opportunityIds: ["opp-1"] }).join(" "), /verbatim/);
});

test("storyboard repetition distinguishes a useful list from an unrelated stack", () => {
  const list: Storyboard = {
    version: 2, designContractVersion: 1, businessHash: "b", directionHash: "d", routes: [],
    pages: [{
      path: "/", purpose: "Menu", representative: true, role: "homepage", visitorOutcome: "Order",
      sections: ["one", "two", "three"].map(id => ({
        id, role: "menu-item", purpose: "List a dish", question: "What is served?", message: id,
        facts: [], media: [], action: null, composition: "row", emphasis: "equal", transition: "none",
        emphasisReason: "These dishes are peers", layoutFamily: "list", density: "compact", mediaProminence: "thumb",
        repetitionRationale: "One menu", mobileTransformation: "Stack the rows",
      })),
    }],
  };
  assert.equal(assessComposition(list).some(item => item.kind === "monotonous-stack"), false);
  const stack: Storyboard = {
    ...list,
    pages: [{
      ...list.pages[0]!,
      sections: ["offer", "story", "hours", "team", "visit"].map(id => ({
        id, role: id, purpose: id, question: id, message: id, facts: [], media: [], action: null,
        composition: "card", emphasis: "equal", transition: "none", emphasisReason: "Same weight",
        layoutFamily: "cards", density: "even", mediaProminence: "none", mobileTransformation: "Stack",
      })),
    }],
  };
  const findings = assessComposition(stack);
  assert.equal(findings.some(item => item.kind === "monotonous-stack"), true);
  const recolored = assessComposition(stack);
  assert.equal(paletteChangeResolves(findings, recolored), false);
  const root = temp();
  save(join(root, "onboarding/storyboard.json"), stack);
  const id = findings[0]!.id;
  assert.equal(recheckCompositionFinding(root, id).resolved, false);
  save(join(root, "onboarding/storyboard.json"), list);
  assert.equal(recheckCompositionFinding(root, id).resolved, true);
  assert.match(validateStoryboardDesign({ ...stack, designContractVersion: undefined }).join(" "), /designContractVersion/);
});

test("editorial scan keeps purchase qualifications and flags audit leakage", () => {
  assert.equal(classifyPublicSentence("Estimates may vary after the inspection.").kind, "ok");
  assert.equal(classifyPublicSentence("Screenshot provenance: this is a model-evidence note.").kind, "internal-commentary");
  assert.equal(classifyPublicSentence("This illustration is not a live product UI.").kind, "internal-commentary");
  assert.equal(classifyPublicSentence("We think this might be the right tone.").kind, "uncertain");
  const gaps = visualFindingGaps({
    id: "v1", page: "/", section: "hero", evidence: "", severity: "major", problem: "premium", repair: "", target: "representative", verify: "",
  });
  assert.match(gaps.join(" "), /viewport/);
});

test("missing Jev scores stay unavailable", async () => {
  const root = temp();
  const client = new JevClient({
    root, apiKey: "k",
    fetch: async () => new Response(JSON.stringify({ model: "jev-1.13.0", answers: {}, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 }),
    config: { ...DEFAULT_JEV_CONFIG, model: "jev-1.13.0" },
  });
  const scores = await scoreCreativeCandidates({
    client, nodeId: "direction-review", context: "Roof repair",
    candidates: [{ id: "A", proposal: "A written diagnostic" }],
  });
  assert.equal(scores[0]?.status, "unavailable");
  assert.equal(scores[0]?.combined, undefined);
  assert.equal(scores[0]?.dimensions.audience_fit?.state, "unavailable");

});

test("headline edits stay in copy, image replacement stays out of direction, and binding ignores copy", () => {
  const headline = classifyChange("Change the homepage headline to Slate repair");
  assert.equal(headline.scope, "copy");
  assert.equal(requestNodesFor(headline.scope).includes("direction"), false);
  const image = classifyChange("Replace the hero image with the north slope photo");
  assert.equal(image.scope, "media");
  assert.deepEqual(requestNodesFor("media"), ["media", "representative", "pages"]);
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });
  const direction: Direction = {
    version: 2, businessHash: "b", request: "", selected: "a", rationale: "Fits",
    candidates: [], system: { personality: "", typography: "", colorRoles: "", density: "", rhythm: "", mediaTreatment: "", surfaces: "", navigation: "", motifs: "", interiors: "", avoid: [] },
    studies: [], designContractVersion: 1, centralIdea: "Diagnostic first", identityInvariants: ["No stock photos"], decisions: [],
  };
  save(join(root, "onboarding/direction.json"), direction);
  const before = representativeBindingHash(root);
  save(join(root, "onboarding/copy-plan.json"), { pages: [{ sections: [{ heading: "Changed" }] }] });
  assert.equal(representativeBindingHash(root), before);
  direction.centralIdea = "A different thesis";
  save(join(root, "onboarding/direction.json"), direction);
  assert.notEqual(representativeBindingHash(root), before);
});

test("design-assist preset does not override an explicit off", () => {
  const raised = mergeJevConfig({}, ["--design-assist"]);
  assert.equal(raised.mode, "assist");
  assert.equal(raised.capabilities?.creativeScoring, "assist");
  assert.equal(raised.capabilities?.compositionCheck, "assist");
  assert.equal(raised.workOwnership, "agent");
  const held = mergeJevConfig({}, ["--design-assist", "--jev-mode", "off"]);
  assert.equal(held.mode, "off");
  assert.equal(held.capabilities?.creativeScoring, "off");
  const explicit = mergeJevConfig({ capabilities: { creativeScoring: "off" } }, ["--design-assist"]);
  assert.equal(explicit.capabilities?.creativeScoring, "off");
});

test("legacy narrative does not pass the narrative gate", () => {
  const root = temp();
  mkdirSync(join(root, "onboarding"), { recursive: true });
  writeFileSync(join(root, "onboarding/notes.md"), "Repairs slate roofs");
  save(join(root, "onboarding/business.json"), { ...business, evidence: [{ id: "e1", source: "onboarding/notes.md", excerpt: "Repairs slate roofs" }] });
  save(join(root, "onboarding/media-inventory.json"), { version: 2, harvestHash: "x", assets: [] });
  save(join(root, "onboarding/narrative-brief.json"), narrative({ schemaVersion: 1 }));
  assert.equal(evaluateV2(root, "narrative").ok, false);
  assert.match(evaluateV2(root, "narrative").failures.join(" "), /inspectable history|design-opportunity/);
  assert.ok(readFileSync(join(kernel, "design-system/knowledge/v1/manifest.json"), "utf8").includes("labeledPreferenceData"));
});
