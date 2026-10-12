import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { json, type Business } from "../artifacts.ts";
import { buildEvidenceIndex, contentHash, type EvidenceIndex, type IndexedEvidence } from "./indexing.ts";
import type { GroundingVerdict } from "./types.ts";

export interface EvidenceSourceLocation {
  source: string;
  span?: [number, number];
  alias?: string;
  evidenceId?: string;
  sourceFile?: string;
}

export interface EvidenceLedgerItem {
  id: string;
  hash: string;
  source: string;
  span?: [number, number];
  aliases: string[];
  text: string;
  candidateType: "harvest_raw" | "brief" | "business_fact" | "media" | "factual_extraction";
}

export interface EvidenceLedgerClaim {
  id: string;
  claim: string;
  sourceFile: string;
  field: string;
  citedEvidenceIds: string[];
  status: "verified" | "unsupported" | "contradicted" | "unknown";
  notes?: string;
  policyVersion?: string;
  retired?: boolean;
}

export interface EvidenceLedgerJudgment {
  id: string;
  claimId: string;
  evidenceId: string;
  claimHash: string;
  evidenceHash: string;
  questionKey: string;
  verdict: GroundingVerdict;
  confidence?: number;
  relation?: "supports" | "contradicts" | "says_nothing";
  notes?: string;
  evaluatedAt: string;
  nodeId?: string;
  invalidated: boolean;
  invalidationReason?: string;
  // Provenance fields
  model?: string;
  questionSemantics?: string;
  rawRelation?: "supports" | "contradicts" | "says_nothing";
  rawConfidence?: number;
  sourcePath?: string;
  sourceHash?: string;
  policyThreshold?: number;
  rawAnswer?: Record<string, unknown>;
  receiptId?: string;
}

export interface EvidenceLedgerContradiction {
  id: string;
  claimId: string;
  evidenceId: string;
  description: string;
  status: "unresolved" | "resolved";
  detectedAt: string;
  resolution?: string;
}

export interface EvidenceLedger {
  schemaVersion: 1;
  updatedAt: string;
  items: EvidenceLedgerItem[];
  claims: Record<string, EvidenceLedgerClaim>;
  judgments: Record<string, EvidenceLedgerJudgment>;
  contradictions: EvidenceLedgerContradiction[];
}

export function defaultLedgerPath(root: string): string {
  return join(root, "onboarding/evidence-ledger.json");
}

export function sha256(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export function createEmptyLedger(): EvidenceLedger {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    items: [],
    claims: {},
    judgments: {},
    contradictions: [],
  };
}

export function loadEvidenceLedger(root: string, customPath?: string): EvidenceLedger {
  const p = customPath || defaultLedgerPath(root);
  const fallback = join(root, "agent/evidence-ledger.json");
  const targetPath = existsSync(p) ? p : existsSync(fallback) ? fallback : null;

  if (!targetPath) {
    return createEmptyLedger();
  }

  try {
    const data = JSON.parse(readFileSync(targetPath, "utf8")) as EvidenceLedger;
    if (data.schemaVersion !== 1) {
      return createEmptyLedger();
    }
    data.items ||= [];
    data.claims ||= {};
    data.judgments ||= {};
    data.contradictions ||= [];
    return data;
  } catch {
    return createEmptyLedger();
  }
}

export function saveEvidenceLedger(root: string, ledger: EvidenceLedger, customPath?: string): string {
  const targetPath = customPath || defaultLedgerPath(root);
  const dir = join(targetPath, "..");
  mkdirSync(dir, { recursive: true });
  ledger.updatedAt = new Date().toISOString();
  writeFileSync(targetPath, JSON.stringify(ledger, null, 2), "utf8");
  return targetPath;
}

/**
 * Builds or refreshes the evidence ledger from repository artifacts.
 * Stable IDs, collision-free SHA-256 hashes, source aliases, and claims are extracted.
 * Reuses existing judgments and preserves unknown/unsupported states.
 */
