'use client';

/**
 * /creator-analytics — the creator analytics read (mobile
 * CreatorAnalyticsDashboardScreen parity) on the real backend pipeline:
 * summary → timeline → content-ranking → earnings. Summary is the
 * critical read — its failure is the fatal state; the supplementary
 * reads degrade to a partial-error banner, never fabricated zeros.
 *
 * Layout keeps the native grammar: freshness strip, media-anchored views
 * hero, comparison context, suppressed-dimension callout, flat metric
 * lines, the views trend, ranked content rows with real thumbnails, and
 * the earnings ledger with a wallet payout action.
 *
 * Live-backend only — the v2 analytics pipeline has no fixture dataset,
 * so the demo build gets an honest notice instead of invented metrics.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LineChart } from '@/components/charts/LineChart';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import type {
  Completeness,
  ContentRankingItem,
} from '@/lib/api/services/creatorAnalytics';
import type { AnalyticsPeriod } from '@/lib/api/services/creatorAnalytics';
import {
  useCreatorAnalyticsPayout,
  useCreatorAnalyticsSummary,
  useCreatorAnalyticsTimeline,
  useCreatorContentRanking,
  useCreatorEarnings,
} from '@/lib/hooks/creator-analytics-queries';
import { useOnlineStatus } from '@/lib/offline';
import { useSession } from '@/lib/session/SessionProvider';
import { formatCount, formatPrice } from '@/lib/utils/format';

// ── Format helpers — port of mobile creatorAnalyticsFormat.ts ──────────

const formatRate = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;

function formatDelta(changeRatio: number | null): string {
  if (changeRatio == null) return '';
  const pct = changeRatio * 100;
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** endExclusive is exclusive — the label shows the last included day. */
function formatDateRange(range: { start: string; endExclusive: string }): string {
  const s = new Date(range.start);
  const e = new Date(range.endExclusive);
  e.setUTCDate(e.getUTCDate() - 1);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(s)} – ${fmt(e)}`;
}

function completenessLabel(c: Completeness): string {
  switch (c) {
    case 'complete': return 'Up to date';
    case 'provisional': return 'Provisional';
    case 'delayed': return 'Delayed';
    case 'unavailable': return 'No data yet';
  }
}

function completenessTone(c: Completeness): string {
  switch (c) {
    case 'complete': return 'text-success-text';
    case 'provisional': return 'text-warning-text';
    case 'delayed': return 'text-warning-text';
    case 'unavailable': return 'text-text-muted';
  }
}

function entryTypeLabel(t: string): string {
  switch (t) {
    case 'estimated': return 'Estimated';
    case 'earned': return 'Earned';
    case 'held': return 'Held';
    case 'adjustment': return 'Adjustment';
    case 'refund_reversal': return 'Refund';
    case 'chargeback_reversal': return 'Chargeback';
    case 'payout': return 'Payout';
    default: return t;
  }
}

// Backend sends machine tokens — translate at the render layer, never
// leak raw internal vocabulary into product copy (mobile parity).
const SUPPRESSED_DIMENSION_LABELS: Record<string, string> = {
  audience: 'Audience',
};
const SUPPRESSED_REASON_LABELS: Record<string, string> = {
  insufficient_data: 'hidden until you have more data',
};

const PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];

// ── Primitives ─────────────────────────────────────────────────────────

/** Flat metric line — label left, value right, hairline separator. */
function MetricLine({
  label,
  value,
  emphasis,
  last,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-3 ${
        last ? '' : 'border-b border-border-subtle'
      }`}
    >
      <span className="text-body text-text-secondary">{label}</span>
      <span
        className={`tnum text-right ${
          emphasis
            ? 'text-body-emphasis font-semibold text-text-primary'
            : 'text-body text-text-primary'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-caption font-semibold text-text-secondary">{children}</h2>
  );
}

/** Poster + story analytics ids are poster_stories ids (mobile emits
 *  events keyed on activeStory.id), so the viewer route resolves both. */
function contentHref(item: ContentRankingItem): string {
  return item.contentType === 'look'
    ? `/look/${item.contentId}`
    : `/poster/${item.contentId}`;
}

function AnalyticsSkeleton() {
  return (
    <div className="mt-8 space-y-8" aria-busy aria-label="Loading analytics">
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="space-y-1">
        <Skeleton className="h-4 w-24" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      <Skeleton className="h-44 w-full rounded-md" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function CreatorAnalyticsPage() {
  const router = useRouter();
  const { user, isGuest, sessionLoading } = useSession();
  const { isOffline } = useOnlineStatus();
  const { show: showToast } = useToast();
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');

  const summaryQuery = useCreatorAnalyticsSummary(period);
  const timelineQuery = useCreatorAnalyticsTimeline(period);
  const rankingQuery = useCreatorContentRanking(period);
  const earningsQuery = useCreatorEarnings();
  const payout = useCreatorAnalyticsPayout();

  const liveUnavailable = DATA_MODE !== 'live';
  const needsSignIn = !user || isGuest;
  const armed = !liveUnavailable && !needsSignIn;

  const summary = armed ? summaryQuery.data : undefined;
  const timeline = armed ? timelineQuery.data : undefined;
  const ranking = armed ? rankingQuery.data : undefined;
  const earnings = armed ? earningsQuery.data : undefined;

  // Same contract as native: 'unavailable' zeros are an outage signal,
  // not "no activity" — only real zeros render the empty state.
  const isEmpty = summary
    ? summary.completeness !== 'unavailable' &&
      summary.summary.views.value === 0 &&
      summary.summary.likes.value === 0 &&
      summary.summary.saves.value === 0 &&
      summary.summary.comments.value === 0 &&
      summary.summary.shares.value === 0 &&
      summary.summary.productClicks.value === 0
    : false;

  const partialError =
    armed &&
    !summaryQuery.isLoading &&
    (timelineQuery.isError ||
      rankingQuery.isError ||
      earningsQuery.isError ||
      // A failed period switch keeps the previous period's reads mounted
      // under placeholderData — flag it instead of pretending all is well.
      (summaryQuery.isError && !!summary));

  // Mounted reads still showing the previous period AND the next period
  // is actually in flight — a settled placeholder after an error is
  // caught by partialError, not labelled "updating".
  const stalePeriod =
    (summaryQuery.isPlaceholderData && summaryQuery.isFetching) ||
    (timelineQuery.isPlaceholderData && timelineQuery.isFetching) ||
    (rankingQuery.isPlaceholderData && rankingQuery.isFetching);

  const heroThumbnail = ranking?.items[0]?.thumbnailUrl ?? null;

  const onPayout = () => {
    payout.mutate(undefined, {
      onSuccess: () => showToast('Payout requested', 'success'),
      onError: (err) =>
        showToast(parseApiError(err, 'Payout failed. Please try again.').message, 'error'),
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <h1 className="text-screen-title text-text-primary">Creator analytics</h1>

      {/* Period selector — hairline tabs, mobile grammar. */}
      <Tabs
        className="mt-5"
        tabs={PERIODS.map((p) => ({ key: p.key, label: p.label }))}
        active={period}
        onChange={setPeriod}
        ariaLabel="Analytics period"
      />

      {sessionLoading || (armed && summaryQuery.isLoading) ? (
        <AnalyticsSkeleton />
      ) : liveUnavailable ? (
        <EmptyState
          icon="analytics"
          title="Creator analytics needs the live service"
          subtitle="This surface reads your real content performance — it isn't part of the demo dataset."
        />
      ) : needsSignIn ? (
        <EmptyState
          icon="profile"
          title="Sign in to view creator analytics"
          subtitle="Views, engagement and earnings are tied to your account."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      ) : summaryQuery.isError && !summary ? (
        <EmptyState
          icon="alert"
          title="Couldn't load analytics"
          subtitle={parseApiError(summaryQuery.error, 'The aggregates didn’t come through — try again.').message}
          actionLabel="Retry"
          onAction={() => void summaryQuery.refetch()}
        />
      ) : !summary ? null : isEmpty ? (
        <EmptyState
          icon="analytics"
          title="No analytics data yet"
          subtitle="Publish content to see insights."
        />
      ) : (
        <>
          {/* 1. Data freshness — completeness dot + watermark, always visible. */}
          <div className="mt-6 flex items-center gap-2">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full bg-current ${completenessTone(summary.completeness)}`}
            />
            <span className="text-meta text-text-muted">
              {completenessLabel(summary.completeness)}
              {' · updated '}
              {new Date(summary.watermark).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
              })}
            </span>
          </div>

          {/* Period switch in flight — mounted reads belong to the
              previous period; say so instead of flashing a skeleton. */}
          {stalePeriod ? (
            <div className="mt-4 rounded-lg bg-surface-alt px-3 py-2">
              <p className="text-meta text-text-muted">
                Showing previous period · updating…
              </p>
            </div>
          ) : null}

          {/* 2. Views hero — media-anchored when top content carries a
              real thumbnail, flat otherwise (native grammar). */}
          {heroThumbnail ? (
            <section className="relative mt-5 overflow-hidden rounded-xl">
              <AppImage
                src={heroThumbnail}
                alt="Top content this period"
                aspectRatio={16 / 9}
                sizes="(max-width: 768px) 100vw, 768px"
                fallbackIcon="image"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/25 to-black/60"
              />
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                <p className="text-meta font-medium text-scrim-text-secondary">Views</p>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <span className="tnum text-screen-title font-bold text-scrim-text-primary">
                    {formatCount(summary.summary.views.value)}
                  </span>
                  <HeroDelta changeRatio={summary.summary.views.changeRatio} onMedia />
                </div>
              </div>
            </section>
          ) : (
            <section className="mt-5">
              <p className="text-meta font-medium text-text-secondary">Views</p>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="tnum text-screen-title font-bold text-text-primary">
                  {formatCount(summary.summary.views.value)}
                </span>
                <HeroDelta changeRatio={summary.summary.views.changeRatio} />
              </div>
            </section>
          )}

          {/* 3. Comparison context — one line, not per-metric badges. */}
          <p className="mt-2 text-meta text-text-muted">
            {formatDateRange(summary.range)} vs {formatDateRange(summary.comparisonRange)}
          </p>

          {/* 4. Suppressed dimensions — the wire's own tokens, translated. */}
          {summary.suppressedDimensions.length > 0 ? (
            <div className="mt-3 flex items-center gap-1.5">
              <Icon name="info" size={13} className="shrink-0 text-text-muted" />
              <p className="text-meta text-text-muted">
                {summary.suppressedDimensions
                  .map(
                    (d) =>
                      `${SUPPRESSED_DIMENSION_LABELS[d.dimension] ?? d.dimension} ${
                        SUPPRESSED_REASON_LABELS[d.reason] ?? 'unavailable'
                      }`,
                  )
                  .join(' · ')}
              </p>
            </div>
          ) : null}

          {/* 5. Secondary metrics — flat lines, no cards. Qualified views
              is on the wire but stays unrendered (native omits it too);
              engagement rate leads as the derived read. */}
          <section className="mt-5" aria-label="Engagement metrics">
            <MetricLine
              label="Engagement rate"
              value={formatRate(summary.summary.engagementRate.value)}
            />
            <MetricLine
              label="Profile visits"
              value={formatCount(summary.summary.profileVisits.value)}
            />
            <MetricLine
              label="Product clicks"
              value={formatCount(summary.summary.productClicks.value)}
            />
            <MetricLine label="Likes" value={formatCount(summary.summary.likes.value)} />
            <MetricLine label="Saves" value={formatCount(summary.summary.saves.value)} />
            <MetricLine
              label="Comments"
              value={formatCount(summary.summary.comments.value)}
            />
            <MetricLine
              label="Shares"
              value={formatCount(summary.summary.shares.value)}
              last
            />
          </section>

          {/* 6. Partial failure — a supplementary read failed; the rest
              of the page stays mounted and honest. */}
          {partialError ? (
            <div className="mt-5 flex items-center gap-2 rounded-lg bg-surface-alt px-3 py-2">
              <Icon name="alert" size={14} className="shrink-0 text-warning-text" />
              <p className="text-meta text-text-secondary">
                Some details could not be loaded.
              </p>
            </div>
          ) : null}

          {/* 7. Views over time — the daily series, zero-filled by the
              server across the whole period. */}
          <section className="mt-8" aria-label="Views over time">
            <SectionLabel>Views over time</SectionLabel>
            <div className="mt-4">
              {timelineQuery.isError ? (
                <p className="text-body text-text-muted">Chart unavailable</p>
              ) : (
                <LineChart
                  points={(timeline?.points ?? []).map((p) => ({
                    label: shortDate(p.date),
                    value: p.views,
                    hint: `${formatRate(p.engagementRate)} engagement`,
                  }))}
                  formatValue={(v) => `${formatCount(v)} views`}
                  ariaLabel={`Daily views, ${formatDateRange(
                    timeline?.range ?? summary.range,
                  )}`}
                />
              )}
            </div>
          </section>

          {/* 8. Top content — real thumbnails as colour; rows land on the
              content's own surface (look → /look, poster/story → /poster). */}
          {ranking && ranking.items.length > 0 ? (
            <section className="mt-8" aria-label="Top content">
              <SectionLabel>Top content</SectionLabel>
              <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
                {ranking.items.map((item, i) => (
                  <li key={`${item.contentType}:${item.contentId}`}>
                    <Link
                      href={contentHref(item)}
                      className="pressable flex items-center gap-3.5 py-3"
                    >
                      <span className="tnum w-4 shrink-0 text-center text-meta text-text-muted">
                        {i + 1}
                      </span>
                      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                        <AppImage
                          src={item.thumbnailUrl}
                          alt={item.title}
                          fill
                          sizes="48px"
                          fallbackIcon={item.contentType === 'look' ? 'tag' : 'image'}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="clamp-1 block text-body-emphasis font-medium text-text-primary">
                          {item.title}
                        </span>
                        <span className="tnum mt-0.5 block text-meta text-text-muted">
                          {formatCount(item.views)} views · {formatRate(item.engagementRate)} engagement
                        </span>
                      </span>
                      <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* 9. Earnings — flat ledger, not a dashboard card. The ledger's
              own currency is authoritative (earnings are never converted). */}
          {earnings ? (
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
                {/* Held — money parked in an in-flight bank payout; without
                    this line Available silently drops to zero. */}
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
                    disabled={payout.isPending || isOffline}
                  >
                    {payout.isPending ? 'Processing…' : 'Request payout'}
                  </Button>
                  {payout.isError ? (
                    <p className="mt-2 text-caption font-medium text-danger-text" role="alert">
                      {parseApiError(payout.error, 'Payout failed. Please try again.').message}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {earnings.recentEntries.length > 0 ? (
                <div className="mt-5">
                  <p className="text-meta text-text-muted">Recent</p>
                  <ul className="mt-1 divide-y divide-border-subtle border-b border-border-subtle">
                    {earnings.recentEntries.slice(0, 5).map((entry) => (
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
          ) : null}

          {/* 10. Freshness footer — generatedAt is the server's stamp. */}
          <p className="mt-8 text-center text-meta text-text-muted">
            {`Updated ${new Date(summary.generatedAt).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}`}
          </p>
        </>
      )}
    </div>
  );
}

// ── Views delta chip ───────────────────────────────────────────────────

function HeroDelta({
  changeRatio,
  onMedia,
}: {
  changeRatio: number | null;
  onMedia?: boolean;
}) {
  const label = formatDelta(changeRatio);
  if (!label) return null;
  const up = changeRatio !== null && changeRatio > 0;
  return (
    <span
      className={`tnum inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-meta font-semibold ${
        onMedia
          ? 'bg-black/35 text-scrim-text-primary'
          : up
            ? 'bg-brand-subtle text-success-text'
            : 'bg-brand-subtle text-danger-text'
      }`}
    >
      <Icon name={up ? 'arrowUp' : 'chevronDown'} size={11} />
      {label}
      <span className="sr-only">{up ? ' up' : ' down'} vs previous period</span>
    </span>
  );
}
