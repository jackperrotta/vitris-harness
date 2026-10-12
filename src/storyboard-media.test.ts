import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Route } from "playwright";
import { validateStoryboardMedia } from "./agent/storyboard-media.ts";
import { computeNextState } from "./agent/state-transition.ts";
import { initialState, parseGraphYaml, type GraphNode, type SkillGraph } from "./agent/graph.ts";
import { fingerprint, save, type MediaInventory, type Storyboard } from "./agent/artifacts.ts";
import { evaluateV2 } from "./agent/evaluate.ts";
import { loadPlaywrightChromium } from "./agent/playwright-runtime.ts";
import { checkSharedMedia, checkHeadingWordBreaks } from "./stock/browser-checks.ts";
import { classifyPublicSentence, scanRenderedCopyEditorial } from "./agent/editorial.ts";
import { wrapMain } from "./compile/flatten.ts";
import { generateResultManifest, loadResultManifest, writeResultManifest } from "./agent/result-manifest.ts";
import { previewServer } from "./build/serve.ts";
import { contactSheetServer } from "./stock/contact-sheet-server.ts";
import type { MediaSelection } from "./stock/selection.ts";

const root = () => mkdtempSync(join(tmpdir(), "vitris-shared-media-"));
const inventory: MediaInventory = {
  version: 2, harvestHash: "fixture", assets: [
    { id: "media-logo", path: "/media/logo.svg", sources: [], description: "Fictional mark", role: "logo", origin: "customer", identity: "logo", identityEvidence: ["onboarding/brief.json"], disposition: "use", reason: "Customer mark", inspected: true, placements: ["/", "/about"] },
    { id: "retained", path: "/media/retained.svg", sources: [], description: "Alternate", role: "archive", disposition: "retain", reason: "Preserve original", inspected: true, placements: [] },
  ],
};
const story = (): Storyboard => ({
  version: 3, businessHash: "fixture", directionHash: "fixture", routes: [],
  pages: ["/", "/about"].map(path => ({ path, purpose: "Fixture", representative: true, sections: [
    { id: "intro", question: "Who?", message: "Fictional company", facts: [], media: [], action: null, composition: "stack", emphasis: "high", transition: "next" },
  ] })),
});
const selection: MediaSelection = { version: 1, placements: ["/", "/about"].map(route => ({
  slot: { id: "logo-" + route, route, purpose: "Customer brand mark", placement: "header" as const, identity: "logo" as const },
  assetId: "media-logo", reason: "Shared navigation",
})) };

test("a rendered header logo without a v3 shared placement fails at storyboard", () => {
  const issues = validateStoryboardMedia(story(), inventory, selection);
  assert.ok(issues.some(issue => issue.code === "MEDIA_UNPLACED" && issue.message.includes("media-logo")));
  assert.equal(issues.some(issue => issue.message.includes("retained")), false);
});

test("storyboard evaluator reports the unplaced logo even when it is visible in rendered header HTML", () => {
  const site = root();
  save(join(site, "onboarding/business.json"), { version: 2, facts: [] });
  save(join(site, "onboarding/direction.json"), { version: 2 });
  save(join(site, "onboarding/brief.json"), { pages: [] });
  save(join(site, "onboarding/media-inventory.json"), inventory);
  save(join(site, "onboarding/media-selection.json"), selection);
  const plan = story();
  plan.businessHash = fingerprint(site, ["onboarding/business.json"]);
  plan.directionHash = fingerprint(site, ["onboarding/direction.json"]);
  save(join(site, "onboarding/storyboard.json"), plan);
  mkdirSync(join(site, "dist"), { recursive: true });
  writeFileSync(join(site, "dist/index.html"), '<header><img src="/media/logo.svg" alt="Fictional mark"></header>');
  const result = evaluateV2(site, "storyboard");
  assert.ok(result.failures.some(failure => failure.startsWith("[MEDIA_UNPLACED]") && failure.includes("media-logo")));
});

