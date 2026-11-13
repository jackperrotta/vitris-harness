ALTER TABLE form_submissions ADD COLUMN attribution_source TEXT
  CHECK(attribution_source IS NULL OR attribution_source IN ('chatgpt','chatgpt_paid'));

CREATE INDEX form_submissions_chatgpt_attribution
  ON form_submissions(tenant_id, created_at, attribution_source)
  WHERE mode='live' AND attribution_source IS NOT NULL;
ALTER TABLE analytics_events ADD COLUMN attribution_source TEXT
  CHECK(attribution_source IS NULL OR attribution_source IN ('chatgpt','chatgpt_paid'));

CREATE INDEX analytics_events_chatgpt_attribution
  ON analytics_events(tenant_id, day, attribution_source, path)
  WHERE kind='pageview' AND src='live' AND attribution_source IS NOT NULL;

