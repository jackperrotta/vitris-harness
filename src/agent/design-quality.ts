import { artDirectionPolicy } from "./art-direction-policy.ts";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { files, fingerprint, json, save, sha256, within, type QualityReview, QUALITY_DIMENSIONS } from "./artifacts.ts";
import { ACCURACY_PROBE_PHRASE, PROBE_RGB, PROBE_TOKEN, calibrationPackDir, calibrationPackHash, solidPng } from "./design-calibration.ts";
import { parseImageToolReads, type ImageToolRead } from "./design-usage.ts";
import type { GradeResult } from "./grade.ts";
import { resolveDesignAuthoring } from "./composition-authoring.ts";
import { loadCompositionPack } from "../knowledge/composition.ts";
import type { Storyboard } from "./artifacts.ts";

export { type QualityReview, QUALITY_DIMENSIONS } from "./artifacts.ts";
export { PROBE_TOKEN } from "./design-calibration.ts";

export const QUALITY_FLOOR = 2;
export const QUALITY_MUST_REACH = ["business-specificity", "composition", "media-integration"] as const;
export const QUALITY_MUST_SCORE = 3;
export const VISUAL_PROBE_FILENAME = "visual-probe.png";
export const QUALITY_PROBE_REL = "agent/reviews/visual-probe.png";
export const QUALITY_RECEIPT_REL = "agent/reviews/representative-quality.receipt.json";
export const QUALITY_LOG_ARCHIVE_REL = "agent/reviews/representative-quality.invocation.log";
export const QUALITY_REPAIR_ATTEMPTS = 2;

const present = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

export function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function qualitySubject(root: string): string {
  const base = fingerprint(root, [
    "pages", "components", "theme", "site.json",
    ...(artDirectionPolicy(root) ? ["media","artwork","onboarding/visual-asset-brief.json","onboarding/asset-production.json"] : []),
    "onboarding/direction.json", "onboarding/storyboard.json", "onboarding/copy-plan.json",
    "onboarding/narrative-brief.json", "onboarding/reference-analysis.json",
    "agent/reviews/representative-browser.json", "agent/screenshots/representative-browser",
  ]);
  const policy = resolveDesignAuthoring(root);
  if (policy.mode === "blocks-v0") return base;
  const pack = loadCompositionPack(root, policy.lessonRelease);
  return sha256(JSON.stringify({ base, policy: policy.hash, pack: pack.manifestHash, decisions: fingerprint(root, ["agent/decisions/authoring-decisions.json"]) }));
}

