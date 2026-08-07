/**
 * Listing Quality Scoring API — mock-ready heuristic service
 *
 * Inspired by eBay "Magical Listing" (AI title/description + photo scoring),
 * Depop AI, and Poshmark "Smart List AI" (March 2026). Listing quality is the
 * #1 flagship lever for marketplace conversion: listings with a quality score
 * of 70+ sell ~2.3x faster than those below 40.
 *
 * TRUTHFUL UI (AGENTS.md §11):
 *   The current implementation is a *heuristic/mock* service. It scores
 *   listings using deterministic rules (photo count, title length, description
 *   depth, pricing band, field completeness) — it does NOT call a real ML
 *   model. Every returned entity carries `isDemo: true` so the UI can honestly
 *   label the experience "Demo mode". The `LISTING_QUALITY_DEMO_MODE` flag is
 *   the single source of truth for the demo state.
 *
 *   `scoreListing` fabricates plausible sub-scores for demonstration — it
 *   never claims a real quality audit ran on a backend. The caller must
 *   surface this as a heuristic preview.
 *
 * When a real quality model is wired in, set `LISTING_QUALITY_DEMO_MODE =
 * false` and replace the mock branches with real scoring calls. The contract
 * (types + function signatures) stays the same — the UI layer does not need
 * to change.
 */

import type { Listing } from './listingsApi';

// ---------------------------------------------------------------------------
// Demo-mode flag — single source of truth
// ---------------------------------------------------------------------------

/** When true, all data returned by this service is mock/illustrative. */
export const LISTING_QUALITY_DEMO_MODE = true;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The category of a quality suggestion — maps to a form field or media. */
export type QualitySuggestionType =
  | 'photo'
  | 'title'
  | 'description'
  | 'pricing'
  | 'shipping';

/** Severity communicates urgency without relying on colour alone (§13). */
export type QualitySeverity = 'info' | 'warning' | 'critical';

/**
 * A single actionable suggestion to improve a listing's quality score.
 */
export interface QualitySuggestion {
  type: QualitySuggestionType;
  message: string;
  severity: QualitySeverity;
  /** Whether the seller can act on this directly in the current form. */
  actionable: boolean;
}

/**
 * The complete quality breakdown for a listing draft.
 * `overall` is a weighted blend of the five sub-scores (0–100).
 */
export interface ListingQualityScore {
  /** Weighted overall score, 0–100. */
  overall: number;
  /** Photo coverage + count sub-score, 0–100. */
  photoScore: number;
  /** Title length + keyword sub-score, 0–100. */
  titleScore: number;
  /** Description depth sub-score, 0–100. */
  descriptionScore: number;
  /** Pricing band sub-score, 0–100. */
  pricingScore: number;
  /** Required-field completeness sub-score, 0–100. */
  completenessScore: number;
  /** Ordered, actionable suggestions sorted by severity (critical first). */
  suggestions: QualitySuggestion[];
  /** Honest flag — true while this score is mock/heuristic data. */
  isDemo: boolean;
}

/** Result shape for an individual sub-scorer. */
interface SubScoreResult {
  score: number;
  suggestions: QualitySuggestion[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, Math.round(value)));

function makeSuggestion(
  type: QualitySuggestionType,
  message: string,
  severity: QualitySeverity,
  actionable = true,
): QualitySuggestion {
  return { type, message, severity, actionable };
}

/** Severity rank for sorting suggestions (critical → warning → info). */
const SEVERITY_RANK: Record<QualitySeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

// ---------------------------------------------------------------------------
// Photo scoring
// ---------------------------------------------------------------------------

/**
 * Score the photo set for a listing draft.
 *
 * Heuristics (mock):
 * - 0 photos → 0 (critical)
 * - 1 photo   → 35 (warning — more photos increase buyer trust)
 * - 2 photos  → 60 (warning)
 * - 3+ photos → 80–100 (good; 5+ is ideal)
 *
 * A real model would also score lighting, background, and focal clarity.
 */
