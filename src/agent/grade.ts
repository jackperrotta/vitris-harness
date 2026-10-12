import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { evaluateV2 } from "./evaluate.ts";
import { parseGraphYaml } from "./graph.ts";
import { applyArtDirectionGraph } from "./art-direction-policy.ts";
import { isErrorPage } from "../onboard/quality.ts";
import { harvestIncompleteFailures } from "../onboard/harvest-inventory.ts";

export type GradeResult = {
  node: string;
  ok: boolean;
  failures: string[];
  skipped?: string;
};

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function countH1(html: string): number {
  return (html.match(/<h1\b/gi) || []).length;
}

export function gradeHarvest(siteRoot: string): GradeResult {
  const failures: string[] = [];
  const brief = readJson<{
    sourceUrl?: string;
    pages?: unknown[];
    images?: { sourceUrl?: string; localPath?: string; role?: string; error?: string }[];
    warnings?: string[];
  }>(
    join(siteRoot, "onboarding", "brief.json"),
  );
  if (!brief) failures.push("missing onboarding/brief.json");
  else {
    if (!brief.sourceUrl && !(brief.warnings || []).some((w) => /blank/i.test(w))) {
      failures.push("brief.sourceUrl empty (and not a blank starter)");
    }
    if (brief.sourceUrl && !(brief.pages && brief.pages.length > 0)) {
      failures.push("harvest produced 0 pages for a sourceUrl");
    }
    const bad = (brief.pages || []).filter(p => isErrorPage(p as { title: string; outline?: string[] }));
    if (bad.length) failures.push(`harvest includes ${bad.length} error pages; exclude and recover legitimate routes`);
    failures.push(...harvestIncompleteFailures(siteRoot, brief.warnings || []));
    const harvestDir = join(siteRoot, "media", "harvest");
    const imgs = brief.images?.length ?? 0;
    if (brief.sourceUrl && imgs > 0 && listFiles(harvestDir).length === 0 && !(brief.images || []).every(i => i.role === "failed" || i.error)) {
      failures.push("brief has images but media/harvest/ is empty");
    }
    for (const img of brief.images || []) {
      if (img.role === "failed" || img.error) continue;
      if (!img.localPath) continue;
      const disk = join(siteRoot, ...img.localPath.replace(/^\//, "").split("/"));
      if (!existsSync(disk)) failures.push(`harvest image missing on disk: ${img.localPath}`);
    }
  }
  return { node: "harvest", ok: failures.length === 0, failures };
}

export function gradeInterpret(siteRoot: string): GradeResult {
  const failures: string[] = [];
  const mediaPath = join(siteRoot, "onboarding", "media.md");
  if (!existsSync(mediaPath)) {
    failures.push("missing onboarding/media.md");
    return { node: "interpret", ok: false, failures };
  }
  const media = readFileSync(mediaPath, "utf8");
  const brief = readJson<{ sourceUrl?: string; visual?: { register?: string }; warnings?: string[] }>(
    join(siteRoot, "onboarding", "brief.json"),
  );
  const harvestFiles = listFiles(join(siteRoot, "media", "harvest"));
  const blank =
    !brief?.sourceUrl ||
    (brief.warnings || []).some((w) => /blank/i.test(w)) ||
    harvestFiles.length === 0;

  const paths = [...media.matchAll(/`(\/media\/[^`]+)`/g)]
    .map((m) => m[1]!)
    .filter((p) => !/[….]{1,3}$/.test(p) && !p.includes("…"));
  const mustUse = paths.filter((p) => p.startsWith("/media/"));

  if (/pending interpret/i.test(media) && mustUse.length === 0 && !blank) {
    failures.push("media.md still pending interpret shortlist");
  }

  if (!blank) {
    if (mustUse.length < 1) {
      failures.push("interpret must list must-use /media/ paths when harvest has images");
    } else if (mustUse.length < 8 && harvestFiles.length >= 8) {
      failures.push(`must-use shortlist has ${mustUse.length} paths; want 8–20 when harvest is rich`);
    } else if (mustUse.length > 20) {
      failures.push(`must-use shortlist has ${mustUse.length} paths; max 20`);
    }
    for (const p of mustUse.slice(0, 20)) {
      const alt = join(siteRoot, ...p.replace(/^\//, "").split("/"));
      if (!existsSync(alt)) {
        failures.push(`shortlist path missing on disk: ${p}`);
      }
    }
  }

  const reg = brief?.visual?.register;
  if (reg && !["trade", "beauty", "b2b"].includes(reg)) {
    failures.push(`invalid register: ${reg}`);
  }
  if (!/\b(trade|beauty|b2b)\b/i.test(media) && !reg) {
    failures.push("media.md / brief missing register (trade|beauty|b2b)");
  }
  return { node: "interpret", ok: failures.length === 0, failures };
}

export function gradeResearch(siteRoot: string): GradeResult {
  const failures: string[] = [];
  const research = readJson<{ completed?: boolean }>(join(siteRoot, "onboarding", "research.json"));
  if (!research) failures.push("missing onboarding/research.json");
  else if (research.completed !== true) failures.push("research.completed is not true");
  return { node: "research", ok: failures.length === 0, failures };
}

export function gradeBrand(siteRoot: string): GradeResult {
  const failures: string[] = [];
  const theme = readJson<Record<string, unknown>>(join(siteRoot, "theme", "defaults.json"));
  if (!theme) failures.push("missing theme/defaults.json");
  else {
    for (const key of ["colorBg", "colorText", "colorAccent", "fontBody"]) {
      if (!theme[key]) failures.push(`theme missing ${key}`);
    }
  }
  const site = readJson<{ name?: string; slug?: string }>(join(siteRoot, "site.json"));
  if (!site?.name || !site?.slug) failures.push("site.json missing name/slug");

  for (const css of listFiles(join(siteRoot, "components")).filter((f) => f.endsWith(".css"))) {
    const text = readFileSync(css, "utf8");
    const scrubbed = text.replace(
      /[^{}]*?(?:--dark|overlay|scrim|section--dark|before-after__handle)[^{]*\{[^}]*\}/g,
      "",
    );
    if (/#[0-9a-fA-F]{3,8}\b/.test(scrubbed) || /(?<![a-z])rgba?\(/i.test(scrubbed)) {
      failures.push(`raw color in ${css.replace(siteRoot, "")} — use var(--color-*)`);
    }
  }
  return { node: "brand", ok: failures.length === 0, failures };
}

export function gradeComponents(siteRoot: string): GradeResult {
  const failures: string[] = [];
  for (const name of ["header", "hero", "footer"]) {
    const tpl = join(siteRoot, "components", name, "template.html");
    if (!existsSync(tpl)) failures.push(`missing components/${name}/template.html`);
  }
  const dirs = existsSync(join(siteRoot, "components"))
    ? readdirSync(join(siteRoot, "components")).filter((n) =>
        existsSync(join(siteRoot, "components", n, "template.html")),
      )
    : [];
  if (dirs.length < 5) {
    failures.push(`need header/hero/footer plus ≥2 mid-page components (found ${dirs.length})`);
  }
  return { node: "components", ok: failures.length === 0, failures };
}

export function gradePages(siteRoot: string): GradeResult {
  const failures: string[] = [];
  const required = ["index.html", "contact.html"];
  for (const f of required) {
    if (!existsSync(join(siteRoot, "pages", f))) failures.push(`missing pages/${f}`);
  }
  const pages = listFiles(join(siteRoot, "pages")).filter((f) => f.endsWith(".html"));
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    const rel = page.replace(/\\/g, "/");
    const h1 = countH1(html);
    if (!rel.includes("/blog/") && h1 !== 1) {
      failures.push(`${rel.replace(siteRoot.replace(/\\/g, "/"), "")} has ${h1} h1 (want 1)`);
    }
    if (!/<header[\s>]/.test(html) || !/<footer[\s>]/.test(html)) {
      failures.push(`${rel} missing <header> or <footer>`);
    }
  }
  const contact = join(siteRoot, "pages", "contact.html");
  if (existsSync(contact)) {
    const html = readFileSync(contact, "utf8");
    if (!/data-lead-form/.test(html)) failures.push("contact page missing data-lead-form");
  }
  const footer = join(siteRoot, "components", "footer", "template.html");
  if (existsSync(footer)) {
    const html = readFileSync(footer, "utf8");
    if (!/cookie-compliance/.test(html)) failures.push("footer missing /cookie-compliance link");
  }
  return { node: "pages", ok: failures.length === 0, failures };
}

export function gradePreview(siteRoot: string): GradeResult {
  const failures: string[] = [];
  const dist = join(siteRoot, "dist");
  if (!existsSync(join(dist, "index.html"))) {
    failures.push("dist/index.html missing — run npm run build");
  } else {
    const html = readFileSync(join(dist, "index.html"), "utf8");
    if (countH1(html) !== 1) failures.push("built index.html must have exactly one h1");
    if (!/fetchpriority=["']high["']/i.test(html)) {
      failures.push("homepage LCP image missing fetchpriority=high");
    }
    const h2 = (html.match(/<h2\b/gi) || []).length;
    const sectionHeads = (html.match(/section__head/gi) || []).length;
    if (h2 + sectionHeads < 4) {
      failures.push("homepage needs ≥4 mid-page headings / section heads");
    }
    const imgs = (html.match(/<img\b/gi) || []).length;
    if (imgs < 4) failures.push("homepage needs ≥4 images (LCP + mid-page media)");
  }
  const brand = gradeBrand(siteRoot);
  if (!brand.ok) failures.push(...brand.failures.map((f) => `brand: ${f}`));
  const pages = gradePages(siteRoot);
  if (!pages.ok) failures.push(...pages.failures.map((f) => `pages: ${f}`));
  return { node: "preview", ok: failures.length === 0, failures };
}

export function gradeLaunch(siteRoot: string): GradeResult {
  const failures: string[] = [];
  const launch = readJson<{
    github?: { owner?: string; repo?: string };
    publicOrigin?: string;
    ownerEmail?: string;
    pagesProject?: string;
  }>(join(siteRoot, "launch.json"));
  if (!launch) failures.push("missing launch.json");
  else {
    if (!launch.github?.owner || !launch.github?.repo) failures.push("launch.json github.owner/repo empty");
    if (!launch.ownerEmail) failures.push("launch.json ownerEmail empty");
    if (!launch.pagesProject) failures.push("launch.json pagesProject empty");
  }
  return { node: "launch", ok: failures.length === 0, failures };
}

const GRADERS: Record<string, (root: string) => GradeResult> = {
  harvest: gradeHarvest,
  interpret: gradeInterpret,
  research: gradeResearch,
  brand: gradeBrand,
  components: gradeComponents,
  pages: gradePages,
  preview: gradePreview,
  launch: gradeLaunch,
};

export function gradeNode(siteRoot: string, node: string): GradeResult {
  const path = join(siteRoot, "agent", "graph.yaml");
  if (node !== "harvest" && node !== "launch" && existsSync(path) && parseGraphYaml(readFileSync(path, "utf8")).version >= 2) return evaluateV2(siteRoot, node);
  const fn = GRADERS[node];
  if (!fn) return { node, ok: false, failures: [`unknown node: ${node}`] };
  return fn(siteRoot);
}

export function gradeAll(siteRoot: string): GradeResult[] {
  const path = join(siteRoot, "agent", "graph.yaml");
  if (!existsSync(path)) return Object.keys(GRADERS).filter(n => n !== "launch").map(n => gradeNode(siteRoot, n));
  const graph = applyArtDirectionGraph(siteRoot, parseGraphYaml(readFileSync(path, "utf8")));
  const state = readJson<{ nodes: Record<string, { status: string; attempts: number }> }>(join(siteRoot, "agent/STATE.json"));
  return graph.nodes.filter(n => !n.optional).map(n => n.historicalAfter && state?.nodes[n.id]?.status === "done" && (state.nodes[n.historicalAfter]?.attempts || 0) > 0
    ? { node: n.id, ok: true, failures: [], skipped: "Historical checkpoint; current source is checked by final browser and critics" }
    : gradeNode(siteRoot, n.eval));
}
