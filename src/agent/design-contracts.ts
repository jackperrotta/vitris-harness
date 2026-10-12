import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  fingerprint,
  json,
  save,
  type Business,
  type DesignOpportunity,
  type Direction,
  type DirectionDecisionKind,
  type MediaInventory,
  type NarrativeBrief,
  type ReferenceAnalysis,
  type Storyboard,
} from "./artifacts.ts";
import { invalidate, type AgentState, type SkillGraph } from "./graph.ts";
import { lessonById, loadKnowledgeCatalog, type KnowledgeLesson } from "./design-knowledge.ts";
import { resolveDesignAuthoring } from "./composition-authoring.ts";
import { loadCompositionPack } from "../knowledge/composition.ts";

const DECISION_KINDS: DirectionDecisionKind[] = ["typography", "composition", "media", "navigation", "interaction", "density", "surface"];
const MIGRATION = "Regenerate the affected design stage from current evidence. Do not restart harvest and do not invent the missing fields.";

function present(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function assessDesignContractMigration(root: string): {
  harvestRestart: false;
  regenerate: string[];
  reasons: string[];
} {
  const regenerate: string[] = [];
  const reasons: string[] = [];
  const narrativePath = join(root, "onboarding/narrative-brief.json");
  if (existsSync(narrativePath)) {
    const narrative = json<NarrativeBrief>(narrativePath);
    if (narrative.schemaVersion !== 2 || !narrative.designOpportunities?.length) {
      regenerate.push("narrative");
      reasons.push(`Narrative brief is schema ${narrative.schemaVersion ?? "unknown"} without design opportunities. ${MIGRATION}`);
    }
  }
  const directionPath = join(root, "onboarding/direction.json");
  if (existsSync(directionPath)) {
    const direction = json<Direction>(directionPath);
    if (direction.designContractVersion !== 1 || !present(direction.centralIdea)) {
      regenerate.push("direction");
      reasons.push(`Direction has no design-decision trail. ${MIGRATION}`);
    }
  }
  const storyPath = join(root, "onboarding/storyboard.json");
  if (existsSync(storyPath)) {
    const story = json<Storyboard>(storyPath);
    if (story.designContractVersion !== 1) {
      regenerate.push("storyboard");
      reasons.push(`Storyboard has no composition contract. ${MIGRATION}`);
    }
  }
  const analysisPath = join(root, "onboarding/reference-analysis.json");
  if (existsSync(analysisPath)) {
    const analysis = json<ReferenceAnalysis>(analysisPath);
    if (!analysis.teachingPrinciples?.length) {
      regenerate.push("reference-analysis");
      reasons.push(`Reference analysis has inspected evidence only and no selected teaching principles. ${MIGRATION}`);
    }
  }
  return { harvestRestart: false, regenerate, reasons };
}

const MIGRATION_PIPELINE = ["narrative", "reference-analysis", "direction", "storyboard"] as const;

/** Invalidate the earliest stale design stage and downstream gates; preserve harvested artifacts on disk. */
export function applyDesignContractMigration(root: string, graph: SkillGraph, state: AgentState): {
  applied: boolean;
  regenerate: string[];
  invalidatedFrom?: string;
} {
  const assessment = assessDesignContractMigration(root);
  if (!assessment.regenerate.length) return { applied: false, regenerate: [] };
  const first = MIGRATION_PIPELINE.find(id => assessment.regenerate.includes(id));
  if (first) invalidate(graph, state, first);
  try {
    mkdirSync(join(root, "agent"), { recursive: true });
    save(join(root, "agent/design-contract-migration.json"), {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      ...assessment,
      invalidatedFrom: first,
    });
  } catch { /* state invalidation still applies */ }
  return { applied: true, regenerate: assessment.regenerate, invalidatedFrom: first };
}

export function importStageBlockedByMigration(nodeId: string, regenerate: string[]): boolean {
  if (!regenerate.length) return false;
  const order = ["harvest", "business", "business-review", "media", "narrative", "narrative-review", "reference-analysis"];
  const regenIdx = Math.min(...regenerate.map(id => {
    const idx = order.indexOf(id as typeof order[number]);
    return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
  }));
  const nodeIdx = order.indexOf(nodeId as typeof order[number]);
  if (nodeIdx < 0 || !Number.isFinite(regenIdx)) return false;
  return nodeIdx >= regenIdx;
}

export function buildCreativeCheckContext(root: string): string {
  const lines: string[] = [];
  const businessPath = join(root, "onboarding/business.json");
  const narrativePath = join(root, "onboarding/narrative-brief.json");
  const mediaPath = join(root, "onboarding/media-inventory.json");
  const requestPath = join(root, "agent/request.json");
  if (existsSync(businessPath)) {
    const business = json<Business>(businessPath);
    lines.push("## Business (supported facts)");
    lines.push(`Offer: ${business.offer}`);
    lines.push(`Audience: ${business.audience}`);
    for (const fact of business.facts || []) lines.push(`- fact ${fact.id}: ${fact.claim} (evidence: ${(fact.evidence || []).join(", ") || "none"})`);
    for (const u of business.uncertainties || []) lines.push(`- uncertainty: ${u.question}`);
  }
  if (existsSync(narrativePath)) {
    const narrative = json<NarrativeBrief>(narrativePath);
    if (narrative.schemaVersion === 2) {
      lines.push("## Narrative opportunities (mix of evidence and hypotheses)");
      for (const q of narrative.visitorQuestions || []) lines.push(`- visitor question ${q.id}: ${q.question} → ${q.relationshipToConversion}`);
      for (const opp of narrative.designOpportunities || []) {
        const tag = opp.basis === "design-hypothesis" ? "hypothesis" : "evidence-backed";
        lines.push(`- ${opp.id} [${tag}]: ${opp.presentationOpportunity}${opp.uncertainty ? ` (uncertainty: ${opp.uncertainty})` : ""}`);
      }
      for (const note of narrative.assetNotes || []) lines.push(`- asset note: ${note.strength}${note.limitation ? `; limit: ${note.limitation}` : ""}`);
    } else {
      lines.push("## Narrative");
      lines.push(`Legacy schema ${narrative.schemaVersion}; design-opportunity contract not satisfied. Treat creative scoring as low confidence.`);
    }
  }
  if (existsSync(mediaPath)) {
    const media = json<MediaInventory>(mediaPath);
    lines.push("## Media inventory (inspected assets only)");
    for (const asset of (media.assets || []).filter(a => a.inspected)) {
      lines.push(`- ${asset.id} role=${asset.role} disposition=${asset.disposition}: ${asset.description}`);
    }
    if (!(media.assets || []).some(a => a.inspected)) lines.push("- No inspected media; proposals must not assume photography that was not harvested.");
  }
  if (existsSync(requestPath)) {
    try {
      const request = json<{ theme?: string }>(requestPath);
      if (request.theme?.trim()) lines.push(`## Operator theme (verbatim constraint): ${request.theme.trim()}`);
    } catch { /* optional */ }
  }
  return lines.join("\n");
}

export function validateNarrativeDesign(narrative: NarrativeBrief, business: Business, media?: MediaInventory): string[] {
  const errors: string[] = [];
  if (narrative.schemaVersion !== 2) {
    errors.push(`Narrative brief schemaVersion ${narrative.schemaVersion} is inspectable history and cannot pass the design-opportunity gate. ${MIGRATION}`);
    return errors;
  }
  const evidenceIds = new Set(business.evidence.map(e => e.id));
  const factIds = new Set(business.facts.map(f => f.id));
  const mediaIds = new Set((media?.assets || []).map(a => a.id));
  if (!narrative.visitorQuestions?.length) errors.push("Narrative needs prioritized visitor questions");
  const questionIds = new Set<string>();
  for (const question of narrative.visitorQuestions || []) {
    if (!present(question.id) || !present(question.question) || !present(question.relationshipToConversion)) {
      errors.push("Visitor question needs id, question, and relationshipToConversion");
    }
    if (questionIds.has(question.id)) errors.push(`Duplicate visitor question id: ${question.id}`);
    questionIds.add(question.id);
    if (!Number.isFinite(question.priority)) errors.push(`Visitor question ${question.id} needs a numeric priority`);
  }
  if (!narrative.proof?.status || !["strong", "limited", "missing"].includes(narrative.proof.status)) {
    errors.push("Narrative proof.status must be strong, limited, or missing");
  }
  if (narrative.proof?.status === "missing" && !present(narrative.proof.statement)) {
    errors.push("Missing proof still needs an explicit statement of what is absent");
  }
  if (!Array.isArray(narrative.assetNotes)) errors.push("Narrative needs assetNotes, including an honest empty list");
  for (const note of narrative.assetNotes || []) {
    if (!present(note.strength)) errors.push("Asset note needs a strength");
    if (note.mediaId && media && !mediaIds.has(note.mediaId)) errors.push(`Asset note cites unknown media: ${note.mediaId}`);
  }
  if (!Array.isArray(narrative.toneConstraints) || !Array.isArray(narrative.recordedUserGoals)) {
    errors.push("Narrative needs toneConstraints and recordedUserGoals arrays");
  }
  if (!narrative.designOpportunities?.length) errors.push("Narrative needs at least one design opportunity");
  const ids = new Set<string>();
  for (const opportunity of narrative.designOpportunities || []) {
    errors.push(...validateOpportunity(opportunity, evidenceIds, factIds, mediaIds, ids));
  }
  return errors;
}

function validateOpportunity(
  opportunity: DesignOpportunity,
  evidenceIds: Set<string>,
  factIds: Set<string>,
  mediaIds: Set<string>,
  seen: Set<string>,
): string[] {
  const errors: string[] = [];
  if (!present(opportunity.id)) errors.push("Design opportunity needs an id");
  if (seen.has(opportunity.id)) errors.push(`Duplicate design opportunity id: ${opportunity.id}`);
  seen.add(opportunity.id);
  if (!present(opportunity.visitorNeed) || !present(opportunity.businessRelevance) || !present(opportunity.presentationOpportunity)) {
    errors.push(`Design opportunity ${opportunity.id} needs visitorNeed, businessRelevance, and presentationOpportunity`);
  }
  if (!["evidence-backed", "design-hypothesis"].includes(opportunity.basis)) {
    errors.push(`Design opportunity ${opportunity.id} has an invalid basis`);
  }
  if (opportunity.basis === "design-hypothesis" && !present(opportunity.uncertainty)) {
    errors.push(`Design hypothesis ${opportunity.id} must record uncertainty`);
  }
  if (opportunity.basis === "evidence-backed" && !opportunity.evidenceIds?.length) {
    errors.push(`Evidence-backed opportunity ${opportunity.id} needs evidenceIds`);
  }
  if (!Array.isArray(opportunity.constraints)) errors.push(`Design opportunity ${opportunity.id} needs constraints`);
  for (const id of opportunity.evidenceIds || []) {
    if (!evidenceIds.has(id) && !factIds.has(id)) errors.push(`Opportunity ${opportunity.id} cites unknown evidence: ${id}`);
  }
  for (const id of opportunity.mediaIds || []) {
    if (mediaIds.size && !mediaIds.has(id)) errors.push(`Opportunity ${opportunity.id} cites unknown media: ${id}`);
  }
  return errors;
}

export function validateDirectionDesign(direction: Direction, opts: {
  userTheme?: string;
  assigned?: boolean;
  opportunityIds?: string[];
}): string[] {
  const errors: string[] = [];
  if (direction.designContractVersion !== 1) {
    errors.push(`Direction is missing designContractVersion 1. ${MIGRATION}`);
    return errors;
  }
  if (!present(direction.centralIdea)) errors.push("Direction needs one centralIdea");
  if (!Array.isArray(direction.opportunityIds)) errors.push("Direction needs opportunityIds");
  const known = new Set(opts.opportunityIds || []);
  if (opts.opportunityIds && direction.opportunityIds?.length) {
    for (const id of direction.opportunityIds) {
      if (!known.has(id)) errors.push(`Direction opportunityIds cites unknown opportunity: ${id}`);
    }
  }
  if (opts.opportunityIds?.length && !direction.opportunityIds?.length) {
    errors.push("Direction must name the narrative opportunities it serves");
  }
  if (!direction.decisions?.length) errors.push("Direction needs at least one design decision");
  const decisionIds = new Set<string>();
  for (const decision of direction.decisions || []) {
    if (!present(decision.id) || decisionIds.has(decision.id)) errors.push(`Invalid or duplicate decision id: ${decision.id}`);
    decisionIds.add(decision.id);
    if (!DECISION_KINDS.includes(decision.kind)) errors.push(`Decision ${decision.id} has an unknown kind`);
    if (!present(decision.choice) || !present(decision.rationale) || !present(decision.scope) || !present(decision.tradeoff)) {
      errors.push(`Decision ${decision.id} needs choice, rationale, scope, and tradeoff`);
    }
  }
  const prescribed = opts.assigned || (present(opts.userTheme) && direction.request === opts.userTheme);
  if (!prescribed && !direction.rejectedAlternatives?.length) {
    errors.push("Direction needs rejectedAlternatives unless the operator prescribed the direction");
  }
  for (const alternative of direction.rejectedAlternatives || []) {
    if (!present(alternative.id) || !present(alternative.summary)) errors.push("Rejected alternative needs id and summary");
  }
  if (!direction.identityInvariants?.some(present)) errors.push("Direction needs identityInvariants");
  if (!Array.isArray(direction.flexibleDecisions)) errors.push("Direction needs flexibleDecisions");
  if (present(opts.userTheme) && direction.request !== opts.userTheme) {
    errors.push("Direction.request must preserve the explicit operator theme verbatim");
  }
  return errors;
}

export function validateStoryboardDesign(story: Storyboard, opts?: { opportunityIds?: string[]; decisionIds?: string[]; compositionMode?: boolean }): string[] {
  const errors: string[] = [];
  if (story.designContractVersion !== 1) {
    errors.push(`Storyboard is missing designContractVersion 1. ${MIGRATION}`);
    return errors;
  }
  const opportunities = new Set(opts?.opportunityIds || []);
  const decisions = new Set(opts?.decisionIds || []);
  for (const page of story.pages || []) {
    if (!present(page.role) || !present(page.visitorOutcome)) errors.push(`Page ${page.path} needs role and visitorOutcome`);
    const families = page.sections.map(section => section.layoutFamily).filter(present);
    const equalEmphasis = page.sections.filter(section => section.emphasis && section.emphasis === page.sections[0]?.emphasis);
    for (const section of page.sections || []) {
      if (!present(section.role) || !present(section.purpose) || !present(section.emphasisReason)) {
        errors.push(`Section ${page.path}#${section.id} needs role, purpose, and emphasisReason`);
      }
      if (!present(section.layoutFamily) || !present(section.density) || !present(section.mediaProminence)) {
        errors.push(`Section ${page.path}#${section.id} needs layoutFamily, density, and mediaProminence`);
      }
      if (!present(section.mobileTransformation)) errors.push(`Section ${page.path}#${section.id} needs a mobileTransformation`);
      for (const id of section.opportunityIds || []) {
        if (opportunities.size && !opportunities.has(id)) errors.push(`Section ${section.id} cites unknown opportunity: ${id}`);
      }
      for (const id of section.decisionIds || []) {
        if (decisions.size && !decisions.has(id)) errors.push(`Section ${section.id} cites unknown decision: ${id}`);
      }
    }
    if (!opts?.compositionMode && equalEmphasis.length >= 4 && new Set(families).size <= 1 && !page.sections.some(section => present(section.repetitionRationale))) {
      errors.push(`Page ${page.path} repeats one emphasis without a repetitionRationale`);
    }
  }
  return errors;
}

export function validateTeachingPrinciples(root: string, analysis: ReferenceAnalysis): string[] {
  const errors: string[] = [];
  const policy = resolveDesignAuthoring(root);
  if (policy.mode === "composition-v1") {
    const pack = loadCompositionPack(root, policy.lessonRelease);
    const seen = new Set<string>();
    for (const ref of analysis.teachingPrinciples || []) {
      if (seen.has(ref.id)) errors.push(`Duplicate teaching principle: ${ref.id}`);
      seen.add(ref.id);
      const lesson = pack.lessons.find(item => item.id === ref.id);
      if (!lesson || lesson.version !== ref.version || lesson.contentHash !== ref.contentHash || !present(ref.reason)) errors.push(`Unknown or stale composition principle: ${ref.id}`);
    }
    return errors;
  }
  if (!analysis.teachingPrinciples?.length) {
    errors.push(`Reference analysis needs teachingPrinciples selected from the built-in knowledge collection. ${MIGRATION}`);
    return errors;
  }
  const catalog = loadKnowledgeCatalog(root);
  if (!catalog) {
    errors.push("Harness design-knowledge catalog is unavailable. Set VITRIS_HARNESS or depend on @vitris/harness.");
    return errors;
  }
  const seen = new Set<string>();
  for (const ref of analysis.teachingPrinciples) {
    if (seen.has(ref.id)) errors.push(`Duplicate teaching principle: ${ref.id}`);
    seen.add(ref.id);
    const lesson = lessonById(catalog, ref.id);
    if (!lesson) {
      errors.push(`Unknown teaching principle: ${ref.id}`);
      continue;
    }
    if (lesson.version !== ref.version) errors.push(`Teaching principle ${ref.id} version does not match the catalog`);
    if (lesson.contentHash !== ref.contentHash) errors.push(`Teaching principle ${ref.id} content hash is stale`);
    if (!present(ref.reason)) errors.push(`Teaching principle ${ref.id} needs an applicability reason`);
  }
  return errors;
}

export function representativeBindingHash(root: string): string {
  const hash = createHash("sha256");
  const directionPath = join(root, "onboarding/direction.json");
  if (existsSync(directionPath)) {
    const direction = json<Direction>(directionPath);
    hash.update(JSON.stringify({
      centralIdea: direction.centralIdea || "",
      selected: direction.selected,
      decisions: direction.decisions || [],
      identityInvariants: direction.identityInvariants || [],
      request: direction.request,
    }));
  }
  const analysisPath = join(root, "onboarding/reference-analysis.json");
  if (existsSync(analysisPath)) {
    const analysis = json<ReferenceAnalysis>(analysisPath);
    hash.update(JSON.stringify((analysis.teachingPrinciples || []).map(item => ({
      id: item.id,
      version: item.version,
      contentHash: item.contentHash,
    }))));
  }
  hash.update(fingerprint(root, ["onboarding/direction.json"]));
  return hash.digest("hex");
}

export function selectedLessonIdentity(analysis: ReferenceAnalysis | undefined): { id: string; version: number; contentHash: string }[] {
  return (analysis?.teachingPrinciples || []).map(item => ({
    id: item.id,
    version: item.version,
    contentHash: item.contentHash,
  }));
}

export function lessonStillCurrent(lesson: KnowledgeLesson, contentHash: string): boolean {
  return lesson.contentHash === contentHash;
}
