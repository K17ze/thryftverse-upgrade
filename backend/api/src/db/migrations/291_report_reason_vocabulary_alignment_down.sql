-- Rollback for 291_report_reason_vocabulary_alignment.sql
-- Restores the original six-value reason CHECK constraints. Any rows written
-- with the extended vocabulary must be removed or re-mapped before rolling
-- back or the ADD CONSTRAINT will fail.

ALTER TABLE user_reports
  DROP CONSTRAINT IF EXISTS chk_valid_reason;
ALTER TABLE user_reports
  ADD CONSTRAINT chk_valid_reason CHECK (reason IN (
    'spam', 'inappropriate', 'counterfeit', 'unresponsive', 'harassment', 'other'
  ));

ALTER TABLE listing_reports
  DROP CONSTRAINT IF EXISTS listing_reports_reason_check;
ALTER TABLE listing_reports
  ADD CONSTRAINT listing_reports_reason_check CHECK (reason IN (
    'spam', 'inappropriate', 'counterfeit', 'unresponsive', 'harassment', 'other'
  ));
