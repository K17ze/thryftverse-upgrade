import { useMemo, useState, useEffect } from 'react';
import type { Listing } from '../domain';
import { fetchListingSoldComparables, type ListingSoldComparables } from '../services/listingsApi';

/**
 * Sold comparables for pricing guidance.
 * Derived from real backend listings data — no fabricated numbers.
 */
export interface SoldCompsResult {
  /** Minimum sold price in the comparable set */
  minPrice: number | null;
  /** Maximum sold price in the comparable set */
  maxPrice: number | null;
  /** Median sold price */
  medianPrice: number | null;
  /** Number of sold items in the comparable set */
  sampleSize: number;
  /** Whether there are enough comparables to show guidance (≥2) */
  hasComps: boolean;
}

/**
 * Computes sold comparables.
 *
 * When `listingId` is provided, uses the authoritative server endpoint
 * `GET /listings/:listingId/sold-comparables` which returns real completed-sale data.
 *
 * When no `listingId` is available (e.g. during listing creation), falls back to
 * deriving comparables from the in-memory backend listings. This client-derived
 * approach is NOT authoritative and should be labelled as approximate guidance.
 *
 * @param listings All backend listings (from useBackendData) — used as fallback
 * @param category Optional category filter
 * @param brand Optional brand filter
 * @param listingId Optional listing ID — when provided, uses the authoritative server endpoint
 */
export function useSoldComps(
  listings: Listing[],
  category?: string,
  brand?: string,
  listingId?: string,
): SoldCompsResult {
  const [serverComps, setServerComps] = useState<ListingSoldComparables | null>(null);

  useEffect(() => {
    if (!listingId) {
      setServerComps(null);
      return;
    }
    let cancelled = false;
    fetchListingSoldComparables(listingId)
      .then((comps) => { if (!cancelled) setServerComps(comps); })
      .catch(() => { if (!cancelled) setServerComps(null); });
    return () => { cancelled = true; };
  }, [listingId]);

  return useMemo(() => {
    // Use authoritative server endpoint when available
    if (serverComps && serverComps.sampleSize >= 2) {
      return {
        minPrice: serverComps.minPrice,
        maxPrice: serverComps.maxPrice,
        medianPrice: serverComps.medianPrice,
        sampleSize: serverComps.sampleSize,
        hasComps: true,
      };
    }

    // Fallback: client-derived from in-memory listings (NOT authoritative)
    if (!category && !brand) {
      return { minPrice: null, maxPrice: null, medianPrice: null, sampleSize: 0, hasComps: false };
    }

    const sold = listings.filter((l) => {
      if (!l.isSold) return false;
      const categoryMatch = category ? l.category === category : true;
      const brandMatch = brand ? l.brand === brand : true;
      return categoryMatch && brandMatch;
    });

    if (sold.length < 2) {
      return { minPrice: null, maxPrice: null, medianPrice: null, sampleSize: sold.length, hasComps: false };
    }

    const prices = sold.map((l) => l.price).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

    return {
      minPrice: prices[0],
      maxPrice: prices[prices.length - 1],
      medianPrice: median,
      sampleSize: sold.length,
      hasComps: true,
    };
  }, [serverComps, listings, category, brand]);
}
