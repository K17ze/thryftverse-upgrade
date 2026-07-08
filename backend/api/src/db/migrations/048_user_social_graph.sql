-- 048_user_social_graph.sql
-- User social graph: follows, blocks, and reports.
-- Supports the flagship public profile reconstruction (VQ-11A).
-- Note: users.id is TEXT (e.g. 'usr_...'), so all user references here are TEXT.

-- ── user_follows ───────────────────────────────────────────────────
-- Tracks follower → following relationships between users.
-- Unique constraint prevents duplicate follow edges.
CREATE TABLE IF NOT EXISTS user_follows (
  id            TEXT PRIMARY KEY,
  follower_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CONSTRAINT chk_no_self_follow CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower_id ON user_follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following_id ON user_follows (following_id);

-- ── user_blocks ────────────────────────────────────────────────────
-- Tracks blocker → blocked relationships.
-- Blocked users cannot follow, message, or view the blocker's profile.
CREATE TABLE IF NOT EXISTS user_blocks (
  id            TEXT PRIMARY KEY,
  blocker_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CONSTRAINT chk_no_self_block CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_id ON user_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_id ON user_blocks (blocked_id);

-- ── user_reports ───────────────────────────────────────────────────
-- Tracks user-submitted reports about other users.
-- Reports are reviewed by the platform team.
CREATE TABLE IF NOT EXISTS user_reports (
  id            TEXT PRIMARY KEY,
  reporter_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL,
  details       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ,
  CONSTRAINT chk_no_self_report CHECK (reporter_id <> reported_id),
  CONSTRAINT chk_valid_reason CHECK (reason IN ('spam', 'inappropriate', 'counterfeit', 'unresponsive', 'harassment', 'other')),
  CONSTRAINT chk_valid_status CHECK (status IN ('pending', 'reviewing', 'actioned', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_id ON user_reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported_id ON user_reports (reported_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports (status);
