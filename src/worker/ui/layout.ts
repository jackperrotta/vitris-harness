import { stockCatalogJson, stockPickerCss } from "../../gen/stock.ts";
import { escapeHtml } from "../../html.ts";
import { adminCss } from "./css.ts";
import type { Session } from "../auth.ts";

const ICONS = {
  overview:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/></svg>',
  site: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5zM8 8h8M8 12h8M8 16h5"/></svg>',
  leads:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 6h16v12H4zM8 6v12M4 10h16"/></svg>',
  analytics:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M5 19V10M12 19V5M19 19v-7"/></svg>',
  domain:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 12h16M12 4c2.5 2.6 3.8 5.3 3.8 8S14.5 17.4 12 20c-2.5-2.6-3.8-5.3-3.8-8S9.5 6.6 12 4z"/></svg>',
  ops: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 4.5v2.2M12 17.3v2.2M4.5 12h2.2M17.3 12h2.2M6.4 6.4l1.6 1.6M16 16l1.6 1.6M17.6 6.4 16 8M8 16l-1.6 1.6"/></svg>',
  logout:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M10 6H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3M15 8l5 4-5 4M20 12H11"/></svg>',
  collapse:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M15 6 9 12l6 6"/></svg>',
};

export function page(opts: {
  title: string;
  session?: Session | null;
  path?: string;
  notice?: string;
  error?: string;
  body: string;
  canvas?: boolean;
}): string {
  const nav = opts.session
    ? `<aside class="side">
        <a class="brand" href="/app" title="Vitris">
          <span class="brand-mark" aria-hidden="true">V</span>
          <span class="nav-label">Vitris</span>
        </a>
        <nav class="nav" aria-label="Admin">
          ${item("/app", "Overview", ICONS.overview, opts.path)}
          ${item("/app/requests", "Requests", ICONS.site, opts.path)}
          ${item("/app/leads", "Leads", ICONS.leads, opts.path)}
          ${item("/app/analytics", "Analytics", ICONS.analytics, opts.path)}
          ${item("/app/domain", "Domain", ICONS.domain, opts.path)}
          ${opts.session.role === "operator" ? item("/ops/inbox", "Inbox", ICONS.site, opts.path) : ""}
          ${opts.session.role === "operator" ? item("/ops", "Operator", ICONS.ops, opts.path) : ""}
        </nav>
        <div class="side-foot">
          <p class="who">
            <span class="nav-label who-email">${escapeHtml(opts.session.email)}</span>
            <form method="post" action="/app/logout"><button class="side-icon" type="submit" title="Log out">${ICONS.logout}<span class="nav-label">Log out</span></button></form>
          </p>
          <button type="button" class="nav-toggle" id="nav-toggle" aria-controls="app-shell" title="Collapse navigation">
            ${ICONS.collapse}
            <span class="nav-label">Collapse</span>
          </button>
        </div>
      </aside>`
    : "";

  const flash = opts.error
    ? `<p class="flash err" role="status">${escapeHtml(opts.error)}</p>`
    : opts.notice
      ? `<p class="flash" role="status">${escapeHtml(opts.notice)}</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(opts.title)}</title>
  <script>
    (() => {
      try {
        const stored = localStorage.getItem("vitris-nav");
        document.documentElement.dataset.nav = stored === "collapsed" || stored === "open" ? stored : "open";
      } catch (e) {
        document.documentElement.dataset.nav = "open";
      }
    })();
  </script>
  <style>${adminCss}</style>
  <style>${stockPickerCss}</style>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <div class="${opts.session ? "shell" : ""}" id="app-shell">
    ${nav}
    <div class="${opts.session ? "main" : ""}${opts.canvas ? " main--canvas" : ""}" id="main">
      ${opts.canvas ? "" : flash}
      ${opts.body}
    </div>
  </div>
  <script>window.VitrisStock=window.VitrisStock||{};window.VitrisStock.catalog=${stockCatalogJson};</script>
  <script src="/stock/picker.js" defer></script>
  <script>
    (() => {
      const root = document.documentElement;
      const btn = document.getElementById("nav-toggle");
      if (!btn) return;
      const sync = () => {
        const open = root.dataset.nav !== "collapsed";
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.setAttribute("title", open ? "Collapse navigation" : "Expand navigation");
        const label = btn.querySelector(".nav-label");
        if (label) label.textContent = open ? "Collapse" : "Expand";
      };
      sync();
      btn.addEventListener("click", () => {
        const next = root.dataset.nav === "collapsed" ? "open" : "collapsed";
        root.dataset.nav = next;
        try { localStorage.setItem("vitris-nav", next); } catch (e) {}
        sync();
      });
    })();
  </script>
</body>
</html>`;
}

function item(href: string, label: string, icon: string, current?: string): string {
  const active =
    current === href ||
    (href !== "/app" && href !== "/ops" && !!current?.startsWith(href));
  return `<a href="${href}" title="${escapeHtml(label)}" ${active ? 'aria-current="page"' : ""}>${icon}<span class="nav-label">${escapeHtml(label)}</span></a>`;
}
