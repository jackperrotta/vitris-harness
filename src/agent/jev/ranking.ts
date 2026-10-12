import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IndexedEvidence } from "./indexing.ts";
import type { EvidenceLedgerItem } from "./ledger.ts";
import type { JevClient } from "./client.ts";
import { partitionBatchItems, executeBatches } from "./batching.ts";
import { makeEvidenceRelevanceScoreQuestion } from "./questions.ts";
import { applyQuestionFanoutBounds } from "./bounds.ts";

/**
 * Local lexical / character n-gram cosine similarity retrieval utility.
 *
 * NOTE: This is a local algorithmic / lexical helper for evidence slicing and relevance sorting.
 * It is NOT an evaluated TypeSafe/Jev neural model ranker or Choice/Score model inference endpoint.
 * Reported token metrics reflect budget formatting bounds rather than demonstrated model-driven token savings.
 * Cross-stage consistency, focused critic context, typed coverage partitions, and preference scoring remain pending.
 */

export interface RankedEvidenceItem {
  id: string;
  source: string;
  excerpt: string;
  lexicalScore: number;
  semanticScore: number;
  combinedScore: number;
  reason: string;
  retrievalMethod?: string;
  jevScore?: number;
  jevConfidence?: number;
  probabilities?: Record<string, number>;
  mandatory?: boolean;
}

export interface QueryEmbeddingEntry {
  query: string;
  hash: string;
  vector: Record<string, number>;
  createdAt: string;
}

export class QueryEmbeddingCache {
  private cache: Map<string, QueryEmbeddingEntry> = new Map();
  private diskPath?: string;

  constructor(diskPath?: string) {
    this.diskPath = diskPath;
    if (this.diskPath && existsSync(this.diskPath)) {
      try {
        const raw = JSON.parse(readFileSync(this.diskPath, "utf8"));
        if (Array.isArray(raw)) {
          for (const entry of raw) {
            if (entry.hash && entry.vector) {
              this.cache.set(entry.hash, entry);
            }
          }
        }
      } catch {}
    }
  }

  public get(query: string): Record<string, number> | undefined {
    const hash = createHash("sha256").update(query.trim().toLowerCase()).digest("hex");
    return this.cache.get(hash)?.vector;
  }

  public set(query: string, vector: Record<string, number>): void {
    const hash = createHash("sha256").update(query.trim().toLowerCase()).digest("hex");
    const entry: QueryEmbeddingEntry = {
      query: query.trim(),
      hash,
      vector,
      createdAt: new Date().toISOString(),
    };
    this.cache.set(hash, entry);

    if (this.diskPath) {
      try {
        const dir = join(this.diskPath, "..");
        mkdirSync(dir, { recursive: true });
        writeFileSync(this.diskPath, JSON.stringify(Array.from(this.cache.values()), null, 2), "utf8");
      } catch {}
    }
  }

  public size(): number {
    return this.cache.size;
  }
}

/** Computes character 3-gram and token frequency vector for dense semantic similarity. */
export function computeDenseVector(text: string): Record<string, number> {
  const norm = text.toLowerCase().replace(/[\r\n\t]+/g, " ");
  const vec: Record<string, number> = {};

  // Token unigrams
  const tokens = norm.split(/[^a-z0-9_-]+/).filter(t => t.length >= 3);
  for (const t of tokens) {
    vec[`t_${t}`] = (vec[`t_${t}`] || 0) + 1;
  }

  // Character 3-grams
  for (let i = 0; i <= norm.length - 3; i++) {
    const gram = norm.slice(i, i + 3);
    if (!/^\s+$/.test(gram)) {
      vec[`g_${gram}`] = (vec[`g_${gram}`] || 0) + 1;
    }
  }

  // Normalize vector to unit length
  let sumSq = 0;
  for (const v of Object.values(vec)) {
    sumSq += v * v;
  }
  const mag = Math.sqrt(sumSq) || 1;
  for (const k of Object.keys(vec)) {
    vec[k] = parseFloat((vec[k]! / mag).toFixed(4));
  }

  return vec;
}

/** Computes cosine similarity between two normalized dense vectors in [0, 1]. */
export function cosineSimilarity(vecA: Record<string, number>, vecB: Record<string, number>): number {
  let dot = 0;
  for (const [k, vA] of Object.entries(vecA)) {
    const vB = vecB[k];
    if (vB !== undefined) {
      dot += vA * vB;
    }
  }
  return Math.min(1.0, Math.max(0.0, parseFloat(dot.toFixed(4))));
}

