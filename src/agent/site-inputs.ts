import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { save } from './artifacts.ts';
import { CLOUD_CATALOG } from './theme-cloud.ts';
import type { CloudEntry } from './theme-cloud.ts';
import { catalogEntryHash, fetchTemplateCatalog, pinnedTemplateEntry, type TemplateCatalog } from './template-catalog.ts';
import { visualTheme } from './theme-library.ts';
import { currentSelectionHash, selectionDraft, selectionStore, submitSelection } from './theme-selection.ts';
import { hasActiveStageLease, withMutationLock } from './preparation.ts';
import type { AdaptationPreferences } from './template-adaptation.ts';

export const ADDITIONAL_CONTENT_PATH = 'onboarding/additional-content.md';
export const TEMPLATE_INPUT_PATH = 'agent/template-input.json';
export type SiteInputOptions = { template?: string; templateRelease?: string; content?: string; contentFile?: string };
export type TemplateInput = { version: 1; id: string; release: string; instruction: string; catalogEntry?: CloudEntry; catalogHash?: string; catalogAssets?: NonNullable<TemplateCatalog['assets']>; catalogAssetsHash?: string };
export type ResolvedSiteInputs = { template?: TemplateInput; content?: string };

export function additionalContentGuidance(root: string): string {
  return existsSync(join(root, ADDITIONAL_CONTENT_PATH))
    ? `\n## Supplied business content\nRead ${ADDITIONAL_CONTENT_PATH} in full. Preserve the user's wording and use this supplied material alongside harvested source evidence for business facts, narrative, copy, routes, and media requirements. Explicit corrections take precedence over older source copy. Keep unsupported claims and missing content visible as drafts; never substitute fictional template facts.\n`
    : '';
}

/** Resolve and validate everything before scaffolding or mutating a site. */
export function resolveSiteInputs(opts: SiteInputOptions, catalog: TemplateCatalog = CLOUD_CATALOG): ResolvedSiteInputs {
  if (opts.templateRelease && !opts.template) throw Error('--template-release requires --template');
  if (opts.content !== undefined && opts.contentFile !== undefined) throw Error('Use either --content or --content-file, not both');
  const content = opts.contentFile !== undefined ? readFileSync(resolve(opts.contentFile), 'utf8') : opts.content;
  if (content !== undefined && (!content.trim() || Buffer.byteLength(content, 'utf8') > 256_000)) throw Error('Additional content must be nonempty and at most 256 KB');
  let template: TemplateInput | undefined;
  if (opts.template !== undefined) {
    const input = opts.template.trim();
    if (!input) throw Error('--template requires a catalog ID, name, or hosted template URL');
    let id = input, release = opts.templateRelease;
    if (/^https?:\/\//i.test(input)) {
      const url = new URL(input);
      if (url.username || url.password) throw Error('Template URLs cannot contain credentials');
      const requested = url.origin + url.pathname.replace(/\/+$/, '');
      const entry = [...catalog.entries, ...(catalog.history || [])].find(e => {
        const base = e.base.replace(/\/+$/, '');
        return e.pages.some(p => requested === (base + `/templates/demo/${e.revision}/${e.theme.id}` + p.path).replace(/\/+$/, ''))
          || e.pages.some(p => requested.startsWith(base + `/templates/preview/${e.revision}/${e.theme.id}/${p.pageId}/`));
      });
      if (!entry) throw Error('Unknown hosted template URL; use a catalog template ID or name');
      id = entry.theme.id;
      if (release && release !== entry.theme.release) throw Error('Template URL and --template-release refer to different revisions');
      release = entry.theme.release;
    }
    const entry = [...catalog.entries, ...(catalog.history || [])].find(e => (e.theme.id === id || e.theme.name.toLowerCase() === id.toLowerCase()) && (!release || e.theme.release === release));
    const theme = entry?.theme || visualTheme(id, release);
    const assets = entry ? (catalog.assets || []).filter(a => (entry.theme.fontAssets || []).some(f => typeof f === 'string' ? f === a.id : f.file === a.file && f.sha256 === a.sha256)) : [];
    template = { version: 1, id: theme.id, release: theme.release, instruction: opts.template, ...(entry ? { catalogEntry: entry, catalogHash: catalogEntryHash(entry), catalogAssets: assets, catalogAssetsHash: createHash('sha256').update(JSON.stringify(assets)).digest('hex') } : {}) };
  }
  return { template, content };
}

/** Prefer the same hosted catalog as the gallery. The bundled snapshot is an explicit offline fallback. */
export async function resolveSiteInputsLive(opts: SiteInputOptions, fetcher: typeof fetch = fetch): Promise<ResolvedSiteInputs> {
  if (opts.template === undefined) return resolveSiteInputs(opts);
  let catalog: TemplateCatalog;
  try { catalog = await fetchTemplateCatalog(fetcher); }
  catch (error) {
    console.warn(`Hosted template catalog unavailable; using the bundled snapshot, which may be stale: ${error instanceof Error ? error.message : String(error)}`);
    return resolveSiteInputs(opts);
  }
  return resolveSiteInputs(opts, catalog);
}

