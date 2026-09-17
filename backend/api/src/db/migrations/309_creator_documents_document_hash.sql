-- The save route computes a canonicalized document_hash and returns it to
-- the client, and the publish/schedule paths SELECT creator_documents.document_hash
-- for their stale-write guard — but the column was never added to the table
-- (067 added it only to creator_document_revisions). Without it every
-- publish/schedule fails with 42703.

ALTER TABLE creator_documents
  ADD COLUMN IF NOT EXISTS document_hash TEXT;
