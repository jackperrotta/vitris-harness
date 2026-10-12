import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { choice } from "@typesafe-ai/sdk";
import type { JevClient } from "./client.ts";
import type { JevCapabilityConfig, JevMode } from "./types.ts";
import { runSemanticTask, type SemanticReceipt, type SemanticTask } from "./semantic-tasks.ts";
import { KNOWLEDGE_RELEASE, LAUNCH_POLICY_ID } from "../../knowledge/contracts.ts";

const tasks: Array<{ task: SemanticTask; stage: string; capability: keyof JevCapabilityConfig; sources: string[]; criteria: Record<string, string> }> = [
  { task: "rank-lessons", stage: "reference-analysis", capability: "lessonRanking", sources: ["onboarding/narrative-brief.json", "onboarding/media-inventory.json"], criteria: { relevant: "The proposed lesson fits the supplied visitor job and assets.", weak: "The lesson has a material mismatch or unsupported prerequisite.", unknown: "The supplied evidence is insufficient." } },
  { task: "unanswered-questions", stage: "copy", capability: "visitorQuestionCheck", sources: ["onboarding/narrative-brief.json", "onboarding/storyboard.json"], criteria: { covered: "The planned sections answer the major visitor questions.", unanswered: "A major recorded visitor question is not answered by the plan.", unknown: "The supplied evidence is insufficient." } },
  { task: "fact-copy-contradiction", stage: "copy-review", capability: "factContradictionCheck", sources: ["onboarding/business.json", "onboarding/copy-plan.json"], criteria: { consistent: "The copy preserves the documented facts and qualifications.", contradiction: "The copy contradicts or overstates a documented fact.", unknown: "The supplied evidence is insufficient." } },
  { task: "cta-fit", stage: "copy-review", capability: "ctaFitCheck", sources: ["onboarding/storyboard.json", "onboarding/copy-plan.json"], criteria: { fits: "CTA wording accurately describes its documented action.", mismatch: "CTA wording promises more than its documented action.", unknown: "The supplied evidence is insufficient." } },
  { task: "unexplained-repetition", stage: "representative", capability: "repetitionExplanationCheck", sources: ["onboarding/storyboard.json"], criteria: { purposeful: "Repeated structure serves a coherent visitor job.", unexplained: "Repeated structure has no clear visitor purpose.", unknown: "The supplied evidence is insufficient." } },
  { task: "direction-continuity", stage: "visual-review", capability: "directionContinuityCheck", sources: ["onboarding/direction.json"], criteria: { preserved: "The authored pages and components preserve the approved direction's identity, allowing deliberate page-specific variation.", drifted: "An authored page or component materially drifts from the approved identity.", unknown: "The supplied evidence is insufficient." } },
];

function authoredFiles(root: string, dir: "pages" | "components"): string[] {
  const start = join(root, dir);
  if (!existsSync(start)) return [];
  const result: string[] = [];
  const walk = (path: string, relative: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const next = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(join(path, entry.name), next);
      else if (entry.isFile() && /\.(?:html|css)$/.test(entry.name)) result.push(next);
    }
  };
  walk(start, dir);
  return result.sort();
}

function continuityPaths(root: string): string[] {
  const pages = authoredFiles(root, "pages");
  const components = authoredFiles(root, "components");
  const requestPath = join(root, "agent/change-request.json");
  if (!existsSync(requestPath)) return [...pages, ...components];
  let affected: string[] = [];
  try {
    const request = JSON.parse(readFileSync(requestPath, "utf8")) as { affectedPages?: unknown };
    if (Array.isArray(request.affectedPages)) affected = request.affectedPages.filter((value): value is string => typeof value === "string");
  } catch { /* An invalid request cannot narrow the evidence. */ }
  if (!affected.length) return [...pages, ...components];
  const selected = new Set(affected.flatMap(route => {
    if (route === "/") return ["pages/index.html"];
    const name = route.replace(/^\/+|\/+$/g, "");
    return [`pages/${name}/index.html`, `pages/${name}.html`];
  }));
  return [...pages.filter(path => selected.has(path)), ...components];
}

