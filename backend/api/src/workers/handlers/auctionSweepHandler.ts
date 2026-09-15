/**
 * Expired-auction sweep handler.
 *
 * T20 lifecycle closure: enforces reserve price at settlement, gates
 * listing-sold + ledger on payment confirmation, and handles payment
 * deadline expiry with second-chance offers to the next-highest bidder.
 *
 * Three sweep passes per invocation:
 *   1. End expired auctions (ends_at <= NOW, status in live/upcoming)
 *      → reserve_not_met | awaiting_payment
 *   2. Expire overdue payments (status = awaiting_payment, deadline passed)
 *      → second_chance to next bidder | payment_expired + relist
 *   3. Expire unanswered second-chance offers (status = payment_expired,
 *      second_chance_offered_to IS NOT NULL, deadline passed)
 *      → second_chance to the next eligible bidder | relist
 *      Without pass 3 an ignored or declined offer stranded the listing in
 *      'paused' forever — pass 2 never looked at payment_expired rows.
 */
import { db } from '../../db/pool.js';
import { recordAuctionSettlement } from '../../lib/metrics.js';
import { publishRealtimeEvent } from '../../lib/realtime.js';
import { queueUserNotification } from '../../lib/workerRuntime.js';

export type AuctionSweepHandlerDeps = {
  /** Uses shared db singleton + worker runtime helpers. */
};

/** Payment deadline for the initial winner (72h). */
const PAYMENT_DEADLINE_HOURS = 72;
/** Payment deadline for a second-chance winner (24h). */
const SECOND_CHANCE_DEADLINE_HOURS = 24;

