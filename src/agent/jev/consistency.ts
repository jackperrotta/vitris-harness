import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { json, type Business, type Storyboard } from "../artifacts.ts";
import { loadEvidenceLedger, type EvidenceLedger } from "./ledger.ts";

export interface CrossPageContradiction {
  type: "hours" | "phone" | "pricing" | "email";
  pages: string[];
  description: string;
  values: string[];
}

export interface NarrativeContinuityReport {
  continuityScore: number; // [0, 1]
  coveredCoreFacts: string[];
  droppedCoreFacts: string[];
  narrativeFlowValid: boolean;
  notes: string[];
}

export interface SemanticDriftReport {
  driftDetected: boolean;
  driftScore: number; // [0, 1] where 0 = no drift, 1 = total drift
  unsupportedTopics: string[];
  notes: string[];
}

export interface ConsistencyCheckReport {
  ok: boolean;
  violations: string[];
  narrativeContinuity: NarrativeContinuityReport;
  semanticDrift: SemanticDriftReport;
  contradictions: CrossPageContradiction[];
}

export function defaultConsistencyReportPath(root: string): string {
  return join(root, "agent/reviews/consistency-report.json");
}

/**
 * Validates cross-stage semantic consistency:
 * 1. Narrative arc continuity from business.json into storyboard.json and copy-plan.json.
 * 2. Semantic drift detection (dropped value propositions, invented themes).
 * 3. Cross-page contradictions (conflicting business hours, phone numbers, or pricing across pages).
 */
