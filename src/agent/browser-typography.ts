import type { Page, Route, Locator } from 'playwright';
import type { ThemeTokens } from '../types.ts';
import { MINIMUM_TYPE_PX, TYPE_ROLES, TYPE_SELECTORS, resolvedTypography } from '../typography.ts';

export const TYPOGRAPHY_SCENARIO = 'typography-v1-2026-10-28';
export type TypeObservation = {
  selector: string; text: string; role: string; variant?: string; size: number; renderedSize: number;
  weight: string; lineHeight: string; tracking: string; family: string;
};
export type TypographyCapture = {
  path: string; width: number; state: string; scenario: string;
  observations: TypeObservation[]; failures: string[];
};

/** A serialized callback keeps browser DOM types out of the Worker/compiler TS program. */
export async function captureTypography(page: Page, theme: Partial<ThemeTokens>, path: string, width: number, state: string): Promise<TypographyCapture> {
  const roles = resolvedTypography(theme);
  const variants = theme.typography?.variants || {};
  const result = await page.evaluate(`(async ({roles,variants,minimum,selectors}) => {
    const failures=[],observations=[];
    await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,5000))]);
    if(document.fonts.status!=='loaded')failures.push('Fonts did not settle before typography measurement');
    const settling=document.getAnimations().filter(a=>a.playState==='running'&&Number.isFinite(a.effect?.getComputedTiming().endTime));
    if(settling.length)await Promise.race([Promise.all(settling.map(a=>a.finished.catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,1000))]);
    const probe=document.createElement('span');
    probe.setAttribute('aria-hidden','true');
    probe.style.cssText='all:initial!important;position:fixed!important;left:-10000px!important;visibility:hidden!important';
    document.body.append(probe);
    const expected={};
    const resolve=(key,style)=>{
      for(const [property,value] of Object.entries({fontSize:style.size,fontWeight:String(style.weight),lineHeight:style.lineHeight,letterSpacing:style.tracking,fontFamily:'var(--font-'+style.font+')'})){
        const cssProperty=property.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
        probe.style.removeProperty(cssProperty);probe.style.setProperty(cssProperty,value,'important');
        if(!probe.style[property])failures.push('Invalid CSS for typography '+key+'.'+property+': '+value);
      }
      const s=getComputedStyle(probe);
      if(!Number.isFinite(parseFloat(s.fontSize))||parseFloat(s.fontSize)<minimum-.001)failures.push('Typography '+key+' resolves below '+minimum+'px');
      return {size:parseFloat(s.fontSize),weight:s.fontWeight,lineHeight:s.lineHeight,tracking:s.letterSpacing,family:s.fontFamily};
    };
    for(const [role,style] of Object.entries(roles))expected[role]=resolve(role,style);
    for(const [name,style] of Object.entries(variants))expected['variant:'+name]=resolve(name,{...roles[style.role],...style});
    const roleFor=e=>{
      for(let a=e;a;a=a.parentElement){
        if(a.hasAttribute('data-type-role'))return a.getAttribute('data-type-role');
        for(const [role,matches] of Object.entries(selectors))if(a.matches(matches.join(',')))return role;
      }
      return 'body';
    };
    const selector=e=>{
      const segments=[];for(let a=e;a&&a!==document.body&&segments.length<5;a=a.parentElement){
        let part=a.tagName.toLowerCase();if(a.id){segments.unshift(part+'#'+CSS.escape(a.id));break;}
        const index=a.parentElement?[...a.parentElement.children].filter(s=>s.tagName===a.tagName).indexOf(a)+1:1;
        part+=[...a.classList].slice(0,2).map(c=>'.'+CSS.escape(c)).join('');segments.unshift(part+':nth-of-type('+index+')');
      }return segments.join(' > ');
    };
    const visible=e=>{
      if(e.closest('script,style,noscript,template')||e===probe)return false;
      if(!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return false;
      const rect=e.getBoundingClientRect(),s=getComputedStyle(e);
      if(rect.width<=1&&rect.height<=1&&['hidden','clip'].includes(s.overflow))return false;
      return true;
    };
    // Controls, placeholders and options need a sample even without child text nodes.
    const elements=[...document.querySelectorAll('body *')].filter(e=>visible(e)&&(
      [...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||e.matches('input:not([type=hidden]),textarea,select')||['before','after'].some(p=>{const c=getComputedStyle(e,'::'+p).content;return c&&c!=='none'&&c!=='normal'&&c!=='""';})
    ));
    const seenFonts=new Set();
    const close=(a,b)=>a===b||(Number.isFinite(parseFloat(a))&&Number.isFinite(parseFloat(b))&&Math.abs(parseFloat(a)-parseFloat(b))<=.1);
    for(const e of elements){
      const role=roleFor(e),variantElement=e.closest('[data-type-variant]'),variant=variantElement?.getAttribute('data-type-variant');
      const spec=variant?variants[variant]:undefined;
      const key=variant?'variant:'+variant:role,exp=expected[key];
      const s=getComputedStyle(e),size=parseFloat(s.fontSize),loc=selector(e);
      let scale=1;
      if(typeof e.getScreenCTM==='function'){const m=e.getScreenCTM();if(m)scale=Math.min(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d));}
      for(let a=e;a;a=a.parentElement){
        const st=getComputedStyle(a);
        if(typeof e.getScreenCTM!=='function'&&st.transform!=='none'){const m=new DOMMatrix(st.transform);scale*=Math.min(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d));}
        if(typeof e.getScreenCTM!=='function'&&st.scale!=='none'){const values=st.scale.split(' ').map(Number);scale*=Math.min(Math.abs(values[0]),Math.abs(values[1]??values[0]));}
        if(typeof e.getScreenCTM!=='function')scale*=parseFloat(st.zoom)||1;
      }
      const text=(e.matches('input,textarea,select')?(e.value||e.getAttribute('placeholder')||e.getAttribute('aria-label')||e.tagName):[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ')).trim().replace(/\\s+/g,' ').slice(0,120);
      const observation={selector:loc,text,role,...(variant?{variant}:{}),size,renderedSize:size*scale,weight:s.fontWeight,lineHeight:s.lineHeight,tracking:s.letterSpacing,family:s.fontFamily};
      observations.push(observation);
      if(!exp||spec&&spec.role!==role)failures.push(loc+': unknown or incompatible type role/variant '+key+' (role '+role+')');
      const checkSize=(fontSize,label)=>{if(fontSize*scale<minimum-.001)failures.push(loc+label+': rendered '+(fontSize*scale).toFixed(2)+'px is below '+minimum+'px: '+text);};
      checkSize(size,'');
      for(const pseudo of ['::before','::after',...(e.matches('input,textarea')?['::placeholder']:[])]){
        const ps=getComputedStyle(e,pseudo);
        if(pseudo==='::placeholder'?!e.getAttribute('placeholder'):(!ps.content||['none','normal','""'].includes(ps.content)))continue;
        if(ps.display!=='none'&&ps.visibility!=='hidden'&&Number(ps.opacity)!==0)checkSize(parseFloat(ps.fontSize),pseudo);
      }
      if(exp){
        const emphasis=!!e.closest('strong,b');
        for(const field of ['size','weight','lineHeight','tracking','family']){
          if(field==='weight'&&emphasis)continue;
          if(!close(String(observation[field]),String(exp[field])))failures.push(loc+': '+key+' '+field+' is '+observation[field]+'; expected '+exp[field]+' ('+text+')');
        }
      }
      const fontKey=s.fontFamily+'/'+s.fontWeight;
      if(!seenFonts.has(fontKey)){
        seenFonts.add(fontKey);
        const first=s.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g,'').toLowerCase();
        const faces=[...document.fonts].filter(f=>f.family.replace(/^['"]|['"]$/g,'').toLowerCase()===first);
        if(faces.length){
          const weight=Number(s.fontWeight);
          const match=faces.some(f=>{const range=f.weight==='normal'?[400]:f.weight==='bold'?[700]:f.weight.split(' ').map(Number);return f.status==='loaded'&&weight>=range[0]&&weight<=(range[1]??range[0]);});
          if(!match)failures.push(loc+': requested font '+first+' weight '+weight+' has no loaded matching face');
        }
      }
    }
    probe.remove();return {observations,failures:[...new Set(failures)]};
  })(${JSON.stringify({roles,variants,minimum:MINIMUM_TYPE_PX,selectors:TYPE_SELECTORS})})`) as { observations: TypeObservation[]; failures: string[] };
  return { path, width, state, scenario: TYPOGRAPHY_SCENARIO, ...result };
}

