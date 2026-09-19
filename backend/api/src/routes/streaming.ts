import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import {
  getStreamProvider,
  type StreamRoom,
} from "../lib/streaming/index.js";
import { publishRealtimeEvent } from "../lib/realtime.js";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import {
  LIVE_LOT_ANTI_SNIPE_EXTENSION_SECONDS,
  LIVE_LOT_ANTI_SNIPE_MAX_EXTENSIONS,
  LIVE_LOT_ANTI_SNIPE_WINDOW_MS,
  sweepDueLiveLots,
} from "./liveLotEngine.js";
import { moderateListingText } from "../lib/moderation/moderationService.js";
import { scanMessageForScamPatterns } from "../lib/messageScamScanner.js";
import { recordConsumerReport } from "../lib/safetyCaseService.js";
import { createRuntimeId } from "../lib/workerHelpers.js";

/**
 * Signature of the notification queueing seam — mirrors `queueUserNotification`
 * in src/index.ts / lib/workerRuntime.ts. Injected by the caller when available;
 * otherwise the go-live fan-out lazily falls back to the worker-runtime copy
 * (which binds the same db/redis singletons the API process uses).
 */
type QueueUserNotification = (input: {
  userId: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  eventType?: string;
  actorUserId?: string;
  imageUrl?: string;
  route?: Record<string, unknown>;
  idempotencyKey?: string;
}) => Promise<string | null>;

type StreamingRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
  /** Optional injected notification producer (the index.ts copy). */
  queueUserNotification?: QueueUserNotification;
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
  /** Migration 297 — host-declared go-live time for scheduled shows. */
  scheduled_start_at?: string | null;
};

type LiveShoppingChatMessageRow = {
  id: string;
  session_id: string;
  user_id: string;
  user_name: string;
  message: string;
  type: string;
  is_seller: boolean;
  moderation_state: string;
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
  /** Joined from the authoritative live_lots row (NULL when no lot row is
   *  linked). Preferred order: open/closing, then the most recently
   *  updated terminal lot so a winner can still settle after reload. */
  lot_id?: string | null;
  lot_status?: string | null;
  lot_winner_id?: string | null;
  lot_order_id?: string | null;
  lot_closes_at?: string | null;
  lot_extension_count?: number | null;
  lot_min_increment_minor?: string | null;
  lot_start_price_minor?: string | null;
  /** Listing identity for the pinned-product surface (title/image). */
  lot_title?: string | null;
  lot_image_url?: string | null;
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
  /** Joined from listings — the live status re-checked before a bid lands. */
  listing_status?: string | null;
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
  // Optional scheduled go-live time (ISO 8601). When present and in the
  // future, the provider room is deferred until /start — a LiveKit room
  // created now would sit empty and be reaped by emptyTimeout (300s) long
  // before the scheduled start.
  scheduledStartAt: z
    .string()
    .datetime({ offset: true })
    .refine((value) => Date.parse(value) > Date.now(), {
      message: "scheduledStartAt must be in the future",
    })
    .optional(),
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
  recordingEnabled: row.recording_enabled,
  viewerCount: row.viewer_count,
  createdAt: row.created_at,
  startedAt: row.started_at ?? undefined,
  endedAt: row.ended_at ?? undefined,
  scheduledStartAt: row.scheduled_start_at ?? undefined,
});

const persistSession = async (
  db: Pool,
  room: StreamRoom,
  recordingEnabled: boolean,
  maxViewers: number,
  scheduledStartAt?: string | null,
): Promise<LiveShoppingSessionRow> => {
  const result = await db.query<LiveShoppingSessionRow>(
    `INSERT INTO live_shopping_sessions
       (id, title, host_user_id, status, room_url, recording_enabled, max_viewers, viewer_count, created_at, started_at, ended_at, scheduled_start_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       status = EXCLUDED.status,
       room_url = EXCLUDED.room_url,
       recording_enabled = EXCLUDED.recording_enabled,
       max_viewers = EXCLUDED.max_viewers,
       viewer_count = EXCLUDED.viewer_count,
       started_at = EXCLUDED.started_at,
       ended_at = EXCLUDED.ended_at,
       scheduled_start_at = EXCLUDED.scheduled_start_at
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
      scheduledStartAt ?? null,
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
    `SELECT c.*,
            l.id AS lot_id,
            l.status AS lot_status,
            l.winner_id AS lot_winner_id,
            l.order_id AS lot_order_id,
            l.closes_at AS lot_closes_at,
            l.extension_count AS lot_extension_count,
            l.min_increment_minor AS lot_min_increment_minor,
            l.start_price_minor AS lot_start_price_minor,
            COALESCE(snap.title, li.title) AS lot_title,
            COALESCE(snap.image_url, li.image_url) AS lot_image_url
       FROM live_shopping_current_lots c
       LEFT JOIN live_lots l
         ON l.session_id = c.session_id
        AND l.listing_id = c.listing_id
       LEFT JOIN live_lot_snapshots snap ON snap.lot_id = l.id
       LEFT JOIN listings li ON li.id = c.listing_id
      WHERE c.session_id = $1
      ORDER BY CASE WHEN l.status IN ('open', 'closing') THEN 0
                    WHEN l.status = 'sold' THEN 1 ELSE 2 END,
               l.updated_at DESC NULLS LAST
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
  moderationState: row.moderation_state ?? 'visible',
  createdAt: row.created_at,
});

