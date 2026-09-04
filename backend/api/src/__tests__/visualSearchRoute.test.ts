// Visual Search route — integration tests for the upgraded, SSRF-hardened,
// privacy-preserving visual-search endpoint.
//
// These tests exercise the route handler registered by
// `registerVisualSearchRoutes` against a mock Fastify app and mock pg pools.
// They encode the flagship upgrade contract:
//   - SSRF protection via `safeFetchMediaBuffer` (loopback/private IPs blocked)
//   - 5 MB base64 payload cap in `decodeQueryImage`
//   - reduced fan-out: CANDIDATE_CAP = 60, SCORING_CONCURRENCY = 4
//   - telemetry privacy: SHA-256 hash of imageUrl stored, never the raw URL
//   - honest retrieval metadata (similarityMethod / visualMatching / fallbackReason)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Module mocks must be hoisted to the top of the file scope. Vitest hoists
// `vi.mock` calls automatically, but the factory closures may only reference
// `vi` (and identifiers prefixed with `mock`).
vi.mock('../lib/safeRemoteMediaFetch.js', () => ({
  safeFetchMediaBuffer: vi.fn(),
}));

vi.mock('../lib/visualSimilarity.js', () => ({
  extractImageFeatures: vi.fn(),
  extractRemoteImageFeatures: vi.fn(),
  computeSimilarity: vi.fn(),
  mapWithConcurrency: vi.fn(),
}));

// Imported after mocks so the route picks up the mocked dependencies.
import { registerVisualSearchRoutes } from '../routes/visualSearch.js';
import { safeFetchMediaBuffer } from '../lib/safeRemoteMediaFetch.js';
import {
  extractImageFeatures,
  extractRemoteImageFeatures,
  computeSimilarity,
  mapWithConcurrency,
} from '../lib/visualSimilarity.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const LISTING_ROW = {
  id: 'l1',
  seller_id: 's1',
  title: 'Nike Air Max 90',
  description: 'Gently worn trainers, size 10.',
  price_gbp: 45,
  image_url: 'https://cdn.thryftverse.test/img/l1.jpg',
  status: 'active',
  category: 'shoes',
  brand: 'nike',
  size: '10',
  condition: 'good',
  original_price_gbp: 110,
  created_at: '2026-01-01T00:00:00Z',
  seller_username: 'sneakerhead',
};

/** A tiny valid PNG (1x1 transparent) used as a stand-in image buffer. */
const FAKE_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** A non-trivial feature vector returned by the mocked extractor. */
const FAKE_FEATURES = {
  histogram: new Array(64).fill(1 / 64),
  grid: new Array(12).fill(0.5),
  luminance: 0.5,
  contrast: 0.25,
  aspectRatio: 1,
};

// ── Mock Fastify + pg pool helpers ────────────────────────────────────────────

interface CapturedHandler {
  (request: { body: unknown }, reply: MockReply): Promise<unknown>;
}

interface MockReply {
  code: (c: number) => MockReply;
  _sentCode: number;
}

function createMockApp(): {
  app: { post: (path: string, handler: CapturedHandler) => void };
  handler: CapturedHandler;
} {
  let handler: CapturedHandler | undefined;
  const app = {
    // The real route registers with the 3-argument form
    // `app.post(path, options, handler)` so a per-route `config.rateLimit`
    // can be supplied. The mock accepts both the 2- and 3-argument forms and
    // captures the last argument as the handler.
    post: (_path: string, optsOrHandler: unknown, maybeHandler?: CapturedHandler) => {
      handler = maybeHandler ?? (optsOrHandler as CapturedHandler);
    },
  };
  // The register function is synchronous; handler is captured immediately.
  return {
    app: app as unknown as { post: (path: string, handler: CapturedHandler) => void },
    get handler() {
      if (!handler) throw new Error('route handler was not registered');
      return handler;
    },
  };
}

function createMockReply(): MockReply {
  const reply: MockReply = { _sentCode: 200, code: () => reply };
  reply.code = (c: number) => {
    reply._sentCode = c;
    return reply;
  };
  return reply;
}

/** Mock read-replica pool: returns listing rows for listing queries, [] for image queries. */
function createMockReadDb(rows: unknown[] = [LISTING_ROW]) {
  const query = vi.fn(async (text: string, _args?: unknown[]) => {
    if (text.includes('listing_images')) return { rows: [] };
    return { rows };
  });
  return { query };
}

/** Mock primary pool: captures the telemetry INSERT. */
function createMockDb() {
  const query = vi.fn(async () => ({ rows: [] }));
  return { query };
}

async function invokeHandler(
  handler: CapturedHandler,
  body: unknown,
): Promise<{ result: unknown; reply: MockReply }> {
  const reply = createMockReply();
  const result = await handler({ body }, reply);
  return { result, reply };
}

