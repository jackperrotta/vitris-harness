import {readFileSync,existsSync,mkdtempSync,mkdirSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname,join,resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const credentialRoot=resolve(process.env.VITRIS_AUDIT_CREDENTIAL_ROOT||root);
const npm=process.env.npm_execpath||join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
function run(command,args){const r=spawnSync(command,args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,windowsHide:true});if(r.status!==0)throw Error('Release audit subprocess failed; no subprocess output is printed to protect credentials.');return r.stdout;}
const out=mkdtempSync(join(tmpdir(),'vitris-release-audit-'));
const packed=JSON.parse(run(process.execPath,[npm,'pack','--ignore-scripts','--json','--pack-destination',out]))[0];
const extracted=join(out,'extracted');mkdirSync(extracted);
run('tar',['-xzf',join(out,packed.filename),'-C',extracted]);
const forbidden=/(^|\/)(scratch|artifacts|\.cursor|\.git|\.wrangler|\.vitris-local|test|tests|baselines|plans)(\/|$)|\.test\.[cm]?[jt]s$|\.(zip|tgz|tar|pem|key)$|(^|\/)(\.env|\.dev\.vars)(?!\.example$)|(^|\/)(CURRENT\.md|PREPARED\.json|RUN\.lock|result-manifest\.json)$|^agent\/(runs|reviews|decisions|preparations|leases|receipts|screenshots|design-runs)\//;
const findings=[];
const secretName=/key|token|secret|password|credential|authorization/i;
const known=[];
function remember(name,value){if(secretName.test(name)&&typeof value==='string'&&value.length>=12&&!/example|placeholder|replace|your[_ -]|change.me/i.test(value))known.push(value);}
for(const [name,value] of Object.entries(process.env))remember(name,value);
const credentialFiles=['.dev.vars','.env','.env.local','.env.production','.wrangler-preview.secrets.json'];
for(const name of readdirSync(credentialRoot))if(/^\.(env|dev\.vars)(\.|$)/.test(name)&&!name.endsWith('.example'))credentialFiles.push(name);
for(const file of new Set(credentialFiles))if(existsSync(join(credentialRoot,file))&&lstatSync(join(credentialRoot,file)).isFile()){
  const text=readFileSync(join(credentialRoot,file),'utf8');
  for(const m of text.matchAll(/^\s*([\w-]+)\s*=\s*(.*?)\s*$/gm))remember(m[1],m[2].replace(/^['"]|['"]$/g,''));
  try{for(const [name,value] of Object.entries(JSON.parse(text)))remember(name,value);}catch{}
}
const variants=[...new Set(known.flatMap(v=>[v,encodeURIComponent(v),Buffer.from(v).toString('base64')]))];
const patterns=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['provider-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}|AKIA[A-Z0-9]{16}|npm_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/],['credential-in-url',/https?:\/\/[^\s/@:]+:[^\s/@]+@/]];
for(const file of packed.files){
  if(forbidden.test(file.path))findings.push({file:file.path,rule:'forbidden-release-file'});
  const bytes=readFileSync(join(extracted,'package',file.path));
  if(variants.some(v=>bytes.includes(Buffer.from(v))))findings.push({file:file.path,rule:'local-credential-value'});
  const text=bytes.toString('utf8');for(const [rule,pattern] of patterns)if(pattern.test(text))findings.push({file:file.path,rule});
  if(/(?:8961b5ad5a5b91248bafb48915e264b1|8d59b52a-052e-49a1-ac67-c5607c8c302f|8fa0ed852e9f489ba1de8460b21395e7)/.test(text))findings.push({file:file.path,rule:'operator-infrastructure-id'});
}
if(packed.unpackedSize>35*1024*1024)findings.push({file:'package',rule:'package-size-limit'});
// Gitleaks is an additional required review check in release CI. All its output
// is captured and findings are reduced to file/rule/line only.
const scanner=process.env.GITLEAKS_BIN;
if(scanner){const report=join(out,'gitleaks.json');const r=spawnSync(scanner,['dir',join(extracted,'package'),'--redact=100','--no-banner','--log-level','error','--report-format','json','--report-path',report,'--max-decode-depth','2'],{encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});if(r.status!==0&&r.status!==1)throw Error('Gitleaks did not complete');if(existsSync(report))for(const f of JSON.parse(readFileSync(report,'utf8')))findings.push({file:relative(join(extracted,'package'),f.File).replaceAll('\\','/'),rule:f.RuleID,line:f.StartLine});}
const report={ok:findings.length===0,version:packed.version,compressedBytes:packed.size,unpackedBytes:packed.unpackedSize,files:packed.entryCount,sha256:createHash('sha256').update(readFileSync(join(out,packed.filename))).digest('hex'),localCredentialValuesChecked:new Set(known).size,gitleaks:scanner?'completed':'not configured',findings};
const reportPath=process.argv[process.argv.indexOf('--report')+1];if(process.argv.includes('--report')&&reportPath)writeFileSync(resolve(reportPath),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.ok)process.exitCode=1;
