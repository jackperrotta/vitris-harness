import {refreshFixtureCalibration} from "./agent/design-fixtures.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { confinedReferencePath, loadReferenceCatalog, referenceContext, referenceHash, referencePolicy, referenceSignals, selectReferences, validateReferenceCatalog, validateReferenceDependencies, type ReferenceSignals } from "./agent/reference-library.ts";
import { parseGraphYaml, initialState } from "./agent/graph.ts";
import { prepareStage } from "./agent/lifecycle.ts";
import { resolveDesignContextExpansion } from "./agent/design-context-store.ts";
import { runCreativeProfile } from "./agent/creative-profile.ts";
import { expandPacketItem } from "./agent/jev/packets.ts";
import { inputHash, instructionContractHash } from "./agent/runner.ts";
import { fingerprint } from "./agent/artifacts.ts";
import { loadReferenceStudies, referenceStudyExpansions } from "./agent/reference-studies.ts";
import { referenceExposure } from "./agent/reference-exposure.ts";
import { validateReferenceSelection } from "./agent/reference-contract.ts";
import type { ReferenceAnalysis } from "./agent/artifacts.ts";

const kernel = resolve(import.meta.dirname, "..");
const pack = loadReferenceCatalog(kernel, kernel);
test("ingestion rejects unresolved lesson and original dependencies before publication", () => {
  const invalid=structuredClone(pack.catalog);
  invalid.records[0]!.lessonIds=["nonexistent-lesson"];
  assert.throws(()=>validateReferenceDependencies(invalid,kernel,pack.base),/Missing reference lesson link/);
  invalid.records[0]!.lessonIds=pack.catalog.records[0]!.lessonIds;
  invalid.records[0]!.relatedExamples=["nonexistent-study"];
  assert.throws(()=>validateReferenceDependencies(invalid,kernel,pack.base),/Missing original study link/);
});
const fresh = () => mkdtempSync(join(tmpdir(), "vitris-reference-"));
const save = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2));
const signal = (known: string[], absent: string[] = []): ReferenceSignals => ({ known, absent, theme: "", roles: ["home", "detail"], complexity: "low", origins: [] });
function syntheticSelection(receipt: NonNullable<ReturnType<typeof referenceContext>>["receipt"]): NonNullable<ReferenceAnalysis["referenceSelection"]> {
  const accepted={...receipt,
    selected:receipt.selected.map(s=>({...s,reason:"Synthetic test relevance"})),
    teachingSelected:receipt.teachingSelected.map(s=>({...s,reason:"Synthetic test relevance"})),
    inspectedEvidence:[] as NonNullable<ReferenceAnalysis["referenceSelection"]>["inspectedEvidence"],
    plannedRelationships:{homepage:"Synthetic opening",interior:"Synthetic detail",mobile:"Synthetic reflow",action:"Synthetic action"}};
  for (const s of accepted.selected) for (const width of [1440,390]) accepted.inspectedEvidence.push({...s,route:pack.catalog.records.find(r=>r.id===s.id)!.resolvedUrl!,viewport:{width,height:width===390?844:900},evidencePointer:"test-only synthetic fixture",observed:"Synthetic structural validation"});
  for (const s of accepted.teachingSelected) for (const route of ["/","/detail"]) for (const width of [1440,390]) accepted.inspectedEvidence.push({...s,route,viewport:{width,height:width===390?844:900},evidencePointer:"test-only synthetic fixture",observed:"Synthetic structural validation"});
  return accepted;
}

