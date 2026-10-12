import { computeCalibrationMetrics, type CalibrationMetrics } from "./calibration.ts";
import { evaluateGroundingVerdict, type CodeQuoteCheck } from "./policy.ts";

export type DatasetCaseKind =
  | "positive"
  | "negative"
  | "missing_evidence"
  | "conflict"
  | "candidate_omission"
  | "ambiguous"
  | "service_error";

export interface LabeledPolicyCase {
  id: string;
  taskId: string;
  kind: DatasetCaseKind;
  claim: string;
  excerpt: string;
  sourceExists: boolean;
  quoteFound: boolean;
  relationChoice?: "supports" | "contradicts" | "says_nothing";
  confidence?: number;
  serviceError?: boolean;
  /** Gold end-to-end policy: whether the item may be machine-covered (auto-accepted verified). */
  goldMachineCoverable: boolean;
  /** Gold: whether the agent obligation must be retained. */
  goldRetainAgent: boolean;
}

export const TASK_DATASETS: Record<string, LabeledPolicyCase[]> = {
  "business-review-grounding": [
    {
      id: "br-pos-1",
      taskId: "business-review-grounding",
      kind: "positive",
      claim: "Repairs roofs",
      excerpt: "We repair roofs",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "supports",
      confidence: 0.96,
      goldMachineCoverable: true,
      goldRetainAgent: false,
    },
    {
      id: "br-neg-1",
      taskId: "business-review-grounding",
      kind: "negative",
      claim: "24/7 emergency service",
      excerpt: "Available Monday to Friday 9am to 5pm. Closed weekends.",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "contradicts",
      confidence: 0.94,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "br-miss-1",
      taskId: "business-review-grounding",
      kind: "missing_evidence",
      claim: "Licensed in Pennsylvania",
      excerpt: "",
      sourceExists: false,
      quoteFound: false,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "br-conf-1",
      taskId: "business-review-grounding",
      kind: "conflict",
      claim: "Family owned since 1998",
      excerpt: "Founded in 2012 by two partners",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "contradicts",
      confidence: 0.91,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "br-omit-1",
      taskId: "business-review-grounding",
      kind: "candidate_omission",
      claim: "EPA lead-safe certified",
      excerpt: "Our crew is EPA lead-safe certified",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "says_nothing",
      confidence: 0.4,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "br-amb-1",
      taskId: "business-review-grounding",
      kind: "ambiguous",
      claim: "Best roofers in the county",
      excerpt: "Customers tell us they appreciate our work",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "says_nothing",
      confidence: 0.7,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "br-err-1",
      taskId: "business-review-grounding",
      kind: "service_error",
      claim: "Free estimates",
      excerpt: "Call for a free estimate",
      sourceExists: true,
      quoteFound: true,
      serviceError: true,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
  ],
  "narrative-review-grounding": [
    {
      id: "nr-pos-1",
      taskId: "narrative-review-grounding",
      kind: "positive",
      claim: "Offer: roof repairs for homeowners",
      excerpt: "We repair roofs for local homeowners",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "supports",
      confidence: 0.93,
      goldMachineCoverable: true,
      goldRetainAgent: false,
    },
    {
      id: "nr-neg-1",
      taskId: "narrative-review-grounding",
      kind: "negative",
      claim: "Customer: national franchise buyers",
      excerpt: "We serve local homeowners",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "contradicts",
      confidence: 0.9,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "nr-miss-1",
      taskId: "narrative-review-grounding",
      kind: "missing_evidence",
      claim: "Proof: 40 years in business",
      excerpt: "",
      sourceExists: false,
      quoteFound: false,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "nr-conf-1",
      taskId: "narrative-review-grounding",
      kind: "conflict",
      claim: "Service scope: 24/7 emergency",
      excerpt: "Hours: weekdays 9-5",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "contradicts",
      confidence: 0.92,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "nr-omit-1",
      taskId: "narrative-review-grounding",
      kind: "candidate_omission",
      claim: "Customer: commercial property managers",
      excerpt: "Residential roof repair specialists",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "says_nothing",
      confidence: 0.55,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "nr-amb-1",
      taskId: "narrative-review-grounding",
      kind: "ambiguous",
      claim: "Offer: premium craftsmanship",
      excerpt: "We take pride in our work",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "says_nothing",
      confidence: 0.62,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "nr-err-1",
      taskId: "narrative-review-grounding",
      kind: "service_error",
      claim: "Offer: roof repairs",
      excerpt: "We repair roofs",
      sourceExists: true,
      quoteFound: true,
      serviceError: true,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
  ],
  "copy-review-grounding": [
    {
      id: "cr-pos-1",
      taskId: "copy-review-grounding",
      kind: "positive",
      claim: "CTA Request an estimate -> /contact contact_form",
      excerpt: "Label: Request an estimate | Destination: /contact | Behavior: contact_form",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "supports",
      confidence: 0.95,
      goldMachineCoverable: true,
      goldRetainAgent: false,
    },
    {
      id: "cr-neg-1",
      taskId: "copy-review-grounding",
      kind: "negative",
      claim: "CTA Book now -> instant scheduling",
      excerpt: "Label: Request an estimate | Destination: /contact | Behavior: contact_form",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "contradicts",
      confidence: 0.93,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "cr-miss-1",
      taskId: "copy-review-grounding",
      kind: "missing_evidence",
      claim: "CTA Call now",
      excerpt: "",
      sourceExists: false,
      quoteFound: false,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "cr-conf-1",
      taskId: "copy-review-grounding",
      kind: "conflict",
      claim: "CTA Schedule online",
      excerpt: "Storyboard action is contact form only",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "contradicts",
      confidence: 0.88,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "cr-omit-1",
      taskId: "copy-review-grounding",
      kind: "candidate_omission",
      claim: "CTA Get started",
      excerpt: "No matching storyboard action",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "says_nothing",
      confidence: 0.8,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "cr-amb-1",
      taskId: "copy-review-grounding",
      kind: "ambiguous",
      claim: "CTA Learn more",
      excerpt: "Label: Request an estimate",
      sourceExists: true,
      quoteFound: true,
      relationChoice: "says_nothing",
      confidence: 0.6,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
    {
      id: "cr-err-1",
      taskId: "copy-review-grounding",
      kind: "service_error",
      claim: "CTA Request an estimate",
      excerpt: "Label: Request an estimate",
      sourceExists: true,
      quoteFound: true,
      serviceError: true,
      goldMachineCoverable: false,
      goldRetainAgent: true,
    },
  ],
};

function sevenKinds(taskId: string, claim: string, excerpt: string): LabeledPolicyCase[] {
  return [
    { id: `${taskId}-pos`, taskId, kind: "positive", claim, excerpt, sourceExists: true, quoteFound: true, relationChoice: "supports", confidence: 0.95, goldMachineCoverable: true, goldRetainAgent: false },
    { id: `${taskId}-neg`, taskId, kind: "negative", claim, excerpt: "Opposite evidence", sourceExists: true, quoteFound: true, relationChoice: "contradicts", confidence: 0.92, goldMachineCoverable: false, goldRetainAgent: true },
    { id: `${taskId}-miss`, taskId, kind: "missing_evidence", claim, excerpt: "", sourceExists: false, quoteFound: false, goldMachineCoverable: false, goldRetainAgent: true },
    { id: `${taskId}-conf`, taskId, kind: "conflict", claim, excerpt: "Conflicting source", sourceExists: true, quoteFound: true, relationChoice: "contradicts", confidence: 0.9, goldMachineCoverable: false, goldRetainAgent: true },
    { id: `${taskId}-omit`, taskId, kind: "candidate_omission", claim, excerpt, sourceExists: true, quoteFound: true, relationChoice: "says_nothing", confidence: 0.45, goldMachineCoverable: false, goldRetainAgent: true },
    { id: `${taskId}-amb`, taskId, kind: "ambiguous", claim, excerpt: "Vague adjacent wording", sourceExists: true, quoteFound: true, relationChoice: "says_nothing", confidence: 0.65, goldMachineCoverable: false, goldRetainAgent: true },
    { id: `${taskId}-err`, taskId, kind: "service_error", claim, excerpt, sourceExists: true, quoteFound: true, serviceError: true, goldMachineCoverable: false, goldRetainAgent: true },
  ];
}

TASK_DATASETS["claim-strengthening-check"] = sevenKinds("claim-strengthening-check", "Award-winning team", "We completed 12 local jobs last year");
TASK_DATASETS["cross-stage-consistency-check"] = sevenKinds("cross-stage-consistency-check", "Audience homeowners", "Copy addresses property managers");
TASK_DATASETS["cta-fidelity-check"] = sevenKinds("cta-fidelity-check", "Schedule a visit", "Button submits a contact form");
TASK_DATASETS["intent-coverage-check"] = sevenKinds("intent-coverage-check", "Do you offer financing?", "Financing is not mentioned");
TASK_DATASETS["creative-dimension-scoring"] = sevenKinds("creative-dimension-scoring", "Direction A audience fit", "Warm editorial for local trade");
TASK_DATASETS["media-fit-scoring"] = sevenKinds("media-fit-scoring", "Hero photo of crew", "Stock office handshake");
TASK_DATASETS["component-fit-check"] = sevenKinds("component-fit-check", "Hero needs a phone CTA and 4x3 media", "Block is a static quote with no actions slot");

function extraHeldOutCases(taskId: string): LabeledPolicyCase[] {
  return [
    { id: `${taskId}-qual-drop`, taskId, kind: "negative", claim: "Open 24/7 emergency service", excerpt: "Open weekdays 9am to 5pm. Closed weekends.", sourceExists: true, quoteFound: true, relationChoice: "contradicts", confidence: 0.93, goldMachineCoverable: false, goldRetainAgent: true },
    { id: `${taskId}-third-party-phone`, taskId, kind: "conflict", claim: "Call 800-555-0199", excerpt: "As featured in The Inquirer. Call 800-555-0199 for the newspaper. Our shop: 215-555-0100.", sourceExists: true, quoteFound: true, relationChoice: "says_nothing", confidence: 0.88, goldMachineCoverable: false, goldRetainAgent: true },
    { id: `${taskId}-cta-mismatch`, taskId, kind: "negative", claim: "Schedule a visit", excerpt: "Rendered control opens mailto:sales@ex.test", sourceExists: true, quoteFound: true, relationChoice: "contradicts", confidence: 0.9, goldMachineCoverable: false, goldRetainAgent: true },
    { id: `${taskId}-goal-gap`, taskId, kind: "missing_evidence", claim: "High-priority financing question", excerpt: "", sourceExists: false, quoteFound: false, goldMachineCoverable: false, goldRetainAgent: true },
    { id: `${taskId}-heldout-pos`, taskId, kind: "positive", claim: "Licensed since 1998", excerpt: "Licensed since 1998", sourceExists: true, quoteFound: true, relationChoice: "supports", confidence: 0.97, goldMachineCoverable: true, goldRetainAgent: false },
    { id: `${taskId}-heldout-amb`, taskId, kind: "ambiguous", claim: "Family owned", excerpt: "A small local crew", sourceExists: true, quoteFound: true, relationChoice: "says_nothing", confidence: 0.55, goldMachineCoverable: false, goldRetainAgent: true },
  ];
}

for (const taskId of Object.keys(TASK_DATASETS)) {
  TASK_DATASETS[taskId] = [...(TASK_DATASETS[taskId] || []), ...extraHeldOutCases(taskId)];
}

function policyOf(c: LabeledPolicyCase): { machineCoverable: boolean; retainAgent: boolean } {
  if (c.serviceError) return { machineCoverable: false, retainAgent: true };
  const codeCheck: CodeQuoteCheck = {
    sourceExists: c.sourceExists,
    quoteFound: c.quoteFound,
    normalizedMatch: c.quoteFound,
    excerptLength: c.excerpt.length,
  };
  const evaluated = evaluateGroundingVerdict({
    codeCheck,
    relationChoice: c.relationChoice,
    confidence: c.confidence,
    threshold: 0.85,
  });
  const machineCoverable = evaluated.verdict === "verified" && evaluated.autoAccepted;
  return { machineCoverable, retainAgent: !machineCoverable };
}

export interface DatasetPolicyReport {
  taskId: string;
  metrics: CalibrationMetrics;
  confusion: { tp: number; fp: number; tn: number; fn: number };
  byKind: Record<DatasetCaseKind, { n: number; errors: number }>;
}

/**
 * End-to-end policy behavior on labeled cases — not primitive-only accuracy.
 * A false pass is a case gold-labeled retainAgent that policy would machine-cover.
 */
export function evaluateLabeledDataset(taskId: string, cases?: LabeledPolicyCase[]): DatasetPolicyReport {
  const rows = cases ?? TASK_DATASETS[taskId] ?? [];
  let tp = 0, fp = 0, tn = 0, fn = 0;
  const byKind: Record<DatasetCaseKind, { n: number; errors: number }> = {
    positive: { n: 0, errors: 0 },
    negative: { n: 0, errors: 0 },
    missing_evidence: { n: 0, errors: 0 },
    conflict: { n: 0, errors: 0 },
    candidate_omission: { n: 0, errors: 0 },
    ambiguous: { n: 0, errors: 0 },
    service_error: { n: 0, errors: 0 },
  };

  for (const c of rows) {
    const pred = policyOf(c);
    byKind[c.kind].n++;
    const goldCover = c.goldMachineCoverable;
    if (pred.machineCoverable && goldCover) tp++;
    else if (pred.machineCoverable && !goldCover) {
      fp++;
      byKind[c.kind].errors++;
    } else if (!pred.machineCoverable && !goldCover) tn++;
    else {
      fn++;
      byKind[c.kind].errors++;
    }
  }

  return {
    taskId,
    metrics: computeCalibrationMetrics({
      tp,
      fp,
      tn,
      fn,
      maxAllowedFalsePassRate: 0.02,
      minSampleSize: 30,
    }),
    confusion: { tp, fp, tn, fn },
    byKind,
  };
}

export function allDatasetTaskIds(): string[] {
  return Object.keys(TASK_DATASETS);
}
