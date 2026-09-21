import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';

import { resetSearchAdapterCache } from '../lib/searchAdapter.js';
import { pollMeilisearchTask } from '../lib/meilisearchConfig.js';
import {
  configureSearchIndex,
  reindexListingsBlueGreen,
} from '../lib/searchSync.js';

// Contract for the reindex lease (audit design-risk): the admin
// POST /search/reindex route and the hourly search_indexing worker both
// land in reindexListingsBlueGreen — two concurrent blue/green runs would
// swap-stomp each other (the loser's staged index could repoint the live
// name after the winner's). A Postgres advisory lock serialises them; a
// second caller must fail fast with `reindex_in_progress`, and the lock
// must be released (and the pool client returned) on every outcome.
// Runs without a DB — the pool is faked.

const ENV_KEYS = [
  'NODE_ENV',
  'MEILISEARCH_URL',
  'MEILISEARCH_KEY',
  'MEILISEARCH_API_KEY',
  'ELASTICSEARCH_URL',
  'SEARCH_ALLOW_IN_MEMORY',
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetSearchAdapterCache();
}

function fakePool(options: {
  lockAcquired: boolean;
  listingRows?: Array<Record<string, unknown>>;
}) {
  const calls: string[] = [];
  let released = false;
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (/pg_try_advisory_lock/.test(sql)) {
        return { rows: [{ acquired: options.lockAcquired }], rowCount: 1 };
      }
      if (/pg_advisory_unlock/.test(sql)) {
        return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
      }
      throw new Error(`unexpected client query: ${sql.slice(0, 100)}`);
    },
    release: () => {
      released = true;
    },
  };
  const pool = {
    connect: async () => client,
    query: async (sql: string) => {
      calls.push(sql);
      if (/FROM listings/.test(sql)) {
        const rows = options.listingRows ?? [];
        return { rows, rowCount: rows.length };
      }
      throw new Error(`unexpected pool query: ${sql.slice(0, 100)}`);
    },
  };
  return {
    pool: pool as unknown as Pool,
    calls,
    wasReleased: () => released,
  };
}

test('a second concurrent reindex fails fast instead of racing the swap', async () => {
  const snapshot = snapshotEnv();
  try {
    process.env.NODE_ENV = 'development';
    delete process.env.MEILISEARCH_URL;
    delete process.env.ELASTICSEARCH_URL;
    resetSearchAdapterCache();

    const { pool, calls, wasReleased } = fakePool({ lockAcquired: false });
    const result = await reindexListingsBlueGreen(pool);

    assert.equal(result.ok, false);
    assert.equal(result.swapped, false);
    assert.match(result.error ?? '', /reindex_in_progress/);
    // The loser's run must not touch the corpus or attempt an unlock it
    // never held.
    assert.ok(!calls.some((sql) => /FROM listings/.test(sql)));
    assert.ok(!calls.some((sql) => /pg_advisory_unlock/.test(sql)));
    assert.equal(wasReleased(), true);
  } finally {
    restoreEnv(snapshot);
  }
});

test('a held lease runs the reindex and is always released afterwards', async () => {
  const snapshot = snapshotEnv();
  try {
    // No MEILISEARCH_URL → in-place mode: the lock still wraps the run so
    // the admin route and the worker cannot double-sync either.
    process.env.NODE_ENV = 'development';
    delete process.env.MEILISEARCH_URL;
    delete process.env.ELASTICSEARCH_URL;
    resetSearchAdapterCache();

    const { pool, calls, wasReleased } = fakePool({ lockAcquired: true });
    const result = await reindexListingsBlueGreen(pool);

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'in_place');
    assert.equal(result.swapped, false);
    assert.ok(calls.some((sql) => /pg_try_advisory_lock/.test(sql)));
    assert.ok(
      calls.some((sql) => /pg_advisory_unlock/.test(sql)),
      'the advisory lock must be released after the run',
    );
    assert.equal(wasReleased(), true);
  } finally {
    restoreEnv(snapshot);
  }
});

test('a lock-acquisition database error fails honestly and releases the client', async () => {
  const snapshot = snapshotEnv();
  try {
    process.env.NODE_ENV = 'development';
    delete process.env.MEILISEARCH_URL;
    delete process.env.ELASTICSEARCH_URL;
    resetSearchAdapterCache();

    let released = false;
    const client = {
      query: async () => {
        throw new Error('connection reset');
      },
      release: () => {
        released = true;
      },
    };
    const pool = {
      connect: async () => client,
      query: async () => {
        throw new Error('must not reach the corpus query');
      },
    } as unknown as Pool;

    const result = await reindexListingsBlueGreen(pool);
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /reindex_lock_unavailable/);
    assert.equal(released, true);
  } finally {
    restoreEnv(snapshot);
  }
});

// ── Settings-task verification (swap acceptance) ────────────────────────────
// The blue/green reindex passes `awaitTasks` so a staged index whose
// settings update failed (or never completed) can never take traffic. The
// old code fire-and-forgot settings updates — these tests pin the new
// contract: task failure rejects, and awaiting an unreachable backend
// throws instead of being swallowed.

test('pollMeilisearchTask resolves on success and rejects on a failed task', async () => {
  const snapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ status: 'succeeded' }), { status: 200 });
    await pollMeilisearchTask('http://meili.invalid', 'key', 7, 5_000, 1);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: 'failed',
          error: { message: 'invalid ranking rule' },
        }),
        { status: 200 },
      );
    await assert.rejects(
      pollMeilisearchTask('http://meili.invalid', 'key', 42, 5_000, 1),
      /task 42 failed/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

test('configureSearchIndex awaitTasks propagates settings failures (swap acceptance)', async () => {
  const snapshot = snapshotEnv();
  try {
    // Unreachable backend: every settings update rejects. Fire-and-forget
    // (startup) still swallows; awaitTasks (staged reindex) must throw so a
    // half-configured index can never reach the swap step.
    process.env.MEILISEARCH_URL = 'http://127.0.0.1:1';
    delete process.env.MEILISEARCH_EMBEDDER_SOURCE;

    await assert.rejects(
      configureSearchIndex('listings_lease_test', {
        awaitTasks: true,
        pollIntervalMs: 1,
      }),
    );
    await configureSearchIndex('listings_lease_test'); // resolves — swallowed
  } finally {
    restoreEnv(snapshot);
  }
});
