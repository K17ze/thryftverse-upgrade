-- P0-8: Server-side composition rendering.
--
-- When the publication pipeline burns a composition_document into a
-- flattened image, the rendered URL replaces the source upload as the
-- canonical `media_url` (the surface feed/carousel discovery uses). The
-- original source upload URL is preserved on `source_media_url` so the
-- unedited media remains referenceable for re-render, auditing, and
-- fallback when rendering is skipped or fails.

ALTER TABLE looks
  ADD COLUMN IF NOT EXISTS source_media_url TEXT;

ALTER TABLE posters
  ADD COLUMN IF NOT EXISTS source_media_url TEXT;

COMMENT ON COLUMN looks.source_media_url IS
  'Original source upload URL before server-side composition rendering. NULL when no render was performed (plain single-image posts or video compositions).';

COMMENT ON COLUMN posters.source_media_url IS
  'Original source upload URL before server-side composition rendering. NULL when no render was performed (plain single-image frames or video compositions).';
