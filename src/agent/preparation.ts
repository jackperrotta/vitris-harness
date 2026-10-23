import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fingerprint, json, save, SOURCE_PATHS } from "./artifacts.ts";
import { isPreviewReady, type AgentState, type GraphNode, type SkillGraph } from "./graph.ts";
import { reviewSubject } from "./evaluate.ts";
import { CAPTURE_PATHS, PROTECTED_SOURCE_PATHS } from "./workflow.ts";
import { isPathConfined } from "./jev/security.ts";
import { mergeImplementationReason, restoreUnchangedLayout } from "./refine.ts";
import { checkpointDependency } from './adaptation-checkpoint.ts';

export const PREPARATION_SCHEMA_VERSION = 1;
export const DEFAULT_LEASE_DURATION_MS = 300000; // 5 minutes
export const DEFAULT_MUTATION_LOCK_TIMEOUT_MS = 5000; // 5 seconds for fast in-process mutations

export interface FileInventoryEntry {
  size: number;
  mtimeMs: number;
  hash: string;
}

export interface StagePreparation {
  schemaVersion: 1;
  id: string;
  nodeId: string;
  runId: string;
  ownerToken: string;
  leaseExpiresAt: string;
  graphVersion: number;
  contractVersion: string;
  nodeContractHash?: string;
  immutableDependencies: string[];
  immutableHash: string;
  editableInputs: string[];
  expectedOutputs: string[];
  protectedSourceFingerprint: string;
  captureFingerprint: string;
  reviewSubjectHash?: string;
  baselineInventory: Record<string, FileInventoryEntry>;
  packetHash: string;
  manifestHash?: string;
  promptHash?: string;
  overflowHash?: string;
  attempt: number;
  status: "prepared" | "consumed" | "canceled" | "invalidated";
  preparedAt: string;
  consumedAt?: string;
  manifestId?: string;
  authoringPolicy?: { mode: string; lessonRelease: string | null; hash: string };
  mediaAuditSnapshot?: string;
  capabilitiesSnapshot?: Record<string, string>;
  ownershipSnapshot?: {
    workOwnership: string;
    packetReduced: boolean;
    outcomes: Array<{
      taskId: string;
      eligible: boolean;
      reasons: string[];
      coveredObligationIds: string[];
    }>;
  };
  invalidationReason?: string;
  result?: { ok: boolean; failures: string[] };
  agentUsage?: { inputTokens?: number; outputTokens?: number; measured: boolean };
}

export interface ToolExecutionReceipt {
  nodeId: string;
  kind: "tool";
  command: string[];
  exitCode: number;
  durationMs: number;
  startedAt: string;
  failures: string[];
  outputPath: string;
}

export interface CommitJournalEntry {
  transactionId: string;
  preparationId: string;
  nodeId: string;
  phase: "intent" | "graded" | "state_written" | "consumed";
  preparationPath?: string;
  receiptPath?: string;
  statePath: string;
  targetState?: AgentState;
  updatedPreparation?: StagePreparation | ToolExecutionReceipt;
  createdAt: string;
  effects?: string[];
}

export interface LeaseRecord {
  leaseName: string;
  ownerToken: string;
  pid: number;
  acquiredAt: string;
  expiresAt: string;
}

