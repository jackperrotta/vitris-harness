import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const BUNDLED_KERNEL_SCRIPTS: Record<string, string> = {
  "scripts/eval-site.ts": "vitris-eval.js",
  "scripts/harvest.ts": "vitris-harvest.js",
  "scripts/ralph.ts": "vitris-go.js",
  "scripts/cursor-hook.ts": "vitris-cursor-hook.js",
  "scripts/preview.ts": "vitris-preview.js",
  "scripts/verify-browser.ts": "vitris-verify-browser.js",
  "src/build/cli.ts": "vitris-build.js",
};

export function kernelScriptCommand(kernel: string, scriptRel: string, bundledName = BUNDLED_KERNEL_SCRIPTS[scriptRel]): string {
  const bundled = bundledName ? join(kernel, "bin", bundledName) : "";
  if (bundled && existsSync(bundled)) return `node ${JSON.stringify(bundled)}`;
  return `node --experimental-strip-types ${JSON.stringify(join(kernel, scriptRel))}`;
}

export function preferBundledToolArgs(kernel: string, args: string[]): string[] {
  const strip = args.indexOf("--experimental-strip-types");
  if (strip < 0 || !args[strip + 1]) return args;
  const script = args[strip + 1]!;
  for (const [rel, bundledName] of Object.entries(BUNDLED_KERNEL_SCRIPTS)) {
    const source = join(kernel, rel);
    const bundled = join(kernel, "bin", bundledName);
    if (resolve(script) === resolve(source) && existsSync(bundled)) {
      const next = args.slice();
      next.splice(strip, 2, bundled);
      return next;
    }
  }
  return args;
}
