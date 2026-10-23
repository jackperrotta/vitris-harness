#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { buildVerified } from '../src/build/verified.ts';
import { previewServer } from '../src/build/serve.ts';
import { measurePerformance } from '../src/agent/performance.ts';
if (process.argv.includes('--help')) {
  console.log('vitris-verify-performance --site DIR [--origin DEPLOYED_URL]\nThree fresh-profile mobile Lighthouse runs on home, representative and heaviest routes; writes build-bound reports. --origin checks an already deployed build without rebuilding.');
} else {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
  const root = resolve(arg('--site') || '.'), origin = arg('--origin');
  if (origin && !/^https?:\/\//.test(origin)) throw new Error('--origin must be an HTTP(S) URL');
  if (!origin) await buildVerified(root);
  const server = origin ? undefined : previewServer(join(root, 'dist'), { compress: true });
  if (server) await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try {
    const report = await measurePerformance(root, origin || `http://127.0.0.1:${(server!.address() as { port: number }).port}`, { remote: Boolean(origin), log: console.log });
    if (report.failures.length) { console.error(report.failures.join('\n')); process.exitCode = 1; }
  } finally { if (server) await new Promise<void>(r => server.close(() => r())); }
}
