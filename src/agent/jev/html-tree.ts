/** Minimal HTML tree with source offsets. Not a full browser parser. */

export interface HtmlAttr {
  name: string;
  value: string;
}

export interface HtmlElement {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
  start: number;
  end: number;
  innerStart: number;
  innerEnd: number;
}

export interface HtmlText {
  type: "text";
  text: string;
  start: number;
  end: number;
}

export type HtmlNode = HtmlElement | HtmlText;

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr",
]);

const RAW = new Set(["script", "style", "noscript"]);

function decode(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([:@]?[\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    attrs[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

export function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = {
    type: "element", tag: "#document", attrs: {}, children: [],
    start: 0, end: html.length, innerStart: 0, innerEnd: html.length,
  };
  const stack: HtmlElement[] = [root];
  let i = 0;
  while (i < html.length) {
    const parent = stack[stack.length - 1]!;
    if (html[i] !== "<") {
      const next = html.indexOf("<", i);
      const end = next < 0 ? html.length : next;
      const text = html.slice(i, end);
      if (text) parent.children.push({ type: "text", text: decode(text), start: i, end });
      i = end;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.slice(i, i + 9).toLowerCase() === "<!doctype") {
      const end = html.indexOf(">", i);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    const close = html.startsWith("</", i);
    const tagEnd = html.indexOf(">", i);
    if (tagEnd < 0) break;
    const inner = html.slice(i + (close ? 2 : 1), tagEnd).trim();
    const selfClosing = !close && /\/\s*$/.test(inner);
    const name = inner.replace(/\/\s*$/, "").split(/\s+/, 1)[0]?.toLowerCase() || "";
    if (close) {
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s]!.tag === name) {
          const el = stack[s]!;
          el.innerEnd = i;
          el.end = tagEnd + 1;
          stack.length = s;
          break;
        }
      }
      i = tagEnd + 1;
      continue;
    }
    const attrRaw = inner.slice(name.length);
    const el: HtmlElement = {
      type: "element",
      tag: name,
      attrs: parseAttrs(attrRaw),
      children: [],
      start: i,
      end: tagEnd + 1,
      innerStart: tagEnd + 1,
      innerEnd: tagEnd + 1,
    };
    parent.children.push(el);
    i = tagEnd + 1;
    if (VOID.has(name) || selfClosing) continue;
    if (RAW.has(name)) {
      const closer = new RegExp(`<\\/${name}\\s*>`, "i");
      const rest = html.slice(i);
      const m = rest.match(closer);
      const rel = m?.index ?? rest.length;
      if (rel > 0) el.children.push({ type: "text", text: html.slice(i, i + rel), start: i, end: i + rel });
      el.innerEnd = i + rel;
      el.end = i + rel + (m?.[0].length || 0);
      i = el.end;
      continue;
    }
    stack.push(el);
  }
  for (const el of stack.slice(1)) {
    el.innerEnd = html.length;
    el.end = html.length;
  }
  return root;
}

export function textContent(node: HtmlNode): string {
  if (node.type === "text") return node.text.replace(/\s+/g, " ");
  if (RAW.has(node.tag)) return "";
  return node.children.map(textContent).join(" ").replace(/\s+/g, " ").trim();
}

export function descendants(node: HtmlNode): HtmlElement[] {
  if (node.type === "text") return [];
  const out: HtmlElement[] = [];
  for (const c of node.children) {
    if (c.type === "element") {
      out.push(c, ...descendants(c));
    }
  }
  return out;
}

export function attr(el: HtmlElement, name: string): string | undefined {
  const v = el.attrs[name.toLowerCase()];
  return v === undefined ? undefined : v;
}

export function classList(el: HtmlElement): string[] {
  return (attr(el, "class") || "").split(/\s+/).filter(Boolean);
}

export function hasClass(el: HtmlElement, name: string): boolean {
  return classList(el).includes(name);
}
