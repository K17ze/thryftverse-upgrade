-- 282_user_relationship_states.sql
--
-- Graduated moderation ladder: user-level mute and restrict relationships.
-- These sit between "filter" and "block" — silent moderation the target
-- cannot observe (Instagram-style).
--
--   mute     — suppresses notifications for the target's messages without
--              the target knowing. The target can still message and see
--              the owner's profile.
--   restrict — the target's DMs land in the owner's message requests and
--              the target receives no read receipts or typing indicators
--              from the owner. Profile visibility is unchanged (unlike
--              block, which 404s the profile for the blocked viewer).
--
-- expires_at is reserved for the upcoming Limits feature (time-boxed
-- restriction); it is always NULL until that ships. All reads must treat
-- (expires_at IS NULL OR expires_at > NOW()) as "active".

CREATE TABLE IF NOT EXISTS user_relationship_states (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('mute', 'restrict')),
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, target_id, kind),
  CONSTRAINT chk_no_self_relationship_state CHECK (owner_id <> target_id)
);

-- Owner-centric lookups: "who has this user muted/restricted?" list routes.
CREATE INDEX IF NOT EXISTS idx_user_relationship_states_owner_kind
  ON user_relationship_states (owner_id, kind);

-- Target-centric lookups: "which conversation members has this user muted
-- or restricted?" and reverse fan-out checks keyed by target.
CREATE INDEX IF NOT EXISTS idx_user_relationship_states_target_kind
  ON user_relationship_states (target_id, kind);
