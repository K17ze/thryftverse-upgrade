import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { publishRealtimeEvent } from '../lib/realtime.js';
import { createApiError, ledgerTablesAvailable, type DbQueryable } from '../lib/workerHelpers.js';
import { emitOrderCommerceCard } from '../lib/orderChatCards.js';
import { postAuctionSettlementLedgerEntries } from '../lib/workerRuntime.js';
import { advanceSecondChanceOffer } from '../workers/handlers/auctionSweepHandler.js';
import { getSellerReach } from '../lib/sellerReach.js';
import { isPostgresUniqueViolation } from '../lib/walletMoneyPath.js';
import { cancelOrderOnReservationExpiry } from '../lib/commerceCheckoutLifecycle.js';

import { resolveCountryCapabilities } from '../lib/countryCapabilities.js';
import { getAllowedGatewayIds } from '../lib/countryCapabilityPolicy.js';

// ── Local helpers ──

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const AUCTION_PLATFORM_FEE_RATE = 0.03;

function calculateAuctionPlatformFeeGbp(winningBidGbp: number): number {
  return roundTo(Math.max(0, winningBidGbp) * AUCTION_PLATFORM_FEE_RATE, 2);
}

// ── Dependency injection ──

/** Result of the verified auction-win settlement (FIN-01). */
export type AuctionWinSettlement = {
  auctionId: string;
  listingId: string;
  orderId: string;
  winnerBidderId: string;
  sellerId: string;
  winningBidGbp: number;
  platformFeeGbp: number;
  alreadySettled: boolean;
};

export type AuctionWinSettlementResult =
  | { kind: 'not_auction_intent' }
  | { kind: 'settled'; settlement: AuctionWinSettlement }
  | { kind: 'skipped'; reason: string };

/** Input forwarded to the canonical POST /payments/intents flow. */
export type AuctionPaymentIntentInput = {
  authorizationHeader: string | null;
  money: { currency: string; minorAmount: string };
  idempotencyKey: string;
  instrumentId?: number;
  /**
   * The payer's resolved PUBLIC commerce gateway. Auction wins must never
   * default to an internal settlement rail (oneze_internal parks at
   * requires_confirmation with no user path to succeeded).
   */
  gatewayId?: string;
  metadata: Record<string, unknown>;
};

type AuctionLifecycleRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  queueUserNotification: (input: {
    userId: string;
    title: string;
    body: string;
    eventType: string;
    payload: Record<string, unknown>;
    route: Record<string, unknown>;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }) => Promise<string | null>;
  /**
   * Creates/reuses the payment intent through the canonical
   * POST /payments/intents flow. Defaults to an in-process dispatch on the
   * same Fastify instance so every compliance, capability, idempotency and
   * provider phase of the canonical route is reused verbatim. Tests inject
   * a stub instead of a live route.
   */
  createAuctionPaymentIntent?: (
    input: AuctionPaymentIntentInput
  ) => Promise<{ statusCode: number; body: unknown }>;
  /**
   * Post-commit settlement effects (realtime fanout, in-thread commerce
   * cards, seller notification). Defaults to the production emitters; tests
   * inject a spy so no Redis/DB side effects are required.
   */
  onAuctionSettled?: (
    settlement: AuctionWinSettlement,
    ctx: {
      log: {
        error: (obj: Record<string, unknown>, msg: string) => void;
        warn: (obj: Record<string, unknown>, msg: string) => void;
      };
    }
  ) => Promise<void>;
};

// ── Auction lifecycle endpoints ──────────────────────────────────
//
// The read/create/watch surface formerly exported here as
// registerAuctionRoutes was a dead mirror — every route in it is
// registered inline in index.ts. It was removed; mounting it would
// have crashed boot on duplicate registrations. This registrar
// exposes ONLY the lifecycle endpoints that have no inline
// equivalent — it is safe to mount alongside the inline auction
// routes without any route collisions.

// ── Verified auction-win settlement (FIN-01) ───────────────────────────
// An auction may only transition to paid/settled when an AUTHORITATIVE
// provider capture exists: a payment_intents row that reached 'succeeded'
// inside settlePaymentIntent() — a state written exclusively by verified
// provider webhooks or the admin maker-checker confirm path. The winner's
// POST /payment request therefore only creates/reuses the provider intent
// (through the canonical /payments/intents flow) and reports 'pending';
// this helper performs the actual settle — auction status, listing sold,
// paid-order insert and ledger post — and is invoked from:
//   1. the provider webhook route inside the same transaction that marked
//      the intent succeeded (primary path);
//   2. the winner-pay replay / payment-status endpoints below, which close
//      any gap where an intent settled through a route that did not run the
//      webhook hook (manual confirm, mock webhook, DLQ replay).
// Everything downstream of intent.status='succeeded' is idempotent: the
// auctions row is guarded by paid_at IS NULL and the order insert by the
// existing auction order, so duplicate or out-of-order deliveries produce
// exactly one settlement.

