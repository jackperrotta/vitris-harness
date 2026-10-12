/**
 * Public render surface for the kernel.
 * Page compilation lives in compile/; this module re-exports helpers used by the Worker and tests.
 */
export {
  beaconJs,
  baseCss,
  compileAllPages,
  compilePage,
  compileSite,
  renderDocument,
  robotsTxt,
  siteCss,
  siteIslands,
  sitemapXml,
  usedComponents,
} from "./compile/site.ts";

export {
  applyRootAttrs,
  flattenBody,
  resolveInstanceMotion,
  rewriteLeadForms,
  wrapMain,
} from "./compile/flatten.ts";

export { parseFrontmatter } from "./compile/frontmatter.ts";
export { defaultTitleFromPath, fileToPath } from "./compile/paths.ts";

/** @deprecated Prefer flattenBody — kept for transitional tests. */
export function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const parts = path.split(".");
    let current: unknown = ctx;
    for (const part of parts) {
      if (current == null || typeof current !== "object") return "";
      current = (current as Record<string, unknown>)[part];
    }
    if (current == null) return "";
    return String(current)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  });
}
