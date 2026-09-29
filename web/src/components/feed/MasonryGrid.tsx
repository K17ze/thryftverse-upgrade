'use client';

/**
 * MasonryGrid — web port of PinterestMasonryGrid.
 * Balanced-column distribution (FlashList v2 masonry equivalent): each
 * item is appended to the currently-shortest column using server-truth
 * aspect ratios, so the grid has honest editorial rhythm and no reflow.
 * Honors unit.span — full-width authored breaks split the feed into bands.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';
import { resolveListingMediaAspectRatio, DEFAULT_LISTING_MEDIA_ASPECT_RATIO } from '@/lib/utils/media';
import { ProductTile } from '@/components/cards/ProductTile';
import { LookTile, PosterTile, MoodboardTile, EditorialTile, RecommendationBreak, DEFAULT_EDITORIAL_ASPECT_RATIO } from './FeedUnits';
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
  /** Priority budget — grants `priority` to exactly ONE image: the first
   *  cell of the first band. Off by default; a page opts in once (the
   *  LCP candidate), never per chunk/column/feature row. */
  prioritizeFirst?: boolean;
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
      return unit.aspectRatio ?? DEFAULT_EDITORIAL_ASPECT_RATIO;
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

/**
 * Dense-flow row quantisation — the masonry renders as ONE grid in feed
 * (source) order, each tile spanning enough 1px rows to fit its measured
 * height plus the gutter, and the browser packs tiles into the shortest
 * free slot. That keeps DOM order == feed order: keyboard tab order,
 * screen-reader sequence and find-in-page all follow the feed instead of
 * running down whole columns (the old column-per-flex-container layout
 * made tab order column-major). Heights are measured per tile by
 * ResizeObserver — estimates only seed the first frame — so wrapped
 * titles, badges and density changes can never drift the layout.
 */
const MASONRY_ROW_PX = 1;
/** First-frame estimate for the tile info block (price + title + seller). */
const TILE_INFO_ESTIMATE_PX = 64;

/**
 * The gutter between tiles, in px for span math. Must stay in sync with
 * the CSS `max(4px, var(--density-row-gap))` used for padding below — the
 * parsed value is read live off the element so the two never disagree.
 */
function readRowGapPx(el: HTMLElement): number {
  const raw = getComputedStyle(el).getPropertyValue('--density-row-gap').trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? Math.max(4, parsed) : 8;
}

/** ResizeObserver width of the band's grid — span estimates convert
 *  aspect ratios into pixels against the real column width, and the
 *  value doubles as the resize signal that re-derives spans. */
function useContainerWidth(): [RefObject<HTMLDivElement | null>, number, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [rowGapPx, setRowGapPx] = useState(8);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      setWidth(el.getBoundingClientRect().width);
      setRowGapPx(readRowGapPx(el));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width, rowGapPx];
}

/** One masonry cell — grid item carrying the row span; the inner box is
 *  the measured tile. `content-visibility: auto` lets the browser skip
 *  layout/paint for tiles far offscreen (bounds long-feed cost) while
 *  keeping the node in the accessibility tree and find-in-page; the
 *  intrinsic size hint is the last measured height so a skipped tile
 *  measures identically to a rendered one — no correction loop. */