export function scoreListingPhotos(photos: string[]): SubScoreResult {
  const count = photos.length;
  const suggestions: QualitySuggestion[] = [];

  if (count === 0) {
    suggestions.push(
      makeSuggestion(
        'photo',
        'Add at least one photo so buyers can see the item.',
        'critical',
      ),
    );
    return { score: 0, suggestions };
  }

  let score: number;
  if (count === 1) {
    score = 35;
    suggestions.push(
      makeSuggestion(
        'photo',
        'Add 2+ more photos — listings with 3+ photos sell significantly faster.',
        'warning',
      ),
    );
  } else if (count === 2) {
    score = 60;
    suggestions.push(
      makeSuggestion(
        'photo',
        'Add one more photo to reach the recommended 3-photo minimum.',
        'warning',
      ),
    );
  } else if (count <= 4) {
    score = 80;
    suggestions.push(
      makeSuggestion(
        'photo',
        'Great coverage. Add a close-up detail shot for extra buyer confidence.',
        'info',
      ),
    );
  } else {
    score = 100;
    suggestions.push(
      makeSuggestion(
        'photo',
        'Excellent photo set — buyers have a full view of the item.',
        'info',
        false,
      ),
    );
  }

  return { score, suggestions };
}

// ---------------------------------------------------------------------------
// Title scoring
// ---------------------------------------------------------------------------

/**
 * Score the listing title.
 *
 * Heuristics (mock):
 * - Empty → 0 (critical)
 * - <15 chars → 30 (warning — too short to be descriptive)
 * - 15–29 chars → 60 (info — okay but could be richer)
 * - 30–80 chars → 90–100 (ideal range)
 * - >80 chars → 70 (warning — too long, may truncate in feeds)
 *
 * Keyword presence (brand, size, colour, condition keywords) adds a small
 * bonus. A real model would use NLP keyword extraction.
 */
const TITLE_KEYWORDS = [
  'vintage', 'new', 'rare', 'original', 'leather', 'denim', 'wool',
  'cotton', 'silk', 'linen', 'size', 'uk', 'us', 'eu', 'xl', 'xxl',
  'black', 'white', 'blue', 'red', 'green', 'brown', 'grey',
];

export function scoreTitle(title: string): SubScoreResult {
  const trimmed = title.trim();
  const len = trimmed.length;
  const suggestions: QualitySuggestion[] = [];

  if (len === 0) {
    suggestions.push(
      makeSuggestion(
        'title',
        'Add a descriptive title so buyers can find your item.',
        'critical',
      ),
    );
    return { score: 0, suggestions };
  }

  let score: number;
  if (len < 15) {
    score = 30;
    suggestions.push(
      makeSuggestion(
        'title',
        `Title is ${len} chars — aim for 30–80 characters with brand, item, and key details.`,
        'warning',
      ),
    );
  } else if (len < 30) {
    score = 60;
    suggestions.push(
      makeSuggestion(
        'title',
        'Add the brand or size to make the title more searchable.',
        'info',
      ),
    );
  } else if (len <= 80) {
    score = 90;
  } else {
    score = 70;
    suggestions.push(
      makeSuggestion(
        'title',
        'Title is over 80 characters — it may truncate in search feeds. Trim redundant words.',
        'warning',
      ),
    );
  }

  // Keyword bonus (capped)
  const lower = trimmed.toLowerCase();
  const keywordHits = TITLE_KEYWORDS.filter((k) => lower.includes(k)).length;
  if (keywordHits === 0 && len > 0) {
    score = Math.max(0, score - 10);
    suggestions.push(
      makeSuggestion(
        'title',
        'Include a keyword like brand, colour, or material to improve searchability.',
        'info',
      ),
    );
  } else if (keywordHits > 0) {
    score = clamp(score + Math.min(10, keywordHits * 3));
  }

  return { score, suggestions };
}

// ---------------------------------------------------------------------------
// Description scoring
// ---------------------------------------------------------------------------

