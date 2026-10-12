/** Pure HTML extraction for site onboarding crawls. No network. */

import { collectSocialLinks, type SocialLink } from "./social.ts";

export type ExtractedImage = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  inChrome?: boolean;
  fromJsonLdLogo?: boolean;
  fromOg?: boolean;
  aboveFold?: boolean;
  pageUrl?: string;
  nearbyHeading?: string;
};

export type ExtractedCta = {
  href: string;
  label: string;
  kind: "tel" | "mailto" | "internal" | "external" | "other";
};

export type ExtractedTestimonial = {
  quote: string;
  attribution?: string;
};

export type ExtractedFaq = {
  question: string;
  answer: string;
};

export type ExtractedPage = {
  aliasOf?: string;
  url: string;
  title: string;
  description: string;
  canonical?: string;
  lang?: string;
  h1: string[];
  headings: string[];
  outline: string[];
  paragraphs: string[];
  lists: string[];
  testimonials: ExtractedTestimonial[];
  faqs: ExtractedFaq[];
  links: { href: string; label: string; relative?: boolean }[];
  ctas: ExtractedCta[];
  images: ExtractedImage[];
  phones: string[];
  emails: string[];
  social: SocialLink[];
  jsonLd: unknown[];
  audit: PageAuditHints;
};

export type PageAuditHints = {
  h1Count: number;
  missingAlts: number;
  unlabeledInputs: number;
  hasCanonical: boolean;
  hasLang: boolean;
  hasJsonLd: boolean;
  titleLength: number;
  descriptionLength: number;
};

const SKIP_PATH =
  /\/(wp-admin|wp-login|cart|checkout|account|login|signup|register|cgi-bin|xmlrpc)(\/|$)/i;
const SKIP_EXT = /\.(pdf|zip|docx?|xlsx?|pptx?|mp4|webm|mp3|ics)(\?|$)/i;

/** Query keys that create infinite facet/calendar crawl loops. */
const LOOP_QUERY =
  /^(page|paged|offset|start|utm_|fbclid|gclid|msclkid|mc_|ref|sort|order|filter|color|size|min|max|date|month|year|day|session|sid)/i;

export function shouldSkipPath(pathname: string): boolean {
  if (SKIP_PATH.test(pathname)) return true;
  if (SKIP_EXT.test(pathname)) return true;
  return false;
}

