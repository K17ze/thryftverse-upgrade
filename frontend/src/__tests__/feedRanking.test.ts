import { describe, it, expect } from 'vitest';
import { rankFeedUnits, type FeedRankListing } from '../presentation/feedRanking';

interface TestUnit {
  id: string;
  listing: FeedRankListing | null; // null = authored unit, holds position
}

const unit = (id: string, listing: FeedRankListing | null): TestUnit => ({ id, listing });

const listing = (
  id: string,
  sellerId: string,
  brand: string | null,
  category: string,
  subcategory?: string,
): FeedRankListing => ({ id, sellerId, brand, category, subcategory });

const PROJECT = (u: TestUnit) => u.listing;

// Affinity source: l1 is an Acne tops/knitwear listing from seller s1.
const CATALOGUE: FeedRankListing[] = [
  listing('l1', 's1', 'Acne', 'tops', 'knitwear'),
  listing('l2', 's2', 'Ganni', 'dresses'),
  listing('l3', 's3', null, 'bags'),
];

describe('rankFeedUnits', () => {
  it('returns a copy unchanged when there are no signals', () => {
    const units = [unit('a', CATALOGUE[0]), unit('b', CATALOGUE[1])];
    const out = rankFeedUnits(units, { likedIds: [], followingIds: [] }, {
      listingOf: PROJECT,
      catalogue: CATALOGUE,
    });
    expect(out).toEqual(units);
    expect(out).not.toBe(units);
  });

  it('returns a copy unchanged when no listing matches the affinity', () => {
    const units = [unit('a', CATALOGUE[2]), unit('b', CATALOGUE[1])];
    const out = rankFeedUnits(units, { likedIds: ['l1'], followingIds: [] }, {
      listingOf: PROJECT,
      catalogue: CATALOGUE,
    });
    expect(out.map((u) => u.id)).toEqual(['a', 'b']);
  });

  it('deals a boosted listing into the 4th listing slot instead of clustering at the top', () => {
    const neutral = Array.from({ length: 8 }, (_, i) =>
      listing(`n${i}`, `seller${i}`, 'Unrelated', 'shoes'));
    const liked = listing('liked', 'sellerX', 'Acne', 'shoes');
    const units = [...neutral, liked].map((l) => unit(l.id, l));
    const out = rankFeedUnits(
      units,
      { likedIds: ['l1'], followingIds: [] },
      { listingOf: PROJECT, catalogue: [...CATALOGUE, liked] },
    );
    expect(out[3].id).toBe('liked'); // 4th listing slot — first stride hit
    expect(out.filter((u) => u.id === 'liked')).toHaveLength(1);
    // The remaining slots keep the original listing order.
    expect(out.filter((u) => u.id !== 'liked').map((u) => u.id)).toEqual(
      neutral.map((l) => l.id),
    );
  });

  it('weights seller+brand affinity above brand-only above category-only', () => {
    const categoryOnly = listing('c', 's9', null, 'tops'); // +1
    const brandOnly = listing('b', 's9', 'Acne', 'shoes'); // +2
    const sellerAndBrand = listing('d', 's1', 'Acne', 'shoes'); // +2 +2
    const units = [unit('n0', listing('n0', 's9', null, 'shoes')), unit('n1', listing('n1', 's9', null, 'shoes')), unit('c', categoryOnly), unit('b', brandOnly), unit('d', sellerAndBrand)];
    const out = rankFeedUnits(
      units,
      { likedIds: ['l1'], followingIds: ['s1'] },
      { listingOf: PROJECT, catalogue: CATALOGUE },
    );
    // Boosted units deal in score order from the 3rd listing slot on.
    expect(out.map((u) => u.id)).toEqual(['n0', 'n1', 'd', 'b', 'c']);
  });

  it('breaks equal scores by original listing order', () => {
    const first = listing('first', 's9', 'Acne', 'shoes'); // +2
    const second = listing('second', 's8', 'Acne', 'shoes'); // +2
    const units = [unit('second', second), unit('first', first)];
    const out = rankFeedUnits(
      units,
      { likedIds: ['l1'], followingIds: [] },
      { listingOf: PROJECT, catalogue: CATALOGUE },
    );
    // Both boosted; the tie keeps 'second' ahead (it appeared first).
    expect(out.map((u) => u.id)).toEqual(['second', 'first']);
  });

  it('keeps authored units in their exact positions', () => {
    const match = listing('m', 's1', 'Acne', 'tops');
    const neutral = (id: string) => listing(id, 's9', null, 'shoes');
    const units = [
      unit('look', null),
      unit('n0', neutral('n0')),
      unit('n1', neutral('n1')),
      unit('m', match),
      unit('n2', neutral('n2')),
      unit('editorial', null),
    ];
    const out = rankFeedUnits(
      units,
      { likedIds: ['l1'], followingIds: [] },
      { listingOf: PROJECT, catalogue: [...CATALOGUE, match] },
    );
    expect(out[0].id).toBe('look');
    expect(out[5].id).toBe('editorial');
    // The boosted listing deals into the 4th listing slot (index 4).
    expect(out[4].id).toBe('m');
    expect(out.filter((u) => u.id === 'n0' || u.id === 'n1' || u.id === 'n2').map((u) => u.id))
      .toEqual(['n0', 'n1', 'n2']);
  });

  it('is deterministic — same inputs, same order', () => {
    const match = listing('match', 's1', 'Acne', 'tops');
    const neutral = listing('neutral', 's9', null, 'shoes');
    const units = [neutral, match, neutral].map((l, i) => unit(`${l.id}_${i}`, l));
    const signals = { likedIds: ['l1'], followingIds: [] };
    const options = { listingOf: PROJECT, catalogue: [...CATALOGUE, match] };
    expect(rankFeedUnits(units, signals, options)).toEqual(
      rankFeedUnits(units, signals, options),
    );
  });
});
