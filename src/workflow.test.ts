import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fingerprint, replacePath, save, sourceHash, within, type Business, type MediaInventory } from "./agent/artifacts.ts";
import { initialState, invalidate, isPreviewReady, nextNode, parseGraphYaml, validateGraph, type SkillGraph, type AgentState } from "./agent/graph.ts";
import { begin, finish, inputHash, reconcile } from "./agent/runner.ts";
import { evaluateV2, reviewSubject, REVIEW_CRITERIA } from "./agent/evaluate.ts";
import { gradeHarvest } from "./agent/grade.ts";
import { buildVerified } from "./build/verified.ts";
import { previewServer } from "./build/serve.ts";
import { isErrorPage } from "./onboard/quality.ts";
import { crawlSiteBrowser } from "../scripts/onboard/browser.ts";
import { legacyDependencies } from "./agent/migration-links.ts";
import { runWorkflow } from "./agent/workflow.ts";
import { beginChange, loadSiteMemory, seedSiteMemory } from "./agent/refine.ts";
import { calibrationPackHash } from "./agent/design-calibration.ts";
import { loadKnowledgeCatalog } from "./agent/design-knowledge.ts";

const kernel = resolve(import.meta.dirname, "..");
const graph = () => parseGraphYaml(readFileSync(join(kernel, "agent/graph.yaml"), "utf8"));
const temp = () => mkdtempSync(join(tmpdir(), "vitris-workflow-"));
const write = (root: string, path: string, content: string) => { const target = within(root, path); mkdirSync(resolve(target, ".."), { recursive: true }); writeFileSync(target, content); };
const cleanEnv = () => {
  const env = { ...process.env };
  delete env.VITRIS_WORKER_NODE;
  delete env.VITRIS_RUNNER_PID;
  return env;
};
const business: Business = { version: 2, offer: "Roof repairs", audience: "Local homeowners", trigger: "A leak", outcome: "A repaired roof", includes: ["Inspection"], engagement: "Request an estimate", positioning: "Local repairs", facts: [{ id: "f1", claim: "Repairs roofs", evidence: ["e1"] }], evidence: [{ id: "e1", source: "onboarding/copy/home.md", excerpt: "We repair roofs" }], uncertainties: [] };

test("migration guard catches old-origin navigation, embeds and form handoffs", () => {
  const routes = [{ source: "https://old.example/schedule-demo" }];
  for (const html of ['<a href="https://old.example/schedule-demo#calendar">Open</a>', "<IFRAME SRC='//old.example/schedule-demo/'></IFRAME>", '<form action=https://old.example/schedule-demo?submit=1></form>', '<area href="https:&#47;&#47;old.example/schedule-demo">']) assert.equal(legacyDependencies(html, routes).length, 1, html);
});
test("migration guard permits local navigation and independent services", () => {
  for (const href of ["/schedule-demo", "mailto:owner@example.com", "https://booking.example/calendar", "https://portal.old.example/schedule-demo", "https://old.example/other"]) assert.deepEqual(legacyDependencies(`<a href="${href}">Go</a>`, [{ source: "https://old.example/schedule-demo" }]), []);
});
test("migration guard ignores inert markup examples and data attributes", () => {
  const url = "https://old.example/schedule-demo";
  assert.deepEqual(legacyDependencies(`<!-- <a href="${url}"> --><script>const s='<a href="${url}">';</script><style>/* <a href="${url}"> */</style><a data-href="${url}" href="/contact">Contact</a>&lt;a href="${url}"&gt;`, [{ source: url }]), []);
});
test("browser evaluator rejects a legacy handoff despite a passing screenshot report", () => {
  const root = temp();
  save(join(root, "onboarding/storyboard.json"), { pages: [{ path: "/" }], routes: [{ source: "https://old.example/schedule-demo" }] });
  write(root, "dist/index.html", '<h1>Demo</h1><a href="https://old.example/schedule-demo#calendar">Open calendar</a>');
  write(root, "agent/screenshots/home.png", "");
  writeFileSync(join(root, "agent/screenshots/home.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64"));
  const report = () => save(join(root, "agent/reviews/browser.json"), { sourceHash: sourceHash(root), distHash: fingerprint(root, ["dist"]), checks: [375, 1080].map(width => ({ path: "/", width, screenshot: "agent/screenshots/home.png", screenshotHash: fingerprint(root, ["agent/screenshots/home.png"]), failures: [] })) });
  report(); assert.match(evaluateV2(root, "browser").failures.join(), /Legacy-origin dependency/);
  write(root, "dist/index.html", '<h1>Demo request</h1><a href="mailto:owner@example.com">Request a demo</a>');
  report(); assert.equal(evaluateV2(root, "browser").ok, true);
  write(root, "dist/cookie-compliance/index.html", "<h1>Cookie preferences</h1>");
  // Exercise consent readiness for an emitted analytics runtime, not a quiet utility fixture.
  write(root, "dist/index.html", '<h1>Demo request</h1><script data-kernel="https://kernel.example.invalid"></script>');
  report(); assert.match(evaluateV2(root, "browser").failures.join(), /saved-preference consent check/);
});