/** Drop runaway query-string variants while keeping unique content URLs. */
export function shouldSkipQueryUrl(href: string): boolean {
  try {
    const u = new URL(href);
    if (![...u.searchParams.keys()].length) return false;
    // Too many params often means facet explosion
    if ([...u.searchParams.keys()].length > 4) return true;
    for (const key of u.searchParams.keys()) {
      if (LOOP_QUERY.test(key)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function stripNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, name: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`,
    "i",
  );
  return decodeEntities((html.match(re) || html.match(re2))?.[1] || "");
}

function tags(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    const text = decodeEntities(m[1]!.replace(/<[^>]+>/g, " "));
    if (text) out.push(text);
  }
  return out;
}

export function absolutize(href: string, base: string): string | null {
  try {
    href = decodeEntities(href).trim().replace(/^["']+|["']+$/g, "");
    const nested = href.match(/https?:\/\/[^\s"'<>]+/);
    if (nested && href.indexOf(nested[0]) > 0) href = nested[0];
    else if (/["']/.test(href)) href = href.split(/["']/)[0]!.trim();
    href = href.replace(/&quot;|&#34;|&#39;/gi, "").trim();
    if (!href) return null;
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

/** Resolve `<base href>` against the document URL; fall back to the page URL. */
export function documentBase(html: string, pageUrl: string): string {
  const m = html.match(/<base\b[^>]*href=["']([^"']+)["']/i);
  if (!m) return pageUrl;
  return absolutize(m[1]!, pageUrl) || pageUrl;
}

/** Path-relative href (about, ../x) as opposed to root-relative, absolute, or hash. */
export function isPathRelativeHref(href: string): boolean {
  const h = href.trim();
  if (!h || h.startsWith("#") || h.startsWith("?") || h.startsWith("mailto:") || h.startsWith("tel:")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return false;
  if (h.startsWith("//") || h.startsWith("/")) return false;
  return true;
}

export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** Treat www and apex as the same site for crawl bounds. */
export function sameSite(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.replace(/^www\./i, "").toLowerCase();
    const hb = new URL(b).hostname.replace(/^www\./i, "").toLowerCase();
    return ha === hb && ha.length > 0;
  } catch {
    return false;
  }
}

export function isLikelyTrackingImage(img: ExtractedImage): boolean {
  if (/sprite|pixel|tracking|1x1|favicon|logo-schema|emoji|gravatar|doubleclick|facebook\.com\/tr/i.test(img.src)) {
    return true;
  }
  if (img.width && img.height && img.width < 64 && img.height < 64 && !img.fromJsonLdLogo && !img.inChrome) {
    return true;
  }
  return false;
}

function dim(tag: string, name: string): number | undefined {
  const m = tag.match(new RegExp(`${name}=["']?(\\d+)`, "i"));
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function fromSrcset(srcset: string, pageUrl: string): string | null {
  const parts = srcset
    .split(",")
    .map((s) => s.trim().split(/\s+/)[0])
    .filter((p): p is string => Boolean(p));
  const last = parts.at(-1);
  return last ? absolutize(last, pageUrl) : null;
}

function allFromSrcset(srcset: string, pageUrl: string): string[] {
  return srcset
    .split(",")
    .map((s) => s.trim().split(/\s+/)[0])
    .filter((p): p is string => Boolean(p))
    .map((p) => absolutize(p, pageUrl))
    .filter((u): u is string => Boolean(u));
}

function classifyHref(href: string, origin: string): ExtractedCta["kind"] {
  if (href.startsWith("tel:")) return "tel";
  if (href.startsWith("mailto:")) return "mailto";
  try {
    const u = new URL(href);
    if (u.origin === origin) return "internal";
    return "external";
  } catch {
    return "other";
  }
}

const CTA_WORDS =
  /\b(book|schedule|appoint|call|contact|get a quote|request|order|reserve|sign up|get started|free estimate)\b/i;

export function extractPhones(text: string): string[] {
  const fromTel = [...text.matchAll(/tel:(\+?[\d().\s-]{7,})/gi)].map((m) =>
    m[1]!.replace(/\s+/g, " ").trim(),
  );
  const fromCopy = [...text.matchAll(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g)].map((m) =>
    m[0]!.trim(),
  );
  return [...new Set([...fromTel, ...fromCopy])];
}

export function extractEmails(text: string): string[] {
  const fromMailto = [...text.matchAll(/mailto:([^\s"'?>]+)/gi)].map((m) =>
    decodeURIComponent(m[1]!.split("?")[0]!).toLowerCase(),
  );
  const fromCopy = [...text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((m) =>
    m[0]!.toLowerCase(),
  );
  return [...new Set([...fromMailto, ...fromCopy])].filter((e) => !e.endsWith(".png") && !e.endsWith(".jpg"));
}

export function parseJsonLd(html: string): unknown[] {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const out: unknown[] = [];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]!.trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      /* ignore broken json-ld */
    }
  }
  return out;
}

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

export function businessFromJsonLd(nodes: unknown[]): {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  hours?: string[];
  url?: string;
  logoUrl?: string;
} {
  const types = walkJsonLd(nodes);
  const biz = types.find((n) => {
    const t = n["@type"];
    const s = Array.isArray(t) ? t.join(" ") : String(t || "");
    return /LocalBusiness|Organization|Restaurant|Store|Dentist|Physician|Attorney/i.test(s);
  });
  if (!biz) return {};
  const addr = biz.address;
  let address = "";
  if (typeof addr === "string") address = addr;
  else if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    address = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode]
      .filter(Boolean)
      .map(String)
      .join(", ");
  }
  const hours = biz.openingHours;
  const specHours = hoursFromSpec(biz.openingHoursSpecification);
  const listed = Array.isArray(hours) ? hours.map(String) : typeof hours === "string" ? [hours] : [];
  let city = "";
  if (addr && typeof addr === "object") {
    const locality = (addr as Record<string, unknown>).addressLocality;
    if (typeof locality === "string") city = locality;
  }
  const phone = Array.isArray(biz.telephone)
    ? String(biz.telephone[0] || "")
    : typeof biz.telephone === "string"
      ? biz.telephone
      : undefined;
  let logoUrl: string | undefined;
  const logo = biz.logo;
  if (typeof logo === "string") logoUrl = logo;
  else if (logo && typeof logo === "object") {
    const url = (logo as Record<string, unknown>).url;
    if (typeof url === "string") logoUrl = url;
  }
  return {
    name: typeof biz.name === "string" ? biz.name : undefined,
    phone: phone || undefined,
    email: typeof biz.email === "string" ? biz.email : undefined,
    address: address || undefined,
    city: city || undefined,
    hours: specHours.length ? specHours : listed.length ? listed : undefined,
    url: typeof biz.url === "string" ? biz.url : undefined,
    logoUrl,
  };
}

function hoursFromSpec(spec: unknown): string[] {
  if (!spec) return [];
  const items = Array.isArray(spec) ? spec : [spec];
  const out: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const rawDays = o.dayOfWeek;
    const day = Array.isArray(rawDays)
      ? rawDays.map((d) => String(d).replace(/^https?:\/\/schema\.org\//, "")).join(", ")
      : String(rawDays || "").replace(/^https?:\/\/schema\.org\//, "");
    const opens = o.opens;
    const closes = o.closes;
    if (day && opens && closes) out.push(`${day}: ${opens}–${closes}`);
  }
  return out;
}

export function jsonLdServices(nodes: unknown[]): { name: string; blurb: string }[] {
  const out: { name: string; blurb: string }[] = [];
  for (const obj of walkJsonLd(nodes)) {
    const t = obj["@type"];
    const type = Array.isArray(t) ? t.join(" ") : String(t || "");
    if (!/Service|Offer/i.test(type)) continue;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name) continue;
    const blurb =
      (typeof obj.description === "string" && obj.description.trim()) ||
      (typeof obj.price === "string" && obj.price) ||
      "";
    out.push({ name, blurb: String(blurb).slice(0, 180) });
  }
  return out;
}

function extractLists(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const items = [...m[2]!.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((li) =>
      decodeEntities(li[1]!.replace(/<[^>]+>/g, " ")),
    );
    const joined = items.filter(Boolean).join(" · ");
    if (joined) out.push(joined);
  }
  return out;
}

function extractTestimonials(html: string): ExtractedTestimonial[] {
  const out: ExtractedTestimonial[] = [];
  for (const m of html.matchAll(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi)) {
    const inner = m[1]!;
    const cite = inner.match(/<cite\b[^>]*>([\s\S]*?)<\/cite>/i)?.[1];
    const footer = inner.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)?.[1];
    const quote = decodeEntities(inner.replace(/<(cite|footer)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));
    if (!quote || quote.length < 20) continue;
    const attribution = decodeEntities((cite || footer || "").replace(/<[^>]+>/g, " ")) || undefined;
    out.push({ quote, attribution });
  }
  return out;
}

function extractFaqs(html: string): ExtractedFaq[] {
  const out: ExtractedFaq[] = [];
  for (const m of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const question = decodeEntities(m[1]!.replace(/<[^>]+>/g, " "));
    const answer = decodeEntities(m[2]!.replace(/<[^>]+>/g, " "));
    if (question && answer) out.push({ question, answer });
  }
  for (const details of html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)) {
    const summary = details[1]!.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1];
    if (!summary) continue;
    const question = decodeEntities(summary.replace(/<[^>]+>/g, " "));
    const answer = decodeEntities(
      details[1]!.replace(/<summary[\s\S]*?<\/summary>/i, " ").replace(/<[^>]+>/g, " "),
    );
    if (question && answer) out.push({ question, answer });
  }
  return out;
}

function cssBackgroundUrls(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/background(?:-image)?\s*:\s*[^;]*url\(\s*['"]?([^)'"]+)['"]?\s*\)/gi)) {
    const abs = absolutize(m[1]!.trim(), pageUrl);
    if (abs && !abs.startsWith("data:")) out.push(abs);
  }
  for (const m of html.matchAll(/style=["'][^"']*url\(\s*['"]?([^)'"]+)['"]?\s*\)[^"']*["']/gi)) {
    const abs = absolutize(m[1]!.trim(), pageUrl);
    if (abs && !abs.startsWith("data:")) out.push(abs);
  }
  return out;
}

function headingBefore(body: string, idx: number): string {
  const before = body.slice(0, idx);
  const matches = [...before.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)];
  const last = matches.at(-1);
  if (!last) return "";
  return decodeEntities(last[1]!.replace(/<[^>]+>/g, " ")).slice(0, 80);
}

