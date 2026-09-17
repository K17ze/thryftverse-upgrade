import { useCallback, useMemo, useRef, useState } from 'react';
import {
  endListingPromotion,
  fetchSellerPromotions,
  pauseListingPromotion,
  resumeListingPromotion,
  type SellerPromotion,
} from '../../services/promotionsApi';
import { parseApiError } from '../../lib/apiClient';

export type SellerPromotionAction = 'pause' | 'resume' | 'end';

export interface SellerPromotionsController {
  /** Loaded promotions (created_at DESC from the server). `null` until the
   *  first successful load — an empty array means "loaded, none exist". */
  promotions: SellerPromotion[] | null;
  /** True only while the FIRST load is in flight — refreshes with existing
   *  data are silent and never flip this back on. */
  isLoading: boolean;
  /** Last load error — only rendered when `promotions` is still null. */
  error: string | null;
  /** Refetch the seller's promotions. Silent once data exists. Resolves to
   *  the fresh list (or the previous list/null on failure). */
  refresh: () => Promise<SellerPromotion[] | null>;
  /**
   * Run a lifecycle action against the real /seller/promotions/:id/*
   * endpoints. On success the returned fresh promotion row replaces the
   * stale one in state. Throws on failure — the caller surfaces the toast.
   */
  runAction: (
    promotionId: string,
    action: SellerPromotionAction,
  ) => Promise<SellerPromotion>;
  /**
   * listingId → the live (non-ended) promotion for that listing, when one
   * exists. Drives the "Sponsored · £X/day" affordance on inventory rows so
   * a promoted listing never dead-ends into a 409 create attempt.
   */
  liveByListingId: ReadonlyMap<string, SellerPromotion>;
}

/**
 * Owns the seller's promotion lifecycle data: the list fetch (silent on
 * revalidate), per-row pause/resume/end actions, and the listing→promotion
 * map the inventory surface uses to render truthful Sponsored state.
 *
 * The hook never auto-fetches — the host decides when (focus effect for
 * surfaces that render chips, on-open for the management panel).
 */
export function useSellerPromotions(): SellerPromotionsController {
  const [promotions, setPromotions] = useState<SellerPromotion[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // In-flight + loaded guards live in refs so `refresh` stays referentially
  // stable (it is a focus-effect dependency).
  const inflightRef = useRef(false);
  const loadedRef = useRef(false);
  const promotionsRef = useRef<SellerPromotion[] | null>(null);

  const refresh = useCallback(async (): Promise<SellerPromotion[] | null> => {
    if (inflightRef.current) return promotionsRef.current;
    inflightRef.current = true;
    // First load shows the loading state; every later refresh is silent.
    if (!loadedRef.current) setIsLoading(true);
    try {
      const list = await fetchSellerPromotions();
      loadedRef.current = true;
      promotionsRef.current = list;
      setPromotions(list);
      setError(null);
      return list;
    } catch (err) {
      setError(parseApiError(err, 'Could not load promotions.').message);
      return promotionsRef.current;
    } finally {
      inflightRef.current = false;
      setIsLoading(false);
    }
  }, []);

  const runAction = useCallback(
    async (promotionId: string, action: SellerPromotionAction) => {
      const fn =
        action === 'pause'
          ? pauseListingPromotion
          : action === 'resume'
            ? resumeListingPromotion
            : endListingPromotion;
      const result = await fn(promotionId);
      // The server returns the fresh row — merge it truthfully. Fields the
      // action payload does not carry (listing title/thumb, total spend)
      // survive the spread from the previous row.
      setPromotions((prev) => {
        const next = prev
          ? prev.map((p) => (p.id === promotionId ? { ...p, ...result.promotion } : p))
          : prev;
        promotionsRef.current = next;
        return next;
      });
      return result.promotion;
    },
    [],
  );

  const liveByListingId = useMemo(() => {
    const map = new Map<string, SellerPromotion>();
    // List order is created_at DESC — the first non-ended row per listing is
    // its current promotion. 'ended' rows are skipped so a listing whose
    // promotion finished offers the create affordance again.
    for (const p of promotions ?? []) {
      if (p.status === 'ended') continue;
      if (!map.has(p.listingId)) map.set(p.listingId, p);
    }
    return map;
  }, [promotions]);

  return { promotions, isLoading, error, refresh, runAction, liveByListingId };
}
