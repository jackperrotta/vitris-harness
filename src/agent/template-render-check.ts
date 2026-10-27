import type { Page } from 'playwright';
import type { TemplateAdaptation } from './template-adaptation.ts';
declare function getComputedStyle(element: any): any;

export async function checkTemplateSections(page: Page, route: string, sections: TemplateAdaptation['sections']): Promise<string[]> {
  const failures: string[] = [];
  for (const section of sections) {
    if (section.disposition === 'remove' || section.route !== route) continue;
    const target = page.locator(`[id=${JSON.stringify(section.targetId)}]`);
    const count = await target.count();
    const opaque = async (locator: ReturnType<Page['locator']>) => locator.evaluate((element: any) => {
      for (let node = element; node; node = node.parentElement) if (Number(getComputedStyle(node).opacity) <= 0) return false;
      return true;
    });
    if (count !== 1 || !await target.first().isVisible() || !await opaque(target.first())) {
      failures.push(`Template section ${section.id} must have one visible target on ${route}`);
      continue;
    }
    if (section.content !== 'ready') {
      const gapSelector = `[data-content-gap=${JSON.stringify(section.id)}]`;
      const gap = page.locator(`[id=${JSON.stringify(section.targetId)}]${gapSelector}, [id=${JSON.stringify(section.targetId)}] ${gapSelector}`);
      if (await gap.count() !== 1 || !await gap.first().isVisible() || !await opaque(gap.first()) || !(await gap.first().innerText()).trim()) failures.push(`Template content gap ${section.id} must be visible and readable`);
    }
  }
  return failures;
}
