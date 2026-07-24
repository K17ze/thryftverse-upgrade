import type { FastifyInstance, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

type NotificationInput = {
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
};

type NotificationRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  notificationPushCategories: readonly string[];
  queueUserNotification: (input: NotificationInput) => Promise<string | null>;
  toJsonString: (value: unknown) => string;
};

const notificationDeviceSchema = z.object({
  token: z.string().min(16).max(4096),
  provider: z.enum(["expo"]).default("expo"),
  platform: z.enum(["ios", "android", "web"]),
  appVersion: z.string().max(120).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const notificationDeviceParamsSchema = z.object({
  token: z.string().min(16).max(4096),
});

const notificationEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(120).default(30),
  cursor: z.string().max(2048).optional(),
});

const notificationEventParamsSchema = z.object({
  eventId: z.string().min(4).max(128),
});

const notificationPreferencesSchema = z.object({
  preferences: z.record(z.boolean()),
});

const notificationPushTestSchema = z.object({
  title: z.string().min(2).max(160),
  body: z.string().min(2).max(500),
  payload: z.record(z.unknown()).optional(),
});

const unauthorized = (reply: FastifyReply) => {
  reply.code(401);
  return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
};

const decodeCursor = (
  cursor: string,
): { createdAt: string; id: string } | null => {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    const separator = decoded.lastIndexOf("|");
    if (separator <= 0 || separator === decoded.length - 1) {
      return null;
    }
    const createdAt = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    if (!Number.isFinite(Date.parse(createdAt)) || id.length > 128) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
};

