-- Preserve the canonical creator composition instead of collapsing a Look to
-- one cover URL. Existing rows remain valid image Looks.
ALTER TABLE looks
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'video')),
  ADD COLUMN IF NOT EXISTS composition_document JSONB DEFAULT NULL;

COMMENT ON COLUMN looks.composition_document IS
  'Versioned CreatorDocument used to render and edit authored multi-layer Looks.';
