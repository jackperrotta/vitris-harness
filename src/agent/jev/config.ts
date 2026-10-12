import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { JevCapabilityConfig, JevConfig, JevMode, JevWorkOwnership } from "./types.ts";
export type { JevCapabilityConfig, JevConfig, JevMode, JevWorkOwnership };

export const DEFAULT_JEV_MODEL = "jev-1.13.0";
export const DEFAULT_ROUTING_CONFIDENCE_THRESHOLD = 0.80;
export const DEFAULT_GROUNDING_CONFIDENCE_THRESHOLD = 0.85;

export const DEFAULT_JEV_CONFIG: JevConfig = {
  mode: "off",
  model: DEFAULT_JEV_MODEL,
  timeoutMs: 30000,
  taskDeadlineMs: 120000,
  maxConcurrency: 4,
  maxRetries: 2,
  confidenceThresholds: {
    routing: DEFAULT_ROUTING_CONFIDENCE_THRESHOLD,
    grounding: DEFAULT_GROUNDING_CONFIDENCE_THRESHOLD,
  },
  compactPackets: false,
  workOwnership: "agent",
  pilotBudget: { maxTransportAttempts: 100, maxInputTokens: 200000 },
};

/** Default capabilities — all off. Includes WS5 and WS7 additions. */
export const DEFAULT_JEV_CAPABILITIES: JevCapabilityConfig = {
  mediaClassification: "off", mediaSelection: "off", mediaSetReview: "off", mediaProvenance: "off",
  // Existing
  grounding: "off",
  sourceSelection: "off",
  retrievalRanking: "off",
  consistency: "off",
  repairAssistance: "off",
  preferenceScoring: "off",
  // Workstream 5
  claimStrengthening: "off",
  ctaFidelity: "off",
  crossStageContinuity: "off",
  coverageCheck: "off",
  // Workstream 7
  creativeScoring: "off",
  componentSelection: "off",
  compositionCheck: "off",
  lessonRanking: "off",
  visitorQuestionCheck: "off",
  factContradictionCheck: "off",
  ctaFitCheck: "off",
  repetitionExplanationCheck: "off",
  directionContinuityCheck: "off",
};

/** Advisory design checks. Does not enable delegation or override an explicit off. */
export const DESIGN_ASSIST_CAPABILITIES = ["creativeScoring", "componentSelection", "compositionCheck", "mediaClassification", "mediaSelection", "mediaSetReview", "mediaProvenance"] as const;
/** Creative efficiency routes optional context and repair hints; it never delegates work. */
export const CREATIVE_EFFICIENCY_CAPABILITIES = ["retrievalRanking", "repairAssistance"] as const;

/** Default pilot budget. Stop Jev and restore agent obligations at the ceiling. */
export const DEFAULT_PILOT_BUDGET = { maxTransportAttempts: 100, maxInputTokens: 200000 };

