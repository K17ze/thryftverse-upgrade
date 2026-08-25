/**
 * Currency Policy
 *
 * v1 of the concierge importer only supports confirmed GBP pricing. A source
 * listing priced in any other currency is never auto-converted: currency
 * conversion is a material fact that requires seller confirmation. Non-GBP
 * listings are surfaced with low confidence so the review workbench can ask
 * the seller to confirm the GBP price.
 *
 * Principles (per blueprint §10):
 * - Never auto-convert currency.
 * - Require seller review for price/currency uncertainty.
 * - Preserve the source currency alongside the (unconfirmed) GBP price.
 */

import type {
  CanonicalListingField,
  FieldConfidence,
} from '../../domain/catalogImports/catalogImportTypes.js';
import { fromMarketplace } from './canonicalListingSchema.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const CURRENCY_POLICY_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Supported currencies
// ---------------------------------------------------------------------------

export const SUPPORTED_CURRENCIES: readonly string[] = ['GBP'] as const;

export function isCurrencySupported(currency: string): boolean {
  return SUPPORTED_CURRENCIES.includes(currency.toUpperCase());
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface ResolvedCurrency {
  currency: CanonicalListingField<string>;
  priceGbp: CanonicalListingField<number>;
}

/**
 * Resolve the canonical currency and GBP price for a source listing.
 *
 * - GBP source: currency and priceGbp are preserved directly with high
 *   confidence (marketplace provenance).
 * - Non-GBP source: currency is the source currency with low confidence,
 *   and priceGbp is 0 with low confidence and reasonCode
 *   'non_gbp_requires_confirmation'. The seller must confirm the GBP price.
 * - Missing currency: defaults to GBP with low confidence and reasonCode
 *   'missing_currency', priceGbp 0 with low confidence.
 *
 * Never auto-converts. The source currency is always preserved so the review
 * workbench can show the original price for seller confirmation.
 */
export function resolveCurrency(
  sourceCurrency: string | null,
  sourcePrice: number | null,
): ResolvedCurrency {
  const upperCurrency = sourceCurrency ? sourceCurrency.toUpperCase() : null;

  if (upperCurrency && isCurrencySupported(upperCurrency)) {
    const price = sourcePrice !== null && Number.isFinite(sourcePrice) ? sourcePrice : 0;
    const priceConfidence: FieldConfidence = price > 0 ? 'high' : 'low';
    return {
      currency: fromMarketplace<string>(upperCurrency, sourceCurrency, 'high'),
      priceGbp: fromMarketplace<number>(price, sourcePrice, priceConfidence, price > 0 ? undefined : 'missing_price'),
    };
  }

  // Non-GBP or missing currency: never auto-convert.
  const currency = upperCurrency ?? 'GBP';
  const currencyReasonCode = upperCurrency ? 'non_gbp_requires_confirmation' : 'missing_currency';
  return {
    currency: fromMarketplace<string>(currency, sourceCurrency, 'low', currencyReasonCode),
    priceGbp: fromMarketplace<number>(0, sourcePrice, 'low', 'non_gbp_requires_confirmation'),
  };
}

// ---------------------------------------------------------------------------
// Display helper
// ---------------------------------------------------------------------------

/**
 * Format a GBP price for display in the review workbench. Uses the canonical
 * currency code (not the source currency) because the displayed value is
 * always the resolved GBP amount.
 */
export function formatPriceForDisplay(priceGbp: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(priceGbp);
  } catch {
    return `${currency.toUpperCase()} ${priceGbp.toFixed(2)}`;
  }
}
