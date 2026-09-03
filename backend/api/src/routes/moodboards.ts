import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { publishRealtimeEvent } from '../lib/realtime.js';

type ApiError = Error & { code: string; statusCode?: number };
type CreateApiError = (code: string, message: string, details?: Record<string, unknown>) => ApiError;
type ResolveAuthenticatedUserId = (request: FastifyRequest, requestedUserId?: string) => string;
type EnsureUserExists = (userId: string) => Promise<void>;

type MoodboardRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: CreateApiError;
  resolveAuthenticatedUserId: ResolveAuthenticatedUserId;
  ensureUserExists: EnsureUserExists;
};

const listMoodboardsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(120).optional(),
  theme: z.string().trim().max(80).optional(),
});

const createMoodboardSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  visibility: z.enum(['public', 'private']).default('private'),
  coverImageUrl: z.string().trim().max(1000).default(''),
  theme: z.string().trim().max(80).default('theme-linen'),
});

const updateMoodboardSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  visibility: z.enum(['public', 'private']).optional(),
  coverImageUrl: z.string().trim().max(1000).optional(),
  theme: z.string().trim().max(80).optional(),
});

const addItemSchema = z.object({
  listingId: z.string().trim().max(120).optional(),
  mediaUrl: z.string().trim().max(1000).default(''),
  mediaFinalizationId: z.string().trim().max(120).optional(),
  title: z.string().trim().max(200).default(''),
  priceGbp: z.coerce.number().min(0).default(0),
  caption: z.string().trim().max(500).default(''),
  positionX: z.coerce.number().min(0).max(1).default(0.5),
  positionY: z.coerce.number().min(0).max(1).default(0.5),
  rotation: z.coerce.number().default(0),
  scale: z.coerce.number().min(0.1).max(10).default(1.0),
});

const updateItemPositionSchema = z.object({
  positionX: z.coerce.number().min(0).max(1).optional(),
  positionY: z.coerce.number().min(0).max(1).optional(),
  rotation: z.coerce.number().optional(),
  scale: z.coerce.number().min(0.1).max(10).optional(),
});

const reorderItemSchema = z.object({
  direction: z.enum(['front', 'back']),
});

const submitOperationSchema = z.object({
  clientOperationId: z.string().trim().min(1).max(120),
  baseRevision: z.coerce.number().int().min(0),
  type: z.enum(['item.add', 'item.transform', 'item.remove', 'item.reorder', 'board.theme', 'board.rename', 'board.visibility']),
  itemId: z.string().trim().max(120).optional(),
  payload: z.record(z.unknown()),
});

const createCommentSchema = z.object({
  itemId: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(2000),
});

const resolveCommentSchema = z.object({
  resolved: z.boolean(),
});

const createInviteSchema = z.object({
  role: z.enum(['editor', 'commenter', 'viewer']).default('editor'),
  recipientUserId: z.string().trim().max(120).optional(),
});

const acceptInviteSchema = z.object({
  token: z.string().trim().min(1).max(120),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(['editor', 'commenter', 'viewer']),
});

const createVersionSchema = z.object({
  label: z.string().trim().max(120).optional(),
});

const pinVersionSchema = z.object({
  isPinned: z.boolean(),
});

type MoodboardRow = {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  visibility: string;
  cover_image_url: string;
  theme: string;
  created_at: string;
  updated_at: string;
  revision: string | number;
  deleted_at: string | null;
  updated_by: string | null;
  curator_name: string | null;
  curator_avatar: string | null;
};

type MoodboardItemRow = {
  id: string;
  moodboard_id: string;
  listing_id: string | null;
  media_url: string;
  title: string;
  price_gbp: string | number;
  caption: string;
  position_x: string | number;
  position_y: string | number;
  rotation: string | number;
  scale: string | number;
  sort_order: number;
  created_at: string;
  revision: string | number;
  deleted_at: string | null;
};

type MoodboardCommentRow = {
  id: string;
  board_id: string;
  author_id: string;
  item_id: string | null;
  body: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_avatar: string | null;
};

type MoodboardSnapshot = {
  title: string;
  description: string;
  theme: string;
  visibility: string;
  items: Array<{
    id: string;
    listingId: string | null;
    mediaUrl: string;
    title: string;
    priceGbp: string | number;
    positionX: string | number;
    positionY: string | number;
    rotation: string | number;
    scale: string | number;
    sortOrder: number;
  }> | null;
};

const moodboardTopic = (boardId: string) => `moodboard:${boardId}`;

// ── Theme catalog — canonical source of truth for canvas themes ──
// The frontend mirrors these in LOCAL_THEME_FALLBACK for synchronous
// getThemeById() lookups; this route is the source of truth for the
// theme picker rail.
const MOODBOARD_THEMES = [
  { id: 'theme-linen', label: 'Linen', backgroundColor: '#F7F4EE', accentColor: '#8A6A3F', fontColor: '#2A2A2A' },
  { id: 'theme-noir', label: 'Noir', backgroundColor: '#1A1A1A', accentColor: '#C9A46A', fontColor: '#F4F0E8' },
  { id: 'theme-sage', label: 'Sage', backgroundColor: '#E8EDE6', accentColor: '#4A6741', fontColor: '#2A3A28' },
  { id: 'theme-blush', label: 'Blush', backgroundColor: '#F5E6E4', accentColor: '#9A6B7A', fontColor: '#4A2A30' },
  { id: 'theme-stone', label: 'Stone', backgroundColor: '#E5E2DC', accentColor: '#6B6B6B', fontColor: '#333333' },
  { id: 'theme-midnight', label: 'Midnight', backgroundColor: '#0F1A2E', accentColor: '#4A7AC4', fontColor: '#E8EDF5' },
];

const MOODBOARD_SELECT_COLUMNS = `
  m.id, m.creator_id, m.title, m.description, m.visibility,
  m.cover_image_url, m.theme, m.created_at, m.updated_at,
  m.revision, m.deleted_at, m.updated_by,
  u.display_name AS curator_name, u.avatar AS curator_avatar
`;

const MOODBOARD_ITEM_SELECT_COLUMNS = `
  id, moodboard_id, listing_id, media_url, title, price_gbp, caption,
  position_x, position_y, rotation, scale, sort_order, created_at,
  revision, deleted_at
`;

function mapItem(row: MoodboardItemRow) {
  return {
    id: row.id,
    listingId: row.listing_id ?? '',
    imageUri: row.media_url,
    title: row.title,
    price: Number(row.price_gbp),
    position: {
      x: Number(row.position_x),
      y: Number(row.position_y),
      scale: Number(row.scale),
      rotation: Number(row.rotation),
    },
    addedAt: row.created_at,
    revision: Number(row.revision),
    isDemo: false,
  };
}

function mapMoodboard(
  row: MoodboardRow,
  items: ReturnType<typeof mapItem>[],
) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    curator: row.curator_name ?? row.creator_id,
    curatorAvatar: row.curator_avatar ?? '',
    items,
    coverImage: row.cover_image_url,
    isPublic: row.visibility === 'public',
    theme: row.theme,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: Number(row.revision),
    deletedAt: row.deleted_at,
    isDemo: false,
  };
}

