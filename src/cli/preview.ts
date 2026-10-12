import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { previewServer } from "../build/serve.ts";
import { buildVerified } from "../build/verified.ts";
import { EXIT_CODES, type CommandResult } from "./types.ts";

export type PreviewOptions = {
  site?: string;
  port?: number;
  open?: boolean;
  dryRun?: boolean;
  wait?: boolean;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
};

export async function previewSite(opts: PreviewOptions = {}): Promise<CommandResult<{ url: string; port: number }>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) {
    return {
      ok: false,
      exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
      error: `Site root not found: ${root}`,
    };
  }

  const dist = join(root, "dist");
  if (!existsSync(join(dist, "index.html"))) {
    try {
      await buildVerified(root);
    } catch (err) {
      return {
        ok: false,
        exitCode: EXIT_CODES.GATES_FAILED,
        error: `Could not build site for preview: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  if (opts.dryRun) {
    return {
      ok: true,
      exitCode: EXIT_CODES.SUCCESS,
      summary: `[dry-run] Would start preview server for ${dist}`,
      data: { url: "http://127.0.0.1:0", port: 0 },
    };
  }

  const server = previewServer(dist);
  const targetPort = opts.port || 0;

  return new Promise((resolveResult) => {
    server.listen(targetPort, "127.0.0.1", () => {
      const addr = server.address() as { port: number; address: string };
      const port = addr.port;
      const url = `http://127.0.0.1:${port}`;

      if (opts.signal) {
        opts.signal.addEventListener("abort", () => {
          server.close();
        }, { once: true });
      }

      if (opts.wait) {
        opts.onLog?.(`Local preview active at ${url}`);
        const closePromise = new Promise<void>((resolveClose) => {
          const cleanup = () => {
            try { server.close(() => resolveClose()); } catch { resolveClose(); }
          };
          if (opts.signal) {
            if (opts.signal.aborted) cleanup();
            else opts.signal.addEventListener("abort", cleanup, { once: true });
          } else {
            process.once("SIGINT", cleanup);
            process.once("SIGTERM", cleanup);
          }
        });
        closePromise.then(() => {
          resolveResult({
            ok: true,
            exitCode: EXIT_CODES.SUCCESS,
            summary: `Preview server stopped for ${url}`,
            data: { url, port },
          });
        });
        return;
      }

      resolveResult({
        ok: true,
        exitCode: EXIT_CODES.SUCCESS,
        summary: `Local preview active at ${url}`,
        data: { url, port },
      });
    });

    server.on("error", (err) => {
      resolveResult({
        ok: false,
        exitCode: EXIT_CODES.GENERIC_ERROR,
        error: `Preview server error: ${err.message}`,
      });
    });
  });
}
