// One demand-driven frame for all active counters. Canonical author text stays in the accessibility tree.
const active=new Set(); let frame=0;
function tick(now){frame=0;for(const item of [...active])item.update(now);if(active.size)frame=requestAnimationFrame(tick);}
export function countPresentation(el,options,complete){
  const final=el.textContent, legacy=!el.hasAttribute('data-motion');
  const value=Number(el.getAttribute(legacy?'data-count-to':'data-motion-value'));
  const match=final.match(/[-+]?\d[\d,]*(?:\.\d+)?/);
  if(!Number.isFinite(value)||!match||el.children.length)return {play(){complete();},cancel(){}};
  const before=legacy?final.slice(0,match.index):el.getAttribute('data-motion-prefix')||'';
  const after=legacy?final.slice(match.index+match[0].length):el.getAttribute('data-motion-suffix')||'';
  const decimals=legacy?(match[0].split('.')[1]?.length||0):Number(el.getAttribute('data-motion-decimals')||0);
  const grouped=legacy?match[0].includes(','):el.getAttribute('data-motion-group')!=='false';
  const plus=legacy?match[0].startsWith('+'):el.getAttribute('data-motion-sign')==='always';
  const format=n=>before+(plus&&n>=0?'+':'')+n.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals,useGrouping:grouped})+after;
  if(!legacy&&format(value)!==final)return {play(){complete();},cancel(){}};
  let start=null,canonical=null,visual=null,stopped=false;
  const originalStyle=el.getAttribute('style');
  const restore=()=>{active.delete(item);if(!active.size){cancelAnimationFrame(frame);frame=0;}if(canonical){el.replaceChildren(...canonical.childNodes);canonical=null;visual=null;if(originalStyle===null)el.removeAttribute('style');else el.setAttribute('style',originalStyle);}};
  const item={update(now){if(start===null)start=now;const p=Math.min(1,(now-start)/options.duration);if(p>=1){restore();stopped=true;complete();return;}visual.textContent=format(value*(1-Math.pow(1-p,3)));}};
  return {play(){if(stopped||canonical)return;canonical=document.createElement('span');canonical.style.opacity='0';canonical.append(...el.childNodes);visual=document.createElement('span');visual.setAttribute('aria-hidden','true');visual.setAttribute('data-motion-visual','');visual.style.cssText='position:absolute;inset:0;user-select:none;pointer-events:none;white-space:inherit';visual.textContent=format(0);el.style.position='relative';el.style.display='inline-block';el.append(canonical,visual);active.add(item);if(!frame)frame=requestAnimationFrame(tick);},cancel(){stopped=true;restore();}};
}
