-- 236_chat_polls.sql
-- In-chat polls. A poll is a special message type ('poll') with a
-- question, options, and vote tracking. One vote per user per poll
-- (unless allow_multiple is true). Votes are anonymous by default.

CREATE TABLE IF NOT EXISTS chat_polls (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE REFERENCES chat_messages(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options TEXT[] NOT NULL,
  allow_multiple BOOLEAN NOT NULL DEFAULT FALSE,
  is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_poll_votes (
  poll_id TEXT NOT NULL REFERENCES chat_polls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (poll_id, user_id, option_index)
);

CREATE INDEX IF NOT EXISTS chat_poll_votes_poll_idx
  ON chat_poll_votes(poll_id);
