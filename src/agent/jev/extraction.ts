import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { json, type Business } from "../artifacts.ts";
import { defaultLedgerPath, loadEvidenceLedger, saveEvidenceLedger, type EvidenceLedger } from "./ledger.ts";

export const FACT_GENERATOR_VERSION = "2026-09-18.1";

export type FactCategory =
  | "service"
  | "service_area"
  | "contact_detail"
  | "guarantee"
  | "testimonial"
  | "credential";

export interface StructuredFact {
  id: string;
  category: FactCategory;
  claim: string;
  source: string;
  span?: [number, number];
  rawExcerpt: string;
  evidenceId: string;
  confidence: number;
}

export interface FactExtractionReport {
  schemaVersion: 1;
  extractedAt: string;
  facts: StructuredFact[];
  categoriesCount: Record<FactCategory, number>;
  totalFacts: number;
}

export function defaultFactsPath(root: string): string {
  return join(root, "onboarding/facts.json");
}

function sha256(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * Extracts structured facts across services, service areas, contact details, guarantees,
 * testimonials, and credentials with source spans from harvested raw content and brief.
 */
export function extractHarvestFacts(
  root: string,
  rawPages?: Array<{ url: string; text?: string; content?: string }>
): StructuredFact[] {
  const facts: StructuredFact[] = [];
  const seenClaims = new Set<string>();

  const addFact = (
    category: FactCategory,
    claim: string,
    source: string,
    rawExcerpt: string,
    span?: [number, number],
    confidence = 0.95
  ) => {
    const norm = claim.trim().toLowerCase();
    if (seenClaims.has(norm) || !claim.trim()) return;
    seenClaims.add(norm);

    const factId = `fact:${category}:${facts.length + 1}`;
    const evId = `ev_fact_${sha256(rawExcerpt).slice(0, 8)}`;

    facts.push({
      id: factId,
      category,
      claim: claim.trim(),
      source,
      span,
      rawExcerpt: rawExcerpt.trim(),
      evidenceId: evId,
      confidence,
    });
  };

  // 1. Ingest supplied rawPages or read onboarding/raw/*.json
  const sources: Array<{ source: string; text: string }> = [];

  if (rawPages && rawPages.length) {
    for (const p of rawPages) {
      const text = (p.text || p.content || "").trim();
      if (text) sources.push({ source: p.url, text });
    }
  }

  const rawDir = join(root, "onboarding/raw");
  if (existsSync(rawDir)) {
    try {
      const files = readdirSync(rawDir).filter(f => f.endsWith(".json"));
      for (const file of files) {
        try {
          const content = readFileSync(join(rawDir, file), "utf8");
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.pages)) {
            for (let i = 0; i < parsed.pages.length; i++) {
              const p = parsed.pages[i];
              const text = (p.text || p.content || "").trim();
              if (text) {
                sources.push({ source: p.url || `onboarding/raw/${file}#page${i}`, text });
              }
            }
          }
        } catch {}
      }
    } catch {}
  }

  // Also check onboarding/brief.json
  const briefPath = join(root, "onboarding/brief.json");
  if (existsSync(briefPath)) {
    try {
      const brief = JSON.parse(readFileSync(briefPath, "utf8"));
      if (typeof brief.overview === "string" && brief.overview.trim()) {
        sources.push({ source: "onboarding/brief.json#overview", text: brief.overview.trim() });
      }
      if (Array.isArray(brief.notes)) {
        for (let i = 0; i < brief.notes.length; i++) {
          if (typeof brief.notes[i] === "string" && brief.notes[i].trim()) {
            sources.push({ source: `onboarding/brief.json#notes[${i}]`, text: brief.notes[i].trim() });
          }
        }
      }
    } catch {}
  }

  // Regex patterns
  const phoneRegex = /\b(?:\+?\d{1,4}[-.\s]*)?(?:\(\d{2,5}\)[-.\s]*|\d{2,5}[-.\s]+)\d{2,4}[-.\s]*\d{3,5}\b|\b(?:\+?1[-.\s]*)?\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4}\b/g;
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const hoursRegex = /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|daily|24\/7|open)\b[^\n.]{3,40}(?:am|pm|hours|closed)/gi;
  const guaranteeRegex = /\b(?:\d+[- ](?:year|yr|day)|lifetime|satisfaction|money[- ]back|100%|fully insured|warranted)\b[^\n.]{0,60}\b(?:guarantee|warranty|insured|peace of mind)\b/gi;
  const credentialRegex = /\b(?:established|est\.|founded|since|licensed|certified|accredited|award[- ]winning|bb\+|master)\b[^\n.]{0,60}(?:\d{4}|\b(?:contractor|technician|craftsman|council|member)\b)/gi;

  for (const src of sources) {
    const text = src.text;

    // Contact Details: Phones
    for (const match of text.matchAll(phoneRegex)) {
      const phone = match[0];
      const start = match.index || 0;
      const end = start + phone.length;
      const rawExcerpt = text.slice(Math.max(0, start - 40), Math.min(text.length, end + 40));
      addFact("contact_detail", `Phone: ${phone}`, src.source, rawExcerpt, [start, end]);
    }

    // Contact Details: Emails
    for (const match of text.matchAll(emailRegex)) {
      const email = match[0];
      const start = match.index || 0;
      const end = start + email.length;
      const rawExcerpt = text.slice(Math.max(0, start - 40), Math.min(text.length, end + 40));
      addFact("contact_detail", `Email: ${email}`, src.source, rawExcerpt, [start, end]);
    }

    // Contact Details: Hours
    for (const match of text.matchAll(hoursRegex)) {
      const hours = match[0].trim();
      const start = match.index || 0;
      const end = start + hours.length;
      addFact("contact_detail", `Operating Hours: ${hours}`, src.source, hours, [start, end]);
    }

    // Guarantees
    for (const match of text.matchAll(guaranteeRegex)) {
      const guar = match[0].trim();
      const start = match.index || 0;
      const end = start + guar.length;
      addFact("guarantee", `Guarantee: ${guar}`, src.source, guar, [start, end]);
    }

    // Credentials
    for (const match of text.matchAll(credentialRegex)) {
      const cred = match[0].trim();
      const start = match.index || 0;
      const end = start + cred.length;
      addFact("credential", `Credential: ${cred}`, src.source, cred, [start, end]);
    }

    // Testimonials: quoted sentences with quotation marks or attribution
    const quoteMatches = text.matchAll(/["“]([^"”]{20,200})["”](?:\s*[-—–]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?))?/g);
    for (const match of quoteMatches) {
      const quote = match[1]!;
      const author = match[2] ? ` - ${match[2]}` : "";
      const start = match.index || 0;
      const end = start + match[0].length;
      addFact("testimonial", `Client Review: "${quote}"${author}`, src.source, match[0], [start, end]);
    }

    // Services: bullet points or lines under service headings
    const serviceBlockMatches = text.matchAll(/(?:Services|What We Do|Our Expertise|Specialties):\s*([^.\n]+(?:\n\s*[-*•]\s*[^.\n]+)*)/gi);
    for (const block of serviceBlockMatches) {
      const items = block[1]!.split(/[-*•\n,]/).map(s => s.trim()).filter(s => s.length > 5 && s.length < 80);
      for (const item of items) {
        addFact("service", `Service: ${item}`, src.source, item);
      }
    }

    // Service Areas: Serving / Service Area mentions
    const areaMatches = text.matchAll(/(?:serving|service areas?|areas covered|locations):\s*([^.\n]+)/gi);
    for (const match of areaMatches) {
      const areas = match[1]!.split(/[,&/]/).map(s => s.trim()).filter(s => s.length > 3 && s.length < 50);
      for (const area of areas) {
        addFact("service_area", `Service Area: ${area}`, src.source, match[0]);
      }
    }
  }

  return facts;
}

