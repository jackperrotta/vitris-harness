import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { json, type Business } from "../artifacts.ts";

export const GOAL_CONTRACT_VERSION = "2026-09-19.1";

export type GoalOwner = "code" | "agent" | "operator";
export type GoalPriority = "must" | "should" | "may";

export interface GoalObligation {
  id: string;
  priority: GoalPriority;
  sourceIds: string[];
  dependencyIds: string[];
  scope: "site" | "page" | "section";
  pagePath?: string;
  sectionId?: string;
  acceptance: string;
  owner: GoalOwner;
  kind:
    | "business_outcome"
    | "audience"
    | "offer"
    | "proof"
    | "visitor_question"
    | "required_action"
    | "prohibited_promise"
    | "page_section";
  statement: string;
  sourceHash: string;
  dependencyHash: string;
  frozen?: boolean;
}

export interface GoalContract {
  schemaVersion: 1;
  contractVersion: string;
  generatedAt: string;
  subjectHash: string;
  obligations: GoalObligation[];
  approvedSourceHash?: string;
}

export function defaultGoalContractPath(root: string): string {
  return join(root, "onboarding/goal-contract.json");
}

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function buildGoalContract(root: string): GoalContract {
  const obligations: GoalObligation[] = [];
  let bus: Business | undefined;
  const busPath = join(root, "onboarding/business.json");
  if (existsSync(busPath)) {
    try { bus = json<Business>(busPath); } catch { /* ignore */ }
  }
  const push = (o: Omit<GoalObligation, "id" | "sourceHash" | "dependencyHash"> & { id?: string }) => {
    const sourceHash = sha(o.sourceIds.join("|"));
    const dependencyHash = sha(o.dependencyIds.join("|"));
    const id = o.id || `goal_${o.kind}_${sha(`${o.kind}|${o.sourceIds.join("|")}`).slice(0, 12)}`;
    obligations.push({ ...o, id, sourceHash, dependencyHash });
  };
  if (bus?.offer) {
    push({
      kind: "offer",
      statement: bus.offer,
      priority: "must",
      sourceIds: ["onboarding/business.json#offer"],
      dependencyIds: ["business"],
      scope: "site",
      acceptance: "Rendered pages state the approved offer without inventing a new one.",
      owner: "agent",
    });
  }
  if (bus?.audience) {
    push({
      kind: "audience",
      statement: bus.audience,
      priority: "must",
      sourceIds: ["onboarding/business.json#audience"],
      dependencyIds: ["business"],
      scope: "site",
      acceptance: "Copy addresses the approved audience.",
      owner: "agent",
    });
  }
  if (bus?.outcome) {
    push({
      kind: "business_outcome",
      statement: bus.outcome,
      priority: "must",
      sourceIds: ["onboarding/business.json#outcome"],
      dependencyIds: ["business"],
      scope: "site",
      acceptance: "The site makes the approved outcome understandable to a visitor.",
      owner: "agent",
    });
  }
  if (bus?.engagement) {
    push({
      kind: "required_action",
      statement: bus.engagement,
      priority: "must",
      sourceIds: ["onboarding/business.json#engagement"],
      dependencyIds: ["business", "storyboard"],
      scope: "site",
      acceptance: "Primary CTA label and destination match the approved engagement action.",
      owner: "code",
    });
  }
  const requestPath = join(root, "agent/request.json");
  if (existsSync(requestPath)) {
    try {
      const req = JSON.parse(readFileSync(requestPath, "utf8"));
      const instruction = typeof req.instruction === "string" ? req.instruction : "";
      if (instruction.trim()) {
        push({
          kind: "visitor_question",
          statement: instruction.trim(),
          priority: "must",
          sourceIds: ["agent/request.json"],
          dependencyIds: ["operator"],
          scope: "site",
          acceptance: "Operator instruction remains authoritative; Jev must not infer a new objective.",
          owner: "operator",
          frozen: true,
        });
      }
    } catch { /* ignore */ }
  }
  const narrPath = join(root, "onboarding/narrative-brief.json");
  if (existsSync(narrPath)) {
    try {
      const narr = JSON.parse(readFileSync(narrPath, "utf8"));
      if (typeof narr.customer === "string" && narr.customer.trim()) {
        push({
          kind: "visitor_question",
          statement: `What should ${narr.customer} understand on arrival?`,
          priority: "should",
          sourceIds: ["onboarding/narrative-brief.json#customer"],
          dependencyIds: ["narrative"],
          scope: "page",
          pagePath: "/",
          acceptance: "Home page copy answers the arrival job.",
          owner: "agent",
        });
      }
    } catch { /* ignore */ }
  }
  const storyPath = join(root, "onboarding/storyboard.json");
  if (existsSync(storyPath)) {
    try {
      const story = JSON.parse(readFileSync(storyPath, "utf8"));
      for (const page of story.pages || []) {
        push({
          kind: "page_section",
          statement: `Page ${page.path || page.id || "unknown"} must exist`,
          priority: "must",
          sourceIds: [`onboarding/storyboard.json#${page.path || page.id}`],
          dependencyIds: ["storyboard"],
          scope: "page",
          pagePath: page.path,
          acceptance: "Required page/route exists in the storyboard and compiled site.",
          owner: "code",
        });
      }
    } catch { /* ignore */ }
  }

  const subjectHash = sha(JSON.stringify(obligations.map(o => ({ id: o.id, statement: o.statement, kind: o.kind, sourceHash: o.sourceHash }))));
  return {
    schemaVersion: 1,
    contractVersion: GOAL_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    subjectHash,
    approvedSourceHash: sha(JSON.stringify(obligations.filter(o => o.owner === "operator" || ["offer", "audience", "business_outcome", "required_action"].includes(o.kind)).map(o => ({ id: o.id, statement: o.statement })))),
    obligations,
  };
}

