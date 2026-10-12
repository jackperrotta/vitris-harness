import { escapeHtml } from "../../html.ts";

export type DailyRow = {
  day: string;
  pageviews: number;
  uniques: number;
  leads: number;
  sessions: number;
  bounces: number;
  engaged: number;
  duration_ms: number;
  leave_count: number;
  scroll_25: number;
  scroll_50: number;
  scroll_75: number;
  scroll_100: number;
  converts_form: number;
  converts_tel: number;
  converts_mailto: number;
  converts_maps: number;
  engage_nav: number;
  engage_btn: number;
  engage_img: number;
  engage_carousel: number;
  top_paths_json: string;
  top_refs_json: string;
  channels_json: string;
  devices_json: string;
  hours_json: string;
  top_engage_json: string;
};

type Top = { key: string; n: number };

function parseTop(raw: string | null | undefined): Top[] {
  try {
    const data = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const key = String(r.key ?? r.path ?? r.referrer ?? "");
        const n = Number(r.n) || 0;
        return key ? { key, n } : null;
      })
      .filter((x): x is Top => !!x);
  } catch {
    return [];
  }
}

function mergeTop(rows: DailyRow[], field: keyof DailyRow): Top[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    for (const item of parseTop(String(row[field] ?? "[]"))) {
      map.set(item.key, (map.get(item.key) || 0) + item.n);
    }
  }
  return [...map.entries()]
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
}

function sum(rows: DailyRow[], key: keyof DailyRow): number {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}

