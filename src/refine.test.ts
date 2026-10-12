import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { cleanStaleTmp, fingerprint, recoverableReplace, recoverPendingTransactions, save } from "./agent/artifacts.ts";
import { initialState, type SkillGraph } from "./agent/graph.ts";
import {
  applyCopyPlanToPages, beginChange, classifyChange, detectMemoryDrift, parseFeedback,
  prepareRefine, regressionFailures, renderInlineMarkdown, restoreUnchangedLayout,
  seedSiteMemory, updateSiteMemory, verifyRefine, writeRefineReport,
  amendRefineScopes,
} from "./agent/refine.ts";

const temp = () => mkdtempSync(join(tmpdir(), "vitris-refine-"));
test("scope correction preserves baseline and original request while recognizing a mixed factual rebuild",()=>{
 const root=temp(),id='req-synthetic-amend',request={instruction:'Synthetic fixture: restore direction and recover source biography',originalRequest:'Synthetic fixture: restore direction and recover source biography',scope:'direction',scopes:['direction'],evidencePath:`agent/requests/${id}/request.json`,preserve:[],likes:[],dislikes:[]};
 save(join(root,'onboarding/business.json'),{facts:[{id:'kept',text:'Verified original fact'}]});
 const baseline={businessHash:fingerprint(root,['onboarding/business.json']),factIds:['kept'],mediaIds:[],preserve:[]};
 save(join(root,`agent/requests/${id}/baseline.json`),baseline);save(join(root,`agent/requests/${id}/request.json`),request);save(join(root,'agent/change-request.json'),request);save(join(root,'agent/refine-pending.json'),{requestId:id});
 const before=readFileSync(join(root,`agent/requests/${id}/baseline.json`),'utf8');
 save(join(root,'onboarding/business.json'),{facts:[{id:'kept',text:'Verified original fact'},{id:'recovered',text:'Recovered source biography'}]});
 assert.match(regressionFailures(root,id).join('\n'),/outside a business-scoped/);
 const updated=amendRefineScopes(root,id,['direction','business'],'Synthetic operator correction: the authorized work also recovers factual source content');
 assert.equal(updated.scope,'direction');assert.equal(updated.originalRequest,request.originalRequest);assert.equal(updated.scopeAmendments!.length,1);
 assert.deepEqual(JSON.parse(readFileSync(join(root,updated.scopeAmendments![0]!.priorRequest),'utf8')),request);
 assert.equal(readFileSync(join(root,`agent/requests/${id}/baseline.json`),'utf8'),before);assert.deepEqual(regressionFailures(root,id),[]);
 assert.equal(amendRefineScopes(root,id,['direction','business'],'Retry after interruption').scopeAmendments!.length,1);
 save(join(root,'agent/leases/stage-browser.json'),{syntheticLease:true});assert.throws(()=>amendRefineScopes(root,id,['direction','business','copy'],'While a stage is active'),/cancel the active stage/);unlinkSync(join(root,'agent/leases/stage-browser.json'));
 assert.throws(()=>amendRefineScopes(root,id,['business'],'Remove original scope'),/only expand/);
 assert.throws(()=>amendRefineScopes(root,id,['direction','business'],''),/explicit reason/);
 save(join(root,'agent/refine-pending.json'),{requestId:'different-request'});assert.throws(()=>amendRefineScopes(root,id,['direction','business','copy'],'Wrong request'),/current pending/);
});
const mini = (): SkillGraph => {
  const ids = ["harvest", "business", "copy", "copy-review", "pages", "browser", "content-review", "preview"];
  return {
    version: 2, stop_at: "preview",
    nodes: ids.map((id, index) => ({
      id, kind: "agent", needs: index ? [ids[index - 1]!] : [], refs: [], tools: [],
      writes: [`${id}.json`], eval: id, maxAttempts: 4,
    })),
  };
};

