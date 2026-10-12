import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDurableLeaseHeld, withMutationLock } from "./preparation.ts";

export interface WorkflowConfig {
  schemaVersion: 1;
  executionMode: "active-agent" | "external-worker";
}

export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  schemaVersion: 1,
  executionMode: "active-agent",
};

/** Load existing agent/workflow.json or return default active-agent configuration. */
export function loadWorkflowConfig(root: string): WorkflowConfig {
  const configPath = join(root, "agent/workflow.json");
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, "utf8"));
      if (parsed && parsed.executionMode) {
        return parsed as WorkflowConfig;
      }
    } catch {}
  }
  return { ...DEFAULT_WORKFLOW_CONFIG };
}

/** Save agent/workflow.json configuration with mutation lock. */
export function saveWorkflowConfig(root: string, config: WorkflowConfig): void {
  const configPath = join(root, "agent/workflow.json");
  mkdirSync(join(root, "agent"), { recursive: true });
  withMutationLock(root, () => {
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  });
}


/**
 * Ensures agent/workflow.json exists with valid defaults.
 */
export function ensureWorkflowConfig(root: string): { config: WorkflowConfig; quarantinedAdapters: string[] } {
  const configPath = join(root, "agent/workflow.json");
  mkdirSync(join(root, "agent"), { recursive: true });

  return withMutationLock(root, () => {
    let config: WorkflowConfig;
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, "utf8"));
      } catch {
        config = { ...DEFAULT_WORKFLOW_CONFIG };
        writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
      }
    } else {
      config = { ...DEFAULT_WORKFLOW_CONFIG };
      writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    }

    return { config, quarantinedAdapters: [] };
  });
}

/**
 * Quarantines legacy adapter files to dated backups, ensuring active runners/leases are never disrupted.
 */
export function quarantineLegacyAdapters(root: string): string[] {
  return withMutationLock(root, () => {
    const quarantined: string[] = [];
    const isRunnerActive = existsSync(join(root, "agent/RUN.lock")) || isDurableLeaseHeld(root, "workflow");

    if (!isRunnerActive) {
      const legacyAdapterPath = join(root, "agent/adapter.json");
      const legacyReviewerPath = join(root, "agent/adapter.reviewer.json");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      if (existsSync(legacyAdapterPath)) {
        const backupPath = join(root, "agent", `adapter.backup-${timestamp}.json`);
        try {
          renameSync(legacyAdapterPath, backupPath);
          quarantined.push(backupPath);
        } catch {}
      }

      if (existsSync(legacyReviewerPath)) {
        const backupPath = join(root, "agent", `adapter.reviewer.backup-${timestamp}.json`);
        try {
          renameSync(legacyReviewerPath, backupPath);
          quarantined.push(backupPath);
        } catch {}
      }
    }
    return quarantined;
  });
}

/**
 * Validates that the execution mode is active-agent.
 * Unconditionally rejects external-worker dispatch without fallback.
 */
export function enforceActiveAgentMode(config: WorkflowConfig): void {
  if (config.executionMode !== "active-agent") {
    throw new Error(
      `Unsupported execution mode: "${config.executionMode}". Active-agent execution is the default. Vitris will not spawn external model workers or fallback to Codex.`
    );
  }
}
