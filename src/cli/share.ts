import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { currentRunId } from "../agent/design-run.ts";
import { startDesignReview } from "../agent/design-review-server.ts";
import { previewSite } from "./preview.ts";
import { findKernelRoot } from "./root.ts";
import { killProcessTree } from "./lifecycle.ts";
import { EXIT_CODES, type CommandResult } from "./types.ts";

const kernelRoot = findKernelRoot();

export function findCloudflared(): string | undefined {
  if (process.env.CLOUDFLARED_PATH && existsSync(process.env.CLOUDFLARED_PATH)) {
    return process.env.CLOUDFLARED_PATH;
  }
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const local = join(process.env.LOCALAPPDATA, "cloudflared/cloudflared.exe");
    if (existsSync(local)) return local;
  }
  const probe = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["cloudflared"], { encoding: "utf8" });
  if (probe.status === 0 && probe.stdout) {
    const first = probe.stdout.trim().split(/\r?\n/)[0];
    if (first && existsSync(first)) return first;
  }
  return undefined;
}

export type ShareOptions = {
  site?: string;
  runId?: string;
  port?: number;
  dryRun?: boolean;
  tunnel?: boolean;
  wait?: boolean;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
};

export async function shareSite(opts: ShareOptions = {}): Promise<CommandResult<{ url: string; port?: number; tunnelUrl?: string }>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Site root not found: ${root}`,
    };
  }

  const runId = opts.runId || (existsSync(join(root, "agent/design-runs")) ? currentRunId(root) : undefined);

  if (opts.dryRun) {
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `[dry-run] Would start share server for ${runId ? `design run ${runId}` : `site at ${root}`}${opts.tunnel ? " with Cloudflare Quick Tunnel" : ""}`,
      data: {
        url: opts.tunnel ? "https://mock.trycloudflare.com" : "http://127.0.0.1:0",
        ...(opts.tunnel ? { tunnelUrl: "https://mock.trycloudflare.com" } : {}),
      },
    };
  }

  let localUrl = "";
  let targetPort = opts.port || 0;
  let closeServer: (() => void) | undefined;

  // If design run exists, start the design comparison review server
  if (runId && existsSync(join(root, "agent/design-runs", runId))) {
    const review = await startDesignReview({
      parent: root,
      kernel: kernelRoot,
      runId,
      port: opts.port,
    });
    localUrl = review.url;
    closeServer = () => {
      try { review.server.close(); } catch {}
    };
  } else {
    // Standard site preview share
    const preview = await previewSite({
      site: root,
      port: opts.port,
      signal: opts.signal,
      wait: false,
    });

    if (!preview.ok || !preview.data) {
      return {
        ok: false,
        exitCode: preview.exitCode,
        error: preview.error,
        summary: preview.summary,
      };
    }
    localUrl = preview.data.url;
    targetPort = preview.data.port;
  }

  let tunnelUrl: string | undefined;
  let tunnelProc: ReturnType<typeof spawn> | undefined;

  if (opts.tunnel) {
    const cloudflaredBin = findCloudflared();
    if (!cloudflaredBin) {
      closeServer?.();
      return {
        ok: false,
        exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
        error: "cloudflared executable not found on PATH or LOCALAPPDATA. Install cloudflared to use Cloudflare Quick Tunnels.",
      };
    }

    // Extract port from localUrl
    const urlObj = new URL(localUrl);
    const originPort = urlObj.port || String(targetPort);

    opts.onLog?.(`Starting Cloudflare Quick Tunnel for ${localUrl}...`);

    tunnelUrl = await new Promise<string>((resolveTunnel, rejectTunnel) => {
      let resolved = false;
      const child = spawn(cloudflaredBin, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${originPort}`], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      tunnelProc = child;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          rejectTunnel(new Error("Timeout waiting for Cloudflare Quick Tunnel URL"));
        }
      }, 30000);

      const checkChunk = (chunk: Buffer) => {
        const text = chunk.toString();
        opts.onLog?.(text.trim());
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timer);
          resolveTunnel(match[0]);
        }
      };

      child.stdout?.on("data", checkChunk);
      child.stderr?.on("data", checkChunk);

      child.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          rejectTunnel(err);
        }
      });

      child.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          rejectTunnel(new Error(`cloudflared exited early with code ${code}`));
        }
      });
    }).catch((err) => {
      opts.onLog?.(`Failed to establish tunnel: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    });

    if (!tunnelUrl) {
      closeServer?.();
      return {
        ok: false,
        exitCode: EXIT_CODES.GENERIC_ERROR,
        error: "Failed to establish Cloudflare Quick Tunnel URL",
      };
    }
  }

  const activeUrl = tunnelUrl || localUrl;
  const summary = tunnelUrl
    ? `Cloudflare Quick Tunnel active at ${tunnelUrl} (local: ${localUrl})`
    : `Share active at ${activeUrl}`;

  opts.onLog?.(summary);

  const cleanup = () => {
    if (tunnelProc?.pid) {
      killProcessTree(tunnelProc.pid);
    }
    closeServer?.();
  };

  if (opts.signal) {
    opts.signal.addEventListener("abort", cleanup, { once: true });
  }

  if (opts.wait) {
    await new Promise<void>((resolveWait) => {
      const onDone = () => {
        cleanup();
        resolveWait();
      };
      if (opts.signal) {
        if (opts.signal.aborted) onDone();
        else opts.signal.addEventListener("abort", onDone, { once: true });
      } else {
        process.once("SIGINT", onDone);
        process.once("SIGTERM", onDone);
      }
    });

    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `Share stopped: ${activeUrl}`,
      data: { url: activeUrl, port: targetPort, ...(tunnelUrl ? { tunnelUrl } : {}) },
    };
  }

  return {
    ok: true,
    exitCode: EXIT_CODES.SUCCESS,
    summary,
    data: { url: activeUrl, port: targetPort, ...(tunnelUrl ? { tunnelUrl } : {}) },
  };
}