function isInChrome(tag: string, surrounding: string): boolean {
  if (/header|nav|navbar|site-header|masthead|\.logo|class=["'][^"']*logo/i.test(tag)) return true;
  // Look back a bit for open header/nav
  const lookback = surrounding.slice(Math.max(0, surrounding.length - 500));
  return /<(header|nav)\b/i.test(lookback) && !/<\/(header|nav)>/i.test(lookback.split(/<(header|nav)\b/i).pop() || "");
}

function countUnlabeledInputs(html: string): number {
  const inputs = [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)];
  let unlabeled = 0;
  for (const m of inputs) {
    const attrs = m[2] || "";
    if (/type=["']hidden["']/i.test(attrs)) continue;
    if (/aria-label=/i.test(attrs) || /aria-labelledby=/i.test(attrs)) continue;
    const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
    if (id && new RegExp(`<label[^>]+for=["']${id}["']`, "i").test(html)) continue;
    // wrapped label is hard to detect with regex; count missing id+aria as unlabeled
    if (!id) unlabeled += 1;
  }
  return unlabeled;
}

/** Builders often put their prose in divs. Keep leaf prose without duplicating
 * parent containers, headings, controls or existing semantic paragraphs. */
export function extractNarrativeParagraphs(html: string): string[] {
  const clean = stripNoise(html);
  const candidates: Array<{index:number;text:string}> = [];
  for (const match of clean.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const value = decodeEntities(match[1]!.replace(/<[^>]+>/g,' '));
    if(value) candidates.push({index:match.index!,text:value});
  }
  const prose = clean.replace(/<(nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,m=>' '.repeat(m.length));
  for (const match of prose.matchAll(/<div\b([^>]*)>((?:(?!<\/?div\b)[\s\S])*?)<\/div>/gi)) {
    if (/\b(?:hidden|aria-hidden\s*=\s*["']true["'])/i.test(match[1]!) || /<(?:p|h[1-6]|ul|ol|li|button|input|select|textarea|nav)\b/i.test(match[2]!)) continue;
    const value = decodeEntities(match[2]!.replace(/<[^>]+>/g,' '));
    if (value.length >= 60 && value.split(/\s+/).length >= 8) candidates.push({index:match.index!,text:value});
  }
  return [...new Set(candidates.sort((a,b)=>a.index-b.index).map(c=>c.text))];
}

export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const origin = new URL(pageUrl).origin;
  const raw = html;
  const base = documentBase(html, pageUrl);
  const body = stripNoise(html);
  const title = decodeEntities((body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<[^>]+>/g, " "));
  const description = meta(body, "description") || meta(body, "og:description");
  const h1 = tags(body, "h1");
  const h2 = tags(body, "h2");
  const h3 = tags(body, "h3");
  const h4 = tags(body, "h4");
  const headings = [...h2, ...h3, ...h4];
  // No length filter / slice — keep all paragraphs
  const paragraphs = extractNarrativeParagraphs(body);
  const outline = [...h1, ...headings];
  const lists = extractLists(body);
  const testimonials = extractTestimonials(body);
  const faqs = extractFaqs(body);

  const lang = raw.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1];
  const canonicalRaw =
    raw.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
    raw.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1];
  const canonical = canonicalRaw ? absolutize(canonicalRaw, base) || undefined : undefined;

  const linkTags = [...body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  const links: { href: string; label: string; relative?: boolean }[] = [];
  const ctas: ExtractedCta[] = [];
  for (const tag of linkTags) {
    const hrefRaw = tag[1]!.match(/href=["']([^"']+)["']/i)?.[1];
    if (!hrefRaw) continue;
    const label = decodeEntities(tag[2]!.replace(/<[^>]+>/g, " "));
    const relative = isPathRelativeHref(hrefRaw);
    const abs = hrefRaw.startsWith("tel:") || hrefRaw.startsWith("mailto:") ? hrefRaw : absolutize(hrefRaw, base);
    if (!abs && !hrefRaw.startsWith("tel:") && !hrefRaw.startsWith("mailto:")) continue;
    const href = abs || hrefRaw;
    links.push({ href, label, ...(relative ? { relative: true } : {}) });
    const kind = classifyHref(href, origin);
    if (kind === "tel" || kind === "mailto" || CTA_WORDS.test(label) || /btn|button/i.test(tag[1]!)) {
      ctas.push({ href, label: label || kind, kind });
    }
  }

  // Button labels as CTAs
  for (const btn of body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const label = decodeEntities(btn[2]!.replace(/<[^>]+>/g, " "));
    if (label && CTA_WORDS.test(label)) {
      ctas.push({ href: "", label, kind: "other" });
    }
  }

  const images: ExtractedImage[] = [];
  const pushImg = (img: ExtractedImage) => {
    if (!img.src || img.src.startsWith("data:")) return;
    images.push({ ...img, pageUrl: img.pageUrl || pageUrl });
  };

  for (const open of body.matchAll(/<img\b[^>]*>/gi)) {
    const tag = open[0]!;
    const idx = open.index ?? 0;
    const surrounding = body.slice(Math.max(0, idx - 400), idx + tag.length);
    const srcset = tag.match(/srcset=["']([^"']+)["']/i)?.[1];
    const srcRaw =
      tag.match(/src=["']([^"']+)["']/i)?.[1] ||
      tag.match(/data-src=["']([^"']+)["']/i)?.[1] ||
      tag.match(/data-lazy-src=["']([^"']+)["']/i)?.[1] ||
      tag.match(/data-original=["']([^"']+)["']/i)?.[1];
    const best =
      (srcset && fromSrcset(srcset, base)) ||
      (srcRaw && !srcRaw.startsWith("data:") ? absolutize(srcRaw, base) : null);
    if (!best) continue;
    const alt = decodeEntities(tag.match(/alt=["']([^"']*)["']/i)?.[1] || "");
    const inChrome = isInChrome(tag, surrounding);
    const nearbyHeading = headingBefore(body, idx);
    pushImg({
      src: best,
      alt,
      width: dim(tag, "width"),
      height: dim(tag, "height"),
      inChrome,
      pageUrl,
      nearbyHeading,
    });
    if (srcset) {
      for (const u of allFromSrcset(srcset, base)) {
        if (u !== best) pushImg({ src: u, alt, inChrome, pageUrl, nearbyHeading });
      }
    }
  }

  // <picture><source srcset>
  for (const pic of body.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi)) {
    for (const srcset of pic[1]!.matchAll(/srcset=["']([^"']+)["']/gi)) {
      for (const u of allFromSrcset(srcset[1]!, base)) {
        pushImg({ src: u, alt: "" });
      }
    }
  }

  for (const bg of cssBackgroundUrls(raw, base)) {
    pushImg({ src: bg, alt: "", aboveFold: false });
  }

  const og = meta(raw, "og:image");
  if (og) {
    const src = absolutize(og, base);
    if (src) pushImg({ src, alt: title, fromOg: true, aboveFold: true });
  }

  const appleTouch = raw.match(
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
  )?.[1];
  if (appleTouch) {
    const src = absolutize(appleTouch, base);
    if (src) pushImg({ src, alt: "apple-touch-icon", inChrome: true });
  }

  const jsonLd = parseJsonLd(raw);
  const biz = businessFromJsonLd(jsonLd);
  if (biz.logoUrl) {
    const src = absolutize(biz.logoUrl, base);
    if (src) pushImg({ src, alt: "logo", fromJsonLdLogo: true, inChrome: true });
  }
  // JSON-LD image fields
  for (const obj of walkJsonLd(jsonLd)) {
    const imgField = obj.image;
    const urls: string[] = [];
    if (typeof imgField === "string") urls.push(imgField);
    else if (Array.isArray(imgField)) {
      for (const item of imgField) {
        if (typeof item === "string") urls.push(item);
        else if (item && typeof item === "object" && typeof (item as { url?: string }).url === "string") {
          urls.push((item as { url: string }).url);
        }
      }
    } else if (imgField && typeof imgField === "object" && typeof (imgField as { url?: string }).url === "string") {
      urls.push((imgField as { url: string }).url);
    }
    for (const u of urls) {
      const src = absolutize(u, base);
      if (src) pushImg({ src, alt: typeof obj.name === "string" ? obj.name : "" });
    }
  }

  const social = collectSocialLinks({ links, jsonLd });
  const textBlob = `${body} ${links.map((l) => l.href).join(" ")}`;
  const dedupedImages = dedupeImages(images);
  const missingAlts = dedupedImages.filter((i) => !i.alt.trim()).length;

  return {
    url: pageUrl,
    title,
    description,
    canonical,
    lang: lang || undefined,
    h1,
    headings,
    outline,
    paragraphs,
    lists,
    testimonials,
    faqs,
    links,
    ctas: dedupeCtas(ctas),
    images: dedupedImages,
    phones: extractPhones(textBlob),
    emails: extractEmails(textBlob),
    social,
    jsonLd,
    audit: {
      h1Count: h1.length,
      missingAlts,
      unlabeledInputs: countUnlabeledInputs(body),
      hasCanonical: Boolean(canonical),
      hasLang: Boolean(lang),
      hasJsonLd: jsonLd.length > 0,
      titleLength: title.length,
      descriptionLength: description.length,
    },
  };
}

function dedupeCtas(ctas: ExtractedCta[]): ExtractedCta[] {
  const seen = new Set<string>();
  const out: ExtractedCta[] = [];
  for (const c of ctas) {
    const key = `${c.kind}|${c.href}|${c.label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function dedupeImages(images: ExtractedImage[]): ExtractedImage[] {
  const seen = new Set<string>();
  const out: ExtractedImage[] = [];
  for (const img of images) {
    if (seen.has(img.src)) {
      // Merge flags onto existing
      const existing = out.find((i) => i.src === img.src);
      if (existing) {
        existing.inChrome = existing.inChrome || img.inChrome;
        existing.fromJsonLdLogo = existing.fromJsonLdLogo || img.fromJsonLdLogo;
        existing.fromOg = existing.fromOg || img.fromOg;
        existing.aboveFold = existing.aboveFold || img.aboveFold;
        if (!existing.alt && img.alt) existing.alt = img.alt;
        if (!existing.nearbyHeading && img.nearbyHeading) existing.nearbyHeading = img.nearbyHeading;
        if (!existing.pageUrl && img.pageUrl) existing.pageUrl = img.pageUrl;
      }
      continue;
    }
    if (isLikelyTrackingImage(img)) continue;
    seen.add(img.src);
    out.push({ ...img });
  }
  return out;
}

export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]!.trim()));
}

export function inferPrimaryCta(ctas: ExtractedCta[]): ExtractedCta | undefined {
  const rank = (c: ExtractedCta) => {
    if (c.kind === "tel") return 2;
    if (/book|appoint|schedule|reserve/i.test(c.label)) return 0;
    if (/quote|estimate|contact|call/i.test(c.label)) return 1;
    if (c.kind === "mailto") return 3;
    return 4;
  };
  return [...ctas].sort((a, b) => rank(a) - rank(b))[0];
}

/** Slugify a page URL into a safe copy filename stem. */
export function pageCopySlug(pageUrl: string, index: number): string {
  try {
    const u = new URL(pageUrl);
    let path = u.pathname.replace(/\/+$/, "") || "index";
    path = path.replace(/^\//, "").replace(/[^\w./-]+/g, "-").replace(/\//g, "__");
    if (!path || path === "-") path = "index";
    return `${String(index).padStart(3, "0")}-${path}`.slice(0, 120);
  } catch {
    return `${String(index).padStart(3, "0")}-page`;
  }
}