export function buildOrUpdateLedger(
  root: string,
  options?: {
    customPath?: string;
    extraItems?: EvidenceLedgerItem[];
    index?: EvidenceIndex;
  }
): EvidenceLedger {
  const ledger = loadEvidenceLedger(root, options?.customPath);
  const index = options?.index || buildEvidenceIndex(root);

  const itemsByHash = new Map<string, EvidenceLedgerItem>();
  for (const item of ledger.items) {
    itemsByHash.set(item.hash, item);
  }

  // Register or update indexed items
  for (const item of index.items) {
    const hash = item.hash || sha256(item.text);
    const existing = itemsByHash.get(hash);
    if (existing) {
      if (!existing.aliases.includes(item.source) && existing.source !== item.source) {
        existing.aliases.push(item.source);
      }
      if (item.span && !existing.span) {
        existing.span = item.span;
      }
    } else {
      const newItem: EvidenceLedgerItem = {
        id: item.id || `ev_${itemsByHash.size}`,
        hash,
        source: item.source,
        span: item.span,
        aliases: [],
        text: item.text,
        candidateType: item.candidateType,
      };
      itemsByHash.set(hash, newItem);
      ledger.items.push(newItem);
    }
  }

  // Register extra items if provided
  if (options?.extraItems) {
    for (const item of options.extraItems) {
      const hash = item.hash || sha256(item.text);
      const existing = itemsByHash.get(hash);
      if (existing) {
        if (!existing.aliases.includes(item.source) && existing.source !== item.source) {
          existing.aliases.push(item.source);
        }
      } else {
        const newItem: EvidenceLedgerItem = {
          ...item,
          hash,
          aliases: item.aliases || [],
        };
        itemsByHash.set(hash, newItem);
        ledger.items.push(newItem);
      }
    }
  }

  // Discover claims from onboarding/business.json
  const busPath = join(root, "onboarding/business.json");
  if (existsSync(busPath)) {
    try {
      const bus = json<Business>(busPath);
      const activeFactIds = new Set<string>();

      for (const fact of bus.facts || []) {
        activeFactIds.add(fact.id);
        const existingClaim = ledger.claims[fact.id];
        const textChanged = existingClaim && existingClaim.claim !== fact.claim;

        if (textChanged) {
          invalidateJudgments(ledger, {
            changedClaimIds: [fact.id],
            reason: `Claim text updated in business.json: "${fact.claim}"`,
          });
        }

        const initialStatus = fact.evidence && fact.evidence.length ? "unknown" : "unsupported";
        ledger.claims[fact.id] = {
          id: fact.id,
          claim: fact.claim,
          sourceFile: "onboarding/business.json",
          field: "facts",
          citedEvidenceIds: fact.evidence || [],
          status: textChanged ? initialStatus : (existingClaim ? existingClaim.status : initialStatus),
          notes: textChanged ? "Updated claim wording" : existingClaim?.notes,
        };

        if (textChanged) {
          ledger.claims[fact.id]!.status = deriveClaimStatus(ledger, fact.id);
        }
      }

      // Retire removed business facts
      for (const [cId, claim] of Object.entries(ledger.claims)) {
        if (claim.sourceFile === "onboarding/business.json" && claim.field === "facts" && !activeFactIds.has(cId)) {
          claim.retired = true;
          claim.status = "unsupported";
          if (!claim.claim.startsWith("[RETIRED]")) {
            claim.claim = `[RETIRED] ${claim.claim}`;
          }
          invalidateJudgments(ledger, {
            changedClaimIds: [cId],
            reason: "Fact was removed from business.json",
          });
        }
      }

      const updateTopLevelClaim = (id: string, text: string | undefined, field: string) => {
        if (!text) return;
        const existing = ledger.claims[id];
        const changed = existing && existing.claim !== text;
        if (changed) {
          invalidateJudgments(ledger, {
            changedClaimIds: [id],
            reason: `${field} updated in business.json`,
          });
        }
        ledger.claims[id] = {
          id,
          claim: text,
          sourceFile: "onboarding/business.json",
          field,
          citedEvidenceIds: [],
          status: changed ? "unknown" : (existing?.status || "unknown"),
        };
      };

      updateTopLevelClaim("business:offer", bus.offer, "offer");
      updateTopLevelClaim("business:audience", bus.audience, "audience");
      updateTopLevelClaim("business:positioning", bus.positioning, "positioning");

      if (Array.isArray(bus.includes)) {
        for (let i = 0; i < bus.includes.length; i++) {
          const incId = `business:includes:${i}`;
          updateTopLevelClaim(incId, bus.includes[i], `includes[${i}]`);
        }
      }
    } catch {}
  }

  // Discover claims from onboarding/copy-plan.json
  const copyPath = join(root, "onboarding/copy-plan.json");
  if (existsSync(copyPath)) {
    try {
      const cp = json<{
        pages?: { path: string; sections?: { id: string; heading?: string; body?: string; factIds?: string[] }[] }[];
        routes?: { path: string; headline?: string; factIds?: string[] }[];
      }>(copyPath);
      if (Array.isArray(cp.pages)) {
        for (const p of cp.pages) {
          for (const s of p.sections || []) {
            const id = `copy:${p.path}:${s.id}`;
            const claimText = [s.heading, s.body].filter(Boolean).join(" - ");
            if (claimText) {
              const existingClaim = ledger.claims[id];
              ledger.claims[id] = {
                id,
                claim: claimText,
                sourceFile: "onboarding/copy-plan.json",
                field: `pages[${p.path}].${s.id}`,
                citedEvidenceIds: s.factIds || [],
                status: existingClaim ? existingClaim.status : (s.factIds?.length ? "unknown" : "unsupported"),
                notes: existingClaim?.notes,
              };
            }
          }
        }
      }
    } catch {}
  }

  saveEvidenceLedger(root, ledger, options?.customPath);
  return ledger;
}

