/** Pure image role/kind classification for onboarding harvests. No network. */

import type { ExtractedImage } from "./extract.ts";

export type ImageRole = "logo" | "hero" | "photo" | "icon" | "failed";
export type ImageKind = "business" | "stock" | "generic" | "unknown";
export type ImageMediaType =
  | "logo"
  | "illustration"
  | "screenshot"
  | "portrait"
  | "press"
  | "photo"
  | "icon";

export type ClassifiedImage = ExtractedImage & {
  role: ImageRole;
  kind: ImageKind;
  mediaType: ImageMediaType;
  inChrome?: boolean;
  fromJsonLdLogo?: boolean;
  fromOg?: boolean;
  aboveFold?: boolean;
};

const STOCK_HOST =
  /unsplash\.com|images\.unsplash|pexels\.com|images\.pexels|pixabay\.com|cdn\.pixabay|shutterstock\.com|gettyimages|adobe\.stock|stock\.adobe|burst\.shopify|istockphoto|depositphotos|dreamstime|fotolia|smugmug\.com\/.*stock/i;

const GENERIC_NAME =
  /handshake|laptop.?latte|coffee.?laptop|smiling.?team|diversity.?meeting|spa.?stones|marble.?texture|placeholder|spacer|dummy|default.?avatar|blank/i;

/** Placeholder alts only — empty alt is not generic. */
const GENERIC_ALT = /^(alt.?text|image|photo|picture|img|untitled)$/i;

const LOGO_HINT = /logo|brand.?mark|wordmark|logotype/i;

const ICON_HINT =
  /icon|sprite|checkmark|arrow|chevron|social.?|facebook|instagram|twitter|linkedin|youtube|tiktok/i;

const ILLUSTRATION_HINT =
  /illustrat|vector|isometric|cartoon|clipart|infographic|doodle|how-it-works|whats-included|what's included/i;

const SCREENSHOT_HINT =
  /mockup|screenshot|device.?frame|laptop|browser|website of|responsive|portfolio/i;

const PORTRAIT_HINT = /headshot|portrait|founder|team.?photo|staff|our team|meet the/i;

const PRESS_HINT = /featured.?in|as.?seen|press.?logo|publication|badge/i;

export function isStockHost(src: string): boolean {
  try {
    const host = new URL(src).hostname;
    return STOCK_HOST.test(host) || STOCK_HOST.test(src);
  } catch {
    return STOCK_HOST.test(src);
  }
}

export function inferMediaType(
  img: ExtractedImage,
  role: ImageRole,
): ImageMediaType {
  if (role === "logo") return "logo";
  if (role === "icon") return "icon";
  const blob = `${img.src} ${img.alt} ${img.nearbyHeading || ""} ${img.pageUrl || ""}`;
  if (PRESS_HINT.test(blob)) return "press";
  if (PORTRAIT_HINT.test(blob) || /\/(about|team|meet)/i.test(img.pageUrl || "")) {
    if (PORTRAIT_HINT.test(blob) || /headshot|portrait|founder|team/i.test(blob)) return "portrait";
  }
  if (SCREENSHOT_HINT.test(blob)) return "screenshot";
  if (ILLUSTRATION_HINT.test(blob) || /\.svg(\?|$)/i.test(img.src)) return "illustration";
  if (/\/(how-it-works|process)(\/|$)/i.test(img.pageUrl || "")) return "illustration";
  if (PORTRAIT_HINT.test(blob)) return "portrait";
  return "photo";
}

export function classifyOne(
  img: ExtractedImage,
  opts: {
    inChrome?: boolean;
    fromJsonLdLogo?: boolean;
    fromOg?: boolean;
    aboveFold?: boolean;
  } = {},
): ClassifiedImage {
  const inChrome = Boolean(opts.inChrome ?? img.inChrome);
  const fromJsonLdLogo = Boolean(opts.fromJsonLdLogo ?? img.fromJsonLdLogo);
  const fromOg = Boolean(opts.fromOg ?? img.fromOg);
  const aboveFold = Boolean(opts.aboveFold ?? img.aboveFold);
  const srcAlt = `${img.src} ${img.alt}`;

  const finish = (role: ImageRole, kind: ImageKind): ClassifiedImage => ({
    ...img,
    role,
    kind,
    mediaType: inferMediaType(img, role),
    inChrome,
    fromJsonLdLogo,
    fromOg,
    aboveFold,
  });

  if (fromJsonLdLogo || LOGO_HINT.test(srcAlt) || (inChrome && LOGO_HINT.test(img.alt || img.src))) {
    return finish("logo", "business");
  }

  if (
    inChrome &&
    (/\.svg(\?|$)/i.test(img.src) || (img.width && img.height && img.width <= 400 && img.height <= 200))
  ) {
    if (!GENERIC_NAME.test(srcAlt)) return finish("logo", "business");
  }

  if (ICON_HINT.test(srcAlt) || (img.width && img.height && img.width <= 96 && img.height <= 96)) {
    return finish("icon", "generic");
  }

  if (isStockHost(img.src) || GENERIC_NAME.test(srcAlt)) {
    return finish(aboveFold || fromOg ? "hero" : "photo", isStockHost(img.src) ? "stock" : "generic");
  }

  const alt = img.alt.trim();
  if (alt && (GENERIC_ALT.test(alt) || /^alt.?text$/i.test(alt))) {
    return finish(aboveFold || fromOg ? "hero" : "photo", "generic");
  }

  return finish(aboveFold || fromOg ? "hero" : "photo", "business");
}

/**
 * Classify a list of images and promote a single logo + single hero when possible.
 */
export function classifyImages(
  images: Array<
    ExtractedImage & {
      inChrome?: boolean;
      fromJsonLdLogo?: boolean;
      fromOg?: boolean;
      aboveFold?: boolean;
    }
  >,
): ClassifiedImage[] {
  const classified = images.map((img) =>
    classifyOne(img, {
      inChrome: img.inChrome,
      fromJsonLdLogo: img.fromJsonLdLogo,
      fromOg: img.fromOg,
      aboveFold: img.aboveFold,
    }),
  );

  const logos = classified.filter((c) => c.role === "logo");
  if (logos.length > 1) {
    const preferred =
      logos.find((l) => l.fromJsonLdLogo) ||
      logos.find((l) => l.inChrome && LOGO_HINT.test(`${l.src} ${l.alt}`)) ||
      logos[0]!;
    for (const c of classified) {
      if (c.role === "logo" && c.src !== preferred.src) {
        c.role = "icon";
        c.kind = c.kind === "business" ? "unknown" : c.kind;
        c.mediaType = inferMediaType(c, "icon");
      }
    }
  }

  const heroes = classified.filter((c) => c.role === "hero");
  if (heroes.length > 1) {
    const preferred =
      heroes.find((h) => h.kind === "business" && (h.fromOg || h.aboveFold)) ||
      heroes.find((h) => h.kind === "business") ||
      heroes.find((h) => h.fromOg) ||
      heroes[0]!;
    for (const c of classified) {
      if (c.role === "hero" && c.src !== preferred.src) {
        c.role = "photo";
        c.mediaType = inferMediaType(c, "photo");
      }
    }
  } else if (heroes.length === 0) {
    const candidate =
      classified.find((c) => c.kind === "business" && c.role === "photo" && (c.fromOg || c.aboveFold)) ||
      classified.find((c) => c.kind === "business" && c.role === "photo") ||
      classified.find((c) => c.role === "photo");
    if (candidate) {
      candidate.role = "hero";
      candidate.mediaType = inferMediaType(candidate, "hero");
    }
  }

  return classified;
}
