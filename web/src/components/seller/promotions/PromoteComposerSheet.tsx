'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import {
  PROMOTION_DURATIONS_DAYS,
  PROMOTION_MAX_DAILY_BUDGET_MINOR,
  PROMOTION_MIN_DAILY_BUDGET_MINOR,
} from '@/lib/api/services/sellerHub';
import type { PromotionRow } from '@/lib/hooks/seller-queries';
import { formatPrice } from '@/lib/utils/format';
import { INPUT_CLASS } from './SellerPromotionsPrimitives';

interface PromoteComposerSheetProps {
  open: boolean;
  onClose: () => void;
  rows: PromotionRow[];
  listings: { id: string; title: string; status?: string; isSold?: boolean; images: string[] }[];
  loadingListings: boolean;
  pending: boolean;
  onCreate: (input: { listingId: string; dailyBudgetGbp: number; durationDays: 7 | 14 | 30 }) => void;
}

export function PromoteComposerSheet({
  open,
  onClose,
  rows,
  listings,
  loadingListings,
  pending,
  onCreate,
}: PromoteComposerSheetProps) {
  const [listingId, setListingId] = useState('');
  const [budget, setBudget] = useState('');
  const [duration, setDuration] = useState<7 | 14 | 30>(7);

  const busyListingIds = useMemo(
    () =>
      new Set(
        rows
          .filter((r) => r.promotion.status !== 'ended')
          .map((r) => r.promotion.listingId),
      ),
    [rows],
  );
  const eligible = listings.filter(
    (l) => !l.isSold && (l.status === 'active' || l.status == null) && !busyListingIds.has(l.id),
  );
  const budgetGbp = Number.parseFloat(budget);
  const budgetValid =
    Number.isFinite(budgetGbp) &&
    budgetGbp >= PROMOTION_MIN_DAILY_BUDGET_MINOR / 100 &&
    budgetGbp <= PROMOTION_MAX_DAILY_BUDGET_MINOR / 100;
  const canSubmit = Boolean(listingId) && budgetValid && !pending;

  return (
    <Sheet open={open} onClose={onClose} title="Promote a listing" maxWidth={480}>
      <div className="px-5 py-5">
        <p className="text-body text-text-secondary">
          Flat daily fee debited from your payable balance while it runs — you can pause or end it
          anytime.
        </p>

        <div className="mt-5">
          <label
            htmlFor="promote-listing"
            className="block text-caption font-medium text-text-secondary"
          >
            Listing
          </label>
          <select
            id="promote-listing"
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            disabled={loadingListings}
            className={`${INPUT_CLASS} mt-1.5 appearance-none ${listingId ? '' : 'text-text-muted'}`}
          >
            <option value="">
              {loadingListings ? 'Loading your listings…' : 'Choose an active listing'}
            </option>
            {eligible.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
          {!loadingListings && eligible.length === 0 ? (
            <p className="mt-1.5 text-meta text-text-muted">
              No promotable listings — everything active is already sponsored.
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          <label
            htmlFor="promote-budget"
            className="block text-caption font-medium text-text-secondary"
          >
            Daily budget
          </label>
          <div className="relative mt-1.5 max-w-[180px]">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
              £
            </span>
            <input
              id="promote-budget"
              type="text"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="1.00"
              className={`${INPUT_CLASS} tnum pl-7`}
              aria-describedby="promote-budget-hint"
            />
          </div>
          <p id="promote-budget-hint" className="mt-1.5 text-meta text-text-muted">
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

        <div className="mt-7 flex justify-end gap-2">
          <Button variant="quiet" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onCreate({ listingId, dailyBudgetGbp: budgetGbp, durationDays: duration });
            }}
          >
            {pending ? 'Starting…' : 'Start promotion'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
