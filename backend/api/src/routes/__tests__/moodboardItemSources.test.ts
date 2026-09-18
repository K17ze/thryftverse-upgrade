/**
 * Moodboard item source resolution — migration 318 contract tests.
 *
 * Registers the real `registerMoodboardRoutes` module against a minimal
 * Fastify app with a stateful fake `pg.Pool`, exercising the actual route
 * logic for both write paths that share `resolveItemSource`:
 *
 *   POST /moodboards/:moodboardId/items       — REST add-item
 *   POST /moodboards/:moodboardId/operations  — LWW ops `item.add`
 *
 * Covered invariants:
 *   - listingId resolves image/title/price server-side (client values are
 *     hints; server values win) — fixes the media_url='' defect.
 *   - lookId resolves only the actor's own published looks; video looks
 *     produce media_type='video' items with poster_url.
 *   - mediaFinalizationId writes media_asset_id + asset-derived
 *     media_type/aspect_ratio.
 *   - aspectRatio is clamped to 0.2–5 on the unvalidated ops payload.
 *   - The ops path rejects unverified mediaUrl-only adds (same trust
 *     boundary as REST).
 */

import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import Fastify from 'fastify';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import { registerMoodboardRoutes } from '../moodboards.js';
import { getRedisClient } from '../../lib/redisClient.js';

const ME = 'user-me';
const OTHER = 'user-other';
const BOARD = 'board-1';

const auth = { authorization: 'Bearer test', 'content-type': 'application/json' };

type Row = Record<string, unknown>;

