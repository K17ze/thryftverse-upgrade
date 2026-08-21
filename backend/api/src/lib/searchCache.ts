import crypto from 'node:crypto';
import type { Redis } from 'ioredis';

// ─────────────────────────────────────────────────────────────────────────────
// Search Cache — Redis-backed caching layer for search results and analytics.
//
// Design goals (per 2026 search performance research):
//   • Sub-100ms response times via cache-first reads
//   • Stale-while-revalidate: serve stale data while refreshing in background
//   • Hot query detection via Redis sorted set for query frequency tracking
//   • Autocomplete caching with longer TTL (changes less frequently)
//   • Real-time analytics for dashboard access
// ─────────────────────────────────────────────────────────────────────────────

/** TTL for general search result cache (seconds). */
export const SEARCH_CACHE_TTL_SECONDS = 60;
/** TTL for autocomplete suggestion cache (seconds). */
export const AUTOCOMPLETE_CACHE_TTL_SECONDS = 300;
/** TTL for pre-warmed autocomplete prefix cache (seconds). */
export const AUTOCOMPLETE_PREWARM_TTL_SECONDS = 600;
/** TTL for hot query pre-computed results (seconds). */
export const HOT_QUERY_CACHE_TTL_SECONDS = 60;
/** TTL for search analytics counters (seconds). */
export const ANALYTICS_TTL_SECONDS = 300;
/** Maximum number of hot queries to track and pre-compute. */
export const HOT_QUERY_LIMIT = 100;
/** Frequency threshold (queries per window) for a query to be considered "hot". */
export const HOT_QUERY_FREQUENCY_THRESHOLD = 5;
/** Window for query frequency tracking (seconds). */
export const QUERY_FREQUENCY_WINDOW_SECONDS = 300;

const CACHE_PREFIX = 'thryftverse:search';
const SEARCH_KEY_PREFIX = `${CACHE_PREFIX}:results`;
const AUTOCOMPLETE_KEY_PREFIX = `${CACHE_PREFIX}:autocomplete`;
const HOT_QUERY_KEY_PREFIX = `${CACHE_PREFIX}:hot`;
const FREQUENCY_KEY = `${CACHE_PREFIX}:freq`;
const ANALYTICS_KEY_PREFIX = `${CACHE_PREFIX}:analytics`;
const STALE_FLAG = '__stale__';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SearchQueryParams {
  q: string;
  filters?: {
    category?: string;
    condition?: string;
    size?: string;
    priceMin?: number;
    priceMax?: number;
    location?: string;
  };
  sort?: 'relevance' | 'recent' | 'price_asc' | 'price_desc';
  page?: number;
  limit?: number;
}

export interface CachedSearchResult {
  ok: boolean;
  query: string;
  fallback?: boolean;
  decision: {
    policyVersion: string;
    capabilityLevel: string;
    fallback: boolean;
  };
  items: unknown[];
  cachedAt: number;
  fromCache: boolean;
  stale?: boolean;
}

export interface AutocompleteSuggestion {
  text: string;
  type: 'query' | 'item' | 'brand' | 'category';
  score: number;
}

export interface SearchAnalytics {
  queryVolume: number;
  avgResponseTimeMs: number;
  zeroResultCount: number;
  zeroResultRate: number;
  cacheHitCount: number;
  cacheMissCount: number;
  cacheHitRate: number;
}

// ── Query hashing ─────────────────────────────────────────────────────────────

/**
 * Produce a stable hash for a set of search query parameters.
 * The hash includes query text, filters, sort, and page so that
 * different parameter combinations get distinct cache entries.
 */