/** Compute SHA-256 content hash of a file or string. */
export function sha256Hex(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Hash a file safely; returns empty string if unreadable. */
export function hashFileSafe(filePath: string): string {
  try {
    return sha256Hex(readFileSync(filePath));
  } catch {
    return "";
  }
}

/** Standard directories to snapshot for inventory checks. */
export const INVENTORY_ROOT_SCAN_DIRS = [
  "artwork",
  "pages",
  "components",
  "theme",
  "onboarding",
  "media",
  "dist",
  "agent",
  "public",
];

/** Standard top-level files to snapshot. */
export const INVENTORY_ROOT_SCAN_FILES = [
  "site.json",
  "package-lock.json",
  "AGENTS.md",
  "launch.json",
  "package.json",
  "wrangler.jsonc",
  "README.md",
];

/**
 * Snapshots repository file inventory across standard source, output, and agent directories.
 * Relative paths are normalized using forward slashes.
 */
export function snapshotInventory(root: string): Record<string, FileInventoryEntry> {
  const inventory: Record<string, FileInventoryEntry> = {};

  const scanFile = (relPath: string) => {
    const full = join(root, relPath);
    if (!existsSync(full)) return;
    try {
      const st = statSync(full);
      if (st.isFile()) {
        const normRel = relPath.replaceAll("\\", "/");
        inventory[normRel] = {
          size: st.size,
          mtimeMs: st.mtimeMs,
          hash: hashFileSafe(full),
        };
      }
    } catch {}
  };

  const scanDir = (dirRel: string) => {
    const full = join(root, dirRel);
    if (!existsSync(full)) return;
    try {
      const entries = readdirSync(full, { withFileTypes: true });
      for (const entry of entries) {
        const subRel = `${dirRel}/${entry.name}`;
        if (entry.isDirectory()) {
          // Skip deep temporary dirs or node_modules/.git
          if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".wrangler") continue;
          scanDir(subRel);
        } else if (entry.isFile()) {
          scanFile(subRel);
        }
      }
    } catch {}
  };

  for (const f of INVENTORY_ROOT_SCAN_FILES) scanFile(f);
  for (const d of INVENTORY_ROOT_SCAN_DIRS) scanDir(d);

  return inventory;
}

/** Standard authorized bookkeeping paths that any stage may write to. */
export const AUTHORIZED_BOOKKEEPING_PREFIXES = [
  "agent/CURRENT.md",
  "agent/STATE.json",
  "agent/preparations/",
  "agent/runs/",
  "agent/decisions/",
  "agent/run-history/",
  "agent/request-history/",
  "agent/leases/",
  "agent/.mutation.lock",
  "agent/.commit-journal.json",
  "agent/RUN.lock",
  "agent/result-manifest.json",
  "agent/preview-server.json",
  "agent/quality-attempts.json",
];

/**
 * Checks created, modified, and deleted files against allowed writes.
 * Preserves pre-existing dirty changes that were present in baseline.
 */