const mapCurrentLotRow = (row: LiveShoppingCurrentLotRow) => ({
  sessionId: row.session_id,
  listingId: row.listing_id,
  lotNumber: row.lot_number,
  currentPrice: Number(row.current_price),
  bidCount: row.bid_count,
  updatedAt: row.updated_at,
  // Authoritative live_lots linkage — the pinned-product identity and the
  // winner/settlement fields the checkout path needs.
  lotId: row.lot_id ?? null,
  lotStatus: row.lot_status ?? null,
  winnerId: row.lot_winner_id ?? null,
  orderId: row.lot_order_id ?? null,
  highBidderId: row.high_bidder_id ?? null,
  title: row.lot_title ?? null,
  imageUrl: row.lot_image_url ?? null,
  closesAt: row.lot_closes_at ?? null,
  extensionCount: row.lot_extension_count ?? 0,
  minIncrementMinor: row.lot_min_increment_minor == null ? null : Number(row.lot_min_increment_minor),
  startPriceMinor: row.lot_start_price_minor == null ? null : Number(row.lot_start_price_minor),
});

// ── Discovery enrichment ─────────────────────────────────────────────

/** Fields joined onto each session card for the discovery surfaces. */
type SessionDiscoveryEnrichment = {
  hostUsername: string | null;
  hostAvatarUrl: string | null;
  hostVerified: boolean;
  currentLotTitle: string | null;
  /** Current high bid / start price in integer minor units (e.g. pence). */
  currentLotPriceMinor: number | null;
  currentLotCurrency: string | null;
  thumbnailUrl: string | null;
};

const EMPTY_ENRICHMENT: SessionDiscoveryEnrichment = {
  hostUsername: null,
  hostAvatarUrl: null,
  hostVerified: false,
  currentLotTitle: null,
  currentLotPriceMinor: null,
  currentLotCurrency: null,
  thumbnailUrl: null,
};

/**
 * One batched query for every session card field the list endpoint can't get
 * from the provider: host identity (users), the verified badge (active,
 * non-expired seller_trust_evidence — same evidence-backed rule the public
 * profile projection uses), and the current lot's listing title/price/
 * thumbnail (listing_images primary image, falling back to the legacy
 * listings.image_url column — the same precedence as the feed projection).
 */
const loadSessionDiscoveryEnrichment = async (
  db: Pool,
  sessionIds: readonly string[],
): Promise<Map<string, SessionDiscoveryEnrichment>> => {
  const bySession = new Map<string, SessionDiscoveryEnrichment>();
  if (sessionIds.length === 0) return bySession;

  try {
    const result = await db.query<{
      session_id: string;
      host_username: string | null;
      host_avatar_url: string | null;
      host_verified: boolean;
      current_lot_title: string | null;
      current_lot_price_major: string | null;
      current_lot_currency: string | null;
      thumbnail_url: string | null;
    }>(
      `SELECT
         s.id AS session_id,
         u.username AS host_username,
         u.avatar AS host_avatar_url,
         EXISTS (
           SELECT 1
           FROM seller_trust_evidence ste
           WHERE ste.seller_id = s.host_user_id
             AND ste.state = 'active'
             AND ste.code IN ('identity_checked', 'trader_verified', 'top_rated')
             AND (ste.expires_at IS NULL OR ste.expires_at > NOW())
         ) AS host_verified,
         li.title AS current_lot_title,
         cl.current_price AS current_lot_price_major,
         COALESCE(lot.currency, 'GBP') AS current_lot_currency,
         COALESCE(img.image_url, li.image_url) AS thumbnail_url
       FROM live_shopping_sessions s
       LEFT JOIN users u ON u.id = s.host_user_id
       LEFT JOIN live_shopping_current_lots cl ON cl.session_id = s.id
       LEFT JOIN listings li ON li.id = cl.listing_id
       LEFT JOIN live_lots lot
         ON lot.session_id = s.id
        AND lot.listing_id = cl.listing_id
        AND lot.status IN ('open', 'closing')
       LEFT JOIN LATERAL (
         SELECT COALESCE(
                  CASE WHEN i.media_type = 'video' THEN i.poster_url END,
                  i.image_url
                ) AS image_url
         FROM listing_images i
         WHERE i.listing_id = li.id
         ORDER BY i.sort_order, i.created_at, i.id
         LIMIT 1
       ) img ON true
       WHERE s.id = ANY($1)`,
      [[...sessionIds]],
    );

    for (const row of result.rows) {
      bySession.set(row.session_id, {
        hostUsername: row.host_username,
        hostAvatarUrl: row.host_avatar_url,
        hostVerified: Boolean(row.host_verified),
        currentLotTitle: row.current_lot_title,
        currentLotPriceMinor:
          row.current_lot_price_major === null
            ? null
            : Math.round(Number(row.current_lot_price_major) * 100),
        currentLotCurrency:
          row.current_lot_price_major === null ? null : row.current_lot_currency,
        thumbnailUrl: row.thumbnail_url,
      });
    }
  } catch (error) {
    // Enrichment must never break the session list — older schemas may lack
    // seller_trust_evidence / listing_images / live_lots. Degrade to the
    // host-identity join (users predates every live-shopping migration).
    logger.warn(
      { err: error },
      "[streaming] session discovery enrichment degraded to host-only",
    );
    try {
      const fallback = await db.query<{
        session_id: string;
        host_username: string | null;
        host_avatar_url: string | null;
      }>(
        `SELECT s.id AS session_id, u.username AS host_username, u.avatar AS host_avatar_url
           FROM live_shopping_sessions s
           LEFT JOIN users u ON u.id = s.host_user_id
          WHERE s.id = ANY($1)`,
        [[...sessionIds]],
      );
      for (const row of fallback.rows) {
        bySession.set(row.session_id, {
          ...EMPTY_ENRICHMENT,
          hostUsername: row.host_username,
          hostAvatarUrl: row.host_avatar_url,
        });
      }
    } catch (fallbackError) {
      logger.warn(
        { err: fallbackError },
        "[streaming] session discovery enrichment unavailable",
      );
    }
  }

  return bySession;
};

