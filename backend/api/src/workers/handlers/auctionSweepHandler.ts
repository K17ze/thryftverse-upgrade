/**
 * Expired-auction sweep handler.
 *
 * T20 lifecycle closure: enforces reserve price at settlement, gates
 * listing-sold + ledger on payment confirmation, and handles payment
 * deadline expiry with second-chance offers to the next-highest bidder.
 *
 * Two sweep passes per invocation:
 *   1. End expired auctions (ends_at <= NOW, status in live/upcoming)
 *      → reserve_not_met | awaiting_payment
 *   2. Expire overdue payments (status = awaiting_payment, deadline passed)
 *      → second_chance to next bidder | payment_expired + relist
 */
import { db } from '../../db/pool.js';
import { recordAuctionSettlement } from '../../lib/metrics.js';
import { publishRealtimeEvent } from '../../lib/realtime.js';
import {
  AUCTION_PLATFORM_FEE_RATE,
  calculateAuctionPlatformFeeGbp,
  ledgerTablesAvailable,
  roundTo,
} from '../../lib/workerHelpers.js';
import {
  postAuctionSettlementLedgerEntries,
  queueUserNotification,
} from '../../lib/workerRuntime.js';

export type AuctionSweepHandlerDeps = {
  /** Uses shared db singleton + worker runtime helpers. */
};

/** Payment deadline for the initial winner (72h). */
const PAYMENT_DEADLINE_HOURS = 72;
/** Payment deadline for a second-chance winner (24h). */
const SECOND_CHANCE_DEADLINE_HOURS = 24;

export async function sweepExpiredAuctions(reason: 'interval' | 'manual'): Promise<number> {
  const client = await db.connect();
  let processed = 0;

  try {
    await client.query('BEGIN');

    // ── Pass 1: End expired auctions ──
    processed += await sweepEndedAuctions(client, reason);

    // ── Pass 2: Expire overdue payments ──
    processed += await sweepOverduePayments(client, reason);

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
  client: { query: <T = any>(text: string, values?: any[]) => Promise<{ rows: T[]; rowCount?: number }> },
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
        `UPDATE listings SET status = 'active', updated_at = NOW()
         WHERE id = $1 AND status = 'paused'`,
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
        eventType: 'auction_won',
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
            eventType: 'auction_ending_soon',
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
      eventType: 'auction_bid',
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
  client: { query: <T = any>(text: string, values?: any[]) => Promise<{ rows: T[]; rowCount?: number }> },
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
    // Find the next-highest bidder (excluding the current winner)
    const nextBidder = await client.query<{
      id: number;
      bidder_id: string;
      amount_gbp: string;
    }>(
      `
        SELECT id, bidder_id, amount_gbp::text
        FROM auction_bids
        WHERE auction_id = $1 AND bidder_id <> $2
        ORDER BY amount_gbp DESC, created_at ASC, id ASC
        LIMIT 1
      `,
      [auction.id, auction.winner_bidder_id],
    );

    const next = nextBidder.rows[0] ?? null;

    if (next) {
      // Offer second chance to the next-highest bidder
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

      // Notify the next bidder
      await queueUserNotification({
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
        metadata: { reason },
      });

      // Notify seller
      await queueUserNotification({
        userId: auction.seller_id,
        title: 'Payment expired — second chance offered',
        body: `The winner of ${auction.title} didn't pay. We've offered it to the next bidder.`,
        eventType: 'auction_bid',
        payload: { auctionId: auction.id, event: 'auction_second_chance_seller' },
        route: { screen: 'AuctionDetail', params: { auctionId: auction.id } },
        metadata: { reason },
      });
    } else {
      // No next bidder — relist the item
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
        `UPDATE listings SET status = 'active', updated_at = NOW()
         WHERE id = $1 AND status = 'paused'`,
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

      // Notify seller
      await queueUserNotification({
        userId: auction.seller_id,
        title: 'Payment expired — item relisted',
        body: `The winner of ${auction.title} didn't pay and there are no other bidders. Your listing has been reactivated.`,
        eventType: 'auction_bid',
        payload: { auctionId: auction.id, event: 'auction_payment_expired_relist' },
        route: { screen: 'AuctionDetail', params: { auctionId: auction.id } },
        metadata: { reason },
      });
    }

    count += 1;
  }

  return count;
}
