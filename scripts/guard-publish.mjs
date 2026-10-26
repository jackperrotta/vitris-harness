import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
if(pkg.name!=='@tryvitris/website-harness'||pkg.private!==false||pkg.publishConfig?.access!=='public')throw Error('Publication requires the public @tryvitris/website-harness package metadata');
if(pkg.publishConfig?.registry!=='https://registry.npmjs.org/')throw Error('Publication must target the public npm registry');
if(pkg.version.includes('-')&&pkg.publishConfig?.tag!=='beta')throw Error('Prereleases must use the beta dist-tag');
const audit=spawnSync(process.execPath,[fileURLToPath(new URL('./audit-package.mjs',import.meta.url))],{cwd:root,stdio:'inherit',windowsHide:true});
if(audit.error)throw audit.error;
if(audit.status!==0)process.exit(audit.status||1);
