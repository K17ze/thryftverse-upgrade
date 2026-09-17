ALTER TABLE looks
  DROP COLUMN IF EXISTS poster_url,
  DROP COLUMN IF EXISTS download_media_url;

ALTER TABLE look_media
  DROP COLUMN IF EXISTS poster_url,
  DROP COLUMN IF EXISTS download_media_url;

ALTER TABLE posters
  DROP COLUMN IF EXISTS poster_url,
  DROP COLUMN IF EXISTS download_media_url;