test("classifier maps later-life requests and never starts harvest", () => {
  assert.equal(classifyChange("Rewrite the homepage headline").scope, "copy");
  assert.equal(classifyChange("Make the homepage more premium").scope, "direction");
  assert.equal(classifyChange("Add this service to the site").scope, "business");
  assert.equal(classifyChange("Use variant B's navigation").scope, "pages");
  assert.equal(classifyChange("Increase the contact button size").scope, "pages");
  assert.equal(classifyChange("We now serve Bristol").scope, "business");
  assert.notEqual(classifyChange("Please recrawl the harvest").scope, "harvest" as never);
  assert.equal(classifyChange("Please recrawl the harvest").scope, "pages");
  assert.equal(classifyChange("Fix the mobile menu").scope, "pages");
  assert.equal(classifyChange("Make the hero less busy").scope, "direction");
  assert.deepEqual(classifyChange("Don't change pricing; rewrite the headline").scopes, ["copy"]);
  assert.deepEqual(classifyChange("Rewrite the headline and replace the hero image").scopes, ["copy", "media"]);
});

test("feedback parser keeps grain and preserve phrases without overlapping likes", () => {
  const parsed = parseFeedback("Make the homepage more premium. Keep the previous navigation. I like the homepage hero. Too dense on mobile.");
  assert.ok(parsed.preserve.some(i => /navigation/i.test(i.text)));
  assert.equal(parsed.preserve.find(i => /navigation/i.test(i.text))?.kind, "nav_behavior");
  // "keep the previous navigation" must NOT be in likes!
  assert.ok(!parsed.likes.some(i => /navigation/i.test(i.text)));
  assert.ok(parsed.likes.some(i => /hero/i.test(i.text)));
  assert.ok(parsed.dislikes.some(i => /dense/i.test(i.text)));
  const targeted = parseFeedback("I don't like section #services. Avoid button #contact-cta.");
  assert.equal(targeted.likes.length, 0);
  assert.equal(targeted.dislikes[0]?.text, "don't like section #services");
  assert.equal(targeted.dislikes[0]?.sectionId, "services");
  assert.equal(targeted.dislikes[1]?.hook, "contact-cta");
});

test("memory supersession stays within the affected page and retries do not duplicate preferences", () => {
  const root = temp();
  save(join(root, "agent/site-memory.json"), {
    schemaVersion: 1, seededAt: "2026-09-27", updatedAt: "2026-09-27", businessHash: "", mediaHash: "",
    directionHash: "", copyHash: "", factIds: [], mediaIds: [], unresolved: [], preferences: [],
    decisions: [
      { id: "home-copy", status: "current", kind: "copy", summary: "Home", path: "/" },
      { id: "about-copy", status: "current", kind: "copy", summary: "About", path: "/about" },
    ],
  });
  const request = {
    instruction: "Rewrite the homepage headline", originalRequest: "Rewrite the homepage headline",
    scope: "copy" as const, classifiedScope: "copy" as const,
    evidencePath: "agent/requests/one/request.json", rationale: "copy", affectedPages: ["/"], proposedChanges: [],
    likes: [], dislikes: [{ grain: "section" as const, text: "Avoid section #hero", sectionId: "hero" }], preserve: [],
  };
  const first = updateSiteMemory(root, request);
  assert.ok(first.decisions.some(d => d.id === "about-copy" && d.status === "current"));
  assert.ok(!first.decisions.some(d => d.id === "home-copy" && d.status === "current"));
  assert.ok(first.decisions.some(d => d.intent === "negative" && d.sectionId === "hero"));
  const count = first.decisions.length;
  assert.equal(updateSiteMemory(root, request).decisions.length, count);
});

test("site memory seeds from existing artifacts and archives superseded decisions", () => {
  const root = temp();
  save(join(root, "onboarding/business.json"), { version: 2, facts: [{ id: "f1" }], evidence: [] });
  save(join(root, "onboarding/media-inventory.json"), { version: 2, assets: [{ id: "m1" }] });
  save(join(root, "onboarding/direction.json"), { selected: "a" });
  save(join(root, "onboarding/copy-plan.json"), { pages: [] });
  save(join(root, "agent/request.json"), { theme: "Warm editorial" });
  const memory = seedSiteMemory(root);
  assert.equal(memory.schemaVersion, 1);
  assert.ok(memory.factIds.includes("f1"));
  assert.ok(memory.mediaIds.includes("m1"));
  assert.ok(memory.preferences.some(p => /Warm editorial/.test(p.text)));
  const again = seedSiteMemory(root);
  assert.equal(again.seededAt, memory.seededAt);
  const request = {
    instruction: "Rewrite the homepage headline", originalRequest: "Rewrite the homepage headline",
    scope: "copy" as const, classifiedScope: "copy" as const, evidencePath: "agent/request-history/x.json",
    rationale: "copy", affectedPages: ["/"], proposedChanges: ["Update headline"],
    likes: [], dislikes: [], preserve: [{ grain: "website" as const, text: "Keep the previous navigation" }],
  };
  const updated = updateSiteMemory(root, request, { implementationReason: "Tightened the hero without touching nav." });
  assert.ok(updated.decisions.some(d => d.kind === "copy" && d.status === "current"));
  assert.ok(existsSync(join(root, "agent/site-memory-history")) || updated.decisions.some(d => d.kind === "preference"));
});

