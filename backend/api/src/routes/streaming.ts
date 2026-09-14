import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import {
  getStreamProvider,
  type StreamRoom,
} from "../lib/streaming/index.js";
import { publishRealtimeEvent } from "../lib/realtime.js";
import {
  LIVE_LOT_ANTI_SNIPE_EXTENSION_SECONDS,
  LIVE_LOT_ANTI_SNIPE_MAX_EXTENSIONS,
  LIVE_LOT_ANTI_SNIPE_WINDOW_MS,
  sweepDueLiveLots,
} from "./liveLotEngine.js";

type StreamingRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

type LiveShoppingSessionRow = {
  id: string;
  title: string;
  host_user_id: string;
  status: string;
  room_url: string;
  recording_url: string | null;
  recording_enabled: boolean;
  max_viewers: number;
  viewer_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

type LiveShoppingChatMessageRow = {
  id: string;
  session_id: string;
  user_id: string;
  user_name: string;
  message: string;
  type: string;
  is_seller: boolean;
  created_at: string;
};

type LiveShoppingBidRow = {
  id: string;
  session_id: string;
  listing_id: string;
  lot_number: number;
  bidder_id: string;
  amount: string;
  created_at: string;
};

type LiveShoppingCurrentLotRow = {
  session_id: string;
  listing_id: string;
  lot_number: number;
  current_price: string;
  bid_count: number;
  updated_at: string;
  /** From migration 186 — the current high bidder on the projection row. */
  high_bidder_id?: string | null;
  /** Joined from the authoritative live_lots row (NULL when the linked lot
   *  is not open or carries no server deadline). */
  lot_closes_at?: string | null;
  lot_extension_count?: number | null;
};

type LiveLotRow = {
  id: string;
  session_id: string;
  listing_id: string;
  position: number;
  status: string;
  currency: string;
  start_price_minor: string;
  reserve_price_minor: string | null;
  min_increment_minor: string;
  opens_at: string | null;
  closes_at: string | null;
  version: number;
  high_bid_id: string | null;
  high_bid_minor: string;
  high_bidder_id: string | null;
  winner_id: string | null;
  order_id: string | null;
  extension_count: number;
  /** Joined from live_lot_snapshots (seller captured at schedule time). */
  seller_id?: string | null;
};

/** Row shape returned by the clientBidId replay lookup. */
type LiveShoppingBidReplayRow = {
  id: string;
  session_id: string;
  listing_id: string;
  lot_number: number;
  lot_id: string | null;
  bidder_id: string;
  amount: string;
  created_at: string;
};

const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  recordingEnabled: z.boolean().optional().default(false),
  maxViewers: z.number().int().min(0).max(100_000).optional().default(0),
});

const roomIdParamsSchema = z.object({
  roomId: z.string().min(2).max(200),
});

const tokenBodySchema = z.object({
  role: z.enum(["host", "viewer"]),
});

const sessionIdParamsSchema = z.object({
  sessionId: z.string().min(2).max(200),
});

const sendChatSchema = z.object({
  message: z.string().trim().min(1).max(500),
});

const chatQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(),
});

const setCurrentLotSchema = z.object({
  listingId: z.string().trim().min(1).max(200),
  lotNumber: z.number().int().min(0),
});

const placeBidSchema = z.object({
  amount: z.coerce.number().positive().max(1_000_000),
  clientBidId: z.string().uuid().optional(),
});

const unauthorized = (reply: FastifyReply) => {
  reply.code(401);
  return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
};

const mapRowToStreamRoom = (row: LiveShoppingSessionRow): StreamRoom => ({
  roomId: row.id,
  title: row.title,
  hostUserId: row.host_user_id,
  status: row.status as StreamRoom["status"],
  roomUrl: row.room_url,
  recordingUrl: row.recording_url ?? undefined,
  viewerCount: row.viewer_count,
  createdAt: row.created_at,
  startedAt: row.started_at ?? undefined,
  endedAt: row.ended_at ?? undefined,
});

