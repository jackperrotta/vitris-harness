#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { artifactManifest } from "../src/knowledge/artifact.ts";
import { fingerprint } from "../src/agent/artifacts.ts";
import { auditFragment, auditIndexing, auditTransfer, contentHash, TRANSFER_BUDGETS } from "../src/knowledge/checks.ts";
import { evaluateLaunchDecision } from "../src/knowledge/launch-policy.ts";
import { sealReceipt } from "../src/knowledge/evidence.ts";
import { LAUNCH_POLICY_ID } from "../src/knowledge/contracts.ts";
import { parseFrontmatter } from "../src/compile/frontmatter.ts";
import { COOKIE_COMPLIANCE_PATH } from "../src/runtime/cookie-compliance.ts";
import { templateAdaptationFailures } from '../src/agent/template-adaptation.ts';
import { browserVerificationTimeoutMs } from '../src/agent/browser-timeout.ts';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv.includes("--help")) {
  console.log("Usage: vitris-launch-preflight --site DIR --environment preview|production [--origin URL]");
  process.exit(0);
}
const root = resolve(arg("--site") || ".");
const environment = arg("--environment") === "production" ? "production" : "preview";
process.env.VITRIS_SITE_ENVIRONMENT = environment;
const launch = existsSync(join(root, "launch.json"))
  ? JSON.parse(readFileSync(join(root, "launch.json"), "utf8")) as { publicOrigin?: string }
  : {};
const siteConfig = existsSync(join(root, "site.json"))
  ? JSON.parse(readFileSync(join(root, "site.json"), "utf8")) as { indexing?: string }
  : {};
const publicOrigin = arg("--origin") || process.env.VITRIS_PUBLIC_ORIGIN || launch.publicOrigin;
if (publicOrigin) process.env.VITRIS_PUBLIC_ORIGIN = publicOrigin;
const dist = join(root, "dist");
const findings = [];
if (environment === 'production') for (const failure of templateAdaptationFailures(root,'launch')) findings.push({
  id: 'template-adaptation-'+findings.length, requirementId:'vitris-launch-evidence-binding', domain:'publication', severity:'serious' as const,
  confidence:'confirmed' as const, status:'fail' as const, evidence:failure, verifier:'launch-preflight', verifierVersion:'2026-10-10', repairOwner:'template-adaptation', verifiedAt:new Date().toISOString(),
});
let browserStatus: "ok" | "unavailable" | "stale" = "unavailable";
let evidenceTrusted = false;
let initialTransferBytes: number | undefined;
let browserReportHash: string | undefined;
let screenshotSetHash: string | undefined;
if (environment === "production" && existsSync(dist)) {
  // The local verifier runs inside this command's trusted process tree. A
  // caller-authored browser.json cannot assert success on its own.
  const sibling = dirname(fileURLToPath(import.meta.url));
  const bundled = join(sibling, "vitris-verify-browser.js");
  const verifier = existsSync(bundled) ? bundled : join(sibling, "verify-browser.ts");
  const run = spawnSync(process.execPath, [
    ...(verifier.endsWith(".ts") ? ["--experimental-strip-types"] : []),
    verifier, "--site", root,
  ], { encoding: "utf8", env: { ...process.env, VITRIS_SITE_ENVIRONMENT: environment }, timeout: browserVerificationTimeoutMs() });
  if (run.status === 0) {
    try {
      const report = JSON.parse(readFileSync(join(root, "agent/reviews/browser.json"), "utf8")) as {
        distHash: string;
        checks: { path: string; width: number; screenshot: string; screenshotHash: string; initialTransferBytes?: number; firstVisit?: { screenshot: string; screenshotHash: string }; failures: string[] }[];
      };
      const shots = report.checks.flatMap(check => [check, ...(check.firstVisit ? [check.firstVisit] : [])]);
      if (report.checks.length > 0 && report.checks.every(check => check.failures.length === 0)
        && report.distHash === fingerprint(root, ["dist"])
        && shots.every(shot => shot.screenshotHash === fingerprint(root, [shot.screenshot]))) {
        browserStatus = "ok";
        evidenceTrusted = true;
        initialTransferBytes = report.checks.find(check => check.path === "/" && check.width === 375)?.initialTransferBytes;
        browserReportHash = contentHash(readFileSync(join(root, "agent/reviews/browser.json"), "utf8"));
        screenshotSetHash = contentHash(JSON.stringify(shots.map(shot => ({ path: shot.screenshot, hash: shot.screenshotHash }))));
      } else browserStatus = "stale";
    } catch { browserStatus = "stale"; }
  } else {
    console.error(`Browser verification failed: ${(run.stderr || run.stdout || run.error?.message || "unknown error").slice(-2000)}`);
  }
}
if (!existsSync(dist)) {
  findings.push({
    id: "dist-missing",
    requirementId: "vitris-launch-evidence-binding",
    domain: "publication",
    severity: "serious" as const,
    confidence: "confirmed" as const,
    status: "tool-error" as const,
    evidence: "dist/ is missing, so production evidence cannot be bound.",
    verifier: "launch-preflight",
    verifierVersion: "2026-09-22",
    policyHash: LAUNCH_POLICY_ID,
    repairOwner: "preview",
    verifiedAt: new Date().toISOString(),
  });
} else {
  const htmlFiles: { path: string; html: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".html")) htmlFiles.push({ path, html: readFileSync(path, "utf8") });
    }
  };
  walk(dist);
  for (const file of htmlFiles) findings.push(...auditFragment(file.html, file.path));
  const assets: { path: string; bytes: Buffer }[] = [];
  const walkAssets = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walkAssets(path);
      else if (/\.(js|css|woff2?|ttf|otf)$/i.test(name)) assets.push({ path, bytes: readFileSync(path) });
    }
  };
  walkAssets(dist);
  findings.push(...auditTransfer(assets));
  if (environment === "production" && browserStatus === "ok" && initialTransferBytes !== undefined && initialTransferBytes > TRANSFER_BUDGETS.initialTransfer) findings.push({
    id: "budget-initial-transfer", requirementId: "perf-transfer-budget", domain: "performance",
    severity: "serious" as const, confidence: "confirmed" as const, status: "fail" as const,
    evidence: `Homepage initial requests transferred ${initialTransferBytes} bytes against the ${TRANSFER_BUDGETS.initialTransfer} byte Vitris starting budget.`,
    verifier: "browser-transfer", verifierVersion: "2026-09-22", policyHash: LAUNCH_POLICY_ID,
    repairOwner: "pages", verifiedAt: new Date().toISOString(),
  });
  const pages = htmlFiles.map(file => {
    let rel = relative(dist, file.path).replaceAll("\\", "/");
    if (rel === "index.html") rel = "";
    else if (rel.endsWith("/index.html")) rel = rel.slice(0, -"/index.html".length);
    const route = `/${rel}`.replace(/\/$/, "") || "/";
    const pageFile = rel ? join(root, "pages", `${rel}.html`) : join(root, "pages/index.html");
    const nestedFile = rel ? join(root, "pages", rel, "index.html") : pageFile;
    const source = existsSync(pageFile) ? pageFile : nestedFile;
    const pageIndexing = existsSync(source) ? parseFrontmatter(readFileSync(source, "utf8")).meta.indexing : undefined;
    return {
      path: route,
      html: file.html,
      intendedIndex: route !== "/404.html" && route !== "/404" && route !== COOKIE_COMPLIANCE_PATH && siteConfig.indexing !== "noindex" && pageIndexing !== "noindex",
    };
  });
  findings.push(...auditIndexing({ environment, pages, publicOrigin, sitemap: existsSync(join(dist, "sitemap.xml")) ? readFileSync(join(dist, "sitemap.xml"), "utf8") : undefined }));
}

