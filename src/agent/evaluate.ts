import { performanceEvidenceFailures } from './performance.ts';
import { productionQuality, productionQualityFailures, CONTENT_LEDGER, CONTENT_OPERATOR, hasAnalyticsRuntime } from "./production-quality.ts";
import { templateAdaptationFailures } from './template-adaptation.ts';
import { artDirectionPolicy, applyArtDirectionGraph } from "./art-direction-policy.ts";
import {journeyEvidenceFailures,motionCritiqueFailures,type MotionJourney} from "./browser-motion-journey.ts";
import {motionCompositionPolicy} from "./motion-composition.ts";
import { typographyDirectionFailures, typographyPolicy } from './typography-policy.ts';
import { typographyEvidenceFailures } from './browser-typography.ts';
import { fileToPath } from '../compile/paths.ts';
import { validateMotionPlan, motionBindingFailures } from "./motion-plan.ts";
import { temporalMotionFailures, MOTION_SCENARIO_HASH, type TemporalMotionEvidence } from "./browser-motion.ts";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { files, fingerprint, json, sha256, sourceHash, within, STUDY_CAPTURE_VIEWPORTS, STUDY_CAPTURE_HEIGHT, type Business, type Direction, type MediaInventory, type NarrativeBrief, type ParentDiversityIdentities, type ParentDiversityReview, type ReferenceAnalysis, type Review, type Storyboard } from "./artifacts.ts";
import type { GradeResult } from "./grade.ts";
import { parseGraphYaml } from "./graph.ts";
import { legacyDependencies } from "./migration-links.ts";
import { calibrationPackHash, calibrationPackDir, loadCalibrationManifest, resolveKernelRoot } from "./design-calibration.ts";
import { qualitySubject, validateQualityReview, sketchesAreNotRepresentatives } from "./design-quality.ts";
import { validateAddedMedia } from "./added-media.ts";
import { validateAssetProduction } from "./art-direction.ts";
import { verifyCopyTraceability } from "./jev/extraction.ts";
import { checkCrossStageConsistency } from "./jev/consistency.ts";
import { independentCitedSource } from "./jev/content-checks.ts";
import { validateDirectionDesign, validateNarrativeDesign, validateStoryboardDesign, validateTeachingPrinciples } from "./design-contracts.ts";
import { resolveDesignAuthoring } from "./composition-authoring.ts";
import { loadCompositionPack } from "../knowledge/composition.ts";
import { validateCompositionStoryboard } from "./composition-contract.ts";
import { validateAuthoringDecisions } from "./composition-decisions.ts";
import { scanCopyPlanEditorial, scanRenderedCopyEditorial, visualFindingGaps } from "./editorial.ts";
import { mediaIssueFailure, validateStoryboardMedia } from "./storyboard-media.ts";
import { validateReferenceSelection } from "./reference-contract.ts";
import type { MediaSelection } from "../stock/selection.ts";

function confinedCalibrationEvidence(root: string, paths: unknown, label: string): string[] {
  const errors: string[] = [];
  if (!Array.isArray(paths) || !paths.length) return [`${label} needs evidence paths`];
  const kernel = resolveKernelRoot(root);
  if (!kernel) return [`${label}: Copied kit cannot discover harness calibration pack; set VITRIS_HARNESS or depend on @tryvitris/website-harness`];
  const manifest = loadCalibrationManifest(kernel);
  const dir = calibrationPackDir(kernel);
  const allowed = new Map(manifest.records.map(record => [record.file.replaceAll("\\", "/"), record]));
  for (const raw of paths) {
    const path = String(raw || "").replaceAll("\\", "/").trim();
    if (!path) {
      errors.push(`${label} has an empty evidence path`);
      continue;
    }
    if (path.includes("..") || path.startsWith("/") || path.startsWith("~") || /^[a-zA-Z]:/.test(path)) {
      errors.push(`${label} cites an arbitrary path: ${path}`);
      continue;
    }
    const file = path.split("/").pop() || path;
    const record = allowed.get(path) || allowed.get(file);
    if (!record || (path.includes("/") && path !== record.file)) {
      errors.push(`${label} cites a path outside the current calibration pack: ${path}`);
      continue;
    }
    const abs = join(dir, record.file);
    if (!existsSync(abs)) errors.push(`${label} missing calibration file: ${record.file}`);
    else {
      const sha = createHash("sha256").update(readFileSync(abs)).digest("hex");
      if (sha !== record.sha256) errors.push(`${label} tampered calibration capture hash: ${record.file}`);
    }
  }
  return errors;
}
const present = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isPng = (root: string, path: string) => Array.from(readFileSync(within(root, path)).subarray(0, 8)).join(",") === "137,80,78,71,13,10,26,10";
function requireText(obj: object, keys: string[], errors: string[], prefix: string): void {
  for (const key of keys) if (!present((obj as Record<string, unknown>)[key])) errors.push(`${prefix}.${key} must be nonempty`);
}
export function reviewSubject(root: string, node: string): string {
  // Prepared guidance and the portable CLI must advertise the quality gate's own subject.
  if (productionQuality(root) && node === "representative-quality") return qualitySubject(root);
  const paths: Record<string, string[]> = {
    "template-reference-review": ["onboarding/template-inventory.json", "onboarding/template-adaptation.json", "agent/theme-selection.json"],
    "business-review": ["onboarding/business.json"],
    "narrative-review": ["onboarding/narrative-brief.json"],
    "direction-review": existsSync(join(root, "onboarding/studies"))
      ? ["onboarding/direction.json", "onboarding/narrative-brief.json", "onboarding/reference-analysis.json", "onboarding/studies", "agent/reviews/direction-render.json", "onboarding/study-renders"]
      : ["onboarding/direction.json", "theme/defaults.json", "onboarding/narrative-brief.json", "onboarding/reference-analysis.json"],
    "copy-review": ["onboarding/business.json", "onboarding/storyboard.json", "onboarding/copy-plan.json"],
    "representative-quality": ["pages", "components", "theme", "site.json", "onboarding/direction.json", "onboarding/storyboard.json", "onboarding/copy-plan.json", "onboarding/narrative-brief.json", "onboarding/reference-analysis.json", "agent/reviews/representative-browser.json", "agent/screenshots/representative-browser"],
  };
  if(node==='template-reference-review')return fingerprint(root,paths[node]!);
  if (productionQuality(root)) {
    const base = paths[node] || ["dist", "onboarding/business.json", "onboarding/direction.json", "onboarding/storyboard.json", "onboarding/copy-plan.json"];
    return fingerprint(root,[...base,...(artDirectionPolicy(root) && !["business-review","narrative-review","direction-review"].includes(node)?["media","artwork","onboarding/visual-asset-brief.json","onboarding/asset-production.json"]:[]),CONTENT_LEDGER,CONTENT_OPERATOR,...(["representative-review","representative-quality","visual-review","content-review"].includes(node)?["onboarding/direction-deviations.json"]:[]),...(["visual-review","representative-review"].includes(node)?[`agent/reviews/${node==="visual-review"?"browser":"representative-browser"}.json`]:[])]);
  }
  const subjectPaths = paths[node] || ["dist", "onboarding/business.json", "onboarding/direction.json", "onboarding/storyboard.json", "onboarding/copy-plan.json"];
  return fingerprint(root, artDirectionPolicy(root) && !["business-review","narrative-review","direction-review"].includes(node) ? [...subjectPaths,"media","artwork","onboarding/visual-asset-brief.json","onboarding/asset-production.json"] : subjectPaths);
}
export const REVIEW_CRITERIA: Record<string, string[]> = {
  "template-reference-review": ["page-coverage", "section-coverage", "media-roles", "personality-and-rhythm", "customer-mapping"],
  "business-review": ["offer", "audience", "engagement", "evidence", "contradictions"],
  "narrative-review": ["customer", "offer", "proof", "conversion", "unsupported-claims"],
  "direction-review": ["business-fit", "distinct-options", "composition", "media-fit", "theme-coherence"],
  "copy-review": ["accuracy", "clarity", "specificity", "continuity", "cta-behavior"],
  "representative-review": ["business-fit", "hierarchy", "rhythm", "media-treatment", "mobile", "interior"],
  "visual-review": ["business-fit", "hierarchy", "rhythm", "media-treatment", "mobile", "interior", "theme-coherence", "organizing-idea"],
  "content-review": ["accuracy", "clarity", "specificity", "continuity", "cta-behavior", "coverage", "audit-leakage"],
};
export const directionRenderSubject = (root: string) => fingerprint(root, ["onboarding/direction.json", "onboarding/studies", "media", "theme"]);

