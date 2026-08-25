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
 * Returns pending outbox entries for delivery, oldest first. Limits to a
 * reasonable batch size to avoid overwhelming the vendor API.
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
 * Marks an outbox entry as delivering (in-progress).
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
 * Marks an outbox entry as failed and records the error. The entry remains
 * eligible for retry (it will be returned by getPendingOutboxEntries).
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
