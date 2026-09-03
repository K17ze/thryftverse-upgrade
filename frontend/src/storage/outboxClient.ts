/**
 * Generic outbox client — durable mutation queue for offline-first sync.
 *
 * This module is the durability layer beneath the optimistic UI state. Any
 * local mutation that must eventually reach the server is enqueued here so
 * it survives app kills and is replayed by the drain loop when connectivity
 * returns.
 *
 * The drain delegates to `pushOutbox()` from the sync engine, which pushes
 * each pending row to `POST /sync/push` in `seq` order and handles the four
 * server response states (applied / superseded / conflict / gone).
 *
 * Lifecycle:
 *   1. Caller mutates local data and calls `enqueueOperation()` with the
 *      operation payload. The row is persisted to `mutation_outbox` as
 *      `pending`.
 *   2. `initOutboxDrain()` subscribes to NetInfo reconnect + AppState
 *      foreground events and calls `drainOutbox()` on each.
 *   3. `drainOutbox()` calls `pushOutbox()` which pushes each row to the
 *      server. On `applied` the row is removed; on `conflict`/`superseded`
 *      the row is marked and a pull reconciles; on network error the row
 *      stays `pending` for the next drain.
 */
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import type { OPSQLiteDatabase } from '@op-engineering/op-sqlite';
import { getDb, isDbAvailable } from './db';
import { pushOutbox } from './syncEngine';

export interface OutboxConflictRow {
  seq: number;
  operationId: string;
  entityType: string;
  entityId: string;
  operation: string;
  attemptCount: number;
  lastError: string | null;
}

export interface DrainResult {
  drained: boolean;
  error: string | null;
}

/**
 * Enqueue a local mutation into the durable outbox. The row is persisted
 * immediately to SQLite so it survives app kills. The `operationId` is
 * unique per operation and used for idempotency on the server side.
 */
export async function enqueueOperation(
  db: OPSQLiteDatabase,
  input: {
    operationId: string;
    entityType: string;
    entityId: string;
    operation: string;
    payload: string;
    baseRev: number;
  },
): Promise<void> {
  db.execute(
    `INSERT OR REPLACE INTO mutation_outbox
       (operation_id, entity_type, entity_id, operation, payload_json, base_rev, state, attempt_count, last_error)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, NULL);`,
    input.operationId,
    input.entityType,
    input.entityId,
    input.operation,
    input.payload,
    input.baseRev,
  );
}

/**
 * Remove an outbox row by `operationId`. Called by callers that handle
 * their own server push (e.g. listing publication) after a direct API
 * call succeeds, so the outbox row does not get re-pushed by the drain.
 */
export async function removeOutboxOperation(operationId: string): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  db.execute(
    `DELETE FROM mutation_outbox WHERE operation_id = ?;`,
    operationId,
  );
}

/**
 * Mark an outbox row as failed with an error message and incremented
 * attempt count. After 5 attempts the row is marked `failed` and stops
 * being retried automatically.
 */
export async function markOutboxOperationFailed(
  operationId: string,
  error: string,
): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  db.execute(
    `UPDATE mutation_outbox
     SET attempt_count = attempt_count + 1,
         last_error = ?,
         state = CASE WHEN attempt_count >= 4 THEN 'failed' ELSE 'pending' END,
         updated_at = datetime('now')
     WHERE operation_id = ?;`,
    error,
    operationId,
  );
}

/**
 * Drain the mutation outbox by delegating to the sync engine's
 * `pushOutbox()`. Returns a status object so callers can surface errors
 * or trigger a pull reconciliation when conflicts are detected.
 */
export async function drainOutbox(): Promise<DrainResult> {
  try {
    await pushOutbox();
    return { drained: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { drained: false, error: message };
  }
}

/**
 * Returns the count of pending outbox rows for UI display (e.g. a badge
 * showing "3 changes pending sync"). Excludes `synced` rows (which are
 * removed) and `failed` rows (which require manual intervention).
 */
export async function getOutboxPendingCount(): Promise<number> {
  if (!isDbAvailable()) return 0;
  const db = await getDb();
  const result = db.execute(
    `SELECT COUNT(*) AS count
     FROM mutation_outbox
     WHERE state IN ('pending', 'pushing', 'conflict');`,
  );
  const row = result.rows.item(0);
  return Number(row?.count ?? 0);
}

/**
 * Returns outbox rows in a `conflict` state so the UI can surface them
 * for user resolution (e.g. "This item was edited elsewhere — review").
 */
export async function getOutboxConflicts(): Promise<OutboxConflictRow[]> {
  if (!isDbAvailable()) return [];
  const db = await getDb();
  const result = db.execute(
    `SELECT seq, operation_id, entity_type, entity_id, operation, attempt_count, last_error
     FROM mutation_outbox
     WHERE state = 'conflict'
     ORDER BY seq ASC;`,
  );

  const conflicts: OutboxConflictRow[] = [];
  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows.item(i);
    conflicts.push({
      seq: Number(row.seq),
      operationId: String(row.operation_id),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      operation: String(row.operation),
      attemptCount: Number(row.attempt_count),
      lastError: row.last_error === null ? null : String(row.last_error),
    });
  }
  return conflicts;
}

let unsubscribeNetInfo: (() => void) | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let isDraining = false;

/**
 * Subscribe to NetInfo reconnect events and AppState foreground transitions
 * and drain the outbox when connectivity returns or the app comes to the
 * foreground. Call this once at app startup (alongside
 * `initChatOutboxDrain`).
 *
 * The optional `onDrained` callback is invoked after each drain attempt so
 * callers can refresh UI state (e.g. update the pending count badge).
 */
export function initOutboxDrain(onDrained?: (result: DrainResult) => void): void {
  if (unsubscribeNetInfo) return;

  const triggerDrain = () => {
    if (isDraining) return;
    isDraining = true;
    drainOutbox()
      .then((result) => {
        onDrained?.(result);
      })
      .catch(() => undefined)
      .finally(() => {
        isDraining = false;
      });
  };

  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      triggerDrain();
    }
  });

  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      triggerDrain();
    }
  });

  triggerDrain();
}

/**
 * Stop the NetInfo and AppState subscriptions. Call on app teardown.
 */
export function teardownOutboxDrain(): void {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}