export function persistSiteInputs(root: string, inputs: ResolvedSiteInputs): void {
  if (!inputs.template && inputs.content === undefined) return;
  withMutationLock(root, () => {
    if (hasActiveStageLease(root).held || existsSync(join(root, 'agent/RUN.lock'))) throw Error('Finish or cancel the active workflow stage before changing template or content inputs');
    const path = join(root, 'launch.json');
    const launch = JSON.parse(readFileSync(path, 'utf8'));
    if (launch.mode === 'preserve') throw Error('Template and additional content inputs require redesign mode');
    if (inputs.template) {
      const inputPath = join(root, TEMPLATE_INPUT_PATH);
      const prior = existsSync(inputPath) ? JSON.parse(readFileSync(inputPath, 'utf8')) : undefined;
      const current = selectionStore(root)?.current;
      if (!prior || prior.id !== inputs.template.id || prior.release !== inputs.template.release || prior.instruction !== inputs.template.instruction || prior.catalogHash !== inputs.template.catalogHash || prior.catalogAssetsHash !== inputs.template.catalogAssetsHash
        || current && current.operationId !== prior.operationId && currentSelectionHash(root) !== prior.previousSelectionHash) {
        save(inputPath, { ...inputs.template, operationId: randomUUID(), previousSelectionHash: currentSelectionHash(root) });
      }
      if (launch.themeSelection?.version !== 1 || launch.themeSelection?.enabled !== true || launch.templateAdaptation?.version !== 2) {
        launch.themeSelection = { version: 1, enabled: true };
        launch.templateAdaptation = { version: 2 };
        save(path, launch);
      }
    }
    if (inputs.content !== undefined) writeFileSync(join(root, ADDITIONAL_CONTENT_PATH), inputs.content, 'utf8');
  });
}

/** Materialize only after harvest and media, so branding uses real captured evidence. */
export function acceptTemplateInput(root: string): void {
  if (!existsSync(join(root, TEMPLATE_INPUT_PATH))) return;
  const input = JSON.parse(readFileSync(join(root, TEMPLATE_INPUT_PATH), 'utf8')) as TemplateInput & {operationId: string; previousSelectionHash: string | null};
  if (!input || input.version !== 1 || typeof input.instruction !== 'string' || !input.instruction.trim() || !/^[\w-]{8,100}$/.test(input.operationId)
    || !(input.previousSelectionHash === null || typeof input.previousSelectionHash === 'string' && /^[a-f0-9]{64}$/.test(input.previousSelectionHash))) throw Error('Invalid direct template input');
  const theme = pinnedTemplateEntry(root, input.id, input.release)?.theme || visualTheme(input.id, input.release);
  const current = selectionStore(root)?.current;
  // A later picker/chat choice wins. Repeating the CLI request is idempotent.
  const notes = `Direct template input: ${JSON.stringify(input.instruction)}. Build through local preview automatically; retain quality checks.`;
  if (current?.operationId === input.operationId || currentSelectionHash(root) !== input.previousSelectionHash) return;
  if (hasActiveStageLease(root).held) throw Error('Finish or cancel the active stage before accepting a template input');
  const selection = selectionDraft(root, theme.id, notes, 'user-chat', undefined, theme.release);
  selection.operationId = input.operationId;
  selection.adaptation = {
    version: 1, sections: 'agent-decides', aiImages: 'no-ai', checkpoints: 'automatic',
    priorities: 'Use the selected template and the source website plus onboarding/additional-content.md. Preserve defining visual relationships; leave unsupported missing content as visible fill-ins. Continue through the reviewed local preview without asking for picker, content-gap, or representative feedback decisions. Do not claim human design approval.',
  } satisfies AdaptationPreferences;
  submitSelection(root, selection);
}

export function siteInputsFromArgv(argv: string[]): SiteInputOptions {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    if (i < 0) return undefined;
    if (!argv[i + 1] || argv[i + 1]!.startsWith('--')) throw Error(flag + ' requires a value');
    return argv[i + 1];
  };
  return { template: value('--template'), templateRelease: value('--template-release'), content: value('--content'), contentFile: value('--content-file') };
}

export function siteInputsFromFlags(flags: Record<string, string | boolean>): SiteInputOptions {
  const value = (key: string) => {
    if (flags[key] === undefined) return undefined;
    if (typeof flags[key] !== 'string') throw Error('--' + key + ' requires a value');
    return flags[key] as string;
  };
  return { template: value('template'), templateRelease: value('template-release'), content: value('content'), contentFile: value('content-file') };
}