export function verifyAllowedWrites(opts: {
  root: string;
  node: GraphNode;
  baselineInventory: Record<string, FileInventoryEntry>;
  allowedWrites: string[];
}): {
  ok: boolean;
  violations: string[];
  modified: string[];
  created: string[];
  deleted: string[];
} {
  const currentInventory = snapshotInventory(opts.root);
  const baseline = opts.baselineInventory;
  const violations: string[] = [];
  const modified: string[] = [];
  const created: string[] = [];
  const deleted: string[] = [];

  const normalizedAllowed = opts.allowedWrites.map(p => p.replaceAll("\\", "/"));

  const isPathPermitted = (relPath: string): boolean => {
    const norm = relPath.replaceAll("\\", "/");
    // 1. Explicit declared writes (exact match or subdirectory prefix)
    for (const allowed of normalizedAllowed) {
      if (norm === allowed || norm.startsWith(`${allowed}/`)) return true;
    }
    // 2. Authorized kernel bookkeeping
    for (const book of AUTHORIZED_BOOKKEEPING_PREFIXES) {
      if (norm === book || (book.endsWith("/") && norm.startsWith(book))) return true;
    }
    // Coordinator telemetry changes while an objective is outstanding; creative outputs remain scoped.
    if (norm === "agent/creative-runs/CURRENT.json" || /^agent\/creative-runs\/creative-[a-z0-9-]+\/(manifest\.json|events\.jsonl|measurement\.json|experiment\.json)$/.test(norm)) return true;
    // 3. Critics may write to agent/reviews/<id>.json
    if (opts.node.id === "representative-quality" && [
      "agent/reviews/representative-quality.receipt.json",
      "agent/reviews/representative-quality.invocation.log",
    ].includes(norm)) return true;
    // 4. Browser tools may write screenshots
    if (opts.node.id.includes("browser") && norm.startsWith("agent/screenshots/")) return true;
    // 5. Stages instructed to build or inspect compiled pages may write generated dist/.
    if ((opts.node.id.includes("browser") || ["representative", "pages", "edit", "preview", "render-studies", "direction-render"].includes(opts.node.id)) && norm.startsWith("dist/")) return true;
    // 6. Harvest tool may write onboarding and harvest media
    if (opts.node.id === "harvest" && (norm.startsWith("onboarding/") || norm.startsWith("media/harvest/"))) return true;
    return false;
  };

  // Inspect modified or created files
  for (const [path, cur] of Object.entries(currentInventory)) {
    const base = baseline[path];
    if (!base) {
      // Newly created file
      created.push(path);
      if (!isPathPermitted(path)) {
        violations.push(`Unauthorized created file: ${path}`);
      }
    } else if (base.hash !== cur.hash) {
      // Modified file
      modified.push(path);
      if (!isPathPermitted(path)) {
        violations.push(`Unauthorized modified file: ${path}`);
      }
    }
  }

  // Inspect deleted files
  for (const path of Object.keys(baseline)) {
    if (!currentInventory[path]) {
      deleted.push(path);
      if (!isPathPermitted(path)) {
        violations.push(`Unauthorized deleted file: ${path}`);
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    modified,
    created,
    deleted,
  };
}

/** Check if process with PID is alive. */
export function isProcessAlive(pid: number): boolean {
  if (pid <= 0 || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** Short-lived filesystem mutation lock with token-safe release to prevent unlinking successor locks. */
export function acquireMutationLock(root: string, timeoutMs = DEFAULT_MUTATION_LOCK_TIMEOUT_MS): (() => void) & { release: () => void } {
  const lockPath = join(root, "agent/.mutation.lock");
  mkdirSync(join(root, "agent"), { recursive: true });
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (existsSync(lockPath)) {
      try {
        const content = JSON.parse(readFileSync(lockPath, "utf8"));
        const expired = content.expiresAt && Date.now() > content.expiresAt;
        const dead = content.pid && !isProcessAlive(content.pid);
        if (expired || dead) {
          try { unlinkSync(lockPath); } catch {}
        }
      } catch {
        try { unlinkSync(lockPath); } catch {}
      }
    }

    try {
      const fd = openSync(lockPath, "wx");
      const lockToken = randomUUID();
      const lockData = {
        pid: process.pid,
        lockToken,
        acquiredAt: Date.now(),
        expiresAt: Date.now() + 10000, // 10s auto-expire
      };
      writeFileSync(fd, JSON.stringify(lockData));
      closeSync(fd);

      let released = false;
      const releaseFn = () => {
        if (released) return;
        released = true;
        try {
          if (existsSync(lockPath)) {
            const current = JSON.parse(readFileSync(lockPath, "utf8"));
            if (current && current.lockToken === lockToken) {
              unlinkSync(lockPath);
            }
          }
        } catch {}
      };
      return Object.assign(releaseFn, { release: releaseFn });
    } catch {
      // Lock held by active process; back off briefly
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }

  throw new Error(`Timeout acquiring mutation lock on ${lockPath} after ${timeoutMs}ms`);
}

const activeLockDepths = new Map<string, number>();

/** Run a synchronous operation within a short-lived mutation lock, re-entrant within the same process. */
export function withMutationLock<T>(root: string, fn: () => T, timeoutMs?: number): T {
  const normRoot = resolve(root);
  const depth = activeLockDepths.get(normRoot) || 0;
  if (depth > 0) {
    activeLockDepths.set(normRoot, depth + 1);
    try {
      return fn();
    } finally {
      activeLockDepths.set(normRoot, depth);
    }
  }

  const release = acquireMutationLock(normRoot, timeoutMs);
  activeLockDepths.set(normRoot, 1);
  try {
    return fn();
  } finally {
    activeLockDepths.delete(normRoot);
    release();
  }
}

/** Run an asynchronous operation within a short-lived mutation lock, re-entrant within the same process. */
export async function withMutationLockAsync<T>(root: string, fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
  const normRoot = resolve(root);
  const depth = activeLockDepths.get(normRoot) || 0;
  if (depth > 0) {
    activeLockDepths.set(normRoot, depth + 1);
    try {
      return await fn();
    } finally {
      activeLockDepths.set(normRoot, depth);
    }
  }

  const release = acquireMutationLock(normRoot, timeoutMs);
  activeLockDepths.set(normRoot, 1);
  try {
    return await fn();
  } finally {
    activeLockDepths.delete(normRoot);
    release();
  }
}

/** Durable lease management for stage preparation and tool execution. */
export function acquireDurableLease(opts: {
  root: string;
  leaseName: string;
  durationMs?: number;
  isAgentStage?: boolean;
}): { token: string; release: () => void } {
  const leasesDir = join(opts.root, "agent/leases");
  mkdirSync(leasesDir, { recursive: true });
  const leasePath = join(leasesDir, `${opts.leaseName}.json`);
  const duration = opts.durationMs ?? DEFAULT_LEASE_DURATION_MS;
  const now = Date.now();

  return withMutationLock(opts.root, () => {
    if (existsSync(leasePath)) {
      try {
        const existing = JSON.parse(readFileSync(leasePath, "utf8")) as LeaseRecord;
        const isStage = opts.isAgentStage ?? opts.leaseName.startsWith("stage-");
        const isExpired = Date.now() > new Date(existing.expiresAt).getTime();
        // Agent stages survive CLI process exit; non-stage leases check PID liveness
        const isDead = !isStage && !isProcessAlive(existing.pid);
        if (!isExpired && !isDead) {
          throw new Error(`Active durable lease "${opts.leaseName}" held until ${existing.expiresAt}`);
        }
      } catch (err: any) {
        if (err.message.includes("Active durable lease")) throw err;
        // Corrupt or dead lease, safe to overwrite
      }
    }

    const token = randomUUID();
    const record: LeaseRecord = {
      leaseName: opts.leaseName,
      ownerToken: token,
      pid: process.pid,
      acquiredAt: new Date(now).toISOString(),
      expiresAt: new Date(now + duration).toISOString(),
    };
    writeFileSync(leasePath, JSON.stringify(record, null, 2), "utf8");

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      withMutationLock(opts.root, () => {
        try {
          if (existsSync(leasePath)) {
            const cur = JSON.parse(readFileSync(leasePath, "utf8")) as LeaseRecord;
            if (cur.ownerToken === token) unlinkSync(leasePath);
          }
        } catch {}
      });
    };

    return { token, release };
  });
}

/** Releases a durable lease safely if the token matches. */
export function releaseDurableLease(root: string, leaseName: string, ownerToken: string): void {
  const leasePath = join(root, "agent/leases", `${leaseName}.json`);
  withMutationLock(root, () => {
    try {
      if (existsSync(leasePath)) {
        const cur = JSON.parse(readFileSync(leasePath, "utf8")) as LeaseRecord;
        if (cur.ownerToken === ownerToken) unlinkSync(leasePath);
      }
    } catch {}
  });
}

/** Check if a durable lease is currently held by a live or unexpired owner. */
export function isDurableLeaseHeld(root: string, leaseName: string): boolean {
  const leasePath = join(root, "agent/leases", `${leaseName}.json`);
  if (!existsSync(leasePath)) return false;
  try {
    const cur = JSON.parse(readFileSync(leasePath, "utf8")) as LeaseRecord;
    const isStage = leaseName.startsWith("stage-") || leaseName === "workflow";
    const isExpired = Date.now() > new Date(cur.expiresAt).getTime();
    const isDead = !isStage && !isProcessAlive(cur.pid);
    return !isExpired && !isDead;
  } catch {
    return false;
  }
}

/** Check if any active stage lease is held across agent/leases. */
export function hasActiveStageLease(root: string): { held: boolean; leaseName?: string; expiresAt?: string; ownerToken?: string } {
  const leasesDir = join(root, "agent/leases");
  if (!existsSync(leasesDir)) return { held: false };
  try {
    const fileList = readdirSync(leasesDir).filter(f => f.endsWith(".json"));
    for (const f of fileList) {
      try {
        const cur = JSON.parse(readFileSync(join(leasesDir, f), "utf8")) as LeaseRecord;
        // Serializes coordinator invocations, which intentionally prepare a stage inside this lease.
        if (cur.leaseName === "creative-coordinator") continue;
        const isStage = cur.leaseName.startsWith("stage-") || cur.leaseName === "workflow";
        if (cur.leaseName.startsWith("stage-")) {
          const nodeName = cur.leaseName.slice(6);
          const statePath = join(root, "agent/STATE.json");
          if (existsSync(statePath)) {
            try {
              const state = JSON.parse(readFileSync(statePath, "utf8"));
              if (state.nodes && state.nodes[nodeName]?.status === "done") {
                try { unlinkSync(join(leasesDir, f)); } catch {}
                continue;
              }
            } catch {}
          }
        }
        const isExpired = Date.now() > new Date(cur.expiresAt).getTime();
        const isDead = !isStage && !isProcessAlive(cur.pid);
        if (!isExpired && !isDead) {
          return { held: true, leaseName: cur.leaseName, expiresAt: cur.expiresAt, ownerToken: cur.ownerToken };
        }
      } catch {}
    }
  } catch {}
  return { held: false };
}

/** Enforces global outstanding-stage exclusion: no two active stage preparations at once. */
export function checkGlobalStageExclusion(root: string, targetNodeId: string): void {
  const activeLease = hasActiveStageLease(root);
  if (activeLease.held && activeLease.leaseName && activeLease.leaseName !== `stage-${targetNodeId}`) {
    throw new Error(`Another stage lease "${activeLease.leaseName}" is currently active until ${activeLease.expiresAt}. Complete or cancel it before preparing "${targetNodeId}".`);
  }
  if (activeLease.held && activeLease.leaseName && activeLease.leaseName === `stage-${targetNodeId}`) {
    const activePrep = findActivePreparation(root, targetNodeId);
    if (!activePrep) {
      try { unlinkSync(join(root, "agent/leases", `${activeLease.leaseName}.json`)); } catch {}
    }
  }
  const prepsDir = join(root, "agent/preparations");
  if (existsSync(prepsDir)) {
    const prepFiles = readdirSync(prepsDir).filter(f => f.endsWith(".json") && !f.includes(".tmp."));
    for (const pf of prepFiles) {
      try {
        const prep = JSON.parse(readFileSync(join(prepsDir, pf), "utf8")) as StagePreparation;
        if (prep.status === "prepared" && prep.nodeId !== targetNodeId) {
          const statePath = join(root, "agent/STATE.json");
          if (existsSync(statePath)) {
            try {
              const state = JSON.parse(readFileSync(statePath, "utf8"));
              if (state.nodes && state.nodes[prep.nodeId]?.status === "done") {
                prep.status = "consumed";
                prep.consumedAt = new Date().toISOString();
                writeFileSync(join(prepsDir, pf), JSON.stringify(prep, null, 2), "utf8");
                continue;
              }
            } catch {}
          }
          const isExpired = Date.now() > new Date(prep.leaseExpiresAt).getTime();
          if (!isExpired) {
            throw new Error(`Stage "${prep.nodeId}" has active preparation (${prep.id}) until ${prep.leaseExpiresAt}. Complete or cancel it before preparing "${targetNodeId}".`);
          }
        }
      } catch (err: any) {
        if (err.message && err.message.includes("has active preparation")) throw err;
      }
    }
  }
}

/** Commit Journal Operations for Crash-Safe State Transitions. */

export function writeCommitJournal(root: string, entry: CommitJournalEntry): void {
  const journalPath = join(root, "agent/.commit-journal.json");
  mkdirSync(join(root, "agent"), { recursive: true });
  const tmpPath = `${journalPath}.tmp.${randomUUID()}`;
  writeFileSync(tmpPath, JSON.stringify(entry, null, 2), "utf8");
  renameSync(tmpPath, journalPath);
}

export function updateCommitJournalPhase(root: string, phase: "state_written" | "consumed"): void {
  const journalPath = join(root, "agent/.commit-journal.json");
  if (!existsSync(journalPath)) return;
  const cur = JSON.parse(readFileSync(journalPath, "utf8")) as CommitJournalEntry;
  cur.phase = phase;
  const tmpPath = `${journalPath}.tmp.${randomUUID()}`;
  writeFileSync(tmpPath, JSON.stringify(cur, null, 2), "utf8");
  renameSync(tmpPath, journalPath);
}

export function clearCommitJournal(root: string): void {
  const journalPath = join(root, "agent/.commit-journal.json");
  if (existsSync(journalPath)) {
    try { unlinkSync(journalPath); } catch {}
  }
}

/**
 * Recovers an uncommitted or interrupted transaction from agent/.commit-journal.json.
 * Guarantees crash safety across STATE.json, preparations, receipts, and side-effects.
 */
export function recoverCommitJournal(root: string, graph: SkillGraph): { recovered: boolean; transactionId?: string; phase?: string; targetState?: AgentState } {
  const journalPath = join(root, "agent/.commit-journal.json");
  if (!existsSync(journalPath)) return { recovered: false };

  return withMutationLock(root, () => {
    if (!existsSync(journalPath)) return { recovered: false };
    let entry: CommitJournalEntry;
    try {
      entry = JSON.parse(readFileSync(journalPath, "utf8"));
    } catch {
      // Corrupt journal: clear
      try { unlinkSync(journalPath); } catch {}
      return { recovered: false };
    }

    if (entry.phase === "intent") {
      // Interrupted during tool execution before grading: count attempt toward budget and write uniform failure receipt
      let recoveredTargetState: AgentState | undefined;
      if (entry.statePath && existsSync(entry.statePath)) {
        try {
          const curState = JSON.parse(readFileSync(entry.statePath, "utf8")) as AgentState;
          if (curState.nodes && curState.nodes[entry.nodeId]) {
            const st = curState.nodes[entry.nodeId]!;
            st.status = "failed";
            st.attempts = (st.attempts || 0) + 1;
            st.failures = ["Tool execution interrupted by process restart"];
            curState.current = null;
            curState.status = "needs_repair";
            save(entry.statePath, curState);
            recoveredTargetState = curState;
          }
        } catch {}
      }
      if (entry.receiptPath) {
        const failureReceipt = {
          nodeId: entry.nodeId,
          kind: "tool",
          command: [],
          exitCode: 1,
          durationMs: 0,
          startedAt: entry.createdAt || new Date().toISOString(),
          failures: ["Tool execution interrupted by process restart"],
        };
        save(entry.receiptPath, failureReceipt);
      }
      clearCommitJournal(root);
      return { recovered: true, transactionId: entry.transactionId, phase: entry.phase, targetState: recoveredTargetState };
    }

    // Step recovery
    if (entry.phase === "state_written" || entry.phase === "graded" || entry.phase === "consumed") {
      // Ensure STATE.json reflects targetState
      if (entry.statePath && entry.targetState) {
        save(entry.statePath, entry.targetState);
      }
      // Ensure preparation/receipt record reflects consumed state
      if (entry.preparationPath && entry.updatedPreparation) {
        save(entry.preparationPath, entry.updatedPreparation);
      }
      if (entry.receiptPath && entry.updatedPreparation) {
        save(entry.receiptPath, entry.updatedPreparation);
      }

      // Replay post-commit side-effects
      if (entry.effects && entry.effects.length > 0 && entry.targetState) {
        if (entry.effects.includes("merge_implementation_reason")) {
          try { mergeImplementationReason(root, entry.nodeId); } catch {}
        }
        if (entry.effects.includes("restore_unchanged_layout")) {
          try {
            if (restoreUnchangedLayout(root, entry.targetState)) {
              entry.targetState.preview_ready = isPreviewReady(graph, entry.targetState);
              if (entry.statePath) save(entry.statePath, entry.targetState);
            }
          } catch {}
        }
      }

      clearCommitJournal(root);
      return { recovered: true, transactionId: entry.transactionId, phase: entry.phase, targetState: entry.targetState };
    }

    clearCommitJournal(root);
    return { recovered: false };
  });
}

/** Preparation Record I/O */

export function preparationPathForId(root: string, id: string): string {
  return join(root, "agent/preparations", `${id}.json`);
}

export function savePreparation(root: string, prep: StagePreparation): string {
  const dir = join(root, "agent/preparations");
  mkdirSync(dir, { recursive: true });
  const p = preparationPathForId(root, prep.id);
  const tmp = `${p}.tmp.${randomUUID()}`;
  writeFileSync(tmp, JSON.stringify(prep, null, 2), "utf8");
  renameSync(tmp, p);
  return p;
}

export function loadPreparation(root: string, id: string): StagePreparation | undefined {
  const p = preparationPathForId(root, id);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as StagePreparation;
  } catch {
    return undefined;
  }
}

export function findActivePreparation(root: string, nodeId: string): StagePreparation | undefined {
  const dir = join(root, "agent/preparations");
  if (!existsSync(dir)) return undefined;
  try {
    const files = readdirSync(dir).filter(f => f.endsWith(".json") && !f.includes(".tmp."));
    for (const f of files) {
      try {
        const prep = JSON.parse(readFileSync(join(dir, f), "utf8")) as StagePreparation;
        if (prep.nodeId === nodeId && prep.status === "prepared") {
          return prep;
        }
      } catch {}
    }
  } catch {}
  return undefined;
}

/** The first interactive production preparation already owns inventory writes. */
export function preparedProductionOwner(root: string, graphVersion: number): StagePreparation | undefined {
  const prep = findActivePreparation(root, "asset-production");
  if (!prep || prep.mediaAuditSnapshot === undefined || prep.graphVersion !== graphVersion) return undefined;
  const lease = hasActiveStageLease(root);
  return lease.held && lease.leaseName === "stage-asset-production" && lease.ownerToken === prep.ownerToken
    ? prep : undefined;
}

export function invalidatePreparation(root: string, id: string, reason: string): void {
  withMutationLock(root, () => {
    const prep = loadPreparation(root, id);
    if (prep && prep.status === "prepared") {
      prep.status = "invalidated";
      prep.invalidationReason = reason;
      savePreparation(root, prep);
    }
  });
}

/**
 * Categorize a node's dependencies into immutable dependencies, editable inputs, and expected outputs.
 */
export function categorizeNodeDependencies(opts: {
  root: string;
  node: GraphNode;
}): {
  immutableDependencies: string[];
  editableInputs: string[];
  expectedOutputs: string[];
} {
  const { root, node } = opts;
  const expectedOutputs = [...node.writes];
  // The full browser tool owns the Lighthouse reports it must produce. Older
  // copied graphs predate those paths; preserve their graph while declaring the
  // actual outputs of the opted-in check. Acceptance criteria stay unchanged.
  const launchPath = join(root, 'launch.json');
  if (node.id === 'browser' && node.kind === 'tool' && existsSync(launchPath)
      && json<{performance?:{enabled?:boolean}}>(launchPath).performance?.enabled === true) {
    for (const path of ['agent/reviews/performance.json', 'agent/reviews/performance-runs']) {
      if (!expectedOutputs.includes(path)) expectedOutputs.push(path);
    }
  }
  const writeSet = new Set(expectedOutputs.map(p => p.replaceAll("\\", "/")));

  const allInputs = [
    "agent/graph.yaml",
    "agent/PROMPT.md",
    ...node.refs.map(r => `agent/refs/${r}.md`),
    ...(node.inputs || []),
    ...((node.optionalInputs || []).filter(p => existsSync(join(root, p)))),
  ];

  const immutableDependencies: string[] = [];
  const editableInputs: string[] = [];

  for (const inp of allInputs) {
    const norm = inp.replaceAll("\\", "/");
    // If input is also in node.writes, it is an editable input
    if (writeSet.has(norm) || Array.from(writeSet).some(w => norm.startsWith(`${w}/`))) {
      editableInputs.push(inp);
    } else {
      immutableDependencies.push(inp);
    }
  }

  return {
    immutableDependencies,
    editableInputs,
    expectedOutputs,
  };
}

/** Fingerprint only immutable dependencies. */
export function computeImmutableHash(root: string, immutableDependencies: string[], nodeId: string): string {
  const base=fingerprint(root, immutableDependencies, { "agent/change-request.json": `agent/requests/${nodeId}.json` });
  const checkpoint=checkpointDependency(root,nodeId);
  return checkpoint?sha256Hex(JSON.stringify({base,checkpoint})):base;
}
