import type { ContentTree, SiteConfig, ThemeTokens } from "../types.ts";
import { defaultTheme } from "../types.ts";

export type PatchOp =
  | { op: "set"; path: string; value: unknown; target?: "content" | "theme" }
  | { op: "setList"; path: string; value: unknown[]; target?: "content" | "theme" }
  | {
      op: "insertSection";
      pagePath: string;
      index: number;
      component: string;
      id: string;
      bind: string;
    }
  | { op: "removeSection"; pagePath: string; id: string };

export type SitePatch = {
  summary: string;
  operations: PatchOp[];
};

export type PatchResult = {
  content: ContentTree;
  site: SiteConfig;
  theme: ThemeTokens;
  summary: string;
  changedPaths: string[];
};

const THEME_KEYS = new Set<keyof ThemeTokens>([
  "colorBg",
  "colorText",
  "colorMuted",
  "colorAccent",
  "colorAccentText",
  "colorSurface",
  "colorBorder",
  "colorFocus",
  "fontBody",
  "fontDisplay",
  "radius",
  "radiusPill",
  "maxWidth",
]);

/** Component names the dormant agent may instantiate — any site-local name. */
export const KERNEL_COMPONENTS = new Set<string>();

function parsePointer(path: string): string[] {
  const clean = path.replace(/^\//, "").replace(/^\$\./, "");
  if (!clean) return [];
  return clean
    .split(/\.|\/|(?=\[\d+\])/)
    .flatMap((part) => {
      const m = part.match(/^\[(\d+)\]$/);
      if (m) return [m[1]!];
      if (part.includes("[")) {
        const bits: string[] = [];
        const re = /([^[\].]+)|\[(\d+)\]/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(part))) {
          bits.push(match[1] ?? match[2]!);
        }
        return bits;
      }
      return part ? [part] : [];
    })
    .filter(Boolean);
}

function getAt(root: unknown, parts: string[]): unknown {
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) cur = cur[Number(part)];
    else cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setAt(root: unknown, parts: string[], value: unknown): void {
  if (parts.length === 0) throw new Error("Cannot set root via empty path");
  let cur: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const nextKey = parts[i + 1]!;
    const nextIsIndex = /^\d+$/.test(nextKey);
    if (Array.isArray(cur)) {
      const idx = Number(key);
      if (cur[idx] == null) cur[idx] = nextIsIndex ? [] : {};
      cur = cur[idx];
    } else {
      const obj = cur as Record<string, unknown>;
      if (obj[key] == null) obj[key] = nextIsIndex ? [] : {};
      cur = obj[key];
    }
  }
  const last = parts[parts.length - 1]!;
  if (Array.isArray(cur)) cur[Number(last)] = value;
  else (cur as Record<string, unknown>)[last] = value;
}

function assertNoCss(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (/<style[\s>]|<\/style>|\{[^}]*:[^}]*\}/i.test(value) && /--|px|rem|em|rgb|#/.test(value)) {
      // Allow normal copy that mentions colors; block obvious CSS blocks.
      if (/[{;]\s*[a-z-]+\s*:/i.test(value) || /<\/?style/i.test(value)) {
        throw new Error(`Raw CSS rejected at ${path}`);
      }
    }
  }
}

function applySet(
  content: ContentTree,
  theme: ThemeTokens,
  op: Extract<PatchOp, { op: "set" | "setList" }>,
): "content" | "theme" {
  const target = op.target || (THEME_KEYS.has(parsePointer(op.path)[0] as keyof ThemeTokens) && !op.path.includes(".")
    ? "theme"
    : "content");
  const parts = parsePointer(op.path);
  if (parts.length === 0) throw new Error("Empty path");

  if (target === "theme") {
    const key = parts[0] as keyof ThemeTokens;
    if (!THEME_KEYS.has(key) || parts.length !== 1) {
      throw new Error(`Theme path not allowed: ${op.path}`);
    }
    if (typeof op.value !== "string") throw new Error(`Theme ${key} must be a string`);
    theme[key] = op.value;
    return "theme";
  }

  assertNoCss(op.value, op.path);
  if (op.op === "setList" && !Array.isArray(op.value)) {
    throw new Error(`setList requires an array at ${op.path}`);
  }
  const parentParts = parts.slice(0, -1);
  if (parentParts.length > 0 && getAt(content, parentParts) === undefined) {
    // Allow creating nested objects under existing binds, but not inventing new top-level binds blindly.
    if (parentParts.length === 1 && !(parentParts[0]! in content)) {
      // Creating a new bind object is OK when inserting a section that references it.
      (content as Record<string, unknown>)[parentParts[0]!] = {};
    } else if (getAt(content, parentParts) === undefined) {
      throw new Error(`Path parent missing: ${op.path}`);
    }
  }
  setAt(content, parts, op.value);
  return "content";
}

function countHeroes(_site: SiteConfig): void {
  // Pages are file-based; hero uniqueness is enforced by skills / build warnings.
}

export function parseSitePatch(raw: unknown): SitePatch {
  if (!raw || typeof raw !== "object") throw new Error("Patch must be an object");
  const obj = raw as Record<string, unknown>;
  if (typeof obj.summary !== "string" || !obj.summary.trim()) {
    throw new Error("Patch requires a non-empty summary");
  }
  if (!Array.isArray(obj.operations)) throw new Error("Patch requires operations[]");
  const operations: PatchOp[] = [];
  for (const item of obj.operations) {
    if (!item || typeof item !== "object") throw new Error("Invalid operation");
    const op = item as Record<string, unknown>;
    if (op.op === "set") {
      if (typeof op.path !== "string") throw new Error("set requires path");
      operations.push({
        op: "set",
        path: op.path,
        value: op.value,
        target: op.target === "theme" ? "theme" : op.target === "content" ? "content" : undefined,
      });
    } else if (op.op === "setList") {
      if (typeof op.path !== "string" || !Array.isArray(op.value)) throw new Error("setList requires path + array");
      operations.push({
        op: "setList",
        path: op.path,
        value: op.value,
        target: op.target === "theme" ? "theme" : op.target === "content" ? "content" : undefined,
      });
    } else if (op.op === "insertSection" || op.op === "removeSection") {
      throw new Error("Structural page edits are file-based (pages/*.html); insertSection/removeSection are disabled");
    } else {
      throw new Error(`Unknown op: ${String(op.op)}`);
    }
  }
  return { summary: obj.summary.trim(), operations };
}

export function applySitePatch(
  input: {
    content: ContentTree;
    site: SiteConfig;
    theme: Partial<ThemeTokens> | ThemeTokens;
  },
  patch: SitePatch,
): PatchResult {
  const content = structuredClone(input.content) as ContentTree;
  const site = structuredClone(input.site) as SiteConfig;
  const theme = { ...defaultTheme, ...structuredClone(input.theme) } as ThemeTokens;
  const changed = new Set<string>();

  for (const op of patch.operations) {
    if (op.op === "set" || op.op === "setList") {
      const which = applySet(content, theme, op);
      changed.add(which === "theme" ? "theme/defaults.json" : "content/defaults.json");
    } else if (op.op === "insertSection" || op.op === "removeSection") {
      throw new Error("Structural page edits are file-based (pages/*.html); insertSection/removeSection are disabled");
    }
  }

  countHeroes(site);
  return {
    content,
    site,
    theme,
    summary: patch.summary,
    changedPaths: [...changed],
  };
}

