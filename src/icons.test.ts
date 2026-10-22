import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { parseFragment } from 'parse5';
import { createHash } from 'node:crypto';
import { industryIcons } from './icons/industry.ts';
import { industryIconReviews, inspectIcon, industryStudioIconNames, industryStudioReviews, coreStudioIconNames } from './icons/index.ts';
import { icons, iconNames, ICON_VARIANTS, getIcon, renderIcon, searchIcons, iconCss, availableIconVariants, iconVariantCount, STUDIO_VARIANTS, studioIconNames, iconIndustries, iconsForIndustry, findIconIndustry } from './icons/index.ts';
import { iconGalleryHtml } from './icons/gallery.ts';
import { compileIcons } from './compile/icons.ts';
import { compilePage, siteCss, siteIslands } from './compile/site.ts';
import { buildSite } from './build/index.ts';
import type { Catalog } from './types.ts';

test('original catalog is complete, searchable, and limited to passive geometry', () => {
  assert.equal(icons.length, 381);
  assert.equal(new Set(iconNames).size, icons.length);
  assert.equal(new Set(icons.map(icon => icon.category)).size, 40);
  assert.equal(getIcon('email')?.name, 'mail');
  assert.equal(getIcon('toString'), undefined);
  assert.equal(getIcon('__proto__'), undefined);
  assert.ok(searchIcons('plumber').some(icon => icon.name === 'pipe'));
  assert.ok(searchIcons('appointment').some(icon => icon.name === 'calendar'));
  assert.equal(searchIcons('nonexistent query').length, 0);
  for (const icon of icons) {
    assert.match(icon.name, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(icon.keywords.length > 0);
    for (const variant of availableIconVariants(icon.name)) {
      const svg = renderIcon(icon.name, { variant });
      assert.doesNotMatch(svg, /<(?:script|style|image|foreignObject|use|text)\b|\s(?:href|id|on\w+)=/);
      const root = parseFragment(svg).childNodes[0];
      assert.ok(root && 'tagName' in root && root.tagName === 'svg');
      assert.ok(root.childNodes.length > 0);
      const group = root.childNodes[0];
      assert.ok(group && 'tagName' in group && group.tagName === 'g');
      assert.ok(group.childNodes.length > 0);
      const passive = (node: typeof group): boolean => 'tagName' in node && ['g', 'path', 'rect', 'circle'].includes(node.tagName) && (!('childNodes' in node) || node.childNodes.every(child => passive(child as typeof group)));
      assert.ok(group.childNodes.every(child => passive(child as typeof group)));
      if (variant === 'duotone') {
        assert.ok(icon.duotone.primary && icon.duotone.secondary);
        assert.notEqual(icon.duotone.primary, icon.duotone.secondary);
        assert.match(svg, /class="vitris-icon__secondary"/);
        assert.match(svg, /class="vitris-icon__primary"/);
      }
    }
  }
});


test('studio families use individually authored masters and refuse unsupported combinations', () => {
  assert.equal(coreStudioIconNames.length, 16);
  assert.equal(studioIconNames.length, 24);
  assert.equal(iconVariantCount, 1644);
  for (const name of studioIconNames) {
    const masters = STUDIO_VARIANTS.map(variant => getIcon(name)!.families![variant]);
    assert.equal(new Set(masters).size, STUDIO_VARIANTS.length);
    assert.ok(masters.every(master => master && master !== getIcon(name)!.outline && master !== getIcon(name)!.solid));
    assert.ok(availableIconVariants(name).includes('sketch'));
    for (const variant of STUDIO_VARIANTS) assert.ok(compileIcons('<vitris-icon name="'+name+'" variant="'+variant+'"></vitris-icon>').includes('data-icon-variant="'+variant+'"'));
  }
  assert.throws(() => renderIcon('excavator', {variant:'soft'}), /no authored "soft" master/);
  assert.throws(() => compileIcons('<vitris-icon name="excavator" variant="soft"></vitris-icon>', '/services'), /Icon error on \/services.*no authored/);
  assert.ok(renderIcon('house', { variant:'imprint' }).includes('vitris-icon__secondary'));
});

test('curated industry studio masters have independent reviewed geometry and family-specific sizing', () => {
  assert.equal(industryStudioIconNames.length,8);
  assert.deepEqual(Object.keys(industryStudioReviews).sort(),[...industryStudioIconNames].sort());
  for(const name of industryStudioIconNames) {
    assert.ok(industryIcons.some(icon=>icon.name===name));
    assert.ok(!coreStudioIconNames.includes(name));
    const review=inspectIcon(name).studioReview!;
    assert.equal(review.version,5);
    assert.ok(review.rationale&&review.note);
    for(const family of STUDIO_VARIANTS) {
      assert.equal(createHash('sha256').update(getIcon(name)!.families![family]!).digest('hex'),review.geometrySha256[family],`${name}/${family}: inspect changed master before updating the review`);
      assert.ok([24,32].includes(review.minSizes[family]));
      assert.doesNotMatch(renderIcon(name,{variant:family}),/rationale|geometrySha256|minSizes|studioReview/);
    }
  }
  assert.equal(inspectIcon('tractor').studioReview?.minSizes.cutout,32);
  assert.equal(getIcon('paw')!.refinedVersion,undefined,'Adding studio families must not relabel an unchanged core master as a v3 redraw');
  assert.equal(inspectIcon('excavator').studioReview,null);
});

test('every industry review is bound to the inspected geometry and carries usable selection guidance', () => {
  assert.equal(industryIcons.length,224);
  assert.deepEqual(Object.keys(industryIconReviews).sort(),industryIcons.map(icon=>icon.name).sort());
  assert.equal(Object.values(industryIconReviews).filter(review=>review.decision==='redrawn').length,41);
  for (const original of industryIcons) {
    const icon = getIcon(original.name)!, review = inspectIcon(original.name).review!;
    assert.equal(review.geometrySha256,createHash('sha256').update(JSON.stringify([icon.outline,icon.solid,icon.duotone])).digest('hex'),`${icon.name}: geometry changed after visual review; inspect new renders before updating the record`);
    assert.equal(icon.reviewedVersion,4);
    assert.equal(icon.refinedVersion===4,review.decision==='redrawn',icon.name);
    assert.ok([16,24,32].includes(review.minSize));
    if (review.compactAlternative) {
      assert.ok(getIcon(review.compactAlternative),icon.name);
      assert.notEqual(review.compactAlternative,icon.name);
    } else assert.equal(review.minSize,16);
    assert.ok(review.note.length>50);
    assert.doesNotMatch(renderIcon(icon.name), /geometrySha256|compactAlternative|reviewedVersion/);
  }
  assert.equal(inspectIcon('blueprint').review?.minSize,32);
  assert.equal(inspectIcon('email').name,'mail');
  assert.equal(inspectIcon('house').review,null);
  assert.throws(()=>inspectIcon('nonexistent'),/Unknown Vitris icon/);
});

test('every hosted template industry has curated icon coverage', async () => {
  const catalog = JSON.parse(await readFile(new URL('./agent/theme-cloud.json', import.meta.url), 'utf8'));
  const industries = [...new Set<string>(catalog.entries.flatMap((entry: any) => [entry.industry, ...(entry.browse?.industries ?? [])]).filter(Boolean))];
  assert.deepEqual(industries.filter(industry => !findIconIndustry(industry)), []);
  assert.equal(new Set(iconIndustries.map(industry => industry.id)).size, iconIndustries.length);
  for (const industry of iconIndustries) {
    assert.ok(iconsForIndustry(industry).length >= 8, industry.label);
    assert.ok(industry.categories.every(category => icons.some(icon => icon.category === category)), industry.label);
    assert.ok(industry.extras.every(name => getIcon(name)), industry.label);
  }
  assert.ok(searchIcons('OB-GYN').some(icon => icon.name === 'ultrasound'));
  assert.ok(searchIcons('Data recovery').some(icon => icon.name === 'hard-drive'));
  assert.ok(searchIcons('Home care').some(icon => icon.name === 'home-care'));
});

test('new-build planning, authoring and visual gates load the same icon guidance', async () => {
  const graph = JSON.parse(await readFile(new URL('../agent/graph.yaml',import.meta.url),'utf8'));
  for (const id of ['storyboard','representative','pages','representative-browser','representative-review','browser','visual-review']) {
    assert.ok(graph.nodes.find((node:any)=>node.id===id)?.refs.includes('icons'),id);
  }
});

test('duotone compiles to independently configurable layers with no sprite or runtime', () => {
  const html = compileIcons('<vitris-icon name="solar-panel" variant="duotone" class="energy" aria-label="Solar energy"></vitris-icon>');
  assert.match(html, /fill="currentColor" stroke="none"/);
  assert.match(html, /color:var\(--icon-primary-color,currentColor\)/);
  assert.match(html, /color:var\(--icon-secondary-color,currentColor\)/);
  assert.match(html, /opacity:var\(--icon-secondary-opacity,\.35\)/);
  assert.ok(html.indexOf('vitris-icon__secondary') < html.indexOf('vitris-icon__primary'));
  assert.doesNotMatch(html, /<use|<mask|<script|href=|<style/);
});

test('icons compile safely with labels, decoded entities and useful errors', () => {
  const html = compileIcons('<vitris-icon name="email" variant="solid" class="feature" width="2em" aria-label="Email &amp; help" data-test="yes"></vitris-icon>', '/contact');
  assert.match(html, /data-vitris-icon="mail"/);
  assert.match(html, /class="vitris-icon feature"/);
  assert.match(html, /width="2em"/);
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="Email &amp; help"/);
  assert.match(html, /data-test="yes"/);
  assert.doesNotMatch(html, /aria-hidden/);
  assert.match(compileIcons('<vitris-icon name="phone"></vitris-icon>'), /aria-hidden="true"/);
  assert.match(compileIcons('<vitris-icon name="phone" aria-labelledby="phone-label" aria-describedby="desc"></vitris-icon>'), /aria-labelledby="phone-label" aria-describedby="desc"/);
  for (const source of [
    '<vitris-icon name="unknown"></vitris-icon>',
    '<vitris-icon name="mail" variant="rainbow"></vitris-icon>',
    '<vitris-icon></vitris-icon>', '<vitris-icon name="mail"/>', '<vitris-icon name="mail">',
    '<vitris-icon name="mail">Text</vitris-icon>',
    '<vitris-icon name="mail" onclick="alert(1)"></vitris-icon>',
    '<vitris-icon name="mail" style="color:red"></vitris-icon>',
    '<vitris-icon name="mail" width="url(https://example.com)"></vitris-icon>',
    '<vitris-icon name="mail" aria-hidden="false"></vitris-icon>',
    '<vitris-icon name="mail" aria-label=""></vitris-icon>',
    '<vitris-icon name="mail" aria-label="Mail" aria-hidden="true"></vitris-icon>',
    '<vitris-icon name="mail" aria-label="Mail" aria-labelledby="other"></vitris-icon>',
    '<vitris-icon name="mail" data-vitris-icon="evil"></vitris-icon>',
  ]) assert.throws(() => compileIcons(source, '/contact'), /Icon error on \/contact:/);
});

