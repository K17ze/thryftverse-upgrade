import type { Listing } from '../services/listingsApi';
import type {
  ListingSoldComparables,
  ListingPriceEvent,
} from '../services/listingsApi';
import type { ListingCommerceContext } from '../platform/product/listingDetailContract';
import type { ThemeColors } from '../theme/ThemeContext';

// ───────────────────────────────────────────────────────────────────────────
// Pure derived-data helpers for ItemDetailScreen.
//
// These are stateless projections from a Listing + commerce context into the
// plain strings/rows the screen renders. Extracted from the screen so the
// orchestrator only composes, never computes. Behaviour is identical to the
// previous inline IIFEs — same inputs, same outputs, same edge cases.
// ───────────────────────────────────────────────────────────────────────────

export function buildInterestSignal(item: Listing): string | undefined {
  if (item.likes && item.likes > 0) return `${item.likes} like${item.likes > 1 ? 's' : ''}`;
  return undefined;
}

// ── Social proof line (truthful) ──
// Built only from real engagement data — never fabricated. Combines
// active offers (scarcity urgency) and cumulative views (popularity)
// into a single muted line below the price. Each signal is only
// included when the backend provides a positive count.
export function buildSocialProofLine(
  item: Listing,
  engagement: { activeOfferCount?: number | null } | null,
): string | undefined {
  const parts: string[] = [];
  const activeOffers = engagement?.activeOfferCount;
  if (activeOffers != null && activeOffers > 0) {
    parts.push(`${activeOffers} offer${activeOffers > 1 ? 's' : ''} active`);
  }
  const views = item.views;
  if (views != null && views > 0) {
    parts.push(`${views} view${views > 1 ? 's' : ''}`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function buildAttributeLine(item: Listing): string {
  return [
    item.size && `Size ${item.size}`,
    item.condition,
    item.category,
  ].filter(Boolean).join(' · ');
}

// Condition colour-coding + definition. Maps each ListingCondition to a
// semantic accent and a plain-English definition shown on tap.
export function buildConditionMeta(
  item: Listing,
  colors: ThemeColors,
): { color: string; definition: string } | null {
  switch (item.condition) {
    case 'New with tags':
      return { color: colors.success, definition: 'New: Unworn, with original tags and packaging intact.' };
    case 'Very good':
      return { color: colors.commerceTrust, definition: 'Very good: No visible flaws, minimal wear.' };
    case 'Good':
      return { color: colors.warning, definition: 'Good: Light wear consistent with gentle use; no major flaws.' };
    case 'Satisfactory':
      return { color: colors.bronze, definition: 'Satisfactory: Visible wear or minor flaws; fully wearable.' };
    default:
      return null;
  }
}

export function buildSecondaryLine(
  formattedProtectionTotal: string | null,
): string | undefined {
  return [
    formattedProtectionTotal ? `${formattedProtectionTotal} with Buyer Protection` : null,
  ].filter(Boolean).join(' · ') || undefined;
}

export interface PriceInsightRow {
  label: string;
  value: string;
  muted?: boolean;
}

export interface PriceInsightInputs {
  hasDiscount: boolean;
  discountPercent: number | null;
  soldComps: ListingSoldComparables | null | undefined;
  priceHistory: ListingPriceEvent[];
  item: Listing;
  formatFromFiat: (amount: number, currency?: string) => string;
}

// ── Price insight rows (only truthful facts) ──
export function buildPriceInsightRows({
  hasDiscount,
  discountPercent,
  soldComps,
  priceHistory,
  item,
  formatFromFiat,
}: PriceInsightInputs): PriceInsightRow[] {
  const rows: PriceInsightRow[] = [];
  if (hasDiscount && discountPercent && discountPercent > 0) {
    rows.push({ label: 'Price drop', value: `-${Math.round(discountPercent)}%` });
  }
  if (
    soldComps &&
    soldComps.sampleSize >= 2 &&
    soldComps.minPrice != null &&
    soldComps.maxPrice != null
  ) {
    rows.push({
      label: `${soldComps.sampleSize} similar sold`,
      value: `${formatFromFiat(soldComps.minPrice, soldComps.currency)}–${formatFromFiat(soldComps.maxPrice, soldComps.currency)}`,
      muted: true,
    });
  }
  const latestPriceEvent = priceHistory[0];
  if (latestPriceEvent) {
    rows.push({
      label: 'Previous price',
      value: formatFromFiat(latestPriceEvent.previousPrice, latestPriceEvent.currency),
      muted: true,
    });
  }
  const daysListed = item.createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null;
  if (daysListed != null && daysListed >= 3) {
    rows.push({
      label: 'Time on market',
      value: daysListed === 1 ? '1 day' : `${daysListed} days`,
      muted: true,
    });
  }
  return rows;
}

// One inline insight for the consolidated disclosure — surface only
// the most material fact; the full breakdown expands on tap.
export function buildPriceInsightSummary({
  hasDiscount,
  discountPercent,
  soldComps,
  priceHistory,
  item,
  formatFromFiat,
}: PriceInsightInputs): string | undefined {
  if (hasDiscount && discountPercent && discountPercent > 0) {
    return `Reduced ${Math.round(discountPercent)}%`;
  }
  if (soldComps && soldComps.sampleSize >= 2) {
    return `${soldComps.sampleSize} similar sold`;
  }
  const latestPriceEvent = priceHistory[0];
  if (latestPriceEvent) {
    return `Previous ${formatFromFiat(latestPriceEvent.previousPrice, latestPriceEvent.currency)}`;
  }
  const daysListed = item.createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null;
  if (daysListed != null && daysListed >= 3) {
    return daysListed === 1 ? '1 day on market' : `${daysListed} days on market`;
  }
  return undefined;
}

// ── Purchase detail rows (compact summary + disclosure) ──
export function buildPurchaseSummary(commerce: ListingCommerceContext): string {
  return [
    commerce.shippingMethod,
    commerce.protectionPolicy?.available ? commerce.protectionPolicy.label : null,
    commerce.returnPolicy
      ? commerce.returnPolicy.accepted
        ? commerce.returnPolicy.windowDays
          ? `Returns within ${commerce.returnPolicy.windowDays} days`
          : 'Returns accepted'
        : 'No returns'
      : null,
    commerce.authenticity && commerce.authenticity.status !== 'not_offered'
      ? commerce.authenticity.label ?? (commerce.authenticity.status === 'verified' ? 'Verified' : 'Eligible')
      : null,
  ].filter(Boolean).join(' · ');
}
