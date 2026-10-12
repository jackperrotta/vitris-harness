import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, lstatSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const REPLACE_CODES = new Set(["EPERM", "EEXIST", "EACCES", "EBUSY"]);

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export type ReplacementJournal = {
  schemaVersion: 1;
  stage: "staged" | "committed" | "rolled_back";
  from: string;
  to: string;
  backup?: string;
  pid: number;
  createdAt: string;
  isDirectory: boolean;
};

export function isPidDead(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

/** Acquire exclusive writer lock for target path. */
export function acquirePathLock(targetPath: string, timeoutMs = 5000): () => void {
  const dir = dirname(targetPath);
  mkdirSync(dir, { recursive: true });
  const lockFile = join(dir, `.${basename(targetPath)}.wlock`);
  const started = Date.now();
  while (true) {
    try {
      const fd = openSync(lockFile, "wx");
      writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
      closeSync(fd);
      return () => {
        try { unlinkSync(lockFile); } catch { /* ignore */ }
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw err;
      try {
        const info = JSON.parse(readFileSync(lockFile, "utf8")) as { pid?: number; createdAt?: number };
        if (info.pid && isPidDead(info.pid)) {
          try { unlinkSync(lockFile); } catch {}
          continue;
        }
      } catch {
        // If the file exists but is corrupt and unparseable, clean it up
        try {
          const content = readFileSync(lockFile, "utf8");
          if (content.length > 0 && (!content.includes("pid") || !content.startsWith("{"))) {
            unlinkSync(lockFile);
            continue;
          }
        } catch {}
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timeout waiting for path lock: ${targetPath}`);
      }
      sleepSync(25);
    }
  }
}

/**
 * Recoverable file/directory replacement with transaction journal.
 * Preserves target backup and transaction metadata so failures can roll back cleanly
 * or be recovered on startup.
 */
export function recoverableReplace(from: string, to: string): void {
  if (!existsSync(from)) throw new Error(`Source path does not exist: ${from}`);
  const unlock = acquirePathLock(to);
  const journalPath = `${to}.journal.json`;
  const isDir = lstatSync(from).isDirectory();
  let backupPath: string | undefined;

  try {
    const toExists = existsSync(to);
    if (toExists) {
      backupPath = `${to}.bak.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}`;
      const journal: ReplacementJournal = {
        schemaVersion: 1,
        stage: "staged",
        from,
        to,
        backup: backupPath,
        pid: process.pid,
        createdAt: new Date().toISOString(),
        isDirectory: isDir,
      };
      writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
      renameWithRetry(to, backupPath);
      journal.stage = "committed";
      writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
    } else {
      const journal: ReplacementJournal = {
        schemaVersion: 1,
        stage: "committed",
        from,
        to,
        pid: process.pid,
        createdAt: new Date().toISOString(),
        isDirectory: isDir,
      };
      writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
    }

    try {
      renameWithRetry(from, to);
    } catch (renameErr) {
      if (backupPath && existsSync(backupPath)) {
        try {
          renameWithRetry(backupPath, to);
          try { unlinkSync(journalPath); } catch { /* ignore */ }
        } catch (rollbackErr) {
          throw new Error(`Replacement failed and rollback failed: ${renameErr}; rollback error: ${rollbackErr}`);
        }
      }
      throw renameErr;
    }

    if (backupPath && existsSync(backupPath)) {
      try {
        if (lstatSync(backupPath).isDirectory()) rmSync(backupPath, { recursive: true, force: true });
        else unlinkSync(backupPath);
      } catch { /* cleanStaleTmp will reclaim if locked */ }
    }
    try { unlinkSync(journalPath); } catch { /* ignore */ }
  } finally {
    unlock();
  }
}

function renameWithRetry(from: string, to: string): void {
  try {
    renameSync(from, to);
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (!code || !REPLACE_CODES.has(code)) throw err;
  }
  const delays = [10, 25, 50, 100, 200, 400];
  let last: unknown;
  for (const delay of delays) {
    sleepSync(delay);
    try {
      renameSync(from, to);
      return;
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

/** Backwards-compatible alias for recoverableReplace. */
export function replacePath(from: string, to: string): void {
  recoverableReplace(from, to);
}

/** Recover pending transaction journals in a directory after a crash or interruption. */
export function recoverPendingTransactions(dir: string): void {
  if (!existsSync(dir) || !lstatSync(dir).isDirectory()) return;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".journal.json")) continue;
    const journalPath = join(dir, name);
    try {
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as ReplacementJournal;
      if (journal.stage === "committed") {
        if (existsSync(journal.from) && !existsSync(journal.to)) {
          renameSync(journal.from, journal.to);
        }
        if (journal.backup && existsSync(journal.backup)) {
          if (lstatSync(journal.backup).isDirectory()) rmSync(journal.backup, { recursive: true, force: true });
          else unlinkSync(journal.backup);
        }
        unlinkSync(journalPath);
      } else if (journal.stage === "staged") {
        if (journal.backup && existsSync(journal.backup) && !existsSync(journal.to)) {
          renameSync(journal.backup, journal.to);
        }
        if (existsSync(journal.from)) {
          if (lstatSync(journal.from).isDirectory()) rmSync(journal.from, { recursive: true, force: true });
          else unlinkSync(journal.from);
        }
        unlinkSync(journalPath);
      }
    } catch { /* leave for next inspection */ }
  }
}

export function cleanStaleTmp(path: string, maxAgeMs = 300000): void {
  const dir = dirname(path);
  if (!existsSync(dir)) return;
  const base = basename(path);
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(base) || !name.includes(".tmp.")) continue;
    const full = join(dir, name);
    try {
      const stat = lstatSync(full);
      const parts = name.split(".");
      // format: <basename>.tmp.<pid>.<timestamp>.<uuid>
      const pidIndex = parts.indexOf("tmp") + 1;
      const pid = Number(parts[pidIndex]);
      const timestamp = Number(parts[pidIndex + 1]);
      const age = Date.now() - (timestamp || stat.mtimeMs);
      if (age < maxAgeMs) continue; // Not stale yet
      if (pid && !isPidDead(pid)) continue; // Process still active
      if (stat.isDirectory()) rmSync(full, { recursive: true, force: true });
      else unlinkSync(full);
    } catch { /* still locked or removed */ }
  }
}

export function within(root: string, path: string): string {
  const base = resolve(root), target = resolve(base, path);
  if (target !== base && !target.startsWith(base + sep)) throw new Error(`Path escapes site: ${path}`);
  let cursor = target;
  while (cursor !== base) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink not allowed in artifact: ${path}`);
    cursor = dirname(cursor);
  }
  return target;
}
export function files(root: string): string[] {
  if (!existsSync(root)) return [];
  if (lstatSync(root).isSymbolicLink()) throw new Error(`Symlink not allowed: ${root}`);
  if (!lstatSync(root).isDirectory()) return [root];
  return readdirSync(root).sort().flatMap(name => files(join(root, name)));
}
export function json<T = Record<string, unknown>>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
export function save(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}`;
  writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n");
  recoverableReplace(temporary, path);
  cleanStaleTmp(path);
}
export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
export function fingerprint(root: string, paths: string[], sources: Record<string, string> = {}): string {
  const hash = createHash("sha256");
  for (const path of [...new Set(paths)].sort()) {
    const target = within(root, sources[path] || path);
    hash.update(path + "\0");
    if (!existsSync(target)) hash.update("MISSING");
    for (const file of files(target)) hash.update(relative(root, file).replaceAll("\\", "/") + "\0").update(readFileSync(file));
  }
  return hash.digest("hex");
}
export const SOURCE_PATHS = ["pages", "components", "theme", "site.json", "media", "public"];
export const sourceHash = (root: string) => fingerprint(root, SOURCE_PATHS);
export const STUDY_CAPTURE_VIEWPORTS = [375, 1080] as const;
export const STUDY_CAPTURE_HEIGHT = 900;

export type Evidence = { id: string; source: string; excerpt: string };
export type Business = {
  version: 2; offer: string; audience: string; trigger: string; outcome: string;
  includes: string[]; engagement: string; positioning: string;
  facts: { id: string; claim: string; evidence: string[] }[];
  evidence: Evidence[]; uncertainties: { question: string; blocking: boolean; resolution?: string }[];
};
export type MediaInventory = {
  version: 2; harvestHash: string;
  unavailable?: { source: string; reason: string; resolution: "unresolved" | "unavailable" | "excluded"; evidence: string }[];
  assets: { id: string; path: string; sources: string[]; description: string; role: string;
    disposition: "use" | "retain" | "duplicate" | "exclude" | "unresolved";
    reason: string; inspected: boolean; placements: string[]; duplicateOf?: string;
    origin?: "customer" | "stock" | "authored" | "unknown";
    provenance?: { sourceUrl: string; termsUrl: string; credit: string; acquiredAt?: string; query?: string; originalSha256: string };
    production?: { method: "generated-raster" | "authored-vector" | "derived"; operationId: string; requestId: string;
      sourcePath: string; sourceSha256: string; prompt?: string; tool: string; model?: string;
      parents: { assetId: string; path: string; sha256: string; origin: "customer" | "stock" | "authored" | "unknown" }[];
      rights: string; forbiddenImplications: string[] };
    identity?: "logo" | "founder" | "team" | "product" | "premises" | "project" | "brand-art" | "none" | "uncertain";
    identityEvidence?: string[]; identityDecision?: string;
    sha256?: string; stockId?: string; kind?: "image" | "video";
    width?: number; height?: number; duration?: number; poster?: string; posterSha256?: string;
    inspection?: import("../stock/types.ts").MediaInspection }[];
};
export type MotionPlan = {
  version: 1 | 2; purpose: string; quiet: string[];
  /** V2 covers authored routes, including expansion and short/contact pages. */
  routes?: { route: string; task: string; character: string; normal: string; mobile: string; reduced: string;
    ending: string; available: string[];
    beats: { sectionId: string; role: "opening" | "development" | "closing" | "whole";
      change: string; scenes: string[]; connects?: [string, string]; transition: string }[] }[];
  character?: string; decision?: "motion" | "static"; revisionReason?: string;
  scenes: { route: string; targetId: string; triggerId: string;
    effect: import("../compile/scroll-motion.ts").MotionEffect;
    timing: { duration?: number; delay?: number; stagger?: number };
    mobile: "same" | "static"; reduced: "static"; reason: string;
    factRef?: string; sourceFact?: string; finalText?: string; treatment?: "phrase" | "mask" }[];
};
export type DirectionDecisionKind = "typography" | "composition" | "media" | "navigation" | "interaction" | "density" | "surface";
export type DirectionDecision = {
  id: string;
  kind: DirectionDecisionKind;
  choice: string;
  rationale: string;
  scope: string;
  tradeoff: string;
};
export type Direction = {
  motionPlan?: MotionPlan;
  version: 2; businessHash: string; request: string;
  candidates: { id: string; rationale: string; typography: string; composition: string; mediaTreatment: string }[];
  selected: string; rationale: string;
  system: { personality: string; typography: string; colorRoles: string; density: string; rhythm: string;
    mediaTreatment: string; surfaces: string; navigation: string; motifs: string; interiors: string; avoid: string[] };
  studies: { candidate: string; path: string; screenshot?: string }[];
  /** Version 1 design-decision trail. Absent on legacy directions, which stay readable and fail current gates. */
  designContractVersion?: 1;
  centralIdea?: string;
  opportunityIds?: string[];
  decisions?: DirectionDecision[];
  rejectedAlternatives?: { id: string; summary: string }[];
  identityInvariants?: string[];
  flexibleDecisions?: string[];
};
export type StoryboardSection = {
  id: string; question: string; message: string; facts: string[]; media: string[];
  action: { label: string; destination: string; behavior: string } | null;
  composition: string; emphasis: string; transition: string;
  role?: string;
  purpose?: string;
  opportunityIds?: string[];
  decisionIds?: string[];
  emphasisReason?: string;
  layoutFamily?: string;
  density?: string;
  mediaProminence?: string;
  interaction?: string;
  repetitionRationale?: string;
  mobileTransformation?: string;
  elementPlan?: PlannedElement[];
  relationships?: ElementRelationship[];
  lessonApplications?: LessonApplication[];
  renderObservations?: RenderObservation[];
};
export type ContentRef =
  | { kind: "fact" | "media" | "copy"; id: string }
  | { kind: "section-message" | "section-action"; sectionId: string };
export type PlannedElement = { id: string; role: string; contentRefs: ContentRef[] };
export type ElementRelationship = {
  from: string; to: string;
  kind: "groups-with" | "supports" | "compares-with" | "annotates" | "precedes" | "aligns-with" | "other";
  intent: string;
};
export type LessonApplication = { id: string; version: number; contentHash: string; decision: "apply" | "adapt" | "decline"; reason: string; elementIds: string[] };
export type RenderObservation = { id: string; elementIds: string[]; viewportClass: "all" | "narrow" | "wide"; state: string; expectation: string; verification: "visual" | "browser" | "content" };
export type Storyboard = {
  motionPlan?: MotionPlan;
  version: 2 | 3; businessHash: string; directionHash: string;
  /** Version 3 explicitly locates brand media shared across routes. */
  globalMedia?: { assetId: string; placement: "header" | "footer"; routes: string[]; reason: string }[];
  designContractVersion?: 1;
  compositionContractVersion?: 1;
  compositionLessonRelease?: string;
  routes: { source: string; disposition: "preserve" | "redirect" | "consolidate" | "retire"; target?: string; reason: string }[];
  pages: { path: string; purpose: string; representative: boolean;
    role?: string;
    visitorOutcome?: string;
    compositionIntent?: { organizingRelationship: string; readingSequence: string[]; crossSectionRelationships?: ElementRelationship[] };
    sections: StoryboardSection[] }[];
};
export type Finding = { id: string; page: string; section: string; evidence: string;
  severity: "blocker" | "major" | "minor"; problem: string; repair: string; target: string; verify: string;
  viewport?: string;
  consequence?: string;
  preservation?: string;
};
export type Review = {
  motionJourneys?: {route:string;checks:{criterion:string;verdict:"pass"|"fail"|"unknown";evidence:string;checkpoints:string[]}[]}[];
  version: 2; subjectHash: string; verdict: "pass" | "fail" | "unknown";
  reviewer: string; evidence: string[];
  checks: { criterion: string; verdict: "pass" | "fail" | "unknown"; evidence: string }[];
  findings: Finding[];
  partitions?: string[];
  dispositions?: CriticDisposition[];
};
export type CriticDisposition = {
  findingId: string;
  subjectHash: string;
  disposition: "fixed" | "disagree_with_evidence" | "accepted_risk";
  rationale: string;
  evidence: string;
};
export type ParentDiversityIdentities = {
  directions: string;
  studies: string;
  assets: string;
  renders: string;
  viewports: string;
  refs: string;
};
export type ParentDiversityReview = {
  schemaVersion: 1;
  kind: "direction-diversity";
  runId: string;
  verdict: "pass" | "fail" | "unknown";
  subjectHash: string;
  reviewer: string;
  identities: ParentDiversityIdentities;
  evidence: string[];
  axes: { name: string; evidence: string }[];
  candidates: { id: string; observation: string; findings: Finding[] }[];
  findings: Finding[];
  repair?: { directionId: string; reason: string; targets: string[] };
  unresolvedSimilarity?: string;
  selected?: string;
};
export type DesignOpportunityBasis = "evidence-backed" | "design-hypothesis";
export type DesignOpportunity = {
  id: string;
  visitorNeed: string;
  businessRelevance: string;
  evidenceIds: string[];
  mediaIds: string[];
  presentationOpportunity: string;
  constraints: string[];
  basis: DesignOpportunityBasis;
  uncertainty?: string;
};
export type NarrativeBrief = {
  /** 1 is legacy and inspectable. 2 is the current business-to-design contract. */
  schemaVersion: 1 | 2;
  businessHash: string;
  mediaHash: string;
  customer: string;
  problem: string;
  offer: string;
  serviceScope: string;
  proof: { statement: string; evidenceIds: string[]; status?: "strong" | "limited" | "missing" };
  conversion: string;
  objections: { claim: string; evidenceIds: string[] }[];
  unsupportedClaims: string[];
  facts: { id: string; claim: string; evidenceIds: string[] }[];
  visitorQuestions?: { id: string; question: string; relationshipToConversion: string; priority: number }[];
  assetNotes?: { mediaId?: string; strength: string; limitation?: string }[];
  toneConstraints?: string[];
  recordedUserGoals?: string[];
  designOpportunities?: DesignOpportunity[];
};
export type TeachingPrincipleRef = {
  id: string;
  version: number;
  contentHash: string;
  reason: string;
};
export type ReferenceAnalysis = {
  /** Opt-in inspiration corpus; delivery and actual visual inspection remain separate. */
  referenceSelection?: {
    release: string; manifestHash: string; catalogHash: string; inputSignalHash: string;
    selectorVersion?: string; acceptedAt?: string;
    selected: { id: string; revision: number; reason: string }[];
    teachingManifestHash?: string;
    teachingSelected?: { id: string; revision: number; reason: string }[];
    inspectedEvidence: { id: string; revision: number; route: string; viewport: { width: number; height: number }; evidencePointer: string; observed: string;
      kind?: "retained-capture" | "live-only" | "accessible-session"; inspectedAt?: string; sourceRevision?: number; sessionId?: string; capture?: { path: string; sha256: string } }[];
    plannedRelationships: { homepage: string; interior: string; mobile: string; action: string };
  };
  schemaVersion: 1;
  packVersion: string;
  packHash: string;
  narrativeHash: string;
  applicable: { principle: string; why: string; evidencePaths: string[] }[];
  avoided: { principle: string; why: string }[];
  plannedApplication: { homepage: string; interior: string };
  /** Inspected calibration-pack paths. Not teaching-lesson files. */
  evidencePaths: string[];
  /** Selected built-in lessons. Distinct from inspected visual evidence. */
  teachingPrinciples?: TeachingPrincipleRef[];
};
export const QUALITY_DIMENSIONS = [
  "business-specificity",
  "composition",
  "typography",
  "media-integration",
  "brand-coherence",
  "copy-design-integration",
  "responsive-craft",
] as const;
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];
export type QualityReview = {
  schemaVersion: 1;
  kind: "design-quality";
  subjectHash: string;
  identities: Record<string, string>;
  verdict: "pass" | "fail" | "unknown";
  reviewer: string;
  visualInspection: {
    available: boolean;
    probeHash: string;
    observedToken: string;
    captureHashes: string[];
    toolReads: { path: string; hash: string; dataBlobId?: string }[];
  };
  dimensions: {
    name: QualityDimension;
    score: 0 | 1 | 2 | 3 | 4;
    page: string;
    viewport: string;
    section: string;
    evidence: string;
  }[];
  findings: Finding[];
  compositionReviewVersion?: 1;
  artObservations?: { criterion: "content-fit" | "visual-concept" | "asset-craft" | "sequence-coherence" | "responsive-treatment" | "explanatory-clarity"; outcome: "satisfied" | "problem" | "unknown" | "not-applicable"; page: string; section: string; viewport: string; capturePath: string; captureSha256: string; observation: string }[];
  compositionObservations?: {
    observationId: string; page: string; sectionIds: string[]; elementIds: string[];
    viewport: string; state: string; captureHashes: string[]; observed: string;
    outcome: "satisfied" | "problem" | "unknown" | "not-applicable";
    consequence?: string; findingId?: string;
  }[];
  repair?: { reason: string; targets: string[] };
};
export type UsageReceipt = {
  schemaVersion: 1;
  adapter: string;
  model?: string;
  role: "author" | "reviewer" | "tool" | "unknown";
  nodeId: string;
  startedAt: string;
  durationMs: number;
  status: "ok" | "failed" | "interrupted" | "unknown";
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cache?: Record<string, unknown>;
    unknown: boolean;
    lowerBound?: boolean;
  };
  providerRaw?: Record<string, unknown>;
};
export type ThemeScope = "one" | "all";
