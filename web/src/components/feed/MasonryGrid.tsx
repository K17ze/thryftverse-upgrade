'use client';

/**
 * MasonryGrid — web port of PinterestMasonryGrid.
 * Balanced-column distribution: each item is appended to the currently-shortest
 * column using server-truth aspect ratios, so the grid has honest editorial rhythm
 * and no reflow. Honors unit.span — full-width breaks split the feed into bands.
 * Factored into domain subcomponents:
 * - MasonryTypes: aspect ratios, row quantisation, gap reading, band segments
 * - useMasonryColumns: responsive column derivation with hydration safety
 * - MasonryBand: band rendering, single ResizeObserver per band, content-visibility
 */

import { useMemo } from 'react';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';
import { MasonrySkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StateGate } from '@/components/flagship/StateGate';
import { Band, RenderUnit } from './masonry/MasonryBand';
import type { MasonryGridProps } from './masonry/MasonryTypes';

export { useMasonryColumns, columnsForWidth } from './masonry/useMasonryColumns';
export type { MasonryGridProps } from './masonry/MasonryTypes';

export function MasonryGrid({
  units,
  columns,
  isLoading,
  isError,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptySubtitle = 'Check back soon for new finds.',
  emptyActionLabel,
  onEmptyAction,
  prioritizeFirst,
}: MasonryGridProps) {
  // Segment the feed into bands split by full-width units
  const bands = useMemo(() => {
    const result: { regular: DiscoveryFeedUnit[]; full: DiscoveryFeedUnit | null }[] = [];
    let current: DiscoveryFeedUnit[] = [];
    for (const unit of units) {
      const span = Math.max(1, Math.min(unit.span ?? 1, columns));
      if (span >= columns || unit.type === 'recommendation_break') {
        result.push({ regular: current, full: unit });
        current = [];
      } else {
        current.push(unit);
      }
    }
    result.push({ regular: current, full: null });
    return result;
  }, [units, columns]);

  if (isLoading) {
    return <MasonrySkeleton columns={columns} />;
  }

  if (isError) {
    return (
      <StateGate domain="listings" isLoading={false} isError onRetry={onRetry} compact>
        {null}
      </StateGate>
    );
  }

  if (units.length === 0) {
    return (
      <EmptyState
        icon="search"
        title={emptyTitle}
        subtitle={emptySubtitle}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
        compact
      />
    );
  }

  return (
    <div className="flex flex-col gap-[calc(var(--density-section-gap)/2)]">
      {bands.map((band, bi) => (
        <div key={bi} className="contents">
          <Band
            units={band.regular}
            columns={columns}
            firstPriority={prioritizeFirst === true && bi === 0}
          />
          {band.full ? (
            <div
              className="px-1.5 sm:px-2 lg:px-4"
              style={{
                contentVisibility: 'auto',
                containIntrinsicSize: 'auto 480px',
              }}
            >
              <RenderUnit unit={band.full} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
