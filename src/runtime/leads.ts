/** One shared client for generated and preserved contact forms. Lazy challenge keeps resting layouts intact. */
export const leadsJs = `(() => {
  let challengeScript;
  const loadChallenge = () => {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!challengeScript) challengeScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('challenge_unavailable'));
      script.onerror = () => { script.remove(); challengeScript = null; reject(new Error('challenge_unavailable')); };
      document.head.append(script);
    });
    return challengeScript;
  };
  document.querySelectorAll('form[data-lead-form][data-vitris-enhanced]').forEach(form => {
    // Named controls can shadow native form properties and methods.
    const data = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'dataset').get.call(form);
    const setAttribute = Element.prototype.setAttribute.bind(form);
    const removeAttribute = Element.prototype.removeAttribute.bind(form);
    const querySelectorAll = Element.prototype.querySelectorAll.bind(form);
    if (data.vitrisInitialized) return;
    data.vitrisInitialized = '1';
    let submitting = false, key, signature, widget, token = '', challengeResolve, challengeReject, completedSignature;
    const note = document.createElement('p'); note.className = 'c-lead-status';
    note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite'); note.tabIndex = -1;
    note.style.display = 'none'; Element.prototype.after.call(form, note);
    const say = (message, error = false) => {
      note.style.display = ''; note.setAttribute('role', error ? 'alert' : 'status'); note.textContent = message;
      if (error) note.focus();
    };
    let challengeBox;
    const challenge = async () => {
      const api = await loadChallenge();
      if (challengeBox) challengeBox.style.display = '';
      if (token) return token;
      if (!challengeBox) { challengeBox = document.createElement('div'); challengeBox.className = 'vitris-challenge'; challengeBox.setAttribute('aria-label', 'Security verification'); Element.prototype.append.call(form, challengeBox); }
      return new Promise((resolve, reject) => {
        challengeResolve = resolve; challengeReject = reject;
        if (widget !== undefined) api.reset(widget);
        else widget = api.render(challengeBox, {
          sitekey: data.vitrisSitekey, action: data.vitrisAction,
          callback: value => { token = value; challengeResolve?.(value); },
          'expired-callback': () => { token = ''; if (submitting) say('Security check expired. Please submit again.', true); challengeReject?.(new Error('challenge_expired')); },
          'timeout-callback': () => { token = ''; challengeReject?.(new Error('challenge_expired')); },
          'error-callback': () => { token = ''; challengeReject?.(new Error('challenge_unavailable')); }
        });
      });
    };
    EventTarget.prototype.addEventListener.call(form, 'submit', async event => {
      if (event.defaultPrevented) return;
      event.preventDefault(); if (submitting) return;
      if (!HTMLFormElement.prototype.reportValidity.call(form)) return;
      const values = new URLSearchParams(new FormData(form));
      values.delete('cf-turnstile-response'); values.delete('idempotency_key');
      const current = values.toString();
      if (current === completedSignature) { say('Your message was already accepted.'); return; }
      if (!data.vitrisForm || !data.vitrisSitekey) { say('This preview does not send messages. Please use the listed contact details.', true); return; }
      if (current !== signature) { key = crypto.randomUUID(); signature = current; }
      submitting = true;
      const controls = [...querySelectorAll('button[type="submit"], button:not([type]), input[type="submit"], [data-vitrisid="emailSendButton"]')];
      const prior = controls.map(c => c.disabled);
      controls.forEach(c => { c.disabled = true; c.setAttribute('aria-disabled', 'true'); }); setAttribute('aria-busy', 'true');
      let timeout;
      try {
        say('Please complete the security check.');
        const challengeTimeout = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('challenge_unavailable')), 120000); });
        const verified = await Promise.race([challenge(), challengeTimeout]);
        clearTimeout(timeout);
        values.set('cf-turnstile-response', verified); values.set('idempotency_key', key);
        say('Sending your inquiry…');
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), Math.max(100, Math.min(30000, Number(data.leadTimeoutMs) || 10000)));
        const response = await fetch(Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'action').get.call(form), { method:'POST', body:values, headers:{accept:'application/json'}, signal:controller.signal, credentials:'omit' });
        const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
        if (!response.ok || result?.ok !== true) throw new Error(result?.error || 'backend_unavailable');
        say(result.mode === 'test' ? 'Test message accepted. No customer email will be sent.' : 'Message accepted. Your inquiry has been saved.');
        completedSignature = current;
        if (challengeBox) challengeBox.style.display = 'none';
      } catch (error) {
        const messages = {
          challenge_required:'Please complete the security check and try again.',
          challenge_invalid:'Security check expired or was invalid. Please try again.',
          challenge_replayed:'Security check was already used. Please try again.',
          challenge_expired:'Security check expired. Please try again.',
          challenge_unavailable:'Security check is unavailable. Please try again or use the listed contact details.',
          rate_limited:'Too many attempts. Please wait ten minutes and try again.',
          validation_error:'Please check your form fields and try again.',
          form_disabled:'This form is currently unavailable. Please use the listed contact details.',
          configuration_unavailable:'This form is currently unavailable. Please use the listed contact details.',
          idempotency_conflict:'This request changed during a retry. Please edit your message and try again.'
        };
        say(error?.name === 'AbortError' ? 'The request timed out. Your message is still here; please try again.' : (messages[error?.message] || 'Acceptance could not be confirmed. Your details are still here; please try again or use the listed contact options.'), true);
        if (challengeBox) challengeBox.style.display = '';
      } finally {
        clearTimeout(timeout); token = ''; challengeResolve = null; challengeReject = null;
        if (window.turnstile && widget !== undefined) window.turnstile.reset(widget);
        controls.forEach((c, i) => { c.disabled = prior[i]; c.removeAttribute('aria-disabled'); });
        removeAttribute('aria-busy'); submitting = false;
      }
    });
  });
})();`;