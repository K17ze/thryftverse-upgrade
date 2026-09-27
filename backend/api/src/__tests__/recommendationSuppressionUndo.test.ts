import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

// S21-03 (backend half) + S5 repair coverage.
//
// S21-03: a `not_interested` interaction suppresses the listing at retrieval;
// the frontend's late-Undo writes an item-scope `usual` intent mutation.
// Before the repair the exclusion was derived from interactions rows
// unconditionally, so undo could never un-hide. The suite drives the real
// GET /recommendations/:userId route against a scripted Pool and asserts the
// item's presence in the served `items` — the output the audit requires
// ("verify recommendation output, not merely local toast or ledger record").
//
// S5: the item-to-item source must stamp the retrieval method the vector
// helper actually used (pgvector_ann / pgvector_exact / bytea_exact_scan),
// never a blanket 'item_to_item_ann'.

vi.mock('../lib/mediaEmbeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/mediaEmbeddings.js')>();
  return {
    ...actual,
    hasMediaEmbeddingVectorColumn: vi.fn(async () => false),
    resolveServingEmbeddingLineage: vi.fn(async () => null),
    nearestMediaEmbeddings: vi.fn(async () => ({
      hits: [],
      method: 'pgvector_ann' as const,
      degraded: false,
    })),
    mapNeighbourAssetsToListings: vi.fn(async () => []),
  };
});

import {
  hasMediaEmbeddingVectorColumn,
  mapNeighbourAssetsToListings,
  nearestMediaEmbeddings,
  resolveServingEmbeddingLineage,
} from '../lib/mediaEmbeddings.js';
import {
  itemToItemSourceLabel,
  registerRecommendationRoutes,
} from '../routes/recommendations.js';
import { registerRecommendationIntentRoutes } from '../routes/recommendationIntent.js';

type ListingRow = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  price_gbp: string;
  original_price_gbp: string | null;
  image_url: string | null;
  status: string;
  created_at: string;
  media_width: number | null;
  media_height: number | null;
  interaction_count: string;
  seller_rating: string | null;
  seller_response_hours: string | null;
  seller_reach_state: string;
};

type InteractionRow = {
  listing_id: string;
  action: string;
  strength: string;
  created_at: string;
  title: string;
  description: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  price_gbp: string;
};

type MutationRow = {
  scope: string;
  target_id: string;
  target_label: string;
  direction: string;
  created_at: string;
};

type HarnessState = {
  listings: ListingRow[];
  interactions: InteractionRow[];
  mutations: MutationRow[];
  anchors: { embedding: Buffer; dimensions: number }[];
  i2iListings: ListingRow[];
  impressionInserts: unknown[][];
};

function listing(id: string, overrides: Partial<ListingRow> = {}): ListingRow {
  return {
    id,
    seller_id: `seller_${id}`,
    title: `Listing ${id}`,
    description: 'A sufficiently long description for quality scoring purposes.',
    category: 'shoes',
    subcategory: null,
    brand: 'brandx',
    size: 'M',
    condition: 'good',
    price_gbp: '42.00',
    original_price_gbp: null,
    image_url: `https://img.example/${id}.jpg`,
    status: 'active',
    created_at: '2026-09-01T00:00:00.000Z',
    media_width: 800,
    media_height: 1000,
    interaction_count: '5',
    seller_rating: null,
    seller_response_hours: null,
    seller_reach_state: 'normal',
    ...overrides,
  };
}

function hideInteraction(listingId: string, createdAt: string): InteractionRow {
  return {
    listing_id: listingId,
    action: 'not_interested',
    strength: '1',
    created_at: createdAt,
    title: 'hidden',
    description: 'hidden listing description',
    category: 'shoes',
    brand: 'brandx',
    size: 'M',
    condition: 'good',
    price_gbp: '42.00',
  };
}

