import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';

import { resetSearchAdapterCache } from '../lib/searchAdapter.js';
import { pollMeilisearchTask } from '../lib/meilisearchConfig.js';
import {
  configureSearchIndex,
  reindexListingsBlueGreen,
  syncListingsChangedSince,
} from '../lib/searchSync.js';

// Contract for the reindex lease (audit S2): the admin POST /search/reindex
// route and the hourly search_indexing worker both land in
// reindexListingsBlueGreen — two concurrent blue/green runs would swap-stomp
// each other (the loser's staged index could repoint the live name after the
// winner's). Production routes DB traffic through PgBouncer in TRANSACTION
// pooling mode, so a SESSION advisory lock cannot work: a checked-out node
// client does not pin a server session. The fix is a durable fenced lease —
// the `search_reindex_lease` row (migration 338) mutated by single atomic
// statements, each its own transaction under transaction pooling.
//
// These tests assert the lease's SQL/behaviour contract against a fake pool:
//   - acquire: ONE atomic INSERT ... ON CONFLICT that only proceeds when the
//     existing row is expired or already ours; rowCount 0 = contended.
//   - heartbeat: UPDATE gated on name+holder+fence; rowCount 0 = lease lost.
//   - release: DELETE gated on name+holder+fence; a stale holder deletes
//     nothing.
//
// Residual: a fake pool cannot prove pool topology. Verifying two concurrent
// reindexes, lock-holder crash recovery and lease expiry through the real
// transaction-pool PgBouncer deployment remains an ops acceptance check.

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

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

function fakePool(options: {
  leaseAcquired: boolean;
  renewSucceeds?: boolean;
  releaseDeletes?: boolean;
  listingRows?: Array<Record<string, unknown>>;
  /** Optional gate — the listings query waits until release() is called. */
  holdListingsQuery?: { promise: Promise<void> };
}) {
  const calls: RecordedQuery[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/INSERT INTO search_reindex_lease/.test(sql)) {
        if (!options.leaseAcquired) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ fence: '7' }], rowCount: 1 };
      }
      if (/UPDATE search_reindex_lease/.test(sql)) {
        return {
          rows: [],
          rowCount: options.renewSucceeds === false ? 0 : 1,
        };
      }
      if (/DELETE FROM search_reindex_lease/.test(sql)) {
        return {
          rows: [],
          rowCount: options.releaseDeletes === false ? 0 : 1,
        };
      }
      if (/FROM listings/.test(sql)) {
        if (options.holdListingsQuery) {
          await options.holdListingsQuery.promise;
        }
        const rows = options.listingRows ?? [];
        return { rows, rowCount: rows.length };
      }
      throw new Error(`unexpected pool query: ${sql.slice(0, 100)}`);
    },
  };
  return {
    pool: pool as unknown as Pool,
    calls,
    queriesMatching: (pattern: RegExp) =>
      calls.filter((call) => pattern.test(call.sql)),
  };
}

function useDevInMemoryEnv(): void {
  process.env.NODE_ENV = 'development';
  delete process.env.MEILISEARCH_URL;
  delete process.env.ELASTICSEARCH_URL;
  resetSearchAdapterCache();
}

test('a second concurrent reindex fails fast instead of racing the swap', async () => {
  const snapshot = snapshotEnv();
  try {
    useDevInMemoryEnv();

    const { pool, calls, queriesMatching } = fakePool({ leaseAcquired: false });
    const result = await reindexListingsBlueGreen(pool);

    assert.equal(result.ok, false);
    assert.equal(result.swapped, false);
    assert.match(result.error ?? '', /reindex_in_progress/);
    // The loser's run must not touch the corpus, must not heartbeat, and
    // must not release a lease it never held.
    assert.ok(!calls.some(({ sql }) => /FROM listings/.test(sql)));
    assert.equal(queriesMatching(/UPDATE search_reindex_lease/).length, 0);
    assert.equal(queriesMatching(/DELETE FROM search_reindex_lease/).length, 0);
  } finally {
    restoreEnv(snapshot);
  }
});

