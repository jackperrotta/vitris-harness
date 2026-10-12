import type { ChangeScope } from "../refine.ts";
import type { GroundingVerdict, GroundingCheckItem, JevTaskApplicability } from "./types.ts";
import { DEFAULT_GROUNDING_CONFIDENCE_THRESHOLD, DEFAULT_ROUTING_CONFIDENCE_THRESHOLD } from "./config.ts";

export const POLICY_VERSION = "2026-09-17.2";

export interface TaskApplicabilityResult {
  /** Whether this task should run at all given the site context. */
  applicable: boolean;
  /** Reason the task was skipped (empty when applicable). */
  skipReason?: string;
}

/**
 * Evaluates whether a Jev task should run for a given site context.
 * A task is inapplicable when its subject matter does not exist on the site.
 * Example: skip booking-price questions for a site with no booking functionality.
 *
 * When no applicability descriptor is registered for a task, it defaults to applicable.
 * Confidence is distribution concentration, not correctness; do not use blanket thresholds.
 */
export function evaluateTaskApplicability(
  taskId: string,
  applicabilityDescriptors: JevTaskApplicability[] | undefined,
  siteContext?: { subjectExists?: boolean }
): TaskApplicabilityResult {
  if (!applicabilityDescriptors || applicabilityDescriptors.length === 0) {
    return { applicable: true };
  }
  const descriptor = applicabilityDescriptors.find((a) => a.taskId === taskId);
  if (!descriptor) {
    return { applicable: true };
  }
  // Site context overrides the descriptor
  const subjectExists = siteContext?.subjectExists ?? descriptor.subjectExists;
  if (!subjectExists) {
    return {
      applicable: false,
      skipReason: `Task "${taskId}" subject does not exist on this site (riskLevel: ${descriptor.riskLevel})`,
    };
  }
  return { applicable: true };
}



export interface CodeQuoteCheck {
  sourceExists: boolean;
  quoteFound: boolean;
  normalizedMatch: boolean;
  sourceFile?: string;
  excerptLength: number;
}

export function evaluateGroundingVerdict(opts: {
  codeCheck: CodeQuoteCheck;
  relationChoice?: "supports" | "contradicts" | "says_nothing";
  confidence?: number;
  threshold?: number;
}): { verdict: GroundingVerdict; autoAccepted: boolean; notes: string } {
  const threshold = opts.threshold ?? DEFAULT_GROUNDING_CONFIDENCE_THRESHOLD;

  if (!opts.codeCheck.sourceExists) {
    return {
      verdict: "missing_source",
      autoAccepted: true,
      notes: "Cited source file is absent from repository; code preflight failed.",
    };
  }

  if (opts.codeCheck.excerptLength === 0) {
    return {
      verdict: "insufficient_evidence",
      autoAccepted: true,
      notes: "Cited evidence excerpt is empty; cannot verify claim.",
    };
  }

  if (!opts.codeCheck.quoteFound) {
    return {
      verdict: "quote_not_found",
      autoAccepted: true,
      notes: "Declared quote could not be located verbatim in cited source text.",
    };
  }

  if (!opts.relationChoice) {
    return {
      verdict: "insufficient_evidence",
      autoAccepted: false,
      notes: "No semantic evaluation available; requires critic verification.",
    };
  }

  const confidence = opts.confidence ?? 0;
  const highConfidence = confidence >= threshold;

  if (opts.relationChoice === "contradicts") {
    return {
      verdict: "contradicted",
      autoAccepted: highConfidence,
      notes: `Evidence excerpt directly contradicts claim (confidence: ${(confidence * 100).toFixed(1)}%). Major defect.`,
    };
  }

  if (opts.relationChoice === "supports") {
    if (highConfidence) {
      return {
        verdict: "verified",
        autoAccepted: true,
        notes: `Evidence excerpt supports claim (confidence: ${(confidence * 100).toFixed(1)}%).`,
      };
    } else {
      return {
        verdict: "insufficient_evidence",
        autoAccepted: false,
        notes: `Excerpt tentatively supports claim but confidence ${(confidence * 100).toFixed(1)}% is below threshold ${(threshold * 100).toFixed(1)}%; critic review required.`,
      };
    }
  }

  // says_nothing
  return {
    verdict: "insufficient_evidence",
    autoAccepted: highConfidence,
    notes: `Evidence excerpt does not address claim (confidence: ${(confidence * 100).toFixed(1)}%).`,
  };
}

export interface RoutingPolicyResult {
  scope: ChangeScope;
  isMixed: boolean;
  isAmbiguous: boolean;
  confidence: number;
  autoAccepted: boolean;
  rationale: string;
}