function itemMutation(
  listingId: string,
  direction: string,
  createdAt: string,
): MutationRow {
  return {
    scope: 'item',
    target_id: listingId,
    target_label: `Listing ${listingId}`,
    direction,
    created_at: createdAt,
  };
}

function makeState(overrides: Partial<HarnessState> = {}): HarnessState {
  return {
    listings: [],
    interactions: [],
    mutations: [],
    anchors: [],
    i2iListings: [],
    impressionInserts: [],
    ...overrides,
  };
}

function resultOf(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

function makeDb(state: HarnessState) {
  const query = vi.fn(async (text: string, params?: unknown[]) => {
    if (text.includes('FROM user_intent_versions')) return resultOf([]);
    if (text.includes('user_intent_mutations')) return resultOf(state.mutations);
    if (text.includes('recommendation_topic_projection')) return resultOf([]);
    if (text.includes('FROM interactions i')) return resultOf(state.interactions);
    if (text.includes('FROM media_bindings')) return resultOf(state.anchors);
    if (text.includes('FROM listings l')) {
      // Distinguish the candidateListingsSql call sites by their predicate /
      // ORDER BY fragment.
      if (text.includes('array_position')) return resultOf(state.i2iListings);
      if (text.includes('LOWER(l.category)')) return resultOf([]);
      if (text.includes('user_follows')) return resultOf([]);
      if (text.includes('ORDER BY COALESCE')) return resultOf([]);
      return resultOf(state.listings);
    }
    return resultOf([]);
  });
  const client = {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      if (text.includes('INSERT INTO recommendation_impressions')) {
        state.impressionInserts.push(params ?? []);
      }
      return resultOf([]);
    }),
    release: vi.fn(),
  };
  return {
    query,
    connect: vi.fn(async () => client),
    client,
  };
}

function makeRedis(): Redis {
  const multi = () => {
    const chain: Record<string, unknown> = {};
    for (const name of ['lpush', 'ltrim', 'incr', 'set', 'del', 'expire']) {
      chain[name] = vi.fn(() => chain);
    }
    chain.exec = vi.fn(async () => []);
    return chain;
  };
  return {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    multi: vi.fn(multi),
  } as unknown as Redis;
}

async function buildApp(state: HarnessState): Promise<FastifyInstance> {
  const app = Fastify();
  const db = makeDb(state);
  registerRecommendationRoutes({
    app,
    db: db as unknown as Pool,
    redis: makeRedis(),
    decisionServiceUrl: 'http://decision.invalid',
    decisionServiceTimeoutMs: 50,
    decisionServiceToken: 'test-decision-token',
    resolveAuthenticatedUserId: (
      _request: FastifyRequest,
      requested?: string,
    ) => requested ?? 'user_1',
  });
  await app.ready();
  return app;
}

async function serve(app: FastifyInstance) {
  const response = await app.inject({
    method: 'GET',
    url: '/recommendations/user_1',
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    items: { listing: { id: string } & Record<string, unknown> }[];
    decision: { diagnostics: Record<string, unknown> };
  };
}

/** 512-dim little-endian float32 anchor payload (first element non-zero). */
function anchorEmbedding(): Buffer {
  const buffer = Buffer.alloc(512 * 4);
  buffer.writeFloatLE(1, 0);
  return buffer;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasMediaEmbeddingVectorColumn).mockResolvedValue(false);
  vi.mocked(resolveServingEmbeddingLineage).mockResolvedValue(null);
  vi.mocked(nearestMediaEmbeddings).mockResolvedValue({
    hits: [],
    method: 'pgvector_ann',
    degraded: false,
  });
  vi.mocked(mapNeighbourAssetsToListings).mockResolvedValue([]);
  // Force the deterministic fallback decision path — the suite asserts on
  // the candidate pool the API computed, not on a decision-service double.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('decision service unavailable in test');
    }),
  );
});

