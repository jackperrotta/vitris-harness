import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { JevPilotBudget, JevReceipt } from "./types.ts";
import { DEFAULT_PILOT_BUDGET } from "./config.ts";

export interface JevAggregatedSpend {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  cacheHits: number;
  transportAttempts: number;
  retries: number;
  unavailableCalls: number;
  inFlightReservations: number;
  inFlightAttempts: number;
}

export function emptySpend(): JevAggregatedSpend {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    cacheHits: 0,
    transportAttempts: 0,
    retries: 0,
    unavailableCalls: 0,
    inFlightReservations: 0,
    inFlightAttempts: 0,
  };
}

const RECEIPT_DIR = "agent/decisions/jev";
const RESERVATION_DIR = "agent/decisions/jev/reservations";
const LOCK_FILE = "agent/decisions/jev/budget.lock";
const LOCK_STALE_MS = 10_000;
/** Reservation is live if heartbeat is this fresh, even if createdAt is hours old. */
export const RESERVATION_HEARTBEAT_STALE_MS = 30_000;

export interface PilotReservation {
  reservationId: string;
  createdAt: string;
  heartbeatAt: string;
  ownerPid: number;
  ownerToken: string;
  estimatedInputTokens: number;
  reservedAttempts: number;
}

function reservationDir(root: string): string {
  return join(root, RESERVATION_DIR);
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isReservationLive(rec: PilotReservation, nowMs = Date.now(), staleMs = RESERVATION_HEARTBEAT_STALE_MS): boolean {
  const beat = Date.parse(rec.heartbeatAt || rec.createdAt);
  if (Number.isFinite(beat) && nowMs - beat <= staleMs) return true;
  return isPidAlive(rec.ownerPid);
}

function writeRecoveryReceipt(root: string, rec: PilotReservation): void {
  const receipt: JevReceipt = {
    schemaVersion: 1,
    receiptId: `recovery-${rec.reservationId}`,
    taskType: "custom",
    model: "jev-1.13.0",
    policyVersion: "recovery",
    questionVersion: "recovery",
    stateHash: rec.reservationId.replace(/-/g, "").slice(0, 16).padEnd(16, "0"),
    durationMs: 0,
    createdAt: new Date().toISOString(),
    status: "unavailable",
    cached: false,
    usage: {
      inputTokens: rec.estimatedInputTokens || 0,
      outputTokens: 0,
      unknown: true,
    },
    retries: Math.max(0, (rec.reservedAttempts || 1) - 1),
    transportAttempts: Math.max(1, rec.reservedAttempts || 1),
    estimatedInputTokens: rec.estimatedInputTokens,
    answers: {},
    fallbackReason: `Stale reservation recovered (owner pid ${rec.ownerPid} not live; heartbeat expired). Conservatively counted reserved attempts.`,
  };
  const dir = join(root, RECEIPT_DIR);
  mkdirSync(dir, { recursive: true });
  const fileName = `${receipt.createdAt.replace(/[:.]/g, "-")}-${receipt.receiptId.slice(0, 16)}-recovery.json`;
  const path = join(dir, fileName);
  const tmp = `${path}.tmp.${randomUUID()}`;
  writeFileSync(tmp, JSON.stringify(receipt, null, 2), "utf8");
  try {
    renameSync(tmp, path);
  } catch {
    writeFileSync(path, JSON.stringify(receipt, null, 2), "utf8");
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

export function reapStaleReservations(root: string, nowMs = Date.now()): number {
  const dir = reservationDir(root);
  if (!existsSync(dir)) return 0;
  let reaped = 0;
  for (const f of readdirSync(dir).filter(name => name.endsWith(".json"))) {
    const path = join(dir, f);
    try {
      const rec = JSON.parse(readFileSync(path, "utf8")) as PilotReservation;
      if (!rec?.reservationId) {
        try { unlinkSync(path); } catch { /* ignore */ }
        continue;
      }
      if (isReservationLive(rec, nowMs)) continue;
      writeRecoveryReceipt(root, rec);
      try { unlinkSync(path); } catch { /* ignore */ }
      reaped++;
    } catch {
      /* ignore corrupt */
    }
  }
  return reaped;
}

export function loadPilotReservations(root: string, nowMs = Date.now()): PilotReservation[] {
  const dir = reservationDir(root);
  if (!existsSync(dir)) return [];
  const out: PilotReservation[] = [];
  for (const f of readdirSync(dir).filter(name => name.endsWith(".json"))) {
    const path = join(dir, f);
    try {
      const rec = JSON.parse(readFileSync(path, "utf8")) as PilotReservation;
      if (!rec?.reservationId) continue;
      if (!isReservationLive(rec, nowMs)) continue;
      out.push({
        reservationId: rec.reservationId,
        createdAt: rec.createdAt,
        heartbeatAt: rec.heartbeatAt || rec.createdAt,
        ownerPid: rec.ownerPid || 0,
        ownerToken: rec.ownerToken || "",
        estimatedInputTokens: rec.estimatedInputTokens || 0,
        reservedAttempts: Math.max(1, rec.reservedAttempts || 1),
      });
    } catch {
      /* ignore corrupt reservation */
    }
  }
  return out;
}

export function aggregateJevReceiptSpend(root: string, baseline?: Partial<JevAggregatedSpend>): JevAggregatedSpend {
  const dir = join(root, RECEIPT_DIR);
  const result: JevAggregatedSpend = {
    calls: baseline?.calls || 0,
    inputTokens: baseline?.inputTokens || 0,
    outputTokens: baseline?.outputTokens || 0,
    durationMs: baseline?.durationMs || 0,
    cacheHits: baseline?.cacheHits || 0,
    transportAttempts: baseline?.transportAttempts || 0,
    retries: baseline?.retries || 0,
    unavailableCalls: baseline?.unavailableCalls || 0,
    inFlightReservations: baseline?.inFlightReservations || 0,
    inFlightAttempts: baseline?.inFlightAttempts || 0,
  };
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter(f => f.endsWith(".json"));
    const seen = new Set<string>();

    for (const f of files) {
      try {
        const receipt = JSON.parse(readFileSync(join(dir, f), "utf8")) as JevReceipt;
        if (!receipt?.receiptId || seen.has(receipt.receiptId)) continue;
        seen.add(receipt.receiptId);
        if (receipt.cached) {
          result.cacheHits++;
          continue;
        }
        const attempts = receipt.transportAttempts ?? (
          receipt.status === "ok" || receipt.status === "malformed" ? 1 : 0
        );
        if (attempts > 0) {
          result.transportAttempts += attempts;
          result.retries += receipt.retries ?? Math.max(0, attempts - 1);
        }
        if (receipt.status === "unavailable" || receipt.status === "budget_limited" || receipt.status === "canceled") {
          result.unavailableCalls++;
          if (receipt.usage?.unknown) {
            result.inputTokens += receipt.estimatedInputTokens || receipt.usage.inputTokens || 0;
          }
        } else if (attempts > 0) {
          result.calls++;
          if (receipt.usage?.unknown) {
            result.inputTokens += receipt.estimatedInputTokens || receipt.usage.inputTokens || 0;
            result.outputTokens += receipt.usage.outputTokens || 0;
          } else if (receipt.usage) {
            result.inputTokens += receipt.usage.inputTokens || 0;
            result.outputTokens += receipt.usage.outputTokens || 0;
          }
          if (receipt.durationMs) result.durationMs += receipt.durationMs;
        }
      } catch {
        /* ignore corrupt receipts */
      }
    }
  }

  const reservations = loadPilotReservations(root);
  result.inFlightReservations = reservations.length;
  result.inFlightAttempts = reservations.reduce((n, r) => n + r.reservedAttempts, 0);
  result.transportAttempts += result.inFlightAttempts;
  result.inputTokens += reservations.reduce((n, r) => n + (r.estimatedInputTokens || 0), 0);
  return result;
}

export function resolvePilotBudget(budget?: JevPilotBudget): JevPilotBudget {
  return {
    maxTransportAttempts: budget?.maxTransportAttempts ?? DEFAULT_PILOT_BUDGET.maxTransportAttempts,
    maxInputTokens: budget?.maxInputTokens ?? DEFAULT_PILOT_BUDGET.maxInputTokens,
  };
}

export function estimateInputTokens(payload: unknown): number {
  const bytes = Buffer.byteLength(JSON.stringify(payload ?? ""), "utf8");
  return Math.max(1, Math.ceil(bytes / 3));
}

export function remainingPilotBudget(root: string, budget?: JevPilotBudget): {
  transportAttempts: number;
  inputTokens: number;
} {
  const cap = resolvePilotBudget(budget);
  const spend = aggregateJevReceiptSpend(root);
  return {
    transportAttempts: cap.maxTransportAttempts - spend.transportAttempts,
    inputTokens: cap.maxInputTokens - spend.inputTokens,
  };
}

export async function withBudgetLock<T>(root: string, fn: () => T | Promise<T>, timeoutMs = 5000): Promise<T> {
  const lockPath = join(root, LOCK_FILE);
  mkdirSync(dirname(lockPath), { recursive: true });
  const start = Date.now();
  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
        return await fn();
      } finally {
        try { closeSync(fd); } catch { /* ignore */ }
        try { unlinkSync(lockPath); } catch { /* ignore */ }
      }
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
      try {
        if (existsSync(lockPath) && Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
          try { unlinkSync(lockPath); } catch { /* ignore */ }
          continue;
        }
      } catch {
        /* ignore stat races */
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error("Budget lock timeout");
      }
      await new Promise(r => setTimeout(r, 15 + Math.floor(Math.random() * 20)));
    }
  }
}

