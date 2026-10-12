import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, mkdtempSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { flattenBody } from "./compile/flatten.ts";
import type { Catalog } from "./types.ts";
import { readBlockMeta } from "./blocks/metadata.ts";
import { loadProfiledBlockLibrary, readLibraryProfile } from "./blocks/library-profile.ts";
import { loadBlockLibrary, BLOCK_COVERAGE_CASES, hardFilterBlocks, lexicalShortlist } from "./agent/jev/block-catalog.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const blocksRoot = join(root, "blocks");

function listBlocks(): { cat: string; name: string; dir: string }[] {
  const out: { cat: string; name: string; dir: string }[] = [];
  for (const cat of readdirSync(blocksRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)) {
    for (const name of readdirSync(join(blocksRoot, cat), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)) {
      out.push({ cat, name, dir: join(blocksRoot, cat, name) });
    }
  }
  return out;
}

test("block library has INDEX and 110+ blocks", () => {
  assert.ok(existsSync(join(blocksRoot, "INDEX.md")));
  assert.ok(existsSync(join(blocksRoot, "CONVENTIONS.md")));
  assert.ok(existsSync(join(blocksRoot, "icons.md")));
  const blocks = listBlocks();
  assert.ok(blocks.length >= 110, `expected ≥110 blocks, got ${blocks.length}`);
  assert.ok(!blocks.some((b) => /marquee/.test(b.name)), "marquee blocks are forbidden by design-system/MASTER.md");
  const index = readFileSync(join(blocksRoot, "INDEX.md"), "utf8");
  for (const b of blocks) {
    assert.match(index, new RegExp(`${b.cat}/${b.name}`));
    assert.ok(existsSync(join(b.dir, "template.html")));
    assert.ok(existsSync(join(b.dir, "styles.css")));
    assert.ok(existsSync(join(b.dir, "README.md")));
  }
});

