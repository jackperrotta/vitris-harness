-- First-party analytics: event dimensions, presence, richer daily rollups

ALTER TABLE analytics_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'pageview';
ALTER TABLE analytics_events ADD COLUMN sid TEXT;
ALTER TABLE analytics_events ADD COLUMN channel TEXT;
ALTER TABLE analytics_events ADD COLUMN device TEXT;
ALTER TABLE analytics_events ADD COLUMN hour INTEGER;
ALTER TABLE analytics_events ADD COLUMN duration_ms INTEGER;
ALTER TABLE analytics_events ADD COLUMN scroll_pct INTEGER;
ALTER TABLE analytics_events ADD COLUMN goal TEXT;
ALTER TABLE analytics_events ADD COLUMN action TEXT;
ALTER TABLE analytics_events ADD COLUMN label TEXT;
ALTER TABLE analytics_events ADD COLUMN src TEXT NOT NULL DEFAULT 'live';

CREATE INDEX IF NOT EXISTS analytics_events_tenant_day_kind ON analytics_events(tenant_id, day, kind);
CREATE INDEX IF NOT EXISTS analytics_events_tenant_sid ON analytics_events(tenant_id, sid);

CREATE TABLE IF NOT EXISTS analytics_presence (
  tenant_id TEXT NOT NULL,
  vid TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, vid)
);

CREATE INDEX IF NOT EXISTS analytics_presence_seen ON analytics_presence(seen_at);

ALTER TABLE analytics_daily ADD COLUMN sessions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN bounces INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN engaged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN leave_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN scroll_25 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN scroll_50 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN scroll_75 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN scroll_100 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN converts_form INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN converts_tel INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN converts_mailto INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN converts_maps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN engage_nav INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN engage_btn INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN engage_img INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN engage_carousel INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_daily ADD COLUMN channels_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE analytics_daily ADD COLUMN devices_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE analytics_daily ADD COLUMN hours_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE analytics_daily ADD COLUMN top_engage_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE leads ADD COLUMN vid TEXT;
