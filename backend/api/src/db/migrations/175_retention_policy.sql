-- 175: Retention policy registry + default policies.
--
-- Centralises TTL-based retention rules for proactive data lifecycle
-- management (GDPR Art. 5(1)(e) storage limitation / CCPA minimisation).
-- The retention engine reads this table daily and purges or anonymises
-- rows older than the configured TTL.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and ON CONFLICT DO NOTHING
-- so re-running the migration is safe.

CREATE TABLE IF NOT EXISTS retention_policy (
  id TEXT PRIMARY KEY,
  data_class TEXT NOT NULL UNIQUE,
  ttl_days INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('anonymise', 'delete')),
  legal_basis TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO retention_policy (id, data_class, ttl_days, action, legal_basis) VALUES
  ('rp_chat_messages', 'chat_messages', 365, 'anonymise', 'Legitimate interest — dispute resolution (UK-GDPR Art. 6(1)(f))'),
  ('rp_support_transcripts', 'support_transcripts', 90, 'anonymise', 'Legitimate interest — dispute resolution (UK-GDPR Art. 6(1)(f))'),
  ('rp_support_agent_runs', 'support_agent_runs', 90, 'delete', 'Legitimate interest — operational debugging (UK-GDPR Art. 6(1)(f))'),
  ('rp_ai_usage_events', 'ai_usage_events', 90, 'delete', 'Legitimate interest — usage analytics (UK-GDPR Art. 6(1)(f))'),
  ('rp_analytics_events', 'analytics_events', 730, 'delete', 'Legitimate interest — product analytics, 2-year retention (UK-GDPR Art. 6(1)(f))'),
  ('rp_notification_events', 'notification_events', 90, 'delete', 'Legitimate interest — delivery audit (UK-GDPR Art. 6(1)(f))'),
  ('rp_user_sessions', 'user_sessions', 30, 'delete', 'Security — session lifecycle (UK-GDPR Art. 6(1)(f))'),
  ('rp_password_reset_tokens', 'password_reset_tokens', 1, 'delete', 'Security — token expiry (UK-GDPR Art. 6(1)(f))'),
  ('rp_catalog_import_raw', 'catalog_import_raw', 30, 'delete', 'Legitimate interest — reprocessing window (UK-GDPR Art. 6(1)(f))')
ON CONFLICT (data_class) DO NOTHING;