export async function settleAuctionWinForVerifiedIntent(
  client: DbQueryable,
  intentId: string,
): Promise<AuctionWinSettlementResult> {
  const intentResult = await client.query<{
    id: string;
    user_id: string;
    status: string;
    amount_gbp: number | string;
    order_id: string | null;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT id, user_id, status, amount_gbp, order_id, metadata
     FROM payment_intents
     WHERE id = $1
     LIMIT 1
     FOR UPDATE`,
    [intentId],
  );

  const intent = intentResult.rows[0];
  if (!intent) {
    return { kind: 'not_auction_intent' };
  }

  const metadata = intent.metadata ?? {};
  const auctionId = typeof metadata.auctionId === 'string' ? metadata.auctionId : null;
  if (!auctionId) {
    return { kind: 'not_auction_intent' };
  }

  // Only a provider-verified capture may settle the auction. Any other
  // intent state leaves the auction exactly where it was.
  if (intent.status !== 'succeeded') {
    return { kind: 'skipped', reason: `intent_status:${intent.status}` };
  }

  const auctionResult = await client.query<{
    id: string;
    seller_id: string;
    listing_id: string;
    status: string;
    winner_bidder_id: string | null;
    current_bid_gbp: number | string;
    cancelled_at: string | null;
    settled_at: string | null;
    paid_at: string | null;
  }>(
    `SELECT id, seller_id, listing_id, status, winner_bidder_id,
            current_bid_gbp, cancelled_at, settled_at, paid_at
     FROM auctions WHERE id = $1 FOR UPDATE`,
    [auctionId],
  );

  const auction = auctionResult.rows[0];
  if (!auction) {
    return { kind: 'skipped', reason: 'auction_not_found' };
  }

  // Order resolution prefers the intent's canonical binding — orders
  // created after the first attempt no longer claim orders.auction_id
  // (the partial unique index allows exactly one claimant), so a retried
  // winner's order is found via payment_intents.order_id. Fall back to the
  // auction_id claimant for rows written before the binding existed.
  const resolveExistingOrderId = async (): Promise<string | null> => {
    if (intent.order_id) {
      return intent.order_id;
    }
    const existing = await client.query<{ id: string }>(
      `SELECT o.id
       FROM orders o
       LEFT JOIN payment_intents pi ON pi.order_id = o.id
       WHERE o.auction_id = $1
          OR pi.metadata->>'auctionId' = $1
       ORDER BY CASE WHEN o.status = 'paid' THEN 0
                     WHEN o.status = 'created' THEN 1
                     ELSE 2 END,
                o.created_at DESC
       LIMIT 1`,
      [auctionId],
    );
    return existing.rows[0]?.id ?? null;
  };

  const winningBidGbp = Number(auction.current_bid_gbp);
  const platformFeeGbp = calculateAuctionPlatformFeeGbp(winningBidGbp);

  if (auction.settled_at || auction.status === 'settled' || auction.paid_at) {
    // Idempotent replay — the authoritative transition already happened.
    return {
      kind: 'settled',
      settlement: {
        auctionId,
        listingId: auction.listing_id,
        orderId: (await resolveExistingOrderId()) ?? '',
        winnerBidderId: auction.winner_bidder_id ?? '',
        sellerId: auction.seller_id,
        winningBidGbp,
        platformFeeGbp,
        alreadySettled: true,
      },
    };
  }

  if (auction.cancelled_at) {
    return { kind: 'skipped', reason: 'auction_cancelled' };
  }
  if (auction.status !== 'awaiting_payment' && auction.status !== 'payment_expired') {
    return { kind: 'skipped', reason: `auction_status:${auction.status}` };
  }

  // Winner binding is REQUIRED, not defaulted: the auctionId/winnerBidderId
  // metadata pair is written exclusively by the winner-pay route AFTER the
  // canonical intent mint (reserved keys are stripped from client payloads
  // at ingest), so an intent carrying auctionId without winnerBidderId was
  // never legitimately bound. If the auction moved on (payment expiry →
  // second-chance offer), captured funds do NOT settle against the wrong
  // bidder — the orphaned capture is left for reconciliation.
  const boundWinner = typeof metadata.winnerBidderId === 'string' ? metadata.winnerBidderId : null;
  if (!boundWinner) {
    return { kind: 'skipped', reason: 'winner_binding_missing' };
  }
  if (!auction.winner_bidder_id) {
    return { kind: 'skipped', reason: 'no_winner' };
  }
  if (boundWinner !== auction.winner_bidder_id) {
    return { kind: 'skipped', reason: 'winner_mismatch' };
  }

  // Payer binding: the capture must have been authorised by the bound
  // winner — or by an admin acting on their behalf (initiatedByRole is
  // server-written; clients cannot set it). A third party can never settle
  // someone else's auction win with their own capture.
  if (
    intent.user_id !== auction.winner_bidder_id
    && metadata.initiatedByRole !== 'admin'
  ) {
    return { kind: 'skipped', reason: 'payer_not_winner' };
  }

  // Amount binding: the captured amount must equal the authoritative
  // winning bid — never trust client-supplied money at settle time.
  if (Math.abs(Number(intent.amount_gbp) - winningBidGbp) >= 0.005) {
    return { kind: 'skipped', reason: 'amount_mismatch' };
  }

  // Seller reach at the money-moving point: the winner-pay route gates
  // intent minting on reach, but a seller suspended BETWEEN mint and the
  // provider capture must still not take the funds — the captured money is
  // left for reconciliation (refund path), never settled into escrow.
  const sellerReach = await getSellerReach(client, auction.seller_id);
  if (sellerReach?.state === 'suspended') {
    return { kind: 'skipped', reason: 'seller_suspended' };
  }

  // ── Canonical order binding (SEP21-FIN-C) ──────────────────────────
  // Winner-pay mints the order BEFORE the provider intent, and the binding
  // write sets payment_intents.order_id. The canonical commerce branch of
  // settlePaymentIntent() then transitions that order 'created' → 'paid'
  // and posts the escrow-hold ledger inside THIS capture transaction —
  // which runs before this helper. A bound order that is not 'paid' here
  // means the canonical transition refused it (dead reservation, orphan
  // flag) — the captured funds belong to reconciliation, not settlement.
  let canonicalOrderId: string | null = null;
  if (intent.order_id) {
    const boundOrder = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM orders WHERE id = $1 LIMIT 1`,
      [intent.order_id],
    );
    const boundStatus = boundOrder.rows[0]?.status ?? null;
    if (boundStatus !== 'paid') {
      return {
        kind: 'skipped',
        reason: `order_not_payable:${boundStatus ?? 'missing'}`,
      };
    }
    canonicalOrderId = intent.order_id;
  }

  const settledUpdate = await client.query(
    `UPDATE auctions
     SET status = 'settled', settled_at = NOW(), paid_at = NOW(),
         payment_confirmed_by = $2,
         payment_method_id = $3,
         updated_at = NOW()
     WHERE id = $1 AND paid_at IS NULL`,
    [
      auctionId,
      intent.user_id,
      typeof metadata.paymentMethodId === 'number' ? metadata.paymentMethodId : null,
    ],
  );

  if (!settledUpdate.rowCount) {
    // A concurrent settle won the paid_at guard — replay the stored result.
    return {
      kind: 'settled',
      settlement: {
        auctionId,
        listingId: auction.listing_id,
        orderId: (await resolveExistingOrderId()) ?? '',
        winnerBidderId: auction.winner_bidder_id,
        sellerId: auction.seller_id,
        winningBidGbp,
        platformFeeGbp,
        alreadySettled: true,
      },
    };
  }

  // Mark listing as sold — payment is now provider-confirmed.
  await client.query(
    `UPDATE listings SET status = 'sold', pause_source = NULL, updated_at = NOW() WHERE id = $1`,
    [auction.listing_id],
  );

  if (canonicalOrderId) {
    // Order-bound capture: settlePaymentIntent() already transitioned the
    // order 'created' → 'paid' and posted the escrow-hold ledger through
    // postCommerceOrderLedgerEntries inside this same transaction.
    // Seller-net stays held in escrow until
    // releaseCommerceOrderEscrowToSeller() runs at delivery/protection-hold
    // release, so a refund or dispute before delivery never races an
    // already-released payout. No auction-specific ledger legs here.
    return {
      kind: 'settled',
      settlement: {
        auctionId,
        listingId: auction.listing_id,
        orderId: canonicalOrderId,
        winnerBidderId: auction.winner_bidder_id,
        sellerId: auction.seller_id,
        winningBidGbp,
        platformFeeGbp,
        alreadySettled: false,
      },
    };
  }

  // ── Legacy fallback (compatibility only) ───────────────────────────
  // Intents minted before the canonical order binding (order_id IS NULL)
  // still settle here. Recreate the paid order + post the corrected,
  // currency-consistent escrow-hold legs so the capture is accounted.
  // New intents never reach this branch.
  // The persisted order wins on replay — the constructed id must not leak
  // into cards, notifications or the response when an order already exists.
  const orderId = `auc-pay-${auctionId}-${intentId.slice(-12)}`;
  const auctionOrderClaim = await client.query<{ id: string; status: string }>(
    `SELECT id, status FROM orders WHERE auction_id = $1 LIMIT 1`,
    [auctionId],
  );

  let effectiveOrderId: string;
  if (auctionOrderClaim.rows[0]?.status === 'paid') {
    effectiveOrderId = auctionOrderClaim.rows[0].id;
  } else {
    // Another order (a buy-now purchase or a drifted first attempt) may
    // already claim orders.auction_id — only claim it when free, so this
    // insert can never trip the partial unique index.
    const claimAuctionId = auctionOrderClaim.rows[0] ? null : auctionId;
    const sellerNetGbp = roundTo(Math.max(0, winningBidGbp - platformFeeGbp), 2);
    await client.query(
      `INSERT INTO orders (id, buyer_id, seller_id, listing_id, subtotal_gbp,
         buyer_protection_fee_gbp, total_gbp, status, auction_id, payment_intent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'paid', $8, $9)`,
      [orderId, auction.winner_bidder_id, auction.seller_id, auction.listing_id, sellerNetGbp, platformFeeGbp, winningBidGbp, claimAuctionId, intentId],
    );
    effectiveOrderId = orderId;
  }

  // Post the corrected auction ledger legs — GBP-consistent, escrow-held.
  // sourceId keys on the order so refund reversals and the canonical
  // delivery release reconcile against the same source.
  const canPostLedger = await ledgerTablesAvailable(client);
  if (canPostLedger) {
    await postAuctionSettlementLedgerEntries(client, {
      auctionId,
      buyerId: auction.winner_bidder_id,
      sellerId: auction.seller_id,
      winningBidGbp,
      platformFeeGbp,
      orderId: effectiveOrderId,
    });
  }

  return {
    kind: 'settled',
    settlement: {
      auctionId,
      listingId: auction.listing_id,
      orderId: effectiveOrderId,
      winnerBidderId: auction.winner_bidder_id,
      sellerId: auction.seller_id,
      winningBidGbp,
      platformFeeGbp,
      alreadySettled: false,
    },
  };
}

