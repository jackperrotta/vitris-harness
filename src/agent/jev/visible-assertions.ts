import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { json, type Business } from "../artifacts.ts";
import { loadEvidenceLedger } from "./ledger.ts";
import { attr, classList, descendants, parseHtml, textContent, type HtmlElement } from "./html-tree.ts";

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function stableId(parts: string[]): string {
  return `va_${sha(parts.join("\0")).slice(0, 16)}`;
}

export type EvidenceStatus = "resolved" | "missing" | "stale" | "conflicting" | "unrelated" | "none_cited";

export interface ResolvedEvidence {
  id: string;
  excerpt: string;
  source: string;
  hash: string;
  span?: [number, number];
}

export type AssertionMatchKind = "stable-id" | "section-element" | "bounded-semantic" | "unmatched" | "conflict";

export interface SourceLocation {
  file: string;
  start: number;
  end: number;
}

export interface VisibleAssertion {
  id: string;
  pagePath: string;
  sectionId: string;
  element: string;
  text: string;
  origin: "copy-plan" | "compiled-html";
  sourceHash: string;
  factIds: string[];
  evidence: ResolvedEvidence[];
  evidenceStatus: EvidenceStatus;
  evidenceObligation?: string;
  sourceLocation?: SourceLocation;
  matchKind?: AssertionMatchKind;
  plannedId?: string;
  factIdsAttached?: boolean;
}

export interface CtaPair {
  id: string;
  label: string;
  behavior: string;
  behaviorKind: "planned" | "rendered" | "browser-observed";
  location: string;
  href?: string;
  linkResolved?: boolean;
  pagePath: string;
}

export interface AssertionDelta {
  added: VisibleAssertion[];
  dropped: VisibleAssertion[];
  strengthened: Array<{ planned: VisibleAssertion; rendered: VisibleAssertion }>;
}

export function resolveFactEvidence(root: string, factIds: string[]): {
  evidence: ResolvedEvidence[];
  status: EvidenceStatus;
  obligation?: string;
} {
  if (!factIds.length) {
    return { evidence: [], status: "none_cited", obligation: "No fact IDs cited; agent must bind evidence or remove the assertion." };
  }
  let bus: Business | undefined;
  const busPath = join(root, "onboarding/business.json");
  if (existsSync(busPath)) {
    try { bus = json<Business>(busPath); } catch { /* ignore */ }
  }
  const ledger = loadEvidenceLedger(root);
  const evidence: ResolvedEvidence[] = [];
  let status: EvidenceStatus = "resolved";
  const missing: string[] = [];
  for (const factId of factIds) {
    const fact = bus?.facts?.find(f => f.id === factId);
    const ledgerClaim = ledger.claims[factId];
    if (ledgerClaim?.status === "contradicted") status = "conflicting";
    const cited = [
      ...(fact?.evidence || []),
      ...(ledgerClaim?.citedEvidenceIds || []),
    ];
    if (!fact && !ledgerClaim) {
      missing.push(factId);
      status = status === "conflicting" ? status : "missing";
      continue;
    }
    for (const evId of [...new Set(cited)]) {
      const ledgerItem = ledger.items.find(i => i.id === evId);
      const busItem = bus?.evidence?.find(e => e.id === evId);
      const excerpt = (ledgerItem?.text || busItem?.excerpt || "").trim();
      const source = ledgerItem?.source || busItem?.source || "";
      if (!excerpt || !source) {
        missing.push(evId);
        status = status === "conflicting" ? status : "missing";
        continue;
      }
      const hash = ledgerItem?.hash || sha(excerpt);
      evidence.push({
        id: evId,
        excerpt,
        source,
        hash,
        span: ledgerItem?.span,
      });
      if (ledger.contradictions.some(c => c.evidenceId === evId && c.status === "unresolved")) {
        status = "conflicting";
      }
    }
    if (!cited.length) {
      missing.push(factId);
      status = status === "conflicting" ? status : "missing";
    }
  }
  if (status === "missing" || missing.length) {
    return {
      evidence,
      status: evidence.length && status !== "conflicting" ? "missing" : status,
      obligation: `Missing, stale, or unbound evidence for ${missing.join(", ") || factIds.join(", ")}. Do not use the assertion as its own evidence.`,
    };
  }
  if (!evidence.length) {
    return {
      evidence: [],
      status: "missing",
      obligation: `Fact IDs ${factIds.join(", ")} did not resolve to source excerpts.`,
    };
  }
  return { evidence, status };
}

