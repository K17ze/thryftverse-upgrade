/**
 * Feed ranking — the local personalization layer (port of the web's
 * rankFeedUnits). Wishlist likes resolve to brand/category/subcategory
 * affinity and the follows store contributes seller affinity; listings
 * that match get a modest boost, dealt through the feed at a fixed stride
 * rather than clustered at the top — the like→suggest loop, kept honest
 * (no "AI" labeling).
 *
 * Authored units (looks, rails, editorial) hold their exact positions —
 * only listing units move, and only into listing slots. Pure and
 * deterministic: same inputs, same order.
 */

export interface FeedRankSignals {
  /** Wishlist listing ids — resolved to brand/category/subcategory affinity. */
  likedIds: readonly string[];
  /** Followed seller ids — matched against listing.sellerId. */
  followingIds: readonly string[];
}

/** The listing projection a unit is scored against. */
export interface FeedRankListing {
  id: string;
  sellerId: string;
  brand: string | null;
  category: string;
  subcategory?: string | null;
}

export interface FeedRankOptions<T> {
  /**
   * Projects a unit onto the listing fields it is scored against.
   * Authored units return null and hold their position.
   */
  listingOf: (unit: T) => FeedRankListing | null;
  /** Catalogue the wishlist ids resolve against for affinity. */
  catalogue: readonly FeedRankListing[];
}

/** A boosted listing lands in every Nth listing slot — interleaved, not clustered. */
const BOOST_STRIDE = 4;

interface Affinity {
  brands: ReadonlySet<string>;
  categories: ReadonlySet<string>;
  subcategories: ReadonlySet<string>;
  sellers: ReadonlySet<string>;
}

function buildAffinity(
  signals: FeedRankSignals,
  resolveById: (id: string) => FeedRankListing | null,
): Affinity | null {
  const brands = new Set<string>();
  const categories = new Set<string>();
  const subcategories = new Set<string>();
  for (const id of signals.likedIds) {
    const liked = resolveById(id);
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
function listingScore(listing: FeedRankListing, affinity: Affinity): number {
  let score = 0;
  if (affinity.sellers.has(listing.sellerId)) score += 2;
  if (listing.brand && affinity.brands.has(listing.brand.toLowerCase())) score += 2;
  if (affinity.categories.has(listing.category.toLowerCase())) score += 1;
  const subcategory = listing.subcategory?.toLowerCase();
  if (subcategory && affinity.subcategories.has(subcategory)) score += 1;
  return score;
}

export function rankFeedUnits<T>(
  units: readonly T[],
  signals: FeedRankSignals,
  options: FeedRankOptions<T>,
): T[] {
  const index = new Map<string, FeedRankListing>();
  for (const listing of options.catalogue) {
    if (!index.has(listing.id)) index.set(listing.id, listing);
  }
  const affinity = buildAffinity(signals, (id) => index.get(id) ?? null);
  if (!affinity) return [...units];

  const listingSlots: number[] = [];
  units.forEach((unit, i) => {
    if (options.listingOf(unit) !== null) listingSlots.push(i);
  });
  if (listingSlots.length === 0) return [...units];

  const scored = listingSlots.map((slot, order) => ({
    unit: units[slot],
    order, // original listing-sequence position — the stable tiebreak
    score: listingScore(options.listingOf(units[slot]) as FeedRankListing, affinity),
  }));
  const boosted = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  if (boosted.length === 0) return [...units];
  const neutral = scored.filter((s) => s.score === 0); // already in original order

  // Rewrite only the listing slots: boosted units deal in every
  // BOOST_STRIDE-th slot; the rest keep the original listing order.
  const reranked: T[] = [];
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
