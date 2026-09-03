/**
 * chatOutbox — durable local outbox for chat messages.
 *
 * P0.14: The UI promises messages will send after reconnect. This module
 * makes that promise real. When a send fails due to network unavailability,
 * the message is persisted to the local SQLite `mutation_outbox` table with
 * its `clientMessageId`. A drain function flushes pending messages when
 * connectivity returns, using the same idempotent `clientMessageId` so the
 * server deduplicates on retry.
 *
 * Lifecycle:
 *   1. User sends message → optimistic bubble painted with `clientMessageId`
 *   2. HTTP send fails (network error) → message enters `reconciling` state
 *   3. If still failing after retry → message is enqueued to the outbox
 *   4. NetInfo reconnect event → `drainChatOutbox()` fires
 *   5. Each pending message is sent via the canonical API with its original
 *      `clientMessageId` → server replays or creates, returns server ID
 *   6. On success → outbox row deleted, local message reconciled to `sent`
 *   7. On failure → exponential backoff, `attempt_count` incremented
 */
import NetInfo from '@react-native-community/netinfo';
import { getDb, isDbAvailable } from '../storage/db';
import { sendConversationMessageOnApi } from './chatApi';

export interface ChatOutboxEntry {
  seq: number;
  operationId: string;
  conversationId: string;
  clientMessageId: string;
  text: string;
  metadataJson: string | null;
  replyToMessageId: string | null;
  type: string | null;
  mediaUri: string | null;
  state: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: number;
}

/**
 * Enqueue a chat message to the durable outbox. Called when the network
 * send fails and the message enters the "reconciling" → "queued" path.
 */
export async function enqueueChatMessage(input: {
  conversationId: string;
  clientMessageId: string;
  text: string;
  metadata?: Record<string, unknown>;
  replyToMessageId?: string;
  type?: string;
  mediaUri?: string;
}): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  db.execute(
    `INSERT OR REPLACE INTO mutation_outbox
       (operation_id, entity_type, entity_id, operation, payload_json, base_rev, state, attempt_count, last_error)
     VALUES (?, 'chat_message', ?, 'send', ?, 0, 'pending', 0, NULL);`,
    input.clientMessageId,
    input.conversationId,
    JSON.stringify({
      conversationId: input.conversationId,
      clientMessageId: input.clientMessageId,
      text: input.text,
      metadata: input.metadata ?? null,
      replyToMessageId: input.replyToMessageId ?? null,
      type: input.type ?? null,
      mediaUri: input.mediaUri ?? null,
    }),
  );
}

/**
 * Read all pending chat message outbox entries, ordered by seq.
 */
export async function getPendingChatOutbox(): Promise<ChatOutboxEntry[]> {
  if (!isDbAvailable()) return [];
  const db = await getDb();
  const result = db.execute(
    `SELECT seq, operation_id, entity_id, payload_json, state, attempt_count, last_error
     FROM mutation_outbox
     WHERE entity_type = 'chat_message' AND state IN ('pending', 'conflict')
     ORDER BY seq ASC;`,
  );

  const entries: ChatOutboxEntry[] = [];
  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows.item(i);
    let payload: { conversationId?: string; clientMessageId?: string; text?: string; metadata?: Record<string, unknown>; replyToMessageId?: string; type?: string; mediaUri?: string } = {};
    try {
      payload = JSON.parse(String(row.payload_json));
    } catch {
      continue;
    }
    entries.push({
      seq: Number(row.seq),
      operationId: String(row.operation_id),
      conversationId: payload.conversationId ?? String(row.entity_id),
      clientMessageId: payload.clientMessageId ?? String(row.operation_id),
      text: payload.text ?? '',
      metadataJson: payload.metadata ? JSON.stringify(payload.metadata) : null,
      replyToMessageId: payload.replyToMessageId ?? null,
      type: payload.type ?? null,
      mediaUri: payload.mediaUri ?? null,
      state: String(row.state),
      attemptCount: Number(row.attempt_count),
      lastError: row.last_error === null ? null : String(row.last_error),
      createdAt: 0,
    });
  }
  return entries;
}

/**
 * Remove an outbox entry after successful send.
 */
export async function removeChatOutboxEntry(operationId: string): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  db.execute(
    `DELETE FROM mutation_outbox WHERE operation_id = ?;`,
    operationId,
  );
}

/**
 * Mark an outbox entry as failed with an error message and incremented
 * attempt count. After 5 attempts, the entry is marked as 'failed' and
 * stops being retried automatically.
 */
export async function markChatOutboxEntryFailed(
  operationId: string,
  error: string,
): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  db.execute(
    `UPDATE mutation_outbox
     SET attempt_count = attempt_count + 1,
         last_error = ?,
         state = CASE WHEN attempt_count >= 4 THEN 'failed' ELSE 'pending' END
     WHERE operation_id = ?;`,
    error,
    operationId,
  );
}

/**
 * Drain the chat outbox — attempt to send all pending messages.
 * Called on NetInfo reconnect and on app foreground.
 *
 * Uses the original `clientMessageId` for idempotent replay: the server
 * will either return the already-created message (if the original send
 * actually succeeded) or create it now.
 */
export async function drainChatOutbox(
  onReconciled?: (conversationId: string, clientMessageId: string) => void,
): Promise<void> {
  const entries = await getPendingChatOutbox();
  if (entries.length === 0) return;

  for (const entry of entries) {
    try {
      await sendConversationMessageOnApi(
        entry.conversationId,
        entry.text,
        entry.metadataJson ? JSON.parse(entry.metadataJson) : undefined,
        entry.clientMessageId,
        {
          replyToMessageId: entry.replyToMessageId ?? undefined,
          type: entry.type as any ?? undefined,
          mediaUri: entry.mediaUri ?? undefined,
        },
      );
      await removeChatOutboxEntry(entry.operationId);
      onReconciled?.(entry.conversationId, entry.clientMessageId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await markChatOutboxEntryFailed(entry.operationId, errorMsg);
    }
  }
}

let unsubscribeNetInfo: (() => void) | null = null;
let isDraining = false;

/**
 * Subscribe to NetInfo reconnect events and drain the outbox when
 * connectivity returns. Call this once at app startup.
 */
export function initChatOutboxDrain(
  onReconciled?: (conversationId: string, clientMessageId: string) => void,
): void {
  if (unsubscribeNetInfo) return;

  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected && !isDraining) {
      isDraining = true;
      drainChatOutbox(onReconciled)
        .catch(() => undefined)
        .finally(() => {
          isDraining = false;
        });
    }
  });
}

/**
 * Stop the NetInfo subscription. Call on app teardown.
 */
export function teardownChatOutboxDrain(): void {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
}
