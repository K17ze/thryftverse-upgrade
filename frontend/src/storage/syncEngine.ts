/**
 * Sync engine contract for the ThryftVerse local SQLite store.
 *
 * The engine implements a pull/push reconciliation loop against the backend
 * `/sync` endpoints. It is intentionally a contract + stub: the typed
 * interfaces and the orchestration skeleton are production-shaped, while the
 * delta-application SQL is generic upsert/delete logic that callers can
 * specialise per domain as the offline surfaces come online.
 *
 * Pull  → `GET /sync/{domain}?since={rev}` returns `{ deltas, latestRev }`.
 * Push  → `POST /sync/push` with a single outbox operation returns one of:
 *            `applied`    — the operation was accepted at a new server rev.
 *            `superseded` — a newer server rev already exists; pull to reconcile.
 *            `conflict`   — the base rev is stale; surface to the user / retry.
 *            `gone`       — the entity was deleted server-side; drop locally.
 *
 * The engine is single-flighted per domain — concurrent `runSync` calls for
 * the same domain coalesce onto the first in-flight run.
 */

import { fetchJson } from '../lib/apiClient';
import { getDb, isDbAvailable } from './db';

/** Per-domain sync cursor persisted in the `sync_cursor` table. */
export interface SyncCursor {
  domain: string;
  lastRev: number;
  lastSyncedAt: number;
  freshnessTtlMs: number;
}

/** A server delta for a single entity. */
export interface SyncDelta {
  id: string;
  rev: number;
  deleted: boolean;
  data: Record<string, unknown>;
}

/** Response shape from `GET /sync/{domain}`. */
export interface PullResponse {
  deltas: SyncDelta[];
  latestRev: number;
}

/** A row from the `mutation_outbox` table. */
export interface OutboxOperation {
  seq: number;
  operationId: string;
  entityType: string;
  entityId: string;
  operation: string;
  payloadJson: string;
  baseRev: number;
  state: string;
  attemptCount: number;
  lastError: string | null;
}

/** Server response to a single push operation. */
export type PushResponse =
  | { status: 'applied'; rev: number }
  | { status: 'superseded'; rev: number }
  | { status: 'conflict'; rev: number; message?: string }
  | { status: 'gone' };

/** The set of domains the sync engine reconciles. */
export type SyncDomain =
  | 'conversation'
  | 'message'
  | 'feed_item'
  | 'listing_draft'
  | 'product';

const inFlight = new Set<string>();

/**
 * Read the persisted sync cursor for a domain. Returns a zeroed cursor when
 * the domain has never been synced.
 */
export async function getSyncCursor(domain: string): Promise<SyncCursor> {
  if (!isDbAvailable()) {
    return { domain, lastRev: 0, lastSyncedAt: 0, freshnessTtlMs: 300_000 };
  }
  const db = await getDb();
  const result = db.execute(
    'SELECT domain, last_rev, last_synced_at, freshness_ttl_ms FROM sync_cursor WHERE domain = ?;',
    domain,
  );
  const row = result.rows.item(0);
  if (!row) {
    return {
      domain,
      lastRev: 0,
      lastSyncedAt: 0,
      freshnessTtlMs: 300_000,
    };
  }
  return {
    domain: String(row.domain),
    lastRev: Number(row.last_rev),
    lastSyncedAt: Number(row.last_synced_at),
    freshnessTtlMs: Number(row.freshness_ttl_ms),
  };
}

/**
 * Persist the sync cursor after a successful pull + apply.
 */
async function saveSyncCursor(cursor: SyncCursor): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  db.execute(
    `INSERT OR REPLACE INTO sync_cursor (domain, last_rev, last_synced_at, freshness_ttl_ms)
     VALUES (?, ?, ?, ?);`,
    cursor.domain,
    cursor.lastRev,
    cursor.lastSyncedAt,
    cursor.freshnessTtlMs,
  );
}

/**
 * Pull server deltas for a domain since the given revision.
 * Calls `GET /sync/{domain}?since={rev}`.
 */
export async function pullDomain(
  domain: string,
  since: number,
): Promise<PullResponse> {
  return fetchJson<PullResponse>(
    `/sync/${encodeURIComponent(domain)}?since=${since}`,
    { method: 'GET' },
  );
}

/**
 * Per-domain column rename map. The backend returns column names from the
 * server schema; the local SQLite tables may use different names. This map
 * translates incoming `delta.data` keys to the local table's column names
 * before the upsert. Keys not in the map pass through unchanged.
 */
const DOMAIN_COLUMN_RENAME: Record<string, Record<string, string>> = {
  listing_draft: {
    // Backend returns `original_price_gbp`; the local table column is
    // `original_price` (stored as TEXT to match the `price` column pattern).
    original_price_gbp: 'original_price',
  },
  product: {
    // Backend returns `category`; the local product table column is
    // `category_id`.
    category: 'category_id',
    // Backend returns `original_price_gbp`; the local table column is
    // `original_price` (stored as TEXT to match the `price` column pattern).
    original_price_gbp: 'original_price',
  },
};

/**
 * Apply a batch of server deltas to the local store inside a single
 * transaction. Each delta is an upsert (or soft-delete when `deleted` is set)
 * against the domain table. Column names from `delta.data` are renamed per
 * the `DOMAIN_COLUMN_RENAME` map so the backend schema maps to the local
 * table schema.
 */
