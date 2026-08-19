/**
 * Discovery Feed Assembly — `Listing[]` → heterogeneous `DiscoveryFeedUnit[]`.
 *
 * This is the layer that makes Discovery a visual-discovery canvas instead of
 * a 2-column catalogue. It is the single place where feed-unit rhythm and
 * span decisions are made for the Discover tab, so the renderer
 * (PinterestMasonryGrid) stays a pure function of `DiscoveryFeedUnit[]`.
 *
 * Truthful-UI constraints (AGENTS.md §11, discoveryFeedUnit.ts):
 *  - Editorial / look / poster units are NEVER invented here. They render
 *    only when the backend sends valid data. The client never fabricates
 *    editorial media or a fake inclusion reason.
 *  - `recommendation_break` is a text eyebrow only — no media, no fabricated
 *    personalization reason. Labels are honest section dividers
 *    ("More to explore", "Fresh finds"), not fake "Because you saved X".
 *  - Hero spans are art direction over REAL media geometry: a listing with a
 *    landscape media aspect (≥1.2) may span both columns. No fabricated
 *    imagery, no fake aspect ratios.
 *
 * Stability across pagination:
 *  - Break positions are based on the absolute listing index, so appending
 *    more pages does not reshuffle earlier units.
 *  - Hero eligibility is per-listing (real media aspect), so it is stable.
 */

import type { Listing } from '../domain';
import {
  buildListingFeedUnit,
  type DiscoveryFeedUnit,
  type ListingFeedUnit,
  type RecommendationBreakFeedUnit,
} from '../contracts/discoveryFeedUnit';
import { resolveListingMediaAspectRatio } from './listingMediaGeometry';

/**
 * Aspect ratio at or above which a listing's real media is considered
 * landscape enough to anchor a full-width hero row. Below this, the listing
 * stays a single-column masonry tile (portrait/square media reads better in a
 * narrow column than stretched across two).
 */
const HERO_ASPECT_THRESHOLD = 1.2;

/**
 * Minimum number of single-column listings between hero rows, so heroes
 * remain a deliberate rhythm break rather than dominating the feed.
 */
const HERO_MIN_GAP = 8;

/**
 * Number of listings between full-width context-break eyebrows.
 * Tuned to 8 to match Pinterest's 2026 feed rhythm — a break lands often
 * enough to segment the feed into scannable chapters without feeling
 * interruptive.
 */
const BREAK_INTERVAL = 8;

/**
 * Number of listings between full-width "Creator spotlight" eyebrows.
 * A slower, deliberate cadence (every 16 listings) so creator spotlights
 * read as an occasional rhythm break, not a repeating header. 16 is a
 * multiple of BREAK_INTERVAL, so at that position the spotlight replaces
 * the regular break rather than stacking on top of it.
 */
const CREATOR_SPOTLIGHT_INTERVAL = 16;

/**
 * Honest, generic section-divider labels (no fabricated personalization).
 * The cycle rotates through these by break index so consecutive breaks
 * don't repeat the same label — variety without fake personalization.
 */
const BREAK_LABELS = [
  'More to explore',
  'Fresh finds',
  'Recently added',
  'Trending now',
  'New arrivals',
] as const;

/** Label for the creator-spotlight break (text-only eyebrow, no media). */
const CREATOR_SPOTLIGHT_LABEL = 'Creators to watch';

/**
 * Assemble a heterogeneous discovery feed from a list of marketplace
 * listings. Listings become `ListingFeedUnit`s; full-width
 * `RecommendationBreakFeedUnit` eyebrows are interleaved at a deliberate
 * rhythm; landscape-media listings are promoted to hero (span 2) units,
 * throttled so heroes stay a rhythm break, not the norm.
 *
 * @param listings  The raw marketplace listings (cached or fresh).
 * @param numColumns  The masonry column count (used to set full-width spans).
 */
export function assembleDiscoveryFeed(
  listings: Listing[],
  numColumns = 2,
): DiscoveryFeedUnit[] {
  if (listings.length === 0) return [];

  const units: DiscoveryFeedUnit[] = [];
  let listingsSinceHero = HERO_MIN_GAP; // allow the first eligible listing to be a hero

  listings.forEach((listing, index) => {
    const aspectRatio = resolveListingMediaAspectRatio(listing);
    const isLandscape = aspectRatio >= HERO_ASPECT_THRESHOLD;
    const canBeHero = isLandscape && listingsSinceHero >= HERO_MIN_GAP;

    const unit = buildListingFeedUnit(
      listing,
      (listing.images ?? [])[0] ?? '',
      aspectRatio,
      listing.isSold ? 'sold' : undefined,
    );

    if (canBeHero) {
      unit.span = numColumns;
      listingsSinceHero = 0;
    } else {
      listingsSinceHero += 1;
    }

    units.push(unit);

    // Inject a context-break eyebrow after every BREAK_INTERVAL listings,
    // but never as the very last unit (a trailing eyebrow reads as a bug).
    // Every CREATOR_SPOTLIGHT_INTERVAL listings, a "Creator spotlight"
    // break replaces the regular break so the two full-width units never
    // stack into a wall.
    const afterIndex = index + 1;
    if (afterIndex < listings.length) {
      if (afterIndex % CREATOR_SPOTLIGHT_INTERVAL === 0) {
        units.push(buildCreatorSpotlightBreak(afterIndex, numColumns));
        // A break is itself a rhythm reset; don't let a hero immediately
        // follow it or the two full-width units stack into a wall.
        listingsSinceHero = Math.max(listingsSinceHero, 2);
      } else if (afterIndex % BREAK_INTERVAL === 0) {
        units.push(buildRecommendationBreak(afterIndex, numColumns));
        listingsSinceHero = Math.max(listingsSinceHero, 2);
      }
    }
  });

  return units;
}

function buildRecommendationBreak(
  listingCountBefore: number,
  numColumns: number,
): RecommendationBreakFeedUnit {
  const label =
    BREAK_LABELS[Math.floor(listingCountBefore / BREAK_INTERVAL) % BREAK_LABELS.length];
  return {
    id: `break:${listingCountBefore}`,
    type: 'recommendation_break',
    label,
    span: numColumns,
  };
}

/**
 * Build a full-width "Creator spotlight" break. This is a text-only eyebrow
 * (no fabricated media — truthful UI): it signals that creator content
 * follows, but the client never invents editorial imagery. It reuses the
 * `RecommendationBreakFeedUnit` shape so the renderer treats it as the same
 * full-width eyebrow primitive, just with a distinct, slower cadence.
 */
function buildCreatorSpotlightBreak(
  listingCountBefore: number,
  numColumns: number,
): RecommendationBreakFeedUnit {
  return {
    id: `creator-spotlight:${listingCountBefore}`,
    type: 'recommendation_break',
    label: CREATOR_SPOTLIGHT_LABEL,
    span: numColumns,
  };
}

/**
 * Narrow a `DiscoveryFeedUnit` to its `ListingFeedUnit` variant, or null.
 * Used by the renderer to recover the listing payload for listing tiles.
 */
export function asListingUnit(
  unit: DiscoveryFeedUnit,
): ListingFeedUnit | null {
  return unit.type === 'listing' ? (unit as ListingFeedUnit) : null;
}