const persistSession = async (
  db: Pool,
  room: StreamRoom,
  recordingEnabled: boolean,
  maxViewers: number,
): Promise<LiveShoppingSessionRow> => {
  const result = await db.query<LiveShoppingSessionRow>(
    `INSERT INTO live_shopping_sessions
       (id, title, host_user_id, status, room_url, recording_enabled, max_viewers, viewer_count, created_at, started_at, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       status = EXCLUDED.status,
       room_url = EXCLUDED.room_url,
       recording_enabled = EXCLUDED.recording_enabled,
       max_viewers = EXCLUDED.max_viewers,
       viewer_count = EXCLUDED.viewer_count,
       started_at = EXCLUDED.started_at,
       ended_at = EXCLUDED.ended_at
     RETURNING *`,
    [
      room.roomId,
      room.title,
      room.hostUserId,
      room.status,
      room.roomUrl,
      recordingEnabled,
      maxViewers,
      room.viewerCount,
      room.createdAt,
      room.startedAt ?? null,
      room.endedAt ?? null,
    ],
  );
  return result.rows[0];
};

const fetchSessionRow = async (
  db: Pool,
  roomId: string,
): Promise<LiveShoppingSessionRow | null> => {
  const result = await db.query<LiveShoppingSessionRow>(
    `SELECT * FROM live_shopping_sessions WHERE id = $1 LIMIT 1`,
    [roomId],
  );
  return result.rows[0] ?? null;
};

const liveSessionTopic = (sessionId: string) => `live.session:${sessionId}`;

const activeViewersBySession = new Map<string, Set<string>>();

const fetchCurrentLotRow = async (
  db: Pool,
  sessionId: string,
): Promise<LiveShoppingCurrentLotRow | null> => {
  const result = await db.query<LiveShoppingCurrentLotRow>(
    `SELECT c.*, l.closes_at AS lot_closes_at, l.extension_count AS lot_extension_count
       FROM live_shopping_current_lots c
       LEFT JOIN live_lots l
         ON l.session_id = c.session_id
        AND l.listing_id = c.listing_id
        AND l.status IN ('open', 'closing')
      WHERE c.session_id = $1
      LIMIT 1`,
    [sessionId],
  );
  return result.rows[0] ?? null;
};

const mapChatRow = (row: LiveShoppingChatMessageRow) => ({
  id: row.id,
  sessionId: row.session_id,
  userId: row.user_id,
  userName: row.user_name,
  message: row.message,
  type: row.type,
  isSeller: row.is_seller,
  createdAt: row.created_at,
});

const mapCurrentLotRow = (row: LiveShoppingCurrentLotRow) => ({
  sessionId: row.session_id,
  listingId: row.listing_id,
  lotNumber: row.lot_number,
  currentPrice: Number(row.current_price),
  bidCount: row.bid_count,
  updatedAt: row.updated_at,
  closesAt: row.lot_closes_at ?? null,
  extensionCount: row.lot_extension_count ?? 0,
});

/**
 * Register LiveKit streaming routes for live shopping session lifecycle
 * management and connection token generation.
 */
