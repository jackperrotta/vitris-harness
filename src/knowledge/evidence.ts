import { createHash } from "node:crypto";
import type { QualityFinding } from "./contracts.ts";

export type EvidenceReceipt = {
  id: string;
  scope: string;
  buildHash: string;
  policyHash: string;
  knowledgeHash: string;
  sourceHash?: string;
  themeHash?: string;
  mediaHash?: string;
  configHash?: string;
  screenshotHash?: string;
  contentHash?: string;
  passed?: boolean;
  findings: QualityFinding[];
  digest: string;
};

export type EvidenceChange = {
  kind: "source" | "theme" | "media" | "config" | "policy" | "knowledge" | "content";
  hash: string;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  }
  return value;
}

function digestOf(receipt: Omit<EvidenceReceipt, "digest">): string {
  // Include every identity and finding field. A digest is an integrity check,
  // not proof that the author of the receipt is trusted.
  const { digest: _ignored, ...body } = receipt as EvidenceReceipt;
  return createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex");
}

export function sealReceipt(receipt: Omit<EvidenceReceipt, "digest">): EvidenceReceipt {
  return { ...receipt, digest: digestOf(receipt) };
}

export function verifyReceipt(receipt: EvidenceReceipt): { ok: boolean; reason?: string } {
  const expected = digestOf(receipt);
  if (expected !== receipt.digest) return { ok: false, reason: "Receipt digest does not match its findings." };
  const failed = receipt.findings.some(item => item.status === "fail" || item.status === "tool-error" || item.status === "stale");
  if (receipt.passed === true && failed) return { ok: false, reason: "A passed flag cannot override a failing finding." };
  return { ok: true };
}

export function screenshotCurrent(shot: { contentHash: string }, currentHash: string): boolean {
  return shot.contentHash === currentHash && shot.contentHash.length > 0;
}

export function invalidatedReceipts(change: EvidenceChange, receipts: EvidenceReceipt[]): string[] {
  return receipts.filter(receipt => {
    if (change.kind === "policy") return receipt.scope === "launch" && receipt.policyHash !== change.hash;
    if (change.kind === "source" || change.kind === "knowledge") return receipt.knowledgeHash !== change.hash && receipt.scope !== "unrelated-copy";
    if (change.kind === "theme") return receipt.themeHash !== undefined && receipt.themeHash !== change.hash;
    if (change.kind === "media") return receipt.mediaHash !== undefined && receipt.mediaHash !== change.hash;
    if (change.kind === "config") return receipt.configHash !== undefined && receipt.configHash !== change.hash;
    if (change.kind === "content") return receipt.contentHash !== undefined && receipt.contentHash !== change.hash;
    return false;
  }).map(receipt => receipt.id);
}

export function preparationInvalidation(change: EvidenceChange): string[] {
  if (change.kind === "policy") return ["launch"];
  if (change.kind === "knowledge" || change.kind === "source") return ["direction", "copy", "representative", "pages"];
  if (change.kind === "media") return ["media", "direction", "representative"];
  if (change.kind === "theme") return ["direction", "representative", "pages"];
  if (change.kind === "content") return ["copy", "pages"];
  return [];
}
