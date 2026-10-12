import { createHash } from "node:crypto";
import type { Storyboard, StoryboardSection } from "./artifacts.ts";

export type CompositionFinding = {
  id: string;
  route: string;
  section: string;
  evidence: string;
  severity: "advisory" | "major";
  problem: string;
  repair: string;
  owner: "agent";
  kind: "useful-repetition" | "monotonous-stack" | "palette-only" | "obscured-action";
};

function findingId(route: string, sections: string[], kind: string): string {
  return createHash("sha256").update([route, kind, ...sections].join("|")).digest("hex").slice(0, 16);
}

function jobs(section: StoryboardSection): string {
  return `${section.role || ""} ${section.purpose || ""} ${section.question || ""}`.toLowerCase();
}

/** Deterministic reading of the storyboard. Palette words alone never clear a finding. */
export function assessComposition(story: Storyboard): CompositionFinding[] {
  const findings: CompositionFinding[] = [];
  for (const page of story.pages || []) {
    const sections = page.sections || [];
    const families = new Set(sections.map(section => section.layoutFamily || section.composition || ""));
    const emphases = new Set(sections.map(section => section.emphasis || ""));
    const rationales = sections.map(section => (section.repetitionRationale || "").trim()).filter(Boolean);
    const unrelated = new Set(sections.map(jobs));
    if (sections.length >= 5 && families.size === 1 && emphases.size === 1 && unrelated.size >= 4 && rationales.length === 0) {
      findings.push({
        id: findingId(page.path, sections.map(section => section.id), "monotonous-stack"),
        route: page.path,
        section: sections.map(section => section.id).join(","),
        evidence: `Sections share layout "${[...families][0]}" and emphasis "${[...emphases][0]}" without a repetition rationale, across jobs: ${[...unrelated].slice(0, 5).join(" | ")}`,
        severity: "advisory",
        problem: "Equal emphasis across unrelated narrative jobs reads as an interchangeable stack.",
        repair: "Give the primary visitor job a different emphasis, or record why the repeated treatment is one list.",
        owner: "agent",
        kind: "monotonous-stack",
      });
    }
    const action = sections.find(section => section.action && /obscure|hidden|below the fold only/i.test(`${section.emphasisReason || ""} ${section.mobileTransformation || ""}`));
    if (action) {
      findings.push({
        id: findingId(page.path, [action.id], "obscured-action"),
        route: page.path,
        section: action.id,
        evidence: action.emphasisReason || action.mobileTransformation || action.emphasis,
        severity: "advisory",
        problem: "The primary action is described as obscured.",
        repair: "Keep the action in the first reading sequence on desktop and after the mobile transformation.",
        owner: "agent",
        kind: "obscured-action",
      });
    }
  }
  return findings;
}

export function formatCompositionAssistSummary(findings: CompositionFinding[]): string {
  if (!findings.length) return "";
  return [
    "## Jev composition assist (advisory)",
    "Deterministic composition-preflight.json is authoritative. Semantic repetition scoring is not calibrated; use the deterministic findings below.",
    ...findings.map(f => `- ${f.route}#${f.section}: ${f.problem}`),
  ].join("\n");
}

export function paletteChangeResolves(previous: CompositionFinding[], next: CompositionFinding[]): boolean {
  const prev = new Set(previous.filter(item => item.kind === "monotonous-stack").map(item => item.id));
  const now = new Set(next.filter(item => item.kind === "monotonous-stack").map(item => item.id));
  for (const id of prev) if (now.has(id)) return false;
  return prev.size > 0;
}
