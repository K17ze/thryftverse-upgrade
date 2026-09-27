'use client';

/**
 * MasonryGrid — web port of PinterestMasonryGrid.
 * Balanced-column distribution (FlashList v2 masonry equivalent): each
 * item is appended to the currently-shortest column using server-truth
 * aspect ratios, so the grid has honest editorial rhythm and no reflow.
 * Honors unit.span — full-width authored breaks split the feed into bands.
 */

import { useMemo, useSyncExternalStore } from 'react';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';
import { resolveListingMediaAspectRatio, DEFAULT_LISTING_MEDIA_ASPECT_RATIO } from '@/lib/utils/media';
import { ProductTile } from '@/components/cards/ProductTile';
import { LookTile, PosterTile, MoodboardTile, EditorialTile, RecommendationBreak } from './FeedUnits';
import { MasonrySkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StateGate } from '@/components/flagship/StateGate';

interface MasonryGridProps {
  units: DiscoveryFeedUnit[];
  columns: number;
  isLoading?: boolean;
  /** Fetch failure — renders an error state with retry, distinct from
   *  the empty state (an error is not "nothing here"). */
  isError?: boolean;
  onRetry?: () => void;
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
      return <LookTile unit={unit} priority={priority} />;
    case 'poster':
      return <PosterTile unit={unit} priority={priority} />;
    case 'moodboard':
      return <MoodboardTile unit={unit} priority={priority} />;
    case 'editorial':
      return <EditorialTile unit={unit} priority={priority} />;
    case 'recommendation_break':
      return <RecommendationBreak unit={unit} />;
  }
}

/** Balanced shortest-column distribution for a run of single-cell units. */
function distributeColumns(units: DiscoveryFeedUnit[], columns: number) {
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
}

/**
 * Band segmentation — port of the mobile FEATURED_RHYTHM: a unit whose
 * span is wider than one column (but narrower than the grid) leaves the
 * column flow and owns a featured row, with the remaining cells filled
 * by its neighbours. Companions come from ahead when the run continues
 * (featured leads left) or from the run's tail when the unit ends a
 * chunk (featured trails right) — either way rendered order stays
 * monotonic with the feed. A featured unit that can't fill its row
 * renders as a normal tile rather than stranding a gap.
 */
type BandSegment =
  | { kind: 'cols'; units: DiscoveryFeedUnit[] }
  | {
      kind: 'feature';
      lead: DiscoveryFeedUnit;
      span: number;
      companions: DiscoveryFeedUnit[];
      /** 'lead' — featured first, companions after. 'trail' — reverse. */
      placement: 'lead' | 'trail';
    };

function segmentBand(units: DiscoveryFeedUnit[], columns: number): BandSegment[] {
  const segments: BandSegment[] = [];
  let buffer: DiscoveryFeedUnit[] = [];
  const flush = () => {
    if (buffer.length > 0) {
      segments.push({ kind: 'cols', units: buffer });
      buffer = [];
    }
  };
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const span = Math.max(1, Math.min(unit.span ?? 1, columns));
    if (span > 1) {
      const need = columns - span;
      const ahead = units.slice(i + 1, i + 1 + need);
      if (ahead.length === need) {
        flush();
        segments.push({ kind: 'feature', lead: unit, span, companions: ahead, placement: 'lead' });
        i += need;
        continue;
      }
      if (buffer.length >= need) {
        const companions = buffer.splice(buffer.length - need, need);
        flush();
        segments.push({ kind: 'feature', lead: unit, span, companions, placement: 'trail' });
        continue;
      }
    }
    buffer.push(unit);
  }
  flush();
  return segments;
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
  const segments = useMemo(() => segmentBand(units, columns), [units, columns]);

  if (units.length === 0) return null;

  const gridTemplate = `repeat(${columns}, minmax(0,1fr))`;
  // Priority = the first band's top row — every column head preloads
  // (same contract the column layout had before segmentation).
  const prioritize = firstPriority === true;

  return (
    // Segments keep the tile gutter between them — a featured row reads
    // as part of the grid it interrupts, not a separate section.
    // Tile gaps track the density preference (var(--density-row-gap):
    // 0/8/16 compact/regular/editorial) with a 4px seam floor so compact
    // never welds media together.
    <div className="flex flex-col gap-[max(4px,var(--density-row-gap))]">
      {segments.map((seg, si) => {
        if (seg.kind === 'feature') {
          const lead = (
            <div key={seg.lead.id} style={{ gridColumn: `span ${seg.span}` }}>
              <RenderUnit unit={seg.lead} priority={prioritize && si === 0} />
            </div>
          );
          const rest = seg.companions.map((unit) => (
            <RenderUnit key={unit.id} unit={unit} priority={prioritize && si === 0} />
          ));
          return (
            <div
              key={`feature-${seg.lead.id}`}
              className="grid items-start gap-[max(4px,var(--density-row-gap))] px-1.5 sm:px-2"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {seg.placement === 'lead' ? [lead, ...rest] : [...rest, lead]}
            </div>
          );
        }
        const cols = distributeColumns(seg.units, columns);
        return (
          <div
            key={`cols-${si}`}
            className="grid items-start gap-[max(4px,var(--density-row-gap))] px-1.5 sm:px-2"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {cols.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[max(4px,var(--density-row-gap))]">
                {col.map((unit, i) => (
                  <RenderUnit
                    key={unit.id}
                    unit={unit}
                    priority={prioritize && si === 0 && i === 0}
                  />
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

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
}: MasonryGridProps) {
  // Segment the feed into bands split by full-width units (span ≥ columns,
  // or types that are intrinsically full-bleed — a recommendation strip
  // cannot live inside a single masonry column).
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
    // Registry copy — offline resolves to the listings offline line
    // instead of a generic failure.
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
    // Band rhythm follows the density section gap (halved — bands are
    // sub-sections of one feed, not separate sections).
    <div className="flex flex-col gap-[calc(var(--density-section-gap)/2)]">
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

/**
 * Responsive column count — 2 mobile → 6 wide desktop.
 *
 * useSyncExternalStore (same mechanism as useResultColumns) corrects the
 * server guess synchronously during the hydration commit, so the first
 * paint lands on the right column count — no post-mount resize reflow.
 */
function columnsForWidth(width: number): number {
  if (width < 480) return 2;
  if (width < 768) return 3;
  if (width < 1200) return 4;
  if (width < 1600) return 5;
  return 6;
}

const subscribeToResize = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};

export function useMasonryColumns(): number {
  return useSyncExternalStore(
    subscribeToResize,
    () => columnsForWidth(window.innerWidth),
    () => 4, // server snapshot — SSR markup, corrected before first paint
  );
}
