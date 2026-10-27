import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const COMPOSITION_LESSON_RELEASE = "2026-09-28.1";

export type DesignAuthoringPolicy =
  | { mode: "theme-v1"; lessonRelease: null; hash: string }
  | { mode: "composition-v1"; lessonRelease: typeof COMPOSITION_LESSON_RELEASE; hash: string };

/** Site-owned policy. The default uses the selected theme with site-owned components. */
export function resolveDesignAuthoring(root: string): DesignAuthoringPolicy {
  const path = join(root, "launch.json");
  const launch = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown> : {};
  const raw = launch.designAuthoring;
  if (raw === undefined) return policy("theme-v1", null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("launch.json designAuthoring must be an object");
  const config = raw as Record<string, unknown>;
  // Existing site-owned launch files are not rewritten during a kit upgrade.
  if ((config.mode === "theme-v1" || config.mode === "blocks-v0") && (config.lessonRelease === undefined || config.lessonRelease === null)) return policy("theme-v1", null);
  if (config.mode === "composition-v1" && config.lessonRelease === COMPOSITION_LESSON_RELEASE) return policy("composition-v1", COMPOSITION_LESSON_RELEASE);
  throw new Error(`Unsupported launch.json designAuthoring mode/release: ${String(config.mode)}/${String(config.lessonRelease)}. Use theme-v1, or composition-v1 with ${COMPOSITION_LESSON_RELEASE}.`);
}

function policy<M extends "theme-v1" | "composition-v1">(mode: M, lessonRelease: M extends "theme-v1" ? null : typeof COMPOSITION_LESSON_RELEASE): DesignAuthoringPolicy {
  const hash = createHash("sha256").update(JSON.stringify({ mode, lessonRelease })).digest("hex");
  return { mode, lessonRelease, hash } as DesignAuthoringPolicy;
}
