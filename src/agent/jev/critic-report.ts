import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding } from "../artifacts.ts";
import type { EvidenceStatus, GroundingPreflightSummary } from "./types.ts";
import type { EvidenceLedger } from "./ledger.ts";
import { rankAndSliceEvidence } from "./ranking.ts";

export type CriticSeverity = "blocking" | "warning" | "polish";

export interface StructuredCriticFinding {
  id: string;
  claimId?: string;
  evidenceId?: string;
  targetFile: string;
  section: string;
  slot?: string;
  severity: CriticSeverity;
  problem: string;
  repairDirective: string;
  verificationCriteria: string;
  iteration?: number;
  repeatCount?: number;
  escalated?: boolean;
}

export interface CriticHistoryEntry {
  signature: string;
  targetFile: string;
  section: string;
  slot?: string;
  claimId?: string;
  firstSeenIteration: number;
  lastSeenIteration: number;
  occurrences: number;
  resolved: boolean;
  originalSeverity: CriticSeverity;
  currentSeverity: CriticSeverity;
  escalated: boolean;
}

export interface CriticHistoryStore {
  schemaVersion: 1;
  updatedAt: string;
  entries: Record<string, CriticHistoryEntry>;
}

export function defaultCriticHistoryPath(root: string): string {
  return join(root, "agent/decisions/critic-history.json");
}

function sha256(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export function makeFindingSignature(f: {
  targetFile?: string;
  page?: string;
  target?: string;
  section?: string;
  slot?: string;
  claimId?: string;
  problem: string;
}): string {
  const target = (f.targetFile || f.target || f.page || "global").toLowerCase().trim();
  const section = (f.section || "general").toLowerCase().trim();
  const slot = (f.slot || "").toLowerCase().trim();
  const claim = (f.claimId || "").toLowerCase().trim();
  const problemNorm = f.problem.toLowerCase().replace(/[\r\n\s]+/g, " ").slice(0, 100).trim();

  return sha256(`${target}|${section}|${slot}|${claim}|${problemNorm}`).slice(0, 16);
}

export function loadCriticHistory(root: string, customPath?: string): CriticHistoryStore {
  const p = customPath || defaultCriticHistoryPath(root);
  if (!existsSync(p)) {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      entries: {},
    };
  }
  try {
    const data = JSON.parse(readFileSync(p, "utf8")) as CriticHistoryStore;
    data.entries ||= {};
    return data;
  } catch {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      entries: {},
    };
  }
}

export function saveCriticHistory(root: string, store: CriticHistoryStore, customPath?: string): string {
  const p = customPath || defaultCriticHistoryPath(root);
  mkdirSync(join(p, ".."), { recursive: true });
  store.updatedAt = new Date().toISOString();
  writeFileSync(p, JSON.stringify(store, null, 2), "utf8");
  return p;
}

/**
 * Maps structured critic severity to standard Vitris Finding severity.
 * blocking -> blocker
 * warning  -> major
 * polish   -> minor
 */
export function toStandardSeverity(sev: CriticSeverity): "blocker" | "major" | "minor" {
  if (sev === "blocking") return "blocker";
  if (sev === "warning") return "major";
  return "minor";
}

/**
 * Maps standard Vitris Finding severity to structured critic severity.
 * blocker -> blocking
 * major   -> warning
 * minor   -> polish
 */
export function toCriticSeverity(sev: "blocker" | "major" | "minor" | string): CriticSeverity {
  if (sev === "blocker" || sev === "blocking") return "blocking";
  if (sev === "major" || sev === "warning") return "warning";
  return "polish";
}

/**
 * Tracks critic findings across iterations.
 * If a defect is reported in iteration N and recurs in iteration N+1 without resolution:
 * - Escalates its severity: polish -> warning, warning -> blocking.
 * - Sets escalated = true and records repeatCount.
 * - Augments repairDirective to alert author node of unresolved recurrence.
 */
