import { createHash, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseFragment } from "parse5";
import { fingerprint, json, recoverableReplace, save, within } from "../agent/artifacts.ts";
import { withMutationLock } from "../agent/preparation.ts";
import { acceptVerifiedRefine, prepareRefine, verifyRefine } from "../agent/refine.ts";
import { buildVerified } from "../build/verified.ts";
import { findHarnessRoot } from "../cli/root.ts";
import {
  assertRequestId, parseChangePlan, parseChangeRequest, parseSiteIdentity, type ChangePlanRecord,
  type ChangeRequestRecord, type ChangeResultRecord, type SiteIdentity, type SourceRevision,
  type VerificationReceiptRecord,
} from "./contracts.ts";
import { changedSourceFiles, sourceRevision } from "./revision.ts";
import { generateEditManifest } from "../editing/manifest.ts";
import { elementMatchesIdentity } from "../editing/identity.ts";
import { REGISTERED_CHANGE_CHECKS } from "./checks.ts";
import { copyImpactFailures } from "./impact.ts";

export { sourceRevision, changedSourceFiles } from "./revision.ts";
export { generateEditManifest, publicEditManifest } from "../editing/manifest.ts";
export type { SiteIdentity, SourceRevision, ChangeRequestRecord, ChangePlanRecord, ChangeResultRecord } from "./contracts.ts";

export interface SiteInspection {
  identity: SiteIdentity;
  revision: SourceRevision;
  legacyIdentity: boolean;
  pendingRequestId?: string;
}

export function inspectSite(siteRoot: string): SiteInspection {
  const root = resolve(siteRoot);
  const site = json<Record<string, unknown>>(within(root, "site.json"));
  const harness = json<{ version: string }>(join(findHarnessRoot(), "package.json"));
  const siteId = typeof site.siteId === "string" && site.siteId ? site.siteId : `legacy:${String(site.slug || "unknown")}`;
  const identity = parseSiteIdentity({ schemaVersion: 1, siteId,
    sourceFormatVersion: typeof site.sourceFormatVersion === "number" ? site.sourceFormatVersion : 1,
    harness: { name: "@vitris/harness", version: harness.version },
    capabilities: Array.isArray(site.capabilities) ? site.capabilities : [],
  });
  const pendingPath = join(root, "agent/refine-pending.json");
  const pending = existsSync(pendingPath) ? json<{ requestId?: string }>(pendingPath) : undefined;
  return { identity, revision: sourceRevision(root), legacyIdentity: !site.siteId,
    ...(pending?.requestId ? { pendingRequestId: pending.requestId } : {}) };
}

export interface PreparedChange {
  status: "prepared";
  request: ChangeRequestRecord;
  plan: ChangePlanRecord;
  baselineRevision: SourceRevision;
  preparedRevision: SourceRevision;
  baselinePath: string;
  impactedNodes: string[];
}

