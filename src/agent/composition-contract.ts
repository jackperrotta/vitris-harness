import type { Business, MediaInventory, Storyboard } from "./artifacts.ts";
import type { CompositionPack } from "../knowledge/composition.ts";
import { COMPOSITION_LESSON_RELEASE } from "./composition-authoring.ts";

const present = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const stable = (value: string) => /^[a-z][a-z0-9-]*$/.test(value);

/** Structural and referential checks only. Rendered quality is judged separately. */
export function validateCompositionStoryboard(story: Storyboard, pack: CompositionPack, business: Business, media: MediaInventory): string[] {
  const errors: string[] = [];
  if (story.compositionContractVersion !== 1 || story.compositionLessonRelease !== COMPOSITION_LESSON_RELEASE || story.compositionLessonRelease !== pack.release) {
    return ["Storyboard composition contract/release does not match the selected lesson pack"];
  }
  const facts = new Set(business.facts.map(item => item.id));
  const assets = new Set(media.assets.filter(item => item.inspected && item.disposition === "use").map(item => item.id));
  const lessons = new Map(pack.lessons.map(item => [item.id, item]));
  for (const page of story.pages) {
    const sections = new Map(page.sections.map(item => [item.id, item]));
    const intent = page.compositionIntent;
    if (!intent || !present(intent.organizingRelationship) || !Array.isArray(intent.readingSequence)) { errors.push(`Page ${page.path} needs compositionIntent`); continue; }
    if (new Set(intent.readingSequence).size !== intent.readingSequence.length || intent.readingSequence.some(id => !sections.has(id))) errors.push(`Page ${page.path} has invalid readingSequence`);
    const elements = new Map<string,string>();
    for (const section of page.sections) for (const element of section.elementPlan || []) {
      const qualified = `${section.id}/${element.id}`;
      if (!stable(element.id) || elements.has(element.id) || !present(element.role) || !Array.isArray(element.contentRefs)) errors.push(`Invalid or duplicate planned element ${page.path}#${qualified}`);
      elements.set(element.id, section.id);
      for (const ref of element.contentRefs || []) {
        if (ref.kind === "fact" && !facts.has(ref.id)) errors.push(`Unknown fact ${ref.id} in ${qualified}`);
        else if (ref.kind === "media" && !assets.has(ref.id)) errors.push(`Unavailable media ${ref.id} in ${qualified}`);
        else if ((ref.kind === "section-message" || ref.kind === "section-action") && (!sections.has(ref.sectionId) || ref.kind === "section-action" && !sections.get(ref.sectionId)?.action)) errors.push(`Unknown section content in ${qualified}`);
        else if (!["fact","media","copy","section-message","section-action"].includes(ref.kind)) errors.push(`Unknown content reference kind in ${qualified}`);
      }
    }
    const edges: [string,string][] = [];
    const allRelations = [...(intent.crossSectionRelationships || []), ...page.sections.flatMap(item => item.relationships || [])];
    for (const relation of allRelations) {
      if (!elements.has(relation.from) || !elements.has(relation.to) || !present(relation.intent) || !["groups-with","supports","compares-with","annotates","precedes","aligns-with","other"].includes(relation.kind)) errors.push(`Invalid relationship ${page.path}:${relation.from}→${relation.to}`);
      if (relation.kind === "precedes") edges.push([relation.from,relation.to]);
    }
    const visiting = new Set<string>(), visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) { errors.push(`Precedence cycle on ${page.path} at ${id}`); return; }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const [,to] of edges.filter(([from]) => from === id)) visit(to);
      visiting.delete(id); visited.add(id);
    };
    for (const id of elements.keys()) visit(id);
    const observations = new Set<string>();
    for (const section of page.sections) {
      for (const observation of section.renderObservations || []) {
        if (!stable(observation.id) || observations.has(observation.id) || !observation.elementIds?.length || observation.elementIds.some(id => !elements.has(id)) || !present(observation.state) || !present(observation.expectation) || !["all","narrow","wide"].includes(observation.viewportClass) || !["visual","browser","content"].includes(observation.verification)) errors.push(`Invalid render observation ${page.path}#${observation.id}`);
        observations.add(observation.id);
      }
      for (const application of section.lessonApplications || []) {
        const lesson = lessons.get(application.id);
        if (!lesson || lesson.version !== application.version || lesson.contentHash !== application.contentHash || !["apply","adapt","decline"].includes(application.decision) || !present(application.reason) || application.elementIds.some(id => !elements.has(id))) errors.push(`Invalid lesson application ${page.path}#${section.id}:${application.id}`);
        if (application.decision !== "decline" && !application.elementIds.some(id => [...page.sections.flatMap(item => item.renderObservations || [])].some(observation => observation.elementIds.includes(id)))) errors.push(`Lesson application ${page.path}#${section.id}:${application.id} needs a located render observation`);
      }
    }
    const allObservations = page.sections.flatMap(item => item.renderObservations || []);
    for (const relation of allRelations) if (elements.has(relation.from) && elements.has(relation.to) && !allObservations.some(item => item.elementIds.includes(relation.from) && item.elementIds.includes(relation.to))) errors.push(`Relationship ${page.path}:${relation.from}→${relation.to} needs a located render observation`);
  }
  return errors;
}