test("beginChange classifies by default, honors override, and does not invalidate harvest", () => {
  const root = temp();
  const graph = mini();
  const state = initialState(graph);
  for (const id of Object.keys(state.nodes)) state.nodes[id]!.status = "done";
  const request = beginChange({ root, graph, state, instruction: "Increase the contact button size" });
  assert.equal(request.scope, "pages");
  assert.equal(state.nodes.harvest!.status, "done");
  assert.equal(state.nodes.business!.status, "done");
  assert.equal(state.nodes.copy!.status, "done");
  assert.equal(state.nodes.pages!.status, "pending");
  const root2 = temp();
  const graph2 = mini();
  const state2 = initialState(graph2);
  for (const id of Object.keys(state2.nodes)) state2.nodes[id]!.status = "done";
  const overridden = beginChange({ root: root2, graph: graph2, state: state2, instruction: "Increase the contact button size", scopeFlag: "copy" });
  assert.equal(overridden.scope, "copy");
  assert.equal(overridden.overrideScope, "copy");
  assert.equal(state2.nodes.copy!.status, "pending");
  assert.equal(state2.nodes.harvest!.status, "done");
});

test("targeted copy application updates page source, requires passing copy review, and preserves layout structure", () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  const originalHtml = '<header><nav><a href="/">Home</a><a href="/about">About</a></nav></header><section id="proposition"><h1>Original Headline</h1><p>Original body text.</p></section>';
  writeFileSync(join(root, "pages/index.html"), originalHtml);

  const graph = mini();
  const state = initialState(graph);
  for (const id of Object.keys(state.nodes)) state.nodes[id] = { status: "done", attempts: 1 };

  beginChange({ root, graph, state, instruction: "Rewrite the homepage headline", scopeFlag: "copy" });
  assert.equal(state.nodes.pages!.status, "pending");

  save(join(root, "onboarding/copy-plan.json"), {
    version: 2,
    pages: [{
      path: "/",
      sections: [{
        id: "proposition",
        heading: "Rewritten Hero Headline",
        body: "Updated body text for customers.",
        factIds: [],
      }],
    }],
  });

  // 1. Without copy-review passing, restoreUnchangedLayout must return false and NOT touch pages
  state.nodes.copy!.status = "done";
  state.nodes["copy-review"]!.status = "pending";
  assert.equal(restoreUnchangedLayout(root, state), false);
  assert.equal(readFileSync(join(root, "pages/index.html"), "utf8"), originalHtml);

  // 2. With failing copy-review, must return false and NOT touch pages
  state.nodes["copy-review"]!.status = "done";
  save(join(root, "agent/reviews/copy-review.json"), { verdict: "fail" });
  assert.equal(restoreUnchangedLayout(root, state), false);
  assert.equal(readFileSync(join(root, "pages/index.html"), "utf8"), originalHtml);

  // 3. With passing copy-review, targeted copy application runs!
  save(join(root, "agent/reviews/copy-review.json"), { verdict: "pass" });
  assert.equal(restoreUnchangedLayout(root, state), true);

  const updatedHtml = readFileSync(join(root, "pages/index.html"), "utf8");
  assert.match(updatedHtml, /Rewritten Hero Headline/);
  assert.match(updatedHtml, /Updated body text for customers\./);
  // Navigation and header structure must be fully preserved
  assert.match(updatedHtml, /<nav><a href="\/">Home<\/a><a href="\/about">About<\/a><\/nav>/);

  // pages node is now done (copy applied)
  assert.equal(state.nodes.pages!.status, "done");
  // browser node must NOT be restored as done; fresh browser evidence is required!
  assert.equal(state.nodes.browser!.status, "pending");
});

