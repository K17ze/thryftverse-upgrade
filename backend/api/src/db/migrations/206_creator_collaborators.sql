-- Migration 206: Creator collaborators — role-based collaboration for
-- creator documents (Looks, Posters, Moodboards).
--
-- Research basis: 23-publishing-lifecycle-flagship-research-2026-08-25.md
-- P2 item 12: "Add role-based collaborators, invitations and auditable
-- operations."
--
-- This mirrors the moodboard_members pattern (migration 186) but extends
-- it to all creator document types. The owner row is created atomically
-- with the document; collaborators are added by invitation.
--
-- Roles:
--   owner    — full control (delete, invite, publish, edit)
--   editor   — can edit and publish, cannot delete or invite
--   viewer   — read-only access to drafts
--
-- The owner is always the creator_id from creator_documents. Collaborators
-- are additional users with scoped access.

CREATE TABLE IF NOT EXISTS creator_collaborators (
  document_id TEXT NOT NULL REFERENCES creator_documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  state TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'invited', 'suspended', 'removed')),
  invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  PRIMARY KEY (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS creator_collaborators_user_idx
  ON creator_collaborators (user_id, state);

CREATE INDEX IF NOT EXISTS creator_collaborators_document_idx
  ON creator_collaborators (document_id, state);

-- ── Creator operation log: auditable operations on documents ─────────
-- Every significant operation (save, publish, schedule, invite, remove,
-- role change) is recorded here for auditability. This is the "auditable
-- operations" requirement from P2 item 12.

CREATE TABLE IF NOT EXISTS creator_operation_log (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES creator_documents(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN (
    'save', 'publish', 'schedule', 'cancel_schedule',
    'invite', 'accept_invite', 'remove_collaborator',
    'role_change', 'delete', 'archive', 'restore'
  )),
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS creator_operation_log_document_idx
  ON creator_operation_log (document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS creator_operation_log_actor_idx
  ON creator_operation_log (actor_id, created_at DESC);

-- ── Backfill: owner rows for existing documents ──────────────────────
INSERT INTO creator_collaborators (document_id, user_id, role, state, joined_at)
SELECT cd.id, cd.creator_id, 'owner', 'active', cd.created_at
FROM creator_documents cd
WHERE NOT EXISTS (
  SELECT 1 FROM creator_collaborators cc
  WHERE cc.document_id = cd.id AND cc.user_id = cd.creator_id
)
ON CONFLICT (document_id, user_id) DO NOTHING;

COMMENT ON TABLE creator_collaborators IS
  'Role-based collaborators for creator documents. Owner is the document creator; editors can edit/publish; viewers can read drafts.';
COMMENT ON TABLE creator_operation_log IS
  'Auditable operation log for creator documents. Every significant operation is recorded for accountability.';
