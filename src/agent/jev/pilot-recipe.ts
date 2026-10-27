import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { getKernelCalibration } from "./calibration.ts";
import {
  DEFAULT_JEV_CONFIG,
  DEFAULT_JEV_CAPABILITIES,
  DEFAULT_JEV_MODEL,
  DEFAULT_PILOT_BUDGET,
  capabilitiesFullyOff,
  enabledJevCallers,
  loadJevConfig,
  nonTreatmentFingerprint,
  resolveEffectiveCapabilities,
  validateJevConfig,
} from "./config.ts";
import { POLICY_VERSION } from "./policy.ts";
import type { JevCapabilityConfig, JevConfig, JevMode } from "./types.ts";

export interface PilotRecipe {
  schemaVersion: 1;
  name: string;
  stopNode: "preview";
  arms: {
    A: { mode: "off"; workOwnership: "agent"; compactPackets: boolean };
    B: { mode: "assist"; workOwnership: "agent"; compactPackets: boolean };
    C: { mode: "assist"; workOwnership: "delegated"; compactPackets: boolean };
  };
  requireCleanRoot: true;
  inheritReceipts: false;
  command: string;
}

export const MATCHED_AB_COMPACT = false;

export const ASSIST_QUALITY_PROFILE_VERSION = "2026-09-20.1";
export const ASSIST_QUALITY_PROFILE_NAME = "assist-quality-matched-ab";

export const ASSIST_QUALITY_TASK_IDS = [
  "business-source-selection",
  "business-review-grounding",
  "narrative-review-grounding",
  "copy-review-grounding",
  "claim-strengthening-check",
  "cta-fidelity-check",
  "intent-coverage-check",
  "cross-stage-consistency-check",
] as const;

export const ASSIST_QUALITY_CAPABILITIES: JevCapabilityConfig = {
  grounding: "assist",
  sourceSelection: "assist",
  retrievalRanking: "assist",
  consistency: "assist",
  repairAssistance: "assist",
  preferenceScoring: "off",
  claimStrengthening: "assist",
  ctaFidelity: "assist",
  crossStageContinuity: "assist",
  coverageCheck: "assist",
  creativeScoring: "off",
};

export const ASSIST_QUALITY_PROFILE = {
  version: ASSIST_QUALITY_PROFILE_VERSION,
  name: ASSIST_QUALITY_PROFILE_NAME,
  model: DEFAULT_JEV_MODEL,
  taskIds: [...ASSIST_QUALITY_TASK_IDS],
  capabilities: ASSIST_QUALITY_CAPABILITIES,
  thresholds: DEFAULT_JEV_CONFIG.confidenceThresholds,
  policyVersion: POLICY_VERSION,
  compactPackets: MATCHED_AB_COMPACT,
  workOwnership: "agent" as const,
  jevBudget: { ...DEFAULT_PILOT_BUDGET },
  stopNode: "preview" as const,
};

export function plannedJevCallsForProfile(profile: { capabilities: JevCapabilityConfig; model: string }): Array<{ nodeId: string; taskId: string }> {
  const cfg: JevConfig = {
    ...DEFAULT_JEV_CONFIG,
    mode: "assist",
    model: profile.model,
    capabilities: profile.capabilities,
    compactPackets: MATCHED_AB_COMPACT,
    workOwnership: "agent",
  };
  const callers = enabledJevCallers(cfg);
  const calls: Array<{ nodeId: string; taskId: string }> = [];
  if (callers.includes("copy-review")) {
    calls.push(
      { nodeId: "copy-review", taskId: "claim-strengthening-check" },
      { nodeId: "copy-review", taskId: "cta-fidelity-check" },
      { nodeId: "copy-review", taskId: "intent-coverage-check" },
      { nodeId: "copy-review", taskId: "cross-stage-consistency-check" },
      { nodeId: "copy-review", taskId: "copy-review-grounding" },
    );
  }
  if (callers.includes("content-review")) {
    calls.push(
      { nodeId: "content-review", taskId: "claim-strengthening-check" },
      { nodeId: "content-review", taskId: "cta-fidelity-check" },
    );
  }
  if (callers.includes("business-review")) calls.push({ nodeId: "business-review", taskId: "business-review-grounding" });
  if (callers.includes("narrative-review")) calls.push({ nodeId: "narrative-review", taskId: "narrative-review-grounding" });
  if (callers.includes("business")) calls.push({ nodeId: "business", taskId: "business-source-selection" });
  return calls;
}

