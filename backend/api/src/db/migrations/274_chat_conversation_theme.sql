-- Per-member appearance preference; group governance remains in chat_group_settings.
ALTER TABLE chat_conversation_user_state
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'Default'
    CHECK (theme IN ('Default', 'Emerald', 'Midnight', 'Sunset', 'Lavender', 'Cobalt'));
