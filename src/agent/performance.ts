import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { lighthouseBrowser, closeLighthouseBrowser } from './lighthouse-browser.ts';
import { checkApiContracts } from './api-contracts.ts';
import { files, fingerprint, json, save, sourceHash, within } from './artifacts.ts';

export const PERFORMANCE_POLICY = 'vitris-mobile-2026-10-15';
export type PerformancePolicy = { enabled: boolean; runs: number; routes: string[]; score: number; lcp: number; tbt: number; cls: number; transfer: number };
export type PerformanceSample = { score: number; lcp: number; tbt: number; cls: number; transfer: number };
export type PerformanceReport = {
  version: 1; policy: string; configHash: string; sourceHash: string; distHash: string; origin: string; scope: 'local' | 'remote';
  routes: { path: string; finalUrl?: string; samples: PerformanceSample[]; median?: PerformanceSample; failures: string[]; reports: { path: string; sha256: string }[] }[];
  failures: string[];
};
function sampleFromLighthouse(lhr: any): PerformanceSample {
  if (!lhr || lhr.runtimeError || lhr.configSettings?.formFactor !== 'mobile' || lhr.categories?.performance?.score == null) throw new Error(lhr?.runtimeError?.message || 'No valid mobile Lighthouse result');
  const metric = (id: string) => lhr.audits?.[id]?.numericValue as number;
  return { score: lhr.categories.performance.score * 100, lcp: metric('largest-contentful-paint'), tbt: metric('total-blocking-time'), cls: metric('cumulative-layout-shift'), transfer: metric('total-byte-weight') };
}
export function performancePolicy(root: string): PerformancePolicy {
  const launch = existsSync(join(root, 'launch.json')) ? json<{ performance?: Record<string, unknown> }>(join(root, 'launch.json')) : {};
  const p = launch.performance || {};
  const policy = { enabled: p.enabled === true, runs: Number(p.runs ?? 3), routes: (p.routes ?? []) as string[], score: Number(p.score ?? 95), lcp: Number(p.lcp ?? 2500), tbt: Number(p.tbt ?? 200), cls: Number(p.cls ?? 0.1), transfer: Number(p.transfer ?? 1.5 * 1024 * 1024) };
  if (!Number.isInteger(policy.runs) || policy.runs < 3 || policy.runs > 5 || !Array.isArray(policy.routes) || policy.routes.some(r => typeof r !== 'string' || !r.startsWith('/') || r.startsWith('//') || /[?#\\]/.test(r))) throw new Error('performance requires 3–5 runs and local route paths');
  for (const key of ['score', 'lcp', 'tbt', 'cls', 'transfer'] as const) if (!Number.isFinite(policy[key]) || policy[key] <= 0 || (key === 'score' && policy[key] > 100)) throw new Error(`Invalid performance.${key}`);
  return policy;
}
export const performanceConfigHash = (root: string) => fingerprint(root, ['launch.json', 'onboarding/storyboard.json']);
export function performanceRoutes(root: string, policy = performancePolicy(root)): string[] {
  const dist = join(root, 'dist');
  const routes = files(dist).filter(f => f.endsWith('index.html') && !f.includes('cookie-compliance')).map(file => {
    const path = '/' + relative(dist, file).replaceAll('\\', '/').replace(/index\.html$/, '');
    const html = readFileSync(file, 'utf8');
    let weight = Buffer.byteLength(html);
    for (const url of new Set([...html.matchAll(/\b(?:src|poster)=["']([^"']+)["']/g)].map(m => m[1]!))) {
      if (/^(?:[a-z]+:|\/\/|#)/i.test(url)) continue;
      try { const asset = within(dist, url.startsWith('/') ? url.slice(1) : join(relative(dist, dirname(file)), url)); if (existsSync(asset)) weight += readFileSync(asset).length; } catch { /* Browser verification reports bad references. */ }
    }
    return { path, weight };
  });
  const normalized = (r: string) => r === '/' ? '/' : r.replace(/\/$/, '') + '/';
  const interiors = routes.filter(r => r.path !== '/').sort((a, b) => b.weight - a.weight || a.path.localeCompare(b.path));
  const story = existsSync(join(root, 'onboarding/storyboard.json')) ? json<{ pages?: { path: string; representative?: boolean }[] }>(join(root, 'onboarding/storyboard.json')) : {};
  const representative = story.pages?.find(p => p.path !== '/' && p.representative)?.path;
  const selected = ['/', ...(representative ? [representative] : interiors[1] ? [interiors[1].path] : []), ...(interiors[0] ? [interiors[0].path] : []), ...policy.routes].map(normalized);
  for (const path of selected) if (!routes.some(r => r.path === path)) throw new Error(`Performance route is not built: ${path}`);
  return [...new Set(selected)];
}
export function summarizePerformance(samples: PerformanceSample[], policy: PerformancePolicy): { median: PerformanceSample; failures: string[] } {
  if (samples.length !== policy.runs) throw new Error(`Expected ${policy.runs} valid mobile samples`);
  const median = {} as PerformanceSample;
  for (const key of ['score', 'lcp', 'tbt', 'cls', 'transfer'] as const) {
    if (samples.some(s => !Number.isFinite(s[key]) || s[key] < 0)) throw new Error(`Missing or invalid Lighthouse metric: ${key}`);
    const values = samples.map(s => s[key]).sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    median[key] = values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
  }
  const failures = (['score', 'lcp', 'tbt', 'cls', 'transfer'] as const).filter(key => key === 'score' ? median[key] < policy[key] : median[key] > policy[key]).map(key => `${key} median ${median[key].toFixed(3)} ${key === 'score' ? '<' : '>'} budget ${policy[key]}`);
  return { median, failures };
}

/** Fresh Chrome profiles per sample, default Lighthouse mobile simulation, normal motion. */
export async function measurePerformance(root: string, origin: string, options: { remote?: boolean; log?: (line: string) => void } = {}): Promise<PerformanceReport> {
  const policy = performancePolicy(root);
  const report: PerformanceReport = { version: 1, policy: PERFORMANCE_POLICY, configHash: performanceConfigHash(root), sourceHash: sourceHash(root), distHash: fingerprint(root, ['dist']), origin, scope: options.remote ? 'remote' : 'local', routes: [], failures: [] };
  try {
    if (options.remote) {
      const apiFailures = await checkApiContracts(root, origin);
      if (apiFailures.length) throw new Error(apiFailures.join('\n'));
      const expected = json<{ sourceHash: string; compilerHash: string }>(join(root, 'dist/build-evidence.json'));
      const response = await fetch(new URL('/build-evidence.json', origin), { signal: AbortSignal.timeout(15000), cache: 'no-cache' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Hosted build evidence must return JSON from this deployment');
      const actual = await response.json() as typeof expected;
      if (actual.sourceHash !== expected.sourceHash || actual.compilerHash !== expected.compilerHash) throw new Error('Hosted build does not match the local verified source/compiler');
    }
    const { default: lighthouse } = await import('lighthouse');
    for (const path of performanceRoutes(root, policy)) {
      const route: PerformanceReport['routes'][number] = { path, samples: [], failures: [], reports: [] };
      report.routes.push(route);
      for (let run = 1; run <= policy.runs; run++) {
        let chrome: Awaited<ReturnType<typeof lighthouseBrowser>> | undefined;
        try {
          chrome = await lighthouseBrowser();
          const result = await lighthouse(new URL(path, origin).href, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance'], maxWaitForLoad: 30000 });
          const lhr = result?.lhr;
          const sample = sampleFromLighthouse(lhr);
          if (!lhr) throw new Error('Missing Lighthouse result');
          if (lhr.audits['http-status-code']?.score === 0) throw new Error('Lighthouse reached a non-200 page');
          if ((new URL(lhr.finalDisplayedUrl).pathname.replace(/\/$/, '') || '/') !== (path.replace(/\/$/, '') || '/')) throw new Error('Lighthouse reached a different route');
          route.finalUrl = lhr.finalDisplayedUrl;
          route.samples.push(sample);
          const name = `agent/reviews/performance-runs/${report.distHash}/${options.remote ? 'remote' : 'local'}-${Buffer.from(path).toString('hex')}-${run}.json`;
          save(join(root, name), lhr);
          route.reports.push({ path: name, sha256: createHash('sha256').update(readFileSync(join(root, name))).digest('hex') });
          options.log?.(`performance: ${path} mobile ${run}/${policy.runs}: ${Math.round(route.samples.at(-1)!.score)}`);
        } catch (error) { route.failures.push(`Run ${run}: ${error instanceof Error ? error.message : String(error)}`); }
        finally { if (chrome) await closeLighthouseBrowser(chrome); }
      }
      try { const result = summarizePerformance(route.samples, policy); route.median = result.median; route.failures.push(...result.failures); }
      catch (error) { route.failures.push(String(error)); }
    }
  } catch (error) { report.failures.push(error instanceof Error ? error.message : String(error)); }
  report.failures.push(...report.routes.flatMap(r => r.failures.map(f => `${r.path}: ${f}`)));
  save(join(root, `agent/reviews/performance${options.remote ? '-remote' : ''}.json`), report);
  return report;
}

export function performanceEvidenceFailures(root: string): string[] {
  if (!performancePolicy(root).enabled) return [];
  const path = join(root, 'agent/reviews/performance.json');
  if (!existsSync(path)) return ['Mobile performance evidence is missing; run npm run verify:performance'];
  const report = json<PerformanceReport>(path), policy = performancePolicy(root);
  const failures = [...report.failures];
  if (report.policy !== PERFORMANCE_POLICY || report.scope !== 'local' || report.sourceHash !== sourceHash(root) || report.distHash !== fingerprint(root, ['dist']) || report.configHash !== performanceConfigHash(root)) failures.push('Mobile performance evidence is stale');
  for (const route of performanceRoutes(root, policy)) {
    const item = report.routes.find(r => r.path === route);
    if (!item || item.reports.length !== policy.runs) { failures.push(`Mobile performance evidence missing: ${route}`); continue; }
    const samples: PerformanceSample[] = [];
    for (const saved of item.reports) {
      const file = within(root, saved.path);
      if (!existsSync(file) || createHash('sha256').update(readFileSync(file)).digest('hex') !== saved.sha256) failures.push(`Lighthouse report changed: ${saved.path}`);
      else try { samples.push(sampleFromLighthouse(json(file))); } catch (error) { failures.push(String(error)); }
    }
    if (JSON.stringify(samples) !== JSON.stringify(item.samples)) failures.push(`Lighthouse summary differs from raw measurements: ${route}`);
    try { failures.push(...summarizePerformance(samples, policy).failures.map(f => `${route}: ${f}`)); } catch (error) { failures.push(String(error)); }
  }
  return failures;
}