export const PARENT_DIVERSITY_AXES = ["typography", "color", "density", "media-role", "composition"] as const;
export const PARENT_DIVERSITY_REF_PATHS = [
  "agent/refs/critic.md",
  "agent/refs/contracts.md",
  "agent/refs/design-calibration.md",
  "agent/refs/variant-directions.md",
  "agent/refs/narrative.md",
];
export type ParentDiversityValidation = GradeResult & {
  review?: ParentDiversityReview;
  stale?: boolean;
  malformed?: boolean;
  contractOk?: boolean;
};

function parentRunRel(runId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) throw new Error("Invalid design-run id");
  return `agent/design-runs/${runId}`;
}

export function parentDiversityIdentityPaths(parent: string, runId: string): {
  directions: string[];
  studies: string[];
  assets: string[];
  renders: string[];
  refs: string[];
} {
  const rel = parentRunRel(runId);
  const assets: string[] = [];
  if (existsSync(join(parent, rel, "shared/media"))) assets.push(`${rel}/shared/media`);
  else if (existsSync(join(parent, "media"))) assets.push("media");
  if (existsSync(join(parent, rel, "shared/theme"))) assets.push(`${rel}/shared/theme`);
  else if (existsSync(join(parent, "theme"))) assets.push("theme");
  return {
    directions: [`${rel}/directions.json`],
    studies: [`${rel}/studies`],
    assets,
    renders: [`${rel}/study-renders`, `${rel}/direction-render.json`],
    refs: PARENT_DIVERSITY_REF_PATHS.filter(path => existsSync(join(parent, path))),
  };
}

export function parentDiversityIdentities(parent: string, runId: string): ParentDiversityIdentities {
  const paths = parentDiversityIdentityPaths(parent, runId);
  return {
    directions: fingerprint(parent, paths.directions),
    studies: fingerprint(parent, paths.studies),
    assets: fingerprint(parent, paths.assets.length ? paths.assets : ["media", "theme"]),
    renders: fingerprint(parent, paths.renders),
    viewports: sha256(JSON.stringify({ widths: [...STUDY_CAPTURE_VIEWPORTS], height: STUDY_CAPTURE_HEIGHT })),
    refs: fingerprint(parent, paths.refs.length ? paths.refs : PARENT_DIVERSITY_REF_PATHS),
  };
}

export function parentDiversitySourceSubject(parent: string, runId: string): string {
  const identities = parentDiversityIdentities(parent, runId);
  return sha256(JSON.stringify({
    directions: identities.directions,
    studies: identities.studies,
    assets: identities.assets,
    viewports: identities.viewports,
    refs: identities.refs,
  }));
}

export function parentDiversityReviewSubject(parent: string, runId: string): string {
  return sha256(JSON.stringify(parentDiversityIdentities(parent, runId)));
}