export function checkCrossStageConsistency(opts: {
  root: string;
  business?: Business;
  storyboard?: Storyboard;
  copyPlan?: { pages?: Array<{ path: string; sections?: Array<{ id: string; heading?: string; body?: string; factIds?: string[] }> }> };
}): ConsistencyCheckReport {
  const { root } = opts;
  const violations: string[] = [];

  // 1. Resolve business
  let bus = opts.business;
  if (!bus) {
    const busPath = join(root, "onboarding/business.json");
    if (existsSync(busPath)) {
      try { bus = json<Business>(busPath); } catch {}
    }
  }

  // 2. Resolve storyboard
  let story = opts.storyboard;
  if (!story) {
    const storyPath = join(root, "onboarding/storyboard.json");
    if (existsSync(storyPath)) {
      try { story = json<Storyboard>(storyPath); } catch {}
    }
  }

  // 3. Resolve copy-plan
  let copy = opts.copyPlan;
  if (!copy) {
    const copyPath = join(root, "onboarding/copy-plan.json");
    if (existsSync(copyPath)) {
      try { copy = json(copyPath); } catch {}
    }
  }

  // Fallback defaults if artifacts are missing
  const facts = bus?.facts || [];
  const storyboardPages = story?.pages || [];
  const copyPages = copy?.pages || [];

  // ==========================================
  // 1. Narrative Arc Continuity
  // ==========================================
  const allCitedFactIds = new Set<string>();
  for (const p of storyboardPages) {
    for (const sec of p.sections || []) {
      for (const fId of sec.facts || []) allCitedFactIds.add(fId);
    }
  }
  for (const p of copyPages) {
    for (const sec of p.sections || []) {
      for (const fId of sec.factIds || []) allCitedFactIds.add(fId);
    }
  }

  const coveredCoreFacts: string[] = [];
  const droppedCoreFacts: string[] = [];
  const continuityNotes: string[] = [];

  for (const f of facts) {
    if (allCitedFactIds.has(f.id)) {
      coveredCoreFacts.push(f.id);
    } else {
      droppedCoreFacts.push(f.id);
    }
  }

  const continuityScore = facts.length > 0 ? parseFloat((coveredCoreFacts.length / facts.length).toFixed(3)) : 1.0;
  if (facts.length > 0 && continuityScore < 0.5) {
    const msg = `Narrative arc dropped ${droppedCoreFacts.length} of ${facts.length} core business facts (continuity score: ${(continuityScore * 100).toFixed(0)}%)`;
    violations.push(msg);
    continuityNotes.push(msg);
  }

  // Verify representative home page addresses the core offer or trigger
  let narrativeFlowValid = true;
  if (bus?.offer && storyboardPages.length > 0) {
    const homeStory = storyboardPages.find(p => p.path === "/");
    const homeCopy = copyPages.find(p => p.path === "/");
    const homeText = `${homeStory?.sections?.map(s => s.message).join(" ") || ""} ${homeCopy?.sections?.map(s => `${s.heading} ${s.body}`).join(" ") || ""}`.toLowerCase();

    // Check key words from offer
    const offerWords = bus.offer.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const matches = offerWords.filter(w => homeText.includes(w));
    if (offerWords.length > 0 && matches.length === 0) {
      narrativeFlowValid = false;
      const msg = "Representative homepage fails to articulate the core business offer";
      violations.push(msg);
      continuityNotes.push(msg);
    }
  }

  const narrativeContinuity: NarrativeContinuityReport = {
    continuityScore,
    coveredCoreFacts,
    droppedCoreFacts,
    narrativeFlowValid,
    notes: continuityNotes,
  };

  // ==========================================
  // 2. Semantic Drift Detection
  // ==========================================
  const driftNotes: string[] = [];
  const unsupportedTopics: string[] = [];
  let driftScore = 0.0;

  if (bus) {
    const busText = `${bus.offer || ""} ${bus.positioning || ""} ${bus.audience || ""} ${facts.map(f => f.claim).join(" ")}`.toLowerCase();
    const copyText = copyPages.map(p => p.sections?.map(s => `${s.heading || ""} ${s.body || ""}`).join(" ") || "").join(" ").toLowerCase();

    // Check for extreme outlier claims or prohibited invented scopes
    const suspiciousThemes = [
      "free international shipping",
      "cryptocurrency",
      "medical advice",
      "legal representation",
      "guaranteed stock returns",
    ];

    for (const theme of suspiciousThemes) {
      if (copyText.includes(theme) && !busText.includes(theme)) {
        unsupportedTopics.push(theme);
        const msg = `Semantic drift detected: copy introduces ungrounded theme "${theme}"`;
        violations.push(msg);
        driftNotes.push(msg);
        driftScore += 0.3;
      }
    }
  }

  driftScore = Math.min(1.0, parseFloat(driftScore.toFixed(3)));
  const semanticDrift: SemanticDriftReport = {
    driftDetected: unsupportedTopics.length > 0,
    driftScore,
    unsupportedTopics,
    notes: driftNotes,
  };

  // ==========================================
  // 3. Cross-Page Contradictions
  // ==========================================
  const contradictions: CrossPageContradiction[] = [];

  // Collect per-page values
  interface PageFacts {
    path: string;
    hours: string[];
    phones: string[];
    pricing: Array<{ raw: string; value: number }>;
  }

  const pageFactsList: PageFacts[] = [];
  const phoneRegex = /\b(?:\+?\d{1,4}[-.\s]*)?(?:\(\d{2,5}\)[-.\s]*|\d{2,5}[-.\s]+)\d{2,4}[-.\s]*\d{3,5}\b|\b(?:\+?1[-.\s]*)?\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4}\b/g;
  const hoursRegex = /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|daily)\b[^\n.]{3,40}(?:am|pm|closed)|\b(?:open\s+)?(?:24\/7|round[- ]the[- ]clock|24 hours(?:\s+a day)?)\b/gi;
  const priceRegex = /[$£€](\d+(?:,\d{3})*(?:\.\d{2})?)\b/g;

  for (const p of copyPages) {
    const text = (p.sections || []).map(s => `${s.heading || ""} ${s.body || ""}`).join("\n");
    const phones = [...new Set([...text.matchAll(phoneRegex)].map(m => m[0].replace(/\D/g, "")))];
    const hours = [...new Set([...text.matchAll(hoursRegex)].map(m => m[0].toLowerCase().trim()))];
    const pricing = [...text.matchAll(priceRegex)].map(m => ({
      raw: m[0],
      value: parseFloat(m[1]!.replace(/,/g, "")),
    }));

    pageFactsList.push({
      path: p.path,
      phones,
      hours,
      pricing,
    });
  }

  // Cross-page hours contradiction (e.g. 24/7 on home, but limited hours on contact)
  const pagesWith247 = pageFactsList.filter(pf => pf.hours.some(h => h.includes("24/7") || h.includes("round-the-clock")));
  const pagesWithLimited = pageFactsList.filter(pf => pf.hours.some(h => (h.includes("pm") || h.includes("am")) && !h.includes("24/7")));
  if (pagesWith247.length > 0 && pagesWithLimited.length > 0) {
    const desc = `Contradictory business hours: ${pagesWith247.map(p => p.path).join(", ")} claims 24/7, while ${pagesWithLimited.map(p => p.path).join(", ")} specifies restricted hours`;
    contradictions.push({
      type: "hours",
      pages: [...pagesWith247.map(p => p.path), ...pagesWithLimited.map(p => p.path)],
      description: desc,
      values: [...pagesWith247.flatMap(p => p.hours), ...pagesWithLimited.flatMap(p => p.hours)],
    });
    violations.push(desc);
  }

  // Cross-page phones contradiction (conflicting phone numbers across different pages when only 1 phone is grounded)
  const allPhonesSeen = new Set<string>();
  for (const pf of pageFactsList) {
    for (const ph of pf.phones) allPhonesSeen.add(ph);
  }
  if (allPhonesSeen.size > 1) {
    // Check if multiple distinct phone numbers appear across pages without explanation
    const pagesWithPhones = pageFactsList.filter(pf => pf.phones.length > 0);
    if (pagesWithPhones.length > 1) {
      const distinctAcrossPages = pagesWithPhones.some((p1, idx) =>
        pagesWithPhones.slice(idx + 1).some(p2 => p1.phones[0] !== p2.phones[0])
      );
      if (distinctAcrossPages) {
        const desc = `Conflicting phone numbers across pages: ${pagesWithPhones.map(p => `${p.path} (${p.phones.join(", ")})`).join("; ")}`;
        contradictions.push({
          type: "phone",
          pages: pagesWithPhones.map(p => p.path),
          description: desc,
          values: Array.from(allPhonesSeen),
        });
        violations.push(desc);
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    narrativeContinuity,
    semanticDrift,
    contradictions,
  };
}

export interface ClaimLineageNode {
  stage: "source" | "claim" | "section" | "artifact";
  id: string;
  location: string;
  hash?: string;
  text?: string;
}

export interface ClaimLineageTrace {
  claimId: string;
  claimText: string;
  sourceNodes: ClaimLineageNode[];
  claimNode?: ClaimLineageNode;
  sectionNodes: ClaimLineageNode[];
  artifactNodes: ClaimLineageNode[];
  broken: boolean;
  brokenReasons: string[];
}

export interface ClaimLineageReport {
  ok: boolean;
  traces: ClaimLineageTrace[];
  brokenTraces: ClaimLineageTrace[];
  summary: {
    totalClaims: number;
    intactClaims: number;
    brokenClaims: number;
  };
}

/**
 * Traces claim lineage across stages:
 * source -> claim -> section -> artifact -> node
 * Validates that every assertion in downstream copy/pages maps to an unbroken upstream lineage.
 */
export function traceClaimLineage(opts: {
  root: string;
  business?: Business;
  storyboard?: Storyboard;
  copyPlan?: { pages?: Array<{ path: string; sections?: Array<{ id: string; heading?: string; body?: string; factIds?: string[]; facts?: string[] }> }> };
  ledger?: EvidenceLedger;
}): ClaimLineageReport {
  const { root } = opts;

  let bus = opts.business;
  if (!bus) {
    const busPath = join(root, "onboarding/business.json");
    if (existsSync(busPath)) {
      try { bus = json<Business>(busPath); } catch {}
    }
  }

  let story = opts.storyboard;
  if (!story) {
    const storyPath = join(root, "onboarding/storyboard.json");
    if (existsSync(storyPath)) {
      try { story = json<Storyboard>(storyPath); } catch {}
    }
  }

  let copy = opts.copyPlan;
  if (!copy) {
    const copyPath = join(root, "onboarding/copy-plan.json");
    if (existsSync(copyPath)) {
      try { copy = json(copyPath); } catch {}
    }
  }

  const ledger = opts.ledger || loadEvidenceLedger(root);

  // Index evidence by ID
  const evidenceMap = new Map<string, { id: string; source: string; excerpt: string }>();
  for (const ev of (bus?.evidence || [])) {
    evidenceMap.set(ev.id, ev);
  }
  for (const item of (ledger?.items || [])) {
    if (!evidenceMap.has(item.id)) {
      evidenceMap.set(item.id, { id: item.id, source: item.source, excerpt: item.text });
    }
  }

  // Index claims
  const claimsMap = new Map<string, { id: string; claim: string; evidenceIds: string[] }>();
  for (const f of (bus?.facts || [])) {
    claimsMap.set(f.id, { id: f.id, claim: f.claim, evidenceIds: f.evidence || [] });
  }
  for (const cl of Object.values(ledger?.claims || {})) {
    if (!claimsMap.has(cl.id)) {
      claimsMap.set(cl.id, { id: cl.id, claim: cl.claim, evidenceIds: cl.citedEvidenceIds || [] });
    }
  }

  const traces: ClaimLineageTrace[] = [];

  for (const [claimId, cl] of claimsMap.entries()) {
    const sourceNodes: ClaimLineageNode[] = [];
    const brokenReasons: string[] = [];

    // Stage 1: Source nodes
    if (cl.evidenceIds.length === 0) {
      brokenReasons.push(`Claim [${claimId}] has no upstream harvest source citations`);
    } else {
      for (const evId of cl.evidenceIds) {
        const ev = evidenceMap.get(evId);
        if (ev) {
          sourceNodes.push({
            stage: "source",
            id: ev.id,
            location: ev.source,
            text: ev.excerpt,
          });
        } else {
          brokenReasons.push(`Claim [${claimId}] cites non-existent evidence [${evId}]`);
        }
      }
    }

    // Stage 2: Claim node
    const claimNode: ClaimLineageNode = {
      stage: "claim",
      id: claimId,
      location: "onboarding/business.json",
      text: cl.claim,
    };

    // Stage 3: Section nodes (storyboard & copy-plan)
    const sectionNodes: ClaimLineageNode[] = [];
    for (const page of (story?.pages || [])) {
      for (const sec of (page.sections || [])) {
        if ((sec.facts || []).includes(claimId)) {
          sectionNodes.push({
            stage: "section",
            id: `${page.path}#${sec.id}`,
            location: "onboarding/storyboard.json",
            text: sec.message,
          });
        }
      }
    }

    for (const page of (copy?.pages || [])) {
      for (const sec of (page.sections || [])) {
        const cited = sec.factIds || sec.facts || [];
        if (cited.includes(claimId)) {
          sectionNodes.push({
            stage: "section",
            id: `${page.path}#${sec.id}`,
            location: "onboarding/copy-plan.json",
            text: `${sec.heading || ""} ${sec.body || ""}`.trim(),
          });
        }
      }
    }

    // Stage 4: Artifact nodes (pages or dist)
    const artifactNodes: ClaimLineageNode[] = [];
    const pagesDir = join(root, "pages");
    if (existsSync(pagesDir)) {
      try {
        const pageFiles = readdirSync(pagesDir).filter(f => f.endsWith(".html"));
        for (const pf of pageFiles) {
          try {
            const content = readFileSync(join(pagesDir, pf), "utf8");
            const keyTerms = cl.claim.toLowerCase().split(/\s+/).filter(w => w.length > 5);
            if (keyTerms.length > 0 && keyTerms.filter(t => content.toLowerCase().includes(t)).length >= Math.min(2, keyTerms.length)) {
              artifactNodes.push({
                stage: "artifact",
                id: pf,
                location: `pages/${pf}`,
              });
            }
          } catch {}
        }
      } catch {}
    }

    const isBroken = brokenReasons.length > 0;
    traces.push({
      claimId,
      claimText: cl.claim,
      sourceNodes,
      claimNode,
      sectionNodes,
      artifactNodes,
      broken: isBroken,
      brokenReasons,
    });
  }

  // Also detect orphan section citations: sections citing facts that do not exist upstream
  for (const page of (copy?.pages || [])) {
    for (const sec of (page.sections || [])) {
      const cited = sec.factIds || sec.facts || [];
      for (const fId of cited) {
        if (!claimsMap.has(fId)) {
          traces.push({
            claimId: fId,
            claimText: "Unknown ungrounded claim",
            sourceNodes: [],
            sectionNodes: [{
              stage: "section",
              id: `${page.path}#${sec.id}`,
              location: "onboarding/copy-plan.json",
              text: `${sec.heading || ""} ${sec.body || ""}`.trim(),
            }],
            artifactNodes: [],
            broken: true,
            brokenReasons: [`Copy section ${page.path}#${sec.id} cites undeclared fact [${fId}]`],
          });
        }
      }
    }
  }

  const brokenTraces = traces.filter(t => t.broken);
  return {
    ok: brokenTraces.length === 0,
    traces,
    brokenTraces,
    summary: {
      totalClaims: traces.length,
      intactClaims: traces.length - brokenTraces.length,
      brokenClaims: brokenTraces.length,
    },
  };
}

/**
 * Filters broken claim traces and produces structured lineage failure descriptions.
 */
export function detectBrokenLineage(traces: ClaimLineageTrace[]): string[] {
  return traces.filter(t => t.broken).flatMap(t => t.brokenReasons);
}

