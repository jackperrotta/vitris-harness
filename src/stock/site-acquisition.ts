import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { json, save, within } from "../agent/artifacts.ts";
import { byteHash } from "../agent/art-direction.ts";
import { searchStock, type StockQuery } from "./search.ts";
import type { StockItem } from "./types.ts";
import { mediaDimensions } from "../agent/media-format.ts";

type Acquisition = { version: 1; signature: string; operationId: string; status: "catalog-match" | "unavailable" | "no-match" | "dispatched" | "staged" | "interrupted"; query: StockQuery; catalogIds: string[]; items: StockItem[]; fallback: string; calls: number; bytes: number; measuredCost: null; error?: string; published: false };
/** Same configured Pexels path; site-local records never enter the shared catalog. Dispatch is durable and never automatically replayed. */
export async function acquireSiteStock(opts: { root: string; operationId: string; query: StockQuery; catalog: StockItem[]; fallback: string; maxCandidates: number; maxBytes: number; key?: string; transport?: typeof fetch }): Promise<Acquisition> {
  if (!/^[a-z0-9-]{3,80}$/.test(opts.operationId) || !opts.fallback.trim() || !Number.isInteger(opts.maxCandidates) || opts.maxCandidates < 1 || opts.maxCandidates > 4 || !Number.isSafeInteger(opts.maxBytes) || opts.maxBytes < 1 || opts.maxBytes > 20000000) throw new Error("Acquisition needs an operation ID, fallback and bounded candidate/byte limits");
  const path = join(opts.root, `artwork/acquisition-${opts.operationId}/receipt.json`);
  const signature = byteHash(JSON.stringify({ query: opts.query, catalog: opts.catalog.map(i => [i.id,i.sha256]), fallback: opts.fallback, maxCandidates: opts.maxCandidates, maxBytes: opts.maxBytes }));
  if (existsSync(path)) {
    const old = json<Acquisition>(path); if (old.signature !== signature) throw new Error("Acquisition operation inputs changed");
    if (old.status === "dispatched") { old.status = "interrupted"; old.error = "Dispatch outcome unknown; inspect saved response before explicit new attempt"; save(path, old); }
    return old;
  }
  const matches = searchStock(opts.catalog.filter(i => i.status === "accepted"), opts.query);
  const result: Acquisition = { version: 1, signature, operationId: opts.operationId, status: matches.length ? "catalog-match" : !opts.key ? "unavailable" : "dispatched", query: opts.query, catalogIds: matches.map(i => i.id), items: [], fallback: opts.fallback, calls: 0, bytes: 0, measuredCost: null, published: false };
  save(path, result); if (result.status !== "dispatched") return result;
  const get = opts.transport || fetch;
  try {
    result.calls++; save(path, result);
    const query = [opts.query.text, opts.query.subject, opts.query.context, opts.query.detail, opts.query.metaphor, opts.query.setting].filter(Boolean).join(" ");
    const url = new URL("https://api.pexels.com/v1/search"); url.searchParams.set("query", query); url.searchParams.set("per_page", String(opts.maxCandidates));
    if (opts.query.orientation) url.searchParams.set("orientation", opts.query.orientation);
    const response = await get(url, { headers: { Authorization: opts.key! }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Pexels search status ${response.status}`);
    const data = await response.json() as { photos?: {id: number; width: number; height: number; url: string; alt: string; photographer: string; src: {large2x?: string; large: string; medium: string}}[] };
    save(join(opts.root, `artwork/acquisition-${opts.operationId}/response.json`), data);
    for (const hit of (data.photos || []).slice(0, opts.maxCandidates)) {
      const downloadUrl = hit.src.large2x || hit.src.large;
      if (new URL(downloadUrl).protocol !== "https:" || new URL(downloadUrl).hostname !== "images.pexels.com") throw new Error("Unexpected provider download host");
      result.calls++; save(path, result);
      const r = await get(downloadUrl, {signal: AbortSignal.timeout(30000)}); if (!r.ok) throw new Error(`Download status ${r.status}`);
      const chunks: Uint8Array[] = []; let size = 0;
      for await (const chunk of r.body!) { size += chunk.length; if (result.bytes + size > opts.maxBytes) { await r.body?.cancel().catch(()=>{}); throw new Error("Acquisition byte budget reached"); } chunks.push(chunk); }
      const bytes = Buffer.concat(chunks), sha256 = byteHash(bytes); result.bytes += bytes.length;
      const src = `/stock/images/${sha256}.jpg`, dest = within(opts.root, `artwork/acquisition-${opts.operationId}${src}`);
      mkdirSync(join(opts.root, `artwork/acquisition-${opts.operationId}/stock/images`), {recursive:true}); writeFileSync(dest, bytes, {flag:"wx"});
      const thumb=src.replace("images","thumbs");mkdirSync(join(opts.root,`artwork/acquisition-${opts.operationId}/stock/thumbs`),{recursive:true});writeFileSync(within(opts.root,`artwork/acquisition-${opts.operationId}${thumb}`),bytes,{flag:"wx"});
      result.items.push({ id:`pexels-image-${hit.id}`, kind:"image", src, thumb, thumbSha256:sha256, thumbBytes:bytes.length, alt:hit.alt || query, tags:[], categories:[], credit:`${hit.photographer} / Pexels`, pexelsId:hit.id, sha256, sourceUrl:hit.url, downloadUrl, thumbnailUrl:downloadUrl, acquiredAt:new Date().toISOString(), termsUrl:"https://www.pexels.com/license/", ...mediaDimensions(bytes,"jpg"), bytes:bytes.length, status:"staged" }); save(path,result);save(join(opts.root,`artwork/acquisition-${opts.operationId}/catalog.json`),{version:2,items:result.items});
    }
    result.status = result.items.length ? "staged" : "no-match";
  } catch(e) { result.status = "interrupted"; result.error = e instanceof Error ? e.message : String(e); }
  save(path,result); return result;
}
