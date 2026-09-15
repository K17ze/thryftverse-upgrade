/**
 * Order lifecycle → in-thread commerce card emitter.
 *
 * The frontend renders `commerce_state` chat messages as MarketplaceChatCard
 * order-status cards (ChatCommerceCard / CommerceStateCard). The transport is
 * the standard chat pipeline: a `sender_type = 'system'` row in
 * `chat_messages` carrying the order snapshot under `metadata.commerceState`,
 * plus a `chat.message.created` realtime event on `chat.conversation:{id}`.
 *
 * Design rules (marketplace audit P1):
 * - **Truthful.** The emit re-reads the order row and verifies the persisted
 *   status is consistent with the claimed lifecycle state before writing a
 *   card. A stale/racing caller (e.g. a conditional UPDATE that matched zero
 *   rows) silently no-ops instead of lying to the thread.
 * - **System sender.** Cards are `sender_type = 'system'` messages — they are
 *   marketplace truth, not buyer/seller speech.
 * - **Idempotent.** The message id is deterministic
 *   (`chatmsg_order:{orderId}:{stateType}`) and the insert is
 *   `ON CONFLICT (id) DO NOTHING`. Retries, webhook replays and duplicate
 *   admin events can never produce a second card, and the realtime event is
 *   only published when the row was actually inserted.
 * - **Never breaks the order flow.** All errors are caught and logged; the
 *   caller's committed order transition is unaffected.
 */
import { db } from '../db/pool.js';
import { logger } from './logger.js';
import { publishRealtimeEvent } from './realtime.js';
import { encryptMessageBody } from './messageEncryption.js';
import { toJsonString, type DbQueryable } from './workerHelpers.js';

/** Lifecycle states the frontend `commerceState.stateType` union accepts —
 *  mirrors frontend/src/components/chat/CommerceStateCard.tsx CommerceStateType. */
export type OrderCommerceCardState =
  | 'order_placed'
  | 'payment_confirmed'
  | 'label_created'
  | 'order_shipped'
  | 'order_in_transit'
  | 'order_delivered'
  | 'delivery_confirm_prompt'
  | 'feedback_prompt'
  | 'extension_requested'
  | 'order_cancelled'
  | 'order_refunded'
  | 'order_partially_refunded';