export function profileFileConfig(arm: "A" | "B", profile = ASSIST_QUALITY_PROFILE): JevConfig {
  return arm === "A"
    ? {
        ...DEFAULT_JEV_CONFIG,
        mode: "off",
        model: profile.model,
        compactPackets: profile.compactPackets,
        workOwnership: "agent",
        capabilities: { ...DEFAULT_JEV_CAPABILITIES },
        confidenceThresholds: profile.thresholds,
        pilotBudget: profile.jevBudget,
      }
    : {
        ...DEFAULT_JEV_CONFIG,
        mode: "assist",
        model: profile.model,
        compactPackets: profile.compactPackets,
        workOwnership: "agent",
        capabilities: profile.capabilities,
        confidenceThresholds: profile.thresholds,
        pilotBudget: profile.jevBudget,
      };
}

export function applyAssistProfile(root: string, arm: "A" | "B", profile = ASSIST_QUALITY_PROFILE): JevConfig {
  mkdirSync(join(root, "agent"), { recursive: true });
  const payload = profileFileConfig(arm, profile);
  writeFileSync(join(root, "agent/jev.json"), JSON.stringify(payload, null, 2), "utf8");
  const loaded = loadJevConfig(root);
  validateJevConfig(loaded);
  return loaded;
}

export function validateMatchedAbConfigs(a: JevConfig, b: JevConfig): { ok: true } | { ok: false; reason: string } {
  if (a.mode !== "off" || !capabilitiesFullyOff(resolveEffectiveCapabilities(a))) {
    return { ok: false, reason: "Arm A must be fully off (mode and effective capabilities)." };
  }
  const bCallers = enabledJevCallers(b);
  if (b.mode !== "assist" || bCallers.length === 0) {
    return { ok: false, reason: "Arm B resolved to zero enabled Jev callers; aborting." };
  }
  const bCaps = resolveEffectiveCapabilities(b);
  for (const [key, want] of Object.entries(ASSIST_QUALITY_CAPABILITIES)) {
    if ((bCaps[key as keyof typeof bCaps] || "off") !== want) {
      return { ok: false, reason: `Arm B must match frozen profile ${ASSIST_QUALITY_PROFILE_VERSION} capability ${key}=${want}.` };
    }
  }
  if (nonTreatmentFingerprint(a) !== nonTreatmentFingerprint(b)) {
    return { ok: false, reason: "Arms differ on non-treatment settings (model, compact packets, ownership, thresholds, or budget)." };
  }
  if ((a.workOwnership ?? "agent") !== "agent" || (b.workOwnership ?? "agent") !== "agent") {
    return { ok: false, reason: "Matched A/B requires workOwnership=agent. Arm C remains blocked." };
  }
  return { ok: true };
}

export const FROZEN_PILOT_RECIPE: PilotRecipe = {
  schemaVersion: 1,
  name: "jev-abc-prepilot",
  stopNode: "preview",
  arms: {
    A: { mode: "off", workOwnership: "agent", compactPackets: MATCHED_AB_COMPACT },
    B: { mode: "assist", workOwnership: "agent", compactPackets: MATCHED_AB_COMPACT },
    C: { mode: "assist", workOwnership: "delegated", compactPackets: MATCHED_AB_COMPACT },
  },
  requireCleanRoot: true,
  inheritReceipts: false,
  command: "node --experimental-strip-types scripts/eval-jev.ts --recipe jev-ab-matched --dry-run --stop preview",
};