export const registerAuctionLifecycleRoutes = ({
  app,
  db,
  queueUserNotification,
  createAuctionPaymentIntent: injectedCreateIntent,
  onAuctionSettled: injectedOnAuctionSettled,
}: AuctionLifecycleRouteDependencies) => {

// Canonical payment-intent creation reuses the deployed
// POST /payments/intents route verbatim: compliance profile, country
// capability, gateway resolution, phased commit and provider I/O all stay
// in the owning layer. The dispatch is in-process (Fastify inject) — no
// socket, no duplicated provider code — and forwards the caller's bearer
// token so the canonical route authenticates the same user.
const createAuctionPaymentIntent =
  injectedCreateIntent
  ?? (async (input: AuctionPaymentIntentInput) => {
      const response = await app.inject({
        method: 'POST',
        url: '/payments/intents',
        headers: {
          'content-type': 'application/json',
          ...(input.authorizationHeader
            ? { authorization: input.authorizationHeader }
            : {}),
        },
        payload: {
          channel: 'commerce',
          money: input.money,
          idempotencyKey: input.idempotencyKey,
          ...(input.instrumentId ? { instrumentId: input.instrumentId } : {}),
          ...(input.gatewayId ? { gatewayId: input.gatewayId } : {}),
          metadata: input.metadata,
        },
      });
      return {
        statusCode: response.statusCode,
        body: response.json() as unknown,
      };
    });

// Post-commit effects for a verified auction settlement: realtime fanout,
// in-thread commerce cards and the seller notification. Everything here is
// best-effort — the authoritative transition already committed.
const emitAuctionSettlementEffects =
  injectedOnAuctionSettled
  ?? (async (settlement: AuctionWinSettlement, ctx: {
      log: {
        error: (obj: Record<string, unknown>, msg: string) => void;
        warn: (obj: Record<string, unknown>, msg: string) => void;
      };
    }) => {
      try {
        await publishRealtimeEvent({
          topic: `auction:${settlement.auctionId}`,
          type: 'auction.settled',
          payload: {
            auctionId: settlement.auctionId,
            listingId: settlement.listingId,
            winnerBidderId: settlement.winnerBidderId,
            winnerAmountGbp: settlement.winningBidGbp,
            platformFeeRate: AUCTION_PLATFORM_FEE_RATE,
            platformFeeGbp: settlement.platformFeeGbp,
            reason: 'payment_confirmed',
          },
          seq: true,
          version: 1,
        });
      } catch (error) {
        ctx.log.error({ err: error, auctionId: settlement.auctionId }, 'Failed to publish auction settlement event');
      }

      // In-thread commerce cards: the winning-bid order was created already
      // paid — emit both lifecycle beats so the thread reads truthfully.
      // Idempotent replays are deduped by the deterministic message ids.
      try {
        await emitOrderCommerceCard({
          orderId: settlement.orderId,
          stateType: 'order_placed',
          log: ctx.log,
        });
        await emitOrderCommerceCard({
          orderId: settlement.orderId,
          stateType: 'payment_confirmed',
          log: ctx.log,
        });
      } catch (error) {
        ctx.log.error({ err: error, orderId: settlement.orderId }, 'Failed to emit auction order commerce cards');
      }

      try {
        await queueUserNotification({
          userId: settlement.sellerId,
          title: 'Payment received',
          body: `Payment of £${settlement.winningBidGbp.toFixed(2)} received for ${settlement.auctionId}. The auction is settled.`,
          eventType: 'auction_sold',
          payload: { auctionId: settlement.auctionId, event: 'auction_payment_confirmed', orderId: settlement.orderId },
          route: { screen: 'AuctionDetail', params: { auctionId: settlement.auctionId } },
          idempotencyKey: `auction-payment-${settlement.auctionId}`,
        });
      } catch (error) {
        ctx.log.error({ err: error, auctionId: settlement.auctionId }, 'Failed to queue payment notification');
      }
    });

// Runs the verified settlement inside its own transaction — used by the
// winner-pay replay and self-heal paths where no ambient tx exists (the
// provider webhook route instead joins its own transaction directly).
const runVerifiedAuctionSettlement = async (
  pool: Pool,
  intentId: string,
): Promise<AuctionWinSettlementResult> => {
  const settleClient = await pool.connect();
  try {
    await settleClient.query('BEGIN');
    const result = await settleAuctionWinForVerifiedIntent(settleClient, intentId);
    await settleClient.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await settleClient.query('ROLLBACK');
    } catch {
      // Already aborted — nothing more to do.
    }
    throw error;
  } finally {
    settleClient.release();
  }
};

// ── Unknown-outcome reconciliation for auction bids ────────────────
//
// GET /users/me/auction-bids/lookup-by-key/:idempotencyKey
//
// When a client sends POST /auctions/:auctionId/bids but the response is
// lost (network timeout), the outcome is ambiguous — the bid may or may
// not have been placed. This endpoint resolves the ambiguity by looking
// up the bid by its idempotency key. Returns:
//   - 200 { ok: true, status: 'acknowledged', bid }
//   - 404 { ok: false, status: 'safe_to_retry' }
app.get('/users/me/auction-bids/lookup-by-key/:idempotencyKey', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const bidderId = request.authUser.userId;
  const { idempotencyKey } = z.object({
    idempotencyKey: z.string().min(2).max(200),
  }).parse(request.params);

  const result = await db.query<{
    id: number;
    auction_id: string;
    bidder_id: string;
    amount_gbp: number | string;
    is_proxy: boolean;
    max_bid_gbp: number | string | null;
    idempotency_key: string | null;
    created_at: string;
  }>(
    `SELECT id, auction_id, bidder_id, amount_gbp,
            is_proxy, max_bid_gbp, idempotency_key, created_at
     FROM auction_bids
     WHERE bidder_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [bidderId, idempotencyKey],
  );

  if (!result.rowCount) {
    reply.code(404);
    return { ok: false, status: 'safe_to_retry' as const };
  }

  const row = result.rows[0];
  return {
    ok: true as const,
    status: 'acknowledged' as const,
    bid: {
      id: row.id,
      auctionId: row.auction_id,
      amountGbp: Number(row.amount_gbp),
      isProxy: row.is_proxy,
      maxBidGbp: row.max_bid_gbp !== null ? Number(row.max_bid_gbp) : null,
      createdAt: row.created_at,
    },
  };
});

// ── T20: Seller cancellation ──────────────────────────────────────
// Allows a seller to cancel an auction that is not yet terminal.
// Notifies all bidders and reactivates the listing.

app.post('/auctions/:auctionId/cancel', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const bodySchema = z.object({
    reason: z.string().min(1).max(500).optional(),
  });

  const { auctionId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});
  const userId = request.authUser.userId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query<{
      id: string;
      seller_id: string;
      listing_id: string;
      status: string;
      cancelled_at: string | null;
      settled_at: string | null;
      winner_bidder_id: string | null;
    }>(
      `SELECT id, seller_id, listing_id, status, cancelled_at, settled_at, winner_bidder_id
       FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId],
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    if (auction.seller_id !== userId && request.authUser.role !== 'admin') {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Only the seller can cancel this auction', code: 'SELLER_RESTRICTED' };
    }

    if (auction.cancelled_at) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Auction already cancelled', code: 'AUCTION_CANCELLED' };
    }

    if (auction.settled_at || auction.status === 'settled') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Cannot cancel a settled auction', code: 'AUCTION_SETTLED' };
    }

    // Block cancellation after payment is confirmed or awaiting payment
    if (auction.status === 'awaiting_payment' || auction.winner_bidder_id) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Cannot cancel an auction with a confirmed winner', code: 'AUCTION_HAS_WINNER' };
    }

    // Cancel the auction and reactivate the listing
    await client.query(
      `UPDATE auctions
       SET cancelled_at = NOW(), cancelled_by = $2, cancelled_reason = $3,
           status = 'ended', updated_at = NOW()
       WHERE id = $1`,
      [auctionId, userId, payload.reason ?? null],
    );
    await client.query(
      `UPDATE listings SET status = 'active', pause_source = NULL, updated_at = NOW()
       WHERE id = $1 AND status = 'paused' AND pause_source = 'auction'`,
      [auction.listing_id],
    );

    // Notify all bidders
    const bidders = await client.query<{ bidder_id: string }>(
      `SELECT DISTINCT bidder_id FROM auction_bids WHERE auction_id = $1`,
      [auctionId],
    );

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `auction:${auctionId}`,
      type: 'auction.cancelled',
      payload: {
        auctionId,
        listingId: auction.listing_id,
        cancelledBy: userId,
        reason: payload.reason ?? null,
      },
      seq: true,
      version: 1,
    });

    for (const row of bidders.rows) {
      try {
        await queueUserNotification({
          userId: row.bidder_id,
          title: 'Auction cancelled',
          body: payload.reason
            ? `The seller cancelled this auction: ${payload.reason}`
            : 'The seller has cancelled this auction.',
          eventType: 'auction_cancelled',
          payload: { auctionId, event: 'auction_cancelled' },
          route: { screen: 'AuctionDetail', params: { auctionId } },
          idempotencyKey: `auction-cancel-${auctionId}-${row.bidder_id}`,
        });
      } catch (error) {
        request.log.error({ err: error, auctionId }, 'Failed to queue cancellation notification');
      }
    }

    return { ok: true, auctionId, cancelledAt: new Date().toISOString() };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return { ok: false, error: `Unable to cancel auction: ${(error as Error).message}` };
  } finally {
    client.release();
  }
});


