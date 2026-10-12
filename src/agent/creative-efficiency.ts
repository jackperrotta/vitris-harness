import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { json, save } from "./artifacts.ts";
import { loadJevConfig } from "./jev/config.ts";
import { QUESTION_VERSION } from "./jev/questions.ts";
import { POLICY_VERSION } from "./jev/policy.ts";
import type { JevConfig } from "./jev/types.ts";

export type CreativeEfficiencyPolicy = {
  schemaVersion: 1;
  enabled: boolean;
  config: JevConfig;
  endpointHash: string;
  questionVersion: string;
  policyVersion: string;
  packetVersion: string;
  policyHash: string;
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const CREATIVE_PACKET_VERSION = "creative-compact-2";
const explicitFlags = ["--creative-efficiency", "--no-jev", "--jev-mode", "--jev-model", "--compact-packets", "--no-compact-packets", "--jev-work-ownership"];
const comparable = (config: JevConfig) => ({ mode: config.mode, model: config.model, compactPackets: config.compactPackets, capabilities: config.capabilities, workOwnership: config.workOwnership, pilotBudget: config.pilotBudget });

export function createCreativeEfficiencyPolicy(root: string, argv: string[]): CreativeEfficiencyPolicy {
  const enabled = argv.includes("--creative-efficiency");
  const loaded = loadJevConfig(root, argv);
  const config: JevConfig = enabled ? loaded : { ...loaded, mode: "off", compactPackets: false, workOwnership: "agent" };
  const endpointHash = hash(config.endpoint || "");
  const frozen = { ...config, endpoint: undefined };
  const basis = { schemaVersion: 1 as const, enabled, config: frozen, endpointHash, questionVersion: QUESTION_VERSION, policyVersion: POLICY_VERSION, packetVersion: CREATIVE_PACKET_VERSION };
  return { ...basis, policyHash: hash(basis) };
}

export function readCreativeEfficiencyPolicy(root: string, runId: string, argv: string[] = []): { policy: CreativeEfficiencyPolicy; config: JevConfig } {
  const path = join(root, "agent/creative-runs", runId, "efficiency-policy.json");
  if (!existsSync(path)) {
    if (argv.some(flag => explicitFlags.includes(flag))) throw new Error("This creative run predates efficiency policy; start a new run to change Jev or packet settings");
    const policy = createCreativeEfficiencyPolicy(root, []);
    return { policy, config: policy.config };
  }
  const policy = json<CreativeEfficiencyPolicy>(path);
  const { policyHash, ...basis } = policy;
  if (policy.schemaVersion !== 1 || policyHash !== hash(basis)) throw new Error("Frozen creative efficiency policy changed");
  if (policy.questionVersion !== QUESTION_VERSION || policy.policyVersion !== POLICY_VERSION || policy.packetVersion !== CREATIVE_PACKET_VERSION) throw new Error(`Creative packet version ${policy.packetVersion} is incompatible with ${CREATIVE_PACKET_VERSION}; keep the original kernel for an outstanding preparation or start an explicit new run`);
  const loaded = loadJevConfig(root, []);
  if (hash(loaded.endpoint || "") !== policy.endpointHash) throw new Error("Jev endpoint changed since the creative run started");
  if (argv.some(flag => explicitFlags.includes(flag))) {
    const requested = createCreativeEfficiencyPolicy(root, argv);
    if (JSON.stringify(comparable(requested.config)) !== JSON.stringify(comparable(policy.config)) || requested.enabled !== policy.enabled) throw new Error("Creative efficiency flags conflict with the frozen run policy; resume without them or start a new run");
  }
  return { policy, config: { ...policy.config, endpoint: loaded.endpoint } };
}

export function saveCreativeEfficiencyPolicy(root: string, runId: string, policy: CreativeEfficiencyPolicy): void {
  save(join(root, "agent/creative-runs", runId, "efficiency-policy.json"), policy);
}
