/** Detect social / review profile URLs from links and JSON-LD sameAs. */

export type SocialPlatform =
  | "facebook"
  | "instagram"
  | "yelp"
  | "google"
  | "tiktok"
  | "linkedin"
  | "youtube"
  | "twitter"
  | "other";

export type SocialLink = {
  platform: SocialPlatform;
  url: string;
  label?: string;
};

const PLATFORM_RE: Array<{ platform: SocialPlatform; re: RegExp }> = [
  { platform: "facebook", re: /(?:facebook\.com|fb\.com|fb\.me)\//i },
  { platform: "instagram", re: /instagram\.com\//i },
  { platform: "yelp", re: /yelp\.com\//i },
  {
    platform: "google",
    re: /(?:maps\.app\.goo\.gl|goo\.gl\/maps|google\.com\/maps|business\.google\.com|g\.page)\//i,
  },
  { platform: "tiktok", re: /tiktok\.com\/@/i },
  { platform: "linkedin", re: /linkedin\.com\/(company|in)\//i },
  { platform: "youtube", re: /(?:youtube\.com\/(channel|c|@|user)|youtu\.be)\//i },
  { platform: "twitter", re: /(?:twitter\.com|x\.com)\//i },
];

function walkJsonLd(nodes: unknown[]): Record<string, unknown>[] {
  const flat: Record<string, unknown>[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    flat.push(obj);
    if (obj["@graph"] && Array.isArray(obj["@graph"])) obj["@graph"].forEach(visit);
  };
  nodes.forEach(visit);
  return flat;
}

export function platformForUrl(url: string): SocialPlatform | null {
  for (const { platform, re } of PLATFORM_RE) {
    if (re.test(url)) return platform;
  }
  return null;
}

export function collectSocialLinks(opts: {
  links: { href: string; label: string }[];
  jsonLd: unknown[];
}): SocialLink[] {
  const out: SocialLink[] = [];
  const seen = new Set<string>();

  const push = (url: string, label?: string) => {
    const platform = platformForUrl(url);
    if (!platform) return;
    const key = url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ platform, url, label });
  };

  for (const link of opts.links) {
    push(link.href, link.label || undefined);
  }

  for (const obj of walkJsonLd(opts.jsonLd)) {
    const sameAs = obj.sameAs;
    if (typeof sameAs === "string") push(sameAs);
    else if (Array.isArray(sameAs)) {
      for (const item of sameAs) {
        if (typeof item === "string") push(item);
      }
    }
  }

  return out;
}
