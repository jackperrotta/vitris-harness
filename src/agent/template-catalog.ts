import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLOUD_CATALOG, type CloudEntry } from './theme-cloud.ts';

export type TemplateCatalog = { version: number; origin: string; entries: CloudEntry[]; history?: CloudEntry[]; assets?: Array<{id?:string;file:string;sha256:string;url?:string;licenseUrl?:string}> };
export const catalogEntryHash = (entry: CloudEntry) => createHash('sha256').update(JSON.stringify(entry)).digest('hex');

export function validateCatalog(value: unknown): asserts value is TemplateCatalog {
  const catalog = value as TemplateCatalog;
  if (!catalog || catalog.version !== 1 || catalog.origin !== CLOUD_CATALOG.origin || !Array.isArray(catalog.entries) || (catalog.history !== undefined && !Array.isArray(catalog.history))) throw Error('Invalid hosted template catalog');
  for (const entry of [...catalog.entries, ...(catalog.history || [])]) {
    if (!entry || entry.base !== catalog.origin || !/^[a-z0-9-]+$/.test(entry.theme?.id || '') || !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(entry.theme?.release || '') || !/^[a-f0-9]{64}$/.test(entry.revision || '') || !/^[a-f0-9]{64}$/.test(entry.sourceHash || '') || !entry.theme.tokens || !Array.isArray(entry.pages) || !entry.pages.length || entry.pages.some(p => !/^[\w-]+$/.test(p.pageId || '') || !p.path?.startsWith('/') || p.path.includes('..'))) throw Error('Invalid hosted template entry');
  }
}

export function pinnedTemplateEntry(root: string, id: string, release?: string): CloudEntry | undefined {
  const file = join(root, 'agent/template-input.json');
  if (!existsSync(file)) return;
  const input = JSON.parse(readFileSync(file, 'utf8')) as { id?: string; release?: string; catalogEntry?: CloudEntry; catalogHash?: string };
  if (!input.catalogEntry || input.id !== id || (release && input.release !== release)) return;
  validateCatalog({ version: 1, origin: CLOUD_CATALOG.origin, entries: [input.catalogEntry] });
  if (input.catalogEntry.theme.id !== input.id || input.catalogEntry.theme.release !== input.release || catalogEntryHash(input.catalogEntry) !== input.catalogHash) throw Error('Pinned template catalog entry has changed; select the template again');
  return input.catalogEntry;
}

export function pinnedTemplateAssets(root: string): NonNullable<TemplateCatalog['assets']> {
  const file = join(root, 'agent/template-input.json');
  if (!existsSync(file)) return [];
  const input = JSON.parse(readFileSync(file, 'utf8')) as { catalogAssets?: NonNullable<TemplateCatalog['assets']>; catalogAssetsHash?: string };
  if (!input.catalogAssets) return [];
  if (!Array.isArray(input.catalogAssets) || createHash('sha256').update(JSON.stringify(input.catalogAssets)).digest('hex') !== input.catalogAssetsHash || input.catalogAssets.some(asset => !asset.file || !/^[a-f0-9]{64}$/.test(asset.sha256) || [asset.url,asset.licenseUrl].some(url => url !== undefined && !url.startsWith(`${CLOUD_CATALOG.origin}/templates/`)))) throw Error('Pinned template assets have changed or are invalid');
  return input.catalogAssets;
}

export function pinnedTemplateIdentity(root: string, id: string, release?: string): string | undefined {
  const entry = pinnedTemplateEntry(root, id, release);
  if (!entry) return;
  return createHash('sha256').update(JSON.stringify({ entry, assets: pinnedTemplateAssets(root) })).digest('hex');
}

export async function fetchTemplateCatalog(fetcher: typeof fetch = fetch): Promise<TemplateCatalog> {
  const response = await fetcher(`${CLOUD_CATALOG.origin}/templates/catalog.json`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!response.ok) throw Error(`Hosted template catalog returned ${response.status}`);
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > 12_000_000) throw Error('Hosted template catalog exceeds size limit');
  const catalog: unknown = JSON.parse(body);
  validateCatalog(catalog);
  return catalog;
}
