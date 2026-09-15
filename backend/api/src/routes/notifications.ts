import type { FastifyInstance, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import {
  NOTIFICATION_EVENT_REGISTRY,
  NOTIFICATION_FILTER_EVENT_TYPES,
  upgradeNotificationEventV2,
} from "../lib/notificationEventRegistry.js";

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
  deviceId: z.coerce.number().int().positive(),
});

const notificationEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(120).default(30),
  cursor: z.string().max(2048).optional(),
  /**
   * Server-side filters — the client previously filtered ≤30 loaded rows
   * locally, so filtered counts and empty states lied past page one.
   *
   * - `eventType`: comma-separated list of concrete event types
   *   (e.g. "auction_outbid,auction_won"). Unknown types simply match no rows.
   * - `role`: V2 semantic role — expands to every registered event type with
   *   that role, so the filter tracks the registry instead of a hardcoded
   *   client-side list.
   * - `unread`: "true" restricts to events with read_at IS NULL.
   *
   * `eventType` and `role` combine by intersection when both are present.
   */
  eventType: z.string().max(2048).optional(),
  role: z
    .enum(["social", "commerce", "auction", "financial", "system"])
    .optional(),
  unread: z.enum(["true", "false"]).optional(),
});

const notificationEventParamsSchema = z.object({
  eventId: z.string().min(4).max(128),
});

const quietHourValueSchema = z.union([
  // Canonical hour-of-day form
  z.number().int().min(0).max(23),
  // "HH:mm" — minutes are accepted for forward compatibility; the stored
  // contract is hour-granular (startHour/endHour), matching the reader.
  z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/),
]);

const quietHoursSchema = z
  .object({
    enabled: z.boolean().default(true),
    start: quietHourValueSchema.optional(),
    end: quietHourValueSchema.optional(),
    // Legacy/explicit hour fields — same storage shape the push-time
    // quiet-hours reader already consumes.
    startHour: z.number().int().min(0).max(23).optional(),
    endHour: z.number().int().min(0).max(23).optional(),
    timezone: z.string().max(64).optional(),
  })
  .refine(
    (value) =>
      (value.start ?? value.startHour) !== undefined &&
      (value.end ?? value.endHour) !== undefined,
    { message: "quietHours requires a start and end" },
  );

function toQuietHour(value: number | string): number {
  if (typeof value === "number") return value;
  return Number.parseInt(value.split(":")[0], 10);
}

const PREVIEW_POLICIES = ["full", "sender_only", "hidden"] as const;

