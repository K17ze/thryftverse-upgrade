import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';

// ── Types ──

interface DepthLevel {
  price: number;
  cumulativeUnits: number;
  orderCount: number;
}

interface TradeRow {
  id: number;
  priceGbp: number;
  units: number;
  side: 'buy' | 'sell';
  timestamp: string;
}

// coOwn_trades has no persisted taker_side column. The matching engine
// (see coOwn.ts) inserts the incoming/taker order immediately before it
// crosses resting liquidity, so the taker order id is strictly greater than
// the resting/maker order id. We derive the taker side from that invariant:
//   - buy taker  => buy_order_id > sell_order_id (or sell_order_id IS NULL
//     for primary issuance fills where the issuer is the passive seller)
//   - sell taker => sell_order_id > buy_order_id
// P2-1: Buyout acceptances insert trades with both order ids NULL — the
// accepting holder is the seller (taker), so we explicitly label that case
// 'sell' before the buy-taker branch. This is robust under the current
// monotonic-id placement flow.
const TAKER_SIDE_SQL = `
  CASE
    WHEN buy_order_id IS NULL AND sell_order_id IS NULL THEN 'sell'
    WHEN sell_order_id IS NULL OR buy_order_id > sell_order_id THEN 'buy'
    ELSE 'sell'
  END
`;

// ── Plugin ──

export default async function coOwnDepthRoutes(app: FastifyInstance): Promise<void> {
  // ── 1. GET /co-own/assets/:assetId/depth ──
  // Cumulative depth for depth-chart visualization. Aggregates all live
  // (open / partially_filled, non-expired) resting orders by price level,
  // then computes a cumulative sum per side and the spread/mid/last price.
  app.get<{ Params: { assetId: string } }>(
    '/co-own/assets/:assetId/depth',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsSchema = z.object({ assetId: z.string().min(2) });
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid asset id' };
      }
      const { assetId } = parsed.data;

      try {
        // Aggregate live orders by price level and side in a single query.
        // Ordering by side then price keeps the query index-friendly; the
        // per-side sort and cumulative sum are finalised in JS below.
        const levelsResult = await db.query<{
          side: 'buy' | 'sell';
          unit_price_gbp: string;
          units: string;
          order_count: string;
        }>(
          `
            SELECT
              side,
              unit_price_gbp::text,
              SUM(remaining_units)::text AS units,
              COUNT(*)::text AS order_count
            FROM coOwn_orders
            WHERE asset_id = $1
              AND status IN ('open', 'partially_filled')
              AND remaining_units > 0
              AND (expires_at IS NULL OR expires_at > NOW())
            GROUP BY unit_price_gbp, side
            ORDER BY side, unit_price_gbp
          `,
          [assetId],
        );

        // Split into per-side price levels.
        const rawBids = levelsResult.rows
          .filter((r) => r.side === 'buy')
          .map((r) => ({
            price: Number(r.unit_price_gbp),
            units: Number(r.units),
            orderCount: Number(r.order_count),
          }))
          .sort((a, b) => b.price - a.price); // best bid first (descending)
        const rawAsks = levelsResult.rows
          .filter((r) => r.side === 'sell')
          .map((r) => ({
            price: Number(r.unit_price_gbp),
            units: Number(r.units),
            orderCount: Number(r.order_count),
          }))
          .sort((a, b) => a.price - b.price); // best ask first (ascending)

        // Cumulative sums in display order: top of book has the smallest
        // cumulative depth, deepest level has the total side depth.
        const bids: DepthLevel[] = [];
        let bidTotal = 0;
        for (const lvl of rawBids) {
          bidTotal += lvl.units;
          bids.push({
            price: lvl.price,
            cumulativeUnits: bidTotal,
            orderCount: lvl.orderCount,
          });
        }

        const asks: DepthLevel[] = [];
        let askTotal = 0;
        for (const lvl of rawAsks) {
          askTotal += lvl.units;
          asks.push({
            price: lvl.price,
            cumulativeUnits: askTotal,
            orderCount: lvl.orderCount,
          });
        }

        // Spread & mid derived from the top of the book.
        const bestBid = rawBids.length > 0 ? rawBids[0].price : null;
        const bestAsk = rawAsks.length > 0 ? rawAsks[0].price : null;
        const spreadGbp =
          bestBid !== null && bestAsk !== null
            ? Number((bestAsk - bestBid).toFixed(4))
            : null;
        const midPriceGbp =
          bestBid !== null && bestAsk !== null
            ? Number(((bestBid + bestAsk) / 2).toFixed(4))
            : null;

        // Last trade price from the most recent settled trade.
        const lastTradeResult = await db.query<{ unit_price_gbp: string }>(
          `
            SELECT unit_price_gbp::text
            FROM coOwn_trades
            WHERE asset_id = $1
              AND settlement_status = 'settled'
            ORDER BY created_at DESC, id DESC
            LIMIT 1
          `,
          [assetId],
        );
        const lastPriceGbp =
          lastTradeResult.rows.length > 0
            ? Number(lastTradeResult.rows[0].unit_price_gbp)
            : null;

        return {
          ok: true,
          assetId,
          bids,
          asks,
          spreadGbp,
          midPriceGbp,
          lastPriceGbp,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        request.log.error({ err: error, assetId }, 'co-own depth query failed');
        reply.code(500);
        return { ok: false, error: 'Failed to load market depth' };
      }
    },
  );

  // ── 2. GET /co-own/assets/:assetId/trades ──
  // Recent trades (time & sales tape) with cursor pagination by trade id.
  app.get<{ Params: { assetId: string } }>(
    '/co-own/assets/:assetId/trades',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsSchema = z.object({ assetId: z.string().min(2) });
      const paramsParsed = paramsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid asset id' };
      }
      const { assetId } = paramsParsed.data;

      const querySchema = z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        cursor: z
          .string()
          .optional()
          .transform((v) => (v && v.length > 0 ? Number(v) : null))
          .refine((v) => v === null || (Number.isInteger(v) && v > 0), {
            message: 'cursor must be a positive integer trade id',
          }),
      });
      const queryParsed = querySchema.safeParse(request.query);
      if (!queryParsed.success) {
        reply.code(400);
        return {
          ok: false,
          error: 'Invalid query parameters',
          details: queryParsed.error.flatten(),
        };
      }
      const { limit, cursor } = queryParsed.data;

      try {
        const tradesResult = await db.query<{
          id: string;
          unit_price_gbp: string;
          units: number;
          side: 'buy' | 'sell';
          created_at: string;
        }>(
          `
            SELECT
              id::text,
              unit_price_gbp::text,
              units,
              ${TAKER_SIDE_SQL} AS side,
              created_at
            FROM coOwn_trades
            WHERE asset_id = $1
              AND settlement_status = 'settled'
              AND ($2::bigint IS NULL OR id < $2)
            ORDER BY id DESC
            LIMIT $3
          `,
          [assetId, cursor, limit],
        );

        const trades: TradeRow[] = tradesResult.rows.map((row) => ({
          id: Number(row.id),
          priceGbp: Number(row.unit_price_gbp),
          units: Number(row.units),
          side: row.side,
          timestamp: row.created_at,
        }));

        const nextCursor =
          trades.length === limit && trades.length > 0
            ? String(trades[trades.length - 1].id)
            : null;

        return {
          ok: true,
          assetId,
          trades,
          nextCursor,
        };
      } catch (error) {
        request.log.error({ err: error, assetId }, 'co-own trades query failed');
        reply.code(500);
        return { ok: false, error: 'Failed to load trades' };
      }
    },
  );
}