// ── T20: Winner payment — pending → provider-verified paid ─────────────
// The winner initiates payment. The endpoint authenticates the winner,
// creates/reuses a payment intent through the canonical
// POST /payments/intents flow (same compliance, gateway resolution,
// idempotency and provider phases as checkout), and returns 'pending'
// with the intent's clientSecret/nextActionUrl. The auction transitions
// to settled ONLY inside settleAuctionWinForVerifiedIntent() once the
// provider confirms capture via a verified webhook (or an equivalent
// authoritative channel). FIN-09: a duplicate winner request — whether it
// lands before capture or after settlement — replays the stored result
// instead of failing on a guard.

type StoredAuctionPaymentIntent = {
  id: string;
  user_id: string;
  status: string;
  gateway_id: string;
  client_secret: string | null;
  next_action_url: string | null;
  provider_status: string | null;
  failure_code: string | null;
  failure_message: string | null;
};

const INTENT_TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

// The provider confirmation secret is emitted ONLY to the intent owner —
// a seller (or admin) polling payment-status must never receive a
// client_secret/nextActionUrl they could use to drive the buyer's capture.
function toAuctionIntentPayload(
  row: StoredAuctionPaymentIntent,
  opts?: { revealSecrets?: boolean },
) {
  const revealSecrets = opts?.revealSecrets === true;
  return {
    id: row.id,
    status: row.status,
    gatewayId: row.gateway_id,
    clientSecret: revealSecrets ? row.client_secret : null,
    nextActionUrl: revealSecrets ? row.next_action_url : null,
    providerStatus: row.provider_status,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
  };
}

