import type { Pool, QueryResult } from 'pg';
import { logger } from './logger.js';
import {
  createSearchAdapter,
  type ListingDocument,
} from './searchAdapter.js';

const BATCH_SIZE = 100;

const MEILISEARCH_INDEX_NAME =
  process.env.MEILISEARCH_INDEX ?? 'listings';

interface ListingRow {
  id: string;
  title: string;
  description: string;
  price_gbp: string | number;
  status: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  created_at: string;
}

interface MeiliIndex {
  updateSearchableAttributes(attrs: string[]): Promise<unknown>;
  updateFilterableAttributes(attrs: string[]): Promise<unknown>;
  updateSortableAttributes(attrs: string[]): Promise<unknown>;
  updateRankingRules(rules: string[]): Promise<unknown>;
}

interface MeiliClient {
  index(name: string): MeiliIndex;
}

interface MeiliTask {
  taskUid: number;
}

/**
 * Poll the Meilisearch task endpoint until a task succeeds or fails.
 * Throws if the task ends in the `failed` state.
 */
async function pollMeiliTask(
  url: string,
  apiKey: string | undefined,
  taskUid: number,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const headers = { Authorization: `Bearer ${apiKey ?? ''}` };
  while (Date.now() < deadline) {
    const response = await fetch(`${url}/tasks/${taskUid}`, { headers });
    if (!response.ok) {
      throw new Error(`Task poll failed: ${response.status} ${await response.text()}`);
    }
    const task = (await response.json()) as { status: string; error?: unknown };
    if (task.status === 'succeeded') return;
    if (task.status === 'failed') {
      throw new Error(`Meilisearch task ${taskUid} failed: ${JSON.stringify(task.error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Meilisearch task ${taskUid} timed out after ${timeoutMs}ms`);
}

/**
 * Map a PostgreSQL listing row into the `ListingDocument` shape expected
 * by the `SearchAdapter`. Numeric columns arrive as strings from pg and
 * are coerced here so the adapter always receives a clean document.
 */
function rowToDocument(row: ListingRow): ListingDocument {
  const sizes = row.size ? [row.size] : undefined;
  return {
    id: row.id,
    title: row.title,
    brand: row.brand ?? undefined,
    description: row.description,
    category: row.category ?? '',
    condition: row.condition ?? '',
    sizes,
    price: Number(row.price_gbp),
    currency: 'GBP',
    status: row.status,
    createdAt: row.created_at,
  };
}

/**
 * Configure the Meilisearch index settings (searchable attributes,
 * filterable attributes, sortable attributes, and ranking rules).
 * Called once on startup so the index is correctly configured before
 * documents are indexed. Never throws — errors are logged and swallowed
 * so a misconfigured search backend never blocks the API.
 */
export async function configureSearchIndex(): Promise<void> {
  const meiliUrl = process.env.MEILISEARCH_URL;
  if (!meiliUrl) {
    return;
  }

  try {
    const mod = (await import('meilisearch').catch(() => null)) as
      | { MeiliSearch: new (config: { host: string; apiKey?: string }) => MeiliClient }
      | null;
    if (!mod) {
      logger.warn(
        'meilisearch SDK not available — skipping index configuration',
      );
      return;
    }
    const client = new mod.MeiliSearch({
      host: meiliUrl,
      apiKey: process.env.MEILISEARCH_KEY,
    });
    const index = client.index(MEILISEARCH_INDEX_NAME);
    await index.updateSearchableAttributes([
      'title',
      'brand',
      'description',
      'category',
      'condition',
    ]);
    await index.updateFilterableAttributes([
      'category',
      'condition',
      'price',
      'status',
      'sizes',
    ]);
    await index.updateSortableAttributes([
      'price',
      'createdAt',
    ]);
    await index.updateRankingRules([
      'words',
      'typo',
      'proximity',
      'attribute',
      'sort',
      'exactness',
    ]);
    logger.info(
      { index: MEILISEARCH_INDEX_NAME },
      'Search index configured',
    );

    await configureEmbedder();
  } catch (error) {
    logger.error(
      { err: error, index: MEILISEARCH_INDEX_NAME },
      'Failed to configure search index',
    );
  }
}

/**
 * Configure the embedder for the Meilisearch index. Only runs when
 * MEILISEARCH_EMBEDDER_SOURCE is set. Supported sources: huggingFace,
 * openAi, ollama, rest. For huggingFace, no API key is needed (local
 * inference). Throws on failure so callers can surface configuration
 * errors during startup.
 */
export async function configureEmbedder(): Promise<void> {
  const url = process.env.MEILISEARCH_URL;
  if (!url) return;
  const source = process.env.MEILISEARCH_EMBEDDER_SOURCE;
  if (!source) return;
  const indexName = process.env.MEILISEARCH_INDEX ?? 'listings';
  const apiKey = process.env.MEILISEARCH_KEY;
  const documentTemplate = '{{doc.title}} {{doc.description}} {{doc.brand}} {{doc.category}}';

  const embedderConfig: Record<string, unknown> = { source };
  if (source === 'openAi') {
    embedderConfig.apiKey = process.env.MEILISEARCH_EMBEDDER_API_KEY ?? process.env.OPENAI_API_KEY;
    embedderConfig.model = process.env.MEILISEARCH_EMBEDDER_MODEL ?? 'text-embedding-3-small';
    embedderConfig.documentTemplate = documentTemplate;
  } else if (source === 'huggingFace') {
    embedderConfig.model = process.env.MEILISEARCH_EMBEDDER_MODEL ?? 'sentence-transformers/all-MiniLM-L6-v2';
    embedderConfig.documentTemplate = documentTemplate;
  }

  const response = await fetch(
    `${url}/indexes/${indexName}/settings/embedders`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey ?? ''}`,
      },
      body: JSON.stringify({ default: embedderConfig }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to configure embedder: ${response.status} ${await response.text()}`);
  }
  const task = (await response.json()) as MeiliTask;
  await pollMeiliTask(url, apiKey, task.taskUid);
  logger.info(
    { index: indexName, source },
    'Embedder configured on search index',
  );
}

