import { createHash } from "node:crypto";
import type { LaunchEvidence, LaunchOverride, QualityFinding } from "./contracts.ts";
import { LAUNCH_POLICY_ID } from "./contracts.ts";

export type LaunchDecision = {
  policyId: string;
  environment: "preview" | "production";
  launchAllowed: boolean;
  previewAllowed: boolean;
  conformanceClaim: "none";
  blockers: QualityFinding[];
  warnings: QualityFinding[];
  unknowns: QualityFinding[];
  waived: QualityFinding[];
  summary: string;
};

function blocksProduction(finding: QualityFinding): boolean {
  if (finding.status === "waived" || finding.status === "pass" || finding.status === "not-applicable") return false;
  if (finding.status === "tool-error" || finding.status === "stale") return true;
  if (finding.status === "unknown" && finding.severity === "serious") return true;
  return finding.status === "fail" && finding.severity === "serious" && finding.confidence === "confirmed";
}

export function policyHash(policyId = LAUNCH_POLICY_ID): string {
  return createHash("sha256").update(policyId).digest("hex");
}

export function applyOverrides(findings: QualityFinding[], overrides: LaunchOverride[] = [], buildHash = "", activePolicy = LAUNCH_POLICY_ID): QualityFinding[] {
  return findings.map(item => {
    const override = overrides.find(entry => entry.findingId === item.id);
    if (!override) return item;
    const matches = override.buildHash === buildHash && override.policyHash === activePolicy && override.reason.trim() && override.scope.trim();
    if (!matches) return item;
    return { ...item, status: "waived", evidence: `${item.evidence} Waived for scope ${override.scope}: ${override.reason}` };
  });
}

export function evaluateLaunchDecision(input: {
  environment: "preview" | "production";
  findings: QualityFinding[];
  buildHash: string;
  overrides?: LaunchOverride[];
  requiredVerifierStatus?: "ok" | "unavailable" | "stale";
  evidenceTrusted?: boolean;
}): LaunchDecision {
  const adjusted = applyOverrides(input.findings, input.overrides, input.buildHash, LAUNCH_POLICY_ID);
  const findings = [...adjusted];
  if (input.environment === "production" && input.requiredVerifierStatus && input.requiredVerifierStatus !== "ok") {
    findings.push({
      id: "required-verifier",
      requirementId: "vitris-launch-evidence-binding",
      domain: "publication",
      severity: "serious",
      confidence: "confirmed",
      status: input.requiredVerifierStatus === "stale" ? "stale" : "tool-error",
      evidence: `Required browser verification is ${input.requiredVerifierStatus}.`,
      verifier: "launch-policy",
      verifierVersion: "2026-09-22",
      policyHash: LAUNCH_POLICY_ID,
      repairOwner: "browser",
      verifiedAt: "1970-01-01T00:00:00.000Z",
      suggestedRepair: "Produce a trusted browser receipt for this exact build, or stay on preview.",
    });
  }
  if (input.environment === "production" && input.evidenceTrusted === false) {
    findings.push({
      id: "untrusted-evidence",
      requirementId: "vitris-launch-evidence-binding",
      domain: "publication",
      severity: "serious",
      confidence: "confirmed",
      status: "fail",
      evidence: "Browser evidence was not marked trusted. Agent-authored receipts are not accepted.",
      verifier: "launch-policy",
      verifierVersion: "2026-09-22",
      policyHash: LAUNCH_POLICY_ID,
      repairOwner: "launch",
      verifiedAt: "1970-01-01T00:00:00.000Z",
    });
  }
  const blockers = findings.filter(blocksProduction);
  const waived = findings.filter(item => item.status === "waived");
  const warnings = findings.filter(item => item.status === "warning" || (item.severity === "warning" && item.status !== "fail"));
  const unknowns = findings.filter(item => item.status === "unknown" && item.severity !== "serious");
  const launchAllowed = input.environment === "production" && blockers.length === 0;
  const summary = launchAllowed
    ? "Production launch checks passed. This is not a WCAG conformance claim. Manual coverage stays disclosed."
    : input.environment === "preview"
      ? `Preview remains available. ${blockers.length} production blocker(s) would stop launch.`
      : `Production launch blocked: ${blockers.map(item => item.id).join(", ") || "verification incomplete"}.`;
  return {
    policyId: LAUNCH_POLICY_ID,
    environment: input.environment,
    launchAllowed,
    previewAllowed: true,
    conformanceClaim: "none",
    blockers,
    warnings,
    unknowns,
    waived,
    summary,
  };
}

export function workerProductionAllowed(evidence: LaunchEvidence | undefined, findings: QualityFinding[], buildHash: string, authenticated = false): LaunchDecision {
  if (!authenticated || !evidence?.trusted || evidence.buildHash !== buildHash || evidence.policyHash !== LAUNCH_POLICY_ID) {
    return evaluateLaunchDecision({
      environment: "production",
      findings,
      buildHash,
      requiredVerifierStatus: "unavailable",
      evidenceTrusted: false,
    });
  }
  return evaluateLaunchDecision({
    environment: "production",
    findings: [...findings, ...evidence.findings],
    buildHash,
    overrides: evidence.overrides,
    requiredVerifierStatus: evidence.browserVerifier,
    evidenceTrusted: true,
  });
}