export function evaluateRoutingDecision(opts: {
  choice: "business" | "copy" | "pages" | "direction" | "ambiguous" | "mixed";
  confidence: number;
  overrideScope?: ChangeScope;
  fallbackScope: ChangeScope;
  threshold?: number;
}): RoutingPolicyResult {
  const threshold = opts.threshold ?? DEFAULT_ROUTING_CONFIDENCE_THRESHOLD;

  if (opts.overrideScope) {
    return {
      scope: opts.overrideScope,
      isMixed: false,
      isAmbiguous: false,
      confidence: 1.0,
      autoAccepted: true,
      rationale: `Explicit operator override --change-scope ${opts.overrideScope} applied.`,
    };
  }

  if (opts.choice === "mixed") {
    return {
      scope: opts.fallbackScope === "business" ? "business" : "pages",
      isMixed: true,
      isAmbiguous: false,
      confidence: opts.confidence,
      autoAccepted: opts.confidence >= threshold,
      rationale: "Request combines multiple scopes; union of affected stages required.",
    };
  }

  if (opts.choice === "ambiguous" || opts.confidence < threshold) {
    return {
      scope: opts.fallbackScope,
      isMixed: false,
      isAmbiguous: true,
      confidence: opts.confidence,
      autoAccepted: false,
      rationale: `Model classification (${opts.choice}, ${(opts.confidence * 100).toFixed(1)}%) is below threshold ${(threshold * 100).toFixed(1)}%; falling back to baseline scope ${opts.fallbackScope}.`,
    };
  }

  const validScope: ChangeScope = opts.choice;
  return {
    scope: validScope,
    isMixed: false,
    isAmbiguous: false,
    confidence: opts.confidence,
    autoAccepted: true,
    rationale: `Classified as ${validScope} (confidence: ${(opts.confidence * 100).toFixed(1)}%).`,
  };
}

export interface MultiScopeDecisionResult {
  scope: ChangeScope;
  scopes: ChangeScope[];
  isMixed: boolean;
  isAmbiguous: boolean;
  confidence: number;
  autoAccepted: boolean;
  rationale: string;
  affectedNodes: string[];
}

export function requestNodesForScope(scope: ChangeScope): string[] {
  if (scope === "business") return ["business", "copy", "pages"];
  if (scope === "direction") return ["direction", "storyboard", "copy", "representative", "pages"];
  if (scope === "copy") return ["copy", "pages"];
  if (scope === "media") return ["media", "representative", "pages"];
  return ["pages"];
}

export function unionNodesForScopes(scopes: ChangeScope[]): string[] {
  const nodeOrder = ["business", "media", "direction", "storyboard", "copy", "representative", "pages"];
  const needed = new Set<string>();
  for (const s of scopes) {
    for (const n of requestNodesForScope(s)) {
      needed.add(n);
    }
  }
  return nodeOrder.filter(n => needed.has(n));
}

export function evaluateMultiScopeDecision(opts: {
  answers: {
    business?: { noul: number };
    copy?: { noul: number };
    pages?: { noul: number };
    direction?: { noul: number };
  };
  overrideScope?: ChangeScope;
  fallbackScope: ChangeScope;
  threshold?: number;
}): MultiScopeDecisionResult {
  const threshold = opts.threshold ?? DEFAULT_ROUTING_CONFIDENCE_THRESHOLD;

  if (opts.overrideScope) {
    const override = opts.overrideScope;
    return {
      scope: override,
      scopes: [override],
      isMixed: false,
      isAmbiguous: false,
      confidence: 1.0,
      autoAccepted: true,
      rationale: `Explicit operator override --change-scope ${override} applied.`,
      affectedNodes: requestNodesForScope(override),
    };
  }

  const scores: Record<ChangeScope, number> = {
    business: opts.answers.business?.noul ?? 0,
    copy: opts.answers.copy?.noul ?? 0,
    pages: opts.answers.pages?.noul ?? 0,
    direction: opts.answers.direction?.noul ?? 0,
    media: 0,
  };

  const activeScopes = (["business", "direction", "copy", "pages"] as ChangeScope[])
    .filter(s => scores[s] >= threshold);

  if (activeScopes.length > 1) {
    const primaryScope = activeScopes[0]!;
    const affected = unionNodesForScopes(activeScopes);
    const maxConf = Math.max(...activeScopes.map(s => scores[s]));
    return {
      scope: primaryScope,
      scopes: activeScopes,
      isMixed: true,
      isAmbiguous: false,
      confidence: maxConf,
      autoAccepted: true,
      rationale: `Request affects multiple scopes: [${activeScopes.join(", ")}]; union of affected stages (${affected.join(" -> ")}) planned.`,
      affectedNodes: affected,
    };
  }

  if (activeScopes.length === 1) {
    const singleScope = activeScopes[0]!;
    return {
      scope: singleScope,
      scopes: activeScopes,
      isMixed: false,
      isAmbiguous: false,
      confidence: scores[singleScope],
      autoAccepted: true,
      rationale: `Classified as ${singleScope} (confidence: ${(scores[singleScope] * 100).toFixed(1)}%).`,
      affectedNodes: requestNodesForScope(singleScope),
    };
  }

  // 0 scopes reached threshold -> ambiguous
  const highestConf = Math.max(scores.business, scores.copy, scores.pages, scores.direction);
  return {
    scope: opts.fallbackScope,
    scopes: [opts.fallbackScope],
    isMixed: false,
    isAmbiguous: true,
    confidence: highestConf,
    autoAccepted: false,
    rationale: `No scope reached confidence threshold ${(threshold * 100).toFixed(1)}% (max: ${(highestConf * 100).toFixed(1)}%); falling back to baseline scope ${opts.fallbackScope}.`,
    affectedNodes: requestNodesForScope(opts.fallbackScope),
  };
}
