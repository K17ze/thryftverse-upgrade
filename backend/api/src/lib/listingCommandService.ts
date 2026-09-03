import type { Pool, PoolClient } from 'pg';
import { logger } from './logger.js';

// ── Command + result types ──────────────────────────────────────────────
//
// `executeListingCommand` is the single canonical entry point for mutating
// listing lifecycle state. Every status transition (delete, pause, resume,
// mark-sold-external) MUST go through this service so the side effects
// (search index, offer cancellation, audit) are always consistent.
//
// Bypassing this service — e.g. running `UPDATE listings SET status = ...`
// directly from a route — is the root cause of P0-10: the search index
// keeps stale documents, active offers linger on deleted listings, and no
// audit trail is recorded.

export type ListingCommand =
  | { type: 'delete'; listingId: string; reason?: string; actorId?: string }
  | { type: 'pause'; listingId: string; reason?: string; actorId?: string }
  | { type: 'resume'; listingId: string; reason?: string; actorId?: string }
  | {
      type: 'mark_sold_external';
      listingId: string;
      salePrice?: number;
      reason?: string;
      actorId?: string;
    };

export type CommandResult =
  | { status: 'applied'; listingId: string; newStatus: string }
  | { status: 'rejected'; listingId: string; reason: string; currentStatus: string }
  | { status: 'conflict'; listingId: string; reason: string; currentStatus: string };

// ── Allowed status transitions ──────────────────────────────────────────
//
// `sold` and `deleted` are terminal — no command may move a listing out of
// them. `draft` may be activated or deleted (publish / discard). `active`
// may be paused, deleted, or marked sold. `paused` may be resumed, deleted,
// or marked sold externally (a seller can complete a sale while hidden).
// This mirrors the CHECK constraint on listings.status from
// migration 031 and the canonical state machine documented in AGENTS.md.

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  active: ['paused', 'deleted', 'sold'],
  paused: ['active', 'deleted', 'sold'],
  draft: ['active', 'deleted'],
  sold: [], // terminal
  deleted: [], // terminal
};

const COMMAND_TARGET_STATUS: Record<ListingCommand['type'], string> = {
  delete: 'deleted',
  pause: 'paused',
  resume: 'active',
  mark_sold_external: 'sold',
};

interface ListingLockRow {
  id: string;
  seller_id: string;
  status: string;
  version: number;
}

/**
 * Execute a single canonical listing lifecycle command inside a transaction.
 *
 * Guarantees:
 *  1. Row-level `FOR UPDATE` lock so concurrent commands serialize.
 *  2. Optimistic concurrency precondition when `expectedVersion` is given.
 *  3. Transition validation against `ALLOWED_TRANSITIONS`.
 *  4. Status mutation + version bump committed atomically.
 *  5. Side effects fired after commit:
 *     - search index removal (delete/sold) or re-sync (pause/resume)
 *     - cancellation of active pending offers (delete/sold)
 *     - audit log entry
 *
 * Side-effect failures are logged but never throw — the status mutation is
 * already durable by the time they run, and a stale search document is
 * recoverable by the periodic re-sync, whereas rolling back a committed
 * status change would corrupt the source of truth.
 */
