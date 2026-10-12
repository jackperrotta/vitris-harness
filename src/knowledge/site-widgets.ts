import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Storyboard } from "../agent/artifacts.ts";

/** Derive widget use from the planned sections and components reachable from pages. */
export function siteWidgets(root: string, story?: Storyboard): { widgets: string[]; sourceFiles: string[] } {
  const widgets = new Set<string>();
  const sourceFiles: string[] = [];
  const components = join(root, "components");
  const pages = join(root, "pages");
  const pageFiles = (dir: string, prefix: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = `${prefix}/${entry.name}`;
    return entry.isDirectory() ? pageFiles(join(dir, entry.name), path) : entry.isFile() && entry.name.endsWith(".html") ? [path] : [];
  });
  const inspect = (html: string) => {
    for (const match of html.matchAll(/data-island\s*=\s*["']([^"']+)["']/gi)) widgets.add(match[1]!.toLowerCase());
    for (const match of html.matchAll(/<(?:gallery|testimonial|process|services|case)-carousel\b/gi)) widgets.add("carousel");
    if (/<[^>]+\bdata-carousel-(?:next|prev)\b/i.test(html)) widgets.add("carousel");
  };
  for (const page of story?.pages || []) for (const section of page.sections || []) {
    if (/\bcarousel\b/i.test(section.interaction || "")) widgets.add("carousel");
    if (/\baccordion\b/i.test(section.interaction || "")) widgets.add("accordion");
  }
  if (existsSync(pages)) for (const path of pageFiles(pages, "pages")) {
    const html = readFileSync(join(root, path), "utf8");
    sourceFiles.push(path);
    inspect(html);
    if (!existsSync(components)) continue;
    for (const component of readdirSync(components, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)) {
      if (!new RegExp(`<${component}(?:\\s|>)`, "i").test(html)) continue;
      const template = `components/${component}/template.html`;
      if (existsSync(join(root, template))) { sourceFiles.push(template); inspect(readFileSync(join(root, template), "utf8")); }
      if (/carousel/i.test(component)) widgets.add("carousel");
    }
  }
  return { widgets: [...widgets].sort(), sourceFiles: [...new Set(sourceFiles)].sort() };
}
