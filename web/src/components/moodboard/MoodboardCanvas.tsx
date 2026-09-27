'use client';

/**
 * MoodboardCanvas — the freeform collage surface, port of the mobile
 * MoodboardEditorScreen canvas semantics to pointer-based web editing.
 *
 * Items render on a themed canvas at normalized {x, y, scale, rotation}
 * positions; array order is the layer stack (back → front), matching the
 * mobile contract. Read mode renders a pressable collage that deep-links
 * to listings; edit mode adds pointer-drag placement plus a selected-item
 * toolbar (layer order, rotate, scale, remove, comment anchor).
 *
 * Positions resolve authored fixture layout → persisted overlay →
 * deterministic scatter, so every board always renders a stable canvas.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import {
  canvasPositionFor,
  type MoodboardItemPosition,
  type MoodboardCanvasTheme,
} from '@/lib/data/fixtures-content';
import type { Listing } from '@/lib/contracts/domain';

/** Base item footprint — fraction of canvas width at scale 1. */
const BASE_W = 0.24;

interface CanvasItem {
  listing: Listing;
  position: MoodboardItemPosition;
}

export interface MoodboardCanvasProps {
  boardId: string;
  /** Effective ordered listing ids (back → front layer order). */
  itemIds: string[];
  items: Listing[];
  theme: MoodboardCanvasTheme;
  /** Overlay position overrides keyed by listing id. */
  positions?: Record<string, MoodboardItemPosition>;
  editing: boolean;
  selectedId?: string | null;
  onSelect?: (itemId: string | null) => void;
  onPosition?: (itemId: string, position: MoodboardItemPosition) => void;
  onLayer?: (itemId: string, layer: 'front' | 'back') => void;
  onRemove?: (itemId: string) => void;
  onComment?: (itemId: string) => void;
}

export function resolveCanvasItems(
  boardId: string,
  itemIds: string[],
  items: Listing[],
  positions: Record<string, MoodboardItemPosition> | undefined,
): CanvasItem[] {
  const byId = new Map(items.map((l) => [l.id, l]));
  return itemIds
    .map((id, index) => {
      const listing = byId.get(id);
      if (!listing) return null;
      return {
        listing,
        position: positions?.[id] ?? canvasPositionFor(boardId, id, index),
      };
    })
    .filter((x): x is CanvasItem => x !== null);
}

const clamp01 = (v: number) => Math.min(0.95, Math.max(0.05, v));
const clampScale = (v: number) => Math.min(1.9, Math.max(0.4, v));

