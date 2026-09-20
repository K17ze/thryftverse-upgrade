import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  serialiseEmbedding,
  deserialiseEmbedding,
  embeddingToVectorLiteral,
  dotProduct,
} from '../workers/handlers/mediaEmbeddingUtils.js';
import {
  EMBEDDING_VECTOR_DIMENSIONS,
  hasMediaEmbeddingVectorColumn,
  nearestMediaEmbeddings,
} from '../lib/mediaEmbeddings.js';
import type { Queryable } from '../lib/autoFeedback.js';

// Contract for audit item R20: media_embeddings.embedding is BYTEA until
// pgvector is available; migration 326 provisions `embedding_vec vector(512)`
// only when the extension exists. These tests prove:
//   1. the BYTEA <-> float32 codec round-trips;
//   2. feature detection probes pg_attribute and fails closed;
//   3. the serving function uses `embedding_vec <=>` when the column exists
//      and honestly degrades to an exact BYTEA scan when it does not —
//      never faking ANN results.
// Runs without a DB — the pool is faked (same pattern as
// costTelemetry.test.ts / autoFeedback.test.ts).

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(SRC_DIR, 'db', 'migrations');

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

/** Fake Queryable: records queries, returns canned rows per-SQL-pattern. */
function fakeDb(handler: (sql: string) => unknown[]): {
  db: Queryable;
  queries: RecordedQuery[];
} {
  const queries: RecordedQuery[] = [];
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });
      return { rows: handler(sql) };
    },
  } as unknown as Queryable;
  return { db, queries };
}

function embeddingRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    media_asset_id: 'ma_x',
    model_id: 'siglip2-so400m',
    model_version: 'v1.0.0',
    preprocessing_version: 'v1',
    checksum_sha256: 'a'.repeat(64),
    dimensions: 3,
    norm: 1,
    embedding: serialiseEmbedding([1, 0, 0]),
    ...overrides,
  };
}

describe('media embedding BYTEA codec', () => {
  it('round-trips a 512-dim float32 vector', () => {
    const vector = Array.from({ length: 512 }, (_, i) => Math.sin(i) * 0.5);
    const decoded = deserialiseEmbedding(serialiseEmbedding(vector));
    assert.equal(decoded.length, 512);
    for (let i = 0; i < vector.length; i++) {
      assert.ok(Math.abs(decoded[i] - vector[i]) < 1e-6, `index ${i}`);
    }
  });

  it('round-trips edge values (negatives, tiny, zero)', () => {
    const vector = [1.5, -2.25, 0.000001, 0, -0, 42];
    const decoded = deserialiseEmbedding(serialiseEmbedding(vector));
    for (let i = 0; i < vector.length; i++) {
      assert.ok(Math.abs(decoded[i] - vector[i]) < 1e-6, `index ${i}`);
    }
  });

  it('rejects payloads that are not a multiple of 4 bytes', () => {
    assert.throws(() => deserialiseEmbedding(Buffer.alloc(6)), /not a multiple of 4/);
  });

  it('decodes a Uint8Array view identically to a Buffer', () => {
    const buf = serialiseEmbedding([0.25, -0.5]);
    const view = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    assert.deepEqual(deserialiseEmbedding(view), deserialiseEmbedding(buf));
  });
});

describe('pgvector literal + dot product helpers', () => {
  it('formats the pgvector input literal', () => {
    assert.equal(embeddingToVectorLiteral([1.5, -2.25, 0]), '[1.5,-2.25,0]');
    assert.equal(embeddingToVectorLiteral([]), '[]');
  });

  it('dotProduct computes over the shared prefix', () => {
    assert.equal(dotProduct([1, 2, 3], [4, 5, 6]), 32);
    assert.equal(dotProduct([1, 2], [4, 5, 999]), 14);
  });
});