export async function executeListingCommand(
  db: Pool,
  command: ListingCommand,
  expectedVersion?: number,
): Promise<CommandResult> {
  const { listingId, type } = command;
  const targetStatus = COMMAND_TARGET_STATUS[type];

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Load + lock the listing row.
    const lockResult = await client.query<ListingLockRow>(
      `SELECT id, seller_id, status, version
         FROM listings
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
      [listingId],
    );

    if (!lockResult.rowCount || lockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        status: 'rejected',
        listingId,
        reason: 'not_found',
        currentStatus: 'unknown',
      };
    }

    const current = lockResult.rows[0];

    // 2. Optimistic concurrency precondition.
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      await client.query('ROLLBACK');
      return {
        status: 'conflict',
        listingId,
        reason: `version mismatch (expected ${expectedVersion}, found ${current.version})`,
        currentStatus: current.status,
      };
    }

    // 3. Transition validation.
    const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      await client.query('ROLLBACK');
      return {
        status: 'rejected',
        listingId,
        reason: `transition ${current.status} -> ${targetStatus} is not allowed`,
        currentStatus: current.status,
      };
    }

    // 4. Apply the status mutation + version bump.
    await client.query(
      `UPDATE listings
          SET status = $2,
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1`,
      [listingId, targetStatus],
    );

    // Cancel active pending offers for terminal transitions (delete/sold).
    // Non-terminal transitions (pause/resume) leave offers intact — a
    // paused listing may still have a pending offer that resumes if the
    // listing is reactivated before the offer expires.
    let cancelledOffers = 0;
    if (type === 'delete' || type === 'mark_sold_external') {
      const cancelResult = await client.query(
        `UPDATE listing_offers
            SET status = 'cancelled',
                cancelled_at = NOW(),
                updated_at = NOW()
          WHERE listing_id = $1
            AND status = 'pending'`,
        [listingId],
      );
      cancelledOffers = cancelResult.rowCount ?? 0;
    }

    // Record an audit entry inside the same transaction so the audit trail
    // and the status mutation commit (or roll back) together.
    await recordListingCommandAudit(client, command, current.status, targetStatus, cancelledOffers);

    await client.query('COMMIT');

    // 5. Post-commit side effects. These are best-effort: the mutation is
    // already durable. A failure here is logged and left for the periodic
    // search re-sync / offer sweep to reconcile.
    await firePostCommitSideEffects(db, command, targetStatus);

    return { status: 'applied', listingId, newStatus: targetStatus };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure — the connection will be reset on release
    }
    logger.error(
      { err: error, listingId, command: type },
      'listingCommandService: failed to execute command',
    );
    // Unknown outcome — surface as a conflict so the caller reconciles.
    return {
      status: 'conflict',
      listingId,
      reason: 'server_error',
      currentStatus: 'unknown',
    };
  } finally {
    client.release();
  }
}

// ── Audit ───────────────────────────────────────────────────────────────
//
// We write to `admin_audit_logs` when an actorId is present (admin-driven
// commands) and otherwise record a lightweight row in `listing_batch_items`
// via the batch endpoint. For seller-initiated commands the actorId is the
// seller's own user id, which is still a valid `admin_user_id` value for
// audit purposes — the column name is historical.

async function recordListingCommandAudit(
  client: PoolClient,
  command: ListingCommand,
  fromStatus: string,
  toStatus: string,
  cancelledOffers: number,
): Promise<void> {
  const actorId = (command as { actorId?: string }).actorId;
  if (!actorId) return;

  const metadata = {
    command: command.type,
    fromStatus,
    toStatus,
    cancelledOffers,
    reason: (command as { reason?: string }).reason ?? null,
    salePrice: (command as { salePrice?: number }).salePrice ?? null,
  };

  try {
    await client.query(
      `INSERT INTO admin_audit_logs
          (admin_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        actorId,
        `listing.${command.type}`,
        'listing',
        command.listingId,
        JSON.stringify(metadata),
      ],
    );
  } catch (error) {
    // Audit failure must not block the command — the mutation is the
    // source of truth. Log and continue.
    logger.warn(
      { err: (error as Error).message, listingId: command.listingId, command: command.type },
      'listingCommandService: failed to record audit entry',
    );
  }
}

// ── Post-commit side effects ────────────────────────────────────────────
//
// Dynamic imports avoid a static import cycle: searchSync re-exports
// adapter helpers that other route modules import, and those route modules
// are what register the endpoints that call this service. Lazy loading
// keeps the dependency graph acyclic at module-eval time.

async function firePostCommitSideEffects(
  db: Pool,
  command: ListingCommand,
  newStatus: string,
): Promise<void> {
  const { listingId, type } = command;

  try {
    const searchSync = await import('./searchSync.js');

    if (type === 'delete' || type === 'mark_sold_external') {
      // Terminal states must be removed from the search index — a deleted
      // or sold listing must never appear in discovery results.
      await searchSync.removeListingFromIndex(listingId);
    } else {
      // pause/resume — re-sync so the document reflects the new status
      // filter value. A paused listing is filtered out of active results
      // but remains in the index for seller-facing views.
      await searchSync.syncSingleListing(db, listingId);
    }
  } catch (error) {
    logger.warn(
      { err: (error as Error).message, listingId, newStatus },
      'listingCommandService: post-commit search sync failed',
    );
  }
}
