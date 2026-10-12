// These names exist only inside Playwright-serialized browser callbacks; keep the Worker TS library unchanged.
declare const window: any, document: any;
declare const innerHeight: number, scrollY: number;
declare function scrollTo(x: number, y: number): void;
declare function getComputedStyle(element: any): any;
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { fingerprint } from './artifacts.ts';

export const MOTION_SCENARIO = { version: 2, states: ['before', 'during', 'after'], triggerViewport: .78, duringMs: 120, settleMs: 1550, progress: [0, .5, 1], modes: ['normal', 'reduce'], scrolling: 'ordinary document flow, target checkpoints, forward and reverse', expressive:'canonical text, visual counter, authored phrase opacity, SVG stroke' };
export const MOTION_SCENARIO_HASH = createHash('sha256').update(JSON.stringify(MOTION_SCENARIO)).digest('hex');
export type TemporalMotionEvidence = { path: string; width: number; motion: 'normal' | 'reduce'; scenarioHash: string; engineAssetHash: string; targets: { id: string; effect: string; samples: { state: string; opacity: number; transform: string; progress: number | null; canonical?:string; visual?:string|null; stroke?:string; screenshot: string; screenshotHash: string }[] }[]; failures: string[] };

/** Before static sweep/focus checks consume entrances, capture the actual sequence. */
export async function observeMotion(page: Page, root: string, route: string, width: number, mode: 'normal' | 'reduce', directory: string): Promise<TemporalMotionEvidence> {
  const scripts = page.locator('script[src*="/motion-"]');
  const asset = await scripts.count() ? await scripts.first().getAttribute('src') : null;
  const evidence: TemporalMotionEvidence = { path: route, width, motion: mode, scenarioHash: MOTION_SCENARIO_HASH, engineAssetHash: asset ? fingerprint(root, [`dist/${asset.replace(/^\//, '')}`]) : '', targets: [], failures: [] };
  if (!asset) return evidence;
  await page.waitForTimeout(50);
  const targets = await page.locator('[data-motion-target],[data-reveal]').evaluateAll(es => es.map((e, i) => ({ id: e.id || `legacy-${i}`, effect: e.getAttribute('data-motion') || (e.hasAttribute('data-count-to')?'count':e.hasAttribute('data-reveal-stagger') ? 'stagger' : 'entrance'), index: i })));
  for (const [index, declared] of targets.entries()) {
    if (declared.id.startsWith('legacy-')) continue; // Stable IDs are supplied to current legacy output by compiler.
    if (await page.locator(`[id="${declared.id}"]`).count() !== 1) { evidence.failures.push(`Motion target not unique: ${declared.id}`); continue; }
    const target = page.locator(`[id="${declared.id}"]`);
    await page.evaluate(() => { scrollTo(0,0); (window as any).VitrisMotion?.init(); });
    await page.waitForTimeout(50);
    const samples: TemporalMotionEvidence['targets'][number]['samples'] = [];
    const capture = async (state: string) => {
      const value = await target.evaluate(e => ({ opacity: Math.min(...[e,...e.querySelectorAll('[data-motion-child],[data-reveal-child],[data-motion-word]')].map(n=>Number(getComputedStyle(n).opacity))), transform: getComputedStyle(e).transform, progress: (window as any).VitrisMotion?.inspect(e.id)?.progress ?? null,canonical:e.querySelector('[data-motion-visual]')?e.firstElementChild?.textContent||'':e.textContent||'',visual:e.querySelector('[data-motion-visual]')?.textContent??null,stroke:e.querySelector('[data-motion-path]')?getComputedStyle(e.querySelector('[data-motion-path]')).strokeDashoffset:'' }));
      const path = `${directory}/motion-${route.replace(/[^a-z0-9]/gi, '-')}-${width}-${mode}-${index}-${state}.png`;
      await page.screenshot({ path: join(root, path), animations: 'allow' });
      samples.push({ state, ...value, screenshot: path, screenshotHash: fingerprint(root, [path]) });
    };
    await capture('before');
    const top = await target.evaluate(e => e.getBoundingClientRect().top + scrollY);
    await page.evaluate(y => scrollTo(0, Math.max(0, y - innerHeight * .78)), top);
    await page.waitForTimeout(MOTION_SCENARIO.duringMs);
    await capture('during');
    await page.waitForTimeout(MOTION_SCENARIO.settleMs);
    await capture('after');
    if (['entrance', 'stagger','text','sequence'].includes(declared.effect)) {
      const unreadable = await target.evaluate(e => [e, ...e.querySelectorAll('[data-motion-child],[data-reveal-child],[data-motion-word]')].some(n => Number(getComputedStyle(n).opacity) < .99 || getComputedStyle(n).visibility === 'hidden'));
      if (unreadable) evidence.failures.push(`Motion content not readable after settling: ${declared.id}`);
    }
    if (mode === 'reduce' && samples.some(s => s.opacity < .99)) evidence.failures.push(`Reduced motion hid content: ${declared.id}`);
    const runtimeState = await target.evaluate(e => (window as any).VitrisMotion?.inspect(e.id));
    if (!runtimeState) evidence.failures.push(`Motion runtime did not initialize: ${declared.id}`);
    if (mode === 'normal' && !runtimeState?.static && ['entrance','stagger','text','sequence'].includes(declared.effect) && samples.every(s=>s.opacity>=.99)) evidence.failures.push(`Declared entrance did not animate in the temporal scenario: ${declared.id}`);
    if(declared.effect==='count'){
      if(samples.some(s=>s.canonical!==samples[0]!.canonical)||samples.at(-1)!.visual!==null)evidence.failures.push(`Count canonical/final text changed: ${declared.id}`);
      if(mode==='normal'&&!runtimeState?.static&&!samples.some(s=>s.visual!==null&&s.visual!==s.canonical))evidence.failures.push(`Count never changed its visual value: ${declared.id}`);
      if(mode==='reduce'&&samples.some(s=>s.visual!==null))evidence.failures.push(`Reduced count animated: ${declared.id}`);
    }
    if(declared.effect==='draw'&&mode==='normal'&&!runtimeState?.static&&new Set(samples.map(s=>s.stroke)).size<2)evidence.failures.push(`Decorative path did not draw: ${declared.id}`);
    if (['progress', 'drift'].includes(declared.effect) && mode === 'normal' && !runtimeState?.static) {
      const states: number[] = [];
      for (const progress of MOTION_SCENARIO.progress) {
        const geometry = await target.evaluate(e => { const t = document.getElementById(e.getAttribute('data-motion-trigger') || '')!; return { top: t.getBoundingClientRect().top + scrollY, height: t.getBoundingClientRect().height, start: Number(e.getAttribute('data-motion-range-start') || 0), end: Number(e.getAttribute('data-motion-range-end') || 1) }; });
        const y = geometry.top - 900 + (900 + geometry.height) * (geometry.start + progress * (geometry.end - geometry.start));
        const clamped = await page.evaluate(y => { const max = document.documentElement.scrollHeight - innerHeight; scrollTo(0, y); return y < 0 || y > max; }, y);
        await page.waitForTimeout(100);
        await capture(`progress-${progress}`);
        const actual = samples.at(-1)!.progress;
        if (actual !== null) states.push(actual);
        else evidence.failures.push(`Progress target did not provide current state: ${declared.id}`);
        if (!clamped && actual !== null && Math.abs(actual - progress) > .04) evidence.failures.push(`Progress checkpoint mismatch ${declared.id}: expected ${progress}, saw ${actual}`);
      }
      if (states.length && states[0]! > states.at(-1)! + .01) evidence.failures.push(`Progress reversed unexpectedly: ${declared.id}`);
      if (states.length>1 && Math.max(...states)-Math.min(...states)>.1 && new Set(samples.filter(s=>s.state.startsWith('progress-')).map(s=>s.transform)).size<2) evidence.failures.push(`Linked effect stayed static despite changing progress: ${declared.id}`);
    }
    evidence.targets.push({ id: declared.id, effect: declared.effect, samples });
  }
  await page.evaluate(() => scrollTo(0, 0));
  return evidence;
}

/** Pure evidence checks used by current-source browser acceptance. */
export function temporalMotionFailures(root: string, evidence: TemporalMotionEvidence, expectedAssetHash: string): string[] {
  const failures = [...evidence.failures];
  if (evidence.scenarioHash !== MOTION_SCENARIO_HASH || evidence.engineAssetHash !== expectedAssetHash) failures.push('Temporal motion evidence uses stale scenarios or engine bytes');
  for (const target of evidence.targets) for (const sample of target.samples) {
    try {
      const bytes = readFileSync(join(root, sample.screenshot));
      if (![137, 80, 78, 71, 13, 10, 26, 10].every((value,i)=>bytes[i]===value) || fingerprint(root, [sample.screenshot]) !== sample.screenshotHash) failures.push(`Motion capture corrupt or changed: ${sample.screenshot}`);
    } catch { failures.push(`Motion capture missing: ${sample.screenshot}`); }
  }
  return failures;
}
