import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { QualityFinding } from "./contracts.ts";

export type ClaimRecord = { id: string; claim: string; status: "supported" | "unknown" | "contradicted" };

/** Unknown claims stay unknown. They are not promoted into publishable facts. */
export function publishableClaims(claims: ClaimRecord[]): ClaimRecord[] {
  return claims.filter(claim => claim.status === "supported");
}

export type AssetRecord = {
  id: string;
  disposition: "use" | "retain" | "exclude" | "duplicate" | "unresolved";
  origin: "generated" | "photographed" | "diagrammatic" | "unknown";
  sha256?: string;
};

export function eligibleProof(assets: AssetRecord[]): AssetRecord[] {
  return assets.filter(asset => asset.disposition === "use" && asset.origin !== "generated" && asset.origin !== "unknown");
}

export function generatedIsNotProof(asset: AssetRecord): boolean {
  return asset.origin === "generated" || asset.origin === "unknown";
}

export function creativeFinding(input: {
  kind: "restrained" | "purposeful-repetition" | "novelty-unusable" | "alternate-accessible";
  usabilityDefect: boolean;
}): QualityFinding {
  const base = {
    verifier: "creative-freedom",
    verifierVersion: "2026-09-22",
    policyHash: "vitris-launch-2026-09-22",
    repairOwner: "direction",
    verifiedAt: "1970-01-01T00:00:00.000Z",
    domain: "design",
  };
  if (input.kind === "novelty-unusable" && input.usabilityDefect) {
    return {
      ...base,
      id: "novelty-usability",
      requirementId: "wcag-2.1.1-keyboard",
      severity: "serious",
      confidence: "confirmed",
      status: "fail",
      evidence: "The unusual composition has a confirmed usability defect. Taste is not the finding.",
    };
  }
  return {
    ...base,
    id: input.kind,
    requirementId: "teaching-creative-freedom",
    severity: "note",
    confidence: "confirmed",
    status: "pass",
    evidence: input.kind === "restrained"
      ? "A restrained, text-led page is acceptable."
      : input.kind === "purposeful-repetition"
        ? "Repetition that serves one narrative job is acceptable."
        : "An alternate accessible composition remains valid.",
  };
}

export function readJsonIf<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function siteKnowledgeRelease(root: string): string | undefined {
  const site = readJsonIf<{ knowledgeRelease?: string }>(join(root, "site.json"));
  return site?.knowledgeRelease;
}
