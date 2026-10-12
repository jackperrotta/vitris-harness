import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { save } from "../agent/artifacts.ts";
import { loadState } from "../agent/runner.ts";
import { parseGraphYaml } from "../agent/graph.ts";
import { beginChange, classifyChange, parseFeedback, prepareRefine, verifyRefine, amendRefineScopes, type ChangeScope, type PrepareRefineResult, type VerifyRefineResult } from "../agent/refine.ts";
import { runWorkflow } from "../agent/workflow.ts";
import { prepareChange, verifyChange } from "../engine/index.ts";
import { parseChangePlan, type ChangeResultRecord } from "../engine/contracts.ts";
import { findKernelRoot } from "./root.ts";
import { EXIT_CODES, type CommandResult, type ExitCode } from "./types.ts";
import type { JevTransport } from "../agent/jev/types.ts";

const kernelRoot = findKernelRoot();

export async function refineAmend(opts:{site?:string;requestId:string;scope:string;reason:string;dryRun?:boolean}):Promise<CommandResult>{
 const root=resolve(opts.site||'.');
 if(opts.dryRun)return {ok:true,exitCode:EXIT_CODES.SUCCESS,summary:`[dry-run] Expand ${opts.requestId} to ${opts.scope}; preserve its original baseline.`};
 const request=amendRefineScopes(root,opts.requestId,opts.scope.split(',').map(s=>s.trim()) as ChangeScope[],opts.reason);
 return {ok:true,exitCode:EXIT_CODES.SUCCESS,summary:`Refinement scope recorded: ${request.scopes!.join(', ')}. Original instruction and baseline preserved.`};
}

export type RefineOptions = {
  site?: string;
  request: string;
  scope?: string;
  evidence?: string;
  dryRun?: boolean;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
  workflowArgv?: string[];
  jevFetch?: JevTransport;
};

