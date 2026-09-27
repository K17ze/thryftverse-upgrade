import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Static contract for R19 multi-source retrieval: the recommendation pool is
// blended from independent sources (recency baseline, trending, followed
// sellers, user affinity, pgvector item-to-item) and each served impression
// stamps truthful lineage (candidate_source / source_rank). A blended pool
// without per-source lineage — or sources that exist but are never merged —
// is the audit's named failure mode.

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE_SRC = readFileSync(path.join(SRC_DIR, 'routes', 'recommendations.ts'), 'utf8');
const EMB_SRC = readFileSync(path.join(SRC_DIR, 'lib', 'mediaEmbeddings.ts'), 'utf8');

describe('recommendation multi-source retrieval (R19)', () => {
  it('retrieves candidates from multiple named sources', () => {
    for (const source of [
      'recent_sql_keyset',
      'trending_30d',
      'seller_followed',
      'user_affinity',
      'item_to_item_ann',
    ]) {
      assert.ok(
        ROUTE_SRC.includes(`'${source}'`),
        `retrieval source '${source}' must exist in recommendations.ts`,
      );
    }
  });

  it('shares one candidate query shape across all sources', () => {
    // Every source must run through candidateListingsSql so status/reach/self
    // safety predicates apply identically — a source that bypasses the shared
    // query can leak excluded sellers into the pool.
    const builderCalls = ROUTE_SRC.match(/candidateListingsSql\(/g);
    assert.ok(
      builderCalls && builderCalls.length >= 5,
      'each retrieval source must call candidateListingsSql',
    );
  });

  it('item_to_item_ann is gated on the provisioned pgvector column', () => {
    // The BYTEA exact scan is a bounded test fallback, not a serving path —
    // the ANN source must not run per-request without embedding_vec.
    assert.match(
      ROUTE_SRC,
      /hasMediaEmbeddingVectorColumn\(db\)/,
      'item_to_item_ann must feature-detect the pgvector column',
    );
    assert.match(
      ROUTE_SRC,
      /nearestMediaEmbeddings\(db,/,
      'item_to_item_ann must serve through nearestMediaEmbeddings',
    );
  });

  it('item_to_item_ann pins a single serving lineage end-to-end (N2)', () => {
    // Embeddings from different (model, version, preprocessing, dims)
    // tuples are incomparable vector spaces — anchor selection and the
    // neighbour query must pin the same resolved lineage.
    assert.match(
      ROUTE_SRC,
      /resolveServingEmbeddingLineage\(db\)/,
      'the serving lineage must be resolved before anchor selection',
    );
    for (const pin of [
      /me\.model_id = \$2/,
      /me\.model_version = \$3/,
      /me\.preprocessing_version = \$4/,
      /me\.dimensions = \$5/,
    ]) {
      assert.match(
        ROUTE_SRC,
        pin,
        'anchor selection must pin the serving lineage tuple',
      );
    }
    assert.match(ROUTE_SRC, /modelId: servingLineage\.modelId/);
    assert.match(ROUTE_SRC, /dimensions: servingLineage\.dimensions/);
  });

  it('item_to_item_ann preserves ANN rank through the listing join (N4)', () => {
    // The neighbour→listing mapping must keep (asset, distance) pairs so
    // source_rank is the true ANN rank, not arbitrary DISTINCT order.
    assert.match(
      ROUTE_SRC,
      /mapNeighbourAssetsToListings\(db, neighbourAssets\)/,
      'neighbour assets must map to listings through the rank-preserving join',
    );
    assert.match(EMB_SRC, /WITH ORDINALITY/);
    assert.match(EMB_SRC, /ORDER BY best_distance ASC/);
    assert.match(ROUTE_SRC, /array_position\(\$2::text\[\], l\.id\)/);
  });

  it('ANN capability is probed from the index, not the column (N5)', () => {
    // Column presence alone must never claim ANN — migration 326 treats
    // index failure as a notice, so the probe checks pg_indexes.
    assert.match(EMB_SRC, /pg_indexes/);
    assert.match(EMB_SRC, /has_ann_index/);
    assert.match(EMB_SRC, /'pgvector_exact'/);
  });

  it('records per-candidate lineage on served impressions', () => {
    // lineage?.source falls back to the baseline source so an untracked
    // listing never reports a fabricated origin.
    assert.match(
      ROUTE_SRC,
      /lineage\?\.source \?\? 'recent_sql_keyset'/,
      'impressions must stamp the real retrieval source',
    );
    assert.match(
      ROUTE_SRC,
      /lineage\?\.sourceRank \?\? recommendation\.position/,
      'impressions must stamp source_rank',
    );
  });

  it('exclusion filter applies after the source merge', () => {
    // User-authored exclusions must filter the merged pool — not just the
    // recency baseline — or a muted item resurfaces via another source.
    const mergeIdx = ROUTE_SRC.indexOf('mergeSource(listingsResult.rows');
    const filterIdx = ROUTE_SRC.indexOf('mergedListingRows.filter');
    assert.ok(mergeIdx > -1, 'baseline source must merge into the shared pool');
    assert.ok(
      filterIdx > mergeIdx,
      'eligibleListingRows must filter the merged pool, not listingsResult.rows',
    );
  });

  it('reports the retrieval-source mix in diagnostics', () => {
    assert.match(
      ROUTE_SRC,
      /diagnostics\.retrieval_sources = sourceContributions/,
      'decision diagnostics must report the source mix',
    );
  });
});
