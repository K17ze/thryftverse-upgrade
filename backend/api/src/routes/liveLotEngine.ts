import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { publishRealtimeEvent } from '../lib/realtime.js';
import { emitOrderCommerceCard } from '../lib/orderChatCards.js';

// ── Local helpers (mirrored from routes/orders.ts) ───────────────────────────

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function createRuntimeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

// ── Types ────────────────────────────────────────────────────────────────────

type LiveLotRow = {
  id: string;
  session_id: string;
  listing_id: string;
  lot_number: number;
  position: number;
  status: string;
  currency: string;
  start_price_minor: string;
  reserve_price_minor: string | null;
  min_increment_minor: string;
  high_bid_id: string | null;
  high_bid_minor: string;
  high_bidder_id: string | null;
  winner_id: string | null;
  order_id: string | null;
  version: number;
  opens_at: string | null;
  closes_at: string | null;
  closed_at: string | null;
  extension_count: number;
  created_at: string;
  updated_at: string;
};

type LiveLotSnapshotRow = {
  lot_id: string;
  listing_id: string;
  seller_id: string;
  title: string;
  description: string | null;
  condition: string | null;
  category: string | null;
  brand: string | null;
  size: string | null;
  price_gbp: string;
  image_url: string | null;
  images: unknown;
  captured_at: string;
};

type LiveShoppingSessionRow = {
  id: string;
  title: string;
  host_user_id: string;
  status: string;
};

interface ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

type LiveLotEngineDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => ApiError;
  calculateCommercePlatformChargeGbp: (subtotalGbp: number) => number;
};

// ── Schemas ──────────────────────────────────────────────────────────────────

const sessionIdParamsSchema = z.object({
  sessionId: z.string().min(2).max(200),
});

const lotParamsSchema = z.object({
  sessionId: z.string().min(2).max(200),
  lotId: z.string().min(2).max(200),
});

const scheduleLotSchema = z.object({
  listingId: z.string().min(1),
  lotNumber: z.number().int().min(1),
  position: z.number().int().min(0).optional().default(0),
  startPriceMinor: z.number().int().min(0).optional().default(0),
  reservePriceMinor: z.number().int().min(0).optional(),
  minIncrementMinor: z.number().int().min(0).optional().default(100),
  currency: z.string().length(3).optional().default('GBP'),
});