/**
 * Read all active listings from PostgreSQL and index them into the
 * search backend in batches of 100. Returns a summary of how many
 * listings were synced and how many failed. Never throws — errors are
 * logged and the sync continues with the next batch.
 */
export async function syncListingsToSearchIndex(
  dbPool: Pool,
): Promise<{ synced: number; failed: number; total: number }> {
  const adapter = createSearchAdapter();
  let synced = 0;
  let failed = 0;
  let lastId: string | null = null;

  try {
    while (true) {
      const batch: QueryResult<ListingRow> = await dbPool.query<ListingRow>(
        `
          SELECT
            id, title, description, price_gbp::text, status,
            category, brand, size, condition, created_at::text
          FROM listings
          WHERE status = 'active' AND ($1::text IS NULL OR id > $1)
          ORDER BY id
          LIMIT $2
        `,
        [lastId, BATCH_SIZE],
      );

      if (!batch.rowCount || batch.rowCount === 0) {
        break;
      }

      for (const row of batch.rows) {
        try {
          await adapter.index(rowToDocument(row));
          synced += 1;
        } catch (error) {
          failed += 1;
          logger.error(
            { err: error, listingId: row.id },
            'Failed to index listing during batch sync',
          );
        }
      }

      lastId = batch.rows[batch.rows.length - 1].id;

      if (batch.rowCount < BATCH_SIZE) {
        break;
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to sync listings to search index');
  }

  const total = synced + failed;
  logger.info(
    { synced, failed, total },
    'Search index sync complete',
  );
  return { synced, failed, total };
}

/**
 * Index (or re-index) a single listing into the search backend.
 * Called after a listing is created or updated. Never throws — errors
 * are logged so the request flow is never blocked.
 */
export async function syncSingleListing(
  dbPool: Pool,
  listingId: string,
): Promise<void> {
  const adapter = createSearchAdapter();
  try {
    const result = await dbPool.query<ListingRow>(
      `
        SELECT
          id, title, description, price_gbp::text, status,
          category, brand, size, condition, created_at::text
        FROM listings
        WHERE id = $1
        LIMIT 1
      `,
      [listingId],
    );

    if (!result.rowCount) {
      await adapter.remove(listingId);
      return;
    }

    const row = result.rows[0];
    if (row.status === 'deleted' || row.status === 'sold') {
      await adapter.remove(listingId);
      return;
    }

    await adapter.index(rowToDocument(row));
  } catch (error) {
    logger.error(
      { err: error, listingId },
      'Failed to sync single listing to search index',
    );
  }
}

/**
 * Remove a listing from the search index. Called after a listing is
 * deleted or deactivated. Never throws — errors are logged.
 */
export async function removeListingFromIndex(
  listingId: string,
): Promise<void> {
  const adapter = createSearchAdapter();
  try {
    await adapter.remove(listingId);
  } catch (error) {
    logger.error(
      { err: error, listingId },
      'Failed to remove listing from search index',
    );
  }
}