// ── Go-live fan-out ──────────────────────────────────────────────────

/** Hard cap on live_started fan-out recipients per go-live. */
const LIVE_STARTED_FANOUT_CAP = 5_000;

let cachedRuntimeNotify: QueueUserNotification | null = null;

/**
 * Resolve the notification producer: the injected copy (index.ts) when the
 * caller wires it, else the verbatim worker-runtime copy bound to the shared
 * db/redis singletons. Returns null when neither is available so the fan-out
 * degrades to a logged no-op instead of breaking /start.
 */
const resolveNotify = async (
  injected: QueueUserNotification | undefined,
): Promise<QueueUserNotification | null> => {
  if (injected) return injected;
  if (cachedRuntimeNotify) return cachedRuntimeNotify;
  try {
    const mod = await import("../lib/workerRuntime.js");
    cachedRuntimeNotify = mod.queueUserNotification;
    return cachedRuntimeNotify;
  } catch (error) {
    logger.warn(
      { err: error },
      "[streaming] queueUserNotification unavailable — skipping live_started fan-out",
    );
    return null;
  }
};

/**
 * Fan out `live_started` to the host's followers ∪ reminder-holders after a
 * session goes live. Runs fire-and-forget after the /start commit — failures
 * are logged, never propagated. Idempotency keys make restarts and double
 * taps collapse instead of duplicating pushes.
 */
