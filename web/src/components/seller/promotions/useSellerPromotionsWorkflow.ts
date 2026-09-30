'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import {
  useCreatePromotion,
  useFulfilmentCounts,
  usePromotionAction,
  useSellerPromotions,
} from '@/lib/hooks/seller-queries';
import { useMyListings } from '@/lib/hooks/queries';

export function useSellerPromotionsWorkflow() {
  const counts = useFulfilmentCounts();
  const { show } = useToast();
  const promotions = useSellerPromotions();
  const action = usePromotionAction();
  const create = useCreatePromotion();
  const myListings = useMyListings();
  const [confirmEnd, setConfirmEnd] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const runAction = (promotionId: string, verb: 'pause' | 'resume' | 'end') => {
    action.mutate(
      { promotionId, action: verb },
      {
        onSuccess: () =>
          show(
            verb === 'pause'
              ? 'Promotion paused'
              : verb === 'resume'
                ? 'Promotion running again'
                : 'Promotion ended',
            'success',
          ),
        onError: () => show('Could not update the promotion — try again', 'error'),
      },
    );
  };

  const handleCreate = (input: { listingId: string; dailyBudgetGbp: number; durationDays: 7 | 14 | 30 }) => {
    create.mutate(input, {
      onSuccess: () => {
        show(
          DATA_MODE === 'live'
            ? 'Promotion running — your listing enters Sponsored placements'
            : 'Demo promotion added — session-local, no spend',
          'success',
        );
        setComposerOpen(false);
      },
      onError: (e) =>
        show(
          e instanceof Error ? e.message : 'Could not create the promotion — try again',
          'error',
        ),
    });
  };

  const rows = promotions.data ?? [];

  return {
    counts,
    promotions,
    action,
    create,
    myListings,
    confirmEnd,
    setConfirmEnd,
    composerOpen,
    setComposerOpen,
    runAction,
    handleCreate,
    rows,
    liveMode: DATA_MODE === 'live',
  };
}
