import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import type { AdminEnv } from '@tryvitris/website-admin-harness/worker';
import { parseManifest } from '@tryvitris/website-admin-contracts';
import { formsBackend } from './test/forms-backend.ts';
import { route } from './worker/router.ts';
import { digest } from './worker/forms.ts';
import { adminCommand, mergeAdminGrant } from './cli/admin.ts';
import { readConnection } from './admin/connection.ts';
import { createSite } from './cli/site-create.ts';

const requirePublished = createRequire(process.env.VITRIS_ADMIN_PACKAGE_ROOT ? join(resolve(process.env.VITRIS_ADMIN_PACKAGE_ROOT), 'package.json') : import.meta.url);
const adminEntry = requirePublished.resolve('@tryvitris/website-admin-harness/cli');
const packageRoot = dirname(dirname(adminEntry));
const root = resolve('artifacts/admin-integration'); mkdirSync(root, { recursive: true });
const scratch = () => mkdtempSync(join(root, 'acceptance-'));
const token = 'synthetic_admin_credential_12345678901234567890';
const siteOrigin = 'https://www.synthetic.example';
const backendOrigin = 'https://backend.synthetic.example';
const launch = { slug: 'synthetic', name: 'Synthetic Business', publicOrigin: siteOrigin, backendOrigin, forms: [{ id: 'existing', sitekey: 'preserved' }], other: { preserve: true } };
function siteAt(root: string) { const site = join(root, 'website'); mkdirSync(site); writeFileSync(join(site, 'launch.json'), JSON.stringify(launch)); mkdirSync(join(site, 'agent')); writeFileSync(join(site, 'agent/STATE.json'), '{"progress":"preserve"}'); return site; }
function setup(site: string, dir: string, flags: string[] = []) {
  return spawnSync(process.execPath, [adminEntry, 'setup', '--site', site, '--dir', dir, '--domain', 'admin.synthetic.example', '--website', siteOrigin, '--tenant', 'a', '--backend-origin', backendOrigin, ...flags], { encoding: 'utf8', env: { ...process.env, VITRIS_ADMIN_API_TOKEN: token }, windowsHide: true });
}

test('published installer: plan/apply, safe retries, conflicts, stale plans and preservation', async () => {
  assert.equal(JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version, '0.1.0-alpha.1');
  if (process.env.VITRIS_ADMIN_PACKAGE_ROOT) {
    const initializer = join(dirname(requirePublished.resolve('@tryvitris/create-website-admin-harness/package.json')), 'index.mjs');
    const destination = join(scratch(), 'initialized');
    const result = spawnSync(process.execPath, [initializer, '--dir', destination, '--slug', 'initialized', '--name', 'Synthetic initializer', '--domain', 'admin.initialized.example', '--website', 'https://initialized.example'], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(destination, 'package.json'), 'utf8')).dependencies['@tryvitris/website-admin-harness'], '0.1.0-alpha.1');
  }
  const root = scratch(), site = siteAt(root), dir = join(root, 'admin');
  const original = readFileSync(join(site, 'launch.json'), 'utf8');
  assert.notEqual(setup(site, dir, ['--apply']).status, 0);
  assert.equal(setup(site, dir, ['--plan']).status, 0); assert.equal(existsSync(dir), false);
  assert.equal(readFileSync(join(site, 'launch.json'), 'utf8'), original);
  assert.equal(setup(site, dir, ['--apply']).status, 0);
  const after = JSON.parse(readFileSync(join(site, 'launch.json'), 'utf8')); const { admin, ...rest } = after;
  assert.deepEqual(rest, launch); assert.equal(admin.tenantId, 'a');
  assert.equal(readFileSync(join(site, 'agent/STATE.json'), 'utf8'), '{"progress":"preserve"}');
  const manifest = parseManifest(JSON.parse(readFileSync(join(dir, 'admin.config.json'), 'utf8')));
  assert.equal(manifest.business.name, launch.name); assert.equal(manifest.adminOrigin, 'https://admin.synthetic.example');
  assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies['@tryvitris/website-admin-harness'], '0.1.0-alpha.1');
  const grant = JSON.parse(readFileSync(join(dir, '.vitris/backend-grant.json'), 'utf8'));
  assert.equal(grant.synthetic.tokenHash, await digest(token)); assert.deepEqual(grant.synthetic.scopes, ['leads:read', 'analytics:read']);
  assert.equal(setup(site, dir, ['--apply']).status, 0); assert.notEqual(setup(site, dir, ['--apply', '--lead-write']).status, 0);
  assert.notEqual(setup(site, join(root, 'another'), ['--apply']).status, 0);
  assert.notEqual(setup(site, join(site, 'nested'), ['--plan']).status, 0);
  const conflictRoot = scratch(), conflictSite = siteAt(conflictRoot);
  writeFileSync(join(conflictSite, 'launch.json'), JSON.stringify({ ...launch, admin: { installationId: 'unrelated' } }));
  assert.notEqual(setup(conflictSite, join(conflictRoot, 'admin'), ['--plan']).status, 0);
  for (const name of ['conflict', 'stale']) {
    const r = scratch(), s = siteAt(r), d = join(r, 'admin'); assert.equal(setup(s, d, ['--plan']).status, 0);
    if (name === 'conflict') { mkdirSync(d); writeFileSync(join(d, 'keep.txt'), 'existing work'); }
    else writeFileSync(join(s, 'launch.json'), JSON.stringify({ ...launch, changed: true }));
    assert.notEqual(setup(s, d, ['--apply']).status, 0);
    if (name === 'conflict') assert.equal(readFileSync(join(d, 'keep.txt'), 'utf8'), 'existing work');
  }
  // Simulate recovery after the initializer completed, before grant/launch commit.
  const r = scratch(), s = siteAt(r), d = join(r, 'admin'); assert.equal(setup(s, d, ['--plan']).status, 0);
  assert.equal(setup(s, d, ['--apply']).status, 0);
  const stateFile = join(s, 'artifacts/admin/setup-state.json'); const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  writeFileSync(stateFile, JSON.stringify({ ...state, stage: 'creating' })); writeFileSync(join(s, 'launch.json'), JSON.stringify(launch));
  assert.equal(setup(s, d, ['--apply']).status, 0);
  // Check all scaffolded text, including private grant: raw token is never saved.
  function scan(dir: string) { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) scan(p); else assert.equal(readFileSync(p).includes(Buffer.from(token)), false, p); } } scan(root);
});

