import type { Catalog, MotionConfig, MotionStrength, RevealFrom, SiteConfig } from "../types.ts";

const MOTION_STRENGTHS = new Set<MotionStrength>(["off", "whisper", "editorial", "noticeable"]);
const REVEAL_FROM = new Set<RevealFrom>(["up", "down", "left", "right"]);
/** Component folder names that default motion off (LCP / chrome). */
const DEFAULT_OFF = new Set(["header", "footer", "hero", "site-header", "site-footer"]);

export type FlattenResult = {
  html: string;
  used: string[];
  usesMotion: boolean;
  usesLeadForm: boolean;
};

type AttrMap = Record<string, string>;

function normalizeStrength(value: unknown): MotionStrength | undefined {
  if (typeof value !== "string") return undefined;
  return MOTION_STRENGTHS.has(value as MotionStrength) ? (value as MotionStrength) : undefined;
}

function normalizeFrom(value: unknown): RevealFrom {
  if (typeof value === "string" && REVEAL_FROM.has(value as RevealFrom)) {
    return value as RevealFrom;
  }
  return "up";
}

export function resolveInstanceMotion(
  site: SiteConfig,
  component: string,
  attrs: AttrMap,
): Required<MotionConfig> {
  if (site.scrollMotion?.policy === "off") return { strength: "off", stagger: false, from: "up" };
  if (DEFAULT_OFF.has(component) && !attrs.motion) {
    return { strength: "off", stagger: false, from: "up" };
  }

  const siteStrength = normalizeStrength(site.motion?.strength) ?? "editorial";
  const siteStagger = site.motion?.stagger === true;
  const attrStrength = normalizeStrength(attrs.motion);
  const strength =
    attrStrength ?? (DEFAULT_OFF.has(component) ? "off" : siteStrength);

  const staggerAttr = attrs["motion-stagger"] ?? attrs.stagger;
  const stagger =
    staggerAttr !== undefined
      ? staggerAttr === "true" || staggerAttr === ""
      : siteStagger;

  const from = normalizeFrom(attrs["motion-from"] ?? attrs.from ?? site.motion?.from);
  return { strength, stagger: strength !== "off" && stagger, from };
}

function wrapReveal(html: string, motion: Required<MotionConfig>): string {
  if (motion.strength === "off") return html;
  const stagger = motion.stagger ? " data-reveal-stagger" : "";
  return `<div data-reveal data-reveal-strength="${motion.strength}" data-reveal-from="${motion.from}"${stagger}>\n${html}\n</div>`;
}

/** Apply authoring-tag `variant` / `id` onto the first root element of a component. */
export function applyRootAttrs(html: string, component: string, attrs: AttrMap): string {
  const trimmed = html.trim();
  const m = trimmed.match(/^<([a-zA-Z][\w.-]*)(\s[^>]*)?>/);
  if (!m) return html;
  const tag = m[1]!;
  const existing = m[2] || "";
  const openEnd = m[0].length;
  const existingAttrs = parseAttrs(existing);
  const classes = new Set((existingAttrs.class || "").split(/\s+/).filter(Boolean));
  classes.add(`c-${component}`);
  const variant = (attrs.variant || "").trim();
  if (variant) {
    for (const token of variant.split(/\s+/).filter(Boolean)) {
      classes.add(`c-${component}--${token}`);
    }
  }
  const next: AttrMap = { ...existingAttrs, class: [...classes].join(" ") };
  if (attrs.id && !next.id) next.id = attrs.id;
  if (next.id && !next["data-section"]) next["data-section"] = next.id;
  if (!next["data-component"]) next["data-component"] = component;
  const semantic = attrs["semantic-role"] || attrs["data-semantic-role"];
  if (semantic && !next["data-semantic-role"]) next["data-semantic-role"] = semantic;
  for (const key of ["data-fact-ids", "data-asset-ids", "data-action"]) {
    if (attrs[key] && !next[key]) next[key] = attrs[key]!;
  }
  for (const [key, value] of Object.entries(attrs)) if (key === "data-motion" || key.startsWith("data-motion-")) next[key] = value;
  const attrStr = Object.entries(next)
    .map(([k, v]) => (v === "" ? k : `${k}="${v.replace(/"/g, "&quot;")}"`))
    .join(" ");
  return `<${tag} ${attrStr}>${trimmed.slice(openEnd)}`;
}

