-- Signed KYC provider sessions and idempotent webhook delivery.
ALTER TABLE kyc_verification_events
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS kyc_verification_events_provider_event_idx
  ON kyc_verification_events (provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kyc_cases_provider_status_idx
  ON kyc_cases (vendor, status, updated_at DESC);
