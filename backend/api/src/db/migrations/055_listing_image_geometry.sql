ALTER TABLE listing_images
  ADD COLUMN IF NOT EXISTS media_width INTEGER
    CHECK (media_width IS NULL OR media_width > 0),
  ADD COLUMN IF NOT EXISTS media_height INTEGER
    CHECK (media_height IS NULL OR media_height > 0);

COMMENT ON COLUMN listing_images.media_width IS
  'Intrinsic pixel width reported by the trusted media picker or processor.';

COMMENT ON COLUMN listing_images.media_height IS
  'Intrinsic pixel height reported by the trusted media picker or processor.';
