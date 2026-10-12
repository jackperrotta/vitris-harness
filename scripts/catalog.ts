#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

if (process.argv.includes("--help")) {
  console.log("Usage: vitris-catalog");
  process.exit(0);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "src", "gen", "catalog.ts");

/** Kernel no longer ships a section catalog — sites own components/. */
await mkdir(dirname(outFile), { recursive: true });
await writeFile(
  outFile,
  [
    "import type { Catalog } from \"../types.ts\";",
    "",
    "/** Empty kernel catalog. Tenant sites supply components/ at build time. */",
    "export const catalog: Catalog = {};",
    "",
  ].join("\n"),
  "utf8",
);
console.log("Wrote empty src/gen/catalog.ts");

const stockDir = join(root, "src", "stock");
const { readFile } = await import("node:fs/promises");
function jsString(value: string): string {
  return JSON.stringify(value);
}
const searchJs = stripTypeScriptTypes(await readFile(join(stockDir, "search.ts"), "utf8")).replace(/export\s+/g, "");
const pickerJs = `(() => { ${searchJs}\nwindow.VitrisStockSearch = searchStock; })();\n` + await readFile(join(stockDir, "picker.js"), "utf8");
const pickerCss = await readFile(join(stockDir, "picker.css"), "utf8");
const catalogRaw = await readFile(join(stockDir, "catalog.json"), "utf8");
JSON.parse(catalogRaw);
await writeFile(
  join(root, "src", "gen", "stock.ts"),
  [
    `export const stockPickerJs = ${jsString(pickerJs)};`,
    `export const stockPickerCss = ${jsString(pickerCss)};`,
    `export const stockCatalogJson = ${jsString(catalogRaw.trim())};`,
    "",
  ].join("\n"),
  "utf8",
);
console.log("Wrote src/gen/stock.ts");