app.post('/auctions/:auctionId/payment', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const bodySchema = z.object({
    idempotencyKey: z.string().min(4).max(140),
    paymentMethodId: z.number().int().positive().optional(),
  });

  const { auctionId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);
  const userId = request.authUser.userId;

  // ── Phase A: guarded read — auction lock + stored payment state ──────
  // No provider I/O happens while the FOR UPDATE lock is held; the
  // canonical intent route runs its own transaction in Phase C.
  const client = await db.connect();
  let latestIntent: StoredAuctionPaymentIntent | null = null;
  let winningBidGbp = 0;
  let auctionSellerId = '';
  let auctionListingId = '';
  let winnerBidderId: string | null = null;
  // Canonical order bound to the provider capture (SEP21-FIN-C) —
  // provisioned under the auction lock in Phase A, bound in Phase D.
  let auctionOrderId: string | null = null;
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query<{
      id: string;
      seller_id: string;
      listing_id: string;
      status: string;
      winner_bidder_id: string | null;
      current_bid_gbp: number | string;
      cancelled_at: string | null;
      settled_at: string | null;
      paid_at: string | null;
      payment_deadline_at: string | null;
    }>(
      `SELECT id, seller_id, listing_id, status, winner_bidder_id,
              current_bid_gbp, cancelled_at, settled_at, paid_at,
              payment_deadline_at
       FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId],
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    // Only the winner (or admin) can initiate or replay payment. The gate
    // runs BEFORE the settled-replay below — a non-winner must not learn
    // the winner's orderId/settlement state from a replayed response.
    if (auction.winner_bidder_id !== userId && request.authUser.role !== 'admin') {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Only the winner can pay for this auction', code: 'WINNER_RESTRICTED' };
    }

    if (auction.cancelled_at) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Auction cancelled', code: 'AUCTION_CANCELLED' };
    }

    if (auction.settled_at || auction.status === 'settled' || auction.paid_at) {
      // FIN-09: an already-successful retry replays the authoritative
      // stored result instead of failing on the settled guard.
      // Retry orders no longer claim orders.auction_id, so resolve via the
      // intent binding too and prefer the paid row.
      const existingOrder = await client.query<{ id: string }>(
        `SELECT o.id
         FROM orders o
         LEFT JOIN payment_intents pi ON pi.order_id = o.id
         WHERE o.auction_id = $1
            OR pi.metadata->>'auctionId' = $1
         ORDER BY CASE WHEN o.status = 'paid' THEN 0 ELSE 1 END,
                  o.created_at DESC
         LIMIT 1`,
        [auctionId],
      );
      await client.query('COMMIT');
      return {
        ok: true,
        paymentStatus: 'paid' as const,
        orderId: existingOrder.rows[0]?.id,
        auction: {
          id: auctionId,
          status: 'settled' as const,
          settledAt: auction.settled_at,
          paidAt: auction.paid_at,
        },
      };
    }

    if (auction.status !== 'awaiting_payment' && auction.status !== 'payment_expired') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Auction is not awaiting payment', code: 'NOT_AWAITING_PAYMENT' };
    }

    // Seller reach (lib/sellerReach.ts): minting a payment intent is the
    // order-bind point — a seller suspended after the auction was won must
    // not take the winner's money. 'limited' does not block payment.
    const sellerReach = await getSellerReach(client, auction.seller_id);
    if (sellerReach?.state === 'suspended') {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: 'This seller is currently restricted — this auction cannot be paid',
        code: 'SELLER_RESTRICTED',
      };
    }

    winningBidGbp = Number(auction.current_bid_gbp);
    auctionSellerId = auction.seller_id;
    auctionListingId = auction.listing_id;
    winnerBidderId = auction.winner_bidder_id;

    // In-flight / stored payment attempt bound to this auction's CURRENT
    // winner (metadata.winnerBidderId — an intent minted for a previous
    // winner never replays to a second-chance successor). A non-terminal
    // intent is replayed (one active attempt per winner — prevents double
    // capture across sessions/idempotency keys); a succeeded intent
    // self-heals the auction settle below; a terminal failure falls
    // through so a NEW idempotency key can mint a fresh attempt (the
    // canonical route replays the stored one for a same-key retry).
    const intentResult = await client.query<StoredAuctionPaymentIntent>(
      `SELECT id, user_id, status, gateway_id, client_secret, next_action_url,
              provider_status, failure_code, failure_message
       FROM payment_intents
       WHERE metadata->>'auctionId' = $1
         AND metadata->>'winnerBidderId' = $2
         -- Defense-in-depth: a winner-bound intent is always owned by the
         -- winner, so this is a no-op for legitimate rows — but it hard-fails
         -- any residual path that lands binding metadata on another user's
         -- intent.
         AND user_id = $2
       ORDER BY CASE
                  WHEN status = 'succeeded' THEN 0
                  WHEN status IN ('failed', 'cancelled') THEN 2
                  ELSE 1
                END,
                created_at DESC
       LIMIT 1`,
      [auctionId, auction.winner_bidder_id ?? userId],
    );
    latestIntent = intentResult.rows[0] ?? null;

    // ── Phase A2 (SEP21-FIN-C): provision the canonical commerce order ──
    // The provider intent must capture against a REAL orders row so the
    // verified settle walks the canonical commerce branch (order
    // 'created'→'paid' → escrow hold → fulfilment → protection release)
    // instead of the after-the-fact auction ledger. The order therefore
    // exists BEFORE the intent is minted, carrying the intended shipping
    // address, postage and buyer-protection terms, plus the active
    // 'auction'-source reservation the order status trigger requires for
    // a 'paid' transition. Everything here runs under the auction
    // FOR UPDATE lock, so concurrent winner-pay requests serialise on a
    // single winner, a single reusable order and a single reservation.
    // Mint only when Phase B won't replay: no stored intent, or a terminal
    // FAILURE — a 'succeeded' intent self-heals below and must not spawn a
    // fresh order.
    const willMintIntent =
      !latestIntent
      || latestIntent.status === 'failed'
      || latestIntent.status === 'cancelled';
    if (willMintIntent) {
      const payableBuyerId = winnerBidderId ?? userId;

      // Every order row this auction win has ever produced: the first
      // attempt's order claims orders.auction_id; retry orders are found
      // through the intent binding (the partial unique index allows only
      // one claimant, so retries carry auction_id = NULL).
      const priorOrders = await client.query<{
        id: string;
        buyer_id: string;
        status: string;
      }>(
        `SELECT DISTINCT o.id, o.buyer_id, o.status, o.created_at
         FROM orders o
         LEFT JOIN payment_intents pi ON pi.order_id = o.id
         WHERE o.auction_id = $1
            OR pi.metadata->>'auctionId' = $1
         ORDER BY o.created_at ASC`,
        [auctionId],
      );

      // A still-'created' order owned by the payable winner is this retry's
      // order — reuse it instead of stacking dead order rows.
      const reusableOrder = priorOrders.rows.find(
        (row) => row.status === 'created' && row.buyer_id === payableBuyerId,
      );

      // Retire every other order row before writing ours: 'created' orders
      // go through the guarded cancel path (in-flight intents shield them,
      // the order trigger cancels their reservation); terminal orders get
      // any drifted-active reservation cancelled so the listing-level
      // active-reservation unique index can never block the winner's row.
      for (const stale of priorOrders.rows) {
        if (stale.id === reusableOrder?.id) continue;
        if (stale.status === 'created') {
          const cancelOutcome = await cancelOrderOnReservationExpiry(client, stale.id);
          if (cancelOutcome === 'blocked_in_flight') {
            await client.query('ROLLBACK');
            reply.code(409);
            return {
              ok: false,
              error: 'A checkout for this listing is still resolving — retry shortly',
              code: 'ORDER_IN_FLIGHT',
            };
          }
        } else {
          await client.query(
            `UPDATE listing_checkout_reservations
             SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
             WHERE order_id = $1 AND status = 'active'`,
            [stale.id],
          );
        }
      }

      // Intended delivery address: the winner's default address if one is
      // saved — the order thread lets them redirect it post-capture.
      const defaultAddress = await client.query<{ id: number }>(
        `SELECT id FROM user_addresses
         WHERE user_id = $1
         ORDER BY is_default DESC, updated_at DESC
         LIMIT 1`,
        [payableBuyerId],
      );
      const intendedAddressId = defaultAddress.rows[0]?.id ?? null;

      // Canonical money split for an auction win: the winning bid IS the
      // capture total; the platform fee is carved out of it, so the
      // seller-net remainder is the escrow-held subtotal released at
      // delivery — identical accounting to postCommerceOrderLedgerEntries.
      const platformFeeGbp = calculateAuctionPlatformFeeGbp(winningBidGbp);
      const sellerNetGbp = roundTo(Math.max(0, winningBidGbp - platformFeeGbp), 2);
      // The reservation/order TTL mirrors the auction payment deadline —
      // with a floor so a lapsed deadline row can never mint an
      // instantly-expired reservation.
      const deadlineMs = auction.payment_deadline_at
        ? Date.parse(String(auction.payment_deadline_at))
        : NaN;
      const reservationTtl =
        Number.isFinite(deadlineMs) && deadlineMs > Date.now()
          ? new Date(deadlineMs).toISOString()
          : new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      if (reusableOrder) {
        auctionOrderId = reusableOrder.id;
      } else {
        auctionOrderId = `auc-ord-${auctionId}-${randomUUID().slice(0, 8)}`;
        // Claim orders.auction_id only when no prior row holds it — the
        // partial unique index allows exactly one claimant per auction.
        const claimsAuctionId = !priorOrders.rows.length ? auctionId : null;
        const quoteSnapshot = {
          source: 'auction_win',
          auctionId,
          listingId: auctionListingId,
          winningBidGbp,
          sellerNetGbp,
          platformFeeGbp,
          postageFeeGbp: 0,
          totalGbp: winningBidGbp,
          currency: 'GBP',
          policyVersion: 'auction_win_v1',
        };
        await client.query(
          `INSERT INTO orders (
             id, buyer_id, seller_id, listing_id,
             subtotal_gbp, buyer_protection_fee_gbp, postage_fee_gbp, total_gbp,
             status, auction_id, address_id, payment_method_id,
             checkout_expires_at, quote_version, quote_snapshot
           )
           VALUES ($1, $2, $3, $4, $5, $6, 0, $7,
                   'created', $8, $9, $10, $11, 'auction_win_v1', $12::jsonb)`,
          [
            auctionOrderId,
            payableBuyerId,
            auctionSellerId,
            auctionListingId,
            sellerNetGbp,
            platformFeeGbp,
            winningBidGbp,
            claimsAuctionId,
            intendedAddressId,
            payload.paymentMethodId ?? null,
            reservationTtl,
            JSON.stringify(quoteSnapshot),
          ],
        );
        await client.query(
          `INSERT INTO order_events (
             order_id, event_type, actor_id, source, deduplication_key, metadata
           )
           VALUES ($1, 'order.created', $2, 'auction_win', $3, $4::jsonb)
           ON CONFLICT (order_id, deduplication_key)
             WHERE deduplication_key IS NOT NULL
           DO NOTHING`,
          [
            auctionOrderId,
            userId,
            `order.created:${auctionOrderId}`,
            JSON.stringify({ auctionId, winningBidGbp, platformFeeGbp }),
          ],
        );
      }

      // The reservation the order-status trigger requires for
      // 'created'→'paid'. Upsert by order_id so a reused order whose
      // reservation drifted is re-armed; a listing-level conflict means a
      // foreign reservation is live — surface it as a retryable 409.
      const reservationId = `auc-res-${auctionId}-${randomUUID().slice(0, 8)}`;
      try {
        await client.query(
          `INSERT INTO listing_checkout_reservations (
             id, offer_id, listing_id, buyer_id, seller_id,
             order_id, source, status, expires_at
           )
           VALUES ($1, NULL, $2, $3, $4, $5, 'auction', 'active', $6)
           ON CONFLICT (order_id) DO UPDATE
             SET status = 'active',
                 expires_at = EXCLUDED.expires_at,
                 cancelled_at = NULL,
                 failure_reason = NULL,
                 updated_at = NOW()`,
          [
            reservationId,
            auctionListingId,
            payableBuyerId,
            auctionSellerId,
            auctionOrderId,
            reservationTtl,
          ],
        );
      } catch (reservationError) {
        if (!isPostgresUniqueViolation(reservationError)) {
          throw reservationError;
        }
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'This listing is reserved by another checkout — retry shortly',
          code: 'LISTING_CHECKOUT_RESERVED',
        };
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return { ok: false, error: `Unable to initiate auction payment: ${(error as Error).message}` };
  } finally {
    client.release();
  }

  // Shared response for an intent that already reached provider-verified
  // 'succeeded' — settle inside its own transaction and emit effects once.
  // Used by the Phase-B self-heal, the synchronously-settled Phase-C path,
  // and the concurrent-mint conflict replay.
  const respondForVerifiedIntent = async (
    intentId: string,
    intentPayload: unknown,
  ) => {
    let settled: AuctionWinSettlementResult;
    try {
      settled = await runVerifiedAuctionSettlement(db, intentId);
    } catch (error) {
      request.log.error({ err: error, auctionId, intentId }, 'Verified auction settlement failed');
      reply.code(500);
      return { ok: false, error: 'Unable to settle the verified auction payment' };
    }
    if (settled?.kind === 'settled') {
      if (!settled.settlement.alreadySettled) {
        await emitAuctionSettlementEffects(settled.settlement, { log: request.log });
      }
      return {
        ok: true,
        paymentStatus: 'paid' as const,
        orderId: settled.settlement.orderId,
        intent: intentPayload,
        auction: {
          id: auctionId,
          status: 'settled' as const,
        },
      };
    }
    // Capture exists but cannot settle (winner moved on, amount drift) —
    // surface the truthful state instead of settling blindly.
    reply.code(409);
    return {
      ok: false,
      error: 'Payment was captured but cannot settle this auction — support has been notified',
      code: 'AUCTION_SETTLEMENT_ORPHANED',
      reason: settled?.kind === 'skipped' ? settled.reason : undefined,
    };
  };

  // ── Phase B: replay / self-heal on the stored attempt ────────────────
  if (latestIntent && latestIntent.status === 'succeeded') {
    // Authoritative capture exists but the auction settle did not land
    // (e.g. intent settled via manual confirm or mock webhook). Apply the
    // verified transition now — the helper is idempotent.
    return respondForVerifiedIntent(
      latestIntent.id,
      toAuctionIntentPayload(latestIntent, { revealSecrets: latestIntent.user_id === userId }),
    );
  }

  if (latestIntent && !INTENT_TERMINAL_STATUSES.has(latestIntent.status)) {
    return {
      ok: true,
      paymentStatus: 'pending' as const,
      intent: toAuctionIntentPayload(latestIntent, { revealSecrets: latestIntent.user_id === userId }),
      auction: {
        id: auctionId,
        status: 'awaiting_payment' as const,
      },
    };
  }

  // ── Phase C: create the provider intent via the canonical flow ───────
  // (no auction lock held — the canonical route manages its own phases).
  const authorizationHeader = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0] ?? null
    : request.headers.authorization ?? null;

  // Gateway selection: the canonical route defaults a commerce intent with
  // no explicit gatewayId to the country's first INTERNAL rail
  // (oneze_internal — the 1ZE wallet rail). That rail creates
  // requires_confirmation intents that only the order-bound internal settle
  // path can complete, which the auction sheet flow never invokes — every
  // winner payment would wedge at awaiting_payment. An auction winner pays
  // by card, so resolve the payer's first PUBLIC commerce gateway from the
  // country capability policy and pass it explicitly.
  const payableUserId = winnerBidderId ?? userId;
  const payerProfile = await db.query<{
    country_code: string | null;
    residency_country_code: string | null;
  }>(
    `SELECT country_code, residency_country_code
     FROM user_compliance_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [payableUserId],
  );
  const payerCapabilities = resolveCountryCapabilities({
    countryCode: payerProfile.rows[0]?.country_code ?? 'GB',
    residencyCountryCode: payerProfile.rows[0]?.residency_country_code ?? null,
  });
  // When no public gateway is configured for the payer's country, fall back
  // to the canonical route's commerce default — its isGatewayConfigured
  // check produces the honest 503 for unconfigured regions.
  const auctionGatewayId =
    getAllowedGatewayIds(payerCapabilities, 'commerce')[0] ?? 'stripe_americas';

  const created = await createAuctionPaymentIntent({
    authorizationHeader,
    money: {
      currency: 'GBP',
      minorAmount: String(Math.round(winningBidGbp * 100)),
    },
    // Canonical-route idempotency is (key, user)-scoped: namespacing the
    // caller key per auction prevents collisions with other flows that
    // reuse the same client key.
    idempotencyKey: `auction-pay:${auctionId}:${payload.idempotencyKey}`,
    instrumentId: payload.paymentMethodId,
    gatewayId: auctionGatewayId,
    metadata: {
      source: 'auction_win',
      auctionId,
      listingId: auctionListingId,
      sellerId: auctionSellerId,
      // The binding is to the auction winner, not the caller — an admin may
      // initiate on the winner's behalf but capture must still settle
      // against winner_bidder_id.
      winnerBidderId: winnerBidderId ?? userId,
      initiatedBy: userId,
      expectedAmountGbp: winningBidGbp,
      paymentMethodId: payload.paymentMethodId ?? null,
    },
  });

  const createdBody = (created.body ?? {}) as {
    ok?: boolean;
    error?: string;
    code?: string;
    intent?: {
      id: string;
      status: string;
      gatewayId?: string | null;
      clientSecret?: string | null;
      nextActionUrl?: string | null;
      providerStatus?: string | null;
      failureCode?: string | null;
      failureMessage?: string | null;
    };
  };

  if (created.statusCode !== 200 || createdBody.ok !== true || !createdBody.intent) {
    reply.code(created.statusCode >= 400 && created.statusCode < 600 ? created.statusCode : 502);
    return {
      ok: false,
      error: createdBody.error ?? 'Payment provider could not create the auction payment',
      code: createdBody.code ?? 'PAYMENT_PROVIDER_UNAVAILABLE',
    };
  }

  const intent = createdBody.intent;

  // ── Server-side auction binding ──────────────────────────────────────
  // Reserved metadata keys are stripped from every client payload at the
  // canonical /payments/intents ingest, so the auction binding can only be
  // written here — a code path no client metadata can reach.
  //
  // payment_intents_auction_live_uidx (migration 334) makes one live
  // (non-terminal or succeeded) intent per (auction, winner) a database
  // invariant: two concurrent winner-pay requests that both miss Phase A
  // race this write — the loser fails 23505, retires its unbound duplicate
  // (its secret is never returned), and replays the stored attempt. That
  // closes the double-capture window different idempotency keys opened.
  const bindingMetadata = {
    source: 'auction_win',
    auctionId,
    listingId: auctionListingId,
    sellerId: auctionSellerId,
    // The binding is to the auction winner, not the caller — an admin may
    // initiate on the winner's behalf but capture must still settle
    // against winner_bidder_id.
    winnerBidderId: winnerBidderId ?? userId,
    initiatedBy: userId,
    initiatedByRole: userId === (winnerBidderId ?? userId) ? 'winner' : 'admin',
    expectedAmountGbp: winningBidGbp,
    paymentMethodId: payload.paymentMethodId ?? null,
  };

  // The binding write carries BOTH the server-owned metadata and the
  // canonical order link: payment_intents.order_id is what routes the
  // verified capture through the commerce order branch in
  // settlePaymentIntent() (order paid → escrow hold → fulfilment →
  // release). orders.payment_intent_id is bound in the same transaction so
  // hasInFlightPaymentIntent() shields the order from expiry cancels while
  // the winner is paying.
  const bindClient = await db.connect();
  try {
    await bindClient.query('BEGIN');
    await bindClient.query(
      `UPDATE payment_intents
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           order_id = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [intent.id, JSON.stringify(bindingMetadata), auctionOrderId],
    );
    const orderBind = await bindClient.query(
      `UPDATE orders
       SET payment_intent_id = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'created'`,
      [auctionOrderId, intent.id],
    );
    if (!orderBind.rowCount) {
      // The order died between Phase A and this write (expiry sweeper,
      // manual cancel). Retire the freshly-minted intent so it can never
      // capture against a dead order.
      await bindClient.query(
        `UPDATE payment_intents
         SET status = 'cancelled',
             failure_code = 'AUCTION_ORDER_NOT_PAYABLE',
             failure_message = 'Bound auction order left created state before intent binding',
             updated_at = NOW()
         WHERE id = $1
           AND status NOT IN ('succeeded', 'failed', 'cancelled')`,
        [intent.id],
      );
      throw createApiError(
        'AUCTION_ORDER_NOT_PAYABLE',
        'The auction order is no longer payable — retry to start a fresh attempt',
      );
    }
    await bindClient.query(
      `INSERT INTO order_events (
         order_id, event_type, actor_id, source, deduplication_key, metadata
       )
       VALUES ($1, 'payment.required', $2, 'auction_win', $3, $4::jsonb)
       ON CONFLICT (order_id, deduplication_key)
         WHERE deduplication_key IS NOT NULL
       DO NOTHING`,
      [
        auctionOrderId,
        userId,
        `payment.required:${intent.id}`,
        JSON.stringify({ auctionId, intentId: intent.id }),
      ],
    );
    await bindClient.query('COMMIT');
  } catch (error) {
    try {
      await bindClient.query('ROLLBACK');
    } catch {
      // Already aborted.
    }
    if (!isPostgresUniqueViolation(error)) {
      throw error;
    }
    await db.query(
      `UPDATE payment_intents
       SET status = 'cancelled',
           failure_code = 'AUCTION_INTENT_SUPERSEDED',
           failure_message = 'Superseded by a concurrent auction payment attempt',
           updated_at = NOW()
       WHERE id = $1
         AND status NOT IN ('succeeded', 'failed', 'cancelled')`,
      [intent.id],
    );
    const stored = await db.query<StoredAuctionPaymentIntent>(
      `SELECT id, user_id, status, gateway_id, client_secret, next_action_url,
              provider_status, failure_code, failure_message
       FROM payment_intents
       WHERE metadata->>'auctionId' = $1
         AND metadata->>'winnerBidderId' = $2
         AND user_id = $2
         AND status NOT IN ('failed', 'cancelled')
       ORDER BY CASE WHEN status = 'succeeded' THEN 0 ELSE 1 END,
                created_at DESC
       LIMIT 1`,
      [auctionId, winnerBidderId ?? userId],
    );
    const live = stored.rows[0];
    if (!live) {
      reply.code(409);
      return {
        ok: false,
        error: 'A concurrent payment attempt is in progress — retry to fetch its state',
        code: 'AUCTION_PAYMENT_CONFLICT',
      };
    }
    if (live.status === 'succeeded') {
      return respondForVerifiedIntent(
        live.id,
        toAuctionIntentPayload(live, { revealSecrets: live.user_id === userId }),
      );
    }
    return {
      ok: true,
      paymentStatus: 'pending' as const,
      intent: toAuctionIntentPayload(live, { revealSecrets: live.user_id === userId }),
      auction: {
        id: auctionId,
        status: 'awaiting_payment' as const,
      },
    };
  } finally {
    bindClient.release();
  }

  // A synchronously-settled gateway (e.g. an internal rail) can return
  // 'succeeded' already — run the same verified settle as the webhook path.
  if (intent.status === 'succeeded') {
    return respondForVerifiedIntent(intent.id, intent);
  }

  if (intent.status === 'failed' || intent.status === 'cancelled') {
    return {
      ok: true,
      paymentStatus: 'failed' as const,
      intent,
      auction: {
        id: auctionId,
        status: 'awaiting_payment' as const,
      },
    };
  }

  return {
    ok: true,
    paymentStatus: 'pending' as const,
    intent,
    auction: {
      id: auctionId,
      status: 'awaiting_payment' as const,
    },
  };
});

// ── Winner payment status (poll) ────────────────────────────────────────
// Authoritative read the client polls while a provider capture is in
// flight. Also closes the settlement gap for intents that reached
// 'succeeded' through a path without the webhook hook — the same verified
// settle helper runs here, keyed only off provider-owned intent state.

app.get('/auctions/:auctionId/payment-status', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const { auctionId } = paramsSchema.parse(request.params);
  const userId = request.authUser.userId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query<{
      id: string;
      seller_id: string;
      status: string;
      winner_bidder_id: string | null;
      settled_at: string | null;
      paid_at: string | null;
    }>(
      `SELECT id, seller_id, status, winner_bidder_id, settled_at, paid_at
       FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId],
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    const isParty =
      auction.winner_bidder_id === userId
      || auction.seller_id === userId
      || request.authUser.role === 'admin';
    if (!isParty) {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Forbidden', code: 'WINNER_RESTRICTED' };
    }

    // Winner-scoped: only intents bound to the CURRENT winner are
    // considered — a stray intent from a flaked winner or a non-auction
    // intent can never shadow the live attempt (status-aware ordering
    // prefers a verified capture over a newer terminal row).
    const intentResult = await client.query<StoredAuctionPaymentIntent>(
      `SELECT id, user_id, status, gateway_id, client_secret, next_action_url,
              provider_status, failure_code, failure_message
       FROM payment_intents
       WHERE metadata->>'auctionId' = $1
         AND metadata->>'winnerBidderId' = $2
         AND user_id = $2
       ORDER BY CASE
                  WHEN status = 'succeeded' THEN 0
                  WHEN status IN ('failed', 'cancelled') THEN 2
                  ELSE 1
                END,
                created_at DESC
       LIMIT 1`,
      [auctionId, auction.winner_bidder_id ?? ''],
    );
    const latestIntent = intentResult.rows[0] ?? null;

    // Self-heal: provider capture exists but the auction never settled.
    let settledOrderId: string | null = null;
    let freshSettlement: AuctionWinSettlement | null = null;
    // Honest reporting: when a captured intent cannot settle (winner moved
    // on, amount drift, binding anomaly) the auction is NOT paid — surface
    // the reconciliation state instead of reporting 'paid' on the strength
    // of the intent status alone.
    let settlementSkippedReason: string | null = null;
    if (latestIntent?.status === 'succeeded') {
      const settled = await settleAuctionWinForVerifiedIntent(client, latestIntent.id);
      if (settled.kind === 'settled') {
        settledOrderId = settled.settlement.orderId;
        if (!settled.settlement.alreadySettled) {
          freshSettlement = settled.settlement;
        }
      } else {
        settlementSkippedReason =
          settled.kind === 'skipped' ? settled.reason : 'not_auction_intent';
      }
    }

    const orderRow = settledOrderId
      ? null
      : await client.query<{ id: string }>(
          `SELECT o.id
           FROM orders o
           LEFT JOIN payment_intents pi ON pi.order_id = o.id
           WHERE o.auction_id = $1
              OR pi.metadata->>'auctionId' = $1
           ORDER BY CASE WHEN o.status = 'paid' THEN 0
                         WHEN o.status = 'created' THEN 1
                         ELSE 2 END,
                    o.created_at DESC
           LIMIT 1`,
          [auctionId],
        );

    await client.query('COMMIT');

    if (freshSettlement) {
      await emitAuctionSettlementEffects(freshSettlement, { log: request.log });
    }

    const auctionNowSettled =
      Boolean(freshSettlement)
      || auction.status === 'settled'
      || Boolean(auction.settled_at)
      || Boolean(auction.paid_at);

    // 'paid' requires the auction to have actually settled — a succeeded
    // intent whose settlement was skipped reports 'pending' with the
    // reconciliation reason, never 'paid'.
    const paymentStatus =
      auctionNowSettled
        ? ('paid' as const)
        : settlementSkippedReason
          ? ('pending' as const)
          : latestIntent && INTENT_TERMINAL_STATUSES.has(latestIntent.status)
            ? ('failed' as const)
            : latestIntent
              ? ('pending' as const)
              : ('unpaid' as const);

    return {
      ok: true,
      paymentStatus,
      orderId: settledOrderId ?? orderRow?.rows[0]?.id,
      ...(settlementSkippedReason
        ? {
            settlementState: 'requires_reconciliation' as const,
            settlementReason: settlementSkippedReason,
          }
        : {}),
      intent: latestIntent
        ? toAuctionIntentPayload(latestIntent, { revealSecrets: latestIntent.user_id === userId })
        : null,
      auction: {
        id: auctionId,
        status: auctionNowSettled ? ('settled' as const) : auction.status,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return { ok: false, error: `Unable to read auction payment status: ${(error as Error).message}` };
  } finally {
    client.release();
  }
});

// ── T20: Second-chance acceptance ─────────────────────────────────
// The next-highest bidder accepts the second-chance offer.

app.post('/auctions/:auctionId/second-chance/accept', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const bodySchema = z.object({
    idempotencyKey: z.string().min(4).max(140),
  });

  const { auctionId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);
  const userId = request.authUser.userId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query<{
      id: string;
      seller_id: string;
      listing_id: string;
      status: string;
      second_chance_offered_to: string | null;
      payment_deadline_at: string | null;
      winner_bid_id: number | null;
      current_bid_gbp: number | string;
    }>(
      `SELECT id, seller_id, listing_id, status, second_chance_offered_to,
              payment_deadline_at, winner_bid_id, current_bid_gbp
       FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId],
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    if (auction.status !== 'payment_expired') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'No second-chance offer available', code: 'NO_SECOND_CHANCE' };
    }

    if (auction.second_chance_offered_to !== userId) {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'You are not the second-chance recipient', code: 'NOT_SECOND_CHANCE_RECIPIENT' };
    }

    // Check deadline hasn't passed
    if (auction.payment_deadline_at && new Date(auction.payment_deadline_at) <= new Date()) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Second-chance deadline has passed', code: 'SECOND_CHANCE_EXPIRED' };
    }

    // Seller reach (lib/sellerReach.ts): accepting binds this bidder to a
    // payment obligation toward the seller — a suspended seller's auction
    // can never settle (the payment route rejects it), so don't move the
    // bidder into awaiting_payment in the first place.
    const scSellerReach = await getSellerReach(client, auction.seller_id);
    if (scSellerReach?.state === 'suspended') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'This seller is currently restricted — this auction cannot be paid', code: 'SELLER_RESTRICTED' };
    }

    // Resolve the bid this recipient was offered — the amount THEY bid.
    // current_bid_gbp is the settlement amount (winner-pay validates and
    // settles against it), so it must move to the accepting bidder's bid —
    // leaving the flaked winner's higher bid would overcharge the
    // second-chance buyer or wedge settlement on an amount mismatch.
    const offeredBidResult = await client.query<{
      id: number;
      bidder_id: string;
      amount_gbp: number | string;
    }>(
      `SELECT id, bidder_id, amount_gbp
       FROM auction_bids
       WHERE id = $1
       LIMIT 1`,
      [auction.winner_bid_id],
    );
    const offeredBid = offeredBidResult.rows[0];
    if (!offeredBid || offeredBid.bidder_id !== userId) {
      await client.query('ROLLBACK');
      reply.code(409);
      return {
        ok: false,
        error: 'Second-chance offer has no valid bid to accept',
        code: 'NO_BIDS',
      };
    }

    // Transition to awaiting_payment with the new winner at THEIR bid.
    const newDeadline = new Date(Date.now() + 24 * 3600_000).toISOString();
    await client.query(
      `UPDATE auctions
       SET status = 'awaiting_payment',
           winner_bidder_id = $3,
           winner_bid_id = $4,
           current_bid_gbp = $5,
           second_chance_offered_to = NULL,
           payment_deadline_at = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [auctionId, newDeadline, userId, offeredBid.id, Number(offeredBid.amount_gbp)],
    );

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `auction:${auctionId}`,
      type: 'auction.awaiting_payment',
      payload: {
        auctionId,
        listingId: auction.listing_id,
        winnerBidderId: userId,
        paymentDeadlineAt: newDeadline,
        reason: 'second_chance_accepted',
      },
      seq: true,
      version: 1,
    });

    return {
      ok: true,
      auction: {
        id: auctionId,
        status: 'awaiting_payment',
        paymentDeadlineAt: newDeadline,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return { ok: false, error: `Unable to accept second chance: ${(error as Error).message}` };
  } finally {
    client.release();
  }
});

