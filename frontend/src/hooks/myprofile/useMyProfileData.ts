import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../../store/useStore';
import { listCoOwnAssets, fetchCoOwnHoldings } from '../../services/marketApi';
import { fetchFollowCounts } from '../../services/profileApi';
import { fetchLooksFromApi, type LookApiItem } from '../../services/looksApi';
import { fetchPosterHighlights, type PosterHighlight } from '../../services/postersApi';
import { parseApiError } from '../../lib/apiClient';
import { useSellerTrust } from '../../platform/product';
import { useSellerReviewsInfinite } from '../../platform/server';
import { useToast } from '../../context/ToastContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { SellerReviewItem, SellerReviewSummary } from '../../services/sellerReviewsApi';
import type { FollowCounts, FollowCountsStatus, MyProfileCoOwnHolding } from './types';

/**
 * Owns the owner-profile data lifecycle: profile refresh on mount, seller
 * trust + reviews, follow counts, co-own holdings, published looks (with
 * focus refetch), and story highlights. Extracted from MyProfileScreen —
 * all cancellation flags, statuses and error paths are verbatim.
 */
export function useMyProfileData(userId: string | undefined) {
  const { show } = useToast();
  const { t: tt } = useAppTranslation('myProfile');
  const fetchMyProfile = useStore((state) => state.fetchMyProfile);

  // Seller trust summary — verified badge, response time, dispatch time, completed sales
  const { data: sellerTrust } = useSellerTrust(userId);

  // Seller reviews — infinite list for the Reviews tab. Only rendered when
  // the seller has reviews (reviewCount > 0), keeping the tab conditional.
  const reviewsQuery = useSellerReviewsInfinite(userId);
  const myReviews: SellerReviewItem[] = useMemo(() => {
    const pages = reviewsQuery.data?.pages ?? [];
    const items: SellerReviewItem[] = [];
    for (const page of pages) for (const item of page.items) items.push(item);
    return items;
  }, [reviewsQuery.data]);
  const myReviewSummary: SellerReviewSummary | null = reviewsQuery.data?.pages?.[0]?.summary ?? null;
  const myReviewCount = sellerTrust?.reviewCount ?? myReviewSummary?.reviewCount ?? 0;

  // Follow counts — followers/following for the seam row.
  // Status distinguishes loading/error from a real zero so the UI never
  // displays an unknown count as a factual "0 followers" (M2 — truthful UI).
  const [followCounts, setFollowCounts] = useState<FollowCounts>({ followerCount: 0, followingCount: 0 });
  const [followCountsStatus, setFollowCountsStatus] = useState<FollowCountsStatus>('loading');
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setFollowCountsStatus('loading');
    fetchFollowCounts(userId)
      .then((counts) => { if (!cancelled) { setFollowCounts(counts); setFollowCountsStatus('loaded'); } })
      .catch(() => { if (!cancelled) setFollowCountsStatus('error'); });
    return () => { cancelled = true; };
  }, [userId]);

  const [coOwnHoldings, setCoOwnHoldings] = useState<MyProfileCoOwnHolding[]>([]);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([
      listCoOwnAssets({ limit: 120 }),
      fetchCoOwnHoldings(userId).catch(() => []),
    ])
      .then(([assets, holdings]) => {
        if (cancelled) return;
        const holdingMap = new Map<string, { units: number; avgEntry: number; realized: number }>();
        for (const h of holdings) {
          holdingMap.set(h.assetId, { units: h.unitsOwned, avgEntry: h.avgEntryPriceGbp, realized: h.realizedPnlGbp });
        }
        const merged = assets
          .filter((a) => (holdingMap.get(a.id)?.units ?? 0) > 0)
          .map((a) => {
            const h = holdingMap.get(a.id);
            return {
              id: a.id,
              title: a.title,
              image: a.imageUrl ?? '',
              totalUnits: a.totalUnits,
              availableUnits: a.availableUnits,
              unitPriceGBP: a.unitPriceGbp,
              unitPriceStable: a.unitPriceStable,
              settlementMode: a.settlementMode,
              issuerId: a.issuerId,
              marketMovePct24h: a.marketMovePct24h,
              holders: a.holders,
              volume24hGBP: a.volume24hGbp,
              isOpen: a.isOpen,
              yourUnits: h?.units ?? 0,
              avgEntryPriceGBP: h?.avgEntry,
              realizedProfitGBP: h?.realized };
          });
        setCoOwnHoldings(merged);
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, tt('toast.portfolioLoadFailed'));
        show(parsed.message, 'error');
      });
    return () => { cancelled = true; };
  }, [userId, show, tt]);

  const [myLooks, setMyLooks] = useState<LookApiItem[]>([]);
  const [looksLoading, setLooksLoading] = useState(false);
  const [looksError, setLooksError] = useState(false);

  const loadMyLooks = useCallback(async () => {
    if (!userId) return;
    setLooksLoading(true);
    setLooksError(false);
    try {
      const res = await fetchLooksFromApi({ creatorId: userId, status: 'published', limit: 24 });
      setMyLooks(res.items ?? []);
    } catch {
      setLooksError(true);
    } finally {
      setLooksLoading(false);
    }
  }, [userId]);

  // Refetch looks on focus so newly published content appears without
  // requiring a manual refresh. React Query cache invalidation after
  // publish marks these queries stale, but the direct-fetch pattern
  // here needs an explicit focus refetch.
  useFocusEffect(
    useCallback(() => {
      void loadMyLooks();
    }, [loadMyLooks]),
  );

  // Story highlights — fetched for the highlights rail between identity hero
  // and the utility rail. Renders nothing when empty (no fabricated content).
  const [highlights, setHighlights] = useState<PosterHighlight[]>([]);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchPosterHighlights(userId)
      .then((res) => { if (!cancelled) setHighlights(res.items ?? []); })
      .catch(() => { if (!cancelled) setHighlights([]); });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    fetchMyProfile().catch(() => {});
  }, [fetchMyProfile]);

  const refetchReviews = useCallback(() => { void reviewsQuery.refetch(); }, [reviewsQuery]);

  return {
    sellerTrust,
    reviews: myReviews,
    reviewSummary: myReviewSummary,
    reviewCount: myReviewCount,
    reviewsLoading: reviewsQuery.isLoading,
    reviewsError: reviewsQuery.error,
    refetchReviews,
    followCounts,
    followCountsStatus,
    coOwnHoldings,
    myLooks,
    looksLoading,
    looksError,
    loadMyLooks,
    highlights,
  };
}