function bindEvidence(root: string, assertion: Omit<VisibleAssertion, "evidence" | "evidenceStatus" | "evidenceObligation">): VisibleAssertion {
  const resolved = resolveFactEvidence(root, assertion.factIds);
  return {
    ...assertion,
    evidence: resolved.evidence,
    evidenceStatus: resolved.status,
    evidenceObligation: resolved.obligation,
  };
}

function pushAtomic(
  root: string,
  out: VisibleAssertion[],
  opts: {
    pagePath: string;
    sectionId: string;
    element: string;
    text: string;
    origin: VisibleAssertion["origin"];
    factIds: string[];
    sourceRaw: string;
    sourceLocation?: SourceLocation;
  }
): void {
  const text = opts.text.replace(/\s+/g, " ").trim();
  if (!text) return;
  out.push(bindEvidence(root, {
    id: stableId([opts.origin, opts.pagePath, opts.sectionId, opts.element, text.slice(0, 80)]),
    pagePath: opts.pagePath,
    sectionId: opts.sectionId,
    element: opts.element,
    text,
    origin: opts.origin,
    sourceHash: sha(opts.sourceRaw),
    factIds: opts.factIds,
    sourceLocation: opts.sourceLocation,
  }));
}

function splitSentences(body: string): string[] {
  return body.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length >= 12);
}

export function extractPlannedAssertions(root: string): VisibleAssertion[] {
  const out: VisibleAssertion[] = [];
  const copyPath = join(root, "onboarding/copy-plan.json");
  if (!existsSync(copyPath)) return out;
  try {
    const copy = JSON.parse(readFileSync(copyPath, "utf8"));
    for (const page of copy.pages || []) {
      const pagePath = page.path || "/";
      for (const section of page.sections || []) {
        const sectionId = String(section.id || "section");
        const factIds = Array.isArray(section.factIds) ? section.factIds.map(String) : [];
        const raw = JSON.stringify(section);
        if (section.heading) {
          pushAtomic(root, out, { pagePath, sectionId, element: "heading", text: String(section.heading), origin: "copy-plan", factIds, sourceRaw: raw });
        }
        if (section.body) {
          for (const sentence of splitSentences(String(section.body))) {
            pushAtomic(root, out, { pagePath, sectionId, element: "body", text: sentence, origin: "copy-plan", factIds, sourceRaw: raw });
          }
        }
        if (section.caption) {
          pushAtomic(root, out, { pagePath, sectionId, element: "caption", text: String(section.caption), origin: "copy-plan", factIds, sourceRaw: raw });
        }
        if (section.cta) {
          pushAtomic(root, out, { pagePath, sectionId, element: "cta", text: String(section.cta), origin: "copy-plan", factIds, sourceRaw: raw });
        }
      }
    }
  } catch { /* ignore */ }
  return out;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function isSectionEl(el: HtmlElement): boolean {
  if (["section", "article", "header", "main"].includes(el.tag)) return true;
  if (attr(el, "data-section") || attr(el, "data-slot")) return true;
  if (attr(el, "id") && classList(el).some(c => /section|hero|block/.test(c))) return true;
  return false;
}

function nearestSection(el: HtmlElement, ancestors: HtmlElement[]): HtmlElement | undefined {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (isSectionEl(ancestors[i]!)) return ancestors[i];
  }
  return isSectionEl(el) ? el : undefined;
}