test("planned product imagery cannot become usable UI; actual inventories and tasks constrain selection", () => {
  const root=fresh(); mkdirSync(join(root,"onboarding"),{recursive:true});
  save(join(root,"onboarding/business.json"),{offer:"Software workflow service"});
  save(join(root,"onboarding/narrative-brief.json"),{visitorQuestions:[{id:"q1",question:"Compare product screenshots and understand the process"}]});
  const planned=referenceSignals(root);
  assert.ok(!planned.known.includes("approved-image") && !planned.known.includes("product-ui"));
  assert.ok(planned.visitorTasks?.includes("compare-options"));
  const restricted=selectReferences(pack,planned);
  assert.ok(restricted.selected.every(s=>pack.catalog.records.find(r=>r.id===s.id)!.assetMinimum==="none"));
  save(join(root,"onboarding/media-inventory.json"),{assets:[{id:"ui",kind:"image",inspected:true,disposition:"use",role:"product screenshot"}]});
  const actual=referenceSignals(root);
  assert.ok(actual.known.includes("approved-image") && actual.known.includes("product-ui"));
  assert.ok(!actual.known.includes("multiple-images"));
  const originals=referenceStudyExpansions(kernel,actual,[]);
  assert.ok(originals.selected.every(s=>loadReferenceStudies(kernel).catalog.studies.find(r=>r.id===s.id)!.assetMinimum!=="multiple-images"));
  const chosen=restricted.selected[0]!;
  assert.throws(()=>selectReferences(pack,planned,[chosen.id,chosen.id]),/Duplicate/);
});

test("exposure diagnostics collapse duplicate packets, preserve treatment pins and never count delivery as inspection", () => {
  const directory=fresh(), receipt=selectReferences(pack,signal(["real-copy","sparse-media"],["approved-image"]));
  save(join(directory,"ordinary.json"),{manifest:{referenceSelection:receipt}});
  save(join(directory,"creative.json"),{referenceSelection:receipt});
  const report=referenceExposure(directory);
  assert.equal(report.distinctContexts,1); assert.equal(report.exposures[0]!.files.length,2);
  assert.equal(report.exposures[0]!.inspected,0); assert.equal(report.selectionHistoryInfluence,"none");
  save(join(directory,"changed-release.json"),{receipt:{...receipt,manifestHash:"0".repeat(64)}});
  assert.equal(referenceExposure(directory).distinctContexts,2);
});

test("catalog quarantines missing contracts, invented deep coverage, candidates and uncleared material", () => {
  assert.deepEqual(validateReferenceCatalog(pack.catalog), []);
  const copy = structuredClone(pack.catalog), r = copy.records[0]!;
  r.structure = {} as typeof r.structure;
  r.views = undefined as unknown as typeof r.views;
  r.evidenceLevel = "deep-reviewed";
  assert.ok(validateReferenceCatalog(copy).some(e => /incomplete structure/.test(e)));
  assert.ok(validateReferenceCatalog(copy).some(e => /missing mobile/.test(e)));
  r.views = []; r.evidenceLevel = "candidate";
  assert.ok(validateReferenceCatalog(copy).some(e => /ineligible evidence/.test(e)));
  r.eligible.images = true;
  assert.ok(validateReferenceCatalog(copy).some(e => /uncleared/.test(e)));
});

test("publisher duplication and capture paths/hashes cannot escape or silently drift", () => {
  const copy = structuredClone(pack.catalog);
  copy.records.push({ ...structuredClone(copy.records[0]!), id: "duplicate-site" });
  assert.ok(validateReferenceCatalog(copy).some(e => /duplicate publisher/.test(e)));
  assert.throws(() => confinedReferencePath(kernel, "../private"), /escapes/);
  const fake = fresh();
  cpSync(join(kernel, "design-system/references"), join(fake, "design-system/references"), { recursive: true });
  const base = join(fake, "design-system/references/v1");
  const catalog = structuredClone(pack.catalog);
  catalog.records[0]!.views[0]!.capture = { path: "missing.png", sha256: "0".repeat(64) };
  save(join(base, "catalog.json"), catalog);
  const manifest = { ...pack.manifest, catalog: { path: "catalog.json", sha256: referenceHash(readFileSync(join(base, "catalog.json"))) } };
  save(join(base, "manifest.json"), manifest);
  assert.throws(() => loadReferenceCatalog(fake, fake), /Missing or changed/);
  writeFileSync(join(base, "catalog.json"), "{}");
  assert.throws(() => loadReferenceCatalog(fake, fake), /hash mismatch/);
});

