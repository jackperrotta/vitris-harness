import { existsSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { json, save, within, type MediaInventory } from "../agent/artifacts.ts";
import type { StockCatalog, StockItem } from "./types.ts";

export const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export function readStockCatalog(path: string): StockCatalog {
  const catalog = json<StockCatalog>(path);
  if (![1, 2].includes(catalog.version) || !Array.isArray(catalog.items)) throw new Error("Unsupported stock catalog");
  const ids = new Set<string>();
  for (const item of catalog.items) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(item.id) || ids.has(item.id)) throw new Error(`Invalid/duplicate stock id: ${item.id}`);
    ids.add(item.id);
    for (const value of [item.src, item.thumb]) if (!/^\/stock\/(images|thumbs|videos)\/[a-z0-9-]+\.(jpg|jpeg|png|webp|mp4)$/.test(value)) throw new Error(`Invalid stock path: ${value}`);
    if (item.sha256 && !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error(`Invalid stock hash: ${item.id}`);
    if (item.inspection && item.inspection.assetHash !== item.sha256) throw new Error(`Stale inspection: ${item.id}`);
  }
  return catalog;
}
export function accepted(item: StockItem): boolean {
  return item.status === "accepted" && Boolean(item.sha256 && item.inspection?.assetHash === item.sha256 && item.inspection.evidence.length);
}
/** Resolve local immutable cache first, then a provider URL pinned by its expected hash. */
export async function stockBytes(item: StockItem, cacheRoot: string, thumb = false, assetOrigin = process.env.VITRIS_STOCK_ORIGIN): Promise<Buffer> {
  const hash = thumb ? item.thumbSha256 : item.sha256;
  if (!hash) throw new Error(`No pinned ${thumb ? "thumbnail" : "asset"} hash for ${item.id}`);
  const rel = (thumb ? item.thumb : item.src).replace(/^\//, "");
  const path = within(cacheRoot, rel);
  let bytes: Buffer;
  if (existsSync(path)) bytes = readFileSync(path);
  else {
    const provider = thumb ? item.thumbnailUrl : item.downloadUrl;
    const paths = [thumb ? item.thumb : item.src];
    if (!thumb && item.legacySrc) paths.push(item.legacySrc);
    if (thumb && item.legacyThumb) paths.push(item.legacyThumb);
    const urls = [...(assetOrigin ? paths.map(path=>new URL(path, assetOrigin).href) : []), ...(provider ? [provider] : [])];
    for (const url of urls) {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) continue;
      try {
        const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
        if (!response.ok) continue;
        const candidate = Buffer.from(await response.arrayBuffer());
        if (digest(candidate) === hash) return candidate;
      } catch { /* Try the next pinned source; never substitute changed bytes. */ }
    }
    throw new Error(`No matching pinned bytes for ${item.id}. Restore the local cache or provide --origin for the managed stock server; changed provider bytes need a new inspection.`);
  }
  if (digest(bytes) !== hash) throw new Error(`Stock bytes changed for ${item.id}; inspect a new version rather than silently replacing it`);
  return bytes;
}
export async function importStock(opts: {root: string; cacheRoot: string; item: StockItem; reason: string; placements: string[]; assetOrigin?: string}): Promise<string> {
  const {root, item} = opts;
  if (!accepted(item)) throw new Error("Import requires an accepted, inspected stock asset");
  if (!opts.reason.trim() || !opts.placements.length) throw new Error("Stock import requires purpose and proposed routes");
  const inventoryPath = join(root, "onboarding/media-inventory.json");
  const inventory = json<MediaInventory>(inventoryPath);
  const id = `stock-${item.sha256!.slice(0, 20)}`;
  const ext = item.src.split(".").pop()!;
  const path = `/media/stock/${item.sha256}.${ext}`;
  const bytes = await stockBytes(item, opts.cacheRoot, false, opts.assetOrigin);
  const poster = item.kind === "video" ? await stockBytes(item, opts.cacheRoot, true, opts.assetOrigin) : undefined;
  const dest = within(root, path.slice(1)); mkdirSync(dirname(dest), {recursive: true});
  const {writeFileSync} = await import("node:fs"); writeFileSync(dest, bytes);
  const posterPath = poster ? `/media/stock/${item.thumbSha256}.jpg` : undefined;
  if (poster && posterPath) writeFileSync(within(root, posterPath.slice(1)), poster);
  const entry: MediaInventory["assets"][number] = {id, path, sources: [item.sourceUrl || `https://www.pexels.com/photo/${item.pexelsId}/`], description: item.inspection!.description, role: "illustration", disposition: "use", reason: opts.reason, inspected: true, placements: opts.placements,
    origin: "stock", provenance: { sourceUrl: item.sourceUrl || `https://www.pexels.com/photo/${item.pexelsId}/`, termsUrl: item.termsUrl || "https://www.pexels.com/license/", credit: item.credit, acquiredAt: item.acquiredAt, originalSha256: item.sha256! }, identity: "none", identityEvidence: [], sha256: item.sha256, stockId: item.id, kind: item.kind, width: item.width, height: item.height, duration: item.duration, poster: posterPath, posterSha256: poster ? item.thumbSha256 : undefined, inspection: item.inspection};
  const prior = inventory.assets.find(a => a.id === id);
  if (prior) { prior.placements = [...new Set([...prior.placements, ...opts.placements])]; }
  else inventory.assets.push(entry);
  save(inventoryPath, inventory);
  return id;
}
