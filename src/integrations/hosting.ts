import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { artifactManifest } from "../knowledge/artifact.ts";
import { sourceRevision } from "../engine/revision.ts";
import { parseReleaseRecord, type ReleaseRecord } from "../engine/contracts.ts";
import { json, save } from "../agent/artifacts.ts";
import { verifySite } from "../cli/verify.ts";
import { findHarnessRoot } from "../cli/root.ts";
import { isPreserveSite } from "../preserve/config.ts";

export interface VerifiedArtifact {
  schemaVersion: 1;
  sourceRevision: string;
  artifactDigest: string;
  compilerDigest: string;
  harnessVersion: string;
  environment: "preview" | "production";
  policyId: string;
  outputDirectory: string;
  checkedAt: string;
}
export interface DeploymentReceipt {
  provider: string;
  environment: string;
  deploymentId: string;
  url?: string;
  artifactDigest: string;
  issuedAt: string;
}
export interface HostingAdapter {
  id: string;
  deployPreview(artifact: VerifiedArtifact): Promise<DeploymentReceipt>;
  publish(artifact: VerifiedArtifact): Promise<DeploymentReceipt>;
  status?(deploymentId: string): Promise<DeploymentReceipt>;
  attachDomain?(deploymentId: string, domain: string): Promise<DeploymentReceipt>;
  rollback?(deploymentId: string): Promise<DeploymentReceipt>;
}

export async function prepareVerifiedRelease(siteRoot: string, environment: "preview" | "production" = "preview"): Promise<VerifiedArtifact> {
  const root = resolve(siteRoot);
  const verified = await verifySite({ site: root, environment });
  if (!verified.ok) throw new Error(`Release verification failed: ${verified.error || verified.summary}`);
  const distDirectory = join(root, "dist");
  const evidence = json<{ compilerHash: string }>(join(distDirectory, "build-evidence.json"));
  const version = json<{ version: string }>(join(findHarnessRoot(), "package.json")).version;
  const artifactDigest = artifactManifest(distDirectory).sha256;
  const outputDirectory = join(root, "agent/release-bundles", artifactDigest);
  mkdirSync(dirname(outputDirectory), { recursive: true });
  if (!existsSync(outputDirectory)) cpSync(distDirectory, outputDirectory, { recursive: true });
  if (artifactManifest(outputDirectory).sha256 !== artifactDigest) throw new Error("Staged release bytes differ from verified build");
  const artifact: VerifiedArtifact = { schemaVersion: 1, sourceRevision: sourceRevision(root).digest,
    artifactDigest, compilerDigest: evidence.compilerHash,
    harnessVersion: version, environment, policyId: isPreserveSite(root) ? "preserve-preview-v1" : environment === "production" ? "launch-preflight" : "preview-gates",
    outputDirectory, checkedAt: new Date().toISOString() };
  save(join(root, "agent/release-candidate.json"), artifact);
  return artifact;
}

export async function deployVerifiedArtifact(siteRoot: string, artifact: VerifiedArtifact, adapter: HostingAdapter): Promise<{ release: ReleaseRecord; deployment: DeploymentReceipt }> {
  const root = resolve(siteRoot);
  if (!existsSync(join(root, "agent/release-candidate.json"))) throw new Error("No prepared release candidate exists");
  const prepared = json<VerifiedArtifact>(join(root, "agent/release-candidate.json"));
  if (JSON.stringify(prepared) !== JSON.stringify(artifact)) throw new Error("Release candidate differs from the prepared record");
  if (sourceRevision(root).digest !== artifact.sourceRevision) throw new Error("Source changed after release verification");
  if (artifactManifest(artifact.outputDirectory).sha256 !== artifact.artifactDigest) throw new Error("Build bytes changed after release verification");
  const deployment = artifact.environment === "production" ? await adapter.publish(artifact) : await adapter.deployPreview(artifact);
  if (deployment.artifactDigest !== artifact.artifactDigest) throw new Error("Hosting adapter returned a different artifact identity");
  const release = parseReleaseRecord({ schemaVersion: 1, sourceRevision: artifact.sourceRevision,
    buildDigest: artifact.artifactDigest, compilerDigest: artifact.compilerDigest,
    harnessVersion: artifact.harnessVersion, policyId: artifact.policyId,
    environment: artifact.environment, deploymentReceipt: deployment.deploymentId });
  save(join(root, `agent/releases/${randomUUID()}.json`), { release, deployment, adapter: adapter.id });
  return { release, deployment };
}
