-- 329_creator_collaborator_owner_backfill.sql
-- Heal creator documents that have no owner row in creator_collaborators.
--
-- Migration 206 created creator_collaborators and backfilled owner rows for
-- the documents that existed at that time, but the document-create path
-- never wrote one — so every document created between 206 and this fix has
-- no owner row. Owner authorization resolves from creator_documents.creator_id
-- (see lib/creatorDocumentAccess.ts) and document creation now writes the row
-- atomically; this backfill repairs the historical gap so membership listing
-- (GET /creator/documents/:id/collaborators) shows the owner too.
--
-- Idempotent: the NOT EXISTS guard + PK conflict clause make re-runs safe.

INSERT INTO creator_collaborators (document_id, user_id, role, state, joined_at)
SELECT cd.id, cd.creator_id, 'owner', 'active', cd.created_at
FROM creator_documents cd
WHERE NOT EXISTS (
  SELECT 1 FROM creator_collaborators cc
  WHERE cc.document_id = cd.id AND cc.user_id = cd.creator_id
)
ON CONFLICT (document_id, user_id) DO NOTHING;