export const registerNotificationRoutes = ({
  app,
  db,
  notificationPushCategories,
  queueUserNotification,
  toJsonString,
}: NotificationRouteDependencies) => {
  app.post("/notifications/devices/register", async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      return unauthorized(reply);
    }

    const payload = notificationDeviceSchema.parse(request.body ?? {});
    const result = await db.query<{
      id: number;
      user_id: string;
      provider: string;
      platform: string;
      token: string;
      is_active: boolean;
      app_version: string | null;
      created_at: string;
      last_seen_at: string;
    }>(
      `
        INSERT INTO notification_devices (
          user_id, provider, platform, token, is_active, app_version, metadata, last_seen_at
        )
        VALUES ($1, $2, $3, $4, TRUE, $5, $6::jsonb, NOW())
        ON CONFLICT (token)
        DO UPDATE
          SET
            user_id = EXCLUDED.user_id,
            provider = EXCLUDED.provider,
            platform = EXCLUDED.platform,
            is_active = TRUE,
            app_version = EXCLUDED.app_version,
            metadata = notification_devices.metadata || EXCLUDED.metadata,
            last_seen_at = NOW()
        RETURNING id, user_id, provider, platform, token, is_active, app_version,
                  created_at, last_seen_at
      `,
      [
        authUserId,
        payload.provider,
        payload.platform,
        payload.token,
        payload.appVersion ?? null,
        toJsonString(payload.metadata ?? {}),
      ],
    );
    const row = result.rows[0];

    reply.code(201);
    return {
      ok: true,
      device: {
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        platform: row.platform,
        token: row.token,
        isActive: row.is_active,
        appVersion: row.app_version,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
      },
    };
  });

  app.get("/notifications/devices", async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      return unauthorized(reply);
    }

    const result = await db.query<{
      id: number;
      provider: string;
      platform: string;
      token: string;
      is_active: boolean;
      app_version: string | null;
      created_at: string;
      last_seen_at: string;
    }>(
      `
        SELECT id, provider, platform, token, is_active, app_version, created_at, last_seen_at
        FROM notification_devices
        WHERE user_id = $1
        ORDER BY last_seen_at DESC
      `,
      [authUserId],
    );

    return {
      ok: true,
      devices: result.rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        platform: row.platform,
        token: row.token,
        isActive: row.is_active,
        appVersion: row.app_version,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
      })),
    };
  });

  app.delete("/notifications/devices/:token", async (request, reply) => {
    const { token } = notificationDeviceParamsSchema.parse(request.params);
    const userId = request.authUser?.userId;
    if (!userId) {
      return unauthorized(reply);
    }

    const deleted = await db.query(
      `
        UPDATE notification_devices
        SET is_active = FALSE, last_seen_at = NOW()
        WHERE user_id = $1 AND token = $2
        RETURNING id
      `,
      [userId, token],
    );

    if (!deleted.rowCount) {
      reply.code(404);
      return { ok: false, error: "Notification device token not found" };
    }
    return { ok: true };
  });

  app.get("/notifications/events", async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      return unauthorized(reply);
    }

    const { limit, cursor } = notificationEventsQuerySchema.parse(
      request.query,
    );
    const decodedCursor = cursor ? decodeCursor(cursor) : null;
    if (cursor && !decodedCursor) {
      reply.code(400);
      return {
        ok: false,
        error: "Invalid cursor format",
        code: "INVALID_NOTIFICATION_CURSOR",
      };
    }

    const cursorCondition = decodedCursor
      ? `AND (ne.created_at, ne.id) < ($3::timestamptz, $4)`
      : "";
    const params: (string | number)[] = [authUserId, limit];
    if (decodedCursor) {
      params.push(decodedCursor.createdAt, decodedCursor.id);
    }

    const result = await db.query<{
      id: string;
      user_id: string;
      channel: string;
      title: string;
      body: string;
      payload: Record<string, unknown>;
      status: "queued" | "sent" | "failed";
      provider_message_id: string | null;
      provider_error: string | null;
      created_at: string;
      sent_at: string | null;
      event_type: string;
      actor_user_id: string | null;
      read_at: string | null;
      image_url: string | null;
      route: Record<string, unknown> | null;
      actor_username: string | null;
      actor_display_name: string | null;
      actor_avatar: string | null;
    }>(
      `
        SELECT
          ne.id,
          ne.user_id,
          ne.channel,
          ne.title,
          ne.body,
          ne.payload,
          ne.status,
          ne.provider_message_id,
          ne.provider_error,
          ne.created_at::text,
          ne.sent_at::text,
          ne.event_type,
          ne.actor_user_id,
          ne.read_at::text,
          ne.image_url,
          ne.route,
          u.username AS actor_username,
          u.display_name AS actor_display_name,
          u.avatar AS actor_avatar
        FROM notification_events ne
        LEFT JOIN users u ON u.id = ne.actor_user_id
        WHERE ne.user_id = $1
        ${cursorCondition}
        ORDER BY ne.created_at DESC, ne.id DESC
        LIMIT $2
      `,
      params,
    );

    const items = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      channel: row.channel,
      title: row.title,
      body: row.body,
      payload: row.payload,
      status: row.status,
      providerMessageId: row.provider_message_id,
      providerError: row.provider_error,
      createdAt: row.created_at,
      sentAt: row.sent_at,
      eventType: row.event_type,
      actorUserId: row.actor_user_id,
      actorUsername: row.actor_username,
      actorDisplayName: row.actor_display_name,
      actorAvatar: row.actor_avatar,
      readAt: row.read_at,
      imageUrl: row.image_url,
      route: row.route,
    }));

    const last = items.length === limit ? items.at(-1) : undefined;
    const nextCursor = last
      ? Buffer.from(`${last.createdAt}|${last.id}`).toString("base64")
      : null;

    return { ok: true, items, nextCursor };
  });

  app.get("/notifications/unread-count", async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      return unauthorized(reply);
    }

    const result = await db.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM notification_events
        WHERE user_id = $1 AND read_at IS NULL
      `,
      [authUserId],
    );

    return {
      ok: true,
      unreadCount: Number.parseInt(result.rows[0].count, 10) || 0,
    };
  });

  app.post("/notifications/events/:eventId/read", async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      return unauthorized(reply);
    }

    const { eventId } = notificationEventParamsSchema.parse(request.params);
    const updated = await db.query(
      `
        UPDATE notification_events
        SET read_at = NOW()
        WHERE id = $1 AND user_id = $2 AND read_at IS NULL
        RETURNING id
      `,
      [eventId, authUserId],
    );

    if (!updated.rowCount) {
      reply.code(404);
      return {
        ok: false,
        error: "Notification not found or already read",
        code: "NOTIFICATION_NOT_FOUND",
      };
    }
    return { ok: true };
  });

  app.post("/notifications/read-all", async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      return unauthorized(reply);
    }

    await db.query(
      "UPDATE notification_events SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL",
      [authUserId],
    );
    return { ok: true };
  });

  app.get("/notifications/preferences", async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      return unauthorized(reply);
    }

    const result = await db.query<{ category: string; enabled: boolean }>(
      `
        SELECT category, enabled
        FROM notification_preferences
        WHERE user_id = $1
        ORDER BY category
      `,
      [authUserId],
    );
    const storedPreferences = new Map(
      result.rows.map((row) => [row.category, row.enabled] as const),
    );
    const preferences = Object.fromEntries(
      notificationPushCategories.map((category) => [
        category,
        storedPreferences.get(category) ?? true,
      ]),
    );

    return { ok: true, preferences };
  });

  app.put("/notifications/preferences", async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      return unauthorized(reply);
    }

    const payload = notificationPreferencesSchema.parse(request.body ?? {});
    const entries = Object.entries(payload.preferences);
    const invalidCategory = entries.find(
      ([category]) => !notificationPushCategories.includes(category),
    );
    if (invalidCategory) {
      reply.code(400);
      return {
        ok: false,
        error: `Invalid category: ${invalidCategory[0]}`,
        code: "INVALID_PREFERENCE_CATEGORY",
      };
    }

    if (entries.length) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        for (const [category, enabled] of entries) {
          await client.query(
            `
              INSERT INTO notification_preferences (user_id, category, enabled, updated_at)
              VALUES ($1, $2, $3, NOW())
              ON CONFLICT (user_id, category)
              DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
            `,
            [authUserId, category, enabled],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    return { ok: true };
  });

  app.post("/notifications/push/test", async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      return unauthorized(reply);
    }

    const payload = notificationPushTestSchema.parse(request.body ?? {});
    const eventId = await queueUserNotification({
      userId: authUserId,
      title: payload.title,
      body: payload.body,
      payload: payload.payload,
      metadata: { source: "manual_test" },
    });

    reply.code(202);
    return { ok: true, eventId, status: "queued" };
  });
};
