-- Placeholder legal content must never be presented as an enforceable active document.
UPDATE legal_documents
SET
  is_active = FALSE,
  retired_at = COALESCE(retired_at, NOW()),
  metadata = metadata || jsonb_build_object(
    'retiredReason', 'placeholder_content',
    'retiredByMigration', '058_retire_placeholder_legal_documents'
  )
WHERE
  content_hash ILIKE '%placeholder%'
  OR content_url ILIKE '%.local/%';
