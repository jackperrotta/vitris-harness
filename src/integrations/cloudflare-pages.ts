import { spawn } from "node:child_process";
import { artifactManifest } from "../knowledge/artifact.ts";
import type { DeploymentReceipt, HostingAdapter, VerifiedArtifact } from "./hosting.ts";
import { wranglerCommand } from "./wrangler-command.ts";

export async function ensurePreservePreviewProject(project: string, branch: string, signal?: AbortSignal): Promise<void> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error("Preserve preview provisioning requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN with Pages Edit access");
  if (!/^[a-z0-9][a-z0-9-]{0,57}$/.test(project)) throw new Error("Invalid Pages project name");
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/pages/projects`;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const response = await fetch(`${endpoint}/${project}`, { headers, signal });
  if (response.status === 404) {
    if (branch === "production") throw new Error("Preview branch cannot be production");
    const created = await fetch(endpoint, { method: "POST", headers, signal, body: JSON.stringify({ name: project, production_branch: "production" }) });
    const body = await created.json() as { success?: boolean };
    if (!created.ok || !body.success) throw new Error(`Could not create Pages preview project (HTTP ${created.status})`);
    return;
  }
  const body = await response.json() as { success?: boolean; result?: { production_branch?: string } };
  if (!response.ok || !body.success || !body.result?.production_branch) throw new Error(`Cannot confirm Pages production branch (HTTP ${response.status})`);
  if (branch === body.result.production_branch) throw new Error("Preview branch cannot equal the project's production branch");
}

export function cloudflarePagesAdapter(opts: {
  siteRoot: string;
  project: string;
  previewBranch?: string;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
  ensurePreviewProject?: boolean;
}): HostingAdapter {
  const run = async (args: string[]): Promise<{ code: number | null; output: string }> => {
    opts.signal?.throwIfAborted();
    const command = wranglerCommand(opts.siteRoot, args);
    return new Promise((done, reject) => {
      const child = spawn(command.command, command.args, { cwd: opts.siteRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      const abort = () => { child.kill(); };
      child.stdout?.on("data", (chunk: Buffer) => { const line = chunk.toString(); output += line; opts.onLog?.(line.trim()); });
      child.stderr?.on("data", (chunk: Buffer) => { const line = chunk.toString(); output += line; opts.onLog?.(line.trim()); });
      child.on("error", error => { opts.signal?.removeEventListener("abort", abort); reject(error); });
      child.on("close", code => { opts.signal?.removeEventListener("abort", abort); done({ code, output }); });
      opts.signal?.addEventListener("abort", abort, { once: true });
    });
  };
  const deploy = async (artifact: VerifiedArtifact, branch?: string): Promise<DeploymentReceipt> => {
    if (artifactManifest(artifact.outputDirectory).sha256 !== artifact.artifactDigest) throw new Error("Release bundle changed before Wrangler deployment");
    if (opts.ensurePreviewProject) {
      if (artifact.environment !== "preview" || !branch) throw new Error("Preservation hosting requires a preview branch");
      await ensurePreservePreviewProject(opts.project, branch, opts.signal);
    }
    const args = ["pages", "deploy", artifact.outputDirectory, `--project-name=${opts.project}`];
    if (branch) args.push(`--branch=${branch}`);
    const result = await run(args);
    if (result.code !== 0) throw new Error(`Wrangler deployment failed: ${result.output}`);
    if (artifactManifest(artifact.outputDirectory).sha256 !== artifact.artifactDigest) throw new Error("Release bundle changed during Wrangler deployment");
    const url = result.output.match(/https:\/\/[a-z0-9_.-]+\.pages\.dev/i)?.[0];
    if (!url) throw new Error("Wrangler succeeded without a deployment URL; deployment identity is unknown");
    return { provider: "cloudflare-pages", environment: artifact.environment, deploymentId: url,
      url, artifactDigest: artifact.artifactDigest, issuedAt: new Date().toISOString() };
  };
  return { id: "cloudflare-pages", deployPreview: artifact => deploy(artifact, opts.previewBranch || "preview"),
    publish: artifact => deploy(artifact) };
}
