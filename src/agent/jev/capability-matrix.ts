import { allTasks, type JevTaskRegistration } from "./service-registry.ts";
import { DELEGATION_PRIORITY_ORDER, getKernelCalibration } from "./calibration.ts";
import { QUESTION_VERSION } from "./questions.ts";
import { POLICY_VERSION } from "./policy.ts";

export interface CapabilityMatrixRow {
  taskId: string;
  primitive: "Choice" | "Noul" | "Score" | "mixed" | "none";
  applicability: string;
  caller: string;
  consumer: string;
  fallback: string;
  ownershipEffect: "none" | "additive_assist" | "may_remove_when_delegated";
  calibrationStatus: "uncalibrated" | "pilot_only" | "eligible";
  testId: string;
  implementedCaller: boolean;
}

const PRIMITIVE: Record<string, CapabilityMatrixRow["primitive"]> = {
  "media-taxonomy": "Choice", "media-section-ranking": "Score", "media-set-review": "Choice", "media-provenance-check": "Choice",
  "business-source-selection": "mixed",
  "business-review-grounding": "Choice",
  "narrative-review-grounding": "Choice",
  "copy-review-grounding": "Choice",
  "claim-strengthening-check": "Noul",
  "cross-stage-consistency-check": "Choice",
  "cta-fidelity-check": "Choice",
  "intent-coverage-check": "Noul",
  "creative-dimension-scoring": "Score",
  "media-fit-scoring": "Score",
  "direction-decision-check": "Choice",
  "composition-repetition-check": "none",
  "component-fit-check": "Score",
};

const APPLICABILITY: Record<string, string> = {
  "business-source-selection": "harvest candidate spans; Choice for single-value fields, Noul per candidate for multi-value fields",
  "business-review-grounding": "onboarding/business.json facts with cited evidence",
  "narrative-review-grounding": "onboarding/narrative-brief.json against business facts",
  "copy-review-grounding": "copy-plan CTAs vs storyboard actions",
  "claim-strengthening-check": "copy-plan/HTML assertions vs evidence (Noul error flags)",
  "cross-stage-consistency-check": "business→narrative→storyboard→copy edges",
  "cta-fidelity-check": "CTA label vs recorded textual behavior contract",
  "intent-coverage-check": "approved visitor questions vs page text",
  "creative-dimension-scoring": "textual direction/copy alternatives (advisory; agent keeps choice)",
  "direction-decision-check": "textual direction proposals against visitor goal, evidence, and user constraints",
  "composition-repetition-check": "storyboard section sequence, emphasis, and repetition rationale",
  "media-fit-scoring": "media vs section using agent text observations only (no pixels)",
  "component-fit-check": "section text metadata vs block README/slots; Jev does not inspect images",
};

const IMPLEMENTED_CALLERS = new Set([
  "media-taxonomy", "media-section-ranking", "media-set-review", "media-provenance-check",
  "business-source-selection",
  "business-review-grounding",
  "narrative-review-grounding",
  "copy-review-grounding",
  "claim-strengthening-check",
  "cross-stage-consistency-check",
  "cta-fidelity-check",
  "intent-coverage-check",
  "creative-dimension-scoring",
  "media-fit-scoring",
  "direction-decision-check",
  "composition-repetition-check",
  "component-fit-check",
]);

const MAY_REMOVE = new Set([
  "business-source-selection",
  "business-review-grounding",
  "narrative-review-grounding",
  "copy-review-grounding",
]);

export function buildCapabilityMatrix(tasks: JevTaskRegistration[] = allTasks()): CapabilityMatrixRow[] {
  return tasks.map(t => {
    const cal = getKernelCalibration(t.taskId);
    let calibrationStatus: CapabilityMatrixRow["calibrationStatus"] = "uncalibrated";
    if (cal?.eligible) calibrationStatus = "eligible";
    else if (cal?.pilotOnly) calibrationStatus = "pilot_only";
    const implemented = IMPLEMENTED_CALLERS.has(t.taskId);
    return {
      taskId: t.taskId,
      primitive: PRIMITIVE[t.taskId] ?? "none",
      applicability: APPLICABILITY[t.taskId] ?? t.description,
      caller: t.lifecycleCaller.join(", "),
      consumer: t.outputConsumer,
      fallback: t.fallback,
      ownershipEffect: !implemented
        ? "none"
        : MAY_REMOVE.has(t.taskId)
          ? "may_remove_when_delegated"
          : "additive_assist",
      calibrationStatus,
      testId: t.testId,
      implementedCaller: implemented,
    };
  });
}

export function formatCapabilityMatrixMarkdown(rows: CapabilityMatrixRow[] = buildCapabilityMatrix()): string {
  const header = [
    "| Task | Primitive | Applicability | Caller | Consumer | Fallback | Ownership effect | Calibration | Test | Implemented |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  const body = rows.map(r =>
    `| ${r.taskId} | ${r.primitive} | ${r.applicability} | ${r.caller} | ${r.consumer} | ${r.fallback} | ${r.ownershipEffect} | ${r.calibrationStatus} | ${r.testId} | ${r.implementedCaller ? "yes" : "no"} |`
  );
  const order = `\nDelegation priority (calibrated tasks only): ${DELEGATION_PRIORITY_ORDER.join(" → ")}\n`;
  const versions = `\nQuestion version: ${QUESTION_VERSION}. Policy version: ${POLICY_VERSION}. Policy is separate from prompts.\n`;
  return [...header, ...body].join("\n") + order + versions;
}

export function assertMatrixCoversRegistry(tasks: JevTaskRegistration[] = allTasks()): string[] {
  const rows = buildCapabilityMatrix(tasks);
  const errors: string[] = [];
  const rowIds = new Set(rows.map(r => r.taskId));
  for (const t of tasks) {
    if (!rowIds.has(t.taskId)) errors.push(`Registry task "${t.taskId}" missing from capability matrix`);
    const row = rows.find(r => r.taskId === t.taskId);
    if (!row) continue;
    if (!t.lifecycleCaller.length) errors.push(`Task "${t.taskId}" has no lifecycle caller`);
    if (!t.outputConsumer) errors.push(`Task "${t.taskId}" has no consumer`);
    if (!t.fallback) errors.push(`Task "${t.taskId}" has no fallback`);
    if (!t.testId) errors.push(`Task "${t.taskId}" has no test id`);
    if (row.ownershipEffect !== "none" && !row.implementedCaller) {
      errors.push(`Task "${t.taskId}" claims ownership effect without an implemented caller`);
    }
  }
  return errors;
}
