/**
 * Review model — the write-review contract ported from the mobile
 * WriteReviewScreen: the 1–5 rating vocabulary, the order-review tag
 * model, photo/character limits, and the session-local extras the Review
 * record doesn't carry (tags + attached photos) so a submitted review
 * renders back honestly for the rest of the session.
 */

export const RATING_LABELS = [
  'Poor',
  'Fair',
  'Good',
  'Very good',
  'Excellent',
] as const;

export const MAX_REVIEW_PHOTOS = 4;
export const MAX_REVIEW_CHARS = 2000;

export interface ReviewTag {
  key: string;
  label: string;
}

/**
 * Order-review tags — the aspects buyers actually scan on a seller's
 * reviews (item accuracy, dispatch, packaging, comms). Multi-select and
 * optional: they qualify the rating, they never replace it.
 */
export const REVIEW_TAGS: ReviewTag[] = [
  { key: 'item-as-described', label: 'Item as described' },
  { key: 'quick-dispatch', label: 'Quick dispatch' },
  { key: 'packaging', label: 'Careful packaging' },
  { key: 'communication', label: 'Good communication' },
  { key: 'value', label: 'Great value' },
  { key: 'buy-again', label: 'Would buy again' },
];

export interface ReviewSubmission {
  rating: number;
  text: string;
  tags: string[];
  photoUrls: string[];
}

export function ratingLabelFor(rating: number): string | null {
  if (rating < 1) return null;
  return RATING_LABELS[Math.min(5, rating) - 1];
}

// ─── Session extras ─────────────────────────────────────────────────────────
// The Review record (and the order enrichment) persists rating + text only.
// Tags and attached photos are session-local truth — keyed by order id so
// the published state can echo back exactly what the buyer submitted.

interface SessionReviewExtras {
  tags: string[];
  photoUrls: string[];
}

const SESSION_EXTRAS = new Map<string, SessionReviewExtras>();

export function saveReviewExtras(orderId: string, extras: SessionReviewExtras): void {
  SESSION_EXTRAS.set(orderId, extras);
}

export function reviewExtrasFor(orderId: string): SessionReviewExtras | null {
  return SESSION_EXTRAS.get(orderId) ?? null;
}

export function tagLabelFor(key: string): string {
  return REVIEW_TAGS.find((t) => t.key === key)?.label ?? key;
}