export const MATCHED_AB_RECIPE = {
  schemaVersion: 1 as const,
  name: "jev-ab-matched",
  stopNode: "preview" as const,
  isolate: "Jev mode only. Compact packets stay fixed. Do not confound compact evaluation with this pair.",
  arms: {
    A: { mode: "off" as const, workOwnership: "agent" as const, compactPackets: MATCHED_AB_COMPACT },
    B: { mode: "assist" as const, workOwnership: "agent" as const, compactPackets: MATCHED_AB_COMPACT },
  },
  blocked: { C: "Arm C remains blocked until kernel calibration is eligible for each delegated task." },
  promotionBeforeResults: {
    noFactualOrCtaRegression: true,
    noWorseRequiredGoalCoverage: true,
    validPreviewBrowserVisualGates: true,
    meaningfulAgentTokenReductionOrSuperiorSite: true,
    otherwiseKeepJevOff: true,
  },
};

export function assertPilotArmAllowed(opts: {
  arm: "A" | "B" | "C";
  taskIds: string[];
  root: string;
}): { ok: true } | { ok: false; reason: string } {
  if (opts.arm !== "C") return { ok: true };
  for (const taskId of opts.taskIds) {
    const cal = getKernelCalibration(taskId);
    if (!cal?.eligible || !cal.pilotOnly) {
      return {
        ok: false,
        reason: `Arm C refuses uncalibrated delegation for ${taskId}. Run A/B additive only.`,
      };
    }
  }
  return { ok: true };
}

export function expectedJevBudget() {
  return {
    ...DEFAULT_JEV_CONFIG.pilotBudget,
    note: "Stop Jev and restore agent obligations at the ceiling. Unknown agent tokens stay unknown.",
  };
}

export function defaultRollout() {
  return { mode: "off" as const, workOwnership: "agent" as const };
}

export interface KernelIdentity {
  packageVersion: string;
  gitCommit: string;
  workingTreeHash: string;
  dirty: boolean;
}

export function kernelIdentity(kernel: string): KernelIdentity {
  let packageVersion = "unknown";
  try {
    packageVersion = String(JSON.parse(readFileSync(join(kernel, "package.json"), "utf8")).version || "unknown");
  } catch { /* ignore */ }
  const git = spawnSync("git", ["-C", kernel, "rev-parse", "HEAD"], { encoding: "utf8" });
  const porcelain = spawnSync("git", ["-C", kernel, "status", "--porcelain"], { encoding: "utf8" });
  const gitCommit = git.status === 0 ? git.stdout.trim() : "unavailable";
  const dirty = porcelain.status === 0 ? porcelain.stdout.trim().length > 0 : true;
  const h = createHash("sha256");
  for (const rel of ["src", "agent", "scripts", "package.json"]) {
    const full = join(kernel, rel);
    if (!existsSync(full)) continue;
    const st = statSync(full);
    if (st.isFile()) h.update(rel).update(readFileSync(full));
    else hashTree(full, rel, h);
  }
  return { packageVersion, gitCommit, workingTreeHash: h.digest("hex"), dirty };
}

function hashTree(dir: string, rel: string, h: ReturnType<typeof createHash>): void {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const p = join(dir, name);
    const r = `${rel}/${name}`;
    const st = statSync(p);
    if (st.isDirectory()) hashTree(p, r, h);
    else h.update(r).update(readFileSync(p));
  }
}

/** Package version alone is not a kernel revision. */
export function kernelRevision(kernel: string): string {
  const id = kernelIdentity(kernel);
  return `${id.gitCommit}:${id.workingTreeHash.slice(0, 16)}`;
}

function shaFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function snapshotHash(root: string): string {
  const h = createHash("sha256");
  for (const rel of ["onboarding", "pages", "components", "launch.json", "site.json"]) {
    const full = join(root, rel);
    if (!existsSync(full)) continue;
    const st = statSync(full);
    if (st.isFile()) h.update(rel).update(readFileSync(full));
    else walk(full, rel);
  }
  function walk(dir: string, rel: string) {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith(".")) continue;
      const p = join(dir, name);
      const r = `${rel}/${name}`;
      const st = statSync(p);
      if (st.isDirectory()) walk(p, r);
      else h.update(r).update(readFileSync(p));
    }
  }
  return h.digest("hex");
}