type SweepClient = {
  query: <T = any>(text: string, values?: any[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

/** Mirrors the injected queueUserNotification dependency signature used by
 * the auction routes — all fields the helper emits are required so both the
 * worker-runtime and the route-injected implementations are assignable. */
export type SecondChanceNotify = (input: {
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
 * Advance a second-chance chain: offer the item to the next-highest
 * eligible bidder, or relist when no eligible bidder remains.
 *
 * `excludeBidderId` is the participant who just failed the chain — the
 * winner who didn't pay, a decliner, or an offer recipient who let the
 * deadline lapse. They are appended to `second_chance_declined_ids` so no
 * later pass can re-offer to them (which would loop the same bidders
 * forever while the listing stayed paused).
 *
 * Exported for the POST /auctions/:id/second-chance/decline route, which
 * performs the identical advance inline instead of waiting for the sweep.
 */
export async function advanceSecondChanceOffer(input: {
  client: SweepClient;
  auction: { id: string; listing_id: string; seller_id: string; title: string };
  excludeBidderId?: string | null;
  reason: string;
  notify?: SecondChanceNotify;
}): Promise<{ outcome: 'offered' | 'relisted'; offeredToBidderId?: string; paymentDeadlineAt?: string }> {
  const { client, auction, reason } = input;
  const notify = input.notify ?? queueUserNotification;

  // Record the participant who just dropped out of the chain.
  if (input.excludeBidderId) {
    await client.query(
      `UPDATE auctions
       SET second_chance_declined_ids =
             array_append(COALESCE(second_chance_declined_ids, '{}'), $2),
           updated_at = NOW()
       WHERE id = $1
         AND NOT ($2 = ANY(COALESCE(second_chance_declined_ids, '{}')))`,
      [auction.id, input.excludeBidderId],
    );
  }

  // Re-read the exclusion set so the next-bidder query sees every bidder
  // who already declined, ignored, or failed to pay.
  const state = await client.query<{ second_chance_declined_ids: string[] | null }>(
    `SELECT second_chance_declined_ids FROM auctions WHERE id = $1`,
    [auction.id],
  );
  const excluded = state.rows[0]?.second_chance_declined_ids ?? [];

  const nextBidder = await client.query<{
    id: number;
    bidder_id: string;
    amount_gbp: string;
  }>(
    `
      SELECT id, bidder_id, amount_gbp::text
      FROM auction_bids
      WHERE auction_id = $1
        AND NOT (bidder_id = ANY($2::text[]))
      ORDER BY amount_gbp DESC, created_at ASC, id ASC
      LIMIT 1
    `,
    [auction.id, excluded],
  );

  const next = nextBidder.rows[0] ?? null;

  if (next) {
    const secondChanceDeadline = new Date(Date.now() + SECOND_CHANCE_DEADLINE_HOURS * 3600_000).toISOString();
    await client.query(
      `
        UPDATE auctions
        SET status = 'payment_expired',
            second_chance_offered_to = $2,
            winner_bidder_id = $3,
            winner_bid_id = $4,
            payment_deadline_at = $5,
            updated_at = NOW()
        WHERE id = $1
      `,
      [auction.id, next.bidder_id, next.bidder_id, next.id, secondChanceDeadline],
    );

    publishRealtimeEvent({
      topic: `auction:${auction.id}`,
      type: 'auction.second_chance_offered',
      payload: {
        auctionId: auction.id,
        listingId: auction.listing_id,
        secondChanceBidderId: next.bidder_id,
        paymentDeadlineAt: secondChanceDeadline,
        reason,
      },
      seq: true,
      version: 1,
    });

    await notify({
      userId: next.bidder_id,
      title: 'Second chance offer',
      body: `The winner of ${auction.title} didn't pay. You can purchase it for £${Number(next.amount_gbp).toFixed(2)}. Respond by ${new Date(secondChanceDeadline).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.`,
      eventType: 'auction_won',
      payload: {
        auctionId: auction.id,
        listingId: auction.listing_id,
        event: 'auction_second_chance',
        paymentDeadlineAt: secondChanceDeadline,
      },
      route: { screen: 'AuctionDetail', params: { auctionId: auction.id } },
      idempotencyKey: `auction-sc-offer-${auction.id}-${next.bidder_id}`,
      metadata: { reason },
    });

    await notify({
      userId: auction.seller_id,
      title: 'Payment expired — second chance offered',
      body: `The winner of ${auction.title} didn't pay. We've offered it to the next bidder.`,
      eventType: 'auction_sold_awaiting_payment',
      payload: { auctionId: auction.id, event: 'auction_second_chance_seller' },
      route: { screen: 'AuctionDetail', params: { auctionId: auction.id } },
      idempotencyKey: `auction-sc-offer-seller-${auction.id}-${next.bidder_id}`,
      metadata: { reason },
    });

    return { outcome: 'offered', offeredToBidderId: next.bidder_id, paymentDeadlineAt: secondChanceDeadline };
  }

  // No eligible bidder remains — relist the item.
  await client.query(
    `
      UPDATE auctions
      SET status = 'payment_expired',
          winner_bidder_id = NULL,
          winner_bid_id = NULL,
          second_chance_offered_to = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
    [auction.id],
  );
  await client.query(
    `UPDATE listings SET status = 'active', pause_source = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'paused' AND pause_source = 'auction'`,
    [auction.listing_id],
  );

  publishRealtimeEvent({
    topic: `auction:${auction.id}`,
    type: 'auction.payment_expired',
    payload: {
      auctionId: auction.id,
      listingId: auction.listing_id,
      reason,
    },
    seq: true,
    version: 1,
  });

  await notify({
    userId: auction.seller_id,
    title: reason === 'second_chance_declined'
      ? 'Second chance declined — item relisted'
      : 'Payment expired — item relisted',
    body: reason === 'second_chance_declined'
      ? `The next bidder declined the second-chance offer for ${auction.title} and there are no other bidders. Your listing has been reactivated.`
      : `The winner of ${auction.title} didn't pay and there are no other bidders. Your listing has been reactivated.`,
    eventType: 'auction_payment_expired',
    payload: { auctionId: auction.id, event: 'auction_payment_expired_relist' },
    route: { screen: 'AuctionDetail', params: { auctionId: auction.id } },
    idempotencyKey: `auction-sc-relist-${auction.id}`,
    metadata: { reason },
  });

  return { outcome: 'relisted' };
}

export async function sweepExpiredAuctions(reason: 'interval' | 'manual'): Promise<number> {
  const client = await db.connect();
  let processed = 0;

  try {
    await client.query('BEGIN');

    // ── Pass 1: End expired auctions ──
    processed += await sweepEndedAuctions(client, reason);

    // ── Pass 2: Expire overdue payments ──
    processed += await sweepOverduePayments(client, reason);

    // ── Pass 3: Expire unanswered second-chance offers ──
    processed += await sweepExpiredSecondChanceOffers(client, reason);

    await client.query('COMMIT');
    if (processed === 0) {
      recordAuctionSettlement('no_action');
    } else {
      recordAuctionSettlement('settled');
    }
    return processed;
  } catch (error) {
    await client.query('ROLLBACK');
    recordAuctionSettlement('failed');
    throw error;
  } finally {
    client.release();
  }
}

// ── Pass 1: End auctions whose ends_at has passed ──

async function sweepEndedAuctions(
  client: SweepClient,
  reason: 'interval' | 'manual',
): Promise<number> {
  const expiring = await client.query<{
    id: string;
    listing_id: string;
    seller_id: string;
    title: string;
    reserve_price_gbp: string | null;
  }>(
    `
      SELECT a.id, a.listing_id, a.seller_id, l.title, a.reserve_price_gbp::text
      FROM auctions a
      INNER JOIN listings l ON l.id = a.listing_id
      WHERE a.ends_at <= NOW()
        AND a.status IN ('live', 'upcoming')
        AND a.cancelled_at IS NULL
        AND a.settled_at IS NULL
      ORDER BY a.ends_at ASC
      FOR UPDATE SKIP LOCKED
    `,
  );

  if (!expiring.rowCount) return 0;

  let count = 0;
  for (const auction of expiring.rows) {
    const topBid = await client.query<{
      id: number;
      bidder_id: string;
      amount_gbp: string;
      auction_sequence: number;
    }>(
      `
        SELECT id, bidder_id, amount_gbp::text, auction_sequence
        FROM auction_bids
        WHERE auction_id = $1
        ORDER BY amount_gbp DESC, created_at ASC, id ASC
        LIMIT 1
      `,
      [auction.id],
    );

    const top = topBid.rows[0] ?? null;
    const topBidGbp = top ? Number(top.amount_gbp) : 0;
    const reserveGbp = auction.reserve_price_gbp !== null ? Number(auction.reserve_price_gbp) : null;

    // Reserve not met (or no bids at all with a reserve): no winner.
    const reserveNotMet = reserveGbp !== null && topBidGbp < reserveGbp;
    const noBids = !top;

    if (reserveNotMet || noBids) {
      // Mark as reserve_not_met and reactivate the listing.
      await client.query(
        `
          UPDATE auctions
          SET status = 'reserve_not_met', winner_bidder_id = NULL, winner_bid_id = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [auction.id],
      );
      await client.query(
        `UPDATE listings SET status = 'active', pause_source = NULL, updated_at = NOW()
         WHERE id = $1 AND status = 'paused' AND pause_source = 'auction'`,
        [auction.listing_id],
      );

      publishRealtimeEvent({
        topic: `auction:${auction.id}`,
        type: 'auction.reserve_not_met',
        payload: {
          auctionId: auction.id,
          listingId: auction.listing_id,
          topBidGbp: top ? topBidGbp : null,
          reserveGbp,
          reason,
        },
        seq: true,
        version: 1,
      });

      // Notify seller
      await queueUserNotification({
        userId: auction.seller_id,
        title: 'Reserve not met',
        body: top
          ? `${auction.title} ended at £${topBidGbp.toFixed(2)} — below your reserve of £${reserveGbp!.toFixed(2)}. Relist or accept the highest bid.`
          : `${auction.title} ended with no bids. You can relist it.`,
        eventType: 'auction_reserve_not_met',
        payload: { auctionId: auction.id, listingId: auction.listing_id, event: 'auction_reserve_not_met' },
        route: { screen: 'AuctionDetail', params: { auctionId: auction.id } },
        metadata: { reason },
      });

      // Notify all bidders that the auction ended without a sale
      if (top) {
        const allBidders = await client.query<{ bidder_id: string }>(
          `SELECT DISTINCT bidder_id FROM auction_bids WHERE auction_id = $1`,
          [auction.id],
        );
        for (const row of allBidders.rows) {
          await queueUserNotification({
            userId: row.bidder_id,
            title: 'Auction ended',
            body: `${auction.title} ended. Reserve not met — the item was not sold.`,
            eventType: 'auction_reserve_not_met',
            payload: { auctionId: auction.id, event: 'auction_reserve_not_met_bidder' },
            route: { screen: 'AuctionDetail', params: { auctionId: auction.id } },
            metadata: { reason },
          });
        }
      }
      count += 1;
      continue;
    }

    // Reserve met (or no reserve): set winner and await payment.
    const paymentDeadline = new Date(Date.now() + PAYMENT_DEADLINE_HOURS * 3600_000).toISOString();
    await client.query(
      `
        UPDATE auctions
        SET status = 'awaiting_payment',
            winner_bidder_id = $2,
            winner_bid_id = $3,
            payment_deadline_at = $4,
            updated_at = NOW()
        WHERE id = $1
      `,
      [auction.id, top!.bidder_id, top!.id, paymentDeadline],
    );

    // Do NOT mark listing as sold — payment must be confirmed first.
    // Do NOT post ledger entries — deferred to payment confirmation.

    publishRealtimeEvent({
      topic: `auction:${auction.id}`,
      type: 'auction.awaiting_payment',
      payload: {
        auctionId: auction.id,
        listingId: auction.listing_id,
        winnerBidderId: top!.bidder_id,
        winnerAmountGbp: topBidGbp,
        paymentDeadlineAt: paymentDeadline,
        auctionSequence: top!.auction_sequence,
        reason,
      },
      seq: true,
      version: 1,
    });

    // Notify winner
    await queueUserNotification({
      userId: top!.bidder_id,
      title: 'You won the auction',
      body: `You won ${auction.title} at £${topBidGbp.toFixed(2)}. Pay by ${new Date(paymentDeadline).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} to complete your purchase.`,
      eventType: 'auction_won',
      payload: {
        auctionId: auction.id,
        listingId: auction.listing_id,
        event: 'auction_won',
        paymentDeadlineAt: paymentDeadline,
      },
      route: { screen: 'AuctionDetail', params: { auctionId: auction.id } },
      metadata: { reason },
    });

    // Notify seller
    await queueUserNotification({
      userId: auction.seller_id,
      title: 'Auction sold — awaiting payment',
      body: `${auction.title} sold at £${topBidGbp.toFixed(2)}. Awaiting buyer payment.`,
      eventType: 'auction_sold_awaiting_payment',
      payload: { auctionId: auction.id, listingId: auction.listing_id, event: 'auction_sold_awaiting_payment' },
      route: { screen: 'AuctionDetail', params: { auctionId: auction.id } },
      metadata: { reason },
    });

    count += 1;
  }

  return count;
}

// ── Pass 2: Expire overdue payments and offer second-chance ──

async function sweepOverduePayments(
  client: SweepClient,
  reason: 'interval' | 'manual',
): Promise<number> {
  const overdue = await client.query<{
    id: string;
    listing_id: string;
    seller_id: string;
    title: string;
    winner_bidder_id: string;
    winner_bid_id: number;
  }>(
    `
      SELECT a.id, a.listing_id, a.seller_id, l.title,
             a.winner_bidder_id, a.winner_bid_id
      FROM auctions a
      INNER JOIN listings l ON l.id = a.listing_id
      WHERE a.status = 'awaiting_payment'
        AND a.payment_deadline_at <= NOW()
        AND a.cancelled_at IS NULL
        AND a.settled_at IS NULL
      ORDER BY a.payment_deadline_at ASC
      FOR UPDATE SKIP LOCKED
    `,
  );

  if (!overdue.rowCount) return 0;

  let count = 0;
  for (const auction of overdue.rows) {
    // The winner who failed to pay is recorded in second_chance_declined_ids
    // so no later pass re-offers to them, then the chain advances to the
    // next-highest eligible bidder — or relists when bidders are exhausted.
    await advanceSecondChanceOffer({
      client,
      auction,
      excludeBidderId: auction.winner_bidder_id,
      reason,
    });
    count += 1;
  }

  return count;
}

// ── Pass 3: Expire unanswered second-chance offers ──
// An offer lives in status 'payment_expired' with second_chance_offered_to
// set; when the 24h deadline lapses without an accept, the recipient joins
// the declined set and the chain advances to the next eligible bidder — or
// the listing is relisted when no eligible bidder remains.

async function sweepExpiredSecondChanceOffers(
  client: SweepClient,
  reason: 'interval' | 'manual',
): Promise<number> {
  const expired = await client.query<{
    id: string;
    listing_id: string;
    seller_id: string;
    title: string;
    second_chance_offered_to: string;
  }>(
    `
      SELECT a.id, a.listing_id, a.seller_id, l.title,
             a.second_chance_offered_to
      FROM auctions a
      INNER JOIN listings l ON l.id = a.listing_id
      WHERE a.status = 'payment_expired'
        AND a.second_chance_offered_to IS NOT NULL
        AND a.payment_deadline_at <= NOW()
        AND a.cancelled_at IS NULL
        AND a.settled_at IS NULL
      ORDER BY a.payment_deadline_at ASC
      FOR UPDATE OF a SKIP LOCKED
    `,
  );

  if (!expired.rowCount) return 0;

  let count = 0;
  for (const auction of expired.rows) {
    await advanceSecondChanceOffer({
      client,
      auction,
      excludeBidderId: auction.second_chance_offered_to,
      reason,
    });
    count += 1;
  }

  return count;
}
