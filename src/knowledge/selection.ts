import type { KnowledgeRequirement } from "./contracts.ts";
import type { LessonSelection, SelectionSignals } from "../agent/design-knowledge.ts";

export type StageSignals = SelectionSignals & {
  widgets?: string[];
  contactPath?: boolean;
};

export function requirementApplies(requirement: KnowledgeRequirement, signals: StageSignals, stage: string): boolean {
  if (requirement.stages.length && !requirement.stages.includes(stage) && !requirement.stages.includes("*")) return false;
  if (requirement.widget) return (signals.widgets || []).includes(requirement.widget);
  if (requirement.applicability === "contact-path") return signals.contactPath === true || signals.visitorJobs.some(job => /contact|estimate|appoint|call/i.test(job));
  if (requirement.applicability === "service-site") return true;
  if (requirement.applicability === "always") return true;
  return requirement.applicability === "always";
}

/** Mandatory requirements stay even when the advisory lesson budget is zero. */
export function selectStageKnowledge(input: {
  requirements: KnowledgeRequirement[];
  lessons: LessonSelection[];
  signals: StageSignals;
  stage: string;
  lessonLimit?: number;
}): { requirements: KnowledgeRequirement[]; lessons: LessonSelection[] } {
  const applicable = input.requirements.filter(item => requirementApplies(item, input.signals, input.stage));
  const mandatory = applicable.filter(item => item.severityPolicy === "blocker" || item.authorityClass === "standard" || item.authorityClass === "project-policy");
  const advisory = applicable.filter(item => !mandatory.includes(item));
  const lessons = input.lessons.slice(0, input.lessonLimit ?? input.lessons.length);
  return { requirements: [...mandatory, ...advisory], lessons };
}
