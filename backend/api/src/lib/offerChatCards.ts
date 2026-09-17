/**
 * Offer lifecycle → in-thread offer card emitter.
 *
 * The frontend renders `offer` chat messages as MarketplaceChatCard offer
 * cards (ChatCommerceCard → MarketplaceChatCard) whose Accept/Pass/Counter
 * actions are bound to the real offer endpoints. The transport is the
 * standard chat pipeline: a `sender_type = 'user'` row in `chat_messages`
 * carrying the offer snapshot under `metadata.offerPayload`, plus a
 * `chat.message.created` realtime event on `chat.conversation:{id}`.
 *
 * Unlike order cards (system-authored), the offer card is authored by the
 * user who made the offer — `sender_user_id` is `offered_by_user_id` (the
 * buyer for a fresh offer, whichever party countered for a counter). That
 * attribution is what lets the card render on the correct side and gate the
 * response buttons to the counterparty (`isPending && !isMe`).
 *
 * Design rules (marketplace audit P1 — mirrors orderChatCards.ts):
 * - **Truthful.** The emit re-reads the `listing_offers` row; the persisted
 *   status is what the card carries, so a fast accept/decline that landed
 *   before the drain still produces a truthful card.
 * - **Idempotent.** The message id is deterministic (`chatmsg_offer:{offerId}`)
 *   and the insert is `ON CONFLICT DO NOTHING`. The row also carries
 *   `client_message_id = 'offer_{offerId}'` so the sender's optimistic echo
 *   (clientMessageId `offer_{offerId}`) reconciles instead of duplicating,
 *   and the partial unique index is a second dedupe backstop.
 * - **Status-aware.** `syncOfferChatCardStatus` patches
 *   `metadata.offerPayload.status` in place and publishes
 *   `chat.message.edited` carrying the merged offer snapshot so both
 *   devices flip the card live. The edit event is a metadata sync — it does
 *   not bump `edit_version`/`edited_at`, so the card never shows an
 *   "Edited" marker.
 * - **Never breaks the offer flow.** All errors are caught and logged; the
 *   caller's committed offer transition is unaffected.
 */
import { db } from '../db/pool.js';
import { logger } from './logger.js';
import { publishRealtimeEvent } from './realtime.js';
import { encryptMessageBody } from './messageEncryption.js';
import { formatGbpAmount, toJsonString, type DbQueryable } from './workerHelpers.js';