function fakeDb() {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const items = new Map<string, Row>();
  let maxSort = -1;

  const board: Row = {
    id: BOARD,
    creator_id: ME,
    title: 'Board',
    description: '',
    visibility: 'private',
    cover_image_url: '',
    theme: 'theme-linen',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    revision: 0,
    deleted_at: null,
    updated_by: null,
    curator_name: null,
    curator_avatar: null,
  };
  const members = new Map<string, string>([[ME, 'owner']]);

  const listings = new Map<string, Row>([
    ['lst-1', { id: 'lst-1', title: 'Vintage Denim Jacket', price_gbp: 42.5, image_url: 'https://cdn.example.com/jacket.jpg' }],
    ['lst-vid', { id: 'lst-vid', title: 'Video Dress', price_gbp: 60, image_url: null }],
  ]);
  const listingImages = new Map<string, Row[]>([
    ['lst-vid', [{ media_type: 'video', poster_url: 'https://cdn.example.com/dress-poster.jpg', image_url: '', sort_order: 0 }]],
  ]);
  const looks = new Map<string, Row>([
    ['look-img', { id: 'look-img', creator_id: ME, status: 'published', title: 'Spring Fit', media_url: 'https://cdn.example.com/look.jpg', media_type: 'image', poster_url: null }],
    ['look-vid', { id: 'look-vid', creator_id: ME, status: 'published', title: 'Motion Fit', media_url: 'https://cdn.example.com/look.m3u8', media_type: 'video', poster_url: 'https://cdn.example.com/look-poster.jpg' }],
    ['look-other', { id: 'look-other', creator_id: OTHER, status: 'published', title: 'Not Mine', media_url: 'https://cdn.example.com/other.jpg', media_type: 'image', poster_url: null }],
    ['look-draft', { id: 'look-draft', creator_id: ME, status: 'draft', title: 'WIP', media_url: 'https://cdn.example.com/draft.jpg', media_type: 'image', poster_url: null }],
  ]);
  const assets = new Map<string, Row>([
    ['masset-1', { media_kind: 'image', width: 1600, height: 900, canonical_url: 'https://cdn.example.com/up-canonical.jpg' }],
    ['masset-2', { media_kind: 'video', width: 1080, height: 1920, canonical_url: null }],
    ['masset-other', { media_kind: 'image', width: 800, height: 800, canonical_url: null }],
  ]);
  const finalizations = new Map<string, Row>([
    ['fin-img', { owner_id: ME, status: 'finalized', public_url: 'https://cdn.example.com/up.jpg', media_asset_id: 'masset-1' }],
    ['fin-vid', { owner_id: ME, status: 'finalized', public_url: 'https://cdn.example.com/up.mp4', media_asset_id: 'masset-2' }],
    ['fin-other', { owner_id: OTHER, status: 'finalized', public_url: 'https://cdn.example.com/theirs.jpg', media_asset_id: 'masset-other' }],
    ['fin-pending', { owner_id: ME, status: 'pending', public_url: 'https://cdn.example.com/pending.jpg', media_asset_id: null }],
  ]);

  const empty = <T extends QueryResultRow>(): QueryResult<T> =>
    ({ rows: [] as T[], rowCount: 0 }) as QueryResult<T>;
  const of = <T extends QueryResultRow>(rows: Row[]): QueryResult<T> =>
    ({ rows: rows as unknown as T[], rowCount: rows.length }) as QueryResult<T>;

  async function query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    calls.push({ text, params });
    const t = text.trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(t)) return empty<T>();

    // requireBoardCapability — board row + member role join.
    if (/FOR UPDATE OF m/.test(text)) {
      const [boardId, userId] = params as [string, string];
      if (boardId !== board.id || board.deleted_at) return empty<T>();
      return of<T>([{ ...board, role: members.get(userId) ?? null }]);
    }

    // resolveItemSource — verified upload receipt + media asset join.
    if (/FROM upload_finalizations uf/.test(text)) {
      // mediaAssetId re-add path locates the receipt by its asset id;
      // the primary path locates it by finalization id.
      const byAsset = /uf\.media_asset_id = \$1/.test(text);
      const fin = byAsset
        ? [...finalizations.values()].find(
            (f) => f.media_asset_id === String(params?.[0]) && f.status === 'finalized',
          )
        : finalizations.get(String(params?.[0]));
      if (!fin) return empty<T>();
      const asset = fin.media_asset_id ? assets.get(String(fin.media_asset_id)) : undefined;
      return of<T>([{
        owner_id: fin.owner_id,
        status: fin.status,
        public_url: fin.public_url,
        media_asset_id: fin.media_asset_id ?? null,
        media_kind: asset?.media_kind ?? null,
        width: asset?.width ?? null,
        height: asset?.height ?? null,
        canonical_url: asset?.canonical_url ?? null,
      }]);
    }

    // resolveItemSource — look lookup.
    if (/FROM looks/.test(text)) {
      const look = looks.get(String(params?.[0]));
      return look ? of<T>([look]) : empty<T>();
    }

    // resolveItemSource — listing + primary image COALESCE.
    if (/FROM listings l/.test(text)) {
      const listing = listings.get(String(params?.[0]));
      if (!listing) return empty<T>();
      const first = (listingImages.get(String(listing.id)) ?? [])
        .slice()
        .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))[0];
      const sub = first
        ? first.media_type === 'video'
          ? (first.poster_url ?? first.image_url)
          : first.image_url
        : null;
      return of<T>([{
        id: listing.id,
        title: listing.title,
        price_gbp: listing.price_gbp,
        resolved_image_url: listing.image_url ?? sub ?? '',
      }]);
    }

    if (/MAX\(sort_order\)/.test(text)) {
      return of<T>([{ max_sort: maxSort }]);
    }

    if (/INSERT INTO moodboard_items/.test(text)) {
      const p = params as unknown[];
      const row: Row = {
        id: p[0],
        moodboard_id: p[1],
        listing_id: p[2],
        source_type: p[3],
        source_look_id: p[4],
        media_url: p[5],
        poster_url: p[6],
        media_type: p[7],
        media_asset_id: p[8],
        title: p[9],
        price_gbp: p[10],
        caption: p[11],
        aspect_ratio: p[12],
        position_x: p[13],
        position_y: p[14],
        rotation: p[15],
        scale: p[16],
        sort_order: p[17],
        created_at: p[18],
        revision: p[19],
        deleted_at: null,
      };
      items.set(String(row.id), row);
      maxSort = Math.max(maxSort, Number(row.sort_order));
      return of<T>([]);
    }

    // Post-insert item fetch (mapItem source).
    if (/FROM moodboard_items WHERE id = \$1/.test(text)) {
      const row = items.get(String(params?.[0]));
      return row ? of<T>([row]) : empty<T>();
    }

    if (/UPDATE moodboards SET cover_image_url/.test(text)) {
      board.cover_image_url = params?.[0];
      return of<T>([]);
    }

    if (/RETURNING revision/.test(text)) {
      board.revision = Number(board.revision) + 1;
      return of<T>([{ revision: board.revision }]);
    }

    if (/UPDATE moodboards SET updated_at/.test(text)) {
      board.revision = Number(board.revision) + 1;
      return of<T>([]);
    }

    if (/INSERT INTO moodboard_operations/.test(text)) {
      return of<T>([{ id: String(params?.[0]), applied_revision: Number(params?.[4]) }]);
    }

    // Ops path board lock (SELECT id, revision ... FOR UPDATE, no OF m).
    if (/SELECT id, revision FROM moodboards/.test(text)) {
      return board.deleted_at ? empty<T>() : of<T>([{ id: board.id, revision: board.revision }]);
    }

    if (/SELECT role FROM moodboard_members/.test(text)) {
      const role = members.get(String(params?.[1]));
      return role ? of<T>([{ role }]) : empty<T>();
    }

    if (/UPDATE moodboard_operations/.test(text)) {
      return of<T>([]);
    }

    return empty<T>();
  }

  const client = { query, release() {} };
  return {
    calls,
    board,
    query,
    connect: async () => client,
  };
}

