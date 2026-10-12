#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { ensureBrandContext, selectionDraft, submitSelection, selectionStore, type ThemeSelection } from '../src/agent/theme-selection.ts';
import { writeThemePicker } from '../src/agent/theme-picker.ts';
import { startThemeReviewServer } from '../src/agent/theme-review-server.ts';
import {THEME_RELEASE,VISUAL_THEMES,visualTheme} from '../src/agent/theme-library.ts';
import {manifestPages} from '../src/agent/theme-preview.ts';
import {validateAdaptationPreferences,submitTemplateDecision} from '../src/agent/template-adaptation.ts';
import {submitAdaptationResponse,contentRefinementQueue,QUESTIONS_PATH} from '../src/agent/adaptation-checkpoint.ts';

const argv=process.argv.slice(2),arg=(name:string)=>{const i=argv.indexOf('--'+name);return i>=0?argv[i+1]:undefined;};
const help=`Theme direction selection (no model calls)
  vitris-themes render --site ABSOLUTE_SITE --out ABSOLUTE_HTML [--theme ID] [--release RELEASE] [--test]
  vitris-themes serve --site ABSOLUTE_SITE [--port 4318] [--test]
  vitris-themes serve --demo ABSOLUTE_MANIFEST [--port 4318]
  vitris-themes select --site ABSOLUTE_SITE --theme ID --notes-file ABSOLUTE_FILE --source user-chat [--adaptation-file ABSOLUTE_JSON]
  vitris-themes select --site ABSOLUTE_SITE --theme ID --source agent-delegated --delegation "exact user instruction"
  vitris-themes import --site ABSOLUTE_SITE --file ABSOLUTE_JSON
  vitris-themes decide --site ABSOLUTE_SITE --file ABSOLUTE_DECISION_JSON
  vitris-themes answer --site ABSOLUTE_SITE --file ABSOLUTE_RESPONSE_JSON
  vitris-themes questions|queue --site ABSOLUTE_SITE
  vitris-themes status --site ABSOLUTE_SITE
Active catalog: ${THEME_RELEASE} (${VISUAL_THEMES.length} directions / ${VISUAL_THEMES.reduce((n,t)=>n+manifestPages(t).length,0)} pages). Still & Field has 33 complete editorial real-estate pages. Current & Craft has eleven complete electrical pages. Fieldwell Comfort has twenty complete pages. Record Counsel has twenty-five pages: 23 substantive and two support. Alongside Medical has twelve pages: nine substantive and three support. Ridgeline has nineteen. Preserved catalogs resolve with --release 2026-10-09.9, 2026-10-09.8, 2026-10-09.7, 2026-10-09.6, 2026-10-09.5, 2026-10-09.4, 2026-10-09.3, 2026-10-09.2, 2026-10-09.1, 2026-10-08.4, 2026-10-08.3, 2026-10-08.2 or 2026-10-08.1.
Sources: user-ui, user-chat, agent-delegated (explicit delegation required), test-simulation.
Opt in via launch.json: themeSelection: {version:1, enabled:true}. Absence preserves legacy behavior.
Render is portable/offline. Serve persists only declared selection artifacts. Saving continues on the next workflow invocation; it never invokes a model.
`;
async function main(){
  if(argv.includes('--help')||argv.includes('-h')||!argv.length){console.log(help);return;}
  const command=argv[0];if(!['render','serve','select','import','status','decide','answer','questions','queue'].includes(command!))throw new Error('Unknown command. Use --help.');
  const requiredPath=(name:string)=>{const p=arg(name);if(!p||!isAbsolute(p))throw new Error('--'+name+' requires an absolute path');return resolve(p);};
  if(command==='serve'){
    const sites=arg('demo')?(JSON.parse(readFileSync(requiredPath('demo'),'utf8')) as {sites:Array<{root:string;test:boolean}>}).sites:[{root:requiredPath('site'),test:argv.includes('--test')}];
    if(sites.some(s=>!isAbsolute(s.root)))throw new Error('Demo site paths must be absolute');
    const port=arg('port')?Number(arg('port')):4318;if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid port');
    const {url}=await startThemeReviewServer({sites,port});console.log('Theme picker: '+url);return;
  }
  const root=requiredPath('site');
  if(command==='answer'){submitAdaptationResponse(root,JSON.parse(readFileSync(requiredPath('file'),'utf8')));console.log('Answer saved. Resume the workflow; saving does not invoke a model.');return;}
  if(command==='questions'){console.log(readFileSync(resolve(root,QUESTIONS_PATH),'utf8'));return;}
  if(command==='queue'){console.log(JSON.stringify(contentRefinementQueue(root),null,2));return;}
  if(command==='decide'){submitTemplateDecision(root,JSON.parse(readFileSync(requiredPath('file'),'utf8')));console.log('Template decision recorded. Resume the workflow to consume it.');return;}
  if(command==='status'){console.log(JSON.stringify(selectionStore(root)||{status:'awaiting_user'},null,2));return;}
  if(command==='render'){const themeId=arg('theme');console.log(writeThemePicker(root,requiredPath('out'),argv.includes('--test'),themeId?{themes:[visualTheme(themeId,arg('release'))]}:undefined));return;}
  if(command==='import'){console.log(JSON.stringify(submitSelection(root,JSON.parse(readFileSync(requiredPath('file'),'utf8'))),null,2));return;}
  const source=arg('source') as ThemeSelection['source'];if(!source)throw new Error('--source is required; never infer human preference');
  const notes=arg('notes-file')?readFileSync(requiredPath('notes-file'),'utf8'):arg('notes')||'';
  const selection=selectionDraft(root,arg('theme')||'',notes,source,arg('delegation'),arg('release'));
  if(arg('adaptation-file')){const preferences=JSON.parse(readFileSync(requiredPath('adaptation-file'),'utf8'));validateAdaptationPreferences(preferences);selection.adaptation=preferences;}
  console.log(JSON.stringify(submitSelection(root,selection),null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