export async function runLifecycleSemanticTasks(input: {
  root: string;
  stage: string;
  preparationId: string;
  capabilities: JevCapabilityConfig;
  model: string;
  client?: JevClient;
  signal?: AbortSignal;
  lessonCandidates?: Array<{ id: string; reason: string }>;
}): Promise<{ receipts: SemanticReceipt[]; advisory: string }> {
  const applicable = tasks.filter(item => item.stage === input.stage && input.capabilities[item.capability] !== "off");
  if (!applicable.length) return { receipts: [], advisory: "" };
  const receipts: SemanticReceipt[] = [];
  const notes: string[] = [];
  for (const spec of applicable) {
    const mode = input.capabilities[spec.capability] as JevMode;
    const paths = spec.task === "direction-continuity" ? [...spec.sources, ...continuityPaths(input.root)] : spec.sources;
    const source = paths.filter(path => existsSync(join(input.root, path)))
      .map(path => {
        const fullText = readFileSync(join(input.root, path), "utf8");
        const limit = spec.task === "direction-continuity" ? 20_000 : 5_000;
        return { id: path, text: fullText.slice(0, limit), truncated: fullText.length > limit };
      });
    const candidates = spec.task === "rank-lessons" ? (input.lessonCandidates || []) : [undefined];
    for (const candidate of candidates) {
      const content = { stage: input.stage, sources: source, ...(candidate ? { lessonCandidate: candidate } : {}) };
      const evidenceIds = [...source.map(item => item.id), ...(candidate ? [`lesson:${candidate.id}`] : [])];
      let confidence: number | undefined;
      const receipt = await runSemanticTask({
        task: spec.task, mode, model: input.model, content,
        knowledgeRelease: KNOWLEDGE_RELEASE, policyId: LAUNCH_POLICY_ID,
        evidenceIds, cache: new Map(),
        unavailableReason: spec.task === "direction-continuity" && source.some(item => item.truncated) ? "Source exceeds semantic evidence limit; continuity cannot be called preserved." : undefined,
        invoke: input.client && source.length === paths.length && (spec.task !== "direction-continuity" || (!source.some(item => item.truncated) && paths.some(path => path.startsWith("pages/")))) ? async () => {
          const evaluated = await input.client!.evaluate({
            taskType: "custom", nodeId: input.stage, signal: input.signal,
            questions: { judgment: choice(`Advisory semantic check: ${spec.task}. Judge only the supplied ${candidate ? "single lesson candidate" : "sources"}; choose unknown when evidence is insufficient. Do not certify accessibility, SEO, or factual truth.`, spec.criteria) },
            state: content,
          });
          const answer = evaluated.result.answers.judgment as { choice?: string; confidence?: number } | undefined;
          confidence = typeof answer?.confidence === "number" && Number.isFinite(answer.confidence) ? answer.confidence : undefined;
          const providerReceipt = JSON.parse(readFileSync(evaluated.receiptPath, "utf8")) as { usage?: { inputTokens?: number; outputTokens?: number } };
          return {
            text: JSON.stringify({ answer: answer?.choice && Object.hasOwn(spec.criteria, answer.choice) ? answer.choice : "unknown", citedEvidence: evidenceIds }),
            latencyMs: evaluated.durationMs,
            cached: evaluated.cached,
            tokenUsage: { input: providerReceipt.usage?.inputTokens, output: providerReceipt.usage?.outputTokens },
          };
        } : undefined,
      });
      if (candidate) { receipt.candidateId = candidate.id; receipt.confidence = confidence; }
      receipts.push(receipt);
      if (mode === "assist" && receipt.state === "ok" && !candidate) notes.push(`- ${spec.task}: ${receipt.answer} (advisory; sources ${receipt.citedEvidence.join(", ")})`);
    }
    if (spec.task === "rank-lessons" && receipts.length) {
      const fit = (receipt: SemanticReceipt) => receipt.answer === "relevant" ? 2 : receipt.answer === "weak" ? 0 : 1;
      receipts.sort((a, b) => fit(b) - fit(a) || (b.confidence || 0) - (a.confidence || 0) || (a.candidateId || "").localeCompare(b.candidateId || ""));
      receipts.forEach((receipt, index) => { receipt.rank = index + 1; });
      if (mode === "assist") notes.push(`- rank-lessons: ${receipts.map(item => `${item.rank}. ${item.candidateId} (${item.answer})`).join("; ")} (advisory candidate ranking)`);
    }
  }
  mkdirSync(join(input.root, "agent/reviews"), { recursive: true });
  writeFileSync(join(input.root, `agent/reviews/jev-semantic-${input.stage}.json`), JSON.stringify({ schemaVersion: 1, preparationId: input.preparationId, stage: input.stage, receipts }, null, 2));
  return { receipts, advisory: notes.length ? `## Jev semantic observations\n${notes.join("\n")}` : "" };
}
