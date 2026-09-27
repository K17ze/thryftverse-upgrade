import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemorySearchAdapter,
  MeilisearchSearchAdapter,
  createSearchAdapter,
  resetSearchAdapterCache,
  type ListingDocument,
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

// ── Fallback corpus coherence (audit N3) ────────────────────────────────────
// The process-local fallback must hold a real corpus, not just post-outage
// writes: successful remote writes are mirrored in, deletes are mirrored
// out, and a mid-session outage then serves what the shared index served.

function fallbackDoc(id: string, titleToken: string): ListingDocument {
  return {
    id,
    title: `${titleToken} listing`,
    description: `fallback coherence fixture ${titleToken}`,
    category: 'test',
    condition: 'good',
    price: 10,
    currency: 'GBP',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
}

/** Wait for the constructor's async initClient() to settle. */
async function settleInit(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

test('degraded writes land in the fallback corpus (write → outage → search)', async () => {
  // Port 1 refuses every connection: index() degrades into the fallback.
  const adapter = new MeilisearchSearchAdapter({ url: 'http://127.0.0.1:1' });
  const doc = fallbackDoc('lst_fb_write', 'zzfbwrite');
  try {
    await adapter.index(doc);
    const results = await adapter.search({ query: 'zzfbwrite' });
    assert.ok(
      results.some((r) => r.id === doc.id),
      'mirrored write must be searchable during the outage',
    );
  } finally {
    await adapter.remove(doc.id);
  }
});

test('a successful remote write is mirrored — a later outage still serves it', async () => {
  // Audit N3 regression: the old adapter only wrote the fallback on
  // failure, so a healthy-then-degraded backend served an empty corpus.
  const adapter = new MeilisearchSearchAdapter({ url: 'http://127.0.0.1:1' });
  await settleInit();
  // Inject a client whose writes succeed but whose reads fail — the
  // "healthy at write time, down at read time" sequence the mirror exists
  // for.
  const fakeIndex = {
    addDocuments: async () => ({ taskUid: 1 }),
    deleteDocument: async () => ({ taskUid: 2 }),
    search: async () => {
      throw new Error('backend down mid-session');
    },
  };
  (adapter as unknown as { client: unknown }).client = {
    index: () => fakeIndex,
  };

  const doc = fallbackDoc('lst_fb_mirror', 'zzfbmirror');
  try {
    await adapter.index(doc); // remote success → mirrored into fallback
    const results = await adapter.search({ query: 'zzfbmirror' });
    assert.equal(adapter.retrievalInfo().degraded, true);
    assert.ok(
      results.some((r) => r.id === doc.id),
      'a write that succeeded pre-outage must still be served by the fallback',
    );
  } finally {
    const pristine = new MeilisearchSearchAdapter({ url: 'http://127.0.0.1:1' });
    await pristine.remove(doc.id); // degraded-path cleanup of the shared index
  }
});

test('a mirrored delete removes the document from the outage corpus', async () => {
  const adapter = new MeilisearchSearchAdapter({ url: 'http://127.0.0.1:1' });
  const doc = fallbackDoc('lst_fb_delete', 'zzfbdelete');
  await adapter.index(doc);
  await adapter.remove(doc.id);
  const results = await adapter.search({ query: 'zzfbdelete' });
  assert.ok(
    !results.some((r) => r.id === doc.id),
    'a deleted listing must not resurface from the fallback during an outage',
  );
});
