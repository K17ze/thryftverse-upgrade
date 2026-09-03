-- Sustainability preferences — per-user goals and display preferences.
-- Persisted server-side so preferences sync across devices.
CREATE TABLE IF NOT EXISTS sustainability_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  carbon_target_kg INTEGER,
  ratio_target_pct INTEGER,
  plastic_free_packaging BOOLEAN NOT NULL DEFAULT true,
  show_badges BOOLEAN NOT NULL DEFAULT true,
  track_impact BOOLEAN NOT NULL DEFAULT true,
  local_first BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