/** Stage 1: Lexical retrieval using token matching and query term frequency. */
export function lexicalRetrieve<T extends { id: string; source: string; text?: string; excerpt?: string }>(
  candidates: T[],
  query: string,
  limit = 30
): T[] {
  const queryTerms = query
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter(t => t.length >= 2);

  if (!queryTerms.length) return candidates.slice(0, limit);

  const scored = candidates.map(item => {
    const content = `${item.source} ${item.text || item.excerpt || ""}`.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (content.includes(term)) {
        score += 1;
      }
    }
    return { item, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .map(s => s.item)
    .slice(0, limit);
}

/** Stage 2: Dense semantic re-ranking with query embedding cache. */
export function semanticRerank<T extends { id: string; source: string; text?: string; excerpt?: string }>(
  candidates: T[],
  query: string,
  options?: {
    cache?: QueryEmbeddingCache;
  }
): RankedEvidenceItem[] {
  const queryNorm = query.trim();
  let queryVec = options?.cache?.get(queryNorm);
  if (!queryVec) {
    queryVec = computeDenseVector(queryNorm);
    options?.cache?.set(queryNorm, queryVec);
  }

  const queryTerms = queryNorm
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter(t => t.length >= 2);

  return candidates.map(item => {
    const excerpt = (item.text || item.excerpt || "").trim();
    const content = `${item.source} ${excerpt}`;

    // Lexical score
    let matchCount = 0;
    const lowerContent = content.toLowerCase();
    for (const t of queryTerms) {
      if (lowerContent.includes(t)) matchCount++;
    }
    const lexicalScore = queryTerms.length > 0 ? Math.min(1.0, matchCount / queryTerms.length) : 0.5;

    // Dense semantic score
    const itemVec = computeDenseVector(content);
    const semanticScore = cosineSimilarity(queryVec!, itemVec);

    // Combined score: 40% lexical + 60% semantic dense similarity
    const combinedScore = parseFloat((0.4 * lexicalScore + 0.6 * semanticScore).toFixed(3));

    let reason = "Background evidence";
    if (combinedScore >= 0.7) {
      reason = "Strong semantic and lexical alignment with query";
    } else if (combinedScore >= 0.4) {
      reason = "Moderate relevance to query topics";
    }

    return {
      id: item.id,
      source: item.source,
      excerpt,
      lexicalScore: parseFloat(lexicalScore.toFixed(3)),
      semanticScore,
      combinedScore,
      reason,
      retrievalMethod: "lexical_token_frequency+dense_ngram_cosine",
    };
  }).sort((a, b) => b.combinedScore - a.combinedScore || a.id.localeCompare(b.id));
}

/**
 * End-to-end two-stage retrieval and slicing:
 * 1. Lexical retrieval collects top candidates.
 * 2. Dense semantic similarity re-ranks candidates against active query.
 * 3. Compact slicing fits top evidence within token/character budget for critics.
 */
export function rankAndSliceEvidence<T extends { id: string; source: string; text?: string; excerpt?: string }>(
  candidates: T[],
  query: string,
  options?: {
    lexicalLimit?: number;
    maxItems?: number;
    tokenBudget?: number; // approx chars / 4
    cache?: QueryEmbeddingCache;
    minScore?: number;
  }
): {
  ranked: RankedEvidenceItem[];
  slicedItems: RankedEvidenceItem[];
  slicedText: string;
  totalCandidates: number;
  droppedCount: number;
} {
  const lexicalLimit = options?.lexicalLimit || 30;
  const maxItems = options?.maxItems || 10;
  const charBudget = (options?.tokenBudget || 3000) * 4;
  const minScore = options?.minScore;

  // Step 1: Lexical retrieval
  const lexicalPool = lexicalRetrieve(candidates, query, lexicalLimit);

  // Step 2: Semantic re-ranking
  const ranked = semanticRerank(lexicalPool, query, { cache: options?.cache });

  // Step 3: Slicing to fit budget
  const slicedItems: RankedEvidenceItem[] = [];
  let currentChars = 0;

  for (const item of ranked) {
    if (slicedItems.length >= maxItems) break;
    if (minScore !== undefined && item.combinedScore < minScore && slicedItems.length > 0) {
      break;
    }
    const itemChars = item.excerpt.length + item.source.length + 50;
    if (currentChars + itemChars > charBudget && slicedItems.length > 0) {
      break;
    }
    slicedItems.push(item);
    currentChars += itemChars;
  }

  const droppedCount = candidates.length - slicedItems.length;

  let slicedText = `### Sliced Verified Evidence (${slicedItems.length} items within budget):\n`;
  for (const item of slicedItems) {
    slicedText += `- **[${item.id}]** (${item.source}) [Relevance: ${(item.combinedScore * 100).toFixed(0)}%]\n`;
    slicedText += `  "${item.excerpt}"\n`;
  }

  return {
    ranked,
    slicedItems,
    slicedText,
    totalCandidates: candidates.length,
    droppedCount,
  };
}

export interface ShortlistRecallResult {
  recall: number;
  totalGold: number;
  coveredGold: number;
  missedGoldIds: string[];
}

/**
 * Measures whether the shortlisted items cover all claims or evidence items
 * that have gold-standard relevance in the full candidate set.
 */
export function measureShortlistRecall<T extends { id: string }>(
  shortlist: T[],
  fullCandidates: T[],
  goldItemIds: string[]
): ShortlistRecallResult {
  if (goldItemIds.length === 0) {
    return { recall: 1.0, totalGold: 0, coveredGold: 0, missedGoldIds: [] };
  }
  const shortlistIds = new Set(shortlist.map(s => s.id));
  const missedGoldIds = goldItemIds.filter(gId => !shortlistIds.has(gId));
  const coveredGold = goldItemIds.length - missedGoldIds.length;
  const recall = parseFloat((coveredGold / goldItemIds.length).toFixed(3));
  return {
    recall,
    totalGold: goldItemIds.length,
    coveredGold,
    missedGoldIds,
  };
}

export function identifyMandatoryEvidenceIds(opts: {
  citedIds?: string[];
  contradictoryIds?: string[];
  mandatoryIds?: string[];
}): string[] {
  return [...new Set([
    ...(opts.citedIds || []),
    ...(opts.contradictoryIds || []),
    ...(opts.mandatoryIds || []),
  ])].filter(Boolean);
}

export interface JevRankedEvidenceResult {
  ranked: RankedEvidenceItem[];
  mandatoryIds: string[];
  contradictoryIds: string[];
  retrievalMethod: string;
  judgedCount: number;
  shortlistCount: number;
}

/**
 * High-recall lexical shortlist, then Jev Score per (claim, excerpt).
 * Cited and contradictory evidence are kept regardless of rank.
 * Raw scores are retained on each item so thresholds can change without another call.
 */
function lexicalOverlap(claim: string, excerpt: string): boolean {
  const terms = claim.toLowerCase().split(/[^a-z0-9_-]+/).filter(t => t.length >= 3);
  if (!terms.length) return false;
  const hay = excerpt.toLowerCase();
  return terms.some(t => hay.includes(t));
}

export async function rankOptionalEvidenceWithJev<T extends { id: string; source: string; text?: string; excerpt?: string }>(opts: {
  client: JevClient;
  evidence: T[];
  claims: Array<{ id: string; claim: string; evidenceIds?: string[] }>;
  query?: string;
  citedIds?: string[];
  contradictoryIds?: string[];
  mandatoryIds?: string[];
  lexicalLimit?: number;
  perClaimLimit?: number;
  nodeId?: string;
  signal?: AbortSignal;
}): Promise<JevRankedEvidenceResult> {
  const mandatoryIds = identifyMandatoryEvidenceIds(opts);
  const contradictoryIds = [...new Set(opts.contradictoryIds || [])];
  const byId = new Map(opts.evidence.map(e => [e.id, e]));
  const query = (opts.query || opts.claims.map(c => c.claim).join(" ")).trim() || "business evidence";
  const perClaimLimit = opts.perClaimLimit ?? 8;
  const lexicalLimit = opts.lexicalLimit ?? 30;

  const shortlistIds = new Set<string>(mandatoryIds);
  const optional = opts.evidence.filter(e => !shortlistIds.has(e.id));
  const globalShortlist = lexicalRetrieve(optional, query, lexicalLimit);
  for (const item of globalShortlist) shortlistIds.add(item.id);

  const items: Array<{
    id: string;
    claimId: string;
    evidenceId: string;
    claim: string;
    excerpt: string;
    source: string;
  }> = [];
  const seenPair = new Set<string>();
  const enqueue = (claim: { id: string; claim: string }, ev: T) => {
    const pair = `${claim.id}:${ev.id}`;
    if (seenPair.has(pair)) return;
    seenPair.add(pair);
    shortlistIds.add(ev.id);
    items.push({
      id: `rel_${claim.id}_${ev.id}`,
      claimId: claim.id,
      evidenceId: ev.id,
      claim: claim.claim,
      excerpt: (ev.excerpt || ev.text || "").trim(),
      source: ev.source,
    });
  };
  for (const claim of opts.claims) {
    const cited = new Set(claim.evidenceIds || []);
    for (const id of mandatoryIds) {
      const ev = byId.get(id);
      if (!ev) continue;
      const excerpt = (ev.excerpt || ev.text || "").trim();
      const plausible = cited.has(id) || contradictoryIds.includes(id) || lexicalOverlap(claim.claim, excerpt);
      if (plausible) enqueue(claim, ev);
    }
    for (const ev of lexicalRetrieve(optional, claim.claim, perClaimLimit)) {
      enqueue(claim, ev);
    }
  }

  const { kept: boundedItems, overflow } = applyQuestionFanoutBounds(items);
  const batchItems = boundedItems.map(item => ({
    id: item.id,
    taskType: "custom" as const,
    questionKey: item.id,
    question: makeEvidenceRelevanceScoreQuestion(item.claim, item.excerpt),
    claimId: item.claimId,
    claim: item.claim,
    evidenceId: item.evidenceId,
    evidenceExcerpt: item.excerpt,
    source: item.source,
  }));

  const scores = new Map<string, { score: number; confidence: number; probabilities?: Record<string, number> }>();
  let judgedCount = 0;
  if (batchItems.length > 0) {
    const { partitions } = partitionBatchItems(batchItems);
    if (partitions.length > 0) {
      const executed = await executeBatches({
        client: opts.client,
        partitions,
        signal: opts.signal,
        nodeId: opts.nodeId,
      });
      for (const item of items) {
        const ans = executed.answers[item.id] as { score?: number; confidence?: number; probabilities?: Record<string, number> } | undefined;
        if (typeof ans?.score !== "number") continue;
        judgedCount++;
        const prev = scores.get(item.evidenceId);
        if (!prev || ans.score > prev.score) {
          scores.set(item.evidenceId, {
            score: ans.score,
            confidence: ans.confidence ?? 0,
            probabilities: ans.probabilities,
          });
        }
      }
    }
  }

  const ranked: RankedEvidenceItem[] = [];
  const seen = new Set<string>();
  const push = (id: string, reason: string, forced: boolean) => {
    if (seen.has(id)) return;
    const ev = byId.get(id);
    if (!ev) return;
    seen.add(id);
    const excerpt = (ev.excerpt || ev.text || "").trim();
    const judged = scores.get(id);
    const lexicalScore = globalShortlist.some(s => s.id === id) || forced ? 1 : 0.3;
    const semanticScore = judged ? judged.score / 4 : 0;
    ranked.push({
      id,
      source: ev.source,
      excerpt,
      lexicalScore,
      semanticScore,
      combinedScore: judged ? parseFloat((0.35 * lexicalScore + 0.65 * semanticScore).toFixed(3)) : lexicalScore,
      reason,
      retrievalMethod: judged ? "lexical_shortlist+jev_score" : "lexical_shortlist",
      jevScore: judged?.score,
      jevConfidence: judged?.confidence,
      probabilities: judged?.probabilities,
      mandatory: forced,
    });
  };

  for (const id of contradictoryIds) push(id, "Contradictory evidence retained regardless of rank", true);
  for (const id of mandatoryIds) {
    if (!contradictoryIds.includes(id)) push(id, "Cited or otherwise mandatory evidence retained regardless of rank", true);
  }
  const optionalRanked = [...shortlistIds]
    .filter(id => !mandatoryIds.includes(id) && !contradictoryIds.includes(id))
    .map(id => ({ id, score: scores.get(id)?.score ?? -1 }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  for (const item of optionalRanked) {
    const judged = scores.get(item.id);
    push(
      item.id,
      judged ? `Jev relevance score ${judged.score}/4` : "Lexical shortlist; Jev score unavailable",
      false
    );
  }

  return {
    ranked,
    mandatoryIds,
    contradictoryIds,
    retrievalMethod: judgedCount > 0 ? "lexical_shortlist+jev_score" : "lexical_shortlist",
    judgedCount,
    shortlistCount: shortlistIds.size,
  };
}



