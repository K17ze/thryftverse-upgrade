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
 *   1. Editor calls `enqueueMoodboardOperationBatch()` with the whole
 *      command's ops — they are inserted in ONE SQLite transaction, so a
 *      mid-batch failure rolls back and no partial command survives to
 *      drain later (S21-04). `enqueueMoodboardOperation()` is the
 *      single-op convenience wrapper. Rows persist to `mutation_outbox`
 *      as `pending`.
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
import type {
  MoodboardOperationResponse,
  MoodboardOperationType } from '../services/moodboardApi';

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

export interface EnqueueMoodboardOperationInput {
  operationId: string;
  boardId: string;
  /** Must match the backend `submitOperationSchema` enum or the op is rejected. */
  operation: MoodboardOperationType;
  payload: Record<string, unknown>;
  baseRev: number;
}

const INSERT_OPERATION_SQL = `INSERT OR REPLACE INTO mutation_outbox
   (operation_id, entity_type, entity_id, operation, payload_json, base_rev, state, attempt_count, last_error)
 VALUES (?, 'moodboard', ?, ?, ?, ?, 'pending', 0, NULL);`;

/**
 * Enqueue a moodboard operation into the durable outbox. The row is
 * persisted immediately to SQLite so it survives app kills.
 */
export async function enqueueMoodboardOperation(
  input: EnqueueMoodboardOperationInput,
): Promise<void> {
  return enqueueMoodboardOperationBatch([input]);
}

/**
 * Atomically enqueue an entire command batch of moodboard operations.
 *
 * Every op is inserted inside ONE SQLite transaction (S21-04): a mid-batch
 * failure rolls the transaction back so NO durable prefix survives — a
 * command's ops are either all queued (and drain together on reconnect) or
 * none are. Callers can therefore trust a 'failed' outcome to mean "nothing
 * will apply later" instead of discovering an orphaned prefix at drain time.
 */
export async function enqueueMoodboardOperationBatch(
  inputs: EnqueueMoodboardOperationInput[],
): Promise<void> {
  if (!isDbAvailable() || inputs.length === 0) return;
  const db = await getDb();
  // op-sqlite's transaction wraps the callback in BEGIN/COMMIT and rolls
  // back on a thrown error — the same pattern the migration runner uses.
  await db.transaction(() => {
    for (const input of inputs) {
      db.execute(
        INSERT_OPERATION_SQL,
        input.operationId,
        input.boardId,
        input.operation,
        JSON.stringify(input.payload),
        input.baseRev,
      );
    }
  });
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
 * Discard all not-yet-applied moodboard outbox rows for one board. Used when
 * the queued intent is superseded — e.g. the user resolved a conflict by
 * keeping the server version, or a local snapshot is re-applied wholesale.
 */
export async function clearMoodboardOutboxForBoard(boardId: string): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  db.execute(
    `DELETE FROM mutation_outbox
     WHERE entity_type = 'moodboard' AND entity_id = ?
       AND state IN ('pending', 'pushing', 'conflict', 'failed');`,
    boardId,
  );
}

/**
 * Drain pending moodboard outbox rows to the operations endpoint.
 * Returns per-outcome counts so the caller can surface honest status.
 *
 * After each applied/duplicate row the remaining queued rows for that board
 * are rebased onto the new revision — otherwise a multi-op queue would
 * conflict against itself on the second op.
 */
export async function drainMoodboardOutbox(): Promise<{ pushed: number; conflicts: number; forbidden: number; errors: number }> {
  if (!isDbAvailable()) return { pushed: 0, conflicts: 0, forbidden: 0, errors: 0 };
  const db = await getDb();
  const result = db.execute(
    `SELECT seq, operation_id, entity_id, operation, payload_json, base_rev, state, attempt_count
     FROM mutation_outbox
     WHERE entity_type = 'moodboard' AND state IN ('pending', 'pushing', 'conflict')
     ORDER BY seq ASC;`,
  );

  let pushed = 0;
  let conflicts = 0;
  let forbidden = 0;
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
        // Rebase the rest of this board's queue onto the new revision so a
        // multi-op drain does not conflict against itself.
        db.execute(
          `UPDATE mutation_outbox SET base_rev = ?
           WHERE entity_type = 'moodboard' AND entity_id = ? AND state = 'pending' AND seq > ?;`,
          response.revision,
          op.entityId,
          op.seq,
        );
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
        forbidden++;
      }
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        // Deterministic rejection (validation, gone, conflict-class 4xx) —
        // retrying can never succeed. Mark the row failed so it cannot
        // poison the queue, then continue draining the rows behind it.
        // Per apiClient's contract, 4xx responses are not retried.
        db.execute(
          `UPDATE mutation_outbox
           SET state = 'failed', attempt_count = ?, last_error = ?,
           updated_at = datetime('now')
           WHERE seq = ?;`,
          op.attemptCount + 1,
          `rejected ${status}: ${error instanceof Error ? error.message : String(error)}`,
          op.seq,
        );
        errors++;
        continue;
      }
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

  return { pushed, conflicts, forbidden, errors };
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