export function saveGoalContract(root: string, contract: GoalContract): string {
  const path = defaultGoalContractPath(root);
  mkdirSync(join(root, "onboarding"), { recursive: true });
  writeFileSync(path, JSON.stringify(contract, null, 2), "utf8");
  return path;
}

export function loadGoalContract(root: string): GoalContract | undefined {
  const path = defaultGoalContractPath(root);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as GoalContract;
  } catch {
    return undefined;
  }
}

export function changedGoalIds(previous: GoalContract | undefined, next: GoalContract): string[] {
  if (!previous) return next.obligations.map(o => o.id);
  const prev = new Map(previous.obligations.map(o => [o.id, `${o.statement}|${o.sourceHash}|${o.dependencyHash}`]));
  const changed: string[] = [];
  for (const o of next.obligations) {
    if (prev.get(o.id) !== `${o.statement}|${o.sourceHash}|${o.dependencyHash}`) changed.push(o.id);
  }
  for (const id of prev.keys()) {
    if (!next.obligations.some(o => o.id === id)) changed.push(id);
  }
  return [...new Set(changed)];
}

export function missingGoalFindings(root: string, contract: GoalContract): Array<{
  obligationId: string;
  reason: string;
  priority: GoalPriority;
}> {
  const findings: Array<{ obligationId: string; reason: string; priority: GoalPriority }> = [];
  const pagesDir = join(root, "pages");
  const storyPath = join(root, "onboarding/storyboard.json");
  let storyPages: string[] = [];
  if (existsSync(storyPath)) {
    try {
      const story = JSON.parse(readFileSync(storyPath, "utf8"));
      storyPages = (story.pages || []).map((p: any) => p.path || p.id).filter(Boolean);
    } catch { /* ignore */ }
  }
  const copyPath = join(root, "onboarding/copy-plan.json");
  let copyText = "";
  if (existsSync(copyPath)) {
    try { copyText = readFileSync(copyPath, "utf8").toLowerCase(); } catch { /* ignore */ }
  }
  for (const o of contract.obligations) {
    if (o.kind === "page_section" && o.pagePath) {
      const htmlName = o.pagePath === "/" ? "index.html" : `${String(o.pagePath).replace(/^\//, "").replace(/\/$/, "")}.html`;
      const pageFile = join(pagesDir, `${String(o.pagePath).replace(/^\//, "") || "index"}.html`);
      if (!storyPages.includes(o.pagePath) && !existsSync(pageFile) && !existsSync(join(root, "dist", htmlName))) {
        findings.push({ obligationId: o.id, reason: `Required page ${o.pagePath} is missing.`, priority: o.priority });
      }
    }
    if (o.priority === "must" && (o.kind === "visitor_question" || o.kind === "offer" || o.kind === "business_outcome")) {
      const tokens = o.statement.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4).slice(0, 4);
      const visible = copyText || "";
      const distIndex = join(root, "dist/index.html");
      const pagesIndex = join(root, "pages/index.html");
      let rendered = visible;
      if (existsSync(distIndex)) rendered += readFileSync(distIndex, "utf8").toLowerCase();
      else if (existsSync(pagesIndex)) rendered += readFileSync(pagesIndex, "utf8").toLowerCase();
      if (tokens.length && !tokens.some(t => rendered.includes(t))) {
        findings.push({
          obligationId: o.id,
          reason: `High-priority ${o.kind} is not visible in planned or rendered copy: ${o.statement}`,
          priority: o.priority,
        });
      }
    }
  }
  return findings;
}