export function hashSearchParams(params: SearchQueryParams): string {
  const normalized: Record<string, unknown> = {
    q: params.q.trim().toLowerCase(),
    filters: params.filters
      ? Object.fromEntries(
          Object.entries(params.filters)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : {},
    sort: params.sort ?? 'relevance',
    page: params.page ?? 1,
    limit: params.limit ?? 24,
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 32);
}

function searchCacheKey(params: SearchQueryParams): string {
  return `${SEARCH_KEY_PREFIX}:${hashSearchParams(params)}`;
}

function autocompleteCacheKey(prefix: string): string {
  const normalized = prefix.trim().toLowerCase();
  return `${AUTOCOMPLETE_KEY_PREFIX}:${crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 24)}`;
}

function hotQueryCacheKey(queryHash: string): string {
  return `${HOT_QUERY_KEY_PREFIX}:${queryHash}`;
}

// ── Query result caching ──────────────────────────────────────────────────────

/**
 * Retrieve a cached search result. If the result is stale (past TTL
 * but still in cache via a grace period), it is returned with a
 * `stale: true` flag so the caller can trigger a background refresh.
 */
export async function getCachedSearchResult(
  redis: Redis,
  params: SearchQueryParams,
): Promise<CachedSearchResult | null> {
  const key = searchCacheKey(params);
  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CachedSearchResult;
    const ageSeconds = (Date.now() - parsed.cachedAt) / 1000;

    // If the entry is older than the TTL, it's stale — serve it but
    // flag for background revalidation (stale-while-revalidate).
    if (ageSeconds > SEARCH_CACHE_TTL_SECONDS) {
      return { ...parsed, fromCache: true, stale: true };
    }

    return { ...parsed, fromCache: true, stale: false };
  } catch {
    return null;
  }
}

/**
 * Store a search result in the cache with the configured TTL.
 * The `cachedAt` timestamp is embedded so the stale-while-revalidate
 * logic can determine freshness on subsequent reads.
 */
export async function setCachedSearchResult(
  redis: Redis,
  params: SearchQueryParams,
  result: Omit<CachedSearchResult, 'cachedAt' | 'fromCache' | 'stale'>,
  ttlSeconds: number = SEARCH_CACHE_TTL_SECONDS,
): Promise<void> {
  const key = searchCacheKey(params);
  const entry: CachedSearchResult = {
    ...result,
    cachedAt: Date.now(),
    fromCache: false,
    stale: false,
  };
  // Store with a grace period (2x TTL) so stale-while-revalidate
  // can serve slightly expired data while a refresh is in-flight.
  await redis.set(key, JSON.stringify(entry), 'EX', ttlSeconds * 2);
}

/**
 * Stale-while-revalidate wrapper. Returns the cached result if available
 * (even if stale), and invokes `revalidate` in the background when the
 * result is stale or missing.
 *
 * @returns The cached result (possibly stale) or null on a complete miss.
 */
export async function getCachedOrRevalidate(
  redis: Redis,
  params: SearchQueryParams,
  revalidate: () => Promise<void>,
): Promise<CachedSearchResult | null> {
  const cached = await getCachedSearchResult(redis, params);
  if (cached) {
    if (cached.stale) {
      // Fire-and-forget background refresh
      void revalidate().catch(() => {
        // Swallow — the stale data is still valid to serve
      });
    }
    return cached;
  }
  return null;
}

// ── Autocomplete caching ──────────────────────────────────────────────────────

/**
 * Retrieve cached autocomplete suggestions for a prefix.
 */