type QueryClient = {
  query: <T = any>(text: string, values?: any[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

async function requireBoardCapability(
  client: QueryClient,
  boardId: string,
  actorUserId: string,
  _requiredRoles: string[],
): Promise<{ board: MoodboardRow | null; member: { role: string } | null }> {
  const result = await client.query<MoodboardRow & { role: string | null }>(
    `SELECT ${MOODBOARD_SELECT_COLUMNS}, mm.role
     FROM moodboards m
     LEFT JOIN users u ON u.id = m.creator_id
     LEFT JOIN moodboard_members mm ON mm.board_id = m.id AND mm.user_id = $2 AND mm.state = 'active'
     WHERE m.id = $1 AND m.deleted_at IS NULL
     FOR UPDATE OF m`,
    [boardId, actorUserId],
  );
  if (!result.rowCount) return { board: null, member: null };
  const row = result.rows[0];
  return { board: row, member: row.role ? { role: row.role } : null };
}

function hasCapability(
  member: { role: string } | null,
  requiredRoles: string[],
  request: FastifyRequest,
): boolean {
  if (request.authUser?.role === 'admin') return true;
  if (!member) return false;
  return requiredRoles.includes(member.role);
}

export function registerMoodboardRoutes({
  app,
  db,
  createApiError: _createApiError,
  resolveAuthenticatedUserId,
  ensureUserExists,
}: MoodboardRouteDependencies): void {
  app.get('/moodboards', async (request) => {
    const { limit, offset, q, theme } = listMoodboardsQuerySchema.parse(request.query);

    const params: Array<string | number> = [];
    let whereClause = `WHERE m.visibility = 'public' AND m.deleted_at IS NULL`;
    if (q) {
      params.push(`%${q}%`);
      whereClause += ` AND (m.title ILIKE $${params.length} OR m.description ILIKE $${params.length})`;
    }
    if (theme) {
      params.push(theme);
      whereClause += ` AND m.theme = $${params.length}`;
    }
    params.push(limit, offset);

    const result = await db.query<MoodboardRow>(
      `
        SELECT ${MOODBOARD_SELECT_COLUMNS}
        FROM moodboards m
        LEFT JOIN users u ON u.id = m.creator_id
        ${whereClause}
        ORDER BY m.updated_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    const moodboardIds = result.rows.map((r) => r.id);
    const itemsResult = moodboardIds.length
      ? await db.query<MoodboardItemRow>(
          `SELECT ${MOODBOARD_ITEM_SELECT_COLUMNS}
           FROM moodboard_items
           WHERE moodboard_id = ANY($1) AND deleted_at IS NULL
           ORDER BY sort_order`,
          [moodboardIds]
        )
      : { rows: [] };

    const itemsByMoodboard = new Map<string, ReturnType<typeof mapItem>[]>();
    for (const itemRow of itemsResult.rows) {
      const arr = itemsByMoodboard.get(itemRow.moodboard_id) ?? [];
      arr.push(mapItem(itemRow));
      itemsByMoodboard.set(itemRow.moodboard_id, arr);
    }

    return {
      items: result.rows.map((row) =>
        mapMoodboard(row, itemsByMoodboard.get(row.id) ?? [])
      ),
    };
  });

  // ── GET /moodboards/themes — canvas theme catalog ──
  // Returns the canonical set of canvas themes. The frontend's
  // LOCAL_THEME_FALLBACK is a synchronous lookup cache for getThemeById();
  // this route is the source of truth for the theme picker rail.
  app.get('/moodboards/themes', async () => {
    return { items: MOODBOARD_THEMES };
  });

  // ── GET /moodboards/picker-items — listings the user can add to a board ──
  // Sources the picker from the user's saved/wishlisted listings, falling
  // back to recently viewed listings when the user has no saves. Requires
  // authentication — the picker is personalised per user.
  app.get('/moodboards/picker-items', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    await ensureUserExists(actorUserId);

    type PickerRow = {
      id: string;
      listing_id: string;
      image_url: string | null;
      title: string;
      price_gbp: string | number;
      created_at: string;
    };

    // 1. Saved / wishlisted listings (strongest intent)
    const savedResult = await db.query<PickerRow>(
      `SELECT DISTINCT ON (l.id)
              l.id, l.title, l.price_gbp, l.created_at,
              COALESCE(
                l.image_url,
                (SELECT li.image_url FROM listing_images li
                 WHERE li.listing_id = l.id ORDER BY li.sort_order LIMIT 1),
                ''
              ) AS image_url
       FROM interactions i
       JOIN listings l ON l.id = i.listing_id
       WHERE i.user_id = $1
         AND i.action IN ('wishlist', 'save')
         AND l.id IS NOT NULL
       ORDER BY l.id, i.created_at DESC
       LIMIT 24`,
      [actorUserId],
    );

    let rows = savedResult.rows;

    // 2. Fall back to recently viewed listings when the user has no saves
    if (rows.length === 0) {
      const viewedResult = await db.query<PickerRow>(
        `SELECT DISTINCT ON (l.id)
                l.id, l.title, l.price_gbp, l.created_at,
                COALESCE(
                  l.image_url,
                  (SELECT li.image_url FROM listing_images li
                   WHERE li.listing_id = l.id ORDER BY li.sort_order LIMIT 1),
                  ''
                ) AS image_url
         FROM interactions i
         JOIN listings l ON l.id = i.listing_id
         WHERE i.user_id = $1
           AND i.action IN ('view', 'qualified_detail_view')
           AND l.id IS NOT NULL
         ORDER BY l.id, i.created_at DESC
         LIMIT 24`,
        [actorUserId],
      );
      rows = viewedResult.rows;
    }

    return {
      items: rows.map((row) => ({
        id: row.id,
        listingId: row.id,
        imageUri: row.image_url ?? '',
        title: row.title,
        price: Number(row.price_gbp),
        position: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
        addedAt: row.created_at,
      })),
    };
  });

  // ── GET /me/moodboards — boards owned by or shared with the viewer ──
  // Returns boards where the authenticated user is the creator OR an active
  // member, excluding trashed boards. No visibility filter — the user sees
  // their own private boards here.
  app.get('/me/moodboards', async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { limit, offset, q, theme } = listMoodboardsQuerySchema.parse(request.query);

    const params: Array<string | number> = [actorUserId];
    let whereClause = `WHERE m.deleted_at IS NULL AND (
      m.creator_id = $1
      OR EXISTS (
        SELECT 1 FROM moodboard_members mm
        WHERE mm.board_id = m.id AND mm.user_id = $1 AND mm.state = 'active'
      )
    )`;
    if (q) {
      params.push(`%${q}%`);
      whereClause += ` AND (m.title ILIKE $${params.length} OR m.description ILIKE $${params.length})`;
    }
    if (theme) {
      params.push(theme);
      whereClause += ` AND m.theme = $${params.length}`;
    }
    params.push(limit, offset);

    const result = await db.query<MoodboardRow>(
      `
        SELECT ${MOODBOARD_SELECT_COLUMNS}
        FROM moodboards m
        LEFT JOIN users u ON u.id = m.creator_id
        ${whereClause}
        ORDER BY m.updated_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    const moodboardIds = result.rows.map((r) => r.id);
    const itemsResult = moodboardIds.length
      ? await db.query<MoodboardItemRow>(
          `SELECT ${MOODBOARD_ITEM_SELECT_COLUMNS}
           FROM moodboard_items
           WHERE moodboard_id = ANY($1) AND deleted_at IS NULL
           ORDER BY sort_order`,
          [moodboardIds]
        )
      : { rows: [] };

    const itemsByMoodboard = new Map<string, ReturnType<typeof mapItem>[]>();
    for (const itemRow of itemsResult.rows) {
      const arr = itemsByMoodboard.get(itemRow.moodboard_id) ?? [];
      arr.push(mapItem(itemRow));
      itemsByMoodboard.set(itemRow.moodboard_id, arr);
    }

    return {
      items: result.rows.map((row) =>
        mapMoodboard(row, itemsByMoodboard.get(row.id) ?? [])
      ),
    };
  });

  app.get<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId',
    async (request, reply) => {
      const { moodboardId } = request.params;
      const viewerUserId = request.authUser?.userId ?? null;

      const result = await db.query<MoodboardRow>(
        `
          SELECT ${MOODBOARD_SELECT_COLUMNS}
          FROM moodboards m
          LEFT JOIN users u ON u.id = m.creator_id
          WHERE m.id = $1 AND m.deleted_at IS NULL
          LIMIT 1
        `,
        [moodboardId]
      );

      if (!result.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      const moodboard = result.rows[0];
      if (moodboard.visibility === 'private' && moodboard.creator_id !== viewerUserId) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      const itemsResult = await db.query<MoodboardItemRow>(
        `SELECT ${MOODBOARD_ITEM_SELECT_COLUMNS}
         FROM moodboard_items
         WHERE moodboard_id = $1 AND deleted_at IS NULL
         ORDER BY sort_order`,
        [moodboardId]
      );

      return mapMoodboard(moodboard, itemsResult.rows.map(mapItem));
    }
  );

  app.post('/moodboards', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    await ensureUserExists(actorUserId);

    const parsed = createMoodboardSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid moodboard', details: parsed.error.flatten() };
    }

    const data = parsed.data;
    const id = randomUUID();
    const now = new Date();

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO moodboards (id, creator_id, title, description, visibility, cover_image_url, theme, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
        [id, actorUserId, data.title, data.description, data.visibility, data.coverImageUrl, data.theme, now]
      );
      await client.query(
        `INSERT INTO moodboard_members (board_id, user_id, role, state) VALUES ($1, $2, 'owner', 'active')`,
        [id, actorUserId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const result = await db.query<MoodboardRow>(
      `SELECT ${MOODBOARD_SELECT_COLUMNS}
       FROM moodboards m
       LEFT JOIN users u ON u.id = m.creator_id
       WHERE m.id = $1`,
      [id]
    );

    return mapMoodboard(result.rows[0], []);
  });

  app.patch<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const parsed = updateMoodboardSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid update', details: parsed.error.flatten() };
      }

      const data = parsed.data;
      const client = await db.connect();
      let updatedBoard: MoodboardRow | null = null;
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        const sets: string[] = [];
        const params: Array<string | number> = [];
        let paramIdx = 1;
        if (data.title !== undefined) { sets.push(`title = $${paramIdx++}`); params.push(data.title); }
        if (data.description !== undefined) { sets.push(`description = $${paramIdx++}`); params.push(data.description); }
        if (data.visibility !== undefined) { sets.push(`visibility = $${paramIdx++}`); params.push(data.visibility); }
        if (data.coverImageUrl !== undefined) { sets.push(`cover_image_url = $${paramIdx++}`); params.push(data.coverImageUrl); }
        if (data.theme !== undefined) { sets.push(`theme = $${paramIdx++}`); params.push(data.theme); }
        sets.push(`updated_at = NOW()`);
        sets.push(`revision = revision + 1`);
        sets.push(`updated_by = $${paramIdx++}`);
        params.push(actorUserId);
        params.push(moodboardId);

        await client.query(
          `UPDATE moodboards SET ${sets.join(', ')} WHERE id = $${paramIdx}`,
          params
        );

        const result = await client.query<MoodboardRow>(
          `SELECT ${MOODBOARD_SELECT_COLUMNS}
           FROM moodboards m
           LEFT JOIN users u ON u.id = m.creator_id
           WHERE m.id = $1`,
          [moodboardId]
        );
        updatedBoard = result.rows[0];
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      const itemsResult = await db.query<MoodboardItemRow>(
        `SELECT ${MOODBOARD_ITEM_SELECT_COLUMNS}
         FROM moodboard_items
         WHERE moodboard_id = $1 AND deleted_at IS NULL
         ORDER BY sort_order`,
        [moodboardId]
      );

      return mapMoodboard(updatedBoard!, itemsResult.rows.map(mapItem));
    }
  );

  app.delete<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }
        await client.query(
          `UPDATE moodboards SET deleted_at = NOW(), revision = revision + 1, updated_at = NOW(), updated_by = $1 WHERE id = $2`,
          [actorUserId, moodboardId]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return { ok: true };
    }
  );

  // ── POST /moodboards/:moodboardId/restore — owner-only un-trash a board ──
  app.post<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId/restore',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const client = await db.connect();
      let restoredBoard: MoodboardRow | null = null;
      try {
        await client.query('BEGIN');
        // Lock the board row regardless of deleted_at so we can restore it.
        const lockResult = await client.query<MoodboardRow>(
          `SELECT ${MOODBOARD_SELECT_COLUMNS}
           FROM moodboards m
           LEFT JOIN users u ON u.id = m.creator_id
           WHERE m.id = $1
           FOR UPDATE OF m`,
          [moodboardId]
        );
        if (!lockResult.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        const board = lockResult.rows[0];
        const memberResult = await client.query<{ role: string }>(
          `SELECT role FROM moodboard_members WHERE board_id = $1 AND user_id = $2 AND state = 'active'`,
          [moodboardId, actorUserId]
        );
        if (!hasCapability(memberResult.rows[0] ? { role: memberResult.rows[0].role } : null, ['owner'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }
        const updateResult = await client.query<MoodboardRow>(
          `UPDATE moodboards
             SET deleted_at = NULL, revision = revision + 1, updated_at = NOW(), updated_by = $1
           WHERE id = $2
           RETURNING id, creator_id, title, description, visibility,
                     cover_image_url, theme, created_at, updated_at,
                     revision, deleted_at, updated_by`,
          [actorUserId, moodboardId]
        );
        restoredBoard = updateResult.rows[0];
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      const itemsResult = await db.query<MoodboardItemRow>(
        `SELECT ${MOODBOARD_ITEM_SELECT_COLUMNS}
         FROM moodboard_items
         WHERE moodboard_id = $1 AND deleted_at IS NULL
         ORDER BY sort_order`,
        [moodboardId]
      );

      // restoredBoard lacks curator joins; fetch a fully-joined row.
      const joined = await db.query<MoodboardRow>(
        `SELECT ${MOODBOARD_SELECT_COLUMNS}
         FROM moodboards m
         LEFT JOIN users u ON u.id = m.creator_id
         WHERE m.id = $1`,
        [moodboardId]
      );
      return mapMoodboard(joined.rows[0], itemsResult.rows.map(mapItem));
    }
  );

  app.post<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId/items',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const parsed = addItemSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid item', details: parsed.error.flatten() };
      }

      const data = parsed.data;
      const itemId = randomUUID();
      const now = new Date();

      let resolvedMediaUrl = data.mediaUrl;

      if (data.mediaFinalizationId) {
        const finalization = await db.query<{
          owner_id: string;
          status: string;
          public_url: string;
        }>(
          `SELECT owner_id, status, public_url
           FROM upload_finalizations
           WHERE id = $1
           LIMIT 1`,
          [data.mediaFinalizationId]
        );
        const receipt = finalization.rows[0];
        if (
          !receipt
          || receipt.owner_id !== actorUserId
          || receipt.status !== 'finalized'
        ) {
          reply.code(422);
          return {
            ok: false,
            error: 'Media finalization receipt could not be verified',
            code: 'MEDIA_RECEIPT_MISMATCH',
          };
        }
        resolvedMediaUrl = receipt.public_url;
      } else if (!data.listingId) {
        reply.code(400);
        return { ok: false, error: 'mediaFinalizationId or listingId required' };
      }

      const client = await db.connect();
      let itemRow: MoodboardItemRow | null = null;
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner', 'editor']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner', 'editor'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        const sortOrderResult = await client.query<{ max_sort: string | number | null }>(
          `SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM moodboard_items WHERE moodboard_id = $1 AND deleted_at IS NULL FOR UPDATE`,
          [moodboardId]
        );
        const sortOrder = Number(sortOrderResult.rows[0].max_sort) + 1;
        const boardRevision = Number(board.revision);

        await client.query(
          `INSERT INTO moodboard_items
            (id, moodboard_id, listing_id, media_url, title, price_gbp, caption,
             position_x, position_y, rotation, scale, sort_order, created_at, revision)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            itemId,
            moodboardId,
            data.listingId ?? null,
            resolvedMediaUrl,
            data.title,
            data.priceGbp,
            data.caption,
            data.positionX,
            data.positionY,
            data.rotation,
            data.scale,
            sortOrder,
            now,
            boardRevision + 1,
          ]
        );

        if (resolvedMediaUrl) {
          // If no cover image is set on the moodboard, use the first item's media.
          await client.query(
            `UPDATE moodboards SET cover_image_url = $1, updated_at = NOW()
             WHERE id = $2 AND (cover_image_url = '' OR cover_image_url IS NULL)`,
            [resolvedMediaUrl, moodboardId]
          );
        }

        await client.query(
          `UPDATE moodboards SET updated_at = NOW(), revision = revision + 1, updated_by = $1 WHERE id = $2`,
          [actorUserId, moodboardId]
        );

        const itemResult = await client.query<MoodboardItemRow>(
          `SELECT ${MOODBOARD_ITEM_SELECT_COLUMNS}
           FROM moodboard_items WHERE id = $1`,
          [itemId]
        );
        itemRow = itemResult.rows[0];
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      return mapItem(itemRow!);
    }
  );

  app.delete<{ Params: { moodboardId: string; itemId: string } }>(
    '/moodboards/:moodboardId/items/:itemId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, itemId } = request.params;

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner', 'editor']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner', 'editor'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        const result = await client.query(
          `UPDATE moodboard_items SET deleted_at = NOW(), revision = revision + 1 WHERE id = $1 AND moodboard_id = $2 AND deleted_at IS NULL`,
          [itemId, moodboardId]
        );

        if (!result.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Item not found' };
        }

        await client.query(
          `UPDATE moodboards SET updated_at = NOW(), revision = revision + 1, updated_by = $1 WHERE id = $2`,
          [actorUserId, moodboardId]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return { ok: true };
    }
  );

  // ── PATCH /moodboards/:moodboardId/items/:itemId — update item position ──
  app.patch<{ Params: { moodboardId: string; itemId: string } }>(
    '/moodboards/:moodboardId/items/:itemId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, itemId } = request.params;

      const parsed = updateItemPositionSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid position', details: parsed.error.flatten() };
      }

      const data = parsed.data;
      const sets: string[] = [];
      const args: (string | number)[] = [];
      let argIdx = 1;

      if (data.positionX !== undefined) { sets.push(`position_x = $${argIdx++}`); args.push(data.positionX); }
      if (data.positionY !== undefined) { sets.push(`position_y = $${argIdx++}`); args.push(data.positionY); }
      if (data.rotation !== undefined) { sets.push(`rotation = $${argIdx++}`); args.push(data.rotation); }
      if (data.scale !== undefined) { sets.push(`scale = $${argIdx++}`); args.push(data.scale); }

      if (sets.length === 0) {
        reply.code(400);
        return { ok: false, error: 'No position fields provided' };
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner', 'editor']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner', 'editor'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        sets.push(`revision = revision + 1`);
        args.push(moodboardId, itemId);
        const result = await client.query(
          `UPDATE moodboard_items SET ${sets.join(', ')} WHERE moodboard_id = $${argIdx++} AND id = $${argIdx++} AND deleted_at IS NULL`,
          args
        );

        if (!result.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Item not found' };
        }

        await client.query(
          `UPDATE moodboards SET updated_at = NOW(), revision = revision + 1, updated_by = $1 WHERE id = $2`,
          [actorUserId, moodboardId]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return { ok: true };
    }
  );

  // ── PATCH /moodboards/:moodboardId/items/:itemId/reorder — reorder item layer ──
  app.patch<{ Params: { moodboardId: string; itemId: string } }>(
    '/moodboards/:moodboardId/items/:itemId/reorder',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, itemId } = request.params;

      const parsed = reorderItemSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid direction', details: parsed.error.flatten() };
      }

      const { direction } = parsed.data;

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner', 'editor']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner', 'editor'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        if (direction === 'front') {
          const maxResult = await client.query<{ max_sort: string | number | null }>(
            `SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM moodboard_items WHERE moodboard_id = $1 AND deleted_at IS NULL FOR UPDATE`,
            [moodboardId]
          );
          const newSort = Number(maxResult.rows[0].max_sort) + 1;
          await client.query(
            `UPDATE moodboard_items SET sort_order = $1, revision = revision + 1 WHERE id = $2 AND moodboard_id = $3 AND deleted_at IS NULL`,
            [newSort, itemId, moodboardId]
          );
        } else {
          const minResult = await client.query<{ min_sort: string | number | null }>(
            `SELECT COALESCE(MIN(sort_order), 0) AS min_sort FROM moodboard_items WHERE moodboard_id = $1 AND deleted_at IS NULL FOR UPDATE`,
            [moodboardId]
          );
          const newSort = Number(minResult.rows[0].min_sort) - 1;
          await client.query(
            `UPDATE moodboard_items SET sort_order = $1, revision = revision + 1 WHERE id = $2 AND moodboard_id = $3 AND deleted_at IS NULL`,
            [newSort, itemId, moodboardId]
          );
        }

        await client.query(
          `UPDATE moodboards SET updated_at = NOW(), revision = revision + 1, updated_by = $1 WHERE id = $2`,
          [actorUserId, moodboardId]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return { ok: true };
    }
  );

  // ── GET /moodboards/:moodboardId/operations — operation log catchup ──
  // Returns operations applied after the given revision. Used by clients to
  // catch up after a conflict response. Requires the viewer to have read
  // access (owner, member, or public board).
  app.get<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId/operations',
    async (request, reply) => {
      const { moodboardId } = request.params;
      const sinceRevision = Number((request.query as { since?: string }).since ?? 0);

      const boardResult = await db.query<{ visibility: string; creator_id: string; deleted_at: string | null }>(
        `SELECT visibility, creator_id, deleted_at FROM moodboards WHERE id = $1`,
        [moodboardId]
      );
      if (!boardResult.rowCount || boardResult.rows[0].deleted_at) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }
      const board = boardResult.rows[0];
      const viewerUserId = request.authUser?.userId ?? null;
      if (board.visibility === 'private' && board.creator_id !== viewerUserId) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      const opsResult = await db.query<{
        id: string;
        board_id: string;
        actor_id: string;
        client_operation_id: string;
        base_revision: string | number;
        applied_revision: string | number;
        operation_type: string;
        item_id: string | null;
        payload: Record<string, unknown>;
        created_at: string;
      }>(
        `SELECT id, board_id, actor_id, client_operation_id, base_revision, applied_revision,
                operation_type, item_id, payload, created_at
         FROM moodboard_operations
         WHERE board_id = $1 AND applied_revision > $2
         ORDER BY applied_revision`,
        [moodboardId, sinceRevision]
      );

      return {
        items: opsResult.rows.map((r) => ({
          id: r.id,
          boardId: r.board_id,
          actorId: r.actor_id,
          clientOperationId: r.client_operation_id,
          baseRevision: Number(r.base_revision),
          appliedRevision: Number(r.applied_revision),
          operationType: r.operation_type,
          itemId: r.item_id,
          payload: r.payload,
          createdAt: r.created_at,
        })),
      };
    }
  );

  // ── POST /moodboards/:moodboardId/operations — idempotent LWW collaboration primitive ──
  // Clients send an optimistic operation with a client operation id (idempotency
  // key) and the base revision they believed they were editing against. The
  // server dedups retries, checks the base revision, applies the operation
  // server-authoritatively, assigns the canonical applied revision, and returns
  // conflict detail when the base revision is stale.
  app.post<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId/operations',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const parsed = submitOperationSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid operation', details: parsed.error.flatten() };
      }

      const op = parsed.data;
      const operationId = randomUUID();
      const now = new Date();

      const client = await db.connect();
      try {
        await client.query('BEGIN');

        // 1. Idempotency insert. ON CONFLICT means a retried client operation id.
        const insertResult = await client.query<{ id: string; applied_revision: string | number }>(
          `INSERT INTO moodboard_operations (id, board_id, actor_id, client_operation_id, base_revision, applied_revision, operation_type, item_id, payload, created_at)
           VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9)
           ON CONFLICT (board_id, client_operation_id) DO NOTHING
           RETURNING id, applied_revision`,
          [operationId, moodboardId, actorUserId, op.clientOperationId, op.baseRevision, op.type, op.itemId ?? null, JSON.stringify(op.payload), now]
        );

        if (!insertResult.rowCount) {
          // Duplicate — return the existing operation's canonical revision.
          const existing = await client.query<{ id: string; applied_revision: string | number }>(
            `SELECT id, applied_revision FROM moodboard_operations WHERE board_id = $1 AND client_operation_id = $2`,
            [moodboardId, op.clientOperationId]
          );
          await client.query('COMMIT');
          return {
            outcome: 'duplicate',
            operationId: existing.rows[0]?.id,
            revision: Number(existing.rows[0]?.applied_revision),
          };
        }

        // 2. Lock the board row.
        const boardResult = await client.query<{ id: string; revision: string | number }>(
          `SELECT id, revision FROM moodboards WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
          [moodboardId]
        );
        if (!boardResult.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        const boardRevision = Number(boardResult.rows[0].revision);

        // 3. Capability check.
        const memberResult = await client.query<{ role: string }>(
          `SELECT role FROM moodboard_members WHERE board_id = $1 AND user_id = $2 AND state = 'active'`,
          [moodboardId, actorUserId]
        );
        const member = memberResult.rows[0] ? { role: memberResult.rows[0].role } : null;
        if (!hasCapability(member, ['owner', 'editor'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { outcome: 'forbidden', recoverLocalCopy: true };
        }

        // 4. Base revision conflict check.
        if (boardRevision !== op.baseRevision) {
          const sinceResult = await client.query<{
            operation_type: string;
            item_id: string | null;
            payload: Record<string, unknown>;
            applied_revision: string | number;
          }>(
            `SELECT operation_type, item_id, payload, applied_revision
             FROM moodboard_operations
             WHERE board_id = $1 AND applied_revision > $2
             ORDER BY applied_revision`,
            [moodboardId, op.baseRevision]
          );
          await client.query('ROLLBACK');
          return {
            outcome: 'conflict',
            currentRevision: boardRevision,
            operationsSinceBase: sinceResult.rows.map((r) => ({
              operationType: r.operation_type,
              itemId: r.item_id,
              payload: r.payload,
              appliedRevision: Number(r.applied_revision),
            })),
          };
        }

        // 5. Apply the operation.
        const payload = op.payload as Record<string, any>;
        if (op.type === 'item.add') {
          const sortOrderResult = await client.query<{ max_sort: string | number | null }>(
            `SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM moodboard_items WHERE moodboard_id = $1 AND deleted_at IS NULL FOR UPDATE`,
            [moodboardId]
          );
          const sortOrder = Number(sortOrderResult.rows[0].max_sort) + 1;
          const newItemId = (payload.itemId as string) ?? randomUUID();
          await client.query(
            `INSERT INTO moodboard_items
              (id, moodboard_id, listing_id, media_url, title, price_gbp, caption,
               position_x, position_y, rotation, scale, sort_order, created_at, revision)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              newItemId,
              moodboardId,
              (payload.listingId as string) ?? null,
              (payload.mediaUrl as string) ?? '',
              (payload.title as string) ?? '',
              Number(payload.priceGbp ?? 0),
              (payload.caption as string) ?? '',
              Number(payload.positionX ?? 0.5),
              Number(payload.positionY ?? 0.5),
              Number(payload.rotation ?? 0),
              Number(payload.scale ?? 1.0),
              sortOrder,
              now,
              boardRevision + 1,
            ]
          );
        } else if (op.type === 'item.transform') {
          await client.query(
            `UPDATE moodboard_items
               SET position_x = $1, position_y = $2, rotation = $3, scale = $4, revision = revision + 1
             WHERE id = $5 AND moodboard_id = $6 AND deleted_at IS NULL`,
            [
              Number(payload.positionX ?? 0.5),
              Number(payload.positionY ?? 0.5),
              Number(payload.rotation ?? 0),
              Number(payload.scale ?? 1.0),
              op.itemId,
              moodboardId,
            ]
          );
        } else if (op.type === 'item.remove') {
          await client.query(
            `UPDATE moodboard_items SET deleted_at = NOW(), revision = revision + 1 WHERE id = $1 AND moodboard_id = $2`,
            [op.itemId, moodboardId]
          );
        } else if (op.type === 'item.reorder') {
          if (payload.direction === 'front') {
            const maxResult = await client.query<{ max_sort: string | number | null }>(
              `SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM moodboard_items WHERE moodboard_id = $1 AND deleted_at IS NULL FOR UPDATE`,
              [moodboardId]
            );
            const newSort = Number(maxResult.rows[0].max_sort) + 1;
            await client.query(
              `UPDATE moodboard_items SET sort_order = $1, revision = revision + 1 WHERE id = $2 AND moodboard_id = $3 AND deleted_at IS NULL`,
              [newSort, op.itemId, moodboardId]
            );
          } else {
            const minResult = await client.query<{ min_sort: string | number | null }>(
              `SELECT COALESCE(MIN(sort_order), 0) AS min_sort FROM moodboard_items WHERE moodboard_id = $1 AND deleted_at IS NULL FOR UPDATE`,
              [moodboardId]
            );
            const newSort = Number(minResult.rows[0].min_sort) - 1;
            await client.query(
              `UPDATE moodboard_items SET sort_order = $1, revision = revision + 1 WHERE id = $2 AND moodboard_id = $3 AND deleted_at IS NULL`,
              [newSort, op.itemId, moodboardId]
            );
          }
        } else if (op.type === 'board.theme') {
          await client.query(
            `UPDATE moodboards SET theme = $1 WHERE id = $2`,
            [String(payload.theme), moodboardId]
          );
        } else if (op.type === 'board.rename') {
          await client.query(
            `UPDATE moodboards SET title = $1 WHERE id = $2`,
            [String(payload.title), moodboardId]
          );
        } else if (op.type === 'board.visibility') {
          const visibility = String(payload.visibility);
          if (visibility !== 'public' && visibility !== 'private') {
            await client.query('ROLLBACK');
            reply.code(400);
            return { ok: false, error: 'Invalid visibility' };
          }
          await client.query(
            `UPDATE moodboards SET visibility = $1 WHERE id = $2`,
            [visibility, moodboardId]
          );
        }

        // 6. Bump board revision.
        const revisionResult = await client.query<{ revision: string | number }>(
          `UPDATE moodboards SET revision = revision + 1, updated_at = NOW(), updated_by = $1 WHERE id = $2 RETURNING revision`,
          [actorUserId, moodboardId]
        );
        const newRevision = Number(revisionResult.rows[0].revision);

        // 7. Stamp the operation with the canonical applied revision.
        await client.query(
          `UPDATE moodboard_operations SET applied_revision = $1 WHERE id = $2`,
          [newRevision, operationId]
        );

        await client.query('COMMIT');
        void publishRealtimeEvent({
          topic: moodboardTopic(moodboardId),
          type: 'moodboard.operation.applied',
          payload: {
            boardId: moodboardId,
            revision: newRevision,
            operationType: op.type,
            operationId: op.clientOperationId,
            actorId: actorUserId,
          },
        }).catch(() => undefined);
        return {
          outcome: 'applied',
          operationId,
          revision: newRevision,
          canonicalPatch: op.payload,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  );

  // ── GET /moodboards/:moodboardId/comments — list comments ──
  // Any active member (owner/editor/commenter/viewer) or a viewer of a public
  // board can list comments. Private boards require active membership.
  app.get<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId/comments',
    async (request, reply) => {
      const { moodboardId } = request.params;
      const viewerUserId = request.authUser?.userId ?? null;

      const boardResult = await db.query<{ visibility: string; creator_id: string; deleted_at: string | null }>(
        `SELECT visibility, creator_id, deleted_at FROM moodboards WHERE id = $1`,
        [moodboardId]
      );
      if (!boardResult.rowCount || boardResult.rows[0].deleted_at) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }
      const board = boardResult.rows[0];

      let isMember = false;
      if (viewerUserId) {
        const memberResult = await db.query<{ role: string }>(
          `SELECT role FROM moodboard_members WHERE board_id = $1 AND user_id = $2 AND state = 'active'`,
          [moodboardId, viewerUserId]
        );
        isMember = (memberResult.rowCount ?? 0) > 0;
      }

      if (board.visibility === 'private' && !isMember) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      const result = await db.query<MoodboardCommentRow>(
        `SELECT c.id, c.board_id, c.author_id, c.item_id, c.body, c.resolved, c.resolved_by, c.resolved_at, c.created_at, c.updated_at,
                u.display_name AS author_name, u.avatar AS author_avatar
         FROM moodboard_comments c
         JOIN users u ON u.id = c.author_id
         JOIN moodboards m ON m.id = c.board_id AND m.deleted_at IS NULL
         WHERE c.board_id = $1
         ORDER BY c.resolved ASC, c.created_at DESC`,
        [moodboardId]
      );

      return {
        items: result.rows.map((row) => ({
          id: row.id,
          boardId: row.board_id,
          authorId: row.author_id,
          authorName: row.author_name ?? '',
          authorAvatar: row.author_avatar ?? '',
          itemId: row.item_id,
          body: row.body,
          resolved: row.resolved,
          resolvedBy: row.resolved_by,
          resolvedAt: row.resolved_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      };
    }
  );

  // ── POST /moodboards/:moodboardId/comments — create comment ──
  // Requires owner/editor/commenter capability. Viewers cannot comment.
  app.post<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId/comments',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      await ensureUserExists(actorUserId);
      const { moodboardId } = request.params;

      const parsed = createCommentSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid comment', details: parsed.error.flatten() };
      }

      const data = parsed.data;
      const commentId = randomUUID();

      const client = await db.connect();
      let createdRow: MoodboardCommentRow | null = null;
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner', 'editor', 'commenter']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner', 'editor', 'commenter'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        await client.query(
          `INSERT INTO moodboard_comments (id, board_id, author_id, item_id, body) VALUES ($1, $2, $3, $4, $5)`,
          [commentId, moodboardId, actorUserId, data.itemId ?? null, data.body]
        );

        const result = await client.query<MoodboardCommentRow>(
          `SELECT c.id, c.board_id, c.author_id, c.item_id, c.body, c.resolved, c.resolved_by, c.resolved_at, c.created_at, c.updated_at,
                  u.display_name AS author_name, u.avatar AS author_avatar
           FROM moodboard_comments c
           JOIN users u ON u.id = c.author_id
           WHERE c.id = $1`,
          [commentId]
        );
        createdRow = result.rows[0];
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      void publishRealtimeEvent({
        topic: moodboardTopic(moodboardId),
        type: 'moodboard.comment.added',
        payload: {
          boardId: moodboardId,
          commentId,
          authorId: actorUserId,
          itemId: data.itemId ?? null,
        },
      }).catch(() => undefined);

      return {
        id: createdRow!.id,
        boardId: createdRow!.board_id,
        authorId: createdRow!.author_id,
        authorName: createdRow!.author_name ?? '',
        authorAvatar: createdRow!.author_avatar ?? '',
        itemId: createdRow!.item_id,
        body: createdRow!.body,
        resolved: createdRow!.resolved,
        resolvedBy: createdRow!.resolved_by,
        resolvedAt: createdRow!.resolved_at,
        createdAt: createdRow!.created_at,
        updatedAt: createdRow!.updated_at,
      };
    }
  );

  // ── PATCH /moodboards/:moodboardId/comments/:commentId — resolve/unresolve ──
  // Owner/editor can resolve any comment; a commenter can resolve their own.
  app.patch<{ Params: { moodboardId: string; commentId: string } }>(
    '/moodboards/:moodboardId/comments/:commentId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, commentId } = request.params;

      const parsed = resolveCommentSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid resolve payload', details: parsed.error.flatten() };
      }

      const { resolved } = parsed.data;

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner', 'editor']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }

        const commentResult = await client.query<{ author_id: string }>(
          `SELECT author_id FROM moodboard_comments WHERE id = $1 AND board_id = $2`,
          [commentId, moodboardId]
        );
        if (!commentResult.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Comment not found' };
        }

        const isAuthor = commentResult.rows[0].author_id === actorUserId;
        const canResolve = hasCapability(member, ['owner', 'editor'], request) || isAuthor;
        if (!canResolve) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        if (resolved) {
          await client.query(
            `UPDATE moodboard_comments SET resolved = true, resolved_by = $1, resolved_at = NOW(), updated_at = NOW() WHERE id = $2 AND board_id = $3`,
            [actorUserId, commentId, moodboardId]
          );
        } else {
          await client.query(
            `UPDATE moodboard_comments SET resolved = false, resolved_by = NULL, resolved_at = NULL, updated_at = NOW() WHERE id = $1 AND board_id = $2`,
            [commentId, moodboardId]
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      void publishRealtimeEvent({
        topic: moodboardTopic(moodboardId),
        type: 'moodboard.comment.resolved',
        payload: {
          boardId: moodboardId,
          commentId,
          resolved,
          resolvedBy: actorUserId,
        },
      }).catch(() => undefined);
      return { ok: true };
    }
  );

  // ── DELETE /moodboards/:moodboardId/comments/:commentId — delete comment ──
  // Owner/editor can delete any comment; the author can delete their own.
  app.delete<{ Params: { moodboardId: string; commentId: string } }>(
    '/moodboards/:moodboardId/comments/:commentId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, commentId } = request.params;

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner', 'editor']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }

        const commentResult = await client.query<{ author_id: string }>(
          `SELECT author_id FROM moodboard_comments WHERE id = $1 AND board_id = $2`,
          [commentId, moodboardId]
        );
        if (!commentResult.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Comment not found' };
        }

        const isAuthor = commentResult.rows[0].author_id === actorUserId;
        const canDelete =
          request.authUser?.role === 'admin' ||
          hasCapability(member, ['owner', 'editor'], request) ||
          isAuthor;
        if (!canDelete) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        await client.query(
          `DELETE FROM moodboard_comments WHERE id = $1 AND board_id = $2`,
          [commentId, moodboardId]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return { ok: true };
    }
  );

  // ── POST /moodboards/:moodboardId/invites — create invite (owner-only) ──
  // Generates a single-use invite token. The plaintext token is returned ONCE
  // here and never again — only the SHA-256 hash is persisted.
  app.post<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId/invites',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const parsed = createInviteSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid invite', details: parsed.error.flatten() };
      }

      const { role, recipientUserId } = parsed.data;
      const token = randomUUID();
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const inviteId = randomUUID();

      const client = await db.connect();
      let createdInvite: { id: string; expires_at: string } | null = null;
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        const insertResult = await client.query<{ id: string; expires_at: string }>(
          `INSERT INTO moodboard_invites (id, board_id, invited_by, token_hash, role, recipient_user_id, state, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW() + INTERVAL '7 days')
           RETURNING id, expires_at`,
          [inviteId, moodboardId, actorUserId, tokenHash, role, recipientUserId ?? null]
        );
        createdInvite = insertResult.rows[0];
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      return {
        id: createdInvite!.id,
        token,
        role,
        state: 'pending',
        expiresAt: createdInvite!.expires_at,
      };
    }
  );

  // ── GET /moodboards/:moodboardId/invites — list invites (owner-only) ──
  // Returns all invites for the board, newest first. token_hash is never
  // returned to the client.
  app.get<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId/invites',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const client = await db.connect();
      let invites: Array<{
        id: string;
        role: string;
        state: string;
        created_at: string;
        expires_at: string;
        accepted_at: string | null;
        accepted_by: string | null;
        revoked_at: string | null;
        recipient_user_id: string | null;
      }> = [];
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        const result = await client.query<{
          id: string;
          role: string;
          state: string;
          created_at: string;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          revoked_at: string | null;
          recipient_user_id: string | null;
        }>(
          `SELECT id, role, state, created_at, expires_at, accepted_at, accepted_by, revoked_at, recipient_user_id
           FROM moodboard_invites
           WHERE board_id = $1
           ORDER BY created_at DESC`,
          [moodboardId]
        );
        invites = result.rows;
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      return {
        items: invites.map((r) => ({
          id: r.id,
          role: r.role,
          state: r.state,
          createdAt: r.created_at,
          expiresAt: r.expires_at,
          acceptedAt: r.accepted_at,
          acceptedBy: r.accepted_by,
          revokedAt: r.revoked_at,
          recipientUserId: r.recipient_user_id,
        })),
      };
    }
  );

  // ── POST /moodboards/:moodboardId/invites/:inviteId/revoke — revoke invite (owner-only) ──
  app.post<{ Params: { moodboardId: string; inviteId: string } }>(
    '/moodboards/:moodboardId/invites/:inviteId/revoke',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, inviteId } = request.params;

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        const result = await client.query(
          `UPDATE moodboard_invites SET state = 'revoked', revoked_at = NOW()
           WHERE id = $1 AND board_id = $2 AND state = 'pending'`,
          [inviteId, moodboardId]
        );

        if (!result.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Invite not found or already used' };
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return { ok: true };
    }
  );

  // ── POST /moodboards/invites/accept — accept invite (auth required) ──
  // No boardId in the URL — the invite token resolves to the board. Adds the
  // authenticated user as an active member and marks the invite accepted.
  app.post(
    '/moodboards/invites/accept',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);

      const parsed = acceptInviteSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid invite token', details: parsed.error.flatten() };
      }

      const { token } = parsed.data;
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const inviteResult = await db.query<{
        id: string;
        board_id: string;
        role: string;
        state: string;
        expires_at: string;
      }>(
        `SELECT id, board_id, role, state, expires_at
         FROM moodboard_invites
         WHERE token_hash = $1 AND state = 'pending'`,
        [tokenHash]
      );

      if (!inviteResult.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Invite not found or already used' };
      }

      const invite = inviteResult.rows[0];

      // Check expiry — mark expired invites and reject.
      const expiresAt = new Date(invite.expires_at);
      if (expiresAt.getTime() <= Date.now()) {
        await db.query(
          `UPDATE moodboard_invites SET state = 'expired' WHERE id = $1 AND state = 'pending'`,
          [invite.id]
        );
        reply.code(410);
        return { ok: false, error: 'Invite has expired' };
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        // 1. Upsert membership (reactivate removed members).
        await client.query(
          `INSERT INTO moodboard_members (board_id, user_id, role, state)
           VALUES ($1, $2, $3, 'active')
           ON CONFLICT (board_id, user_id) DO UPDATE
             SET role = EXCLUDED.role, state = 'active', removed_at = NULL`,
          [invite.board_id, actorUserId, invite.role]
        );
        // 2. Mark invite accepted.
        await client.query(
          `UPDATE moodboard_invites SET state = 'accepted', accepted_at = NOW(), accepted_by = $2 WHERE id = $1`,
          [invite.id, actorUserId]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      return { ok: true, boardId: invite.board_id };
    }
  );

  // ── GET /moodboards/:moodboardId/members — list members (any active member) ──
  app.get<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId/members',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const client = await db.connect();
      let members: Array<{
        user_id: string;
        display_name: string | null;
        avatar: string | null;
        role: string;
        state: string;
        joined_at: string;
      }> = [];
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner', 'editor', 'commenter', 'viewer']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner', 'editor', 'commenter', 'viewer'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        const result = await client.query<{
          user_id: string;
          display_name: string | null;
          avatar: string | null;
          role: string;
          state: string;
          joined_at: string;
        }>(
          `SELECT mm.user_id, u.display_name, u.avatar, mm.role, mm.state, mm.joined_at
           FROM moodboard_members mm
           JOIN users u ON u.id = mm.user_id
           WHERE mm.board_id = $1
           ORDER BY mm.role = 'owner' DESC, mm.joined_at`,
          [moodboardId]
        );
        members = result.rows;
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      return {
        items: members.map((r) => ({
          userId: r.user_id,
          displayName: r.display_name,
          avatar: r.avatar,
          role: r.role,
          state: r.state,
          joinedAt: r.joined_at,
        })),
      };
    }
  );

  // ── PATCH /moodboards/:moodboardId/members/:userId — change member role (owner-only) ──
  app.patch<{ Params: { moodboardId: string; userId: string } }>(
    '/moodboards/:moodboardId/members/:userId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, userId } = request.params;

      const parsed = updateMemberRoleSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid role', details: parsed.error.flatten() };
      }

      const { role } = parsed.data;

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        // Cannot change the owner's role.
        const targetResult = await client.query<{ role: string }>(
          `SELECT role FROM moodboard_members WHERE board_id = $1 AND user_id = $2 AND state = 'active'`,
          [moodboardId, userId]
        );
        if (!targetResult.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Member not found' };
        }
        if (targetResult.rows[0].role === 'owner') {
          await client.query('ROLLBACK');
          reply.code(400);
          return { ok: false, error: 'Cannot change owner role' };
        }

        const result = await client.query(
          `UPDATE moodboard_members SET role = $1
           WHERE board_id = $2 AND user_id = $3 AND role != 'owner' AND state = 'active'`,
          [role, moodboardId, userId]
        );

        if (!result.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Member not found' };
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return { ok: true };
    }
  );

  // ── DELETE /moodboards/:moodboardId/members/:userId — remove member (owner-only) ──
  app.delete<{ Params: { moodboardId: string; userId: string } }>(
    '/moodboards/:moodboardId/members/:userId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, userId } = request.params;

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        // Cannot remove the owner.
        const targetResult = await client.query<{ role: string }>(
          `SELECT role FROM moodboard_members WHERE board_id = $1 AND user_id = $2 AND state = 'active'`,
          [moodboardId, userId]
        );
        if (!targetResult.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Member not found' };
        }
        if (targetResult.rows[0].role === 'owner') {
          await client.query('ROLLBACK');
          reply.code(400);
          return { ok: false, error: 'Cannot remove owner' };
        }

        const result = await client.query(
          `UPDATE moodboard_members SET state = 'removed', removed_at = NOW()
           WHERE board_id = $1 AND user_id = $2 AND role != 'owner'`,
          [moodboardId, userId]
        );

        if (!result.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Member not found' };
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return { ok: true };
    }
  );

  /**
   * Create a version snapshot of the board's current state.
   * Owner/editor capability required. The snapshot captures board metadata
   * and all live items. Revisions are unique per board; re-snapshotting the
   * same revision pins the existing version.
   */
  app.post<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId/versions',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const parsed = createVersionSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid version', details: parsed.error.flatten() };
      }

      const label = parsed.data.label;
      const versionId = randomUUID();

      const client = await db.connect();
      let versionRow: {
        id: string;
        board_id: string;
        revision: string | number;
        label: string | null;
        source: string;
        is_pinned: boolean;
        created_by: string | null;
        created_at: string;
      } | null = null;
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner', 'editor']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner', 'editor'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        const boardRevision = Number(board.revision);

        const snapshotResult = await client.query<{ snapshot: MoodboardSnapshot }>(
          `SELECT jsonb_build_object('title', m.title, 'description', m.description, 'theme', m.theme, 'visibility', m.visibility, 'items', (SELECT jsonb_agg(jsonb_build_object('id', mi.id, 'listingId', mi.listing_id, 'mediaUrl', mi.media_url, 'title', mi.title, 'priceGbp', mi.price_gbp, 'positionX', mi.position_x, 'positionY', mi.position_y, 'rotation', mi.rotation, 'scale', mi.scale, 'sortOrder', mi.sort_order) ORDER BY mi.sort_order) FROM moodboard_items mi WHERE mi.moodboard_id = m.id AND mi.deleted_at IS NULL)) AS snapshot FROM moodboards m WHERE m.id = $1`,
          [moodboardId]
        );

        const snapshot = snapshotResult.rows[0].snapshot;

        const insertResult = await client.query<{
          id: string;
          board_id: string;
          revision: string | number;
          label: string | null;
          source: string;
          is_pinned: boolean;
          created_by: string | null;
          created_at: string;
        }>(
          `INSERT INTO moodboard_versions (id, board_id, revision, snapshot, label, created_by, source) VALUES ($1, $2, $3, $4, $5, $6, 'manual') ON CONFLICT (board_id, revision) DO UPDATE SET label = EXCLUDED.label, is_pinned = true RETURNING *`,
          [versionId, moodboardId, boardRevision, JSON.stringify(snapshot), label ?? null, actorUserId]
        );

        versionRow = insertResult.rows[0];
        await client.query('COMMIT');
        void publishRealtimeEvent({
          topic: moodboardTopic(moodboardId),
          type: 'moodboard.version.created',
          payload: {
            boardId: moodboardId,
            versionId,
            revision: boardRevision,
            source: 'manual',
          },
        }).catch(() => undefined);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      return {
        id: versionRow.id,
        boardId: versionRow.board_id,
        revision: Number(versionRow.revision),
        label: versionRow.label,
        source: versionRow.source,
        isPinned: versionRow.is_pinned,
        createdAt: versionRow.created_at,
        createdBy: versionRow.created_by,
      };
    }
  );

  /**
   * List version snapshots for a board, newest revision first.
   * Any active member or owner can view version history.
   */
  app.get<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId/versions',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const boardResult = await db.query<{ creator_id: string; deleted_at: string | null }>(
        `SELECT creator_id, deleted_at FROM moodboards WHERE id = $1`,
        [moodboardId]
      );
      if (!boardResult.rowCount || boardResult.rows[0].deleted_at) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      const isOwner = boardResult.rows[0].creator_id === actorUserId;
      const isAdmin = request.authUser?.role === 'admin';
      if (!isOwner && !isAdmin) {
        const memberResult = await db.query<{ role: string }>(
          `SELECT role FROM moodboard_members WHERE board_id = $1 AND user_id = $2 AND state = 'active'`,
          [moodboardId, actorUserId]
        );
        if (!memberResult.rowCount) {
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
      }

      const versionsResult = await db.query<{
        id: string;
        board_id: string;
        revision: string | number;
        label: string | null;
        source: string;
        is_pinned: boolean;
        created_by: string | null;
        created_at: string;
        created_by_name: string | null;
      }>(
        `SELECT v.id, v.board_id, v.revision, v.label, v.source, v.is_pinned, v.created_by, v.created_at, u.display_name AS created_by_name FROM moodboard_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.board_id = $1 ORDER BY v.revision DESC LIMIT 50`,
        [moodboardId]
      );

      return {
        items: versionsResult.rows.map((r) => ({
          id: r.id,
          boardId: r.board_id,
          revision: Number(r.revision),
          label: r.label,
          source: r.source,
          isPinned: r.is_pinned,
          createdAt: r.created_at,
          createdByName: r.created_by_name,
        })),
      };
    }
  );

  /**
   * Restore a board from a version snapshot.
   * Owner-only. Creates a new revision from the snapshot — history is
   * never overwritten. All current items are soft-deleted and re-inserted
   * from the snapshot with new ids.
   */
  app.post<{ Params: { moodboardId: string; versionId: string } }>(
    '/moodboards/:moodboardId/versions/:versionId/restore',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, versionId } = request.params;

      const client = await db.connect();
      let restoredBoard: MoodboardRow | null = null;
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        const snapshotResult = await client.query<{ snapshot: MoodboardSnapshot }>(
          `SELECT snapshot FROM moodboard_versions WHERE id = $1 AND board_id = $2`,
          [versionId, moodboardId]
        );
        if (!snapshotResult.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Version not found' };
        }

        const snapshot = snapshotResult.rows[0].snapshot;
        const boardRevision = Number(board.revision);
        const now = new Date();

        await client.query(
          `UPDATE moodboard_items SET deleted_at = NOW(), revision = revision + 1 WHERE moodboard_id = $1 AND deleted_at IS NULL`,
          [moodboardId]
        );

        const items = snapshot.items ?? [];
        for (const item of items) {
          const newItemId = randomUUID();
          await client.query(
            `INSERT INTO moodboard_items
              (id, moodboard_id, listing_id, media_url, title, price_gbp, caption,
               position_x, position_y, rotation, scale, sort_order, created_at, revision)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              newItemId,
              moodboardId,
              item.listingId ?? null,
              item.mediaUrl,
              item.title,
              Number(item.priceGbp),
              '',
              Number(item.positionX),
              Number(item.positionY),
              Number(item.rotation),
              Number(item.scale),
              Number(item.sortOrder),
              now,
              boardRevision + 1,
            ]
          );
        }

        const updateResult = await client.query<{ revision: string | number }>(
          `UPDATE moodboards SET title = $1, description = $2, theme = $3, visibility = $4, revision = revision + 1, updated_at = NOW(), updated_by = $5 WHERE id = $6 RETURNING revision`,
          [snapshot.title, snapshot.description, snapshot.theme, snapshot.visibility, actorUserId, moodboardId]
        );
        const newRevision = Number(updateResult.rows[0].revision);

        const restoreVersionId = randomUUID();
        await client.query(
          `INSERT INTO moodboard_versions (id, board_id, revision, snapshot, created_by, source) VALUES ($1, $2, $3, $4, $5, 'restore')`,
          [restoreVersionId, moodboardId, newRevision, JSON.stringify(snapshot), actorUserId]
        );

        const result = await client.query<MoodboardRow>(
          `SELECT ${MOODBOARD_SELECT_COLUMNS}
           FROM moodboards m
           LEFT JOIN users u ON u.id = m.creator_id
           WHERE m.id = $1`,
          [moodboardId]
        );
        restoredBoard = result.rows[0];
        await client.query('COMMIT');
        void publishRealtimeEvent({
          topic: moodboardTopic(moodboardId),
          type: 'moodboard.version.restored',
          payload: {
            boardId: moodboardId,
            versionId,
            newRevision,
          },
        }).catch(() => undefined);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      const itemsResult = await db.query<MoodboardItemRow>(
        `SELECT ${MOODBOARD_ITEM_SELECT_COLUMNS}
         FROM moodboard_items
         WHERE moodboard_id = $1 AND deleted_at IS NULL
         ORDER BY sort_order`,
        [moodboardId]
      );

      return mapMoodboard(restoredBoard!, itemsResult.rows.map(mapItem));
    }
  );

  /**
   * Pin or unpin a version snapshot.
   * Owner-only.
   */
  app.patch<{ Params: { moodboardId: string; versionId: string } }>(
    '/moodboards/:moodboardId/versions/:versionId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, versionId } = request.params;

      const parsed = pinVersionSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid pin state', details: parsed.error.flatten() };
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { board, member } = await requireBoardCapability(client, moodboardId, actorUserId, ['owner']);
        if (!board) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Moodboard not found' };
        }
        if (!hasCapability(member, ['owner'], request)) {
          await client.query('ROLLBACK');
          reply.code(403);
          return { ok: false, error: 'Forbidden: insufficient capability' };
        }

        const result = await client.query(
          `UPDATE moodboard_versions SET is_pinned = $1 WHERE id = $2 AND board_id = $3`,
          [parsed.data.isPinned, versionId, moodboardId]
        );

        if (!result.rowCount) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { ok: false, error: 'Version not found' };
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return { ok: true };
    }
  );
}
