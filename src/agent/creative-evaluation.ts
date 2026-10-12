import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fingerprint, json, save } from "./artifacts.ts";
import { sourceManifest } from "./source-manifest.ts";
import { TRIAL_CAPTURE_PATHS } from "./trials.ts";

export type CreativeEvaluationCase = { id: string; mediaProfile: "image_rich" | "sparse_media"; capture: string; captureHash: string };
export type CreativeEvaluationProtocol = {
  schemaVersion: 1;
  createdAt: string;
  status: "frozen";
  kernelHash: string;
  model: string;
  host: string;
  cases: CreativeEvaluationCase[];
  arms: { id: "control" | "treatment" | "A" | "B" | "C" | "D"; profile: string; argv?: string[]; eligibility?: string }[];
  evaluationKind?: "creative-efficiency";
  cachePolicy?: "cold" | "warm";
  stopPoint?: "local_preview";
  promotionCriterion?: string;
  runsPerCaseArm: number;
  limits: { iterations: number; timeoutMs: number; tokens: number | null };
  reviewerConfigHash: string | null;
  reviewerConfigPath: string | null;
  permittedInterventions: string[];
  viewports: number[];
  outcomes: ["technical", "factual", "visual", "distinctiveness", "business_fit", "visitor_task", "human_preference"];
  attempts: { id: string; caseId: string; arm: "control" | "treatment" | "A" | "B" | "C" | "D"; index: number; status: "unrun"; resultPath: null }[];
  humanLabels: { comparisonId: string; preference: ""; criteria: Record<string, "">; comments: string }[];
};