/** Safely resolve the TypeSafe API key from process.env or .dev.vars without ever logging or leaking it. */
export function resolveApiKey(searchDirs: string[] = []): string | undefined {
  if (process.env.TYPESAFE_API_KEY?.trim()) {
    return process.env.TYPESAFE_API_KEY.trim();
  }

  const dirsToInspect = [
    process.cwd(),
    ...searchDirs,
    join(process.cwd(), ".."),
    join(process.cwd(), "../vitris-v3"),
  ];

  for (const dir of dirsToInspect) {
    const devVarsPath = join(dir, ".dev.vars");
    if (existsSync(devVarsPath)) {
      try {
        const content = readFileSync(devVarsPath, "utf8");
        for (const line of content.split(/\r?\n/)) {
          const match = line.match(/^TYPESAFE_API_KEY\s*=\s*([^\s#]+)/);
          if (match && match[1]?.trim()) {
            return match[1].trim();
          }
        }
      } catch {
        // ignore read error
      }
    }
  }

  return undefined;
}

export function loadJevConfig(root: string, argv: string[] = [], env: NodeJS.ProcessEnv = process.env): JevConfig {
  let fileConfig: Partial<JevConfig> = {};
  const configPath = join(root, "agent/jev.json");
  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      fileConfig = {};
    }
  }
  return mergeJevConfig(fileConfig, argv, env, root);
}

/** Resolve CLI > environment > file payload without reading or writing agent/jev.json. */
export function mergeJevConfig(
  fileConfig: Partial<JevConfig>,
  argv: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
  root = "",
): JevConfig {
  const capabilities: JevCapabilityConfig = {
    ...DEFAULT_JEV_CAPABILITIES,
    ...(fileConfig.capabilities || {}),
  };

  // Precedence: CLI > ENV > fileConfig > DEFAULT_JEV_CONFIG
  let mode: JevMode = DEFAULT_JEV_CONFIG.mode;
  if (fileConfig.mode && ["off", "shadow", "assist"].includes(fileConfig.mode)) {
    mode = fileConfig.mode;
  }
  const envMode = env.VITRIS_JEV_MODE?.toLowerCase();
  if (envMode && ["off", "shadow", "assist"].includes(envMode)) {
    mode = envMode as JevMode;
  }
  const modeIdx = argv.indexOf("--jev-mode");
  if (modeIdx >= 0 && argv[modeIdx + 1] && ["off", "shadow", "assist"].includes(argv[modeIdx + 1]!)) {
    mode = argv[modeIdx + 1] as JevMode;
  }
  if (argv.includes("--no-jev")) {
    mode = "off";
  }

  const explicitCapabilityKeys = new Set(Object.keys(fileConfig.capabilities || {}));
  const presetRequested = argv.includes("--design-assist")
    || env.VITRIS_DESIGN_ASSIST === "1"
    || env.VITRIS_DESIGN_ASSIST === "true";
  const explicitOff = argv.includes("--no-jev")
    || env.VITRIS_JEV_MODE?.toLowerCase() === "off"
    || (modeIdx >= 0 && argv[modeIdx + 1] === "off");
  if (presetRequested && !explicitOff) {
    if (mode === "off") mode = "assist";
    for (const key of DESIGN_ASSIST_CAPABILITIES) {
      if (!explicitCapabilityKeys.has(key)) capabilities[key] = "assist";
    }
  }

  const creativeEfficiency = argv.includes("--creative-efficiency");
  const fileExplicitOff = fileConfig.mode === "off" && modeIdx < 0 && !envMode;
  if (creativeEfficiency && !explicitOff && !fileExplicitOff) {
    if (mode === "off") mode = "assist";
    for (const key of CREATIVE_EFFICIENCY_CAPABILITIES) {
      if (!explicitCapabilityKeys.has(key)) capabilities[key] = "assist";
    }
  }

  let compactPackets = fileConfig.compactPackets ?? DEFAULT_JEV_CONFIG.compactPackets;
  if (env.VITRIS_COMPACT_PACKETS !== undefined) {
    compactPackets = env.VITRIS_COMPACT_PACKETS === "true" || env.VITRIS_COMPACT_PACKETS === "1";
  }
  if (argv.includes("--compact-packets")) {
    compactPackets = true;
  } else if (argv.includes("--no-compact-packets")) {
    compactPackets = false;
  } else if (creativeEfficiency && fileConfig.compactPackets !== false && env.VITRIS_COMPACT_PACKETS !== "false" && env.VITRIS_COMPACT_PACKETS !== "0") {
    compactPackets = true;
  }

  let model = fileConfig.model || DEFAULT_JEV_CONFIG.model;
  if (env.VITRIS_JEV_MODEL?.trim()) {
    model = env.VITRIS_JEV_MODEL.trim();
  }
  const modelIdx = argv.indexOf("--jev-model");
  if (modelIdx >= 0 && argv[modelIdx + 1]?.trim()) {
    model = argv[modelIdx + 1]!.trim();
  }

  const confidenceThresholds = {
    routing: fileConfig.confidenceThresholds?.routing ?? DEFAULT_JEV_CONFIG.confidenceThresholds.routing,
    grounding: fileConfig.confidenceThresholds?.grounding ?? DEFAULT_JEV_CONFIG.confidenceThresholds.grounding,
  };

  // workOwnership — experimental/internal setting. Default "agent".
  // Precedence: CLI > ENV > fileConfig > "agent"
  let workOwnership: JevWorkOwnership = fileConfig.workOwnership ?? "agent";
  const envOwnership = env.VITRIS_JEV_WORK_OWNERSHIP?.toLowerCase();
  if (envOwnership === "agent" || envOwnership === "delegated") {
    workOwnership = envOwnership;
  }
  const ownershipIdx = argv.indexOf("--jev-work-ownership");
  if (ownershipIdx >= 0 && argv[ownershipIdx + 1]) {
    const raw = argv[ownershipIdx + 1]!.toLowerCase();
    if (raw === "agent" || raw === "delegated") {
      workOwnership = raw;
    }
  }

  const config: JevConfig = {
    mode,
    model,
    endpoint: fileConfig.endpoint || env.TYPESAFE_BASE_URL || undefined,
    timeoutMs: fileConfig.timeoutMs ?? DEFAULT_JEV_CONFIG.timeoutMs,
    taskDeadlineMs: fileConfig.taskDeadlineMs ?? DEFAULT_JEV_CONFIG.taskDeadlineMs,
    maxConcurrency: fileConfig.maxConcurrency ?? DEFAULT_JEV_CONFIG.maxConcurrency,
    maxRetries: fileConfig.maxRetries ?? DEFAULT_JEV_CONFIG.maxRetries,
    confidenceThresholds,
    compactPackets,
    cache: fileConfig.cache || { enabled: true, dir: join(root, "agent/decisions/jev/cache") },
    budget: fileConfig.budget || {},
    capabilities,
    telemetry: fileConfig.telemetry || { enabled: true, receiptDir: join(root, "agent/decisions/jev") },
    workOwnership,
    pilotBudget: fileConfig.pilotBudget || { ...DEFAULT_PILOT_BUDGET },
    calibrationGates: fileConfig.calibrationGates || [],
    taskApplicability: fileConfig.taskApplicability || [],
  };

  validateJevConfig(config);
  return config;
}

/**
 * Validates all enum/numeric values in a JevConfig. Throws with a descriptive error on invalid values.
 * Call after loading config before any usage.
 */
export function validateJevConfig(config: JevConfig): void {
  const validModes = ["off", "shadow", "assist"];
  if (!validModes.includes(config.mode)) {
    throw new Error(`Invalid JevConfig.mode: "${config.mode}". Allowed: off, shadow, assist.`);
  }
  if (config.workOwnership !== undefined && !["agent", "delegated"].includes(config.workOwnership)) {
    throw new Error(`Invalid JevConfig.workOwnership: "${config.workOwnership}". Allowed: agent, delegated.`);
  }
  if (config.capabilities) {
    for (const [key, val] of Object.entries(config.capabilities)) {
      if (!validModes.includes(val as string)) {
        throw new Error(`Invalid JevConfig.capabilities.${key}: "${val}". Allowed: off, shadow, assist.`);
      }
    }
  }
  if (config.confidenceThresholds) {
    const { routing, grounding } = config.confidenceThresholds;
    if (typeof routing !== "number" || routing < 0 || routing > 1) {
      throw new Error(`Invalid JevConfig.confidenceThresholds.routing: ${routing}. Must be [0, 1].`);
    }
    if (typeof grounding !== "number" || grounding < 0 || grounding > 1) {
      throw new Error(`Invalid JevConfig.confidenceThresholds.grounding: ${grounding}. Must be [0, 1].`);
    }
  }
  if (config.pilotBudget) {
    if (typeof config.pilotBudget.maxTransportAttempts !== "number" || config.pilotBudget.maxTransportAttempts <= 0) {
      throw new Error(`Invalid JevConfig.pilotBudget.maxTransportAttempts: ${config.pilotBudget.maxTransportAttempts}. Must be a positive number.`);
    }
    if (typeof config.pilotBudget.maxInputTokens !== "number" || config.pilotBudget.maxInputTokens <= 0) {
      throw new Error(`Invalid JevConfig.pilotBudget.maxInputTokens: ${config.pilotBudget.maxInputTokens}. Must be a positive number.`);
    }
  }
}

/** Returns the effective mode for a capability, clamped to the global mode ceiling. */
export function resolveCapability(
  config: JevConfig,
  capability: keyof JevCapabilityConfig
): JevMode {
  const modeRank: Record<JevMode, number> = { off: 0, shadow: 1, assist: 2 };
  const globalMode = config.mode;
  const capMode = config.capabilities?.[capability] ?? "off";
  // Capability cannot exceed global mode
  return modeRank[capMode] <= modeRank[globalMode] ? capMode : globalMode;
}

/** Checks whether a capability is active at the required mode level or above. */
export function isCapabilityActive(
  config: JevConfig,
  capability: keyof JevCapabilityConfig,
  requiredMode: JevMode = "shadow"
): boolean {
  const modeRank: Record<JevMode, number> = { off: 0, shadow: 1, assist: 2 };
  const effective = resolveCapability(config, capability);
  return modeRank[effective] >= modeRank[requiredMode];
}

/**
 * Resolves all capability modes clamped to the global mode ceiling.
 * Includes WS5 and WS7 capabilities.
 */
export function resolveEffectiveCapabilities(config: JevConfig): JevCapabilityConfig {
  return {
    mediaClassification: resolveCapability(config, "mediaClassification"),
    mediaSelection: resolveCapability(config, "mediaSelection"),
    mediaSetReview: resolveCapability(config, "mediaSetReview"),
    mediaProvenance: resolveCapability(config, "mediaProvenance"),
    grounding: resolveCapability(config, "grounding"),
    sourceSelection: resolveCapability(config, "sourceSelection"),
    retrievalRanking: resolveCapability(config, "retrievalRanking"),
    consistency: resolveCapability(config, "consistency"),
    repairAssistance: resolveCapability(config, "repairAssistance"),
    preferenceScoring: resolveCapability(config, "preferenceScoring"),
    // Workstream 5
    claimStrengthening: resolveCapability(config, "claimStrengthening"),
    ctaFidelity: resolveCapability(config, "ctaFidelity"),
    crossStageContinuity: resolveCapability(config, "crossStageContinuity"),
    coverageCheck: resolveCapability(config, "coverageCheck"),
    // Workstream 7
    creativeScoring: resolveCapability(config, "creativeScoring"),
    componentSelection: resolveCapability(config, "componentSelection"),
    compositionCheck: resolveCapability(config, "compositionCheck"),
    lessonRanking: resolveCapability(config, "lessonRanking"),
    visitorQuestionCheck: resolveCapability(config, "visitorQuestionCheck"),
    factContradictionCheck: resolveCapability(config, "factContradictionCheck"),
    ctaFitCheck: resolveCapability(config, "ctaFitCheck"),
    repetitionExplanationCheck: resolveCapability(config, "repetitionExplanationCheck"),
    directionContinuityCheck: resolveCapability(config, "directionContinuityCheck"),
  };
}

const TREATMENT_CAP_KEYS: (keyof JevCapabilityConfig)[] = [
  "mediaClassification", "mediaSelection", "mediaSetReview", "mediaProvenance",
  "grounding", "sourceSelection", "retrievalRanking", "consistency", "repairAssistance",
  "preferenceScoring", "claimStrengthening", "ctaFidelity", "crossStageContinuity",
  "coverageCheck", "creativeScoring", "componentSelection", "compositionCheck",
  "lessonRanking", "visitorQuestionCheck", "factContradictionCheck", "ctaFitCheck",
  "repetitionExplanationCheck", "directionContinuityCheck",
];

/** Callers that would actually invoke Jev given the effective (mode-clamped) capabilities. */
export function enabledJevCallers(config: JevConfig): string[] {
  const caps = resolveEffectiveCapabilities(config);
  const callers: string[] = [];
  if (caps.mediaClassification !== "off") callers.push("media");
  if (caps.mediaSelection !== "off") callers.push("direction", "storyboard");
  if (caps.mediaSetReview !== "off") callers.push("representative", "visual-review");
  if (caps.mediaProvenance !== "off") callers.push("representative", "content-review");
  if (caps.grounding !== "off") callers.push("business-review", "narrative-review", "copy-review");
  if (caps.sourceSelection !== "off" || caps.retrievalRanking !== "off") callers.push("business");
  if (caps.claimStrengthening !== "off" || caps.ctaFidelity !== "off" || caps.coverageCheck !== "off" || caps.crossStageContinuity !== "off") {
    callers.push("copy-review", "content-review");
  }
  if (caps.creativeScoring !== "off") callers.push("direction");
  if (caps.componentSelection !== "off") callers.push("representative", "pages");
  if (caps.compositionCheck !== "off") callers.push("storyboard", "representative");
  if (caps.lessonRanking !== "off" || caps.directionContinuityCheck !== "off") callers.push("direction");
  if (caps.visitorQuestionCheck !== "off" || caps.factContradictionCheck !== "off" || caps.ctaFitCheck !== "off" || caps.repetitionExplanationCheck !== "off") {
    callers.push("copy", "content-review");
  }
  if (caps.repairAssistance !== "off") callers.push("copy", "pages");
  return [...new Set(callers)];
}

export function capabilitiesFullyOff(caps: JevCapabilityConfig): boolean {
  return TREATMENT_CAP_KEYS.every(k => (caps[k] || "off") === "off");
}

/** Capabilities that issue a Jev request. Global mode still clamps each one. */
const JEV_CLIENT_CAPABILITIES: (keyof JevCapabilityConfig)[] = [
  "mediaClassification", "mediaSelection", "mediaSetReview", "mediaProvenance",
  "grounding",
  "sourceSelection",
  "retrievalRanking",
  "coverageCheck",
  "ctaFidelity",
  "claimStrengthening",
  "crossStageContinuity",
  "creativeScoring",
  "componentSelection",
  "compositionCheck",
  "lessonRanking",
  "visitorQuestionCheck",
  "factContradictionCheck",
  "ctaFitCheck",
  "repetitionExplanationCheck",
  "directionContinuityCheck",
];

export function jevClientRequired(config: JevConfig): boolean {
  if (config.mode === "off") return false;
  const caps = resolveEffectiveCapabilities(config);
  return JEV_CLIENT_CAPABILITIES.some(key => caps[key] !== "off");
}

export function nonTreatmentFingerprint(config: JevConfig): string {
  return JSON.stringify({
    model: config.model,
    compactPackets: config.compactPackets,
    workOwnership: config.workOwnership ?? "agent",
    confidenceThresholds: config.confidenceThresholds,
    timeoutMs: config.timeoutMs,
    taskDeadlineMs: config.taskDeadlineMs,
    maxConcurrency: config.maxConcurrency,
    maxRetries: config.maxRetries,
    pilotBudget: config.pilotBudget,
  });
}

/**
 * Returns the effective configuration without secrets (no API key, no tokens).
 * Suitable for logging, snapshotting in preparations, and debugging.
 * Endpoint intentionally omitted as it may reveal internal routing.
 */
export function exposeEffectiveConfig(config: JevConfig): Record<string, unknown> {
  return {
    mode: config.mode,
    model: config.model,
    timeoutMs: config.timeoutMs,
    taskDeadlineMs: config.taskDeadlineMs,
    maxConcurrency: config.maxConcurrency,
    maxRetries: config.maxRetries,
    confidenceThresholds: config.confidenceThresholds,
    compactPackets: config.compactPackets,
    capabilities: config.capabilities,
    workOwnership: config.workOwnership ?? "agent",
    pilotBudget: config.pilotBudget,
    calibrationGates: config.calibrationGates,
    taskApplicability: config.taskApplicability,
  };
}

/**
 * Returns a snapshot of effective capabilities (clamped to global mode) plus workOwnership,
 * suitable for storing in StagePreparation.capabilitiesSnapshot.
 */
export function snapshotEffectiveConfig(config: JevConfig): Record<string, string> {
  const caps = resolveEffectiveCapabilities(config);
  const snapshot: Record<string, string> = {};
  for (const [k, v] of Object.entries(caps)) {
    snapshot[k] = v;
  }
  snapshot["_workOwnership"] = config.workOwnership ?? "agent";
  snapshot["_mode"] = config.mode;
  return snapshot;
}