export function invalidateDependentNodes(changedKinds: GoalObligation["kind"][]): string[] {
  const nodes = new Set<string>();
  for (const kind of changedKinds) {
    if (kind === "offer" || kind === "audience" || kind === "business_outcome" || kind === "proof") {
      nodes.add("narrative"); nodes.add("storyboard"); nodes.add("copy"); nodes.add("pages");
      nodes.add("copy-review"); nodes.add("content-review");
    }
    if (kind === "required_action") {
      nodes.add("storyboard"); nodes.add("copy"); nodes.add("content-review");
    }
    if (kind === "visitor_question") {
      nodes.add("copy"); nodes.add("content-review");
    }
    if (kind === "page_section") {
      nodes.add("pages"); nodes.add("content-review");
    }
  }
  return [...nodes];
}

export function syncGoalContract(root: string): {
  contract: GoalContract;
  changedIds: string[];
  invalidatedNodes: string[];
} {
  const generated = buildGoalContract(root);
  const previous = loadGoalContract(root);
  const byId = new Map(generated.obligations.map(o => [o.id, o]));
  for (const frozen of (previous?.obligations || []).filter(o => o.owner === "operator" || o.frozen)) {
    const next = generated.obligations.find(o => o.id === frozen.id);
    byId.set(frozen.id, {
      ...frozen,
      statement: frozen.owner === "operator" ? frozen.statement : (next?.statement ?? frozen.statement),
      frozen: true,
    });
  }
  const contract: GoalContract = {
    ...generated,
    obligations: [...byId.values()],
    subjectHash: sha(JSON.stringify([...byId.values()].map(o => ({ id: o.id, statement: o.statement, kind: o.kind, sourceHash: o.sourceHash })))),
  };
  const changedIds = previous ? changedGoalIds(previous, contract) : [];
  const changedKinds = contract.obligations.filter(o => changedIds.includes(o.id)).map(o => o.kind);
  const removedKinds = (previous?.obligations || []).filter(o => changedIds.includes(o.id)).map(o => o.kind);
  const invalidatedNodes = changedIds.length ? invalidateDependentNodes([...changedKinds, ...removedKinds]) : [];
  saveGoalContract(root, contract);
  if (changedIds.length) {
    mkdirSync(join(root, "agent/runs"), { recursive: true });
    writeFileSync(join(root, "agent/runs/goal-invalidation.json"), JSON.stringify({
      schemaVersion: 1,
      changedIds,
      invalidatedNodes,
      approvedSourceHash: contract.approvedSourceHash,
      recordedAt: new Date().toISOString(),
    }, null, 2), "utf8");
  }
  return { contract, changedIds, invalidatedNodes };
}
