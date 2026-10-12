/** Shared analytics helpers (channel, device, validation). Used by Worker + tests. */

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EventKind = "pageview" | "leave" | "convert" | "engage" | "ping";
export type ConvertGoal = "form" | "tel" | "mailto" | "maps";
export type EngageAction = "nav" | "btn" | "img" | "carousel";
export type Channel = "paid" | "organic" | "social" | "email" | "referral" | "direct";
export type Device = "mobile" | "tablet" | "desktop";

const SOCIAL_HOSTS = new Set([
  "facebook.com",
  "fb.com",
  "m.facebook.com",
  "l.facebook.com",
  "instagram.com",
  "l.instagram.com",
  "twitter.com",
  "x.com",
  "t.co",
  "linkedin.com",
  "lnkd.in",
  "pinterest.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "reddit.com",
  "threads.net",
]);

const SEARCH_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "bing.com",
  "www.bing.com",
  "duckduckgo.com",
  "yahoo.com",
  "search.yahoo.com",
  "baidu.com",
  "yandex.com",
  "ecosia.org",
]);

const BOT_UA =
  /bot|spider|crawl|slurp|facebookexternalhit|preview|wget|curl|python-requests|headless|lighthouse|pagespeed|pingdom|uptimerobot|semrush|ahrefs|bytespider|gptbot|claudebot|anthropic/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isBotUa(ua: string): boolean {
  return BOT_UA.test(ua || "");
}

export function classifyDevice(ua: string): Device {
  const s = ua || "";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(s)) return "mobile";
  return "desktop";
}

function hostOf(raw: string): string {
  if (!raw) return "";
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw.replace(/^www\./, "").toLowerCase().split("/")[0] || "";
  }
}

export function classifyChannel(opts: {
  utmMedium?: string;
  utmSource?: string;
  referrer?: string;
}): Channel {
  const medium = (opts.utmMedium || "").toLowerCase().trim();
  const source = (opts.utmSource || "").toLowerCase().trim();
  if (medium === "cpc" || medium === "ppc" || medium === "paid" || medium === "display" || medium === "ads") {
    return "paid";
  }
  if (medium === "email" || source === "newsletter" || source === "email") return "email";
  if (medium === "social" || SOCIAL_HOSTS.has(hostOf(source))) return "social";
  if (medium === "organic") return "organic";

  const ref = hostOf(opts.referrer || "");
  if (!ref) return "direct";
  if (SOCIAL_HOSTS.has(ref) || [...SOCIAL_HOSTS].some((h) => ref.endsWith(`.${h}`))) return "social";
  if (SEARCH_HOSTS.has(ref) || [...SEARCH_HOSTS].some((h) => ref.endsWith(`.${h}`)) || ref.includes("google.")) {
    return "organic";
  }
  return "referral";
}

export function normalizePath(path: string): string {
  if (!path) return "/";
  try {
    const u = path.startsWith("http") ? new URL(path) : new URL(path, "https://example.com");
    let p = u.pathname || "/";
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p.slice(0, 200) || "/";
  } catch {
    return path.slice(0, 200) || "/";
  }
}

export function referrerHost(raw: string): string {
  return hostOf(raw).slice(0, 200);
}

export function isMapsHref(href: string): boolean {
  const h = href.toLowerCase();
  return (
    h.includes("google.com/maps") ||
    h.includes("maps.google.") ||
    h.includes("maps.apple.com") ||
    h.includes("bing.com/maps") ||
    h.includes("goo.gl/maps")
  );
}

export function clampInt(value: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export type TopRow = { key: string; n: number };

export function tallyTop(rows: { key: string; n: number }[], limit = 8): TopRow[] {
  return [...rows]
    .filter((r) => r.key)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}
