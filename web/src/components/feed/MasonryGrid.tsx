'use client';

/**
 * MasonryGrid — web port of PinterestMasonryGrid.
 * Balanced-column distribution (FlashList v2 masonry equivalent): each
 * item is appended to the currently-shortest column using server-truth
 * aspect ratios, so the grid has honest editorial rhythm and no reflow.
 * Honors unit.span — full-width authored breaks split the feed into bands.
 */

import { useEffect, useMemo, useState } from 'react';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';
import { resolveListingMediaAspectRatio, DEFAULT_LISTING_MEDIA_ASPECT_RATIO } from '@/lib/utils/media';
import { ProductTile } from '@/components/cards/ProductTile';
import { LookTile, PosterTile, MoodboardTile, EditorialTile, RecommendationBreak } from './FeedUnits';
import { MasonrySkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface MasonryGridProps {
  units: DiscoveryFeedUnit[];
  columns: number;
  isLoading?: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
  /** Recovery action on the empty state (e.g. "Find members to follow"). */
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

function unitRatio(unit: DiscoveryFeedUnit): number {
  switch (unit.type) {
    case 'listing':
      return resolveListingMediaAspectRatio(unit.listing) ?? DEFAULT_LISTING_MEDIA_ASPECT_RATIO;
    case 'look':
      return unit.coverAspectRatio ?? 0.75;
    case 'poster':
      return unit.aspectRatio ?? 0.75;
    case 'moodboard':
      return unit.aspectRatio ?? 0.8;
    case 'editorial':
      return unit.aspectRatio ?? 1.5;
    case 'recommendation_break':
      return 0.4;
  }
}

function RenderUnit({ unit, priority }: { unit: DiscoveryFeedUnit; priority?: boolean }) {
  switch (unit.type) {
    case 'listing':
      return <ProductTile item={unit.listing} priority={priority} />;
    case 'look':
      return <LookTile unit={unit} />;
    case 'poster':
      return <PosterTile unit={unit} />;
    case 'moodboard':
      return <MoodboardTile unit={unit} />;
    case 'editorial':
      return <EditorialTile unit={unit} />;
    case 'recommendation_break':
      return <RecommendationBreak unit={unit} />;
  }
}

/** One band of single-column units, balanced shortest-column-first. */
function Band({
  units,
  columns,
  firstPriority,
}: {
  units: DiscoveryFeedUnit[];
  columns: number;
  firstPriority?: boolean;
}) {
  const colItems = useMemo(() => {
    const colHeights = new Array(columns).fill(0);
    const cols: DiscoveryFeedUnit[][] = Array.from({ length: columns }, () => []);
    for (const unit of units) {
      const ratio = unitRatio(unit);
      let target = 0;
      for (let c = 1; c < columns; c++) {
        if (colHeights[c] < colHeights[target]) target = c;
      }
      cols[target].push(unit);
      // Height estimate: media (1/ratio) + info block allowance.
      colHeights[target] += 1 / ratio + 0.28;
    }
    return cols;
  }, [units, columns]);

  if (units.length === 0) return null;

  return (
    <div
      className="grid items-start gap-1.5 px-1.5 sm:gap-2 sm:px-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
    >
      {colItems.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-1.5 sm:gap-2">
          {col.map((unit, i) => (
            <RenderUnit key={unit.id} unit={unit} priority={firstPriority && i === 0} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function MasonryGrid({
  units,
  columns,
  isLoading,
  emptyTitle = 'Nothing here yet',
  emptySubtitle = 'Check back soon for new finds.',
  emptyActionLabel,
  onEmptyAction,
}: MasonryGridProps) {
  // Segment the feed into bands split by full-width units (span ≥ columns).
  const bands = useMemo(() => {
    const result: { regular: DiscoveryFeedUnit[]; full: DiscoveryFeedUnit | null }[] = [];
    let current: DiscoveryFeedUnit[] = [];
    for (const unit of units) {
      const span = Math.max(1, Math.min(unit.span ?? 1, columns));
      if (span >= columns) {
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
    <div className="flex flex-col gap-3">
      {bands.map((band, bi) => (
        <div key={bi} className="contents">
          <Band units={band.regular} columns={columns} firstPriority={bi === 0} />
          {band.full ? (
            <div className="px-1.5 sm:px-2">
              <RenderUnit unit={band.full} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Responsive column count — 2 mobile → 6 wide desktop. */
export function useMasonryColumns(): number {
  const [columns, setColumns] = useState(5);
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w < 480) return 2;
      if (w < 768) return 3;
      if (w < 1200) return 4;
      if (w < 1600) return 5;
      return 6;
    };
    const update = () => setColumns(compute());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return columns;
}