test("refine report and regressions fail closed on dropped media or broken media files", () => {
  const root = temp();
  save(join(root, "onboarding/business.json"), { version: 2, facts: [{ id: "f1" }] });
  mkdirSync(join(root, "media/harvest"), { recursive: true });
  writeFileSync(join(root, "media/harvest/m1.png"), "fake");
  writeFileSync(join(root, "media/harvest/m2.png"), "fake");
  save(join(root, "onboarding/media-inventory.json"), {
    version: 2,
    assets: [
      { id: "m1", path: "media/harvest/m1.png" },
      { id: "m2", path: "media/harvest/m2.png" },
    ],
  });
  mkdirSync(join(root, "pages"), { recursive: true });
  writeFileSync(join(root, "pages/index.html"), '<h1>Keep nav</h1><nav><a href="/">Home</a></nav>');
  const graph = mini();
  const state = initialState(graph);
  for (const id of Object.keys(state.nodes)) state.nodes[id]!.status = "done";
  beginChange({ root, graph, state, instruction: "Rewrite the homepage headline. Keep the previous navigation." });

  // Drop media file on disk despite keeping ID
  unlinkSync(join(root, "media/harvest/m2.png"));
  const failures = regressionFailures(root);
  assert.ok(failures.some(f => /Dropped media file despite retained ID/i.test(f)));

  const report = writeRefineReport(root, { failures, skippedLayoutRewrite: false });
  assert.equal(report.schemaVersion, 1);
  assert.match(readFileSync(join(root, "agent/refine-report.txt"), "utf8"), /Rewrite the homepage headline/);
  assert.equal(fingerprint(root, ["agent/refine-report.json"]).length, 64);
});

test("verifiable preference constraints block acceptance on navigation behavior violation", () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  writeFileSync(join(root, "pages/index.html"), '<header><nav><a href="/">Home</a><a href="/about">About</a><a href="/contact">Contact</a></nav></header>');
  save(join(root, "onboarding/business.json"), { version: 2, facts: [{ id: "f1" }] });
  save(join(root, "onboarding/media-inventory.json"), { version: 2, assets: [] });

  const graph = mini();
  const state = initialState(graph);
  for (const id of Object.keys(state.nodes)) state.nodes[id]!.status = "done";

  beginChange({ root, graph, state, instruction: "Make the hero more punchy. Keep the previous navigation." });

  // Simulate an unauthorized edit that drops /contact route from nav
  writeFileSync(join(root, "pages/index.html"), '<header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>');
  let failures = regressionFailures(root);
  assert.ok(failures.some(f => /Preserved navigation behavior violated: missing route \/contact/i.test(f)));

  // With explicit supersession instruction, failure is cleared
  beginChange({ root, graph, state, instruction: "Update hero and supersede navigation with a two-link menu." });
  failures = regressionFailures(root);
  assert.ok(!failures.some(f => /Preserved navigation behavior violated/i.test(f)));
});

test("recoverable replacement preserves destination on failure and recovers from journal", () => {
  const root = temp();
  const target = join(root, "target.txt");
  const newFile = join(root, "new.txt");
  writeFileSync(target, "initial content\n");
  writeFileSync(newFile, "updated content\n");

  // Normal replacement
  recoverableReplace(newFile, target);
  assert.equal(readFileSync(target, "utf8"), "updated content\n");
  assert.ok(!existsSync(`${target}.journal.json`));

  // Journal startup recovery for committed transaction
  const staging = join(root, "staged.txt");
  writeFileSync(staging, "recovered content\n");
  save(`${target}.journal.json`, {
    schemaVersion: 1,
    stage: "committed",
    from: staging,
    to: target,
    pid: process.pid,
    createdAt: new Date().toISOString(),
    isDirectory: false,
  });
  unlinkSync(target);
  recoverPendingTransactions(root);
  assert.equal(readFileSync(target, "utf8"), "recovered content\n");
  assert.ok(!existsSync(`${target}.journal.json`));

  // Stale tmp cleanup preserves active writer files
  const activeTmp = join(root, "test.tmp." + process.pid + "." + Date.now() + ".abc");
  writeFileSync(activeTmp, "active writer\n");
  cleanStaleTmp(join(root, "test"));
  assert.ok(existsSync(activeTmp), "active writer tmp must not be deleted");
  unlinkSync(activeTmp);
});

