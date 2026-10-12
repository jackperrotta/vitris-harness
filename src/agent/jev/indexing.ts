import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { json, type Business } from "../artifacts.ts";
import { isPathConfined } from "./security.ts";
import type { ScoreCriteria } from "./types.ts";

export interface IndexedEvidence {
  id: string;
  source: string;
  hash: string;
  text: string;
  span?: [number, number];
  candidateType: "harvest_raw" | "brief" | "business_fact" | "media";
}

export interface SchemaClaim {
  id: string;
  claim: string;
  field: string;
  sourceFile: string;
  citedEvidenceIds: string[];
}

export interface CandidateCoverageReport {
  schemaBackedClaims: SchemaClaim[];
  candidateEvidenceCount: number;
  coveredClaimsCount: number;
  uncoveredClaims: SchemaClaim[];
  coverageLimitations: string;
  requiresAgentCompletenessCheck: true;
}

export interface EvidenceIndex {
  generatedAt: string;
  items: IndexedEvidence[];
  itemsByHash: Map<string, IndexedEvidence>;
  itemsById: Map<string, IndexedEvidence>;
}

/** Standard 5-point relevance rubric for @typesafe-ai/sdk Score questions. */
export const EVIDENCE_RELEVANCE_RUBRIC: ScoreCriteria = [
  "0: Irrelevant - does not mention or relate to the task or business claims",
  "1: Tangential - mentions general industry topics but provides no specific business evidence",
  "2: Moderate - provides useful background context or secondary details",
  "3: High - directly addresses key business claims, services, or locations",
  "4: Essential - core primary evidence required for factual verification",
] as const;

export const COVERAGE_LIMITATIONS_DISCLAIMER =
  "Schema-backed claims and harvested text candidates only. Full rendered page assertion coverage requires active agent completeness check. Jev selection cannot recover evidence excluded from the candidate pool.";

/** Compute SHA-256 hash of normalized text. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * Builds a deterministic evidence index from repository artifacts.
 * Deterministic, offline, and reusable across multiple nodes.
 */
export function buildEvidenceIndex(root: string): EvidenceIndex {
  const items: IndexedEvidence[] = [];
  const itemsByHash = new Map<string, IndexedEvidence>();
  const itemsById = new Map<string, IndexedEvidence>();

  const registerItem = (item: IndexedEvidence) => {
    if (!itemsByHash.has(item.hash)) {
      itemsByHash.set(item.hash, item);
      itemsById.set(item.id, item);
      items.push(item);
    }
  };

  // 1. Index business.json evidence entries
  const busPath = join(root, "onboarding/business.json");
  if (existsSync(busPath)) {
    try {
      const bus = json<Business>(busPath);
      for (const ev of bus.evidence || []) {
        if (!ev.excerpt?.trim()) continue;
        const hash = contentHash(ev.excerpt);
        registerItem({
          id: ev.id,
          source: ev.source,
          hash,
          text: ev.excerpt.trim(),
          candidateType: "business_fact",
        });
      }
    } catch {}
  }

  // 2. Index raw harvested JSON files in onboarding/raw/
  const rawDir = join(root, "onboarding/raw");
  if (existsSync(rawDir)) {
    try {
      const files = readdirSync(rawDir).filter(f => f.endsWith(".json"));
      for (const file of files) {
        const full = join(rawDir, file);
        try {
          const content = readFileSync(full, "utf8");
          const parsed = JSON.parse(content);
          // Index page text excerpts
          if (Array.isArray(parsed.pages)) {
            for (let pIdx = 0; pIdx < parsed.pages.length; pIdx++) {
              const page = parsed.pages[pIdx];
              const pageText = typeof page.text === "string" ? page.text : typeof page.content === "string" ? page.content : "";
              if (pageText.trim()) {
                const excerpts = pageText.split(/\n\s*\n/).map((s: string) => s.trim()).filter((s: string) => s.length > 30);
                for (let eIdx = 0; eIdx < excerpts.length; eIdx++) {
                  const exc = excerpts[eIdx]!;
                  const hash = contentHash(exc);
                  registerItem({
                    id: `raw:${file}:${pIdx}:${eIdx}`,
                    source: `onboarding/raw/${file}#page${pIdx}`,
                    hash,
                    text: exc,
                    candidateType: "harvest_raw",
                  });
                }
              }
            }
          }
        } catch {}
      }
    } catch {}
  }

  // 3. Index onboarding/brief.json
  const briefPath = join(root, "onboarding/brief.json");
  if (existsSync(briefPath)) {
    try {
      const brief = JSON.parse(readFileSync(briefPath, "utf8"));
      if (typeof brief.overview === "string" && brief.overview.trim()) {
        registerItem({
          id: "brief:overview",
          source: "onboarding/brief.json#overview",
          hash: contentHash(brief.overview),
          text: brief.overview.trim(),
          candidateType: "brief",
        });
      }
    } catch {}
  }

  return {
    generatedAt: new Date().toISOString(),
    items,
    itemsByHash,
    itemsById,
  };
}

