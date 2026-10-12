// Engine-independent lifecycle and authoring contract. Adapter selected by the matched benchmark.
export function bootMotion(adapter) {
  window.VitrisMotion?.dispose();
  let cleanup = () => {}, states = new Map(), watching=false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)'), mobile = matchMedia('(max-width: 599px)');
  const completed=new WeakSet(), onceEffects=['count','text','sequence','draw'], entrances=['entrance','stagger',...onceEffects];
  const number = (el, key, fallback) => Number(el.getAttribute('data-motion-' + key) ?? fallback);
  const init = () => {
    if(!watching){reduce.addEventListener('change',init);watching=true;}
    for(const [id,state]of states)if(onceEffects.includes(state.effect)&&state.phase==='playing'){const el=document.getElementById(id);if(el)completed.add(el);}
    cleanup(); states = new Map();
    const cancels = [], handlers = [], animations = new Map(); let disposed = false;
    const listen = (target, name, fn, options) => { target.addEventListener(name, fn, options); handlers.push(() => target.removeEventListener(name, fn, options)); };
    const finish = el => { animations.get(el)?.(); animations.delete(el); el.classList.add('is-in'); const state = states.get(el.id); if (state) state.phase = 'complete'; };
    cleanup = () => { disposed = true; for (const cancel of cancels) cancel(); for (const cancel of animations.values()) cancel(); animations.clear(); for (const remove of handlers) remove(); };
    if (document.documentElement.dataset.motionPolicy==='off' || reduce.matches || !window.IntersectionObserver || !Element.prototype.animate) return;
    try {
      const enabled=document.documentElement.dataset.motionPolicy==='enabled';
      const selector=enabled?'[data-motion],[data-reveal],[data-island="counter"] [data-count-to]':'[data-reveal],[data-island="counter"] [data-count-to]';
      const roots = [...document.querySelectorAll(selector)];
      const arm = (el,state) => {
        state.run = adapter.enter(state.children,state.options,()=>{if(!disposed){state.phase='complete';completed.add(el);el.classList.add('is-in');}},true);
        animations.set(el,state.run.cancel);
      };
      const io = new IntersectionObserver(entries => {
        try {
        for (const entry of entries) {
          const el = entry.target, state = states.get(el.id);
          if (!state || state.static) continue;
          if (entry.isIntersecting && (state.effect!=='count'||entry.intersectionRatio>=.35) && state.phase === 'pending') {
            state.phase = 'playing';
            if (!state.run) arm(el,state);
            state.run.play();
            if (!state.repeat) io.unobserve(el);
          } else if (!entry.isIntersecting && state.phase==='playing' && onceEffects.includes(state.effect)) { completed.add(el);finish(el);
          } else if (!entry.isIntersecting && state.repeat && state.phase === 'complete') {
            finish(el); state.phase = 'pending'; state.run=null; arm(el,state);
          }
        }
        } catch(error) { cleanup(); states.clear(); console.warn('Motion playback failed; static content restored',error); }
      }, { threshold: [0,.35], rootMargin: '0px 0px -10% 0px' });
      cancels.push(() => io.disconnect());
      for (const el of roots) {
        if(!el.id)el.id=`motion-runtime-${roots.indexOf(el)}`;
        const effect = (enabled && el.getAttribute('data-motion')) || (el.hasAttribute('data-count-to')?'count':el.hasAttribute('data-reveal-stagger') ? 'stagger' : 'entrance');
        const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
        const nested = el.parentElement?.closest(selector);
        const isStatic = effect === 'story' || !!nested || ['MAIN','HEADER','FOOTER','BODY','HTML'].includes(el.tagName) || /(?:^|\s)c-(?:site-)?(?:hero|header|footer)(?:\s|$)/.test(el.className) || rect.height > innerHeight * 2 || style.position === 'sticky' || style.position === 'fixed' || (mobile.matches && (el.getAttribute('data-motion-mobile') === 'static' || (effect === 'drift' && !el.hasAttribute('data-motion-mobile'))));
        const childSelector=effect==='text'?'[data-motion-word]':effect==='draw'?'[data-motion-path]':enabled?'[data-motion-child],[data-reveal-child]':'[data-reveal-child]';
        const marked = ['stagger','text','sequence','draw'].includes(effect) ? [...el.querySelectorAll(childSelector)].filter(child => child.closest(selector) === el && (effect!=='stagger' || !child.hasAttribute('data-motion-child') || child.parentElement===el)) : [];
        const children=marked.length?marked:[el]; // Legacy zero-child groups retain their wrapper entrance; unmarked siblings of marked groups stay quiet.
        const options = { effect, treatment:el.getAttribute('data-motion-treatment')||'phrase', duration: number(el,'duration', effect==='count'?900:Number.parseFloat(style.getPropertyValue('--reveal-dur')) || 550), delay: number(el,'delay',0), distance: number(el,'distance',effect==='text'?4:Number.parseFloat(style.getPropertyValue('--reveal-dist')) || 16), stagger: number(el,'stagger',70), from: el.getAttribute('data-motion-from') || el.getAttribute('data-reveal-from') || 'up', ease: el.getAttribute('data-motion-ease') || 'editorial' };
        const state = { effect, static: isStatic, phase: 'pending', children, options, repeat: el.getAttribute('data-motion-replay') === 'repeat', progress: null };
        states.set(el.id, state);
        if (isStatic || (onceEffects.includes(effect)&&completed.has(el)) || (entrances.includes(effect) && (rect.bottom<=0 || location.hash.slice(1) === el.id || el.contains(document.activeElement))) || (['entrance','stagger','text','sequence'].includes(effect)&&rect.top<innerHeight)) { state.static = true; finish(el); continue; }
        if (entrances.includes(effect)) io.observe(el);
        else {
          const trigger = document.getElementById(el.getAttribute('data-motion-trigger'));
          if (!trigger) { state.static = true; continue; }
          state.phase = 'linked';
          const start = number(el,'range-start',0), end = number(el,'range-end',1);
          state.progress = () => { const r = trigger.getBoundingClientRect(); return Math.max(0, Math.min(1, ((innerHeight-r.top)/(innerHeight+r.height)-start)/(end-start))); };
          const linked = adapter.link(el, trigger, effect, { ...options, start, end }, state.progress);
          animations.set(el, linked.cancel);
          cancels.push(linked.cancel);
        }
      }
      // Only after the observer and all targets validate do offscreen entrance states become hidden.
      for(const el of roots){const state=states.get(el.id);if(state&&!state.static&&entrances.includes(state.effect))arm(el,state);}
      const revealFocused = event => { for (const el of roots) if (el === event.target || el.contains(event.target)) finish(el); };
      const revealAnchor = () => { const el = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (el) revealFocused({ target: el }); };
      listen(document, 'focusin', revealFocused); listen(window, 'hashchange', revealAnchor); revealAnchor();
      listen(window, 'pageshow', event => { if (event.persisted) init(); });
      listen(mobile, 'change', init);
      // No cached line geometry: viewport/font changes finish copy in its natural responsive flow.
      const readable=()=>{for(const el of roots){const state=states.get(el.id);if(state&&['text','sequence'].includes(state.effect)){completed.add(el);finish(el);}}};
      listen(window,'resize',readable);
      // FontFaceSet.ready can resolve before loadingdone is delivered. Pending
      // offscreen copy has no cached line geometry and must retain its first
      // visit choreography; finish only text already playing or completed.
      listen(document.fonts,'loadingdone',()=>{for(const el of roots){const state=states.get(el.id);if(state&&state.phase!=='pending'&&['text','sequence'].includes(state.effect)){completed.add(el);finish(el);}}});
    } catch (error) { cleanup(); states.clear(); console.warn('Motion initialization left static content readable', error); }
  };
  let startCanceled=false,startTimer=0;
  const start=()=>{
    let started=false;
    const activate=()=>{if(started||startCanceled)return;started=true;clearTimeout(startTimer);init();};
    // Preserve the static document while initial fonts settle. Initializing
    // sooner lets loadingdone permanently finish every offscreen text/sequence.
    startTimer=setTimeout(activate,1500);
    const ready=document.fonts?.status==='loading'?document.fonts.ready:Promise.resolve();
    ready.then(activate,activate);
  };
  window.VitrisMotion = { version: 1, engine: adapter.name, init, dispose() { startCanceled=true;clearTimeout(startTimer);document.removeEventListener('DOMContentLoaded',start);cleanup();states=new Map();reduce.removeEventListener('change',init);watching=false; }, inspect(id) { const s = states.get(id); return s ? { effect:s.effect, static:s.static, phase:s.phase, progress:typeof s.progress === 'function' ? s.progress() : null } : { static:true,phase:'static',progress:null }; } };
  window.VitrisCounters={dispose(){window.VitrisMotion.dispose();}};
  // Classic defer can execute before module islands. Their initial UI must settle before geometry reads.
  // Late host loads still initialize immediately; failures always leave the static document readable.
  if (document.readyState==='complete' || performance.getEntriesByType('navigation')[0]?.domContentLoadedEventStart>0) start();
  else document.addEventListener('DOMContentLoaded',start,{once:true});
}
