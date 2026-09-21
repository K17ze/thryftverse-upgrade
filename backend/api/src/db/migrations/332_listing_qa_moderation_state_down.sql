-- Rollback for migration 332.

DROP INDEX IF EXISTS listing_qa_moderation_state_idx;

ALTER TABLE listing_qa
  DROP COLUMN IF EXISTS moderation_state,
  DROP COLUMN IF EXISTS answer_moderation_state;
