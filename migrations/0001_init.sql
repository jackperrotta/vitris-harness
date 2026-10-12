CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pages_project TEXT,
  kernel_version TEXT,
  content_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hostnames (
  hostname TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  kind TEXT NOT NULL DEFAULT 'pages',
  pages_domain_status TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL DEFAULT 'owner',
  PRIMARY KEY (user_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS content (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS theme (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_config (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  r2_key TEXT NOT NULL,
  alt TEXT,
  content_type TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  page_path TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS leads_tenant_created ON leads(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT,
  vid TEXT,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS analytics_events_tenant_day ON analytics_events(tenant_id, day);

CREATE TABLE IF NOT EXISTS analytics_daily (
  tenant_id TEXT NOT NULL,
  day TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  uniques INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  top_paths_json TEXT NOT NULL DEFAULT '[]',
  top_refs_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (tenant_id, day)
);