test('lease acquisition is ONE atomic statement gated on expiry-or-same-holder', async () => {
  const snapshot = snapshotEnv();
  try {
    useDevInMemoryEnv();

    const { pool, queriesMatching } = fakePool({ leaseAcquired: false });
    await reindexListingsBlueGreen(pool);

    const acquire = queriesMatching(/search_reindex_lease/);
    assert.equal(acquire.length, 1, 'exactly one lease statement on contention');
    const { sql, params } = acquire[0];
    // Single atomic upsert — no BEGIN/multi-statement transaction, so the
    // statement is correct as its own transaction under transaction pooling.
    assert.match(sql, /INSERT INTO search_reindex_lease/);
    assert.match(sql, /ON CONFLICT \(name\) DO UPDATE/);
    // Takeover only when the existing lease expired or is already ours.
    assert.match(sql, /expires_at < now\(\)/);
    assert.match(sql, /holder = \$2/);
    // Fencing: the fence increments on every takeover and is returned.
    assert.match(sql, /fence = search_reindex_lease\.fence \+ 1/);
    assert.match(sql, /RETURNING fence/);
    // Params: [lease name, unique holder token, ttl ms]
    assert.equal(params[0], 'search_reindex_global');
    assert.match(String(params[1]), /^pid\d+-[0-9a-f-]{36}$/);
    assert.equal(typeof params[2], 'number');
  } finally {
    restoreEnv(snapshot);
  }
});

test('a held lease runs the reindex and is honestly released afterwards', async () => {
  const snapshot = snapshotEnv();
  try {
    // No MEILISEARCH_URL → in-place mode: the lease still wraps the run so
    // the admin route and the worker cannot double-sync either.
    useDevInMemoryEnv();

    const { pool, queriesMatching } = fakePool({ leaseAcquired: true });
    const result = await reindexListingsBlueGreen(pool);

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'in_place');
    assert.equal(result.swapped, false);

    const acquires = queriesMatching(/INSERT INTO search_reindex_lease/);
    const releases = queriesMatching(/DELETE FROM search_reindex_lease/);
    assert.equal(acquires.length, 1);
    assert.equal(releases.length, 1, 'the lease row must be deleted after the run');

    // Release is holder+fence matched — it can only delete OUR lease row,
    // never a competitor's. The holder token is identical to the acquire's.
    const acquireHolder = acquires[0].params[1];
    const release = releases[0];
    assert.match(release.sql, /WHERE name = \$1 AND holder = \$2 AND fence = \$3/);
    assert.equal(release.params[1], acquireHolder);
    assert.equal(release.params[2], 7, 'fence returned by acquire is carried into release');
  } finally {
    restoreEnv(snapshot);
  }
});

test('the heartbeat renews holder+fence-matched while work is in flight', async () => {
  const snapshot = snapshotEnv();
  try {
    useDevInMemoryEnv();

    // Hold the corpus query open so the heartbeat tick fires mid-run.
    let releaseListings!: () => void;
    const gate = {
      promise: new Promise<void>((resolve) => {
        releaseListings = resolve;
      }),
    };
    const { pool, queriesMatching } = fakePool({
      leaseAcquired: true,
      holdListingsQuery: gate,
    });

    const run = reindexListingsBlueGreen(pool, {
      leaseTtlMs: 60_000,
      leaseHeartbeatMs: 5,
    });
    // Let a few heartbeat ticks land before releasing the corpus query.
    await new Promise((resolve) => setTimeout(resolve, 40));
    releaseListings();
    const result = await run;

    assert.equal(result.ok, true);
    const renewals = queriesMatching(/UPDATE search_reindex_lease/);
    assert.ok(renewals.length >= 1, 'heartbeat must renew the lease while work runs');
    const renewal = renewals[0];
    assert.match(renewal.sql, /SET expires_at = now\(\)/);
    assert.match(renewal.sql, /WHERE name = \$1 AND holder = \$2 AND fence = \$3/);
    assert.match(String(renewal.params[1]), /^pid\d+-[0-9a-f-]{36}$/);
    assert.equal(renewal.params[2], 7, 'heartbeat is fenced to the acquired epoch');
    assert.equal(renewal.params[3], 60_000, 'renewal extends by the lease TTL');
  } finally {
    restoreEnv(snapshot);
  }
});

test('a lease-acquisition database error fails honestly and never runs', async () => {
  const snapshot = snapshotEnv();
  try {
    useDevInMemoryEnv();

    let corpusTouched = false;
    const pool = {
      query: async (sql: string) => {
        if (/search_reindex_lease/.test(sql)) {
          throw new Error('relation "search_reindex_lease" does not exist');
        }
        if (/FROM listings/.test(sql)) {
          corpusTouched = true;
        }
        throw new Error('must not reach the corpus query');
      },
    } as unknown as Pool;

    const result = await reindexListingsBlueGreen(pool);
    assert.equal(result.ok, false);
    // A missing lease table (migration 338 not applied) or any DB error must
    // skip the run — never proceed unprotected.
    assert.match(result.error ?? '', /reindex_lock_unavailable/);
    assert.match(result.error ?? '', /migration 338/);
    assert.equal(corpusTouched, false);
  } finally {
    restoreEnv(snapshot);
  }
});