test("original studies require pinned source/previews, four reviewed views and replayable accepted choices", () => {
  const original = loadReferenceStudies(kernel);
  assert.ok(original.catalog.studies.length >= 4);
  const selected = referenceStudyExpansions(kernel, signal(["professional-service", "sparse-media", "process"], ["approved-image"]), []);
  assert.ok(selected.selected.length);
  assert.ok(selected.expansions.every(e => /Fictional|fictional/.test(e.text) && /absolutePath/.test(e.text)));
  assert.deepEqual(referenceStudyExpansions(kernel, signal(["professional-service", "sparse-media", "process"], ["approved-image"]), [], selected.selected).selected, selected.selected);
  assert.throws(()=>referenceStudyExpansions(kernel,signal(["professional-service"]),[],[{id:selected.selected[0]!.id,revision:99}]),/unavailable/);
  const fake = fresh();
  cpSync(join(kernel,"design-system/compositions/v2"),join(fake,"design-system/compositions/v2"),{recursive:true});
  writeFileSync(join(fake,"design-system/compositions/v2",original.catalog.studies[0]!.sourcePath,"pages/index.html"),"changed source");
  assert.throws(()=>loadReferenceStudies(fake),/Missing or changed/);
});

test("fit precedes complementarity, replay is deterministic, absent media and retired sources stay excluded", () => {
  const rich = selectReferences(pack, signal(["collection", "multiple-images", "approved-image", "type-content", "comparison", "action"]));
  assert.deepEqual(rich, selectReferences(pack, signal(["collection", "multiple-images", "approved-image", "type-content", "comparison", "action"])));
  const sparse = selectReferences(pack, signal(["professional-service", "sparse-media", "comparison", "action"], ["approved-image", "multiple-images"]));
  assert.ok(sparse.selected.every(s => pack.catalog.records.find(r => r.id === s.id)!.assetMinimum === "none"));
  assert.notDeepEqual(sparse.selected.map(s => s.id), rich.selected.map(s => s.id));
  const none = selectReferences(pack, signal([]));
  assert.equal(none.selected.length, 0);
  assert.ok(none.gaps.length);
  const copied = { ...pack, catalog: structuredClone(pack.catalog) };
  copied.catalog.records.forEach(r => { r.lifecycle = "retired"; r.eligible.metadata = false; });
  assert.equal(selectReferences(copied, rich.signals).selected.length, 0);
  assert.throws(() => selectReferences(copied, rich.signals, [rich.selected[0]!.id]), /unavailable/);
  assert.deepEqual(rich.inspectedEvidence, [], "delivered records must never masquerade as inspected pixels");
});

function site(optIn = true) {
  const root = fresh();
  cpSync(join(kernel, "src/test/fixtures/active-agent-site"), root, { recursive: true });refreshFixtureCalibration(root,kernel);
  cpSync(join(kernel, "agent/refs"), join(root, "agent/refs"), { recursive: true });
  const launchPath = join(root, "launch.json"), launch = JSON.parse(readFileSync(launchPath, "utf8"));
  if (optIn) launch.designReferences = { mode: "lessons", release: pack.manifest.release, manifestHash: pack.manifestHash };
  else delete launch.designReferences;
  save(launchPath, launch);
  mkdirSync(join(root, "agent/runs"), { recursive: true });
  return root;
}

test("no policy preserves legacy behavior and authoring defaults; accepted revisions remain integrity-bound", () => {
  const legacy = site(false);
  assert.equal(referencePolicy(legacy), undefined);
  assert.equal(referenceContext(legacy, "direction", kernel), undefined);
  const root = site();
  const selected = referenceContext(root, "reference-analysis", kernel)!;
  assert.ok(selected.receipt.selected.length);
  assert.ok(selected.receipt.selected.length + selected.receipt.teachingSelected.length <= 5);
  const pinned = site(), launch = JSON.parse(readFileSync(join(pinned,"launch.json"),"utf8"));
  launch.designReferences.teachingManifestHash = "0".repeat(64); save(join(pinned,"launch.json"),launch);
  assert.throws(()=>referenceContext(pinned,"reference-analysis",kernel),/Pinned original teaching manifest changed/);
  const path = join(root, "onboarding/reference-analysis.json"), analysis = JSON.parse(readFileSync(path, "utf8"));
  analysis.referenceSelection = { manifestHash: selected.pack.manifestHash, selected: selected.receipt.selected };
  save(path, analysis);
  assert.equal(referenceContext(root, "pages", kernel)!.receipt.accepted, true);
  analysis.referenceSelection.selected[0].revision++;
  save(path, analysis);
  assert.throws(() => referenceContext(root, "pages", kernel), /revision changed/);
});

