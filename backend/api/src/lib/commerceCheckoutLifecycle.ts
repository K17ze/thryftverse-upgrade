import type { PoolClient } from 'pg';

export type CommercePaymentFailureStatus = 'failed' | 'cancelled';

// ─── In-flight payment guard for expiry-driven order cancels ────────────
//
// Every order-cancel-on-expiry path (the periodic reservation sweep, the
// lazy reclaims inside checkout routes, and the offer sweep) must skip an
// order whose payment_intent is still in flight: the provider may yet
// report `succeeded`, and a captured payment against a cancelled order is
// a money-loss break — the paid-order UPDATE in settlePaymentIntent matches
// nothing and the listing can be re-sold to a second buyer.
//
// `provider_submission_pending` and `processing` shield unconditionally:
// the stale-submission reconciler owns the former, and the provider owns
// the latter (e.g. a bank-debit PI can sit in `processing` for days while
// the funds are already moving).
//
// `requires_confirmation` / `requires_payment_method` are parked states the
// buyer may still act on — they only shield the order while recently
// updated, matching the 2-hour bound the offer sweep already used. A buyer
// who abandons the payment sheet past that window releases the listing.

/** Statuses owned by the provider/reconciler — shield unconditionally.
 *  `unknown` (lost provider response, added by migration 131) is included:
 *  the reconciler can still resolve it to `succeeded`, so cancelling the
 *  order under it is the same orphan-capture defect. */
export const IN_FLIGHT_PROVIDER_INTENT_STATUSES = [
  'provider_submission_pending',
  'processing',
  'unknown',
] as const;

/** Buyer-actionable parked statuses — shield only while recently updated. */
export const PARKED_INTENT_STATUSES = [
  'requires_confirmation',
  'requires_payment_method',
] as const;

/** Recency window for parked intents — mirrors the offer-sweep bound. */
export const PARKED_INTENT_RECENCY_SQL = `INTERVAL '2 hours'`;

const IN_FLIGHT_INTENT_STATUS_PREDICATE = `(
          pi.status IN ('provider_submission_pending', 'processing', 'unknown')
          OR (
            pi.status IN ('requires_confirmation', 'requires_payment_method')
            AND pi.updated_at > NOW() - ${PARKED_INTENT_RECENCY_SQL}
          )
        )`;

/**
 * SQL predicate that is TRUE only when the given orders relation has no
 * live in-flight payment intent. `orderAlias` must resolve to an orders
 * row with `id` and `payment_intent_id` visible (both link directions are
 * covered: `payment_intents.order_id` is set at intent creation and
 * `orders.payment_intent_id` is bound in the same transaction).
 *
 * Intended for UPDATE ... WHERE clauses — under READ COMMITTED the
 * predicate is re-evaluated against the locked row, so an intent committed
 * by a concurrent Phase-1 bind still blocks the cancel.
 */
export function noInFlightPaymentGuardSql(orderAlias = 'orders'): string {
  return `NOT EXISTS (
        SELECT 1
        FROM payment_intents pi
        WHERE (pi.order_id = ${orderAlias}.id OR pi.id = ${orderAlias}.payment_intent_id)
          AND ${IN_FLIGHT_INTENT_STATUS_PREDICATE}
      )`;
}

export type ReleaseParkedIntentOutcome =
  /** The order had a parked intent; it is now cancelled + unbound. */
  | 'released'
  /** A provider-owned in-flight intent shields the order — do NOT proceed. */
  | 'blocked_in_flight'
  /** The bound intent is already terminal/succeeded — nothing to release. */
  | 'terminal'
  /** No intent is bound to the order. */
  | 'none';

export type ReleasedIntentRef = {
  id: string;
  provider_intent_ref: string | null;
  gateway_id: string;
};

