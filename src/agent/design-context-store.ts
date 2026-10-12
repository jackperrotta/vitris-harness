import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { json } from "./artifacts.ts";
import type { DesignContextPacket } from "./design-context-packet.ts";
import { loadKnowledgeCatalog, readLessonBody } from "./design-knowledge.ts";
import { loadCompositionPack } from "../knowledge/composition.ts";
import { resolveDesignAuthoring } from "./composition-authoring.ts";
import { loadPreparation } from "./preparation.ts";
import { referenceContext } from "./reference-library.ts";

export function persistDesignContextArtifacts(root: string, preparationId: string, packet: DesignContextPacket): void {
  const dir = join(root, "agent/runs");
  writeFileSync(join(dir, `${preparationId}.design-context.json`), JSON.stringify({
    manifest: packet.manifest,
    expansions: packet.expansions.map(item => ({ id: item.id, hash: item.hash, chars: item.chars })),
  }, null, 2), "utf8");
  if (packet.expansions.length) {
    writeFileSync(join(dir, `${preparationId}.design-context.expansions.json`), JSON.stringify({
      schemaVersion: 1,
      preparationId,
      items: packet.expansions.map(item => ({ id: item.id, hash: item.hash, chars: item.chars, text: item.text })),
    }, null, 2), "utf8");
  }
}

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function loadSidecarExpansion(root: string, preparationId: string, id: string): { text: string; hash: string; chars: number } | undefined {
  const path = join(root, "agent/runs", `${preparationId}.design-context.expansions.json`);
  if (!existsSync(path)) return undefined;
  try {
    const file = json<{ items?: { id: string; hash: string; chars: number; text: string }[] }>(path);
    const item = (file.items || []).find(entry => entry.id === id);
    if (!item?.text) return undefined;
    return { text: item.text, hash: item.hash, chars: item.chars };
  } catch {
    return undefined;
  }
}

type ExpansionResult = { ok: true; text: string } | { ok: false; reason: string; stale?: boolean };

function lessonHandle(id: string): { lessonId: string; version: number } | undefined {
  const match = /^lesson:([^@]+)@(\d+)$/.exec(id);
  if (!match) return undefined;
  return { lessonId: match[1]!, version: Number(match[2]) };
}