// ── Test setup / teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: image fetch succeeds with a real-ish buffer.
  vi.mocked(safeFetchMediaBuffer).mockResolvedValue({
    buffer: FAKE_PNG_BUFFER,
    contentType: 'image/png',
  });
  vi.mocked(extractImageFeatures).mockResolvedValue(FAKE_FEATURES);
  vi.mocked(extractRemoteImageFeatures).mockResolvedValue(FAKE_FEATURES);
  vi.mocked(computeSimilarity).mockReturnValue(0.87);
  vi.mocked(mapWithConcurrency).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── 1. SSRF protection — imageUrl validation ─────────────────────────────────

describe('SSRF protection — imageUrl validation', () => {
  it('rejects a non-URL imageUrl at the schema layer (zod parse throws)', async () => {
    const { app, handler } = createMockApp();
    registerVisualSearchRoutes({
      app,
      db: createMockDb(),
      readDb: createMockReadDb(),
    } as unknown as Parameters<typeof registerVisualSearchRoutes>[0]);

    await expect(invokeHandler(handler, { imageUrl: 'not-a-url' })).rejects.toThrow();
    // The schema must not have admitted the malformed URL far enough to reach
    // the telemetry INSERT or any candidate query.
    expect(safeFetchMediaBuffer).not.toHaveBeenCalled();
  });

  it('accepts http://127.0.0.1/ at the schema layer but blocks it via safeFetchMediaBuffer (returns null)', async () => {
    const { app, handler } = createMockApp();
    const db = createMockDb();
    registerVisualSearchRoutes({
      app,
      db,
      readDb: createMockReadDb(),
    } as unknown as Parameters<typeof registerVisualSearchRoutes>[0]);

    // SSRF guard returns null for loopback addresses.
    vi.mocked(safeFetchMediaBuffer).mockResolvedValue(null);

    const { result } = await invokeHandler(handler, { imageUrl: 'http://127.0.0.1/' });

    // safeFetchMediaBuffer was invoked with the loopback URL (the route did
    // not bypass it with a raw fetch).
    expect(safeFetchMediaBuffer).toHaveBeenCalledWith(
      'http://127.0.0.1/',
      expect.anything(),
    );
    // Because the image could not be decoded, the route must fall back to
    // filter-only ordering rather than implying visual matching.
    const body = result as { similarityMethod: string; visualMatching: boolean };
    expect(body.similarityMethod).toBe('filter_only');
    expect(body.visualMatching).toBe(false);
  });
});

// ── 2. Base64 size limit ──────────────────────────────────────────────────────

describe('Base64 size limit', () => {
  it('rejects an imageBase64 payload larger than 5MB (decodeQueryImage returns null)', async () => {
    const { app, handler } = createMockApp();
    registerVisualSearchRoutes({
      app,
      db: createMockDb(),
      readDb: createMockReadDb(),
    } as unknown as Parameters<typeof registerVisualSearchRoutes>[0]);

    // 5 MB + 1 byte, base64-encoded. decodeQueryImage must refuse payloads
    // whose decoded size exceeds the 5 MB cap.
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0).toString('base64');

    const { result } = await invokeHandler(handler, { imageBase64: oversized });

    const body = result as {
      similarityMethod: string;
      visualMatching: boolean;
      retrievalMeta: { fallbackReason?: string };
    };
    expect(body.similarityMethod).toBe('filter_only');
    expect(body.visualMatching).toBe(false);
    expect(body.retrievalMeta.fallbackReason).toBe('image_decode_failed');
    // The remote fetch path must not have been triggered when base64 was
    // supplied (and it was rejected before any feature extraction).
    expect(safeFetchMediaBuffer).not.toHaveBeenCalled();
    expect(extractImageFeatures).not.toHaveBeenCalled();
  });
});

// ── 3. Candidate cap reduced ──────────────────────────────────────────────────

describe('Candidate cap reduced (CANDIDATE_CAP = 60)', () => {
  it('caps the candidate LIMIT at 60 even when limit*3 would request more', async () => {
    const { app, handler } = createMockApp();
    const readDb = createMockReadDb();
    registerVisualSearchRoutes({
      app,
      db: createMockDb(),
      readDb,
    } as unknown as Parameters<typeof registerVisualSearchRoutes>[0]);

    // limit=48 => limit*3 = 144. With CANDIDATE_CAP=60 the candidate query
    // LIMIT must be 60, not 144 (and not 150).
    await invokeHandler(handler, { limit: 48 });

    const firstCallArgs = readDb.query.mock.calls[0][1] as unknown[];
    const candidateLimit = firstCallArgs[firstCallArgs.length - 1];
    expect(candidateLimit).toBe(60);
  });
});

// ── 4. Scoring concurrency reduced ────────────────────────────────────────────

describe('Scoring concurrency reduced (SCORING_CONCURRENCY = 4)', () => {
  it('invokes mapWithConcurrency with a concurrency limit of 4 (not 8)', async () => {
    const { app, handler } = createMockApp();
    registerVisualSearchRoutes({
      app,
      db: createMockDb(),
      readDb: createMockReadDb(),
    } as unknown as Parameters<typeof registerVisualSearchRoutes>[0]);

    // Supply a valid image so the image-scoring branch runs.
    await invokeHandler(handler, { imageUrl: 'https://cdn.thryftverse.test/q.jpg' });

    expect(mapWithConcurrency).toHaveBeenCalled();
    const concurrencyArg = vi.mocked(mapWithConcurrency).mock.calls[0][1];
    expect(concurrencyArg).toBe(4);
  });
});

