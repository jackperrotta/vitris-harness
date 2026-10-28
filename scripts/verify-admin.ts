import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { npmCliPath } from '../src/agent/package-verification.ts';

const base = resolve('artifacts/admin-integration'); mkdirSync(base, { recursive: true });
const root = mkdtempSync(join(base, 'published-'));
writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
const packages = ['website-admin-harness', 'create-website-admin-harness', 'website-admin-contracts'].map(name => `@tryvitris/${name}@0.1.0-alpha.1`);
const installed = spawnSync(process.execPath, [npmCliPath(), 'install', '--save-exact', '--no-audit', '--no-fund', ...packages], { cwd: root, encoding: 'utf8', windowsHide: true });
writeFileSync(join(root, 'install.log'), `${installed.stdout || ''}${installed.stderr || ''}`);
if (installed.status !== 0) throw Error(`Published package installation failed; see ${root}/install.log`);
const tested = spawnSync(process.execPath, ['--experimental-strip-types', '--test', 'src/admin-integration.test.ts'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, VITRIS_ADMIN_PACKAGE_ROOT: root }, maxBuffer: 8 * 1024 * 1024 });
writeFileSync(join(root, 'test.log'), `${tested.stdout || ''}${tested.stderr || ''}`);
process.stdout.write(tested.stdout || ''); process.stderr.write(tested.stderr || '');
console.log(`Published-package acceptance evidence: ${root}`); process.exitCode = tested.status ?? 1;