describe('hasMediaEmbeddingVectorColumn (feature detection)', () => {
  it('returns true when pg_attribute reports the column', async () => {
    const { db, queries } = fakeDb((sql) => {
      assert.match(sql, /pg_attribute/);
      assert.match(sql, /embedding_vec/);
      return [{ exists: true }];
    });
    assert.equal(await hasMediaEmbeddingVectorColumn(db), true);
    assert.equal(queries.length, 1);
  });

  it('returns false when the column is absent', async () => {
    const { db } = fakeDb(() => [{ exists: false }]);
    assert.equal(await hasMediaEmbeddingVectorColumn(db), false);
  });

  it('fails closed (false) when the probe errors', async () => {
    const db = {
      query: async () => {
        throw new Error('relation media_embeddings does not exist');
      },
    } as unknown as Queryable;
    assert.equal(await hasMediaEmbeddingVectorColumn(db), false);
  });
});

describe('nearestMediaEmbeddings', () => {
  it('uses ORDER BY embedding_vec <=> when the vector column exists', async () => {
    const { db, queries } = fakeDb((sql) => {
      if (/pg_attribute/.test(sql)) return [{ exists: true }];
      if (/embedding_vec <=>/.test(sql)) {
        return [
          {
            media_asset_id: 'ma_1',
            model_id: 'siglip2-so400m',
            model_version: 'v1.0.0',
            preprocessing_version: 'v1',
            checksum_sha256: 'b'.repeat(64),
            distance: 0.25,
          },
        ];
      }
      throw new Error(`unexpected query: ${sql.slice(0, 120)}`);
    });

    const res = await nearestMediaEmbeddings(db, {
      queryEmbedding: [1, 0, 0],
      limit: 5,
      filter: { modelId: 'siglip2-so400m' },
    });

    assert.equal(res.method, 'pgvector_ann');
    assert.equal(res.degraded, false);
    assert.equal(res.degradedReason, undefined);
    assert.equal(res.hits.length, 1);
    assert.equal(res.hits[0].mediaAssetId, 'ma_1');
    // cosine similarity = 1 - cosine distance (pgvector <=> semantics)
    assert.equal(res.hits[0].distance, 0.25);
    assert.equal(res.hits[0].similarity, 0.75);

    const annQuery = queries.find((q) => /embedding_vec <=>/.test(q.sql));
    assert.ok(annQuery, 'ANN query was not issued');
    assert.match(annQuery.sql, /ORDER BY embedding_vec <=>/);
    assert.match(annQuery.sql, /status = 'ready'/);
    assert.match(annQuery.sql, /norm > 0/);
    // Params: filter args first, then the vector literal, then LIMIT.
    assert.equal(annQuery.params[0], 'siglip2-so400m');
    assert.equal(annQuery.params[1], '[1,0,0]');
    assert.equal(annQuery.params[2], 5);
  });

  it('degrades to an exact BYTEA scan when pgvector is not installed', async () => {
    const { db, queries } = fakeDb((sql) => {
      if (/pg_attribute/.test(sql)) return [{ exists: false }];
      if (/FROM media_embeddings/.test(sql)) {
        return [
          embeddingRow({ media_asset_id: 'ma_parallel' }),
          embeddingRow({
            media_asset_id: 'ma_orthogonal',
            embedding: serialiseEmbedding([0, 1, 0]),
          }),
        ];
      }
      throw new Error(`unexpected query: ${sql.slice(0, 120)}`);
    });

    const res = await nearestMediaEmbeddings(db, {
      queryEmbedding: [1, 0, 0],
      limit: 10,
    });

    assert.equal(res.method, 'bytea_exact_scan');
    assert.equal(res.degraded, true);
    assert.equal(res.degradedReason, 'pgvector_not_installed');
    assert.equal(res.scannedRows, 2);
    assert.equal(res.scanTruncated, false);

    // Query [1,0,0] is identical to ma_parallel (similarity 1) and
    // orthogonal to ma_orthogonal (similarity 0).
    assert.equal(res.hits.length, 2);
    assert.equal(res.hits[0].mediaAssetId, 'ma_parallel');
    assert.ok(Math.abs(res.hits[0].similarity - 1) < 1e-6);
    assert.equal(res.hits[1].mediaAssetId, 'ma_orthogonal');
    assert.ok(Math.abs(res.hits[1].similarity) < 1e-6);
    assert.ok(Math.abs(res.hits[0].distance) < 1e-6);

    // The degraded path must never touch the vector column.
    const scanQuery = queries.find((q) => /FROM media_embeddings/.test(q.sql));
    assert.ok(scanQuery);
    assert.doesNotMatch(scanQuery.sql, /embedding_vec/);
  });

  it('skips rows whose BYTEA payload disagrees with dimensions', async () => {
    const { db } = fakeDb((sql) => {
      if (/pg_attribute/.test(sql)) return [{ exists: false }];
      return [
        embeddingRow({ media_asset_id: 'ma_ok' }),
        embeddingRow({
          media_asset_id: 'ma_corrupt',
          // declared 3 dims but only 2 floats in the payload
          embedding: serialiseEmbedding([9, 9]),
        }),
      ];
    });

    const res = await nearestMediaEmbeddings(db, { queryEmbedding: [1, 0, 0] });
    assert.equal(res.hits.length, 1);
    assert.equal(res.hits[0].mediaAssetId, 'ma_ok');
    assert.equal(res.skippedRows, 1);
  });

  it('returns an honest empty result for a zero-norm query vector', async () => {
    // Cosine similarity is undefined for a zero vector — pgvector <=> would
    // return NaN, so the function must short-circuit rather than rank.
    const { db, queries } = fakeDb((sql) => {
      if (/pg_attribute/.test(sql)) return [{ exists: true }];
      throw new Error(`unexpected query: ${sql.slice(0, 120)}`);
    });
    const res = await nearestMediaEmbeddings(db, { queryEmbedding: [0, 0, 0] });
    assert.equal(res.hits.length, 0);
    assert.equal(res.degraded, false);
    // Only the feature-detection probe ran — no ANN or scan query.
    assert.equal(queries.length, 1);
  });

  it('honours the limit on the degraded path', async () => {
    const { db } = fakeDb((sql) => {
      if (/pg_attribute/.test(sql)) return [{ exists: false }];
      return [
        embeddingRow({ media_asset_id: 'ma_1' }),
        embeddingRow({ media_asset_id: 'ma_2' }),
        embeddingRow({ media_asset_id: 'ma_3' }),
      ];
    });
    const res = await nearestMediaEmbeddings(db, { queryEmbedding: [1, 0, 0], limit: 2 });
    assert.equal(res.hits.length, 2);
  });
});

