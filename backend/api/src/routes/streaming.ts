import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import {
  getStreamProvider,
  type StreamRoom,
} from "../lib/streaming/index.js";

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

    return { ok: true, token: result };
  });
};