describe('S21-03 — not_interested suppression is reversible', () => {
  it('hides a listing after a not_interested interaction', async () => {
    const state = makeState({
      listings: [listing('hidden_1'), listing('other_1')],
      interactions: [hideInteraction('hidden_1', '2026-09-20T10:00:00.000Z')],
    });
    const body = await serve(await buildApp(state));
    expect(body.items.map((item) => item.listing.id)).not.toContain('hidden_1');
    expect(body.items.map((item) => item.listing.id)).toContain('other_1');
    expect(body.decision.diagnostics.user_control_suppressed).toBe(1);
  });

  it('un-hides on the next retrieval after an item-scope usual mutation', async () => {
    const state = makeState({
      listings: [listing('hidden_1'), listing('other_1')],
      interactions: [hideInteraction('hidden_1', '2026-09-20T10:00:00.000Z')],
      mutations: [itemMutation('hidden_1', 'usual', '2026-09-20T10:04:00.000Z')],
    });
    const body = await serve(await buildApp(state));
    expect(body.items.map((item) => item.listing.id)).toContain('hidden_1');
  });

  it('keeps the item hidden when the hide is newer than the undo', async () => {
    // undo at T1, then a fresh not_interested at T2 (e.g. the user hid it
    // again, and the companion exclude mutation failed to persist).
    const state = makeState({
      listings: [listing('hidden_1')],
      interactions: [hideInteraction('hidden_1', '2026-09-20T10:06:00.000Z')],
      mutations: [itemMutation('hidden_1', 'usual', '2026-09-20T10:04:00.000Z')],
    });
    const body = await serve(await buildApp(state));
    expect(body.items.map((item) => item.listing.id)).not.toContain('hidden_1');
  });

  it('handles hide → undo → hide → undo by latest event', async () => {
    const state = makeState({
      listings: [listing('flip_1')],
      interactions: [
        hideInteraction('flip_1', '2026-09-20T10:02:00.000Z'),
        hideInteraction('flip_1', '2026-09-20T10:00:00.000Z'),
      ],
      mutations: [itemMutation('flip_1', 'usual', '2026-09-20T10:03:00.000Z')],
    });
    const body = await serve(await buildApp(state));
    expect(body.items.map((item) => item.listing.id)).toContain('flip_1');
  });

  it('keeps the item hidden when a hide follows the undo (hide → undo → hide)', async () => {
    const state = makeState({
      listings: [listing('flip_2')],
      interactions: [
        hideInteraction('flip_2', '2026-09-20T10:04:00.000Z'),
        hideInteraction('flip_2', '2026-09-20T10:00:00.000Z'),
      ],
      mutations: [itemMutation('flip_2', 'usual', '2026-09-20T10:02:00.000Z')],
    });
    const body = await serve(await buildApp(state));
    expect(body.items.map((item) => item.listing.id)).not.toContain('flip_2');
  });

  it('lets the reversal win when hide and undo share a timestamp', async () => {
    // Tie → the reversal wins: the in-flight hide write carries an
    // earlier-or-equal transaction-start clock than the committed undo.
    const state = makeState({
      listings: [listing('tie_1')],
      interactions: [hideInteraction('tie_1', '2026-09-20T10:00:00.000Z')],
      mutations: [itemMutation('tie_1', 'usual', '2026-09-20T10:00:00.000Z')],
    });
    const body = await serve(await buildApp(state));
    expect(body.items.map((item) => item.listing.id)).toContain('tie_1');
  });

  it('does not let an unrelated item mutation lift the hide', async () => {
    const state = makeState({
      listings: [listing('hidden_1'), listing('other_1')],
      interactions: [hideInteraction('hidden_1', '2026-09-20T10:00:00.000Z')],
      mutations: [itemMutation('other_1', 'usual', '2026-09-20T10:05:00.000Z')],
    });
    const body = await serve(await buildApp(state));
    expect(body.items.map((item) => item.listing.id)).not.toContain('hidden_1');
  });

  it('an exclude mutation newer than the hide keeps the item hidden', async () => {
    const state = makeState({
      listings: [listing('hidden_1')],
      interactions: [hideInteraction('hidden_1', '2026-09-20T10:00:00.000Z')],
      mutations: [itemMutation('hidden_1', 'exclude', '2026-09-20T10:05:00.000Z')],
    });
    const body = await serve(await buildApp(state));
    expect(body.items.map((item) => item.listing.id)).not.toContain('hidden_1');
  });

  it('a less/more directive never lifts a hide', async () => {
    const state = makeState({
      listings: [listing('hidden_1')],
      interactions: [hideInteraction('hidden_1', '2026-09-20T10:00:00.000Z')],
      mutations: [itemMutation('hidden_1', 'less', '2026-09-20T10:05:00.000Z')],
    });
    const body = await serve(await buildApp(state));
    expect(body.items.map((item) => item.listing.id)).not.toContain('hidden_1');
  });

  it('an add mutation restores the item like usual does', async () => {
    const state = makeState({
      listings: [listing('hidden_1')],
      interactions: [hideInteraction('hidden_1', '2026-09-20T10:00:00.000Z')],
      mutations: [itemMutation('hidden_1', 'add', '2026-09-20T10:05:00.000Z')],
    });
    const body = await serve(await buildApp(state));
    expect(body.items.map((item) => item.listing.id)).toContain('hidden_1');
  });

  it('report_content suppression is never retracted by an item mutation', async () => {
    const state = makeState({
      listings: [listing('reported_1')],
      interactions: [
        { ...hideInteraction('reported_1', '2026-09-20T10:00:00.000Z'), action: 'report_content' },
      ],
      mutations: [itemMutation('reported_1', 'usual', '2026-09-20T10:05:00.000Z')],
    });
    const body = await serve(await buildApp(state));
    expect(body.items.map((item) => item.listing.id)).not.toContain('reported_1');
  });
});