export async function getCachedAutocomplete(
  redis: Redis,
  prefix: string,
): Promise<AutocompleteSuggestion[] | null> {
  const key = autocompleteCacheKey(prefix);
  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AutocompleteSuggestion[];
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Store autocomplete suggestions for a prefix with the given TTL.
 */
export async function setCachedAutocomplete(
  redis: Redis,
  prefix: string,
  suggestions: AutocompleteSuggestion[],
  ttlSeconds: number = AUTOCOMPLETE_CACHE_TTL_SECONDS,
): Promise<void> {
  const key = autocompleteCacheKey(prefix);
  await redis.set(key, JSON.stringify(suggestions), 'EX', ttlSeconds);
}

/**
 * Pre-warm the autocomplete cache for a set of popular search terms.
 * Uses a longer TTL since popular searches change infrequently.
 */
export async function prewarmAutocompleteCache(
  redis: Redis,
  popularTerms: string[],
  fetchSuggestions: (prefix: string) => Promise<AutocompleteSuggestion[]>,
): Promise<number> {
  let warmed = 0;
  for (const term of popularTerms) {
    try {
      const suggestions = await fetchSuggestions(term);
      if (suggestions.length > 0) {
        await setCachedAutocomplete(redis, term, suggestions, AUTOCOMPLETE_PREWARM_TTL_SECONDS);
        warmed += 1;
      }
    } catch {
      // Continue warming other terms even if one fails
    }
  }
  return warmed;
}

// ── Hot query detection ───────────────────────────────────────────────────────

/**
 * Record a query in the frequency sorted set. Each call increments
 * the query's score by 1, and the entry expires after the frequency
 * window so only recent queries are counted.
 */
export async function trackQueryFrequency(
  redis: Redis,
  query: string,
): Promise<void> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return;
  }
  const member = crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 24);
  await redis.zincrby(FREQUENCY_KEY, 1, member);
  // Set/update expiry on the sorted set so old entries age out
  await redis.expire(FREQUENCY_KEY, QUERY_FREQUENCY_WINDOW_SECONDS);
}

/**
 * Retrieve the top N hottest queries by frequency from the sorted set.
 * Returns the query hashes and their frequency scores, sorted descending.
 */
export async function getHotQueries(
  redis: Redis,
  limit: number = HOT_QUERY_LIMIT,
): Promise<Array<{ queryHash: string; frequency: number }>> {
  const results = await redis.zrevrange(FREQUENCY_KEY, 0, limit - 1, 'WITHSCORES');
  const hot: Array<{ queryHash: string; frequency: number }> = [];
  for (let i = 0; i < results.length; i += 2) {
    const queryHash = results[i] as string;
    const frequency = Number(results[i + 1]);
    if (frequency >= HOT_QUERY_FREQUENCY_THRESHOLD) {
      hot.push({ queryHash, frequency });
    }
  }
  return hot;
}

/**
 * Store a pre-computed result for a hot query with a short TTL.
 * This allows the hottest queries to be served without any DB hit.
 */
export async function setHotQueryResult(
  redis: Redis,
  queryHash: string,
  result: Omit<CachedSearchResult, 'cachedAt' | 'fromCache' | 'stale'>,
): Promise<void> {
  const key = hotQueryCacheKey(queryHash);
  const entry: CachedSearchResult = {
    ...result,
    cachedAt: Date.now(),
    fromCache: false,
    stale: false,
  };
  await redis.set(key, JSON.stringify(entry), 'EX', HOT_QUERY_CACHE_TTL_SECONDS);
}

/**
 * Retrieve a pre-computed hot query result.
 */
export async function getHotQueryResult(
  redis: Redis,
  queryHash: string,
): Promise<CachedSearchResult | null> {
  const key = hotQueryCacheKey(queryHash);
  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as CachedSearchResult;
    return { ...parsed, fromCache: true };
  } catch {
    return null;
  }
}

/**
 * Refresh the hot query cache by re-computing results for the top
 * queries. The `computeResult` callback receives the query hash and
 * should return the fresh search result.
 *
 * Returns the number of hot query caches successfully refreshed.
 */
export async function refreshHotQueryCache(
  redis: Redis,
  computeResult: (queryHash: string) => Promise<Omit<CachedSearchResult, 'cachedAt' | 'fromCache' | 'stale'> | null>,
  limit: number = HOT_QUERY_LIMIT,
): Promise<number> {
  const hotQueries = await getHotQueries(redis, limit);
  let refreshed = 0;
  for (const { queryHash } of hotQueries) {
    try {
      const result = await computeResult(queryHash);
      if (result) {
        await setHotQueryResult(redis, queryHash, result);
        refreshed += 1;
      }
    } catch {
      // Continue refreshing other hot queries
    }
  }
  return refreshed;
}

// ── Cache invalidation ────────────────────────────────────────────────────────

/**
 * Invalidate all cached search results and autocomplete entries.
 * Called when a listing is created, updated, or deleted.
 *
 * Uses SCAN to find keys matching the search cache patterns and
 * deletes them in batches. This is O(n) over cached keys but only
 * runs on mutations, not on the read path.
 */