// ── T20: Second-chance decline ────────────────────────────────────
// The next-highest bidder declines — they join second_chance_declined_ids
// and the chain advances to the next eligible bidder (or relists when no
// eligible bidder remains). Previously a decline dead-ended the auction in
// 'payment_expired' with the listing left 'paused'.

app.post('/auctions/:auctionId/second-chance/decline', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const { auctionId } = paramsSchema.parse(request.params);
  const userId = request.authUser.userId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query<{
      id: string;
      listing_id: string;
      seller_id: string;
      status: string;
      second_chance_offered_to: string | null;
      title: string;
    }>(
      `SELECT a.id, a.listing_id, a.seller_id, a.status, a.second_chance_offered_to, l.title
       FROM auctions a
       INNER JOIN listings l ON l.id = a.listing_id
       WHERE a.id = $1 FOR UPDATE OF a`,
      [auctionId],
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    if (auction.status !== 'payment_expired') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'No second-chance offer available', code: 'NO_SECOND_CHANCE' };
    }

    if (auction.second_chance_offered_to !== userId) {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'You are not the second-chance recipient', code: 'NOT_SECOND_CHANCE_RECIPIENT' };
    }

    // Record the decline and advance the chain — identical semantics to the
    // sweep's pass 3, applied inline so the next bidder is offered (or the
    // item relisted) immediately rather than on the next sweep interval.
    const advance = await advanceSecondChanceOffer({
      client,
      auction: {
        id: auction.id,
        listing_id: auction.listing_id,
        seller_id: auction.seller_id,
        title: auction.title,
      },
      excludeBidderId: userId,
      reason: 'second_chance_declined',
      notify: queueUserNotification,
    });

    await client.query('COMMIT');

    return {
      ok: true,
      auctionId,
      relisted: advance.outcome === 'relisted',
      secondChanceOfferedTo: advance.offeredToBidderId ?? null,
      paymentDeadlineAt: advance.paymentDeadlineAt ?? null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return { ok: false, error: `Unable to decline second chance: ${(error as Error).message}` };
  } finally {
    client.release();
  }
});

