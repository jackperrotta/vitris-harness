import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fingerprint, sourceHash } from "./artifacts.ts";

export type RenderBinding = { id: string; path: string; viewport?: number; route?: string; state?: string; subjectHash?: string; receiptPath?: string; current: boolean; reason?: string };
type Check = { path?: string; width?: number; candidate?: string; screenshot?: string; screenshotHash?: string; failures?: string[] };

/** Bind every declared visual check to both its screenshot bytes and the source revision it depicts. */
export function creativeRenderBindings(root: string, runId: string, role: "study-review" | "decision" | "final-review" | "revision", child?: string, candidateId?: string, expectedRoutes: string[] = []): RenderBinding[] {
  const runRoot = join(root, "agent/creative-runs", runId);
  const study = role === "study-review";
  const scope = study ? runRoot : child;
  const receiptPath = study ? join(runRoot, "render.json") : scope ? join(scope, "agent/reviews", role === "final-review" ? "browser.json" : "representative-browser.json") : "";
  if (!scope || !receiptPath || !existsSync(receiptPath)) return [{ id: "render:missing-receipt", path: "", current: false, receiptPath: receiptPath ? relative(root, receiptPath).replaceAll("\\", "/") : undefined, reason: "render receipt absent" }];
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as { sourceHash?: string; subjectHash?: string; checks?: Check[] };
  const expectedHash = study ? fingerprint(root, [`agent/creative-runs/${runId}/studies`]) : sourceHash(scope);
  const receiptHash = study ? receipt.subjectHash : receipt.sourceHash;
  const checks = receipt.checks || [];
  const bindings: RenderBinding[] = checks.map(check => {
    const screenshot = check.screenshot || "";
    const absolute = join(scope, screenshot);
    const id = `render:${relative(root, absolute).replaceAll("\\", "/")}`;
    const bytesCurrent = !!screenshot && existsSync(absolute) && check.screenshotHash === fingerprint(scope, [screenshot]);
    const subjectCurrent = receiptHash === expectedHash;
    return { id, path: relative(root, absolute).replaceAll("\\", "/"), viewport: check.width, route: check.path, state: "initial", subjectHash: receiptHash, receiptPath: relative(root, receiptPath).replaceAll("\\", "/"), current: bytesCurrent && subjectCurrent && !(check.failures || []).length, reason: !subjectCurrent ? "source changed since render" : !bytesCurrent ? "screenshot missing or changed" : (check.failures || []).length ? "render check failed" : undefined } satisfies RenderBinding;
  });
  if (!bindings.length) bindings.push({ id: "render:no-checks", path: "", current: false, receiptPath: relative(root, receiptPath).replaceAll("\\", "/"), reason: "receipt contains no render checks" });
  if (study) {
    const studiesDir = join(runRoot, "studies");
    for (const filename of existsSync(studiesDir) ? readdirSync(studiesDir).filter(name => name.endsWith(".html")) : []) for (const viewport of [375, 1080]) {
      const path = `onboarding/studies/${filename}`;
      if (!checks.some(check => check.path === path && check.width === viewport)) bindings.push({ id: `render:missing:${filename}:${viewport}`, path: "", route: path, viewport, current: false, receiptPath: relative(root, receiptPath).replaceAll("\\", "/"), reason: "required study and viewport absent from receipt" });
    }
  }
  if (!study) for (const route of expectedRoutes) for (const viewport of [375, 1080]) {
    if (!bindings.some(binding => binding.route === route && binding.viewport === viewport)) bindings.push({ id: `render:missing:${route}:${viewport}`, path: "", route, viewport, current: false, receiptPath: relative(root, receiptPath).replaceAll("\\", "/"), reason: "required route and viewport absent from receipt" });
  }
  if (study && candidateId && !bindings.some(binding => binding.path.includes(candidateId))) bindings.push({ id: `render:missing:${candidateId}`, path: "", current: false, receiptPath: relative(root, receiptPath).replaceAll("\\", "/"), reason: "candidate has no render" });
  return bindings;
}