const openLotSchema = z.object({
  /** Absolute close deadline — wins over durationSeconds when both are sent. */
  closesAt: z.string().datetime({ offset: true }).optional(),
  /** Bidding window in seconds; the engine sets closes_at = NOW() + duration. */
  durationSeconds: z.number().int().min(5).max(3600).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const liveSessionTopic = (sessionId: string) => `live.session:${sessionId}`;

// ── Anti-snipe + auto-close policy ──────────────────────────────────────────
// A bid landing inside the window pushes `closes_at` out by the extension
// amount, capped so a lot cannot be extended indefinitely. Mirrors the
// per-auction anti-sniping convention (window / extension / max extensions).
export const LIVE_LOT_ANTI_SNIPE_WINDOW_MS = 30_000;
export const LIVE_LOT_ANTI_SNIPE_EXTENSION_SECONDS = 30;
export const LIVE_LOT_ANTI_SNIPE_MAX_EXTENSIONS = 5;

const mapLotRow = (row: LiveLotRow) => ({
  id: row.id,
  sessionId: row.session_id,
  listingId: row.listing_id,
  lotNumber: row.lot_number,
  position: row.position,
  status: row.status,
  currency: row.currency,
  startPriceMinor: Number(row.start_price_minor),
  reservePriceMinor: row.reserve_price_minor === null ? null : Number(row.reserve_price_minor),
  minIncrementMinor: Number(row.min_increment_minor),
  highBidId: row.high_bid_id,
  highBidMinor: Number(row.high_bid_minor),
  highBidderId: row.high_bidder_id,
  winnerId: row.winner_id,
  orderId: row.order_id,
  version: row.version,
  opensAt: row.opens_at,
  closesAt: row.closes_at,
  closedAt: row.closed_at,
  extensionCount: row.extension_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSnapshotRow = (row: LiveLotSnapshotRow) => ({
  lotId: row.lot_id,
  listingId: row.listing_id,
  sellerId: row.seller_id,
  title: row.title,
  description: row.description,
  condition: row.condition,
  category: row.category,
  brand: row.brand,
  size: row.size,
  priceGbp: Number(row.price_gbp),
  imageUrl: row.image_url,
  images: row.images,
  capturedAt: row.captured_at,
});

async function fetchSessionRow(
  db: Pool,
  sessionId: string,
): Promise<LiveShoppingSessionRow | null> {
  const result = await db.query<LiveShoppingSessionRow>(
    `SELECT id, title, host_user_id, status FROM live_shopping_sessions WHERE id = $1 LIMIT 1`,
    [sessionId],
  );
  return result.rows[0] ?? null;
}

async function fetchSnapshotRow(
  db: Pool | PoolClient,
  lotId: string,
): Promise<LiveLotSnapshotRow | null> {
  const result = await db.query<LiveLotSnapshotRow>(
    `SELECT * FROM live_lot_snapshots WHERE lot_id = $1 LIMIT 1`,
    [lotId],
  );
  return result.rows[0] ?? null;
}

/** Append a row to the `live_lot_events` append-only log. */
async function appendLotEvent(
  client: PoolClient,
  input: {
    lotId: string;
    sessionId: string;
    eventType: string;
    eventVersion: number;
    actorId: string | null;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO live_lot_events (id, lot_id, session_id, event_type, event_version, actor_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      randomUUID(),
      input.lotId,
      input.sessionId,
      input.eventType,
      input.eventVersion,
      input.actorId,
      toJsonString(input.payload),
    ],
  );
}

// ── Shared close path ────────────────────────────────────────────────────────

export type LiveLotCloseResult =
  | {
      closed: true;
      lot: ReturnType<typeof mapLotRow>;
      outcome: 'sold' | 'passed';
      winnerId: string | null;
      highBidMinor: number;
      hasBids: boolean;
      reservePriceMinor: number | null;
    }
  | {
      closed: false;
      code: 'LOT_NOT_FOUND' | 'LOT_NOT_CLOSABLE' | 'LOT_NOT_DUE';
      status?: string;
    };

/**
 * The single lot-close path. The host-facing close route and the auto-close
 * sweep both call this — one transaction locks the lot, resolves the outcome
 * (sold above reserve / passed otherwise), bumps the optimistic version,
 * appends `lot.closed` + `lot.sold`/`lot.passed` to the event log, commits,
 * then fans the same realtime events out on the session topic.
 *
 * `reason` records who closed the lot ('host' | 'auto_close') in the event
 * log and realtime payload. Settlement stays a separate, explicit step —
 * close only decides the outcome and freezes the lot.
 */
export async function closeLiveLot(
  db: Pool,
  input: {
    sessionId: string;
    lotId: string;
    actorId: string | null;
    reason: 'host' | 'auto_close';
  },
): Promise<LiveLotCloseResult> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const lotResult = await client.query<LiveLotRow & { due_now: boolean }>(
      `SELECT *, (closes_at IS NOT NULL AND closes_at <= NOW()) AS due_now
         FROM live_lots WHERE id = $1 AND session_id = $2 FOR UPDATE`,
      [input.lotId, input.sessionId],
    );
    const lot = lotResult.rows[0];
    if (!lot) {
      await client.query('ROLLBACK');
      return { closed: false, code: 'LOT_NOT_FOUND' };
    }
    if (lot.status !== 'open' && lot.status !== 'closing') {
      await client.query('ROLLBACK');
      return { closed: false, code: 'LOT_NOT_CLOSABLE', status: lot.status };
    }

    // Auto-close only: the sweep's due-scan runs in autocommit, so a bid
    // committed before the deadline may have applied an anti-snipe
    // extension between the scan and this lock. Re-verify the deadline on
    // the locked row against the DB clock — if the lot is no longer due,
    // leave it open for the next sweep pass instead of truncating a
    // legitimate extension. Host closes bypass this check on purpose.
    if (input.reason === 'auto_close' && !lot.due_now) {
      await client.query('ROLLBACK');
      return { closed: false, code: 'LOT_NOT_DUE', status: lot.status };
    }

    const highBidMinor = Number(lot.high_bid_minor);
    const reservePriceMinor =
      lot.reserve_price_minor === null ? null : Number(lot.reserve_price_minor);
    const hasBids = highBidMinor > 0 && lot.high_bidder_id !== null;
    const meetsReserve =
      reservePriceMinor === null || highBidMinor >= reservePriceMinor;

    let newStatus: 'sold' | 'passed';
    let winnerId: string | null = null;

    if (hasBids && meetsReserve) {
      newStatus = 'sold';
      winnerId = lot.high_bidder_id;
    } else {
      newStatus = 'passed';
    }

    const updated = await client.query<LiveLotRow>(
      `UPDATE live_lots
         SET status = $2,
             winner_id = $3,
             closed_at = NOW(),
             version = version + 1,
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [input.lotId, newStatus, winnerId],
    );
    const closedLot = updated.rows[0];

    await appendLotEvent(client, {
      lotId: input.lotId,
      sessionId: input.sessionId,
      eventType: 'lot.closed',
      eventVersion: closedLot.version,
      actorId: input.actorId,
      payload: {
        lotId: input.lotId,
        status: newStatus,
        highBidMinor,
        reservePriceMinor,
        winnerId,
        closeReason: input.reason,
      },
    });

    if (newStatus === 'sold') {
      await appendLotEvent(client, {
        lotId: input.lotId,
        sessionId: input.sessionId,
        eventType: 'lot.sold',
        eventVersion: closedLot.version,
        actorId: input.actorId,
        payload: { lotId: input.lotId, winnerId, highBidMinor },
      });
    } else {
      await appendLotEvent(client, {
        lotId: input.lotId,
        sessionId: input.sessionId,
        eventType: 'lot.passed',
        eventVersion: closedLot.version,
        actorId: input.actorId,
        payload: {
          lotId: input.lotId,
          reason: hasBids ? 'reserve_not_met' : 'no_bids',
        },
      });
    }

    await client.query('COMMIT');

    const lotDto = mapLotRow(closedLot);

    void publishRealtimeEvent({
      topic: liveSessionTopic(input.sessionId),
      type: 'lot.closed',
      payload: {
        lot: lotDto,
        outcome: newStatus,
        winnerId,
        highBidMinor,
        reason: input.reason,
      },
      seq: true,
      version: 1,
    });

    if (newStatus === 'sold') {
      void publishRealtimeEvent({
        topic: liveSessionTopic(input.sessionId),
        type: 'lot.sold',
        payload: { lot: lotDto, winnerId, highBidMinor },
        seq: true,
        version: 1,
      });
    } else {
      void publishRealtimeEvent({
        topic: liveSessionTopic(input.sessionId),
        type: 'lot.passed',
        payload: {
          lot: lotDto,
          reason: hasBids ? 'reserve_not_met' : 'no_bids',
        },
        seq: true,
        version: 1,
      });
    }

    return {
      closed: true,
      lot: lotDto,
      outcome: newStatus,
      winnerId,
      highBidMinor,
      hasBids,
      reservePriceMinor,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export type LiveLotSweepSummary = {
  lotId: string;
  sessionId: string;
  listingId: string;
  status: 'sold' | 'passed';
  winnerId: string | null;
  highBidMinor: number;
  reservePriceMinor: number | null;
};

/**
 * Auto-close pass: closes every open lot whose server-set `closes_at` has
 * passed, each through the shared `closeLiveLot` path in its own transaction
 * so one failing lot never blocks the rest of the sweep.
 *
 * Callers: the periodic `live_lot_sweep` worker job (all sessions) and the
 * per-session `/lots/auto-close` endpoint.
 */
export async function sweepDueLiveLots(
  db: Pool,
  options: { sessionId?: string; limit?: number } = {},
): Promise<{
  closedLots: LiveLotSweepSummary[];
  failedLots: { lotId: string; sessionId: string; error: string }[];
}> {
  const limit = options.limit ?? 100;
  const due = options.sessionId
    ? await db.query<{ id: string; session_id: string }>(
        `SELECT id, session_id FROM live_lots
          WHERE session_id = $1
            AND status IN ('open', 'closing')
            AND closes_at IS NOT NULL
            AND closes_at <= NOW()
          ORDER BY closes_at ASC
          LIMIT $2`,
        [options.sessionId, limit],
      )
    : await db.query<{ id: string; session_id: string }>(
        `SELECT id, session_id FROM live_lots
          WHERE status IN ('open', 'closing')
            AND closes_at IS NOT NULL
            AND closes_at <= NOW()
          ORDER BY closes_at ASC
          LIMIT $1`,
        [limit],
      );

  const closedLots: LiveLotSweepSummary[] = [];
  const failedLots: { lotId: string; sessionId: string; error: string }[] = [];
  for (const row of due.rows) {
    // A racing closer (host route or another sweep) may have won the row
    // between the due-scan and the lock — closeLiveLot reports that as
    // not-closed and the row is skipped. A bid committed pre-deadline may
    // likewise have pushed closes_at out (anti-snipe); the close path
    // re-verifies the deadline under the lock and reports LOT_NOT_DUE.
    try {
      const result = await closeLiveLot(db, {
        sessionId: row.session_id,
        lotId: row.id,
        actorId: null,
        reason: 'auto_close',
      });
      if (result.closed) {
        closedLots.push({
          lotId: row.id,
          sessionId: row.session_id,
          listingId: result.lot.listingId,
          status: result.outcome,
          winnerId: result.winnerId,
          highBidMinor: result.highBidMinor,
          reservePriceMinor: result.reservePriceMinor,
        });
      }
    } catch (err) {
      // One failing lot must never abort the sweep — record it and move on
      // so the remaining due lots still close this pass.
      failedLots.push({
        lotId: row.id,
        sessionId: row.session_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { closedLots, failedLots };
}

// ── Route registration ───────────────────────────────────────────────────────

/**
 * Register the authoritative lot engine routes for live shopping auctions.
 *
 * Every state-mutating endpoint runs inside a serialisable transaction with
 * `SELECT ... FOR UPDATE` on the `live_lots` row, bumps the optimistic
 * concurrency `version`, appends to `live_lot_events`, and emits a realtime
 * event after commit. Reads are non-locking.
 */
export const registerLiveLotEngineRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
  createApiError,
  calculateCommercePlatformChargeGbp,
}: LiveLotEngineDependencies) => {

  // ── 1. POST /streaming/sessions/:sessionId/lots — schedule a new lot ──────
  app.post('/streaming/sessions/:sessionId/lots', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const payload = scheduleLotSchema.parse(request.body);

    const session = await fetchSessionRow(db, sessionId);
    if (!session) {
      throw createApiError('STREAM_NOT_FOUND', `Stream session ${sessionId} not found`);
    }
    if (session.host_user_id !== userId && request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden: only the host can schedule lots', code: 'FORBIDDEN' };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Lock the listing to read a consistent snapshot.
      const listingResult = await client.query<{
        id: string;
        seller_id: string;
        title: string;
        description: string;
        condition: string | null;
        category: string | null;
        brand: string | null;
        size: string | null;
        price_gbp: number | string;
        image_url: string | null;
        status: string;
      }>(
        `SELECT id, seller_id, title, description, condition, category, brand, size,
                price_gbp, image_url, status
         FROM listings
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [payload.listingId],
      );
      const listing = listingResult.rows[0];
      if (!listing) {
        await client.query('ROLLBACK');
        throw createApiError('LISTING_NOT_FOUND', `Listing ${payload.listingId} not found`);
      }
      // The listing must be active (or already paused/reserved by a prior lot
      // in the same session) to be eligible for auction.
      if (
        listing.status !== 'active'
        && listing.status !== 'paused'
        && listing.status !== 'risk_pending'
      ) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Listing is not eligible for auction (status='${listing.status}')`,
          code: 'LISTING_NOT_ELIGIBLE',
        };
      }

      const lotId = `lot_${randomUUID()}`;
      const lotInsert = await client.query<LiveLotRow>(
        `INSERT INTO live_lots
           (id, session_id, listing_id, lot_number, position, status,
            currency, start_price_minor, reserve_price_minor, min_increment_minor,
            version)
         VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, $7, $8, $9, 1)
         RETURNING *`,
        [
          lotId,
          sessionId,
          payload.listingId,
          payload.lotNumber,
          payload.position,
          payload.currency,
          payload.startPriceMinor,
          payload.reservePriceMinor ?? null,
          payload.minIncrementMinor,
        ],
      );
      const lot = lotInsert.rows[0];

      // Capture an immutable snapshot of the listing at schedule time.
      await client.query(
        `INSERT INTO live_lot_snapshots
           (lot_id, listing_id, seller_id, title, description, condition,
            category, brand, size, price_gbp, image_url, images)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
        [
          lotId,
          listing.id,
          listing.seller_id,
          listing.title,
          listing.description,
          listing.condition,
          listing.category,
          listing.brand,
          listing.size,
          roundTo(Number(listing.price_gbp), 2),
          listing.image_url,
          null,
        ],
      );

      await appendLotEvent(client, {
        lotId,
        sessionId,
        eventType: 'lot.scheduled',
        eventVersion: 1,
        actorId: userId,
        payload: {
          lotId,
          listingId: payload.listingId,
          lotNumber: payload.lotNumber,
          startPriceMinor: payload.startPriceMinor,
          reservePriceMinor: payload.reservePriceMinor ?? null,
        },
      });

      await client.query('COMMIT');

      const snapshot = await fetchSnapshotRow(db, lotId);
      const lotDto = mapLotRow(lot);

      void publishRealtimeEvent({
        topic: liveSessionTopic(sessionId),
        type: 'lot.scheduled',
        payload: { lot: lotDto, snapshot: snapshot ? mapSnapshotRow(snapshot) : null },
        seq: true,
        version: 1,
      });

      reply.code(201);
      return { ok: true, lot: lotDto, snapshot: snapshot ? mapSnapshotRow(snapshot) : null };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // ── 2. POST /streaming/sessions/:sessionId/lots/:lotId/open ───────────────
  app.post('/streaming/sessions/:sessionId/lots/:lotId/open', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { sessionId, lotId } = lotParamsSchema.parse(request.params);
    const payload = openLotSchema.parse(request.body ?? {});

    const session = await fetchSessionRow(db, sessionId);
    if (!session) {
      throw createApiError('STREAM_NOT_FOUND', `Stream session ${sessionId} not found`);
    }
    if (session.host_user_id !== userId && request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden: only the host can open lots', code: 'FORBIDDEN' };
    }

    // Server-side deadline: an explicit closesAt wins; otherwise
    // durationSeconds from now. Neither → host-manual close (closes_at NULL).
    const closesAt = payload.closesAt
      ? new Date(payload.closesAt)
      : payload.durationSeconds != null
        ? new Date(Date.now() + payload.durationSeconds * 1000)
        : null;
    if (closesAt && closesAt.getTime() <= Date.now()) {
      reply.code(422);
      return {
        ok: false,
        error: 'closesAt/durationSeconds must produce a deadline in the future',
        code: 'LOT_CLOSES_AT_INVALID',
      };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const lotResult = await client.query<LiveLotRow>(
        `SELECT * FROM live_lots WHERE id = $1 AND session_id = $2 FOR UPDATE`,
        [lotId, sessionId],
      );
      const lot = lotResult.rows[0];
      if (!lot) {
        await client.query('ROLLBACK');
        throw createApiError('LOT_NOT_FOUND', `Lot ${lotId} not found in session ${sessionId}`);
      }
      // 'closed' was removed from the allow-list: it is not a valid
      // live_lots status (CHECK constraint: scheduled/open/closing/sold/
      // passed/cancelled) so it could never match — dead code.
      if (lot.status !== 'scheduled' && lot.status !== 'passed') {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Lot cannot be opened from status '${lot.status}'`,
          code: 'LOT_NOT_OPENABLE',
        };
      }

      // Re-open starts a fresh bidding round: clear every trace of the
      // previous round's outcome (high bid, bidder, winner, order link,
      // extension budget, closed timestamp) so a passed lot cannot carry
      // stale bid state — or a stale winner — into the new window.
      const updated = await client.query<LiveLotRow>(
        `UPDATE live_lots
           SET status = 'open',
               opens_at = NOW(),
               closes_at = $2,
               high_bid_id = NULL,
               high_bid_minor = 0,
               high_bidder_id = NULL,
               winner_id = NULL,
               order_id = NULL,
               closed_at = NULL,
               extension_count = 0,
               version = version + 1,
               updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [lotId, closesAt],
      );
      const openedLot = updated.rows[0];

      await appendLotEvent(client, {
        lotId,
        sessionId,
        eventType: 'lot.opened',
        eventVersion: openedLot.version,
        actorId: userId,
        payload: {
          lotId,
          status: 'open',
          version: openedLot.version,
          closesAt: openedLot.closes_at,
        },
      });

      await client.query('COMMIT');

      const snapshot = await fetchSnapshotRow(db, lotId);
      const lotDto = mapLotRow(openedLot);

      void publishRealtimeEvent({
        topic: liveSessionTopic(sessionId),
        type: 'lot.opened',
        payload: {
          lot: lotDto,
          snapshot: snapshot ? mapSnapshotRow(snapshot) : null,
        },
        seq: true,
        version: 1,
      });

      return { ok: true, lot: lotDto };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // ── 3. POST /streaming/sessions/:sessionId/lots/:lotId/close ──────────────
  app.post('/streaming/sessions/:sessionId/lots/:lotId/close', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { sessionId, lotId } = lotParamsSchema.parse(request.params);

    const session = await fetchSessionRow(db, sessionId);
    if (!session) {
      throw createApiError('STREAM_NOT_FOUND', `Stream session ${sessionId} not found`);
    }
    if (session.host_user_id !== userId && request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden: only the host can close lots', code: 'FORBIDDEN' };
    }

    // The host close and the auto-close sweep share one close path.
    const result = await closeLiveLot(db, {
      sessionId,
      lotId,
      actorId: userId,
      reason: 'host',
    });
    if (!result.closed) {
      if (result.code === 'LOT_NOT_FOUND') {
        throw createApiError('LOT_NOT_FOUND', `Lot ${lotId} not found in session ${sessionId}`);
      }
      reply.code(409);
      return {
        ok: false,
        error: `Lot cannot be closed from status '${result.status}'`,
        code: 'LOT_NOT_CLOSABLE',
      };
    }

    return { ok: true, lot: result.lot, outcome: result.outcome, winnerId: result.winnerId };
  });

  // ── 4. POST /streaming/sessions/:sessionId/lots/:lotId/cancel ─────────────
  app.post('/streaming/sessions/:sessionId/lots/:lotId/cancel', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { sessionId, lotId } = lotParamsSchema.parse(request.params);

    const session = await fetchSessionRow(db, sessionId);
    if (!session) {
      throw createApiError('STREAM_NOT_FOUND', `Stream session ${sessionId} not found`);
    }
    if (session.host_user_id !== userId && request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden: only the host can cancel lots', code: 'FORBIDDEN' };
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const lotResult = await client.query<LiveLotRow>(
        `SELECT * FROM live_lots WHERE id = $1 AND session_id = $2 FOR UPDATE`,
        [lotId, sessionId],
      );
      const lot = lotResult.rows[0];
      if (!lot) {
        await client.query('ROLLBACK');
        throw createApiError('LOT_NOT_FOUND', `Lot ${lotId} not found in session ${sessionId}`);
      }
      if (lot.status === 'sold' || lot.status === 'cancelled') {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Lot cannot be cancelled from status '${lot.status}'`,
          code: 'LOT_NOT_CANCELLABLE',
        };
      }

      const updated = await client.query<LiveLotRow>(
        `UPDATE live_lots
           SET status = 'cancelled',
               version = version + 1,
               updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [lotId],
      );
      const cancelledLot = updated.rows[0];

      await appendLotEvent(client, {
        lotId,
        sessionId,
        eventType: 'lot.cancelled',
        eventVersion: cancelledLot.version,
        actorId: userId,
        payload: { lotId, previousStatus: lot.status },
      });

      await client.query('COMMIT');

      const lotDto = mapLotRow(cancelledLot);

      void publishRealtimeEvent({
        topic: liveSessionTopic(sessionId),
        type: 'lot.cancelled',
        payload: { lot: lotDto, previousStatus: lot.status },
        seq: true,
        version: 1,
      });

      return { ok: true, lot: lotDto };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // ── 5. GET /streaming/sessions/:sessionId/lots — list lots ────────────────
  app.get('/streaming/sessions/:sessionId/lots', async (request) => {
    resolveAuthenticatedUserId(request);
    const { sessionId } = sessionIdParamsSchema.parse(request.params);

    const session = await fetchSessionRow(db, sessionId);
    if (!session) {
      throw createApiError('STREAM_NOT_FOUND', `Stream session ${sessionId} not found`);
    }

    const lotResult = await db.query<LiveLotRow>(
      `SELECT * FROM live_lots
        WHERE session_id = $1
        ORDER BY position ASC, lot_number ASC`,
      [sessionId],
    );
    const snapshotResult = await db.query<LiveLotSnapshotRow>(
      `SELECT * FROM live_lot_snapshots
        WHERE lot_id = ANY($1::text[])`,
      [lotResult.rows.map((r) => r.id)],
    );
    const snapshotByLotId = new Map(snapshotResult.rows.map((r) => [r.lot_id, r]));

    const lots = lotResult.rows.map((row) => ({
      ...mapLotRow(row),
      snapshot: snapshotByLotId.has(row.id)
        ? mapSnapshotRow(snapshotByLotId.get(row.id)!)
        : null,
    }));

    return { ok: true, lots };
  });

  // ── 6. GET /streaming/sessions/:sessionId/lots/:lotId — single lot ────────
  app.get('/streaming/sessions/:sessionId/lots/:lotId', async (request) => {
    resolveAuthenticatedUserId(request);
    const { sessionId, lotId } = lotParamsSchema.parse(request.params);

    const session = await fetchSessionRow(db, sessionId);
    if (!session) {
      throw createApiError('STREAM_NOT_FOUND', `Stream session ${sessionId} not found`);
    }

    const lotResult = await db.query<LiveLotRow>(
      `SELECT * FROM live_lots WHERE id = $1 AND session_id = $2 LIMIT 1`,
      [lotId, sessionId],
    );
    const lot = lotResult.rows[0];
    if (!lot) {
      throw createApiError('LOT_NOT_FOUND', `Lot ${lotId} not found in session ${sessionId}`);
    }

    const snapshot = await fetchSnapshotRow(db, lotId);

    // Current high bid info from the bid ledger.
    const highBidResult = await db.query<{
      id: string;
      bidder_id: string;
      amount: string;
      created_at: string;
    }>(
      `SELECT id, bidder_id, amount, created_at
         FROM live_shopping_bids
        WHERE lot_id = $1
        ORDER BY amount DESC, created_at ASC
        LIMIT 1`,
      [lotId],
    );
    const highBid = highBidResult.rows[0] ?? null;

    return {
      ok: true,
      lot: mapLotRow(lot),
      snapshot: snapshot ? mapSnapshotRow(snapshot) : null,
      highBid: highBid
        ? {
            id: highBid.id,
            bidderId: highBid.bidder_id,
            amount: Number(highBid.amount),
            createdAt: highBid.created_at,
          }
        : null,
    };
  });

  // ── 7. POST /streaming/sessions/:sessionId/lots/:lotId/settle ─────────────
  app.post('/streaming/sessions/:sessionId/lots/:lotId/settle', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { sessionId, lotId } = lotParamsSchema.parse(request.params);

    const session = await fetchSessionRow(db, sessionId);
    if (!session) {
      throw createApiError('STREAM_NOT_FOUND', `Stream session ${sessionId} not found`);
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Lock the lot row.
      const lotResult = await client.query<LiveLotRow>(
        `SELECT * FROM live_lots WHERE id = $1 AND session_id = $2 FOR UPDATE`,
        [lotId, sessionId],
      );
      const lot = lotResult.rows[0];
      if (!lot) {
        await client.query('ROLLBACK');
        throw createApiError('LOT_NOT_FOUND', `Lot ${lotId} not found in session ${sessionId}`);
      }

      // Idempotent: if an order already exists for this lot, return it.
      if (lot.order_id) {
        const existingOrder = await client.query<{
          id: string;
          buyer_id: string;
          seller_id: string;
          listing_id: string;
          subtotal_gbp: number | string;
          buyer_protection_fee_gbp: number | string;
          postage_fee_gbp: number | string;
          total_gbp: number | string;
          status: string;
          created_at: string;
          updated_at: string;
        }>(
          `SELECT id, buyer_id, seller_id, listing_id,
                  subtotal_gbp, buyer_protection_fee_gbp, postage_fee_gbp, total_gbp,
                  status, created_at::text, updated_at::text
             FROM orders
            WHERE id = $1
            LIMIT 1`,
          [lot.order_id],
        );
        const existing = existingOrder.rows[0];
        if (existing) {
          await client.query('COMMIT');
          return {
            ok: true,
            idempotent: true,
            lot: mapLotRow(lot),
            order: {
              id: existing.id,
              buyerId: existing.buyer_id,
              sellerId: existing.seller_id,
              listingId: existing.listing_id,
              subtotalGbp: Number(existing.subtotal_gbp),
              buyerProtectionFeeGbp: Number(existing.buyer_protection_fee_gbp),
              postageFeeGbp: Number(existing.postage_fee_gbp),
              totalGbp: Number(existing.total_gbp),
              status: existing.status,
              createdAt: existing.created_at,
              updatedAt: existing.updated_at,
            },
          };
        }
      }

      // Authorisation: host/admin or the winner themselves.
      const isHostOrAdmin =
        session.host_user_id === userId || request.authUser?.role === 'admin';
      const isWinner = lot.winner_id === userId;
      if (!isHostOrAdmin && !isWinner) {
        await client.query('ROLLBACK');
        reply.code(403);
        return {
          ok: false,
          error: 'Forbidden: only the host, admin, or winner can settle a lot',
          code: 'FORBIDDEN',
        };
      }

      if (lot.status !== 'sold') {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Lot cannot be settled from status '${lot.status}'`,
          code: 'LOT_NOT_SETTLABLE',
        };
      }
      if (!lot.winner_id) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'Lot has no winner to settle against',
          code: 'LOT_NO_WINNER',
        };
      }

      // Lock the listing.
      const listingResult = await client.query<{
        id: string;
        seller_id: string;
        price_gbp: number | string;
        status: string;
      }>(
        `SELECT id, seller_id, price_gbp, status
         FROM listings
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [lot.listing_id],
      );
      const listing = listingResult.rows[0];
      if (!listing) {
        await client.query('ROLLBACK');
        throw createApiError('LISTING_NOT_FOUND', `Listing ${lot.listing_id} not found`);
      }

      // Reconcile any expired reservation while holding the listing lock.
      let expiredReservationOrderId: string | null = null;
      const expiredReservation = await client.query<{ order_id: string }>(
        `SELECT order_id
           FROM listing_checkout_reservations
          WHERE listing_id = $1
            AND status = 'active'
            AND expires_at <= NOW()
          LIMIT 1
          FOR UPDATE`,
        [lot.listing_id],
      );
      if (expiredReservation.rowCount) {
        expiredReservationOrderId = expiredReservation.rows[0].order_id;
        await client.query(
          `UPDATE orders
              SET status = 'cancelled', updated_at = NOW()
            WHERE id = $1 AND status = 'created'`,
          [expiredReservation.rows[0].order_id],
        );
        listing.status = 'active';
      }

      // The listing must be active or already paused/reserved for this lot.
      if (listing.status !== 'active' && listing.status !== 'paused') {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: `Listing cannot be settled from status '${listing.status}'`,
          code: 'LISTING_NOT_SETTLABLE',
        };
      }

      // Reject a conflicting active reservation from a different checkout.
      const conflictingReservation = await client.query<{ id: string }>(
        `SELECT id
           FROM listing_checkout_reservations
          WHERE listing_id = $1
            AND status = 'active'
            AND expires_at > NOW()
          LIMIT 1`,
        [lot.listing_id],
      );
      if (conflictingReservation.rowCount) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'This listing is currently reserved for another checkout',
          code: 'LISTING_CHECKOUT_RESERVED',
        };
      }

      // Build the order. The winner completes shipping/payment checkout
      // separately, so no shipping quote is required here — postage is 0
      // and the order is left in 'created' for the winner to finalise.
      //
      // The charge is the winning bid, never the listing's list price:
      // `high_bid_minor` was frozen on the lot row at close and is the
      // amount the winner actually committed to. The platform charge must
      // therefore be computed on the bid-derived subtotal.
      const winningBidMinor = Number(lot.high_bid_minor);
      if (!Number.isFinite(winningBidMinor) || winningBidMinor <= 0) {
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: 'Sold lot has no winning bid amount to settle',
          code: 'LOT_NO_WINNING_BID',
        };
      }
      const subtotalGbp = roundTo(winningBidMinor / 100, 2);
      const platformChargeGbp = calculateCommercePlatformChargeGbp(subtotalGbp);
      const postageFeeGbp = 0;
      const totalGbp = roundTo(subtotalGbp + platformChargeGbp + postageFeeGbp, 2);
      const orderId = createRuntimeId('ord');
      const reservationId = createRuntimeId('lres');
      const checkoutExpiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
      const quoteVersion = 'commerce-gbp-2026-07-28.1';
      const idempotencyKey = `lot-settle:${lotId}`;
      const requestHash = crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            lotId,
            listingId: listing.id,
            winnerId: lot.winner_id,
            source: 'live_lot_settlement',
          }),
        )
        .digest('hex');
      const quoteSnapshot = {
        source: 'live_lot_settlement',
        listingId: listing.id,
        lotId,
        winningBidMinor,
        subtotalGbp,
        platformChargeGbp,
        postageFeeGbp,
        totalGbp,
        currency: 'GBP',
        expiresAt: checkoutExpiresAt,
        policyVersion: quoteVersion,
      };
      const quoteHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(quoteSnapshot))
        .digest('hex');

      const insertResult = await client.query<{
        id: string;
        buyer_id: string;
        seller_id: string;
        listing_id: string;
        subtotal_gbp: number | string;
        buyer_protection_fee_gbp: number | string;
        postage_fee_gbp: number | string;
        total_gbp: number | string;
        status: string;
        created_at: string;
        updated_at: string;
      }>(
        `INSERT INTO orders (
           id, buyer_id, seller_id, listing_id,
           subtotal_gbp, buyer_protection_fee_gbp, postage_fee_gbp, total_gbp,
           status, address_id, payment_method_id, shipping_carrier_id,
           idempotency_key, request_hash, checkout_expires_at,
           quote_version, quote_hash, quote_snapshot, shipping_quote_id
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           'created', NULL, NULL, NULL, $9, $10, $11, $12, $13, $14::jsonb, NULL
         )
         RETURNING
           id, buyer_id, seller_id, listing_id,
           subtotal_gbp, buyer_protection_fee_gbp, postage_fee_gbp, total_gbp,
           status, created_at::text, updated_at::text`,
        [
          orderId,
          lot.winner_id,
          listing.seller_id,
          listing.id,
          subtotalGbp,
          platformChargeGbp,
          postageFeeGbp,
          totalGbp,
          idempotencyKey,
          requestHash,
          checkoutExpiresAt,
          quoteVersion,
          quoteHash,
          toJsonString(quoteSnapshot),
        ],
      );
      const orderRow = insertResult.rows[0];

      // Reserve the listing for this checkout.
      await client.query(
        `INSERT INTO listing_checkout_reservations (
           id, offer_id, listing_id, buyer_id, seller_id,
           order_id, source, status, expires_at
         )
         VALUES ($1, NULL, $2, $3, $4, $5, 'live_lot', 'active', $6)`,
        [
          reservationId,
          listing.id,
          lot.winner_id,
          listing.seller_id,
          orderId,
          checkoutExpiresAt,
        ],
      );

      // Pause the listing so it cannot be purchased elsewhere.
      await client.query(
        `UPDATE listings SET status = 'paused', updated_at = NOW() WHERE id = $1`,
        [listing.id],
      );

      // Link the lot to the order and bump its version.
      const lotUpdate = await client.query<LiveLotRow>(
        `UPDATE live_lots
           SET order_id = $2,
               version = version + 1,
               updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [lotId, orderId],
      );
      const settledLot = lotUpdate.rows[0];

      await appendLotEvent(client, {
        lotId,
        sessionId,
        eventType: 'lot.settlement_started',
        eventVersion: settledLot.version,
        actorId: userId,
        payload: { lotId, orderId, winnerId: lot.winner_id },
      });
      await appendLotEvent(client, {
        lotId,
        sessionId,
        eventType: 'lot.order_created',
        eventVersion: settledLot.version,
        actorId: userId,
        payload: { lotId, orderId, reservationId, expiresAt: checkoutExpiresAt },
      });

      await client.query('COMMIT');

      const lotDto = mapLotRow(settledLot);
      const orderDto = {
        id: orderRow.id,
        buyerId: orderRow.buyer_id,
        sellerId: orderRow.seller_id,
        listingId: orderRow.listing_id,
        subtotalGbp: Number(orderRow.subtotal_gbp),
        buyerProtectionFeeGbp: Number(orderRow.buyer_protection_fee_gbp),
        postageFeeGbp: Number(orderRow.postage_fee_gbp),
        totalGbp: Number(orderRow.total_gbp),
        status: orderRow.status,
        createdAt: orderRow.created_at,
        updatedAt: orderRow.updated_at,
      };

      void publishRealtimeEvent({
        topic: liveSessionTopic(sessionId),
        type: 'lot.settlement_started',
        payload: { lot: lotDto, orderId, winnerId: lot.winner_id },
        seq: true,
        version: 1,
      });
      void publishRealtimeEvent({
        topic: liveSessionTopic(sessionId),
        type: 'lot.order_created',
        payload: {
          lot: lotDto,
          order: orderDto,
          reservationId,
          expiresAt: checkoutExpiresAt,
        },
        seq: true,
        version: 1,
      });

      // In-thread commerce card: the won live lot placed an order. If this
      // settlement reconciled a stale reservation, its order was cancelled
      // too — emit that card as well.
      await emitOrderCommerceCard({
        orderId,
        stateType: 'order_placed',
        log: request.log,
      });
      if (expiredReservationOrderId) {
        await emitOrderCommerceCard({
          orderId: expiredReservationOrderId,
          stateType: 'order_cancelled',
          log: request.log,
        });
      }

      reply.code(201);
      return {
        ok: true,
        idempotent: false,
        lot: lotDto,
        order: orderDto,
        checkout: {
          reservationId,
          expiresAt: checkoutExpiresAt,
          quoteVersion,
          quoteHash,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
};