// ── T20: Seller accepts highest bid below reserve ─────────────────
// After reserve_not_met, the seller can choose to accept the highest bid
// anyway, transitioning the auction to awaiting_payment.

app.post('/auctions/:auctionId/accept-highest-bid', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }

  const paramsSchema = z.object({ auctionId: z.string().min(2) });
  const { auctionId } = paramsSchema.parse(request.params);
  const userId = request.authUser.userId;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query<{
      id: string;
      seller_id: string;
      listing_id: string;
      status: string;
    }>(
      `SELECT id, seller_id, listing_id, status FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId],
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    if (auction.seller_id !== userId && request.authUser.role !== 'admin') {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Only the seller can accept the highest bid', code: 'SELLER_RESTRICTED' };
    }

    if (auction.status !== 'reserve_not_met') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Auction is not in reserve-not-met state', code: 'NOT_RESERVE_NOT_MET' };
    }

    // Seller reach (lib/sellerReach.ts): accepting binds the highest bidder
    // to a payment obligation. A suspended seller cannot sell — reject here
    // so the winner is never locked into a sale that cannot settle.
    const acceptBidSellerReach = await getSellerReach(client, auction.seller_id);
    if (acceptBidSellerReach?.state === 'suspended') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'This seller is currently restricted — this auction cannot proceed to payment', code: 'SELLER_RESTRICTED' };
    }

    // Find the highest bid
    const topBid = await client.query<{
      id: number;
      bidder_id: string;
      amount_gbp: string;
    }>(
      `SELECT id, bidder_id, amount_gbp::text FROM auction_bids
       WHERE auction_id = $1 ORDER BY amount_gbp DESC, created_at ASC, id ASC LIMIT 1`,
      [auctionId],
    );

    const top = topBid.rows[0];
    if (!top) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'No bids to accept', code: 'NO_BIDS' };
    }

    const paymentDeadline = new Date(Date.now() + 72 * 3600_000).toISOString();
    await client.query(
      `UPDATE auctions
       SET status = 'awaiting_payment', winner_bidder_id = $2, winner_bid_id = $3,
           payment_deadline_at = $4, updated_at = NOW()
       WHERE id = $1`,
      [auctionId, top.bidder_id, top.id, paymentDeadline],
    );

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `auction:${auctionId}`,
      type: 'auction.awaiting_payment',
      payload: {
        auctionId,
        listingId: auction.listing_id,
        winnerBidderId: top.bidder_id,
        paymentDeadlineAt: paymentDeadline,
        reason: 'seller_accepted_below_reserve',
      },
      seq: true,
      version: 1,
    });

    // Notify the winner
    try {
      await queueUserNotification({
        userId: top.bidder_id,
        title: 'Seller accepted your bid',
        body: `The seller accepted your bid of £${Number(top.amount_gbp).toFixed(2)} even though the reserve wasn't met. Pay by ${new Date(paymentDeadline).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} to complete your purchase.`,
        eventType: 'auction_won',
        payload: { auctionId, event: 'seller_accepted_below_reserve', paymentDeadlineAt: paymentDeadline },
        route: { screen: 'AuctionDetail', params: { auctionId } },
        idempotencyKey: `auction-accept-${auctionId}`,
      });
    } catch (error) {
      request.log.error({ err: error, auctionId }, 'Failed to queue accept notification');
    }

    return {
      ok: true,
      auction: { id: auctionId, status: 'awaiting_payment', paymentDeadlineAt: paymentDeadline },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return { ok: false, error: `Unable to accept highest bid: ${(error as Error).message}` };
  } finally {
    client.release();
  }
});



};