function sectionIdOf(el: HtmlElement | undefined, fallback: string): string {
  if (!el) return fallback;
  return attr(el, "data-section") || attr(el, "id") || attr(el, "data-slot") || fallback;
}

function isCtaAnchor(el: HtmlElement): boolean {
  if (el.tag !== "a") return false;
  const cls = classList(el).join(" ");
  const slot = attr(el, "data-slot") || "";
  return /\bbtn\b|\bcta\b|\bbutton\b/.test(cls) || /^(cta|action|actions)$/i.test(slot);
}

function walkTree(
  node: HtmlElement,
  ancestors: HtmlElement[],
  visit: (el: HtmlElement, ancestors: HtmlElement[]) => void
): void {
  visit(node, ancestors);
  const next = [...ancestors, node];
  for (const child of node.children) {
    if (child.type === "element") walkTree(child, next, visit);
  }
}

function extractFromHtml(root: string, html: string, pagePath: string, origin: "compiled-html", file: string): VisibleAssertion[] {
  const out: VisibleAssertion[] = [];
  const doc = parseHtml(html);
  const loc = (el: HtmlElement): SourceLocation => ({ file, start: el.start, end: el.end });

  const meta = descendants(doc).find(el => el.tag === "meta" && (attr(el, "name") || "").toLowerCase() === "description");
  if (meta) {
    const content = attr(meta, "content") || "";
    if (content) {
      pushAtomic(root, out, {
        pagePath, sectionId: "meta", element: "meta-description", text: content,
        origin, factIds: [], sourceRaw: html.slice(meta.start, meta.end), sourceLocation: loc(meta),
      });
    }
  }

  let sectionOrdinal = 0;
  const seen = new Set<string>();
  walkTree(doc, [], (el, ancestors) => {
    if (el.tag === "#document") return;
    const section = nearestSection(el, ancestors) || (isSectionEl(el) ? el : undefined);
    if (isSectionEl(el) && section === el) sectionOrdinal += 1;
    const sectionId = sectionIdOf(section, `section_${sectionOrdinal || 1}`);
    const source = html.slice(el.start, el.end);

    if (/^h[1-3]$/.test(el.tag) && nearestSection(el, ancestors) === section) {
      const text = textContent(el);
      const key = `${sectionId}:heading:${text}`;
      if (text && !seen.has(key)) {
        seen.add(key);
        pushAtomic(root, out, {
          pagePath, sectionId, element: "heading", text, origin, factIds: [],
          sourceRaw: source, sourceLocation: loc(el),
        });
      }
    }

    if (el.tag === "p") {
      const classes = classList(el).join(" ");
      if (/\bcaption\b/.test(classes)) return;
      const text = textContent(el);
      if (text.length < 12) return;
      const key = `${sectionId}:body:${text}`;
      if (seen.has(key)) return;
      seen.add(key);
      pushAtomic(root, out, {
        pagePath, sectionId, element: "body", text, origin, factIds: [],
        sourceRaw: source, sourceLocation: loc(el),
      });
    }

    if (el.tag === "figcaption" || classList(el).includes("caption")) {
      const text = textContent(el);
      const key = `${sectionId}:caption:${text}`;
      if (text && !seen.has(key)) {
        seen.add(key);
        pushAtomic(root, out, {
          pagePath, sectionId, element: "caption", text, origin, factIds: [],
          sourceRaw: source, sourceLocation: loc(el),
        });
      }
    }
  });
  return out;
}

function walkHtml(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) out.push(...walkHtml(full));
    else if (name.endsWith(".html") && !name.startsWith(".")) out.push(full);
  }
  return out;
}

function htmlPathToRoute(root: string, file: string, base: "pages" | "dist"): string {
  const rel = relative(join(root, base), file).replace(/\\/g, "/");
  if (rel === "index.html") return "/";
  return `/${rel.replace(/\/index\.html$/i, "").replace(/\.html$/i, "")}`;
}

