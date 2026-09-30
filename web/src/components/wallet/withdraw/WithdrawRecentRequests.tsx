'use client';

/**
 * WithdrawRecentRequests — display recent payout requests and status badges.
 */

import { Badge } from '@/components/ui/Badge';
import { formatPrice } from '@/lib/utils/format';
import type { PayoutRequest } from '@/lib/data/fixtures';
import { formatRequestDate, resolvePayoutStatusConfig } from './withdrawViewModel';

interface WithdrawRecentRequestsProps {
  recentRequests: PayoutRequest[];
  requestsError: boolean;
  onRefetchPayouts: () => void;
}

export function WithdrawRecentRequests({
  recentRequests,
  requestsError,
  onRefetchPayouts,
}: WithdrawRecentRequestsProps) {
  if (requestsError) {
    return (
      <section aria-label="Recent withdrawals" className="mt-10 px-4 sm:px-6">
        <h2 className="text-label text-text-muted">
          Recent withdrawals
        </h2>
        <p className="mt-3 text-body text-text-muted">
          Withdrawal history couldn&rsquo;t be loaded.{' '}
          <button
            type="button"
            onClick={onRefetchPayouts}
            className="pressable font-medium text-brand"
          >
            Try again
          </button>
        </p>
      </section>
    );
  }

  if (recentRequests.length === 0) return null;

  return (
    <section aria-label="Recent withdrawals" className="mt-10 px-4 sm:px-6">
      <h2 className="text-label text-text-muted">
        Recent withdrawals
      </h2>
      <ul className="mt-1 divide-y divide-border-subtle">
        {recentRequests.map((r) => {
          const cfg = resolvePayoutStatusConfig(r.status);
          return (
            <li key={r.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="tnum text-body-emphasis font-medium text-text-primary">
                  {formatPrice(r.amountGbp, r.currency)}
                </p>
                <p className="clamp-1 text-caption text-text-muted">
                  {r.destinationLabel} · {formatRequestDate(r.createdAt)}
                </p>
              </div>
              <Badge variant={cfg.badge} icon={cfg.pending ? 'clock' : undefined}>
                {cfg.label}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
