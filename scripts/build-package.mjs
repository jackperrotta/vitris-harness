import { build } from 'esbuild';
import { readFileSync, readdirSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// Template definitions are catalog metadata; authored demos and assets live in R2.
const cloud=JSON.parse(readFileSync(new URL('../src/agent/theme-cloud.json',import.meta.url),'utf8'));
for(const e of cloud.entries){if(!e.revision||!e.pages.length||!e.base.startsWith('https://'))throw Error('Invalid hosted template catalog: '+e.theme.id);}
await import('./build-motion-runtime.mjs');
const bins = {
  'vitris-icons': 'scripts/icons.ts',
  vitris: 'bin/vitris.ts', 'vitris-go': 'scripts/workflow.ts',
  'vitris-eval': 'scripts/eval-site.ts', 'vitris-build': 'src/build/cli.ts',
  'vitris-harvest': 'scripts/harvest.ts', 'vitris-prepare-media': 'scripts/prepare-media.ts',
  'vitris-preview': 'scripts/preview.ts', 'vitris-refresh': 'scripts/refresh-agent.ts',
  'vitris-verify-browser': 'scripts/verify-browser.ts', 'vitris-catalog': 'scripts/catalog.ts',
  'vitris-create-site': 'scripts/create-site.ts', 'vitris-launch-preflight': 'scripts/launch-preflight.ts',
  'vitris-knowledge': 'scripts/knowledge-explain.ts', 'vitris-blocks': 'scripts/blocks-preview.ts',
  'vitris-sign-publish-bundle': 'scripts/sign-publish-bundle.ts',
  'vitris-migrate-site': 'scripts/migrate-site.ts',
  'vitris-stock': 'scripts/stock-library.ts',
  'vitris-upgrade': 'scripts/upgrade.ts',
  'vitris-references': 'scripts/reference-library.ts',
  'vitris-art': 'scripts/art-direction.ts',
  'vitris-content-coverage': 'scripts/content-coverage.ts',
  'vitris-themes': 'scripts/theme-selection.ts',
  'vitris-templates': 'scripts/templates.ts',
  'vitris-motion-view': 'scripts/template-motion-view.ts',
  'vitris-media-serve': 'scripts/serve-contact-sheet.ts',
  'vitris-cursor-hook': 'scripts/cursor-hook.ts',
};
// Share code across CLI/API entry points instead of shipping dozens of copies.
// Only clean known generated outputs; never traverse archival junctions.
for (const name of ['api', 'chunks', 'types']) rmSync(new URL('../bin/' + name, import.meta.url), {recursive:true, force:true});
for (const name of readdirSync(new URL('../bin/', import.meta.url))) if (name.endsWith('.js')) rmSync(new URL('../bin/' + name, import.meta.url));
const entries = Object.fromEntries(Object.entries(pkg.exports).map(([key, entry]) => ['api/' + (key === '.' ? 'index' : key.slice(2)), entry.types.replace('./bin/types/', './').replace(/\.d\.ts$/, '.ts')]));
await build({ bundle:true, platform:'node', format:'esm', packages:'external', splitting:true, chunkNames:'chunks/[name]-[hash]', entryPoints:{...bins,...entries}, outdir:'bin' });
const workerBlake3={name:'worker-blake3',setup(build){
 build.onResolve({filter:/^blake3-wasm$/},()=>({path:'blake3',namespace:'vitris-worker'}));
 build.onLoad({filter:/.*/,namespace:'vitris-worker'},()=>({resolveDir:process.cwd(),contents:`import module from './blake3.wasm'; import init,* as bindings from 'blake3-wasm/dist/wasm/web/blake3_js.js'; import {provideWasm} from 'blake3-wasm/esm/browser/wasm.js'; provideWasm(bindings); await init(module); export {hash} from 'blake3-wasm/esm/browser/index.js';`}));
}};
const workerBuild=await build({bundle:true,metafile:true,platform:'browser',format:'esm',external:['cloudflare:*','node:*','./blake3.wasm'],plugins:[workerBlake3],entryPoints:{backend:'src/worker/index.ts',templates:'src/template-cloud/worker.ts','forms-test':'src/worker/forms-sandbox.ts'},outdir:'bin/cloudflare'});
copyFileSync('node_modules/blake3-wasm/dist/wasm/web/blake3_js_bg.wasm','bin/cloudflare/blake3.wasm');
mkdirSync('licenses',{recursive:true});
for(const name of new Set(Object.keys(workerBuild.metafile.inputs).flatMap(path=>path.match(/^node_modules\/(@[^/]+\/[^/]+|[^/]+)/)?.[1]||[]))){
 const dir='node_modules/'+name;
 const notices=readdirSync(dir).filter(f=>/^(license|copying|notice)(\.|$)/i.test(f));
 if(!notices.length)throw Error('Missing bundled dependency notice: '+name);
 for(const file of notices)copyFileSync(dir+'/'+file,'licenses/'+name.replaceAll('/','__')+'-'+file);
}
const config=ts.readConfigFile(fileURLToPath(new URL('../tsconfig.json',import.meta.url)),ts.sys.readFile);
const options=ts.convertCompilerOptionsFromJson(config.config.compilerOptions,process.cwd()).options;
const program=ts.createProgram(Object.values(entries),{...options,noEmit:false,declaration:true,emitDeclarationOnly:true,outDir:'bin/types',rootDir:process.cwd()});
const emit=program.emit();
const errors=[...ts.getPreEmitDiagnostics(program),...emit.diagnostics].filter(d=>d.category===ts.DiagnosticCategory.Error);
if(errors.length){process.stderr.write(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));process.exit(1);}
