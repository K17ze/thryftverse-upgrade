'use client';

/**
 * /creator-analytics — creator analytics orchestrator.
 * Follows native mobile CreatorAnalyticsDashboardScreen parity:
 * summary → timeline → content-ranking → earnings.
 *
 * Factored into domain components (<400 LOC standard):
 *  - CreatorAnalyticsHero
 *  - CreatorAnalyticsMetrics
 *  - CreatorAnalyticsTimeline
 *  - CreatorAnalyticsTopContent
 *  - CreatorAnalyticsEarnings
 *  - useCreatorAnalyticsWorkflow
 */

import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { parseApiError } from '@/lib/api/http';
import {
  PERIODS,
  AnalyticsSkeleton,
} from '@/components/creatorAnalytics/CreatorAnalyticsPrimitives';
import { useCreatorAnalyticsWorkflow } from '@/components/creatorAnalytics/useCreatorAnalyticsWorkflow';
import { CreatorAnalyticsHero } from '@/components/creatorAnalytics/CreatorAnalyticsHero';
import { CreatorAnalyticsMetrics } from '@/components/creatorAnalytics/CreatorAnalyticsMetrics';
import { CreatorAnalyticsTimeline } from '@/components/creatorAnalytics/CreatorAnalyticsTimeline';
import { CreatorAnalyticsTopContent } from '@/components/creatorAnalytics/CreatorAnalyticsTopContent';
import { CreatorAnalyticsEarnings } from '@/components/creatorAnalytics/CreatorAnalyticsEarnings';

export default function CreatorAnalyticsPage() {
  const workflow = useCreatorAnalyticsWorkflow();

  const {
    router,
    sessionLoading,
    isOffline,
    period,
    setPeriod,
    summaryQuery,
    timelineQuery,
    payout,
    liveUnavailable,
    needsSignIn,
    armed,
    summary,
    timeline,
    ranking,
    earnings,
    isEmpty,
    partialError,
    stalePeriod,
    heroThumbnail,
    onPayout,
  } = workflow;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <h1 className="text-screen-title text-text-primary">Creator analytics</h1>

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
          <CreatorAnalyticsHero
            summary={summary}
            stalePeriod={stalePeriod}
            heroThumbnail={heroThumbnail}
          />

          <CreatorAnalyticsMetrics
            summary={summary}
            partialError={partialError}
          />

          <CreatorAnalyticsTimeline
            timeline={timeline}
            summary={summary}
            isError={timelineQuery.isError}
          />

          <CreatorAnalyticsTopContent
            ranking={ranking}
          />

          <CreatorAnalyticsEarnings
            earnings={earnings}
            onPayout={onPayout}
            isPayoutPending={payout.isPending}
            isPayoutError={payout.isError}
            payoutError={payout.error}
            isOffline={isOffline}
          />

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