test('a failed heartbeat marks the lease lost but never crashes the run', async () => {
  const snapshot = snapshotEnv();
  try {
    useDevInMemoryEnv();

    let releaseListings!: () => void;
    const gate = {
      promise: new Promise<void>((resolve) => {
        releaseListings = resolve;
      }),
    };
    const { pool, queriesMatching } = fakePool({
      leaseAcquired: true,
      renewSucceeds: false, // rowCount 0 — the row was taken over/expired
      releaseDeletes: false, // release likewise matches nothing
      holdListingsQuery: gate,
    });

    const run = reindexListingsBlueGreen(pool, {
      leaseTtlMs: 60_000,
      leaseHeartbeatMs: 5,
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    releaseListings();
    // In-place mode has no irreversible step, so the run completes — the
    // pre-swap guard (assertLeaseHeld) is what aborts a lost lease in the
    // blue/green path. What must hold here: the run does not hang or crash
    // on lease loss, and release stays holder+fence matched.
    const result = await run;
    assert.equal(result.ok, true);
    assert.ok(queriesMatching(/UPDATE search_reindex_lease/).length >= 1);
    assert.equal(queriesMatching(/DELETE FROM search_reindex_lease/).length, 1);
  } finally {
    restoreEnv(snapshot);
  }
});

// ── Post-swap catch-up pagination (audit: converge, don't cap at 1000) ──────

function catchUpRow(id: string, updatedAt: string, status = 'active') {
  return {
    id,
    title: `Listing ${id}`,
    description: 'catch-up test row',
    price_gbp: '10.00',
    status,
    category: 'test',
    brand: null,
    size: null,
    condition: 'good',
    created_at: updatedAt,
    updated_at: updatedAt,
  };
}

test('post-swap catch-up pages the full change window to convergence', async () => {
  const snapshot = snapshotEnv();
  try {
    useDevInMemoryEnv();

    // Page 1 is exactly the batch size (500) — the old code truncated here.
    // Page 2 is a short page = convergence.
    const page1 = Array.from({ length: 500 }, (_, i) =>
      catchUpRow(`l${String(i).padStart(4, '0')}`, '2026-09-21T00:00:01.000Z'),
    );
    const page2 = [
      catchUpRow('l0500', '2026-09-21T00:00:02.000Z'),
      catchUpRow('l0501', '2026-09-21T00:00:02.000Z', 'sold'),
    ];
    const queries: RecordedQuery[] = [];
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        assert.match(sql, /\(updated_at, id\) > \(\$1::timestamptz, \$2::text\)/);
        const cursorTs = params[0] as string;
        const cursorId = params[1] as string;
        const rows = cursorId === '' ? page1 : page2;
        // Honour the keyset predicate for the fixture data.
        const filtered = rows.filter(
          (row) =>
            row.updated_at > cursorTs ||
            (row.updated_at === cursorTs && row.id > cursorId),
        );
        return { rows: filtered, rowCount: filtered.length };
      },
    } as unknown as Pool;

    const result = await syncListingsChangedSince(
      pool,
      '2026-09-21T00:00:00.000Z',
    );

    assert.equal(result.complete, true, 'a short final page = converged');
    assert.equal(result.touched, 502, 'every changed row is replayed');
    assert.equal(queries.length, 2);
    // Second page must be keyset-paginated from page 1's last row — not a
    // repeat of the same window.
    assert.equal(queries[1].params[0], '2026-09-21T00:00:01.000Z');
    assert.equal(queries[1].params[1], 'l0499');
  } finally {
    restoreEnv(snapshot);
  }
});

test('post-swap catch-up reports incomplete (never silently truncates) on query failure', async () => {
  const snapshot = snapshotEnv();
  try {
    useDevInMemoryEnv();

    let calls = 0;
    const pool = {
      query: async () => {
        calls += 1;
        if (calls === 1) {
          const rows = Array.from({ length: 500 }, (_, i) =>
            catchUpRow(`x${String(i).padStart(4, '0')}`, '2026-09-21T00:00:01.000Z'),
          );
          return { rows, rowCount: rows.length };
        }
        throw new Error('connection dropped mid-pagination');
      },
    } as unknown as Pool;

    const result = await syncListingsChangedSince(
      pool,
      '2026-09-21T00:00:00.000Z',
    );
    assert.equal(result.complete, false);
    assert.equal(result.touched, 500);
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
