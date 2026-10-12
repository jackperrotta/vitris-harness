import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** Launch the actual JS entry point: .cmd cannot be spawned without a shell on Windows. */
export function wranglerCommand(siteRoot: string, args: string[]): { command: string; args: string[] } {
  const require = createRequire(join(siteRoot, "package.json"));
  let entry: string;
  try { entry = join(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js"); }
  catch { entry = join(dirname(createRequire(import.meta.url).resolve("wrangler/package.json")), "bin/wrangler.js"); }
  return { command: process.execPath, args: [entry, ...args] };
}
