import {
  businessFromJsonLd,
  inferPrimaryCta,
  jsonLdServices,
  type ExtractedCta,
  type ExtractedFaq,
  type ExtractedImage,
  type ExtractedPage,
  type ExtractedTestimonial,
  type PageAuditHints,
} from "./extract.ts";
import type { ImageKind, ImageMediaType, ImageRole } from "./classify.ts";
import type { SocialLink } from "./social.ts";
import { collectSocialLinks } from "./social.ts";

export const CRITICAL_KEYS = [
  "name",
  "phone",
  "email",
  "address",
  "primaryCta",
  "hours",
  "services",
] as const;

export type CriticalKey = (typeof CRITICAL_KEYS)[number];

export type BusinessFacts = {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  hours: string[];
  primaryCta: { label: string; href: string };
  services: { name: string; blurb: string }[];
  social: SocialLink[];
};

export type BriefImage = {
  sourceUrl: string;
  sourceUrls?: string[];
  alt: string;
  r2Key: string;
  src: string;
  role: ImageRole;
  kind: ImageKind;
  mediaType?: ImageMediaType;
  pageUrl?: string;
  nearbyHeading?: string;
  caption?: string;
  width?: number;
  height?: number;
  aboveFold?: boolean;
  fromOg?: boolean;
  /** Site-local path after harvest copy, e.g. `/media/hero.png`. Prefer this in pages. */
  localPath?: string;
  thumbPath?: string;
  shortlist?: boolean;
  scratchPath?: string;
  error?: string;
};

export type SiteRegister = "trade" | "beauty" | "b2b";

export type VisualHints = {
  brandColors?: Array<{ value: string; source: string }>;
  fontBody?: string;
  fontDisplay?: string;
  radius?: string;
  radiusPill?: string;
};

export type OnboardVisual = {
  register: SiteRegister;
  signatureSections: string[];
  hints: VisualHints;
  stills: string[];
};

export type BriefPage = {
  aliasOf?: string;
  url: string;
  title: string;
  description: string;
  canonical?: string;
  outline: string[];
  paragraphs: string[];
  lists: string[];
  testimonials: ExtractedTestimonial[];
  faqs: ExtractedFaq[];
  ctas: ExtractedCta[];
  copyFile?: string;
  audit: PageAuditHints;
};

export type OnboardBrief = {
  version: 2;
  sourceUrl: string;
  crawledAt: string;
  slug: string;
  business: BusinessFacts;
  missing: CriticalKey[];
  pages: BriefPage[];
  images: BriefImage[];
  warnings: string[];
  compose: string;
  visual?: OnboardVisual;
};

export type OnboardAudit = {
  version: 1;
  sourceUrl: string;
  crawledAt: string;
  pages: Array<{
    url: string;
    title: string;
    description: string;
    canonical?: string;
    lang?: string;
    h1Count: number;
    missingAlts: number;
    unlabeledInputs: number;
    hasCanonical: boolean;
    hasLang: boolean;
    hasJsonLd: boolean;
    titleLength: number;
    descriptionLength: number;
  }>;
  summary: {
    pageCount: number;
    pagesMissingTitle: number;
    pagesMissingDescription: number;
    pagesMultipleH1: number;
    pagesZeroH1: number;
    totalMissingAlts: number;
    totalUnlabeledInputs: number;
  };
  /** Filled by the research graph node (PSI / Lighthouse). */
  webVitals: null | {
    source: string;
    lcp?: number | string;
    inp?: number | string;
    tbt?: number | string;
    cls?: number | string;
    accessibilityScore?: number;
    seoScore?: number;
    performanceScore?: number;
    notes?: string;
  };
};

export type OnboardResearch = {
  version: 1;
  reviews: {
    rating?: number;
    count?: number;
    snippets: Array<{ text: string; author?: string; sourceUrl?: string }>;
    sourceUrls: string[];
  };
  social: SocialLink[];
  goals: {
    primaryConversion?: string;
    serviceArea?: string;
    doneWhen?: string;
    notes?: string;
  };
  sources: string[];
  completed: boolean;
};

const GENERIC_HEADING =
  /^(home|about( us)?|contact|blog|news|privacy|terms|faq|hours|location|gallery|welcome|our story|get in touch|follow us|our services|what we offer|why (choose us|choose|us)|testimonials?|support|legal|social|how it works|what'?s included|featured( work)?|built for)$/i;

const NOT_A_SERVICE =
  /agreement|policy|terms of service|privacy|cookie|contractor|universal terms|master services|^legal$|^support$|^social$|^about$|^home$|^shop$|^login$/i;

const NUMBERED_CASE_STUDY = /^\d{1,2}[\.\)]?\s+\S/;

const SERVICE_PATH = /\/(service|services|menu|offer|offers|treat|treatments)(\/|$)/i;

const SERVICE_PAGE = /\/(service|services|menu|offer|offers|pricing|features|packages)(\/|$)/i;