const notificationPreferencesSchema = z.object({
  // Existing contract — per-category on/off toggles. Optional now so a
  // client can persist quiet hours / preview policy alone.
  preferences: z.record(z.boolean()).default({}),
  // User-level quiet window, persisted to every category row (the
  // push-time reader resolves quiet_hours per category).
  // `null` clears the window.
  quietHours: z.union([quietHoursSchema, z.null()]).optional(),
  // Per-category lock-screen preview policy: full | sender_only | hidden.
  previewPolicy: z.record(z.enum(PREVIEW_POLICIES)).optional(),
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

// event type → filter bucket. Built once from the registry mirror of the
// frontend FILTER_EVENT_TYPES mapping so badge counts cover exactly the
// types the corresponding `eventType` filter would list.
const EVENT_TYPE_TO_FILTER = new Map<string, string>();
for (const [filter, types] of Object.entries(NOTIFICATION_FILTER_EVENT_TYPES)) {
  for (const type of types) {
    EVENT_TYPE_TO_FILTER.set(type, filter);
  }
}

/**
 * Per-filter totals for the notification feed's tab badges, keyed by the
 * frontend NotificationFilter keys ('all' | 'unread' | order/new_item/
 * review/price/auction). Counts describe the user's whole non-suppressed
 * set — not the loaded page — so badges stay truthful while paginating.
 */
async function loadNotificationFilterCounts(
  db: Pool,
  userId: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = { all: 0, unread: 0 };
  for (const filter of Object.keys(NOTIFICATION_FILTER_EVENT_TYPES)) {
    counts[filter] = 0;
  }

  const result = await db.query<{
    event_type: string;
    total: string;
    unread: string;
  }>(
    `
      SELECT ne.event_type,
             COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE ne.read_at IS NULL)::text AS unread
        FROM notification_events ne
       WHERE ne.user_id = $1
         AND ne.status != 'suppressed'
       GROUP BY ne.event_type
    `,
    [userId],
  );

  for (const row of result.rows) {
    const total = Number.parseInt(row.total, 10) || 0;
    counts.all += total;
    counts.unread += Number.parseInt(row.unread, 10) || 0;
    const filter = EVENT_TYPE_TO_FILTER.get(row.event_type);
    if (filter) {
      counts[filter] += total;
    }
  }
  return counts;
}

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
        // P0 FIX: Never return the raw push token to the client. The token
        // is a server-side credential — exposing it enables impersonation.
        // The client uses the device id for management, not the token.
        token: undefined,
        tokenRedacted: true,
        platformLabel: row.platform === 'ios' ? 'iPhone' : row.platform === 'android' ? 'Android' : 'Web',
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
        // P0 FIX: Redact raw tokens. Return only a platform label for display.
        token: undefined,
        tokenRedacted: true,
        platformLabel: row.platform === 'ios' ? 'iPhone' : row.platform === 'android' ? 'Android' : 'Web',
        isActive: row.is_active,
        appVersion: row.app_version,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
      })),
    };
  });

  app.delete("/notifications/devices/:deviceId", async (request, reply) => {
    const { deviceId } = notificationDeviceParamsSchema.parse(request.params);
    const userId = request.authUser?.userId;
    if (!userId) {
      return unauthorized(reply);
    }

    const deleted = await db.query(
      `
        UPDATE notification_devices
        SET is_active = FALSE, token_status = 'revoked', last_seen_at = NOW()
        WHERE user_id = $1 AND id = $2
        RETURNING id
      `,
      [userId, deviceId],
    );

    if (!deleted.rowCount) {
      reply.code(404);
      return { ok: false, error: "Notification device not found" };
    }
    return { ok: true };
  });

  app.get("/notifications/events", async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      return unauthorized(reply);
    }

    const { limit, cursor, eventType, role, unread } =
      notificationEventsQuerySchema.parse(request.query);
    const decodedCursor = cursor ? decodeCursor(cursor) : null;
    if (cursor && !decodedCursor) {
      reply.code(400);
      return {
        ok: false,
        error: "Invalid cursor format",
        code: "INVALID_NOTIFICATION_CURSOR",
      };
    }

    // ── Server-side filter resolution ─────────────────────────────────────
    // `eventType` is a comma-separated allowlist of concrete event types.
    // `role` expands to every registry type with that semantic role. When
    // both are given the intersection applies.
    let allowedTypes: Set<string> | null = null;
    if (eventType) {
      const requested = eventType
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const invalid = requested.find(
        (value) => !/^[A-Za-z0-9_.:-]{1,80}$/.test(value),
      );
      if (invalid) {
        reply.code(400);
        return {
          ok: false,
          error: `Invalid eventType filter value: ${invalid}`,
          code: "INVALID_NOTIFICATION_FILTER",
        };
      }
      allowedTypes = new Set(requested);
    }
    if (role) {
      const roleTypes = new Set(
        Object.entries(NOTIFICATION_EVENT_REGISTRY)
          .filter(([, metadata]) => metadata.semanticRole === role)
          .map(([type]) => type),
      );
      allowedTypes = allowedTypes
        ? new Set([...allowedTypes].filter((type) => roleTypes.has(type)))
        : roleTypes;
    }

    const isFiltered = allowedTypes !== null || unread === "true";

    // A filter set that resolves to zero types can never match — return an
    // empty page without running the list query. The badge counts are still
    // emitted so the tab row keeps truthful totals.
    if (allowedTypes !== null && allowedTypes.size === 0) {
      const filterCounts = await loadNotificationFilterCounts(db, authUserId);
      return {
        ok: true,
        items: [],
        nextCursor: null,
        filteredCount: 0,
        filterCounts,
      };
    }

    // $1 = user id, $2 = limit. Filter params come next, cursor params last.
    const params: (string | number | string[])[] = [authUserId, limit];
    const filterConditions: string[] = [];
    if (allowedTypes) {
      params.push([...allowedTypes]);
      // Backed by notification_events_type_idx (user_id, event_type, created_at).
      filterConditions.push(`AND ne.event_type = ANY($${params.length}::text[])`);
    }
    if (unread === "true") {
      filterConditions.push("AND ne.read_at IS NULL");
    }
    const cursorCondition = decodedCursor
      ? `AND (ne.created_at, ne.id) < ($${params.length + 1}::timestamptz, $${params.length + 2})`
      : "";
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
      status: "queued" | "ticketed" | "sent" | "failed" | "suppressed";
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
          AND ne.status != 'suppressed'
        ${filterConditions.join("\n          ")}
        ${cursorCondition}
        ORDER BY ne.created_at DESC, ne.id DESC
        LIMIT $2
      `,
      params,
    );

    // When a filter is active the client needs the real match count, not the
    // size of the first page. The count ignores the cursor (it describes the
    // whole filtered set, like a filtered list header).
    let filteredCount: number | undefined;
    if (isFiltered) {
      const countParams: (string | string[])[] = [authUserId];
      const countConditions: string[] = [];
      if (allowedTypes) {
        countParams.push([...allowedTypes]);
        countConditions.push(`AND ne.event_type = ANY($${countParams.length}::text[])`);
      }
      if (unread === "true") {
        countConditions.push("AND ne.read_at IS NULL");
      }
      const countResult = await db.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM notification_events ne
          WHERE ne.user_id = $1
            AND ne.status != 'suppressed'
          ${countConditions.join("\n            ")}
        `,
        countParams,
      );
      filteredCount = Number.parseInt(countResult.rows[0].count, 10) || 0;
    }

    const items = result.rows.map((row) => {
      const base = {
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
      };
      // Phase 5 V2: include structured semantic fields so the frontend
      // never needs to infer category from title/body text.
      return upgradeNotificationEventV2(base);
    });

    const last = items.length === limit ? items.at(-1) : undefined;
    const nextCursor = last
      ? Buffer.from(`${last.createdAt}|${last.id}`).toString("base64")
      : null;

    // `filteredCount` is only present when a filter param was supplied —
    // additive field, the unfiltered response shape is unchanged.
    // `filterCounts` is always present: the client renders per-filter tab
    // badges from it, so it cannot be gated on the active filter.
    const filterCounts = await loadNotificationFilterCounts(db, authUserId);
    return { ok: true, items, nextCursor, filteredCount, filterCounts };
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
        WHERE user_id = $1 AND read_at IS NULL AND status != 'suppressed'
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

  app.delete("/notifications/events/:eventId", async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      return unauthorized(reply);
    }

    const { eventId } = notificationEventParamsSchema.parse(request.params);
    const deleted = await db.query(
      `
        DELETE FROM notification_events
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `,
      [eventId, authUserId],
    );

    if (!deleted.rowCount) {
      reply.code(404);
      return {
        ok: false,
        error: "Notification not found",
        code: "NOTIFICATION_NOT_FOUND",
      };
    }
    return { ok: true };
  });

  app.get("/notifications/preferences", async (request, reply) => {
    const authUserId = request.authUser?.userId;
    if (!authUserId) {
      return unauthorized(reply);
    }

    const result = await db.query<{
      category: string;
      enabled: boolean;
      preview_policy: string;
      quiet_hours: Record<string, unknown> | null;
    }>(
      `
        SELECT category, enabled, preview_policy, quiet_hours
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

    // Per-category preview policies (default 'full' per column default) and
    // the user-level quiet-hours window — quiet_hours is written uniformly
    // across category rows, so the first non-null row represents it.
    const previewPolicies = Object.fromEntries(
      notificationPushCategories.map((category) => [
        category,
        result.rows.find((row) => row.category === category)?.preview_policy ??
          "full",
      ]),
    );
    const quietHoursRow = result.rows.find((row) => row.quiet_hours != null);

    return {
      ok: true,
      preferences,
      previewPolicies,
      quietHours: quietHoursRow?.quiet_hours ?? null,
    };
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
    const previewEntries = Object.entries(payload.previewPolicy ?? {});
    const invalidPreviewCategory = previewEntries.find(
      ([category]) => !notificationPushCategories.includes(category),
    );
    if (invalidPreviewCategory) {
      reply.code(400);
      return {
        ok: false,
        error: `Invalid category: ${invalidPreviewCategory[0]}`,
        code: "INVALID_PREFERENCE_CATEGORY",
      };
    }

    const hasWrites =
      entries.length > 0 ||
      previewEntries.length > 0 ||
      payload.quietHours !== undefined;

    if (hasWrites) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        for (const [category, enabled] of entries) {
          await client.query(
            `
              INSERT INTO notification_preferences (user_id, category, enabled, updated_at, revision)
              VALUES ($1, $2, $3, NOW(), 1)
              ON CONFLICT (user_id, category)
              DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW(), revision = notification_preferences.revision + 1
            `,
            [authUserId, category, enabled],
          );
        }
        for (const [category, previewPolicy] of previewEntries) {
          await client.query(
            `
              INSERT INTO notification_preferences (user_id, category, enabled, updated_at, revision, preview_policy)
              VALUES ($1, $2, TRUE, NOW(), 1, $3)
              ON CONFLICT (user_id, category)
              DO UPDATE SET preview_policy = EXCLUDED.preview_policy, updated_at = NOW(), revision = notification_preferences.revision + 1
            `,
            [authUserId, category, previewPolicy],
          );
        }
        if (payload.quietHours !== undefined) {
          // Quiet hours are user-level, but the push-time reader resolves
          // quiet_hours on the event's category row — so the same window is
          // written uniformly across every category row for this user.
          const quietHoursValue =
            payload.quietHours === null
              ? null
              : toJsonString({
                  enabled: payload.quietHours.enabled,
                  startHour: toQuietHour(
                    payload.quietHours.start ?? payload.quietHours.startHour!,
                  ),
                  endHour: toQuietHour(
                    payload.quietHours.end ?? payload.quietHours.endHour!,
                  ),
                  ...(payload.quietHours.timezone
                    ? { timezone: payload.quietHours.timezone }
                    : {}),
                });
          for (const category of notificationPushCategories) {
            await client.query(
              `
                INSERT INTO notification_preferences (user_id, category, enabled, updated_at, revision, quiet_hours)
                VALUES ($1, $2, TRUE, NOW(), 1, $3::jsonb)
                ON CONFLICT (user_id, category)
                DO UPDATE SET quiet_hours = EXCLUDED.quiet_hours, updated_at = NOW(), revision = notification_preferences.revision + 1
              `,
              [authUserId, category, quietHoursValue],
            );
          }
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
      eventType: "generic",
      payload: payload.payload,
      metadata: { source: "manual_test" },
    });

    reply.code(202);
    return { ok: true, eventId, status: "queued" };
  });
};
