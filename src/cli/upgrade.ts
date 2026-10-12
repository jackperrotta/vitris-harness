import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { json, save } from "../agent/artifacts.ts";
import { applyKitUpgrade, planKitUpgrade, recoverKitUpgrade, rollbackKitUpgrade, type KitUpgradePlan } from "../upgrade/kit.ts";
import { findHarnessRoot } from "./root.ts";
import { EXIT_CODES, type CommandResult } from "./types.ts";

export type UpgradeOptions = { site?: string; target?: string; to?: string; apply?: boolean; rollback?: boolean; recover?: boolean };

/** Managed-kit upgrade only; dependency installation remains an explicit npm operation. */
export function upgradeSite(opts: UpgradeOptions): CommandResult {
  const root = resolve(opts.site || "."), target = resolve(opts.target || findHarnessRoot());
  try {
    if (opts.recover) {
      const result = recoverKitUpgrade(root);
      return { ok: true, exitCode: EXIT_CODES.SUCCESS, summary: `Kit recovery: ${result.status}`, data: result };
    }
    if (opts.rollback) {
      const result = rollbackKitUpgrade(root);
      return { ok: true, exitCode: EXIT_CODES.SUCCESS, summary: "Managed kit rolled back", data: result };
    }
    const version = JSON.parse(readFileSync(join(target, "package.json"), "utf8")).version as string;
    if (opts.to && opts.to !== version) throw new Error(`Target ${opts.to} is unavailable at ${target}; provide an installed package directory with --target`);
    if (opts.apply) {
      const path = join(root, "agent/kit-upgrade-plan.json");
      if (!existsSync(path)) throw new Error("Run upgrade --plan before --apply");
      const plan = json<KitUpgradePlan>(path);
      const result = applyKitUpgrade(root, target, plan);
      return { ok: true, exitCode: EXIT_CODES.SUCCESS, summary: `Managed kit updated to ${version}; existing graph progress retained`, data: result };
    }
    const plan = planKitUpgrade(root, target);
    save(join(root, "agent/kit-upgrade-plan.json"), plan);
    return { ok: plan.conflicts.length === 0, exitCode: plan.conflicts.length ? EXIT_CODES.PRECONDITION_FAILED : EXIT_CODES.SUCCESS,
      summary: `Managed kit plan: ${plan.updates.length} updates, ${plan.additions.length} additions, ${plan.conflicts.length} conflicts`, data: plan };
  } catch (error) {
    return { ok: false, exitCode: EXIT_CODES.PRECONDITION_FAILED, error: error instanceof Error ? error.message : String(error) };
  }
}
