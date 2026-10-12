import { loadKnowledgeCatalog, selectLessonsForStage } from "../agent/design-knowledge.ts";
import { KNOWLEDGE_RELEASE } from "./contracts.ts";
import { coverageReport, loadKnowledgeV2 } from "./pack.ts";
import { selectStageKnowledge, type StageSignals } from "./selection.ts";
import { signalsFromSite } from "../agent/design-knowledge.ts";
import { findActivePreparation } from "../agent/preparation.ts";
import { loadPersistedDesignContextPacket } from "../agent/design-context-store.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { siteWidgets } from "./site-widgets.ts";
import type { Storyboard } from "../agent/artifacts.ts";

export function explainStage(root: string, stage: string): { text: string; release: string; lessonIds: string[]; requirementIds: string[] } {
  const pack = loadKnowledgeV2(root);
  const validPack = pack && pack.errors.length === 0 ? pack : undefined;
  const catalog = loadKnowledgeCatalog(root);
  const lessons = catalog ? selectLessonsForStage(root, stage) : [];
  let story: Storyboard | undefined;
  const storyPath = join(root, "onboarding/storyboard.json");
  if (existsSync(storyPath)) try { story = JSON.parse(readFileSync(storyPath, "utf8")) as Storyboard; } catch { /* prospective explanation can omit invalid plan */ }
  const signals: StageSignals = { ...signalsFromSite(root), widgets: siteWidgets(root, story).widgets };
  const selected = selectStageKnowledge({
    requirements: validPack?.requirements || [],
    lessons,
    signals,
    stage,
  });
  const preparation = findActivePreparation(root, stage);
  const actual = preparation ? loadPersistedDesignContextPacket(root, preparation.id)?.manifest : undefined;
  const actualRequirements = actual?.selectedRequirements
    ? actual.selectedRequirements.map(entry => validPack?.requirements.find(item => item.id === entry.id)).filter((item): item is NonNullable<typeof item> => !!item)
    : selected.requirements;
  const actualLessons = actual?.selectedLessons
    ? actual.selectedLessons.map(entry => lessons.find(item => item.id === entry.id)).filter((item): item is NonNullable<typeof item> => !!item)
    : selected.lessons;
  const lines = [
    `Knowledge release ${pack?.release || KNOWLEDGE_RELEASE}`,
    `Stage ${stage}`,
    ...(actual ? [`Active preparation ${preparation!.id}: these are the recorded live selections.`] : ["No active preparation: these are prospective selections."]),
    "Mandatory and applicable requirements:",
    ...actualRequirements.map(item => `- ${item.id} [${item.authorityClass}/${item.severityPolicy}/${item.implementationStatus}] ${item.instruction}`),
    "Eligible lessons:",
    ...actualLessons.map(item => `- ${item.id} because ${item.reason}`),
  ];
  if (!pack) lines.push("v2 pack did not load. Lesson ids from v1 are still listed when the catalog verifies.");
  if (pack?.errors.length) lines.push(`v2 pack quarantined: ${pack.errors.join("; ")}`);
  if (pack && coverageReport(pack).missingClassification.length) {
    lines.push(`Unclassified requirements: ${coverageReport(pack).missingClassification.join(", ")}`);
  }
  return {
    text: lines.join("\n"),
    release: pack?.release || KNOWLEDGE_RELEASE,
    lessonIds: actual?.selectedLessons.map(item => item.id) || selected.lessons.map(item => item.id),
    requirementIds: actual?.selectedRequirements.map(item => item.id) || selected.requirements.map(item => item.id),
  };
}
