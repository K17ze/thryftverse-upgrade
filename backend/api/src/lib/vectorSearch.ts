import { createSearchAdapter, type SearchResult } from './searchAdapter.js';
import { logger } from './logger.js';
import type { RetrievalMeta, RetrievalFallbackReason } from './retrievalMeta.js';

export interface SemanticSearchOptions {
  limit?: number;
  filters?: Record<string, unknown>;
}

/**
 * Result of a semantic search attempt. `retrievalMeta` discloses which
 * method actually produced the results and whether a higher-capability
 * method was attempted but fell back — so callers never imply semantic
 * search was used when it was not.
 */
export interface SemanticSearchResult {
  results: SearchResult[];
  retrievalMeta: RetrievalMeta;
}

interface MeiliSearchClient {
  index(name: string): MeiliIndex;
}

interface MeiliIndex {
  search(
    q: string,
    opts?: Record<string, unknown>,
  ): Promise<{
    hits?: Array<Record<string, unknown> & { _rankingScore?: number }>;
  }>;
}

interface MeiliModule {
  MeiliSearch: new (config: { host: string; apiKey?: string }) => MeiliSearchClient;
}

let cachedMeiliClient: MeiliSearchClient | null | undefined;

async function getMeiliClient(): Promise<MeiliSearchClient | null> {
  if (cachedMeiliClient !== undefined) {
    return cachedMeiliClient;
  }

  const url = process.env.MEILISEARCH_URL;
  if (!url) {
    cachedMeiliClient = null;
    return null;
  }

  try {
    const mod = (await import('meilisearch').catch(() => null)) as MeiliModule | null;
    if (!mod) {
      cachedMeiliClient = null;
      return null;
    }
    cachedMeiliClient = new mod.MeiliSearch({
      host: url,
      apiKey: process.env.MEILISEARCH_KEY,
    });
    return cachedMeiliClient;
  } catch {
    cachedMeiliClient = null;
    return null;
  }
}

function buildMeiliFilter(filters: Record<string, unknown>): string | undefined {
  const expressions: string[] = [];
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === 'number') {
      expressions.push(`${key} = ${value}`);
    } else if (typeof value === 'string') {
      expressions.push(`${key} = "${value.replace(/"/g, '\\"')}"`);
    }
  }
  return expressions.length > 0 ? expressions.join(' AND ') : undefined;
}

/**
 * Perform a semantic search. Uses Meilisearch hybrid search when the
 * SDK and a configured embedder are available, otherwise degrades to the
 * regular text SearchAdapter. Never throws — on any error it falls back
 * to a plain text search so the caller always receives results.
 *
 * The returned `retrievalMeta` is honest about what happened:
 *   - hybrid search succeeded            → method 'hybrid', embedderConfigured true
 *   - no Meilisearch URL / SDK           → method 'lexical', fallbackReason 'embedder_unconfigured'
 *   - hybrid call failed (missing embed) → method 'lexical', fallbackReason 'embedder_unconfigured'
 *   - hybrid call failed (other error)   → method 'lexical', fallbackReason 'hybrid_search_failed'
 *   - text fallback also failed          → method 'lexical', fallbackReason 'hybrid_search_failed', empty results
 *
 * A warning is logged on every fallback so operators can detect an
 * unconfigured embedder instead of relying on silent degradation.
 */
export async function semanticSearch(
  query: string,
  options: SemanticSearchOptions,
): Promise<SemanticSearchResult> {
  const limit = options.limit ?? 24;
  const adapter = createSearchAdapter();
  const adapterInfo = adapter.retrievalInfo();

  const client = await getMeiliClient();
  if (client) {
    try {
      const indexName = process.env.MEILISEARCH_INDEX ?? 'listings';
      const index = client.index(indexName);
      const searchOpts: Record<string, unknown> = {
        limit,
        hybrid: { embedded: 'default', semanticRatio: 0.5 },
      };
      const filter = buildMeiliFilter(options.filters ?? {});
      if (filter) {
        searchOpts.filter = filter;
      }

      const response = await index.search(query, searchOpts);
      const results = (response.hits ?? []).map((hit) => ({
        id: String(hit.id),
        score: typeof hit._rankingScore === 'number' ? hit._rankingScore : 1,
        document: hit as unknown as SearchResult['document'],
      }));
      // The hybrid call succeeded, so a configured embedder is proven.
      return {
        results,
        retrievalMeta: {
          method: 'hybrid',
          embedderConfigured: true,
          searchEngineVersion: adapterInfo.searchEngineVersion,
        },
      };
    } catch (error) {
      const reason = classifyHybridError(error);
      logger.warn(
        { err: error, fallbackReason: reason },
        'semanticSearch: hybrid search unavailable, falling back to text search',
      );
      const fallbackResults = await textFallback(adapter, query, options, limit);
      return {
        results: fallbackResults,
        retrievalMeta: {
          method: 'lexical',
          fallbackReason: reason,
          embedderConfigured: false,
          searchEngineVersion: adapterInfo.searchEngineVersion,
        },
      };
    }
  }

  // No Meilisearch client at all — the embedder is unconfigured.
  logger.warn(
    { meilisearchUrl: process.env.MEILISEARCH_URL ?? null },
    'semanticSearch: Meilisearch embedder unconfigured, falling back to text search',
  );
  const fallbackResults = await textFallback(adapter, query, options, limit);
  return {
    results: fallbackResults,
    retrievalMeta: {
      method: 'lexical',
      fallbackReason: 'embedder_unconfigured',
      embedderConfigured: false,
      searchEngineVersion: adapterInfo.searchEngineVersion,
    },
  };
}

/**
 * Inspect a hybrid-search error and decide whether the embedder was the
 * cause (e.g. Meilisearch rejects an unknown embedder name) or some other
 * failure. This keeps the fallbackReason honest without over-claiming.
 */
function classifyHybridError(error: unknown): RetrievalFallbackReason {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message).toLowerCase()
      : '';
  if (message.includes('embedder') || message.includes('embedding') || message.includes('vector')) {
    return 'embedder_unconfigured';
  }
  return 'hybrid_search_failed';
}

/**
 * Run the text-search fallback through the SearchAdapter. Returns an empty
 * array (rather than throwing) if the fallback itself fails, so the caller
 * always receives a well-formed result.
 */
async function textFallback(
  adapter: ReturnType<typeof createSearchAdapter>,
  query: string,
  options: SemanticSearchOptions,
  limit: number,
): Promise<SearchResult[]> {
  try {
    return await adapter.search({
      query,
      filters: options.filters as never,
      limit,
    });
  } catch (error) {
    logger.error(
      { err: error },
      'semanticSearch: text search fallback failed',
    );
    return [];
  }
}
