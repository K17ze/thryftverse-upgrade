'use client';

import { Skeleton } from '@/components/ui/Skeleton';
import { usePromotionStats } from '@/lib/hooks/seller-queries';
import { formatDate } from '@/lib/utils/format';

export const INPUT_CLASS =
  'h-11 w-full rounded-md border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

/** Machine-readable paused_reason → truthful seller-facing copy (mobile parity). */
export function pausedReasonCopy(reason: string | null | undefined): string | null {
  switch (reason) {
    case 'listing_unservable':
      return 'listing can’t be promoted';
    case 'seller_restricted':
      return 'account reach is limited';
    default:
      return reason ? 'paused by the system' : null;
  }
}

export function statusBadge(status: string, pausedReason?: string | null): { text: string; tone: StatusTone } {
  switch (status) {
    case 'active':
      return { text: 'Sponsored', tone: 'success' };
    case 'paused': {
      const reason = pausedReasonCopy(pausedReason);
      return { text: reason ? `Paused — ${reason}` : 'Paused', tone: 'warning' };
    }
    case 'exhausted':
      return { text: 'Stopped — balance ran out', tone: 'danger' };
    case 'ended':
    default:
      return { text: 'Ended', tone: 'neutral' };
  }
}

export function fmtDay(iso: string): string {
  const d = Date.parse(iso);
  return Number.isFinite(d) ? formatDate(iso) : iso;
}

/** Per-promotion stats cell — resolves the live stats endpoint; never
 *  prints placeholder metrics while it loads or when none exist. */
export function PromotionStatsLine({ promotionId }: { promotionId: string }) {
  const stats = usePromotionStats(promotionId);
  if (stats.isLoading) {
    return (
      <p className="mt-1.5 flex items-center gap-2 text-meta text-text-muted" aria-busy>
        <Skeleton className="h-3 w-40" />
      </p>
    );
  }
  if (!stats.data) return null;
  const s = stats.data;
  return (
    <p className="tnum mt-1.5 text-meta text-text-muted">
      {s.chargedDays} day{s.chargedDays === 1 ? '' : 's'} billed · {s.impressions.toLocaleString()}{' '}
      impressions · {s.clicks.toLocaleString()} taps
    </p>
  );
}

export function PromotionsSkeleton() {
  return (
    <div className="mt-8 space-y-4" aria-busy aria-label="Loading promotions">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-3.5 py-3">
          <Skeleton className="h-14 w-14 rounded-md" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-1.5 h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
