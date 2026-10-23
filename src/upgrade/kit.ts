import { createHash, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { files, json, recoverableReplace, save, within } from "../agent/artifacts.ts";
import { hasActiveStageLease, withMutationLock } from "../agent/preparation.ts";
import { sourceRevision } from "../engine/revision.ts";

export interface ManagedKitManifest {
  schemaVersion: 1;
  harnessVersion: string;
  files: Record<string, string>;
}
export interface KitUpgradePlan {
  schemaVersion: 1;
  targetVersion: string;
  sourceRevision: string;
  kitDigest: string;
  targetDigest: string;
  updates: string[];
  additions: string[];
  conflicts: Array<{ path: string; reason: string }>;
  migrations: string[];
  requiredChecks: string[];
  evidenceInvalidation: string[];
}

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const managedPath = (path: string) => path === "graph.yaml" || path === "PROMPT.md" || path === "WORKFLOW.md" ||
  path === "EVALUATION.md" || path === "workflow.json" || path.startsWith("refs/") || path.startsWith("evals/");
const manifestPath = (root: string) => join(root, "agent/managed-files.json");

function kitFiles(agentRoot: string): Record<string, string> {
  const result: Record<string, string> = {};
  const managedRoots = ["graph.yaml", "PROMPT.md", "WORKFLOW.md", "EVALUATION.md", "workflow.json", "refs", "evals"];
  for (const file of managedRoots.flatMap(path => existsSync(join(agentRoot, path)) ? files(join(agentRoot, path)) : [])) {
    const path = relative(agentRoot, file).replaceAll("\\", "/");
    if (managedPath(path)) result[path] = hash(readFileSync(file));
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

export function recordManagedKit(siteRoot: string, harnessRoot: string): ManagedKitManifest {
  const version = json<{ version: string }>(join(harnessRoot, "package.json")).version;
  const target = kitFiles(join(harnessRoot, "agent"));
  const current = kitFiles(join(siteRoot, "agent"));
  const managed = Object.fromEntries(Object.entries(target).filter(([path, digest]) => current[path] === digest));
  const manifest = { schemaVersion: 1 as const, harnessVersion: version, files: managed };
  save(manifestPath(siteRoot), manifest);
  return manifest;
}

export function resolveManagedInstructionWithProvenance(siteRoot: string, harnessRoot: string, path: string): { content: string; provenance: string } {
  if (!managedPath(path) || path.includes("..") || path.startsWith("/")) throw new Error(`Invalid managed instruction path: ${path}`);
  const override = within(siteRoot, `agent/overrides/${path}`);
  if (existsSync(override)) return { content: readFileSync(override, "utf8"), provenance: `override:${path}` };
  const local = within(siteRoot, `agent/${path}`);
  const manifest = existsSync(manifestPath(siteRoot)) ? json<ManagedKitManifest>(manifestPath(siteRoot)) : undefined;
  const localHash = existsSync(local) ? hash(readFileSync(local)) : undefined;
  const packageFile = within(harnessRoot, `agent/${path}`);
  const packageVersion = json<{ version: string }>(join(harnessRoot, "package.json")).version;
  if (manifest?.harnessVersion === packageVersion && manifest.files[path] && localHash === manifest.files[path]
    && existsSync(packageFile) && hash(readFileSync(packageFile)) === manifest.files[path]) return { content: readFileSync(packageFile, "utf8"), provenance: `package:${packageVersion}:${path}` };
  if (existsSync(local)) return { content: readFileSync(local, "utf8"), provenance: `site:${path}` };
  if (existsSync(packageFile)) return { content: readFileSync(packageFile, "utf8"), provenance: `package:${packageVersion}:${path}` };
  throw new Error(`Instruction ${path} is absent from site and package`);
}

export function resolveManagedInstruction(siteRoot: string, harnessRoot: string, path: string): string {
  return resolveManagedInstructionWithProvenance(siteRoot, harnessRoot, path).content;
}

export function planKitUpgrade(siteRoot: string, targetHarnessRoot: string): KitUpgradePlan {
  const root = resolve(siteRoot), target = resolve(targetHarnessRoot);
  if (existsSync(join(root, "agent/kit-upgrade-journal.json"))) throw new Error("Interrupted kit upgrade requires recovery before a new plan");
  const targetVersion = json<{ version: string }>(join(target, "package.json")).version;
  const targetFiles = kitFiles(join(target, "agent"));
  const siteFiles = kitFiles(join(root, "agent"));
  const owned = existsSync(manifestPath(root)) ? json<ManagedKitManifest>(manifestPath(root)).files : {};
  const updates: string[] = [], additions: string[] = [], conflicts: KitUpgradePlan["conflicts"] = [];
  const currentGraph = existsSync(join(root, "agent/graph.yaml")) ? readFileSync(join(root, "agent/graph.yaml"), "utf8") : "";
  const targetGraph = existsSync(join(target, "agent/graph.yaml")) ? readFileSync(join(target, "agent/graph.yaml"), "utf8") : "";
  const graphVersion = (contents: string) => contents.trimStart().startsWith("{")
    ? Number((JSON.parse(contents) as { version?: number }).version || 0)
    : Number(contents.match(/(?:^|\n)version:\s*(\d+)/)?.[1] || 0);
  const currentGraphVersion = graphVersion(currentGraph);
  const targetGraphVersion = graphVersion(targetGraph);
  const completed = existsSync(join(root, "agent/STATE.json")) && Boolean(json<{ preview_ready?: boolean }>(join(root, "agent/STATE.json")).preview_ready);
  const graphOverride = join(root, "agent/overrides/graph.yaml");
  const pinnedGraph = existsSync(graphOverride) && readFileSync(graphOverride, "utf8") === currentGraph;
  const deferGraph = currentGraphVersion > 0 && targetGraphVersion > 0 && currentGraph !== targetGraph
    && (currentGraphVersion !== targetGraphVersion || completed || pinnedGraph);
  for (const [path, targetHash] of Object.entries(targetFiles)) {
    if (path === "graph.yaml" && deferGraph) continue;
    const currentHash = siteFiles[path];
    if (!currentHash) { additions.push(path); continue; }
    if (currentHash === targetHash) continue;
    if (owned[path] && owned[path] === currentHash) updates.push(path);
    else conflicts.push({ path, reason: owned[path] ? "Site customized a previously managed file" : "Unknown copied-kit provenance" });
  }
  return { schemaVersion: 1, targetVersion, sourceRevision: sourceRevision(root).digest,
    kitDigest: hash(JSON.stringify(siteFiles)), targetDigest: hash(JSON.stringify(targetFiles)),
    updates, additions, conflicts, migrations: deferGraph ? [pinnedGraph ? "Explicit site graph override retained; existing workflow progress remains pinned" : `Graph v${currentGraphVersion} to v${targetGraphVersion} deferred; existing workflow progress remains pinned until explicit audit`] : [],
    requiredChecks: ["typecheck", "build", "relevant-site-audit"],
    evidenceInvalidation: ["New or changed checks remain unevaluated until an explicit audit or applicable edit"] };
}

export function applyKitUpgrade(siteRoot: string, targetHarnessRoot: string, plan: KitUpgradePlan) {
  const root = resolve(siteRoot), target = resolve(targetHarnessRoot);
  if (existsSync(join(root, "agent/RUN.lock")) || hasActiveStageLease(root).held) throw new Error("Stop active workflow before upgrading");
  if (plan.conflicts.length) throw new Error(`Upgrade has ${plan.conflicts.length} managed-file conflict(s); preserve and resolve them first`);
  return withMutationLock(root, () => {
    const fresh = planKitUpgrade(root, target);
    if (JSON.stringify(fresh) !== JSON.stringify(plan)) throw new Error("Upgrade baseline changed; create a new plan");
    const transactionId = randomUUID();
    const backup = join(root, "agent-backups", `kit-${transactionId}`);
    mkdirSync(backup, { recursive: true });
    const changed = [...plan.updates, ...plan.additions];
    const priorHashes = kitFiles(join(root, "agent"));
    const targetHashes = kitFiles(join(target, "agent"));
    for (const path of changed) {
      const dest = within(root, `agent/${path}`);
      if (existsSync(dest)) { mkdirSync(dirname(join(backup, path)), { recursive: true }); cpSync(dest, join(backup, path)); }
    }
    const previousManifest = manifestPath(root);
    if (existsSync(previousManifest)) cpSync(previousManifest, join(backup, "managed-files.json"));
    const journalPath = join(root, "agent/kit-upgrade-journal.json");
    save(journalPath, { schemaVersion: 1, transactionId, phase: "installing", backup, changed,
      targetDigest: plan.targetDigest, targetVersion: plan.targetVersion,
      priorHashes: Object.fromEntries(changed.map(path => [path, priorHashes[path] || null])),
      targetHashes: Object.fromEntries(changed.map(path => [path, targetHashes[path]])) });
    for (const path of changed) {
      const dest = within(root, `agent/${path}`), source = within(target, `agent/${path}`);
      mkdirSync(dirname(dest), { recursive: true });
      const staged = `${dest}.stage-${process.pid}`;
      cpSync(source, staged); recoverableReplace(staged, dest);
    }
    const manifest = recordManagedKit(root, target);
    const receiptPath = join(root, "agent/kit-upgrade-receipt.json");
    if (existsSync(receiptPath)) {
      const history = join(root, "agent/kit-upgrade-receipts");
      mkdirSync(history, { recursive: true });
      cpSync(receiptPath, join(history, `${transactionId}-prior.json`));
    }
    save(receiptPath, { schemaVersion: 1, transactionId, targetDigest: plan.targetDigest, targetVersion: plan.targetVersion,
      baselineSourceRevision: plan.sourceRevision, backup, changed, appliedAt: new Date().toISOString(),
      priorHashes: Object.fromEntries(changed.map(path => [path, priorHashes[path] || null])),
      targetHashes: Object.fromEntries(changed.map(path => [path, targetHashes[path]])),
      requiredChecks: plan.requiredChecks, evidenceInvalidation: plan.evidenceInvalidation });
    unlinkSync(journalPath);
    return { status: "applied" as const, backup, changed, manifest };
  });
}

export function recoverKitUpgrade(siteRoot: string) {
  const root = resolve(siteRoot);
  return withMutationLock(root, () => {
    const journalPath = join(root, "agent/kit-upgrade-journal.json");
    if (!existsSync(journalPath)) return { status: "nothing_to_recover" as const };
    const journal = json<{ transactionId?: string; targetDigest?: string; targetVersion?: string; backup: string; changed: string[]; priorHashes: Record<string, string | null>; targetHashes: Record<string, string> }>(journalPath);
    const receiptPath = join(root, "agent/kit-upgrade-receipt.json");
    if (journal.transactionId && existsSync(receiptPath)) {
      const receipt = json<{ transactionId?: string; targetDigest?: string; targetVersion?: string; changed?: string[] }>(receiptPath);
      if (receipt.transactionId === journal.transactionId && receipt.targetDigest === journal.targetDigest
        && receipt.targetVersion === journal.targetVersion && JSON.stringify(receipt.changed) === JSON.stringify(journal.changed)) {
        for (const path of journal.changed) {
          const dest = within(root, `agent/${path}`);
          if (!existsSync(dest) || hash(readFileSync(dest)) !== journal.targetHashes[path]) throw new Error(`Completed upgrade receipt does not match installed ${path}`);
        }
        unlinkSync(journalPath);
        return { status: "applied_receipt_found" as const };
      }
    }
    for (const path of journal.changed) {
      const dest = within(root, `agent/${path}`), current = existsSync(dest) ? hash(readFileSync(dest)) : null;
      if (current !== journal.priorHashes[path] && current !== journal.targetHashes[path]) throw new Error(`Cannot recover ${path}: subsequent edits conflict`);
      const prior = journal.priorHashes[path];
      if (prior && (!existsSync(join(journal.backup, path)) || hash(readFileSync(join(journal.backup, path))) !== prior)) throw new Error(`Recovery backup for ${path} is missing or changed`);
    }
    for (const path of journal.changed) {
      const dest = within(root, `agent/${path}`), prior = journal.priorHashes[path];
      if (prior) {
        const staged = `${dest}.recovery-${process.pid}`;
        cpSync(join(journal.backup, path), staged); recoverableReplace(staged, dest);
      } else if (existsSync(dest)) unlinkSync(dest);
    }
    const oldManifest = join(journal.backup, "managed-files.json");
    if (existsSync(oldManifest)) {
      const staged = `${manifestPath(root)}.recovery-${process.pid}`;
      cpSync(oldManifest, staged); recoverableReplace(staged, manifestPath(root));
    } else if (existsSync(manifestPath(root))) unlinkSync(manifestPath(root));
    unlinkSync(journalPath);
    return { status: "recovered" as const, changed: journal.changed };
  });
}

export function rollbackKitUpgrade(siteRoot: string) {
  const root = resolve(siteRoot);
  return withMutationLock(root, () => {
    const receiptPath = join(root, "agent/kit-upgrade-receipt.json");
    if (!existsSync(receiptPath)) throw new Error("No applied kit upgrade receipt exists");
    const receipt = json<{ backup: string; changed: string[]; priorHashes: Record<string, string | null>; targetHashes: Record<string, string> }>(receiptPath);
    for (const path of receipt.changed) {
      const dest = within(root, `agent/${path}`);
      const current = existsSync(dest) ? hash(readFileSync(dest)) : null;
      if (current !== receipt.targetHashes[path]) throw new Error(`Cannot roll back ${path}: it has changed since upgrade`);
      const prior = receipt.priorHashes[path];
      if (prior && (!existsSync(join(receipt.backup, path)) || hash(readFileSync(join(receipt.backup, path))) !== prior)) throw new Error(`Backup for ${path} is missing or changed`);
    }
    for (const path of receipt.changed) {
      const dest = within(root, `agent/${path}`), prior = receipt.priorHashes[path];
      if (prior) {
        const staged = `${dest}.rollback-${process.pid}`;
        cpSync(join(receipt.backup, path), staged); recoverableReplace(staged, dest);
      } else unlinkSync(dest);
    }
    const oldManifest = join(receipt.backup, "managed-files.json");
    if (existsSync(oldManifest)) {
      const staged = `${manifestPath(root)}.rollback-${process.pid}`;
      cpSync(oldManifest, staged); recoverableReplace(staged, manifestPath(root));
    }
    save(join(root, "agent/kit-upgrade-rollback.json"), { schemaVersion: 1, rolledBackAt: new Date().toISOString(), receiptPath });
    return { status: "rolled_back" as const, changed: receipt.changed };
  });
}
