import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

type CollectionRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string) => Error;
};

const createCollectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  isPrivate: z.boolean().default(false),
});

const collectionIdSchema = z.object({
  collectionId: z.string().min(4).max(120),
});

const collectionItemSchema = z.object({
  listingId: z.string().min(2).max(120),
});

const collectionItemParamsSchema = collectionIdSchema.extend({
  listingId: z.string().min(2).max(120),
});

const updateCollectionSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    isPrivate: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.isPrivate !== undefined,
    { message: "At least one collection field is required" },
  );

type CollectionRow = {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  created_at: string;
  updated_at: string;
};

const findOwnedCollection = async (
  db: Pool,
  collectionId: string,
  userId: string,
) => {
  const result = await db.query<{ id: string }>(
    "SELECT id FROM collections WHERE id = $1 AND user_id = $2 LIMIT 1",
    [collectionId, userId],
  );
  return result.rows[0] ?? null;
};

export const registerCollectionRoutes = ({
  app,
  db,
  createApiError,
}: CollectionRouteDependencies) => {
  app.post("/collections", async (request, reply) => {
    const payload = createCollectionSchema.parse(request.body);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized" };
    }

    const collectionId = `collection_${crypto.randomUUID()}`;
    const result = await db.query<CollectionRow>(
      `
        INSERT INTO collections (id, user_id, name, description, is_private)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, description, is_private, created_at, updated_at
      `,
      [
        collectionId,
        userId,
        payload.name,
        payload.description ?? null,
        payload.isPrivate,
      ],
    );
    const row = result.rows[0];

    reply.code(201);
    return {
      ok: true,
      collection: {
        id: row.id,
        name: row.name,
        description: row.description,
        isPrivate: row.is_private,
        itemIds: [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });

  app.get("/collections", async (request) => {
    const userId = request.authUser?.userId;
    if (!userId) {
      throw createApiError("UNAUTHORIZED", "Unauthorized");
    }

    const result = await db.query<CollectionRow>(
      `
        SELECT id, name, description, is_private, created_at, updated_at
        FROM collections
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [userId],
    );

    const collectionIds = result.rows.map((row) => row.id);
    const itemsResult = collectionIds.length
      ? await db.query<{ collection_id: string; listing_id: string }>(
          `
            SELECT collection_id, listing_id
            FROM collection_items
            WHERE collection_id = ANY($1::text[])
            ORDER BY added_at DESC
          `,
          [collectionIds],
        )
      : { rows: [] };

    const itemsByCollection = new Map<string, string[]>();
    for (const item of itemsResult.rows) {
      const itemIds = itemsByCollection.get(item.collection_id) ?? [];
      itemIds.push(item.listing_id);
      itemsByCollection.set(item.collection_id, itemIds);
    }

    return {
      ok: true,
      collections: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        isPrivate: row.is_private,
        itemIds: itemsByCollection.get(row.id) ?? [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  });

  app.get("/collections/:collectionId", async (request, reply) => {
    const { collectionId } = collectionIdSchema.parse(request.params);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized" };
    }

    const result = await db.query<CollectionRow>(
      `
        SELECT id, name, description, is_private, created_at, updated_at
        FROM collections
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [collectionId, userId],
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: "Collection not found" };
    }

    const itemsResult = await db.query<{ listing_id: string }>(
      `
        SELECT listing_id
        FROM collection_items
        WHERE collection_id = $1
        ORDER BY added_at DESC
      `,
      [collectionId],
    );
    const row = result.rows[0];

    return {
      ok: true,
      collection: {
        id: row.id,
        name: row.name,
        description: row.description,
        isPrivate: row.is_private,
        itemIds: itemsResult.rows.map((item) => item.listing_id),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });

  app.post("/collections/:collectionId/items", async (request, reply) => {
    const { collectionId } = collectionIdSchema.parse(request.params);
    const { listingId } = collectionItemSchema.parse(request.body);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized" };
    }

    if (!(await findOwnedCollection(db, collectionId, userId))) {
      reply.code(403);
      return { ok: false, error: "Collection not found or not owned" };
    }

    const listing = await db.query<{ id: string }>(
      `SELECT id FROM listings WHERE id = $1 AND status = 'active' LIMIT 1`,
      [listingId],
    );
    if (!listing.rowCount) {
      reply.code(404);
      return { ok: false, error: "Active listing not found" };
    }

    await db.query(
      `
        INSERT INTO collection_items (collection_id, listing_id, added_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (collection_id, listing_id) DO NOTHING
      `,
      [collectionId, listingId],
    );

    return { ok: true };
  });

  app.delete(
    "/collections/:collectionId/items/:listingId",
    async (request, reply) => {
      const { collectionId, listingId } = collectionItemParamsSchema.parse(
        request.params,
      );
      const userId = request.authUser?.userId;

      if (!userId) {
        reply.code(401);
        return { ok: false, error: "Unauthorized" };
      }

      if (!(await findOwnedCollection(db, collectionId, userId))) {
        reply.code(403);
        return { ok: false, error: "Collection not found or not owned" };
      }

      await db.query(
        "DELETE FROM collection_items WHERE collection_id = $1 AND listing_id = $2",
        [collectionId, listingId],
      );

      return { ok: true };
    },
  );

  app.patch("/collections/:collectionId", async (request, reply) => {
    const { collectionId } = collectionIdSchema.parse(request.params);
    const body = updateCollectionSchema.parse(request.body);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized" };
    }

    if (!(await findOwnedCollection(db, collectionId, userId))) {
      reply.code(403);
      return { ok: false, error: "Collection not found or not owned" };
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (body.name !== undefined) {
      values.push(body.name);
      updates.push(`name = $${values.length}`);
    }
    if (body.description !== undefined) {
      values.push(body.description);
      updates.push(`description = $${values.length}`);
    }
    if (body.isPrivate !== undefined) {
      values.push(body.isPrivate);
      updates.push(`is_private = $${values.length}`);
    }

    values.push(collectionId, userId);
    await db.query(
      `
        UPDATE collections
        SET ${updates.join(", ")}, updated_at = NOW()
        WHERE id = $${values.length - 1} AND user_id = $${values.length}
      `,
      values,
    );

    return { ok: true, collectionId };
  });

  app.delete("/collections/:collectionId", async (request, reply) => {
    const { collectionId } = collectionIdSchema.parse(request.params);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized" };
    }

    const result = await db.query(
      "DELETE FROM collections WHERE id = $1 AND user_id = $2 RETURNING id",
      [collectionId, userId],
    );

    if (!result.rowCount) {
      reply.code(403);
      return { ok: false, error: "Collection not found or not owned" };
    }

    return { ok: true, collectionId };
  });
};