test('compilation preserves unrelated source and does not replace raw text or comments', () => {
  const before = '<!-- <vitris-icon name="fake"></vitris-icon> -->\n<script>const tag = \'<vitris-icon name="fake"></vitris-icon>\';</script>\n<textarea><vitris-icon name="fake"></vitris-icon></textarea>';
  const html = compileIcons(`${before}\n<template><vitris-icon name="check"></vitris-icon></template><p data-x='preserve'>Keep &#123; me</p>`);
  assert.ok(html.startsWith(before));
  assert.ok(html.endsWith("<p data-x='preserve'>Keep &#123; me</p>"));
  assert.match(html, /<template><svg /);
  assert.equal(compileIcons(before), before);
});

test('page and slotted component icons resolve after expansion with route isolation', () => {
  const catalog: Catalog = { 'site-header': { html: '<header><vitris-icon name="menu"></vitris-icon><slot name="action"></slot></header>', css: '.header{}', island: null } };
  const site = { name: 'Icon test', motion: { strength: 'off' as const } };
  const a = compilePage({ path: '/', file: 'index.html', title: 'Home', body: '<site-header><a slot="action" href="tel:555"><vitris-icon name="phone"></vitris-icon>Call</a></site-header><h1>Home</h1>' }, catalog, site, '');
  const b = compilePage({ path: '/contact', file: 'contact.html', title: 'Contact', body: '<h1>Contact</h1><vitris-icon name="mail"></vitris-icon>' }, catalog, site, '');
  const empty = compilePage({ path: '/plain', file: 'plain.html', title: 'Plain', body: '<h1>Plain</h1>' }, catalog, site, '');
  assert.match(a.bodyHtml, /data-vitris-icon="menu"/);
  assert.match(a.bodyHtml, /data-vitris-icon="phone"/);
  assert.doesNotMatch(a.bodyHtml, /data-vitris-icon="mail"|vitris-icon name=/);
  assert.match(b.bodyHtml, /data-vitris-icon="mail"/);
  assert.doesNotMatch(b.bodyHtml, /data-vitris-icon="phone"|data-vitris-icon="menu"/);
  assert.ok(siteCss([a], catalog).includes(iconCss));
  assert.ok(!siteCss([empty], catalog).includes(iconCss));
  assert.equal(siteIslands([a, b, empty], catalog), '');
});