test("ordinary real preparation publishes selected references and rejects modified policy/sidecars", async () => {
  const root = site();
  const graph = parseGraphYaml(readFileSync(join(root, "agent/graph.yaml"), "utf8")), state = initialState(graph);
  for (const node of graph.nodes) state.nodes[node.id] = { status: "done", attempts: 1 };
  const previous = process.env.VITRIS_KERNEL;
  process.env.VITRIS_KERNEL = kernel;
  try {
    const result = await prepareStage({ root, kernel, graph, state, nodeId: "reference-analysis" });
    assert.equal(result.status, "prepared");
    const current = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
    assert.match(current, /Selected reference working set/);
    assert.match(current, /Delivery is not inspection/);
    const id = result.preparation!.id;
    const manifest = JSON.parse(readFileSync(join(root, `agent/runs/${id}.design-context.json`), "utf8"));
    assert.ok(manifest.manifest.referenceSelection.teachingSelected.length);
    const originalHandle = manifest.manifest.referenceSelection.teachingSelected[0].handle;
    assert.equal(resolveDesignContextExpansion(root,id,originalHandle).ok,true);
    const receipt=manifest.manifest.referenceSelection;
    const analysis=JSON.parse(readFileSync(join(root,"onboarding/reference-analysis.json"),"utf8")) as ReferenceAnalysis;
    assert.match(validateReferenceSelection(root,analysis,kernel).join(" "),/needs accepted referenceSelection/);
    // Synthetic contract fixtures exercise validation only; they are not inspection evidence.
    analysis.referenceSelection=syntheticSelection(receipt);
    const accepted=analysis.referenceSelection!;
    assert.deepEqual(validateReferenceSelection(root,analysis,kernel),[]);
    const last=accepted.inspectedEvidence.pop()!;
    assert.match(validateReferenceSelection(root,analysis,kernel).join(" "),/original needs inspected/);
    accepted.inspectedEvidence.push(last);
    accepted.inputSignalHash="0".repeat(64);
    assert.match(validateReferenceSelection(root,analysis,kernel).join(" "),/matching prepared analysis receipt/);
    accepted.inputSignalHash=receipt.inputSignalHash;
    accepted.selected[0]!.revision++;
    assert.match(validateReferenceSelection(root,analysis,kernel).join(" "),/revision unavailable/);
    accepted.selected[0]!.revision--;
    const storyboardPath=join(root,"onboarding/storyboard.json"), storyboard=readFileSync(storyboardPath);
    save(storyboardPath,{pages:[{role:"home",sections:["Later accepted development"]}]});
    assert.deepEqual(validateReferenceSelection(root,analysis,kernel),[],"Later storyboard development must not rewrite frozen discovery signals");
    writeFileSync(storyboardPath,storyboard);
    const evidence = join(kernel,"artifacts/reference-library-expansion-20261005/prepared-stage-evidence/ordinary");
    mkdirSync(evidence,{recursive:true});
    cpSync(join(root,"agent/CURRENT.md"),join(evidence,"CURRENT.md"));
    cpSync(join(root,`agent/runs/${id}.design-context.json`),join(evidence,"manifest.json"));
    cpSync(join(root,`agent/runs/${id}.design-context.expansions.json`),join(evidence,"expansions.json"));
    const handle = manifest.expansions.find((x: { id: string }) => x.id.startsWith("reference-") && x.id !== "reference-discovery").id;
    assert.equal(resolveDesignContextExpansion(root, id, handle).ok, true);
    const sidecarPath = join(root, `agent/runs/${id}.design-context.expansions.json`), sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
    sidecar.items.find((x: { id: string }) => x.id === handle).text += " fabricated change";
    save(sidecarPath, sidecar);
    assert.equal(resolveDesignContextExpansion(root, id, handle).ok, false);
    const launchPath = join(root, "launch.json"), launch = JSON.parse(readFileSync(launchPath, "utf8"));
    delete launch.designReferences; save(launchPath, launch);
    assert.equal(resolveDesignContextExpansion(root, id, "reference-discovery").ok, false);
  } finally { if (previous === undefined) delete process.env.VITRIS_KERNEL; else process.env.VITRIS_KERNEL = previous; }
});

