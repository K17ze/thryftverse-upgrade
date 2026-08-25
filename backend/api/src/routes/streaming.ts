import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import {
  getStreamProvider,
  type StreamRoom,
} from "../lib/streaming/index.js";
import { publishRealtimeEvent } from "../lib/realtime.js";

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
  amount: z.number().positive().max(1_000_000),
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

const fetchCurrentLotRow = async (
  db: Pool,
  sessionId: string,
): Promise<LiveShoppingCurrentLotRow | null> => {
  const result = await db.query<LiveShoppingCurrentLotRow>(
    `SELECT * FROM live_shopping_current_lots WHERE session_id = $1 LIMIT 1`,
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
      const updated = await db.query<LiveShoppingSessionRow>(
        `UPDATE live_shopping_sessions
           SET viewer_count = viewer_count + 1
         WHERE id = $1
         RETURNING *`,
        [roomId],
      );
      const session = updated.rows[0] ?? row;
      void publishRealtimeEvent({
        topic: liveSessionTopic(roomId),
        type: "live.viewer_count.update",
        payload: { count: session.viewer_count },
        seq: true,
        version: 1,
      });
    }

    return { ok: true, token: result };
  });

  // ── Viewer leave: decrement viewer count and broadcast ──
  app.post("/streaming/sessions/:sessionId/leave", async (request, reply) => {
    resolveAuthenticatedUserId(request);
    const { sessionId } = sessionIdParamsSchema.parse(request.params);

    const row = await fetchSessionRow(db, sessionId);
    if (!row) {
      throw createApiError("STREAM_NOT_FOUND", `Stream session ${sessionId} not found`);
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

    const currentLot = mapCurrentLotRow(result.rows[0]);
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
    const { amount } = placeBidSchema.parse(request.body);

    const sessionRow = await fetchSessionRow(db, sessionId);
    if (!sessionRow) {
      throw createApiError("STREAM_NOT_FOUND", `Stream session ${sessionId} not found`);
    }
    if (sessionRow.status !== "live") {
      reply.code(409);
      return { ok: false, error: "Stream is not live", code: "STREAM_NOT_LIVE" };
    }

    const currentLot = await fetchCurrentLotRow(db, sessionId);
    if (!currentLot) {
      reply.code(409);
      return { ok: false, error: "No current lot set for this session", code: "NO_CURRENT_LOT" };
    }

    const currentPrice = Number(currentLot.current_price);
    if (amount <= currentPrice) {
      reply.code(422);
      return {
        ok: false,
        error: `Bid must be higher than current price (${currentPrice})`,
        code: "BID_TOO_LOW",
      };
    }

    const bidId = randomUUID();
    const bidderName = request.authUser?.userId ?? userId;

    await db.query(
      `INSERT INTO live_shopping_bids
         (id, session_id, listing_id, lot_number, bidder_id, amount)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [bidId, sessionId, currentLot.listing_id, currentLot.lot_number, userId, amount],
    );

    const updated = await db.query<LiveShoppingCurrentLotRow>(
      `UPDATE live_shopping_current_lots
         SET current_price = $2, bid_count = bid_count + 1, updated_at = NOW()
       WHERE session_id = $1
       RETURNING *`,
      [sessionId, amount],
    );

    const updatedLot = updated.rows[0] ?? currentLot;
    const lotState = mapCurrentLotRow(updatedLot);

    void publishRealtimeEvent({
      topic: liveSessionTopic(sessionId),
      type: "live.bid.placed",
      payload: {
        lotId: currentLot.listing_id,
        bid: {
          id: bidId,
          sessionId,
          listingId: currentLot.listing_id,
          lotNumber: currentLot.lot_number,
          bidderId: userId,
          bidderName,
          amount,
          createdAt: new Date().toISOString(),
        },
        lot: lotState,
        newCurrentPrice: lotState.currentPrice,
        newBidCount: lotState.bidCount,
      },
      seq: true,
      version: 1,
    });

    reply.code(201);
    return {
      ok: true,
      bid: {
        id: bidId,
        sessionId,
        listingId: currentLot.listing_id,
        lotNumber: currentLot.lot_number,
        bidderId: userId,
        bidderName,
        amount,
        createdAt: new Date().toISOString(),
      },
      lot: lotState,
    };
  });
};
