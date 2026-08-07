-- Canonical listing media metadata.
--
-- `listing_images` is retained for compatibility with existing callers, but
-- rows may now describe either an image or a video.

ALTER TABLE listing_images
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'video')),
  ADD COLUMN IF NOT EXISTS poster_url TEXT,
  ADD COLUMN IF NOT EXISTS blurhash TEXT,
  ADD COLUMN IF NOT EXISTS focal_x NUMERIC(5, 4)
    CHECK (focal_x IS NULL OR (focal_x >= 0 AND focal_x <= 1)),
  ADD COLUMN IF NOT EXISTS focal_y NUMERIC(5, 4)
    CHECK (focal_y IS NULL OR (focal_y >= 0 AND focal_y <= 1));

COMMENT ON COLUMN listing_images.media_type IS
  'Canonical media kind. Legacy rows default to image.';

COMMENT ON COLUMN listing_images.poster_url IS
  'Optional poster image used while video media loads.';
