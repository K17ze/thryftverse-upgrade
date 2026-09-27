'use client';

/**
 * Shop rail — the pinned "featured items" window on a profile (mobile
 * shopRailItems / eBay featured grammar). Data: live mode reads
 * GET /storefronts/:sellerId featuredListings; fixture mode resolves
 * FEATURED_LISTING_IDS. Owner pins persist in a localStorage overlay and
 * write through to PUT /storefronts/me/featured-listings in live mode
 * (backend caps the rail at 8).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import { listingById } from '@/lib/data/fixtures';
import { getListingCoverUri } from '@/lib/utils/media';
import { useHydrated } from '@/lib/store/useStore';
import { FEATURED_LISTING_IDS } from './fixtures';

export const MAX_FEATURED = 8;

export interface ShopRailItem {
  id: string;
  title: string;
  /** GBP pounds — fixture listings carry decimal prices. */
  price: number;
  imageUri: string;
  brand: string | null;
  isSold?: boolean;
}

const tick = (ms = 260) => new Promise((r) => setTimeout(r, ms));

// ── Owner pin state — null = follow the fixture/storefront truth ──────

interface ShopRailState {
  /** Owner-curated pin order; null until the member first edits pins. */
  pinnedIds: string[] | null;
  setPinnedIds: (ids: string[]) => void;
}

export const useShopRailPins = create<ShopRailState>()(
  persist(
    (set) => ({
      pinnedIds: null,
      setPinnedIds: (ids) => set({ pinnedIds: ids.slice(0, MAX_FEATURED) }),
    }),
    {
      name: 'thryftverse.web.shopRail',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ pinnedIds: s.pinnedIds }),
    },
  ),
);

/** Effective pinned ids for a member — the owner's override wins, then the
 *  fixture storefront truth. */
export function featuredIdsFor(ownerId: string, override: string[] | null): string[] {
  if (override) return override;
  return FEATURED_LISTING_IDS[ownerId] ?? [];
}

/**
 * Rail items for a profile. `isOwner` applies the member's pin overlay;
 * public profiles read the seller's featured ids as published.
 */
export function useShopRail(
  ownerId: string,
  isOwner = false,
): { items: ShopRailItem[]; isLoading: boolean } {
  const hydrated = useHydrated();
  const override = useShopRailPins((s) => s.pinnedIds);

  const { data, isLoading } = useQuery<ShopRailItem[]>({
    queryKey: [
      'shop-rail',
      ownerId,
      DATA_MODE,
      isOwner && hydrated ? (override?.join(',') ?? '') : '',
    ],
    enabled: !!ownerId,
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        const featured = await socialService.fetchStorefrontFeatured(ownerId);
        if (isOwner && override) {
          // Owner edits rank over the published list — items resolve from
          // the storefront payload; a pin not yet published re-resolves on
          // the next PUT.
          const known = new Map(featured.map((f) => [f.id, f]));
          const picked = override
            .map((id) => known.get(id))
            .filter((f): f is socialService.StorefrontFeaturedListing => !!f);
          return picked.map((f) => ({
            id: f.id,
            title: f.title,
            price: f.priceGbpMinor / 100,
            imageUri: f.imageUrl ?? '',
            brand: null,
            isSold: f.status === 'sold',
          }));
        }
        return featured.map((f) => ({
          id: f.id,
          title: f.title,
          price: f.priceGbpMinor / 100,
          imageUri: f.imageUrl ?? '',
          brand: null,
          isSold: f.status === 'sold',
        }));
      }
      await tick();
      const ids = featuredIdsFor(ownerId, isOwner ? override : null);
      return ids
        .map((id) => listingById(id))
        .filter((l): l is NonNullable<typeof l> => !!l)
        .map((l) => ({
          id: l.id,
          title: l.title,
          price: l.price,
          imageUri: getListingCoverUri(l.images) ?? '',
          brand: l.brand ?? null,
          isSold: l.isSold === true || l.status === 'sold',
        }));
    },
  });

  return { items: data ?? [], isLoading };
}

/** Commit the owner's pin order — overlay first, then the backend write. */
export function useSetShopRailPins() {
  const queryClient = useQueryClient();
  const setPinnedIds = useShopRailPins((s) => s.setPinnedIds);
  return async (ownerId: string, ids: string[]): Promise<boolean> => {
    const next = ids.slice(0, MAX_FEATURED);
    if (DATA_MODE === 'live') {
      try {
        await socialService.setFeaturedListings(next);
      } catch {
        return false;
      }
    }
    setPinnedIds(next);
    void queryClient.invalidateQueries({ queryKey: ['shop-rail', ownerId] });
    return true;
  };
}
