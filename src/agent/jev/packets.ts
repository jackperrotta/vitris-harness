import {kernelScriptCommand} from "../kernel-commands.ts";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fingerprint, json, type Business, type NarrativeBrief, type Storyboard } from "../artifacts.ts";
import { reviewSubject } from "../evaluate.ts";
import { contextPacket } from "../runner.ts";
import type { SkillGraph, AgentState, GraphNode } from "../graph.ts";
import { isPathConfined } from "./security.ts";
import { rehashOverflowContent } from "./state.ts";
import { rankAndSliceEvidence, lexicalRetrieve, type RankedEvidenceItem } from "./ranking.ts";
import { isCapabilityActive, resolveEffectiveCapabilities } from "./config.ts";
import type { JevConfig } from "./types.ts";

export const SUPPORTED_COMPACT_NODES = [
  "business-review",
  "narrative-review",
  "direction-review",
  "copy-review",
] as const;

export type SupportedCompactNode = (typeof SUPPORTED_COMPACT_NODES)[number];

export function isCompactSupportedNode(nodeId: string): boolean {
  return (SUPPORTED_COMPACT_NODES as readonly string[]).includes(nodeId);
}

export interface NodePacketBudget {
  maxChars: number;
  maxEvidenceChars: number;
}

export const DEFAULT_PACKET_BUDGETS: Record<string, NodePacketBudget> = {
  "business-review": { maxChars: 25000, maxEvidenceChars: 12000 },
  "narrative-review": { maxChars: 25000, maxEvidenceChars: 12000 },
  "direction-review": { maxChars: 30000, maxEvidenceChars: 15000 },
  "copy-review": { maxChars: 35000, maxEvidenceChars: 18000 },
  default: { maxChars: 30000, maxEvidenceChars: 15000 },
};

export interface ManifestItem {
  path: string;
  bytes?: number;
  reason: string;
  section?: string;
}

export interface ExpandableItem {
  id: string;
  path: string;
  description: string;
  bytes: number;
  hash?: string;
}

export interface DiverseEvidenceSelectionResult<T> {
  selected: T[];
  overflow: T[];
}

/**
 * Selects evidence candidates with guaranteed diversity across sources.
 * Prevents a single document or URL from monopolizing the packet budget.
 */
export function selectDiverseEvidence<T extends { id: string; source: string; score?: number; excerpt?: string }>(
  items: T[],
  maxChars: number,
  lengthFn: (item: T) => number = (item) => (item.excerpt?.length ?? 100),
  maxPerSource = 2
): DiverseEvidenceSelectionResult<T> {
  if (!items || items.length === 0) {
    return { selected: [], overflow: [] };
  }

  // Sort by score descending, preserving stable order
  const sorted = [...items].sort((a, b) => ((b.score ?? 0.5) - (a.score ?? 0.5)) || a.id.localeCompare(b.id));

  const selected: T[] = [];
  const overflow: T[] = [];
  const perSourceCount = new Map<string, number>();
  let currentChars = 0;

  // Pass 1: Select up to maxPerSource from each distinct source
  const deferred: T[] = [];
  for (const item of sorted) {
    const src = item.source || "unknown";
    const count = perSourceCount.get(src) || 0;
    const itemLen = lengthFn(item);

    if (count < maxPerSource) {
      if (currentChars + itemLen <= maxChars) {
        selected.push(item);
        perSourceCount.set(src, count + 1);
        currentChars += itemLen;
      } else {
        deferred.push(item);
      }
    } else {
      deferred.push(item);
    }
  }

  // Pass 2: Fill remaining budget with deferred items
  for (const item of deferred) {
    const itemLen = lengthFn(item);
    if (currentChars + itemLen <= maxChars) {
      selected.push(item);
      currentChars += itemLen;
    } else {
      overflow.push(item);
    }
  }

  return { selected, overflow };
}

export interface ObligationPartitionResult<T> {
  included: T[];
  partitioned: T[];
  partitionedObligations: string[];
}

/**
 * Partitions items by obligation boundary when required items exceed budget.
 * Keeps entire obligations intact rather than arbitrarily truncating text mid-sentence or mid-claim.
 */
