/**
 * Order lifecycle → in-thread commerce card emitter.
 *
 * Exercises `emitOrderCommerceCard` directly with a fake `DbQueryable` and a
 * captured publish function — the same seams the production callers rely on
 * (post-commit, never-inside-the-transaction):
 *
 *   - a real transition inserts one `sender_type = 'system'` row carrying
 *     `metadata.commerceState` and publishes `chat.message.created` on
 *     `chat.conversation:{id}`;
 *   - a retry/replay hits the deterministic message id and produces no
 *     second row and no realtime event;
 *   - a stale caller whose claimed state contradicts the persisted order
 *     status is silently skipped (truthfulness guard);
 *   - an order with no resolvable buyer–seller conversation emits nothing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';
import { emitOrderCommerceCard } from './orderChatCards.js';
import type { publishRealtimeEvent } from './realtime.js';
import type { DbQueryable } from './workerHelpers.js';

const ORDER_ID = 'ord_test_1';
const CONVERSATION_ID = 'conv_test_1';

const ORDER_ROW: {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  status: string;
  tracking_number: string | null;
  shipping_provider: string | null;
  shipping_label_url: string | null;
  item_title: string | null;
  item_image: string | null;
} = {
  id: ORDER_ID,
  buyer_id: 'buyer-1',
  seller_id: 'seller-1',
  listing_id: 'lst_1',
  status: 'paid',
  tracking_number: null,
  shipping_provider: null,
  shipping_label_url: null,
  item_title: 'Vintage Denim Jacket',
  item_image: 'https://img.test/jacket.jpg',
};

type FakeDbOptions = {
  order?: typeof ORDER_ROW | null;
  conversationId?: string | null;
  /** Simulate ON CONFLICT (id) DO NOTHING matching an existing row. */
  insertRowCount?: number;
  /** Status of the order_dispatch_extensions row re-verified by the
   *  `extension_requested` truthfulness check; null = row missing. */
  extensionStatus?: string | null;
};

function fakeDb(options: FakeDbOptions = {}) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const order = options.order === undefined ? ORDER_ROW : options.order;
  const conversationId =
    options.conversationId === undefined ? CONVERSATION_ID : options.conversationId;
  const insertRowCount = options.insertRowCount ?? 1;
  const extensionStatus = options.extensionStatus === undefined ? 'pending' : options.extensionStatus;
  const query = async <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> => {
    calls.push({ text, params });
    if (/FROM order_dispatch_extensions/.test(text)) {
      return {
        rows: (extensionStatus ? [{ status: extensionStatus }] : []) as unknown as T[],
        rowCount: extensionStatus ? 1 : 0,
      } as QueryResult<T>;
    }
    if (/FROM orders o/.test(text)) {
      return {
        rows: (order ? [order] : []) as unknown as T[],
        rowCount: order ? 1 : 0,
      } as QueryResult<T>;
    }
    if (/FROM listing_offers/.test(text)) {
      return {
        rows: (conversationId ? [{ id: conversationId }] : []) as unknown as T[],
        rowCount: conversationId ? 1 : 0,
      } as QueryResult<T>;
    }
    if (/FROM chat_conversations c/.test(text)) {
      return { rows: [] as T[], rowCount: 0 } as QueryResult<T>;
    }
    if (/INSERT INTO chat_messages/.test(text)) {
      return {
        rows: (insertRowCount
          ? [{ id: String(params?.[0]), created_at: '2026-02-01T00:00:00.000Z' }]
          : []) as unknown as T[],
        rowCount: insertRowCount,
      } as QueryResult<T>;
    }
    return { rows: [] as T[], rowCount: 0 } as QueryResult<T>;
  };
  return { calls, query: query as DbQueryable['query'] } as { calls: typeof calls } & DbQueryable;
}

function fakePublish() {
  const events: Array<{ topic: string; type: string; payload: Record<string, unknown> }> = [];
  const publish: typeof publishRealtimeEvent = async (event) => {
    events.push(event);
    return 0;
  };
  return { events, publish };
}

const silentLog = { error: () => {}, warn: () => {} };