test("slice metadata validates source and slots while legacy blocks still load", () => {
  const lib = loadBlockLibrary(root);
  assert.equal(lib.blocks.length, 120);
  assert.equal(lib.blocks.filter(b => b.metadataSource === "block.meta.json").length, 12);
  assert.equal(lib.blocks.filter(b => b.metadataSource === "legacy-readme").length, 108);
  const sample = lib.blocks.find(b => b.id === "contact/contact-hours")!;
  assert.ok(sample.meta);
  const temporary = mkdtempSync(join(tmpdir(), "vitris-block-meta-"));
  try {
    for (const name of ["README.md", "template.html", "styles.css", "block.meta.json"]) cpSync(join(sample.dir, name), join(temporary, name));
    const meta = JSON.parse(readFileSync(join(temporary, "block.meta.json"), "utf8"));
    delete meta.evidence.previewManifest;
    meta.content.requiredSlots = [];
    writeFileSync(join(temporary, "block.meta.json"), JSON.stringify(meta));
    assert.throws(() => readBlockMeta(temporary, sample.id, sample.slots), /slots disagree/);
    meta.content.requiredSlots = sample.slots.filter(s => s.required).map(s => s.name);
    meta.sourceHash = "stale";
    writeFileSync(join(temporary, "block.meta.json"), JSON.stringify(meta));
    assert.throws(() => readBlockMeta(temporary, sample.id, sample.slots), /sourceHash is stale/);
    meta.sourceHash = sample.meta!.sourceHash;
    meta.evidence.previewManifest = "missing-preview.json";
    writeFileSync(join(temporary, "block.meta.json"), JSON.stringify(meta));
    assert.equal(readBlockMeta(temporary, sample.id, sample.slots)?.status, "draft");
    meta.status = "inspected";
    writeFileSync(join(temporary, "block.meta.json"), JSON.stringify(meta));
    assert.throws(() => readBlockMeta(temporary, sample.id, sample.slots), /previewManifest is missing/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test("library slice is opt-in and its selection identity changes with profile", () => {
  const site = mkdtempSync(join(tmpdir(), "vitris-library-profile-"));
  try {
    const legacy = loadProfiledBlockLibrary(root, site);
    assert.equal(legacy.profile, "legacy-v0");
    assert.equal(legacy.library.blocks.length, 114);
    assert.ok(legacy.library.blocks.every(block => !block.meta));
    writeFileSync(join(site, "launch.json"), JSON.stringify({ designLibraryProfile: "slice-v1" }));
    const slice = loadProfiledBlockLibrary(root, site);
    assert.equal(slice.library.blocks.length, 120);
    assert.equal(slice.library.blocks.filter(block => block.meta).length, 12);
    assert.notEqual(slice.releaseIdentity, legacy.releaseIdentity);
    writeFileSync(join(site, "launch.json"), JSON.stringify({ designLibraryProfile: "typo" }));
    assert.throws(() => readLibraryProfile(site), /Unknown designLibraryProfile/);
  } finally { rmSync(site, { recursive: true, force: true }); }
});

test("direct block gallery browsing respects the site profile", () => {
  const site = mkdtempSync(join(tmpdir(), "vitris-profile-gallery-"));
  const out = join(site, "gallery");
  const generate = () => execFileSync(process.execPath, ["--experimental-strip-types", join(root, "scripts/blocks-preview.ts"), "--site", site, "--out", out], { cwd: root, stdio: "pipe" });
  try {
    generate();
    let html = readFileSync(join(out, "index.html"), "utf8");
    assert.match(html, /114 blocks across/);
    assert.ok(!existsSync(join(out, "hero", "hero-evidence.html")));
    writeFileSync(join(site, "launch.json"), JSON.stringify({ designLibraryProfile: "slice-v1" }));
    generate();
    html = readFileSync(join(out, "index.html"), "utf8");
    assert.match(html, /120 blocks across/);
    assert.ok(existsSync(join(out, "hero", "hero-evidence.html")));
  } finally { rmSync(site, { recursive: true, force: true }); }
});

test("shortlist recalls labeled viable blocks and resolves role aliases", () => {
  const lib = loadBlockLibrary(root);
  for (const c of BLOCK_COVERAGE_CASES) {
    const state = { sectionId: c.role, sectionRole: c.role, pagePath: "/", visitorJob: c.visitorJob,
      requiredActions: [], textLength: c.textLength, mediaCount: c.mediaCount, interaction: c.interaction };
    const eligible = hardFilterBlocks(lib, state);
    const shortlist = lexicalShortlist({ ...lib, blocks: eligible }, state, 8);
    for (const [id, fit] of Object.entries(c.expectedFit)) {
      if (fit === "good-start") assert.ok(shortlist.some(b => b.id === id), `${c.id} omitted ${id}`);
    }
  }
  const header = { sectionId: "site-header", sectionRole: "header", pagePath: "/", visitorJob: "navigate the site",
    requiredActions: [], textLength: 40, mediaCount: 0 };
  const headerShortlist = lexicalShortlist({ ...lib, blocks: hardFilterBlocks(lib, header) }, header, 8);
  assert.ok(headerShortlist.some(b => b.category === "navbar"));
});

test("every block has root class, no stray hex outside dark variants, and flattens", () => {
  const site = { name: "Blocks", motion: { strength: "off" as const } };
  for (const b of listBlocks()) {
    const html = readFileSync(join(b.dir, "template.html"), "utf8");
    const css = readFileSync(join(b.dir, "styles.css"), "utf8");
    assert.match(html, new RegExp(`class="[^"]*\\bc-${b.name}\\b`));
    const cssWithoutDark = css.replace(
      /[^{}]*?(?:--dark|overlay|scrim|before-after__handle|section--dark)[^{]*\{[^}]*\}/g,
      "",
    );
    const bad = cssWithoutDark.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    assert.equal(bad.length, 0, `${b.cat}/${b.name} has raw hex outside dark/overlay rules: ${bad.join(",")}`);

    const catalog: Catalog = {
      [b.name]: { html, css, island: null },
    };
    const flat = flattenBody(`<${b.name}><h2 slot="heading">Hi</h2><p>Body</p></${b.name}>`, catalog, site);
    assert.match(flat.html, new RegExp(`c-${b.name}`));
    assert.ok(flat.used.includes(b.name));
  }
});

test("every block README has a slot table and an example that fills every required slot", () => {
  const site = { name: "Blocks", motion: { strength: "off" as const } };
  for (const b of listBlocks()) {
    const html = readFileSync(join(b.dir, "template.html"), "utf8");
    const css = readFileSync(join(b.dir, "styles.css"), "utf8");
    const readme = readFileSync(join(b.dir, "README.md"), "utf8");
    const id = `${b.cat}/${b.name}`;

    const example = readme.match(/## Example\s*```html\s*([\s\S]*?)```/)?.[1]?.trim();
    assert.ok(example, `${id} README is missing a \`\`\`html example under ## Example`);
    assert.match(example!, new RegExp(`^<${b.name}[\\s>]`), `${id} example must start with <${b.name}>`);

    // Slot table: | `name` | description |  — "Optional …" descriptions may be left unfilled by the example.
    const table = readme.match(/## Slots\s*\n([\s\S]*?)\n\n## /)?.[1] ?? "";
    const documented = new Map<string, string>();
    for (const row of table.matchAll(/^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*$/gm)) {
      documented.set(row[1] === "(default)" ? "default" : row[1]!, row[2]!);
    }
    assert.ok(documented.size > 0, `${id} README is missing a ## Slots table`);

    const templateSlots = new Set([...html.matchAll(/<slot name="([^"]+)"/g)].map((m) => m[1]!));
    if (/<slot><\/slot>/.test(html)) templateSlots.add("default");
    for (const name of templateSlots) {
      assert.ok(documented.has(name), `${id} slot "${name}" is in template.html but not in the README slot table`);
    }
    for (const name of documented.keys()) {
      assert.ok(templateSlots.has(name), `${id} README documents slot "${name}" which is not in template.html`);
    }

    const filled = new Set([...example!.matchAll(/\sslot="([^"]+)"/g)].map((m) => m[1]!));
    for (const [name, desc] of documented) {
      if (name === "default" || /^optional/i.test(desc)) continue;
      assert.ok(filled.has(name), `${id} example does not fill required slot "${name}"`);
    }
    for (const name of filled) {
      assert.ok(templateSlots.has(name), `${id} example fills slot "${name}" which the template does not define`);
    }

    const catalog: Catalog = { [b.name]: { html, css, island: null } };
    const flat = flattenBody(example!, catalog, site);
    assert.doesNotMatch(flat.html, /<slot\b/, `${id} example leaves an unfilled <slot> in output`);
    assert.doesNotMatch(flat.html, /<p[^>]*>\s*<(p|div|ul|ol|h[1-6]|table|figure|form)\b/, `${id} example nests block content inside <p>`);
  }
});
