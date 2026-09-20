import { logger } from './logger.js';

/**
 * The live index name that queries target. Blue/green reindexes never write
 * to this name directly — they build `<name>_v<timestamp>` staging indexes
 * and repoint it with an atomic `swapIndexes` (see searchSync.ts).
 */
export const MEILISEARCH_INDEX_NAME =
  process.env.MEILISEARCH_INDEX ?? 'listings';

/**
 * Languages the listings index is expected to serve. Applied through
 * `localizedAttributes` so Meilisearch runs per-document language detection
 * and tokenisation on the searchable text attributes — accented and
 * non-Latin listings match correctly while English behaviour is unchanged
 * (detected as 'eng'). Override with MEILISEARCH_LOCALES (CSV of ISO-639-3
 * codes the installed Meilisearch build supports).
 */
const DEFAULT_SEARCH_LOCALES = [
  'eng',
  'fra',
  'deu',
  'spa',
  'ita',
  'por',
  'nld',
];

function searchLocales(): string[] {
  const fromEnv = process.env.MEILISEARCH_LOCALES
    ?.split(',')
    .map((locale) => locale.trim())
    .filter(Boolean);
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_SEARCH_LOCALES;
}

export interface MeiliIndexStats {
  numberOfDocuments: number;
  isIndexing: boolean;
}

export interface MeiliIndex {
  updateSearchableAttributes(attrs: string[]): Promise<unknown>;
  updateFilterableAttributes(attrs: string[]): Promise<unknown>;
  updateSortableAttributes(attrs: string[]): Promise<unknown>;
  updateRankingRules(rules: string[]): Promise<unknown>;
  updateTypoTolerance(
    config: Record<string, unknown>,
  ): Promise<unknown>;
  updateSynonyms(
    synonyms: Record<string, string[]>,
  ): Promise<unknown>;
  updateLocalizedAttributes(
    attributes: Array<{ attributePatterns: string[]; locales: string[] }>,
  ): Promise<unknown>;
  getStats(): Promise<MeiliIndexStats>;
}

interface MeiliKey {
  uid: string;
  key: string;
  description?: string;
  actions: string[];
  indexes: string[];
}

export interface MeiliClient {
  index(name: string): MeiliIndex;
  createIndex(
    uid: string,
    options?: { primaryKey?: string },
  ): Promise<{ taskUid: number }>;
  deleteIndex(uid: string): Promise<{ taskUid: number }>;
  getIndexes(parameters?: {
    limit?: number;
    offset?: number;
  }): Promise<{ results: Array<{ uid: string }> }>;
  /**
   * Atomically exchanges the contents of each index pair — the only safe
   * primitive for repointing the live index name onto a freshly built
   * staging index. Never emulate this with delete+recreate.
   */
  swapIndexes(
    swaps: Array<{ indexes: [string, string] }>,
  ): Promise<{ taskUid: number }>;
  createKey(options: {
    description: string;
    actions: string[];
    indexes: string[];
    expiresAt: string | null;
  }): Promise<MeiliKey>;
  getKeys(): Promise<{ results: MeiliKey[] }>;
}

interface MeiliModule {
  MeiliSearch: new (config: {
    host: string;
    apiKey?: string;
  }) => MeiliClient;
}

export async function loadMeiliClient(): Promise<MeiliClient | null> {
  const meiliUrl = process.env.MEILISEARCH_URL;
  if (!meiliUrl) {
    return null;
  }
  try {
    const mod = (await import('meilisearch').catch(() => null)) as
      | MeiliModule
      | null;
    if (!mod) {
      logger.warn(
        'meilisearch SDK not available — skipping meilisearch configuration',
      );
      return null;
    }
    return new mod.MeiliSearch({
      host: meiliUrl,
      apiKey: process.env.MEILISEARCH_KEY,
    });
  } catch (error) {
    logger.error(
      { err: error },
      'Failed to initialise meilisearch client for configuration',
    );
    return null;
  }
}

/**
 * Configure Meilisearch typo tolerance for the listings index.
 *
 * Sets `minWordSizeForTypos` so that one-typo matching requires at least a
 * 4-character word and two-typo matching requires at least 8 characters.
 * Typo correction is disabled on the `id` attribute so identifiers are
 * never fuzzy-matched. Never throws — errors are logged and swallowed so a
 * misconfigured search backend never blocks the API.
 *
 * `indexName` defaults to the live index; the blue/green reindex passes the
 * staging index name so it is configured identically before the swap.
 */
