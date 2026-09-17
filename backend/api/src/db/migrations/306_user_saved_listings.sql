-- 306_user_saved_listings.sql
--
-- The heart/bookmark save surfaces POST to /users/me/wishlist — a route that
-- was never implemented. Every wishlist/saved toggle was MMKV-local while the
-- UI announced persistence ("Added to wishlist"), so saves never synced
-- across devices and vanished on reinstall. This table is the server source
-- of truth for both lists; `list` discriminates the heart (wishlist) from the
-- bookmark (saved) so the two UI concepts share one contract.

CREATE TABLE IF NOT EXISTS user_saved_listings (
  user_id    uuid        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  listing_id uuid        NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  list       text        NOT NULL CHECK (list IN ('wishlist', 'saved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list, listing_id)
);

-- Reads are always per-user lists; the PK already covers the lookup, but a
-- (user_id, list) index keeps the listing-id fetch scan cheap.
CREATE INDEX IF NOT EXISTS user_saved_listings_user_list_idx
  ON user_saved_listings (user_id, list);
