import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  rerankCandidates,
  type RerankCandidate,
  type RerankUserProfile,
} from '../routes/recommendations.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

const EMPTY_PROFILE: RerankUserProfile = {
  purchasedCategories: new Set<string>(),
  savedCategories: new Set<string>(),
  viewedCategories: new Set<string>(),
};

const GENERATED_AT = '2025-01-15T12:00:00.000Z';

function makeCandidate(overrides: Partial<RerankCandidate> & { id: string }): RerankCandidate {
  return {
    sellerId: `seller-${overrides.id}`,
    category: 'tops',
    createdAt: '2025-01-10T12:00:00.000Z',
    sellerRating: null,
    sellerHasRecentDispute: false,
    baseScore: 0.5,
    ...overrides,
  };
}

function topNIds(results: { id: string }[], n: number): string[] {
  return results.slice(0, n).map((r) => r.id);
}

function countSellerInTopN(
  results: { id: string; sellerId?: string }[],
  candidates: Map<string, string>,
  n: number,
  sellerId: string,
): number {
  return results
    .slice(0, n)
    .filter((r) => candidates.get(r.id) === sellerId)
    .length;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('recommendationReranking: rerankCandidates', () => {
  // ── 1. Seller diversity ──────────────────────────────────────────────────
  it('seller diversity: given 10 candidates from 2 sellers (7:3 split), the top 5 should have at most 3 from one seller', () => {
    const sellerA = 'seller-a';
    const sellerB = 'seller-b';

    // 7 items from seller A, 3 from seller B — all with identical signals
    // so the only differentiator is the diversity cap.
    const candidates: RerankCandidate[] = [];
    for (let i = 0; i < 7; i++) {
      candidates.push(
        makeCandidate({
          id: `a-${i}`,
          sellerId: sellerA,
          category: 'tops',
          createdAt: '2025-01-12T12:00:00.000Z',
          sellerRating: 4.5,
        }),
      );
    }
    for (let i = 0; i < 3; i++) {
      candidates.push(
        makeCandidate({
          id: `b-${i}`,
          sellerId: sellerB,
          category: 'tops',
          createdAt: '2025-01-12T12:00:00.000Z',
          sellerRating: 4.5,
        }),
      );
    }

    const results = rerankCandidates(candidates, EMPTY_PROFILE, {
      generatedAt: GENERATED_AT,
    });

    // Build a lookup of id → sellerId for counting.
    const sellerById = new Map(candidates.map((c) => [c.id, c.sellerId]));

    const sellerAInTop5 = countSellerInTopN(results, sellerById, 5, sellerA);
    const sellerBInTop5 = countSellerInTopN(results, sellerById, 5, sellerB);

    assert.ok(
      sellerAInTop5 <= 3,
      `Expected at most 3 items from seller A in top 5, got ${sellerAInTop5}`,
    );
    assert.ok(
      sellerBInTop5 <= 3,
      `Expected at most 3 items from seller B in top 5, got ${sellerBInTop5}`,
    );
    // Top 5 should have exactly 5 items.
    assert.equal(results.slice(0, 5).length, 5);
  });

  // ── 2. Bad outcome suppression ───────────────────────────────────────────
  it('bad outcome suppression: a candidate from a seller with a recent dispute should rank lower than an equivalent candidate from a clean seller', () => {
    const candidates: RerankCandidate[] = [
      makeCandidate({
        id: 'clean',
        sellerId: 'clean-seller',
        sellerRating: 4.5,
        sellerHasRecentDispute: false,
        category: 'tops',
        createdAt: '2025-01-12T12:00:00.000Z',
      }),
      makeCandidate({
        id: 'disputed',
        sellerId: 'disputed-seller',
        sellerRating: 4.5,
        sellerHasRecentDispute: true,
        category: 'tops',
        createdAt: '2025-01-12T12:00:00.000Z',
      }),
    ];

    const results = rerankCandidates(candidates, EMPTY_PROFILE, {
      generatedAt: GENERATED_AT,
    });

    const cleanPos = results.find((r) => r.id === 'clean')!.position;
    const disputedPos = results.find((r) => r.id === 'disputed')!.position;

    assert.ok(
      cleanPos < disputedPos,
      `Expected clean seller to rank higher (position ${cleanPos}) than disputed seller (position ${disputedPos})`,
    );

    // The disputed candidate's bad_outcome_suppression component should be 0.
    const disputedScores = results.find((r) => r.id === 'disputed')!.componentScores;
    assert.equal(disputedScores.badOutcomeSuppression, 0);
  });

  // ── 3. Freshness ─────────────────────────────────────────────────────────
  it('freshness: a newer item with equal signals should rank slightly higher', () => {
    const candidates: RerankCandidate[] = [
      makeCandidate({
        id: 'older',
        sellerId: 'seller-1',
        category: 'tops',
        createdAt: '2024-12-01T12:00:00.000Z', // ~45 days old
        sellerRating: 4.0,
      }),
      makeCandidate({
        id: 'newer',
        sellerId: 'seller-2',
        category: 'tops',
        createdAt: '2025-01-14T12:00:00.000Z', // ~1 day old
        sellerRating: 4.0,
      }),
    ];

    const results = rerankCandidates(candidates, EMPTY_PROFILE, {
      generatedAt: GENERATED_AT,
    });

    const newerPos = results.find((r) => r.id === 'newer')!.position;
    const olderPos = results.find((r) => r.id === 'older')!.position;

    assert.ok(
      newerPos < olderPos,
      `Expected newer item to rank higher (position ${newerPos}) than older item (position ${olderPos})`,
    );

    // The newer item should have a higher freshness component score.
    const newerFreshness = results.find((r) => r.id === 'newer')!.componentScores.freshness;
    const olderFreshness = results.find((r) => r.id === 'older')!.componentScores.freshness;
    assert.ok(newerFreshness > olderFreshness, 'Newer item should have higher freshness score');
  });

  // ── 4. Purchase relevance ────────────────────────────────────────────────
  it('purchase relevance: an item in a previously-purchased category should rank higher than one in an unrelated category', () => {
    const profile: RerankUserProfile = {
      purchasedCategories: new Set(['dresses']),
      savedCategories: new Set<string>(),
      viewedCategories: new Set<string>(),
    };

    const candidates: RerankCandidate[] = [
      makeCandidate({
        id: 'unrelated',
        sellerId: 'seller-1',
        category: 'electronics',
        createdAt: '2025-01-12T12:00:00.000Z',
        sellerRating: 4.0,
      }),
      makeCandidate({
        id: 'relevant',
        sellerId: 'seller-2',
        category: 'dresses',
        createdAt: '2025-01-12T12:00:00.000Z',
        sellerRating: 4.0,
      }),
    ];

    const results = rerankCandidates(candidates, profile, {
      generatedAt: GENERATED_AT,
    });

    const relevantPos = results.find((r) => r.id === 'relevant')!.position;
    const unrelatedPos = results.find((r) => r.id === 'unrelated')!.position;

    assert.ok(
      relevantPos < unrelatedPos,
      `Expected item in purchased category to rank higher (position ${relevantPos}) than unrelated item (position ${unrelatedPos})`,
    );

    // The relevant item's purchase_relevance component should be 1.0.
    const relevantScores = results.find((r) => r.id === 'relevant')!.componentScores;
    assert.equal(relevantScores.purchaseRelevance, 1);
  });

  // ── 5. Determinism ───────────────────────────────────────────────────────
  it('determinism: same input always produces same output', () => {
    const candidates: RerankCandidate[] = [
      makeCandidate({ id: 'c1', sellerId: 's1', category: 'tops', sellerRating: 4.0 }),
      makeCandidate({ id: 'c2', sellerId: 's2', category: 'dresses', sellerRating: 3.5 }),
      makeCandidate({ id: 'c3', sellerId: 's1', category: 'tops', sellerRating: 4.5 }),
      makeCandidate({ id: 'c4', sellerId: 's3', category: 'shoes', sellerRating: null }),
    ];

    const profile: RerankUserProfile = {
      purchasedCategories: new Set(['tops']),
      savedCategories: new Set(['shoes']),
      viewedCategories: new Set(['dresses']),
    };

    const run1 = rerankCandidates(candidates, profile, { generatedAt: GENERATED_AT });
    const run2 = rerankCandidates(candidates, profile, { generatedAt: GENERATED_AT });
    const run3 = rerankCandidates(candidates, profile, { generatedAt: GENERATED_AT });

    assert.deepEqual(run1, run2);
    assert.deepEqual(run2, run3);
  });
});