/** Advisory observations become reviewable only when tied to exact current captures. */
export function validateCompositionQualityObservations(root: string, review: QualityReview): string[] {
  if (resolveDesignAuthoring(root).mode !== "composition-v1") return [];
  const errors: string[] = [];
  if (review.compositionReviewVersion !== 1 || !Array.isArray(review.compositionObservations)) return ["Composition quality review needs version 1 located observations"];
  const story = json<Storyboard>(join(root, "onboarding/storyboard.json"));
  const browser = json<{
    checks?: { path: string; width: number; motion: string; screenshot: string; failures: string[] }[];
    compositionTargets?: { path: string; width: number; motion: string; sectionId: string; elementId: string; count: number; visible: boolean; screenshot: string; screenshotHash: string; captureSha256: string }[];
  }>(join(root, "agent/reviews/representative-browser.json"));
  const seen = new Set<string>();
  for (const page of story.pages.filter(item => item.path === "/" || item.representative)) for (const section of page.sections) for (const planned of section.renderObservations || []) {
    const key = `${page.path}#${planned.id}`;
    const results = review.compositionObservations.filter(item => item.page === page.path && item.observationId === planned.id);
    const result = results[0];
    if (results.length !== 1 || !result || seen.has(key)) { errors.push(`Missing or duplicate composition review observation ${key}`); continue; }
    seen.add(key);
    if (!result.observed?.trim() || result.elementIds.slice().sort().join("|") !== planned.elementIds.slice().sort().join("|") || !result.sectionIds.includes(section.id)) errors.push(`Composition observation ${key} has incomplete located evidence`);
    if (result.outcome === "unknown" || result.outcome === "not-applicable") errors.push(`Composition observation ${key} is unresolved; revise the plan or inspect the state`);
    if (result.outcome === "problem" && (!result.findingId || !review.findings.some(item => item.id === result.findingId))) errors.push(`Composition problem ${key} needs a located finding`);
    const captures = (browser.checks || []).filter(item => item.path === page.path && (planned.viewportClass === "all" || planned.viewportClass === "narrow" && item.width <= 600 || planned.viewportClass === "wide" && item.width >= 900) && (planned.state === "initial" || planned.state === "reduced-motion" && item.motion === "reduce"));
    if (!captures.length) errors.push(`Composition observation ${key} has no current viewport captures`);
    for (const capture of captures) {
      const targets = (browser.compositionTargets || []).filter(item => item.path === capture.path && item.width === capture.width && item.motion === capture.motion && item.sectionId === section.id && planned.elementIds.includes(item.elementId));
      if (capture.failures.length || planned.elementIds.some(id => targets.filter(item => item.elementId === id).length !== 1) || targets.some(item => item.count !== 1 || !item.visible || item.screenshot !== capture.screenshot)) {
        errors.push(`Composition observation ${key} has missing or duplicate current render targets at ${capture.width}px`);
        continue;
      }
      const rawHash = fileSha256(within(root, capture.screenshot));
      if (!result.captureHashes.includes(rawHash) || targets.some(item => item.captureSha256 !== rawHash || item.screenshotHash !== fingerprint(root, [capture.screenshot]))) errors.push(`Composition observation ${key} does not bind current captures at ${capture.width}px`);
    }
    if (planned.state !== "initial" && planned.state !== "reduced-motion") errors.push(`Composition observation ${key} state ${planned.state} needs a dedicated browser-state capture`);
  }
  return errors;
}

export function writeVisualProbe(destDir: string): { path: string; hash: string; token: string } {
  mkdirSync(destDir, { recursive: true });
  const path = join(destDir, VISUAL_PROBE_FILENAME);
  const png = solidPng(PROBE_RGB.r, PROBE_RGB.g, PROBE_RGB.b);
  writeFileSync(path, png);
  return { path, hash: createHash("sha256").update(png).digest("hex"), token: PROBE_TOKEN };
}