export function MoodboardCanvas({
  boardId,
  itemIds,
  items,
  theme,
  positions,
  editing,
  selectedId,
  onSelect,
  onPosition,
  onLayer,
  onRemove,
  onComment,
}: MoodboardCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    itemId: string;
    pointerId: number;
    pos: MoodboardItemPosition;
    moved: boolean;
  } | null>(null);
  const [livePos, setLivePos] = useState<{
    id: string;
    pos: MoodboardItemPosition;
  } | null>(null);

  const canvasItems = useMemo(
    () => resolveCanvasItems(boardId, itemIds, items, positions),
    [boardId, itemIds, items, positions],
  );

  const selected = canvasItems.find((c) => c.listing.id === selectedId) ?? null;

  const transform = useCallback(
    (patch: Partial<MoodboardItemPosition>) => {
      if (!selected || !onPosition) return;
      onPosition(selected.listing.id, {
        ...selected.position,
        ...patch,
        scale: clampScale(patch.scale ?? selected.position.scale),
        rotation: patch.rotation ?? selected.position.rotation,
      });
    },
    [selected, onPosition],
  );

  const onPointerDown = (e: React.PointerEvent, itemId: string) => {
    if (!editing) return;
    const start = canvasItems.find((c) => c.listing.id === itemId)?.position;
    if (!start) return;
    drag.current = { itemId, pointerId: e.pointerId, pos: start, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelect?.(itemId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!d || !rect || e.pointerId !== d.pointerId) return;
    const nx = clamp01((e.clientX - rect.left) / rect.width);
    const ny = clamp01((e.clientY - rect.top) / rect.height);
    if (Math.abs(nx - d.pos.x) > 0.005 || Math.abs(ny - d.pos.y) > 0.005) {
      d.moved = true;
    }
    const next = { ...d.pos, x: nx, y: ny };
    d.pos = next;
    setLivePos({ id: d.itemId, pos: next });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (e.pointerId !== d.pointerId) return;
    setLivePos(null);
    if (d.moved) onPosition?.(d.itemId, d.pos);
  };

  // Keyboard access — arrow keys nudge a selected item; Delete removes.
  const onItemKeyDown = (e: React.KeyboardEvent, itemId: string) => {
    if (!editing) return;
    const step = e.shiftKey ? 0.05 : 0.015;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      onSelect?.(itemId);
      const pos =
        canvasItems.find((c) => c.listing.id === itemId)?.position ??
        canvasPositionFor(boardId, itemId, 0);
      onPosition?.(itemId, {
        ...pos,
        x: clamp01(pos.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0)),
        y: clamp01(pos.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0)),
      });
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && onRemove) {
      e.preventDefault();
      onRemove(itemId);
    }
  };

  return (
    <div>
      <div
        ref={canvasRef}
        aria-label={editing ? 'Moodboard canvas — drag items to arrange' : 'Moodboard canvas'}
        className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-xl"
        style={{ backgroundColor: theme.backgroundColor }}
        onPointerDown={(e) => {
          // Tap bare canvas clears selection.
          if (editing && e.target === e.currentTarget) onSelect?.(null);
        }}
      >
        {canvasItems.map(({ listing, position }) => {
          const pos = livePos?.id === listing.id ? livePos.pos : position;
          const isSelected = editing && selectedId === listing.id;
          const aspect = listing.mediaAspectRatio ?? 0.8;
          const body = (
            <AppImage
              src={listing.images[0]}
              alt={listing.title}
              aspectRatio={aspect}
              sizes="(max-width: 640px) 40vw, 300px"
              fallbackIcon="image"
            />
          );
          return (
            <div
              key={listing.id}
              className="absolute"
              style={{
                left: `${pos.x * 100}%`,
                top: `${pos.y * 100}%`,
                width: `${pos.scale * BASE_W * 100}%`,
                transform: `translate(-50%, -50%) rotate(${pos.rotation}deg)`,
                touchAction: editing ? 'none' : 'auto',
                zIndex: isSelected ? 50 : undefined,
              }}
            >
              {editing ? (
                <button
                  type="button"
                  aria-label={`Move ${listing.title}`}
                  aria-pressed={isSelected}
                  className={`block w-full cursor-grab overflow-hidden rounded-lg transition-shadow active:cursor-grabbing ${
                    isSelected
                      ? 'ring-2'
                      : 'hover:ring-1'
                  }`}
                  style={
                    isSelected
                      ? { ['--tw-ring-color' as string]: theme.accentColor }
                      : { ['--tw-ring-color' as string]: `${theme.fontColor}55` }
                  }
                  onPointerDown={(e) => onPointerDown(e, listing.id)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onKeyDown={(e) => onItemKeyDown(e, listing.id)}
                >
                  {body}
                </button>
              ) : (
                <Link
                  href={`/item/${listing.id}`}
                  aria-label={listing.title}
                  className="pressable block overflow-hidden rounded-lg"
                >
                  {body}
                </Link>
              )}
            </div>
          );
        })}
        {canvasItems.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p
              className="text-body font-medium"
              style={{ color: `${theme.fontColor}99` }}
            >
              An empty canvas — add items to start the collage.
            </p>
          </div>
        ) : null}
      </div>

      {/* Selected-item toolbar — one flat strip, mirrors the mobile
          floating editor controls (layer, rotate, scale, comment, remove). */}
      {editing && selected ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-1 rounded-lg bg-surface-alt px-2 py-1.5"
          role="toolbar"
          aria-label={`Editing ${selected.listing.title}`}
        >
          <span className="clamp-1 mr-2 max-w-[200px] text-meta font-medium text-text-secondary">
            {selected.listing.title}
          </span>
          <ToolButton
            icon="chevronUp"
            label="Bring to front"
            onClick={() => onLayer?.(selected.listing.id, 'front')}
          />
          <ToolButton
            icon="chevronDown"
            label="Send to back"
            onClick={() => onLayer?.(selected.listing.id, 'back')}
          />
          <ToolButton
            icon="refresh"
            label="Rotate 15°"
            onClick={() => transform({ rotation: selected.position.rotation + 15 })}
          />
          <ToolButton
            icon="plus"
            label="Scale up"
            onClick={() => transform({ scale: selected.position.scale * 1.15 })}
          />
          <ToolButton
            icon="remove"
            label="Scale down"
            onClick={() => transform({ scale: selected.position.scale / 1.15 })}
          />
          {onComment ? (
            <ToolButton
              icon="comment"
              label="Comment on item"
              onClick={() => onComment(selected.listing.id)}
            />
          ) : null}
          <ToolButton
            icon="trash"
            label="Remove from board"
            danger
            onClick={() => {
              onRemove?.(selected.listing.id);
              onSelect?.(null);
            }}
          />
          <span className="ml-auto hidden text-meta text-text-muted sm:block">
            Arrows nudge · Shift = bigger steps
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`pressable flex h-9 w-9 items-center justify-center rounded-md ${
        danger ? 'text-danger-text' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      <Icon name={icon} size={17} />
    </button>
  );
}
