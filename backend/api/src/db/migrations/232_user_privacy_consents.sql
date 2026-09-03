-- 232_user_privacy_consents.sql
-- Stores user-level privacy consent toggles that govern personalised ads,
-- recommendation personalisation, partner sharing, and analytics opt-out.
-- These are distinct from legal_document consents (user_consents table)
-- which track acceptance of specific legal documents.

CREATE TABLE IF NOT EXISTS user_privacy_consents (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  personalised_ads BOOLEAN NOT NULL DEFAULT FALSE,
  recommendation_personalisation BOOLEAN NOT NULL DEFAULT TRUE,
  partner_sharing BOOLEAN NOT NULL DEFAULT FALSE,
  analytics_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
