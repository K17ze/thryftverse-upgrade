-- Scheduled publishing for creator content
ALTER TABLE looks ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE posters ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE creator_documents ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS looks_scheduled_idx
  ON looks (creator_id, scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS posters_scheduled_idx
  ON posters (creator_id, scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS creator_documents_scheduled_idx
  ON creator_documents (creator_id, scheduled_for) WHERE scheduled_for IS NOT NULL;
