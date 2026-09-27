'use client';

/**
 * PromoteListingSheet — the per-listing promote entry (manage surface).
 * Same contract as the promotions page composer, minus the listing picker:
 * a fixed listing, a daily budget bounded by the service's £1–£500 window,
 * and the three real durations.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { useCreatePromotion, useSellerPromotions } from '@/lib/hooks/seller-queries';
import {
  PROMOTION_DURATIONS_DAYS,
  PROMOTION_MAX_DAILY_BUDGET_MINOR,
  PROMOTION_MIN_DAILY_BUDGET_MINOR,
} from '@/lib/api/services/sellerHub';
import { useToast } from '@/components/ui/Toast';
import { formatPrice } from '@/lib/utils/format';
import type { Listing } from '@/lib/contracts/domain';

interface PromoteListingSheetProps {
  open: boolean;
  listing: Listing | null;
  onClose: () => void;
}

export function PromoteListingSheet({ open, listing, onClose }: PromoteListingSheetProps) {
  const { show } = useToast();
  const create = useCreatePromotion();
  const promotions = useSellerPromotions();
  const [budget, setBudget] = useState('');
  const [duration, setDuration] = useState<7 | 14 | 30>(7);

  useEffect(() => {
    if (open) {
      setBudget('');
      setDuration(7);
    }
  }, [open]);

  /** One live promotion per listing — the contract rejects a second one,
   *  so the sheet short-circuits honestly before it can error. */
  const existing = useMemo(
    () =>
      listing
        ? (promotions.data ?? []).find(
            (r) => r.promotion.listingId === listing.id && r.promotion.status !== 'ended',
          )
        : undefined,
    [promotions.data, listing],
  );

  const budgetGbp = Number.parseFloat(budget);
  const budgetValid =
    Number.isFinite(budgetGbp) &&
    budgetGbp >= PROMOTION_MIN_DAILY_BUDGET_MINOR / 100 &&
    budgetGbp <= PROMOTION_MAX_DAILY_BUDGET_MINOR / 100;
  const canSubmit = Boolean(listing) && budgetValid && !existing && !create.isPending;

  const submit = () => {
    if (!listing || !canSubmit) return;
    create.mutate(
      { listingId: listing.id, dailyBudgetGbp: budgetGbp, durationDays: duration },
      {
        onSuccess: () => {
          show(`“${listing.title}” promoted — ${formatPrice(budgetGbp)}/day`, 'success');
          onClose();
        },
        onError: () => show("Couldn't start the promotion — try again", 'error'),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Promote this listing" maxWidth={480}>
      <div className="px-5 pb-6 pt-1">
        <p className="text-body text-text-secondary">
          “{listing?.title}” sits in sponsored slots for a flat daily fee, debited from your
          payable balance — pause or end it anytime.
        </p>

        {existing ? (
          <p className="mt-4 rounded-md bg-surface-alt px-3 py-2.5 text-body text-text-secondary">
            This listing already has a {existing.promotion.status} promotion — manage it from
            the Promoted surface.
          </p>
        ) : (
          <>
            <div className="mt-5">
              <label
                htmlFor="manage-promote-budget"
                className="block text-caption font-medium text-text-secondary"
              >
                Daily budget
              </label>
              <div className="relative mt-1.5 max-w-[180px]">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
                  £
                </span>
                <input
                  id="manage-promote-budget"
                  type="text"
                  inputMode="decimal"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="1.00"
                  className="tnum h-11 w-full rounded-md border border-border bg-surface pl-7 pr-3 text-body text-text-primary placeholder:text-text-muted focus:border-text-muted focus:outline-none"
                />
              </div>
              <p className="mt-1.5 text-meta text-text-muted">
                {formatPrice(PROMOTION_MIN_DAILY_BUDGET_MINOR / 100)}–
                {formatPrice(PROMOTION_MAX_DAILY_BUDGET_MINOR / 100)} per day
              </p>
            </div>

            <div className="mt-5">
              <span className="block text-caption font-medium text-text-secondary">Duration</span>
              <div className="mt-1.5 flex gap-1.5" role="group" aria-label="Promotion duration">
                {PROMOTION_DURATIONS_DAYS.map((d) => (
                  <Chip key={d} selected={duration === d} onClick={() => setDuration(d)}>
                    {d} days
                  </Chip>
                ))}
              </div>
            </div>

            {budgetValid ? (
              <p className="tnum mt-4 text-meta text-text-secondary">
                Total if it runs the full {duration} days: {formatPrice(budgetGbp * duration)}
              </p>
            ) : null}
          </>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="quiet" size="md" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          {existing ? (
            <Button variant="primary" size="md" onClick={onClose}>
              Done
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={submit}
              disabled={!canSubmit}
              aria-busy={create.isPending}
            >
              {create.isPending ? 'Starting…' : 'Start promotion'}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
