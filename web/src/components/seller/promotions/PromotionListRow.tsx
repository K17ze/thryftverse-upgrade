'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import type { SellerPromotion } from '@/lib/api/services/sellerHub';
import type { PromotionRow } from '@/lib/hooks/seller-queries';
import { MY_LISTINGS } from '@/lib/data/fixtures';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';
import {
  fmtDay,
  PromotionStatsCells,
  PromotionStatsLine,
  statusBadge,
} from './SellerPromotionsPrimitives';

interface PromotionListRowProps {
  row: PromotionRow;
  pending: boolean;
  onAction: (promotionId: string, verb: 'pause' | 'resume' | 'end') => void;
  onRequestEnd: (promotionId: string) => void;
}

export function PromotionListRow({
  row,
  pending,
  onAction,
  onRequestEnd,
}: PromotionListRowProps) {
  const live = row.kind === 'live' ? (row.promotion as SellerPromotion) : null;
  const demo = row.kind === 'demo' ? row.promotion : null;
  const status = live ? live.status : demo!.status;
  const badge = statusBadge(status, live?.pausedReason);

  const listing = useMemo(
    () =>
      live
        ? null
        : (MY_LISTINGS.find((l) => l.id === row.promotion.listingId) ?? null),
    [live, row.promotion.listingId],
  );
  const title = live?.listingTitle ?? listing?.title ?? 'Listing';
  const thumb = live?.listingImageUrl ?? (listing ? getListingCoverUri(listing.images) : '');
  const dailyBudget = live ? live.dailyBudgetGbp : demo!.dailyBudgetGbp;
  const totalSpend = live?.totalSpendGbp;
  const endsAt = live ? live.endsAt : demo!.endsAt;

  return (
    // Below lg the row is the mobile flex line; at lg it becomes a table
    // row — the same facts the meta line carries, as real columns
    // (thumb+listing | spend | reach | status | actions).
    <li className="flex items-start gap-3.5 py-3.5 lg:grid lg:grid-cols-[3.5rem_minmax(0,1.4fr)_7rem_minmax(0,10rem)_minmax(0,10rem)_9rem] lg:items-center lg:gap-x-5">
      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-alt">
        {thumb ? <AppImage src={thumb} alt={title} fill sizes="56px" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/item/${row.promotion.listingId}`}
            className="pressable clamp-1 text-body-emphasis font-medium text-text-primary"
          >
            {title}
          </Link>
          {/* Badges sit inline below lg; at lg they file under Status. */}
          <span className="flex items-center gap-2 lg:hidden">
            <Badge variant={badge.tone}>{badge.text}</Badge>
            {demo ? <Badge variant="neutral">Demo</Badge> : null}
          </span>
        </div>
        {/* Compact meta — mobile only; at lg spend/reach are real cells
            and ends stays under the title as the identity line. */}
        <p className="tnum mt-1 text-meta text-text-secondary lg:hidden">
          {formatPrice(dailyBudget)}/day
          {totalSpend != null ? ` · spent ${formatPrice(totalSpend)}` : ''}
          {` · ends ${fmtDay(endsAt)}`}
        </p>
        <p className="tnum mt-1 hidden text-meta text-text-muted lg:block">
          Ends {fmtDay(endsAt)}
        </p>
        {live ? (
          <div className="lg:hidden">
            <PromotionStatsLine promotionId={live.id} />
          </div>
        ) : null}
      </div>
      <div className="hidden min-w-0 lg:block">
        <p className="tnum text-body font-semibold text-text-primary">
          {formatPrice(dailyBudget)}
          <span className="text-meta font-medium text-text-muted">/day</span>
        </p>
        <p className="tnum mt-0.5 text-meta text-text-muted">
          {totalSpend != null ? `${formatPrice(totalSpend)} spent` : 'No spend recorded'}
        </p>
      </div>
      <div className="hidden min-w-0 lg:block">
        {live ? (
          <PromotionStatsCells promotionId={live.id} />
        ) : (
          <span className="text-meta text-text-muted">—</span>
        )}
      </div>
      <div className="hidden min-w-0 flex-col items-start gap-1 lg:flex">
        <Badge variant={badge.tone}>{badge.text}</Badge>
        {demo ? <Badge variant="neutral">Demo</Badge> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 lg:justify-self-end">
        {status === 'active' ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onAction(row.promotion.id, 'pause')}
            className="pressable inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-caption font-medium text-text-primary hover:bg-brand-subtle disabled:opacity-50"
            aria-label={`Pause promotion for ${title}`}
          >
            <Icon name="pause" size={14} />
            Pause
          </button>
        ) : null}
        {status === 'paused' ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onAction(row.promotion.id, 'resume')}
            className="pressable inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-caption font-medium text-text-primary hover:bg-brand-subtle disabled:opacity-50"
            aria-label={`Resume promotion for ${title}`}
          >
            <Icon name="play" size={14} />
            Resume
          </button>
        ) : null}
        {status !== 'ended' ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onRequestEnd(row.promotion.id)}
            className="pressable inline-flex h-9 items-center rounded-md px-2 text-caption font-medium text-danger-text hover:bg-danger-subtle disabled:opacity-50"
            aria-label={`End promotion for ${title}`}
          >
            End
          </button>
        ) : null}
      </div>
    </li>
  );
}
