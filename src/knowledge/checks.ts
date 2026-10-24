import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import type { QualityFinding } from "./contracts.ts";
import { LAUNCH_POLICY_ID } from "./contracts.ts";

export const VERIFIER_VERSION = "2026-09-22";

export const TRANSFER_BUDGETS = {
  id: "vitris-transfer-2026-09-22",
  authority: "project-policy" as const,
  firstPartyJsGzip: 100 * 1024,
  cssGzip: 100 * 1024,
  fonts: 200 * 1024,
  initialTransfer: Math.round(1.5 * 1024 * 1024),
};

function finding(partial: Omit<QualityFinding, "verifierVersion" | "policyHash" | "verifiedAt"> & { verifiedAt?: string }): QualityFinding {
  return {
    ...partial,
    verifierVersion: VERIFIER_VERSION,
    policyHash: LAUNCH_POLICY_ID,
    verifiedAt: partial.verifiedAt || "1970-01-01T00:00:00.000Z",
  };
}

function relChannel(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function parseHex(input: string): [number, number, number] | undefined {
  const raw = input.trim().replace("#", "");
  const hex = raw.length === 3 ? raw.split("").map(ch => ch + ch).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

export function contrastRatio(foreground: string, background: string): number | undefined {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) return undefined;
  const L = (rgb: [number, number, number]) => 0.2126 * relChannel(rgb[0]) + 0.7152 * relChannel(rgb[1]) + 0.0722 * relChannel(rgb[2]);
  const lighter = Math.max(L(fg), L(bg));
  const darker = Math.min(L(fg), L(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of raw.matchAll(/([:@\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? "";
  return out;
}

type ParsedNode = { tagName?: string; attrs?: { name: string; value: string }[]; childNodes?: ParsedNode[]; parentNode?: ParsedNode; value?: string };
function elements(html: string): ParsedNode[] {
  const found: ParsedNode[] = [];
  const walk = (node: ParsedNode) => { if (node.tagName) found.push(node); for (const child of node.childNodes || []) walk(child); };
  walk(parse(html) as unknown as ParsedNode);
  return found;
}
function nodeAttrs(node: ParsedNode): Record<string, string> {
  return Object.fromEntries((node.attrs || []).map(item => [item.name.toLowerCase(), item.value]));
}
function nodeText(node: ParsedNode): string {
  return (node.value || "") + (node.childNodes || []).map(nodeText).join("");
}
function accessibleName(tag: string, node: ParsedNode, all: ParsedNode[]): boolean {
  const a = nodeAttrs(node);
  if (a["aria-label"]?.trim()) return true;
  if (a["aria-labelledby"] && a["aria-labelledby"].split(/\s+/).every(id => all.some(entry => nodeAttrs(entry).id === id && nodeText(entry).trim()))) return true;
  if (a.id && all.some(entry => entry.tagName === "label" && nodeAttrs(entry).for === a.id && nodeText(entry).trim())) return true;
  let parent = node.parentNode;
  while (parent) { if (parent.tagName === "label" && nodeText(parent).trim()) return true; parent = parent.parentNode; }
  if (tag === "input" && a.type === "image" && a.alt?.trim()) return true;
  if (a.title?.trim()) return true;
  return false;
}

export function auditFragment(html: string, page = "/"): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const all = elements(html);
  const controls = all.filter(node => ["input", "textarea", "select"].includes(node.tagName || ""));
  for (const node of controls) {
    const tag = node.tagName!;
    const a = nodeAttrs(node);
    const type = (a.type || "").toLowerCase();
    if (tag === "input" && ["hidden", "submit", "button", "reset"].includes(type)) continue;
    if ("disabled" in a) {
      findings.push(finding({
        id: `disabled-${a.name || a.id || tag}`,
        requirementId: "wcag-1.4.3-contrast",
        domain: "accessibility",
        severity: "note",
        confidence: "confirmed",
        status: "not-applicable",
        page,
        evidence: "Disabled controls are a contrast exception.",
        verifier: "form-name",
        repairOwner: "pages",
        applicability: "WCAG contrast does not apply to disabled controls.",
      }));
      continue;
    }
    if (!accessibleName(tag, node, all)) {
      findings.push(finding({
        id: `unnamed-${a.name || a.id || tag}`,
        requirementId: "wcag-3.3.2-labels",
        domain: "accessibility",
        severity: "serious",
        confidence: "confirmed",
        status: "fail",
        page,
        component: "form",
        evidence: `<${tag}> has no label, aria-label, or aria-labelledby.`,
        verifier: "form-name",
        repairOwner: "pages",
        suggestedRepair: "Associate a visible label with the control.",
      }));
    }
    const required = "required" in a || a["aria-required"] === "true";
    const described = a["aria-describedby"] || a["aria-errormessage"];
    const describedExists = described?.split(/\s+/).every(id => all.some(entry => nodeAttrs(entry).id === id));
    if (required && !describedExists) {
      findings.push(finding({
        id: `error-${a.name || a.id || tag}`,
        requirementId: "wcag-3.3.1-error-identification",
        domain: "accessibility",
        severity: "warning",
        confidence: "suspected",
        status: "warning",
        page,
        component: "form",
        evidence: "Required control has no linked description; browser validation may still identify errors.",
        verifier: "form-errors",
        repairOwner: "pages",
        suggestedRepair: "Point the control at a plain-language error or status element.",
      }));
    }
  }

  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(item => item[1] || "");
  for (const script of scripts) {
    const blocksTab = /["']Tab["']|\bTab\b/.test(script) && /preventDefault\s*\(/.test(script);
    const hasExit = /Escape|dialog\.close|data-trap-exit/.test(script);
    if (blocksTab && !hasExit) {
      findings.push(finding({
        id: "keyboard-trap",
        requirementId: "wcag-2.1.1-keyboard",
        domain: "accessibility",
        severity: "warning",
        confidence: "suspected",
        status: "warning",
        page,
        evidence: "Inline script may intercept Tab; exercise the actual keyboard path in a browser.",
        verifier: "keyboard-trap",
        repairOwner: "pages",
        suggestedRepair: "Allow Tab to leave, or provide a keyboard exit.",
      }));
    }
  }

  const sticky = /position\s*:\s*(sticky|fixed)/i.test(html);
  const focusable = /<(a|button|input|textarea|select)\b/i.test(html);
  const offset = /scroll-padding-top\s*:/i.test(html) || /data-focus-exception/.test(html);
  if (sticky && focusable && !offset) {
    findings.push(finding({
      id: "obscured-focus",
      requirementId: "wcag-2.4.11-focus-not-obscured",
      domain: "accessibility",
      severity: "warning",
      confidence: "suspected",
      status: "warning",
      page,
      evidence: "Fixed or sticky positioning merits a rendered focus-obstruction check.",
      verifier: "focus-offset",
      repairOwner: "pages",
      suggestedRepair: "Add scroll-padding-top at least as tall as the sticky region.",
    }));
  }

  for (const match of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/gi)) {
    const raw = match[2] || "";
    const style = /style="([^"]*)"/i.exec(raw)?.[1] || "";
    const color = /(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{3,6})/i.exec(style)?.[1];
    const background = /background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})/i.exec(style)?.[1];
    if (!color || !background) continue;
    const ratio = contrastRatio(color, background);
    if (ratio == null) continue;
    const font = /font-size\s*:\s*(\d+)px/i.exec(style);
    const large = font ? Number(font[1]) >= 24 : false;
    const minimum = large ? 3 : 4.5;
    if (/\bdisabled\b/i.test(raw)) {
      findings.push(finding({
        id: `contrast-exception-${color}`,
        requirementId: "wcag-1.4.3-contrast",
        domain: "accessibility",
        severity: "note",
        confidence: "confirmed",
        status: "not-applicable",
        page,
        evidence: "Disabled controls are outside the contrast criterion.",
        verifier: "contrast",
        repairOwner: "pages",
        applicability: "Disabled control exception.",
      }));
      continue;
    }
    if (ratio < minimum) {
      findings.push(finding({
        id: `contrast-${color}-${background}`,
        requirementId: "wcag-1.4.3-contrast",
        domain: "accessibility",
        severity: "warning",
        confidence: "suspected",
        status: "warning",
        page,
        evidence: `Inline colors imply contrast ${ratio.toFixed(2)}:1 below ${minimum}:1; verify computed colors in the browser.`,
        verifier: "contrast",
        repairOwner: "pages",
        suggestedRepair: "Darken the text or lighten the background until the ratio clears the threshold.",
      }));
    }
  }

  for (const image of all.filter(node => node.tagName === "img")) {
    const a = nodeAttrs(image);
    if (a.alt == null) {
      findings.push(finding({
        id: `img-alt-${a.src || "unknown"}`,
        requirementId: "wcag-1.1.1-text-alternative",
        domain: "accessibility",
        severity: "serious",
        confidence: "confirmed",
        status: "fail",
        page,
        evidence: "img is missing an alt attribute.",
        verifier: "text-alternative",
        repairOwner: "pages",
        suggestedRepair: "Add alt text, or alt=\"\" when the image is decorative.",
      }));
    }
  }
  return findings;
}

export type IndexingPage = {
  path: string;
  html: string;
  intendedIndex: boolean;
};

export function auditIndexing(input: {
  environment: "preview" | "production";
  pages: IndexingPage[];
  publicOrigin?: string;
  sitemap?: string;
  redirects?: { from: string; to: string; disposition: "keep" | "redirect" | "consolidate" | "retire"; intentionalHomepage?: boolean }[];
}): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const paths = new Set(input.pages.map(page => page.path));
  for (const page of input.pages) {
    const noindex = /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(page.html);
    if (input.environment === "preview" && noindex) {
      findings.push(finding({
        id: `preview-noindex-${page.path}`,
        requirementId: "seo-indexing-intent",
        domain: "seo",
        severity: "note",
        confidence: "confirmed",
        status: "pass",
        page: page.path,
        evidence: "Preview noindex is intentional.",
        verifier: "indexing",
        repairOwner: "preview",
      }));
      continue;
    }
    if (input.environment === "production" && noindex && page.intendedIndex) {
      findings.push(finding({
        id: `production-noindex-${page.path}`,
        requirementId: "seo-indexing-intent",
        domain: "seo",
        severity: "serious",
        confidence: "confirmed",
        status: "fail",
        page: page.path,
        evidence: "Production page is noindex but is intended to be indexed.",
        verifier: "indexing",
        repairOwner: "pages",
        suggestedRepair: "Rebuild with production indexing and remove the unintended robots noindex.",
      }));
    }
    const canonical = /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(page.html)?.[1];
    if (input.environment === "production" && page.intendedIndex && !canonical) {
      findings.push(finding({
        id: `canonical-missing-${page.path}`,
        requirementId: "seo-canonical-origin",
        domain: "seo",
        severity: "serious",
        confidence: "confirmed",
        status: "fail",
        page: page.path,
        evidence: "Indexable production page has no canonical URL.",
        verifier: "canonical",
        repairOwner: "compiler",
      }));
    }
    if (input.environment === "production" && input.publicOrigin && canonical) {
      let host = "";
      try { host = new URL(canonical).origin; } catch { host = ""; }
      const origin = input.publicOrigin.replace(/\/$/, "");
      if (host !== origin) {
        findings.push(finding({
          id: `canonical-origin-${page.path}`,
          requirementId: "seo-canonical-origin",
          domain: "seo",
          severity: "serious",
          confidence: "confirmed",
          status: "fail",
          page: page.path,
          evidence: `Canonical origin ${host || canonical} does not match ${origin}.`,
          verifier: "canonical",
          repairOwner: "pages",
          suggestedRepair: "Set canonical to the production origin.",
        }));
      }
      try {
        const target = new URL(canonical).pathname.replace(/\/$/, "") || "/";
        if (!paths.has(target)) {
          findings.push(finding({
            id: `canonical-target-${page.path}`,
            requirementId: "seo-canonical-origin",
            domain: "seo",
            severity: "serious",
            confidence: "confirmed",
            status: "fail",
            page: page.path,
            evidence: `Canonical target ${target} is not a built route.`,
            verifier: "canonical",
            repairOwner: "pages",
            suggestedRepair: "Point canonical at a route that exists.",
          }));
        }
      } catch { /* origin check already recorded malformed hosts */ }
    }
    if (input.environment === "production" && !input.publicOrigin) {
      findings.push(finding({
        id: `missing-origin-${page.path}`,
        requirementId: "seo-canonical-origin",
        domain: "seo",
        severity: "serious",
        confidence: "confirmed",
        status: "fail",
        page: page.path,
        evidence: "Production canonical and sitemap checks need publicOrigin.",
        verifier: "canonical",
        repairOwner: "launch",
        suggestedRepair: "Set publicOrigin before production publication.",
      }));
    }
    const jsonLd = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i.exec(page.html)?.[1];
    if (jsonLd) {
      if (jsonLd.includes("</")) {
        findings.push(finding({
          id: `jsonld-breakout-${page.path}`,
          requirementId: "seo-structured-data-consistency",
          domain: "seo",
          severity: "serious",
          confidence: "confirmed",
          status: "fail",
          page: page.path,
          evidence: "Structured data contains a literal script-closing sequence.",
          verifier: "structured-data",
          repairOwner: "compiler",
          suggestedRepair: "Serialize < as \\u003c.",
        }));
      }
      try {
        const data = JSON.parse(jsonLd) as { "@type"?: string; address?: unknown; name?: string };
        const visible = page.html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
        if (data["@type"] === "LocalBusiness" && !data.address) {
          findings.push(finding({
            id: `local-business-${page.path}`,
            requirementId: "seo-structured-data-consistency",
            domain: "seo",
            severity: "serious",
            confidence: "confirmed",
            status: "fail",
            page: page.path,
            evidence: "LocalBusiness is used without an address.",
            verifier: "structured-data",
            repairOwner: "compiler",
            suggestedRepair: "Use Organization unless a real address is in the facts.",
          }));
        }
        if (typeof data.name === "string" && data.name && !visible.includes(data.name)) {
          findings.push(finding({
            id: `schema-name-${page.path}`,
            requirementId: "seo-structured-data-consistency",
            domain: "seo",
            severity: "serious",
            confidence: "confirmed",
            status: "fail",
            page: page.path,
            evidence: "Structured data name is not in the visible text.",
            verifier: "structured-data",
            repairOwner: "pages",
            suggestedRepair: "Keep the entity name visible.",
          }));
        }
      } catch {
        findings.push(finding({
          id: `jsonld-parse-${page.path}`,
          requirementId: "seo-structured-data-consistency",
          domain: "seo",
          severity: "serious",
          confidence: "confirmed",
          status: "fail",
          page: page.path,
          evidence: "Structured data is not valid JSON.",
          verifier: "structured-data",
          repairOwner: "compiler",
        }));
      }
    }
  }

  const redirects = input.redirects || [];
  const graph = new Map<string, string>();
  for (const route of redirects) {
    if (route.disposition !== "redirect" && route.disposition !== "consolidate") continue;
    graph.set(route.from, route.to);
    if (!paths.has(route.to) && route.to !== "/") {
      findings.push(finding({
        id: `redirect-target-${route.from}`,
        requirementId: "seo-redirect-integrity",
        domain: "seo",
        severity: "serious",
        confidence: "confirmed",
        status: "fail",
        page: route.from,
        evidence: `Redirect destination ${route.to} is not a built route.`,
        verifier: "redirects",
        repairOwner: "storyboard",
        suggestedRepair: "Choose keep, a real destination, or retire.",
      }));
    }
    if (route.to === "/" && route.from !== "/" && !route.intentionalHomepage) {
      findings.push(finding({
        id: `homepage-redirect-${route.from}`,
        requirementId: "seo-redirect-integrity",
        domain: "seo",
        severity: "serious",
        confidence: "confirmed",
        status: "fail",
        page: route.from,
        evidence: "Material URL redirects to the homepage without an explicit decision.",
        verifier: "redirects",
        repairOwner: "storyboard",
        suggestedRepair: "Mark intentionalHomepage or choose a specific destination.",
      }));
    }
  }
  for (const start of graph.keys()) {
    const seen = new Set<string>();
    let cursor: string | undefined = start;
    while (cursor && graph.has(cursor)) {
      if (seen.has(cursor)) {
        findings.push(finding({
          id: `redirect-loop-${start}`,
          requirementId: "seo-redirect-integrity",
          domain: "seo",
          severity: "serious",
          confidence: "confirmed",
          status: "fail",
          page: start,
          evidence: `Redirect loop includes ${[...seen, cursor].join(" -> ")}.`,
          verifier: "redirects",
          repairOwner: "storyboard",
          suggestedRepair: "Break the cycle.",
        }));
        break;
      }
      seen.add(cursor);
      cursor = graph.get(cursor);
    }
  }

  if (input.sitemap) {
    const locs = [...input.sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(item => item[1] || "");
    const banned = new Set<string>();
    for (const page of input.pages) if (!page.intendedIndex) banned.add(page.path);
    for (const route of redirects) if (route.disposition === "redirect" || route.disposition === "retire") banned.add(route.from);
    for (const loc of locs) {
      let path = loc;
      try { path = new URL(loc, "https://example.invalid").pathname.replace(/\/$/, "") || "/"; } catch { /* keep */ }
      if (banned.has(path)) {
        findings.push(finding({
          id: `sitemap-${path}`,
          requirementId: "seo-sitemap-exclusions",
          domain: "seo",
          severity: "serious",
          confidence: "confirmed",
          status: "fail",
          page: path,
          evidence: "Sitemap includes a noindex, redirect, or retired URL.",
          verifier: "sitemap",
          repairOwner: "compiler",
          suggestedRepair: "Omit that URL from the sitemap.",
        }));
      }
    }
  }
  return findings;
}

export function gzipSize(bytes: Buffer | string): number {
  return gzipSync(typeof bytes === "string" ? Buffer.from(bytes) : bytes).length;
}

export function auditTransfer(files: { path: string; bytes: Buffer }[]): QualityFinding[] {
  const findings: QualityFinding[] = [];
  let js = 0;
  let css = 0;
  let fonts = 0;
  let total = 0;
  for (const file of files) {
    total += file.bytes.length;
    if (/\.m?js$/i.test(file.path)) js += gzipSize(file.bytes);
    if (/\.css$/i.test(file.path)) css += gzipSize(file.bytes);
    if (/\.(woff2?|ttf|otf)$/i.test(file.path)) fonts += file.bytes.length;
    if (file.bytes.length === 0 && /\.(m?js|css|png|jpg|webp|woff2?)$/i.test(file.path)) {
      findings.push(finding({
        id: `empty-${file.path}`,
        requirementId: "perf-broken-resource",
        domain: "performance",
        severity: "serious",
        confidence: "confirmed",
        status: "fail",
        evidence: `${file.path} is empty.`,
        verifier: "transfer-budget",
        repairOwner: "pages",
        suggestedRepair: "Remove the failed resource or replace it.",
      }));
    }
  }
  const limits: [string, number, number][] = [
    ["js", js, TRANSFER_BUDGETS.firstPartyJsGzip],
    ["css", css, TRANSFER_BUDGETS.cssGzip],
    ["fonts", fonts, TRANSFER_BUDGETS.fonts],
    ["transfer", total, TRANSFER_BUDGETS.initialTransfer],
  ];
  for (const [kind, actual, limit] of limits) {
    if (actual > limit) {
      findings.push(finding({
        id: `budget-${kind}`,
        requirementId: "perf-transfer-budget",
        domain: "performance",
        severity: "serious",
        confidence: "confirmed",
        status: "fail",
        evidence: `${kind} is ${actual} bytes against the Vitris starting budget of ${limit}. This is a project policy, not a Core Web Vital.`,
        verifier: "transfer-budget",
        repairOwner: "pages",
        suggestedRepair: "Reduce the asset or record an explicit media exception.",
      }));
    }
  }
  return findings;
}

export function auditLabPerformance(input: {
  runnerAvailable: boolean;
  samplesMs?: number[] | null;
  fieldP75?: { lcp?: number; inp?: number; cls?: number } | null;
}): QualityFinding[] {
  const findings: QualityFinding[] = [];
  if (!input.runnerAvailable) {
    findings.push(finding({
      id: "lab-runner-unavailable",
      requirementId: "perf-field-cwv",
      domain: "performance",
      severity: "warning",
      confidence: "unknown",
      status: "unknown",
      evidence: "No lab runner measurement is available. This is not a pass.",
      verifier: "lab-performance",
      repairOwner: "browser",
    }));
  } else if (!input.samplesMs || input.samplesMs.length < 2) {
    findings.push(finding({
      id: "lab-samples-missing",
      requirementId: "perf-field-cwv",
      domain: "performance",
      severity: "warning",
      confidence: "unknown",
      status: "tool-error",
      evidence: "The lab runner did not return repeated samples.",
      verifier: "lab-performance",
      repairOwner: "browser",
    }));
  } else {
    const mean = input.samplesMs.reduce((sum, value) => sum + value, 0) / input.samplesMs.length;
    const variance = input.samplesMs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / input.samplesMs.length;
    findings.push(finding({
      id: "lab-samples",
      requirementId: "perf-field-cwv",
      domain: "performance",
      severity: "warning",
      confidence: "suspected",
      status: "warning",
      evidence: `Repeated lab samples mean ${mean.toFixed(1)} ms, variance ${variance.toFixed(1)}. Lab timing is not field INP.`,
      verifier: "lab-performance",
      repairOwner: "browser",
    }));
  }
  if (!input.fieldP75) {
    findings.push(finding({
      id: "field-data-absent",
      requirementId: "perf-field-cwv",
      domain: "performance",
      severity: "note",
      confidence: "unknown",
      status: "unknown",
      evidence: "Field Core Web Vitals are absent. Targets are LCP 2.5s, INP 200ms, CLS 0.1 at the 75th percentile. Absence is not a pass.",
      verifier: "field-cwv",
      repairOwner: "launch",
    }));
  }
  return findings;
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function widgetRequirements(requirements: { id: string; widget?: string }[], usedWidgets: string[]): { id: string; included: boolean }[] {
  const used = new Set(usedWidgets);
  return requirements.filter(item => item.widget).map(item => ({ id: item.id, included: used.has(item.widget!) }));
}
