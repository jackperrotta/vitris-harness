/**
 * Schema helpers retained for dormant admin / patch paths.
 * Site components no longer ship schema.json — agents author HTML directly.
 */

export type BoundField = {
  key: string;
  label: string;
  type: string;
  bind: string;
  sectionId: string;
  component: string;
  path: string;
};

export function componentLabel(component: string): string {
  return component
    .split("-")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function isKernelOwnedBind(bind: string): boolean {
  return bind.startsWith("cookieCompliance");
}

export function uniqueBinds(fields: BoundField[]): { bind: string; component: string; sectionId: string }[] {
  const seen = new Set<string>();
  const out: { bind: string; component: string; sectionId: string }[] = [];
  for (const field of fields) {
    if (seen.has(field.bind)) continue;
    seen.add(field.bind);
    out.push({ bind: field.bind, component: field.component, sectionId: field.sectionId });
  }
  return out;
}

export function fieldsForBind(fields: BoundField[], bind: string): BoundField[] {
  return fields.filter((field) => field.bind === bind);
}

/** @deprecated Owner editor removed — always returns []. */
export function builderFields(): BoundField[] {
  return [];
}

export function getPath(tree: Record<string, unknown>, path: string): unknown {
  let current: unknown = tree;
  for (const part of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setPath(tree: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: unknown = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const nextKey = parts[i + 1]!;
    const nextIsIndex = /^\d+$/.test(nextKey);
    if (Array.isArray(current)) {
      const idx = Number(key);
      if (current[idx] == null) current[idx] = nextIsIndex ? [] : {};
      current = current[idx];
    } else {
      const obj = current as Record<string, unknown>;
      if (obj[key] == null) obj[key] = nextIsIndex ? [] : {};
      current = obj[key];
    }
  }
  const last = parts[parts.length - 1]!;
  if (Array.isArray(current)) current[Number(last)] = value;
  else (current as Record<string, unknown>)[last] = value;
}

export function resolveEditorPage(_site: unknown, raw: string | null | undefined): string {
  const value = (raw || "/").trim() || "/";
  return (value.startsWith("/") ? value : `/${value}`).replace(/\/$/, "") || "/";
}

export const DETAILS_BINDS = ["header", "footer"] as const;