function MasonryCell({
  unit,
  span,
  measuredHeight,
  onMeasure,
  children,
}: {
  unit: DiscoveryFeedUnit;
  span: number;
  measuredHeight: number | undefined;
  onMeasure: (id: string, height: number) => void;
  children: ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const report = () => onMeasure(unit.id, el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [unit.id, onMeasure]);
  return (
    <div
      style={{
        gridRow: `span ${span}`,
        paddingBottom: 'max(4px, var(--density-row-gap))',
        minWidth: 0,
      }}
    >
      <div
        ref={innerRef}
        style={
          measuredHeight != null
            ? {
                contentVisibility: 'auto',
                containIntrinsicSize: `auto ${Math.round(measuredHeight)}px`,
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
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

/** One band of single-column units — dense-packed in source order. */
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
  const [bandRef, bandWidth, rowGapPx] = useContainerWidth();
  // Measured tile heights by unit id — estimates seed the first frame,
  // ResizeObserver reports converge the spans to real heights in one rAF.
  const heightsRef = useRef(new Map<string, number>());
  const [, bumpHeights] = useReducer((c: number) => c + 1, 0);
  const flushRef = useRef(0);
  const onMeasure = useCallback((id: string, height: number) => {
    if (height <= 0) return;
    const prev = heightsRef.current.get(id);
    if (prev != null && Math.abs(prev - height) < 0.5) return;
    heightsRef.current.set(id, height);
    cancelAnimationFrame(flushRef.current);
    flushRef.current = requestAnimationFrame(bumpHeights);
  }, []);

  if (units.length === 0) return null;

  // Estimate until the observer reports: media height from the aspect
  // ratio at the real column width, plus the info-block allowance and
  // the gutter. 1280 is a width-agnostic fallback so the SSR pass and
  // the first client frame compute identical spans (no hydration skew).
  const effectiveWidth = bandWidth > 0 ? bandWidth : 1280;
  const colWidth = (effectiveWidth - (columns - 1) * rowGapPx) / columns;
  const spanFor = (unit: DiscoveryFeedUnit) => {
    const height =
      heightsRef.current.get(unit.id) ??
      colWidth / unitRatio(unit) + TILE_INFO_ESTIMATE_PX;
    return Math.max(1, Math.ceil((height + rowGapPx) / MASONRY_ROW_PX));
  };

  const gridTemplate = `repeat(${columns}, minmax(0,1fr))`;
  // Priority budget: ONE image per grid — the first rendered cell of the
  // first segment. For a feature segment that's the lead when it leads,
  // otherwise the first companion (which renders before it).
  let firstUnitId: string | null = null;
  if (firstPriority === true) {
    const first = segments[0];
    if (first) {
      firstUnitId =
        first.kind === 'feature'
          ? (first.placement === 'lead' ? first.lead : first.companions[0])?.id ?? null
          : first.units[0]?.id ?? null;
    }
  }
  const isPriority = (unit: DiscoveryFeedUnit) => unit.id === firstUnitId;

  return (
    // Segments keep the tile gutter between them — a featured row reads
    // as part of the grid it interrupts, not a separate section.
    // Tile gaps track the density preference (var(--density-row-gap):
    // 0/8/16 compact/regular/editorial) with a 4px seam floor so compact
    // never welds media together.
    <div ref={bandRef} className="flex flex-col gap-[max(4px,var(--density-row-gap))]">
      {segments.map((seg, si) => {
        if (seg.kind === 'feature') {
          const lead = (
            <div key={seg.lead.id} style={{ gridColumn: `span ${seg.span}` }}>
              <RenderUnit unit={seg.lead} priority={isPriority(seg.lead)} />
            </div>
          );
          const rest = seg.companions.map((unit) => (
            <RenderUnit key={unit.id} unit={unit} priority={isPriority(unit)} />
          ));
          return (
            <div
              key={`feature-${seg.lead.id}`}
              className="grid items-start gap-[max(4px,var(--density-row-gap))] px-1.5 sm:px-2 lg:px-4"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {seg.placement === 'lead' ? [lead, ...rest] : [...rest, lead]}
            </div>
          );
        }
        return (
          // One grid in FEED ORDER — children span 1px rows equal to their
          // measured height + gutter and dense-flow packs each tile into
          // the shortest free slot. DOM order stays monotonic with the
          // feed, so tab order and screen-reader sequence are correct;
          // only the visual placement is masonry-balanced. The gutter
          // rides as per-cell padding-bottom (row-gap: 0) so a spanned
          // tile's allocation is exactly height + one gutter.
          <div
            key={`cols-${si}`}
            className="px-1.5 sm:px-2 lg:px-4"
            style={{
              display: 'grid',
              gridTemplateColumns: gridTemplate,
              gridAutoRows: `${MASONRY_ROW_PX}px`,
              gridAutoFlow: 'dense',
              columnGap: 'max(4px, var(--density-row-gap))',
              rowGap: 0,
            }}
          >
            {seg.units.map((unit) => {
              const measuredHeight = heightsRef.current.get(unit.id);
              return (
                <MasonryCell
                  key={unit.id}
                  unit={unit}
                  span={spanFor(unit)}
                  measuredHeight={measuredHeight}
                  onMeasure={onMeasure}
                >
                  <RenderUnit unit={unit} priority={isPriority(unit)} />
                </MasonryCell>
              );
            })}
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
  prioritizeFirst,
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
          <Band
            units={band.regular}
            columns={columns}
            firstPriority={prioritizeFirst === true && bi === 0}
          />
          {band.full ? (
            <div className="px-1.5 sm:px-2 lg:px-4">
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
