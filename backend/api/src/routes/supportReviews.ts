import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
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

type SupportReviewRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string) => Error;
  queueUserNotification: (input: NotificationInput) => Promise<string | null>;
};

const supportTicketBodySchema = z.object({
  orderId: z.string().min(4).max(64),
  topicId: z.string().min(1).max(64),
  topicLabel: z.string().min(1).max(120),
  details: z.string().min(1).max(2000),
  evidenceMediaUrls: z.array(z.string().url()).max(5).optional(),
});

const orderIdParamsSchema = z.object({
  orderId: z.string().min(4).max(64),
});

const supportTicketIdParamsSchema = z.object({
  ticketId: z.string().min(4).max(120),
});

const supportTicketStatusSchema = z.object({
  status: z.enum(["open", "resolved", "closed"]),
});

const orderReviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(1).max(2000).optional(),
  photoUrls: z.array(z.string().url()).max(4).optional(),
});

const reviewResponseBodySchema = z.object({
  text: z.string().min(1).max(500),
});

const reviewIdParamsSchema = z.object({
  reviewId: z.string().min(4).max(120),
});

const reviewReportBodySchema = z.object({
  reason: z.enum([
    "fake_or_incentivized",
    "harmful_or_abusive",
    "personal_data",
    "spam",
    "off_topic",
    "other",
  ]),
  details: z.string().max(1000).optional(),
});

