#!/usr/bin/env node
import { createSite } from '../src/cli/site-create.ts';
import { promptSourceUrl } from './onboard/prompt.ts';
import { siteInputsFromArgv } from '../src/agent/site-inputs.ts';

const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1]; };
const usage = `Usage: vitris-create-site --dir ../acme --slug acme [--name "Acme Shop"] [--from URL | --blank]
  --owner EMAIL         Owner login email
  --admin               Prepare optional sibling admin instructions (no cloud writes)
  --template ID         Catalog ID, name, or hosted template URL; continue automatically
  --template-release R  Optional catalog revision
  --content TEXT        Additional business content or instructions
  --content-file FILE   UTF-8 content file (instead of --content)
  --mode MODE           redesign (default) or preserve (legacy Vitris duplicate)
  --backend-origin URL  Backend origin (default http://127.0.0.1:8787)
  --harness SPEC        Dependency version, tarball, or file: path (default: this package version)
  --no-prompt           Do not ask for a source URL
Legacy --kernel and --kernel-origin flags remain accepted.`;
async function main() {
  if (process.argv.includes('--help')) { console.log(usage); return; }
  if (!arg('--dir') || !arg('--slug')) throw new Error(usage);
  const blank = process.argv.includes('--blank');
  if (blank && arg('--from')) throw new Error('Use either --from or --blank, not both.');
  const from = await promptSourceUrl({ noPrompt: process.argv.includes('--no-prompt'), from: arg('--from'), blank });
  const result = await createSite({ dir: arg('--dir')!, slug: arg('--slug')!, name: arg('--name'), from: from || undefined, blank,
    ...siteInputsFromArgv(process.argv),
    mode: arg('--mode') as 'redesign' | 'preserve' | undefined,
    admin: process.argv.includes('--admin'), owner: arg('--owner'), backendOrigin: arg('--backend-origin') || arg('--kernel-origin'), harnessSpec: arg('--harness') || arg('--kernel') });
  if (!result.ok) throw new Error(result.error);
  console.log(`${result.summary}\nOpen that site directory in your coding agent, run npm install and npx playwright install chromium, then npm run go. The workflow stops at a local preview; launch is separate.`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
