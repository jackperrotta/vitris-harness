import { readFileSync, existsSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { auditTransfer } from './checks.ts';
import type { QualityFinding } from './contracts.ts';

type Asset = { path: string; bytes: Buffer; inline?: boolean };
type Page = { path: string; html: string };
type Node = DefaultTreeAdapterMap['node'];
const assetType = /\.(?:m?js|css|woff2?|ttf|otf)$/i;

/** Budgets apply to a page's delivery graph, not the sum of every site's route. */
export function pageTransferAssets(dist: string, page: Page, publicOrigin?: string): Asset[] {
  const base = new URL(publicOrigin || 'https://vitris.invalid');
  const pageUrl = new URL('/' + relative(dist, page.path).replaceAll('\\', '/'), base);
  const resources = new Map<string, Asset>();
  const inlineCss: string[] = [], inlineJs: string[] = [];
  function localFile(ref: string, owner: URL): string | undefined {
    let url: URL;
    try { url = new URL(ref, owner); } catch { return; }
    if (url.origin !== base.origin || !/^https?:$/.test(url.protocol)) return;
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); } catch { return; }
    const file = resolve(dist, '.' + pathname), rel = relative(resolve(dist), file);
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || !assetType.test(file)) return;
    return file;
  }
  function cssReferences(css: string, owner: URL): void {
    const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)|@import\s+["']([^"']+)["']/gi)) {
      add(match[1] ?? match[2] ?? match[3] ?? match[4]!, owner);
    }
  }
  function add(ref: string, owner: URL): void {
    const file = localFile(ref, owner);
    if (!file || resources.has(file)) return;
    // Missing references are independently rejected by the build/browser gates.
    // Do not substitute an unrelated file or read beyond the output directory.
    if (!existsSync(file) || !statSync(file).isFile()) return;
    const asset = { path: file, bytes: readFileSync(file) };
    resources.set(file, asset);
    if (/\.css$/i.test(file)) cssReferences(Buffer.from(asset.bytes).toString('utf8'), new URL(ref, owner));
  }
  function walk(node: Node): void {
    if ('tagName' in node) {
      if (node.tagName === 'template' || node.tagName === 'noscript') return;
      const attrs = Object.fromEntries(node.attrs.map(a => [a.name, a.value]));
      const text = ('childNodes' in node ? node.childNodes : []).map(c => 'value' in c ? c.value : '').join('');
      if (node.tagName === 'script') {
        if (attrs.src) add(attrs.src, pageUrl);
        else if (!attrs.type || /^(?:module|(?:text|application)\/javascript)$/i.test(attrs.type)) inlineJs.push(text);
      }
      if (node.tagName === 'link' && /(?:^|\s)(?:stylesheet|modulepreload|preload)(?:\s|$)/i.test(attrs.rel || '') && attrs.href) add(attrs.href, pageUrl);
      if (node.tagName === 'style') { inlineCss.push(text); cssReferences(text, pageUrl); }
      if (attrs.style) { inlineCss.push(attrs.style); cssReferences(attrs.style, pageUrl); }
    }
    if ('childNodes' in node) for (const child of node.childNodes) walk(child);
  }
  walk(parse(page.html));
  // The compiler emits self-contained page scripts. CSS imports/font URLs are
  // followed above; unrelated pages and click-loaded icon JSON are not initial assets.
  return [
    { path: page.path, bytes: Buffer.from(page.html) },
    ...resources.values(),
    ...(inlineCss.length ? [{ path: page.path + '.inline.css', bytes: Buffer.from(inlineCss.join('\n')), inline:true }] : []),
    ...(inlineJs.length ? [{ path: page.path + '.inline.js', bytes: Buffer.from(inlineJs.join('\n')), inline:true }] : []),
  ];
}

export function auditPageTransfers(dist: string, pages: Page[], publicOrigin?: string): QualityFinding[] {
  return pages.flatMap(page => {
    const assets = pageTransferAssets(dist, page, publicOrigin);
    // Inline code contributes to JS/CSS budgets; its transfer is already in HTML.
    const findings = [...auditTransfer(assets).filter(f => f.id !== 'budget-transfer'),
      ...auditTransfer(assets.filter(a => !a.inline)).filter(f => f.id === 'budget-transfer')];
    return findings.map(finding => ({
    ...finding,
    id: finding.id + '-' + relative(dist, page.path).replaceAll('\\', '/').replace(/[^a-z0-9]+/gi, '-'),
    page: page.path,
    evidence: relative(dist, page.path).replaceAll('\\', '/') + ': ' + finding.evidence,
    }));
  });
}