export const COMPOSE_NOTE =
  "Follow the agent skill graph (agent/PROMPT.md). Keep facts (name, phone, email, address, hours, services, primary CTA, social). Keep the old site’s media language: owner photos, illustrations, device mockups, portraits, and press marks — use interpret shortlist /media paths first. Invent new layout, copy, and chrome; do not clone the old grid 1:1. If the old home has a named visual chapter (How It Works, Featured work, Built for…), restyle it on the new home instead of moving it to an inner route.";

export function emptyFacts(): BusinessFacts {
  return {
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    hours: [],
    primaryCta: { label: "", href: "" },
    services: [],
    social: [],
  };
}

function first(...vals: (string | undefined | null)[]): string {
  for (const v of vals) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

export function parseHoursFromText(text: string): string[] {
  const days = "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun";
  const re = new RegExp(`\\b(${days})\\b[:\\s–-]+([^\\n<]{2,40})`, "gi");
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const hours = m[2]!.replace(/\s+/g, " ").trim();
    if (/closed|by appointment|\d/i.test(hours)) out.push(`${m[1]}: ${hours}`);
  }
  return [...new Set(out)].slice(0, 7);
}

function isServiceHeading(heading: string, pageUrl: string): boolean {
  if (GENERIC_HEADING.test(heading) || NOT_A_SERVICE.test(heading) || heading.length > 48) return false;
  try {
    const path = new URL(pageUrl).pathname;
    if (NUMBERED_CASE_STUDY.test(heading) && !SERVICE_PATH.test(path)) return false;
  } catch {
    if (NUMBERED_CASE_STUDY.test(heading)) return false;
  }
  return true;
}

export function inferServices(pages: ExtractedPage[]): { name: string; blurb: string }[] {
  const fromLd = pages.flatMap((p) => jsonLdServices(p.jsonLd)).filter((s) => isServiceHeading(s.name, ""));
  if (fromLd.length) return fromLd;

  const servicePages = pages.filter((p) => {
    try {
      const path = new URL(p.url).pathname;
      return SERVICE_PAGE.test(path) || /service|menu|offer|pricing|features/i.test(p.title);
    } catch {
      return false;
    }
  });
  const pool = servicePages.length ? servicePages : pages.slice(0, 1);
  const fromHeadings: { name: string; blurb: string }[] = [];
  for (const page of pool) {
    for (const heading of [...page.h1.slice(1), ...page.headings]) {
      if (!isServiceHeading(heading, page.url)) continue;
      if (fromHeadings.some((s) => s.name.toLowerCase() === heading.toLowerCase())) continue;
      const blurb =
        page.paragraphs.find(
          (p) =>
            p.length > 40 &&
            p.length < 220 &&
            p.toLowerCase().includes(heading.toLowerCase().slice(0, Math.min(12, heading.length))),
        ) || "";
      fromHeadings.push({ name: heading, blurb });
    }
  }
  return fromHeadings.slice(0, 12);
}