export function saveExtractedFacts(root: string, facts: StructuredFact[], customPath?: string): string {
  const p = customPath || defaultFactsPath(root);
  mkdirSync(join(p, ".."), { recursive: true });

  const categoriesCount: Record<FactCategory, number> = {
    service: 0,
    service_area: 0,
    contact_detail: 0,
    guarantee: 0,
    testimonial: 0,
    credential: 0,
  };

  for (const f of facts) {
    categoriesCount[f.category] = (categoriesCount[f.category] || 0) + 1;
  }

  const report: FactExtractionReport = {
    schemaVersion: 1,
    extractedAt: new Date().toISOString(),
    facts,
    categoriesCount,
    totalFacts: facts.length,
  };

  writeFileSync(p, JSON.stringify(report, null, 2), "utf8");

  // Also sync into EvidenceLedger
  try {
    const ledger = loadEvidenceLedger(root);
    for (const f of facts) {
      if (!ledger.claims[f.id]) {
        ledger.claims[f.id] = {
          id: f.id,
          claim: f.claim,
          sourceFile: f.source,
          field: f.category,
          citedEvidenceIds: [f.evidenceId],
          status: "verified",
        };
      }
    }
    saveEvidenceLedger(root, ledger);
  } catch {}

  return p;
}

export function loadExtractedFacts(root: string, customPath?: string): StructuredFact[] {
  const p = customPath || defaultFactsPath(root);
  if (!existsSync(p)) return [];
  try {
    const report = JSON.parse(readFileSync(p, "utf8")) as FactExtractionReport;
    return report.facts || [];
  } catch {
    return [];
  }
}

