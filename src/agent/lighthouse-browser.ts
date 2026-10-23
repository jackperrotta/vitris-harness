import { rm, realpath } from 'node:fs/promises';
import { basename, relative, resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, type LaunchedChrome } from 'chrome-launcher';

/** One CDP client controls Lighthouse; a Playwright browser also attaches to every target. */
export async function lighthouseBrowser(chromePath?: string): Promise<LaunchedChrome> {
  const executable = chromePath || process.env.CHROME_PATH || (await import('playwright')).chromium.executablePath();
  return launch({ chromePath: executable, chromeFlags: ['--headless=new', '--no-first-run', '--disable-dev-shm-usage'] });
}

export async function closeLighthouseBrowser(chrome: LaunchedChrome): Promise<void> {
  // Windows may release the profile lock just after chrome-launcher's synchronous kill.
  const raw = chrome.process.spawnargs.find(arg => arg.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
  const profile = raw ? resolve(raw) : undefined, base = resolve(tmpdir());
  const rel = profile ? relative(base, profile) : '';
  const owned = Boolean(profile && rel && !rel.startsWith('..') && !isAbsolute(rel) && basename(profile).startsWith('lighthouse.'));
  try { chrome.kill(); }
  catch (error) {
    if (!owned || !['EPERM', 'EBUSY', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
    let actualProfile: string;
    try { actualProfile = await realpath(profile!); }
    catch (missing) { if ((missing as NodeJS.ErrnoException).code === 'ENOENT') return; throw missing; }
    const actualRel = relative(await realpath(base), actualProfile);
    if (!actualRel || actualRel.startsWith('..') || isAbsolute(actualRel)) throw error;
    // This path came from this launched process, is inside its temp root, and has the launcher prefix.
    await rm(actualProfile, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
  }
}
