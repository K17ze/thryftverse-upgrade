/**
 * Offer lifecycle → in-thread offer card emitter.
 *
 * Exercises `emitOfferChatCard` / `syncOfferChatCardStatus` directly with a
 * fake `DbQueryable` and a captured publish function — the same seams the
 * production callers rely on (the outbox drain handler, post-commit,
 * never-inside-the-transaction):
 *
 *   - a real offer inserts one `sender_type = 'user'` row authored by
 *     `offered_by_user_id`, carrying `metadata.offerPayload` and the
 *     reconciliation `client_message_id = 'offer_{offerId}'`, and publishes
 *     `chat.message.created` on `chat.conversation:{id}`;
 *   - a retry/replay hits the deterministic message id and produces no
 *     second row and no realtime event;
 *   - a status transition patches the stored `offerPayload` in place and
 *     publishes `chat.message.edited` carrying the merged snapshot (no
 *     "Edited" marker fields are touched);
 *   - an offer with no resolvable buyer–seller conversation emits nothing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';
import {
  emitOfferChatCard,
  offerChatClientMessageId,
  offerChatMessageId,
  syncOfferChatCardStatus,
} from './offerChatCards.js';
import type { publishRealtimeEvent } from './realtime.js';
import type { DbQueryable } from './workerHelpers.js';

const OFFER_ID = 'offer_test_1';
const CONVERSATION_ID = 'conv_test_1';

const OFFER_ROW: {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  offer_price_gbp: string;
  original_price_gbp: string;
  counter_round: number;
  status: string;
  expires_at: string;
  conversation_id: string | null;
  offered_by_user_id: string | null;
  item_title: string | null;
} = {
  id: OFFER_ID,
  listing_id: 'lst_1',
  buyer_id: 'buyer-1',
  seller_id: 'seller-1',
  offer_price_gbp: '45.00',
  original_price_gbp: '60.00',
  counter_round: 0,
  status: 'pending',
  expires_at: '2026-02-10T00:00:00.000Z',
  conversation_id: CONVERSATION_ID,
  offered_by_user_id: 'buyer-1',
  item_title: 'Vintage Denim Jacket',
};

type ExistingCardRow = {
  id: string;
  conversation_id: string;
  metadata: Record<string, unknown> | null;
  edit_version: number;
  edited_at: string | null;
};

type FakeDbOptions = {
  offer?: typeof OFFER_ROW | null;
  /** Resolved conversation — null simulates "no buyer–seller DM exists". */
  conversationId?: string | null;
  /** Simulate ON CONFLICT DO NOTHING matching an existing row. */
  insertRowCount?: number;
  /** The persisted card row read by syncOfferChatCardStatus; null = no card. */
  existingCard?: ExistingCardRow | null;
};