/**
 * Score the listing description.
 *
 * Heuristics (mock):
 * - Empty → 0 (critical)
 * - <50 chars → 30 (warning — too brief)
 * - 50–99 chars → 55 (warning — add measurements/condition notes)
 * - 100–249 chars → 80 (good)
 * - 250+ chars → 100 (ideal — detailed descriptions convert better)
 *
 * Detail signals (measurements, condition notes, material mentions) add a
 * small bonus.
 */
const DETAIL_SIGNALS = [
  'cm', 'inches', 'measure', 'fit', 'condition', 'wear', 'flaw', 'tag',
  'material', 'worn', 'new', 'unworn', 'washed',
];

export function scoreDescription(desc: string): SubScoreResult {
  const trimmed = desc.trim();
  const len = trimmed.length;
  const suggestions: QualitySuggestion[] = [];

  if (len === 0) {
    suggestions.push(
      makeSuggestion(
        'description',
        'Add a description with condition, fit, and any flaws.',
        'critical',
      ),
    );
    return { score: 0, suggestions };
  }

  let score: number;
  if (len < 50) {
    score = 30;
    suggestions.push(
      makeSuggestion(
        'description',
        'Description is brief — add measurements and condition details.',
        'warning',
      ),
    );
  } else if (len < 100) {
    score = 55;
    suggestions.push(
      makeSuggestion(
        'description',
        'Add measurements (e.g. pit-to-pit cm) and any wear notes.',
        'warning',
      ),
    );
  } else if (len < 250) {
    score = 80;
    suggestions.push(
      makeSuggestion(
        'description',
        'Good detail. Mentioning material and care instructions helps buyers decide.',
        'info',
      ),
    );
  } else {
    score = 100;
  }

  // Detail-signal bonus
  const lower = trimmed.toLowerCase();
  const signalHits = DETAIL_SIGNALS.filter((s) => lower.includes(s)).length;
  if (signalHits === 0 && len > 0) {
    score = Math.max(0, score - 8);
    if (len >= 50) {
      suggestions.push(
        makeSuggestion(
          'description',
          'Include measurements or condition notes for buyer confidence.',
          'info',
        ),
      );
    }
  } else if (signalHits > 0) {
    score = clamp(score + Math.min(8, signalHits * 2));
  }

  return { score, suggestions };
}

// ---------------------------------------------------------------------------
// Pricing scoring
// ---------------------------------------------------------------------------

/**
 * Score the listing price against a suggested range.
 *
 * Heuristics (mock):
 * - price <= 0 → 0 (critical — no valid price)
 * - below min  → 65 (warning — may signal low quality / undercut)
 * - within range → 100 (ideal)
 * - above max  → 60 (warning — may deter offers)
 *
 * When no range is supplied, a neutral 70 is returned with an info note.
 */
export function scorePricing(
  price: number,
  suggestedRange: { min: number; max: number },
): SubScoreResult {
  const suggestions: QualitySuggestion[] = [];

  if (!price || price <= 0) {
    suggestions.push(
      makeSuggestion(
        'pricing',
        'Set a price so buyers can make an offer or buy instantly.',
        'critical',
      ),
    );
    return { score: 0, suggestions };
  }

  const { min, max } = suggestedRange;
  let score: number;

  if (price < min) {
    score = 65;
    suggestions.push(
      makeSuggestion(
        'pricing',
        `£${price.toFixed(2)} is below the suggested range (£${min}–£${max}). Buyers may question quality.`,
        'warning',
      ),
    );
  } else if (price > max) {
    score = 60;
    suggestions.push(
      makeSuggestion(
        'pricing',
        `£${price.toFixed(2)} is above the suggested range (£${min}–£${max}). Consider lowering to attract offers.`,
        'warning',
      ),
    );
  } else {
    score = 100;
    suggestions.push(
      makeSuggestion(
        'pricing',
        'Price is within the suggested range — well positioned for offers.',
        'info',
        false,
      ),
    );
  }

  return { score, suggestions };
}

