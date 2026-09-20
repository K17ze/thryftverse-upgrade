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
