import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { json, type Finding } from "./artifacts.ts";

const INTERNAL_COMMENTARY = [
  /screenshot provenance/i,
  /model[- ]evidence/i,
  /not a live product/i,
  /audit caveat/i,
  /this illustration is not/i,
  /for the operator only/i,
  /kernel (internal|note|artifact)/i,
  /harvest (warning|caveat|note)/i,
  /source[- ]label(?:ed|led) examples?/i,
  /\b(?:audit|provenance)[- ](?:label(?:ed|led)|tracked) examples?\b/i,
];

const PURCHASE_QUALIFICATION = [
  /\b(price|pricing|fee|hours|availability|appointment|estimate|quote)\b/i,
  /\b(may vary|subject to|while supplies|by appointment|not included)\b/i,
];

export type CopyClassification = {
  kind: "ok" | "internal-commentary" | "uncertain";
  reason: string;
};

/** Classify a public sentence. Uncertain cases stay for an editor; they are not deleted. */
export function classifyPublicSentence(text: string): CopyClassification {
  const sentence = text.trim();
  if (!sentence) return { kind: "ok", reason: "empty" };
  if (INTERNAL_COMMENTARY.some(pattern => pattern.test(sentence))) {
    return { kind: "internal-commentary", reason: "Internal audit or provenance commentary is not visitor copy." };
  }
  if (PURCHASE_QUALIFICATION.some(pattern => pattern.test(sentence)) && /\b(may|might|typically|usually|depending)\b/i.test(sentence)) {
    return { kind: "ok", reason: "Qualification that can change a purchase decision." };
  }
  if (/\b(we think|it seems|possibly generic|ai generated)\b/i.test(sentence)) {
    return { kind: "uncertain", reason: "Route this sentence to the editor instead of deleting it automatically." };
  }
  return { kind: "ok", reason: "No internal commentary detected." };
}

export function scanCopyPlanEditorial(root: string): string[] {
  const path = join(root, "onboarding/copy-plan.json");
  if (!existsSync(path)) return [];
  const plan = json<{ pages?: { path: string; sections?: { id: string; heading?: string; body?: string }[] }[] }>(path);
  const errors: string[] = [];
  for (const page of plan.pages || []) {
    for (const section of page.sections || []) {
      const text = `${section.heading || ""} ${section.body || ""}`;
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        const classified = classifyPublicSentence(sentence);
        if (classified.kind === "internal-commentary") {
          errors.push(`Internal commentary in public copy ${page.path}#${section.id}: ${classified.reason}`);
        }
      }
    }
  }
  return errors;
}

/** Recheck the published text after implementation, since pages may diverge from the copy plan. */
export function scanRenderedCopyEditorial(root: string): string[] {
  const dist = join(root, "dist");
  if (!existsSync(dist)) return [];
  const errors: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".html")) {
        const html = readFileSync(path, "utf8");
        const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
          .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot);/gi, " ").replace(/\s+/g, " ");
        if (classifyPublicSentence(text).kind === "internal-commentary") errors.push("Internal commentary in rendered copy: " + path.slice(root.length + 1));
      }
    }
  };
  walk(dist);
  return errors;
}

export function visualFindingGaps(finding: Finding): string[] {
  const errors: string[] = [];
  if (!finding.viewport?.trim()) errors.push(`Visual finding ${finding.id} needs a viewport`);
  if (!finding.consequence?.trim()) errors.push(`Visual finding ${finding.id} needs a design or business consequence`);
  if (!finding.preservation?.trim()) errors.push(`Visual finding ${finding.id} needs preservation constraints`);
  if (!finding.evidence?.trim() || !finding.repair?.trim()) errors.push(`Visual finding ${finding.id} needs an observation and a repair`);
  return errors;
}
