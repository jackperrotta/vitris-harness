import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runDoctor } from "./doctor.ts";
import { EXIT_CODES, type CommandResult } from "./types.ts";
import { prepareVerifiedRelease, deployVerifiedArtifact } from "../integrations/hosting.ts";
import { cloudflarePagesAdapter } from "../integrations/cloudflare-pages.ts";
import { isPreserveSite } from "../preserve/config.ts";
import { verifyPreservedSite } from "../preserve/verify.ts";
import { deploymentSmoke } from "../integrations/deployment-smoke.ts";

export type DeployOptions = {
  site?: string;
  provider?: "cloudflare";
  environment?: "preview" | "production";
  branch?: string;
  dryRun?: boolean;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
};

export type DeployResultData = {
  url?: string;
  environment: string;
  project: string;
  smokeCheck?: { ok: boolean; status: number; message: string };
};

export async function deploySite(opts: DeployOptions = {}): Promise<CommandResult<DeployResultData>> {
  const root = resolve(opts.site || ".");
  if (!existsSync(root)) return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: `Site root not found: ${root}` };
  const provider = opts.provider || "cloudflare";
  if (provider !== "cloudflare") return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: `Unsupported provider: ${provider}` };
  const environment = opts.environment || "preview";
  if (isPreserveSite(root) && environment !== "preview") return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR, error: "Preserve mode supports temporary previews only; customer domains and production publication are not enabled" };
  const launch = existsSync(join(root, "launch.json"))
    ? JSON.parse(readFileSync(join(root, "launch.json"), "utf8")) as { pagesProject?: string; slug?: string }
    : {};
  const project = launch.pagesProject || launch.slug || "vitris-site";
  const doctor = await runDoctor({ site: root, provider: "cloudflare", operation: "pages" });
  if (!doctor.ok) return { ok: false, exitCode: EXIT_CODES.CONFIG_OR_CLI_ERROR,
    error: `Deployment doctor checks failed:\n${doctor.summary}` };
  if (opts.dryRun) return { ok: true, exitCode: EXIT_CODES.SUCCESS,
    summary: `[dry-run] Would verify and deploy ${project} to Cloudflare Pages (${environment})`,
    data: { environment, project } };

  try {
    opts.onLog?.("Preparing a verified, staged release bundle...");
    const artifact = await prepareVerifiedRelease(root, environment);
    const adapter = cloudflarePagesAdapter({ siteRoot: root, project, previewBranch: opts.branch, signal: opts.signal, onLog: opts.onLog, ensurePreviewProject: isPreserveSite(root) });
    const { deployment } = await deployVerifiedArtifact(root, artifact, adapter);
    let smokeCheck: DeployResultData["smokeCheck"];
    if (deployment.url) {
      opts.onLog?.(`Checking ${deployment.url}...`);
      smokeCheck = await deploymentSmoke(deployment.url, { signal: opts.signal, onLog: opts.onLog, preserved: isPreserveSite(root) });
    }
    if (smokeCheck && !smokeCheck.ok) return { ok: false, exitCode: EXIT_CODES.DEPLOYMENT_FAILED,
      error: `Deployment smoke check failed: ${smokeCheck.message}`,
      data: { url: deployment.url, environment, project, smokeCheck } };
    if (isPreserveSite(root) && deployment.url) {
      opts.onLog?.("Checking the hosted preservation across all captured routes and viewports...");
      const remote = await verifyPreservedSite(root, { remoteUrl: deployment.url, signal: opts.signal, onLog: opts.onLog });
      if (!remote.ok) return { ok: false, exitCode: EXIT_CODES.DEPLOYMENT_FAILED, error: "Hosted preservation checks failed; see agent/reviews/preserve-remote.json", failures: remote.failures, data: { url: deployment.url, environment, project, smokeCheck } };
    }
    return { ok: true, exitCode: EXIT_CODES.SUCCESS, summary: `Deployed exact verified bundle to ${deployment.url}`,
      data: { url: deployment.url, environment, project, smokeCheck } };
  } catch (error) {
    return { ok: false, exitCode: EXIT_CODES.DEPLOYMENT_FAILED, error: error instanceof Error ? error.message : String(error) };
  }
}