export async function applyDeltas(
  domain: string,
  deltas: SyncDelta[],
): Promise<void> {
  if (deltas.length === 0) return;
  if (!isDbAvailable()) return;
  const db = await getDb();
  const renameMap = DOMAIN_COLUMN_RENAME[domain] ?? {};

  await db.transaction(() => {
    for (const delta of deltas) {
      if (delta.deleted) {
        // Soft-delete: set the tombstone flag and bump updated_at.
        db.execute(
          `UPDATE ${domain} SET is_deleted = 1, server_rev = ?, updated_at = datetime('now')
           WHERE id = ?;`,
          delta.rev,
          delta.id,
        );
        continue;
      }

      // Rename incoming columns to local table columns, then upsert.
      const rawColumns = Object.keys(delta.data);
      const columns = rawColumns.map((c) => renameMap[c] ?? c);
      const placeholders = columns.map(() => '?').join(', ');
      const columnList = columns.join(', ');
      const updateList = columns
        .filter((c) => c !== 'id')
        .map((c) => `${c} = excluded.${c}`)
        .join(', ');
      const values = rawColumns.map((c) => delta.data[c] as string | number | null);

      db.execute(
        `INSERT OR REPLACE INTO ${domain} (${columnList}, server_rev, sync_seq, is_deleted, updated_at)
         VALUES (${placeholders}, ?, ?, 0, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET ${updateList}, server_rev = excluded.server_rev, updated_at = datetime('now');`,
        ...values,
        delta.rev,
        Date.now(),
      );
    }
  });
}

/**
 * Drain the mutation outbox in `seq` order, pushing each operation to
 * `POST /sync/push`. Handles the four server response states:
 *   - `applied`    → mark the row `synced` and remove it.
 *   - `superseded` → mark `conflict`; a subsequent pull reconciles.
 *   - `conflict`   → increment `attempt_count`, record `last_error`, stop.
 *   - `gone`       → mark the local entity deleted and remove the outbox row.
 */
export async function pushOutbox(): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  // Only drain 'pending' rows. 'pushing' rows are already in-flight (a
  // concurrent drain marked them); 'conflict' rows require a pull
  // reconciliation before they can be re-evaluated, so re-pushing them
  // without a pull would loop indefinitely. 'failed' rows need manual
  // intervention. 'synced' rows are removed.
  const result = db.execute(
    `SELECT seq, operation_id, entity_type, entity_id, operation, payload_json, base_rev, state, attempt_count, last_error
     FROM mutation_outbox
     WHERE state = 'pending'
     ORDER BY seq ASC;`,
  );

  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows.item(i);
    const op: OutboxOperation = {
      seq: Number(row.seq),
      operationId: String(row.operation_id),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      operation: String(row.operation),
      payloadJson: String(row.payload_json),
      baseRev: Number(row.base_rev),
      state: String(row.state),
      attemptCount: Number(row.attempt_count),
      lastError: row.last_error === null ? null : String(row.last_error),
    };

    // Mark as pushing so a concurrent run does not re-drain it.
    db.execute(
      `UPDATE mutation_outbox SET state = 'pushing', updated_at = datetime('now') WHERE seq = ?;`,
      op.seq,
    );

    try {
      const response = await fetchJson<PushResponse>('/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: op.operationId,
          entityType: op.entityType,
          entityId: op.entityId,
          operation: op.operation,
          payload: op.payloadJson,
          baseRev: op.baseRev,
        }),
      });

      switch (response.status) {
        case 'applied':
          db.execute(`DELETE FROM mutation_outbox WHERE seq = ?;`, op.seq);
          break;
        case 'superseded':
        case 'conflict':
          db.execute(
            `UPDATE mutation_outbox
             SET state = 'conflict', attempt_count = ?, last_error = ?, updated_at = datetime('now')
             WHERE seq = ?;`,
            op.attemptCount + 1,
            response.status === 'conflict'
              ? (response.message ?? 'conflict')
              : 'superseded by newer server revision',
            op.seq,
          );
          // Stop draining — a conflict requires pull reconciliation first.
          return;
        case 'gone':
          db.execute(
            `UPDATE ${op.entityType} SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?;`,
            op.entityId,
          );
          db.execute(`DELETE FROM mutation_outbox WHERE seq = ?;`, op.seq);
          break;
      }
    } catch (error) {
      // Network / server error — leave the row as `pending` for the next run
      // and record the failure. Do not abort the whole loop; subsequent rows
      // for unrelated entities can still succeed. After 10 attempts the row
      // is marked `failed` so it stops being retried automatically and
      // surfaces for manual intervention.
      const nextAttempt = op.attemptCount + 1;
      const nextState = nextAttempt >= 10 ? 'failed' : 'pending';
      db.execute(
        `UPDATE mutation_outbox
         SET state = ?, attempt_count = ?, last_error = ?, updated_at = datetime('now')
         WHERE seq = ?;`,
        nextState,
        nextAttempt,
        error instanceof Error ? error.message : String(error),
        op.seq,
      );
    }
  }
}

/**
 * Orchestrates a full sync cycle for a domain: pull → apply → update cursor →
 * push outbox. Single-flighted per domain so concurrent calls coalesce.
 */
export async function runSync(domain: SyncDomain): Promise<void> {
  if (inFlight.has(domain)) {
    return;
  }
  inFlight.add(domain);
  try {
    const cursor = await getSyncCursor(domain);
    const { deltas, latestRev } = await pullDomain(domain, cursor.lastRev);
    await applyDeltas(domain, deltas);
    await saveSyncCursor({
      domain,
      lastRev: latestRev,
      lastSyncedAt: Date.now(),
      freshnessTtlMs: cursor.freshnessTtlMs,
    });
    await pushOutbox();
  } finally {
    inFlight.delete(domain);
  }
}
