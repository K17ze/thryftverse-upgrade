import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateAutoFeedback,
  resolveDispatchShipBy,
  type AutoFeedbackPolicy,
  type Queryable,
} from './autoFeedback.js';

// ── In-memory database double ────────────────────────────────────────────────
// Implements just enough of the SQL surface that evaluateAutoFeedback uses to
// exercise the evaluation semantics: candidate selection (status filters,
// window cutoff, exclusion subqueries), ON CONFLICT DO NOTHING inserts, and
// order_events dedup writes. Time is pinned via `policy.now`.

interface OrderRow {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  paid_at: string | null;
  delivered_at: string | null;
  updated_at: string;
  created_at: string;
}

interface ReviewRow {
  id: string;
  order_id: string;
  reviewer_id: string;
  seller_id: string;
  rating: number;
  is_auto: boolean;
  auto_reason: string | null;
}

interface BreachRow {
  id: string;
  order_id: string;
  seller_id: string;
  breach_type: string;
  ship_by: string;
}

interface FakeDb {
  orders: OrderRow[];
  reviews: ReviewRow[];
  breaches: BreachRow[];
  events: Array<{ order_id: string; event_type: string; deduplication_key: string }>;
  snapshots: Map<string, number>;
  // order_id -> accepted extensions in chronological order. respondedAt is
  // when the buyer accepted — it decides whether the extension legitimately
  // moved the deadline or arrived too late to erase an existing breach.
  extensions: Map<string, Array<{ shipBy: string; respondedAt: string | null }>>;
  openTickets: Set<string>;        // order_id
  openDisputes: Set<string>;       // order_id
  openReturnCases: Set<string>;    // order_id
}

function createFakeDb(seed: Partial<FakeDb> = {}): FakeDb {
  return {
    orders: [],
    reviews: [],
    breaches: [],
    events: [],
    snapshots: new Map(),
    extensions: new Map(),
    openTickets: new Set(),
    openDisputes: new Set(),
    openReturnCases: new Set(),
    ...seed,
  };
}

function asQueryable(fake: FakeDb): Queryable {
  const query = async (text: string, params: unknown[] = []) => {
    // ── Buyer-silence candidate select ──
    if (
      text.includes('FROM orders o')
      && text.includes("'delivered', 'completed'")
      && text.includes('FOR UPDATE OF o SKIP LOCKED')
    ) {
      const cutoff = String(params[0]);
      const rows = fake.orders
        .filter((o) => o.status === 'delivered' || o.status === 'completed')
        .filter((o) => (o.delivered_at ?? o.updated_at) <= cutoff)
        .filter((o) => !fake.reviews.some((r) => r.order_id === o.id))
        .filter((o) => !fake.openTickets.has(o.id))
        .filter((o) => !fake.openReturnCases.has(o.id))
        .filter((o) => !fake.openDisputes.has(o.id))
        .map((o) => ({ id: o.id, buyer_id: o.buyer_id, seller_id: o.seller_id }));
      return { rows, rowCount: rows.length };
    }

    // ── Dispatch-SLA candidate select ──
    if (
      text.includes('FROM orders o')
      && text.includes("o.status = 'paid'")
      && text.includes('order_dispatch_extensions')
    ) {
      const rows = fake.orders
        .filter((o) => o.status === 'paid')
        .filter((o) =>
          !fake.breaches.some(
            (b) => b.order_id === o.id && b.breach_type === String(params[1]),
          ))
        .map((o) => ({
          id: o.id,
          buyer_id: o.buyer_id,
          seller_id: o.seller_id,
          paid_at: o.paid_at,
          created_at: o.created_at,
          dispatch_sla_days: fake.snapshots.get(o.id) ?? null,
          accepted_extensions: fake.extensions.get(o.id) ?? null,
        }));
      return { rows, rowCount: rows.length };
    }

    // ── order_reviews insert (ON CONFLICT (order_id) DO NOTHING) ──
    if (text.includes('INSERT INTO order_reviews')) {
      // Params: [id, order_id, reviewer_id, seller_id, rating, auto_reason]
      const [id, orderId, reviewerId, sellerId, rating, autoReason] = params as [
        string, string, string, string, number, string,
      ];
      if (fake.reviews.some((r) => r.order_id === orderId)) {
        return { rows: [], rowCount: 0 };
      }
      fake.reviews.push({
        id,
        order_id: orderId,
        reviewer_id: reviewerId,
        seller_id: sellerId,
        rating,
        is_auto: true,
        auto_reason: autoReason,
      });
      return { rows: [{ id }], rowCount: 1 };
    }

    // ── order_sla_breaches insert (ON CONFLICT (order_id, breach_type)) ──
    if (text.includes('INSERT INTO order_sla_breaches')) {
      const [id, orderId, sellerId, breachType, shipBy] = params as [
        string, string, string, string, string,
      ];
      if (
        fake.breaches.some(
          (b) => b.order_id === orderId && b.breach_type === breachType,
        )
      ) {
        return { rows: [], rowCount: 0 };
      }
      fake.breaches.push({
        id,
        order_id: orderId,
        seller_id: sellerId,
        breach_type: breachType,
        ship_by: shipBy,
      });
      return { rows: [{ id }], rowCount: 1 };
    }

    // ── order_events insert ──
    if (text.includes('INSERT INTO order_events')) {
      const [orderId, dedupKey] = params as [string, string];
      if (
        fake.events.some(
          (e) => e.order_id === orderId && e.deduplication_key === dedupKey,
        )
      ) {
        return { rows: [], rowCount: 0 };
      }
      const eventType = /'(order\.[a-z_]+)'/.exec(text)?.[1] ?? 'unknown';
      fake.events.push({
        order_id: orderId,
        event_type: eventType,
        deduplication_key: dedupKey,
      });
      return { rows: [{ id: fake.events.length }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  };

  return { query } as unknown as Queryable;
}

const NOW = new Date('2026-03-15T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function policy(overrides: Partial<AutoFeedbackPolicy> = {}): AutoFeedbackPolicy {
  return {
    windowDays: 14,
    autoRating: 5,
    defaultDispatchSlaDays: 3,
    batchSize: 200,
    now: NOW,
    ...overrides,
  };
}

function order(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'ord_1',
    buyer_id: 'buyer_1',
    seller_id: 'seller_1',
    status: 'delivered',
    paid_at: new Date(NOW.getTime() - 20 * DAY).toISOString(),
    delivered_at: null,
    updated_at: new Date(NOW.getTime() - 15 * DAY).toISOString(),
    created_at: new Date(NOW.getTime() - 21 * DAY).toISOString(),
    ...overrides,
  };
}

// ── Buyer silence window ─────────────────────────────────────────────────────

test('buyer silence: delivered order inside the window gets no auto feedback', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({ id: 'ord_recent', delivered_at: new Date(NOW.getTime() - 5 * DAY).toISOString() }),
  );

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.autoReviews.length, 0);
  assert.equal(fake.reviews.length, 0);
  assert.equal(fake.events.length, 0);
});