export function extractRenderedAssertions(root: string): VisibleAssertion[] {
  const out: VisibleAssertion[] = [];
  const distFiles = walkHtml(join(root, "dist"));
  const pageFiles = walkHtml(join(root, "pages"));
  const files = distFiles.length ? distFiles.map(f => ({ file: f, base: "dist" as const })) : pageFiles.map(f => ({ file: f, base: "pages" as const }));
  for (const { file, base } of files) {
    try {
      const html = readFileSync(file, "utf8");
      const rel = relative(root, file).replace(/\\/g, "/");
      out.push(...extractFromHtml(root, html, htmlPathToRoute(root, file, base), "compiled-html", rel));
    } catch { /* ignore */ }
  }
  return out;
}

export function extractAssertionsForNode(root: string, nodeId: string): VisibleAssertion[] {
  if (nodeId === "content-review") {
    return attachLineage(root, extractPlannedAssertions(root), extractRenderedAssertions(root)).linked;
  }
  return extractPlannedAssertions(root);
}

const QUALIFIER_RE = /\b(up to|as of|may|typically|weekdays?|monday|not |except|from \d|until|limited)\b/i;
const STRONGER_RE = /\b(24\/7|guaranteed|always|never fails|award-winning|best)\b/i;

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\W+/).filter(w => w.length > 2));
}

export function tokenOverlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.min(ta.size, tb.size);
}

export interface LineageResult {
  linked: VisibleAssertion[];
  unmatchedRendered: VisibleAssertion[];
  unmatchedPlanned: VisibleAssertion[];
  conflicts: VisibleAssertion[];
  stale: VisibleAssertion[];
  reusedHeadings: Array<{ text: string; sections: string[] }>;
}

export function currentCopySectionHashes(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const copyPath = join(root, "onboarding/copy-plan.json");
  if (!existsSync(copyPath)) return out;
  try {
    const copy = JSON.parse(readFileSync(copyPath, "utf8"));
    for (const page of copy.pages || []) {
      for (const section of page.sections || []) {
        out.set(`${page.path || "/"}#${section.id || "section"}`, sha(JSON.stringify(section)));
      }
    }
  } catch { /* ignore */ }
  return out;
}

function rebind(root: string, assertion: VisibleAssertion, factIds: string[]): VisibleAssertion {
  const resolved = resolveFactEvidence(root, factIds);
  return {
    ...assertion,
    factIds,
    evidence: resolved.evidence,
    evidenceStatus: resolved.status,
    evidenceObligation: resolved.obligation,
    factIdsAttached: factIds.length > 0,
  };
}

