/** Pick 8–20 must-use harvest images and give them human filenames. */

import type { BriefImage } from "./brief.ts";
import type { ImageMediaType } from "./classify.ts";

export const SHORTLIST_MIN = 8;
export const SHORTLIST_MAX = 20;

const TYPE_CAPS: Partial<Record<ImageMediaType, number>> = {
  logo: 1,
  screenshot: 4,
  illustration: 4,
  portrait: 3,
  press: 2,
  photo: 6,
  icon: 2,
};

function slugPart(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return s || "asset";
}

export function extFromImage(img: BriefImage): string {
  const fromKey = (img.r2Key || img.sourceUrl || img.src).match(/\.([a-z0-9]{3,4})(?:\?|$)/i);
  const ext = (fromKey?.[1] || "png").toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

export function scoreShortlist(img: BriefImage): number {
  if (img.role === "failed" || img.error) return -1;
  let n = 0;
  if (img.role === "logo") n += 100;
  if (img.role === "hero") n += 90;
  if (img.mediaType === "screenshot") n += 40;
  if (img.mediaType === "illustration") n += 38;
  if (img.mediaType === "portrait") n += 36;
  if (img.mediaType === "press") n += 28;
  if (img.kind === "business") n += 20;
  if (img.kind === "generic") n -= 8;
  if (img.alt && !/^alt.?text$/i.test(img.alt)) n += 12;
  if (img.nearbyHeading) n += 8;
  if (img.aboveFold || img.fromOg) n += 10;
  const w = img.width || 0;
  const h = img.height || 0;
  if (w >= 600 || h >= 400) n += 10;
  if (img.mediaType === "icon") n -= 15;
  return n;
}

export function fileStemFor(img: BriefImage, used: Set<string>): string {
  const fromCaption = img.caption || img.nearbyHeading || img.alt;
  let base =
    img.role === "logo"
      ? "logo"
      : img.role === "hero"
        ? "hero"
        : `${img.mediaType || "photo"}-${slugPart(fromCaption || img.r2Key.slice(-8) || "asset")}`;
  if (used.has(base)) {
    let i = 2;
    while (used.has(`${base}-${i}`)) i += 1;
    base = `${base}-${i}`;
  }
  used.add(base);
  return base;
}

/**
 * Mark a diverse shortlist on the image records. Does not copy files.
 */
export function selectShortlist(images: BriefImage[]): BriefImage[] {
  const ranked = images
    .filter((img) => scoreShortlist(img) >= 0)
    .sort((a, b) => scoreShortlist(b) - scoreShortlist(a));

  const picked: BriefImage[] = [];
  const counts: Record<string, number> = {};
  const take = (img: BriefImage) => {
    const t = img.mediaType || img.role || "photo";
    const cap = TYPE_CAPS[t as ImageMediaType] ?? 4;
    counts[t] = (counts[t] || 0) + 1;
    if (counts[t]! > cap && picked.length >= SHORTLIST_MIN) return;
    if (picked.includes(img)) return;
    picked.push(img);
  };

  const logo = ranked.find((i) => i.role === "logo");
  if (logo) take(logo);
  const hero = ranked.find((i) => i.role === "hero" && i !== logo);
  if (hero) take(hero);

  for (const img of ranked) {
    if (picked.length >= SHORTLIST_MAX) break;
    take(img);
  }

  const used = new Set<string>();
  for (const img of picked) {
    img.shortlist = true;
    // Preserve harvest localPath (/media/harvest/…). Suggested stem is caption-only hint.
    const stem = fileStemFor(img, used);
    img.thumbPath = `onboarding/thumbs/${stem}.${extFromImage(img)}`;
    if (!img.caption) {
      img.caption =
        [img.nearbyHeading, img.alt].filter(Boolean).join(" — ") ||
        `${img.mediaType || img.role} from the old site (hint stem: ${stem})`;
    }
  }

  return picked;
}
