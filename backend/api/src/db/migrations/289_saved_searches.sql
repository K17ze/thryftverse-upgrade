-- 289_saved_searches.sql
--
-- Saved searches were previously device-local only (Zustand persist) — no
-- server copy, no matcher, no push delivery. This table is the canonical
-- server record so a saved search can be evaluated when a NEW listing
-- becomes active and the owner notified while the app is closed.
--
-- `dedupe_key` is the app-computed deduplication token:
--   lower(trim(query)) + '|' + sha256_hex(canonical_filters_json)
-- Canonical filters = JSONB object with sorted keys and sorted array
-- values, so `{brands:['nike','adidas']}` and `{brands:['adidas','nike']}`
-- produce the same hash. UNIQUE(user_id, dedupe_key) makes POST idempotent
-- and mirrors the client-side "same query+filters → update, not duplicate"
-- behaviour.

CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT NOT NULL,
  alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per (user, normalized query + filters) — POST upserts on this.
CREATE UNIQUE INDEX IF NOT EXISTS saved_searches_user_dedupe_uidx
  ON saved_searches (user_id, dedupe_key);

-- Per-user listing endpoint (GET /users/me/saved-searches).
CREATE INDEX IF NOT EXISTS saved_searches_user_idx
  ON saved_searches (user_id, created_at DESC);

-- Matcher candidate scan: only alert-enabled rows are evaluated when a
-- listing activates. Partial index keeps the scan bounded to subscribers.
CREATE INDEX IF NOT EXISTS saved_searches_alerts_enabled_idx
  ON saved_searches (created_at)
  WHERE alerts_enabled = TRUE;