test("eval-refine prepare copies a source into kernel and vanilla arms without editing it", () => {
  const from = temp();
  const out = temp();
  save(join(from, "launch.json"), { slug: "eval" });
  save(join(from, "onboarding/business.json"), { version: 2, facts: [{ id: "f1" }], evidence: [] });
  mkdirSync(join(from, "pages"), { recursive: true });
  writeFileSync(join(from, "pages/index.html"), "<h1>Eval</h1>");
  save(join(from, "agent/STATE.json"), { version: 1, nodes: { harvest: { status: "done", attempts: 1 } } });
  const before = fingerprint(from, ["pages", "launch.json"]);
  const run = spawnSync(process.execPath, ["--experimental-strip-types", join(resolve(import.meta.dirname, ".."), "scripts/eval-refine.ts"), "--prepare", "--from", from, "--out", out], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(fingerprint(from, ["pages", "launch.json"]), before);
  assert.ok(existsSync(join(out, "kernel/agent/site-memory.json")));
  assert.ok(existsSync(join(out, "vanilla/VANILLA.md")));
  assert.ok(existsSync(join(out, "requests.json")));
});

test("copy refinement handles custom component tags, nested markup, and rejects false completion when sections are unmapped", () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  const complexHtml = '<main><hero id="hero-banner"><div class="container"><div class="nested"><h1>Original Custom Heading</h1><p>First paragraph of copy.</p><p>Second paragraph of copy.</p></div></div></hero></main>';
  writeFileSync(join(root, "pages/index.html"), complexHtml);

  const graph = mini();
  const state = initialState(graph);
  for (const id of Object.keys(state.nodes)) state.nodes[id] = { status: "done", attempts: 1 };

  beginChange({ root, graph, state, instruction: "Rewrite the hero copy", scopeFlag: "copy" });
  assert.equal(state.nodes.pages!.status, "pending");

  // 1. Plan targeting custom component tag <hero id="hero-banner"> with nested divs and multi-paragraphs
  save(join(root, "onboarding/copy-plan.json"), {
    version: 2,
    pages: [{
      path: "/",
      sections: [{
        id: "hero-banner",
        heading: "Transformed Custom Heading",
        body: "Updated first paragraph.\n\nUpdated second paragraph.",
        factIds: [],
      }],
    }],
  });

  save(join(root, "agent/reviews/copy-review.json"), { verdict: "pass" });
  state.nodes["copy-review"]!.status = "done";

  const applied = restoreUnchangedLayout(root, state);
  assert.equal(applied, true);
  assert.equal(state.nodes.pages!.status, "done");

  const updatedHtml = readFileSync(join(root, "pages/index.html"), "utf8");
  assert.match(updatedHtml, /<hero id="hero-banner">/);
  assert.match(updatedHtml, /Transformed Custom Heading/);
  assert.match(updatedHtml, /Updated first paragraph\./);
  assert.match(updatedHtml, /Updated second paragraph\./);
  assert.match(updatedHtml, /<\/div><\/div><\/hero><\/main>/);

  // 2. False completion guard: unmapped section ID must NOT mark pages done
  state.nodes.pages!.status = "pending";
  save(join(root, "onboarding/copy-plan.json"), {
    version: 2,
    pages: [{
      path: "/",
      sections: [{
        id: "nonexistent-section-id",
        heading: "Ghost Heading",
        body: "Ghost body",
        factIds: [],
      }],
    }],
  });

  const unmappedApplied = restoreUnchangedLayout(root, state);
  assert.equal(unmappedApplied, false);
  // pages must remain pending; must NOT be marked done just because copy-plan.json exists on disk!
  assert.equal(state.nodes.pages!.status, "pending");
});

