-- Live shopping interactive layer: chat messages, in-stream bids, and
-- current-lot state for live shopping sessions. These tables back the
-- real-time chat, bidding, and lot-sync features that run alongside a
-- LiveKit stream room.

-- Chat messages sent by viewers/hosts during a live shopping session.
CREATE TABLE IF NOT EXISTS live_shopping_chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES live_shopping_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'message',
  is_seller BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS live_shopping_chat_messages_session_created_idx
  ON live_shopping_chat_messages (session_id, created_at DESC);

-- In-stream bids placed on the current lot during a live session.
CREATE TABLE IF NOT EXISTS live_shopping_bids (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES live_shopping_sessions(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  lot_number INTEGER NOT NULL,
  bidder_id TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS live_shopping_bids_session_listing_idx
  ON live_shopping_bids (session_id, listing_id, created_at DESC);

-- Current-lot state: which listing is being shown right now, plus the
-- running high bid and bid count for that lot within this session.
-- One row per session (upserted by the host).
CREATE TABLE IF NOT EXISTS live_shopping_current_lots (
  session_id TEXT PRIMARY KEY REFERENCES live_shopping_sessions(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  lot_number INTEGER NOT NULL,
  current_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  bid_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE live_shopping_chat_messages IS
  'Chat messages exchanged during a live shopping stream session.';
COMMENT ON TABLE live_shopping_bids IS
  'Bids placed on the current lot during a live shopping stream session.';
COMMENT ON TABLE live_shopping_current_lots IS
  'Current-lot state for a live shopping session — which listing is being shown.';