export function typographyConsistencyFailures(captures: TypographyCapture[]): string[] {
  const first = new Map<string, { observation: TypeObservation; path: string }>();
  const failures = new Set<string>();
  for (const capture of captures) for (const observation of capture.observations) {
    if (!TYPE_ROLES.includes(observation.role as any)) continue;
    const key = `${capture.width}/${observation.role}/${observation.variant || 'default'}`;
    const prior = first.get(key);
    if (!prior) { first.set(key, { observation, path: capture.path }); continue; }
    // Inline strong/b remains legitimate emphasis; compare weight at the canonical-role check instead.
    if (Math.abs(prior.observation.size-observation.size)>.1 || prior.observation.family!==observation.family) failures.add(`Type role drift ${key}: ${capture.path} ${observation.selector} differs from ${prior.path} ${prior.observation.selector}`);
  }
  return [...failures];
}

export function typographyEvidenceFailures(report: { scenario: string; captures: TypographyCapture[]; failures: string[] } | undefined, routes: string[]): string[] {
  if (!report || report.scenario !== TYPOGRAPHY_SCENARIO || !Array.isArray(report.captures) || !Array.isArray(report.failures)) return ['Missing current rendered typography evidence'];
  const errors = [...report.failures];
  for (const path of routes) for (const width of [375,1080]) if (!report.captures.some(c=>c.path===path&&c.width===width&&c.state==='resting'&&c.scenario===TYPOGRAPHY_SCENARIO&&Array.isArray(c.observations)&&c.observations.length)) errors.push(`Missing typography coverage: ${path} ${width}px`);
  for (const capture of report.captures) {
    if (!Array.isArray(capture.failures) || !Array.isArray(capture.observations)) { errors.push('Malformed typography capture'); continue; }
    errors.push(...capture.failures.map(f=>`${capture.path} ${capture.width}px ${capture.state}: ${f}`));
    for (const observation of capture.observations) if (!Number.isFinite(observation.renderedSize) || observation.renderedSize < MINIMUM_TYPE_PX-.001) errors.push(`Undersized typography evidence: ${capture.path} ${observation.selector}`);
  }
  errors.push(...typographyConsistencyFailures(report.captures.filter(c=>Array.isArray(c.observations))));
  return [...new Set(errors)];
}