function parseAttrs(raw: string): AttrMap {
  const attrs: AttrMap = {};
  const re = /([:@\w.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const key = m[1]!;
    attrs[key] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

type SlotBag = {
  named: Record<string, string[]>;
  default: string[];
};

function splitSlots(innerHtml: string): SlotBag {
  const named: Record<string, string[]> = {};
  const defaults: string[] = [];
  let i = 0;
  const html = innerHtml.trim();
  while (i < html.length) {
    while (i < html.length && /\s/.test(html[i]!)) i += 1;
    if (i >= html.length) break;
    if (html[i] !== "<") {
      const next = html.indexOf("<", i);
      const text = html.slice(i, next === -1 ? html.length : next).trim();
      if (text) defaults.push(text);
      i = next === -1 ? html.length : next;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    const tagMatch = html.slice(i).match(/^<\/?([a-zA-Z][\w.-]*)/);
    if (!tagMatch) {
      defaults.push(html[i]!);
      i += 1;
      continue;
    }
    if (html[i + 1] === "/") {
      // Unexpected close — treat as text
      const closeEnd = html.indexOf(">", i);
      i = closeEnd === -1 ? html.length : closeEnd + 1;
      continue;
    }
    const name = tagMatch[1]!;
    const openEnd = findTagEnd(html, i);
    if (openEnd === -1) break;
    const openTag = html.slice(i, openEnd + 1);
    const attrs = parseAttrs(openTag.slice(1 + name.length, openTag.endsWith("/>") ? -2 : -1));
    const selfClosing = /\/>$/.test(openTag) || isVoidElement(name);
    let elementHtml: string;
    if (selfClosing) {
      elementHtml = openTag;
      i = openEnd + 1;
    } else {
      const close = findMatchingClose(html, name, openEnd + 1);
      if (!close) {
        elementHtml = openTag;
        i = openEnd + 1;
      } else {
        elementHtml = html.slice(i, close.end);
        i = close.end;
      }
    }
    const slotName = attrs.slot;
    if (slotName) {
      (named[slotName] ??= []).push(stripSlotAttr(elementHtml));
    } else {
      defaults.push(elementHtml);
    }
  }
  return { named, default: defaults };
}

function stripSlotAttr(html: string): string {
  return html.replace(/\s+slot\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "");
}

function isVoidElement(name: string): boolean {
  return /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(name);
}

function findTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let i = start; i < html.length; i++) {
    const ch = html[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return i;
  }
  return -1;
}

function findMatchingClose(
  html: string,
  name: string,
  from: number,
): { inner: string; end: number } | null {
  let depth = 1;
  let i = from;
  const openRe = new RegExp(`<${name}(\\s|>|/>)`, "i");
  const closeRe = new RegExp(`</${name}\\s*>`, "i");
  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html[i] === "<") {
      const slice = html.slice(i);
      const close = slice.match(closeRe);
      if (close && close.index === 0) {
        depth -= 1;
        if (depth === 0) {
          return { inner: html.slice(from, i), end: i + close[0].length };
        }
        i += close[0].length;
        continue;
      }
      const open = slice.match(openRe);
      if (open && open.index === 0) {
        const tagEnd = findTagEnd(html, i);
        if (tagEnd === -1) return null;
        const tag = html.slice(i, tagEnd + 1);
        if (!/\/>$/.test(tag) && !isVoidElement(name)) depth += 1;
        i = tagEnd + 1;
        continue;
      }
    }
    i += 1;
  }
  return null;
}

function fillSlots(template: string, slots: SlotBag): string {
  let out = template.replace(/<slot(\s[^>]*)?\/>/gi, (full, attrRaw = "") => {
    const attrs = parseAttrs(attrRaw);
    const name = attrs.name;
    if (name) return (slots.named[name] || []).join("\n");
    return slots.default.join("\n");
  });
  out = out.replace(/<slot(\s[^>]*)?>[\s\S]*?<\/slot>/gi, (full, attrRaw = "") => {
    const attrs = parseAttrs(typeof attrRaw === "string" ? attrRaw : "");
    const name = attrs.name;
    if (name) {
      const parts = slots.named[name];
      return parts && parts.length ? parts.join("\n") : "";
    }
    return slots.default.length ? slots.default.join("\n") : "";
  });
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Expand authoring tags that match catalog component names into flattened HTML.
 * Nested components are expanded (depth-limited).
 */
export function flattenBody(
  body: string,
  catalog: Catalog,
  site: SiteConfig,
  depth = 0,
): FlattenResult {
  if (depth > 8) {
    return { html: body, used: [], usesMotion: false, usesLeadForm: /data-lead-form/i.test(body) };
  }

  const names = Object.keys(catalog).sort((a, b) => b.length - a.length);
  if (!names.length) {
    return {
      html: body,
      used: [],
      usesMotion: false,
      usesLeadForm: /data-lead-form/i.test(body),
    };
  }

  const used = new Set<string>();
  let usesMotion = false;
  let html = body;
  let guard = 0;

  while (guard++ < 200) {
    let matched = false;
    for (const name of names) {
      const openRe = new RegExp(`<${escapeRegExp(name)}(\\s[^>]*)?>`, "gi");
      let m: RegExpExecArray | null;
      while ((m = openRe.exec(html))) {
        const start = m.index;
        const openTag = m[0];
        const attrRaw = m[1] || "";
        const attrs = parseAttrs(attrRaw);
        // Skip roots that already look flattened (template used same tag name as component)
        const cls = attrs.class || "";
        if (new RegExp(`(?:^|\\s)c-${escapeRegExp(name)}(?:\\s|$)`).test(cls)) {
          continue;
        }
        const openEnd = start + openTag.length;
        const selfClosing = /\/>$/.test(openTag);

        let inner = "";
        let end = openEnd;
        if (!selfClosing) {
          const close = findMatchingClose(html, name, openEnd);
          if (!close) continue;
          inner = close.inner;
          end = close.end;
        }

        const entry = catalog[name]!;
        used.add(name);
        const slots = splitSlots(inner);
        let expanded = fillSlots(entry.html, slots);
        expanded = applyRootAttrs(expanded, name, attrs);
        const nested = flattenBody(expanded, catalog, site, depth + 1);
        expanded = nested.html;
        for (const u of nested.used) used.add(u);
        if (nested.usesMotion) usesMotion = true;

        const motion = resolveInstanceMotion(site, name, attrs);
        if (motion.strength !== "off") usesMotion = true;
        if (!(site.scrollMotion?.policy === "enabled" && /\bdata-motion\s*=/.test(expanded))) expanded = wrapReveal(expanded, motion);

        html = html.slice(0, start) + expanded + html.slice(end);
        matched = true;
        break;
      }
      if (matched) break;
    }
    if (!matched) break;
  }

  const usesLeadForm = /data-lead-form/i.test(html);
  return { html, used: [...used], usesMotion, usesLeadForm };
}

/** Wrap non-chrome regions in <main id="main">. */
export function wrapMain(flattened: string, catalog: Catalog): string {
  const source = flattened.trim();
  const existingMain = [...source.matchAll(/<main\b[^>]*>/gi)];
  if (existingMain.length > 1) throw new Error("Page must have exactly one main landmark for the skip link");
  if (existingMain.length === 1) {
    const tag = existingMain[0]![0];
    if (!/\bid\s*=\s*["']main["']/i.test(tag) && /\bid\s*=/i.test(tag)) throw new Error("Existing main landmark must use id=\"main\" for the skip link");
    const next = tag.slice(0, -1)
      + (/\bid\s*=\s*["']main["']/i.test(tag) ? "" : ' id="main"')
      + (/\btabindex\s*=/i.test(tag) ? "" : ' tabindex="-1"') + ">";
    return source.replace(tag, next);
  }
  // A single author shell may contain header, content and footer together.
  // Recurse into it so its chrome does not get wrapped into main.
  const shell = source.match(/^<(div|section)\b[^>]*>/i);
  if (shell) {
    const close = findMatchingClose(source, shell[1]!, shell[0].length);
    if (close && close.end === source.length) {
      const inner = close.inner;
      if (/<(?:header|footer)\b|class=["'][^"']*\bc-(?:site-)?(?:header|footer)\b/i.test(inner)) {
        return shell[0] + wrapMain(inner, catalog) + source.slice(shell[0].length + inner.length);
      }
    }
  }
  const chrome = new Set(
    ["header", "footer", "site-header", "site-footer"].filter((n) => catalog[n]),
  );
  // After flatten, chrome is raw HTML starting with the component root — detect by class prefix
  // Simpler: split on top-level blocks; if page still has literal structure we wrap middle.
  // Authors put <header>…</header> then content then <footer>. After flatten those are sections.
  // Heuristic: find first footer-like block by class c-footer / c-site-footer, and header similarly.

  const parts: { html: string; kind: "header" | "footer" | "other" }[] = [];
  // Split by top-level elements
  let i = 0;
  const html = flattened.trim();
  while (i < html.length) {
    while (i < html.length && /\s/.test(html[i]!)) i += 1;
    if (i >= html.length) break;
    if (!html.startsWith("<", i)) {
      const next = html.indexOf("<", i);
      parts.push({ html: html.slice(i, next === -1 ? html.length : next), kind: "other" });
      i = next === -1 ? html.length : next;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i);
      const block = html.slice(i, end === -1 ? html.length : end + 3);
      parts.push({ html: block, kind: "other" });
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    const tagMatch = html.slice(i).match(/^<([a-zA-Z][\w.-]*)/);
    if (!tagMatch) {
      parts.push({ html: html[i]!, kind: "other" });
      i += 1;
      continue;
    }
    const tag = tagMatch[1]!;
    const tagEnd = findTagEnd(html, i);
    if (tagEnd === -1) {
      parts.push({ html: html.slice(i), kind: "other" });
      break;
    }
    const openTag = html.slice(i, tagEnd + 1);
    let block: string;
    if (/\/>$/.test(openTag) || isVoidElement(tag)) {
      block = openTag;
      i = tagEnd + 1;
    } else {
      const close = findMatchingClose(html, tag, tagEnd + 1);
      if (!close) {
        block = openTag;
        i = tagEnd + 1;
      } else {
        block = html.slice(i, close.end);
        i = close.end;
      }
    }
    const kind =
      /class="[^"]*\bc-(?:site-)?header\b/.test(openTag) || tag === "header"
        ? "header"
        : /class="[^"]*\bc-(?:site-)?footer\b/.test(openTag) || tag === "footer"
          ? "footer"
          : "other";
    // Prefer class detection over tag name after flatten (tags are section/div)
    const classKind = /class="[^"]*\bc-(?:site-)?header\b/.test(openTag)
      ? "header"
      : /class="[^"]*\bc-(?:site-)?footer\b/.test(openTag)
        ? "footer"
        : "other";
    void chrome;
    parts.push({ html: block, kind: classKind !== "other" ? classKind : kind === "header" || kind === "footer" ? kind : "other" });
  }

  const out: string[] = [];
  let mainOpen = false;
  let mainClosed = false;
  for (const part of parts) {
    if (part.kind === "header") {
      out.push(part.html);
    } else if (part.kind === "footer") {
      if (mainOpen && !mainClosed) {
        out.push("</main>");
        mainClosed = true;
      }
      out.push(part.html);
    } else {
      if (!mainOpen) {
        out.push('<main id="main" tabindex="-1">');
        mainOpen = true;
      }
      out.push(part.html);
    }
  }
  if (mainOpen && !mainClosed) out.push("</main>");
  return out.join("\n");
}

/** Legacy transport marker. Registration plus Turnstile is required to submit. */
export function rewriteLeadForms(html: string, kernelOrigin: string, pagePath: string): string {
  const action = kernelOrigin ? `${kernelOrigin.replace(/\/$/, "")}/api/leads` : '#';
  return html.replace(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi, (full, attrs: string, inner: string) => {
    if (!/data-lead-form/i.test(attrs)) return full;
    let next = attrs;
    if (/\baction\s*=/i.test(next)) {
      next = next.replace(/\baction\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, `action="${action}"`);
    } else {
      next += ` action="${action}"`;
    }
    next = next.replace(/\bmethod\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, 'method="post"');
    if (!/\bmethod\s*=/i.test(next)) next += ` method="post"`;
    if (!/\bdata-lead-custom\b|\bdata-no-enhance\b/i.test(next) && !/\bdata-vitris-enhanced\b/i.test(next)) next += ` data-vitris-enhanced`;
    let body = inner;
    if (!/name=["']page_path["']/.test(body)) {
      body = `\n<input type="hidden" name="page_path" value="${pagePath.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">` + body;
    }
    if (!/name=["']vid["']/.test(body)) {
      body = `\n<input type="hidden" name="vid" value="">` + body;
    }
    return `<form${next}>${body}</form>`;
  });
}

const INSTRUMENT_TAGS = /^(section|header|footer|article|div)$/i;

/** Nonvisual section metadata for design-run comparison. Ordinary sites omit candidate IDs. */
export function instrumentSections(html: string, site: SiteConfig): string {
  const candidate = site.designRun?.candidateId?.trim();
  return html.replace(/<([a-zA-Z][\w.-]*)(\s[^>]*?)>/g, (open, tag: string, attrs: string) => {
    if (!INSTRUMENT_TAGS.test(tag)) return open;
    const id = attrs.match(/\bid=(["'])([^"']+)\1/);
    if (!id) return open;
    let extra = "";
    if (!/\bdata-section=/.test(attrs)) extra += ` data-section="${id[2]}"`;
    if (candidate && !/\bdata-candidate-id=/.test(attrs)) extra += ` data-candidate-id="${candidate.replace(/"/g, "")}"`;
    return extra ? `<${tag}${attrs}${extra}>` : open;
  });
}
