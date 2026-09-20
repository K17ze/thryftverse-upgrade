import type { Pool, QueryResult } from 'pg';
import { logger } from './logger.js';
import {
  createSearchAdapter,
  MeilisearchSearchAdapter,
  type ListingDocument,
  type SearchAdapter,
} from './searchAdapter.js';
import {
  MEILISEARCH_INDEX_NAME,
  configureMeilisearchLocalizedAttributes,
  configureMeilisearchSynonyms,
  configureMeilisearchTypoTolerance,
  loadMeiliClient,
  type MeiliClient,
} from './meilisearchConfig.js';

const BATCH_SIZE = 100;

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
  intervalMs = 500,
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
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
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
 *
 * `indexName` defaults to the live index; the blue/green reindex passes the
 * staging index name so it carries the identical settings before the swap.
 */
export async function configureSearchIndex(
  indexName: string = MEILISEARCH_INDEX_NAME,
): Promise<void> {
  const meiliUrl = process.env.MEILISEARCH_URL;
  if (!meiliUrl) {
    return;
  }

  try {
    const client = await loadMeiliClient();
    if (!client) {
      return;
    }
    const index = client.index(indexName);
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
      { index: indexName },
      'Search index configured',
    );

    // Typo tolerance, synonyms and multilingual attributes live in
    // meilisearchConfig.ts — apply them on this same configuration path so
    // startup, the admin reindex route, and the manual searchSync script
    // all converge on one index shape. Each function self-guards (no-op
    // without a reachable Meilisearch backend) and never throws; they run
    // before configureEmbedder so an embedder failure cannot skip them.
    await configureMeilisearchTypoTolerance(indexName);
    await configureMeilisearchSynonyms(indexName);
    await configureMeilisearchLocalizedAttributes(indexName);

    await configureEmbedder(indexName);
  } catch (error) {
    logger.error(
      { err: error, index: indexName },
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
export async function configureEmbedder(
  indexName: string = MEILISEARCH_INDEX_NAME,
): Promise<void> {
  const url = process.env.MEILISEARCH_URL;
  if (!url) return;
  const source = process.env.MEILISEARCH_EMBEDDER_SOURCE;
  if (!source) return;
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
 *
 * `options.indexName` targets a non-default Meilisearch index (the
 * blue/green reindex writes into the staging index while the live one
 * keeps serving). When set, a dedicated adapter is used so the shared
 * adapter singleton — which always writes to the live index name — is
 * untouched.
 */
export async function syncListingsToSearchIndex(
  dbPool: Pool,
  options?: { indexName?: string },
): Promise<{ synced: number; failed: number; total: number }> {
  const adapter: SearchAdapter = options?.indexName
    ? new MeilisearchSearchAdapter({ indexName: options.indexName })
    : createSearchAdapter();
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

// ── Blue/green versioned reindex (R27) ──────────────────────────────────────
// A full reindex used to upsert in place — a bad deploy or partial sync
// corrupted the live index while it was serving. The blue/green flow builds
// a versioned staging index (`<live>_v<epochMs>`), syncs into it, verifies
// document counts against the source table, and only then repoints the live
// index name with `swapIndexes` — Meilisearch's atomic primitive. The old
// index is never deleted before the new one is verified: after the swap the
// versioned name holds the previous live snapshot, so rollback is a second
// swap. Staging indexes older than the keep-last-N window are pruned.

/** How many `<live>_v<ts>` indexes to retain after a successful swap. */
const VERSIONED_INDEX_KEEP_LAST = 2;
/** Max time to wait for the staged index to finish processing its tasks. */
const INDEX_SETTLE_TIMEOUT_MS = 120_000;
/** Consecutive stable "not indexing" stats reads required before verify. */
const INDEX_SETTLE_STABLE_POLLS = 2;
/**
 * Tolerance for source-vs-staged document count drift: listings created or
 * deactivated while the sync reads batches legitimately shift the count.
 * Corruption is a wholesale gap, not a handful of rows.
 */
const SOURCE_COUNT_DRIFT_RATIO = 0.05;
const SOURCE_COUNT_DRIFT_FLOOR = 5;
/** Cap on post-swap catch-up rows changed during the sync window. */
const CATCH_UP_BATCH_LIMIT = 1000;

export interface BlueGreenReindexResult {
  ok: boolean;
  /**
   * 'blue_green' — a versioned staging index was built and the live name
   *   atomically repointed via swapIndexes.
   * 'in_place' — no shared search backend is configured (no MEILISEARCH_URL),
   *   so the legacy process-local sync ran instead. `swapped` stays false;
   *   there is nothing to swap on the in-memory index.
   */
  mode: 'blue_green' | 'in_place';
  /** True only when the live index name was atomically repointed. */
  swapped: boolean;
  /** Index name queries resolve to (MEILISEARCH_INDEX, default 'listings'). */
  liveIndex: string;
  /** Versioned staging index built by this run, when one was created. */
  stagedIndex?: string;
  synced: number;
  failed: number;
  total: number;
  /** Active listings counted in PostgreSQL just before the sync. */
  sourceCount?: number;
  /** Documents the staged index reported after indexing settled. */
  stagedDocuments?: number;
  /** True when the staged index passed every verification check. */
  verified?: boolean;
  /** Present when verification failed — the live index was left untouched. */
  verificationError?: string;
  /** Rows re-indexed/removed after the swap to close the sync window. */
  catchUpSynced?: number;
  /** Older `<live>_v*` indexes deleted by the keep-last-N prune. */
  prunedIndexes?: string[];
  /** Fatal error message when the reindex itself failed. */
  error?: string;
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function countActiveListings(dbPool: Pool): Promise<number> {
  const result = await dbPool.query<{ active_count: number | string }>(
    `SELECT COUNT(*)::int AS active_count FROM listings WHERE status = 'active'`,
  );
  return Number(result.rows[0]?.active_count ?? 0);
}

/**
 * Poll the staged index stats until Meilisearch reports `isIndexing: false`
 * with a stable document count across consecutive reads. A failed read here
 * only ever produces a false negative (verification fails, the live index
 * keeps serving) — never a premature swap.
 */
async function waitForIndexSettled(
  client: MeiliClient,
  indexUid: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<{ documents: number; settled: boolean }> {
  const deadline = Date.now() + timeoutMs;
  let previousCount = -1;
  let stableReads = 0;
  let documents = 0;
  while (Date.now() < deadline) {
    const stats = await client.index(indexUid).getStats();
    documents = stats.numberOfDocuments;
    if (!stats.isIndexing && stats.numberOfDocuments === previousCount) {
      stableReads += 1;
      if (stableReads >= INDEX_SETTLE_STABLE_POLLS) {
        return { documents, settled: true };
      }
    } else {
      stableReads = 0;
    }
    previousCount = stats.numberOfDocuments;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { documents, settled: false };
}

/**
 * Sanity-check the staged index before it can take traffic. Returns a
 * failure description, or null when the staged index is verified.
 */
function verifyStagedIndex(args: {
  synced: number;
  failed: number;
  stagedDocuments: number;
  sourceCount: number;
}): string | null {
  const { synced, failed, stagedDocuments, sourceCount } = args;
  if (failed > 0) {
    return `${failed} listing document(s) failed to index into the staged index`;
  }
  if (stagedDocuments !== synced) {
    return (
      `staged index holds ${stagedDocuments} documents but ${synced} ` +
      'were synced — staged documents are missing'
    );
  }
  if (stagedDocuments === 0 && sourceCount > 0) {
    return (
      `staged index is empty but the source table holds ${sourceCount} ` +
      'active listings — swapping would empty the live index'
    );
  }
  const drift = Math.max(
    SOURCE_COUNT_DRIFT_FLOOR,
    Math.ceil(sourceCount * SOURCE_COUNT_DRIFT_RATIO),
  );
  if (Math.abs(stagedDocuments - sourceCount) > drift) {
    return (
      `staged index holds ${stagedDocuments} documents vs ${sourceCount} ` +
      `active source rows — drift exceeds the ${drift}-row allowance`
    );
  }
  return null;
}

/**
 * When an embedder source is configured, the staged index must actually
 * carry an embedder before it can take traffic — otherwise the swap would
 * silently break semantic/hybrid search on the live index.
 */
async function stagedEmbedderNames(
  url: string,
  apiKey: string | undefined,
  indexUid: string,
): Promise<string[] | null> {
  const response = await fetch(`${url}/indexes/${indexUid}/settings/embedders`, {
    headers: { Authorization: `Bearer ${apiKey ?? ''}` },
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as Record<string, unknown>;
  return Object.keys(body);
}

/**
 * `swapIndexes` requires both uids to exist. On a fresh Meilisearch the live
 * index may not exist yet — create it empty (with the standard settings) so
 * the swap still repoints the name atomically.
 */
async function ensureLiveIndexExists(
  client: MeiliClient,
  liveIndex: string,
  url: string,
  apiKey: string | undefined,
  intervalMs: number,
): Promise<void> {
  const existing = await client.getIndexes({ limit: 1000 });
  if (existing.results.some((index) => index.uid === liveIndex)) {
    return;
  }
  const task = await client.createIndex(liveIndex, { primaryKey: 'id' });
  await pollMeiliTask(url, apiKey, task.taskUid, 30_000, intervalMs);
  await configureSearchIndex(liveIndex);
  logger.info({ index: liveIndex }, 'Created live search index ahead of first swap');
}

/**
 * Re-apply writes that landed in PostgreSQL while the staged sync was
 * reading batches. Incremental writes during that window hit the pre-swap
 * live index, so they are replayed here: active rows are indexed, anything
 * no longer active is removed. Rows hard-deleted mid-window leave no row to
 * replay — that residual drift is repaired by the next incremental remove
 * or the next reindex.
 */
async function syncListingsChangedSince(
  dbPool: Pool,
  since: string,
): Promise<number> {
  const adapter = createSearchAdapter();
  let touched = 0;
  try {
    const result = await dbPool.query<ListingRow>(
      `
        SELECT
          id, title, description, price_gbp::text, status,
          category, brand, size, condition, created_at::text
        FROM listings
        WHERE updated_at > $1
        ORDER BY updated_at, id
        LIMIT $2
      `,
      [since, CATCH_UP_BATCH_LIMIT],
    );
    for (const row of result.rows) {
      try {
        if (row.status === 'active') {
          await adapter.index(rowToDocument(row));
        } else {
          await adapter.remove(row.id);
        }
        touched += 1;
      } catch (error) {
        logger.error(
          { err: error, listingId: row.id },
          'Failed to replay listing write during post-swap catch-up',
        );
      }
    }
    if (result.rowCount === CATCH_UP_BATCH_LIMIT) {
      logger.warn(
        { since, limit: CATCH_UP_BATCH_LIMIT },
        'Post-swap catch-up hit its row cap — residual drift repairs on the next sync',
      );
    }
  } catch (error) {
    // The swap already succeeded — a failed catch-up is drift, not
    // corruption. Log loudly; the next sync or incremental write repairs.
    logger.error({ err: error, since }, 'Post-swap catch-up query failed');
  }
  return touched;
}

/**
 * Delete `<live>_v<ts>` indexes beyond the keep-last-N window. The newest
 * versioned index is the just-swapped-out live snapshot (the rollback
 * point), so it is always retained. Pruning failures are logged but never
 * fail the reindex — leftover versions are reclaimed by the next run.
 */
async function pruneVersionedIndexes(
  client: MeiliClient,
  liveIndex: string,
  keep: number,
  url: string,
  apiKey: string | undefined,
  intervalMs: number,
): Promise<string[]> {
  const pruned: string[] = [];
  const versionPattern = new RegExp(`^${escapeRegExp(liveIndex)}_v(\\d+)$`);
  try {
    const list = await client.getIndexes({ limit: 1000 });
    const versions = list.results
      .map((index) => index.uid)
      .filter((uid) => versionPattern.test(uid))
      .sort(
        (a, b) =>
          Number(versionPattern.exec(b)![1]) - Number(versionPattern.exec(a)![1]),
      );
    for (const uid of versions.slice(keep)) {
      try {
        const task = await client.deleteIndex(uid);
        await pollMeiliTask(url, apiKey, task.taskUid, 30_000, intervalMs);
        pruned.push(uid);
      } catch (error) {
        logger.error(
          { err: error, index: uid },
          'Failed to prune old search index version',
        );
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to list search indexes for pruning');
  }
  return pruned;
}

/**
 * Blue/green full reindex: build `<live>_v<epochMs>` as a staging index,
 * sync all active listings into it, verify its document count against the
 * source table, then atomically repoint the live index name via
 * `client.swapIndexes` — the only safe repoint primitive (never
 * delete-then-recreate, which leaves a window where search serves nothing).
 *
 * Failure honesty: any verification or swap failure returns `ok: false`
 * with the reason and leaves the previous live index serving — there is no
 * path where a corrupt staged index silently goes live.
 *
 * When no MEILISEARCH_URL is configured the function runs the legacy
 * in-place sync against the process-local index and reports
 * `mode: 'in_place'` — there is no shared index to version in that
 * deployment.
 */
export async function reindexListingsBlueGreen(
  dbPool: Pool,
  options?: {
    pollIntervalMs?: number;
    settleTimeoutMs?: number;
    keepVersions?: number;
  },
): Promise<BlueGreenReindexResult> {
  const liveIndex = MEILISEARCH_INDEX_NAME;
  const meiliUrl = process.env.MEILISEARCH_URL;
  const apiKey = process.env.MEILISEARCH_KEY;
  const pollIntervalMs = options?.pollIntervalMs ?? 500;
  const settleTimeoutMs = options?.settleTimeoutMs ?? INDEX_SETTLE_TIMEOUT_MS;
  const keepVersions = options?.keepVersions ?? VERSIONED_INDEX_KEEP_LAST;

  if (!meiliUrl) {
    await configureSearchIndex();
    const result = await syncListingsToSearchIndex(dbPool);
    return {
      ok: true,
      mode: 'in_place',
      swapped: false,
      liveIndex,
      ...result,
    };
  }

  const client = await loadMeiliClient();
  if (!client) {
    return {
      ok: false,
      mode: 'blue_green',
      swapped: false,
      liveIndex,
      synced: 0,
      failed: 0,
      total: 0,
      error:
        'meilisearch_client_unavailable — MEILISEARCH_URL is set but the client could not be initialised',
    };
  }

  const stagedIndex = `${liveIndex}_v${Date.now()}`;
  let synced = 0;
  let failed = 0;
  let sourceCount: number | undefined;
  let stagedDocuments: number | undefined;

  try {
    // 1. Build the staging index under a versioned name.
    const createTask = await client.createIndex(stagedIndex, {
      primaryKey: 'id',
    });
    await pollMeiliTask(meiliUrl, apiKey, createTask.taskUid, 30_000, pollIntervalMs);

    // 2. Apply the identical settings the live index gets at startup.
    await configureSearchIndex(stagedIndex);

    // 3. Watermark (database clock) + source count, then sync into staged.
    const nowResult = await dbPool.query<{ now: string }>(
      'SELECT NOW()::text AS now',
    );
    const syncStartedAt = nowResult.rows[0]?.now ?? new Date().toISOString();
    sourceCount = await countActiveListings(dbPool);
    const sync = await syncListingsToSearchIndex(dbPool, {
      indexName: stagedIndex,
    });
    synced = sync.synced;
    failed = sync.failed;

    // 4. Wait for the staged index to finish indexing, then verify.
    const settled = await waitForIndexSettled(
      client,
      stagedIndex,
      settleTimeoutMs,
      pollIntervalMs,
    );
    stagedDocuments = settled.documents;

    let verificationError: string | null = settled.settled
      ? verifyStagedIndex({ synced, failed, stagedDocuments, sourceCount })
      : `staged index did not finish indexing within ${settleTimeoutMs}ms`;

    if (!verificationError && process.env.MEILISEARCH_EMBEDDER_SOURCE) {
      const embedderNames = await stagedEmbedderNames(meiliUrl, apiKey, stagedIndex);
      if (embedderNames === null) {
        verificationError =
          'embedder settings could not be read back from the staged index';
      } else if (embedderNames.length === 0) {
        verificationError =
          'MEILISEARCH_EMBEDDER_SOURCE is set but the staged index has no embedders configured';
      }
    }

    if (verificationError) {
      logger.error(
        {
          stagedIndex,
          liveIndex,
          synced,
          failed,
          stagedDocuments,
          sourceCount,
          verificationError,
        },
        'Blue/green reindex verification failed — live index left untouched',
      );
      return {
        ok: false,
        mode: 'blue_green',
        swapped: false,
        liveIndex,
        stagedIndex,
        synced,
        failed,
        total: synced + failed,
        sourceCount,
        stagedDocuments,
        verified: false,
        verificationError,
      };
    }

    // 5. Swap requires both uids — create the live index on fresh deploys.
    await ensureLiveIndexExists(client, liveIndex, meiliUrl, apiKey, pollIntervalMs);

    // 6. Atomic repoint: 'listings' now serves the staged index; the
    //    staged name holds the previous live snapshot (rollback = swap back).
    const swapTask = await client.swapIndexes([
      { indexes: [liveIndex, stagedIndex] },
    ]);
    await pollMeiliTask(meiliUrl, apiKey, swapTask.taskUid, 30_000, pollIntervalMs);

    // 7. Replay rows that changed during the sync window so incremental
    //    writes landing on the pre-swap live index are not lost.
    const catchUpSynced = await syncListingsChangedSince(dbPool, syncStartedAt);

    // 8. Keep the last N versioned indexes (the newest is the just-swapped
    //    live snapshot); delete anything older.
    const prunedIndexes = await pruneVersionedIndexes(
      client,
      liveIndex,
      keepVersions,
      meiliUrl,
      apiKey,
      pollIntervalMs,
    );

    logger.info(
      {
        liveIndex,
        stagedIndex,
        synced,
        stagedDocuments,
        sourceCount,
        catchUpSynced,
        prunedIndexes,
      },
      'Blue/green reindex complete — live index swapped atomically',
    );

    return {
      ok: true,
      mode: 'blue_green',
      swapped: true,
      liveIndex,
      stagedIndex,
      synced,
      failed,
      total: synced + failed,
      sourceCount,
      stagedDocuments,
      verified: true,
      catchUpSynced,
      prunedIndexes,
    };
  } catch (error) {
    logger.error(
      { err: error, stagedIndex, liveIndex },
      'Blue/green reindex failed — live index left untouched',
    );
    return {
      ok: false,
      mode: 'blue_green',
      swapped: false,
      liveIndex,
      stagedIndex,
      synced,
      failed,
      total: synced + failed,
      sourceCount,
      stagedDocuments,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