export async function configureMeilisearchTypoTolerance(
  indexName: string = MEILISEARCH_INDEX_NAME,
): Promise<void> {
  const client = await loadMeiliClient();
  if (!client) {
    return;
  }
  try {
    const index = client.index(indexName);
    await index.updateTypoTolerance({
      minWordSizeForTypos: {
        oneTypo: 4,
        twoTypos: 8,
      },
      disableOnAttributes: ['id'],
      disableOnWords: [],
    });
    logger.info(
      { index: indexName },
      'Meilisearch typo tolerance configured',
    );
  } catch (error) {
    logger.error(
      { err: error, index: indexName },
      'Failed to configure meilisearch typo tolerance',
    );
  }
}

/**
 * Configure Meilisearch synonyms for the listings index.
 *
 * Maps common fashion, thrift, brand and condition terms to their synonyms
 * so a search for "sneakers" also matches documents containing "trainers" or
 * "shoes". Never throws — errors are logged and swallowed.
 */
export async function configureMeilisearchSynonyms(
  indexName: string = MEILISEARCH_INDEX_NAME,
): Promise<void> {
  const client = await loadMeiliClient();
  if (!client) {
    return;
  }
  try {
    const index = client.index(indexName);
    await index.updateSynonyms({
      sneakers: ['trainers', 'shoes'],
      pants: ['trousers'],
      purse: ['handbag', 'bag'],
      jumper: ['sweater', 'pullover'],
      coat: ['jacket', 'overcoat'],
      nike: ['nike inc'],
      adidas: ['adidas ag'],
      new: ['mint', 'pristine'],
      used: ['pre-owned', 'secondhand'],
    });
    logger.info(
      { index: indexName },
      'Meilisearch synonyms configured',
    );
  } catch (error) {
    logger.error(
      { err: error, index: indexName },
      'Failed to configure meilisearch synonyms',
    );
  }
}

/**
 * Configure per-document language detection on the searchable text
 * attributes via `localizedAttributes` (Meilisearch ≥ v1.12).
 *
 * Without this, the index uses a single ASCII-oriented tokeniser and
 * non-English listings — accented ("café"), or non-Latin scripts — are
 * tokenised poorly or not at all. With it, Meilisearch detects each
 * document's language per attribute and applies the matching tokeniser.
 * English documents/queries are detected as 'eng' and behave exactly as
 * before, so ASCII behaviour is not regressed.
 *
 * Never throws — errors are logged and swallowed so a Meilisearch version
 * that predates localizedAttributes does not break index configuration.
 */
export async function configureMeilisearchLocalizedAttributes(
  indexName: string = MEILISEARCH_INDEX_NAME,
): Promise<void> {
  const client = await loadMeiliClient();
  if (!client) {
    return;
  }
  const locales = searchLocales();
  try {
    const index = client.index(indexName);
    if (typeof index.updateLocalizedAttributes !== 'function') {
      logger.warn(
        { index: indexName },
        'meilisearch SDK has no updateLocalizedAttributes — skipping multilingual configuration',
      );
      return;
    }
    await index.updateLocalizedAttributes([
      {
        attributePatterns: [
          'title',
          'description',
          'brand',
          'category',
          'condition',
        ],
        locales,
      },
    ]);
    logger.info(
      { index: indexName, locales },
      'Meilisearch localized attributes configured',
    );
  } catch (error) {
    logger.error(
      { err: error, index: indexName, locales },
      'Failed to configure meilisearch localized attributes',
    );
  }
}

/**
 * Create a Meilisearch search-only API key and return its UID.
 *
 * The key is scoped to the `search` action on the listings index so it can
 * be safely exposed to the client without granting administrative access.
 * If a key with the same description already exists, its UID is returned
 * instead of creating a duplicate. Never throws — returns `null` on any
 * failure so the API can continue without a public search key.
 */
export async function createMeilisearchSearchOnlyKey(): Promise<string | null> {
  const client = await loadMeiliClient();
  if (!client) {
    return null;
  }
  try {
    const description = 'thryftverse-public-search-only';
    const existing = await client.getKeys();
    const found = existing.results.find(
      (k) => k.description === description,
    );
    if (found) {
      logger.info(
        { keyUid: found.uid },
        'Meilisearch search-only key already exists',
      );
      return found.uid;
    }

    const created = await client.createKey({
      description,
      actions: ['search'],
      indexes: [MEILISEARCH_INDEX_NAME],
      expiresAt: null,
    });
    logger.info(
      { keyUid: created.uid },
      'Meilisearch search-only key created',
    );
    return created.uid;
  } catch (error) {
    logger.error(
      { err: error },
      'Failed to create meilisearch search-only key',
    );
    return null;
  }
}
