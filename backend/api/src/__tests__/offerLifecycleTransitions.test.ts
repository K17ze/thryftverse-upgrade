/**
 * offerLifecycleTransitions — regression coverage for the offer-lifecycle
 * truthfulness wave:
 *
 *  1. executeOfferAcceptance performs the FULL durable transition (order +
 *     reservation + offer flip + sibling declines + listing pause +
 *     offer.accepted + order_events) — the Smart Sell auto-accept path
 *     previously only stamped metadata and dead-lettered.
 *  2. mapRow computes effective status: a 'pending' row past expires_at
 *     must read 'expired' — reads must not claim an overdue offer is
 *     actionable.
 *  3. offerStatusFilterClause keeps filtered lists consistent with that
 *     computed status (pending excludes overdue; expired includes them).
 *  4. Source-level guards for the seams that can't be faked cheaply:
 *     participant-scoped realtime topics, authorship-aware notification
 *     recipients, Smart Sell expiry/away guards, conversation membership
 *     validation, and the 23505 idempotent-replay race.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { executeOfferAcceptance } from '../lib/offerAcceptance.js';
import {
  mapRow,
  offerStatusFilterClause,
  type ListingOfferRow,
} from '../routes/listingOffers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '..');
const repoSrc = (rel: string) =>
  readFileSync(path.join(srcRoot, rel), 'utf8').replace(/\s+/g, ' ');

interface FakeResult {
  rows: Record<string, unknown>[];
  rowCount?: number;
}

function fakeClient(handlers: Array<{ match: string; result: FakeResult }>) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async <T = unknown>(text: string, params?: unknown[]) => {
    calls.push({ text, params });
    const normalized = text.replace(/\s+/g, ' ');
    const handler = handlers.find((h) => normalized.includes(h.match));
    const result = handler?.result ?? { rows: [], rowCount: 0 };
    return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length } as {
      rows: T[];
      rowCount: number;
    };
  };
  return { calls, query };
}

// ── executeOfferAcceptance ──────────────────────────────────────────────────

test('executeOfferAcceptance creates order + reservation + sibling declines + events', async () => {
  const { calls, query } = fakeClient([
    {
      // Sibling sweep returns one SELLER-authored counter — its event must
      // carry offeredByUserId so the drain notifies the seller, not the buyer.
      match: "SET status = 'declined'",
      result: {
        rows: [{
          id: 'offer_sibling',
          buyer_id: 'buyer_2',
          offer_price_gbp: '40.00',
          conversation_id: null,
          offered_by_user_id: 'seller_1',
        }],
      },
    },
    { match: 'INSERT INTO domain_outbox', result: { rows: [{ id: 'evt_x' }] } },
  ]);

  const client = { query } as unknown as Parameters<typeof executeOfferAcceptance>[0];
  const result = await executeOfferAcceptance(client, {
    offerId: 'offer_1',
    listingId: 'listing_1',
    buyerId: 'buyer_1',
    sellerId: 'seller_1',
    offerPriceGbp: 50,
    actorUserId: 'seller_1',
    correlationId: 'req_1',
    calculatePlatformChargeGbp: (s) => Math.round(s * 0.1 * 100) / 100,
  });

  assert.ok(result.orderId.startsWith('ord_offer_'));
  assert.ok(result.reservationId.startsWith('lres_'));
  assert.equal(result.subtotalGbp, 50);
  assert.equal(result.platformChargeGbp, 5);
  assert.equal(result.totalGbp, 55);

  const normalized = calls.map((c) => c.text.replace(/\s+/g, ' '));

  // Order row binds buyer + seller + listing with the offer quote.
  const orderInsert = calls[normalized.findIndex((t) => t.includes('INSERT INTO orders'))];
  assert.ok(orderInsert, 'order insert missing');
  assert.deepEqual(
    [orderInsert.params?.[1], orderInsert.params?.[2], orderInsert.params?.[3]],
    ['buyer_1', 'seller_1', 'listing_1'],
  );

  // Reservation binds the offer to the new order.
  const reservationInsert = calls[
    normalized.findIndex((t) => t.includes('INSERT INTO listing_checkout_reservations'))
  ];
  assert.ok(reservationInsert, 'reservation insert missing');
  assert.equal(reservationInsert.params?.[1], 'offer_1');
  assert.equal(reservationInsert.params?.[5], result.orderId);

  // Offer flipped to accepted with order + reservation linkage.
  assert.ok(
    normalized.some((t) => t.includes("SET status = 'accepted'")),
    'offer accept flip missing',
  );

  // Listing paused with checkout_reservation provenance (never an
  // unscoped pause the sweeper could mis-restore).
  const pause = calls[normalized.findIndex((t) => t.includes('UPDATE listings'))];
  assert.ok(pause?.text.includes("pause_source = 'checkout_reservation'"));

  // Outbox events: offer.accepted + one offer.sibling_declined per loser.
  const outboxCalls = calls.filter((c) => c.text.includes('INSERT INTO domain_outbox'));
  const eventTypes = outboxCalls.map((c) => c.params?.[3]);
  assert.ok(eventTypes.includes('offer.accepted'));
  assert.ok(eventTypes.includes('offer.sibling_declined'));

  // The sibling event must carry the real author so the drain notifies the
  // seller whose counter lost — not the buyer of the winning negotiation.
  const siblingEvent = outboxCalls.find((c) => c.params?.[3] === 'offer.sibling_declined');
  const siblingPayload = JSON.parse(siblingEvent?.params?.[5] as string);
  assert.equal(siblingPayload.offeredByUserId, 'seller_1');
  assert.equal(siblingPayload.buyerId, 'buyer_2');
  assert.equal(siblingPayload.acceptedOfferId, 'offer_1');
  assert.equal(siblingPayload.orderId, result.orderId);

  // Order events: order.created + payment.required, deduped.
  const orderEvents = calls.find((c) => c.text.includes('INSERT INTO order_events'));
  assert.ok(orderEvents, 'order_events insert missing');
  assert.ok(orderEvents.text.includes('order.created'));
  assert.ok(orderEvents.text.includes('payment.required'));
});

// ── mapRow computed status ──────────────────────────────────────────────────

function baseRow(overrides: Partial<ListingOfferRow>): ListingOfferRow {
  return {
    id: 'offer_1',
    listing_id: 'listing_1',
    buyer_id: 'buyer_1',
    seller_id: 'seller_1',
    offer_price_gbp: '50.00',
    original_price_gbp: '80.00',
    counter_round: 0,
    status: 'pending',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    accepted_at: null,
    declined_at: null,
    expired_at: null,
    cancelled_at: null,
    conversation_id: null,
    parent_offer_id: null,
    metadata: null,
    offered_by_user_id: 'buyer_1',
    order_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

test('mapRow reports an overdue pending offer as expired', () => {
  const overdue = mapRow(baseRow({
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  }));
  assert.equal(overdue.status, 'expired');

  const live = mapRow(baseRow({}));
  assert.equal(live.status, 'pending');

  // Persisted terminal states are never rewritten by the read path.
  const accepted = mapRow(baseRow({
    status: 'accepted',
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  }));
  assert.equal(accepted.status, 'accepted');
});

test('mapRow defaults offeredByUserId to the buyer on legacy rows', () => {
  const row = mapRow(baseRow({ offered_by_user_id: null }));
  assert.equal(row.offeredByUserId, 'buyer_1');
});

// ── offerStatusFilterClause ─────────────────────────────────────────────────

test('offerStatusFilterClause aligns filters with computed status', () => {
  const pendingParams: unknown[] = [];
  const pendingClause = offerStatusFilterClause('pending', pendingParams);
  assert.ok(pendingClause.includes("status = 'pending'"));
  assert.ok(pendingClause.includes('expires_at > NOW()'));
  assert.equal(pendingParams.length, 0);

  const expiredParams: unknown[] = [];
  const expiredClause = offerStatusFilterClause('expired', expiredParams);
  assert.ok(expiredClause.includes("status = 'expired'"));
  assert.ok(expiredClause.includes("status = 'pending' AND expires_at <= NOW()"));

  const acceptedParams: unknown[] = [];
  const acceptedClause = offerStatusFilterClause('accepted', acceptedParams);
  assert.ok(acceptedClause.includes('status = $1'));
  assert.deepEqual(acceptedParams, ['accepted']);

  assert.equal(offerStatusFilterClause(undefined, []), '');
});

// ── Source-level seam guards ────────────────────────────────────────────────

test('offer realtime publishes are participant-scoped, never listing topics', () => {
  const drain = repoSrc('workers/handlers/outboxDrainHandler.ts');
  assert.ok(
    drain.includes('topic: `chat.user:${userId}`'),
    'offer events must publish on chat.user topics',
  );
  assert.ok(
    !drain.includes('topic: `listing:'),
    'offer events must not publish on public listing topics',
  );
});

test('drain routes cancel/expire/sibling notifications to the right party', () => {
  const drain = repoSrc('workers/handlers/outboxDrainHandler.ts');
  // Buyer-initiated cancel notifies the seller, not the actor.
  assert.ok(drain.includes('cancelledByUserId === payload.buyerId'));
  // Expiry + sibling-decline notify the offer AUTHOR (seller-authored
  // counters must not land on the buyer as "your offer").
  assert.ok(drain.includes('payload.offeredByUserId ?? payload.buyerId'));
  // Smart Sell decisions drain instead of dead-lettering.
  assert.ok(drain.includes("event.eventType.startsWith('smart_sell_decision.')"));
  // Lapsed accepted-offer checkouts notify BOTH parties.
  assert.ok(drain.includes("event.eventType === 'offer.checkout_expired'"));
});

test('listing.price_changed invalidates pending offers via offer.cancelled', () => {
  const drain = repoSrc('workers/handlers/outboxDrainHandler.ts');
  // R35: a reprice must not leave pending offers actionable — they were
  // negotiated against the previous price. The drain branch cancels them
  // (an existing terminal status) and emits the standard offer.cancelled
  // event so notification, realtime and chat-card flip reuse one path.
  const priceBranch = drain.slice(
    drain.indexOf("event.eventType === 'listing.price_changed'"),
    drain.indexOf("event.eventType === 'offer.accepted'"),
  );
  assert.ok(
    priceBranch.includes('UPDATE listing_offers')
      && priceBranch.includes("SET status = 'cancelled'")
      && priceBranch.includes("AND status = 'pending'"),
    'price_changed must cancel pending offers on the listing',
  );
  assert.ok(
    priceBranch.includes("eventType: 'offer.cancelled'"),
    'cancelled offers must emit offer.cancelled so the fan-out is uniform',
  );
  assert.ok(
    priceBranch.includes("cancellationReason: 'listing_terms_changed'"),
    'the cancel reason must be terms-changed, not listing_unavailable',
  );
  // Buyer-facing copy must not claim the listing is gone or that the
  // seller pressed cancel — it must name the price change.
  assert.ok(
    drain.includes("payload.cancellationReason === 'listing_terms_changed'")
      && drain.includes('price changed'),
    'offer.cancelled copy must explain the material change',
  );
});

test('smart sell evaluate guards expiry and seller-away before binding', () => {
  const smartSell = repoSrc('routes/smartSellPolicy.ts');
  assert.ok(
    smartSell.includes('Date.parse(offer.expires_at) <= Date.now()'),
    'expired offers must not be auto-accepted',
  );
  assert.ok(
    smartSell.includes('fetchSellerAwayState'),
    'away sellers must not be bound by automation',
  );
  assert.ok(
    smartSell.includes('getSellerReach'),
    'suspended sellers must not be auto-bound — same SELLER_RESTRICTED gate as manual accept',
  );
  assert.ok(
    smartSell.includes('executeOfferAcceptance'),
    'smart sell accept must run the real durable transition',
  );
  assert.ok(
    smartSell.includes('emitOrderCommerceCard'),
    'auto-accept must emit the order commerce card post-commit',
  );
});

test('offer routes keep the hardened mutation contract', () => {
  const routes = repoSrc('routes/listingOffers.ts');
  // Concurrent same-key requests recover the committed winner instead of 500.
  assert.ok(routes.includes('23505'));
  // Client-supplied conversation ids are validated against membership.
  assert.ok(routes.includes('chat_members'));
  // Author cannot accept their own offer (seller self-accept poison).
  assert.ok(routes.includes('OFFER_AUTHOR_CANNOT_ACCEPT'));
  // Deadlock/serialization conflicts surface as retryable 409s.
  assert.ok(routes.includes('OFFER_CONFLICT'));
});

test('accept idempotent replay only expires truly terminal reservations', () => {
  const routes = repoSrc('routes/listingOffers.ts');
  // A 'converted' or 'paid' reservation means checkout completed — the
  // accept replay must return the bound checkout payload, not expire a
  // paid order's offer. The whitelist must name the terminal statuses.
  assert.ok(
    routes.includes("['expired', 'cancelled', 'released'].includes(reservation.rows[0].status)"),
    'replay self-heal must whitelist terminal reservation statuses, not blacklist active',
  );
});

test('checkout sweep covers trigger-flipped offers and pending-offer lapses', () => {
  const index = repoSrc('index.ts');
  // Non-sweep cancel paths flip the bound offer via the reconcile trigger
  // with no domain event — the sweep must emit offer.checkout_expired for
  // them or the lapse is silent.
  assert.ok(
    index.includes("o.metadata->>'checkoutStatus' IN ('cancelled', 'payment_failed')"),
    'sweep must find trigger-flipped offers missing their checkout_expired event',
  );
  // Pending offers that lapse with no mutation traffic must still notify —
  // expireOverdueOffers + appendOfferExpiredEvents run inside the sweep.
  assert.ok(
    index.includes('expireOverdueOffers(client)') && index.includes('appendOfferExpiredEvents(client'),
    'sweep must expire overdue pending offers and emit their events',
  );
});

test('offers-to-likers route is seller-scoped, liker-sourced, and idempotent', () => {
  const routes = repoSrc('routes/listingOffers.ts');
  assert.ok(
    routes.includes("'/listings/:listingId/offers-to-likers'"),
    'offer-to-likers route missing',
  );
  // Seller-scoped: only the listing owner may fan out.
  assert.ok(routes.includes('Only the listing owner can send offers to likers'));
  // Likers come from the wishlist heart (user_saved_listings, migration
  // 306) — the product's real "like" — not a fabricated source.
  assert.ok(routes.includes("usl.list = 'wishlist'"));
  // A liker already holding a live pending offer is skipped, not clobbered.
  assert.ok(routes.includes("o.status = 'pending'"));
  // Fan-out is capped per batch.
  assert.ok(routes.includes('MAX_LIKERS_PER_BATCH'));
  // Batch idempotency: offerBatchKey in metadata + row-level conflict
  // dedup on (offered_by_user_id, idempotency_key).
  assert.ok(routes.includes("metadata->>'offerBatchKey'"));
  assert.ok(routes.includes('ON CONFLICT DO NOTHING'));
});

test('drain notifies the liker for seller-authored offer.created events', () => {
  const drain = repoSrc('workers/handlers/outboxDrainHandler.ts');
  // offer.created with offeredByUserId === sellerId (offer-to-likers) must
  // land on the buyer — the liker is the one who responds. Telling the
  // seller "you got an offer" about their own send would be false.
  assert.ok(drain.includes('payload.offeredByUserId === payload.sellerId'));
  assert.ok(drain.includes('sellerAuthored ? payload.buyerId : payload.sellerId'));
  // Buyer-authored notification keys keep their historical shape.
  assert.ok(drain.includes('offer_created_${sellerAuthored ? \'buyer\' : \'seller\'}'));
});

test('offer chat card emits ISO expiresAt, not raw Postgres text', () => {
  const cards = repoSrc('lib/offerChatCards.ts');
  // Raw expires_at::text ('2026-07-28 12:34:56.789+00') parses to NaN on
  // Hermes — expired offers kept live Accept buttons on Android.
  assert.ok(
    cards.includes("TO_CHAR(o.expires_at AT TIME ZONE 'UTC'"),
    'expiresAt must be formatted as ISO-8601 at the source',
  );
  assert.ok(
    !cards.includes('o.expires_at::text'),
    'raw Postgres ::text timestamp must not reach the card payload',
  );
});
