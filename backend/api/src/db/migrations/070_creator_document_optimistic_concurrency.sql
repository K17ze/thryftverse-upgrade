-- Creator draft optimistic concurrency.

ALTER TABLE creator_documents
  ADD COLUMN IF NOT EXISTS lock_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE creator_documents
  DROP CONSTRAINT IF EXISTS creator_documents_lock_version_positive;

ALTER TABLE creator_documents
  ADD CONSTRAINT creator_documents_lock_version_positive
  CHECK (lock_version > 0);