export type ReleaseParkedIntentResult = {
  outcome: ReleaseParkedIntentOutcome;
  /** Parked intents cancelled internally — the caller should best-effort
   *  cancel them provider-side AFTER commit (provider I/O never runs
   *  inside a row-lock transaction in this codebase). A parked-but-open
   *  provider intent can still be confirmed by a replayed client call —
   *  provider cancel is what makes the release real. */
  releasedIntents: ReleasedIntentRef[];
};

/**
 * Release a *parked* payment intent when the buyer explicitly abandons the
 * flow — cancelling the order or re-binding checkout selections.
 *
 * Distinct from `hasInFlightPaymentIntent`'s recency shield: that 2-hour
 * window exists for *background sweepers* (a recently-touched parked intent
 * may still be mid-confirm from the buyer's perspective). An explicit
 * buyer action means the payment sheet was dismissed — nothing can confirm
 * the intent without them — so ANY parked status releases, regardless of
 * recency. Provider-owned statuses (processing / submission pending /
 * unknown) and `succeeded` still block: money may already be moving and
 * cancelling under it is the orphan-capture defect this file exists to
 * prevent.
 *
 * The internal status is set to 'cancelled' and `orders.payment_intent_id`
 * cleared inside the caller's transaction. If a stray provider capture
 * lands afterwards, `flagOrphanedCommercePayment` records the break — the
 * order is already terminal so settle cannot mark it paid.
 */
export async function releaseParkedPaymentIntent(
  client: Pick<PoolClient, 'query'>,
  orderId: string,
): Promise<ReleaseParkedIntentResult> {
  const intents = await client.query<{
    id: string;
    status: string;
    provider_intent_ref: string | null;
    gateway_id: string;
  }>(
    `SELECT pi.id, pi.status, pi.provider_intent_ref, pi.gateway_id
     FROM payment_intents pi
     LEFT JOIN orders o ON o.id = $1
     WHERE pi.order_id = $1 OR pi.id = o.payment_intent_id
     ORDER BY pi.updated_at DESC`,
    [orderId],
  );

  // Gate first, mutate second: a provider-owned intent anywhere in the
  // bound set blocks the release entirely — we never want a caller that
  // proceeds anyway to inherit a half-cancelled intent set.
  for (const intent of intents.rows) {
    if (
      intent.status === 'provider_submission_pending'
      || intent.status === 'processing'
      || intent.status === 'unknown'
      || intent.status === 'succeeded'
    ) {
      return {
        outcome: intent.status === 'succeeded' ? 'terminal' : 'blocked_in_flight',
        releasedIntents: [],
      };
    }
  }

  const releasedIntents: ReleasedIntentRef[] = [];
  for (const intent of intents.rows) {
    if (
      intent.status === 'requires_confirmation'
      || intent.status === 'requires_payment_method'
    ) {
      // Re-check the status in the UPDATE predicate: a provider webhook can
      // flip a parked intent to 'processing'/'succeeded' between our SELECT
      // and this statement — without it we'd mark a moving charge cancelled.
      const cancelled = await client.query<{ id: string }>(
        `UPDATE payment_intents
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1
           AND status IN ('requires_confirmation', 'requires_payment_method')
         RETURNING id`,
        [intent.id],
      );
      if (cancelled.rowCount) {
        releasedIntents.push({
          id: intent.id,
          provider_intent_ref: intent.provider_intent_ref,
          gateway_id: intent.gateway_id,
        });
      }
    }
    // 'failed' / 'cancelled' intents need no release — they never bind.
  }

  // If a concurrent webhook moved every parked intent forward mid-release,
  // the bound intent may now be provider-owned — re-check before unbinding.
  if (await hasInFlightPaymentIntent(client, orderId)) {
    return { outcome: 'blocked_in_flight', releasedIntents };
  }

  if (releasedIntents.length > 0) {
    await client.query(
      `UPDATE orders SET payment_intent_id = NULL, updated_at = NOW() WHERE id = $1`,
      [orderId],
    );
    return { outcome: 'released', releasedIntents };
  }
  return { outcome: intents.rowCount ? 'terminal' : 'none', releasedIntents };
}