export function recordAndEscalateFindings(
  root: string,
  findings: StructuredCriticFinding[],
  currentIteration: number,
  options?: { customHistoryPath?: string }
): StructuredCriticFinding[] {
  const history = loadCriticHistory(root, options?.customHistoryPath);
  const result: StructuredCriticFinding[] = [];

  const activeSignaturesInCurrentRun = new Set<string>();

  for (const f of findings) {
    const sig = makeFindingSignature(f);
    activeSignaturesInCurrentRun.add(sig);

    let entry = history.entries[sig];
    let severity = f.severity;
    let repeatCount = 1;
    let escalated = false;

    if (entry) {
      if (!entry.resolved && entry.lastSeenIteration < currentIteration) {
        entry.occurrences += 1;
        entry.lastSeenIteration = currentIteration;
        repeatCount = entry.occurrences;

        // Escalate severity if reported twice or more without resolution
        if (entry.occurrences >= 2) {
          if (entry.currentSeverity === "polish") {
            severity = "warning";
            escalated = true;
          } else if (entry.currentSeverity === "warning") {
            severity = "blocking";
            escalated = true;
          } else {
            severity = "blocking";
          }
          entry.currentSeverity = severity;
          entry.escalated = true;
        }
      }
    } else {
      entry = {
        signature: sig,
        targetFile: f.targetFile,
        section: f.section,
        slot: f.slot,
        claimId: f.claimId,
        firstSeenIteration: currentIteration,
        lastSeenIteration: currentIteration,
        occurrences: 1,
        resolved: false,
        originalSeverity: f.severity,
        currentSeverity: f.severity,
        escalated: false,
      };
      history.entries[sig] = entry;
    }

    let repairDirective = f.repairDirective;
    if (escalated) {
      repairDirective = `[ESCALATED REPEAT DEFECT - occurrence ${repeatCount}]: Previous repair did not resolve this defect. ${f.repairDirective}`;
    }

    result.push({
      ...f,
      severity,
      repeatCount,
      escalated,
      iteration: currentIteration,
      repairDirective,
    });
  }

  // Check previously active entries that are no longer reported: mark as resolved
  for (const [sig, entry] of Object.entries(history.entries)) {
    if (!activeSignaturesInCurrentRun.has(sig) && !entry.resolved && entry.lastSeenIteration < currentIteration) {
      entry.resolved = true;
    }
  }

  saveCriticHistory(root, history, options?.customHistoryPath);
  return result;
}