async function buildApp() {
  const db = fakeDb();
  const app = Fastify();

  // Mirrors the production preHandler contract: no Authorization → 401,
  // otherwise request.authUser is populated before the handler runs. The
  // `x-test-user` header lets a test act as a different actor.
  app.addHook('preHandler', async (request, reply) => {
    if (!request.headers.authorization) {
      reply.code(401).send({ ok: false, error: 'Unauthorized' });
      return reply;
    }
    const userId = (request.headers['x-test-user'] as string | undefined) ?? ME;
    request.authUser = { userId, role: 'user', sessionId: 's1' } as never;
  });

  registerMoodboardRoutes({
    app,
    db: db as unknown as Pool,
    createApiError: (code: string, message: string, details?: Record<string, unknown>) =>
      Object.assign(new Error(message), { code, details }),
    resolveAuthenticatedUserId: (request) => request.authUser?.userId ?? ME,
    ensureUserExists: async () => {},
  });

  await app.ready();
  return { app, db };
}

// The realtime sequence helper lazily creates a shared Redis client when
// publishRealtimeEvent runs (ops path). `quit()` can hang on a
// never-connected client holding queued commands — `disconnect()`
// force-closes it so the test process can exit.
after(() => {
  try {
    getRedisClient().disconnect();
  } catch {
    // No client was ever created — nothing to close.
  }
});

const insertItemCall = (db: ReturnType<typeof fakeDb>) =>
  db.calls.find((c) => /INSERT INTO moodboard_items/.test(c.text));

// ── REST POST /items ────────────────────────────────────────────────

test('POST /items resolves listing image/title/price server-side', async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/items`,
      headers: auth,
      payload: {
        listingId: 'lst-1',
        // Hostile overrides — server values must win.
        mediaUrl: 'https://evil.example.com/spoof.jpg',
        title: 'Spoofed',
        priceGbp: 999,
      },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body.sourceType, 'listing');
    assert.equal(body.listingId, 'lst-1');
    assert.equal(body.imageUri, 'https://cdn.example.com/jacket.jpg');
    assert.equal(body.title, 'Vintage Denim Jacket');
    assert.equal(body.price, 42.5);
    assert.equal(body.mediaType, 'image');
    assert.equal(body.videoUri, '');

    const ins = insertItemCall(db);
    assert.ok(ins);
    assert.equal(ins!.params![3], 'listing'); // source_type
    assert.equal(ins!.params![5], 'https://cdn.example.com/jacket.jpg'); // media_url
    assert.equal(ins!.params![9], 'Vintage Denim Jacket'); // title
    assert.equal(ins!.params![10], 42.5); // price_gbp
  } finally {
    await app.close();
  }
});

test('POST /items resolves listing video to its poster frame as an image item', async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/items`,
      headers: auth,
      payload: { listingId: 'lst-vid' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body.sourceType, 'listing');
    assert.equal(body.mediaType, 'image');
    assert.equal(body.imageUri, 'https://cdn.example.com/dress-poster.jpg');
    assert.equal(body.videoUri, '');
  } finally {
    await app.close();
  }
});