export function resolveDesignContextExpansion(root: string, preparationId: string, id: string): ExpansionResult {
  const preparation = loadPreparation(root, preparationId);
  if (!preparation) {
    return { ok: false, reason: `Unknown preparation ${preparationId}. Run prepare for this stage, then expand with that preparation id.` };
  }
  if (preparation.status === "invalidated" || preparation.status === "canceled") {
    return { ok: false, reason: `Preparation ${preparationId} is ${preparation.status}. Prepare the stage again before expanding context.`, stale: true };
  }

  const manifestPath = join(root, "agent/runs", `${preparationId}.design-context.json`);
  if (!existsSync(manifestPath)) return { ok: false, reason: `Missing design context manifest for preparation ${preparationId}` };
  const manifestFile = json<{ manifest?: DesignContextPacket["manifest"]; expansions?: { id: string; hash: string; chars: number }[] }>(manifestPath);
  const listed = (manifestFile.expansions || manifestFile.manifest?.expansions || []).find(entry => entry.id === id);
  if (!listed) return { ok: false, reason: `Unknown expansion ${id}. Use a handle printed in the design context for preparation ${preparationId}.` };

  if (id.startsWith("reference-")) {
    try {
      const current = referenceContext(root, preparation.nodeId);
      const recorded = manifestFile.manifest;
      if (!current || recorded?.sourceHashes["reference-policy"] !== current.policy.hash || recorded.sourceHashes["reference-release"] !== current.pack.manifestHash || recorded.sourceHashes["reference-signals"] !== current.receipt.inputSignalHash || recorded.sourceHashes["reference-teaching-release"] !== current.receipt.teachingManifestHash) return { ok: false, stale: true, reason: "Reference policy, release, teaching source or brief changed; prepare again" };
      const authoritative = current.expansions.find(item => item.id === id);
      const sidecar = loadSidecarExpansion(root, preparationId, id);
      if (!authoritative || !sidecar || authoritative.hash !== listed.hash || sha(sidecar.text) !== listed.hash || sidecar.text !== authoritative.text) return { ok: false, stale: true, reason: "Reference expansion stale or tampered; prepare again" };
      return { ok: true, text: authoritative.text };
    } catch (error) { return { ok: false, stale: true, reason: String(error) }; }
  }

  const compositionHandle = /^composition:(cmp-[a-z0-9-]+)@(\d+)$/.exec(id);
  if (compositionHandle) {
    const policy = resolveDesignAuthoring(root);
    if (policy.mode !== "composition-v1" || manifestFile.manifest?.authoringPolicy?.hash !== policy.hash) return { ok: false, stale: true, reason: "Composition authoring policy changed since preparation. Prepare again." };
    const pack = loadCompositionPack(root, policy.lessonRelease);
    if (manifestFile.manifest?.compositionSelection?.manifestHash !== pack.manifestHash) return { ok: false, stale: true, reason: "Composition release changed since preparation. Prepare again." };
    const lesson = pack.lessons.find(item => item.id === compositionHandle[1] && item.version === Number(compositionHandle[2]));
    if (!lesson) return { ok: false, reason: `Unknown composition lesson ${id}` };
    const body = pack.body(lesson.id);
    const sidecar = loadSidecarExpansion(root, preparationId, id);
    if (sha(body) !== listed.hash || body.length !== listed.chars || !sidecar || sha(sidecar.text) !== listed.hash || sidecar.text !== body) return { ok: false, stale: true, reason: `Composition expansion ${id} is stale or tampered. Prepare again.` };
    return { ok: true, text: body };
  }

  const handle = lessonHandle(id);
  if (handle) {
    const catalog = loadKnowledgeCatalog(root);
    const lesson = catalog?.lessons.find(item => item.id === handle.lessonId && item.version === handle.version);
    if (!catalog || !lesson) {
      return { ok: false, reason: `Authoritative lesson ${id} is not in the current knowledge catalog.` };
    }
    const recorded = (manifestFile.manifest?.selectedLessons || []).find(item => item.id === handle.lessonId);
    const recordedHash = recorded?.contentHash || manifestFile.manifest?.sourceHashes?.[`lesson:${handle.lessonId}`];
    if (recordedHash && lesson.contentHash !== recordedHash) {
      return {
        ok: false,
        stale: true,
        reason: `Selected lesson ${handle.lessonId} changed since preparation ${preparationId} (recorded ${recordedHash.slice(0, 12)}, current ${lesson.contentHash.slice(0, 12)}). Prepare again. The original preparation was not rewritten.`,
      };
    }
    if (recorded && recorded.version !== lesson.version) {
      return { ok: false, stale: true, reason: `Lesson ${handle.lessonId} version changed since preparation ${preparationId}. Prepare again.` };
    }
    const currentText = readLessonBody(catalog.kernel, lesson);
    const currentHash = sha(currentText);
    if (currentHash !== listed.hash || currentText.length !== listed.chars) {
      return {
        ok: false,
        stale: true,
        reason: `Authoritative lesson text for ${id} no longer matches the expansion recorded on preparation ${preparationId}. Prepare again.`,
      };
    }
    const sidecar = loadSidecarExpansion(root, preparationId, id);
    if (sidecar) {
      const sidecarHash = sha(sidecar.text);
      if (sidecarHash !== listed.hash || sidecar.text.length !== listed.chars || sidecarHash !== currentHash) {
        return { ok: false, reason: `Expansion ${id} sidecar does not match the recorded hash or the current lesson. Rejecting tampered or stale text.` };
      }
      return { ok: true, text: sidecar.text };
    }
    return { ok: true, text: currentText };
  }

  const sidecar = loadSidecarExpansion(root, preparationId, id);
  if (!sidecar) return { ok: false, reason: `Expansion ${id} has no authoritative source.` };
  const sidecarHash = sha(sidecar.text);
  if (sidecarHash !== listed.hash || sidecar.text.length !== listed.chars) {
    return { ok: false, reason: `Expansion ${id} sidecar does not match the recorded hash.` };
  }
  return { ok: true, text: sidecar.text };
}

export function loadPersistedDesignContextPacket(root: string, preparationId: string): DesignContextPacket | undefined {
  const manifestPath = join(root, "agent/runs", `${preparationId}.design-context.json`);
  if (!existsSync(manifestPath)) return undefined;
  try {
    const file = json<{ manifest: DesignContextPacket["manifest"]; expansions?: { id: string; hash: string; chars: number }[] }>(manifestPath);
    const sidecarPath = join(root, "agent/runs", `${preparationId}.design-context.expansions.json`);
    const sidecar = existsSync(sidecarPath) ? json<{ items?: { id: string; hash: string; chars: number; text: string }[] }>(sidecarPath) : { items: [] };
    const expansions = (file.expansions || file.manifest.expansions || []).map(meta => {
      const body = (sidecar.items || []).find(item => item.id === meta.id);
      return body ? { ...meta, text: body.text } : { ...meta, text: "" };
    }).filter(item => item.text);
    return {
      manifest: file.manifest,
      text: "",
      expansions,
    };
  } catch {
    return undefined;
  }
}

export function expandDesignContextForPreparation(root: string, preparationId: string, id: string): ExpansionResult {
  return resolveDesignContextExpansion(root, preparationId, id);
}
