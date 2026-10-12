#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { digest, readStockCatalog, importStock, stockBytes } from "../src/stock/library.ts";
import { saveSelection, type MediaSelection } from "../src/stock/selection.ts";
import { searchStock } from "../src/stock/search.ts";
import { json, save, within } from "../src/agent/artifacts.ts";
import type { StockCatalog, StockItem } from "../src/stock/types.ts";
const kernel = resolve(import.meta.dirname, ".."), argv = process.argv.slice(2);
const arg = (key: string) => argv.includes(key) ? argv[argv.indexOf(key) + 1] : undefined;
const command = argv[0];
const catalogPath = resolve(arg("--catalog") || join(kernel, "src/stock/catalog.json"));
const cache = resolve(arg("--cache") || join(kernel, "artifacts/stock-library"));
if (!command || command === "--help") {
  console.log("stock-library search [--query TEXT --industry ID --role ID --kind image|video]\nstock-library stage --out NEW_DIR\nstock-library import --site DIR --id ID --reason TEXT --route / [--cache DIR]\nstock-library select --site DIR --file MANIFEST\nstock-library verify [--cache DIR]\nstock-library publish --out NEW_REPORT_DIR [--cache DIR]\nStock stage never publishes. Inspection and catalog acceptance are separate.");
} else if (command === "search") {
  const query = arg("--query-file") ? JSON.parse(readFileSync(resolve(arg("--query-file")!), "utf8")) : {text: arg("--query"), industry: arg("--industry"), role: arg("--role"), kind: arg("--kind") as "image" | "video" | undefined, limit: 12};
  console.log(JSON.stringify(searchStock(readStockCatalog(catalogPath).items, query), null, 2));
} else if (command === "import") {
  const id = arg("--id"), site = arg("--site"); if (!site) throw new Error("--site required");
  const item = readStockCatalog(catalogPath).items.find(i => i.id === id); if (!item) throw new Error("Unknown stock asset");
  const {findActivePreparation} = await import("../src/agent/preparation.ts");
  const current = existsSync(join(site, "agent/PREPARED.json"));
  if (current && !findActivePreparation(site, "media") && !findActivePreparation(site, "asset-production")) throw new Error("Import stock during media or asset-production; route later additions through the declared owner");
  const launch = existsSync(join(site,"launch.json")) ? json<{backendOrigin?:string;kernelOrigin?:string}>(join(site,"launch.json")) : {};
  console.log(await importStock({root: resolve(site), item, cacheRoot: cache, assetOrigin: arg("--origin") || process.env.VITRIS_STOCK_ORIGIN || process.env.VITRIS_BACKEND_ORIGIN || process.env.KERNEL_ORIGIN || launch.backendOrigin || launch.kernelOrigin, reason: arg("--reason") || "", placements: arg("--route") ? [arg("--route")!] : []}));
} else if (command === "select") {
  const site = arg("--site"), file = arg("--file"); if (!site || !file) throw new Error("--site and --file required");
  saveSelection(resolve(site), json<MediaSelection>(resolve(file)));
} else if (command === "publish") {
  const outArg = arg("--out"); if (!outArg || existsSync(resolve(outArg))) throw new Error("Use a new --out report directory");
  const vars: Record<string,string> = {};
  if (existsSync(join(kernel,".dev.vars"))) for (const line of readFileSync(join(kernel,".dev.vars"),"utf8").split(/\r?\n/)) { const m=line.match(/^([A-Z_]+)\s*=\s*["']?([^\s"']+)/); if(m) vars[m[1]!]=m[2]!; }
  const token=process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || vars.CLOUDFLARE_API_TOKEN || vars.CF_API_TOKEN;
  const account=process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || vars.CLOUDFLARE_ACCOUNT_ID || vars.CF_ACCOUNT_ID;
  if(!token || !account) throw new Error("Cloudflare credentials required for explicit stock publication");
  const out=resolve(outArg); mkdirSync(out,{recursive:true});
  const catalog=readStockCatalog(catalogPath); const uploaded: string[]=[];
  const put=async(key:string,bytes:Uint8Array,mime:string) => {
    const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/vitris-assets/objects/${key}`,{method:"PUT",headers:{authorization:`Bearer ${token}`,"content-type":mime},body:bytes as BodyInit,signal:AbortSignal.timeout(60000)});
    if(!r.ok) throw new Error(`R2 upload failed (${r.status}) for ${key}`); uploaded.push(key);
  };
  try {
    for(const item of catalog.items.filter(i=>i.status==="accepted")) {
      await put(item.src.slice(1),await stockBytes(item,cache),item.kind==="video"?"video/mp4":"image/jpeg");
      await put(item.thumb.slice(1),await stockBytes(item,cache,true),"image/jpeg");
    }
    // All referenced accepted bytes exist before the public pointer changes. Existing legacy keys remain untouched.
    const publicCatalog={...catalog,items:catalog.items.filter(i=>i.status==="accepted")};
    await put("stock/catalog.json",Buffer.from(JSON.stringify(publicCatalog)),"application/json");
    save(join(out,"publication.json"),{ok:true,catalogHash:digest(Buffer.from(JSON.stringify(publicCatalog))),uploaded,at:new Date().toISOString()});
  } catch(error) { save(join(out,"publication.json"),{ok:false,uploaded,error:String(error),at:new Date().toISOString()}); throw error; }
} else if (command === "verify") {
  const failures: string[] = []; for (const item of readStockCatalog(catalogPath).items) try { await stockBytes(item, cache); await stockBytes(item, cache, true); } catch (e) { failures.push(String(e)); }
  console.log(JSON.stringify({ok: !failures.length, failures})); if (failures.length) process.exitCode = 1;
} else if (command === "stage") {
  const outArg = arg("--out"); if (!outArg) throw new Error("--out required"); const out = resolve(outArg);
  if (existsSync(out)) throw new Error("Use a new acquisition directory");
  let key = process.env.PEXELS_API_KEY;
  if (!key && existsSync(join(kernel, ".dev.vars"))) key = readFileSync(join(kernel, ".dev.vars"), "utf8").match(/^PEXELS_API_KEY\s*=\s*["']?([^\s"']+)/m)?.[1];
  if (!key) throw new Error("PEXELS_API_KEY is not configured");
  const spec = json<{imageQueries: {query: string; industry: string}[]; videoQueries: {query: string; industry: string}[]}>(join(kernel, "src/stock/coverage.json"));
  const known = new Set(readStockCatalog(catalogPath).items.map(i => `${i.kind}:${i.pexelsId}`));
  const staged: StockCatalog = {version: 2, items: []}; mkdirSync(out, {recursive: true});
  const errors: string[] = [];
  const get = async (url: string) => { const r = await fetch(url, {headers: {Authorization: key!}, signal: AbortSignal.timeout(30000)}); if (!r.ok) throw new Error(`Pexels response ${r.status}`); return r.json() as Promise<any>; };
  const download = async (url: string, sub: string, ext: string) => {
    const r = await fetch(url, {signal: AbortSignal.timeout(30000)}); if (!r.ok) throw new Error(`Download response ${r.status}`); const bytes = Buffer.from(await r.arrayBuffer()); const sha = digest(bytes);
    const src = `/stock/${sub}/${sha}.${ext}`, file = within(out, src.slice(1)); mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, bytes); return {src, sha, bytes: bytes.length};
  };
  for (const kind of ["image", "video"] as const) for (const specItem of kind === "image" ? spec.imageQueries : spec.videoQueries) {
    try {
      const data = await get(`https://api.pexels.com/${kind === "image" ? "v1/search" : "videos/search"}?query=${encodeURIComponent(specItem.query)}&per_page=8`);
      const candidates = (kind === "image" ? data.photos : data.videos).filter((hit: any) => !known.has(`${kind}:${hit.id}`)).slice(0, kind === "image" ? 3 : 2);
      for (const hit of candidates) {
        const video = kind === "video" ? hit.video_files.filter((f: any) => f.file_type === "video/mp4" && f.width >= 640 && f.width <= 1920).sort((a: any,b: any) => a.width - b.width)[0] : undefined;
        if (kind === "video" && (!video || hit.duration > 30)) continue;
        const url = kind === "image" ? hit.src.large2x || hit.src.large : video.link;
        const thumbUrl = kind === "image" ? hit.src.medium : hit.image;
        if (!url || !thumbUrl) continue;
        const original = await download(url, kind === "image" ? "images" : "videos", kind === "image" ? "jpg" : "mp4");
        const thumb = await download(thumbUrl, "thumbs", "jpg");
        staged.items.push({id: `pexels-${kind}-${hit.id}`, kind, src: original.src, thumb: thumb.src, alt: hit.alt || specItem.query, tags: specItem.query.split(" "), categories: [specItem.industry], credit: `${hit.photographer || hit.user?.name || "Creator"} / Pexels`, pexelsId: hit.id,
          sha256: original.sha, bytes: original.bytes, thumbSha256: thumb.sha, thumbBytes: thumb.bytes, sourceUrl: hit.url, downloadUrl: url, thumbnailUrl: thumbUrl, acquiredAt: new Date().toISOString(), termsUrl: "https://www.pexels.com/license/", width: kind === "video" ? video.width : undefined, height: kind === "video" ? video.height : undefined, duration: hit.duration, status: "staged"});
        known.add(`${kind}:${hit.id}`); save(join(out, "catalog.json"), staged);
      }
      console.log(`Staged ${specItem.query}`);
    } catch (error) { errors.push(`${specItem.query}: ${String(error)}`); }
  }
  save(join(out, "acquisition.json"), {at: new Date().toISOString(), items: staged.items.length, errors, published: false});
  console.log(`${staged.items.length} candidates staged for inspection; ${errors.length} acquisition errors`);
} else throw new Error(`Unknown command ${command}`);