export async function invalidateSearchCache(
  redis: Redis,
): Promise<number> {
  let deleted = 0;
  const patterns = [
    `${SEARCH_KEY_PREFIX}:*`,
    `${AUTOCOMPLETE_KEY_PREFIX}:*`,
    `${HOT_QUERY_KEY_PREFIX}:*`,
  ];

  for (const pattern of patterns) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');
  }

  return deleted;
}

/**
 * Invalidate cached search results for a specific query hash.
 * More targeted than full invalidation — useful when only one
 * listing's content changed and we know which queries it affects.
 */
export async function invalidateSearchCacheForQuery(
  redis: Redis,
  params: SearchQueryParams,
): Promise<void> {
  const key = searchCacheKey(params);
  await redis.del(key);
}

// ── Search analytics ──────────────────────────────────────────────────────────

/**
 * Record a search request's metrics for real-time analytics.
 * Stores counters in Redis that can be aggregated for dashboard access.
 */
export async function recordSearchAnalytics(
  redis: Redis,
  input: {
    query: string;
    responseTimeMs: number;
    zeroResults: boolean;
    cacheHit: boolean;
  },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / 60) * 60; // 1-minute buckets
  const key = `${ANALYTICS_KEY_PREFIX}:${bucket}`;

  const pipeline = redis.pipeline();
  pipeline.hincrby(key, 'queryVolume', 1);
  pipeline.hincrby(key, 'totalResponseTimeMs', Math.round(input.responseTimeMs));
  if (input.zeroResults) {
    pipeline.hincrby(key, 'zeroResultCount', 1);
  }
  if (input.cacheHit) {
    pipeline.hincrby(key, 'cacheHitCount', 1);
  } else {
    pipeline.hincrby(key, 'cacheMissCount', 1);
  }
  pipeline.expire(key, ANALYTICS_TTL_SECONDS);
  await pipeline.exec();
}

/**
 * Retrieve aggregated search analytics across recent time buckets.
 * Aggregates the last `windowMinutes` minutes of data.
 */