export function partitionByObligation<T extends { obligationId?: string; bytes?: number; content?: string }>(
  items: T[],
  maxBudget: number,
  sizeFn: (item: T) => number = (item) => item.bytes ?? item.content?.length ?? 0
): ObligationPartitionResult<T> {
  const groups = new Map<string, { items: T[]; totalSize: number }>();

  // Group items by obligationId (or '__unscoped__' if not set)
  for (const item of items) {
    const oblId = item.obligationId || "__unscoped__";
    const group = groups.get(oblId) || { items: [], totalSize: 0 };
    group.items.push(item);
    group.totalSize += sizeFn(item);
    groups.set(oblId, group);
  }

  const included: T[] = [];
  const partitioned: T[] = [];
  const partitionedObligations: string[] = [];
  let currentSize = 0;

  for (const [oblId, group] of groups.entries()) {
    if (currentSize + group.totalSize <= maxBudget) {
      included.push(...group.items);
      currentSize += group.totalSize;
    } else {
      partitioned.push(...group.items);
      if (oblId !== "__unscoped__") {
        partitionedObligations.push(oblId);
      }
    }
  }

  return { included, partitioned, partitionedObligations };
}

export interface PacketItem {
  id: string;
  kind: "instruction" | "contract" | "subject" | "evidence" | "preflight" | "constraint" | "obligation" | "repair";
  required: boolean;
  obligationId?: string;
  content: string;
  sourceHash: string;
  bytes: number;
}

export interface CoverageManifest {
  schemaVersion: 1;
  nodeId: string;
  generatedAt: string;
  manifestHash?: string;
  requiredPartitions?: string[];
  included: ManifestItem[];
  excluded: ManifestItem[];
  expandable: ExpandableItem[];
  items?: PacketItem[];
}

export interface CompactPacketResult {
  packetText: string;
  manifest: CoverageManifest;
  oversize: boolean;
  warnings: string[];
}

export interface RankedExcerpt {
  id: string;
  source: string;
  excerpt: string;
  score: number;
  reason: string;
}

/**
 * Computes per-excerpt relevance scores against node task keywords, change requests, or defect targets.
 * Code ranks candidates deterministically; mandatory evidence is preserved independently.
 */
