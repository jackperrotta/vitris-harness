import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { previewServer } from "../build/serve.ts";
import { files, fingerprint, save, sha256, within, STUDY_CAPTURE_VIEWPORTS, STUDY_CAPTURE_HEIGHT } from "./artifacts.ts";
import { explainBrowserLaunchFailure, loadPlaywrightChromium } from "./playwright-runtime.ts";

async function getChromium() {
  try {
    return await loadPlaywrightChromium();
  } catch (error) {
    throw new Error(explainBrowserLaunchFailure(error));
  }
}

export type StudySpec = { candidate: string; path: string };
export type StudyRenderCheck = {
  candidate: string;
  path: string;
  width: number;
  screenshot: string;
  screenshotHash: string;
  failures: string[];
};

function normalizedStudyPath(path: string): string {
  return path.replaceAll("\\", "/");
}

/** Unique screenshot stem from a confined study HTML path (onboarding/studies/…). */
export function studyScreenshotId(path: string): string {
  const normalized = normalizedStudyPath(path);
  if (!normalized.startsWith("onboarding/studies/") || !normalized.endsWith(".html")) {
    throw new Error("Invalid study source/candidate");
  }
  const stem = normalized.slice("onboarding/studies/".length, -".html".length).replace(/[^a-zA-Z0-9_-]+/g, "-");
  if (!stem || !/^[a-zA-Z0-9_-]+$/.test(stem)) throw new Error("Invalid study source/candidate");
  return stem;
}

/** Readable stems; colliding sanitized names get a short hash of the exact normalized relative path. */
export function studyScreenshotIds(paths: string[]): Map<string, string> {
  const unique = [...new Set(paths.map(normalizedStudyPath))];
  const groups = new Map<string, string[]>();
  for (const path of unique) {
    const stem = studyScreenshotId(path);
    const group = groups.get(stem) || [];
    group.push(path);
    groups.set(stem, group);
  }
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const [stem, group] of groups) {
    if (group.length !== 1) continue;
    used.add(stem);
    ids.set(group[0]!, stem);
  }
  for (const [stem, group] of groups) {
    if (group.length === 1) continue;
    for (const path of group) {
      const digest = sha256(path);
      let width = 8;
      let id = `${stem}-${digest.slice(0, width)}`;
      while (used.has(id)) {
        width += 4;
        if (width > digest.length) throw new Error("Invalid study source/candidate");
        id = `${stem}-${digest.slice(0, width)}`;
      }
      used.add(id);
      ids.set(path, id);
    }
  }
  return ids;
}

export async function renderStudySources(opts: {
  root: string;
  outputRoot?: string;
  studies: StudySpec[];
  copyPaths?: string[];
  screenshotDir?: string;
  reportPath?: string;
  subjectHash: string;
}): Promise<{ checks: StudyRenderCheck[] }> {
  const root = opts.root;
  const outputRoot = opts.outputRoot || root;
  const screenshotDir = opts.screenshotDir || "onboarding/study-renders";
  const reportPath = opts.reportPath || "agent/reviews/direction-render.json";
  const copyPaths = opts.copyPaths || ["onboarding/studies", "media", "theme"];
  const stage = within(root, `agent/study-render-stage-${Date.now()}-${process.pid}`);
  mkdirSync(stage, { recursive: true });
  for (const path of copyPaths) {
    if (existsSync(within(root, path))) {
      files(within(root, path));
      cpSync(within(root, path), join(stage, path), { recursive: true });
    }
  }
  const server = previewServer(stage);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let browser;
  const checks: StudyRenderCheck[] = [];
  const screenshotIds = studyScreenshotIds(opts.studies.map(study => study.path));
  try {
    const chromium = await getChromium();
    browser = await chromium.launch({ headless: true });
    for (const study of opts.studies) {
      for (const width of STUDY_CAPTURE_VIEWPORTS) {
        const source = normalizedStudyPath(study.path);
        if (!/^[a-zA-Z0-9_-]+$/.test(study.candidate) || !source.startsWith("onboarding/studies/") || !source.endsWith(".html")) {
          throw new Error("Invalid study source/candidate");
        }
        within(stage, source);
        const id = screenshotIds.get(source);
        if (!id) throw new Error("Invalid study source/candidate");
        const page = await browser.newPage({ viewport: { width, height: STUDY_CAPTURE_HEIGHT }, reducedMotion: "reduce" });
        const failures: string[] = [];
        page.on("pageerror", (error: any) => failures.push(error.message));
        page.on("response", (response: any) => {
          if (response.status() >= 400 && response.url().startsWith(origin)) failures.push(`HTTP ${response.status()}: ${response.url()}`);
        });
        await page.goto(`${origin}/${source}`, { waitUntil: "domcontentloaded" });
        await page.evaluate(`(async () => { await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,5000))]); await Promise.race([Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode().catch(()=>{});})),new Promise(r=>setTimeout(r,5000))]); })()`);
        failures.push(...await page.evaluate(`(() => { const errors=[]; if(document.documentElement.scrollWidth>innerWidth+2)errors.push('Horizontal overflow'); for(const i of document.images)if(i.getClientRects().length&&(!i.complete||!i.naturalWidth))errors.push('Broken image: '+i.getAttribute('src')); return errors; })()`) as string[]);
        const screenshot = `${screenshotDir}/${id}-${width}.png`;
        mkdirSync(within(outputRoot, screenshotDir), { recursive: true });
        await page.screenshot({ path: within(outputRoot, screenshot), fullPage: true });
        checks.push({ candidate: study.candidate, path: source, width, screenshot, screenshotHash: fingerprint(outputRoot, [screenshot]), failures });
        await page.close();
      }
    }
    save(within(outputRoot, reportPath), { version: 2, subjectHash: opts.subjectHash, checks });
    return { checks };
  } finally {
    await browser?.close();
    await new Promise<void>(r => server.close(() => r()));
    within(root, stage);
    rmSync(stage, { recursive: true, force: true });
  }
}
