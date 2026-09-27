import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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
  mapNeighbourAssetsToListings,
  mediaEmbeddingVectorCapability,
  nearestMediaEmbeddings,
  resolveServingEmbeddingLineage,
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

describe('mediaEmbeddingVectorCapability (audit N5)', () => {
  it('reports ann only when an HNSW/IVFFlat index backs the column', async () => {
    const { db, queries } = fakeDb((sql) => {
      assert.match(sql, /pg_indexes/);
      assert.match(sql, /hnsw|ivfflat/i);
      return [{ has_column: true, has_ann_index: true }];
    });
    assert.equal(await mediaEmbeddingVectorCapability(db), 'ann');
    assert.equal(queries.length, 1);
  });

  it('reports exact when the column exists without an ANN index', async () => {
    // Migration 326 swallows index-creation failures as notices — a
    // no-index deployment must not claim ANN.
    const { db } = fakeDb(() => [{ has_column: true, has_ann_index: false }]);
    assert.equal(await mediaEmbeddingVectorCapability(db), 'exact');
  });

  it('reports none when the column is absent or the probe errors', async () => {
    const { db } = fakeDb(() => [{ has_column: false, has_ann_index: false }]);
    assert.equal(await mediaEmbeddingVectorCapability(db), 'none');
    const failing = {
      query: async () => {
        throw new Error('relation media_embeddings does not exist');
      },
    } as unknown as Queryable;
    assert.equal(await mediaEmbeddingVectorCapability(failing), 'none');
  });
});

describe('resolveServingEmbeddingLineage (audit N2)', () => {
  it('returns the dominant ready lineage tuple', async () => {
    const { db, queries } = fakeDb((sql) => {
      assert.match(
        sql,
        /GROUP BY me\.model_id, me\.model_version, me\.preprocessing_version, me\.dimensions, ma\.status/,
      );
      assert.match(sql, /me\.status = 'ready' AND me\.norm > 0/);
      return [
        {
          model_id: 'siglip2-so400m',
          model_version: 'v1.0.0',
          preprocessing_version: 'v1',
          dimensions: 512,
        },
      ];
    });
    const lineage = await resolveServingEmbeddingLineage(db);
    assert.deepEqual(lineage, {
      modelId: 'siglip2-so400m',
      modelVersion: 'v1.0.0',
      preprocessingVersion: 'v1',
      dimensions: 512,
    });
    assert.equal(queries.length, 1);
  });

  it('consults model_artifacts: blocked/retired excluded, active outranks coverage', async () => {
    // Governance is enforced in SQL (the registry join + ordering), so the
    // contract is pinned on the emitted statement: a blocked or retired
    // artifact must never reach the GROUP BY, and an 'active' artifact must
    // rank ahead of higher-coverage unapproved lineages.
    const { db, queries } = fakeDb(() => []);
    await resolveServingEmbeddingLineage(db);
    const sql = queries[0].sql;

    // Registry join keyed on the full artifact identity.
    assert.match(sql, /LEFT JOIN model_artifacts ma/);
    assert.match(sql, /ma\.model_id = me\.model_id/);
    assert.match(sql, /ma\.model_version = me\.model_version/);
    assert.match(sql, /ma\.preprocessing_version = me\.preprocessing_version/);
    // Hard exclusion: held/superseded models never serve even with the
    // highest coverage.
    assert.match(sql, /ma\.status NOT IN \('blocked', 'retired'\)/);
    // Promoted champion wins over unapproved coverage leaders.
    assert.match(
      sql,
      /ORDER BY\s+CASE WHEN ma\.status = 'active' THEN 0 ELSE 1 END,\s+ready_rows DESC,\s+latest_at DESC/,
    );
  });

  it('returns null when no lineage is ready and fails closed on error', async () => {
    const { db } = fakeDb(() => []);
    assert.equal(await resolveServingEmbeddingLineage(db), null);
    const failing = {
      query: async () => {
        throw new Error('boom');
      },
    } as unknown as Queryable;
    assert.equal(await resolveServingEmbeddingLineage(failing), null);
  });
});

