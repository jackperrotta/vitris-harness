import * as readline from "node:readline/promises";
import type { BusinessFacts, CriticalKey } from "../../src/onboard/brief.ts";
import { missingCritical } from "../../src/onboard/brief.ts";

const input = (process as NodeJS.Process).stdin;
const output = (process as NodeJS.Process).stdout;

async function ask(
  rl: readline.Interface,
  label: string,
  current = "",
): Promise<string> {
  const suffix = current ? ` [${current}]` : "";
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || current;
}

export async function promptMissingFacts(
  facts: BusinessFacts,
  opts: { noPrompt: boolean },
): Promise<BusinessFacts> {
  const missing = missingCritical(facts);
  if (!missing.length || opts.noPrompt) return facts;
  if (!input.isTTY) {
    console.warn("Non-interactive terminal; pass flags or run without --no-prompt on a TTY to fill missing fields.");
    return facts;
  }

  console.log("\nCrawl missed some critical fields. Fill them in (Enter skips):\n");
  const rl = readline.createInterface({ input, output });
  const next: BusinessFacts = {
    ...facts,
    primaryCta: { ...facts.primaryCta },
    hours: [...facts.hours],
    services: [...facts.services],
    social: [...(facts.social || [])],
  };

  try {
    const need = new Set<CriticalKey>(missing);
    if (need.has("name")) next.name = await ask(rl, "Business name", next.name);
    if (need.has("phone")) next.phone = await ask(rl, "Phone", next.phone);
    if (need.has("email")) next.email = await ask(rl, "Email", next.email);
    if (need.has("address")) {
      next.address = await ask(rl, "Street address", next.address);
      next.city = await ask(rl, "City", next.city);
    }
    if (need.has("primaryCta")) {
      next.primaryCta.label = await ask(rl, "Primary CTA label (e.g. Book a chair)", next.primaryCta.label);
      next.primaryCta.href = await ask(rl, "Primary CTA URL (tel:, mailto:, or /contact)", next.primaryCta.href);
    }
    if (need.has("hours")) {
      const hours = await ask(rl, "Hours (e.g. Mon–Fri 9am–5pm)", next.hours.join("; "));
      if (hours) next.hours = hours.split(/;|\n/).map((h) => h.trim()).filter(Boolean);
    }
    if (need.has("services")) {
      const services = await ask(rl, "Services (comma-separated)", next.services.map((s) => s.name).join(", "));
      if (services) {
        next.services = services.split(",").map((name) => ({ name: name.trim(), blurb: "" })).filter((s) => s.name);
      }
    }
  } finally {
    rl.close();
  }
  return next;
}

export function normalizeSourceUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("--")) {
    throw new Error(`Invalid URL "${trimmed}". Pass --from https://existing-site.example`);
  }
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProto);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Source URL must be http(s)");
  }
  return parsed.href;
}

export async function promptSourceUrl(opts: { noPrompt: boolean; from?: string; blank: boolean }): Promise<string> {
  if (opts.blank) return "";
  if (opts.from) return normalizeSourceUrl(opts.from);
  if (opts.noPrompt || !input.isTTY) {
    throw new Error("Pass --from https://existing-site.example or --blank");
  }
  const rl = readline.createInterface({ input, output });
  try {
    const url = (
      await rl.question("Existing site URL to crawl (required unless this is a blank starter; Enter skips): ")
    ).trim();
    return url ? normalizeSourceUrl(url) : "";
  } finally {
    rl.close();
  }
}
