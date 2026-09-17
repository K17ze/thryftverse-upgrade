-- Video artifacts carry three distinct delivery URLs once HLS packaging
-- succeeds: `media_url` is the adaptive playback URL (master.m3u8),
-- `poster_url` is the JPEG preview rendered by cover tiles, and
-- `download_media_url` is the progressive MP4 used by save/share flows.
-- Image artifacts leave both NULL — media_url already serves them.

ALTER TABLE looks
  ADD COLUMN IF NOT EXISTS poster_url TEXT,
  ADD COLUMN IF NOT EXISTS download_media_url TEXT;

ALTER TABLE look_media
  ADD COLUMN IF NOT EXISTS poster_url TEXT,
  ADD COLUMN IF NOT EXISTS download_media_url TEXT;

ALTER TABLE posters
  ADD COLUMN IF NOT EXISTS poster_url TEXT,
  ADD COLUMN IF NOT EXISTS download_media_url TEXT;

COMMENT ON COLUMN looks.poster_url IS
  'JPEG preview for video looks — cover tiles cannot render an m3u8 playlist.';
COMMENT ON COLUMN looks.download_media_url IS
  'Progressive MP4 for save/share; NULL for image looks.';
COMMENT ON COLUMN look_media.poster_url IS
  'JPEG preview for video carousel slides.';
COMMENT ON COLUMN look_media.download_media_url IS
  'Progressive MP4 for save/share; NULL for image slides.';
COMMENT ON COLUMN posters.poster_url IS
  'JPEG preview for video frames — cover tiles cannot render an m3u8 playlist.';
COMMENT ON COLUMN posters.download_media_url IS
  'Progressive MP4 for save/share; NULL for image frames.';
