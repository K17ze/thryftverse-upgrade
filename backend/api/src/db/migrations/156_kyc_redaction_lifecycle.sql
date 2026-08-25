-- Stripe Identity redaction lifecycle.
-- Tracks provider redaction state separately from the verification status so
-- the `identity.verification_session.redacted` webhook can be recorded without
-- overloading the `status` CHECK constraint. Redaction is irreversible on the
-- provider side and may take up to four days to complete.
ALTER TABLE kyc_cases
  ADD COLUMN IF NOT EXISTS redaction_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (redaction_status IN ('not_requested', 'requested', 'processing', 'redacted', 'failed')),
  ADD COLUMN IF NOT EXISTS redaction_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS redacted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS kyc_cases_redaction_status_idx
  ON kyc_cases (redaction_status, updated_at DESC);
