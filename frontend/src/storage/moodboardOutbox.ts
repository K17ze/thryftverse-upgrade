/**
 * Moodboard-specific outbox drain.
 *
 * The generic `pushOutbox()` in syncEngine.ts pushes to `POST /sync/push`.
 * Moodboard operations have their own idempotent endpoint
 * (`POST /moodboards/:id/operations`) with a different response contract
 * (applied/duplicate/conflict/forbidden). This module drains moodboard
 * outbox rows to that endpoint and reconciles the local cache.
 *
 * Lifecycle:
 *   1. Editor calls `enqueueMoodboardOperation()` with the operation payload.
 *      The row is persisted to `mutation_outbox` as `pending`.
 *   2. `drainMoodboardOutbox()` reads pending moodboard rows in `seq` order
 *      and pushes each to the operations endpoint.
 *   3. On `applied`/`duplicate` — the row is removed and the local cache is
 *      updated with the new revision.
 *   4. On `conflict` — the row is marked `conflict` and the local cache is
 *      refreshed from the server. The editor's reconciliation handler
 *      surfaces the conflict to the user.
 *   5. On `forbidden` — the row is marked `failed` with the error.
 *   6. On network error — the row stays `pending` for the next drain.
 */

import { getDb, isDbAvailable } from './db';
import { fetchJson } from '../lib/apiClient';
import type { MoodboardOperationResponse } from '../services/moodboardApi';

interface MoodboardOutboxRow {
  seq: number;
  operationId: string;
  entityId: string;
  operation: string;
  payloadJson: string;
  baseRev: number;
  state: string;
  attemptCount: number;
}

/**
 * Enqueue a moodboard operation into the durable outbox. The row is
 * persisted immediately to SQLite so it survives app kills.
 */
export async function enqueueMoodboardOperation(input: {
  operationId: string;
  boardId: string;
  operation: string;
  payload: Record<string, unknown>;
  baseRev: number;
}): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  db.execute(
    `INSERT OR REPLACE INTO mutation_outbox
       (operation_id, entity_type, entity_id, operation, payload_json, base_rev, state, attempt_count, last_error)
     VALUES (?, 'moodboard', ?, ?, ?, ?, 'pending', 0, NULL);`,
    input.operationId,
    input.boardId,
    input.operation,
    JSON.stringify(input.payload),
    input.baseRev,
  );
}

/**
 * Remove a moodboard outbox row by operationId. Called when a direct
 * (non-outbox) API call succeeds, so the row is not re-pushed by the drain.
 */
export async function removeMoodboardOutboxOperation(operationId: string): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  db.execute(
    `DELETE FROM mutation_outbox WHERE operation_id = ? AND entity_type = 'moodboard';`,
    operationId,
  );
}

/**
 * Drain pending moodboard outbox rows to the operations endpoint.
 * Returns the number of rows successfully pushed.
 */
export async function drainMoodboardOutbox(): Promise<{ pushed: number; conflicts: number; errors: number }> {
  if (!isDbAvailable()) return { pushed: 0, conflicts: 0, errors: 0 };
  const db = await getDb();
  const result = db.execute(
    `SELECT seq, operation_id, entity_id, operation, payload_json, base_rev, state, attempt_count
     FROM mutation_outbox
     WHERE entity_type = 'moodboard' AND state IN ('pending', 'pushing', 'conflict')
     ORDER BY seq ASC;`,
  );

  let pushed = 0;
  let conflicts = 0;
  let errors = 0;

  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows.item(i);
    const op: MoodboardOutboxRow = {
      seq: Number(row.seq),
      operationId: String(row.operation_id),
      entityId: String(row.entity_id),
      operation: String(row.operation),
      payloadJson: String(row.payload_json),
      baseRev: Number(row.base_rev),
      state: String(row.state),
      attemptCount: Number(row.attempt_count),
    };

    // Mark as pushing so a concurrent run does not re-drain it.
    db.execute(
      `UPDATE mutation_outbox SET state = 'pushing', updated_at = datetime('now') WHERE seq = ?;`,
      op.seq,
    );

    try {
      const payload = JSON.parse(op.payloadJson) as Record<string, unknown>;
      const response = await fetchJson<MoodboardOperationResponse>(
        `/moodboards/${encodeURIComponent(op.entityId)}/operations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientOperationId: op.operationId,
            baseRevision: op.baseRev,
            type: op.operation,
            itemId: payload.itemId ?? undefined,
            payload,
          }),
        },
      );

      if (response.outcome === 'applied' || response.outcome === 'duplicate') {
        db.execute(`DELETE FROM mutation_outbox WHERE seq = ?;`, op.seq);
        pushed++;
      } else if (response.outcome === 'conflict') {
        db.execute(
          `UPDATE mutation_outbox
           SET state = 'conflict', attempt_count = ?, last_error = 'conflict: server revision ahead',
           updated_at = datetime('now')
           WHERE seq = ?;`,
          op.attemptCount + 1,
          op.seq,
        );
        conflicts++;
        // Stop draining — a conflict requires the editor to reconcile first.
        break;
      } else if (response.outcome === 'forbidden') {
        db.execute(
          `UPDATE mutation_outbox
           SET state = 'failed', attempt_count = ?, last_error = 'forbidden: no edit capability',
           updated_at = datetime('now')
           WHERE seq = ?;`,
          op.attemptCount + 1,
          op.seq,
        );
        errors++;
      }
    } catch (error) {
      // Network / server error — leave the row as `pending` for the next run.
      db.execute(
        `UPDATE mutation_outbox
         SET state = 'pending', attempt_count = ?, last_error = ?,
         updated_at = datetime('now')
         WHERE seq = ?;`,
        op.attemptCount + 1,
        error instanceof Error ? error.message : String(error),
        op.seq,
      );
      errors++;
      // Stop draining on network error — subsequent rows will likely fail too.
      break;
    }
  }

  return { pushed, conflicts, errors };
}

/**
 * Returns the count of pending moodboard outbox rows for UI display.
 */
export async function getMoodboardOutboxPendingCount(): Promise<number> {
  if (!isDbAvailable()) return 0;
  const db = await getDb();
  const result = db.execute(
    `SELECT COUNT(*) AS count
     FROM mutation_outbox
     WHERE entity_type = 'moodboard' AND state IN ('pending', 'pushing', 'conflict');`,
  );
  const row = result.rows.item(0);
  return Number(row?.count ?? 0);
}
