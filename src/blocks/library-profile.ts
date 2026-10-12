import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { loadBlockLibrary, libraryContentHash, type BlockLibrary } from "../agent/jev/block-catalog.ts";

export type LibraryProfile = "legacy-v0" | "slice-v1";

/** The profile is site-owned. A refresh must not rewrite launch.json. */
export function readLibraryProfile(siteRoot: string): LibraryProfile {
  const file = join(siteRoot, "launch.json");
  if (!existsSync(file)) return "legacy-v0";
  const value = JSON.parse(readFileSync(file, "utf8")).designLibraryProfile;
  if (value === undefined || value === null) return "legacy-v0";
  if (value === "legacy-v0" || value === "slice-v1") return value;
  throw new Error(`Unknown designLibraryProfile: ${String(value)}`);
}

export function loadProfiledBlockLibrary(kernel: string, siteRoot: string): {
  profile: LibraryProfile;
  releaseIdentity: string;
  library: BlockLibrary;
} {
  const profile = readLibraryProfile(siteRoot);
  const library = loadBlockLibrary(kernel);
  const legacyFile = join(kernel, "design-system/library-releases/legacy-v0.json");
  if (profile === "legacy-v0" && existsSync(legacyFile)) {
    const release = JSON.parse(readFileSync(legacyFile, "utf8")) as { blockIds: string[] };
    const ids = new Set(release.blockIds);
    library.blocks = library.blocks.filter(block => ids.has(block.id)).map(block => ({
      ...block,
      meta: undefined,
      metadataSource: "legacy-readme" as const,
      previewEvidence: { status: "unavailable" as const },
    }));
  }
  const releaseIdentity = createHash("sha256").update(`${profile}\n${libraryContentHash(library)}`).digest("hex");
  return { profile, releaseIdentity, library };
}
