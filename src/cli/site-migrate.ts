import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Migrate configuration only. Dependency installation and kit refresh are separate operations. */
export function migrateSite(options: { site: string; harnessSpec?: string; apply?: boolean }) {
  const root = resolve(options.site);
  const leases = join(root, 'agent/leases');
  if (existsSync(join(root, 'agent/RUN.lock')) || (existsSync(leases) && readdirSync(leases).some(name => name.endsWith('.json')))) throw new Error('Stop the active workflow before migrating the site');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!existsSync(join(root, 'site.json')) || ['@vitris/harness', '@vitris/kernel'].includes(pkg.name)) throw new Error('Migration requires a customer site directory');
  const edits: { path: string; before: string; after: string }[] = [];
  const edit = (path: string, change: (text: string) => string) => {
    if (!existsSync(join(root, path))) return;
    const before = readFileSync(join(root, path), 'utf8'), after = change(before);
    if (after !== before) edits.push({ path, before, after });
  };
  edit('package.json', text => {
    const value = JSON.parse(text);
    const siteConfig = JSON.parse(readFileSync(join(root, 'site.json'), 'utf8'));
    const slug = siteConfig.slug || value.name;
    for (const section of ['dependencies', 'devDependencies']) {
      const deps = value[section];
      if (!deps) continue;
      if (deps['@vitris/kernel'] && deps['@vitris/harness'] && deps['@vitris/kernel'] !== deps['@vitris/harness'] && !options.harnessSpec) throw new Error('Conflicting package dependencies; supply --harness SPEC');
      if (deps['@vitris/kernel'] || deps['@vitris/harness']) {
        deps['@vitris/harness'] = options.harnessSpec || deps['@vitris/harness'] || deps['@vitris/kernel'];
        delete deps['@vitris/kernel'];
      }
    }
    const currentScripts: Record<string, string> = {
      build: `node ./node_modules/@vitris/harness/bin/vitris-build.js --site . --out dist --slug ${slug}`,
      go: 'node ./node_modules/@vitris/harness/bin/vitris-go.js',
      harvest: 'node ./node_modules/@vitris/harness/bin/vitris-harvest.js',
      eval: 'node ./node_modules/@vitris/harness/bin/vitris-eval.js',
    };
    for (const [key, script] of Object.entries(value.scripts || {})) {
      if (typeof script !== 'string') continue;
      value.scripts[key] = (script.includes('@vitris/kernel') || script.includes('@vitris/harness/src/build/cli.ts')) && currentScripts[key]
        ? currentScripts[key]
        : script.replaceAll('@vitris/kernel', '@vitris/harness');
    }
    value.scripts ||= {};
    value.scripts['refresh-agent'] ||= 'node ./node_modules/@vitris/harness/bin/vitris-refresh.js --site .';
    return JSON.stringify(value, null, 2) + '\n';
  });
  edit('launch.json', text => {
    const value = JSON.parse(text);
    if (value.kernelOrigin && value.backendOrigin && value.kernelOrigin !== value.backendOrigin) throw new Error('Conflicting backendOrigin and kernelOrigin; resolve the launch configuration before migration');
    if (value.kernelOrigin) { value.backendOrigin = value.backendOrigin || value.kernelOrigin; delete value.kernelOrigin; }
    return JSON.stringify(value, null, 2) + '\n';
  });
  for (const path of ['README.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.github/workflows/deploy.yml']) {
    edit(path, text => text.replaceAll('@vitris/kernel', '@vitris/harness'));
  }
  let backup: string | undefined;
  if (options.apply && edits.length) {
    backup = join(root, 'agent-backups', `harness-migration-${Date.now()}`);
    // Persist every original before applying the first edit. Existing lockfiles are preserved for comparison.
    for (const item of edits) { const path = join(backup, item.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, item.before); }
    for (const item of edits) writeFileSync(join(root, item.path), item.after);
  }
  return { applied: !!options.apply, files: edits.map(item => item.path), backup,
    next: 'Run npm install to update the lockfile, then npm run refresh-agent and npm run build. Review the diff before committing.' };
}
