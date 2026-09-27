/**
 * Feed ranking — the local personalization layer. Wishlist likes resolve
 * to brand/category/subcategory affinity, the follows store contributes
 * seller affinity, and recently-viewed items contribute a strictly weaker
 * category/subcategory tier; listing units that match get a modest boost,
 * dealt through the feed at a fixed stride rather than clustered at the
 * top — the like/view→suggest loop, kept honest (no "AI" labeling).
 *
 * The "Not interested" follow-up reasons dampen similar items here too:
 * facet down-weights (−3), category-bound size demotions (−2) and
 * per-category price ceilings (−2) all push matches to the tail of the
 * listing slots — a down-rank, never a fabricated removal.
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
import type { PriceCeiling, SizeDownweight } from '@/lib/feedPrefs';

export interface FeedRankSignals {
  /** Wishlist listing ids — resolved to brand/category/subcategory affinity. */
  likedIds: readonly string[];
  /** Followed user ids — matched against listing.sellerId. */
  followingIds: readonly string[];
  /** Recently-viewed listing ids — weaker implicit signal than a like;
   *  resolves to category/subcategory affinity only (no brand — a glance
   *  at one Levi's jacket isn't a Levi's affinity yet). */
  viewedIds?: readonly string[];
  /** Lowercase facet keys (category/brand) the user asked to see fewer of —
   *  matching listings demote to the tail of the listing slots ("Show less
   *  like this" is a down-rank, not a suppression). */
  downweightedKeys?: readonly string[];
  /** Category-bound size dampens from "Not my size" feedback. */
  downweightedSizes?: readonly SizeDownweight[];
  /** Category price ceilings from "Too expensive" feedback. */
  priceCeilings?: readonly PriceCeiling[];
}

/** A boosted listing lands in every Nth listing slot — interleaved, not clustered. */
const BOOST_STRIDE = 4;

interface Affinity {
  brands: ReadonlySet<string>;
  categories: ReadonlySet<string>;
  subcategories: ReadonlySet<string>;
  sellers: ReadonlySet<string>;
  /** Weaker implicit tier — categories/subcategories from PDP views. */
  viewedCategories: ReadonlySet<string>;
  viewedSubcategories: ReadonlySet<string>;
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
  const viewedCategories = new Set<string>();
  const viewedSubcategories = new Set<string>();
  for (const id of signals.viewedIds ?? []) {
    const viewed = listingById(id);
    if (!viewed) continue;
    viewedCategories.add(viewed.category.toLowerCase());
    if (viewed.subcategory) viewedSubcategories.add(viewed.subcategory.toLowerCase());
  }
  const sellers = new Set(signals.followingIds);
  if (
    brands.size +
      categories.size +
      subcategories.size +
      sellers.size +
      viewedCategories.size +
      viewedSubcategories.size ===
    0
  ) {
    return null;
  }
  return { brands, categories, subcategories, sellers, viewedCategories, viewedSubcategories };
}

/** Modest additive weighting — a followed seller or a liked brand outweighs
 *  a shared category; a view is worth half a save (implicit ≠ explicit). */
function listingScore(
  listing: DiscoveryListingSummary,
  affinity: Affinity | null,
  downweighted: ReadonlySet<string>,
  downweightedSizes: readonly SizeDownweight[],
  priceCeilings: readonly PriceCeiling[],
): number {
  let score = 0;
  const category = listing.category.toLowerCase();
  const subcategory = listing.subcategory?.toLowerCase();
  if (affinity) {
    if (affinity.sellers.has(listing.sellerId)) score += 2;
    if (listing.brand && affinity.brands.has(listing.brand.toLowerCase())) score += 2;
    if (affinity.categories.has(category)) score += 1;
    if (subcategory && affinity.subcategories.has(subcategory)) score += 1;
    // Viewed-derived affinity is strictly weaker — same-category views add
    // half-weight, a matching subcategory view one full step.
    if (affinity.viewedCategories.has(category)) score += 0.5;
    if (subcategory && affinity.viewedSubcategories.has(subcategory)) score += 1;
  }
  if (
    downweighted.has(category) ||
    (listing.brand != null && downweighted.has(listing.brand.toLowerCase())) ||
    (subcategory != null && downweighted.has(subcategory))
  ) {
    score -= 3;
  }
  // "Not my size" — demote same-category listings carrying that size label.
  // Token-exact: 'l' must not mute 'xl', and 'w32 l30' matches only when
  // every token of the stored label appears in the listing's own label.
  const sizeTokens = (listing.size ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (
    sizeTokens.length > 0 &&
    downweightedSizes.some(
      (x) =>
        x.category === category &&
        x.size
          .split(/[^a-z0-9]+/)
          .filter(Boolean)
          .every((t) => sizeTokens.includes(t)),
    )
  ) {
    score -= 2;
  }
  // "Too expensive" — demote same-category listings priced at/above the
  // flagged item's price (the ceiling records the strongest stated bound).
  const price = listing.price;
  if (
    typeof price === 'number' &&
    priceCeilings.some((x) => x.category === category && price >= x.maxPrice)
  ) {
    score -= 2;
  }
  return score;
}

export function rankFeedUnits(
  units: readonly DiscoveryFeedUnit[],
  signals: FeedRankSignals,
): DiscoveryFeedUnit[] {
  const affinity = buildAffinity(signals);
  const downweighted = new Set(
    (signals.downweightedKeys ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean),
  );
  const downweightedSizes = signals.downweightedSizes ?? [];
  const priceCeilings = signals.priceCeilings ?? [];
  if (!affinity && downweighted.size === 0 && downweightedSizes.length === 0 && priceCeilings.length === 0) {
    return [...units];
  }

  const listingSlots: number[] = [];
  units.forEach((unit, i) => {
    if (unit.type === 'listing') listingSlots.push(i);
  });
  if (listingSlots.length === 0) return [...units];

  const scored = listingSlots.map((slot, order) => ({
    unit: units[slot],
    order, // original listing-sequence position — the stable tiebreak
    score: listingScore(
      (units[slot] as ListingFeedUnit).listing,
      affinity,
      downweighted,
      downweightedSizes,
      priceCeilings,
    ),
  }));
  const boosted = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  // Down-weighted units fall to the tail of the listing slots — demoted,
  // never removed (the suppression control is "Not interested").
  const demoted = scored.filter((s) => s.score < 0); // original order kept
  const neutral = scored.filter((s) => s.score === 0); // already in original order
  const rest = [...neutral, ...demoted];
  if (boosted.length === 0 && demoted.length === 0) return [...units];

  // Rewrite only the listing slots: boosted units deal in every
  // BOOST_STRIDE-th slot; the rest keep the original listing order with
  // demoted units trailing.
  const reranked: DiscoveryFeedUnit[] = [];
  let b = 0;
  let n = 0;
  for (let slot = 0; slot < scored.length; slot++) {
    const strideHit = (slot + 1) % BOOST_STRIDE === 0;
    if (b < boosted.length && (strideHit || n >= rest.length)) {
      reranked.push(boosted[b++].unit);
    } else {
      reranked.push(rest[n++].unit);
    }
  }

  const out = [...units];
  listingSlots.forEach((slot, i) => {
    out[slot] = reranked[i];
  });
  return out;
}