test("renderInlineMarkdown safely renders bold, italic, links, and lists", () => {
  const inline = renderInlineMarkdown("Check **bold** and *italic* and [contact us](/contact)");
  assert.equal(inline, 'Check <strong>bold</strong> and <em>italic</em> and <a href="/contact">contact us</a>');

  const unordered = renderInlineMarkdown("- Item 1\n- Item 2\n- Item 3");
  assert.equal(unordered, "<ul>\n  <li>Item 1</li>\n  <li>Item 2</li>\n  <li>Item 3</li>\n</ul>");

  const ordered = renderInlineMarkdown("1. First step\n2. Second step");
  assert.equal(ordered, "<ol>\n  <li>First step</li>\n  <li>Second step</li>\n</ol>");
});

test("applyCopyPlanToPages enforces preflight validation with zero partial writes", () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  const homeHtml = '<section id="hero"><h1>Home Hero</h1><p>Home copy</p></section>';
  writeFileSync(join(root, "pages/index.html"), homeHtml);

  save(join(root, "onboarding/copy-plan.json"), {
    version: 2,
    pages: [
      {
        path: "/",
        sections: [{ id: "hero", heading: "New Home Hero" }],
      },
      {
        path: "/about",
        sections: [{ id: "mission", heading: "About Us" }],
      },
    ],
  });

  const result = applyCopyPlanToPages(root);
  assert.equal(result.applied, false);
  assert.match(result.error || "", /Preflight check failed: target page file not found/i);
  // Zero partial writes: pages/index.html MUST NOT have been modified!
  assert.equal(readFileSync(join(root, "pages/index.html"), "utf8"), homeHtml);
});

test("applyCopyPlanToPages protects notes, captions, and CTAs from body copy overwrite and updates explicit slots", () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  const originalHtml = `<section id="service">
  <h2 data-slot="heading">Old Service Heading</h2>
  <p>Old main body copy.</p>
  <p class="note">Crucial Note: Licensed & Insured.</p>
  <figcaption class="caption">Figure: Certified equipment</figcaption>
  <p class="cta"><a class="btn" href="/contact">Get Quote</a></p>
</section>`;
  writeFileSync(join(root, "pages/index.html"), originalHtml);

  save(join(root, "onboarding/copy-plan.json"), {
    version: 2,
    pages: [
      {
        path: "/",
        sections: [
          {
            id: "service",
            heading: "Updated Service Heading",
            body: "First new body paragraph.\n\nSecond new body paragraph.",
            note: "Updated Note: Fully guaranteed.",
          },
        ],
      },
    ],
  });

  const result = applyCopyPlanToPages(root);
  assert.equal(result.applied, true);

  const updatedHtml = readFileSync(join(root, "pages/index.html"), "utf8");
  assert.match(updatedHtml, /Updated Service Heading/);
  assert.match(updatedHtml, /First new body paragraph\./);
  assert.match(updatedHtml, /Second new body paragraph\./);
  assert.match(updatedHtml, /Updated Note: Fully guaranteed\./);
  assert.match(updatedHtml, /<figcaption class="caption">Figure: Certified equipment<\/figcaption>/);
  assert.match(updatedHtml, /<p class="cta"><a class="btn" href="\/contact">Get Quote<\/a><\/p>/);
});

test("detectMemoryDrift detects uncommitted or external artifact modifications", () => {
  const root = temp();
  save(join(root, "onboarding/business.json"), { version: 2, facts: [{ id: "fact-1" }] });
  save(join(root, "onboarding/media-inventory.json"), { version: 2, assets: [{ id: "media-1" }] });
  save(join(root, "onboarding/direction.json"), { selected: "a" });
  save(join(root, "onboarding/copy-plan.json"), { pages: [] });

  seedSiteMemory(root);
  const driftClean = detectMemoryDrift(root);
  assert.equal(driftClean.drifted, false);
  assert.equal(driftClean.driftedFiles.length, 0);

  // External edit to business.json without verify
  save(join(root, "onboarding/business.json"), { version: 2, facts: [{ id: "fact-1" }, { id: "fact-2", claim: "Invented" }] });
  const driftDetected = detectMemoryDrift(root);
  assert.equal(driftDetected.drifted, true);
  assert.ok(driftDetected.driftedFiles.includes("onboarding/business.json"));
});

