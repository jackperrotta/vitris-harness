import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { icons, BASE_ICON_VARIANTS, STUDIO_VARIANTS, studioIconNames, iconVariantCount, industryReviewCount, industryIconReviews, industryStudioIconNames } from '../src/icons/index.ts';
import { iconGalleryHtml } from '../src/icons/gallery.ts';

const out = resolve('artifacts/icons');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => requests.push(request.url()));
  await page.setContent(iconGalleryHtml());
  assert.equal(await page.locator('.tile:visible').count(), icons.length);
  await page.screenshot({ path: join(out, 'gallery-desktop.png') });
  await page.locator('#search').fill('faucet plumber');
  assert.equal(await page.locator('.tile:visible').count(), 1);
  await page.locator('.tile:visible').click();
  assert.equal(await page.locator('#selected-name').textContent(), 'faucet');
  assert.match(await page.locator('#markup').inputValue(), /name="faucet"/);
  await page.locator('#search').fill('appointment');
  assert.equal(await page.locator('.tile:visible').count(), 1);
  await page.locator('.tile:visible').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#selected-name').textContent(), 'calendar');
  await page.locator('#search').fill('nothing-here');
  assert.equal(await page.locator('.tile:visible').count(), 0);
  assert.equal(await page.locator('#empty').isVisible(), true);
  await page.locator('#search').fill('');
  await page.locator('#category').selectOption('Trades');
  assert.equal(await page.locator('.tile:visible').count(), 12);
  await page.locator('#category').selectOption('');
  await page.locator('#industry').selectOption('electrical');
  assert.equal(await page.locator('.tile[data-name="solar-panel"]').isVisible(), true);
  assert.equal(await page.locator('.tile[data-name="maternity"]').isVisible(), false);
  await page.locator('#industry').selectOption('medical');
  assert.equal(await page.locator('.tile[data-name="maternity"]').isVisible(), true);
  await page.locator('#industry').selectOption('');
  for (const variant of BASE_ICON_VARIANTS) {
    await page.locator('#variant').selectOption(variant);
    assert.equal(await page.locator('.tile .sample:visible').count(), icons.length);
    assert.equal(await page.locator('#preview svg').getAttribute('data-icon-variant'), variant);
  }
  await page.locator('#palette').selectOption('forest');
  assert.match(await page.locator('#markup').inputValue(), /class="custom-icon"/);
  assert.match(await page.locator('#palette-css').inputValue(), /--icon-secondary-color: #dba53b/);
  const colors = await page.locator('#preview svg').evaluate((svg: any) => ({
    primary: (globalThis as any).getComputedStyle(svg.querySelector('.vitris-icon__primary')).color,
    secondary: (globalThis as any).getComputedStyle(svg.querySelector('.vitris-icon__secondary')).color,
    opacity: (globalThis as any).getComputedStyle(svg.querySelector('.vitris-icon__secondary')).opacity,
  }));
  assert.deepEqual(colors, { primary: 'rgb(39, 93, 67)', secondary: 'rgb(219, 165, 59)', opacity: '1' });
  await page.screenshot({ path: join(out, 'gallery-duotone.png') });
  // Force the permission-denied path: the manual copy fallback must remain usable.
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('No clipboard permission')) }, configurable: true }));
  await page.locator('#copy-tag').click();
  assert.match((await page.locator('#feedback').textContent()) ?? '', /Press Ctrl\+C/);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (globalThis as any).__copiedIcon = text; } }, configurable: true }));
  await page.locator('#copy-svg').click();
  assert.match(await page.evaluate(() => (globalThis as any).__copiedIcon), /--icon-primary-color: #275d43/);
  await page.locator('#copy-css').click();
  assert.match(await page.evaluate(() => (globalThis as any).__copiedIcon), /custom-icon/);
  const downloadPromise = page.waitForEvent('download');
  const downloadName = await page.locator('#selected-name').textContent();
  await page.locator('#download').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), `vitris-${downloadName}-duotone.svg`);
  await download.saveAs(join(out, download.suggestedFilename()));
  await page.locator('#variant').selectOption('compare');
  assert.equal(await page.locator('.tile .sample:visible').count(), icons.length * BASE_ICON_VARIANTS.length);
  for (const size of [16, 24, 48, 64, 32]) {
    await page.locator('#size').evaluate((input: any, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, size);
    assert.equal(await page.locator('.tile[data-name="solar-panel"] .sample[data-family="duotone"] svg').evaluate((svg: any) => svg.getBoundingClientRect().width), size);
  }
  const bounds = await page.locator('.sample:visible svg').evaluateAll(elements => elements.map(element => {
    const svg = element as any, box = svg.getBBox();
    return { name: svg.dataset.vitrisIcon, variant: svg.dataset.iconVariant, x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height };
  }));
  for (const variant of STUDIO_VARIANTS) {
    await page.locator('#variant').selectOption(variant);
    assert.equal(await page.locator('.tile:visible').count(), studioIconNames.length);
    assert.equal(await page.locator('.tile[data-name="excavator"]').isVisible(), false);
    assert.equal(await page.locator('#preview svg').getAttribute('data-icon-variant'), variant);
    bounds.push(...await page.locator('.tile:visible .sample:visible svg').evaluateAll(elements => elements.map(element => {
      const svg = element as any, box = svg.getBBox();
      return { name: svg.dataset.vitrisIcon, variant: svg.dataset.iconVariant, x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height };
    })));
  }
  assert.equal(bounds.length, iconVariantCount);
  await page.locator('#variant').selectOption('compare-studio');
  assert.equal(await page.locator('.tile:visible').count(), studioIconNames.length);
  assert.equal(await page.locator('.tile .sample:visible').count(), studioIconNames.length*STUDIO_VARIANTS.length);
  await page.locator('#palette').selectOption('forest');
  for (const size of [16,24,32,48,64]) {
    await page.locator('#size').evaluate((input:any, value) => { input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true})); },size);
    await page.locator('.tile[data-name="house"]').screenshot({path:join(out,'studio-house-'+size+'.png')});
  }
  await page.locator('#size').evaluate((input:any) => {input.value='32';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('.grid').screenshot({path:join(out,'studio-comparison.png')});
  await page.locator('#revision').selectOption('industry-studio');
  assert.equal(await page.locator('.tile:visible').count(),industryStudioIconNames.length);
  assert.equal(await page.locator('.tile .sample:visible').count(),40);
  assert.equal(await page.locator('#selected-name').textContent(),'solar-panel');
  await page.locator('.tile[data-name="tractor"]').click();
  assert.match((await page.locator('#usage').textContent())??'',/studio v5.*cutout 32px/);
  await page.locator('#variant').selectOption('cutout');
  assert.match((await page.locator('#usage').textContent())??'',/32px for cutout/);
  await page.locator('#size').evaluate((input:any)=>{input.value='24';input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.match((await page.locator('#usage').textContent())??'',/below the recommended minimum/);
  await page.locator('#variant').selectOption('soft');
  assert.match((await page.locator('#usage').textContent())??'',/24px for soft/);
  assert.doesNotMatch((await page.locator('#usage').textContent())??'',/below the recommended minimum/);
  await page.locator('#industry').selectOption('electrical');
  assert.equal(await page.locator('.tile:visible').count(),1);
  assert.equal(await page.locator('#selected-name').textContent(),'solar-panel');
  await page.locator('#industry').selectOption('');
  await page.locator('#variant').selectOption('compare-studio');
  await page.locator('#size').evaluate((input:any)=>{input.value='32';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('.grid').screenshot({path:join(out,'industry-studio-comparison-v5.png')});
  await page.locator('#theme').click();
  assert.equal(await page.locator('#primary-color').inputValue(),'#b5dda5');
  assert.match(await page.locator('#palette-css').inputValue(),/#b5dda5/);
  await page.locator('.grid').screenshot({path:join(out,'industry-studio-dark-v5.png')});
  await page.locator('#theme').click();
  assert.equal(await page.locator('#primary-color').inputValue(),'#275d43');
  // Custom choices stay fixed when the canvas changes.
  await page.locator('#palette').selectOption('custom');
  await page.locator('#theme').click();
  assert.equal(await page.locator('#primary-color').inputValue(),'#275d43');
  await page.locator('#theme').click();
  await page.locator('#palette').selectOption('forest');
  for(const width of [320,390]) {
    await page.setViewportSize({width,height:844});
    await page.locator('#size').evaluate((input:any)=>{input.value='64';input.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await page.evaluate(()=>(globalThis as any).document.documentElement.scrollWidth>(globalThis as any).innerWidth),false,`Studio comparison must wrap at ${width}px`);
  }
  await page.screenshot({path:join(out,'industry-studio-mobile-v5.png')});
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#size').evaluate((input:any)=>{input.value='32';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#revision').selectOption('');
  await page.locator('#variant').selectOption('regular');
  await page.locator('#revision').selectOption('refined');
  assert.equal(await page.locator('.tile:visible').count(), icons.filter(icon=>icon.refinedVersion).length);
  await page.locator('#category').selectOption('Excavation');
  assert.equal(await page.locator('.tile:visible').count(), 4);
  await page.locator('.grid').screenshot({path:join(out,'refined-excavation.png')});
  await page.locator('#category').selectOption('');
  await page.locator('#revision').selectOption('reviewed');
  assert.equal(await page.locator('.tile:visible').count(),industryReviewCount);
  await page.locator('#variant').selectOption('compare');
  await page.screenshot({path:join(out,'industry-reviewed-v4.png')});
  await page.locator('#revision').selectOption('redrawn');
  assert.equal(await page.locator('.tile:visible').count(),Object.values(industryIconReviews).filter(review=>review.decision==='redrawn').length);
  await page.locator('.tile[data-name="croissant"]').click();
  assert.match((await page.locator('#usage').textContent())??'',/redrawn.*24px.*curved crescent/);
  await page.locator('#size').evaluate((input:any)=>{input.value='16';input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.match((await page.locator('#usage').textContent())??'',/below the recommended minimum/);
  await page.locator('#size').evaluate((input:any)=>{input.value='32';input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.doesNotMatch((await page.locator('#usage').textContent())??'',/below the recommended minimum/);
  await page.screenshot({path:join(out,'industry-redrawn-v4.png')});
  await page.locator('#revision').selectOption('');
  await page.locator('#variant').selectOption('compare');
  assert.deepEqual(bounds.filter(box => box.x < 0 || box.y < 0 || box.right > 24 || box.bottom > 24), [], 'Drawing geometry must remain within the viewBox');
  // Also account for the widest outline stroke after the optical inset.
  assert.deepEqual(bounds.filter(box => ['light', 'regular'].includes(box.variant!) && (box.x < .81 || box.y < .81 || box.right > 23.19 || box.bottom > 23.19)), [], 'Outline strokes must not clip');
  assert.deepEqual(bounds.filter(box => ['soft', 'sketch'].includes(box.variant!) && (box.x < 1.26 || box.y < 1.26 || box.right > 22.74 || box.bottom > 22.74)), [], 'Studio strokes must not clip');
  await page.locator('#palette').selectOption('tonal');
  await page.locator('#theme').click();
  assert.equal(await page.locator('#theme').getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: join(out, 'gallery-compare-dark.png') });
  await page.locator('#theme').click();
  const categories = [...new Set(icons.map(icon => icon.category))];
  for (let start = 0; start < categories.length; start += 3) {
    const group = categories.slice(start, start + 3);
    await page.locator('.tile').evaluateAll((elements, group) => elements.forEach(element => { (element as any).hidden = !group.includes((element as any).dataset.category!); }), group);
    await page.evaluate(() => (globalThis as any).scrollTo(0, 0));
    await page.locator('.grid').screenshot({ path: join(out, `contact-sheet-${start / 3 + 1}.png`) });
  }
  await page.locator('#category').selectOption('');
  await page.locator('#variant').selectOption('regular');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => (globalThis as any).document.documentElement.scrollWidth > (globalThis as any).innerWidth), false, `No horizontal overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(out, 'gallery-mobile.png') });
  await page.locator('#search').fill('mail');
  await page.locator('.tile[data-name="mail"]').click();
  assert.equal(await page.locator('#selected-name').textContent(), 'mail');
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, [], 'Gallery must not fetch external resources');
  const report = { ok: true, engine: 'Chromium', icons: icons.length, variants: bounds.length, checked: ['search', 'category and industry filters', 'duotone colors and exported palette', 'keyboard selection', 'style switching and per-icon availability', 'five original studio families', 'revision filtering', '16/24/32/48/64px sizes', 'copy and fallback', 'SVG download', 'light/dark', 'geometry and stroke bounds', '320/390px reflow', 'zero network requests'], errors, bounds };
  await writeFile(join(out, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Verified ${icons.length} icons / ${bounds.length} variants; report: ${join(out, 'browser-report.json')}`);
} finally { await browser.close(); }
