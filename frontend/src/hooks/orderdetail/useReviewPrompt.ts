import { useState, useMemo, useEffect, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { normaliseOrderStatus, computeReviewEligibleAtMs } from '../../utils/orderDetailLogic';
import type { CommerceOrder } from '../../services/commerceApi';

// Per research: the prompt should fire no earlier than 72h after delivery
// (or a server-derived reviewEligibleAt), not immediately on delivery.
// "Maybe later" defers by 48h with a re-prompt. This aligns with the 3–5
// day research consensus for physical goods.
const REVIEW_DEFER_HOURS = 48;
const REVIEW_ELIGIBLE_HOURS = 72;

export interface UseReviewPromptParams {
  backendOrder: CommerceOrder | null;
  currentUserId: string | undefined;
  isMountedRef: MutableRefObject<boolean>;
}

export interface UseReviewPromptResult {
  reviewPromptVisible: boolean;
  openReviewPrompt: () => void;
  closeReviewPrompt: () => void;
  deferReviewPrompt: () => void;
}

/**
 * Auto-surface review prompt after delivery. The prompt should fire no
 * earlier than 72h after delivery (or a server-derived reviewEligibleAt),
 * not immediately on delivery. "Maybe later" defers by 48h with a
 * re-prompt.
 */
export function useReviewPrompt({
  backendOrder,
  currentUserId,
  isMountedRef }: UseReviewPromptParams): UseReviewPromptResult {
  const [reviewPromptVisible, setReviewPromptVisible] = useState(false);
  const [reviewPromptShown, setReviewPromptShown] = useState(false);
  const [reviewDeferredUntil, setReviewDeferredUntil] = useState<number | null>(null);

  const reviewEligibleAtMs = useMemo(() => {
    return computeReviewEligibleAtMs(backendOrder, REVIEW_ELIGIBLE_HOURS);
  }, [backendOrder]);

  useEffect(() => {
    if (!backendOrder || reviewPromptShown) return;
    const normalised = normaliseOrderStatus(backendOrder.status);
    const isDelivered = normalised === 'delivered' || normalised === 'completed';
    const buyerId = backendOrder.buyerId;
    if (!isDelivered || currentUserId !== buyerId) return;

    const now = Date.now();
    const eligibleMs = reviewEligibleAtMs ?? now;
    const effectiveMs = reviewDeferredUntil ?? eligibleMs;

    // If not yet eligible, schedule for the eligibility time
    if (now < effectiveMs) {
      const delay = effectiveMs - now;
      const timer = setTimeout(() => {
        if (isMountedRef.current && !reviewPromptShown) {
          setReviewPromptVisible(true);
          setReviewPromptShown(true);
        }
      }, Math.min(delay, 2_147_483_000)); // clamp to max setTimeout delay
      return () => clearTimeout(timer);
    }

    // Already eligible — surface after a short delay for natural feel
    const timer = setTimeout(() => {
      if (isMountedRef.current && !reviewPromptShown) {
        setReviewPromptVisible(true);
        setReviewPromptShown(true);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [backendOrder, reviewPromptShown, currentUserId, reviewEligibleAtMs, reviewDeferredUntil]);

  const openReviewPrompt = useCallback(() => {
    setReviewPromptVisible(true);
  }, []);

  const closeReviewPrompt = useCallback(() => {
    setReviewPromptVisible(false);
  }, []);

  const deferReviewPrompt = useCallback(() => {
    setReviewPromptVisible(false);
    setReviewPromptShown(false);
    setReviewDeferredUntil(Date.now() + REVIEW_DEFER_HOURS * 60 * 60 * 1000);
  }, []);

  return {
    reviewPromptVisible,
    openReviewPrompt,
    closeReviewPrompt,
    deferReviewPrompt,
  };
}
