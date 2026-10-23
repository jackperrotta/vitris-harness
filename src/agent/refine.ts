import {validateMotionPlan} from "./motion-plan.ts";
import {captureMotionJourney,journeyEvidenceFailures} from "./browser-motion-journey.ts";
import {motionCompositionPolicy} from "./motion-composition.ts";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { files, fingerprint, json, save, recoverableReplace, acquirePathLock } from "./artifacts.ts";
import { invalidate, parseGraphYaml, type AgentState, type SkillGraph } from "./graph.ts";
import { loadState } from "./runner.ts";
import { buildVerified } from "../build/verified.ts";
import { previewServer } from "../build/serve.ts";
import { explainBrowserLaunchFailure, loadPlaywrightChromium } from "./playwright-runtime.ts";
import { assertRequestId, type ChangeOrigin, type ChangePlanRecord, type ChangeRequestRecord } from "../engine/contracts.ts";
import { sourceRevision } from "../engine/revision.ts";
import { parseFragment } from "parse5";
import { elementMatchesIdentity } from "../editing/identity.ts";

export const CHANGE_SCOPES = ["business", "copy", "pages", "direction", "media"] as const;
export type ChangeScope = (typeof CHANGE_SCOPES)[number];
export type FeedbackGrain = "website" | "page" | "section" | "element";
export type FeedbackKind = "nav_behavior" | "nav_styling" | "content" | "media" | "general";

export type FeedbackItem = {
  grain: FeedbackGrain;
  text: string;
  path?: string;
  sectionId?: string;
  hook?: string;
  kind?: FeedbackKind;
  target?: string;
};

export type MemoryDecision = {
  id: string;
  status: "current" | "superseded";
  kind: "fact" | "media" | "direction" | "copy" | "preference" | "issue";
  acceptance?: "proposal" | "provisional" | "accepted";
  summary: string;
  evidence?: string;
  grain?: FeedbackGrain;
  path?: string;
  sectionId?: string;
  hook?: string;
  intent?: "positive" | "negative" | "preserve" | "observation";
  origin?: "operator" | "agent" | "editor" | "hosted" | "machine" | "human";
  target?: string;
  supersededBy?: string;
};

export type SiteMemory = {
  schemaVersion: 1;
  seededAt: string;
  updatedAt: string;
  businessHash: string;
  mediaHash: string;
  directionHash: string;
  copyHash: string;
  factIds: string[];
  mediaIds: string[];
  decisions: MemoryDecision[];
  unresolved: string[];
  preferences: FeedbackItem[];
  pendingRequest?: { requestId: string; scope: string; startedAt: string };
  acceptedRequests?: Array<{ requestId: string; scope: string; acceptedAt: string }>;
};

export type ChangeRequest = {
  instruction: string;
  originalRequest: string;
  scope: ChangeScope;
  scopes?: ChangeScope[];
  affectedNodes?: string[];
  isMixed?: boolean;
  classifiedScope: ChangeScope;
  overrideScope?: ChangeScope;
  evidencePath: string;
  rationale: string;
  affectedPages: string[];
  proposedChanges: string[];
  likes: FeedbackItem[];
  dislikes: FeedbackItem[];
  preserve: FeedbackItem[];
  implementationReason?: string;
  scopeAmendments?: Array<{ at: string; reason: string; before: ChangeScope[]; after: ChangeScope[]; priorRequest: string }>;
  shadowProposal?: {
    scope: ChangeScope;
    scopes?: ChangeScope[];
    affectedNodes?: string[];
    isMixed?: boolean;
    isAmbiguous?: boolean;
    rationale?: string;
    confidence?: number;
  };
  plan?: ChangePlanRecord;
  origin?: ChangeOrigin;
};

export type NavLink = { href: string; label: string };

export type RefineBaseline = {
  capturedAt: string;
  layoutHash: string;
  structuralLayoutHash?: string;
  themeHash?: string;
  businessHash: string;
  mediaHash: string;
  copyHash: string;
  directionHash: string;
  distHash: string;
  screenshotHash: string;
  nodes: AgentState["nodes"];
  mediaIds: string[];
  factIds: string[];
  preserve: FeedbackItem[];
  navLinks?: NavLink[];
  structuredPreserve?: Array<{ text: string; target?: string; baselineText?: string; error?: string }>;
};

export type RefineReport = {
  schemaVersion: 1;
  instruction: string;
  scope: ChangeScope;
  classifiedScope: ChangeScope;
  rationale: string;
  proposedChanges: string[];
  changed: string[];
  preserved: string[];
  before: { layoutHash: string; distHash: string; screenshotHash: string };
  after: { layoutHash: string; distHash: string; screenshotHash: string };
  memoryKeys: string[];
  failures: string[];
  skippedLayoutRewrite: boolean;
};

const LAYOUT_SKIP_NODES = [
  "representative", "representative-browser", "representative-review", "representative-quality",
  "pages", "browser", "visual-review",
];
const COPY_REQUEST_NODES = ["copy", "pages"];
const BUSINESS_REQUEST_NODES = ["business", "copy", "pages"];
const DIRECTION_REQUEST_NODES = ["direction", "storyboard", "copy", "representative", "pages"];
export const START_NODE: Record<ChangeScope, string> = {
  business: "business",
  copy: "copy",
  pages: "pages",
  direction: "direction",
  media: "media",
};