/**
 * Derives a claim's status deterministically from all active judgments,
 * cited evidence, and unresolved contradictions using explicit conflict resolution.
 */
export function deriveClaimStatus(
  ledger: EvidenceLedger,
  claimId: string,
  options?: { minConfidence?: number }
): "verified" | "unsupported" | "contradicted" | "unknown" {
  const claim = ledger.claims[claimId];
  if (!claim) return "unknown";
  if (claim.retired) return "unsupported";

  // Check unresolved contradictions
  const hasUnresolvedContra = ledger.contradictions.some(
    c => c.claimId === claimId && c.status === "unresolved"
  );

  const activeJudgments = Object.values(ledger.judgments).filter(
    j => j.claimId === claimId && !j.invalidated
  );

  const hasContradiction = activeJudgments.some(
    j => (j.rawRelation === "contradicts" || j.relation === "contradicts" || j.verdict === "contradicted") &&
         !ledger.contradictions.some(c => c.claimId === claimId && c.evidenceId === j.evidenceId && c.status === "resolved")
  );

  if (hasUnresolvedContra || hasContradiction) {
    return "contradicted";
  }

  const threshold = options?.minConfidence ?? 0.85;
  const supporting = activeJudgments.filter(j => {
    const rel = j.rawRelation || j.relation;
    const conf = j.rawConfidence ?? j.confidence ?? 0;
    return (rel === "supports" || j.verdict === "verified") && conf >= threshold;
  });

  if (supporting.length > 0) {
    return "verified";
  }

  if (claim.citedEvidenceIds.length === 0) {
    return "unsupported";
  }

  const unsupportedCount = activeJudgments.filter(j => {
    const rel = j.rawRelation || j.relation;
    return (
      rel === "says_nothing" ||
      j.verdict === "insufficient_evidence" ||
      j.verdict === "missing_source" ||
      j.verdict === "fabricated"
    );
  }).length;

  if (activeJudgments.length > 0 && unsupportedCount === activeJudgments.length) {
    return "unsupported";
  }

  return "unknown";
}

