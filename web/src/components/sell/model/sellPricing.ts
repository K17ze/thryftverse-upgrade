import { LISTINGS } from '@/lib/data/fixtures';

// ============================================================================
// PRICING — buyer-protection fee mirrors calculatePlatformChargeGbp:
// 5% + £0.70, floor 2%, zero-value carries no fee. Buyer pays the fee;
// the seller receives the listed price in full.
// ============================================================================

export function protectionFeeGbp(priceGbp: number): number {
  if (!Number.isFinite(priceGbp) || priceGbp <= 0) return 0;
  const charge = priceGbp * 0.05 + 0.7;
  const minimum = priceGbp * 0.02;
  return Number(Math.max(charge, minimum).toFixed(2));
}

export function parsePriceInput(raw: string): number | null {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Keep digits + a single decimal point (mirrors sanitizeDecimalInput). */
export function sanitizePriceInput(raw: string): string {
  const normalized = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const firstDot = normalized.indexOf('.');
  if (firstDot === -1) return normalized;
  return (
    normalized.slice(0, firstDot + 1) +
    normalized.slice(firstDot + 1).replace(/\./g, '')
  );
}

/** Suggested price — median of comparable live listings in the category. */
export function suggestedPriceFor(category: string): number | null {
  return priceCompsFor(category)?.median ?? null;
}

/**
 * Comparable set for a category — live listings only (this fixture pool has
 * no sold records, so nothing here claims sold-price evidence). Used for
 * the suggestion chip, the range line and the market-position read.
 */
export function priceCompsFor(
  category: string,
): { min: number; max: number; median: number; count: number } | null {
  const prices = LISTINGS.filter((l) => l.category === category)
    .map((l) => l.price)
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (!prices.length) return null;
  return {
    min: prices[0] ?? 0,
    max: prices[prices.length - 1] ?? 0,
    median: Math.round(prices[Math.floor(prices.length / 2)] ?? 0),
    count: prices.length,
  };
}

/**
 * Market position vs the comparable range — mirrors mobile's 20% band:
 * comfortably inside the range is "within", beyond ±20% of the range edges
 * is above/below, anything else is near an edge.
 */
export type PricePosition = 'below' | 'within' | 'above' | 'near-low' | 'near-high';

export function pricePosition(price: number, category: string): PricePosition | null {
  const comps = priceCompsFor(category);
  if (!comps || comps.count < 3 || !(price > 0)) return null;
  if (price < comps.min * 0.8) return 'below';
  if (price > comps.max * 1.2) return 'above';
  if (price >= comps.min && price <= comps.max) return 'within';
  return price < comps.min ? 'near-low' : 'near-high';
}

export const PRICE_POSITION_COPY: Record<PricePosition, { tone: 'good' | 'warn'; label: string }> = {
  below: { tone: 'good', label: 'Priced below similar listings — likely to move fast' },
  'near-low': { tone: 'good', label: 'At the lower end of similar listings' },
  within: { tone: 'good', label: 'Within the range buyers are browsing' },
  'near-high': { tone: 'warn', label: 'At the upper end of similar listings' },
  above: { tone: 'warn', label: 'Priced above similar listings — may sit longer' },
};
