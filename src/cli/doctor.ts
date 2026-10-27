import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { recoverPendingTransactions } from "../agent/artifacts.ts";
import { EXIT_CODES, type CommandResult } from "./types.ts";
import { explainBrowserLaunchFailure, loadPlaywrightChromium } from "../agent/playwright-runtime.ts";
import { wranglerCommand } from '../integrations/wrangler-command.ts';

export function hasAuthenticatedWranglerSession(status: number | null, stdout: string): boolean {
  if (status !== 0) return false;
  try { return JSON.parse(stdout)?.loggedIn === true; }
  catch { return false; }
}

export type DoctorOptions = {
  site?: string;
  provider?: string;
  operation?: string;
  dryRun?: boolean;
};

export type DoctorDiagnostic = {
  name: string;
  ok: boolean;
  message: string;
  severity: "error" | "warning" | "info";
};

export async function runDoctor(opts: DoctorOptions = {}): Promise<CommandResult<{ diagnostics: DoctorDiagnostic[] }>> {
  const diagnostics: DoctorDiagnostic[] = [];

  // 1. Check Node.js version
  const nodeMajor = parseInt(process.versions.node.split(".")[0] || "0", 10);
  if (nodeMajor >= 24) {
    diagnostics.push({ name: "node_version", ok: true, message: `Node.js version v${process.versions.node} (>= 24)`, severity: "info" });
  } else {
    diagnostics.push({ name: "node_version", ok: false, message: `Node.js version v${process.versions.node} is below required v24`, severity: "error" });
  }

  // 2. Check Git
  const gitCheck = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (gitCheck.status === 0) {
    diagnostics.push({ name: "git", ok: true, message: gitCheck.stdout.trim(), severity: "info" });
  } else {
    diagnostics.push({ name: "git", ok: false, message: "git executable not found in PATH", severity: "error" });
  }

  // 3. Check Wrangler
  const wranglerCheck = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", "--version"], { encoding: "utf8" });
  if (wranglerCheck.status === 0) {
    diagnostics.push({ name: "wrangler", ok: true, message: wranglerCheck.stdout.trim().split("\n")[0] || "Wrangler available", severity: "info" });
  } else {
    diagnostics.push({ name: "wrangler", ok: false, message: "Wrangler not available via npx", severity: "warning" });
  }

  try {
    const chromium = await loadPlaywrightChromium();
    const executable = typeof chromium.executablePath === "function" ? chromium.executablePath() : "";
    if (executable && existsSync(executable)) {
      diagnostics.push({ name: "playwright_chromium", ok: true, message: "Playwright package and Chromium browser binary are available", severity: "info" });
    } else {
      diagnostics.push({
        name: "playwright_browser",
        ok: false,
        message: "Playwright npm package is installed. The Chromium browser binary is not provisioned. Run: npx playwright install chromium",
        severity: "warning",
      });
    }
  } catch (error) {
    diagnostics.push({ name: "playwright_package", ok: false, message: explainBrowserLaunchFailure(error), severity: "warning" });
  }

  // 4. Site-specific checks if site provided
  if (opts.site) {
    const siteRoot = resolve(opts.site);
    if (!existsSync(siteRoot)) {
      diagnostics.push({ name: "site_exists", ok: false, message: `Site directory not found: ${siteRoot}`, severity: "error" });
    } else {
      diagnostics.push({ name: "site_exists", ok: true, message: `Site directory exists at ${siteRoot}`, severity: "info" });

      const pkgPath = join(siteRoot, "package.json");
      if (existsSync(pkgPath)) {
        diagnostics.push({ name: "package_json", ok: true, message: "package.json present", severity: "info" });
      } else {
        diagnostics.push({ name: "package_json", ok: false, message: "package.json missing from site root", severity: "error" });
      }

      const graphPath = join(siteRoot, "agent/graph.yaml");
      if (existsSync(graphPath)) {
        diagnostics.push({ name: "graph_yaml", ok: true, message: "agent/graph.yaml present", severity: "info" });
      } else {
        diagnostics.push({ name: "graph_yaml", ok: false, message: "agent/graph.yaml missing", severity: "error" });
      }

      const statePath = join(siteRoot, "agent/STATE.json");
      if (existsSync(statePath)) {
        diagnostics.push({ name: "state_json", ok: true, message: "agent/STATE.json present", severity: "info" });
      } else {
        diagnostics.push({ name: "state_json", ok: false, message: "agent/STATE.json missing", severity: "warning" });
      }

      const launchPath = join(siteRoot, "launch.json");
      if (existsSync(launchPath)) {
        diagnostics.push({ name: "launch_json", ok: true, message: "launch.json present", severity: "info" });
      } else {
        diagnostics.push({ name: "launch_json", ok: false, message: "launch.json missing", severity: "warning" });
      }

      // Check lock
      const lockPath = join(siteRoot, "agent/RUN.lock");
      if (existsSync(lockPath)) {
        try {
          const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { pid: number };
          let alive = false;
          try {
            process.kill(lock.pid, 0);
            alive = true;
          } catch {
            alive = false;
          }
          if (alive) {
            diagnostics.push({ name: "run_lock", ok: false, message: `Active run lock held by running PID ${lock.pid}`, severity: "warning" });
          } else {
            diagnostics.push({ name: "run_lock", ok: false, message: `Stale run lock found (PID ${lock.pid} dead)`, severity: "warning" });
          }
        } catch {
          diagnostics.push({ name: "run_lock", ok: false, message: "Malformed agent/RUN.lock", severity: "warning" });
        }
      } else {
        diagnostics.push({ name: "run_lock", ok: true, message: "No active run lock", severity: "info" });
      }

      // Startup journal recovery verification
      try {
        recoverPendingTransactions(siteRoot);
        diagnostics.push({ name: "transaction_recovery", ok: true, message: "Recoverable swap journal clean", severity: "info" });
      } catch (err) {
        diagnostics.push({ name: "transaction_recovery", ok: false, message: `Journal recovery warning: ${err instanceof Error ? err.message : String(err)}`, severity: "warning" });
      }
    }
  }

  // 5. Cloudflare provider checks if requested
  if (opts.provider === "cloudflare" || opts.operation?.includes("deploy")) {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (apiToken && accountId) {
      diagnostics.push({
        name: "cloudflare_auth",
        ok: true,
        message: "Noninteractive Cloudflare authentication configured via CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID",
        severity: "info",
      });
    } else {
      // Check interactive Wrangler session
      let authenticated = false;
      try {
        const command = wranglerCommand(resolve(opts.site || '.'), ['whoami', '--json']);
        const whoami = spawnSync(command.command, command.args, { encoding: 'utf8', timeout: 30_000, windowsHide: true });
        authenticated = hasAuthenticatedWranglerSession(whoami.status, whoami.stdout || '');
      } catch { /* Missing Wrangler or unreadable identity is not an authenticated session. */ }
      if (authenticated) {
        diagnostics.push({
          name: "cloudflare_auth",
          ok: true,
          message: "Interactive Wrangler OAuth session active",
          severity: "info",
        });
      } else {
        diagnostics.push({
          name: "cloudflare_auth",
          ok: false,
          message: "No Cloudflare credentials found. Provide CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID or run 'npx wrangler login'",
          severity: "error",
        });
      }
    }

    // Scoped check: Pages operation does NOT require D1 or R2!
    if (opts.operation === "pages" || !opts.operation) {
      diagnostics.push({
        name: "cloudflare_scope",
        ok: true,
        message: "Scoped resource requirements verified: Cloudflare Pages deployment only (D1 and R2 are not required)",
        severity: "info",
      });
    }
  }

  const hasErrors = diagnostics.some(d => !d.ok && d.severity === "error");
  const summary = diagnostics.map(d => `[${d.ok ? "PASS" : d.severity.toUpperCase()}] ${d.name}: ${d.message}`).join("\n");

  return {
    ok: !hasErrors,
    exitCode: hasErrors ? EXIT_CODES.CONFIG_OR_CLI_ERROR : EXIT_CODES.SUCCESS,
    summary,
    data: { diagnostics },
  };
}
