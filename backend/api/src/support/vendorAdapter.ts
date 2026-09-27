import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';

// ── Row types (snake_case, matches DB) ──

interface VendorMappingRow {
  id: string;
  canonical_type: string;
  canonical_id: string;
  vendor_name: string;
  vendor_id: string;
  vendor_url: string | null;
  created_at: string;
}

interface VendorOutboxRow {
  id: string;
  canonical_type: string;
  canonical_id: string;
  vendor_name: string;
  event_type: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  state: string;
  attempts: number;
  last_error: string | null;
  last_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface VendorInboxRow {
  id: string;
  vendor_name: string;
  vendor_event_id: string;
  event_type: string;
  vendor_conversation_id: string | null;
  vendor_ticket_id: string | null;
  payload: Record<string, unknown>;
  signature_valid: boolean;
  processed_at: string | null;
  processing_error: string | null;
  created_at: string;
}

// ── Serializers ──

export interface VendorMapping {
  id: string;
  canonicalType: string;
  canonicalId: string;
  vendorName: string;
  vendorId: string;
  vendorUrl: string | null;
  createdAt: string;
}

export interface VendorOutboxEntry {
  id: string;
  canonicalType: string;
  canonicalId: string;
  vendorName: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  state: 'pending' | 'delivering' | 'delivered' | 'failed' | 'skipped';
  attempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function serializeMapping(row: VendorMappingRow): VendorMapping {
  return {
    id: row.id,
    canonicalType: row.canonical_type,
    canonicalId: row.canonical_id,
    vendorName: row.vendor_name,
    vendorId: row.vendor_id,
    vendorUrl: row.vendor_url,
    createdAt: row.created_at,
  };
}

function serializeOutbox(row: VendorOutboxRow): VendorOutboxEntry {
  return {
    id: row.id,
    canonicalType: row.canonical_type,
    canonicalId: row.canonical_id,
    vendorName: row.vendor_name,
    eventType: row.event_type,
    payload: row.payload,
    idempotencyKey: row.idempotency_key,
    state: row.state as VendorOutboxEntry['state'],
    attempts: row.attempts,
    lastError: row.last_error,
    lastAttemptAt: row.last_attempt_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Public API: Mappings ──

/**
 * Creates or retrieves a vendor mapping. If a mapping already exists for the
 * same canonical entity + vendor, it returns the existing record.
 */
export async function upsertVendorMapping(
  db: Pool,
  input: {
    canonicalType: string;
    canonicalId: string;
    vendorName: string;
    vendorId: string;
    vendorUrl?: string;
  },
): Promise<VendorMapping> {
  const id = `vmap_${crypto.randomUUID()}`;

  const result = await db.query<VendorMappingRow>(
    `
      INSERT INTO support_vendor_mappings (id, canonical_type, canonical_id, vendor_name, vendor_id, vendor_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (canonical_type, canonical_id, vendor_name)
      DO UPDATE SET vendor_url = COALESCE(EXCLUDED.vendor_url, support_vendor_mappings.vendor_url)
      RETURNING id, canonical_type, canonical_id, vendor_name, vendor_id, vendor_url, created_at
    `,
    [id, input.canonicalType, input.canonicalId, input.vendorName, input.vendorId, input.vendorUrl ?? null],
  );

  return serializeMapping(result.rows[0]);
}

/**
 * Returns the vendor mapping for a canonical entity, or null if none exists.
 */
export async function getVendorMapping(
  db: Pool,
  canonicalType: string,
  canonicalId: string,
  vendorName: string,
): Promise<VendorMapping | null> {
  const result = await db.query<VendorMappingRow>(
    `
      SELECT id, canonical_type, canonical_id, vendor_name, vendor_id, vendor_url, created_at
      FROM support_vendor_mappings
      WHERE canonical_type = $1 AND canonical_id = $2 AND vendor_name = $3
    `,
    [canonicalType, canonicalId, vendorName],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return serializeMapping(result.rows[0]);
}

// ── Public API: Outbox ──

/**
 * Enqueues an event in the vendor outbox. The idempotency key prevents
 * duplicate delivery — if the same key already exists, the existing entry is
 * returned without creating a new one.
 *
 * Delivery path: the periodic `vendor_sync` drain (registered in
 * index.ts / workers/index.ts → queues.ts `vendor_sync` job →
 * vendorSyncHandler) claims pending rows and delivers them. A producer
 * that wants low-latency delivery should also call `enqueueVendorSyncJob`
 * (lib/queues.ts) after this returns; this adapter deliberately does not
 * import the queue layer so routes/webhooks can use it without spinning up
 * BullMQ connections.
 */
export async function enqueueVendorEvent(
  db: Pool,
  input: {
    canonicalType: string;
    canonicalId: string;
    vendorName: string;
    eventType: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  },
): Promise<VendorOutboxEntry> {
  const id = `vout_${crypto.randomUUID()}`;
  const idempotencyKey =
    input.idempotencyKey ??
    `${input.canonicalType}:${input.canonicalId}:${input.eventType}:${crypto.createHash('sha256').update(JSON.stringify(input.payload)).digest('hex').slice(0, 16)}`;

  const result = await db.query<VendorOutboxRow>(
    `
      INSERT INTO support_vendor_outbox
        (id, canonical_type, canonical_id, vendor_name, event_type, payload, idempotency_key, state)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'pending')
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id, canonical_type, canonical_id, vendor_name, event_type, payload,
                idempotency_key, state, attempts, last_error, last_attempt_at,
                delivered_at, created_at, updated_at
    `,
    [id, input.canonicalType, input.canonicalId, input.vendorName, input.eventType, JSON.stringify(input.payload), idempotencyKey],
  );

  if (result.rows.length === 0) {
    // Already enqueued — fetch the existing entry.
    const existing = await db.query<VendorOutboxRow>(
      `
        SELECT id, canonical_type, canonical_id, vendor_name, event_type, payload,
               idempotency_key, state, attempts, last_error, last_attempt_at,
               delivered_at, created_at, updated_at
        FROM support_vendor_outbox
        WHERE idempotency_key = $1
      `,
      [idempotencyKey],
    );
    return serializeOutbox(existing.rows[0]);
  }

  return serializeOutbox(result.rows[0]);
}

/**
 * Vendor names the sync drain knows how to drive. Mirrored by the webhook
 * route's vendorName enum — a vendor only delivers when it also has
 * SUPPORT_VENDOR_<NAME>_API_URL/TOKEN configured (see vendorClient.ts).
 */
export const SUPPORT_VENDOR_NAMES = ['intercom', 'zendesk'] as const;
export type SupportVendorName = (typeof SUPPORT_VENDOR_NAMES)[number];

/**
 * Read-only view of entries awaiting delivery (pending + retryable failed),
 * oldest first. Used for ops inspection; the delivery path uses
 * claimVendorOutboxBatch, which takes the lease atomically.
 */
export async function getPendingOutboxEntries(
  db: Pool,
  vendorName: string,
  limit = 50,
): Promise<VendorOutboxEntry[]> {
  const result = await db.query<VendorOutboxRow>(
    `
      SELECT id, canonical_type, canonical_id, vendor_name, event_type, payload,
             idempotency_key, state, attempts, last_error, last_attempt_at,
             delivered_at, created_at, updated_at
      FROM support_vendor_outbox
      WHERE vendor_name = $1 AND state IN ('pending', 'failed')
      ORDER BY created_at ASC
      LIMIT $2
    `,
    [vendorName, limit],
  );

  return result.rows.map(serializeOutbox);
}

/**
 * Atomically claim up to `limit` deliverable outbox entries for a vendor.
 *
 * Two statements, each safe on its own:
 *
 *   1. Lease reclaim — a worker that crashed between claim and
 *      delivered/failed leaves the row in 'delivering' forever. Rows whose
 *      `last_attempt_at` is older than `staleLeaseMs` return to 'pending'
 *      (same semantics as domain_outbox's locked_at reclaim), or dead-letter
 *      to 'skipped' once they have exhausted `maxAttempts`. Each reclaim
 *      counts as an attempt — a crash-looping entry is still bounded.
 *
 *   2. Claim — a single UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED)
 *      moves claimable rows to 'delivering' and stamps `last_attempt_at`
 *      (the lease), so two concurrent drainers can never take the same
 *      entry. The claim is atomic within the statement — no surrounding
 *      transaction is needed.
 */
export async function claimVendorOutboxBatch(
  db: Pool,
  vendorName: string,
  limit = 50,
  options?: { staleLeaseMs?: number; maxAttempts?: number },
): Promise<VendorOutboxEntry[]> {
  const staleLeaseMs = Math.max(1_000, options?.staleLeaseMs ?? 10 * 60 * 1000);
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 5);
  const batchSize = Math.max(1, Math.min(200, limit));

  // 1. Reclaim expired delivery leases for this vendor. A reclaimed lease
  //    consumes an attempt — otherwise an entry that crashes every worker
  //    that touches it would loop pending↔delivering forever.
  await db.query(
    `
      UPDATE support_vendor_outbox
      SET state = CASE WHEN attempts + 1 >= $3 THEN 'skipped' ELSE 'pending' END,
          attempts = attempts + 1,
          last_error = CASE
            WHEN attempts + 1 >= $3
              THEN 'delivery lease expired; attempt ceiling reached'
            ELSE last_error
          END,
          updated_at = NOW()
      WHERE vendor_name = $1
        AND state = 'delivering'
        -- Lease clock: last_attempt_at normally, updated_at as the
        -- fallback for rows that entered 'delivering' before the lease
        -- stamp existed.
        AND COALESCE(last_attempt_at, updated_at) < NOW() - ($2 * INTERVAL '1 millisecond')
    `,
    [vendorName, staleLeaseMs, maxAttempts],
  );

  // 2. Claim deliverable rows under FOR UPDATE SKIP LOCKED. attempts is
  //    NOT incremented here — it counts completed-failure outcomes and
  //    reclaimed leases, so `attempts >= maxAttempts` in the handler means
  //    "this many real attempts already happened".
  const result = await db.query<VendorOutboxRow>(
    `
      WITH claimable AS (
        SELECT id
        FROM support_vendor_outbox
        WHERE vendor_name = $1 AND state IN ('pending', 'failed')
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE support_vendor_outbox o
      SET state = 'delivering',
          last_attempt_at = NOW(),
          updated_at = NOW()
      FROM claimable
      WHERE o.id = claimable.id
      RETURNING o.id, o.canonical_type, o.canonical_id, o.vendor_name,
                o.event_type, o.payload, o.idempotency_key, o.state,
                o.attempts, o.last_error, o.last_attempt_at, o.delivered_at,
                o.created_at, o.updated_at
    `,
    [vendorName, batchSize],
  );

  return result.rows.map(serializeOutbox);
}

/**
 * Marks an outbox entry as delivering (in-progress). Retained for manual
 * re-drive tooling — the drain path takes the lease atomically inside
 * claimVendorOutboxBatch instead (SELECT-then-mark is not race-safe).
 */
export async function markOutboxDelivering(
  db: Pool,
  outboxId: string,
): Promise<void> {
  await db.query(
    `
      UPDATE support_vendor_outbox
      SET state = 'delivering', last_attempt_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [outboxId],
  );
}

/**
 * Marks an outbox entry as successfully delivered.
 */
export async function markOutboxDelivered(
  db: Pool,
  outboxId: string,
): Promise<void> {
  await db.query(
    `
      UPDATE support_vendor_outbox
      SET state = 'delivered', delivered_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [outboxId],
  );
}

/**
 * Marks an outbox entry as failed and records the error, consuming one
 * delivery attempt. The entry remains eligible for retry (it will be
 * re-claimed by claimVendorOutboxBatch until attempts hits the ceiling).
 */
export async function markOutboxFailed(
  db: Pool,
  outboxId: string,
  error: string,
): Promise<void> {
  await db.query(
    `
      UPDATE support_vendor_outbox
      SET state = 'failed', last_error = $2, attempts = attempts + 1, updated_at = NOW()
      WHERE id = $1
    `,
    [outboxId, error],
  );
}

/**
 * Dead-letters an outbox entry after a permanent (non-retryable) failure —
 * e.g. the vendor rejected the payload with a 4xx. The entry is removed
 * from the retry pool but keeps last_error for manual review (F16).
 * `attempts` is not incremented — the row is out of the retry pool, so the
 * counter no longer matters.
 */
export async function markOutboxSkipped(
  db: Pool,
  outboxId: string,
  reason: string,
): Promise<void> {
  await db.query(
    `
      UPDATE support_vendor_outbox
      SET state = 'skipped', last_error = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [outboxId, reason],
  );
}

// ── Public API: Inbox ──

/**
 * Records an incoming vendor webhook event. Idempotent by vendor_name +
 * vendor_event_id — duplicate webhook deliveries do not create duplicates.
 * Returns true if the event was newly inserted, false if it was a duplicate.
 */
export async function recordVendorWebhook(
  db: Pool,
  input: {
    vendorName: string;
    vendorEventId: string;
    eventType: string;
    vendorConversationId?: string;
    vendorTicketId?: string;
    payload: Record<string, unknown>;
    signatureValid?: boolean;
  },
): Promise<{ inserted: boolean; inboxId: string | null }> {
  const id = `vinb_${crypto.randomUUID()}`;

  const result = await db.query<{ id: string }>(
    `
      INSERT INTO support_vendor_inbox
        (id, vendor_name, vendor_event_id, event_type, vendor_conversation_id,
         vendor_ticket_id, payload, signature_valid)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      ON CONFLICT (vendor_name, vendor_event_id) DO NOTHING
      RETURNING id
    `,
    [
      id,
      input.vendorName,
      input.vendorEventId,
      input.eventType,
      input.vendorConversationId ?? null,
      input.vendorTicketId ?? null,
      JSON.stringify(input.payload),
      input.signatureValid ?? true,
    ],
  );

  if (result.rows.length === 0) {
    return { inserted: false, inboxId: null };
  }

  return { inserted: true, inboxId: result.rows[0].id };
}

/**
 * Returns unprocessed inbox events, oldest first.
 */
export async function getUnprocessedInboxEvents(
  db: Pool,
  vendorName: string,
  limit = 50,
): Promise<VendorInboxRow[]> {
  const result = await db.query<VendorInboxRow>(
    `
      SELECT id, vendor_name, vendor_event_id, event_type, vendor_conversation_id,
             vendor_ticket_id, payload, signature_valid, processed_at,
             processing_error, created_at
      FROM support_vendor_inbox
      WHERE vendor_name = $1 AND processed_at IS NULL AND signature_valid = TRUE
      ORDER BY created_at ASC
      LIMIT $2
    `,
    [vendorName, limit],
  );

  return result.rows;
}

/**
 * Marks an inbox event as processed.
 */
export async function markInboxProcessed(
  db: Pool,
  inboxId: string,
): Promise<void> {
  await db.query(
    `
      UPDATE support_vendor_inbox
      SET processed_at = NOW()
      WHERE id = $1
    `,
    [inboxId],
  );
}

/**
 * Marks an inbox event as failed during processing.
 */
export async function markInboxProcessingError(
  db: Pool,
  inboxId: string,
  error: string,
): Promise<void> {
  await db.query(
    `
      UPDATE support_vendor_inbox
      SET processing_error = $2
      WHERE id = $1
    `,
    [inboxId, error],
  );
}

// ── Webhook signature verification ──

/**
 * Verifies a webhook signature using HMAC-SHA256. The signature header format
 * varies by vendor; this implements a generic constant-time comparison.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (signature.startsWith('sha256=')) {
    return crypto.timingSafeEqual(
      Buffer.from(signature.slice(7)),
      Buffer.from(expected),
    );
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export { logger };