export function attachLineage(root: string, planned: VisibleAssertion[], rendered: VisibleAssertion[]): LineageResult {
  const used = new Set<string>();
  const linked: VisibleAssertion[] = [];
  const unmatchedRendered: VisibleAssertion[] = [];
  const conflicts: VisibleAssertion[] = [];
  const stale: VisibleAssertion[] = [];
  const hashes = currentCopySectionHashes(root);

  for (const r of rendered) {
    const exact = planned.find(p =>
      !used.has(p.id) &&
      p.pagePath === r.pagePath &&
      p.sectionId === r.sectionId &&
      p.element === r.element &&
      p.text.toLowerCase() === r.text.toLowerCase()
    );
    if (exact) {
      used.add(exact.id);
      const bound = rebind(root, { ...r, matchKind: "stable-id", plannedId: exact.id, sourceHash: exact.sourceHash }, exact.factIds);
      const live = hashes.get(`${exact.pagePath}#${exact.sectionId}`);
      if (live && live !== exact.sourceHash) {
        stale.push({ ...bound, evidenceStatus: "stale", evidenceObligation: `Source hash stale for ${exact.pagePath}#${exact.sectionId}` });
      }
      linked.push(bound);
      continue;
    }

    const sameSlots = planned.filter(p =>
      !used.has(p.id) && p.pagePath === r.pagePath && p.sectionId === r.sectionId && p.element === r.element
    );
    const compatible = sameSlots
      .map(p => ({ p, overlap: tokenOverlap(p.text, r.text) }))
      .filter(({ p, overlap }) => {
        if (overlap >= 0.35) return true;
        const qualifierShift = QUALIFIER_RE.test(p.text) && !QUALIFIER_RE.test(r.text);
        const strongerShift = !STRONGER_RE.test(p.text) && STRONGER_RE.test(r.text);
        return (qualifierShift || strongerShift) && overlap >= 0.15;
      })
      .sort((a, b) => b.overlap - a.overlap);
    if (compatible[0]) {
      const sameSlot = compatible[0].p;
      used.add(sameSlot.id);
      const bound = rebind(root, { ...r, matchKind: "section-element", plannedId: sameSlot.id, sourceHash: sameSlot.sourceHash }, sameSlot.factIds);
      const live = hashes.get(`${sameSlot.pagePath}#${sameSlot.sectionId}`);
      if (live && live !== sameSlot.sourceHash) {
        stale.push({ ...bound, evidenceStatus: "stale", evidenceObligation: `Source hash stale for ${sameSlot.pagePath}#${sameSlot.sectionId}` });
      }
      linked.push(bound);
      continue;
    }

    const semantic = planned.filter(p =>
      !used.has(p.id) && p.pagePath === r.pagePath && p.element === r.element && tokenOverlap(p.text, r.text) >= 0.6
    );
    if (semantic.length === 1) {
      const hit = semantic[0]!;
      used.add(hit.id);
      linked.push(rebind(root, { ...r, matchKind: "bounded-semantic", plannedId: hit.id, sourceHash: hit.sourceHash }, hit.factIds));
      continue;
    }
    if (semantic.length > 1) {
      const conflicted = rebind(root, { ...r, matchKind: "conflict" }, []);
      conflicts.push(conflicted);
      linked.push(conflicted);
      continue;
    }

    const unmatched = rebind(root, { ...r, matchKind: "unmatched", plannedId: undefined }, []);
    unmatchedRendered.push(unmatched);
    linked.push(unmatched);
  }

  const unmatchedPlanned = planned.filter(p => !used.has(p.id));
  const headingMap = new Map<string, string[]>();
  for (const a of rendered.filter(x => x.element === "heading")) {
    const k = a.text.toLowerCase();
    headingMap.set(k, [...(headingMap.get(k) || []), `${a.pagePath}#${a.sectionId}`]);
  }
  const reusedHeadings = [...headingMap.entries()]
    .filter(([, sections]) => new Set(sections).size > 1)
    .map(([text, sections]) => ({ text, sections: [...new Set(sections)] }));

  return { linked, unmatchedRendered, unmatchedPlanned, conflicts, stale, reusedHeadings };
}

export function comparePlannedToRendered(planned: VisibleAssertion[], rendered: VisibleAssertion[]): AssertionDelta {
  const lineage = attachLineage("", planned, rendered);
  const added = lineage.unmatchedRendered;
  const dropped = lineage.unmatchedPlanned;
  const strengthened: AssertionDelta["strengthened"] = [];
  for (const r of lineage.linked) {
    if (r.matchKind !== "section-element" && r.matchKind !== "bounded-semantic" && r.matchKind !== "stable-id") continue;
    const p = planned.find(x => x.id === r.plannedId);
    if (!p || p.text === r.text) continue;
    const included = r.text.toLowerCase().includes(p.text.toLowerCase().slice(0, 24));
    if (included && r.text.length > p.text.length + 8) {
      strengthened.push({ planned: p, rendered: r });
      continue;
    }
    if ((QUALIFIER_RE.test(p.text) && !QUALIFIER_RE.test(r.text)) || (!STRONGER_RE.test(p.text) && STRONGER_RE.test(r.text))) {
      strengthened.push({ planned: p, rendered: r });
    }
  }
  return { added, dropped, strengthened };
}

