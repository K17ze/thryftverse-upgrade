'use client';

/**
 * /seller-hub/promotions — the Sponsored-placement manage surface,
 * web port of the mobile SellerPromotionsPanel.
 *
 * Live mode reads /seller/promotions + /seller/promotions/:id/stats —
 * spend, billed days, impressions and taps are all real posted events,
 * omitted entirely until stats land rather than zeroed placeholders.
 * Fixture rows are session-local and flagged demo; they carry no
 * spend/metrics claims at all.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import {
  PROMOTION_DURATIONS_DAYS,
  PROMOTION_MAX_DAILY_BUDGET_MINOR,
  PROMOTION_MIN_DAILY_BUDGET_MINOR,
  type SellerPromotion,
} from '@/lib/api/services/sellerHub';
import {
  useCreatePromotion,
  useFulfilmentCounts,
  usePromotionAction,
  usePromotionStats,
  useSellerPromotions,
  type PromotionRow,
} from '@/lib/hooks/seller-queries';
import { useMyListings } from '@/lib/hooks/queries';
import { MY_LISTINGS } from '@/lib/data/fixtures';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

const INPUT_CLASS =
  'h-11 w-full rounded-md border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

/** Machine-readable paused_reason → truthful seller-facing copy (mobile parity). */
function pausedReasonCopy(reason: string | null | undefined): string | null {
  switch (reason) {
    case 'listing_unservable':
      return 'listing can’t be promoted';
    case 'seller_restricted':
      return 'account reach is limited';
    default:
      return reason ? 'paused by the system' : null;
  }
}

function statusBadge(status: string, pausedReason?: string | null): { text: string; tone: StatusTone } {
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

function fmtDay(iso: string): string {
  const d = Date.parse(iso);
  return Number.isFinite(d) ? formatDate(iso) : iso;
}

/** Per-promotion stats cell — resolves the live stats endpoint; never
 *  prints placeholder metrics while it loads or when none exist. */
function PromotionStatsLine({ promotionId }: { promotionId: string }) {
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

export default function SellerPromotionsPage() {
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

  const rows = promotions.data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <h1 className="text-screen-title font-semibold text-text-primary">Promoted listings</h1>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {promotions.isLoading ? (
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
      ) : promotions.isError ? (
        <div className="mt-8">
          <EmptyState
            icon="alert"
            title="Couldn't load promotions"
            subtitle="We couldn't reach your sponsored listings. Try again in a moment."
            actionLabel="Retry"
            onAction={() => void promotions.refetch()}
          />
        </div>
      ) : (
        <>
          <p className="mt-5 text-body text-text-secondary">
            Sponsored listings occupy labelled placements in discovery. You pay a flat daily fee
            from your balance — impressions and taps below are real recorded events.
          </p>

          {rows.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon="trending"
                title="Nothing promoted yet"
                subtitle="Boost a live listing to reach more buyers in feeds and search."
                actionLabel="Promote a listing"
                onAction={() => setComposerOpen(true)}
              />
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-border-subtle border-y border-border-subtle">
              {rows.map((row) => (
                <PromotionListRow
                  key={row.promotion.id}
                  row={row}
                  pending={action.isPending}
                  onAction={runAction}
                  onRequestEnd={(id) => setConfirmEnd(id)}
                />
              ))}
            </ul>
          )}

          {DATA_MODE !== 'live' ? (
            <p className="mt-3 flex items-start gap-1.5 text-meta text-text-muted">
              <Icon name="info" size={14} className="mt-px shrink-0" />
              Demo mode — promotions you create here are session-local: no spend is debited and no
              placement is delivered, so rows carry no metrics.
            </p>
          ) : null}

          {rows.length > 0 ? (
            <Button
              variant="secondary"
              size="md"
              icon="plus"
              className="mt-6"
              onClick={() => setComposerOpen(true)}
            >
              Promote another listing
            </Button>
          ) : null}
        </>
      )}

      {/* End confirmation — mirrors the mobile ConfirmationSheet. */}
      <Sheet
        open={confirmEnd != null}
        onClose={() => setConfirmEnd(null)}
        title="End this promotion?"
        maxWidth={420}
      >
        <div className="px-5 py-5">
          <p className="text-body text-text-secondary">
            The listing leaves Sponsored placements immediately and no further daily charges run.
            Ended promotions can&apos;t be resumed — you&apos;d create a new one.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="quiet" size="md" onClick={() => setConfirmEnd(null)}>
              Keep running
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={() => {
                if (confirmEnd) runAction(confirmEnd, 'end');
                setConfirmEnd(null);
              }}
            >
              End promotion
            </Button>
          </div>
        </div>
      </Sheet>

      <PromoteComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        rows={rows}
        listings={myListings.data ?? []}
        loadingListings={myListings.isLoading}
        pending={create.isPending}
        onCreate={(input) =>
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
          })
        }
      />
    </div>
  );
}

function PromotionListRow({
  row,
  pending,
  onAction,
  onRequestEnd,
}: {
  row: PromotionRow;
  pending: boolean;
  onAction: (promotionId: string, verb: 'pause' | 'resume' | 'end') => void;
  onRequestEnd: (promotionId: string) => void;
}) {
  const live = row.kind === 'live' ? (row.promotion as SellerPromotion) : null;
  const demo = row.kind === 'demo' ? row.promotion : null;
  const status = live ? live.status : demo!.status;
  const badge = statusBadge(status, live?.pausedReason);

  // Resolve the listing title/thumb — live rows carry server fields;
  // fixture rows join MY_LISTINGS by id.
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
    <li className="flex items-start gap-3.5 py-3.5">
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
          <Badge variant={badge.tone}>{badge.text}</Badge>
          {demo ? <Badge variant="neutral">Demo</Badge> : null}
        </div>
        {/* Metrics — every figure traces to a payload field: the daily
            rate and spend come from the row; billed days, impressions and
            taps land from the stats endpoint (live only). */}
        <p className="tnum mt-1 text-meta text-text-secondary">
          {formatPrice(dailyBudget)}/day
          {totalSpend != null ? ` · spent ${formatPrice(totalSpend)}` : ''}
          {` · ends ${fmtDay(endsAt)}`}
        </p>
        {live ? <PromotionStatsLine promotionId={live.id} /> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
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

/** Create flow — active, un-promoted listings only; budget bounded by the
 *  contract's £1–£500/day window; the same durations the API accepts. */
function PromoteComposer({
  open,
  onClose,
  rows,
  listings,
  loadingListings,
  pending,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  rows: PromotionRow[];
  listings: { id: string; title: string; status?: string; isSold?: boolean; images: string[] }[];
  loadingListings: boolean;
  pending: boolean;
  onCreate: (input: { listingId: string; dailyBudgetGbp: number; durationDays: 7 | 14 | 30 }) => void;
}) {
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
