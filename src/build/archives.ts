import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { acquirePathLock, fingerprint, within } from '../agent/artifacts.ts';

/** Retain only unmodified archives created by this function; never adopt older folders. */
export function archivePreviousBuild(root: string, previous: string): void {
  const archiveRoot = within(root, '.vitris/build-archives');
  mkdirSync(archiveRoot, { recursive: true });
  const unlock = acquirePathLock(join(archiveRoot, 'retention'));
  try {
    const id = randomUUID(), now = Date.now();
    // Consecutive builds can finish in the same millisecond. Keep the order
    // monotonic so retention cannot discard the build just archived.
    const priorTimes = readdirSync(archiveRoot).flatMap(name => {
      if (!/^[0-9a-f-]{36}$/.test(name)) return [];
      try {
        const manifest = JSON.parse(readFileSync(within(root, `.vitris/build-archives/${name}/archive.json`), 'utf8'));
        return manifest.version === 1 && manifest.id === name && Number.isSafeInteger(manifest.createdAt) && manifest.createdAt <= now + 60_000 ? [manifest.createdAt] : [];
      } catch { return []; }
    });
    const createdAt = Math.max(now, ...priorTimes.map(time => time + 1));
    const folder = within(root, `.vitris/build-archives/${id}`);
    const hash = fingerprint(previous, ['.']);
    mkdirSync(folder);
    renameSync(previous, join(folder, 'dist'));
    writeFileSync(join(folder, 'archive.json'), JSON.stringify({ version: 1, id, createdAt, hash }) + '\n', { flag: 'wx' });
    const candidates = readdirSync(archiveRoot).flatMap(name => {
      if (!/^[0-9a-f-]{36}$/.test(name)) return [];
      const candidate = within(root, `.vitris/build-archives/${name}`);
      try {
        if (!lstatSync(candidate).isDirectory() || lstatSync(candidate).isSymbolicLink()) return [];
        const entries = readdirSync(candidate).sort();
        if (entries.join(',') !== 'archive.json,dist') return [];
        const manifestPath = within(root, `.vitris/build-archives/${name}/archive.json`);
        const dist = within(root, `.vitris/build-archives/${name}/dist`);
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        if (manifest.version !== 1 || manifest.id !== name || !Number.isSafeInteger(manifest.createdAt) || manifest.hash !== fingerprint(dist, ['.'])) return [];
        return [{ candidate, createdAt: manifest.createdAt, name }];
      } catch { return []; }
    }).sort((a, b) => b.createdAt - a.createdAt || b.name.localeCompare(a.name));
    for (const stale of candidates.slice(3)) rmSync(stale.candidate, { recursive: true });
  } finally { unlock(); }
}
