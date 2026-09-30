'use client';

import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { formatCount } from '@/lib/utils/format';
import type { AnalyticsSummary } from '@/lib/api/services/creatorAnalytics';
import {
  completenessLabel,
  completenessTone,
  formatDateRange,
  HeroDelta,
  SUPPRESSED_DIMENSION_LABELS,
  SUPPRESSED_REASON_LABELS,
} from './CreatorAnalyticsPrimitives';

interface CreatorAnalyticsHeroProps {
  summary: AnalyticsSummary;
  stalePeriod: boolean;
  heroThumbnail: string | null;
}

export function CreatorAnalyticsHero({
  summary,
  stalePeriod,
  heroThumbnail,
}: CreatorAnalyticsHeroProps) {
  return (
    <>
      {/* 1. Data freshness — completeness dot + watermark, always visible */}
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

      {/* Period switch in flight */}
      {stalePeriod ? (
        <div className="mt-4 rounded-lg bg-surface-alt px-3 py-2">
          <p className="text-meta text-text-muted">
            Showing previous period · updating…
          </p>
        </div>
      ) : null}

      {/* 2. Views hero — media-anchored when top content carries a real thumbnail, flat otherwise */}
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

      {/* 3. Comparison context — one line, not per-metric badges */}
      <p className="mt-2 text-meta text-text-muted">
        {formatDateRange(summary.range)} vs {formatDateRange(summary.comparisonRange)}
      </p>

      {/* 4. Suppressed dimensions */}
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
    </>
  );
}
