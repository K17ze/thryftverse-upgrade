import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { publishRealtimeEvent } from '../lib/realtime.js';
import { ledgerTablesAvailable } from '../lib/workerHelpers.js';
import { emitOrderCommerceCard } from '../lib/orderChatCards.js';
import { postAuctionSettlementLedgerEntries } from '../lib/workerRuntime.js';
import { advanceSecondChanceOffer } from '../workers/handlers/auctionSweepHandler.js';

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

export const registerAuctionLifecycleRoutes = ({
  app,
  db,
  queueUserNotification,
}: AuctionLifecycleRouteDependencies) => {

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
      `UPDATE listings SET status = 'active', updated_at = NOW()
       WHERE id = $1 AND status = 'paused'`,
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
          eventType: 'auction_outbid',
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

// ── T20: Payment confirmation ─────────────────────────────────────
// The winner confirms payment. This triggers settlement: listing marked
// sold, ledger entries posted, order created, and status → settled.

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

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const auctionResult = await client.query<{
      id: string;
      seller_id: string;
      listing_id: string;
      status: string;
      winner_bidder_id: string | null;
      winner_bid_id: number | null;
      current_bid_gbp: number | string;
      cancelled_at: string | null;
      settled_at: string | null;
      paid_at: string | null;
    }>(
      `SELECT id, seller_id, listing_id, status, winner_bidder_id, winner_bid_id,
              current_bid_gbp, cancelled_at, settled_at, paid_at
       FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId],
    );

    const auction = auctionResult.rows[0];
    if (!auction) {
      await client.query('ROLLBACK');
      reply.code(404);
      return { ok: false, error: 'Auction not found' };
    }

    if (auction.cancelled_at) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Auction cancelled', code: 'AUCTION_CANCELLED' };
    }

    if (auction.settled_at || auction.status === 'settled') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Auction already settled', code: 'AUCTION_SETTLED' };
    }

    if (auction.status !== 'awaiting_payment' && auction.status !== 'payment_expired') {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Auction is not awaiting payment', code: 'NOT_AWAITING_PAYMENT' };
    }

    // Only the winner (or admin) can confirm payment
    if (auction.winner_bidder_id !== userId && request.authUser.role !== 'admin') {
      await client.query('ROLLBACK');
      reply.code(403);
      return { ok: false, error: 'Only the winner can confirm payment', code: 'WINNER_RESTRICTED' };
    }

    if (auction.paid_at) {
      await client.query('ROLLBACK');
      reply.code(409);
      return { ok: false, error: 'Payment already confirmed', code: 'PAYMENT_ALREADY_CONFIRMED' };
    }

    const winningBidGbp = Number(auction.current_bid_gbp);
    const platformFeeGbp = calculateAuctionPlatformFeeGbp(winningBidGbp);

    // Settle the auction
    await client.query(
      `UPDATE auctions
       SET status = 'settled', settled_at = NOW(), paid_at = NOW(),
           payment_confirmed_by = $2, payment_method_id = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [auctionId, userId, payload.paymentMethodId ?? null],
    );

    // Mark listing as sold — payment is now confirmed
    await client.query(
      `UPDATE listings SET status = 'sold', updated_at = NOW() WHERE id = $1`,
      [auction.listing_id],
    );

    // Create order record (reuse the Buy Now order pattern)
    const orderId = `auc-pay-${auctionId}-${payload.idempotencyKey.slice(-12)}`;
    const existingOrder = await client.query<{ id: string }>(
      `SELECT id FROM orders WHERE auction_id = $1 LIMIT 1`,
      [auctionId],
    );
    if (!existingOrder.rowCount) {
      await client.query(
        `INSERT INTO orders (id, buyer_id, seller_id, listing_id, subtotal_gbp,
           buyer_protection_fee_gbp, total_gbp, status, auction_id)
         VALUES ($1, $2, $3, $4, $5, 0, $5, 'paid', $6)`,
        [orderId, auction.winner_bidder_id, auction.seller_id, auction.listing_id, winningBidGbp, auctionId],
      );
    }
    // The persisted order wins — when an order already exists for this
    // auction the constructed `auc-pay-` id must not leak into cards,
    // notifications or the response.
    const effectiveOrderId = existingOrder.rows[0]?.id ?? orderId;

    // Post ledger entries now that payment is confirmed
    const canPostLedger = await ledgerTablesAvailable(client);
    if (canPostLedger) {
      await postAuctionSettlementLedgerEntries(client, {
        auctionId,
        buyerId: auction.winner_bidder_id!,
        sellerId: auction.seller_id,
        winningBidGbp,
        platformFeeGbp,
      });
    }

    await client.query('COMMIT');

    publishRealtimeEvent({
      topic: `auction:${auctionId}`,
      type: 'auction.settled',
      payload: {
        auctionId,
        listingId: auction.listing_id,
        winnerBidderId: auction.winner_bidder_id,
        winnerAmountGbp: winningBidGbp,
        platformFeeRate: AUCTION_PLATFORM_FEE_RATE,
        platformFeeGbp,
        reason: 'payment_confirmed',
      },
      seq: true,
      version: 1,
    });

    // In-thread commerce cards: the winning-bid order was created already
    // paid — emit both lifecycle beats so the thread reads truthfully.
    // Idempotent replays are deduped by the deterministic message ids.
    await emitOrderCommerceCard({
      orderId: effectiveOrderId,
      stateType: 'order_placed',
      log: request.log,
    });
    await emitOrderCommerceCard({
      orderId: effectiveOrderId,
      stateType: 'payment_confirmed',
      log: request.log,
    });

    // Notify seller
    try {
      await queueUserNotification({
        userId: auction.seller_id,
        title: 'Payment received',
        body: `Payment of £${winningBidGbp.toFixed(2)} received for ${auctionId}. The auction is settled.`,
        eventType: 'auction_won',
        payload: { auctionId, event: 'auction_payment_confirmed', orderId: effectiveOrderId },
        route: { screen: 'AuctionDetail', params: { auctionId } },
        idempotencyKey: `auction-payment-${auctionId}`,
      });
    } catch (error) {
      request.log.error({ err: error, auctionId }, 'Failed to queue payment notification');
    }

    return {
      ok: true,
      orderId: effectiveOrderId,
      auction: {
        id: auctionId,
        status: 'settled',
        settledAt: new Date().toISOString(),
        paidAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    reply.code(500);
    return { ok: false, error: `Unable to confirm payment: ${(error as Error).message}` };
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

    // Transition to awaiting_payment with the new winner
    const newDeadline = new Date(Date.now() + 24 * 3600_000).toISOString();
    await client.query(
      `UPDATE auctions
       SET status = 'awaiting_payment',
           second_chance_offered_to = NULL,
           payment_deadline_at = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [auctionId, newDeadline],
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
