import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

type DbQueryable = {
  query: PoolClient['query'];
};

export interface DomainOutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  payload: Record<string, unknown>;
  actorId: string | null;
  correlationId: string | null;
  causationId: string | null;
  idempotencyKey: string | null;
  attempts: number;
}

type DomainOutboxRow = {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_version: number;
  payload: Record<string, unknown>;
  actor_id: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  idempotency_key: string | null;
  attempts: number;
};

function mapEvent(row: DomainOutboxRow): DomainOutboxEvent {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    eventVersion: row.event_version,
    payload: row.payload,
    actorId: row.actor_id,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    idempotencyKey: row.idempotency_key,
    attempts: row.attempts,
  };
}

export async function appendDomainEvent(
  db: DbQueryable,
  input: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    actorId?: string | null;
    correlationId?: string | null;
    causationId?: string | null;
    idempotencyKey?: string | null;
    deduplicationKey: string;
    eventVersion?: number;
  },
): Promise<string> {
  const id = `evt_${crypto.randomUUID()}`;
  const result = await db.query<{ id: string }>(
    `INSERT INTO domain_outbox (
       id, aggregate_type, aggregate_id, event_type, event_version,
       payload, actor_id, correlation_id, causation_id, idempotency_key,
       deduplication_key
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
     ON CONFLICT (deduplication_key)
     DO UPDATE SET updated_at = domain_outbox.updated_at
     RETURNING id`,
    [
      id,
      input.aggregateType,
      input.aggregateId,
      input.eventType,
      input.eventVersion ?? 1,
      JSON.stringify(input.payload),
      input.actorId ?? null,
      input.correlationId ?? null,
      input.causationId ?? null,
      input.idempotencyKey ?? null,
      input.deduplicationKey,
    ],
  );
  return result.rows[0].id;
}

export async function claimDomainOutboxBatch(
  db: Pool,
  limit = 50,
): Promise<DomainOutboxEvent[]> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<DomainOutboxRow>(
      `WITH claimable AS (
         SELECT id
         FROM domain_outbox
         WHERE status = 'pending'
           AND available_at <= NOW()
         ORDER BY available_at ASC, created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE domain_outbox events
       SET status = 'processing',
           attempts = attempts + 1,
           locked_at = NOW(),
           updated_at = NOW()
       FROM claimable
       WHERE events.id = claimable.id
       RETURNING
         events.id, events.aggregate_type, events.aggregate_id,
         events.event_type, events.event_version, events.payload,
         events.actor_id, events.correlation_id, events.causation_id,
         events.idempotency_key, events.attempts`,
      [Math.max(1, Math.min(200, limit))],
    );
    await client.query('COMMIT');
    return result.rows.map(mapEvent);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function completeDomainOutboxEvent(
  db: DbQueryable,
  eventId: string,
): Promise<void> {
  await db.query(
    `UPDATE domain_outbox
     SET status = 'completed',
         processed_at = NOW(),
         locked_at = NULL,
         last_error = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [eventId],
  );
}

export async function failDomainOutboxEvent(
  db: DbQueryable,
  eventId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.query(
    `UPDATE domain_outbox
     SET status = CASE WHEN attempts >= 10 THEN 'dead' ELSE 'pending' END,
         available_at = CASE
           WHEN attempts >= 10 THEN available_at
           ELSE NOW() + (
             LEAST(900, CAST(POWER(2, GREATEST(0, attempts - 1)) AS INTEGER))
             * INTERVAL '1 second'
           )
         END,
         locked_at = NULL,
         last_error = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [eventId, message.slice(0, 2_000)],
  );
}

