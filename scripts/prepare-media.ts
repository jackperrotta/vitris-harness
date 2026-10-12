#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { files, fingerprint, json, save, within, type MediaInventory } from "../src/agent/artifacts.ts";
import { escapeHtml } from "../src/html.ts";
import { registerRecoveredMedia } from "../src/agent/added-media.ts";
const siteArg = process.argv.indexOf("--site");
const root = resolve(siteArg < 0 ? "." : process.argv[siteArg + 1]!);
const arg = (key: string) => { const index = process.argv.indexOf(key); return index < 0 ? undefined : process.argv[index + 1]; };
if (arg("--register")) {
  const disposition = arg("--disposition");
  if (disposition !== "use" && disposition !== "retain") throw new Error("Registration needs --disposition use|retain");
  const asset = registerRecoveredMedia(root, { path: arg("--register")!, source: arg("--source") || "", disposition, id: arg("--id"), description: arg("--description"), role: arg("--role"), poster: arg("--poster") });
  console.log(`Registered ${asset.id} at ${asset.path} with SHA-256 ${asset.sha256}. Inspect the media and record identity evidence before completing media.`);
  process.exit(0);
}
// Invoked with --site by the graph. Existing decisions survive inventory refresh.
const previousPath = join(root, "onboarding/media-inventory.json");
const previous = existsSync(previousPath) ? json<MediaInventory>(previousPath).assets : [];
const brief = json<{ images: { localPath?: string; sourceUrl: string; sourceUrls?: string[]; alt?: string; mediaType?: string }[] }>(join(root, "onboarding/brief.json"));
const assets: MediaInventory["assets"] = files(join(root, "media/harvest")).map(file => {
  const path = "/media/harvest/" + relative(join(root, "media/harvest"), file).replaceAll("\\", "/");
  const match = brief.images.filter(i => i.localPath === path);
  const id = "media-" + createHash("sha256").update(path).update(readFileSync(file)).digest("hex").slice(0, 16);
  return { id, path, sources: [...new Set(match.flatMap(i => i.sourceUrls || [i.sourceUrl]))], description: match[0]?.alt || "Needs visual inspection", role: match[0]?.mediaType || "unknown",
    disposition: "unresolved", reason: "Needs review", inspected: false, placements: [], origin: "unknown", identity: "uncertain", identityEvidence: [], sha256: createHash("sha256").update(readFileSync(file)).digest("hex"), kind: /\.(mp4|webm|mov)$/i.test(file) ? "video" : "image", ...previous.find(a => a.id === id && a.path === path) };
});
assets.push(...previous.filter(a => !a.path.startsWith("/media/harvest/") && existsSync(within(root, a.path.replace(/^\//, "")))));
const priorUnavailable = existsSync(previousPath) ? json<MediaInventory>(previousPath).unavailable || [] : [];
const unavailable = brief.images.filter(i => !assets.some(a => a.sources.includes(i.sourceUrl))).map(i => priorUnavailable.find(a => a.source === i.sourceUrl) || { source: i.sourceUrl, reason: "Needs recovery or explicit disposition", resolution: "unresolved", evidence: "" });
save(previousPath, { version: 2, harvestHash: fingerprint(root, ["onboarding/brief.json", "media/harvest"]), assets, unavailable });
const gallery = assets.map(a => `<figure>${a.kind === "video" ? `<video src="..${escapeHtml(a.path)}" controls preload="metadata"${a.poster ? ` poster="..${escapeHtml(a.poster)}"` : ""}></video>` : `<img src="..${escapeHtml(a.path)}" loading="lazy">`}<figcaption>${escapeHtml(a.id)}<br>${escapeHtml(a.description)}<br>${escapeHtml(a.origin || "unknown")} / ${escapeHtml(a.identity || "uncertain")}</figcaption></figure>`).join("\n");
writeFileSync(join(root, "onboarding/contact-sheet.html"), `<!doctype html><meta charset="utf-8"><title>Media contact sheet</title><style>body{font:14px system-ui;display:grid;grid-template-columns:repeat(4,1fr);gap:16px}figure{margin:0;border:1px solid #ccc;padding:8px}img,video{width:100%;height:180px;object-fit:contain}figcaption{overflow-wrap:anywhere}</style>${gallery}`);
console.log(`Indexed ${assets.length} assets; open onboarding/contact-sheet.html, inspect candidates, then complete dispositions.`);
