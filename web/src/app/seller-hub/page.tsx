'use client';

/**
 * /seller-hub — the analytics command centre. One dominant earnings header,
 * the unified to-do radar, the revenue trajectory, a metric grid with period
 * deltas and the sortable listings table. Flat canvas, hairlines, tnum —
 * no card stack.
 */

import { useState } from 'react';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useSellerOverview,
  useSellerListingPerformance,
  useSellerTodos,
  useSellerEarnings,
  useFulfilmentCounts,
} from '@/lib/hooks/seller-queries';
import type { SellerPeriod } from '@/lib/data/fixtures-seller';
import { SellerHubSkeleton } from '@/components/seller/hub/SellerHubSkeleton';
import { SellerEarningsHeader } from '@/components/seller/hub/SellerEarningsHeader';
import { SellerOpsRadar } from '@/components/seller/hub/SellerOpsRadar';
import { SellerRevenueSection } from '@/components/seller/hub/SellerRevenueSection';
import { SellerMetricsGrid } from '@/components/seller/hub/SellerMetricsGrid';
import { SellerListingsPerformance } from '@/components/seller/hub/SellerListingsPerformance';
import { SellerOpportunitiesRail } from '@/components/seller/hub/SellerOpportunitiesRail';
import { SellerQuickActionsRail } from '@/components/seller/hub/SellerQuickActionsRail';

export default function SellerHubPage() {
  const [period, setPeriod] = useState<SellerPeriod>('30d');

  const overview = useSellerOverview(period);
  const performance = useSellerListingPerformance(period);
  const todos = useSellerTodos();
  const counts = useFulfilmentCounts();
  // Payout schedule — the same escrow-ledger truth /seller-hub/earnings
  // renders, lifted here as the "next payout" line.
  const earnings = useSellerEarnings();

  const isLoading = overview.isLoading || performance.isLoading;
  const isError = overview.isError || performance.isError;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <h1 className="text-screen-title text-text-primary">Seller hub</h1>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {isLoading ? (
        <SellerHubSkeleton />
      ) : isError || !overview.data ? (
        <EmptyState
          icon="analytics"
          title="Couldn't load analytics"
          subtitle="We couldn't reach your seller data. Try again in a moment."
          actionLabel="Retry"
          onAction={() => {
            void overview.refetch();
            void performance.refetch();
          }}
        />
      ) : (
        <>
          {/* ── Earnings header — the number is the object ── */}
          <SellerEarningsHeader
            overview={overview.data}
            earnings={earnings.data}
            period={period}
            onPeriodChange={setPeriod}
          />

          {/* ── Ops band — at lg the chart takes the lead column and the
              to-do radar becomes the right rail (Linear/Shopify grammar);
              stacked DOM order on mobile is unchanged. ── */}
          <div
            className={
              todos.data && todos.data.length > 0
                ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-12'
                : undefined
            }
          >
            <SellerOpsRadar todos={todos.data} className="lg:order-2 lg:mt-10" />
            <SellerRevenueSection overview={overview.data} period={period} className="lg:order-1" />
          </div>

          {/* ── Metric grid — flat cells, hairline dividers ── */}
          <SellerMetricsGrid overview={overview.data} period={period} />

          {/* ── Listings performance — sortable hairline table ── */}
          <SellerListingsPerformance
            performance={performance.data ?? []}
            currency={overview.data.currency}
          />

          {/* ── Opportunities — the overview's near-winners rail ── */}
          <SellerOpportunitiesRail
            opportunities={overview.data.opportunities}
            currency={overview.data.currency}
          />

          {/* ── Quick actions — quiet rail ── */}
          <SellerQuickActionsRail />
        </>
      )}
    </div>
  );
}
