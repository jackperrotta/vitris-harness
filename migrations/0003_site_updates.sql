-- GitHub repo metadata for git-as-SoT site updates
ALTER TABLE tenants ADD COLUMN github_owner TEXT;
ALTER TABLE tenants ADD COLUMN github_repo TEXT;

-- Optional extra senders who can request updates without a full membership login
CREATE TABLE IF NOT EXISTS sender_allowlist (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  PRIMARY KEY (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS update_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workflow_instance_id TEXT,
  sender_email TEXT NOT NULL,
  prompt TEXT NOT NULL,
  branch TEXT,
  preview_url TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  media_r2_prefix TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS update_jobs_tenant_created ON update_jobs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS update_jobs_status ON update_jobs(status);