export function inheritedJevState(root: string): string[] {
  const hits: string[] = [];
  const ignore = /^(arm-[AB]-(prepare|execution)\.json)$/;
  for (const rel of ["agent/decisions/jev", "agent/runs/usage", "agent/runs"]) {
    const dir = join(root, rel);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter(f => (f.endsWith(".json") || f.endsWith(".usage.json")) && !ignore.test(f));
    if (files.length) hits.push(`${rel} (${files.length} files)`);
  }
  return hits;
}

export function validateIsolatedSiteRoot(root: string): { ok: true } | { ok: false; reason: string } {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return { ok: false, reason: `Site root does not exist: ${root}` };
  }
  if (!existsSync(join(root, "launch.json")) && !existsSync(join(root, "agent"))) {
    return { ok: false, reason: `Site root is not a Vitris site: ${root}` };
  }
  const inherited = inheritedJevState(root);
  if (inherited.length) {
    return { ok: false, reason: `Root is not clean; inherited Jev cache/receipts: ${inherited.join("; ")}` };
  }
  return { ok: true };
}

export interface MatchedAbProcedure {
  schemaVersion: 1;
  recipe: string;
  stopNode: "preview";
  kernelRevision: string;
  kernelIdentity?: KernelIdentity;
  profile?: typeof ASSIST_QUALITY_PROFILE;
  compactPackets: boolean;
  activeAgent: { model: string; settings: string };
  arms: {
    A: { mode: "off"; workOwnership: "agent"; root: string; snapshotHash: string };
    B: { mode: "assist"; workOwnership: "agent"; root: string; snapshotHash: string };
  };
  steps: string[];
  completionManifestRequired: true;
  usageReceiptsRequired: true;
  doNotRunC: true;
  doNotDeploy: true;
}

export function emitMatchedAbProcedure(opts: {
  kernel: string;
  rootA: string;
  rootB: string;
  model?: string;
}): { ok: true; procedure: MatchedAbProcedure } | { ok: false; reason: string } {
  const a = validateIsolatedSiteRoot(opts.rootA);
  if (!a.ok) return a;
  const b = validateIsolatedSiteRoot(opts.rootB);
  if (!b.ok) return b;
  if (resolve(opts.rootA) === resolve(opts.rootB)) {
    return { ok: false, reason: "Arms A and B must use distinct isolated site roots." };
  }
  const snapA = snapshotHash(opts.rootA);
  const snapB = snapshotHash(opts.rootB);
  if (snapA !== snapB) {
    return { ok: false, reason: `Source snapshots differ: A ${snapA.slice(0, 12)} vs B ${snapB.slice(0, 12)}` };
  }
  const rev = kernelRevision(opts.kernel);
  const model = opts.model || "local-gemini";
  const procedure: MatchedAbProcedure = {
    schemaVersion: 1,
    recipe: MATCHED_AB_RECIPE.name,
    stopNode: "preview",
    kernelRevision: rev,
    kernelIdentity: kernelIdentity(opts.kernel),
    profile: ASSIST_QUALITY_PROFILE,
    compactPackets: MATCHED_AB_COMPACT,
    activeAgent: { model, settings: "identical across A/B; dedicated session per arm" },
    arms: {
      A: { mode: "off", workOwnership: "agent", root: opts.rootA, snapshotHash: snapA },
      B: { mode: "assist", workOwnership: "agent", root: opts.rootB, snapshotHash: snapB },
    },
    steps: [
      `Confirm kernel revision ${rev} for both arms.`,
      `In ${opts.rootA}: npm run go with mode=off workOwnership=agent compactPackets=${MATCHED_AB_COMPACT} stop=preview.`,
      `In ${opts.rootB}: npm run go with mode=assist workOwnership=agent compactPackets=${MATCHED_AB_COMPACT} stop=preview.`,
      "Do not inherit Jev cache, decisions, or agent/runs/usage receipts.",
      "Write agent/runs/usage receipts for every agent attempt; missing usage is unknown, never zero.",
      "Write completion manifests with snapshotHash, model, previewReady, and observed quality checks.",
      "Compare measured agent tokens only when both arms have complete coverage of the same nodes.",
      "Do not run Arm C. Do not deploy.",
    ],
    completionManifestRequired: true,
    usageReceiptsRequired: true,
    doNotRunC: true,
    doNotDeploy: true,
  };
  return { ok: true, procedure };
}

