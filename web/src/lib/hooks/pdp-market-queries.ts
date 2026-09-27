'use client';

/**
 * PDP market-evidence + discovery hooks — the reads queries.ts and
 * pdp-queries.ts don't own.
 *
 *  - Price history & sold comparables: live mode reads the authoritative
 *    GET /listings/:id/price-history (listing_price_events, written on every
 *    server-side price change) and GET /listings/:id/sold-comparables
 *    (aggregated real completed orders — sample/min/median/max only, the
 *    server publishes no per-item comp cards). Fixture mode derives the
 *    same evidence synchronously from the bundled dataset. In neither
 *    mode is a number invented: a failed or empty live read yields no
 *    row, and the per-item "Similar sold" strip exists only where the
 *    data exists — fixture mode.
 *  - Similar listings: live mode reads GET /listings/:id/related (real
 *    active listings matched on category/brand) so a live PDP never
 *    deep-links a fixture id into a 404; fixture mode keeps the
 *    fixtures-commerce scorer.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { fetchJson } from '@/lib/api/http';
import * as listingsService from '@/lib/api/services/listings';
import type { Listing } from '@/lib/contracts/domain';
import {
  priceHistoryFor,
  soldComparablesFor,
  type ListingPriceEvent,
  type SoldComparable,
} from '@/lib/data/fixtures';
import { similarListings } from '@/lib/data/fixtures-commerce';

// ── Price history & sold comparables ────────────────────────────────────────

/** Wire shape of GET /listings/:id/sold-comparables — aggregate stats only. */
interface SoldComparablesWire {
  sampleSize?: number;
  minPrice?: number | null;
  medianPrice?: number | null;
  maxPrice?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

/** Wire shape of GET /listings/:id/price-history rows. */
interface PriceEventWire {
  previousPrice?: number | string;
  newPrice?: number | string;
  changedAt?: string;
}

/**
 * Sold-comps evidence normalised across modes. `count`/`minPrice`/`maxPrice`
 * power the "N similar sold £X–£Y" row and the buy panel's signal clause.
 * `items` carries per-sale comp cards and exists only in fixture mode — the
 * live endpoint publishes aggregates, so no card strip can be built from it
 * without fabricating the individual sales.
 */
export interface SoldCompsEvidence {
  count: number;
  minPrice: number | null;
  maxPrice: number | null;
  /** Per-item sold comps — fixture dataset only. */
  items?: SoldComparable[];
}

export interface PdpMarketEvidence {
  /** Price-change events, newest first. */
  priceEvents: ListingPriceEvent[];
  soldComps: SoldCompsEvidence | null;
  /** Live reads in flight — fixture mode resolves synchronously. */
  isLoading: boolean;
}

function finitePrice(value: number | string | null | undefined): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function usePdpMarketEvidence(listing: Listing | null | undefined): PdpMarketEvidence {
  const live = DATA_MODE === 'live';
  const listingId = listing?.id ?? null;

  const historyQuery = useQuery<ListingPriceEvent[]>({
    queryKey: ['listing-price-history', listingId ?? ''],
    enabled: live && !!listingId,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const payload = await fetchJson<{ ok?: boolean; items?: PriceEventWire[] }>(
        `/listings/${encodeURIComponent(listingId ?? '')}/price-history`,
        undefined,
        { signal },
      );
      return (payload.items ?? [])
        .map((e): ListingPriceEvent | null => {
          const previousPrice = finitePrice(e.previousPrice);
          const newPrice = finitePrice(e.newPrice);
          if (previousPrice == null || newPrice == null) return null;
          return e.changedAt
            ? { previousPrice, newPrice, changedAt: e.changedAt }
            : { previousPrice, newPrice };
        })
        .filter((e): e is ListingPriceEvent => e != null);
    },
  });

  const compsQuery = useQuery<SoldCompsEvidence | null>({
    queryKey: ['listing-sold-comps', listingId ?? ''],
    enabled: live && !!listingId,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const payload = await fetchJson<{ ok?: boolean; comparables?: SoldComparablesWire }>(
        `/listings/${encodeURIComponent(listingId ?? '')}/sold-comparables`,
        undefined,
        { signal },
      );
      const c = payload.comparables;
      if (!c || typeof c.sampleSize !== 'number' || c.sampleSize <= 0) return null;
      return {
        count: c.sampleSize,
        minPrice: finitePrice(c.minPrice),
        maxPrice: finitePrice(c.maxPrice),
      };
    },
  });

  const fixture = useMemo<PdpMarketEvidence>(() => {
    if (!listing || live) return { priceEvents: [], soldComps: null, isLoading: false };
    const items = soldComparablesFor(listing);
    const prices = items.map((i) => i.soldPrice);
    return {
      priceEvents: priceHistoryFor(listing),
      soldComps: items.length
        ? {
            count: items.length,
            minPrice: Math.min(...prices),
            maxPrice: Math.max(...prices),
            items,
          }
        : null,
      isLoading: false,
    };
  }, [listing, live]);

  if (!live) return fixture;
  return {
    priceEvents: historyQuery.data ?? [],
    soldComps: compsQuery.data ?? null,
    isLoading: !!listingId && (historyQuery.isLoading || compsQuery.isLoading),
  };
}

// ── Similar listings rail ────────────────────────────────────────────────────

export interface PdpSimilarListings {
  items: Listing[];
  isLoading: boolean;
}

/**
 * "More like this" for the PDP discovery foot. Live mode queries the real
 * related-listings endpoint — never the fixture scorer, whose ids would
 * deep-link to live 404s. Fixture mode keeps the brand/subcategory/category
 * scorer over the bundled dataset.
 */
export function usePdpSimilarListings(
  listing: Listing | null | undefined,
  limit = 10,
): PdpSimilarListings {
  const live = DATA_MODE === 'live';
  const listingId = listing?.id ?? null;

  const query = useQuery<Listing[]>({
    queryKey: ['related-listings', listingId ?? ''],
    enabled: live && !!listingId,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      listingsService.fetchRelatedListings(listingId ?? '', limit, signal),
  });

  const fixtureItems = useMemo(
    () => (listing && !live ? similarListings(listing, limit) : []),
    [listing, live, limit],
  );

  if (!live) return { items: fixtureItems, isLoading: false };
  return {
    items: query.data ?? [],
    isLoading: !!listingId && query.isLoading,
  };
}
