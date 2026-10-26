import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function findHarnessRoot(startDir?: string): string {
  if ((process.env.VITRIS_HARNESS || process.env.VITRIS_KERNEL) && existsSync((process.env.VITRIS_HARNESS || process.env.VITRIS_KERNEL)!)) {
    return resolve((process.env.VITRIS_HARNESS || process.env.VITRIS_KERNEL)!);
  }

  let curr = resolve(startDir || dirname(fileURLToPath(import.meta.url)));
  for (let i = 0; i < 6; i++) {
    const candidateTmpl = join(curr, "templates/site");
    const candidatePkg = join(curr, "package.json");
    if (existsSync(candidateTmpl) && existsSync(candidatePkg)) {
      try {
        const pkg = JSON.parse(readFileSync(candidatePkg, "utf8"));
        if (["@tryvitris/website-harness", "@tryvitris/harness", "@vitris/harness", "@vitris/kernel"].includes(pkg.name)) {
          return curr;
        }
      } catch {}
    }
    const parent = dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  for (const rel of [".", "..", "../.."]) {
    const target = resolve(moduleDir, rel);
    if (existsSync(join(target, "templates/site"))) {
      return target;
    }
  }

  throw new Error("Could not locate @tryvitris/website-harness root directory containing templates/site");
}
/** @deprecated Use findHarnessRoot. */
export const findKernelRoot = findHarnessRoot;
