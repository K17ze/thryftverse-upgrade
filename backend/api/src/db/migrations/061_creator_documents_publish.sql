-- Creator documents table — server-side draft persistence with publish lifecycle.
-- The table was referenced by routes/creatorDocuments.ts but never had a
-- migration. This creates it with publish status and revision tracking.

CREATE TABLE IF NOT EXISTS creator_documents (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('look', 'poster')),
  version INTEGER NOT NULL DEFAULT 1,
  document_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS creator_documents_creator_idx
  ON creator_documents (creator_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS creator_documents_status_idx
  ON creator_documents (status, created_at DESC);

-- Trigger: update updated_at on creator_documents
CREATE OR REPLACE FUNCTION update_creator_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS creator_documents_updated_at_trigger ON creator_documents;
CREATE TRIGGER creator_documents_updated_at_trigger
  BEFORE UPDATE ON creator_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_creator_documents_updated_at();

-- ── Creator document revisions ──────────────────────────────────────
-- Stores snapshots of documents at publish time for revision history.

CREATE TABLE IF NOT EXISTS creator_document_revisions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES creator_documents(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  document_json JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, revision_number)
);

CREATE INDEX IF NOT EXISTS creator_document_revisions_doc_idx
  ON creator_document_revisions (document_id, revision_number DESC);
