-- Sustainability grade column for backend-native filtering.
-- Populated by the impact calculator when emissions data is available.
-- Grades: A (best), B, C, D. NULL when no data is available (fail-closed).
ALTER TABLE listings ADD COLUMN IF NOT EXISTS sustainability_grade TEXT DEFAULT NULL;

-- Partial index for the sustainable filter (only A and B grades qualify)
CREATE INDEX IF NOT EXISTS listings_sustainable_grade_idx
  ON listings (sustainability_grade)
  WHERE sustainability_grade IN ('A', 'B');