// ── 5. Telemetry privacy — URL hash stored, not raw URL ───────────────────────

describe('Telemetry privacy — URL hash stored, not raw URL', () => {
  it('stores a SHA-256 hash (64 hex chars) of imageUrl, never the raw URL', async () => {
    const { app, handler } = createMockApp();
    const db = createMockDb();
    registerVisualSearchRoutes({
      app,
      db,
      readDb: createMockReadDb(),
    } as unknown as Parameters<typeof registerVisualSearchRoutes>[0]);

    const rawUrl = 'https://cdn.thryftverse.test/secret/private-image.jpg';
    await invokeHandler(handler, { imageUrl: rawUrl });

    // The telemetry INSERT is the first call against the primary db pool.
    const insertCall = db.query.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('INSERT INTO visual_search_requests'),
    );
    expect(insertCall).toBeDefined();
    const insertArgs = (insertCall as unknown as unknown[])?.[1] as unknown[] | undefined;
    // Args: [id, image_url]. The image_url column must hold the hash.
    const storedUrlValue = insertArgs?.[1];
    expect(typeof storedUrlValue).toBe('string');
    expect(storedUrlValue).toMatch(/^[0-9a-f]{64}$/);
    expect(storedUrlValue).not.toBe(rawUrl);
    // And it must be the actual SHA-256 of the raw URL.
    const expectedHash = await sha256Hex(rawUrl);
    expect(storedUrlValue).toBe(expectedHash);
  });
});

// ── 6. Honest retrieval metadata ──────────────────────────────────────────────

describe('Honest retrieval metadata', () => {
  it('reports filter_only / visualMatching=false when no image is supplied', async () => {
    const { app, handler } = createMockApp();
    registerVisualSearchRoutes({
      app,
      db: createMockDb(),
      readDb: createMockReadDb(),
    } as unknown as Parameters<typeof registerVisualSearchRoutes>[0]);

    const { result } = await invokeHandler(handler, { limit: 24 });
    const body = result as {
      similarityMethod: string;
      visualMatching: boolean;
      retrievalMeta: { method: string; fallbackReason?: string };
    };

    expect(body.similarityMethod).toBe('filter_only');
    expect(body.visualMatching).toBe(false);
    expect(body.retrievalMeta.method).toBe('filter_only');
    expect(extractImageFeatures).not.toHaveBeenCalled();
  });

  it('reports filter_only with fallbackReason=image_decode_failed when image decode fails', async () => {
    const { app, handler } = createMockApp();
    registerVisualSearchRoutes({
      app,
      db: createMockDb(),
      readDb: createMockReadDb(),
    } as unknown as Parameters<typeof registerVisualSearchRoutes>[0]);

    // Simulate an image that was supplied but could not be fetched/decoded
    // (SSRF block, network failure, non-image content, etc.).
    vi.mocked(safeFetchMediaBuffer).mockResolvedValue(null);

    const { result } = await invokeHandler(handler, {
      imageUrl: 'https://cdn.thryftverse.test/broken.jpg',
    });
    const body = result as {
      similarityMethod: string;
      visualMatching: boolean;
      retrievalMeta: { method: string; fallbackReason?: string };
    };

    expect(body.similarityMethod).toBe('filter_only');
    expect(body.visualMatching).toBe(false);
    expect(body.retrievalMeta.method).toBe('filter_only');
    expect(body.retrievalMeta.fallbackReason).toBe('image_decode_failed');
    expect(extractImageFeatures).not.toHaveBeenCalled();
  });

  it('reports heuristic_color_features / visualMatching=true when image scoring succeeds', async () => {
    const { app, handler } = createMockApp();
    // Provide a scoreable candidate (with a primary image) so the scoring
    // branch is exercised end-to-end with the mocked feature extractor.
    registerVisualSearchRoutes({
      app,
      db: createMockDb(),
      readDb: createMockReadDb([{ ...LISTING_ROW, image_url: 'https://cdn.test/l1.jpg' }]),
    } as unknown as Parameters<typeof registerVisualSearchRoutes>[0]);

    // mapWithConcurrency returns one scored entry aligned to index 0.
    vi.mocked(mapWithConcurrency).mockResolvedValue([
      { idx: 0, features: FAKE_FEATURES },
    ]);

    const { result } = await invokeHandler(handler, {
      imageUrl: 'https://cdn.thryftverse.test/query.jpg',
    });
    const body = result as {
      similarityMethod: string;
      visualMatching: boolean;
      retrievalMeta: { method: string; fallbackReason?: string };
      items: { similarityScore: number | null }[];
    };

    expect(body.similarityMethod).toBe('heuristic_color_features');
    expect(body.visualMatching).toBe(true);
    expect(body.retrievalMeta.method).toBe('heuristic_color_features');
    expect(body.retrievalMeta.fallbackReason).toBeUndefined();
    expect(body.items[0].similarityScore).toBe(0.87);
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(input).digest('hex');
}
