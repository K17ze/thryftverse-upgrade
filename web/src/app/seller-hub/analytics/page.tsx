'use client';

/**
 * /seller-hub/analytics — the seller analytics read (mobile
 * SellerAnalyticsScreen parity). Real aggregates only: revenue over the
 * selected range (LineChart), the demand funnel (views → likes → offers →
 * orders), category mix over real inventory (BarChart), and the
 * repeat-buyer cohort stat. Preset ranges resolve to exact ISO windows; a
 * custom range is a real slice of the same data — clamped windows disclose
 * rather than imply deeper history.
 */

import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  shortDate,
} from '@/components/seller/analytics/SellerAnalyticsPrimitives';
import { useSellerAnalyticsWorkflow } from '@/components/seller/analytics/useSellerAnalyticsWorkflow';
import { SellerAnalyticsRevenueSection } from '@/components/seller/analytics/SellerAnalyticsRevenueSection';
import { SellerAnalyticsFunnelSection } from '@/components/seller/analytics/SellerAnalyticsFunnelSection';
import { SellerAnalyticsBreakdownSection } from '@/components/seller/analytics/SellerAnalyticsBreakdownSection';
import { SellerAnalyticsAttentionSection } from '@/components/seller/analytics/SellerAnalyticsAttentionSection';
import { SellerAnalyticsCustomRangeSheet } from '@/components/seller/analytics/SellerAnalyticsCustomRangeSheet';

export default function SellerAnalyticsPage() {
  const {
    counts,
    preset,
    setPreset,
    analytics,
    attention,
    data: a,
    funnelBase,
    customSheet,
    customDraft,
    setCustomDraft,
    customError,
    openCustomSheet,
    closeCustomSheet,
    applyCustom,
  } = useSellerAnalyticsWorkflow();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <h1 className="text-screen-title text-text-primary">Analytics</h1>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {/* Range selector — presets are exact windows; custom opens a
          bounded picker so nothing implies history that doesn't exist. */}
      <div
        className="mt-6 flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Date range"
      >
        {(['7d', '30d', '90d'] as const).map((p) => (
          <Chip key={p} selected={preset === p} onClick={() => setPreset(p)}>
            {p === '7d' ? '7 days' : p === '30d' ? '30 days' : '90 days'}
          </Chip>
        ))}
        <Chip selected={preset === 'custom'} onClick={openCustomSheet}>
          Custom
        </Chip>
        <span className="tnum ml-1 text-meta text-text-muted">
          {a ? `${shortDate(a.range.from)} – ${shortDate(a.range.to)}` : ''}
          {a?.clamped ? ' · clamped to available history' : ''}
        </span>
      </div>

      {analytics.isLoading ? (
        <div className="mt-8 space-y-8" aria-busy aria-label="Loading analytics">
          <Skeleton className="h-48 w-full rounded-md" />
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      ) : analytics.isError ? (
        <EmptyState
          icon="alert"
          title="Couldn't load analytics"
          subtitle="The aggregates didn't come through — try again."
          actionLabel="Retry"
          onAction={() => void analytics.refetch()}
        />
      ) : a ? (
        <>
          {/* Revenue + demand funnel — the two demand reads sit
              side-by-side at lg (chart dominant, funnel the ledger). */}
          <div className="mt-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10 xl:gap-16">
            <SellerAnalyticsRevenueSection data={a} />
            <SellerAnalyticsFunnelSection data={a} funnelBase={funnelBase} />
          </div>

          {/* Category mix + repeat buyers — the secondary reads pair up
              at lg rather than stacking full-width. */}
          <SellerAnalyticsBreakdownSection data={a} />

          {/* Needs attention — listings under the view floor in the
              selected range */}
          <SellerAnalyticsAttentionSection
            rows={attention.data}
            isLoading={attention.isLoading}
          />

          {a.demo ? (
            <p className="mt-8 text-meta text-text-muted">
              Demo data — aggregates are computed from this device&rsquo;s fixture closet and
              order book, not a live feed.
            </p>
          ) : null}
        </>
      ) : null}

      {/* Custom range — real ISO dates, validated */}
      <SellerAnalyticsCustomRangeSheet
        open={customSheet}
        onClose={closeCustomSheet}
        customDraft={customDraft}
        onChangeDraft={setCustomDraft}
        error={customError}
        onApply={applyCustom}
      />
    </div>
  );
}
