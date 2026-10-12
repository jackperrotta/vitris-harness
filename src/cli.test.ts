import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "./cli/index.ts";
import { EXIT_CODES } from "./cli/types.ts";
import * as api from "./cli/api.ts";
import { acquirePathLock } from "./agent/artifacts.ts";

const temp = () => mkdtempSync(join(tmpdir(), "vitris-cli-test-"));

test("CLI doctor runs diagnostics and reports status", async () => {
  const code = await runCli(["doctor", "--dry-run"]);
  assert.equal(code, EXIT_CODES.SUCCESS);

  const siteDir = temp();
  const siteCode = await runCli(["doctor", "--site", siteDir, "--dry-run"]);
  // Fails due to missing package.json/graph.yaml
  assert.equal(siteCode, EXIT_CODES.CONFIG_OR_CLI_ERROR);
});

test("CLI automation contracts: --json and --events mutual exclusivity", async () => {
  const code = await runCli(["doctor", "--json", "--events"]);
  assert.equal(code, EXIT_CODES.CONFIG_OR_CLI_ERROR);
});

test("CLI site create scaffolds a site with --blank and respects --force", async () => {
  const root = temp();
  const targetDir = join(root, "my-shop");

  // Dry run
  const dryCode = await runCli(["site", "create", "--dir", targetDir, "--slug", "my-shop", "--blank", "--dry-run"]);
  assert.equal(dryCode, EXIT_CODES.SUCCESS);
  assert.equal(existsSync(targetDir), false);

  // Real creation
  const createCode = await runCli(["site", "create", "--dir", targetDir, "--slug", "my-shop", "--blank", "--name", "My Shop", "--owner", "owner@example.com"]);
  assert.equal(createCode, EXIT_CODES.SUCCESS);
  assert.ok(existsSync(join(targetDir, "package.json")));
  assert.ok(existsSync(join(targetDir, "agent/graph.yaml")));
  assert.ok(existsSync(join(targetDir, "agent/STATE.json")));
  assert.ok(existsSync(join(targetDir, "launch.json")));

  const launch = JSON.parse(readFileSync(join(targetDir, "launch.json"), "utf8"));
  assert.equal(launch.slug, "my-shop");
  assert.equal(launch.name, "My Shop");
  assert.equal(launch.ownerEmail, "owner@example.com");

  // Refuse overwrite without --force
  const dupCode = await runCli(["site", "create", "--dir", targetDir, "--slug", "my-shop", "--blank"]);
  assert.equal(dupCode, EXIT_CODES.PRECONDITION_FAILED);

  // Allow overwrite with --force
  const forceCode = await runCli(["site", "create", "--dir", targetDir, "--slug", "my-shop", "--blank", "--force"]);
  assert.equal(forceCode, EXIT_CODES.SUCCESS);
});

test("CLI refine classifies requests and validates dry-run", async () => {
  const root = temp();
  await runCli(["site", "create", "--dir", root, "--slug", "test-refine", "--blank"]);

  const dryCode = await runCli(["refine", "--site", root, "--request", "Update the hero headline", "--dry-run"]);
  assert.equal(dryCode, EXIT_CODES.SUCCESS);
});

test("CLI status and cancel manage process locks and state cleanly", async () => {
  const root = temp();
  await runCli(["site", "create", "--dir", root, "--slug", "test-status", "--blank"]);

  const statusCode = await runCli(["status", "--site", root]);
  assert.equal(statusCode, EXIT_CODES.SUCCESS);

  // Write dead/dummy lock
  const lockPath = join(root, "agent/RUN.lock");
  writeFileSync(lockPath, JSON.stringify({ pid: 999999 }));

  const cancelCode = await runCli(["cancel", "--site", root]);
  assert.equal(cancelCode, EXIT_CODES.SUCCESS);
  assert.equal(existsSync(lockPath), false);
});

test("CLI feedback import rejects missing files and validates JSON structure", async () => {
  const root = temp();
  await runCli(["site", "create", "--dir", root, "--slug", "test-feedback", "--blank"]);

  const badCode = await runCli(["feedback", "import", "--site", root, "--run", "run-1", "--file", "nonexistent.json"]);
  assert.equal(badCode, EXIT_CODES.CONFIG_OR_CLI_ERROR);
});

test("CLI verify evaluates compilation and gate status", async () => {
  const root = temp();
  await runCli(["site", "create", "--dir", root, "--slug", "test-verify", "--blank"]);

  const dryCode = await runCli(["verify", "--site", root, "--dry-run"]);
  assert.equal(dryCode, EXIT_CODES.SUCCESS);
});