test('real transition inserts a system commerce_state row and publishes chat.message.created', async () => {
  const db = fakeDb();
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'payment_confirmed',
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, true);
  assert.equal(result.conversationId, CONVERSATION_ID);
  assert.equal(result.messageId, `chatmsg_order_${ORDER_ID}_payment_confirmed`);

  const insert = db.calls.find((c) => /INSERT INTO chat_messages/.test(c.text));
  assert.ok(insert, 'expected a chat_messages insert');
  // sender_type 'system', deterministic id, commerceState metadata.
  assert.match(insert.text, /'system'/);
  assert.equal(insert.params?.[0], `chatmsg_order_${ORDER_ID}_payment_confirmed`);
  const metadata = JSON.parse(String(insert.params?.[5])) as Record<string, unknown>;
  assert.equal(metadata.commerceCard, true);
  const commerceState = metadata.commerceState as Record<string, unknown>;
  assert.equal(commerceState.stateType, 'payment_confirmed');
  assert.equal(commerceState.orderId, ORDER_ID);
  assert.equal(commerceState.itemTitle, 'Vintage Denim Jacket');
  assert.equal(commerceState.itemImage, 'https://img.test/jacket.jpg');

  assert.equal(events.length, 1);
  assert.equal(events[0].topic, `chat.conversation:${CONVERSATION_ID}`);
  assert.equal(events[0].type, 'chat.message.created');
  const payload = events[0].payload as {
    senderType: string;
    metadata: { commerceState: { stateType: string; orderId: string } };
  };
  assert.equal(payload.senderType, 'system');
  assert.equal(payload.metadata.commerceState.stateType, 'payment_confirmed');
  assert.equal(payload.metadata.commerceState.orderId, ORDER_ID);
});

test('retry hits the deterministic id and emits no second row or event', async () => {
  const db = fakeDb({ insertRowCount: 0 });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'payment_confirmed',
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, false);
  assert.equal(result.skippedReason, 'duplicate');
  assert.equal(events.length, 0);
});

test('claimed state that contradicts the persisted order status is skipped', async () => {
  const db = fakeDb({ order: { ...ORDER_ROW, status: 'created' } });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'order_delivered',
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, false);
  assert.equal(result.skippedReason, 'status_mismatch');
  assert.ok(
    !db.calls.some((c) => /INSERT INTO chat_messages/.test(c.text)),
    'no chat row may be written for a mismatched transition',
  );
  assert.equal(events.length, 0);
});

test('order without a resolvable buyer–seller conversation emits nothing', async () => {
  const db = fakeDb({ conversationId: null });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'payment_confirmed',
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, false);
  assert.equal(result.skippedReason, 'no_conversation');
  assert.equal(events.length, 0);
});

test('missing order emits nothing', async () => {
  const db = fakeDb({ order: null });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: 'ord_missing',
    stateType: 'order_placed',
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, false);
  assert.equal(result.skippedReason, 'order_not_found');
  assert.equal(events.length, 0);
});

test('ship override supplies fresher tracking than the stored row', async () => {
  const db = fakeDb({ order: { ...ORDER_ROW, status: 'shipped' } });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'order_shipped',
    trackingNumber: 'TV-123',
    carrier: 'evri',
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, true);
  const metadata = (events[0].payload as { metadata: Record<string, unknown> })
    .metadata;
  const commerceState = metadata.commerceState as Record<string, unknown>;
  assert.equal(commerceState.trackingNumber, 'TV-123');
  assert.equal(commerceState.carrier, 'evri');
});

test('label_created emits when a provisioned label/tracking artifact is persisted', async () => {
  const db = fakeDb({
    order: {
      ...ORDER_ROW,
      status: 'paid',
      tracking_number: 'EVRI-9x2',
      shipping_provider: 'evri',
      shipping_label_url: 'https://labels.test/EVRI-9x2.pdf',
    },
  });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'label_created',
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, true);
  assert.equal(result.messageId, `chatmsg_order_${ORDER_ID}_label_created`);
  const commerceState = (events[0].payload as {
    metadata: { commerceState: Record<string, unknown> };
  }).metadata.commerceState;
  assert.equal(commerceState.stateType, 'label_created');
  assert.equal(commerceState.trackingNumber, 'EVRI-9x2');
  assert.equal(commerceState.carrier, 'evri');
});

test('label_created is skipped when the order has no shipping artifact', async () => {
  // Paid order, no provisioning ran — announcing a label would be a lie.
  const db = fakeDb({ order: { ...ORDER_ROW, status: 'paid' } });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'label_created',
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, false);
  assert.equal(result.skippedReason, 'missing_label');
  assert.ok(
    !db.calls.some((c) => /INSERT INTO chat_messages/.test(c.text)),
    'no chat row may be written without a persisted label artifact',
  );
  assert.equal(events.length, 0);
});

