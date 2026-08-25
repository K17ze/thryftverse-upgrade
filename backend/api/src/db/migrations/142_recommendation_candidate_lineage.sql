-- Migration 142: Candidate-source lineage and selection propensity on recommendation_impressions
--
-- A recommendation cannot be evaluated offline unless each served candidate
-- records which retrieval source produced it, where it ranked within that
-- source's candidate list, the score the source assigned, and the version of
-- the retrieval system. Without this lineage the learning loop cannot
-- attribute credit/blame to the retrieval funnel that surfaced a candidate
-- (Pinterest/Meta/YouTube all carry source attribution through every stage).
--
-- selection_propensity is the probability that the logging policy selected
-- this candidate for serving. It is the inverse-propensity-weighting (IPW)
-- key for unbiased off-policy evaluation: training must divide observed
-- rewards by the propensity to remove the selection bias introduced by the
-- serving policy. For the current heuristic baseline the propensity is an
-- approximation (exploit: 1 - exploration_rate; explore:
-- exploration_rate / result_count). Exact propensity logging is refined as
-- the retrieval funnel matures — the column is nullable so historical rows
-- remain honest about what was unknown at serve time.
--
-- All columns are nullable for backward compatibility: existing impression
-- rows were served before lineage capture existed and must not be forced to
-- fabricate values.

ALTER TABLE recommendation_impressions
  ADD COLUMN IF NOT EXISTS candidate_source TEXT,
  ADD COLUMN IF NOT EXISTS source_rank INTEGER CHECK (source_rank IS NULL OR source_rank > 0),
  ADD COLUMN IF NOT EXISTS source_score NUMERIC(10, 6) CHECK (source_score IS NULL OR source_score BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS retrieval_version TEXT,
  ADD COLUMN IF NOT EXISTS selection_propensity NUMERIC(8, 6)
    CHECK (selection_propensity IS NULL OR selection_propensity BETWEEN 0 AND 1);

CREATE INDEX IF NOT EXISTS recommendation_impressions_source_created_idx
  ON recommendation_impressions (candidate_source, created_at DESC)
  WHERE candidate_source IS NOT NULL;

COMMENT ON COLUMN recommendation_impressions.candidate_source IS
  'Retrieval source that produced this candidate (e.g. recent_sql_keyset, text_hybrid, visual, item_to_item, user_affinity, session_intent, exploration, marketplace_module). Nullable for rows served before lineage capture.';
COMMENT ON COLUMN recommendation_impressions.source_rank IS
  'Rank of this candidate within its source candidate list (1-based). Nullable for historical rows.';
COMMENT ON COLUMN recommendation_impressions.source_score IS
  'Score assigned by the retrieval source, normalised to [0,1]. Nullable for historical rows.';
COMMENT ON COLUMN recommendation_impressions.retrieval_version IS
  'Version tag of the retrieval system that produced this candidate (e.g. v1). Nullable for historical rows.';
COMMENT ON COLUMN recommendation_impressions.selection_propensity IS
  'Probability that the logging policy selected this candidate for serving. The IPW key for unbiased off-policy evaluation. Nullable for historical rows and while exact propensity logging is being refined.';
