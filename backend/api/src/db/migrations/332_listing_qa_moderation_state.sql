-- 332: Listing Q&A moderation state.
--
-- The listing-text moderation gate (listingTextGateAction) maps 'review' and
-- provider 'failed' verdicts to a durable HOLD — content must never reach a
-- public surface before it has a clean verdict. listing_qa had no held
-- state, so held questions/answers either failed open into the public Q&A
-- surface (rendered unauthenticated) or had to be dropped outright.
--
-- This adds the same moderation_state vocabulary chat_messages (migration
-- 314) and live_shopping_chat_messages (migration 322) already use:
--
--   visible      — publicly served (default)
--   quarantined  — held for review: author-visible, hidden from everyone
--                  else on public read paths
--   denied       — hidden from everyone (reserved for operator takedown)
--
-- Question and answer carry independent states because they are separate
-- UGC writes by different authors: a held question quarantines the whole
-- row for non-authors; a held answer hides only the answer portion of an
-- otherwise visible question.
--
-- Idempotent: IF NOT EXISTS guards throughout.

ALTER TABLE listing_qa
  ADD COLUMN IF NOT EXISTS moderation_state TEXT NOT NULL DEFAULT 'visible'
    CHECK (moderation_state IN ('visible', 'quarantined', 'denied')),
  ADD COLUMN IF NOT EXISTS answer_moderation_state TEXT NOT NULL DEFAULT 'visible'
    CHECK (answer_moderation_state IN ('visible', 'quarantined', 'denied'));

-- Operator review surface: held rows per listing.
CREATE INDEX IF NOT EXISTS listing_qa_moderation_state_idx
  ON listing_qa (listing_id, moderation_state)
  WHERE moderation_state <> 'visible' OR answer_moderation_state <> 'visible';
