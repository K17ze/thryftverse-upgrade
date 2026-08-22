/**
 * Expired-auction sweep handler.
 *
 * Extracted verbatim from `src/index.ts` (`sweepExpiredAuctions`). Settles
 * auctions whose `ends_at` has passed, posts ledger entries for winners, and
 * notifies the buyer/seller. Self-contained: imports lib modules and the
 * shared worker runtime/helpers directly.
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

export async function sweepExpiredAuctions(reason: 'interval' | 'manual'): Promise<number> {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const expiring = await client.query<{
      id: string;
      listing_id: string;
      seller_id: string;
      title: string;
    }>(
      `
        SELECT a.id, a.listing_id, a.seller_id, l.title
        FROM auctions a
        INNER JOIN listings l ON l.id = a.listing_id
        WHERE a.ends_at <= NOW()
          AND (a.status <> 'ended' OR a.settled_at IS NULL)
        ORDER BY a.ends_at ASC
        FOR UPDATE SKIP LOCKED
      `
    );

    if (!expiring.rowCount) {
      await client.query('COMMIT');
      recordAuctionSettlement('no_action');
      return 0;
    }

    const canPostAuctionLedger = await ledgerTablesAvailable(client);

    for (const auction of expiring.rows) {
      const winner = await client.query<{
        id: number;
        bidder_id: string;
        amount_gbp: string;
      }>(
        `
          SELECT id, bidder_id, amount_gbp::text
          FROM auction_bids
          WHERE auction_id = $1
          ORDER BY amount_gbp DESC, created_at ASC, id ASC
          LIMIT 1
        `,
        [auction.id]
      );

      const topBid = winner.rows[0];
      const winningBidGbp = topBid ? Number(topBid.amount_gbp) : 0;
      const platformFeeGbp = topBid ? calculateAuctionPlatformFeeGbp(winningBidGbp) : 0;
      const sellerNetGbp = topBid ? roundTo(Math.max(0, winningBidGbp - platformFeeGbp), 2) : 0;

      await client.query(
        `
          UPDATE auctions
          SET
            status = 'ended',
            settled_at = NOW(),
            winner_bid_id = $2,
            winner_bidder_id = $3,
            updated_at = NOW()
          WHERE id = $1
        `,
        [auction.id, topBid?.id ?? null, topBid?.bidder_id ?? null]
      );

      // If the auction has a winner, mark the underlying listing as sold.
      // If no winner (reserve not met / no bids), reactivate the listing so
      // the seller can relist or try again.
      if (topBid?.bidder_id) {
        await client.query(
          `UPDATE listings
           SET status = 'sold', updated_at = NOW()
           WHERE id = $1`,
          [auction.listing_id]
        );
      } else {
        await client.query(
          `UPDATE listings
           SET status = 'active', updated_at = NOW()
           WHERE id = $1 AND status = 'paused'`,
          [auction.listing_id]
        );
      }

      if (topBid?.bidder_id && canPostAuctionLedger) {
        await postAuctionSettlementLedgerEntries(client, {
          auctionId: auction.id,
          buyerId: topBid.bidder_id,
          sellerId: auction.seller_id,
          winningBidGbp,
          platformFeeGbp,
        });
      }

      publishRealtimeEvent({
        topic: `auction:${auction.id}`,
        type: 'auction.settled',
        payload: {
          auctionId: auction.id,
          listingId: auction.listing_id,
          winnerBidderId: topBid?.bidder_id ?? null,
          winnerAmountGbp: topBid ? winningBidGbp : null,
          platformFeeRate: topBid ? AUCTION_PLATFORM_FEE_RATE : null,
          platformFeeGbp: topBid ? platformFeeGbp : null,
          sellerNetGbp: topBid ? sellerNetGbp : null,
          reason,
        },
      });

      if (topBid?.bidder_id) {
        await queueUserNotification({
          userId: topBid.bidder_id,
          title: 'Auction won',
          body: `You won ${auction.title}`,
          payload: {
            auctionId: auction.id,
            listingId: auction.listing_id,
            event: 'auction_won',
          },
          route: { screen: 'AuctionDetail', params: { auctionId: auction.id } },
          metadata: { reason },
        });
      }

      await queueUserNotification({
        userId: auction.seller_id,
        title: 'Auction settled',
        body: topBid?.bidder_id
          ? `${auction.title} settled with a winning bid.`
          : `${auction.title} ended without bids.`,
        payload: {
          auctionId: auction.id,
          listingId: auction.listing_id,
          event: topBid?.bidder_id ? 'auction_sold' : 'auction_no_sale',
        },
        route: { screen: 'AuctionDetail', params: { auctionId: auction.id } },
        metadata: { reason },
      });
    }

    await client.query('COMMIT');
    recordAuctionSettlement('settled');
    return expiring.rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    recordAuctionSettlement('failed');
    throw error;
  } finally {
    client.release();
  }
}