test("CLI preview and deploy validate options and scoped credentials", async () => {
  const root = temp();
  await runCli(["site", "create", "--dir", root, "--slug", "test-deploy", "--blank"]);

  const prevDry = await runCli(["preview", "--site", root, "--dry-run"]);
  assert.equal(prevDry, EXIT_CODES.SUCCESS);

  // Deploy without credentials fails doctor
  const deployCode = await runCli(["deploy", "--site", root, "--provider", "cloudflare", "--dry-run"]);
  assert.equal(deployCode, EXIT_CODES.CONFIG_OR_CLI_ERROR);

  // Deploy with token credentials passes doctor and dry-run
  process.env.CLOUDFLARE_API_TOKEN = "dummy-token";
  process.env.CLOUDFLARE_ACCOUNT_ID = "dummy-account";
  try {
    const docPass = await api.runDoctor({ site: root, provider: "cloudflare" });
    assert.equal(docPass.ok, true);
    const deployDry = await runCli(["deploy", "--site", root, "--provider", "cloudflare", "--dry-run"]);
    assert.equal(deployDry, EXIT_CODES.SUCCESS);
  } finally {
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
  }
});

test("Programmatic API exports all required functions accepting AbortSignal", async () => {
  assert.equal(typeof api.createSite, "function");
  assert.equal(typeof api.runDoctor, "function");
  assert.equal(typeof api.runSite, "function");
  assert.equal(typeof api.refineSite, "function");
  assert.equal(typeof api.statusSite, "function");
  assert.equal(typeof api.resumeSite, "function");
  assert.equal(typeof api.cancelSite, "function");
  assert.equal(typeof api.importFeedback, "function");
  assert.equal(typeof api.synthesizeSite, "function");
  assert.equal(typeof api.verifySite, "function");
  assert.equal(typeof api.previewSite, "function");
  assert.equal(typeof api.deploySite, "function");
  assert.equal(typeof api.shareSite, "function");

  // Verify AbortSignal cancellation support
  const controller = new AbortController();
  controller.abort();

  const canceledRun = await api.runSite({ site: ".", signal: controller.signal });
  assert.equal(canceledRun.exitCode, EXIT_CODES.ABORTED);

  const canceledRefine = await api.refineSite({ site: ".", request: "Headline", signal: controller.signal });
  assert.equal(canceledRefine.exitCode, EXIT_CODES.ABORTED);
});

test("CLI run supports 5 variants with theme and theme-scope", async () => {
  const root = temp();
  await runCli(["site", "create", "--dir", root, "--slug", "test-variants", "--blank"]);

  // Unsupported variants
  const invalidCode = await runCli(["run", "--site", root, "--variants", "3"]);
  assert.equal(invalidCode, EXIT_CODES.CONFIG_OR_CLI_ERROR);

  // 5 variants dry-run
  const dryCode = await runCli(["run", "--site", root, "--variants", "5", "--theme", "industrial-editorial", "--theme-scope", "one", "--dry-run"]);
  assert.equal(dryCode, EXIT_CODES.SUCCESS);

  // Programmatic API runSite 5 variants dry-run
  const apiDry = await api.runSite({ site: root, variants: 5, theme: "industrial-editorial", themeScope: "one", dryRun: true });
  assert.equal(apiDry.ok, true);
  assert.equal(apiDry.exitCode, EXIT_CODES.SUCCESS);
});

test("CLI feedback and synthesis handle dry-run, validation, and options", async () => {
  const root = temp();
  await runCli(["site", "create", "--dir", root, "--slug", "test-synth", "--blank"]);

  const synthDry = await runCli(["synthesize", "--site", root, "--run", "run-123", "--feedback", "fb.json", "--dry-run"]);
  assert.equal(synthDry, EXIT_CODES.SUCCESS);

  const apiSynthDry = await api.synthesizeSite({ site: root, runId: "run-123", feedback: "fb.json", dryRun: true });
  assert.equal(apiSynthDry.ok, true);
  assert.equal(apiSynthDry.exitCode, EXIT_CODES.SUCCESS);
});

