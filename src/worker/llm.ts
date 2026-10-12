import type { ContentTree, SiteConfig, ThemeTokens } from "../types.ts";
import type { Env } from "./env.ts";
import { parseSitePatch, type SitePatch } from "./patch.ts";

const SYSTEM_PROMPT = `You are Vitris site update agent. You produce ONLY a JSON object (no markdown fences) describing structured edits to a local-business website.

Rules:
- Never invent raw HTML, CSS, or JavaScript.
- Never change spacing scales, type scales, or invent colors outside theme keys.
- Prefer content/theme edits. Structural page edits (pages/*.html, components/) are done in the site repo with Cursor — do not use insertSection/removeSection.
- Theme edits may only set: colorBg, colorText, colorMuted, colorAccent, colorAccentText, colorSurface, colorBorder, colorFocus, fontBody, fontDisplay, radius, radiusPill, maxWidth.
- Paths for content use dotted JSON pointers. For theme keys use op "set" with target "theme".

Output schema:
{
  "summary": "plain English what changed",
  "operations": [
    { "op": "set", "path": "colorAccent", "value": "#112233", "target": "theme" },
    { "op": "setList", "path": "hours.items", "value": [ ... ], "target": "content" }
  ]
}`;

export type LlmContext = {
  prompt: string;
  content: ContentTree;
  site: SiteConfig;
  theme: ThemeTokens;
  mediaUrls?: string[];
};

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1]!.trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("LLM response had no JSON object");
  return JSON.parse(body.slice(start, end + 1));
}

async function callAnthropic(env: Env, user: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`Anthropic error: ${data.error?.message || res.status}`);
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("\n");
  if (!text) throw new Error("Anthropic returned empty content");
  return text;
}

async function callOpenAI(env: Env, user: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    }),
  });
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`OpenAI error: ${data.error?.message || res.status}`);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned empty content");
  return text;
}

/** Deterministic local fallback for tests / missing API keys. */
export function heuristicPatch(ctx: LlmContext): SitePatch {
  const lower = ctx.prompt.toLowerCase();
  const operations: SitePatch["operations"] = [];
  let summary = "Noted your request.";

  // Hours: "close at 4" / "closes at 4pm" on Saturday
  const hoursMatch = lower.match(/saturday.*?(\d{1,2})\s*(?:pm|p\.m\.|am|a\.m\.)?/);
  if (hoursMatch && Array.isArray((ctx.content as { hours?: { items?: unknown } }).hours?.items)) {
    const hour = Number(hoursMatch[1]);
    const items = structuredClone((ctx.content as { hours: { items: Array<Record<string, string>> } }).hours.items);
    for (const row of items) {
      if (String(row.day || row.label || "").toLowerCase().includes("sat")) {
        const close = hour <= 12 && /pm|p\.m/.test(lower) ? `${hour}:00 PM` : `${hour}:00`;
        if ("close" in row) row.close = close;
        else if ("hours" in row) row.hours = String(row.hours).replace(/\d{1,2}(?::\d{2})?\s*(?:AM|PM)?$/i, close);
        else row.close = close;
      }
    }
    operations.push({ op: "setList", path: "hours.items", value: items, target: "content" });
    summary = `Updated Saturday hours (close around ${hour}).`;
  }

  if (/banner|discount|announce/.test(lower)) {
    // Structural page edits are file-based; record intent in content only when a bind exists.
    const textMatch = ctx.prompt.match(/announcing\s+(.+?)(?:\.|$)/i) || ctx.prompt.match(/banner[^.]*?([A-Za-z].+)/i);
    const blurb = textMatch?.[1]?.trim() || "Special offer — ask us for details.";
    if ((ctx.content as { promoBanner?: unknown }).promoBanner) {
      operations.push({
        op: "set",
        path: "promoBanner.heading",
        value: blurb,
        target: "content",
      });
      summary = `${summary} Updated promo banner copy.`.trim();
    }
  }

  if (operations.length === 0) {
    // Soft touch: append note into a contact blurb if present
    const contact = (ctx.content as { contact?: { blurb?: string; body?: string } }).contact;
    if (contact && typeof contact.blurb === "string") {
      operations.push({
        op: "set",
        path: "contact.blurb",
        value: `${contact.blurb}\n\n(Update requested: ${ctx.prompt.slice(0, 120)})`,
        target: "content",
      });
      summary = "Appended your request note to contact copy (no API key for smarter edit).";
    } else {
      throw new Error("No LLM API key configured and heuristic could not interpret the request");
    }
  }

  return { summary, operations };
}

export async function completePatch(env: Env, ctx: LlmContext): Promise<SitePatch> {
  const user = [
    `Client request:\n${ctx.prompt}`,
    ctx.mediaUrls?.length ? `Media URLs from this request:\n${ctx.mediaUrls.join("\n")}` : "",
    `site.json:\n${JSON.stringify(ctx.site, null, 2)}`,
    `content/defaults.json:\n${JSON.stringify(ctx.content, null, 2)}`,
    `theme/defaults.json:\n${JSON.stringify(ctx.theme, null, 2)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let rawText: string;
  if (env.ANTHROPIC_API_KEY) rawText = await callAnthropic(env, user);
  else if (env.OPENAI_API_KEY) rawText = await callOpenAI(env, user);
  else return heuristicPatch(ctx);

  return parseSitePatch(extractJson(rawText));
}