export function evaluateParentStudyRender(parent: string, runId: string): GradeResult {
  const errors: string[] = [];
  const rel = parentRunRel(runId);
  try {
    const report = json<{ subjectHash: string; checks: { candidate: string; path?: string; width: number; screenshot: string; screenshotHash: string; failures: string[] }[] }>(join(parent, rel, "direction-render.json"));
    if (report.subjectHash !== parentDiversitySourceSubject(parent, runId)) errors.push("Parent study render is stale");
    const set = json<{ directions: { id: string }[] }>(join(parent, rel, "directions.json"));
    for (const brief of set.directions) {
      for (const kind of ["home", "interior"] as const) {
        const source = `onboarding/studies/${brief.id}-${kind}.html`;
        for (const width of STUDY_CAPTURE_VIEWPORTS) {
          const check = (report.checks || []).find(c => c.path === source && c.width === width);
          if (!check) errors.push(`tool_failure: Missing parent study render: ${brief.id}-${kind} ${width}`);
          else {
            const runRoot = join(parent, rel);
            const screenshotRel = check.screenshot.replaceAll("\\", "/");
            const screenshot = screenshotRel.startsWith("agent/") ? screenshotRel : `${rel}/${screenshotRel}`;
            if (!existsSync(within(parent, screenshot)) || !isPng(parent, screenshot) || check.screenshotHash !== fingerprint(runRoot, [screenshotRel])) {
              errors.push(`tool_failure: study screenshot missing or changed: ${screenshot}`);
            }
          }
        }
      }
    }
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return { node: "parent-direction-render", ok: errors.length === 0, failures: errors };
}

function identitiesMatch(actual: ParentDiversityIdentities | undefined, expected: ParentDiversityIdentities): boolean {
  if (!actual) return false;
  return (["directions", "studies", "assets", "renders", "viewports", "refs"] as const).every(key => actual[key] === expected[key]);
}

export function validateParentDiversityReview(parent: string, runId: string, opts?: { requirePass?: boolean }): ParentDiversityValidation {
  const contractErrors: string[] = [];
  const verdictErrors: string[] = [];
  const rel = parentRunRel(runId);
  let review: ParentDiversityReview | undefined;
  let stale = false;
  let malformed = false;
  try {
    review = json<ParentDiversityReview>(join(parent, rel, "direction-review.json"));
    if (review.schemaVersion !== 1 || review.kind !== "direction-diversity" || review.runId !== runId) {
      malformed = true;
      contractErrors.push("Parent diversity review schema/run mismatch");
    }
    if (!["pass", "fail", "unknown"].includes(review.verdict || "")) {
      malformed = true;
      contractErrors.push("Parent diversity review needs a pass/fail/unknown verdict");
    }
    requireText(review, ["reviewer"], contractErrors, "review");
    const expected = parentDiversityIdentities(parent, runId);
    const subject = parentDiversityReviewSubject(parent, runId);
    if (review.subjectHash !== subject || !identitiesMatch(review.identities, expected)) {
      stale = true;
      contractErrors.push("Parent diversity review missing version/current subjectHash");
    }
    if (!Array.isArray(review.evidence) || !review.evidence.length) contractErrors.push("Review needs evidence paths");
    for (const path of review.evidence || []) {
      try {
        if (!existsSync(within(parent, path))) contractErrors.push(`Missing review evidence: ${path}`);
      } catch { contractErrors.push(`Missing review evidence: ${path}`); }
    }
    if (!(review.evidence || []).some(path => {
      try { return path.endsWith(".png") && existsSync(within(parent, path)) && isPng(parent, path); }
      catch { return false; }
    })) contractErrors.push("Visual review requires captured PNG evidence");
    const axisNames = (review.axes || []).map(axis => String(axis.name || "").trim().toLowerCase());
    for (const axis of PARENT_DIVERSITY_AXES) {
      if (!axisNames.includes(axis)) contractErrors.push(`Diversity review must explain axis: ${axis}`);
    }
    if ((review.axes || []).length < PARENT_DIVERSITY_AXES.length) contractErrors.push(`Diversity review must explain at least ${PARENT_DIVERSITY_AXES.length} axes`);
    for (const axis of review.axes || []) {
      if (!present(axis.evidence) || axis.evidence.trim().length < 12) contractErrors.push(`Axis ${axis.name} needs substantive evidence`);
    }
    const axisEvidence = (review.axes || []).map(axis => axis.evidence.trim().toLowerCase());
    if (axisEvidence.length && new Set(axisEvidence).size < Math.min(3, axisEvidence.length)) {
      contractErrors.push("Axis evidence must be substantive and not identical boilerplate");
    }
    const set = existsSync(join(parent, rel, "directions.json")) ? json<{ directions: { id: string }[] }>(join(parent, rel, "directions.json")) : { directions: [] };
    const candidateIds = [...new Set(set.directions.map(d => d.id))];
    const rows = review.candidates || [];
    const rowIds = rows.map(row => row.id);
    if (new Set(rowIds).size !== rowIds.length) contractErrors.push("Diversity review has duplicate candidate rows");
    if (rowIds.length !== candidateIds.length || candidateIds.some(id => !rowIds.includes(id))) {
      contractErrors.push("Diversity review needs unique candidate findings for every brief");
    }
    for (const missing of candidateIds.filter(id => !rowIds.includes(id))) contractErrors.push(`Missing candidate findings: ${missing}`);
    for (const row of rows) {
      if (!candidateIds.includes(row.id)) contractErrors.push(`Unknown diversity candidate: ${row.id}`);
      if (!present(row.observation) || row.observation.trim().length < 12) contractErrors.push(`Candidate ${row.id} needs a substantive observation`);
      for (const finding of row.findings || []) {
        requireText(finding, ["id", "page", "section", "evidence", "problem", "repair", "target", "verify"], contractErrors, "finding");
        if (!["minor", "major", "blocker"].includes(finding.severity)) contractErrors.push("Invalid finding severity");
      }
    }
    for (const finding of review.findings || []) {
      requireText(finding, ["id", "page", "section", "evidence", "problem", "repair", "target", "verify"], contractErrors, "finding");
      if (!["minor", "major", "blocker"].includes(finding.severity)) contractErrors.push("Invalid finding severity");
    }
    if (review.selected) contractErrors.push("Diversity review must not pick a winner");
    if (review.repair) {
      if (!present(review.repair.directionId) || !present(review.repair.reason) || !review.repair.targets?.length) contractErrors.push("Diversity repair needs directionId, reason, and targets");
      else if (!candidateIds.includes(review.repair.directionId)) contractErrors.push(`Repair target is not a planned brief: ${review.repair.directionId}`);
    }
    if (review.verdict === "pass" && (review.repair || present(review.unresolvedSimilarity))) {
      contractErrors.push("Pass cannot carry a repair request or unresolvedSimilarity");
    }
    const blocking = [...(review.findings || []), ...rows.flatMap(c => c.findings || [])].filter(f => f.severity && f.severity !== "minor");
    if (review.verdict === "unknown") verdictErrors.push("Reviewer verdict: unknown");
    if (review.verdict === "pass" && blocking.length) contractErrors.push("Major findings cannot accompany a pass verdict");
    if (opts?.requirePass !== false) {
      if (review.verdict !== "pass") verdictErrors.push(`Reviewer verdict: ${review.verdict}`);
      for (const finding of blocking) verdictErrors.push(`${finding.severity}: ${finding.problem}`);
    }
  } catch (error) {
    malformed = true;
    contractErrors.push(error instanceof Error ? error.message : String(error));
  }
  const failures = [...contractErrors, ...verdictErrors];
  const contractOk = !malformed && !stale && contractErrors.length === 0;
  return { node: "parent-direction-diversity", ok: failures.length === 0, failures, review, stale, malformed, contractOk };
}

export function evaluateV2(root: string, node: string): GradeResult {
  const errors: string[] = [];
  try {
    errors.push(...productionQualityFailures(root,node));
    errors.push(...templateAdaptationFailures(root,node));
    if (REVIEW_CRITERIA[node]) {
      const review = json<Review>(join(root, "agent/reviews", `${node}.json`));
      if (review.version !== 2 || review.subjectHash !== reviewSubject(root, node)) errors.push("Review missing version/current subjectHash");
      if (review.verdict !== "pass") errors.push(`Reviewer verdict: ${review.verdict}`);
      requireText(review, ["reviewer"], errors, "review");
      if (!review.evidence.length) errors.push("Review needs evidence paths");
      for (const path of review.evidence) if (!existsSync(within(root, path))) errors.push(`Missing review evidence: ${path}`);
      const requiresPng = ["representative-review", "visual-review"].includes(node) || (node === "direction-review" && existsSync(within(root, "agent/reviews/direction-render.json")));
      if (requiresPng && !review.evidence.some(path => path.endsWith(".png") && existsSync(within(root, path)) && isPng(root, path))) errors.push("Visual review requires captured PNG evidence");
      for (const criterion of REVIEW_CRITERIA[node]!) {
        const check = review.checks.find(c => c.criterion === criterion);
        if (!check || check.verdict !== "pass" || !present(check.evidence)) errors.push(`Review criterion not passed: ${criterion}`);
      }
      if (node === "content-review" || node === "copy-review") errors.push(...scanCopyPlanEditorial(root));
      if (node === "content-review") errors.push(...scanRenderedCopyEditorial(root));
      if (node === "visual-review" || node === "representative-review") {
        for (const finding of review.findings) errors.push(...visualFindingGaps(finding));
        const story=existsSync(join(root,'onboarding/storyboard.json'))?json<Storyboard>(join(root,'onboarding/storyboard.json')):undefined;
        if(story?.motionPlan?.version===2){const browserPath=join(root,`agent/reviews/${node==='representative-review'?'representative-browser':'browser'}.json`),report=existsSync(browserPath)?json<any>(browserPath):{};errors.push(...motionCritiqueFailures(root,review,story.pages.filter(p=>(node==='visual-review'||p.path==='/'||p.representative)&&story.motionPlan?.routes?.some(r=>r.route===p.path)).map(p=>p.path),report));}
      }
      for (const finding of review.findings) {
        requireText(finding, ["id", "page", "section", "evidence", "problem", "repair", "target", "verify"], errors, "finding");
        if (!["minor", "major", "blocker"].includes(finding.severity)) errors.push("Invalid finding severity");
        if (finding.severity !== "minor") errors.push(`${finding.severity}: ${finding.problem}`);
      }
      for (const d of review.dispositions || []) {
        if (!d.findingId || !d.subjectHash || !d.disposition || !d.rationale?.trim() || !d.evidence?.trim()) {
          errors.push("Review disposition missing findingId, current subjectHash, disposition, rationale, or evidence");
          continue;
        }
        if (!["fixed", "disagree_with_evidence", "accepted_risk"].includes(d.disposition)) {
          errors.push(`Invalid disposition: ${d.disposition}`);
        }
        if (d.subjectHash !== review.subjectHash && !review.findings.some(f => f.id === d.findingId)) {
          /* finding subject hashes are per-finding; require a hash is present */
        }
        if (d.disposition === "disagree_with_evidence" && !independentCitedSource(d.evidence)) {
          errors.push(`disagree_with_evidence for ${d.findingId} needs a specific independent cited source`);
        }
        const related = review.findings.find(f => f.id === d.findingId);
        if (d.disposition === "accepted_risk" && related && related.severity !== "minor") {
          errors.push(`accepted_risk cannot dismiss major/blocker finding ${d.findingId}`);
        }
      }
    } else if (node === "business") {
      const b = json<Business>(join(root, "onboarding/business.json"));
      if (b.version !== 2) errors.push("business.version must be 2");
      requireText(b, ["offer", "audience", "trigger", "outcome", "engagement", "positioning"], errors, "business");
      if (!b.includes.length || !b.facts.length || !b.evidence.length) errors.push("Business needs includes, facts and evidence");
      const ids = new Set(b.evidence.map(e => e.id));
      if (ids.size !== b.evidence.length || new Set(b.facts.map(f => f.id)).size !== b.facts.length) errors.push("Duplicate fact/evidence IDs");
      for (const evidence of b.evidence) {
        requireText(evidence, ["id", "source", "excerpt"], errors, "evidence");
        let captured = "";
        if (/^https?:\/\//.test(evidence.source)) {
          const brief = json<{ pages: { url: string }[] }>(join(root, "onboarding/brief.json"));
          captured = JSON.stringify(brief.pages.find(p => p.url === evidence.source) || "");
        } else {
          const path = within(root, evidence.source);
          if (existsSync(path)) captured = readFileSync(path, "utf8");
        }
        const normalize = (text: string) => text.replace(/\\n|\\r|\s+/g, " ").trim().toLowerCase();
        if (!captured || !normalize(captured).includes(normalize(evidence.excerpt))) errors.push(`Evidence excerpt absent from captured source: ${evidence.id}`);
      }
      for (const fact of b.facts) if (!present(fact.claim) || !fact.evidence.length || fact.evidence.some(id => !ids.has(id))) errors.push(`Unsupported fact: ${fact.id}`);
      for (const gap of b.uncertainties) if (gap.blocking && !present(gap.resolution)) errors.push(`Unresolved business question: ${gap.question}`);
    } else if (node === "asset-production") {
      errors.push(...validateAssetProduction(root));
    } else if (node === "media") {
      const inventory = json<MediaInventory>(join(root, "onboarding/media-inventory.json"));
      errors.push(...validateAddedMedia(root, inventory).findings.map(finding => `[${finding.code}] ${finding.path}: ${finding.explanation}`));
      if (inventory.version !== 2 || inventory.harvestHash !== fingerprint(root, ["onboarding/brief.json", "media/harvest"])) errors.push("Media inventory is stale");
      const paths = new Set(inventory.assets.map(a => a.path));
      const brief = json<{ images?: { sourceUrl: string; localPath?: string }[] }>(join(root, "onboarding/brief.json"));
      for (const image of brief.images || []) {
        if (inventory.assets.some(a => a.sources.includes(image.sourceUrl))) continue;
        const missing = inventory.unavailable?.find(a => a.source === image.sourceUrl);
        if (!missing || !["unavailable", "excluded"].includes(missing.resolution) || !present(missing.reason) || !present(missing.evidence)) errors.push(`Source media has no resolved disposition: ${image.sourceUrl}`);
      }
      if (paths.size !== inventory.assets.length || new Set(inventory.assets.map(a => a.id)).size !== inventory.assets.length) errors.push("Duplicate media IDs/paths");
      const harvested = files(join(root, "media/harvest"));
      for (const file of harvested) if (!paths.has("/media/harvest/" + file.split(/[\\/]/).pop())) errors.push(`Unaccounted media: ${file}`);
      for (const asset of inventory.assets) {
        requireText(asset, ["id", "path", "description", "role", "reason"], errors, "asset");
        if (!existsSync(within(root, asset.path.replace(/^\//, "")))) errors.push(`Missing media: ${asset.path}`);
        if (!["use", "retain", "duplicate", "exclude"].includes(asset.disposition)) errors.push(`Unresolved media: ${asset.id}`);
        if (asset.disposition === "use" && (!asset.inspected || !asset.placements.length)) errors.push(`Used media needs inspection/placement: ${asset.id}`);
        if (asset.disposition === "duplicate" && !inventory.assets.some(a => a.id === asset.duplicateOf && a.id !== asset.id)) errors.push(`Invalid duplicate target: ${asset.id}`);
      }
    } else if (node === "direction") {
      errors.push(...typographyDirectionFailures(root));
      const d = json<Direction>(join(root, "onboarding/direction.json"));
      const directionRoutes=d.motionPlan?.routes?.map(r=>r.route)||['/'];
      errors.push(...validateMotionPlan(d.motionPlan,undefined,motionCompositionPolicy(root,directionRoutes)));
      if (d.version !== 2 || d.businessHash !== fingerprint(root, ["onboarding/business.json"])) errors.push("Direction has stale businessHash");
      const requestPath = join(root, "agent/request.json");
      const requestedTheme = existsSync(requestPath) ? json<{ theme?: string }>(requestPath).theme : undefined;
      if (present(requestedTheme) && d.request !== requestedTheme) errors.push("Direction.request must preserve the explicit operator theme verbatim");
      const assignedPath = join(root, "agent/assigned-direction.json");
      const assigned = existsSync(assignedPath) ? json<{ directionId?: string; mode?: string }>(assignedPath) : undefined;
      const graphPath = join(root, "agent/graph.yaml");
      const graph = existsSync(graphPath) ? applyArtDirectionGraph(root, parseGraphYaml(readFileSync(graphPath, "utf8"))) : undefined;
      const hasDirectionRender = graph ? graph.nodes.some(n => n.id === "direction-render") : false;

      if (assigned?.mode === "assigned" || assigned?.directionId) {
        if (!present(assigned.directionId) || d.selected !== assigned.directionId) errors.push("Assigned direction must remain selected");
        if (!d.candidates.some(c => c.id === d.selected)) errors.push("Assigned direction needs an elaborated brief");
        if ((d.studies || []).filter(s => s.candidate === d.selected).length < 2) errors.push("Assigned direction needs homepage and interior studies");
      } else if (hasDirectionRender) {
        if (d.candidates.length < 3 || !d.candidates.some(c => c.id === d.selected)) errors.push("Direction needs three distinct proposals and a valid selection");
        if (new Set((d.studies || []).map(s => s.candidate)).size < 2) errors.push("Two rendered composition studies required");
      } else {
        if (!d.candidates?.length || !d.candidates.some(c => c.id === d.selected)) errors.push("Direction needs at least one proposal and a valid selection");
      }
      if (new Set(d.candidates.map(c => c.id)).size !== d.candidates.length) errors.push("Duplicate direction candidate IDs");
      for (const candidate of d.candidates) requireText(candidate, ["id", "rationale", "typography", "composition", "mediaTreatment"], errors, "candidate");
      requireText(d, ["rationale"], errors, "direction");
      requireText(d.system, ["personality", "typography", "colorRoles", "density", "rhythm", "mediaTreatment", "surfaces", "navigation", "motifs", "interiors"], errors, "system");
      const narrativeForDirection = existsSync(join(root, "onboarding/narrative-brief.json"))
        ? json<NarrativeBrief>(join(root, "onboarding/narrative-brief.json"))
        : undefined;
      errors.push(...validateDirectionDesign(d, {
        userTheme: requestedTheme,
        assigned: assigned?.mode === "assigned" || Boolean(assigned?.directionId),
        opportunityIds: narrativeForDirection?.schemaVersion === 2 ? (narrativeForDirection.designOpportunities || []).map(item => item.id) : undefined,
      }));
      if (hasDirectionRender || (d.studies && d.studies.length > 0)) {
        for (const study of (d.studies || [])) if (!d.candidates.some(c => c.id === study.candidate) || !study.path.endsWith(".html") || !existsSync(within(root, study.path))) errors.push(`Study needs HTML source: ${study.path}`);
      }
    } else if (node === "direction-render") {
      const direction = json<Direction>(join(root, "onboarding/direction.json"));
      const report = json<{ subjectHash: string; checks: { candidate: string; path?: string; width: number; screenshot: string; screenshotHash: string; failures: string[] }[] }>(join(root, "agent/reviews/direction-render.json"));
      if (report.subjectHash !== directionRenderSubject(root)) errors.push("Direction render is stale");
      for (const study of direction.studies) for (const width of STUDY_CAPTURE_VIEWPORTS) {
        const bySource = report.checks.find(c => c.path === study.path && c.candidate === study.candidate && c.width === width);
        const uniqueCandidate = direction.studies.filter(s => s.candidate === study.candidate).length === 1;
        const legacy = !bySource && uniqueCandidate
          ? report.checks.find(c => c.candidate === study.candidate && c.width === width && (c.path == null || c.path === study.path))
          : undefined;
        const check = bySource || legacy;
        if (!check) errors.push(`Missing study render: ${study.path} ${study.candidate} ${width}`);
        else {
          errors.push(...check.failures);
          if (!isPng(root, check.screenshot) || check.screenshotHash !== fingerprint(root, [check.screenshot])) errors.push(`Study screenshot missing or changed: ${study.path}`);
        }
      }
    } else if (node === "storyboard" || node === "copy" || node === "copy-expansion") {
      const s = json<Storyboard>(join(root, "onboarding/storyboard.json"));
      errors.push(...validateMotionPlan(s.motionPlan,s.pages.map(p=>p.path),{...motionCompositionPolicy(root,s.pages.map(p=>p.path)),sections:Object.fromEntries(s.pages.map(p=>[p.path,(p.sections||[]).map(s=>s.id)]))}));
      const b = json<Business>(join(root, "onboarding/business.json"));
      const m = json<MediaInventory>(join(root, "onboarding/media-inventory.json"));
      if (![2, 3].includes(s.version) || s.businessHash !== fingerprint(root, ["onboarding/business.json"]) || s.directionHash !== fingerprint(root, ["onboarding/direction.json"])) errors.push("Storyboard is stale");
      if (!s.pages.some(p => p.path === "/") || !s.pages.some(p => p.path !== "/" && p.representative)) errors.push("Homepage and representative interior required");
      if (new Set(s.pages.map(p => p.path)).size !== s.pages.length) errors.push("Duplicate planned routes");
      const brief = json<{ pages: { url: string; title: string }[] }>(join(root, "onboarding/brief.json"));
      for (const p of brief.pages.filter(p => !/page not found|404 error/i.test(p.title))) if (!s.routes.some(r => r.source === p.url)) errors.push(`Source route lacks disposition: ${p.url}`);
      for (const route of s.routes) if (!present(route.reason) || !["preserve", "redirect", "consolidate", "retire"].includes(route.disposition) || (route.disposition !== "retire" && !s.pages.some(p => p.path === route.target))) errors.push(`Invalid route disposition: ${route.source}`);
      for (const p of s.pages) {
        requireText(p, ["path", "purpose"], errors, "page");
        if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*$/.test(p.path)) errors.push(`Noncanonical planned route: ${p.path}`);
        if (new Set(p.sections.map(s => s.id)).size !== p.sections.length) errors.push(`Duplicate section IDs: ${p.path}`);
        if (!p.sections.length) errors.push(`Empty page: ${p.path}`);
        for (const section of p.sections) {
          requireText(section, ["id", "question", "message", "composition", "emphasis", "transition"], errors, "section");
          if (section.facts.some(id => !b.facts.some(f => f.id === id))) errors.push(`Unknown fact in ${section.id}`);
          for (const id of section.media) {
            const asset = m.assets.find(a => a.id === id);
            if (!asset) errors.push(`Unknown media in ${section.id}: ${id}`);
            else if (!asset.inspected || !["use", "retain"].includes(asset.disposition)) errors.push(`Planned media needs inspection and usable disposition: ${id}`);
          }
          if (section.action) requireText(section.action, ["label", "destination", "behavior"], errors, "action");
        }
      }
      const narrativeForStory = existsSync(join(root, "onboarding/narrative-brief.json"))
        ? json<NarrativeBrief>(join(root, "onboarding/narrative-brief.json"))
        : undefined;
      const directionForStory = existsSync(join(root, "onboarding/direction.json"))
        ? json<Direction>(join(root, "onboarding/direction.json"))
        : undefined;
      const designAuthoring = resolveDesignAuthoring(root);
      errors.push(...validateStoryboardDesign(s, {
        opportunityIds: narrativeForStory?.designOpportunities?.map(item => item.id),
        decisionIds: directionForStory?.decisions?.map(item => item.id),
        compositionMode: designAuthoring.mode === "composition-v1",
      }));
      if (designAuthoring.mode === "composition-v1") errors.push(...validateCompositionStoryboard(s, loadCompositionPack(root, designAuthoring.lessonRelease), b, m));
      const selectionPath = join(root, "onboarding/media-selection.json");
      const selection = existsSync(selectionPath) ? json<MediaSelection>(selectionPath) : undefined;
      errors.push(...validateStoryboardMedia(s, m, selection).map(mediaIssueFailure));
      if (node === "copy") {
        const copy = json<{ version: number; storyboardHash: string; pages: { path: string; sections: { id: string; heading: string; body: string; factIds: string[] }[] }[] }>(join(root, "onboarding/copy-plan.json"));
        if (copy.version !== 2 || copy.storyboardHash !== fingerprint(root, ["onboarding/storyboard.json"])) errors.push("Copy plan is stale");
        errors.push(...scanCopyPlanEditorial(root));
        // Copy drafts representative routes first (or all pages if provided)
        const targetPages = s.pages.filter(p => p.path === "/" || p.representative || copy.pages.some(cp => cp.path === p.path));
        for (const p of targetPages) for (const section of p.sections) {
          const draft = copy.pages.find(c => c.path === p.path)?.sections.find(c => c.id === section.id);
          if (!draft || !present(draft.heading) || !present(draft.body)) errors.push(`Missing copy: ${p.path} ${section.id}`);
          else if (draft.factIds.some(id => !b.facts.some(f => f.id === id))) errors.push(`Unknown copy fact: ${section.id}`);
        }
        const traceability = verifyCopyTraceability({ root, copyPlan: copy });
        if (!traceability.ok) {
          errors.push(...traceability.violations);
        }
      } else if (node === "copy-expansion") {
        const copy = json<{ version: number; storyboardHash: string; pages: { path: string; sections: { id: string; heading: string; body: string; factIds: string[] }[] }[] }>(join(root, "onboarding/copy-plan.json"));
        if (copy.version !== 2 || copy.storyboardHash !== fingerprint(root, ["onboarding/storyboard.json"])) errors.push("Copy plan is stale");
        // Copy-expansion requires copy for ALL planned storyboard pages
        for (const p of s.pages) for (const section of p.sections) {
          const draft = copy.pages.find(c => c.path === p.path)?.sections.find(c => c.id === section.id);
          if (!draft || !present(draft.heading) || !present(draft.body)) errors.push(`Missing expanded copy: ${p.path} ${section.id}`);
          else if (draft.factIds.some(id => !b.facts.some(f => f.id === id))) errors.push(`Unknown copy fact in expanded copy: ${section.id}`);
        }
        const traceability = verifyCopyTraceability({ root, copyPlan: copy });
        if (!traceability.ok) {
          errors.push(...traceability.violations);
        }
      }
    } else if (node === "representative" || node === "pages" || node === "edit") {
      const s = json<Storyboard>(join(root, "onboarding/storyboard.json"));
      if (node !== "edit") errors.push(...validateAuthoringDecisions(root, s));
      errors.push(...validateMotionPlan(s.motionPlan,s.pages.map(p=>p.path),{...motionCompositionPolicy(root,s.pages.map(p=>p.path)),sections:Object.fromEntries(s.pages.map(p=>[p.path,(p.sections||[]).map(s=>s.id)]))}));
      for (const p of s.pages.filter(p => node !== "representative" || p.representative || p.path === "/")) {
        const path = p.path === "/" ? "pages/index.html" : `pages${p.path}.html`;
        const alternative = p.path === "/" ? path : `pages${p.path}/index.html`;
        if (!existsSync(within(root, path)) && !existsSync(within(root, alternative))) errors.push(`Missing planned page: ${p.path}`);
      }
    } else if (node === "browser" || node === "representative-browser") {
      if (node === 'browser') errors.push(...performanceEvidenceFailures(root));
      const report = json<{ sourceHash: string; distHash: string; scope: string; motionScenarioHash?: string; temporalMotion?: TemporalMotionEvidence[]; routeJourneys?:MotionJourney[]; checksModes?: string[]; consentChecks?: { width: number; passed: boolean; failures: string[] }[]; routeChecks?: { source: string; width: number; disposition: string; target?: string; status: number; location?: string; destination?: string; mechanism: string; failures: string[] }[]; checks: { path: string; width: number; screenshot: string; screenshotHash: string; firstVisit?: { screenshot: string; screenshotHash: string }; failures: string[] }[] }>(join(root, "agent/reviews", `${node}.json`));
      if (report.sourceHash !== sourceHash(root) || report.distHash !== fingerprint(root, ["dist"])) errors.push("Browser evidence is stale");
      const plan = json<Storyboard>(join(root, "onboarding/storyboard.json"));
      errors.push(...validateMotionPlan(plan.motionPlan,plan.pages.map(p=>p.path),{...motionCompositionPolicy(root,plan.pages.map(p=>p.path)),sections:Object.fromEntries(plan.pages.map(p=>[p.path,(p.sections||[]).map(s=>s.id)]))}));
      if (node === "browser" && plan.version === 3) for (const route of plan.routes || []) for (const width of [375, 1080]) {
        const source = new URL(route.source).pathname.replace(/\/$/, "") || "/";
        const check = report.routeChecks?.find(item => item.source === source && item.width === width && item.disposition === route.disposition);
        if (!check) { errors.push(`Missing source-route handoff check: ${source} ${width}`); continue; }
        errors.push(...check.failures);
        if (["redirect", "consolidate"].includes(route.disposition)) {
          const target = route.target?.replace(/\/$/, "") || "/";
          const location = check.location ? new URL(check.location, "http://preview.local" + source).pathname.replace(/\/$/, "") || "/" : "";
          if (![301, 302, 307, 308].includes(check.status) || check.mechanism !== "http-redirect" || location !== target || check.destination !== target) errors.push(`Invalid HTTP handoff: ${source} ${width}`);
        }
      }
      if (node === "browser" && hasAnalyticsRuntime(root) && !existsSync(join(root,"dist/cookie-compliance/index.html"))) errors.push("Analytics runtime requires the generated consent page and verified controls");
      const pages = plan.pages.filter(p => node === "browser" || p.representative || p.path === "/");
      if (typographyPolicy(root).enabled) {
        if (node === 'browser') for (const file of files(join(root,'pages')).filter(f=>f.endsWith('.html'))) {
          const path = fileToPath(relative(join(root,'pages'),file).replaceAll('\\','/'));
          if (!pages.some(p=>p.path===path)) pages.push({path,sections:[],purpose:'Authored route',representative:false});
        }
        const generated = node === 'browser' && existsSync(join(root,'dist/cookie-compliance/index.html')) ? ['/cookie-compliance'] : [];
        errors.push(...typographyEvidenceFailures((report as any).typography, [...new Set([...pages.map(p=>p.path),...generated])]));
      }
      if (node === "browser" && existsSync(join(root, "dist/cookie-compliance/index.html"))) {
        if (!pages.some(p => p.path === "/cookie-compliance")) pages.push({ path: "/cookie-compliance" } as Storyboard["pages"][number]);
        if (!productionQuality(root) || hasAnalyticsRuntime(root)) for (const width of [375, 1080]) {
          const check = report.consentChecks?.find(c => c.width === width);
          if (!check || check.passed !== true || !Array.isArray(check.failures) || check.failures.length) errors.push(`Missing or failed saved-preference consent check: ${width}`);
        }
      }
      for (const page of pages) {
        const built = within(root, `dist${page.path === "/" ? "" : page.path}/index.html`);
        if (!existsSync(built)) errors.push(`Missing built page: ${page.path}`);
        else {
          const html = readFileSync(built, "utf8");
          const intendedMotion=plan.motionPlan|| (existsSync(join(root,'onboarding/direction.json'))?json<Direction>(join(root,'onboarding/direction.json')).motionPlan:undefined);
          errors.push(...motionBindingFailures(intendedMotion,page.path,html,motionCompositionPolicy(root,plan.pages.map(p=>p.path))));
          errors.push(...legacyDependencies(html, plan.routes || []).map(f => `${page.path}: ${f}`));
          if(intendedMotion?.version===2&&intendedMotion.routes?.some(r=>r.route===page.path))for(const width of [375,1080])for(const mode of ['normal','reduce','static'] as const){const journey=report.routeJourneys?.find(j=>j.path===page.path&&j.width===width&&j.mode===mode);if(!journey)errors.push(`Full-route journey missing: ${page.path}/${width}/${mode}`);else errors.push(...journeyEvidenceFailures(root,journey,intendedMotion));}
          const asset = html.match(/src=["'](\/motion-[^"']+\.js)["']/)?.[1];
          if (asset) {
            if (report.motionScenarioHash !== MOTION_SCENARIO_HASH) errors.push("Motion scenario evidence is stale or absent");
            if ((report as {staticMotionState?:string}).staticMotionState !== 'complete-after-teardown') errors.push('Final motion static evidence lacks a complete teardown presentation');
            const expected = [...html.matchAll(/data-motion-target=["']([^"']+)["']/g)].map(m => m[1]);
            for (const width of [375, 1080]) for (const mode of ["normal", "reduce"] as const) {
              const evidence = report.temporalMotion?.find(e => e.path === page.path && e.width === width && e.motion === mode);
              const check = report.checks.find(c => c.path === page.path && c.width === width && (c as { motion?: string }).motion === mode);
              if (!evidence || !check) { errors.push(`Missing normal/reduced motion evidence: ${page.path}/${width}/${mode}`); continue; }
              errors.push(...check.failures, ...temporalMotionFailures(root, evidence, fingerprint(root, [`dist${asset}`])));
              for (const id of expected) if (!evidence.targets.some(t => t.id === id && ["before","during","after"].every(state => t.samples.some(s => s.state === state)))) errors.push(`Missing temporal target: ${page.path}/${id}/${width}/${mode}`);
            }
          }
        }
      }
      for (const page of pages) for (const width of [375, 1080]) {
        const c = report.checks.find(c => c.path === page.path && c.width === width);
        if (!c) errors.push(`Missing browser check: ${page.path} ${width}`);
        else {
          errors.push(...c.failures);
          if (!existsSync(within(root, c.screenshot))) errors.push(`Missing screenshot: ${c.screenshot}`);
          else if (!isPng(root, c.screenshot) || c.screenshotHash !== fingerprint(root, [c.screenshot])) errors.push(`Screenshot corrupt or changed: ${c.screenshot}`);
          if (c.firstVisit && (!isPng(root, c.firstVisit.screenshot) || c.firstVisit.screenshotHash !== fingerprint(root, [c.firstVisit.screenshot]))) errors.push(`First-visit screenshot corrupt or changed: ${c.firstVisit.screenshot}`);
        }
      }
    } else if (node === "narrative") {
      const n = json<NarrativeBrief>(join(root, "onboarding/narrative-brief.json"));
      const b = json<Business>(join(root, "onboarding/business.json"));
      if ((n.schemaVersion !== 1 && n.schemaVersion !== 2) || n.businessHash !== fingerprint(root, ["onboarding/business.json"])) errors.push("Narrative brief is stale");
      if (n.mediaHash !== fingerprint(root, ["onboarding/media-inventory.json"])) errors.push("Narrative brief has stale mediaHash");
      requireText(n, ["customer", "problem", "offer", "serviceScope", "conversion"], errors, "narrative");
      if (!present(n.proof?.statement) || !n.proof.evidenceIds?.length) errors.push("Narrative needs evidenced proof");
      const evidenceIds = new Set(b.evidence.map(e => e.id));
      const factIds = new Set(b.facts.map(f => f.id));
      const checkIds = (ids: string[], label: string) => {
        for (const id of ids) if (!evidenceIds.has(id) && !factIds.has(id)) errors.push(`Narrative ${label} cites unknown evidence: ${id}`);
      };
      checkIds(n.proof.evidenceIds || [], "proof");
      for (const objection of n.objections || []) {
        if (!present(objection.claim)) errors.push("Narrative objection missing claim");
        checkIds(objection.evidenceIds || [], "objection");
      }
      if (!Array.isArray(n.unsupportedClaims)) errors.push("Narrative needs unsupportedClaims");
      if (!n.facts?.length) errors.push("Narrative needs linked facts");
      for (const fact of n.facts || []) {
        if (!present(fact.claim) || !fact.evidenceIds?.length) errors.push(`Narrative fact missing claim/evidence: ${fact.id}`);
        checkIds(fact.evidenceIds || [], `fact ${fact.id}`);
      }
      const mediaForNarrative = existsSync(join(root, "onboarding/media-inventory.json"))
        ? json<MediaInventory>(join(root, "onboarding/media-inventory.json"))
        : undefined;
      errors.push(...validateNarrativeDesign(n, b, mediaForNarrative));
    } else if (node === "reference-analysis") {
      const analysis = json<ReferenceAnalysis>(join(root, "onboarding/reference-analysis.json"));
      if (analysis.schemaVersion !== 1) errors.push("Reference analysis schema mismatch");
      if (analysis.narrativeHash !== fingerprint(root, ["onboarding/narrative-brief.json"])) errors.push("Reference analysis is stale versus narrative");
      const kernel = resolveKernelRoot(root);
      if (!kernel) errors.push("Copied kit cannot discover harness calibration pack; set VITRIS_HARNESS or depend on @tryvitris/website-harness");
      else if (analysis.packHash !== calibrationPackHash(kernel) || analysis.packVersion !== loadCalibrationManifest(kernel).packVersion) errors.push("Reference analysis pack version/hash is not current");
      if (!analysis.applicable?.length || !analysis.avoided?.length) errors.push("Reference analysis needs applicable and avoided principles");
      requireText(analysis.plannedApplication || {}, ["homepage", "interior"], errors, "plannedApplication");
      errors.push(...confinedCalibrationEvidence(root, analysis.evidencePaths, "Reference analysis"));
      for (const principle of analysis.applicable || []) {
        if (!present(principle.principle) || !present(principle.why)) errors.push("Applicable principle needs principle/why");
        errors.push(...confinedCalibrationEvidence(root, principle.evidencePaths, `Applicable principle ${principle.principle || ""}`.trim()));
      }
      errors.push(...validateTeachingPrinciples(root, analysis));
      errors.push(...validateReferenceSelection(root, analysis));
    } else if (node === "representative-quality") {
      errors.push(...sketchesAreNotRepresentatives(root));
      const grade = validateQualityReview(root, { requirePass: true });
      errors.push(...grade.failures);
      if (grade.review && grade.review.subjectHash !== qualitySubject(root)) errors.push("Quality subjectHash drifted");
    } else if (node === "preview") {
      const graphPath = join(root, "agent/graph.yaml");
      const statePath = join(root, "agent/STATE.json");
      const graph = existsSync(graphPath) ? applyArtDirectionGraph(root, parseGraphYaml(readFileSync(graphPath, "utf8"))) : undefined;
      const state = existsSync(statePath) ? json<{ nodes?: Record<string, { status?: string; attempts?: number }> }>(statePath) : undefined;
      const historical = (id: string) => {
        const spec = graph?.nodes.find(n => n.id === id);
        return !!(spec?.historicalAfter && state?.nodes?.[id]?.status === "done" && (state.nodes[spec.historicalAfter]?.attempts || 0) > 0);
      };
      const graphNodes = graph ? graph.nodes.map(n => n.id).filter(id => id !== "preview" && id !== "launch" && id !== "harvest") : undefined;
      const nodesToCheck = graphNodes || ["business", "business-review", "media", "narrative", "narrative-review", "reference-analysis", "direction", "direction-review", "storyboard", "copy", "copy-review", "representative", "representative-browser", "representative-review", "representative-quality", "copy-expansion", "pages", "browser", "visual-review", "content-review"];
      for (const id of nodesToCheck) {
        if (historical(id)) continue;
        errors.push(...evaluateV2(root, id).failures.map(f => `${id}: ${f}`));
      }
      const inventory = json<MediaInventory>(join(root, "onboarding/media-inventory.json"));
      const plan = json<Storyboard>(join(root, "onboarding/storyboard.json"));
      if (plan.version === 3) {
        const selectionPath = join(root, "onboarding/media-selection.json");
        const selection = existsSync(selectionPath) ? json<MediaSelection>(selectionPath) : undefined;
        errors.push(...validateStoryboardMedia(plan, inventory, selection).map(mediaIssueFailure));
      }
      const html = files(join(root, "dist")).filter(p => p.endsWith(".html")).map(p => readFileSync(p, "utf8")).join("\n");
      const plannedMedia = new Set(plan.pages.flatMap(p => p.sections.flatMap(s => s.media)));
      for (const asset of inventory.assets.filter(a => a.disposition === "use" || plannedMedia.has(a.id))) {
        if (!html.includes(asset.path)) errors.push(`Selected media not rendered: ${asset.id}`);
        const routes = plan.pages.filter(p => p.sections.some(s => s.media.includes(asset.id))).map(p => p.path);
        if (plan.version !== 3 && !routes.length) errors.push(`Selected media lacks storyboard placement: ${asset.id}`);
        for (const route of routes) {
          const target = within(root, `dist/${route.replace(/^\//, "").replace(/\/$/, "")}${route === "/" ? "" : "/"}index.html`);
          if (!existsSync(target) || !readFileSync(target, "utf8").includes(asset.path)) errors.push(`Media ${asset.id} absent from planned route ${route}`);
        }
      }
    } else if (node === "feedback-fulfillment") {
      const report = json<{ version: number; verdict: string; reviewer: string; evidence: string[]; choices: { id: string; priority?: string; status: string; evidence?: string }[] }>(join(root, "agent/reviews/feedback-fulfillment.json"));
      if (report.version !== 2) errors.push("Fulfillment review version must be 2");
      if (report.verdict !== "pass") errors.push(`Fulfillment verdict: ${report.verdict}`);
      if (!present(report.reviewer) || !report.evidence?.length) errors.push("Fulfillment review needs reviewer and evidence");
      if (!report.choices?.length) errors.push("Fulfillment review needs choice rows");
      for (const choice of report.choices) {
        if (!present(choice.id) || !["fulfilled", "partial", "unfulfilled"].includes(choice.status)) errors.push(`Invalid fulfillment row: ${choice.id}`);
        if ((choice.priority === "must" || !choice.priority) && choice.status === "unfulfilled") errors.push(`Unfulfilled must-have: ${choice.id}`);
      }
    } else errors.push(`Unknown v2 evaluator: ${node}`);
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return { node, ok: errors.length === 0, failures: errors };
}