export function classifyChange(instruction: string): {
  scope: ChangeScope; scopes: ChangeScope[]; affectedNodes: string[]; isMixed: boolean;
  isAmbiguous?: boolean; rationale: string; affectedPages: string[]; proposedChanges: string[];
} {
  const lower = instruction.trim().toLowerCase();
  const affectedPages = affectedPagesFrom(lower);
  // This is a fallback suggestion. The active agent may supply a validated multi-facet plan.
  // Exclude explicit preserve clauses before looking for requested changes.
  const actionable = lower.split(/(?<=[.!?;])\s+|\s+\b(?:but|and)\b\s+/)
    .filter(part => !/\b(?:do not|don't|never|without)\s+(?:change|edit|update|touch|alter|modify)\b|\b(?:keep|preserve|retain)\b/.test(part))
    .join(" ");
  const scopes = new Set<ChangeScope>();
  if (/\b(?:new service|add\b.{0,60}\bservice|we now serve|new location|change (?:hours|pricing|price|offer|audience)|update (?:hours|pricing|price|offer|audience))\b/.test(actionable)) scopes.add("business");
  if (/\b(?:image|photo|picture|media)\b/.test(actionable)) scopes.add("media");
  if (/\b(?:more premium|less busy|less cluttered|restyle|theme|visual direction|look and feel|typography|color palette|density|art direction)\b/.test(actionable)) scopes.add("direction");
  if (/\b(?:mobile menu|menu|navigation|nav|header|footer|layout|button size|contact button|padding|spacing|component|section order|use variant)\b/.test(actionable)) scopes.add("pages");
  if (/\b(?:wording|headline|subhead|rewrite|copy edit|caption|cta text|body copy|tone of voice|change (?:copy|text)|update (?:copy|text))\b/.test(actionable)) scopes.add("copy");
  if (/\b(?:harvest|recrawl|rescan source)\b/.test(actionable)) scopes.add("pages");
  if (scopes.size === 0) {
    return { ...classified("copy", "Ambiguous request; active-agent planning is required before acceptance.", affectedPages,
      ["Clarify the requested outcome and preserve approved facts."]), isAmbiguous: true };
  }
  const ordered = CHANGE_SCOPES.filter(scope => scopes.has(scope));
  const scope = ordered[0]!;
  return {
    scope, scopes: ordered, affectedNodes: [...new Set(ordered.flatMap(requestNodesFor))],
    isMixed: ordered.length > 1, rationale: `Fallback suggestion for ${ordered.join(", ")} facets; confirm with an active-agent plan.`,
    affectedPages, proposedChanges: ordered.map(facet => `Address the ${facet} facet of the original request.`),
  };
}

export async function classifyChangeAsync(
  instruction: string,
  opts?: {
    root?: string;
    client?: import("./jev/client.ts").JevClient;
    mode?: import("./jev/types.ts").JevMode;
    overrideScope?: ChangeScope;
    threshold?: number;
    signal?: AbortSignal;
  }
): Promise<{
  scope: ChangeScope;
  scopes?: ChangeScope[];
  affectedNodes?: string[];
  classifiedScope: ChangeScope;
  rationale: string;
  affectedPages: string[];
  proposedChanges: string[];
  isMixed?: boolean;
  isAmbiguous?: boolean;
  confidence?: number;
  jevEvaluated: boolean;
  shadowProposal?: {
    scope: ChangeScope;
    scopes?: ChangeScope[];
    affectedNodes?: string[];
    isMixed?: boolean;
    isAmbiguous?: boolean;
    rationale?: string;
    confidence?: number;
  };
}> {
  const baseline = classifyChange(instruction);
  const mode = opts?.mode || "off";
  if (mode === "off" || !opts?.client) {
    const execScope = opts?.overrideScope || baseline.scope;
    const execScopes = opts?.overrideScope ? [execScope] : baseline.scopes;
    return {
      scope: execScope,
      scopes: execScopes,
      affectedNodes: opts?.overrideScope ? requestNodesFor(execScope) : baseline.affectedNodes,
      classifiedScope: baseline.scope,
      rationale: baseline.rationale,
      affectedPages: baseline.affectedPages,
      proposedChanges: baseline.proposedChanges,
      isMixed: execScopes.length > 1,
      isAmbiguous: baseline.isAmbiguous,
      jevEvaluated: false,
    };
  }

  try {
    const { makeMultiScopeRoutingQuestions } = await import("./jev/questions.ts");
    const { buildRoutingState } = await import("./jev/state.ts");
    const { evaluateMultiScopeDecision } = await import("./jev/policy.ts");

    const questions = makeMultiScopeRoutingQuestions(instruction);
    const state = buildRoutingState(instruction, { pages: baseline.affectedPages });
    const evalResult = await opts.client.evaluate({
      taskType: "routing",
      questions,
      state,
      signal: opts.signal,
    });

    const policyResult = evaluateMultiScopeDecision({
      answers: evalResult.result.answers as any,
      overrideScope: opts.overrideScope,
      fallbackScope: baseline.scope,
      threshold: opts.threshold,
    });

    if (mode === "shadow") {
      // In shadow mode, record Jev decision proposal separately, but return 100% baseline execution fields
      // to ensure zero side-effects or state invalidation bleed.
      const execScope = opts.overrideScope || baseline.scope;
      const execScopes = opts.overrideScope ? [execScope] : baseline.scopes;
      return {
        scope: execScope,
        scopes: execScopes,
        affectedNodes: opts.overrideScope ? requestNodesFor(execScope) : baseline.affectedNodes,
        classifiedScope: baseline.scope,
        rationale: `${baseline.rationale} (Shadow Jev evaluated: ${policyResult.scope}, confidence: ${policyResult.confidence})`,
        affectedPages: baseline.affectedPages,
        proposedChanges: baseline.proposedChanges,
        isMixed: execScopes.length > 1,
        isAmbiguous: baseline.isAmbiguous,
        jevEvaluated: true,
        confidence: policyResult.confidence,
        shadowProposal: {
          scope: policyResult.scope,
          scopes: policyResult.scopes,
          affectedNodes: policyResult.affectedNodes,
          isMixed: policyResult.isMixed,
          isAmbiguous: policyResult.isAmbiguous,
          rationale: policyResult.rationale,
          confidence: policyResult.confidence,
        },
      };
    }

    // In assist mode, use Jev policy decision
    return {
      scope: policyResult.scope,
      scopes: policyResult.scopes,
      affectedNodes: policyResult.affectedNodes,
      classifiedScope: policyResult.scope,
      rationale: policyResult.rationale,
      affectedPages: baseline.affectedPages,
      proposedChanges: baseline.proposedChanges,
      isMixed: policyResult.isMixed,
      isAmbiguous: policyResult.isAmbiguous,
      confidence: policyResult.confidence,
      jevEvaluated: true,
    };
  } catch (err: any) {
    // Fall back to baseline on any Jev failure or network issue
    return {
      scope: opts.overrideScope || baseline.scope,
      scopes: opts.overrideScope ? [opts.overrideScope] : baseline.scopes,
      affectedNodes: opts.overrideScope ? requestNodesFor(opts.overrideScope) : baseline.affectedNodes,
      classifiedScope: baseline.scope,
      rationale: `${baseline.rationale} (Jev fallback: ${err.message})`,
      affectedPages: baseline.affectedPages,
      proposedChanges: baseline.proposedChanges,
      isMixed: !opts.overrideScope && baseline.isMixed,
      isAmbiguous: baseline.isAmbiguous,
      jevEvaluated: false,
    };
  }
}

function classified(scope: ChangeScope, rationale: string, affectedPages: string[], proposedChanges: string[]) {
  return {
    scope,
    scopes: [scope],
    affectedNodes: requestNodesFor(scope),
    isMixed: false,
    rationale,
    affectedPages,
    proposedChanges,
  };
}

function affectedPagesFrom(lower: string): string[] {
  const pages: string[] = [];
  if (/\b(homepage|home page|home)\b/.test(lower)) pages.push("/");
  if (/\babout\b/.test(lower)) pages.push("/about");
  if (/\bcontact\b/.test(lower)) pages.push("/contact");
  if (/\bpricing\b/.test(lower)) pages.push("/pricing");
  const named = [...lower.matchAll(/\bpage(?:s)?\s+(\/[a-z0-9-]+)/g)].map(m => m[1]!);
  return [...new Set([...pages, ...named])];
}

export function parseFeedback(instruction: string): { likes: FeedbackItem[]; dislikes: FeedbackItem[]; preserve: FeedbackItem[] } {
  const likes: FeedbackItem[] = [];
  const dislikes: FeedbackItem[] = [];
  const preserve: FeedbackItem[] = [];
  const grainFor = (chunk: string): FeedbackItem => {
    const lower = chunk.toLowerCase();
    const path = /\b(?:homepage|home page)\b/.test(lower) ? "/"
      : lower.match(/\b(?:on|of|in)\s+(\/[a-z0-9/-]+)\b/)?.[1]
      || lower.match(/\b(about|contact|pricing)\s+page\b/)?.[1]?.replace(/^/, "/");
    const sectionId = lower.match(/\bsection\s+(?:id[=:\s]+)?#?([a-z][a-z0-9_-]*)\b/)?.[1]
      || lower.match(/\b([a-z][a-z0-9_-]*)\s+section\b/)?.[1];
    const hook = lower.match(/\b(?:element|button|link|headline)\s+(?:id[=:\s]+)?#([a-z][a-z0-9_-]*)\b/)?.[1];
    const grain: FeedbackGrain = /\b(button|headline|logo|nav item|link)\b/.test(lower) ? "element"
      : /\bsection\b/.test(lower) ? "section"
      : path || /\bpage\b/.test(lower) ? "page"
      : "website";
    let kind: FeedbackKind = "general";
    if (/\b(nav|navigation|menu|header links)\b/.test(lower)) {
      if (/\b(style|styling|look|color|font|typography|theme|visual)\b/.test(lower)) {
        kind = "nav_styling";
      } else {
        kind = "nav_behavior";
      }
    } else if (/\b(image|images|photo|photos|media|logo|picture)\b/.test(lower)) {
      kind = "media";
    } else if (/\b(copy|headline|wording|text|caption|subhead|paragraph|title)\b/.test(lower)) {
      kind = "content";
    }
    return { grain, text: chunk.trim(), path, sectionId, hook, kind };
  };
  const dislikeRanges: Array<[number, number]> = [];
  const dislikePatterns = [
    /\b(?:dislike|don't like|do not like|hate|avoid)\b\s*([^.!?;]*)/gi,
    /\btoo\s+(?:dense|dark|slow|large|small|cluttered|complex|plain)\b([^.!?;]*)/gi,
  ];
  for (const pattern of dislikePatterns) for (const match of instruction.matchAll(pattern)) {
    dislikes.push(grainFor(match[0]));
    dislikeRanges.push([match.index, match.index + match[0].length]);
  }
  for (const match of instruction.matchAll(/\b(?:keep|preserve|don't change|do not change)\b\s*([^.!?;]*)/gi)) {
    preserve.push(grainFor(match[0]));
  }
  for (const match of instruction.matchAll(/\b(?:like|liked|love|prefer)\b\s*([^.!?;]*)/gi)) {
    if (!dislikeRanges.some(([start, end]) => match.index >= start && match.index < end)) likes.push(grainFor(match[0]));
  }
  return { likes, dislikes, preserve };
}

export function affectedNodeIds(graph: SkillGraph, startId: string): Set<string> {
  const affected = new Set([startId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of graph.nodes) if (!affected.has(node.id) && node.needs.some(n => affected.has(n))) {
      affected.add(node.id); changed = true;
    }
  }
  return affected;
}

export function requestNodesFor(scope: ChangeScope): string[] {
  if (scope === "business") return BUSINESS_REQUEST_NODES;
  if (scope === "copy") return COPY_REQUEST_NODES;
  if (scope === "direction") return DIRECTION_REQUEST_NODES;
  if (scope === "media") return ["media", "representative", "pages"];
  return ["pages"];
}

function hashIfPresent(root: string, paths: string[]): string {
  const existing = paths.filter(path => existsSync(join(root, path)));
  return existing.length ? fingerprint(root, existing) : "";
}

function factIds(root: string): string[] {
  const path = join(root, "onboarding/business.json");
  if (!existsSync(path)) return [];
  return (json<{ facts?: { id: string }[] }>(path).facts || []).map(f => f.id);
}

function mediaIds(root: string): string[] {
  const path = join(root, "onboarding/media-inventory.json");
  if (!existsSync(path)) return [];
  return (json<{ assets?: { id: string }[] }>(path).assets || []).map(a => a.id);
}

export function seedSiteMemory(root: string): SiteMemory {
  const existing = join(root, "agent/site-memory.json");
  if (existsSync(existing)) return json<SiteMemory>(existing);
  const theme = existsSync(join(root, "agent/request.json")) ? json<{ theme?: string }>(join(root, "agent/request.json")).theme : undefined;
  const decisions: MemoryDecision[] = [];
  if (existsSync(join(root, "onboarding/business.json"))) {
    decisions.push({ id: "business-current", status: "current", acceptance: "accepted", kind: "fact", summary: "Current business interpretation", evidence: "onboarding/business.json" });
  }
  if (existsSync(join(root, "onboarding/direction.json"))) {
    decisions.push({ id: "direction-current", status: "current", kind: "direction", summary: "Approved design direction", evidence: "onboarding/direction.json" });
  }
  if (existsSync(join(root, "onboarding/copy-plan.json"))) {
    decisions.push({ id: "copy-current", status: "current", kind: "copy", summary: "Approved copy plan", evidence: "onboarding/copy-plan.json" });
  }
  if (theme?.trim()) {
    decisions.push({ id: "theme-preference", status: "current", kind: "preference", summary: theme.trim(), grain: "website" });
  }
  const memory: SiteMemory = {
    schemaVersion: 1,
    seededAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    businessHash: hashIfPresent(root, ["onboarding/business.json"]),
    mediaHash: hashIfPresent(root, ["onboarding/media-inventory.json"]),
    directionHash: hashIfPresent(root, ["onboarding/direction.json"]),
    copyHash: hashIfPresent(root, ["onboarding/copy-plan.json"]),
    factIds: factIds(root),
    mediaIds: mediaIds(root),
    decisions,
    unresolved: [],
    preferences: theme?.trim() ? [{ grain: "website", text: theme.trim() }] : [],
  };
  save(join(root, "agent/site-memory.json"), memory);
  return memory;
}

export function loadSiteMemory(root: string): SiteMemory {
  return seedSiteMemory(root);
}

function archiveDecision(root: string, decision: MemoryDecision): void {
  const dir = join(root, "agent/site-memory-history");
  mkdirSync(dir, { recursive: true });
  save(join(dir, `${Date.now()}-${decision.id}.json`), { ...decision, status: "superseded", archivedAt: new Date().toISOString() });
}

export function updateSiteMemory(root: string, request: ChangeRequest, extras?: { implementationReason?: string; unresolved?: string[] }): SiteMemory {
  const memory = loadSiteMemory(root);
  const now = new Date().toISOString();
  const reqId = request.evidencePath.match(/requests\/([^/]+)\//)?.[1];
  if (reqId && memory.acceptedRequests?.some(entry => entry.requestId === reqId)) return memory;
  const targetPath = request.affectedPages.length === 1 ? request.affectedPages[0] : undefined;
  const replace = (kind: MemoryDecision["kind"], summary: string, evidence?: string) => {
    const id = `${kind}-${randomUUID()}`;
    for (const decision of memory.decisions.filter(d => d.kind === kind && d.status === "current" && d.path === targetPath)) {
      decision.status = "superseded";
      decision.supersededBy = id;
      archiveDecision(root, decision);
    }
    memory.decisions = memory.decisions.filter(d => d.status === "current");
    memory.decisions.push({ id, status: "current", acceptance: "accepted", kind, summary, evidence,
      path: targetPath, origin: request.origin || "operator", intent: "observation" });
  };
  if (request.scope === "business") replace("fact", request.instruction, "onboarding/business.json");
  if (request.scope === "direction") replace("direction", request.instruction, "onboarding/direction.json");
  if (request.scope === "copy") replace("copy", request.instruction, "onboarding/copy-plan.json");
  for (const [items, intent] of [[request.likes, "positive"], [request.preserve, "preserve"]] as const) for (const item of items) {
    memory.preferences.push(item);
    memory.decisions.push({
      id: `pref-${randomUUID()}`, status: "current", kind: "preference", acceptance: "accepted", origin: request.origin || "operator", intent,
      summary: item.text, grain: item.grain, path: item.path, sectionId: item.sectionId, hook: item.hook, target: item.target,
    });
  }
  for (const item of request.dislikes) {
    memory.decisions.push({
      id: `dislike-${randomUUID()}`, status: "current", kind: "preference", acceptance: "accepted", origin: request.origin || "operator", intent: "negative",
      summary: item.text, grain: item.grain, path: item.path, sectionId: item.sectionId, hook: item.hook, target: item.target,
    });
  }
  if (extras?.implementationReason || request.implementationReason) {
    memory.decisions.push({
      id: `reason-${Date.now()}`, status: "current", kind: "copy",
      summary: extras?.implementationReason || request.implementationReason || "",
      evidence: request.evidencePath,
    });
  }
  if (extras?.unresolved) memory.unresolved = extras.unresolved;
  if (request.evidencePath) {
    if (reqId) {
      if (!memory.acceptedRequests) memory.acceptedRequests = [];
      if (!memory.acceptedRequests.some(r => r.requestId === reqId)) {
        memory.acceptedRequests.push({ requestId: reqId, scope: request.scope, acceptedAt: now });
      }
    }
  }
  memory.businessHash = hashIfPresent(root, ["onboarding/business.json"]);
  memory.mediaHash = hashIfPresent(root, ["onboarding/media-inventory.json"]);
  memory.directionHash = hashIfPresent(root, ["onboarding/direction.json"]);
  memory.copyHash = hashIfPresent(root, ["onboarding/copy-plan.json"]);
  memory.factIds = factIds(root);
  memory.mediaIds = mediaIds(root);
  memory.updatedAt = now;
  save(join(root, "agent/site-memory.json"), memory);
  return memory;
}

export function extractNavLinks(root: string): NavLink[] {
  const links: NavLink[] = [];
  const candidateFiles = [
    join(root, "pages/index.html"),
    join(root, "components/header/template.html"),
  ];
  for (const file of candidateFiles) {
    if (!existsSync(file)) continue;
    const html = readFileSync(file, "utf8");
    const navMatch = html.match(/<(?:nav|header)[^>]*>([\s\S]*?)<\/(?:nav|header)>/i);
    const searchArea = (navMatch && navMatch[1]) ? navMatch[1] : html;
    for (const linkMatch of searchArea.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = linkMatch[1]!.trim();
      const label = linkMatch[2]!.replace(/<[^>]+>/g, "").trim();
      if (href && !href.startsWith("#") && !links.some(l => l.href === href)) {
        links.push({ href, label });
      }
    }
  }
  return links;
}

export function structuralLayoutHash(root: string): string {
  const hash = createHash("sha256");
  for (const dir of ["pages", "components"]) {
    const full = join(root, dir);
    if (!existsSync(full)) continue;
    for (const file of files(full)) {
      if (!/\.(html|css)$/.test(file)) continue;
      const content = readFileSync(file, "utf8");
      const skeleton = file.endsWith(".html")
        ? content.replace(/>([^<]+)</g, "><").replace(/\s+/g, " ")
        : content.replace(/\s+/g, " ");
      hash.update(file.slice(root.length) + "\0");
      hash.update(skeleton);
    }
  }
  return hash.digest("hex");
}

export function pageTextHash(root: string): string {
  const hash = createHash("sha256");
  const full = join(root, "pages");
  if (existsSync(full)) {
    for (const file of files(full)) {
      if (!file.endsWith(".html")) continue;
      hash.update(file.slice(root.length) + "\0");
      hash.update(readFileSync(file, "utf8"));
    }
  }
  return hash.digest("hex");
}

export type CopyPlanSection = {
  id: string;
  heading?: string;
  body?: string;
  factIds?: string[];
  note?: string;
  caption?: string;
  cta?: string;
  slots?: Record<string, string>;
};

export type CopyPlanPage = {
  path: string;
  sections: CopyPlanSection[];
};

export type CopyPlan = {
  version: 2;
  storyboardHash?: string;
  pages: CopyPlanPage[];
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(javascript|vbscript|data):/i.test(trimmed)) return false;
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../") || trimmed.startsWith("#")) return true;
  return /^(https?|mailto|tel):/i.test(trimmed);
}

export function renderInlineMarkdown(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const isList = lines.every(l => !l.trim() || /^[-*]\s+/.test(l.trim())) && lines.some(l => /^[-*]\s+/.test(l.trim()));
  const isNumberedList = lines.every(l => !l.trim() || /^\d+\.\s+/.test(l.trim())) && lines.some(l => /^\d+\.\s+/.test(l.trim()));

  if (isList) {
    const items = lines.filter(l => /^[-*]\s+/.test(l.trim())).map(l => {
      const itemText = l.trim().replace(/^[-*]\s+/, "");
      return `<li>${formatInline(itemText)}</li>`;
    });
    return `<ul>\n  ${items.join("\n  ")}\n</ul>`;
  }

  if (isNumberedList) {
    const items = lines.filter(l => /^\d+\.\s+/.test(l.trim())).map(l => {
      const itemText = l.trim().replace(/^\d+\.\s+/, "");
      return `<li>${formatInline(itemText)}</li>`;
    });
    return `<ol>\n  ${items.join("\n  ")}\n</ol>`;
  }

  return formatInline(text);
}

function formatInline(text: string): string {
  let result = escapeHtml(text);
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/__(.+?)__/g, "<strong>$1</strong>");
  result = result.replace(/(^|[^\*])\*([^\*\n]+?)\*([^\*]|$)/g, "$1<em>$2</em>$3");
  result = result.replace(/(^|[^_])_([^_\n]+?)_([^_]|$)/g, "$1<em>$2</em>$3");
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, rawUrl) => {
    const unescapedUrl = rawUrl.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (isSafeUrl(unescapedUrl)) {
      return `<a href="${escapeHtml(unescapedUrl)}">${label}</a>`;
    }
    return `${label}`;
  });
  return result;
}

export function isProtectedParagraph(html: string): boolean {
  return /\bclass=["'][^"']*\b(note|caption|cta|btn|button)\b/i.test(html) ||
         /\b(?:data-slot|slot)=["'](note|caption|cta|action|button)["']/i.test(html) ||
         /<(?:figcaption|aside|button)\b/i.test(html) ||
         /<a\b[^>]*\bclass=["'][^"']*\b(btn|cta|button)\b/i.test(html);
}

export function findBalancedSlot(html: string, slotName: string): {
  matchStart: number;
  matchEnd: number;
  openTag: string;
  tagName: string;
  contentStart: number;
  contentEnd: number;
  closeTag: string;
} | null {
  const patterns = [
    new RegExp(`<([a-zA-Z0-9_-]+)\\b([^>]*?\\b(?:data-slot|slot)=["']${slotName}["'][^>]*)>`, "i"),
    new RegExp(`<(slot)\\b([^>]*?\\bname=["']${slotName}["'][^>]*)>`, "i"),
    new RegExp(`<([a-zA-Z0-9_-]+)\\b([^>]*?\\bid=["']${slotName}["'][^>]*)>`, "i"),
    new RegExp(`<([a-zA-Z0-9_-]+)\\b([^>]*?\\bclass=["'][^"']*\\b${slotName}\\b[^"']*["'][^>]*)>`, "i"),
  ];
  if (slotName === "caption") {
    patterns.push(/<(figcaption)\b([^>]*)>/i);
  }
  if (slotName === "note") {
    patterns.push(/<(aside)\b([^>]*)>/i);
  }

  let openMatch: RegExpMatchArray | null = null;
  for (const regex of patterns) {
    const m = html.match(regex);
    if (m && m.index !== undefined) {
      openMatch = m;
      break;
    }
  }
  if (!openMatch || openMatch.index === undefined) return null;

  const tagName = openMatch[1]!;
  const openTag = openMatch[0]!;
  const matchStart = openMatch.index;
  const contentStart = matchStart + openTag.length;

  if (openTag.endsWith("/>")) {
    return {
      matchStart,
      matchEnd: contentStart,
      openTag,
      tagName,
      contentStart,
      contentEnd: contentStart,
      closeTag: "",
    };
  }

  const openPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const closePattern = new RegExp(`</${tagName}>`, "gi");

  let depth = 1;
  let pos = contentStart;

  while (pos < html.length) {
    openPattern.lastIndex = pos;
    closePattern.lastIndex = pos;

    const nextOpen = openPattern.exec(html);
    const nextClose = closePattern.exec(html);

    if (!nextClose) return null;

    if (nextOpen && nextOpen.index < nextClose.index) {
      if (!nextOpen[0].endsWith("/>")) depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        const contentEnd = nextClose.index;
        const matchEnd = contentEnd + nextClose[0].length;
        return {
          matchStart,
          matchEnd,
          openTag,
          tagName,
          contentStart,
          contentEnd,
          closeTag: nextClose[0],
        };
      }
      pos = nextClose.index + nextClose[0].length;
    }
  }

  return null;
}

export function findBalancedElement(html: string, sectionId: string): {
  matchStart: number;
  matchEnd: number;
  openTag: string;
  tagName: string;
  contentStart: number;
  contentEnd: number;
  closeTag: string;
} | null {
  const openRegex = new RegExp(`<([a-zA-Z0-9_-]+)\\b([^>]*?\\b(?:id|data-slot|slot)=["']${sectionId}["'][^>]*)>`, "i");
  let openMatch = html.match(openRegex);
  if (!openMatch || openMatch.index === undefined) {
    const slotRegex = new RegExp(`<(slot)\\b([^>]*?\\bname=["']${sectionId}["'][^>]*)>`, "i");
    openMatch = html.match(slotRegex);
  }
  if (!openMatch || openMatch.index === undefined) return null;

  const tagName = openMatch[1]!;
  const openTag = openMatch[0]!;
  const matchStart = openMatch.index;
  const contentStart = matchStart + openTag.length;

  if (openTag.endsWith("/>")) {
    return {
      matchStart,
      matchEnd: contentStart,
      openTag,
      tagName,
      contentStart,
      contentEnd: contentStart,
      closeTag: "",
    };
  }

  const openPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const closePattern = new RegExp(`</${tagName}>`, "gi");

  let depth = 1;
  let pos = contentStart;

  while (pos < html.length) {
    openPattern.lastIndex = pos;
    closePattern.lastIndex = pos;

    const nextOpen = openPattern.exec(html);
    const nextClose = closePattern.exec(html);

    if (!nextClose) {
      return null;
    }

    if (nextOpen && nextOpen.index < nextClose.index) {
      if (!nextOpen[0].endsWith("/>")) {
        depth++;
      }
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        const contentEnd = nextClose.index;
        const matchEnd = contentEnd + nextClose[0].length;
        return {
          matchStart,
          matchEnd,
          openTag,
          tagName,
          contentStart,
          contentEnd,
          closeTag: nextClose[0],
        };
      }
      pos = nextClose.index + nextClose[0].length;
    }
  }

  return null;
}

export function applyCopyPlanToPages(root: string): {
  applied: boolean;
  modifiedPages: string[];
  changes: Array<{ page: string; sectionId: string; heading?: string; body?: string; note?: string; caption?: string; cta?: string }>;
  error?: string;
} {
  const planPath = join(root, "onboarding/copy-plan.json");
  if (!existsSync(planPath)) return { applied: false, modifiedPages: [], changes: [], error: "Missing onboarding/copy-plan.json" };
  const plan = json<CopyPlan>(planPath);
  if (!Array.isArray(plan.pages)) return { applied: false, modifiedPages: [], changes: [], error: "Malformed copy plan: pages is not an array" };

  // 1. Preflight check: Validate all pages, sections, and explicit slots across the ENTIRE plan before touching disk
  for (const pageEntry of plan.pages) {
    const pageRel = pageEntry.path === "/" ? "pages/index.html" : `pages/${pageEntry.path.replace(/^\//, "").replace(/\/$/, "")}.html`;
    let fullPath = join(root, pageRel);
    if (!existsSync(fullPath)) {
      const altPath = join(root, `pages/${pageEntry.path.replace(/^\//, "").replace(/\/$/, "")}/index.html`);
      if (existsSync(altPath)) fullPath = altPath;
      else {
        return {
          applied: false,
          modifiedPages: [],
          changes: [],
          error: `Preflight check failed: target page file not found for '${pageEntry.path}' (${pageRel})`,
        };
      }
    }

    const html = readFileSync(fullPath, "utf8");
    for (const section of pageEntry.sections || []) {
      if (!section.id) continue;
      const element = findBalancedElement(html, section.id);
      if (!element) {
        return {
          applied: false,
          modifiedPages: [],
          changes: [],
          error: `Preflight check failed: target section '${section.id}' not found in page '${pageEntry.path}'`,
        };
      }
      if (section.slots) {
        const sectionInner = html.slice(element.contentStart, element.contentEnd);
        for (const slotKey of Object.keys(section.slots)) {
          const slotElem = findBalancedSlot(sectionInner, slotKey);
          if (!slotElem) {
            return {
              applied: false,
              modifiedPages: [],
              changes: [],
              error: `Preflight check failed: target slot '${slotKey}' not found in section '${section.id}' on page '${pageEntry.path}'`,
            };
          }
        }
      }
    }
  }

  // 2. Preflight passed: Apply copy modifications
  const stagedUpdates: Array<{ fullPath: string; pageRel: string; newHtml: string; originalHtml: string }> = [];
  const modifiedPages: string[] = [];
  const changes: Array<{ page: string; sectionId: string; heading?: string; body?: string; note?: string; caption?: string; cta?: string }> = [];

  for (const pageEntry of plan.pages) {
    const pageRel = pageEntry.path === "/" ? "pages/index.html" : `pages/${pageEntry.path.replace(/^\//, "").replace(/\/$/, "")}.html`;
    let fullPath = join(root, pageRel);
    if (!existsSync(fullPath)) {
      const altPath = join(root, `pages/${pageEntry.path.replace(/^\//, "").replace(/\/$/, "")}/index.html`);
      if (existsSync(altPath)) fullPath = altPath;
    }

    let html = readFileSync(fullPath, "utf8");
    const originalHtml = html;
    let fileChanged = false;

    for (const section of pageEntry.sections || []) {
      if (!section.id) continue;
      const element = findBalancedElement(html, section.id);
      if (!element) continue;

      let sectionInner = html.slice(element.contentStart, element.contentEnd);
      let sectionChanged = false;

      // A. Explicit slots (if section.slots provided)
      if (section.slots) {
        for (const [slotName, slotContent] of Object.entries(section.slots)) {
          const slotElem = findBalancedSlot(sectionInner, slotName);
          if (slotElem) {
            const formatted = renderInlineMarkdown(slotContent.trim());
            const slotTarget = sectionInner.slice(slotElem.contentStart, slotElem.contentEnd);
            if (slotTarget.trim() !== formatted) {
              sectionInner = sectionInner.slice(0, slotElem.contentStart) + formatted + sectionInner.slice(slotElem.contentEnd);
              sectionChanged = true;
            }
          }
        }
      }

      // B. Heading: slot 'heading'/'title'/'headline' or <h1-6>
      if (section.heading !== undefined) {
        const headingSlot = findBalancedSlot(sectionInner, "heading") || findBalancedSlot(sectionInner, "title") || findBalancedSlot(sectionInner, "headline");
        const formattedHeading = renderInlineMarkdown(section.heading.trim());
        if (headingSlot) {
          if (sectionInner.slice(headingSlot.contentStart, headingSlot.contentEnd).trim() !== formattedHeading) {
            sectionInner = sectionInner.slice(0, headingSlot.contentStart) + formattedHeading + sectionInner.slice(headingSlot.contentEnd);
            sectionChanged = true;
          }
        } else {
          const headingRegex = /(<h[1-6]\b[^>]*>)([\s\S]*?)(<\/h[1-6]>)/i;
          const hMatch = sectionInner.match(headingRegex);
          if (hMatch && hMatch[1] && hMatch[2] && hMatch[3]) {
            if (hMatch[2].trim() !== formattedHeading) {
              sectionInner = sectionInner.replace(headingRegex, `${hMatch[1]}${formattedHeading}${hMatch[3]}`);
              sectionChanged = true;
            }
          }
        }
      }

      // C. Note: update note slot/element if provided
      if (section.note !== undefined) {
        const noteSlot = findBalancedSlot(sectionInner, "note");
        const formattedNote = renderInlineMarkdown(section.note.trim());
        if (noteSlot) {
          if (sectionInner.slice(noteSlot.contentStart, noteSlot.contentEnd).trim() !== formattedNote) {
            sectionInner = sectionInner.slice(0, noteSlot.contentStart) + formattedNote + sectionInner.slice(noteSlot.contentEnd);
            sectionChanged = true;
          }
        }
      }

      // D. Caption: update caption slot/element if provided
      if (section.caption !== undefined) {
        const captionSlot = findBalancedSlot(sectionInner, "caption");
        const formattedCaption = renderInlineMarkdown(section.caption.trim());
        if (captionSlot) {
          if (sectionInner.slice(captionSlot.contentStart, captionSlot.contentEnd).trim() !== formattedCaption) {
            sectionInner = sectionInner.slice(0, captionSlot.contentStart) + formattedCaption + sectionInner.slice(captionSlot.contentEnd);
            sectionChanged = true;
          }
        }
      }

      // E. CTA: update cta slot/element if provided
      if (section.cta !== undefined) {
        const ctaSlot = findBalancedSlot(sectionInner, "cta") || findBalancedSlot(sectionInner, "action");
        const formattedCta = renderInlineMarkdown(section.cta.trim());
        if (ctaSlot) {
          if (sectionInner.slice(ctaSlot.contentStart, ctaSlot.contentEnd).trim() !== formattedCta) {
            sectionInner = sectionInner.slice(0, ctaSlot.contentStart) + formattedCta + sectionInner.slice(ctaSlot.contentEnd);
            sectionChanged = true;
          }
        }
      }

      // F. Body: update body slot or body <p> elements PROTECTING notes/captions/CTAs
      if (section.body !== undefined) {
        const bodySlot = findBalancedSlot(sectionInner, "body") || findBalancedSlot(sectionInner, "content") || findBalancedSlot(sectionInner, "prose");
        const paragraphs = section.body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        const formattedParagraphs = paragraphs.map(p => renderInlineMarkdown(p));

        if (bodySlot) {
          const replacement = formattedParagraphs.map(p => `<p>${p}</p>`).join("\n");
          if (sectionInner.slice(bodySlot.contentStart, bodySlot.contentEnd).trim() !== replacement.trim()) {
            sectionInner = sectionInner.slice(0, bodySlot.contentStart) + replacement + sectionInner.slice(bodySlot.contentEnd);
            sectionChanged = true;
          }
        } else {
          // Find <p> elements, but filter out protected elements (notes, captions, CTAs)
          const allPMatches = [...sectionInner.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)];
          const existingPMatches = allPMatches.filter(m => !isProtectedParagraph(m[0]));

          if (existingPMatches.length > 0 && formattedParagraphs.length > 0) {
            if (existingPMatches.length === formattedParagraphs.length) {
              let offset = 0;
              for (let i = 0; i < formattedParagraphs.length; i++) {
                const m = existingPMatches[i]!;
                const tagMatch = m[0].match(/^(<p\b[^>]*>)([\s\S]*?)(<\/p>)$/i);
                if (tagMatch && tagMatch[1] && tagMatch[2] && tagMatch[3] && tagMatch[2].trim() !== formattedParagraphs[i]) {
                  const replacement = `${tagMatch[1]}${formattedParagraphs[i]}${tagMatch[3]}`;
                  const startIdx = m.index! + offset;
                  sectionInner = sectionInner.slice(0, startIdx) + replacement + sectionInner.slice(startIdx + m[0].length);
                  offset += replacement.length - m[0].length;
                  sectionChanged = true;
                }
              }
            } else if (existingPMatches.length === 1 && formattedParagraphs.length > 1) {
              const m = existingPMatches[0]!;
              const tagMatch = m[0].match(/^(<p\b[^>]*>)([\s\S]*?)(<\/p>)$/i);
              const openP = tagMatch ? tagMatch[1] : "<p>";
              const closeP = tagMatch ? tagMatch[3] : "</p>";
              const replacement = formattedParagraphs.map(p => `${openP}${p}${closeP}`).join("\n");
              sectionInner = sectionInner.slice(0, m.index!) + replacement + sectionInner.slice(m.index! + m[0].length);
              sectionChanged = true;
            } else {
              const m = existingPMatches[0]!;
              const tagMatch = m[0].match(/^(<p\b[^>]*>)([\s\S]*?)(<\/p>)$/i);
              if (tagMatch && tagMatch[1] && tagMatch[2] && tagMatch[3]) {
                const formattedBody = formattedParagraphs.length === 1 ? formattedParagraphs[0]! : formattedParagraphs.join(" ");
                if (tagMatch[2].trim() !== formattedBody) {
                  const replacement = `${tagMatch[1]}${formattedBody}${tagMatch[3]}`;
                  sectionInner = sectionInner.slice(0, m.index!) + replacement + sectionInner.slice(m.index! + m[0].length);
                  sectionChanged = true;
                }
              }
            }
          }
        }
      }

      if (sectionChanged) {
        html = html.slice(0, element.contentStart) + sectionInner + html.slice(element.contentEnd);
        fileChanged = true;
        changes.push({
          page: pageRel,
          sectionId: section.id,
          heading: section.heading,
          body: section.body,
          note: section.note,
          caption: section.caption,
          cta: section.cta,
        });
      }
    }

    if (fileChanged) {
      stagedUpdates.push({ fullPath, pageRel, newHtml: html, originalHtml });
    }
  }

  // Crash-safe multi-file copy transaction using recoverableReplace
  const stagedFileMap = new Map<string, string>();
  for (const update of stagedUpdates) {
    const stagePath = `${update.fullPath}.stage-${Date.now()}-${randomUUID().slice(0, 8)}`;
    writeFileSync(stagePath, update.newHtml, "utf8");
    stagedFileMap.set(update.fullPath, stagePath);
  }

  const completedReplaces: { fullPath: string; originalHtml: string }[] = [];
  try {
    for (const update of stagedUpdates) {
      const stagePath = stagedFileMap.get(update.fullPath)!;
      recoverableReplace(stagePath, update.fullPath);
      completedReplaces.push({ fullPath: update.fullPath, originalHtml: update.originalHtml });
      modifiedPages.push(update.pageRel);
    }
  } catch (err) {
    for (const completed of completedReplaces) {
      try {
        const rollbackStage = `${completed.fullPath}.rollback-${Date.now()}-${randomUUID().slice(0, 8)}`;
        writeFileSync(rollbackStage, completed.originalHtml, "utf8");
        recoverableReplace(rollbackStage, completed.fullPath);
      } catch {}
    }
    for (const stagePath of stagedFileMap.values()) {
      try { if (existsSync(stagePath)) unlinkSync(stagePath); } catch {}
    }
    throw new Error(`Crash-safe copy transaction failed, all files recovered: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { applied: modifiedPages.length > 0, modifiedPages, changes };
}

export function captureRefineBaseline(root: string, state: AgentState, preserve: FeedbackItem[]): RefineBaseline {
  const baseline: RefineBaseline = {
    capturedAt: new Date().toISOString(),
    layoutHash: hashIfPresent(root, ["pages", "components", "theme", "site.json"]),
    structuralLayoutHash: structuralLayoutHash(root),
    themeHash: hashIfPresent(root, ["theme"]),
    businessHash: hashIfPresent(root, ["onboarding/business.json"]),
    mediaHash: hashIfPresent(root, ["onboarding/media-inventory.json"]),
    copyHash: hashIfPresent(root, ["onboarding/copy-plan.json"]),
    directionHash: hashIfPresent(root, ["onboarding/direction.json"]),
    distHash: hashIfPresent(root, ["dist"]),
    screenshotHash: hashIfPresent(root, ["agent/screenshots"]),
    nodes: structuredClone(state.nodes),
    mediaIds: mediaIds(root),
    factIds: factIds(root),
    preserve,
    navLinks: extractNavLinks(root),
  };
  save(join(root, "agent/refine-baseline/baseline.json"), baseline);
  return baseline;
}

export function loadRefineBaseline(root: string, requestId?: string): RefineBaseline | undefined {
  if (requestId) {
    const reqPath = join(root, `agent/requests/${requestId}/baseline.json`);
    return existsSync(reqPath) ? json<RefineBaseline>(reqPath) : undefined;
  }
  const path = join(root, "agent/refine-baseline/baseline.json");
  return existsSync(path) ? json<RefineBaseline>(path) : undefined;
}

export function beginChange(opts: {
  root: string;
  graph: SkillGraph;
  state: AgentState;
  instruction: string;
  scopeFlag?: string;
  requestId?: string;
  classified?: {
    scope: ChangeScope;
    scopes?: ChangeScope[];
    affectedNodes?: string[];
    isMixed?: boolean;
    rationale: string;
    affectedPages: string[];
    proposedChanges: string[];
    shadowProposal?: {
      scope: ChangeScope;
      scopes?: ChangeScope[];
      affectedNodes?: string[];
      isMixed?: boolean;
      isAmbiguous?: boolean;
      rationale?: string;
      confidence?: number;
    };
  };
}): ChangeRequest {
  const instruction = opts.instruction.trim();
  if (!instruction) throw new Error("change requires an instruction");
  if (opts.scopeFlag && opts.scopeFlag !== "auto" && !CHANGE_SCOPES.includes(opts.scopeFlag as ChangeScope)) {
    throw new Error("change-scope must be business, copy, pages, direction, or auto");
  }
  const classified: {
    scope: ChangeScope;
    scopes?: ChangeScope[];
    affectedNodes?: string[];
    isMixed?: boolean;
    rationale: string;
    affectedPages: string[];
    proposedChanges: string[];
    shadowProposal?: {
      scope: ChangeScope;
      scopes?: ChangeScope[];
      affectedNodes?: string[];
      isMixed?: boolean;
      isAmbiguous?: boolean;
      rationale?: string;
      confidence?: number;
    };
  } = opts.classified || classifyChange(instruction);
  const override = opts.scopeFlag && opts.scopeFlag !== "auto" ? opts.scopeFlag as ChangeScope : undefined;
  const primaryScope = override || classified.scope;
  const activeScopes: ChangeScope[] = override
    ? [override]
    : (classified.scopes && classified.scopes.length > 0 ? classified.scopes : [primaryScope]);

  for (const s of activeScopes) {
    const start = START_NODE[s];
    if (!opts.graph.nodes.some(n => n.id === start)) throw new Error(`change-scope ${s} is not in this graph`);
    if (start === "harvest") throw new Error("Local refinements cannot restart harvest");
  }

  // Determine affected nodes across all active scopes in graph order
  const activeNodes: string[] = override
    ? requestNodesFor(override)
    : (classified.affectedNodes && classified.affectedNodes.length > 0
        ? classified.affectedNodes
        : [...new Set(activeScopes.flatMap(s => requestNodesFor(s)))]);

  const feedback = parseFeedback(instruction);
  const requestId = opts.requestId || `req-${Date.now()}-${randomUUID().slice(0, 8)}`;
  assertRequestId(requestId);
  const requestDir = join(opts.root, "agent/requests", requestId);
  mkdirSync(requestDir, { recursive: true });
  const evidencePath = `agent/requests/${requestId}/request.json`;
  const request: ChangeRequest = {
    instruction,
    originalRequest: instruction,
    scope: primaryScope,
    scopes: activeScopes,
    affectedNodes: activeNodes,
    isMixed: Boolean(classified.isMixed ?? (activeScopes.length > 1)),
    classifiedScope: classified.scope,
    overrideScope: override,
    evidencePath,
    rationale: override ? `Operator overrode classifier (${classified.scope}) with ${override}.` : classified.rationale,
    affectedPages: classified.affectedPages,
    proposedChanges: classified.proposedChanges,
    likes: feedback.likes,
    dislikes: feedback.dislikes,
    preserve: feedback.preserve,
    shadowProposal: classified.shadowProposal,
  };
  seedSiteMemory(opts.root);
  const baseline = captureRefineBaseline(opts.root, opts.state, request.preserve);
  save(join(opts.root, `agent/requests/${requestId}/baseline.json`), baseline);
  save(join(opts.root, evidencePath), request);
  save(join(opts.root, "agent/change-request.json"), request);
  save(join(opts.root, "agent/refine-pending.json"), {
    requestId,
    evidencePath,
    baselinePath: `agent/requests/${requestId}/baseline.json`,
    startedAt: new Date().toISOString(),
  });
  for (const id of activeNodes) save(join(opts.root, `agent/requests/${id}.json`), request);
  for (const s of activeScopes) {
    const start = START_NODE[s];
    invalidate(opts.graph, opts.state, start);
  }
  for (const st of Object.values(opts.state.nodes)) if (st.status === "pending") st.attempts = 0;
  return request;
}

export function restoreUnchangedLayout(root: string, state: AgentState): boolean {
  const requestPath = join(root, "agent/change-request.json");
  if (!existsSync(requestPath)) return false;
  const request = json<ChangeRequest>(requestPath);
  if (request.scope !== "copy") return false;

  // Require copy-review success first
  const copyReviewPath = join(root, "agent/reviews/copy-review.json");
  if (existsSync(copyReviewPath)) {
    const review = json<{ verdict?: string }>(copyReviewPath);
    if (review.verdict !== "pass") return false;
  } else if (state.nodes["copy-review"]?.status !== "done") {
    return false;
  }

  const baseline = loadRefineBaseline(root);
  if (!baseline) return false;

  // Execute targeted copy application
  const copyResult = applyCopyPlanToPages(root);

  // Check structural layout hash
  const currentStructural = structuralLayoutHash(root);
  const baselineStructural = baseline.structuralLayoutHash || baseline.layoutHash;
  if (baseline.structuralLayoutHash && currentStructural !== baselineStructural) {
    return false;
  }

  let restored = false;
  for (const id of ["representative", "representative-browser", "representative-review", "representative-quality"]) {
    const previous = baseline.nodes[id];
    if (!previous || previous.status !== "done") continue;
    if (state.nodes[id]?.status === "pending") {
      state.nodes[id] = { ...previous };
      restored = true;
    }
  }

  if (copyResult.applied) {
    if (state.nodes.pages?.status === "pending") {
      state.nodes.pages = { status: "done", attempts: 1 };
      restored = true;
    }
  }

  return restored;
}

export function regressionFailures(root: string, requestId?: string): string[] {
  const requestPath = requestId ? join(root, `agent/requests/${requestId}/request.json`) : join(root, "agent/change-request.json");
  if (requestId && !existsSync(requestPath)) {
    return [`Specified request ID '${requestId}' does not exist at agent/requests/${requestId}/request.json`];
  }
  const baseline = loadRefineBaseline(root, requestId);
  if (requestId && !baseline) {
    return [`Specified request ID '${requestId}' has no baseline at agent/requests/${requestId}/baseline.json`];
  }
  if (!existsSync(requestPath) || !baseline) return [];
  const request = json<ChangeRequest>(requestPath);
  const failures: string[] = [];

  // Business check
  const businessScoped=(request.scopes||[request.scope]).includes("business");
  if (!businessScoped && hashIfPresent(root, ["onboarding/business.json"]) !== baseline.businessHash) {
    failures.push("Refinement changed business facts outside a business-scoped request.");
  }
  if (!businessScoped) {
    const currentFacts = factIds(root);
    if (baseline.factIds.some(id => !currentFacts.includes(id))) failures.push("Refinement dropped previously approved fact IDs.");
  }

  // Media inventory check + disk existence
  const currentMedia = mediaIds(root);
  if (baseline.mediaIds.some(id => !currentMedia.includes(id))) failures.push("Refinement dropped original media inventory IDs.");
  const mediaPath = join(root, "onboarding/media-inventory.json");
  if (existsSync(mediaPath)) {
    const mediaInv = json<{ assets?: Array<{ id: string; path: string }> }>(mediaPath);
    for (const asset of mediaInv.assets || []) {
      if (asset.path && !existsSync(join(root, asset.path))) {
        failures.push(`Dropped media file despite retained ID: ${asset.path}`);
      }
    }
  }

  // Navigation behavior & visual treatment preservation
  const haystack = collectText(root, ["pages", "components", "onboarding/copy-plan.json"]);
  const currentNav = extractNavLinks(root);
  const supersedeNav = /\b(supersede navigation|replace navigation|new navigation|update navigation)\b/i.test(request.instruction);

  for (const constraint of baseline.structuredPreserve || []) {
    if (constraint.error) { failures.push(constraint.error); continue; }
    const observed = constraint.target ? sourceTargetText(root, constraint.target) : undefined;
    if (observed !== constraint.baselineText) failures.push(`Preserved target changed: ${constraint.target} (${constraint.text})`);
  }

  for (const item of baseline.preserve) {
    if (item.target && baseline.structuredPreserve) continue;
    if (item.kind === "nav_behavior" || /\b(navigation|nav|header links)\b/i.test(item.text)) {
      if (supersedeNav) continue;
      for (const baseLink of baseline.navLinks || []) {
        if (!currentNav.some(l => l.href === baseLink.href)) {
          failures.push(`Preserved navigation behavior violated: missing route ${baseLink.href} (${baseLink.label})`);
        }
      }
    } else if (item.kind === "nav_styling") {
      if (supersedeNav) continue;
      const currentTheme = hashIfPresent(root, ["theme"]);
      if (baseline.themeHash && currentTheme !== baseline.themeHash) {
        failures.push("Preserved navigation visual treatment violated: theme styling modified");
      }
    } else if (item.hook) {
      if (!haystack.includes(item.hook)) failures.push(`Preserved preference missing: ${item.hook}`);
    } else if (item.kind === "content" && item.text) {
      const cleanTarget = item.text.replace(/^(?:keep|preserve|don't change)\s+/i, "").trim();
      if (cleanTarget.length > 3 && !haystack.toLowerCase().includes(cleanTarget.toLowerCase())) {
        failures.push(`Unresolved preserve constraint: '${item.text}'; must be resolved or explicitly superseded.`);
      }
    }
  }

  return failures;
}

function collectText(root: string, paths: string[]): string {
  let out = "";
  for (const path of paths) {
    const target = join(root, path);
    if (!existsSync(target)) continue;
    for (const file of files(target)) out += readFileSync(file, "utf8");
  }
  return out;
}

export function writeRefineReport(root: string, opts?: { skippedLayoutRewrite?: boolean; failures?: string[]; requestId?: string }): RefineReport {
  const requestPath = opts?.requestId ? join(root, `agent/requests/${opts.requestId}/request.json`) : join(root, "agent/change-request.json");
  const request = existsSync(requestPath) ? json<ChangeRequest>(requestPath) : ({
    instruction: "", originalRequest: "", scope: "copy" as ChangeScope, classifiedScope: "copy" as ChangeScope,
    rationale: "", proposedChanges: [], preserve: [], evidencePath: "", affectedPages: [], likes: [], dislikes: [],
  } as ChangeRequest);
  const baseline = loadRefineBaseline(root, opts?.requestId);
  const memory = existsSync(join(root, "agent/site-memory.json")) ? json<SiteMemory>(join(root, "agent/site-memory.json")) : undefined;
  const after = {
    layoutHash: hashIfPresent(root, ["pages", "components", "theme", "site.json"]),
    distHash: hashIfPresent(root, ["dist"]),
    screenshotHash: hashIfPresent(root, ["agent/screenshots"]),
  };
  const report: RefineReport = {
    schemaVersion: 1,
    instruction: request.originalRequest,
    scope: request.scope,
    classifiedScope: request.classifiedScope,
    rationale: request.rationale,
    proposedChanges: request.proposedChanges,
    changed: changedKeys(baseline, after, request.scope),
    preserved: [
      ...(request.scope === "business" ? [] : ["business facts"]),
      "original media inventory IDs",
      ...request.preserve.map(p => p.text),
    ],
    before: {
      layoutHash: baseline?.layoutHash || "",
      distHash: baseline?.distHash || "",
      screenshotHash: baseline?.screenshotHash || "",
    },
    after,
    memoryKeys: (memory?.decisions || []).filter(d => d.status === "current").map(d => d.id),
    failures: opts?.failures || [],
    skippedLayoutRewrite: opts?.skippedLayoutRewrite || false,
  };
  save(join(root, "agent/refine-report.json"), report);
  const lines = [
    `Refinement: ${report.instruction}`,
    `Scope: ${report.scope} (${report.rationale})`,
    `Proposed: ${report.proposedChanges.join("; ") || "none"}`,
    `Changed: ${report.changed.join(", ") || "none"}`,
    `Preserved: ${report.preserved.join(", ")}`,
    report.skippedLayoutRewrite ? "Layout rewrite skipped; content checks still required." : "",
    report.failures.length ? `Failures: ${report.failures.join("; ")}` : "",
  ].filter(Boolean);
  writeFileSync(join(root, "agent/refine-report.txt"), `${lines.join("\n")}\n`);
  return report;
}

function changedKeys(baseline: RefineBaseline | undefined, after: RefineReport["after"], scope: ChangeScope): string[] {
  if (!baseline) return [scope];
  const changed: string[] = [];
  if (baseline.layoutHash !== after.layoutHash) changed.push("layout");
  if (baseline.distHash !== after.distHash) changed.push("preview");
  if (baseline.screenshotHash !== after.screenshotHash) changed.push("screenshots");
  changed.push(scope);
  return [...new Set(changed)];
}

export function summarizeRefine(root: string): string | undefined {
  const path = join(root, "agent/refine-report.txt");
  return existsSync(path) ? readFileSync(path, "utf8").trim() : undefined;
}

export function consumeRefinePending(root: string): boolean {
  const path = join(root, "agent/refine-pending.json");
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

export function loadChangeRequest(root: string, requestId?: string): ChangeRequest | undefined {
  if (requestId) {
    const reqPath = join(root, `agent/requests/${requestId}/request.json`);
    if (existsSync(reqPath)) return json<ChangeRequest>(reqPath);
  }
  const path = join(root, "agent/change-request.json");
  return existsSync(path) ? json<ChangeRequest>(path) : undefined;
}

export function mergeImplementationReason(root: string, nodeId: string): void {
  const path = join(root, `agent/requests/${nodeId}.json`);
  const latest = join(root, "agent/change-request.json");
  if (!existsSync(path) || !existsSync(latest)) return;
  const staged = json<ChangeRequest>(path);
  const current = json<ChangeRequest>(latest);
  if (staged.implementationReason && staged.implementationReason !== current.implementationReason) {
    current.implementationReason = staged.implementationReason;
    if (staged.proposedChanges?.length) current.proposedChanges = staged.proposedChanges;
    if (staged.likes?.length) current.likes = staged.likes;
    if (staged.dislikes?.length) current.dislikes = staged.dislikes;
    if (staged.preserve?.length) current.preserve = staged.preserve;
    save(latest, current);
    if (current.evidencePath) save(join(root, current.evidencePath), current);
  }
}

export function detectMemoryDrift(root: string): {
  drifted: boolean;
  driftedFiles: string[];
  details: string[];
} {
  const memoryPath = join(root, "agent/site-memory.json");
  if (!existsSync(memoryPath)) {
    return { drifted: false, driftedFiles: [], details: [] };
  }
  const memory = json<SiteMemory>(memoryPath);
  const driftedFiles: string[] = [];
  const details: string[] = [];

  const currentBusinessHash = hashIfPresent(root, ["onboarding/business.json"]);
  if (memory.businessHash && currentBusinessHash && currentBusinessHash !== memory.businessHash) {
    driftedFiles.push("onboarding/business.json");
    details.push(`Business facts hash changed (${memory.businessHash.slice(0, 8)} -> ${currentBusinessHash.slice(0, 8)})`);
  }

  const currentMediaHash = hashIfPresent(root, ["onboarding/media-inventory.json"]);
  if (memory.mediaHash && currentMediaHash && currentMediaHash !== memory.mediaHash) {
    driftedFiles.push("onboarding/media-inventory.json");
    details.push(`Media inventory hash changed (${memory.mediaHash.slice(0, 8)} -> ${currentMediaHash.slice(0, 8)})`);
  }

  const currentDirectionHash = hashIfPresent(root, ["onboarding/direction.json"]);
  if (memory.directionHash && currentDirectionHash && currentDirectionHash !== memory.directionHash) {
    driftedFiles.push("onboarding/direction.json");
    details.push(`Design direction hash changed (${memory.directionHash.slice(0, 8)} -> ${currentDirectionHash.slice(0, 8)})`);
  }

  const currentCopyHash = hashIfPresent(root, ["onboarding/copy-plan.json"]);
  if (memory.copyHash && currentCopyHash && currentCopyHash !== memory.copyHash) {
    driftedFiles.push("onboarding/copy-plan.json");
    details.push(`Copy plan hash changed (${memory.copyHash.slice(0, 8)} -> ${currentCopyHash.slice(0, 8)})`);
  }

  const currentFacts = factIds(root);
  const missingFacts = (memory.factIds || []).filter(id => !currentFacts.includes(id));
  if (missingFacts.length > 0) {
    details.push(`Approved facts missing: ${missingFacts.join(", ")}`);
  }

  const currentMedia = mediaIds(root);
  const missingMedia = (memory.mediaIds || []).filter(id => !currentMedia.includes(id));
  if (missingMedia.length > 0) {
    details.push(`Approved media IDs missing: ${missingMedia.join(", ")}`);
  }

  return {
    drifted: driftedFiles.length > 0 || details.length > 0,
    driftedFiles,
    details,
  };
}

export type PrepareRefineResult = {
  requestId: string;
  scope: ChangeScope;
  scopes: ChangeScope[];
  classifiedScope: ChangeScope;
  rationale: string;
  affectedPages: string[];
  proposedChanges: string[];
  impactedNodes: string[];
  baselinePath: string;
  drift: { drifted: boolean; driftedFiles: string[]; details: string[] };
  checklist: string[];
};

function sourceTargetText(root: string, target: string): string | undefined {
  const match = /^(\/[^#]*)#([A-Za-z0-9._:-]+)$/.exec(target);
  if (!match) return undefined;
  const route = match[1]!, id = match[2]!;
  const routePath = route === "/" ? "index" : route.slice(1).replace(/\/$/, "");
  const candidates = [join(root, "pages", `${routePath}.html`), join(root, "pages", routePath, "index.html")];
  const componentRoot = join(root, "components");
  if (existsSync(componentRoot)) candidates.push(...files(componentRoot).filter(file => file.endsWith(".html")));
  const matches: string[] = [];
  type Node = { nodeName?: string; value?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: Node[] };
  const content = (node: Node): string => node.nodeName === "#text" ? node.value || "" : (node.childNodes || []).map(content).join("");
  for (const file of candidates.filter(file => existsSync(file))) {
    const tree = parseFragment(readFileSync(file, "utf8")) as Node;
    const walk = (node: Node) => {
      if (elementMatchesIdentity(node.attrs, id)) matches.push(content(node).trim());
      for (const child of node.childNodes || []) walk(child);
    };
    walk(tree);
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function structuredFeedback(preferences: ChangeRequestRecord["explicitPreferences"]): { likes: FeedbackItem[]; dislikes: FeedbackItem[]; preserve: FeedbackItem[] } {
  const result = { likes: [] as FeedbackItem[], dislikes: [] as FeedbackItem[], preserve: [] as FeedbackItem[] };
  for (const preference of preferences) {
    const [path, hook] = preference.target?.split("#") || [];
    const item: FeedbackItem = { text: preference.text, grain: hook ? "element" : path ? "page" : "website",
      ...(path ? { path } : {}), ...(hook ? { hook } : {}), ...(preference.target ? { target: preference.target } : {}) };
    if (preference.intent === "positive") result.likes.push(item);
    else if (preference.intent === "negative") result.dislikes.push(item);
    else result.preserve.push(item);
  }
  return result;
}

/** Expand operator classification while retaining the original instruction,
 * immutable baseline and prior request versions. */
export function amendRefineScopes(root: string, requestId: string, scopes: ChangeScope[], reason: string): ChangeRequest {
  root=resolve(root);assertRequestId(requestId);
  if(!reason.trim()||reason.length>8000||!scopes.length||scopes.some(scope=>!CHANGE_SCOPES.includes(scope)))throw new Error('Scope amendment needs supported scopes and an explicit reason');
  const unlock=acquirePathLock(join(root,'agent/refine-amend-transaction'));
  try {
    const pending=json<{requestId:string}>(join(root,'agent/refine-pending.json'));
    if(pending.requestId!==requestId)throw new Error('Only the current pending refinement may be amended');
    const requestPath=`agent/requests/${requestId}/request.json`,baselinePath=join(root,`agent/requests/${requestId}/baseline.json`);
    if(!existsSync(baselinePath))throw new Error('Refinement baseline is missing');
    const request=json<ChangeRequest>(join(root,requestPath)),before=request.scopes||[request.scope],after=[...new Set(scopes)];
    if(before.some(scope=>!after.includes(scope)))throw new Error('Scope amendments may only expand the existing scope');
    if(after.length===before.length)return request;
    const leases=join(root,'agent/leases');
    if(existsSync(leases)&&files(leases).some(path=>/stage-[^\\/]+\.json$/.test(path)))throw new Error('Complete or cancel the active stage before amending refinement scope');
    const at=new Date().toISOString(),priorRequest=`agent/requests/${requestId}/scope-amendments/${Date.now()}-${randomUUID()}.json`;
    save(join(root,priorRequest),request);
    const amended={...request,scopes:after,isMixed:after.length>1,affectedNodes:[...new Set(after.flatMap(requestNodesFor))],scopeAmendments:[...(request.scopeAmendments||[]),{at,reason:reason.trim(),before,after,priorRequest}]};
    save(join(root,requestPath),amended);save(join(root,'agent/change-request.json'),amended);
    return amended;
  } finally {unlock();}
}

export function prepareRefine(opts: {
  root: string;
  instruction: string;
  scope?: string;
  requestId?: string;
  plan?: ChangePlanRecord;
  explicitPreferences?: ChangeRequestRecord["explicitPreferences"];
  origin?: ChangeOrigin;
}): PrepareRefineResult {
  const root = resolve(opts.root);
  const instruction = opts.instruction.trim();
  if (!instruction) throw new Error("prepareRefine requires an instruction");

  const requestId = opts.requestId || `req-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const classified = classifyChange(instruction);
  const override = opts.scope && opts.scope !== "auto" && CHANGE_SCOPES.includes(opts.scope as ChangeScope)
    ? (opts.scope as ChangeScope)
    : undefined;
  const scope = override || opts.plan?.facets[0] || classified.scope;
  const scopes = override ? [override] : opts.plan?.facets || classified.scopes;
  const feedback = opts.explicitPreferences ? structuredFeedback(opts.explicitPreferences) : parseFeedback(instruction);
  const existingRequestPath = join(root, `agent/requests/${requestId}/request.json`);
  if (existsSync(existingRequestPath)) {
    const existing = json<ChangeRequest>(existingRequestPath);
    if (existing.instruction !== instruction || JSON.stringify(existing.scopes || [existing.scope]) !== JSON.stringify(scopes)
      || JSON.stringify(existing.plan || null) !== JSON.stringify(opts.plan || null)
      || JSON.stringify({ likes: existing.likes, dislikes: existing.dislikes, preserve: existing.preserve, origin: existing.origin })
        !== JSON.stringify({ ...feedback, origin: opts.origin })) {
      throw new Error(`Request ID '${requestId}' is already used for different content`);
    }
    const existingResultPath = join(root, `agent/requests/${requestId}/prepare-result.json`);
    if (!existsSync(existingResultPath)) throw new Error(`Request ID '${requestId}' has an incomplete preparation; inspect before retrying`);
    return json<PrepareRefineResult>(existingResultPath);
  }
  const drift = detectMemoryDrift(root);

  const requestDir = join(root, "agent/requests", requestId);
  mkdirSync(requestDir, { recursive: true });

  const evidencePath = `agent/requests/${requestId}/request.json`;
  const request: ChangeRequest = {
    instruction,
    originalRequest: instruction,
    scope,
    scopes,
    affectedNodes: override ? requestNodesFor(override) : classified.affectedNodes,
    isMixed: scopes.length > 1,
    classifiedScope: classified.scope,
    overrideScope: override,
    evidencePath,
    rationale: override ? `Operator overrode classifier (${classified.scope}) with ${override}.` : opts.plan ? "Validated structured change plan." : classified.rationale,
    affectedPages: opts.plan ? opts.plan.targets.filter(target => target.startsWith("/")) : classified.affectedPages,
    proposedChanges: opts.plan ? opts.plan.acceptanceCriteria.map(criterion => `${criterion.kind}: ${criterion.target}`) : classified.proposedChanges,
    likes: feedback.likes,
    dislikes: feedback.dislikes,
    preserve: feedback.preserve,
    plan: opts.plan,
    origin: opts.origin,
  };

  seedSiteMemory(root);
  save(join(root, evidencePath), request);
  save(join(root, "agent/change-request.json"), request);

  const graphPath = join(root, "agent/graph.yaml");
  let state: AgentState | undefined;
  if (existsSync(graphPath)) {
    const graph = parseGraphYaml(readFileSync(graphPath, "utf8"));
    state = loadState(root, graph);
  }
  const defaultState: AgentState = {
    version: 1,
    status: "done",
    current: null,
    preview_ready: true,
    launched: false,
    iteration: 0,
    nodes: {},
  };
  const baseline = captureRefineBaseline(root, state || defaultState, request.preserve);
  if (opts.plan) {
    baseline.structuredPreserve = request.preserve.map(item => {
      const baselineText = item.target ? sourceTargetText(root, item.target) : undefined;
      return { text: item.text, ...(item.target ? { target: item.target } : {}),
        ...(baselineText === undefined ? { error: `Preserve constraint '${item.text}' needs a unique route#field target in authored source` } : { baselineText }) };
    });
    for (const text of opts.plan.preserve) {
      if (!request.preserve.some(item => item.text.trim().toLowerCase() === text.trim().toLowerCase())) {
        baseline.structuredPreserve.push({ text, error: `Plan preserve constraint '${text}' has no matching explicit preserve preference` });
      }
    }
  }
  const baselinePath = `agent/requests/${requestId}/baseline.json`;
  save(join(root, baselinePath), baseline);

  save(join(root, "agent/refine-pending.json"), {
    requestId,
    evidencePath,
    baselinePath,
    startedAt: new Date().toISOString(),
  });

  const impactedNodes = [...new Set(scopes.flatMap(requestNodesFor))];
  const checklist = [...new Set([...(opts.plan?.requiredChecks || []),
    "Factual accuracy: verify business offerings match approved business facts",
    "Link validity: all internal links and routes resolve to valid destinations",
    "Slot and copy placement: ensure target slots match expected structure without orphan slots",
    "Responsive layouts: verify 375px mobile and 1080px desktop rendering",
    "Theme tokens: verify theme colors and typography tokens are intact",
  ])];

  const result = {
    requestId,
    scope,
    scopes,
    classifiedScope: classified.scope,
    rationale: request.rationale,
    affectedPages: request.affectedPages,
    proposedChanges: request.proposedChanges,
    impactedNodes,
    baselinePath,
    drift,
    checklist,
  };
  save(join(requestDir, "prepare-result.json"), result);
  return result;
}

export type VerifyRefineResult = {
  ok: boolean;
  failures: string[];
  summary: string;
  report?: RefineReport;
  technical?: "pass" | "fail";
  fulfillment?: "pass" | "fail" | "unevaluated";
  design?: "pass" | "fail" | "unevaluated";
  verifiedSourceRevision?: string;
  verifiedBuildDigest?: string;
  completedChecks?: Record<string, "pass" | "fail" | "unevaluated">;
};

function verifyFulfillment(root: string, request: ChangeRequest, baseline: RefineBaseline | undefined): string[] {
  const errors: string[] = [];
  const distDir = join(root, "dist");
  if (!existsSync(distDir)) return errors;

  const htmlFiles = files(distDir).filter(f => f.endsWith(".html"));

  // Check for unresolved placeholder tokens
  for (const file of htmlFiles) {
    const content = readFileSync(file, "utf8");
    if (/\[TODO\b|\[INSERT\b|\[TBD\b|\bundefined\b|\bNaN\b/i.test(content)) {
      errors.push(`Unresolved placeholder content found in ${file.slice(distDir.length).replace(/\\/g, "/")}`);
    }
    if (/<h[1-6]>\s*<\/h[1-6]>/i.test(content)) {
      errors.push(`Empty heading tag in ${file.slice(distDir.length).replace(/\\/g, "/")}`);
    }
  }

  if (request.plan) {
    const revision = sourceRevision(root).digest;
    const requestId = request.evidencePath.match(/requests\/([^/]+)\//)?.[1];
    const findingsPath = requestId ? join(root, `agent/requests/${requestId}/outcome-findings.json`) : "";
    const findings = findingsPath && existsSync(findingsPath)
      ? json<{ subjectRevision: string; findings: Array<{ criterionId: string; outcome: "pass" | "fail"; reviewer: string; evidence: string[] }> }>(findingsPath)
      : undefined;
    for (const criterion of request.plan.acceptanceCriteria) {
      if (criterion.kind === "exact_text" || criterion.kind === "absence") {
        const [route, id] = criterion.target.split("#");
        if (!id || !route?.startsWith("/")) { errors.push(`Criterion ${criterion.id} has an invalid route#id target`); continue; }
        const rel = route === "/" ? "index.html" : `${route.slice(1).replace(/\/$/, "")}/index.html`;
        const output = join(distDir, rel);
        if (!existsSync(output)) { errors.push(`Criterion ${criterion.id} route ${route} was not built`); continue; }
        type Node = { nodeName?: string; value?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: Node[] };
        const tree = parseFragment(readFileSync(output, "utf8")) as Node;
        const matches: Node[] = [];
        const walk = (node: Node) => {
          if (elementMatchesIdentity(node.attrs, id)) matches.push(node);
          for (const child of node.childNodes || []) walk(child);
        };
        walk(tree);
        const content = (node: Node): string => node.nodeName === "#text" ? node.value || "" : (node.childNodes || []).map(content).join("");
        const observed = matches.length === 1 ? content(matches[0]!).trim() : undefined;
        if (criterion.kind === "exact_text" && observed !== criterion.expected) errors.push(`Criterion ${criterion.id} expected exact text '${criterion.expected}' at ${criterion.target}; found '${observed ?? "missing target"}'`);
        if (criterion.kind === "absence" && (!criterion.expected ? matches.length > 0 : observed?.includes(criterion.expected))) errors.push(`Criterion ${criterion.id} expected absence at ${criterion.target}`);
      } else {
        const finding = findings?.subjectRevision === revision
          ? findings.findings.find(item => item.criterionId === criterion.id) : undefined;
        if (!finding || finding.outcome !== "pass" || !["active_agent", "independent_model", "human"].includes(finding.reviewer)
          || !Array.isArray(finding.evidence) || finding.evidence.length === 0) {
          errors.push(`Criterion ${criterion.id} requires a passing ${criterion.kind} finding bound to source revision ${revision}`);
        }
      }
    }
    return errors;
  }

  // Legacy copied-kit compatibility until requests are migrated to structured plans.
  const stopWords = new Set([
    "the", "and", "our", "with", "from", "about", "this", "that", "keep", "keeping",
    "previous", "without", "changing", "more", "make", "update", "updating", "rewrite",
    "rewriting", "change", "changing", "tweak", "tweaking", "edit", "editing", "hero",
    "homepage", "page", "pages", "site", "section", "table", "button", "copy", "please",
    "only", "also", "into", "over", "just", "than", "then", "have", "been", "title",
    "headline", "text", "body", "navigation", "nav", "preserve", "preserving", "retain",
    "retaining", "maintain", "maintaining", "ensure", "ensuring", "protect", "protecting",
    "avoid", "avoiding", "focus", "focusing",
  ]);

  const rawWords = request.instruction.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const intentKeywords = rawWords.filter(w => !stopWords.has(w));

  if (intentKeywords.length > 0) {
    const isRemoval = /\b(remove|delete|drop|hide|eliminate)\b/i.test(request.instruction);
    // Content-addressed asset names and runtime code are not authored copy.
    const visibleText = (node: any): string => ["script", "style", "svg", "noscript"].includes(node.tagName) ? "" : node.nodeName === "#text" ? node.value : (node.childNodes || []).map(visibleText).join(" ");
    const currentAllText = htmlFiles.map(f => visibleText(parseFragment(readFileSync(f, "utf8"))).toLowerCase()).join(" ");
    const copyPlanPath = join(root, "onboarding/copy-plan.json");
    const copyText = existsSync(copyPlanPath) ? readFileSync(copyPlanPath, "utf8").toLowerCase() : "";
    const fullText = currentAllText + " " + copyText;

    if (!isRemoval) {
      const matched = intentKeywords.some(kw => new RegExp("\\b" + kw + "\\b").test(fullText));
      if (!matched) {
        errors.push(`Refinement content does not fulfill instruction: expected content related to [${intentKeywords.join(", ")}] not found in updated pages or copy plan.`);
      }
    }
  }

  return errors;
}

export async function verifyRefine(opts: {
  root: string;
  requestId?: string;
  browser?: boolean;
  accept?: boolean;
}): Promise<VerifyRefineResult> {
  const root = resolve(opts.root);
  if (opts.requestId) assertRequestId(opts.requestId);
  const failures: string[] = [];
  const candidateRevision = sourceRevision(root).digest;
  const motionStoryPath=join(root,'onboarding/storyboard.json');
  if(existsSync(motionStoryPath)){const story=json<import('./artifacts.ts').Storyboard>(motionStoryPath);failures.push(...validateMotionPlan(story.motionPlan,story.pages.map(p=>p.path),{...motionCompositionPolicy(root,story.pages.map(p=>p.path)),sections:Object.fromEntries(story.pages.map(p=>[p.path,(p.sections||[]).map(s=>s.id)]))}));}
  let verifiedBuildDigest: string | undefined;
  const completedChecks: Record<string, "pass" | "fail" | "unevaluated"> = {
    build: "unevaluated", "render-375": "unevaluated", "render-1080": "unevaluated",
  };

  let request: ChangeRequest | undefined;
  if (opts.requestId) {
    const specificPath = join(root, `agent/requests/${opts.requestId}/request.json`);
    if (!existsSync(specificPath)) {
      return {
        ok: false,
        failures: [`Specified request ID '${opts.requestId}' does not exist at agent/requests/${opts.requestId}/request.json`],
        summary: `Verification failed: request '${opts.requestId}' not found.`,
      };
    }
    request = json<ChangeRequest>(specificPath);
  } else {
    const reqPath = join(root, "agent/change-request.json");
    if (existsSync(reqPath)) request = json<ChangeRequest>(reqPath);
  }

  if (!request) {
    return {
      ok: false,
      failures: ["No active change request found at agent/change-request.json or specified request-id"],
      summary: "Verification failed: no active refinement in progress.",
    };
  }

  // 1. Verify build
  try {
    await buildVerified(root);
    if (sourceRevision(root).digest !== candidateRevision) failures.push("Source changed during build verification.");
    verifiedBuildDigest = fingerprint(root, ["dist"]);
    completedChecks.build = sourceRevision(root).digest === candidateRevision ? "pass" : "fail";
  } catch (err) {
    failures.push(`Build verification failed: ${err instanceof Error ? err.message : String(err)}`);
    completedChecks.build = "fail";
  }

  // 2. Link verification in dist
  const distDir = join(root, "dist");
  if (existsSync(distDir)) {
    const distFiles = files(distDir);
    const validRoutes = new Set<string>();
    for (const file of distFiles) {
      if (file.endsWith(".html")) {
        const rel = file.slice(distDir.length).replace(/\\/g, "/");
        validRoutes.add(rel);
        if (rel === "/index.html") validRoutes.add("/");
        else if (rel.endsWith("/index.html")) validRoutes.add(rel.replace(/\/index\.html$/, ""));
        else if (rel.endsWith(".html")) validRoutes.add(rel.replace(/\.html$/, ""));
      }
    }
    for (const file of distFiles.filter(f => f.endsWith(".html"))) {
      const content = readFileSync(file, "utf8");
      for (const m of content.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
        const href = m[1]!.split(/[?#]/)[0]!;
        if (!href || href.startsWith("#") || /^(https?:|mailto:|tel:|javascript:)/i.test(href)) continue;
        const normalized = href.startsWith("/") ? href : `/${href}`;
        const targetHtml = normalized === "/" ? "/index.html" : normalized.endsWith(".html") ? normalized : `${normalized}/index.html`;
        if (!validRoutes.has(normalized) && !validRoutes.has(targetHtml) && !existsSync(join(distDir, normalized.replace(/^\//, "")))) {
          failures.push(`Broken internal link in ${file.slice(distDir.length).replace(/\\/g, "/")}: ${href}`);
        }
      }
    }
  }

  // 3. Slot integrity verification: ensure no unrendered <slot> tags
  if (existsSync(distDir)) {
    for (const file of files(distDir).filter(f => f.endsWith(".html"))) {
      const content = readFileSync(file, "utf8");
      if (/<slot\b/i.test(content)) {
        failures.push(`Unresolved <slot> tag found in ${file.slice(distDir.length).replace(/\\/g, "/")}`);
      }
    }
  }

  // 4. Verify change actually completed against baseline
  const baseline = loadRefineBaseline(root, opts.requestId);
  if (baseline) {
    const currentLayoutHash = hashIfPresent(root, ["pages", "components", "theme", "site.json"]);
    const currentBusinessHash = hashIfPresent(root, ["onboarding/business.json"]);
    const currentMediaHash = hashIfPresent(root, ["onboarding/media-inventory.json"]);
    const currentCopyHash = hashIfPresent(root, ["onboarding/copy-plan.json"]);
    const currentDirectionHash = hashIfPresent(root, ["onboarding/direction.json"]);

    const sourceChanged =
      currentLayoutHash !== baseline.layoutHash ||
      currentBusinessHash !== baseline.businessHash ||
      currentMediaHash !== baseline.mediaHash ||
      currentCopyHash !== baseline.copyHash ||
      currentDirectionHash !== baseline.directionHash;

    if (!sourceChanged) {
      failures.push("Refinement produced no changes; requested modifications were not completed.");
    } else {
      if (request.scope === "copy" && currentCopyHash === baseline.copyHash && currentLayoutHash === baseline.layoutHash) {
        failures.push("Copy refinement did not modify copy plan or page source.");
      } else if (request.scope === "direction" && currentDirectionHash === baseline.directionHash && hashIfPresent(root, ["theme"]) === baseline.themeHash) {
        failures.push("Direction refinement did not modify direction brief or theme tokens.");
      } else if (request.scope === "business" && currentBusinessHash === baseline.businessHash) {
        failures.push("Business refinement did not modify business brief or facts.");
      }
    }
  }

  // 5. Check theme tokens & design consistency
  const themePath = join(root, "theme/defaults.json");
  if (existsSync(themePath)) {
    try {
      const theme = JSON.parse(readFileSync(themePath, "utf8"));
      if (typeof theme !== "object" || theme === null || Array.isArray(theme)) {
        failures.push("theme/defaults.json must be a valid JSON object");
      } else {
        const colorRegex = /^(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)|var\([^)]+\)|[a-z]+)$/;
        for (const [k, v] of Object.entries(theme)) {
          if (typeof v === "string" && (k.toLowerCase().includes("color") || ["bg", "text", "accent", "primary", "secondary"].includes(k))) {
            if (!colorRegex.test(v.trim())) {
              failures.push(`Invalid color token value for '${k}': "${v}"`);
            }
          }
        }
        if (request.scope !== "direction" && baseline && baseline.themeHash) {
          const currentThemeHash = hashIfPresent(root, ["theme"]);
          if (currentThemeHash !== baseline.themeHash) {
            failures.push("Theme tokens modified outside a direction-scoped request.");
          }
        }
      }
    } catch {
      failures.push("theme/defaults.json is malformed JSON");
    }
  }

  // 6. Check responsive viewports & live browser verification
  if (existsSync(distDir)) {
    for (const file of files(distDir).filter(f => f.endsWith(".html"))) {
      const content = readFileSync(file, "utf8");
      if (!/<meta\b[^>]*name=["']viewport["']/i.test(content)) {
        failures.push(`Missing responsive viewport meta tag in ${file.slice(distDir.length).replace(/\\/g, "/")}`);
        completedChecks["render-375"] = "fail"; completedChecks["render-1080"] = "fail";
      }
      const fixedWidthMatches = content.matchAll(/style=["'][^"']*width:\s*([4-9]\d{2,}|\d{4,})px[^"']*["']/gi);
      for (const m of fixedWidthMatches) {
        if (!m[0].includes("max-width")) {
          failures.push(`Fixed desktop width without responsive constraint in ${file.slice(distDir.length).replace(/\\/g, "/")}: ${m[1]}px`);
          completedChecks["render-375"] = "fail"; completedChecks["render-1080"] = "fail";
        }
      }
    }

    if (opts.browser !== false) {
      const server = previewServer(distDir);
      await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
      const address = server.address() as { port: number };
      const screenshotDir = join(root, `agent/screenshots/refine/${opts.requestId || "current"}`);
      mkdirSync(screenshotDir, { recursive: true });

      let browserInstance: any;
      try {
        const chromium = await loadPlaywrightChromium();
        browserInstance = await chromium.launch({ headless: true });
        const targetPages = request.affectedPages?.length ? request.affectedPages : ["/"];
        const storyPath=join(root,"onboarding/storyboard.json");
        const motionStory=existsSync(storyPath)?json<import('./artifacts.ts').Storyboard>(storyPath):undefined;
        const journeys=[];
        for (const route of targetPages) {
          if(motionStory?.motionPlan?.version===2&&motionStory.motionPlan.routes?.some(r=>r.route===route))for(const width of [375,1080])for(const mode of ['normal','reduce','static'] as const){
            const evidence=await captureMotionJourney(browserInstance,root,`http://127.0.0.1:${address.port}${route}`,route,width,mode,`agent/screenshots/refine/${opts.requestId||'current'}/${Date.now()}`,motionStory.motionPlan,motionCompositionPolicy(root,targetPages).operatorOff);
            journeys.push(evidence);failures.push(...journeyEvidenceFailures(root,evidence,motionStory.motionPlan));
          }

          for (const width of [375, 1080]) {
            const checkId = `render-${width}`;
            if (completedChecks[checkId] === "unevaluated") completedChecks[checkId] = "pass";
            const page = await browserInstance.newPage({ viewport: { width, height: 900 } });
            const url = `http://127.0.0.1:${address.port}${route === "/" ? "" : route}`;
            try {
              await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
              const observed = await page.evaluate(`(() => {
                const errors = [];
                if (document.documentElement.scrollWidth > innerWidth + 2) errors.push('Live browser horizontal overflow detected at ${width}px');
                if (document.querySelectorAll('h1').length !== 1) errors.push('Expected exactly one h1, found ' + document.querySelectorAll('h1').length);
                for (const img of document.images) {
                  if (img.getClientRects().length && (!img.complete || img.naturalWidth === 0)) {
                    errors.push('Broken image detected in live DOM: ' + img.getAttribute('src'));
                  }
                }
                return errors;
              })()`) as string[];
              failures.push(...observed);
              if (observed.length) completedChecks[checkId] = "fail";
              const screenshotPath = join(screenshotDir, `${route.replace(/[^a-zA-Z0-9]/g, "-") || "home"}-${width}.png`);
              await page.screenshot({ path: screenshotPath, fullPage: true });
            } catch (navErr) {
              failures.push(`Browser check failed for route ${route} (${width}px): ${navErr instanceof Error ? navErr.message : String(navErr)}`);
              completedChecks[checkId] = "fail";
            } finally {
              await page.close();
            }
          }
        }
        if(journeys.length)save(join(root,`agent/reviews/refine-journeys-${Date.now()}.json`),{routeJourneys:journeys});
      } catch (browserErr) {
        failures.push(`Browser verification failed: ${explainBrowserLaunchFailure(browserErr)}`);
        completedChecks["render-375"] = "fail"; completedChecks["render-1080"] = "fail";
      } finally {
        await browserInstance?.close();
        await new Promise<void>(r => server.close(() => r()));
      }
    }
  }

  // 7. Content fulfillment verification
  const technicalFailures = [...failures];
  const fulfillmentErrors = verifyFulfillment(root, request, baseline);
  failures.push(...fulfillmentErrors);

  // 8. Regression failures (facts, media inventory, preserved preferences)
  const regFailures = regressionFailures(root, opts.requestId);
  failures.push(...regFailures);
  const integrityFailures: string[] = [];
  if (sourceRevision(root).digest !== candidateRevision) integrityFailures.push("Source changed during refinement verification.");
  if (verifiedBuildDigest && fingerprint(root, ["dist"]) !== verifiedBuildDigest) integrityFailures.push("Built artifact changed during refinement verification.");
  if (integrityFailures.length) completedChecks.build = "fail";
  failures.push(...integrityFailures);
  const technical = technicalFailures.length || regFailures.length || integrityFailures.length ? "fail" : "pass";
  const fulfillment = request.plan ? (fulfillmentErrors.length ? "fail" : "pass") : "unevaluated";
  const visualCriteria = request.plan?.acceptanceCriteria.some(criterion => criterion.kind === "visual_review");
  const design = visualCriteria ? (fulfillmentErrors.length ? "fail" : "pass") : "unevaluated";

  // 8. Segregate observed changes from accepted decisions:
  if (failures.length === 0) {
    if (opts.accept !== false) {
      updateSiteMemory(root, request);
      consumeRefinePending(root);
    }
    const report = writeRefineReport(root, { failures: [], requestId: opts.requestId });
    return {
      ok: true,
      failures: [],
      summary: opts.accept === false ? `Refinement candidate verified: ${request.instruction}` : `Refinement verified and accepted: ${request.instruction}`,
      report,
      technical, fulfillment, design, verifiedSourceRevision: candidateRevision, verifiedBuildDigest, completedChecks,
    };
  } else {
    const report = writeRefineReport(root, { failures, requestId: opts.requestId });
    return {
      ok: false,
      failures,
      summary: `Refinement verification failed with ${failures.length} error(s):\n${failures.map(f => `  - ${f}`).join("\n")}`,
      report,
      technical, fulfillment, design, verifiedSourceRevision: candidateRevision, verifiedBuildDigest, completedChecks,
    };
  }
}

/** Called by the engine only after its final locked source/artifact comparison. */
export function acceptVerifiedRefine(root: string, requestId: string): void {
  assertRequestId(requestId);
  const request = json<ChangeRequest>(join(root, `agent/requests/${requestId}/request.json`));
  updateSiteMemory(root, request);
  consumeRefinePending(root);
}

export const REFRESH_PRESERVE_FILES = new Set([
  "request.json", "guardrails.md", "adapter.json", "adapter.reviewer.json",
  "site-memory.json", "change-request.json", "refine-report.json", "refine-report.txt",
  "jev.json", "workflow.json",
]);
export const REFRESH_PRESERVE_DIRS = /^(runs|run-history|reviews|screenshots|design-runs|request-history|requests|site-memory-history|refine-baseline|decisions|preparations|leases|receipts)[\\/]/;
export const REFRESH_PRESERVE_DIR_NAMES = new Set([
  "request-history", "requests", "site-memory-history", "refine-baseline", "runs", "run-history", "reviews", "screenshots", "design-runs", "decisions", "preparations", "leases", "receipts",
]);