test('POST /items resolves an own published video look incl. poster', async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/items`,
      headers: auth,
      payload: { lookId: 'look-vid' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body.sourceType, 'look');
    assert.equal(body.sourceLookId, 'look-vid');
    assert.equal(body.mediaType, 'video');
    assert.equal(body.videoUri, 'https://cdn.example.com/look.m3u8');
    assert.equal(body.imageUri, 'https://cdn.example.com/look-poster.jpg');
    assert.equal(body.title, 'Motion Fit');

    const ins = insertItemCall(db);
    assert.equal(ins!.params![3], 'look'); // source_type
    assert.equal(ins!.params![4], 'look-vid'); // source_look_id
    assert.equal(ins!.params![5], 'https://cdn.example.com/look.m3u8'); // media_url
    assert.equal(ins!.params![6], 'https://cdn.example.com/look-poster.jpg'); // poster_url
    assert.equal(ins!.params![7], 'video'); // media_type
  } finally {
    await app.close();
  }
});

test('POST /items rejects another user\'s look with 422 LOOK_SOURCE_INVALID', async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/items`,
      headers: auth,
      payload: { lookId: 'look-other' },
    });
    assert.equal(res.statusCode, 422);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body.ok, false);
    assert.equal(body.code, 'LOOK_SOURCE_INVALID');
  } finally {
    await app.close();
  }
});

test('POST /items rejects a non-published look with 422', async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/items`,
      headers: auth,
      payload: { lookId: 'look-draft' },
    });
    assert.equal(res.statusCode, 422);
    assert.equal((res.json() as Record<string, unknown>).code, 'LOOK_SOURCE_INVALID');
  } finally {
    await app.close();
  }
});

test('POST /items writes media_asset_id and asset-derived media_type/aspect_ratio', async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/items`,
      headers: auth,
      payload: { mediaFinalizationId: 'fin-img', mediaType: 'video' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body.sourceType, 'media');
    assert.equal(body.imageUri, 'https://cdn.example.com/up.jpg');
    // The asset receipt wins over the client's mediaType hint.
    assert.equal(body.mediaType, 'image');
    assert.ok(Math.abs(Number(body.aspectRatio) - 1600 / 900) < 1e-6);

    const ins = insertItemCall(db);
    assert.equal(ins!.params![8], 'masset-1'); // media_asset_id
    assert.ok(Math.abs(Number(ins!.params![12]) - 1600 / 900) < 1e-6); // aspect_ratio
  } finally {
    await app.close();
  }
});

test('POST /items resolves video finalization media_type from the asset', async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/items`,
      headers: auth,
      payload: { mediaFinalizationId: 'fin-vid' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body.mediaType, 'video');
    assert.equal(body.videoUri, 'https://cdn.example.com/up.mp4');
    assert.ok(Math.abs(Number(body.aspectRatio) - 1080 / 1920) < 1e-6);
  } finally {
    await app.close();
  }
});

test('POST /items rejects a finalization owned by another user with 422', async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/items`,
      headers: auth,
      payload: { mediaFinalizationId: 'fin-other' },
    });
    assert.equal(res.statusCode, 422);
    assert.equal((res.json() as Record<string, unknown>).code, 'MEDIA_RECEIPT_MISMATCH');
  } finally {
    await app.close();
  }
});

test('POST /items requires a source key — bare mediaUrl is 400', async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/items`,
      headers: auth,
      payload: { mediaUrl: 'https://unverified.example.com/x.jpg' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal((res.json() as Record<string, unknown>).ok, false);
    assert.equal(insertItemCall(db), undefined);
  } finally {
    await app.close();
  }
});

test('POST /items rejects out-of-range aspectRatio at the schema boundary', async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/items`,
      headers: auth,
      payload: { listingId: 'lst-1', aspectRatio: 10 },
    });
    assert.equal(res.statusCode, 400);
  } finally {
    await app.close();
  }
});

// ── Ops item.add parity ─────────────────────────────────────────────