test("prepareRefine and verifyRefine establish transaction boundaries and enforce 100% gate pass", async () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "theme"), { recursive: true });
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Test</title></head><body><header><nav><a href="/">Home</a><a href="/about">About</a></nav></header><main><section id="main"><h1>Title</h1><p>Body</p></section></main></body></html>');
  writeFileSync(join(root, "pages/about.html"), '<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>About</title></head><body><h1>About Us</h1><a href="/">Back</a></body></html>');
  writeFileSync(join(root, "theme/defaults.json"), JSON.stringify({ fonts: { body: "sans-serif" }, colors: { primary: "#000" } }));
  save(join(root, "site.json"), { name: "Test Site", slug: "test", lang: "en" });
  save(join(root, "onboarding/business.json"), { version: 2, facts: [{ id: "f1" }] });
  save(join(root, "onboarding/media-inventory.json"), { version: 2, assets: [] });

  // 1. Prepare refinement
  const prep = prepareRefine({
    root,
    instruction: "Update copy and preserve previous navigation",
    requestId: "req-test-1",
  });
  assert.equal(prep.requestId, "req-test-1");
  assert.ok(existsSync(join(root, "agent/requests/req-test-1/baseline.json")));
  assert.ok(existsSync(join(root, "agent/requests/req-test-1/request.json")));
  assert.ok(existsSync(join(root, "agent/refine-pending.json")));

  // 2. Verify with broken link in pages/index.html fails closed
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Test</title></head><body><header><nav><a href="/">Home</a><a href="/nonexistent-page">Broken</a></nav></header><main><section id="main"><h1>Title</h1><p>Body</p></section></main></body></html>');

  const failResult = await verifyRefine({ root, requestId: "req-test-1" });
  assert.equal(failResult.ok, false);
  assert.ok(failResult.failures.some(f => /Broken internal link/i.test(f) || /Preserved navigation behavior violated/i.test(f)));
  // Pending state must be preserved on failure!
  assert.ok(existsSync(join(root, "agent/refine-pending.json")));

  // 3. Fix the link, re-verify -> passes 100%
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Test</title></head><body><header><nav><a href="/">Home</a><a href="/about">About</a></nav></header><main><section id="main"><h1>Updated Title</h1><p>Updated Body</p></section></main></body></html>');

  const passResult = await verifyRefine({ root, requestId: "req-test-1" });
  assert.equal(passResult.ok, true, `Failures: ${passResult.failures.join("; ")}`);
  assert.equal(passResult.failures.length, 0);
  // Pending state must be consumed on 100% pass!
  assert.ok(!existsSync(join(root, "agent/refine-pending.json")));
  const memory = JSON.parse(readFileSync(join(root, "agent/site-memory.json"), "utf8"));
  assert.ok(memory.acceptedRequests?.some((r: any) => r.requestId === "req-test-1"));
});

test("renderInlineMarkdown securely escapes raw HTML and disallows executable URLs", () => {
  const dangerousHtml = renderInlineMarkdown("Hello <script>alert(1)</script> and <img src=x onerror=alert(2)>");
  assert.equal(dangerousHtml.includes("<script>"), false);
  assert.equal(dangerousHtml.includes("<img"), false);
  assert.match(dangerousHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(dangerousHtml, /&lt;img src=x onerror=alert\(2\)&gt;/);

  const jsLink = renderInlineMarkdown("[click me](javascript:alert('pwned'))");
  assert.equal(jsLink.includes("<a href"), false);
  assert.match(jsLink, /click me/);

  const dataLink = renderInlineMarkdown("[steal](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)");
  assert.equal(dataLink.includes("<a href"), false);

  const safeLink = renderInlineMarkdown("[contact us](/contact)");
  assert.equal(safeLink, '<a href="/contact">contact us</a>');

  const safeHttp = renderInlineMarkdown("[docs](https://example.com/docs)");
  assert.equal(safeHttp, '<a href="https://example.com/docs">docs</a>');
});

test("verifyRefine strictly rejects nonexistent requestId with zero fallback", async () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "theme"), { recursive: true });
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>Hi</h1></body></html>');
  writeFileSync(join(root, "theme/defaults.json"), JSON.stringify({}));
  save(join(root, "site.json"), { name: "Test Site", slug: "test" });
  save(join(root, "agent/change-request.json"), { instruction: "Global change", scope: "copy" });

  const res = await verifyRefine({ root, requestId: "req-does-not-exist" });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some(f => /Specified request ID 'req-does-not-exist' does not exist/i.test(f)));
});

