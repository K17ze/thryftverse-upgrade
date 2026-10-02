'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';
import { ProductTile } from '@/components/cards/ProductTile';
import {
  LookTile,
  PosterTile,
  MoodboardTile,
  EditorialTile,
  RecommendationBreak,
} from '../FeedUnits';
import {
  heightIsDeterministic,
  readRowGapPx,
  unitRatio,
  MASONRY_ROW_PX,
  TILE_INFO_ESTIMATE_PX,
  type BandSegment,
} from './MasonryTypes';

export const RenderUnit = memo(function RenderUnit({
  unit,
  priority,
}: {
  unit: DiscoveryFeedUnit;
  priority?: boolean;
}) {
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
});

export function useContainerWidth(): [RefObject<HTMLDivElement | null>, number, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [rowGapPx, setRowGapPx] = useState(8);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      setWidth(entry.contentRect.width);
      setRowGapPx(readRowGapPx(el));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width, rowGapPx];
}

export const MasonryCell = memo(function MasonryCell({
  unit,
  span,
  intrinsicHeight,
  priority,
  registerMeasureTarget,
}: {
  unit: DiscoveryFeedUnit;
  span: number;
  intrinsicHeight: number;
  priority?: boolean;
  registerMeasureTarget: ((id: string, el: HTMLElement | null) => void) | null;
}) {
  const measureRef = useCallback(
    (el: HTMLDivElement | null) => registerMeasureTarget?.(unit.id, el),
    [unit.id, registerMeasureTarget],
  );
  return (
    <div
      style={{
        gridRow: `span ${span}`,
        paddingBottom: 'max(4px, var(--density-row-gap))',
        minWidth: 0,
      }}
    >
      <div
        ref={registerMeasureTarget != null ? measureRef : undefined}
        style={{
          contentVisibility: 'auto',
          containIntrinsicSize: `auto ${Math.round(intrinsicHeight)}px`,
        }}
      >
        <RenderUnit unit={unit} priority={priority} />
      </div>
    </div>
  );
});

export function segmentBand(units: DiscoveryFeedUnit[], columns: number): BandSegment[] {
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

export function Band({
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

  const cellIdsRef = useRef(new Map<HTMLElement, string>());
  const cellElsRef = useRef(new Map<string, HTMLElement>());
  const cellObserverRef = useRef<ResizeObserver | null>(null);
  useEffect(
    () => () => {
      cellObserverRef.current?.disconnect();
      cellObserverRef.current = null;
    },
    [],
  );
  const registerMeasuredCell = useCallback(
    (id: string, el: HTMLElement | null) => {
      const prev = cellElsRef.current.get(id);
      if (prev === el) return;
      if (prev) {
        cellIdsRef.current.delete(prev);
        cellObserverRef.current?.unobserve(prev);
        cellElsRef.current.delete(id);
      }
      if (el == null) return;
      if (cellObserverRef.current == null) {
        cellObserverRef.current = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const unitId = cellIdsRef.current.get(entry.target as HTMLElement);
            if (unitId != null) onMeasure(unitId, entry.contentRect.height);
          }
        });
      }
      cellElsRef.current.set(id, el);
      cellIdsRef.current.set(el, id);
      cellObserverRef.current.observe(el);
    },
    [onMeasure],
  );

  if (units.length === 0) return null;

  const effectiveWidth = bandWidth > 0 ? bandWidth : 1280;
  const colWidth = (effectiveWidth - (columns - 1) * rowGapPx) / columns;
  const estimateFor = (unit: DiscoveryFeedUnit) =>
    colWidth / unitRatio(unit) +
    (heightIsDeterministic(unit) ? 0 : TILE_INFO_ESTIMATE_PX);
  const heightFor = (unit: DiscoveryFeedUnit) =>
    heightsRef.current.get(unit.id) ?? estimateFor(unit);
  const spanFor = (unit: DiscoveryFeedUnit) =>
    Math.max(1, Math.ceil((heightFor(unit) + rowGapPx) / MASONRY_ROW_PX));

  const gridTemplate = `repeat(${columns}, minmax(0,1fr))`;
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
    <div
      ref={bandRef}
      className="flex flex-col gap-[max(4px,var(--density-row-gap))]"
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: `auto ${Math.max(1, Math.ceil(units.length / columns)) * 340}px`,
      }}
    >
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
            {seg.units.map((unit) => (
              <MasonryCell
                key={unit.id}
                unit={unit}
                span={spanFor(unit)}
                intrinsicHeight={heightFor(unit)}
                priority={isPriority(unit)}
                registerMeasureTarget={
                  heightIsDeterministic(unit) ? null : registerMeasuredCell
                }
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