describe('migration 326 (static contract)', () => {
  const up = readFileSync(
    path.join(MIGRATIONS_DIR, '326_media_embeddings_pgvector.sql'),
    'utf8',
  );
  const down = readFileSync(
    path.join(MIGRATIONS_DIR, '326_media_embeddings_pgvector_down.sql'),
    'utf8',
  );

  it('feature-detects pgvector instead of forcing CREATE EXTENSION', () => {
    assert.match(up, /pg_available_extensions/);
    assert.match(up, /CREATE EXTENSION IF NOT EXISTS vector/);
    // no-op marker on the non-pgvector branch
    assert.match(up, /BYTEA-only \(no-op by design\)/);
  });

  it('provisions a vector column matching the pipeline dimensionality', () => {
    assert.equal(EMBEDDING_VECTOR_DIMENSIONS, 512);
    assert.match(up, /ADD COLUMN IF NOT EXISTS embedding_vec vector\(512\)/);
  });

  it('is idempotent and creates an ANN index only inside the pgvector branch', () => {
    assert.match(up, /CREATE INDEX IF NOT EXISTS media_embeddings_embedding_vec_hnsw_idx/);
    assert.match(up, /ivfflat/); // fallback access method
  });

  it('down migration drops the column and restores the BYTEA-only view', () => {
    assert.match(down, /DROP COLUMN IF EXISTS embedding_vec/);
    assert.match(down, /DROP FUNCTION IF EXISTS _media_embeddings_bytea_le_to_float4/);
    assert.match(down, /CREATE OR REPLACE VIEW media_embeddings_serving/);
    // the restored view must be the BYTEA-only projection (migration 181)
    const viewDef = down.slice(down.indexOf('CREATE OR REPLACE VIEW'));
    assert.doesNotMatch(viewDef, /embedding_vec/);
  });
});
