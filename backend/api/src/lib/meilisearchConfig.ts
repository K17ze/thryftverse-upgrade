import { logger } from './logger.js';

const MEILISEARCH_INDEX_NAME =
  process.env.MEILISEARCH_INDEX ?? 'listings';

interface MeiliIndex {
  updateTypoTolerance(
    config: Record<string, unknown>,
  ): Promise<unknown>;
  updateSynonyms(
    synonyms: Record<string, string[]>,
  ): Promise<unknown>;
}

interface MeiliKey {
  uid: string;
  key: string;
  description?: string;
  actions: string[];
  indexes: string[];
}

interface MeiliClient {
  index(name: string): MeiliIndex;
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

async function loadMeiliClient(): Promise<MeiliClient | null> {
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
 */
export async function configureMeilisearchTypoTolerance(): Promise<void> {
  const client = await loadMeiliClient();
  if (!client) {
    return;
  }
  try {
    const index = client.index(MEILISEARCH_INDEX_NAME);
    await index.updateTypoTolerance({
      minWordSizeForTypos: {
        oneTypo: 4,
        twoTypos: 8,
      },
      disableOnAttributes: ['id'],
      disableOnWords: [],
    });
    logger.info(
      { index: MEILISEARCH_INDEX_NAME },
      'Meilisearch typo tolerance configured',
    );
  } catch (error) {
    logger.error(
      { err: error, index: MEILISEARCH_INDEX_NAME },
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
export async function configureMeilisearchSynonyms(): Promise<void> {
  const client = await loadMeiliClient();
  if (!client) {
    return;
  }
  try {
    const index = client.index(MEILISEARCH_INDEX_NAME);
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
      { index: MEILISEARCH_INDEX_NAME },
      'Meilisearch synonyms configured',
    );
  } catch (error) {
    logger.error(
      { err: error, index: MEILISEARCH_INDEX_NAME },
      'Failed to configure meilisearch synonyms',
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
