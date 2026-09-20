import type { Pool, PoolClient } from 'pg';

/**
 * Creator document draft-access authorization.
 *
 * This is the creator-document equivalent of the moodboard capability check
 * (`requireBoardCapability` + `hasCapability` in routes/moodboards.ts), backed
 * by the `creator_collaborators` table (migration 206) which mirrors
 * `moodboard_members`:
 *
 *   owner  — the document's `creator_id`. The owner is the capability root:
 *            ownership derives from the document row itself, so a missing
 *            collaborator row can never lock the owner out (documents created
 *            before the row was provisioned still resolve correctly).
 *   editor — can read and edit drafts, publish, schedule.
 *   viewer — read-only access to drafts.
 *
 * Fail-closed contract:
 *   - unknown / unrecognised collaborator role → deny
 *   - collaborator row in any state other than 'active' → deny
 *   - no document row → 'not_found' (callers map to 404)
 *   - no collaborator row and not the creator → 'denied' (callers map to 403)
 *
 * Admins pass every capability gate, matching `hasCapability` in
 * routes/moodboards.ts (`request.authUser?.role === 'admin'`).
 */

export type CreatorDocumentRole = 'owner' | 'editor' | 'viewer';

/** Role rank for minimum-role checks: viewer < editor < owner. */
const ROLE_RANK: Record<CreatorDocumentRole, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
};

/** Anything that can run a parameterised query — a Pool or a checked-out client. */
export type DraftAccessQueryable = Pick<Pool, 'query'> | PoolClient;

export type DraftAccessResult =
  | { status: 'not_found' }
  | { status: 'denied' }
  | { status: 'ok'; role: CreatorDocumentRole; creatorId: string };

function toRole(value: unknown): CreatorDocumentRole | null {
  return value === 'owner' || value === 'editor' || value === 'viewer' ? value : null;
}

/**
 * Resolve the actor's role on a creator document and require at least
 * `minRole`. Returns a discriminated result so callers can map 'not_found'
 * to 404 and 'denied' to 403 without conflating them.
 *
 * The owner is resolved from `creator_documents.creator_id` — the capability
 * source of truth — not from the collaborator row, so this check stays
 * correct even when the owner row was never provisioned (pre-326 documents).
 */
export async function requireDraftRole(
  db: DraftAccessQueryable,
  documentId: string,
  userId: string,
  minRole: CreatorDocumentRole = 'viewer',
  opts?: { isAdmin?: boolean },
): Promise<DraftAccessResult> {
  const docResult = await db.query<{ creator_id: string }>(
    `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
    [documentId],
  );
  if (!docResult.rowCount) {
    return { status: 'not_found' };
  }
  const creatorId = docResult.rows[0].creator_id;

  let role: CreatorDocumentRole | null = null;
  if (creatorId === userId) {
    role = 'owner';
  } else {
    const collabResult = await db.query<{ role: string }>(
      `SELECT role FROM creator_collaborators
       WHERE document_id = $1 AND user_id = $2 AND state = 'active'
       LIMIT 1`,
      [documentId, userId],
    );
    role = toRole(collabResult.rows[0]?.role);
  }

  // Admin bypass — mirrors hasCapability() in routes/moodboards.ts.
  if (opts?.isAdmin) {
    role = 'owner';
  }

  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    return { status: 'denied' };
  }
  return { status: 'ok', role, creatorId };
}

/**
 * Resolve the actor's role without enforcing a minimum — for endpoints that
 * only need to know whether the actor can see the document at all.
 * Returns null for missing documents and non-collaborators alike (callers
 * that must distinguish should use requireDraftRole).
 */
export async function resolveDraftRole(
  db: DraftAccessQueryable,
  documentId: string,
  userId: string,
  opts?: { isAdmin?: boolean },
): Promise<CreatorDocumentRole | null> {
  const access = await requireDraftRole(db, documentId, userId, 'viewer', opts);
  return access.status === 'ok' ? access.role : null;
}

/**
 * Insert the owner collaborator row for a document. Called at document
 * creation (and backfilled by migration 326 for documents created between
 * 206 and 326) so `creator_collaborators` matches the moodboard_members
 * invariant: every document has an active owner row.
 */
export async function insertOwnerCollaboratorRow(
  db: DraftAccessQueryable,
  documentId: string,
  ownerUserId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO creator_collaborators (document_id, user_id, role, state, joined_at)
     VALUES ($1, $2, 'owner', 'active', NOW())
     ON CONFLICT (document_id, user_id) DO NOTHING`,
    [documentId, ownerUserId],
  );
}
