import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

import { join, dirname, resolve } from "node:path";

import { tmpdir } from "node:os";

import { spawnSync } from "node:child_process";

import { createHash } from "node:crypto";

import { save } from "./artifacts.ts";

import { sourceManifest } from "./source-manifest.ts";



export function npmCliPath(): string {

  const path = [process.env.npm_execpath, join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js")].find(p => p && p.endsWith(".js") && existsSync(p));

  if (!path) throw new Error("Run this command through npm so npm_execpath is available");

  return path;

}

export function runCommand(command: string, args: string[], cwd: string, log?: string): string {

  const result = spawnSync(command, args, {cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true});

  const output = `${result.stdout || ""}${result.stderr || ""}`;

  if (log) writeFileSync(log, output);

  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status}): ${result.error?.message || output.slice(-5000)}`);

  return result.stdout || "";

}

export const fileDigest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");



export function verifyPackage(root: string, out = mkdtempSync(join(tmpdir(), "vitris-package-"))) {

  root = resolve(root); out = resolve(out); mkdirSync(out, {recursive: true});

  const npm = npmCliPath(), source = sourceManifest(root);
  runCommand(process.execPath,[join(root,'scripts/audit-package.mjs'),'--report',join(out,'package-audit.json')],root,join(out,'package-audit.log'));

  const packed = JSON.parse(runCommand(process.execPath, [npm, "pack", "--ignore-scripts", "--json", "--pack-destination", out], root))[0] as {filename: string; files: {path: string}[]};

  const contamination = packed.files.filter(f => /^(scratch|artifacts|\.cursor)\//.test(f.path) || /^agent\/(runs|reviews|decisions|preparations|leases|design-runs)(\/|$)/.test(f.path) || /^agent\/(CURRENT.md|result-manifest.json|RUN.lock)$/.test(f.path) || /(^|\/)\.dev\.vars$/.test(f.path));

  if (contamination.length) throw new Error(`Package includes runtime output: ${contamination.map(f => f.path).join(", ")}`);

  const archive = join(out, packed.filename), install = join(out, "installed"); mkdirSync(install, {recursive: true});

  save(join(install, "package.json"), {name: "vitris-official-package-check", private: true, type: "module"});

  runCommand(process.execPath, [npm, "install", "--ignore-scripts", "--no-audit", "--no-fund", archive], install, join(out, "install.log"));

  const installed = join(install, "node_modules/@tryvitris/website-harness");

  runCommand(process.execPath, [join(installed, "bin/vitris-go.js"), "--help"], install, join(out, "help.log"));
  runCommand(process.execPath,[join(installed,'bin/vitris-media-serve.js'),'--help'],install,join(out,'media-help.log'));
  const previewHelp=spawnSync(process.execPath,[join(installed,"bin/vitris-preview.js"),"--help"],{cwd:install,encoding:"utf8",timeout:5000,windowsHide:true});
  writeFileSync(join(out,"preview-help.log"),`${previewHelp.stdout||""}${previewHelp.stderr||""}`);
  if(previewHelp.status!==0||!previewHelp.stdout.includes("vitris-preview --site SITE")||existsSync(join(install,"agent/preview-server.json")))throw new Error("Installed preview help must exit without starting a server or writing metadata");
  const stock = JSON.parse(runCommand(process.execPath, [join(installed, "bin/vitris-stock.js"), "search", "--query", "electrical"], install, join(out, "stock-search.log")));
  if (!Array.isArray(stock) || stock.length === 0) throw new Error("Installed stock search returned no catalog candidates");
  runCommand(process.execPath, [join(installed, "bin/vitris-create-site.js"), "--dir", join(out, "site"), "--slug", "official-smoke", "--blank", "--no-prompt", "--harness", archive], install, join(out, "scaffold.log"));

  const site = join(out, "site");
  if (!existsSync(join(site, ".gitignore")) || !readFileSync(join(site, ".gitignore"), "utf8").includes(".env")) throw new Error("Installed starter is missing its Git ignore rules");
  runCommand(process.execPath, [npm, "install", "--ignore-scripts", "--no-audit", "--no-fund"], site, join(out, "site-install.log"));

  runCommand(process.execPath, ["--input-type=module", "-e", "const api = await import('@tryvitris/website-harness/cli/api'); if (typeof api.createSite !== 'function' || typeof api.migrateSite !== 'function') process.exit(1); await import('@tryvitris/website-harness');"], site, join(out, "api-import.log"));

  // Scaffolding deliberately leaves pages empty. Author an actual smoke input before testing compilation.

  mkdirSync(join(out, "site/pages"), {recursive: true});

  writeFileSync(join(out, "site/pages/index.html"), "<main><h1>Packaged harness smoke</h1><p>A real page compiled from the installed package.</p></main>\n");

  const siteConfigPath=join(site,"site.json"), siteConfig=JSON.parse(readFileSync(siteConfigPath,"utf8"));

  siteConfig.scrollMotion={version:1,policy:"enabled"};save(siteConfigPath,siteConfig);

  const launchPath=join(site,"launch.json"),launch=JSON.parse(readFileSync(launchPath,"utf8"));

  launch.backendOrigin="https://kernel.example.invalid";save(launchPath,launch); // Compile the consent route without making network requests.

  writeFileSync(join(site,"pages/motion.html"), '<h1>Packaged motion smoke</h1><div style="height:1100px"></div><h2 id="packaged-proof" data-motion="entrance">Readable proof</h2>');

  runCommand(process.execPath, [join(installed, "bin/vitris-build.js"), "--site", join(out, "site"), "--out", join(out, "site/dist"), "--slug", "official-smoke"], install, join(out, "build.log"));

  runCommand(process.execPath, [npm, "run", "build"], site, join(out, "site-build.log"));
  const motionHtml=readFileSync(join(site,"dist/motion/index.html"),"utf8"),asset=motionHtml.match(/src="(\/motion-[^"]+\.js)"/)?.[1];

  if(!asset||!existsSync(join(site,"dist",asset)))throw new Error("Installed package failed to emit self-hosted motion");

  if(readFileSync(join(site,"dist/index.html"),"utf8").includes(asset)||readFileSync(join(site,"dist/cookie-compliance/index.html"),"utf8").includes(asset))throw new Error("Quiet packaged routes request motion");

  const pageRef=join(site,"agent/refs/motion-page.md");
  if(!existsSync(pageRef)||!readFileSync(pageRef,"utf8").includes("motionPlan"))throw new Error("Installed scaffold omitted whole-page guidance");
  if(siteConfig.motionComposition?.version!==2||siteConfig.motionComposition.routes!=="all-authored")throw new Error("New scaffold omitted authored route responsibility");
  const configBeforeUpgrade=readFileSync(siteConfigPath,"utf8");
  unlinkSync(pageRef);
  const motionRef=join(site,"agent/refs/motion.md");

  if(!existsSync(motionRef)||!readFileSync(motionRef,"utf8").includes("Deliberate scroll motion"))throw new Error("Installed scaffold omitted motion guidance");

  runCommand(process.execPath,[join(installed,"bin/vitris-content-coverage.js"),"--help"],install,join(out,"coverage-help.log"));
  const qualityRef=join(site,"agent/refs/production-quality.md");
  if(!existsSync(qualityRef))throw new Error("Installed scaffold omitted production-quality guidance");
  unlinkSync(qualityRef);
  runCommand(process.execPath,[join(installed,"bin/vitris-upgrade.js"),"--site",site,"--target",installed,"--plan"],install,join(out,"quality-upgrade-plan.log"));
  runCommand(process.execPath,[join(installed,"bin/vitris-upgrade.js"),"--site",site,"--target",installed,"--apply"],install,join(out,"quality-upgrade-apply.log"));
  if(!existsSync(qualityRef)||JSON.parse(readFileSync(launchPath,"utf8")).productionQuality!==undefined)throw new Error("Upgrade omitted guidance or promoted opt-in policy");
  // A missing managed instruction is added by the installed upgrade path, without changing operator policy.

  unlinkSync(motionRef);

  runCommand(process.execPath,[join(installed,"bin/vitris-upgrade.js"),"--site",site,"--target",installed,"--plan"],install,join(out,"motion-upgrade-plan.log"));

  runCommand(process.execPath,[join(installed,"bin/vitris-upgrade.js"),"--site",site,"--target",installed,"--apply"],install,join(out,"motion-upgrade-apply.log"));

  if(!existsSync(motionRef)||JSON.parse(readFileSync(siteConfigPath,"utf8")).scrollMotion.policy!=="enabled")throw new Error("Packaged upgrade omitted motion guidance or changed operator policy");

  if(!existsSync(pageRef)||readFileSync(siteConfigPath,"utf8")!==configBeforeUpgrade)throw new Error("Managed upgrade omitted page guidance or migrated site policy");
  runCommand(process.execPath, ["--input-type=module", "-e", "const {verifySite} = await import('@tryvitris/website-harness/cli/api'); const {existsSync} = await import('node:fs'); await verifySite({site:process.cwd(), environment:'production'}); if (!existsSync('agent/reviews/launch-preflight.json')) throw new Error('Packaged API did not execute production preflight');"], site, join(out, "api-preflight.log"));
  runCommand(process.execPath, [join(site, "node_modules/@tryvitris/website-harness/bin/vitris-go.js"), "--prepare", "--jev-mode", "off"], site, join(out, "site-prepare.log"));

  if (!existsSync(join(site, "agent/CURRENT.md"))) throw new Error("Installed starter did not prepare a stage");

  if (!existsSync(join(out, "site/dist/index.html"))) throw new Error("Installed build produced no homepage");

  if (sourceManifest(root).hash !== source.hash) throw new Error("Source changed during package verification");

  const report = {version: 1, ok: true, sourceHash: source.hash, packagePath: archive, packageSha256: fileDigest(archive), packageFiles: packed.files.length, installed, checkedAt: new Date().toISOString(), node: process.version};

  save(join(out, "verification.json"), report);

  return report;

}