type EmitLog = {
  error(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
};

/** The offer snapshot the frontend maps from `metadata.offerPayload` into
 *  `Message.offer` (mapApiMessageToConversationMessage /
 *  realtimePayloadToMessage) and MarketplaceChatCard consumes. */
export interface OfferChatCardPayload {
  offerId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  offerPrice: number;
  /** Aliases consumed by legacy clients/mappers. */
  price: number;
  amount: number;
  originalPrice: number;
  status: 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'cancelled';
  expiresAt: string;
  counterRound: number;
  listingTitle?: string;
}

interface OfferRow {
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
}

export interface OfferChatCardResult {
  emitted: boolean;
  conversationId: string | null;
  messageId: string;
  skippedReason?: 'offer_not_found' | 'no_conversation' | 'duplicate' | 'unchanged' | 'error';
}

export function offerChatMessageId(offerId: string): string {
  return `chatmsg_offer_${offerId}`;
}

/** Stable clientMessageId shared with the sender-side optimistic echo in
 *  useConversationMessages (`offer_${offerId}`). */
export function offerChatClientMessageId(offerId: string): string {
  return `offer_${offerId}`;
}

/** Re-read the offer row with the listing snapshot — the emit is always
 *  derived from durable state, never from caller-supplied claims. */
async function loadOfferRow(
  queryable: DbQueryable,
  offerId: string,
): Promise<OfferRow | null> {
  const result = await queryable.query<OfferRow>(
    `SELECT o.id, o.listing_id, o.buyer_id, o.seller_id,
            o.offer_price_gbp::text, o.original_price_gbp::text,
            o.counter_round, o.status, o.expires_at::text,
            o.conversation_id, o.offered_by_user_id,
            l.title AS item_title
     FROM listing_offers o
     LEFT JOIN listings l ON l.id = o.listing_id
     WHERE o.id = $1
     LIMIT 1`,
    [offerId],
  );
  return result.rows[0] ?? null;
}

/**
 * Resolve the buyer–seller conversation the card belongs in. Priority:
 *   a) the thread the offer was negotiated in (listing_offers.conversation_id);
 *   b) a DM shared by buyer and seller, preferring the thread that carries
 *      this listing's context (chat_conversations.item_id).
 * No linked conversation → no card (never fabricate a thread).
 *
 * SECURITY: listing_offers.conversation_id is caller-supplied at offer
 * creation, so the linked thread is re-verified here — it must be a `dm`
 * containing BOTH buyer and seller, otherwise offer details would leak into
 * an arbitrary conversation. Same guard as orderChatCards.
 */
async function resolveOfferConversationId(
  queryable: DbQueryable,
  offer: OfferRow,
): Promise<string | null> {
  if (offer.conversation_id) {
    const linked = await queryable.query<{ id: string }>(
      `SELECT c.id
       FROM chat_conversations c
       WHERE c.id = $1
         AND c.type = 'dm'
         AND EXISTS (
           SELECT 1 FROM chat_members m
           WHERE m.conversation_id = c.id AND m.user_id = $2
         )
         AND EXISTS (
           SELECT 1 FROM chat_members m
           WHERE m.conversation_id = c.id AND m.user_id = $3
         )
       LIMIT 1`,
      [offer.conversation_id, offer.buyer_id, offer.seller_id],
    );
    if (linked.rows[0]?.id) return linked.rows[0].id;
  }
  const dmResult = await queryable.query<{ id: string }>(
    `SELECT c.id
     FROM chat_conversations c
     WHERE c.type = 'dm'
       AND EXISTS (
         SELECT 1 FROM chat_members m
         WHERE m.conversation_id = c.id AND m.user_id = $2
       )
       AND EXISTS (
         SELECT 1 FROM chat_members m
         WHERE m.conversation_id = c.id AND m.user_id = $3
       )
     ORDER BY (c.item_id = $4) DESC, c.updated_at DESC
     LIMIT 1`,
    [offer.id, offer.buyer_id, offer.seller_id, offer.listing_id],
  );
  return dmResult.rows[0]?.id ?? null;
}

function buildOfferPayload(offer: OfferRow): OfferChatCardPayload {
  const offerPrice = Number(offer.offer_price_gbp);
  return {
    offerId: offer.id,
    listingId: offer.listing_id,
    buyerId: offer.buyer_id,
    sellerId: offer.seller_id,
    offerPrice,
    price: offerPrice,
    amount: offerPrice,
    originalPrice: Number(offer.original_price_gbp),
    status: offer.status as OfferChatCardPayload['status'],
    expiresAt: offer.expires_at,
    counterRound: offer.counter_round,
    listingTitle: offer.item_title ?? undefined,
  };
}

/** Fallback/plaintext body. The card UI renders from
 *  `metadata.offerPayload`; the body feeds last-message previews,
 *  notifications and accessibility. Deterministic — the same row always
 *  recomputes the same string (offer price/round are immutable), so a
 *  status sync can carry it in `chat.message.edited` without drifting. */
function offerCardBody(offer: OfferRow): string {
  const amount = formatGbpAmount(Number(offer.offer_price_gbp));
  return offer.counter_round > 0 ? `Counter-offer: ${amount}` : `Offer: ${amount}`;
}

/**
 * Insert the offer's chat card into its conversation and publish
 * `chat.message.created`. Idempotent on the deterministic message id and on
 * the `(conversation_id, sender_user_id, client_message_id)` unique index.
 */
export async function emitOfferChatCard(input: {
  offerId: string;
  queryable?: DbQueryable;
  publish?: typeof publishRealtimeEvent;
  log?: EmitLog;
}): Promise<OfferChatCardResult> {
  const queryable = input.queryable ?? db;
  const publish = input.publish ?? publishRealtimeEvent;
  const log = input.log ?? logger;
  const messageId = offerChatMessageId(input.offerId);

  try {
    const offer = await loadOfferRow(queryable, input.offerId);
    if (!offer) {
      return { emitted: false, conversationId: null, messageId, skippedReason: 'offer_not_found' };
    }

    const conversationId = await resolveOfferConversationId(queryable, offer);
    if (!conversationId) {
      return { emitted: false, conversationId: null, messageId, skippedReason: 'no_conversation' };
    }

    // The card is authored by whoever made this offer — buyer for a fresh
    // offer, either party for a counter. That drives `sender: 'me'` on the
    // author's device and the recipient-only action buttons on the other.
    const senderUserId = offer.offered_by_user_id ?? offer.buyer_id;
    const offerPayload = buildOfferPayload(offer);
    const metadata: Record<string, unknown> = {
      offerCard: true,
      offerPayload,
    };
    const body = offerCardBody(offer);
    const clientMessageId = offerChatClientMessageId(offer.id);

    // PII encryption dual-write — identical to appendSystemChatMessage in
    // routes/chat.ts: encrypt the body; on failure store plaintext so the
    // backfill worker can encrypt later.
    let bodyToStore = body;
    let bodyCiphertext: string | null = null;
    let keyVersion: number | null = null;
    try {
      const encrypted = await encryptMessageBody(messageId, body);
      bodyCiphertext = encrypted.ciphertext;
      keyVersion = encrypted.keyVersion;
      bodyToStore = '[encrypted]';
    } catch (encryptError) {
      log.warn(
        {
          messageId,
          err: encryptError instanceof Error ? encryptError.message : String(encryptError),
        },
        'offerChatCards.encryptFailed — storing plaintext for backfill',
      );
    }

    // Idempotent insert — `ON CONFLICT DO NOTHING` (no target) dedupes on
    // BOTH the deterministic id and the (conversation_id, sender_user_id,
    // client_message_id) partial unique index. Only a row that was actually
    // inserted fans out realtime.
    const insertResult = await queryable.query<{ id: string; created_at: string }>(
      `INSERT INTO chat_messages (
         id,
         conversation_id,
         sender_type,
         sender_user_id,
         sender_bot_id,
         body,
         body_ciphertext,
         key_version,
         metadata,
         client_message_id
       )
       VALUES ($1, $2, 'user', $3, NULL, $4, $5, $6, $7::jsonb, $8)
       ON CONFLICT DO NOTHING
       RETURNING id, created_at::text`,
      [
        messageId,
        conversationId,
        senderUserId,
        bodyToStore,
        bodyCiphertext,
        keyVersion,
        toJsonString(metadata),
        clientMessageId,
      ],
    );
    if (!insertResult.rowCount) {
      return { emitted: false, conversationId, messageId, skippedReason: 'duplicate' };
    }

    await queryable.query(
      `UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationId],
    );

    // Live delivery — same envelope shape as the user-message publish in
    // routes/chat.ts (chat.message.created → chat.conversation:{id}). The
    // clientMessageId lets the author's optimistic echo reconcile in place.
    await publish({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.message.created',
      payload: {
        id: messageId,
        conversationId,
        senderType: 'user',
        senderUserId,
        senderBotId: null,
        body,
        metadata,
        createdAt: insertResult.rows[0].created_at,
        clientMessageId,
        replyToMessageId: null,
      },
    });

    return { emitted: true, conversationId, messageId };
  } catch (error) {
    log.error(
      { err: error, offerId: input.offerId },
      'Failed to emit offer chat card into conversation',
    );
    return { emitted: false, conversationId: null, messageId, skippedReason: 'error' };
  }
}

/**
 * Flip an existing offer card's status to the offer's persisted status and
 * publish `chat.message.edited` carrying the merged offer snapshot so both
 * participants' cards update live.
 *
 * When the card row does not exist yet (offer predates this feature, or the
 * create emit could not resolve a conversation), the sync falls back to a
 * full `emitOfferChatCard` — the card is inserted carrying the current
 * (possibly terminal) status, which is still truthful.
 *
 * The update intentionally does NOT bump `edit_version`/`edited_at`: this is
 * a commerce metadata sync, not a body edit, and the card must not gain an
 * "Edited" marker.
 */
export async function syncOfferChatCardStatus(input: {
  offerId: string;
  queryable?: DbQueryable;
  publish?: typeof publishRealtimeEvent;
  log?: EmitLog;
}): Promise<OfferChatCardResult> {
  const queryable = input.queryable ?? db;
  const publish = input.publish ?? publishRealtimeEvent;
  const log = input.log ?? logger;
  const messageId = offerChatMessageId(input.offerId);

  try {
    const offer = await loadOfferRow(queryable, input.offerId);
    if (!offer) {
      return { emitted: false, conversationId: null, messageId, skippedReason: 'offer_not_found' };
    }

    const existing = await queryable.query<{
      id: string;
      conversation_id: string;
      metadata: Record<string, unknown> | null;
      edit_version: number;
      edited_at: string | null;
    }>(
      `SELECT id, conversation_id, metadata, edit_version, edited_at::text
       FROM chat_messages
       WHERE id = $1
       LIMIT 1`,
      [messageId],
    );

    if (!existing.rowCount) {
      // No card yet — emit one carrying the current (truthful) status.
      return emitOfferChatCard({
        offerId: input.offerId,
        queryable,
        publish,
        log,
      });
    }

    const row = existing.rows[0];
    const offerPayload = buildOfferPayload(offer);
    const existingStatus = (
      (row.metadata?.offerPayload as Record<string, unknown> | undefined)?.status
    );
    if (existingStatus === offerPayload.status) {
      return { emitted: false, conversationId: row.conversation_id, messageId, skippedReason: 'unchanged' };
    }

    // Merge the fresh offer snapshot into the stored metadata. The card's
    // immutable fields (price, parties, round) never change, so a status
    // merge is sufficient — but writing the full snapshot keeps the row
    // self-healing if an earlier emit stored a partial payload.
    const updateResult = await queryable.query<{ metadata: Record<string, unknown> }>(
      `UPDATE chat_messages
       SET metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{offerPayload}',
             $2::jsonb
           )
       WHERE id = $1
       RETURNING metadata`,
      [messageId, toJsonString(offerPayload)],
    );

    const metadata = updateResult.rows[0]?.metadata ?? { offerCard: true, offerPayload };

    await publish({
      topic: `chat.conversation:${row.conversation_id}`,
      type: 'chat.message.edited',
      payload: {
        conversationId: row.conversation_id,
        messageId,
        body: offerCardBody(offer),
        editVersion: row.edit_version,
        editedAt: row.edited_at,
        actorUserId: 'system',
        // The merged offer snapshot — the client treats this as a metadata
        // sync (status flip), not a body edit.
        offer: offerPayload,
        metadata,
      },
    });

    return { emitted: true, conversationId: row.conversation_id, messageId };
  } catch (error) {
    log.error(
      { err: error, offerId: input.offerId },
      'Failed to sync offer chat card status',
    );
    return { emitted: false, conversationId: null, messageId, skippedReason: 'error' };
  }
}
