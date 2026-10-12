#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "blocks");
const rows: { cat: string; name: string; look: string; media: string; registers: string; variants: string }[] = [];

for (const cat of readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()) {
  for (const name of readdirSync(join(root, cat), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()) {
    const readmePath = join(root, cat, name, "README.md");
    if (!existsSync(readmePath)) continue;
    const readme = readFileSync(readmePath, "utf8");
    const look =
      readme
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("```")) || "";
    const media = (readme.match(/\*\*Media:\*\*\s*(.+)/) || [])[1] || "";
    const registers = (readme.match(/\*\*Registers:\*\*\s*(.+)/) || [])[1] || "";
    const variants = (readme.match(/\*\*Variants:\*\*\s*(.+)/) || [])[1] || "";
    rows.push({ cat, name, look, media, registers, variants });
  }
}

let md = `# Vitris blocks index

Original vanilla HTML/CSS block references. Copy a folder into a site \`components/<name>/\` and adapt. Use kernel primitives (\`.section\`, \`.card\`, \`.grid\`, …) and \`variant="…"\` on authoring tags.

See [CONVENTIONS.md](CONVENTIONS.md) and [icons.md](icons.md).

| Id | Look | Media | Registers | Variants |
|----|------|-------|-----------|----------|
`;
for (const r of rows) {
  md += `| \`${r.cat}/${r.name}\` | ${r.look.replace(/\|/g, "/")} | ${r.media} | ${r.registers} | ${r.variants} |\n`;
}
md += `\nTotal: **${rows.length}** blocks.\n`;
writeFileSync(join(root, "INDEX.md"), md);
console.log(`Wrote INDEX.md (${rows.length} blocks)`);