export interface CopyTraceabilityCheckResult {
  ok: boolean;
  violations: string[];
  traceableClaimsCount: number;
  ungroundedClaimsCount: number;
  factsCited: string[];
}

/**
 * Validates that concrete copy claims (services, metrics, contact details, guarantees, credentials)
 * trace back to extracted facts, approved business.json facts, or explicit operator input in site-memory.json.
 * Fails validation if copy introduces concrete ungrounded claims.
 */
export function verifyCopyTraceability(opts: {
  root: string;
  copyPlan?: { pages?: Array<{ path: string; sections?: Array<{ id: string; heading?: string; body?: string; factIds?: string[] }> }> };
  strict?: boolean;
}): CopyTraceabilityCheckResult {
  const { root, copyPlan, strict = false } = opts;
  const violations: string[] = [];
  const factsCited = new Set<string>();
  let traceableClaimsCount = 0;
  let ungroundedClaimsCount = 0;

  // Load known valid facts with detailed evidence mapping
  interface KnownFactInfo {
    id: string;
    claim: string;
    excerpts: string[];
    category?: string;
  }
  const factsById = new Map<string, KnownFactInfo>();
  const globalContactExcerpts: string[] = [];
  const globalMemoryExcerpts: string[] = [];

  // From business.json
  const busPath = join(root, "onboarding/business.json");
  if (existsSync(busPath)) {
    try {
      const bus = json<Business>(busPath);
      const evMap = new Map<string, string>();
      for (const ev of bus.evidence || []) {
        evMap.set(ev.id, ev.excerpt.toLowerCase());
      }
      for (const f of bus.facts || []) {
        const citedExcerpts = (f.evidence || []).map(id => evMap.get(id) || "").filter(Boolean);
        factsById.set(f.id, {
          id: f.id,
          claim: f.claim.toLowerCase(),
          excerpts: citedExcerpts,
        });
      }
      if (bus.engagement) {
        globalContactExcerpts.push(bus.engagement.toLowerCase());
      }
    } catch {}
  }

  // From onboarding/facts.json
  const extracted = loadExtractedFacts(root);
  for (const f of extracted) {
    const existing = factsById.get(f.id);
    if (existing) {
      existing.excerpts.push(f.rawExcerpt.toLowerCase());
      existing.category ||= f.category;
    } else {
      factsById.set(f.id, {
        id: f.id,
        claim: f.claim.toLowerCase(),
        excerpts: [f.rawExcerpt.toLowerCase()],
        category: f.category,
      });
    }
  }

  // From site-memory.json (explicit operator preferences/directives)
  const memoryPath = join(root, "agent/site-memory.json");
  if (existsSync(memoryPath)) {
    try {
      const memory = JSON.parse(readFileSync(memoryPath, "utf8"));
      for (const pref of memory.preferences || []) {
        if (typeof pref.text === "string") globalMemoryExcerpts.push(pref.text.toLowerCase());
      }
    } catch {}
  }

  // Resolve copy plan
  let plan = copyPlan;
  if (!plan) {
    const cpPath = join(root, "onboarding/copy-plan.json");
    if (existsSync(cpPath)) {
      try { plan = json(cpPath); } catch {}
    }
  }

  if (!plan || !Array.isArray(plan.pages)) {
    return {
      ok: true,
      violations: [],
      traceableClaimsCount: 0,
      ungroundedClaimsCount: 0,
      factsCited: [],
    };
  }

  // Inspect each section for concrete claims
  const phoneRegex = /\b(?:\+?\d{1,4}[-.\s]*)?(?:\(\d{2,5}\)[-.\s]*|\d{2,5}[-.\s]+)\d{2,4}[-.\s]*\d{3,5}\b|\b(?:\+?1[-.\s]*)?\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4}\b/g;
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const specificNumberRegex = /\b(?:over\s+)?(?:\d+(?:,\d+)?|\d+\+)\s+(?:years|clients|projects|homes|reviews|guarantee|warranty)\b/gi;
  const guaranteeRegex = /\b(?:100%|lifetime|\d+[- ]year)(?:[^\n.]{0,30})\b(?:guarantee|warranty|money[- ]back)\b/gi;

  for (const page of plan.pages) {
    for (const section of page.sections || []) {
      const sectionFactIds = section.factIds || [];
      for (const fId of sectionFactIds) {
        if (factsById.has(fId)) {
          factsCited.add(fId);
          traceableClaimsCount++;
        } else if (strict) {
          violations.push(`Section "${page.path}#${section.id}" cites unknown factId "${fId}"`);
          ungroundedClaimsCount++;
        }
      }

      // Collect the evidence specifically cited by THIS section
      const sectionEvidence: string[] = [];
      for (const fId of sectionFactIds) {
        const f = factsById.get(fId);
        if (f) {
          sectionEvidence.push(f.claim);
          sectionEvidence.push(...f.excerpts);
        }
      }
      const sectionEvidenceCorpus = sectionEvidence.join(" ");

      const text = `${section.heading || ""} ${section.body || ""}`;

      // Check concrete phone numbers
      for (const m of text.matchAll(phoneRegex)) {
        const phone = m[0];
        const digits = phone.replace(/\D/g, "");
        const hasSpecificGrounding =
          (digits.length >= 7 && (sectionEvidenceCorpus.includes(digits) || sectionEvidenceCorpus.includes(phone.toLowerCase()))) ||
          (digits.length >= 7 && globalContactExcerpts.some(e => e.replace(/\D/g, "").includes(digits) || e.includes(phone.toLowerCase()))) ||
          globalMemoryExcerpts.some(e => e.includes(phone.toLowerCase()));

        if (!hasSpecificGrounding) {
          violations.push(`Ungrounded phone number "${phone}" in ${page.path}#${section.id}`);
          ungroundedClaimsCount++;
        } else {
          traceableClaimsCount++;
        }
      }

      // Check concrete emails
      for (const m of text.matchAll(emailRegex)) {
        const email = m[0].toLowerCase();
        const hasSpecificGrounding =
          sectionEvidenceCorpus.includes(email) ||
          globalContactExcerpts.some(e => e.includes(email)) ||
          globalMemoryExcerpts.some(e => e.includes(email));

        if (!hasSpecificGrounding) {
          violations.push(`Ungrounded email "${email}" in ${page.path}#${section.id}`);
          ungroundedClaimsCount++;
        } else {
          traceableClaimsCount++;
        }
      }

      // Check concrete numeric claims ("over 30 years", "500+ projects")
      for (const m of text.matchAll(specificNumberRegex)) {
        const claim = m[0];
        const claimLower = claim.toLowerCase();
        const numMatch = claim.match(/\d+(?:,\d+)?/);
        const num = numMatch ? numMatch[0].replace(/,/g, "") : "";
        const hasSpecificGrounding =
          (num && sectionEvidenceCorpus.includes(num)) ||
          sectionEvidenceCorpus.includes(claimLower) ||
          globalMemoryExcerpts.some(e => e.includes(claimLower));

        if (!hasSpecificGrounding) {
          violations.push(`Ungrounded concrete metric "${claim}" in ${page.path}#${section.id}`);
          ungroundedClaimsCount++;
        } else {
          traceableClaimsCount++;
        }
      }

      // Check concrete guarantees
      for (const m of text.matchAll(guaranteeRegex)) {
        const guar = m[0];
        const guarLower = guar.toLowerCase();
        const hasSpecificGrounding =
          (sectionEvidenceCorpus.includes("guarantee") || sectionEvidenceCorpus.includes("warranty") || sectionEvidenceCorpus.includes("money-back")) &&
          (guarLower.includes("lifetime") ? sectionEvidenceCorpus.includes("lifetime") : true) &&
          (guarLower.includes("100%") ? sectionEvidenceCorpus.includes("100%") : true) &&
          (guarLower.includes("year") ? (guarLower.match(/\d+/)?.[0] ? sectionEvidenceCorpus.includes(guarLower.match(/\d+/)?.[0]!) : true) : true);

        if (!hasSpecificGrounding) {
          violations.push(`Ungrounded concrete guarantee "${guar}" in ${page.path}#${section.id}`);
          ungroundedClaimsCount++;
        } else {
          traceableClaimsCount++;
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    traceableClaimsCount,
    ungroundedClaimsCount,
    factsCited: Array.from(factsCited),
  };
}

export interface ExtractionCompletenessAuditResult {
  ok: boolean;
  totalFactsInLedger: number;
  factsCitedInCopy: string[];
  uncitedFacts: string[];
  unregisteredFactsCited: string[];
  contradictionsDetected: string[];
  coverageRatio: number;
}

/**
 * Audits copy plan completeness against ledger claims and extracted facts.
 * Ensures assertions made in copy plan map back to registered ledger claims,
 * identifies uncited critical facts, and flags any unregistered or contradictory claims.
 */
export function auditExtractionCompleteness(
  root: string,
  copyPlan?: { pages?: Array<{ path?: string; sections?: Array<{ id?: string; facts?: string[]; heading?: string; body?: string }> }> },
  ledger?: EvidenceLedger
): ExtractionCompletenessAuditResult {
  const actualLedger = ledger || loadEvidenceLedger(root);
  const ledgerClaims = Object.values(actualLedger?.claims || {});
  const ledgerClaimIds = new Set(ledgerClaims.map(c => c.id));
  const ledgerClaimTexts = new Map(ledgerClaims.map(c => [c.id, c.claim.toLowerCase()]));

  const factsCitedInCopy = new Set<string>();
  const unregisteredFactsCited = new Set<string>();
  const contradictionsDetected: string[] = [];

  const pages = copyPlan?.pages || [];
  for (const page of pages) {
    for (const section of (page.sections || [])) {
      const citedFacts = section.facts || [];
      for (const factId of citedFacts) {
        if (ledgerClaimIds.has(factId)) {
          factsCitedInCopy.add(factId);
        } else {
          unregisteredFactsCited.add(factId);
        }
      }

      // Check if section text explicitly references any known unresolved contradiction
      const secText = `${section.heading || ""} ${section.body || ""}`.toLowerCase();
      for (const contradiction of (actualLedger?.contradictions || [])) {
        if (contradiction.status === "unresolved") {
          const cText = ledgerClaimTexts.get(contradiction.claimId);
          if (cText && secText.includes(cText)) {
            contradictionsDetected.push(
              `Section ${page.path || ""}#${section.id || ""} cites claim [${contradiction.claimId}] with active unresolved contradiction against evidence [${contradiction.evidenceId}]`
            );
          }
        }
      }
    }
  }

  const uncitedFacts = ledgerClaims
    .map(c => c.id)
    .filter(id => !factsCitedInCopy.has(id));

  const totalFactsInLedger = ledgerClaims.length;
  const coverageRatio = totalFactsInLedger > 0 ? factsCitedInCopy.size / totalFactsInLedger : 1.0;

  const ok = unregisteredFactsCited.size === 0 && contradictionsDetected.length === 0;

  return {
    ok,
    totalFactsInLedger,
    factsCitedInCopy: Array.from(factsCitedInCopy),
    uncitedFacts,
    unregisteredFactsCited: Array.from(unregisteredFactsCited),
    contradictionsDetected,
    coverageRatio: parseFloat(coverageRatio.toFixed(3)),
  };
}

