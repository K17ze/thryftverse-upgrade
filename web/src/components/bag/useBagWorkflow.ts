'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useStore } from '@/lib/store/useStore';
import { useBagListings } from '@/lib/store/useBagListings';
import { DATA_MODE } from '@/lib/api/client';
import { sellerGroups } from '@/lib/data/fixtures';
import { bundleSuggestions } from '@/lib/data/fixtures-commerce';
import { checkoutTotals } from '@/lib/commerce/postage';
import type { BundleSuggestionGroup } from './BagBundleSuggestions';

export function useBagWorkflow() {
  const router = useRouter();
  const { show } = useToast();
  const bag = useStore((s) => s.bag);
  const removeFromBag = useStore((s) => s.removeFromBag);
  const addToBag = useStore((s) => s.addToBag);
  const isWishlisted = useStore((s) => s.isWishlisted);
  const toggleWishlist = useStore((s) => s.toggleWishlist);

  // Zustand persist rehydrates from localStorage — wait for it so the
  // first render doesn't flash the empty state.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountPct: number;
  } | null>(null);

  // Mode-aware resolution — fixture ids map onto the catalogue; live ids
  // batch-fetch GET /listings/:id. A live entry that can't be resolved is
  // dropped honestly (counted below), never replaced by a fixture row.
  const {
    items,
    soldOutCount,
    unresolvedCount,
    isLoading: listingsLoading,
  } = useBagListings(bag);

  const totals = useMemo(() => checkoutTotals(items), [items]);
  const groups = useMemo(() => sellerGroups(items), [items]);
  const bundleDiscount = useMemo(
    () => groups.reduce((sum, g) => sum + g.discount, 0),
    [groups],
  );

  // Live honesty: promo codes are fixture-demo only (POST /orders carries
  // no promo field) and the backend applies no bundle discount, so the
  // live payable total is exactly the sum of real order totals.
  const promoDiscount = useMemo(
    () =>
      DATA_MODE !== 'live' && appliedPromo
        ? Math.round(totals.items * appliedPromo.discountPct * 100) / 100
        : 0,
    [appliedPromo, totals.items],
  );

  const payableTotal = Math.max(
    0,
    Math.round(
      (totals.total - (DATA_MODE === 'live' ? 0 : bundleDiscount) - promoDiscount) * 100,
    ) / 100,
  );

  // Sellers already in the bag with more stock — the bundle hint.
  const bagIds = useMemo(() => new Set(items.map((l) => l.id)), [items]);
  const bundleGroups = useMemo<BundleSuggestionGroup[]>(() => {
    const sellerIds = [...new Set(items.map((l) => l.sellerId))];
    return sellerIds
      .map((sellerId) => ({
        sellerId,
        username: items.find((l) => l.sellerId === sellerId)?.seller?.username ?? null,
        suggestions: bundleSuggestions(sellerId, bagIds),
      }))
      .filter((g) => g.suggestions.length > 0);
  }, [items, bagIds]);

  // Urgency notice: a bagged listing that is under active live auction
  const liveAuctionCount = useMemo(
    () =>
      items.filter(
        (l) => l.auctionEndsAt != null && new Date(l.auctionEndsAt).getTime() > Date.now(),
      ).length,
    [items],
  );

  const handleRemoveItem = (listingId: string) => {
    removeFromBag(listingId);
    show('Removed from bag', 'info');
  };

  const handleSaveForLater = (listingId: string) => {
    // Bag removal is local — it moves regardless. The
    // wishlist write resolves honestly: only claim "Saved"
    // once it lands, and say so if it doesn't.
    removeFromBag(listingId);
    if (!isWishlisted(listingId)) {
      void toggleWishlist(listingId).then((ok) =>
        show(
          ok
            ? 'Saved for later — it’s in your Saved items'
            : 'Removed from bag — the save didn’t sync',
          ok ? 'success' : 'error',
        ),
      );
    } else {
      show('Saved for later — it’s in your Saved items', 'success');
    }
  };

  const handleAddToBag = (listingId: string) => {
    addToBag(listingId);
    show('Added to bag', 'success');
  };

  const handleApplyPromo = (code: string, discountPct: number) => {
    setAppliedPromo({ code, discountPct });
    show(`Promo code ${code} applied!`, 'success');
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    show('Promo code removed', 'info');
  };

  const handleCheckout = () => {
    router.push('/checkout');
  };

  return {
    hydrated,
    listingsLoading,
    items,
    soldOutCount,
    unresolvedCount,
    groups,
    bundleGroups,
    liveAuctionCount,
    totals,
    bundleDiscount,
    promoDiscount,
    payableTotal,
    appliedPromo,
    handleRemoveItem,
    handleSaveForLater,
    handleAddToBag,
    handleApplyPromo,
    handleRemovePromo,
    handleCheckout,
  };
}
