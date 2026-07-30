import type { PoolClient } from 'pg';

export type CommercePaymentFailureStatus = 'failed' | 'cancelled';

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