interface SourceBackup { schemaVersion: 1; files: Array<{ path: string; sha256: string | null }> }

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function prepareChange(siteRoot: string, rawRequest: unknown, rawPlan: unknown): PreparedChange {
  const root = resolve(siteRoot);
  const request = parseChangeRequest(rawRequest);
  const plan = parseChangePlan(rawPlan);
  if (request.id !== plan.requestId || request.baseRevision !== plan.baseRevision) throw new Error("Request and plan identities differ");
  if (!request.requestedScopes.every(scope => plan.facets.includes(scope))) throw new Error("Plan omits an explicitly requested facet");
  const unknownChecks = plan.requiredChecks.filter(id => !REGISTERED_CHANGE_CHECKS.has(id));
  if (unknownChecks.length) throw new Error(`Unsupported required check(s): ${unknownChecks.join(", ")}`);
  for (const file of plan.files) {
    if (file.startsWith("/") || /^[a-z]:/i.test(file) || file.includes("\\")) throw new Error(`Plan file must be site-relative: ${file}`);
    within(root, file);
  }
  return withMutationLock(root, () => {
    const receiptPath = join(root, `agent/requests/${request.id}/engine-preparation.json`);
    const payloadHash = digest({ request, plan });
    if (existsSync(receiptPath)) {
      const existing = json<PreparedChange & { payloadHash: string }>(receiptPath);
      if (existing.payloadHash !== payloadHash) throw new Error(`Request ID '${request.id}' is already used for different content`);
      const { payloadHash: _payloadHash, ...prepared } = existing;
      return prepared;
    }
    const baselineRevision = sourceRevision(root);
    if (baselineRevision.digest !== request.baseRevision) throw new Error(`Source revision conflict: expected ${request.baseRevision}, current ${baselineRevision.digest}`);
    const prepared = prepareRefine({ root, instruction: request.instruction, requestId: request.id, plan,
      explicitPreferences: request.explicitPreferences, origin: request.origin });
    const backupRoot = join(root, `agent/requests/${request.id}/source-backup`);
    const backup: SourceBackup = { schemaVersion: 1, files: plan.files.map(path => {
      const source = within(root, path);
      if (!existsSync(source)) return { path, sha256: null };
      const target = within(backupRoot, path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(source, target);
      return { path, sha256: createHash("sha256").update(readFileSync(source)).digest("hex") };
    }) };
    save(join(root, `agent/requests/${request.id}/source-backup.json`), backup);
    const result: PreparedChange = { status: "prepared", request, plan, baselineRevision,
      preparedRevision: sourceRevision(root), baselinePath: prepared.baselinePath, impactedNodes: prepared.impactedNodes };
    save(receiptPath, { ...result, payloadHash });
    return result;
  });
}

export interface SetTextOperation { kind: "set_text"; file: string; elementId: string; text: string }
export interface ReplaceMediaOperation { kind: "replace_media"; file: string; elementId: string; src: string }
export interface SetThemeTokenOperation { kind: "set_theme_token"; file: "theme/defaults.json"; token: string; value: string }
export interface MoveSectionOperation { kind: "move_section"; file: string; sectionId: string; beforeSectionId: string }
export type SourceOperation = SetTextOperation | ReplaceMediaOperation | SetThemeTokenOperation | MoveSectionOperation;

type HtmlNode = {
  nodeName?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
  sourceCodeLocation?: { startOffset: number; endOffset: number; startTag?: { startOffset: number; endOffset: number } };
};

function findElement(html: string, elementId: string): HtmlNode {
  const tree = parseFragment(html, { sourceCodeLocationInfo: true }) as HtmlNode;
  const matches: HtmlNode[] = [];
  const walk = (node: HtmlNode) => {
    if (elementMatchesIdentity(node.attrs, elementId)) matches.push(node);
    for (const child of node.childNodes || []) walk(child);
  };
  walk(tree);
  if (matches.length !== 1) throw new Error(`Element '${elementId}' must resolve exactly once`);
  return matches[0]!;
}

function replaceElementText(html: string, elementId: string, text: string): string {
  const children = findElement(html, elementId).childNodes || [];
  if (children.length !== 1 || children[0]!.nodeName !== "#text" || !children[0]!.sourceCodeLocation) {
    throw new Error(`Element '${elementId}' contains custom markup; edit it with the agent`);
  }
  const loc = children[0]!.sourceCodeLocation!;
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return html.slice(0, loc.startOffset) + escaped + html.slice(loc.endOffset);
}

function replaceMedia(html: string, elementId: string, src: string): string {
  if (!/^\/media\/[a-zA-Z0-9/_.,-]+$/.test(src) || src.split("/").some(part => part === "." || part === "..")) {
    throw new Error("Media source must be a local /media/ asset");
  }
  const node = findElement(html, elementId);
  if (node.nodeName !== "img" || !node.sourceCodeLocation?.startTag) throw new Error(`Element '${elementId}' is not an editable image`);
  const { startOffset, endOffset } = node.sourceCodeLocation.startTag;
  const tag = html.slice(startOffset, endOffset);
  const match = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(tag);
  if (!match) throw new Error(`Image '${elementId}' has no src attribute`);
  const updated = tag.slice(0, match.index) + `src=${match[1]}${src}${match[1]}` + tag.slice(match.index + match[0].length);
  return html.slice(0, startOffset) + updated + html.slice(endOffset);
}

function assertRegisteredMedia(root: string, src: string) {
  const path = src.slice(1);
  const inventoryPath = join(root, "onboarding/media-inventory.json");
  if (!existsSync(inventoryPath)) throw new Error("Image replacement requires onboarding/media-inventory.json with asset provenance");
  const inventory = json<{ assets?: Array<{ path?: string; id?: string; sha256?: string; disposition?: string; sources?: string[] }> }>(inventoryPath);
  const matches = (inventory.assets || []).filter(asset => asset.path?.replaceAll("\\", "/").replace(/^\//, "") === path);
  if (matches.length !== 1) throw new Error(`Media asset '${src}' must have one inventory identity`);
  const asset = matches[0]!;
  if (!asset.id || !["use", "retain"].includes(asset.disposition || "") || !asset.sources?.some(source => source.trim())) {
    throw new Error(`Media asset '${src}' lacks usable provenance or disposition`);
  }
  const file = within(root, path);
  if (!existsSync(file)) throw new Error(`Media asset '${src}' does not exist`);
  const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (asset.sha256 !== actual) throw new Error(`Media asset '${src}' inventory hash does not match local bytes`);
}

function moveSection(html: string, sectionId: string, beforeSectionId: string): string {
  if (sectionId === beforeSectionId) throw new Error("Section cannot be moved before itself");
  const tree = parseFragment(html, { sourceCodeLocationInfo: true }) as HtmlNode;
  const pairs: Array<{ children: HtmlNode[]; index: number; node: HtmlNode }> = [];
  const walk = (node: HtmlNode) => {
    const children = node.childNodes || [];
    children.forEach((child, index) => {
      if (child.nodeName === "section" && child.attrs?.some(attr => attr.name === "data-vitris-movable")) pairs.push({ children, index, node: child });
      walk(child);
    });
  };
  walk(tree);
  const byId = (id: string) => pairs.filter(pair => pair.node.attrs?.some(attr => attr.name === "id" && attr.value === id));
  const source = byId(sectionId), target = byId(beforeSectionId);
  if (source.length !== 1 || target.length !== 1 || source[0]!.children !== target[0]!.children) throw new Error("Sections must be unique movable siblings");
  const a = source[0]!, b = target[0]!;
  const from = a.node.sourceCodeLocation, to = b.node.sourceCodeLocation;
  if (!from || !to) throw new Error("Section source mapping is unavailable");
  if (a.index < b.index) {
    throw new Error(`Section '${sectionId}' is already before '${beforeSectionId}'`);
  }
  const gap = html.slice(to.endOffset, from.startOffset);
  if (gap.trim()) throw new Error("Intervening source is not whitespace");
  return html.slice(0, to.startOffset) + html.slice(from.startOffset, from.endOffset) + gap
    + html.slice(to.startOffset, to.endOffset) + html.slice(from.endOffset);
}

export interface AppliedChange {
  status: "draft";
  requestId: string;
  beforeRevision: SourceRevision;
  afterRevision: SourceRevision;
  changedFiles: string[];
}

export function applyOperations(siteRoot: string, requestId: string, operations: SourceOperation[], manifestRevision?: string): AppliedChange {
  const root = resolve(siteRoot);
  assertRequestId(requestId);
  if (!Array.isArray(operations) || operations.length !== 1) throw new Error("Exactly one source operation is supported per draft save");
  const operation = operations[0]!;
  if (operation.kind === "set_text" && (typeof operation.elementId !== "string" || !operation.elementId || typeof operation.text !== "string")) throw new Error("Invalid set_text operation");
  if (operation.kind === "replace_media" && (typeof operation.elementId !== "string" || !operation.elementId || typeof operation.src !== "string")) throw new Error("Invalid replace_media operation");
  if (operation.kind === "set_theme_token" && (typeof operation.token !== "string" || !operation.token || typeof operation.value !== "string")) throw new Error("Invalid set_theme_token operation");
  if (operation.kind === "move_section" && (typeof operation.sectionId !== "string" || typeof operation.beforeSectionId !== "string")) throw new Error("Invalid move_section operation");
  if (operation.kind !== "set_theme_token" && (!operation.file.endsWith(".html") ||
    (!operation.file.startsWith("pages/") && !operation.file.startsWith("components/")))) throw new Error("Operation must target a page or component HTML file");
  return withMutationLock(root, () => {
    const prepared = json<PreparedChange>(join(root, `agent/requests/${requestId}/engine-preparation.json`));
    if (!prepared.plan.files.includes(operation.file)) throw new Error(`File '${operation.file}' was not included in the change plan`);
    const resultPath = join(root, `agent/requests/${requestId}/engine-apply.json`);
    const operationsHash = digest(operations);
    if (existsSync(resultPath)) {
      const prior = json<AppliedChange & { operationsHash: string }>(resultPath);
      if (prior.operationsHash !== operationsHash) throw new Error(`Request ID '${requestId}' was applied with different operations`);
      if (sourceRevision(root).digest !== prior.afterRevision.digest) throw new Error("Applied draft has changed since the first save");
      const { operationsHash: _operationsHash, ...applied } = prior;
      return applied;
    }
    const beforeRevision = sourceRevision(root);
    if (beforeRevision.digest !== prepared.preparedRevision.digest) throw new Error("Source revision changed after preparation; inspect and replan before saving");
    if (manifestRevision && manifestRevision !== prepared.baselineRevision.digest) throw new Error("Stale editor manifest; rebuild and reselect the field");
    const file = within(root, operation.file);
    const source = readFileSync(file, "utf8");
    let updated: string;
    if (operation.kind === "set_text") updated = replaceElementText(source, operation.elementId, operation.text);
    else if (operation.kind === "replace_media") {
      assertRegisteredMedia(root, operation.src);
      updated = replaceMedia(source, operation.elementId, operation.src);
    } else if (operation.kind === "move_section") updated = moveSection(source, operation.sectionId, operation.beforeSectionId);
    else {
      const theme = JSON.parse(source) as Record<string, unknown>;
      if (!Object.hasOwn(theme, operation.token) || typeof theme[operation.token] !== "string") throw new Error(`Theme token '${operation.token}' is not declared`);
      theme[operation.token] = operation.value;
      updated = `${JSON.stringify(theme, null, 2)}\n`;
    }
    if (updated === source) throw new Error("Operation did not change the source");
    const temporary = `${file}.tmp.${process.pid}.${randomUUID()}`;
    writeFileSync(temporary, updated);
    recoverableReplace(temporary, file);
    const afterRevision = sourceRevision(root);
    const result: AppliedChange = { status: "draft", requestId, beforeRevision, afterRevision,
      changedFiles: changedSourceFiles(beforeRevision, afterRevision) };
    save(resultPath, { ...result, operationsHash });
    return result;
  });
}

export async function buildSiteDraft(siteRoot: string): Promise<{ sourceRevision: SourceRevision; buildDigest: string; output: string }> {
  const root = resolve(siteRoot);
  const before = sourceRevision(root);
  await buildVerified(root);
  const after = sourceRevision(root);
  if (before.digest !== after.digest) throw new Error("Source changed while building; rebuild against the new revision");
  generateEditManifest(root);
  return { sourceRevision: after, buildDigest: fingerprint(root, ["dist"]), output: join(root, "dist") };
}

export async function verifyChange(siteRoot: string, requestId: string): Promise<ChangeResultRecord> {
  const root = resolve(siteRoot);
  assertRequestId(requestId);
  const prepared = json<PreparedChange>(join(root, `agent/requests/${requestId}/engine-preparation.json`));
  const before = prepared.preparedRevision;
  const current = sourceRevision(root);
  const changedFiles = changedSourceFiles(before, current);
  if (changedFiles.length === 0) throw new Error("No authored source changed after preparation");
  const unplannedFiles = changedFiles.filter(file => !prepared.plan.files.includes(file));
  if (unplannedFiles.length) {
    throw new Error(`Source impact exceeds the prepared plan: ${unplannedFiles.join(", ")}. Inspect the edits and prepare a new plan before verification`);
  }
  const impactFailures = copyImpactFailures(root, requestId, prepared.plan, changedFiles);
  const checked = await verifyRefine({ root, requestId, accept: false });
  const requiredFailures = prepared.plan.requiredChecks
    .filter(id => checked.completedChecks?.[id] !== "pass")
    .map(id => `Required check ${id} did not pass (${checked.completedChecks?.[id] || "unevaluated"})`);
  return withMutationLock(root, () => {
    if (sourceRevision(root).digest !== current.digest || checked.verifiedSourceRevision !== current.digest) {
      throw new Error("Source changed during verification; candidate was not accepted");
    }
    const buildDigest = checked.verifiedBuildDigest || "missing";
    if (checked.verifiedBuildDigest && fingerprint(root, ["dist"]) !== checked.verifiedBuildDigest) {
      throw new Error("Built artifact changed during verification; candidate was not accepted");
    }
    if (checked.ok && requiredFailures.length === 0 && impactFailures.length === 0) acceptVerifiedRefine(root, requestId);
    const after = sourceRevision(root);
    const technical = requiredFailures.length || impactFailures.length ? "fail" : checked.technical || "unevaluated";
    const receipt: VerificationReceiptRecord = { schemaVersion: 1, subjectRevision: after.digest, buildDigest,
      checks: [
        { id: "refinement-technical", version: "1", outcome: technical, evidence: [`agent/requests/${requestId}/request.json`] },
        { id: "refinement-fulfillment", version: "1", outcome: checked.fulfillment || "unevaluated", evidence: [`agent/requests/${requestId}/request.json`] },
        { id: "source-impact", version: "1", outcome: impactFailures.length ? "fail" : "pass", evidence: [`agent/requests/${requestId}/source-backup.json`] },
        ...prepared.plan.requiredChecks.map(id => ({ id, version: "1", outcome: checked.completedChecks?.[id] || "unevaluated" as const,
          evidence: [id === "build" ? "dist" : `agent/screenshots/refine/${requestId}`] })),
      ],
      reviewer: "machine", createdAt: new Date().toISOString() };
    const result: ChangeResultRecord = { schemaVersion: 1, requestId, beforeRevision: before.digest, afterRevision: after.digest,
      changedFiles, changedTargets: prepared.plan.targets, technical,
      fulfillment: checked.fulfillment || "unevaluated", design: checked.design || "unevaluated", unresolved: [...checked.failures, ...requiredFailures, ...impactFailures], previewDigest: buildDigest, receipt };
    save(join(root, `agent/requests/${requestId}/engine-result.json`), result);
    return result;
  });
}

/** Restores a failed or abandoned candidate only while its exact source revision still matches. */
export function discardChange(siteRoot: string, requestId: string, candidateRevision: string) {
  const root = resolve(siteRoot);
  assertRequestId(requestId);
  return withMutationLock(root, () => {
    const requestRoot = join(root, `agent/requests/${requestId}`);
    const prepared = json<PreparedChange>(join(requestRoot, "engine-preparation.json"));
    const current = sourceRevision(root);
    if (current.digest !== candidateRevision) throw new Error("Candidate revision changed; inspect before discard");
    const changed = changedSourceFiles(prepared.preparedRevision, current);
    if (!changed.length) return { status: "already_discarded" as const, revision: current, restoredFiles: [] };
    const unplanned = changed.filter(path => !prepared.plan.files.includes(path));
    if (unplanned.length) throw new Error(`Cannot discard unplanned source changes: ${unplanned.join(", ")}`);
    const resultPath = join(requestRoot, "engine-result.json");
    if (existsSync(resultPath)) {
      const result = json<ChangeResultRecord>(resultPath);
      if (result.technical === "pass" && result.fulfillment === "pass") throw new Error("Verified change is accepted; use a new reversal request");
    }
    const backup = json<SourceBackup>(join(requestRoot, "source-backup.json"));
    for (const entry of backup.files) {
      if (entry.sha256 === null) continue;
      const saved = within(root, `agent/requests/${requestId}/source-backup/${entry.path}`);
      if (!existsSync(saved) || createHash("sha256").update(readFileSync(saved)).digest("hex") !== entry.sha256) {
        throw new Error(`Source backup for ${entry.path} is missing or changed`);
      }
    }
    for (const entry of backup.files.filter(item => changed.includes(item.path))) {
      const dest = within(root, entry.path);
      if (entry.sha256 === null) { if (existsSync(dest)) unlinkSync(dest); continue; }
      mkdirSync(dirname(dest), { recursive: true });
      const temporary = `${dest}.discard-${process.pid}-${randomUUID()}`;
      cpSync(within(root, `agent/requests/${requestId}/source-backup/${entry.path}`), temporary);
      recoverableReplace(temporary, dest);
    }
    const restored = sourceRevision(root);
    if (restored.digest !== prepared.preparedRevision.digest) throw new Error("Restored source does not match the prepared revision; inspect the candidate");
    save(join(requestRoot, "engine-discard.json"), { schemaVersion: 1, requestId, candidateRevision,
      restoredRevision: restored.digest, restoredFiles: changed, discardedAt: new Date().toISOString() });
    return { status: "discarded" as const, revision: restored, restoredFiles: changed };
  });
}