test('harness CLI delegates setup and exposes opt-in without cloud side effects', async () => {
  const root = scratch(), site = siteAt(root), dir = join(root, 'admin');
  const opts = { site, dir, domain: 'admin.synthetic.example', website: siteOrigin, tenant: 'a', backendOrigin };
  assert.equal((await adminCommand('setup', { ...opts, plan: true, apply: true })).ok, false);
  assert.equal((await adminCommand('setup', { ...opts, plan: true, dryRun: true })).ok, false);
  assert.equal((await adminCommand('setup', { ...opts, plan: true })).ok, true);
  const previous = process.env.VITRIS_ADMIN_API_TOKEN; process.env.VITRIS_ADMIN_API_TOKEN = token;
  try { assert.equal((await adminCommand('setup', { ...opts, apply: true })).ok, true); } finally { if (previous === undefined) delete process.env.VITRIS_ADMIN_API_TOKEN; else process.env.VITRIS_ADMIN_API_TOKEN = previous; }
  assert.equal((await adminCommand('status', { site })).ok, true);
  assert.equal((await adminCommand('verify', { site, dir })).ok, false);
  const newSite = join(root, 'new-site');
  assert.equal((await createSite({ dir: newSite, slug: 'new-site', blank: true, admin: true })).ok, true);
  assert.match(readFileSync(join(newSite, 'ADMIN-SETUP.md'), 'utf8'), /--plan/);
  assert.equal(JSON.parse(readFileSync(join(newSite, 'launch.json'), 'utf8')).admin, undefined);
  const other = { tenantId: 'other', siteOrigin, tokenHash: await digest('another_synthetic_credential_1234567890123456'), scopes: ['leads:read'] };
  const map = join(root, 'complete-grants.json'), out = join(root, 'merged-grants.json');
  writeFileSync(map, JSON.stringify({ other }));
  assert.equal((await adminCommand('grant', { dir, grants: map, out })).ok, true);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).other, other);
  assert.equal((await adminCommand('grant', { dir, grants: map, out })).ok, false);
  assert.throws(() => mergeAdminGrant({ synthetic: other }, JSON.parse(readFileSync(join(dir, '.vitris/backend-grant.json'), 'utf8'))), /rotate/);
  assert.throws(() => mergeAdminGrant({}, { synthetic: { ...other, token: 'raw-secret' } }), /raw credentials/);
});