/** Converts a StructuredCriticFinding into a standard Vitris Finding artifact. */
export function toStandardFinding(f: StructuredCriticFinding): Finding {
  const target = f.targetFile;
  const page = f.targetFile.startsWith("pages/")
    ? "/" + f.targetFile.replace(/^pages\//, "").replace(/\.html$/, "")
    : f.targetFile;

  let evidenceText = f.verificationCriteria;
  if (f.claimId) evidenceText = `Claim ${f.claimId}: ${evidenceText}`;
  if (f.evidenceId) evidenceText = `Evidence ${f.evidenceId} | ${evidenceText}`;

  return {
    id: f.id,
    page: page === "/index" ? "/" : page,
    section: f.section,
    evidence: evidenceText,
    severity: toStandardSeverity(f.severity),
    problem: f.problem,
    repair: f.repairDirective,
    target,
    verify: f.verificationCriteria,
  };
}

/**
 * Builds a focused critic context packet passing targeted evidence slices rather than
 * full site context dumps, keeping critic context windows small and relevant.
 */
export function buildFocusedCriticContext(opts: {
  nodeId: string;
  targetFile: string;
  sectionId?: string;
  claims: Array<{ id: string; claim: string }>;
  evidence: Array<{ id: string; source: string; excerpt: string }>;
  tokenBudget?: number;
}): {
  contextText: string;
  evidenceItemsCount: number;
} {
  const { nodeId, targetFile, sectionId, claims, evidence, tokenBudget = 1500 } = opts;

  const query = `${nodeId} ${targetFile} ${sectionId || ""} ${claims.map(c => c.claim).join(" ")}`;
  const sliced = rankAndSliceEvidence(evidence, query, {
    tokenBudget,
    maxItems: 8,
    minScore: 0.25,
  });

  let text = `## Focused Critic Evidence Context (${nodeId})\n`;
  text += `Target: ${targetFile}${sectionId ? ` (Section: #${sectionId})` : ""}\n\n`;

  if (claims.length > 0) {
    text += `### Active Target Claims (${claims.length} items):\n`;
    for (const c of claims.slice(0, 10)) {
      text += `- **[${c.id}]**: "${c.claim}"\n`;
    }
    text += "\n";
  }

  text += sliced.slicedText;

  return {
    contextText: text,
    evidenceItemsCount: sliced.slicedItems.length,
  };
}

export interface CriticBrief {
  nodeId: string;
  checkedClaims: Array<{ claimId: string; verdict: EvidenceStatus; notes?: string; span?: string }>;
  conflictingClaims: Array<{ claimId: string; contradictionId?: string; details?: string }>;
  unknownClaims: string[];
  changedSections: string[];
  hardConstraints: string[];
  acceptanceChecklist: Array<{ obligationId: string; description: string; covered: boolean }>;
}

export function buildCriticBrief(opts: {
  nodeId: string;
  ledger?: EvidenceLedger;
  preflight?: GroundingPreflightSummary;
  changedSections?: string[];
  hardConstraints?: string[];
  obligations?: Array<{ id: string; description: string }>;
}): CriticBrief {
  const { nodeId, ledger, preflight, changedSections = [], hardConstraints = [], obligations = [] } = opts;

  const checkedClaims: CriticBrief["checkedClaims"] = [];
  const conflictingClaims: CriticBrief["conflictingClaims"] = [];
  const unknownClaims: string[] = [];

  if (preflight) {
    for (const item of preflight.items) {
      let status: EvidenceStatus = "insufficient";
      if (item.verdict === "verified") status = "supported";
      else if (item.verdict === "contradicted") status = "contradicted";
      else if (item.verdict === "missing_source") status = "unavailable";
      else if (item.verdict === "superseded") status = "superseded";

      checkedClaims.push({
        claimId: item.id,
        verdict: status,
        notes: item.notes,
      });

      if (status === "contradicted") {
        conflictingClaims.push({
          claimId: item.id,
          details: item.notes || "Contradicted by evidence",
        });
      } else if (status === "insufficient" || status === "unavailable") {
        unknownClaims.push(item.id);
      }
    }
  }

  if (ledger) {
    for (const contra of ledger.contradictions || []) {
      if (contra.status === "unresolved") {
        conflictingClaims.push({
          claimId: contra.claimId,
          contradictionId: contra.id,
          details: contra.description,
        });
      }
    }
  }

  const acceptanceChecklist = obligations.map(o => ({
    obligationId: o.id,
    description: o.description,
    covered: !conflictingClaims.some(c => c.claimId === o.id),
  }));

  return {
    nodeId,
    checkedClaims,
    conflictingClaims,
    unknownClaims,
    changedSections,
    hardConstraints,
    acceptanceChecklist,
  };
}

export function renderCriticBriefText(brief: CriticBrief): string {
  const lines: string[] = [
    `### Critic Brief for ${brief.nodeId}`,
    "",
    `- Checked Claims: ${brief.checkedClaims.length} (Supported: ${brief.checkedClaims.filter(c => c.verdict === "supported").length}, Conflicting: ${brief.conflictingClaims.length}, Unknown: ${brief.unknownClaims.length})`,
  ];

  if (brief.conflictingClaims.length > 0) {
    lines.push("", "**Conflicting Claims (Action Required):**");
    for (const c of brief.conflictingClaims) {
      lines.push(`- Claim "${c.claimId}": ${c.details || "Contradiction detected"}`);
    }
  }

  if (brief.unknownClaims.length > 0) {
    lines.push("", "**Unknown / Insufficient Claims:**");
    for (const u of brief.unknownClaims.slice(0, 10)) {
      lines.push(`- Claim "${u}" requires critic manual verification.`);
    }
    if (brief.unknownClaims.length > 10) {
      lines.push(`- ... and ${brief.unknownClaims.length - 10} more.`);
    }
  }

  if (brief.hardConstraints.length > 0) {
    lines.push("", "**Hard Invariants:**");
    for (const hc of brief.hardConstraints) {
      lines.push(`- ${hc}`);
    }
  }

  if (brief.acceptanceChecklist.length > 0) {
    lines.push("", "**Acceptance Checklist:**");
    for (const ac of brief.acceptanceChecklist) {
      lines.push(`- [${ac.covered ? "x" : " "}] ${ac.obligationId}: ${ac.description}`);
    }
  }

  return lines.join("\n");
}


