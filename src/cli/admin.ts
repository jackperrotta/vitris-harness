import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { parseManifest } from '@tryvitris/website-admin-contracts';
import { readConnection } from '../admin/connection.ts';
import { EXIT_CODES, type CommandResult } from './types.ts';

export const ADMIN_VERSION = '0.1.0-alpha.2';
export type AdminOptions = { site?: string; dir?: string; domain?: string; website?: string; tenant?: string; backendOrigin?: string; plan?: boolean; apply?: boolean; leadWrite?: boolean; dryRun?: boolean; grants?: string; out?: string };

/** Merge the operator's COMPLETE map, never replace unrelated installations. */
export function mergeAdminGrant(existing: unknown, addition: unknown) {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!object(existing) || !object(addition) || Object.keys(addition).length !== 1) throw Error('Expected complete grant map and one installation grant');
  for (const [id, raw] of Object.entries({ ...existing, ...addition })) {
    const g = raw as Record<string, unknown>;
    if (!/^[a-z][a-z0-9-]{0,50}$/.test(id) || !object(g) || typeof g.tenantId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(g.tenantId) || typeof g.tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(g.tokenHash) || typeof g.siteOrigin !== 'string' || new URL(g.siteOrigin).origin !== g.siteOrigin || !g.siteOrigin.startsWith('https://') || !Array.isArray(g.scopes) || g.scopes.some(s => !['leads:read', 'analytics:read', 'leads:write'].includes(s)) || Object.keys(g).some(k => !['tenantId', 'siteOrigin', 'tokenHash', 'scopes'].includes(k))) throw Error('Invalid hashed grant; raw credentials are forbidden');
  }
  for (const id of Object.keys(addition)) if (Object.hasOwn(existing, id) && JSON.stringify(existing[id]) !== JSON.stringify(addition[id])) throw Error('Grant already exists with different authority; rotate explicitly');
  return { ...existing, ...addition };
}

export async function adminCommand(command: string, options: AdminOptions): Promise<CommandResult> {
  try {
    const site = resolve(options.site || '.');
    if (command === 'grant') {
      if (!options.dir || !options.grants || !options.out || options.dryRun) throw Error('admin grant requires --dir, --grants COMPLETE_MAP_FILE and --out NEW_IGNORED_FILE');
      const addition = JSON.parse(readFileSync(resolve(options.dir, '.vitris/backend-grant.json'), 'utf8'));
      const manifest = parseManifest(JSON.parse(readFileSync(resolve(options.dir, 'admin.config.json'), 'utf8')));
      const grant = addition[manifest.installationId];
      if (!grant || grant.tenantId !== manifest.backend?.tenantId || grant.siteOrigin !== manifest.site.origin) throw Error('Grant and installation identity differ');
      const merged = mergeAdminGrant(JSON.parse(readFileSync(resolve(options.grants), 'utf8')), addition);
      writeFileSync(resolve(options.out), JSON.stringify(merged, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      return { ok: true, exitCode: 0, summary: 'Merged hashed grants into the new local file. No backend secret changed; review and install explicitly through secret stdin.' };
    }
    if (command === 'setup') {
      if (!options.dir || !options.domain || !options.tenant || (!!options.plan === !!options.apply)) throw Error('admin setup requires --dir, --domain, --tenant and exactly one of --plan or --apply');
      if (options.dryRun) throw Error('Use --plan for local setup planning; --dry-run does not write a setup plan');
      const args = ['setup', '--site', site, '--dir', resolve(options.dir), '--domain', options.domain, '--tenant', options.tenant, options.apply ? '--apply' : '--plan'];
      if (options.website) args.push('--website', options.website);
      if (options.backendOrigin) args.push('--backend-origin', options.backendOrigin);
      if (options.leadWrite) args.push('--lead-write');
      // Reuse the pinned published installer's plan/apply and retry protocol.
      const entry = createRequire(import.meta.url).resolve('@tryvitris/website-admin-harness/cli');
      const output = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
      if (output.status !== 0) throw Error(output.error?.message || output.stderr.trim() || 'Admin setup failed');
      return { ok: true, exitCode: 0, summary: output.stdout.trim() };
    }
    if (!['status', 'verify'].includes(command)) throw Error('Use vitris admin setup|status|verify|grant');
    const launch = JSON.parse(readFileSync(resolve(site, 'launch.json'), 'utf8'));
    if (command === 'status') return { ok: true, exitCode: 0, summary: launch.admin ? 'Local admin metadata exists. Backend, authentication and deployment are unverified; run admin verify with --dir.' : 'No admin connection. Read docs/ADMIN.md; scaffolding alone does not enable collection.', data: { connection: launch.admin || null, verified: false } };
    if (!options.dir) throw Error('admin verify requires --dir ADMIN_DIRECTORY');
    const manifest = parseManifest(JSON.parse(readFileSync(resolve(options.dir, 'admin.config.json'), 'utf8')));
    if (!launch.admin || manifest.installationId !== launch.admin.installationId || manifest.site.id !== launch.admin.siteId || manifest.adminOrigin !== launch.admin.url || manifest.site.origin !== launch.admin.siteOrigin || manifest.backend?.tenantId !== launch.admin.tenantId) throw Error('Website and admin installation identities differ');
    const token = process.env.VITRIS_ADMIN_API_TOKEN || '';
    const status = await readConnection(manifest, token, 'status');
    if (!['leads:read', 'analytics:read'].every(scope => status.scopes.includes(scope))) throw Error('Default read scopes are missing');
    // Validate records but never print customer PII or save credentials.
    const leads = await readConnection(manifest, token, 'leads');
    const tests = await readConnection(manifest, token, 'leads', true);
    const analytics = await readConnection(manifest, token, 'analytics');
    return { ok: true, exitCode: 0, summary: 'Admin v1 data connection verified. Authentication, collection and deployment require separate acceptance checks.', data: { verified: true, productionLeads: leads.rows.length, testSubmissions: tests.rows.length, analyticsDays: analytics.rows.length, scopes: status.scopes } };
  } catch (error) { return { ok: false, exitCode: EXIT_CODES.PRECONDITION_FAILED, error: error instanceof Error ? error.message : String(error) }; }
}
