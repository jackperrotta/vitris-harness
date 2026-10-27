import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { files, fingerprint, json, save } from "./artifacts.ts";
import { initialState, invalidate, parseGraphYaml, type AgentState, type SkillGraph } from "./graph.ts";
import { gradeAll, gradeHarvest } from "./grade.ts";
import { finish, inputHash, loadState } from "./runner.ts";
import { validateAddedMedia, type AddedMediaBinding, type AddedMediaFinding } from "./added-media.ts";
import { applyArtDirectionGraph } from "./art-direction-policy.ts";
import { copyAllowlist, scaffoldNestedSite } from "./design-copy.ts";
import { runWorkflow } from "./workflow.ts";
import { sourceManifest } from "./source-manifest.ts";
import { aggregateAgentUsage, loadAgentAttemptReceipts } from "./jev/agent-usage.ts";
import { invocationSpend } from "./invocation-budget.ts";
import { acquireMutationLock, findActivePreparation, invalidatePreparation, loadPreparation, preparedProductionOwner, releaseDurableLease } from "./preparation.ts";
import { DEFAULT_JEV_CAPABILITIES, DEFAULT_JEV_MODEL, loadJevConfig, mergeJevConfig, type JevConfig } from "./jev/config.ts";

export const TRIAL_CAPTURE_PATHS = ["onboarding/brief.json", "onboarding/copy", "onboarding/raw", "onboarding/stills", "onboarding/harvest-inventory.json", "onboarding/harvest-scope.json", "media"];
type TrialStatus = "prepared" | "awaiting_agent" | "needs_repair" | "blocked" | "verified_preview" | "inputs_changed";
export type TrialRun = {
  index: number; root: string; status: TrialStatus; passed: boolean; configHash: string;
  history: { at: string; status: TrialStatus; exitCode: number; iteration: number; durationMs: number }[];
  interventions: { at: string; reason: string }[];
  usage?: ReturnType<typeof aggregateAgentUsage>;
  reviewerUsage?: ReturnType<typeof invocationSpend>;
  acceptedAddedMedia?: AddedMediaBinding[];
  integrityFindings?: AddedMediaFinding[];
};
type FrozenFile = { path: string; sha256: string };
type TrialTreatment = Pick<JevConfig, "mode" | "model" | "workOwnership" | "capabilities" | "pilotBudget" | "compactPackets"> & { endpointHash: string };
export type TrialSession = { version: 4 | 5; createdAt: string; capture: string; captureHash: string; captureFiles: FrozenFile[]; kernelHash: string; kernel: string; treatment: TrialTreatment; treatmentHash: string; request: {theme?: string; workflowArgv: string[]}; results: TrialRun[] };
const configPaths = ["launch.json", "agent/graph.yaml", "agent/workflow.json", "agent/adapter.reviewer.json", "agent/jev.json", "agent/request.json"];
const capturePaths = TRIAL_CAPTURE_PATHS.filter(path => path !== "media");
const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const mediaFiles = (root: string): FrozenFile[] => files(join(root, "media")).map(path => ({path: relative(root, path).replaceAll("\\", "/"), sha256: digest(path)}));
const treatmentOf = (config: JevConfig): TrialTreatment => ({ mode: config.mode, model: config.model, workOwnership: config.workOwnership || "agent", capabilities: config.capabilities, pilotBudget: config.pilotBudget, compactPackets: config.compactPackets, endpointHash: createHash("sha256").update(config.endpoint || "").digest("hex") });
const treatmentHash = (value: TrialTreatment) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function mediaUnchanged(root: string, originals: FrozenFile[]): boolean {
  const originalPaths = new Set(originals.map(file => file.path));
  if (originals.some(file => !existsSync(join(root, file.path)) || digest(join(root, file.path)) !== file.sha256)) return false;
  const added = mediaFiles(root).filter(file => !originalPaths.has(file.path));
  if (!added.length) return true;
  const inventoryPath = join(root, "onboarding/media-inventory.json");
  if (!existsSync(inventoryPath)) return false;
  const inventory = json<{assets?: {path?: string; sha256?: string; origin?: string; sources?: string[]}[]}>(inventoryPath);
  return added.every(file => {
    if (!/^media\/(stock|recovered)\//.test(file.path)) return false;
    return inventory.assets?.some(asset => {
      if (!asset.sources?.length || asset.origin !== (file.path.startsWith("media/stock/") ? "stock" : "customer")) return false;
      if (asset.path?.replace(/^\//, "") === file.path) return asset.sha256 === file.sha256;
      const poster = (asset as {poster?: string}).poster?.replace(/^\//, "");
      return poster === file.path && file.path.split("/").pop()?.startsWith(file.sha256);
    }) || false;
  });
}
function inputsUnchanged(session: TrialSession, root: string): boolean {
  return fingerprint(session.capture, capturePaths) === session.captureHash
    && JSON.stringify(mediaFiles(session.capture)) === JSON.stringify(session.captureFiles)
    && fingerprint(root, capturePaths) === session.captureHash
    && mediaUnchanged(root, session.captureFiles);
}
function immutableInputsUnchanged(session: TrialSession, root: string): boolean {
  return fingerprint(session.capture, capturePaths) === session.captureHash
    && JSON.stringify(mediaFiles(session.capture)) === JSON.stringify(session.captureFiles)
    && fingerprint(root, capturePaths) === session.captureHash
    && session.captureFiles.every(file => existsSync(join(root, file.path)) && digest(join(root, file.path)) === file.sha256);
}
function additions(session: TrialSession, root: string, run: TrialRun) {
  const inventoryPath = join(root, "onboarding/media-inventory.json");
  const inventory = existsSync(inventoryPath) ? json<import("./artifacts.ts").MediaInventory>(inventoryPath) : undefined;
  return validateAddedMedia(root, inventory, new Set(session.captureFiles.map(file => file.path)), run.acceptedAddedMedia || []);
}
export function reopenMediaForAdded(graph: SkillGraph, state: AgentState, checked: ReturnType<typeof validateAddedMedia>, accepted: AddedMediaBinding[], root?: string): boolean {
  const hasNewBinding = checked.bindings.some(binding => !accepted.some(old => old.path === binding.path));
  const affected = [...checked.findings.map(f => f.path), ...checked.bindings.filter(b => !accepted.some(a => a.path === b.path)).map(b => b.path)];
  const productionStarted = (state.nodes["asset-production"]?.attempts || 0) > 0
    || Boolean(root && preparedProductionOwner(root, graph.version));
  const owner = graph.nodes.some(n => n.id === "asset-production") && affected.length && affected.every(p => /^media\/(generated|derived)\//.test(p) || (productionStarted && /^media\/stock\//.test(p))) ? "asset-production" : "media";
  if (state.nodes[owner]?.status !== "done" || (!checked.findings.length && !hasNewBinding)) return false;
  invalidate(graph, state, owner);
  state.nodes[owner]!.failures = checked.findings.map(finding => `[${finding.code}] ${finding.path}: ${finding.explanation}`);
  return true;
}

export function completedMediaCoversAdditions(root: string, graph: SkillGraph, state: AgentState, bindings: AddedMediaBinding[]): boolean {
  const owner = state.nodes["asset-production"]?.status === "done" && bindings.every(b => /^media\/(generated|derived|stock)\//.test(b.path)) ? "asset-production" : "media";
  const node = graph.nodes.find(candidate => candidate.id === owner);
  const completed = state.nodes[owner];
  if (!node || !completed || completed.status !== "done" || !completed.attempts) return false;
  if (!node.writes.includes("onboarding/media-inventory.json")) return false;
  if (!bindings.every(binding => node.writes.some(write => binding.path === write || binding.path.startsWith(`${write}/`)))) return false;
  if (completed.inputHash !== inputHash(root, node) || completed.outputHash !== fingerprint(root, node.writes)) return false;
  const dir = join(root, "agent/preparations");
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some(name => {
    if (!name.endsWith(".json")) return false;
    const prep = loadPreparation(root, name.slice(0, -5));
    return prep?.nodeId === owner && prep.status === "consumed" && prep.result?.ok === true
      && prep.attempt === completed.attempts && prep.graphVersion === graph.version;
  });
}

export function createTrialSession(opts: { kernel: string; capture: string; out: string; runs: number; theme?: string; reviewer?: unknown; jev?: Partial<JevConfig>; workflowArgv?: string[]; sitePolicy?: {artDirection?: {mode:"media-v1";release:string}; designReferences?: {mode:"lessons";release:string;manifestHash?:string;teachingManifestHash?:string}; designAuthoring?: {mode:"theme-v1"|"composition-v1";lessonRelease?:string}} }): TrialSession {
  if (!Number.isSafeInteger(opts.runs) || opts.runs < 1 || opts.runs > 10) throw new Error("runs must be 1–10");
  const kernel = resolve(opts.kernel), capture = resolve(opts.capture), out = resolve(opts.out);
  const rel = relative(capture, out);
  if (existsSync(out) || (!isAbsolute(rel) && !rel.startsWith(".."))) throw new Error("Use a new trial directory outside the capture");
  const grade = gradeHarvest(capture);
  if (!grade.ok) throw new Error(`Ineligible capture: ${grade.failures.join("; ")}`);
  const brief = json<{ business?: {name?: string} }>(join(capture, "onboarding/brief.json"));
  if (opts.jev?.workOwnership && opts.jev.workOwnership !== "agent") throw new Error("Trial treatment requires active-agent work ownership");
  if (opts.jev && Object.keys(opts.jev).some(key => !["mode", "model", "workOwnership", "capabilities", "pilotBudget", "compactPackets"].includes(key))) throw new Error("Trial Jev config contains an unsupported or credential-bearing field");
  if (opts.jev?.capabilities && Object.keys(opts.jev.capabilities).some(key => !(key in DEFAULT_JEV_CAPABILITIES))) throw new Error("Trial Jev config contains an unknown capability");
  const treatment = treatmentOf(mergeJevConfig({mode: "off", model: DEFAULT_JEV_MODEL, ...opts.jev, workOwnership: "agent"}, [], {}, out));
  treatment.endpointHash = createHash("sha256").update(process.env.TYPESAFE_BASE_URL || "").digest("hex");
  const session: TrialSession = { version: 5, createdAt: new Date().toISOString(), kernel, capture, captureHash: fingerprint(capture, capturePaths), captureFiles: mediaFiles(capture), kernelHash: sourceManifest(kernel).hash, treatment, treatmentHash: treatmentHash(treatment), request: {theme: opts.theme, workflowArgv: opts.workflowArgv || []}, results: [] };
  mkdirSync(out, {recursive: true});
  save(join(out, "trials.json"), session);
  for (let index = 1; index <= opts.runs; index++) {
    const root = join(out, `run-${index}`);
    scaffoldNestedSite({ dest: root, kernel, parent: capture, slug: `trial-${index}`, name: brief.business?.name || "Trial" });
    copyAllowlist(capture, root, TRIAL_CAPTURE_PATHS);
    if(opts.sitePolicy){const launch=json<Record<string,unknown>>(join(root,"launch.json"));for(const [key,value]of Object.entries(opts.sitePolicy)){if(!["artDirection","designReferences","designAuthoring"].includes(key))throw new Error("Unsupported pinned site policy");launch[key]=value;}save(join(root,"launch.json"),launch);}
    for (const name of ["adapter.json", "adapter.reviewer.json"]) { const path = join(root, "agent", name); if (existsSync(path)) unlinkSync(path); }
    save(join(root, "agent/jev.json"), treatment);
    if (opts.reviewer) save(join(root, "agent/adapter.reviewer.json"), opts.reviewer);
    if (opts.theme) save(join(root, "agent/request.json"), {mode: "build", theme: opts.theme});
    const graph = applyArtDirectionGraph(root, parseGraphYaml(readFileSync(join(root, "agent/graph.yaml"), "utf8")));
    const state = initialState(graph);
    finish(root, graph, state, graph.nodes.find(n => n.id === "harvest")!, gradeHarvest(root).failures);
    session.results.push({index, root, status: "prepared", passed: false, configHash: fingerprint(root, configPaths), history: [], interventions: [], acceptedAddedMedia: []});
    save(join(out, "trials.json"), session);
  }
  return session;
}

export function readTrialSession(out: string): TrialSession {
  const session = json<TrialSession>(join(out, "trials.json"));
  if (session.version !== 4 && session.version !== 5) throw new Error("Unsupported trial manifest version; start a new trial session");
  return session;
}

export async function advanceTrialSession(out: string, opts: { run?: number; intervention?: string; argv?: string[] } = {}): Promise<TrialSession> {
  const release = acquireMutationLock(out);
  try {
    const session = readTrialSession(out);
    if (opts.argv?.length && JSON.stringify(opts.argv) !== JSON.stringify(session.request.workflowArgv || [])) throw new Error("Trial budget arguments are pinned at creation; start a new protocol for changed limits");
    const selected = opts.run ? session.results.filter(r => r.index === opts.run) : session.results;
    if (!selected.length) throw new Error("Unknown trial run");
    const kernelUnchanged = sourceManifest(session.kernel).hash === session.kernelHash;
    for (const run of selected) {
      if (run.status === "inputs_changed") continue; // Terminal under both versions, even if files were restored.
      const started = Date.now();
      const treatmentUnchanged = session.treatmentHash === treatmentHash(session.treatment) && treatmentHash(treatmentOf(loadJevConfig(run.root, session.request.workflowArgv || []))) === session.treatmentHash;
      const frozenInputsOk = session.version === 4 ? inputsUnchanged(session, run.root) : immutableInputsUnchanged(session, run.root);
      const beforeAdded = session.version === 5 && frozenInputsOk ? additions(session, run.root, run) : undefined;
      const integrity = beforeAdded?.findings.filter(finding => finding.category === "integrity") || [];
      if (!kernelUnchanged || !frozenInputsOk || !treatmentUnchanged || run.configHash !== fingerprint(run.root, configPaths) || integrity.length) {
        run.status = "inputs_changed"; run.passed = false;
        if (integrity.length) run.integrityFindings = integrity;
        run.history.push({at: new Date().toISOString(), status: run.status, exitCode: 1, iteration: 0, durationMs: Date.now() - started});
        continue;
      }
      if (session.version === 5 && beforeAdded) {
        const graph = applyArtDirectionGraph(run.root, parseGraphYaml(readFileSync(join(run.root, "agent/graph.yaml"), "utf8")));
        const state = loadState(run.root, graph);
        const accepted = run.acceptedAddedMedia || [];
        const newBindings = beforeAdded.bindings.filter(binding => !accepted.some(old => old.path === binding.path));
        if (!beforeAdded.findings.length && newBindings.length && completedMediaCoversAdditions(run.root, graph, state, newBindings)) {
          run.acceptedAddedMedia = beforeAdded.bindings;
          save(join(out, "trials.json"), session);
        }
        if (reopenMediaForAdded(graph, state, beforeAdded, run.acceptedAddedMedia || [], run.root)) {
          save(join(run.root, "agent/STATE.json"), state);
          for (const node of graph.nodes) {
            if (state.nodes[node.id]?.status !== "pending") continue;
            const prep = findActivePreparation(run.root, node.id);
            if (!prep) continue;
            invalidatePreparation(run.root, prep.id, "Media inputs changed after preparation");
            releaseDurableLease(run.root, `stage-${node.id}`, prep.ownerToken);
          }
        }
      }
      if (opts.intervention) run.interventions.push({at: new Date().toISOString(), reason: opts.intervention});
      const result = await runWorkflow({root: run.root, kernel: session.kernel, argv: [...(session.request.workflowArgv || []), "--no-preview-server"], onLog: () => {}});
      const afterAdded = session.version === 5 ? additions(session, run.root, run) : undefined;
      const afterIntegrity = afterAdded?.findings.filter(finding => finding.category === "integrity") || [];
      const stillFrozen = sourceManifest(session.kernel).hash === session.kernelHash && (session.version === 4 ? inputsUnchanged(session, run.root) : immutableInputsUnchanged(session, run.root)) && run.configHash === fingerprint(run.root, configPaths) && treatmentHash(treatmentOf(loadJevConfig(run.root, session.request.workflowArgv || []))) === session.treatmentHash && !afterIntegrity.length;
      if (afterIntegrity.length) run.integrityFindings = afterIntegrity;
      if (session.version === 5 && afterAdded && !afterAdded.findings.length && completedMediaCoversAdditions(run.root, result.graph, result.state, afterAdded.bindings.filter(b => !(run.acceptedAddedMedia || []).some(a => a.path === b.path)))) run.acceptedAddedMedia = afterAdded.bindings;
      run.passed = stillFrozen && result.exitCode === 0 && result.state.preview_ready && gradeAll(run.root).every(g => g.ok);
      run.status = !stillFrozen ? "inputs_changed" : run.passed ? "verified_preview" : result.state.status === "needs_repair" ? "needs_repair" : result.exitCode ? "blocked" : "awaiting_agent";
      run.usage = aggregateAgentUsage(loadAgentAttemptReceipts(run.root), result.graph.nodes.filter(n => !n.optional && n.kind !== "tool").map(n => n.id));
      run.reviewerUsage = invocationSpend(run.root);
      run.history.push({at: new Date().toISOString(), status: run.status, exitCode: result.exitCode, iteration: result.state.iteration, durationMs: Date.now() - started});
      save(join(out, "trials.json"), session);
    }
    save(join(out, "trials.json"), session);
    return session;
  } finally { release(); }
}