test('ops item.add resolves a listing through the same server-side path', async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/operations`,
      headers: auth,
      payload: {
        clientOperationId: 'op-listing',
        baseRevision: 0,
        type: 'item.add',
        payload: { listingId: 'lst-1', aspectRatio: 100 },
      },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body.outcome, 'applied');

    const ins = insertItemCall(db);
    assert.ok(ins);
    assert.equal(ins!.params![3], 'listing'); // source_type
    assert.equal(ins!.params![5], 'https://cdn.example.com/jacket.jpg'); // media_url
    assert.equal(ins!.params![9], 'Vintage Denim Jacket'); // title
    assert.equal(ins!.params![10], 42.5); // price_gbp
    // Unvalidated ops payload aspectRatio is clamped to the 0.2–5 band.
    assert.equal(ins!.params![12], 5); // aspect_ratio
  } finally {
    await app.close();
  }
});

test('ops item.add rejects another user\'s look inside the transaction', async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/operations`,
      headers: auth,
      payload: {
        clientOperationId: 'op-look-other',
        baseRevision: 0,
        type: 'item.add',
        payload: { lookId: 'look-other' },
      },
    });
    assert.equal(res.statusCode, 422);
    assert.equal((res.json() as Record<string, unknown>).code, 'LOOK_SOURCE_INVALID');
    assert.equal(insertItemCall(db), undefined);
  } finally {
    await app.close();
  }
});

test('ops item.add rejects unverified mediaUrl-only payloads', async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/operations`,
      headers: auth,
      payload: {
        clientOperationId: 'op-raw-media',
        baseRevision: 0,
        type: 'item.add',
        payload: { mediaUrl: 'https://unverified.example.com/x.jpg' },
      },
    });
    assert.equal(res.statusCode, 400);
    assert.equal((res.json() as Record<string, unknown>).ok, false);
    assert.equal(insertItemCall(db), undefined);
  } finally {
    await app.close();
  }
});

test('ops item.add resolves a verified media finalization with asset lineage', async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/operations`,
      headers: auth,
      payload: {
        clientOperationId: 'op-fin',
        baseRevision: 0,
        type: 'item.add',
        payload: { mediaFinalizationId: 'fin-vid' },
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as Record<string, unknown>).outcome, 'applied');

    const ins = insertItemCall(db);
    assert.equal(ins!.params![3], 'media'); // source_type
    assert.equal(ins!.params![7], 'video'); // media_type
    assert.equal(ins!.params![8], 'masset-2'); // media_asset_id
    assert.ok(Math.abs(Number(ins!.params![12]) - 1080 / 1920) < 1e-6);
  } finally {
    await app.close();
  }
});

// ── mediaAssetId re-add path (keep-my-version / snapshot restore) ────

test('ops item.add resolves mediaAssetId through the same verified receipt', async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/operations`,
      headers: auth,
      payload: {
        clientOperationId: 'op-asset-readd',
        baseRevision: 0,
        type: 'item.add',
        payload: { mediaAssetId: 'masset-1' },
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as Record<string, unknown>).outcome, 'applied');

    const ins = insertItemCall(db);
    assert.ok(ins);
    assert.equal(ins!.params![3], 'media'); // source_type
    assert.equal(ins!.params![5], 'https://cdn.example.com/up.jpg'); // media_url
    assert.equal(ins!.params![8], 'masset-1'); // media_asset_id
    assert.ok(Math.abs(Number(ins!.params![12]) - 1600 / 900) < 1e-6);
  } finally {
    await app.close();
  }
});

test('ops item.add rejects a mediaAssetId owned by another user with 422', async () => {
  const { app, db } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/operations`,
      headers: auth,
      payload: {
        clientOperationId: 'op-asset-other',
        baseRevision: 0,
        type: 'item.add',
        payload: { mediaAssetId: 'masset-other' },
      },
    });
    assert.equal(res.statusCode, 422);
    assert.equal((res.json() as Record<string, unknown>).code, 'MEDIA_RECEIPT_MISMATCH');
    assert.equal(insertItemCall(db), undefined);
  } finally {
    await app.close();
  }
});

test('POST /items emits mediaAssetId on the wire for media items', async () => {
  const { app } = await buildApp();
  try {
    const res = await app.inject({
      method: 'POST',
      url: `/moodboards/${BOARD}/items`,
      headers: auth,
      payload: { mediaFinalizationId: 'fin-img' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as Record<string, unknown>;
    assert.equal(body.mediaAssetId, 'masset-1');
  } finally {
    await app.close();
  }
});
