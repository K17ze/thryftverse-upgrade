'use client';

import { Icon } from '@/components/ui/Icon';
import { formatCount } from '@/lib/utils/format';
import type { AnalyticsSummary } from '@/lib/api/services/creatorAnalytics';
import { formatRate, MetricLine } from './CreatorAnalyticsPrimitives';

interface CreatorAnalyticsMetricsProps {
  summary: AnalyticsSummary;
  partialError: boolean;
}

export function CreatorAnalyticsMetrics({
  summary,
  partialError,
}: CreatorAnalyticsMetricsProps) {
  return (
    <>
      {/* Secondary metrics — flat lines, no cards */}
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

      {/* Partial failure notice */}
      {partialError ? (
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-surface-alt px-3 py-2">
          <Icon name="alert" size={14} className="shrink-0 text-warning-text" />
          <p className="text-meta text-text-secondary">
            Some details could not be loaded.
          </p>
        </div>
      ) : null}
    </>
  );
}
