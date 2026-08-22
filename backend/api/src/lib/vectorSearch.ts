import { createSearchAdapter, type SearchResult } from './searchAdapter.js';
import { logger } from './logger.js';

export interface SemanticSearchOptions {
  limit?: number;
  filters?: Record<string, unknown>;
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
 * SDK and `hybrid` option are available, otherwise degrades to the
 * regular text SearchAdapter. Never throws — on any error it falls
 * back to a plain text search so the caller always receives results.
 */
export async function semanticSearch(
  query: string,
  options: SemanticSearchOptions,
): Promise<SearchResult[]> {
  const limit = options.limit ?? 24;

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
      return (response.hits ?? []).map((hit) => ({
        id: String(hit.id),
        score: typeof hit._rankingScore === 'number' ? hit._rankingScore : 1,
        document: hit as unknown as SearchResult['document'],
      }));
    } catch (error) {
      logger.warn(
        { err: error },
        'semanticSearch: hybrid search unavailable, falling back to text search',
      );
    }
  }

  try {
    const adapter = createSearchAdapter();
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
