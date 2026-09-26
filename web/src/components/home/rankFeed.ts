/**
 * Feed ranking — the local personalization layer. Wishlist likes resolve
 * to brand/category/subcategory affinity and the follows store contributes
 * seller affinity; listing units that match get a modest boost, dealt
 * through the feed at a fixed stride rather than clustered at the top —
 * the like→suggest loop, kept honest (no "AI" labeling).
 *
 * Authored units (looks, posters, moodboards, editorial, recommendation
 * breaks) hold their exact positions — only listing units move, and only
 * into listing slots. Pure and deterministic: same inputs, same order.
 */

import type {
  DiscoveryFeedUnit,
  DiscoveryListingSummary,
  ListingFeedUnit,
} from '@/lib/contracts/domain';
import { listingById } from '@/lib/data/fixtures';

export interface FeedRankSignals {
  /** Wishlist listing ids — resolved to brand/category/subcategory affinity. */
  likedIds: readonly string[];
  /** Followed user ids — matched against listing.sellerId. */
  followingIds: readonly string[];
}

/** A boosted listing lands in every Nth listing slot — interleaved, not clustered. */
const BOOST_STRIDE = 4;

interface Affinity {
  brands: ReadonlySet<string>;
  categories: ReadonlySet<string>;
  subcategories: ReadonlySet<string>;
  sellers: ReadonlySet<string>;
}

function buildAffinity(signals: FeedRankSignals): Affinity | null {
  const brands = new Set<string>();
  const categories = new Set<string>();
  const subcategories = new Set<string>();
  for (const id of signals.likedIds) {
    const liked = listingById(id);
    if (!liked) continue;
    if (liked.brand) brands.add(liked.brand.toLowerCase());
    categories.add(liked.category.toLowerCase());
    if (liked.subcategory) subcategories.add(liked.subcategory.toLowerCase());
  }
  const sellers = new Set(signals.followingIds);
  if (brands.size + categories.size + subcategories.size + sellers.size === 0) {
    return null;
  }
  return { brands, categories, subcategories, sellers };
}

/** Modest additive weighting — a followed seller or a liked brand outweighs a shared category. */
function listingScore(listing: DiscoveryListingSummary, affinity: Affinity): number {
  let score = 0;
  if (affinity.sellers.has(listing.sellerId)) score += 2;
  if (listing.brand && affinity.brands.has(listing.brand.toLowerCase())) score += 2;
  if (affinity.categories.has(listing.category.toLowerCase())) score += 1;
  const subcategory = listing.subcategory?.toLowerCase();
  if (subcategory && affinity.subcategories.has(subcategory)) score += 1;
  return score;
}

export function rankFeedUnits(
  units: readonly DiscoveryFeedUnit[],
  signals: FeedRankSignals,
): DiscoveryFeedUnit[] {
  const affinity = buildAffinity(signals);
  if (!affinity) return [...units];

  const listingSlots: number[] = [];
  units.forEach((unit, i) => {
    if (unit.type === 'listing') listingSlots.push(i);
  });
  if (listingSlots.length === 0) return [...units];

  const scored = listingSlots.map((slot, order) => ({
    unit: units[slot],
    order, // original listing-sequence position — the stable tiebreak
    score: listingScore((units[slot] as ListingFeedUnit).listing, affinity),
  }));
  const boosted = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  if (boosted.length === 0) return [...units];
  const neutral = scored.filter((s) => s.score === 0); // already in original order

  // Rewrite only the listing slots: boosted units deal in every
  // BOOST_STRIDE-th slot; the rest keep the original listing order.
  const reranked: DiscoveryFeedUnit[] = [];
  let b = 0;
  let n = 0;
  for (let slot = 0; slot < scored.length; slot++) {
    const strideHit = (slot + 1) % BOOST_STRIDE === 0;
    if (b < boosted.length && (strideHit || n >= neutral.length)) {
      reranked.push(boosted[b++].unit);
    } else {
      reranked.push(neutral[n++].unit);
    }
  }

  const out = [...units];
  listingSlots.forEach((slot, i) => {
    out[slot] = reranked[i];
  });
  return out;
}
