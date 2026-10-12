import type { ArtifactManifest } from "./artifact.ts";
import type { EvidenceReceipt } from "./evidence.ts";
import { verifyReceipt } from "./evidence.ts";
import { LAUNCH_POLICY_ID, KNOWLEDGE_RELEASE } from "./contracts.ts";
import { compareArtifactPaths } from "./artifact-order.ts";

export type PublishBundleBody = {
  schemaVersion: 1;
  tenantId: string;
  slug: string;
  project: string;
  knowledgeRelease: string;
  issuedAt: number;
  expiresAt: number;
  artifact: ArtifactManifest;
  evidence: EvidenceReceipt;
  files: Record<string, string>; // base64 of exact publishable bytes
};
export type SignedPublishBundle = PublishBundleBody & { signature: string };

const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
const sha = async (bytes: Uint8Array) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)));
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => compareArtifactPaths(a, b)).map(([key, entry]) => [key, canonical(entry)])) : value;
const payload = (body: PublishBundleBody) => encoder.encode(JSON.stringify(canonical(body)));
const key = async (secret: string) => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function manifestFromBase64(files: Record<string, string>): Promise<ArtifactManifest> {
  const names = Object.keys(files).sort(compareArtifactPaths);
  if (!names.length) throw new Error("Bundle contains no files");
  let total = 0;
  const entries: ArtifactManifest["files"] = [];
  for (const path of names) {
    if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === "..")) throw new Error(`Unsafe bundle path: ${path}`);
    const raw = files[path]!;
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) throw new Error(`Invalid base64 for ${path}`);
    const bytes = Uint8Array.from(atob(raw), char => char.charCodeAt(0));
    total += bytes.length;
    if (total > 50_000_000) throw new Error("Bundle exceeds 50 MB limit");
    entries.push({ path, bytes: bytes.length, sha256: await sha(bytes) });
  }
  return { schemaVersion: 1, files: entries, sha256: await sha(encoder.encode(JSON.stringify(entries))) };
}

export async function signPublishBundle(body: PublishBundleBody, secret: string): Promise<SignedPublishBundle> {
  if (secret.length < 32) throw new Error("Publish attestation secret must contain at least 32 characters");
  return { ...body, signature: hex(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), payload(body)))) };
}

export async function verifyPublishBundle(bundle: SignedPublishBundle, secret: string, now = Date.now()): Promise<{ ok: boolean; reason?: string }> {
  if (secret.length < 32) return { ok: false, reason: "Publish attestation secret is not configured" };
  if (bundle?.schemaVersion !== 1 || !bundle.slug || !bundle.project || !bundle.tenantId || !bundle.evidence || !bundle.artifact || !bundle.files) return { ok: false, reason: "Incomplete publish bundle" };
  if (!Number.isFinite(bundle.issuedAt) || !Number.isFinite(bundle.expiresAt) || bundle.issuedAt > now + 60_000 || bundle.expiresAt < now || bundle.expiresAt - bundle.issuedAt > 15 * 60_000) return { ok: false, reason: "Publish attestation is stale or has invalid timing" };
  if (!/^[a-z0-9-]+$/.test(bundle.slug) || !/^[a-z0-9-]+$/.test(bundle.project)) return { ok: false, reason: "Invalid publish target" };
  if (!/^[0-9a-f]{64}$/.test(bundle.signature || "")) return { ok: false, reason: "Missing publish signature" };
  const { signature, ...body } = bundle;
  const sig = Uint8Array.from(signature.match(/../g)!, part => parseInt(part, 16));
  if (!await crypto.subtle.verify("HMAC", await key(secret), sig as BufferSource, payload(body))) return { ok: false, reason: "Publish signature does not authenticate this bundle" };
  let current: ArtifactManifest;
  try { current = await manifestFromBase64(bundle.files); }
  catch (error) { return { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
  if (JSON.stringify(current) !== JSON.stringify(bundle.artifact)) return { ok: false, reason: "Bundle artifact bytes do not match the signed manifest" };
  const receipt = verifyReceipt(bundle.evidence);
  if (!receipt.ok || bundle.evidence.id !== "launch-preflight" || bundle.evidence.scope !== "launch") return { ok: false, reason: receipt.reason || "Signed evidence is not a launch-preflight receipt" };
  if (bundle.evidence.buildHash !== current.sha256 || bundle.evidence.policyHash !== LAUNCH_POLICY_ID || bundle.evidence.passed !== true) return { ok: false, reason: "Launch evidence does not match the exact bundle and active policy" };
  if (bundle.knowledgeRelease !== KNOWLEDGE_RELEASE || !bundle.evidence.knowledgeHash || bundle.evidence.knowledgeHash === "unavailable") return { ok: false, reason: "Knowledge release or evidence is unavailable" };
  return { ok: true };
}

export function decodeBundleFile(raw: string): Uint8Array {
  return Uint8Array.from(atob(raw), char => char.charCodeAt(0));
}
