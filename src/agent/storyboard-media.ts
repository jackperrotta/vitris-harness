import type { MediaInventory, Storyboard } from "./artifacts.ts";
import type { MediaSelection } from "../stock/selection.ts";

export type MediaPlanningIssueCode = "MEDIA_UNPLACED" | "MEDIA_ROUTE_INVALID" | "MEDIA_SELECTION_CONFLICT" | "MEDIA_REFERENCE_INVALID" | "MEDIA_ASSET_INVALID";
export type MediaPlanningIssue = {
  code: MediaPlanningIssueCode;
  artifact: "onboarding/storyboard.json" | "onboarding/media-selection.json";
  message: string;
};
export const mediaIssueFailure = (issue: MediaPlanningIssue) => "[" + issue.code + "] " + issue.message;

/** V2 section plans remain readable. V3 requires an explicit selection and placement contract. */
export function validateStoryboardMedia(story: Storyboard, inventory: MediaInventory, selection?: MediaSelection): MediaPlanningIssue[] {
  if (story.version !== 3) return [];
  const issues: MediaPlanningIssue[] = [];
  const add = (code: MediaPlanningIssueCode, message: string, artifact: MediaPlanningIssue["artifact"] = "onboarding/storyboard.json") =>
    issues.push({ code, artifact, message });
  const routes = new Set((story.pages || []).map(page => page.path));
  const assets = new Map((inventory.assets || []).map(asset => [asset.id, asset]));
  const placements = new Map<string, Set<string>>();
  for (const page of story.pages || []) for (const section of page.sections || []) for (const id of section.media || []) {
    const asset = assets.get(id);
    if (!asset) add("MEDIA_REFERENCE_INVALID", "Section " + page.path + "#" + section.id + " references unknown media: " + id);
    else if (!asset.inspected || !["use", "retain"].includes(asset.disposition)) add("MEDIA_ASSET_INVALID", "Section " + page.path + "#" + section.id + " references uninspected or ineligible media: " + id);
    const key = page.path + "|section|" + section.id;
    if (!placements.has(id)) placements.set(id, new Set());
    placements.get(id)!.add(key);
  }
  const globalSeen = new Set<string>();
  for (const row of story.globalMedia || []) {
    const asset = assets.get(row.assetId);
    if (!asset) add("MEDIA_REFERENCE_INVALID", "Shared " + row.placement + " references unknown media: " + row.assetId);
    else {
      const evidencedBrand = ["logo", "brand-art"].includes(asset.identity || "")
        || (asset.role === "logo" && Boolean(asset.identity && !["none", "uncertain"].includes(asset.identity)));
      if (!asset.inspected || asset.disposition !== "use" || asset.origin !== "customer" || !evidencedBrand || !asset.identityEvidence?.length) {
        add("MEDIA_ASSET_INVALID", "Shared " + row.placement + " references an ineligible customer brand asset: " + row.assetId);
      }
    }
    if (!["header", "footer"].includes(row.placement) || !row.reason?.trim() || !Array.isArray(row.routes) || !row.routes.length) {
      add("MEDIA_ROUTE_INVALID", "Shared placement for " + row.assetId + " needs header/footer, reason and routes");
      continue;
    }
    const local = new Set<string>();
    for (const route of row.routes) {
      if (!routes.has(route) || local.has(route)) add("MEDIA_ROUTE_INVALID", "Shared placement for " + row.assetId + " has invalid or duplicate route: " + route);
      local.add(route);
      const key = route + "|" + row.placement + "|";
      const conflictKey = row.assetId + "|" + route;
      if (globalSeen.has(conflictKey)) add("MEDIA_ROUTE_INVALID", "Shared asset " + row.assetId + " has conflicting placement on " + route);
      globalSeen.add(conflictKey);
      if (!placements.has(row.assetId)) placements.set(row.assetId, new Set());
      placements.get(row.assetId)!.add(key);
    }
  }
  for (const asset of inventory.assets || []) if (asset.disposition === "use" && !placements.get(asset.id)?.size) {
    add("MEDIA_UNPLACED", "Selected media lacks storyboard placement: " + asset.id);
  }
  if (!selection || selection.version !== 1 || !Array.isArray(selection.placements)) {
    add("MEDIA_SELECTION_CONFLICT", "Storyboard v3 requires onboarding/media-selection.json", "onboarding/media-selection.json");
    return issues;
  }
  const selected = new Set<string>();
  for (const row of selection.placements) {
    if (!row.assetId || row.noMatch) continue;
    const kind = row.slot.placement || "section";
    const key = row.slot.route + "|" + kind + "|" + (kind === "section" ? row.slot.sectionId || "" : "");
    selected.add(row.assetId + "|" + key);
    if (!placements.get(row.assetId)?.has(key)) {
      add("MEDIA_SELECTION_CONFLICT", "Selection " + row.slot.id + " for " + row.assetId + " does not match a planned route and placement: " + key, "onboarding/media-selection.json");
    }
  }
  for (const [id, slots] of placements) {
    if (assets.get(id)?.disposition !== "use") continue;
    for (const slot of slots) if (!selected.has(id + "|" + slot)) {
      add("MEDIA_SELECTION_CONFLICT", "Planned media " + id + " at " + slot + " lacks a matching selection", "onboarding/media-selection.json");
    }
  }
  return issues;
}