const reviewReportsQueueQuerySchema = z.object({
  status: z.enum(["open", "actioned", "dismissed"]).default("open"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

const reviewModerationBodySchema = z.object({
  action: z.enum(["remove", "restore", "escalate", "warn_seller", "dismiss_report"]),
  reason: z.string().min(1).max(2000),
  policyReference: z.string().max(200).optional(),
});

const reviewAppealBodySchema = z.object({
  appealedActionId: z.string().min(4).max(120),
  grounds: z.enum(["factual_error", "policy_misapplied", "new_evidence", "proportionality"]),
  details: z.string().max(2000).optional(),
});

const reviewIncentiveDisclosureBodySchema = z.object({
  incentiveType: z.enum([
    "discount",
    "cashback",
    "free_item",
    "loyalty_points",
    "future_credit",
    "other",
  ]),
  description: z.string().min(1).max(2000),
});

type SupportTicketRow = {
  id: string;
  order_id: string;
  topic_id: string;
  topic_label: string;
  details: string;
  status: string;
  evidence_media_urls: string[] | null;
  created_at: string;
  updated_at: string;
};

const serializeSupportTicket = (row: SupportTicketRow) => ({
  id: row.id,
  orderId: row.order_id,
  topicId: row.topic_id,
  topicLabel: row.topic_label,
  details: row.details,
  status: row.status,
  evidenceMediaUrls: row.evidence_media_urls ?? [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const registerSupportReviewRoutes = ({
  app,
  db,
  createApiError,
  queueUserNotification,
}: SupportReviewRouteDependencies) => {
  app.post("/support/tickets", async (request, reply) => {
    const payload = supportTicketBodySchema.parse(request.body);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }

    const orderResult = await db.query<{ id: string }>(
      "SELECT id FROM orders WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2) LIMIT 1",
      [payload.orderId, userId],
    );

    if (!orderResult.rowCount) {
      reply.code(403);
      return {
        ok: false,
        error: "Order not found or not accessible",
        code: "ORDER_ACCESS_DENIED",
      };
    }

    const existingOpen = await db.query<{ id: string }>(
      `SELECT id FROM support_tickets WHERE user_id = $1 AND order_id = $2 AND status = 'open' LIMIT 1`,
      [userId, payload.orderId],
    );

    if (existingOpen.rowCount) {
      reply.code(409);
      return {
        ok: false,
        error:
          "You already have an open request for this order. Please close it before creating a new one.",
        code: "RESOLUTION_ALREADY_OPEN",
      };
    }

    const ticketId = `ticket_${crypto.randomUUID()}`;
    const evidenceUrls = payload.evidenceMediaUrls ?? [];

    await db.query(
      `
        INSERT INTO support_tickets (
          id, user_id, order_id, topic_id, topic_label, details, status,
          evidence_media_urls, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, NOW(), NOW())
      `,
      [
        ticketId,
        userId,
        payload.orderId,
        payload.topicId,
        payload.topicLabel,
        payload.details,
        evidenceUrls,
      ],
    );

    const orderParties = await db.query<{
      buyer_id: string;
      seller_id: string;
    }>("SELECT buyer_id, seller_id FROM orders WHERE id = $1 LIMIT 1", [
      payload.orderId,
    ]);
    if (orderParties.rows[0]) {
      const otherPartyId =
        orderParties.rows[0].buyer_id === userId
          ? orderParties.rows[0].seller_id
          : orderParties.rows[0].buyer_id;
      try {
        await queueUserNotification({
          userId: otherPartyId,
          title: "Support request opened",
          body: `A support request was opened for order: ${payload.topicLabel}`,
          eventType: "resolution_opened",
          actorUserId: userId,
          payload: {
            ticketId,
            orderId: payload.orderId,
            topicLabel: payload.topicLabel,
          },
          route: { screen: "SupportTicketDetail", params: { ticketId } },
          idempotencyKey: `resolution_opened_${ticketId}`,
          metadata: { source: "support_ticket" },
        });
      } catch (error) {
        app.log.error(
          { err: error, ticketId },
          "Failed to queue resolution_opened notification",
        );
      }
    }

    reply.code(201);
    return {
      ok: true,
      ticket: {
        id: ticketId,
        orderId: payload.orderId,
        topicId: payload.topicId,
        topicLabel: payload.topicLabel,
        details: payload.details,
        status: "open",
        evidenceMediaUrls: evidenceUrls,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  });

  app.get("/support/tickets", async (request) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      throw createApiError("UNAUTHORIZED", "Unauthorized");
    }

    const result = await db.query<SupportTicketRow>(
      `
        SELECT id, order_id, topic_id, topic_label, details, status,
               evidence_media_urls, created_at, updated_at
        FROM support_tickets
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [userId],
    );

    return {
      ok: true,
      tickets: result.rows.map(serializeSupportTicket),
    };
  });

  app.get("/support/tickets/order/:orderId", async (request) => {
    const { orderId } = orderIdParamsSchema.parse(request.params);
    const userId = request.authUser?.userId;
    if (!userId) {
      throw createApiError("UNAUTHORIZED", "Unauthorized");
    }

    const result = await db.query<SupportTicketRow>(
      `
        SELECT id, order_id, topic_id, topic_label, details, status,
               evidence_media_urls, created_at, updated_at
        FROM support_tickets
        WHERE user_id = $1 AND order_id = $2
        ORDER BY created_at DESC
      `,
      [userId, orderId],
    );

    return {
      ok: true,
      tickets: result.rows.map(serializeSupportTicket),
    };
  });

  app.patch("/support/tickets/:ticketId/status", async (request, reply) => {
    const { ticketId } = supportTicketIdParamsSchema.parse(request.params);
    const { status } = supportTicketStatusSchema.parse(request.body);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized" };
    }

    const result = await db.query(
      `
        UPDATE support_tickets
        SET status = $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
        RETURNING id
      `,
      [status, ticketId, userId],
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: "Ticket not found" };
    }

    return { ok: true, ticketId, status };
  });

  app.get("/orders/:orderId/review", async (request, reply) => {
    const { orderId } = orderIdParamsSchema.parse(request.params);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }

    const orderResult = await db.query<{ buyer_id: string; seller_id: string }>(
      "SELECT buyer_id, seller_id FROM orders WHERE id = $1 LIMIT 1",
      [orderId],
    );

    if (!orderResult.rowCount) {
      reply.code(404);
      return { ok: false, error: "Order not found", code: "ORDER_NOT_FOUND" };
    }

    const order = orderResult.rows[0];
    if (order.buyer_id !== userId && order.seller_id !== userId) {
      reply.code(403);
      return {
        ok: false,
        error: "Order not accessible",
        code: "ORDER_ACCESS_DENIED",
      };
    }

    const reviewResult = await db.query<{
      id: string;
      rating: number;
      comment: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, rating, comment, created_at, updated_at
       FROM order_reviews
       WHERE order_id = $1
       LIMIT 1`,
      [orderId],
    );

    if (!reviewResult.rowCount) {
      return { ok: true, review: null };
    }

    const row = reviewResult.rows[0];

    // Fetch media and seller response for the review.
    const [mediaResult, responseResult] = await Promise.all([
      db.query<{ media_url: string; position: number }>(
        `SELECT media_url, position FROM review_media
         WHERE review_id = $1 AND moderation_state = 'published'
         ORDER BY position`,
        [row.id],
      ),
      db.query<{ body: string; created_at: string }>(
        `SELECT body, created_at FROM review_responses
         WHERE review_id = $1 LIMIT 1`,
        [row.id],
      ),
    ]);

    return {
      ok: true,
      review: {
        id: row.id,
        orderId,
        rating: row.rating,
        comment: row.comment,
        photoUrls: mediaResult.rows.length > 0
          ? mediaResult.rows.map((m) => m.media_url)
          : undefined,
        sellerResponse: responseResult.rows[0]
          ? {
              text: responseResult.rows[0].body,
              createdAt: responseResult.rows[0].created_at,
            }
          : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });

  app.post("/orders/:orderId/review", async (request, reply) => {
    const { orderId } = orderIdParamsSchema.parse(request.params);
    const body = orderReviewBodySchema.parse(request.body);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }

    const orderResult = await db.query<{
      buyer_id: string;
      seller_id: string;
      status: string;
    }>("SELECT buyer_id, seller_id, status FROM orders WHERE id = $1 LIMIT 1", [
      orderId,
    ]);

    if (!orderResult.rowCount) {
      reply.code(404);
      return { ok: false, error: "Order not found", code: "ORDER_NOT_FOUND" };
    }

    const order = orderResult.rows[0];
    if (order.buyer_id !== userId) {
      reply.code(403);
      return {
        ok: false,
        error: "Only the buyer can review this order",
        code: "ORDER_ACCESS_DENIED",
      };
    }

    if (order.status !== "delivered" && order.status !== "completed") {
      reply.code(409);
      return {
        ok: false,
        error: "Reviews are only allowed after delivery",
        code: "ORDER_ACTION_NOT_ALLOWED",
      };
    }

    // Idempotency: if an Idempotency-Key header is present, check for an
    // existing review first and return it rather than erroring. This makes
    // retries safe after network drops (unknown-outcome → safe replay).
    const idempotencyKey = (request.headers["idempotency-key"] as string | undefined)?.trim();

    const existingReview = await db.query<{ id: string }>(
      "SELECT id FROM order_reviews WHERE order_id = $1 LIMIT 1",
      [orderId],
    );
    if (existingReview.rowCount) {
      // If idempotency key is present, this is a safe replay — return the
      // existing review with 200 instead of 409.
      if (idempotencyKey) {
        const existing = await db.query<{
          id: string;
          rating: number;
          comment: string | null;
          created_at: string;
          updated_at: string;
        }>(
          `SELECT id, rating, comment, created_at, updated_at
           FROM order_reviews WHERE order_id = $1 LIMIT 1`,
          [orderId],
        );
        const row = existing.rows[0];
        const mediaRows = await db.query<{ media_url: string; position: number }>(
          `SELECT media_url, position FROM review_media WHERE review_id = $1 ORDER BY position`,
          [row.id],
        );
        return {
          ok: true,
          review: {
            id: row.id,
            orderId,
            rating: row.rating,
            comment: row.comment,
            photoUrls: mediaRows.rows.map((m) => m.media_url),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
        };
      }
      reply.code(409);
      return {
        ok: false,
        error: "A review already exists for this order",
        code: "REVIEW_ALREADY_EXISTS",
      };
    }

    const reviewId = `review_${crypto.randomUUID()}`;
    const photoUrls = body.photoUrls ?? [];

    // Insert review and media atomically in a transaction.
    await db.query("BEGIN");
    try {
      await db.query(
        `INSERT INTO order_reviews (
           id, order_id, reviewer_id, seller_id, rating, comment, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [
          reviewId,
          orderId,
          userId,
          order.seller_id,
          body.rating,
          body.comment ?? null,
        ],
      );

      // Persist media if provided.
      for (let i = 0; i < photoUrls.length; i++) {
        const mediaId = `revmedia_${crypto.randomUUID()}`;
        await db.query(
          `INSERT INTO review_media (id, review_id, media_url, position, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [mediaId, reviewId, photoUrls[i], i],
        );
      }

      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }

    try {
      await queueUserNotification({
        userId: order.seller_id,
        title: "New review received",
        body: body.comment
          ? `You received a ${body.rating}-star review: "${body.comment.slice(0, 80)}"`
          : `You received a ${body.rating}-star review`,
        eventType: "review_received",
        actorUserId: userId,
        payload: { reviewId, orderId, rating: body.rating },
        route: { screen: "OrderDetail", params: { orderId } },
        idempotencyKey: `review_received_${orderId}`,
        metadata: { source: "order_review" },
      });
    } catch (error) {
      app.log.error(
        { err: error, reviewId },
        "Failed to queue review_received notification",
      );
    }

    reply.code(201);
    const now = new Date().toISOString();
    return {
      ok: true,
      review: {
        id: reviewId,
        orderId,
        rating: body.rating,
        comment: body.comment ?? null,
        photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
        createdAt: now,
        updatedAt: now,
      },
    };
  });

  // ── Seller response to a review ────────────────────────────────────────────
  // A seller may publish one public response per review. The response is
  // versioned — each edit creates an immutable revision row.
  app.post("/reviews/:reviewId/response", async (request, reply) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    const body = reviewResponseBodySchema.parse(request.body);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }

    // Verify the review exists and the user is the seller of the reviewed order.
    const reviewResult = await db.query<{
      id: string;
      seller_id: string;
      order_id: string;
    }>(
      `SELECT r.id, r.seller_id, r.order_id
       FROM order_reviews r
       WHERE r.id = $1 LIMIT 1`,
      [reviewId],
    );

    if (!reviewResult.rowCount) {
      reply.code(404);
      return { ok: false, error: "Review not found", code: "REVIEW_NOT_FOUND" };
    }

    const review = reviewResult.rows[0];
    if (review.seller_id !== userId) {
      reply.code(403);
      return {
        ok: false,
        error: "Only the seller of this order can respond",
        code: "RESPONSE_NOT_AUTHORIZED",
      };
    }

    // Check for existing response (one per review).
    const existingResponse = await db.query<{ id: string; edit_until: string }>(
      "SELECT id, edit_until FROM review_responses WHERE review_id = $1 LIMIT 1",
      [reviewId],
    );

    if (existingResponse.rowCount) {
      const existing = existingResponse.rows[0];
      // Allow editing within the edit window.
      if (new Date(existing.edit_until) < new Date()) {
        reply.code(409);
        return {
          ok: false,
          error: "The response edit window has closed",
          code: "RESPONSE_WINDOW_CLOSED",
        };
      }

      // Update the response and create a revision.
      await db.query("BEGIN");
      try {
        const versionResult = await db.query<{ next_version: number }>(
          `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
           FROM review_response_revisions WHERE response_id = $1`,
          [existing.id],
        );
        const nextVersion = versionResult.rows[0].next_version;

        await db.query(
          `UPDATE review_responses SET body = $1, updated_at = NOW() WHERE id = $2`,
          [body.text, existing.id],
        );

        const revisionId = `revrev_${crypto.randomUUID()}`;
        await db.query(
          `INSERT INTO review_response_revisions (id, response_id, version, body, change_reason, created_by, created_at)
           VALUES ($1, $2, $3, $4, 'author_edit', $5, NOW())`,
          [revisionId, existing.id, nextVersion, body.text, userId],
        );

        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }

      return {
        ok: true,
        response: {
          reviewId,
          text: body.text,
          updatedAt: new Date().toISOString(),
        },
      };
    }

    // Create new response.
    const responseId = `revresp_${crypto.randomUUID()}`;
    await db.query("BEGIN");
    try {
      await db.query(
        `INSERT INTO review_responses (id, review_id, seller_id, body, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [responseId, reviewId, userId, body.text],
      );

      const revisionId = `revrev_${crypto.randomUUID()}`;
      await db.query(
        `INSERT INTO review_response_revisions (id, response_id, version, body, change_reason, created_by, created_at)
         VALUES ($1, $2, 1, $3, 'initial', $4, NOW())`,
        [revisionId, responseId, body.text, userId],
      );

      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }

    // Notify the reviewer that the seller responded.
    const reviewerResult = await db.query<{ reviewer_id: string }>(
      "SELECT reviewer_id FROM order_reviews WHERE id = $1 LIMIT 1",
      [reviewId],
    );
    if (reviewerResult.rows[0]) {
      try {
        await queueUserNotification({
          userId: reviewerResult.rows[0].reviewer_id,
          title: "Seller responded to your review",
          body: `The seller responded to your review: "${body.text.slice(0, 80)}"`,
          eventType: "review_response_received",
          actorUserId: userId,
          payload: { reviewId, responseId },
          route: { screen: "OrderDetail", params: { orderId: review.order_id } },
          idempotencyKey: `review_response_${reviewId}`,
          metadata: { source: "review_response" },
        });
      } catch (error) {
        app.log.error(
          { err: error, responseId },
          "Failed to queue review_response_received notification",
        );
      }
    }

    reply.code(201);
    return {
      ok: true,
      response: {
        reviewId,
        text: body.text,
        createdAt: new Date().toISOString(),
      },
    };
  });

  // ── Report a review ────────────────────────────────────────────────────────
  // Any authenticated user may report a review for policy review. Reports are
  // confidential — the reviewed user is NOT notified.
  app.post("/reviews/:reviewId/report", async (request, reply) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    const body = reviewReportBodySchema.parse(request.body);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }

    const reviewResult = await db.query<{ id: string }>(
      "SELECT id FROM order_reviews WHERE id = $1 LIMIT 1",
      [reviewId],
    );

    if (!reviewResult.rowCount) {
      reply.code(404);
      return { ok: false, error: "Review not found", code: "REVIEW_NOT_FOUND" };
    }

    const existingReport = await db.query<{ id: string }>(
      "SELECT id FROM review_reports WHERE review_id = $1 AND reporter_id = $2 LIMIT 1",
      [reviewId, userId],
    );

    if (existingReport.rowCount) {
      reply.code(409);
      return {
        ok: false,
        error: "You have already reported this review",
        code: "REPORT_ALREADY_EXISTS",
      };
    }

    const reportId = `revreport_${crypto.randomUUID()}`;

    await db.query(
      `INSERT INTO review_reports (id, review_id, reporter_id, reason, details, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'open', NOW())`,
      [reportId, reviewId, userId, body.reason, body.details ?? null],
    );

    reply.code(201);
    return { ok: true, reportId };
  });

  // ── Moderation queue ───────────────────────────────────────────────────────
  // Admins and moderators can browse the report queue with cursor pagination.
  app.get("/reviews/reports/queue", async (request, reply) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }

    const role = request.authUser?.role;
    if (role !== "admin" && role !== "moderator") {
      reply.code(403);
      return {
        ok: false,
        error: "Admin or moderator access required",
        code: "FORBIDDEN",
      };
    }

    const query = reviewReportsQueueQuerySchema.parse(request.query);
    const limit = query.limit;
    const params: unknown[] = [query.status];
    let paramIdx = 2;

    let cursorCondition = "";
    if (query.cursor) {
      params.push(query.cursor);
      cursorCondition = ` AND r.created_at < $${paramIdx}`;
      paramIdx += 1;
    }
    params.push(limit + 1);
    const limitParam = `$${paramIdx}`;

    const result = await db.query<{
      id: string;
      review_id: string;
      reporter_id: string;
      reason: string;
      details: string | null;
      status: string;
      created_at: string;
      review_rating: number;
      review_comment: string | null;
      reporter_name: string | null;
    }>(
      `SELECT r.id, r.review_id, r.reporter_id, r.reason, r.details, r.status,
              r.created_at,
              rev.rating AS review_rating, rev.comment AS review_comment,
              u.name AS reporter_name
       FROM review_reports r
       JOIN order_reviews rev ON rev.id = r.review_id
       LEFT JOIN users u ON u.id = r.reporter_id
       WHERE r.status = $1${cursorCondition}
       ORDER BY r.created_at DESC
       LIMIT ${limitParam}`,
      params,
    );

    const rows = result.rows;
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].created_at
        : undefined;

    return {
      ok: true,
      reports: items.map((row) => ({
        id: row.id,
        reviewId: row.review_id,
        reporterId: row.reporter_id,
        reporterName: row.reporter_name,
        reason: row.reason,
        details: row.details,
        status: row.status,
        review: {
          rating: row.review_rating,
          comment: row.review_comment,
        },
        createdAt: row.created_at,
      })),
      nextCursor,
    };
  });

  // ── Moderate a review ──────────────────────────────────────────────────────
  // Admins and moderators can act on a review: remove, restore, escalate,
  // warn the seller, or dismiss an outstanding report.
  app.post("/reviews/:reviewId/moderate", async (request, reply) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    const body = reviewModerationBodySchema.parse(request.body);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }

    const role = request.authUser?.role;
    if (role !== "admin" && role !== "moderator") {
      reply.code(403);
      return {
        ok: false,
        error: "Admin or moderator access required",
        code: "FORBIDDEN",
      };
    }

    const reviewResult = await db.query<{
      id: string;
      reviewer_id: string;
      seller_id: string;
      order_id: string;
    }>(
      "SELECT id, reviewer_id, seller_id, order_id FROM order_reviews WHERE id = $1 LIMIT 1",
      [reviewId],
    );

    if (!reviewResult.rowCount) {
      reply.code(404);
      return { ok: false, error: "Review not found", code: "REVIEW_NOT_FOUND" };
    }

    const review = reviewResult.rows[0];
    const actionId = `revmod_${crypto.randomUUID()}`;

    // Determine the new publication state for state-changing actions.
    let newState: string | null = null;
    let stateReason: string | null = null;

    if (body.action === "remove") {
      newState = "removed";
      stateReason = "policy_violation";
    } else if (body.action === "restore") {
      newState = "restored";
      stateReason = "moderator_review";
    }

    await db.query("BEGIN");
    try {
      await db.query(
        `INSERT INTO review_moderation_actions (
           id, review_id, moderator_id, action, reason, policy_reference, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          actionId,
          reviewId,
          userId,
          body.action,
          body.reason,
          body.policyReference ?? null,
        ],
      );

      if (newState) {
        const stateId = `revstate_${crypto.randomUUID()}`;
        await db.query(
          `INSERT INTO review_publication_state (id, review_id, state, state_reason, actor_id, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [stateId, reviewId, newState, stateReason, userId],
        );
      }

      if (body.action === "dismiss_report") {
        await db.query(
          `UPDATE review_reports SET status = 'dismissed', updated_at = NOW()
           WHERE review_id = $1 AND status = 'open'`,
          [reviewId],
        );
      } else if (body.action === "remove" || body.action === "escalate") {
        await db.query(
          `UPDATE review_reports SET status = 'actioned', updated_at = NOW()
           WHERE review_id = $1 AND status = 'open'`,
          [reviewId],
        );
      }

      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }

    // Notify the reviewer and seller of the action (except dismiss_report).
    if (body.action !== "dismiss_report") {
      const actionLabel = body.action.replace(/_/g, " ");
      const notificationBody = body.policyReference
        ? `${actionLabel}: ${body.reason} (policy: ${body.policyReference})`
        : `${actionLabel}: ${body.reason}`;

      for (const recipientId of [review.reviewer_id, review.seller_id]) {
        try {
          await queueUserNotification({
            userId: recipientId,
            title: `Review moderation: ${actionLabel}`,
            body: notificationBody,
            eventType: "review_moderated",
            actorUserId: userId,
            payload: {
              reviewId,
              actionId,
              action: body.action,
              reason: body.reason,
              policyReference: body.policyReference ?? null,
            },
            route: {
              screen: "OrderDetail",
              params: { orderId: review.order_id },
            },
            idempotencyKey: `review_moderated_${actionId}_${recipientId}`,
            metadata: { source: "review_moderation" },
          });
        } catch (error) {
          app.log.error(
            { err: error, actionId, recipientId },
            "Failed to queue review_moderated notification",
          );
        }
      }
    }

    return { ok: true, actionId };
  });

  // ── Appeal a moderation action ─────────────────────────────────────────────
  // The original reviewer or the seller of the order may appeal a moderation
  // action taken on a review.
  app.post("/reviews/:reviewId/appeal", async (request, reply) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    const body = reviewAppealBodySchema.parse(request.body);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }

    const reviewResult = await db.query<{
      id: string;
      reviewer_id: string;
      seller_id: string;
    }>(
      "SELECT id, reviewer_id, seller_id FROM order_reviews WHERE id = $1 LIMIT 1",
      [reviewId],
    );

    if (!reviewResult.rowCount) {
      reply.code(404);
      return { ok: false, error: "Review not found", code: "REVIEW_NOT_FOUND" };
    }

    const review = reviewResult.rows[0];
    if (review.reviewer_id !== userId && review.seller_id !== userId) {
      reply.code(403);
      return {
        ok: false,
        error: "Only the reviewer or seller can appeal this action",
        code: "APPEAL_NOT_AUTHORIZED",
      };
    }

    const actionResult = await db.query<{ id: string }>(
      "SELECT id FROM review_moderation_actions WHERE id = $1 AND review_id = $2 LIMIT 1",
      [body.appealedActionId, reviewId],
    );

    if (!actionResult.rowCount) {
      reply.code(404);
      return {
        ok: false,
        error: "Moderation action not found for this review",
        code: "MODERATION_ACTION_NOT_FOUND",
      };
    }

    const appealId = `revappeal_${crypto.randomUUID()}`;

    await db.query(
      `INSERT INTO review_appeals (
         id, review_id, action_id, appellant_id, grounds, details, status, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'open', NOW())`,
      [
        appealId,
        reviewId,
        body.appealedActionId,
        userId,
        body.grounds,
        body.details ?? null,
      ],
    );

    reply.code(201);
    return { ok: true, appealId };
  });

  // ── Incentive disclosure ───────────────────────────────────────────────────
  // The reviewer or seller may publicly disclose an incentive associated with
  // a review. The disclosure is visible on the review.
  app.post("/reviews/:reviewId/incentive-disclosure", async (request, reply) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    const body = reviewIncentiveDisclosureBodySchema.parse(request.body);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    }

    const reviewResult = await db.query<{
      id: string;
      reviewer_id: string;
      seller_id: string;
    }>(
      "SELECT id, reviewer_id, seller_id FROM order_reviews WHERE id = $1 LIMIT 1",
      [reviewId],
    );

    if (!reviewResult.rowCount) {
      reply.code(404);
      return { ok: false, error: "Review not found", code: "REVIEW_NOT_FOUND" };
    }

    const review = reviewResult.rows[0];
    if (review.reviewer_id !== userId && review.seller_id !== userId) {
      reply.code(403);
      return {
        ok: false,
        error: "Only the reviewer or seller can disclose an incentive",
        code: "DISCLOSURE_NOT_AUTHORIZED",
      };
    }

    const disclosureId = `revdisc_${crypto.randomUUID()}`;

    await db.query(
      `INSERT INTO review_incentive_disclosures (
         id, review_id, discloser_id, incentive_type, description, created_at
       )
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [disclosureId, reviewId, userId, body.incentiveType, body.description],
    );

    reply.code(201);
    return { ok: true, disclosureId };
  });
};
