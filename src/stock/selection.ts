import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./library.ts";
import { json, save, within, type MediaInventory } from "../agent/artifacts.ts";
import { validateAddedMedia } from "../agent/added-media.ts";

export type MediaAsset = MediaInventory["assets"][number];
export type MediaSlot = {id: string; route: string; purpose: string; placement?: "section" | "header" | "footer"; sectionId?: string; kind?: "image" | "video"; identity?: MediaAsset["identity"]; minWidth?: number};
export type MediaSelection = {version: 1; placements: {slot: MediaSlot; assetId?: string; reason: string; crop?: string; noMatch?: boolean}[]};
export function identityAsset(asset: MediaAsset): boolean { return Boolean(asset.identity && !["none", "uncertain"].includes(asset.identity)); }
export function eligibleForSlot(asset: MediaAsset, slot: MediaSlot): boolean {
  if (!asset.inspected || asset.disposition !== "use") return false;
  if (slot.kind && (asset.kind || "image") !== slot.kind) return false;
  if (slot.minWidth && (!asset.width || asset.width < slot.minWidth)) return false;
  if (slot.identity && slot.identity !== "none") return asset.origin === "customer" && asset.identity === slot.identity && Boolean(asset.identityEvidence?.length);
  return true;
}
/** Retrieve by section meaning before imposing the inference cap; inventory order is not relevance. */
export function shortlistForSlot(assets: MediaAsset[], slot: MediaSlot, limit = 8): MediaAsset[] {
  const stop = new Set(["the", "our", "and", "for", "with", "show", "image", "photo", "illustrate", "section", "home"]);
  const words = [...new Set(`${slot.purpose} ${slot.id}`.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2 && !stop.has(w)))];
  const relevance = (a: MediaAsset) => {const text=JSON.stringify([a.description,a.role,a.inspection]).toLowerCase();return words.reduce((n,w)=>n+Number(text.includes(w)),0);};
  return assets.filter(a=>eligibleForSlot(a,slot)).sort((a,b)=>relevance(b)-relevance(a) || Number(b.origin === "customer")-Number(a.origin === "customer") || a.id.localeCompare(b.id)).slice(0, Math.max(0,Math.min(limit,8)));
}
export function checkMediaIdentity(assets: MediaAsset[], root?: string): string[] {
  return assets.flatMap(asset => {
    const failures: string[] = [];
    if ((asset.origin === "stock" || asset.origin === "authored") && identityAsset(asset)) failures.push(`${asset.id}: ${asset.origin} cannot stand in for customer identity or proof`);
    if (identityAsset(asset) && !asset.identityEvidence?.length) failures.push(`${asset.id}: identity role needs source-page evidence`);
    if (root && identityAsset(asset)) for (const evidence of asset.identityEvidence || []) {
      const path = evidence.split("#")[0]!;
      if (path.includes("\\") || path.split("/").includes("..") || (!/^onboarding\/(copy|raw|stills)\//.test(path) && path !== "onboarding/brief.json")) { failures.push(`${asset.id}: identity evidence must reference a captured onboarding artifact`); continue; }
      try { if (!existsSync(within(root, path)) || !statSync(within(root,path)).isFile()) failures.push(`${asset.id}: missing identity evidence ${path}`); } catch { failures.push(`${asset.id}: invalid identity evidence path`); }
    }
    if (identityAsset(asset) && asset.disposition !== "use" && !asset.identityDecision?.trim()) failures.push(`${asset.id}: account for omitted identity asset with an explicit decision`);
    if (asset.origin === "stock" && (!asset.sha256 || !asset.inspected)) failures.push(`${asset.id}: stock must be inspected and pinned`);
    return failures;
  });
}
export function validateMediaSelection(root: string, selection?: MediaSelection, requireSelection = false): string[] {
  const invPath = join(root, "onboarding/media-inventory.json");
  if (!existsSync(invPath)) return [];
  const assets = json<MediaInventory>(invPath).assets;
  const failures = checkMediaIdentity(assets, root);
  failures.push(...validateAddedMedia(root, { version: 2, harvestHash: "", assets }).findings.map(finding => `[${finding.code}] ${finding.path}: ${finding.explanation}`));
  for (const asset of assets.filter(a => a.disposition === "use" && a.sha256)) {
    const file = within(root, asset.path.replace(/^\//, ""));
    if (!existsSync(file) || digest(readFileSync(file)) !== asset.sha256) failures.push(`${asset.id}: selected media missing or changed`);
    if (asset.kind === "video" && (!asset.poster || !existsSync(within(root, asset.poster.replace(/^\//, ""))))) failures.push(`${asset.id}: video needs a local poster`);
  }
  if (!selection && existsSync(join(root, "onboarding/media-selection.json"))) selection = json<MediaSelection>(join(root, "onboarding/media-selection.json"));
  if (!selection) return requireSelection && assets.some(a=>a.origin && a.disposition === "use") ? [...failures, "Modern media inventory requires onboarding/media-selection.json with explicit placements or no-match decisions"] : failures;
  if (selection.version !== 1 || !Array.isArray(selection.placements)) return [...failures, "Invalid media selection manifest"];
  const seen = new Set<string>();
  for (const row of selection.placements) {
    if (!row.slot?.id || !row.slot.route || !row.slot.purpose || !row.reason?.trim()) { failures.push("Media placement needs a slot, route, purpose and reason"); continue; }
    if (seen.has(row.slot.id)) failures.push(`Duplicate media slot: ${row.slot.id}`); seen.add(row.slot.id);
    if (row.noMatch && !row.assetId) continue;
    const asset = assets.find(a => a.id === row.assetId);
    if (!asset || row.noMatch || !eligibleForSlot(asset, row.slot)) failures.push(`${row.slot.id}: ineligible media selection`);
  }
  const used = new Set(selection.placements.map(p => p.assetId));
  for (const asset of assets.filter(a => identityAsset(a) && a.disposition === "use")) if (!used.has(asset.id) && !asset.identityDecision?.trim()) failures.push(`${asset.id}: identity asset omitted from placements without a decision`);
  return failures;
}
export function saveSelection(root: string, selection: MediaSelection): void {
  const errors = validateMediaSelection(root, selection);
  if (errors.length) throw new Error(errors.join("; "));
  save(join(root, "onboarding/media-selection.json"), selection);
}

export function validateRenderedMedia(root: string): string[] {
  const path = join(root, "onboarding/media-selection.json");
  if (!existsSync(path)) return [];
  const inventory = json<MediaInventory>(join(root, "onboarding/media-inventory.json"));
  const selection = json<MediaSelection>(path); const errors: string[] = [];
  for (const row of selection.placements) {
    if (!row.assetId || row.noMatch) continue;
    const asset = inventory.assets.find(a=>a.id===row.assetId); if (!asset) continue;
    const route = row.slot.route.replace(/^\//, "").replace(/\/$/, "");
    const page = within(root, `dist/${route ? route + "/" : ""}index.html`);
    if (!existsSync(page) || !readFileSync(page,"utf8").includes(asset.path)) errors.push(`${row.slot.id}: selected asset missing from rendered route ${row.slot.route}`);
  }
  return errors;
}
