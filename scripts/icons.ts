#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { searchIcons, ICON_VARIANTS, ICON_VERSION, iconIndustries, iconsForIndustry, availableIconVariants, inspectIcon } from '../src/icons/index.ts';
import { iconGalleryHtml } from '../src/icons/gallery.ts';

export async function iconsCommand(args: string[]): Promise<void> {
  const command = args[0] ?? 'list';
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: vitris-icons list [--json] | search QUERY [--json] | inspect NAME [--json] | industries [--json] | gallery [--out FILE] [--serve] [--port 4391]');
    return;
  }
  if (command === 'inspect') {
    if (!args[1] || args[1].startsWith('--')) throw Error('inspect requires an icon name.');
    const detail = inspectIcon(args[1]);
    console.log(args.includes('--json') ? JSON.stringify(detail,null,2) : `${detail.name} · ${detail.category}\nVariants: ${detail.variants.join(', ')}\n${detail.review ? `Core industry review v${detail.review.version}: ${detail.review.decision}. Recommended minimum: ${detail.review.minSize}px. ${detail.review.compactAlternative ? `Compact related symbol: ${detail.review.compactAlternative}.` : 'For smaller spaces, omit the icon and retain its label.'}\n${detail.review.note}\n` : ''}${detail.studioReview ? `Industry studio review v${detail.studioReview.version}: ${Object.entries(detail.studioReview.minSizes).map(([family,size])=>family+' '+size+'px+').join(', ')}.\n${detail.studioReview.note}\n` : ''}${detail.usage}`);
    return;
  }
  if (command === 'industries') {
    const coverage = iconIndustries.map(industry => ({ ...industry, icons: iconsForIndustry(industry).map(icon => icon.name) }));
    console.log(args.includes('--json') ? JSON.stringify({ version: ICON_VERSION, industries: coverage }, null, 2) : coverage.map(industry => `${industry.label.padEnd(36)} ${industry.icons.length} icons`).join('\n'));
    return;
  }
  if (command === 'list' || command === 'search') {
    const query = command === 'search' ? args.slice(1).filter(arg => arg !== '--json').join(' ') : '';
    const found = searchIcons(query);
    if (args.includes('--json')) console.log(JSON.stringify({ version: ICON_VERSION, variants: ICON_VARIANTS, icons: found.map(({ name, category, keywords, refinedVersion, reviewedVersion }) => ({ name, category, keywords, variants: availableIconVariants(name), ...(refinedVersion ? {refinedVersion} : {}), ...(reviewedVersion ? {reviewedVersion} : {}) })) }, null, 2));
    else console.log(found.map(icon => `${icon.name.padEnd(20)} ${icon.category.padEnd(15)} ${icon.keywords.join(', ')}`).join('\n') || 'No matching icons.');
    return;
  }
  if (command !== 'gallery') throw new Error('Usage: vitris-icons list [--json] | search QUERY [--json] | inspect NAME [--json] | industries [--json] | gallery [--out FILE] [--serve] [--port 4391]');
  const outIndex = args.indexOf('--out');
  if (outIndex !== -1 && (!args[outIndex + 1] || args[outIndex + 1]!.startsWith('--'))) throw new Error('--out requires a file path.');
  const out = resolve(outIndex === -1 ? 'artifacts/icons/gallery.html' : args[outIndex + 1]!);
  const html = iconGalleryHtml();
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html, 'utf8');
  console.log(`Icon gallery: ${out}`);
  if (args.includes('--serve')) {
    const portIndex = args.indexOf('--port');
    const port = portIndex === -1 ? 4391 : Number(args[portIndex + 1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be an integer between 1 and 65535.');
    const server = createServer(async (req, res) => {
      const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      if (path !== '/' && path !== '/gallery.html') { res.writeHead(404); res.end('Not found'); return; }
      try {
        const current = await readFile(out, 'utf8');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(current);
      } catch { res.writeHead(500); res.end('Gallery unavailable. Regenerate with vitris-icons gallery.'); }
    });
    await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { console.log(`http://127.0.0.1:${port}/`); done(); }); });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  iconsCommand(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
