import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { z } from "zod";
import type { Database } from "../lib/database-types.js";

type CollectionRouteDependencies = {
  app: FastifyInstance;
  /** Kysely instance — type-safe query builder over the existing pg.Pool. */
  db: Kysely<Database>;
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

/**
 * Check that a collection exists and is owned by the given user.
 * Uses Kysely's type-safe selectFrom — no hand-maintained row types.
 */
const findOwnedCollection = async (
  db: Kysely<Database>,
  collectionId: string,
  userId: string,
) => {
  return db
    .selectFrom("collections")
    .select("id")
    .where("id", "=", collectionId)
    .where("user_id", "=", userId)
    .limit(1)
    .executeTakeFirst();
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
    const row = await db
      .insertInto("collections")
      .values({
        id: collectionId,
        user_id: userId,
        name: payload.name,
        description: payload.description ?? null,
        is_private: payload.isPrivate,
      })
      .returning([
        "id",
        "name",
        "description",
        "is_private",
        "created_at",
        "updated_at",
      ])
      .executeTakeFirstOrThrow();

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

    const collections = await db
      .selectFrom("collections")
      .select([
        "id",
        "name",
        "description",
        "is_private",
        "created_at",
        "updated_at",
      ])
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .execute();

    const collectionIds = collections.map((row) => row.id);
    const itemsByCollection = new Map<string, string[]>();

    if (collectionIds.length > 0) {
      // Raw SQL escape hatch for ANY(array) — Kysely's sql tag parameterizes
      // the array value automatically. This is the idiomatic pattern for
      // array-column comparisons that the query builder doesn't express
      // directly.
      const itemsResult = await sql<{
        collection_id: string;
        listing_id: string;
      }>`SELECT collection_id, listing_id FROM collection_items WHERE collection_id = ANY(${collectionIds}::text[]) ORDER BY added_at DESC`.execute(
        db,
      );

      for (const item of itemsResult.rows) {
        const itemIds = itemsByCollection.get(item.collection_id) ?? [];
        itemIds.push(item.listing_id);
        itemsByCollection.set(item.collection_id, itemIds);
      }
    }

    return {
      ok: true,
      collections: collections.map((row) => ({
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

    const row = await db
      .selectFrom("collections")
      .select([
        "id",
        "name",
        "description",
        "is_private",
        "created_at",
        "updated_at",
      ])
      .where("id", "=", collectionId)
      .where("user_id", "=", userId)
      .limit(1)
      .executeTakeFirst();

    if (!row) {
      reply.code(404);
      return { ok: false, error: "Collection not found" };
    }

    const items = await db
      .selectFrom("collection_items")
      .select("listing_id")
      .where("collection_id", "=", collectionId)
      .orderBy("added_at", "desc")
      .execute();

    return {
      ok: true,
      collection: {
        id: row.id,
        name: row.name,
        description: row.description,
        isPrivate: row.is_private,
        itemIds: items.map((item) => item.listing_id),
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

    const listing = await db
      .selectFrom("listings")
      .select("id")
      .where("id", "=", listingId)
      .where("status", "=", "active")
      .limit(1)
      .executeTakeFirst();
    if (!listing) {
      reply.code(404);
      return { ok: false, error: "Active listing not found" };
    }

    await db
      .insertInto("collection_items")
      .values({
        collection_id: collectionId,
        listing_id: listingId,
      })
      .onConflict((conflict) =>
        conflict.columns(["collection_id", "listing_id"]).doNothing(),
      )
      .execute();

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

      await db
        .deleteFrom("collection_items")
        .where("collection_id", "=", collectionId)
        .where("listing_id", "=", listingId)
        .execute();

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

    // Kysely's updateTable with dynamic set — type-safe column names,
    // no hand-built SQL string interpolation.
    await db
      .updateTable("collections")
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.isPrivate !== undefined ? { is_private: body.isPrivate } : {}),
        updated_at: new Date(),
      })
      .where("id", "=", collectionId)
      .where("user_id", "=", userId)
      .execute();

    return { ok: true, collectionId };
  });

  app.delete("/collections/:collectionId", async (request, reply) => {
    const { collectionId } = collectionIdSchema.parse(request.params);
    const userId = request.authUser?.userId;

    if (!userId) {
      reply.code(401);
      return { ok: false, error: "Unauthorized" };
    }

    const result = await db
      .deleteFrom("collections")
      .where("id", "=", collectionId)
      .where("user_id", "=", userId)
      .returning("id")
      .executeTakeFirst();

    if (!result) {
      reply.code(403);
      return { ok: false, error: "Collection not found or not owned" };
    }

    return { ok: true, collectionId };
  });
};