export const registerStreamingRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: StreamingRouteDependencies) => {
  app.post("/streaming/sessions", async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    if (request.authUser?.role !== "seller" && request.authUser?.role !== "admin") {
      reply.code(403);
      return { ok: false, error: "Forbidden: seller role required", code: "FORBIDDEN" };
    }

    const payload = createSessionSchema.parse(request.body);
    const provider = getStreamProvider();
    const room = await provider.createStream({
      title: payload.title,
      hostUserId: userId,
      recordingEnabled: payload.recordingEnabled,
      maxViewers: payload.maxViewers,
    });

    const row = await persistSession(db, room, payload.recordingEnabled, payload.maxViewers);
    reply.code(201);
    return { ok: true, session: mapRowToStreamRoom(row) };
  });

  app.post("/streaming/sessions/:roomId/start", async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { roomId } = roomIdParamsSchema.parse(request.params);

    const row = await fetchSessionRow(db, roomId);
    if (!row) {
      throw createApiError("STREAM_NOT_FOUND", `Stream session ${roomId} not found`);
    }
    if (row.host_user_id !== userId && request.authUser?.role !== "admin") {
      reply.code(403);
      return { ok: false, error: "Forbidden: only the host can start this stream", code: "FORBIDDEN" };
    }

    const provider = getStreamProvider();
    const updated = await provider.startStream(roomId);
    const persisted = await persistSession(
      db,
      updated,
      row.recording_enabled,
      row.max_viewers,
    );
    return { ok: true, session: mapRowToStreamRoom(persisted) };
  });

  app.post("/streaming/sessions/:roomId/end", async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { roomId } = roomIdParamsSchema.parse(request.params);

    const row = await fetchSessionRow(db, roomId);
    if (!row) {
      throw createApiError("STREAM_NOT_FOUND", `Stream session ${roomId} not found`);
    }
    if (row.host_user_id !== userId && request.authUser?.role !== "admin") {
      reply.code(403);
      return { ok: false, error: "Forbidden: only the host can end this stream", code: "FORBIDDEN" };
    }

    const provider = getStreamProvider();
    const updated = await provider.endStream(roomId);
    const persisted = await persistSession(
      db,
      updated,
      row.recording_enabled,
      row.max_viewers,
    );
    return { ok: true, session: mapRowToStreamRoom(persisted) };
  });

  app.get("/streaming/sessions", async (request) => {
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
    });
    const { limit } = querySchema.parse(request.query ?? {});

    const provider = getStreamProvider();
    const streams = await provider.listActiveStreams(limit);

    const sessions: StreamRoom[] = [];
    for (const stream of streams) {
      const row = await fetchSessionRow(db, stream.roomId);
      if (row) {
        sessions.push({
          ...mapRowToStreamRoom(row),
          viewerCount: stream.viewerCount,
          status: stream.status,
        });
      } else {
        sessions.push(stream);
      }
    }
    return { ok: true, sessions };
  });

  app.get("/streaming/sessions/:roomId", async (request) => {
    const { roomId } = roomIdParamsSchema.parse(request.params);

    const row = await fetchSessionRow(db, roomId);
    if (!row) {
      const provider = getStreamProvider();
      const stream = await provider.getStream(roomId);
      if (!stream) {
        return { ok: false, session: null };
      }
      return { ok: true, session: stream };
    }
    return { ok: true, session: mapRowToStreamRoom(row) };
  });

  app.post("/streaming/sessions/:roomId/token", async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { roomId } = roomIdParamsSchema.parse(request.params);
    const { role } = tokenBodySchema.parse(request.body);

    const row = await fetchSessionRow(db, roomId);
    if (!row) {
      throw createApiError("STREAM_NOT_FOUND", `Stream session ${roomId} not found`);
    }

    if (role === "host" && row.host_user_id !== userId && request.authUser?.role !== "admin") {
      reply.code(403);
      return { ok: false, error: "Forbidden: only the host can request a host token", code: "FORBIDDEN" };
    }

    const displayName = request.authUser?.userId ?? userId;
    const provider = getStreamProvider();
    const result = await provider.generateToken({
      roomId,
      userId,
      role,
      displayName,
    });

    if (result.error) {
      reply.code(503);
      return { ok: false, error: result.error, code: "STREAM_TOKEN_FAILED" };
    }

    // Viewer count broadcast: increment when a viewer joins and publish
    // a realtime event so all subscribers see the updated count.
    if (role === "viewer") {
      let viewers = activeViewersBySession.get(roomId);
      if (!viewers) {
        viewers = new Set<string>();
        activeViewersBySession.set(roomId, viewers);
      }
      viewers.add(userId);

      void publishRealtimeEvent({
        topic: liveSessionTopic(roomId),
        type: "live.viewer.token_issued",
        payload: { userId, viewerCount: row.viewer_count },
        seq: true,
        version: 1,
      });
    }

    return { ok: true, token: result };
  });

  // ── Viewer leave: decrement viewer count and broadcast ──
  app.post("/streaming/sessions/:sessionId/leave", async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { sessionId } = sessionIdParamsSchema.parse(request.params);

    const row = await fetchSessionRow(db, sessionId);
    if (!row) {
      throw createApiError("STREAM_NOT_FOUND", `Stream session ${sessionId} not found`);
    }

    if (row.host_user_id === userId) {
      return { ok: true, viewerCount: row.viewer_count };
    }

    const viewers = activeViewersBySession.get(sessionId);
    if (!viewers || !viewers.has(userId)) {
      return { ok: true, viewerCount: row.viewer_count };
    }

    viewers.delete(userId);
    if (viewers.size === 0) {
      activeViewersBySession.delete(sessionId);
    }

    const updated = await db.query<LiveShoppingSessionRow>(
      `UPDATE live_shopping_sessions
         SET viewer_count = GREATEST(0, viewer_count - 1)
       WHERE id = $1
       RETURNING *`,
      [sessionId],
    );
    const session = updated.rows[0] ?? row;
    void publishRealtimeEvent({
      topic: liveSessionTopic(sessionId),
      type: "live.viewer_count.update",
      payload: { count: session.viewer_count },
      seq: true,
      version: 1,
    });

    return { ok: true, viewerCount: session.viewer_count };
  });

  // ── Live chat: send a message ──
  app.post(
    "/streaming/sessions/:sessionId/chat",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const userId = resolveAuthenticatedUserId(request);
      const { sessionId } = sessionIdParamsSchema.parse(request.params);
      const { message } = sendChatSchema.parse(request.body);

      const row = await fetchSessionRow(db, sessionId);
      if (!row) {
        throw createApiError("STREAM_NOT_FOUND", `Stream session ${sessionId} not found`);
      }

      // Any authenticated user may chat (viewer or host). The host's
      // messages are flagged with isSeller so the UI can badge them.
      const isHost = row.host_user_id === userId;

      const messageId = randomUUID();
      const userName = request.authUser?.userId ?? userId;
      const isSeller = isHost;

      const result = await db.query<LiveShoppingChatMessageRow>(
        `INSERT INTO live_shopping_chat_messages
           (id, session_id, user_id, user_name, message, type, is_seller)
         VALUES ($1, $2, $3, $4, $5, 'message', $6)
         RETURNING *`,
        [messageId, sessionId, userId, userName, message, isSeller],
      );

      const chatMessage = mapChatRow(result.rows[0]);

      void publishRealtimeEvent({
        topic: liveSessionTopic(sessionId),
        type: "live.chat.message",
        payload: { message: chatMessage },
        seq: true,
        version: 1,
      });

      reply.code(201);
      return { ok: true, message: chatMessage };
    },
  );

  // ── Live chat: fetch recent messages (paginated) ──
  app.get("/streaming/sessions/:sessionId/chat", async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const { limit, before } = chatQuerySchema.parse(request.query ?? {});

    const result = await db.query<LiveShoppingChatMessageRow>(
      before
        ? `SELECT * FROM live_shopping_chat_messages
            WHERE session_id = $1 AND created_at < $2
            ORDER BY created_at DESC
            LIMIT $3`
        : `SELECT * FROM live_shopping_chat_messages
            WHERE session_id = $1
            ORDER BY created_at DESC
            LIMIT $2`,
      before ? [sessionId, before, limit] : [sessionId, limit],
    );

    const messages = result.rows.map(mapChatRow).reverse();
    return { ok: true, messages };
  });

  // ── Current lot: host sets the current lot ──
  app.put("/streaming/sessions/:sessionId/current-lot", async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const { listingId, lotNumber } = setCurrentLotSchema.parse(request.body);

    const row = await fetchSessionRow(db, sessionId);
    if (!row) {
      throw createApiError("STREAM_NOT_FOUND", `Stream session ${sessionId} not found`);
    }
    if (row.host_user_id !== userId && request.authUser?.role !== "admin") {
      reply.code(403);
      return { ok: false, error: "Forbidden: only the host can set the current lot", code: "FORBIDDEN" };
    }

    const existing = await fetchCurrentLotRow(db, sessionId);
    const result = await db.query<LiveShoppingCurrentLotRow>(
      `INSERT INTO live_shopping_current_lots
         (session_id, listing_id, lot_number, current_price, bid_count, updated_at)
       VALUES ($1, $2, $3, $4, 0, NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         listing_id = EXCLUDED.listing_id,
         lot_number = EXCLUDED.lot_number,
         current_price = EXCLUDED.current_price,
         bid_count = EXCLUDED.bid_count,
         updated_at = NOW()
       RETURNING *`,
      [
        sessionId,
        listingId,
        lotNumber,
        existing && existing.listing_id === listingId ? existing.current_price : "0",
      ],
    );

    // Re-read through the live_lots join so the emitted current-lot state
    // carries the authoritative closes_at/extension_count countdown fields.
    const refreshed = await fetchCurrentLotRow(db, sessionId);
    const currentLot = refreshed
      ? mapCurrentLotRow(refreshed)
      : mapCurrentLotRow(result.rows[0]);
    const previousLotNumber = existing?.lot_number ?? -1;

    void publishRealtimeEvent({
      topic: liveSessionTopic(sessionId),
      type: "live.current_lot.update",
      payload: {
        previousLotIndex: previousLotNumber,
        newLotIndex: lotNumber,
        lot: currentLot,
      },
      seq: true,
      version: 1,
    });

    return { ok: true, lot: currentLot };
  });

  // ── Current lot: get current lot state ──
  app.get("/streaming/sessions/:sessionId/current-lot", async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);

    const row = await fetchCurrentLotRow(db, sessionId);
    if (!row) {
      return { ok: true, lot: null };
    }
    return { ok: true, lot: mapCurrentLotRow(row) };
  });

  // ── In-stream bids: place a bid on the current lot ──
  app.post("/streaming/sessions/:sessionId/bids", async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const { amount, clientBidId } = placeBidSchema.parse(request.body);

    // Idempotent replay, resolved for the authenticated bidder BEFORE any
    // session/lot-state gate: a retried bid whose original insert committed
    // must replay its accepted row even when the lot has since closed or the
    // stream has ended — otherwise a legitimate retry would see
    // NO_CURRENT_LOT / STREAM_NOT_LIVE instead of its own success.
    //
    // The dedupe key is `client_bid_id` scoped to `bidder_id` (the partial
    // unique index from migration 186), never the bid `id` — one bidder's
    // clientBidId can neither replay nor collide with another bidder's bid.
    const findPriorBid = async (): Promise<LiveShoppingBidReplayRow | null> => {
      if (!clientBidId) return null;
      const prior = await db.query<LiveShoppingBidReplayRow>(
        `SELECT id, session_id, listing_id, lot_number, lot_id, bidder_id,
                amount, created_at::text
           FROM live_shopping_bids
          WHERE bidder_id = $1 AND client_bid_id = $2
          LIMIT 1`,
        [userId, clientBidId],
      );
      return prior.rows[0] ?? null;
    };
    const replayResponse = async (priorBid: LiveShoppingBidReplayRow) => {
      const lotRow = await fetchCurrentLotRow(db, sessionId);
      const lotState = lotRow ? mapCurrentLotRow(lotRow) : null;
      return {
        ok: true,
        success: true,
        idempotent: true,
        bid: {
          id: priorBid.id,
          sessionId: priorBid.session_id,
          listingId: priorBid.listing_id,
          lotNumber: priorBid.lot_number,
          bidderId: priorBid.bidder_id,
          amount: Number(priorBid.amount),
          createdAt: priorBid.created_at,
        },
        ...(lotState && lotRow
          ? {
              currentBid: lotState.currentPrice,
              bidCount: lotState.bidCount,
              isHighBidder: lotRow.high_bidder_id === userId,
            }
          : {}),
      };
    };

    if (clientBidId) {
      const priorBid = await findPriorBid();
      if (priorBid) {
        if (priorBid.session_id !== sessionId) {
          reply.code(409);
          return {
            ok: false,
            error: "clientBidId was already used for a bid in another session",
            code: "CLIENT_BID_ID_REUSED",
          };
        }
        return replayResponse(priorBid);
      }
    }

    const sessionRow = await fetchSessionRow(db, sessionId);
    if (!sessionRow) {
      throw createApiError("STREAM_NOT_FOUND", `Stream session ${sessionId} not found`);
    }
    if (sessionRow.status !== "live") {
      reply.code(409);
      return { ok: false, error: "Stream is not live", code: "STREAM_NOT_LIVE" };
    }

    const bidderName = request.authUser?.userId ?? userId;
    // Server-generated bid id — `clientBidId` is a dedupe key, not the row id.
    const bidId = randomUUID();
    const amountMinor = Math.round(amount * 100);

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const lotResult = await client.query<LiveLotRow>(
        `SELECT l.*, s.seller_id
           FROM live_lots l
           LEFT JOIN live_lot_snapshots s ON s.lot_id = l.id
          WHERE l.session_id = $1 AND l.status = 'open'
          FOR UPDATE OF l`,
        [sessionId],
      );
      const lockedLot = lotResult.rows[0];
      if (!lockedLot) {
        await client.query("ROLLBACK");
        reply.code(409);
        return { ok: false, error: "No current lot set for this session", code: "NO_CURRENT_LOT" };
      }

      // The lot's seller (immutable snapshot taken at schedule time) can
      // never bid on their own lot — same SELLER_RESTRICTED rule the
      // auctions engine enforces.
      if (lockedLot.seller_id === userId) {
        await client.query("ROLLBACK");
        reply.code(403);
        return {
          ok: false,
          error: "Seller cannot bid on their own lot",
          code: "SELLER_RESTRICTED",
        };
      }

      const projectionResult = await client.query<LiveShoppingCurrentLotRow>(
        `SELECT * FROM live_shopping_current_lots WHERE session_id = $1 LIMIT 1`,
        [sessionId],
      );
      const projection = projectionResult.rows[0];
      const lotNumber = projection?.lot_number ?? lockedLot.position;

      // The server deadline is authoritative: a *new* bid landing at/after
      // closes_at is rejected even though the sweep has not flipped the lot
      // to closed yet — otherwise the deadline would be cosmetic. Idempotent
      // replays are resolved above so a retried accepted bid still reports
      // success rather than lying about a rejection.
      if (lockedLot.closes_at && Date.parse(lockedLot.closes_at) <= Date.now()) {
        await client.query("ROLLBACK");
        reply.code(409);
        return {
          ok: false,
          error: "Bidding window for this lot has closed",
          code: "LOT_BIDDING_CLOSED",
        };
      }

      const highBidMinor = Number(lockedLot.high_bid_minor ?? 0);
      const minIncrement = Number(lockedLot.min_increment_minor ?? 0);
      const startPriceMinor = Number(lockedLot.start_price_minor ?? 0);
      // Floor: the first bid must clear the lot's start price; every bid
      // must clear high bid + min increment.
      const requiredMinor = Math.max(startPriceMinor, highBidMinor + minIncrement);
      if (amountMinor < requiredMinor) {
        await client.query("ROLLBACK");
        reply.code(422);
        return {
          ok: false,
          error: `Bid must be at least ${(requiredMinor / 100).toFixed(2)} (start price ${(startPriceMinor / 100).toFixed(2)}, current high bid ${(highBidMinor / 100).toFixed(2)} plus increment ${(minIncrement / 100).toFixed(2)})`,
          code: "BID_TOO_LOW",
          currentPrice: highBidMinor / 100,
          bidCount: projection?.bid_count ?? 0,
        };
      }

      // `client_bid_id` carries the client's dedupe key (partial unique
      // index on (bidder_id, client_bid_id), migration 186); `status` is
      // 'accepted' — this row only ever exists once the bid cleared every
      // gate above.
      await client.query(
        `INSERT INTO live_shopping_bids
           (id, session_id, listing_id, lot_number, bidder_id, amount, lot_id, client_bid_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'accepted')`,
        [bidId, sessionId, lockedLot.listing_id, lotNumber, userId, amount, lockedLot.id, clientBidId ?? null],
      );

      await client.query(
        `UPDATE live_lots
           SET high_bid_minor = GREATEST(high_bid_minor, $2),
               high_bidder_id = $3,
               high_bid_id = $4,
               version = version + 1
         WHERE id = $1`,
        [lockedLot.id, amountMinor, userId, bidId],
      );

      // Anti-snipe: a bid landing inside the closing window pushes closes_at
      // out, capped at MAX_EXTENSIONS so the lot cannot be extended forever.
      // The extension is written to live_lot_events and broadcast after commit
      // so every viewer's countdown re-syncs to the server deadline.
      let extension: { closes_at: string; extension_count: number; version: number } | null = null;
      if (lockedLot.closes_at) {
        const closeTime = Date.parse(lockedLot.closes_at);
        const now = Date.now();
        // Extend only for bids strictly before the deadline that land inside
        // the window; each extension adds a fixed amount to the prior
        // deadline, capped so the lot cannot be extended forever.
        if (
          now < closeTime
          && closeTime - now <= LIVE_LOT_ANTI_SNIPE_WINDOW_MS
          && lockedLot.extension_count < LIVE_LOT_ANTI_SNIPE_MAX_EXTENSIONS
        ) {
          const extensionResult = await client.query<{
            closes_at: string;
            extension_count: number;
            version: number;
          }>(
            `UPDATE live_lots
                SET closes_at = closes_at + make_interval(secs => $2),
                    extension_count = extension_count + 1,
                    version = version + 1,
                    updated_at = NOW()
              WHERE id = $1
              RETURNING closes_at::text, extension_count, version`,
            [lockedLot.id, LIVE_LOT_ANTI_SNIPE_EXTENSION_SECONDS],
          );
          extension = extensionResult.rows[0] ?? null;
          if (extension) {
            await client.query(
              `INSERT INTO live_lot_events
                 (id, lot_id, session_id, event_type, event_version, actor_id, payload)
               VALUES ($1, $2, $3, 'lot.extension', $4, $5, $6::jsonb)`,
              [
                randomUUID(),
                lockedLot.id,
                sessionId,
                extension.version,
                userId,
                JSON.stringify({
                  lotId: lockedLot.id,
                  closesAt: extension.closes_at,
                  extensionCount: extension.extension_count,
                  trigger: 'anti_snipe_bid',
                }),
              ],
            );
          }
        }
      }

      const updated = await client.query<LiveShoppingCurrentLotRow>(
        `UPDATE live_shopping_current_lots
           SET current_price = GREATEST(current_price, $2),
               bid_count = bid_count + 1,
               high_bidder_id = $3,
               updated_at = NOW()
         WHERE session_id = $1
         RETURNING *`,
        [sessionId, amount, userId],
      );

      await client.query("COMMIT");

      const updatedLot = updated.rows[0] ?? projection;
      const lotState = updatedLot ? mapCurrentLotRow(updatedLot) : {
        sessionId,
        listingId: lockedLot.listing_id,
        lotNumber,
        currentPrice: amount,
        bidCount: (projection?.bid_count ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        closesAt: null as string | null,
        extensionCount: 0,
      };
      // Surface the authoritative deadline — the projection row itself does
      // not carry closes_at, so stamp the live_lots value (post-extension
      // when a snipe bid just extended the window).
      lotState.closesAt = extension?.closes_at ?? lockedLot.closes_at ?? null;
      lotState.extensionCount =
        extension?.extension_count ?? lockedLot.extension_count ?? 0;
      const createdAt = new Date().toISOString();

      void publishRealtimeEvent({
        topic: liveSessionTopic(sessionId),
        type: "live.bid.placed",
        payload: {
          lotId: lockedLot.id,
          bid: {
            id: bidId,
            sessionId,
            listingId: lockedLot.listing_id,
            lotNumber,
            bidderId: userId,
            bidderName,
            amount,
            createdAt,
          },
          lot: lotState,
          newCurrentPrice: lotState.currentPrice,
          newBidCount: lotState.bidCount,
        },
        seq: true,
        version: 1,
      });

      // Anti-snipe extension — separate event so viewers' countdowns re-sync
      // even if they missed which bid triggered it.
      if (extension) {
        void publishRealtimeEvent({
          topic: liveSessionTopic(sessionId),
          type: "lot.extension",
          payload: {
            lotId: lockedLot.id,
            listingId: lockedLot.listing_id,
            closesAt: extension.closes_at,
            extensionCount: extension.extension_count,
            maxExtensions: LIVE_LOT_ANTI_SNIPE_MAX_EXTENSIONS,
          },
          seq: true,
          version: 1,
        });
      }

      reply.code(201);
      return {
        ok: true,
        bid: {
          id: bidId,
          sessionId,
          listingId: lockedLot.listing_id,
          lotNumber,
          bidderId: userId,
          bidderName,
          amount,
          createdAt,
        },
        lot: lotState,
      };
    } catch (err) {
      // Never release a client mid-transaction back into the pool.
      await client.query("ROLLBACK").catch(() => {});
      const code = (err as { code?: string })?.code;
      if (code === "23505" && clientBidId) {
        // Unique-violation on idx_live_bids_client_bid_id: a concurrent
        // request already committed this bidder's bid under the same
        // clientBidId between our pre-check and the INSERT. Resolve the
        // durable row and replay it.
        const priorBid = await findPriorBid();
        if (priorBid) {
          if (priorBid.session_id !== sessionId) {
            reply.code(409);
            return {
              ok: false,
              error: "clientBidId was already used for a bid in another session",
              code: "CLIENT_BID_ID_REUSED",
            };
          }
          return replayResponse(priorBid);
        }
      }
      if (code === "40001" || code === "40P01") {
        reply.code(409);
        return {
          ok: false,
          error: "BID_CONFLICT",
          code: "BID_CONFLICT",
          message: "Another bid was placed simultaneously. Please retry.",
        };
      }
      throw err;
    } finally {
      client.release();
    }
  });

  // Auto-close pass for one session — the sweep worker runs the same path
  // globally; this endpoint exists for manual/integration invocations. Each
  // due lot closes through the shared engine close path (same lifecycle
  // transition, live_lot_events entries and realtime fan-out as a host
  // close), so no divergent close semantics live here.
  app.post("/streaming/sessions/:sessionId/lots/auto-close", async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);

    const sessionRow = await fetchSessionRow(db, sessionId);
    if (!sessionRow) {
      throw createApiError("STREAM_NOT_FOUND", `Stream session ${sessionId} not found`);
    }

    const { closedLots, failedLots } = await sweepDueLiveLots(db, { sessionId });
    return { ok: true, closedLots, failedLots };
  });
};
