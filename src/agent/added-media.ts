import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { files, json, save, within, type MediaInventory } from "./artifacts.ts";
import { assertSafeSvg } from "./media-format.ts";

export type AddedMediaBinding = { path: string; sha256: string; assetId: string; origin: "customer" | "stock" | "authored" | "unknown"; role: "asset" | "poster"; productionHash?: string };
export type AddedMediaFinding = {
  code: "ADDED_MEDIA_METADATA" | "ADDED_MEDIA_HASH" | "ADDED_MEDIA_CONFLICT" | "ADDED_MEDIA_PATH" | "ADDED_MEDIA_BOUND_CHANGED";
  path: string;
  assetId?: string;
  owner: "media" | "trial";
  category: "repairable" | "integrity";
  explanation: string;
};
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const normalized = (path: string) => path.replaceAll("\\", "/").replace(/^\//, "");
const allowed = (path: string) => /^media\/(recovered|stock|generated|derived)\/[^/]+$/.test(path);
const expectedOrigin = (path: string) => path.startsWith("media/recovered/") ? "customer" : "stock";

/** One contract for media completion and trial preflight. Original capture bytes are checked separately. */
export function validateAddedMedia(root: string, inventory: MediaInventory | undefined, originals?: Set<string>, accepted: AddedMediaBinding[] = []): { findings: AddedMediaFinding[]; bindings: AddedMediaBinding[] } {
  const findings: AddedMediaFinding[] = [];
  const bindings: AddedMediaBinding[] = [];
  const assets = inventory?.assets || [];
  const all = files(within(root, "media")).map(file => normalized(relative(root, file)));
  const extra = originals ? all.filter(path => !originals.has(path)) : all.filter(path => /^media\/(recovered|stock|generated|derived)\//.test(path));
  const prior = new Map(accepted.map(row => [row.path, row]));
  const issue = (code: AddedMediaFinding["code"], path: string, explanation: string, category: AddedMediaFinding["category"] = "repairable", assetId?: string) =>
    findings.push({ code, path, assetId, owner: category === "integrity" ? "trial" : "media", category, explanation });
  for (const old of accepted) {
    let current = "";
    try { const path = within(root, old.path); if (existsSync(path)) current = sha(path); } catch {}
    if (current !== old.sha256) issue("ADDED_MEDIA_BOUND_CHANGED", old.path, "Previously accepted added-media bytes changed or disappeared", "integrity", old.assetId);
  }
  for (const path of extra) {
    if (!allowed(path)) { issue("ADDED_MEDIA_PATH", path, "Added media must be directly under media/recovered or media/stock", "integrity"); continue; }
    const matching = assets.filter(asset => normalized(asset.path) === path || normalized(asset.poster || "") === path);
    if (matching.length !== 1) { issue("ADDED_MEDIA_CONFLICT", path, matching.length ? "Multiple inventory assets claim this added file" : "Added file has no inventory asset", prior.has(path) ? "integrity" : "repairable"); continue; }
    const asset = matching[0]!;
    const role = normalized(asset.poster || "") === path ? "poster" : "asset";
    const produced = /^media\/(generated|derived)\//.test(path);
    const origin = produced ? asset.origin || "unknown" : expectedOrigin(path);
    const productionHash = produced ? createHash("sha256").update(JSON.stringify(asset.production || null)).digest("hex") : undefined;
    if (produced) {
      const p = asset.production;
      let valid = Boolean(p?.operationId && p.requestId && p.tool && p.rights && p.forbiddenImplications?.length && p.sourcePath?.startsWith("artwork/"));
      try { if(path.endsWith(".svg"))assertSafeSvg(readFileSync(within(root,path),"utf8")); } catch { valid=false; }
      try { valid = valid && sha(within(root, p!.sourcePath)) === p!.sourceSha256; } catch { valid = false; }
      if (path.startsWith("media/generated/")) valid = valid && origin === "authored" && ["generated-raster", "authored-vector"].includes(p?.method || "") && p?.parents.length === 0 && asset.identity === "none";
      if (path.startsWith("media/derived/")) {
        valid = valid && p?.method === "derived" && Boolean(p.parents.length);
        for (const parent of p?.parents || []) {
          const a = assets.find(a => a.id === parent.assetId);
          try { valid = valid && a?.sha256 === parent.sha256 && a.path === parent.path && a.origin === parent.origin && origin === parent.origin && sha(within(root, parent.path.replace(/^\//, ""))) === parent.sha256; } catch { valid = false; }
          if (!a?.sources.every(s => asset.sources.includes(s))) valid = false;
          if(a?.identity!==asset.identity || (a?.identityEvidence || []).some(e=>!asset.identityEvidence?.includes(e)) || JSON.stringify(a?.provenance)!==JSON.stringify(asset.provenance))valid=false;
        }
      }
      if (!valid) issue("ADDED_MEDIA_METADATA", path, "Produced asset needs preserved source lineage, recipe hash, method, rights and operation identity", prior.has(path) ? "integrity" : "repairable", asset.id);
      if (prior.get(path)?.productionHash && prior.get(path)!.productionHash !== productionHash) issue("ADDED_MEDIA_BOUND_CHANGED", path, "Accepted production lineage changed", "integrity", asset.id);
    }
    const actual = sha(within(root, path));
    const declared = role === "poster" ? asset.posterSha256 || (path.split("/").pop()!.startsWith(actual) ? actual : "") : asset.sha256;
    if (asset.origin !== origin || !asset.sources?.some(source => source?.trim()) || !asset.id?.trim()) {
      issue("ADDED_MEDIA_METADATA", path, "Added media needs an ID, matching origin, and source evidence", prior.has(path) ? "integrity" : "repairable", asset.id);
    }
    if (!declared || !/^[a-f0-9]{64}$/.test(declared)) issue("ADDED_MEDIA_METADATA", path, role === "poster" ? "Poster needs posterSha256 or a content-addressed filename" : "Added media needs sha256 from local bytes", prior.has(path) ? "integrity" : "repairable", asset.id);
    else if (declared !== actual) issue(prior.has(path) ? "ADDED_MEDIA_BOUND_CHANGED" : "ADDED_MEDIA_HASH", path, "Inventory hash does not match local bytes", prior.has(path) ? "integrity" : "repairable", asset.id);
    if (role === "asset" && asset.kind === "video" && !asset.poster) issue("ADDED_MEDIA_METADATA", path, "Video needs a local poster", "repairable", asset.id);
    if (prior.has(path) && (prior.get(path)!.assetId !== asset.id || prior.get(path)!.origin !== origin || !declared)) issue("ADDED_MEDIA_BOUND_CHANGED", path, "Accepted binding cannot be removed or reassigned", "integrity", asset.id);
    if (declared === actual && asset.origin === origin && asset.sources?.length && !findings.some(f => f.path === path)) bindings.push({ path, sha256: actual, assetId: asset.id, origin, role, ...(productionHash ? { productionHash } : {}) });
  }
  for (const asset of assets) {
    const path = normalized(asset.path);
    if (!/^media\/(recovered|stock|generated|derived)\//.test(path)) continue;
    if (!extra.includes(path)) issue("ADDED_MEDIA_CONFLICT", path, "Inventory references a missing added-media file", prior.has(path) ? "integrity" : "repairable", asset.id);
  }
  return { findings, bindings };
}

export function registerRecoveredMedia(root: string, options: { path: string; source: string; disposition: "use" | "retain"; id?: string; description?: string; role?: string; poster?: string }): MediaInventory["assets"][number] {
  const path = normalized(options.path);
  if (!/^media\/recovered\/[^/]+$/.test(path) || options.path.includes("\\") || options.path.startsWith("/")) throw new Error("Recovered media path must be media/recovered/FILE inside the site");
  if (!options.source?.trim()) throw new Error("Recovered media needs --source URL or captured evidence path");
  const absolute = within(root, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error("Recovered media file is missing or not a regular file: " + path);
  const hash = sha(absolute);
  const inventoryPath = join(root, "onboarding/media-inventory.json");
  const inventory = json<MediaInventory>(inventoryPath);
  const id = options.id || `media-recovered-${hash.slice(0, 16)}`;
  const byPath = inventory.assets.find(asset => normalized(asset.path) === path);
  const byId = inventory.assets.find(asset => asset.id === id);
  if (byId && byId !== byPath) throw new Error("Media ID already belongs to another path: " + id);
  if (byPath && options.id && byPath.id !== id) throw new Error("Recovered file is already registered under another ID: " + byPath.id);
  if (byPath?.sha256 && byPath.sha256 !== hash) throw new Error("Registered media bytes changed; preserve the old binding and register a new path");
  const isVideo = /\.(mp4|webm|mov)$/i.test(path);
  let poster: string | undefined;
  let posterSha256: string | undefined;
  if (options.poster) {
    poster = normalized(options.poster);
    if (!/^media\/recovered\/[^/]+$/.test(poster) || options.poster.includes("\\") || options.poster.startsWith("/")) throw new Error("Poster path must be media/recovered/FILE inside the site");
    const posterAbsolute = within(root, poster);
    if (!existsSync(posterAbsolute) || !statSync(posterAbsolute).isFile()) throw new Error("Poster file is missing: " + poster);
    posterSha256 = sha(posterAbsolute);
  }
  if (isVideo && !poster && !byPath?.poster) throw new Error("Recovered video needs --poster");
  if (byPath?.posterSha256 && posterSha256 && byPath.posterSha256 !== posterSha256) throw new Error("Registered poster bytes changed");
  const asset: MediaInventory["assets"][number] = byPath || {
    id, path: "/" + path, sources: [], description: "Needs visual inspection", role: "unknown", disposition: options.disposition,
    reason: "Recovered customer media awaiting visual review", inspected: false, placements: [], origin: "customer", identity: "uncertain", identityEvidence: [], kind: isVideo ? "video" : "image",
  };
  asset.sha256 = hash;
  asset.sources = [...new Set([...(asset.sources || []), options.source.trim()])];
  asset.origin = "customer";
  asset.kind = isVideo ? "video" : "image";
  asset.disposition = options.disposition;
  if (options.description) asset.description = options.description;
  if (options.role) asset.role = options.role;
  if (poster) asset.poster = "/" + poster;
  if (posterSha256) asset.posterSha256 = posterSha256;
  if (!byPath) inventory.assets.push(asset);
  save(inventoryPath, inventory);
  return asset;
}
