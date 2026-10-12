(() => {
  const kernel = document.documentElement.getAttribute("data-kernel");
  if (!kernel) return;

  const endpoint = kernel.replace(/\/$/, "") + "/api/t";
  const gpc = navigator.globalPrivacyControl === true
    || navigator.doNotTrack === "1"
    || window.doNotTrack === "1";
  const preview = location.pathname.match(/^\/preview\/([^/]+)/);
  const src = preview ? "preview" : "live";
  const path = location.pathname || "/";
  const params = new URLSearchParams(location.search);
  const started = Date.now();
  let maxScroll = 0;
  let engageCount = 0;
  let left = false;
  let pingTimer = 0;

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  }));

  const readCookie = (name) => {
    const parts = document.cookie.split("; ");
    for (const part of parts) {
      const i = part.indexOf("=");
      if (i === -1) continue;
      if (part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
    }
    return "";
  };

  const writeCookie = (name, value, days) => {
    const maxAge = Math.floor(days * 86400);
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = name + "=" + encodeURIComponent(value)
      + "; Path=/; Max-Age=" + maxAge + "; SameSite=Lax" + secure;
  };

  const clearCookie = (name) => {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = name + "=; Path=/; Max-Age=0; SameSite=Lax" + secure;
  };

  const privacyHref = () => {
    if (preview) return "/preview/" + preview[1] + "/cookie-compliance";
    return "/cookie-compliance";
  };

  let consent = gpc ? "0" : (readCookie("vitris_cc") || "");
  let allowCookie = !gpc && consent !== "0";

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let vid = "";

  const ensureVid = () => {
    if (!allowCookie) {
      vid = "";
      return;
    }
    vid = readCookie("vitris_vid");
    if (!uuidRe.test(vid)) vid = uuid();
    writeCookie("vitris_vid", vid, 395);
  };
  ensureVid();

  const sidKey = "vitris_sid";
  const sidAtKey = "vitris_sid_at";
  let sid = "";
  try {
    const last = Number(sessionStorage.getItem(sidAtKey) || "0");
    sid = sessionStorage.getItem(sidKey) || "";
    if (!sid || !last || Date.now() - last > 30 * 60 * 1000) sid = uuid();
    sessionStorage.setItem(sidKey, sid);
    sessionStorage.setItem(sidAtKey, String(Date.now()));
  } catch {
    sid = uuid();
  }

  const touchSid = () => {
    try { sessionStorage.setItem(sidAtKey, String(Date.now())); } catch (_) {}
  };

  const syncVidFields = () => {
    document.querySelectorAll('form[data-lead-form] input[name="vid"]').forEach((el) => {
      el.value = vid || "";
    });
  };
  syncVidFields();

  const send = (payload) => {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(payload)) {
      if (v == null || v === "") continue;
      body.set(k, String(v));
    }
    if (preview) body.set("slug", preview[1]);
    if (vid) body.set("vid", vid);
    body.set("sid", sid);
    body.set("src", src);
    body.set("path", path);
    if (navigator.sendBeacon && navigator.sendBeacon(endpoint, body)) return;
    try {
      fetch(endpoint, { method: "POST", body, keepalive: true, credentials: "omit", mode: "cors" }).catch(() => {});
    } catch (_) {}
  };

  let referrerHost = "";
  try {
    if (document.referrer) referrerHost = new URL(document.referrer).hostname.replace(/^www\./, "");
  } catch (_) {}

  send({
    kind: "pageview",
    referrer: referrerHost,
    utm_medium: params.get("utm_medium") || "",
    utm_source: params.get("utm_source") || "",
    hour: String(new Date().getHours()),
  });

  const measureScroll = () => {
    const doc = document.documentElement;
    const bodyEl = document.body;
    const height = Math.max(doc.scrollHeight, bodyEl ? bodyEl.scrollHeight : 0, 1);
    const view = window.innerHeight || doc.clientHeight || 0;
    const top = window.scrollY || doc.scrollTop || 0;
    const pct = Math.min(100, Math.round(((top + view) / height) * 100));
    if (pct > maxScroll) maxScroll = pct;
  };
  measureScroll();
  let scrollRaf = 0;
  window.addEventListener("scroll", () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      measureScroll();
      touchSid();
    });
  }, { passive: true });

  const leave = () => {
    if (left) return;
    left = true;
    measureScroll();
    const duration = Math.min(30 * 60 * 1000, Math.max(0, Date.now() - started));
    send({ kind: "leave", duration_ms: String(duration), scroll_pct: String(maxScroll) });
    stopPing();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") leave();
    else if (allowCookie) {
      startPing();
      sendPing();
    }
  });
  window.addEventListener("pagehide", leave);

  const isMaps = (href) => {
    const h = (href || "").toLowerCase();
    return h.includes("google.com/maps") || h.includes("maps.google.")
      || h.includes("maps.apple.com") || h.includes("bing.com/maps") || h.includes("goo.gl/maps");
  };

  const labelOf = (el) => {
    if (!el) return "";
    const raw = (el.getAttribute("aria-label") || el.getAttribute("alt") || el.textContent || "")
      .replace(/\s+/g, " ").trim();
    return raw.slice(0, 40);
  };

  const hrefPath = (href) => {
    try { return new URL(href, location.href).pathname.slice(0, 200); }
    catch (_) { return ""; }
  };

  document.addEventListener("click", (event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;

    if (t.closest("[data-cookie-accept]")) {
      event.preventDefault();
      acceptCookies();
      return;
    }
    if (t.closest("[data-cookie-reject]")) {
      event.preventDefault();
      rejectCookies();
      return;
    }

    touchSid();

    const a = t.closest("a[href]");
    if (a) {
      const href = a.getAttribute("href") || "";
      const low = href.toLowerCase();
      if (low.startsWith("tel:")) {
        send({ kind: "convert", goal: "tel", label: labelOf(a) });
        return;
      }
      if (low.startsWith("mailto:")) {
        send({ kind: "convert", goal: "mailto", label: labelOf(a) });
        return;
      }
      if (isMaps(href)) {
        send({ kind: "convert", goal: "maps", label: labelOf(a), href: hrefPath(href) });
        return;
      }
    }

    if (engageCount >= 25) return;

    const carousel = t.closest("[data-quotes-prev], [data-quotes-next], [data-stage-prev], [data-stage-next]");
    if (carousel) {
      engageCount += 1;
      send({ kind: "engage", action: "carousel", label: labelOf(carousel) });
      return;
    }

    const navA = t.closest("[data-nav] a, .c-header__nav a, nav[aria-label='Primary'] a");
    if (navA) {
      engageCount += 1;
      send({ kind: "engage", action: "nav", label: labelOf(navA), href: hrefPath(navA.getAttribute("href") || "") });
      return;
    }

    const btn = t.closest("a.btn, button.btn, .btn-outline, .btn-arrow, .c-header__cta");
    if (btn) {
      if (btn.closest("form[data-lead-form]") && (btn.matches("button, [type='submit']"))) return;
      engageCount += 1;
      send({ kind: "engage", action: "btn", label: labelOf(btn), href: hrefPath(btn.getAttribute("href") || "") });
      return;
    }

    if (t.closest("img") || (a && a.querySelector("img"))) {
      const img = t.closest("img") || (a && a.querySelector("img"));
      const link = (img && img.closest("a")) || a;
      engageCount += 1;
      send({
        kind: "engage",
        action: "img",
        label: labelOf(img || link),
        href: hrefPath(link && link.getAttribute ? link.getAttribute("href") || "" : ""),
      });
    }
  }, true);

  const sendPing = () => {
    if (!allowCookie || document.visibilityState !== "visible") return;
    send({ kind: "ping" });
  };
  const startPing = () => {
    if (!allowCookie || pingTimer) return;
    pingTimer = window.setInterval(sendPing, 15000);
  };
  const stopPing = () => {
    if (!pingTimer) return;
    clearInterval(pingTimer);
    pingTimer = 0;
  };
  if (allowCookie) {
    sendPing();
    startPing();
  }

  const removeBanner = () => {
    const el = document.getElementById("vitris-cookie-banner");
    if (el) el.remove();
  };

  const acceptCookies = () => {
    if (gpc) return;
    consent = "1";
    writeCookie("vitris_cc", "1", 395);
    allowCookie = true;
    ensureVid();
    syncVidFields();
    removeBanner();
    if (document.visibilityState === "visible") {
      startPing();
      sendPing();
    }
  };

  const rejectCookies = () => {
    consent = "0";
    writeCookie("vitris_cc", "0", 395);
    clearCookie("vitris_vid");
    vid = "";
    allowCookie = false;
    syncVidFields();
    stopPing();
    removeBanner();
  };

  if (!gpc && !consent) {
    const banner = document.createElement("div");
    banner.id = "vitris-cookie-banner";
    banner.className = "c-cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-modal", "false");
    banner.setAttribute("aria-labelledby", "vitris-cookie-title");
    banner.setAttribute("aria-describedby", "vitris-cookie-desc");
    banner.innerHTML = '<div class="c-cookie-banner__inner wrap">'
      + '<div class="c-cookie-banner__copy">'
      + '<p id="vitris-cookie-title" class="c-cookie-banner__title">Cookies on this site</p>'
      + '<p id="vitris-cookie-desc" class="c-cookie-banner__text">'
      + "We use a first-party cookie to understand visits and improve this website. "
      + "You can accept or reject analytics cookies."
      + "</p>"
      + "</div>"
      + '<div class="c-cookie-banner__actions">'
      + '<button type="button" class="btn" data-cookie-accept>Accept</button>'
      + '<button type="button" class="btn btn-ghost" data-cookie-reject>Reject</button>'
      + '<a class="c-cookie-banner__more" href="' + privacyHref() + '">Learn more</a>'
      + "</div>"
      + "</div>";
    const mount = () => {
      if (!document.body || document.getElementById("vitris-cookie-banner")) return;
      document.body.prepend(banner);
    };
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);
  }
})();
