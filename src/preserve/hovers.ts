import type {Page} from 'playwright';
export type ButtonHover={index:number;text:string;href:string|null;before:Record<string,string>;hover:Record<string,string>};
/** Observe public visual states without clicking or submitting the original. */
export async function captureButtonHovers(page:Page,selector='.btn'):Promise<ButtonHover[]> {
  const buttons=page.locator(selector),records:ButtonHover[]=[];
  const styles=(el:any)=>{const s=(globalThis as any).getComputedStyle(el);return {color:s.color,'background-color':s.backgroundColor,'border-color':s.borderColor};};
  try{for(let index=0;index<await buttons.count();index++){
    const button=buttons.nth(index);if(!await button.isVisible())continue;
    const before=await button.evaluate(styles);
    await button.hover();await page.waitForTimeout(250);
    const hover=await button.evaluate(styles);
    records.push({index,text:await button.innerText(),href:await button.getAttribute('href'),before,hover});
    await page.mouse.move(-10,-10);await page.waitForTimeout(250);
  }}finally{await page.mouse.move(-10,-10);await page.evaluate(()=>{const {window}=globalThis as any;window.scrollTo(0,0);});}
  return records;
}