test("graph rejects cycles, missing dependencies and duplicate IDs", () => {
  const g = graph(); g.nodes[0]!.needs = ["preview"]; assert.throws(() => validateGraph(g), /Cycle/);
  const missing = graph(); missing.nodes[0]!.needs = ["absent"]; assert.throws(() => validateGraph(missing), /Unknown dependency/);
  const dup = graph(); dup.nodes.push(dup.nodes[0]!); assert.throws(() => validateGraph(dup), /duplicate/);
});
test("all shipped graph skills and commands resolve", () => {
  for (const node of graph().nodes) {
    for (const ref of [...node.refs, ...(node.optionalRefs || [])]) assert.ok(existsSync(join(kernel, "agent/refs", `${ref}.md`)), ref);
    if (node.kind === "tool") assert.ok(existsSync(node.command![1]!.replace("{harness}", kernel).replace("{kernel}", kernel)), node.id);
  }
});
test("preview flag cannot bypass dependencies and attempts survive invalidation", () => {
  const g = graph(), state = initialState(g); state.preview_ready = true;
  assert.equal(isPreviewReady(g, state), false);
  state.nodes.harvest!.attempts = 4; invalidate(g, state, "harvest");
  assert.throws(() => nextNode(g, state), /exhausted/);
});
test("seeding site memory does not reopen business during a copy refinement", () => {
  const root = temp(), node = graph().nodes.find(n => n.id === "business")!;
  write(root, "agent/graph.yaml", readFileSync(join(kernel, "agent/graph.yaml"), "utf8"));
  write(root, "agent/PROMPT.md", "pilot");
  const before = inputHash(root, node);
  write(root, "agent/site-memory.json", '{"identity":"pilot"}');
  write(root, "agent/requests/copy.json", '{"scope":"copy"}');
  assert.equal(inputHash(root, node), before);
  write(root, "agent/requests/business.json", '{"scope":"business"}');
  const requested = inputHash(root, node);
  assert.notEqual(requested, before);
  write(root, "agent/site-memory.json", '{"identity":"accepted-after-review"}');
  assert.equal(inputHash(root, node), requested);
});
test("failed critic routes repair, retains feedback and consumes persistent budgets", () => {
  const root = temp(), g = graph(), state = initialState(g), node = g.nodes.find(n => n.id === "business-review")!;
  state.nodes.harvest!.status = "done"; state.nodes.business = { status: "done", attempts: 2 };
  begin(root, g, state, node); finish(root, g, state, node, ["Unsupported claim"]);
  assert.equal(nextNode(g, state)?.id, "business"); assert.equal(state.nodes.business!.attempts, 2);
  assert.equal(state.nodes[node.id]!.attempts, 1); assert.deepEqual(state.nodes[node.id]!.failures, ["Unsupported claim"]);
});
test("content critic can route a factual defect upstream instead of repeatedly editing pages", () => {
  const root = temp(), g = graph(), state = initialState(g), node = g.nodes.find(n => n.id === "content-review")!;
  for (const n of g.nodes) state.nodes[n.id] = { status: "done", attempts: 1 };
  save(join(root, "agent/reviews/content-review.json"), { subjectHash: reviewSubject(root, node.id), findings: [{ severity: "major", target: "business", problem: "False offer" }] });
  begin(root, g, state, node); finish(root, g, state, node, ["False offer"]);
  assert.equal(state.nodes.harvest!.status, "done"); assert.equal(nextNode(g, state)?.id, "business");
  assert.equal(state.nodes.business!.attempts, 1);
});
test("historical representative stage stays passed after full implementation; final changes invalidate", () => {
  const root = temp();
  const g: SkillGraph = { version: 2, stop_at: "preview", nodes: [
    { id: "representative", needs: [], refs: [], tools: [], inputs: ["brief"], writes: ["pages"], eval: "representative", maxAttempts: 4, historicalAfter: "pages" },
    { id: "pages", needs: ["representative"], refs: [], tools: [], writes: ["pages"], eval: "pages", maxAttempts: 4 },
    { id: "preview", needs: ["pages"], refs: [], tools: [], inputs: ["pages"], writes: [], eval: "preview", maxAttempts: 4 }
  ] };
  const state = initialState(g); write(root, "pages/index.html", "first");
  begin(root, g, state, g.nodes[0]!); finish(root, g, state, g.nodes[0]!, []);
  write(root, "pages/index.html", "complete");
  for (const node of g.nodes.slice(1)) { begin(root, g, state, node); finish(root, g, state, node, []); }
  reconcile(root, g, state); assert.equal(state.preview_ready, true);
  write(root, "pages/index.html", "changed after review"); reconcile(root, g, state);
  assert.equal(state.nodes.representative!.status, "done"); assert.equal(state.nodes.pages!.status, "pending"); assert.equal(state.preview_ready, false);
});
test("pages edit does not reopen representative after copy expansion", () => {
  const root = temp();
  const g: SkillGraph = { version: 3, stop_at: "pages", nodes: [
    { id: "representative", needs: [], refs: [], tools: [], inputs: ["brief"], writes: ["pages"], eval: "representative", maxAttempts: 4, historicalAfter: "pages" },
    { id: "copy-expansion", needs: ["representative"], refs: [], tools: [], inputs: ["brief"], writes: [], eval: "copy-expansion", maxAttempts: 4 },
    { id: "pages", needs: ["copy-expansion"], refs: [], tools: [], inputs: ["pages"], writes: ["pages"], eval: "pages", maxAttempts: 4 },
  ] };
  const state = initialState(g);
  write(root, "pages/index.html", "representative");
  begin(root, g, state, g.nodes[0]!); finish(root, g, state, g.nodes[0]!, []);
  begin(root, g, state, g.nodes[1]!); finish(root, g, state, g.nodes[1]!, []);
  write(root, "pages/index.html", "expanded");
  reconcile(root, g, state);
  assert.equal(state.nodes.representative!.status, "done");
  assert.equal(state.nodes.pages!.status, "pending");
});
test("business evaluator rejects unsupported claims and blocked unknowns", () => {
  const root = temp(); save(join(root, "onboarding/business.json"), business);
  write(root, "onboarding/copy/home.md", "We repair roofs");
  assert.equal(evaluateV2(root, "business").ok, true);
  save(join(root, "onboarding/business.json"), { ...business, facts: [{ id: "f1", claim: "Award winning", evidence: ["invented"] }] });
  assert.match(evaluateV2(root, "business").failures.join(), /Unsupported/);
  save(join(root, "onboarding/business.json"), { ...business, uncertainties: [{ blocking: true, question: "What is sold?" }] });
  assert.match(evaluateV2(root, "business").failures.join(), /Unresolved/);
});
test("media evaluator detects omitted assets and stale harvest evidence", () => {
  const root = temp(); write(root, "media/harvest/roof.svg", "<svg/>"); save(join(root, "onboarding/brief.json"), {});
  const m: MediaInventory = { version: 2, harvestHash: fingerprint(root, ["onboarding/brief.json", "media/harvest"]), assets: [] };
  save(join(root, "onboarding/media-inventory.json"), m);
  assert.match(evaluateV2(root, "media").failures.join(), /Unaccounted/);
  m.assets.push({ id: "roof", path: "/media/harvest/roof.svg", sources: [], description: "Roof", role: "project", disposition: "retain", reason: "Alternate view", inspected: true, placements: [] });
  save(join(root, "onboarding/media-inventory.json"), m); assert.equal(evaluateV2(root, "media").ok, true);
  write(root, "media/harvest/roof.svg", "<svg>new</svg>"); assert.match(evaluateV2(root, "media").failures.join(), /stale/);
});
test("refreshing the contact sheet preserves recovered originals and completed media decisions", () => {
  const root = temp(); write(root, "media/harvest/logo.svg", "<svg/>");
  save(join(root, "onboarding/brief.json"), { images: [
    { sourceUrl: "https://example.test/logo.svg", localPath: "/media/harvest/logo.svg" },
    { sourceUrl: "https://example.test/project.svg" }
  ] });
  const prepare = () => spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/prepare-media.ts"), "--site", root], { encoding: "utf8" });
  assert.equal(prepare().status, 0);
  const path = join(root, "onboarding/media-inventory.json");
  const inventory = JSON.parse(readFileSync(path, "utf8")) as MediaInventory;
  Object.assign(inventory.assets[0]!, { disposition: "retain", reason: "Original brand", inspected: true });
  write(root, "media/recovered/project.svg", "<svg>recovered</svg>");
  save(path, inventory);
  const registered = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/prepare-media.ts"), "--site", root, "--register", "media/recovered/project.svg", "--source", "https://example.test/project.svg", "--disposition", "use", "--id", "recovered-project", "--description", "Original project", "--role", "project"], { encoding: "utf8" });
  assert.equal(registered.status, 0, registered.stderr);
  const withRegistered = JSON.parse(readFileSync(path, "utf8")) as MediaInventory;
  Object.assign(withRegistered.assets.find(asset => asset.id === "recovered-project")!, { reason: "Business evidence", inspected: true, placements: ["/"] });
  save(path, withRegistered); assert.equal(prepare().status, 0);
  const refreshed = JSON.parse(readFileSync(path, "utf8")) as MediaInventory;
  assert.deepEqual(refreshed.assets, withRegistered.assets);
  assert.deepEqual(refreshed.unavailable, []);
  assert.equal(evaluateV2(root, "media").ok, true);
});

test("preview treats representative quality as historical after pages start", () => {
  const root = temp();
  save(join(root, "agent/graph.yaml"), {
    version: 3,
    stop_at: "preview_ready",
    nodes: [
      { id: "representative-quality", needs: [], refs: [], tools: [], writes: [], eval: "representative-quality", maxAttempts: 3, historicalAfter: "pages" },
      { id: "pages", needs: ["representative-quality"], refs: [], tools: [], writes: [], eval: "pages", maxAttempts: 4 },
      { id: "preview", needs: ["pages"], refs: [], tools: [], writes: [], eval: "preview", maxAttempts: 4 },
    ],
  });
  save(join(root, "agent/STATE.json"), {
    version: 3, status: "in_progress", current: "preview", preview_ready: false, launched: false, iteration: 1,
    nodes: {
      "representative-quality": { status: "done", attempts: 1 },
      pages: { status: "done", attempts: 1 },
    },
  });
  save(join(root, "onboarding/media-inventory.json"), { version: 2, assets: [{ id: "hero", path: "/media/hero.svg", disposition: "use" }] });
  save(join(root, "onboarding/storyboard.json"), { pages: [{ path: "/", sections: [{ media: ["hero"] }] }] });
  write(root, "dist/index.html", '<img src="/media/hero.svg">');
  const skipped = evaluateV2(root, "preview");
  assert.equal(skipped.failures.some(f => f.startsWith("representative-quality:")), false);
  save(join(root, "agent/STATE.json"), {
    version: 3, status: "in_progress", current: "preview", preview_ready: false, launched: false, iteration: 1,
    nodes: {
      "representative-quality": { status: "done", attempts: 1 },
      pages: { status: "pending", attempts: 0 },
    },
  });
  const current = evaluateV2(root, "preview");
  assert.ok(current.failures.some(f => /representative-quality/.test(f)));
});

test("final acceptance detects missing interior media beyond the initial shortlist", () => {
  const root = temp();
  save(join(root, "onboarding/media-inventory.json"), { version: 2, assets: [{ id: "interior-project", path: "/media/project.svg", disposition: "retain" }] });
  save(join(root, "onboarding/storyboard.json"), { pages: [{ path: "/portfolio", sections: [{ media: ["interior-project"] }] }] });
  write(root, "dist/index.html", '<img src="/media/project.svg">');
  write(root, "dist/portfolio/index.html", '<h1>Portfolio</h1>');
  const grade = evaluateV2(root, "preview");
  assert.ok(grade.failures.includes("Media interior-project absent from planned route /portfolio"));
  write(root, "dist/portfolio/index.html", '<h1>Portfolio</h1><img src="/media/project.svg">');
  assert.equal(evaluateV2(root, "preview").failures.some(f => f.includes("Media interior-project absent")), false);
});

