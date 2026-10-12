import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface NodeObservation {
  schemaVersion: 1;
  preparationId: string;
  nodeId: string;
  packetBytes?: number;
  packetTokenEstimate?: number;
  agentInputTokens?: number | "unknown";
  agentOutputTokens?: number | "unknown";
  agentTurns?: number | "unknown";
  toolUse?: number | "unknown";
  repairs?: number;
  jevQuestions?: number;
  jevBatches?: number;
  jevAttempts?: number;
  jevCacheHits?: number;
  jevTokens?: number | "unknown";
  jevLatencyMs?: number;
  deterministicGates?: Record<string, boolean | string>;
  goalCoverage?: { total: number; missing: number };
  artifactHashes?: Record<string, string>;
  recordedAt: string;
}

export function writeNodeObservation(root: string, obs: Omit<NodeObservation, "schemaVersion" | "recordedAt">): string {
  const full: NodeObservation = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    ...obs,
    agentInputTokens: obs.agentInputTokens ?? "unknown",
    agentOutputTokens: obs.agentOutputTokens ?? "unknown",
    agentTurns: obs.agentTurns ?? "unknown",
    toolUse: obs.toolUse ?? "unknown",
    jevTokens: obs.jevTokens ?? "unknown",
  };
  const dir = join(root, "agent/runs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${obs.preparationId}.observation.json`);
  writeFileSync(path, JSON.stringify(full, null, 2), "utf8");
  return path;
}