for (const compact of [true, false]) test(`creative ${compact ? "efficiency compact" : "ordinary"} real CURRENT receives reference treatment with Jev off`, { timeout: 90_000 }, async () => {
  const previous = process.env.VITRIS_KERNEL;
  process.env.VITRIS_KERNEL = kernel;
  try {
  const root = site();
  // This test begins at the fixture's accepted shared checkpoint, after applying
  // the policy. Rebind fixture hashes so launch changes do not reopen harvest.
  const graph = parseGraphYaml(readFileSync(join(root, "agent/graph.yaml"), "utf8"));
  const statePath = join(root, "agent/STATE.json"), state = JSON.parse(readFileSync(statePath, "utf8"));
  // A synthetic accepted checkpoint exercises real planning delivery, not curation.
  const prepared=await prepareStage({root,kernel,graph,state,nodeId:"reference-analysis"});
  assert.equal(prepared.status,"prepared");
  const receipt=JSON.parse(readFileSync(join(root,`agent/runs/${prepared.preparation!.id}.design-context.json`),"utf8")).manifest.referenceSelection;
  const analysisPath=join(root,"onboarding/reference-analysis.json"), analysis=JSON.parse(readFileSync(analysisPath,"utf8"));
  analysis.referenceSelection=syntheticSelection(receipt);save(analysisPath,analysis);
  assert.deepEqual(validateReferenceSelection(root,analysis,kernel),[]);
  for (const node of graph.nodes) if (state.nodes[node.id]?.status === "done") Object.assign(state.nodes[node.id], { inputHash: inputHash(root, node), skillHash: instructionContractHash(root, node), outputHash: fingerprint(root, node.writes) });
  save(statePath, state);
  const argv = ["node", "workflow.ts", "--site", root, "--creative-profile", "--max-cumulative", "120", "--creative-efficiency", "--jev-mode", "off", ...(compact ? [] : ["--no-compact-packets"])];
  const result = await runCreativeProfile(root, kernel, argv);
  assert.equal(result.run.phase, "planning", result.summary);
  const current = readFileSync(join(root, "agent/CURRENT.md"), "utf8");
  const evidence = join(kernel,`artifacts/reference-library-expansion-20261005/prepared-stage-evidence/creative-${compact?"compact":"ordinary"}`);
  mkdirSync(evidence,{recursive:true});cpSync(join(root,"agent/CURRENT.md"),join(evidence,"CURRENT.md"));
  assert.match(current, /Reference release 2026-10-05.1/);
  assert.match(current, /Delivery is not inspection/);
  if (compact) {
    const node = `${result.run.id}-plan`, manifest = JSON.parse(readFileSync(join(root, `agent/runs/${node}.manifest.json`), "utf8"));
    assert.ok(manifest.visibleBytesEstimated <= 40_000);
    assert.ok(manifest.referenceSelection.selected.length);
    assert.ok(manifest.referenceSelection.teachingSelected.length);
    cpSync(join(root,`agent/runs/${node}.manifest.json`),join(evidence,"manifest.json"));
    cpSync(join(root,`agent/runs/${node}.expansions`),join(evidence,"expansions"),{recursive:true});
    assert.deepEqual(manifest.referenceSelection.inspectedEvidence, []);
    const text = expandPacketItem(root, node, "reference-discovery", manifest.manifestHash);
    assert.match(text, /inputSignalHash/);
  } else {
    assert.match(current, /references-plan.json/);
    cpSync(join(root,`agent/creative-runs/${result.run.id}/references-plan.json`),join(evidence,"references-plan.json"));
  }
  } finally { if (previous === undefined) delete process.env.VITRIS_KERNEL; else process.env.VITRIS_KERNEL = previous; }
});
