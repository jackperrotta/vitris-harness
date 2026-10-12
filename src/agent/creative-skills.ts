import { createHash } from "node:crypto";
import { findHarnessRoot } from "../cli/root.ts";
import { resolveManagedInstructionWithProvenance } from "../upgrade/kit.ts";

export type CreativeSkill = {
  id: string;
  version: number;
  purpose: string;
  prerequisites: string[];
  related: string[];
  applicability: string[];
  requiredInputs: string[];
  outputContract: string;
  tools: string[];
  validation: string;
  contraindications: string[];
  expansionHandle: string;
};
const entry = (id: string, purpose: string, prerequisites: string[], related: string[], refs: string[], outputContract: string): CreativeSkill => ({
  id, version: 1, purpose, prerequisites, related, applicability: ["creative-v1"], requiredInputs: ["onboarding/business.json"],
  outputContract, tools: [], validation: "Inspect source evidence and rendered result where applicable", contraindications: ["Do not copy third-party claims or complete identities"], expansionHandle: `ref:${refs[0]}`,
});
export const CREATIVE_SKILLS: CreativeSkill[] = [
  entry("motion-page", "Compose the whole journey of each route without an effect quota", ["motion-direction"], ["motion-choreography"], ["motion-page"], "Located opening/development/closing, all-route coverage and full journey evidence"),
  entry("motion-direction", "Choose useful movement and quiet intervals from business evidence", [], ["purposeful-interaction"], ["motion"], "motionPlan v2: every authored route, ordered beats, connected quiet intervals and located journey review"),
  entry("motion-statistics", "Emphasize a supplied magnitude with canonical accessible formatting", ["motion-direction"], ["motion-phrases"], ["motion-count"], "Fact-bound count scene or justified static statistic"),
  entry("motion-phrases", "Pace one semantic phrase without hiding essential copy", ["motion-direction"], ["motion-choreography"], ["motion-text"], "Selected phrase treatment with wrapping and focus evidence"),
  entry("motion-choreography", "Relate imagery, captions and process accents with quiet intervals", ["motion-direction"], ["motion-statistics"], ["motion-sequence"], "Short composed sequence with mobile/static treatments"),
  entry("business-positioning", "Find the offer and supported difference", [], ["narrative"], ["business"], "Grounded brief"),
  entry("narrative", "Order the visitor's questions and proof", ["business-positioning"], ["copy-layout"], ["storyboard"], "Visitor journey"),
  entry("visual-research", "Adapt transferable principles from several references", ["business-positioning"], ["art-direction"], ["inspiration"], "Reference analysis"),
  entry("art-direction", "Turn the central idea into a coherent visual system", ["narrative", "visual-research"], ["typography", "composition", "media-direction"], ["direction"], "Candidate direction"),
  entry("typography", "Give information a readable expressive hierarchy", ["art-direction"], ["composition"], ["layout"], "Type rules"),
  entry("composition", "Use layout and rhythm to express priority", ["art-direction"], ["typography"], ["compose"], "Composed pages"),
  entry("media-direction", "Choose authentic images and identify gaps", ["business-positioning"], ["art-direction"], ["media"], "Media placements"),
  entry("copy-layout", "Develop copy and layout together", ["narrative", "composition"], ["media-direction"], ["copy"], "Page source"),
  entry("purposeful-interaction", "Use interaction when it helps a visitor decide or act", ["narrative"], ["responsive-design"], ["ui-ux"], "Interaction behavior"),
  entry("responsive-design", "Preserve hierarchy and controls across widths", ["composition"], ["purposeful-interaction"], ["layout"], "Responsive source"),
  entry("visual-critique", "Locate consequential visual weaknesses in pixels", ["composition"], ["visitor-journey"], ["critic"], "Located findings"),
  entry("visitor-journey", "Attempt the declared visitor tasks", ["narrative"], ["visual-critique"], ["usability"], "Journey findings"),
];

export function validateCreativeSkills(skills: CreativeSkill[]): string[] {
  const errors: string[] = [], map = new Map(skills.map(s => [s.id, s]));
  if (map.size !== skills.length) errors.push("Duplicate skill IDs");
  for (const skill of skills) {
    if (!skill.id || !Number.isInteger(skill.version) || skill.version < 1 || !skill.purpose || !skill.outputContract || !skill.expansionHandle) errors.push(`Invalid skill ${skill.id}`);
    for (const dep of skill.prerequisites) if (!map.has(dep)) errors.push(`Unknown prerequisite ${dep}`);
    for (const related of skill.related) if (!map.has(related)) errors.push(`Unknown related skill ${related}`);
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) { errors.push(`Prerequisite cycle at ${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of map.get(id)?.prerequisites || []) if (map.has(dep)) visit(dep);
    visiting.delete(id); visited.add(id);
  };
  for (const skill of skills) visit(skill.id);
  return errors;
}

export function selectedCreativeSkills(ids: string[], root: string, kernel = findHarnessRoot()): { descriptions: CreativeSkill[]; expansions: { id: string; hash: string; text: string; provenance: string }[] } {
  const errors = validateCreativeSkills(CREATIVE_SKILLS);
  if (errors.length) throw new Error(errors.join("; "));
  const map = new Map(CREATIVE_SKILLS.map(s => [s.id, s]));
  const selected = new Set<string>();
  const add = (id: string) => {
    if (selected.has(id)) return;
    const skill = map.get(id);
    if (!skill) throw new Error(`Unknown creative skill ${id}`);
    for (const dep of skill.prerequisites) add(dep);
    selected.add(id);
  };
  ids.forEach(add);
  const descriptions = CREATIVE_SKILLS.filter(s => selected.has(s.id));
  const expansions = [...new Map(descriptions.map(skill => [skill.expansionHandle, skill])).values()].map(skill => {
    const resolved = resolveManagedInstructionWithProvenance(root, kernel, `refs/${skill.expansionHandle.slice(4)}.md`);
    return { id: skill.expansionHandle, hash: createHash("sha256").update(resolved.content).digest("hex"), text: resolved.content, provenance: resolved.provenance };
  });
  return { descriptions, expansions };
}