test("v3 shared header placement validates each planned route and selection slot", () => {
  const plan = story();
  plan.globalMedia = [{ assetId: "media-logo", placement: "header", routes: ["/", "/about"], reason: "Customer mark in shared navigation" }];
  assert.deepEqual(validateStoryboardMedia(plan, inventory, selection), []);
  const legacyIdentity = structuredClone(inventory);
  legacyIdentity.assets[0]!.identity = "Captured fictional wordmark" as MediaInventory["assets"][number]["identity"];
  assert.deepEqual(validateStoryboardMedia(plan, legacyIdentity, selection), []);
  plan.globalMedia[0]!.routes.push("/missing");
  assert.ok(validateStoryboardMedia(plan, inventory, selection).some(issue => issue.code === "MEDIA_ROUTE_INVALID"));
  plan.globalMedia[0]!.routes = ["/", "/"];
  assert.ok(validateStoryboardMedia(plan, inventory, selection).some(issue => issue.code === "MEDIA_ROUTE_INVALID"));
});

test("browser proof rejects missing, hidden, and wrong-region shared media", async () => {
  const plan = story();
  plan.globalMedia = [{ assetId: "media-logo", placement: "header", routes: ["/"], reason: "Navigation" }];
  const chromium = await loadPlaywrightChromium();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/media/logo.svg", (route: Route) => route.fulfill({
      status: 200, contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>',
    }));
    await page.setContent('<header><img src="http://example.test/media/logo.svg" alt="Fictional mark"></header>');
    await page.evaluate("document.querySelector('header img').decode()");
    assert.deepEqual(await checkSharedMedia(page, plan, inventory, "/"), []);
    await page.setContent('<header></header><footer><img src="http://example.test/media/logo.svg" alt="Fictional mark"></footer>');
    assert.match((await checkSharedMedia(page, plan, inventory, "/")).join(), /missing or hidden/);
    await page.setContent('<header style="display:none"><img src="http://example.test/media/logo.svg" alt="Fictional mark"></header>');
    assert.match((await checkSharedMedia(page, plan, inventory, "/")).join(), /missing or hidden/);
    await page.close();
  } finally {
    await browser.close();
  }
});

test("shared media rejects stock identity and a mismatched selection region", () => {
  const plan = story();
  plan.globalMedia = [{ assetId: "media-logo", placement: "header", routes: ["/", "/about"], reason: "Navigation" }];
  const ineligible = structuredClone(inventory);
  ineligible.assets[0]!.origin = "stock";
  assert.ok(validateStoryboardMedia(plan, ineligible, selection).some(issue => issue.code === "MEDIA_ASSET_INVALID"));
  const mismatch = structuredClone(selection);
  mismatch.placements[0]!.slot.placement = "footer";
  assert.ok(validateStoryboardMedia(plan, inventory, mismatch).some(issue => issue.code === "MEDIA_SELECTION_CONFLICT"));
});

const node = (id: string, needs: string[], writes: string[], kind: GraphNode["kind"] = "agent"): GraphNode =>
  ({ id, needs, inputs: [], writes, refs: [], tools: [], eval: id, maxAttempts: 4, kind });

