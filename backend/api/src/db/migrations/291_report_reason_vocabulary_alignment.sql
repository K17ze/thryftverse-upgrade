-- Migration 291: Align report-reason CHECK constraints with the API vocabulary
--
-- POST /users/:userId/report and POST /listings/:listingId/report accept a
-- 14-value reason enum ('spam','inappropriate','counterfeit','unresponsive',
-- 'harassment','off_platform','hate_speech','prohibited','scam',
-- 'misinformation','privacy','impersonation','minor_safety','other'), but the
-- CHECK constraints created in migrations 048/065 only allow the original
-- six — so 8 of the 14 accepted reasons CHECK-violated into a 500 at insert.
-- Now that the report write runs in the same transaction as the safety
-- notice (recordConsumerReport), a violated CHECK also rolls back the
-- notice. Align both constraints with the endpoint vocabulary.
--
-- conversation_reports.reason is unconstrained (migration 149) — nothing to
-- change there.

ALTER TABLE user_reports
  DROP CONSTRAINT IF EXISTS chk_valid_reason;
ALTER TABLE user_reports
  ADD CONSTRAINT chk_valid_reason CHECK (reason IN (
    'spam', 'inappropriate', 'counterfeit', 'unresponsive', 'harassment',
    'off_platform', 'hate_speech', 'prohibited', 'scam', 'misinformation',
    'privacy', 'impersonation', 'minor_safety', 'other'
  ));

ALTER TABLE listing_reports
  DROP CONSTRAINT IF EXISTS listing_reports_reason_check;
ALTER TABLE listing_reports
  ADD CONSTRAINT listing_reports_reason_check CHECK (reason IN (
    'spam', 'inappropriate', 'counterfeit', 'unresponsive', 'harassment',
    'off_platform', 'hate_speech', 'prohibited', 'scam', 'misinformation',
    'privacy', 'impersonation', 'minor_safety', 'other'
  ));