test("a direction cannot silently replace an explicit operator theme", () => {
  const root = temp(); save(join(root, "onboarding/business.json"), business);
  save(join(root, "agent/request.json"), { theme: "Warm editorial with serif headings" });
  write(root, "onboarding/studies/a.html", "<h1>A</h1>"); write(root, "onboarding/studies/b.html", "<h1>B</h1>");
  const direction = { version: 2, businessHash: fingerprint(root, ["onboarding/business.json"]), request: "Blue corporate", selected: "a", rationale: "Business fit", candidates: ["a", "b", "c"].map(id => ({ id, rationale: "Business fit", typography: "Serif", composition: "Editorial", mediaTreatment: "Contained projects" })), system: Object.fromEntries(["personality", "typography", "colorRoles", "density", "rhythm", "mediaTreatment", "surfaces", "navigation", "motifs", "interiors"].map(key => [key, "Defined"])), studies: ["a", "b"].map(candidate => ({ candidate, path: `onboarding/studies/${candidate}.html` })), designContractVersion: 1 as const, centralIdea: "Warm editorial with serif headings", opportunityIds: [], decisions: [{ id: "type", kind: "typography" as const, choice: "Serif headings", rationale: "Matches the recorded theme", scope: "site", tradeoff: "Less novelty" }], rejectedAlternatives: [], identityInvariants: ["Serif headings stay"], flexibleDecisions: ["Interior density"] };
  save(join(root, "onboarding/direction.json"), direction);
  assert.match(evaluateV2(root, "direction").failures.join(), /explicit operator theme/);
  direction.request = "Warm editorial with serif headings"; save(join(root, "onboarding/direction.json"), direction);
  assert.equal(evaluateV2(root, "direction").ok, true);
});

