#!/usr/bin/env node
import { migrateSite } from '../src/cli/site-migrate.ts';
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1]; };
if (process.argv.includes('--help')) {
  console.log('Usage: vitris-migrate-site --site DIR [--harness SPEC] [--apply]\nDefaults to a read-only plan. --apply backs up configuration before migrating.');
} else {
  try { console.log(JSON.stringify(migrateSite({ site: arg('--site') || '.', harnessSpec: arg('--harness'), apply: process.argv.includes('--apply') }), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
