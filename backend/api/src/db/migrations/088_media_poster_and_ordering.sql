-- 088_media_poster_and_ordering.sql
-- Closes acceptance matrix items M05, M06, M07.
--
-- M06: Media ordering is unique and atomic. The media_bindings table
-- already has sort_order, but nothing prevents two bindings for the
-- same target from sharing the same sort_order (which would make the
-- carousel order non-deterministic). This adds a partial unique index
-- on (target_type, target_ref_id, sort_order) for active bindings.
--
-- M05: Poster ownership/readiness is verified. The listing_images
-- poster_url is a bare URL with no verification. This adds a
-- poster_verified_at timestamp and poster_verified_by reference so
-- the frontend can trust the poster has been checked.
--
-- M07: Live lot/offering media is frozen or versioned. Adds a
-- media_frozen_at column to listings and auctions so once an item is
-- live, its media cannot be silently swapped. Updates require a new
-- version (or explicit unfreeze by the owner).

-- M06: Unique active ordering per target.
CREATE UNIQUE INDEX IF NOT EXISTS media_bindings_target_sort_unique_idx
  ON media_bindings (target_type, target_ref_id, sort_order)
  WHERE removed_at IS NULL;

-- M05: Poster verification on listing_images.
ALTER TABLE listing_images
  ADD COLUMN IF NOT EXISTS poster_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS poster_verified_by TEXT REFERENCES users(id) ON DELETE SET NULL;

-- M07: Media freeze on listings and auctions.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS media_frozen_at TIMESTAMPTZ;

ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS media_frozen_at TIMESTAMPTZ;
