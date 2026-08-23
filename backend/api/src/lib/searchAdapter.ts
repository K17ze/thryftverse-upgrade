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

// ── Public Types ─────────────────────────────────────────────────────────────

export interface SearchAdapter {
  index(listing: ListingDocument): Promise<void>;
  remove(id: string): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult[]>;
  autocomplete(prefix: string, limit?: number): Promise<AutocompleteEntry[]>;
  health(): Promise<boolean>;
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
export class InMemorySearchAdapter implements SearchAdapter {
  async index(listing: ListingDocument): Promise<void> {
    searchIndex.addListing(toIndexedListing(listing));
  }

  async remove(id: string): Promise<void> {
    searchIndex.removeListing(id);
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
 *   MEILISEARCH_KEY   — master/search API key (optional for dev instances)
 */
export class MeilisearchSearchAdapter implements SearchAdapter {
  private readonly indexName: string;
  private client: unknown = null;
  private fallback = new InMemorySearchAdapter();
  private readonly url: string;
  private readonly key: string | undefined;

  constructor(options?: { url?: string; key?: string; indexName?: string }) {
    this.url = options?.url ?? process.env.MEILISEARCH_URL ?? '';
    this.key = options?.key ?? process.env.MEILISEARCH_KEY;
    this.indexName = options?.indexName ?? process.env.MEILISEARCH_INDEX ?? 'listings';
    void this.initClient();
  }

  private async initClient(): Promise<void> {
    if (!this.url) {
      return;
    }
    try {
      // Dynamic import so the dependency is optional at runtime.
      const mod = (await import('meilisearch' as string).catch(() => null)) as
        | { MeiliSearch: new (config: { host: string; apiKey?: string }) => unknown }
        | null;
      if (!mod) {
        return;
      }
      this.client = new mod.MeiliSearch({ host: this.url, apiKey: this.key });
    } catch {
      this.client = null;
    }
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

  async index(listing: ListingDocument): Promise<void> {
    const handle = await this.ensureClient();
    if (!handle) {
      await this.fallback.index(listing);
      return;
    }
    await handle.index.addDocuments([listing]);
  }

  async remove(id: string): Promise<void> {
    const handle = await this.ensureClient();
    if (!handle) {
      await this.fallback.remove(id);
      return;
    }
    await handle.index.deleteDocument(id);
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

    const response = (await handle.index.search(query.query, {
      filter: filterExpressions.length > 0 ? filterExpressions.join(' AND ') : undefined,
      limit: query.limit ?? 24,
      offset: query.offset ?? 0,
    })) as { hits?: Array<Record<string, unknown> & { _rankingScore?: number }> };

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
    const response = (await handle.index.search(prefix, {
      limit,
      attributesToRetrieve: ['title', 'brand', 'category'],
    })) as { hits?: Array<{ title?: string; brand?: string; category?: string; _rankingScore?: number }> };
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
      return this.fallback.health();
    }
    try {
      // A lightweight search with zero results confirms connectivity.
      await handle.index.search('', { limit: 0 });
      return true;
    } catch {
      return false;
    }
  }
}

// ── Elasticsearch Adapter (future) ───────────────────────────────────────────

/**
 * Placeholder Elasticsearch adapter. The interface is stable; the
 * implementation will be added when Elasticsearch is adopted. Falls
 * back to the in-memory adapter until then.
 */
export class ElasticsearchSearchAdapter implements SearchAdapter {
  private fallback = new InMemorySearchAdapter();

  async index(listing: ListingDocument): Promise<void> {
    await this.fallback.index(listing);
  }

  async remove(id: string): Promise<void> {
    await this.fallback.remove(id);
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

  if (meiliUrl) {
    cachedAdapter = new MeilisearchSearchAdapter({ url: meiliUrl });
  } else if (esUrl) {
    cachedAdapter = new ElasticsearchSearchAdapter();
  } else {
    cachedAdapter = new InMemorySearchAdapter();
  }

  return cachedAdapter;
}

/** Reset the cached adapter (useful for tests). */
export function resetSearchAdapterCache(): void {
  cachedAdapter = null;
}