describe('wire contract — items[].listing is serialized to the camelCase API shape', () => {
  // The client maps every served listing through mapBackendListingToListing,
  // which reads camelCase keys only. A raw snake_case ListingRow used to be
  // returned verbatim: priceGbp/sellerId/createdAt mapped to null and
  // isDisplayReadyListing dropped every For-You item, so these assertions
  // pin both halves of the contract — camelCase present, snake_case absent.
  it('serves camelCase listing fields and no raw row keys', async () => {
    const state = makeState({ listings: [listing('wire_1')] });
    const body = await serve(await buildApp(state));
    const served = body.items.find((item) => item.listing.id === 'wire_1');
    expect(served).toBeDefined();
    const servedListing = served!.listing;

    expect(servedListing.sellerId).toBe('seller_wire_1');
    expect(servedListing.priceGbp).toBe(42);
    expect(servedListing.imageUrl).toBe('https://img.example/wire_1.jpg');
    expect(servedListing.createdAt).toBe('2026-09-01T00:00:00.000Z');
    expect(servedListing.status).toBe('active');
    expect(servedListing.seller).toEqual({
      id: 'seller_wire_1',
      rating: null,
      responseHours: null,
    });

    // Raw ListingRow keys must not leak onto the wire.
    expect(servedListing).not.toHaveProperty('image_url');
    expect(servedListing).not.toHaveProperty('price_gbp');
    expect(servedListing).not.toHaveProperty('seller_id');
    expect(servedListing).not.toHaveProperty('created_at');
  });

  it('projects primary-image geometry for the masonry grid', async () => {
    const state = makeState({ listings: [listing('wire_2')] });
    const body = await serve(await buildApp(state));
    const served = body.items.find((item) => item.listing.id === 'wire_2');
    expect(served).toBeDefined();
    expect(served!.listing.mediaWidth).toBe(800);
    expect(served!.listing.mediaHeight).toBe(1000);
    expect(served!.listing.mediaAspectRatio).toBe(0.8);
  });

  it('omits mediaAspectRatio when image geometry is unknown', async () => {
    const state = makeState({
      listings: [listing('wire_3', { media_width: null, media_height: null })],
    });
    const body = await serve(await buildApp(state));
    const served = body.items.find((item) => item.listing.id === 'wire_3');
    expect(served).toBeDefined();
    expect(served!.listing.mediaWidth).toBeNull();
    expect(served!.listing.mediaAspectRatio).toBeNull();
  });
});

