#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadReferenceCatalog, referenceCoverage, referenceHash, referenceSignals, selectReferences, validateReferenceCatalog, validateReferenceDependencies, REFERENCE_RELEASE, referenceReleaseDirectory } from "../src/agent/reference-library.ts";
import type { ReferenceCatalog, ReferenceManifest, ReferenceRecord } from "../src/agent/reference-library.ts";
import { referenceGallery } from "../src/agent/reference-gallery.ts";
import { loadReferenceStudies } from "../src/agent/reference-studies.ts";
import { buildVerified } from "../src/build/verified.ts";
import { previewServer } from "../src/build/serve.ts";
import { referenceExposure } from "../src/agent/reference-exposure.ts";

const kernel = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), arg = (name: string, fallback?: string) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const release=arg("--release",REFERENCE_RELEASE)!;
const base = join(kernel, `design-system/references/${referenceReleaseDirectory(release)}`), catalogPath = join(base, "catalog.json"), manifestPath = join(base, "manifest.json");
const save = (path: string, value: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + "\n"); };
const seal = (catalog: ReferenceCatalog) => {
  const errors = validateReferenceCatalog(catalog); if (errors.length) throw new Error(errors.join("\n"));
  validateReferenceDependencies(catalog, kernel, base);
  save(catalogPath, catalog);
  save(manifestPath, { schemaVersion: 1, release, status: args.includes("--release-ready") ? "curated; technically validated; not human-approved taste data" : "curation-in-progress; not human-approved taste data", catalog: { path: "catalog.json", sha256: referenceHash(readFileSync(catalogPath)) }, labeledPreferenceData: false } satisfies ReferenceManifest);
};
if (args.includes("--record")) {
  const record = JSON.parse(readFileSync(resolve(arg("--record")!), "utf8")) as ReferenceRecord;
  const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) as ReferenceCatalog : { schemaVersion: 1 as const, release, records: [] };
  const index = catalog.records.findIndex(r => r.id === record.id);
  if (index >= 0) { const old = catalog.records[index]!; if (record.revision <= old.revision) throw new Error("Replacement must increment revision; previous evidence remains in the research ledger"); catalog.records[index] = record; } else catalog.records.push(record);
  seal(catalog);
} else if (args.includes("--seal")) seal(JSON.parse(readFileSync(catalogPath, "utf8")) as ReferenceCatalog);
const pack = loadReferenceCatalog(kernel, kernel, release);
const coverage = referenceCoverage(pack.catalog);
const output = resolve(arg("--out", release==="2026-10-06.1" ? "artifacts/reference-quality-20261006/gallery" : "artifacts/reference-library-expansion-20261005/gallery")!);
if (args.includes("--exposure")) {
  const directory = resolve(arg("--receipts", join(resolve(arg("--site", ".")!), "agent"))!);
  const report = referenceExposure(directory);
  save(join(output,"exposure.json"),report); console.log(JSON.stringify(report,null,2));
} else if (args.includes("--select")) {
  const site = resolve(arg("--site", ".")!);
  const receipt = selectReferences(pack, referenceSignals(site, release));
  save(join(output, "selection.json"), receipt); console.log(JSON.stringify(receipt, null, 2));
} else if (args.includes("--gallery")) {
  mkdirSync(output, { recursive: true });
  const html = referenceGallery(kernel, output, pack.catalog, coverage);
  writeFileSync(join(output, "index.html"), html); save(join(output, "coverage.json"), coverage);
  console.log(`Gallery: ${join(output, "index.html")}`);
} else if (!args.includes("--preview")) console.log(JSON.stringify({ manifestHash: pack.manifestHash, errors: [], coverage }, null, 2));

let serveRoot = output;
if (args.includes("--preview")) {
  const teaching = loadReferenceStudies(kernel, release), study = teaching.catalog.studies.find(s => s.id === arg("--preview"));
  if (!study) throw new Error("Unknown original study ID");
  serveRoot = join(output, "studies", study.id);
  await buildVerified(join(teaching.base, study.sourcePath), serveRoot, undefined, study.id);
  console.log(`Compiled original pair: ${serveRoot}`);
}
if (args.includes("--serve")) {
  if (!existsSync(join(serveRoot, "index.html"))) throw new Error("Use --gallery or --preview ID with --serve");
  const port = Number(arg("--port", "0"));
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port");
  const server = previewServer(serveRoot);
  await new Promise<void>((done,fail) => { server.once("error",fail); server.listen(port,"127.0.0.1",done); });
  console.log(`Local reference preview: http://127.0.0.1:${(server.address() as {port:number}).port}`);
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGINT",stop); process.on("SIGTERM",stop);
}
