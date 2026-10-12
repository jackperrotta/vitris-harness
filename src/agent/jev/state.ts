import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Business, Storyboard } from "../artifacts.ts";

export interface GroundingStatePayload {
  task: "grounding";
  claimId: string;
  claim: string;
  evidenceId?: string;
  sourceFile?: string;
  excerpt: string;
}

export function buildGroundingState(item: {
  claimId: string;
  claim: string;
  evidenceId?: string;
  sourceFile?: string;
  excerpt: string;
}): GroundingStatePayload {
  return {
    task: "grounding",
    claimId: item.claimId,
    claim: item.claim.trim(),
    evidenceId: item.evidenceId,
    sourceFile: item.sourceFile,
    excerpt: item.excerpt.trim(),
  };
}

export interface RoutingStatePayload {
  task: "routing";
  instruction: string;
  currentPages?: string[];
  preservedDecisions?: string[];
}

export function buildRoutingState(instruction: string, options?: { pages?: string[]; preserved?: string[] }): RoutingStatePayload {
  return {
    task: "routing",
    instruction: instruction.trim(),
    currentPages: options?.pages,
    preservedDecisions: options?.preserved,
  };
}

export interface CtaStatePayload {
  task: "cta_consistency";
  pagePath: string;
  sectionId: string;
  plannedCta: string;
  storyboardAction?: {
    label: string;
    destination: string;
    behavior: string;
  } | null;
}

export function buildCtaState(opts: {
  pagePath: string;
  sectionId: string;
  plannedCta: string;
  storyboardAction?: { label: string; destination: string; behavior: string } | null;
}): CtaStatePayload {
  return {
    task: "cta_consistency",
    pagePath: opts.pagePath,
    sectionId: opts.sectionId,
    plannedCta: opts.plannedCta.trim(),
    storyboardAction: opts.storyboardAction,
  };
}

export interface EvidenceSourceLocation {
  source: string;
  span?: string | [number, number];
  alias?: string;
  evidenceId?: string;
  sourceFile?: string;
}

export interface SharedEvidenceItem {
  id: string;
  source: string;
  hash: string;
  excerpt: string;
  sources?: EvidenceSourceLocation[];
}

export interface SharedClaimItem {
  id: string;
  claim: string;
}

export interface SharedGroundingStatePayload {
  task: "grounding_batch";
  claims: Record<string, SharedClaimItem>;
  evidence: Record<string, SharedEvidenceItem>;
  metadata?: Record<string, unknown>;
}

export interface GroundingBatchCandidate {
  claimId?: string;
  claim?: string;
  evidenceId?: string;
  sourceFile?: string;
  source?: string;
  excerpt: string;
  span?: string | [number, number];
  alias?: string;
}

/** Compute SHA-256 hash of string for collision-free evidence identity. */
export function sha256Hex(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

/** Retained for backward-compatibility, now backed by SHA-256 to prevent collisions. */
export function simpleHash(str: string): string {
  return sha256Hex(str);
}

/**
 * Builds shared-state batch deduplicating excerpts by collision-free SHA-256 content hash.
 * Questions reference explicit state paths rather than embedding duplicate text.
 * Preserves every source alias and span when identical text appears across multiple sources.
 */
export function buildSharedGroundingBatch(candidates: GroundingBatchCandidate[]): {
  state: SharedGroundingStatePayload;
  evidenceKeyByHash: Map<string, string>;
  evidence: SharedEvidenceItem[];
} {
  const claims: Record<string, SharedClaimItem> = {};
  const evidence: Record<string, SharedEvidenceItem> = {};
  const evidenceKeyByHash = new Map<string, string>();
  let evCounter = 0;

  for (const c of candidates) {
    if (c.claimId && c.claim) {
      if (!claims[c.claimId]) {
        claims[c.claimId] = {
          id: c.claimId,
          claim: c.claim.trim(),
        };
      }
    }

    const normExcerpt = c.excerpt.trim();
    const hash = sha256Hex(normExcerpt);
    const sourceLoc: EvidenceSourceLocation = {
      source: c.source || c.sourceFile || "",
      span: c.span,
      ...(c.alias !== undefined ? { alias: c.alias } : {}),
      ...(c.evidenceId !== undefined ? { evidenceId: c.evidenceId } : {}),
      ...(c.sourceFile !== undefined ? { sourceFile: c.sourceFile } : {}),
    };

    if (!evidenceKeyByHash.has(hash)) {
      const evKey = `ev_${evCounter++}`;
      evidenceKeyByHash.set(hash, evKey);
      evidence[evKey] = {
        id: c.evidenceId || evKey,
        source: c.source || c.sourceFile || "",
        hash,
        excerpt: normExcerpt,
        sources: [sourceLoc],
      };
    } else {
      const evKey = evidenceKeyByHash.get(hash)!;
      const existing = evidence[evKey]!;
      existing.sources ||= [];
      if (!existing.sources.some(s => s.source === sourceLoc.source && JSON.stringify(s.span) === JSON.stringify(sourceLoc.span) && s.alias === sourceLoc.alias)) {
        existing.sources.push(sourceLoc);
      }
    }
  }

  return {
    state: {
      task: "grounding_batch",
      claims,
      evidence,
    },
    evidenceKeyByHash,
    evidence: Object.values(evidence),
  };
}

/**
 * Recomputes SHA-256 from actual overflow file bytes.
 * Prevents manipulation of evidence text while keeping JSON keys intact.
 */
export function rehashOverflowContent(overflowPath: string): string {
  const bytes = readFileSync(overflowPath);
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Extends a shared grounding batch state with preparation identity.
 * Binds the batch to a specific preparation context.
 */
export function bindBatchToPreparation(
  state: SharedGroundingStatePayload,
  preparationId: string,
  nodeId: string
): SharedGroundingStatePayload {
  return {
    ...state,
    metadata: {
      ...(state.metadata || {}),
      preparationId,
      nodeId,
    },
  } as SharedGroundingStatePayload;
}