function routeExists(root: string, href: string): boolean {
  if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return href.startsWith("mailto:") || href.startsWith("tel:");
  if (/^https?:/i.test(href)) return true;
  const clean = href.replace(/^\.\//, "").replace(/\/$/, "") || "index";
  const candidates = [
    join(root, "pages", clean === "/" || clean === "index" ? "index.html" : `${clean.replace(/^\//, "")}.html`),
    join(root, "pages", `${clean.replace(/^\//, "")}/index.html`),
    join(root, "dist", clean === "/" || clean === "index" ? "index.html" : `${clean.replace(/^\//, "")}/index.html`),
    join(root, "dist", `${clean.replace(/^\//, "")}.html`),
  ];
  return candidates.some(p => existsSync(p));
}

function loadBrowserObservations(root: string): Array<{ label: string; href: string; page?: string; action?: string }> {
  const out: Array<{ label: string; href: string; page?: string; action?: string }> = [];
  for (const rel of ["agent/reviews/browser.json", "agent/reviews/representative-browser.json"]) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, "utf8"));
      const rows = Array.isArray(data) ? data : (data.ctas || data.actions || data.findings || []);
      for (const row of rows) {
        const label = String(row.label || row.text || row.cta || "").trim();
        const href = String(row.href || row.destination || row.url || row.target || "").trim();
        if (label && href) out.push({ label, href, page: row.page || row.path, action: row.action || row.behavior || row.observedAction });
      }
    } catch { /* ignore */ }
  }
  return out;
}

export function extractPlannedCtas(root: string): CtaPair[] {
  const pairs: CtaPair[] = [];
  const copyPath = join(root, "onboarding/copy-plan.json");
  const storyPath = join(root, "onboarding/storyboard.json");
  if (!existsSync(copyPath)) return pairs;
  let storyActions = new Map<string, { href: string; behavior: string }>();
  if (existsSync(storyPath)) {
    try {
      const story = JSON.parse(readFileSync(storyPath, "utf8"));
      for (const page of story.pages || []) {
        for (const action of page.actions || page.sections?.map((s: any) => s.action).filter(Boolean) || []) {
          if (!action) continue;
          const label = String(action.label || "").toLowerCase();
          const href = String(action.href || action.destination || "");
          if (label && href) storyActions.set(label, { href, behavior: String(action.behavior || action.method || "nav") });
        }
      }
    } catch { /* ignore */ }
  }
  try {
    const copy = JSON.parse(readFileSync(copyPath, "utf8"));
    let n = 0;
    for (const page of copy.pages || []) {
      for (const section of page.sections || []) {
        if (!section.cta) continue;
        n += 1;
        const planned = storyActions.get(String(section.cta).toLowerCase());
        const href = planned?.href || section.ctaHref || section.destination;
        pairs.push({
          id: `cta_planned_${n}`,
          label: String(section.cta),
          behavior: href
            ? `planned: ${href} (${planned?.behavior || "nav"})`
            : "planned: unrecorded storyboard behavior",
          behaviorKind: "planned",
          location: `${page.path || "/"}#${section.id || n}`,
          href,
          linkResolved: href ? routeExists(root, String(href)) : false,
          pagePath: page.path || "/",
        });
      }
    }
  } catch { /* ignore */ }
  return pairs;
}

