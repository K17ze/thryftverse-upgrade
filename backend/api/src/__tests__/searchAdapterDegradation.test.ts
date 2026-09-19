import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemorySearchAdapter,
  MeilisearchSearchAdapter,
  createSearchAdapter,
  resetSearchAdapterCache,
} from '../lib/searchAdapter.js';

// ── Environment helpers ─────────────────────────────────────────────────────

const SEARCH_ENV_KEYS = [
  'NODE_ENV',
  'MEILISEARCH_URL',
  'MEILISEARCH_KEY',
  'ELASTICSEARCH_URL',
  'SEARCH_ALLOW_IN_MEMORY',
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of SEARCH_ENV_KEYS) {
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

function withEnv(
  overrides: Partial<Record<(typeof SEARCH_ENV_KEYS)[number], string | undefined>>,
  run: () => void,
): void {
  const snapshot = snapshotEnv();
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetSearchAdapterCache();
    run();
  } finally {
    restoreEnv(snapshot);
  }
}

// ── Factory selection ───────────────────────────────────────────────────────

test('in-memory adapter serves development when no shared backend is configured', () => {
  withEnv(
    {
      NODE_ENV: 'development',
      MEILISEARCH_URL: undefined,
      ELASTICSEARCH_URL: undefined,
      SEARCH_ALLOW_IN_MEMORY: undefined,
    },
    () => {
      const adapter = createSearchAdapter();
      assert.ok(adapter instanceof InMemorySearchAdapter);
      const info = adapter.retrievalInfo();
      assert.equal(info.backend, 'in_memory');
      assert.equal(info.degraded, undefined);
    },
  );
});

test('production without a shared search backend refuses to fall back silently', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      MEILISEARCH_URL: undefined,
      ELASTICSEARCH_URL: undefined,
      SEARCH_ALLOW_IN_MEMORY: undefined,
    },
    () => {
      assert.throws(
        () => createSearchAdapter(),
        /production requires MEILISEARCH_URL/i,
      );
    },
  );
});

test('production with only ELASTICSEARCH_URL refuses the placeholder', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      MEILISEARCH_URL: undefined,
      ELASTICSEARCH_URL: 'https://es.internal:9200',
      SEARCH_ALLOW_IN_MEMORY: undefined,
    },
    () => {
      assert.throws(
        () => createSearchAdapter(),
        /placeholder/i,
      );
    },
  );
});

test('explicit SEARCH_ALLOW_IN_MEMORY opt-in permits the process-local index in production', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      MEILISEARCH_URL: undefined,
      ELASTICSEARCH_URL: undefined,
      SEARCH_ALLOW_IN_MEMORY: 'true',
    },
    () => {
      const adapter = createSearchAdapter();
      assert.ok(adapter instanceof InMemorySearchAdapter);
    },
  );
});

test('production with MEILISEARCH_URL selects the Meilisearch adapter', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      MEILISEARCH_URL: 'http://127.0.0.1:1',
      ELASTICSEARCH_URL: undefined,
      SEARCH_ALLOW_IN_MEMORY: undefined,
    },
    () => {
      const adapter = createSearchAdapter();
      assert.ok(adapter instanceof MeilisearchSearchAdapter);
    },
  );
});

// ── Degraded mode ───────────────────────────────────────────────────────────

test('unreachable Meilisearch reports degraded and serves the fallback', async () => {
  // Port 1 is unreachable; whether or not the meilisearch SDK is installed,
  // the first real operation must flip the adapter into disclosed degraded
  // mode rather than reporting a healthy shared backend.
  const adapter = new MeilisearchSearchAdapter({ url: 'http://127.0.0.1:1' });

  const healthy = await adapter.health();
  assert.equal(healthy, false);

  const info = adapter.retrievalInfo();
  assert.equal(info.backend, 'in_memory');
  assert.equal(info.degraded, true);

  // Reads still serve — degraded, not dead.
  const results = await adapter.search({ query: 'jacket' });
  assert.ok(Array.isArray(results));
});

test('in-memory adapter health is honest in development', async () => {
  const adapter = new InMemorySearchAdapter();
  assert.equal(await adapter.health(), true);
  assert.equal(adapter.retrievalInfo().degraded, undefined);
});