test('published admin Worker reads isolated D1 records through real compatibility API', { timeout: 120000 }, async t => {
  const backend = await formsBackend(); t.after(backend.dispose);
  const adminDB = await formsBackend(join(packageRoot, 'migrations'), false); t.after(adminDB.dispose);
  const env = backend.env;
  await env.DB.prepare("INSERT INTO tenants(id,slug,name) VALUES('a','a','Synthetic A'),('b','b','Synthetic B')").run();
  await env.DB.prepare("INSERT INTO leads(id,tenant_id,name,email,message) VALUES('lead-a','a','Synthetic Person','a@example.invalid','Synthetic stored lead'),('lead-b','b','Other Account','b@example.invalid','Never disclose')").run();
  await env.DB.prepare("INSERT INTO contact_forms(id,tenant_id,config_json) VALUES('test-form','a','{}')").run();
  await env.DB.prepare(`INSERT INTO form_submissions(id,tenant_id,form_id,idempotency_key,fingerprint,challenge_hash,mode,fields_json,schema_json,name,email,phone,message,page_path,recipients_json) VALUES('test-a','a','test-form','key','fingerprint','synthetic-challenge','test','{}','{}','Synthetic Test','test@example.invalid','','Synthetic test submission','/','[]')`).run();
  await env.DB.prepare("UPDATE form_outbox SET status='captured',test_output='Synthetic notification capture' WHERE id='test-a'").run();
  // Exercise the real storage trigger: production submissions create a lead and
  // conversion; test submissions above never do. No widget or mail is invoked.
  await env.DB.prepare(`INSERT INTO form_submissions(id,tenant_id,form_id,idempotency_key,fingerprint,challenge_hash,mode,fields_json,schema_json,name,email,phone,message,page_path,recipients_json) VALUES('live-a','a','test-form','live-key','fingerprint','synthetic-live-challenge','live','{"project":"Synthetic project"}','{}','Synthetic Live','live@example.invalid','','Synthetic production fixture','/','[]')`).run();
  for (const [id, tenant, src] of [['live', 'a', 'live'], ['preview', 'a', 'preview'], ['other', 'b', 'live']]) await env.DB.prepare("INSERT INTO analytics_events(id,tenant_id,path,vid,day,kind,src) VALUES(?,?,'/','synthetic-visitor',date('now'),'pageview',?)").bind(id, tenant, src).run();
  const grant = { tenantId: 'a', siteOrigin, tokenHash: await digest(token), scopes: ['leads:read', 'analytics:read'] };
  env.ADMIN_CONNECTIONS = JSON.stringify({ synthetic: grant, other: { ...grant, tenantId: 'b', tokenHash: await digest('other_synthetic_credential_1234567890123456') } });
  const headers = { authorization: `Bearer ${token}`, 'x-vitris-installation': 'synthetic', 'x-vitris-site-origin': siteOrigin };
  const call = (path: string, init: RequestInit = {}) => route(env, new Request(`${backendOrigin}/api/admin/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } }));
  const manifest = parseManifest({ schemaVersion: 1, installationId: 'synthetic', business: { name: 'Synthetic Business', initials: 'SB' }, site: { id: 'synthetic', name: 'Main', origin: siteOrigin }, adminOrigin: 'https://admin.synthetic.example', backend: { provider: 'vitris-harness', origin: backendOrigin, tenantId: 'a' }, modules: [] });
  const transport = ((input: string | URL | Request, init?: RequestInit) => route(env, new Request(input, init))) as typeof fetch;
  const cliRoot = scratch(), cliSite = siteAt(cliRoot), cliAdmin = join(cliRoot, 'admin'); mkdirSync(cliAdmin);
  writeFileSync(join(cliAdmin, 'admin.config.json'), JSON.stringify(manifest));
  writeFileSync(join(cliSite, 'launch.json'), JSON.stringify({ ...launch, admin: { installationId: manifest.installationId, siteId: manifest.site.id, url: manifest.adminOrigin, siteOrigin: manifest.site.origin, tenantId: 'a' } }));
  const previousToken = process.env.VITRIS_ADMIN_API_TOKEN;
  process.env.VITRIS_ADMIN_API_TOKEN = token;
  t.after(() => { if (previousToken === undefined) delete process.env.VITRIS_ADMIN_API_TOKEN; else process.env.VITRIS_ADMIN_API_TOKEN = previousToken; });
  t.mock.method(globalThis, 'fetch', transport);
  const verified = await adminCommand('verify', { site: cliSite, dir: cliAdmin });
  assert.equal(verified.ok, true, verified.error);
  assert.deepEqual((verified.data as any).productionLeads, 2); assert.doesNotMatch(JSON.stringify(verified), /Synthetic Person|a@example.invalid/);
  assert.equal((await readConnection(manifest, token, 'status', false, transport)).capabilities.leadStatus, false);
  assert.equal((await call('a/status', { headers: { authorization: '' } })).status, 401);
  assert.equal((await call('b/leads')).status, 403);
  assert.equal((await call('a/leads', { headers: { 'x-vitris-site-origin': 'https://other.example' } })).status, 403);
  assert.equal((await call('a/leads', { headers: { 'x-vitris-installation': 'other' } })).status, 401);
  assert.equal((await call('a/leads', { headers: { origin: siteOrigin } })).status, 403);
  const update = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'lead-a', status: 'contacted' }) };
  assert.equal((await call('a/leads/status', update)).status, 403);
  assert.equal((await call('a/leads', { method: 'OPTIONS' })).status, 405);
  assert.equal((await call('a/analytics?days=999')).status, 400);

  // Use the actual published Worker adapter, not a reimplementation of its client.
  const { createAdmin } = await import(pathToFileURL(requirePublished.resolve('@tryvitris/website-admin-harness/worker')).href);
  const admin = createAdmin(manifest);
  const adminEnv = { DB: adminDB.env.DB, MODE: 'production', HARNESS_API_TOKEN: token, HARNESS_SERVICE: { fetch: (request: Request) => route(env, request) }, ASSETS: { fetch: () => new Response('Synthetic assets stub') } } as unknown as AdminEnv;
  await adminEnv.DB.prepare("INSERT INTO users(id,email,role) VALUES('owner','owner@example.invalid','owner'),('analyst','analyst@example.invalid','analyst')").run();
  for (const id of ['owner', 'analyst']) await adminEnv.DB.prepare('INSERT INTO sessions(digest,user_id,expires_at) VALUES(?,?,?)').bind(await digest(`synthetic-session-${id}`), id, Math.floor(Date.now() / 1000) + 3600).run();
  const requestAdmin = (path: string, init: RequestInit = {}, user = 'owner') => admin.fetch(new Request(manifest.adminOrigin + path, { ...init, headers: { cookie: `__Host-vitris-admin=synthetic-session-${user}`, ...init.headers } }), adminEnv);
  assert.equal((await admin.fetch(new Request(manifest.adminOrigin + '/api/leads'), adminEnv)).status, 401);
  assert.equal((await requestAdmin('/api/auth/demo', { method: 'POST', headers: { origin: manifest.adminOrigin } })).status, 404);
  assert.equal((await requestAdmin('/api/leads', {}, 'analyst')).status, 403);
  assert.equal((await requestAdmin('/api/analytics', {}, 'analyst')).status, 200);
  assert.equal((await requestAdmin('/api/connection')).status, 200);
  const leads = await (await requestAdmin('/api/leads')).json() as any;
  assert.equal(leads.source, 'connected'); assert.deepEqual(leads.rows.map((r: any) => r.id).sort(), ['lead-a', 'live-a']);
  assert.equal(leads.rows.find((r: any) => r.id === 'live-a').notification_status, 'pending');
  assert.equal(JSON.parse(leads.rows.find((r: any) => r.id === 'live-a').fields_json).project, 'Synthetic project');
  const tests = await (await requestAdmin('/api/leads?mode=test')).json() as any;
  assert.deepEqual(tests.rows.map((r: any) => r.id), ['test-a']); assert.equal(tests.rows[0].notification_status, 'captured');
  assert.equal(tests.rows[0].test_output, 'Synthetic notification capture'); assert.equal(tests.writable, false);
  const analytics = await (await requestAdmin('/api/analytics')).json() as any;
  assert.equal(analytics.rows[0].views, 1); assert.equal(analytics.rows[0].visitors, 1); assert.equal(analytics.rows[0].enquiries, 2);
  assert.equal((await requestAdmin('/api/leads/status', { ...update, headers: { ...update.headers, origin: manifest.adminOrigin } })).status, 503);
  grant.scopes.push('leads:write'); env.ADMIN_CONNECTIONS = JSON.stringify({ synthetic: grant });
  assert.equal((await requestAdmin('/api/leads/status', update)).status, 403); // CSRF
  assert.equal((await requestAdmin('/api/leads/status', { ...update, headers: { ...update.headers, origin: manifest.adminOrigin } })).status, 200);
  assert.equal((await call('a/leads/status', { ...update, body: JSON.stringify({ id: 'lead-b', status: 'closed' }) })).status, 404);
  assert.equal((await call('a/leads/status', { ...update, body: JSON.stringify({ id: 'test-a', status: 'closed' }) })).status, 404);
  assert.equal((await call('a/leads/status?mode=test', update)).status, 400);
  assert.equal((await env.DB.prepare("SELECT status FROM leads WHERE id='lead-a'").first<any>()).status, 'contacted');
  env.ADMIN_CONNECTIONS = '{}';
  assert.equal((await call('a/status')).status, 401);
  assert.equal((await adminCommand('verify', { site: cliSite, dir: cliAdmin })).ok, false);
  const failed = await requestAdmin('/api/leads'); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /demo-lead|Synthetic Person/);
  env.ADMIN_CONNECTIONS = '{invalid'; assert.equal((await call('a/status')).status, 401);
  adminEnv.HARNESS_SERVICE = { fetch: async () => { throw Error('Synthetic transport outage'); } } as unknown as Fetcher;
  const unavailable = await requestAdmin('/api/analytics'); assert.equal(unavailable.status, 502); assert.match(await unavailable.text(), /No local demo data/);
  await adminEnv.DB.prepare("UPDATE users SET active=0 WHERE id='owner'").run();
  assert.equal((await requestAdmin('/api/connection')).status, 401);
});
