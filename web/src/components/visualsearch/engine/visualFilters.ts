import type { Listing } from '@/lib/contracts/domain';
import { listingColourNames } from '@/components/filters/filterTypes';
import type { DetectedAttribute, VisualSearchManualFilters } from '../visualSearchTypes';
import { categoryMatches } from './attributeDetector';

// ── Manual + detected refinements ────────────────────────────────────────

/** The haystack mobile's filterCachedListings uses for query/style —
 *  the listing's own text, nothing else. */
export function listingSearchText(listing: Listing): string {
  return [listing.title, listing.description, listing.brand, listing.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Manual-filter predicate — mobile useVisualSearchFilters parity, kept in
 * the engine so fixture matching (inside matchListings, before the result
 * cap) and the live-mode post-filter of serve.items run the exact same
 * rule. Works on any Listing — no fixture tables — so a live row is held
 * to the same promise the panel makes.
 *
 *   query    → substring over the listing's own text
 *   category → the detected chip's categoryMatches (category, subcategory
 *              or title — the catalogue stores a mixed vocabulary)
 *   brand    → substring, the browse facet's rule
 *   price    → numeric bounds on l.price
 *   color    → strict "the listing's own text names the colour" — the
 *              browse colour facet's listingColourNames rule
 *   style    → substring over the same text haystack as mobile
 */
export function passesManualFilters(
  listing: Listing,
  manual: VisualSearchManualFilters,
): boolean {
  const text = listingSearchText(listing);
  const q = manual.query.trim().toLowerCase();
  if (q && !text.includes(q)) return false;
  if (manual.category && !categoryMatches(listing, manual.category)) return false;
  const brand = manual.brand.trim().toLowerCase();
  if (brand && !(listing.brand ?? '').toLowerCase().includes(brand)) return false;
  if (manual.priceMin != null && listing.price < manual.priceMin) return false;
  if (manual.priceMax != null && listing.price > manual.priceMax) return false;
  if (manual.color && !listingColourNames(listing).includes(manual.color)) {
    return false;
  }
  if (manual.style && !text.includes(manual.style.toLowerCase())) return false;
  return true;
}

/**
 * The detected-attribute hard filters that can be re-derived for ANY
 * listing (not just fixture rows): category and brand chips. Colour is
 * excluded — affinity needs the photo's feature vector against the
 * fixture colour table, which live listings don't have; in live mode the
 * colour chip already narrows candidates server-side via facets.color.
 */
export function passesDetectedConstraints(
  listing: Listing,
  attributes: DetectedAttribute[],
  inactive: ReadonlySet<DetectedAttribute['kind']>,
): boolean {
  const categoryAttr = attributes.find((a) => a.kind === 'category');
  const brandAttr = attributes.find((a) => a.kind === 'brand');
  if (
    categoryAttr &&
    !inactive.has('category') &&
    !categoryMatches(listing, categoryAttr.value)
  ) {
    return false;
  }
  if (
    brandAttr &&
    !inactive.has('brand') &&
    (listing.brand ?? '').toLowerCase() !== brandAttr.value
  ) {
    return false;
  }
  return true;
}
