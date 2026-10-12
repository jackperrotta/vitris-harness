import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { BriefImage } from "../../src/onboard/brief.ts";
import { classifyImages, type ClassifiedImage } from "../../src/onboard/classify.ts";
import type { ExtractedImage } from "../../src/onboard/extract.ts";
import { selectShortlist } from "../../src/onboard/shortlist.ts";
import { assetsOrigin, publicAssetUrl, putLocalR2, putRemoteR2, writeScratchFile } from "../lib/r2.ts";
import { json, save } from "../../src/agent/artifacts.ts";

const ua = "VitrisOnboard/0.1 (authorized site migration; https://vitris.local)";
const MIN_BYTES = 4096;
const MAX_BYTES = 8 * 1024 * 1024;

export type UploadOptions = {
  kernelRoot: string;
  slug: string;
  local: boolean;
  remote: boolean;
  captureKey?: string;
};

function extFor(contentType: string, url: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  const fromUrl = url.match(/\.(jpe?g|png|webp|gif|svg)(\?|$)/i);
  return (fromUrl?.[1] || "jpg").toLowerCase().replace("jpeg", "jpg");
}

async function download(url: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": ua, accept: "image/*,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
      return null;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    return { bytes, contentType: contentType || "image/jpeg" };
  } catch {
    return null;
  }
}

/**
 * Download and upload every unique non-tracking image (no MAX_IMAGES cap).
 * Byte-hash dedupe so the same photo on many pages is stored once.
 * Classify/shortlist are hints only — interpret owns the must-use list.
 */
export async function uploadImages(images: ExtractedImage[], opts: UploadOptions): Promise<BriefImage[]> {
  const classified = classifyImages(images);
  const out: BriefImage[] = [];
  const seenHash = new Map<string, BriefImage>();
  const cachePath = opts.captureKey ? join(opts.kernelRoot, "scratch/onboard", opts.slug, `downloads-${opts.captureKey}.json`) : undefined;
  const cached = cachePath && existsSync(cachePath) ? json<BriefImage[]>(cachePath) : [];
  let remote = opts.remote;
  if (opts.local === false && remote === false) {
    console.log("Media is saved locally; no R2 publication requested.");
  }

  for (const img of classified) {
    const previous = cached.find(c => (c.sourceUrl === img.src || c.sourceUrls?.includes(img.src)) && c.scratchPath && existsSync(c.scratchPath));
    if (previous) {
      if (!out.some(i => i.scratchPath === previous.scratchPath)) out.push(previous);
      continue;
    }
    const downloaded = await download(img.src);
    if (!downloaded) {
      out.push({
        sourceUrl: img.src,
        alt: img.alt,
        r2Key: "",
        src: img.src,
        role: "failed",
        kind: img.kind,
        mediaType: img.mediaType,
        pageUrl: img.pageUrl,
        nearbyHeading: img.nearbyHeading,
        width: img.width,
        height: img.height,
        error: "download failed",
      });
      continue;
    }
    if (downloaded.bytes.length > MAX_BYTES) {
      out.push({
        sourceUrl: img.src,
        alt: img.alt,
        r2Key: "",
        src: img.src,
        role: "failed",
        kind: img.kind,
        error: "file too large",
      });
      continue;
    }
    const isLogo = img.role === "logo" || img.fromJsonLdLogo;
    if (downloaded.bytes.length < MIN_BYTES && !isLogo && !downloaded.contentType.includes("svg")) {
      out.push({ sourceUrl: img.src, alt: img.alt, r2Key: "", src: img.src, role: "failed", kind: img.kind, error: "Small raster: inspect before inclusion" });
      continue;
    }
    const hash = createHash("sha256").update(downloaded.bytes).digest("hex").slice(0, 16);
    const duplicate = seenHash.get(hash);
    if (duplicate) { duplicate.sourceUrls = [...new Set([...(duplicate.sourceUrls || [duplicate.sourceUrl]), img.src])]; continue; }
    const ext = extFor(downloaded.contentType, img.src);
    const r2Key = `sites/${opts.slug}/media/${hash}.${ext}`;
    const file = join(opts.kernelRoot, "scratch", "onboard", opts.slug, `${hash}.${ext}`);
    writeScratchFile(file, downloaded.bytes);
    const contentType =
      downloaded.contentType.startsWith("image/") ? downloaded.contentType : `image/${ext === "jpg" ? "jpeg" : ext}`;

    let uploaded = false;
    if (opts.local) {
      try {
        putLocalR2(opts.kernelRoot, r2Key, file, contentType);
        uploaded = true;
      } catch (err) {
        console.warn(`local R2 skipped for ${r2Key}: ${err instanceof Error ? err.message : "error"}`);
      }
    }
    if (remote) {
      try {
        await putRemoteR2(r2Key, file, contentType);
        uploaded = true;
      } catch (err) {
        console.warn(`remote R2 skipped for ${r2Key}: ${err instanceof Error ? err.message : "error"}`);
        remote = false;
      }
    }

    const brief = toBriefImage(img, {
      r2Key: uploaded ? r2Key : "",
      src: uploaded ? publicAssetUrl(r2Key) : img.src,
      uploaded,
      scratchPath: file,
      hash,
      ext,
    });
    out.push(brief);
    seenHash.set(hash, brief);
    if (cachePath) save(cachePath, out.filter(i => i.scratchPath));
  }

  promoteRoles(out);
  // Hints only — interpret node rewrites media.md with the real must-use list.
  const hints = selectShortlist(out);
  console.log(`Harvest images: ${out.filter((i) => i.role !== "failed").length} stored; shortlist hint=${hints.length}`);

  if (out.some((i) => i.role !== "failed" && i.r2Key) && assetsOrigin().includes("127.0.0.1")) {
    console.warn(
      "ASSETS_ORIGIN is local. All successful images are copied into media/harvest/; interpret picks the shortlist.",
    );
  }
  return out;
}

function toBriefImage(
  img: ClassifiedImage,
  opts: { r2Key: string; src: string; uploaded: boolean; scratchPath?: string; hash: string; ext: string },
): BriefImage {
  const meta = {
    mediaType: img.mediaType,
    pageUrl: img.pageUrl,
    nearbyHeading: img.nearbyHeading,
    width: img.width,
    height: img.height,
    aboveFold: img.aboveFold,
    fromOg: img.fromOg,
    scratchPath: opts.scratchPath,
    localPath: `/media/harvest/${opts.hash}.${opts.ext}`,
  };
  return {
    sourceUrl: img.src,
    alt: img.alt,
    r2Key: opts.r2Key,
    src: opts.src,
    role: img.role === "failed" ? "photo" : img.role,
    kind: img.kind,
    ...meta,
  };
}

/** Copy every successful harvest image into the site repo under media/harvest/. */
export function copyHarvestToSite(siteRoot: string, images: BriefImage[]): void {
  const harvestDir = join(siteRoot, "media", "harvest");
  mkdirSync(harvestDir, { recursive: true });
  for (const img of images) {
    if (img.role === "failed" || !img.scratchPath || !existsSync(img.scratchPath)) continue;
    const name = img.localPath ? basename(img.localPath) : basename(img.scratchPath);
    const dest = join(harvestDir, name);
    copyFileSync(img.scratchPath, dest);
    img.localPath = `/media/harvest/${name}`;
    img.src = img.localPath;
  }
}

/** @deprecated use copyHarvestToSite */
export function copyShortlistToSite(siteRoot: string, images: BriefImage[]): void {
  copyHarvestToSite(siteRoot, images);
}

function promoteRoles(images: BriefImage[]): void {
  const logos = images.filter((i) => i.role === "logo");
  if (logos.length > 1) {
    const keep = logos[0]!;
    for (const img of images) {
      if (img.role === "logo" && img.sourceUrl !== keep.sourceUrl) img.role = "icon";
    }
  }
  const heroes = images.filter((i) => i.role === "hero");
  if (heroes.length > 1) {
    const keep = heroes.find((h) => h.kind === "business") || heroes[0]!;
    for (const img of images) {
      if (img.role === "hero" && img.sourceUrl !== keep.sourceUrl) img.role = "photo";
    }
  } else if (heroes.length === 0) {
    const candidate =
      images.find((i) => i.kind === "business" && i.role === "photo") ||
      images.find((i) => i.role === "photo");
    if (candidate) candidate.role = "hero";
  }
}
