-- Auction alerts email preference — the EmailNotificationsScreen toggle
-- existed in the UI but the column/contract never did, so every PUT
-- 400'd on "No fields provided". Auction events are real emitters, so
-- the honest fix is a real preference, not a removed row.
ALTER TABLE user_email_preferences
  ADD COLUMN IF NOT EXISTS auction_alerts BOOLEAN NOT NULL DEFAULT TRUE;