export function collectCandidateImages(pages: ExtractedPage[]): ExtractedImage[] {
  const seen = new Set<string>();
  const out: ExtractedImage[] = [];
  for (const page of pages) {
    for (const img of page.images) {
      if (seen.has(img.src)) {
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
      seen.add(img.src);
      out.push({ ...img });
    }
  }
  return out;
}

export function missingCritical(facts: BusinessFacts): CriticalKey[] {
  const missing: CriticalKey[] = [];
  if (!facts.name) missing.push("name");
  if (!facts.phone) missing.push("phone");
  if (!facts.email) missing.push("email");
  if (!facts.address && !facts.city) missing.push("address");
  if (!facts.primaryCta.label && !facts.primaryCta.href) missing.push("primaryCta");
  if (!facts.hours.length) missing.push("hours");
  if (!facts.services.length) missing.push("services");
  return missing;
}

export function mergeFacts(pages: ExtractedPage[], seed: Partial<BusinessFacts> = {}): BusinessFacts {
  const facts = emptyFacts();
  const ldList = pages.map((p) => businessFromJsonLd(p.jsonLd));
  facts.name = first(seed.name, ...ldList.map((b) => b.name), pages[0]?.h1[0], pages[0]?.title);
  facts.phone = first(seed.phone, ...ldList.map((b) => b.phone), ...pages.flatMap((p) => p.phones));
  facts.email = first(seed.email, ...ldList.map((b) => b.email), ...pages.flatMap((p) => p.emails));
  facts.address = first(seed.address, ...ldList.map((b) => b.address));
  facts.city = first(seed.city, ...ldList.map((b) => b.city));
  facts.hours = seed.hours?.length
    ? seed.hours
    : firstNonEmpty(
        ldList.flatMap((b) => b.hours || []),
        pages.flatMap((p) => parseHoursFromText([p.title, ...p.headings, ...p.paragraphs].join("\n"))),
      );
  const ctas = pages.flatMap((p) => p.ctas);
  const cta = inferPrimaryCta(ctas);
  facts.primaryCta =
    seed.primaryCta && (seed.primaryCta.label || seed.primaryCta.href)
      ? seed.primaryCta
      : { label: cta?.label || "", href: cta?.href || "" };
  facts.services = seed.services?.length ? seed.services : inferServices(pages);
  if (facts.name.includes("|")) facts.name = facts.name.split("|")[0]!.trim();

  if (seed.social?.length) {
    facts.social = seed.social;
  } else {
    const seen = new Set<string>();
    for (const page of pages) {
      for (const s of page.social) {
        const key = s.url.replace(/\/+$/, "").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        facts.social.push(s);
      }
    }
    // Also merge from all links/jsonLd if pages missed social field
    if (!facts.social.length) {
      facts.social = collectSocialLinks({
        links: pages.flatMap((p) => p.links),
        jsonLd: pages.flatMap((p) => p.jsonLd),
      });
    }
  }
  return facts;
}

function firstNonEmpty(a: string[], b: string[]): string[] {
  return a.length ? [...new Set(a)].slice(0, 8) : [...new Set(b)].slice(0, 8);
}

export function assembleBrief(opts: {
  sourceUrl: string;
  slug: string;
  pages: ExtractedPage[];
  images?: BriefImage[];
  warnings?: string[];
  seed?: Partial<BusinessFacts>;
  crawledAt?: string;
  copyFiles?: Map<string, string>;
  visual?: OnboardVisual;
}): OnboardBrief {
  const business = mergeFacts(opts.pages, opts.seed);
  const pages: BriefPage[] = opts.pages.map((p) => ({
    aliasOf: p.aliasOf,
    url: p.url,
    title: p.title,
    description: p.description,
    canonical: p.canonical,
    outline: p.outline,
    paragraphs: p.paragraphs,
    lists: p.lists || [],
    testimonials: p.testimonials || [],
    faqs: p.faqs || [],
    ctas: p.ctas,
    copyFile: opts.copyFiles?.get(p.url),
    audit: p.audit,
  }));
  return {
    version: 2,
    sourceUrl: opts.sourceUrl,
    crawledAt: opts.crawledAt || new Date().toISOString(),
    slug: opts.slug,
    business,
    missing: missingCritical(business),
    pages,
    images: opts.images || [],
    warnings: opts.warnings || [],
    compose: COMPOSE_NOTE,
    visual:
      opts.visual ||
      (opts.pages.length
        ? {
            register: inferRegister(opts.pages, business),
            signatureSections: inferSignatureSections(opts.pages),
            hints: {},
            stills: [],
          }
        : undefined),
  };
}

const SIGNATURE_HEADING =
  /how it works|what'?s included|featured|portfolio|built for|meet the team|testimonial|industries|our work|case stud/i;

export function inferSignatureSections(pages: ExtractedPage[]): string[] {
  const home = pages[0];
  if (!home) return [];
  const out: string[] = [];
  for (const heading of home.outline) {
    if (SIGNATURE_HEADING.test(heading) && !out.some((h) => h.toLowerCase() === heading.toLowerCase())) {
      out.push(heading);
    }
  }
  return out.slice(0, 8);
}

export function inferRegister(pages: ExtractedPage[], business: BusinessFacts): SiteRegister {
  const blob = [
    business.name,
    ...pages.slice(0, 6).flatMap((p) => [p.title, p.description, ...p.outline.slice(0, 12)]),
  ]
    .join(" ")
    .toLowerCase();
  if (/salon|spa|beauty|lash|nail|barber|med spa/.test(blob)) return "beauty";
  if (
    /platform|saas|software|demo|features|pricing|marketing agency|automations|digital marketing|website builder/.test(
      blob,
    )
  ) {
    return "b2b";
  }
  return "trade";
}

export function assembleAudit(opts: {
  sourceUrl: string;
  pages: ExtractedPage[];
  crawledAt?: string;
}): OnboardAudit {
  const pageRows = opts.pages.map((p) => ({
    url: p.url,
    title: p.title,
    description: p.description,
    canonical: p.canonical,
    lang: p.lang,
    ...p.audit,
  }));
  return {
    version: 1,
    sourceUrl: opts.sourceUrl,
    crawledAt: opts.crawledAt || new Date().toISOString(),
    pages: pageRows,
    summary: {
      pageCount: pageRows.length,
      pagesMissingTitle: pageRows.filter((p) => !p.title).length,
      pagesMissingDescription: pageRows.filter((p) => !p.description).length,
      pagesMultipleH1: pageRows.filter((p) => p.h1Count > 1).length,
      pagesZeroH1: pageRows.filter((p) => p.h1Count === 0).length,
      totalMissingAlts: pageRows.reduce((n, p) => n + p.missingAlts, 0),
      totalUnlabeledInputs: pageRows.reduce((n, p) => n + p.unlabeledInputs, 0),
    },
    webVitals: null,
  };
}

export function emptyResearch(social: SocialLink[] = []): OnboardResearch {
  return {
    version: 1,
    reviews: { snippets: [], sourceUrls: [] },
    social: [...social],
    goals: {},
    sources: [],
    completed: false,
  };
}
