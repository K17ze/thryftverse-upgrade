import { randomUUID } from 'node:crypto';
import type { Pool, QueryResult } from 'pg';
import { logger } from './logger.js';
import {
  observeSearchIndexLag,
  recordSearchReindexLease,
  recordSearchSync,
} from './metrics.js';
import {
  createSearchAdapter,
  indexIntoLocalFallback,
  MeilisearchSearchAdapter,
  type ListingDocument,
  type SearchAdapter,
  type SearchIndexWriteResult,
} from './searchAdapter.js';
import {
  MEILISEARCH_INDEX_NAME,
  configureMeilisearchLocalizedAttributes,
  configureMeilisearchSynonyms,
  configureMeilisearchTypoTolerance,
  loadMeiliClient,
  meilisearchApiKey,
  pollMeilisearchTask,
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
  updated_at?: string;
}

interface MeiliTask {
  taskUid: number;
}

/** Extract the taskUid from a Meilisearch settings-update response. */
function taskUidOf(result: unknown): number | null {
  const uid = (result as { taskUid?: unknown } | null)?.taskUid;
  return typeof uid === 'number' ? uid : null;
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
 *
 * `options.awaitTasks` makes settings updates part of swap acceptance:
 * every `update*` call's task is polled to completion and a failed/timed-out
 * task THROWS instead of being swallowed — the blue/green path relies on
 * this so a staged index with unapplied settings can never take traffic.
 * Callers that omit it keep the fire-and-forget startup semantics (errors
 * are logged and swallowed).
 */
export async function configureSearchIndex(
  indexName: string = MEILISEARCH_INDEX_NAME,
  options?: { awaitTasks?: boolean; pollIntervalMs?: number },
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
    const settingsTasks: number[] = [];
    const track = (result: unknown): void => {
      const uid = taskUidOf(result);
      if (uid !== null) {
        settingsTasks.push(uid);
      }
    };
    track(await index.updateSearchableAttributes([
      'title',
      'brand',
      'description',
      'category',
      'condition',
    ]));
    track(await index.updateFilterableAttributes([
      'category',
      'condition',
      'price',
      'status',
      'sizes',
    ]));
    track(await index.updateSortableAttributes([
      'price',
      'createdAt',
    ]));
    track(await index.updateRankingRules([
      'words',
      'typo',
      'proximity',
      'attribute',
      'sort',
      'exactness',
    ]));
    if (options?.awaitTasks) {
      for (const taskUid of settingsTasks) {
        await pollMeilisearchTask(
          meiliUrl,
          meilisearchApiKey(),
          taskUid,
          30_000,
          options.pollIntervalMs ?? 500,
        );
      }
    }
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
    // In awaitTasks mode they propagate failures and poll their own update
    // task, so swap acceptance covers every staged settings write.
    await configureMeilisearchTypoTolerance(indexName, options);
    await configureMeilisearchSynonyms(indexName, options);
    await configureMeilisearchLocalizedAttributes(indexName, options);

    await configureEmbedder(indexName);
  } catch (error) {
    if (options?.awaitTasks) {
      throw error;
    }
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
  const apiKey = meilisearchApiKey();
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
  await pollMeilisearchTask(url, apiKey, task.taskUid);
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
          category, brand, size, condition, created_at::text,
          updated_at::text
        FROM listings
        WHERE id = $1
        LIMIT 1
      `,
      [listingId],
    );

    if (!result.rowCount) {
      const write = await adapter.remove(listingId);
      recordSearchSync('remove', 'ok', write.outcome === 'remote' ? 'submitted' : 'fallback');
      confirmIndexWrite({ op: 'remove', adapter, write, listingId });
      return;
    }

    const row = result.rows[0];
    // The index corpus is exactly `status = 'active'` — the same predicate
    // the full sync (syncListingsToSearchIndex) and fallback priming
    // (syncListingsToLocalFallback) use. Anything else — draft, paused,
    // risk_pending, sold, deleted — is EVICTED, not indexed: a non-active
    // document in the index would diverge from the corpus the serving
    // layer's status='active' re-check assumes.
    if (row.status !== 'active') {
      const write = await adapter.remove(listingId);
      recordSearchSync('remove', 'ok', write.outcome === 'remote' ? 'submitted' : 'fallback');
      confirmIndexWrite({ op: 'remove', adapter, write, listingId });
      return;
    }

    const write = await adapter.index(rowToDocument(row));
    const backend = adapter.retrievalInfo().backend;
    // Audit §4.7: adapter.index() resolving means the write was SUBMITTED
    // (Meilisearch enqueued a task) or FELL BACK to the process-local index
    // — neither is "the document is searchable". Record the honest outcome;
    // confirmIndexWrite separately records outcome="completed" (and the true
    // visibility lag) once the task is confirmed applied.
    const submittedOutcome = write.outcome === 'remote' ? 'submitted' : 'fallback';
    recordSearchSync('index', 'ok', submittedOutcome);
    if (row.updated_at) {
      const lagMs = Date.now() - new Date(row.updated_at).getTime();
      observeSearchIndexLag(backend, lagMs / 1000, submittedOutcome);
    }
    if (write.outcome === 'remote' && write.taskUid !== undefined) {
      logger.debug(
        { listingId, taskUid: write.taskUid, backend },
        'search.index.write_submitted — Meilisearch task enqueued (not yet visible)',
      );
    }
    confirmIndexWrite({ op: 'index', adapter, write, listingId, updatedAt: row.updated_at });
  } catch (error) {
    recordSearchSync('index', 'error', 'failed');
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

/**
 * Prime the process-local fallback index from PostgreSQL while the shared
 * backend is healthy. The Meilisearch adapter mirrors every successful
 * write into the fallback, but a process that boots healthy then loses the
 * backend mid-session would otherwise serve only post-boot writes. This
 * pass pages the same `status = 'active'` corpus as the full sync — same
 * visibility predicate, so the fallback can never expose a listing the
 * primary index would not. Returns counts; never throws.
 */
export async function syncListingsToLocalFallback(
  dbPool: Pool,
): Promise<{ synced: number; failed: number }> {
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
          await indexIntoLocalFallback(rowToDocument(row));
          synced += 1;
        } catch {
          failed += 1;
        }
      }
      lastId = batch.rows[batch.rows.length - 1].id;
      if (batch.rowCount < BATCH_SIZE) {
        break;
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to prime process-local search fallback');
  }
  logger.info({ synced, failed }, 'Process-local search fallback primed');
  return { synced, failed };
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
/** Rows per keyset page during post-swap catch-up replay. */
const CATCH_UP_BATCH_SIZE = 500;
/**
 * Hard bound on catch-up pages (500 × 500 = 250k changed rows per sync
 * window). Hitting it means the change window is pathologically large; the
 * run reports `catchUpComplete: false` and logs an error instead of the old
 * behaviour — a silent 1000-row cap that left the freshly-swapped index
 * incomplete (audit: catch-up must converge, not truncate).
 */
const CATCH_UP_MAX_BATCHES = 500;
/**
 * Durable fenced lease serialising search reindex runs across processes
 * (admin route + hourly worker + manual script). Row-backed — correct
 * through PgBouncer TRANSACTION pooling, unlike the previous session
 * advisory lock (audit S2): every lease statement below is a single atomic
 * transaction, so no server-session affinity is ever required. A crashed
 * holder's lease self-recovers via `expires_at`; the monotonically
 * increasing `fence` makes takeovers detectable so a stale holder can
 * neither renew nor release a lease it no longer owns.
 * Table created by migration 338_search_reindex_lease.sql.
 */
const REINDEX_LEASE_NAME = 'search_reindex_global';
const REINDEX_LEASE_TTL_MS = 5 * 60_000;
const REINDEX_LEASE_HEARTBEAT_MS = 30_000;

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
  /**
   * True when the swap task's outcome could not be confirmed — the swap
   * was enqueued server-side and may still have repointed the live name
   * even though `swapped` reports false. Callers must treat this as
   * "state unknown", not "swap did not happen".
   */
  swapUndetermined?: boolean;
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
  /**
   * False when the post-swap catch-up stopped before walking the full change
   * window (query failure or the batch safety bound). Absent/true means the
   * replay converged; false means residual drift remains — an honest signal,
   * never a silent truncation.
   */
  catchUpComplete?: boolean;
  /** Older `<live>_v*` indexes deleted by the keep-last-N prune. */
  prunedIndexes?: string[];
  /** Fatal error message when the reindex itself failed. */
  error?: string;
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Durable fenced reindex lease ────────────────────────────────────────────
// Correctness under PgBouncer transaction pooling (audit S2): every statement
// below is a single self-contained query — under transaction pooling each one
// is its own transaction on whichever backend PgBouncer assigns, so the lease
// never depends on server-session affinity. Mutual exclusion comes from the
// PRIMARY KEY + the conditional ON CONFLICT update; expiry comes from
// `expires_at`; fencing from the monotonically increasing `fence` counter.

/**
 * Atomically acquire the global reindex lease: insert the row, or take it
 * over only when the existing lease has expired or is already ours (a retried
 * acquire by the same holder token). Returns the fencing token on success;
 * `acquired: false` means a live lease is held by someone else.
 */
async function acquireReindexLease(
  dbPool: Pool,
  holder: string,
  ttlMs: number,
): Promise<{ acquired: true; fence: number } | { acquired: false }> {
  const result = await dbPool.query<{ fence: string | number }>(
    `
      -- clock_timestamp() (wall clock), not now() (transaction start): lease
      -- boundaries must stay correct even if a caller ever wraps this
      -- statement in a longer transaction.
      INSERT INTO search_reindex_lease (name, holder, fence, acquired_at, expires_at)
      VALUES ($1, $2, 1, clock_timestamp(), clock_timestamp() + ($3::double precision * INTERVAL '1 millisecond'))
      ON CONFLICT (name) DO UPDATE
        SET holder = EXCLUDED.holder,
            fence = search_reindex_lease.fence + 1,
            acquired_at = clock_timestamp(),
            expires_at = clock_timestamp() + ($3::double precision * INTERVAL '1 millisecond')
        WHERE search_reindex_lease.expires_at < clock_timestamp()
           OR search_reindex_lease.holder = $2
      RETURNING fence
    `,
    [REINDEX_LEASE_NAME, holder, ttlMs],
  );
  if (!result.rowCount) {
    return { acquired: false };
  }
  return { acquired: true, fence: Number(result.rows[0].fence) };
}

/**
 * Renew the lease's expiry — only while this process still owns the exact
 * holder+fence it acquired. `false` means the row is gone or has been taken
 * over by a newer holder after our lease expired: the lease is LOST and the
 * run must not reach the swap.
 */
async function renewReindexLease(
  dbPool: Pool,
  holder: string,
  fence: number,
  ttlMs: number,
): Promise<boolean> {
  const result = await dbPool.query(
    `
      UPDATE search_reindex_lease
         SET expires_at = clock_timestamp() + ($4::double precision * INTERVAL '1 millisecond')
       WHERE name = $1 AND holder = $2 AND fence = $3
    `,
    [REINDEX_LEASE_NAME, holder, fence, ttlMs],
  );
  return result.rowCount === 1;
}

/**
 * Honestly release the lease — the holder+fence guard makes the DELETE a
 * no-op when the lease already expired and changed hands, so a stale holder
 * can never delete someone else's live lease. `false` = row absent or owned
 * by a newer holder (already recovered via expiry).
 */
async function releaseReindexLease(
  dbPool: Pool,
  holder: string,
  fence: number,
): Promise<boolean> {
  const result = await dbPool.query(
    `DELETE FROM search_reindex_lease WHERE name = $1 AND holder = $2 AND fence = $3`,
    [REINDEX_LEASE_NAME, holder, fence],
  );
  return result.rowCount === 1;
}

/**
 * Read a Meilisearch task's current status once. Returns the status string
 * ('enqueued' | 'processing' | 'succeeded' | 'failed' | 'canceled') or null
 * when the task endpoint could not be reached — never throws.
 */
async function fetchMeiliTaskStatus(
  url: string,
  apiKey: string | undefined,
  taskUid: number,
): Promise<string | null> {
  try {
    const response = await fetch(`${url}/tasks/${taskUid}`, {
      headers: { Authorization: `Bearer ${apiKey ?? ''}` },
    });
    if (!response.ok) {
      return null;
    }
    const task = (await response.json()) as { status?: unknown };
    return typeof task.status === 'string' ? task.status : null;
  } catch {
    return null;
  }
}

/**
 * Bounded wait when confirming a submitted index task. Confirmation is
 * detached from the write path (fire-and-forget telemetry), so this budget
 * never adds latency to a request — it only bounds how long we poll before
 * leaving the outcome at 'submitted'.
 */
const INDEX_TASK_CONFIRM_TIMEOUT_MS = 10_000;
const INDEX_TASK_CONFIRM_INTERVAL_MS = 250;

/**
 * Confirm that a remotely-submitted index write was actually APPLIED
 * (audit §4.7). Meilisearch resolves `addDocuments`/`deleteDocument` at task
 * submission; this polls the task and only then records outcome="completed"
 * plus the true visibility lag on thryftverse_search_index_lag_seconds. A
 * definitively failed/canceled task records outcome="failed"; a task that is
 * still pending or unreachable when the budget ends stays 'submitted' — the
 * stalled-queue alert (submitted ≫ completed) then carries the signal.
 *
 * Detached by design: callers fire-and-forget so confirmation never blocks
 * a request path. Never throws.
 */
function confirmIndexWrite(args: {
  op: 'index' | 'remove';
  adapter: SearchAdapter;
  write: SearchIndexWriteResult;
  listingId: string;
  updatedAt?: string;
}): void {
  const { op, adapter, write, listingId, updatedAt } = args;
  const taskUid = write.taskUid;
  if (write.outcome !== 'remote' || taskUid === undefined) {
    return;
  }
  const url = process.env.MEILISEARCH_URL;
  if (!url) {
    return;
  }
  const apiKey = meilisearchApiKey();
  const backend = adapter.retrievalInfo().backend;
  const observeCompletedLag = (): void => {
    if (!updatedAt) return;
    const lagMs = Date.now() - new Date(updatedAt).getTime();
    observeSearchIndexLag(backend, lagMs / 1000, 'completed');
  };
  void (async () => {
    try {
      await pollMeilisearchTask(
        url,
        apiKey,
        taskUid,
        INDEX_TASK_CONFIRM_TIMEOUT_MS,
        INDEX_TASK_CONFIRM_INTERVAL_MS,
      );
      recordSearchSync(op, 'ok', 'completed');
      observeCompletedLag();
    } catch (pollError) {
      // A poll failure is NOT proof the task failed — re-read the task once
      // so a timed-out poll on an eventually-succeeded task still records
      // 'completed', and only a terminal state records 'failed'.
      const status = await fetchMeiliTaskStatus(url, apiKey, taskUid);
      if (status === 'succeeded') {
        recordSearchSync(op, 'ok', 'completed');
        observeCompletedLag();
      } else if (status === 'failed' || status === 'canceled') {
        recordSearchSync(op, 'error', 'failed');
        logger.warn(
          { listingId, taskUid, status },
          'search.index.write_failed — Meilisearch task ended without applying the write',
        );
      } else {
        logger.warn(
          { err: pollError, listingId, taskUid, status },
          'search.index.write_unconfirmed — task still pending or unreachable; submitted outcome stands',
        );
      }
    }
  })().catch((error) => {
    logger.warn(
      { err: error, listingId, taskUid },
      'search.index.confirm_failed — task confirmation errored; submitted outcome stands',
    );
  });
}

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
  await pollMeilisearchTask(url, apiKey, task.taskUid, 30_000, intervalMs);
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
export interface CatchUpSyncResult {
  /** Rows re-indexed/removed during the replay. */
  touched: number;
  /**
   * True when pagination walked the change window to convergence (a short
   * final page). False means the replay stopped early — query failure or the
   * CATCH_UP_MAX_BATCHES safety bound — and residual drift remains for the
   * next sync to repair.
   */
  complete: boolean;
}

/**
 * Exported for focused tests — internal to the blue/green flow.
 */
export async function syncListingsChangedSince(
  dbPool: Pool,
  since: string,
): Promise<CatchUpSyncResult> {
  const adapter = createSearchAdapter();
  let touched = 0;
  let batches = 0;
  // Keyset pagination over (updated_at, id): the cursor starts at the sync
  // watermark and advances to each page's last row. Rows are ordered by
  // (updated_at, id) so `>` on the pair is exactly "rows not yet replayed" —
  // a large change window is walked in bounded batches until a short page
  // signals convergence, rather than silently capped at one query.
  let cursorUpdatedAt: string = since;
  let cursorId = '';
  try {
    while (true) {
      const result = await dbPool.query<ListingRow>(
        `
          SELECT
            id, title, description, price_gbp::text, status,
            category, brand, size, condition, created_at::text,
            updated_at::text
          FROM listings
          WHERE (updated_at, id) > ($1::timestamptz, $2::text)
          ORDER BY updated_at, id
          LIMIT $3
        `,
        [cursorUpdatedAt, cursorId, CATCH_UP_BATCH_SIZE],
      );
      if (!result.rowCount || result.rowCount === 0) {
        return { touched, complete: true };
      }
      batches += 1;
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
      const last = result.rows[result.rows.length - 1];
      cursorUpdatedAt = last.updated_at ?? cursorUpdatedAt;
      cursorId = last.id;
      if (result.rowCount < CATCH_UP_BATCH_SIZE) {
        return { touched, complete: true };
      }
      logger.info(
        { since, batches, touched },
        'Post-swap catch-up page complete — continuing through change window',
      );
      if (batches >= CATCH_UP_MAX_BATCHES) {
        logger.error(
          { since, batches, touched, maxBatches: CATCH_UP_MAX_BATCHES },
          'Post-swap catch-up hit its batch safety bound — the change window did NOT converge; residual drift repairs on the next sync',
        );
        return { touched, complete: false };
      }
    }
  } catch (error) {
    // The swap already succeeded — a failed catch-up is drift, not
    // corruption. Log loudly; the next sync or incremental write repairs.
    logger.error({ err: error, since, batches, touched }, 'Post-swap catch-up query failed');
    return { touched, complete: false };
  }
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
        await pollMeilisearchTask(url, apiKey, task.taskUid, 30_000, intervalMs);
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
 *
 * Concurrency: a durable fenced lease (search_reindex_lease, migration 338)
 * serialises every caller — the admin POST /search/reindex route, the hourly
 * BullMQ worker job, and any manual script all land here, and two concurrent
 * blue/green runs would swap-stomp each other (the loser's staged index could
 * repoint the live name after the winner's). The lease is a plain table row
 * mutated by single atomic statements, so it is correct through PgBouncer
 * TRANSACTION pooling — unlike session advisory locks, which PgBouncer
 * lists as incompatible with that mode (audit S2). A crashed holder's lease
 * self-recovers via expires_at; heartbeats keep a healthy holder's lease
 * alive, and the pre-swap freshness check aborts any run whose lease has
 * lapsed or been taken over before it can repoint the live index.
 */
export async function reindexListingsBlueGreen(
  dbPool: Pool,
  options?: {
    pollIntervalMs?: number;
    settleTimeoutMs?: number;
    keepVersions?: number;
    /** Lease TTL; renewed by heartbeat while the run is alive. */
    leaseTtlMs?: number;
    /** Renewal cadence — must stay well below leaseTtlMs. */
    leaseHeartbeatMs?: number;
  },
): Promise<BlueGreenReindexResult> {
  const liveIndex = MEILISEARCH_INDEX_NAME;
  const meiliUrl = process.env.MEILISEARCH_URL;
  const apiKey = meilisearchApiKey();
  const pollIntervalMs = options?.pollIntervalMs ?? 500;
  const settleTimeoutMs = options?.settleTimeoutMs ?? INDEX_SETTLE_TIMEOUT_MS;
  const keepVersions = options?.keepVersions ?? VERSIONED_INDEX_KEEP_LAST;
  const leaseTtlMs = options?.leaseTtlMs ?? REINDEX_LEASE_TTL_MS;
  const leaseHeartbeatMs = Math.min(
    options?.leaseHeartbeatMs ?? REINDEX_LEASE_HEARTBEAT_MS,
    // A heartbeat at/above the TTL can never keep the lease alive.
    Math.floor(leaseTtlMs / 2),
  );

  const failedResult = (error: string): BlueGreenReindexResult => ({
    ok: false,
    mode: meiliUrl ? 'blue_green' : 'in_place',
    swapped: false,
    liveIndex,
    synced: 0,
    failed: 0,
    total: 0,
    error,
  });

  // Acquire the cross-process lease with one atomic statement — under
  // transaction pooling the query is its own transaction, so no session
  // affinity is needed. holder is unique per ATTEMPT (pid + uuid) so a
  // contended acquire can never be mistaken for our own row. Acquisition
  // failure skips the run honestly — never proceed unprotected.
  const holder = `pid${process.pid}-${randomUUID()}`;
  let fence: number;
  try {
    const acquisition = await acquireReindexLease(dbPool, holder, leaseTtlMs);
    if (!acquisition.acquired) {
      recordSearchReindexLease('contended');
      logger.info(
        { holder, lease: REINDEX_LEASE_NAME },
        'Search reindex skipped — a live lease is held by another run',
      );
      return failedResult(
        'reindex_in_progress — another reindex holds the lease',
      );
    }
    fence = acquisition.fence;
    recordSearchReindexLease('acquired');
  } catch (error) {
    recordSearchReindexLease('acquire_error');
    logger.error(
      { err: error, holder, lease: REINDEX_LEASE_NAME },
      'Search reindex lease acquisition failed — refusing to run unprotected',
    );
    return failedResult(
      'reindex_lock_unavailable — could not acquire the durable reindex lease (database error; is migration 338 applied?)',
    );
  }

  // Lease state shared with the heartbeat. `lastConfirmedAt` is the last
  // moment the database confirmed this holder+fence still owns the row —
  // the pre-swap check requires it to be inside the TTL, so a run whose
  // heartbeats have silently failed cannot swap after its lease expired.
  const leaseState = {
    fence,
    lastConfirmedAt: Date.now(),
    lost: false,
  };
  const heartbeat = setInterval(() => {
    void (async () => {
      try {
        const renewed = await renewReindexLease(
          dbPool,
          holder,
          leaseState.fence,
          leaseTtlMs,
        );
        if (renewed) {
          leaseState.lastConfirmedAt = Date.now();
        } else {
          // rowCount 0: the row is gone or owned by a newer holder — our
          // lease expired and was taken over. This is definitive loss.
          leaseState.lost = true;
          recordSearchReindexLease('heartbeat_lost');
          logger.error(
            { holder, fence: leaseState.fence, lease: REINDEX_LEASE_NAME },
            'Search reindex lease lost — another holder owns the row; the run will abort before swapping',
          );
        }
      } catch (error) {
        // Transient DB error: the lease MAY still be ours. Do not declare
        // loss — the pre-swap freshness check (lastConfirmedAt within TTL)
        // decides whether it is still safe to repoint the live index.
        logger.warn(
          { err: error, holder, fence: leaseState.fence },
          'Search reindex lease heartbeat failed — will retry on the next tick',
        );
      }
    })();
  }, leaseHeartbeatMs);
  heartbeat.unref?.();

  /**
   * Prove the lease is still ours before irreversible steps (the swap).
   * Two independent failure shapes abort the run: definitive loss (a
   * heartbeat saw the row owned by someone else) and unconfirmed ownership
   * (heartbeats have failed long enough that our expires_at may have
   * lapsed, letting a competitor legitimately take over).
   */
  const assertLeaseHeld = (): void => {
    if (leaseState.lost) {
      throw new Error(
        'reindex_lease_lost — the reindex lease was taken over by another holder; aborting before the swap',
      );
    }
    if (Date.now() - leaseState.lastConfirmedAt >= leaseTtlMs) {
      throw new Error(
        'reindex_lease_unconfirmed — lease renewal has not been confirmed within its TTL; aborting before the swap',
      );
    }
  };

  try {
    return await reindexListingsBlueGreenLocked(dbPool, {
      liveIndex,
      meiliUrl,
      apiKey,
      pollIntervalMs,
      settleTimeoutMs,
      keepVersions,
      assertLeaseHeld,
    });
  } finally {
    clearInterval(heartbeat);
    // Honest release: DELETE only lands while this holder+fence still owns
    // the row. A 0-row delete means the lease already expired and was taken
    // over — expiry is the recovery path, so this is a warning, not a retry.
    try {
      const released = await releaseReindexLease(dbPool, holder, leaseState.fence);
      if (released) {
        recordSearchReindexLease('released');
      } else {
        recordSearchReindexLease('release_missed');
        logger.warn(
          { holder, fence: leaseState.fence, lease: REINDEX_LEASE_NAME },
          'Search reindex lease release deleted no row — lease already expired or changed hands',
        );
      }
    } catch (error) {
      recordSearchReindexLease('release_error');
      logger.warn(
        { err: error, holder, fence: leaseState.fence },
        'Search reindex lease release failed — the row self-recovers at expiry',
      );
    }
  }
}

async function reindexListingsBlueGreenLocked(
  dbPool: Pool,
  ctx: {
    liveIndex: string;
    meiliUrl: string | undefined;
    apiKey: string | undefined;
    pollIntervalMs: number;
    settleTimeoutMs: number;
    keepVersions: number;
    /**
     * Throws when the durable reindex lease is no longer provably ours.
     * Called before every irreversible step so a run whose lease lapsed or
     * was taken over can never repoint the live index (audit S2).
     */
    assertLeaseHeld: () => void;
  },
): Promise<BlueGreenReindexResult> {
  const {
    liveIndex,
    meiliUrl,
    apiKey,
    pollIntervalMs,
    settleTimeoutMs,
    keepVersions,
    assertLeaseHeld,
  } = ctx;

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

  const stagedIndex = `${liveIndex}_v${Date.now()}`;
  let synced = 0;
  let failed = 0;
  let sourceCount: number | undefined;
  let stagedDocuments: number | undefined;

  try {
    // loadMeiliClient lives inside the result contract — a client-init
    // throw must produce BlueGreenReindexResult, not propagate.
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

    // 1. Build the staging index under a versioned name.
    const createTask = await client.createIndex(stagedIndex, {
      primaryKey: 'id',
    });
    await pollMeilisearchTask(meiliUrl, apiKey, createTask.taskUid, 30_000, pollIntervalMs);

    // 2. Apply the identical settings the live index gets at startup —
    //    awaitTasks makes every settings update part of swap acceptance:
    //    a failed or never-completing settings task throws here and the
    //    live index is left untouched rather than swapped onto a
    //    half-configured staged index.
    await configureSearchIndex(stagedIndex, {
      awaitTasks: true,
      pollIntervalMs,
    });

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
    //    The lease must still be provably ours — this is the irreversible
    //    step a stale/duplicate run must never reach.
    assertLeaseHeld();
    const swapTask = await client.swapIndexes([
      { indexes: [liveIndex, stagedIndex] },
    ]);
    try {
      await pollMeilisearchTask(meiliUrl, apiKey, swapTask.taskUid, 30_000, pollIntervalMs);
    } catch (swapPollError) {
      // The swap was already enqueued server-side — a poll timeout does NOT
      // mean it failed. Re-read the task once: 'succeeded' means the live
      // name repointed and the catch-up replay must still run; 'failed'
      // means it definitively did not; anything else leaves the outcome
      // undetermined and is reported as such (never assumed not-swapped).
      const swapStatus = await fetchMeiliTaskStatus(meiliUrl, apiKey, swapTask.taskUid);
      if (swapStatus !== 'succeeded') {
        logger.error(
          { err: swapPollError, stagedIndex, liveIndex, swapTaskUid: swapTask.taskUid, swapTaskStatus: swapStatus },
          'Blue/green swap could not be confirmed',
        );
        return {
          ok: false,
          mode: 'blue_green',
          swapped: false,
          swapUndetermined: swapStatus !== 'failed',
          liveIndex,
          stagedIndex,
          synced,
          failed,
          total: synced + failed,
          sourceCount,
          stagedDocuments,
          verified: true,
          error:
            swapStatus === 'failed'
              ? `swap task ${swapTask.taskUid} failed — live index left untouched`
              : `swap task ${swapTask.taskUid} outcome undetermined (${swapStatus ?? 'unreachable'}) — the live index may still repoint server-side`,
        };
      }
      // Swap confirmed server-side despite the poll failure — fall through
      // to the catch-up replay exactly as if the poll had returned.
      logger.warn(
        { err: swapPollError, stagedIndex, liveIndex, swapTaskUid: swapTask.taskUid },
        'Swap poll failed but the swap task succeeded — continuing post-swap steps',
      );
    }

    // 7. Replay rows that changed during the sync window so incremental
    //    writes landing on the pre-swap live index are not lost. Pages the
    //    full change window to convergence — a run that lost its lease does
    //    not replay into an index a competitor may have just swapped.
    assertLeaseHeld();
    const catchUp = await syncListingsChangedSince(dbPool, syncStartedAt);
    const catchUpSynced = catchUp.touched;
    if (!catchUp.complete) {
      logger.error(
        { stagedIndex, liveIndex, catchUpSynced },
        'Post-swap catch-up did NOT converge — residual drift repairs on the next sync',
      );
    }

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
      catchUpComplete: catchUp.complete,
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
