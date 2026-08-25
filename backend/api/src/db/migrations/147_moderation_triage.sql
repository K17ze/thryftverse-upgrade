-- Migration 147: Moderation triage table
--
-- ML-assisted moderation triage with a human-in-the-loop gate.
--
-- The existing moderation system (moderationService.ts + provider abstraction)
-- routes every asset through the same review queue. The ML flagship report
-- (§7.3, §9.6) recommends ML-assisted triage so an advisory model can sort
-- assets into three lanes before a human ever sees them:
--
--   auto_approve  — high confidence safe. Logged for audit, but the asset is
--                   marked publishable. Reversible: a human reviewer can
--                   overturn it at any time.
--   human_review  — ambiguous or potentially violating. The default for
--                   anything the model is not confident about. Adds the asset
--                   to the human review queue.
--   auto_reject   — high confidence violation. The model NEVER actions this.
--                   It sits in the queue awaiting human confirmation before
--                   the asset is rejected.
--
-- The cardinal rule (AGENTS.md §11 — Truthful, anti-AI design policy): the ML
-- never makes the final decision. Auto-approve is logged but reversible.
-- Auto-reject requires human confirmation. Human review is the default for
-- ambiguous cases. No "AI-powered moderation" claims — this is assisted
-- triage. The placeholder model (moderationTriageHandler.ts) is honest: no
-- model is loaded, so everything routes to human_review with confidence 0.0.
--
-- Each row is the immutable product of a (triage_model_id, triage_model_version)
-- tuple applied to a media asset. A re-triage produces a new row and
-- supersedes the old one via superseded_by_id, preserving full lineage so an
-- auditor can answer "what did the model say, when, and what did the human
-- ultimately decide."
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS moderation_triage (
  id TEXT NOT NULL DEFAULT uuid_v7(),
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  triage_model_id TEXT NOT NULL,
  triage_model_version TEXT NOT NULL,
  triage_decision TEXT NOT NULL CHECK (triage_decision IN ('auto_approve', 'human_review', 'auto_reject')),
  confidence_score NUMERIC(5,4) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  category_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  human_decision TEXT CHECK (human_decision IN ('approve', 'reject', 'escalate') OR human_decision IS NULL),
  human_reviewer_id TEXT,
  human_reviewed_at TIMESTAMPTZ,
  human_reason TEXT,
  triage_status TEXT NOT NULL DEFAULT 'pending' CHECK (triage_status IN ('pending', 'triaged', 'human_reviewed', 'actioned', 'superseded')),
  superseded_by_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- Lookup by media asset (full triage history for an asset).
CREATE INDEX IF NOT EXISTS moderation_triage_media_asset_id_idx
  ON moderation_triage (media_asset_id, created_at DESC);

-- Status scan (queue progress / "what is pending vs actioned").
CREATE INDEX IF NOT EXISTS moderation_triage_triage_status_idx
  ON moderation_triage (triage_status, created_at DESC);

-- Decision breakdown (dashboard / "how many auto-approve vs human_review").
CREATE INDEX IF NOT EXISTS moderation_triage_triage_decision_idx
  ON moderation_triage (triage_decision, created_at DESC);

-- Reviewer workload (per-moderator throughput / audit).
CREATE INDEX IF NOT EXISTS moderation_triage_human_reviewer_id_idx
  ON moderation_triage (human_reviewer_id, human_reviewed_at DESC)
  WHERE human_reviewer_id IS NOT NULL;

-- The human review queue: triaged items awaiting human review, ordered by
-- confidence ascending (lowest confidence = most ambiguous = highest
-- priority for human attention). Partial index so the queue scan touches
-- only the rows a moderator can actually act on.
CREATE INDEX IF NOT EXISTS moderation_triage_review_queue_idx
  ON moderation_triage (confidence_score ASC, created_at ASC)
  WHERE triage_status = 'triaged' AND triage_decision = 'human_review';

COMMENT ON TABLE moderation_triage IS
  'ML-assisted moderation triage with a human-in-the-loop gate. Each row is the immutable product of a (triage_model_id, triage_model_version) tuple applied to a media asset. The ML never makes the final decision: auto_approve is logged but reversible, auto_reject requires human confirmation, and human_review is the default for ambiguous cases.';
COMMENT ON COLUMN moderation_triage.media_asset_id IS
  'FK to media_assets(id). The asset that was triaged.';
COMMENT ON COLUMN moderation_triage.triage_model_id IS
  'Stable model identifier across versions (e.g. moderation-triage-v1). Paired with triage_model_version it identifies the exact model that produced the decision.';
COMMENT ON COLUMN moderation_triage.triage_model_version IS
  'Immutable version tag for the triage model (e.g. v1.0.0). Combined with triage_model_id it identifies the exact model that produced the decision.';
COMMENT ON COLUMN moderation_triage.triage_decision IS
  'Advisory decision: auto_approve (high confidence safe, logged but reversible), human_review (ambiguous, queued for a human), auto_reject (high confidence violation, requires human confirmation before action).';
COMMENT ON COLUMN moderation_triage.confidence_score IS
  'Model confidence in its decision (0.0-1.0). The human review queue is ordered by this ascending so the most ambiguous items get human attention first.';
COMMENT ON COLUMN moderation_triage.category_scores IS
  'JSONB object of per-category scores from the model (e.g. {"nudity": 0.02, "violence": 0.01}), for offline calibration and policy analysis.';
COMMENT ON COLUMN moderation_triage.detected_labels IS
  'JSONB array of labels the model detected (e.g. [{"name": "swimwear", "confidence": 0.91, "category": "other"}]), for auditability.';
COMMENT ON COLUMN moderation_triage.human_decision IS
  'The human reviewer decision: approve, reject, or escalate. NULL until a human reviews the triage. This is the authoritative decision — the model decision is advisory only.';
COMMENT ON COLUMN moderation_triage.human_reviewer_id IS
  'The user id of the admin moderator who reviewed this triage. NULL until human review.';
COMMENT ON COLUMN moderation_triage.human_reviewed_at IS
  'Timestamp of the human review. NULL until human review.';
COMMENT ON COLUMN moderation_triage.human_reason IS
  'Free-text reason recorded by the human reviewer. Optional but recommended for auditability.';
COMMENT ON COLUMN moderation_triage.triage_status IS
  'Lifecycle of the triage row: pending (queued, not yet triaged), triaged (model has decided, awaiting human action for human_review / auto_reject), human_reviewed (a human has recorded a decision), actioned (the decision has been applied to the media asset), superseded (a newer triage has replaced this one).';
COMMENT ON COLUMN moderation_triage.superseded_by_id IS
  'The id of the moderation_triage row that superseded this one. NULL for the current triage. Preserves lineage across re-triages.';
