import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { json } from './artifacts.ts';

/** Explicit read-only contracts prevent HTTP-200 document fallbacks from passing as working APIs. */
export async function checkApiContracts(root: string, origin: string): Promise<string[]> {
  const launch = existsSync(join(root, 'launch.json')) ? json<{ apiChecks?: { url: string }[] }>(join(root, 'launch.json')) : {};
  const failures: string[] = [];
  if (launch.apiChecks !== undefined && !Array.isArray(launch.apiChecks)) return ['launch.apiChecks must be an array'];
  for (const check of launch.apiChecks || []) {
    try {
      if (typeof check.url !== 'string') throw new Error('API contract needs a URL');
      const url = new URL(check.url, origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('API contract must use an HTTP(S) URL without credentials');
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-cache', redirect: 'error' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!/\bapplication\/(?:[a-z0-9.-]+\+)?json\b/i.test(response.headers.get('content-type') || '')) throw new Error(`Expected API JSON, received ${response.headers.get('content-type') || 'no Content-Type'}`);
      await response.json();
    } catch (error) { failures.push(`${check.url || '(invalid API check)'}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return failures;
}