test('buyer silence: delivered order past the window gets auto-positive feedback', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({ id: 'ord_due', delivered_at: new Date(NOW.getTime() - 15 * DAY).toISOString() }),
  );

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.autoReviews.length, 1);
  assert.equal(result.autoReviews[0].orderId, 'ord_due');
  assert.equal(result.autoReviews[0].rating, 5);
  assert.equal(fake.reviews.length, 1);
  assert.equal(fake.reviews[0].is_auto, true);
  assert.equal(fake.reviews[0].auto_reason, 'buyer_silence');
  assert.deepEqual(fake.events.map((e) => e.event_type), ['order.auto_feedback']);
});

test('buyer silence: completed orders are also eligible', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({
      id: 'ord_completed',
      status: 'completed',
      delivered_at: new Date(NOW.getTime() - 30 * DAY).toISOString(),
    }),
  );

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.autoReviews.length, 1);
  assert.equal(fake.reviews[0].order_id, 'ord_completed');
});

test('buyer silence: re-running the sweep does not double-review', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({ id: 'ord_due', delivered_at: new Date(NOW.getTime() - 15 * DAY).toISOString() }),
  );
  const client = asQueryable(fake);

  const first = await evaluateAutoFeedback(client, policy());
  const second = await evaluateAutoFeedback(client, policy());

  assert.equal(first.autoReviews.length, 1);
  assert.equal(second.autoReviews.length, 0);
  assert.equal(fake.reviews.length, 1);
  assert.equal(fake.events.length, 1);
});

test('buyer silence: an existing buyer review wins — auto insert is a no-op', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({ id: 'ord_reviewed', delivered_at: new Date(NOW.getTime() - 20 * DAY).toISOString() }),
  );
  // A manual review written between sweeps.
  fake.reviews.push({
    id: 'review_manual',
    order_id: 'ord_reviewed',
    reviewer_id: 'buyer_1',
    seller_id: 'seller_1',
    rating: 4,
    is_auto: false,
    auto_reason: null,
  });

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.autoReviews.length, 0);
  assert.equal(fake.reviews.length, 1);
  assert.equal(fake.reviews[0].id, 'review_manual');
});

