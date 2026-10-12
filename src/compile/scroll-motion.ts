import { parseFragment, serialize } from 'parse5';
import type { SiteConfig } from '../types.ts';

export const MOTION_EFFECTS = ['entrance', 'stagger', 'drift', 'progress', 'story', 'count', 'text', 'sequence', 'draw'] as const;
export type MotionEffect = typeof MOTION_EFFECTS[number];
export type MotionTarget = { id: string; effect: MotionEffect; trigger: string };
const bounds: Record<string, [number, number, number]> = {
  duration: [120, 1200, 550], delay: [0, 300, 0], distance: [0, 32, 16],
  stagger: [0, 120, 70], 'range-start': [0, .95, 0], 'range-end': [.05, 1, 1],
};

/** One contract after flattening, so native HTML and both authoring modes agree. */
export function prepareMotion(html: string, site: SiteConfig): { html: string; targets: MotionTarget[]; usesMotion: boolean } {
  if (site.scrollMotion && (site.scrollMotion.version !== 1 || !['enabled','off'].includes(site.scrollMotion.policy))) throw new Error('Unsupported scrollMotion version or policy');
  const disabled = site.scrollMotion?.policy === 'off';
  const enabled = site.scrollMotion?.version === 1 && site.scrollMotion.policy === 'enabled';
  if (!/\bdata-motion\s*=|\bdata-reveal\b|\bdata-count-to\b/i.test(html)) return { html, targets: [], usesMotion: false };
  const fragment = parseFragment(html);
  const targets: MotionTarget[] = [], ids = new Map<string, number>();
  const elements: any[] = [];
  const walk = (node: any) => { if (node.attrs) { elements.push(node); const id = node.attrs.find((a: any) => a.name === 'id')?.value; if (id) ids.set(id, (ids.get(id) || 0) + 1); } for (const child of node.childNodes || []) walk(child); };
  walk(fragment);
  let legacy = false;
  for (const node of elements) {
    const get = (key: string) => node.attrs.find((a: any) => a.name === key)?.value;
    const set = (key: string, value: string) => { const old = node.attrs.find((a: any) => a.name === key); if (old) old.value = value; else node.attrs.push({ name: key, value }); };
    if(get('data-motion')==='count'||get('data-count-to')!==undefined)set('style',(get('style')||'')+';display:inline-block;position:relative'); // Same reserved box in normal, no-JS and off output.
    if (disabled) { node.attrs = node.attrs.filter((a: any) => !a.name.startsWith('data-motion') && !a.name.startsWith('data-reveal') && !a.name.startsWith('data-count-')); continue; }
    if (!enabled) node.attrs = node.attrs.filter((a: any) => !a.name.startsWith('data-motion'));
    if(get('data-count-to')!==undefined&&!get('data-motion')){
      let ancestor=node.parentNode;while(ancestor&&!ancestor.attrs?.some((a:any)=>a.name==='data-island'&&a.value==='counter'))ancestor=ancestor.parentNode;
      if(ancestor){let id=get('id')||`motion-counter-${elements.indexOf(node)}`;while(!get('id')&&ids.has(id))id+='-auto';if(get('id')&&ids.get(id)!==1)throw new Error('Legacy counter needs a unique ID');if(!get('id')){set('id',id);ids.set(id,1);}set('data-motion-target',id);targets.push({id,effect:'count',trigger:id});}
    }
    if (get('data-reveal') !== undefined && !(enabled && get('data-motion'))) {
      legacy = true;
      const existing = get('id');
      let id = existing || `motion-legacy-${elements.indexOf(node)}`;
      if (!existing) while (ids.has(id)) id += '-auto';
      if (existing && ids.get(existing) !== 1) throw new Error('Legacy motion targets require unique IDs for temporal evidence');
      if (!existing) { set('id', id); ids.set(id, 1); }
      set('data-motion-target', id);
      targets.push({ id, effect: get('data-reveal-stagger') !== undefined ? 'stagger' : 'entrance', trigger: id });
    }
    const effect = get('data-motion');
    if (!effect || !enabled) continue;
    if (effect === 'stagger' && !(node.childNodes || []).some((child: any) => child.attrs?.some((a: any) => a.name === 'data-motion-child'))) throw new Error('New stagger targets need direct data-motion-child elements');
    if (!MOTION_EFFECTS.includes(effect as MotionEffect)) throw new Error(`Unknown motion effect: ${effect}`);
    const id = get('id');
    if (!id || !/^[A-Za-z][\w-]*$/.test(id) || ids.get(id) !== 1) throw new Error('Motion targets require a unique stable id');
    if (['html', 'body', 'main', 'header', 'footer'].includes(node.tagName) || /(?:^|\s)c-(?:site-)?(?:header|footer|hero)(?:\s|$)/.test(get('class') || '')) throw new Error(`Motion target ${id} must be a content element, not a page shell or primary hero`);
    const descendants:any[]=[];const collect=(n:any)=>{for(const c of n.childNodes||[]){if(c.attrs)descendants.push(c);collect(c);}};collect(node);
    const marked=(key:string)=>descendants.filter(n=>n.attrs.some((a:any)=>a.name===key));
    if(['count','text'].includes(effect)&&node.tagName==='h1')throw new Error(`Motion ${id}: primary heading must stay immediately readable`);
    if(effect==='count'){
      const value=Number(get('data-motion-value')),decimals=Number(get('data-motion-decimals')||0);
      if(get('data-motion-value')===undefined||!Number.isFinite(value)||Math.abs(value)>1e12||!Number.isInteger(decimals)||decimals<0||decimals>3||!get('data-motion-fact')?.trim()||get('data-motion-kind')!=='statistic'||descendants.length)throw new Error(`Motion ${id}: count needs a supplied statistic fact, finite value, 0–3 decimals and plain canonical text`);
      const final=(get('data-motion-prefix')||'')+(get('data-motion-sign')==='always'&&value>=0?'+':'')+value.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals,useGrouping:get('data-motion-group')!=='false'})+(get('data-motion-suffix')||'');
      if((node.childNodes||[]).map((n:any)=>n.value||'').join('')!==final)throw new Error(`Motion ${id}: formatted value must exactly match canonical author text (${final})`);
      let ancestor=node;while(ancestor){if(ancestor.tagName==='a'&&ancestor.attrs.some((a:any)=>a.name==='href'&&/^(tel:|mailto:)/.test(a.value)))throw new Error(`Motion ${id}: contact details cannot count`);ancestor=ancestor.parentNode;}
    }
    if(effect==='text'&&(!marked('data-motion-word').length||marked('data-motion-word').length>8))throw new Error(`Motion ${id}: text needs 1–8 authored semantic data-motion-word spans`);
    if(effect==='sequence'&&(!marked('data-motion-child').length||marked('data-motion-child').length>8))throw new Error(`Motion ${id}: sequence needs 1–8 authored data-motion-child elements, including forwarded component slots`);
    if(effect==='draw'&&(!marked('data-motion-path').length||get('aria-hidden')!=='true'||node.tagName!=='svg'))throw new Error(`Motion ${id}: draw needs a decorative aria-hidden SVG with data-motion-path paths`);
    if(['count','text','sequence','draw'].includes(effect)&&get('data-motion-replay')==='repeat')throw new Error(`Motion ${id}: expressive content plays once per visit`);
    const trigger = get('data-motion-trigger') || id;
    if (ids.get(trigger) !== 1) throw new Error(`Motion trigger ${trigger} must exist uniquely`);
    if (['drift', 'progress'].includes(effect) && trigger === id) throw new Error(`Progress target ${id} needs a separate stable trigger container`);
    for (const [key, [min, max, fallback]] of Object.entries(bounds)) {
      const raw = get(`data-motion-${key}`);
      if (raw === undefined) continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Motion ${id}: ${key} must be a number`);
      set(`data-motion-${key}`, String(Math.max(min, Math.min(max, value || (value === 0 ? 0 : fallback)))));
    }
    if (Number(get('data-motion-range-start') || 0) >= Number(get('data-motion-range-end') || 1)) throw new Error(`Motion ${id}: range end must follow start`);
    for (const [key, allowed] of Object.entries({ ease: ['editorial', 'linear', 'gentle'], replay: ['once', 'repeat'], mobile: ['same', 'static'], reduced: ['static'], from: ['up', 'down', 'left', 'right'], treatment:['phrase','mask'], group:['true','false'], sign:['always','auto'] })) {
      const value = get(`data-motion-${key}`);
      if (value !== undefined && !allowed.includes(value)) throw new Error(`Motion ${id}: invalid ${key}`);
    }
    // Explicit behavior supersedes an automatic legacy wrapper at this root.
    node.attrs = node.attrs.filter((a: any) => !a.name.startsWith('data-reveal'));
    targets.push({ id, effect: effect as MotionEffect, trigger });
    set('data-motion-target', id);
  }
  return { html: serialize(fragment), targets, usesMotion: legacy || targets.some(t => t.effect !== 'story') };
}
