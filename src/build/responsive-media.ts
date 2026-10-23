import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import sharp from 'sharp';
import { files, within } from '../agent/artifacts.ts';
import { escapeHtml } from '../html.ts';

type Element = DefaultTreeAdapterMap['element'];
export type MediaDerivative = { url: string; width: number; height: number; bytes: number; sha256: string };
export type MediaBuildReport = { version: 1; images: { source: string; sha256: string; bytes: number; variants: MediaDerivative[] }[]; warnings: string[] };
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const attr = (el: Element, name: string) => el.attrs.find(a => a.name === name)?.value;
function set(el: Element, name: string, value: string) {
  const old = el.attrs.find(a => a.name === name);
  if (old) old.value = value; else el.attrs.push({ name, value });
}
function elements(node: DefaultTreeAdapterMap['node']): Element[] {
  return [...('tagName' in node ? [node] : []), ...('childNodes' in node ? node.childNodes.flatMap(elements) : []), ...('content' in node ? elements((node as DefaultTreeAdapterMap['template']).content) : [])];
}

/** Build-time only: no remote downloads, origin changes, source mutation, or paid image API. */
export async function responsiveMedia(dist: string, cacheDir: string): Promise<MediaBuildReport> {
  const report: MediaBuildReport = { version: 1, images: [], warnings: [] };
  const generated = new Map<string, MediaDerivative[] | null>();
  for (const file of files(dist).filter(p => p.endsWith('.html'))) {
    let html = readFileSync(file, 'utf8');
    const edits: { start: number; end: number; value: string }[] = [];
    const images = elements(parse(html, { sourceCodeLocationInfo: true })).filter(el => el.tagName === 'img');
    if (images.filter(el => attr(el, 'data-media-priority') === 'critical').length > 1) report.warnings.push(`${relative(dist, file)}: more than one critical image; check mobile/desktop visibility`);
    for (const el of images) {
      const loc = el.sourceCodeLocation?.startTag;
      if (!loc) continue;
      const priority = attr(el, 'data-media-priority');
      if (priority && !['critical', 'deferred', 'auto'].includes(priority)) throw new Error(`Invalid data-media-priority: ${priority}`);
      if (priority === 'critical') { set(el, 'loading', 'eager'); set(el, 'fetchpriority', 'high'); }
      if (priority === 'deferred') { set(el, 'loading', 'lazy'); set(el, 'fetchpriority', 'low'); }
      if (!attr(el, 'decoding')) set(el, 'decoding', 'async');
      const src = attr(el, 'src') || '';
      // Author-supplied picture/srcset and animated/vector assets retain their delivery semantics.
      const picture = el.parentNode && 'tagName' in el.parentNode && el.parentNode.tagName === 'picture';
      if (src && !/^(?:[a-z]+:|\/\/|#)/i.test(src) && /\.(?:jpe?g|png|webp|avif)$/i.test(src) && !attr(el, 'srcset') && !picture && attr(el, 'data-media-optimize') !== 'off') {
        const decoded = decodeURIComponent(src);
        const source = within(dist, decoded.startsWith('/') ? decoded.slice(1) : join(relative(dist, dirname(file)), decoded));
        if (!existsSync(source)) throw new Error(`Missing asset (image): ${src} in ${relative(dist, file)}`);
        const format = attr(el, 'data-media-format') === 'avif' ? 'avif' : 'webp';
        const bytes = readFileSync(source), digest = hash(bytes), key = digest + '-' + format;
        if (!generated.has(key)) {
          const meta = await sharp(bytes, { limitInputPixels: 80_000_000 }).metadata();
          if ((meta.pages || 1) > 1 || !meta.width || !meta.height) generated.set(key, null);
          else {
            const rotated = [5, 6, 7, 8].includes(meta.orientation || 1);
            const width = rotated ? meta.height : meta.width;
            const variants: MediaDerivative[] = [];
            const widths = [...new Set([480, 768, 1280, 1920].filter(w => w < width).concat(Math.min(width, 1920)))];
            for (const w of widths) {
              const cache = join(cacheDir, `v1-sharp-${sharp.versions.sharp}-${key}-${w}`);
              let output: Buffer;
              if (existsSync(cache)) output = readFileSync(cache);
              else {
                const pipeline = sharp(bytes).rotate().resize({ width: w, withoutEnlargement: true });
                output = await (format === 'avif' ? pipeline.avif({ quality: 52, effort: 4 }) : pipeline.webp({ quality: 78, effort: 4 })).toBuffer();
                mkdirSync(cacheDir, { recursive: true }); writeFileSync(cache, output);
              }
              const sha256 = hash(output), url = `/media/optimized/${sha256}.${format}`;
              const dimensions = await sharp(output).metadata();
              mkdirSync(join(dist, 'media/optimized'), { recursive: true }); writeFileSync(join(dist, url.slice(1)), output);
              variants.push({ url, width: dimensions.width!, height: dimensions.height!, bytes: output.length, sha256 });
            }
            generated.set(key, variants);
          }
        }
        const variants = generated.get(key);
        if (variants?.length) {
          const sourceUrl = '/' + relative(dist, source).replaceAll('\\', '/');
          if (!report.images.some(image => image.source === sourceUrl && image.variants[0]?.url === variants[0]?.url)) report.images.push({ source: sourceUrl, sha256: digest, bytes: bytes.length, variants });
          set(el, 'data-media-source', sourceUrl);
          const fallback = variants.find(v => v.width >= 768) || variants.at(-1)!;
          set(el, 'src', fallback.url);
          set(el, 'srcset', variants.map(v => `${v.url} ${v.width}w`).join(', '));
          if (!attr(el, 'sizes')) { set(el, 'sizes', '100vw'); report.warnings.push(`${relative(dist, file)}: ${src} uses conservative sizes=100vw; author gallery/card sizes`); }
          if (!attr(el, 'width') && !attr(el, 'height')) { const largest = variants.at(-1)!; set(el, 'width', String(largest.width)); set(el, 'height', String(largest.height)); }
          if (priority === 'critical' && fallback.bytes > 250 * 1024) report.warnings.push(`${relative(dist, file)}: critical image exceeds 250 KiB at ${fallback.width}px`);
        }
      }
      edits.push({ start: loc.startOffset, end: loc.endOffset, value: '<img' + el.attrs.map(a => ` ${a.name}="${escapeHtml(a.value)}"`).join('') + '>' });
    }
    for (const edit of edits.sort((a, b) => b.start - a.start)) html = html.slice(0, edit.start) + edit.value + html.slice(edit.end);
    writeFileSync(file, html);
  }
  writeFileSync(join(dist, 'media-manifest.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
