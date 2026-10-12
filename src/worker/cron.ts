import { tallyTop } from "../analytics.ts";
import type { Env } from "./env.ts";

type CountRow = { n: number };
type KeyCount = { key: string; n: number };

async function count(
  env: Env,
  sql: string,
  ...binds: (string | number)[]
): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...binds)
    .first<CountRow>();
  return row?.n ?? 0;
}

async function groupCounts(
  env: Env,
  sql: string,
  ...binds: (string | number)[]
): Promise<KeyCount[]> {
  const rows = await env.DB.prepare(sql)
    .bind(...binds)
    .all<KeyCount>();
  return rows.results ?? [];
}

/** Exclude preview traffic from owner-facing rollups. */
const LIVE = `AND (src IS NULL OR src = '' OR src = 'live')`;

export async function rollupDay(env: Env, tenantId: string, day: string): Promise<void> {
  const pageviews = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'pageview' ${LIVE}`,
    tenantId,
    day,
  );

  const uniques = await count(
    env,
    `SELECT COUNT(DISTINCT vid) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'pageview' ${LIVE}`,
    tenantId,
    day,
  );

  const sessions = await count(
    env,
    `SELECT COUNT(DISTINCT sid) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'pageview' AND sid IS NOT NULL AND sid != '' ${LIVE}`,
    tenantId,
    day,
  );

  const bounced = await count(
    env,
    `SELECT COUNT(*) AS n FROM (
       SELECT sid FROM analytics_events
       WHERE tenant_id = ? AND day = ? AND sid IS NOT NULL AND sid != '' ${LIVE}
       GROUP BY sid
       HAVING SUM(CASE WHEN kind = 'pageview' THEN 1 ELSE 0 END) = 1
          AND SUM(CASE WHEN kind = 'convert' THEN 1 ELSE 0 END) = 0
     )`,
    tenantId,
    day,
  );

  const engaged = await count(
    env,
    `SELECT COUNT(*) AS n FROM (
       SELECT sid FROM analytics_events
       WHERE tenant_id = ? AND day = ? AND sid IS NOT NULL AND sid != '' ${LIVE}
       GROUP BY sid
       HAVING SUM(CASE WHEN kind = 'engage' OR kind = 'convert' THEN 1 ELSE 0 END) > 0
           OR MAX(CASE WHEN kind = 'leave' THEN scroll_pct ELSE 0 END) >= 50
     )`,
    tenantId,
    day,
  );

  const duration_ms = await count(
    env,
    `SELECT COALESCE(SUM(duration_ms), 0) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'leave' ${LIVE}`,
    tenantId,
    day,
  );

  const leave_count = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'leave' ${LIVE}`,
    tenantId,
    day,
  );

  const scroll_25 = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'leave' AND scroll_pct >= 25 ${LIVE}`,
    tenantId,
    day,
  );
  const scroll_50 = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'leave' AND scroll_pct >= 50 ${LIVE}`,
    tenantId,
    day,
  );
  const scroll_75 = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'leave' AND scroll_pct >= 75 ${LIVE}`,
    tenantId,
    day,
  );
  const scroll_100 = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'leave' AND scroll_pct >= 100 ${LIVE}`,
    tenantId,
    day,
  );

  const converts_form = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'convert' AND goal = 'form' ${LIVE}`,
    tenantId,
    day,
  );
  const converts_tel = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'convert' AND goal = 'tel' ${LIVE}`,
    tenantId,
    day,
  );
  const converts_mailto = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'convert' AND goal = 'mailto' ${LIVE}`,
    tenantId,
    day,
  );
  const converts_maps = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'convert' AND goal = 'maps' ${LIVE}`,
    tenantId,
    day,
  );

  const engage_nav = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'engage' AND action = 'nav' ${LIVE}`,
    tenantId,
    day,
  );
  const engage_btn = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'engage' AND action = 'btn' ${LIVE}`,
    tenantId,
    day,
  );
  const engage_img = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'engage' AND action = 'img' ${LIVE}`,
    tenantId,
    day,
  );
  const engage_carousel = await count(
    env,
    `SELECT COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'engage' AND action = 'carousel' ${LIVE}`,
    tenantId,
    day,
  );

  // Keep legacy `leads` column in sync with form conversions + leads table fallback
  const leadsTable = await count(
    env,
    `SELECT COUNT(*) AS n FROM leads WHERE tenant_id = ? AND substr(created_at, 1, 10) = ?`,
    tenantId,
    day,
  );
  const leads = Math.max(converts_form, leadsTable);

  const paths = await groupCounts(
    env,
    `SELECT path AS key, COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'pageview' ${LIVE}
     GROUP BY path ORDER BY n DESC LIMIT 8`,
    tenantId,
    day,
  );

  const refs = await groupCounts(
    env,
    `SELECT referrer AS key, COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'pageview'
       AND referrer IS NOT NULL AND referrer != '' ${LIVE}
     GROUP BY referrer ORDER BY n DESC LIMIT 8`,
    tenantId,
    day,
  );

  const channels = await groupCounts(
    env,
    `SELECT channel AS key, COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'pageview'
       AND channel IS NOT NULL AND channel != '' ${LIVE}
     GROUP BY channel ORDER BY n DESC LIMIT 8`,
    tenantId,
    day,
  );

  const devices = await groupCounts(
    env,
    `SELECT device AS key, COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'pageview'
       AND device IS NOT NULL AND device != '' ${LIVE}
     GROUP BY device ORDER BY n DESC LIMIT 8`,
    tenantId,
    day,
  );

  const hours = await groupCounts(
    env,
    `SELECT CAST(hour AS TEXT) AS key, COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'pageview' AND hour IS NOT NULL ${LIVE}
     GROUP BY hour ORDER BY hour ASC`,
    tenantId,
    day,
  );

  const engageLabels = await groupCounts(
    env,
    `SELECT label AS key, COUNT(*) AS n FROM analytics_events
     WHERE tenant_id = ? AND day = ? AND kind = 'engage'
       AND label IS NOT NULL AND label != '' ${LIVE}
     GROUP BY label ORDER BY n DESC LIMIT 8`,
    tenantId,
    day,
  );

  await env.DB.prepare(
    `INSERT INTO analytics_daily (
       tenant_id, day, pageviews, uniques, leads,
       top_paths_json, top_refs_json,
       sessions, bounces, engaged, duration_ms, leave_count,
       scroll_25, scroll_50, scroll_75, scroll_100,
       converts_form, converts_tel, converts_mailto, converts_maps,
       engage_nav, engage_btn, engage_img, engage_carousel,
       channels_json, devices_json, hours_json, top_engage_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, day) DO UPDATE SET
       pageviews = excluded.pageviews,
       uniques = excluded.uniques,
       leads = excluded.leads,
       top_paths_json = excluded.top_paths_json,
       top_refs_json = excluded.top_refs_json,
       sessions = excluded.sessions,
       bounces = excluded.bounces,
       engaged = excluded.engaged,
       duration_ms = excluded.duration_ms,
       leave_count = excluded.leave_count,
       scroll_25 = excluded.scroll_25,
       scroll_50 = excluded.scroll_50,
       scroll_75 = excluded.scroll_75,
       scroll_100 = excluded.scroll_100,
       converts_form = excluded.converts_form,
       converts_tel = excluded.converts_tel,
       converts_mailto = excluded.converts_mailto,
       converts_maps = excluded.converts_maps,
       engage_nav = excluded.engage_nav,
       engage_btn = excluded.engage_btn,
       engage_img = excluded.engage_img,
       engage_carousel = excluded.engage_carousel,
       channels_json = excluded.channels_json,
       devices_json = excluded.devices_json,
       hours_json = excluded.hours_json,
       top_engage_json = excluded.top_engage_json`,
  )
    .bind(
      tenantId,
      day,
      pageviews,
      uniques,
      leads,
      JSON.stringify(tallyTop(paths.map((r) => ({ key: r.key, n: r.n })))),
      JSON.stringify(tallyTop(refs.map((r) => ({ key: r.key, n: r.n })))),
      sessions,
      bounced,
      engaged,
      duration_ms,
      leave_count,
      scroll_25,
      scroll_50,
      scroll_75,
      scroll_100,
      converts_form,
      converts_tel,
      converts_mailto,
      converts_maps,
      engage_nav,
      engage_btn,
      engage_img,
      engage_carousel,
      JSON.stringify(tallyTop(channels.map((r) => ({ key: r.key, n: r.n })))),
      JSON.stringify(tallyTop(devices.map((r) => ({ key: r.key, n: r.n })))),
      JSON.stringify(hours),
      JSON.stringify(tallyTop(engageLabels.map((r) => ({ key: r.key, n: r.n })))),
    )
    .run();
}

export async function pruneAnalytics(env: Env): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM analytics_events WHERE created_at < datetime('now', '-90 days')`,
  ).run();
  await env.DB.prepare(
    `DELETE FROM analytics_presence WHERE seen_at < datetime('now', '-10 minutes')`,
  ).run();
  await env.DB.prepare(
    `DELETE FROM analytics_daily WHERE day < date('now', '-400 days')`,
  ).run();
}

export async function rollupAll(env: Env): Promise<void> {
  await pruneAnalytics(env);
  const tenants = await env.DB.prepare("SELECT id FROM tenants").all<{ id: string }>();
  const today = new Date().toISOString().slice(0, 10);
  const days = [today];
  for (let i = 1; i < 40; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  for (const tenant of tenants.results ?? []) {
    for (const day of days) await rollupDay(env, tenant.id, day);
  }
}

export type PresenceRow = { vid: string; path: string; seen_at: string };

export async function liveVisitors(
  env: Env,
  tenantId: string,
): Promise<{ total: number; paths: { path: string; n: number }[] }> {
  await env.DB.prepare(
    `DELETE FROM analytics_presence WHERE tenant_id = ? AND seen_at < datetime('now', '-45 seconds')`,
  )
    .bind(tenantId)
    .run();

  const total =
    (await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM analytics_presence WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<CountRow>())?.n ?? 0;

  const paths = await env.DB.prepare(
    `SELECT path, COUNT(*) AS n FROM analytics_presence
     WHERE tenant_id = ?
     GROUP BY path ORDER BY n DESC LIMIT 8`,
  )
    .bind(tenantId)
    .all<{ path: string; n: number }>();

  return { total, paths: paths.results ?? [] };
}