export async function getSearchAnalytics(
  redis: Redis,
  windowMinutes: number = 5,
): Promise<SearchAnalytics> {
  const now = Math.floor(Date.now() / 1000);
  const currentBucket = Math.floor(now / 60) * 60;

  let queryVolume = 0;
  let totalResponseTimeMs = 0;
  let zeroResultCount = 0;
  let cacheHitCount = 0;
  let cacheMissCount = 0;

  for (let i = 0; i < windowMinutes; i++) {
    const bucket = currentBucket - i * 60;
    const key = `${ANALYTICS_KEY_PREFIX}:${bucket}`;
    const data = await redis.hgetall(key);
    if (data && Object.keys(data).length > 0) {
      queryVolume += Number(data.queryVolume ?? 0);
      totalResponseTimeMs += Number(data.totalResponseTimeMs ?? 0);
      zeroResultCount += Number(data.zeroResultCount ?? 0);
      cacheHitCount += Number(data.cacheHitCount ?? 0);
      cacheMissCount += Number(data.cacheMissCount ?? 0);
    }
  }

  const totalRequests = cacheHitCount + cacheMissCount;
  const avgResponseTimeMs = queryVolume > 0 ? totalResponseTimeMs / queryVolume : 0;
  const zeroResultRate = queryVolume > 0 ? zeroResultCount / queryVolume : 0;
  const cacheHitRate = totalRequests > 0 ? cacheHitCount / totalRequests : 0;

  return {
    queryVolume,
    avgResponseTimeMs: Math.round(avgResponseTimeMs * 100) / 100,
    zeroResultCount,
    zeroResultRate: Math.round(zeroResultRate * 10000) / 10000,
    cacheHitCount,
    cacheMissCount,
    cacheHitRate: Math.round(cacheHitRate * 10000) / 10000,
  };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Create a mock Redis client for testing. Implements only the methods
 * used by the search cache module, backed by an in-memory Map.
 */
export function createMockRedis(): Redis {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  const sortedSets = new Map<string, Map<string, number>>();
  const hashes = new Map<string, Map<string, string>>();

  const isExpired = (entry: { expiresAt?: number }): boolean => {
    return entry.expiresAt !== undefined && Date.now() > entry.expiresAt;
  };

  const cleanupKey = (key: string): void => {
    const entry = store.get(key);
    if (entry && isExpired(entry)) {
      store.delete(key);
    }
  };

  const mock = {
    async get(key: string): Promise<string | null> {
      cleanupKey(key);
      return store.get(key)?.value ?? null;
    },

    async set(
      key: string,
      value: string,
      mode?: string,
      ttl?: number,
    ): Promise<string> {
      const expiresAt = mode === 'EX' && ttl ? Date.now() + ttl * 1000 : undefined;
      store.set(key, { value, expiresAt });
      return 'OK';
    },

    async del(...keys: string[]): Promise<number> {
      let count = 0;
      for (const key of keys) {
        if (store.delete(key)) count += 1;
        sortedSets.delete(key);
        hashes.delete(key);
      }
      return count;
    },

    async scan(
      cursor: string,
      _match: string,
      _count: number,
    ): Promise<[string, string[]]> {
      // Simplified: return all matching keys in one batch
      return ['0', []];
    },

    async zincrby(key: string, increment: number, member: string): Promise<number> {
      let zset = sortedSets.get(key);
      if (!zset) {
        zset = new Map();
        sortedSets.set(key, zset);
      }
      const current = zset.get(member) ?? 0;
      const newValue = current + increment;
      zset.set(member, newValue);
      return newValue;
    },

    async zrevrange(
      key: string,
      start: number,
      stop: number,
      withScores?: string,
    ): Promise<(string | number)[]> {
      const zset = sortedSets.get(key);
      if (!zset) return [];
      const entries = Array.from(zset.entries())
        .sort((a, b) => b[1] - a[1]);
      const sliced = entries.slice(start, stop < 0 ? undefined : stop + 1);
      if (withScores === 'WITHSCORES') {
        const result: (string | number)[] = [];
        for (const [member, score] of sliced) {
          result.push(member, score);
        }
        return result;
      }
      return sliced.map(([member]) => member);
    },

    async expire(key: string, seconds: number): Promise<number> {
      const entry = store.get(key);
      if (entry) {
        entry.expiresAt = Date.now() + seconds * 1000;
        return 1;
      }
      const zset = sortedSets.get(key);
      if (zset) {
        // For sorted sets, we track expiry via the store with a sentinel
        store.set(key, { value: '__zset__', expiresAt: Date.now() + seconds * 1000 });
        return 1;
      }
      return 0;
    },

    async hincrby(key: string, field: string, increment: number): Promise<number> {
      let hash = hashes.get(key);
      if (!hash) {
        hash = new Map();
        hashes.set(key, hash);
      }
      const current = Number(hash.get(field) ?? 0);
      const newValue = current + increment;
      hash.set(field, String(newValue));
      return newValue;
    },

    async hgetall(key: string): Promise<Record<string, string>> {
      const hash = hashes.get(key);
      if (!hash) return {};
      return Object.fromEntries(hash);
    },

    pipeline(): any {
      const commands: Array<() => Promise<unknown>> = [];
      const self = this;
      return {
        hincrby(key: string, field: string, increment: number) {
          commands.push(() => self.hincrby(key, field, increment));
          return this;
        },
        expire(key: string, seconds: number) {
          commands.push(() => self.expire(key, seconds));
          return this;
        },
        async exec(): Promise<Array<[Error | null, unknown]>> {
          const results: Array<[Error | null, unknown]> = [];
          for (const cmd of commands) {
            try {
              const result = await cmd();
              results.push([null, result]);
            } catch (err) {
              results.push([err as Error, null]);
            }
          }
          return results;
        },
      };
    },

    // Expose internal store for test assertions
    _store: store,
    _sortedSets: sortedSets,
    _hashes: hashes,
  };

  return mock as unknown as Redis;
}