test("legacy preview placement failure reopens storyboard and downstream gates", () => {
  const graph: SkillGraph = { version: 3, stop_at: "preview", nodes: [
    node("media", [], ["onboarding/media-inventory.json"]),
    node("storyboard", ["media"], ["onboarding/storyboard.json", "onboarding/media-selection.json"]),
    node("copy", ["storyboard"], ["onboarding/copy-plan.json"]),
    node("pages", ["copy"], ["pages"]),
    node("browser", ["pages"], ["agent/reviews/browser.json"], "tool"),
    { ...node("preview", ["browser"], [], "tool"), repair: "pages" },
  ] };
  const state = initialState(graph);
  for (const spec of graph.nodes) state.nodes[spec.id] = { status: "done", attempts: 1 };
  state.cumulativeSpend!.iterations = 6;
  const next = computeNextState({ root: root(), graph, currentState: state, node: graph.nodes.at(-1)!, failures: ["Selected media lacks storyboard placement: media-logo"] });
  assert.equal(next.nodes.media?.status, "done");
  assert.equal(next.nodes.storyboard?.status, "pending");
  assert.equal(next.nodes.copy?.status, "pending");
  assert.equal(next.nodes.browser?.status, "pending");
  assert.equal(next.nodes.storyboard?.attempts, 1);
  assert.equal(next.nodes.preview?.failures?.[0], "Selected media lacks storyboard placement: media-logo");
  assert.equal(next.cumulativeSpend?.iterations, 7);
});

test("coded media defect chooses the earliest writable prerequisite", () => {
  const graph: SkillGraph = { version: 3, stop_at: "preview", nodes: [
    node("media", [], ["onboarding/media-inventory.json"]),
    node("storyboard", ["media"], ["onboarding/storyboard.json"]),
    { ...node("preview", ["storyboard"], [], "tool"), repair: "storyboard" },
  ] };
  const state = initialState(graph);
  for (const spec of graph.nodes) state.nodes[spec.id] = { status: "done", attempts: 1 };
  const next = computeNextState({ root: root(), graph, currentState: state, node: graph.nodes[2]!, failures: [
    "[MEDIA_UNPLACED] Selected media lacks storyboard placement: media-logo",
    "[MEDIA_ASSET_INVALID] Uninspected selected media: media-logo",
  ] });
  assert.equal(next.nodes.media?.status, "pending");
  assert.equal(next.nodes.preview?.failures?.length, 2);
});

test("direction does not consume storyboard-owned final media selection", () => {
  const graphPath = fileURLToPath(new URL("../agent/graph.yaml", import.meta.url).href);
  const graph = parseGraphYaml(readFileSync(graphPath, "utf8"));
  const direction = graph.nodes.find(node => node.id === "direction")!;
  const storyboard = graph.nodes.find(node => node.id === "storyboard")!;
  assert.ok(storyboard.writes.includes("onboarding/media-selection.json"));
  assert.equal(direction.inputs?.includes("onboarding/media-selection.json"), false);
  assert.equal(direction.optionalInputs?.includes("onboarding/media-selection.json"), false);
  assert.equal(storyboard.optionalInputs?.includes("onboarding/media-selection.json"), false);
});

test("public copy flags internal source labels but permits useful visitor attribution", () => {
  assert.equal(classifyPublicSentence("Browse source-labeled examples of our work.").kind, "internal-commentary");
  assert.equal(classifyPublicSentence("See photographs from the owner's completed renovation.").kind, "ok");
  const site = root();
  mkdirSync(join(site, "dist"), { recursive: true });
  writeFileSync(join(site, "dist/index.html"), "<main><p>Browse source-labeled examples.</p></main>");
  assert.match(scanRenderedCopyEditorial(site).join(), /rendered copy/);
});

test("nested shell receives one skip-link main while authored main is preserved", () => {
  const shell = '<div class="shell"><header><nav>Menu</nav></header><section>Work</section><footer>Contact</footer></div>';
  const wrapped = wrapMain(shell, {});
  assert.equal((wrapped.match(/<main\b/g) || []).length, 1);
  assert.match(wrapped, /<header>[\s\S]*<main id="main" tabindex="-1">[\s\S]*<section>Work<\/section>[\s\S]*<\/main>[\s\S]*<footer>/);
  assert.equal(wrapMain('<header>Menu</header><main id="main">Work</main><footer>Contact</footer>', {}).match(/<main\b/g)?.length, 1);
  assert.throws(() => wrapMain('<main>A</main><main>B</main>', {}), /exactly one main/);
});