export async function acquirePilotReservation(opts: {
  root: string;
  budget?: JevPilotBudget;
  estimatedInputTokens: number;
}): Promise<{ ok: true; reservationId: string; reservedAttempts: number } | { ok: false; reason: string }> {
  return withBudgetLock(opts.root, () => {
    reapStaleReservations(opts.root);
    const remaining = remainingPilotBudget(opts.root, opts.budget);
    if (remaining.transportAttempts <= 0) {
      return {
        ok: false as const,
        reason: `Pilot transport budget exhausted (remaining attempts=${remaining.transportAttempts}). Restore agent obligations.`,
      };
    }
    if (remaining.inputTokens <= 0 || remaining.inputTokens < opts.estimatedInputTokens) {
      return {
        ok: false as const,
        reason: `Pilot input-token budget exhausted (remaining=${remaining.inputTokens}, estimated=${opts.estimatedInputTokens}). Restore agent obligations.`,
      };
    }
    const now = new Date().toISOString();
    const reservation: PilotReservation = {
      reservationId: randomUUID(),
      createdAt: now,
      heartbeatAt: now,
      ownerPid: process.pid,
      ownerToken: randomUUID(),
      estimatedInputTokens: opts.estimatedInputTokens,
      reservedAttempts: 1,
    };
    const dir = reservationDir(opts.root);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${reservation.reservationId}.json`), JSON.stringify(reservation), "utf8");
    return { ok: true as const, reservationId: reservation.reservationId, reservedAttempts: 1 };
  });
}

export async function touchPilotReservation(root: string, reservationId: string): Promise<void> {
  await withBudgetLock(root, () => {
    const path = join(reservationDir(root), `${reservationId}.json`);
    if (!existsSync(path)) return;
    const rec = JSON.parse(readFileSync(path, "utf8")) as PilotReservation;
    rec.heartbeatAt = new Date().toISOString();
    rec.ownerPid = process.pid;
    writeFileSync(path, JSON.stringify(rec), "utf8");
  });
}

export async function acquireExtraAttempt(opts: {
  root: string;
  reservationId: string;
  budget?: JevPilotBudget;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  return withBudgetLock(opts.root, () => {
    reapStaleReservations(opts.root);
    const path = join(reservationDir(opts.root), `${opts.reservationId}.json`);
    if (!existsSync(path)) {
      return { ok: false as const, reason: "Pilot reservation missing; retry blocked." };
    }
    const remaining = remainingPilotBudget(opts.root, opts.budget);
    if (remaining.transportAttempts <= 0) {
      return {
        ok: false as const,
        reason: `Pilot transport budget exhausted (remaining attempts=${remaining.transportAttempts}). Retry blocked.`,
      };
    }
    const rec = JSON.parse(readFileSync(path, "utf8")) as PilotReservation;
    rec.reservedAttempts = (rec.reservedAttempts || 1) + 1;
    rec.heartbeatAt = new Date().toISOString();
    writeFileSync(path, JSON.stringify(rec), "utf8");
    return { ok: true as const };
  });
}

export async function commitPilotReservation(opts: {
  root: string;
  reservationId: string;
  writeReceipt?: () => void;
}): Promise<void> {
  await withBudgetLock(opts.root, () => {
    opts.writeReceipt?.();
    const path = join(reservationDir(opts.root), `${opts.reservationId}.json`);
    try { unlinkSync(path); } catch { /* already gone */ }
  });
}

/** @deprecated Use acquirePilotReservation; kept for call sites that only need a read check. */
export function reservePilotTransport(opts: {
  root: string;
  budget?: JevPilotBudget;
  estimatedInputTokens: number;
}): { ok: true } | { ok: false; reason: string } {
  reapStaleReservations(opts.root);
  const remaining = remainingPilotBudget(opts.root, opts.budget);
  if (remaining.transportAttempts <= 0) {
    return {
      ok: false,
      reason: `Pilot transport budget exhausted (remaining attempts=${remaining.transportAttempts}). Restore agent obligations.`,
    };
  }
  if (remaining.inputTokens <= 0 || remaining.inputTokens < opts.estimatedInputTokens) {
    return {
      ok: false,
      reason: `Pilot input-token budget exhausted (remaining=${remaining.inputTokens}, estimated=${opts.estimatedInputTokens}). Restore agent obligations.`,
    };
  }
  return { ok: true };
}
