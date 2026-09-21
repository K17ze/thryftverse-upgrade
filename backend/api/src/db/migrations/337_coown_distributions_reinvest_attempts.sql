-- Bounded retry for DRIP reinvestment.
--
-- State-dependent reinvestment failures (asset closed, no market price, no
-- available pool units, holding cap reached) can self-resolve between
-- passes. reinvest_attempts bounds the retry loop: once it reaches the
-- worker's ceiling the distribution dead-letters to 'reinvest_failed'
-- instead of retrying forever.

ALTER TABLE coown_distributions
  ADD COLUMN IF NOT EXISTS reinvest_attempts INTEGER NOT NULL DEFAULT 0;