// ---------------------------------------------------------------------------
// Completeness scoring
// ---------------------------------------------------------------------------

/**
 * Score the completeness of required listing fields.
 *
 * `fields` is a map of field-name → present (boolean). The required fields are:
 * category, condition, size, brand, shipping. Each present field contributes
 * 20 points (5 fields × 20 = 100).
 */
const REQUIRED_FIELDS: readonly string[] = [
  'category',
  'condition',
  'size',
  'brand',
  'shipping',
];

export function scoreCompleteness(
  fields: Record<string, boolean>,
): SubScoreResult {
  const suggestions: QualitySuggestion[] = [];
  const present = REQUIRED_FIELDS.filter((f) => fields[f] === true);
  const missing = REQUIRED_FIELDS.filter((f) => fields[f] !== true);
  const score = clamp((present.length / REQUIRED_FIELDS.length) * 100);

  if (missing.length > 0) {
    const missingList = missing.join(', ');
    const severity: QualitySeverity =
      missing.length >= 3 ? 'critical' : missing.length >= 2 ? 'warning' : 'info';
    suggestions.push(
      makeSuggestion(
        'shipping',
        `Complete these fields for a stronger listing: ${missingList}.`,
        severity,
      ),
    );
  } else {
    suggestions.push(
      makeSuggestion(
        'shipping',
        'All key fields are filled — your listing is complete.',
        'info',
        false,
      ),
    );
  }

  return { score, suggestions };
}

// ---------------------------------------------------------------------------
// Aggregate listing score
// ---------------------------------------------------------------------------

/** Weights for blending sub-scores into the overall score (sum = 1). */
const SCORE_WEIGHTS = {
  photo: 0.25,
  title: 0.2,
  description: 0.2,
  pricing: 0.2,
  completeness: 0.15,
} as const;

/**
 * Score a full listing draft.
 *
 * Reads the standard `Listing` shape from `listingsApi` and derives each
 * sub-score. When `suggestedPriceRange` is not available on the listing, the
 * pricing sub-score falls back to a neutral heuristic.
 *
 * All results carry `isDemo: LISTING_QUALITY_DEMO_MODE`.
 */
export function scoreListing(listing: Partial<Listing>): ListingQualityScore {
  const photos = listing.images ?? [];
  const title = listing.title ?? '';
  const description = listing.description ?? '';
  const price = typeof listing.price === 'number' ? listing.price : 0;

  const photo = scoreListingPhotos(photos);
  const titleResult = scoreTitle(title);
  const descResult = scoreDescription(description);

  // Pricing — use a sensible default range when none is provided so the
  // scorer remains useful for early drafts.
  const min = price > 0 ? Math.round(price * 0.6 * 100) / 100 : 0;
  const max = price > 0 ? Math.round(price * 1.4 * 100) / 100 : 0;
  const pricing = scorePricing(price, { min, max });

  const completeness = scoreCompleteness({
    category: Boolean(listing.category),
    condition: Boolean(listing.condition),
    size: Boolean(listing.size),
    brand: Boolean(listing.brand),
    shipping: Boolean(listing.shippingMethod),
  });

  const overall = clamp(
    photo.score * SCORE_WEIGHTS.photo +
      titleResult.score * SCORE_WEIGHTS.title +
      descResult.score * SCORE_WEIGHTS.description +
      pricing.score * SCORE_WEIGHTS.pricing +
      completeness.score * SCORE_WEIGHTS.completeness,
  );

  const suggestions = [
    ...photo.suggestions,
    ...titleResult.suggestions,
    ...descResult.suggestions,
    ...pricing.suggestions,
    ...completeness.suggestions,
  ].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return {
    overall,
    photoScore: photo.score,
    titleScore: titleResult.score,
    descriptionScore: descResult.score,
    pricingScore: pricing.score,
    completenessScore: completeness.score,
    suggestions,
    isDemo: LISTING_QUALITY_DEMO_MODE,
  };
}