test('delivery_confirm_prompt emits on delivered and is refused once completed', async () => {
  const deliveredDb = fakeDb({ order: { ...ORDER_ROW, status: 'delivered' } });
  const deliveredPublish = fakePublish();

  const delivered = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'delivery_confirm_prompt',
    queryable: deliveredDb,
    publish: deliveredPublish.publish,
    log: silentLog,
  });
  assert.equal(delivered.emitted, true);
  assert.equal(deliveredPublish.events.length, 1);

  // A buyer who already confirmed ('completed') must not be asked again.
  const completedDb = fakeDb({ order: { ...ORDER_ROW, status: 'completed' } });
  const completedPublish = fakePublish();

  const completed = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'delivery_confirm_prompt',
    queryable: completedDb,
    publish: completedPublish.publish,
    log: silentLog,
  });
  assert.equal(completed.emitted, false);
  assert.equal(completed.skippedReason, 'status_mismatch');
  assert.equal(completedPublish.events.length, 0);
});

test('feedback_prompt emits only for the completed terminal state', async () => {
  const db = fakeDb({ order: { ...ORDER_ROW, status: 'completed' } });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'feedback_prompt',
    queryable: db,
    publish,
    log: silentLog,
  });
  assert.equal(result.emitted, true);
  assert.equal(events.length, 1);

  const earlyDb = fakeDb({ order: { ...ORDER_ROW, status: 'delivered' } });
  const earlyPublish = fakePublish();
  const early = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'feedback_prompt',
    queryable: earlyDb,
    publish: earlyPublish.publish,
    log: silentLog,
  });
  assert.equal(early.emitted, false);
  assert.equal(early.skippedReason, 'status_mismatch');
});

test('extension_requested scopes the dedupe id per proposal and carries the terms', async () => {
  const db = fakeDb({ order: { ...ORDER_ROW, status: 'paid' } });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'extension_requested',
    eventKey: 'odx_abc123',
    extensionDays: 3,
    proposedShipBy: '2026-02-10T00:00:00.000Z',
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, true);
  assert.equal(result.messageId, `chatmsg_order_${ORDER_ID}_extension_requested_odx_abc123`);

  const metadata = (events[0].payload as { metadata: Record<string, unknown> }).metadata;
  assert.equal(metadata.commerceEventKey, `order:${ORDER_ID}:extension_requested:odx_abc123`);
  const commerceState = metadata.commerceState as Record<string, unknown>;
  assert.equal(commerceState.stateType, 'extension_requested');
  assert.equal(commerceState.extensionDays, 3);
  assert.equal(commerceState.proposedShipBy, '2026-02-10T00:00:00.000Z');
});

test('extension_requested is skipped when the proposal was resolved in the commit→emit gap', async () => {
  // The emit re-reads the extension row: a buyer response that committed
  // between the proposal COMMIT and this emit must not produce a stale
  // "requested" card — the order stays 'paid' so the status gate passes.
  const db = fakeDb({
    order: { ...ORDER_ROW, status: 'paid' },
    extensionStatus: 'accepted',
  });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'extension_requested',
    eventKey: 'odx_raced',
    extensionDays: 3,
    queryable: db,
    publish,
    log: silentLog,
  });
  assert.equal(result.emitted, false);
  assert.equal(result.skippedReason, 'extension_not_pending');
  assert.ok(
    !db.calls.some((c) => /INSERT INTO chat_messages/.test(c.text)),
    'no chat row may be written for an already-resolved extension',
  );
  assert.equal(events.length, 0);

  // A missing row (never persisted) is also not pending.
  const missingDb = fakeDb({
    order: { ...ORDER_ROW, status: 'paid' },
    extensionStatus: null,
  });
  const missingPublish = fakePublish();
  const missing = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'extension_requested',
    eventKey: 'odx_missing',
    queryable: missingDb,
    publish: missingPublish.publish,
    log: silentLog,
  });
  assert.equal(missing.emitted, false);
  assert.equal(missing.skippedReason, 'extension_not_pending');
  assert.equal(missingPublish.events.length, 0);
});

test('extension_requested is refused once the order has shipped', async () => {
  const db = fakeDb({ order: { ...ORDER_ROW, status: 'shipped' } });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'extension_requested',
    eventKey: 'odx_late',
    queryable: db,
    publish,
    log: silentLog,
  });
  assert.equal(result.emitted, false);
  assert.equal(result.skippedReason, 'status_mismatch');
  assert.equal(events.length, 0);
});