function fmtDuration(ms: number): string {
  if (!ms || ms < 1000) return "0s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

function pct(num: number, den: number): string {
  if (!den) return "—";
  return `${Math.round((num / den) * 100)}%`;
}

function bars(items: Top[], empty: string): string {
  if (!items.length) return `<p class="muted">${escapeHtml(empty)}</p>`;
  const max = Math.max(...items.map((i) => i.n), 1);
  return `<ul class="bars">${items
    .map(
      (i) => `<li>
      <span class="bars__label">${escapeHtml(i.key)}</span>
      <span class="bars__track"><span class="bars__fill" style="width:${Math.max(4, Math.round((i.n / max) * 100))}%"></span></span>
      <span class="bars__n">${i.n}</span>
    </li>`,
    )
    .join("")}</ul>`;
}

function funnel(leaveCount: number, s25: number, s50: number, s75: number, s100: number): string {
  const steps = [
    { label: "25%", n: s25 },
    { label: "50%", n: s50 },
    { label: "75%", n: s75 },
    { label: "100%", n: s100 },
  ];
  const max = Math.max(leaveCount, 1);
  return `<ul class="bars">${steps
    .map(
      (s) => `<li>
      <span class="bars__label">Reached ${s.label}</span>
      <span class="bars__track"><span class="bars__fill" style="width:${Math.max(4, Math.round((s.n / max) * 100))}%"></span></span>
      <span class="bars__n">${pct(s.n, leaveCount)}</span>
    </li>`,
    )
    .join("")}</ul>`;
}

function sparkline(values: number[]): string {
  if (values.length < 2) return `<p class="muted">Not enough days yet.</p>`;
  const w = 320;
  const h = 64;
  const max = Math.max(...values, 1);
  const step = (w - 4) / (values.length - 1);
  const pts = values
    .map((v, i) => {
      const x = 2 + i * step;
      const y = h - 4 - (v / max) * (h - 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="100%" height="64" role="img" aria-label="Pageviews over time">
    <polyline fill="none" stroke="currentColor" stroke-width="2" points="${pts}"></polyline>
  </svg>`;
}

function hourBars(items: Top[]): string {
  const map = new Map(items.map((i) => [i.key, i.n]));
  const rows: Top[] = [];
  for (let h = 0; h < 24; h++) {
    const key = String(h);
    rows.push({ key: `${String(h).padStart(2, "0")}:00`, n: map.get(key) || 0 });
  }
  const max = Math.max(...rows.map((r) => r.n), 1);
  return `<div class="hours" role="img" aria-label="Visits by hour">${rows
    .map(
      (r) => `<span class="hours__col" title="${escapeHtml(r.key)}: ${r.n}">
      <span class="hours__bar" style="height:${Math.max(2, Math.round((r.n / max) * 100))}%"></span>
    </span>`,
    )
    .join("")}</div>`;
}

export function renderAnalyticsPage(opts: {
  range: 7 | 30;
  rows: DailyRow[];
  liveTotal: number;
  livePaths: { path: string; n: number }[];
}): string {
  const chronological = [...opts.rows].sort((a, b) => a.day.localeCompare(b.day));
  const pageviews = sum(opts.rows, "pageviews");
  const visitors = sum(opts.rows, "uniques");
  const sessions = sum(opts.rows, "sessions");
  const bounces = sum(opts.rows, "bounces");
  const engaged = sum(opts.rows, "engaged");
  const duration = sum(opts.rows, "duration_ms");
  const leaves = sum(opts.rows, "leave_count");
  const converts =
    sum(opts.rows, "converts_form") +
    sum(opts.rows, "converts_tel") +
    sum(opts.rows, "converts_mailto") +
    sum(opts.rows, "converts_maps");

  const livePaths = opts.livePaths.length
    ? `<ul class="live__paths">${opts.livePaths
        .map((p) => `<li><code>${escapeHtml(p.path)}</code> · ${p.n}</li>`)
        .join("")}</ul>`
    : `<p class="muted" id="live-empty">No one on the public site right now.</p>`;

  const dayRows = chronological
    .slice()
    .reverse()
    .map(
      (d) =>
        `<tr>
          <td>${escapeHtml(d.day)}</td>
          <td>${d.pageviews}</td>
          <td>${d.uniques}</td>
          <td>${d.sessions}</td>
          <td>${pct(d.bounces, d.sessions)}</td>
          <td>${d.converts_form + d.converts_tel + d.converts_mailto + d.converts_maps}</td>
        </tr>`,
    )
    .join("");

  return `<div class="top">
      <div>
        <h1>Analytics</h1>
        <p class="muted">Public traffic only · preview visits are excluded</p>
      </div>
      <div class="range">
        <a class="btn ghost${opts.range === 7 ? " is-on" : ""}" href="/app/analytics?range=7">7 days</a>
        <a class="btn ghost${opts.range === 30 ? " is-on" : ""}" href="/app/analytics?range=30">30 days</a>
      </div>
    </div>

    <div class="live card" id="live-strip" data-live>
      <div class="live__head">
        <span class="live__dot" aria-hidden="true"></span>
        <strong id="live-count">${opts.liveTotal}</strong>
        <span class="muted">on the site now</span>
      </div>
      <div id="live-paths">${livePaths}</div>
    </div>

    <div class="kpis kpis--dense">
      <div class="card"><span class="muted">Visitors</span><strong>${visitors}</strong></div>
      <div class="card"><span class="muted">Pageviews</span><strong>${pageviews}</strong></div>
      <div class="card"><span class="muted">Bounce rate</span><strong>${pct(bounces, sessions)}</strong></div>
      <div class="card"><span class="muted">Engaged sessions</span><strong>${engaged}</strong></div>
      <div class="card"><span class="muted">Avg time on page</span><strong>${fmtDuration(leaves ? duration / leaves : 0)}</strong></div>
      <div class="card"><span class="muted">Conversions</span><strong>${converts}</strong></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2 class="card__title">Pageviews</h2>
        ${sparkline(chronological.map((d) => d.pageviews))}
      </div>
      <div class="card">
        <h2 class="card__title">Scroll depth</h2>
        ${funnel(
          sum(opts.rows, "leave_count"),
          sum(opts.rows, "scroll_25"),
          sum(opts.rows, "scroll_50"),
          sum(opts.rows, "scroll_75"),
          sum(opts.rows, "scroll_100"),
        )}
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2 class="card__title">Channels</h2>
        ${bars(mergeTop(opts.rows, "channels_json"), "No channel data yet.")}
      </div>
      <div class="card">
        <h2 class="card__title">Devices</h2>
        ${bars(mergeTop(opts.rows, "devices_json"), "No device data yet.")}
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2 class="card__title">Top pages</h2>
        ${bars(mergeTop(opts.rows, "top_paths_json"), "Open the public site once (not only preview).")}
      </div>
      <div class="card">
        <h2 class="card__title">Time of day</h2>
        ${hourBars(mergeTop(opts.rows, "hours_json"))}
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2 class="card__title">Engagement clicks</h2>
        ${bars(
          [
            { key: "Nav", n: sum(opts.rows, "engage_nav") },
            { key: "Buttons", n: sum(opts.rows, "engage_btn") },
            { key: "Images", n: sum(opts.rows, "engage_img") },
            { key: "Carousel", n: sum(opts.rows, "engage_carousel") },
          ].filter((r) => r.n > 0),
          "No engagement clicks yet.",
        )}
        <h3 class="card__sub">Top labels</h3>
        ${bars(mergeTop(opts.rows, "top_engage_json"), "—")}
      </div>
      <div class="card">
        <h2 class="card__title">Conversions</h2>
        <table>
          <tbody>
            <tr><td>Forms</td><td>${sum(opts.rows, "converts_form")}</td></tr>
            <tr><td>Phone clicks</td><td>${sum(opts.rows, "converts_tel")}</td></tr>
            <tr><td>Email clicks</td><td>${sum(opts.rows, "converts_mailto")}</td></tr>
            <tr><td>Maps / directions</td><td>${sum(opts.rows, "converts_maps")}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2 class="card__title">By day</h2>
      <table>
        <thead><tr><th>Day</th><th>Views</th><th>Visitors</th><th>Sessions</th><th>Bounce</th><th>Converts</th></tr></thead>
        <tbody>${dayRows || `<tr><td colspan="6" class="muted">No traffic yet. Open the public site once (not only preview).</td></tr>`}</tbody>
      </table>
    </div>

    <script>
    (() => {
      const countEl = document.getElementById("live-count");
      const pathsEl = document.getElementById("live-paths");
      if (!countEl || !pathsEl) return;
      const render = (data) => {
        countEl.textContent = String(data.total || 0);
        if (!data.paths || !data.paths.length) {
          pathsEl.innerHTML = '<p class="muted">No one on the public site right now.</p>';
          return;
        }
        pathsEl.innerHTML = '<ul class="live__paths">' + data.paths.map((p) =>
          '<li><code>' + String(p.path).replace(/</g, "&lt;") + '</code> · ' + p.n + '</li>'
        ).join("") + '</ul>';
      };
      const tick = () => fetch("/app/analytics/live", { credentials: "same-origin" })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) render(d); })
        .catch(() => {});
      setInterval(tick, 10000);
    })();
    </script>`;
}