test('buyer silence: cancelled / refunded / refunding orders never receive feedback', async () => {
  const fake = createFakeDb();
  for (const status of ['cancelled', 'refunded', 'refunding']) {
    fake.orders.push(
      order({
        id: `ord_${status}`,
        status,
        delivered_at: new Date(NOW.getTime() - 30 * DAY).toISOString(),
      }),
    );
  }

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.autoReviews.length, 0);
  assert.equal(fake.reviews.length, 0);
});

test('buyer silence: an open support ticket suppresses auto feedback', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({ id: 'ord_ticket', delivered_at: new Date(NOW.getTime() - 20 * DAY).toISOString() }),
  );
  fake.openTickets.add('ord_ticket');

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.autoReviews.length, 0);
  assert.equal(fake.reviews.length, 0);
});

test('buyer silence: an open PSP dispute suppresses auto feedback', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({ id: 'ord_dispute', delivered_at: new Date(NOW.getTime() - 20 * DAY).toISOString() }),
  );
  fake.openDisputes.add('ord_dispute');

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.autoReviews.length, 0);
  assert.equal(fake.reviews.length, 0);
});

test('buyer silence: an open return case suppresses auto feedback', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({ id: 'ord_return', delivered_at: new Date(NOW.getTime() - 20 * DAY).toISOString() }),
  );
  fake.openReturnCases.add('ord_return');

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.autoReviews.length, 0);
  assert.equal(fake.reviews.length, 0);
});

// ── Dispatch SLA breach flagging ─────────────────────────────────────────────

test('dispatch SLA: paid order past ship-by records a breach flag, not a review', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({
      id: 'ord_late',
      status: 'paid',
      paid_at: new Date(NOW.getTime() - 5 * DAY).toISOString(),
      delivered_at: null,
    }),
  );
  fake.snapshots.set('ord_late', 3);

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.slaBreaches.length, 1);
  assert.equal(result.slaBreaches[0].orderId, 'ord_late');
  assert.equal(fake.breaches.length, 1);
  assert.equal(fake.breaches[0].breach_type, 'dispatch_sla');
  assert.deepEqual(fake.events.map((e) => e.event_type), ['order.dispatch_sla_breached']);
  // A breach is a flag, not a fabricated buyer review.
  assert.equal(fake.reviews.length, 0);
});

test('dispatch SLA: paid order inside the window records nothing', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({
      id: 'ord_ontime',
      status: 'paid',
      paid_at: new Date(NOW.getTime() - 1 * DAY).toISOString(),
      delivered_at: null,
    }),
  );
  fake.snapshots.set('ord_ontime', 3);

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.slaBreaches.length, 0);
  assert.equal(fake.breaches.length, 0);
});

test('dispatch SLA: an accepted extension shifts the effective deadline', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({
      id: 'ord_extended',
      status: 'paid',
      paid_at: new Date(NOW.getTime() - 10 * DAY).toISOString(),
      delivered_at: null,
    }),
  );
  fake.snapshots.set('ord_extended', 3);
  // Buyer accepted an extension to 15 days out BEFORE the base deadline
  // (paid 10d ago + 3d SLA = deadline 7d ago) — legitimately not breached.
  fake.extensions.set('ord_extended', [
    {
      shipBy: new Date(NOW.getTime() + 5 * DAY).toISOString(),
      respondedAt: new Date(NOW.getTime() - 8 * DAY).toISOString(),
    },
  ]);

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.slaBreaches.length, 0);

  // Once the accepted extension date also passes, the breach lands.
  fake.extensions.set('ord_extended', [
    {
      shipBy: new Date(NOW.getTime() - 1 * DAY).toISOString(),
      respondedAt: new Date(NOW.getTime() - 8 * DAY).toISOString(),
    },
  ]);
  const later = await evaluateAutoFeedback(asQueryable(fake), policy());
  assert.equal(later.slaBreaches.length, 1);
});

test('dispatch SLA: an extension accepted AFTER the deadline cannot erase the breach', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({
      id: 'ord_late_ext',
      status: 'paid',
      paid_at: new Date(NOW.getTime() - 10 * DAY).toISOString(),
      delivered_at: null,
    }),
  );
  fake.snapshots.set('ord_late_ext', 3);
  // Base deadline passed 7 days ago; the buyer accepted a new ship-by
  // yesterday — the breach already occurred and is not retroactively erased.
  fake.extensions.set('ord_late_ext', [
    {
      shipBy: new Date(NOW.getTime() + 5 * DAY).toISOString(),
      respondedAt: new Date(NOW.getTime() - 1 * DAY).toISOString(),
    },
  ]);

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.slaBreaches.length, 1);
  assert.equal(fake.breaches[0].order_id, 'ord_late_ext');
});

