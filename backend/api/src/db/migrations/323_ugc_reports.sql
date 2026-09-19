-- 323: Polymorphic UGC reports.
--
-- Looks, look comments, posters, moodboard comments and listing Q&A are all
-- user-generated content that previously had no report path — a store-review
-- requirement (UGC must be reportable). One table covers every surface; the
-- safety case graph keys the notice to the derived report row as usual.

CREATE TABLE IF NOT EXISTS ugc_reports (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN (
    'look',
    'look_comment',
    'poster',
    'moodboard_comment',
    'listing_qa'
  )),
  -- The reported entity's primary key (look id, comment id, ...).
  subject_id TEXT NOT NULL,
  -- The content author — the enforcement target for auto-limit.
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'reviewing', 'actioned', 'dismissed')),
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reporter-side idempotent retries resolve to the original row.
CREATE UNIQUE INDEX IF NOT EXISTS ugc_reports_idempotency_idx
  ON ugc_reports (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- One report per reporter per piece of content.
CREATE UNIQUE INDEX IF NOT EXISTS ugc_reports_subject_reporter_idx
  ON ugc_reports (subject_type, subject_id, reporter_user_id);

CREATE INDEX IF NOT EXISTS ugc_reports_author_idx
  ON ugc_reports (author_user_id, created_at DESC);