/** Exercise ordinary local disclosure states without submitting forms or following links. */
export async function captureTypographyStates(page: Page, theme: Partial<ThemeTokens>, path: string, width: number): Promise<TypographyCapture[]> {
  const blocked: string[] = [];
  const fence = async (route: Route) => {
    const request=route.request();
    if(request.method()!=='GET'||request.isNavigationRequest()){
      if(new URL(request.url()).pathname!=='/api/t')blocked.push(`Typography disclosure attempted ${request.method()} ${new URL(request.url()).pathname}; request blocked`);
      await route.abort();
    }else await route.fallback();
  };
  await page.route('**/*',fence);
  try {
    const captures = [await captureTypography(page, theme, path, width, 'resting')];
    const tabs = await page.locator('[role="tab"]:visible').all();
    const selected = [];
    for (const tab of tabs) if (await tab.getAttribute('aria-selected') === 'true') selected.push(tab);
    for (const [index,tab] of tabs.entries()) if (await tab.isEnabled()) {
      await tab.click();
      captures.push(await captureTypography(page, theme, path, width, `tab-${index}`));
    }
    for (const tab of selected) if (await tab.isVisible()) await tab.click();
    const closed: Locator[] = [], originallyOpen: Locator[] = [];
    for (const detail of await page.locator('details').all()) (await detail.getAttribute('open') === null ? closed : originallyOpen).push(detail);
    // Named details groups allow only one open item; inspect each before the next closes it.
    for (const [index,detail] of closed.entries()) {
      await detail.evaluate((e: any) => { e.open = true; });
      captures.push(await captureTypography(page, theme, path, width, `detail-${index}`));
      await detail.evaluate((e: any) => { e.open = false; });
    }
    for (const detail of originallyOpen) await detail.evaluate((e: any) => { e.open = true; });
    const toggles = await page.locator('[data-nav-toggle],button[aria-expanded][aria-controls],button[aria-haspopup="dialog"][aria-controls]').all();
    for (const [index,toggle] of toggles.entries()) {
      if (!await toggle.isVisible() || !await toggle.isEnabled() || await toggle.getAttribute('aria-expanded') === 'true') continue;
      await toggle.click();
      captures.push(await captureTypography(page, theme, path, width, `disclosure-${index}`));
      await page.keyboard.press('Escape');
      if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
    }
    captures[0]!.failures.push(...blocked);
    return captures;
  } finally {await page.unroute('**/*',fence);}
}