export function normalizeProbeToken(value: string): string {
  return value.trim().replace(/^#/, "").toUpperCase();
}

/** A 24px swatch supports approximate color recognition, not exact RGB naming. */
export function probeColorMatches(value: string): boolean {
  const observed = normalizeProbeToken(value);
  if (!/^[0-9A-F]{6}$/.test(observed)) return false;
  const expected = PROBE_TOKEN;
  const distance = [0, 2, 4].reduce((sum, i) => {
    const difference = parseInt(observed.slice(i, i + 2), 16) - parseInt(expected.slice(i, i + 2), 16);
    return sum + difference * difference;
  }, 0);
  return distance <= 32 * 32;
}

export type VisualProbeResult = {
  available: boolean;
  expectedToken: string;
  observedToken: string;
  probeHash: string;
  accuracyPhrase?: string;
  toolReads: ImageToolRead[];
  failures: string[];
};

export type QualityInvocationReceipt = {
  schemaVersion: 1;
  kind: "quality-invocation" | "quality-image-attachment-invocation";
  archivedAt: string;
  sourceLog: string;
  archiveRel: string;
  logHash: string;
  probeRel: string;
  probeHash: string;
  captureRel: string;
  captureHashes: { path: string; hash: string }[];
  imageInputs?: { path: string; hash: string }[];
  invocation?: { command: string; args: string[]; status: number; promptHash: string; subjectHash: string };
};

export type RepresentativeCapture = { path: string; hash: string };

export function representativeCaptureHashes(root: string): RepresentativeCapture[] {
  const dir = join(root, "agent/screenshots/representative-browser");
  if (!existsSync(dir)) return [];
  // Motion journeys keep immutable attempt history under this directory. Visual
  // quality consumes the current browser report's page captures; temporal
  // checkpoints are reviewed separately by the motion critic.
  const reportPath = join(root, "agent/reviews/representative-browser.json");
  if (existsSync(reportPath)) {
    const report = json<{ checks?: { screenshot: string; firstVisit?: { screenshot: string } }[] }>(reportPath);
    if (Array.isArray(report.checks)) {
      const paths = [...new Set(report.checks.flatMap(check => [check.screenshot, ...(check.firstVisit ? [check.firstVisit.screenshot] : [])]))];
      return paths.sort().map(path => {
        if (!path.startsWith("agent/screenshots/representative-browser/") || !path.endsWith(".png")) throw new Error("Invalid current representative capture: " + path);
        return { path, hash: fileSha256(within(root, path)) };
      });
    }
  }
  return files(dir)
    .filter(file => /\.png$/i.test(file))
    .map(file => ({
      path: relative(root, file).replaceAll("\\", "/"),
      hash: fileSha256(file),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function currentProbeHash(root: string): string | undefined {
  const path = join(root, QUALITY_PROBE_REL);
  return existsSync(path) ? fileSha256(path) : undefined;
}

function normalizeReadPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.?\//, "");
}

export function canonicalRelativePath(root: string | undefined, filePath: string): string {
  if (!filePath) return "";
  if (root) {
    const abs = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
    const rel = relative(root, abs).replaceAll("\\", "/");
    return normalizeReadPath(rel);
  }
  return normalizeReadPath(filePath);
}

function readCovers(read: ImageToolRead, expectedRel: string, root?: string, expectedHash?: string): boolean {
  const got = canonicalRelativePath(root, read.path);
  const want = normalizeReadPath(expectedRel);
  if (!want || got !== want) return false;
  if (expectedHash && read.hash && read.hash !== expectedHash) return false;
  return true;
}

function verifiedImageRead(read: ImageToolRead): boolean {
  return read.success !== false && read.imagePayload === true && present(read.path);
}

export function evaluateVisualProbe(opts: {
  root?: string;
  observedToken?: string;
  probeHash: string;
  expectedProbeHash?: string;
  logText?: string;
  accuracyObserved?: string;
}): VisualProbeResult {
  const observedToken = normalizeProbeToken(opts.observedToken || "");
  const expected = PROBE_TOKEN;
  const toolReads = opts.logText ? parseImageToolReads(opts.logText) : [];
  const failures: string[] = [];
  if (!probeColorMatches(observedToken)) failures.push("Visual capability probe failed: observed color is not close to the probe PNG fill color");
  if (opts.expectedProbeHash && opts.probeHash !== opts.expectedProbeHash) {
    failures.push("Quality review probeHash does not match the current probe file");
  }
  const probeReads = toolReads.filter(read => readCovers(read, QUALITY_PROBE_REL, opts.root, opts.expectedProbeHash));
  if (opts.logText != null && !probeReads.some(verifiedImageRead)) {
    failures.push("Adapter log has no verifiable PNG image-read event for the visual probe");
  }
  if (opts.accuracyObserved != null) {
    const phrase = opts.accuracyObserved.toLowerCase();
    if (!phrase.includes(ACCURACY_PROBE_PHRASE.toLowerCase())) {
      failures.push(`Visual accuracy probe failed: missing visible phrase "${ACCURACY_PROBE_PHRASE}"`);
    }
  }
  return {
    available: failures.length === 0,
    expectedToken: expected,
    observedToken,
    probeHash: opts.probeHash,
    accuracyPhrase: opts.accuracyObserved,
    toolReads,
    failures,
  };
}

export function archiveQualityInvocation(root: string, sourceLogPath: string): QualityInvocationReceipt {
  const absLog = sourceLogPath;
  if (!existsSync(absLog)) throw new Error("Cannot archive missing representative-quality adapter log");
  const logBytes = readFileSync(absLog);
  const logHash = createHash("sha256").update(logBytes).digest("hex");
  const archivePath = join(root, QUALITY_LOG_ARCHIVE_REL);
  mkdirSync(dirname(archivePath), { recursive: true });
  writeFileSync(archivePath, logBytes);
  const probeHash = currentProbeHash(root) || "";
  const captureHashes = representativeCaptureHashes(root);
  const receipt: QualityInvocationReceipt = {
    schemaVersion: 1,
    kind: "quality-invocation",
    archivedAt: new Date().toISOString(),
    sourceLog: relative(root, absLog).replaceAll("\\", "/"),
    archiveRel: QUALITY_LOG_ARCHIVE_REL,
    logHash,
    probeRel: QUALITY_PROBE_REL,
    probeHash,
    captureRel: "agent/screenshots/representative-browser",
    captureHashes,
  };
  save(join(root, QUALITY_RECEIPT_REL), receipt);
  return receipt;
}

/** Runner evidence: exact PNG bytes supplied as CLI image arguments, distinct from model tool reads. */
export function archiveQualityImageInvocation(root: string, sourceLogPath: string, invocation: {
  command: string;
  args: string[];
  status: number;
  promptHash: string;
  subjectHash: string;
  imageInputs: { path: string; hash: string }[];
}): QualityInvocationReceipt {
  if (invocation.status !== 0) throw new Error("Cannot archive an unsuccessful image reviewer invocation");
  if (invocation.imageInputs.length < 2) throw new Error("Image reviewer needs probe and production captures");
  const expected = [QUALITY_PROBE_REL, ...representativeCaptureHashes(root).map(c => c.path)].sort();
  const supplied = invocation.imageInputs.map(i => canonicalRelativePath(root, i.path)).sort();
  if (JSON.stringify(expected) !== JSON.stringify(supplied)) throw new Error("Image reviewer invocation omitted or added PNG inputs");
  for (const image of invocation.imageInputs) {
    const rel = canonicalRelativePath(root, image.path);
    if (fileSha256(within(root, rel)) !== image.hash) throw new Error(`Image reviewer input changed: ${rel}`);
    if (!invocation.args.includes(image.path)) throw new Error(`Image reviewer command omitted argument: ${rel}`);
  }
  const logText = readFileSync(sourceLogPath, "utf8");
  if (!logText.split(/\r?\n/).some(line => {
    try { return JSON.parse(line).type === "turn.completed"; } catch { return false; }
  })) throw new Error("Image reviewer CLI did not complete a turn");
  const receipt = archiveQualityInvocation(root, sourceLogPath);
  receipt.kind = "quality-image-attachment-invocation";
  receipt.imageInputs = invocation.imageInputs;
  receipt.invocation = {
    command: invocation.command,
    args: invocation.args,
    status: invocation.status,
    promptHash: invocation.promptHash,
    subjectHash: invocation.subjectHash,
  };
  save(join(root, QUALITY_RECEIPT_REL), receipt);
  return receipt;
}

export type ActiveAgentQualityReceipt = {
  schemaVersion: 1;
  kind: "active-agent-visual";
  archivedAt: string;
  preparationId?: string;
  probeRel: string;
  probeHash: string;
  captureRel: string;
  captureHashes: { path: string; hash: string }[];
  toolEvents?: Array<{ tool: string; path: string; success: boolean; hash?: string }>;
  environment?: string;
  transcriptRel?: string;
};

export function recordActiveAgentQualityReceipt(opts: {
  root: string;
  preparationId?: string;
  toolEvents?: Array<{ tool: string; path: string; success: boolean; hash?: string }>;
  environment?: string;
  transcriptRel?: string;
}): ActiveAgentQualityReceipt {
  const { root, preparationId, toolEvents, environment, transcriptRel } = opts;
  const probeHash = currentProbeHash(root) || "";
  const captures = representativeCaptureHashes(root);
  const receipt: ActiveAgentQualityReceipt = {
    schemaVersion: 1,
    kind: "active-agent-visual",
    archivedAt: new Date().toISOString(),
    preparationId,
    probeRel: QUALITY_PROBE_REL,
    probeHash,
    captureRel: "agent/screenshots/representative-browser",
    captureHashes: captures,
    toolEvents: toolEvents || [],
    environment: environment || process.env.VITRIS_AGENT_ENV || "active-agent",
    transcriptRel,
  };
  save(join(root, QUALITY_RECEIPT_REL), receipt);
  return receipt;
}

export type QualityReceipt = QualityInvocationReceipt | ActiveAgentQualityReceipt;

function loadQualityReceipt(root: string): { receipt?: QualityReceipt; failures: string[] } {
  const path = join(root, QUALITY_RECEIPT_REL);
  if (!existsSync(path)) return { failures: ["Quality review missing runner invocation receipt; review JSON cannot supply tool provenance"] };
  try {
    const receipt = json<QualityReceipt>(path);
    if (receipt.schemaVersion !== 1 || !["quality-invocation", "quality-image-attachment-invocation", "active-agent-visual"].includes(receipt.kind)) {
      return { failures: ["Quality invocation receipt schema mismatch"] };
    }
    return { receipt, failures: [] };
  } catch (error) {
    return { failures: [error instanceof Error ? error.message : String(error)] };
  }
}

const APPROVED_IMAGE_TOOLS = new Set(["view_file", "read_image", "view_image", "inspect_screenshot"]);

function bindQualityEvidence(root: string, review: QualityReview): string[] {
  const errors: string[] = [];
  const { receipt, failures } = loadQualityReceipt(root);
  errors.push(...failures);
  if (!receipt) return errors;

  const probeHash = currentProbeHash(root);
  if (!probeHash) errors.push("Missing current visual probe file");
  else {
    if (receipt.probeHash !== probeHash) errors.push("Quality receipt probeHash is not the current probe file");
    if (review.visualInspection?.probeHash !== probeHash) errors.push("Quality review probeHash is not the current probe file");
  }
  const captures = representativeCaptureHashes(root);
  if (!captures.length) errors.push("Quality review needs current representative screenshots");
  const currentHashes = captures.map(c => c.hash).sort();
  const receiptHashes = (receipt.captureHashes || []).map(c => c.hash).sort();
  const reviewHashes = [...(review.visualInspection?.captureHashes || [])].sort();
  if (JSON.stringify(currentHashes) !== JSON.stringify(receiptHashes)) {
    errors.push("Quality receipt capture hashes are not the current representative screenshots");
  }
  if (JSON.stringify(currentHashes) !== JSON.stringify(reviewHashes)) {
    errors.push("Quality review captureHashes are not the exact current representative screenshot hashes");
  }

  if (receipt.kind === "active-agent-visual") {
    // 1. Mandatory preparationId binding
    if (!receipt.preparationId || !receipt.preparationId.trim()) {
      errors.push("Active-agent visual capability probe failed: missing preparationId binding");
    }

    if (!receipt.toolEvents || !receipt.toolEvents.length) {
      errors.push("Active-agent visual capability probe failed: environment did not record image inspection events");
      return errors;
    }

    const probeEvent = receipt.toolEvents.find(e =>
      canonicalRelativePath(root, e.path) === normalizeReadPath(QUALITY_PROBE_REL)
    );
    if (!probeEvent || !probeEvent.success) {
      errors.push("Active-agent visual capability probe failed: missing successful image inspection event for visual probe");
    } else {
      if (!APPROVED_IMAGE_TOOLS.has(probeEvent.tool)) {
        errors.push(`Active-agent visual capability probe failed: unapproved tool "${probeEvent.tool}" for visual probe`);
      }
      if (!probeEvent.hash) {
        errors.push("Active-agent visual capability probe failed: missing content hash on probe inspection event");
      } else if (probeHash && probeEvent.hash !== probeHash) {
        errors.push("Active-agent visual capability probe failed: probe event hash does not match current probe file");
      }
    }

    for (const capture of captures) {
      const shotEvent = receipt.toolEvents.find(e =>
        canonicalRelativePath(root, e.path) === normalizeReadPath(capture.path)
      );
      if (!shotEvent || !shotEvent.success) {
        errors.push(`Active-agent inspection failed: missing successful image inspection event for ${capture.path}`);
      } else {
        if (!APPROVED_IMAGE_TOOLS.has(shotEvent.tool)) {
          errors.push(`Active-agent inspection failed: unapproved tool "${shotEvent.tool}" for ${capture.path}`);
        }
        if (!shotEvent.hash) {
          errors.push(`Active-agent inspection failed: missing content hash on inspection event for ${capture.path}`);
        } else if (shotEvent.hash !== capture.hash) {
          errors.push(`Active-agent inspection failed: image hash mismatch for ${capture.path}`);
        }
      }
    }
    return errors;
  }

  const archivePath = join(root, receipt.archiveRel || QUALITY_LOG_ARCHIVE_REL);
  if (!existsSync(archivePath)) {
    errors.push("Archived representative-quality adapter log is missing");
    return errors;
  }
  const currentLogHash = fileSha256(archivePath);
  if (currentLogHash !== receipt.logHash) errors.push("Archived quality adapter log does not match the bound receipt hash");

  let logText = "";
  try { logText = readFileSync(archivePath, "utf8"); }
  catch { errors.push("Unable to read archived quality adapter log"); return errors; }
  if (receipt.kind === "quality-image-attachment-invocation") {
    const invocation = receipt.invocation;
    if (!invocation || invocation.status !== 0 || !invocation.command || !invocation.promptHash || invocation.subjectHash !== qualitySubject(root)) {
      errors.push("Image reviewer invocation identity or subject is invalid");
    }
    if (!logText.split(/\r?\n/).some(line => {
      try { return JSON.parse(line).type === "turn.completed"; } catch { return false; }
    })) errors.push("Image reviewer transcript lacks a completed CLI turn");
    const expectedInputs = [{ path: QUALITY_PROBE_REL, hash: probeHash || "" }, ...captures];
    const inputs = receipt.imageInputs || [];
    if (inputs.length !== expectedInputs.length) errors.push("Image reviewer did not receive every required PNG");
    for (const expected of expectedInputs) {
      const item = inputs.find(input => canonicalRelativePath(root, input.path) === expected.path);
      if (!item || item.hash !== expected.hash || !invocation?.args.includes(item.path)) {
        errors.push(`Image reviewer input missing or stale: ${expected.path}`);
      }
    }
    return errors;
  }
  const reads = parseImageToolReads(logText);
  if (!reads.length) errors.push("Generic adapters without verifiable image-read events fail closed");
  const probeRel = QUALITY_PROBE_REL;
  const probeRead = reads.find(read => readCovers(read, probeRel, root, probeHash));
  if (!probeRead || !verifiedImageRead(probeRead)) {
    errors.push("Adapter log has no successful PNG image-read with a nonempty image payload for the visual probe");
  } else if (probeRead.hash && probeHash && probeRead.hash !== probeHash) {
    errors.push("Visual probe image-read content hash does not match probe artifact");
  } else if (!present(probeRead.dataBlobId) && !probeRead.imagePayload) {
    errors.push("Probe image-read needs a nonempty dataBlobId or image payload indicator");
  }
  for (const capture of captures) {
    const shotRead = reads.find(read => readCovers(read, capture.path, root, capture.hash));
    if (!shotRead || !verifiedImageRead(shotRead)) {
      errors.push(`Adapter log has no successful PNG image-read for ${capture.path}`);
      continue;
    }
    if (shotRead.hash && shotRead.hash !== capture.hash) {
      errors.push(`Screenshot image-read for ${capture.path} content hash does not match capture artifact`);
      continue;
    }
    if (!present(shotRead.dataBlobId) && !shotRead.imagePayload) {
      errors.push(`Screenshot image-read for ${capture.path} needs a nonempty dataBlobId or image payload indicator`);
    }
  }
  return errors;
}

export function validateArtQualityObservations(root: string, review: QualityReview): string[] {
  if(!artDirectionPolicy(root))return [];
  const errors:string[]=[];
  for(const criterion of ["content-fit","visual-concept","asset-craft","sequence-coherence","responsive-treatment","explanatory-clarity"]){
    const rows=review.artObservations?.filter(r=>r.criterion===criterion)||[];
    if(!rows.length){errors.push(`Art review missing ${criterion}`);continue;}
    for(const r of rows){
      if(!["satisfied","not-applicable"].includes(r.outcome)||![r.page,r.section,r.viewport,r.observation].every(present))errors.push(`Unresolved or unlocated art observation ${criterion}`);
      try{if(!r.capturePath.startsWith("agent/screenshots/")||!r.capturePath.endsWith(".png")||fileSha256(within(root,r.capturePath))!==r.captureSha256||!review.visualInspection.captureHashes.includes(r.captureSha256))errors.push(`Art observation has stale/uninspected capture ${criterion}`);}catch{errors.push(`Art observation capture missing ${criterion}`);}
    }
  }
  return errors;
}

export function validateQualityReview(root: string, opts?: { requirePass?: boolean; reviewPath?: string }): GradeResult & { review?: QualityReview; stale?: boolean; malformed?: boolean } {
  const errors: string[] = [];
  const path = opts?.reviewPath || join(root, "agent/reviews/representative-quality.json");
  let review: QualityReview | undefined;
  let stale = false;
  let malformed = false;
  try {
    review = json<QualityReview>(path);
    if (review.schemaVersion !== 1 || review.kind !== "design-quality") {
      malformed = true;
      errors.push("Design-quality review schema mismatch");
    }
    if (!["pass", "fail", "unknown"].includes(review.verdict || "")) {
      malformed = true;
      errors.push("Design-quality review needs a pass/fail/unknown verdict");
    }
    if (!present(review.reviewer)) errors.push("Quality review needs reviewer");
    const expected = qualitySubject(root);
    if (review.subjectHash !== expected) {
      stale = true;
      errors.push("Quality review missing current subjectHash");
    }
    if (!review.visualInspection?.available) errors.push("Visual judgment unavailable; cannot pass design quality");
    const probeHash = currentProbeHash(root) || "";
    const archivedLog = join(root, QUALITY_LOG_ARCHIVE_REL);
    const receiptKind = loadQualityReceipt(root).receipt?.kind;
    const logText = receiptKind === "quality-image-attachment-invocation"
      ? undefined
      : existsSync(archivedLog) ? readFileSync(archivedLog, "utf8") : undefined;
    const probe = evaluateVisualProbe({
      root,
      observedToken: review.visualInspection?.observedToken,
      probeHash: review.visualInspection?.probeHash || "",
      expectedProbeHash: probeHash,
      logText,
    });
    errors.push(...probe.failures);
    if (!present(review.visualInspection?.probeHash)) errors.push("Quality review needs probeHash");
    if (!Array.isArray(review.visualInspection?.captureHashes) || !review.visualInspection.captureHashes.length) {
      errors.push("Quality review needs captureHashes of inspected screenshots");
    }
    errors.push(...bindQualityEvidence(root, review));
    errors.push(...validateCompositionQualityObservations(root, review));
    errors.push(...validateArtQualityObservations(root, review));
    const names = (review.dimensions || []).map(d => d.name);
    for (const dim of QUALITY_DIMENSIONS) {
      if (!names.includes(dim)) errors.push(`Quality review missing dimension: ${dim}`);
    }
    if (new Set(names).size !== names.length) errors.push("Quality dimensions must be unique");
    for (const dim of review.dimensions || []) {
      if (![0, 1, 2, 3, 4].includes(dim.score)) errors.push(`Invalid score for ${dim.name}`);
      if (!present(dim.page) || !present(dim.viewport) || !present(dim.section) || !present(dim.evidence)) {
        errors.push(`Dimension ${dim.name} needs page/viewport/section evidence`);
      }
      if (/premium|editorial|clean|modern/i.test(dim.evidence) && dim.evidence.trim().split(/\s+/).length < 8) {
        errors.push(`Dimension ${dim.name} uses generic praise without concrete evidence`);
      }
      if (dim.score < QUALITY_FLOOR) errors.push(`${dim.name} below quality floor (${dim.score})`);
      if ((QUALITY_MUST_REACH as readonly string[]).includes(dim.name) && dim.score < QUALITY_MUST_SCORE) {
        errors.push(`${dim.name} must reach ${QUALITY_MUST_SCORE}`);
      }
    }
    const hard = (review.findings || []).filter(f => f.severity === "blocker");
    for (const finding of review.findings || []) {
      for (const key of ["id", "page", "section", "evidence", "problem", "repair", "target", "verify"] as const) {
        if (!present(finding[key])) errors.push(`Quality finding missing ${key}`);
      }
    }
    if (hard.length) errors.push("Hard quality failure present");
    if (review.verdict === "unknown") errors.push("Quality verdict is unknown");
    if (review.verdict === "pass" && errors.length) errors.push("Pass cannot accompany quality contract failures");
    if (opts?.requirePass !== false && review.verdict !== "pass") errors.push(`Quality verdict: ${review.verdict}`);
  } catch (error) {
    malformed = true;
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { node: "representative-quality", ok: errors.length === 0, failures: errors, review, stale, malformed };
}

export function sketchesAreNotRepresentatives(root: string): string[] {
  const errors: string[] = [];
  if (!existsSync(join(root, "dist/index.html")) || !existsSync(join(root, "pages/index.html"))) {
    errors.push("Production-compiled homepage is required; private sketches are not finished variants");
  }
  const storyboardPath = join(root, "onboarding/storyboard.json");
  if (existsSync(storyboardPath)) {
    const plan = json<{ pages?: { path: string; representative?: boolean }[] }>(storyboardPath);
    const interior = (plan.pages || []).find(p => p.path !== "/" && p.representative);
    if (!interior) errors.push("Quality-approved representative needs a designated interior page");
    else {
      const path = interior.path === "/" ? "pages/index.html" : `pages${interior.path}.html`;
      const alt = `pages${interior.path}/index.html`;
      const dist = join(root, "dist", interior.path === "/" ? "index.html" : `${interior.path.replace(/^\//, "")}/index.html`);
      if (!existsSync(within(root, path)) && !existsSync(within(root, alt))) errors.push(`Missing production interior source: ${interior.path}`);
      if (!existsSync(dist)) errors.push(`Missing compiled interior: ${interior.path}`);
    }
  }
  return errors;
}

export function packIdentity(kernel: string): string {
  return sha256(JSON.stringify({ pack: calibrationPackHash(kernel), probe: PROBE_TOKEN, packDir: calibrationPackDir(kernel) }));
}

export function imageReadLogLine(opts: { path: string; dataBlobId?: string; hash?: string; mimeType?: string; image?: string }): string {
  return JSON.stringify({
    type: "tool_result",
    subtype: "success",
    name: "read",
    arguments: { path: opts.path },
    result: {
      path: opts.path,
      dataBlobId: opts.dataBlobId,
      mimeType: opts.mimeType || "image/png",
      hash: opts.hash || "",
      image: opts.image,
    },
  });
}

export function writePassingQualityArtifacts(root: string, opts?: { observedToken?: string }): QualityReview {
  const probe = existsSync(join(root, QUALITY_PROBE_REL))
    ? { path: join(root, QUALITY_PROBE_REL), hash: fileSha256(join(root, QUALITY_PROBE_REL)), token: PROBE_TOKEN }
    : writeVisualProbe(join(root, "agent/reviews"));
  const captures = representativeCaptureHashes(root);
  const lines = [
    imageReadLogLine({ path: QUALITY_PROBE_REL, dataBlobId: "blob-probe", hash: probe.hash }),
    ...captures.map((capture, i) => imageReadLogLine({ path: capture.path, dataBlobId: `blob-shot-${i}`, hash: capture.hash })),
  ];
  mkdirSync(join(root, "agent/runs"), { recursive: true });
  const sourceLog = join(root, "agent/runs/quality-seed.log");
  writeFileSync(sourceLog, lines.join("\n") + "\n");
  archiveQualityInvocation(root, sourceLog);
  const review: QualityReview = {
    schemaVersion: 1,
    kind: "design-quality",
    subjectHash: qualitySubject(root),
    identities: { source: fingerprint(root, ["pages"]) },
    verdict: "pass",
    reviewer: "stub",
    visualInspection: {
      available: true,
      probeHash: probe.hash,
      observedToken: opts?.observedToken || PROBE_TOKEN,
      captureHashes: captures.map(c => c.hash),
      toolReads: [],
    },
    dimensions: QUALITY_DIMENSIONS.map(name => ({
      name,
      score: 3,
      page: "/",
      viewport: "1080",
      section: "hero",
      evidence: `Observed ${name} on the homepage hero at 1080 with the roof photograph and estimate action`,
    })),
    findings: [],
  };
  save(join(root, "agent/reviews/representative-quality.json"), review);
  return review;
}