/** Freeze inputs and a matched-budget comparison before either arm is generated. */
export function freezeCreativeEvaluation(opts: {
  kernel: string; out: string; model: string; host: string;
  cases: { id: string; mediaProfile: CreativeEvaluationCase["mediaProfile"]; capture: string }[];
  runsPerCaseArm: number;
  limits: CreativeEvaluationProtocol["limits"];
  reviewerConfigPath?: string;
  permittedInterventions: string[];
  viewports: number[];
  efficiencyArms?: boolean;
  cachePolicy?: "cold" | "warm";
  promotionCriterion?: string;
}): CreativeEvaluationProtocol {
  const out = resolve(opts.out), kernel = resolve(opts.kernel);
  if (existsSync(out)) throw new Error("Evaluation output already exists; prospective protocol requires a new directory");
  if (!opts.model.trim() || !opts.host.trim()) throw new Error("Model and host must be recorded before generation");
  if (opts.efficiencyArms && (!opts.cachePolicy || !opts.promotionCriterion?.trim())) throw new Error("Efficiency evaluation must predeclare cache policy and promotion criterion");
  if (!Number.isSafeInteger(opts.runsPerCaseArm) || opts.runsPerCaseArm < 1) throw new Error("Invalid run count");
  if (!Number.isSafeInteger(opts.limits.iterations) || opts.limits.iterations < 1 || !Number.isSafeInteger(opts.limits.timeoutMs) || opts.limits.timeoutMs < 1000 || opts.limits.tokens !== null && (!Number.isSafeInteger(opts.limits.tokens) || opts.limits.tokens < 1)) throw new Error("Invalid matched limits");
  if (!Array.isArray(opts.permittedInterventions) || !opts.permittedInterventions.every(item => typeof item === "string" && !!item.trim())) throw new Error("Intervention policy must be an explicit string list");
  if (!Array.isArray(opts.viewports) || !opts.viewports.includes(375) || !opts.viewports.includes(1080) || opts.viewports.some(width => !Number.isSafeInteger(width) || width < 320 || width > 2560)) throw new Error("Evaluation must include 375px and 1080px viewports");
  if (opts.cases.length < 2 || !opts.cases.some(item => item.mediaProfile === "image_rich") || !opts.cases.some(item => item.mediaProfile === "sparse_media")) throw new Error("Evaluation needs image-rich and sparse-media cases");
  const ids = new Set<string>();
  const cases = opts.cases.map(item => {
    if (!/^[a-z][a-z0-9-]*$/.test(item.id) || ids.has(item.id)) throw new Error(`Invalid or duplicate case ID ${item.id}`);
    ids.add(item.id);
    const capture = resolve(item.capture);
    if (!existsSync(capture)) throw new Error(`Capture missing: ${capture}`);
    if (out === capture || out.startsWith(capture + "\\") || out.startsWith(capture + "/")) throw new Error("Evaluation output must be outside capture");
    return { id: item.id, mediaProfile: item.mediaProfile, capture, captureHash: fingerprint(capture, TRIAL_CAPTURE_PATHS) };
  });
  if (new Set(cases.map(item => item.captureHash)).size !== cases.length) throw new Error("Cases must have distinct frozen capture bytes");
  const reviewerConfigPath = opts.reviewerConfigPath ? resolve(opts.reviewerConfigPath) : null;
  if (reviewerConfigPath && !existsSync(reviewerConfigPath)) throw new Error("Reviewer config missing");
  const reviewerConfigHash = reviewerConfigPath ? createHash("sha256").update(readFileSync(reviewerConfigPath)).digest("hex") : null;
  const arms: CreativeEvaluationProtocol["arms"] = opts.efficiencyArms ? [
    { id: "A", profile: "creative-v2-original-packet", argv: ["--creative-profile", "--no-jev", "--no-compact-packets"] },
    { id: "B", profile: "creative-v2-compact", argv: ["--creative-profile", "--creative-efficiency", "--no-jev"] },
    { id: "C", profile: "creative-v2-compact-jev-assist-agent-owned", argv: ["--creative-profile", "--creative-efficiency", "--jev-mode", "assist"], eligibility: "agent_owned" },
    { id: "D", profile: "creative-v2-compact-calibrated-replacement", argv: [], eligibility: "ineligible_until_task_specific_calibration" },
  ] : [{ id: "control", profile: "standard" }, { id: "treatment", profile: "creative-v1" }];
  const attempts = cases.flatMap(item => arms.flatMap(({ id: arm }) => Array.from({ length: opts.runsPerCaseArm }, (_, index) => ({ id: `${item.id}-${arm}-${index + 1}`, caseId: item.id, arm, index: index + 1, status: "unrun" as const, resultPath: null }))));
  const protocol: CreativeEvaluationProtocol = {
    schemaVersion: 1, createdAt: new Date().toISOString(), status: "frozen", kernelHash: sourceManifest(kernel).hash,
    model: opts.model, host: opts.host, cases,
    arms, ...(opts.efficiencyArms ? { evaluationKind: "creative-efficiency" as const, cachePolicy: opts.cachePolicy, stopPoint: "local_preview" as const, promotionCriterion: opts.promotionCriterion } : {}),
    runsPerCaseArm: opts.runsPerCaseArm, limits: opts.limits, reviewerConfigHash, reviewerConfigPath,
    permittedInterventions: [...opts.permittedInterventions], viewports: [...new Set(opts.viewports)].sort((a, b) => a - b),
    outcomes: ["technical", "factual", "visual", "distinctiveness", "business_fit", "visitor_task", "human_preference"],
    attempts, humanLabels: [],
  };
  mkdirSync(out, { recursive: true });
  save(join(out, "protocol.json"), protocol);
  save(join(out, "protocol-receipt.json"), { schemaVersion: 1, sha256: createHash("sha256").update(readFileSync(join(out, "protocol.json"))).digest("hex") });
  return protocol;
}

export function verifyCreativeEvaluation(out: string, kernel: string): { ok: boolean; failures: string[]; protocol: CreativeEvaluationProtocol } {
  const protocol = json<CreativeEvaluationProtocol>(join(resolve(out), "protocol.json"));
  const failures: string[] = [];
  const receipt = json<{ sha256?: string }>(join(resolve(out), "protocol-receipt.json"));
  if (receipt.sha256 !== createHash("sha256").update(readFileSync(join(resolve(out), "protocol.json"))).digest("hex")) failures.push("Protocol changed after freeze");
  if (protocol.schemaVersion !== 1 || protocol.status !== "frozen") failures.push("Invalid frozen protocol");
  if (sourceManifest(resolve(kernel)).hash !== protocol.kernelHash) failures.push("Kernel source changed after freeze");
  if (protocol.reviewerConfigPath && (!existsSync(protocol.reviewerConfigPath) || createHash("sha256").update(readFileSync(protocol.reviewerConfigPath)).digest("hex") !== protocol.reviewerConfigHash)) failures.push("Reviewer config changed after freeze");
  for (const item of protocol.cases) if (fingerprint(item.capture, TRIAL_CAPTURE_PATHS) !== item.captureHash) failures.push(`Capture changed after freeze: ${item.id}`);
  if (protocol.attempts.some(item => item.status !== "unrun" || item.resultPath !== null)) failures.push("Protocol manifest must not fabricate run outcomes");
  return { ok: failures.length === 0, failures, protocol };
}
