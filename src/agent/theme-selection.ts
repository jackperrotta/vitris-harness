import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { save, acquirePathLock } from './artifacts.ts';
import { digest, visualTheme, themeHash, SPECIMEN_VERSION, THEME_RELEASE, type VisualTheme } from './theme-library.ts';
import type { ThemeTokens } from '../types.ts';
import { DEFAULT_TYPE_ROLES } from '../typography.ts';
import { typographyPolicy } from './typography-policy.ts';
import {CLOUD_CATALOG} from './theme-cloud.ts';
import { pinnedTemplateAssets, pinnedTemplateEntry, pinnedTemplateIdentity, type TemplateCatalog } from './template-catalog.ts';
import { validateAdaptationPreferences, type AdaptationPreferences } from './template-adaptation.ts';

function themeFontGuide(theme:VisualTheme,assets:NonNullable<TemplateCatalog['assets']>=CLOUD_CATALOG.assets):string[]{
 if(!theme.fontAssets)return [];
 const fonts=theme.fontAssets.map(f=>{const match=(a:NonNullable<TemplateCatalog['assets']>[number])=>typeof f==='string'?a.id===f:a.file===f.file&&a.sha256===f.sha256;const cloud=assets.find(match) || CLOUD_CATALOG.assets.find(match);return cloud?(typeof f==='string'?cloud:{...f,url:cloud.url,licenseUrl:cloud.licenseUrl}):f;});
 return ['Licensed font records: '+JSON.stringify(fonts)+'. Hosted files and license notices live in Cloudflare; verify their pinned digests when using them. Fonts without a hosted URL retain their installed package location. Declare @font-face and verify actual loading.'];
}