describe('mapNeighbourAssetsToListings (audit N4)', () => {
  it('returns [] without querying for an empty neighbour set', async () => {
    const { db, queries } = fakeDb(() => {
      throw new Error('must not query');
    });
    assert.deepEqual(await mapNeighbourAssetsToListings(db, new Map()), []);
    assert.equal(queries.length, 0);
  });

  it('issues an ordinality-preserving join ordered by best distance', async () => {
    const { db, queries } = fakeDb((sql) => {
      assert.match(sql, /WITH ORDINALITY/);
      assert.match(sql, /ORDER BY best_distance ASC, MIN\(n\.ann_rank\) ASC/);
      assert.match(sql, /target_type = 'listing'/);
      assert.match(sql, /removed_at IS NULL/);
      // Postgres already ordered by best distance — rows arrive ranked.
      return [
        { listing_id: 'lst_close', best_distance: '0.10' },
        { listing_id: 'lst_far', best_distance: '0.30' },
      ];
    });
    const distances = new Map<string, number>([
      ['ma_a', 0.4],
      ['ma_b', 0.1],
    ]);
    const rows = await mapNeighbourAssetsToListings(db, distances);
    assert.deepEqual(rows, [
      { listingId: 'lst_close', distance: 0.1 },
      { listingId: 'lst_far', distance: 0.3 },
    ]);
    const q = queries[0];
    // Params carry aligned (asset_id, distance) pairs — the ordinality
    // join is what makes the ANN rank survivable through the mapping.
    assert.deepEqual(q.params[0], ['ma_a', 'ma_b']);
    assert.deepEqual(q.params[1], [0.4, 0.1]);
  });

  it('passes LIMIT $3 when a cap is given', async () => {
    const { db, queries } = fakeDb(() => []);
    await mapNeighbourAssetsToListings(db, new Map([['ma_a', 0.1]]), 25);
    assert.match(queries[0].sql, /LIMIT \$3/);
    assert.equal(queries[0].params[2], 25);
  });
});