export function rankEvidenceRelevance(
  excerpts: Array<{ id: string; source: string; excerpt: string }>,
  contextTerms: string[]
): RankedExcerpt[] {
  const terms = contextTerms.map(t => t.toLowerCase().trim()).filter(Boolean);

  return excerpts.map(ev => {
    const text = `${ev.source} ${ev.excerpt}`.toLowerCase();
    let score = 0.5; // baseline neutral score
    let matchCount = 0;

    for (const term of terms) {
      if (text.includes(term)) {
        matchCount++;
        score += 0.15;
      }
    }

    // Boost citations from primary source pages or legal/about/contact pages
    if (/\b(home|index|contact|about|pricing|services)\b/i.test(ev.source)) {
      score += 0.1;
    }

    const clampedScore = Math.min(1.0, Math.max(0.0, parseFloat(score.toFixed(3))));
    return {
      id: ev.id,
      source: ev.source,
      excerpt: ev.excerpt,
      score: clampedScore,
      reason: matchCount > 0 ? `Matches ${matchCount} context term(s)` : "General background evidence",
    };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Slices only the relevant sections of contracts.md for a given review node. */
export function extractContractSlice(kernelRoot: string, nodeId: string): string {
  const contractsPath = join(kernelRoot, "agent/refs/contracts.md");
  if (!existsSync(contractsPath)) return "";
  const full = readFileSync(contractsPath, "utf8");

  const lines = full.split(/\r?\n/);
  const relevantLines: string[] = [
    "# Relevant Artifact Contracts (Structured Sliced View)",
    "Workflow graph version is 3. Inspect only the criteria and artifacts pertinent to this checkpoint.\n",
  ];

  const nodeToArtifactBullets: Record<string, string[]> = {
    "business-review": ["- Business:", "- Review:"],
    "narrative-review": ["- Narrative:", "- Business:", "- Review:"],
    "direction-review": ["- Direction:", "- Review:"],
    "copy-review": ["- Storyboard:", "- Copy:", "- Review:"],
  };

  const bulletsToInclude = nodeToArtifactBullets[nodeId] || ["- Review:"];

  for (const line of lines) {
    if (bulletsToInclude.some(prefix => line.startsWith(prefix))) {
      relevantLines.push(line);
    }
    if (line.startsWith(`- ${nodeId}:`)) {
      relevantLines.push("\nReview criteria:");
      relevantLines.push(line);
    }
  }

  return relevantLines.join("\n");
}

/** Computes the canonical SHA256 content hash of coverage manifest items. */
export function computeManifestHash(manifest: {
  nodeId: string;
  included: ManifestItem[];
  excluded?: ManifestItem[];
  expandable: ExpandableItem[];
  requiredPartitions?: string[];
}): string {
  const manifestData = {
    nodeId: manifest.nodeId,
    included: manifest.included,
    excluded: manifest.excluded || [],
    expandable: manifest.expandable,
    requiredPartitions: manifest.requiredPartitions || [],
  };
  return createHash("sha256").update(JSON.stringify(manifestData)).digest("hex");
}

export function logPacketExpansion(root: string, nodeId: string, expansionId: string): void {
  const logDir = join(root, "agent/runs");
  mkdirSync(logDir, { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    nodeId,
    expansionId,
  };
  appendFileSync(join(logDir, "packet-expansions.log"), JSON.stringify(entry) + "\n", "utf8");
}

export function expandPacketItem(root: string, nodeId: string, expansionId: string, manifestHash?: string): string {
  const manifestPath = join(root, "agent/runs", `${nodeId}.manifest.json`);
  if (!existsSync(manifestPath)) {
    throw new Error(`No coverage manifest found for node: ${nodeId}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CoverageManifest;

  // Recompute actual manifest hash from disk contents to verify manifest integrity
  const actualHash = computeManifestHash(manifest);
  if (manifest.manifestHash && manifest.manifestHash !== actualHash) {
    throw new Error(`Manifest integrity violation for ${nodeId}: stored hash ${manifest.manifestHash} does not match computed content hash ${actualHash}`);
  }

  if (manifestHash) {
    if (!actualHash.startsWith(manifestHash)) {
      throw new Error(`Manifest hash mismatch for ${nodeId}: expected ${manifestHash}, found ${actualHash.slice(0, manifestHash.length)}`);
    }
  }

  const item = manifest.expandable.find(e => e.id === expansionId);
  if (!item) {
    throw new Error(`Expansion ID "${expansionId}" not found in manifest for ${nodeId}`);
  }
  const confinement = isPathConfined(root, item.path);
  if (!confinement.safe) {
    throw new Error(`Path traversal violation: expansion path ${item.path} resolves outside workspace root (${confinement.reason || "escapes root"})`);
  }
  if (!existsSync(confinement.resolvedPath)) {
    throw new Error(`File referenced by expansion ID does not exist: ${item.path}`);
  }
  if (item.hash) {
    const actualOverflowHash = rehashOverflowContent(confinement.resolvedPath);
    if (actualOverflowHash !== item.hash) {
      throw new Error(`Content tampering violation for expansion ${expansionId}: stored hash ${item.hash} does not match file bytes hash ${actualOverflowHash}`);
    }
  }
  const content = readFileSync(confinement.resolvedPath, "utf8");
  logPacketExpansion(root, nodeId, expansionId);
  return content;
}

/**
 * Builds a bounded, compact context packet for a node.
 * Slices mandatory contracts, embeds essential verbatim evidence excerpts,
 * generates a coverage manifest, and defines explicit expansion paths.
 */
export function buildCompactContextPacket(opts: {
  root: string;
  kernel: string;
  graph: SkillGraph;
  state: AgentState;
  node: GraphNode;
  preflightSummary?: string;
  budget?: NodePacketBudget;
  jevConfig?: JevConfig;
  /** Jev Score ranks for optional evidence. Shadow must omit this so packets match off. */
  jevRankedEvidence?: RankedEvidenceItem[];
  mandatoryEvidenceIds?: string[];
}): CompactPacketResult {
  const { root, kernel, graph, state, node, preflightSummary, jevConfig } = opts;

  if (!isCompactSupportedNode(node.id)) {
    const fallbackText = contextPacket(root, graph, state, node);
    return {
      packetText: fallbackText,
      manifest: {
        schemaVersion: 1,
        nodeId: node.id,
        generatedAt: new Date().toISOString(),
        included: [{ path: "contextPacket:fallback", reason: "Standard context packet used for unsupported compact node" }],
        excluded: [],
        expandable: [],
      },
      oversize: false,
      warnings: [`Node "${node.id}" is not in compact packet whitelist; falling back to standard contextPacket.`],
    };
  }

  const budget = opts.budget || DEFAULT_PACKET_BUDGETS[node.id] || DEFAULT_PACKET_BUDGETS["default"]!;

  const included: ManifestItem[] = [];
  const excluded: ManifestItem[] = [];
  const expandable: ExpandableItem[] = [];
  const warnings: string[] = [];

  const basePrompt = readFileSync(join(root, "agent/PROMPT.md"), "utf8");
  included.push({ path: "agent/PROMPT.md", bytes: Buffer.byteLength(basePrompt, "utf8"), reason: "Base agent prompt" });

  let contractSlice = extractContractSlice(kernel, node.id);
  included.push({ path: "agent/refs/contracts.md", section: node.id, bytes: Buffer.byteLength(contractSlice, "utf8"), reason: "Sliced contract definition" });

  const feedback = (state.nodes[node.id]?.failures || []).map(f => `${node.id}: ${f}`);

  let activeEvidenceText = "";
  if (node.id === "business-review") {
    const busPath = join(root, "onboarding/business.json");
    if (existsSync(busPath)) {
      const bus = json<Business>(busPath);
      const rawBytes = Buffer.byteLength(JSON.stringify(bus), "utf8");
      included.push({ path: "onboarding/business.json", bytes: rawBytes, reason: "Review subject" });

      activeEvidenceText += `\n### Business Overview\n- Offer: ${bus.offer}\n- Audience: ${bus.audience}\n- Engagement: ${bus.engagement}\n`;
      activeEvidenceText += `\n### Harvested Facts (${bus.facts?.length || 0} claims):\n`;
      for (const fact of (bus.facts || [])) {
        activeEvidenceText += `- [${fact.id}] ${fact.claim} (evidence: ${(fact.evidence || []).join(", ")})\n`;
      }
      activeEvidenceText += `\n### Evidence Excerpts (${bus.evidence?.length || 0} excerpts):\n`;
      const contextTerms = [node.id.replace("-review", ""), ...(bus.facts || []).map(f => f.claim)];
      if (existsSync(join(root, "agent/change-request.json"))) {
        try {
          const cr = json<any>(join(root, "agent/change-request.json"));
          if (cr.instruction) contextTerms.push(...cr.instruction.split(/\s+/));
        } catch {}
      }
      for (const fb of feedback) contextTerms.push(...fb.split(/\s+/));

      const effectiveCaps = jevConfig ? resolveEffectiveCapabilities(jevConfig) : undefined;
      if (effectiveCaps?.retrievalRanking === "assist") {
        const query = contextTerms.join(" ") || "business grounding facts";
        const allEvidence = bus.evidence || [];
        const citedIds = (bus.facts || []).flatMap(f => f.evidence || []);
        const mandatoryIds = [...new Set([...(opts.mandatoryEvidenceIds || []), ...citedIds])];
        const selectedIds: string[] = [];
        const seen = new Set<string>();
        let evidenceChars = 0;
        const take = (id: string, force: boolean) => {
          if (seen.has(id)) return;
          const ev = allEvidence.find(e => e.id === id);
          if (!ev) return;
          const line = `- [${ev.id}] (${ev.source}) "${ev.excerpt}"\n`;
          if (!force && selectedIds.length > 0 && evidenceChars + line.length > budget.maxEvidenceChars) {
            return;
          }
          seen.add(id);
          selectedIds.push(id);
          evidenceChars += line.length;
          activeEvidenceText += line;
        };
        for (const id of mandatoryIds) take(id, true);
        if (opts.jevRankedEvidence && opts.jevRankedEvidence.length > 0) {
          const ordered = [...opts.jevRankedEvidence].sort((a, b) => {
            if (a.mandatory && !b.mandatory) return -1;
            if (!a.mandatory && b.mandatory) return 1;
            return b.combinedScore - a.combinedScore || a.id.localeCompare(b.id);
          });
          for (const item of ordered) take(item.id, Boolean(item.mandatory));
        } else {
          const optional = allEvidence.filter(e => !seen.has(e.id));
          for (const item of lexicalRetrieve(optional, query, 30)) take(item.id, false);
        }
        for (const ev of allEvidence) {
          if (seen.has(ev.id)) continue;
          expandable.push({
            id: `evidence-${ev.id}`,
            path: ev.source,
            description: `Full source context for evidence ${ev.id}`,
            bytes: ev.excerpt.length,
          });
          excluded.push({
            path: ev.source,
            reason: opts.jevRankedEvidence?.length
              ? "Budget constraint (Jev Score rank of optional evidence; mandatory/contradictory kept)"
              : "Budget constraint (lexical shortlist; mandatory/contradictory kept)",
            section: `evidence-${ev.id}`,
          });
        }
      } else {
        if (effectiveCaps?.retrievalRanking === "shadow") {
          // Shadow mode: compute proposed ranking for audit/telemetry, but do not alter packet content
          try {
            const query = contextTerms.join(" ") || "business grounding facts";
            rankAndSliceEvidence(bus.evidence || [], query, {
              tokenBudget: Math.floor(budget.maxEvidenceChars / 4),
            });
          } catch {}
        }
        const ranked = rankEvidenceRelevance(bus.evidence || [], contextTerms);
        const { selected: diverseSelected, overflow: diverseOverflow } = selectDiverseEvidence(
          ranked,
          budget.maxEvidenceChars,
          (ev) => `- [${ev.id}] (${ev.source}) "${ev.excerpt}"\n`.length
        );
        for (const ev of diverseSelected) {
          const line = `- [${ev.id}] (${ev.source}) "${ev.excerpt}"\n`;
          activeEvidenceText += line;
        }
        for (let i = 0; i < diverseOverflow.length; i++) {
          const ev = diverseOverflow[i]!;
          expandable.push({
            id: `evidence-${ev.id}`,
            path: ev.source,
            description: `Full source context for evidence ${ev.id} (Relevance: ${ev.score.toFixed(2)}, rank: ${i + 1})`,
            bytes: ev.excerpt.length,
          });
          excluded.push({
            path: ev.source,
            reason: `Budget constraint (Relevance: ${ev.score.toFixed(2)}; not proven irrelevant)`,
            section: `evidence-${ev.id}`,
          });
        }
      }
    }
  } else if (node.id === "narrative-review") {
    const narrPath = join(root, "onboarding/narrative-brief.json");
    const busPath = join(root, "onboarding/business.json");
    if (existsSync(narrPath)) {
      const narr = json<NarrativeBrief>(narrPath);
      included.push({ path: "onboarding/narrative-brief.json", bytes: Buffer.byteLength(JSON.stringify(narr), "utf8"), reason: "Review subject" });
      activeEvidenceText += `\n### Narrative Brief\n- Customer: ${narr.customer || ""}\n- Offer: ${narr.offer || ""}\n- Service Scope: ${narr.serviceScope || ""}\n`;
    }
    if (existsSync(busPath)) {
      const bus = json<Business>(busPath);
      included.push({ path: "onboarding/business.json", bytes: Buffer.byteLength(JSON.stringify(bus), "utf8"), reason: "Grounding business contract" });
      activeEvidenceText += `\n### Harvested Facts (${bus.facts?.length || 0} claims):\n`;
      for (const fact of (bus.facts || []).slice(0, 15)) {
        activeEvidenceText += `- [${fact.id}] ${fact.claim}\n`;
      }
      if ((bus.facts || []).length > 15) {
        expandable.push({
          id: "business-facts-remaining",
          path: "onboarding/business.json",
          description: `Additional ${(bus.facts || []).length - 15} business facts`,
          bytes: Buffer.byteLength(JSON.stringify(bus.facts?.slice(15)), "utf8"),
        });
      }
    }
  } else if (node.id === "direction-review") {
    const dirPath = join(root, "onboarding/direction.json");
    if (existsSync(dirPath)) {
      const raw = readFileSync(dirPath, "utf8");
      included.push({ path: "onboarding/direction.json", bytes: Buffer.byteLength(raw, "utf8"), reason: "Review subject" });
      if (raw.length > budget.maxEvidenceChars) {
        try {
          const parsed = JSON.parse(raw);
          const summaryObj = {
            selected: parsed.selected,
            rationale: parsed.rationale,
            system: parsed.system ? { personality: parsed.system.personality, typography: parsed.system.typography, colorRoles: parsed.system.colorRoles } : undefined,
            candidatesCount: Array.isArray(parsed.candidates) ? parsed.candidates.length : 0,
            studiesCount: Array.isArray(parsed.studies) ? parsed.studies.length : 0,
          };
          activeEvidenceText += `\n### Direction Specification (Structured Summary)\n${JSON.stringify(summaryObj, null, 2)}\n`;
        } catch {
          activeEvidenceText += `\n### Direction Specification (Summary View)\n${raw.slice(0, 1000)}\n`;
        }
        expandable.push({
          id: "direction-full",
          path: "onboarding/direction.json",
          description: "Full unpartitioned direction specification",
          bytes: raw.length,
        });
      } else {
        activeEvidenceText += `\n### Direction Specification\n${raw}\n`;
      }
    }
    // Check if multi-variant studies exist
    const studiesDir = join(root, "onboarding/studies");
    if (!existsSync(studiesDir)) {
      excluded.push({ path: "onboarding/studies", reason: "Single-site workflow; private study sketches not generated" });
    } else {
      included.push({ path: "onboarding/studies", bytes: 0, reason: "Multi-variant study sketches" });
    }
  } else if (node.id === "copy-review") {
    const copyPath = join(root, "onboarding/copy-plan.json");
    const storyPath = join(root, "onboarding/storyboard.json");
    if (existsSync(copyPath)) {
      const raw = readFileSync(copyPath, "utf8");
      included.push({ path: "onboarding/copy-plan.json", bytes: Buffer.byteLength(raw, "utf8"), reason: "Review subject" });
      if (raw.length > budget.maxEvidenceChars) {
        try {
          const parsed = JSON.parse(raw);
          const pages = Array.isArray(parsed.pages) ? parsed.pages : [];
          const includedPages = [];
          let currentBytes = 0;
          for (const p of pages) {
            const pStr = JSON.stringify(p, null, 2);
            if (currentBytes + pStr.length < budget.maxEvidenceChars && includedPages.length < 3) {
              includedPages.push(p);
              currentBytes += pStr.length;
            }
          }
          const summaryObj = {
            storyboardHash: parsed.storyboardHash,
            totalPages: pages.length,
            includedPages,
            remainingPagesCount: pages.length - includedPages.length,
          };
          activeEvidenceText += `\n### Planned Copy (Structured Partition)\n${JSON.stringify(summaryObj, null, 2)}\n`;
        } catch {
          activeEvidenceText += `\n### Planned Copy (Summary View)\n${raw.slice(0, 1000)}\n`;
        }
        expandable.push({
          id: "copy-plan-full",
          path: "onboarding/copy-plan.json",
          description: "Full unpartitioned copy plan JSON",
          bytes: raw.length,
        });
      } else {
        activeEvidenceText += `\n### Planned Copy\n${raw}\n`;
      }
    }
    if (existsSync(storyPath)) {
      const sb = json<Storyboard>(storyPath);
      included.push({ path: "onboarding/storyboard.json", bytes: Buffer.byteLength(JSON.stringify(sb), "utf8"), reason: "Action consistency reference" });
      activeEvidenceText += `\n### Storyboard Routes & Actions\n`;
      for (const p of sb.pages || []) {
        activeEvidenceText += `Page ${p.path}:\n`;
        for (const sec of p.sections || []) {
          if (sec.action) {
            activeEvidenceText += `  - Section ${sec.id} Action: label="${sec.action.label}" destination="${sec.action.destination}" behavior="${sec.action.behavior}"\n`;
          }
        }
      }
    }
  }

  // Node review scope description
  const reviewScopes: Record<string, string> = {
    "business-review": "Review the business interpretation and its captured evidence. Implementation and browser proof do not exist yet and are not prerequisites for this checkpoint.",
    "narrative-review": "Review the shared narrative brief against harvested evidence. Do not require implemented pages. Reject unsupported public claims and demo-reference identities presented as this business.",
    "direction-review": "Review the design direction. Judge visible aesthetics and fit to the business. Interior implementation is evaluated later.",
    "copy-review": "PRE-IMPLEMENTATION editorial review. For cta-behavior, compare wording with the storyboard's explicit action label, destination and planned behavior. State that planned copy is consistent without claiming the interaction was tested.",
  };
  const reviewScope = reviewScopes[node.id] || "Review artifacts available at this checkpoint.";

  // Render prompt helper
  const renderPrompt = (activeEv: string, mHash: string): string => {
    let text = `${basePrompt}\n\n## COMPACT NODE CONTEXT (Bounded Packet)\nActive node: ${node.id} (${node.kind})\nReview subjectHash: ${reviewSubject(root, node.id)}\nReview boundary: ${reviewScope}\n\n`;
    if (feedback.length) text += `## Failures to repair:\n${feedback.join("\n")}\n\n`;
    text += `## Contract Slices:\n${contractSlice}\n\n`;
    if (preflightSummary?.trim()) {
      text += `## Machine Grounding Preflight Summary:\n${preflightSummary.trim()}\n\n`;
      text += `CRITIC INSTRUCTIONS FOR PREFLIGHT:
1. Automated preflight verdicts are model judgments and supplemental guidance. You are encouraged to recheck primary sources or verify unaddressed claims whenever necessary.
2. Focus your attention and findings on:
   - Flagged claims (insufficient evidence, missing quotes, or contradictions).
   - Unlisted assertions in the copy that were omitted from declared facts.
   - Overall tone, clarity, typography, and narrative structure.\n\n`;
    }
    text += `## Active Evidence & Data:\n${activeEv}\n\n`;
    if (expandable.length) {
      text += `## Available Packet Expansions (Load on-demand if required):\n`;
      for (const exp of expandable) {
        text += `- [ID: ${exp.id}] ${exp.description} (${exp.bytes} bytes). Expand with: ${kernelScriptCommand(kernel,"scripts/eval-site.ts")} --site "${root}" --node ${node.id} --expand-packet ${exp.id} --manifest-hash ${mHash.slice(0, 12)}\n`;
      }
      text += `\n`;
    }
    text += `Write output to: ${node.writes.join(", ")}. Follow existing Review contracts.\n`;
    return text;
  };

  // Check initial budget
  let preliminaryText = renderPrompt(activeEvidenceText, "000000000000");
  let totalChars = preliminaryText.length;
  let oversize = totalChars > budget.maxChars;

  if (oversize && activeEvidenceText.length > 500) {
    // Partition along complete lines rather than arbitrary mid-sentence slicing
    const excess = totalChars - budget.maxChars;
    const lines = activeEvidenceText.split("\n");
    const keptLines: string[] = [];
    const overflowLines: string[] = [];
    let keptLength = 0;
    const targetLength = Math.max(200, activeEvidenceText.length - excess - 500);

    for (const line of lines) {
      if (keptLength + line.length + 1 <= targetLength) {
        keptLines.push(line);
        keptLength += line.length + 1;
      } else {
        overflowLines.push(line);
      }
    }

    activeEvidenceText = `${keptLines.join("\n")}\n...[remainder partitioned into expandable items]\n`;
    const partitionedEvidence = overflowLines.join("\n");
    const runDir = join(root, "agent/runs");
    mkdirSync(runDir, { recursive: true });
    const partitionPath = join(runDir, `${node.id}.evidence.txt`);
    writeFileSync(partitionPath, partitionedEvidence, "utf8");
    const overflowHash = rehashOverflowContent(partitionPath);

    expandable.push({
      id: "excess-evidence-partitioned",
      path: "agent/runs/" + node.id + ".evidence.txt",
      description: "Additional evidence partitioned due to packet budget limit",
      bytes: partitionedEvidence.length,
      hash: overflowHash,
    });
    warnings.push(`Evidence was deterministically partitioned into expandable items to maintain packet budget (${budget.maxChars} chars).`);
  }

  let requiredPartitions: string[] | undefined = undefined;
  if (node.id === "copy-review") {
    const allRoutes = new Set<string>();
    const copyPath = join(root, "onboarding/copy-plan.json");
    const storyPath = join(root, "onboarding/storyboard.json");
    if (existsSync(copyPath)) {
      try {
        const parsed = JSON.parse(readFileSync(copyPath, "utf8"));
        if (Array.isArray(parsed.pages)) {
          for (const p of parsed.pages) if (p.path) allRoutes.add(p.path);
        }
      } catch {}
    }
    if (existsSync(storyPath)) {
      try {
        const sb = json<Storyboard>(storyPath);
        if (Array.isArray(sb.pages)) {
          for (const p of sb.pages) if (p.path) allRoutes.add(p.path);
        }
      } catch {}
    }
    if (allRoutes.size > 0) {
      requiredPartitions = Array.from(allRoutes).sort();
    }
  }

  // Build structured packet items for manifest tracking
  const packetItems: PacketItem[] = [
    {
      id: "instruction-prompt",
      kind: "instruction",
      required: true,
      content: basePrompt,
      sourceHash: createHash("sha256").update(basePrompt).digest("hex"),
      bytes: Buffer.byteLength(basePrompt, "utf8"),
    },
  ];
  if (contractSlice) {
    packetItems.push({
      id: `contract-${node.id}`,
      kind: "contract",
      required: true,
      content: contractSlice,
      sourceHash: createHash("sha256").update(contractSlice).digest("hex"),
      bytes: Buffer.byteLength(contractSlice, "utf8"),
    });
  }
  if (preflightSummary?.trim()) {
    packetItems.push({
      id: `preflight-${node.id}`,
      kind: "preflight",
      required: false,
      content: preflightSummary.trim(),
      sourceHash: createHash("sha256").update(preflightSummary.trim()).digest("hex"),
      bytes: Buffer.byteLength(preflightSummary.trim(), "utf8"),
    });
  }
  if (feedback.length > 0) {
    const fbText = feedback.join("\n");
    packetItems.push({
      id: `repair-${node.id}`,
      kind: "repair",
      required: true,
      content: fbText,
      sourceHash: createHash("sha256").update(fbText).digest("hex"),
      bytes: Buffer.byteLength(fbText, "utf8"),
    });
  }
  if (activeEvidenceText) {
    packetItems.push({
      id: `evidence-${node.id}`,
      kind: "evidence",
      required: true,
      content: activeEvidenceText,
      sourceHash: createHash("sha256").update(activeEvidenceText).digest("hex"),
      bytes: Buffer.byteLength(activeEvidenceText, "utf8"),
    });
  }

  // Compute final manifestHash AFTER all expandable items are fully populated
  const manifestHash = computeManifestHash({ nodeId: node.id, included, excluded, expandable, requiredPartitions });
  const packetText = renderPrompt(activeEvidenceText, manifestHash);
  oversize = packetText.length > budget.maxChars;

  const manifest: CoverageManifest = {
    schemaVersion: 1,
    nodeId: node.id,
    generatedAt: new Date().toISOString(),
    manifestHash,
    requiredPartitions,
    included,
    excluded,
    expandable,
    items: packetItems,
  };

  // Save manifest
  const manifestDir = join(root, "agent/runs");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, `${node.id}.manifest.json`), JSON.stringify(manifest, null, 2), "utf8");

  return { packetText, manifest, oversize, warnings };
}