test('actual build emits only route-used inline geometry and no icon assets or runtime', async () => {
  const out = await mkdtemp(join(tmpdir(), 'vitris-icons-'));
  const files = await buildSite({ outDir: out, site: { name: 'Test', motion: { strength: 'off' } }, theme: {}, catalog: {}, pages: [
    { path: '/', file: 'index.html', title: 'Home', body: '<h1>Home</h1><vitris-icon name="house"></vitris-icon>' },
    { path: '/contact', file: 'contact.html', title: 'Contact', body: '<h1>Contact</h1><vitris-icon name="mail"></vitris-icon>' },
    { path: '/plain', file: 'plain.html', title: 'Plain', body: '<h1>Plain</h1>' },
    { path: '/energy', file: 'energy.html', title: 'Energy', body: '<h1>Energy</h1><vitris-icon name="solar-panel" variant="duotone"></vitris-icon>' },
    { path: '/farm', file: 'farm.html', title: 'Farm', body: '<h1>Farm support</h1><vitris-icon name="tractor" variant="soft"></vitris-icon><vitris-icon name="hands-care" variant="imprint"></vitris-icon>' },
  ] });
  const home = await readFile(join(out, 'index.html'), 'utf8');
  const contact = await readFile(join(out, 'contact/index.html'), 'utf8');
  const plain = await readFile(join(out, 'plain/index.html'), 'utf8');
  const energy = await readFile(join(out, 'energy/index.html'), 'utf8');
  const farm = await readFile(join(out, 'farm/index.html'), 'utf8');
  assert.match(home, /data-vitris-icon="house"/);
  assert.doesNotMatch(home, /data-vitris-icon="mail"|catalog|icons\.js|icons\.svg|vitris-icon name=/);
  assert.match(contact, /data-vitris-icon="mail"/);
  assert.doesNotMatch(contact, /data-vitris-icon="house"/);
  assert.doesNotMatch(plain, /data-vitris-icon/);
  assert.match(energy, /data-vitris-icon="solar-panel"/);
  assert.match(energy, /vitris-icon__primary/);
  assert.doesNotMatch(energy, /data-vitris-icon="house"|data-vitris-icon="mail"|industries|catalog/);
  assert.doesNotMatch(home + contact + plain, /vitris-icon__primary|icon-secondary-color/);
  assert.match(farm,/data-vitris-icon="tractor" data-icon-variant="soft"/);
  assert.match(farm,/data-vitris-icon="hands-care" data-icon-variant="imprint"/);
  assert.doesNotMatch(farm,/data-vitris-icon="solar-panel"|data-icon-variant="block"|geometrySha256|studioReview|catalog|icons\.js/);
  assert.doesNotMatch(home+contact+plain+energy,/data-vitris-icon="tractor"|data-vitris-icon="hands-care"/);
  assert.ok(!files.some(file => /icon|\.svg$/.test(file)));
});

test('gallery contains every production variant and no external dependencies', () => {
  const html = iconGalleryHtml();
  assert.equal((html.match(/class="tile"/g) ?? []).length, icons.length);
  assert.equal((html.match(/data-vitris-icon=/g) ?? []).length, iconVariantCount);
  assert.doesNotMatch(html, /<(?:script|link|img)[^>]+(?:src|href)=/);
  for (const icon of icons) for (const variant of availableIconVariants(icon.name)) assert.ok(html.includes(renderIcon(icon.name, { variant })));
});