describe('S21-03 — mutate route retracts committed hides atomically', () => {
  async function runMutation(direction: string) {
    const app = Fastify();
    const calls: { text: string; params: unknown[] | undefined }[] = [];
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes('FROM user_intent_versions')) {
          return resultOf([{ intent_version: '3' }]);
        }
        if (text.includes('INSERT INTO user_intent_mutations')) {
          return resultOf([{ mutation_id: '42' }]);
        }
        return resultOf([]);
      }),
      release: vi.fn(),
    };
    const db = {
      query: vi.fn(async () => resultOf([])),
      connect: vi.fn(async () => client),
    };
    registerRecommendationIntentRoutes({
      app,
      db: db as unknown as Pool,
      redis: makeRedis(),
      resolveAuthenticatedUserId: (_r: FastifyRequest, requested?: string) =>
        requested ?? 'user_1',
    });
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/recommendations/intent/user_1/mutate',
      payload: {
        idempotencyKey: `undo-${direction}-1`,
        scope: 'item',
        targetId: 'hidden_1',
        targetLabel: 'Listing hidden_1',
        direction,
        source: 'feed_action',
      },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
    return calls;
  }

  it.each(['usual', 'add'])(
    'item-scope %s deletes committed not_interested rows inside the mutation transaction',
    async (direction) => {
      const calls = await runMutation(direction);
      const deleteCall = calls.find((call) =>
        call.text.includes('DELETE FROM interactions'),
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall!.text).toContain("action = 'not_interested'");
      expect(deleteCall!.text).not.toContain('report_content');
      expect(deleteCall!.params).toEqual(['user_1', 'hidden_1']);
      // Ordering: BEGIN → … → INSERT mutation → DELETE hides → COMMIT.
      const insertIdx = calls.findIndex((c) =>
        c.text.includes('INSERT INTO user_intent_mutations'),
      );
      const deleteIdx = calls.findIndex((c) =>
        c.text.includes('DELETE FROM interactions'),
      );
      const commitIdx = calls.findIndex((c) => c.text.trim() === 'COMMIT');
      expect(insertIdx).toBeGreaterThan(-1);
      expect(deleteIdx).toBeGreaterThan(insertIdx);
      expect(commitIdx).toBeGreaterThan(deleteIdx);
    },
  );

  it.each(['exclude', 'less', 'more', 'remove'])(
    'item-scope %s does not retract interaction rows',
    async (direction) => {
      const calls = await runMutation(direction);
      expect(
        calls.find((call) => call.text.includes('DELETE FROM interactions')),
      ).toBeUndefined();
    },
  );
});

