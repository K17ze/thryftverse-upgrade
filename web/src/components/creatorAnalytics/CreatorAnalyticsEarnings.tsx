'use client';

import { Button } from '@/components/ui/Button';
import { parseApiError } from '@/lib/api/http';
import type { EarningsEntry, EarningsSummary } from '@/lib/api/services/creatorAnalytics';
import { formatPrice } from '@/lib/utils/format';
import { entryTypeLabel, MetricLine, SectionLabel } from './CreatorAnalyticsPrimitives';

interface CreatorAnalyticsEarningsProps {
  earnings: EarningsSummary | undefined;
  onPayout: () => void;
  isPayoutPending: boolean;
  isPayoutError: boolean;
  payoutError: unknown;
  isOffline: boolean;
}

export function CreatorAnalyticsEarnings({
  earnings,
  onPayout,
  isPayoutPending,
  isPayoutError,
  payoutError,
  isOffline,
}: CreatorAnalyticsEarningsProps) {
  if (!earnings) return null;

  return (
    <section className="mt-8" aria-label="Earnings">
      <SectionLabel>Earnings</SectionLabel>
      <div className="mt-1">
        <MetricLine
          label="Available"
          value={formatPrice(earnings.available.amountMinor / 100, earnings.currency)}
          emphasis
        />
        <MetricLine
          label="Estimated"
          value={formatPrice(earnings.estimated.amountMinor / 100, earnings.currency)}
        />
        <MetricLine
          label="Finalized"
          value={formatPrice(earnings.finalized.amountMinor / 100, earnings.currency)}
        />
        {/* Held — money parked in an in-flight bank payout */}
        {earnings.held.amountMinor > 0 ? (
          <MetricLine
            label="Processing"
            value={formatPrice(earnings.held.amountMinor / 100, earnings.currency)}
          />
        ) : null}
        <MetricLine
          label="Paid"
          value={formatPrice(earnings.paid.amountMinor / 100, earnings.currency)}
          last={earnings.available.amountMinor <= 0 && earnings.recentEntries.length === 0}
        />
      </div>

      {earnings.available.amountMinor > 0 ? (
        <div className="mt-4">
          <Button
            variant="primary"
            size="md"
            onClick={onPayout}
            disabled={isPayoutPending || isOffline}
          >
            {isPayoutPending ? 'Processing…' : 'Request payout'}
          </Button>
          {isPayoutError ? (
            <p className="mt-2 text-caption font-medium text-danger-text" role="alert">
              {parseApiError(payoutError, 'Payout failed. Please try again.').message}
            </p>
          ) : null}
        </div>
      ) : null}

      {earnings.recentEntries.length > 0 ? (
        <div className="mt-5">
          <p className="text-meta text-text-muted">Recent</p>
          <ul className="mt-1 divide-y divide-border-subtle border-b border-border-subtle">
            {earnings.recentEntries.slice(0, 5).map((entry: EarningsEntry) => (
              <li key={entry.id} className="flex items-baseline gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="text-body text-text-primary">
                    {entryTypeLabel(entry.entryType)}
                    {entry.status === 'held' ||
                    entry.status === 'reversed' ||
                    entry.status === 'pending' ? (
                      <span className="text-text-muted">
                        {entry.status === 'held'
                          ? ' · Processing'
                          : entry.status === 'pending'
                            ? ' · Pending'
                            : ' · Reversed'}
                      </span>
                    ) : null}
                  </span>
                  {entry.description ? (
                    <span className="clamp-1 mt-0.5 block text-meta text-text-muted">
                      {entry.description}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`tnum shrink-0 text-body ${
                    entry.amountMinor < 0 ? 'text-danger-text' : 'text-text-primary'
                  }`}
                >
                  {formatPrice(entry.amountMinor / 100, entry.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