export function extractRenderedCtas(root: string): CtaPair[] {
  const pairs: CtaPair[] = [];
  const distFiles = walkHtml(join(root, "dist"));
  const pageFiles = walkHtml(join(root, "pages"));
  const files = distFiles.length ? distFiles.map(f => ({ file: f, base: "dist" as const })) : pageFiles.map(f => ({ file: f, base: "pages" as const }));
  let n = 0;
  for (const { file, base } of files) {
    let html = "";
    try { html = readFileSync(file, "utf8"); } catch { continue; }
    const pagePath = htmlPathToRoute(root, file, base);
    const doc = parseHtml(html);
    for (const el of descendants(doc)) {
      if (!isCtaAnchor(el)) continue;
      const label = textContent(el) || stripTags(html.slice(el.innerStart, el.innerEnd));
      if (!label) continue;
      const href = attr(el, "href");
      n += 1;
      pairs.push({
        id: `cta_rendered_${n}`,
        label,
        behavior: `rendered: ${href || "missing href"}`,
        behaviorKind: "rendered",
        location: `${pagePath}#cta_${n}`,
        href,
        linkResolved: href ? routeExists(root, href) : false,
        pagePath,
      });
    }
  }
  const observed = loadBrowserObservations(root);
  for (const obs of observed) {
    const existing = pairs.find(p => p.label.toLowerCase() === obs.label.toLowerCase());
    if (existing) {
      existing.behavior = `browser-observed: ${obs.href} (${obs.action || "nav"})`;
      existing.behaviorKind = "browser-observed";
      existing.href = obs.href;
      existing.linkResolved = routeExists(root, obs.href);
    } else {
      n += 1;
      pairs.push({
        id: `cta_observed_${n}`,
        label: obs.label,
        behavior: `browser-observed: ${obs.href} (${obs.action || "nav"})`,
        behaviorKind: "browser-observed",
        location: `${obs.page || "/"}#observed`,
        href: obs.href,
        linkResolved: routeExists(root, obs.href),
        pagePath: obs.page || "/",
      });
    }
  }
  return pairs;
}

export function extractCtasForNode(root: string, nodeId: string): CtaPair[] {
  if (nodeId === "content-review") return extractRenderedCtas(root);
  return extractPlannedCtas(root);
}

export function formatEvidenceForJev(assertion: VisibleAssertion): string | undefined {
  if (assertion.evidenceStatus !== "resolved" && assertion.evidenceStatus !== "conflicting") return undefined;
  if (!assertion.evidence.length) return undefined;
  return assertion.evidence.map(e => `[${e.id} ${e.source} ${e.hash.slice(0, 12)}] ${e.excerpt}`).join("\n");
}

const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

export function extractPhones(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.match(PHONE_RE) || []) {
    const n = normalizePhone(m);
    if (n.length === 10) out.add(n);
  }
  return [...out];
}

export function authorizedPhones(root: string): Set<string> {
  const allowed = new Set<string>();
  const busPath = join(root, "onboarding/business.json");
  if (existsSync(busPath)) {
    try {
      const bus = json<Business>(busPath);
      for (const f of bus.facts || []) {
        for (const p of extractPhones(`${f.claim} ${(f.evidence || []).join(" ")}`)) allowed.add(p);
      }
      for (const ev of bus.evidence || []) {
        for (const p of extractPhones(`${ev.excerpt} ${ev.source}`)) allowed.add(p);
      }
    } catch { /* ignore */ }
  }
  const ledger = loadEvidenceLedger(root);
  for (const ev of ledger.items || []) {
    for (const p of extractPhones(ev.text || "")) allowed.add(p);
  }
  allowed.delete("");
  return allowed;
}

export function unauthorizedContactFindings(root: string, assertions: VisibleAssertion[]): Array<{
  id: string;
  location: string;
  phone: string;
  text: string;
}> {
  const allowed = authorizedPhones(root);
  const out: Array<{ id: string; location: string; phone: string; text: string }> = [];
  for (const a of assertions) {
    for (const phone of extractPhones(a.text)) {
      if (allowed.size && !allowed.has(phone)) {
        out.push({
          id: `phone_${a.id}_${phone}`,
          location: `${a.pagePath}#${a.sectionId}`,
          phone,
          text: a.text,
        });
      }
    }
  }
  return out;
}
