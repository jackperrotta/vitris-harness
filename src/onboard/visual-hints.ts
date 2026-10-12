import type { VisualHints } from "./brief.ts";

const GENERIC_FACE = new Set([
  "ui-sans-serif",
  "system-ui",
  "sans-serif",
  "serif",
  "ui-serif",
  "arial",
  "helvetica",
  "helvetica neue",
  "times",
  "times new roman",
  "georgia",
  "segoe ui",
  "tahoma",
  "verdana",
  "roboto",
  "-apple-system",
  "blinkmacsystemfont",
  "apple color emoji",
  "segoe ui emoji",
  "nimbus sans",
  "liberation sans",
  "dejavu sans",
]);

function firstFace(family: string): string {
  return (family.split(",")[0] || "").replace(/["']/g, "").trim();
}

/** Distinctive computed family → self-host stack. Never a Google Fonts CDN URL. */
export function stackFromComputed(family: string, fallback: string): string | undefined {
  const face = firstFace(family);
  if (!face || GENERIC_FACE.has(face.toLowerCase())) return undefined;
  if (/^https?:/i.test(face) || face.includes("fonts.google")) return undefined;
  return `"${face}", ${fallback}`;
}

export function radiusFromComputed(raw: string): { radius?: string; radiusPill?: string } {
  const token = (raw.split(/\s+/)[0] || "").trim();
  if (!token || token === "0" || token === "0px") return {};
  if (/%/.test(token) || parseFloat(token) >= 20) return { radiusPill: "999px" };
  if (parseFloat(token) >= 2) return { radius: token };
  return {};
}

export function hintsFromComputed(input: {
  fontBody?: string;
  fontDisplay?: string;
  radius?: string;
}): VisualHints {
  const hints: VisualHints = {};
  const body = stackFromComputed(input.fontBody || "", 'ui-sans-serif, system-ui, sans-serif');
  const display = stackFromComputed(input.fontDisplay || "", "ui-serif, Georgia, serif");
  if (body) hints.fontBody = body;
  if (display) hints.fontDisplay = display;
  Object.assign(hints, radiusFromComputed(input.radius || ""));
  return hints;
}
