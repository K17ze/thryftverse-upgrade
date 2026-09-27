// ─────────────────────────────────────────────────────────────────────────────
// Search Adapter — pluggable search backend abstraction.
//
// Allows the search backend to be swapped between:
//   1. In-memory (current, for development) — wraps searchIndex.ts
//   2. Meilisearch (for production) — uses meilisearch SDK if configured
//   3. Elasticsearch (future) — interface-ready, not yet implemented
//
// The adapter is backward-compatible: existing code that imports
// `searchIndex` directly continues to work unchanged. New code should
// prefer `createSearchAdapter()` so the backend can be swapped via env.
// ─────────────────────────────────────────────────────────────────────────────

import {
  searchIndex,
  type IndexedListing,
  type SearchResult as InMemorySearchResult,
  type AutocompleteEntry,
} from './searchIndex.js';
import { meilisearchApiKey } from './meilisearchConfig.js';
import { logger } from './logger.js';

// ── Public Types ─────────────────────────────────────────────────────────────

/**
 * Backend identity reported by `SearchAdapter.retrievalInfo()`. Lets search
 * routes disclose which engine actually served a request, including the
 * Elasticsearch placeholder that silently behaves as in-memory search.
 */
export type SearchBackend =
  | 'in_memory'
  | 'meilisearch'
  | 'elasticsearch_placeholder';

/**
 * Capability descriptor for a search backend. Used by routes to build the
 * honest `retrievalMeta` on every response.
 */
export interface RetrievalInfo {
  backend: SearchBackend;
  /**
   * Whether a vector embedder is provably configured. Defaults to false:
   * there is no code-level evidence of a production embedder, and the
   * in-memory / Elasticsearch-placeholder backends have no vector support.
   * Set to true only when a hybrid/semantic search actually succeeds.
   */
  embedderConfigured: boolean;
  /**
   * True when a shared backend was configured but is unreachable and the
   * adapter is serving from the process-local fallback. This is the
   * observability signal ops must alert on — results still render, but
   * they are per-replica and can diverge. Absent/false when the selected
   * backend is serving as configured.
   */
  degraded?: boolean;
  /** Engine version string when known. */
  searchEngineVersion?: string;
}

/**
 * Where a write actually landed (audit §4.7 — a resolved `index()` call is
 * not proof of visibility):
 *   'remote' — the shared backend accepted the write. For Meilisearch this is
 *     a TASK SUBMISSION (addDocuments resolves when the task is enqueued, not
 *     applied); `taskUid` identifies the pending task so callers can confirm
 *     application via the tasks endpoint.
 *   'local'  — the write went to the process-local index: either that IS the
 *     configured backend (in-memory / placeholder) or the remote write failed
 *     and the degraded fallback absorbed it. A 'local' write is not visible
 *     to other replicas or to the shared index.
 */
export interface SearchIndexWriteResult {
  outcome: 'remote' | 'local';
  /** Meilisearch taskUid for 'remote' writes, when the SDK returned one. */
  taskUid?: number;
}

export interface SearchAdapter {
  index(listing: ListingDocument): Promise<SearchIndexWriteResult>;
  remove(id: string): Promise<SearchIndexWriteResult>;
  search(query: SearchQuery): Promise<SearchResult[]>;
  autocomplete(prefix: string, limit?: number): Promise<AutocompleteEntry[]>;
  health(): Promise<boolean>;
  /**
   * Report this backend's identity and vector capability so search routes
   * can attach honest `retrievalMeta` to responses. Does not perform a
   * search and must not throw.
   */
  retrievalInfo(): RetrievalInfo;
}

