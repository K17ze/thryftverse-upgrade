import { describe, expect, it } from 'vitest';
import type { Listing } from '../domain';
import { assembleDiscoveryFeed } from '../utils/discoveryFeedAssembly';

const listing = (id: string, extra: Partial<Listing> = {}): Listing =>
  ({
    id,
    sellerId: `seller-${id}`,
    title: `Listing ${id}`,
    images: ['https://img.test/x.jpg'],
    ...extra,
  }) as unknown as Listing;

const listingIds = (units: ReturnType<typeof assembleDiscoveryFeed>) =>
  units.filter((u) => u.type === 'listing').map((u) => u.id);

describe('assembleDiscoveryFeed — listing dedup', () => {
  it('renders a duplicated listing id exactly once', () => {
    // Mixed recommendation/cursor sources can serve the same listing twice;
    // the feed must never render duplicate tiles.
    const units = assembleDiscoveryFeed(
      [listing('a'), listing('b'), listing('a'), listing('c'), listing('b')],
      2,
    );
    expect(listingIds(units)).toEqual(['listing:a', 'listing:b', 'listing:c']);
  });

  it('preserves first-occurrence ordering', () => {
    const units = assembleDiscoveryFeed(
      [listing('x'), listing('a'), listing('x')],
      2,
    );
    expect(listingIds(units)).toEqual(['listing:x', 'listing:a']);
  });

  it('produces stable unique unit ids for a mixed listing set', () => {
    const units = assembleDiscoveryFeed(
      [listing('a'), listing('a'), listing('b')],
      2,
    );
    const ids = units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
