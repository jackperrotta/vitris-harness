import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fingerprint, sourceHash, type Business, type Direction, type MediaInventory, type Review, type Storyboard } from "../artifacts.ts";
import { REVIEW_CRITERIA, reviewSubject } from "../evaluate.ts";
import type { StagePreparation } from "../preparation.ts";
import { applyAssistProfile } from "./pilot-recipe.ts";
import type { JevConfig } from "./types.ts";
import { loadLatestQualityResult } from "./content-checks.ts";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

export const COMPACT_GRAPH = {
  version: 2,
  stop_at: "preview_ready",
  nodes: [
    { id: "harvest", needs: [], writes: ["onboarding/brief.json", "onboarding/raw", "onboarding/harvest-inventory.json", "media/harvest"], refs: [], tools: [], eval: "harvest", maxAttempts: 4, kind: "agent", inputs: ["launch.json"] },
    { id: "business", needs: ["harvest"], writes: ["onboarding/business.json"], refs: [], tools: [], eval: "business", maxAttempts: 4, kind: "agent", inputs: ["onboarding/brief.json", "onboarding/copy"] },
    { id: "business-review", needs: ["business"], writes: ["agent/reviews/business-review.json"], refs: [], tools: [], eval: "business-review", maxAttempts: 4, kind: "critic", repair: "business", inputs: ["onboarding/business.json"] },
    { id: "media", needs: ["harvest"], writes: ["onboarding/media-inventory.json"], refs: [], tools: [], eval: "media", maxAttempts: 4, kind: "agent", inputs: ["onboarding/brief.json", "media/harvest"] },
    { id: "direction", needs: ["business-review", "media"], writes: ["onboarding/direction.json"], refs: [], tools: [], eval: "direction", maxAttempts: 4, kind: "agent", inputs: ["onboarding/business.json"] },
    { id: "storyboard", needs: ["direction"], writes: ["onboarding/storyboard.json"], refs: [], tools: [], eval: "storyboard", maxAttempts: 4, kind: "agent", inputs: ["onboarding/business.json", "onboarding/direction.json"] },
    { id: "copy", needs: ["storyboard"], writes: ["onboarding/copy-plan.json"], refs: [], tools: [], eval: "copy", maxAttempts: 4, kind: "agent", inputs: ["onboarding/storyboard.json", "onboarding/business.json"] },
    { id: "copy-review", needs: ["copy"], writes: ["agent/reviews/copy-review.json"], refs: [], tools: [], eval: "copy-review", maxAttempts: 4, kind: "critic", repair: "copy", inputs: ["onboarding/copy-plan.json", "onboarding/storyboard.json", "onboarding/business.json"] },
    { id: "pages", needs: ["copy-review"], writes: ["pages"], refs: [], tools: [], eval: "pages", maxAttempts: 4, kind: "agent", inputs: ["onboarding/storyboard.json", "onboarding/copy-plan.json"] },
    { id: "browser", needs: ["pages"], writes: ["agent/reviews/browser.json", "agent/screenshots", "dist"], refs: [], tools: [], eval: "browser", maxAttempts: 4, kind: "agent", inputs: ["pages"] },
    { id: "content-review", needs: ["browser"], writes: ["agent/reviews/content-review.json"], refs: [], tools: [], eval: "content-review", maxAttempts: 4, kind: "critic", repair: "pages", inputs: ["dist", "onboarding/copy-plan.json"] },
    { id: "preview", needs: ["content-review"], writes: [], refs: [], tools: [], eval: "preview", maxAttempts: 4, kind: "agent", inputs: ["dist"] },
  ],
};

const OFFER = "Roof repairs for homeowners";
const COPY_HOME = "We repair roofs for homeowners in the county.";
const HERO_BODY = "We repair roofs for homeowners in the county.";
const ABOUT_BODY = "The same team shows up on weekdays.";
const PROOF_BODY = "Work is inspected before we leave the job.";
const CTA_BODY = "Call to schedule a weekday visit.";