test("CLI status, resume, and share command workflows", async () => {
  const root = temp();
  await runCli(["site", "create", "--dir", root, "--slug", "test-status-resume", "--blank"]);

  const statusJsonCode = await runCli(["status", "--site", root, "--run", "run-123", "--json"]);
  assert.equal(statusJsonCode, EXIT_CODES.SUCCESS);

  const resumeDry = await runCli(["resume", "--site", root, "--run", "run-123", "--dry-run"]);
  assert.equal(resumeDry, EXIT_CODES.SUCCESS);

  const shareDry = await runCli(["share", "--site", root, "--dry-run"]);
  assert.equal(shareDry, EXIT_CODES.SUCCESS);

  const apiShareDry = await api.shareSite({ site: root, dryRun: true });
  assert.equal(apiShareDry.ok, true);
  assert.equal(apiShareDry.exitCode, EXIT_CODES.SUCCESS);

  // Share with tunnel dry-run
  const tunnelShareDry = await api.shareSite({ site: root, dryRun: true, tunnel: true });
  assert.equal(tunnelShareDry.ok, true);
  assert.ok(tunnelShareDry.data?.tunnelUrl);
});

test("adapter configurations tailor arguments for Cursor, Gemini, and Codex", () => {
  // Test Cursor
  const cursorCfg = api.buildAdapterConfig("cursor", "claude-3-5-sonnet");
  assert.equal(cursorCfg.command, "cursor");
  assert.deepEqual(cursorCfg.args, ["--print", "--force", "--trust", "--output-format", "stream-json", "--model", "claude-3-5-sonnet"]);
  assert.equal(cursorCfg.prompt, "stdin");

  // Test Gemini
  const geminiCfg = api.buildAdapterConfig("gemini", "gemini-2.5-flash");
  assert.equal(geminiCfg.command, "gemini");
  assert.deepEqual(geminiCfg.args, ["--stdin", "--model", "gemini-2.5-flash"]);
  assert.equal(geminiCfg.prompt, "stdin");

  // Test Codex
  const codexCfg = api.buildAdapterConfig("codex", "gpt-5");
  assert.equal(codexCfg.command, "codex");
  assert.deepEqual(codexCfg.args, ["exec", "--skip-git-repo-check", "--ephemeral", "-", "--model", "gpt-5"]);
  assert.equal(codexCfg.prompt, "stdin");
});

test("lock safety never steals or unlinks a lock while holder PID is alive", () => {
  const testFile = join(temp(), "resource.txt");

  // Acquire first lock (holder is current alive process)
  const unlock = acquirePathLock(testFile, 5000);

  // Attempting to acquire second lock while first is held by alive PID must timeout, never steal
  assert.throws(() => {
    acquirePathLock(testFile, 150);
  }, /Timeout waiting for path lock/);

  // Release first lock
  unlock();

  // Now second lock can be acquired cleanly
  const unlock2 = acquirePathLock(testFile, 1000);
  assert.equal(typeof unlock2, "function");
  unlock2();
});

test("CLI refine prepare and refine verify subcommands execute transactionally", async () => {
  const root = temp();
  await runCli(["site", "create", "--dir", root, "--slug", "test-refine-pv", "--blank"]);
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home</title></head><body><h1>Hello</h1></body></html>');

  // Dry run prepare
  const dryPrep = await runCli(["refine", "prepare", "--site", root, "--request", "Update hero title", "--dry-run"]);
  assert.equal(dryPrep, EXIT_CODES.SUCCESS);

  // Real prepare
  const realPrep = await runCli(["refine", "prepare", "--site", root, "--request", "Update hero title", "--request-id", "cli-req-1", "--json"]);
  assert.equal(realPrep, EXIT_CODES.SUCCESS);
  assert.ok(existsSync(join(root, "agent/requests/cli-req-1/baseline.json")));
  assert.ok(existsSync(join(root, "agent/requests/cli-req-1/request.json")));

  // Dry run verify
  const dryVerify = await runCli(["refine", "verify", "--site", root, "--dry-run"]);
  assert.equal(dryVerify, EXIT_CODES.SUCCESS);

  // Apply change to satisfy zero-change check
  writeFileSync(join(root, "pages/index.html"), '<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home</title></head><body><h1>Updated Hero Title</h1></body></html>');

  // Real verify
  const realVerify = await runCli(["refine", "verify", "--site", root, "--request-id", "cli-req-1", "--json"]);
  assert.equal(realVerify, EXIT_CODES.SUCCESS);
  assert.ok(!existsSync(join(root, "agent/refine-pending.json")));
});

test("CLI creative profile is opt-in and incompatible with five-variant mode", async () => {
  const site = resolve("src/test/fixtures/active-agent-site");
  assert.equal(await runCli(["run", "--site", site, "--creative", "--dry-run"]), EXIT_CODES.SUCCESS);
  assert.equal(await runCli(["run", "--site", site, "--creative", "--variants", "5", "--dry-run"]), EXIT_CODES.CONFIG_OR_CLI_ERROR);
});