export function writeDryRunManifests(opts: {
  outDir: string;
  procedure: MatchedAbProcedure;
}): { provenancePath: string; usagePath: string } {
  mkdirSync(opts.outDir, { recursive: true });
  const provenancePath = join(opts.outDir, "provenance.json");
  const usagePath = join(opts.outDir, "usage-manifest.json");
  writeFileSync(provenancePath, JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    procedure: opts.procedure,
    kernelRevision: opts.procedure.kernelRevision,
    kernelIdentity: opts.procedure.kernelIdentity,
    snapshotHash: opts.procedure.arms.A.snapshotHash,
    identicalSource: opts.procedure.arms.A.snapshotHash === opts.procedure.arms.B.snapshotHash,
    compactPackets: opts.procedure.compactPackets,
    stopNode: opts.procedure.stopNode,
    profile: ASSIST_QUALITY_PROFILE,
    plannedCalls: {
      A: [],
      B: plannedJevCallsForProfile(ASSIST_QUALITY_PROFILE),
    },
    armC: "blocked",
    executed: false,
  }, null, 2), "utf8");
  writeFileSync(usagePath, JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    arms: {
      A: { coverage: "unknown", source: "unavailable", receipts: [], note: "Dry-run: no agent attempts recorded." },
      B: { coverage: "unknown", source: "unavailable", receipts: [], note: "Dry-run: no agent attempts recorded." },
    },
    comparison: { verdict: "measurement_incomplete", savingsPct: null, agentTokenDelta: null },
    executed: false,
  }, null, 2), "utf8");
  return { provenancePath, usagePath };
}

export function shaFileHash(path: string): string {
  return shaFile(path);
}

export function writeArmExecutionManifest(opts: {
  root: string;
  arm: "A" | "B";
  kernel: string;
  profile?: typeof ASSIST_QUALITY_PROFILE;
  actualCalls: Array<{ nodeId: string; taskId: string; receiptIds?: string[] }>;
  previewReady: boolean;
  executed: boolean;
}): string {
  mkdirSync(join(opts.root, "agent/runs"), { recursive: true });
  const identity = kernelIdentity(opts.kernel);
  const loaded = loadJevConfig(opts.root);
  const path = join(opts.root, "agent/runs", `arm-${opts.arm}-execution.json`);
  writeFileSync(path, JSON.stringify({
    schemaVersion: 1,
    arm: opts.arm,
    executed: opts.executed,
    stopNode: "preview",
    kernelIdentity: identity,
    kernelRevision: kernelRevision(opts.kernel),
    siteSnapshotHash: snapshotHash(opts.root),
    profile: opts.profile || ASSIST_QUALITY_PROFILE,
    effectiveConfig: {
      mode: loaded.mode,
      model: loaded.model,
      compactPackets: loaded.compactPackets,
      workOwnership: loaded.workOwnership,
      capabilities: resolveEffectiveCapabilities(loaded),
      enabledCallers: enabledJevCallers(loaded),
    },
    actualCalls: opts.actualCalls,
    previewReady: opts.previewReady,
    inheritReceipts: false,
    armC: "blocked",
    doNotDeploy: true,
  }, null, 2), "utf8");
  return path;
}
