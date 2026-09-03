import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  classifyHybridError,
  checkEmbedderReadiness,
  invalidateEmbedderReadinessCache,
} from '../lib/vectorSearch.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const VALID_EMBEDDERS_RESPONSE = {
  default: { model: 'text-embedding-3-small', dimensions: 1536 },
};

function mockOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function mockErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
const originalEnvUrl = process.env.MEILISEARCH_URL;
const originalEnvKey = process.env.MEILISEARCH_KEY;
const originalEnvIndex = process.env.MEILISEARCH_INDEX;

describe('vectorSearch integration', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Clean readiness cache so every test starts from a known state.
    invalidateEmbedderReadinessCache();

    // Configure Meilisearch env so getMeiliClient proceeds to the fetch path.
    process.env.MEILISEARCH_URL = 'http://localhost:7700';
    process.env.MEILISEARCH_KEY = 'test-key';
    process.env.MEILISEARCH_INDEX = 'listings';

    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    invalidateEmbedderReadinessCache();

    globalThis.fetch = originalFetch;
    if (originalEnvUrl === undefined) {
      delete process.env.MEILISEARCH_URL;
    } else {
      process.env.MEILISEARCH_URL = originalEnvUrl;
    }
    if (originalEnvKey === undefined) {
      delete process.env.MEILISEARCH_KEY;
    } else {
      process.env.MEILISEARCH_KEY = originalEnvKey;
    }
    if (originalEnvIndex === undefined) {
      delete process.env.MEILISEARCH_INDEX;
    } else {
      process.env.MEILISEARCH_INDEX = originalEnvIndex;
    }
  });

  // ── 1. classifyHybridError — embedder_unconfigured ────────────────────────

  describe('classifyHybridError — embedder_unconfigured cases', () => {
    it('returns embedder_unconfigured for code "invalid_search_embedder"', () => {
      const err = { code: 'invalid_search_embedder', message: 'bad embedder' };
      expect(classifyHybridError(err)).toBe('embedder_unconfigured');
    });

    it('returns embedder_unconfigured for code "embedder_not_found"', () => {
      const err = { code: 'embedder_not_found', message: 'no such embedder' };
      expect(classifyHybridError(err)).toBe('embedder_unconfigured');
    });

    it('returns embedder_unconfigured for code "search_embedder_not_found"', () => {
      const err = { code: 'search_embedder_not_found', message: 'missing embedder' };
      expect(classifyHybridError(err)).toBe('embedder_unconfigured');
    });

    it('returns embedder_unconfigured when message says "embedder default not found"', () => {
      const err = { code: 'unknown_error', message: 'embedder default not found' };
      expect(classifyHybridError(err)).toBe('embedder_unconfigured');
    });

    it('returns embedder_unconfigured when message says "embedder is not configured"', () => {
      const err = new Error('The embedder is not configured for this index');
      expect(classifyHybridError(err)).toBe('embedder_unconfigured');
    });

    it('returns embedder_unconfigured when message says "embedder does not exist"', () => {
      const err = new Error('embedder does not exist');
      expect(classifyHybridError(err)).toBe('embedder_unconfigured');
    });
  });

  // ── 2. classifyHybridError — hybrid_search_failed ─────────────────────────

  describe('classifyHybridError — hybrid_search_failed cases', () => {
    it('returns hybrid_search_failed when message says "hybrid search is not enabled"', () => {
      const err = { code: 'bad_request', message: 'hybrid search is not enabled' };
      expect(classifyHybridError(err)).toBe('hybrid_search_failed');
    });

    it('returns hybrid_search_failed for a generic network error', () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:7700');
      expect(classifyHybridError(err)).toBe('hybrid_search_failed');
    });

    it('returns hybrid_search_failed for a plain string error', () => {
      expect(classifyHybridError('something went wrong')).toBe('hybrid_search_failed');
    });

    it('returns hybrid_search_failed for null', () => {
      expect(classifyHybridError(null)).toBe('hybrid_search_failed');
    });
  });

  // ── 3. classifyHybridError — does NOT misclassify transient errors ────────

  describe('classifyHybridError — does NOT misclassify transient errors', () => {
    it('returns hybrid_search_failed (not embedder_unconfigured) for "embedder response timeout"', () => {
      const err = { code: 'internal_error', message: 'embedder response timeout' };
      const result = classifyHybridError(err);
      expect(result).toBe('hybrid_search_failed');
      expect(result).not.toBe('embedder_unconfigured');
    });

    it('returns hybrid_search_failed (not embedder_unconfigured) for "embedder overloaded"', () => {
      const err = new Error('embedder service overloaded, retry later');
      const result = classifyHybridError(err);
      expect(result).toBe('hybrid_search_failed');
      expect(result).not.toBe('embedder_unconfigured');
    });
  });

  // ── 4. checkEmbedderReadiness — caching behavior ──────────────────────────

  describe('checkEmbedderReadiness — caching behavior', () => {
    it('caches the readiness result so fetch is called only once on repeated calls', async () => {
      fetchSpy.mockResolvedValue(mockOkResponse(VALID_EMBEDDERS_RESPONSE));

      await checkEmbedderReadiness();
      await checkEmbedderReadiness();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after invalidateEmbedderReadinessCache is called', async () => {
      fetchSpy.mockResolvedValue(mockOkResponse(VALID_EMBEDDERS_RESPONSE));

      await checkEmbedderReadiness();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      invalidateEmbedderReadinessCache();

      await checkEmbedderReadiness();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ── 5. checkEmbedderReadiness — no embedders configured ───────────────────

  describe('checkEmbedderReadiness — no embedders configured', () => {
    it('returns ready=false with reason "no_embedders_configured" when embedders object is empty', async () => {
      fetchSpy.mockResolvedValue(mockOkResponse({}));

      const result = await checkEmbedderReadiness();

      expect(result.ready).toBe(false);
      expect(result.reason).toBe('no_embedders_configured');
      expect(result.embedderNames).toEqual([]);
    });
  });

  // ── 6. checkEmbedderReadiness — settings endpoint error ───────────────────

  describe('checkEmbedderReadiness — settings endpoint error', () => {
    it('returns ready=false with a reason starting "settings_endpoint_" on a 404 response', async () => {
      fetchSpy.mockResolvedValue(mockErrorResponse(404));

      const result = await checkEmbedderReadiness();

      expect(result.ready).toBe(false);
      expect(result.reason?.startsWith('settings_endpoint_')).toBe(true);
      expect(result.embedderNames).toEqual([]);
    });
  });

  // ── 7. checkEmbedderReadiness — embedders present ─────────────────────────

  describe('checkEmbedderReadiness — embedders present', () => {
    it('returns ready=true and includes the embedder name when an embedder is configured', async () => {
      fetchSpy.mockResolvedValue(mockOkResponse(VALID_EMBEDDERS_RESPONSE));

      const result = await checkEmbedderReadiness();

      expect(result.ready).toBe(true);
      expect(result.embedderNames).toContain('default');
    });
  });
});