export interface ListingDocument {
  id: string;
  title: string;
  brand?: string;
  description: string;
  category: string;
  condition: string;
  sizes?: string[];
  price: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface SearchQuery {
  query: string;
  filters?: {
    category?: string;
    condition?: string;
    size?: string;
    minPrice?: number;
    maxPrice?: number;
  };
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  document: ListingDocument;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a ListingDocument (adapter contract) into the richer
 * IndexedListing shape expected by the in-memory SearchIndex. Missing
 * optional fields are filled with neutral defaults so scoring still
 * functions without seller/popularity metadata.
 */
function toIndexedListing(doc: ListingDocument): IndexedListing {
  return {
    id: doc.id,
    sellerId: '',
    title: doc.title,
    description: doc.description,
    category: doc.category ?? null,
    brand: doc.brand ?? null,
    size: doc.sizes?.[0] ?? null,
    condition: doc.condition ?? null,
    priceGbp: doc.price,
    imageUrl: null,
    createdAt: doc.createdAt,
    sellerRating: null,
    viewCount: 0,
    saleCount: 0,
    sellerUsername: null,
  };
}

/**
 * Convert an in-memory SearchResult back into the adapter's SearchResult
 * shape. The score is derived from the rank field (lower rank = better
 * match in the in-memory index, so we invert it into a 0-1 score).
 */
function fromInMemoryResult(result: InMemorySearchResult): SearchResult {
  return {
    id: result.id,
    score: result.rank > 0 ? 1 / result.rank : 1,
    document: {
      id: result.id,
      title: result.title,
      description: result.description,
      category: '',
      condition: '',
      price: result.priceGbp,
      currency: 'GBP',
      status: 'active',
      createdAt: result.createdAt,
    },
  };
}

// ── In-Memory Adapter ────────────────────────────────────────────────────────

/**
 * Wraps the existing in-memory SearchIndex (searchIndex.ts) behind the
 * SearchAdapter interface. Used in development and as a fallback when
 * no external search backend is configured.
 */
/** Extract the taskUid from a Meilisearch write-task response, when present. */
function writeTaskUid(result: unknown): number | undefined {
  const uid = (result as { taskUid?: unknown } | null)?.taskUid;
  return typeof uid === 'number' ? uid : undefined;
}

export class InMemorySearchAdapter implements SearchAdapter {
  async index(listing: ListingDocument): Promise<SearchIndexWriteResult> {
    searchIndex.addListing(toIndexedListing(listing));
    return { outcome: 'local' };
  }

  async remove(id: string): Promise<SearchIndexWriteResult> {
    searchIndex.removeListing(id);
    return { outcome: 'local' };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const results = searchIndex.search(query.query, {
      filters: {
        category: query.filters?.category,
        condition: query.filters?.condition,
        size: query.filters?.size,
        priceMin: query.filters?.minPrice,
        priceMax: query.filters?.maxPrice,
      },
      limit: query.limit,
      offset: query.offset,
    });
    return results.map(fromInMemoryResult);
  }

  async autocomplete(prefix: string, limit: number = 8): Promise<AutocompleteEntry[]> {
    return searchIndex.autocomplete(prefix, limit);
  }

  async health(): Promise<boolean> {
    // The in-memory index is always healthy if the process is running.
    return true;
  }

  retrievalInfo(): RetrievalInfo {
    // The in-memory index is a lexical keyword index with no vector
    // embedder. Honest default: embedderConfigured is always false here.
    return {
      backend: 'in_memory',
      embedderConfigured: false,
      searchEngineVersion: 'in-memory-v1',
    };
  }
}

// ── Meilisearch Adapter ──────────────────────────────────────────────────────

/**
 * Meilisearch-backed search adapter for production. Uses the meilisearch
 * SDK when available and configured. If the SDK is not installed or the
 * MEILISEARCH_URL is unreachable at construction time, operations fall
 * back to the in-memory adapter so the service never hard-fails.
 *
 * Required environment variables:
 *   MEILISEARCH_URL   — e.g. http://meilisearch:7700
 *   MEILISEARCH_KEY   — master/search API key (optional for dev instances).
 *                       MEILISEARCH_API_KEY is accepted as a legacy alias
 *                       via meilisearchApiKey() (see meilisearchConfig.ts).
 */
export class MeilisearchSearchAdapter implements SearchAdapter {
  private readonly indexName: string;
  private client: unknown = null;
  private fallback = new InMemorySearchAdapter();
  private readonly url: string;
  private readonly key: string | undefined;
  /**
   * True only while the configured backend is actually serving. Flips false
   * on init failure or any request error so `health()` and `retrievalInfo()`
   * report the degraded state instead of claiming Meilisearch while the
   * process-local fallback does the work.
   */
  private backendReachable = false;

  /**
   * Insertion-ordered ids this adapter has mirrored into the process-local
   * fallback index. The mirror exists so a mid-session Meilisearch outage
   * serves a coherent corpus instead of an empty/stale index; the cap keeps
   * the shadow copy bounded on large catalogues (oldest mirrored ids are
   * evicted first — the fallback is a safety net, not the source of truth).
   */
  private static readonly FALLBACK_MIRROR_CAP = 10_000;
  private readonly fallbackMirroredIds: string[] = [];
  private readonly fallbackMirroredSet = new Set<string>();

  constructor(options?: { url?: string; key?: string; indexName?: string }) {
    this.url = options?.url ?? process.env.MEILISEARCH_URL ?? '';
    this.key = options?.key ?? meilisearchApiKey();
    this.indexName = options?.indexName ?? process.env.MEILISEARCH_INDEX ?? 'listings';
    void this.initClient();
  }

  private warnedDegraded = false;

  private warnDegradedOnce(reason: string, error?: unknown): void {
    if (this.warnedDegraded) {
      return;
    }
    this.warnedDegraded = true;
    logger.warn(
      { url: this.url, index: this.indexName, reason, error },
      'search.backend.degraded — Meilisearch unavailable, serving process-local index',
    );
  }

  private async initClient(): Promise<void> {
    if (!this.url) {
      return;
    }
    try {
      // Dynamic import so the dependency is optional at runtime.
      const mod = (await import('meilisearch' as string).catch(() => null)) as
        | {
            // <0.35 exported `MeiliSearch`; >=0.35 renamed it `Meilisearch`.
            MeiliSearch?: new (config: { host: string; apiKey?: string }) => unknown;
            Meilisearch?: new (config: { host: string; apiKey?: string }) => unknown;
          }
        | null;
      const Client = mod?.MeiliSearch ?? mod?.Meilisearch;
      if (!Client) {
        this.warnDegradedOnce('sdk_unavailable');
        return;
      }
      this.client = new Client({ host: this.url, apiKey: this.key });
      this.backendReachable = true;
    } catch (error) {
      this.client = null;
      this.backendReachable = false;
      this.warnDegradedOnce('client_init_failed', error);
    }
  }

  /**
   * Record a real-backend failure: mark the backend unreachable and drop the
   * client so subsequent calls take the fallback fast-path and
   * `retrievalInfo()` reports `in_memory` + `degraded` rather than
   * 'meilisearch'. The call then falls through to the in-memory index so
   * reads keep serving during an outage — the degraded state is surfaced via
   * `retrievalInfo()`, `serveMode` and `/search/health`, not hidden.
   */
  private markBackendDown(): void {
    this.client = null;
    this.backendReachable = false;
  }

  private async ensureClient(): Promise<{ index: { addDocuments: (docs: unknown[]) => Promise<unknown>; deleteDocument: (id: string) => Promise<unknown>; search: (q: string, opts?: unknown) => Promise<unknown> } } | null> {
    if (this.client === null) {
      await this.initClient();
    }
    if (!this.client) {
      return null;
    }
    const client = this.client as { index: (name: string) => unknown };
    return { index: client.index(this.indexName) as never };
  }

  /**
   * Mirror a write into the bounded process-local fallback. Runs on BOTH
   * the success and failure paths: on success it keeps the fallback corpus
   * coherent with the shared index (a later outage then serves real data);
   * on failure it is the original degrade write. Best-effort — a mirror
   * failure must never fail the caller's write path.
   */
  private async mirrorIndexToFallback(listing: ListingDocument): Promise<void> {
    try {
      await this.fallback.index(listing);
      if (!this.fallbackMirroredSet.has(listing.id)) {
        this.fallbackMirroredSet.add(listing.id);
        this.fallbackMirroredIds.push(listing.id);
      }
      while (
        this.fallbackMirroredIds.length > MeilisearchSearchAdapter.FALLBACK_MIRROR_CAP
      ) {
        const evictId = this.fallbackMirroredIds.shift()!;
        this.fallbackMirroredSet.delete(evictId);
        await this.fallback.remove(evictId);
      }
    } catch (error) {
      logger.warn(
        { err: error, listingId: listing.id },
        'search.fallback.mirror_failed — process-local fallback could not mirror an index write',
      );
    }
  }

  private async mirrorRemoveToFallback(id: string): Promise<void> {
    try {
      await this.fallback.remove(id);
      if (this.fallbackMirroredSet.delete(id)) {
        const position = this.fallbackMirroredIds.indexOf(id);
        if (position !== -1) {
          this.fallbackMirroredIds.splice(position, 1);
        }
      }
    } catch (error) {
      logger.warn(
        { err: error, listingId: id },
        'search.fallback.mirror_failed — process-local fallback could not mirror a delete',
      );
    }
  }

  async index(listing: ListingDocument): Promise<SearchIndexWriteResult> {
    const handle = await this.ensureClient();
    if (!handle) {
      await this.mirrorIndexToFallback(listing);
      return { outcome: 'local' };
    }
    try {
      const task = await handle.index.addDocuments([listing]);
      this.backendReachable = true;
      // Successful remote write: keep the fallback coherent so an outage
      // later in the process lifetime still serves this document.
      await this.mirrorIndexToFallback(listing);
      // addDocuments resolves at TASK SUBMISSION — the document is not yet
      // searchable. Propagate the taskUid so callers can confirm completion
      // and measure true visibility lag instead of submission lag.
      return { outcome: 'remote', taskUid: writeTaskUid(task) };
    } catch {
      this.markBackendDown();
      await this.mirrorIndexToFallback(listing);
      return { outcome: 'local' };
    }
  }

  async remove(id: string): Promise<SearchIndexWriteResult> {
    const handle = await this.ensureClient();
    if (!handle) {
      await this.mirrorRemoveToFallback(id);
      return { outcome: 'local' };
    }
    try {
      const task = await handle.index.deleteDocument(id);
      this.backendReachable = true;
      await this.mirrorRemoveToFallback(id);
      return { outcome: 'remote', taskUid: writeTaskUid(task) };
    } catch {
      this.markBackendDown();
      await this.mirrorRemoveToFallback(id);
      return { outcome: 'local' };
    }
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const handle = await this.ensureClient();
    if (!handle) {
      return this.fallback.search(query);
    }

    const filterExpressions: string[] = [];
    const f = query.filters;
    if (f?.category) filterExpressions.push(`category = "${f.category}"`);
    if (f?.condition) filterExpressions.push(`condition = "${f.condition}"`);
    if (f?.size) filterExpressions.push(`sizes = "${f.size}"`);
    if (f?.minPrice !== undefined) filterExpressions.push(`price >= ${f.minPrice}`);
    if (f?.maxPrice !== undefined) filterExpressions.push(`price <= ${f.maxPrice}`);

    let response: { hits?: Array<Record<string, unknown> & { _rankingScore?: number }> };
    try {
      response = (await handle.index.search(query.query, {
        filter: filterExpressions.length > 0 ? filterExpressions.join(' AND ') : undefined,
        limit: query.limit ?? 24,
        offset: query.offset ?? 0,
      })) as typeof response;
      this.backendReachable = true;
    } catch (error) {
      this.markBackendDown();
      this.warnDegradedOnce('search_request_failed', error);
      return this.fallback.search(query);
    }

    return (response.hits ?? []).map((hit) => ({
      id: String(hit.id),
      score: typeof hit._rankingScore === 'number' ? hit._rankingScore : 1,
      document: hit as unknown as ListingDocument,
    }));
  }

  async autocomplete(prefix: string, limit: number = 8): Promise<AutocompleteEntry[]> {
    const handle = await this.ensureClient();
    if (!handle) {
      return this.fallback.autocomplete(prefix, limit);
    }
    let response: { hits?: Array<{ title?: string; brand?: string; category?: string; _rankingScore?: number }> };
    try {
      response = (await handle.index.search(prefix, {
        limit,
        attributesToRetrieve: ['title', 'brand', 'category'],
      })) as typeof response;
      this.backendReachable = true;
    } catch {
      this.markBackendDown();
      return this.fallback.autocomplete(prefix, limit);
    }
    return (response.hits ?? [])
      .map((hit): AutocompleteEntry | null => {
        const text = (hit.title ?? '').trim();
        if (!text) return null;
        const type: AutocompleteEntry['type'] = hit.brand ? 'brand' : hit.category ? 'category' : 'item';
        const score = typeof hit._rankingScore === 'number' ? hit._rankingScore * 100 : 1;
        return { text, type, score };
      })
      .filter((entry): entry is AutocompleteEntry => entry !== null)
      .slice(0, limit);
  }

  async health(): Promise<boolean> {
    const handle = await this.ensureClient();
    if (!handle) {
      // The configured backend is down or the SDK is absent — report the
      // real state, not the fallback's. Serving continues via the in-memory
      // index, but health must say the shared backend is unavailable.
      return false;
    }
    try {
      // A lightweight search with zero results confirms connectivity.
      await handle.index.search('', { limit: 0 });
      this.backendReachable = true;
      return true;
    } catch {
      this.markBackendDown();
      return false;
    }
  }

  retrievalInfo(): RetrievalInfo {
    const actuallyMeili = this.client !== null && this.backendReachable;
    return {
      backend: actuallyMeili ? 'meilisearch' : 'in_memory',
      embedderConfigured: false,
      degraded: !actuallyMeili,
      searchEngineVersion: actuallyMeili ? 'meilisearch-0.60' : 'in-memory-v1',
    };
  }
}

// ── Elasticsearch Adapter (future) ───────────────────────────────────────────

/**
 * Placeholder Elasticsearch adapter. The interface is stable; the
 * implementation will be added when Elasticsearch is adopted. Until then
 * every operation silently delegates to the in-memory adapter.
 *
 * `retrievalInfo()` exposes `backend: 'elasticsearch_placeholder'` so search
 * routes can disclose that requests are NOT served by Elasticsearch — they
 * are served by the in-memory index. This prevents the API from implying an
 * Elasticsearch backend that is not actually in use.
 */
export class ElasticsearchSearchAdapter implements SearchAdapter {
  private fallback = new InMemorySearchAdapter();

  async index(listing: ListingDocument): Promise<SearchIndexWriteResult> {
    return this.fallback.index(listing);
  }

  async remove(id: string): Promise<SearchIndexWriteResult> {
    return this.fallback.remove(id);
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    return this.fallback.search(query);
  }

  async autocomplete(prefix: string, limit?: number): Promise<AutocompleteEntry[]> {
    return this.fallback.autocomplete(prefix, limit);
  }

  async health(): Promise<boolean> {
    return this.fallback.health();
  }

  retrievalInfo(): RetrievalInfo {
    // Honest marker: this is a placeholder that behaves as in-memory search,
    // not a real Elasticsearch backend. No vector embedder is configured.
    return {
      backend: 'elasticsearch_placeholder',
      embedderConfigured: false,
      searchEngineVersion: 'in-memory-v1 (elasticsearch placeholder)',
    };
  }
}

// ── Process-local fallback priming ───────────────────────────────────────────

/**
 * Write a listing into the shared process-local index directly, bypassing
 * the configured backend. Used by the startup warm path to prime the
 * Meilisearch adapter's degraded-mode fallback while the shared backend is
 * healthy — an outage later in the process lifetime then serves a coherent
 * corpus instead of only post-boot writes. Never throws: this is a
 * best-effort safety net, not the serving path.
 */
export async function indexIntoLocalFallback(listing: ListingDocument): Promise<void> {
  try {
    searchIndex.addListing(toIndexedListing(listing));
  } catch (error) {
    logger.warn(
      { err: error, listingId: listing.id },
      'search.fallback.prime_failed — process-local fallback could not index a warmup row',
    );
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create the appropriate SearchAdapter based on environment configuration.
 *
 *   MEILISEARCH_URL set  → MeilisearchSearchAdapter
 *   ELASTICSEARCH_URL set → ElasticsearchSearchAdapter (future)
 *   otherwise            → InMemorySearchAdapter
 *
 * The selected adapter is cached as a process-wide singleton so the
 * index state persists across requests.
 */
let cachedAdapter: SearchAdapter | null = null;

export function createSearchAdapter(): SearchAdapter {
  if (cachedAdapter) {
    return cachedAdapter;
  }

  const meiliUrl = process.env.MEILISEARCH_URL;
  const esUrl = process.env.ELASTICSEARCH_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  const inMemoryAllowed = process.env.SEARCH_ALLOW_IN_MEMORY === 'true';

  if (meiliUrl) {
    cachedAdapter = new MeilisearchSearchAdapter({ url: meiliUrl });
    logger.info({ backend: 'meilisearch', url: meiliUrl }, 'Search backend selected');
  } else if (isProduction && !inMemoryAllowed) {
    // Production must not silently serve the process-local index: results
    // diverge across replicas and resets wipe the index. Fail loudly —
    // deployments that intentionally run a single instance opt in via
    // SEARCH_ALLOW_IN_MEMORY=true. The Elasticsearch adapter is a
    // placeholder that serves in-memory, so ELASTICSEARCH_URL does not
    // satisfy this gate either.
    throw new Error(
      esUrl
        ? 'Search backend misconfigured: ELASTICSEARCH_URL is set but the Elasticsearch adapter is a placeholder that serves the in-memory index. Configure MEILISEARCH_URL or set SEARCH_ALLOW_IN_MEMORY=true to opt into the process-local index.'
        : 'Search backend misconfigured: production requires MEILISEARCH_URL for a shared, durable index. Set SEARCH_ALLOW_IN_MEMORY=true only to opt into the process-local index for single-instance deployments.',
    );
  } else if (esUrl) {
    cachedAdapter = new ElasticsearchSearchAdapter();
    logger.info(
      { backend: 'elasticsearch_placeholder' },
      'Search backend selected (placeholder — serving in-memory index)',
    );
  } else {
    cachedAdapter = new InMemorySearchAdapter();
    logger.info({ backend: 'in_memory' }, 'Search backend selected');
  }

  return cachedAdapter;
}

/** Reset the cached adapter (useful for tests). */
export function resetSearchAdapterCache(): void {
  cachedAdapter = null;
}
