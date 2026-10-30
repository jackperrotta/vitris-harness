import type { Browser } from 'playwright';
import type { ThemeTokens } from '../types.ts';
import { validateTypography } from '../typography.ts';
import { captureTypographyStates, typographyConsistencyFailures } from './browser-typography.ts';
import type { TypographyCapture } from './browser-typography.ts';

/** Every new template revision validates both palettes and every route before catalog mutation. */
export async function verifyTemplateTypography(browser: Browser, theme: ThemeTokens, documents: {path:string; original:string; brand:string}[]): Promise<TypographyCapture[]> {
  const invalid = validateTypography(theme.typography, true);
  if (invalid.length) throw Error(invalid.join('\n'));
  const captures: TypographyCapture[] = [];
  for (const palette of ['original','brand'] as const) {
    const paletteCaptures: TypographyCapture[] = [];
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.route('**/*', route => route.request().method() !== 'GET' || route.request().isNavigationRequest() ? route.abort() : route.continue());
    try {
      const page = await context.newPage();
      for (const width of [375,1080]) for (const document of documents) {
        await page.setViewportSize({width,height:900});
        await page.setContent(document[palette], {waitUntil:'load'});
        await page.evaluate('document.fonts.ready');
        paletteCaptures.push(...await captureTypographyStates(page,theme,document.path,width));
      }
    } finally { await context.close(); }
    const failures = [...paletteCaptures.flatMap(c=>c.failures.map(f=>`${palette} ${c.path} ${c.width}px ${c.state}: ${f}`)),...typographyConsistencyFailures(paletteCaptures)];
    if (failures.length) throw Error('Template typography verification failed:\n'+failures.join('\n'));
    captures.push(...paletteCaptures.map(c=>({...c,state:`${palette}/${c.state}`})));
  }
  return captures;
}
