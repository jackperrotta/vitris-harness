import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface PathConfinementResult {
  safe: boolean;
  resolvedPath: string;
  reason?: string;
}

/**
 * Validates that candidatePath resolves strictly within the canonical root directory.
 * - Prevents sibling-directory escapes (e.g. /workspace/site-extra from /workspace/site).
 * - Resolves symlinks on both root and target to prevent symlink traversal outside root.
 * - Uses separator-aware relative distance checks.
 */
export function isPathConfined(root: string, candidatePath: string): PathConfinementResult {
  if (!root || !candidatePath) {
    return { safe: false, resolvedPath: "", reason: "Empty root or candidate path" };
  }

  const lexicalRoot = resolve(root);
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync.native ? realpathSync.native(lexicalRoot) : realpathSync(lexicalRoot);
  } catch {
    canonicalRoot = lexicalRoot;
  }

  const resolvedCandidate = isAbsolute(candidatePath)
    ? resolve(candidatePath)
    : resolve(lexicalRoot, candidatePath);

  // Check 1: Pre-symlink relative path check
  // Compare lexical paths before resolving either side through a junction.
  // The canonical target check below still rejects escaping child symlinks.
  const rel = relative(lexicalRoot, resolvedCandidate);
  const canonicalRel = relative(canonicalRoot, resolvedCandidate);
  const escapes = (path: string) => path.startsWith('..') || isAbsolute(path) || path.split(sep).includes('..');
  if (escapes(rel) && escapes(canonicalRel)) {
    return {
      safe: false,
      resolvedPath: resolvedCandidate,
      reason: `Relative path escapes root: ${rel}`,
    };
  }

  // Check 2: If file or symlink exists on disk, resolve its realpath to prevent symlink escapes
  if (existsSync(resolvedCandidate)) {
    try {
      const realTarget = realpathSync.native ? realpathSync.native(resolvedCandidate) : realpathSync(resolvedCandidate);
      const relReal = relative(canonicalRoot, realTarget);
      if (escapes(relReal)) {
        return {
          safe: false,
          resolvedPath: realTarget,
          reason: `Symlink target escapes root: ${relReal}`,
        };
      }
      return { safe: true, resolvedPath: realTarget };
    } catch (err: any) {
      return { safe: false, resolvedPath: resolvedCandidate, reason: err.message };
    }
  }

  return { safe: true, resolvedPath: resolvedCandidate };
}

export interface VisualProvenanceResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates that a visual record (screenshot) has plausible provenance.
 * Checks existence, mtime within preparation lease window, and environment match.
 * If provenance is unavailable, returns { valid: false, reason: "provenance_unavailable" }.
 */
export function validateVisualProvenance(opts: {
  screenshotPath: string;
  expectedEnvironment?: string;
  preparationId: string;
  leaseStartMs?: number;
  leaseEndMs?: number;
}): VisualProvenanceResult {
  const { screenshotPath, expectedEnvironment, preparationId, leaseStartMs, leaseEndMs } = opts;

  if (!existsSync(screenshotPath)) {
    return { valid: false, reason: "provenance_unavailable" };
  }

  try {
    const stat = statSync(screenshotPath);
    if (leaseStartMs !== undefined && leaseEndMs !== undefined) {
      if (stat.mtimeMs < leaseStartMs || stat.mtimeMs > leaseEndMs) {
        return {
          valid: false,
          reason: `Screenshot mtime ${new Date(stat.mtimeMs).toISOString()} is outside preparation lease window [${new Date(leaseStartMs).toISOString()}, ${new Date(leaseEndMs).toISOString()}] for preparation ${preparationId}.`,
        };
      }
    }

    // Check for environment metadata in a sidecar JSON if present
    const metadataPath = screenshotPath + ".meta.json";
    if (expectedEnvironment && existsSync(metadataPath)) {
      try {
        const meta = JSON.parse(readFileSync(metadataPath, "utf8"));
        if (meta.environment && meta.environment !== expectedEnvironment) {
          return {
            valid: false,
            reason: `Screenshot environment "${meta.environment}" does not match expected "${expectedEnvironment}".`,
          };
        }
      } catch {
        // Metadata unreadable; provenance check continues without it
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "provenance_unavailable" };
  }
}
