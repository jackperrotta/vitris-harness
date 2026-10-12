-- Additive: old leads remain untouched; no legacy form is implicitly enabled.
CREATE TABLE contact_forms (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, id)
);
CREATE TABLE form_origins (
  origin TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id)
);
CREATE TABLE form_submissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  challenge_hash TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  fields_json TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, message TEXT NOT NULL,
  page_path TEXT NOT NULL,
  vid TEXT,
  recipients_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, form_id, idempotency_key),
  FOREIGN KEY(tenant_id, form_id) REFERENCES contact_forms(tenant_id, id)
);
CREATE TABLE form_outbox (
  id TEXT PRIMARY KEY REFERENCES form_submissions(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','accepted','captured','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  claim TEXT,
  provider_id TEXT,
  last_error TEXT,
  test_output TEXT,
  accepted_at TEXT
);
CREATE INDEX form_outbox_due ON form_outbox(status, next_attempt, lease_until);
CREATE TABLE form_rate_limits (key TEXT PRIMARY KEY, n INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TRIGGER form_origin_owner BEFORE UPDATE ON form_origins WHEN NEW.tenant_id != OLD.tenant_id BEGIN
  SELECT RAISE(ABORT, 'Origin ownership conflict');
END;
CREATE TRIGGER contact_form_owner BEFORE UPDATE ON contact_forms WHEN NEW.tenant_id != OLD.tenant_id BEGIN
  SELECT RAISE(ABORT, 'Form ownership conflict');
END;
CREATE TRIGGER contact_form_origins_insert BEFORE INSERT ON contact_forms
  WHEN EXISTS(SELECT 1 FROM json_each(NEW.config_json, '$.origins') AS j
    LEFT JOIN form_origins o ON o.origin=j.value
    LEFT JOIN hostnames h ON h.hostname=o.hostname
    WHERE o.tenant_id IS NULL OR o.tenant_id != NEW.tenant_id OR (h.tenant_id IS NOT NULL AND h.tenant_id != NEW.tenant_id))
  BEGIN SELECT RAISE(ABORT, 'Origin ownership conflict');
END;
CREATE TRIGGER contact_form_origins_update BEFORE UPDATE ON contact_forms
  WHEN EXISTS(SELECT 1 FROM json_each(NEW.config_json, '$.origins') AS j LEFT JOIN form_origins o ON o.origin=j.value LEFT JOIN hostnames h ON h.hostname=o.hostname
    WHERE o.tenant_id IS NULL OR o.tenant_id != NEW.tenant_id OR (h.tenant_id IS NOT NULL AND h.tenant_id != NEW.tenant_id))
  BEGIN SELECT RAISE(ABORT, 'Origin ownership conflict');
END;
CREATE TRIGGER form_accept AFTER INSERT ON form_submissions BEGIN
  INSERT INTO form_outbox(id, tenant_id) VALUES(NEW.id, NEW.tenant_id);
  INSERT INTO leads(id, tenant_id, name, email, phone, message, page_path, status, vid)
    SELECT NEW.id, NEW.tenant_id, NEW.name, NEW.email, NEW.phone, NEW.message, NEW.page_path, 'new', NEW.vid WHERE NEW.mode = 'live';
  INSERT INTO analytics_events(id, tenant_id, path, day, kind, goal, src, vid)
    SELECT NEW.id, NEW.tenant_id, NEW.page_path, date('now'), 'convert', 'form', 'live', NEW.vid WHERE NEW.mode = 'live';
END;
-- Lead deletion also deletes its PII snapshot, idempotency receipt and notification.
CREATE TRIGGER form_lead_delete AFTER DELETE ON leads BEGIN
  DELETE FROM form_submissions WHERE id = OLD.id AND mode = 'live';
END;