type EmitLog = {
  error(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
};

export interface EmitOrderCommerceCardInput {
  orderId: string;
  stateType: OrderCommerceCardState;
  /** Optional overrides — the caller may know fresher values than the row
   *  re-read (e.g. the ship endpoint just resolved provider/tracking). */
  trackingNumber?: string | null;
  carrier?: string | null;
  /** Scoped dedupe suffix for states that can legitimately recur on one
   *  order (e.g. `extension_requested` — each proposal is a distinct event).
   *  The caller supplies a stable id (extension id); the deterministic
   *  message id becomes `chatmsg_order:{orderId}:{stateType}:{eventKey}`.
   *  Omit for once-per-order states. */
  eventKey?: string;
  /** Dispatch-extension snapshot for `extension_requested` cards — lets the
   *  thread state the proposal truthfully without a second fetch. */
  extensionDays?: number;
  proposedShipBy?: string | null;
  /** Refund amount (GBP) carried on `order_refunded` / `order_partially_refunded`
   *  cards so the thread can state the refunded amount truthfully. */
  refundedAmountGbp?: number;
  log?: EmitLog;
  /** Test seam — defaults to the shared pool. */
  queryable?: DbQueryable;
  /** Test seam — defaults to publishRealtimeEvent. */
  publish?: typeof publishRealtimeEvent;
}

export interface EmitOrderCommerceCardResult {
  emitted: boolean;
  conversationId: string | null;
  messageId: string;
  skippedReason?: 'order_not_found' | 'status_mismatch' | 'missing_label' | 'no_conversation' | 'duplicate' | 'extension_not_pending' | 'error';
}

/** Fallback/plaintext body. The card UI renders from `metadata.commerceState`;
 *  the body feeds last-message previews, notifications and accessibility. */
const CARD_BODY: Record<OrderCommerceCardState, string> = {
  order_placed: 'Order placed — checkout reservation started',
  payment_confirmed: 'Payment confirmed',
  label_created: 'Shipping label created — tracking issued',
  order_shipped: 'Order shipped',
  order_in_transit: 'Order in transit',
  order_delivered: 'Order delivered',
  delivery_confirm_prompt: 'Parcel delivered — please confirm receipt',
  feedback_prompt: 'Order complete — leave feedback for the seller',
  extension_requested: 'Seller requested more time to dispatch',
  order_cancelled: 'Order cancelled',
  order_refunded: 'Order refunded',
  order_partially_refunded: 'Partial refund issued',
};

/**
 * Truthfulness guard: the persisted order status must be consistent with the
 * lifecycle state being announced. `order_placed` accepts every status — the
 * row's existence is itself the fact. Terminal back-states are included so a
 * fast lifecycle (e.g. paid then refunded before the drain runs) still tells
 * the truth rather than silently dropping the earlier card.
 */
const STATE_ALLOWED_STATUSES: Record<OrderCommerceCardState, ReadonlySet<string>> = {
  order_placed: new Set([
    'created', 'paid', 'shipped', 'delivered', 'completed',
    'cancelled', 'refunded', 'refunding',
  ]),
  payment_confirmed: new Set(['paid', 'shipped', 'delivered', 'completed', 'refunded', 'refunding']),
  // A label can be generated at payment time (shipment provisioning runs
  // inside the settlement commit) — any paid-or-later status is consistent.
  label_created: new Set(['paid', 'shipped', 'delivered', 'completed']),
  order_shipped: new Set(['shipped', 'delivered', 'completed']),
  order_in_transit: new Set(['shipped', 'delivered', 'completed']),
  order_delivered: new Set(['delivered', 'completed']),
  // The confirm-receipt nudge is only truthful while the order sits in
  // 'delivered' awaiting the buyer — once 'completed' it would ask the
  // buyer to confirm something already confirmed.
  delivery_confirm_prompt: new Set(['delivered']),
  // Review nudge only exists once the order reached its terminal state.
  feedback_prompt: new Set(['completed']),
  // Dispatch extensions can only be proposed while the order is 'paid'
  // (POST /orders/:orderId/dispatch-extension enforces the same gate).
  extension_requested: new Set(['paid']),
  order_cancelled: new Set(['cancelled']),
  order_refunded: new Set(['refunded']),
  // A partial refund leaves the order live — any refundable status is
  // consistent, plus 'refunding'/'refunded' for provider-refund flows that
  // transition the order before the last partial settles.
  order_partially_refunded: new Set([
    'paid', 'shipped', 'delivered', 'completed', 'refunding', 'refunded',
  ]),
};

export async function emitOrderCommerceCard(
  input: EmitOrderCommerceCardInput,
): Promise<EmitOrderCommerceCardResult> {
  const queryable = input.queryable ?? db;
  const publish = input.publish ?? publishRealtimeEvent;
  const log = input.log ?? logger;
  // `eventKey` is a caller-supplied stable id (e.g. the dispatch-extension
  // row id) that lets recurring states dedupe per event instead of per order.
  const eventKey = input.eventKey ? input.eventKey.replace(/[^A-Za-z0-9_-]/g, '') : '';
  const messageId = `chatmsg_order_${input.orderId}_${input.stateType}${eventKey ? `_${eventKey}` : ''}`;

  try {
    // 1. Re-read the order + listing snapshot — the emit is always derived
    //    from durable state, never from caller-supplied claims.
    const orderResult = await queryable.query<{
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
    }>(
      `SELECT o.id, o.buyer_id, o.seller_id, o.listing_id, o.status,
              o.tracking_number, o.shipping_provider, o.shipping_label_url,
              l.title AS item_title,
              COALESCE(
                CASE WHEN cover_media.media_type = 'video' THEN cover_media.poster_url END,
                l.image_url
              ) AS item_image
       FROM orders o
       LEFT JOIN listings l ON l.id = o.listing_id
       LEFT JOIN LATERAL (
         SELECT li.media_type, li.poster_url
         FROM listing_images li
         WHERE li.listing_id = l.id
         ORDER BY li.sort_order, li.created_at
         LIMIT 1
       ) cover_media ON true
       WHERE o.id = $1
       LIMIT 1`,
      [input.orderId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      return { emitted: false, conversationId: null, messageId, skippedReason: 'order_not_found' };
    }
    if (!STATE_ALLOWED_STATUSES[input.stateType].has(order.status)) {
      return { emitted: false, conversationId: null, messageId, skippedReason: 'status_mismatch' };
    }
    // The ship endpoint persists a synthetic `TV-{ORDER_ID}` placeholder when
    // the seller provides no tracking. It is not carrier-issued — never
    // render it as real tracking, and never let it satisfy the label gate.
    const syntheticTracking = `TV-${order.id.toUpperCase()}`;
    const resolvedTrackingRaw = input.trackingNumber ?? order.tracking_number;
    const resolvedTracking = resolvedTrackingRaw === syntheticTracking ? null : resolvedTrackingRaw;
    // `label_created` needs more than a compatible status: a shipping
    // artifact (label document or carrier-issued tracking) must actually be
    // persisted. Tracking/label fields are only written by shipment
    // provisioning before dispatch, so this distinguishes a generated label
    // from a bare paid order — a caller that emits it unconditionally (e.g.
    // next to every payment_confirmed emit) stays truthful for free.
    if (
      input.stateType === 'label_created'
      && !order.shipping_label_url
      && !resolvedTracking
    ) {
      return { emitted: false, conversationId: null, messageId, skippedReason: 'missing_label' };
    }
    // `extension_requested` needs the proposal itself still pending. The emit
    // is post-commit, so a buyer response (accept/decline) landing in the
    // commit→emit gap leaves the order 'paid' — the status gate above still
    // passes — while the card would announce a request already resolved.
    // `eventKey` carries the extension id; when absent, any pending proposal
    // on the order satisfies the check.
    if (input.stateType === 'extension_requested') {
      const extensionResult = eventKey
        ? await queryable.query<{ status: string }>(
            `SELECT status FROM order_dispatch_extensions
             WHERE id = $1 AND order_id = $2
             LIMIT 1`,
            [eventKey, input.orderId],
          )
        : await queryable.query<{ status: string }>(
            `SELECT status FROM order_dispatch_extensions
             WHERE order_id = $1 AND status = 'pending'
             ORDER BY created_at DESC
             LIMIT 1`,
            [input.orderId],
          );
      if (extensionResult.rows[0]?.status !== 'pending') {
        return { emitted: false, conversationId: null, messageId, skippedReason: 'extension_not_pending' };
      }
    }

    // 2. Resolve the buyer–seller conversation. Priority:
    //    a) the thread the offer was negotiated in (listing_offers carries
    //       conversation_id and order_id once accepted);
    //    b) a DM shared by buyer and seller, preferring the thread that
    //       carries this listing's context (chat_conversations.item_id).
    //    No linked conversation → no card (never fabricate a thread).
    //
    //    SECURITY: listing_offers.conversation_id is caller-supplied at offer
    //    creation, so the linked thread is re-verified here — it must be a
    //    `dm` containing BOTH buyer and seller, otherwise order details
    //    (tracking, carrier, item) would leak into an arbitrary conversation.
    const offerLinked = await queryable.query<{ id: string }>(
      `SELECT o.conversation_id AS id
       FROM listing_offers o
       JOIN chat_conversations c ON c.id = o.conversation_id
       WHERE o.order_id = $1
         AND o.conversation_id IS NOT NULL
         AND c.type = 'dm'
         AND EXISTS (
           SELECT 1 FROM chat_members m
           WHERE m.conversation_id = c.id AND m.user_id = $2
         )
         AND EXISTS (
           SELECT 1 FROM chat_members m
           WHERE m.conversation_id = c.id AND m.user_id = $3
         )
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [input.orderId, order.buyer_id, order.seller_id],
    );
    let conversationId = offerLinked.rows[0]?.id ?? null;
    if (!conversationId) {
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
        [input.orderId, order.buyer_id, order.seller_id, order.listing_id],
      );
      conversationId = dmResult.rows[0]?.id ?? null;
    }
    if (!conversationId) {
      return { emitted: false, conversationId: null, messageId, skippedReason: 'no_conversation' };
    }

    // 3. Card payload — the exact contract consumed by
    //    frontend mapApiMessageToConversationMessage / realtimePayloadToMessage
    //    (metadata.commerceState → msg.type 'commerce_state' + msg.commerceState).
    const commerceState = {
      stateType: input.stateType,
      orderId: order.id,
      itemTitle: order.item_title ?? undefined,
      itemImage: order.item_image,
      trackingNumber: resolvedTracking,
      carrier: input.carrier ?? order.shipping_provider,
      extensionDays: input.extensionDays ?? undefined,
      proposedShipBy: input.proposedShipBy ?? undefined,
      refundedAmountGbp: input.refundedAmountGbp ?? undefined,
    };
    const metadata: Record<string, unknown> = {
      commerceCard: true,
      commerceEventKey: `order:${order.id}:${input.stateType}${eventKey ? `:${eventKey}` : ''}`,
      commerceState,
    };
    const body = CARD_BODY[input.stateType];

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
        'orderChatCards.encryptFailed — storing plaintext for backfill',
      );
    }

    // 4. Idempotent insert — the deterministic id is the dedupe. Only a row
    //    that was actually inserted fans out realtime.
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
         metadata
       )
       VALUES ($1, $2, 'system', NULL, NULL, $3, $4, $5, $6::jsonb)
       ON CONFLICT (id) DO NOTHING
       RETURNING id, created_at::text`,
      [
        messageId,
        conversationId,
        bodyToStore,
        bodyCiphertext,
        keyVersion,
        toJsonString(metadata),
      ],
    );
    if (!insertResult.rowCount) {
      return { emitted: false, conversationId, messageId, skippedReason: 'duplicate' };
    }

    // 5. Live delivery — same envelope shape as the user-message publish in
    //    routes/chat.ts (chat.message.created → chat.conversation:{id}).
    await publish({
      topic: `chat.conversation:${conversationId}`,
      type: 'chat.message.created',
      payload: {
        id: messageId,
        conversationId,
        senderType: 'system',
        senderUserId: null,
        senderBotId: null,
        body,
        metadata,
        createdAt: insertResult.rows[0].created_at,
        clientMessageId: null,
        replyToMessageId: null,
      },
    });

    return { emitted: true, conversationId, messageId };
  } catch (error) {
    log.error(
      { err: error, orderId: input.orderId, stateType: input.stateType },
      'Failed to emit order commerce card into conversation',
    );
    return { emitted: false, conversationId: null, messageId, skippedReason: 'error' };
  }
}