/**
 * Record an evaluation judgment into the ledger.
 * Derives the claim status deterministically from all active judgments and unresolved contradictions.
 */
export function recordJudgment(
  ledger: EvidenceLedger,
  params: {
    claimId: string;
    evidenceId: string;
    claimText: string;
    evidenceText: string;
    questionKey: string;
    verdict: GroundingVerdict;
    confidence?: number;
    relation?: "supports" | "contradicts" | "says_nothing";
    notes?: string;
    nodeId?: string;
    model?: string;
    questionSemantics?: string;
    sourcePath?: string;
    sourceHash?: string;
    policyThreshold?: number;
    rawAnswer?: Record<string, unknown>;
    receiptId?: string;
  }
): EvidenceLedgerJudgment {
  const claimHash = sha256(params.claimText);
  const evidenceHash = sha256(params.evidenceText);
  const judgmentId = `j_${params.claimId}_${params.evidenceId}_${params.questionKey}`;

  const judgment: EvidenceLedgerJudgment = {
    id: judgmentId,
    claimId: params.claimId,
    evidenceId: params.evidenceId,
    claimHash,
    evidenceHash,
    questionKey: params.questionKey,
    verdict: params.verdict,
    confidence: params.confidence,
    relation: params.relation,
    notes: params.notes,
    evaluatedAt: new Date().toISOString(),
    nodeId: params.nodeId,
    invalidated: false,
    model: params.model,
    questionSemantics: params.questionSemantics,
    rawRelation: params.relation,
    rawConfidence: params.confidence,
    sourcePath: params.sourcePath,
    sourceHash: params.sourceHash || evidenceHash,
    policyThreshold: params.policyThreshold,
    rawAnswer: params.rawAnswer,
    receiptId: params.receiptId,
  };

  ledger.judgments[judgmentId] = judgment;

  // Update claim status in ledger
  if (!ledger.claims[params.claimId]) {
    ledger.claims[params.claimId] = {
      id: params.claimId,
      claim: params.claimText,
      sourceFile: params.sourcePath || "",
      field: "facts",
      citedEvidenceIds: [params.evidenceId],
      status: "unknown",
      notes: params.notes,
    };
  }

  // If contradicted, record contradiction
  if (params.verdict === "contradicted" || params.relation === "contradicts") {
    const contraId = `contra_${params.claimId}_${params.evidenceId}`;
    if (!ledger.contradictions.some(c => c.id === contraId && c.status === "unresolved")) {
      ledger.contradictions.push({
        id: contraId,
        claimId: params.claimId,
        evidenceId: params.evidenceId,
        description: `Evidence ${params.evidenceId} contradicts claim ${params.claimId}: "${params.notes || params.claimText}"`,
        status: "unresolved",
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // Derive claim status deterministically across all active judgments
  const claim = ledger.claims[params.claimId]!;
  claim.status = deriveClaimStatus(ledger, params.claimId, { minConfidence: params.policyThreshold });

  return judgment;
}

/**
 * Lookup an existing, non-invalidated judgment in the ledger.
 * Matches on claimId, evidenceId, questionKey, content hashes, model, and question semantics.
 * Validates source provenance and applies policy threshold locally.
 */
export function lookupJudgment(
  ledger: EvidenceLedger,
  params: {
    claimId: string;
    evidenceId: string;
    claimText?: string;
    evidenceText?: string;
    questionKey: string;
    expectedModel?: string;
    expectedQuestionSemantics?: string;
    minConfidence?: number;
    validateSource?: boolean;
  }
): EvidenceLedgerJudgment | undefined {
  const judgmentId = `j_${params.claimId}_${params.evidenceId}_${params.questionKey}`;
  const judgment = ledger.judgments[judgmentId];
  if (!judgment || judgment.invalidated) return undefined;

  if (params.claimText) {
    const cHash = sha256(params.claimText);
    if (judgment.claimHash !== cHash) return undefined;
  }

  if (params.evidenceText) {
    const eHash = sha256(params.evidenceText);
    if (judgment.evidenceHash !== eHash) return undefined;
  }

  // Model provenance check
  if (params.expectedModel) {
    if (!judgment.model || judgment.model !== params.expectedModel) {
      return undefined;
    }
  }

  // Question semantics check - must fail closed if missing or mismatched
  if (params.expectedQuestionSemantics) {
    if (!judgment.questionSemantics || judgment.questionSemantics !== params.expectedQuestionSemantics) {
      return undefined;
    }
  }

  // Source validity check
  if (params.validateSource) {
    const item = ledger.items.find(i => i.id === params.evidenceId);
    if (!item) return undefined;
    if (judgment.sourceHash && item.hash !== judgment.sourceHash) return undefined;
  }

  // Policy confidence threshold check (if specified)
  if (params.minConfidence !== undefined) {
    const conf = judgment.confidence ?? judgment.rawConfidence ?? 0;
    if (conf < params.minConfidence) return undefined;
  }

  return judgment;
}

/**
 * Selectively invalidates only judgments affected by changed claims, sources/evidence, or questions.
 * Preserves unknown and unsupported states without resetting unimpacted assertions.
 */
export function invalidateJudgments(
  ledger: EvidenceLedger,
  params: {
    changedClaimIds?: string[];
    changedEvidenceIds?: string[];
    changedQuestionKeys?: string[];
    changedSourceHashes?: Map<string, string>;
    reason?: string;
  }
): {
  invalidatedCount: number;
  affectedJudgmentIds: string[];
} {
  const claimSet = new Set(params.changedClaimIds || []);
  const evSet = new Set(params.changedEvidenceIds || []);
  const qSet = new Set(params.changedQuestionKeys || []);
  const reason = params.reason || "Artifact or source changed";

  const affectedJudgmentIds: string[] = [];

  for (const [id, j] of Object.entries(ledger.judgments)) {
    if (j.invalidated) continue;

    const matchesClaim = claimSet.has(j.claimId);
    const matchesEv = evSet.has(j.evidenceId);
    const matchesQ = qSet.has(j.questionKey);
    const matchesSource = !!(params.changedSourceHashes && j.sourcePath && params.changedSourceHashes.has(j.sourcePath) && j.sourceHash !== params.changedSourceHashes.get(j.sourcePath));

    if (matchesClaim || matchesEv || matchesQ || matchesSource) {
      j.invalidated = true;
      j.invalidationReason = reason;
      affectedJudgmentIds.push(id);

      // Re-derive claim status
      if (matchesClaim && ledger.claims[j.claimId]) {
        const claim = ledger.claims[j.claimId]!;
        claim.status = deriveClaimStatus(ledger, j.claimId);
        claim.notes = `Judgment invalidated: ${reason}`;
      }
    }
  }

  return {
    invalidatedCount: affectedJudgmentIds.length,
    affectedJudgmentIds,
  };
}

/**
 * Returns all unresolved contradictions in the ledger.
 */
export function getUnresolvedContradictions(ledger: EvidenceLedger): EvidenceLedgerContradiction[] {
  return ledger.contradictions.filter(c => c.status === "unresolved");
}

/**
 * Resolves a recorded contradiction with explanation and recomputes claim status.
 */
export function resolveContradiction(
  ledger: EvidenceLedger,
  contradictionId: string,
  resolution: string
): boolean {
  const target = ledger.contradictions.find(c => c.id === contradictionId);
  if (!target) return false;
  target.status = "resolved";
  target.resolution = resolution;
  for (const j of Object.values(ledger.judgments)) {
    if (j.claimId === target.claimId && j.evidenceId === target.evidenceId && (j.rawRelation === "contradicts" || j.relation === "contradicts" || j.verdict === "contradicted")) {
      j.invalidated = true;
      j.notes = `Contradiction resolved: ${resolution}`;
    }
  }
  if (ledger.claims[target.claimId]) {
    ledger.claims[target.claimId]!.status = deriveClaimStatus(ledger, target.claimId);
  }
  return true;
}

