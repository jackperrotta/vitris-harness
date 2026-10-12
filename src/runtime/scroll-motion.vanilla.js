import { countPresentation } from './scroll-motion.count.js';
// Shipping adapter selected by the matched benchmark; effects share the controller lifecycle.
const easing = { editorial:'cubic-bezier(.22,1,.36,1)', gentle:'cubic-bezier(.25,.1,.25,1)', linear:'linear' };
const base = el => { const value=getComputedStyle(el).transform; return value==='none' ? '' : value; };
// One frame for all fallback targets: read all geometry before any style writes.
const fallback = new Set(); let frame=0;
const update=()=>{frame=0;const writes=[...fallback].filter(t=>t.active||t.dirty).map(target=>[target,target.progress()]);for(const [target,p] of writes){target.write(p);target.dirty=false;}};
const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
export const vanilla = {
  name:'vanilla',
  enter(children, options, complete, paused=false) {
    if(options.effect==='count')return countPresentation(children[0],options,complete);
    const animations=children.map((el,i) => {
      const original=base(el), opacity=getComputedStyle(el).opacity;
      const axis=['left','right'].includes(options.from)?'X':'Y', sign=['down','left'].includes(options.from)?-1:1;
      let from={opacity:0,transform:`${original} translate${axis}(${sign*options.distance}px)`},to={opacity,transform:original||'none'};
      if(options.effect==='text'&&options.treatment==='mask'){from.clipPath='inset(0 0 100% 0)';to.clipPath='inset(0 0 0% 0)';}
      if(options.effect==='sequence'&&el.getAttribute('data-motion-role')==='image'){from={opacity,transform:`${original} scale(1.015)`};to={opacity,transform:original||'none'};}
      if(options.effect==='draw'){const length=el.getTotalLength?.()||1;from={strokeDasharray:`${length} ${length}`,strokeDashoffset:length};to={strokeDasharray:`${length} ${length}`,strokeDashoffset:0};}
      const animation=el.animate([from,to],{duration:options.duration,delay:Math.min(300,options.delay+i*options.stagger),easing:easing[options.ease],fill:'both'});
      if(paused)animation.pause();return animation;
    });
    Promise.all(animations.map(a=>a.finished)).then(()=> { for(const a of animations)a.cancel(); complete(); }).catch(()=>{});
    return {play(){for(const a of animations)a.play();},cancel(){ for(const a of animations)a.cancel(); }};
  },
  link(el, trigger, effect, options, progress) {
    const original=base(el), transform=p=>effect==='drift'?`${original} translateY(${options.distance*(2*p-1)}px)`:`${original} scaleX(${p})`;
    // Author controls the progress transform origin in CSS; transforms are composed with existing values.
    try {
      if(window.ViewTimeline) {
        const timeline=new ViewTimeline({subject:trigger,axis:'block',inset:'0px'});
        const animation=el.animate([{transform:transform(0)},{transform:transform(1)}],{timeline,rangeStart:`cover ${options.start*100}%`,rangeEnd:`cover ${options.end*100}%`,easing:'linear',fill:'both'});
        return {cancel(){animation.cancel();}};
      }
    } catch { /* Bounded event-driven fallback below; equivalent effect remains present. */ }
    const saved=el.style.transform, target={active:true,dirty:true,progress,write:p=>{el.style.transform=transform(p);}};
    if(!fallback.size){addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);}
    fallback.add(target);
    const io=new IntersectionObserver(entries=>{target.active=entries[0].isIntersecting;target.dirty=true;schedule();});io.observe(trigger);
    const ro=window.ResizeObserver?new ResizeObserver(()=>{target.dirty=true;schedule();}):null;ro?.observe(trigger);
    document.fonts?.ready.then(()=>{if(fallback.has(target)){target.dirty=true;schedule();}});
    schedule();
    return {cancel(){fallback.delete(target);if(!fallback.size){cancelAnimationFrame(frame);frame=0;removeEventListener('scroll',schedule);removeEventListener('resize',schedule);}io.disconnect();ro?.disconnect();el.style.transform=saved;}};
  }
};
