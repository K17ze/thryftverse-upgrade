-- Rollback for 337_coown_distributions_reinvest_attempts.
ALTER TABLE coown_distributions
  DROP COLUMN IF EXISTS reinvest_attempts;