function fakeDb(options: FakeDbOptions = {}) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const offer = options.offer === undefined ? OFFER_ROW : options.offer;
  const conversationId =
    options.conversationId === undefined ? CONVERSATION_ID : options.conversationId;
  const insertRowCount = options.insertRowCount ?? 1;
  const existingCard =
    options.existingCard === undefined ? null : options.existingCard;
  const query = async <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> => {
    calls.push({ text, params });
    if (/FROM listing_offers o/.test(text)) {
      return {
        rows: (offer ? [offer] : []) as unknown as T[],
        rowCount: offer ? 1 : 0,
      } as QueryResult<T>;
    }
    if (/FROM chat_conversations c/.test(text)) {
      return {
        rows: (conversationId ? [{ id: conversationId }] : []) as unknown as T[],
        rowCount: conversationId ? 1 : 0,
      } as QueryResult<T>;
    }
    if (/INSERT INTO chat_messages/.test(text)) {
      return {
        rows: (insertRowCount
          ? [{ id: String(params?.[0]), created_at: '2026-02-01T00:00:00.000Z' }]
          : []) as unknown as T[],
        rowCount: insertRowCount,
      } as QueryResult<T>;
    }
    if (/UPDATE chat_messages/.test(text)) {
      // jsonb_set merge — return the caller-supplied offerPayload merged in.
      const merged = {
        ...(existingCard?.metadata ?? {}),
        offerPayload: params?.[1] ? JSON.parse(String(params[1])) : undefined,
      };
      return {
        rows: [{ metadata: merged }] as unknown as T[],
        rowCount: 1,
      } as QueryResult<T>;
    }
    if (/FROM chat_messages/.test(text)) {
      return {
        rows: (existingCard ? [existingCard] : []) as unknown as T[],
        rowCount: existingCard ? 1 : 0,
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

function existingCardWith(status: string): ExistingCardRow {
  return {
    id: offerChatMessageId(OFFER_ID),
    conversation_id: CONVERSATION_ID,
    metadata: {
      offerCard: true,
      offerPayload: {
        offerId: OFFER_ID,
        listingId: 'lst_1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        offerPrice: 45,
        price: 45,
        amount: 45,
        originalPrice: 60,
        status,
        expiresAt: OFFER_ROW.expires_at,
        counterRound: 0,
      },
    },
    edit_version: 0,
    edited_at: null,
  };
}

// ── emitOfferChatCard ────────────────────────────────────────────────

test('offer creation inserts a user-authored offer card and publishes chat.message.created', async () => {
  const db = fakeDb();
  const { events, publish } = fakePublish();

  const result = await emitOfferChatCard({
    offerId: OFFER_ID,
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, true);
  assert.equal(result.conversationId, CONVERSATION_ID);
  assert.equal(result.messageId, offerChatMessageId(OFFER_ID));

  const insert = db.calls.find((c) => /INSERT INTO chat_messages/.test(c.text));
  assert.ok(insert, 'expected a chat_messages insert');
  // Deterministic id, user sender authored by the offer maker, and the
  // reconciliation client_message_id the optimistic echo waits on.
  assert.equal(insert.params?.[0], offerChatMessageId(OFFER_ID));
  assert.match(insert.text, /'user'/);
  assert.equal(insert.params?.[2], 'buyer-1');
  assert.equal(insert.params?.[7], offerChatClientMessageId(OFFER_ID));
  const metadata = JSON.parse(String(insert.params?.[6])) as Record<string, unknown>;
  assert.equal(metadata.offerCard, true);
  const offerPayload = metadata.offerPayload as Record<string, unknown>;
  assert.equal(offerPayload.offerId, OFFER_ID);
  assert.equal(offerPayload.status, 'pending');
  assert.equal(offerPayload.offerPrice, 45);
  assert.equal(offerPayload.originalPrice, 60);
  assert.equal(offerPayload.buyerId, 'buyer-1');
  assert.equal(offerPayload.sellerId, 'seller-1');

  assert.equal(events.length, 1);
  assert.equal(events[0].topic, `chat.conversation:${CONVERSATION_ID}`);
  assert.equal(events[0].type, 'chat.message.created');
  const payload = events[0].payload as {
    id: string;
    senderType: string;
    senderUserId: string;
    clientMessageId: string;
    metadata: { offerPayload: { offerId: string; status: string } };
  };
  assert.equal(payload.id, offerChatMessageId(OFFER_ID));
  assert.equal(payload.senderType, 'user');
  assert.equal(payload.senderUserId, 'buyer-1');
  assert.equal(payload.clientMessageId, offerChatClientMessageId(OFFER_ID));
  assert.equal(payload.metadata.offerPayload.status, 'pending');
});

test('a seller-authored counter attributes the card to the seller and reads as a counter', async () => {
  const counterOffer = {
    ...OFFER_ROW,
    counter_round: 1,
    offered_by_user_id: 'seller-1',
    offer_price_gbp: '52.50',
  };
  const db = fakeDb({ offer: counterOffer });
  const { events, publish } = fakePublish();

  const result = await emitOfferChatCard({
    offerId: OFFER_ID,
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, true);
  const insert = db.calls.find((c) => /INSERT INTO chat_messages/.test(c.text));
  assert.equal(insert?.params?.[2], 'seller-1');
  const payload = events[0].payload as {
    senderUserId: string;
    body: string;
    metadata: { offerPayload: { counterRound: number } };
  };
  assert.equal(payload.senderUserId, 'seller-1');
  assert.match(payload.body, /^Counter-offer: /);
  assert.equal(payload.metadata.offerPayload.counterRound, 1);
});

test('retry hits the deterministic id and emits no second row or event', async () => {
  const db = fakeDb({ insertRowCount: 0 });
  const { events, publish } = fakePublish();

  const result = await emitOfferChatCard({
    offerId: OFFER_ID,
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, false);
  assert.equal(result.skippedReason, 'duplicate');
  assert.equal(events.length, 0);
});

test('offer without a resolvable buyer–seller conversation emits nothing', async () => {
  // The offer was created without a conversation link and no shared DM
  // exists — never fabricate a thread.
  const db = fakeDb({
    offer: { ...OFFER_ROW, conversation_id: null },
    conversationId: null,
  });
  const { events, publish } = fakePublish();

  const result = await emitOfferChatCard({
    offerId: OFFER_ID,
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, false);
  assert.equal(result.skippedReason, 'no_conversation');
  assert.ok(
    !db.calls.some((c) => /INSERT INTO chat_messages/.test(c.text)),
    'no chat row may be written without a verified conversation',
  );
  assert.equal(events.length, 0);
});

test('missing offer emits nothing', async () => {
  const db = fakeDb({ offer: null });
  const { events, publish } = fakePublish();

  const result = await emitOfferChatCard({
    offerId: 'offer_missing',
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, false);
  assert.equal(result.skippedReason, 'offer_not_found');
  assert.equal(events.length, 0);
});

// ── syncOfferChatCardStatus ──────────────────────────────────────────

test('a status transition patches the stored offerPayload and publishes chat.message.edited', async () => {
  const db = fakeDb({
    offer: { ...OFFER_ROW, status: 'accepted' },
    existingCard: existingCardWith('pending'),
  });
  const { events, publish } = fakePublish();

  const result = await syncOfferChatCardStatus({
    offerId: OFFER_ID,
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, true);
  assert.equal(result.conversationId, CONVERSATION_ID);

  const update = db.calls.find((c) => /UPDATE chat_messages/.test(c.text));
  assert.ok(update, 'expected a chat_messages metadata update');
  // The sync is a metadata merge — it must not touch edit_version/edited_at.
  assert.match(update.text, /jsonb_set/);
  assert.doesNotMatch(update.text, /edit_version = edit_version \+ 1/);

  assert.equal(events.length, 1);
  assert.equal(events[0].topic, `chat.conversation:${CONVERSATION_ID}`);
  assert.equal(events[0].type, 'chat.message.edited');
  const payload = events[0].payload as {
    messageId: string;
    offer: { offerId: string; status: string };
    editVersion: number;
    editedAt: string | null;
  };
  assert.equal(payload.messageId, offerChatMessageId(OFFER_ID));
  assert.equal(payload.offer.offerId, OFFER_ID);
  assert.equal(payload.offer.status, 'accepted');
  // Untouched edit marker fields — the client must not flag "Edited".
  assert.equal(payload.editVersion, 0);
  assert.equal(payload.editedAt, null);
});

test('sync is a no-op when the card already carries the persisted status', async () => {
  const db = fakeDb({ existingCard: existingCardWith('pending') });
  const { events, publish } = fakePublish();

  const result = await syncOfferChatCardStatus({
    offerId: OFFER_ID,
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, false);
  assert.equal(result.skippedReason, 'unchanged');
  assert.ok(
    !db.calls.some((c) => /UPDATE chat_messages/.test(c.text)),
    'no write when the stored status already matches',
  );
  assert.equal(events.length, 0);
});

test('sync falls back to a full emit when the card row does not exist yet', async () => {
  // Offer predates the feature (or the create emit could not resolve a
  // conversation) — the card is inserted carrying the current status,
  // which is still truthful.
  const db = fakeDb({
    offer: { ...OFFER_ROW, status: 'declined' },
    existingCard: null,
  });
  const { events, publish } = fakePublish();

  const result = await syncOfferChatCardStatus({
    offerId: OFFER_ID,
    queryable: db,
    publish,
    log: silentLog,
  });

  assert.equal(result.emitted, true);
  const insert = db.calls.find((c) => /INSERT INTO chat_messages/.test(c.text));
  assert.ok(insert, 'expected the fallback emit to insert a card');
  const metadata = JSON.parse(String(insert?.params?.[6] as string)) as {
    offerPayload: { status: string };
  };
  assert.equal(metadata.offerPayload.status, 'declined');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'chat.message.created');
});