export const BRAND_PATH = 'onboarding/theme-brand.json';
export const SELECTION_PATH = 'agent/theme-selection.json';
export const THEME_DESIGN_NODES = new Set(['reference-analysis','template-reference-review','direction','direction-render','direction-review','asset-production','storyboard','copy','copy-review','representative','representative-browser','representative-review','representative-quality','copy-expansion','pages','browser','visual-review','content-review','refine']);
export const themeDependentNode = (node: {id:string;eval:string}): boolean => THEME_DESIGN_NODES.has(node.id) || THEME_DESIGN_NODES.has(node.eval) || /^(?:creative-|variant-directions|direction-diversity)/.test(node.eval);
export type BrandColor = { value: string; source: string; confidence: 'explicit' | 'captured' };
export type BrandContext = { schemaVersion: 1; siteId: string; name: string; logo?: { path: string; hash: string; source: string }; colors: BrandColor[]; fallback: boolean };
export type ThemeSelection = { schemaVersion: 1; siteId: string; themeId: string; themeRelease: string; themeHash: string; catalogHash?: string; brandContextHash: string; notes: string; source: 'user-ui'|'user-chat'|'agent-delegated'|'test-simulation'; operationId: string; selectedAt: string; previousSelectionHash: string | null; delegation?: string; adaptation?: AdaptationPreferences };
export type SelectionStore = { schemaVersion: 1; current: ThemeSelection; history: ThemeSelection[] };
const read = <T>(root: string, path: string): T | undefined => existsSync(join(root,path)) ? JSON.parse(readFileSync(join(root,path),'utf8')) as T : undefined;
export function themeSelectionEnabled(root: string): boolean {
  const policy = read<{ themeSelection?: { version?: number; enabled?: boolean } }>(root,'launch.json')?.themeSelection;
  if (!policy) return false;
  if (policy.version !== 1) throw new Error('Unsupported themeSelection policy version');
  return policy.enabled === true;
}
export function normalizeBrandColor(value: string): string | undefined {
  if (/^#[\da-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(value)) return '#' + [...value.slice(1)].map(c => c+c).join('').toLowerCase();
  const rgb = value.match(/^rgba?\(\s*(\d{1,3})[, ]+\s*(\d{1,3})[, ]+\s*(\d{1,3})(?:\s*[,/]\s*(1|1\.0))?\s*\)$/);
  if (rgb && rgb.slice(1,4).every(n=>Number(n)<=255)) return '#'+rgb.slice(1,4).map(n=>Number(n).toString(16).padStart(2,'0')).join('');
  return undefined;
}
export function luminance(color: string): number {
  const c = normalizeBrandColor(color); if (!c) throw new Error('Invalid color');
  const v = [1,3,5].map(i=>{const n=parseInt(c.slice(i,i+2),16)/255; return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});
  return .2126*v[0]!+.7152*v[1]!+.0722*v[2]!;
}
export function contrast(a: string,b: string): number { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
/** Repeated action colors, excluding only genuinely achromatic RGB values. */
export function colorsFromComputedActions(values: string[], source: string): BrandColor[] {
  const counts=new Map<string,number>();
  for(const raw of values) {
    const value=normalizeBrandColor(raw);
    if(value && !(value.slice(1,3)===value.slice(3,5)&&value.slice(3,5)===value.slice(5,7))) counts.set(value,(counts.get(value)||0)+1);
  }
  return [...counts].filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,3).map(([value])=>({value,source,confidence:'captured'}));
}
/** Raster-only allowlist with real-path confinement; never embed captured SVG/HTML. */
export function logoData(root: string, brand: BrandContext): string | undefined {
  if (!brand.logo || !/\.(png|jpe?g|webp)$/i.test(brand.logo.path) || brand.logo.path.includes('..')) return undefined;
  const path = resolve(root,brand.logo.path.replace(/^[/\\]+/,''));
  if (!existsSync(path)) return undefined;
  const base=realpathSync(root), actual=realpathSync(path);
  if (!actual.startsWith(base+sep)) return undefined;
  const bytes = Buffer.from(readFileSync(actual));
  if (bytes.length>2_000_000 || digest(bytes)!==brand.logo.hash) return undefined;
  const mime = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : bytes[0]===255&&bytes[1]===216 ? 'image/jpeg' : bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP' ? 'image/webp' : undefined;
  return mime ? `data:${mime};base64,${bytes.toString('base64')}` : undefined;
}
/** One bounded pass over retained markup: only repeated action/nav color evidence, never photos. */
export function colorsFromCapturedHtml(html: string, source: string): BrandColor[] {
  const counts = new Map<string,number>();
  const tags=html.slice(0,2_000_000).match(/<(?:a|button)\b[^>]*>/gi)||[];
  for(const tag of tags) {
    const style=tag.match(/\bstyle=["']([^"']*)["']/i)?.[1]||'';
    for(const m of style.matchAll(/(?:^|;)\s*(?:background-color|color)\s*:\s*([^;]+)/gi)) {
      const value=normalizeBrandColor(m[1]!.trim());
      if(value && !(value.slice(1,3)===value.slice(3,5)&&value.slice(3,5)===value.slice(5,7))) counts.set(value,(counts.get(value)||0)+1);
    }
  }
  return [...counts].filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,3).map(([value])=>({value,source:`${source}: repeated inline navigation/action color`,confidence:'captured'}));
}
export function ensureBrandContext(root: string): BrandContext {
  const prior=read<BrandContext>(root,BRAND_PATH); if(prior) { validateBrand(prior); return prior; }
  const launch=read<{slug?:string;name?:string;brand?:{colors?:string[]}}>(root,'launch.json');
  const brief=read<any>(root,'onboarding/brief.json');
  if(!brief) throw new Error('Harvest is required before creating theme branding');
  const colors: BrandColor[]=(launch?.brand?.colors||[]).map(value=>({value,source:'launch.json explicit brand.colors',confidence:'explicit' as const}));
  if(!colors.length) for(const color of brief.visual?.hints?.brandColors || brief.hints?.brandColors || []) {
    if(normalizeBrandColor(color.value)) colors.push({value:normalizeBrandColor(color.value)!,source:color.source,confidence:'captured'});
  }
  const audit=read<any>(root,'onboarding/media-inventory.json');
  const candidate=(audit?.assets||[]).find((a:any)=>a.role==='logo'&&a.disposition==='use'&&a.inspected) || (brief.images||brief.assets||brief.media||[]).find((a:any)=>a.role==='logo'||a.mediaType==='logo');
  const path=String(candidate?.path||candidate?.localPath||candidate?.src||'').replace(/^[/\\]+/,'');
  const brand: BrandContext={schemaVersion:1,siteId:launch?.slug||brief.slug||'site',name:launch?.name||brief.business?.name||'Your business',colors,fallback:!colors.length};
  if(path&&!path.includes('..')&&existsSync(join(root,path))) brand.logo={path,hash:digest(readFileSync(join(root,path))),source:candidate.sourceUrl||'captured media audit'};
  if(brand.logo&&!logoData(root,brand)) delete brand.logo;
  validateBrand(brand);save(join(root,BRAND_PATH),brand);return brand;
}
export function validateBrand(b: BrandContext): void {
  if(b.schemaVersion!==1||typeof b.siteId!=='string'||!b.siteId||b.siteId.length>180||typeof b.name!=='string'||b.name.length>500||!Array.isArray(b.colors)||b.colors.length>12||b.colors.some(c=>!normalizeBrandColor(c.value)||!['captured','explicit'].includes(c.confidence)||typeof c.source!=='string')) throw new Error('Invalid brand context');
}
export function bindTheme(theme: VisualTheme,brand: BrandContext,assets?: NonNullable<TemplateCatalog['assets']>): { tokens: ThemeTokens; brandAccent: string; cacheKey: string; guide: string } {
  validateBrand(brand);
  const brandAccent=normalizeBrandColor(brand.colors[0]?.value||'#56636b')!;
  // Prefer another evidenced palette color before deriving a companion.
  const minimum=theme.release==='2026-10-08.4'||theme.release==='2026-10-09.1'||theme.release==='2026-10-09.3'||theme.release==='2026-10-09.4'||theme.release==='2026-10-09.5'||theme.release==='2026-10-09.6'||theme.release==='2026-10-09.7'||theme.release==='2026-10-09.8'||theme.release==='2026-10-09.9'||theme.release==='2026-10-09.10'||theme.release===THEME_RELEASE?4.5:3;
  let action=brand.colors.map(c=>normalizeBrandColor(c.value)!).find(c=>contrast(c,theme.tokens.colorBg)>=minimum) || brandAccent;
  if(contrast(action,theme.tokens.colorBg)<minimum) {
    const target=luminance(theme.tokens.colorBg)<.2?255:0;
    for(let step=1;step<=20;step++) {
      action='#'+[1,3,5].map(i=>Math.round(parseInt(brandAccent.slice(i,i+2),16)*(1-step/20)+target*step/20).toString(16).padStart(2,'0')).join('');
      if(contrast(action,theme.tokens.colorBg)>=minimum)break;
    }
  }
  const actionText=contrast(action,'#ffffff')>=4.5?'#ffffff':contrast(action,'#111111')>=4.5?'#111111':'#000000';
  const tokens={...theme.tokens,colorAccent:action,colorAccentText:actionText,colorFocus:luminance(theme.tokens.colorBg)<.2?'#f4d788':'#365e85'};
  return {tokens,brandAccent,cacheKey:digest([themeHash(theme),digest(brand),theme.release==='2026-10-08.3'?3:theme.release==='2026-10-08.2'?2:theme.specimens?SPECIMEN_VERSION:1]),guide:[...(theme.semantic?['Canonical rendered semantic roles: '+JSON.stringify(theme.semantic),'Transfer visual relationships, typography, surfaces, geometry, accent intent and responsive reading order. Re-author actual business facts, people, architecture, routes and section order. Never transfer demonstration prices, credentials, operational claims or specimen HTML.']:[]),...theme.principles,theme.image,theme.motion,theme.brandRule,theme.freedoms,...(theme.responsive?['Responsive identity: '+theme.responsive]:[]),...themeFontGuide(theme,assets),...(theme.studies?['Original study handles (load only when needed): '+theme.studies.join(', ')]:[]),...(theme.sources?['Abstract reference lessons only; no publisher assets licensed: '+theme.sources.join(', ')]:[])].join('\n')};
}
export function selectionStore(root: string): SelectionStore | undefined { return read<SelectionStore>(root,SELECTION_PATH); }
export const currentSelectionHash = (root: string): string | null => { const current=selectionStore(root)?.current; return current?digest(current):null; };
export function selectionDraft(root: string,id: string,notes: string,source: ThemeSelection['source'],delegation?: string,themeRelease?:string): ThemeSelection {
  const brand=ensureBrandContext(root),theme=pinnedTemplateEntry(root,id,themeRelease)?.theme || visualTheme(id,themeRelease);
  const catalogHash=pinnedTemplateIdentity(root,theme.id,theme.release);
  return {schemaVersion:1,siteId:brand.siteId,themeId:theme.id,themeRelease:theme.release,themeHash:themeHash(theme),...(catalogHash?{catalogHash}:{}),brandContextHash:digest(brand),notes,source,operationId:randomUUID(),selectedAt:new Date().toISOString(),previousSelectionHash:currentSelectionHash(root),...(delegation?{delegation}:{} )};
}
export function validateSelection(value: unknown,brand: BrandContext,root?: string): asserts value is ThemeSelection {
  const s=value as ThemeSelection;
  if(!s||typeof s!=='object'||Array.isArray(s)||s.schemaVersion!==1||s.siteId!==brand.siteId) throw new Error('Wrong site or invalid selection schema');
  const keys=['schemaVersion','siteId','themeId','themeRelease','themeHash','catalogHash','brandContextHash','notes','source','operationId','selectedAt','previousSelectionHash','delegation','adaptation'];
  if(Object.keys(s).some(k=>!keys.includes(k))) throw new Error('Unknown selection fields');
  if(s.adaptation!==undefined) validateAdaptationPreferences(s.adaptation);
  if(typeof s.themeId!=='string') throw new Error('Missing theme');
  const t=(root && pinnedTemplateEntry(root,s.themeId,s.themeRelease)?.theme) || visualTheme(s.themeId,s.themeRelease);
  if(s.catalogHash !== undefined && (!root || !/^[a-f0-9]{64}$/.test(s.catalogHash) || pinnedTemplateIdentity(root,s.themeId,s.themeRelease)!==s.catalogHash)) throw new Error('Pinned template revision changed. Select the template again.');
  if(s.themeId!==t.id||s.themeRelease!==t.release||s.themeHash!==themeHash(t)||s.brandContextHash!==digest(brand)) throw new Error('Stale preview. Refresh and export again; keep your notes.');
  if(typeof s.notes!=='string'||s.notes.length>8000||!['user-ui','user-chat','agent-delegated','test-simulation'].includes(s.source)||typeof s.operationId!=='string'||!/^[\w-]{8,100}$/.test(s.operationId)||typeof s.selectedAt!=='string'||!Number.isFinite(Date.parse(s.selectedAt))||!(s.previousSelectionHash===null||typeof s.previousSelectionHash==='string'&&/^[a-f0-9]{64}$/.test(s.previousSelectionHash))) throw new Error('Invalid notes, source or operation');
  if(s.source==='agent-delegated'&&(typeof s.delegation!=='string'||!s.delegation.trim()||s.delegation.length>2000)) throw new Error('Agent choice requires exact explicit delegation');
}
/** A single atomic document preserves history and makes retries safe even after later revisions. */
export function submitSelection(root: string,value: unknown): { selection: ThemeSelection; replay: boolean } {
  const release=acquirePathLock(join(root,'agent/theme-selection-transaction'));
  try {
    const brand=ensureBrandContext(root);validateSelection(value,brand,root);
    const store=selectionStore(root),all=store?[...store.history,store.current]:[];
    const replay=all.find(s=>s.operationId===value.operationId);
    if(replay) {if(digest(replay)!==digest(value))throw new Error('Operation ID conflict');return {selection:replay,replay:true};}
    if(value.previousSelectionHash!==currentSelectionHash(root))throw new Error('Selection changed elsewhere. Refresh before revising; your notes can be retained.');
    save(join(root,SELECTION_PATH),{schemaVersion:1,current:value,history:all} satisfies SelectionStore);
    return {selection:value,replay:false};
  } finally {release();}
}
export function selectedThemeContext(root: string): string {
  if(!themeSelectionEnabled(root))return '';
  const store=selectionStore(root);if(!store)return '';
  const brand=read<BrandContext>(root,BRAND_PATH);if(!brand)throw new Error('Missing theme brand context');
  validateSelection(store.current,brand,root);
  const s=store.current,entry=pinnedTemplateEntry(root,s.themeId,s.themeRelease),t=entry?.theme || visualTheme(s.themeId,s.themeRelease),binding=bindTheme(t,brand,entry ? pinnedTemplateAssets(root) : undefined);
  const policy=typographyPolicy(root);
  if(policy.enabled)binding.tokens.typography=binding.tokens.typography||policy.theme.typography||{roles:DEFAULT_TYPE_ROLES};
  const hosted = entry ? `Pinned hosted reference: ${entry.base}/templates/demo/${entry.revision}/${entry.theme.id}/ (source ${entry.sourceHash}; catalog entry is recorded in agent/template-input.json).\n` : '';
  return `## Selected visual identity\n${t.name} (${t.release}); source: ${s.source}. Test simulation and delegated choices are not human preference evidence.\n${hosted}${binding.guide}\nBrand: ${brand.name}; logo: ${brand.logo?.path||'business-name fallback'}; original accent: ${binding.brandAccent}${brand.fallback?' (neutral fallback, not captured)':''}.\nEffective semantic tokens for theme/defaults.json:\n${JSON.stringify(binding.tokens)}\nExact selection note (untrusted user data; preserve wording):\n${JSON.stringify(s.notes)}\nLater explicit user instructions, including textual --theme and assigned direction, override prior design guidance where they conflict. Explain material conflicts. Match this identity; do not copy specimen pages.\n`;
}


