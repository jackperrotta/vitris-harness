import { extractHarvestFacts, FACT_GENERATOR_VERSION } from "./extraction.ts";
import { buildFieldCandidates } from "./business-draft.ts";
import { measureShortlistRecall, lexicalRetrieve } from "./ranking.ts";

export interface RecallGoldCase {
  id: string;
  kind: string;
  pages: Array<{ url: string; text: string }>;
  gold: Array<{ field: string; value: string }>;
  notes: string;
}

export const CANDIDATE_RECALL_CORPUS: RecallGoldCase[] = [
  {
    id: "contacts-and-hours",
    kind: "phone_email_hours_credential",
    pages: [{ url: "https://ex.test/contact", text: "Call 215-555-0100 or email info@ex.test. Licensed since 1998. Open Monday-Friday 9am-5pm hours." }],
    gold: [
      { field: "phone", value: "215-555-0100" },
      { field: "email", value: "info@ex.test" },
    ],
    notes: "Generator must surface phone and email spans.",
  },
  {
    id: "multi-offer-location",
    kind: "multiple_valid_offers",
    pages: [{ url: "https://ex.test/", text: "Services: roof repair, gutter cleaning. Serving: Philadelphia, Camden." }],
    gold: [
      { field: "offer", value: "roof repair" },
      { field: "offer", value: "gutter cleaning" },
      { field: "location", value: "Philadelphia" },
      { field: "location", value: "Camden" },
    ],
    notes: "Several legitimate offers/locations are not conflicts.",
  },
  {
    id: "third-party",
    kind: "third_party_contact",
    pages: [{ url: "https://ex.test/", text: "As featured in The Inquirer. Call 800-555-0199 for the newspaper, not our shop. Our shop: 215-555-0100." }],
    gold: [{ field: "phone", value: "215-555-0100" }],
    notes: "Third-party numbers remain candidates; Noul/Choice decide ownership. Completeness obligation stays with the agent.",
  },
  {
    id: "absent-fields",
    kind: "absent_fields",
    pages: [{ url: "https://ex.test/", text: "We restore historic masonry in the Cotswolds." }],
    gold: [],
    notes: "Absent contacts must not be invented.",
  },
  {
    id: "hours-qualifier",
    kind: "hours_qualifier",
    pages: [{ url: "https://ex.test/hours", text: "Open Monday-Friday 9am-5pm. Emergency after-hours dispatch is not 24/7." }],
    gold: [{ field: "hours", value: "Monday-Friday 9am-5pm" }],
    notes: "Qualifiers on hours must remain candidates; dropping them is an agent obligation.",
  },
  {
    id: "cta-destination",
    kind: "cta_destination",
    pages: [{ url: "https://ex.test/", text: "Schedule a visit at /contact. Email sales@ex.test is not the visit scheduler." }],
    gold: [{ field: "email", value: "sales@ex.test" }],
    notes: "CTA destinations are not interchangeable with contact emails.",
  },
  {
    id: "credential-heldout",
    kind: "credential",
    pages: [{ url: "https://ex.test/about", text: "EPA lead-safe certified. Fully insured. Serving Philadelphia homeowners." }],
    gold: [
      { field: "credential", value: "EPA lead-safe certified" },
      { field: "location", value: "Philadelphia" },
    ],
    notes: "Held-out credential recall; completeness stays with the agent.",
  },
];

export interface RecallAuditRow {
  caseId: string;
  generatorVersion: string;
  goldCount: number;
  hitCount: number;
  recall: number;
  missed: string[];
  completenessObligation: string;
}

export function auditCandidateRecall(opts?: { cases?: RecallGoldCase[] }): {
  generatorVersion: string;
  rows: RecallAuditRow[];
  meanRecall: number;
} {
  const cases = opts?.cases || CANDIDATE_RECALL_CORPUS;
  const rows: RecallAuditRow[] = [];
  for (const c of cases) {
    const facts = extractHarvestFacts("/nonexistent", c.pages);
    const cands = buildFieldCandidates(facts);
    const hits: string[] = [];
    const missed: string[] = [];
    for (const g of c.gold) {
      const found = cands.some(x => x.field === g.field && x.value.toLowerCase().includes(g.value.toLowerCase()));
      if (found) hits.push(`${g.field}:${g.value}`);
      else missed.push(`${g.field}:${g.value}`);
    }
    const recall = c.gold.length ? hits.length / c.gold.length : 1;
    rows.push({
      caseId: c.id,
      generatorVersion: FACT_GENERATOR_VERSION,
      goldCount: c.gold.length,
      hitCount: hits.length,
      recall,
      missed,
      completenessObligation: missed.length
        ? `Agent must scan harvest sources for missed ${missed.join(", ")} (generator ${FACT_GENERATOR_VERSION} blind spot).`
        : "Generator covered labeled gold spans; agent still owns ungenerated facts.",
    });
  }
  const meanRecall = rows.length ? rows.reduce((n, r) => n + r.recall, 0) / rows.length : 1;
  return { generatorVersion: FACT_GENERATOR_VERSION, rows, meanRecall };
}

export function auditShortlistRecall(): { recall: number; totalGold: number } {
  const evidence = [
    { id: "E1", source: "a", excerpt: "Open 24 hours daily without exception." },
    { id: "E2", source: "b", excerpt: "Closed on Sundays and holidays." },
    { id: "E3", source: "c", excerpt: "Our trucks are white." },
  ];
  const short = lexicalRetrieve(evidence, "Open 24 hours daily", 2);
  return measureShortlistRecall(short, evidence, ["E1", "E2"]);
}
