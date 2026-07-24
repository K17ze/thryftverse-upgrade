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
    return {
      ok: true,
      review: {
        id: row.id,
        orderId,
        rating: row.rating,
        comment: row.comment,
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

    const existingReview = await db.query<{ id: string }>(
      "SELECT id FROM order_reviews WHERE order_id = $1 LIMIT 1",
      [orderId],
    );
    if (existingReview.rowCount) {
      reply.code(409);
      return {
        ok: false,
        error: "A review already exists for this order",
        code: "REVIEW_ALREADY_EXISTS",
      };
    }

    const reviewId = `review_${crypto.randomUUID()}`;
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
        createdAt: now,
        updatedAt: now,
      },
    };
  });
};
