/** Public interactions replacing the old Angular renderer; no legacy services. */
export const preserveRuntime = `(() => {
  const bottomNav = document.getElementById('navbar-bottom-nav');
  const footer = document.getElementById('vitris-footer');
  if (bottomNav && footer) {
    const reserveBottomNav = () => { footer.style.paddingBottom = bottomNav.getBoundingClientRect().height + 'px'; };
    new ResizeObserver(reserveBottomNav).observe(bottomNav);
    window.addEventListener('resize', reserveBottomNav); document.fonts.ready.then(reserveBottomNav); reserveBottomNav();
  }
  let openModal, opener;
  const reactClosedClasses = new WeakMap();
  const notice=(container,text)=>{
    let note=container.querySelector('[data-preserve-status]');
    if(!note){note=document.createElement('p');note.dataset.preserveStatus='';note.setAttribute('role','status');container.append(note);}note.textContent=text;
  };
  document.querySelectorAll('services-general[data-preserve-service-cards]').forEach(block=>{
    const cards=JSON.parse(block.dataset.preserveServiceCards),grid=block.querySelector('[data-preserve-service-grid]'),select=block.querySelector('[data-vitrisid="servicesPerPage"]'),search=block.querySelector('[data-vitrisid="servicesSearch"]'),left=block.querySelector('[data-vitrisid="servicesLeftArrow"]'),right=block.querySelector('[data-vitrisid="servicesRightArrow"]');let offset=0;
    const render=()=>{const filtered=cards.filter(card=>!search?.value||card.toLowerCase().includes(search.value.toLowerCase())),size=Number(select?.value||5);offset=Math.max(0,Math.min(offset,Math.max(0,Math.ceil(filtered.length/size)-1)));grid.innerHTML=filtered.slice(offset*size,(offset+1)*size).join('');grid.querySelectorAll('[data-toggle="modal"]').forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');});bindHovers(grid);left?.parentElement.classList.toggle('disabled',offset===0);right?.parentElement.classList.toggle('disabled',(offset+1)*size>=filtered.length);};
    select?.addEventListener('change',()=>{offset=0;render();});search?.addEventListener('input',()=>{offset=0;render();});left?.addEventListener('click',event=>{event.preventDefault();if(offset>0){offset--;render();}});right?.addEventListener('click',event=>{event.preventDefault();if((offset+1)*Number(select?.value||5)<cards.length){offset++;render();}});
  });
  // The original React renderer leaves below-fold images unloaded until scrolling
  // or resizing. Keep its deferred loading while using only captured local bytes.
  const deferred=[...document.querySelectorAll('img[data-preserve-deferred-src]')];
  const loadImage=img=>{if(!img.dataset.preserveDeferredSrc)return;img.src=img.dataset.preserveDeferredSrc;img.removeAttribute('data-preserve-deferred-src');};
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){loadImage(entry.target);observer.unobserve(entry.target);}}),{rootMargin:'0px 0px 200px 0px'});
  deferred.forEach(img=>observer.observe(img));
  if(window.innerWidth<992)deferred.forEach(loadImage);
  window.addEventListener('resize',()=>deferred.filter(img=>img.hasAttribute('data-preserve-deferred-src')).forEach(loadImage));
  document.querySelectorAll('[data-preserve-product-states]').forEach(panel=>{
    const states=JSON.parse(panel.dataset.preserveProductStates),initial=states[0].values;let values=[...initial];
    const bind=()=>panel.querySelectorAll('select').forEach((select,index)=>{if(index>=values.length)return;select.value=values[index];select.addEventListener('change',()=>{
      values[index]=select.value;
      if(index===0)values=values.map((v,i)=>i===0?v:'');
      const state=states.find(s=>JSON.stringify(s.values)===JSON.stringify(values));
      if(state){panel.innerHTML=state.html;bind();bindHovers(panel);}
    });});bind();
  });
  document.querySelectorAll('.carousel[data-preserve-carousel]').forEach(carousel=>{
    const slides=[...carousel.querySelectorAll('.carousel__slide')],dots=[...carousel.querySelectorAll('.carousel__dot')];let selected=0;
    const choose=index=>{selected=(index+slides.length)%slides.length;carousel.querySelector('.carousel__slider-tray').style.transform='translateX(-'+(selected*100/slides.length)+'%) translateX(0px)';
      slides.forEach((slide,i)=>{slide.classList.toggle('carousel__slide--visible',i===selected);slide.classList.toggle('carousel__slide--hidden',i!==selected);slide.setAttribute('aria-selected',String(i===selected));slide.tabIndex=i===selected?0:-1;});
      dots.forEach((dot,i)=>{dot.disabled=i===selected;dot.classList.toggle('carousel__dot--selected',i===selected);});};
    dots.forEach((dot,i)=>dot.addEventListener('click',()=>choose(i)));
    const slider=carousel.querySelector('.carousel__slider');slider.addEventListener('keydown',event=>{if(['ArrowRight','ArrowLeft'].includes(event.key)){event.preventDefault();choose(selected+(event.key==='ArrowRight'?1:-1));}});
    let start;slider.addEventListener('touchstart',event=>{start=event.touches[0]?.clientX;},{passive:true});slider.addEventListener('touchend',event=>{const end=event.changedTouches[0]?.clientX;if(start!==undefined&&Math.abs(end-start)>30)choose(selected+(end<start?1:-1));},{passive:true});
  });
  const boundHovers=new WeakSet();
  const bindHovers=container=>container.querySelectorAll('[data-preserve-hover]').forEach(button=>{
    if(boundHovers.has(button))return;boundHovers.add(button);
    const hover=JSON.parse(button.dataset.preserveHover);let resting;
    button.addEventListener('mouseenter',()=>{resting=button.getAttribute('style');for(const [property,value]of Object.entries(hover))button.style.setProperty(property,value);});
    button.addEventListener('mouseleave',()=>{if(resting===null)button.removeAttribute('style');else if(resting!==undefined)button.setAttribute('style',resting);});
  });bindHovers(document);
  document.querySelectorAll('iframe[data-preserve-disabled-embed]').forEach(frame => {
    const notice = () => {
      const doc = frame.contentDocument;
      if (!doc || doc.querySelector('[data-preserve-embed-notice]')) return;
      const note = doc.createElement('p'); note.dataset.preserveEmbedNotice = ''; note.setAttribute('role','status');
      note.textContent = 'This preview does not run this embedded application. Please use the listed contact details.';
      doc.body.append(note);
    };
    frame.addEventListener('load', notice); notice();
  });
  const close = () => {
    if (!openModal) return;
    openModal.classList.remove('show'); openModal.style.display = 'none';
    openModal.setAttribute('aria-hidden', 'true'); openModal.removeAttribute('aria-modal');
    document.querySelector('[data-preserve-backdrop]')?.remove();
    document.body.classList.remove('modal-open'); openModal = null; opener?.focus();
  };
  document.querySelectorAll('[data-toggle="modal"]').forEach(el => { el.tabIndex = 0; el.setAttribute('role','button'); });
  document.querySelectorAll('.dropdown-toggle').forEach(el => { el.tabIndex = 0; el.setAttribute('role','button'); el.setAttribute('aria-expanded','false'); });
  document.addEventListener('click', event => {
    const disabled=event.target.closest('[data-preserve-disabled-action]');
    if(disabled){event.preventDefault();const booking=disabled.dataset.preserveDisabledAction==='booking',container=disabled.closest('[data-preserve-disabled-booking], #vb, form')||disabled.parentElement;notice(container,booking?(container.querySelector('#days-container')?'This preview cannot book appointments. Calendar availability is a captured snapshot. Please use the listed contact details.':'This preview cannot book appointments. Please use the listed contact details.'):'This preview cannot place orders or accept payments. Please use the listed contact details.');return;}
    if(event.target.closest('[data-preserve-inert-action]')){event.preventDefault();return;}
    const dropdown = event.target.closest('.dropdown-toggle');
    if (dropdown) {
      const menu = dropdown.parentElement.querySelector('.dropdown-menu');
      if (menu) {
        event.preventDefault();
        const wasOpen = !!document.querySelector('.dropdown-menu.show');
        document.querySelectorAll('.dropdown-menu.show').forEach(el=>el.classList.remove('show'));
        document.querySelectorAll('.dropdown-toggle').forEach(el=>el.setAttribute('aria-expanded','false'));
        if (!wasOpen) { menu.classList.add('show'); dropdown.setAttribute('aria-expanded','true'); }
      }
    }
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const selector = toggle.getAttribute('data-target') || toggle.getAttribute('href');
      const target = selector?.startsWith('#') ? document.getElementById(selector.slice(1)) : null;
      if (!target) return;
      if (toggle.dataset.toggle === 'collapse') {
        event.preventDefault();
        const groupSelector=toggle.getAttribute('data-parent')||target.getAttribute('data-parent');
        const group=groupSelector?.startsWith('#')?document.getElementById(groupSelector.slice(1)):null;
        if(group&&!target.classList.contains('show'))group.querySelectorAll('.collapse.show').forEach(sibling=>{
          if(sibling===target)return;sibling.classList.remove('show');
          group.querySelectorAll('[data-toggle="collapse"]').forEach(control=>{if((control.getAttribute('data-target')||control.getAttribute('href'))==='#'+sibling.id)control.setAttribute('aria-expanded','false');});
        });
        const reactNav = target.classList.contains('navbar-collapse');
        if (reactNav && !reactClosedClasses.has(target)) reactClosedClasses.set(target, target.className);
        target.classList.toggle('show');
        if (reactNav) {
          if (target.classList.contains('show')) { target.classList.remove('d-none'); target.classList.add('d-block','in'); }
          else target.className = reactClosedClasses.get(target);
        }
        toggle.setAttribute('aria-expanded', String(target.classList.contains('show')));
      } else if (toggle.dataset.toggle === 'modal') {
        event.preventDefault(); close(); opener = toggle; openModal = target;
        target.style.display = 'block'; target.classList.add('show'); target.removeAttribute('aria-hidden');
        target.setAttribute('aria-modal','true'); target.tabIndex = -1;
        const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop fade show';
        backdrop.dataset.preserveBackdrop = ''; backdrop.onclick = close; document.body.append(backdrop);
        document.body.classList.add('modal-open'); target.focus();
        if (toggle.closest('services-general[uniquecomponent="service-1"]') && !target.querySelector('[data-preserve-booking-notice]')) {
          const note = document.createElement('p'); note.dataset.preserveBookingNotice = ''; note.setAttribute('role','status');
          note.textContent = 'This preview cannot book appointments. Please use the listed contact details.';
          (target.querySelector('.modal-content, .modal-dialog') || target).append(note);
        }
      }
    }
    if (event.target.closest('[data-dismiss="modal"]') || event.target === openModal) close();
    const send = event.target.closest('[data-vitrisid="emailSendButton"]');
    if (send) { event.preventDefault();const form=send.closest('form');if(form?.hasAttribute('data-preserve-disabled-custom-form'))notice(form,'This preview does not send messages or upload files. Please use the listed contact details.');else form?.requestSubmit(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-toggle="modal"], [data-vitrisid="emailSendButton"], .dropdown-toggle, [data-preserve-disabled-action]')) { event.preventDefault(); event.target.click(); }
    if (event.key === 'Tab' && openModal) { event.preventDefault(); openModal.focus(); }
  });
  document.querySelectorAll('form[data-preserve-forms]').forEach(form => {
    form.removeAttribute('novalidate');
    const send = form.querySelector('[data-vitrisid="emailSendButton"]');
    if (send) { send.tabIndex = 0; send.setAttribute('role','button'); }
    form.addEventListener('submit', event => {
      if (form.dataset.preserveForms === 'live') return;
      event.preventDefault();
      if(form.hasAttribute('data-preserve-disabled-custom-form')){notice(form,'This preview does not send messages or upload files. Please use the listed contact details.');return;}
      let note = form.querySelector('[data-preserve-status]');
      if (!note) { note = document.createElement('p'); note.dataset.preserveStatus = ''; note.setAttribute('role','status'); form.append(note); }
      note.textContent = 'This preview does not send messages. Please use the listed contact details.';
    });
  });
})();`;