test("skip link keyboard activation focuses the generated main landmark", async () => {
  const chromium = await loadPlaywrightChromium();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<a class="skip-link" href="#main">Skip to content</a>' + wrapMain("<header>Menu</header><section>Content</section>", {}));
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate("document.activeElement?.className"), "skip-link");
    await page.keyboard.press("Enter");
    assert.deepEqual(await page.evaluate("({hash:location.hash,focused:document.activeElement?.id})"), { hash: "#main", focused: "main" });
  } finally {
    await browser.close();
  }
});

test("375px browser check detects an unintended Subcontractor word break", async () => {
  const chromium = await loadPlaywrightChromium();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 700 } });
    await page.setContent('<h1 style="font: bold 42px Arial; width: 130px; overflow-wrap:anywhere">Subcontractor</h1>');
    assert.match((await checkHeadingWordBreaks(page)).join(), /Subcontractor/);
    await page.setContent('<h1 style="font: bold 28px Arial; width: 340px">Subcontractor</h1>');
    assert.deepEqual(await checkHeadingWordBreaks(page), []);
  } finally {
    await browser.close();
  }
});

test("result manifest round trip keeps incomplete token usage unknown", () => {
  const site = root();
  const graph: SkillGraph = { version: 3, stop_at: "preview", nodes: [node("preview", [], [], "tool")] };
  const state = initialState(graph);
  state.cumulativeSpend!.inputTokens = 0;
  state.cumulativeSpend!.outputTokens = 0;
  state.cumulativeSpend!.hasUnmeteredStages = true;
  const manifest = generateResultManifest({ root: site, graph, state });
  writeResultManifest(site, manifest);
  const loaded = loadResultManifest(site)!;
  assert.equal(loaded.usageSummary.inputTokens, null);
  assert.equal(loaded.usageSummary.outputTokens, null);
  assert.equal(loaded.usageSummary.meteringCoverage, "incomplete");
  assert.equal(loaded.usageSummary.jevTransportCalls, 0);
  state.cumulativeSpend!.hasUnmeteredStages = false;
  state.cumulativeSpend!.agentTokensMeasured = true;
  assert.equal(generateResultManifest({ root: site, graph, state }).usageSummary.inputTokens, 0);
});

test("preview server exposes an HTTP /home handoff with explicit status and destination", async () => {
  const site = root();
  mkdirSync(join(site, "dist"), { recursive: true });
  writeFileSync(join(site, "dist/index.html"), "<main>Home</main>");
  writeFileSync(join(site, "dist/_redirects"), "/home / 301\n");
  const server = previewServer(join(site, "dist"));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing preview address");
    const base = "http://127.0.0.1:" + address.port;
    const raw = await fetch(base + "/home", { redirect: "manual" });
    assert.equal(raw.status, 301);
    assert.equal(raw.headers.get("location"), "/");
    const followed = await fetch(base + "/home");
    assert.equal(followed.status, 200);
    assert.equal(new URL(followed.url).pathname, "/");
    assert.equal((await fetch(base + "/missing", { redirect: "manual" })).status, 404);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("contact sheet loopback surface serves inspected media without exposing agent state", async () => {
  const site = root();
  mkdirSync(join(site, "onboarding"), { recursive: true });
  mkdirSync(join(site, "media"), { recursive: true });
  mkdirSync(join(site, "agent"), { recursive: true });
  writeFileSync(join(site, "onboarding/contact-sheet.html"), '<img src="../media/logo.svg">');
  writeFileSync(join(site, "media/logo.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(site, "agent/STATE.json"), '{"secret":true}');
  const server = contactSheetServer(site);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing media server address");
    const base = "http://127.0.0.1:" + address.port;
    assert.equal((await fetch(base + "/onboarding/contact-sheet.html")).status, 200);
    assert.equal((await fetch(base + "/media/logo.svg")).status, 200);
    assert.equal((await fetch(base + "/agent/STATE.json")).status, 404);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