// ── Refund cards (P1-4 / P2-17) ──

test('order_partially_refunded emits on a live order and carries the refunded amount', async () => {
  const db = fakeDb({ order: { ...ORDER_ROW, status: 'paid' } });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'order_partially_refunded',
    refundedAmountGbp: 25,
    eventKey: 'rex_abc123',
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, true);
  // Dedupe is scoped per execution — partial refunds can legitimately recur.
  assert.equal(result.messageId, `chatmsg_order_${ORDER_ID}_order_partially_refunded_rex_abc123`);

  const metadata = (events[0].payload as { metadata: Record<string, unknown> }).metadata;
  const commerceState = metadata.commerceState as Record<string, unknown>;
  assert.equal(commerceState.stateType, 'order_partially_refunded');
  assert.equal(commerceState.refundedAmountGbp, 25);
});

test('distinct partial-refund executions produce distinct card ids; a retry dedupes', async () => {
  const db = fakeDb({ order: { ...ORDER_ROW, status: 'paid' } });
  const { publish } = fakePublish();

  const first = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'order_partially_refunded',
    refundedAmountGbp: 10,
    eventKey: 'rex_1',
    queryable: db,
    publish,
    log: silentLog,
  });
  const second = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'order_partially_refunded',
    refundedAmountGbp: 15,
    eventKey: 'rex_2',
    queryable: db,
    publish,
    log: silentLog,
  });
  const retry = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'order_partially_refunded',
    refundedAmountGbp: 10,
    eventKey: 'rex_1',
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.notEqual(first.messageId, second.messageId);
  assert.equal(retry.messageId, first.messageId);
});

test('order_refunded is refused while the order status is still live', async () => {
  // A partial refund must never flip the persisted status — so an
  // 'order_refunded' claim against a 'paid' row is a lie and is skipped.
  const db = fakeDb({ order: { ...ORDER_ROW, status: 'paid' } });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'order_refunded',
    refundedAmountGbp: 25,
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, false);
  assert.equal(result.skippedReason, 'status_mismatch');
  assert.equal(events.length, 0);
});

test('order_refunded emits on a refunded order with the refunded amount', async () => {
  const db = fakeDb({ order: { ...ORDER_ROW, status: 'refunded' } });
  const { events, publish } = fakePublish();

  const result = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'order_refunded',
    refundedAmountGbp: 56.7,
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, true);
  const metadata = (events[0].payload as { metadata: Record<string, unknown> }).metadata;
  const commerceState = metadata.commerceState as Record<string, unknown>;
  assert.equal(commerceState.stateType, 'order_refunded');
  assert.equal(commerceState.refundedAmountGbp, 56.7);
});

test('the synthetic TV- tracking placeholder is never rendered as real tracking', async () => {
  // The ship endpoint persists TV-{ORDER_ID} when the seller supplies no
  // tracking. It is an internal placeholder, not carrier-issued — the card
  // must carry null (stored fallback and caller-passed fallback alike).
  const synthetic = `TV-${ORDER_ID.toUpperCase()}`;

  const storedDb = fakeDb({
    order: { ...ORDER_ROW, status: 'shipped', tracking_number: synthetic },
  });
  const storedPublish = fakePublish();
  const stored = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'order_shipped',
    queryable: storedDb,
    publish: storedPublish.publish,
    log: silentLog,
  });
  assert.equal(stored.emitted, true);
  const storedState = (storedPublish.events[0].payload as {
    metadata: { commerceState: Record<string, unknown> };
  }).metadata.commerceState;
  assert.equal(storedState.trackingNumber, null);

  const passedDb = fakeDb({ order: { ...ORDER_ROW, status: 'shipped' } });
  const passedPublish = fakePublish();
  const passed = await emitOrderCommerceCard({
    orderId: ORDER_ID,
    stateType: 'order_shipped',
    trackingNumber: synthetic,
    queryable: passedDb,
    publish: passedPublish.publish,
    log: silentLog,
  });
  assert.equal(passed.emitted, true);
  const passedState = (passedPublish.events[0].payload as {
    metadata: { commerceState: Record<string, unknown> };
  }).metadata.commerceState;
  assert.equal(passedState.trackingNumber, null);
});
