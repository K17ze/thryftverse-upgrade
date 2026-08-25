-- 170: Change ai_usage_events.user_id FK from ON DELETE RESTRICT to ON DELETE CASCADE.
--
-- UK-GDPR Art. 17 requires hard user deletion to succeed. The original FK
-- (migration 068) used ON DELETE RESTRICT, which actively blocked compliant
-- erasure because ai_usage_events rows reference the user. Switching to
-- CASCADE allows a hard user deletion to remove the user's AI usage ledger
-- automatically, while the GDPR/CCPA erasure flow also anonymises related
-- content explicitly.
--
-- Idempotent: uses IF EXISTS / IF NOT EXISTS semantics via DROP + ADD.

ALTER TABLE ai_usage_events
  DROP CONSTRAINT IF EXISTS ai_usage_events_user_id_fkey;

ALTER TABLE ai_usage_events
  ADD CONSTRAINT ai_usage_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
