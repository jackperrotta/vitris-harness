/** Standard booking browser program, scoped to one explicit mount. Browser acceptance exercises this emitted JavaScript. */
export const bookingJs = `(function initializeBooking() {
  const root = document.querySelector("[data-vitris-booking]");
  if (!root) return;
  const metadata = document.querySelector("script[data-vitris-booking-config]");
  if (!metadata) return;
  root.classList.add("vb");
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== void 0) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const notice = (text) => {
    const el = node("p", text, "vb-notice");
    el.setAttribute("role", "status");
    return el;
  };
  let connection;
  try {
    connection = JSON.parse(metadata.textContent || "");
    if (connection.siteOrigin !== location.origin) throw Error();
  } catch {
    root.append(notice("Booking is available on the approved business website. This preview is not connected."));
    return;
  }
  let catalog, step = 0, serviceId = "", locationId = "", providerId = "", day = "", slot = null, slots = [], revision = 0, busy = false, requestSerial = 0, error = "", status = "", customer = { name: "", email: "", phone: "" }, accepted = false, challengeToken = "", challengeId, receipt, company = "", attemptKey = "", attemptPayload = "", uncertain = false;
  let objectUrl = "";
  const api = async (path, data) => {
    const response = await fetch(connection.apiOrigin + "/api/booking/v1" + path, { mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(25e3), ...data === void 0 ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) } });
    const text = await response.text();
    if (text.length > 1e6) throw Error("The booking response could not be verified.");
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw Error("Booking is temporarily unavailable. Please contact the business.");
    }
    if (!response.ok) {
      const failure = Object.assign(new Error(typeof result.error === "string" ? result.error : "Booking could not be completed."), { status: response.status, code: result.code });
      throw failure;
    }
    return result;
  };
  const service = () => catalog.services.find((s) => s.id === serviceId);
  const place = () => catalog.locations.find((l) => l.id === locationId);
  const dateOf = (at, zone) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at)), get = (key) => parts.find((p) => p.type === key).value;
    return get("year") + "-" + get("month") + "-" + get("day");
  };
  const addDays = (value, count) => new Date(Date.parse(value + "T12:00:00Z") + count * 864e5).toISOString().slice(0, 10);
  const dayStart = (value, zone) => {
    const target = Date.parse(value + "T00:00:00Z");
    for (let at = target - 14 * 36e5; at <= target + 14 * 36e5; at += 6e4) if (dateOf(at, zone) === value) return new Date(at).toISOString();
    throw Error("This date is unavailable in the selected timezone.");
  };
  const time = (at, zone) => new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(at));
  const fullDate = (at, zone) => new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "long", day: "numeric", year: "numeric" }).format(new Date(at));
  const price = (value) => {
    if (value.amountMinor === null) return value.label || "Price agreed with the business";
    try {
      const options2 = new Intl.NumberFormat("en-US", { style: "currency", currency: value.currency }), digits = options2.resolvedOptions().maximumFractionDigits ?? 2;
      return options2.format(value.amountMinor / 10 ** digits);
    } catch {
      return value.label;
    }
  };
  const button = (label, action, primary = false) => {
    const el = node("button", label, primary ? "vb-primary" : void 0);
    el.type = "button";
    el.dataset.focusKey = label;
    el.disabled = busy;
    el.addEventListener("click", action);
    return el;
  };
  const field = (label, input) => {
    const el = node("label");
    input.dataset.focusKey = label;
    el.append(node("span", label), input);
    return el;
  };
  const detail = (list, label, value) => {
    const row = node("div");
    row.append(node("dt", label), node("dd", value));
    list.append(row);
  };
  const move = (next) => {
    if (busy || uncertain) return;
    step = next;
    error = "";
    status = "";
    render(true);
  };
  const clearTimes = () => {
    requestSerial++;
    slots = [];
    slot = null;
    revision = 0;
    status = "";
    error = "";
    attemptKey = "";
    accepted = false;
  };
  const options = (select, items, value, all) => {
    if (all) {
      const opt = node("option", all);
      opt.value = "";
      select.append(opt);
    }
    for (const item of items) {
      const opt = node("option", item.name);
      opt.value = item.id;
      select.append(opt);
    }
    select.value = value;
  };
  const cleanupChallenge = () => {
    if (challengeId) {
      window.turnstile?.remove(challengeId);
      challengeId = void 0;
    }
    challengeToken = "";
  };
  const errorBlock = () => {
    const el = node("p", error, "vb-error");
    el.setAttribute("role", "alert");
    return el;
  };
  const showSummary = (panel) => {
    const disclosure = node("details");
    disclosure.open = window.matchMedia("(min-width:761px)").matches;
    disclosure.append(node("summary", "Your appointment"));
    const list = node("dl"), s = service();
    if (s) {
      detail(list, "Service", s.name);
      detail(list, "Duration", s.durationMinutes + " minutes");
      detail(list, "Price", price(s.price));
      detail(list, "Confirmation", s.bookingMode === "approval" ? "Business approval required" : "Confirmed when booked");
    }
    if (place()) detail(list, "Location", place().name);
    if (slot) {
      detail(list, "Time", fullDate(slot.startsAt, place().timezone) + " \\xB7 " + time(slot.startsAt, place().timezone));
      detail(list, "Staff", catalog.providers.find((p) => p.id === slot.providerId)?.name || "Available staff");
    }
    disclosure.append(list);
    panel.append(disclosure);
  };
  const normalizeSelection = () => {
    const s = service();
    if (!s) return;
    const places = catalog.locations.filter((l) => s.locationIds.includes(l.id));
    if (!places.some((p) => p.id === locationId)) locationId = places[0]?.id || "";
    const staff = catalog.providers.filter((p) => s.providerIds.includes(p.id) && p.locationIds.includes(locationId));
    if (!catalog.allowProviderChoice || !staff.some((p) => p.id === providerId)) providerId = staff.length === 1 ? staff[0].id : "";
    if (!day && place()) day = dateOf(Date.now() + catalog.minNoticeMinutes * 6e4, place().timezone);
  };
  const loadTimes = async (lookAhead = false) => {
    if (busy || uncertain) return;
    busy = true;
    slot = null;
    error = "";
    status = "Checking availability\\u2026";
    const serial = ++requestSerial;
    render();
    try {
      const zone = place().timezone, params = new URLSearchParams({ serviceId, locationId, startsAt: dayStart(day, zone), endsAt: dayStart(addDays(day, lookAhead ? 6 : 1), zone), ...providerId ? { providerId } : {} });
      const data = await api("/availability?" + params);
      if (serial !== requestSerial) return;
      if (data.schemaVersion !== 1 || data.siteId !== connection.siteId || !Array.isArray(data.slots) || data.slots.length > 500 || !Number.isSafeInteger(data.revision)) throw Error("The availability response could not be verified.");
      if (!data.terms || typeof data.policyText !== "string" || !data.location) throw Error("This service changed. Reload services before booking.");
      const old = JSON.stringify(service());
      Object.assign(service(), data.terms);
      Object.assign(place(), data.location);
      if (catalog.policyText !== data.policyText) accepted = false;
      catalog.policyText = data.policyText;
      slots = data.slots;
      revision = data.revision;
      status = slots.length ? \`\${slots.length} available \${slots.length === 1 ? "time" : "times"}. \${zone}.\` : "No available times for this date. Try another day.";
      if (old !== JSON.stringify(service())) status += " Service details have changed; review the current price and duration.";
      if (data.truncated) status += " Showing the first available times; narrow the date or staff selection.";
    } catch (failure) {
      if (serial === requestSerial) {
        slots = [];
        error = failure instanceof Error ? failure.message : "Availability could not be loaded.";
        status = "";
      }
    } finally {
      if (serial === requestSerial) {
        busy = false;
        render();
      }
    }
  };
  const mountChallenge = async (container) => {
    if (catalog.challenge.kind === "local-fixture") {
      container.append(notice("Local simulation: the security challenge is bypassed only for this isolated loopback preview."));
      return;
    }
    try {
      const win = window;
      if (!win.turnstile) await new Promise((resolve, reject) => {
        let script = document.querySelector("script[data-booking-turnstile]");
        if (!script) {
          script = node("script");
          script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
          script.async = true;
          script.dataset.bookingTurnstile = "";
          document.head.append(script);
        }
        script.addEventListener("load", () => resolve(), { once: true });
        script.addEventListener("error", () => reject(Error("The security check could not load. Please retry or contact the business.")), { once: true });
      });
      if (!container.isConnected || step !== 3) return;
      challengeId = win.turnstile.render(container, { sitekey: catalog.challenge.siteKey, action: "booking", callback: (value) => {
        challengeToken = value;
      }, "expired-callback": () => {
        challengeToken = "";
      }, "error-callback": () => {
        challengeToken = "";
      } });
    } catch (failure) {
      if (container.isConnected) container.append(errorBlockMessage(failure instanceof Error ? failure.message : "Security check unavailable."));
    }
  };
  const errorBlockMessage = (text) => {
    const el = node("p", text, "vb-error");
    el.setAttribute("role", "alert");
    return el;
  };
  const submit = async () => {
    if (busy) return;
    if (!accepted) {
      error = "Accept the booking policy before booking.";
      render();
      return;
    }
    if (catalog.challenge.kind === "turnstile" && !challengeToken) {
      error = "Complete the security check before booking.";
      const existing = root.querySelector("[role=alert]");
      if (existing) existing.textContent = error;
      else root.querySelector(".vb-panel")?.append(errorBlock());
      return;
    }
    const content = { revision, serviceId, locationId, providerId: slot.providerId, startsAt: slot.startsAt, customer, acceptedPolicy: true };
    const payload = JSON.stringify(content);
    if (!attemptKey || attemptPayload !== payload) {
      attemptKey = crypto.randomUUID();
      attemptPayload = payload;
    }
    busy = true;
    error = "";
    status = "Saving your appointment\\u2026";
    const token = challengeToken;
    render();
    try {
      const result = await api("/appointments", { ...content, idempotencyKey: attemptKey, challengeToken: token, company });
      if (result.schemaVersion !== 1 || result.siteId !== connection.siteId || !["confirmed", "pending_approval"].includes(result.status) || typeof result.reference !== "string" || typeof result.calendar?.content !== "string") throw Error("The booking response could not be verified. Keep this page open and retry the same booking.");
      receipt = result;
      uncertain = false;
      step = 4;
      status = "";
    } catch (failure) {
      const f = failure;
      error = f.message || "The booking response was interrupted.";
      status = "";
      if (!f.status || f.status >= 500) {
        uncertain = true;
        error += " Your result may still be pending. Retry this same booking; do not create another appointment.";
      } else {
        uncertain = false;
        if (f.status === 409) {
          step = 1;
          slot = null;
          slots = [];
          revision = 0;
          attemptKey = "";
    accepted = false;
          status = "Your details are saved. Find available times again.";
        } else if (f.status === 400 && String(f.code).startsWith("challenge")) {
          challengeToken = "";
        }
      }
    } finally {
      busy = false;
      render(true);
    }
  };
  function render(focus = false) {
    const focusKey = document.activeElement?.dataset.focusKey;
    cleanupChallenge();
    root.replaceChildren();
    root.append(notice(catalog.emailMode === "send" ? "TEST BOOKING - Emails use the configured sender and allowed test recipients." : catalog.emailMode === "disabled" ? "TEST BOOKING - Customer emails are not enabled. Keep your booking reference." : "TEST BOOKING - This preview stores appointments in the admin calendar. Customer emails are captured, not sent."));
    const progress = node("ol", void 0, "vb-steps");
    progress.setAttribute("aria-label", "Booking progress");
    ["Service", "Time", "Your details", "Review", "Receipt"].forEach((name, index) => {
      const item = node("li", index + 1 + ". " + name);
      if (index === step) item.setAttribute("aria-current", "step");
      progress.append(item);
    });
    root.append(progress);
    const layout = node("div", void 0, "vb-layout"), panel = node("section", void 0, "vb-panel"), summary = node("aside", void 0, "vb-panel vb-summary");
    summary.setAttribute("aria-label", "Appointment summary");
    layout.append(panel, summary);
    root.append(layout);
    showSummary(summary);
    const heading = node("h2", ["Choose a service", "Choose a time", "Your details", "Review your appointment", receipt?.status === "pending_approval" ? "Request received" : "Appointment confirmed"][step]);
    heading.tabIndex = -1;
    panel.append(heading);
    if (error) panel.append(errorBlock());
    if (status) {
      const live = node("p", status);
      live.setAttribute("role", "status");
      panel.append(live);
    }
    if (step === 0) {
      if (!catalog.services.length) {
        panel.append(node("p", "No services are available for online booking. Please contact the business."));
        return;
      }
      const group = node("fieldset"), legend = node("legend", "Available services"), list = node("div", void 0, "vb-services");
      group.append(legend, list);
      for (const s of catalog.services) {
        const radio = node("input");
        radio.type = "radio";
        radio.name = "booking-service";
        radio.dataset.focusKey = "service-" + s.id;
        radio.value = s.id;
        radio.checked = s.id === serviceId;
        radio.addEventListener("change", () => {
          serviceId = s.id;
          clearTimes();
          normalizeSelection();
          render();
        });
        const label = node("label", void 0, "vb-service"), copy = node("span");
        copy.append(node("strong", s.name), node("small", s.durationMinutes + " minutes \\xB7 " + price(s.price)), node("small", s.bookingMode === "approval" ? "Requires business approval" : "Immediate confirmation"));
        label.append(radio, copy);
        list.append(label);
      }
      panel.append(group, button("Choose a time", () => {
        normalizeSelection();
        move(1);
      }, true));
    } else if (step === 1) {
      const s = service(), grid = node("div", void 0, "vb-grid"), places = catalog.locations.filter((l) => s.locationIds.includes(l.id));
      if (places.length > 1) {
        const select = node("select");
        options(select, places, locationId);
        select.disabled = busy || uncertain;
        select.addEventListener("change", () => {
          locationId = select.value;
          day = "";
          clearTimes();
          normalizeSelection();
          render();
        });
        grid.append(field("Location", select));
      }
      const staff = catalog.providers.filter((p) => s.providerIds.includes(p.id) && p.locationIds.includes(locationId));
      if (catalog.allowProviderChoice && staff.length > 1) {
        const select = node("select");
        options(select, staff, providerId, "Any available staff");
        select.disabled = busy || uncertain;
        select.addEventListener("change", () => {
          providerId = select.value;
          clearTimes();
          render();
        });
        grid.append(field("Staff preference", select));
      }
      const date = node("input");
      date.type = "date";
      date.required = true;
      date.value = day;
      date.min = dateOf(Date.now(), place().timezone);
      date.max = dateOf(Date.now() + catalog.horizonDays * 864e5, place().timezone);
      date.disabled = busy || uncertain;
      date.addEventListener("change", () => {
        if (date.value) {
          day = date.value;
          clearTimes();
          render();
        }
      });
      grid.append(field("Appointment date", date));
      panel.append(grid, node("p", "Times are shown in " + place().timezone + ". A time is reserved only after booking.", "vb-hint"), button(busy ? "Checking times\\u2026" : "Find available times", () => {
        void loadTimes();
      }));
      const times = node("div", void 0, "vb-times");
      times.setAttribute("aria-label", "Available times");
      const seen = /* @__PURE__ */ new Set();
      for (const value of slots) {
        if (!providerId && seen.has(value.startsAt)) continue;
        seen.add(value.startsAt);
        const label = time(value.startsAt, place().timezone), b = button(label, () => {
          slot = value;
          render();
        });
        b.dataset.focusKey = value.startsAt + "-" + value.providerId;
        b.setAttribute("aria-pressed", String(slot?.startsAt === value.startsAt && slot.providerId === value.providerId));
        b.setAttribute("aria-label", fullDate(value.startsAt, place().timezone) + " at " + label);
        b.append(node("small", fullDate(value.startsAt, place().timezone)));
        times.append(b);
      }
      panel.append(times);
      if (!slots.length && !busy) panel.append(button("Look ahead six days", () => {
        void loadTimes(true);
      }));
      const actions = node("div", void 0, "vb-actions"), next = button("Continue to your details", () => move(2), true);
      next.disabled = !slot || busy;
      actions.append(button("Back to services", () => move(0)), next);
      panel.append(actions);
    } else if (step === 2) {
      const form = node("form");
      for (const [key, label, type, autocomplete] of [["name", "Full name", "text", "name"], ["email", "Email address", "email", "email"], ["phone", "Phone number (optional)", "tel", "tel"]]) {
        const input = node("input");
        input.name = key;
        input.type = type;
        input.autocomplete = autocomplete;
        input.required = key !== "phone";
        input.maxLength = key === "email" ? 254 : key === "name" ? 160 : 40;
        input.value = customer[key];
        input.addEventListener("input", () => {
          customer[key] = input.value;
        });
        form.append(field(label, input));
      }
      const hidden = node("div", void 0, "vb-honey");
      hidden.setAttribute("aria-hidden", "true");
      const honey = node("input");
      honey.name = "company";
      honey.tabIndex = -1;
      honey.autocomplete = "off";
      honey.addEventListener("input", () => {
        company = honey.value;
      });
      hidden.append(field("Leave this field empty", honey));
      form.append(hidden, node("p", "Your details are used to arrange this appointment. See the test email mode above before submitting.", "vb-hint"));
      const actions = node("div", void 0, "vb-actions"), next = button("Review appointment", () => {
      }, true);
      next.type = "submit";
      actions.append(button("Back to times", () => move(1)), next);
      form.append(actions);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (form.reportValidity()) {
          customer = { name: customer.name.trim(), email: customer.email.trim(), phone: customer.phone.trim() };
          move(3);
        }
      });
      panel.append(form);
    } else if (step === 3) {
      const list = node("dl");
      detail(list, "Customer", customer.name);
      detail(list, "Email", customer.email);
      if (customer.phone) detail(list, "Phone", customer.phone);
      panel.append(list, node("h3", "Booking policy"), node("p", catalog.policyText, "vb-policy"));
      if(catalog.customerManagement){const m=catalog.customerManagement;panel.append(node("p","Online cancellation notice: "+m.cancellationCutoffMinutes+" minutes. Online rescheduling notice: "+m.rescheduleCutoffMinutes+" minutes. Zero permits changes until the appointment starts.","vb-hint"));}
      const check = node("input");
      check.type = "checkbox";
      check.checked = accepted;
      check.disabled = busy || uncertain;
      check.addEventListener("change", () => {
        accepted = check.checked;
      });
      const label = node("label", void 0, "vb-check");
      label.append(check, node("span", "I have read and accept the booking policy."));
      panel.append(label);
      if (!busy) {
        const challenge = node("div");
        panel.append(challenge);
        void mountChallenge(challenge);
      }
      const actions = node("div", void 0, "vb-actions");
      if (!uncertain) actions.append(button("Back to your details", () => move(2)));
      actions.append(button(busy ? "Booking\\u2026" : uncertain ? "Retry same booking" : service().bookingMode === "approval" ? "Request appointment" : "Confirm appointment", () => {
        void submit();
      }, true));
      panel.append(actions);
    } else if (receipt) {
      const pending = receipt.status === "pending_approval";
      panel.append(node("p", pending ? "The business needs to approve your request. Your time is held until the approval deadline. This request is not yet confirmed." : "Your appointment is saved in the business calendar.", "vb-status"));
      const list = node("dl");
      detail(list, "Service", receipt.serviceName);
      detail(list, "When", fullDate(receipt.startsAt, receipt.timezone) + " \\xB7 " + time(receipt.startsAt, receipt.timezone));
      detail(list, "Location", receipt.locationName);
      detail(list, "Staff", receipt.providerName);
      detail(list, "Price", price(receipt.price));
      if (receipt.expiresAt) detail(list, "Approval deadline", fullDate(receipt.expiresAt, receipt.timezone) + " \\xB7 " + time(receipt.expiresAt, receipt.timezone));
      panel.append(list, node("p", "Booking reference", "vb-hint"), node("p", receipt.reference, "vb-reference"), node("p", "Keep this reference. " + (receipt.emailStatus === "captured" ? "Your test email is captured in the admin Customer emails inbox. Its private links can cancel or reschedule this appointment." : receipt.emailStatus === "accepted" ? "Your email was accepted by the email provider. Check your inbox for private cancellation and rescheduling links." : receipt.emailStatus === "blocked" || receipt.emailStatus === "unknown" ? "Your appointment is saved, but the email needs attention. Contact the business if you do not receive it." : (catalog.emailMode === "disabled" ? "Customer emails are not enabled. Contact the business for appointment changes." : "Open your appointment email for cancellation and rescheduling links. Email delivery may still be pending.")) + "", "vb-hint"));
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(new Blob([receipt.calendar.content], { type: "text/calendar;charset=utf-8" }));
      const link = node("a", "Download calendar file (.ics)");
      link.href = objectUrl;
      link.download = "appointment.ics";
      panel.append(link, node("p", "A calendar file adds a copy to your calendar. It does not keep your calendar synchronized.", "vb-hint"));
    }
    if (focus) heading.focus({ preventScroll: false });
    else if (focusKey) root.querySelector('[data-focus-key="' + CSS.escape(focusKey) + '"]')?.focus({ preventScroll: true });
  }
  root.append(notice("Loading available services\\u2026"));
  void api("/catalog").then((data) => {
    if (data.schemaVersion !== 1 || data.siteId !== connection.siteId || data.installationId !== connection.installationId || data.siteOrigin !== connection.siteOrigin || data.mode !== "test" || !Array.isArray(data.services) || data.services.length > 128 || !Array.isArray(data.providers) || !Array.isArray(data.locations) || !["local-fixture", "turnstile"].includes(data.challenge?.kind)) throw Error("This website booking connection could not be verified. Please contact the business.");
    catalog = data;
    serviceId = new URL(location.href).searchParams.get("service") || data.services[0]?.id || "";
    if (!data.services.some((s) => s.id === serviceId)) serviceId = data.services[0]?.id || "";
    normalizeSelection();
    render();
  }).catch((failure) => {
    root.replaceChildren(errorBlockMessage(failure instanceof Error ? failure.message : "Booking is unavailable."));
    root.append(button("Try loading services again", () => location.reload()));
  });
  window.addEventListener("beforeunload", (event) => {
    if (uncertain || busy && step === 3) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
})();`;