describe('nearestMediaEmbeddings', () => {
  it('uses ORDER BY embedding_vec <=> when the vector column exists', async () => {
    const { db, queries } = fakeDb((sql) => {
      if (/pg_indexes/.test(sql)) {
        return [{ has_column: true, has_ann_index: true }];
      }
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

    // The pgvector column is vector(512) — the ANN path only serves a
    // query vector of matching dimensionality.
    const queryVector = Array.from({ length: EMBEDDING_VECTOR_DIMENSIONS }, (_, i) =>
      i === 0 ? 1 : 0,
    );
    const res = await nearestMediaEmbeddings(db, {
      queryEmbedding: queryVector,
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
    assert.equal(annQuery.params[1], embeddingToVectorLiteral(queryVector));
    assert.equal(annQuery.params[2], 5);
  });

  it('reports pgvector_exact (not ann) when the column has no ANN index', async () => {
    // Audit N5 regression: column presence alone used to advertise ANN.
    const { db } = fakeDb((sql) => {
      if (/pg_indexes/.test(sql)) {
        return [{ has_column: true, has_ann_index: false }];
      }
      if (/embedding_vec <=>/.test(sql)) return [];
      throw new Error(`unexpected query: ${sql.slice(0, 120)}`);
    });
    const res = await nearestMediaEmbeddings(db, {
      queryEmbedding: Array.from({ length: EMBEDDING_VECTOR_DIMENSIONS }, (_, i) =>
        i === 0 ? 1 : 0,
      ),
    });
    assert.equal(res.method, 'pgvector_exact');
    assert.equal(res.degraded, false);
  });

  it('pins lineage filters (model + versions + dimensions) into the ANN query', async () => {
    const { db, queries } = fakeDb((sql) => {
      if (/pg_indexes/.test(sql)) {
        return [{ has_column: true, has_ann_index: true }];
      }
      if (/embedding_vec <=>/.test(sql)) return [];
      throw new Error(`unexpected query: ${sql.slice(0, 120)}`);
    });
    await nearestMediaEmbeddings(db, {
      queryEmbedding: Array.from({ length: EMBEDDING_VECTOR_DIMENSIONS }, (_, i) =>
        i === 0 ? 1 : 0,
      ),
      filter: {
        modelId: 'siglip2-so400m',
        modelVersion: 'v1.0.0',
        preprocessingVersion: 'v1',
        dimensions: EMBEDDING_VECTOR_DIMENSIONS,
      },
    });
    const annQuery = queries.find((q) => /embedding_vec <=>/.test(q.sql));
    assert.ok(annQuery);
    assert.match(annQuery.sql, /model_id = \$1/);
    assert.match(annQuery.sql, /model_version = \$2/);
    assert.match(annQuery.sql, /preprocessing_version = \$3/);
    assert.match(annQuery.sql, /dimensions = \$4/);
    assert.deepEqual(annQuery.params.slice(0, 4), [
      'siglip2-so400m',
      'v1.0.0',
      'v1',
      EMBEDDING_VECTOR_DIMENSIONS,
    ]);
  });

  it('routes a non-512-dim query to the BYTEA scan with dimension_mismatch', async () => {
    // A 3-dim query against vector(512) would raise a Postgres dimension
    // error — the honest path is the BYTEA scan whose per-row dimensions
    // check enforces comparability.
    const { db, queries } = fakeDb((sql) => {
      if (/pg_indexes/.test(sql)) {
        return [{ has_column: true, has_ann_index: true }];
      }
      if (/FROM media_embeddings/.test(sql)) {
        return [embeddingRow({ media_asset_id: 'ma_same_dims' })];
      }
      throw new Error(`unexpected query: ${sql.slice(0, 120)}`);
    });
    const res = await nearestMediaEmbeddings(db, { queryEmbedding: [1, 0, 0] });
    assert.equal(res.method, 'bytea_exact_scan');
    assert.equal(res.degraded, true);
    assert.equal(res.degradedReason, 'dimension_mismatch');
    assert.equal(res.hits.length, 1);
    assert.equal(res.hits[0].mediaAssetId, 'ma_same_dims');
    // The vector column must never receive a mismatched-dimension literal.
    assert.ok(!queries.some((q) => /embedding_vec <=>/.test(q.sql)));
  });

  it('rejects a non-finite query vector instead of ranking NaN', async () => {
    const { db, queries } = fakeDb((sql) => {
      if (/pg_indexes/.test(sql)) {
        return [{ has_column: true, has_ann_index: true }];
      }
      throw new Error(`unexpected query: ${sql.slice(0, 120)}`);
    });
    for (const bad of [[NaN, 0, 0], [Infinity, 1], []]) {
      const res = await nearestMediaEmbeddings(db, { queryEmbedding: bad });
      assert.equal(res.hits.length, 0);
      assert.equal(res.method, 'pgvector_ann');
      assert.equal(res.degraded, false);
    }
    // Only the capability probe ran per call — no ANN or scan query.
    assert.equal(queries.length, 3);
  });

  it('degrades to an exact BYTEA scan when pgvector is not installed', async () => {
    const { db, queries } = fakeDb((sql) => {
      if (/pg_indexes/.test(sql)) {
        return [{ has_column: false, has_ann_index: false }];
      }
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
      if (/pg_indexes/.test(sql)) {
        return [{ has_column: false, has_ann_index: false }];
      }
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
      if (/pg_indexes/.test(sql)) {
        return [{ has_column: true, has_ann_index: true }];
      }
      throw new Error(`unexpected query: ${sql.slice(0, 120)}`);
    });
    const res = await nearestMediaEmbeddings(db, { queryEmbedding: [0, 0, 0] });
    assert.equal(res.hits.length, 0);
    assert.equal(res.method, 'pgvector_ann');
    assert.equal(res.degraded, false);
    // Only the capability probe ran — no ANN or scan query.
    assert.equal(queries.length, 1);
  });

  it('honours the limit on the degraded path', async () => {
    const { db } = fakeDb((sql) => {
      if (/pg_indexes/.test(sql)) {
        return [{ has_column: false, has_ann_index: false }];
      }
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

// Audit N1 regression. The 326/330 SQL codec reassembles a little-endian
// uint32 from four get_byte() terms. Under the original int4 arithmetic,
// `get_byte(...) * 16777216` overflows int32 for any high byte >= 128 —
// every negative float32 — raising "integer out of range" mid-backfill.
// There is no psql here, so this mirrors the corrected function's
// arithmetic term-for-term in JS bigint and proves the decode is exact;
// the paired assertion shows the same bytes DO overflow int32, i.e. this
// test fails on the pre-fix arithmetic.
describe('migration 326/330 BYTEA codec — bigint-safe decode (audit N1)', () => {
  /** JS mirror of _media_embeddings_bytea_le_to_float4 (post-fix). */
  function decodeLeToFloat4(buf: Buffer, dimensions: number): number[] | null {
    if (buf.length !== dimensions * 4) return null;
    const out: number[] = [];
    for (let i = 0; i < dimensions; i++) {
      // Per-term bigint promotion — mirrors get_byte(...)::bigint * 16777216.
      let u =
        BigInt(buf[i * 4]) +
        BigInt(buf[i * 4 + 1]) * 256n +
        BigInt(buf[i * 4 + 2]) * 65536n +
        BigInt(buf[i * 4 + 3]) * 16777216n;
      let sign = 1;
      if (u >= 2147483648n) {
        sign = -1;
        u -= 2147483648n;
      }
      const exp = Number(u / 8388608n); // bits 23..30
      const mant = Number(u % 8388608n); // bits 0..22
      let val: number;
      if (exp === 255) {
        val = mant === 0 ? Infinity : NaN;
      } else if (exp === 0) {
        val = (mant / 8388608) * Math.pow(2, -126);
      } else {
        val = (1 + mant / 8388608) * Math.pow(2, exp - 127);
      }
      out.push(Math.fround(sign * val));
    }
    return out;
  }

  it('decodes negative float32s exactly (the int4-overflow case)', () => {
    const vector = [-2.25, -1, -0.000001, -42.5, 1.5];
    const payload = serialiseEmbedding(vector);
    const decoded = decodeLeToFloat4(payload, vector.length);
    assert.ok(decoded);
    for (let i = 0; i < vector.length; i++) {
      assert.ok(
        Math.abs(decoded[i] - vector[i]) < 1e-6,
        `index ${i}: ${decoded[i]} !== ${vector[i]}`,
      );
    }
    // Prove the regression input: -2.25's high byte is >= 128, so the
    // pre-fix int4 term get_byte*16777216 exceeds int32 max and would have
    // raised "integer out of range" under the old arithmetic.
    const highByte = payload[3];
    assert.ok(highByte >= 128, 'test vector must exercise the overflow case');
    assert.ok(highByte * 16777216 > 0x7fffffff);
  });

  it('round-trips the full edge range through serialise/deserialise', () => {
    const vector = [0, -0, 1.5, -2.25, 1e-30, -1e30, 3.4028235e38];
    const payload = serialiseEmbedding(vector);
    const decoded = decodeLeToFloat4(payload, vector.length)!;
    for (let i = 0; i < vector.length; i++) {
      assert.ok(
        Math.abs(decoded[i] - vector[i]) <= Math.abs(vector[i]) * 1e-6 + 1e-38,
        `index ${i}: ${decoded[i]} !== ${vector[i]}`,
      );
    }
  });
});

// Audit Appendix D blocker 1 / section 4.3: on a populated pre-326 database
// with pgvector installed, 326's backfill evaluates the int4-overflowing
// codec and aborts BEFORE the runner ever reaches 330 — an additive fix at
// 330 alone cannot rescue that path. Because 326's committed bytes are
// checksum-pinned, the remediation is a NEW migration whose filename sorts
// lexically between '325_' and '326_': '325b_' ('_' 0x5F < 'b' 0x62 at
// position 3; '5' < '6' at position 2). It installs the corrected codec and
// runs 326's exact backfill predicate first, so 326's own backfill matches
// zero rows and never evaluates the overflowing expression.
describe('migration 325b (static contract — pre-326 corrected prefill)', () => {
  const PRE_FILL = '325b_media_embeddings_pgvector_prefill.sql';
  const up325b = readFileSync(
    path.join(MIGRATIONS_DIR, PRE_FILL),
    'utf8',
  );
  const down325b = readFileSync(
    path.join(MIGRATIONS_DIR, '325b_media_embeddings_pgvector_prefill_down.sql'),
    'utf8',
  );

  it('sorts strictly between 325 and 326 so it runs BEFORE 326', () => {
    assert.ok(
      PRE_FILL > '325_order_parcel_events_lost_damaged.sql',
      `${PRE_FILL} must sort after the 325_* migrations`,
    );
    assert.ok(
      PRE_FILL < '326_media_embeddings_pgvector.sql',
      `${PRE_FILL} must sort before 326`,
    );
    // The runner also applies the same ordering over the real directory.
    const sorted = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !f.endsWith('_down.sql'))
      .sort();
    assert.ok(
      sorted.indexOf(PRE_FILL) > sorted.indexOf('325_order_parcel_events_lost_damaged.sql'),
    );
    assert.ok(
      sorted.indexOf(PRE_FILL) < sorted.indexOf('326_media_embeddings_pgvector.sql'),
    );
  });

  it('uses the same pg_available_extensions feature gate as 326', () => {
    assert.match(up325b, /pg_available_extensions/);
    assert.match(up325b, /CREATE EXTENSION IF NOT EXISTS vector/);
    assert.match(up325b, /no-op by design/);
  });

  it('installs the bigint-promoted codec (the 330 expression shape)', () => {
    assert.match(up325b, /CREATE OR REPLACE FUNCTION _media_embeddings_bytea_le_to_float4/);
    assert.match(up325b, /get_byte\(p_embedding, v_i \* 4 \+ 3\)::bigint \* 16777216/);
    assert.match(up325b, /get_byte\(p_embedding, v_i \* 4 \+ 2\)::bigint \* 65536/);
    // And must NOT contain the pre-fix int4 term anywhere in its own codec.
    assert.doesNotMatch(up325b, /get_byte\(p_embedding, v_i \* 4 \+ 3\) \* 16777216/);
  });

  it('runs the same backfill predicate as 326 so 326 finds zero rows', () => {
    assert.match(up325b, /ADD COLUMN IF NOT EXISTS embedding_vec vector\(512\)/);
    assert.match(up325b, /WHERE embedding_vec IS NULL/);
    assert.match(up325b, /dimensions = 512/);
    assert.match(up325b, /octet_length\(embedding\) = dimensions \* 4/);
  });

  it('is fully idempotent — safe on databases that already applied 326', () => {
    assert.match(up325b, /IF NOT EXISTS/);
    assert.match(up325b, /CREATE OR REPLACE FUNCTION/);
    assert.match(up325b, /embedding_vec IS NULL/);
    // no unconditional DDL that would fail on re-run
    assert.doesNotMatch(up325b, /ADD COLUMN embedding_vec(?!.*IF NOT EXISTS)/);
  });

  it('down file exists and is a deliberate no-op (owned by the 326/330 lifecycle)', () => {
    assert.match(down325b, /no-op/);
    assert.doesNotMatch(down325b, /DROP COLUMN|DROP FUNCTION/);
  });
});

describe('migration 330 (static contract — companion codec fix)', () => {
  const up330 = readFileSync(
    path.join(MIGRATIONS_DIR, '330_media_embeddings_bytea_codec_bigint.sql'),
    'utf8',
  );
  const down330 = readFileSync(
    path.join(MIGRATIONS_DIR, '330_media_embeddings_bytea_codec_bigint_down.sql'),
    'utf8',
  );
  const up326 = readFileSync(
    path.join(MIGRATIONS_DIR, '326_media_embeddings_pgvector.sql'),
    'utf8',
  );

  it('replaces the decoder with per-term bigint promotion', () => {
    assert.match(up330, /CREATE OR REPLACE FUNCTION _media_embeddings_bytea_le_to_float4/);
    // Every get_byte term multiplied by a weight must be cast to bigint
    // BEFORE the multiply — the pre-fix expression overflows int32.
    assert.match(up330, /get_byte\(p_embedding, v_i \* 4 \+ 3\)::bigint \* 16777216/);
    assert.match(up330, /get_byte\(p_embedding, v_i \* 4 \+ 2\)::bigint \* 65536/);
  });

  it('re-runs the backfill predicate and stays feature-detected', () => {
    assert.match(up330, /WHERE embedding_vec IS NULL/);
    assert.match(up330, /pg_available_extensions/);
    // No-op branch when pgvector/embedding_vec are absent.
    assert.match(up330, /no-op by design/);
  });

  it('326 stays at committed bytes — remediation ships via 330 (checksum-safe)', () => {
    // 326 is an APPLIED migration: the runner checksum-verifies applied files,
    // so editing it post-commit aborts runMigrations() on any environment that
    // already ran it. Fresh DBs still reach the corrected codec — 326 runs
    // first, then 330 CREATE OR REPLACEs the decoder and re-runs the backfill.
    // This assertion pins the freeze: if anyone re-edits 326 instead of
    // shipping a new migration, this test fails before deploy does.
    assert.doesNotMatch(up326, /get_byte\(p_embedding, v_i \* 4 \+ 3\)::bigint \* 16777216/);
    assert.match(up326, /get_byte\(p_embedding, v_i \* 4 \+ 3\) \* 16777216/);
  });

  it('down is a deliberate no-op (reverting restores the corrupt codec)', () => {
    assert.match(down330, /no-op/);
    assert.doesNotMatch(down330, /DROP FUNCTION|CREATE OR REPLACE FUNCTION _media/);
  });
});