describe('S5 — item-to-item lineage reports the actual retrieval method', () => {
  it('maps helper methods to honest source labels', () => {
    expect(itemToItemSourceLabel(['pgvector_ann'])).toBe('item_to_item_ann');
    expect(itemToItemSourceLabel(['pgvector_exact'])).toBe('item_to_item_exact');
    expect(itemToItemSourceLabel(['bytea_exact_scan'])).toBe('item_to_item_fallback');
    // Mixed anchor fan-out reports the weakest method that actually ran.
    expect(
      itemToItemSourceLabel(['pgvector_ann', 'pgvector_exact']),
    ).toBe('item_to_item_exact');
    expect(
      itemToItemSourceLabel(['pgvector_ann', 'bytea_exact_scan']),
    ).toBe('item_to_item_fallback');
  });

  async function serveWithMethod(method: 'pgvector_ann' | 'pgvector_exact' | 'bytea_exact_scan') {
    vi.mocked(hasMediaEmbeddingVectorColumn).mockResolvedValue(true);
    vi.mocked(resolveServingEmbeddingLineage).mockResolvedValue({
      modelId: 'model_a',
      modelVersion: 'v1',
      preprocessingVersion: 'p1',
      dimensions: 512,
    });
    vi.mocked(nearestMediaEmbeddings).mockResolvedValue({
      hits: [
        {
          mediaAssetId: 'asset_1',
          modelId: 'model_a',
          modelVersion: 'v1',
          preprocessingVersion: 'p1',
          checksumSha256: 'abc',
          similarity: 0.9,
          distance: 0.1,
        },
      ],
      method,
      degraded: method !== 'pgvector_ann',
      ...(method === 'bytea_exact_scan' ? { degradedReason: 'dimension_mismatch' as const } : {}),
    });
    vi.mocked(mapNeighbourAssetsToListings).mockResolvedValue([
      { listingId: 'i2i_1', distance: 0.1 },
    ]);
    const state = makeState({
      listings: [listing('base_1')],
      interactions: [
        {
          ...hideInteraction('anchor_1', '2026-09-20T10:00:00.000Z'),
          action: 'save',
        },
      ],
      anchors: [{ embedding: anchorEmbedding(), dimensions: 512 }],
      i2iListings: [listing('i2i_1')],
    });
    const body = await serve(await buildApp(state));
    return { body, state };
  }

  it('pgvector_ann serves as item_to_item_ann', async () => {
    const { body, state } = await serveWithMethod('pgvector_ann');
    const sources = body.decision.diagnostics.retrieval_sources as Record<string, number>;
    expect(sources.item_to_item_ann).toBe(1);
    expect(sources.item_to_item_exact).toBeUndefined();
    expect(sources.item_to_item_fallback).toBeUndefined();
    // The impression row must stamp the same honest source.
    expect(state.impressionInserts.length).toBeGreaterThan(0);
    const i2iImpression = state.impressionInserts.find((params) => params[2] === 'i2i_1');
    expect(i2iImpression).toBeDefined();
    expect(i2iImpression![9]).toBe('item_to_item_ann');
  });

  it('an unindexed exact scan is reported as item_to_item_exact, never ANN', async () => {
    const { body, state } = await serveWithMethod('pgvector_exact');
    const sources = body.decision.diagnostics.retrieval_sources as Record<string, number>;
    expect(sources.item_to_item_exact).toBe(1);
    expect(sources.item_to_item_ann).toBeUndefined();
    const i2iImpression = state.impressionInserts.find((params) => params[2] === 'i2i_1');
    expect(i2iImpression![9]).toBe('item_to_item_exact');
    const i2iDiag = body.decision.diagnostics.item_to_item_retrieval as {
      methods: string[];
      source_label: string;
    };
    expect(i2iDiag.methods).toEqual(['pgvector_exact']);
    expect(i2iDiag.source_label).toBe('item_to_item_exact');
  });

  it('the bounded BYTEA scan is reported as item_to_item_fallback, never ANN', async () => {
    const { body, state } = await serveWithMethod('bytea_exact_scan');
    const sources = body.decision.diagnostics.retrieval_sources as Record<string, number>;
    expect(sources.item_to_item_fallback).toBe(1);
    expect(sources.item_to_item_ann).toBeUndefined();
    const i2iImpression = state.impressionInserts.find((params) => params[2] === 'i2i_1');
    expect(i2iImpression![9]).toBe('item_to_item_fallback');
    const i2iDiag = body.decision.diagnostics.item_to_item_retrieval as {
      methods: string[];
      degraded_reasons?: string[];
    };
    expect(i2iDiag.methods).toEqual(['bytea_exact_scan']);
    expect(i2iDiag.degraded_reasons).toEqual(['dimension_mismatch']);
  });
});