test("reviews reject stale subjects, unknown verdicts and contradictory major findings", () => {
  const root = temp(); save(join(root, "onboarding/business.json"), business);
  const review = { version: 2, reviewer: "independent", subjectHash: reviewSubject(root, "business-review"), verdict: "pass", evidence: ["onboarding/business.json"], checks: REVIEW_CRITERIA["business-review"]!.map(criterion => ({ criterion, verdict: "pass", evidence: "Supported by captured copy" })), findings: [] as object[] };
  const path = join(root, "agent/reviews/business-review.json"); save(path, review); assert.equal(evaluateV2(root, "business-review").ok, true);
  save(path, { ...review, verdict: "unknown" }); assert.equal(evaluateV2(root, "business-review").ok, false);
  review.findings.push({ id: "f", page: "/", section: "hero", evidence: "headline", severity: "major", problem: "Invented claim", repair: "Remove", target: "business", verify: "Compare source" });
  save(path, review); assert.match(evaluateV2(root, "business-review").failures.join(), /major/);
  save(join(root, "onboarding/business.json"), { ...business, offer: "Different" }); assert.match(evaluateV2(root, "business-review").failures.join(), /subjectHash/);
});
test("browser evidence must cover both viewport sizes and current source", () => {
  const root = temp(); save(join(root, "onboarding/storyboard.json"), { pages: [{ path: "/" }] });
  write(root, "dist/index.html", "<h1>Hi</h1>"); write(root, "agent/screenshots/home.png", "image");
  const report = { sourceHash: sourceHash(root), distHash: fingerprint(root, ["dist"]), checks: [{ path: "/", width: 1080, screenshot: "agent/screenshots/home.png", failures: [] }] };
  save(join(root, "agent/reviews/browser.json"), report); assert.match(evaluateV2(root, "browser").failures.join(), /375/);
  write(root, "pages/index.html", "changed"); assert.match(evaluateV2(root, "browser").failures.join(), /stale/);
});
test("known baseline false positives are rejected by harvest gate", () => {
  const root = temp(); save(join(root, "onboarding/brief.json"), { sourceUrl: "https://example.com", pages: [{ title: "Page Not Found" }], images: [], warnings: ["21 unvisited routes"] });
  const grade = gradeHarvest(root); assert.equal(grade.ok, false); assert.equal(grade.failures.length, 2);
  assert.equal(isErrorPage({ title: "Page Not Found", headings: [] } as never), true);
  assert.equal(isErrorPage({ title: "", headings: ["We could not find the product you are searching for. Return home ."] }), true);
  assert.equal(isErrorPage({ title: "About", headings: ["Find the right service for your business"] }), false);
});
test("save replaces an existing artifact file", () => {
  const root = temp();
  const path = join(root, "onboarding/crawl-progress.json");
  save(path, { n: 1 });
  save(path, { n: 2 });
  assert.equal(JSON.parse(readFileSync(path, "utf8")).n, 2);
  const extra = join(root, "onboarding/other.json");
  writeFileSync(extra, "{\"n\":1}\n");
  const tmp = join(root, "onboarding/other.json.swap.tmp");
  writeFileSync(tmp, "{\"n\":3}\n");
  replacePath(tmp, extra);
  assert.equal(JSON.parse(readFileSync(extra, "utf8")).n, 3);
});
test("verified build copies local media/public files, replaces stale output and preserves prior preview on failure", async () => {
  const root = temp(); cpSync(join(kernel, "src/test/fixtures/site"), root, { recursive: true });
  write(root, "media/harvest/sample.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
  write(root, "public/nested/example.txt", "hello");
  write(root, "pages/index.html", '<h1>Preview</h1><img src="/media/harvest/sample.svg" alt="Sample">');
  await buildVerified(root);
  assert.ok(existsSync(join(root, "dist/media/harvest/sample.svg"))); assert.ok(existsSync(join(root, "dist/nested/example.txt")));
  write(root, "dist/stale.html", "old"); await buildVerified(root); assert.equal(existsSync(join(root, "dist/stale.html")), false);
  const before = fingerprint(root, ["dist"]); write(root, "pages/index.html", '<h1>Broken</h1><img src="/media/missing.jpg">');
  await assert.rejects(buildVerified(root), /Missing asset/); assert.equal(fingerprint(root, ["dist"]), before);
  await assert.rejects(buildVerified(root, join(root, "pages")), /source/);
});
test("migration redirects are emitted and served by the local preview", async () => {
  const root = temp(); cpSync(join(kernel, "src/test/fixtures/site"), root, { recursive: true });
  save(join(root, "onboarding/storyboard.json"), { routes: [{ source: "https://old.example/old-home", disposition: "consolidate", target: "/" }] });
  await buildVerified(root); assert.match(readFileSync(join(root, "dist/_redirects"), "utf8"), /\/old-home \/ 301/);
  const server = previewServer(join(root, "dist")); await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const response = await fetch(`${origin}/old-home`, { redirect: "manual" }); assert.equal(response.status, 301); assert.equal(response.headers.get("location"), "/");
    assert.equal((await fetch(`${origin}/old-home`)).status, 200);
    assert.equal((await fetch(`${origin}/missing`)).status, 404);
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
test("runner honors adapter failure and does not let child self-mark preview passed", () => {
  const root = temp(); cpSync(join(kernel, "agent"), join(root, "agent"), { recursive: true });
  const g = graph(); const n = g.nodes.find(n => n.id === "business")!; n.id = "preview"; n.needs = []; n.eval = "business"; n.kind = "tool"; n.command = [process.execPath, join(root, "fake.mjs")];
  save(join(root, "agent/graph.yaml"), { version: 2, stop_at: "preview", nodes: [n] });
  save(join(root, "agent/STATE.json"), initialState({ version: 2, stop_at: "preview", nodes: [n] }));
  write(root, "fake.mjs", 'import fs from "node:fs"; fs.writeFileSync("agent/STATE.json", JSON.stringify({preview_ready:true})); process.exit(7);');
  save(join(root, "agent/adapter.json"), { command: process.execPath, args: [join(root, "fake.mjs")], prompt: "stdin" });
  const run = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/ralph.ts"), "--site", root, "--once"], { encoding: "utf8", env: cleanEnv() });
  assert.equal(run.status, 1, run.stderr); const state = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8"));
  assert.equal(state.preview_ready, false); assert.equal(state.nodes.preview.status, "failed"); assert.equal(existsSync(join(root, "agent/RUN.lock")), false);
});
test("status can observe an active run without taking its lock or changing progress", () => {
  const root = temp(); cpSync(join(kernel, "agent"), join(root, "agent"), { recursive: true });
  const g = graph(), state = initialState(g); state.current = "business"; state.status = "in_progress";
  state.nodes.business = { status: "in_progress", attempts: 1 };
  save(join(root, "agent/STATE.json"), state); save(join(root, "agent/RUN.lock"), { pid: process.pid });
  const before = fingerprint(root, ["agent/STATE.json", "agent/RUN.lock"]);
  const run = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/ralph.ts"), "--site", root, "--status"], { encoding: "utf8", env: cleanEnv() });
  assert.equal(run.status, 0, run.stderr);
  const snapshot = JSON.parse(run.stdout); assert.equal(snapshot.current, "business"); assert.equal(snapshot.running.pid, process.pid);
  assert.equal(fingerprint(root, ["agent/STATE.json", "agent/RUN.lock"]), before);
});

test("scoped updates stay scoped after resume and preserve earlier operator evidence", () => {
  const root = temp(); cpSync(join(kernel, "agent"), join(root, "agent"), { recursive: true });
  const ids = ["business", "copy", "pages", "preview"];
  const g: SkillGraph = { version: 2, stop_at: "preview", nodes: ids.map((id, index) => ({ id, kind: "agent", needs: index ? [ids[index - 1]!] : [], refs: [], tools: [], writes: [`${id}.json`], inputs: id === "preview" ? [] : ["agent/change-request.json"], eval: id, maxAttempts: 4 })) };
  save(join(root, "agent/graph.yaml"), g);
  const state = initialState(g); save(join(root, "agent/STATE.json"), state);
  const request = (instruction: string, scope: string) => spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/ralph.ts"), "--site", root, "--change", instruction, "--change-scope", scope, "--prepare"], { encoding: "utf8", env: cleanEnv() });
  const first = request("We now serve Bristol", "business"); assert.equal(first.status, 0, first.stderr);
  const original = JSON.parse(readFileSync(join(root, "agent/change-request.json"), "utf8"));
  const progressed = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8"));
  for (const node of g.nodes.slice(0, 3)) { begin(root, g, progressed, node); finish(root, g, progressed, node, []); }
  const second = request("Increase the contact button size", "pages"); assert.equal(second.status, 0, second.stderr);
  const status = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/ralph.ts"), "--site", root, "--status"], { encoding: "utf8", env: cleanEnv() });
  assert.equal(status.status, 0, status.stderr);
  const resumed = JSON.parse(status.stdout);
  assert.equal(resumed.nodes.business.status, "done"); assert.equal(resumed.nodes.copy.status, "done"); assert.equal(resumed.nodes.pages.status, "pending");
  assert.equal(JSON.parse(readFileSync(join(root, original.evidencePath), "utf8")).instruction, "We now serve Bristol");
  assert.equal(JSON.parse(readFileSync(join(root, "agent/requests/business.json"), "utf8")).evidencePath, original.evidencePath);
});

test("change without scope classifies pages and seeds site memory without touching harvest", () => {
  const root = temp(); cpSync(join(kernel, "agent"), join(root, "agent"), { recursive: true });
  const ids = ["harvest", "business", "copy", "pages", "preview"];
  const g: SkillGraph = { version: 2, stop_at: "preview", nodes: ids.map((id, index) => ({ id, kind: "agent", needs: index ? [ids[index - 1]!] : [], refs: [], tools: [], writes: [`${id}.json`], eval: id, maxAttempts: 4 })) };
  save(join(root, "agent/graph.yaml"), g);
  const state = initialState(g);
  save(join(root, "agent/STATE.json"), state);
  save(join(root, "onboarding/business.json"), business);
  const progressed = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8"));
  for (const node of g.nodes.filter(n => n.id !== "preview")) { begin(root, g, progressed, node); finish(root, g, progressed, node, []); }
  const run = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/ralph.ts"), "--site", root, "--change", "Increase the contact button size", "--prepare"], { encoding: "utf8", env: cleanEnv() });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  const next = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8"));
  assert.equal(next.nodes.harvest.status, "done");
  assert.equal(next.nodes.business.status, "done");
  assert.equal(next.nodes.pages.status, "pending");
  const request = JSON.parse(readFileSync(join(root, "agent/change-request.json"), "utf8"));
  assert.equal(request.classifiedScope, "pages");
  assert.equal(request.originalRequest, "Increase the contact button size");
  assert.ok(existsSync(join(root, "agent/site-memory.json")));
  assert.ok(existsSync(join(root, "agent/refine-baseline/baseline.json")));
  assert.match(readFileSync(join(root, "agent/CURRENT.md"), "utf8"), /Skill: refine|Increase the contact button size/);
});

test("dispatched worker recognizes its parent lock and cannot start a second runner", () => {
  const root = temp(); cpSync(join(kernel, "agent"), join(root, "agent"), { recursive: true });
  const g = graph(), n = g.nodes.find(n => n.id === "business")!; n.id = "preview"; n.needs = []; n.eval = "business"; n.kind = "tool"; n.command = [process.execPath, join(root, "fake.mjs")];
  const single = { version: 2, stop_at: "preview", nodes: [n] }; save(join(root, "agent/graph.yaml"), single); save(join(root, "agent/STATE.json"), initialState(single));
  save(join(root, "onboarding/business.json"), business); write(root, "onboarding/copy/home.md", "We repair roofs");
  write(root, "fake.mjs", `import {spawnSync} from 'node:child_process';import fs from 'node:fs';
const nested=spawnSync(process.execPath,['--experimental-strip-types',${JSON.stringify(join(kernel, "scripts/ralph.ts"))},'--prepare'],{encoding:'utf8'});
if(nested.status!==0||!nested.stdout.includes('already the dispatched')||!fs.existsSync('agent/RUN.lock'))process.exit(9);
const state=JSON.parse(fs.readFileSync('agent/STATE.json'));if(state.nodes.preview.status!=='in_progress')process.exit(10);`);
  save(join(root, "agent/adapter.json"), { command: process.execPath, args: [join(root, "fake.mjs")], prompt: "stdin" });
  const run = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/ralph.ts"), "--site", root, "--once"], { encoding: "utf8", env: cleanEnv() });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  const state = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8")); assert.equal(state.preview_ready, true);
});
test("real browser verifier executes observations and captures both widths", () => {
  const root = temp(); cpSync(join(kernel, "src/test/fixtures/site"), root, { recursive: true });
  // Keep this fixture offline and deliberately invalid; inspection must execute to find the error.
  write(root, "pages/index.html", '<h1>One</h1><h1>Two</h1>');
  save(join(root, "onboarding/storyboard.json"), { pages: [{ path: "/", representative: true }] });
  const run = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/verify-browser.ts"), "--site", root], { encoding: "utf8", timeout: 60000 });
  assert.equal(run.status, 1, run.stderr);
  const report = JSON.parse(readFileSync(join(root, "agent/reviews/browser.json"), "utf8"));
  const homeChecks = report.checks.filter((c: { path: string }) => c.path === "/");
  assert.deepEqual(homeChecks.map((c: { width: number; motion: string }) => [c.width, c.motion]), [[375, "normal"], [375, "reduce"], [1080, "normal"], [1080, "reduce"]]);
  for (const check of homeChecks) {
    assert.ok(check.failures.includes("Expected one h1")); assert.ok(existsSync(join(root, check.screenshot)));
    assert.ok(existsSync(join(root, check.firstVisit.screenshot)), "First-visit banner evidence is preserved before using Reject");
  }
  assert.deepEqual(report.consentChecks.map((c: { width: number; passed: boolean }) => [c.width, c.passed]), [[375, true], [375, true], [1080, true], [1080, true]]);
  assert.ok(report.checks.filter((c: { path: string }) => c.path === "/cookie-compliance").every((c: { failures: string[] }) => !c.failures.length), JSON.stringify(report.checks.filter((c: { path: string }) => c.path === "/cookie-compliance").map((c: { failures: string[] }) => c.failures)));
});
test("direction rendering is a tool step and its evidence becomes stale after source changes", () => {
  const root = temp();
  write(root, "onboarding/studies/a.html", '<!doctype html><meta charset="utf-8"><h1>First direction</h1>');
  write(root, "onboarding/studies/b.html", '<!doctype html><meta charset="utf-8"><h1>Second direction</h1>');
  save(join(root, "onboarding/direction.json"), { version: 2, studies: [{ candidate: "a", path: "onboarding/studies/a.html" }, { candidate: "b", path: "onboarding/studies/b.html" }] });
  const run = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/render-studies.ts"), "--site", root], { encoding: "utf8", timeout: 60000 });
  assert.equal(run.status, 0, run.stderr); assert.equal(evaluateV2(root, "direction-render").ok, true);
  const report = JSON.parse(readFileSync(join(root, "agent/reviews/direction-render.json"), "utf8")); assert.equal(report.checks.length, 4);
  write(root, "onboarding/studies/a.html", "<h1>Changed</h1>"); assert.match(evaluateV2(root, "direction-render").failures.join(), /stale/);
});
test("crawl resumes pending URLs without recrawling completed pages", async () => {
  const root = temp();
  const server = createServer((req, res) => {
    if (req.url?.includes("sitemap")) { res.setHeader("content-type", "application/xml"); res.end('<urlset></urlset>'); return; }
    res.setHeader("content-type", "text/html");
    res.end(`<html><title>${req.url === "/about" ? "About" : "Home"}</title><h1>Local shop</h1><p>Service by local people.</p><a href="/about">About</a></html>`);
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`, checkpoint = join(root, "checkpoint.json");
  try {
    const first = await crawlSiteBrowser(url, 1, kernel, undefined, checkpoint);
    assert.equal(first.pages.length, 1);
    const next = await crawlSiteBrowser(url, undefined, kernel, undefined, checkpoint);
    assert.equal(next.pages.length, 2);
    assert.equal(next.pages.filter(p => new URL(p.url).pathname === "/").length, 1);
    assert.ok(next.pages.some(p => new URL(p.url).pathname === "/about"));
    assert.equal(next.warnings.some(w => /unvisited/.test(w)), false);
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
test("create-site initializes STATE from the copied graph", () => {
  const create = (dir: string, extra: string[]) => {
    const run = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/create-site.ts"), "--dir", dir, "--slug", "acme", "--name", "Acme Shop", "--no-prompt", ...extra], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  };
  const source = join(temp(), "source");
  const blank = join(temp(), "blank");
  create(source, ["--from", "https://old.example"]);
  create(blank, ["--blank"]);
  const sourceGraph = parseGraphYaml(readFileSync(join(source, "agent/graph.yaml"), "utf8"));
  const blankGraph = parseGraphYaml(readFileSync(join(blank, "agent/graph.yaml"), "utf8"));
  const sourceState = JSON.parse(readFileSync(join(source, "agent/STATE.json"), "utf8"));
  const blankState = JSON.parse(readFileSync(join(blank, "agent/STATE.json"), "utf8"));
  const nodeIds = sourceGraph.nodes.map(n => n.id);
  assert.equal(sourceState.version, sourceGraph.version);
  assert.equal(blankState.version, blankGraph.version);
  assert.equal(sourceGraph.version, blankGraph.version);
  assert.deepEqual(Object.keys(sourceState.nodes), nodeIds);
  assert.deepEqual(Object.keys(blankState.nodes), nodeIds);
  for (const id of nodeIds) assert.equal(sourceState.nodes[id].status, "pending", id);
  for (const id of nodeIds) assert.equal(blankState.nodes[id].status, id === "harvest" ? "done" : "pending", id);
  assert.deepEqual(JSON.parse(readFileSync(join(kernel, "agent/STATE.json"), "utf8")), initialState(graph()));
});
test("agent refresh preserves client launch settings and v1 progress while deferring graph migration", () => {
  const root = temp(); save(join(root, "launch.json"), { slug: "client", ownerEmail: "owner@example.test" });
  save(join(root, "agent/STATE.json"), { version: 1, nodes: { harvest: { status: "done", attempts: 2 } } });
  save(join(root, "agent/request.json"), { theme: "Client preference" });
  save(join(root, "agent/site-memory.json"), { schemaVersion: 1, decisions: [{ id: "keep-me", status: "current", kind: "preference", summary: "Keep nav" }] });
  save(join(root, "agent/adapter.reviewer.json"), { command: "cursor", args: ["agent", "--reviewer"], prompt: "stdin" });
  write(root, "agent/graph.yaml", "version: 1\nstop_at: preview\nnodes:\n  - id: harvest\n    kind: agent\n    needs: []\n    refs: []\n    writes: [onboarding/raw]\n    eval: harvest\n");
  write(root, "pages/index.html", "client work");
  const before = fingerprint(root, ["launch.json", "pages", "agent/request.json", "agent/adapter.reviewer.json", "agent/site-memory.json"]);
  const run = spawnSync(process.execPath, ["--experimental-strip-types", join(kernel, "scripts/refresh-agent.ts"), "--site", root], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr + run.stdout); assert.equal(fingerprint(root, ["launch.json", "pages", "agent/request.json", "agent/adapter.reviewer.json", "agent/site-memory.json"]), before);
  const state = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8"));
  assert.equal(state.version, 1); assert.equal(state.nodes.harvest.status, "done"); assert.equal(state.nodes.harvest.attempts, 2);
  assert.match(readFileSync(join(root, "agent/graph.yaml"), "utf8"), /version: 1/);
  assert.match(run.stdout, /existing graph progress retained/);
});

test("refinement acceptance in workflow is transactional and blocks on regression failure", async () => {
  const root = temp();
  cpSync(join(kernel, "agent"), join(root, "agent"), { recursive: true });
  const ids = ["business", "copy", "pages", "preview"];
  const g: SkillGraph = {
    version: 2,
    stop_at: "preview",
    nodes: ids.map((id, index) => ({
      id, kind: "agent", needs: index ? [ids[index - 1]!] : [], refs: [], tools: [],
      writes: [`${id}.json`], eval: "feedback-fulfillment", maxAttempts: 4,
    })),
  };
  save(join(root, "agent/graph.yaml"), g);
  save(join(root, "agent/reviews/feedback-fulfillment.json"), {
    version: 2,
    verdict: "pass",
    reviewer: "test",
    evidence: ["agent/reviews/feedback-fulfillment.json"],
    choices: [{ id: "c1", status: "fulfilled" }],
  });
  const markDone = (s: AgentState) => {
    for (const node of g.nodes) {
      begin(root, g, s, node);
      finish(root, g, s, node, []);
    }
    s.preview_ready = true;
    save(join(root, "agent/STATE.json"), s);
  };

  const state = initialState(g);
  markDone(state);
  save(join(root, "onboarding/business.json"), business);
  save(join(root, "onboarding/media-inventory.json"), { version: 2, assets: [{ id: "m1", path: "media/harvest/m1.png" }] });
  mkdirSync(join(root, "media/harvest"), { recursive: true });
  writeFileSync(join(root, "media/harvest/m1.png"), "image");
  mkdirSync(join(root, "pages"), { recursive: true });
  writeFileSync(join(root, "pages/index.html"), '<header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>');
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist/index.html"), "<h1>Home</h1>");

  seedSiteMemory(root);
  const memoryBefore = loadSiteMemory(root);

  beginChange({ root, graph: g, state, instruction: "Update headline. Keep the previous navigation." });
  assert.ok(existsSync(join(root, "agent/refine-pending.json")));

  // Break navigation by removing /about
  writeFileSync(join(root, "pages/index.html"), '<header><nav><a href="/">Home</a></nav></header>');

  markDone(state);

  const result = await runWorkflow({ root, kernel, argv: ["--site", root, "--no-preview-server"] });
  assert.equal(result.exitCode, 4); // GATES_FAILED
  assert.equal(result.state.preview_ready, false);
  assert.equal(result.state.status, "refinement_blocked");
  assert.ok(existsSync(join(root, "agent/refine-pending.json")), "refine-pending.json must be preserved on failure");

  const memoryAfterFail = loadSiteMemory(root);
  assert.equal(memoryAfterFail.decisions.filter(d => d.kind === "copy").length, memoryBefore.decisions.filter(d => d.kind === "copy").length);

  // Resume remains blocked
  const resumeResult = await runWorkflow({ root, kernel, argv: ["--site", root, "--no-preview-server"] });
  assert.equal(resumeResult.exitCode, 4);
  assert.ok(existsSync(join(root, "agent/refine-pending.json")));

  // Fix the regression by restoring the nav link
  writeFileSync(join(root, "pages/index.html"), '<header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>');
  markDone(resumeResult.state);

  const finalResult = await runWorkflow({ root, kernel, argv: ["--site", root, "--no-preview-server"] });
  assert.equal(finalResult.exitCode, 0);
  assert.equal(finalResult.state.preview_ready, true);
  assert.ok(!existsSync(join(root, "agent/refine-pending.json")), "refine-pending.json must be consumed on success");
  const finalMemory = loadSiteMemory(root);
  assert.ok(finalMemory.decisions.some(d => d.kind === "copy" && d.status === "current"));
});

test("stale tool evidence at preview_ready repairs the tool step without resetting pages or direction", () => {
  const root = temp();
  const g: SkillGraph = {
    version: 2,
    stop_at: "preview",
    nodes: [
      { id: "direction", kind: "agent", needs: [], refs: [], tools: [], writes: ["onboarding/direction.json"], eval: "direction", maxAttempts: 4 },
      { id: "pages", kind: "agent", needs: ["direction"], refs: [], tools: [], writes: ["pages"], eval: "pages", maxAttempts: 4 },
      { id: "browser", kind: "tool", needs: ["pages"], refs: [], tools: [], writes: ["agent/screenshots"], eval: "browser", repair: "pages", maxAttempts: 4 },
      { id: "preview", kind: "tool", needs: ["browser"], refs: [], tools: [], writes: [], eval: "preview", maxAttempts: 4 },
    ],
  };
  const state = initialState(g);
  for (const n of g.nodes) state.nodes[n.id] = { status: "done", attempts: 1 };
  state.preview_ready = true;
  state.status = "preview_ready";

  // Simulate stale browser tool evidence: tool failure
  finish(root, g, state, g.nodes.find(n => n.id === "browser")!, ["stale screenshot evidence"]);

  // Must repair browser (the tool node itself), NOT reset pages or direction!
  assert.equal(state.nodes.browser!.status, "pending");
  assert.equal(state.nodes.pages!.status, "done");
  assert.equal(state.nodes.direction!.status, "done");
  assert.equal(nextNode(g, state)?.id, "browser");
});

test("cumulative budget exhaustion stops execution and prevents runaway spend across resumes", async () => {
  const root = temp();
  const g: SkillGraph = {
    version: 2,
    stop_at: "b",
    nodes: [
      { id: "a", kind: "agent", needs: [], refs: [], tools: [], writes: ["a.json"], eval: "a", maxAttempts: 4 },
      { id: "b", kind: "agent", needs: ["a"], refs: [], tools: [], writes: ["b.json"], eval: "b", maxAttempts: 4 },
    ],
  };
  save(join(root, "agent/graph.yaml"), g);
  const state = initialState(g);
  state.cumulativeSpend = { iterations: 60, calls: 60, inputTokens: 1000, outputTokens: 1000, durationMs: 5000 };
  save(join(root, "agent/STATE.json"), state);
  save(join(root, "agent/adapter.json"), { command: "node", args: ["-e", "process.exit(0)"], prompt: "argument" });

  const result = await runWorkflow({ root, kernel, argv: ["--site", root, "--max-cumulative", "60", "--no-preview-server"] });
  assert.equal(result.exitCode, 1);
  assert.equal(result.state.status, "budget_exhausted");
});

test("cancellation via abort signal terminates process, sets canceled status, and releases lock", async () => {
  const root = temp();
  const g: SkillGraph = {
    version: 2,
    stop_at: "a",
    nodes: [
      { id: "a", kind: "tool", command: ["node", "-e", "setTimeout(() => {}, 60000)"], needs: [], refs: [], tools: [], writes: ["a.json"], eval: "a", maxAttempts: 4 },
    ],
  };
  save(join(root, "agent/graph.yaml"), g);
  const state = initialState(g);
  save(join(root, "agent/STATE.json"), state);
  writeFileSync(join(root, "agent/PROMPT.md"), "Test prompt\n");
  save(join(root, "agent/adapter.json"), { command: "node", args: ["-e", "setTimeout(() => {}, 60000)"], prompt: "argument" });

  const controller = new AbortController();
  const runPromise = runWorkflow({
    root,
    kernel,
    argv: ["--site", root, "--no-preview-server"],
    signal: controller.signal,
  });

  setTimeout(() => controller.abort(), 200);

  const result = await runPromise;
  assert.equal(result.exitCode, 6);
  assert.equal(result.state.status, "canceled");
  assert.ok(!existsSync(join(root, "agent/RUN.lock")), "Lock must be cleaned up on cancellation");
  // Spend receipt must be recorded on cancellation
  assert.ok(result.state.cumulativeSpend!.durationMs > 0);
  assert.ok(result.state.cumulativeSpend!.calls >= 1);
  assert.ok(existsSync(join(root, "agent/runs/1-a.usage.json")));
});

test("cumulative token and duration limits independently halt execution", async () => {
  const root = temp();
  const g: SkillGraph = {
    version: 2,
    stop_at: "a",
    nodes: [
      { id: "a", kind: "agent", needs: [], refs: [], tools: [], writes: ["a.json"], eval: "a", maxAttempts: 4 },
    ],
  };
  save(join(root, "agent/graph.yaml"), g);

  // 1. Token limit exceeded
  const stateTokens = initialState(g);
  stateTokens.cumulativeSpend = { iterations: 1, calls: 1, inputTokens: 5000, outputTokens: 5000, durationMs: 100 };
  save(join(root, "agent/STATE.json"), stateTokens);
  save(join(root, "agent/adapter.json"), { command: "node", args: ["-e", "process.exit(0)"], prompt: "argument" });

  const resTokens = await runWorkflow({ root, kernel, maxCumulativeTokens: 9000, argv: ["--site", root, "--no-preview-server"] });
  assert.equal(resTokens.exitCode, 1);
  assert.equal(resTokens.state.status, "budget_exhausted");

  // 2. Duration limit exceeded
  const stateDuration = initialState(g);
  stateDuration.cumulativeSpend = { iterations: 1, calls: 1, inputTokens: 10, outputTokens: 10, durationMs: 60000 };
  save(join(root, "agent/STATE.json"), stateDuration);

  const resDuration = await runWorkflow({ root, kernel, maxCumulativeDurationMs: 30000, argv: ["--site", root, "--no-preview-server"] });
  assert.equal(resDuration.exitCode, 1);
  assert.equal(resDuration.state.status, "budget_exhausted");
});

test("consecutive failure tracking persists in STATE.json across resumes and halts on 2nd attempt", async () => {
  const root = temp();
  const g: SkillGraph = {
    version: 2,
    stop_at: "a",
    nodes: [
      { id: "a", kind: "tool", command: ["node", "-e", "process.exit(1)"], needs: [], refs: [], tools: [], writes: ["a.json"], eval: "a", maxAttempts: 4 },
    ],
  };
  save(join(root, "agent/graph.yaml"), g);
  writeFileSync(join(root, "agent/PROMPT.md"), "Prompt");
  save(join(root, "agent/adapter.json"), { command: "node", args: ["-e", "process.exit(1)"], prompt: "argument" });

  // Run 1: first failure
  const run1 = await runWorkflow({ root, kernel, argv: ["--site", root, "--once", "--no-preview-server"] });
  assert.equal(run1.exitCode, 1);
  const stateAfter1 = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8"));
  assert.ok(stateAfter1.consecutiveFailures);
  const failureKey = Object.keys(stateAfter1.consecutiveFailures)[0]!;
  assert.equal(stateAfter1.consecutiveFailures[failureKey], 1);

  // Run 2: resume workflow. Identical failure must increment count to 2 and halt with repeated_failure_blocked!
  const run2 = await runWorkflow({ root, kernel, argv: ["--site", root, "--once", "--no-preview-server"] });
  assert.equal(run2.exitCode, 1);
  assert.equal(run2.state.status, "repeated_failure_blocked");
  const stateAfter2 = JSON.parse(readFileSync(join(root, "agent/STATE.json"), "utf8"));
  assert.equal(stateAfter2.consecutiveFailures[failureKey], 2);
});

test("copy-expansion evaluator enforces complete planned copy across all storyboard routes", () => {
  const root = temp();
  save(join(root, "onboarding/business.json"), {
    version: 2,
    offer: "Roofing", audience: "Owners", trigger: "Leak", outcome: "Dry roof", engagement: "Quote", positioning: "Local craft",
    includes: ["service"], facts: [{ id: "f1", claim: "Craft slate roofing", evidence: ["e1"] }],
    evidence: [{ id: "e1", source: "doc.txt", excerpt: "craft slate" }],
    uncertainties: [],
  });
  save(join(root, "onboarding/direction.json"), { version: 2 });
  write(root, "doc.txt", "craft slate");
  const storyboard = {
    version: 2,
    businessHash: fingerprint(root, ["onboarding/business.json"]),
    directionHash: fingerprint(root, ["onboarding/direction.json"]),
    designContractVersion: 1,
    pages: [
      { path: "/", role: "homepage", visitorOutcome: "Request a quote", purpose: "Home", sections: [{ id: "hero", role: "offer", purpose: "State the offer", question: "What", message: "Expert craft", composition: "lead", emphasis: "hero", emphasisReason: "First question", layoutFamily: "split", density: "comfortable", mediaProminence: "none", mobileTransformation: "Stack the offer above the action", transition: "fade", facts: ["f1"], media: [] }] },
      { path: "/about", role: "interior", visitorOutcome: "Understand the method", representative: true, purpose: "About us", sections: [{ id: "story", role: "method", purpose: "Explain the craft", question: "Who", message: "Heritage craft", composition: "split", emphasis: "story", emphasisReason: "The interior's own job", layoutFamily: "prose", density: "comfortable", mediaProminence: "none", mobileTransformation: "Keep the steps in order", transition: "none", facts: ["f1"], media: [] }] },
      { path: "/contact", role: "contact", visitorOutcome: "Send a request", purpose: "Contact", sections: [{ id: "form", role: "action", purpose: "Collect the request", question: "How", message: "Get estimate", composition: "form", emphasis: "action", emphasisReason: "This page exists to start the job", layoutFamily: "form", density: "compact", mediaProminence: "none", mobileTransformation: "Keep the form in one column", transition: "none", facts: ["f1"], media: [] }] },
    ],
    routes: [
      { source: "https://old.test/", target: "/", disposition: "preserve", reason: "home" },
      { source: "https://old.test/about", target: "/about", disposition: "preserve", reason: "about" },
      { source: "https://old.test/contact", target: "/contact", disposition: "preserve", reason: "contact" },
    ],
  };
  save(join(root, "onboarding/storyboard.json"), storyboard);
  save(join(root, "onboarding/brief.json"), { pages: [{ url: "https://old.test/", title: "Home" }, { url: "https://old.test/about", title: "About" }, { url: "https://old.test/contact", title: "Contact" }] });
  save(join(root, "onboarding/media-inventory.json"), { version: 2, assets: [] });

  // 1. Copy plan only covering representative routes passes "copy" evaluation
  save(join(root, "onboarding/copy-plan.json"), {
    version: 2,
    storyboardHash: fingerprint(root, ["onboarding/storyboard.json"]),
    pages: [
      { path: "/", sections: [{ id: "hero", heading: "Craft Slate Roofing", body: "Guaranteed protection for Cotswold heritage homes.", factIds: ["f1"] }] },
      { path: "/about", sections: [{ id: "story", heading: "Our Heritage Story", body: "Three generations of slate masonry.", factIds: ["f1"] }] },
    ],
  });
  assert.equal(evaluateV2(root, "copy").ok, true);

  // But fails "copy-expansion" because /contact is not expanded yet!
  assert.equal(evaluateV2(root, "copy-expansion").ok, false);
  assert.match(evaluateV2(root, "copy-expansion").failures.join(), /Missing expanded copy: \/contact form/);

  // 2. Expand copy to include /contact -> passes "copy-expansion"
  save(join(root, "onboarding/copy-plan.json"), {
    version: 2,
    storyboardHash: fingerprint(root, ["onboarding/storyboard.json"]),
    pages: [
      { path: "/", sections: [{ id: "hero", heading: "Craft Slate Roofing", body: "Guaranteed protection for Cotswold heritage homes.", factIds: ["f1"] }] },
      { path: "/about", sections: [{ id: "story", heading: "Our Heritage Story", body: "Three generations of slate masonry.", factIds: ["f1"] }] },
      { path: "/contact", sections: [{ id: "form", heading: "Request Inspection", body: "Get in touch for a stone slate survey.", factIds: ["f1"] }] },
    ],
  });
  assert.equal(evaluateV2(root, "copy-expansion").ok, true);
});

test("fresh single-site generation passes preview evaluation without direction-render evidence", () => {
  process.env.VITRIS_KERNEL = kernel;
  const root = temp();
  cpSync(join(kernel, "agent/graph.yaml"), join(root, "agent/graph.yaml"));
  const g = parseGraphYaml(readFileSync(join(root, "agent/graph.yaml"), "utf8"));

  save(join(root, "agent/STATE.json"), {
    version: 3, status: "in_progress", current: "preview", preview_ready: false, launched: false, iteration: 1,
    nodes: Object.fromEntries(g.nodes.map(n => [n.id, { status: "done", attempts: 1 }])),
  });

  write(root, "media/harvest/hero.svg", "<svg><path d='M0 0h10v10H0z'/></svg>");
  save(join(root, "onboarding/brief.json"), {
    sourceUrl: "https://example.test",
    pages: [{ url: "https://example.test/", title: "Home" }, { url: "https://example.test/about", title: "About" }],
    images: [],
  });

  const b: Business = {
    version: 2, offer: "Stone slate restoration", audience: "Heritage building owners", trigger: "Roof maintenance",
    outcome: "Preserved historic roof", includes: ["Inspection", "Restoration"], engagement: "Book consultation",
    positioning: "Cotswold specialist", facts: [{ id: "f1", claim: "Preserves historic stone roofs", evidence: ["e1"] }],
    evidence: [{ id: "e1", source: "onboarding/copy/home.md", excerpt: "Preserves historic stone roofs" }], uncertainties: [],
  };
  write(root, "onboarding/copy/home.md", "Preserves historic stone roofs");
  save(join(root, "onboarding/business.json"), b);

  const passingRev = (nodeId: string, evidencePaths: string[] = ["onboarding/business.json"]) => ({
    version: 2, reviewer: "independent", subjectHash: reviewSubject(root, nodeId), verdict: "pass",
    evidence: evidencePaths,
    checks: (REVIEW_CRITERIA[nodeId] || []).map(criterion => ({ criterion, verdict: "pass", evidence: "Verified" })),
    findings: [],
  });

  save(join(root, "agent/reviews/business-review.json"), passingRev("business-review"));

  const inv: MediaInventory = {
    version: 2, harvestHash: fingerprint(root, ["onboarding/brief.json", "media/harvest"]),
    assets: [{ id: "hero-asset", path: "/media/harvest/hero.svg", sources: [], description: "Hero stone roof restoration", role: "hero", reason: "Demonstrates primary stone slate craft", disposition: "use", inspected: true, placements: ["/"] }],
  };
  save(join(root, "onboarding/media-inventory.json"), inv);

  save(join(root, "onboarding/narrative-brief.json"), {
    schemaVersion: 2,
    businessHash: fingerprint(root, ["onboarding/business.json"]),
    mediaHash: fingerprint(root, ["onboarding/media-inventory.json"]),
    customer: "Heritage property owners",
    problem: "Vernacular stone roofs leaking and deteriorating",
    offer: "Specialist stone slate roof restoration",
    serviceScope: "Survey, stone dressing, timber repair, re-laying",
    proof: { statement: "Preserves historic stone roofs", status: "limited", evidenceIds: ["e1"] },
    conversion: "Schedule historic roof assessment",
    objections: [],
    unsupportedClaims: ["No modern concrete substitutes"],
    facts: [{ id: "f1", claim: "Preserves historic stone roofs", evidenceIds: ["e1"] }],
    visitorQuestions: [{ id: "q1", question: "Who can repair a historic stone roof?", relationshipToConversion: "The assessment is the conversion", priority: 1 }],
    assetNotes: [{ mediaId: "hero-asset", strength: "Shows stone roof work", limitation: "Single inspected image" }],
    toneConstraints: ["No modern concrete claims"],
    recordedUserGoals: [],
    designOpportunities: [{
      id: "opp-craft",
      visitorNeed: "See real stone work before booking",
      businessRelevance: "The offer is specialist restoration",
      evidenceIds: ["e1"],
      mediaIds: ["hero-asset"],
      presentationOpportunity: "Place the retained roof photograph with the offer",
      constraints: ["Only one inspected project image"],
      basis: "evidence-backed",
    }],
  });
  save(join(root, "agent/reviews/narrative-review.json"), passingRev("narrative-review", ["onboarding/narrative-brief.json"]));

  save(join(root, "onboarding/reference-analysis.json"), {
    schemaVersion: 1,
    packVersion: "v2",
    packHash: calibrationPackHash(kernel),
    narrativeHash: fingerprint(root, ["onboarding/narrative-brief.json"]),
    applicable: [{ principle: "Restrained craftsmanship over commercial hype", why: "Heritage property owners respect conservation focus", evidencePaths: ["vitris-northline-counsel-home-1280-viewport.png"] }],
    avoided: [{ principle: "Generic contractor badges and stock illustrations", why: "Damages authentic craft positioning" }],
    plannedApplication: { homepage: "Lead with vernacular craftsmanship and direct evidence", interior: "Detail stone dressing and quarry sources" },
    evidencePaths: ["vitris-northline-counsel-home-1280-viewport.png", "vitris-tide-and-slate-home-1280-viewport.png", "vitris-tide-and-slate-project-1280-viewport.png"],
    teachingPrinciples: [(() => {
      const catalog = loadKnowledgeCatalog(kernel);
      const lesson = catalog?.lessons.find(item => item.id === "project-photography-transformations");
      if (!lesson) throw new Error("missing teaching lesson");
      return { id: lesson.id, version: lesson.version, contentHash: lesson.contentHash, reason: "One inspected project photograph can lead the first screen" };
    })()],
  });

  // Single-site direction: NO studies required!
  save(join(root, "theme/defaults.json"), {
    colorRoles: { bg: "#fafafa", text: "#111827", primary: "#1e293b" },
    typography: { display: "Cinzel", body: "Inter" },
  });
  save(join(root, "onboarding/direction.json"), {
    version: 2, businessHash: fingerprint(root, ["onboarding/business.json"]), request: "",
    candidates: [{ id: "dir-a", rationale: "Timeless heritage craftsmanship", typography: "Serif display with geometric sans body", composition: "Asymmetrical editorial grid", mediaTreatment: "Full-bleed photography" }],
    selected: "dir-a", rationale: "Best match for Cotswold vernacular architecture",
    system: {
      personality: "Restrained, expert, archival", typography: "Cinzel + Inter", colorRoles: "Slate, chalk, warm stone",
      density: "Comfortable", rhythm: "Generous spacing with high-contrast section breaks",
      mediaTreatment: "Muted natural grading", surfaces: "Textured paper white", navigation: "Minimal persistent topbar",
      motifs: "Architectural line dividers", interiors: "Single-column reading flow with prominent captions", avoid: ["Neon accents", "Floating cards"],
    },
    studies: [],
    designContractVersion: 1,
    centralIdea: "Archival craft with the roof photograph as proof",
    opportunityIds: ["opp-craft"],
    decisions: [{ id: "type", kind: "typography", choice: "Cinzel display", rationale: "A heritage register fits the stone evidence", scope: "site", tradeoff: "Less contemporary" }],
    rejectedAlternatives: [{ id: "neon", summary: "Neon contrast would fight the stone photograph" }],
    identityInvariants: ["The stone photograph remains the proof"],
    flexibleDecisions: ["Interior column width"],
  });
  save(join(root, "agent/reviews/direction-review.json"), passingRev("direction-review", ["onboarding/direction.json", "theme/defaults.json"]));

  save(join(root, "onboarding/storyboard.json"), {
    version: 2, designContractVersion: 1, businessHash: fingerprint(root, ["onboarding/business.json"]), directionHash: fingerprint(root, ["onboarding/direction.json"]),
    routes: [
      { source: "https://example.test/", disposition: "preserve", target: "/", reason: "Home" },
      { source: "https://example.test/about", disposition: "preserve", target: "/about", reason: "About" },
    ],
    pages: [
      {
        path: "/", role: "homepage", visitorOutcome: "Book an assessment", purpose: "Present heritage roofing credentials", representative: true,
        sections: [{ id: "hero", role: "offer", purpose: "Show the stone work and the next step", opportunityIds: ["opp-craft"], decisionIds: ["type"], question: "Who repairs historic stone roofs?", message: "We restore Cotswold stone roofs.", facts: ["f1"], media: ["hero-asset"], action: { label: "Consult", destination: "/about", behavior: "navigate" }, composition: "Editorial", emphasis: "Title", emphasisReason: "The first question is who does this work", layoutFamily: "split", density: "comfortable", mediaProminence: "primary", mobileTransformation: "Stack the photograph, then the offer, then the action", transition: "Rule" }],
      },
      {
        path: "/about", role: "method", visitorOutcome: "Understand the craft", purpose: "Detail craft methodology", representative: true,
        sections: [{ id: "method", role: "process", purpose: "Explain dressing and relaying", opportunityIds: ["opp-craft"], decisionIds: ["type"], question: "How do we quarry and dress slate?", message: "Traditional quarrying methods.", facts: ["f1"], media: [], action: null, composition: "Story", emphasis: "Body", emphasisReason: "The interior's job is the method, not another hero", layoutFamily: "prose", density: "comfortable", mediaProminence: "none", mobileTransformation: "Keep the method in a single column", transition: "Fade" }],
      },
    ],
  });

  save(join(root, "onboarding/copy-plan.json"), {
    version: 2, storyboardHash: fingerprint(root, ["onboarding/storyboard.json"]),
    pages: [
      { path: "/", sections: [{ id: "hero", heading: "Cotswold Stone Roofing", body: "Generational stone roof conservation.", factIds: ["f1"] }] },
      { path: "/about", sections: [{ id: "method", heading: "Quarrying Traditions", body: "Preserving vernacular masonry techniques.", factIds: ["f1"] }] },
    ],
  });
  save(join(root, "agent/reviews/copy-review.json"), passingRev("copy-review", ["onboarding/copy-plan.json"]));

  // Implemented pages & dist
  write(root, "pages/index.html", '<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home</title></head><body><h1>Cotswold Stone Roofing</h1><img src="/media/harvest/hero.svg"></body></html>');
  write(root, "pages/about.html", '<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>About</title></head><body><h1>Quarrying Traditions</h1></body></html>');
  write(root, "dist/index.html", '<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home</title></head><body><h1>Cotswold Stone Roofing</h1><img src="/media/harvest/hero.svg"></body></html>');
  write(root, "dist/about/index.html", '<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>About</title></head><body><h1>Quarrying Traditions</h1></body></html>');

  // Screenshot evidence
  const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  mkdirSync(join(root, "agent/screenshots/browser"), { recursive: true });
  writeFileSync(join(root, "agent/screenshots/browser/home-375.png"), TINY_PNG);
  writeFileSync(join(root, "agent/screenshots/browser/home-1080.png"), TINY_PNG);
  writeFileSync(join(root, "agent/screenshots/browser/about-375.png"), TINY_PNG);
  writeFileSync(join(root, "agent/screenshots/browser/about-1080.png"), TINY_PNG);

  const checks = [
    { path: "/", width: 375, screenshot: "agent/screenshots/browser/home-375.png", screenshotHash: fingerprint(root, ["agent/screenshots/browser/home-375.png"]), failures: [] },
    { path: "/", width: 1080, screenshot: "agent/screenshots/browser/home-1080.png", screenshotHash: fingerprint(root, ["agent/screenshots/browser/home-1080.png"]), failures: [] },
    { path: "/about", width: 375, screenshot: "agent/screenshots/browser/about-375.png", screenshotHash: fingerprint(root, ["agent/screenshots/browser/about-375.png"]), failures: [] },
    { path: "/about", width: 1080, screenshot: "agent/screenshots/browser/about-1080.png", screenshotHash: fingerprint(root, ["agent/screenshots/browser/about-1080.png"]), failures: [] },
  ];
  save(join(root, "agent/reviews/browser.json"), {
    sourceHash: sourceHash(root), distHash: fingerprint(root, ["dist"]), scope: "browser", checks, consentChecks: [],
  });

  const visualRev = passingRev("visual-review", ["agent/screenshots/browser/home-1080.png"]);
  save(join(root, "agent/reviews/visual-review.json"), visualRev);
  save(join(root, "agent/reviews/content-review.json"), passingRev("content-review", ["onboarding/copy-plan.json"]));

  // Verify direction passes without studies
  const dirGrade = evaluateV2(root, "direction");
  assert.equal(dirGrade.ok, true, `Direction failed: ${dirGrade.failures.join("; ")}`);

  // Verify preview passes completely without direction-render evidence!
  const previewGrade = evaluateV2(root, "preview");
  assert.equal(previewGrade.ok, true, `Preview failed: ${previewGrade.failures.join("; ")}`);
});
