'use client';

import { LineChart } from '@/components/charts/LineChart';
import { formatCount } from '@/lib/utils/format';
import type {
  AnalyticsSummary,
  AnalyticsTimeline,
  AnalyticsTimelinePoint,
} from '@/lib/api/services/creatorAnalytics';
import {
  formatDateRange,
  formatRate,
  SectionLabel,
  shortDate,
} from './CreatorAnalyticsPrimitives';

interface CreatorAnalyticsTimelineProps {
  timeline: AnalyticsTimeline | undefined;
  summary: AnalyticsSummary;
  isError: boolean;
}

export function CreatorAnalyticsTimeline({
  timeline,
  summary,
  isError,
}: CreatorAnalyticsTimelineProps) {
  return (
    <section className="mt-8" aria-label="Views over time">
      <SectionLabel>Views over time</SectionLabel>
      <div className="mt-4">
        {isError ? (
          <p className="text-body text-text-muted">Chart unavailable</p>
        ) : (
          <LineChart
            points={(timeline?.points ?? []).map((p: AnalyticsTimelinePoint) => ({
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
  );
}
