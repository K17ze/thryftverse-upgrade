/**
 * Visual-search matching engine — fixture mode, all on-device.
 *
 * Honest port of backend/api/src/lib/visualSimilarity.ts intent:
 * the photo is decoded to a tiny canvas sample and reduced to a dominant
 * colour + luminance/contrast/aspect signature. Fixture listings can't be
 * pixel-matched (remote media, no offline features), so the match is
 * deterministic: each listing contributes the colour words its own text
 * names, and agreement is the distance between the detected dominant colour
 * and that vocabulary colour's canonical anchor. Category/brand cues come
 * from the filename or the modal values of the colour-ranked candidate set.
 *
 * Decomposed into modular units:
 * - engine/imageDecode.ts: Canvas and bitmap image decoding
 * - engine/colorFeatures.ts: Histogram, perceptual RGB metrics, feature extraction
 * - engine/attributeDetector.ts: Filename cues, category matching, detected attributes
 * - engine/visualFilters.ts: Constraint checks and manual filter predicates
 */

import type { Listing } from '@/lib/contracts/domain';
import type { VisualSearchRetrievalMeta } from '@/lib/api/services/visualSearch';
import { LISTINGS } from '@/lib/data/fixtures';
import type {
  DetectedAttribute,
  ImageFeatures,
  VisualSearchManualFilters,
} from './visualSearchTypes';
import { categoryMatches, colourAffinity } from './engine/attributeDetector';
import { passesManualFilters } from './engine/visualFilters';

export * from './engine/imageDecode';
export * from './engine/colorFeatures';
export * from './engine/attributeDetector';
export * from './engine/visualFilters';

export interface MatchOptions {
  /** Kinds the user removed — present attributes are hard filters. */
  inactive: ReadonlySet<DetectedAttribute['kind']>;
  attributes: DetectedAttribute[];
  regionApplied: boolean;
  /** Member-added filters — hard filters applied before the result cap,
   *  so a narrowed set still surfaces its best 24, not the top-24 minus. */
  manual?: VisualSearchManualFilters;
}

/**
 * Deterministic fixture matcher. Active attributes are hard filters —
 * colour is lenient toward listings that name no colour (can't disprove);
 * category/brand are exact textual matches. Ranking = weighted colour
 * affinity + attribute hits + a small popularity tiebreak. A framed region
 * shifts weight onto colour, since the user told us where to look.
 */
export function matchListings(
  features: ImageFeatures,
  { inactive, attributes, regionApplied, manual }: MatchOptions,
): Listing[] {
  const colorAttr = attributes.find((a) => a.kind === 'color');
  const categoryAttr = attributes.find((a) => a.kind === 'category');
  const brandAttr = attributes.find((a) => a.kind === 'brand');
  const colorOn = !!colorAttr && !inactive.has('color');
  const categoryOn = !!categoryAttr && !inactive.has('category');
  const brandOn = !!brandAttr && !inactive.has('brand');

  const w = regionApplied
    ? { color: 0.7, category: 0.15, brand: 0.1, popularity: 0.05 }
    : { color: 0.55, category: 0.25, brand: 0.15, popularity: 0.05 };

  const scored: { listing: Listing; score: number }[] = [];
  for (const listing of LISTINGS) {
    const affinity = colourAffinity(listing, features);
    const catHit = categoryAttr ? categoryMatches(listing, categoryAttr.value) : false;
    const brandHit =
      brandAttr && listing.brand ? listing.brand.toLowerCase() === brandAttr.value : false;

    if (colorOn && affinity >= 0 && affinity < 0.3) continue; // names a far colour
    if (categoryOn && !catHit) continue;
    if (brandOn && !brandHit) continue;
    if (manual && !passesManualFilters(listing, manual)) continue;

    // Listings with no colour word rank on a neutral base — included, but
    // below confident colour matches.
    const colourScore = affinity >= 0 ? affinity : 0.35;
    const popularity = Math.min(1, (listing.likes ?? 0) / 130);
    const score =
      w.color * colourScore +
      (catHit ? w.category : 0) +
      (brandHit ? w.brand : 0) +
      w.popularity * popularity;
    scored.push({ listing, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 24)
    .map((s) => s.listing);
}

/** Truthful summary line for the results header — same voice as mobile's
 *  honestNoteText. */
export function honestMatchNote(regionApplied: boolean): string {
  return regionApplied
    ? 'Matched by colour similarity within the framed area — deterministic heuristic, not AI.'
    : 'Matched by colour similarity — deterministic heuristic, not AI. Fixture catalogue.';
}

/** Live-serve disclosure — translates POST /visual-search's retrievalMeta
 *  into the same honest grammar as mobile's honestNoteText. The heuristic
 *  method is named a heuristic (never AI); 'filter_only' means no usable
 *  image scored, so the line says what matched instead — preferring the
 *  backend's own `note` when it supplied one. */
export function liveMatchNote(
  meta: VisualSearchRetrievalMeta | null,
  note: string | null,
): string {
  if (meta?.method === 'heuristic_color_features') {
    // queryScope is server-confirmed — the framed area is only claimed
    // when the crop actually ran (a degenerate region falls back to
    // whole-image scoring).
    return meta.queryScope === 'region'
      ? 'Results matched by colour similarity within the framed area — heuristic, not AI.'
      : 'Results matched by colour similarity — heuristic, not AI.';
  }
  if (meta?.method === 'filter_only') {
    return note ?? 'Results matched by category, brand & description.';
  }
  return note ?? 'Results matched by category, brand & description.';
}