test("verifyRefine fails if requested change produced no modifications", async () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "theme"), { recursive: true });
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home</title></head><body><h1>Hi</h1></body></html>');
  writeFileSync(join(root, "theme/defaults.json"), JSON.stringify({ bg: "#fff", text: "#000" }));
  save(join(root, "site.json"), { name: "Test Site", slug: "test", lang: "en" });
  save(join(root, "onboarding/business.json"), { version: 2, facts: [] });
  save(join(root, "onboarding/media-inventory.json"), { version: 2, assets: [] });

  prepareRefine({ root, instruction: "Update headline", requestId: "req-noop" });

  const res = await verifyRefine({ root, requestId: "req-noop" });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some(f => /Refinement produced no changes/i.test(f)));
});

test("verifyRefine catches fixed desktop widths that overflow mobile viewport", async () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "theme"), { recursive: true });
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home</title></head><body><div>Content</div></body></html>');
  writeFileSync(join(root, "theme/defaults.json"), JSON.stringify({ bg: "#fff", text: "#000" }));
  save(join(root, "site.json"), { name: "Test Site", slug: "test", lang: "en" });
  save(join(root, "onboarding/business.json"), { version: 2, facts: [] });
  save(join(root, "onboarding/media-inventory.json"), { version: 2, assets: [] });

  prepareRefine({ root, instruction: "Add desktop widget", requestId: "req-overflow" });
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home</title></head><body><div style="width: 1400px;">Overflowing</div></body></html>');

  const res = await verifyRefine({ root, requestId: "req-overflow" });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some(f => /Fixed desktop width without responsive constraint/i.test(f)));
});

test("verifyRefine fails if requested change keywords are unfulfilled", async () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "theme"), { recursive: true });
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home</title></head><body><h1>Initial Title</h1></body></html>');
  writeFileSync(join(root, "theme/defaults.json"), JSON.stringify({ bg: "#fff", text: "#000" }));
  save(join(root, "site.json"), { name: "Test Site", slug: "test", lang: "en" });
  save(join(root, "onboarding/business.json"), { version: 2, facts: [] });
  save(join(root, "onboarding/media-inventory.json"), { version: 2, assets: [] });

  prepareRefine({ root, instruction: "Add an announcement regarding turnaround timeframe", requestId: "req-unfulfilled" });

  // Modify file but omit turnaround/timeframe
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home</title></head><body><h1>Completely Unrelated Header</h1></body></html>');

  const failRes = await verifyRefine({ root, requestId: "req-unfulfilled" });
  assert.equal(failRes.ok, false);
  assert.ok(failRes.failures.some(f => /does not fulfill instruction/i.test(f)));

  // Now fulfill the request with turnaround timeframe content
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home</title></head><body><h1>Our Turnaround Timeframe Guarantee</h1></body></html>');

  const passRes = await verifyRefine({ root, requestId: "req-unfulfilled" });
  assert.equal(passRes.ok, true, `Expected pass, got: ${passRes.failures.join("; ")}`);
});

test("verifyRefine catches live browser DOM defects during verification", async () => {
  const root = temp();
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "theme"), { recursive: true });
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home</title></head><body><h1>Original</h1></body></html>');
  writeFileSync(join(root, "theme/defaults.json"), JSON.stringify({ bg: "#fff", text: "#000" }));
  save(join(root, "site.json"), { name: "Test Site", slug: "test", lang: "en" });
  save(join(root, "onboarding/business.json"), { version: 2, facts: [] });
  save(join(root, "onboarding/media-inventory.json"), { version: 2, assets: [] });

  prepareRefine({ root, instruction: "Update hero with new gallery image", requestId: "req-broken-dom" });

  // Write page with missing h1 (only h2) and broken live image URL
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home</title></head><body><h2>Subheading Only</h2><img src="http://127.0.0.1:9999/nonexistent.jpg" alt="Missing"></body></html>');

  const res = await verifyRefine({ root, requestId: "req-broken-dom" });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some(f => /Expected exactly one h1/i.test(f)));
  assert.ok(res.failures.some(f => /Broken image detected in live DOM/i.test(f)));
});