test('dispatch SLA: chained extensions fold while each was granted in time', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({
      id: 'ord_chain',
      status: 'paid',
      paid_at: new Date(NOW.getTime() - 10 * DAY).toISOString(),
      delivered_at: null,
    }),
  );
  fake.snapshots.set('ord_chain', 3);
  // First extension accepted before the base deadline (now-7d) moves the
  // deadline to now-2d; a second accepted before THAT expires moves it again.
  fake.extensions.set('ord_chain', [
    {
      shipBy: new Date(NOW.getTime() - 2 * DAY).toISOString(),
      respondedAt: new Date(NOW.getTime() - 8 * DAY).toISOString(),
    },
    {
      shipBy: new Date(NOW.getTime() + 9 * DAY).toISOString(),
      respondedAt: new Date(NOW.getTime() - 3 * DAY).toISOString(),
    },
  ]);

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  // Latest legitimately-accepted deadline (now+9d) has not expired.
  assert.equal(result.slaBreaches.length, 0);
});

test('dispatch SLA: orders without a snapshot use the platform default window', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({
      id: 'ord_legacy',
      status: 'paid',
      paid_at: new Date(NOW.getTime() - 4 * DAY).toISOString(),
      delivered_at: null,
    }),
  );
  // No snapshot row — falls back to policy.defaultDispatchSlaDays (3).

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.slaBreaches.length, 1);
});

test('dispatch SLA: re-running the sweep does not double-flag', async () => {
  const fake = createFakeDb();
  fake.orders.push(
    order({
      id: 'ord_late',
      status: 'paid',
      paid_at: new Date(NOW.getTime() - 5 * DAY).toISOString(),
      delivered_at: null,
    }),
  );
  fake.snapshots.set('ord_late', 3);
  const client = asQueryable(fake);

  const first = await evaluateAutoFeedback(client, policy());
  const second = await evaluateAutoFeedback(client, policy());

  assert.equal(first.slaBreaches.length, 1);
  assert.equal(second.slaBreaches.length, 0);
  assert.equal(fake.breaches.length, 1);
  assert.equal(fake.events.length, 1);
});

test('dispatch SLA: shipped / delivered / cancelled orders cannot breach dispatch', async () => {
  const fake = createFakeDb();
  for (const status of ['shipped', 'delivered', 'completed', 'cancelled', 'refunded']) {
    fake.orders.push(
      order({
        id: `ord_${status}`,
        status,
        paid_at: new Date(NOW.getTime() - 10 * DAY).toISOString(),
        delivered_at: null,
      }),
    );
  }

  const result = await evaluateAutoFeedback(asQueryable(fake), policy());

  assert.equal(result.slaBreaches.length, 0);
  assert.equal(fake.breaches.length, 0);
});

// ── resolveDispatchShipBy unit coverage ──────────────────────────────────────

test('resolveDispatchShipBy: accepted extension wins over the base anchor', () => {
  const accepted = '2026-04-01T00:00:00.000Z';
  const result = resolveDispatchShipBy({
    paidAt: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-02-28T00:00:00.000Z',
    dispatchSlaDays: 3,
    acceptedShipBy: accepted,
    defaultSlaDays: 3,
  });
  assert.equal(result, accepted);
});

test('resolveDispatchShipBy: paid_at + sla days when no extension exists', () => {
  const result = resolveDispatchShipBy({
    paidAt: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-02-28T00:00:00.000Z',
    dispatchSlaDays: 5,
    acceptedShipBy: null,
    defaultSlaDays: 3,
  });
  assert.equal(result, '2026-03-06T00:00:00.000Z');
});

test('resolveDispatchShipBy: falls back to created_at and the default SLA', () => {
  const result = resolveDispatchShipBy({
    paidAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    dispatchSlaDays: null,
    acceptedShipBy: null,
    defaultSlaDays: 7,
  });
  assert.equal(result, '2026-03-08T00:00:00.000Z');
});

test('resolveDispatchShipBy: malformed timestamps fail safe (null)', () => {
  const result = resolveDispatchShipBy({
    paidAt: null,
    createdAt: 'not-a-date',
    dispatchSlaDays: 3,
    acceptedShipBy: null,
    defaultSlaDays: 3,
  });
  assert.equal(result, null);
});