/**
 * Extracts schema-backed claims and checks their candidate evidence coverage.
 * Explicitly records limitations: does NOT claim deterministic extraction of all
 * unlisted factual assertions in rendered HTML; requires agent completeness check.
 */
export function extractSchemaClaimsAndCoverage(root: string, index?: EvidenceIndex): CandidateCoverageReport {
  const claims: SchemaClaim[] = [];
  const activeIndex = index || buildEvidenceIndex(root);

  // 1. Extract from onboarding/business.json
  const busPath = join(root, "onboarding/business.json");
  if (existsSync(busPath)) {
    try {
      const bus = json<Business>(busPath);
      // Business facts
      for (const fact of bus.facts || []) {
        claims.push({
          id: fact.id,
          claim: fact.claim,
          field: "facts",
          sourceFile: "onboarding/business.json",
          citedEvidenceIds: fact.evidence || [],
        });
      }
      // Business offer, audience, positioning
      if (bus.offer) {
        claims.push({
          id: "business:offer",
          claim: bus.offer,
          field: "offer",
          sourceFile: "onboarding/business.json",
          citedEvidenceIds: [],
        });
      }
      if (bus.audience) {
        claims.push({
          id: "business:audience",
          claim: bus.audience,
          field: "audience",
          sourceFile: "onboarding/business.json",
          citedEvidenceIds: [],
        });
      }
      if (bus.positioning) {
        claims.push({
          id: "business:positioning",
          claim: bus.positioning,
          field: "positioning",
          sourceFile: "onboarding/business.json",
          citedEvidenceIds: [],
        });
      }
      // Business includes
      if (Array.isArray(bus.includes)) {
        for (let i = 0; i < bus.includes.length; i++) {
          const inc = bus.includes[i]!;
          claims.push({
            id: `business:includes:${i}`,
            claim: `Includes: ${inc}`,
            field: `includes[${i}]`,
            sourceFile: "onboarding/business.json",
            citedEvidenceIds: [],
          });
        }
      }
    } catch {}
  }

  // 2. Extract from onboarding/copy-plan.json if present
  const copyPath = join(root, "onboarding/copy-plan.json");
  if (existsSync(copyPath)) {
    try {
      const cp = json<{
        version?: number;
        pages?: { path: string; sections?: { id: string; heading?: string; body?: string; factIds?: string[] }[] }[];
        routes?: { path: string; headline?: string; factIds?: string[] }[];
      }>(copyPath);
      if (Array.isArray(cp.pages)) {
        for (const p of cp.pages) {
          for (const s of p.sections || []) {
            if (s.heading || s.body) {
              claims.push({
                id: `copy:${p.path}:${s.id}`,
                claim: [s.heading, s.body].filter(Boolean).join(" - "),
                field: `pages[${p.path}].${s.id}`,
                sourceFile: "onboarding/copy-plan.json",
                citedEvidenceIds: s.factIds || [],
              });
            }
          }
        }
      }
      if (Array.isArray(cp.routes)) {
        for (const r of cp.routes) {
          if (r.headline) {
            claims.push({
              id: `copy:${r.path}:headline`,
              claim: `Route ${r.path} headline: "${r.headline}"`,
              field: "headline",
              sourceFile: "onboarding/copy-plan.json",
              citedEvidenceIds: r.factIds || [],
            });
          }
        }
      }
    } catch {}
  }

  // Measure coverage against the candidate evidence pool
  const uncoveredClaims: SchemaClaim[] = [];
  let coveredCount = 0;

  for (const c of claims) {
    const hasCitedEvidence = c.citedEvidenceIds.some(id => activeIndex.itemsById.has(id));
    if (hasCitedEvidence) {
      coveredCount++;
    } else {
      uncoveredClaims.push(c);
    }
  }

  return {
    schemaBackedClaims: claims,
    candidateEvidenceCount: activeIndex.items.length,
    coveredClaimsCount: coveredCount,
    uncoveredClaims,
    coverageLimitations: COVERAGE_LIMITATIONS_DISCLAIMER,
    requiresAgentCompletenessCheck: true,
  };
}

/**
 * Deterministic candidate pre-filtering before semantic scoring.
 * Separates inexpensive lexical/candidate filtering from model-based scoring.
 */
export function prefilterCandidatesByTerms(
  candidates: IndexedEvidence[],
  terms: string[],
  limit = 20
): IndexedEvidence[] {
  const normTerms = terms.map(t => t.toLowerCase().trim()).filter(Boolean);
  if (!normTerms.length) return candidates.slice(0, limit);

  const scored = candidates.map(cand => {
    const text = `${cand.source} ${cand.text}`.toLowerCase();
    let score = 0;
    for (const term of normTerms) {
      if (text.includes(term)) score++;
    }
    return { cand, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.cand.id.localeCompare(b.cand.id))
    .map(s => s.cand)
    .slice(0, limit);
}
