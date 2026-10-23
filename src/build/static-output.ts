import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { files, within } from '../agent/artifacts.ts';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { escapeHtml } from '../html.ts';

const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
/** Apply delivery rules after public assets have been copied, without changing authored source. */
export function finalizeStaticOutput(dist: string, publicOrigin?: string): void {
  mkdirSync(join(dist, 'assets/immutable'), { recursive: true });
  if (!existsSync(join(dist, '404.html'))) writeFileSync(join(dist, '404.html'), existsSync(join(dist, '404/index.html')) ? readFileSync(join(dist, '404/index.html')) : '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>Page not found</title></head><body><main><h1>Page not found</h1><p>This address is unavailable.</p><a href="/">Return home</a></main></body></html>');
  const mapped = new Map<string, string>();
  const immutable = new Set<string>();
  for (const file of files(dist).filter(f => f.endsWith('.css'))) {
    let css = readFileSync(file, 'utf8');
    css = css.replace(/url\(\s*(["']?)data:(?:font\/woff2?|application\/(?:font-woff|x-font-woff));base64,([a-z0-9+/=\s]+)\1\s*\)/gi, (match, _quote: string, encoded: string) => {
      const bytes = Buffer.from(encoded.replace(/\s/g, ''), 'base64');
      const signature = bytes.subarray(0, 4).toString();
      if (!['wOF2', 'wOFF'].includes(signature)) return match;
      const url = `/assets/immutable/${digest(bytes)}.${signature === 'wOF2' ? 'woff2' : 'woff'}`;
      mkdirSync(join(dist, 'assets/immutable'), { recursive: true }); writeFileSync(join(dist, url.slice(1)), bytes); immutable.add(url);
      return `url("${url}")`;
    });
    // A CSS file in assets/ may contain root-relative or relative authored media URLs.
    // Route CSS is emitted there, so preserve the original site-root URL base.
    if (dirname(file) === join(dist, 'assets/immutable')) css = css.replace(/url\(\s*(["']?)(?![a-z]+:|\/|#)([^)'"\s]+)\1\s*\)/gi, (_m, _q, url) => `url("/${url}")`);
    css = css.replace(/url\(\s*(["']?)([^)'"\s]+\.woff2?)\1\s*\)/gi, (match, _q, url: string) => {
      if (/^(?:[a-z]+:|\/\/)/i.test(url)) return match;
      const path = within(dist, url.startsWith('/') ? url.slice(1) : join(relative(dist, dirname(file)), url));
      if (!existsSync(path)) return match;
      const bytes = readFileSync(path), next = `/assets/immutable/${digest(bytes)}.${url.split('.').at(-1)}`;
      writeFileSync(join(dist, next.slice(1)), bytes); immutable.add(next);
      return `url("${next}")`;
    });
    css = css.replace(/@font-face\s*\{[^}]*\}/gi, rule => /font-display\s*:/.test(rule) ? rule : rule.slice(0, -1) + ';font-display:swap}');
    writeFileSync(file, css);
    // Keep the old path as a compatibility alias; only hashed references get immutable caching.
    const rel = '/' + relative(dist, file).replaceAll('\\', '/');
    const next = `/assets/immutable/${digest(css)}.css`;
    writeFileSync(join(dist, next.slice(1)), css); mapped.set(rel, next); immutable.add(next);
    if (rel !== next && /^\/assets\/immutable\/[a-f0-9]{64}\.css$/.test(rel)) unlinkSync(file);
  }
  for (const name of ['islands.js', 'beacon.js']) {
    if (!existsSync(join(dist, name))) continue;
    const bytes = readFileSync(join(dist, name)), url = `/assets/immutable/${digest(bytes)}.js`;
    writeFileSync(join(dist, url.slice(1)), bytes); mapped.set('/' + name, url); immutable.add(url);
  }
  for (const file of files(dist)) {
    const rel = '/' + relative(dist, file).replaceAll('\\', '/');
    if (/^\/assets\/immutable\/[a-f0-9]{64}\.js$/.test(rel)) immutable.add(rel);
  }
  const routes = new Set(files(dist).filter(f => f.endsWith('index.html')).map(f => '/' + relative(dist, f).replaceAll('\\', '/').replace(/index\.html$/, '')));
  for (const file of files(dist).filter(f => f.endsWith('.html'))) {
    let html = readFileSync(file, 'utf8');
    for (const [old, next] of mapped) html = html.replaceAll(`"${old}"`, `"${next}"`).replaceAll(`'${old}'`, `'${next}'`);
    const edits: { start: number; end: number; value: string }[] = [];
    let hasIcon = false;
    const walk = (node: DefaultTreeAdapterMap['node']) => {
      if ('tagName' in node) {
        if (node.tagName === 'link' && node.attrs.find(a => a.name === 'rel')?.value.toLowerCase().split(/\s+/).includes('icon')) hasIcon = true;
        const href = node.attrs.find(a => a.name === 'href');
        const location = node.sourceCodeLocation?.attrs?.href;
        if (href && location) {
          try {
            const base = publicOrigin || 'https://vitris.invalid';
            const route = '/' + relative(dist, file).replaceAll('\\', '/').replace(/index\.html$/, '');
            const url = new URL(href.value, base + route);
            if (url.origin === new URL(base).origin && routes.has(url.pathname.replace(/\/$/, '') + '/') && url.pathname !== '/' && !url.pathname.endsWith('/')) {
              const value = href.value.startsWith('http') ? url.origin + url.pathname + '/' + url.search + url.hash : url.pathname + '/' + url.search + url.hash;
              edits.push({ start: location.startOffset, end: location.endOffset, value: `href="${escapeHtml(value)}"` });
            }
          } catch { /* Non-HTTP hrefs and malformed author input remain visible to validation. */ }
        }
      }
      if ('childNodes' in node) node.childNodes.forEach(walk);
    };
    walk(parse(html, { sourceCodeLocationInfo: true }));
    for (const edit of edits.sort((a, b) => b.start - a.start)) html = html.slice(0, edit.start) + edit.value + html.slice(edit.end);
    if (!hasIcon) {
      const icon = existsSync(join(dist, 'favicon.ico')) ? '/favicon.ico' : '/favicon.svg';
      if (!existsSync(join(dist, icon.slice(1)))) writeFileSync(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#20252c"/><g fill="none" stroke="#fff" stroke-width="3"><circle cx="32" cy="32" r="20"/><ellipse cx="32" cy="32" rx="9" ry="20"/><path d="M12 32h40M16 21h32M16 43h32"/></g></svg>');
      html = html.replace(/<\/head\s*>/i, `<link rel="icon" href="${icon}" type="${icon.endsWith('.ico') ? 'image/x-icon' : 'image/svg+xml'}"></head>`);
    }
    writeFileSync(file, html);
  }
  const sitemap = join(dist, 'sitemap.xml');
  if (existsSync(sitemap)) writeFileSync(sitemap, readFileSync(sitemap, 'utf8').replace(/<loc>([^<]+)<\/loc>/g, (_m, loc: string) => {
    const path = publicOrigin && loc.startsWith(publicOrigin.replace(/\/$/, '')) ? loc.slice(publicOrigin.replace(/\/$/, '').length) : loc;
    return `<loc>${loc}${path !== '/' && routes.has(path.replace(/\/$/, '') + '/') && !loc.endsWith('/') ? '/' : ''}</loc>`;
  }));
  const headersPath = join(dist, '_headers');
  const headers = existsSync(headersPath) ? readFileSync(headersPath, 'utf8') : '';
  writeFileSync(headersPath, headers + '\n# Vitris content-addressed build assets\n/assets/immutable/*\n  Cache-Control: public, max-age=31536000, immutable\n/media/optimized/*\n  Cache-Control: public, max-age=31536000, immutable\n');
}