const manifest = existsSync(dist) ? artifactManifest(dist) : undefined;
const buildHash = manifest?.sha256 || "missing-dist";
const decision = evaluateLaunchDecision({
  environment,
  findings,
  buildHash,
  requiredVerifierStatus: environment === "production" ? browserStatus : "ok",
  evidenceTrusted: environment !== "production" || evidenceTrusted,
});
mkdirSync(join(root, "agent", "reviews"), { recursive: true });
if (manifest) writeFileSync(join(root, "agent", "reviews", "launch-artifact-manifest.json"), JSON.stringify(manifest, null, 2));
const buildEvidence = existsSync(join(dist, "build-evidence.json"))
  ? JSON.parse(readFileSync(join(dist, "build-evidence.json"), "utf8")) as { sourceHash?: string; compilerHash?: string }
  : {};
const knowledgeManifest = join(dirname(fileURLToPath(import.meta.url)), "../design-system/knowledge/v2/manifest.json");
const knowledgeHash = existsSync(knowledgeManifest) ? contentHash(readFileSync(knowledgeManifest, "utf8")) : "unavailable";
const sourceHash = contentHash(JSON.stringify({ source: buildEvidence.sourceHash, compiler: buildEvidence.compilerHash }));
const configHash = contentHash(["launch.json", "site.json", "onboarding/storyboard.json"].map(path => existsSync(join(root, path)) ? contentHash(readFileSync(join(root, path), "utf8")) : "missing").join("|"));
const receipt = sealReceipt({
  id: "launch-preflight", scope: "launch", buildHash, policyHash: LAUNCH_POLICY_ID, knowledgeHash,
  sourceHash, configHash,
  themeHash: existsSync(join(root, "theme/defaults.json")) ? contentHash(readFileSync(join(root, "theme/defaults.json"), "utf8")) : "missing",
  mediaHash: existsSync(join(root, "media")) ? fingerprint(root, ["media"]) : "missing",
  screenshotHash: screenshotSetHash,
  contentHash: browserReportHash,
  passed: decision.launchAllowed,
  findings,
});
writeFileSync(join(root, "agent", "reviews", "launch-evidence.json"), JSON.stringify(receipt, null, 2));
writeFileSync(join(root, "agent", "reviews", "launch-preflight.json"), JSON.stringify({
  schemaVersion: 1,
  policyId: decision.policyId,
  environment,
  launchAllowed: decision.launchAllowed,
  previewAllowed: decision.previewAllowed,
  conformanceClaim: decision.conformanceClaim,
  summary: decision.summary,
  blockerIds: decision.blockers.map(item => item.id),
  warningIds: decision.warnings.map(item => item.id),
  buildHash,
  evidenceDigest: receipt.digest,
  manualCoverage: "pending",
  note: "Automated checks only. This receipt is not a WCAG certification.",
}, null, 2));
console.log(decision.summary);
if (environment === "production" && !decision.launchAllowed) process.exit(1);
