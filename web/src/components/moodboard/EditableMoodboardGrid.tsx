'use client';

/**
 * EditableMoodboardGrid — the board page's edit surface.
 *
 * Same balanced-column masonry grammar as MasonryGrid (shortest column by
 * server-truth aspect ratio), but every tile is editable: HTML5 drag to
 * reorder (a drop takes the target's slot in the linear order), accessible
 * move-earlier / move-later and remove controls per tile, and a select
 * mode where tapping tiles builds a multi-selection. The parent owns the
 * order — this component only emits intents.
 */

import { useMemo, useState, type DragEvent } from 'react';
import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import {
  getCategoryFocalPoint,
  getListingCoverUri,
  getPrimaryMedia,
  resolveListingMediaAspectRatio,
  DEFAULT_LISTING_MEDIA_ASPECT_RATIO,
} from '@/lib/utils/media';

interface EditableMoodboardGridProps {
  /** Ordered board items — position in this list is the board order. */
  items: DiscoveryListingSummary[];
  columns: number;
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  /** Drop semantics — `draggedId` takes `targetId`'s slot in the order. */
  onReorder: (draggedId: string, targetId: string) => void;
}

interface EditableTileProps {
  item: DiscoveryListingSummary;
  isFirst: boolean;
  isLast: boolean;
  selectMode: boolean;
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

function EditableTile({
  item,
  isFirst,
  isLast,
  selectMode,
  selected,
  dragging,
  dropTarget,
  onToggleSelect,
  onRemove,
  onMove,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: EditableTileProps) {
  const cover = getListingCoverUri(item.images);
  const primaryMedia = getPrimaryMedia(item);
  const ratio =
    resolveListingMediaAspectRatio(item) ?? DEFAULT_LISTING_MEDIA_ASPECT_RATIO;

  return (
    <article
      className={`group relative ${dragging ? 'opacity-40' : ''}`}
      draggable={!selectMode}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div
        className={[
          'relative overflow-hidden rounded-lg bg-surface-alt transition-shadow',
          selected || dropTarget ? 'ring-2 ring-brand' : '',
        ].join(' ')}
      >
        <AppImage
          src={cover}
          alt={item.title}
          aspectRatio={ratio}
          focalPoint={primaryMedia?.focalPoint ?? getCategoryFocalPoint(item.category)}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
        />

        {item.isSold ? (
          <>
            <div className="absolute inset-0 bg-overlay" />
            <span className="absolute inset-0 flex items-center justify-center text-body font-medium uppercase tracking-[1.2px] text-scrim-text-primary">
              Sold
            </span>
          </>
        ) : null}

        {selectMode ? (
          <>
            {/* Whole tile is the select toggle — stretched-button grammar. */}
            <button
              type="button"
              onClick={onToggleSelect}
              aria-pressed={selected}
              aria-label={`${selected ? 'Deselect' : 'Select'} ${item.title}`}
              className="absolute inset-0 z-10 rounded-lg"
            />
            <span
              aria-hidden
              className={[
                'pointer-events-none absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border',
                selected
                  ? 'border-transparent bg-brand text-text-inverse'
                  : 'border-scrim-text-primary/70 bg-overlay text-transparent',
              ].join(' ')}
            >
              <Icon name="check" size={15} />
            </span>
          </>
        ) : (
          <>
            {/* Remove — per-tile destructive affordance, glyph-scrim grammar
                matching the read surface's save/heart actions. */}
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${item.title} from board`}
              className="pressable absolute right-0 top-0 z-10 flex h-11 w-11 items-center justify-center"
            >
              <Icon name="trash" size={17} className="text-scrim-text-primary drop-scrim" />
            </button>
            {/* Accessible reorder — the keyboard/touch path for the same
                moves drag handles on pointer. Earlier = chevron-back. */}
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={isFirst}
                aria-label={`Move ${item.title} earlier`}
                className="pressable flex h-11 w-11 items-center justify-center disabled:pointer-events-none disabled:opacity-30"
              >
                <Icon name="back" size={18} className="text-scrim-text-primary drop-scrim" />
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={isLast}
                aria-label={`Move ${item.title} later`}
                className="pressable flex h-11 w-11 items-center justify-center disabled:pointer-events-none disabled:opacity-30"
              >
                <Icon name="forward" size={18} className="text-scrim-text-primary drop-scrim" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Edit metadata — quieter than the commerce tile: brand, title, price. */}
      <div className="flex flex-col gap-0.5 px-1 pt-2">
        {item.brand ? (
          <span className="clamp-1 text-meta font-semibold uppercase tracking-wide text-text-secondary">
            {item.brand}
          </span>
        ) : null}
        <h3 className="clamp-2 text-body text-text-primary">{item.title}</h3>
        {item.price != null ? (
          <span className="tnum text-body font-bold text-text-primary">
            {formatPrice(item.price)}
          </span>
        ) : null}
      </div>
    </article>
  );
}

export function EditableMoodboardGrid({
  items,
  columns,
  selectMode,
  selectedIds,
  onToggleSelect,
  onRemove,
  onMove,
  onReorder,
}: EditableMoodboardGridProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const positions = useMemo(
    () => new Map(items.map((it, i) => [it.id, i] as const)),
    [items],
  );

  // Balanced shortest-column distribution — identical rhythm to MasonryGrid
  // so the board doesn't re-flow when toggling edit mode.
  const cols = useMemo(() => {
    const heights = new Array<number>(columns).fill(0);
    const out: DiscoveryListingSummary[][] = Array.from({ length: columns }, () => []);
    for (const item of items) {
      const ratio =
        resolveListingMediaAspectRatio(item) ?? DEFAULT_LISTING_MEDIA_ASPECT_RATIO;
      let target = 0;
      for (let c = 1; c < columns; c++) {
        if (heights[c] < heights[target]) target = c;
      }
      out[target].push(item);
      heights[target] += 1 / ratio + 0.28;
    }
    return out;
  }, [items, columns]);

  const endDrag = () => {
    setDragId(null);
    setDropTargetId(null);
  };

  if (items.length === 0) return null;

  return (
    <div
      className="grid items-start gap-1.5 px-1.5 sm:gap-2 sm:px-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
    >
      {cols.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-1.5 sm:gap-2">
          {col.map((item) => {
            const index = positions.get(item.id) ?? 0;
            return (
              <EditableTile
                key={item.id}
                item={item}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                selectMode={selectMode}
                selected={selectedIds.has(item.id)}
                dragging={dragId === item.id}
                dropTarget={dropTargetId === item.id}
                onToggleSelect={() => onToggleSelect(item.id)}
                onRemove={() => onRemove(item.id)}
                onMove={(dir) => onMove(item.id, dir)}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', item.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDragId(item.id);
                }}
                onDragOver={(e) => {
                  if (!dragId || dragId === item.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dropTargetId !== item.id) setDropTargetId(item.id);
                }}
                onDragLeave={() => {
                  if (dropTargetId === item.id) setDropTargetId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== item.id) onReorder(dragId, item.id);
                  endDrag();
                }}
                onDragEnd={endDrag}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