export async function refineSite(opts: RefineOptions): Promise<CommandResult<{ scope: string; summary?: string }>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Site root not found: ${root}`,
    };
  }

  const instruction = (opts.request || "").trim();
  if (!instruction) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: "refine requires a --request instruction",
    };
  }

  const classified = classifyChange(instruction);
  const feedback = parseFeedback(instruction);
  const effectiveScope = (opts.scope && opts.scope !== "auto") ? opts.scope : classified.scope;

  if (opts.dryRun) {
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `[dry-run] Classified scope: ${classified.scope} (effective: ${effectiveScope})\nRationale: ${classified.rationale}\nProposed changes: ${classified.proposedChanges.join("; ")}`,
      data: { scope: effectiveScope },
    };
  }

  if (opts.signal?.aborted) {
    return {
      ok: false,
      exitCode: EXIT_CODES.ABORTED,
      error: "Refinement aborted by signal before execution",
    };
  }

  const graphPath = join(root, "agent/graph.yaml");
  if (!existsSync(graphPath)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: "Missing agent/graph.yaml in site root",
    };
  }
  const graph = parseGraphYaml(readFileSync(graphPath, "utf8"));
  const state = loadState(root, graph);

  beginChange({
    root,
    graph,
    state,
    instruction,
    scopeFlag: opts.scope,
  });
  save(join(root, "agent/STATE.json"), state);

  const result = await runWorkflow({
    root,
    kernel: kernelRoot,
    argv: ["--site", root, "--no-preview-server", ...(opts.workflowArgv || [])],
    noPreviewServer: true,
    onLog: opts.onLog,
    signal: opts.signal,
    jevFetch: opts.jevFetch,
  });

  const exitCode = result.exitCode as ExitCode;
  const ok = exitCode === 0;
  const completed = ok && result.state.preview_ready;

  return {
    ok,
    exitCode,
    summary: completed
      ? `Refinement applied successfully: ${instruction} (scope: ${effectiveScope})`
      : ok
        ? `Refinement prepared; complete the active stage and run refine verify: ${instruction} (scope: ${effectiveScope})`
        : `Refinement blocked or failed with exit code ${exitCode}`,
    data: { scope: effectiveScope },
  };
}

export type RefinePrepareOptions = {
  site?: string;
  request: string;
  scope?: string;
  requestId?: string;
  planFile?: string;
  dryRun?: boolean;
};

export async function refinePrepare(opts: RefinePrepareOptions): Promise<CommandResult<PrepareRefineResult>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Site root not found: ${root}`,
    };
  }
  const instruction = (opts.request || "").trim();
  if (!instruction) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: "refine prepare requires a --request instruction",
    };
  }
  if (opts.dryRun) {
    const classified = classifyChange(instruction);
    const scope = (opts.scope && opts.scope !== "auto") ? opts.scope : classified.scope;
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `[dry-run] Would prepare refinement for: ${instruction} (scope: ${scope})`,
    };
  }
  if (opts.planFile) {
    const plan = parseChangePlan(JSON.parse(readFileSync(resolve(opts.planFile), "utf8")));
    if (opts.requestId && opts.requestId !== plan.requestId) throw new Error("--request-id differs from plan.requestId");
    const feedback = parseFeedback(instruction);
    const explicitPreferences = [
      ...feedback.likes.map(item => ({ intent: "positive" as const, text: item.text, target: item.path || item.sectionId || item.hook })),
      ...feedback.dislikes.map(item => ({ intent: "negative" as const, text: item.text, target: item.path || item.sectionId || item.hook })),
      ...feedback.preserve.map(item => ({ intent: "preserve" as const, text: item.text, target: item.path || item.sectionId || item.hook })),
    ];
    const prepared = prepareChange(root, { schemaVersion: 1, id: plan.requestId, instruction, origin: "operator",
      baseRevision: plan.baseRevision, requestedScopes: opts.scope && opts.scope !== "auto" ? [opts.scope] : [],
      explicitPreferences, evidence: [] }, plan);
    return { ok: true, exitCode: EXIT_CODES.SUCCESS, summary: `Structured refinement prepared: ${plan.requestId}`,
      data: { requestId: plan.requestId, scope: plan.facets[0]!, scopes: plan.facets,
        classifiedScope: plan.facets[0]!, rationale: "Validated structured plan", affectedPages: plan.targets,
        proposedChanges: plan.acceptanceCriteria.map(item => item.id), impactedNodes: prepared.impactedNodes,
        baselinePath: prepared.baselinePath, drift: { drifted: false, driftedFiles: [], details: [] }, checklist: plan.requiredChecks } };
  }
  const result = prepareRefine({ root, instruction, scope: opts.scope, requestId: opts.requestId });
  return {
    ok: true,
    exitCode: EXIT_CODES.SUCCESS,
    summary: `Refinement prepared for request '${result.requestId}' (scope: ${result.scope}).\n` +
      `Affected pages: ${result.affectedPages.join(", ") || "none"}\n` +
      `Impacted nodes: ${result.impactedNodes.join(", ")}\n` +
      `Baseline saved: ${result.baselinePath}\n` +
      (result.drift.drifted ? `Drift detected: ${result.drift.details.join("; ")}\n` : "Site memory: in sync (no drift)\n") +
      `Verification checklist:\n${result.checklist.map(c => `  - ${c}`).join("\n")}`,
    data: result,
  };
}

export type RefineVerifyOptions = {
  site?: string;
  requestId?: string;
  dryRun?: boolean;
};

export async function refineVerify(opts: RefineVerifyOptions): Promise<CommandResult<VerifyRefineResult | ChangeResultRecord>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Site root not found: ${root}`,
    };
  }
  if (opts.dryRun) {
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `[dry-run] Would run impact verification on site ${root}`,
    };
  }
  const pending = existsSync(join(root, "agent/refine-pending.json"))
    ? JSON.parse(readFileSync(join(root, "agent/refine-pending.json"), "utf8")) as { requestId?: string }
    : undefined;
  const requestId = opts.requestId || pending?.requestId;
  if (requestId && existsSync(join(root, `agent/requests/${requestId}/engine-preparation.json`))) {
    const result = await verifyChange(root, requestId);
    const ok = result.technical === "pass" && result.fulfillment === "pass" && result.design !== "fail";
    return { ok, exitCode: ok ? EXIT_CODES.SUCCESS : EXIT_CODES.GATES_FAILED,
      summary: ok ? `Structured refinement verified: ${requestId}` : `Structured refinement requires further work: ${requestId}`,
      failures: result.unresolved, data: result };
  }
  const result = await verifyRefine({ root, requestId: opts.requestId });
  return {
    ok: result.ok,
    exitCode: result.ok ? EXIT_CODES.SUCCESS : EXIT_CODES.GATES_FAILED,
    summary: result.summary,
    failures: result.failures,
    data: result,
  };
}