export async function passingFetch(_input: string, init?: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init?.body || "{}"));
  const answers: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(body.questions || {})) {
    const q = raw as { type?: string; criteria?: Record<string, string> | Array<{ score: number }>; prompt?: string; query?: string };
    const text = `${key} ${q.prompt || ""} ${q.query || ""}`;
    if (q.type === "noul") {
      const covered = /intent_|visitor question|Does the supplied page text actually answer/i.test(text);
      const repetitive = /repetitive page rhythm/i.test(text);
      answers[key] = { type: "noul", noul: repetitive ? 0.05 : covered ? 0.95 : 0.05 };
    } else if (q.type === "score") {
      answers[key] = { type: "score", score: 3, confidence: 0.9, probabilities: { "3": 1 } };
    } else {
      const ids = Object.keys(q.criteria && !Array.isArray(q.criteria) ? q.criteria : {});
      const pick = ids.includes("consistent")
        ? "consistent"
        : ids.includes("preserved")
          ? "preserved"
          : ids.includes("supports")
            ? "supports"
            : ids.includes("yes")
              ? "yes"
              : ids[0] || "yes";
      const probabilities = Object.fromEntries(ids.map(id => [id, id === pick ? 1 : 0]));
      if (!ids.length) probabilities[pick] = 1;
      answers[key] = { type: "choice", choice: pick, confidence: 0.9, probabilities };
    }
  }
  return new Response(JSON.stringify({
    model: "jev-1.13.0",
    answers,
    usage: { input_tokens: 12, output_tokens: 3 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function writeReview(root: string, node: string): void {
  const checks = (REVIEW_CRITERIA[node] || ["accuracy"]).map(criterion => ({
    criterion, verdict: "pass" as const, evidence: `Observed ${criterion} against current artifacts.`,
  }));
  const subjectHash = reviewSubject(root, node);
  const quality = loadLatestQualityResult(root, node);
  const dispositions = (quality?.overflowIds || []).map(id => ({
    findingId: id,
    subjectHash,
    disposition: "accepted_risk" as const,
    rationale: "Question-budget overflow remains an explicit critic obligation; the compact fixture records it rather than treating unjudged questions as a Jev pass.",
    evidence: `overflow:${id}`,
  }));
  const review: Review = {
    version: 2,
    subjectHash,
    verdict: "pass",
    reviewer: "injected-executor",
    evidence: existsSync(join(root, "onboarding/business.json")) ? ["onboarding/business.json"] : ["launch.json"],
    checks,
    findings: [],
    dispositions,
  };
  mkdirSync(join(root, "agent/reviews"), { recursive: true });
  writeFileSync(join(root, "agent/reviews", `${node}.json`), JSON.stringify(review, null, 2), "utf8");
}

function homepageHtml(): string {
  return `<!DOCTYPE html><html><head><title>Roof repairs</title></head><body>
<header>Local roofs</header>
<section id="hero">
  <h1>Roof repairs</h1>
  <img fetchpriority="high" src="/media/harvest/hero.jpg" alt="Roof crew">
  <p>${HERO_BODY}</p>
  <a class="btn" href="tel:2155550100">Call</a>
</section>
<section id="about">
  <h2 class="section__head">Our crew</h2>
  <p>${ABOUT_BODY}</p>
</section>
<section id="proof">
  <h2>Licensed work</h2>
  <p>${PROOF_BODY}</p>
</section>
<section id="cta">
  <h2>Next step</h2>
  <p>${CTA_BODY}</p>
  <a class="btn" href="tel:2155550100">Call</a>
</section>
<footer>Call 2155550100</footer>
</body></html>`;
}

export function seedCompactPilotSite(root: string, arm: "A" | "B", profile?: Parameters<typeof applyAssistProfile>[2]): JevConfig {
  mkdirSync(join(root, "agent"), { recursive: true });
  mkdirSync(join(root, "onboarding/copy"), { recursive: true });
  mkdirSync(join(root, "onboarding/raw"), { recursive: true });
  mkdirSync(join(root, "media/harvest"), { recursive: true });
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "theme"), { recursive: true });
  writeFileSync(join(root, "launch.json"), JSON.stringify({ slug: "pilot-roofs", name: "Pilot Roofs" }, null, 2), "utf8");
  writeFileSync(join(root, "site.json"), JSON.stringify({ name: "Pilot Roofs" }, null, 2), "utf8");
  writeFileSync(join(root, "theme/defaults.json"), "{}", "utf8");
  writeFileSync(join(root, "agent/graph.yaml"), JSON.stringify(COMPACT_GRAPH, null, 2), "utf8");
  writeFileSync(join(root, "agent/PROMPT.md"), "Injected compact pilot site. Follow CURRENT.md.\n", "utf8");
  writeFileSync(join(root, "agent/workflow.json"), JSON.stringify({ schemaVersion: 1, executionMode: "active-agent" }, null, 2), "utf8");
  return applyAssistProfile(root, arm, profile);
}

export async function compactPilotExecutor(opts: {
  stage: { id: string; kind?: string };
  prep: StagePreparation;
  prompt: string;
  root?: string;
}): Promise<void> {
  const root = opts.root;
  if (!root) throw new Error("compactPilotExecutor requires root");
  const id = opts.stage.id;
  if (id === "harvest") {
    writeFileSync(join(root, "onboarding/copy/home.md"), COPY_HOME, "utf8");
    writeFileSync(join(root, "media/harvest/hero.jpg"), "fake-jpeg", "utf8");
    writeFileSync(join(root, "onboarding/raw/home.html"), `<p>${COPY_HOME}</p>`, "utf8");
    writeFileSync(join(root, "onboarding/brief.json"), JSON.stringify({
      sourceUrl: "https://example.test",
      pages: [{ url: "https://example.test/", title: "Roof repairs", outline: ["hero"] }, { url: "https://example.test/about", title: "About", outline: ["about"] }],
      images: [{ sourceUrl: "https://example.test/hero.jpg", localPath: "/media/harvest/hero.jpg" }],
      warnings: [],
    }, null, 2), "utf8");
    writeFileSync(join(root, "onboarding/harvest-inventory.json"), JSON.stringify({
      exclusions: [],
      unvisited: [],
    }, null, 2), "utf8");
    return;
  }
  if (id === "business") {
    const business: Business = {
      version: 2,
      offer: OFFER,
      audience: "Homeowners with leaks",
      trigger: "A leak",
      outcome: "Roof repairs for homeowners",
      includes: ["Roof repair"],
      engagement: "Call",
      positioning: "Local weekday crew",
      facts: [{ id: "f1", claim: COPY_HOME, evidence: ["e1"] }],
      evidence: [{ id: "e1", source: "onboarding/copy/home.md", excerpt: COPY_HOME }],
      uncertainties: [],
    };
    writeFileSync(join(root, "onboarding/business.json"), JSON.stringify(business, null, 2), "utf8");
    return;
  }
  if (id === "business-review" || id === "copy-review" || id === "content-review") {
    writeReview(root, id);
    return;
  }
  if (id === "media") {
    const inventory: MediaInventory = {
      version: 2,
      harvestHash: fingerprint(root, ["onboarding/brief.json", "media/harvest"]),
      assets: [{
        id: "hero",
        path: "/media/harvest/hero.jpg",
        sources: ["https://example.test/hero.jpg"],
        description: "Crew on a roof",
        role: "hero",
        disposition: "use",
        reason: "Primary offer photo",
        inspected: true,
        placements: ["/#hero"],
      }],
    };
    writeFileSync(join(root, "onboarding/media-inventory.json"), JSON.stringify(inventory, null, 2), "utf8");
    return;
  }
  if (id === "direction") {
    const direction: Direction = {
      version: 2,
      businessHash: fingerprint(root, ["onboarding/business.json"]),
      request: "Straightforward local trade site",
      candidates: [
        { id: "a", rationale: "Direct split hero", typography: "sans", composition: "split", mediaTreatment: "photo" },
        { id: "b", rationale: "Quiet stacked hero", typography: "serif", composition: "stack", mediaTreatment: "muted" },
      ],
      selected: "a",
      rationale: "Matches weekday crew offer",
      system: {
        personality: "direct",
        typography: "sans",
        colorRoles: "warm",
        density: "medium",
        rhythm: "even",
        mediaTreatment: "photo",
        surfaces: "flat",
        navigation: "simple",
        motifs: "none",
        interiors: "plain",
        avoid: ["luxury"],
      },
      studies: [],
      designContractVersion: 1,
      centralIdea: "A direct local crew offer with one inspected hero photo",
      opportunityIds: ["opp-roof"],
      decisions: [{
        id: "hero-media",
        kind: "media",
        choice: "Lead with the inspected crew-on-roof photo",
        rationale: "The inventory has one usable hero asset",
        scope: "homepage hero",
        tradeoff: "Less atmospheric variety than a full gallery",
      }],
      rejectedAlternatives: [{ id: "b", summary: "Stacked serif hero muted the weekday urgency" }],
      identityInvariants: ["The phone CTA stays visible without scrolling on desktop"],
      flexibleDecisions: ["Interior about-page density"],
    };
    writeFileSync(join(root, "onboarding/direction.json"), JSON.stringify(direction, null, 2), "utf8");
    return;
  }
  if (id === "storyboard") {
    const sectionDesign = (section: Storyboard["pages"][number]["sections"][number]) => ({
      ...section,
      role: section.id === "hero" ? "offer" : section.id,
      purpose: section.message,
      emphasisReason: section.id === "hero" ? "The offer is the first question" : "Supports the conversion path",
      layoutFamily: section.composition,
      density: section.id === "hero" ? "open" : "medium",
      mediaProminence: section.media?.length ? "lead" : "none",
      mobileTransformation: section.id === "hero" ? "Offer line, hero photo, then call action" : "Stack heading then body",
    });
    const storyboard: Storyboard = {
      version: 2,
      designContractVersion: 1,
      businessHash: fingerprint(root, ["onboarding/business.json"]),
      directionHash: fingerprint(root, ["onboarding/direction.json"]),
      routes: [
        { source: "https://example.test/", disposition: "preserve", target: "/", reason: "Home" },
        { source: "https://example.test/about", disposition: "preserve", target: "/about", reason: "Interior" },
      ],
      pages: [{
        path: "/",
        purpose: "Convert leak calls",
        representative: true,
        role: "homepage",
        visitorOutcome: "Request a repair estimate",
        sections: [
          sectionDesign({ id: "hero", question: "Who repairs the roof?", message: OFFER, facts: ["f1"], media: ["hero"], action: { label: "Call", destination: "tel:2155550100", behavior: "phone" }, composition: "split", emphasis: "offer", transition: "none" }),
          sectionDesign({ id: "about", question: "Who shows up?", message: ABOUT_BODY, facts: ["f1"], media: [], action: null, composition: "stack", emphasis: "crew", transition: "none" }),
          sectionDesign({ id: "proof", question: "Is work inspected?", message: PROOF_BODY, facts: ["f1"], media: [], action: null, composition: "stack", emphasis: "proof", transition: "none" }),
          sectionDesign({ id: "cta", question: "How do I start?", message: CTA_BODY, facts: ["f1"], media: [], action: { label: "Call", destination: "tel:2155550100", behavior: "phone" }, composition: "stack", emphasis: "action", transition: "none" }),
        ],
      }, {
        path: "/about",
        purpose: "Meet the crew",
        representative: true,
        role: "interior",
        visitorOutcome: "Trust the crew",
        sections: [
          sectionDesign({ id: "about", question: "Who shows up?", message: ABOUT_BODY, facts: ["f1"], media: [], action: null, composition: "stack", emphasis: "crew", transition: "none" }),
        ],
      }],
    };
    writeFileSync(join(root, "onboarding/storyboard.json"), JSON.stringify(storyboard, null, 2), "utf8");
    return;
  }
  if (id === "copy") {
    writeFileSync(join(root, "onboarding/copy-plan.json"), JSON.stringify({
      version: 2,
      storyboardHash: fingerprint(root, ["onboarding/storyboard.json"]),
      pages: [{
        path: "/",
        sections: [
          { id: "hero", heading: "Roof repairs", body: HERO_BODY, factIds: ["f1"], cta: "Call" },
          { id: "about", heading: "Our crew", body: ABOUT_BODY, factIds: ["f1"] },
          { id: "proof", heading: "Licensed work", body: PROOF_BODY, factIds: ["f1"] },
          { id: "cta", heading: "Next step", body: CTA_BODY, factIds: ["f1"], cta: "Call" },
        ],
      }, {
        path: "/about",
        sections: [
          { id: "about", heading: "Our crew", body: ABOUT_BODY, factIds: ["f1"] },
        ],
      }],
    }, null, 2), "utf8");
    return;
  }
  if (id === "pages") {
    writeFileSync(join(root, "pages/index.html"), homepageHtml(), "utf8");
    writeFileSync(join(root, "pages/about.html"), `<!DOCTYPE html><html><head><title>About</title></head><body>
<header>Local roofs</header>
<section id="about"><h1>Our crew</h1><p>${ABOUT_BODY}</p></section>
<footer>Call</footer>
</body></html>`, "utf8");
    return;
  }
  if (id === "browser") {
    mkdirSync(join(root, "dist"), { recursive: true });
    mkdirSync(join(root, "dist/about"), { recursive: true });
    mkdirSync(join(root, "agent/screenshots"), { recursive: true });
    copyFileSync(join(root, "pages/index.html"), join(root, "dist/index.html"));
    copyFileSync(join(root, "pages/about.html"), join(root, "dist/about/index.html"));
    const shots = [
      "agent/screenshots/home-375.png",
      "agent/screenshots/home-1080.png",
      "agent/screenshots/about-375.png",
      "agent/screenshots/about-1080.png",
    ];
    for (const shot of shots) writeFileSync(join(root, shot), PNG);
    const report = {
      sourceHash: sourceHash(root),
      distHash: fingerprint(root, ["dist"]),
      scope: "pilot",
      checks: [
        { path: "/", width: 375, screenshot: shots[0], screenshotHash: fingerprint(root, [shots[0]!]), failures: [] },
        { path: "/", width: 1080, screenshot: shots[1], screenshotHash: fingerprint(root, [shots[1]!]), failures: [] },
        { path: "/about", width: 375, screenshot: shots[2], screenshotHash: fingerprint(root, [shots[2]!]), failures: [] },
        { path: "/about", width: 1080, screenshot: shots[3], screenshotHash: fingerprint(root, [shots[3]!]), failures: [] },
      ],
    };
    mkdirSync(join(root, "agent/reviews"), { recursive: true });
    writeFileSync(join(root, "agent/reviews/browser.json"), JSON.stringify(report, null, 2), "utf8");
    return;
  }
}

export async function writeCompactArtifacts(root: string): Promise<void> {
  for (const node of COMPACT_GRAPH.nodes) {
    await compactPilotExecutor({
      stage: { id: node.id, kind: node.kind },
      prep: { id: `seed-${node.id}` } as StagePreparation,
      prompt: node.id,
      root,
    });
  }
}

export function writeInjectedAbManifest(opts: {
  outPath: string;
  armA: { root: string; calls: number; previewReady: boolean };
  armB: { root: string; calls: number; previewReady: boolean };
  kernelRevision: string;
}): void {
  mkdirSync(dirname(opts.outPath), { recursive: true });
  writeFileSync(opts.outPath, JSON.stringify({
    schemaVersion: 1,
    injectedOffline: true,
    transport: "injected-local-executor",
    jevTransport: "injected-offline-mock",
    liveTypeSafe: false,
    kernelRevision: opts.kernelRevision,
    arms: {
      A: { previewReady: opts.armA.previewReady, jevCalls: opts.armA.calls, root: opts.armA.root },
      B: { previewReady: opts.armB.previewReady, jevCalls: opts.armB.calls, root: opts.armB.root },
    },
    note: "Fixture-produced. Not a live customer-site result. Do not report token savings from this file.",
  }, null, 2), "utf8");
}