const fanOutLiveStarted = async (
  db: Pool,
  injected: QueueUserNotification | undefined,
  session: {
    roomId: string;
    title: string;
    hostUserId: string;
    scheduledStartAt?: string;
    /** Fresh timestamp on every /start — discriminates restarts so an
     *  end→re-live cycle re-notifies instead of colliding with the prior
     *  run's idempotency keys. */
    startedAt?: string | null;
  },
): Promise<void> => {
  const recipients = new Set<string>();

  try {
    const followerResult = await db.query<{ follower_id: string }>(
      `SELECT follower_id FROM user_follows WHERE following_id = $1 LIMIT $2`,
      [session.hostUserId, LIVE_STARTED_FANOUT_CAP],
    );
    for (const row of followerResult.rows) {
      recipients.add(row.follower_id);
    }
  } catch (error) {
    logger.warn(
      { err: error, sessionId: session.roomId },
      "[streaming] follower lookup failed — fanning out to reminders only",
    );
  }

  try {
    const reminderResult = await db.query<{ user_id: string }>(
      `SELECT user_id FROM live_session_reminders WHERE session_id = $1`,
      [session.roomId],
    );
    for (const row of reminderResult.rows) {
      recipients.add(row.user_id);
    }
  } catch (error) {
    // live_session_reminders is a 297 table — an unmigrated schema must not
    // block go-live pushes to followers.
    logger.warn(
      { err: error, sessionId: session.roomId },
      "[streaming] live_session_reminders lookup failed — fanning out to followers only",
    );
  }

  // The host never needs a "you are live" push.
  recipients.delete(session.hostUserId);
  if (recipients.size === 0) return;

  // Hard cap the total recipient set — reminders sit on top of the follower
  // LIMIT and could push recipients past the bound.
  if (recipients.size > LIVE_STARTED_FANOUT_CAP) {
    const capped = [...recipients].slice(0, LIVE_STARTED_FANOUT_CAP);
    recipients.clear();
    for (const id of capped) recipients.add(id);
  }

  if (recipients.size >= LIVE_STARTED_FANOUT_CAP) {
    logger.warn(
      { sessionId: session.roomId, hostUserId: session.hostUserId, recipients: recipients.size },
      "[streaming] live_started fan-out hit the recipient cap",
    );
  }

  const notify = await resolveNotify(injected);
  if (!notify) return;

  const hostResult = await db.query<{ username: string | null; avatar: string | null }>(
    `SELECT username, avatar FROM users WHERE id = $1 LIMIT 1`,
    [session.hostUserId],
  );
  const host = hostResult.rows[0];
  const hostLabel = host?.username?.trim() || "A seller you follow";

  // Bounded-concurrency send: batches keep latency sane without hammering the
  // pool with thousands of concurrent inserts.
  const recipientIds = [...recipients];
  const BATCH = 50;
  let delivered = 0;
  let failed = 0;
  for (let i = 0; i < recipientIds.length; i += BATCH) {
    const batch = recipientIds.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (recipientId) => {
        try {
          await notify({
            userId: recipientId,
            title: `${hostLabel} is live`,
            body: session.title
              ? `${session.title} — tap to watch and bid`
              : "Tap to watch and bid",
            eventType: "live_started",
            actorUserId: session.hostUserId,
            imageUrl: host?.avatar ?? undefined,
            payload: {
              event: "live_started",
              sessionId: session.roomId,
              roomId: session.roomId,
              sessionTitle: session.title,
              hostUserId: session.hostUserId,
              hostUsername: host?.username ?? null,
              scheduledStartAt: session.scheduledStartAt ?? null,
            },
            route: {
              screen: "LiveStreamViewer",
              params: { sessionId: session.roomId },
            },
            idempotencyKey: `live_started:${session.roomId}:${session.startedAt ?? "initial"}:${recipientId}`,
          });
          delivered += 1;
        } catch (error) {
          failed += 1;
          logger.warn(
            { err: error, sessionId: session.roomId, recipientId },
            "[streaming] live_started notification failed for recipient",
          );
        }
      }),
    );
  }

  if (failed > 0) {
    logger.warn(
      { sessionId: session.roomId, delivered, failed },
      "[streaming] live_started fan-out completed with failures",
    );
  }
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
  queueUserNotification,
}: StreamingRouteDependencies) => {
  app.post("/streaming/sessions", async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    if (request.authUser?.role !== "seller" && request.authUser?.role !== "admin") {
      reply.code(403);
      return { ok: false, error: "Forbidden: seller role required", code: "FORBIDDEN" };
    }

    const payload = createSessionSchema.parse(request.body);
    const scheduledStartAt = payload.scheduledStartAt ?? null;
    const provider = getStreamProvider();

    let room: StreamRoom;
    if (scheduledStartAt) {
      // Scheduled show: persist the row now, but do NOT create the provider
      // room — it would sit empty and be reaped by emptyTimeout (300s) long
      // before the scheduled start. POST /sessions/:roomId/start re-creates
      // the room on demand via StartStreamOptions (verified for both the
      // LiveKit and mock providers), so a scheduled session with no provider
      // room starts cleanly. The roomId follows the provider's format.
      room = {
        roomId: `stream_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        title: payload.title,
        hostUserId: userId,
        status: "created",
        roomUrl: "",
        viewerCount: 0,
        createdAt: new Date().toISOString(),
        scheduledStartAt,
      };
    } else {
      room = await provider.createStream({
        title: payload.title,
        hostUserId: userId,
        recordingEnabled: payload.recordingEnabled,
        maxViewers: payload.maxViewers,
      });
    }

    const row = await persistSession(
      db,
      room,
      payload.recordingEnabled,
      payload.maxViewers,
      scheduledStartAt,
    );
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
    // Pass the persisted session fields so the provider can re-create a room
    // that was reaped while idle (emptyTimeout) instead of leaving this row
    // stuck in a pre-live status forever.
    const updated = await provider.startStream(roomId, {
      title: row.title,
      hostUserId: row.host_user_id,
      recordingEnabled: row.recording_enabled,
      maxViewers: row.max_viewers,
    });
    const persisted = await persistSession(
      db,
      updated,
      row.recording_enabled,
      row.max_viewers,
      row.scheduled_start_at ?? null,
    );

    // Go-live fan-out: notify the host's followers ∪ reminder-holders with a
    // live_started notification. Fire-and-forget post-commit — a notification
    // failure must never fail or delay the start response. Idempotency keys
    // (`live_started:{roomId}:{userId}`) collapse retried starts.
    void fanOutLiveStarted(db, queueUserNotification, {
      roomId: persisted.id,
      title: persisted.title,
      hostUserId: persisted.host_user_id,
      scheduledStartAt: persisted.scheduled_start_at ?? undefined,
      startedAt: persisted.started_at ?? null,
    }).catch((error) => {
      logger.warn(
        { err: error, sessionId: roomId },
        "[streaming] live_started fan-out failed",
      );
    });

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
      row.scheduled_start_at ?? null,
    );

    // Notify subscribers — without this, viewers strand on "Waiting for
    // host video" forever; the ended screen is unreachable otherwise.
    // The sales tally comes from the lot engine, not estimates.
    const finalViewerCount = activeViewersBySession.get(roomId)?.size ?? 0;
    activeViewersBySession.delete(roomId);
    const salesRow = await db.query<{ lots_sold: string; total_sales_minor: string }>(
      `SELECT COUNT(*)::text AS lots_sold,
              COALESCE(SUM(high_bid_minor), 0)::text AS total_sales_minor
         FROM live_lots
        WHERE session_id = $1 AND status = 'sold'`,
      [roomId],
    );
    void publishRealtimeEvent({
      topic: liveSessionTopic(roomId),
      type: "live.session.ended",
      payload: {
        sessionId: roomId,
        endedAt: persisted.ended_at ?? null,
        totalViewers: finalViewerCount,
        lotsSold: Number(salesRow.rows[0]?.lots_sold ?? 0),
        totalSales: Number(salesRow.rows[0]?.total_sales_minor ?? 0) / 100,
      },
      seq: true,
      version: 1,
    });

    return { ok: true, session: mapRowToStreamRoom(persisted) };
  });

  app.get("/streaming/sessions", async (request) => {
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
    });
    const { limit } = querySchema.parse(request.query ?? {});

    const provider = getStreamProvider();
    const streams = await provider.listActiveStreams(limit);

    // One batched lookup for the provider streams' persisted rows — the
    // previous per-stream fetchSessionRow loop was an N+1 on every list call.
    const rowsById = new Map<string, LiveShoppingSessionRow>();
    if (streams.length > 0) {
      const rowsResult = await db.query<LiveShoppingSessionRow>(
        `SELECT * FROM live_shopping_sessions WHERE id = ANY($1)`,
        [streams.map((stream) => stream.roomId)],
      );
      for (const row of rowsResult.rows) {
        rowsById.set(row.id, row);
      }
    }

    const sessions: StreamRoom[] = [];
    const seen = new Set<string>();
    for (const stream of streams) {
      const row = rowsById.get(stream.roomId);
      if (row) {
        sessions.push({
          ...mapRowToStreamRoom(row),
          viewerCount: stream.viewerCount,
          status: stream.status,
        });
      } else {
        sessions.push(stream);
      }
      seen.add(stream.roomId);
    }

    // Scheduled shows ("Coming up" rail): pre-live sessions with a
    // scheduled_start_at in the near future (next 7 days), soonest first.
    // A modest lookback keeps late-starting shows discoverable instead of
    // vanishing the moment their scheduled time passes.
    try {
      const scheduled = await db.query<LiveShoppingSessionRow>(
        `SELECT * FROM live_shopping_sessions
          WHERE scheduled_start_at IS NOT NULL
            AND status IN ('created', 'draft', 'backstage')
            AND scheduled_start_at BETWEEN NOW() - interval '6 hours'
                                       AND NOW() + interval '7 days'
          ORDER BY scheduled_start_at ASC
          LIMIT $1`,
        [limit],
      );
      for (const row of scheduled.rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        sessions.push(mapRowToStreamRoom(row));
      }
    } catch (error) {
      // scheduled_start_at is a 297 column — an unmigrated schema must not
      // break the session list.
      logger.warn(
        { err: error },
        "[streaming] scheduled-session merge skipped (scheduled_start_at unavailable)",
      );
    }

    // Ended sessions never appear in provider.listActiveStreams — the room is
    // deleted on end. Merge recent ended rows from the DB so replays
    // (recording_url / recording_enabled) and post-stream state stay
    // discoverable through this list.
    const ended = await db.query<LiveShoppingSessionRow>(
      `SELECT * FROM live_shopping_sessions
        WHERE status = 'ended'
        ORDER BY ended_at DESC NULLS LAST, created_at DESC
        LIMIT $1`,
      [limit],
    );
    for (const row of ended.rows) {
      if (seen.has(row.id)) continue;
      sessions.push(mapRowToStreamRoom(row));
    }

    // Discovery-card enrichment: host identity/verified badge plus current-lot
    // title/price/thumbnail — one batched query, no N+1. Fields are additive;
    // sessions without a DB row or a current lot get nulls.
    const enrichment = await loadSessionDiscoveryEnrichment(
      db,
      sessions.map((session) => session.roomId),
    );
    const enriched = sessions.map((session) => ({
      ...session,
      ...(enrichment.get(session.roomId) ?? EMPTY_ENRICHMENT),
    }));

    return { ok: true, sessions: enriched };
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

  // ── "Remind me" for scheduled shows ──
  // Opts the authenticated user into the live_started fan-out for a pre-live
  // session (the live_session_reminders table, migration 297). Idempotent —
  // re-posting is a no-op via the (session_id, user_id) primary key.
  app.post("/streaming/sessions/:sessionId/remind", async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { sessionId } = sessionIdParamsSchema.parse(request.params);

    const row = await fetchSessionRow(db, sessionId);
    if (!row) {
      throw createApiError("STREAM_NOT_FOUND", `Stream session ${sessionId} not found`);
    }
    if (row.status !== "created" && row.status !== "draft" && row.status !== "backstage") {
      reply.code(409);
      return {
        ok: false,
        error: "Reminders are only available for upcoming sessions",
        code: "REMINDER_NOT_AVAILABLE",
      };
    }
    if (row.host_user_id === userId) {
      reply.code(409);
      return {
        ok: false,
        error: "The host does not need a reminder for their own session",
        code: "REMINDER_NOT_AVAILABLE",
      };
    }

    await db.query(
      `INSERT INTO live_session_reminders (session_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (session_id, user_id) DO NOTHING`,
      [sessionId, userId],
    );

    return { ok: true, reminding: true };
  });

  app.delete("/streaming/sessions/:sessionId/remind", async (request) => {
    const userId = resolveAuthenticatedUserId(request);
    const { sessionId } = sessionIdParamsSchema.parse(request.params);

    await db.query(
      `DELETE FROM live_session_reminders WHERE session_id = $1 AND user_id = $2`,
      [sessionId, userId],
    );

    return { ok: true, reminding: false };
  });

  app.post("/streaming/sessions/:roomId/token", async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { roomId } = roomIdParamsSchema.parse(request.params);
    const { role } = tokenBodySchema.parse(request.body);

    const row = await fetchSessionRow(db, roomId);
    if (!row) {
      throw createApiError("STREAM_NOT_FOUND", `Stream session ${roomId} not found`);
    }

    const isHost = row.host_user_id === userId || request.authUser?.role === "admin";

    if (role === "host" && !isHost) {
      reply.code(403);
      return { ok: false, error: "Forbidden: only the host can request a host token", code: "FORBIDDEN" };
    }

    // Viewer tokens are only issued once the session is actually live —
    // mirrors the realtime topic policy (pre-live = host-only). Without this
    // gate a viewer token would also materialize a scheduled session's
    // LiveKit room early (LiveKit auto-creates rooms on first join),
    // defeating deferred room creation, and could expose backstage media.
    if (role === "viewer" && !isHost && row.status !== "live" && row.status !== "ending") {
      reply.code(409);
      return {
        ok: false,
        error: "Session is not live yet",
        code: "STREAM_NOT_LIVE",
      };
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

      // The viewer_count column is deliberately never incremented on token
      // issuance (pinned by bidTransaction.test.ts), so it is always stale.
      // The in-memory membership set is the authoritative live count — emit
      // its post-insert size on the canonical viewer-count event so the
      // broadcast reflects reality and can go up.
      void publishRealtimeEvent({
        topic: liveSessionTopic(roomId),
        type: "live.viewer_count.update",
        payload: { count: viewers.size },
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
      return {
        ok: true,
        viewerCount: activeViewersBySession.get(sessionId)?.size ?? row.viewer_count,
      };
    }

    const viewers = activeViewersBySession.get(sessionId);
    if (!viewers || !viewers.has(userId)) {
      return { ok: true, viewerCount: viewers?.size ?? row.viewer_count };
    }

    viewers.delete(userId);
    if (viewers.size === 0) {
      activeViewersBySession.delete(sessionId);
    }

    // Keep the floor-guarded decrement for the persisted column (pinned by
    // bidTransaction.test.ts), but the in-memory set is the authoritative
    // live count — emit and return its post-delete size.
    await db.query<LiveShoppingSessionRow>(
      `UPDATE live_shopping_sessions
         SET viewer_count = GREATEST(0, viewer_count - 1)
       WHERE id = $1
       RETURNING *`,
      [sessionId],
    );
    void publishRealtimeEvent({
      topic: liveSessionTopic(sessionId),
      type: "live.viewer_count.update",
      payload: { count: viewers.size },
      seq: true,
      version: 1,
    });

    return { ok: true, viewerCount: viewers.size };
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

      // Chat only exists while the stream is live — an ended or not-yet-live
      // room must not silently accumulate messages nobody will see.
      if (row.status !== "live" && row.status !== "ending") {
        reply.code(409);
        return {
          ok: false,
          error: "Session is not live",
          code: "STREAM_NOT_LIVE",
        };
      }

      // Any authenticated user may chat (viewer or host). The host's
      // messages are flagged with isSeller so the UI can badge them.
      const isHost = row.host_user_id === userId;

      // UGC safety (Apple 1.2): a user blocked in either direction by the
      // host cannot participate in the room's chat.
      if (!isHost) {
        const blockCheck = await db.query<{ id: string }>(
          `SELECT id FROM user_blocks
           WHERE (blocker_id = $1 AND blocked_id = $2)
              OR (blocker_id = $2 AND blocked_id = $1)
           LIMIT 1`,
          [userId, row.host_user_id],
        );
        if (blockCheck.rowCount) {
          reply.code(403);
          return {
            ok: false,
            error: "You cannot chat in this stream",
            code: "STREAM_CHAT_BLOCKED",
          };
        }
      }

      // Deterministic scam-pattern gate — same classifier as DMs so live
      // chat cannot be used to move payments off-platform.
      const scamScan = scanMessageForScamPatterns(message);
      if (scamScan.severity === "high") {
        reply.code(400);
        return {
          ok: false,
          error: "This message contains patterns associated with scams. Please keep payments on the platform.",
          code: "STREAM_CHAT_SCAM_PATTERN",
        };
      }

      // Provider text moderation: 'rejected' never persists; 'review'
      // persists quarantined (visible to the sender, filtered from the room)
      // so a human reviewer sees the flagged text in context.
      const moderation = await moderateListingText(`live_chat_${sessionId}`, message);
      if (moderation.status === "rejected") {
        reply.code(422);
        return {
          ok: false,
          error: "Message rejected by content moderation",
          code: "MODERATION_REJECTED",
          labels: moderation.labels,
        };
      }
      const moderationState = moderation.status === "review" ? "quarantined" : "visible";

      const messageId = randomUUID();
      const userName = request.authUser?.userId ?? userId;
      const isSeller = isHost;

      const result = await db.query<LiveShoppingChatMessageRow>(
        `INSERT INTO live_shopping_chat_messages
           (id, session_id, user_id, user_name, message, type, is_seller, moderation_state)
         VALUES ($1, $2, $3, $4, $5, 'message', $6, $7)
         RETURNING *`,
        [messageId, sessionId, userId, userName, message, isSeller, moderationState],
      );

      const chatMessage = mapChatRow(result.rows[0]);

      // Quarantined messages are not broadcast to the room — they exist for
      // review but must not reach viewers before that review completes.
      if (moderationState === "visible") {
        void publishRealtimeEvent({
          topic: liveSessionTopic(sessionId),
          type: "live.chat.message",
          payload: { message: chatMessage },
          seq: true,
          version: 1,
        });
      } else {
        logger.warn(
          { sessionId, messageId, labels: moderation.labels },
          "Live chat message quarantined for review",
        );
      }

      reply.code(201);
      return { ok: true, message: chatMessage };
    },
  );

  // ── Live chat: fetch recent messages (paginated) ──
  app.get("/streaming/sessions/:sessionId/chat", async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    const { limit, before } = chatQuerySchema.parse(request.query ?? {});
    const viewerId = request.authUser?.userId ?? null;

    // For signed-in viewers, hide messages where a block exists between the
    // viewer and the author in either direction — the same predicate the
    // send path enforces between sender and host.
    const blockFilter = viewerId
      ? `AND NOT EXISTS (
           SELECT 1 FROM user_blocks ub
           WHERE (ub.blocker_id = ${"$v"} AND ub.blocked_id = m.user_id)
              OR (ub.blocker_id = m.user_id AND ub.blocked_id = ${"$v"})
         )`
      : '';
    const baseSelect = `SELECT m.* FROM live_shopping_chat_messages m
            WHERE m.session_id = $1
              AND m.moderation_state = 'visible'`;

    const result = await db.query<LiveShoppingChatMessageRow>(
      before
        ? `${baseSelect} AND m.created_at < $2 ${blockFilter.replaceAll('$v', '$4')}
            ORDER BY m.created_at DESC
            LIMIT $3`
        : `${baseSelect} ${blockFilter.replaceAll('$v', '$3')}
            ORDER BY m.created_at DESC
            LIMIT $2`,
      before
        ? viewerId ? [sessionId, before, limit, viewerId] : [sessionId, before, limit]
        : viewerId ? [sessionId, limit, viewerId] : [sessionId, limit],
    );

    const messages = result.rows.map(mapChatRow).reverse();
    return { ok: true, messages };
  });

  // ── Live chat: report a message ──
  // UGC report path bridged into the safety case graph — the subject is the
  // message, so severity>=3 reports can auto-limit the author's reach.
  app.post(
    "/streaming/sessions/:sessionId/chat/:messageId/report",
    async (request, reply) => {
      const reporterId = resolveAuthenticatedUserId(request);
      const { sessionId, messageId } = z
        .object({
          sessionId: z.string().min(2).max(200),
          messageId: z.string().min(2).max(200),
        })
        .parse(request.params);
      const payload = z
        .object({
          reason: z.enum([
            'spam', 'harassment', 'scam_fraud', 'inappropriate_content',
            'off_platform_payment', 'impersonation', 'other',
          ]),
          details: z.string().trim().max(2000).optional(),
          idempotencyKey: z.string().min(2).optional(),
        })
        .parse(request.body ?? {});

      const messageResult = await db.query<LiveShoppingChatMessageRow>(
        `SELECT * FROM live_shopping_chat_messages
         WHERE id = $1 AND session_id = $2
         LIMIT 1`,
        [messageId, sessionId],
      );
      const target = messageResult.rows[0];
      if (!target) {
        reply.code(404);
        return { ok: false, error: "Chat message not found", code: "STREAM_CHAT_MESSAGE_NOT_FOUND" };
      }
      if (target.user_id === reporterId) {
        reply.code(400);
        return { ok: false, error: "You cannot report your own message", code: "STREAM_CHAT_REPORT_SELF" };
      }

      const { reportId: effectiveReportId, duplicated } = await recordConsumerReport(db, {
        kind: 'live_chat',
        reportId: createRuntimeId('lcrpt'),
        reporterId,
        subjectId: messageId,
        reason: payload.reason,
        details: payload.details ?? null,
        evidenceMessageId: messageId,
        idempotencyKey: payload.idempotencyKey ?? null,
        subjectSnapshot: {
          sessionId,
          authorUserId: target.user_id,
          messageExcerpt: target.message.slice(0, 280),
        },
      });

      reply.code(duplicated ? 200 : 201);
      return { ok: true, reportId: effectiveReportId, duplicated };
    },
  );

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

      // Lock the PINNED lot — not just any open lot. A host who advanced
      // the pin without closing the previous lot could otherwise let a bid
      // land on a lot that isn't on screen.
      const lotResult = await client.query<LiveLotRow>(
        `SELECT l.*, COALESCE(s.seller_id, li.seller_id) AS seller_id,
                li.status AS listing_status
           FROM live_lots l
           JOIN live_shopping_current_lots c
             ON c.session_id = l.session_id
            AND c.listing_id = l.listing_id
           LEFT JOIN live_lot_snapshots s ON s.lot_id = l.id
           LEFT JOIN listings li ON li.id = l.listing_id
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

      // The lot's listing must still be biddable — the same eligibility set
      // lot scheduling and settlement enforce ('active' | 'paused'). A
      // listing held at 'risk_pending' mid-stream (risk decision or
      // visibility enforcement), sold, deleted or missing must not keep
      // collecting bids on a lot that can never settle.
      if (
        lockedLot.listing_status !== 'active'
        && lockedLot.listing_status !== 'paused'
      ) {
        await client.query("ROLLBACK");
        reply.code(409);
        return {
          ok: false,
          error: "This lot's listing is no longer available for bidding",
          code: "LISTING_NOT_BIDDABLE",
        };
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
      // must clear high bid + min increment. A zero host increment still
      // requires a strictly higher bid — a same-price bid must not be able
      // to steal the high-bidder position.
      const requiredMinor = Math.max(startPriceMinor, highBidMinor + Math.max(minIncrement, 1));
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
  app.post("/streaming/sessions/:sessionId/lots/auto-close", async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);
    const { sessionId } = sessionIdParamsSchema.parse(request.params);

    const sessionRow = await fetchSessionRow(db, sessionId);
    if (!sessionRow) {
      throw createApiError("STREAM_NOT_FOUND", `Stream session ${sessionId} not found`);
    }

    // Host/admin only — the sweep is also driven by the 5s worker tick, so
    // this endpoint is a manual trigger, not a public surface.
    if (sessionRow.host_user_id !== userId && request.authUser?.role !== "admin") {
      reply.code(403);
      return { ok: false, error: "Forbidden: only the host can trigger a lot sweep", code: "FORBIDDEN" };
    }

    const { closedLots, failedLots } = await sweepDueLiveLots(db, { sessionId });
    return { ok: true, closedLots, failedLots };
  });

  // ── LiveKit webhook receiver ──
  // Mount point for LiveKit server events. The /webhooks/* prefix is already
  // public in the consumer-auth allowlist and is covered by the
  // fastify-raw-body registration in index.ts, so request.rawBody carries the
  // exact bytes the signature was computed over. Verified events no-op 200
  // for now — future egress/recording handling (e.g. 'egress_ended' →
  // persist recording_url) hooks in below the receiver.
  app.post("/webhooks/livekit", async (request, reply) => {
    const apiKey = config.livekitApiKey;
    const apiSecret = config.livekitApiSecret;
    if (!apiKey || !apiSecret) {
      reply.code(503);
      return {
        ok: false,
        error: "LiveKit webhook receiver is not configured",
        code: "LIVEKIT_NOT_CONFIGURED",
      };
    }

    const rawBody =
      typeof request.rawBody === "string"
        ? request.rawBody
        : request.rawBody
          ? request.rawBody.toString("utf8")
          : JSON.stringify(request.body ?? {});
    const authHeader = request.headers.authorization;
    const authorization = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    try {
      const { WebhookReceiver } = await import("livekit-server-sdk");
      const receiver = new WebhookReceiver(apiKey, apiSecret);
      const event = await receiver.receive(rawBody, authorization);
      return { ok: true, event: event.event || "unknown" };
    } catch {
      reply.code(401);
      return {
        ok: false,
        error: "Invalid LiveKit webhook signature",
        code: "WEBHOOK_SIGNATURE_INVALID",
      };
    }
  });
};
