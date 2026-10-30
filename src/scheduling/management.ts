/** Runs synchronously at the start of head, keeping email capabilities out of URLs before any other scripts. */
export const managementJs = String.raw`(() => {
  const fragment = new URLSearchParams(location.hash.slice(1));
  let linkToken = fragment.get('token') || '';
  const intent = fragment.get('intent') === 'cancel' ? 'cancel' : fragment.get('intent') === 'reschedule' ? 'reschedule' : '';
  if (location.hash || location.search) history.replaceState(null, '', location.pathname);
  window.addEventListener('hashchange', () => { if (location.hash) location.reload(); });
  const begin = () => {
    const root = document.querySelector('[data-vitris-customer-management]');
    const metadata = document.querySelector('script[data-vitris-customer-config]');
    if (!root || !metadata) return;
    root.classList.add('vb');
    const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
    let connection;
    try { connection = JSON.parse(metadata.textContent || ''); if (connection.siteOrigin !== location.origin) throw Error(); }
    catch { root.append(node('p', 'Appointment management is available on the approved business website.', 'vb-error')); return; }
    let session = '', appointment, step = 'entry', busy = false, error = '', notice = '', slots = [], selected = null, day = '', revision = 0, appointmentRevision = 0, attempt = null, uncertain = false, downloadUrl = '';
    const time = at => new Intl.DateTimeFormat('en-US', {timeZone: appointment.timezone, hour:'numeric', minute:'2-digit', timeZoneName:'shortOffset'}).format(new Date(at));
    const fullDate = at => new Intl.DateTimeFormat('en-US', {timeZone: appointment.timezone, weekday:'short', month:'long', day:'numeric', year:'numeric'}).format(new Date(at));
    const dateOf = at => { const parts = new Intl.DateTimeFormat('en-US', {timeZone:appointment.timezone, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date(at)), get = key => parts.find(p => p.type === key).value; return get('year') + '-' + get('month') + '-' + get('day'); };
    const addDays = (value, n) => new Date(Date.parse(value + 'T12:00:00Z') + n * 86400000).toISOString().slice(0,10);
    const dayStart = value => { const target = Date.parse(value + 'T00:00:00Z'); for(let at=target-14*3600000;at<=target+14*3600000;at+=60000) if(dateOf(at)===value) return new Date(at).toISOString(); throw Error('This date is unavailable in the appointment timezone.'); };
    const api = async (path, body, authenticated = true) => {
      const response = await fetch(connection.apiOrigin + '/api/booking/v1/manage/' + path, {method:'POST',mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(25000),headers:{'content-type':'application/json',...(authenticated?{authorization:'Bearer '+session}:{})},body:JSON.stringify(body)});
      const text = await response.text(); if(text.length>1000000) throw Error('The appointment response could not be verified.');
      let result;try{result=JSON.parse(text);}catch{throw Error('Appointment management is temporarily unavailable.');}
      if(!response.ok) throw Object.assign(new Error(typeof result.error==='string'?result.error:'The appointment request failed.'),{status:response.status,code:result.code});
      return result;
    };
    const button = (label, action, primary = false) => {const el=node('button',label,primary?'vb-primary':undefined);el.type='button';el.disabled=busy;el.dataset.focusKey=label;el.addEventListener('click',action);return el;};
    const changeStep = value => {if(busy||uncertain)return;step=value;error='';notice='';selected=null;render(true);};
    const detail = (list,label,value) => {const row=node('div');row.append(node('dt',label),node('dd',value));list.append(row);};
    const price = value => {if(value.amountMinor===null)return value.label || 'Price agreed with the business';const number=new Intl.NumberFormat('en-US',{style:'currency',currency:value.currency}),digits=number.resolvedOptions().maximumFractionDigits || 0;return number.format(value.amountMinor/10**digits);};
    const exchange = async () => {
      busy=true;error='';render();
      try {
        const result=await api('exchange',{token:linkToken},false);
        if(result.schemaVersion!==1||result.siteId!==connection.siteId||result.installationId!==connection.installationId||result.siteOrigin!==connection.siteOrigin||typeof result.sessionToken!=='string'||result.appointment?.schemaVersion!==1)throw Error('This appointment connection could not be verified.');
        session=result.sessionToken;linkToken='';appointment=result.appointment;revision=appointment.scheduleRevision;appointmentRevision=appointment.revision;day=dateOf(appointment.startsAt);
        step=intent==='cancel'&&appointment.canCancel?'cancel':intent==='reschedule'&&appointment.canReschedule?'reschedule':'details';
      } catch(failure) {error=failure.message || 'This link is unavailable. Reopen the email or contact the business.';}
      finally{busy=false;render(true);}
    };
    const refresh = async () => {
      if(busy)return;busy=true;error='';
      try{const value=await api('appointment',{});if(value.reference!==appointment.reference)throw Error('The appointment response could not be verified.');appointment=value;revision=value.scheduleRevision;appointmentRevision=value.revision;step='details';uncertain=false;attempt=null;slots=[];selected=null;}
      catch(failure){error=failure.message || 'Reopen the link from your email or contact the business.';}
      finally{busy=false;render(true);}
    };
    const findTimes = async () => {
      if(busy||uncertain)return;busy=true;error='';notice='Checking available times...';selected=null;render();
      try{const data=await api('availability',{startsAt:dayStart(day),endsAt:dayStart(addDays(day,1))});if(data.schemaVersion!==1||!Array.isArray(data.slots)||data.slots.length>500)throw Error('The availability response could not be verified.');slots=data.slots.filter(value=>value.startsAt!==appointment.startsAt);revision=data.revision;appointmentRevision=data.appointmentRevision;notice=slots.length?'Choose a new time. Your original appointment stays reserved until the change succeeds.':'No other times are available for this day. Try another date or contact the business.';}
      catch(failure){error=failure.message || 'Available times could not be loaded.';notice='';slots=[];}
      finally{busy=false;render();}
    };
    const submit = async kind => {
      if(busy)return;
      if(!attempt||!uncertain)attempt={kind,body:{idempotencyKey:crypto.randomUUID(),revision,appointmentRevision,...(kind==='reschedule'?{startsAt:selected.startsAt}:{})}};
      busy=true;error='';notice='Saving your change...';render();
      try{const result=await api(attempt.kind,attempt.body);if(result.schemaVersion!==1||result.reference!==appointment.reference)throw Error('The appointment response could not be verified.');appointment=result;revision=result.scheduleRevision;appointmentRevision=result.revision;uncertain=false;attempt=null;step='done';notice='Your change is saved in the business calendar.';}
      catch(failure){error=failure.message || 'The appointment response was interrupted.';notice='';if(!failure.status||failure.status>=500){uncertain=true;error+=' The result may still be pending. Retry this same change; do not start another request.';}else{uncertain=false;attempt=null;if(failure.status===409){step='details';notice='Refresh the appointment before trying another time. Your original appointment has been kept unless the business changed it.';}}}
      finally{busy=false;render(true);}
    };
    function render(focus=false){
      const focusKey=document.activeElement?.dataset.focusKey;root.replaceChildren();
      const panel=node('section',undefined,'vb-panel');root.append(panel);
      const title=step==='entry'?'View your appointment':step==='cancel'?'Cancel this appointment?':step==='reschedule'?'Choose a new time':step==='review'?'Review the new appointment time':step==='done'?(appointment.status==='cancelled'?'Appointment cancelled':appointment.status==='pending_approval'?'Request time changed':'Appointment rescheduled'):'Your appointment';
      const heading=node('h2',title);heading.tabIndex=-1;panel.append(heading);
      if(error){const el=node('p',error,'vb-error');el.setAttribute('role','alert');panel.append(el);}
      if(notice){const el=node('p',notice,'vb-notice');el.setAttribute('role','status');panel.append(el);}
      if(step==='entry'){
        panel.append(node('p','This private link can view or change only the appointment named in your email. No appointment is changed by opening this page.'));
        if(linkToken)panel.append(button(busy?'Opening...':'View appointment',()=>{void exchange();},true));else panel.append(node('p','Open a valid link from your appointment email. If the link expired, contact the business.'));
      }else if(appointment){
        const list=node('dl');detail(list,'Service',appointment.serviceName);detail(list,'Current time',fullDate(appointment.startsAt)+' · '+time(appointment.startsAt));detail(list,'Location',appointment.locationName);detail(list,'Staff',appointment.providerName);detail(list,'Price',price(appointment.price));detail(list,'Status',appointment.status.replaceAll('_',' '));panel.append(list);
        if(appointment.status==='pending_approval')panel.append(node('p','This request is still waiting for business approval. Changing its time does not confirm it.','vb-notice'));
        if(appointment.policyText)panel.append(node('h3','Booking policy'),node('p',appointment.policyText,'vb-policy'));
        if(step==='details'){
          if(appointment.cancellationDeadline)panel.append(node('p','Online cancellation deadline: '+fullDate(appointment.cancellationDeadline)+' · '+time(appointment.cancellationDeadline),'vb-hint'));
          if(appointment.rescheduleDeadline)panel.append(node('p','Online rescheduling deadline: '+fullDate(appointment.rescheduleDeadline)+' · '+time(appointment.rescheduleDeadline),'vb-hint'));
          const actions=node('div',undefined,'vb-actions');if(appointment.canCancel)actions.append(button('Cancel appointment',()=>changeStep('cancel')));if(appointment.canReschedule)actions.append(button('Reschedule appointment',()=>changeStep('reschedule'),true));actions.append(button('Refresh appointment',()=>{void refresh();}));panel.append(actions);
          if(!appointment.canCancel||!appointment.canReschedule)panel.append(node('p','Some online changes are unavailable or their notice deadline has passed. Contact the business for help.','vb-hint'));
        }else if(step==='cancel'){
          panel.append(node('p','Cancelling releases this appointment time. This action takes effect only after you confirm.'));
          const actions=node('div',undefined,'vb-actions');if(!uncertain)actions.append(button('Keep appointment',()=>changeStep('details')));actions.append(button(busy?'Cancelling...':uncertain?'Retry same change':'Confirm cancellation',()=>{void submit('cancel');},true));panel.append(actions);
        }else if(step==='reschedule'){
          panel.append(node('p','Your original time remains reserved until the new time is saved. Staff, location, duration and price stay the same.','vb-notice'));
          const input=node('input');input.type='date';input.value=day;input.min=dateOf(Date.now());input.max=dateOf(Date.now()+appointment.horizonDays*86400000);input.disabled=busy;input.dataset.focusKey='new-date';input.addEventListener('change',()=>{if(input.value){day=input.value;slots=[];selected=null;error='';notice='';render();}});const label=node('label');label.append(node('span','New appointment date'),input);panel.append(label,button('Find new times',()=>{void findTimes();}));
          const group=node('div',undefined,'vb-times');group.setAttribute('aria-label','Available new times');for(const value of slots){const b=button(time(value.startsAt),()=>{selected=value;render();});b.dataset.focusKey=value.startsAt;b.setAttribute('aria-pressed',String(selected?.startsAt===value.startsAt));group.append(b);}panel.append(group);
          const actions=node('div',undefined,'vb-actions'),next=button('Review new time',()=>{step='review';render(true);},true);next.disabled=!selected||busy;actions.append(button('Keep current time',()=>changeStep('details')),next);panel.append(actions);
        }else if(step==='review'){
          panel.append(node('h3','New time'),node('p',fullDate(selected.startsAt)+' · '+time(selected.startsAt)));
          const actions=node('div',undefined,'vb-actions');if(!uncertain)actions.append(button('Choose another time',()=>changeStep('reschedule')));actions.append(button(busy?'Saving...':uncertain?'Retry same change':'Confirm new time',()=>{void submit('reschedule');},true));panel.append(actions);
        }else if(step==='done'){
          panel.append(node('p','Reference: '+appointment.reference,'vb-reference'));
          if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(new Blob([appointment.calendar.content],{type:'text/calendar;charset=utf-8'}));const link=node('a','Download updated calendar file (.ics)');link.href=downloadUrl;link.download='appointment.ics';panel.append(link,node('p','Imported calendar files are snapshots and may need to be updated manually.','vb-hint'));
          if(appointment.status!=='cancelled')panel.append(button('View appointment details',()=>changeStep('details')));
        }
      }
      if(focus)heading.focus();else if(focusKey)root.querySelector('[data-focus-key="'+CSS.escape(focusKey)+'"]')?.focus({preventScroll:true});
    }
    render();
    window.addEventListener('beforeunload',event=>{if(uncertain||busy){event.preventDefault();event.returnValue='';}});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',begin,{once:true});else begin();
})();`;