export type ReservationExpiryCancelOutcome =
  /** The order was 'created' with no in-flight intent and is now cancelled. */
  | 'cancelled'
  /** A live in-flight payment intent shields the order — do NOT cancel. */
  | 'blocked_in_flight'
  /** The order was already terminal (or missing) — nothing to cancel. */
  | 'already_terminal';

/**
 * Does the order have a live in-flight payment intent? Same predicate the
 * guarded cancel uses — shared so read-only gates (e.g. the
 * idempotent-replay payability check in POST /payments/intents) treat a
 * lapsed reservation TTL consistently instead of failing an intent the
 * provider may still settle.
 */
export async function hasInFlightPaymentIntent(
  client: Pick<PoolClient, 'query'>,
  orderId: string,
): Promise<boolean> {
  const result = await client.query<{ id: string }>(
    `SELECT pi.id
     FROM payment_intents pi
     LEFT JOIN orders o ON o.id = $1
     WHERE (pi.order_id = $1 OR pi.id = o.payment_intent_id)
       AND ${IN_FLIGHT_INTENT_STATUS_PREDICATE}
     LIMIT 1`,
    [orderId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Cancel a 'created' order whose checkout reservation expired, unless a
 * payment attempt is still in flight. All expiry-driven cancels must go
 * through this guard — a bare `UPDATE orders SET status='cancelled'` is
 * how captured money gets orphaned against a cancelled order.
 *
 * Ordering matters under READ COMMITTED: we take the order row lock FIRST,
 * then run the in-flight check as a fresh statement. A payment-intent
 * creation transaction binds `orders.payment_intent_id` under this same
 * row lock, so it either (a) committed before our lock — its intent is
 * visible to the post-lock check — or (b) waits for our commit and then
 * observes 'cancelled' at its own status gate. A single
 * `UPDATE ... WHERE NOT EXISTS(...)` cannot provide this: its subquery is
 * evaluated against the statement-start snapshot and EvalPlanQual does not
 * refresh it when the lock wait ends, so an intent committed mid-wait
 * would be invisible. The guarded UPDATE below remains as belt-and-braces.
 */
export async function cancelOrderOnReservationExpiry(
  client: Pick<PoolClient, 'query'>,
  orderId: string,
): Promise<ReservationExpiryCancelOutcome> {
  const locked = await client.query<{ id: string; status: string }>(
    `SELECT id, status FROM orders WHERE id = $1 LIMIT 1 FOR UPDATE`,
    [orderId],
  );
  if (!locked.rowCount || locked.rows[0].status !== 'created') {
    return 'already_terminal';
  }

  if (await hasInFlightPaymentIntent(client, orderId)) {
    return 'blocked_in_flight';
  }

  const cancelled = await client.query<{ id: string }>(
    `UPDATE orders
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1
       AND status = 'created'
       AND ${noInFlightPaymentGuardSql('orders')}
     RETURNING id`,
    [orderId],
  );
  return cancelled.rowCount ? 'cancelled' : 'already_terminal';
}

/**
 * Flag a captured commerce payment whose bound order is no longer payable.
 * Called from settlePaymentIntent when the paid-order UPDATE matched no row
 * — the intent is 'succeeded' (money captured) but the order is cancelled /
 * missing / otherwise not 'created'.
 *
 * Writes two durable artefacts inside the caller's transaction:
 *  1. an `order_events` row (`order.payment_orphaned`, deduped per intent)
 *     so the anomaly is on the order's own timeline;
 *  2. a `reconciliation_breaks` row (`status_mismatch`, critical, open) when
 *     the three-way reconciliation store exists — ops work breaks to
 *     resolution from that queue.
 *
 * Returns whether this call created the flag (false = already flagged by
 * an earlier settle attempt).
 */
export async function flagOrphanedCommercePayment(
  client: Pick<PoolClient, 'query'>,
  input: {
    orderId: string;
    intentId: string;
    gatewayId: string;
    actorUserId: string;
    orderStatus: string;
    amountGbp: number;
    currency: string;
  },
): Promise<{ flagged: boolean }> {
  const event = await client.query<{ id: number }>(
    `INSERT INTO order_events (
       order_id, event_type, actor_id, source, deduplication_key, metadata
     )
     VALUES ($1, 'order.payment_orphaned', $2, 'payment_settlement', $3, $4::jsonb)
     ON CONFLICT (order_id, deduplication_key)
       WHERE deduplication_key IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [
      input.orderId,
      input.actorUserId,
      `order.payment_orphaned:${input.intentId}`,
      JSON.stringify({
        intentId: input.intentId,
        gatewayId: input.gatewayId,
        orderStatus: input.orderStatus,
        amountGbp: input.amountGbp,
        reason: 'captured_payment_order_not_payable',
      }),
    ],
  );
  const flagged = (event.rowCount ?? 0) > 0;

  const breaksTable = await client.query<{ exists: boolean }>(
    `SELECT to_regclass('public.reconciliation_breaks') IS NOT NULL AS exists`,
  );
  if (breaksTable.rows[0]?.exists) {
    const amountMinor = Math.round(input.amountGbp * 100);
    await client.query(
      `INSERT INTO reconciliation_breaks (
         run_id, break_type, provider, provider_object_id,
         internal_entity_type, internal_entity_id, currency,
         provider_amount_minor, internal_amount_minor, difference_minor,
         severity, status, evidence, due_at
       )
       SELECT $1, 'status_mismatch', $2, $3, 'order', $4, $5, $6, 0, $6,
              'critical', 'open', $7::jsonb, NOW() + INTERVAL '24 hours'
       WHERE NOT EXISTS (
         SELECT 1 FROM reconciliation_breaks
         WHERE internal_entity_type = 'order'
           AND internal_entity_id = $4
           AND provider_object_id = $3
           AND status IN ('open', 'investigating')
       )`,
      [
        `settlement_orphan_${input.intentId}`,
        input.gatewayId,
        input.intentId,
        input.orderId,
        input.currency,
        amountMinor,
        JSON.stringify({
          intentId: input.intentId,
          orderId: input.orderId,
          orderStatus: input.orderStatus,
          amountGbp: input.amountGbp,
          reason: 'captured_payment_order_not_payable',
        }),
      ],
    );
  }

  return { flagged };
}

export async function compensateTerminalCommercePayment(
  client: Pick<PoolClient, 'query'>,
  input: {
    orderId: string;
    intentId: string;
    actorUserId: string;
    status: CommercePaymentFailureStatus;
    failureCode?: string | null;
  },
): Promise<{ orderCancelled: boolean }> {
  const cancelledOrder = await client.query<{ id: string }>(
    `UPDATE orders
     SET status = 'cancelled',
         payment_failed_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE payment_failed_at END,
         updated_at = NOW()
     WHERE id = $1 AND status = 'created'
     RETURNING id`,
    [input.orderId, input.status],
  );

  if (!cancelledOrder.rowCount) {
    return { orderCancelled: false };
  }

  await client.query(
    `INSERT INTO order_events (
       order_id, event_type, actor_id, source, deduplication_key, metadata
     )
     VALUES ($1, $2, $3, 'payment_settlement', $4, $5::jsonb)
     ON CONFLICT (order_id, deduplication_key)
       WHERE deduplication_key IS NOT NULL
     DO NOTHING`,
    [
      input.orderId,
      input.status === 'failed' ? 'payment.failed' : 'payment.cancelled',
      input.actorUserId,
      `payment.${input.status}:${input.intentId}`,
      JSON.stringify({
        intentId: input.intentId,
        failureCode: input.failureCode ?? null,
      }),
    ],
  );

  return { orderCancelled: true };
}
